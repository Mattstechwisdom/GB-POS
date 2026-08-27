# GadgetBoy POS Instructions

This manual is the operating guide for GadgetBoy POS on Windows and Android. It is regenerated for every release so the version number and release date stay aligned with the installers.

> Data safety rule: never clear, overwrite, restore, merge, or import production data unless you understand the effect and have a verified current backup. Normal POS use syncs records through Supabase; local backups are an additional recovery layer, not a replacement for cloud sync.

## 1. Quick Start

1. Install GadgetBoy POS using the Windows installer or Android APK from the matching GitHub release.
2. Open the app and sign in with the shop login. The shop login grants access to the shared database; it is not a technician identity.
3. Wait for the initial sync to finish before judging whether records are missing.
4. Confirm the main screen shows recent work orders and sales.
5. Open Technicians and select or clock in the technician who is actually doing the work.
6. Use Search Client before creating a client to reduce duplicate records.
7. Create a local backup before any restore, import, bulk repair, or database maintenance.

## 2. Platforms and Navigation

### Windows

- The top toolbar contains Admin, Generate Quote, Quick Sale, Consultation, End of Day Report, Notifications, Calendar, and search.
- Admin contains Devices / Repairs, Inventory, Distributors / Vendors, Reporting, Technicians, Data Tools, and Dev Menu.
- Daughter windows use their in-app close control when provided. Standard Windows controls remain available on true native windows.
- Full screen can be toggled from the toolbar.

### Android

- Tap the three-line menu to open the main drawer.
- Priority actions appear first: Generate Quote, Consultation, Quick Sale, and End of Day Report.
- Client Database contains Search Client and Add Client.
- Technician Tools contains Technicians, Calendar, and Diagnostic Tools.
- Admin contains Devices / Repairs, Inventory, Distributors / Vendors, Reporting, and Data Tools.
- Sync Now refreshes shared records. Update appears when a newer compatible APK is available.
- Long-press an item where the desktop app would normally offer a right-click menu.
- Phone-only actions can open the default dialer or messaging app with the client number already filled in.

## 3. Login, Sessions, and Technician Identity

- The shop username and PIN/password are only for opening the POS and accessing Supabase.
- The login profile must not be used as a technician, salesperson, or commission identity.
- Technician assignment comes from the Technicians records inside the POS.
- A valid saved session normally keeps the device signed in between launches.
- Sign Out ends the saved session on that device. Closing an ordinary daughter window must not ask for login again.
- Never place the Supabase service-role key in the app, installer, APK, source control, or a technician-facing settings screen.

## 4. Cloud Sync and Offline Work

- Supabase is the shared source for customers, work orders, sales, technicians, time entries, calendar records, device and repair catalogs, inventory, vendors, quotes, settings, and other supported collections.
- A saved record should become available to other signed-in devices after sync.
- The app may retain local records while offline and send queued changes when connectivity returns.
- Do not uninstall, clear app storage, or restore an older backup while offline work is waiting to sync.
- After reconnecting, use Sync Now and verify the newest customer, work order, and sale from another device.
- Pagination only changes what is visible. Records beyond the current page remain stored and synced.

## 5. Client Workflow

### Search Before Adding

1. Open Search Client.
2. Search by first name, last name, phone, or email.
3. Open the matching client profile and confirm contact information.
4. Use New Work Order, New Sale, or the saved history from that profile.

### Add a Client

1. Open Add Client.
2. Enter the client name and at least one reliable contact method.
3. Review phone and email carefully because update messages use these fields.
4. Save the client, or continue directly to New Work Order or New Sale.
5. If the duplicate warning appears, open the existing record and compare it before creating another.

### Duplicate Protection

- A duplicate warning can be triggered by matching first and last name together, primary phone, or email.
- An alternate phone on a different client should not be treated as a primary-phone match.
- If a warning appears but search finds nothing, broaden the search, clear filters, and search the exact phone digits or email.
- Use Data Tools duplicate review only after creating a current backup. Merging permanently repoints related records to the selected client.

### Client Profile

- The profile card shows contact information and provides New Work Order and New Sale.
- Use the pencil icon to edit client information, then save.
- History can include work orders, sales, consultations, and saved quotes.
- Editing a client updates the shared client record; it must not create a new technician or login profile.

## 6. Work Order Check-In

### Standard Drop-Off

1. Search for the client or add a new client.
2. Choose New Work Order.
3. Verify the client information shown at the top of the work order.
4. Select the assigned technician.
5. Choose the work order type and enter the device, serial/IMEI when available, reported issue, accessories, condition, and intake source.
6. For most unknown faults, add the appropriate diagnostic fee. Obvious repairs such as a visibly damaged screen may use the known repair instead.
7. Add intake notes and any customer-visible details.
8. Save the work order before printing.
9. Print the work order form. Ask the client to verify the contact information and sign the terms.
10. Confirm the saved work order shows the client name rather than only a client number.

### Durant Report

1. Choose Durant Report beside the other work-order types for AV or sound equipment that may require Durant Media.
2. Complete the client, equipment, condition, issue, notes, technician, and line-item fields just as you would for a standard work order.
3. Save the ticket before handoff so the shared POS retains the complete record.
4. Choose Send to Durant, verify the partner email address, and send the generated ticket summary.
5. Keep the work order in the normal shop workflow until responsibility, status, and customer communication are confirmed.

### Diagnostic-First Process

1. Record the initial symptom without claiming an unverified diagnosis.
2. Collect the diagnostic payment when shop policy requires it.
3. Save the payment to the work order.
4. Start the diagnostic update from the client update panel or QR workflow.
5. Add findings to Internal Notes or Repair Journal.
6. Add the confirmed repair and required part only after diagnosis supports it.
7. Apply the diagnostic fee against final labor when required by shop policy.

### Work Order Items

- Add Repair opens Repair Selection and uses the permanent Devices / Repairs catalog.
- Add Product uses the product inventory picker.
- One-off custom entries can be entered for a work order without changing the permanent catalog.
- Verify quantity, part charge, labor charge, tax treatment, discounts, and total before checkout.
- Internal part cost is never the client-facing part price.

