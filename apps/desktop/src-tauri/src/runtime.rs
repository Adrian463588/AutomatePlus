use crate::runtime_catalog::{
    discover_known_roots, is_safe_relative_path, is_sha256, parse_https_source,
    RuntimeArchiveFormat, RuntimeCatalog, RuntimeCatalogEntry, RuntimeRootCandidate,
    TARGET_ARCHITECTURE,
};
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use zip::ZipArchive;

const PROTOCOL_VERSION: &str = "1.0";
const MAX_DOWNLOAD_BYTES: u64 = 20 * 1024 * 1024 * 1024;
const HEALTH_COMMAND_TIMEOUT_SECONDS: u64 = 10;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeJob {
    pub job_id: String,
    pub operation: String,
    pub pack_ids: Vec<String>,
    pub status: String,
    pub progress: Option<RuntimeProgress>,
    pub reason: Option<String>,
    pub started_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstalledPack {
    pub id: String,
    pub version: String,
    pub architecture: String,
    pub sha256: String,
    pub source_sha256: Option<String>,
    pub root_path: String,
    pub verified: bool,
    pub license_accepted: bool,
    pub health: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthCommandEvidence {
    executed: bool,
    root_path: Option<String>,
    command: Vec<String>,
    duration_ms: u64,
    exit_code: Option<i32>,
    timed_out: bool,
    error: Option<String>,
}

#[derive(Debug)]
struct HealthCommandResult {
    passed: bool,
    reason: Option<String>,
    evidence: HealthCommandEvidence,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRootSnapshot {
    pub path: String,
    pub source: String,
    pub writable: bool,
    pub selected: bool,
    pub installed_packs: Vec<RuntimeInstalledPack>,
}

#[derive(Debug)]
struct RuntimeState {
    workspace: PathBuf,
    selected_root: Mutex<Option<PathBuf>>,
    jobs: Mutex<HashMap<String, RuntimeJob>>,
    cancelled_jobs: Mutex<HashSet<String>>,
}

#[derive(Clone, Debug)]
pub struct RuntimeManager {
    state: Arc<RuntimeState>,
}

impl RuntimeManager {
    pub fn new(root: PathBuf) -> Self {
        let selected_root = load_selected_root(&root);
        Self {
            state: Arc::new(RuntimeState {
                workspace: root,
                selected_root: Mutex::new(selected_root),
                jobs: Mutex::new(HashMap::new()),
                cancelled_jobs: Mutex::new(HashSet::new()),
            }),
        }
    }

    pub fn dispatch(&self, method: &str, payload: Value) -> Result<Value, String> {
        match method {
            "runtime.catalog.list" => self.catalog_list(),
            "runtime.roots.scan" => self.roots_scan(),
            "runtime.root.select" => {
                let path = required_string(&payload, &["path", "rootPath"])?;
                self.select_root(PathBuf::from(path))
            }
            "runtime.install.start" => self.install_start(&payload),
            "runtime.install.status" => {
                let job_id = required_string(&payload, &["jobId"])?;
                self.install_status(&job_id)
            }
            "runtime.install.cancel" => {
                let job_id = required_string(&payload, &["jobId"])?;
                self.install_cancel(&job_id)
            }
            "runtime.import" => self.import_archive(&payload),
            "runtime.verify" => self.verify_all(),
            "runtime.health" => self.health(),
            "runtime.open-folder" => self.open_folder(&payload),
            _ => Err(format!("Unsupported runtime method '{method}'.")),
        }
    }

    fn catalog(&self) -> Result<RuntimeCatalog, String> {
        let candidates = [
            self.state
                .workspace
                .join("runtime-packs")
                .join("catalog.json"),
            self.state
                .workspace
                .join("resources")
                .join("runtime-packs")
                .join("catalog.json"),
            std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(Path::to_path_buf))
                .map(|path| {
                    path.join("resources")
                        .join("runtime-packs")
                        .join("catalog.json")
                })
                .unwrap_or_default(),
        ];
        let path = candidates
            .iter()
            .find(|candidate| candidate.is_file())
            .ok_or_else(|| {
                "Bundled runtime catalog is missing; Runtime Manager is blocked.".to_owned()
            })?;
        RuntimeCatalog::load(path)
    }

    fn catalog_list(&self) -> Result<Value, String> {
        let catalog = self.catalog()?;
        Ok(json!({"protocolVersion": PROTOCOL_VERSION, "entries": catalog.entries}))
    }

    fn selected_root(&self) -> PathBuf {
        self.state
            .selected_root
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
            .unwrap_or_else(|| self.state.workspace.join("runtime-packs"))
    }

    fn select_root(&self, requested: PathBuf) -> Result<Value, String> {
        let path = if requested.is_absolute() {
            requested
        } else {
            self.state.workspace.join(requested)
        };
        fs::create_dir_all(&path).map_err(|error| {
            format!(
                "Unable to create selected runtime root '{}': {error}",
                path.display()
            )
        })?;
        if !is_writable(&path) {
            return Err(format!(
                "Selected runtime root '{}' is not writable; choose another path.",
                path.display()
            ));
        }
        let canonical = path
            .canonicalize()
            .map_err(|error| format!("Unable to canonicalize selected runtime root: {error}"))?;
        if let Ok(mut guard) = self.state.selected_root.lock() {
            *guard = Some(canonical.clone());
        }
        self.persist_selected_root(&canonical)?;
        self.roots_scan()
    }

    fn persist_selected_root(&self, root: &Path) -> Result<(), String> {
        let db_path = self.database_path();
        if !db_path.is_file() {
            return Ok(());
        }
        let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
        connection
            .execute("UPDATE runtime_roots SET selected = 0", [])
            .map_err(|error| format!("Unable to update runtime root selection: {error}"))?;
        connection
            .execute(
                "INSERT INTO runtime_roots (root_path, source, selected, writable, updated_at) VALUES (?1, 'selected', 1, 1, ?2) ON CONFLICT(root_path) DO UPDATE SET selected = 1, writable = 1, updated_at = excluded.updated_at",
                params![root.to_string_lossy(), now()],
            )
            .map_err(|error| format!("Unable to persist runtime root: {error}"))?;
        Ok(())
    }

    fn database_path(&self) -> PathBuf {
        self.state
            .workspace
            .join(".automate-plus")
            .join("automate-plus.sqlite")
    }

    fn roots_scan(&self) -> Result<Value, String> {
        let catalog = self.catalog()?;
        let selected = self.selected_root();
        let candidates = discover_known_roots(&self.state.workspace, Some(&selected));
        let selected_key = path_key(&selected);
        let roots = candidates
            .iter()
            .map(|candidate| self.scan_root(candidate, &catalog, &selected_key))
            .collect::<Vec<_>>();
        let active_root = roots
            .iter()
            .find(|root| root.selected)
            .cloned()
            .or_else(|| roots.first().cloned());
        Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "activeRoot": active_root,
            "roots": roots,
        }))
    }

    fn scan_root(
        &self,
        candidate: &RuntimeRootCandidate,
        catalog: &RuntimeCatalog,
        selected_key: &str,
    ) -> RuntimeRootSnapshot {
        let packs = read_manifest(&candidate.path)
            .ok()
            .and_then(|manifest| manifest.get("packs").and_then(Value::as_array).cloned())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|pack| inspect_manifest_pack(&candidate.path, &pack, catalog))
            .collect::<Vec<_>>();
        RuntimeRootSnapshot {
            path: candidate.path.to_string_lossy().into_owned(),
            source: root_source(&candidate.path, &self.state.workspace),
            writable: candidate.writable || is_writable(&candidate.path),
            selected: path_key(&candidate.path) == selected_key,
            installed_packs: packs,
        }
    }

    fn install_start(&self, payload: &Value) -> Result<Value, String> {
        if payload.get("licenseAccepted").and_then(Value::as_bool) != Some(true) {
            return Err("Runtime license acceptance is required before installation.".to_owned());
        }
        if payload.get("allowOnlineDownload").and_then(Value::as_bool) != Some(true) {
            return Err("Runtime download requires explicit online-download consent.".to_owned());
        }
        if std::env::var("AUTOMATEPLUS_RUNTIME_DOWNLOAD")
            .ok()
            .as_deref()
            != Some("1")
        {
            return Err("Runtime download is disabled. Set AUTOMATEPLUS_RUNTIME_DOWNLOAD=1, then use Download all missing explicitly.".to_owned());
        }
        let catalog = self.catalog()?;
        let requested = payload
            .get("packIds")
            .and_then(Value::as_array)
            .map(|ids| {
                ids.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let ids = if requested.is_empty() {
            catalog
                .entries
                .iter()
                .map(|entry| entry.id.clone())
                .collect::<Vec<_>>()
        } else {
            requested
        };
        let missing = self.missing_ids(&catalog, &ids)?;
        let job_id = format!("runtime-{}", now_nanos());
        let timestamp = now();
        if missing.is_empty() {
            let job = RuntimeJob {
                job_id: job_id.clone(),
                operation: "install".to_owned(),
                pack_ids: ids,
                status: "Installed".to_owned(),
                progress: Some(RuntimeProgress { downloaded_bytes: 0, total_bytes: Some(0) }),
                reason: Some("All requested packs already match id, version, SHA-256, license, and health evidence.".to_owned()),
                started_at: timestamp,
                updated_at: timestamp,
            };
            self.save_job(job.clone())?;
            return Ok(json!({"protocolVersion": PROTOCOL_VERSION, "job": job}));
        }
        let total_bytes = missing
            .iter()
            .filter_map(|id| catalog.entries.iter().find(|entry| &entry.id == id))
            .filter_map(|entry| entry.source.size_bytes)
            .sum::<u64>();
        let job = RuntimeJob {
            job_id: job_id.clone(),
            operation: "install".to_owned(),
            pack_ids: missing.clone(),
            status: "Downloading".to_owned(),
            progress: Some(RuntimeProgress {
                downloaded_bytes: 0,
                total_bytes: (total_bytes > 0).then_some(total_bytes),
            }),
            reason: None,
            started_at: timestamp,
            updated_at: timestamp,
        };
        self.save_job(job.clone())?;
        let manager = self.clone();
        thread::spawn(move || manager.run_install_job(job_id, catalog, missing));
        Ok(json!({"protocolVersion": PROTOCOL_VERSION, "job": job}))
    }

    fn missing_ids(&self, catalog: &RuntimeCatalog, ids: &[String]) -> Result<Vec<String>, String> {
        let report = self.roots_scan()?;
        let installed = report
            .get("roots")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .flat_map(|root| {
                root.get("installedPacks")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default()
            })
            .filter_map(|pack| {
                Some((
                    pack.get("id")?.as_str()?.to_owned(),
                    pack.get("version")?.as_str()?.to_owned(),
                    pack.get("sourceSha256")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    pack.get("verified")?.as_bool()?,
                ))
            })
            .collect::<Vec<_>>();
        Ok(ids
            .iter()
            .filter(|id| {
                let Some(entry) = catalog.entries.iter().find(|entry| &entry.id == *id) else {
                    return true;
                };
                !installed
                    .iter()
                    .any(|(installed_id, version, source_sha, verified)| {
                        installed_id == id
                            && *verified
                            && entry.version.as_deref() == Some(version.as_str())
                            && source_sha.as_deref() == entry.source.sha256.as_deref()
                    })
            })
            .cloned()
            .collect())
    }

    fn run_install_job(&self, job_id: String, catalog: RuntimeCatalog, ids: Vec<String>) {
        let root = self.selected_root();
        if let Err(error) = fs::create_dir_all(&root) {
            self.finish_job(
                &job_id,
                "Failed",
                Some(format!("Unable to create runtime root: {error}")),
            );
            return;
        }
        let total = ids
            .iter()
            .filter_map(|id| catalog.entries.iter().find(|entry| &entry.id == id))
            .filter_map(|entry| entry.source.size_bytes)
            .sum::<u64>();
        let mut downloaded = 0_u64;
        for id in ids {
            if self.is_cancelled(&job_id) {
                self.finish_job(
                    &job_id,
                    "Cancelled",
                    Some("Runtime installation was cancelled before the next pack.".to_owned()),
                );
                return;
            }
            let Some(entry) = catalog.entries.iter().find(|entry| entry.id == id).cloned() else {
                self.finish_job(
                    &job_id,
                    "Failed",
                    Some(format!("Catalog entry '{id}' does not exist.")),
                );
                return;
            };
            self.update_job(&job_id, |job| {
                job.status = "Downloading".to_owned();
                job.reason = Some(format!("Downloading and verifying {id}."));
            });
            match self.install_entry(&job_id, &root, &entry, downloaded, total) {
                Ok(bytes) => {
                    downloaded = downloaded.saturating_add(bytes);
                    self.update_job(&job_id, |job| {
                        job.status = "Installing".to_owned();
                        job.reason = Some(format!("Installed and health-checked {id}."));
                        job.progress = Some(RuntimeProgress {
                            downloaded_bytes: downloaded,
                            total_bytes: (total > 0).then_some(total),
                        });
                    });
                }
                Err(error) => {
                    let _ = fs::remove_dir_all(root.join(".staging").join(&job_id));
                    let status = if self.is_cancelled(&job_id)
                        || error.starts_with("Runtime installation cancelled")
                    {
                        "Cancelled"
                    } else if error.starts_with("NeedsReview:") {
                        "NeedsReview"
                    } else {
                        "Failed"
                    };
                    self.finish_job(&job_id, status, Some(error));
                    return;
                }
            }
        }
        let _ = fs::remove_dir_all(root.join(".staging").join(&job_id));
        self.finish_job(&job_id, "Installed", Some("All requested runtime packs passed download, checksum, license, path, and health checks.".to_owned()));
    }

    fn install_entry(
        &self,
        job_id: &str,
        root: &Path,
        entry: &RuntimeCatalogEntry,
        downloaded_before: u64,
        total: u64,
    ) -> Result<u64, String> {
        if entry.status.as_deref() != Some("Ready") {
            return Err(format!(
                "NeedsReview: runtime pack '{}' has no verified release metadata.",
                entry.id
            ));
        }
        let source = entry
            .source
            .url
            .as_deref()
            .ok_or_else(|| format!("NeedsReview: '{}' source URL is not pinned.", entry.id))?;
        let allowed_host = entry
            .source
            .allowed_host
            .as_deref()
            .ok_or_else(|| format!("NeedsReview: '{}' source host is not pinned.", entry.id))?;
        let expected_sha = entry
            .source
            .sha256
            .as_deref()
            .filter(|value| is_sha256(value))
            .ok_or_else(|| format!("NeedsReview: '{}' SHA-256 is not pinned.", entry.id))?;
        let expected_size = entry
            .source
            .size_bytes
            .ok_or_else(|| format!("NeedsReview: '{}' artifact size is not pinned.", entry.id))?;
        let parsed = parse_https_source(source)?;
        if !parsed.host.eq_ignore_ascii_case(allowed_host) {
            return Err(format!(
                "NeedsReview: '{}' source host is not allowlisted.",
                entry.id
            ));
        }
        if expected_size > MAX_DOWNLOAD_BYTES {
            return Err(format!(
                "Pack '{}' exceeds the configured download size limit.",
                entry.id
            ));
        }
        let staging_root = root.join(".staging").join(job_id).join(&entry.id);
        let _ = fs::remove_dir_all(&staging_root);
        fs::create_dir_all(&staging_root).map_err(|error| error.to_string())?;
        let archive_path = staging_root.join("artifact.download");
        let bytes = self.download(
            job_id,
            source,
            allowed_host,
            expected_size,
            expected_sha,
            &archive_path,
            downloaded_before,
            total,
        )?;
        self.update_job(job_id, |job| job.status = "Verifying".to_owned());
        let extract_root = staging_root.join("extracted");
        fs::create_dir_all(&extract_root).map_err(|error| error.to_string())?;
        match entry.archive.format {
            RuntimeArchiveFormat::Zip => extract_zip(&archive_path, &extract_root)?,
            RuntimeArchiveFormat::TarGz
            | RuntimeArchiveFormat::Msi
            | RuntimeArchiveFormat::Directory => {
                return Err(format!(
                    "NeedsReview: archive format for '{}' has no enabled verified extractor.",
                    entry.id
                ));
            }
        }
        let executable_relative =
            entry.archive.executable_paths.first().ok_or_else(|| {
                format!("NeedsReview: '{}' has no executable allowlist.", entry.id)
            })?;
        if !is_safe_relative_path(executable_relative) {
            return Err(format!(
                "Pack '{}' contains an unsafe executable path.",
                entry.id
            ));
        }
        let executable = extract_root.join(executable_relative);
        if !executable.is_file() {
            return Err(format!(
                "Pack '{}' executable '{}' is missing after extraction.",
                entry.id, executable_relative
            ));
        }
        let executable_sha = sha256_file(&executable)?;
        let version = entry.version.as_deref().ok_or_else(|| {
            format!(
                "NeedsReview: runtime pack '{}' version is not pinned.",
                entry.id
            )
        })?;
        let install_root = root.join(&entry.id).join(version);
        if install_root.exists() {
            return Err(format!(
                "NeedsReview: install target '{}' already exists and will not be overwritten.",
                install_root.display()
            ));
        }
        if let Some(parent) = install_root.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::rename(&extract_root, &install_root)
            .map_err(|error| format!("Atomic runtime install failed: {error}"))?;
        let installed_executable = install_root.join(executable_relative);
        let health = match run_health_command(
            &install_root,
            &entry.health_command,
            &entry.archive.executable_paths,
        ) {
            Ok(result) => result,
            Err(error) => {
                let _ = fs::remove_dir_all(&install_root);
                return Err(format!(
                    "Pack '{}' health command could not run; installation rolled back: {}",
                    entry.id, error
                ));
            }
        };
        if !health.passed {
            let _ = fs::remove_dir_all(&install_root);
            return Err(format!(
                "Pack '{}' health command failed; installation rolled back: {}",
                entry.id,
                health
                    .reason
                    .unwrap_or_else(|| "the process did not report success.".to_owned())
            ));
        }
        append_manifest_pack(
            root,
            entry,
            &installed_executable,
            &executable_sha,
            expected_sha,
        )?;
        self.record_evidence(
            entry,
            root,
            &installed_executable,
            &executable_sha,
            expected_sha,
        )?;
        let _ = fs::remove_dir_all(&staging_root);
        Ok(bytes)
    }

    fn download(
        &self,
        job_id: &str,
        source: &str,
        allowed_host: &str,
        expected_size: u64,
        expected_sha: &str,
        destination: &Path,
        downloaded_before: u64,
        total: u64,
    ) -> Result<u64, String> {
        let url = reqwest::Url::parse(source)
            .map_err(|error| format!("source URL is invalid: {error}"))?;
        if url.scheme() != "https"
            || url
                .host_str()
                .map(|host| host.eq_ignore_ascii_case(allowed_host))
                != Some(true)
        {
            return Err(
                "source URL is not HTTPS or does not match the catalog allowlist.".to_owned(),
            );
        }
        let client = Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|error| format!("unable to initialize TLS client: {error}"))?;
        let mut response = client
            .get(url)
            .header(reqwest::header::ACCEPT, "application/octet-stream")
            .send()
            .map_err(|error| format!("runtime download failed: {error}"))?;
        if response.status().is_redirection() {
            return Err("runtime source redirect was rejected; catalog must pin the final official HTTPS URL.".to_owned());
        }
        if !response.status().is_success() {
            return Err(format!(
                "runtime source returned HTTP {}.",
                response.status()
            ));
        }
        if let Some(content_length) = response.content_length() {
            if content_length != expected_size {
                return Err(format!("runtime source content length {content_length} differs from pinned size {expected_size}."));
            }
        }
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(destination)
            .map_err(|error| error.to_string())?;
        let mut hasher = Sha256::new();
        let mut total_read = 0_u64;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            if self.is_cancelled(job_id) {
                drop(file);
                let _ = fs::remove_file(destination);
                return Err("Runtime installation cancelled; partial download removed.".to_owned());
            }
            let read = response
                .read(&mut buffer)
                .map_err(|error| error.to_string())?;
            if read == 0 {
                break;
            }
            total_read = total_read.saturating_add(read as u64);
            if total_read > expected_size || total_read > MAX_DOWNLOAD_BYTES {
                drop(file);
                let _ = fs::remove_file(destination);
                return Err("runtime download exceeded the pinned content-size limit.".to_owned());
            }
            hasher.update(&buffer[..read]);
            file.write_all(&buffer[..read])
                .map_err(|error| error.to_string())?;
            self.update_job(job_id, |job| {
                job.progress = Some(RuntimeProgress {
                    downloaded_bytes: downloaded_before.saturating_add(total_read),
                    total_bytes: (total > 0).then_some(total),
                });
            });
        }
        file.flush().map_err(|error| error.to_string())?;
        let actual = hex_digest(hasher.finalize());
        if total_read != expected_size || !actual.eq_ignore_ascii_case(expected_sha) {
            let _ = fs::remove_file(destination);
            return Err(format!(
                "runtime artifact verification failed (bytes={total_read}, sha256={actual})."
            ));
        }
        Ok(total_read)
    }

    fn install_status(&self, job_id: &str) -> Result<Value, String> {
        let job = self
            .state
            .jobs
            .lock()
            .map_err(|_| "Runtime job state is unavailable.".to_owned())?
            .get(job_id)
            .cloned()
            .ok_or_else(|| format!("Runtime job '{job_id}' was not found."))?;
        Ok(json!({"protocolVersion": PROTOCOL_VERSION, "job": job}))
    }

    fn install_cancel(&self, job_id: &str) -> Result<Value, String> {
        if let Ok(mut cancelled) = self.state.cancelled_jobs.lock() {
            cancelled.insert(job_id.to_owned());
        }
        self.update_job(job_id, |job| {
            if !matches!(
                job.status.as_str(),
                "Installed" | "Failed" | "Blocked" | "NeedsReview"
            ) {
                job.status = "Cancelled".to_owned();
                job.reason = Some(
                    "Cancellation requested; the worker will remove partial files before exit."
                        .to_owned(),
                );
            }
        });
        self.install_status(job_id)
    }

    fn import_archive(&self, payload: &Value) -> Result<Value, String> {
        if payload.get("licenseAccepted").and_then(Value::as_bool) != Some(true) {
            return Err("Runtime license acceptance is required before import.".to_owned());
        }
        let archive_path = required_string(payload, &["archivePath"])?;
        let source = PathBuf::from(archive_path);
        if !source.exists() {
            return Err("Selected runtime archive does not exist.".to_owned());
        }
        let root = self.selected_root();
        fs::create_dir_all(&root).map_err(|error| error.to_string())?;
        let staging = root
            .join(".staging")
            .join(format!("import-{}", now_nanos()));
        fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
        if source.is_dir() {
            copy_tree(&source, &staging)?;
        } else {
            let extension = source
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if !extension.eq_ignore_ascii_case("zip") {
                let _ = fs::remove_dir_all(&staging);
                return Err("Only local ZIP imports are enabled; MSI/install scripts are never executed implicitly.".to_owned());
            }
            extract_zip(&source, &staging)?;
        }
        let imported_manifest = read_manifest(&staging).ok_or_else(|| {
            "Imported archive must contain a manifest.json at its root.".to_owned()
        })?;
        let packs = imported_manifest
            .get("packs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if packs.is_empty() {
            let _ = fs::remove_dir_all(&staging);
            return Err("Imported manifest contains no runtime packs.".to_owned());
        }
        let catalog = self.catalog()?;
        let mut imported = Vec::new();
        let mut needs_review = Vec::new();
        for pack in packs {
            let Some(id) = pack_id(&pack) else {
                continue;
            };
            let Some(_entry) = catalog.entries.iter().find(|entry| entry.id == id) else {
                continue;
            };
            let Some(path_text) = pack.get("path").and_then(Value::as_str) else {
                continue;
            };
            if !is_safe_relative_path(path_text) {
                needs_review.push(json!({"id": id, "reason": "unsafe imported pack path"}));
                continue;
            }
            let source_file = staging.join(path_text);
            if !is_inside(&staging, &source_file) || !source_file.is_file() {
                needs_review.push(json!({"id": id, "reason": "imported executable is missing or outside archive"}));
                continue;
            }
            let target_file = root.join(path_text);
            if target_file.exists() {
                needs_review.push(
                    json!({"id": id, "reason": "target exists; import will not overwrite it"}),
                );
                continue;
            }
            if let Some(parent) = target_file.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            fs::copy(&source_file, &target_file).map_err(|error| error.to_string())?;
            if let Some(record) = inspect_manifest_pack(&root, &pack, &catalog) {
                append_imported_manifest_pack(&root, &pack)?;
                if record.verified {
                    imported.push(record);
                } else {
                    needs_review
                        .push(serde_json::to_value(record).unwrap_or_else(|_| json!({"id": id})));
                }
            }
        }
        let _ = fs::remove_dir_all(&staging);
        Ok(
            json!({"protocolVersion": PROTOCOL_VERSION, "imported": imported, "needsReview": needs_review}),
        )
    }

    fn verify_all(&self) -> Result<Value, String> {
        let report = self.roots_scan()?;
        let packs = report
            .get("roots")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .flat_map(|root| {
                root.get("installedPacks")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default()
            })
            .collect::<Vec<_>>();
        Ok(json!({"protocolVersion": PROTOCOL_VERSION, "packs": packs}))
    }

    fn health(&self) -> Result<Value, String> {
        let report = self.roots_scan()?;
        let catalog = self.catalog()?;
        let statuses = catalog
            .entries
            .iter()
            .map(|entry| {
                if entry.status.as_deref() != Some("Ready") {
                    let reason = entry
                        .review_reason
                        .clone()
                        .unwrap_or_else(|| "Runtime catalog metadata is unresolved.".to_owned());
                    return json!({
                        "id": entry.id,
                        "status": "unknown",
                        "reason": reason.clone(),
                        "evidence": skipped_health_evidence(&entry.health_command, None, reason),
                    });
                }

                let Some(installed) = find_installed_pack(&report, entry) else {
                    let reason =
                        "No exact installed pack matches this Ready catalog entry.".to_owned();
                    return json!({
                        "id": entry.id,
                        "status": "unknown",
                        "reason": reason.clone(),
                        "evidence": skipped_health_evidence(&entry.health_command, None, reason),
                    });
                };
                let root_path = installed
                    .get("rootPath")
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                let metadata_verified = installed.get("verified").and_then(Value::as_bool)
                    == Some(true)
                    && installed
                        .get("licenseAccepted")
                        .and_then(Value::as_bool)
                        == Some(true);
                if !metadata_verified {
                    let reason =
                        "Installed pack metadata is not verified; health command was not executed."
                            .to_owned();
                    return json!({
                        "id": entry.id,
                        "status": "unknown",
                        "reason": reason.clone(),
                        "evidence": skipped_health_evidence(
                            &entry.health_command,
                            root_path.clone(),
                            reason,
                        ),
                    });
                }

                let Some(root_path) = root_path.as_deref() else {
                    let reason =
                        "Verified runtime pack has no local root path; health command was not executed."
                            .to_owned();
                    return json!({
                        "id": entry.id,
                        "status": "unknown",
                        "reason": reason.clone(),
                        "evidence": skipped_health_evidence(&entry.health_command, None, reason),
                    });
                };
                let Some(version) = entry.version.as_deref() else {
                    let reason =
                        "Ready runtime catalog entry has no pinned version; health command was not executed."
                            .to_owned();
                    return json!({
                        "id": entry.id,
                        "status": "unknown",
                        "reason": reason.clone(),
                        "evidence": skipped_health_evidence(
                            &entry.health_command,
                            Some(root_path.to_owned()),
                            reason,
                        ),
                    });
                };
                if !is_safe_relative_path(&entry.id) || !is_safe_relative_path(version) {
                    let reason =
                        "Ready runtime pack has an unsafe installation path; health command was not executed."
                            .to_owned();
                    return json!({
                        "id": entry.id,
                        "status": "unknown",
                        "reason": reason.clone(),
                        "evidence": skipped_health_evidence(
                            &entry.health_command,
                            Some(root_path.to_owned()),
                            reason,
                        ),
                    });
                }
                let install_root = Path::new(root_path).join(&entry.id).join(version);
                if !is_inside(Path::new(root_path), &install_root) || !install_root.is_dir() {
                    let reason =
                        "Verified runtime pack installation directory is unavailable; health command was not executed."
                            .to_owned();
                    return json!({
                        "id": entry.id,
                        "status": "unknown",
                        "reason": reason.clone(),
                        "evidence": skipped_health_evidence(
                            &entry.health_command,
                            Some(install_root.to_string_lossy().into_owned()),
                            reason,
                        ),
                    });
                }

                match run_health_command(
                    &install_root,
                    &entry.health_command,
                    &entry.archive.executable_paths,
                ) {
                    Ok(result) => {
                        let HealthCommandResult {
                            passed,
                            reason,
                            evidence,
                        } = result;
                        json!({
                            "id": entry.id,
                            "status": if passed { "ready" } else { "failed" },
                            "reason": reason,
                            "evidence": evidence,
                        })
                    }
                    Err(error) => json!({
                        "id": entry.id,
                        "status": "failed",
                        "reason": error.clone(),
                        "evidence": skipped_health_evidence(
                            &entry.health_command,
                            Some(install_root.to_string_lossy().into_owned()),
                            error,
                        ),
                    }),
                }
            })
            .collect::<Vec<_>>();
        Ok(json!({"protocolVersion": PROTOCOL_VERSION, "packs": statuses}))
    }

    fn open_folder(&self, payload: &Value) -> Result<Value, String> {
        let path = payload
            .get("rootPath")
            .or_else(|| payload.get("path"))
            .and_then(Value::as_str)
            .map(PathBuf::from)
            .unwrap_or_else(|| self.selected_root());
        if !path.is_dir() {
            return Err(format!(
                "Runtime root '{}' is not a directory.",
                path.display()
            ));
        }
        #[cfg(windows)]
        {
            Command::new("explorer.exe")
                .arg(&path)
                .spawn()
                .map_err(|error| error.to_string())?;
        }
        Ok(json!({"protocolVersion": PROTOCOL_VERSION, "openedPath": path.to_string_lossy()}))
    }

    fn save_job(&self, job: RuntimeJob) -> Result<(), String> {
        let persisted = job.clone();
        self.state
            .jobs
            .lock()
            .map_err(|_| "Runtime job state is unavailable.".to_owned())?
            .insert(job.job_id.clone(), job);
        self.persist_job(&persisted)
    }

    fn update_job<F>(&self, job_id: &str, update: F)
    where
        F: FnOnce(&mut RuntimeJob),
    {
        let updated = if let Ok(mut jobs) = self.state.jobs.lock() {
            if let Some(job) = jobs.get_mut(job_id) {
                update(job);
                job.updated_at = now();
                Some(job.clone())
            } else {
                None
            }
        } else {
            None
        };
        if let Some(job) = updated {
            let _ = self.persist_job(&job);
        }
    }

    fn persist_job(&self, job: &RuntimeJob) -> Result<(), String> {
        let db_path = self.database_path();
        if !db_path.is_file() {
            return Ok(());
        }
        let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
        let pack_ids = serde_json::to_string(&job.pack_ids).map_err(|error| error.to_string())?;
        let progress = job
            .progress
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT INTO runtime_jobs (job_id, operation, status, pack_ids_json, progress_json, reason, started_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(job_id) DO UPDATE SET status = excluded.status, progress_json = excluded.progress_json, reason = excluded.reason, updated_at = excluded.updated_at",
                params![
                    &job.job_id,
                    &job.operation,
                    &job.status,
                    &pack_ids,
                    &progress,
                    &job.reason,
                    job.started_at,
                    job.updated_at,
                ],
            )
            .map_err(|error| format!("Unable to persist runtime job: {error}"))?;
        Ok(())
    }

    fn finish_job(&self, job_id: &str, status: &str, reason: Option<String>) {
        self.update_job(job_id, |job| {
            job.status = status.to_owned();
            job.reason = reason;
        });
        if let Ok(mut cancelled) = self.state.cancelled_jobs.lock() {
            cancelled.remove(job_id);
        }
    }

    fn is_cancelled(&self, job_id: &str) -> bool {
        self.state
            .cancelled_jobs
            .lock()
            .map(|jobs| jobs.contains(job_id))
            .unwrap_or(true)
    }

    fn record_evidence(
        &self,
        entry: &RuntimeCatalogEntry,
        root: &Path,
        executable: &Path,
        executable_sha: &str,
        source_sha: &str,
    ) -> Result<(), String> {
        let db_path = self.database_path();
        if !db_path.is_file() {
            return Ok(());
        }
        let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
        let entry_id = entry.id.clone();
        let entry_version = entry.version.clone().unwrap_or_default();
        let root_path = root.to_string_lossy().into_owned();
        let executable_path = executable.to_string_lossy().into_owned();
        let evidence_id = format!("{}-{}", entry_id, now_nanos());
        connection.execute(
            "INSERT OR REPLACE INTO runtime_evidence (evidence_id, pack_id, version, root_path, executable_path, artifact_sha256, executable_sha256, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'Passed', ?8)",
            params![
                evidence_id,
                &entry_id,
                &entry_version,
                &root_path,
                &executable_path,
                source_sha,
                executable_sha,
                now(),
            ],
        ).map_err(|error| format!("Unable to persist runtime evidence: {error}"))?;
        let pack_key = format!("{}@{}:{}", entry_id, entry_version, root_path);
        connection
            .execute(
                "INSERT OR REPLACE INTO runtime_installed_packs (pack_key, pack_id, version, architecture, source_sha256, executable_sha256, root_path, verified, license_accepted, health_status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 1, 'Passed', ?8)",
                params![
                    pack_key,
                    &entry_id,
                    &entry_version,
                    TARGET_ARCHITECTURE,
                    source_sha,
                    executable_sha,
                    &root_path,
                    now(),
                ],
            )
            .map_err(|error| format!("Unable to persist installed runtime pack: {error}"))?;
        if let Some(spdx) = entry.license.spdx.as_deref() {
            connection
                .execute(
                    "INSERT OR REPLACE INTO runtime_licenses (license_key, pack_id, version, spdx, license_sha256, accepted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        format!("{}@{}", entry_id, entry_version),
                        &entry_id,
                        &entry_version,
                        spdx,
                        entry.license.sha256.as_deref(),
                        now(),
                    ],
                )
                .map_err(|error| format!("Unable to persist runtime license acceptance: {error}"))?;
        }
        Ok(())
    }
}

