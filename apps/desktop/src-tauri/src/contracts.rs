use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;

pub const CONTRACT_VERSION: u32 = 1;
pub const PROTOCOL_VERSION: &str = "1.0";

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceProfile {
    pub schema_version: u32,
    pub device_id: String,
    pub adb_serial: String,
    pub model: String,
    pub manufacturer: String,
    pub product: String,
    pub android_version: String,
    pub sdk_version: u32,
    pub is_emulator: bool,
    pub resolution: Resolution,
    pub density: u32,
    pub orientation: String,
    pub transport: String,
    pub status: String,
    pub health_state: String,
    pub last_seen_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FarmRunSpec {
    pub schema_version: u32,
    pub session_id: String,
    pub strategy: String,
    pub device_group_id: Option<String>,
    pub device_ids: Option<Vec<String>>,
    pub iterations_per_device: Option<u32>,
    pub total_iterations: Option<u32>,
    pub max_parallel_devices: u32,
    pub iteration_delay_ms: u64,
    pub failure_policy: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FarmCommandArgs {
    pub session: Value,
    pub spec: FarmRunSpec,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceGroupCommandArgs {
    pub group: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceGroupDeleteArgs {
    pub group_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortValidateArgs {
    pub ports: Vec<u16>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortAllocateArgs {
    pub run_id: String,
    pub device_id: String,
    pub count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortReleaseArgs {
    pub lease_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStartArgs {
    pub executable: String,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStopArgs {
    pub process_id: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingCommandArgs {
    pub session: Value,
    pub plan: RecordingPlanInput,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingPlanInput {
    pub primary_device_id: String,
    #[serde(default)]
    pub follower_device_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecordingPlan {
    pub primary_device_id: String,
    pub follower_device_ids: Vec<String>,
}

impl RecordingPlan {
    pub fn from_args(
        args: RecordingCommandArgs,
        devices: &[DeviceProfile],
    ) -> Result<Self, String> {
        let available = devices
            .iter()
            .filter(|device| device.status == "device")
            .map(|device| device.device_id.as_str())
            .collect::<std::collections::HashSet<_>>();
        if !available.contains(args.plan.primary_device_id.as_str()) {
            return Err(
                "Primary device is not present and authorized in the real ADB snapshot.".to_owned(),
            );
        }
        if args
            .plan
            .follower_device_ids
            .iter()
            .any(|id| !available.contains(id.as_str()))
        {
            return Err(
                "Every follower must be present and authorized in the real ADB snapshot."
                    .to_owned(),
            );
        }
        let primary_device_id = args.plan.primary_device_id;
        let follower_device_ids = args
            .plan
            .follower_device_ids
            .into_iter()
            .filter(|id| id != &primary_device_id)
            .collect();
        Ok(Self {
            primary_device_id,
            follower_device_ids,
        })
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeCapabilities {
    pub device_discovery: bool,
    pub android_recording: bool,
    pub farm_replay: bool,
    pub native_execution: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHealth {
    pub protocol_version: String,
    pub host: String,
    pub state: String,
    pub available: bool,
    pub status: String,
    pub reason: String,
    pub missing_prerequisites: Vec<String>,
    pub capabilities: NativeCapabilities,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRunArgs {
    pub session: Value,
    pub framework: String,
    pub language: String,
}
impl NativeRunArgs {
    pub fn session_id(&self) -> String {
        self.session
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("unknown-session")
            .to_owned()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    pub run_id: String,
    pub session_id: String,
    pub status: String,
    pub passed_steps: u32,
    pub failed_steps: u32,
    pub total_steps: u32,
    pub duration_ms: u64,
    pub error: Option<String>,
}
impl RunSummary {
    pub fn blocked(session_id: String, error: String) -> Self {
        Self {
            run_id: runtime_id("run"),
            session_id,
            status: "blocked".to_owned(),
            passed_steps: 0,
            failed_steps: 0,
            total_steps: 0,
            duration_ms: 0,
            error: Some(error),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRunResult {
    pub device_run_id: String,
    pub device_id: String,
    pub adb_serial: String,
    pub model: String,
    pub status: String,
    pub planned_iterations: u32,
    pub completed_iterations: u32,
    pub passed_iterations: u32,
    pub failed_iterations: u32,
    pub duration_ms: u64,
    pub iterations: Vec<Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyFarmSummary {
    pub farm_run_id: String,
    pub session_id: String,
    pub strategy: String,
    pub failure_policy: String,
    pub status: String,
    pub total_planned_iterations: u32,
    pub total_completed_iterations: u32,
    pub total_passed_iterations: u32,
    pub total_failed_iterations: u32,
    pub duration_ms: u64,
    pub device_runs: Vec<DeviceRunResult>,
    pub started_at: u64,
    pub finished_at: u64,
    pub error_summary: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRequest {
    pub protocol_version: String,
    pub kind: String,
    pub correlation_id: String,
    pub method: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeResponse {
    pub protocol_version: String,
    pub kind: String,
    pub correlation_id: String,
    pub method: String,
    pub payload: Value,
}

impl NativeRequest {
    pub fn validate(&self) -> Result<(), String> {
        if self.protocol_version != PROTOCOL_VERSION {
            return Err(format!(
                "Unsupported native protocol version '{}'.",
                self.protocol_version
            ));
        }
        if self.kind != "request" || !is_uuid(&self.correlation_id) {
            return Err("Native request envelope is invalid.".to_owned());
        }
        if !matches!(
            self.method.as_str(),
            "native.health"
                | "native.capabilities"
                | "devices.discover"
                | "device-groups.list"
                | "device-groups.create"
                | "device-groups.delete"
                | "ports.validate"
                | "ports.allocate"
                | "ports.release"
                | "process.start"
                | "process.stop"
                | "recording.start"
                | "recording.stop"
                | "farm.run.start"
                | "farm.run.cancel"
                | "artifacts.list"
                | "native.run"
                | "runtime.catalog.list"
                | "runtime.roots.scan"
                | "runtime.root.select"
                | "runtime.install.start"
                | "runtime.install.status"
                | "runtime.install.cancel"
                | "runtime.import"
                | "runtime.verify"
                | "runtime.health"
                | "runtime.open-folder"
        ) {
            return Err(format!("Unsupported native method '{}'.", self.method));
        }
        Ok(())
    }
    pub fn decode_payload<T: DeserializeOwned>(&self) -> Result<T, String> {
        serde_json::from_value(self.payload.clone())
            .map_err(|error| format!("Invalid payload for '{}': {error}", self.method))
    }
}

impl NativeResponse {
    pub fn success(request: NativeRequest, data: Value) -> Self {
        Self {
            protocol_version: PROTOCOL_VERSION.to_owned(),
            kind: "response".to_owned(),
            correlation_id: request.correlation_id,
            method: request.method,
            payload: serde_json::json!({"ok": true, "data": data}),
        }
    }

    pub fn failure(
        request: NativeRequest,
        code: &str,
        message: impl Into<String>,
        details: Value,
    ) -> Self {
        Self {
            protocol_version: PROTOCOL_VERSION.to_owned(),
            kind: "response".to_owned(),
            correlation_id: request.correlation_id,
            method: request.method,
            payload: serde_json::json!({
                "ok": false,
                "error": {
                    "code": code,
                    "name": "NativeHostError",
                    "message": message.into(),
                    "details": details
                }
            }),
        }
    }
}

fn is_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && [8, 13, 18, 23].iter().all(|index| bytes[*index] == b'-')
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit())
}

pub fn runtime_id(prefix: &str) -> String {
    format!(
        "{prefix}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}
