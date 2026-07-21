# Changelog

## v0.5.16 (2026-07-21)
- Work Orders: fixes populated mobile tickets opening as blank forms by preserving the modal payload through React's safety render.
- Work Orders: repairs Add Product on desktop and Android with a product-only picker, complete inventory metadata, explicit item limits, accurate linked-sale totals, and immediate persistence of the Sale link back to the work order.
- Parts Ordering: removes the manual Scrape action; pasting or committing an Order URL now reads the page automatically, fills available title/vendor/cost fields, applies the default 10% markup, and creates a pending part line when needed.
- Parts Ordering: normalizes common phone and tablet part titles into consistent inventory-friendly names while retaining useful quality and compatibility details.
- Clients: adds a compact client overview with editable contact card and grouped work-order, sale, consultation, and quote history; quotes and consultations can create searchable clients even without a completed sale.
- Mobile: improves client search/add layouts, work-order phone actions, calendar views, and product selection sizing for touch screens.
- Integrations: removes the unfinished Clover and Twilio settings, checkout, messaging, routes, and renderer bridges while preserving existing transaction and customer data.

## v0.5.15 (2026-07-19)
- Inventory: separates Products and Repair Parts with a blue Products toggle, green Add Part action, vendor memory, device type/model fields, stock controls, and a red saved Order URL button.
- Vendors: adds separate Product Vendor and Parts Distributor management, including wholesale/consignment settings, vendor share, tax exemption, and contact details.
- Repairs: replaces duplicate ordering fields in Devices/Repairs and Repair Selection with a shared searchable inventory-part picker while retaining per-work-order dates, order state, and shipment tracking.
- End of Day: adds selectable paid-and-ordered rows that sync part order status back to each work order and send confirmed client email updates where email delivery is configured.
- Reporting: records vendor terms with sold items so historical vendor payout, internal cost, revenue, and profit calculations remain tied to the facts saved at sale time.
- Mobile: keeps customer search columns within phone width and adds non-destructive health checks in Data Tools.

## v0.5.12 (2026-07-18)
- Android Updates: checks the system install-source permission before opening an APK, resumes installation after permission is granted, and dismisses the in-app prompt once installer handoff begins.
- Android Releases: verifies the APK application ID, version, signature, and signing-certificate continuity before publishing so updates install over the existing app.
- Work Orders: clarifies that diagnostic fees remain non-refundable and labor refunds may be declined or issued partially based on work performed and repair circumstances.
- Railway: adds a production build contract that publishes distinct desktop and mobile web entry points together and checks runtime configuration health before deployment completes.
- Railway: serves the real mobile entry point instead of rewriting `/mobile.html` to the desktop SPA fallback.
- Railway: restores the required public Supabase runtime variables and corrects the production domain target from port 3000 to the service's assigned port 8080.
- End of Day: locks the closeout overview and its email to the current local calendar day, refreshes automatically after midnight, and keeps monthly totals and historical filters in Reporting.
- Reporting: removes the daily batch email action so EOD is the single place technicians configure, review, and send the daily closeout.

## v0.5.11 (2026-07-18)
- Parts Ordering: records distributor, internal cost, adjustable markup, order-required status, supplier tax treatment, and order state on each work-order part.
- Parts Ordering: changes the default part markup to 10% while retaining 5% increments and custom percentage entry in Devices/Repairs and Repair Selection.
- Parts Ordering: keeps in-stock parts out of the purchase queue and turns pasted distributor URLs into saved, openable ordering links with scraped title, vendor, and cost details.
- End of Day: adds direct desktop and mobile entry points with labor, parts, products, payment, check-in, closeout, cost, tax, and margin summaries.
- End of Day: adds a parts-to-purchase queue with distributor links, payment verification indicators, and explicit warnings for missing costs.
- End of Day: adds saved report recipients and a concise email flow, with desktop sending and a prefilled mobile email fallback.
- Notifications: opens notification settings as a dedicated window and clarifies the device authorization flow before showing alert choices.

## v0.5.10 (2026-07-17)
- Android Updates: signs every release with one persistent production certificate so future APK updates install over the existing app.
- Railway: binds the hosted web server to Railway's assigned `PORT` and fails clearly when required runtime configuration is missing.
- Work Orders: clarifies that an unusable ordered part may be refunded while the applicable $25 or $50 diagnostic fee remains non-refundable.

## v0.5.9 (2026-07-17)
- Windows Updates: pins the production GitHub release feed explicitly and repeats update checks while the POS remains open.
- Mobile Updates: retries temporary Android WebView network failures, avoids cached release responses, and checks the release list before the latest-release fallback.
- Release Safety: adds an automated feed verifier for version ordering and required Windows/Android update assets.

