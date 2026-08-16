using AutomatePlus.Domain;

namespace AutomatePlus.Infrastructure;

public sealed class BasicReportNormalizer : IReportNormalizer
{
    public Task<RunSummary> NormalizeAsync(Guid runId, Guid sessionId, IReadOnlyList<RunEvent> events, CancellationToken cancellationToken)
    {
        var failures = events.Count(item => item.Type is "error" or "step_fail");
        var blocked = events.Any(item => item.Type == "blocked");
        var passed = events.Count(item => item.Type == "step_pass");
        var status = blocked ? RunStatus.Blocked : failures > 0 ? RunStatus.Failed : RunStatus.Passed;
        return Task.FromResult(new RunSummary
        {
            RunId = runId,
            SessionId = sessionId,
            Status = status,
            PassedSteps = passed,
            FailedSteps = failures,
            TotalSteps = passed + failures,
            Duration = TimeSpan.Zero,
            Error = events.LastOrDefault(item => item.Type is "error" or "blocked")?.Message
        });
    }
}
