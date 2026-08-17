using System.Net;
using System.Net.Sockets;
using AutomatePlus.Domain;

namespace AutomatePlus.Infrastructure;

public sealed record PortLeaseOptions
{
    public int StartPort { get; init; } = 4724;
    public int EndPort { get; init; } = 4899;
}

public sealed class PortLeaseManager : IPortLeaseManager
{
    private readonly object gate = new();
    private readonly HashSet<int> leasedPorts = new();
    private readonly Dictionary<Guid, PortLease> leases = new();
    private readonly PortLeaseOptions options;

    public PortLeaseManager(PortLeaseOptions? options = null)
    {
        this.options = options ?? new PortLeaseOptions();
        if (this.options.StartPort is < 1024 or > 65535 || this.options.EndPort is < 1024 or > 65535 || this.options.StartPort > this.options.EndPort)
            throw new ArgumentOutOfRangeException(nameof(options), "Port range must be between 1024 and 65535.");
    }

    public Task<PortLease> AcquireAsync(Guid farmRunId, Guid deviceId, PortLeaseRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (farmRunId == Guid.Empty) throw new ArgumentException("Farm run ID is required.", nameof(farmRunId));
        if (deviceId == Guid.Empty) throw new ArgumentException("Device ID is required.", nameof(deviceId));
        if (request.RequestedKinds.Count == 0)
            throw new AutomationException(AutomationErrorCode.PortUnavailable, "At least one port kind is required.");

        lock (gate)
        {
            var allocated = new Dictionary<PortKind, int>();
            try
            {
                foreach (var kind in request.RequestedKinds)
                {
                    var port = FindAvailablePort();
                    if (port is null)
                        throw new AutomationException(AutomationErrorCode.PortUnavailable, $"No available port for {kind} in {options.StartPort}-{options.EndPort}");
                    leasedPorts.Add(port.Value);
                    allocated[kind] = port.Value;
                }
            }
            catch
            {
                foreach (var port in allocated.Values) leasedPorts.Remove(port);
                throw;
            }

            var lease = new PortLease
            {
                LeaseId = Guid.NewGuid(),
                FarmRunId = farmRunId,
                DeviceId = deviceId,
                Ports = allocated,
                State = PortLeaseState.Active,
                AcquiredAt = DateTimeOffset.UtcNow
            };
            leases[lease.LeaseId] = lease;
            return Task.FromResult(lease);
        }
    }

    public Task<PortLease> ReleaseAsync(PortLease lease, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (gate)
        {
            if (!leases.TryGetValue(lease.LeaseId, out var current))
                return Task.FromResult(lease with { State = PortLeaseState.Released, ReleasedAt = DateTimeOffset.UtcNow });
            if (current.State == PortLeaseState.Released)
                return Task.FromResult(current);

            foreach (var port in current.Ports.Values) leasedPorts.Remove(port);
            var released = current with { State = PortLeaseState.Released, ReleasedAt = DateTimeOffset.UtcNow };
            leases[lease.LeaseId] = released;
            return Task.FromResult(released);
        }
    }

    private int? FindAvailablePort()
    {
        for (var port = options.StartPort; port <= options.EndPort; port++)
        {
            if (leasedPorts.Contains(port) || !CanBind(port)) continue;
            return port;
        }
        return null;
    }

    private static bool CanBind(int port)
    {
        try
        {
            using var listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            listener.Stop();
            return true;
        }
        catch (SocketException)
        {
            return false;
        }
    }
}
