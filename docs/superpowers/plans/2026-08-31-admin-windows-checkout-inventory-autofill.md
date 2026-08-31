# Admin Windows, Checkout, and Inventory Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver independent desktop Admin windows, efficient Inventory-to-repair linking, reliable Quick Checkout closure, a clearer responsive checkout surface, and dependable distributor-URL autofill.

**Architecture:** Electron Admin actions use additive preload/IPC window APIs while web and mobile retain in-app navigation. Inventory-to-repair context is serialized through a small shared typed helper and consumed by the existing repair editor. Checkout behavior remains in its existing state machine while presentation moves to reusable selection-card styling, and completion/autofill bugs are isolated behind testable helpers.

**Tech Stack:** Electron 29, React 18, TypeScript 5.9, Vite 5, Tailwind CSS, Node assertion regression scripts.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-multiwindow-part-repair-linking-design.md`

## Global Constraints

- Preserve all unrelated working-tree changes and generated artifacts.
- Multiple instances of the same desktop Admin window are allowed.
- Mobile and browser builds use the existing full-screen surface rather than popup windows.
- No destructive database or schema changes.
- Checkout keeps every existing payment and completion option.
- Inventory URL autofill must preserve intentional user-entered values.

---

### Task 1: Desktop Admin Window Routing

**Files:**
- Modify: `src/components/Toolbar.tsx`
- Modify: `app/electron/preload.ts`
- Modify: `app/electron/electron-main.ts`
- Modify: `src/global.d.ts`
- Modify: `src/main.tsx`
- Test: `tools/test-admin-multiwindow.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `openAdminToolWindow(tool: AdminToolKey): Promise<unknown>` renderer routing behavior and additive preload methods for Vendors and Technicians.
- Consumes: existing query routes and modal bus fallback.

- [ ] **Step 1: Write a failing source-level regression test** that asserts every Admin toolbar item prefers a native Electron method, Vendors and Technicians have preload/IPC/query routes, and handlers always create a new `BrowserWindow` rather than caching a singleton.
- [ ] **Step 2: Run `node tools/test-admin-multiwindow.cjs`** and confirm it fails because Vendors/Technicians and native toolbar routing are absent.
- [ ] **Step 3: Add typed native Admin routing** in Toolbar with modal fallback, add Vendors/Technicians query routes and IPC handlers, and share the existing secure BrowserWindow defaults without adding singleton reuse.
- [ ] **Step 4: Run `node tools/test-admin-multiwindow.cjs && npm run typecheck`** and confirm both pass.
- [ ] **Step 5: Commit only Task 1 files** with `feat: open admin tools in independent windows`.

### Task 2: Inventory-to-Repair Launch Context and Synchronization

