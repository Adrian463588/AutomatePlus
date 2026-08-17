using System.Globalization;
using System.Text.RegularExpressions;
using AutomatePlus.Domain;

namespace AutomatePlus.Infrastructure;

public sealed record AdbDeviceSnapshot
{
    public required string Serial { get; init; }
    public required DeviceAuthorizationState Authorization { get; init; }
    public string? Model { get; init; }
    public string? Product { get; init; }
    public string? TransportId { get; init; }
}

public static class AdbDeviceListParser
{
    public static IReadOnlyList<AdbDeviceSnapshot> Parse(string output)
    {
        var devices = new List<AdbDeviceSnapshot>();
        foreach (var rawLine in output.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (rawLine.StartsWith("List of devices attached", StringComparison.OrdinalIgnoreCase)) continue;
            var columns = rawLine.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (columns.Length < 2) continue;
            var authorization = columns[1] switch
            {
                "device" => DeviceAuthorizationState.Authorized,
                "offline" => DeviceAuthorizationState.Offline,
                "unauthorized" => DeviceAuthorizationState.Unauthorized,
                _ => DeviceAuthorizationState.Unknown
            };
            var metadata = columns.Skip(2)
                .Select(item => item.Split(':', 2))
                .Where(item => item.Length == 2)
                .ToDictionary(item => item[0], item => item[1], StringComparer.OrdinalIgnoreCase);
            devices.Add(new AdbDeviceSnapshot
            {
                Serial = columns[0],
                Authorization = authorization,
                Model = metadata.GetValueOrDefault("model")?.Replace('_', ' '),
                Product = metadata.GetValueOrDefault("product"),
                TransportId = metadata.GetValueOrDefault("transport_id")
            });
        }
        return devices;
    }
}

public interface IAdbCommandExecutor
{
    Task<ProcessHostResult> RunAsync(IReadOnlyList<string> arguments, CancellationToken cancellationToken);
}

public sealed class ProcessHostAdbCommandExecutor : IAdbCommandExecutor
{
    private readonly ProcessHost processHost;
    private readonly string adbPath;
    private readonly string workingDirectory;
    private readonly TimeSpan timeout;

    public ProcessHostAdbCommandExecutor(ProcessHost processHost, string adbPath, string workingDirectory, TimeSpan? timeout = null)
    {
        this.processHost = processHost;
        this.adbPath = adbPath;
        this.workingDirectory = Path.GetFullPath(workingDirectory);
        this.timeout = timeout ?? TimeSpan.FromSeconds(30);
    }

    public Task<ProcessHostResult> RunAsync(IReadOnlyList<string> arguments, CancellationToken cancellationToken)
    {
        return processHost.RunAsync(adbPath, arguments, workingDirectory, null, timeout, cancellationToken);
    }
}

public sealed class AdbDeviceRegistry : IDeviceRegistry
{
    private readonly IAdbCommandExecutor adb;
    private readonly IFarmWorkspaceStore? workspaceStore;
    private readonly Dictionary<string, Guid> stableIdsBySerial = new(StringComparer.Ordinal);

    public AdbDeviceRegistry(IAdbCommandExecutor adb, IFarmWorkspaceStore? workspaceStore = null)
    {
        this.adb = adb;
        this.workspaceStore = workspaceStore;
    }

