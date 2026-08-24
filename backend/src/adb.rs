use crate::contracts::{DeviceProfile, Resolution, CONTRACT_VERSION};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_ADB_STREAM_BYTES: usize = 512 * 1024;

struct BoundedCommandOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    truncated: bool,
}

pub struct AdbClient {
    path: PathBuf,
}

impl AdbClient {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn discover(&self) -> Result<Vec<DeviceProfile>, String> {
        let output = run_bounded_command(&self.path, &["devices".to_owned(), "-l".to_owned()])?;
        if output.truncated {
            return Err(format!(
                "ADB discovery output exceeded the {MAX_ADB_STREAM_BYTES} byte safety limit."
            ));
        }
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
        }

        parse_devices_with_details(&self.path, &String::from_utf8_lossy(&output.stdout))
    }

    pub fn verify_application(
        &self,
        serial: &str,
        package: &str,
        activity: &str,
    ) -> Result<(), String> {
        if serial.trim().is_empty() || package.trim().is_empty() || activity.trim().is_empty() {
            return Err("BLOCKED: Android package, activity, and serial are required.".to_owned());
        }
        let package_result = run_bounded_command(
            &self.path,
            &[
                "-s".to_owned(),
                serial.to_owned(),
                "shell".to_owned(),
                "pm".to_owned(),
                "path".to_owned(),
                package.to_owned(),
            ],
        )
        .map_err(|error| format!("BLOCKED: Unable to verify Android package: {error}"))?;
        if package_result.truncated {
            return Err(format!(
                "BLOCKED: Android package verification output exceeded the {MAX_ADB_STREAM_BYTES} byte safety limit."
            ));
        }
        if !package_result.status.success()
            || !String::from_utf8_lossy(&package_result.stdout).contains("package:")
        {
            return Err(format!(
                "BLOCKED: Android package '{package}' is not installed on serial '{serial}'."
            ));
        }
        let resolved = run_bounded_command(
            &self.path,
            &[
                "-s".to_owned(),
                serial.to_owned(),
                "shell".to_owned(),
                "cmd".to_owned(),
                "package".to_owned(),
                "resolve-activity".to_owned(),
                "--brief".to_owned(),
                package.to_owned(),
            ],
        )
        .map_err(|error| format!("BLOCKED: Unable to resolve Android activity: {error}"))?;
        if resolved.truncated {
            return Err(format!(
                "BLOCKED: Android activity resolution output exceeded the {MAX_ADB_STREAM_BYTES} byte safety limit."
            ));
        }
        if !resolved.status.success() {
            return Err(format!(
                "BLOCKED: Android activity '{activity}' could not be resolved for package '{package}' on serial '{serial}'."
            ));
        }
        let expected = normalize_activity(package, activity);
        let output = String::from_utf8_lossy(&resolved.stdout);
        let resolved_activity = output
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .last();
        if resolved_activity
            .map(|value| normalize_activity(package, value) != expected)
            .unwrap_or(true)
        {
            return Err(format!(
                "BLOCKED: Android activity mismatch for serial '{serial}'; expected '{expected}', resolved '{}'.",
                resolved_activity.unwrap_or("<none>")
            ));
        }
        Ok(())
    }
}

fn normalize_activity(package: &str, activity: &str) -> String {
    let value = activity.trim();
    if value.starts_with('.') {
        format!("{package}{value}")
    } else if let Some((resolved_package, resolved_activity)) = value.split_once('/') {
        if resolved_package == package {
            normalize_activity(package, resolved_activity)
        } else {
            value.replace('/', "")
        }
    } else if value.starts_with(package) {
        value.to_owned()
    } else {
        format!("{package}.{value}")
    }
}

pub fn parse_devices(text: &str) -> Result<Vec<DeviceProfile>, String> {
    parse_devices_with_details(Path::new("adb"), text)
}

