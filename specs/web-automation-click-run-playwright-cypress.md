# OpenSpec: Web Automation Click-and-Run with Multi-Framework Script Generation

**Target**: Web automated test execution, SauceDemo & OrangeHRM compatibility, Playwright & Cypress script generation, release v1.2.0.  
**Methodology**: BMAD / OpenSpec Spec-Driven Development (SDD), BDD, Ponytail minimal diffs, RTK.

---

## 1. Primary Directives & Invariants

1. **In-App Interactive Execution**: Web test sessions MUST execute interactively via `InteractivePlayer` with a real `WebInteractiveStepExecutor`. Web sessions must never be rejected with `Interactive execution is blocked`.
2. **Canonical SessionIR / ActionIR Integrity**: Session and action structures strictly follow Zod IR schemas with schemaVersion: 2. No runtime serials, fake metrics, or fake devices.
3. **Resilient Self-Healing**: Failed primary locators automatically trigger ordered fallback retries via `findNextResilientLocator`.
4. **Polyglot Code Projection**: Test steps for web automation (navigate, fill, click, assertUrl, assertVisible, assertText, etc.) project cleanly into Playwright (TypeScript, JavaScript, Python, Java) and Cypress (TypeScript, JavaScript) without TODO stubs or fixed ports.
5. **Real-Target Compatibility**: Real-world flows for SauceDemo (`https://www.saucedemo.com/`) and OrangeHRM (`https://opensource-demo.orangehrmlive.com/`) run and pass cleanly.
6. **No Regressions**: All 167+ existing tests, linter, formatting, typechecking, and contract gates pass.

---

## 2. BDD Acceptance Scenarios

### Scenario 1: Interactive In-App Run of Web Session (SauceDemo Flow)
- **Given** an active Web session targeting `https://www.saucedemo.com/` containing valid ActionIR steps (navigate, fill username, fill password, click login, assertUrl, click add to cart, assertText).
- **When** the user clicks "In-app run" (`runTest('interactive')`).
- **Then** `desktopBridge.runInteractiveTest` executes the Web steps via `InteractivePlayer`.
- **And** the execution status completes with `passed`, `failedSteps: 0`, and logs emitted for each step.
- **And** the test summary is persisted to the local run repository.

### Scenario 2: Interactive In-App Run of Web Session (OrangeHRM Flow)
- **Given** an active Web session targeting `https://opensource-demo.orangehrmlive.com/` with navigation, login credential inputs, login click, and dashboard assertion.
- **When** the user clicks "In-app run".
- **Then** all steps execute in sequence with timing metrics and locator verification.
- **And** the run summary reports `status: 'passed'`.

### Scenario 3: Polyglot Test Script Generation (Playwright & Cypress)
- **Given** an active Web session with recorded/configured steps.
- **When** the user selects framework `playwright` (or `cypress`) and language `typescript`.
- **Then** `GeneratorFactory` projects the session into an executable project structure.
- **And** the generated test script contains `page.goto` (or `cy.visit`), locators, actions, and assertions without TODO stubs.

### Scenario 4: UI Step Authoring & Template Quick-Load
- **Given** a user viewing an active Web session in `VisualCanvas`.
- **When** the session has 0 steps or the user wants to test a web target.
- **Then** quick template buttons for SauceDemo and OrangeHRM are available to populate real canonical steps.
- **And** the user can add explicit actions (`navigate`, `click`, `fill`, assertions) directly.

---

## 3. Verification Gates

1. `npm test` -> 100% pass (all suites including web runners and generators).
2. `npm run lint` & `npm run format:check` -> zero errors.
3. `npm run typecheck` -> zero type errors.
4. Live verification via MCP Playwright tool in browser environment.
5. Release synchronization across `package.json`, `frontend/package.json`, `backend/Cargo.toml`, `backend/tauri.conf.json`, and `README.md`.
