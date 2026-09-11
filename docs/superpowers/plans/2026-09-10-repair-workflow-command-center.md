# Repair Workflow and Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every repair QR action atomically drive work-order lifecycle, queues, attention rules, client replies, reporting, and synchronization.

**Architecture:** A shared pure workflow reducer defines projections for every action. A Supabase RPC atomically inserts an idempotent event and updates its work order; the Edge Function invokes it and separately queues client delivery. Desktop/mobile consume the authoritative result, while the Command Center derives views from explicit lifecycle fields.

**Tech Stack:** React 18, TypeScript, Electron, Supabase/Postgres, Deno Edge Functions, Node assertion tests.

**Spec:** `docs/superpowers/specs/2026-09-10-repair-workflow-command-center-design.md`

## Global Constraints

- Existing check-in, checkout, payments, financial reporting, QR URLs, and manual work-order editing remain available.
- Staff QR workflows require authentication; public email response pages expose only allowlisted customer-facing data.
- Workflow actions never add payments or storage fees without explicit staff approval.
- New writes are idempotent and state/event writes commit together.
- Desktop and mobile must expose equivalent action behavior.

---

### Task 1: Shared workflow contract

**Files:**
- Create: `src/lib/repairWorkflow.ts`
- Modify: `src/lib/clientUpdateOptions.ts`
- Test: `tools/test-repair-workflow-contract.cjs`

**Interfaces:**
- Produces: `applyRepairWorkflowAction(record, action, input, now): { patch, event }`
- Produces: `repairWorkflowDefinition(action): { audience, stage, sendsClientMessage }`

- [ ] **Step 1: Write the failing test** covering every current `REPAIR_UPDATE_OPTIONS` key, expected stage, timestamps, item delivery, promises, pickup, and idempotency key.
- [ ] **Step 2: Run `node tools/test-repair-workflow-contract.cjs`** and confirm failure because `repairWorkflow.ts` does not exist.
- [ ] **Step 3: Implement the reducer** with an exhaustive action map and no display-string inference.
- [ ] **Step 4: Run `node tools/test-repair-workflow-contract.cjs` and `node tools/test-repair-qr-workflow-actions.cjs`** and confirm both pass.
- [ ] **Step 5: Commit** `feat: define repair workflow action contract`.

### Task 2: Atomic Supabase workflow persistence

**Files:**
- Create: `supabase/migrations/20260910190000_repair_workflow_events.sql`
- Modify: `supabase/functions/client-updates/index.ts`
- Test: `tools/test-repair-workflow-schema.cjs`

**Interfaces:**
- Produces table `repair_workflow_events` with unique `(shop_id, idempotency_key)`.
- Produces RPC `apply_repair_workflow_event(p_shop_id uuid, p_work_order_id uuid, p_action text, p_payload jsonb, p_idempotency_key text, p_actor_user_id uuid)`.

- [ ] **Step 1: Write the failing schema test** asserting table/RLS/index/RPC, transaction-local event insertion, allowed action validation, and work-order projection fields.
- [ ] **Step 2: Run `node tools/test-repair-workflow-schema.cjs`** and confirm missing migration failure.
- [ ] **Step 3: Add schema and RPC** including stage, lifecycle timestamps, promises, ETA, client decision, and sync metadata.
- [ ] **Step 4: Refactor `client-updates`** to invoke the RPC before its outbox delivery and return the authoritative event/work order.
- [ ] **Step 5: Run schema, QR action, and Supabase client-update tests** and confirm pass.
- [ ] **Step 6: Commit** `feat: persist repair workflow events atomically`.

### Task 3: Client interaction and replies

**Files:**
- Modify: `supabase/migrations/20260910190000_repair_workflow_events.sql`
- Modify: `supabase/functions/client-response/index.ts`
- Modify: `supabase/functions/client-updates/index.ts`
- Modify: `src/components/ClientRepliesPanel.tsx`
- Test: `tools/test-client-response-workflow.cjs`

**Interfaces:**
- Produces response choices `approve`, `decline`, `question`, `confirm_pickup`, `request_pickup_change`, `add_information`.
- Produces staff operations `acknowledge`, `reply`, `resolve`, `unresolve`.

- [ ] **Step 1: Expand the failing response test** to assert scoped token actions, unread/unresolved state, conversation threading, reply delivery, and no public POS fields.
- [ ] **Step 2: Run the test** and confirm it fails on the missing response types and inbox operations.
- [ ] **Step 3: Implement response persistence and public forms** using hashed expiring tokens and server-side field allowlists.
- [ ] **Step 4: Implement inbox hover/focus preview and context menu/long-press operations** while retaining existing work-order opening behavior.
- [ ] **Step 5: Run response and client-update tests** and confirm pass.
- [ ] **Step 6: Commit** `feat: connect client interactions to repair workflow`.

