# OpenSpec: Phone Farm & Multi-Device Runner with Looping Replay (v1.4.0)

## 1. Problem Context
AutomatePlus provides low-code test automation across Web, Android, and API platforms. QA teams need to visually construct or record Android test flows ("click-and-run"), then replay them repeatedly (looping stress/stability testing) or fan them out across attached Android devices in a phone farm.

Previously, `runLooping` unconditionally blocked any session where `session.platform !== 'api'` with `"Browser looping is available only for API sessions."`. Furthermore, `runFarmTest` returned blocked whenever native Tauri farm packs were not present, despite `MultiDeviceRunner` and `AndroidInteractiveStepExecutor` existing within `@automate-plus/runner-core`.

## 2. Requirements & Invariants

### 2.1 Functional Requirements
- **FR-01: Android & Web In-App Looping Replay**: `runLooping` must execute sequential iterations for Android and Web sessions via `InteractivePlayer` and their respective step executors (`AndroidInteractiveStepExecutor` / `WebInteractiveStepExecutor`), tracking individual iteration durations and aggregate pass/fail metrics.
- **FR-02: Phone Farm Multi-Device Execution**: `runFarmTest` must support in-app and native execution dispatch using `MultiDeviceRunner`. When native Tauri farm packs are absent, `MultiDeviceRunner` must orchestrate port/device leases and execute each iteration across authorized devices via `AndroidInteractiveStepExecutor`.
- **FR-03: Strategy Adherence**: Multi-device execution must strictly honor `single`, `all-devices`, and `split-iterations` distribution strategies, with `continue-other-devices` as the default failure policy.
- **FR-04: UI 1-Click Looping & Farm Controls**: Provide accessible UI controls in `Header.tsx` (accessible `id="loop-button"`, `id="loop-count"`, `id="loop-go-button"`) and `VisualCanvas.tsx` (`id="run-notiplus-loop-3x"`) to trigger a 3-iteration loop on NotiPlus/Android sessions.

### 2.2 Invariants & Quality Standards
- **INV-01 (Offline-First)**: Zero network calls, zero cloud telemetry, no synthetic fake devices. Real connected ADB devices (e.g. `RRCN3008VYE`) retain their real serial identity.
- **INV-02 (KISS & Minimal Diff)**: Leverage existing `@automate-plus/runner-core` components (`MultiDeviceRunner`, `InteractivePlayer`, `AndroidInteractiveStepExecutor`) without introducing duplicate implementations.
- **INV-03 (Security & Bounds)**: Strictly bounded loop iterations (`iterations >= 1`), strict device lease locks (`one lease per serial`), and bounded duration calculations.
- **INV-04 (A11y & Contrast)**: Interactive controls must be at least 48x48 px or follow Workbench guidelines with explicit ARIA attributes and keyboard accessibility.

## 3. BDD Scenarios (Given-When-Then)

### Scenario 1: Android Session 3x Looping Replay
- **Given** an active Android session with valid `targetConfig` (`com.notifplus/.MainActivity`) and 6 recorded NotiPlus test steps
- **When** the user requests a looping run with `iterations = 3`
- **Then** the runner executes 3 sequential iterations of all 6 steps
- **And** all 3 iterations report status `passed`
- **And** the summary indicates `totalIterations: 3, successfulIterations: 3, failedIterations: 0, status: "passed"`
- **And** the UI feedback displays `"Loop completed: 3/3 iterations passed."`

### Scenario 2: Multi-Device Farm Single-Device Replay
- **Given** an authorized Android device profile in the device pool
- **When** `runFarmTest` is invoked with strategy `'single'` and `iterationsPerDevice = 2`
- **Then** `MultiDeviceRunner` acquires port and device leases
- **And** executes 2 iterations on the target device via `AndroidInteractiveStepExecutor`
- **And** releases all leases upon completion
- **And** returns `MultiDeviceRunSummary` with status `'passed'` and `totalPassedIterations: 2`

### Scenario 3: Loop Run Fails Fast on Step Failure
- **Given** an Android session containing an invalid or failing assertion step
- **When** the user runs looping with `iterations = 5`
- **Then** the first failing iteration terminates execution
- **And** remaining planned iterations are not executed
- **And** the summary reports status `'failed'` with `failedIterations >= 1`

## 4. Verification Gates
1. `npm run lint` & `npm run format:check` pass with 0 errors across all source files.
2. `npm run typecheck` passes across packages, sidecar, and desktop.
3. Vitest unit tests pass 100% across all suites (`npm test`).
4. Native Cargo tests pass (`cargo test --manifest-path backend/Cargo.toml --offline`).
5. Native clippy & fmt pass (`cargo clippy`, `cargo fmt`).
6. Playwright MCP live browser audit: 3x looping on NotiPlus flow completes with status `passed` and 0 console errors.
