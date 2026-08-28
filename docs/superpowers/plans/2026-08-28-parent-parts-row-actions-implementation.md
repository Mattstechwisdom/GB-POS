# Parent Parts and POS Row Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable repair families, device-scoped service assignments, parent inventory parts with exact stocked variants, and consistent right-click/press-and-hold row actions, then publish the next GB POS patch release.

**Architecture:** Extend existing `products` and `repair_categories` records with nullable hierarchy fields so every current standalone item remains valid. Pure domain helpers will resolve parent/child relationships and eligible variants; UI components will consume those helpers, while work-order and sale lines continue storing the exact `inventoryProductId` consumed by the existing idempotent inventory service.

**Tech Stack:** React 18, TypeScript, Electron, Vite, Supabase/Postgres with RLS, Node regression scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-parent-parts-and-repair-families-design.md` and `docs/superpowers/specs/2026-08-28-pos-row-context-actions-design.md`

## Global Constraints

- Existing inventory and repair records must continue working without conversion.
- Parent inventory records are organizational and must never be deducted or sold directly.
- Every stocked child variant retains its own SKU, stock, cost, price, reorder threshold, MOQ, and supplier data.
- Closing a work order or paying a sale deducts only the exact child variant and remains idempotent.
- No new destructive permissions may be added to reporting, accounting, payment, or immutable history views.
- Desktop right-click and mobile press-and-hold must expose the same supported actions.
- Every Supabase table change must retain shop-scoped RLS and receive live round-trip verification.
- The release description must include `Web Interface: https://mattstechwisdom.github.io/GB-POS`.

---

### Task 1: Hierarchy Domain Model and Regression Contract

**Files:**
- Create: `src/lib/inventoryVariants.ts`
- Create: `tools/test-inventory-variants.cjs`
- Modify: `package.json`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `isInventoryParent(item)`, `inventoryParentId(item)`, `inventoryVariantAttributes(item)`, `inventoryVariantsForParent(items, parentId)`, `inventoryAggregateStock(items, parentId)`, and `eligibleInventoryVariants(items, parentId, context)`.
- Produces: optional `parentProductId`, `isParentPart`, `variantAttributes`, `repairFamily`, `serviceKey`, and `inventoryParentId` fields on existing inventory/repair types.

- [ ] **Step 1: Write the failing domain test**

```js
assert.equal(isInventoryParent(parent), true);
assert.deepEqual(inventoryVariantsForParent(rows, 100).map(row => row.id), [101, 102]);
assert.equal(inventoryAggregateStock(rows, 100), 7);
assert.deepEqual(eligibleInventoryVariants(rows, 100, { color: 'White' }).map(row => row.id), [102]);
assert.equal(isInventoryParent(legacyStandalone), false);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tools/test-inventory-variants.cjs`
Expected: FAIL because `src/lib/inventoryVariants.ts` does not exist.

- [ ] **Step 3: Implement normalized hierarchy helpers**

```ts
export function isInventoryParent(item: any): boolean {
  return item?.isParentPart === true;
}

export function inventoryParentId(item: any): number | undefined {
  const value = Number(item?.parentProductId);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function inventoryVariantAttributes(item: any): Record<string, string> {
  if (!item?.variantAttributes || typeof item.variantAttributes !== 'object' || Array.isArray(item.variantAttributes)) return {};
  return Object.fromEntries(Object.entries(item.variantAttributes).map(([key, value]) => [String(key).trim(), String(value || '').trim()]).filter(([key, value]) => key && value));
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:inventory-variants`
Expected: `Inventory variant checks passed.`

- [ ] **Step 5: Commit the domain contract**

```bash
git add src/lib/inventoryVariants.ts src/lib/types.ts tools/test-inventory-variants.cjs package.json
git commit -m "feat: add inventory variant domain model"
```

### Task 2: Backward-Compatible Supabase and Serializer Fields

