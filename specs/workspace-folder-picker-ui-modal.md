# Workspace folder selection

Status: Active; supersedes the browser folder-preset proposal in source v1.7.0.
Contract: IPC `native.dialog.pick` protocol `1.0`; no wire-shape change.

## Behavior

- Native Create Project and Runtime Manager use the same async, parent-aware
  Rust `rfd` folder/file picker with the existing picker gate and canonical local
  path validation. Cancel preserves the previous path and restores focus.
- Browser migration mode cannot return an absolute filesystem path from a browser
  directory handle. Browse is disabled with a native-host explanation; manual path
  input and a useful setup guide remain available.
- No machine-specific preset, prompt, PowerShell dialog or reconstructed path.
- Project/session drafts are preserved after a save error. Pending picker/save
  operations disable submission/dismissal until the real operation completes.
- Downloads point only to published artifacts; the BAT cannot be launched directly
  by browser JavaScript.

## BDD

1. GIVEN browser mode WHEN Create Project opens THEN Browse explains its unavailable
   native capability and name/path inputs remain editable.
2. GIVEN a native picker WHEN it is cancelled THEN the old path is unchanged.
3. GIVEN a native picker WHEN a folder is selected THEN the canonical returned path
   fills the field and focus returns to Browse.
4. GIVEN a failed persistence operation THEN its error is shown and no success or
   replacement session is fabricated.
5. GIVEN the setup guide opens over Create Project WHEN Escape is pressed THEN only
   the topmost dialog closes and the project draft remains intact.

Evidence: `frontend/tests/workspace-ux.test.ts`, native picker contract tests,
`scripts/verify-ui-browser.mjs`. Real Windows picker acceptance is a separate gate.
See [release traceability](uiux-workbench-release-1.7.1.md).
