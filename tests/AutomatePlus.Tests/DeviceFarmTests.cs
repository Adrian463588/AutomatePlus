using AutomatePlus.Domain;
using AutomatePlus.Infrastructure;

namespace AutomatePlus.Tests;

public sealed class DeviceFarmTests
{
    [Fact]
    public void ParsesAuthorizedAndUnauthorizedAdbDevicesWithoutLosingSerials()
    {
        const string output = "List of devices attached\nusb-serial-1\tdevice product:alpha model:Pixel_8 transport_id:1\nusb-serial-2\tunauthorized usb:1-2\n";

        var devices = AdbDeviceListParser.Parse(output);

        Assert.Equal(2, devices.Count);
        Assert.Equal("usb-serial-1", devices[0].Serial);
        Assert.Equal(DeviceAuthorizationState.Authorized, devices[0].Authorization);
        Assert.Equal("Pixel 8", devices[0].Model);
        Assert.Equal(DeviceAuthorizationState.Unauthorized, devices[1].Authorization);
    }

    [Fact]
    public async Task DeviceLeasePreventsConcurrentUseAndRecoversStaleLease()
    {
        var manager = new InMemoryDeviceLeaseManager();
        var device = ReadyDevice(Guid.NewGuid(), "serial-1");
        var runId = Guid.NewGuid();

        var lease = await manager.AcquireAsync(runId, device, "test", CancellationToken.None);
        await Assert.ThrowsAsync<AutomationException>(() => manager.AcquireAsync(Guid.NewGuid(), device, "other", CancellationToken.None));

        var recovered = await manager.RecoverStaleAsync(DateTimeOffset.UtcNow.AddMinutes(1), CancellationToken.None);

        Assert.Equal(1, recovered);
        var replacement = await manager.AcquireAsync(Guid.NewGuid(), device, "replacement", CancellationToken.None);
        Assert.NotEqual(lease.LeaseId, replacement.LeaseId);
    }

    [Fact]
    public async Task PortLeaseAllocatesUniquePortsAndReleasesIdempotently()
    {
        var manager = new PortLeaseManager(new PortLeaseOptions { StartPort = 52100, EndPort = 52110 });
        var first = await manager.AcquireAsync(Guid.NewGuid(), Guid.NewGuid(), new PortLeaseRequest(), CancellationToken.None);
        var second = await manager.AcquireAsync(Guid.NewGuid(), Guid.NewGuid(), new PortLeaseRequest(), CancellationToken.None);

        Assert.Equal(3, first.Ports.Count);
        Assert.Equal(3, second.Ports.Count);
        Assert.Empty(first.Ports.Values.Intersect(second.Ports.Values));

        var released = await manager.ReleaseAsync(first, CancellationToken.None);
        var releasedAgain = await manager.ReleaseAsync(released, CancellationToken.None);

        Assert.Equal(PortLeaseState.Released, releasedAgain.State);
        await manager.ReleaseAsync(second, CancellationToken.None);
    }

    private static DeviceProfile ReadyDevice(Guid id, string serial) => new()
    {
        Id = id,
        AdbSerial = serial,
        Authorization = DeviceAuthorizationState.Authorized,
        HealthState = DeviceHealthState.Ready
    };
}
