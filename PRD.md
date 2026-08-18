# AutomatePlus Product Requirements Document

Version: 3.0.0
Status: Active Sprint 2 contract
Target: Windows 10/11 x64 desktop
Active host: Tauri 2 + Rust
Renderer and sidecar: React/TypeScript
Operating model: offline local control plane; explicit user-requested target E2E may access declared websites/APIs

## 1. Product definition

AutomatePlus is a local desktop workspace for recording, editing, generating, and executing Web, Android, and API automation. A user creates a project and session, records or composes a canonical Automation IR, selects a capability-supported framework/language, generates a complete project, validates it locally, and runs it with evidence.

The active runtime is a Tauri 2 executable. Rust owns native orchestration and local state. TypeScript owns IR, selectors, recorder adapters, and generators. The old .NET/WinUI implementation is legacy source only and is not a release dependency.

The product never invents devices, targets, metrics, artifacts, progress, or successful runs. Missing prerequisites are visible as empty or Blocked states.

## 2. Goals and non-goals

### Goals

- Provide one canonical, versioned SessionIR/ActionIR source of truth.
- Record Web and Android interactions with semantic locators and explicit fallbacks.
- Generate maintainable projects for supported framework/language capabilities.
- Replay Android flows on one or many real devices with leases, unique ports, cleanup, and evidence.
- Support primary/follower recording without duplicating canonical IR.
- Run the control plane fully offline with checksum-verified local runtime packs.
- Permit network traffic only for an explicit user-requested target E2E against the declared test websites/APIs; never use implicit cloud control, telemetry, or dependency downloads.
- Keep the UI responsive, keyboard accessible, and truthful at every missing-runtime state.

### Non-goals

- Cloud grid, hosted browser farm, telemetry, login, or implicit network call. Explicit target traffic is limited to the user-requested E2E action and is not a platform control-plane dependency.
- Replacing Playwright, Selenium, Appium, UiAutomator2, Espresso, Maestro, or k6.
- Calling functional/UI iteration rate API RPS.
- Broadcasting primary coordinates to follower devices.
- Claiming native or physical acceptance from browser screenshots or test doubles.

## 3. Users and core journeys

| User | Journey outcome |
|---|---|
| Low-code QA | Create local project, record/edit a flow, generate, run, and diagnose evidence |
| SDET | Export a clean capability-checked project with runtime context and validation |
| Android QA | Discover authorized devices, record primary/follower observations, replay with evidence |
| API tester | Compose local requests, assert responses, generate/run k6 when its pack is verified |

The browser migration shell supports project/session editing and browser-safe API fixtures. Android/native features are Blocked without the Tauri host and verified local prerequisites.

## 4. Capability matrix

The UI filters this matrix and disables unsupported combinations with a reason.

| Platform | Frameworks | Languages |
|---|---|---|
| Web | Playwright, Cypress, Puppeteer, Selenium, Robot Framework | TypeScript, JavaScript, Python, Java, Robot DSL where declared |
| Android | Appium + UiAutomator2, Espresso, Robolectric, Maestro | Java, Kotlin, TypeScript, JavaScript, YAML where declared |
| API | HTTP functional runners, k6 | TypeScript, JavaScript, Python, Java |

Each capability manifest declares action support, strategy support, parallel-session model, required runtime packs, physical-device requirement, and project prerequisites.

## 5. Functional requirements

### FR-01 — Project and session workspace

Create and reopen local projects and Web, Android, or API sessions without network access. In the native host, workspace paths are selected with the versioned `native.dialog.pick` Windows folder dialog; the parent-aware picker runs asynchronously, and cancelling preserves the previous value. Persist user-created metadata in the active local storage boundary and show readiness before recording or running. Browser migration mode may accept a manually entered path and show the native setup guide, but cannot provide native picker or filesystem evidence.

### FR-02 — Visual editor

Show a responsive explorer, recorder/editor, timeline, and code/configuration panel. Users can add, edit, delete, reorder, disable, parameterize, and assert actions. Every change updates IR, persistence, and generation state.

### FR-03 — Web recording

Use a real local headed browser/CDP boundary when the verified recorder is available. Capture navigation, click, fill, scroll, drag, keyboard, tabs, downloads, and explicit assertions. Debounce typing/scroll bursts and prioritize semantic locators before CSS/XPath or coordinates.

### FR-04 — Android discovery and recording

Use real adb devices -l output. Show stable local ID, current serial, model, manufacturer, API, resolution, density, orientation, transport, authorization, health, and last seen. Bind every operation to a leased serial. Primary recording captures the canonical action stream; followers contribute observations.

### FR-05 — API builder and functional runner

Support user-entered HTTP methods, URL, query, headers, body, secrets, assertions, extraction, and local response inspection. Execute only on explicit user action and report measured response data.

