mod adb;
mod contracts;
mod farm;
mod native_dialog;
mod persistence;
mod ports;
mod preflight;
mod process;
mod runtime;
mod runtime_catalog;

use contracts::{
    DeviceGroupCommandArgs, DeviceGroupDeleteArgs, FarmCommandArgs, NativeDialogPickArgs,
    NativeRequest, NativeResponse, NativeRunArgs, PortAllocateArgs, PortReleaseArgs,
    PortValidateArgs, ProcessStartArgs, ProcessStopArgs, RecordingCommandArgs, RecordingPlan,
};
use persistence::Database;
use ports::PortLeaseManager;
use preflight::Preflight;
use process::ProcessSupervisor;
use runtime::RuntimeManager;
use serde_json::{json, Value};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::State;

pub struct AppState {
    pub ports: PortLeaseManager,
    pub cancellation: Arc<AtomicBool>,
    pub database: Mutex<Option<Database>>,
    pub processes: ProcessSupervisor,
    pub runtime: RuntimeManager,
    instance_lock: Option<InstanceLock>,
}

impl AppState {
    fn new() -> Self {
        let instance_lock = InstanceLock::acquire(&workspace_root()).ok();
        let database = instance_lock
            .as_ref()
            .and_then(|_| Database::open_default().ok());
        if let Some(database) = &database {
            let _ = database.recover_stale_leases();
        }
        Self {
            ports: PortLeaseManager::default(),
            cancellation: Arc::new(AtomicBool::new(false)),
            database: Mutex::new(database),
            processes: ProcessSupervisor::default(),
            runtime: RuntimeManager::new(workspace_root()),
            instance_lock,
        }
    }

    fn health(&self) -> contracts::NativeHealth {
        let mut health = Preflight::run();
        if self.instance_lock.is_none() {
            health.state = "blocked".to_owned();
            health.status = "blocked".to_owned();
            health.available = false;
            health.reason =
                "Another AutomatePlus instance owns the local workspace lock.".to_owned();
            health
                .missing_prerequisites
                .push("single_instance_lock".to_owned());
            health.capabilities.device_discovery = false;
        }
        health
    }