fn parse_devices_with_details(adb: &Path, text: &str) -> Result<Vec<DeviceProfile>, String> {
    let mut devices = Vec::new();
    for line in text.lines().skip(1) {
        let mut fields = line.split_whitespace();
        let Some(serial) = fields.next() else {
            continue;
        };
        let Some(raw_status) = fields.next() else {
            continue;
        };
        if serial.is_empty() || serial.starts_with('*') {
            continue;
        }

        let mut metadata = HashMap::new();
        for field in fields {
            if let Some((key, value)) = field.split_once(':') {
                metadata.insert(key, value.replace('_', " "));
            }
        }

        let status = match raw_status {
            "device" => "device",
            "unauthorized" => "unauthorized",
            _ => "offline",
        };
        let details = if status == "device" {
            query_device_details(adb, serial)
        } else {
            DeviceDetails::default()
        };
        let model = metadata
            .get("model")
            .cloned()
            .or_else(|| details.model.clone())
            .unwrap_or_default();
        let product = metadata
            .get("product")
            .cloned()
            .or_else(|| details.product.clone())
            .unwrap_or_default();
        let device_name = metadata
            .get("device")
            .cloned()
            .or_else(|| details.device_name.clone())
            .unwrap_or_default();
        let identity = details
            .serial_number
            .as_deref()
            .filter(|value| !value.is_empty())
            .unwrap_or(serial);
        let resolution = details.resolution.unwrap_or_default();
        let orientation = if resolution.width == 0 || resolution.height == 0 {
            "unknown"
        } else if resolution.width >= resolution.height {
            "landscape"
        } else {
            "portrait"
        };
        let transport = if serial.starts_with("emulator-") {
            "emulator"
        } else if serial.contains(':') {
            "tcpip"
        } else if metadata.contains_key("usb") {
            "usb"
        } else {
            "unknown"
        };

        devices.push(DeviceProfile {
            schema_version: CONTRACT_VERSION,
            device_id: stable_device_id(identity, &model, &product),
            adb_serial: serial.to_owned(),
            model: if model.is_empty() {
                device_name.clone()
            } else {
                model
            },
            manufacturer: details.manufacturer.unwrap_or_default(),
            product,
            android_version: details.android_version.unwrap_or_default(),
            sdk_version: details.sdk_version.unwrap_or_default(),
            is_emulator: serial.starts_with("emulator-")
                || device_name == "goldfish"
                || device_name == "ranchu",
            resolution,
            density: details.density.unwrap_or_default(),
            orientation: orientation.to_owned(),
            transport: transport.to_owned(),
            status: status.to_owned(),
            health_state: if status == "device" { "ready" } else { status },
            last_seen_at: now(),
        });
    }
    Ok(devices)
}

#[derive(Default)]
struct DeviceDetails {
    model: Option<String>,
    manufacturer: Option<String>,
    product: Option<String>,
    device_name: Option<String>,
    serial_number: Option<String>,
    android_version: Option<String>,
    sdk_version: Option<u32>,
    resolution: Option<Resolution>,
    density: Option<u32>,
}

fn query_device_details(adb: &Path, serial: &str) -> DeviceDetails {
    let mut details = DeviceDetails::default();
    let Ok(output) = run_bounded_command(
        adb,
        &[
            "-s".to_owned(),
            serial.to_owned(),
            "shell".to_owned(),
            "getprop".to_owned(),
        ],
    ) else {
        return details;
    };
    if output.status.success() && !output.truncated {
        let properties = parse_getprop(&String::from_utf8_lossy(&output.stdout));
        details.model = properties.get("ro.product.model").cloned();
        details.manufacturer = properties.get("ro.product.manufacturer").cloned();
        details.product = properties.get("ro.product.name").cloned();
        details.device_name = properties.get("ro.product.device").cloned();
        details.serial_number = properties
            .get("ro.serialno")
            .cloned()
            .filter(|value| !value.is_empty() && value != "unknown");
        details.android_version = properties.get("ro.build.version.release").cloned();
        details.sdk_version = properties
            .get("ro.build.version.sdk")
            .and_then(|value| value.parse::<u32>().ok());
    }
    details.resolution = run_shell(adb, serial, &["wm", "size"]).and_then(parse_resolution);
    details.density = run_shell(adb, serial, &["wm", "density"]).and_then(parse_density);
    details
}

fn run_shell(adb: &Path, serial: &str, args: &[&str]) -> Option<String> {
    let mut command_args = vec!["-s".to_owned(), serial.to_owned(), "shell".to_owned()];
    command_args.extend(args.iter().map(|argument| (*argument).to_owned()));
    let output = run_bounded_command(adb, &command_args).ok()?;
    output
        .status
        .success()
        .then_some(output)
        .filter(|output| !output.truncated)
        .map(|output| String::from_utf8_lossy(&output.stdout).into_owned())
}

