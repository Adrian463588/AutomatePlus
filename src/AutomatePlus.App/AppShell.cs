using AutomatePlus.Domain;
using AutomatePlus.Application;

namespace AutomatePlus.App;

/// Composition root for the WinUI 3 shell. Views and ViewModels depend on
/// application ports; process, ADB, SQLite, and secret implementations remain
/// behind the host boundary.
public sealed class AppShell
{
    public AppShell(
        ShellViewModel? viewModel = null,
        IDeviceRegistry? deviceRegistry = null,
        IFarmRunScheduler? farmRunScheduler = null,
        IDeviceFarmRecordingCoordinator? farmRecordingCoordinator = null,
        IFarmWorkspaceStore? farmWorkspaceStore = null,
        IEnumerable<DeviceGroup>? deviceGroups = null)
    {
        ViewModel = viewModel ?? new ShellViewModel(
            deviceRegistry: deviceRegistry,
            farmRunScheduler: farmRunScheduler,
            farmRecordingCoordinator: farmRecordingCoordinator,
            farmWorkspaceStore: farmWorkspaceStore,
            deviceGroups: deviceGroups);
    }

    public ShellViewModel ViewModel { get; }

    public SessionLifecycleState State { get; private set; } = SessionLifecycleState.Draft;

    public void SetState(SessionLifecycleState state)
    {
        State = state;
        ViewModel.SetLifecycleState(state);
    }
}