**Files:**
- Create: the migration path printed by `supabase migration new add_inventory_variants_and_repair_families` in Step 3
- Modify: `src/mobile/mobile-api.ts`
- Modify: `app/electron/electron-main.ts`
- Create: `tools/test-inventory-variant-sync.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: normalized fields from Task 1.
- Produces: cloud columns `products.is_parent_part`, `products.parent_product_legacy_id`, `products.variant_attributes`, `repair_categories.repair_family`, `repair_categories.service_key`, and `repair_categories.inventory_parent_legacy_id`.

- [ ] **Step 1: Write failing serializer assertions**

```js
assert.match(mobile, /isParentPart:\s*row\.is_parent_part/);
assert.match(mobile, /variantAttributes:\s*row\.variant_attributes/);
assert.match(desktop, /parent_product_legacy_id:\s*toCloudIntId\(item\.parentProductId\)/);
assert.match(migration, /variant_attributes jsonb not null default '\{\}'::jsonb/);
```

- [ ] **Step 2: Run and verify RED**

Run: `node tools/test-inventory-variant-sync.cjs`
Expected: FAIL on missing mappings and migration.

- [ ] **Step 3: Create the migration with the installed CLI**

Run: `supabase --version` then `supabase migration new add_inventory_variants_and_repair_families`.

Populate the generated file with nullable/backward-compatible columns, JSON object checks, and shop-scoped indexes:

```sql
alter table public.products
  add column if not exists is_parent_part boolean not null default false,
  add column if not exists parent_product_legacy_id bigint,
  add column if not exists variant_attributes jsonb not null default '{}'::jsonb;

alter table public.repair_categories
  add column if not exists repair_family text,
  add column if not exists service_key text,
  add column if not exists inventory_parent_legacy_id bigint;

alter table public.products drop constraint if exists products_variant_attributes_object;
alter table public.products add constraint products_variant_attributes_object check (jsonb_typeof(variant_attributes) = 'object');
create index if not exists products_shop_parent_legacy_idx on public.products (shop_id, parent_product_legacy_id) where parent_product_legacy_id is not null;
create index if not exists repair_categories_shop_family_service_idx on public.repair_categories (shop_id, lower(repair_family), lower(service_key));
```

- [ ] **Step 4: Map fields in both serializer directions**

Add the six fields to Electron and mobile cloud row converters, write payloads, schema-cache fallbacks, and local preview adapters.

- [ ] **Step 5: Run serializer, type, and migration checks**

Run: `npm run test:inventory-variant-sync && npm run typecheck`.
Expected: all commands exit 0.

- [ ] **Step 6: Commit schema and synchronization**

```bash
git add supabase/migrations src/mobile/mobile-api.ts app/electron/electron-main.ts tools/test-inventory-variant-sync.cjs package.json
git commit -m "feat: sync inventory variants and repair families"
```

### Task 3: Parent and Variant Inventory Management

**Files:**
- Modify: `src/components/InventoryWindow.tsx`
- Modify: `src/lib/inventoryLabels.ts`
- Modify: `src/styles/index.css`
- Create: `tools/test-inventory-parent-ui.cjs`
- Modify: `tools/test-mobile-window-layout.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 hierarchy helpers and Task 2 persisted fields.
- Produces: Create Parent Part, Add Variant, Duplicate Variant, Move to Parent, variant attribute editor, parent aggregate display, and exact-variant labels.

- [ ] **Step 1: Write failing UI contract assertions**

```js
assert.match(source, /Create Parent Part/);
assert.match(source, /Add Variant/);
assert.match(source, /Duplicate Variant/);
assert.match(source, /Variant Attributes/);
assert.match(source, /inventoryAggregateStock/);
```

- [ ] **Step 2: Run and verify RED**

Run: `node tools/test-inventory-parent-ui.cjs`
Expected: FAIL because parent/variant controls are absent.

- [ ] **Step 3: Add parent grouping and forms**

