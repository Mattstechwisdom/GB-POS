# Parent Parts and Repair Families Design

## Goal

Organize a large repair and inventory catalog with a small set of reusable repair families while tracking the exact physical part variant installed or sold. A technician should select a familiar repair such as USB Port Repair, then choose only from compatible variants for the ticket's device.

## Catalog Model

### Repair families and services

A repair family is a broad organization level such as Port Repair, Screen, Battery, Diagnostic, or Additional Fees. A service is a reusable operation within that family, such as USB Port Repair or Screen Replacement.

A service is assigned to one or more device scopes. Each assignment stores the customer-facing price, labor amount, estimated time or notes, and linked parent part. This allows PlayStation 5 USB Port Repair, laptop USB Port Repair, and controller USB Port Repair to share one service definition while retaining different pricing and compatible parts.

The work-order picker progressively filters by the ticket's device category and model. It displays a specific label such as `PlayStation 5 — USB Port Repair` without requiring a separately named repair type for every device.

### Parent parts and variants

A parent part is an organizational record such as iPhone 7 Screen or PlayStation 5 USB Port. It does not represent physical stock and is never deducted directly.

Each child variant is a normal stocked inventory record with its own SKU, supplier, cost, sale price, quantity, low-stock threshold, MOQ, reorder URL, and optional attributes. Attributes are stored as a small key/value object so different parent parts can use the dimensions they need:

- iPhone 7 Screen: Color = Black or White; Quality = Aftermarket, Premium, OEM, or Refurbished.
- PlayStation 5 USB Port: Connector = USB-A or USB-C; Position = Front or Rear; Revision as needed.
- Storage: Capacity and interface.
- Cables: Length, connector, and color.

The inventory UI shows parents as collapsible groups with aggregate child stock. Search matches parent names, variant attributes, SKUs, devices, and repair services.

## Backward-Compatible Storage

Existing `products` records remain standalone inventory items. New nullable fields identify a parent/variant relationship and variant attributes. Existing repairs linked to a standalone inventory item continue selecting and consuming it directly.

New parent records are distinguished from stocked children and cannot be selected as the consumed SKU. Child variants reference the parent's per-shop legacy identifier. The cloud schema receives nullable parent and variant fields, indexed within each shop. No existing records are rewritten or deleted.

Repair catalog rows receive nullable repair-family, service, and parent-part linkage fields. Existing category, repair type, price, labor, and exact inventory linkage remain supported. This permits gradual migration rather than requiring the full catalog to be reorganized before checkout.

All new cloud columns use the existing shop-scoped RLS policies on `products` and `repair_categories`; no public access or authorization expansion is introduced.

## Work-Order and Sale Flow

When a repair is added:

1. The ticket's device filters available service assignments.
2. If the repair links to a standalone part, behavior remains unchanged.
3. If it links to a parent part with one in-stock child, that child may be preselected and shown for confirmation.
4. If multiple variants are available, a compact Part Used selector requires the technician to choose the exact variant.
5. The selector displays relevant attributes, SKU, supplier, and current stock.
6. The saved work-order line stores both the parent relationship and exact child `inventoryProductId`.
7. Closing the work order deducts only the exact child variant through the existing idempotent consumption keys.

Regular and Quick Checkout product pickers select stocked child variants, never an organizational parent. Existing exact items continue behaving normally. Receipts use the service name by default; the editor can retain variant details for internal inventory and optionally include them in customer-facing notes.

Checkout validation prevents closing a tracked repair that requires a variant while no child SKU is selected. Out-of-stock variants can follow the existing requires-order workflow.

## Editing and Context Actions

The row-context design in `2026-08-28-pos-row-context-actions-design.md` applies to parent groups and variants. Right-click or press-and-hold offers supported Edit and Delete actions. Deleting a parent with child variants is blocked until variants are moved or removed. Deleting a variant already referenced by tickets requires the existing confirmation behavior and must not rewrite historical ticket lines.

## Migration and Synchronization

The implementation adds nullable columns through a Supabase migration created with the repository's CLI workflow. Desktop and mobile serializers map the new fields in both directions. Schema-cache fallback may omit new fields only for older, not-yet-migrated environments; after deployment, verification must confirm round-trip persistence in the live project.

Existing startup reconciliation continues handling previously closed work orders and paid sales. Consumption keys remain stored on the exact child inventory record, making immediate checkout and later reconciliation safe to repeat.

## Management Workflow

Inventory gains actions to create a parent part, add a variant, duplicate a variant, move a variant to a parent, and edit variant attributes. Repair management gains repair-family and reusable-service controls plus device-specific assignments that link to a parent or standalone part.

The release includes an operator walkthrough covering:

1. Creating a parent part.
2. Adding separately stocked variants.
3. Assigning compatible devices and repair services.
4. Setting device-specific labor and price.
5. Selecting the installed variant on a work order.
6. Verifying deduction, low-stock state, and EOD reorder behavior.

## Validation and Verification

Automated coverage verifies standalone compatibility, parent aggregate counts, variant filtering, required selection, exact-SKU deduction, idempotent reconciliation, sale and Quick Checkout selection, desktop/mobile serialization, context actions, and non-destructive parent deletion rules.

Verification includes renderer and Electron typechecks, targeted catalog and inventory tests, production desktop/mobile builds, responsive previews, Supabase migration status, live round-trip queries, and the established tagged release workflow.
