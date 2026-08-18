# AutomatePlus System Design

Version: 3.0.0
Status: Active implementation contract
Desktop runtime: Tauri 2 + Rust on Windows x64
Renderer and sidecar: React/TypeScript with local versioned IPC
Operating boundary: offline local control plane; explicit user-requested target E2E may access declared websites/APIs

## 1. Decision summary

Tauri 2 + Rust is the active desktop host. The React/Vite application is the same renderer used by Tauri and remains a safe migration shell when opened in an ordinary browser. The previous .NET/WinUI implementation is retained as legacy reference source only; it is not built, launched, or required by the release path because the required .NET 8 toolchain is not available on the target workstation.

The host has no implicit network dependency. A user may explicitly start an online target E2E profile for the declared acceptance websites/APIs or enable runtime onboarding with `AUTOMATEPLUS_RUNTIME_DOWNLOAD=1`; that traffic is target/artifact data, not cloud orchestration, telemetry, or a launcher fallback.

Rust owns the privileged and stateful operations:

- Tauri window and command boundary.
- ADB discovery, serial binding, device leases, Appium/scrcpy/sidecar process lifecycle, cancellation, and cleanup.
- Offline runtime-pack verification, loopback port leases, SQLite migrations, artifact files, and report aggregation.

TypeScript owns portable automation semantics:

- SessionIR/ActionIR validation and normalization.
- Selector scoring and semantic locator policy.
- Web/Android recording adapters and code generators.
- Versioned IPC payload contracts and NDJSON sidecar protocol.

The renderer never calls ADB, Appium, scrcpy, Node process APIs, SQLite, or generated-framework APIs directly.

## 2. Architecture decision records

### ADR-001 — Tauri/Rust is the production desktop boundary

Decision: ship one Tauri executable with a Rust host and React renderer. It provides a local WebView frontend, a native process boundary, capability restrictions, and an offline Windows packaging path without requiring the unavailable .NET 8 SDK.

Browser mode cannot provide native evidence. It displays empty or Blocked states and never seeds a device.

### ADR-002 — Sidecar state crosses a versioned boundary

Use IpcRequest/IpcResponse envelopes with protocolVersion "1.0", UUID correlationId, method, and typed payload. Tauri invokes the same dispatch contract through automate_plus_dispatch; the native dialog method is dispatched through an asynchronous parent-aware command so the WebView main thread remains responsive. A future packaged Node sidecar uses NDJSON over stdin/stdout. Unknown protocol versions or methods fail closed with a serialized error.

### ADR-003 — Device identity is not the ADB serial

Hash observed hardware identity/model/product into a stable local deviceId. Store adbSerial only as current profile state and immutable run-time serial snapshot. Every worker binds its ADB/Appium/scrcpy arguments to its lease snapshot. A missing or changed serial blocks the worker.

### ADR-004 — Farm execution is capability-gated

single, all-devices, and split-iterations are contract-level strategies. They become executable only when verified Appium/UiAutomator2/scrcpy packs, a target app, authorized devices, and a real executor are present. Missing prerequisites are Blocked; no fallback executor or simulated pass exists.

## 3. Runtime topology

Topology: Browser migration shell or Tauri window → React renderer → desktopBridge and IPC 1.0 → Rust native host. The host owns SQLite, ADB with a leased serial, loopback Appium/UiAutomator2, device-bound scrcpy, checksum-verified packs, and process cleanup. The bridge also reaches the TypeScript sidecar for IR, selectors, and generators.

The browser shell may persist user-created projects and sessions in browser storage for migration work, but it has no native authority. Tauri is the only release host.

## 4. Repository modules

| Layer | Location | Responsibility |
|---|---|---|
| Renderer | apps/desktop/src | React UI, state, responsive/a11y presentation |
| Bridge | apps/desktop/src/services/desktopBridge.ts | Browser-safe adapters and Tauri IPC calls |
| Contracts | packages/contracts/src | IPC, device-farm, capability, runner contracts |
| IR | packages/ir-schema | Canonical versioned session/action schemas |
| Selector | packages/selector-engine | Semantic locator ranking |
| Generators | packages/generators | One project per framework/language with runtime context |
| Sidecar | apps/sidecar and recorder packages | IR/selector/generator and recorder protocol |
| Native host | apps/desktop/src-tauri/src | Rust discovery, preflight, leases, SQLite, processes, cleanup |
| Native packaging | scripts/build-native-offline.mjs | Offline verification, staging, format/test/build |
| Launcher | Run-AutomatePlus.bat, automate-plus.bat | One-click offline desktop and server entrypoints |

reference/ and docs/Sprint2/ are research inputs and remain read-only.

## 5. IPC contract

Requests and responses are JSON objects:

    {
      "protocolVersion": "1.0",
      "kind": "request",
      "correlationId": "uuid",
      "method": "devices.discover",
      "payload": {}
    }

    {
      "protocolVersion": "1.0",
      "kind": "response",
      "correlationId": "uuid",
      "method": "devices.discover",
      "payload": { "ok": true, "data": { "devices": [] } }
    }

