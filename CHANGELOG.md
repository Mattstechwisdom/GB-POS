# Changelog

## v0.2.50 (2026-03-07)
- Interactive Quote: signature + date fields are inline on the page (no popup/overlay).
- Interactive Quote: Finalize reliably downloads the signed PDF in one step.

## v0.2.31 (2026-02-20)
- Fix: Quote Generator print/PDF build now compiles cleanly after adding Customer Email.

## v0.2.30 (2026-02-20)
- Quote Generator: added Customer Email field to client info.
- Send Quote Email: email body is edited/saved from the Send Email window; Email Settings is now focused on Gmail app password + sender name.
- Send Quote Email: recipient auto-prefills from Customer Email when available.

## v0.2.29 (2026-02-18)
- Added Quick Sale button next to Generate Quote.
- Quick Sale: enter description + amount, optionally apply 8% tax, then checkout using the standard Cash/Card checkout modal.
- Quick Sale saves into Sales list as "Quick Sale" with the amount collected.

## v0.2.28 (2026-02-17)
- Performance hotfix: main-process JSON DB now uses an in-memory cache to avoid repeated synchronous read/parse.
- Performance hotfix: DB writes are coalesced and written asynchronously to reduce UI lag during frequent saves.
- Performance hotfix: DB debug logging is now gated (prevents massive base64 image payloads from stalling the app).

## v0.2.27 (2026-02-17)
- Custom PC Storage UI: renamed Storage to Primary Storage and updated labels to match other dropdowns.
- Primary/Secondary/Additional storage: one "Add Image" button (up to 2 images) + consistent card layout.
- Secondary/Additional storage: now supports pricing and prints as separate line items.

## v0.2.26 (2026-02-16)
- Custom PC Storage: added the missing Storage price field.
- Custom PC Storage: primary storage now supports 2 images (and the image controls no longer disappear when enabling secondary storage).

## v0.2.25 (2026-02-16)
- Email Settings: you can now edit and save the default email body text used when sending quotes.

## v0.2.24 (2026-02-17)
- Custom PC interactive HTML: "Preview / Download" now generates a PDF download instead of opening the print dialog.

## v0.2.23 (2026-02-16)
- Custom PC quote builder: support multiple images per part category.
- Storage UX: optional secondary storage section + multiple secondary drives.
- Print Preview + HTML: Custom PC parts checklist now mirrors the entered parts list and includes a client notes area.
- Terms and Conditions: expanded slightly for parts availability/price changes and client-caused damage.
- Email/HTML sending: interactive HTML no longer depends on local logo files (safer when emailed as an attachment).

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

## v0.2.22 (2026-02-17)
- fix: clean up quote generator labels
- feat: right-click context menus for lists
- ui: tidy device category actions
- fix: stack source + url fields

## v0.2.41 (2026-03-07)
- Data Management + mobile quote fixes (v0.2.41)

## v0.2.42 (2026-03-07)
- No commits recorded.

## v0.2.43 (2026-03-07)
- No commits recorded.

## v0.2.44 (2026-03-07)
- fix(quotes): typed signatures auto-render while typing in Sign & Finalize popup
- fix(quotes): keep signature/date off the HTML view; apply them only to exported PDF

## v0.2.45 (2026-03-07)
- fix(quotes): Sign & Finalize button fallback wiring (inline onclick + delegated handler)

## v0.2.46 (2026-03-07)
- fix(quotes): pre-open signing popup on tap/click to prevent "Loading" dead-end

## v0.2.47 (2026-03-07)
- fix(quotes): stable global Sign & Finalize handler + init-wait (prevents stuck "Loading")

## v0.2.48 (2026-03-07)
- fix(quotes): prevent Sign & Finalize button HTML from breaking (quote-safe onclick)

## v0.2.49 (2026-03-07)
- fix(quotes): remove popup-based signing; Sign & Finalize now opens an in-page signature + date screen and downloads the signed PDF

## v0.4.3 (2026-04-02)
- No commits recorded.

## v0.4.4 (2026-04-02)
- No commits recorded.

## v0.4.5 (2026-04-04)
- Main screen: Status filter (Open/Closed) is now wired and filters correctly across Work Orders, Sales, and All views.
- Work Orders: Status display/logic now follows the ticket lifecycle status (open / in progress / closed) with safe fallback for older records.
- Quote Generator: “Print” + “Digital” buttons, Email Settings toggle for sending HTML vs PDF-only, and PDF emailing support.
- Customer Overview: Completed quotes now associate by customerId (prevents throwaway/manual entries from attaching to existing customers).