Render organizational parents as collapsible rows. Child rows retain existing stock, cost, price, reorder, SKU, and Print Label controls. Parent forms disable physical-stock fields and show aggregate child stock.

- [ ] **Step 4: Add flexible attribute editing**

Use repeatable Name/Value rows persisted as `variantAttributes`. Validate unique non-empty attribute names and trim values before save.

- [ ] **Step 5: Add safe parent actions**

Parent deletion must refuse while children exist and explain that variants must be moved or removed. Duplicate Variant copies commercial fields but resets id, stock, consumption keys, SKU, and timestamps.

- [ ] **Step 6: Run UI and responsive checks**

Run: `npm run test:inventory-parent-ui && npm run test:mobile-layout` with inventory preview capture enabled.
Expected: tests pass with no horizontal overflow.

- [ ] **Step 7: Commit inventory management**

```bash
git add src/components/InventoryWindow.tsx src/lib/inventoryLabels.ts src/styles/index.css tools/test-inventory-parent-ui.cjs tools/test-mobile-window-layout.cjs package.json
git commit -m "feat: manage parent parts and variants"
```

### Task 4: Repair Families and Device-Scoped Service Assignments

**Files:**
- Modify: `src/repairs/RepairTypeManager.tsx`
- Modify: `src/repairs/RepairItemForm.tsx`
- Modify: `src/repairs/RepairCategoriesWindow.tsx`
- Modify: `src/lib/types.ts`
- Create: `src/lib/repairServiceHierarchy.ts`
- Create: `tools/test-repair-service-hierarchy.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: parent inventory records from Task 3.
- Produces: repair-family organization, stable service keys, device-specific pricing assignments, and parent/standalone inventory links.

- [ ] **Step 1: Write failing hierarchy tests**

```js
assert.equal(serviceDisplayLabel(assignment), 'PlayStation 5 — USB Port Repair');
assert.deepEqual(filterServiceAssignments(rows, { deviceCategory: 'Game Console', deviceName: 'PlayStation 5' }).map(row => row.id), ['ps5-usb']);
assert.equal(normalizeServiceKey(' USB Port Repair '), 'usb-port-repair');
```

- [ ] **Step 2: Run and verify RED**

Run: `node tools/test-repair-service-hierarchy.cjs`
Expected: FAIL because the hierarchy helper does not exist.

- [ ] **Step 3: Implement pure filtering and labels**

Normalize family/service labels without altering saved customer-facing titles. Match assignments by device category, compatible device name, and model using existing repair-device scope conventions.

- [ ] **Step 4: Add management controls**

Repair forms gain Repair Family, Reusable Service, Compatible Device, device-specific labor/price, and Linked Part Family/Standalone Part controls. Existing flat repair rows load unchanged.

- [ ] **Step 5: Verify and commit**

Run: `npm run test:repair-service-hierarchy && npm run test:repair-device-filters && npm run typecheck:renderer`.

```bash
git add src/repairs src/lib/repairServiceHierarchy.ts src/lib/types.ts tools/test-repair-service-hierarchy.cjs package.json
git commit -m "feat: organize device-scoped repair services"
```

### Task 5: Exact Variant Selection During Repair and Checkout

**Files:**
- Create: `src/components/InventoryVariantPicker.tsx`
- Modify: `src/workorders/ItemsTable.tsx`
- Modify: `src/workorders/NewWorkOrderWindow.tsx`
- Modify: `src/sales/SaleItemsTable.tsx`
- Modify: `src/components/QuickSaleWindow.tsx`
- Modify: `src/lib/inventoryConsumption.ts`
- Create: `tools/test-checkout-inventory-variants.cjs`
- Modify: `tools/test-inventory-consumption.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: eligible variants and repair assignments from Tasks 1 and 4.
- Produces: exact `inventoryProductId` selection, saved `inventoryParentId`, compact variant summary, and checkout validation.

- [ ] **Step 1: Write failing exact-consumption tests**

