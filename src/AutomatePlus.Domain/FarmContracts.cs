namespace AutomatePlus.Domain;

public enum DeviceExecutionStrategy
{
    Single,
    AllDevices,
    SplitIterations
}

public enum FarmFailurePolicy
{
    ContinueOtherDevices,
    FailFast
}

public enum DeviceAuthorizationState
{
    Unknown,
    Authorized,
    Unauthorized,
    Offline
}

public enum DeviceHealthState
{
    Unknown,
    Ready,
    Blocked,
    Failed,
    Disconnected,
    Quarantined
}

public enum DeviceLeaseState
{
    Reserved,
    Preparing,
    Running,
    Cleaning,
    Released,
    Failed,
    Disconnected
}

public enum PortKind
{
    System,
    MjpegServer,
    Chromedriver,
    LocalForward
}

public enum PortLeaseState
{
    Active,
    Released
}

public enum DeviceObservationStatus
{
    Matched,
    FallbackUsed,
    SemanticSelectorMissing,
    DeviceVariantMismatch,
    NeedsReview,
    Blocked,
    Failed
}

public enum FarmCompletion
{
    Complete,
    Partial
}

public sealed record DeviceProfile
{
    public required Guid Id { get; init; }
    public required string AdbSerial { get; init; }
    public string Model { get; init; } = "unknown";
    public string Manufacturer { get; init; } = "unknown";
    public string Product { get; init; } = "unknown";
    public string AndroidVersion { get; init; } = "unknown";
    public int SdkVersion { get; init; }
    public bool IsEmulator { get; init; }
    public int ResolutionWidth { get; init; }
    public int ResolutionHeight { get; init; }
    public int Density { get; init; }
    public string Orientation { get; init; } = "unknown";
    public string Transport { get; init; } = "unknown";
    public DeviceAuthorizationState Authorization { get; init; } = DeviceAuthorizationState.Unknown;
    public DeviceHealthState HealthState { get; init; } = DeviceHealthState.Unknown;
    public DateTimeOffset LastSeen { get; init; } = DateTimeOffset.UtcNow;

    public bool IsEligibleForExecution =>
        Authorization == DeviceAuthorizationState.Authorized && HealthState == DeviceHealthState.Ready;
}

public sealed record DeviceGroup
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public IReadOnlyList<Guid> DeviceIds { get; init; } = [];
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
}

public sealed record PortLeaseRequest
{
    public bool SystemPort { get; init; } = true;
    public bool MjpegServerPort { get; init; } = true;
    public bool ChromedriverPort { get; init; }
    public bool LocalForwardPort { get; init; }

    public IReadOnlyList<PortKind> RequestedKinds
    {
        get
        {
            var kinds = new List<PortKind>();
            if (SystemPort) kinds.Add(PortKind.System);
            if (MjpegServerPort) kinds.Add(PortKind.MjpegServer);
            if (ChromedriverPort) kinds.Add(PortKind.Chromedriver);
            if (LocalForwardPort) kinds.Add(PortKind.LocalForward);
            return kinds;
        }
    }
}

public sealed record FarmRunSpec
{
    public required Guid SessionId { get; init; }
    public DeviceExecutionStrategy Strategy { get; init; } = DeviceExecutionStrategy.Single;
    public Guid? DeviceGroupId { get; init; }
    public IReadOnlyList<Guid> DeviceIds { get; init; } = [];
    public int Iterations { get; init; } = 1;
    public int? IterationsPerDevice { get; init; }
    public int? TotalIterations { get; init; }
    public int MaxParallelDevices { get; init; } = 1;
    public TimeSpan IterationDelay { get; init; } = TimeSpan.Zero;
    public TimeSpan IterationTimeout { get; init; } = TimeSpan.FromMinutes(2);
    public FarmFailurePolicy FailurePolicy { get; init; } = FarmFailurePolicy.ContinueOtherDevices;
    public PortLeaseRequest Ports { get; init; } = new();
    public string? TargetPackage { get; init; }
    public string? TargetActivity { get; init; }

    public int RequestedIterations => Strategy == DeviceExecutionStrategy.SplitIterations
        ? TotalIterations ?? Iterations
        : IterationsPerDevice ?? Iterations;
}

public sealed record FarmRunRequest
{
    public required AutomationSession Session { get; init; }
    public required GeneratedProject Project { get; init; }
    public required FarmRunSpec Specification { get; init; }
}

public sealed record DeviceLease
{
    public required Guid LeaseId { get; init; }
    public required Guid FarmRunId { get; init; }
    public required Guid DeviceId { get; init; }
    public required string AdbSerialSnapshot { get; init; }
    public required string Owner { get; init; }
    public DeviceLeaseState State { get; init; } = DeviceLeaseState.Reserved;
    public DateTimeOffset AcquiredAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReleasedAt { get; init; }
}