### Internal Notes and Repair Journal

- Internal Notes are for technician observations not intended for the customer printout.
- Repair Journal keeps saved notes tied to the specific work order.
- Record the date, technician, test performed, result, and next action.
- Journal entries are part of the work-order data and should be included in full backups and cloud sync.
- On Android, client information and Update Client appear first. Status & Dates sits above Assigned To, while Parts Tracking and Internal Notes expand only when needed.

## 7. Client Updates and QR Codes

- Work-order QR codes open the client update page for that ticket.
- Sales Forms and Customer Receipts contain a sale-specific QR code that opens the update workflow for that sale.
- Consultation Sheets contain a consultation-specific QR code tied to the consultation calendar entry and reminder workflow.
- In work-order, sale, and consultation windows, Update Client is directly beneath client information and opens the matching record type without scanning.
- A new work order must be saved before Update Client becomes available because the update history requires a real invoice number.
- Save and sync a new sale or consultation before printing or opening Update Client so its Supabase-backed QR identity exists.
- Each update must save to the ticket history before or while the customer message is sent.
- Desktop sends customer updates by email.
- Android can send email or open the phone messaging app with a prepared message and recipient. The technician still presses Send in the messaging app.
- Select History at the top of Update Client to open the invoice's complete update archive. The same History window is available when the page was opened from a scanned QR code.
- History is scoped to the active shop, invoice type, and invoice number. It shows newest updates first with the timestamp, recipient, message, estimated date, and delivery result.
- The summary at the top separates total, sent, queued, and failed updates. Use Refresh when an email was queued and you need its latest delivery result.
- Close History with its X, the Escape key on desktop, or the shaded area outside the window on mobile.

### Typical Update Stages

1. Diagnostic started.
2. Diagnostic completed or estimate ready.
3. Part required.
4. Part ordered.
5. Part received.
6. Repair in progress.
7. Repair completed and ready for pickup.
8. Pickup or closed.

### If Update Buttons Do Not Work

1. Confirm the scanned link opens the page titled **GB Update Interface**. New work-order, sale, and consultation codes all use a Supabase-backed token instead of a shop-computer IP address.
2. Confirm the installed app can connect to Supabase.
3. Confirm the client has a valid email or phone.
4. Retry from Update Client inside the POS.
5. Check ticket History to determine whether the status saved even if delivery failed.
6. Report the exact work-order number and error; do not repeatedly create replacement work orders.

## 8. Parts Ordering on a Work Order

### Part Already in Stock

1. Select the saved repair or part from inventory.
2. Confirm the inventory quantity and internal cost.
3. Add the client-facing part price and labor to the work order.
4. Complete checkout. A saved, stock-tracked inventory item is consumed once; it is not added to the supplier cart merely because it was sold or used.
5. Reporting treats the saved internal cost as COGS and the client-facing part amount as parts revenue.
6. To replace the used stock, open Inventory, select the saved listing, and explicitly choose Add to Cart.

### Part Must Be Ordered

1. Find the correct part on the distributor website.
2. Paste the HTTPS order URL into Parts Tracking.
3. The POS identifies the distributor from the URL. Enter and verify the part title and cost manually.
4. Verify every scraped value against the source page before saving.
5. Use the default 10 percent markup or choose/enter the approved markup.
6. Confirm the resulting sold price. The customer sees the sold price, not internal cost.
7. Enter order date and estimated delivery when known.
8. Mark Tax Exempt only when that distributor/order is actually tax exempt.
9. Save. The URL becomes an Order URL button.
10. Take the part payment according to shop policy and record it on the work order. The EOD cart warns when a client-linked item does not show verified payment.

### What Order Part Does

- The Order URL button opens the distributor product page.
- It does not guarantee the item is added to a cart and does not place or pay for an order.
- The technician must confirm model, variant, condition, quantity, shipping, tax, and final price on the distributor site.
- At End of Day, use the parts-to-order list to open each distributor cart and mark only genuinely paid orders as ordered.

### Saving Parts and Repairs

- Save Part adds verified part information to the permanent Parts inventory/catalog.
- Save Repair saves a reusable repair definition and includes the selected saved part when supported.
- Use permanent save only for standardized entries worth reusing. One-off work-order details should remain on that ticket.

## 9. Devices / Repairs

- Devices define models used by reusable repair records.
- Repair categories organize services. Diagnostic must appear first, Additional Fees second, and remaining categories alphabetically.
- Service and repair lists can be searched and filtered by category/device.
- The left catalog list is the scrolling workspace; the editor on the right remains available while a repair is selected.
- Select **Specific to a device**, choose the broad Device Category, then choose an Exact Device when the repair applies to one model. Leave Exact Device on **All devices in category** for category-wide repairs.
- Use **Update Repair** only to save changes to the selected repair. Use **Add New Repair** to create a separate catalog record from the current fields.
- Right-click a repair, device, device category, or repair type for edit and delete actions. On Android, touch and hold the same row.
- Select a device-category or repair-type count row to expand the devices or repairs assigned beneath it.
- Repair Selection shows device, category, repair title, part price, labor, and total.
- On mobile, long values are shortened visually; opening the row shows the complete record.
- Use Select Part to pull from Parts inventory rather than duplicating ordering data in multiple places.
- Catalog edits affect future selections. Existing completed tickets should retain their recorded historical values.

## 10. Inventory

### Parts

- Parts are repair components organized by device type and device model.
- Use the compatible-device selector to assign one clean reusable part title to every model it fits. For example, save `HDMI Port` once and associate each supported console instead of duplicating the device name in the part title.
- Set Repair Type to the reusable catalog repair name, such as `HDMI` or `Screen Replacement`. At checkout, the POS combines that repair type with the work order's saved device category, device name, and model to choose the compatible part. A PS5 HDMI repair therefore consumes a PS5-compatible HDMI port, while the same repair name on an Xbox consumes the Xbox-compatible part.
- Store condition, SKU, quantity, internal cost, markup, sold price, distributor, order URL, and tax status where available.
- Used and new parts must be distinguishable.
- A saved order URL becomes a button after save.
- When a part is used, verify inventory quantity decreases and reporting receives both cost and sold amount.

