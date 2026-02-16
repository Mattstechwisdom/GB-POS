# Changelog

## v0.2.16 (2026-02-14)
- Work order checkout: "Close window" now closes only non-main windows (prevents the whole app from exiting).
- Customer Receipt: print receipt now auto-prints to the default printer (silent) on checkout.
- Customer form: swapped Phone and Email field positions.

## v0.2.17 (2026-02-14)
- Customer Receipt header: client name/phone/email now populate correctly for auto-printed receipts after checkout.
- Customer Receipt: invoice number now preserves leading zeros (matches work orders).

## v0.2.15 (2026-02-13)
- Main screen pagination: bottom Prev/Next controls are now wired to real paging state.
- Pagination is consistent across All, Work Orders, and Sales lists (25 rows/page).

## v0.2.14 (2026-02-13)
- Main screen (All view) unified list: paginate to 25 rows per page so the home list never becomes a long scroll.

## v0.2.13 (2026-02-13)
- Main screen work orders list: paginate to 25 rows per page (prevents long scrolling as the list grows).

## v0.2.12 (2026-02-13)
- Customer Receipt: embed logo as a data URL for reliable PDF export.
- Customer Receipt: updated device/details block ordering to match other printouts and reduced layout forcing that could create an extra blank PDF page.

## v0.2.11 (2026-02-07)
- Sales + work orders: required-field warnings are now non-modal (yellow banner + red markers) and use a 2-click confirm flow (warn on first click, proceed on second).
- Save now closes the Sale/Work Order window after a successful save.
- Removed duplicate Reports button from the main toolbar.
- Product picker windows are now parented to the invoking window (fixes Sales → New item bringing the main window to front).

## v0.2.10 (2026-02-07)
- Sale items now store an optional product URL with a quick "Go to product" action from the items table.

## v0.2.9 (2026-02-06)
- Re-release to ensure CI/CD publishes latest print layout and batch-out backup updates.

## v0.2.8 (2026-02-05)
- Batch Out backups: configurable daily time with auto backup to ProgramData/backups plus manual "Batch Out" control in EOD window; backups stored alongside last-run metadata.
- EOD settings now store batch-out preferences; renderer can see last batch-out timestamp and trigger backups directly.
- Release form device block condensed to three rows (Device/Description, Model/Serial, Password/Problem) for a tighter layout.
- Release form: Problem now has its own expanded box; parts/labor list compacted to give more room to the problem detail.

## v0.2.7 (2026-02-05)
- New End of Day window with autosaved settings, date-range summaries, and email sending; exposed via IPC/preload and toolbar shortcut.
- Toolbar polish: neon Generate Quote call-to-action on the left; Technicians, EOD, Calendar, and fullscreen controls grouped on the right.
- Customer Overview autosave now validates contact details, creates new customers when needed, and supports close-on-save behavior reliably.
- Work order child windows respect closeParent only for spawned dialogs; release form wording consolidated in the final block.

## v0.2.6 (2026-02-03)
- Keep release print to one page: two-column items when long, notes/checklist/terms/signature stay together.
- Show selected device category in the picker and feed it through to printouts.
- Technician lists refresh live (assignment dropdown, filters, tables, unified list) when new techs are added.

## v0.2.18 (2026-02-15)
- feat: notifications + daily look
- UI: lift sidebar print buttons

## v0.2.19 (2026-02-16)
- feat: quiet hours notification rules

## v0.2.20 (2026-02-16)
- feat: repair categories + additional fees

## v0.2.21 (2026-02-16)
- fix: devices/repairs edit UI + delete category

