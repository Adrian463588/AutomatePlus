using AutomatePlus.Domain;

namespace AutomatePlus.Application;

public sealed class TestRunnerDeviceWorker : IDeviceRunWorker
{
    private readonly ITestRunner runner;

    public TestRunnerDeviceWorker(ITestRunner runner)
    {
        this.runner = runner;
    }

    public async Task<DeviceRunResult> RunAsync(DeviceWorkerContext context, CancellationToken cancellationToken)
    {
        var startedAt = DateTimeOffset.UtcNow;
        var iterations = new List<DeviceIteration>();
        var observations = new List<DeviceObservation>();

        foreach (var iterationNumber in context.IterationNumbers)
        {
            var iterationId = Guid.NewGuid();
            var iterationStarted = DateTimeOffset.UtcNow;
            var events = new List<RunEvent>();
            try
            {
                var options = new RunOptions
                {
                    ExecutionMode = "native",
                    Iterations = 1,
                    Workers = 1,
                    Timeout = context.Specification.IterationTimeout,
                    DeviceId = context.Device.Id,
                    AdbSerial = context.AdbSerialSnapshot,
                    EnvironmentVariables = BuildEnvironment(context, iterationNumber),
                    DeviceRuntimeContext = BuildEnvironment(context, iterationNumber)
                };

                await foreach (var runEvent in runner.RunAsync(context.Project, options, cancellationToken).WithCancellation(cancellationToken))
                    events.Add(runEvent);

                var status = Classify(events);
                iterations.Add(CreateIteration(context, iterationId, iterationNumber, status, iterationStarted, events));
                if (status is RunStatus.Blocked or RunStatus.Cancelled)
                    break;

                if (context.Specification.IterationDelay > TimeSpan.Zero && iterationNumber != context.IterationNumbers[^1])
                    await Task.Delay(context.Specification.IterationDelay, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                iterations.Add(CreateIteration(context, iterationId, iterationNumber, RunStatus.Cancelled, iterationStarted, events, "Device iteration cancelled"));
                break;
            }
            catch (AutomationException exception)
            {
                var status = exception.Code is AutomationErrorCode.DeviceUnavailable
                    or AutomationErrorCode.RuntimeMissing
                    or AutomationErrorCode.ProjectPrerequisiteMissing
                    or AutomationErrorCode.PortUnavailable
                    ? RunStatus.Blocked
                    : RunStatus.Failed;
                iterations.Add(CreateIteration(context, iterationId, iterationNumber, status, iterationStarted, events, exception.Message));
                if (status == RunStatus.Blocked)
                    break;
            }
            catch (Exception exception)
            {
                iterations.Add(CreateIteration(context, iterationId, iterationNumber, RunStatus.Failed, iterationStarted, events, exception.Message));
            }
        }

        var terminalStatus = AggregateStatus(iterations, context.IterationNumbers.Count);
        var missingIterations = context.IterationNumbers.Skip(iterations.Count).ToArray();
        if (missingIterations.Length > 0 && terminalStatus == RunStatus.Cancelled)
        {
            iterations.AddRange(missingIterations.Select(number => CreateIteration(context, Guid.NewGuid(), number, RunStatus.Cancelled, DateTimeOffset.UtcNow, [], "Device worker stopped before iteration started")));
        }
        else if (missingIterations.Length > 0 && terminalStatus == RunStatus.Blocked)
        {
            iterations.AddRange(missingIterations.Select(number => CreateIteration(context, Guid.NewGuid(), number, RunStatus.Blocked, DateTimeOffset.UtcNow, [], "Device worker stopped before iteration started")));
        }

        var finishedAt = DateTimeOffset.UtcNow;
        var run = new DeviceRun
        {
            Id = context.DeviceRunId,
            FarmRunId = context.FarmRunId,
            DeviceId = context.Device.Id,
            AdbSerialSnapshot = context.AdbSerialSnapshot,
            Status = terminalStatus,
            PlannedIterations = context.IterationNumbers.Count,
            StartedIterations = iterations.Count(item => item.Status is RunStatus.Passed or RunStatus.Failed),
            PassedIterations = iterations.Count(item => item.Status == RunStatus.Passed),
            FailedIterations = iterations.Count(item => item.Status == RunStatus.Failed),
            BlockedIterations = iterations.Count(item => item.Status == RunStatus.Blocked),
            CancelledIterations = iterations.Count(item => item.Status == RunStatus.Cancelled),
            Iterations = iterations,
            Error = iterations.LastOrDefault(item => item.Error is not null)?.Error,
            StartedAt = startedAt,
            FinishedAt = finishedAt
        };

        return new DeviceRunResult { Run = run, Observations = observations };
    }

    private static IReadOnlyDictionary<string, string> BuildEnvironment(DeviceWorkerContext context, int iterationNumber)
    {
        var environment = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["AUTOMATEPLUS_DEVICE_ID"] = context.Device.Id.ToString("D"),
            ["AUTOMATEPLUS_DEVICE_UDID"] = context.AdbSerialSnapshot,
            ["AUTOMATEPLUS_ADB_SERIAL"] = context.AdbSerialSnapshot,
            ["AUTOMATEPLUS_ITERATION"] = iterationNumber.ToString(System.Globalization.CultureInfo.InvariantCulture)
        };
        if (context.Project.Manifest.Framework.Contains("appium", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(context.AppiumServerUrl)
                || !Uri.TryCreate(context.AppiumServerUrl, UriKind.Absolute, out var appiumUri)
                || appiumUri.Port is < 1 or > 65535
                || appiumUri.Scheme is not ("http" or "https"))
                throw new AutomationException(AutomationErrorCode.RuntimeMissing, "Appium runtime context is missing AUTOMATEPLUS_APPIUM_URL.");
            environment["AUTOMATEPLUS_APPIUM_URL"] = context.AppiumServerUrl;
        }
        AddPort(environment, "AUTOMATEPLUS_SYSTEM_PORT", context.Ports, PortKind.System);
        AddPort(environment, "AUTOMATEPLUS_MJPEG_SERVER_PORT", context.Ports, PortKind.MjpegServer);
        AddPort(environment, "AUTOMATEPLUS_CHROMEDRIVER_PORT", context.Ports, PortKind.Chromedriver);
        AddPort(environment, "AUTOMATEPLUS_LOCAL_FORWARD_PORT", context.Ports, PortKind.LocalForward);
        return environment;
    }

