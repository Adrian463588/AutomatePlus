# Production Release MVP Audit and Acceptance Contract

**Status:** Active implementation contract
**Iteration budget:** Two build-review rounds
**Target:** Windows x64 local desktop, Tauri 2 + Rust, React/TypeScript, offline-first

## Objective

Make AutomatePlus usable as a local production MVP without inventing targets,
devices, metrics, progress, artifacts, or successful runs. The native host owns
ADB/Appium/process/device/evidence boundaries; TypeScript owns IR, selectors,
recording adapters, generators, and versioned IPC contracts.

The control plane is offline. Network access is permitted only after an explicit
user action for the acceptance targets SauceDemo, DemoQA, ReqRes, and Swagger
Petstore. The launcher never downloads, installs, logs in to, or contacts a
cloud control plane.

## Acceptance requirements and traceability

| Requirement | Interface/ADR | Module boundary | Evidence | Status |
|---|---|---|---|---|
| Truthful native health and capability state | ADR-001/002, `NativeHealth` | Rust preflight, Tauri dispatch, desktop bridge | Preflight JSON; Cargo compile blocked by missing offline `tauri` | NeedsReview |
| One-click local launch | Launcher contract | `Run-AutomatePlus.bat`, offline build script | `--doctor` and default fail-closed launcher output | NeedsReview |
| Real device discovery | FR-04/14, `DeviceProfile` | Rust ADB client, SQLite, bridge | Two-device ADB target snapshot; native host acceptance blocked | NeedsReview |
| Farm leases and ports | FR-15, `FarmRunSpec`, `DeviceRunContext` | Rust coordinator, port/process supervisors | Component lease tests; verified Appium pack/native executor blocked | NeedsReview |
| Primary/follower observation | FR-16, `RecordingPlan` | Android recorder and selector engine | Component observation tests; native recorder blocked | NeedsReview |
| Complete generator matrix | FR-07/17, capability manifests | `packages/generators` | `verify:generators` — 27 combinations | Verified |
| Runtime Manager and offline distribution | FR-12, runtime IPC 1.0, catalog contract | Rust runtime manager, SQLite migration, Runtime Manager UI, launcher | `verify:runtime-catalog`, `verify:runtime-manager`, `verify:offline-install`, `verify:release-manifest` | NeedsReview/Blocked until pinned artifacts and native bootstrap are supplied |
| Native Windows folder and archive selection | `native.dialog.pick` IPC 1.0 | Rust `rfd` dialog boundary, versioned desktop bridge, Create Project and Runtime Manager | Picker contract tests; native Windows folder/file selection evidence | NeedsReview until Tauri host is built and manually exercised |
| Real web/API target checks | FR-03/05/08/11 | Explicit online E2E harness | SauceDemo, DemoQA, and Petstore probes; browser and ReqRes prerequisites blocked | Blocked |
| Responsive accessible UI | NFR-05/09 | React renderer | UI contract, lint/build, Runtime Manager viewport PNGs; live browser a11y retest pending | NeedsReview |
| Safe publication | Change discipline | Reviewed allowlist and Git checks | Local/remote SHA match | Verified |

## Required behavior

- Missing or unverified packs, devices, target apps, credentials, selectors, or
  project prerequisites produce `Blocked` or `NeedsReview`; they never produce
  a simulated pass.
- Every ADB operation is bound to the serial captured in the current snapshot.
- Farm workers own one leased device and one isolated runtime context. Serial
  snapshots, ports, observations, and artifacts never enter canonical ActionIR.
- `native.run` must return a failure IPC envelope when execution is unavailable;
  a successful envelope may contain only a measured run result.
- Generated source must not contain fixed serials, fixed Appium ports, fake
  imports, TODO fallbacks, fabricated selectors, or silent runtime fallbacks.
- Unit fixtures remain explicitly `ComponentTest`; they cannot be reported as
  native, real-browser, API-network, or physical-device evidence.

## Verification commands

```text
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build:packages
npm run build:sidecar
npm run build:desktop
npm run verify:generators
npm run verify:ui-contract
npm run verify:sidecar
npm run verify:k6:fixture
npm run verify:k6
npm run verify:runtime-catalog
npm run verify:runtime-manager
npm run verify:offline-install
npm run verify:release-manifest
npm run verify:docs
npm run verify:authenticity
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --offline -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --offline
npm run native:preflight
npm run native:check
npm run native:build
npm run e2e:online
npm run e2e:android
```

Online and physical checks are explicit, separate commands. Their evidence is
`Blocked` when the required local runtime pack, real target, credential, browser,
Appium service, or authorized device is unavailable.

## Review and stop conditions

Review each requirement against fresh evidence after every build round. Stop
after two rounds, or earlier when a missing external prerequisite needs user
provisioning. The final report must separate `Accepted`, `Blocked`, and `Open
Risks`, with exact commands and exit codes.
