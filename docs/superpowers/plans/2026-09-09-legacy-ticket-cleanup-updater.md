# Legacy Ticket Cleanup and Updater Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add synchronized, configurable legacy-ticket cleanup and attention rules, normalize technician identity everywhere, and make Windows updates recover from locked or privileged older installations.

**Architecture:** Pure helpers classify tickets and technician identities; a local-first reconciliation service applies idempotent work-order patches through the existing database and Supabase queue. Existing Catalog Settings hosts the synchronized policy editor, while desktop/mobile startup invoke the same service. The updater performs a complete shutdown and hands off to an assisted, elevation-capable NSIS installer with a manual-download fallback.

**Tech Stack:** React, TypeScript, Electron, electron-updater, electron-builder/NSIS, Capacitor, local JSON persistence, Supabase synchronization.

**Spec:** `docs/superpowers/specs/2026-09-09-legacy-ticket-cleanup-updater-design.md`

## Global Constraints

- Default diagnostic-only cleanup age is 20 days.
- Default universal cleanup age is 30 days and cannot be lower than the diagnostic-only age.
- Cleanup changes status and audit metadata only; it never creates payments, checkout dates, pickup dates, receipts, or customer emails.
- Repair Not Possible remains open until pickup except when the configured universal legacy-age rule applies.
- Every change uses the existing local-first persistence and Supabase synchronization path.
- Never display raw technician UUIDs or opaque identifiers.
- Installer changes must preserve user data and `deleteAppDataOnUninstall: false`.

---

### Task 1: Pure ticket policy and technician identity helpers

**Files:**
- Create: `src/lib/workOrderLifecycle.ts`
- Create: `src/lib/technicianIdentity.ts`
- Test: `tools/test-work-order-lifecycle.cjs`
- Test: `tools/test-technician-identity.cjs`

**Interfaces:**
- Produces: `normalizeCleanupSettings(value)`, `classifyLegacyCleanup(workOrder, settings, now)`, `buildLegacyClosePatch(classification, now)`, `attentionReasonsForWorkOrder(workOrder, context)`, `buildTechnicianIndex(technicians)`, and `resolveTechnician(value, index)`.

- [ ] Write failing tests proving the 20/30-day boundaries, check-in-date anchoring, diagnostic-only definition, not-repairable pickup behavior, audit idempotency, unchanged financial fields, and all technician aliases.
- [ ] Run `node tools/test-work-order-lifecycle.cjs` and `node tools/test-technician-identity.cjs`; confirm failures because the modules do not exist.
- [ ] Implement the pure helpers with defaults `{ enabled: true, diagnosticOnlyDays: 20, closeAllDays: 30, notRepairableAttentionDays: 1 }` and resolver results `{ state: 'resolved'|'unassigned'|'unknown', name, technician? }`.
- [ ] Re-run both tests and confirm they pass.
- [ ] Commit the helpers and tests.

### Task 2: Local-first cleanup reconciliation and synchronized settings UI

**Files:**
- Create: `src/lib/workOrderCleanup.ts`
- Modify: `src/components/CatalogSettingsWindow.tsx`
- Modify: `src/App.tsx`
- Modify: `src/mobile/MobileApp.tsx`
- Test: `tools/test-work-order-cleanup.cjs`
- Test: `tools/test-ticket-cleanup-settings-ui.cjs`

**Interfaces:**
- Consumes: Task 1 lifecycle helpers.
- Produces: `previewWorkOrderCleanup(workOrders, settings, now)` and `reconcileLegacyWorkOrders(api, options)` returning `{ scanned, diagnosticOnly, universal, updated, skipped, errors }`.

- [ ] Write failing tests with an in-memory API proving preview counts, one `dbUpdate('workOrders', id, patch)` per eligible record, no repeat update after audit metadata, and settings fields rendered in Catalog Settings.
- [ ] Run both tests and confirm the missing service/UI failures.
- [ ] Implement the reconciliation service and a **Ticket Cleanup & Attention** settings pane with enable switch, three numeric day fields, preview counts, Save, and Run Cleanup Now.
- [ ] Invoke reconciliation after authoritative settings/work-order load in desktop and mobile, and subscribe to settings/work-order change events without creating an update loop.
- [ ] Re-run the focused tests and typecheck.
- [ ] Commit the cleanup service and settings UI.

### Task 3: Command Center, Open Tickets, and not-repairable attention behavior

**Files:**
- Modify: `src/lib/commandCenter.ts`
- Modify: `src/components/CommandCenter.tsx`
- Modify: `src/components/WorkOrdersTable.tsx`
- Modify: `src/App.tsx`
- Modify: `src/mobile/MobileApp.tsx`
- Modify: `src/workorders/ClientUpdatePanel.tsx`
- Test: `tools/test-command-center-model.cjs`
- Test: `tools/test-not-repairable-lifecycle.cjs`

**Interfaces:**
- Consumes: Task 1 lifecycle and technician helpers.

- [ ] Extend failing tests to show closed legacy records excluded from active/open views, Repair Not Possible retained before pickup, pickup-but-open flagged, and unresolved technicians reported without raw IDs.
- [ ] Run focused tests and confirm failure.
- [ ] Replace duplicated technician lookup logic with the shared resolver and add structured Needs Attention reasons/Fix routing.
- [ ] Make the pickup action close Repair Not Possible without changing payments; preserve the universal legacy cleanup exception.
- [ ] Re-run command-center, lifecycle, work-order, mobile-navigation, and typecheck tests.
- [ ] Commit attention and technician integration.

### Task 4: Assisted Windows updater and recovery path

**Files:**
- Modify: `app/electron/electron-main.ts`
- Modify: `electron-builder.yml`
- Modify: `build/installer-options.nsh`
- Modify: `tools/test-windows-update-install.cjs`
- Test: `tools/test-auto-update-relaunch.cjs`

**Interfaces:**
- Produces: assisted `quitAndInstall(false, true)` handoff after full resource shutdown and a manual installer-download recovery action in the updater UI.

- [ ] Change updater tests first to require assisted installation, elevation helper packaging, updater/main-window shutdown ordering, and the recovery button.
- [ ] Run updater tests and confirm they fail against silent/non-elevating v0.6.65 behavior.
- [ ] Enable elevation fallback while retaining per-user scope; close all application windows/resources before handoff; add durable handoff logging and an Open Download Page recovery button.
- [ ] Run updater tests and build the Electron main process.
- [ ] Commit the updater recovery change.

### Task 5: Full verification and release

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `release-notes-0.6.66.md`

**Interfaces:**
- Consumes: all earlier tasks.

- [ ] Bump the app to `0.6.66` and document cleanup defaults, settings, attention behavior, technician normalization, and updater recovery.
- [ ] Run focused lifecycle, settings, Command Center, technician, updater, synchronization, checkout/email, TypeScript, and 39-window portrait/landscape tests.
- [ ] Build `npm run dist` and `npm run android:apk`; verify Windows installer, blockmap, `latest.yml`, instructions PDF, and universal APK.
- [ ] Commit the release, push the approved branch, publish GitHub release `v0.6.66`, and run `node tools/verify-update-feed.cjs`.
