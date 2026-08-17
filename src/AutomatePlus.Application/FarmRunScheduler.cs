using AutomatePlus.Domain;

namespace AutomatePlus.Application;

public sealed class FarmRunScheduler : IFarmRunScheduler
{
    private sealed record DeviceAssignment(DeviceProfile Device, IReadOnlyList<int> IterationNumbers);

    private readonly IDeviceRegistry deviceRegistry;
    private readonly IDevicePreflight devicePreflight;
    private readonly IDeviceLeaseManager leaseManager;
    private readonly IPortLeaseManager portLeaseManager;
    private readonly IDeviceRunWorker deviceWorker;
    private readonly IFarmWorkspaceStore workspaceStore;
    private readonly FarmRunSpecValidator validator;
    private readonly TimeProvider timeProvider;
    private readonly string owner;
    private readonly string? appiumServerUrl;

    public FarmRunScheduler(
        IDeviceRegistry deviceRegistry,
        IDevicePreflight devicePreflight,
        IDeviceLeaseManager leaseManager,
        IPortLeaseManager portLeaseManager,
        IDeviceRunWorker deviceWorker,
        IFarmWorkspaceStore workspaceStore,
        FarmRunSpecValidator? validator = null,
        TimeProvider? timeProvider = null,
        string? owner = null,
        string? appiumServerUrl = null)
    {
        this.deviceRegistry = deviceRegistry;
        this.devicePreflight = devicePreflight;
        this.leaseManager = leaseManager;
        this.portLeaseManager = portLeaseManager;
        this.deviceWorker = deviceWorker;
        this.workspaceStore = workspaceStore;
        this.validator = validator ?? new FarmRunSpecValidator();
        this.timeProvider = timeProvider ?? TimeProvider.System;
        this.owner = string.IsNullOrWhiteSpace(owner) ? $"farm-{Environment.ProcessId}" : owner;
        this.appiumServerUrl = appiumServerUrl;
    }

