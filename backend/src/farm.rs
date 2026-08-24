use crate::adb::AdbClient;
use crate::contracts::{
    runtime_id, DeviceProfile, DeviceRunResult, FarmRunSpec, LegacyFarmSummary,
};
use crate::persistence::Database;
use crate::ports::PortLeaseManager;
use crate::process::ProcessSupervisor;
use reqwest::blocking::Client;
use reqwest::Method;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const FARM_PORT_COUNT: usize = 4;
const APPIUM_START_TIMEOUT: Duration = Duration::from_secs(30);
const APPIUM_REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_RETAINED_RUNS: usize = 32;

#[derive(Clone, Default)]
pub(crate) struct FarmRunManager {
    state: Arc<Mutex<FarmState>>,
}

#[derive(Default)]
struct FarmState {
    runs: HashMap<String, FarmRunEntry>,
    active_devices: HashSet<String>,
}

struct FarmRunEntry {
    summary: LegacyFarmSummary,
    cancel: Arc<AtomicBool>,
}

struct ConcurrencyGate {
    limit: usize,
    active: Mutex<usize>,
    changed: Condvar,
}

impl ConcurrencyGate {
    fn new(limit: usize) -> Self {
        Self {
            limit: limit.max(1),
            active: Mutex::new(0),
            changed: Condvar::new(),
        }
    }

    fn acquire(&self) {
        let mut active = self.active.lock().expect("farm concurrency state");
        while *active >= self.limit {
            active = self.changed.wait(active).expect("farm concurrency state");
        }
        *active += 1;
    }

    fn release(&self) {
        let mut active = self.active.lock().expect("farm concurrency state");
        *active = active.saturating_sub(1);
        self.changed.notify_one();
    }
}

