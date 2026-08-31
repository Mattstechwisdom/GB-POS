# Repair, Inventory, and Vendor Settings Design

## Goal

Make Repairs and Inventory use one dependable classification and vendor vocabulary, fix repair deletion, and organize all saved dropdown values under the settings area that owns them.

## Navigation and naming

- The Admin menu labels the repair catalog **Repairs** everywhere. No visible **Devices/Repairs** label remains.
- The Admin menu no longer contains Distributors/Vendors.
- Inventory retains a prominent **Inventory Settings** entry. Repairs retains **Repair Settings**.
- Both settings entry points open the existing shared Catalog Settings window and select the appropriate Inventory or Repairs tab.
- Desktop keeps independent windows and permits duplicate windows. Mobile and browser builds use the existing responsive in-app routes.

## Inventory settings

Inventory Settings uses compact sub-navigation rather than large stacked forms:

1. **Part Types** manages the saved Part Type choices.
2. **Distributors/Vendors** manages canonical supplier names and their purchasing attributes.
3. **Defaults** manages inventory-entry defaults: markup percentage, low-stock threshold, reorder quantity, and saved condition choices.

Defaults are stored in the existing shop settings record. They provide initial values for new inventory entries and never overwrite an existing item.

## Repair settings

Repair Settings uses compact sub-navigation:

1. **Repair Types** manages saved service classifications and shows assigned repairs.
2. **Devices** manages device categories/models previously mixed into Devices/Repairs.
3. **Defaults** manages repair classification defaults that are safe to prefill on new repairs and never overwrite existing repairs.

Repair rows remain editable and removable from the main Repairs list and from the assigned-repairs list in Repair Types.

## Repair deletion semantics

- A repair row delete is persistence-first: confirm, call `dbDelete`, verify success, then remove/refresh local state.
- Failed deletion leaves the row visible and displays a clear error.
- Collection-change events refresh every open Repairs and Catalog Settings window after a successful deletion.
- Deleting a defined Repair Type offers two explicit actions:
  - **Delete type only** removes the saved dropdown value and preserves assigned repairs.
  - **Delete type and assigned repairs** deletes every assigned repair followed by the type.
- A recovered type (one inferred from existing repair rows) can be removed only through **Delete type and assigned repairs**. It cannot silently pretend to delete while assigned repair rows recreate it.
- The main Repairs context menu and Repair Settings assigned-row context menu share the same tested deletion helper and outcome handling.

## Distributor/vendor directory

- Vendor names are canonical records in the existing `vendors` collection; no schema change is required.
- The directory displays compact rows with name, relationship, tax status, and linked counts. Expanding a row reveals two concise lists: **Parts** and **Repairs**.
- A part is linked when its normalized `distributor` matches the vendor name.
- A repair is linked directly through its selected inventory part/parent. Legacy repairs without a selected part may be linked by their normalized source/vendor field when available.
- Linked entries open their normal Inventory or Repairs editor rather than duplicating editing forms inside settings.
- Renaming a vendor updates matching inventory distributor values and applicable repair source values so one spelling remains authoritative.
- Creating or renaming detects case/spacing-equivalent names and blocks duplicates. A merge action moves linked records to the chosen canonical vendor and removes the duplicate vendor record.
- Vendor deletion is blocked while linked parts or repairs exist; the user must reassign or merge them first.

## Product URL autofill

- URL import first derives a vendor from the hostname and scraped metadata, then resolves it case-insensitively against canonical vendor records.
- If a matching vendor exists, the saved spelling is used.
- If no matching vendor exists but a reliable vendor name is derived, it is created once through the existing vendor collection and reused thereafter.
- The inventory cost field is filled from the scraped product price when available. Existing intentional values are preserved unless the field is empty or the user explicitly re-runs autofill.
- Blocked or incomplete pages report which fields could not be read; they do not invent a cost.

## Responsive presentation

- Desktop settings use a narrow sub-navigation rail or compact tab strip and a flexible content pane.
- Mobile uses horizontally scrollable settings tabs, stacked editor controls, and expandable vendor cards.
- Linked part/repair lists show key identifying fields only, with search and counts preventing oversized blocks.
- Context-menu actions have accessible button equivalents on touch layouts.

## Data flow and compatibility

- Existing collections remain authoritative: `products`, `repairCategories`, `repairTypes`, `deviceCategories`, `vendors`, and `settings`.
- Normalized comparison helpers are shared by vendor matching, rename, merge, URL autofill, and linked-record grouping.
- No destructive migration or schema change is introduced.
- Existing unrelated workspace and migration changes remain untouched.

## Testing and release

- Add red/green regression coverage for repair-row deletion, recovered/defined Repair Type deletion choices, Admin naming/menu ownership, Inventory settings defaults, canonical vendor matching, rename/merge propagation, linked vendor views, URL-derived vendor/cost autofill, and responsive navigation.
- Run all new focused tests, existing repair/inventory/vendor/URL regressions, renderer and Electron typechecks, web build, and desktop packaging.
- Produce desktop and mobile settings previews and inspect them visually.
- Increment the version using the existing patch-release convention, update release notes with `Web Interface: https://mattstechwisdom.github.io/GB-POS`, push main and the tag, and verify GitHub Release, Pages, installer/APK assets, and update feed.
