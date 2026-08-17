using System.ComponentModel;
using System.Runtime.CompilerServices;
using AutomatePlus.Domain;

namespace AutomatePlus.App;

public enum DeviceFarmCancellationState
{
    Idle,
    Running,
    CancellationRequested,
    Completed,
    Blocked
}

public sealed record FarmStrategyOption(
    DeviceExecutionStrategy Value,
    string DisplayName,
    string Description);

public sealed record FarmFailurePolicyOption(
    FarmFailurePolicy Value,
    string DisplayName,
    string Description);

public sealed record FarmGroupOption(DeviceGroup Group)
{
    public string DisplayName => Group.Name;
    public string Details => $"{Group.DeviceIds.Count} configured device(s)";
}

/// <summary>
/// Presentation wrapper for a domain device profile. The wrapper owns only
/// transient UI selection state; discovery data remains supplied by the host.
/// </summary>
public sealed class FarmDeviceItem : INotifyPropertyChanged
{
    private bool isSelected;
    private bool isPrimary;
    private bool isFollower;
    private string evidenceSummary = "No run evidence is available.";

    public FarmDeviceItem(DeviceProfile profile)
    {
        Profile = profile;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public DeviceProfile Profile { get; }

    public Guid DeviceId => Profile.Id;

    public string DisplayName =>
        string.IsNullOrWhiteSpace(Profile.Model) || Profile.Model.Equals("unknown", StringComparison.OrdinalIgnoreCase)
            ? string.IsNullOrWhiteSpace(Profile.AdbSerial) ? "Device profile without serial" : Profile.AdbSerial
            : Profile.Model;

    public string SerialSummary => string.IsNullOrWhiteSpace(Profile.AdbSerial)
        ? "ADB serial unavailable"
        : Profile.AdbSerial;

    public string DeviceDetails
    {
        get
        {
            var details = new List<string>();
            if (!string.IsNullOrWhiteSpace(Profile.Manufacturer) && !Profile.Manufacturer.Equals("unknown", StringComparison.OrdinalIgnoreCase))
                details.Add(Profile.Manufacturer);
            if (!string.IsNullOrWhiteSpace(Profile.AndroidVersion) && !Profile.AndroidVersion.Equals("unknown", StringComparison.OrdinalIgnoreCase))
                details.Add($"Android {Profile.AndroidVersion}");
            if (Profile.SdkVersion > 0)
                details.Add($"API {Profile.SdkVersion}");
            if (Profile.ResolutionWidth > 0 && Profile.ResolutionHeight > 0)
                details.Add($"{Profile.ResolutionWidth}×{Profile.ResolutionHeight}");
            if (Profile.Density > 0)
                details.Add($"{Profile.Density} dpi");

            return details.Count == 0 ? "Device metadata is not available." : string.Join(" · ", details);
        }
    }

    public string StatusSummary => $"{Profile.Authorization} · {Profile.HealthState}";

    public bool IsEligible => Profile.IsEligibleForExecution;

    public string EligibilitySummary => IsEligible
        ? "Ready for host preflight."
        : "Not eligible: authorization or health preflight is incomplete.";

    public bool IsSelected
    {
        get => isSelected;
        set => SetProperty(ref isSelected, value);
    }

    public bool IsPrimary
    {
        get => isPrimary;
        set => SetProperty(ref isPrimary, value);
    }

    public bool IsFollower
    {
        get => isFollower;
        set => SetProperty(ref isFollower, value);
    }

    public string EvidenceSummary
    {
        get => evidenceSummary;
        private set => SetProperty(ref evidenceSummary, value);
    }

    internal void ApplyRun(DeviceRun? run, int observationCount, int artifactCount)
    {
        if (run is null)
        {
            EvidenceSummary = "No result was returned for this device.";
            return;
        }

        var iterationSummary = $"{run.PassedIterations}/{run.PlannedIterations} iteration(s) passed";
        var summary = $"{run.Status} · {iterationSummary} · {observationCount} observation(s) · {artifactCount} artifact(s)";
        EvidenceSummary = string.IsNullOrWhiteSpace(run.Error) ? summary : $"{summary} · {run.Error}";
    }

    private bool SetProperty<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        return true;
    }
}

public sealed class FarmObservationItem
{
    public FarmObservationItem(DeviceObservation observation)
    {
        Observation = observation;
    }

    public DeviceObservation Observation { get; }

    public string DeviceSummary => string.IsNullOrWhiteSpace(Observation.AdbSerialSnapshot)
        ? Observation.DeviceId.ToString("D")
        : Observation.AdbSerialSnapshot;

    public string StatusSummary => Observation.Status.ToString();

    public string LocatorSummary => string.IsNullOrWhiteSpace(Observation.ResolvedLocator)
        ? "No semantic locator was resolved."
        : Observation.ResolvedLocator;

    public string Details
    {
        get
        {
            var details = new List<string>
            {
                $"matches: {Observation.MatchCount}",
                $"fallback: {(Observation.FallbackUsed ? "yes" : "no")}"
            };
            if (!string.IsNullOrWhiteSpace(Observation.Error))
                details.Add(Observation.Error);
            if (!string.IsNullOrWhiteSpace(Observation.HierarchySha256))
                details.Add($"hierarchy {Observation.HierarchySha256}");
            return string.Join(" · ", details);
        }
    }
}