### Products

- Products are devices or merchandise sold to customers.
- Organize products by device type and product category.
- Record condition, SKU, quantity, internal cost, sold price, and vendor.
- A product that works with multiple device models can retain those associations when supported by the entry form.
- Adding a product to a sale or work order must preserve the selected product title, quantity, cost, and client price.

### Adding an Inventory Entry

1. Select Parts or Products.
2. Choose Add New.
3. Paste and verify the order URL when available.
4. Select device type/model or product category.
5. For a Part, type and select each compatible device model, then choose Save beside the compatibility field. Selected models remain visible as removable labels.
6. Enter the normalized title, condition, SKU, and on-hand quantity.
7. Select or add the Vendor / Distributor.
8. Enter internal cost.
9. Select or enter markup and verify sold price.
10. Enable stock tracking, set Low Alert At, and enter the MOQ / Reorder Qty the shop normally purchases when restocking.
11. Save, then search for the new record to confirm it exists.

For automatic repair-part deduction, the Part must have stock tracking enabled, a positive on-hand quantity, a Repair Type matching the repair selected on the work order, and every compatible saved device selected. The repair title itself should remain generic; do not add the console or phone name solely for inventory matching.

### Low-Stock Restocking from EOD

1. Using an in-stock saved part or product on a work order or sale deducts its quantity once when the transaction is saved or checked out.
2. A work order that closes after full payment deducts its installed in-stock part even when the client-facing part charge is zero and the entire payment is recorded as labor.
3. On startup, desktop and Android safely retry checked-out work-order deductions that did not finish previously. Per-line consumption markers prevent a second device or later launch from subtracting the same item twice, and repairs completed before an inventory listing was created are ignored.
4. If the remaining on-hand quantity stays above Low Alert At, no purchasing task is created.
5. When on-hand quantity reaches or falls below Low Alert At, End of Day Report shows the item in Low Stock.
6. Select the low-stock row and choose Add MOQ to Cart to add the saved MOQ / Reorder Qty to the purchasing cart. The action will not create a second pending restock for the same inventory item.
7. Choose View Item to open the exact saved inventory record and verify cost, distributor, URL, threshold, or MOQ before ordering.
8. Choose Dismiss only when no restock is needed at the current stock level. Dismissal does not edit inventory and the alert returns when the stock state changes.
9. Adding MOQ to Cart does not increase on-hand inventory. Stock increases only after the distributor cart is paid and verified through EOD checkout.

### Add a Saved Inventory Item to the Purchasing Cart

1. Open Inventory and select the saved Part or Product listing.
2. Confirm its Order URL, Vendor / Distributor, title, and supplier cost.
3. Choose Add to Cart beside the Order URL.
4. Enter the quantity to purchase.
5. Enter Full Supplier Cost for the full quantity. Include known checkout costs; final shipping, tax, or fees can also be entered in the distributor cart at EOD.
6. Choose Add to Cart again to confirm.
7. The entry is now pending in End of Day > Cart. Inventory on-hand quantity does not increase yet.
8. After the distributor checkout is verified in EOD, the purchased quantity is added to this inventory listing.

### Inventory and Cart Rules

- Selling or using an in-stock item reduces tracked stock and records COGS, but does not automatically create a supplier purchase.
- Restocking is explicit. Use Add to Cart on the selected inventory listing.
- A work-order or sale item marked as requiring an order can appear in the EOD cart without becoming a permanent inventory listing.
- A manually added EOD cart item is a purchasing record only. It does not silently create or change a permanent catalog entry.
- Never increase stock merely because an item was placed in the cart. Stock increases only after verified supplier checkout for an inventory restock.

## 11. Distributors and Vendors

- Parts distributors and product vendors are separate records even when the company name is the same.
- Record contact and ordering information, tax-exempt status, and notes.
- Vendor consignment/percentage settings are for products sold on behalf of another party.
- Reporting can use the vendor percentage to separate vendor amount owed from shop profit.
- Never infer tax exemption or commission percentage; use the verified agreement and entered values.

## 12. Sales and Quick Sale

### Quick Checkout Product Selection

1. Open Quick Checkout and select Sale.
2. Choose Pick product to open the permanent product catalog. Search and filter the list as needed.
3. Check every product needed for this checkout. Selecting a row opens temporary sale-only fields on the right on Windows; on Android it opens a dedicated full-width editor so every field and Save remain reachable. Quantity, price, cost, condition, vendor, and URL changes here do not overwrite the permanent inventory listing.
4. Choose Add Selected to add all checked products at once. The checkout line-item list is the only scrolling list on desktop; the temporary editor remains beside it.
5. Select any checkout line to review or temporarily edit it. Save closes the editor and applies the change only to this checkout.
6. Verify subtotal, tax, and total, then choose Checkout. Tracked inventory is reduced by the recorded quantity only after the completed transaction is saved.
7. On Android, choose Back to items after reviewing a line, or Save to apply its temporary edits and return automatically. The catalog/list and editor occupy the available work area one at a time so the totals and Checkout action remain reachable in portrait and landscape.

### Quick Checkout Repair Selection

1. Select Repair in Quick Checkout.
2. Search the repair catalog and add each required repair line.
3. Select a line to edit its temporary description, part charge, labor/price, supplier cost, ordering details, or quantity without changing Devices / Repairs.
4. Verify the line-item list and totals before Checkout.

### New Sale

1. Open a client and choose New Sale.
2. Add one or more products/items.
3. Confirm quantities, prices, discounts, taxes, and totals.
4. Open Checkout.
5. Record the actual payment method and amount received.
6. Print or save the customer receipt.
7. Confirm the sale appears in the client history and reporting.

### Quick Sale

1. Open Quick Sale.
2. Add each item with Add Item.
3. Review the item list and totals.
4. Open the standard Checkout window.
5. Complete payment and receipt handling.

