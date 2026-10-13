# Workbench usability and Windows release 1.7.1

Status: UI/component and native-shell smoke Verified; production-runtime acceptance remains independent.
Scope: presentation, real UI handlers, browser regression, versioned Windows distribution.

## Plan and design decisions

1. Audit the five workspace views and project/session dialogs in a real browser.
2. Reuse existing CSS tokens and UI primitives; normalize body 14px, labels 13px,
   metadata/code 12px, spacing 4/8/12/16/24px, controls at least 48px.
3. Keep Recorder/API generated code alongside editing; full-width Runtime/Farm/MCP.
4. Use the native bridge for Windows folder selection. Browser mode accepts a
   user-entered path and explains its filesystem limitation. Never derive an
   absolute path from a browser directory handle or hardcoded machine preset.
5. Replace invented release assets with the actual repository, versioned portable
   ZIP, checksums, and historical source release. No release fetch at startup.
6. Verify BDD scenarios, component gates, generator matrix, native build and BAT;
   capture actual PNGs; publish reviewed source and hashed release artifacts.
7. Native smoke discovered CSP blocking Tauri's local raw IPC transport. Permit
   only `ipc:` and `http://ipc.localhost` in connect-src; retain the 8 MiB raw Rust
   decoding guard. JSON postMessage is not a substitute or bypass.
8. Parameterless native calls still carry `payload: {}` in the IPC envelope.
   Runtime panel mount guards reset during React StrictMode effect setup; cleanup
   must not permanently suppress real job results after an effect replay.
9. Native Downloads links use `native.release.open`: `{ url: string }` →
   `{ opened: true }` within the existing IPC 1.0 response. Rust permits only
   current ZIP/checksum and declared source/history URLs; ShellExecuteW opens the
   default browser on explicit click. This is not an install/download receipt.

The supplied design guides are research references. Their smaller button examples,
arbitrary decorative effects and replacement master contract are not adopted.
The active Rust/Tauri architecture and existing 48px accessibility contract apply.

## BDD acceptance scenarios

### Readable, reachable workspace

- GIVEN any workspace view at 390, 600, 768, 840, 1024, 1280 or 1440px width
- WHEN the user navigates between Recorder, Runtime, Device Farm, API and MCP
- THEN the selected view is visible, controls have accessible names and adequate
  hit areas, text is readable, and the page has no horizontal overflow.
- AND Runtime/Farm/MCP do not reserve an empty generated-code column.

### Project creation and folder selection

- GIVEN Create Project is open
- WHEN the user clicks Browse in the native host
- THEN the bridge opens the native folder dialog and restores focus after closing.
- WHEN the picker is cancelled
- THEN the previous workspace value is preserved.
- GIVEN browser migration mode
- THEN the native Browse control is disabled with an explanation and manual path
  entry remains available; no synthetic path or nested folder dialog is offered.

### Keyboard-safe dialogs and real controls

- GIVEN a dialog is open
- WHEN Tab, Shift+Tab or Escape is pressed
- THEN focus stays inside the topmost dialog, Escape closes it, and focus returns
  to its trigger. Rerendering a field does not move focus to another control.
- GIVEN an unavailable operation
- THEN its button is disabled with a reason or opens a useful setup explanation.
- GIVEN a user-created session with explicit actions
- WHEN framework/language/file selections or copy/export actions are used
- THEN the displayed code and downloaded file reflect the real generated project.

### Motion and diagnostics

- GIVEN reduced motion or forced colors is enabled
- THEN controls and dialogs remain usable; reduced motion disables transforms.
- GIVEN an idle local shell
- THEN console errors and implicit external requests are absent.

### Downloadable versions

- GIVEN the user opens Downloads
- THEN links point to Adrian463588/AutomatePlus and published versioned artifacts.
- AND checksums come from the generated SHA256SUMS file, with no invented size/hash.
- WHEN the portable ZIP is extracted and its BAT is opened
- THEN the bundled native app starts without Node, Cargo, network installation,
  or an automatic browser fallback.

## Method and traceability

BMAD: requirements, bounded implementation, review, verification, delivery.
OpenSpec/BDD: concrete Given/When/Then scenarios, design decisions kept separate
from behavioral requirements, existing `specs/` retained as the contract root.

References:

- [BMAD build workflow](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/build/build-a-change.md)
- [OpenSpec writing scenarios](https://github.com/Fission-AI/OpenSpec/blob/main/docs/writing-specs.md)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Tauri local IPC CSP](https://v2.tauri.app/security/csp/)

| Requirement | Module | Evidence |
|---|---|---|
| Typography/spacing/motion | `frontend/src/index.css`, shared primitives | Browser computed-style, viewport and keyboard audit |
| Project/picker usability | Sidebar, native bridge | Browser project scenarios and native picker contracts |
| Generator controls | MonacoView and generator packages | UI export flow and 27-generator matrix |
| Release links/history | ReleasesModal and release builder | Published GitHub assets, SHA256SUMS and BAT smoke |
| Regression prevention | Browser audit and unit tests | Reproducible local MCP test command |

## Evidence

UI and component evidence (2026-10-14, Windows x64):

- Offline dependency install passes after adding the missing locked Vite 5/esbuild
  dependency subtrees. Existing dependency versions were not upgraded.
- Final code gates: 235 TypeScript tests, 32 Rust tests, typecheck, source
  lint/format, Rust fmt/clippy, package/sidecar/desktop build, generator matrix,
  UI contract, AntiSlop, authenticity and Markdown checks pass.
- Shared typography/spacing, dark controls, 48px hit areas, focus restoration,
  dialogs, timeline editing, generator copy/export and release links are covered
  by component tests and a real local Playwright MCP run.
- Playwright MCP: 149 assertions, 35 view/viewport combinations, seven widths;
  no horizontal overflow, console errors or implicit external requests.
- Chrome DevTools MCP/Lighthouse: Accessibility 100, Best Practices 100, Agentic
  Browsing 100. SEO 75 is not a desktop-workbench release gate. Snapshot audit is
  not a performance or every-state accessibility guarantee.
- Native Windows BAT smoke: opens the real Tauri EXE; Browse opens the Windows
  dialog, cancellation preserves the old path and restores focus, folder selection
  returns a real canonical directory, Runtime check reads 24 actual catalog entries
  and correctly reports no verified local packs. No project was written to the
  selected folder during this picker test.
- Native Downloads uses a real successful `native.release.open` receipt from
  Windows; it does not equate opening the browser with downloading/installing a pack.
- Memory-bound gate hashes 128 MiB under a 32 MiB Node old-space budget. This is a
  bounded-hashing check, not a claim that every long-running workflow is leak-free.

Release pipeline requires a clean commit, a subsequent native build with matching
HEAD/version/EXE hash, pinned upstream notices, full file inventory, ZIP SHA-256,
and a portable BAT smoke before publishing. The historical v1.7.0 release is source
only; no older application binaries are invented.

Independent unresolved acceptance:

- Runtime catalog: 24 unresolved entries, 27 generator mappings, no downloadable
  fully verified pack. Runtime-catalog and offline-install release gates remain
  NeedsReview/Blocked. Generated-project parser checks are component evidence.
- Real Web/API target execution, physical Android/farm and every-language generated
  runtime execution are not revalidated by this UI task. They cannot be marked
  production Verified from these browser/native-shell checks.
- The portable preview requires installed WebView2, excludes bootstrap/offline
  WebView2 installer, and is unsigned. It is not the fully bundled production MVP.
