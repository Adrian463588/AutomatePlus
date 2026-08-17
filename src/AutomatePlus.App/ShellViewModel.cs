using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using AutomatePlus.Application;
using AutomatePlus.Domain;
using Microsoft.UI.Xaml;

namespace AutomatePlus.App;

public enum ShellAvailabilityState
{
    Empty,
    SetupRequired,
    Missing,
    Detected,
    Verified,
    Ready,
    Blocked
}

public sealed record ShellPlatformOption(AutomationPlatform Value, string DisplayName);

public sealed record ShellNavigationItem(string Key, string DisplayName);

public sealed record ShellCapabilityOption(CapabilityManifest Manifest)
{
    public string DisplayName => $"{Manifest.Framework} · {Manifest.Language}";
    public string Details => Manifest.OutputFormat;
}

public sealed record ShellTimelineItem(ActionIr Action)
{
    public string DisplayName => $"{Action.StepNumber}. {Action.Action}";
    public string Description => string.IsNullOrWhiteSpace(Action.Description)
        ? "Recorded action has no description."
        : Action.Description;
    public string LocatorSummary => Action.Locators.Count == 0
        ? "No locator metadata recorded."
        : $"{Action.Locators.Count} locator candidate(s)";
}

/// <summary>
/// Presentation state for the WinUI shell. It is empty unless a host supplies
/// persisted sessions and application services at composition time.
/// </summary>
public sealed class ShellViewModel : INotifyPropertyChanged
{
    private readonly IToolchainResolver? toolchainResolver;
    private readonly IRecorder? recorder;
    private readonly ICodeGenerator? generator;
    private readonly AutomationOrchestrator? orchestrator;
    private readonly IWorkspaceStore? workspaceStore;
    private readonly IFarmWorkspaceStore? farmWorkspaceStore;
    private readonly IDeviceRegistry? deviceRegistry;
    private readonly IFarmRunScheduler? farmRunScheduler;
    private readonly IDeviceFarmRecordingCoordinator? farmRecordingCoordinator;
    private readonly IReadOnlyList<CapabilityManifest> capabilityManifests;
    private CancellationTokenSource? operationCancellation;
    private AutomationSession? currentSession;
    private GeneratedProject? currentGeneratedProject;
    private ShellPlatformOption? selectedPlatform;
    private ShellCapabilityOption? selectedCapability;
    private ShellNavigationItem? selectedNavigationItem;
    private FarmGroupOption? selectedFarmGroup;
    private FarmStrategyOption? selectedFarmStrategy;
    private FarmFailurePolicyOption? selectedFarmFailurePolicy;
    private double farmIterations = 1;
    private double farmMaxParallelDevices = 1;
    private double farmIterationDelaySeconds;
    private string farmGroupName = string.Empty;
    private ShellAvailabilityState workspaceState = ShellAvailabilityState.Empty;
    private ShellAvailabilityState sessionState = ShellAvailabilityState.Empty;
    private ShellAvailabilityState capabilityState = ShellAvailabilityState.SetupRequired;
    private ShellAvailabilityState runtimeState = ShellAvailabilityState.Blocked;
    private ShellAvailabilityState activityState = ShellAvailabilityState.Blocked;
    private ShellAvailabilityState farmDiscoveryState = ShellAvailabilityState.Blocked;
    private DeviceFarmCancellationState farmCancellationState = DeviceFarmCancellationState.Idle;
    private string activityMessage = "Native execution is blocked: no verified runtime resolver is configured.";
    private string farmDiscoveryMessage = "Device discovery is blocked: no host device registry is configured.";
    private string farmStatus = "Blocked";
    private string farmCompletion = "Not available";
    private string farmActivityMessage = "Device Farm is blocked until the native host supplies its scheduler and device services.";
    private string farmEvidenceSummary = "No farm evidence is available.";
    private string generatedCode = string.Empty;
    private bool isBusy;

