# Admin Multi-Window and Part-to-Repair Linking Design

## Objective

Make desktop administration genuinely multitaskable by opening every Admin tool in an independent, non-modal Electron window, while improving the workflow for linking inventory parts and parent families to existing or new repairs. Preserve the current full-screen navigation model on mobile and web.

## Scope

Desktop Admin entries covered by the change are Devices/Repairs, Inventory, Distributors/Vendors, Reporting, Technicians, Data Tools, and Dev Menu. Every click creates a new window; multiple windows of the same type are allowed. Existing non-admin ticket and checkout behavior is unchanged.

Inventory gains two repair-linking entry points for repair parts and parent part families:

- **Link to Existing Repair** opens the repair screen with the repair list visible and the selected inventory record preloaded.
- **Create New Linked Repair** opens a focused repair form with the selected inventory record preloaded and only **Link Repair** and **Cancel** completion actions.

On desktop these flows use new Electron windows. On mobile and browser builds they use the existing full-screen application surface.

This release also fixes the Quick Checkout daughter window remaining open after a successful checkout, redesigns the standard checkout popup without removing any existing action or option, and restores Inventory part-field autofill from supported distributor URLs.

## Window Architecture

The toolbar will call explicit preload APIs for Admin tools when running in Electron. Each IPC handler creates a new non-modal `BrowserWindow`, loads the existing query-parameter route for that tool, and uses the shared preload bridge. The handlers will not search for or focus an existing tool window, so duplicates remain allowed.

The browser/mobile fallback continues through the modal/navigation bus because native windows are not dependable or useful on small screens. This keeps browser popup restrictions from breaking admin access.

Window creation will use a shared helper for safe defaults: responsive display-aware bounds, POS icon, dark background, preload script, context isolation, hidden menu bar, and non-modal parenting. Individual tools may retain appropriate minimum sizes.

## Cross-Window Synchronization

The existing `dbAdd`, `dbUpdate`, and collection-change broadcasts remain the source of truth. All relevant admin screens will subscribe to collection changes and refresh their local view when `products`, `repairCategories`, `repairTypes`, `deviceCategories`, `vendors`, or `technicians` change.

Part-to-repair launch context will use an additive structured payload containing:

- source inventory ID;
- whether the source is a parent family, exact variant, or standalone part;
- requested mode (`existing` or `new`);
- available inventory description, device grouping, compatibility, repair type, cost, selling price, vendor, ordering URL, markup, tax, and stock-link identifiers.

Desktop passes the payload through the new-window route payload mechanism. Mobile/browser passes the same shape through its in-app navigation state. No database schema change is required.

## Linking Rules

For an exact part, variant, or standalone part, linking fills empty or inventory-owned repair fields with the inventory cost, selling price, vendor, ordering URL, device grouping, compatibility, markup, tax setting, and exact `inventoryProductId`.

For a parent family, linking sets `inventoryParentId`, clears any stale exact-part ID and exact-part cost metadata, and leaves the repair's customer-facing part charge editable as its default. When the repair is used on a work order, the established variant resolver automatically chooses one compatible variant or prompts for a choice. A chosen variant's configured selling price, internal cost, and markup override the family default for that work-order line; labor remains the saved repair labor charge.

Existing user-entered repair identity fields such as repair title, alternate description, repair category, and labor are not overwritten when linking an existing repair unless empty. Inventory-owned fields and link identifiers are updated to match the selected part so prices and inventory deductions remain consistent.

## User Interfaces

Inventory shows compact, prominent repair-link actions only for parts and parent part families. The existing-link screen shows the current repair list and repair fields, highlights the pending inventory part, and provides a clear final Link Repair action. The new-link screen hides the repair list and unrelated admin management controls, showing only the fields needed to create the repair plus Link Repair and Cancel at the bottom.

The normal Devices/Repairs Admin window remains fully featured when opened directly from Admin.

## Checkout Experience

The checkout popup keeps every current payment scope, payment method, split-tender, cash received, change, print receipt, close parent, mark closed, Clover, Save, and Cancel behavior. Its presentation changes to a clearer card-based hierarchy:

- the amount due is the visual summary at the top;
- payment scope choices use prominent selectable cards instead of plain checkboxes;
- payment methods use compact, clearly selected tiles;
- tender-specific fields appear in an organized detail panel;
- receipt, close-parent, and ticket-status options use styled toggle rows with concise supporting labels;
- the primary completion action and secondary Cancel action remain consistently placed in a responsive footer.

The layout will fit the existing desktop checkout window without unnecessary scrolling and reflow into a single-column, touch-friendly layout for narrow browser and mobile widths. Visual styling will follow the existing dark POS palette and accessibility conventions, including visible focus states, readable selected states, and full keyboard operability.

## Quick Checkout Completion

After a Quick Checkout is successfully persisted and any requested receipt action has been dispatched, the Quick Checkout parent window must close and return focus to the main POS. The close path will use an explicit renderer-to-main acknowledgement where Electron is available, retain a browser fallback, and avoid closing on validation, persistence, or payment failure. The checkout daughter window and Quick Checkout parent will each close exactly once on success.

## Distributor URL Autofill

Entering or pasting a supported distributor product URL in Inventory will trigger the established product-data lookup and populate available metadata such as distributor name, part name, SKU/item number, cost, selling-price inputs, image, and source details. Autofill will fill empty fields and refresh fields owned by the same URL lookup, while preserving unrelated values the user intentionally entered.

The URL field will not lose focus during typing or pasting. Lookup will be debounced or explicitly triggered according to the existing convention so partial URLs do not repeatedly reset the form. Unsupported URLs, incomplete metadata, or network/parse failures leave the form usable and display a concise explanation rather than silently doing nothing.

## Error Handling

The link action validates that the inventory record still exists and that a repair is selected or has required new-repair fields. If another window changed or deleted the source record, the user receives a clear refresh/reselect message. Persistence failure leaves the form open with entered values intact. A successful link refreshes all open Inventory and Devices/Repairs windows through collection-change broadcasts.

Checkout failures leave both checkout windows open with the user's choices intact. Distributor URL lookup failures do not clear existing Inventory form values and can be retried after correcting the URL.

## Verification

Automated checks will cover:

- every desktop Admin toolbar action choosing a native window API with browser/mobile fallback;
- duplicate same-type admin windows remaining allowed;
- structured inventory-to-repair payload construction;
- non-destructive existing-repair autofill rules;
- focused new-repair mode and its Link Repair/Cancel actions;
- parent-family versus exact-part identifiers and pricing behavior;
- cross-window collection refresh subscriptions;
- existing inventory variant selection, consumption, and repair pricing regressions;
- Quick Checkout success closing both checkout surfaces while failure keeps them open;
- preservation of every checkout control and behavior in the redesigned responsive layout;
- keyboard, focus, selection, and narrow-width behavior for the checkout popup;
- distributor URL autofill success, partial metadata, unsupported URL, failure, and preservation of user-entered values;
- renderer/main typechecks, desktop/mobile builds, and Windows installer packaging.

The release will follow the repository's existing version, changelog, tag, GitHub release, and web deployment workflow.