## v0.5.8 (2026-07-17)
- Parts Ordering: adds URL scraping for part title, cost, device/category details, condition, and source information in the Devices / Repairs workflow.
- Parts Ordering: adds Save Part and Save Repair actions so technicians can retain reusable supplier and repair-template information.
- Work Orders: refreshes Parts Tracking with order and delivery dates, saved Order URL and Tracking URL buttons, clear/save controls, and mobile-friendly sizing.
- Client Search: makes duplicate detection and search agree across Clients, Consultations, and Quotes, including full names, formatted phone numbers, alternate phones, and email.
- Client Search: pages complete Supabase customer reads so older clients remain searchable as the database grows.
- Railway / QR: validates public Supabase runtime settings, supports standard Railway variable aliases, and loads runtime settings before the mobile web app starts.

## v0.5.7 (2026-07-17)
- Notifications: adds per-device notification permission and settings for mobile/Android, with a checklist for consultation reminders, new work orders, new sales, parts delivery, calendar events, technician schedule changes, and Daily Look.
- Notifications: schedules native Android consultation reminders with selectable hour lead times and keeps browser/Windows notification fallback support where available.
- Notifications: syncs work order, sale, calendar, and technician changes into the notification system on both desktop and mobile.
- Mobile: keeps Notification Settings inside the mobile modal shell without an extra internal Close button.
- Android: registers the Capacitor local notifications plugin so future APK builds can request OS notification permission.

## v0.5.6 (2026-07-17)
- Login: replaces the visible email/password form with a shop username/PIN form and routes the configured `Gadgetboyz` username to a hidden Supabase Auth email.
- Login: blocks direct email entry in the POS login screen so the shop alias is the only visible sign-in path.
- Technicians: prevents Supabase login-only staff profile rows from appearing as assignable technicians in consultation, work-order, calendar, reporting, and mobile filters.
- Mobile: hides the Supabase profile name from the side drawer and shows a generic shop session label instead.
- QR / Client Updates: adds cloud-backed QR status tokens so status/client update links can resolve through Supabase instead of relying only on the desktop status server.
- Work Orders: adds the in-app Update Client panel and keeps customer/status QR flows available from desktop and mobile app screens.

## v0.5.5 (2026-07-16)
- Mobile Updates: fixes Android version comparison so newer patch releases are detected correctly after this update.
- Quick Sale: supports multiple items in one checkout using the same item table and product picker as the Sales form.
- Quick Sale: saves full sale item arrays so receipts, reports, sync, and backups treat quick sales like normal sales.
- Printouts: reduces sales/work-order QR size and widens client info so Date/Time and customer rows stay on one line.
- Devices/Repairs: shows recovered service types from saved repair items in the Service Types editor.

## v0.5.4 (2026-07-16)
- Mobile: removes the bottom-bar Sync button because Sync Now already lives in the side menu.
- Mobile: centers the top GADGETBOY POS title and keeps the version label grouped with POS when the title stacks.

## v0.5.3 (2026-07-16)
- Mobile Updates: adds an Update button above Sync Now in the mobile side menu when a newer Android APK is available.
- Mobile Updates: shares one update checker between the popup and side-menu button so both find the same latest APK release.
- Android: downloads the APK through the native app bridge and opens Android's installer prompt to finish the update.

## v0.5.2 (2026-07-16)
- Repairs: restores the desktop New Item / Repair Selection layout while keeping the compact mobile repair table only on mobile.
- Repairs: makes Diagnostic show first, Additional Fees second, and all other repair categories alphabetically in lists and filters.
- Repairs: fills missing category filters from the saved repair items when the category/type list is incomplete.
- Mobile: lets the top GADGETBOY POS title wrap onto two lines instead of cutting off on narrow screens.
- Work Orders: restores the desktop work order creation sidebar layout while keeping the mobile title card and status/date menu on mobile.

## v0.5.1 (2026-07-16)
- Work Orders: reworks Parts tracking with side-by-side order and estimated-delivery dates, a cleaner mobile/desktop layout, and internal-only order notes.
- Work Orders: turns saved Order URL and Tracking URL values into openable buttons after paste, Enter, blur, or Save.
- Work Orders: keeps selected repair order-source URLs flowing into Parts tracking without adding website-scraper logic to work orders.
- Work Orders: hydrates linked customer details when opening existing work orders so synced preview records retain client information.
- Mobile Preview: allows the drawer preview menu to close and reopen while testing the full mobile interface.

