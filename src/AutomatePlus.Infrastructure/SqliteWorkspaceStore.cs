using System.Text.Json;
using AutomatePlus.Domain;
using Microsoft.Data.Sqlite;

namespace AutomatePlus.Infrastructure;

public sealed class SqliteWorkspaceStore : IWorkspaceStore, IAsyncDisposable
{
    private readonly string databasePath;
    private readonly JsonSerializerOptions jsonOptions = new(JsonSerializerDefaults.Web);
    private SqliteConnection? connection;

    public SqliteWorkspaceStore(string databasePath)
    {
        this.databasePath = Path.GetFullPath(databasePath);
        Directory.CreateDirectory(Path.GetDirectoryName(this.databasePath)!);
    }

    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = databasePath, Mode = SqliteOpenMode.ReadWriteCreate }.ToString());
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, platform TEXT NOT NULL, name TEXT NOT NULL, ir_json TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, status TEXT NOT NULL, summary_json TEXT NOT NULL, finished_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_runs_session_id ON runs(session_id);
            """;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task SaveSessionAsync(AutomationSession session, CancellationToken cancellationToken)
    {
        var db = RequireConnection();
        await using var command = db.CreateCommand();
        command.CommandText = """
            INSERT INTO sessions (id, project_id, platform, name, ir_json, updated_at)
            VALUES ($id, $projectId, $platform, $name, $ir, $updatedAt)
            ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, platform = excluded.platform,
              name = excluded.name, ir_json = excluded.ir_json, updated_at = excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$id", session.Id.ToString("D"));
        command.Parameters.AddWithValue("$projectId", session.ProjectId.ToString("D"));
        command.Parameters.AddWithValue("$platform", session.Platform.ToString());
        command.Parameters.AddWithValue("$name", session.Name);
        command.Parameters.AddWithValue("$ir", JsonSerializer.Serialize(session, jsonOptions));
        command.Parameters.AddWithValue("$updatedAt", session.UpdatedAt.UtcDateTime.ToString("O"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<AutomationSession?> GetSessionAsync(Guid id, CancellationToken cancellationToken)
    {
        var db = RequireConnection();
        await using var command = db.CreateCommand();
        command.CommandText = "SELECT ir_json FROM sessions WHERE id = $id";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value is string json ? JsonSerializer.Deserialize<AutomationSession>(json, jsonOptions) : null;
    }

    public async Task SaveRunAsync(RunSummary summary, CancellationToken cancellationToken)
    {
        var db = RequireConnection();
        await using var command = db.CreateCommand();
        command.CommandText = """
            INSERT INTO runs (id, session_id, status, summary_json, finished_at)
            VALUES ($id, $sessionId, $status, $summary, $finishedAt)
            ON CONFLICT(id) DO UPDATE SET status = excluded.status, summary_json = excluded.summary_json, finished_at = excluded.finished_at;
            """;
        command.Parameters.AddWithValue("$id", summary.RunId.ToString("D"));
        command.Parameters.AddWithValue("$sessionId", summary.SessionId.ToString("D"));
        command.Parameters.AddWithValue("$status", summary.Status.ToString());
        command.Parameters.AddWithValue("$summary", JsonSerializer.Serialize(summary, jsonOptions));
        command.Parameters.AddWithValue("$finishedAt", DateTimeOffset.UtcNow.ToString("O"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (connection is not null) await connection.DisposeAsync();
    }

    private SqliteConnection RequireConnection() => connection ?? throw new InvalidOperationException("Workspace store has not been initialized.");
}
