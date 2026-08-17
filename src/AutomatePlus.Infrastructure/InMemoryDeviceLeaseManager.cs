using AutomatePlus.Domain;

namespace AutomatePlus.Infrastructure;

public sealed class InMemoryDeviceLeaseManager : IDeviceLeaseManager
{
    private readonly object gate = new();
    private readonly Dictionary<Guid, DeviceLease> leasesByDevice = new();
    private readonly Dictionary<string, Guid> devicesBySerial = new(StringComparer.Ordinal);

    public Task<DeviceLease> AcquireAsync(Guid farmRunId, DeviceProfile device, string owner, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (farmRunId == Guid.Empty) throw new ArgumentException("Farm run ID is required.", nameof(farmRunId));
        if (device.Id == Guid.Empty) throw new ArgumentException("Device ID is required.", nameof(device));
        if (string.IsNullOrWhiteSpace(device.AdbSerial)) throw new ArgumentException("ADB serial is required.", nameof(device));
        if (string.IsNullOrWhiteSpace(owner)) throw new ArgumentException("Lease owner is required.", nameof(owner));

        lock (gate)
        {
            if (leasesByDevice.TryGetValue(device.Id, out var existing) && existing.State != DeviceLeaseState.Released)
                throw new AutomationException(AutomationErrorCode.DeviceBusy, $"Device is already leased: {device.Id}");
            if (devicesBySerial.TryGetValue(device.AdbSerial, out var serialDeviceId) && serialDeviceId != device.Id)
                throw new AutomationException(AutomationErrorCode.DeviceBusy, $"ADB serial is already leased: {device.AdbSerial}");

            var lease = new DeviceLease
            {
                LeaseId = Guid.NewGuid(),
                FarmRunId = farmRunId,
                DeviceId = device.Id,
                AdbSerialSnapshot = device.AdbSerial,
                Owner = owner,
                State = DeviceLeaseState.Reserved,
                AcquiredAt = DateTimeOffset.UtcNow
            };
            leasesByDevice[device.Id] = lease;
            devicesBySerial[device.AdbSerial] = device.Id;
            return Task.FromResult(lease);
        }
    }

    public Task<DeviceLease> TransitionAsync(DeviceLease lease, DeviceLeaseState state, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (gate)
        {
            if (!leasesByDevice.TryGetValue(lease.DeviceId, out var current) || current.LeaseId != lease.LeaseId)
                throw new AutomationException(AutomationErrorCode.DeviceUnavailable, $"Unknown device lease: {lease.LeaseId}");
            if (current.State == DeviceLeaseState.Released)
                return Task.FromResult(current);
            if (!IsValidTransition(current.State, state))
                throw new InvalidOperationException($"Invalid device lease transition: {current.State} -> {state}");

            var transitioned = current with { State = state };
            leasesByDevice[lease.DeviceId] = transitioned;
            return Task.FromResult(transitioned);
        }
    }

    public Task<DeviceLease> ReleaseAsync(DeviceLease lease, string reason, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (gate)
        {
            if (!leasesByDevice.TryGetValue(lease.DeviceId, out var current) || current.LeaseId != lease.LeaseId)
                return Task.FromResult(lease with { State = DeviceLeaseState.Released, ReleasedAt = DateTimeOffset.UtcNow });
            if (current.State == DeviceLeaseState.Released)
                return Task.FromResult(current);

            var released = current with { State = DeviceLeaseState.Released, ReleasedAt = DateTimeOffset.UtcNow };
            leasesByDevice[lease.DeviceId] = released;
            devicesBySerial.Remove(current.AdbSerialSnapshot);
            return Task.FromResult(released);
        }
    }

    public Task<int> RecoverStaleAsync(DateTimeOffset cutoff, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (gate)
        {
            var stale = leasesByDevice.Values
                .Where(lease => lease.State != DeviceLeaseState.Released && lease.AcquiredAt < cutoff)
                .ToArray();
            foreach (var lease in stale)
            {
                leasesByDevice[lease.DeviceId] = lease with { State = DeviceLeaseState.Released, ReleasedAt = DateTimeOffset.UtcNow };
                devicesBySerial.Remove(lease.AdbSerialSnapshot);
            }
            return Task.FromResult(stale.Length);
        }
    }

    private static bool IsValidTransition(DeviceLeaseState from, DeviceLeaseState to)
    {
        return (from, to) switch
        {
            (DeviceLeaseState.Reserved, DeviceLeaseState.Preparing) => true,
            (DeviceLeaseState.Preparing, DeviceLeaseState.Running) => true,
            (DeviceLeaseState.Preparing, DeviceLeaseState.Cleaning) => true,
            (DeviceLeaseState.Running, DeviceLeaseState.Cleaning) => true,
            (DeviceLeaseState.Running, DeviceLeaseState.Failed) => true,
            (DeviceLeaseState.Running, DeviceLeaseState.Disconnected) => true,
            (DeviceLeaseState.Failed, DeviceLeaseState.Cleaning) => true,
            (DeviceLeaseState.Disconnected, DeviceLeaseState.Cleaning) => true,
            (DeviceLeaseState.Cleaning, DeviceLeaseState.Released) => true,
            _ => false
        };
    }
}
