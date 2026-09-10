# Repair Queue Device Labels and QR Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show device-first repair information throughout Command Center work-order views and expose the approved repair workflow actions on every active shared QR page.

**Architecture:** Extend the Command Center record model with explicit device and problem fields derived from the work-order header, then render those fields through one reusable hover-detail component. Extend the existing shared `ClientUpdatePanel` action contract and the `client-updates` Edge Function together, keeping QR token generation unchanged so existing active printed codes receive the new page behavior.

**Tech Stack:** React 18, TypeScript, Electron/Vite, Supabase Edge Functions, Node regression scripts.

**Spec:** Approved conversation design from 2026-09-10.

## Global Constraints

- Keep existing QR token URLs and token lookup compatible.
- Technician Progress is internal-only and must not email or text the client.
- Testing In Progress is customer-facing and updates the repair stage.
- Device-first labels apply to Repair Queue, Active Work Orders, Checked In, and related work-order daughter lists.
- Preserve all unrelated local and untracked files.

---

### Task 1: Device-first Command Center work-order records

**Files:**
- Modify: `src/lib/commandCenter.ts`
- Modify: `src/components/CommandCenter.tsx`
- Create: `src/components/CommandCenterRecordHoverCard.tsx`
- Test: `tools/test-command-center-repair-details.cjs`

**Interfaces:**
- Consumes: work-order `productCategory`, `productDescription`, `model`, `serial`, and `problemInfo`.
- Produces: `CommandCenterRecord.deviceLabel`, `problem`, `model`, `serial`, and a hover card used by compact rows and daughter tables.

- [ ] **Step 1: Write the failing regression test**

Assert that work orders derive `deviceLabel` from header fields rather than item repair titles, include `problemInfo` in search, and that queue/panel work-order cells render device-first text through the full-detail hover component.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/test-command-center-repair-details.cjs`

Expected: FAIL because the explicit device/problem model and hover component do not exist.

- [ ] **Step 3: Implement the minimal model and presentation**

Add device/problem fields with fallbacks for legacy tickets; render device, then `Client · Problem…`, then `WO # · age`; reuse the same fields in Active Work Orders, Checked In, and daughter tables.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/test-command-center-repair-details.cjs`

Expected: PASS.

### Task 2: Real QR repair workflow actions

**Files:**
- Create: `src/lib/clientUpdateOptions.ts`
- Modify: `src/workorders/ClientUpdatePanel.tsx`
- Modify: `supabase/functions/client-updates/index.ts`
- Test: `tools/test-repair-qr-workflow-actions.cjs`

**Interfaces:**
- Produces repair actions `repair_approval`, `customer_promise`, `technician_progress`, and `testing_in_progress`.
- Sends customer-facing actions through the existing Edge Function; saves technician progress locally/cloud-side without delivery.

- [ ] **Step 1: Write the failing regression test**

Assert the shared QR panel exposes all four actions, the Edge Function accepts the three customer/status actions, and Technician Progress follows a save-only path with `preserveTechNotes` behavior and no email/text delivery.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/test-repair-qr-workflow-actions.cjs`

Expected: FAIL because the action definitions and internal-only branch are absent.

- [ ] **Step 3: Implement the minimal workflow**

Add structured detail inputs for approval, promises, technician notes, and testing. Persist progress notes internally; send appropriate client copy for approval, promises, and testing while updating repair stages.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/test-repair-qr-workflow-actions.cjs`

Expected: PASS.

### Task 3: Version, verification, and release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tools/release-notes/v0.6.71.md`

**Interfaces:**
- Produces: signed/publishable Windows update assets and GitHub release `v0.6.71`.

- [ ] **Step 1: Bump version and write release notes**

Set the application version to `0.6.71` and document device-first queue labels, hover details, and shared QR workflow actions.

- [ ] **Step 2: Run focused and existing regression tests**

Run both new tests plus Command Center, client-update, mobile, update, typecheck, and production build checks.

- [ ] **Step 3: Build installer artifacts and verify the update feed**

Run `npm run dist` followed by `npm run verify:update-feed` and confirm the expected `0.6.71` files exist.

- [ ] **Step 4: Commit, push, deploy Edge Function, and publish**

Commit only scoped files, push the current branch/tag, deploy `client-updates`, and publish `v0.6.71` assets to `Mattstechwisdom/GB-POS`.