Supported methods are native.health, native.capabilities, native.dialog.pick, devices.discover, device-groups.list, recording.start, recording.stop, farm.run.start, farm.run.cancel, artifacts.list, native.run, runtime.catalog.list, runtime.roots.scan, runtime.root.select, runtime.install.start, runtime.install.status, runtime.install.cancel, runtime.import, runtime.verify, runtime.health, and runtime.open-folder. `native.dialog.pick` is Rust-owned and uses a native Windows folder/file dialog; the renderer receives only a canonical selected path or an explicit cancellation. Failure payloads use shared automation error codes; native failures never become a pass.

## 6. Device model and discovery

DeviceProfile contains schemaVersion, stable deviceId, current adbSerial, model, manufacturer, product, Android version, SDK level, emulator flag, resolution, density, orientation, transport, status, health state, and lastSeenAt.

Rust executes real adb devices -l. For an authorized row it binds all property queries as adb -s serial and reads getprop, wm size, and wm density. Missing properties remain explicitly unknown/zero; they are never replaced with a sample value. Unauthorized/offline rows are visible but ineligible for a run.

Discovery and health are separate from execution readiness. A device can be discovered while native health remains Blocked because packs, target app, or another prerequisite is missing.

## 7. Farm contract and scheduler

FarmRunSpec contains sessionId, an explicit stable deviceIds list or deviceGroupId, strategy, iteration count, maxParallelDevices, delay, and failure policy. The selected group is snapshotted before workers start.

    discover
      -> snapshot group
      -> acquire one device lease per worker
      -> preflight serial, target app, and runtime
      -> reserve Appium/system/MJPEG/ChromeDriver ports
      -> create isolated session
      -> execute iterations
      -> persist evidence and hashes
      -> stop processes/session
      -> release ports and device lease

single preserves one-device behavior. all-devices runs iterationsPerDevice on every selected device. split-iterations claims a global totalIterations queue exactly once. maxParallelDevices bounds active workers. continue-other-devices lets independent workers continue; fail-fast prevents new work while active workers clean up.

One worker owns one lease. Lease and port cleanup is idempotent on success, failure, cancellation, timeout, disconnect, and host shutdown. SQLite startup recovers stale reserved, preparing, running, or cleaning leases.

Aggregate status is:

- passed only when all planned iterations pass;
- failed when an execution failure occurs;
- blocked when no iteration can start because prerequisites are unavailable;
- cancelled when the user cancels;
- completion complete or partial describes whether planned work reached a terminal result.

## 8. Ports and process isolation

PortLeaseManager binds loopback TCP listeners while a lease is active. It validates the configured offline range, rejects duplicate/privileged ports, reserves atomically under a mutex, and releases listeners idempotently. A parallel Appium session receives unique systemPort and mjpegServerPort; chromedriverPort is allocated only for a required webview.

Rust starts only allowlisted executables from the verified runtime root: ADB, Appium, scrcpy, Node, and the packaged sidecar. Arguments are arrays, not shell strings. On Windows, cancellation terminates the complete owned process tree through taskkill /T /F, then waits for the child.

## 9. Recording and semantic observation

RecordingPlan uses mode primary-followers, one primaryDeviceId, and follower IDs. The primary produces the only canonical ActionIR stream and receives the full mirror/input stream. Followers independently inspect hierarchy/status and resolve semantic locators. Outcomes are MATCHED, FALLBACK_USED, SEMANTIC_SELECTOR_MISSING, DEVICE_VARIANT_MISMATCH, NEEDS_REVIEW, BLOCKED, or FAILED.

Follower observations never become extra actions and never silently receive primary coordinates. A mismatch remains reviewable and cannot be reported as successful device coverage. Independent synchronized timelines are deferred beyond Sprint 2.

## 10. Generation boundary

The generator creates one project per framework/language. Appium output requires external runtime context:

    AUTOMATEPLUS_APPIUM_URL
    AUTOMATEPLUS_DEVICE_UDID
    AUTOMATEPLUS_SYSTEM_PORT
    AUTOMATEPLUS_MJPEG_SERVER_PORT
    AUTOMATEPLUS_CHROMEDRIVER_PORT (when required)

Missing context is an explicit capability/runtime error. Generated source contains no fixed serial, 4723 fallback, device-specific path, or source duplicate per device. Capability manifests declare supported strategies, parallel-session model, required packs, physical-device requirement, and project prerequisites.

## 11. SQLite and evidence

The native migration creates schema_migrations, device_profiles, device_groups, device_leases, port_leases, farm_runs, device_runs, device_iterations, observations, and artifact_index. The Rust host opens the database, applies migrations, records the applied version, saves real profiles, and recovers stale leases.

Large evidence is stored as files below:

    runs/<farmRunId>/devices/<deviceId>/iterations/<iterationId>/

The artifact index stores relative path, kind/media type, and SHA-256. Screenshots, logs, traces, and videos are not session JSON blobs.

## 12. Security and offline distribution

