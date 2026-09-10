# Customer Data Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep customer search, duplicate detection, work-order/sale links, invoice loading, integrity audits, and recoverable backups consistent across desktop, mobile, web, and Supabase.

**Architecture:** A shared pure identity module defines normalization, matching, canonical selection, and display fallback rules. Supabase stores canonical UUID relationships plus legacy compatibility aliases and auditable reconciliation runs; desktop and mobile adapters expose narrow direct-record and integrity APIs instead of forcing screens to scan whole collections. The UI consumes those APIs for search, duplicate review, EOD names, invoice loading, and Admin integrity controls.

**Tech Stack:** React 18, TypeScript 5.9, Electron 29, Capacitor 8, `@supabase/supabase-js` 2.110, PostgreSQL 17/Supabase, Node assertion-based regression scripts.

**Spec:** `docs/superpowers/specs/2026-09-03-customer-data-integrity-design.md`

## Global Constraints

- Supabase `customers.id` UUID is canonical; numeric `legacy_id` remains supported and unique per shop.
- Every match, query, merge, and relationship update is scoped by `shop_id`.
- Exact normalized phone or email may auto-merge; name-only and conflicting matches require review.
- Transaction snapshots are preserved and valid transactions never open as blank forms.
- Automatic processing never hard-deletes customer records.
- A verified backup and reviewed dry-run are mandatory before production relationship mutation.
- RLS remains enabled; privileged mutations run through authenticated, shop-scoped database functions.
- Preserve unrelated working-tree changes and generated artifacts.

---

### Task 1: Shared customer identity rules

**Files:**
- Modify: `src/lib/customerDuplicates.ts`
- Create: `tools/test-customer-identity.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeCustomerPhone(value): { digits: string; extension: string } | null`
- Produces: `classifyCustomerMatch(candidate, existing): CustomerIdentityMatch`
- Produces: `chooseCanonicalCustomer(customers, referenceCounts): Customer`
- Produces: `resolveTransactionCustomerLabel(transaction, customer?): string`
- `CustomerIdentityMatch` is `{ strength: 'exact-contact' | 'name-only' | 'conflict' | 'none'; reasons: CustomerDuplicateReason[]; autoMergeSafe: boolean }`.

- [ ] **Step 1: Write failing identity tests**

Add `tools/test-customer-identity.cjs` that transpiles/imports `src/lib/customerDuplicates.ts` using the repository's existing esbuild test pattern and asserts:

```js
assert.equal(normalizeCustomerPhone('(803) 555-1212')?.digits, '8035551212');
assert.equal(normalizeCustomerPhone('+1 803 555 1212')?.digits, '8035551212');
assert.equal(normalizeCustomerPhone('803-555-1212 ext 4')?.extension, '4');
assert.equal(classifyCustomerMatch({ firstName: 'Lynn', lastName: 'Hutto' }, { firstName: 'lynn', lastName: 'hutto' }).autoMergeSafe, false);
assert.equal(classifyCustomerMatch({ email: ' A@Example.com ' }, { email: 'a@example.com' }).strength, 'exact-contact');
assert.equal(classifyCustomerMatch({ phone: '8035551212', email: 'a@example.com' }, { phone: '8035551212', email: 'different@example.com' }).strength, 'conflict');
assert.equal(resolveTransactionCustomerLabel({ customerName: 'Saved Name', customerId: 42 }), 'Saved Name');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tools/test-customer-identity.cjs`

Expected: FAIL because the structured phone normalizer and match-classification exports do not exist.

- [ ] **Step 3: Implement the pure identity functions**

Refactor `customerMatchesSearch`, `customerMatchesSearchText`, and `findDuplicateCustomers` to use the shared normalizers. Preserve substring search for user-entered names, but use exact normalized contact values for merge safety. Treat matching contact plus a conflicting non-empty contact as `conflict`. Choose the canonical customer by descending UUID-reference count, descending non-empty contact-field count, ascending creation date, then ascending legacy ID.

- [ ] **Step 4: Add and run the focused script**

Add `"test:customer-identity": "node tools/test-customer-identity.cjs"` to `package.json`.