impl FarmRunManager {
    pub(crate) fn start(
        &self,
        session: Value,
        spec: FarmRunSpec,
        devices: Vec<DeviceProfile>,
        adb_path: PathBuf,
        workspace: PathBuf,
        ports: PortLeaseManager,
        processes: ProcessSupervisor,
    ) -> Result<LegacyFarmSummary, String> {
        validate_spec(&spec)?;
        let session_id = required_string(&session, "id", "session id")?;
        if session_id != spec.session_id {
            return Err("Farm sessionId does not match the selected SessionIR.".to_owned());
        }
        let (package, activity) = session_target(&session)?;
        let requested_ids = spec.device_ids.clone().ok_or_else(|| {
            "Farm deviceIds must contain the latest real ADB snapshot.".to_owned()
        })?;
        let by_id = devices
            .into_iter()
            .map(|device| (device.device_id.clone(), device))
            .collect::<HashMap<_, _>>();
        let mut selected = requested_ids
            .iter()
            .map(|device_id| {
                by_id.get(device_id).cloned().ok_or_else(|| {
                    format!("Device '{device_id}' is absent from the latest ADB snapshot.")
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        if selected.iter().any(|device| device.status != "device") {
            return Err(
                "Every farm device must be authorized in the latest real ADB snapshot.".to_owned(),
            );
        }
        if spec.strategy == "single" {
            selected.truncate(1);
        }

        let plans = iteration_plan(&spec, selected.len())?;
        let targets = selected
            .into_iter()
            .zip(plans)
            .filter(|(_, iterations)| *iterations > 0)
            .collect::<Vec<_>>();
        if targets.is_empty() {
            return Err("Farm iteration plan did not assign work to a real device.".to_owned());
        }
        let farm_run_id = runtime_id("farm");
        let started_at = now();
        let cancel = Arc::new(AtomicBool::new(false));
        let device_runs = targets
            .iter()
            .map(|(device, planned_iterations)| DeviceRunResult {
                device_run_id: runtime_id("device-run"),
                device_id: device.device_id.clone(),
                adb_serial: device.adb_serial.clone(),
                model: device.model.clone(),
                status: "queued".to_owned(),
                planned_iterations: *planned_iterations,
                completed_iterations: 0,
                passed_iterations: 0,
                failed_iterations: 0,
                duration_ms: 0,
                iterations: Vec::new(),
                artifacts: Vec::new(),
                error: None,
            })
            .collect::<Vec<_>>();
        let summary = LegacyFarmSummary {
            farm_run_id: farm_run_id.clone(),
            session_id: session_id.clone(),
            strategy: spec.strategy.clone(),
            failure_policy: spec.failure_policy.clone(),
            status: "running".to_owned(),
            total_planned_iterations: device_runs.iter().map(|run| run.planned_iterations).sum(),
            total_completed_iterations: 0,
            total_passed_iterations: 0,
            total_failed_iterations: 0,
            duration_ms: 0,
            device_runs,
            started_at,
            finished_at: 0,
            error_summary: None,
        };

        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "Farm state is unavailable.".to_owned())?;
            if targets
                .iter()
                .any(|(device, _)| state.active_devices.contains(&device.device_id))
            {
                return Err(
                    "One or more selected Android devices are already leased by another farm run."
                        .to_owned(),
                );
            }
            for (device, _) in &targets {
                state.active_devices.insert(device.device_id.clone());
            }
            state.runs.insert(
                farm_run_id.clone(),
                FarmRunEntry {
                    summary: summary.clone(),
                    cancel: cancel.clone(),
                },
            );
            trim_runs(&mut state);
        }

        let manager = self.clone();
        let gate = Arc::new(ConcurrencyGate::new(
            spec.max_parallel_devices.min(targets.len() as u32) as usize,
        ));
        for ((device, planned_iterations), initial_run) in
            targets.into_iter().zip(summary.device_runs.iter().cloned())
        {
            let manager = manager.clone();
            let gate = gate.clone();
            let session = session.clone();
            let package = package.clone();
            let activity = activity.clone();
            let spec = spec.clone();
            let farm_run_id = farm_run_id.clone();
            let cancel = cancel.clone();
            let adb_path = adb_path.clone();
            let workspace = workspace.clone();
            let ports = ports.clone();
            let processes = processes.clone();
            thread::spawn(move || {
                gate.acquire();
                manager.mark_device_running(&farm_run_id, &initial_run.device_run_id);
                let result = execute_device(
                    &farm_run_id,
                    &session,
                    &package,
                    &activity,
                    &spec,
                    device,
                    planned_iterations,
                    initial_run.device_run_id.clone(),
                    cancel,
                    adb_path,
                    workspace,
                    ports,
                    processes,
                );
                manager.finish_device(&farm_run_id, result);
                gate.release();
            });
        }

        Ok(summary)
    }

    pub(crate) fn status(&self, run_id: &str) -> Result<LegacyFarmSummary, String> {
        let state = self
            .state
            .lock()
            .map_err(|_| "Farm state is unavailable.".to_owned())?;
        state
            .runs
            .get(run_id)
            .map(|entry| entry.summary.clone())
            .ok_or_else(|| format!("Farm run '{run_id}' was not found."))
    }

    pub(crate) fn cancel(&self, run_id: &str) -> Result<bool, String> {
        if run_id.trim().is_empty() {
            return Err("Farm runId is required for cancellation.".to_owned());
        }
        let state = self
            .state
            .lock()
            .map_err(|_| "Farm state is unavailable.".to_owned())?;
        let Some(entry) = state.runs.get(run_id) else {
            return Ok(false);
        };
        entry.cancel.store(true, Ordering::SeqCst);
        Ok(true)
    }

    fn mark_device_running(&self, run_id: &str, device_run_id: &str) {
        if let Ok(mut state) = self.state.lock() {
            if let Some(entry) = state.runs.get_mut(run_id) {
                if let Some(device_run) = entry
                    .summary
                    .device_runs
                    .iter_mut()
                    .find(|run| run.device_run_id == device_run_id)
                {
                    device_run.status = "running".to_owned();
                }
            }
        }
    }

    fn finish_device(&self, run_id: &str, result: DeviceRunResult) {
        if let Ok(mut state) = self.state.lock() {
            state.active_devices.remove(&result.device_id);
            if let Some(entry) = state.runs.get_mut(run_id) {
                if let Some(device_run) = entry
                    .summary
                    .device_runs
                    .iter_mut()
                    .find(|run| run.device_run_id == result.device_run_id)
                {
                    *device_run = result;
                }
                recalculate_summary(&mut entry.summary);
            }
            trim_runs(&mut state);
        }
    }
}

fn trim_runs(state: &mut FarmState) {
    if state.runs.len() <= MAX_RETAINED_RUNS {
        return;
    }
    let mut ids = state
        .runs
        .iter()
        .filter(|(_, entry)| {
            matches!(
                entry.summary.status.as_str(),
                "passed" | "failed" | "blocked" | "cancelled"
            )
        })
        .map(|(id, entry)| (id.clone(), entry.summary.finished_at))
        .collect::<Vec<_>>();
    ids.sort_by_key(|(_, finished_at)| *finished_at);
    while state.runs.len() > MAX_RETAINED_RUNS {
        let Some((id, _)) = ids.first().cloned() else {
            break;
        };
        ids.remove(0);
        state.runs.remove(&id);
    }
}

fn recalculate_summary(summary: &mut LegacyFarmSummary) {
    summary.total_completed_iterations = summary
        .device_runs
        .iter()
        .map(|run| run.completed_iterations)
        .sum();
    summary.total_passed_iterations = summary
        .device_runs
        .iter()
        .map(|run| run.passed_iterations)
        .sum();
    summary.total_failed_iterations = summary
        .device_runs
        .iter()
        .map(|run| run.failed_iterations)
        .sum();
    let terminal = summary.device_runs.iter().all(|run| {
        matches!(
            run.status.as_str(),
            "passed" | "failed" | "blocked" | "cancelled"
        )
    });
    if !terminal {
        summary.status = "running".to_owned();
        return;
    }
    summary.finished_at = now();
    summary.duration_ms = summary.finished_at.saturating_sub(summary.started_at);
    summary.status = if summary
        .device_runs
        .iter()
        .any(|run| run.status == "cancelled")
    {
        "cancelled"
    } else if summary
        .device_runs
        .iter()
        .any(|run| run.status == "blocked")
    {
        "blocked"
    } else if summary.total_failed_iterations > 0 {
        "failed"
    } else {
        "passed"
    }
    .to_owned();
    let errors = summary
        .device_runs
        .iter()
        .filter_map(|run| run.error.as_deref())
        .filter(|error| !error.trim().is_empty())
        .collect::<Vec<_>>();
    summary.error_summary = (!errors.is_empty()).then(|| errors.join("; "));
}

fn execute_device(
    farm_run_id: &str,
    session: &Value,
    package: &str,
    activity: &str,
    spec: &FarmRunSpec,
    device: DeviceProfile,
    planned_iterations: u32,
    device_run_id: String,
    cancel: Arc<AtomicBool>,
    adb_path: PathBuf,
    workspace: PathBuf,
    ports: PortLeaseManager,
    processes: ProcessSupervisor,
) -> DeviceRunResult {
    let started_at = now();
    let mut result = DeviceRunResult {
        device_run_id,
        device_id: device.device_id.clone(),
        adb_serial: device.adb_serial.clone(),
        model: device.model.clone(),
        status: "running".to_owned(),
        planned_iterations,
        completed_iterations: 0,
        passed_iterations: 0,
        failed_iterations: 0,
        duration_ms: 0,
        iterations: Vec::new(),
        artifacts: Vec::new(),
        error: None,
    };
    let mut port_lease_id = None;
    let mut appium_process_id = None;
    let mut appium_session = None;
    let execution = (|| -> Result<(), String> {
        if cancel.load(Ordering::SeqCst) {
            return Err("CANCELLED: Farm run was cancelled before device preparation.".to_owned());
        }
        let adb = AdbClient::new(adb_path.clone());
        adb.verify_application(&device.adb_serial, package, activity)?;
        let (lease_id, leased_ports) =
            ports.reserve(farm_run_id, &device.device_id, FARM_PORT_COUNT)?;
        ports.activate(&lease_id)?;
        port_lease_id = Some(lease_id);
        let appium_port = leased_ports[0];
        let process_id = processes.start(
            &workspace,
            "appium",
            &[
                "--address".to_owned(),
                "127.0.0.1".to_owned(),
                "--port".to_owned(),
                appium_port.to_string(),
                "--base-path".to_owned(),
                "/".to_owned(),
            ],
        )?;
        appium_process_id = Some(process_id);
        let client = AppiumClient::wait_for_server(appium_port)?;
        let session_id = client.create_session(
            package,
            activity,
            &device.adb_serial,
            leased_ports[1],
            leased_ports[2],
            leased_ports[3],
        )?;
        appium_session = Some((client, session_id));

        let (client, session_id) = appium_session.as_ref().expect("Appium session set");
        let steps = session
            .get("steps")
            .and_then(Value::as_array)
            .ok_or_else(|| "BLOCKED: SessionIR steps are missing or invalid.".to_owned())?;
        for iteration_number in 1..=planned_iterations {
            if cancel.load(Ordering::SeqCst) {
                result.status = "cancelled".to_owned();
                break;
            }
            let iteration = execute_iteration(
                client, session_id, package, activity, steps, &device, &cancel,
            )?;
            let iteration_status = iteration
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("failed");
            result.iterations.push(iteration);
            result.completed_iterations += 1;
            match iteration_status {
                "passed" => result.passed_iterations += 1,
                "cancelled" => {
                    result.status = "cancelled".to_owned();
                    break;
                }
                "blocked" => {
                    result.status = "blocked".to_owned();
                    break;
                }
                _ => {
                    result.failed_iterations += 1;
                    if spec.failure_policy == "fail-fast" {
                        result.status = "failed".to_owned();
                        cancel.store(true, Ordering::SeqCst);
                        break;
                    }
                }
            }
            if spec.iteration_delay_ms > 0 && iteration_number < planned_iterations {
                sleep_with_cancellation(spec.iteration_delay_ms, &cancel);
            }
        }
        if result.status == "running" {
            result.status = if result.failed_iterations == 0 {
                "passed".to_owned()
            } else {
                "failed".to_owned()
            };
        }
        Ok(())
    })();

    if let Err(error) = execution {
        let cancelled = error.starts_with("CANCELLED:") || cancel.load(Ordering::SeqCst);
        result.status = if cancelled {
            "cancelled".to_owned()
        } else if error.starts_with("BLOCKED:") {
            "blocked".to_owned()
        } else {
            "failed".to_owned()
        };
        result.error = Some(error);
    }

    if let Some((client, session_id)) = appium_session.take() {
        let _ = client.delete_session(&session_id);
    }
    if let Some(process_id) = appium_process_id {
        let _ = processes.stop(process_id);
    }
    if let Some(lease_id) = port_lease_id {
        let _ = ports.release(&lease_id);
    }
    result.duration_ms = now().saturating_sub(started_at);
    attach_device_evidence(&workspace, farm_run_id, &mut result);
    result
}

fn execute_iteration(
    client: &AppiumClient,
    session_id: &str,
    package: &str,
    activity: &str,
    steps: &[Value],
    device: &DeviceProfile,
    cancel: &Arc<AtomicBool>,
) -> Result<Value, String> {
    let iteration_id = runtime_id("iteration");
    let started_at = now();
    let mut observations = Vec::new();
    let mut iteration_status = "passed";
    let mut iteration_error = None;
    for step in steps {
        if cancel.load(Ordering::SeqCst) {
            iteration_status = "cancelled";
            iteration_error = Some("Farm run cancellation was requested.".to_owned());
            break;
        }
        let step_started = now();
        let action_id = step
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("unknown-action");
        match execute_action(client, session_id, package, activity, step, cancel) {
            Ok(observation) => observations.push(json!({
                "actionId": action_id,
                "status": "passed",
                "fallbackUsed": observation.fallback_used,
                "resolvedLocator": observation.locator,
                "hierarchyHash": observation.hierarchy_hash,
                "durationMs": now().saturating_sub(step_started),
                "timestamp": now(),
                "deviceId": device.device_id,
                "adbSerialSnapshot": device.adb_serial,
            })),
            Err(error) => {
                let status = if error.starts_with("CANCELLED:") {
                    "cancelled"
                } else if error.starts_with("BLOCKED:") {
                    "blocked"
                } else {
                    "failed"
                };
                observations.push(json!({
                    "actionId": action_id,
                    "status": status,
                    "fallbackUsed": false,
                    "durationMs": now().saturating_sub(step_started),
                    "timestamp": now(),
                    "deviceId": device.device_id,
                    "adbSerialSnapshot": device.adb_serial,
                    "errorMessage": error,
                }));
                if status != "passed" {
                    iteration_status = status;
                    iteration_error = Some(error);
                }
                if step.get("optional").and_then(Value::as_bool) != Some(true) {
                    break;
                }
            }
        }
    }
    Ok(json!({
        "iterationId": iteration_id,
        "deviceId": device.device_id,
        "adbSerialSnapshot": device.adb_serial,
        "status": iteration_status,
        "steps": observations,
        "startedAt": started_at,
        "completedAt": now(),
        "errorMessage": iteration_error,
    }))
}

struct ActionObservation {
    locator: Option<Value>,
    fallback_used: bool,
    hierarchy_hash: Option<String>,
}

fn execute_action(
    client: &AppiumClient,
    session_id: &str,
    package: &str,
    activity: &str,
    step: &Value,
    cancel: &Arc<AtomicBool>,
) -> Result<ActionObservation, String> {
    let action = step
        .get("action")
        .and_then(Value::as_str)
        .ok_or_else(|| "BLOCKED: Android action type is missing.".to_owned())?;
    let hierarchy_hash = Some(client.source_hash(session_id)?);
    let (element, locator, fallback_used) = match action {
        "assertHidden" => (None, None, false),
        "sleep" => (None, None, false),
        "back" | "home" | "enter" | "launchApp" | "closeApp" => (None, None, false),
        _ => resolve_element(client, session_id, step, cancel, action == "waitFor")?,
    };
    match action {
        "tap" | "click" => {
            if let Some(element) = element {
                client.element_click(session_id, &element)?;
            } else {
                client.pointer_tap(session_id, coordinates(step)?)?;
            }
        }
        "doubleTap" | "doubleClick" => {
            if let Some(element) = element {
                client.element_click(session_id, &element)?;
                client.element_click(session_id, &element)?;
            } else {
                let point = coordinates(step)?;
                client.pointer_tap(session_id, point)?;
                client.pointer_tap(session_id, point)?;
            }
        }
        "longPress" => {
            let point = if let Some(element) = element {
                client.element_center(session_id, &element)?
            } else {
                coordinates(step)?
            };
            client.pointer_long_press(session_id, point, 800)?;
        }
        "fill" => {
            let element = element
                .ok_or_else(|| "BLOCKED: fill requires a real Android locator.".to_owned())?;
            let value = string_value(step.get("value"), "fill value")?;
            client.element_clear(session_id, &element)?;
            client.element_text(session_id, &element, &value)?;
        }
        "clear" => {
            let element = element
                .ok_or_else(|| "BLOCKED: clear requires a real Android locator.".to_owned())?;
            client.element_clear(session_id, &element)?;
        }
        "assertVisible" => {
            let element =
                element.ok_or_else(|| "FAILED: Android element was not found.".to_owned())?;
            if !client.element_displayed(session_id, &element)? {
                return Err("FAILED: Android element is not displayed.".to_owned());
            }
        }
        "assertHidden" => {
            if step
                .get("locators")
                .and_then(Value::as_array)
                .map(|locators| locators.is_empty())
                .unwrap_or(true)
            {
                return Err("BLOCKED: assertHidden requires a real Android locator.".to_owned());
            }
            if find_element_optional(client, session_id, step)?.is_some() {
                return Err("FAILED: Android element is visible but should be hidden.".to_owned());
            }
        }
        "assertText" | "assertValue" => {
            let element =
                element.ok_or_else(|| "FAILED: Android element was not found.".to_owned())?;
            let actual = client.element_text_value(session_id, &element)?;
            let expected = expected_value(step)?;
            let operator = assertion_operator(step);
            if !compare_text(&actual, &expected, operator)? {
                return Err(format!("FAILED: Expected '{expected}' with operator '{operator}', received '{actual}'."));
            }
        }
        "assertAttribute" => {
            let element =
                element.ok_or_else(|| "FAILED: Android element was not found.".to_owned())?;
            let attribute = step
                .get("attributeName")
                .and_then(Value::as_str)
                .ok_or_else(|| "BLOCKED: assertAttribute requires an attribute name.".to_owned())?;
            let actual = client.element_attribute(session_id, &element, attribute)?;
            let expected = expected_value(step)?;
            if !compare_text(&actual, &expected, assertion_operator(step))? {
                return Err(format!(
                    "FAILED: Android attribute '{attribute}' did not match '{expected}'."
                ));
            }
        }
        "waitFor" => {}
        "sleep" => {
            let duration = step.get("value").and_then(Value::as_u64).unwrap_or(0);
            sleep_with_cancellation(duration, cancel);
        }
        "back" => client.post(session_path(session_id, "back"), None)?,
        "home" => client.press_key(session_id, 3)?,
        "enter" => client.press_key(session_id, 66)?,
        "launchApp" => client.start_activity(session_id, package, activity)?,
        "closeApp" => client.terminate_app(session_id, package)?,
        "swipe" => {
            let vector = step.get("swipeVector").ok_or_else(|| {
                "BLOCKED: swipe requires a real recorded swipe vector.".to_owned()
            })?;
            let start = point_from(vector, "startX", "startY")?;
            let end = point_from(vector, "endX", "endY")?;
            let duration = vector
                .get("durationMs")
                .and_then(Value::as_u64)
                .unwrap_or(300);
            client.pointer_swipe(session_id, start, end, duration)?;
        }
        "drag" | "dragAndDrop" | "scroll" | "pinch" | "takeScreenshot" => {
            return Err(format!("BLOCKED: Android action '{action}' is not implemented by the verified Appium worker."));
        }
        _ => {
            return Err(format!(
                "BLOCKED: Android action '{action}' is unsupported."
            ))
        }
    }
    Ok(ActionObservation {
        locator,
        fallback_used,
        hierarchy_hash,
    })
}

fn resolve_element(
    client: &AppiumClient,
    session_id: &str,
    step: &Value,
    cancel: &Arc<AtomicBool>,
    wait: bool,
) -> Result<(Option<String>, Option<Value>, bool), String> {
    let timeout_ms = step
        .get("timeoutMs")
        .and_then(Value::as_u64)
        .unwrap_or(5000);
    let started = Instant::now();
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(
                "CANCELLED: Farm run was cancelled while resolving an Android locator.".to_owned(),
            );
        }
        let locators = step.get("locators").and_then(Value::as_array).ok_or_else(|| {
            "BLOCKED: Android action requires a semantic locator or an explicitly recorded coordinate.".to_owned()
        })?;
        let mut last_error = None;
        for (index, locator) in locators.iter().enumerate() {
            match client.find_element(session_id, locator) {
                Ok(element) => return Ok((Some(element), Some(locator.clone()), index > 0)),
                Err(error) => last_error = Some(error),
            }
        }
        if !wait || started.elapsed() >= Duration::from_millis(timeout_ms) {
            return Err(format!(
                "FAILED: No Android locator matched the live UI hierarchy. {}",
                last_error.unwrap_or_else(|| "No locator candidates were provided.".to_owned())
            ));
        }
        thread::sleep(Duration::from_millis(150));
    }
}

