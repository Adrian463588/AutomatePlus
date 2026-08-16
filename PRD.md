# AutomatePlus Product Requirements Document

**Document version:** 2.0.0  
**Status:** Proposed product specification; implementation acceptance is not implied  
**Target:** Windows 10/11 x64 desktop  
**Primary shell:** WinUI 3 + .NET 8  
**Automation core:** TypeScript sidecar over versioned local IPC  
**Operating model:** Offline-first; no cloud dependency

## 1. Product definition

AutomatePlus is a Windows desktop GUI for low-code, record-and-generate test automation. A user records or composes a test flow once, edits the resulting visual timeline, selects a valid framework/language target, generates a runnable project, validates it locally, and executes it with evidence.

The canonical flow is:

```text
Record or compose
        ↓
Automation IR
        ↓
Edit, assert, parameterize
        ↓
Select valid framework/language
        ↓
Generate project
        ↓
Format → lint → compile/typecheck → smoke validate
        ↓
Run and inspect offline evidence
```

AutomatePlus focuses on Web, Android, and API testing. It does not replace the underlying automation frameworks; it orchestrates their local runtimes and produces framework-native projects.

## 2. Problem and product vision

### 2.1 Problem

Testers must repeatedly translate the same user journey into incompatible frameworks, languages, selectors, runners, reports, and local toolchains. Existing recorders commonly produce brittle selectors, code fragments instead of runnable projects, or cloud-dependent execution.

### 2.2 Vision

Provide a trustworthy visual workspace where one recorded intent can be edited, validated, exported, and executed across multiple local automation technologies without vendor lock-in.

### 2.3 Product goals

- Make common Web, Android, and API test flows recordable without writing code first.
- Preserve one platform-neutral, versioned Automation IR as the source of truth.
- Generate idiomatic, maintainable, runnable projects for every supported capability pair.
- Make unsupported combinations visible and unselectable rather than generating misleading code.
- Run functional, UI-soak, and API-load modes with different semantics and honest metrics.
- Keep project data, source, secrets, logs, reports, and runtime metadata on the Windows machine.
- Provide evidence-based quality gates for both AutomatePlus source and generated code.

### 2.4 Non-goals for this product

- A cloud test grid, hosted browser farm, telemetry platform, or SaaS account system.
- A replacement for Playwright, Cypress, Puppeteer, Selenium, Robot Framework, Appium, Espresso, Robolectric, Maestro, or k6.
- Claiming browser or Android UI iteration rate as HTTP Requests Per Second.
- Recording arbitrary physical screen touch input that the OS or device cannot expose semantically.
- Generating fake language bindings for frameworks that do not support them.

## 3. Target users and journeys

| Persona | Main job | Required outcome |
|---|---|---|
| Manual QA / low-code tester | Capture a repeatable flow visually | Record, edit, assert, run, and understand failures without authoring a test framework manually |
| SDET / automation engineer | Produce maintainable source for a repository | Export a clean project with stable locators, fixtures, configuration, and validation evidence |
| Android QA specialist | Exercise native or hybrid apps | Select a device, mirror it, record gestures, inspect the hierarchy, and replay the flow |
| API / performance tester | Compose requests and validate behavior under load | Chain requests, extract variables, assert responses, generate k6, and inspect metrics |

### 3.1 Primary Web journey

1. Create or open a local project.
2. Select Web and enter a target URL.
3. Start a headed, isolated Chromium recorder.
4. Click, fill, scroll, drag, navigate, and manually add assertions.
5. Review and reorder actions in the timeline.
6. Choose a supported framework/language pair.
7. Generate, validate, edit, and run the project.
8. Inspect step results, screenshots, logs, traces, and normalized reports.

### 3.2 Primary Android journey

1. Discover an authorized emulator or physical device through ADB.
2. Acquire the device lock and show device health.
3. Start the integrated mirror and select an APK/package or existing Appium target.
4. Tap, long-press, swipe, drag, input text, use Back/Home, and add assertions.
5. Resolve semantic locators from the UI hierarchy; retain bounds as a fallback.
6. Generate a valid Appium, Espresso, Robolectric, or Maestro project.
7. Run only when the selected framework's project/runtime prerequisites are ready.

### 3.3 Primary API journey

1. Create an API session in the request builder.
2. Configure method, URL, query, headers, body, and secret references.
3. Inspect a local request response or import an approved request/HAR.
4. Add status, header, JSONPath, schema, and duration assertions.
5. Extract values into scoped variables for later requests.
6. Run functional requests or generate a k6 API load test.

## 4. Capability matrix

The UI must filter the language selector from this matrix. A disabled combination must explain the reason and cannot reach generation.

### 4.1 Web automation

