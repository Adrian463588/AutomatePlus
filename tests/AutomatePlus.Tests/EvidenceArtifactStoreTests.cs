using AutomatePlus.Infrastructure;

namespace AutomatePlus.Tests;

public sealed class EvidenceArtifactStoreTests
{
    [Fact]
    public async Task Writes_isolated_hashed_artifact_under_farm_device_run_path()
    {
        var root = Path.Combine(Path.GetTempPath(), "automate-plus-evidence", Guid.NewGuid().ToString("N"));
        try
        {
            var farmRunId = Guid.NewGuid();
            var deviceId = Guid.NewGuid();
            var deviceRunId = Guid.NewGuid();
            await using var content = new MemoryStream("real evidence bytes"u8.ToArray());
            var store = new EvidenceArtifactStore(root);

            var artifact = await store.WriteAsync(farmRunId, deviceId, deviceRunId, null, "log.txt", content, CancellationToken.None);
            var path = Path.Combine(root, artifact.RelativePath.Replace('/', Path.DirectorySeparatorChar));

            Assert.True(File.Exists(path));
            Assert.Contains(farmRunId.ToString("D"), artifact.RelativePath, StringComparison.Ordinal);
            Assert.Contains(deviceId.ToString("D"), artifact.RelativePath, StringComparison.Ordinal);
            Assert.Equal("real evidence bytes", await File.ReadAllTextAsync(path));
            Assert.Equal("2587308ca96a11d5070d2b97151cdee9e831480d14d92e8e8ed66ea8fe8d78fb", artifact.Sha256);
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }
}
