using System.Text.Json;

namespace AutomatePlus.Domain;

public enum AutomationPlatform { Web, Android, Api }

public enum RunStatus { Queued, Running, Passed, Failed, Blocked, Cancelled, Stopped }

public enum AutomationErrorCode
{
    CapabilityError,
    RuntimeMissing,
    DeviceUnavailable,
    ProjectPrerequisiteMissing,
    PathDenied,
    ProcessTimeout,
    Cancelled,
    ProtocolError
}

public sealed class AutomationException : Exception
{
    public AutomationException(AutomationErrorCode code, string message, IReadOnlyDictionary<string, object?>? details = null, Exception? inner = null)
        : base(message, inner)
    {
        Code = code;
        Details = details ?? new Dictionary<string, object?>();
    }

    public AutomationErrorCode Code { get; }
    public IReadOnlyDictionary<string, object?> Details { get; }
}

public sealed record LocatorCandidate(
    string Strategy,
    string Value,
    string? Role = null,
    string? Name = null,
    double Score = 50);

public sealed record SecretReference(string Key);

public sealed record ActionIr
{
    public required Guid Id { get; init; }
    public int SchemaVersion { get; init; } = 2;
    public required int StepNumber { get; init; }
    public required AutomationPlatform Platform { get; init; }
    public required string Action { get; init; }
    public string? Description { get; init; }
    public IReadOnlyList<LocatorCandidate> Locators { get; init; } = [];
    public JsonElement? Value { get; init; }
    public string? AttributeName { get; init; }
    public JsonElement? ExpectedValue { get; init; }
    public JsonElement? Payload { get; init; }
    public IReadOnlyDictionary<string, object?> Metadata { get; init; } = new Dictionary<string, object?>();
    public int TimeoutMs { get; init; } = 5000;
    public bool Optional { get; init; }
}

public sealed record AutomationSession
{
    public required Guid Id { get; init; }
    public int SchemaVersion { get; init; } = 2;
    public required Guid ProjectId { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public required AutomationPlatform Platform { get; init; }
    public IReadOnlyDictionary<string, object?> TargetConfig { get; init; } = new Dictionary<string, object?>();
    public IReadOnlyDictionary<string, JsonElement> EnvironmentVariables { get; init; } = new Dictionary<string, JsonElement>();
    public IReadOnlyList<ActionIr> Steps { get; init; } = [];
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
}

public sealed record CapabilityManifest
{
    public required string Id { get; init; }
    public required AutomationPlatform Platform { get; init; }
    public required string Framework { get; init; }
    public required string Language { get; init; }
    public required string OutputFormat { get; init; }
    public required IReadOnlyList<string> SupportedActions { get; init; }
    public required IReadOnlyList<string> SupportedAssertions { get; init; }
    public required IReadOnlyList<string> RequiredRuntimes { get; init; }
    public string? ProjectPrerequisite { get; init; }
    public required string RunnerCommandId { get; init; }
    public required string Version { get; init; }
}

public sealed record GeneratedFile(string RelativePath, string Content, string Language, string Sha256);

public sealed record GeneratedProject
{
    public required string Framework { get; init; }
    public required string Language { get; init; }
    public required string Entrypoint { get; init; }
    public required CapabilityManifest Manifest { get; init; }
    public required IReadOnlyList<GeneratedFile> Files { get; init; }
}

public sealed record RunOptions
{
    public required string ExecutionMode { get; init; }
    public int Iterations { get; init; } = 1;
    public int Workers { get; init; } = 1;
    public int? TargetRps { get; init; }
    public TimeSpan Timeout { get; init; } = TimeSpan.FromMinutes(2);
    public bool Headless { get; init; } = true;
    public IReadOnlyDictionary<string, string> EnvironmentVariables { get; init; } = new Dictionary<string, string>();
}

public sealed record RunEvent
{
    public required Guid RunId { get; init; }
    public long Sequence { get; init; }
    public required string Type { get; init; }
    public string? StepId { get; init; }
    public required string Message { get; init; }
    public IReadOnlyDictionary<string, object?> Data { get; init; } = new Dictionary<string, object?>();
    public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;
}

public sealed record RunSummary
{
    public required Guid RunId { get; init; }
    public required Guid SessionId { get; init; }
    public required RunStatus Status { get; init; }
    public int PassedSteps { get; init; }
    public int FailedSteps { get; init; }
    public int TotalSteps { get; init; }
    public TimeSpan Duration { get; init; }
    public string? Error { get; init; }
}