fn required_string(payload: &Value, names: &[&str]) -> Result<String, String> {
    names
        .iter()
        .find_map(|name| {
            payload
                .get(*name)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        })
        .ok_or_else(|| format!("Runtime payload requires one of: {}.", names.join(", ")))
}

fn read_manifest(root: &Path) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(root.join("manifest.json")).ok()?).ok()
}

fn load_selected_root(workspace: &Path) -> Option<PathBuf> {
    let database = workspace
        .join(".automate-plus")
        .join("automate-plus.sqlite");
    if !database.is_file() {
        return None;
    }
    let connection = Connection::open(database).ok()?;
    connection
        .query_row(
            "SELECT root_path FROM runtime_roots WHERE selected = 1 ORDER BY updated_at DESC LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .map(PathBuf::from)
}

fn find_installed_pack<'a>(report: &'a Value, entry: &RuntimeCatalogEntry) -> Option<&'a Value> {
    let roots = report.get("roots").and_then(Value::as_array)?;
    roots.iter().find_map(|root| {
        root.get("installedPacks")
            .and_then(Value::as_array)
            .and_then(|packs| {
                packs
                    .iter()
                    .find(|pack| installed_pack_matches(pack, entry))
            })
    })
}

fn installed_pack_matches(pack: &Value, entry: &RuntimeCatalogEntry) -> bool {
    pack.get("id").and_then(Value::as_str) == Some(entry.id.as_str())
        && pack.get("version").and_then(Value::as_str) == entry.version.as_deref()
        && pack.get("architecture").and_then(Value::as_str) == Some(TARGET_ARCHITECTURE)
        && pack.get("sourceSha256").and_then(Value::as_str) == entry.source.sha256.as_deref()
}

