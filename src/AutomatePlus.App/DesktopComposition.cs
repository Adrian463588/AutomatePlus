using System.Diagnostics;
using AutomatePlus.Domain;
using AutomatePlus.Infrastructure;

namespace AutomatePlus.App;

/// <summary>
/// Creates the real desktop-bound services that are available without a
/// verified execution runtime. Missing runners are intentionally left absent
/// so the shell exposes a blocked state instead of reporting a simulated pass.
/// </summary>
internal sealed class DesktopComposition : IAsyncDisposable
{
    private readonly SqliteWorkspaceStore? workspaceStore;

    private DesktopComposition(AppShell shell, SqliteWorkspaceStore? workspaceStore)
    {
        Shell = shell;
        this.workspaceStore = workspaceStore;
    }

    public AppShell Shell { get; }

    public static async Task<DesktopComposition> CreateAsync(CancellationToken cancellationToken)
    {
        var dataRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "AutomatePlus");
        Directory.CreateDirectory(dataRoot);

        SqliteWorkspaceStore? workspaceStore = null;
        IReadOnlyList<DeviceGroup> deviceGroups = [];
        try
        {
            var candidate = new SqliteWorkspaceStore(Path.Combine(dataRoot, "workspace.db"));
            try
            {
                await candidate.InitializeAsync(cancellationToken);
                workspaceStore = candidate;
                deviceGroups = await candidate.GetDeviceGroupsAsync(cancellationToken);
            }
            catch
            {
                await candidate.DisposeAsync();
                throw;
            }
        }
        catch (Exception exception)
        {
            Debug.WriteLine($"AutomatePlus workspace persistence is unavailable: {exception}");
        }

        var processHost = new ProcessHost();
        var adbExecutor = new ProcessHostAdbCommandExecutor(processHost, "adb.exe", dataRoot);
        var deviceRegistry = new AdbDeviceRegistry(adbExecutor, workspaceStore);

        return new DesktopComposition(
            new AppShell(
                deviceRegistry: deviceRegistry,
                farmWorkspaceStore: workspaceStore,
                deviceGroups: deviceGroups),
            workspaceStore);
    }

    public async ValueTask DisposeAsync()
    {
        if (workspaceStore is not null)
            await workspaceStore.DisposeAsync();
    }
}