    public async Task<IReadOnlyList<DeviceProfile>> DiscoverAsync(CancellationToken cancellationToken)
    {
        var result = await adb.RunAsync(["devices", "-l"], cancellationToken);
        if (result.ExitCode != 0)
            throw new AutomationException(AutomationErrorCode.DeviceUnavailable, "ADB device discovery failed", new Dictionary<string, object?> { ["stderr"] = result.Stderr });

        IReadOnlyList<DeviceProfile> persisted = workspaceStore is null
            ? []
            : await workspaceStore.GetDeviceProfilesAsync(cancellationToken);
        var persistedBySerial = persisted.ToDictionary(item => item.AdbSerial, StringComparer.Ordinal);
        var profiles = new List<DeviceProfile>();

        foreach (var snapshot in AdbDeviceListParser.Parse(result.Stdout))
        {
            var details = snapshot.Authorization == DeviceAuthorizationState.Authorized
                ? await ReadDetailsAsync(snapshot.Serial, cancellationToken)
                : AdbDeviceDetails.Unavailable;
            var stableId = persistedBySerial.GetValueOrDefault(snapshot.Serial)?.Id
                ?? stableIdsBySerial.GetValueOrDefault(snapshot.Serial)
                ?? Guid.NewGuid();
            stableIdsBySerial[snapshot.Serial] = stableId;
            var profile = new DeviceProfile
            {
                Id = stableId,
                AdbSerial = snapshot.Serial,
                Model = details.Model ?? snapshot.Model ?? "unknown",
                Manufacturer = details.Manufacturer ?? "unknown",
                Product = details.Product ?? snapshot.Product ?? "unknown",
                AndroidVersion = details.AndroidVersion ?? "unknown",
                SdkVersion = details.SdkVersion,
                IsEmulator = snapshot.Serial.StartsWith("emulator-", StringComparison.OrdinalIgnoreCase),
                ResolutionWidth = details.ResolutionWidth,
                ResolutionHeight = details.ResolutionHeight,
                Density = details.Density,
                Orientation = details.Orientation,
                Transport = snapshot.TransportId is null ? "unknown" : $"transport:{snapshot.TransportId}",
                Authorization = snapshot.Authorization,
                HealthState = snapshot.Authorization == DeviceAuthorizationState.Authorized && details.Available
                    ? DeviceHealthState.Ready
                    : DeviceHealthState.Blocked,
                LastSeen = DateTimeOffset.UtcNow
            };
            profiles.Add(profile);
            if (workspaceStore is not null) await workspaceStore.SaveDeviceProfileAsync(profile, cancellationToken);
        }

        return profiles;
    }

    public async Task<IReadOnlyList<DeviceProfile>> ResolveAsync(FarmRunSpec specification, CancellationToken cancellationToken)
    {
        var profiles = await DiscoverAsync(cancellationToken);
        IReadOnlyList<Guid> requestedIds;
        if (specification.DeviceGroupId.HasValue)
        {
            if (workspaceStore is null)
                throw new AutomationException(AutomationErrorCode.ProjectPrerequisiteMissing, "A workspace store is required to resolve a device group");
            var group = await workspaceStore.GetDeviceGroupAsync(specification.DeviceGroupId.Value, cancellationToken);
            if (group is null) throw new AutomationException(AutomationErrorCode.DeviceUnavailable, $"Device group was not found: {specification.DeviceGroupId}");
            requestedIds = group.DeviceIds;
        }
        else
        {
            requestedIds = specification.DeviceIds;
        }

        var selected = profiles.Where(profile => requestedIds.Contains(profile.Id)).ToArray();
        var missing = requestedIds.Except(selected.Select(profile => profile.Id)).ToArray();
        if (missing.Length > 0)
            throw new AutomationException(AutomationErrorCode.DeviceUnavailable, $"Selected device profiles are unavailable: {string.Join(", ", missing)}");
        return selected;
    }

