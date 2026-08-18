use crate::contracts::FarmRunSpec;

pub(crate) fn validate_spec(spec: &FarmRunSpec) -> Result<(), String> {
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
