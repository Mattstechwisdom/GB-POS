# Client Replies and Pickup Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add synchronized approval replies, pickup scheduling and closure, automatic reminders, and technician-approved storage-fee review.

**Architecture:** Pure lifecycle helpers calculate deadlines and suggested fees. Supabase stores public response tokens and replies, an Edge Function accepts signed public responses, and the existing client-update function embeds response links. Command Center queries unresolved replies and reconciles pickup reminders while work-order actions update both local and cloud records through existing synchronization.

**Tech Stack:** React, TypeScript, Electron/Capacitor, Supabase Postgres/RLS/Edge Functions, Node assertion tests.

**Spec:** `docs/superpowers/specs/2026-09-10-client-replies-and-pickup-lifecycle-design.md`

## Global Constraints

- Storage fee is $25/day beginning on day 8 and is never automatically applied.
- Day-8 reminders are idempotent; day-12 review appears in Needs Attention.
- Scheduled pickup replaces the ordinary grace deadline.
- Picked Up / Close Ticket creates no payment.
- Existing tickets receive no bulk migration.
- Public response authorization must not reuse staff QR authorization.

---

### Task 1: Lifecycle rules

**Files:**
- Modify: `src/lib/workOrderLifecycle.ts`
- Test: `tools/test-work-order-lifecycle.cjs`

**Interfaces:**
- Produces: `pickupLifecycleFor(workOrder, now)`, `buildPickedUpPatch(workOrder, actor, now)`, and storage-fee suggestion data.

- [ ] Add failing assertions for day 8, day 12, scheduled pickup, collected tickets, positive balances, and $25/day calculation.
- [ ] Run `node tools/test-work-order-lifecycle.cjs` and confirm failure.
- [ ] Implement the pure lifecycle helpers and closure patch.
- [ ] Run the lifecycle test and confirm pass.

### Task 2: Response database and public endpoint

**Files:**
- Create: `supabase/migrations/<generated>_client_replies_and_pickup_lifecycle.sql`
- Create: `supabase/functions/client-response/index.ts`
- Test: `tools/test-client-response-workflow.cjs`

**Interfaces:**
- Produces: `client_response_tokens`, `client_responses`, work-order pickup fields, and public actions `view`, `approve`, `decline`, `question`.

- [ ] Add a failing structural test for hashed tokens, RLS, response fields, idempotency, and safe status transitions.
- [ ] Generate the migration with Supabase CLI and add tables, indexes, grants, policies, and pickup columns.
- [ ] Implement the public HTML/POST Edge Function with token hashing and escaped output.
- [ ] Run the structural test and confirm pass.

### Task 3: Approval email links

**Files:**
- Modify: `supabase/functions/client-updates/index.ts`
- Modify: `tools/test-repair-qr-workflow-actions.cjs`

**Interfaces:**
- Consumes: public response token table and endpoint.
- Produces: approval emails containing Approve, Decline, and Ask a Question actions.

- [ ] Add failing assertions for all three approval-email buttons and non-staff token generation.
- [ ] Create/reuse an expiring response token when `repair_approval` is sent and append styled links to HTML/text.
- [ ] Run QR workflow and client-update API tests.

### Task 4: Command Center replies and pickup attention

**Files:**
- Modify: `src/components/CommandCenter.tsx`
- Modify: `src/styles/command-center.css`
- Modify: `src/lib/commandCenter.ts`
- Test: `tools/test-command-center-repair-details.cjs`

**Interfaces:**
- Consumes: authenticated `client_responses` rows and `pickupLifecycleFor`.
- Produces: compact Client Replies, View All, acknowledgement, Needs Attention integration, and reminder reconciliation.

- [ ] Add failing assertions for reply fields, unresolved filtering, pickup attention, and reminder deduplication.
- [ ] Query replies under RLS, subscribe/refetch on change, and render the five newest unresolved responses.
- [ ] Add reply acknowledgement/open-work-order actions and question attention reasons.
- [ ] Reconcile one day-8 pickup reminder through the existing client-update delivery path.
- [ ] Run Command Center and mobile tests.

### Task 5: Work-order pickup actions

**Files:**
- Modify: `src/workorders/ClientUpdatePanel.tsx`
- Modify: `src/workorders/NewWorkOrderWindow.tsx`
- Modify: `src/lib/clientUpdateOptions.ts`
- Modify: `supabase/functions/client-updates/index.ts`
- Test: `tools/test-repair-qr-workflow-actions.cjs`

**Interfaces:**
- Produces: Schedule Pickup, Picked Up / Close Ticket, and Approve Storage Fee actions.

- [ ] Add failing tests for action labels, balance protection, no-payment closure, pickup timestamps, and scheduled pickup timestamps.
- [ ] Add Schedule Pickup date/time UI and status patch.
- [ ] Add Picked Up / Close Ticket with balance warning and manager override boundary.
- [ ] Add storage-fee review that inserts a clearly labeled non-taxed line only after confirmation.
- [ ] Run workflow, checkout, accounting, and mobile tests.

### Task 6: Deploy, package, and release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tools/release-notes/v0.6.72.md`

**Interfaces:**
- Produces: deployed migration/functions, Windows installer, blockmap/feed, Android APK, tag, and GitHub release.

- [ ] Run focused tests, `npm run typecheck`, `npm run build`, and `npm run build:mobile`.
- [ ] Apply migration and deploy `client-response` plus updated `client-updates`.
- [ ] Increment version to 0.6.72 and build installer/APK.
- [ ] Verify update feed and release assets.
- [ ] Commit, push branch/tag, publish GitHub release, and verify Pages workflow.
