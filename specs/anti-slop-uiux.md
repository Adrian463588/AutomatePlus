# Precision Workbench UI/UX Contract

Status: active implementation contract

## Direction

AutomatePlus is a Windows desktop test workbench. Its visual hierarchy is content, typography, alignment, whitespace, interaction, state color, then decoration. The interface uses a dark neutral surface system with a restrained cyan/teal accent and amber, emerald, and rose semantic states.

The renderer does not use gradients, glassmorphism, decorative glow, oversized radii, decorative badges, or animation that does not communicate state. Existing controls are reused before new primitives are created.

## Functional bento layout

Bento is used as information architecture, not decoration:

- Runtime Manager uses one larger active-root/health anchor and compact catalog, verification, and policy regions.
- Device Farm uses the full workspace for the device pool and mirror/replay region; it does not reserve a generated-code column.
- Recorder and API Builder retain the generated-code column because it is part of their primary task.
- Each surface owns a bounded scroll container. The terminal is a sibling region below the workspace and must never overlap it.
- A surface may remain flat when grouping would add visual noise; not every section becomes a rounded card.

## Tokens

- Typography: `Segoe UI Variable`, `Segoe UI`, system fallback; `Cascadia Mono`, `Consolas`, monospace for code.
- Spacing: 4px base; allowed rhythm is 4, 8, 12, 16, 20, 24, 32, and 48px.
- Radius: 6px for controls, 10px for dialogs and primary work surfaces.
- Elevation: none by default; one restrained dialog shadow only.
- Colors are semantic CSS variables. Indigo/purple is not a default action color.

## Interaction

- Buttons, inputs, selects, tabs, and icon actions have a minimum 48px hit area.
- Disabled controls expose the missing prerequisite through `title` or `aria-describedby`.
- Dialogs move focus on open, trap Tab, close on Escape, and restore focus to the trigger.
- Loading indicators appear only while a real asynchronous operation is active.
- Progress values come from measured bytes or measured work; unknown totals remain indeterminate.
- Reduced motion removes decorative transitions while preserving visible state changes.

## Responsive acceptance

The renderer is verified at 390x844, 600x900, 768x1024, 840x1024, 1024x768, 1280x800, and 1440x900. Recorder/API views may use a generated-code pane. Runtime Manager and Device Farm use the full available workspace and never reserve an unused editor column.

## Truthfulness

Browser mode shows `Unavailable` or `Blocked` until native evidence exists. Runtime counts, devices, targets, progress, health, and run results are never seeded or fabricated. Fixtures remain component evidence and cannot promote native, real-target, or physical-device acceptance.

## Traceability

| Requirement | Module | Evidence |
|---|---|---|
| Responsive full-workspace layout | `frontend/src/App.tsx`, `frontend/src/index.css` | Playwright viewport matrix |
| Accessible shared controls | `frontend/src/index.css`, `frontend/src/components/common/UiPrimitives.tsx` | UI contract and keyboard audit |
| Truthful runtime states | Runtime Manager components and `desktopBridge` | runtime manager tests and native evidence |
| Native folder selection | Rust `native.dialog.pick` and bridge | Windows picker acceptance |
