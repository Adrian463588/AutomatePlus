# OpenSpec Specification: Android Automation Click-and-Run with Appium Script Generation

## 1. Context & Purpose
AutomatePlus provides low-code multiplatform test automation.
Previously, web and API sessions supported interactive "In-app run" execution, but Android sessions returned `createBlockedRunSummary` with `Interactive Android execution requires the native host.`
This specification defines the interactive click-and-run engine for Android test sessions, connecting `InteractivePlayer` to `AndroidInteractiveStepExecutor`, providing pre-configured Android flows (ApiDemos and NotiPlus), supporting step authoring, and generating valid Appium (TypeScript, JavaScript, Java, Kotlin) scripts directly from session IR.

---

## 2. Invariants & Guardrails
1. **Canonical IR Integrity**: Android action steps strictly adhere to `ActionIR` schema (v2) with valid `platform: 'android'` and `ANDROID_ACTIONS`.
2. **Interactive Execution Contract**: Android interactive runs implement `InteractiveStepExecutor`, validating and executing actions (`tap`, `click`, `doubleTap`, `longPress`, `fill`, `clear`, `swipe`, `back`, `home`, `enter`, `sleep`, `assertVisible`, `assertHidden`, `assertText`).
3. **Locator Healing**: If an element locator fails, `InteractivePlayer` attempts fallback locator candidates before marking the step as failed.
4. **Deterministic Appium Projection**: Appium generators (`AppiumTsGenerator`, `AppiumJsGenerator`, `AppiumJavaGenerator`, `AppiumKotlinGenerator`) project canonical IR into executable Appium test projects containing proper capabilities, locator healing, and session cleanup without hardcoded serials or doubles.
5. **Offline Safety**: No external cloud services, telemetry, or unverified packages are downloaded during execution.

---

## 3. BDD Scenarios (Given-When-Then)

### Scenario 1: Interactive Execution of Android ApiDemos Flow
- **Given** an active Android session configured with package `io.appium.android.apis` and activity `.ApiDemos`
- **And** a sequence of 10 recorded steps (tap, fill, assertVisible, assertText, back, home)
- **When** the user clicks "In-app run" in the Precision Workbench
- **Then** the test executes through `AndroidInteractiveStepExecutor`
- **And** all 10 steps report `[PASS]` with measured execution duration
- **And** the run summary reports `status: "passed"` with `10/10` passed steps.

### Scenario 2: Automatic Projection into Appium TypeScript Project
- **Given** an Android session with verified interactive steps
- **When** the user selects framework `appium` and language `typescript`
- **Then** `GeneratorFactory` generates a complete Appium test project
- **And** the entrypoint file includes:
  - WebdriverIO `remote` initialization with UiAutomator2 capabilities
  - `withAppiumLocatorHealing` wrappers around element interactions
  - Correct selectors (`~accessibilityId`, `android=new UiSelector().resourceId(...)`, `text`, etc.)
  - Proper assertion checks (`isDisplayed()`, `getText().includes(...)`)
  - Clean session disposal in `finally { await driver.deleteSession(); }`

### Scenario 3: Automatic Projection into Appium JavaScript Project
- **Given** an Android session with verified interactive steps
- **When** the user selects framework `appium` and language `javascript`
- **Then** `GeneratorFactory` generates a valid JavaScript Appium project with ESM imports and locator healing.

### Scenario 4: Quick Target Flow Loading in Visual Canvas
- **Given** an Android session is selected in the Workbench
- **When** the user clicks "ApiDemos Flow (10 steps)" or "NotiPlus Flow (6 steps)"
- **Then** target package and activity are populated
- **And** canonical steps are added to the active session IR
- **And** the code preview automatically updates with the projected Appium test script.

---

## 4. Verification Gates
- `npm run build:packages` passes.
- `npm test` passes (all unit test suites including Android interactive execution).
- `npm run lint` and `npm run format:check` pass.
- `npm run typecheck` passes.
- `cargo test --manifest-path backend/Cargo.toml --offline` passes.
- Live verification via Playwright MCP confirms interactive pass and Appium script generation with 0 console errors.