### FR-06 — Canonical IR

Validate and migrate versioned JSON IR at ingestion, editing, generation, and run boundaries. Keep farm metadata, device serial snapshots, ports, and observations outside ActionIR.

### FR-07 — Code generation

Generate a complete project per selected framework/language. Reject unsupported actions/capabilities. Escape values, preserve secret references, and never emit fake imports, TODO stubs, fixed serials, fixed device paths, or fixed Appium ports.

### FR-08 — Native execution

Rust launches only verified, allowlisted local executables with argument arrays. Stream logs/events, enforce timeouts, cancel, terminate owned process trees, release resources, hash artifacts, and normalize reports. A missing runtime is Blocked.

### FR-09 — Functional loops

Support bounded Web/API loops and native Android loops with explicit iteration count/delay. Report completed, passed, failed, cancelled, blocked, and skipped iterations. Never label UI throughput as RPS.

### FR-10 — API RPS

Generate and run local k6 only when the verified k6 pack exists. Use measured k6 output for rate, counts, errors, latency percentiles, thresholds, and verdicts. Do not synthesize metrics in the renderer.

### FR-11 — Evidence and reports

Persist raw logs, normalized reports, screenshots, traces, videos, and metrics locally. Link failures to step, device, serial snapshot, locator, error, artifact path, and SHA-256. Large evidence is files, not unbounded session JSON.

### FR-12 — Offline runtime manager

Provide a native `Runtime Manager` that lists the metadata-only catalog, scans the selected project root plus known local/bundled roots, imports a local ZIP through `native.dialog.pick`, verifies installed packs, runs allowlisted health commands, and opens the active root. Browser mode must not report an unevaluated catalog as zero installed packs; it shows `Unavailable` and the native setup guide. `Download missing` is available only after explicit user license acceptance, `allowOnlineDownload: true`, and `AUTOMATEPLUS_RUNTIME_DOWNLOAD=1`; there is no startup download, remote catalog fetch, hidden installer, telemetry, or cloud fallback. Reuse requires exact `id + version + architecture + source SHA-256 + license acceptance + health evidence`; a different SHA is `NeedsReview` and is never overwritten automatically. Pack metadata must include an official HTTPS source, pinned version, size, SHA-256, SPDX/license reference, archive format, executable allowlist, and health command before it can be downloaded.

### FR-13 — Security

Use secret references and redaction. Validate canonical workspace paths, restrict IPC methods, bind Appium to loopback, allow only configured executables, reject shell command strings, and clean up process trees on cancellation.

### FR-14 — Device registry and groups

Persist real device profiles and user-created groups in the native SQLite boundary. Stable device IDs are separate from serial snapshots. Snapshot a selected group before a run and report ineligible devices explicitly.

### FR-15 — Multi-device replay

Support:

- single: preserve one-device compatibility;
- all-devices: every selected device executes iterationsPerDevice;
- split-iterations: one global totalIterations queue is claimed exactly once.

Bound workers with maxParallelDevices. Acquire one lease per worker, allocate unique Appium/system/MJPEG/ChromeDriver ports, run real Appium/UiAutomator2 steps when all packs and target prerequisites are verified, persist evidence, and release resources in every terminal path.

### FR-16 — Primary/follower recording

Use RecordingPlan with one primary and zero or more followers. Followers resolve semantic locators independently and produce MATCHED, FALLBACK_USED, SEMANTIC_SELECTOR_MISSING, DEVICE_VARIANT_MISMATCH, NEEDS_REVIEW, BLOCKED, or FAILED observations. A mismatch cannot become success coverage.

### FR-17 — Generated runtime context

Inject one leased DeviceRunContext per worker:

    AUTOMATEPLUS_APPIUM_URL
    AUTOMATEPLUS_DEVICE_UDID
    AUTOMATEPLUS_SYSTEM_PORT
    AUTOMATEPLUS_MJPEG_SERVER_PORT
    AUTOMATEPLUS_CHROMEDRIVER_PORT

Missing required context is an explicit error/Blocked state.

### FR-18 — Aggregate status

Use passed, failed, blocked, cancelled, and completion complete/partial. Passed requires every planned operation to pass. Failed records execution failure. Blocked means no iteration could start because prerequisites were unavailable. Cancelled records user cancellation and cleanup evidence.

