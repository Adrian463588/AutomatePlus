namespace AutomatePlus.Domain;

public interface IFarmWorkspaceStore
{
    Task SaveDeviceProfileAsync(DeviceProfile profile, CancellationToken cancellationToken);
    Task<IReadOnlyList<DeviceProfile>> GetDeviceProfilesAsync(CancellationToken cancellationToken);
    Task SaveDeviceGroupAsync(DeviceGroup group, CancellationToken cancellationToken);
    Task<DeviceGroup?> GetDeviceGroupAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<DeviceGroup>> GetDeviceGroupsAsync(CancellationToken cancellationToken);
    Task SaveDeviceLeaseAsync(DeviceLease lease, CancellationToken cancellationToken);
    Task SavePortLeaseAsync(PortLease lease, CancellationToken cancellationToken);
    Task SaveFarmRunAsync(FarmRunReport report, CancellationToken cancellationToken);
}

public interface IEvidenceArtifactStore
{
    Task<ArtifactReference> WriteAsync(
        Guid farmRunId,
        Guid deviceId,
        Guid deviceRunId,
        Guid? iterationId,
        string kind,
        Stream content,
        CancellationToken cancellationToken);
}

public interface IDeviceRegistry
{
    Task<IReadOnlyList<DeviceProfile>> DiscoverAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<DeviceProfile>> ResolveAsync(FarmRunSpec specification, CancellationToken cancellationToken);
}

public interface IDevicePreflight
{
    Task<DevicePreflightResult> CheckAsync(DeviceProfile device, FarmRunSpec specification, CancellationToken cancellationToken);
}

public interface IDeviceLeaseManager
{
    Task<DeviceLease> AcquireAsync(Guid farmRunId, DeviceProfile device, string owner, CancellationToken cancellationToken);
    Task<DeviceLease> TransitionAsync(DeviceLease lease, DeviceLeaseState state, CancellationToken cancellationToken);
    Task<DeviceLease> ReleaseAsync(DeviceLease lease, string reason, CancellationToken cancellationToken);
    Task<int> RecoverStaleAsync(DateTimeOffset cutoff, CancellationToken cancellationToken);
}

public interface IPortLeaseManager
{
    Task<PortLease> AcquireAsync(Guid farmRunId, Guid deviceId, PortLeaseRequest request, CancellationToken cancellationToken);
    Task<PortLease> ReleaseAsync(PortLease lease, CancellationToken cancellationToken);
}

public interface IDeviceRunWorker
{
    Task<DeviceRunResult> RunAsync(DeviceWorkerContext context, CancellationToken cancellationToken);
}

public interface IFarmRunScheduler
{
    Task<FarmRunReport> RunAsync(FarmRunRequest request, CancellationToken cancellationToken);
}