fn inspect_manifest_pack(
    root: &Path,
    pack: &Value,
    catalog: &RuntimeCatalog,
) -> Option<RuntimeInstalledPack> {
    let id = pack_id(pack)?;
    let version = pack.get("version").and_then(Value::as_str)?.to_owned();
    let architecture = pack
        .get("architecture")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let path_text = pack
        .get("path")
        .and_then(Value::as_str)
        .or_else(|| pack.get("executable").and_then(Value::as_str))?;
    if !is_safe_relative_path(path_text) {
        return None;
    }
    let path = root.join(path_text);
    if !is_inside(root, &path) || !path.is_file() {
        return None;
    }
    let sha256 = sha256_file(&path).ok()?;
    let entry = catalog.entries.iter().find(|entry| entry.id == id);
    let source_sha256 = pack
        .get("sourceSha256")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| entry.and_then(|entry| entry.source.sha256.clone()));
    let verified = pack.get("verified").and_then(Value::as_bool) == Some(true)
        && architecture == TARGET_ARCHITECTURE
        && pack
            .get("sha256")
            .and_then(Value::as_str)
            .is_some_and(|expected| expected.eq_ignore_ascii_case(&sha256))
        && entry.is_some_and(|entry| {
            entry.status.as_deref() == Some("Ready")
                && entry.version.as_deref() == Some(version.as_str())
                && entry.source.sha256.as_deref() == source_sha256.as_deref()
        })
        && pack.get("licenseAccepted").and_then(Value::as_bool) == Some(true)
        && pack.get("healthStatus").and_then(Value::as_str) == Some("Passed");
    Some(RuntimeInstalledPack {
        id,
        version,
        architecture,
        sha256,
        source_sha256,
        root_path: root.to_string_lossy().into_owned(),
        verified,
        license_accepted: pack.get("licenseAccepted").and_then(Value::as_bool) == Some(true),
        health: match pack.get("healthStatus").and_then(Value::as_str) {
            Some("Passed") => "ready",
            Some("Failed") => "failed",
            _ => "unknown",
        }
        .to_owned(),
    })
}

