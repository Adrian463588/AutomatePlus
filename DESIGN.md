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

Use IpcRequest/IpcResponse envelopes with protocolVersion "1.0", UUID correlationId, method, and typed payload. The renderer UTF-8 encodes the envelope as a bounded raw Tauri body; Rust checks the 8 MiB byte ceiling before Serde JSON deserialization, then invokes the same dispatch contract through automate_plus_dispatch. The native dialog method is dispatched through an asynchronous parent-aware command so the WebView main thread remains responsive. The packaged Node sidecar uses bounded NDJSON over stdin/stdout. Unknown protocol versions, JSON bodies, or methods fail closed with a serialized error.

### ADR-003 — Device identity is not the ADB serial

Hash observed hardware identity/model/product into a stable local deviceId. Store adbSerial only as current profile state and immutable run-time serial snapshot. Every worker binds its ADB/Appium/scrcpy arguments to its lease snapshot. A missing or changed serial blocks the worker.

### ADR-004 — Farm execution is capability-gated

single, all-devices, and split-iterations are contract-level strategies. They become executable only when verified Appium/UiAutomator2/scrcpy packs, a target app, authorized devices, and a real executor are present. Missing prerequisites are Blocked; no fallback executor or simulated pass exists.

### ADR-005 — Large and asynchronous boundaries are bounded

Runtime-pack SHA-256 uses fixed-size streaming buffers in Rust and Node. Native raw IPC rejects bodies above 8 MiB before JSON deserialization; NDJSON rejects oversized UTF-8 output before writing; SessionIR migration rejects more than 1,000 actions or an estimated 8 MiB object graph before cloning. Runtime catalog/manifest metadata is capped at 8 MiB and artifact listing rejects responses above 1,000 rows. Sidecar stdout honors stream backpressure with close/error/timeout handling, incomplete NDJSON reports a protocol error, and k6 uses an atomic bounded read, requires real HTTP metrics, caps RPS/duration/VUs, and waits for process-tree cleanup instead of exposing raw JSON EOF. Farm thread creation is capped before spawning, generated projects and command arguments have aggregate budgets, and noisy runner processes are terminated when their combined stdout/stderr exceeds the configured budget. Runtime installs, farm runs, supervised processes, follower observations, archive expansion, retained job history, and executable runners each have explicit concurrency or size limits. Limits fail closed and never truncate an action into a pass.

## 3. Runtime topology

Topology: Browser migration shell or Tauri window → React renderer → desktopBridge and IPC 1.0 → Rust native host. The host owns SQLite, ADB with a leased serial, loopback Appium/UiAutomator2, device-bound scrcpy, checksum-verified packs, and process cleanup. The bridge also reaches the TypeScript sidecar for IR, selectors, and generators.

The browser shell may persist user-created projects and sessions in browser storage for migration work, but it has no native authority. Tauri is the only release host.

## 4. Repository modules

| Layer | Location | Responsibility |
|---|---|---|
| Renderer | frontend/src | React UI, state, responsive/a11y presentation |
| Bridge | frontend/src/services/desktopBridge.ts | Browser-safe adapters and Tauri IPC calls |
| Contracts | frontend/packages/contracts/src | IPC, device-farm, capability, runner contracts |
| IR | frontend/packages/ir-schema | Canonical versioned session/action schemas |
| Selector | frontend/packages/selector-engine | Semantic locator ranking |
| Generators | frontend/packages/generators | One project per framework/language with runtime context |
| Sidecar | frontend/sidecar and frontend/packages | IR/selector/generator and recorder protocol |
| Native host | backend/src | Rust discovery, preflight, leases, SQLite, processes, cleanup |
| Native packaging | scripts/build-native-offline.mjs | Offline verification, staging, format/test/build |
| Launcher | Run-AutomatePlus.bat | Single native-first offline desktop entrypoint |

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

Supported methods are native.health, native.capabilities, native.dialog.pick, native.release.open, devices.discover, device-groups.list, recording.start, recording.stop, farm.run.start, farm.run.status, farm.run.cancel, artifacts.list, native.run, runtime.catalog.list, runtime.roots.scan, runtime.root.select, runtime.install.start, runtime.install.status, runtime.install.cancel, runtime.import, runtime.verify, runtime.health, and runtime.open-folder. `native.dialog.pick` is Rust-owned and uses a native Windows folder/file dialog; the renderer receives only a canonical selected path or an explicit cancellation. Failure payloads use shared automation error codes; native failures never become a pass.