    fn dispatch(&self, request: NativeRequest) -> NativeResponse {
        if let Err(message) = request.validate() {
            return NativeResponse::failure(request, "PROTOCOL_ERROR", message, json!({}));
        }

        if request.method.starts_with("runtime.") {
            let method = request.method.clone();
            return match self.runtime.dispatch(&method, request.payload.clone()) {
                Ok(data) => NativeResponse::success(request, data),
                Err(message) => NativeResponse::failure(
                    request,
                    if message.starts_with("NeedsReview:") {
                        "NEEDS_REVIEW"
                    } else {
                        "RUNTIME_BLOCKED"
                    },
                    message,
                    json!({ "state": "blocked" }),
                ),
            };
        }

        match request.method.as_str() {
            "native.health" => NativeResponse::success(
                request,
                serde_json::to_value(self.health()).unwrap_or_else(|_| json!({})),
            ),
            "native.capabilities" => {
                let health = self.health();
                NativeResponse::success(
                    request,
                    serde_json::to_value(health.capabilities).unwrap_or_else(|_| json!({})),
                )
            }
            "devices.discover" => match self.discover() {
                Ok(devices) => NativeResponse::success(request, json!({ "devices": devices })),
                Err(message) => NativeResponse::failure(
                    request,
                    "DEVICE_UNAVAILABLE",
                    message,
                    json!({ "state": "blocked" }),
                ),
            },
            "device-groups.list" => match self.list_groups() {
                Ok(groups) => NativeResponse::success(request, json!({ "groups": groups })),
                Err(message) => {
                    NativeResponse::failure(request, "RUNTIME_MISSING", message, json!({}))
                }
            },
            "device-groups.create" => {
                let args = match request.decode_payload::<DeviceGroupCommandArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                match self.save_group(args.group) {
                    Ok(group) => NativeResponse::success(request, group),
                    Err(message) => {
                        NativeResponse::failure(request, "DEVICE_UNAVAILABLE", message, json!({}))
                    }
                }
            }
            "device-groups.delete" => {
                let args = match request.decode_payload::<DeviceGroupDeleteArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                match self.delete_group(&args.group_id) {
                    Ok(deleted) => NativeResponse::success(request, json!({ "deleted": deleted })),
                    Err(message) => {
                        NativeResponse::failure(request, "RUNTIME_MISSING", message, json!({}))
                    }
                }
            }
            "ports.validate" => {
                let args = match request.decode_payload::<PortValidateArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                match self.ports.validate(&args.ports) {
                    Ok(()) => NativeResponse::success(request, json!({ "valid": true })),
                    Err(message) => NativeResponse::failure(
                        request,
                        "RUNTIME_MISSING",
                        message,
                        json!({ "valid": false }),
                    ),
                }
            }
            "ports.allocate" => {
                let args = match request.decode_payload::<PortAllocateArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                match self
                    .ports
                    .reserve(&args.run_id, &args.device_id, args.count)
                {
                    Ok((lease_id, ports)) => NativeResponse::success(
                        request,
                        json!({ "leaseId": lease_id, "ports": ports }),
                    ),
                    Err(message) => {
                        NativeResponse::failure(request, "RUNTIME_MISSING", message, json!({}))
                    }
                }
            }
            "ports.release" => {
                let args = match request.decode_payload::<PortReleaseArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                match self.ports.release(&args.lease_id) {
                    Ok(released) => {
                        NativeResponse::success(request, json!({ "released": released }))
                    }
                    Err(message) => {
                        NativeResponse::failure(request, "RUNTIME_MISSING", message, json!({}))
                    }
                }
            }
            "process.start" => {
                let args = match request.decode_payload::<ProcessStartArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                match self
                    .processes
                    .start(&workspace_root(), &args.executable, &args.args)
                {
                    Ok(process_id) => {
                        NativeResponse::success(request, json!({ "processId": process_id }))
                    }
                    Err(message) => {
                        NativeResponse::failure(request, "PATH_DENIED", message, json!({}))
                    }
                }
            }
            "process.stop" => {
                let args = match request.decode_payload::<ProcessStopArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                match self.processes.stop(args.process_id) {
                    Ok(stopped) => NativeResponse::success(request, json!({ "stopped": stopped })),
                    Err(message) => {
                        NativeResponse::failure(request, "PROCESS_TIMEOUT", message, json!({}))
                    }
                }
            }
            "recording.start" => {
                let args = match request.decode_payload::<RecordingCommandArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                match self.start_recording(args) {
                    Ok(value) => NativeResponse::success(request, value),
                    Err((code, message, details)) => {
                        NativeResponse::failure(request, code, message, details)
                    }
                }
            }
            "recording.stop" => NativeResponse::failure(
                request,
                "RUNTIME_MISSING",
                "No Android recording executor is available in the verified offline host.",
                json!({ "state": "blocked" }),
            ),
            "farm.run.start" => {
                let args = match request.decode_payload::<FarmCommandArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                match self.start_farm(args) {
                    Ok(value) => NativeResponse::success(request, value),
                    Err((code, message, details)) => {
                        NativeResponse::failure(request, code, message, details)
                    }
                }
            }
            "farm.run.cancel" => {
                self.cancellation.store(true, Ordering::SeqCst);
                let run_id = request.payload.get("runId").cloned().unwrap_or(Value::Null);
                NativeResponse::success(request, json!({ "runId": run_id, "cancelled": true }))
            }
            "artifacts.list" => {
                let run_id = request.payload.get("runId").and_then(Value::as_str);
                match self.list_artifacts(run_id) {
                    Ok(artifacts) => {
                        NativeResponse::success(request, json!({ "artifacts": artifacts }))
                    }
                    Err(message) => NativeResponse::failure(
                        request,
                        "RUNTIME_MISSING",
                        message,
                        json!({ "state": "blocked" }),
                    ),
                }
            }
            "native.run" => {
                let args = match request.decode_payload::<NativeRunArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                let health = self.health();
                let code = if health.capabilities.native_execution {
                    "CAPABILITY_ERROR"
                } else {
                    "RUNTIME_MISSING"
                };
                NativeResponse::failure(
                    request,
                    code,
                    if health.missing_prerequisites.is_empty() {
                        "Native execution has no verified executor implementation.".to_owned()
                    } else {
                        format_blocked(&health)
                    },
                    json!({
                        "sessionId": args.session_id(),
                        "framework": args.framework,
                        "language": args.language,
                        "state": "blocked"
                    }),
                )
            }
            "native.dialog.pick" => {
                let args = match request.decode_payload::<NativeDialogPickArgs>() {
                    Ok(args) => args,
                    Err(message) => {
                        return NativeResponse::failure(
                            request,
                            "PROTOCOL_ERROR",
                            message,
                            json!({}),
                        )
                    }
                };
                if let Err(message) = args.validate() {
                    return NativeResponse::failure(request, "PROTOCOL_ERROR", message, json!({}));
                }
                match native_dialog::pick(args) {
                    Ok(data) => NativeResponse::success(request, data),
                    Err(message) => NativeResponse::failure(
                        request,
                        "DIALOG_ERROR",
                        message,
                        json!({ "state": "blocked" }),
                    ),
                }
            }
            _ => NativeResponse::failure(
                request,
                "PROTOCOL_ERROR",
                "Unsupported native method.",
                json!({}),
            ),
        }
    }