fn append_manifest_pack(
    root: &Path,
    entry: &RuntimeCatalogEntry,
    executable: &Path,
    executable_sha: &str,
    source_sha: &str,
) -> Result<(), String> {
    let mut manifest = read_manifest(root).unwrap_or_else(|| json!({"schemaVersion": 1, "product": "AutomatePlus", "architecture": TARGET_ARCHITECTURE, "packs": []}));
    let relative = executable
        .strip_prefix(root)
        .map_err(|_| "Installed executable is outside runtime root.".to_owned())?
        .to_string_lossy()
        .replace('\\', "/");
    let packs = manifest
        .get_mut("packs")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "runtime manifest packs must be an array.".to_owned())?;
    packs.retain(|pack| pack_id(pack).as_deref() != Some(entry.id.as_str()));
    packs.push(json!({
        "id": entry.id,
        "name": entry.id,
        "version": entry.version.clone(),
        "architecture": TARGET_ARCHITECTURE,
        "path": relative,
        "executable": relative,
        "sha256": executable_sha,
        "sourceSha256": source_sha,
        "verified": true,
        "license": entry.license.clone(),
        "licenseAccepted": true,
        "healthCommand": entry.health_command.clone(),
        "healthStatus": "Passed",
        "provides": entry.provides.clone(),
    }));
    write_manifest_atomic(root, &manifest)
}