fn find_element_optional(
    client: &AppiumClient,
    session_id: &str,
    step: &Value,
) -> Result<Option<String>, String> {
    let locators = step
        .get("locators")
        .and_then(Value::as_array)
        .ok_or_else(|| "BLOCKED: Android locator candidates are missing.".to_owned())?;
    for locator in locators {
        match client.find_element(session_id, locator) {
            Ok(element) => return Ok(Some(element)),
            Err(error) if is_missing_element_error(&error) => {}
            Err(error) => return Err(error),
        }
    }
    Ok(None)
}

fn is_missing_element_error(error: &str) -> bool {
    let normalized = error.to_ascii_lowercase();
    normalized.contains("no such element") || normalized.contains("element not found")
}

fn coordinates(step: &Value) -> Result<(i32, i32), String> {
    let point = step.get("coordinates").ok_or_else(|| {
        "BLOCKED: Android gesture has no semantic locator or recorded coordinates.".to_owned()
    })?;
    let x = point
        .get("x")
        .and_then(Value::as_f64)
        .ok_or_else(|| "BLOCKED: Android coordinate x is invalid.".to_owned())?;
    let y = point
        .get("y")
        .and_then(Value::as_f64)
        .ok_or_else(|| "BLOCKED: Android coordinate y is invalid.".to_owned())?;
    if !x.is_finite() || !y.is_finite() || x < 0.0 || y < 0.0 {
        return Err("BLOCKED: Android coordinates must be finite non-negative values.".to_owned());
    }
    Ok((x.round() as i32, y.round() as i32))
}

