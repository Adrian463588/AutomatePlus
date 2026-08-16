using AutomatePlus.Domain;

namespace AutomatePlus.Application;

public enum SessionLifecycleState { Draft, Recording, Ready, Generating, Running, Passed, Failed, Blocked, Cancelled }

public sealed class SessionValidator
{
    public IReadOnlyList<string> Validate(AutomationSession session)
    {
        var errors = new List<string>();
        if (session.Id == Guid.Empty) errors.Add("session.id must be a UUID");
        if (session.ProjectId == Guid.Empty) errors.Add("session.projectId must be a UUID");
        if (string.IsNullOrWhiteSpace(session.Name)) errors.Add("session.name is required");
        if (session.UpdatedAt < session.CreatedAt) errors.Add("session.updatedAt cannot precede createdAt");

        var ids = new HashSet<Guid>();
        for (var index = 0; index < session.Steps.Count; index++)
        {
            var step = session.Steps[index];
            if (step.StepNumber != index + 1) errors.Add($"steps[{index}].stepNumber must be {index + 1}");
            if (step.Platform != session.Platform) errors.Add($"steps[{index}].platform must match the session platform");
            if (!ids.Add(step.Id)) errors.Add($"steps[{index}].id is duplicated");
            for (var locatorIndex = 1; locatorIndex < step.Locators.Count; locatorIndex++)
            {
                if (step.Locators[locatorIndex].Score > step.Locators[locatorIndex - 1].Score)
                    errors.Add($"steps[{index}].locators must be ordered by descending score");
            }
        }
        return errors;
    }
}

public sealed class AutomationOrchestrator
{
    private readonly SessionValidator validator;
    private readonly ICodeGenerator generator;
    private readonly ITestRunner runner;
    private readonly IReportNormalizer reportNormalizer;
    private readonly IWorkspaceStore workspaceStore;

    public AutomationOrchestrator(
        SessionValidator validator,
        ICodeGenerator generator,
        ITestRunner runner,
        IReportNormalizer reportNormalizer,
        IWorkspaceStore workspaceStore)
    {
        this.validator = validator;
        this.generator = generator;
        this.runner = runner;
        this.reportNormalizer = reportNormalizer;
        this.workspaceStore = workspaceStore;
    }

    public async Task<GeneratedProject> GenerateAsync(AutomationSession session, CancellationToken cancellationToken)
    {
        var errors = validator.Validate(session);
        if (errors.Count > 0) throw new AutomationException(AutomationErrorCode.CapabilityError, string.Join("; ", errors));
        if (!generator.Supports(session)) throw new AutomationException(AutomationErrorCode.CapabilityError, "Selected generator does not support this session");
        await workspaceStore.SaveSessionAsync(session, cancellationToken);
        return await generator.GenerateAsync(session, cancellationToken);
    }

    public async IAsyncEnumerable<RunEvent> RunAsync(
        AutomationSession session,
        RunOptions options,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var errors = validator.Validate(session);
        if (errors.Count > 0)
        {
            yield return new RunEvent { RunId = Guid.NewGuid(), Type = "error", Message = string.Join("; ", errors) };
            yield break;
        }

        GeneratedProject project;
        try
        {
            project = await GenerateAsync(session, cancellationToken);
        }
        catch (AutomationException exception)
        {
            yield return new RunEvent { RunId = Guid.NewGuid(), Type = "blocked", Message = exception.Message, Data = new Dictionary<string, object?> { ["code"] = exception.Code.ToString() } };
            yield break;
        }

        var events = new List<RunEvent>();
        await foreach (var runEvent in runner.RunAsync(project, options, cancellationToken).WithCancellation(cancellationToken))
        {
            events.Add(runEvent);
            yield return runEvent;
        }

        var runId = events.FirstOrDefault()?.RunId ?? Guid.NewGuid();
        var summary = await reportNormalizer.NormalizeAsync(runId, session.Id, events, cancellationToken);
        await workspaceStore.SaveRunAsync(summary, cancellationToken);
    }
}
