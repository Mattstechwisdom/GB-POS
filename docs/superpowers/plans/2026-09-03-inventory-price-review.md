# Inventory Price Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check supplier costs in bulk, rank extracted candidates using staff feedback, and update inventory only after explicit editable approval.

**Architecture:** The existing part-page extractor emits scored price candidates rather than one opaque result. Shop-scoped supplier rules and item exceptions influence ranking; a resumable batch service feeds a review window, and an authenticated transaction applies an approved cost with an audit row.

**Tech Stack:** React/TypeScript, Electron/mobile adapters, existing part-order extraction, Supabase/Postgres.

**Spec:** `docs/superpowers/specs/2026-09-03-repair-tutorial-automatic-email-price-review-design.md`

## Global Constraints

- No detected price changes inventory without explicit staff approval.
- Approval updates acquisition/internal cost only, never retail price or markup.
- Login-required, blocked, unreachable, ambiguous, and failed pages do not become changes.
- Learning records contain selectors/fingerprints and outcomes, never supplier credentials or page contents.

---

### Task 1: Candidate extraction and learning model

**Files:**
- Modify: `src/lib/partOrdering.ts`
- Create: `src/lib/inventoryPriceReview.ts`
- Extend: `tools/test-distributor-url.cjs`
- Create: `tools/test-inventory-price-review.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `PriceCandidate { value, currency, sourceKind, selectorFingerprint, confidence, evidence }`.
- Produces: `rankPriceCandidates(candidates, rule, exception): RankedPriceCandidate[]`.
- Produces: `classifyPriceResult(previousCost, ranked): 'changed'|'unchanged'|'needs-review'|'login-required'|'failed'`.

- [ ] **Step 1: Add failing fixtures containing current/sale/list/member prices and assert the purchasable current cost ranks first.**
- [ ] **Step 2: Add failing tests for domain-rule boosts, item-exception precedence, suspicious percentage changes, login pages, and empty results.**
- [ ] **Step 3: Run both tests and verify RED.**
- [ ] **Step 4: Refactor the existing extractor to retain candidates/evidence while preserving `scrapePartUrl` compatibility for current callers.**
- [ ] **Step 5: Implement deterministic ranking and categorization; add `test:inventory-price-review`; run it and existing distributor/part persistence tests.**
- [ ] **Step 6: Commit with `git commit -m "feat: rank supplier cost candidates"`.**

### Task 2: Rules, exceptions, batches, and audit schema

**Files:**
- Create: CLI-generated migration under `supabase/migrations/`
- Create: `tools/test-inventory-price-schema.cjs`
- Modify: `src/mobile/mobile-api.ts`
- Modify: `app/electron/electron-main.ts`
- Modify: `app/electron/preload.ts`
- Modify: `src/global.d.ts`

**Interfaces:**
- Produces tables `inventory_price_rules`, `inventory_price_exceptions`, `inventory_price_check_runs`, `inventory_price_check_results`, `inventory_cost_change_audits`.
- Produces APIs `startInventoryPriceCheck(ids?)`, `getInventoryPriceCheckRun(runId)`, and `approveInventoryCostChange(resultId, approvedCost)`.

- [ ] **Step 1: Generate with `supabase migration new inventory_price_review`.**
- [ ] **Step 2: Write a failing contract test for shop keys, RLS, authenticated grants, run/result resumability, audit foreign keys, and atomic approval.**
- [ ] **Step 3: Run and verify RED.**
- [ ] **Step 4: Implement schema/RPCs deriving the active shop server-side; approval locks the result/item, records previous/detected/approved cost and staff, updates cost once, and stores correction feedback.**
- [ ] **Step 5: Implement bounded/rate-conscious adapter batches with per-item isolation and statuses; do not persist response bodies or credentials.**
- [ ] **Step 6: Run contract test, security/performance advisors, adapter typechecks, and inventory persistence tests.**
- [ ] **Step 7: Commit with `git commit -m "feat: add auditable inventory price checks"`.**

### Task 3: Inventory actions and review window

**Files:**
- Modify: `src/components/InventoryWindow.tsx`
- Create: `src/components/InventoryPriceReviewWindow.tsx`
- Modify: `src/main.tsx`
- Modify: `src/mobile/MobileApp.tsx`
- Create: `tools/test-inventory-price-review-ui.cjs`

**Interfaces:**
- Consumes: price-check APIs from Task 2.

- [ ] **Step 1: Write failing UI tests for primary Check All, conditional Check Selected, per-item Check Price, progress/resume, five result categories, and review columns/actions.**
- [ ] **Step 2: Assert proposed cost is an editable prefilled field; edited approval submits both detected and approved values; retail/markup fields are absent from mutation payloads.**
- [ ] **Step 3: Run and verify RED.**
- [ ] **Step 4: Implement toolbar/selection behavior and a responsive review surface with previous/proposed cost, difference, confidence warning, Open Part URL, Approve, and Skip.**
- [ ] **Step 5: Run focused UI tests, inventory navigation/layout tests, full typecheck, and desktop/mobile builds.**
- [ ] **Step 6: Commit with `git commit -m "feat: review supplier cost changes"`.**

### Task 4: Integrated verification and release

**Files:**
- Modify: `CHANGELOG.md`
- Create: `tools/release-notes/v0.6.57.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes all three plans and produces the next tagged GB POS release.

- [ ] **Step 1: Apply migrations to a non-production environment and run Supabase security/performance advisors.**
- [ ] **Step 2: Run all new focused tests plus existing repair catalog, client update, checkout, consultation, inventory persistence/navigation, desktop/mobile navigation, and update tests.**
- [ ] **Step 3: Run `npm run typecheck`, `npm run build`, `npm run build:mobile`, and `npm run electron:buildmain`; require exit code 0.**
- [ ] **Step 4: Perform desktop/mobile smoke checks for tutorial playback, each email preview/history state, Check All/Selected/one-item review, edited approval, and failure isolation.**
- [ ] **Step 5: Confirm `v0.6.57` remains unused with `git ls-remote --tags origin refs/tags/v0.6.57`, update version/changelog/notes to `0.6.57`, commit, create the annotated `v0.6.57` tag, and push branch plus tag. Stop and choose the next unused patch version if that tag has appeared.**
- [ ] **Step 6: Monitor GitHub Actions through completion and run `npm run verify:update-feed`; confirm Windows installer, Android APK, PDF, blockmap, and `latest.yml` assets exist before reporting release completion.**