**Files:**
- Create: `src/lib/inventoryRepairNavigation.ts`
- Modify: `src/components/InventoryWindow.tsx`
- Modify: `src/repairs/RepairCategoriesWindow.tsx`
- Modify: `src/repairs/RepairItemForm.tsx`
- Modify: `app/electron/preload.ts`
- Modify: `app/electron/electron-main.ts`
- Modify: `src/global.d.ts`
- Test: `tools/test-inventory-repair-navigation.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `InventoryRepairLaunchContext`, `buildInventoryRepairLaunchContext(part, mode)`, and `applyInventoryLaunchContext(repair, context)`.
- Consumes: `applyInventoryPartToRepair` from `src/lib/repairPartLinking.ts` and the existing repair persistence APIs.

- [ ] **Step 1: Write failing helper and source-level tests** for exact-part versus parent IDs, non-destructive autofill, existing/new modes, focused mobile new mode, Link Repair/Cancel actions, and collection refresh subscriptions.
- [ ] **Step 2: Run `node tools/test-inventory-repair-navigation.cjs`** and confirm failures identify the missing context/helper/UI.
- [ ] **Step 3: Implement the shared context helper and transport**, add compact Inventory actions, parse context in the repair window, and use the existing linking helper to preserve repair identity/labor while refreshing inventory-owned values.
- [ ] **Step 4: Add collection-change listeners** for products, repair categories/types, device categories, vendors, and technicians in affected windows and broadcast any missing collections after database writes.
- [ ] **Step 5: Run the new test plus `npm run test:repair-parent-part-selection`, `npm run test:repair-form-inventory-fields`, and `npm run typecheck`** and confirm all pass.
- [ ] **Step 6: Commit only Task 2 files** with `feat: link inventory parts to repairs across windows`.

### Task 3: Distributor URL Autofill Regression

**Files:**
- Modify: `src/lib/partOrdering.ts`
- Modify: `src/components/InventoryWindow.tsx`
- Modify: `tools/test-distributor-url.cjs`

**Interfaces:**
- Produces: deterministic `applyInventoryUrlAutofill(current, metadata, url)` merge behavior and visible lookup status.
- Consumes: existing `scrapePartUrl`, `derivePartVendorFromUrl`, and markup helpers.

- [ ] **Step 1: Extend `tools/test-distributor-url.cjs` with failing cases** for URL-owned field refresh, empty SKU/name/cost autofill, manual-value preservation, and scrape failure retaining derived distributor plus editable values.
- [ ] **Step 2: Run `npm run test:distributor-url`** and confirm the new assertions fail for the current merge behavior.
- [ ] **Step 3: Correct the merge and Inventory trigger lifecycle** so paste/blur/Enter trigger one lookup, stale requests cannot win, focus is retained, URL-owned values can refresh, and errors are shown without clearing fields.
- [ ] **Step 4: Run `npm run test:distributor-url`, `npm run test:inventory-part-persistence`, and `npm run typecheck:renderer`** and confirm all pass.
- [ ] **Step 5: Commit only Task 3 files** with `fix: restore inventory distributor url autofill`.

### Task 4: Quick Checkout Completion Reliability

**Files:**
- Modify: `src/lib/quickCheckoutLifecycle.ts`
- Modify: `src/components/QuickSaleWindow.tsx`
- Modify: `app/electron/preload.ts`
- Modify: `app/electron/electron-main.ts`
- Modify: `tools/test-quick-checkout-close.cjs`

**Interfaces:**
- Produces: an idempotent successful-completion function that awaits an acknowledged native close and uses a browser fallback.
- Consumes: existing successful persistence and optional receipt completion sequence.

- [ ] **Step 1: Trace the live close path** from Quick Sale renderer through preload to the Electron handler and record the exact missing/failing acknowledgement boundary in the test fixture.
- [ ] **Step 2: Extend `tools/test-quick-checkout-close.cjs` with failing cases** for close exactly once, native acknowledgement, browser fallback, and failures remaining open.
- [ ] **Step 3: Run `npm run test:quick-checkout-close`** and confirm it fails for the reproduced lifecycle gap.
- [ ] **Step 4: Implement the smallest close-handshake fix** after persistence/receipt completion, keeping validation/payment/save failure paths open.
- [ ] **Step 5: Run `npm run test:quick-checkout-close`, `npm run test:release-0614-features`, and both typechecks** and confirm all pass.
- [ ] **Step 6: Commit only Task 4 files** with `fix: close quick checkout after successful sale`.

### Task 5: Responsive Checkout Redesign

**Files:**
- Modify: `src/workorders/CheckoutWindow.tsx`
- Modify: `src/index.css`
- Create: `tools/test-checkout-layout.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: the same checkout result payload and keyboard behavior through an amount summary, payment-scope cards, payment-method tiles, tender detail panel, option toggles, and responsive action footer.
- Consumes: all existing CheckoutWindow state, calculations, handlers, and labels.

- [ ] **Step 1: Write a failing source-level layout test** that inventories every existing control/label and asserts the new semantic groups, accessible selected states, responsive classes, and action footer.
- [ ] **Step 2: Run `node tools/test-checkout-layout.cjs`** and confirm it fails because the semantic card layout is absent.
- [ ] **Step 3: Recompose only the JSX and styles** around the unchanged checkout calculations/handlers, using native inputs with styled labels, visible focus rings, `aria-pressed`/checked state, compact desktop grid, and narrow single-column layout.
- [ ] **Step 4: Run the layout test, `npm run typecheck:renderer`, and `npm run build:web`** and confirm all pass.
- [ ] **Step 5: Launch the local build and capture desktop and mobile checkout previews**; visually inspect clipping, selection prominence, focus visibility, and action availability.
- [ ] **Step 6: Commit only Task 5 files** with `style: redesign responsive checkout window`.

### Task 6: Full Verification and Release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Create: `tools/release-notes/v<next-version>.md`

**Interfaces:**
- Consumes: repository changelog, versioning, installer, GitHub release, and Pages deployment conventions.
- Produces: tagged GitHub release, Windows installer, release notes containing `Web Interface: https://mattstechwisdom.github.io/GB-POS`, and refreshed web deployment.

- [ ] **Step 1: Run all new focused tests and relevant existing regression scripts** for navigation, repairs, Inventory, Quick Checkout, checkout variants, mobile layout, and web/PWA release behavior.
- [ ] **Step 2: Run `npm run typecheck`, `npm run build:web`, and `npm run dist`** and inspect outputs for errors.
- [ ] **Step 3: Inspect desktop and mobile preview artifacts** and correct any functional or layout regression through a failing test before rerunning verification.
- [ ] **Step 4: Determine the next patch version from repository conventions**, update version/changelog/release notes without inventing a scheme, and include the required Web Interface line.
- [ ] **Step 5: Commit release metadata, push the branch/main integration required by the established workflow, create and push the version tag, publish the GitHub release with installer assets, and deploy the web build.**
- [ ] **Step 6: Verify the public release page, tag, update feed, installer asset, and web URL**, then report the exact version, destinations, test results, and preview artifact paths.
