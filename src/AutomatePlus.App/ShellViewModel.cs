using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using AutomatePlus.Application;
using AutomatePlus.Domain;

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
    private readonly IReadOnlyList<CapabilityManifest> capabilityManifests;
    private CancellationTokenSource? operationCancellation;
    private AutomationSession? currentSession;
    private ShellPlatformOption? selectedPlatform;
    private ShellCapabilityOption? selectedCapability;
    private ShellNavigationItem? selectedNavigationItem;
    private ShellAvailabilityState workspaceState = ShellAvailabilityState.Empty;
    private ShellAvailabilityState sessionState = ShellAvailabilityState.Empty;
    private ShellAvailabilityState capabilityState = ShellAvailabilityState.SetupRequired;
    private ShellAvailabilityState runtimeState = ShellAvailabilityState.Blocked;
    private ShellAvailabilityState activityState = ShellAvailabilityState.Blocked;
    private string activityMessage = "Native execution is blocked: no verified runtime resolver is configured.";
    private string generatedCode = string.Empty;
    private bool isBusy;

    public ShellViewModel(
        IEnumerable<CapabilityManifest>? capabilityManifests = null,
        IToolchainResolver? toolchainResolver = null,
        IRecorder? recorder = null,
        ICodeGenerator? generator = null,
        AutomationOrchestrator? orchestrator = null,
        IWorkspaceStore? workspaceStore = null,
        AutomationSession? session = null)
    {
        this.toolchainResolver = toolchainResolver;
        this.recorder = recorder;
        this.generator = generator;
        this.orchestrator = orchestrator;
        this.workspaceStore = workspaceStore;
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

        SelectNavigationItemCommand = new RelayCommand(item => SelectedNavigationItem = item as ShellNavigationItem);
        StartRecordingCommand = new AsyncRelayCommand(StartRecordingAsync, () => CanStartRecording);
        StopCommand = new AsyncRelayCommand(StopAsync, () => IsBusy);
        RefreshRuntimeCommand = new AsyncRelayCommand(RefreshRuntimeAsync, () => CanRefreshRuntime);
        GenerateCommand = new AsyncRelayCommand(GenerateAsync, () => CanGenerate);
        RunCommand = new AsyncRelayCommand(RunAsync, () => CanRun);

        SelectedNavigationItem = NavigationItems[0];
        if (session is not null) LoadSession(session);
        else RefreshDerivedState();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public ObservableCollection<ShellNavigationItem> NavigationItems { get; }
    public ObservableCollection<ShellPlatformOption> Platforms { get; }
    public ObservableCollection<ShellCapabilityOption> FrameworkCapabilities { get; }
    public ObservableCollection<ShellTimelineItem> Timeline { get; }

    public ICommand SelectNavigationItemCommand { get; }
    public ICommand StartRecordingCommand { get; }
    public ICommand StopCommand { get; }
    public ICommand RefreshRuntimeCommand { get; }
    public ICommand GenerateCommand { get; }
    public ICommand RunCommand { get; }

    public ShellNavigationItem? SelectedNavigationItem
    {
        get => selectedNavigationItem;
        set => SetProperty(ref selectedNavigationItem, value);
    }

    public ShellPlatformOption? SelectedPlatform
    {
        get => selectedPlatform;
        set
        {
            if (!SetProperty(ref selectedPlatform, value)) return;
            selectedCapability = null;
            OnPropertyChanged(nameof(SelectedCapability));
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
            NotifyCommandStates();
        }
    }

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
        GeneratedCode = string.Empty;
        SelectedPlatform = Platforms.FirstOrDefault(item => item.Value == session.Platform);
        RefreshTimeline();
        RefreshDerivedState();
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
        (StartRecordingCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (StopCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (RefreshRuntimeCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (GenerateCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
        (RunCommand as RelayCommandBase)?.RaiseCanExecuteChanged();
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