```js
assert.equal(resolveConsumedInventoryId(parentLinkedLine, products), undefined);
assert.equal(resolveConsumedInventoryId({ ...parentLinkedLine, inventoryProductId: 102 }, products), 102);
await assert.rejects(() => validateRequiredVariant(parentLinkedLine, products), /choose the exact part used/i);
assert.equal(black.stockCount, 4);
assert.equal(white.stockCount, 1);
```

- [ ] **Step 2: Run and verify RED**

Run: `node tools/test-checkout-inventory-variants.cjs`
Expected: FAIL because exact-variant validation is absent.

- [ ] **Step 3: Build the reusable variant picker**

Display variant attributes, SKU, supplier, price/cost context, and current stock. Filter to the linked parent and prevent selecting organizational parent rows.

- [ ] **Step 4: Integrate work orders**

When a selected repair links a parent, save `inventoryParentId` and require the picker to set exact `inventoryProductId`. Show the chosen attributes in the editor while keeping the receipt service title concise.

- [ ] **Step 5: Integrate regular and Quick Checkout**

Catalog searches may show parent groups, but adding to a sale requires a stocked child selection. Existing standalone products remain one-click selections.

- [ ] **Step 6: Protect consumption**

Skip/reject parent records in `consumeInStockInventory`; consume exact child ids only and retain the existing source/line key on that child.

- [ ] **Step 7: Verify and commit**

Run: `npm run test:checkout-inventory-variants && npm run test:inventory-consumption && npm run test:sale-product-picker && npm run test:workorder-item-sync`.

```bash
git add src/components/InventoryVariantPicker.tsx src/workorders src/sales src/components/QuickSaleWindow.tsx src/lib/inventoryConsumption.ts tools/test-checkout-inventory-variants.cjs tools/test-inventory-consumption.cjs package.json
git commit -m "feat: select exact inventory variants at checkout"
```

### Task 6: Consistent POS Row Context Actions

