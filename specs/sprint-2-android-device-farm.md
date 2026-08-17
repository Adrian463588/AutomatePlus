# Sprint 2 Android Device Farm Contract

**Status:** Proposed implementation contract
**Scope:** Offline Windows host, real Android devices, Appium/UiAutomator2 primary path

## Goal

Run one canonical `AutomationSession` on several locally connected Android devices without duplicating `ActionIR`, leaking ADB serials into generated source, or treating unavailable runtime/device prerequisites as success.

## Required behavior

### Replay

`DeviceExecutionStrategy` is one of:

- `single`: preserve the existing single-device run.
- `all-devices`: every selected device executes `iterationsPerDevice`.
- `split-iterations`: one `totalIterations` queue is claimed by selected device workers.

The device selection is snapshotted before scheduling. `maxParallelDevices` bounds active workers. A device can have only one active lease/session.

The default failure policy is `continue-other-devices`. `fail-fast` stops unclaimed work and lets active workers finish cleanup. Per-device results remain visible regardless of aggregate outcome.

### Recording

Sprint 2 uses `primary-followers` recording:

- The primary device creates the only canonical action stream.
- Followers resolve the primary action's semantic locator against their own hierarchy.
- Follower observations are separate evidence and never mutate `ActionIR`.
- A follower mismatch is `NEEDS_REVIEW`, `SEMANTIC_SELECTOR_MISSING`, or `DEVICE_VARIANT_MISMATCH`; coordinates are never silently broadcast.
- Full mirror/input capture belongs to the primary. Followers expose status, hierarchy, and available thumbnails/evidence.

Independent simultaneous timelines are outside Sprint 2.

### Device identity and leases

`DeviceProfile.id` is a stable local identifier. `adbSerial` is current connection state; `serialSnapshot` is immutable run evidence. New farm sessions do not persist a live serial in canonical IR. Legacy single-device `targetConfig.deviceId` remains supported only through the compatibility resolver.

Lease lifecycle is `Reserved → Preparing → Running → Cleaning`, with terminal `Released`, `Failed`, `Disconnected`, or `Quarantined` states. Release is idempotent and required on success, failure, cancellation, timeout, disconnect, and host shutdown. Stale persisted leases are recovered during host startup.

### Runtime and ports

The host resolves only checksum-verified local packs. No package installation or network download is allowed during a run. The Appium server is loopback-only. Each device session receives a unique `udid`, `systemPort`, and `mjpegServerPort`; `chromedriverPort` is allocated only for webview actions. Port leases are persisted, validated, and released in `finally` cleanup paths.

### Evidence

Evidence is hierarchical:

```text
FarmRun
  └─ DeviceRun
       └─ DeviceIteration
            └─ StepEvidence / Artifact
```

Artifacts use:

```text
runs/<farmRunId>/devices/<deviceId>/iterations/<iterationId>/
```

Every step records action ID, device ID, serial snapshot, status, resolved locator, fallback state, duration, error code/message, and artifact references. Large logs and screenshots are files with hashes, not SQLite blobs.

Aggregate status is truthful:

- `Passed` only when all planned work passes.
- `Failed` when an execution failure occurs.
- `Blocked` when no iteration starts because prerequisites are unavailable.
- `Cancelled` when user cancellation terminates the run.
- `completion=partial` when some planned work is not successful or is not started.

## Generation contract

One generated project is produced per framework/language. The host injects a `DeviceRunContext` at execution time. Generated source must not contain a fixed ADB serial, fixed device-specific directory, or a hard-coded Appium port. Missing context is an explicit runtime error, never a localhost/port fallback.

Capability manifests declare supported strategies, parallel-session model, required packs, physical-device requirements, and project prerequisites. Unsupported combinations are rejected with `CapabilityError` or `Blocked`.

## Acceptance scenarios

1. Two real authorized devices run `all-devices` with two iterations each; every device has separate leases, ports, iteration IDs, logs, screenshots, and artifacts.
2. Two real authorized devices run `split-iterations`; each global iteration is executed exactly once.
3. A device disconnects; its `DeviceRun` is failed or blocked, other devices continue under the selected policy, and all leases/ports are released.
4. Cancellation terminates owned processes and leaves no active device or port lease.
5. Primary recording creates one canonical IR; each follower receives an independent locator observation; a mismatch cannot become a pass.
6. One-device mode remains usable; farm mode with fewer than two eligible devices is visibly blocked, not simulated.
7. Generated Appium source is formatter/lint/typecheck/compile validated with runtime context supplied externally.

## Evidence labels

Unit tests and injected process/device fixtures are `ComponentTest`. Browser migration-shell screenshots are `Prototype`. Only fresh WinUI, local runtime-pack, real ADB/Appium, and real multi-device evidence can be `Verified`.