public sealed record PortLease
{
    public required Guid LeaseId { get; init; }
    public required Guid FarmRunId { get; init; }
    public required Guid DeviceId { get; init; }
    public required IReadOnlyDictionary<PortKind, int> Ports { get; init; }
    public PortLeaseState State { get; init; } = PortLeaseState.Active;
    public DateTimeOffset AcquiredAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReleasedAt { get; init; }
}

public sealed record DeviceWorkerContext
{
    public required Guid FarmRunId { get; init; }
    public required Guid DeviceRunId { get; init; }
    public required DeviceProfile Device { get; init; }
    public required string AdbSerialSnapshot { get; init; }
    public required IReadOnlyList<int> IterationNumbers { get; init; }
    public required IReadOnlyDictionary<PortKind, int> Ports { get; init; }
    public required AutomationSession Session { get; init; }
    public required GeneratedProject Project { get; init; }
    public required FarmRunSpec Specification { get; init; }
    public string? AppiumServerUrl { get; init; }
}

public sealed record DeviceIteration
{
    public required Guid Id { get; init; }
    public required Guid DeviceRunId { get; init; }
    public required int IterationNumber { get; init; }
    public required RunStatus Status { get; init; }
    public int PassedSteps { get; init; }
    public int FailedSteps { get; init; }
    public int TotalSteps { get; init; }
    public DateTimeOffset StartedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; init; }
    public string? Error { get; init; }
}

public sealed record DeviceObservation
{
    public required Guid Id { get; init; }
    public required Guid FarmRunId { get; init; }
    public required Guid DeviceRunId { get; init; }
    public Guid? IterationId { get; init; }
    public required Guid ActionId { get; init; }
    public required Guid DeviceId { get; init; }
    public required string AdbSerialSnapshot { get; init; }
    public required DeviceObservationStatus Status { get; init; }
    public string? ResolvedLocator { get; init; }
    public int MatchCount { get; init; }
    public bool FallbackUsed { get; init; }
    public string? HierarchySha256 { get; init; }
    public string? Error { get; init; }
    public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;
}

public sealed record ArtifactReference
{
    public required Guid Id { get; init; }
    public required Guid FarmRunId { get; init; }
    public required Guid DeviceRunId { get; init; }
    public Guid? IterationId { get; init; }
    public required string Kind { get; init; }
    public required string RelativePath { get; init; }
    public required string Sha256 { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
}

public sealed record DeviceRun
{
    public required Guid Id { get; init; }
    public required Guid FarmRunId { get; init; }
    public required Guid DeviceId { get; init; }
    public required string AdbSerialSnapshot { get; init; }
    public required RunStatus Status { get; init; }
    public required int PlannedIterations { get; init; }
    public int StartedIterations { get; init; }
    public int PassedIterations { get; init; }
    public int FailedIterations { get; init; }
    public int BlockedIterations { get; init; }
    public int CancelledIterations { get; init; }
    public IReadOnlyList<DeviceIteration> Iterations { get; init; } = [];
    public string? Error { get; init; }
    public DateTimeOffset StartedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; init; }
}

public sealed record DeviceRunResult
{
    public required DeviceRun Run { get; init; }
    public IReadOnlyList<DeviceObservation> Observations { get; init; } = [];
    public IReadOnlyList<ArtifactReference> Artifacts { get; init; } = [];
}

public sealed record FarmRunReport
{
    public required Guid FarmRunId { get; init; }
    public required Guid SessionId { get; init; }
    public required DeviceExecutionStrategy Strategy { get; init; }
    public required RunStatus Status { get; init; }
    public required FarmCompletion Completion { get; init; }
    public int PlannedIterations { get; init; }
    public int StartedIterations { get; init; }
    public int PassedIterations { get; init; }
    public int FailedIterations { get; init; }
    public int BlockedIterations { get; init; }
    public int CancelledIterations { get; init; }
    public IReadOnlyList<DeviceRun> DeviceRuns { get; init; } = [];
    public IReadOnlyList<DeviceObservation> Observations { get; init; } = [];
    public IReadOnlyList<ArtifactReference> Artifacts { get; init; } = [];
    public DateTimeOffset StartedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; init; }
    public TimeSpan Duration { get; init; }
    public string? Error { get; init; }
}

public sealed record DevicePreflightResult
{
    public required bool Ready { get; init; }
    public required DeviceProfile Device { get; init; }
    public IReadOnlyList<string> Issues { get; init; } = [];
}
