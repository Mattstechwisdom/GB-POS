# Command Center Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a seven-ticket prioritized repair queue, actionable exception inbox, repair analytics, product delivery workflow, and acknowledged checkout completion.

**Architecture:** Extend pure projection/lifecycle modules so ranking, statistics, and attention triggers remain deterministic and testable. Keep Supabase writes on the existing authenticated client-updates boundary and introduce a small window-scoped checkout session registry for reliable Electron acknowledgement.

**Tech Stack:** React, TypeScript, Electron IPC, Supabase Edge Functions/Postgres, Node regression scripts.

**Spec:** `docs/superpowers/specs/2026-09-11-command-center-operations-design.md`

## Global Constraints

- Preserve all existing work-order, sale, consultation, payment, inventory, and QR behavior.
- Never show closed or pickup-ready work in the actionable repair queue.
- The compact repair queue contains at most seven records.
- Product delivery writes require the authenticated existing Edge Function.
- Publish through the tag-driven workflow so exactly one signed universal APK is attached.

---

### Task 1: Attention projection and settings

**Files:** Modify `src/lib/workOrderLifecycle.ts`, `src/lib/commandCenter.ts`, `src/components/CatalogSettingsWindow.tsx`, `src/components/CommandCenter.tsx`; test `tools/test-work-order-lifecycle.cjs`, `tools/test-command-center-workflow.cjs`.

**Interfaces:** Extend `CleanupSettings`; produce `CommandCenterModel.needsAttention` and per-record `attentionReasons`.

- [ ] Write assertions for not-started, stalled, update-without-follow-up, future-ETA suppression, malformed sales, and unscheduled consultations.
- [ ] Run the lifecycle and Command Center tests and confirm the new assertions fail.
- [ ] Implement normalized settings, lifecycle reasons, record validation, and reason display.
- [ ] Run both tests and confirm they pass.

### Task 2: Acknowledged checkout completion

**Files:** Create `src/lib/checkoutDelivery.ts`, `app/electron/checkout-session.ts`; modify `src/workorders/CheckoutWindow.tsx`, `app/electron/preload.ts`, `app/electron/electron-main.ts`; test `tools/test-checkout-delivery.cjs`.

**Interfaces:** `deliverCheckoutResult(api, result): Promise<void>` and `createCheckoutSessionRegistry()`.

- [ ] Write delivery acknowledgement, rejection, missing-bridge, and single-completion assertions.
- [ ] Run the checkout-delivery test and confirm missing modules fail.
- [ ] Implement the renderer acknowledgement helper and main-process session registry.
- [ ] Connect preload, CheckoutWindow processing/error state, and Electron handlers.
- [ ] Run checkout completion, layout, work-order, sale, and quick-checkout tests.

### Task 3: Queue ranking and learned statistics

**Files:** Create `src/lib/repairStatistics.ts`; modify `src/lib/commandCenter.ts`, `src/lib/commandCenterPresentation.ts`, `src/components/CommandCenter.tsx`; test `tools/test-command-center-workflow.cjs`, `tools/test-command-center-repair-details.cjs`, `tools/test-repair-statistics.cjs`.

**Interfaces:** `buildRepairStatistics(workOrders)` returns counts, turnaround metrics, common repairs, and quick patterns; queue records expose priority metadata.

- [ ] Add literal fixtures covering all five priority tiers and seven-record cycling.
- [ ] Run tests and confirm the current ordering/limit fail.
- [ ] Extract shared repair-pattern statistics and implement the requested comparator.
- [ ] Add a responsive Repair Statistics daughter panel.
- [ ] Run statistics and Command Center tests.

### Task 4: Product Delivery

**Files:** Create `src/lib/productDelivery.ts`; modify `src/lib/commandCenter.ts`, `src/components/CommandCenter.tsx`; test `tools/test-product-delivery.cjs`.

**Interfaces:** `orderedUndeliveredItemIndexes(record): number[]`; Command Center exposes product-delivery records.

- [ ] Add fixtures distinguishing ordered products/parts from labor and delivered lines.
- [ ] Run the product-delivery test and confirm it fails.
- [ ] Implement delivery projection and add the Command Center section/panel.
- [ ] Wire Mark Delivered to `client-updates` with the exact indexes and refresh sales state.
- [ ] Run product-delivery, order-accounting, inventory, and Command Center tests.

### Task 5: Release verification and publication

**Files:** Modify `package.json`, `package-lock.json`, `CHANGELOG.md`; add release notes under `tools/release-notes/`.

**Interfaces:** New semantic patch version and GitHub release assets.

- [ ] Run all targeted regression scripts and `npm run typecheck`.
- [ ] Run `npm run build` and updater regression tests.
- [ ] Review `git diff --check` and the scoped release diff.
- [ ] Commit, push, tag, and wait for the release workflow.
- [ ] Verify the Windows installer, update metadata, and exactly one signed universal APK.
