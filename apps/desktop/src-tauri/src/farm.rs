use crate::contracts::{
    runtime_id, DeviceProfile, DeviceRunResult, FarmRunSpec, LegacyFarmSummary,
};
use crate::ports::PortLeaseManager;
use crate::preflight::PreflightReport;
use rusqlite::Connection;
use std::sync::{atomic::AtomicBool, Arc};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct FarmCoordinator {
    health: PreflightReport,
    ports: PortLeaseManager,
    cancellation: Arc<AtomicBool>,
    database: Option<Connection>,
}

impl FarmCoordinator {
    pub fn new(
        health: PreflightReport,
        ports: PortLeaseManager,
        cancellation: Arc<AtomicBool>,
        database: Option<Connection>,
    ) -> Self {
        Self {
            health,
            ports,
            cancellation,
            database,
        }
    }

    pub fn plan(
        &self,
        session: serde_json::Value,
        spec: FarmRunSpec,
        devices: Vec<DeviceProfile>,
    ) -> Result<LegacyFarmSummary, String> {
        validate_spec(&spec)?;
        if spec.device_group_id.is_some() && spec.device_ids.is_none() {
            return Err(
                "Device group replay requires a resolved snapshot of member device IDs.".to_owned(),
            );
        }
        let started = now();
        let session_id = session
            .get("id")
            .and_then(serde_json::Value::as_str)
            .unwrap_or(&spec.session_id)
            .to_owned();
        let mut targets = devices
            .into_iter()
            .filter(|device| {
                spec.device_ids
                    .as_ref()
                    .map(|ids| device.status == "device" && ids.contains(&device.device_id))
                    .unwrap_or(device.status == "device")
            })
            .collect::<Vec<_>>();
        if spec.strategy == "single" {
            targets.truncate(1);
        }
        let reason = if self.health.status != "ready" {
            self.health.reason.clone()
        } else if targets.is_empty() {
            "No real authorized target devices were selected.".to_owned()
        } else {
            "Farm executor is not bundled; execution was not attempted.".to_owned()
        };
        let target_count = targets.len();
        let runs = targets
            .into_iter()
            .enumerate()
            .map(|(index, device)| DeviceRunResult {
                device_run_id: runtime_id("device-run"),
                device_id: device.device_id,
                adb_serial: device.adb_serial,
                model: device.model,
                status: "blocked".to_owned(),
                planned_iterations: planned_iterations_for_device(&spec, index, target_count),
                completed_iterations: 0,
                passed_iterations: 0,
                failed_iterations: 0,
                duration_ms: 0,
                iterations: Vec::new(),
                error: Some(reason.clone()),
            })
            .collect::<Vec<_>>();
        let total_planned_iterations = planned_iterations(&spec, target_count as u32);
        let _ = (&self.ports, &self.cancellation, &self.database);
        Ok(LegacyFarmSummary {
            farm_run_id: runtime_id("farm"),
            session_id,
            strategy: spec.strategy,
            failure_policy: spec.failure_policy,
            status: "blocked".to_owned(),
            total_planned_iterations,
            total_completed_iterations: 0,
            total_passed_iterations: 0,
            total_failed_iterations: 0,
            duration_ms: 0,
            device_runs: runs,
            started_at: started,
            finished_at: now(),
            error_summary: Some(reason),
        })
    }
}

fn validate_spec(spec: &FarmRunSpec) -> Result<(), String> {
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
    if spec.max_parallel_devices == 0 {
        return Err("maxParallelDevices must be greater than zero.".to_owned());
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

fn planned_iterations(spec: &FarmRunSpec, device_count: u32) -> u32 {
    match spec.strategy.as_str() {
        "split-iterations" => spec.total_iterations.unwrap_or_default(),
        "single" | "all-devices" => spec
            .iterations_per_device
            .unwrap_or_default()
            .saturating_mul(device_count),
        _ => 0,
    }
}

fn planned_iterations_for_device(spec: &FarmRunSpec, index: usize, device_count: usize) -> u32 {
    match spec.strategy.as_str() {
        "split-iterations" => {
            let total = spec.total_iterations.unwrap_or_default() as usize;
            if device_count == 0 {
                return 0;
            }
            let base = total / device_count;
            let remainder = total % device_count;
            (base + if index < remainder { 1 } else { 0 }) as u32
        }
        "single" | "all-devices" => spec.iterations_per_device.unwrap_or_default(),
        _ => 0,
    }
}

fn now() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}
