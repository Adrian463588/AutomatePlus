use crate::adb::AdbClient;
use crate::contracts::{DeviceProfile, NativeCapabilitySet, NativeHealth};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct PreflightReason {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreflightComponents {
    pub manifest_present: bool,
    pub verified_pack_count: usize,
    pub adb_path: Option<String>,
    pub appium_path: Option<String>,
    pub scrcpy_path: Option<String>,
    pub authorized_device_count: usize,
    pub webview2_available: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreflightReport {
    pub status: String,
    pub reason: String,
    pub reasons: Vec<PreflightReason>,
    pub adb_path: Option<String>,
    pub components: PreflightComponents,
    pub devices: Vec<DeviceProfile>,
}

pub struct Preflight;

impl Preflight {
    pub fn run() -> NativeHealth {
        let root = std::env::var_os("AUTOMATE_PLUS_WORKSPACE")
            .map(PathBuf::from)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| PathBuf::from("."));
        let report = run(&root);
        let ready = report.status == "ready";
        NativeHealth {
            protocol_version: "1.0".to_owned(),
            host: "tauri-rust".to_owned(),
            state: if ready { "ready" } else { "blocked" }.to_owned(),
            available: ready,
            status: report.status,
            reason: report.reason,
            missing_prerequisites: report
                .reasons
                .iter()
                .map(|item| item.code.clone())
                .collect(),
            capabilities: NativeCapabilitySet {
                device_discovery: report.components.adb_path.is_some(),
                android_recording: false,
                farm_replay: false,
                native_execution: false,
            },
        }
    }
}

pub fn run(root: &Path) -> PreflightReport {
    let runtime = runtime_root(root);
    let manifest_path = runtime.join("manifest.json");
    let mut reasons = Vec::new();
    let manifest = fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok());
    let manifest_present = manifest.is_some();
    let verified_pack_count = verify_packs(&runtime, manifest.as_ref(), &mut reasons);
    let adb_path = resolve_tool(&runtime, "adb");
    let devices = adb_path
        .as_ref()
        .and_then(|path| {
            AdbClient::new(path.to_string_lossy().into_owned())
                .discover()
                .ok()
        })
        .unwrap_or_default();
    if adb_path.is_none() {
        reasons.push(PreflightReason {
            code: "adb_missing".to_owned(),
            message: "ADB is unavailable in verified runtime-packs.".to_owned(),
        });
    }
    let appium_path = resolve_tool(&runtime, "appium");
    let scrcpy_path = resolve_tool(&runtime, "scrcpy");
    if appium_path.is_none() {
        reasons.push(PreflightReason {
            code: "appium_pack_missing".to_owned(),
            message: "Appium is unavailable in verified runtime-packs.".to_owned(),
        });
    }
    if scrcpy_path.is_none() {
        reasons.push(PreflightReason {
            code: "scrcpy_pack_missing".to_owned(),
            message: "scrcpy is unavailable in verified runtime-packs.".to_owned(),
        });
    }
    let authorized = devices
        .iter()
        .filter(|device| device.status == "device")
        .count();
    if authorized == 0 {
        reasons.push(PreflightReason {
            code: "authorized_device_missing".to_owned(),
            message: "No authorized real Android device was discovered.".to_owned(),
        });
    }
    if !webview2_available(root) {
        reasons.push(PreflightReason {
            code: "webview2_missing".to_owned(),
            message: "Fixed WebView2 runtime is not staged or installed.".to_owned(),
        });
    }
    if verified_pack_count == 0 {
        reasons.push(PreflightReason {
            code: "runtime_packs_unavailable".to_owned(),
            message: "No checksum-verified offline runtime packs are available.".to_owned(),
        });
    }
    reasons.push(PreflightReason {
        code: "android_recording_executor_missing".to_owned(),
        message: "The verified host does not contain a real Android recording executor.".to_owned(),
    });
    reasons.push(PreflightReason {
        code: "farm_executor_missing".to_owned(),
        message: "The verified host does not contain a real Appium farm executor.".to_owned(),
    });
    let reason = if reasons.is_empty() {
        "Native host is ready."
    } else {
        "Native host is blocked by missing verified prerequisites."
    };
    PreflightReport {
        status: if reasons.is_empty() {
            "ready".to_owned()
        } else {
            "blocked".to_owned()
        },
        reason: reason.to_owned(),
        reasons,
        adb_path: adb_path
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        components: PreflightComponents {
            manifest_present,
            verified_pack_count,
            adb_path: adb_path.map(|path| path.to_string_lossy().into_owned()),
            appium_path: appium_path.map(|path| path.to_string_lossy().into_owned()),
            scrcpy_path: scrcpy_path.map(|path| path.to_string_lossy().into_owned()),
            authorized_device_count: authorized,
            webview2_available: webview2_available(root),
        },
        devices,
    }
}