- Quick Sale supports multiple items in one checkout.
- Do not complete payment until every item and price matches what is physically being sold.

## 13. Checkout and Payments

- Checkout uses the same payment window for work orders, sales, and Quick Sale where supported.
- Work-order checkout shows the current remaining total and separate Parts, Labor, and Both choices on Windows and Android.
- Confirm the chosen payment bucket before saving a deposit. The saved payment returns to the work order with explicit parts and labor allocations.
- Record only money actually received.
- For split/deposit workflows, verify the remaining balance after each payment.
- Diagnostic fees and part deposits must remain attached to the correct work order.
- On pickup, charge the remaining approved labor and other balance.
- Print Customer Receipt and, when applicable, Print Release Form.
- If a part fails or is unsuitable, follow the printed terms and management approval for part/labor refund handling.

## 14. Quote Generator

1. Open Generate Quote.
2. Search for an existing client or add a client. Saving valid new contact information creates a searchable client even if no sale is completed.
3. Choose Products or Repairs.
4. Add quote items.
5. For product autofill, paste the product URL and choose Autofill.
6. Verify detected device type, model-specific fields, condition, pictures, cost, and summary.
7. Autofilled product quotes default to 15 percent markup; adjust if approved.
8. Edit any field as needed. Autofill is assistance, not authoritative source data.
9. Save the quote so it appears in the client quote history and syncs.
10. Create Sale and select the quote items to carry into the sale.

### Autofill Rules

- The tool attempts to read structured product metadata, visible page data, and product images.
- It should choose only fields that belong to the detected device type.
- Selected condition and live page variants may not be visible to every website reader. Always compare against the browser page.
- Images must depict the quoted item; remove unrelated images.
- The generated description should be one enthusiastic paragraph based only on confirmed compatible specifications.

## 15. Consultations

1. Search for the client. On mobile, choosing New reveals only the client fields directly beneath search.
2. Enter complete client contact information or record the required declined-contact decisions, then choose Save Client. The form collapses into the saved client card.
3. Enter the date, start/end time or billable duration, purpose, assigned technician, and notes.
4. Estimated Hours automatically calculates $75 for the first hour plus $50 for every additional hour. Amount Charged remains editable for an approved custom total; choose Use automatic to return to the standard calculation.
5. Save the consultation.
6. After saving, use Update Client directly beneath the client information to send and record consultation status updates.
7. Confirm it appears on Calendar and under the client.
8. At checkout, record the consultation sale/payment when applicable.

### Partner Consultations

1. In Location, choose Partners.
2. Choose a saved business from the grouped partner list, or choose Add Partner.
3. For a new partner, enter an optional Group, Business Name, Custom Hourly Pricing, street address, city, ZIP, and an optional unit or suite number, then save.
4. The partner's saved hourly rate becomes the automatic consultation charge multiplied by Estimated Hours. Amount Charged can still be deliberately overridden; Use automatic restores the partner calculation.
5. Right-click a partner on Windows or press and hold on Android to edit or delete it. Deleting a directory entry does not alter historical consultations.
6. Partner groups, businesses, rates, and addresses are stored in authenticated shop settings and sync to signed-in Windows and Android installations.
7. On Android, choose Open Maps from the selected partner address or the consultation's Calendar details to begin navigation in the device's maps application.

- Consultation commission is technician-specific.
- Current reporting policy values logged consultation time at $25 per hour for technician commission.
- An approved customer hourly rate may be edited on the consultation line item. This does not change technician commission: one saved consultation hour still earns the assigned technician $25 under the current policy.
- Consultation line items do not use product URLs, supplier costs, device/product fields, markup, reorder, tax-exempt, or stock controls.
- Incorrect technician assignment produces incorrect commission, so verify it before saving.

## 16. Calendar and Content Schedule

- Mobile defaults to a compact vertical week; the current day is highlighted.
- Use previous/next controls to change weeks.
- Day, Week, and Month views are available where shown.
- Filter colors identify events, consultations, parts orders/deliveries, and technician schedules.
- Tapping an entry opens its details.
- Choose Expand Notes above an entry's Notes field when a larger editor is needed. Selecting the shaded area closes it without discarding the shared notes text.
- Part order and expected delivery dates can create calendar entries from work-order data.
- Streaming / Content Schedule is a separate weekly schedule for names, times, stream type/game, filming, and content work.
- Content schedule Add contains only content/streaming fields, not repair or consultation categories.
- Right-click a calendar icon on Windows, or press and hold it on Android, to open the available actions. Depending on the entry, these include opening details, editing, opening the linked invoice, opening order/tracking URLs, and deleting the entry.
- When multiple entries share one grouped icon, open the group to choose a specific record before using its contextual actions.

### Recurring Entries

1. Choose + Add on the starting date and select the entry type.
2. Check Recurring entry. This option is for entries created manually in Calendar; automatic order, delivery, business-calendar, and shift records remain single-purpose entries.
3. Choose Daily, Weekly, or Monthly. Weekly entries let you select one or more weekday buttons.
4. For Monthly, choose Day of month for a numbered date or Weekday pattern for rules such as First Monday or Last Saturday.
5. Optionally enter an End date. Leaving it blank keeps the series active.
6. Finish the entry and choose Save. The rule is stored once in Supabase and every signed-in Windows or Android installation renders the same occurrences.

### Tasks and Calendar Icons

1. Add a Task and choose the assigned technician. Choose All Technicians for shared shop duties.
2. Enter the Subject and Task details. The new-task editor remains open while typing and does not autosave or change modes. For one task, choose Save Tasks directly; the typed task is included automatically.
3. To create several tasks together, choose Add to Task List after each entry. The fields clear while the technician, date, and time selection remain ready for the next task.
4. Review the saved and pending tasks shown for that technician and day. Remove any pending mistake, then choose Save Tasks to commit the staged list plus any currently typed task to Calendar and Supabase. The button count shows the complete number that will be saved.
5. Incomplete tasks carry into Daily Look until checked off; completion syncs through Supabase.
6. Open Calendar Settings to replace each event category's default character with a short letter, symbol, emoji, or small uploaded icon.
7. Save Calendar Settings to sync the icon choices with the shop settings on other signed-in devices.

