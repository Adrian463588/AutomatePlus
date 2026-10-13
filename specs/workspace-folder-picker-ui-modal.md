# OpenSpec: Workspace Folder Picker UI Modal & Seamless Browser Path Selection

**Target**: Workspace path selection in Browser Migration Shell, Interactive UI Folder Picker Modal (`FolderPickerModal`), OS Directory Picker integration, Release Distribution Access, release v1.7.0.  
**Methodology**: BMAD / OpenSpec Spec-Driven Development (SDD), BDD, Ponytail minimal diffs, RTK.

---

## 1. Primary Directives & Invariants

1. **Zero Dead Buttons**: The folder icon button next to "Workspace path" in the Project Creation dialog MUST NEVER be disabled in browser mode. When clicked, it MUST open an interactive folder picker modal (`FolderPickerModal`).
2. **Browser Migration Shell Resilience**: When running without the native Tauri/Rust desktop host, users must never be blocked from selecting or configuring a workspace path.
3. **Multi-Source Folder Selection**: The `FolderPickerModal` MUST support:
   - Quick one-click selection of recommended workspace presets (e.g. project workspace, isolated workspace, user documents).
   - HTML5 / File System Access API (`window.showDirectoryPicker()`) integration when supported by the browser.
   - Manual custom path entry with immediate validation.
4. **Accessible Modal Ergonomics**: Concentric border-radius, WCAG 2.2 AA contrast, keyboard accessibility (Escape to dismiss, Enter to confirm, focus restoration), and tactile micro-interactions (`active:scale-[0.98]`).
5. **Seamless Release Download Access**: When users want full native OS dialog pickers and local ADB device execution, direct access to download the v1.7.0 desktop host and historical versions is clearly provided.

---

## 2. BDD Acceptance Scenarios

### Scenario 1: Folder Picker Button is Clickable in Browser Mode
- **Given** the user is running the AutomatePlus browser migration shell.
- **When** the user clicks "Create project" in the left sidebar.
- **Then** the "Create project" dialog appears.
- **And** the folder icon button next to "Workspace path" is ENABLED and clickable.

### Scenario 2: Opening the Folder Picker UI Modal
- **Given** the "Create project" dialog is open.
- **When** the user clicks the folder icon button.
- **Then** the `FolderPickerModal` opens with title "Select Workspace Folder".
- **And** the user sees recommended workspace paths, a custom path input, and confirm/cancel controls.

### Scenario 3: Selecting a Workspace Preset
- **Given** the `FolderPickerModal` is open.
- **When** the user clicks a preset (e.g. `D:\SEMESTER12\ProjectKode\AutomatePlus\workspaces\default`).
- **Then** the custom path input updates with that preset path.
- **When** the user clicks "Select Folder".
- **Then** the modal closes, and "Workspace path" in the "Create project" form is populated with the selected path.

### Scenario 4: Direct OS Directory Selection Fallback
- **Given** the browser supports `window.showDirectoryPicker`.
- **When** the user clicks "Open OS Folder Dialog" in `FolderPickerModal`.
- **Then** the native browser directory picker is invoked.
- **And** upon directory selection, the directory path is captured and populated into the workspace path.

### Scenario 5: Access to App Downloads from Modal
- **Given** the `FolderPickerModal` is open.
- **When** the user clicks "Download App (v1.7.0)" inside the native capability prompt.
- **Then** the `ReleasesModal` opens displaying download links for v1.7.0 and historical versions.

---

## 3. Verification Gates

1. `npm test` -> 100% pass across all test suites.
2. `npm run lint` & `npm run format:check` -> zero errors.
3. `npm run typecheck` -> zero type errors.
4. `npm run build:desktop` -> Vite build succeeded without bundle issues.
5. Live verification via Playwright MCP:
   - Click "Create project" (+) in Sidebar.
   - Click folder button -> verify `FolderPickerModal` opens.
   - Select preset -> confirm selection -> verify "Workspace path" updated.
6. Git commit with `Co-Authored-By: GPT-5 <noreply@example.com>` and push to remote `main`.
