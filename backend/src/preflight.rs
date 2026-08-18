use crate::adb::AdbClient;
use crate::contracts::{DeviceProfile, NativeCapabilities, NativeHealth};
use crate::runtime_catalog::discover_known_roots;
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
    pub host_ready: bool,
    pub manifest_present: bool,
    pub manifest_valid: bool,
    pub runtime_packs_ready: bool,
    pub verified_pack_count: usize,
    pub adb_path: Option<String>,
    pub appium_path: Option<String>,
    pub scrcpy_path: Option<String>,
    pub node_path: Option<String>,
    pub authorized_device_count: usize,
    pub webview2_available: bool,
    pub capabilities: NativeCapabilities,
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
        let host_ready = report.components.host_ready;
        NativeHealth {
            protocol_version: "1.0".to_owned(),
            host: "tauri-rust".to_owned(),
            state: if host_ready { "ready" } else { "blocked" }.to_owned(),
            available: host_ready,
            status: report.status,
            reason: report.reason,
            missing_prerequisites: report
                .reasons
                .iter()
                .map(|item| item.code.clone())
                .collect(),
            capabilities: report.components.capabilities,
        }
    }
}

pub fn run(root: &Path) -> PreflightReport {
    let runtime = runtime_root(root);
    let manifest_path = runtime.join("manifest.json");
    let mut reasons = Vec::new();
    let manifest_present = manifest_path.is_file();
    let manifest = fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok());
    let manifest_valid = manifest.as_ref().map(manifest_is_valid).unwrap_or(false);
    if !manifest_present {
        reasons.push(PreflightReason {
            code: "runtime_manifest_missing".to_owned(),
            message: "The offline runtime-packs manifest is missing.".to_owned(),
        });
    } else if !manifest_valid {
        reasons.push(PreflightReason {
            code: "runtime_manifest_invalid".to_owned(),
            message: "The offline runtime-packs manifest is invalid.".to_owned(),
        });
    }
    let verified_pack_count = if manifest_valid {
        verify_packs(&runtime, manifest.as_ref(), &mut reasons)
    } else {
        0
    };
    if manifest_valid && verified_pack_count == 0 {
        reasons.push(PreflightReason {
            code: "runtime_packs_unavailable".to_owned(),
            message: "No checksum- and license-verified offline runtime packs are available."
                .to_owned(),
        });
    }
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
    let node_path = resolve_tool(&runtime, "node");
    let authorized = devices
        .iter()
        .filter(|device| device.status == "device")
        .count();
    if adb_path.is_some() && authorized == 0 {
        reasons.push(PreflightReason {
            code: "authorized_device_missing".to_owned(),
            message: "No authorized real Android device was discovered.".to_owned(),
        });
    }
    let webview2_available = webview2_available(root);
    if !webview2_available {
        reasons.push(PreflightReason {
            code: "webview2_missing".to_owned(),
            message: "Fixed WebView2 runtime is not staged or installed.".to_owned(),
        });
    }
    let capabilities = capabilities(
        &runtime,
        manifest.as_ref(),
        adb_path.as_ref(),
        appium_path.as_ref(),
        scrcpy_path.as_ref(),
        node_path.as_ref(),
        authorized,
        webview2_available,
    );
    let host_ready = webview2_available;
    let unavailable_capabilities = [
        (!capabilities.device_discovery, "device discovery"),
        (!capabilities.android_recording, "Android recording"),
        (!capabilities.farm_replay, "farm replay"),
        (!capabilities.native_execution, "native execution"),
    ]
    .into_iter()
    .filter_map(|(available, name)| (!available).then_some(name))
    .collect::<Vec<_>>();
    let reason = if reasons.is_empty() {
        if unavailable_capabilities.is_empty() {
            "Native host and verified runtime capabilities are ready.".to_owned()
        } else {
            format!(
                "Native host is ready; unavailable capabilities: {}.",
                unavailable_capabilities.join(", ")
            )
        }
    } else {
        format!(
            "Native host is {}; missing verified prerequisites: {}.",
            if host_ready { "running" } else { "blocked" },
            reasons
                .iter()
                .map(|item| item.code.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )
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
            host_ready,
            manifest_present,
            manifest_valid,
            runtime_packs_ready: manifest_valid && verified_pack_count > 0,
            verified_pack_count,
            adb_path: adb_path.map(|path| path.to_string_lossy().into_owned()),
            appium_path: appium_path.map(|path| path.to_string_lossy().into_owned()),
            scrcpy_path: scrcpy_path.map(|path| path.to_string_lossy().into_owned()),
            node_path: node_path.map(|path| path.to_string_lossy().into_owned()),
            authorized_device_count: authorized,
            webview2_available: host_ready,
            capabilities,
        },
        devices,
    }
}