Run: `npm run test:customer-identity && npm run test:customer-contact`

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/customerDuplicates.ts tools/test-customer-identity.cjs package.json
git commit -m "test: unify customer identity matching rules"
```

### Task 2: Supabase identity, alias, audit, and reconciliation schema

**Files:**
- Create: the exact migration path printed by `supabase migration new customer_identity_integrity` (the CLI supplies the timestamped filename under `supabase/migrations/`)
- Create: `tools/test-customer-integrity-migration.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces table `customer_legacy_aliases(shop_id uuid, legacy_customer_id bigint, canonical_customer_id uuid, merged_customer_id uuid, created_at timestamptz)`.
- Produces table `customer_integrity_runs(id uuid, shop_id uuid, mode text, status text, counts jsonb, error_text text, created_by uuid, created_at timestamptz, completed_at timestamptz)`.
- Produces table `customer_merge_audits(id uuid, shop_id uuid, run_id uuid, canonical_customer_id uuid, merged_customer_id uuid, before_state jsonb, after_state jsonb, affected_relationships jsonb, created_by uuid, created_at timestamptz)`.
- Produces RPC `customer_integrity_dry_run()` returning categorized counts and record IDs without mutation.
- Produces RPC `reconcile_customer_relationships(p_run_id uuid)` returning repair counts; it must reject runs without a verified backup marker.

- [ ] **Step 1: Create the migration using the installed CLI**

Run `supabase --version`, `supabase migration new customer_identity_integrity`, and use the generated filename. Do not invent a timestamp.

- [ ] **Step 2: Write the failing migration contract test**

Add `tools/test-customer-integrity-migration.cjs` that reads the generated SQL and asserts the three tables, shop-scoped unique alias index, foreign keys, RLS enablement, policies, SECURITY INVOKER behavior where supported, dry-run RPC, reconciliation RPC, transaction boundaries, and the verified-backup precondition.

- [ ] **Step 3: Run the contract test and verify RED**

Run: `node tools/test-customer-integrity-migration.cjs`

Expected: FAIL until the generated migration contains the required schema and functions.

- [ ] **Step 4: Implement the migration**

Use `customer_legacy_aliases` to preserve every legacy identifier during consolidation. Add shop-scoped uniqueness for non-null `customers.legacy_id`, indexes for customer/transaction relationship lookups, and constraints ensuring alias rows point to customers in the same shop. RPCs derive the active shop from the authenticated staff profile and never accept an arbitrary shop UUID from the client. Grant execution only to authenticated users and verify admin authorization inside mutation RPCs.

- [ ] **Step 5: Validate locally and run advisors**

Run the repository's Supabase local validation flow, then run security and performance advisors through Supabase tooling. Confirm no exposed table lacks RLS, no public SECURITY DEFINER function is callable by `PUBLIC`, and relationship indexes cover all new foreign keys.

- [ ] **Step 6: Add and run the migration test**

Add `"test:customer-integrity-migration": "node tools/test-customer-integrity-migration.cjs"`.

Run: `npm run test:customer-integrity-migration`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations tools/test-customer-integrity-migration.cjs package.json
git commit -m "feat: add auditable customer integrity schema"
```

### Task 3: Direct customer and transaction lookup adapters

**Files:**
- Create: `src/lib/customerRecordResolution.ts`
- Modify: `app/electron/electron-main.ts`
- Modify: `app/electron/preload.ts`
- Modify: `src/mobile/mobile-api.ts`
- Modify: `src/global.d.ts`
- Create: `tools/test-customer-record-resolution.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces `getCustomerByIdentity(input: { customerUuid?: string; legacyCustomerId?: number }): Promise<Customer | null>`.
- Produces `getTransactionById(input: { kind: 'workOrder' | 'sale'; legacyId: number }): Promise<{ record: any; customer: Customer | null; integrity: 'healthy' | 'legacy-only' | 'orphaned' | 'conflict' } | null>`.
- Produces `searchCustomers(filters: CustomerSearchValues): Promise<Customer[]>` using complete, paginated, shop-scoped results.
- Exposes matching methods on `window.api` for Electron and mobile.

- [ ] **Step 1: Write failing adapter tests**

Create a source-and-behavior regression script asserting desktop and mobile adapters both expose the three methods, direct transaction lookup filters `shop_id` plus `legacy_id`, customer resolution tries canonical UUID then unique legacy ID/alias, and paginated search continues beyond 1,000 rows.

- [ ] **Step 2: Run and verify RED**

Run: `node tools/test-customer-record-resolution.cjs`

Expected: FAIL because direct lookup APIs are absent.

- [ ] **Step 3: Implement shared resolution and Electron adapter**

Add pure helpers that combine a transaction snapshot with the resolved customer without erasing non-empty transaction fields. Add IPC handlers and preload bindings for direct lookups. Return `null` for missing transactions and an explicit integrity state for broken links.

- [ ] **Step 4: Implement mobile/web adapter parity**

