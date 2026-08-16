# AutomatePlus Agent Instructions

## Source of truth

- Read `PRD.md` for product scope and acceptance criteria.
- Read `DESIGN.md` for architecture, contracts, capability rules, and security boundaries.
- Treat `reference/` and `docs/` as read-only research material; do not copy code or modify them.
- Treat the current TypeScript/Vite scaffold and simulated runners as prototype code, not runtime evidence.

## Toolchain

- Target desktop: WinUI 3 and .NET 8 on Windows x64.
- Target sidecar: Node.js/TypeScript with the repository `package-lock.json`.
- Target runtime packs are local and checksum-verified; never download dependencies during a test run.

## Verification commands

| Scope | Command |
|---|---|
| Current sidecar tests | `npm test` |
| Current package build | `npm run build:packages` |
| Current UI build | `npm run build:desktop` |
| Target .NET format | `dotnet format AutomatePlus.sln --verify-no-changes` |
| Target .NET build/test | `dotnet build AutomatePlus.sln --no-restore` / `dotnet test AutomatePlus.sln --no-restore` |
| Target sidecar gates | `npm run lint`, `npm run typecheck`, `npm test` |

- Prefer file-scoped commands for the changed package or test fixture.
- Do not claim the target .NET gates until `AutomatePlus.sln` and its projects exist.
- Generated projects must pass formatter, lint, typecheck/compile, and local smoke validation before `Ready`.

## Architecture boundaries

- .NET owns WinUI/MVVM, orchestration, SQLite, runtime resolution, process isolation, device locks, cancellation, and report normalization.
- The TypeScript sidecar owns versioned IR validation/normalization, selector scoring, Playwright/CDP recording, and generator adapters.
- Communicate across the sidecar boundary with versioned NDJSON IPC; do not share mutable process state.
- UI depends on application contracts, never directly on Playwright, ADB, Appium, k6, or generated-framework APIs.
- Add a framework through a capability manifest and registry adapter; do not add distributed framework conditionals.

## IR and generation rules

- `AutomationSession` and `ActionIR` are the canonical source of truth; generated code is a projection.
- Reject unsupported framework/language/action combinations with `CapabilityError`.
- Never emit fake imports, silent fallbacks, plaintext secrets, or `TODO` stubs for supported actions.
- Prefer semantic locators; coordinates/XPath are explicit fallbacks and must remain visible in the IR.
- Do not introduce static sleeps unless the user explicitly records a sleep action.

## Runtime and security

- Launch processes with an executable allowlist and argument arrays; never concatenate shell commands.
- Validate canonical workspace paths, redact secrets, enforce timeouts, and terminate complete process trees on cancellation.
- Lock an Android serial to one active interaction/run at a time.
- Functional looping and UI soak are not API RPS. RPS uses the local k6 protocol runner only.
- Maximum three remediation attempts; halt after the same error repeats twice consecutively.

## Change discipline

- Preserve unrelated user changes and never reset, clean, stash, uninstall, or delete data without explicit authorization.
- Update `PRD.md` and `DESIGN.md` when a public contract or acceptance behavior changes.
- Keep `AGENTS.md` operational and concise; place architecture detail in `DESIGN.md`.
- Before completion, report commands, results, runtime/device limitations, and open risks separately.

## Commit attribution

AI commits must include the agent model's attribution, for example:

```text
Co-Authored-By: GPT-5 <noreply@example.com>
```