The launcher and native preflight verify the local manifest, SHA-256 packs, frontend build, Rust toolchain, Tauri CLI, ADB/Appium/scrcpy availability, WebView2, and process conditions. They never download dependencies. Run-AutomatePlus.bat starts a published Tauri executable when present, then a bundled bootstrap executable when the main host is absent; if neither exists it reports a setup blocker and exits. The browser-safe migration shell is an explicit `--browser` mode and keeps Android/device capabilities Blocked. Native folder and archive selection is performed by the Rust host through the pinned `rfd` dependency; browser mode never emulates it with a prompt or shell command.

Runtime Manager uses the bundled metadata-only `runtime-packs/catalog.json`; startup never contacts a remote catalog. Known roots are the user-selected root, workspace `runtime-packs`, `%LOCALAPPDATA%\AutomatePlus\runtime-packs`, `%ProgramData%\AutomatePlus\runtime-packs`, and bundled resources. The native manager stores root selection, job state, installed-pack records, license acceptance, and evidence in the versioned SQLite migration. Downloads are HTTPS-only, host-allowlisted, cancellation-aware, size-limited, streamed to staging, SHA-256 checked, safely extracted, health-checked, and atomically published. ZIP traversal, symlink, junction, executable-path, and overwrite risks fail closed. An online transfer can start only from the explicit Runtime Manager action with accepted licenses and `AUTOMATEPLUS_RUNTIME_DOWNLOAD=1`; execution after installation resolves local verified evidence only.

Tauri capabilities are least privilege. CSP permits only the local renderer and loopback development connection. Secrets are references, redacted in logs and errors, and never placed in generated source as plaintext.

## 13. UI and accessibility

The farm workspace is responsive at 390, 600, 768, 840, 1024, 1280, and 1440 px. It uses an adaptive device grid, 48px targets, focus-visible styling, semantic headings/list/status regions, keyboard reachability, reduced-motion-safe transitions, and bounded scroll areas for logs/timelines. Only the active device can receive a full mirror; other devices expose status/thumbnail evidence when a verified runtime provides it.

Every button has a real action or an explanatory disabled state. Browser mode has no fake ShopApp, device, battery, clock, progress, or run result. Empty and Blocked states explain the missing user input or runtime prerequisite.

## 14. Verification and evidence status

| Gate | Command | Current rule |
|---|---|---|
| TypeScript | npm ci --offline, lint, format, typecheck, test | Required and runnable locally |
| Packages/UI | build:packages, build:sidecar, build:desktop | Required before release |
| Smoke/docs | verify:sidecar, verify:k6:fixture, verify:docs, verify:authenticity | Component evidence only; verify:k6 is target-online and separately gated |
| Runtime distribution | verify:runtime-catalog, verify:runtime-manager, verify:offline-install, verify:release-manifest | Catalog completeness is component-verified; unresolved artifact metadata is Blocked/NeedsReview |
| Rust source | cargo fmt --check | Must pass independently |
| Rust build/test | cargo clippy --offline, cargo test --offline | Blocked when crates are not cached |
| Tauri build | npm run native:build | Requires local Tauri CLI/packs |
| Physical Android | two authorized devices, target app, verified packs | Blocked until present |

Fixtures may exercise parsers, selectors, IPC, lease logic, and failure transitions. They cannot promote native or physical acceptance to Verified.

## 15. Traceability

| Requirement | Contract/ADR | Module | Test/evidence | Status |
|---|---|---|---|---|
| Offline Tauri launch | ADR-001, launcher contract | src-tauri, Run-AutomatePlus.bat | preflight/launcher smoke | Implemented; pack/CLI blocked |
| Real discovery and stable IDs | FR-14, ADR-003 | src-tauri/src/adb.rs, contracts | ADB parser tests; device evidence | Implemented; physical evidence blocked |
| Farm strategies and leases | FR-15, ADR-004 | device-farm, runner core, Rust ports | scheduler/lease tests | Contract/component; Appium executor blocked |
| Primary/follower recording | FR-16 | recorder contracts, native dispatch | observation tests | Contract/component; runtime blocked |
| Runtime-context generation | FR-17 | packages/generators | no-fixed-port tests | Implemented |
| Runtime Manager | FR-12, runtime IPC 1.0 | runtime.rs, runtime_catalog.rs, RuntimeManagerContainer, launcher | component verifiers, responsive PNGs, offline/release gates | Implemented; native artifact/Cargo gates blocked |
| Native folder/archive picker | `native.dialog.pick`, IPC 1.0 | Rust `rfd` boundary, desktop bridge, Sidebar, Runtime Manager | contract tests and manual Windows picker evidence | Implemented in contract; native host evidence pending |
| Truthful UI | NFR-05/NFR-16 | DeviceFarmView, bridge/store | authenticity/build/viewport evidence | Implemented in shell |
| Persistence/evidence | FR-18 | Rust migration/persistence | SQLite gate | Source implemented; crate cache blocked |

## 16. Legacy boundary

The .NET/WinUI source and documents may be consulted for historical migration context, but no active command, launcher, package, or release acceptance depends on them. Reintroducing another native host requires an approved design change and fresh gates.
