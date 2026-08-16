using System.Security.Cryptography;
using System.Text;
using AutomatePlus.Domain;

namespace AutomatePlus.Infrastructure;

public sealed class DpapiSecretStore
{
    private readonly string rootDirectory;

    public DpapiSecretStore(string rootDirectory)
    {
        this.rootDirectory = Path.GetFullPath(rootDirectory);
        Directory.CreateDirectory(this.rootDirectory);
    }

    public async Task SaveAsync(SecretReference reference, string value, CancellationToken cancellationToken)
    {
        ValidateKey(reference.Key);
        var protectedValue = ProtectedData.Protect(Encoding.UTF8.GetBytes(value), null, DataProtectionScope.CurrentUser);
        await File.WriteAllBytesAsync(Path.Combine(rootDirectory, $"{reference.Key}.bin"), protectedValue, cancellationToken);
    }

    public async Task<string> ResolveAsync(SecretReference reference, CancellationToken cancellationToken)
    {
        ValidateKey(reference.Key);
        var path = Path.Combine(rootDirectory, $"{reference.Key}.bin");
        if (!File.Exists(path)) throw new AutomationException(AutomationErrorCode.RuntimeMissing, $"Secret is not available: {reference.Key}");
        var encrypted = await File.ReadAllBytesAsync(path, cancellationToken);
        return Encoding.UTF8.GetString(ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser));
    }

    private static void ValidateKey(string key)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(key, "^[A-Za-z][A-Za-z0-9_.:-]{0,127}$"))
            throw new AutomationException(AutomationErrorCode.PathDenied, "Secret key is not a safe identifier");
    }
}
