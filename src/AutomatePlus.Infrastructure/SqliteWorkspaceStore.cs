using System.Globalization;
using System.Text.Json;
using AutomatePlus.Domain;
using Microsoft.Data.Sqlite;

namespace AutomatePlus.Infrastructure;

public sealed class SqliteWorkspaceStore : IWorkspaceStore, IFarmWorkspaceStore, IAsyncDisposable
{
    private const int FarmSchemaVersion = 2;
    private readonly string databasePath;
    private readonly JsonSerializerOptions jsonOptions = new(JsonSerializerDefaults.Web);
    private readonly SemaphoreSlim databaseGate = new(1, 1);
    private SqliteConnection? connection;

    public SqliteWorkspaceStore(string databasePath)
    {
        this.databasePath = Path.GetFullPath(databasePath);
        Directory.CreateDirectory(Path.GetDirectoryName(this.databasePath)!);
    }

    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
        {
            if (connection is not null) return;

            connection = new SqliteConnection(new SqliteConnectionStringBuilder
            {
                DataSource = databasePath,
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString());
            await connection.OpenAsync(cancellationToken);

            await using (var command = connection.CreateCommand())
            {
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

            await ApplyFarmMigrationAsync(cancellationToken);
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task SaveSessionAsync(AutomationSession session, CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
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
            command.Parameters.AddWithValue("$updatedAt", FormatTimestamp(session.UpdatedAt));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task<AutomationSession?> GetSessionAsync(Guid id, CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
        {
            var db = RequireConnection();
            await using var command = db.CreateCommand();
            command.CommandText = "SELECT ir_json FROM sessions WHERE id = $id";
            command.Parameters.AddWithValue("$id", id.ToString("D"));
            var value = await command.ExecuteScalarAsync(cancellationToken);
            return value is string json ? JsonSerializer.Deserialize<AutomationSession>(json, jsonOptions) : null;
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task SaveRunAsync(RunSummary summary, CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
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
            command.Parameters.AddWithValue("$finishedAt", FormatTimestamp(DateTimeOffset.UtcNow));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task SaveDeviceProfileAsync(DeviceProfile profile, CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
        {
            var db = RequireConnection();
            await using var command = db.CreateCommand();
            command.CommandText = """
                INSERT INTO device_profiles
                  (id, adb_serial, model, manufacturer, product, android_version, sdk_version, is_emulator,
                   resolution_width, resolution_height, density, orientation, transport, authorization, health_state, last_seen)
                VALUES ($id, $serial, $model, $manufacturer, $product, $androidVersion, $sdkVersion, $isEmulator,
                        $width, $height, $density, $orientation, $transport, $authorization, $healthState, $lastSeen)
                ON CONFLICT(id) DO UPDATE SET adb_serial = excluded.adb_serial, model = excluded.model,
                  manufacturer = excluded.manufacturer, product = excluded.product, android_version = excluded.android_version,
                  sdk_version = excluded.sdk_version, is_emulator = excluded.is_emulator, resolution_width = excluded.resolution_width,
                  resolution_height = excluded.resolution_height, density = excluded.density, orientation = excluded.orientation,
                  transport = excluded.transport, authorization = excluded.authorization, health_state = excluded.health_state,
                  last_seen = excluded.last_seen;
                """;
            AddDeviceProfileParameters(command, profile);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task<IReadOnlyList<DeviceProfile>> GetDeviceProfilesAsync(CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
        {
            var db = RequireConnection();
            await using var command = db.CreateCommand();
            command.CommandText = """
                SELECT id, adb_serial, model, manufacturer, product, android_version, sdk_version, is_emulator,
                       resolution_width, resolution_height, density, orientation, transport, authorization, health_state, last_seen
                FROM device_profiles ORDER BY model, adb_serial;
                """;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            var profiles = new List<DeviceProfile>();
            while (await reader.ReadAsync(cancellationToken))
                profiles.Add(ReadDeviceProfile(reader));
            return profiles;
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task SaveDeviceGroupAsync(DeviceGroup group, CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
        {
            var db = RequireConnection();
            await using var command = db.CreateCommand();
            command.CommandText = """
                INSERT INTO device_groups (id, name, description, device_ids_json, updated_at)
                VALUES ($id, $name, $description, $deviceIds, $updatedAt)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
                  device_ids_json = excluded.device_ids_json, updated_at = excluded.updated_at;
                """;
            command.Parameters.AddWithValue("$id", group.Id.ToString("D"));
            command.Parameters.AddWithValue("$name", group.Name);
            command.Parameters.AddWithValue("$description", (object?)group.Description ?? DBNull.Value);
            command.Parameters.AddWithValue("$deviceIds", JsonSerializer.Serialize(group.DeviceIds, jsonOptions));
            command.Parameters.AddWithValue("$updatedAt", FormatTimestamp(group.UpdatedAt));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task<DeviceGroup?> GetDeviceGroupAsync(Guid id, CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
        {
            var db = RequireConnection();
            await using var command = db.CreateCommand();
            command.CommandText = "SELECT id, name, description, device_ids_json, updated_at FROM device_groups WHERE id = $id";
            command.Parameters.AddWithValue("$id", id.ToString("D"));
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            return await reader.ReadAsync(cancellationToken) ? ReadDeviceGroup(reader) : null;
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task<IReadOnlyList<DeviceGroup>> GetDeviceGroupsAsync(CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
        {
            var db = RequireConnection();
            await using var command = db.CreateCommand();
            command.CommandText = "SELECT id, name, description, device_ids_json, updated_at FROM device_groups ORDER BY name";
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            var groups = new List<DeviceGroup>();
            while (await reader.ReadAsync(cancellationToken))
                groups.Add(ReadDeviceGroup(reader));
            return groups;
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task SaveDeviceLeaseAsync(DeviceLease lease, CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
        {
            var db = RequireConnection();
            await using var command = db.CreateCommand();
            command.CommandText = """
                INSERT INTO device_leases (lease_id, farm_run_id, device_id, adb_serial_snapshot, owner, state, acquired_at, released_at)
                VALUES ($leaseId, $farmRunId, $deviceId, $serial, $owner, $state, $acquiredAt, $releasedAt)
                ON CONFLICT(lease_id) DO UPDATE SET state = excluded.state, released_at = excluded.released_at;
                """;
            command.Parameters.AddWithValue("$leaseId", lease.LeaseId.ToString("D"));
            command.Parameters.AddWithValue("$farmRunId", lease.FarmRunId.ToString("D"));
            command.Parameters.AddWithValue("$deviceId", lease.DeviceId.ToString("D"));
            command.Parameters.AddWithValue("$serial", lease.AdbSerialSnapshot);
            command.Parameters.AddWithValue("$owner", lease.Owner);
            command.Parameters.AddWithValue("$state", lease.State.ToString());
            command.Parameters.AddWithValue("$acquiredAt", FormatTimestamp(lease.AcquiredAt));
            command.Parameters.AddWithValue("$releasedAt", lease.ReleasedAt is null ? DBNull.Value : FormatTimestamp(lease.ReleasedAt.Value));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task SavePortLeaseAsync(PortLease lease, CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
        {
            var db = RequireConnection();
            await using var command = db.CreateCommand();
            command.CommandText = """
                INSERT INTO port_leases (lease_id, farm_run_id, device_id, ports_json, state, acquired_at, released_at)
                VALUES ($leaseId, $farmRunId, $deviceId, $ports, $state, $acquiredAt, $releasedAt)
                ON CONFLICT(lease_id) DO UPDATE SET ports_json = excluded.ports_json, state = excluded.state, released_at = excluded.released_at;
                """;
            command.Parameters.AddWithValue("$leaseId", lease.LeaseId.ToString("D"));
            command.Parameters.AddWithValue("$farmRunId", lease.FarmRunId.ToString("D"));
            command.Parameters.AddWithValue("$deviceId", lease.DeviceId.ToString("D"));
            command.Parameters.AddWithValue("$ports", JsonSerializer.Serialize(lease.Ports, jsonOptions));
            command.Parameters.AddWithValue("$state", lease.State.ToString());
            command.Parameters.AddWithValue("$acquiredAt", FormatTimestamp(lease.AcquiredAt));
            command.Parameters.AddWithValue("$releasedAt", lease.ReleasedAt is null ? DBNull.Value : FormatTimestamp(lease.ReleasedAt.Value));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async Task SaveFarmRunAsync(FarmRunReport report, CancellationToken cancellationToken)
    {
        await databaseGate.WaitAsync(cancellationToken);
        try
        {
            var db = RequireConnection();
            await using var transaction = db.BeginTransaction();
            await ExecuteAsync(db, transaction, """
                INSERT INTO farm_runs
                  (id, session_id, strategy, status, completion, planned_iterations, started_iterations, passed_iterations,
                   failed_iterations, blocked_iterations, cancelled_iterations, started_at, finished_at, duration_ms, error)
                VALUES ($id, $sessionId, $strategy, $status, $completion, $planned, $started, $passed, $failed, $blocked,
                        $cancelled, $startedAt, $finishedAt, $durationMs, $error)
                ON CONFLICT(id) DO UPDATE SET status = excluded.status, completion = excluded.completion,
                  planned_iterations = excluded.planned_iterations, started_iterations = excluded.started_iterations,
                  passed_iterations = excluded.passed_iterations, failed_iterations = excluded.failed_iterations,
                  blocked_iterations = excluded.blocked_iterations, cancelled_iterations = excluded.cancelled_iterations,
                  started_at = excluded.started_at, finished_at = excluded.finished_at, duration_ms = excluded.duration_ms,
                  error = excluded.error;
                """, cancellationToken,
                ("$id", report.FarmRunId.ToString("D")), ("$sessionId", report.SessionId.ToString("D")),
                ("$strategy", report.Strategy.ToString()), ("$status", report.Status.ToString()),
                ("$completion", report.Completion.ToString()), ("$planned", report.PlannedIterations),
                ("$started", report.StartedIterations), ("$passed", report.PassedIterations),
                ("$failed", report.FailedIterations), ("$blocked", report.BlockedIterations),
                ("$cancelled", report.CancelledIterations), ("$startedAt", FormatTimestamp(report.StartedAt)),
                ("$finishedAt", report.FinishedAt is null ? DBNull.Value : FormatTimestamp(report.FinishedAt.Value)),
                ("$durationMs", report.Duration.TotalMilliseconds), ("$error", (object?)report.Error ?? DBNull.Value));

            await ExecuteAsync(db, transaction, "DELETE FROM device_iterations WHERE device_run_id IN (SELECT id FROM device_runs WHERE farm_run_id = $farmRunId)", cancellationToken, ("$farmRunId", report.FarmRunId.ToString("D")));
            await ExecuteAsync(db, transaction, "DELETE FROM device_runs WHERE farm_run_id = $farmRunId", cancellationToken, ("$farmRunId", report.FarmRunId.ToString("D")));
            await ExecuteAsync(db, transaction, "DELETE FROM device_observations WHERE farm_run_id = $farmRunId", cancellationToken, ("$farmRunId", report.FarmRunId.ToString("D")));
            await ExecuteAsync(db, transaction, "DELETE FROM artifact_index WHERE farm_run_id = $farmRunId", cancellationToken, ("$farmRunId", report.FarmRunId.ToString("D")));

            foreach (var deviceRun in report.DeviceRuns)
            {
                await ExecuteAsync(db, transaction, """
                    INSERT INTO device_runs
                      (id, farm_run_id, device_id, adb_serial_snapshot, status, planned_iterations, started_iterations,
                       passed_iterations, failed_iterations, blocked_iterations, cancelled_iterations, started_at, finished_at, error)
                    VALUES ($id, $farmRunId, $deviceId, $serial, $status, $planned, $started, $passed, $failed, $blocked,
                            $cancelled, $startedAt, $finishedAt, $error)
                    """, cancellationToken,
                    ("$id", deviceRun.Id.ToString("D")), ("$farmRunId", deviceRun.FarmRunId.ToString("D")),
                    ("$deviceId", deviceRun.DeviceId.ToString("D")), ("$serial", deviceRun.AdbSerialSnapshot),
                    ("$status", deviceRun.Status.ToString()), ("$planned", deviceRun.PlannedIterations),
                    ("$started", deviceRun.StartedIterations), ("$passed", deviceRun.PassedIterations),
                    ("$failed", deviceRun.FailedIterations), ("$blocked", deviceRun.BlockedIterations),
                    ("$cancelled", deviceRun.CancelledIterations), ("$startedAt", FormatTimestamp(deviceRun.StartedAt)),
                    ("$finishedAt", deviceRun.FinishedAt is null ? DBNull.Value : FormatTimestamp(deviceRun.FinishedAt.Value)),
                    ("$error", (object?)deviceRun.Error ?? DBNull.Value));

                foreach (var iteration in deviceRun.Iterations)
                {
                    await ExecuteAsync(db, transaction, """
                        INSERT INTO device_iterations
                          (id, device_run_id, iteration_number, status, passed_steps, failed_steps, total_steps, started_at, finished_at, error)
                        VALUES ($id, $deviceRunId, $number, $status, $passed, $failed, $total, $startedAt, $finishedAt, $error)
                        """, cancellationToken,
                        ("$id", iteration.Id.ToString("D")), ("$deviceRunId", iteration.DeviceRunId.ToString("D")),
                        ("$number", iteration.IterationNumber), ("$status", iteration.Status.ToString()),
                        ("$passed", iteration.PassedSteps), ("$failed", iteration.FailedSteps),
                        ("$total", iteration.TotalSteps), ("$startedAt", FormatTimestamp(iteration.StartedAt)),
                        ("$finishedAt", iteration.FinishedAt is null ? DBNull.Value : FormatTimestamp(iteration.FinishedAt.Value)),
                        ("$error", (object?)iteration.Error ?? DBNull.Value));
                }
            }

            foreach (var observation in report.Observations)
            {
                await ExecuteAsync(db, transaction, """
                    INSERT INTO device_observations
                      (id, farm_run_id, device_run_id, iteration_id, action_id, device_id, adb_serial_snapshot, status,
                       resolved_locator, match_count, fallback_used, hierarchy_sha256, error, timestamp)
                    VALUES ($id, $farmRunId, $deviceRunId, $iterationId, $actionId, $deviceId, $serial, $status,
                            $locator, $matchCount, $fallbackUsed, $hierarchy, $error, $timestamp)
                    """, cancellationToken,
                    ("$id", observation.Id.ToString("D")), ("$farmRunId", observation.FarmRunId.ToString("D")),
                    ("$deviceRunId", observation.DeviceRunId.ToString("D")), ("$iterationId", observation.IterationId?.ToString("D") ?? (object)DBNull.Value),
                    ("$actionId", observation.ActionId.ToString("D")), ("$deviceId", observation.DeviceId.ToString("D")),
                    ("$serial", observation.AdbSerialSnapshot), ("$status", observation.Status.ToString()),
                    ("$locator", (object?)observation.ResolvedLocator ?? DBNull.Value), ("$matchCount", observation.MatchCount),
                    ("$fallbackUsed", observation.FallbackUsed ? 1 : 0), ("$hierarchy", (object?)observation.HierarchySha256 ?? DBNull.Value),
                    ("$error", (object?)observation.Error ?? DBNull.Value), ("$timestamp", FormatTimestamp(observation.Timestamp)));
            }

            foreach (var artifact in report.Artifacts)
            {
                await ExecuteAsync(db, transaction, """
                    INSERT INTO artifact_index
                      (id, farm_run_id, device_run_id, iteration_id, kind, relative_path, sha256, created_at)
                    VALUES ($id, $farmRunId, $deviceRunId, $iterationId, $kind, $relativePath, $sha256, $createdAt)
                    """, cancellationToken,
                    ("$id", artifact.Id.ToString("D")), ("$farmRunId", artifact.FarmRunId.ToString("D")),
                    ("$deviceRunId", artifact.DeviceRunId.ToString("D")), ("$iterationId", artifact.IterationId?.ToString("D") ?? (object)DBNull.Value),
                    ("$kind", artifact.Kind), ("$relativePath", artifact.RelativePath), ("$sha256", artifact.Sha256),
                    ("$createdAt", FormatTimestamp(artifact.CreatedAt)));
            }

            await transaction.CommitAsync(cancellationToken);
        }
        finally
        {
            databaseGate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await databaseGate.WaitAsync();
        try
        {
            if (connection is not null)
                await connection.DisposeAsync();
            connection = null;
        }
        finally
        {
            databaseGate.Release();
            databaseGate.Dispose();
        }
    }

    private async Task ApplyFarmMigrationAsync(CancellationToken cancellationToken)
    {
        var db = RequireConnection();
        await using var versionCommand = db.CreateCommand();
        versionCommand.CommandText = "SELECT COALESCE(MAX(version), 0) FROM schema_migrations";
        var current = Convert.ToInt32(await versionCommand.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        if (current >= FarmSchemaVersion) return;

        await using var transaction = db.BeginTransaction();
        await ExecuteAsync(db, transaction, """
            CREATE TABLE IF NOT EXISTS device_profiles (
              id TEXT PRIMARY KEY, adb_serial TEXT NOT NULL, model TEXT NOT NULL, manufacturer TEXT NOT NULL,
              product TEXT NOT NULL, android_version TEXT NOT NULL, sdk_version INTEGER NOT NULL, is_emulator INTEGER NOT NULL,
              resolution_width INTEGER NOT NULL, resolution_height INTEGER NOT NULL, density INTEGER NOT NULL,
              orientation TEXT NOT NULL, transport TEXT NOT NULL, authorization TEXT NOT NULL, health_state TEXT NOT NULL,
              last_seen TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_device_profiles_serial ON device_profiles(adb_serial);
            CREATE TABLE IF NOT EXISTS device_groups (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NULL, device_ids_json TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS device_leases (
              lease_id TEXT PRIMARY KEY, farm_run_id TEXT NOT NULL, device_id TEXT NOT NULL, adb_serial_snapshot TEXT NOT NULL,
              owner TEXT NOT NULL, state TEXT NOT NULL, acquired_at TEXT NOT NULL, released_at TEXT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_device_leases_device ON device_leases(device_id, state);
            CREATE TABLE IF NOT EXISTS farm_runs (
              id TEXT PRIMARY KEY, session_id TEXT NOT NULL, strategy TEXT NOT NULL, status TEXT NOT NULL, completion TEXT NOT NULL,
              planned_iterations INTEGER NOT NULL, started_iterations INTEGER NOT NULL, passed_iterations INTEGER NOT NULL,
              failed_iterations INTEGER NOT NULL, blocked_iterations INTEGER NOT NULL, cancelled_iterations INTEGER NOT NULL,
              started_at TEXT NOT NULL, finished_at TEXT NULL, duration_ms REAL NOT NULL, error TEXT NULL
            );
            CREATE TABLE IF NOT EXISTS port_leases (
              lease_id TEXT PRIMARY KEY, farm_run_id TEXT NOT NULL, device_id TEXT NOT NULL, ports_json TEXT NOT NULL,
              state TEXT NOT NULL, acquired_at TEXT NOT NULL, released_at TEXT NULL
            );
            CREATE TABLE IF NOT EXISTS device_runs (
              id TEXT PRIMARY KEY, farm_run_id TEXT NOT NULL, device_id TEXT NOT NULL, adb_serial_snapshot TEXT NOT NULL,
              status TEXT NOT NULL, planned_iterations INTEGER NOT NULL, started_iterations INTEGER NOT NULL,
              passed_iterations INTEGER NOT NULL, failed_iterations INTEGER NOT NULL, blocked_iterations INTEGER NOT NULL,
              cancelled_iterations INTEGER NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NULL, error TEXT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_device_runs_farm ON device_runs(farm_run_id);
            CREATE TABLE IF NOT EXISTS device_iterations (
              id TEXT PRIMARY KEY, device_run_id TEXT NOT NULL, iteration_number INTEGER NOT NULL, status TEXT NOT NULL,
              passed_steps INTEGER NOT NULL, failed_steps INTEGER NOT NULL, total_steps INTEGER NOT NULL,
              started_at TEXT NOT NULL, finished_at TEXT NULL, error TEXT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_device_iterations_run ON device_iterations(device_run_id);
            CREATE TABLE IF NOT EXISTS device_observations (
              id TEXT PRIMARY KEY, farm_run_id TEXT NOT NULL, device_run_id TEXT NOT NULL, iteration_id TEXT NULL,
              action_id TEXT NOT NULL, device_id TEXT NOT NULL, adb_serial_snapshot TEXT NOT NULL, status TEXT NOT NULL,
              resolved_locator TEXT NULL, match_count INTEGER NOT NULL, fallback_used INTEGER NOT NULL,
              hierarchy_sha256 TEXT NULL, error TEXT NULL, timestamp TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_device_observations_farm ON device_observations(farm_run_id);
            CREATE TABLE IF NOT EXISTS artifact_index (
              id TEXT PRIMARY KEY, farm_run_id TEXT NOT NULL, device_run_id TEXT NOT NULL, iteration_id TEXT NULL,
              kind TEXT NOT NULL, relative_path TEXT NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_artifact_index_farm ON artifact_index(farm_run_id);
            """, cancellationToken);
        await ExecuteAsync(db, transaction, "INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES ($version, $appliedAt)", cancellationToken,
            ("$version", FarmSchemaVersion), ("$appliedAt", FormatTimestamp(DateTimeOffset.UtcNow)));
        await transaction.CommitAsync(cancellationToken);
    }

    private static async Task ExecuteAsync(
        SqliteConnection db,
        SqliteTransaction transaction,
        string sql,
        CancellationToken cancellationToken,
        params (string Name, object Value)[] parameters)
    {
        await using var command = db.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
            command.Parameters.AddWithValue(name, value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static void AddDeviceProfileParameters(SqliteCommand command, DeviceProfile profile)
    {
        command.Parameters.AddWithValue("$id", profile.Id.ToString("D"));
        command.Parameters.AddWithValue("$serial", profile.AdbSerial);
        command.Parameters.AddWithValue("$model", profile.Model);
        command.Parameters.AddWithValue("$manufacturer", profile.Manufacturer);
        command.Parameters.AddWithValue("$product", profile.Product);
        command.Parameters.AddWithValue("$androidVersion", profile.AndroidVersion);
        command.Parameters.AddWithValue("$sdkVersion", profile.SdkVersion);
        command.Parameters.AddWithValue("$isEmulator", profile.IsEmulator ? 1 : 0);
        command.Parameters.AddWithValue("$width", profile.ResolutionWidth);
        command.Parameters.AddWithValue("$height", profile.ResolutionHeight);
        command.Parameters.AddWithValue("$density", profile.Density);
        command.Parameters.AddWithValue("$orientation", profile.Orientation);
        command.Parameters.AddWithValue("$transport", profile.Transport);
        command.Parameters.AddWithValue("$authorization", profile.Authorization.ToString());
        command.Parameters.AddWithValue("$healthState", profile.HealthState.ToString());
        command.Parameters.AddWithValue("$lastSeen", FormatTimestamp(profile.LastSeen));
    }

    private static DeviceProfile ReadDeviceProfile(SqliteDataReader reader) => new()
    {
        Id = Guid.Parse(reader.GetString(0)),
        AdbSerial = reader.GetString(1),
        Model = reader.GetString(2),
        Manufacturer = reader.GetString(3),
        Product = reader.GetString(4),
        AndroidVersion = reader.GetString(5),
        SdkVersion = reader.GetInt32(6),
        IsEmulator = reader.GetInt32(7) == 1,
        ResolutionWidth = reader.GetInt32(8),
        ResolutionHeight = reader.GetInt32(9),
        Density = reader.GetInt32(10),
        Orientation = reader.GetString(11),
        Transport = reader.GetString(12),
        Authorization = ParseEnum(reader.GetString(13), DeviceAuthorizationState.Unknown),
        HealthState = ParseEnum(reader.GetString(14), DeviceHealthState.Unknown),
        LastSeen = ParseTimestamp(reader.GetString(15))
    };

    private static DeviceGroup ReadDeviceGroup(SqliteDataReader reader)
    {
        var deviceIds = JsonSerializer.Deserialize<Guid[]>(reader.GetString(3)) ?? [];
        return new DeviceGroup
        {
            Id = Guid.Parse(reader.GetString(0)),
            Name = reader.GetString(1),
            Description = reader.IsDBNull(2) ? null : reader.GetString(2),
            DeviceIds = deviceIds,
            UpdatedAt = ParseTimestamp(reader.GetString(4))
        };
    }

    private static T ParseEnum<T>(string value, T fallback) where T : struct, Enum =>
        Enum.TryParse<T>(value, ignoreCase: true, out var parsed) ? parsed : fallback;

    private static string FormatTimestamp(DateTimeOffset value) => value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);

    private static DateTimeOffset ParseTimestamp(string value) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed)
            ? parsed
            : DateTimeOffset.UnixEpoch;

    private SqliteConnection RequireConnection() => connection ?? throw new InvalidOperationException("Workspace store has not been initialized.");
}