### Important Notes, Daily Look, and Technician Journal

1. Open Calendar and choose Notes on the correct day.
2. On desktop, use the large left editor to write the note and the right-hand list to switch between multiple notes saved for that day. On mobile, the list stacks above the editor.
3. Important notes sync through Supabase and appear on every signed-in Windows or Android installation. Saved bodies retain their typed line breaks, spaces, and indentation.
4. Open Daily Look to see the selected day's important notes beside schedules, consultations, orders, deliveries, events, and content work.
5. Choose a task's text to open its details and notes; use its checkbox only to change completion. Choose consultations, events, orders, or deliveries to open the linked calendar entry, invoice, or purchasing cart.
6. On mobile, open Technician Tools > Journal to review calendar notes, work-order Repair Journal entries, and sale notes grouped by day. Journal is read-only; edit the source calendar note or ticket when a correction is required.

## 17. Technicians and Time

- Create one technician record per actual technician.
- Use the short shop display name intended for assignment lists.
- Technician passcodes are separate from the Supabase shop login.
- Clock in/out and work schedules feed time and reporting tools.
- Audit open shifts before payroll/commission reporting.
- Do not assign records to the Supabase login display name.
- Windows and Android use the same compact technician cards; actions, schedules, passcodes, time entries, and analytics remain attached to the existing technician records.

### Hidden Game Menu

- Enter the exact uppercase keyword `GADGETBOY` in the main search field to reveal GAME MENU.
- Ship, Captain & Crew is a five-round dice game against Gidget. Secure a 6, then 5, then 4 within three rolls; the remaining two dice are cargo points.
- Tic-Tac-Toe uses a minimax CPU that evaluates every available outcome.
- Connect Four uses a tactical CPU that takes winning moves, blocks immediate wins, and favors useful board positions.
- Blackjack uses a dealer CPU that draws through 16 and stands on 17 or higher.
- Game scores stay inside the game window and never modify clients, tickets, reporting, or other shop data.

### Technician Analytics

1. Open Technician Tools > Technicians.
2. Select Analytics on the technician's card or desktop action row.
3. Choose 7 days, 30 days, 90 days, or All time.
4. Review assigned work orders, sales, consultations, logged time, common work, and recent activity.

- Work-order and sales performance includes only records whose saved technician assignment matches that technician.
- Billed, collected, average-ticket, completion-rate, and turnaround figures use saved POS values.
- Consultation payout uses saved consultation hours at the configured reporting rule of $25 per hour.
- Logged-time averages include completed clock-in/out entries; verification rate uses saved verification status.
- The analytics report is read-only. Missing totals, payments, dates, or hours remain zero or unavailable and are never estimated.

## 18. Notifications

### Android

1. Open Notifications for the first time.
2. Approve the Android notification permission prompt.
3. Open Settings to choose notification types and reminder timing.
4. If permission was denied, open the phone's App Info > Notifications and enable GadgetBoy POS.

### Windows

1. Open Notifications > Settings.
2. Choose Allow Notifications when prompted.
3. Enable the desired work-order, sale, consultation, parts, and reminder options.
4. Check Windows Settings > System > Notifications if alerts are blocked.

- Notification settings are device-specific.
- Consultation reminder timing can be set in hours before the event.
- Disabling system permission prevents delivery even if a POS checkbox is enabled.

## 19. End of Day Report

- End of Day is a concise overview of the current shop accounting day only.
- It rolls into a new day at the saved Batch Out time; it is not the monthly accounting report.
- Review labor collected, parts/products charged, COGS, verified supplier spend, consultations, sales count, and items awaiting purchase.
- On desktop, the current-day overview is fixed to one screen: Low Stock and Deliveries share the left rail in independently scrollable sections, accounting figures are grouped by purpose, and Open/Closed tickets appear side by side.
- Review Low Stock for tracked parts/products at or below their saved threshold. Add the saved MOQ to Cart, inspect the inventory record, or dismiss the current stock-state alert.
- Review Deliveries for client items previously purchased through Cart. Mark Delivered only after confirming arrival; the POS updates the exact invoice line, removes its expected-delivery Calendar entry, records delivery in the purchasing ledger, and sends the matching work-order or sale arrival email.
- Parts charged, COGS, and verified supplier spend must remain separate.
- EOD buttons are organized as EOD Report Email, Cart, and Batch Out now. Sending the report is performed inside EOD Report Email.
- Distributor rows in Cart are collapsed by default. Select a distributor row to expand it and select it again to collapse it.
- Mark a cart checked out only after checkout on the distributor site succeeds.
- Marking an order paid can update the linked work order and client update workflow.
- EOD Report Email stores recipients and the email subject, and can send the completed daily summary.
- Open Ticket Warnings restores the focused reconciliation list for unpaid diagnostics, tickets with payment taken but no checkout, and work orders whose Repair Complete update was sent while the ticket remains open.
- Double-click a warning row to open its invoice. On Windows, right-click the row for Open Invoice or Close Ticket; on Android, press and hold the row for the same menu.
- Close Ticket marks the invoice checked out and closed without collecting more money. Existing payment history remains unchanged, the unpaid balance stays visible on the invoice, and that balance is not added to EOD collected totals.
- Use Close Ticket only when the device or sale is leaving with an approved balance still due. Use normal Checkout whenever the shop is actually collecting payment.
- Open Daily Batch Settings from inside EOD Report Email to set the shop-local Batch Out cutoff, email schedule, and daily email time.
- Batch Out runs independently from the email schedule. Manual-only email delivery does not disable the daily accounting cutoff.
- If the Windows app is closed at the cutoff, it records the missed batch once after the next successful Supabase login. It never marks a batch complete before cloud data is available.
- Android records the accounting-day rollover when the app is active or next opened. Batch Out Now also exports the current mobile backup file.
- Monthly totals belong in Reporting, not EOD.

### Build the Purchasing Cart