    fn discover(&self) -> Result<Vec<contracts::DeviceProfile>, String> {
        if self.instance_lock.is_none() {
            return Err("Another AutomatePlus instance owns the local workspace lock.".to_owned());
        }
        let report = preflight::run(&workspace_root());
        let adb = report
            .adb_path
            .ok_or_else(|| "ADB is unavailable in the verified offline runtime pack.".to_owned())?;
        let devices = adb::AdbClient::new(adb).discover()?;
        if let Ok(guard) = self.database.lock() {
            if let Some(database) = guard.as_ref() {
                database
                    .save_devices(&devices)
                    .map_err(|error| error.to_string())?;
            }
        }
        Ok(devices)
    }

    fn list_groups(&self) -> Result<Vec<Value>, String> {
        let guard = self
            .database
            .lock()
            .map_err(|_| "Database state is unavailable.".to_owned())?;
        guard
            .as_ref()
            .ok_or_else(|| "SQLite database is unavailable; device groups are blocked.".to_owned())?
            .list_groups()
            .map_err(|error| error.to_string())
    }

    fn save_group(&self, group: Value) -> Result<Value, String> {
        let id = group
            .get("id")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "Device group id is required.".to_owned())?;
        let name = group
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Device group name is required.".to_owned())?;
        let device_ids = group
            .get("deviceIds")
            .and_then(Value::as_array)
            .ok_or_else(|| "Device group deviceIds must be an array.".to_owned())?;
        let ids = device_ids
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .filter(|id| !id.trim().is_empty())
                    .map(str::to_owned)
                    .ok_or_else(|| "Device group contains an invalid device id.".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()?;
        if ids.is_empty() || ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len()
        {
            return Err("Device group must contain unique real device ids.".to_owned());
        }
        if let Some(primary) = group.get("primaryDeviceId").and_then(Value::as_str) {
            if !ids.iter().any(|id| id == primary) {
                return Err("Primary device must belong to the device group.".to_owned());
            }
        }
        let guard = self
            .database
            .lock()
            .map_err(|_| "Database state is unavailable.".to_owned())?;
        let database = guard.as_ref().ok_or_else(|| {
            "SQLite database is unavailable; device groups are blocked.".to_owned()
        })?;
        let known_ids = database
            .known_device_ids()
            .map_err(|error| error.to_string())?;
        if ids.iter().any(|id| !known_ids.contains(id)) {
            return Err(
                "Every device group member must exist in the latest real ADB snapshot.".to_owned(),
            );
        }
        database
            .save_group(
                id,
                name,
                &ids,
                group.get("primaryDeviceId").and_then(Value::as_str),
            )
            .map_err(|error| error.to_string())
    }

    fn delete_group(&self, group_id: &str) -> Result<bool, String> {
        if group_id.trim().is_empty() {
            return Err("Device group id is required.".to_owned());
        }
        let guard = self
            .database
            .lock()
            .map_err(|_| "Database state is unavailable.".to_owned())?;
        guard
            .as_ref()
            .ok_or_else(|| "SQLite database is unavailable; device groups are blocked.".to_owned())?
            .delete_group(group_id)
            .map_err(|error| error.to_string())
    }

    fn list_artifacts(&self, run_id: Option<&str>) -> Result<Vec<Value>, String> {
        let guard = self
            .database
            .lock()
            .map_err(|_| "Database state is unavailable.".to_owned())?;
        guard
            .as_ref()
            .ok_or_else(|| "SQLite database is unavailable; artifacts are blocked.".to_owned())?
            .list_artifacts(run_id)
            .map_err(|error| error.to_string())
    }

    fn start_recording(
        &self,
        args: RecordingCommandArgs,
    ) -> Result<Value, (&'static str, String, Value)> {
        let health = Preflight::run();
        let devices = self
            .discover()
            .map_err(|message| ("DEVICE_UNAVAILABLE", message, json!({})))?;
        let plan = RecordingPlan::from_args(args, &devices)
            .map_err(|message| ("DEVICE_UNAVAILABLE", message, json!({})))?;
        if !health.capabilities.android_recording {
            return Err((
                "RUNTIME_MISSING",
                format_blocked(&health),
                json!({ "recording": plan }),
            ));
        }
        Err((
            "CAPABILITY_ERROR",
            "Android recording executor is not bundled in this verified offline host.".to_owned(),
            json!({ "recording": plan }),
        ))
    }