fn run_bounded_command(path: &Path, args: &[String]) -> Result<BoundedCommandOutput, String> {
    let mut child = Command::new(path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "ADB stdout pipe was not created.".to_owned())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "ADB stderr pipe was not created.".to_owned())?;
    let stdout_reader = thread::spawn(|| read_bounded_stream(stdout));
    let stderr_reader = thread::spawn(|| read_bounded_stream(stderr));
    let status = child.wait().map_err(|error| error.to_string())?;
    let (stdout, stdout_truncated) = stdout_reader
        .join()
        .map_err(|_| "ADB stdout reader panicked.".to_owned())??;
    let (stderr, stderr_truncated) = stderr_reader
        .join()
        .map_err(|_| "ADB stderr reader panicked.".to_owned())??;

    Ok(BoundedCommandOutput {
        status,
        stdout,
        stderr,
        truncated: stdout_truncated || stderr_truncated,
    })
}

fn read_bounded_stream(mut stream: impl Read) -> io::Result<(Vec<u8>, bool)> {
    let mut retained = Vec::with_capacity(MAX_ADB_STREAM_BYTES.min(64 * 1024));
    let mut buffer = [0_u8; 16 * 1024];
    let mut truncated = false;
    loop {
        let read = stream.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let remaining = MAX_ADB_STREAM_BYTES.saturating_sub(retained.len());
        let retained_bytes = read.min(remaining);
        retained.extend_from_slice(&buffer[..retained_bytes]);
        if retained_bytes < read {
            truncated = true;
        }
    }
    Ok((retained, truncated))
}

fn parse_getprop(text: &str) -> HashMap<String, String> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            let end = line.find("]:")?;
            let key = line.strip_prefix('[')?.get(..end - 1)?;
            let value = line.get(end + 2..)?.trim().trim_matches(['[', ']']);
            Some((key.to_owned(), value.to_owned()))
        })
        .collect()
}

fn parse_resolution(text: String) -> Option<Resolution> {
    text.lines().rev().find_map(|line| {
        let dimensions = line.split_whitespace().find(|value| value.contains('x'))?;
        let (width, height) = dimensions.split_once('x')?;
        Some(Resolution {
            width: width.parse().ok()?,
            height: height.parse().ok()?,
        })
    })
}

fn parse_density(text: String) -> Option<u32> {
    text.lines()
        .rev()
        .find_map(|line| line.split_whitespace().find_map(|value| value.parse().ok()))
}

pub fn stable_device_id(identity: &str, model: &str, product: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"automate-plus-device-id/v1\0");
    hasher.update(identity.as_bytes());
    hasher.update([0]);
    hasher.update(model.as_bytes());
    hasher.update([0]);
    hasher.update(product.as_bytes());
    let digest = hasher.finalize();
    let value = digest
        .iter()
        .take(12)
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("android-{value}")
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{
        parse_density, parse_devices, parse_getprop, parse_resolution, read_bounded_stream,
        stable_device_id, MAX_ADB_STREAM_BYTES,
    };
    use std::io::Cursor;

    #[test]
    fn parses_real_adb_rows_without_seeded_devices() {
        let devices = parse_devices("List of devices attached\nserial-a\tdevice product:p model:Pixel_8 device:husky transport_id:1 usb:1-1\nserial-b\tunauthorized\n").expect("parse");
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].adb_serial, "serial-a");
        assert_eq!(devices[0].model, "Pixel 8");
        assert_eq!(devices[0].status, "device");
        assert_eq!(devices[1].status, "unauthorized");
        assert!(devices.iter().all(|device| !device.adb_serial.is_empty()));
    }

    #[test]
    fn stable_identity_is_not_the_adb_serial() {
        let id = stable_device_id("hardware-serial", "Pixel 8", "panther");
        assert!(id.starts_with("android-"));
        assert!(!id.contains("hardware-serial"));
    }

    #[test]
    fn parses_android_details_without_fabricating_missing_values() {
        let properties =
            parse_getprop("[ro.product.model]: [Pixel 8]\n[ro.build.version.sdk]: [35]\n");
        assert_eq!(
            properties.get("ro.product.model").map(String::as_str),
            Some("Pixel 8")
        );
        assert_eq!(
            parse_resolution("Physical size: 1080x2400\n".to_owned())
                .unwrap()
                .width,
            1080
        );
        assert_eq!(
            parse_density("Physical density: 420\n".to_owned()),
            Some(420)
        );
    }

    #[test]
    fn bounds_adb_stream_capture_without_stopping_the_reader() {
        let input = vec![b'x'; MAX_ADB_STREAM_BYTES + 128];
        let (retained, truncated) = read_bounded_stream(Cursor::new(input)).expect("read");
        assert_eq!(retained.len(), MAX_ADB_STREAM_BYTES);
        assert!(truncated);
    }
}