## v0.4.6 (2026-04-04)
- Send Quote Email: HTML/PDF toggle moved into the Send Email window (default: PDF only).

## v0.4.7 (2026-04-05)
- Performance: reduced UI lag while typing/filtering by deferring expensive table recomputations and removing per-row heavy lookups.
- Payments: Checkout now supports partial “Amount to apply” so you can split tender (ex: $50 cash then the remainder on card).
- UI: removed redundant top-right Close buttons on windows that already use the global floating ✕.

## v0.4.8 (2026-04-06)
- Performance: smoother typing in New Work Order by removing expensive deep comparisons from autosave.
- Consultation: client search now uses an in-memory customer cache (no repeated full DB loads while typing).
- Sales: reduced unnecessary recomputation of the shared work-order model while editing unrelated fields.

## v0.4.9 (2026-04-06)
- UI: modal windows reserve space so top-right actions no longer sit under the global floating ✕.
- UI: removed/hid redundant Close/Cancel buttons on windows that already have the floating ✕.
- Consultation: window opens larger and uses a fixed-height layout so the Book Consultation button is always reachable.

## v0.4.10 (2026-04-06)
- Print: Release Form now includes the Pattern Lock diagram on the printout.
- UI: Quote Generator HTML preview toolbar no longer overlaps the global floating ✕.
- UI: Quick Sale hides redundant Close/Cancel buttons when the floating ✕ is present.

## v0.4.11 (2026-04-06)
- Customer Overview: removed the Quotes filter button (quotes are shown only in the bottom Completed Quotes section).
- Customer Overview: Completed Quotes now shows only real saved quote PDFs (prevents debug/placeholder quote entries from appearing repeatedly).

## v0.4.12 (2026-04-06)
- UI: Customer Search and Customer Overview now show a top-right ✕ close button when opened as standalone screens (outside the modal shell).

## v0.4.13 (2026-04-06)
- Work Orders: Device Category and Device fields now accept the top dropdown match when you press Tab (auto-fills, then moves to the next field).
- Checkout: pressing Enter now triggers Save when the checkout form is valid.

## v0.4.14 (2026-04-06)
- UI: modal windows are scrollable again when content is taller than the screen (fixes Quote Generator bottom Save/Print actions being unreachable).

## v0.4.15 (2026-04-06)
- Work Orders: Device Category and Device dropdowns now support Arrow Up/Down to move the highlight and Enter to select (Enter defaults to the top match unless you navigate with arrows).

## v0.4.16 (2026-04-06)
- Performance: reduced input lag in Work Order and Sales windows (device/category typing no longer re-renders the whole window per keystroke; Sales item IDs are now stable so rows don't re-mount while typing).

## v0.4.17 (2026-04-06)
- Devices/Repairs: Clear no longer leaves dropdown popovers open over the form (inputs remain clickable/typable after clearing).

## v0.4.18 (2026-04-07)
- Reports: Batch Out email no longer includes backup details.

## v0.4.19 (2026-04-07)
- Reports: Batch Out timestamp in the email is stamped at send-time (manual + scheduled), so it always reflects when the email was actually sent.

## v0.4.20 (2026-04-07)
- Main screen: pressing Enter in the Work Order # filter now refreshes the list using the current filters.

## v0.4.21 (2026-04-07)
- Work Orders: Tab now selects the highlighted Device Category/Device option (Arrow keys or mouse hover), and no longer gets overwritten by the delayed blur commit.

## v0.4.22 (2026-04-07)
- Reports: manual Batch Out email now sends styled content as the email body (not an .html attachment).
- Reports: scheduled Batch Out email now respects the configured Batch Out time / Send time and no longer spams repeated reports.

## v0.4.23 (2026-04-12)
- Sales (Consultations): added a dedicated "Print Consult Sheet" printout containing all vital consultation info (client info, date/time, reason for visit, address, first-hour quote + driver fee) plus a large notes section for the tech.
- Reports: scheduled Daily Batch email no longer starts with a blank/duplicated section.

## v0.4.24 (2026-04-17)
- Checkout: added split tender payments (Cash + Card) and persists multiple `payments[]` entries so EOD totals reflect both cash and card.
- Checkout: Cash and Cash + Card now use a single "Cash received" field with automatic change/remainder calculations.
- Customer Receipt: printouts now include a Payments section showing cash received/change and card amount (supports Work Orders + linked retail add-on Sales).
- Work Orders: "Add Product" retail add-ons are tracked via a linked Sale, shown inline as read-only rows, and included in checkout allocation + customer receipts.