1. Open End of Day Report and choose Cart.
2. Review pending items grouped by Vendor / Distributor.
3. For an unsaved or one-time purchase, choose Add Part / Product.
4. Select Part or Product, then paste the supplier URL. Supported pages fill the title, distributor, and cost; all scraped values remain editable and must be verified.
5. For manual entry, type the title, choose or enter the saved distributor name, enter quantity, and enter supplier unit cost.
6. Choose Add to Cart. This creates a pending purchase only; it does not claim that the shop paid for it.
7. Change a line Quantity when the distributor cart quantity differs. The displayed line and distributor totals update from that quantity.
8. Use each Order URL to open one item, Open Selected for checked lines, or View Cart to open all item URLs for that distributor.
9. Use Open Cart when a saved distributor checkout/cart URL is available.
10. Leave Tax Exempt unchecked unless the shop's account with that distributor is actually exempt. The POS adds South Carolina's 8% supplier sales tax when it is unchecked.
11. Enter Additional Costs only for shipping or other checkout fees shown at that distributor's final checkout. Supplier tax is calculated separately; do not enter it again.
12. Verify that Cost incl. tax, Charged incl. tax, supplier tax, client tax, and the distributor checkout total match the saved transaction and supplier checkout before payment.

### Set a Daily Purchasing Budget

1. Open End of Day Report, choose Cart, then choose the purple Budget button beside Add Part / Product.
2. Enter the amount the shop can spend during the current accounting day and save it. The value syncs to other signed-in POS devices.
3. Checked-out supplier purchases reduce the available amount. Selecting lines or distributor carts previews the amount that would remain after checkout; deselecting them restores the preview.
4. An over-budget selection shows a warning but does not block checkout. Verify the shop's available funds before continuing.
5. The budget is a visual purchasing guardrail only. It is never included in EOD or monthly reporting, revenue, cost, profit, tax, or commission calculations.

### Refresh Saved Supplier Prices

1. Choose Refresh Cart to re-read the saved Order URL for each pending line.
2. Review every old and new price shown. No cost changes are saved during the scan.
3. Choose Keep Changes only after the supplier item pages match what the shop expects, or choose Revert to discard the scan.
4. Refresh Cart reads public item-page prices. It cannot verify an authenticated distributor cart, shipping, account discounts, or final tax; confirm those values on the supplier checkout page and record shipping or fees under Additional Costs.

### Remove an Item from the Purchasing Cart

1. Expand the Vendor / Distributor section containing the item.
2. Choose Select to reveal the line-item checkboxes.
3. Check only the entries that should leave the purchasing cart, then choose Delete Selected.
4. Read the warning and confirm. Standalone manual purchases and inventory restocks are removed from the purchasing list.
5. A linked work-order or sale item is never deleted from its transaction. It remains marked as requiring an order, while delivery and tracking fields are cleared because no supplier checkout was completed.
6. The linked work order or sale displays a persistent Part/Product has not been ordered warning. The warning states the saved payment condition at removal so technicians do not mistake payment for a completed supplier order.
7. Choose Restore to EOD Cart from that warning when the item still needs to be purchased. Verify its supplier information before checkout.

### Verify Supplier Checkout

1. Complete payment on each distributor website first.
2. Return to the EOD cart and choose the main Checkout button.
3. A verification window lists each distributor, item count, and full cart total.
4. Check only the distributor carts that were successfully paid.
5. Choose Checkout Verified Carts.
6. The POS records those carts as verified supplier spend at the current checkout date and time.
7. Linked work-order/sale items are marked ordered. An inventory restock also increases its saved on-hand quantity by the verified quantity.
8. Unchecked distributors remain pending in the cart. Reopening a verified cart must not create a duplicate supplier-spend record.

### Payment Warnings

- Client-linked work-order and sale lines show whether the POS has factual payment evidence.
- Shop-only manual purchases and inventory restocks show Shop purchase and do not create a false client-payment warning.
- A warning does not block reviewing URLs, but the technician must resolve it before treating client-funded ordering as paid.
- If the supplier charged a different final amount, correct quantity/unit cost and Additional Costs before verification.

## 20. Reporting and Money Rules

- Reports must use saved factual transactions and entered costs. Never estimate missing money values.
- Labor is treated as full gross profit before overhead unless an explicit cost is entered elsewhere.
- Parts profit equals client part charge minus verified internal part cost.
- Product profit equals product sold amount minus verified internal product cost and any vendor amount owed.
- COGS is attached to the sold/used item and drives gross profit, including items taken from existing stock.
- Verified supplier spend is recorded only after an EOD distributor checkout is confirmed. It reports when cash left the shop and is not subtracted from gross profit a second time.
- Reporting filters supplier spend by verified checkout date, while sale/work-order revenue follows the transaction date.
- Sales commission is currently 5 percent of qualifying physical product sales and is split according to the configured shop policy.
- Repair labor is not sales commission.
- Consultation commission is based on technician-specific logged hours at the configured rate.
- Day, week, month, and year filters change the reporting period; there is no all-time total view.
- End-of-month exports should list dates, item titles, sold totals, internal costs, and commission using the saved source records.
- If historical test or incomplete entries exist, use date filters and verified accounting periods rather than deleting valuable records.

## 21. Local Backup and Restore

### Create a Backup

1. Open Admin > Data Tools > Local Backup.
2. Select Full Backup or specific collections.
3. Create the backup and confirm the file path.
4. Store a second copy in a secure location.
5. Use encrypted .gbpos backup for sensitive portable copies when available.

### Daily Schedule

- Enable Daily Backup Schedule and choose a time after normal shop activity.
- The scheduled backup is local protection; live Supabase sync continues during normal saves.
- Verify the last backup path and periodically test a copy in a non-production environment.

### Restore Safely

1. Stop entering new records on every device.
2. Create a current backup first.
3. Use Preview Backup / Dry Run and review record counts.
4. Confirm the chosen file is the intended newest source.
5. Restore only with management approval.
6. Reopen the app, sync, and verify customers, work orders, sales, technicians, and catalog counts.

> A restore can replace current data with the contents of the selected file. Never restore an older file simply because one screen looks empty.

