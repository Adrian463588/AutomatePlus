using System.Security.Cryptography;
using System.Text.RegularExpressions;
using AutomatePlus.Domain;

namespace AutomatePlus.Infrastructure;

public sealed class EvidenceArtifactStore : IEvidenceArtifactStore
{
    private static readonly Regex SafeKind = new("^[A-Za-z0-9._-]+$", RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private readonly string rootDirectory;

    public EvidenceArtifactStore(string rootDirectory)
    {
        this.rootDirectory = Path.GetFullPath(rootDirectory);
        Directory.CreateDirectory(this.rootDirectory);
    }

    public async Task<ArtifactReference> WriteAsync(
        Guid farmRunId,
        Guid deviceId,
        Guid deviceRunId,
        Guid? iterationId,
        string kind,
        Stream content,
        CancellationToken cancellationToken)
    {
        if (farmRunId == Guid.Empty || deviceId == Guid.Empty || deviceRunId == Guid.Empty)
            throw new ArgumentException("Farm and device identifiers are required.");
        if (iterationId == Guid.Empty)
            throw new ArgumentException("Iteration identifier must be null or a UUID.", nameof(iterationId));
        if (string.IsNullOrWhiteSpace(kind) || !SafeKind.IsMatch(kind))
            throw new ArgumentException("Artifact kind contains unsupported path characters.", nameof(kind));
        ArgumentNullException.ThrowIfNull(content);

        var artifactId = Guid.NewGuid();
        var iterationDirectory = iterationId?.ToString("D") ?? "run";
        var relativePath = Path.Combine(
            "runs",
            farmRunId.ToString("D"),
            deviceId.ToString("D"),
            deviceRunId.ToString("D"),
            iterationDirectory,
            $"{artifactId:N}-{kind}");
        var targetPath = ResolveWithinRoot(relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);
        var temporaryPath = $"{targetPath}.tmp-{Guid.NewGuid():N}";

        try
        {
            await using (var output = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 64 * 1024,
                options: FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                await content.CopyToAsync(output, cancellationToken);
                await output.FlushAsync(cancellationToken);
            }

            byte[] hash;
            await using (var hashInput = new FileStream(
                temporaryPath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read,
                bufferSize: 64 * 1024,
                options: FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                hash = await SHA256.HashDataAsync(hashInput, cancellationToken);
            }
            File.Move(temporaryPath, targetPath);

            return new ArtifactReference
            {
                Id = artifactId,
                FarmRunId = farmRunId,
                DeviceRunId = deviceRunId,
                IterationId = iterationId,
                Kind = kind,
                RelativePath = relativePath.Replace(Path.DirectorySeparatorChar, '/'),
                Sha256 = Convert.ToHexString(hash).ToLowerInvariant(),
                CreatedAt = DateTimeOffset.UtcNow
            };
        }
        catch
        {
            if (File.Exists(temporaryPath))
                File.Delete(temporaryPath);
            throw;
        }
    }

    private string ResolveWithinRoot(string relativePath)
    {
        var candidate = Path.GetFullPath(Path.Combine(rootDirectory, relativePath));
        var rootWithSeparator = rootDirectory.EndsWith(Path.DirectorySeparatorChar)
            ? rootDirectory
            : rootDirectory + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase))
            throw new AutomationException(AutomationErrorCode.PathDenied, "Evidence path escapes the configured workspace.");
        return candidate;
    }
}