fn point_from(value: &Value, x_key: &str, y_key: &str) -> Result<(i32, i32), String> {
    let x = value
        .get(x_key)
        .and_then(Value::as_f64)
        .ok_or_else(|| format!("BLOCKED: swipe {x_key} is invalid."))?;
    let y = value
        .get(y_key)
        .and_then(Value::as_f64)
        .ok_or_else(|| format!("BLOCKED: swipe {y_key} is invalid."))?;
    if !x.is_finite() || !y.is_finite() || x < 0.0 || y < 0.0 {
        return Err(
            "BLOCKED: Android swipe coordinates must be finite non-negative values.".to_owned(),
        );
    }
    Ok((x.round() as i32, y.round() as i32))
}

fn expected_value(step: &Value) -> Result<String, String> {
    let value = step
        .get("expectedValue")
        .or_else(|| {
            step.get("assertion")
                .and_then(|assertion| assertion.get("expected"))
        })
        .ok_or_else(|| "BLOCKED: Android assertion expected value is missing.".to_owned())?;
    match value {
        Value::String(value) => Ok(value.clone()),
        Value::Number(value) => Ok(value.to_string()),
        Value::Bool(value) => Ok(value.to_string()),
        _ => Err("BLOCKED: Android assertion expected value must be a scalar.".to_owned()),
    }
}

