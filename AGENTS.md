# AutomatePlus Agent Instructions

@C:\Users\HP OMEN\.codex\RTK.md

## Source of truth

- `PRD.md` defines product behavior and acceptance.
- `DESIGN.md` defines the active Tauri/Rust architecture and security boundaries.
- `specs/` contains implementation contracts.
- `reference/` and `docs/` are read-only research material. Never modify or copy them into production.

## Active runtime

- The released desktop host is Tauri 2 + Rust under `backend`.
- React/TypeScript, the local sidecar, and internal frontend packages live under `frontend`. Ordinary browser mode is a migration shell.
- TypeScript sidecar packages own IR validation, selector ranking, recorder adapters, and generators.
- The old .NET/WinUI tree is legacy source only and is not a release dependency.
- Runtime is Windows x64 and offline. No test or launcher may download, install, log in, or call cloud services.

## Boundaries and correctness

- Rust owns Tauri commands, ADB/Appium/scrcpy process boundaries, device locks, port leases, SQLite, cancellation, cleanup, and evidence.
- Cross-boundary messages use the versioned IPC envelope (`protocolVersion: 1.0`) and NDJSON-compatible payloads.
- `SessionIR` and `ActionIR` are canonical. Farm metadata and live ADB serial snapshots never enter `ActionIR`.
- One worker owns one leased serial and one isolated runtime session. Every ADB operation uses the bound serial.
- Use `single`, `all-devices`, and `split-iterations`; default failure policy is `continue-other-devices`.
- Primary/follower recording produces one primary IR and independent follower observations. Never broadcast coordinates silently.
- Generators emit one project per framework/language and require external runtime context. Never emit fixed serials, fixed ports, fake imports, TODO stubs, or silent fallbacks.
- Missing packs, devices, target apps, project prerequisites, or unsupported actions are `Blocked`, never a simulated pass.

## Security and UX

- Resolve only checksum/license-verified local packs. Use an executable allowlist, argument arrays, canonical path checks, loopback Appium binding, timeouts, redaction, and process-tree cleanup.
- Persist large evidence as hashed files under the workspace; keep session JSON bounded.
- All controls need a real handler or a disabled state with an explanation. Use semantic labels, keyboard/focus support, live status, reduced-motion behavior, and interactive targets of at least 48×48 px.
- Never add fake devices, fake targets, fake battery/time/progress, fabricated metrics, or production test doubles. Test doubles belong only at fixture/unit boundaries.

## Verification

Use the RTK wrapper for shell commands. Run the applicable gates after the final diff:

| Scope | Command |
|---|---|
| Locked offline install | `npm ci --offline` (root lock owns the local frontend/package graph) |
| TypeScript quality | `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` |
| TypeScript builds | `npm run build:packages`, `npm run build:sidecar`, `npm run build:desktop` |
| Smoke and docs | `npm run verify:sidecar`, `npm run verify:k6`, `npm run verify:docs`, `npm run verify:authenticity` |
| Native source | `cargo fmt --manifest-path backend/Cargo.toml -- --check`, `cargo clippy --manifest-path backend/Cargo.toml --offline -- -D warnings`, `cargo test --manifest-path backend/Cargo.toml --offline` |
| Native packaging | `npm run native:preflight`, `npm run native:check`, `npm run native:build` |

Do not report Rust/Tauri, pack, Appium, or multi-device acceptance as `Verified` when the offline Cargo cache, Tauri CLI, verified packs, target app, or physical devices are absent. Report the exact blocker and exit code.

## Change discipline

- Preserve unrelated user changes. Never reset, clean, stash, uninstall, or delete project/device data.
- Keep `reference/` and `docs/Sprint2/` byte-for-byte unchanged.
- Update `PRD.md`, `DESIGN.md`, and the relevant spec when a public contract changes.
- Use BMAD/spec-driven traceability: requirement → interface/ADR → module → test → evidence → status.
- AI commits include `Co-Authored-By: GPT-5 <noreply@example.com>`.