    fn start_farm(&self, args: FarmCommandArgs) -> Result<Value, (&'static str, String, Value)> {
        self.cancellation.store(false, Ordering::SeqCst);
        let health = Preflight::run();
        if !health.capabilities.farm_replay {
            return Err((
                "RUNTIME_MISSING",
                format_blocked(&health),
                json!({ "strategy": args.spec.strategy }),
            ));
        }
        if let Err(message) = farm::validate_spec(&args.spec) {
            return Err(("PROTOCOL_ERROR", message, json!({})));
        }
        Err((
            "CAPABILITY_ERROR",
            "Farm replay executor is not implemented in the verified host; execution was not attempted."
                .to_owned(),
            json!({ "strategy": args.spec.strategy, "state": "blocked" }),
        ))
    }
}

struct InstanceLock {
    path: PathBuf,
    _file: File,
}

impl InstanceLock {
    fn acquire(root: &Path) -> std::io::Result<Self> {
        let directory = root.join(".automate-plus");
        fs::create_dir_all(&directory)?;
        let path = directory.join("instance.lock");
        let mut file = match Self::create(&path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if !Self::is_stale(&path) {
                    return Err(error);
                }
                fs::remove_file(&path)?;
                Self::create(&path)?
            }
            Err(error) => return Err(error),
        };
        writeln!(file, "{}", std::process::id())?;
        Ok(Self { path, _file: file })
    }

    fn create(path: &Path) -> std::io::Result<File> {
        OpenOptions::new().write(true).create_new(true).open(path)
    }

    fn is_stale(path: &Path) -> bool {
        let Ok(contents) = fs::read_to_string(path) else {
            return false;
        };
        let Ok(pid) = contents.trim().parse::<u32>() else {
            return false;
        };
        !process_is_running(pid)
    }
}

fn process_is_running(pid: u32) -> bool {
    #[cfg(windows)]
    {
        let filter = format!("PID eq {pid}");
        return Command::new("tasklist")
            .args(["/FI", filter.as_str(), "/FO", "CSV", "/NH"])
            .output()
            .map(|output| {
                output.status.success()
                    && String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .any(|line| !line.trim().is_empty() && !line.contains("No tasks"))
            })
            .unwrap_or(true);
    }
    #[cfg(not(windows))]
    {
        PathBuf::from(format!("/proc/{pid}")).is_dir()
    }
}

impl Drop for InstanceLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn workspace_root() -> std::path::PathBuf {
    std::env::var_os("AUTOMATE_PLUS_WORKSPACE")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(std::path::Path::to_path_buf))
        })
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

fn format_blocked(health: &contracts::NativeHealth) -> String {
    if health.missing_prerequisites.is_empty() {
        health.reason.clone()
    } else {
        format!(
            "{} Missing: {}",
            health.reason,
            health.missing_prerequisites.join(", ")
        )
    }
}

#[tauri::command]
fn automate_plus_dispatch(state: State<'_, AppState>, request: NativeRequest) -> NativeResponse {
    state.dispatch(request)
}

pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![automate_plus_dispatch])
        .run(tauri::generate_context!())
}

#[cfg(test)]
mod tests {
    use super::contracts::{NativeDialogPickArgs, NativeRequest};
    use serde_json::json;

    #[test]
    fn rejects_non_versioned_requests() {
        let request = NativeRequest {
            protocol_version: "0.9".to_owned(),
            kind: "request".to_owned(),
            correlation_id: "not-a-uuid".to_owned(),
            method: "native.health".to_owned(),
            payload: json!({}),
        };
        assert!(request.validate().is_err());
    }

    #[test]
    fn validates_native_dialog_pick_contract() {
        let request = NativeRequest {
            protocol_version: "1.0".to_owned(),
            kind: "request".to_owned(),
            correlation_id: "550e8400-e29b-41d4-a716-446655440000".to_owned(),
            method: "native.dialog.pick".to_owned(),
            payload: json!({
                "mode": "file",
                "title": "Import runtime archive",
                "filters": [{ "name": "AutomatePlus Runtime ZIP", "extensions": ["zip"] }]
            }),
        };
        assert!(request.validate().is_ok());
        let args: NativeDialogPickArgs = request.decode_payload().expect("valid dialog payload");
        assert!(args.validate().is_ok());
    }

    #[test]
    fn rejects_filters_for_folder_picker() {
        let request = NativeRequest {
            protocol_version: "1.0".to_owned(),
            kind: "request".to_owned(),
            correlation_id: "550e8400-e29b-41d4-a716-446655440000".to_owned(),
            method: "native.dialog.pick".to_owned(),
            payload: json!({
                "mode": "folder",
                "title": "Choose workspace",
                "filters": [{ "name": "ZIP", "extensions": ["zip"] }]
            }),
        };
        let args: NativeDialogPickArgs =
            request.decode_payload().expect("decodable dialog payload");
        assert!(args.validate().is_err());
    }
}