`native.release.open` opens only the four declared HTTPS release/history links in the Windows default browser using ShellExecuteW. WebView2 rejects unhandled target-blank popups, so renderer download links use this explicit native boundary. It does not accept arbitrary URLs, launch a shell command, install artifacts or bypass runtime license/download gates.

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

### 10.1 Deterministic locator selection and self-healing

Recording adapters preserve every locator observed from the real target and the
selector engine ranks that evidence with a platform-aware, deterministic score.
Generation chooses the highest-ranked candidate, while generated Playwright and
Appium JavaScript/TypeScript projects may retry only the remaining recorded
candidates in that order. The in-app player uses the same policy. Healing is
bounded to eight candidates per action, never invents a selector or coordinate,
and fails closed when no live evidence remains. Other generator languages still
receive the ranked locator evidence and require their verified framework pack;
they do not receive an unverified runtime fallback.

## 11. SQLite and evidence

The native migration creates schema_migrations, device_profiles, device_groups, device_leases, port_leases, farm_runs, device_runs, device_iterations, observations, and artifact_index. The Rust host opens the database, applies migrations, records the applied version, saves real profiles, and recovers stale leases.

Large evidence is stored as files below:

    runs/<farmRunId>/devices/<deviceId>/iterations/<iterationId>/

The artifact index stores relative path, kind/media type, and SHA-256. Screenshots, logs, traces, and videos are not session JSON blobs.

## 12. Security and offline distribution

The launcher and native preflight verify the local manifest, SHA-256 packs, frontend build, Rust toolchain, Tauri CLI, ADB/Appium/scrcpy availability, WebView2, and process conditions. Host readiness is computed only from host prerequisites; automation-pack and target capabilities are reported separately so missing packs cannot prevent a healthy desktop host from building or opening. Overall production acceptance remains Blocked while required pack or target capabilities are unavailable. The launcher never downloads dependencies. Run-AutomatePlus.bat starts a published Tauri executable when present, then a bundled bootstrap executable when the main host is absent; if neither exists it reports a setup blocker and exits. The browser-safe migration shell is an explicit `--browser` mode and keeps Android/device capabilities Blocked. Native folder and archive selection is performed by the Rust host through the pinned `rfd` dependency; browser mode never emulates it with a prompt or shell command.

Runtime Manager uses the bundled metadata-only `runtime-packs/catalog.json`; startup never contacts a remote catalog. Known roots are the user-selected root, workspace `runtime-packs`, `%LOCALAPPDATA%\AutomatePlus\runtime-packs`, `%ProgramData%\AutomatePlus\runtime-packs`, and bundled resources. The native manager stores root selection, job state, installed-pack records, license acceptance, and evidence in the versioned SQLite migration. Downloads are HTTPS-only, host-allowlisted, cancellation-aware, size-limited, streamed to staging, SHA-256 checked, safely extracted, health-checked, and atomically published. ZIP traversal, symlink, junction, executable-path, and overwrite risks fail closed. An online transfer can start only from the explicit Runtime Manager action with accepted licenses and `AUTOMATEPLUS_RUNTIME_DOWNLOAD=1`; execution after installation resolves local verified evidence only.

Tauri capabilities are least privilege. CSP permits the local renderer, Tauri's `ipc:`/`http://ipc.localhost` transport, and loopback development connections only. The local IPC protocol must be allowed so WebView2 sends bounded binary bodies; a JSON postMessage fallback is not accepted by the raw Rust command. Secrets are references, redacted in logs and errors, and never placed in generated source as plaintext.

## 13. UI and accessibility

The farm workspace is responsive at 390, 600, 768, 840, 1024, 1280, and 1440 px. It uses an adaptive device grid, 48px targets, focus-visible styling, semantic headings/list/status regions, keyboard reachability, reduced-motion-safe transitions, and bounded scroll areas for logs/timelines. Only the active device can receive a full mirror; other devices expose status/thumbnail evidence when a verified runtime provides it.

Every button has a real action or an explanatory disabled state. Browser mode has no fake ShopApp, device, battery, clock, progress, or run result. Empty and Blocked states explain the missing user input or runtime prerequisite.

## 13A. Precision Workbench Anti-Slop contract

The renderer uses a deliberate Windows desktop workbench direction. This is a product UI, not a marketing surface.