fn append_imported_manifest_pack(root: &Path, pack: &Value) -> Result<(), String> {
    let mut manifest = read_manifest(root).unwrap_or_else(|| json!({"schemaVersion": 1, "product": "AutomatePlus", "architecture": TARGET_ARCHITECTURE, "packs": []}));
    let packs = manifest
        .get_mut("packs")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "runtime manifest packs must be an array.".to_owned())?;
    let Some(id) = pack_id(pack) else {
        return Err("Imported runtime pack has no id.".to_owned());
    };
    packs.retain(|candidate| pack_id(candidate).as_deref() != Some(id.as_str()));
    packs.push(pack.clone());
    write_manifest_atomic(root, &manifest)
}

fn write_manifest_atomic(root: &Path, manifest: &Value) -> Result<(), String> {
    let temporary = root.join("manifest.json.tmp");
    let content = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    let mut file = File::create(&temporary).map_err(|error| error.to_string())?;
    file.write_all(&content)
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    fs::rename(temporary, root.join("manifest.json"))
        .map_err(|error| format!("Unable to atomically publish runtime manifest: {error}"))
}

fn extract_zip(archive_path: &Path, destination: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|error| error.to_string())?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("ZIP archive is invalid: {error}"))?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let raw_name = entry.name().replace('\\', "/");
        if raw_name.is_empty() {
            continue;
        }
        if !is_safe_relative_path(&raw_name) {
            return Err(format!(
                "ZIP entry '{raw_name}' is outside the destination."
            ));
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(format!("ZIP symlink entry '{raw_name}' is not allowed."));
        }
        let output = destination.join(&raw_name);
        if !is_inside(destination, &output) {
            return Err("ZIP entry escapes extraction directory.".to_owned());
        }
        if entry.is_dir() {
            fs::create_dir_all(&output).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut target = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)
            .map_err(|error| error.to_string())?;
        io::copy(&mut entry, &mut target).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_safe_relative_path(&name) {
            return Err(format!("Import contains unsafe path '{name}'."));
        }
        let target = destination.join(&name);
        if file_type.is_symlink() {
            return Err("Symlinked files are not allowed in runtime imports.".to_owned());
        }
        if file_type.is_dir() {
            fs::create_dir_all(&target).map_err(|error| error.to_string())?;
            copy_tree(&entry.path(), &target)?;
        } else if file_type.is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            fs::copy(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn run_health_command(
    root: &Path,
    command: &[String],
    executable_allowlist: &[String],
) -> Result<HealthCommandResult, String> {
    let (program, args) = command
        .split_first()
        .ok_or_else(|| "health command is empty.".to_owned())?;
    if !is_safe_relative_path(program) || !executable_allowlist.iter().any(|path| path == program) {
        return Err("health command executable is not in the catalog allowlist.".to_owned());
    }
    if args
        .iter()
        .any(|argument| argument.chars().any(char::is_control))
    {
        return Err("health command arguments contain control characters.".to_owned());
    }
    let executable = root.join(program);
    if !is_inside(root, &executable) || !executable.is_file() {
        return Err("health command executable is missing from the installed pack.".to_owned());
    }
    let started = Instant::now();
    let mut child = Command::new(&executable)
        .args(args)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    loop {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            let passed = status.success();
            return Ok(HealthCommandResult {
                passed,
                reason: (!passed).then(|| {
                    status
                        .code()
                        .map(|code| format!("Health command exited with code {code}."))
                        .unwrap_or_else(|| {
                            "Health command terminated without an exit code.".to_owned()
                        })
                }),
                evidence: HealthCommandEvidence {
                    executed: true,
                    root_path: Some(root.to_string_lossy().into_owned()),
                    command: command.to_vec(),
                    duration_ms: started.elapsed().as_millis() as u64,
                    exit_code: status.code(),
                    timed_out: false,
                    error: None,
                },
            });
        }
        if started.elapsed() >= Duration::from_secs(HEALTH_COMMAND_TIMEOUT_SECONDS) {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(HealthCommandResult {
                passed: false,
                reason: Some(format!(
                    "Health command timed out after {HEALTH_COMMAND_TIMEOUT_SECONDS} seconds."
                )),
                evidence: HealthCommandEvidence {
                    executed: true,
                    root_path: Some(root.to_string_lossy().into_owned()),
                    command: command.to_vec(),
                    duration_ms: started.elapsed().as_millis() as u64,
                    exit_code: None,
                    timed_out: true,
                    error: None,
                },
            });
        }
        thread::sleep(Duration::from_millis(50));
    }
}