| Framework | TypeScript | JavaScript | Python | Java | Output |
|---|---:|---:|---:|---:|---|
| Playwright | Yes | Yes | Yes | Yes | Native framework test/project |
| Cypress | Yes | Yes | No | No | Cypress spec/project |
| Puppeteer | Yes | Yes | No | No | Node script/test project |
| Selenium WebDriver | Yes* | Yes | Yes | Yes | Selenium binding project |
| Robot Framework | No | No | No** | No | `.robot` keyword suite |

`*` TypeScript uses the JavaScript Selenium binding and TypeScript types.  
`**` Python may be used for a custom Robot library, but the generated test artifact remains Robot syntax.

### 4.2 Android automation

| Framework | Kotlin | Java | TypeScript | JavaScript | Output / execution layer |
|---|---:|---:|---:|---:|---|
| Appium + UiAutomator2 | Yes* | Yes | Yes** | Yes** | Device/emulator E2E |
| Espresso | Yes | Yes | No | No | Android instrumented test |
| Robolectric | Yes | Yes | No | No | Local JVM test |
| Maestro | No | No | No | No | YAML Flow |

`*` Kotlin uses the Java client and JVM interoperability.  
`**` TypeScript/JavaScript uses the WebdriverIO/Appium adapter.

### 4.3 API automation

| Target | TypeScript | JavaScript | Python | Java | Output |
|---|---:|---:|---:|---:|---|
| k6 load/RPS | No | Yes | No | No | JavaScript k6 script |
| HTTP functional | Yes | Yes | Yes | Yes | Fetch/Axios, Requests, or RestAssured project |

## 5. Functional requirements

### FR-01 — Desktop project workspace

- Create, open, rename, clone, archive, and delete a local project through explicit user actions.
- Store project metadata in SQLite and generated source/artifacts in a user-selected workspace.
- Manage sessions for Web, Android, and API with independent target configuration.
- Show current runtime/device readiness before recording or running.

**Acceptance:** A project can be created and reopened without network access; sessions and run history remain available after restart.

### FR-02 — GUI low-code editor

- Provide a three-region workspace: explorer, visual recorder/editor, and code/configuration panel.
- Show a draggable timeline containing ordered actions and assertions.
- Allow add, edit, duplicate, delete, reorder, disable, parameterize, and rename operations.
- Keep the selected framework/language capability-aware.
- Show an explicit unsupported-action warning before generation.

**Acceptance:** Editing a step updates the IR, generated preview, validation state, and persisted session consistently.

### FR-03 — Web recorder

- Launch an isolated headed Chromium instance controlled by Playwright/CDP.
- Record navigation, click, double-click, right-click, hover, fill, clear, key press, select, check/uncheck, scroll, drag/drop, popup/tab, download/file chooser, and user-requested assertions.
- Debounce keystrokes into one fill action and scroll bursts into one normalized action.
- Capture frame/page context, target metadata, locator candidates, timing, and optional step screenshot.
- Prioritize `data-testid`, role/name, label, stable ID/name, semantic text, CSS, and XPath in that order.
- Keep coordinate fallback only when semantic locators are unavailable.

**Acceptance:** A local fixture can be recorded, edited, regenerated, and replayed with no duplicate typing or scroll noise.

### FR-04 — Android device and recorder

- Discover devices with `adb devices -l` and expose serial, model, Android version, resolution, orientation, and authorization state.
- Enforce one active interaction/run lock per serial.
- Provide an integrated mirror/control surface using scrcpy-compatible video/control and ADB/Appium actions.
- Record tap, double-tap, long-press, swipe, scroll, drag, input text, clear text, Back, Home, Enter, launch, close, wait, and assertions.
- Inspect UiAutomator/Appium hierarchy and rank `resource-id`, accessibility ID, text, class, and bounds.
- Recalculate coordinates for resize, letterboxing, density, rotation, and orientation changes.

**Acceptance:** A connected test device can record tap/swipe/drag through the AutomatePlus viewer, persist semantic IR, and release its lock on stop/cancel.

### FR-05 — API request builder

- Support GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS.
- Edit query parameters, headers, JSON, form-data, URL-encoded, and raw bodies.
- Inspect status, headers, payload, response time, and local request logs.
- Add status, header, JSONPath, schema, and response-time assertions.
- Extract response values into scoped variables and reference them in later steps.
- Support offline import of approved HAR/request definitions without making a cloud call.

**Acceptance:** A local HTTP fixture can execute a chained session and report each assertion independently.

### FR-06 — Automation IR

- Use versioned, strongly typed JSON as the source of truth for every platform.
- Store ordered steps, action payload, target metadata, locator candidates, assertions, variable references, secret references, timing, and artifact references.
- Validate at ingestion and before generation.
- Provide migrations for supported schema versions.
- Reject malformed or cross-platform-invalid actions with structured errors.

