using AutomatePlus.Domain;
using AutomatePlus.Application;

namespace AutomatePlus.App;

/// Composition root for the WinUI 3 shell. Views and ViewModels depend on
/// application ports; process, ADB, SQLite, and secret implementations remain
/// behind the host boundary.
public sealed class AppShell
{
    public SessionLifecycleState State { get; private set; } = SessionLifecycleState.Draft;

    public void SetState(SessionLifecycleState state) => State = state;
}