    public async Task<FarmRunReport> RunAsync(FarmRunRequest request, CancellationToken cancellationToken)
    {
        var validationErrors = validator.Validate(request);
        if (validationErrors.Count > 0)
            throw new AutomationException(AutomationErrorCode.InvalidFarmSpec, string.Join("; ", validationErrors));

        var farmRunId = Guid.NewGuid();
        var startedAt = timeProvider.GetUtcNow();
        IReadOnlyList<DeviceProfile> devices;

        try
        {
            devices = await deviceRegistry.ResolveAsync(request.Specification, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return await SaveTerminalReportAsync(CreateEmptyReport(farmRunId, request.Specification, startedAt, RunStatus.Cancelled, "Farm run cancelled before device resolution"));
        }
        catch (AutomationException exception)
        {
            return await SaveTerminalReportAsync(CreateEmptyReport(farmRunId, request.Specification, startedAt, RunStatus.Blocked, exception.Message));
        }

        if (devices.Count == 0)
            return await SaveTerminalReportAsync(CreateEmptyReport(farmRunId, request.Specification, startedAt, RunStatus.Blocked, "No selected Android devices are available"));

        if (request.Specification.Strategy == DeviceExecutionStrategy.Single && devices.Count != 1)
            return await SaveTerminalReportAsync(CreateEmptyReport(farmRunId, request.Specification, startedAt, RunStatus.Blocked, "single strategy requires exactly one resolved device"));

        var assignments = BuildAssignments(request.Specification, devices);
        if (assignments.Count == 0)
            return await SaveTerminalReportAsync(CreateEmptyReport(farmRunId, request.Specification, startedAt, RunStatus.Blocked, "No iterations were assigned to the selected devices"));

        var queuedReport = CreateQueuedReport(farmRunId, request.Specification, assignments, startedAt);
        await workspaceStore.SaveFarmRunAsync(queuedReport, CancellationToken.None);

        using var schedulingCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        using var parallelism = new SemaphoreSlim(Math.Min(request.Specification.MaxParallelDevices, assignments.Count));
        var tasks = assignments
            .Select(assignment => RunDeviceSafelyAsync(farmRunId, request, assignment, parallelism, schedulingCancellation, cancellationToken))
            .ToArray();

        var results = await Task.WhenAll(tasks);
        var report = Aggregate(farmRunId, request.Specification, results, assignments.Sum(item => item.IterationNumbers.Count), startedAt, cancellationToken.IsCancellationRequested);
        return await SaveTerminalReportAsync(report);
    }

    private async Task<DeviceRunResult> RunDeviceSafelyAsync(
        Guid farmRunId,
        FarmRunRequest request,
        DeviceAssignment assignment,
        SemaphoreSlim parallelism,
        CancellationTokenSource schedulingCancellation,
        CancellationToken executionCancellationToken)
    {
        try
        {
            await parallelism.WaitAsync(schedulingCancellation.Token);
        }
        catch (OperationCanceledException) when (schedulingCancellation.IsCancellationRequested)
        {
            var status = executionCancellationToken.IsCancellationRequested ? RunStatus.Cancelled : RunStatus.Blocked;
            var reason = status == RunStatus.Cancelled
                ? "Device run cancelled before worker started"
                : "Device run was not started because fail-fast stopped new work";
            return CreatePreExecutionResult(farmRunId, assignment.Device.Id, assignment.IterationNumbers, status, reason, assignment.Device.AdbSerial);
        }
        try
        {
            var result = await RunDeviceAsync(farmRunId, request, assignment, executionCancellationToken);
            if (request.Specification.FailurePolicy == FarmFailurePolicy.FailFast && result.Run.Status == RunStatus.Failed)
                schedulingCancellation.Cancel();
            return result;
        }
        finally
        {
            parallelism.Release();
        }
    }

    private async Task<DeviceRunResult> RunDeviceAsync(
        Guid farmRunId,
        FarmRunRequest request,
        DeviceAssignment assignment,
        CancellationToken cancellationToken)
    {
        var device = assignment.Device;
        var deviceId = device.Id;
        var iterationNumbers = assignment.IterationNumbers;

        var deviceRunId = Guid.NewGuid();
        DeviceLease? deviceLease = null;
        PortLease? portLease = null;
        DeviceRunResult? result = null;
        var cleanupErrors = new List<string>();

        try
        {
            deviceLease = await leaseManager.AcquireAsync(farmRunId, device, owner, cancellationToken);
            await PersistLeaseAsync(deviceLease);
            deviceLease = await leaseManager.TransitionAsync(deviceLease, DeviceLeaseState.Preparing, cancellationToken);
            await PersistLeaseAsync(deviceLease);

            var preflight = await devicePreflight.CheckAsync(device, request.Specification, cancellationToken);
            if (!preflight.Ready)
            {
                result = CreatePreExecutionResult(farmRunId, deviceId, iterationNumbers, RunStatus.Blocked, string.Join("; ", preflight.Issues), preflight.Device.AdbSerial);
            }
            else
            {
                if (!string.Equals(preflight.Device.AdbSerial, device.AdbSerial, StringComparison.Ordinal))
                    throw new AutomationException(AutomationErrorCode.DeviceUnavailable, "ADB serial changed after device snapshot; execution was blocked");

                portLease = await portLeaseManager.AcquireAsync(farmRunId, deviceId, request.Specification.Ports, cancellationToken);
                await PersistPortLeaseAsync(portLease);
                deviceLease = await leaseManager.TransitionAsync(deviceLease, DeviceLeaseState.Running, cancellationToken);
                await PersistLeaseAsync(deviceLease);

                result = await deviceWorker.RunAsync(new DeviceWorkerContext
                {
                    FarmRunId = farmRunId,
                    DeviceRunId = deviceRunId,
                    Device = device,
                    AdbSerialSnapshot = device.AdbSerial,
                    IterationNumbers = iterationNumbers,
                    Ports = portLease.Ports,
                    Session = request.Session,
                    Project = request.Project,
                    Specification = request.Specification,
                    AppiumServerUrl = appiumServerUrl
                }, cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            result = CreatePreExecutionResult(farmRunId, deviceId, iterationNumbers, RunStatus.Cancelled, "Device run cancelled");
        }
        catch (AutomationException exception)
        {
            var status = exception.Code is AutomationErrorCode.DeviceUnavailable
                or AutomationErrorCode.DeviceBusy
                or AutomationErrorCode.RuntimeMissing
                or AutomationErrorCode.PortUnavailable
                or AutomationErrorCode.ProjectPrerequisiteMissing
                ? RunStatus.Blocked
                : RunStatus.Failed;
            result = CreatePreExecutionResult(farmRunId, deviceId, iterationNumbers, status, exception.Message, device?.AdbSerial);
        }
        catch (Exception exception)
        {
            result = CreatePreExecutionResult(farmRunId, deviceId, iterationNumbers, RunStatus.Failed, exception.Message, device?.AdbSerial);
        }
        finally
        {
            if (deviceLease is not null)
            {
                try
                {
                    deviceLease = await leaseManager.TransitionAsync(deviceLease, DeviceLeaseState.Cleaning, CancellationToken.None);
                    await PersistLeaseAsync(deviceLease);
                }
                catch (Exception exception)
                {
                    cleanupErrors.Add($"device lease cleanup: {exception.Message}");
                }
            }

            if (portLease is not null)
            {
                try
                {
                    portLease = await portLeaseManager.ReleaseAsync(portLease, CancellationToken.None);
                    await PersistPortLeaseAsync(portLease);
                }
                catch (Exception exception)
                {
                    cleanupErrors.Add($"port cleanup: {exception.Message}");
                }
            }

            if (deviceLease is not null)
            {
                try
                {
                    deviceLease = await leaseManager.ReleaseAsync(deviceLease, "device run finished", CancellationToken.None);
                    await PersistLeaseAsync(deviceLease);
                }
                catch (Exception exception)
                {
                    cleanupErrors.Add($"device lease release: {exception.Message}");
                }
            }
        }

        if (result is null)
            result = CreatePreExecutionResult(farmRunId, deviceId, iterationNumbers, RunStatus.Failed, "Device worker returned no result", device?.AdbSerial);
        if (cleanupErrors.Count > 0)
            result = MarkCleanupFailure(result, string.Join("; ", cleanupErrors));

        return result;
    }

    private async Task PersistLeaseAsync(DeviceLease lease)
    {
        await workspaceStore.SaveDeviceLeaseAsync(lease, CancellationToken.None);
    }

    private async Task PersistPortLeaseAsync(PortLease lease)
    {
        await workspaceStore.SavePortLeaseAsync(lease, CancellationToken.None);
    }

    private async Task<FarmRunReport> SaveTerminalReportAsync(FarmRunReport report)
    {
        await workspaceStore.SaveFarmRunAsync(report, CancellationToken.None);
        return report;
    }

    private static IReadOnlyList<DeviceAssignment> BuildAssignments(FarmRunSpec specification, IReadOnlyList<DeviceProfile> devices)
    {
        if (specification.Strategy is DeviceExecutionStrategy.Single or DeviceExecutionStrategy.AllDevices)
        {
            return devices
                .Select(device => new DeviceAssignment(device, Enumerable.Range(1, specification.RequestedIterations).ToArray()))
                .ToArray();
        }

        var buckets = devices.ToDictionary(device => device.Id, _ => new List<int>());
        for (var index = 0; index < specification.RequestedIterations; index++)
            buckets[devices[index % devices.Count].Id].Add(index + 1);
        return devices
            .Where(device => buckets[device.Id].Count > 0)
            .Select(device => new DeviceAssignment(device, buckets[device.Id]))
            .ToArray();
    }

    private static FarmRunReport CreateQueuedReport(
        Guid farmRunId,
        FarmRunSpec specification,
        IReadOnlyList<DeviceAssignment> assignments,
        DateTimeOffset startedAt)
    {
        var deviceRuns = assignments.Select(item => new DeviceRun
        {
            Id = Guid.NewGuid(),
            FarmRunId = farmRunId,
            DeviceId = item.Device.Id,
            AdbSerialSnapshot = item.Device.AdbSerial,
            Status = RunStatus.Queued,
            PlannedIterations = item.IterationNumbers.Count,
            StartedAt = startedAt
        }).ToArray();
        return new FarmRunReport
        {
            FarmRunId = farmRunId,
            SessionId = specification.SessionId,
            Strategy = specification.Strategy,
            Status = RunStatus.Queued,
            Completion = FarmCompletion.Partial,
            PlannedIterations = assignments.Sum(item => item.IterationNumbers.Count),
            DeviceRuns = deviceRuns,
            StartedAt = startedAt
        };
    }

    private FarmRunReport Aggregate(
        Guid farmRunId,
        FarmRunSpec specification,
        IReadOnlyList<DeviceRunResult> results,
        int plannedIterations,
        DateTimeOffset startedAt,
        bool externallyCancelled)
    {
        var deviceRuns = results.Select(item => item.Run).ToArray();
        var iterations = deviceRuns.SelectMany(item => item.Iterations).ToArray();
        var passed = iterations.Count(item => item.Status == RunStatus.Passed);
        var failed = iterations.Count(item => item.Status == RunStatus.Failed);
        var blocked = iterations.Count(item => item.Status == RunStatus.Blocked);
        var cancelled = iterations.Count(item => item.Status == RunStatus.Cancelled);
        var started = iterations.Count(item => item.Status is RunStatus.Passed or RunStatus.Failed);
        var hasFailedDeviceRun = deviceRuns.Any(item => item.Status == RunStatus.Failed);
        var status = externallyCancelled || cancelled > 0
            ? RunStatus.Cancelled
            : failed > 0 || hasFailedDeviceRun
                ? RunStatus.Failed
                : passed == plannedIterations && blocked == 0
                    ? RunStatus.Passed
                    : RunStatus.Blocked;
        var completed = passed + failed + blocked + cancelled >= plannedIterations;
        var errors = deviceRuns.Select(item => item.Error).Where(item => !string.IsNullOrWhiteSpace(item)).ToArray();
        return new FarmRunReport
        {
            FarmRunId = farmRunId,
            SessionId = specification.SessionId,
            Strategy = specification.Strategy,
            Status = status,
            Completion = completed ? FarmCompletion.Complete : FarmCompletion.Partial,
            PlannedIterations = plannedIterations,
            StartedIterations = started,
            PassedIterations = passed,
            FailedIterations = failed,
            BlockedIterations = blocked,
            CancelledIterations = cancelled,
            DeviceRuns = deviceRuns,
            Observations = results.SelectMany(item => item.Observations).ToArray(),
            Artifacts = results.SelectMany(item => item.Artifacts).ToArray(),
            StartedAt = startedAt,
            FinishedAt = timeProvider.GetUtcNow(),
            Duration = timeProvider.GetUtcNow() - startedAt,
            Error = errors.Length == 0 ? null : string.Join("; ", errors)
        };
    }

    private static FarmRunReport CreateEmptyReport(Guid farmRunId, FarmRunSpec specification, DateTimeOffset startedAt, RunStatus status, string error)
    {
        return new FarmRunReport
        {
            FarmRunId = farmRunId,
            SessionId = specification.SessionId,
            Strategy = specification.Strategy,
            Status = status,
            Completion = FarmCompletion.Partial,
            StartedAt = startedAt,
            FinishedAt = DateTimeOffset.UtcNow,
            Error = error
        };
    }

    private static DeviceRunResult CreatePreExecutionResult(Guid farmRunId, Guid deviceId, IReadOnlyList<int> iterations, RunStatus status, string error, string? serialSnapshot = null)
    {
        var now = DateTimeOffset.UtcNow;
        var deviceRunId = Guid.NewGuid();
        var deviceIterations = iterations.Select(number => new DeviceIteration
        {
            Id = Guid.NewGuid(),
            DeviceRunId = deviceRunId,
            IterationNumber = number,
            Status = status,
            StartedAt = now,
            FinishedAt = now,
            Error = error
        }).ToArray();
        return new DeviceRunResult
        {
            Run = new DeviceRun
            {
                Id = deviceRunId,
                FarmRunId = farmRunId,
                DeviceId = deviceId,
                AdbSerialSnapshot = string.IsNullOrWhiteSpace(serialSnapshot) ? "unresolved" : serialSnapshot,
                Status = status,
                PlannedIterations = iterations.Count,
                StartedIterations = 0,
                PassedIterations = status == RunStatus.Passed ? iterations.Count : 0,
                FailedIterations = status == RunStatus.Failed ? iterations.Count : 0,
                BlockedIterations = status == RunStatus.Blocked ? iterations.Count : 0,
                CancelledIterations = status == RunStatus.Cancelled ? iterations.Count : 0,
                Iterations = deviceIterations,
                Error = error,
                StartedAt = now,
                FinishedAt = now
            }
        };
    }

    private static DeviceRunResult MarkCleanupFailure(DeviceRunResult result, string error)
    {
        var run = result.Run with
        {
            Status = RunStatus.Failed,
            Error = string.IsNullOrWhiteSpace(result.Run.Error) ? error : $"{result.Run.Error}; {error}"
        };
        return result with { Run = run };
    }
}