### Task 4: Command Center projections

**Files:**
- Modify: `src/lib/commandCenter.ts`
- Modify: `src/lib/workOrderLifecycle.ts`
- Modify: `src/components/CommandCenter.tsx`
- Test: `tools/test-command-center-workflow.cjs`

**Interfaces:**
- Consumes explicit `workflowStage`, `partEta`, `promisedAt`, `lastTechnicianActivityAt`, `pickupReadyAt`, and client response flags.
- Produces queue rows and typed attention reasons with direct action identifiers.

- [ ] **Step 1: Write failing table tests** for every stage, future ETA exclusion, overdue ETA inclusion, all-parts-delivered inclusion, expedited-first ordering, due promises, unread replies, email failure, and pickup/storage timers.
- [ ] **Step 2: Run the test** and confirm existing display-string inference fails the cases.
- [ ] **Step 3: Replace loose stage matching with explicit projections** while preserving a legacy fallback for old tickets.
- [ ] **Step 4: Connect Client Replies and Needs Attention cards** to actual records and direct fixes.
- [ ] **Step 5: Run Command Center, lifecycle, presentation, and repair-details tests** and confirm pass.
- [ ] **Step 6: Commit** `feat: derive command center from repair workflow`.

### Task 5: Immediate multi-window and multi-device refresh

**Files:**
- Modify: `src/workorders/ClientUpdatePanel.tsx`
- Modify: `src/main.tsx`
- Modify: `src/lib/db.ts`
- Test: `tools/test-workflow-live-refresh.cjs`

**Interfaces:**
- Produces browser event `gbpos:work-order-updated` with authoritative record identity.
- Consumes Supabase Realtime changes for workflow events and work orders.

- [ ] **Step 1: Write the failing refresh test** asserting authoritative local replacement, open-list event dispatch, and realtime reconciliation.
- [ ] **Step 2: Run the test** and confirm daughter lists remain stale under current behavior.
- [ ] **Step 3: Persist and broadcast the authoritative response** and refresh affected open views without reloading the whole POS.
- [ ] **Step 4: Run refresh, cloud identity, item sync, and immediate-persistence tests** and confirm pass.
- [ ] **Step 5: Commit** `fix: synchronize repair workflow across open views`.

### Task 6: Workflow reporting and regression verification

**Files:**
- Create: `src/lib/repairWorkflowReporting.ts`
- Modify: `src/lib/reportingAccounting.ts`
- Modify: `src/components/ReportingWindow.tsx`
- Test: `tools/test-repair-workflow-reporting.cjs`

**Interfaces:**
- Produces durations for diagnosis, approval, part wait, bench work, testing, pickup, response, and promise performance.

- [ ] **Step 1: Write failing reporting tests** using fixed event timelines and assert no financial totals derive from workflow events.
- [ ] **Step 2: Run the test** and confirm missing reporting adapter failure.
- [ ] **Step 3: Implement pure duration aggregation** and expose it through the existing report data model.
- [ ] **Step 4: Run reporting and accounting suites** and confirm pass.
- [ ] **Step 5: Commit** `feat: report repair workflow timing`.

### Task 7: Windows updater and release

**Files:**
- Modify: `app/electron/electron-main.ts`
- Modify: `electron-builder.yml`
- Modify: `tools/test-windows-update-install.cjs`
- Modify: `package.json`
- Create: `tools/release-notes/v0.6.77.md`

**Interfaces:**
- Uses `autoUpdater.quitAndInstall(true, true)` without a PowerShell wrapper.
- Persists updater diagnostics through `createAutoUpdateLogger()`.

- [ ] **Step 1: Keep the already-observed failing updater regression test** proving the wrapper and force-exit path are rejected.
- [ ] **Step 2: Complete the native updater implementation** and configure NSIS so update mode has no custom page or interactive installer dependency.
- [ ] **Step 3: Build the per-user Windows installer** and install the prior version in a controlled test location.
- [ ] **Step 4: Exercise prior-version download → silent install → relaunch** and verify installed version, application files, and updater log.
- [ ] **Step 5: Run typechecks and all targeted workflow/updater/UI/accounting tests** with zero failures.
- [ ] **Step 6: Bump to `0.6.77`, build Windows and Android artifacts, verify update feed hashes, publish the GitHub release, and verify every asset is present remotely.**
- [ ] **Step 7: Commit** `release: v0.6.77`.