## 22. Data Tools and Dev Menu

- App Health Scan checks readable collections and duplicate identifiers.
- Find Orphans and Duplicates identifies work orders without clients and possible duplicate customers.
- Cloud Sync Check compares local/cloud availability where supported.
- Repair Search Index rebuilds search support without deleting source records.
- Rebuild Repair Lookups refreshes derived repair data.
- Safe UI Reset clears transient window/layout state, not production records.
- Dev Menu offers dry-run validators, duplicate review, orphan checks, totals validation, environment information, and logs.
- Run dry-run/validation tools before any auto-fix.
- Create a backup before Merge, Auto-fix, Purge, Clear Database, or any other write operation.
- Clear Database is destructive and must never be used as routine troubleshooting.

## 23. Gidget

- Click the GadgetBoy logo to open Gidget.
- Gidget can help search POS information, organize diagnostics, and use locally supplied repair knowledge.
- Voice mode depends on microphone permission and supported device speech services.
- Chat history keeps a limited list of recent conversations.
- Desktop answers stream into the chat as the local model generates them, keeping the window responsive during longer diagnostics.
- Gidget must not expose customer data outside authorized shop use.
- Treat repair suggestions as assistance. Verify measurements, model-specific procedures, safety requirements, and source quality before acting.
- Do not give Gidget passwords, API keys, payment-card data, or unnecessary private client information.

## 24. Updating GadgetBoy POS

### Windows

1. When Update Available appears, optionally leave Download Instructions checked.
2. Choose Update Now to download and install later, or Auto Install & Relaunch.
3. Keep the app open while the progress bar completes.
4. The app closes, runs the installer, and relaunches.
5. Confirm the version shown in the app.

### Android

1. When Update Available appears, optionally leave Download Instructions checked.
2. Choose Update Now.
3. Allow GadgetBoy POS to install unknown apps if Android asks.
4. Install the APK over the existing app. Do not uninstall first.
5. If Android says App not installed, confirm the APK uses the same signing certificate and has a higher version.
6. Reopen the app and verify the version and synced data.

- The Windows updater selects Windows assets only.
- The Android updater selects Android APK assets only.
- Instructions uses the PDF from the same versioned GitHub release.

## 25. Complete Feature Directory

Use this directory as a map of the POS. Detailed operating steps remain in the earlier workflow sections.

### Main Workspace and Search

- Unified recent-record workspace for work orders and sales.
- Record-type, technician, status, date, and keyword filtering where available.
- Invoice, client, phone, device, and item search.
- Paginated or incremental loading without deleting records beyond the visible page.
- Desktop right-click and Android long-press record actions.
- Open, checkout, client profile, print, duplicate, reopen, mark-paid, call, text handoff, and delete actions where appropriate.

### Clients and History

- Search Client and Add Client are separate workflows.
- Duplicate detection by matching full name, primary phone, or email.
- Client overview card with editable contact information.
- New Work Order and New Sale actions.
- Work-order, sale, consultation, and saved-quote history.
- Orphaned-link and duplicate-review tools for authorized maintenance.

### Work Orders and Repair Operations

- New, existing, and duplicated work-order workflows.
- Assigned technician, work-order type, intake source, dates, device details, serial/IMEI, accessories, condition, and issue fields.
- Reusable repair selection plus one-off custom lines.
- Product selection from inventory.
- Parts cost, sold price, labor, tax, discounts, deposits, payments, and remaining balance.
- Internal Notes and timestamped Repair Journal.
- Part order URL, distributor, order/arrival dates, tracking, tax-exempt status, and order state.
- Client Update panel and QR status workflow with update history.
- Work-order printout, customer receipt, release form, checkout, and closure.

### Sales, Quick Sale, and Checkout

- Client-linked sales and multi-item Quick Sale.
- Product and custom item selection.
- Quantity, condition, cost, sold price, discount, tax, totals, payments, and balance.
- Shared checkout window and payment recording.
- Customer receipt and sale-specific QR update actions.
- Client sale history and reporting linkage.

### Quotes and Consultations

- Product and repair quote modes.
- Existing-client search and client creation from valid quote information.
- URL-assisted product autofill for device type, model fields, images, cost, condition, and editable sales summary.
- Configurable markup and saved quote history.
- Create Sale from selected quote items.
- Consultation client, technician, date, time, duration, purpose, notes, calendar, and commission linkage.

### Catalogs, Inventory, and Vendors

- Device models, repair categories, repair definitions, and reusable service pricing.
- Separate Products and Repair Parts inventory.
- Device type/model, product category, condition, SKU, quantity, internal cost, markup, sold price, and source fields.
- Saved distributor/vendor memory and Order URL buttons.
- Separate parts-distributor and product-vendor records.
- Tax exemption, contact details, notes, consignment, vendor share, and payout reporting.
- Inventory selection from repair and sale workflows.

### Scheduling, Staff, and Alerts

- Day, week, and month calendar views where supported.
- Consultations, events, technician schedules, part orders, and expected deliveries.
- Separate Streaming / Content weekly planner.
- Technician records, passcodes, assignments, schedules, clock-in/out, and time entries.
- In-app notification inbox with read/unread management.
- Device notification permission, consultation timing, work-order, sale, delivery, calendar, schedule, and Daily Look preferences.

### Reporting and End of Day

- Current-day End of Day overview separate from long-range reporting.
- Labor collected, parts cost/charged, products cost/sold, consultations, and parts awaiting purchase.
- Paid-cart/order confirmation tied back to work orders.
- EOD email recipients and report sending.
- Day, week, month, and year reporting filters.
- Revenue, verified internal cost, gross profit, vendor amount owed, and technician commission calculations.
- Charts and export/report outputs where available.

### Documents and Customer Communication

- Work-order form with terms and QR code.
- Customer receipt and release form.
- Quote output and consultation sheet.
- Customer update emails from desktop/cloud delivery.
- Android prepared-text handoff to the phone messaging app.
- Per-ticket update history and delivery result.
- Version-matched operating manual included with releases and updater downloads.