fn assertion_operator(step: &Value) -> &str {
    step.get("assertion")
        .and_then(|assertion| assertion.get("operator"))
        .and_then(Value::as_str)
        .unwrap_or("equals")
}

fn compare_text(actual: &str, expected: &str, operator: &str) -> Result<bool, String> {
    match operator {
        "equals" => Ok(actual == expected),
        "notEquals" => Ok(actual != expected),
        "contains" => Ok(actual.contains(expected)),
        "greaterThan" => Ok(actual
            .parse::<f64>()
            .map_err(|_| "BLOCKED: Android comparison value is not numeric.".to_owned())?
            > expected
                .parse::<f64>()
                .map_err(|_| "BLOCKED: Android expected value is not numeric.".to_owned())?),
        "greaterThanOrEqual" => Ok(actual
            .parse::<f64>()
            .map_err(|_| "BLOCKED: Android comparison value is not numeric.".to_owned())?
            >= expected
                .parse::<f64>()
                .map_err(|_| "BLOCKED: Android expected value is not numeric.".to_owned())?),
        "lessThan" => Ok(actual
            .parse::<f64>()
            .map_err(|_| "BLOCKED: Android comparison value is not numeric.".to_owned())?
            < expected
                .parse::<f64>()
                .map_err(|_| "BLOCKED: Android expected value is not numeric.".to_owned())?),
        "lessThanOrEqual" => Ok(actual
            .parse::<f64>()
            .map_err(|_| "BLOCKED: Android comparison value is not numeric.".to_owned())?
            <= expected
                .parse::<f64>()
                .map_err(|_| "BLOCKED: Android expected value is not numeric.".to_owned())?),
        "matches" => {
            Err("BLOCKED: Android regex assertions require a verified regex runtime.".to_owned())
        }
        _ => Err(format!(
            "BLOCKED: Unsupported Android assertion operator '{operator}'."
        )),
    }
}

fn string_value(value: Option<&Value>, field: &str) -> Result<String, String> {
    match value {
        Some(Value::String(value)) if !value.trim().is_empty() => Ok(value.clone()),
        Some(Value::Object(object)) if object.get("kind").and_then(Value::as_str) == Some("secret") => {
            Err(format!("BLOCKED: {field} references a secret that is not available in the native run context."))
        }
        _ => Err(format!("BLOCKED: {field} must be a non-empty string.")),
    }
}

