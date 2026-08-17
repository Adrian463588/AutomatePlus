using System.Diagnostics;
using System.ComponentModel;
using System.Text;
using AutomatePlus.Domain;

namespace AutomatePlus.Infrastructure;

public sealed record ProcessHostResult(int ExitCode, string Stdout, string Stderr, TimeSpan Duration);

public sealed class ProcessHost
{
    private static readonly HashSet<string> DefaultAllowlist = new(StringComparer.OrdinalIgnoreCase)
    {
        "adb", "adb.exe", "appium", "appium.cmd", "scrcpy", "scrcpy.exe", "cypress", "cypress.cmd", "dotnet", "dotnet.exe", "java", "java.exe",
        "k6", "k6.exe", "node", "node.exe", "playwright", "playwright.cmd", "python", "python.exe", "robot", "robot.exe"
    };

    private readonly IReadOnlySet<string> allowlist;

    public ProcessHost(IEnumerable<string>? allowlistedExecutables = null)
    {
        allowlist = new HashSet<string>(allowlistedExecutables ?? DefaultAllowlist, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<ProcessHostResult> RunAsync(
        string executablePath,
        IEnumerable<string> arguments,
        string workingDirectory,
        IReadOnlyDictionary<string, string>? environment,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        if (!allowlist.Contains(Path.GetFileName(executablePath)))
            throw new AutomationException(AutomationErrorCode.PathDenied, $"Executable is not allowlisted: {executablePath}");
        var canonicalWorkingDirectory = Path.GetFullPath(workingDirectory);
        if (!Directory.Exists(canonicalWorkingDirectory))
            throw new AutomationException(AutomationErrorCode.PathDenied, $"Working directory does not exist: {canonicalWorkingDirectory}");
        if (timeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(timeout));

        var info = new ProcessStartInfo
        {
            FileName = executablePath,
            WorkingDirectory = canonicalWorkingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        if (environment is not null)
            foreach (var pair in environment) info.Environment[pair.Key] = pair.Value;

        using var process = new Process { StartInfo = info, EnableRaisingEvents = true };
        try
        {
            if (!process.Start()) throw new AutomationException(AutomationErrorCode.RuntimeMissing, $"Unable to start {executablePath}");
        }
        catch (Win32Exception exception)
        {
            throw new AutomationException(AutomationErrorCode.RuntimeMissing, $"Unable to start {executablePath}", inner: exception);
        }

        var stopwatch = Stopwatch.StartNew();
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(timeout);
        try
        {
            var stdoutTask = process.StandardOutput.ReadToEndAsync(timeoutCts.Token);
            var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token);
            await process.WaitForExitAsync(timeoutCts.Token);
            var stdout = Redact(await stdoutTask);
            var stderr = Redact(await stderrTask);
            return new ProcessHostResult(process.ExitCode, stdout, stderr, stopwatch.Elapsed);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            KillTree(process);
            throw new AutomationException(AutomationErrorCode.Cancelled, $"Process cancelled: {executablePath}");
        }
        catch (OperationCanceledException)
        {
            KillTree(process);
            throw new AutomationException(AutomationErrorCode.ProcessTimeout, $"Process timeout: {executablePath}", new Dictionary<string, object?> { ["timeoutMs"] = timeout.TotalMilliseconds });
        }
        finally
        {
            if (!process.HasExited) KillTree(process);
        }
    }

    private static void KillTree(Process process)
    {
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
    }

    private static string Redact(string value)
    {
        if (string.IsNullOrEmpty(value)) return value;
        return System.Text.RegularExpressions.Regex.Replace(value, "(?i)(password|token|secret|authorization)(\\s*[:=]\\s*)[^\\s,;]+", "$1$2[REDACTED]");
    }
}
