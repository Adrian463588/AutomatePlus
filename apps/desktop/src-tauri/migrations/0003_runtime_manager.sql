CREATE TABLE IF NOT EXISTS runtime_roots (
    root_path TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    selected INTEGER NOT NULL DEFAULT 0,
    writable INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_jobs (
    job_id TEXT PRIMARY KEY,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    pack_ids_json TEXT NOT NULL,
    progress_json TEXT,
    reason TEXT,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_installed_packs (
    pack_key TEXT PRIMARY KEY,
    pack_id TEXT NOT NULL,
    version TEXT NOT NULL,
    architecture TEXT NOT NULL,
    source_sha256 TEXT,
    executable_sha256 TEXT NOT NULL,
    root_path TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    license_accepted INTEGER NOT NULL DEFAULT 0,
    health_status TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_licenses (
    license_key TEXT PRIMARY KEY,
    pack_id TEXT NOT NULL,
    version TEXT NOT NULL,
    spdx TEXT NOT NULL,
    license_sha256 TEXT,
    accepted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_evidence (
    evidence_id TEXT PRIMARY KEY,
    pack_id TEXT NOT NULL,
    version TEXT NOT NULL,
    root_path TEXT NOT NULL,
    executable_path TEXT NOT NULL,
    artifact_sha256 TEXT NOT NULL,
    executable_sha256 TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
