using Microsoft.UI.Xaml;

namespace AutomatePlus.App;

public partial class MainWindow : Window
{
    private readonly AppShell shell;

    public MainWindow(AppShell? shell = null)
    {
        this.shell = shell ?? new AppShell();
        InitializeComponent();
        ContentRoot.DataContext = this.shell.ViewModel;
    }
}
