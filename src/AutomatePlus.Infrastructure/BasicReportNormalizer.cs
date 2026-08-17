using AutomatePlus.Domain;

namespace AutomatePlus.Infrastructure;

public sealed class BasicReportNormalizer : IReportNormalizer
{
    public Task<RunSummary> NormalizeAsync(Guid runId, Guid sessionId, IReadOnlyList<RunEvent> events, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var failures = events.Count(item => item.Type is "error" or "step_fail");
        var blocked = events.Any(item => item.Type == "blocked");
        var passed = events.Count(item => item.Type == "step_pass");
        var status = events.Count == 0
            ? RunStatus.Blocked
            : blocked ? RunStatus.Blocked : failures > 0 ? RunStatus.Failed : passed > 0 ? RunStatus.Passed : RunStatus.Blocked;
        return Task.FromResult(new RunSummary
        {
            RunId = runId,
            SessionId = sessionId,
            Status = status,
            PassedSteps = passed,
            FailedSteps = failures,
            TotalSteps = passed + failures,
            Duration = TimeSpan.Zero,
            Error = events.Count == 0
                ? "No execution evidence was emitted."
                : events.LastOrDefault(item => item.Type is "error" or "blocked")?.Message
        });
    }
}