## 6. Non-functional requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR-01 | Windows x64, Tauri WebView2, offline launch | launcher/preflight smoke |
| NFR-02 | No implicit network/download | network-blocked and source audit |
| NFR-03 | Rust/renderer/sidecar boundary remains explicit | dependency and architecture review |
| NFR-04 | Generated projects are formatted, linted, compiled/typechecked, and smoke-tested | generator gates |
| NFR-05 | No fake data, fake pass, silent fallback, or placeholder production implementation | authenticity scan and negative tests |
| NFR-06 | Cancellation and cleanup are deterministic | process/device/port tests |
| NFR-07 | Secrets never appear in plaintext evidence | redaction tests |
| NFR-08 | SQLite schema is versioned and migratable | migration tests |
| NFR-09 | UI works at 390, 600, 768, 840, 1024, 1280, and 1440 px | viewport/accessibility audit |
| NFR-10 | Farm evidence is isolated and hashed | artifact tests |
| NFR-11 | Device lease and port allocation are serial-safe and bounded | concurrency tests |

## 7. Native lifecycle

    discover
      -> snapshot group
      -> acquire device lease
      -> preflight device/runtime/target
      -> allocate loopback ports
      -> create isolated Appium session
      -> run iterations
      -> persist evidence
      -> cleanup processes/session
      -> release ports and lease

The default policy is continue-other-devices. fail-fast prevents new work but waits for active worker cleanup. Stale leases are recovered at native startup.

## 8. UI requirements

The farm workspace contains discovery/refresh, group management, primary/follower selection, replay mode and iteration controls, per-device status/progress, artifacts/error details, cancellation, and cleanup state. Only the active device can use a full mirror. Other devices use status/thumbnail evidence only when real runtime data exists.

Use semantic heading/list/grid/dialog/progress/status roles, focus-visible states, keyboard navigation, Narrator labels, high-contrast-friendly colors, reduced motion, minimum 48×48 targets, and bounded/virtualized long logs. Disabled controls explain exactly which prerequisite is missing.

## 9. One-click distribution

Run-AutomatePlus.bat at the repository root delegates to scripts/Run-AutomatePlus.bat. It:

1. sets the workspace and local working directory;
2. starts an existing `AutomatePlus.exe` when present;
3. otherwise starts the bundled `AutomatePlusBootstrap.exe` so the user can open Runtime Manager and provision packs;
4. otherwise reports a setup blocker with exit code 2. An explicit `--build-dev` may run the local offline build preflight; it never silently changes acceptance mode;
5. starts the browser-safe migration shell only when the user passes `--browser`, keeping Android/device capabilities Blocked and never fabricating evidence.

Exit code 2 is a truthful Blocked prerequisite result for missing native prerequisites. Native preflight blockers are printed before the launcher exits. No network fallback is allowed.

## 10. BMAD and traceability

Rex reviews requirements, Aria reviews contracts/persistence/IPC, Mason implements disjoint modules, Quinn verifies tests and runtime evidence, and Luna audits security, accessibility, clean code, and no-fake policy. The implementation record is:

    requirement -> ADR/interface -> module -> test -> evidence -> status

| Requirement | Interface/ADR | Module | Evidence | Status |
|---|---|---|---|---|
| Native offline launch | ADR-001, launcher contract | src-tauri, Run-AutomatePlus.bat | preflight and launcher smoke | Implemented; blocked by local packs/CLI |
| Real device registry | FR-04/14, DeviceProfile | Rust adb/persistence, UI bridge | parser tests and ADB output | Implemented; physical acceptance blocked |
| Multi-device replay | FR-15, FarmRunSpec/leases | contracts, runner core, Rust host | scheduler/lease tests | Contract/component; Appium execution blocked |
| Primary/follower recording | FR-16, RecordingPlan/Observation | recorder contracts and native dispatch | observation tests | Contract/component; runtime blocked |
| Runtime-context generation | FR-07/17, capability manifest | generators | no-fixed-port/context tests | Implemented |
| Runtime Manager and explicit offline distribution | FR-12, runtime IPC 1.0, catalog contract | Rust runtime manager, SQLite migration, Runtime Manager UI, launcher | runtime-manager/catalog/offline verifiers; release manifest gate | Implemented; artifact/Cargo prerequisites blocked |
| Native workspace/runtime picker | `native.dialog.pick`, IPC 1.0 | Async Rust `rfd`, desktop bridge, Sidebar, Runtime Manager | picker component contract and native Windows manual evidence | Async source implemented; native evidence pending |
| Responsive truthful UI | NFR-05/09 | React farm workspace | build/authenticity/viewport evidence | Implemented in shell |

## 11. Acceptance boundary

TypeScript component gates can be Verified when their commands pass. Native Tauri acceptance requires the offline Cargo cache, Tauri CLI, WebView2, verified runtime packs, and published build. Android farm acceptance additionally requires two authorized physical devices, a real package/activity, Appium/UiAutomator2/scrcpy health, unique replay evidence, cancellation/disconnect cleanup, primary/follower observations, and generated-project compile/lint/smoke/replay evidence.

Until those prerequisites are present, the product status is Blocked for native/physical acceptance, never Ready or simulated pass.
