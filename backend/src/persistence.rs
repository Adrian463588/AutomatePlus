use crate::contracts::DeviceProfile;
use rusqlite::{params, types::Type, Connection, OptionalExtension, Result};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_ARTIFACT_LIST_ROWS: usize = 1_000;
const MAX_DEVICE_GROUP_ROWS: usize = 256;
const MAX_KNOWN_DEVICE_ROWS: usize = 1_024;
const MAX_GROUP_DEVICE_JSON_BYTES: usize = 64 * 1024;
const MAX_STORED_IDENTIFIER_BYTES: usize = 256;

#[derive(Debug)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn open_default() -> Result<Self> {
        let root = std::env::var_os("AUTOMATE_PLUS_WORKSPACE")
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
        let directory = root.join(".automate-plus");
        fs::create_dir_all(&directory)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        let database = Self {
            path: directory.join("automate-plus.sqlite"),
        };
        database.migrate()?;
        Ok(database)
    }

    pub fn open_at(root: &std::path::Path) -> Result<Self> {
        let directory = root.join(".automate-plus");
        fs::create_dir_all(&directory)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        let database = Self {
            path: directory.join("automate-plus.sqlite"),
        };
        database.migrate()?;
        Ok(database)
    }

    pub fn connection(&self) -> Result<Connection> {
        Connection::open(&self.path)
    }

    fn migrate(&self) -> Result<()> {
        let connection = Connection::open(&self.path)?;
        connection.execute_batch(include_str!("../migrations/0001_initial.sql"))?;
        connection.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
            params![1_i64, "0001_initial", now()],
        )?;
        let migration_applied = connection
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = 2",
                [],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        if migration_applied.is_none() {
            connection
                .execute_batch(include_str!("../migrations/0002_device_group_metadata.sql"))?;
            connection.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                params![2_i64, "0002_device_group_metadata", now()],
            )?;
        }
        let runtime_migration_applied = connection
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = 3",
                [],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        if runtime_migration_applied.is_none() {
            connection.execute_batch(include_str!("../migrations/0003_runtime_manager.sql"))?;
            connection.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                params![3_i64, "0003_runtime_manager", now()],
            )?;
        }
        Ok(())
    }

    pub fn recover_stale_leases(&self) -> Result<usize> {
        let connection = Connection::open(&self.path)?;
        let timestamp = now();
        let device_count = connection.execute(
            "UPDATE device_leases SET state = 'released', released_at = ?1 WHERE state IN ('reserved', 'preparing', 'running', 'cleaning')",
            params![timestamp],
        )?;
        connection.execute(
            "UPDATE port_leases SET state = 'released', released_at = ?1 WHERE state = 'active'",
            params![timestamp],
        )?;
        Ok(device_count)
    }

    pub fn save_devices(&self, devices: &[DeviceProfile]) -> Result<()> {
        let connection = Connection::open(&self.path)?;
        for device in devices {
            let profile_json = serde_json::to_string(device)
                .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
            connection.execute(
                "INSERT OR REPLACE INTO device_profiles (device_id, adb_serial_snapshot, profile_json, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![device.device_id, device.adb_serial, profile_json, device.last_seen_at],
            )?;
        }
        Ok(())
    }

    pub fn list_groups(&self) -> Result<Vec<Value>> {
        let connection = Connection::open(&self.path)?;
        let (row_count, largest_json, largest_id): (i64, i64, i64) = connection.query_row(
            "SELECT COUNT(*), COALESCE(MAX(length(device_ids_json)), 0), COALESCE(MAX(length(group_id)), 0) FROM device_groups",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        if row_count > MAX_DEVICE_GROUP_ROWS as i64
            || largest_json > MAX_GROUP_DEVICE_JSON_BYTES as i64
            || largest_id > MAX_STORED_IDENTIFIER_BYTES as i64
        {
            return Err(limit_error(
                "Stored device-group data exceeds its safety limit.",
            ));
        }
        let mut statement = connection.prepare(
            "SELECT group_id, name, device_ids_json, description, primary_device_id, created_at, updated_at FROM device_groups ORDER BY name LIMIT 257",
        )?;
        let rows = statement.query_map([], |row| {
            let device_ids_json: String = row.get(2)?;
            let device_ids = serde_json::from_str::<Value>(&device_ids_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(2, Type::Text, Box::new(error))
            })?;
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "deviceIds": device_ids,
                "description": row.get::<_, Option<String>>(3)?,
                "primaryDeviceId": row.get::<_, Option<String>>(4)?,
                "createdAt": row.get::<_, i64>(5)?,
                "updatedAt": row.get::<_, i64>(6)?
            }))
        })?;
        rows.collect()
    }

    pub fn known_device_ids(&self) -> Result<std::collections::HashSet<String>> {
        let connection = Connection::open(&self.path)?;
        let (row_count, largest_id): (i64, i64) = connection.query_row(
            "SELECT COUNT(*), COALESCE(MAX(length(device_id)), 0) FROM device_profiles",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        if row_count > MAX_KNOWN_DEVICE_ROWS as i64
            || largest_id > MAX_STORED_IDENTIFIER_BYTES as i64
        {
            return Err(limit_error(
                "Stored device registry exceeds its safety limit.",
            ));
        }
        let mut statement =
            connection.prepare("SELECT device_id FROM device_profiles LIMIT 1025")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect()
    }

    pub fn save_group(
        &self,
        group_id: &str,
        name: &str,
        device_ids: &[String],
        primary_device_id: Option<&str>,
    ) -> Result<Value> {
        let connection = Connection::open(&self.path)?;
        let timestamp = now();
        let device_ids_json = serde_json::to_string(device_ids)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        if device_ids_json.len() > MAX_GROUP_DEVICE_JSON_BYTES {
            return Err(limit_error(
                "Device-group membership exceeds its storage limit.",
            ));
        }
        let exists = connection
            .query_row(
                "SELECT 1 FROM device_groups WHERE group_id = ?1",
                params![group_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .is_some();
        if !exists {
            let count = connection.query_row("SELECT COUNT(*) FROM device_groups", [], |row| {
                row.get::<_, i64>(0)
            })?;
            if count >= MAX_DEVICE_GROUP_ROWS as i64 {
                return Err(limit_error(
                    "Device-group registry reached its safety limit.",
                ));
            }
        }
        connection.execute(
            "INSERT INTO device_groups (group_id, name, device_ids_json, description, primary_device_id, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?5) ON CONFLICT(group_id) DO UPDATE SET name = excluded.name, device_ids_json = excluded.device_ids_json, primary_device_id = excluded.primary_device_id, updated_at = excluded.updated_at",
            params![group_id, name, device_ids_json, primary_device_id, timestamp],
        )?;
        Ok(serde_json::json!({
            "id": group_id,
            "name": name,
            "deviceIds": device_ids,
            "primaryDeviceId": primary_device_id,
            "createdAt": timestamp,
            "updatedAt": timestamp
        }))
    }

    pub fn delete_group(&self, group_id: &str) -> Result<bool> {
        let connection = Connection::open(&self.path)?;
        Ok(connection.execute(
            "DELETE FROM device_groups WHERE group_id = ?1",
            params![group_id],
        )? > 0)
    }

    pub fn list_artifacts(&self, run_id: Option<&str>) -> std::result::Result<Vec<Value>, String> {
        let connection = Connection::open(&self.path).map_err(|error| error.to_string())?;
        let mut statement = connection.prepare(
            if run_id.is_some() {
                "SELECT artifact_id, run_id, path, sha256, media_type, created_at FROM artifact_index WHERE run_id = ?1 ORDER BY created_at DESC LIMIT 1001"
            } else {
                "SELECT artifact_id, run_id, path, sha256, media_type, created_at FROM artifact_index ORDER BY created_at DESC LIMIT 1001"
            },
        ).map_err(|error| error.to_string())?;
        let mut rows = if let Some(run_id) = run_id {
            statement
                .query(params![run_id])
                .map_err(|error| error.to_string())?
        } else {
            statement.query([]).map_err(|error| error.to_string())?
        };
        let mut artifacts = Vec::new();
        while let Some(row) = rows.next().map_err(|error| error.to_string())? {
            artifacts.push(serde_json::json!({
                "artifactId": row.get::<_, String>(0).map_err(|error| error.to_string())?,
                "runId": row.get::<_, Option<String>>(1).map_err(|error| error.to_string())?,
                "relativePath": row.get::<_, String>(2).map_err(|error| error.to_string())?,
                "sha256": row.get::<_, String>(3).map_err(|error| error.to_string())?,
                "mediaType": row.get::<_, String>(4).map_err(|error| error.to_string())?,
                "createdAt": row.get::<_, i64>(5).map_err(|error| error.to_string())?
            }));
        }
        if artifacts.len() > MAX_ARTIFACT_LIST_ROWS {
            return Err(format!(
                "Artifact query exceeds the {MAX_ARTIFACT_LIST_ROWS}-row response limit; filter by runId."
            ));
        }
        Ok(artifacts)
    }

    pub fn record_artifact(
        &self,
        artifact_id: &str,
        run_id: &str,
        relative_path: &str,
        sha256: &str,
        media_type: &str,
    ) -> Result<()> {
        let connection = Connection::open(&self.path)?;
        connection.execute(
            "INSERT OR REPLACE INTO artifact_index (artifact_id, run_id, path, sha256, media_type, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![artifact_id, run_id, relative_path, sha256, media_type, now()],
        )?;
        Ok(())
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn limit_error(message: &str) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(io::Error::other(message.to_owned())))
}
