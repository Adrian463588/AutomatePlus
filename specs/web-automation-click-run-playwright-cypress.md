# OpenSpec: Web Automation Click-and-Run with Multi-Framework Script Generation & Interactive WebDriver Canvas

**Target**: Web automated test execution, SauceDemo & OrangeHRM compatibility, Interactive WebDriver Canvas Viewport, Polyglot Script Generation (Playwright, Cypress, Selenium, Puppeteer, Robot Framework), release v1.5.0.  
**Methodology**: BMAD / OpenSpec Spec-Driven Development (SDD), BDD, Ponytail minimal diffs, RTK.

---

## 1. Primary Directives & Invariants

1. **User POV Interactive WebDriver Canvas**: When an active Web session is selected, `VisualCanvas` renders a headed browser simulator (`WebDriverCanvas`) containing address navigation, viewport status, and live interactive DOM pages (SauceDemo Swag Labs login/inventory/cart/checkout, OrangeHRM login/dashboard, and generic target forms).
2. **Click-and-Run Step Recording**: User interactions in the WebDriver canvas (typing credentials, clicking login, clicking "Add to cart", proceeding through checkout) immediately append valid canonical `ActionIR` steps into `SessionIR` in real time.
3. **In-App Interactive Execution**: Web test sessions MUST execute interactively via `InteractivePlayer` with a real `WebInteractiveStepExecutor`. Web sessions must never be rejected with `Interactive execution is blocked`.
4. **Canonical SessionIR / ActionIR Integrity**: Session and action structures strictly follow Zod IR schemas with schemaVersion: 2 and valid RFC 4122 hexadecimal UUIDs.
5. **Universal Polyglot Code Projection**: Test steps for web automation project cleanly into **5 major Web frameworks**: Playwright (TypeScript, JavaScript, Python, Java), Cypress (TypeScript, JavaScript), Selenium (TypeScript, JavaScript, Python, Java), Puppeteer (TypeScript, JavaScript), and Robot Framework (Robot format) without TODO stubs or fixed ports.
6. **Real-Target Compatibility**: Real-world journeys for SauceDemo (`https://www.saucedemo.com/`) and OrangeHRM (`https://opensource-demo.orangehrmlive.com/`) run and pass cleanly.
7. **Anti-Slop & Precision Workbench Design**: Dark-theme styling without forbidden patterns (no indigo/purple accents, no linear gradients, no oversized card radiuses, no decorative glass blurs).

---

## 2. BDD Acceptance Scenarios

### Scenario 1: Interactive WebDriver Canvas Rendering (User POV)
- **Given** an active Web session targeting `https://www.saucedemo.com/`.
- **When** the user opens the Recorder tab in `VisualCanvas`.
- **Then** the canvas renders the interactive `WebDriverCanvas` displaying the browser navigation bar, address input, and the Swag Labs login view.
- **And** the user sees interactive input fields for Username (`#user-name`), Password (`#password`), and Login button (`#login-button`).

### Scenario 2: Live Click-and-Run Recording on SauceDemo Flow
- **Given** the user is viewing the SauceDemo login view in `WebDriverCanvas`.
- **When** the user clicks "Login & Record Steps" with valid credentials (`standard_user` / `secret_sauce`).
- **Then** `ActionIR` steps for `navigate`, `fill` username, `fill` password, `click` login-button, `assertUrl`, and `assertVisible` are appended to the session.
- **And** the viewport transitions to the inventory page displaying products and an active cart badge.
- **When** the user clicks "Add to cart" on the Sauce Labs Backpack (`#add-to-cart-sauce-labs-backpack`).
- **Then** a `click` step is recorded, and the cart badge increments.

### Scenario 3: Interactive In-App Run Execution
- **Given** an active Web session with recorded SauceDemo or OrangeHRM steps.
- **When** the user clicks "Run in WebDriver" or "In-app run" (`runTest('interactive')`).
- **Then** `desktopBridge.runInteractiveTest` executes all steps sequentially via `WebInteractiveStepExecutor`.
- **And** the execution status completes with `passed`, `failedSteps: 0`, and real execution logs emitted.

### Scenario 4: Universal Polyglot Projection Across Frameworks
- **Given** an active Web session with recorded steps.
- **When** the user selects any supported framework (Playwright, Cypress, Selenium, Puppeteer, Robot Framework) and target language.
- **Then** `GeneratorFactory` generates an executable project structure containing correct page visits, locators, and assertions.
- **And** the generated code contains no TODO stubs or fixed local ports.

### Scenario 5: In-Browser & Headless Adaptive Web Recording
- **Given** an active Web session targeting a real web target URL (`https://www.saucedemo.com/`).
- **When** the user clicks "Start recorder" in browser migration shell mode.
- **Then** `WebRecorder` uses `AdaptiveBrowserTransport` delegating to `InBrowserDomTransport`.
- **And** the recorder activates cleanly with `isRecording: true`, the button transitions to "Recording · Stop", and status reflects "Recorder is active. Actions in the canvas will be recorded." without throwing `Playwright runtime is not installed or cannot be loaded`.
- **When** the user clicks "Recording · Stop", the recording session terminates cleanly, setting `isRecording: false` and status "Recording stopped."

---

## 3. Verification Gates

1. `npm test` -> 100% pass (175+ tests across all 26 suites).
2. `npm run lint` & `npm run format:check` -> zero errors.
3. `npm run typecheck` -> zero type errors.
4. `node scripts/verify-ui-contract.mjs` & `npm run verify:anti-slop` -> zero violations.
5. `cargo test --offline` -> 100% pass (31 unit tests in backend).
6. Live verification via MCP Playwright tool in browser environment.
7. Release synchronization across `package.json`, `frontend/package.json`, `backend/Cargo.toml`, `backend/tauri.conf.json`, and `README.md`.