fn session_target(session: &Value) -> Result<(String, String), String> {
    if session.get("platform").and_then(Value::as_str) != Some("android") {
        return Err("BLOCKED: Farm replay requires an Android SessionIR.".to_owned());
    }
    let target = session
        .get("targetConfig")
        .ok_or_else(|| "BLOCKED: Android targetConfig is missing.".to_owned())?;
    let package = required_string(target, "appPackage", "Android appPackage")?;
    let activity = required_string(target, "appActivity", "Android appActivity")?;
    Ok((package, activity))
}

fn required_string(value: &Value, key: &str, label: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| format!("BLOCKED: {label} is required."))
}

fn iteration_plan(spec: &FarmRunSpec, device_count: usize) -> Result<Vec<u32>, String> {
    if spec.strategy == "split-iterations" {
        let total = spec.total_iterations.unwrap_or_default();
        let base = total / device_count as u32;
        let remainder = total % device_count as u32;
        Ok((0..device_count)
            .map(|index| base + if index < remainder as usize { 1 } else { 0 })
            .collect())
    } else {
        Ok(vec![
            spec.iterations_per_device.unwrap_or_default();
            device_count
        ])
    }
}

fn attach_device_evidence(workspace: &Path, farm_run_id: &str, result: &mut DeviceRunResult) {
    let directory = workspace
        .join(".automate-plus")
        .join("evidence")
        .join("farm")
        .join(farm_run_id);
    if fs::create_dir_all(&directory).is_err() {
        return;
    }
    let path = directory.join(format!("{}.json", result.device_run_id));
    let Ok(content) = serde_json::to_vec_pretty(result) else {
        return;
    };
    if fs::write(&path, &content).is_err() {
        return;
    }
    let digest = sha256_bytes(&content);
    let relative_path = path
        .strip_prefix(workspace)
        .unwrap_or(&path)
        .to_string_lossy()
        .replace('\\', "/");
    let artifact_id = runtime_id("artifact");
    result.artifacts.push(json!({
        "artifactId": artifact_id,
        "kind": "farm-device-evidence",
        "relativePath": relative_path,
        "sha256": digest,
    }));
    if let Ok(database) = Database::open_at(workspace) {
        let _ = database.record_artifact(
            &artifact_id,
            farm_run_id,
            &relative_path,
            &digest,
            "application/json",
        );
    }
}

fn sleep_with_cancellation(duration_ms: u64, cancel: &Arc<AtomicBool>) {
    let mut remaining = duration_ms;
    while remaining > 0 && !cancel.load(Ordering::SeqCst) {
        let chunk = remaining.min(100);
        thread::sleep(Duration::from_millis(chunk));
        remaining -= chunk;
    }
}

struct AppiumClient {
    http: Client,
    base_url: String,
}

impl AppiumClient {
    fn wait_for_server(port: u16) -> Result<Self, String> {
        let http = Client::builder()
            .timeout(APPIUM_REQUEST_TIMEOUT)
            .build()
            .map_err(|error| format!("BLOCKED: Unable to create local Appium client: {error}"))?;
        let client = Self {
            http,
            base_url: format!("http://127.0.0.1:{port}"),
        };
        let started = Instant::now();
        let mut last_error = String::from("Appium did not respond.");
        while started.elapsed() < APPIUM_START_TIMEOUT {
            match client.request(Method::GET, "/status", None) {
                Ok(_) => return Ok(client),
                Err(error) => last_error = error,
            }
            thread::sleep(Duration::from_millis(200));
        }
        Err(format!(
            "BLOCKED: Local Appium server was not ready: {last_error}"
        ))
    }

    fn create_session(
        &self,
        package: &str,
        activity: &str,
        serial: &str,
        system_port: u16,
        mjpeg_port: u16,
        chromedriver_port: u16,
    ) -> Result<String, String> {
        let response = self.request(
            Method::POST,
            "/session",
            Some(json!({
                "capabilities": {
                    "alwaysMatch": {
                        "platformName": "Android",
                        "appium:automationName": "UiAutomator2",
                        "appium:udid": serial,
                        "appium:appPackage": package,
                        "appium:appActivity": activity,
                        "appium:noReset": true,
                        "appium:systemPort": system_port,
                        "appium:mjpegServerPort": mjpeg_port,
                        "appium:chromedriverPort": chromedriver_port
                    },
                    "firstMatch": [{}]
                }
            })),
        )?;
        response
            .get("sessionId")
            .and_then(Value::as_str)
            .or_else(|| {
                response
                    .get("value")
                    .and_then(|value| value.get("sessionId"))
                    .and_then(Value::as_str)
            })
            .map(str::to_owned)
            .ok_or_else(|| {
                "BLOCKED: Appium created no session id for the bound Android serial.".to_owned()
            })
    }

    fn delete_session(&self, session_id: &str) -> Result<(), String> {
        self.request(Method::DELETE, &session_path(session_id, ""), None)
            .map(|_| ())
    }

    fn find_element(&self, session_id: &str, locator: &Value) -> Result<String, String> {
        let (using, value) = appium_locator(locator)?;
        let response = self.request(
            Method::POST,
            &session_path(session_id, "element"),
            Some(json!({ "using": using, "value": value })),
        )?;
        element_id(&response)
    }

    fn element_click(&self, session_id: &str, element_id: &str) -> Result<(), String> {
        self.request(
            Method::POST,
            &session_path(session_id, &format!("element/{element_id}/click")),
            Some(json!({})),
        )
        .map(|_| ())
    }

    fn element_clear(&self, session_id: &str, element_id: &str) -> Result<(), String> {
        self.request(
            Method::POST,
            &session_path(session_id, &format!("element/{element_id}/clear")),
            Some(json!({})),
        )
        .map(|_| ())
    }

