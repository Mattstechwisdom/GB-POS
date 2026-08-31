# Repair, Inventory, and Vendor Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix persisted repair deletion and reorganize canonical inventory, repair, device, and vendor settings into a responsive shared catalog workflow.

**Architecture:** Keep the existing collections and shared Catalog Settings window. Extract small pure helpers for delete outcomes, inventory defaults, and canonical vendor relationships; make UI components consume those helpers and existing database APIs so desktop, mobile, browser, and concurrent windows behave consistently.

**Tech Stack:** React 18, TypeScript, Electron IPC, Supabase-backed collection API, Tailwind CSS, Node assertion regression scripts, Vite.

**Spec:** `docs/superpowers/specs/2026-08-31-repair-inventory-vendor-settings-design.md`

## Global Constraints

- The Admin label is exactly `Repairs`; no visible `Devices/Repairs` label remains.
- Distributors/Vendors is removed from Admin and lives under Inventory Settings.
- Existing collections remain authoritative; no destructive schema migration is permitted.
- Existing unrelated workspace changes must remain untouched.
- Release notes contain `Web Interface: https://mattstechwisdom.github.io/GB-POS`.

---

### Task 1: Persisted repair deletion

**Files:**
- Create: `src/lib/repairDeletion.ts`
- Modify: `src/repairs/RepairCategoriesWindow.tsx`
- Modify: `src/repairs/RepairTypeManager.tsx`
- Create: `tools/test-repair-deletion.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `deleteRepair(api, id): Promise<{ ok: boolean; error?: string }>` and `deleteRepairType(api, type, assignedRows, mode): Promise<DeleteSummary>`.
- Consumes: existing `dbDelete`, `dbGet`, and collection-change events.

- [ ] **Step 1: Write the failing deletion regression**

Assert that both repair surfaces call the shared helper, only remove UI state after `{ ok: true }`, expose errors, and support `type-only` versus `type-and-repairs` including recovered types.

- [ ] **Step 2: Verify RED**

Run: `node tools/test-repair-deletion.cjs`
Expected: FAIL because the helper and explicit deletion modes do not exist.

- [ ] **Step 3: Implement the shared deletion helper and wire both surfaces**

Treat `false`, thrown errors, and missing IDs as failure. For cascading deletion, delete assigned repair rows first and only delete the defined type after all repair deletions succeed. Refresh instead of optimistic removal.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:repair-deletion`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix: make repair deletion persistent`

### Task 2: Admin navigation and shared settings structure

**Files:**
- Modify: `src/components/Toolbar.tsx`
- Modify: `src/components/CatalogSettingsWindow.tsx`
- Modify: `src/components/InventoryWindow.tsx`
- Modify: `src/repairs/RepairCategoriesWindow.tsx`
- Modify: `src/mobile/MobileApp.tsx`
- Create: `tools/test-catalog-settings-navigation.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: Inventory sub-tabs `partTypes | vendors | defaults`; Repairs sub-tabs `types | devices | defaults`.
- Consumes: existing `openCatalogSettings('inventory' | 'repairs')` routing.

- [ ] **Step 1: Write failing navigation assertions**

Assert exact Admin entries, absence of Distributors/Vendors, settings sub-tabs, responsive tab classes, and accessible settings buttons in Inventory and Repairs.

- [ ] **Step 2: Verify RED**

Run: `node tools/test-catalog-settings-navigation.cjs`
Expected: FAIL because Vendors remains in Admin and settings sub-tabs are incomplete.

- [ ] **Step 3: Implement compact settings navigation**

Remove the Admin vendor entry, retain native vendor window compatibility for existing deep links, add the Inventory and Repairs sub-tabs, and keep touch-accessible actions.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:catalog-settings-navigation`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: organize catalog settings navigation`

### Task 3: Canonical vendor relationships and linked catalog view

**Files:**
- Create: `src/lib/vendorCatalog.ts`
- Modify: `src/components/VendorsWindow.tsx`
- Modify: `src/components/CatalogSettingsWindow.tsx`
- Modify: `src/components/InventoryWindow.tsx`
- Create: `tools/test-vendor-catalog.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `vendorKey`, `resolveCanonicalVendor`, `groupVendorLinks`, `renameVendorLinks`, and `mergeVendorLinks` pure functions.
- Consumes: products, repairCategories, vendors; repair inventory link fields already defined in `RepairItem`.

- [ ] **Step 1: Write failing canonicalization and grouping tests**

Cover case/spacing equivalence, part grouping, repair grouping through linked inventory part/parent, rename propagation, merge propagation, duplicate rejection, and delete blocking when links remain.

- [ ] **Step 2: Verify RED**

Run: `node tools/test-vendor-catalog.cjs`
Expected: FAIL because vendor catalog helpers do not exist.

- [ ] **Step 3: Implement pure vendor catalog helpers**

Normalize comparison without rewriting display names; return updated copies and affected IDs for persistence.

- [ ] **Step 4: Build the compact vendor directory**

Reuse VendorsWindow as the Inventory Settings vendor pane. Add search, counts, expandable Parts/Repairs lists, canonical duplicate validation, rename/merge persistence, linked-editor navigation, and guarded deletion.

- [ ] **Step 5: Verify GREEN**

Run: `npm run test:vendor-catalog`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: add canonical vendor catalog links`