Use Supabase `.eq('shop_id', session.shopId).eq('legacy_id', legacyId).maybeSingle()` for records, then resolve the customer by UUID, legacy ID, or alias. Implement paginated customer search so UI and duplicate detection share the same complete result set.

- [ ] **Step 5: Run adapter tests and typechecks**

Add `"test:customer-resolution": "node tools/test-customer-record-resolution.cjs"`.

Run: `npm run test:customer-resolution && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/customerRecordResolution.ts app/electron/electron-main.ts app/electron/preload.ts src/mobile/mobile-api.ts src/global.d.ts tools/test-customer-record-resolution.cjs package.json
git commit -m "feat: add direct customer and transaction resolution"
```

### Task 4: Make search and duplicate detection share one data path

**Files:**
- Modify: `src/components/CustomerSearchWindow.tsx`
- Modify: `src/components/CustomerOverviewWindow.tsx`
- Modify: `src/components/CustomerForm.tsx`
- Modify: `src/components/DuplicateCustomerDialog.tsx`
- Create: `tools/test-customer-search-parity.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `window.api.searchCustomers(filters)` and `classifyCustomerMatch`.
- Produces one customer result model used by normal search and pre-create duplicate review.

- [ ] **Step 1: Write the failing parity test**

The test must prove that an exact phone/email duplicate returned during customer creation is also returned by Customer Search, that name-only matches display as review suggestions rather than automatic merges, and that no component independently calls `dbGet('customers')` for duplicate detection.

- [ ] **Step 2: Run and verify RED**

Run: `node tools/test-customer-search-parity.cjs`

Expected: FAIL because the screens currently load/filter customers independently.

- [ ] **Step 3: Route both workflows through `searchCustomers`**

Customer Search submits the same normalized filters used by pre-create duplicate lookup. The duplicate dialog distinguishes exact-contact matches, conflicts, and name-only suggestions. “Use existing client” opens the canonical customer; “Create anyway” remains available only for name-only matches or an explicit Admin override.

- [ ] **Step 4: Verify**

Add `"test:customer-search-parity": "node tools/test-customer-search-parity.cjs"`.

Run: `npm run test:customer-search-parity && npm run test:customer-identity && npm run typecheck:renderer`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CustomerSearchWindow.tsx src/components/CustomerOverviewWindow.tsx src/components/CustomerForm.tsx src/components/DuplicateCustomerDialog.tsx tools/test-customer-search-parity.cjs package.json
git commit -m "fix: keep customer search and duplicate checks consistent"
```

### Task 5: Resolve EOD names and prevent blank invoices

**Files:**
- Modify: `src/lib/orderAccounting.ts`
- Modify: `src/components/EODWindow.tsx`
- Modify: `src/sales/SaleWindow.tsx`
- Modify: `src/workorders/NewWorkOrderWindow.tsx`
- Modify: `tools/test-order-accounting.cjs`
- Create: `tools/test-direct-invoice-loading.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `resolveTransactionCustomerLabel` and `window.api.getTransactionById`.
- Changes `collectOrderCartRows(workOrders, sales, purchaseOrders, customersByLegacyId?)` so canonical/resolved names precede snapshots and ID fallbacks.
- Produces invoice load state `'loading' | 'loaded' | 'not-found' | 'error'`.

- [ ] **Step 1: Add failing EOD assertions**

Extend `tools/test-order-accounting.cjs` with a legacy-only work order whose matching customer exists. Assert its cart row displays the customer name; assert snapshot name wins over `Client #42`; assert the fallback remains only when neither source exists.

- [ ] **Step 2: Add failing invoice-load assertions**

Create `tools/test-direct-invoice-loading.cjs` asserting both invoice windows call `getTransactionById`, render saved items when the customer link is orphaned, and show `Invoice #<id> not found` instead of the initialized empty form when lookup returns null.

- [ ] **Step 3: Run and verify RED**

Run: `npm run test:order-accounting && node tools/test-direct-invoice-loading.cjs`

Expected: the new assertions FAIL on ID fallback and collection-scanning invoice loads.

- [ ] **Step 4: Implement resolved EOD labels**

Build a customer map once in EOD and pass it into `collectOrderCartRows`. Persist the resolved name into newly created purchase-order snapshots while retaining source IDs for lookup.

- [ ] **Step 5: Implement explicit direct invoice states**

Both sale and work-order windows fetch the requested transaction directly. Keep the form disabled/skeletonized while loading. On a valid record, populate transaction data first and customer data second. On missing/error, render a non-editable explicit state with Retry and Close actions.

- [ ] **Step 6: Verify**

Add `"test:direct-invoice-loading": "node tools/test-direct-invoice-loading.cjs"`.

