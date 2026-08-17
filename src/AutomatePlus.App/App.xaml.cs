using System.Diagnostics;
using Microsoft.UI.Xaml;

namespace AutomatePlus.App;

public partial class App : Application
{
    private Window? _window;
    private DesktopComposition? _composition;

    public App()
    {
        InitializeComponent();
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            _composition = await DesktopComposition.CreateAsync(CancellationToken.None);
            _window = new MainWindow(_composition.Shell);
        }
        catch (Exception exception)
        {
            Debug.WriteLine($"AutomatePlus composition failed: {exception}");
            _window = new MainWindow();
        }

        _window.Activate();
    }
}