fn skipped_health_evidence(
    command: &[String],
    root_path: Option<String>,
    error: String,
) -> HealthCommandEvidence {
    HealthCommandEvidence {
        executed: false,
        root_path,
        command: command.to_vec(),
        duration_ms: 0,
        exit_code: None,
        timed_out: false,
        error: Some(error),
    }
}

fn pack_id(pack: &Value) -> Option<String> {
    pack.get("id")
        .and_then(Value::as_str)
        .or_else(|| pack.get("name").and_then(Value::as_str))
        .map(str::to_owned)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex_digest(hasher.finalize()))
}

fn hex_digest(digest: impl AsRef<[u8]>) -> String {
    digest
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn is_inside(base: &Path, candidate: &Path) -> bool {
    let Ok(base) = base.canonicalize() else {
        return false;
    };
    let candidate = if candidate.exists() {
        candidate.canonicalize().ok()
    } else {
        candidate
            .parent()
            .and_then(|parent| parent.canonicalize().ok())
            .map(|parent| parent.join(candidate.file_name().unwrap_or_default()))
    };
    candidate.is_some_and(|candidate| candidate.starts_with(base))
}

fn is_writable(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    let probe = path.join(format!(".automate-plus-write-test-{}", std::process::id()));
    match OpenOptions::new().write(true).create_new(true).open(&probe) {
        Ok(_) => fs::remove_file(probe).is_ok(),
        Err(_) => false,
    }
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn root_source(path: &Path, workspace: &Path) -> String {
    if path_key(path) == path_key(&workspace.join("runtime-packs")) {
        return "workspace".to_owned();
    }
    if path_key(path) == path_key(&workspace.join("resources").join("runtime-packs")) {
        return "bundled".to_owned();
    }
    if std::env::var_os("LOCALAPPDATA").is_some_and(|value| {
        path_key(path)
            == path_key(
                &PathBuf::from(value)
                    .join("AutomatePlus")
                    .join("runtime-packs"),
            )
    }) {
        return "local-app-data".to_owned();
    }
    if std::env::var_os("ProgramData").is_some_and(|value| {
        path_key(path)
            == path_key(
                &PathBuf::from(value)
                    .join("AutomatePlus")
                    .join("runtime-packs"),
            )
    }) {
        return "program-data".to_owned();
    }
    "selected".to_owned()
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}
fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_paths_outside_root() {
        let root = std::env::temp_dir().join(format!("automateplus-runtime-{}", now_nanos()));
        fs::create_dir_all(&root).expect("test root");
        assert!(!is_inside(&root, &root.join("..").join("outside")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn progress_limit_is_positive_and_hashes_are_strict() {
        assert!(MAX_DOWNLOAD_BYTES > 0);
        assert!(is_sha256(&"a".repeat(64)));
    }
}