    fn element_text(&self, session_id: &str, element_id: &str, text: &str) -> Result<(), String> {
        self.request(
            Method::POST,
            &session_path(session_id, &format!("element/{element_id}/value")),
            Some(json!({ "text": text, "value": text.chars().map(|value| value.to_string()).collect::<Vec<_>>() })),
        )
        .map(|_| ())
    }

    fn element_text_value(&self, session_id: &str, element_id: &str) -> Result<String, String> {
        let response = self.request(
            Method::GET,
            &session_path(session_id, &format!("element/{element_id}/text")),
            None,
        )?;
        scalar_value(&response)
    }

    fn element_attribute(
        &self,
        session_id: &str,
        element_id: &str,
        attribute: &str,
    ) -> Result<String, String> {
        let response = self.request(
            Method::GET,
            &session_path(
                session_id,
                &format!("element/{element_id}/attribute/{attribute}"),
            ),
            None,
        )?;
        scalar_value(&response)
    }

    fn element_displayed(&self, session_id: &str, element_id: &str) -> Result<bool, String> {
        let response = self.request(
            Method::GET,
            &session_path(session_id, &format!("element/{element_id}/displayed")),
            None,
        )?;
        response
            .get("value")
            .and_then(Value::as_bool)
            .ok_or_else(|| {
                "BLOCKED: Appium returned an invalid element visibility response.".to_owned()
            })
    }

