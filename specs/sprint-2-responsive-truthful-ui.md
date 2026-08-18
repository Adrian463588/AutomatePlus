# Sprint 2: Responsive, Truthful UI/UX, and PRD Alignment

## Objective

Deliver the approved Sprint 2 slice across the React renderer and the Tauri/Rust production host while preserving the architecture and acceptance boundaries in `PRD.md`, `AGENTS.md`, and `DESIGN.md`.

The application must start from truthful empty state, use only user-provided targets and persisted user-created sessions, fail closed when a runtime/device/capability is unavailable, and remain usable at the agreed desktop, tablet, and mobile viewport sizes.

## Scope

- React migration shell: responsive layout, truthful state, API request/assertion state, capability-driven options, accessibility, feedback, and cancellation.
- TypeScript generators/runners: reject incomplete or fabricated fallback output; preserve explicit locator metadata; propagate k6 `maxVUs`.
- Tauri/Rust host: expose native readiness, device, recorder, process, and run command state without claiming native runtime acceptance while the required SDK/packs are unavailable.
- Tests, specification traceability, responsive evidence, README preview, and audit evidence.

Out of scope: copying reference-project code/assets, adding runtime binaries, downloading dependencies during tests, inventing an Android package/site/API target, or changing normative requirements without an accompanying PRD/DESIGN decision.

## Invariants

1. `AutomationSession` and `ActionIR` remain the canonical source of truth.
2. UI code depends on application contracts, not Playwright, ADB, Appium, k6, or generated-framework APIs.
3. Missing target, runtime, device, prerequisite, or unsupported action is `Blocked`, never a simulated pass.
4. Test doubles are confined to test fixtures and are not runtime acceptance evidence.
5. Secrets are never seeded, rendered as plaintext, or committed.
6. Native acceptance remains blocked until the Tauri/Cargo offline cache, WebView2, and verified runtime packs are available.

## Given/When/Then acceptance scenarios

### A. Truthful startup and persistence

- Given a fresh migration-shell profile, when the app starts, then no project, session, target URL, package, email, secret, assertion, or generated code is seeded.
- Given a user creates a project and session with valid user input, when the app is reopened, then the persisted record is restored without changing user-supplied values.
- Given an empty workspace, when no session exists, then the UI presents an actionable setup state and every run/record/generate control is disabled with a visible reason.

### B. Capability and runtime truthfulness

- Given a framework/language pair absent from the capability manifest, when it is selected or generated, then the operation is rejected with `CapabilityError` and no fabricated output is shown.
- Given an Android session without a selected device or package, when recording or running is requested, then the operation is `Blocked` before any device action.
- Given a missing/unverified runtime pack, when native execution is requested, then the state is `Blocked` and no fake pass/metrics are emitted.

### C. API builder correctness

- Given any required HTTP method, when the user edits and sends a request, then the request state, response status, error styling, assertions, and extraction variables are persisted in the session IR.
- Given a non-2xx response or transport error, when the response is rendered, then it is visibly an error/blocked state and cannot be presented with success styling.

### D. Responsive and accessible interaction

- Given viewports `1440x900`, `1280x800`, `1024x768`, `768x1024`, or `390x844`, when the primary workspace is rendered, then no required control is clipped, overlapped, or unreachable; panels reflow or collapse with keyboard-accessible controls.
- Given any modal, when it opens, then it has dialog semantics, focus moves into it, Escape closes it, focus returns to the trigger, and reduced-motion users receive equivalent state feedback without decorative motion.
- Given any action button, when it is invoked, then it has an observable pending, success, error, blocked, or cancelled outcome with an accessible live status.

### E. Generator and stress correctness

- Given an Android action without a real app package, locator, or supported action mapping, when generation runs, then it raises `CapabilityError` rather than emitting default package names, center taps, unconditional assertions, or comment fallbacks.
- Given a stress configuration with `maxVUs`, when the run starts, then the exact value reaches the k6 runner and the normalized report records it.

### F. Tauri contract binding

- Given the Tauri renderer, when it renders, then navigation, platform/framework selection, session state, runtime readiness, recorder commands, and run state come from application contracts rather than literal sample sessions/timeline/code.
- Given unavailable native prerequisites, when the shell is inspected, then it clearly reports `Blocked` and does not claim runtime readiness.

## Verification evidence

Required automated gates:

```text
npm ci --offline
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build:packages
npm run build:sidecar
npm run build:desktop
npm run verify:docs
npm run verify:sidecar
npm run verify:k6
cargo fmt --manifest-path backend/Cargo.toml -- --check
cargo clippy --manifest-path backend/Cargo.toml --offline -- -D warnings
cargo test --manifest-path backend/Cargo.toml --offline
```

Also required: focused tests for startup/persistence, capability rejection, Android preflight, API status/assertions, maxVUs, and modal/button accessibility; responsive screenshots at all five viewports; ADB discovery and lock/preflight evidence using only a real user-selected package; and a production authenticity/security scan.

## Iteration and stop conditions

- Maximum build-review iterations: 2.
- Do not claim full acceptance if an applicable gate is blocked by missing external tooling, device target, or runtime pack; report that evidence as `Blocked`.
- Do not perform destructive filesystem or Git operations. Push to `main` is authorized only after the final allowlist, tests, secret scan, and remote-SHA checks pass.
- The final report must separate `Accepted`, `Blocked`, and `Open Risks` with commands and evidence.