Run: `npm run test:order-accounting && npm run test:direct-invoice-loading && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/orderAccounting.ts src/components/EODWindow.tsx src/sales/SaleWindow.tsx src/workorders/NewWorkOrderWindow.tsx tools/test-order-accounting.cjs tools/test-direct-invoice-loading.cjs package.json
git commit -m "fix: resolve EOD clients and load invoices directly"
```

### Task 6: Verified backup and retention service

**Files:**
- Modify: `src/lib/backup.ts`
- Modify: `app/electron/electron-main.ts`
- Modify: `app/electron/preload.ts`
- Modify: `src/mobile/mobile-api.ts`
- Modify: `src/components/BackupWindow.tsx`
- Create: `tools/test-integrity-backups.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces `createIntegrityBackup(reason, scope): Promise<VerifiedBackupManifest>`.
- Produces `verifyIntegrityBackup(manifest): Promise<{ valid: boolean; counts: Record<string, number>; checksum: string }>`.
- Produces `applyBackupRetention(files, policy): RetentionDecision` with defaults `{ daily: 30, monthly: 12 }`.
- Produces `VerifiedBackupManifest` containing version, timestamp, reason, shop, collection counts, SHA-256 checksum, and storage path/reference.

- [ ] **Step 1: Write failing backup tests**

Test that customer/work-order/sale/relationship collections are included, verification detects changed ciphertext or count mismatches, retention keeps the newest successful backup plus 30 daily and 12 monthly restore points, and a pre-restore backup is mandatory.

- [ ] **Step 2: Run and verify RED**

Run: `node tools/test-integrity-backups.cjs`

Expected: FAIL because verified manifests and retention decisions are absent.

- [ ] **Step 3: Implement backup verification and retention**

Extend the existing AES-256-GCM backup format with a manifest and SHA-256 checksum. Desktop writes encrypted files atomically to the configured data directory; mobile/web records an encrypted recovery snapshot through the authenticated Supabase integrity path. Verify by decrypting, validating structure, and comparing collection counts before marking the backup successful.

- [ ] **Step 4: Expose schedule and retention controls**

Add Admin controls for daily backup time, retention counts, last verified backup, and manual Verify. Never run retention cleanup unless a newer verified backup exists.

- [ ] **Step 5: Verify**

Add `"test:integrity-backups": "node tools/test-integrity-backups.cjs"`.

Run: `npm run test:integrity-backups && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/backup.ts app/electron/electron-main.ts app/electron/preload.ts src/mobile/mobile-api.ts src/components/BackupWindow.tsx tools/test-integrity-backups.cjs package.json
git commit -m "feat: add verified customer integrity backups"
```

### Task 7: Integrity audit, safe merge orchestration, and Admin review

**Files:**
- Create: `src/lib/customerIntegrity.ts`
- Create: `src/components/CustomerIntegrityWindow.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/mobile/MobileApp.tsx`
- Modify: `src/mobile/mobile-api.ts`
- Modify: `app/electron/electron-main.ts`
- Modify: `app/electron/preload.ts`
- Create: `tools/test-customer-integrity-workflow.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces `runCustomerIntegrityAudit(): Promise<CustomerIntegrityReport>`.
- Produces `createCustomerIntegrityBackup(report): Promise<VerifiedBackupManifest>`.
- Produces `applyDeterministicRepairs(runId, backupManifestId): Promise<CustomerIntegrityReport>`.
- Produces `mergeCustomers(input: { canonicalCustomerId: string; mergedCustomerIds: string[]; runId: string; backupManifestId: string }): Promise<MergeResult>`.
- `CustomerIntegrityReport` separates `healthy`, `deterministicRepairs`, `exactDuplicates`, `ambiguous`, `conflicts`, and `orphans` with record IDs and counts.

- [ ] **Step 1: Write the failing workflow test**

Assert audit is read-only and idempotent; apply refuses to run without a verified backup; exact-contact duplicates use deterministic canonical selection; name-only/cross-shop/conflicting records are not auto-merged; all affected relationship types are audited; rerunning after success produces zero additional repairs.

- [ ] **Step 2: Run and verify RED**

Run: `node tools/test-customer-integrity-workflow.cjs`

Expected: FAIL because orchestration and Admin UI do not exist.

- [ ] **Step 3: Implement audit and merge orchestration**

Call the dry-run RPC, create and verify a backup, then pass its manifest ID to the mutation RPC. Keep automatic batches bounded and resumable through `customer_integrity_runs`. Refresh customer/work-order/sale collections after successful changes.

