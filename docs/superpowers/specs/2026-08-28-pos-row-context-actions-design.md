# POS Row Context Actions Design

## Goal

Make editable or removable POS rows expose their existing actions through a consistent desktop right-click and mobile press-and-hold menu. Repair and device catalog rows must support edit and delete, while client-history lists must move deletion from bottom action buttons into the applicable row menu.

## Scope

The change covers saved repair types, assigned repairs, device categories, devices, inventory products and parts, vendors, technicians, editable work-order and sale line items, and client-history work orders, sales, and consultations.

Reports, payment entries, accounting ledgers, notifications, EOD history, and other records that do not currently expose edit or delete operations remain read-only. The feature does not introduce new deletion permissions, database operations, or schema changes.

## Interaction Model

- Desktop rows open their action menu with right-click.
- Touch and pen users open the same menu with a deliberate press-and-hold.
- Menus identify the selected row in a header and display only applicable actions.
- Edit or Open uses the record's existing editor/window.
- Delete or Remove uses the record's existing persistence method and confirmation language.
- Destructive actions retain explicit confirmation before saving.
- Rows remain selectable and preserve their existing click and double-click behavior.

## Existing and New Coverage

Repair-type, assigned-repair, device-category, device, work-order-item, and sale-item menus already follow the shared context-menu pattern. Their behavior will be regression-tested and aligned where necessary.

Inventory, product, vendor, and technician lists will receive row menus only when an existing editor and delete operation are already available. Client-history work-order, sale, and consultation rows will receive Open/Edit and Delete actions matching the controls they currently expose. Bottom-of-list Delete buttons in client history will be removed after the row actions are available.

## Safety and Data Integrity

This design relocates existing actions rather than changing authorization. Existing confirmation prompts, database collection names, refresh subscriptions, and cloud synchronization paths remain authoritative. A menu action must capture the row that opened it rather than relying on a later selection, preventing the wrong record from being changed.

Historical financial records that have no current delete action will not gain one. Where client history already permits deleting a ticket, the context menu retains that behavior exactly.

## Responsive Behavior

The existing shared `ContextMenu` and `useContextMenu` utilities provide viewport clamping, dismissal, keyboard-safe focus handling, and menu styling. Existing mobile long-press conventions will be reused so touch behavior matches work-order and sale item rows.

## Verification

Regression tests will verify:

- repair types, repairs, device categories, and devices expose Edit and Delete;
- applicable inventory, product, vendor, technician, and transaction rows expose only supported actions;
- client-history work-order, sale, and consultation rows open the correct record and delete the exact row after confirmation;
- client-history bottom Delete buttons are removed;
- immutable accounting/reporting rows do not gain destructive actions;
- context menus work in desktop and mobile layouts without horizontal overflow;
- typechecks and production desktop/mobile builds pass.

The release will use the repository's next available patch version and established GitHub tag workflow.
