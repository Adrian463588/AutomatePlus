namespace AutomatePlus.Domain;

public sealed record RecorderOptions(AutomationPlatform Platform, string? Target, string? DeviceId = null);

public interface IRecorder
{
    AutomationPlatform Platform { get; }
    IAsyncEnumerable<ActionIr> RecordAsync(RecorderOptions options, CancellationToken cancellationToken);
}

public interface ICodeGenerator
{
    CapabilityManifest Manifest { get; }
    bool Supports(AutomationSession session);
    Task<GeneratedProject> GenerateAsync(AutomationSession session, CancellationToken cancellationToken);
}

public interface ITestRunner
{
    IAsyncEnumerable<RunEvent> RunAsync(GeneratedProject project, RunOptions options, CancellationToken cancellationToken);
    Task StopAsync(CancellationToken cancellationToken);
}

public interface IToolchainResolver
{
    Task<ToolchainResolution> ResolveAsync(CapabilityManifest manifest, CancellationToken cancellationToken);
}

public sealed record ToolchainResolution(bool Available, string? ExecutablePath, IReadOnlyList<string> Missing, string? LicensePath);

public interface IReportNormalizer
{
    Task<RunSummary> NormalizeAsync(Guid runId, Guid sessionId, IReadOnlyList<RunEvent> events, CancellationToken cancellationToken);
}

public interface IWorkspaceStore
{
    Task SaveSessionAsync(AutomationSession session, CancellationToken cancellationToken);
    Task<AutomationSession?> GetSessionAsync(Guid id, CancellationToken cancellationToken);
    Task SaveRunAsync(RunSummary summary, CancellationToken cancellationToken);
}