**Acceptance:** A session can be saved, reopened, edited, migrated, validated, and exported without losing step order or target metadata.

### FR-07 — Polyglot code generation

- Register adapters by framework, language, platform, action capabilities, required runtimes, and output format.
- Generate runnable project files, not only a code fragment.
- Support flat scenario output and optional POM/page-object or screen-object output where the target framework supports it.
- Escape values safely and replace secrets with runtime references.
- Return `CapabilityError` for unsupported actions; never emit fake imports or TODO stubs.

**Acceptance:** Every matrix entry has a generator descriptor, golden fixture, formatter/lint gate, compile/typecheck gate, and local smoke fixture before release acceptance.

### FR-08 — Validation and native runner

- Run the pipeline `generate → format → lint → compile/typecheck → smoke validate → execute`.
- Launch the native selected framework through an allowlisted local executable and argument array.
- Stream stdout/stderr, step events, metrics, and structured failures to the GUI.
- Support pause where the target runner permits it, cancellation, timeout, process-tree termination, and artifact collection.
- Normalize framework reports into Run/Suite/Test/Step/Metric records.

**Acceptance:** A run is `Ready` only after all applicable gates pass; cancellation leaves no owned browser, Appium, Java, Node, k6, or ADB process behind.

### FR-09 — Functional loop and UI soak

- Repeat a Web or Android functional session sequentially or with bounded workers.
- Allow iteration count, delay, dataset row, ramp-up, retry policy, resource limit, and stop policy.
- Prevent concurrent use of the same Android serial.
- Report iteration success, duration, failure reason, and artifacts.
- Label UI throughput as functional loop or soak, never as HTTP RPS.

**Acceptance:** Loop results distinguish completed, passed, failed, cancelled, and skipped iterations and preserve per-iteration evidence.

### FR-10 — API RPS/load testing

- Generate and run local k6 JavaScript from API request/session definitions.
- Support constant-arrival-rate, duration, target rate, VU limits, thresholds, headers, cookies, and variable extraction where applicable.
- Show achieved rate, request count, error rate, p50/p90/p95/p99 latency, and threshold verdict.
- Separate API load configuration from browser and Android UI replay.

**Acceptance:** A local HTTP fixture receives the configured k6 load, and the report uses measured k6 output rather than generated or random metrics.

### FR-11 — Reports and artifacts

- Save raw logs, normalized JSON, JUnit XML where available, HTML summary, screenshots, traces, videos, and k6 metrics locally.
- Link each step failure to its error, locator, screenshot, and relevant process output.
- Support export to a user-selected folder without uploading data.

**Acceptance:** A failed step can be diagnosed from the offline report without reproducing the run immediately.

### FR-12 — Offline runtime manager

- Detect or import Node, Python, JDK, Chromium, ADB, scrcpy, Appium/UiAutomator2, Maestro, k6, and framework dependencies from local packs.
- Verify version, path, SHA-256, architecture, license metadata, and health-check output.
- Disable only the affected capability when a runtime is unavailable.
- Never run package installation, telemetry, auto-update, login, or cloud synchronization implicitly.

**Acceptance:** Startup, project editing, generation, and local execution complete without internet when all selected packs are installed.

### FR-13 — Security and secrets

- Store passwords, tokens, OTPs, and secret fields as references backed by DPAPI or Windows Credential Manager.
- Redact secrets from logs, generated previews, reports, and error messages.
- Restrict IPC methods, target paths, executable paths, ADB commands, and local Appium binding.
- Keep the target Web page in a separate automation browser without privileged WinUI/.NET filesystem access.

**Acceptance:** Secret scans find no plaintext secret in persisted IR, generated source, logs, or artifacts; rejected commands do not execute.

## 6. Non-functional requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR-01 | Windows 10/11 x64 support with documented minimum build | Installer and smoke test on supported Windows images |
| NFR-02 | Offline-first behavior and no implicit cloud call | Network-blocked startup/generation/run test |
| NFR-03 | Strict separation of UI, domain, sidecar, adapters, and runner | Architecture review and dependency checks |
| NFR-04 | Generated source is formatted, linted, typed/compiled, and runnable | Per-adapter contract tests |
| NFR-05 | No fake imports, unsupported fallbacks, or silent failures | Negative capability tests and source scan |
| NFR-06 | Cancellation and cleanup are deterministic | Process-tree and device-lock integration tests |
| NFR-07 | Secrets are never persisted in plaintext | Secret redaction and storage inspection |
| NFR-08 | All local data uses explicit workspace paths | Path validation tests |
| NFR-09 | Schema changes are versioned and migratable | Fixture migration tests |
| NFR-10 | UI remains usable with long logs and large sessions | 500-step timeline and streamed-log test |
| NFR-11 | Reports remain diagnosable offline | Artifact-link and report parser tests |
| NFR-12 | Runtime packs are checksum and license auditable | Manifest verification tests |
| NFR-13 | Generated and host implementation respects SOLID/DRY | Architecture review and duplicate-logic scan |