## v0.5.0 (2026-07-16)
- Inventory: adds markup-aware part pricing with a default 5% markup and quick presets for 5%, 10%, 15%, 20%, and 25%.
- Inventory: turns saved vendor/order URLs into an Order URL button after paste, Enter, blur, or save, with Edit and Clear actions.
- Supabase: adds markup sync fields for inventory products and repair templates so part pricing settings persist across devices.
- Backup Import: preserves inventory and repair-template markup percentages during Supabase backup imports.
- Repairs: applies the same order URL button behavior to repair templates and selected work-order repair parts.
- Mobile: fixes the Devices/Repairs window so the catalog list, form, and Repair Selection table fit and scroll correctly on phone screens.

## v0.4.99 (2026-07-16)
- Mobile Updates: finds the newest GitHub release that includes an Android APK instead of ignoring updates when the latest release asset set is incomplete.
- Mobile Updates: shows a dimmed in-app update prompt after login with Update now and Skip for now actions.
- Mobile Updates: makes Skip for now apply only to the current open app session so the reminder returns on relaunch.

## v0.4.98 (2026-07-16)
- Inventory: refreshes the Parts/Products window with compact catalog-style rows, search-bar filters, low-stock filtering, and add/edit controls in the detail pane.
- Inventory: adds multi-device associations for shared repair parts like universal power cables.
- Supabase: adds product inventory metadata fields for item type, part category, distributors, reorder links, and associated devices.
- Admin: moves Local Backup into Data Tools, removes separate Products navigation on mobile, and hides Clover/Twilio setup from the visible desktop/mobile menus.
- Notifications: merges notification settings into the Notifications window behind a Settings toggle.
- Reporting: defaults reports to daily totals, keeps date ranges explicit, and adds month-end commission/audit reporting.
- End of Day: separates parts charged from parts cost, and products sold from product cost, using saved internal-cost values only.

## v0.4.97 (2026-07-16)
- Mobile: refines the Repair Selection table so Device, Category, Repair, P, L, and Total all fit inside the visible phone/tablet width.
- Mobile: moves Repair Selection filters behind the three-line search control and keeps Show All inside that filter panel.
- Mobile Updates: opens Android APK downloads through the native Android browser/download handler and keeps the APK version synced to the release version.
- Work Orders: strengthens client snapshot handling so newly created work orders retain visible customer details while cloud sync catches up.
- Work Orders: adds a Repair Journal flow for archived internal notes tied to each work order.
- Parts Tracking: improves order URL handling with saved/openable order links and selected-repair URL carryover.
- Repairs: improves Repair Selection naming and mobile repair form layout for touch use.

## v0.4.96 (2026-07-13)
- Mobile: reorganizes the side menu into priority actions, Client Database, Technician Tools, and Admin sections.
- Mobile: refreshes the main toolbar with the GadgetBoy logo, larger purple brand text, version label, slimmer header, and search-bar filter menu.
- Mobile: improves touch behavior with draggable action sheets, full-screen modal close buttons, and responsive quote layouts for portrait and landscape.
- Quotes: adds Sales/Repairs switching, Search Client/Add Client actions, selected-client summaries, and saved quote refresh events on desktop and mobile.
- Supabase: adds saved quote cloud sync support so quote records are included with synced/backed-up shop data.
- Backup: includes Saved Quotes in the local backup selection list.

## v0.4.95 (2026-07-13)
- Mobile Updates: checks for a newer Android APK after mobile login and cloud session readiness.
- Mobile Updates: rechecks when the Android app comes back to the foreground or reconnects online.
- Mobile Updates: Skip is now skip-for-now for the current app session instead of hiding that APK version forever.

## v0.4.94 (2026-07-13)
- Mobile: uses the same GadgetBoy logo as the desktop app for Android launcher icons.
- Tooling: Android launcher icons are regenerated from `public/logo.png` during the existing icon generation step.

## v0.4.93 (2026-07-13)
- Mobile: replaces the Android APK desktop-shrunk view with a touch-first mobile home screen.
- Mobile: adds drawer navigation, bottom quick actions, card-based work order/sale lists, and long-press action sheets.
- Mobile: opens POS windows inside a full-screen mobile shell while keeping the desktop app layout unchanged.
- Release: GitHub release titles now use the version tag number.

## v0.4.92 (2026-07-13)
- Mobile: adds a Capacitor Android APK build target with a mobile-only entrypoint and Android project.
- Mobile: adds a Supabase-backed mobile data bridge so Android uses the same shop cloud data as desktop/web after login.
- Mobile Updates: Android checks the latest GitHub release for the Android APK asset, while Windows keeps using the Windows auto-update feed.
- Release: prepares the mobile release assets so GitHub releases can include the Windows setup installer and Android APK.

## v0.4.88 (2026-07-13)
- Auth: prevents same-user session refreshes from briefly clearing the staff profile and showing the login screen again.

## v0.4.87 (2026-07-13)
- Supabase: suppresses the unused Realtime WebSocket transport warning in Electron main-process cloud database checks.