### Cloud, Backup, Updates, and Support Tools

- Supabase authentication, shared data loading, supported realtime changes, and queued offline synchronization.
- Manual Sync Now and collection-change refreshes.
- Local full/selective backups, scheduled daily backups, preview/dry-run restore, and encrypted portable backup where available.
- Windows automatic update download/install/relaunch.
- Android version check, signed APK update, instruction download, and install-permission handoff.
- App Health Scan, environment information, orphan/duplicate checks, search-index rebuild, lookup rebuild, safe UI reset, totals validation, and logs.
- Gidget text/voice assistant, recent chat history, local repair knowledge, POS search assistance, and safety boundaries.

## 26. Troubleshooting

### App Opens Blank or Stays Loading

1. Confirm internet access.
2. Close and reopen the app once.
3. On Windows, open the GadgetBoy POS GitHub Pages URL to confirm the public app responds.
4. Check GitHub Actions for the latest Pages deployment and confirm the Supabase project is available.
5. Check Dev Menu > Environment Info and App Health Scan.
6. Do not restore or clear data merely to fix a loading screen.

### Missing Supabase Environment Values

- Local development requires the expected VITE_SUPABASE values in .env.local.
- GitHub Pages builds require the public Supabase URL and publishable key in GitHub Actions variables or secrets.
- GitHub Actions requires matching repository secrets/variables for packaged builds.
- Never use the service-role secret as a publishable client key.

### Records Missing on One Device

1. Use Sync Now.
2. Clear filters/search and check additional pages.
3. Confirm the device is signed into the same shop.
4. Compare the newest record by ID/date on another device.
5. Check whether the client exists but the work order has an orphaned customer link.
6. Run read-only health checks before any repair.

### Client Shows as a Number

- The work order exists but the linked client may not have loaded or may have an invalid customer ID.
- Search the phone/email, then use orphan detection.
- Do not create another client/work order until the relationship is understood.

### Update Does Not Appear

- Confirm the installed version is older than the latest GitHub release.
- Android checks for `Android-APK-universal-VERSION.apk`.
- Windows checks `latest.yml` and the matching Windows installer/blockmap.
- Verify the release is marked latest and assets finished uploading.

### Android Says App Not Installed

- Do not uninstall because that can remove unsynced local state.
- Confirm Install unknown apps is enabled for GadgetBoy POS.
- Confirm the APK is newer and signed with the same certificate as the installed app.
- Re-download the APK from the official release if the file is incomplete.

### Update Controls

- On Windows, Auto Update and Relaunch downloads the release, closes GadgetBoy POS, installs it, and reopens the app without a second in-app confirmation. Download Only stages the update and leaves installation for later.
- On Android, Download and Install downloads the signed APK and opens Android's package installer. Android's system confirmation cannot be bypassed by the POS.

### Notifications Keep Loading

- Confirm system notification permission.
- On Android, open App Info > Notifications and enable permission.
- Reopen Notification Settings.
- Confirm the native Capacitor notification plugin is present in the APK build.

### QR Page Opens but Buttons Fail

- Verify the public GB Update Interface is reachable and Supabase authentication, QR token storage, and the `client-updates` Edge Function are active.
- Confirm the ticket ID exists in the shared database.
- Try Update Client inside the app.
- Check update History before retrying.

### Autofill Keeps Reading

- Wait for the timeout/error message rather than closing the whole POS.
- Open the URL in a normal browser and confirm it is public.
- Some sites block automated reading or hide selected variants.
- Enter values manually and verify cost/condition; never accept an incorrect image or price.

### Printing Wraps or Uses Extra Pages

- Use the print preview.
- Confirm printer paper size and margins.
- Shorten unusually long notes/items when appropriate.
- QR codes and client information should remain on the first page; report the affected form and printer settings if they do not.

## 27. Daily Technician Checklist

### Opening

1. Open the app and confirm sync.
2. Check Notifications and Calendar.
3. Clock in/select the correct technician.
4. Review parts expected today and open work orders.

### Every Check-In

1. Search client first.
2. Verify contact information.
3. Record device identity, condition, accessories, issue, and assigned technician.
4. Add diagnostic or known repair.
5. Save, verify the client link, print, and obtain signature.

### During Repair

1. Record updates in Repair Journal.
2. Send client updates at meaningful stages.
3. Verify parts, cost, markup, tax status, and order dates.
4. Save after each material change.

### Pickup

1. Confirm repair outcome and customer approval.
2. Apply deposit/diagnostic payment correctly.
3. Collect the actual remaining balance.
4. Print receipt/release form.
5. Mark the ticket complete and send final update.

### Closing

1. Open End of Day Report.
2. Verify payments, labor, parts/products cost and sold totals.
3. Purchase required parts and mark only paid carts.
4. Send the EOD email.
5. Confirm local daily backup completed.

## 28. Data and Security Rules

- Access customer information only for authorized shop work.
- Use unique device locks and do not share shop credentials outside approved staff.
- Never commit .env files, API secrets, service-role keys, email app passwords, or signing keys.
- Do not send full customer exports through ordinary email or chat.
- Prefer encrypted backups for portable media.
- Log out of retired/lost devices and revoke access promptly.
- Never alter production datasets for testing. Use a separate test environment or disposable test records clearly marked as tests.

## 29. Support Information to Collect

When reporting a problem, include:

- GadgetBoy POS version and platform.
- The exact screen and action.
- Work-order/sale/client ID when relevant, without posting unnecessary private details.
- Exact error text.
- Whether another device shows the same problem.
- Whether Sync Now changes the result.
- GitHub Pages deployment and Supabase Edge Function status for web/QR failures.
- A screenshot with private information obscured.

Use Feedback > New Feedback > Import to choose up to four screenshots from Windows files or the Android system photo picker. Review each thumbnail before saving; imported images are compressed and sync with the feedback entry across signed-in devices. Remove or obscure customer information that is not needed to diagnose the issue.

Do not send passwords, PINs, Supabase keys, signing keys, payment-card information, or entire customer backups in a support message.
