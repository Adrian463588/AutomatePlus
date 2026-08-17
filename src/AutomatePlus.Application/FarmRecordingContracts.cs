using AutomatePlus.Domain;

namespace AutomatePlus.Application;

public sealed record DeviceFarmRecordingPlan
{
    public required Guid SessionId { get; init; }
    public required Guid PrimaryDeviceId { get; init; }
    public IReadOnlyList<Guid> FollowerDeviceIds { get; init; } = [];
}

public sealed record DeviceFarmRecordingEvent
{
    public ActionIr? PrimaryAction { get; init; }
    public IReadOnlyList<DeviceObservation> Observations { get; init; } = [];
}

public interface IDeviceFarmRecordingCoordinator
{
    IAsyncEnumerable<DeviceFarmRecordingEvent> RecordAsync(
        DeviceFarmRecordingPlan plan,
        CancellationToken cancellationToken);
}
