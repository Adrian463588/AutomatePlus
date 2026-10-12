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

## Model Context Protocol (MCP) Server & Agent Bridge

- Expose AutomatePlus capabilities to external AI agents via local stdio MCP (`scripts/mcp-server.mjs`) and frontend service (`frontend/src/services/mcpBridge.ts`).
- Standardized MCP Tools (RFC 2.0):
  1. `run_automation_task`: `{ platform: 'web' | 'appium' | 'phone_farming' | 'k6', task_id: string, params?: object }` -> Executes internal runners and returns structured execution logs and `SUCCESS` / `FAILED` status.
  2. `inspect_element_context`: `{ platform: 'web' | 'android', url?: string, selector?: string }` -> Inspects DOM accessibility tree / Android UI hierarchy with ranked locator candidates.
  3. `generate_runnable_test_script`: `{ session_id: string, framework: 'playwright' | 'appium' | 'k6' | 'cypress', target_scenario: string }` -> Generates clean standalone test scripts without placeholders or fake stubs.
  4. `run_load_test`: `{ targetUrl: string, targetRps?: number, durationSeconds?: number, maxVUs?: number }` -> Executes k6 constant-arrival-rate load test and returns throughput metrics and clean k6 test script.
  5. `test_web_page`: `{ url: string, flowPreset?: string, exportFramework?: string, exportLanguage?: string }` -> Executes click-and-run web journey (like Playwright MCP) and generates standalone test script.
- Legacy tool aliases (`automateplus_run_web`, `automateplus_run_android`, `automateplus_run_phone_farm`, `automateplus_run_k6`, `automateplus_inspect_web_elements`, `automateplus_generate_test_script`) remain registered for backward compatibility.
- Offline and local: the MCP server binds to stdio or local IPC without requiring external network connections.

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