    fn element_center(&self, session_id: &str, element_id: &str) -> Result<(i32, i32), String> {
        let response = self.request(
            Method::GET,
            &session_path(session_id, &format!("element/{element_id}/rect")),
            None,
        )?;
        let x = response
            .get("value")
            .and_then(|value| value.get("x"))
            .and_then(Value::as_f64)
            .ok_or_else(|| "BLOCKED: Appium returned no element x coordinate.".to_owned())?;
        let y = response
            .get("value")
            .and_then(|value| value.get("y"))
            .and_then(Value::as_f64)
            .ok_or_else(|| "BLOCKED: Appium returned no element y coordinate.".to_owned())?;
        let width = response
            .get("value")
            .and_then(|value| value.get("width"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let height = response
            .get("value")
            .and_then(|value| value.get("height"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        Ok((
            (x + width / 2.0).round() as i32,
            (y + height / 2.0).round() as i32,
        ))
    }

    fn pointer_tap(&self, session_id: &str, point: (i32, i32)) -> Result<(), String> {
        self.pointer_action(
            session_id,
            vec![
                json!({ "type": "pointerMove", "duration": 0, "x": point.0, "y": point.1 }),
                json!({ "type": "pointerDown", "button": 0 }),
                json!({ "type": "pointerUp", "button": 0 }),
            ],
        )
    }

    fn pointer_long_press(
        &self,
        session_id: &str,
        point: (i32, i32),
        duration_ms: u64,
    ) -> Result<(), String> {
        self.pointer_action(
            session_id,
            vec![
                json!({ "type": "pointerMove", "duration": 0, "x": point.0, "y": point.1 }),
                json!({ "type": "pointerDown", "button": 0 }),
                json!({ "type": "pause", "duration": duration_ms }),
                json!({ "type": "pointerUp", "button": 0 }),
            ],
        )
    }

    fn pointer_swipe(
        &self,
        session_id: &str,
        start: (i32, i32),
        end: (i32, i32),
        duration_ms: u64,
    ) -> Result<(), String> {
        self.pointer_action(
            session_id,
            vec![
                json!({ "type": "pointerMove", "duration": 0, "x": start.0, "y": start.1 }),
                json!({ "type": "pointerDown", "button": 0 }),
                json!({ "type": "pointerMove", "duration": duration_ms, "x": end.0, "y": end.1 }),
                json!({ "type": "pointerUp", "button": 0 }),
            ],
        )
    }

    fn pointer_action(&self, session_id: &str, actions: Vec<Value>) -> Result<(), String> {
        self.request(
            Method::POST,
            &session_path(session_id, "actions"),
            Some(json!({ "actions": [{ "type": "pointer", "id": "automateplus-finger", "parameters": { "pointerType": "touch" }, "actions": actions }] })),
        )
        .map(|_| ())
    }

    fn press_key(&self, session_id: &str, keycode: u32) -> Result<(), String> {
        self.request(
            Method::POST,
            &session_path(session_id, "appium/device/press_keycode"),
            Some(json!({ "keycode": keycode })),
        )
        .map(|_| ())
    }

    fn start_activity(
        &self,
        session_id: &str,
        package: &str,
        activity: &str,
    ) -> Result<(), String> {
        self.request(
            Method::POST,
            &session_path(session_id, "appium/device/start_activity"),
            Some(json!({
                "appPackage": package,
                "appActivity": activity,
            })),
        )
        .map(|_| ())
    }

    fn terminate_app(&self, session_id: &str, package: &str) -> Result<(), String> {
        self.request(
            Method::POST,
            &session_path(session_id, "appium/device/terminate_app"),
            Some(json!({ "appId": package })),
        )
        .map(|_| ())
    }

    fn source_hash(&self, session_id: &str) -> Result<String, String> {
        let response = self.request(Method::GET, &session_path(session_id, "source"), None)?;
        let source = response
            .get("value")
            .and_then(Value::as_str)
            .ok_or_else(|| "BLOCKED: Appium returned no live UI hierarchy.".to_owned())?;
        Ok(sha256_bytes(source.as_bytes()))
    }

    fn post(&self, path: String, body: Option<Value>) -> Result<Value, String> {
        self.request(Method::POST, &path, body)
    }

    fn request(&self, method: Method, path: &str, body: Option<Value>) -> Result<Value, String> {
        let url = format!(
            "{}{}",
            self.base_url,
            if path.starts_with('/') {
                path.to_owned()
            } else {
                format!("/{path}")
            }
        );
        let mut request = self.http.request(method, url);
        if let Some(body) = body {
            let body = serde_json::to_vec(&body).map_err(|error| {
                format!("BLOCKED: Appium request serialization failed: {error}")
            })?;
            request = request
                .header("content-type", "application/json")
                .body(body);
        }
        let response = request
            .send()
            .map_err(|error| format!("BLOCKED: Local Appium request failed: {error}"))?;
        let status = response.status();
        let text = response.text().map_err(|error| {
            format!("BLOCKED: Local Appium response could not be read: {error}")
        })?;
        let value = serde_json::from_str::<Value>(&text)
            .map_err(|error| format!("BLOCKED: Appium returned invalid JSON: {error}"))?;
        if !status.is_success() {
            return Err(format!(
                "FAILED: Appium HTTP {}: {}",
                status.as_u16(),
                appium_error(&value)
            ));
        }
        if value
            .get("value")
            .and_then(|item| item.get("error"))
            .is_some()
        {
            return Err(format!("FAILED: Appium: {}", appium_error(&value)));
        }
        Ok(value)
    }
}

fn session_path(session_id: &str, suffix: &str) -> String {
    if suffix.is_empty() {
        format!("/session/{session_id}")
    } else {
        format!("/session/{session_id}/{suffix}")
    }
}

fn appium_locator(locator: &Value) -> Result<(&str, String), String> {
    let strategy = locator
        .get("strategy")
        .and_then(Value::as_str)
        .ok_or_else(|| "BLOCKED: Android locator strategy is missing.".to_owned())?;
    let value = locator
        .get("value")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "BLOCKED: Android locator value is missing.".to_owned())?;
    match strategy {
        "accessibilityId" | "label" => Ok(("accessibility id", value.to_owned())),
        "resourceId" | "id" => Ok(("id", value.to_owned())),
        "xpath" => Ok(("xpath", value.to_owned())),
        "text" | "name" => Ok(("-android uiautomator", format!("new UiSelector().text(\"{}\")", java_string(value)))),
        _ => Err(format!("BLOCKED: Android locator strategy '{strategy}' is not supported by the verified Appium worker.")),
    }
}

fn java_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

fn element_id(value: &Value) -> Result<String, String> {
    let element = value
        .get("value")
        .ok_or_else(|| "FAILED: Appium returned no element.".to_owned())?;
    element
        .get("element-6066-11e4-a52e-4f735466cecf")
        .or_else(|| element.get("ELEMENT"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| "FAILED: Appium returned an invalid element reference.".to_owned())
}

fn scalar_value(value: &Value) -> Result<String, String> {
    match value.get("value") {
        Some(Value::String(value)) => Ok(value.clone()),
        Some(Value::Bool(value)) => Ok(value.to_string()),
        Some(Value::Number(value)) => Ok(value.to_string()),
        Some(Value::Null) => Ok(String::new()),
        _ => Err("BLOCKED: Appium returned a non-scalar element value.".to_owned()),
    }
}

fn appium_error(value: &Value) -> String {
    value
        .get("value")
        .and_then(|item| item.get("message").or_else(|| item.get("error")))
        .and_then(Value::as_str)
        .or_else(|| value.get("message").and_then(Value::as_str))
        .unwrap_or("unknown Appium error")
        .to_owned()
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

pub(crate) fn validate_spec(spec: &FarmRunSpec) -> Result<(), String> {
    if spec.schema_version != 1 {
        return Err(format!(
            "Unsupported farm schemaVersion '{}'.",
            spec.schema_version
        ));
    }
    if spec.session_id.trim().is_empty() {
        return Err("Farm sessionId is required.".to_owned());
    }
    if !matches!(
        spec.strategy.as_str(),
        "single" | "all-devices" | "split-iterations"
    ) {
        return Err(format!("Unsupported farm strategy '{}'.", spec.strategy));
    }
    if !matches!(
        spec.failure_policy.as_str(),
        "continue-other-devices" | "fail-fast"
    ) {
        return Err(format!(
            "Unsupported failure policy '{}'.",
            spec.failure_policy
        ));
    }
    if spec.device_group_id.is_some() && spec.device_ids.is_some() {
        return Err("Farm deviceGroupId and deviceIds are mutually exclusive.".to_owned());
    }
    if spec
        .device_group_id
        .as_deref()
        .is_some_and(|value| value.trim().is_empty())
    {
        return Err("Farm deviceGroupId must be a non-empty real group id.".to_owned());
    }
    if spec.max_parallel_devices == 0 || spec.max_parallel_devices > 64 {
        return Err("maxParallelDevices must be between 1 and 64.".to_owned());
    }
    if spec.iteration_delay_ms > 86_400_000 {
        return Err("iterationDelayMs cannot exceed 24 hours.".to_owned());
    }
    let Some(device_ids) = spec.device_ids.as_ref() else {
        if spec
            .device_group_id
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            return Ok(());
        }
        return Err("Farm deviceIds or deviceGroupId is required.".to_owned());
    };
    if device_ids.is_empty() || device_ids.iter().any(|id| id.trim().is_empty()) {
        return Err("Farm deviceIds must contain at least one real device id.".to_owned());
    }
    let unique = device_ids.iter().collect::<HashSet<_>>();
    if unique.len() != device_ids.len() {
        return Err("Farm deviceIds must be unique.".to_owned());
    }
    if spec.strategy == "split-iterations" {
        if spec.total_iterations.unwrap_or(0) == 0 {
            return Err(
                "totalIterations must be greater than zero for split-iterations.".to_owned(),
            );
        }
    } else if spec.iterations_per_device.unwrap_or(0) == 0 {
        return Err("iterationsPerDevice must be greater than zero for device replay.".to_owned());
    }
    Ok(())
}