**Files:**
- Modify: `src/components/CustomerWorkOrders.tsx`
- Modify: `src/components/CustomerSales.tsx`
- Modify: `src/components/CustomerOverviewWindow.tsx` (`CombinedHistory`, including consultation rows)
- Modify: `src/components/InventoryWindow.tsx`
- Modify: `src/components/VendorsWindow.tsx`
- Modify: `src/components/ProductsWindow.tsx`
- Modify: `src/components/TechniciansWindow.tsx`
- Modify: `src/repairs/DeviceForm.tsx`
- Modify: `src/repairs/RepairTypeManager.tsx`
- Create: `tools/test-pos-row-context-actions.cjs`
- Modify: `tools/test-mobile-long-press.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `ContextMenu`, `useContextMenu`, editors, confirmations, and delete methods.
- Produces: row-bound Edit/Open and Delete/Remove actions with desktop and touch parity.

- [ ] **Step 1: Write failing context-menu coverage**

```js
assertRowMenu(customerWorkOrders, ['Open / Edit', 'Delete Work Order…']);
assertRowMenu(customerSales, ['Open / Edit', 'Delete Sale…']);
assert.doesNotMatch(customerWorkOrders, />Delete<\/Button>/);
assert.doesNotMatch(customerSales, />Delete<\/Button>/);
```

- [ ] **Step 2: Run and verify RED**

Run: `node tools/test-pos-row-context-actions.cjs`
Expected: FAIL on client-history menus and bottom Delete buttons.

- [ ] **Step 3: Add client-history row menus**

Bind the clicked row directly to the menu. Open/Edit reuses the existing window launcher. Delete reuses the existing confirmation and collection delete call, refreshes the list, and closes the menu.

- [ ] **Step 4: Remove bottom client-history Delete controls**

Keep row selection and double-click behavior, but remove obsolete selected-row Delete buttons and unused selection-only state.

- [ ] **Step 5: Align other editable list rows**

Add menus only where an editor/delete action already exists. Do not add deletion to reports, payments, accounting history, EOD history, or notifications.

- [ ] **Step 6: Verify desktop and mobile behavior**

Run: `npm run test:pos-row-context-actions && npm run test:mobile-long-press && npm run test:mobile-layout`.
Expected: menus fit and the correct row receives each action.

- [ ] **Step 7: Commit context actions**

```bash
git add src/components src/repairs tools/test-pos-row-context-actions.cjs tools/test-mobile-long-press.cjs package.json
git commit -m "feat: standardize POS row context actions"
```

### Task 7: Live Migration, Full Verification, Walkthrough, and Release

**Files:**
- Create: `docs/PARENT-PARTS-INVENTORY-GUIDE.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tools/release-notes/v0.6.36.md`
- Add: responsive preview artifacts under `preview-artifacts/v0.6.36/`

**Interfaces:**
- Consumes: all completed application and migration work.
- Produces: deployed schema, operator guide, verified builds, Git tag, release assets, and live web deployment.

- [ ] **Step 1: Run pre-deployment verification**

Run: `npm run test:inventory-hierarchy && npm run test:inventory-part-persistence && npm run test:repair-service-assignments && npm run test:repair-device-filters && npm run test:inventory-repair-matching && npm run test:checkout-inventory-variants && npm run test:inventory-consumption && npm run test:sale-product-picker && npm run test:workorder-item-sync && npm run test:pos-row-context-actions && npm run test:mobile-long-press && npm run test:mobile-layout && npm run typecheck && npm run build:web`.

Run: `git diff --check`.
Expected: every command exits 0.

- [ ] **Step 2: Review and deploy the migration**

Run: `supabase --version`, `supabase projects list`, `supabase link --project-ref hpuwxtfwogtsbmdvunan`, `supabase db lint --linked`, `supabase migration list --linked`, `supabase db push --linked`, and `supabase migration list --linked`.

Review every lint/advisor finding before `db push`; stop if the linked project differs from `hpuwxtfwogtsbmdvunan` or a destructive migration is proposed.

- [ ] **Step 3: Verify live round trips**

Use the project's authenticated Supabase Data API client to insert records whose names begin `Codex v0.6.36 verification - `: one parent product, one child variant, and one repair assignment. Read back `parent_product_id`, `is_variant_parent`, `variant_attributes`, `repair_family`, `service_name`, and `device_scope`, update one attribute, verify the update, then delete only records carrying that exact verification prefix.

- [ ] **Step 4: Write the operator walkthrough**

Document exact UI steps for creating iPhone 7 Screen, Black/White variants, assigning Screen Replacement, selecting the installed part, closing the ticket, confirming stock, and creating EOD reorder entries.

- [ ] **Step 5: Capture responsive previews**

Capture inventory parent/variant management, repair assignment, and work-order variant selection at portrait, landscape, and desktop sizes. Visually inspect each artifact for clipping and readable controls.

- [ ] **Step 6: Determine and set the patch version**

Fetch remote tags and verify `v0.6.36` remains available. Update package files, changelog, and release notes with the required Web Interface line; if that tag has become occupied, stop and recalculate the next patch version before editing version files.

- [ ] **Step 7: Run final verification on the versioned tree**

Run: `npm run test:inventory-hierarchy && npm run test:repair-service-assignments && npm run test:checkout-inventory-variants && npm run test:inventory-consumption && npm run test:pos-row-context-actions && npm run test:mobile-long-press && npm run typecheck:renderer && npm run typecheck:main && npm run build && npm run build:mobile && npm run build:web && npm run dist && npm run verify:update-feed`.

Run: `git status --short` and `git diff --check`.

- [ ] **Step 8: Commit, tag, push, and monitor**

Push the commit to `main` and the working branch, push the annotated version tag, monitor GitHub Pages and Build & Release workflows, and confirm Windows installer and Android APK assets are attached.

- [ ] **Step 9: Report completion**

Provide the release URL, web interface, preview paths, verification summary, migration status, and link to `docs/PARENT-PARTS-INVENTORY-GUIDE.md`.
