# Web authoring and real execution boundary

Status: Active; supersedes the synthetic headed-canvas proposal in source v1.5.0.
Canonical contracts: SessionIR/ActionIR v2 and native IPC 1.0 remain unchanged.

## Requirements

- A user creates a project/session and enters a real target. No example website,
  target DOM, credentials, cart, checkout or success result is rendered as if it
  came from the target.
- Manual authoring accepts explicit action, locator strategy/value and assertion
  value. Validate input and persist ActionIR before displaying generated output.
- Recording uses `PlaywrightCdpBrowserTransport`, never an in-app DOM or simulated
  target fallback. Missing native recorder/runtime remains disabled or Blocked.
- Generate one project per declared framework/language. Preserve ranked locator
  evidence and bounded retry policy. No fixed device/port, fake import or fallback.
- In-app execution requires a real framework runner and local runtime context.
  A generated file or unit mock cannot promote target execution to Verified.
- SauceDemo and DemoQA are explicit target-online acceptance profiles. Their live
  DOM/network must not be replaced by interception or fabricated target markup.

## BDD

1. GIVEN an empty workspace THEN the editor explains project/session setup without
   inventing a target or preloading actions.
2. GIVEN a Web session WHEN the user adds a valid navigate/click/fill/assertion
   action THEN IR and generated code reflect that action.
3. GIVEN a framework/language selection WHEN Copy or Export is used THEN it reads
   the displayed generated project, with actual success/error feedback.
4. GIVEN an unavailable recording/execution runtime THEN its control explains the
   prerequisite; it does not switch to a synthetic recorder or report a pass.
5. GIVEN real recorded locator candidates WHEN self-healing runs THEN retries are
   bounded and a pass requires a successful real action, not candidate ranking alone.

Evidence: generator matrix/component tests, desktop bridge tests and local MCP
browser regression. Real target execution evidence is maintained independently.
See [release traceability](uiux-workbench-release-1.7.1.md).