    public ShellViewModel(
        IEnumerable<CapabilityManifest>? capabilityManifests = null,
        IToolchainResolver? toolchainResolver = null,
        IRecorder? recorder = null,
        ICodeGenerator? generator = null,
        AutomationOrchestrator? orchestrator = null,
        IWorkspaceStore? workspaceStore = null,
        IFarmWorkspaceStore? farmWorkspaceStore = null,
        AutomationSession? session = null,
        IDeviceRegistry? deviceRegistry = null,
        IFarmRunScheduler? farmRunScheduler = null,
        IDeviceFarmRecordingCoordinator? farmRecordingCoordinator = null,
        IEnumerable<DeviceGroup>? deviceGroups = null)
    {
        this.toolchainResolver = toolchainResolver;
        this.recorder = recorder;
        this.generator = generator;
        this.orchestrator = orchestrator;
        this.workspaceStore = workspaceStore;
        this.farmWorkspaceStore = farmWorkspaceStore;
        this.deviceRegistry = deviceRegistry;
        this.farmRunScheduler = farmRunScheduler;
        this.farmRecordingCoordinator = farmRecordingCoordinator;
        this.capabilityManifests = (capabilityManifests ?? []).ToArray();

        NavigationItems =
        [
            new ShellNavigationItem("projects", "Projects"),
            new ShellNavigationItem("web", "Web recorder"),
            new ShellNavigationItem("android", "Android recorder"),
            new ShellNavigationItem("api", "API builder"),
            new ShellNavigationItem("runs", "Runs and reports")
        ];
        Platforms =
        [
            new ShellPlatformOption(AutomationPlatform.Web, "Web"),
            new ShellPlatformOption(AutomationPlatform.Android, "Android"),
            new ShellPlatformOption(AutomationPlatform.Api, "API")
        ];
        FrameworkCapabilities = [];
        Timeline = [];
        FarmDevices = [];
        FarmGroups = new ObservableCollection<FarmGroupOption>(
            (deviceGroups ?? []).Select(group => new FarmGroupOption(group)));
        FarmObservations = [];
        FarmStrategies =
        [
            new FarmStrategyOption(DeviceExecutionStrategy.Single, "Single device", "Preserve the existing one-device execution path."),
            new FarmStrategyOption(DeviceExecutionStrategy.AllDevices, "All devices", "Run every iteration on each selected eligible device."),
            new FarmStrategyOption(DeviceExecutionStrategy.SplitIterations, "Split iterations", "Distribute one iteration queue across selected eligible devices.")
        ];
        FarmFailurePolicies =
        [
            new FarmFailurePolicyOption(FarmFailurePolicy.ContinueOtherDevices, "Continue other devices", "Keep unclaimed work running when one device fails."),
            new FarmFailurePolicyOption(FarmFailurePolicy.FailFast, "Fail fast", "Stop unclaimed work while active workers clean up.")
        ];

        SelectNavigationItemCommand = new RelayCommand(item => SelectedNavigationItem = item as ShellNavigationItem);
        StartRecordingCommand = new AsyncRelayCommand(StartRecordingAsync, () => CanStartRecording);
        StopCommand = new AsyncRelayCommand(StopAsync, () => IsBusy);
        RefreshRuntimeCommand = new AsyncRelayCommand(RefreshRuntimeAsync, () => CanRefreshRuntime);
        GenerateCommand = new AsyncRelayCommand(GenerateAsync, () => CanGenerate);
        RunCommand = new AsyncRelayCommand(RunAsync, () => CanRun);
        DiscoverDevicesCommand = new AsyncRelayCommand(DiscoverDevicesAsync, () => CanDiscoverDevices);
        StartFarmRunCommand = new AsyncRelayCommand(RunFarmAsync, () => CanStartFarmRun);
        StartPrimaryFollowerRecordingCommand = new AsyncRelayCommand(
            StartPrimaryFollowerRecordingAsync,
            () => CanStartPrimaryFollowerRecording);
        ClearFarmSelectionCommand = new RelayCommand(_ => ClearFarmSelection());
        SaveFarmGroupCommand = new AsyncRelayCommand(SaveFarmGroupAsync, () => CanSaveFarmGroup);

        SelectedNavigationItem = NavigationItems[0];
        SelectedFarmStrategy = FarmStrategies[0];
        SelectedFarmFailurePolicy = FarmFailurePolicies[0];
        if (session is not null) LoadSession(session);
        else RefreshDerivedState();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public ObservableCollection<ShellNavigationItem> NavigationItems { get; }
    public ObservableCollection<ShellPlatformOption> Platforms { get; }
    public ObservableCollection<ShellCapabilityOption> FrameworkCapabilities { get; }
    public ObservableCollection<ShellTimelineItem> Timeline { get; }
    public ObservableCollection<FarmDeviceItem> FarmDevices { get; }
    public ObservableCollection<FarmGroupOption> FarmGroups { get; }
    public ObservableCollection<FarmStrategyOption> FarmStrategies { get; }
    public ObservableCollection<FarmFailurePolicyOption> FarmFailurePolicies { get; }
    public ObservableCollection<FarmObservationItem> FarmObservations { get; }

    public ICommand SelectNavigationItemCommand { get; }
    public ICommand StartRecordingCommand { get; }
    public ICommand StopCommand { get; }
    public ICommand RefreshRuntimeCommand { get; }
    public ICommand GenerateCommand { get; }
    public ICommand RunCommand { get; }
    public ICommand DiscoverDevicesCommand { get; }
    public ICommand StartFarmRunCommand { get; }
    public ICommand StartPrimaryFollowerRecordingCommand { get; }
    public ICommand ClearFarmSelectionCommand { get; }
    public ICommand SaveFarmGroupCommand { get; }

    public ShellNavigationItem? SelectedNavigationItem
    {
        get => selectedNavigationItem;
        set
        {
            if (!SetProperty(ref selectedNavigationItem, value)) return;
            OnPropertyChanged(nameof(IsAndroidFarmWorkspaceSelected));
            OnPropertyChanged(nameof(GeneralWorkspaceVisibility));
            OnPropertyChanged(nameof(AndroidFarmWorkspaceVisibility));
        }
    }

    public ShellPlatformOption? SelectedPlatform
    {
        get => selectedPlatform;
        set
        {
            if (!SetProperty(ref selectedPlatform, value)) return;
            selectedCapability = null;
            currentGeneratedProject = null;
            OnPropertyChanged(nameof(SelectedCapability));
            OnPropertyChanged(nameof(HasGeneratedProject));
            RefreshCapabilities();
            RefreshDerivedState();
        }
    }

    public ShellCapabilityOption? SelectedCapability
    {
        get => selectedCapability;
        set
        {
            if (!SetProperty(ref selectedCapability, value)) return;
            currentGeneratedProject = null;
            OnPropertyChanged(nameof(HasGeneratedProject));
            RuntimeState = toolchainResolver is null
                ? ShellAvailabilityState.Blocked
                : ShellAvailabilityState.SetupRequired;
            OnPropertyChanged(nameof(RuntimeStateMessage));
            RefreshDerivedState();
        }
    }

    public AutomationSession? CurrentSession
    {
        get => currentSession;
        private set => SetProperty(ref currentSession, value);
    }

    public bool HasGeneratedProject => currentGeneratedProject is not null;

    public bool IsAndroidFarmWorkspaceSelected => SelectedNavigationItem?.Key == "android";

    public Visibility GeneralWorkspaceVisibility => IsAndroidFarmWorkspaceSelected
        ? Visibility.Collapsed
        : Visibility.Visible;

    public Visibility AndroidFarmWorkspaceVisibility => IsAndroidFarmWorkspaceSelected
        ? Visibility.Visible
        : Visibility.Collapsed;

    public ShellAvailabilityState WorkspaceState
    {
        get => workspaceState;
        private set => SetProperty(ref workspaceState, value);
    }

    public ShellAvailabilityState SessionState
    {
        get => sessionState;
        private set => SetProperty(ref sessionState, value);
    }

    public ShellAvailabilityState CapabilityState
    {
        get => capabilityState;
        private set => SetProperty(ref capabilityState, value);
    }

    public ShellAvailabilityState RuntimeState
    {
        get => runtimeState;
        private set => SetProperty(ref runtimeState, value);
    }

    public ShellAvailabilityState ActivityState
    {
        get => activityState;
        private set => SetProperty(ref activityState, value);
    }

    public string ActivityMessage
    {
        get => activityMessage;
        private set => SetProperty(ref activityMessage, value);
    }

    public string GeneratedCode
    {
        get => generatedCode;
        private set => SetProperty(ref generatedCode, value);
    }

    public bool IsBusy
    {
        get => isBusy;
        private set
        {
            if (!SetProperty(ref isBusy, value)) return;
            OnPropertyChanged(nameof(FarmIsBusy));
            NotifyCommandStates();
        }
    }

    public ShellAvailabilityState FarmDiscoveryState
    {
        get => farmDiscoveryState;
        private set => SetProperty(ref farmDiscoveryState, value);
    }

    public string FarmDiscoveryMessage
    {
        get => farmDiscoveryMessage;
        private set => SetProperty(ref farmDiscoveryMessage, value);
    }

    public FarmGroupOption? SelectedFarmGroup
    {
        get => selectedFarmGroup;
        set
        {
            if (!SetProperty(ref selectedFarmGroup, value)) return;
            ApplySelectedFarmGroup();
            OnFarmSelectionChanged();
        }
    }

    public FarmStrategyOption? SelectedFarmStrategy
    {
        get => selectedFarmStrategy;
        set
        {
            if (!SetProperty(ref selectedFarmStrategy, value)) return;
            OnPropertyChanged(nameof(FarmRunCommandReason));
            NotifyCommandStates();
        }
    }

    public FarmFailurePolicyOption? SelectedFarmFailurePolicy
    {
        get => selectedFarmFailurePolicy;
        set
        {
            if (!SetProperty(ref selectedFarmFailurePolicy, value)) return;
            OnPropertyChanged(nameof(FarmRunCommandReason));
            NotifyCommandStates();
        }
    }

    public double FarmIterations
    {
        get => farmIterations;
        set
        {
            if (!SetProperty(ref farmIterations, value)) return;
            OnPropertyChanged(nameof(FarmRunCommandReason));
            NotifyCommandStates();
        }
    }

    public double FarmMaxParallelDevices
    {
        get => farmMaxParallelDevices;
        set
        {
            if (!SetProperty(ref farmMaxParallelDevices, value)) return;
            OnPropertyChanged(nameof(FarmRunCommandReason));
            NotifyCommandStates();
        }
    }

    public double FarmIterationDelaySeconds
    {
        get => farmIterationDelaySeconds;
        set
        {
            if (!SetProperty(ref farmIterationDelaySeconds, value)) return;
            OnPropertyChanged(nameof(FarmRunCommandReason));
            NotifyCommandStates();
        }
    }

    public string FarmGroupName
    {
        get => farmGroupName;
        set
        {
            if (!SetProperty(ref farmGroupName, value)) return;
            OnPropertyChanged(nameof(FarmGroupCommandReason));
            NotifyCommandStates();
        }
    }

    public string FarmStatus
    {
        get => farmStatus;
        private set => SetProperty(ref farmStatus, value);
    }

    public string FarmCompletion
    {
        get => farmCompletion;
        private set => SetProperty(ref farmCompletion, value);
    }

    public string FarmActivityMessage
    {
        get => farmActivityMessage;
        private set => SetProperty(ref farmActivityMessage, value);
    }

    public string FarmEvidenceSummary
    {
        get => farmEvidenceSummary;
        private set => SetProperty(ref farmEvidenceSummary, value);
    }

    public DeviceFarmCancellationState FarmCancellationState
    {
        get => farmCancellationState;
        private set
        {
            if (!SetProperty(ref farmCancellationState, value)) return;
            OnPropertyChanged(nameof(FarmCancellationMessage));
            OnPropertyChanged(nameof(FarmIsBusy));
        }
    }

    public bool FarmIsBusy => IsBusy && FarmCancellationState is
        DeviceFarmCancellationState.Running or DeviceFarmCancellationState.CancellationRequested;

    public string FarmCancellationMessage => FarmCancellationState switch
    {
        DeviceFarmCancellationState.Running => "Farm operation is running. Cancellation releases work owned by the host.",
        DeviceFarmCancellationState.CancellationRequested => "Cancellation requested; waiting for workers and process cleanup.",
        DeviceFarmCancellationState.Completed => "Farm operation completed; inspect per-device evidence below.",
        DeviceFarmCancellationState.Blocked => "Farm operation is blocked and no device result was fabricated.",
        _ => "No farm operation is active."
    };

    public int SelectedFarmDeviceCount => FarmDevices.Count(item => item.IsSelected);

    public int EligibleSelectedFarmDeviceCount => FarmDevices.Count(item => item.IsSelected && item.IsEligible);

    public FarmDeviceItem? PrimaryFarmDevice => FarmDevices.FirstOrDefault(item => item.IsPrimary);

    public IReadOnlyList<FarmDeviceItem> FollowerFarmDevices =>
        FarmDevices.Where(item => item.IsFollower && item.IsSelected).ToArray();

    public string FarmSelectionSummary => SelectedFarmDeviceCount == 0
        ? "No devices selected. Discovery and selection are host-backed."
        : $"{SelectedFarmDeviceCount} selected · {EligibleSelectedFarmDeviceCount} eligible for execution.";

    public string PrimaryFollowerSummary => PrimaryFarmDevice is null
        ? "Select one primary device and at least one follower."
        : $"Primary: {PrimaryFarmDevice.DisplayName} · Followers: {FollowerFarmDevices.Count}";

    public string FarmRunCommandReason => CanStartFarmRun
        ? "Run the generated project through the host-owned device farm."
        : BuildFarmRunBlockReason();

    public string FarmRecordingCommandReason => CanStartPrimaryFollowerRecording
        ? "Record canonical actions from the primary and validate semantic locators on followers."
        : BuildFarmRecordingBlockReason();

    public string FarmGroupCommandReason => CanSaveFarmGroup
        ? "Persist the selected device IDs as a host-owned group."
        : farmWorkspaceStore is null
            ? "Group management is blocked until the native host provides an IFarmWorkspaceStore."
            : SelectedFarmDeviceCount == 0
                ? "Select at least one discovered device before saving a group."
                : "Enter a group name before saving the selected devices.";

    public bool CanDiscoverDevices => !IsBusy;

    public bool CanStartFarmRun
    {
        get
        {
            if (IsBusy || farmRunScheduler is null || CurrentSession is null || currentGeneratedProject is null)
                return false;
            if (RuntimeState != ShellAvailabilityState.Ready || SelectedFarmStrategy is null || SelectedFarmFailurePolicy is null)
                return false;
            if (FarmIterations < 1 || FarmMaxParallelDevices < 1 || FarmIterationDelaySeconds < 0)
                return false;

            var selected = FarmDevices.Where(item => item.IsSelected).ToArray();
            if (selected.Length == 0 || selected.Any(item => !item.IsEligible))
                return false;
            return SelectedFarmStrategy.Value == DeviceExecutionStrategy.Single
                ? selected.Length == 1
                : selected.Length >= 2;
        }
    }

    public bool CanStartPrimaryFollowerRecording
    {
        get
        {
            if (IsBusy || farmRecordingCoordinator is null || CurrentSession is null)
                return false;
            var primary = PrimaryFarmDevice;
            var followers = FollowerFarmDevices;
            return primary is not null
                && primary.IsEligible
                && followers.Count > 0
                && followers.All(item => item.IsEligible);
        }
    }

    public bool CanSaveFarmGroup => !IsBusy
        && farmWorkspaceStore is not null
        && SelectedFarmDeviceCount > 0
        && !string.IsNullOrWhiteSpace(FarmGroupName);

    public string WorkspaceStateMessage => WorkspaceState switch
    {
        ShellAvailabilityState.Empty => "No session is loaded. Create or open a persisted session to begin.",
        ShellAvailabilityState.Detected => CurrentSession is null ? "No session is loaded." : $"Loaded session: {CurrentSession.Name}",
        ShellAvailabilityState.Blocked => "The loaded session cannot be used until its validation errors are resolved.",
        _ => "Session setup is incomplete."
    };

    public string SessionStateMessage => SessionState switch
    {
        ShellAvailabilityState.Empty => "No persisted session is available.",
        ShellAvailabilityState.Detected => $"{CurrentSession?.Steps.Count ?? 0} persisted action(s) are available.",
        ShellAvailabilityState.Ready => "The session is valid and ready for the selected capability.",
        ShellAvailabilityState.Blocked => "The session contains invalid or cross-platform actions.",
        _ => "Complete session setup before recording or running."
    };

    public string CapabilityStateMessage => CapabilityState switch
    {
        ShellAvailabilityState.Empty => "No capability is selected.",
        ShellAvailabilityState.SetupRequired => "Select a platform and load a capability manifest.",
        ShellAvailabilityState.Detected => "A capability manifest is available for selection.",
        ShellAvailabilityState.Verified => "The selected capability comes from the loaded manifest.",
        ShellAvailabilityState.Ready => "The selected capability is ready for generation.",
        ShellAvailabilityState.Blocked => "The selected platform has no compatible capability manifest.",
        _ => "Capability setup is incomplete."
    };

    public string RuntimeStateMessage => RuntimeState switch
    {
        ShellAvailabilityState.Empty => "No runtime check has been requested.",
        ShellAvailabilityState.SetupRequired => "Select a capability, then check its local runtime pack.",
        ShellAvailabilityState.Missing => "A required runtime pack is missing or unavailable.",
        ShellAvailabilityState.Detected => "A runtime was detected but has not passed verification.",
        ShellAvailabilityState.Verified => "Runtime verification passed; required license metadata is still missing.",
        ShellAvailabilityState.Ready => "The selected runtime is available for this capability.",
        ShellAvailabilityState.Blocked => "Native execution is blocked because runtime resolution is unavailable or invalid.",
        _ => "Runtime setup is incomplete."
    };

    public string TimelineStatus => Timeline.Count == 0
        ? "No recorded actions are present in this persisted session."
        : $"{Timeline.Count} persisted action(s)";

    public string RecorderCommandReason => CanStartRecording
        ? "Record a user action through the configured recorder."
        : "Recording is blocked until a session, capability, verified runtime, target, and recorder service are available.";

    public string GenerateCommandReason => CanGenerate
        ? "Generate from the current AutomationSession and ActionIR."
        : "Generation is blocked until a loaded session, selected capability, and compatible generator are available.";

    public string RunCommandReason => CanRun
        ? "Run the current session through the application orchestrator."
        : "Running is blocked until session validation, capability selection, and verified runtime readiness succeed.";

    public bool CanStartRecording => !IsBusy
        && CurrentSession is not null
        && SelectedCapability is not null
        && RuntimeState == ShellAvailabilityState.Ready
        && !string.IsNullOrWhiteSpace(GetTarget())
        && recorder is not null;

    public bool CanRefreshRuntime => !IsBusy && SelectedCapability is not null && toolchainResolver is not null;

    public bool CanGenerate => !IsBusy
        && CurrentSession is not null
        && SelectedCapability is not null
        && generator is not null
        && generator.Manifest.Id == SelectedCapability.Manifest.Id
        && generator.Supports(CurrentSession);

    public bool CanRun => !IsBusy
        && CurrentSession is not null
        && SelectedCapability is not null
        && RuntimeState == ShellAvailabilityState.Ready
        && orchestrator is not null;

    public void LoadSession(AutomationSession session)
    {
        CurrentSession = session;
        currentGeneratedProject = null;
        GeneratedCode = string.Empty;
        OnPropertyChanged(nameof(HasGeneratedProject));
        SelectedPlatform = Platforms.FirstOrDefault(item => item.Value == session.Platform);
        RefreshTimeline();
        RefreshDerivedState();
        NotifyCommandStates();
    }

    public void SetLifecycleState(SessionLifecycleState state)
    {
        ActivityState = state switch
        {
            SessionLifecycleState.Ready => ShellAvailabilityState.Ready,
            SessionLifecycleState.Blocked => ShellAvailabilityState.Blocked,
            SessionLifecycleState.Recording or SessionLifecycleState.Generating or SessionLifecycleState.Running => ShellAvailabilityState.Detected,
            SessionLifecycleState.Passed => ShellAvailabilityState.Ready,
            _ => ShellAvailabilityState.SetupRequired
        };
        ActivityMessage = $"Session lifecycle: {state}.";
    }

    private void RefreshCapabilities()
    {
        FrameworkCapabilities.Clear();
        if (SelectedPlatform is null) return;

        foreach (var manifest in capabilityManifests.Where(item => item.Platform == SelectedPlatform.Value.Value))
            FrameworkCapabilities.Add(new ShellCapabilityOption(manifest));
    }

    private void RefreshTimeline()
    {
        Timeline.Clear();
        if (CurrentSession is null) return;
        foreach (var action in CurrentSession.Steps.OrderBy(item => item.StepNumber))
            Timeline.Add(new ShellTimelineItem(action));
        OnPropertyChanged(nameof(TimelineStatus));
    }

    private void RefreshDerivedState()
    {
        WorkspaceState = CurrentSession is null ? ShellAvailabilityState.Empty : ShellAvailabilityState.Detected;

        if (CurrentSession is null)
        {
            SessionState = ShellAvailabilityState.Empty;
        }
        else
        {
            var validationErrors = new SessionValidator().Validate(CurrentSession);
            SessionState = validationErrors.Count > 0
                ? ShellAvailabilityState.Blocked
                : CurrentSession.Steps.Count == 0 || CurrentSession.TargetConfig.Count == 0
                    ? ShellAvailabilityState.SetupRequired
                    : ShellAvailabilityState.Detected;
        }

        CapabilityState = SelectedCapability is not null
            ? ShellAvailabilityState.Detected
            : FrameworkCapabilities.Count > 0
                ? ShellAvailabilityState.Detected
                : SelectedPlatform is null
                    ? ShellAvailabilityState.SetupRequired
                    : ShellAvailabilityState.Missing;

        OnPropertyChanged(nameof(WorkspaceStateMessage));
        OnPropertyChanged(nameof(SessionStateMessage));
        OnPropertyChanged(nameof(CapabilityStateMessage));
        OnPropertyChanged(nameof(RecorderCommandReason));
        OnPropertyChanged(nameof(GenerateCommandReason));
        OnPropertyChanged(nameof(RunCommandReason));
        NotifyCommandStates();
    }

    private async Task DiscoverDevicesAsync()
    {
        if (deviceRegistry is null)
        {
            FarmDiscoveryState = ShellAvailabilityState.Blocked;
            FarmDiscoveryMessage = "Device discovery is blocked: the native host did not provide an IDeviceRegistry.";
            FarmActivityMessage = FarmDiscoveryMessage;
            FarmStatus = "Blocked";
            FarmCancellationState = DeviceFarmCancellationState.Blocked;
            NotifyCommandStates();
            return;
        }

        IsBusy = true;
        FarmCancellationState = DeviceFarmCancellationState.Running;
        FarmStatus = "Discovering";
        using var cancellation = BeginOperation();
        FarmDiscoveryState = ShellAvailabilityState.Detected;
        FarmDiscoveryMessage = "Discovering Android devices through the configured native host.";
        FarmActivityMessage = FarmDiscoveryMessage;
        try
        {
            var profiles = await deviceRegistry.DiscoverAsync(cancellation.Token);
            ReplaceFarmDevices(profiles);
            if (FarmDevices.Count == 0)
            {
                FarmDiscoveryState = ShellAvailabilityState.Blocked;
                FarmDiscoveryMessage = "No Android devices were returned by the host registry. No device data was synthesized.";
                FarmActivityMessage = FarmDiscoveryMessage;
                FarmStatus = "Blocked";
                FarmCancellationState = DeviceFarmCancellationState.Blocked;
            }
            else
            {
                FarmDiscoveryState = ShellAvailabilityState.Detected;
                FarmDiscoveryMessage = $"{FarmDevices.Count} device profile(s) returned by the host. Preflight is required before execution.";
                FarmActivityMessage = FarmDiscoveryMessage;
                FarmStatus = "Ready for selection";
                FarmCancellationState = DeviceFarmCancellationState.Completed;
            }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            FarmDiscoveryState = ShellAvailabilityState.Blocked;
            FarmDiscoveryMessage = "Device discovery was cancelled.";
            FarmActivityMessage = FarmDiscoveryMessage;
            FarmStatus = "Cancelled";
            FarmCancellationState = DeviceFarmCancellationState.Completed;
        }
        catch (AutomationException exception)
        {
            FarmDiscoveryState = ShellAvailabilityState.Blocked;
            FarmDiscoveryMessage = exception.Message;
            FarmActivityMessage = exception.Message;
            FarmStatus = "Blocked";
            FarmCancellationState = DeviceFarmCancellationState.Blocked;
        }
        finally
        {
            IsBusy = false;
            NotifyCommandStates();
        }
    }

    private async Task RunFarmAsync()
    {
        if (!CanStartFarmRun || CurrentSession is null || currentGeneratedProject is null || farmRunScheduler is null)
        {
            SetFarmBlocked(FarmRunCommandReason);
            return;
        }

        if (!TryBuildFarmRunSpec(CurrentSession, out var specification, out var validationMessage))
        {
            SetFarmBlocked(validationMessage);
            return;
        }

        IsBusy = true;
        FarmCancellationState = DeviceFarmCancellationState.Running;
        FarmStatus = "Running";
        FarmCompletion = "Pending";
        FarmActivityMessage = "Farm workers are executing through the configured native scheduler.";
        FarmEvidenceSummary = "Evidence is pending from the host scheduler; no result is inferred.";
        using var cancellation = BeginOperation();
        try
        {
            var report = await farmRunScheduler.RunAsync(
                new FarmRunRequest
                {
                    Session = CurrentSession,
                    Project = currentGeneratedProject,
                    Specification = specification
                },
                cancellation.Token);

            ApplyFarmReport(report);
            FarmCancellationState = DeviceFarmCancellationState.Completed;
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            FarmStatus = "Cancelled";
            FarmCompletion = "Partial";
            FarmActivityMessage = "Farm cancellation was requested; the host must finish process and lease cleanup.";
            FarmEvidenceSummary = "No synthetic completion was recorded. Inspect host cleanup evidence.";
            FarmCancellationState = DeviceFarmCancellationState.Completed;
        }
        catch (AutomationException exception)
        {
            FarmStatus = exception.Code is AutomationErrorCode.DeviceUnavailable
                or AutomationErrorCode.RuntimeMissing
                or AutomationErrorCode.ProjectPrerequisiteMissing
                ? "Blocked"
                : "Failed";
            FarmCompletion = "Partial";
            FarmActivityMessage = exception.Message;
            FarmEvidenceSummary = "The scheduler did not provide a completed farm report.";
            FarmCancellationState = FarmStatus == "Blocked"
                ? DeviceFarmCancellationState.Blocked
                : DeviceFarmCancellationState.Completed;
        }
        finally
        {
            IsBusy = false;
            NotifyCommandStates();
        }
    }

    private async Task SaveFarmGroupAsync()
    {
        if (!CanSaveFarmGroup)
        {
            SetFarmBlocked(FarmGroupCommandReason);
            return;
        }

        var selected = FarmDevices.Where(item => item.IsSelected).Select(item => item.DeviceId).ToArray();
        var name = FarmGroupName.Trim();
        var existing = FarmGroups.FirstOrDefault(item => item.Group.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        var group = new DeviceGroup
        {
            Id = existing?.Group.Id ?? Guid.NewGuid(),
            Name = name,
            DeviceIds = selected,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        IsBusy = true;
        using var cancellation = BeginOperation();
        try
        {
            await farmWorkspaceStore!.SaveDeviceGroupAsync(group, cancellation.Token);
            var option = new FarmGroupOption(group);
            if (existing is not null)
                FarmGroups[FarmGroups.IndexOf(existing)] = option;
            else
                FarmGroups.Add(option);
            SelectedFarmGroup = option;
            FarmGroupName = string.Empty;
            FarmStatus = "Group saved";
            FarmCompletion = "Complete";
            FarmActivityMessage = $"Persisted device group '{group.Name}' with {group.DeviceIds.Count} device(s).";
            FarmEvidenceSummary = "Group metadata was persisted; no execution result was inferred.";
            FarmCancellationState = DeviceFarmCancellationState.Completed;
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            SetFarmBlocked("Group save was cancelled before persistence completed.");
        }
        catch (AutomationException exception)
        {
            SetFarmBlocked(exception.Message);
        }
        catch (Exception exception)
        {
            SetFarmBlocked($"Group save failed: {exception.Message}");
        }
        finally
        {
            IsBusy = false;
            NotifyCommandStates();
        }
    }

    private async Task StartPrimaryFollowerRecordingAsync()
    {
        if (!CanStartPrimaryFollowerRecording || CurrentSession is null || farmRecordingCoordinator is null)
        {
            SetFarmBlocked(FarmRecordingCommandReason);
            return;
        }

        var primary = PrimaryFarmDevice;
        if (primary is null)
        {
            SetFarmBlocked("Primary recording is blocked until a primary device is selected.");
            return;
        }

        IsBusy = true;
        FarmCancellationState = DeviceFarmCancellationState.Running;
        FarmStatus = "Recording";
        FarmCompletion = "Pending";
        FarmActivityMessage = "Recording from the primary device and validating follower locators through the host.";
        FarmEvidenceSummary = "Follower observations are pending; no coordinate broadcast is performed by the UI.";
        FarmObservations.Clear();
        using var cancellation = BeginOperation();
        try
        {
            var steps = CurrentSession.Steps.ToList();
            var plan = new DeviceFarmRecordingPlan
            {
                SessionId = CurrentSession.Id,
                PrimaryDeviceId = primary.DeviceId,
                FollowerDeviceIds = FollowerFarmDevices.Select(item => item.DeviceId).ToArray()
            };

            await foreach (var update in farmRecordingCoordinator
                               .RecordAsync(plan, cancellation.Token)
                               .WithCancellation(cancellation.Token))
            {
                if (update.PrimaryAction is not null)
                {
                    steps.Add(update.PrimaryAction with { StepNumber = steps.Count + 1 });
                    CurrentSession = CurrentSession with
                    {
                        Steps = steps,
                        UpdatedAt = DateTimeOffset.UtcNow
                    };
                    RefreshTimeline();
                    if (workspaceStore is not null)
                        await workspaceStore.SaveSessionAsync(CurrentSession, cancellation.Token);
                }

                foreach (var observation in update.Observations)
                    FarmObservations.Add(new FarmObservationItem(observation));
            }

            FarmStatus = "Recording completed";
            FarmCompletion = "Complete";
            FarmActivityMessage = "Primary actions were persisted; follower observations remain separate evidence.";
            FarmEvidenceSummary = $"{FarmObservations.Count} follower observation(s) received.";
            FarmCancellationState = DeviceFarmCancellationState.Completed;
            RefreshDerivedState();
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            FarmStatus = "Cancelled";
            FarmCompletion = "Partial";
            FarmActivityMessage = "Recording cancellation was requested; persisted primary actions remain available.";
            FarmEvidenceSummary = "No synthetic follower result was added after cancellation.";
            FarmCancellationState = DeviceFarmCancellationState.Completed;
        }
        catch (AutomationException exception)
        {
            FarmStatus = exception.Code is AutomationErrorCode.DeviceUnavailable
                or AutomationErrorCode.RuntimeMissing
                or AutomationErrorCode.ProjectPrerequisiteMissing
                ? "Blocked"
                : "Failed";
            FarmCompletion = "Partial";
            FarmActivityMessage = exception.Message;
            FarmEvidenceSummary = "The recording coordinator did not provide a completed result.";
            FarmCancellationState = FarmStatus == "Blocked"
                ? DeviceFarmCancellationState.Blocked
                : DeviceFarmCancellationState.Completed;
        }
        finally
        {
            IsBusy = false;
            NotifyCommandStates();
        }
    }

    private bool TryBuildFarmRunSpec(
        AutomationSession session,
        out FarmRunSpec specification,
        out string validationMessage)
    {
        specification = new FarmRunSpec { SessionId = session.Id };
        validationMessage = string.Empty;

        if (SelectedFarmStrategy is null || SelectedFarmFailurePolicy is null)
        {
            validationMessage = "Farm replay is blocked until a strategy and failure policy are selected.";
            return false;
        }

        if (!TryGetPositiveInteger(FarmIterations, out var iterations)
            || !TryGetPositiveInteger(FarmMaxParallelDevices, out var maxParallelDevices)
            || !double.IsFinite(FarmIterationDelaySeconds)
            || FarmIterationDelaySeconds < 0)
        {
            validationMessage = "Iterations, parallel devices, and delay must be finite non-negative values; iterations and parallel devices must be at least one.";
            return false;
        }

        var selected = FarmDevices.Where(item => item.IsSelected).ToArray();
        if (selected.Length == 0)
        {
            validationMessage = "Farm replay is blocked until at least one discovered device is selected.";
            return false;
        }

        if (selected.Any(item => !item.IsEligible))
        {
            validationMessage = "Farm replay is blocked because one or more selected devices have not passed authorization and health preflight.";
            return false;
        }

        if (SelectedFarmStrategy.Value != DeviceExecutionStrategy.Single && selected.Length < 2)
        {
            validationMessage = "All-devices and split-iterations require at least two eligible selected devices.";
            return false;
        }

        if (SelectedFarmStrategy.Value == DeviceExecutionStrategy.Single && selected.Length != 1)
        {
            validationMessage = "Single-device replay requires exactly one selected device.";
            return false;
        }

        var selectedIds = selected.Select(item => item.DeviceId).ToArray();
        var useSelectedGroup = SelectedFarmGroup is not null
            && SelectedFarmGroup.Group.DeviceIds.OrderBy(id => id).SequenceEqual(selectedIds.OrderBy(id => id));

        specification = new FarmRunSpec
        {
            SessionId = session.Id,
            Strategy = SelectedFarmStrategy.Value,
            DeviceGroupId = useSelectedGroup ? SelectedFarmGroup!.Group.Id : null,
            DeviceIds = useSelectedGroup ? [] : selectedIds,
            Iterations = iterations,
            IterationsPerDevice = SelectedFarmStrategy.Value == DeviceExecutionStrategy.SplitIterations ? null : iterations,
            TotalIterations = SelectedFarmStrategy.Value == DeviceExecutionStrategy.SplitIterations ? iterations : null,
            MaxParallelDevices = Math.Min(maxParallelDevices, selected.Length),
            IterationDelay = TimeSpan.FromSeconds(FarmIterationDelaySeconds),
            FailurePolicy = SelectedFarmFailurePolicy.Value,
            TargetPackage = GetTargetConfigString("appPackage"),
            TargetActivity = GetTargetConfigString("appActivity")
        };
        return true;
    }

    private void ReplaceFarmDevices(IEnumerable<DeviceProfile> profiles)
    {
        foreach (var item in FarmDevices)
            item.PropertyChanged -= FarmDevicePropertyChanged;

        FarmDevices.Clear();
        foreach (var profile in profiles)
        {
            var item = new FarmDeviceItem(profile);
            item.PropertyChanged += FarmDevicePropertyChanged;
            FarmDevices.Add(item);
        }

        ApplySelectedFarmGroup();
        OnFarmSelectionChanged();
    }

    private void ApplySelectedFarmGroup()
    {
        if (SelectedFarmGroup is null) return;
        var deviceIds = SelectedFarmGroup.Group.DeviceIds.ToHashSet();
        foreach (var item in FarmDevices)
        {
            item.IsSelected = deviceIds.Contains(item.DeviceId);
            item.IsPrimary = false;
            item.IsFollower = false;
        }
    }

    private void ClearFarmSelection()
    {
        foreach (var item in FarmDevices)
        {
            item.IsSelected = false;
            item.IsPrimary = false;
            item.IsFollower = false;
        }

        OnFarmSelectionChanged();
    }

    private void FarmDevicePropertyChanged(object? sender, PropertyChangedEventArgs args)
    {
        if (sender is not FarmDeviceItem item) return;

        if (args.PropertyName == nameof(FarmDeviceItem.IsPrimary) && item.IsPrimary)
        {
            item.IsSelected = true;
            item.IsFollower = false;
            foreach (var other in FarmDevices.Where(other => other != item))
                other.IsPrimary = false;
        }
        else if (args.PropertyName == nameof(FarmDeviceItem.IsFollower) && item.IsFollower)
        {
            item.IsSelected = true;
            item.IsPrimary = false;
        }
        else if (args.PropertyName == nameof(FarmDeviceItem.IsSelected) && !item.IsSelected)
        {
            item.IsPrimary = false;
            item.IsFollower = false;
        }

        OnFarmSelectionChanged();
    }

    private void OnFarmSelectionChanged()
    {
        OnPropertyChanged(nameof(SelectedFarmDeviceCount));
        OnPropertyChanged(nameof(EligibleSelectedFarmDeviceCount));
        OnPropertyChanged(nameof(PrimaryFarmDevice));
        OnPropertyChanged(nameof(FollowerFarmDevices));
        OnPropertyChanged(nameof(FarmSelectionSummary));
        OnPropertyChanged(nameof(PrimaryFollowerSummary));
        OnPropertyChanged(nameof(FarmRunCommandReason));
        OnPropertyChanged(nameof(FarmRecordingCommandReason));
        OnPropertyChanged(nameof(FarmGroupCommandReason));
        OnPropertyChanged(nameof(CanSaveFarmGroup));
        NotifyCommandStates();
    }

    private void ApplyFarmReport(FarmRunReport report)
    {
        FarmStatus = report.Status.ToString();
        FarmCompletion = report.Completion.ToString();
        FarmActivityMessage = string.IsNullOrWhiteSpace(report.Error)
            ? "Farm execution completed; per-device status and evidence are shown below."
            : report.Error;
        FarmEvidenceSummary = $"{report.PassedIterations}/{report.PlannedIterations} iteration(s) passed · "
            + $"{report.FailedIterations} failed · {report.BlockedIterations} blocked · "
            + $"{report.CancelledIterations} cancelled · {report.Artifacts.Count} artifact(s).";

        FarmObservations.Clear();
        foreach (var observation in report.Observations)
            FarmObservations.Add(new FarmObservationItem(observation));

        foreach (var item in FarmDevices)
        {
            var deviceRun = report.DeviceRuns.FirstOrDefault(run => run.DeviceId == item.DeviceId);
            var observationCount = report.Observations.Count(observation => observation.DeviceId == item.DeviceId);
            var artifactCount = deviceRun is null
                ? 0
                : report.Artifacts.Count(artifact => artifact.DeviceRunId == deviceRun.Id);
            item.ApplyRun(deviceRun, observationCount, artifactCount);
        }
    }

    private void SetFarmBlocked(string message)
    {
        FarmStatus = "Blocked";
        FarmCompletion = "Not available";
        FarmActivityMessage = message;
        FarmEvidenceSummary = "No fake device, run, or evidence result was created.";
        FarmCancellationState = DeviceFarmCancellationState.Blocked;
        OnPropertyChanged(nameof(FarmRunCommandReason));
        OnPropertyChanged(nameof(FarmRecordingCommandReason));
        NotifyCommandStates();
    }

    private string BuildFarmRunBlockReason()
    {
        if (farmRunScheduler is null)
            return "Farm replay is blocked: the native host did not provide an IFarmRunScheduler.";
        if (CurrentSession is null)
            return "Farm replay is blocked until a persisted AutomationSession is loaded.";
        if (currentGeneratedProject is null)
            return "Farm replay is blocked until the current session generates a project.";
        if (RuntimeState != ShellAvailabilityState.Ready)
            return "Farm replay is blocked until the selected capability has a verified local runtime.";
        if (SelectedFarmStrategy is null || SelectedFarmFailurePolicy is null)
            return "Select a replay strategy and failure policy.";
        if (SelectedFarmDeviceCount == 0)
            return "Select at least one discovered device.";
        if (EligibleSelectedFarmDeviceCount != SelectedFarmDeviceCount)
            return "All selected devices must pass host authorization and health preflight.";
        if (SelectedFarmStrategy.Value == DeviceExecutionStrategy.Single && SelectedFarmDeviceCount != 1)
            return "Single-device replay requires exactly one selected device.";
        if (SelectedFarmStrategy.Value != DeviceExecutionStrategy.Single && SelectedFarmDeviceCount < 2)
            return "All-devices and split-iterations require at least two eligible selected devices.";
        return "Enter valid replay settings before starting the farm.";
    }

    private string BuildFarmRecordingBlockReason()
    {
        if (farmRecordingCoordinator is null)
            return "Primary/follower recording is blocked: the native host did not provide a recording coordinator.";
        if (CurrentSession is null)
            return "Recording is blocked until a persisted AutomationSession is loaded.";
        if (PrimaryFarmDevice is null)
            return "Select one primary device.";
        if (!PrimaryFarmDevice.IsEligible || FollowerFarmDevices.Any(item => !item.IsEligible))
            return "The primary and every follower must pass host authorization and health preflight.";
        if (FollowerFarmDevices.Count == 0)
            return "Select at least one follower device.";
        return "Recording is unavailable while another operation is active.";
    }

    private static bool TryGetPositiveInteger(double value, out int result)
    {
        if (!double.IsFinite(value) || value < 1 || value > int.MaxValue || Math.Truncate(value) != value)
        {
            result = 0;
            return false;
        }

        result = (int)value;
        return true;
    }

    private async Task RefreshRuntimeAsync()
    {
        if (SelectedCapability is null || toolchainResolver is null)
        {
            RuntimeState = ShellAvailabilityState.Blocked;
            OnPropertyChanged(nameof(RuntimeStateMessage));
            SetActivity(ShellAvailabilityState.Blocked, "Runtime resolution is unavailable in this shell.");
            return;
        }

        IsBusy = true;
        using var cancellation = BeginOperation();
        try
        {
            var resolution = await toolchainResolver.ResolveAsync(SelectedCapability.Manifest, cancellation.Token);
            RuntimeState = GetRuntimeState(resolution);
            OnPropertyChanged(nameof(RuntimeStateMessage));
            SetActivity(RuntimeState, RuntimeStateMessage);
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            SetActivity(ShellAvailabilityState.Blocked, "Runtime verification was cancelled.");
        }
        catch (AutomationException exception)
        {
            RuntimeState = ShellAvailabilityState.Blocked;
            SetActivity(RuntimeState, exception.Message);
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task StartRecordingAsync()
    {
        if (!CanStartRecording || CurrentSession is null || recorder is null)
        {
            SetActivity(ShellAvailabilityState.Blocked, RecorderCommandReason);
            return;
        }

        IsBusy = true;
        using var cancellation = BeginOperation();
        try
        {
            SetActivity(ShellAvailabilityState.Detected, "Recording from the configured target.");
            var steps = CurrentSession.Steps.ToList();
            await foreach (var action in recorder.RecordAsync(
                               new RecorderOptions(CurrentSession.Platform, GetTarget(), GetDeviceId()),
                               cancellation.Token).WithCancellation(cancellation.Token))
            {
                steps.Add(action with { StepNumber = steps.Count + 1 });
                CurrentSession = CurrentSession with { Steps = steps, UpdatedAt = DateTimeOffset.UtcNow };
                RefreshTimeline();
                if (workspaceStore is not null)
                    await workspaceStore.SaveSessionAsync(CurrentSession, cancellation.Token);
            }

            SetActivity(ShellAvailabilityState.Ready, "Recording stopped with persisted session actions.");
            RefreshDerivedState();
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            SetActivity(ShellAvailabilityState.Blocked, "Recording was cancelled; recorded actions remain persisted.");
        }
        catch (AutomationException exception)
        {
            SetActivity(ShellAvailabilityState.Blocked, exception.Message);
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task GenerateAsync()
    {
        if (!CanGenerate || CurrentSession is null || generator is null)
        {
            SetActivity(ShellAvailabilityState.Blocked, GenerateCommandReason);
            return;
        }

        IsBusy = true;
        using var cancellation = BeginOperation();
        try
        {
            SetActivity(ShellAvailabilityState.Detected, "Generating from the current AutomationSession.");
            var validationErrors = new SessionValidator().Validate(CurrentSession);
            if (validationErrors.Count > 0)
                throw new AutomationException(AutomationErrorCode.CapabilityError, string.Join("; ", validationErrors));

            var project = await generator.GenerateAsync(CurrentSession, cancellation.Token);
            currentGeneratedProject = project;
            OnPropertyChanged(nameof(HasGeneratedProject));
            var entrypoint = project.Files.FirstOrDefault(file => file.RelativePath == project.Entrypoint);
            GeneratedCode = entrypoint?.Content ?? string.Empty;
            SetActivity(ShellAvailabilityState.Ready, $"Generated {project.Files.Count} file(s) from the persisted session.");
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            SetActivity(ShellAvailabilityState.Blocked, "Generation was cancelled.");
        }
        catch (AutomationException exception)
        {
            SetActivity(ShellAvailabilityState.Blocked, exception.Message);
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task RunAsync()
    {
        if (!CanRun || CurrentSession is null || orchestrator is null)
        {
            SetActivity(ShellAvailabilityState.Blocked, RunCommandReason);
            return;
        }

        IsBusy = true;
        using var cancellation = BeginOperation();
        try
        {
            SetActivity(ShellAvailabilityState.Detected, "Run requested through the application orchestrator.");
            await foreach (var runEvent in orchestrator.RunAsync(
                               CurrentSession,
                               new RunOptions { ExecutionMode = "functional" },
                               cancellation.Token).WithCancellation(cancellation.Token))
            {
                if (runEvent.Type is "blocked" or "error")
                {
                    SetActivity(ShellAvailabilityState.Blocked, runEvent.Message);
                    return;
                }
            }

            SetActivity(ShellAvailabilityState.Ready, "Run completed; inspect the persisted report for measured results.");
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            SetActivity(ShellAvailabilityState.Blocked, "Run was cancelled.");
        }
        catch (AutomationException exception)
        {
            SetActivity(ShellAvailabilityState.Blocked, exception.Message);
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task StopAsync()
    {
        if (FarmCancellationState == DeviceFarmCancellationState.Running)
        {
            FarmCancellationState = DeviceFarmCancellationState.CancellationRequested;
            FarmActivityMessage = "Cancellation requested; waiting for the host to release owned resources.";
        }
        operationCancellation?.Cancel();
        SetActivity(ShellAvailabilityState.Blocked, "Cancellation requested for the active operation.");
        await Task.CompletedTask;
    }

    private CancellationTokenSource BeginOperation()
    {
        operationCancellation?.Dispose();
        operationCancellation = new CancellationTokenSource();
        return operationCancellation;
    }

    private string? GetTarget()
    {
        if (CurrentSession is null) return null;
        foreach (var key in new[] { "startUrl", "baseUrl", "appPackage", "appActivity" })
        {
            if (CurrentSession.TargetConfig.TryGetValue(key, out var value) && value is not null)
                return value.ToString();
        }
        return null;
    }

    private string? GetTargetConfigString(string key)
    {
        if (CurrentSession is null) return null;
        return CurrentSession.TargetConfig.TryGetValue(key, out var value)
            ? value?.ToString()
            : null;
    }

    private string? GetDeviceId()
    {
        if (CurrentSession is null) return null;
        foreach (var key in new[] { "deviceId", "serial" })
        {
            if (CurrentSession.TargetConfig.TryGetValue(key, out var value) && value is not null)
                return value.ToString();
        }
        return null;
    }

    private static ShellAvailabilityState GetRuntimeState(ToolchainResolution resolution)
    {
        if (!resolution.Available)
            return resolution.Missing.Count > 0 ? ShellAvailabilityState.Missing : ShellAvailabilityState.Detected;
        if (string.IsNullOrWhiteSpace(resolution.ExecutablePath)) return ShellAvailabilityState.Blocked;
        if (string.IsNullOrWhiteSpace(resolution.LicensePath)) return ShellAvailabilityState.Verified;
        return ShellAvailabilityState.Ready;
    }

    private void SetActivity(ShellAvailabilityState state, string message)
    {
        ActivityState = state;
        ActivityMessage = message;
        OnPropertyChanged(nameof(RuntimeStateMessage));
        OnPropertyChanged(nameof(RecorderCommandReason));
        OnPropertyChanged(nameof(GenerateCommandReason));
        OnPropertyChanged(nameof(RunCommandReason));
        NotifyCommandStates();
    }

    private void NotifyCommandStates()
    {
        OnPropertyChanged(nameof(CanStartRecording));
        OnPropertyChanged(nameof(CanRefreshRuntime));
        OnPropertyChanged(nameof(CanGenerate));
        OnPropertyChanged(nameof(CanRun));
        OnPropertyChanged(nameof(CanSaveFarmGroup));
        OnPropertyChanged(nameof(FarmGroupCommandReason));
        (StartRecordingCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (StopCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (RefreshRuntimeCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (GenerateCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (RunCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (DiscoverDevicesCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (StartFarmRunCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (StartPrimaryFollowerRecordingCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (SaveFarmGroupCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
    }

    private bool SetProperty<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        OnPropertyChanged(propertyName);
        return true;
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));

    private abstract class RelayCommandBase : ICommand
    {
        public event EventHandler? CanExecuteChanged;
        public abstract bool CanExecute(object? parameter);
        public abstract void Execute(object? parameter);
        public void RaiseCanExecuteChanged() => CanExecuteChanged?.Invoke(this, EventArgs.Empty);
    }

    private sealed class RelayCommand(Action<object?> execute) : RelayCommandBase
    {
        public override bool CanExecute(object? parameter) => true;
        public override void Execute(object? parameter) => execute(parameter);
    }

    private sealed class AsyncRelayCommand(Func<Task> execute, Func<bool> canExecute) : RelayCommandBase
    {
        private bool executing;

        public override bool CanExecute(object? parameter) => !executing && canExecute();

        public override async void Execute(object? parameter)
        {
            if (!CanExecute(parameter)) return;
            executing = true;
            RaiseCanExecuteChanged();
            try { await execute(); }
            finally
            {
                executing = false;
                RaiseCanExecuteChanged();
            }
        }
    }
}
