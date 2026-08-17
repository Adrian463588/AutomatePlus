# AutomatePlus Agent Instructions

@C:\Users\HP OMEN\.codex\RTK.md

## Source of truth

- `PRD.md` defines product scope and acceptance.
- `DESIGN.md` defines architecture, contracts, security, and capability rules.
- `specs/` contains active spec-driven implementation contracts.
- `reference/` and `docs/` are read-only research material; never copy or modify them.
- `apps/desktop` is a browser-safe migration shell. Native evidence comes only from WinUI, verified packs, and real devices.

## Architecture

- WinUI/.NET 8 owns MVVM, orchestration, SQLite, runtime resolution, process isolation, device discovery/leases, cancellation, and report normalization.
- The TypeScript sidecar owns versioned IR validation, selector scoring, recording adapters, and generators.
- Use versioned NDJSON IPC. Do not share mutable process state across the boundary.
- UI depends on application contracts, never directly on ADB, Appium, scrcpy, Playwright, k6, or generated-framework APIs.
- `AutomationSession` and `ActionIR` are canonical; farm metadata and device serials stay outside IR.

## Sprint 2 farm rules

- Support `single`, `all-devices`, and `split-iterations` through `FarmRunSpec`; do not add `RunMode=farm`.
- Use stable local device IDs plus current ADB serial snapshots. Bind every ADB/Appium/scrcpy action to the leased serial.
- One worker owns one device lease and one Appium session. Release leases, ports, and process trees on every terminal path.
- Default failure policy is `continue-other-devices`; `fail-fast` stops only unclaimed work.
- Use primary/follower recording. Only primary actions enter canonical IR; followers produce observations. Never broadcast coordinates silently.
- Generate one project per framework/language with required runtime device context. Never emit fixed serials, fixed ports, fake imports, silent fallbacks, or TODO stubs.
- Missing device, runtime pack, target package, project prerequisite, or unsupported action is `Blocked`, never a simulated pass.
- Functional/UI-soak metrics are iterations and duration; API RPS is k6 only.

## Offline and security

- Use local checksum/license-verified runtime packs. Never download or install dependencies during a run.
- Launch allowlisted executables with argument arrays and `shell:false`; validate canonical paths, redact secrets, enforce timeouts, and terminate complete process trees.
- Bind Appium to loopback. Store large evidence as hashed files under the workspace; do not embed unbounded logs or screenshots in session JSON.
- Preserve unrelated user changes. Never reset, clean, stash, uninstall, or delete project/device data without explicit authorization.

## Verification

| Scope | Command |
|---|---|
| Locked install | `npm ci --offline` |
| TypeScript tests | `npm test` |
| Lint/format/typecheck | `npm run lint` / `npm run format:check` / `npm run typecheck` |
| Package/sidecar/UI build | `npm run build:packages` / `npm run build:sidecar` / `npm run build:desktop` |
| Smoke/docs/authenticity | `npm run verify:sidecar` / `npm run verify:k6` / `npm run verify:docs` / `npm run verify:authenticity` |
| Native format/build/test | `dotnet format AutomatePlus.sln --verify-no-changes`; `dotnet build AutomatePlus.sln --no-restore`; `dotnet test AutomatePlus.sln --no-restore` |

- Run file-scoped checks during implementation; run all applicable gates after the final diff.
- Do not claim `.NET 8`, runtime-pack, WinUI, Android, or multi-device acceptance without fresh evidence.
- Report commands/results, runtime/device limitations, and open risks separately.

## Delivery

- Update `PRD.md` and `DESIGN.md` when public behavior changes; keep this file operational and concise.
- `CLAUDE.md` remains a non-duplicating alias to this file.
- AI commits must include `Co-Authored-By: GPT-5 <noreply@example.com>`.