## 7. Operational semantics

### 7.1 Offline boundary

AutomatePlus itself does not need cloud services, login, telemetry, remote databases, hosted runners, or auto-update. A user may intentionally test a remote Web/API target, but that target's network requirement is outside the desktop application's offline guarantee.

### 7.2 Run modes

| Mode | Target | Meaning | Metric language |
|---|---|---|---|
| Functional | Web/Android/API | One session executed once or N times | pass rate, duration, step status |
| UI soak | Web/Android | Bounded repeated UI execution | iterations, worker count, duration, resource usage |
| API RPS | API/HTTP | k6 protocol-level arrival rate | requests/sec, latency percentiles, errors |

### 7.3 Readiness states

```text
Missing → Detected → Verified → Ready
                         ↓
                       Blocked
```

`Blocked` must state the missing runtime, device, project prerequisite, or unsupported action. It must not silently downgrade to a different framework.

## 8. Quality and acceptance gates

The product is accepted only when all applicable criteria have fresh evidence:

- A Web recording generates and runs at least one valid project for every declared Web adapter pair.
- An Android recording generates and runs valid Appium coverage and validates prerequisites for Espresso, Robolectric, and Maestro.
- API functional and k6 tests run against a local fixture with measured metrics.
- Click, fill, scroll, tap, swipe, drag, assertions, and request chaining survive round-trip IR persistence.
- Invalid framework/language/action combinations are disabled or rejected before execution.
- Generated code passes formatter, lint, typecheck/compile, and smoke validation.
- Recorder-to-generator-to-run flow is implemented without duplicated business logic across recorder, selector, generator, and runner layers (SOLID + DRY).
- Passwords/tokens are secret references, not plaintext values.
- Cancellation removes owned processes and releases Android device locks.
- Functional loop and API RPS are visibly separate modes.
- All runtime packs are locally verified, license-recorded, and usable without network access.

Current repository evidence is a baseline, not product acceptance: `npm test` currently reports 23 passing tests, package and Vite builds succeed, while the root typecheck includes reference sources and fails; the existing native and k6 runners still simulate execution.

## 9. Delivery roadmap

All valid adapters in Section 4 remain the release target. The sequence below reduces integration risk but does not redefine the supported product scope.

1. **Contracts and host:** WinUI/.NET solution, MVVM shell, sidecar protocol, schema versioning, SQLite migrations, logging, and runtime manifest.
2. **IR and workspace:** project/session CRUD, timeline editing, capability filtering, secrets, reports, and offline health states.
3. **Web vertical slice:** Playwright/CDP recorder, selector engine, generator/runner contract, local Web fixture, and report pipeline.
4. **All Web adapters:** Playwright, Cypress, Puppeteer, Selenium, and Robot Framework across the valid matrix with golden and smoke tests.
5. **Android vertical slice:** ADB discovery, device lock, scrcpy-compatible mirror/control, hierarchy parser, Appium generation and run.
6. **All Android adapters:** Appium, Espresso, Robolectric, and Maestro with project prerequisite checks.
7. **API and performance:** request builder, chaining, functional adapters, k6 generator/runner, thresholds, and metrics.
8. **Hardening and packaging:** offline packs, checksum/license audit, process cleanup, installer, accessibility, security review, and full acceptance matrix.

## 10. Risks and constraints

- WinUI/.NET integration is a migration from the current TypeScript/Vite prototype.
- The TypeScript sidecar must keep a stable protocol while the .NET host becomes authoritative for orchestration and persistence.
- Espresso and Robolectric require a valid Android Gradle project; no device run is promised for those modes without one.
- Maestro's primary artifact is YAML Flow.
- Runtime redistribution and licenses must be verified before packaging.
- Browser and Android recording fidelity depends on target accessibility/DOM metadata; coordinate fallback must remain explicit.

## 11. Reference provenance

The local guidance in `docs/Reference1.md` through `docs/Reference4.md` informed the layered architecture, IR, recorder, offline, RPS, and quality-gate requirements. The read-only projects under `reference/` were used for patterns only:

- Playwright: recorder, resilient locators, auto-wait, and trace-oriented Web execution.
- WebdriverIO: Node-based browser/Appium integration for JavaScript/TypeScript.
- Boyka Framework: modular cross-platform action and interface separation.
- Carina and SHAFT: unified Web/Mobile/API orchestration, configuration, and evidence patterns.

No reference project is a runtime dependency or source of copied implementation.