### Task 4: Inventory and repair defaults

**Files:**
- Create: `src/lib/catalogDefaults.ts`
- Modify: `src/components/CatalogSettingsWindow.tsx`
- Modify: `src/components/InventoryWindow.tsx`
- Modify: `src/repairs/RepairItemForm.tsx`
- Create: `tools/test-catalog-defaults.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: normalized existing-settings fields `inventoryDefaults` and `repairDefaults`, plus `applyInventoryDefaults` and `applyRepairDefaults` for blank records only.
- Consumes: the existing first `settings` record.

- [ ] **Step 1: Write failing defaults tests**

Cover markup, low-stock threshold, reorder quantity, conditions, safe numeric bounds, initial-value application, and preservation of existing fields.

- [ ] **Step 2: Verify RED**

Run: `node tools/test-catalog-defaults.cjs`
Expected: FAIL because defaults helpers do not exist.

- [ ] **Step 3: Implement helpers and settings panes**

Persist through the existing settings record. Apply only when a new blank inventory/repair draft is constructed.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:catalog-defaults`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add inventory and repair defaults`

### Task 5: URL autofill canonicalization

**Files:**
- Modify: `src/lib/partOrdering.ts`
- Modify: `src/components/InventoryWindow.tsx`
- Modify: `tools/test-distributor-url.cjs`
- Modify: `tools/test-vendor-catalog.cjs`

**Interfaces:**
- Consumes: `resolveCanonicalVendor` and existing `scrapePartUrl` metadata.
- Produces: canonical vendor spelling and parsed part cost without overwriting intentional non-empty fields during automatic first fill.

- [ ] **Step 1: Extend tests and verify RED**

Run: `npm run test:distributor-url && npm run test:vendor-catalog`
Expected: FAIL on canonical saved spelling and cost application cases.

- [ ] **Step 2: Implement canonical URL autofill**

Resolve or create one vendor record and fill available title, SKU, vendor, and cost with clear incomplete-scrape feedback.

- [ ] **Step 3: Verify GREEN**

Run: `npm run test:distributor-url && npm run test:vendor-catalog`
Expected: PASS.

- [ ] **Step 4: Commit**

Commit message: `fix: canonicalize distributor url autofill`

### Task 6: Full verification and visual QA

**Files:**
- Modify only if verification reveals a scoped defect.
- Create previews under: `output/previews/<version>/`

**Interfaces:**
- Consumes: all completed tasks.
- Produces: verified desktop/mobile preview evidence.

- [ ] **Step 1: Run focused and existing regressions**

Run all new scripts plus admin-multiwindow, distributor-url, inventory navigation/persistence/variants/device groups, repair hierarchy/parent selection/compatibility/form fields, mobile navigation/layout, and web-PWA release tests.

- [ ] **Step 2: Run typechecks and builds**

Run: `npm run typecheck && npm run build:web && npm run dist`
Expected: exit 0 and versioned installer verification.

- [ ] **Step 3: Capture and inspect previews**

Capture Catalog Settings Inventory/Vendors and Repairs desktop views plus mobile settings views. Confirm compact layout, readable counts, expandable records, and no clipped controls.

- [ ] **Step 4: Commit scoped corrections if required**

Use a descriptive fix commit and rerun affected verification.

### Task 7: Patch release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Create: `tools/release-notes/v<version>.md`

**Interfaces:**
- Consumes: the repository's current patch-release convention and release workflows.
- Produces: a published GitHub Release, Windows installer/update feed, Android APK, instructions PDF, and Pages deployment.

- [ ] **Step 1: Select the next patch version**

Read the latest package version/tag and increment only the patch number.

- [ ] **Step 2: Update metadata and notes**

Include the required Web Interface line and concise user-facing changes.

- [ ] **Step 3: Run final release-tree verification**

Repeat focused suites, `npm run typecheck`, `npm run build:web`, and `npm run dist` on the exact tree to be tagged.

- [ ] **Step 4: Commit, push main, and push annotated tag**

Use the established branch/main/tag workflow without force-pushing.

- [ ] **Step 5: Verify remote release outcomes**

Wait for Release, Windows, and Pages workflows. Confirm release is public/non-prerelease, required assets exist, web returns HTTP 200, and `npm run verify:update-feed` reports the new version.
