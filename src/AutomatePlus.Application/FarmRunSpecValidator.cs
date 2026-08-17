using AutomatePlus.Domain;

namespace AutomatePlus.Application;

public sealed class FarmRunSpecValidator
{
    public IReadOnlyList<string> Validate(FarmRunRequest request)
    {
        var errors = new List<string>();
        var specification = request.Specification;

        if (request.Session.Id == Guid.Empty) errors.Add("session.id must be a UUID");
        if (request.Project.Manifest.Platform != request.Session.Platform)
            errors.Add("project.manifest.platform must match the session platform");
        if (specification.SessionId == Guid.Empty) errors.Add("farm.sessionId must be a UUID");
        if (specification.SessionId != request.Session.Id) errors.Add("farm.sessionId must match session.id");
        if (specification.DeviceGroupId.HasValue && specification.DeviceGroupId.Value == Guid.Empty)
            errors.Add("farm.deviceGroupId must be a UUID");
        if (specification.DeviceGroupId.HasValue && specification.DeviceIds.Count > 0)
            errors.Add("farm.deviceGroupId and farm.deviceIds are mutually exclusive");
        if (!specification.DeviceGroupId.HasValue && specification.DeviceIds.Count == 0)
            errors.Add("farm requires a deviceGroupId or at least one deviceId");
        if (specification.DeviceIds.Any(id => id == Guid.Empty)) errors.Add("farm.deviceIds cannot contain an empty UUID");
        if (specification.DeviceIds.Count != specification.DeviceIds.Distinct().Count()) errors.Add("farm.deviceIds must be unique");
        if (specification.IterationsPerDevice is <= 0) errors.Add("farm.iterationsPerDevice must be greater than zero");
        if (specification.TotalIterations is <= 0) errors.Add("farm.totalIterations must be greater than zero");
        if (specification.Strategy == DeviceExecutionStrategy.SplitIterations && specification.IterationsPerDevice.HasValue)
            errors.Add("split-iterations uses totalIterations, not iterationsPerDevice");
        if (specification.Strategy != DeviceExecutionStrategy.SplitIterations && specification.TotalIterations.HasValue)
            errors.Add("single and all-devices use iterationsPerDevice, not totalIterations");
        if (specification.RequestedIterations <= 0) errors.Add("farm.iterations must be greater than zero");
        if (specification.MaxParallelDevices <= 0) errors.Add("farm.maxParallelDevices must be greater than zero");
        if (specification.IterationDelay < TimeSpan.Zero) errors.Add("farm.iterationDelay cannot be negative");
        if (specification.IterationTimeout <= TimeSpan.Zero) errors.Add("farm.iterationTimeout must be greater than zero");
        if (specification.Strategy == DeviceExecutionStrategy.Single && specification.DeviceIds.Count > 1)
            errors.Add("single strategy accepts exactly one device");
        if (!request.Project.Manifest.SupportedDeviceStrategies.Contains(specification.Strategy))
            errors.Add($"generator does not support device strategy {specification.Strategy}");

        return errors;
    }
}