fn verify_packs(
    root: &Path,
    manifest: Option<&Value>,
    reasons: &mut Vec<PreflightReason>,
) -> usize {
    let architecture = manifest
        .and_then(|value| value.get("architecture"))
        .and_then(Value::as_str)
        .unwrap_or("win-x64");
    let Some(packs) = manifest
        .and_then(|value| value.get("packs"))
        .and_then(Value::as_array)
    else {
        return 0;
    };
    let mut verified = 0;
    for pack in packs {
        if pack_is_verified(root, pack, architecture) {
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

fn manifest_is_valid(manifest: &Value) -> bool {
    manifest
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .is_some()
        && manifest.get("product").and_then(Value::as_str) == Some("AutomatePlus")
        && manifest
            .get("architecture")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
        && manifest.get("packs").and_then(Value::as_array).is_some()
}

fn pack_is_verified(runtime: &Path, pack: &Value, architecture: &str) -> bool {
    let Some(path_text) = pack.get("path").and_then(Value::as_str) else {
        return false;
    };
    let Some(expected) = pack.get("sha256").and_then(Value::as_str) else {
        return false;
    };
    let path = pack_path(runtime, path_text);
    pack.get("verified").and_then(Value::as_bool) == Some(true)
        && pack
            .get("name")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
        && pack
            .get("version")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
        && pack
            .get("executable")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
        && pack.get("architecture").and_then(Value::as_str) == Some(architecture)
        && license_metadata_is_valid(runtime, pack)
        && health_command_is_valid(pack)
        && is_runtime_path(runtime, &path)
        && sha256_file(&path)
            .as_deref()
            .is_some_and(|actual| actual.eq_ignore_ascii_case(expected))
}

fn license_metadata_is_valid(runtime: &Path, pack: &Value) -> bool {
    if pack
        .get("license")
        .is_some_and(|value| value.is_string() || value.is_object())
    {
        return true;
    }
    let Some(path_text) = pack.get("licenseFile").and_then(Value::as_str) else {
        return false;
    };
    let path = pack_path(runtime, path_text);
    is_runtime_path(runtime, &path)
}

fn health_command_is_valid(pack: &Value) -> bool {
    pack.get("healthCommand").is_some_and(|value| {
        value
            .as_str()
            .is_some_and(|command| !command.trim().is_empty())
            || value.as_array().is_some_and(|command| !command.is_empty())
    })
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
        let path = if path.is_absolute() {
            path
        } else {
            root.join(path)
        };
        if is_runtime_path(root, &path) && is_verified_file(root, &path) {
            return Some(path);
        }
    }
    let extension = if cfg!(windows) { ".exe" } else { "" };
    let expected = normalize_tool_name(name);
    let manifest = fs::read_to_string(root.join("manifest.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok());
    let architecture = manifest
        .as_ref()
        .and_then(|value| value.get("architecture"))
        .and_then(Value::as_str)
        .unwrap_or("win-x64");
    manifest
        .as_ref()
        .and_then(|value| value.get("packs"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|pack| pack_is_verified(root, pack, architecture))
        .find_map(|pack| {
            let path_text = pack.get("path").and_then(Value::as_str)?;
            let path = pack_path(root, path_text);
            let file_name = path.file_stem()?.to_string_lossy();
            let names = [
                pack.get("tool").and_then(Value::as_str),
                pack.get("executable").and_then(Value::as_str),
                pack.get("name").and_then(Value::as_str),
                Some(file_name.as_ref()),
            ];
            names
                .into_iter()
                .flatten()
                .map(normalize_tool_name)
                .any(|candidate| candidate == expected)
                .then_some(path)
        })
        .or_else(|| {
            let path = root.join("bin").join(format!("{name}{extension}"));
            (is_runtime_path(root, &path) && is_verified_file(root, &path)).then_some(path)
        })
}

pub fn verified_tool_path(root: &Path, name: &str) -> Option<PathBuf> {
    let runtime = runtime_root(root);
    resolve_tool(&runtime, name)
}

fn is_verified_file(runtime: &Path, candidate: &Path) -> bool {
    let manifest_path = runtime.join("manifest.json");
    let Some(manifest) = fs::read_to_string(manifest_path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
    else {
        return false;
    };
    let architecture = manifest
        .get("architecture")
        .and_then(Value::as_str)
        .unwrap_or("win-x64");
    let Ok(candidate) = candidate.canonicalize() else {
        return false;
    };
    manifest
        .get("packs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|pack| pack_is_verified(runtime, pack, architecture))
        .filter_map(|pack| {
            let path_text = pack.get("path").and_then(Value::as_str)?;
            let path = pack_path(runtime, path_text);
            let canonical = path.canonicalize().ok()?;
            Some(canonical == candidate)
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
    std::env::var_os("AUTOMATE_PLUS_WEBVIEW2_PATH")
        .map(PathBuf::from)
        .is_some_and(|path| path.is_dir())
        || root.join("webview2").is_dir()
        || [
            Path::new(r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application"),
            Path::new(r"C:\Program Files\Microsoft\EdgeWebView\Application"),
        ]
        .iter()
        .any(|path| path.is_dir())
}

fn runtime_root(root: &Path) -> PathBuf {
    let candidates = discover_known_roots(root, None);
    candidates
        .iter()
        .find(|candidate| candidate.path.join("manifest.json").is_file())
        .map(|candidate| candidate.path.clone())
        .unwrap_or_else(|| root.join("runtime-packs"))
}

fn capabilities(
    runtime: &Path,
    manifest: Option<&Value>,
    adb_path: Option<&PathBuf>,
    appium_path: Option<&PathBuf>,
    scrcpy_path: Option<&PathBuf>,
    node_path: Option<&PathBuf>,
    authorized_device_count: usize,
    webview2_available: bool,
) -> NativeCapabilities {
    let device_discovery = adb_path.is_some();
    let android_recording = device_discovery
        && scrcpy_path.is_some()
        && declares_capability(runtime, manifest, "android-recording");
    let farm_replay = android_recording
        && appium_path.is_some()
        && authorized_device_count > 0
        && declares_capability(runtime, manifest, "farm-replay");
    let native_execution = node_path.is_some()
        && webview2_available
        && declares_capability(runtime, manifest, "native-execution");
    NativeCapabilities {
        device_discovery,
        android_recording,
        farm_replay,
        native_execution,
    }
}

fn declares_capability(runtime: &Path, manifest: Option<&Value>, capability: &str) -> bool {
    let expected = normalize_tool_name(capability);
    let architecture = manifest
        .and_then(|value| value.get("architecture"))
        .and_then(Value::as_str)
        .unwrap_or("win-x64");
    manifest
        .and_then(|value| value.get("packs"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|pack| pack_is_verified(runtime, pack, architecture))
        .any(|pack| {
            ["capabilities", "provides"]
                .into_iter()
                .filter_map(|key| pack.get(key))
                .flat_map(|value| {
                    if let Some(values) = value.as_array() {
                        values.iter().filter_map(Value::as_str).collect::<Vec<_>>()
                    } else {
                        value.as_str().into_iter().collect::<Vec<_>>()
                    }
                })
                .map(normalize_tool_name)
                .any(|value| value == expected)
        })
}

fn normalize_tool_name(value: &str) -> String {
    value
        .trim()
        .trim_end_matches(".exe")
        .trim_end_matches(".cmd")
        .trim_end_matches(".bat")
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_root(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "automate-plus-preflight-{}-{name}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("temporary preflight root");
        path
    }

    #[test]
    fn missing_runtime_does_not_add_unconditional_executor_blockers() {
        let root = temporary_root("missing-runtime");
        let report = run(&root);
        let codes = report
            .reasons
            .iter()
            .map(|reason| reason.code.as_str())
            .collect::<Vec<_>>();

        assert!(codes.contains(&"runtime_manifest_missing"));
        assert!(!codes.iter().any(|code| code.ends_with("_executor_missing")));
        assert!(!report.components.capabilities.android_recording);
        assert!(!report.components.capabilities.farm_replay);

        let _ = fs::remove_dir_all(root);
    }
}