    private async Task<AdbDeviceDetails> ReadDetailsAsync(string serial, CancellationToken cancellationToken)
    {
        try
        {
            var propsResult = await adb.RunAsync(["-s", serial, "shell", "getprop"], cancellationToken);
            if (propsResult.ExitCode != 0) return AdbDeviceDetails.Unavailable;
            var props = ParseProperties(propsResult.Stdout);
            var sizeResult = await adb.RunAsync(["-s", serial, "shell", "wm", "size"], cancellationToken);
            var densityResult = await adb.RunAsync(["-s", serial, "shell", "wm", "density"], cancellationToken);
            var size = ParseSize(sizeResult.Stdout);
            var density = ParseDensity(densityResult.Stdout);
            return new AdbDeviceDetails
            {
                Available = true,
                Manufacturer = props.GetValueOrDefault("ro.product.manufacturer"),
                Model = props.GetValueOrDefault("ro.product.model"),
                Product = props.GetValueOrDefault("ro.product.name"),
                AndroidVersion = props.GetValueOrDefault("ro.build.version.release"),
                SdkVersion = int.TryParse(props.GetValueOrDefault("ro.build.version.sdk"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var sdk) ? sdk : 0,
                ResolutionWidth = size.Width,
                ResolutionHeight = size.Height,
                Density = density,
                Orientation = "unknown"
            };
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch
        {
            return AdbDeviceDetails.Unavailable;
        }
    }

    private static IReadOnlyDictionary<string, string> ParseProperties(string output)
    {
        var properties = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var line in output.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var match = Regex.Match(line, "^\\[(?<key>[^]]+)\\]: \\[(?<value>[^]]*)\\]$");
            if (match.Success) properties[match.Groups["key"].Value] = match.Groups["value"].Value;
        }
        return properties;
    }

    private static (int Width, int Height) ParseSize(string output)
    {
        var match = Regex.Match(output, "(?<width>\\d+)x(?<height>\\d+)");
        return match.Success && int.TryParse(match.Groups["width"].Value, out var width) && int.TryParse(match.Groups["height"].Value, out var height)
            ? (width, height)
            : (0, 0);
    }

    private static int ParseDensity(string output)
    {
        var match = Regex.Match(output, "(?<density>\\d+)");
        return match.Success && int.TryParse(match.Groups["density"].Value, out var density) ? density : 0;
    }

    private sealed record AdbDeviceDetails
    {
        public static AdbDeviceDetails Unavailable { get; } = new();
        public bool Available { get; init; }
        public string? Manufacturer { get; init; }
        public string? Model { get; init; }
        public string? Product { get; init; }
        public string? AndroidVersion { get; init; }
        public int SdkVersion { get; init; }
        public int ResolutionWidth { get; init; }
        public int ResolutionHeight { get; init; }
        public int Density { get; init; }
        public string Orientation { get; init; } = "unknown";
    }
}

public sealed class AdbDevicePreflight : IDevicePreflight
{
    private readonly IAdbCommandExecutor adb;

    public AdbDevicePreflight(IAdbCommandExecutor adb)
    {
        this.adb = adb;
    }

    public async Task<DevicePreflightResult> CheckAsync(DeviceProfile device, FarmRunSpec specification, CancellationToken cancellationToken)
    {
        var issues = new List<string>();
        if (device.Authorization != DeviceAuthorizationState.Authorized)
            issues.Add($"ADB device is not authorized: {device.Authorization}");
        if (device.HealthState != DeviceHealthState.Ready)
            issues.Add($"Device health is not ready: {device.HealthState}");

        if (issues.Count == 0)
        {
            var state = await adb.RunAsync(["-s", device.AdbSerial, "get-state"], cancellationToken);
            if (state.ExitCode != 0 || !state.Stdout.Trim().Equals("device", StringComparison.OrdinalIgnoreCase))
                issues.Add("ADB get-state did not report device");
        }

        if (issues.Count == 0 && !string.IsNullOrWhiteSpace(specification.TargetPackage))
        {
            if (!Regex.IsMatch(specification.TargetPackage, "^[A-Za-z][A-Za-z0-9_.]+$"))
                issues.Add("Target package is not a valid Android package name");
            else
            {
                var package = await adb.RunAsync(["-s", device.AdbSerial, "shell", "cmd", "package", "resolve-activity", "--brief", specification.TargetPackage], cancellationToken);
                if (package.ExitCode != 0 || package.Stdout.Contains("No activity", StringComparison.OrdinalIgnoreCase))
                    issues.Add("Target package activity could not be resolved");
            }
        }

        return new DevicePreflightResult
        {
            Ready = issues.Count == 0,
            Device = device,
            Issues = issues
        };
    }
}
