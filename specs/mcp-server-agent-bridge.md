# OpenSpec: AutomatePlus Model Context Protocol (MCP) Server & AI Agent Bridge

**Target**: Model Context Protocol (MCP) server integration, JSON-RPC 2.0 stdio bridge, AI Agent tool provider (`run_automation_task`, `inspect_element_context`, `generate_runnable_test_script`, alongside backward-compatible aliases), UI MCP workbench, release v1.7.0.  
**Methodology**: BMAD / OpenSpec Spec-Driven Development (SDD), BDD, Ponytail minimal diffs, RTK.

---

## 1. Primary Directives & Invariants

1. **Standard MCP JSON-RPC 2.0 Stdio Protocol**: The MCP server adheres strictly to the Model Context Protocol specifications (protocolVersion: 2024-11-05). It communicates via line-delimited JSON-RPC 2.0 over standard I/O (stdin/stdout) without proprietary framing.
2. **AI Agent Tool Capabilities**:
   - `run_automation_task`:
     - Arguments: `{ platform: "web" | "appium" | "phone_farming", task_id: string, params?: object }`
     - Function: Dispatches to internal runners (`WebInteractiveStepExecutor`, `AndroidInteractiveStepExecutor`, `MultiDeviceRunner`), returning structured execution logs and `SUCCESS` / `FAILED` status.
   - `inspect_element_context`:
     - Arguments: `{ url?: string, selector?: string, platform: "web" | "android" }`
     - Function: Acts like DevTools / Playwright MCP; extracts accessibility tree, snapshot DOM, or Android UIAutomator XML hierarchy with ranked locator candidates.
   - `generate_runnable_test_script`:
     - Arguments: `{ session_id: string, framework: "playwright" | "appium", target_scenario: string }`
     - Function: Generates clean, production-ready, standalone runnable test scripts without fake imports or stubs.
   - Backward-compatible Aliases: Retains `automateplus_run_web`, `automateplus_run_android`, `automateplus_run_phone_farm`, `automateplus_inspect_web_elements`, and `automateplus_generate_test_script`.
3. **Execution-Ready Output**: The final artifact returned by test run tools is an actionable execution summary accompanied by clean, runnable test scripts ready for CI/CD or immediate local execution.
4. **Offline Host Respect**: Does not make unauthorized network calls or install external binaries during offline operation.
5. **Anti-Slop & Precision Workbench Design**: UI and logging maintain strict dark-theme styling, accessible controls (labels, aria-labels, titles on disabled controls), zero linear gradients, zero forbidden color accents.

---

## 2. BDD Acceptance Scenarios

### Scenario 1: MCP Server Initialization & Tool Discovery
- **Given** an AI Agent connects to AutomatePlus MCP server via stdio.
- **When** the agent sends `initialize` request with client info.
- **Then** the server responds with protocolVersion `2024-11-05`, capabilities (`tools`, `resources`, `prompts`), and serverInfo (`name: "automate-plus-mcp"`, `version: "1.7.0"`).
- **When** the agent sends `tools/list` request.
- **Then** the server returns all registered tools including `run_automation_task`, `inspect_element_context`, and `generate_runnable_test_script` with full JSON Schema argument definitions.

### Scenario 2: Cross-Platform Task Execution via MCP (`run_automation_task`)
- **Given** an AI Agent initiating a test task with `task_id: "task-web-01"`.
- **When** the agent calls `run_automation_task` with `{ platform: "web", task_id: "task-web-01", params: { targetUrl: "https://www.saucedemo.com/", flowPreset: "saucedemo" } }`.
- **Then** the server executes the steps via `WebInteractiveStepExecutor`.
- **And** the server returns `status: "SUCCESS"`, structured summary, execution logs, and generated files.
- **When** the agent calls `run_automation_task` with `{ platform: "appium", task_id: "task-appium-01", params: { appPackage: "com.notifplus" } }`.
- **Then** the server executes the steps via `AndroidInteractiveStepExecutor` and returns `status: "SUCCESS"`.
- **When** the agent calls `run_automation_task` with `{ platform: "phone_farming", task_id: "task-farm-01", params: { iterations: 1, strategy: "all-devices" } }`.
- **Then** the server executes the steps via `MultiDeviceRunner` and returns `status: "SUCCESS"`.

### Scenario 3: Element Context Inspection (`inspect_element_context`)
- **Given** an AI Agent needing to inspect UI element locators.
- **When** the agent calls `inspect_element_context` with `{ platform: "web", url: "https://www.saucedemo.com/" }`.
- **Then** the server returns structured DOM elements, accessibility tags, and ranked locator candidates.
- **When** the agent calls `inspect_element_context` with `{ platform: "android", selector: "btn_start" }`.
- **Then** the server returns Android UI hierarchy elements, resource IDs, and recommended locators.

### Scenario 4: Clean Standalone Test Script Generation (`generate_runnable_test_script`)
- **Given** an AI Agent requesting a clean production-ready test script for `session_id: "sess-01"`.
- **When** the agent calls `generate_runnable_test_script` with `{ session_id: "sess-01", framework: "playwright", target_scenario: "saucedemo-checkout" }`.
- **Then** the server produces a complete standalone TypeScript test script without fake imports or TODO stubs.
- **When** the agent calls `generate_runnable_test_script` with `{ session_id: "sess-02", framework: "appium", target_scenario: "notiplus-flow" }`.
- **Then** the server produces a complete standalone Appium test script with valid capability configurations.

---

## 3. Verification Gates

1. `npm test` -> 100% pass across all unit test suites including MCP bridge tests.
2. `npm run verify:mcp` -> Standalone stdio MCP smoke test verifies JSON-RPC 2.0 communication.
3. `npm run lint` & `npm run format:check` -> zero errors.
4. `npm run typecheck` -> zero type errors.
5. `node scripts/verify-ui-contract.mjs` & `npm run verify:anti-slop` -> zero violations.
6. `npm run verify:authenticity` -> zero forbidden seeds or placeholders.
7. `cargo test --offline` -> 100% pass (31 unit tests in backend).
8. Live verification via MCP Playwright tool in browser environment.
9. Monorepo bump to v1.6.0 with updated download links in `README.md`.