- [ ] **Step 4: Implement the Admin review surface**

Show last audit time and categorized counts. Allow comparison of ambiguous records with actions: Keep Both, select canonical customer and Merge, or defer. Require an explicit confirmation summary before a merge or deterministic repair batch. Display the audit ID and backup reference in results.

- [ ] **Step 5: Add background audit triggers**

Run a read-only audit after authenticated startup and debounce audits after customer, work-order, sale, and import change notifications. Background runs may report or queue review items but must not merge ambiguous records.

- [ ] **Step 6: Verify**

Add `"test:customer-integrity": "node tools/test-customer-integrity-workflow.cjs"`.

Run: `npm run test:customer-integrity && npm run test:customer-search-parity && npm run test:customer-resolution && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/customerIntegrity.ts src/components/CustomerIntegrityWindow.tsx src/App.tsx src/main.tsx src/mobile/MobileApp.tsx src/mobile/mobile-api.ts app/electron/electron-main.ts app/electron/preload.ts tools/test-customer-integrity-workflow.cjs package.json
git commit -m "feat: add customer integrity audit and review workflow"
```

### Task 8: Full verification and production dry run

**Files:**
- Modify only if verification exposes a scoped defect in files already covered above.
- Create: `docs/customer-integrity-dry-run.md` from sanitized aggregate results; do not include client names, phones, emails, or UUIDs.

**Interfaces:**
- Consumes every test and API above.
- Produces a reviewed, non-mutating production report before any production data repair.

- [ ] **Step 1: Run the focused regression suite**

Run:

```bash
npm run test:customer-identity
npm run test:customer-contact
npm run test:customer-integrity-migration
npm run test:customer-resolution
npm run test:customer-search-parity
npm run test:order-accounting
npm run test:direct-invoice-loading
npm run test:integrity-backups
npm run test:customer-integrity
```

Expected: every command PASS with no warnings attributable to the change.

- [ ] **Step 2: Run platform verification**

Run: `npm run typecheck && npm run build && npm run build:mobile && npm run electron:buildmain`

Expected: all commands exit 0.

- [ ] **Step 3: Verify the migration in a non-production environment**

Apply the migration to a local database or Supabase development branch, run the migration test queries, then run Supabase security and performance advisors. Confirm RLS, grants, indexes, dry-run behavior, and backup gating.

- [ ] **Step 4: Run the production read-only audit**

Invoke only `customer_integrity_dry_run()`. Record sanitized aggregate counts for healthy links, legacy-only links, UUID-only links, exact duplicates, ambiguous matches, conflicts, and orphans in `docs/customer-integrity-dry-run.md`.

- [ ] **Step 5: Stop for user review**

Present the dry-run counts, advisor results, backup verification method, and exact categories that would change. Do not invoke `reconcile_customer_relationships` or `mergeCustomers` until the user separately approves the production repair summary.

- [ ] **Step 6: Commit verification artifacts**

```bash
git add docs/customer-integrity-dry-run.md
git commit -m "docs: record customer integrity dry run"
```

### Task 9: Approved production reconciliation and post-check

**Files:**
- No source changes expected.
- Append sanitized results to `docs/customer-integrity-dry-run.md`.

**Interfaces:**
- Consumes a user-approved dry-run report and verified backup manifest.
- Produces an auditable reconciliation run and zero unresolved deterministic repairs on post-check.

- [ ] **Step 1: Confirm prerequisites**

Verify the user explicitly approved the Task 8 production summary, the newest backup decrypts and matches its manifest, and the migration/advisors are clean.

- [ ] **Step 2: Apply deterministic relationship repairs**

Invoke `reconcile_customer_relationships` with the approved run ID and verified backup marker. Do not auto-merge ambiguous or name-only candidates.

- [ ] **Step 3: Re-run the read-only audit**

Expected: deterministic repair count is zero; ambiguous/conflict/orphan counts match the expected manual-review remainder; no transaction count decreased.

- [ ] **Step 4: Verify the reported production examples**

Confirm Sale #1299 loads its saved Phone Case line item and resolves Lynn Hutto through legacy customer 994/canonical UUID. Confirm representative EOD rows that formerly showed `Client #` now show resolved names.

- [ ] **Step 5: Run smoke tests on desktop, mobile, and web**

Search an existing customer by name, phone, and email; attempt a duplicate create; open linked work orders and sales; open EOD invoices; verify the Admin integrity report and last verified backup.

- [ ] **Step 6: Record and commit the sanitized post-check**

```bash
git add docs/customer-integrity-dry-run.md
git commit -m "docs: record customer integrity reconciliation"
```
