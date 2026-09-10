# Production Window Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every GB POS production workflow intact while making embedded windows readable, responsive, and visually faithful to the approved Command Center preview.

**Architecture:** Existing React components and IPC handlers remain authoritative. The modal shell supplies named size profiles and responsive containment; route auditing proves that visible shell actions still reach their real production windows.

**Tech Stack:** React, TypeScript, Electron, CSS, Node assertion tests, Vite, electron-builder

**Spec:** `docs/superpowers/specs/2026-09-09-production-window-fidelity-design.md`

## Global Constraints

- Do not replace production windows with preview-only markup.
- Do not remove existing business fields, handlers, checkout logic, synchronization, printing, or data persistence.
- Embedded controls must wrap or resize without horizontal page overflow.
- Mobile All Invoices must use readable stacked records rather than horizontal table scrolling.
- Pop-out is optional, not required for readability.
- Release as v0.6.65 only after fresh verification.

---

### Task 1: Window route contract

**Files:**
- Create: `tools/test-production-window-fidelity.cjs`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `API_TO_MODAL`, `ModalContent`, `ModalShell`
- Produces: `data-modal-type` and `gb-window-profile-*` hooks

- [ ] Write assertions that every mapped modal type has a `ModalContent` case and every daughter receives its type/profile hook.
- [ ] Run `node tools/test-production-window-fidelity.cjs` and confirm failure before the hooks exist.
- [ ] Add type/profile metadata without changing component routing.
- [ ] Run the test and confirm it passes.

### Task 2: Responsive daughter sizing

**Files:**
- Modify: `src/styles/desktop-nav-preview.css`
- Test: `tools/test-production-window-fidelity.cjs`

**Interfaces:**
- Consumes: `data-modal-type`, `gb-window-profile-*`
- Produces: wide, standard, and compact responsive daughter layouts

- [ ] Add failing assertions for wide calendar, dense-tool, compact-tool, tablet, and phone rules.
- [ ] Run the fidelity test and confirm the expected CSS failure.
- [ ] Add the profile CSS, toolbar wrapping, minimum control sizes, and overflow containment.
- [ ] Re-run the fidelity test and typecheck.

### Task 3: Calendar embedded readability

**Files:**
- Modify: `src/styles/desktop-nav-preview.css`
- Test: `tools/test-production-window-fidelity.cjs`

**Interfaces:**
- Consumes: calendar modal profile and existing CalendarWindow class names
- Produces: readable embedded month grid without requiring pop-out

- [ ] Assert the calendar profile uses near-viewport width/height and responsive cell sizing.
- [ ] Confirm the assertion fails.
- [ ] Add scoped calendar layout rules that preserve seven columns on desktop and permit internal calendar scrolling instead of compressing controls.
- [ ] Confirm the assertion and calendar navigation tests pass.

### Task 4: Regression and release

**Files:**
- Modify: `CHANGELOG.md`, `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: verified production tree
- Produces: v0.6.65 Windows and Android release assets

- [ ] Run Command Center, inventory, navigation, modal-route, calendar, record-type, and updater tests.
- [ ] Run TypeScript checks and desktop/mobile production builds.
- [ ] Build the Windows installer and Android APK.
- [ ] Commit only production source, tests, changelog, spec, and plan.
- [ ] Push the approved commit, publish v0.6.65 assets, and verify the live updater feed.