fn verify_packs(
    root: &Path,
    manifest: Option<&Value>,
    reasons: &mut Vec<PreflightReason>,
) -> usize {
    let Some(packs) = manifest
        .and_then(|value| value.get("packs"))
        .and_then(Value::as_array)
    else {
        return 0;
    };
    let mut verified = 0;
    for pack in packs {
        let Some(path_text) = pack.get("path").and_then(Value::as_str) else {
            continue;
        };
        let Some(expected) = pack.get("sha256").and_then(Value::as_str) else {
            continue;
        };
        let path = pack_path(root, path_text);
        if pack.get("verified").and_then(Value::as_bool) == Some(true)
            && is_runtime_path(root, &path)
            && sha256_file(&path).as_deref() == Some(expected)
        {
            verified += 1;
        } else {
            reasons.push(PreflightReason {
                code: "runtime_pack_unverified".to_owned(),
                message: format!(
                    "Runtime pack '{}' is missing or checksum-invalid.",
                    pack.get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("unnamed")
                ),
            });
        }
    }
    verified
}

fn pack_path(runtime: &Path, path_text: &str) -> PathBuf {
    let direct = runtime.join(path_text);
    if direct.exists() {
        return direct;
    }
    runtime
        .parent()
        .map(|parent| parent.join(path_text))
        .unwrap_or(direct)
}

fn resolve_tool(root: &Path, name: &str) -> Option<PathBuf> {
    let env_name = format!("AUTOMATE_PLUS_{}", name.to_ascii_uppercase());
    if let Some(value) = std::env::var_os(env_name) {
        let path = PathBuf::from(value);
        if is_runtime_path(root, &path) && is_verified_file(root, &path) {
            return Some(path);
        }
    }
    let extension = if cfg!(windows) { ".exe" } else { "" };
    let path = root.join("bin").join(format!("{name}{extension}"));
    (is_runtime_path(root, &path) && is_verified_file(root, &path)).then_some(path)
}

pub fn verified_tool_path(root: &Path, name: &str) -> Option<PathBuf> {
    let runtime = runtime_root(root);
    let extension = if cfg!(windows) { ".exe" } else { "" };
    let path = runtime.join("bin").join(format!("{name}{extension}"));
    (is_runtime_path(&runtime, &path) && is_verified_file(&runtime, &path)).then_some(path)
}

fn is_verified_file(runtime: &Path, candidate: &Path) -> bool {
    let manifest_path = runtime.join("manifest.json");
    let Some(manifest) = fs::read_to_string(manifest_path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
    else {
        return false;
    };
    let Ok(candidate) = candidate.canonicalize() else {
        return false;
    };
    manifest
        .get("packs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|pack| pack.get("verified").and_then(Value::as_bool) == Some(true))
        .filter_map(|pack| {
            let path_text = pack.get("path").and_then(Value::as_str)?;
            let expected = pack.get("sha256").and_then(Value::as_str)?;
            let path = pack_path(runtime, path_text);
            let canonical = path.canonicalize().ok()?;
            Some(canonical == candidate && sha256_file(&path).as_deref() == Some(expected))
        })
        .any(|verified| verified)
}

fn is_runtime_path(root: &Path, path: &Path) -> bool {
    let Ok(runtime) = root.canonicalize() else {
        return false;
    };
    let Ok(candidate) = path.canonicalize() else {
        return false;
    };
    candidate.is_file() && candidate.starts_with(runtime)
}
fn sha256_file(path: &Path) -> Option<String> {
    let mut hasher = Sha256::new();
    hasher.update(fs::read(path).ok()?);
    Some(
        hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    )
}
fn webview2_available(root: &Path) -> bool {
    root.join("webview2").is_dir()
        || [
            Path::new(r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application"),
            Path::new(r"C:\Program Files\Microsoft\EdgeWebView\Application"),
        ]
        .iter()
        .any(|path| path.is_dir())
}

fn runtime_root(root: &Path) -> PathBuf {
    let local = root.join("runtime-packs");
    if local.is_dir() {
        return local;
    }
    let bundled = root.join("resources").join("runtime-packs");
    if bundled.is_dir() {
        return bundled;
    }
    local
}
