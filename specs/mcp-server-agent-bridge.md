# OpenSpec: AutomatePlus Model Context Protocol (MCP) Server & AI Agent Bridge

**Target**: Model Context Protocol (MCP) server integration, JSON-RPC 2.0 stdio bridge, AI Agent tool provider (`automateplus_run_web`, `automateplus_run_android`, `automateplus_run_phone_farm`, `automateplus_inspect_web_elements`, `automateplus_generate_test_script`), UI MCP workbench, release v1.6.0.  
**Methodology**: BMAD / OpenSpec Spec-Driven Development (SDD), BDD, Ponytail minimal diffs, RTK.

---

## 1. Primary Directives & Invariants

1. **Standard MCP JSON-RPC 2.0 Stdio Protocol**: The MCP server adheres strictly to the Model Context Protocol specifications (protocolVersion: 2024-11-05). It communicates via line-delimited JSON-RPC 2.0 over standard I/O (stdin/stdout) without proprietary framing.
2. **AI Agent Tool Capabilities**:
   - `automateplus_inspect_web_elements`: Inspects and queries elements of target web pages/DOMs, extracting tag names, attributes (`id`, `name`, `data-test`, `role`, `aria-label`), text content, and ranked locator candidates (CSS, XPath, ID, Data-Test).
   - `automateplus_run_web`: Executes web automation test flows (URL navigation, input filling, button clicking, URL/text/visibility assertions) using `WebInteractiveStepExecutor`, emitting execution summaries and generating clean runnable test scripts (Playwright, Cypress, Selenium, Puppeteer, Robot Framework).
   - `automateplus_run_android`: Executes Android automation flows (app launching, taps, text inputs, assertions) using `AndroidInteractiveStepExecutor`, emitting execution summaries and generating clean runnable Appium test scripts.
   - `automateplus_run_phone_farm`: Executes multi-device phone farm runner across device targets with specified iterations (e.g. 1-3 loops) and strategy (`single`, `all-devices`, `split-iterations`), emitting per-device execution summaries.
   - `automateplus_generate_test_script`: Emits clean, production-ready, runnable project test code across all 27 supported combinations without TODO stubs, fake imports, or fixed serials/ports.
3. **Execution-Ready Output**: The final artifact returned by test run tools is an actionable execution summary accompanied by clean, runnable test scripts ready for CI/CD or immediate local execution.
4. **Offline Host Respect**: Does not make unauthorized network calls or install external binaries during offline operation.
5. **Anti-Slop & Precision Workbench Design**: UI and logging maintain strict dark-theme styling, accessible controls (labels, aria-labels, titles on disabled controls), zero linear gradients, zero forbidden color accents.

---

## 2. BDD Acceptance Scenarios

### Scenario 1: MCP Server Initialization & Tool Discovery
- **Given** an AI Agent connects to AutomatePlus MCP server via stdio.
- **When** the agent sends `initialize` request with client info.
- **Then** the server responds with protocolVersion `2024-11-05`, capabilities (`tools`, `resources`, `prompts`), and serverInfo (`name: "automate-plus-mcp"`, `version: "1.6.0"`).
- **When** the agent sends `tools/list` request.
- **Then** the server returns all 5 registered tools with full JSON Schema argument definitions.

### Scenario 2: Web Element Inspection (`automateplus_inspect_web_elements`)
- **Given** an AI Agent inspecting a target web URL (e.g. `https://www.saucedemo.com/`).
- **When** the agent calls `automateplus_inspect_web_elements` with the target URL or HTML snippet.
- **Then** the server returns structured element definitions including `tagName`, `attributes`, `text`, and ranked selectors (`#user-name`, `#password`, `#login-button`).

### Scenario 3: Automated Web Test Execution & Polyglot Script Generation (`automateplus_run_web`)
- **Given** an AI Agent initiating a web test flow for SauceDemo login and checkout.
- **When** the agent calls `automateplus_run_web` specifying target URL, flow preset or custom steps, and export framework `playwright`.
- **Then** the server executes the steps via `WebInteractiveStepExecutor`.
- **And** the server generates clean, executable Playwright test scripts.
- **And** returns `status: "passed"`, step logs, and complete runnable code files.

### Scenario 4: Automated Android Test Execution & Appium Script Generation (`automateplus_run_android`)
- **Given** an AI Agent initiating an Android test flow for `com.notifplus`.
- **When** the agent calls `automateplus_run_android` specifying appPackage, appActivity, and action steps.
- **Then** the server executes the steps via `AndroidInteractiveStepExecutor`.
- **And** the server generates a clean, executable Appium test script.
- **And** returns `status: "passed"` and generated Appium code.

### Scenario 5: Phone Farm Multi-Device Runner Execution (`automateplus_run_phone_farm`)
- **Given** an AI Agent executing a phone farm run across 1 or more Android devices.
- **When** the agent calls `automateplus_run_phone_farm` with `iterations: 3` and `strategy: "all-devices"`.
- **Then** the server executes the multi-device runner loops.
- **And** returns a `MultiDeviceRunSummary` with totalCompletedIterations and individual device run summaries.

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
