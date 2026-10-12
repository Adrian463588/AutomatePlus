# AutomatePlus Changelog

All notable changes to the AutomatePlus project are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.7.0] - 2026-10-13

### Added
- **Standardized Model Context Protocol (MCP) Server (RFC 2.0)**:
  - Implemented standardized MCP tools adhering to the Anthropic/Model Context Protocol 2024-11-05 specification across both stdio JSON-RPC 2.0 server (`scripts/mcp-server.mjs`) and frontend in-app service (`frontend/src/services/mcpBridge.ts`):
    - `run_automation_task`: Orchestrates automated test executions across `web`, `appium`, `phone_farming`, and `k6` platforms, returning structured logs and standard `SUCCESS` or `FAILED` statuses.
    - `inspect_element_context`: Inspects UI elements context for Web (DOM accessibility tree, tags, text, ranked selectors) and Android (UIAutomator XML hierarchy, resource IDs, bounds, recommended locators).
    - `generate_runnable_test_script`: Emits clean, standalone, production-ready runnable test suites without stubs, placeholders, or fake imports.
- **k6 Constant-Arrival-Rate Load Testing Engine**:
  - Validated SessionIR generation with strict schema compatibility (`platform: 'api'`, `action: 'httpRequest'`).
  - Synthetic executor integration returning calculated RPS, p95 latencies, and error rates with zero threshold breaches.
- **Unified Testing & Verification**:
  - Added full test suite in `frontend/src/services/__tests__/mcpBridge.test.ts` covering all 8 exposed tools (3 standard + 5 aliases).
  - Expanded `scripts/verify-mcp.mjs` to execute and verify 13 JSON-RPC 2.0 requests over stdio.

### Changed
- Synchronized monorepo workspace version to `1.7.0` across `package.json`, `frontend/package.json`, `backend/tauri.conf.json`, and `backend/Cargo.toml`.
- Updated `PRD.md` and `AGENTS.md` to document MCP server boundaries, security, and tool contracts.
- Preserved legacy tool aliases (`automateplus_inspect_web_elements`, `automateplus_run_web`, `automateplus_run_android`, `automateplus_run_phone_farm`, `automateplus_generate_test_script`) for backward compatibility.

---

## [1.6.0] - 2026-10-12

### Added
- **27-Generator Matrix & Self-Healing Locator Engine Audit**:
  - Comprehensive verification across all 13 Web, 9 Mobile, and 5 API generators.
  - Strict AST parsing and syntax checking without synthetic mocks or empty stubs.
- **Self-Healing Locator Hierarchy**:
  - Deterministic ranking: `Resource ID` -> `Accessibility Name/Label` -> `Role` -> `Visible Text` -> `CSS Selector` -> `XPath`.
  - Capped at 8 candidates with real DOM/XML extraction.
- Initial MCP Server and workbench bridge exposing 5 `automateplus_*` agentic tools.

---

## [1.5.0] - 2026-10-12

### Added
- **Interactive WebDriver Canvas Viewport (`WebDriverCanvas`)**:
  - Live visual click-and-run web automation from the user's POV on SauceDemo (`saucedemo.com`) and OrangeHRM (`orangehrmlive.com`).
  - Visual step recording: filling credentials, clicking login, product inventory selection, shopping cart transitions, checkout flows, and assertions.
  - Universal multi-framework code generator projection to Playwright, Cypress, Selenium, Puppeteer, and Robot Framework.

---

## [1.4.0] - 2026-10-12

### Added
- **Multi-Device Android Phone Farm Replay & Looping Runner**:
  - `MultiDeviceRunner` and `AndroidInteractiveStepExecutor` supporting sequential looping replay (3x iterations) and distributed farm execution.
  - 1-Click interactive looping execution (`Run 3x Loop`) for NotiPlus and connected Android targets.
  - Fail-fast and iteration distribution across `single`, `all-devices`, and `split-iterations` strategies.

---

## [1.3.0] - 2026-10-12

### Added
- **Android Automation Interactive In-App Click-and-Run**:
  - In-app execution engine (`AndroidInteractiveStepExecutor`) for Android targets and connected ADB devices.
  - 1-Click preset action flows for ApiDemos (10 steps) and NotiPlus (6 steps) with real-time locator healing and visual feedback.
  - Polyglot test generator projection to Appium (TypeScript/JavaScript/Java/Kotlin) directly from interactive Android session IR.

---

## [1.2.0] - 2026-10-12

### Added
- **Web Automation Interactive In-App Click-and-Run**:
  - Execution engine (`WebInteractiveStepExecutor`) for web targets (SauceDemo, OrangeHRM).
  - 1-Click preset action flows for SauceDemo (15 steps) and OrangeHRM (6 steps) with real-time locator healing and visual feedback.
  - Polyglot test generator projection to Playwright (TypeScript/JavaScript/Python/Java) and Cypress (TypeScript/JavaScript).

---

## [1.1.0] - 2026-10-12

### Added
- Visual action disabling and parameterization in Action Timeline (FR-02).
- Enhanced screen reader accessibility and explicit ARIA labels across MonacoView and FarmRunModal.
- DevSecOps-hardened release distribution and direct standalone binary download links.

---

## [1.0.0] - 2026-10-09

### Added
- Multiplatform Web automation (13 targets across Playwright, Cypress, Selenium, Puppeteer, Robot Framework).
- Android Device Farm (9 targets, Appium, Maestro, Espresso, Robolectric, multi-device replication & distribution).
- API Functional & Load Suite (5 targets, HTTP TS/JS/Python/Java, k6 constant RPS).
- Precision Workbench Dark UI with 48px interactive touch targets.
- DevSecOps isolation protecting research references and internal documents.
- 1-Click local Windows execution via `Run-AutomatePlus.bat`.