    private static void AddPort(IDictionary<string, string> environment, string key, IReadOnlyDictionary<PortKind, int> ports, PortKind kind)
    {
        if (ports.TryGetValue(kind, out var port))
            environment[key] = port.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    private static RunStatus Classify(IReadOnlyList<RunEvent> events)
    {
        if (events.Count == 0) return RunStatus.Blocked;
        if (events.Any(item => item.Type.Equals("blocked", StringComparison.OrdinalIgnoreCase))) return RunStatus.Blocked;
        if (events.Any(item => item.Type is "error" or "step_fail" or "failed" or "fail")) return RunStatus.Failed;
        return events.Any(IsExplicitSuccess) ? RunStatus.Passed : RunStatus.Blocked;
    }

    private static bool IsExplicitSuccess(RunEvent runEvent)
    {
        return runEvent.Type.Equals("step_pass", StringComparison.OrdinalIgnoreCase)
            || runEvent.Type.Equals("pass", StringComparison.OrdinalIgnoreCase)
            || runEvent.Type.Equals("passed", StringComparison.OrdinalIgnoreCase)
            || runEvent.Type.Equals("complete", StringComparison.OrdinalIgnoreCase)
            || runEvent.Type.Equals("completed", StringComparison.OrdinalIgnoreCase)
            || runEvent.Type.Equals("success", StringComparison.OrdinalIgnoreCase)
            || runEvent.Type.Equals("run_complete", StringComparison.OrdinalIgnoreCase);
    }

    private static RunStatus AggregateStatus(IReadOnlyList<DeviceIteration> iterations, int planned)
    {
        if (iterations.Any(item => item.Status == RunStatus.Cancelled)) return RunStatus.Cancelled;
        if (iterations.Any(item => item.Status == RunStatus.Failed)) return RunStatus.Failed;
        if (iterations.Count == planned && iterations.All(item => item.Status == RunStatus.Passed)) return RunStatus.Passed;
        return RunStatus.Blocked;
    }

    private static DeviceIteration CreateIteration(
        DeviceWorkerContext context,
        Guid iterationId,
        int iterationNumber,
        RunStatus status,
        DateTimeOffset startedAt,
        IReadOnlyList<RunEvent> events,
        string? error = null)
    {
        var failedSteps = events.Count(item => item.Type is "error" or "step_fail" or "failed" or "fail");
        var passedSteps = events.Count(item => item.Type.Equals("step_pass", StringComparison.OrdinalIgnoreCase));
        return new DeviceIteration
        {
            Id = iterationId,
            DeviceRunId = context.DeviceRunId,
            IterationNumber = iterationNumber,
            Status = status,
            PassedSteps = passedSteps,
            FailedSteps = failedSteps,
            TotalSteps = passedSteps + failedSteps,
            StartedAt = startedAt,
            FinishedAt = DateTimeOffset.UtcNow,
            Error = error ?? events.LastOrDefault(item => item.Type is "error" or "blocked" or "step_fail")?.Message
        };
    }
}
