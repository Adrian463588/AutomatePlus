# OpenSpec Specification: Release v1.1.0 Accessibility, Action Toggling & Download Distribution

## Target
AutomatePlus Desktop (Tauri 2 + Rust / React TypeScript) Windows x64.

## Primary Directive
Ensure all PRD requirements for visual action editing (disable/enable, parameterization), form accessibility, release version synchronization, historical version records, and direct download links are verified and operational without regressions or fake passes.

## Invariants
1. Single source of truth: `package.json`, `frontend/package.json`, `backend/tauri.conf.json`, and `backend/Cargo.toml` must have synchronized semantic versioning.
2. No fabricated test passes, fake devices, or simulated native runtimes.
3. Minimal diffs: modify only necessary files without redundant rewrites.
4. Clean DevSecOps boundary: reference documents and credentials remain protected.

## BDD Acceptance Scenarios

### Scenario 1: Action Sequence Disabling and Parameterization (FR-02)
- **Given** an active session with recorded or user-added actions in the Action Timeline,
- **When** the user clicks the step optional toggle button,
- **Then** the step `optional` field toggles between `true` and `false`, the UI displays an `Optional` badge, and the updated session IR is persisted.

### Scenario 2: Generator Selector Accessibility & Feedback
- **Given** the visual editor and code generation panel in MonacoView,
- **When** an accessibility inspection or screen reader scans the framework and language dropdowns,
- **Then** both dropdowns expose explicit `aria-label` attributes (`Framework` and `Language`) and valid option values.

### Scenario 3: Release Versioning & Download History
- **Given** the user reviewing the repository `README.md` or download page,
- **When** the user inspects the Download & Release History section,
- **Then** both `v1.1.0 (Latest)` and historical `v1.0.0` releases are clearly listed with direct download links, release dates, architecture targets, and changelogs.

### Scenario 4: Browser Shell Migration Contract
- **Given** the application running in browser migration mode,
- **When** navigating through Recorder, Runtime Manager, Device Farm, and API Builder,
- **Then** all views render truthfully with 0 uncaught application console errors, interactive controls retain minimum 48px targets, and missing native runtimes remain truthfully `Blocked`.

## Verification Gates
1. TypeScript Lint: `npm run lint` -> 0 errors.
2. Code Formatting: `npm run format:check` -> passed.
3. Typecheck: `npm run typecheck` -> passed.
4. Unit and Component Tests: `npm test` -> 100% passing tests.
5. Playwright MCP UI Audit: all tabs, dropdowns, run triggers, and modals verified with 0 browser errors.
6. Native Rust Quality: `cargo fmt`, `cargo clippy -D warnings`, `cargo test` -> all pass offline.