- Use semantic design tokens for canvas, surfaces, borders, text, accent, success, warning, and error. New components must not introduce arbitrary colors, radii, shadows, or spacing values.
- Use `Segoe UI Variable` with Windows-native fallbacks for UI text and `Cascadia Mono` for code, paths, and process output. No remote font loading.
- Use a 4px spacing base, 6px/10px radii, borders before elevation, and shadow only for dialogs or a clearly elevated transient surface.
- Do not use gradients, glassmorphism, decorative glow, oversized rounded cards, card-within-card layouts, decorative badges, or animation on non-interactive elements.
- Prefer content hierarchy, alignment, whitespace, and typography before borders or color. Each screen has one primary task and one clear primary action.
- Bento surfaces are functional groupings, not a card wall: the active root/health summary has one larger anchor region, while related actions and evidence use compact adjacent regions. Empty space is intentional only when it preserves hierarchy; an editor column is never reserved for Runtime Manager or Device Farm.
- Runtime, device, and API detail uses progressive disclosure. Advanced controls appear only when their parent task is available.
- The desktop shell bounds the workspace between the header and terminal. Scroll ownership belongs to the active pane or sidebar content, so terminal output cannot cover a runtime, farm, recorder, or API control.
- Motion is state-driven only: pending, selection, focus, success, error, blocked, and cancellation. Reduced-motion users receive equivalent state feedback without decorative animation.
- Native `<select>` remains the control for option selection. Its closed state, focus state, option contrast, disabled state, forced-colors state, and keyboard behavior are tested on WebView2/Windows.
- Every interactive control is at least 48px in its hit area, has an accessible name, and either has a real handler or a disabled explanation.
- Browser mode remains a truthful migration shell. It never substitutes browser prompts, fabricated runtime counts, fake devices, or fake progress for native evidence.

## 13B. Workbench usability and interaction contract

The supplied design guides inform typography, hierarchy and interaction. They do not replace the active native/security contract or introduce marketing decoration.

1. **Zero-Slop Invariants**:
   - Zero linear/radial/mesh gradients on surfaces or cards.
   - Zero `backdrop-blur` glassmorphism; borders are crisp `1px solid var(--border)` or `var(--border-strong)`.
   - Zero uncalibrated violet/indigo accents; primary accents are neutral dark (`zinc-900`/`zinc-100`) or functional state colors (`emerald-500` success, `amber-500` warning, `rose-500` danger, `sky-500` informational).
   - Zero arbitrary inline CSS (`style={{ ... }}`) or uncalibrated Tailwind hex scales.
2. **Encapsulated Layout & Zero-Margin Invariant**:
   - Child components never leak external margins (`mt-*`, `mb-*`).
   - New form/layout spacing is governed by parent Flexbox/Grid containers using semantic 4/8/12/16/24px spacing. Existing utility classes map to shared surface/text tokens to keep the diff small.
   - Field labels are top-aligned and associated with their inputs; hints are descriptions, not part of the accessible name.
3. **Concentric Radius Formula**:
   - Nested elements follow the mathematical concentric formula: $R_{\text{inner}} = \max(0, R_{\text{outer}} - \text{Padding})$. Outer card containers use 8px/10px radii; inner nested badges and controls use 4px/6px.
4. **Minor Third (1.200) Modular Typography**:
   - Display/H1: 32px / 2.0rem, LH 1.15, tracking -0.025em.
   - Section/H2: 24px / 1.5rem, LH 1.20, tracking -0.020em.
   - Title/H3: 20px / 1.25rem, LH 1.25, tracking -0.015em.
   - Subhead/H4: 16px / 1.0rem, LH 1.35, tracking -0.010em.
   - Body UI: 14px / 0.875rem, LH 1.50, tracking 0.000em.
   - Label/Action: 13px / 0.8125rem, LH 1.35, tracking +0.005em.
   - Caption/Mono: 12px / 0.75rem, LH 1.40, tracking +0.020em.
5. **Tactile Micro-Interactions Budget**:
   - State-driven motion uses 120–180ms (`var(--ap-motion-fast)` is 120ms).
   - Micro-depression feedback: `.tactile-active` applies `active:scale-[0.98] active:translate-y-[0.5px]`.
   - Strict `prefers-reduced-motion` compliance resets transforms to `none`.
6. **Zero Dead Buttons & Accessible Affordance**:
   - Every `<button>` must have an explicit `onClick` or `type="submit"`. No silent no-ops.
   - Users explicitly create their project/session and provide their target/actions. No preset invents a workspace, selector, device, target page or successful run.
   - Every disabled button must convey state rationale via accessible tooltip/attribute (`title`, `aria-label`, or `aria-describedby`).
   - Forms enforce top-aligned labels (`Field` / `Select`) and structured error descriptions.
