using AutomatePlus.Application;
using AutomatePlus.Domain;

namespace AutomatePlus.Tests;

public sealed class SessionValidatorTests
{
    [Fact]
    public void RejectsNonContiguousStepsAndPlatformMismatch()
    {
        var session = new AutomationSession
        {
            Id = Guid.NewGuid(),
            ProjectId = Guid.NewGuid(),
            Name = "validation",
            Platform = AutomationPlatform.Web,
            Steps =
            [
                new ActionIr { Id = Guid.NewGuid(), StepNumber = 2, Platform = AutomationPlatform.Android, Action = "tap" }
            ]
        };

        var errors = new SessionValidator().Validate(session);

        Assert.Contains(errors, error => error.Contains("stepNumber", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.Contains("platform", StringComparison.Ordinal));
    }
}
