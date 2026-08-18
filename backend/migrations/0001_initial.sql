PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS device_profiles (
    device_id TEXT PRIMARY KEY,
    adb_serial_snapshot TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS device_groups (
    group_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    device_ids_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS device_leases (
    lease_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    adb_serial_snapshot TEXT NOT NULL,
    state TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    released_at INTEGER
);
CREATE TABLE IF NOT EXISTS port_leases (
    lease_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    ports_json TEXT NOT NULL,
    state TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    released_at INTEGER
);
CREATE TABLE IF NOT EXISTS farm_runs (
    run_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    strategy TEXT NOT NULL,
    iterations INTEGER NOT NULL,
    failure_policy TEXT NOT NULL,
    status TEXT NOT NULL,
    completion TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS device_runs (
    device_run_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES farm_runs(run_id),
    device_id TEXT NOT NULL,
    adb_serial_snapshot TEXT NOT NULL,
    status TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT
);
CREATE TABLE IF NOT EXISTS device_iterations (
    iteration_id TEXT PRIMARY KEY,
    device_run_id TEXT NOT NULL REFERENCES device_runs(device_run_id),
    iteration_number INTEGER NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER,
    finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS observations (
    observation_id TEXT PRIMARY KEY,
    iteration_id TEXT NOT NULL REFERENCES device_iterations(iteration_id),
    action_id TEXT,
    outcome TEXT NOT NULL,
    detail TEXT
);
CREATE TABLE IF NOT EXISTS artifact_index (
    artifact_id TEXT PRIMARY KEY,
    run_id TEXT,
    path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    media_type TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