## v0.4.86 (2026-07-13)
- Startup: replaces blank auth/cloud wait states with visible status screens.
- Supabase: falls back to cached local data with a warning instead of blocking the app on cloud session errors.

## v0.4.85 (2026-07-13)
- Windows: removes the startup loading overlay for every child-window route so New Work Order and related windows render normally.

## v0.4.84 (2026-07-13)
- Supabase: waits for the cloud session and verifies cloud database access before showing the main POS tables.
- Supabase: successful cloud reads now seed the local cache so recently loaded records remain visible offline.
- Offline Sync: local add/update/delete actions now queue Supabase writes when offline and replay them after login/network returns.

## v0.4.83 (2026-07-13)
- Clover: checkout now sends the applied payment amount to Clover instead of the original selected due amount.
- Clover: successful Clover card handoff now saves the POS checkout result automatically.

## v0.4.82 (2026-07-12)
- Auto Update: installs downloaded updates silently instead of showing the setup wizard.
- Auto Update: increased the update progress window height so the action buttons are not clipped.

## v0.4.81 (2026-07-12)
- Clients: added a duplicate-client failsafe before creating a new client from Customer Overview or Consultation Booking.
- Clients: warns when first/last name, matching phone field, matching alt phone field, or email already exists.
- Clients: duplicate warning can open the existing client info window without creating another record.

## v0.4.80 (2026-07-12)
- Auto Update: replaced the silent update download flow with a GadgetBoy-styled progress window.
- Auto Update: shows download progress, install-ready state, applying-update state, and visible failure details.
- Auto Update: keeps Skip for Now behavior so skipped updates are offered again on the next launch.

## v0.4.35 (2026-06-06)
- Calendar: Daily Look consultations now include direct actions to open the linked consultation sale and customer info.
- Calendar: consultation event edit popup now also includes "View Consultation Sale" and "View Client Info" actions.
- Printouts: work order release/receipt and sales receipt flows now consistently show full client contact details (name, phone, email, and alt phone when available).
- Quick Sale: window now closes automatically after a successful checkout flow.
- SMS: Customer Overview includes in-window Twilio SMS settings and direct Text Customer sending.

## v0.4.30 (2026-05-11)
- Performance: reduces intermittent UI freezes during autosave bursts by streaming DB writes in the main process (keeps the event loop responsive during large JSON saves).
- Performance: prevents customer list reload thrash across windows during frequent autosaves (per-window caching + subscriptions refresh only on `customers:changed`).
- Performance: faster client lookup while typing in Quote Generator and Consultation booking (precomputed search index + early-exit limiting).

## v0.4.29 (2026-05-05)
- Consultation: fixed untypeable Consultation Details fields caused by the customer search dropdown overlaying the form.
- Tooling: removed deprecated TypeScript config options to clear VS Code Problems diagnostics.

## v0.4.28 (2026-05-02)
- Work Order Checkout: add-on products are treated as Parts during checkout (Parts/Labor selection stays available), and payments correctly apply to the attached product sale.

## v0.4.27 (2026-04-30)
- Autosave: prevents lockups by avoiding back-to-back queued saves while typing (queued saves now respect the idle/debounce window).
- Customers: improves data entry with auto-capitalized names, phone auto-dashes + format warning, and common email domain suggestions.
- Work Orders: autosave runs after a longer idle window to reduce typing lag.

## v0.4.26 (2026-04-30)
- Startup: shows the loading screen immediately on launch (no gray flash before the app renders).
- Customers: autosave is more efficient and avoids save-loops/hangs during data entry (saves serialize and only run after actual edits).
- Work Orders: autosave triggers after a longer idle window to reduce typing lag.
- Main screen: replaced Customer Search with separate Add Client and Search Client buttons.

## v0.4.25 (2026-04-24)
- Quote Generator: Create Sales form flow — select items via checkboxes and auto-create a Sales ticket for the selected customer (opens the Sale ticket for checkout).
- Performance: main-process DB writes are faster (compact JSON) and collection change events are coalesced to reduce UI freezes during frequent autosaves.
- Performance: Recent Customers no longer reloads/sorts the full Work Orders list on every change (bounded query + debounced refresh).
- Calendar: autosave no longer uses expensive deep JSON equality for change detection.
- Reports: Trends bars now scale with headroom so the biggest bar isn’t always maxed-out.
- Reports: Popular devices now groups by specific device/model (e.g., “PS5”) instead of the broad category.
- Repairs: fixed Devices/Repairs edit form lock (fields stayed untypeable after Cancel/Delete) and added Enter-to-save workflow across key forms.

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

## v0.5.15 (2026-07-19)
- No commits recorded.