7. **Zero-Pain-Point Form Ergonomics & Undo Affordance**:
   - Top-aligned static labels prevent vertical scan disorientation.
   - Forms maintain local drafts, validate before persistence, expose inline errors and preserve drafts after a failed save. Pending operations cannot be dismissed into a lost state.
   - Quick preset shortcuts (e.g. k6 RPS stress presets: Light, Standard, Heavy) eliminate parameter ambiguity.
8. **App Releases & Version Distribution**:
   - ReleasesModal links to published v1.7.1 portable-preview artifacts and v1.7.0 source-only history. A version number in source is not evidence of a historical binary release.
   - The portable ZIP contains the native executable, one BAT, license, local catalog and a hashed file manifest. Opening requires installed WebView2, but not Node/Cargo. Automation still requires verified local runtime packs.
   - No fabricated installer, file size, checksum or release date is displayed. Downloads occur only when a user follows a link; there is no startup release fetch.

## 14. Verification and evidence status

| Gate | Command | Current rule |
|---|---|---|
| TypeScript | npm ci --offline, lint, format, typecheck, test | Required and runnable locally |
| Packages/UI | build:packages, build:sidecar, build:desktop | Required before release |
| Smoke/docs | verify:sidecar, verify:k6:fixture, verify:docs, verify:authenticity | Component evidence only; verify:k6 is target-online and separately gated |
| Runtime distribution | verify:runtime-catalog, verify:runtime-manager, verify:offline-install, verify:release-manifest | Catalog completeness is component-verified; unresolved artifact metadata is Blocked/NeedsReview |
| Memory/process safety | verify:memory-bounds, IPC/IR/stress tests, Rust test/clippy | Streaming hashes plus bounded IPC, jobs, workers, processes, extraction, diagnostics, and cleanup are required |
| Rust source | cargo fmt --check | Must pass independently |
| Rust build/test | cargo clippy --offline, cargo test --offline | Required with the committed lockfile and cached crates |
| Tauri build | npm run native:build | Requires local Tauri CLI, WebView2, and verified packs |
| Physical Android | two authorized devices, target app, verified packs | Blocked until present |

Fixtures may exercise parsers, selectors, IPC, lease logic, and failure transitions. They cannot promote native or physical acceptance to Verified.

## 15. Traceability

| Requirement | Contract/ADR | Module | Test/evidence | Status |
|---|---|---|---|---|
| Offline Tauri launch | ADR-001, launcher contract | backend, Run-AutomatePlus.bat | preflight/launcher smoke | Implemented; runtime packs blocked |
| Real discovery and stable IDs | FR-14, ADR-003 | backend/src/adb.rs, contracts | ADB parser tests; device evidence | Implemented; physical evidence blocked |
| Farm strategies and leases | FR-15, ADR-004 | device-farm, runner core, Rust ports | scheduler/lease tests, real-device evidence | Rust Appium worker, serial-bound leases, ports, cancellation, and evidence implemented; native acceptance blocked by verified packs/device prerequisites |
| Primary/follower recording | FR-16 | recorder contracts, native dispatch | observation tests | Contract/component; runtime blocked |
| Runtime-context generation | FR-17 | frontend/packages/generators | no-fixed-port tests | Implemented |
| Runtime Manager | FR-12, runtime IPC 1.0 | runtime.rs, runtime_catalog.rs, RuntimeManagerContainer, launcher | component verifiers, responsive PNGs, offline/release gates | Implemented; verified artifact packs blocked |
| Native folder/archive picker | `native.dialog.pick`, IPC 1.0 | Rust `rfd` boundary, desktop bridge, Sidebar, Runtime Manager | contract tests and manual Windows picker evidence | Implemented in contract; native host evidence pending |
| Truthful UI | NFR-05/NFR-16 | DeviceFarmView, bridge/store | authenticity/build/viewport evidence | Implemented in shell |
| Persistence/evidence | FR-18 | Rust migration/persistence | SQLite gate | Source implemented; crate cache blocked |
| Bounded memory and EOF handling | NFR-12, ADR-005 | Rust preflight/runtime/farm/process/ADB; TS IPC/IR/recorder/k6; Node launcher scripts | 128 MiB low-heap hash probe, payload/backpressure/summary tests, Rust test/clippy | Implemented and component-verified; large real-pack soak remains release evidence |

## 16. Legacy boundary

The .NET/WinUI source and documents may be consulted for historical migration context, but no active command, launcher, package, or release acceptance depends on them. Reintroducing another native host requires an approved design change and fresh gates.
