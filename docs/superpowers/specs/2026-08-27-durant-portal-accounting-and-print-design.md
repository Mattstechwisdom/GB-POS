# Durant Portal, Ticket Accounting, and Print Design

## Purpose

Extend GadgetBoy POS with accurate historical distributor checkout dates, per-line discounts, ticket-level diagnostic fees, reliable device-password printing, a controlled Durant Media collaboration workflow, and an installable responsive web interface. Existing GadgetBoy behavior and styling remain unchanged except where this specification explicitly adds or corrects behavior.

## Global Constraints

- GadgetBoy edits remain authoritative and save immediately through existing work-order and sale flows.
- Durant Media edits never affect authoritative totals, purchasing carts, client updates, inventory, or reporting until GadgetBoy approves a submitted proposal.
- Durant authorization is enforced by Supabase RLS and server-controlled role/profile data, not hidden navigation or user-editable metadata.
- Existing estimated-delivery semantics remain unchanged.
- Standard bottom-of-cart checkout always uses the current date.
- No unrelated customer, technician, inventory, settings, or administrative data is exposed to Durant users.
- Existing non-Durant QR behavior remains unchanged.

## Distributor Cart Order Dates

The existing item selection model controls historical order dating. A user may select one item, several items, or Select All, choose **Ordered on Different Day**, and assign a date to exactly those selected rows. The historical date option exists only in the selected-item checkout path.

For selected-item checkout:

- Each successful selected purchase ledger row uses the chosen order date for its reporting/checkout timestamp.
- The linked work-order or sale item receives the chosen order date.
- The automatic Part Ordered/Product Ordered client update states the chosen order date even if the update is sent on another day.
- Each row retains its independently selected estimated-delivery date.
- Failed or unselected rows are unchanged.

The normal Checkout button at the bottom does not expose or inherit a historical override and records checkout on the current day.

## Per-Line Discounts

Work-order and sale line items expose **Add Discount** through the existing desktop right-click and mobile press-and-hold context menu patterns. The action allows either:

- A custom percentage from 0 through 100 percent, or
- A custom currency amount from zero through the undiscounted line total.

The item stores the discount mode, entered value, and calculated amount. Line totals never become negative. Discounts render on item tables and customer printouts, reduce the ticket balance, and reduce taxable value for the taxable portion of that specific item. Existing ticket-level discounts remain available and apply after line discounts without double-counting. Checkout, receipts, payment allocation, reporting, and persisted totals must use the same shared discounted-line calculation.

## Ticket-Level Diagnostic

Every work-order type has an optional **Add Diagnostic** control above its line-item list. It opens a searchable dropdown containing active repair catalog entries whose title or repair title is `Diagnostic` (case-insensitive). The selected diagnostic is stored as ticket-level metadata and is not inserted into the line-item array.

The diagnostic is a minimum labor charge:

- With a $50 diagnostic and no other labor, labor charged is $50.
- With a $50 diagnostic and $100 repair labor, total labor charged is $100, not $150.
- If the client already paid the $50 diagnostic, $50 remains due on the $100 repair.
- Parts and their taxes are unaffected by the labor minimum.
- With no diagnostic selected, existing totals remain unchanged.

Totals, payment panels, customer receipts, release forms, Durant receipts, backup/cloud mapping, and reporting display or account for the diagnostic consistently.

## Device Password Persistence and Printing

The password defect will be reproduced across the complete data path:

1. Visible work-order password input/local state.
2. Form change callback and save/print action timing.
3. Local authoritative work-order record.
4. Supabase `work_order_private_credentials` mapping.
5. Print payload construction.
6. Customer receipt and release-form rendering.

The fix belongs at the first boundary that drops the entered value. Printing must flush the currently visible password into authoritative state before creating a payload. Saved work orders must restore the private password across desktop and browser clients according to existing admin/manager authorization. Regression tests must prove a password typed immediately before printing is present in the persisted record and both print outputs.

## Durant Report and Full Transfer

Durant Report remains a work-order type. It gains an optional **Full Transfer** checkbox stored on the authoritative ticket. Standard Durant Report and Full Transfer tickets stay visible in GadgetBoy lists and open in the normal work-order editor.

For Full Transfer, the diagnostic amount already paid at GadgetBoy becomes an explicit dollar-for-dollar credit against Durant's bench fee. The approved Durant receipt shows the diagnostic payment, Durant bench/labor amount, credit, and remaining amount. The same receipt can be printed when the device remains at GadgetBoy or when Full Transfer is enabled.

Standard and Durant printouts use a three-column header:

- Brand/shop information.
- A fixed-width QR column.
- A protected client-information column.

Date/time including AM/PM, invoice, client, phone, and email remain on one line where present. The layout may tighten gaps and typography but must not expand the existing page or displace one-page content. Durant printouts place **Durant Report** in bold above client information and show **Full Transfer** directly beneath it when enabled.

## Durant Proposal Workflow

Durant works against proposal records linked to authoritative Durant Report work orders. A proposal contains a staged snapshot of allowed fields plus audit metadata and one of these states:

- `draft`
- `ready_for_gadgetboy_review`
- `returned_for_changes`
- `approved`

Allowed proposal fields include findings, line items, supplier cost, markup percentage, client part price, invoice URL, labor/bench charges, and requested Full Transfer state. Supplier URL scanning reuses the existing part metadata pipeline to suggest the part name and supplier price. A scan failure preserves the URL and allows manual entry.

Durant actions are limited to:

- Save draft pricing/findings.
- Add or edit staged parts, invoice links, markup, and labor.
- Print the Durant receipt using approved authoritative values or clearly labeled draft values before approval.
- Submit **Ready for GadgetBoy Review**.
- Mark **Accepted by Durant** only for a Full Transfer proposal.

Durant cannot collect payments, close GadgetBoy tickets, modify customers, alter authoritative work-order status, or directly create purchasing/reporting effects.

GadgetBoy sees pending proposals inside the normal Durant Report work-order editor. The review compares current and proposed values field by field. GadgetBoy may:

- Approve the entire proposal atomically.
- Return it for changes with a required note.

Approval calls one server-side transaction that merges allowed proposal fields, recalculates authoritative totals, creates or updates required purchasing records, and marks the proposal approved together. Only after that transaction commits does the client enqueue calendar/client-update delivery; notification delivery is retryable and cannot roll back an already committed approval. Returning a proposal changes only proposal status and review metadata. Every submission and decision records actor and timestamps.

## Authentication, Authorization, and Data Isolation

Add a server-controlled `durant` staff role. The bootstrap credentials are username `Durantmedia` and temporary PIN `1234`. They are strictly one-time credentials: a rate-limited Edge Function verifies a server-stored hash of the PIN, generates a one-time Supabase sign-in link for the pre-provisioned Durant identity, and permanently consumes the bootstrap credential. The resulting bootstrap session can access only the password-setup screen. A second authenticated server call marks password setup complete only after Supabase accepts a secure replacement password. The implementation must not embed the PIN hash, a reusable privileged password, or service-role key in browser code.

The browser login accepts the friendly username and maps it to the configured Supabase identity without exposing the underlying email. After bootstrap, the secure password is used for normal Supabase authentication.

RLS permits Durant users to:

- Read only work orders explicitly typed `durantReport` for their shop.
- Read only the customer attached to a visible Durant Report ticket, with no global customer enumeration/search route.
- Read the private device password only for a visible Durant Report ticket, without listing private credentials for other work orders.
- Read/write only proposals attached to those visible tickets and only allowed proposal states/fields.
- Read the minimum repair catalog data needed for diagnostic selection and staged pricing.

RLS denies authoritative work-order financial writes, unrelated customers/work orders, inventory, technicians, settings, reporting ledgers, and administrative tables. GadgetBoy admin/manager access retains existing behavior. Policies include both `USING` and `WITH CHECK` for Durant updates and are tested with real authenticated identities.

## Responsive Web Interface and PWA

The canonical web URL is:

`https://mattstechwisdom.github.io/GB-POS`

The GitHub Pages entry always shows the styled login screen before protected content. After authentication:

- GadgetBoy users receive the existing POS shell appropriate to desktop or mobile viewport.
- Durant users receive a focused responsive workspace containing only their Durant ticket list, ticket/proposal editor, and permitted print/review actions.
- QR deep links preserve the target ticket through login and required password change.

The web build becomes an installable PWA with:

- A manifest using the name `GadgetBoy POS`.
- GadgetBoy logo icons at required standard and maskable sizes.
- Apple touch icon metadata.
- Standalone display mode, dark theme/background colors, and iOS status-bar metadata.
- iPhone/iPad safe-area handling.
- Correct start URL and GitHub Pages base path.
- Responsive phone, tablet, and desktop layouts.

Durant Report QR codes point to the canonical web URL and exact ticket route. Non-Durant QR codes retain current behavior.

## Release Documentation

Add a plain-text web-access guide to the repository. Every GitHub release description generated by the workflow includes exactly:

`Web Interface: https://mattstechwisdom.github.io/GB-POS`

The upcoming changelog/release notes also include the web URL and Durant access instructions without publishing the post-bootstrap secure password.

## Error Handling

- Historical checkout validates that at least one row is selected and the chosen date is valid and not in the future; partial successes retain failures in the cart and report them individually.
- Discount inputs reject invalid, negative, over-100-percent, or over-line-total values.
- Diagnostic selection tolerates deleted/inactive catalog entries on old tickets by preserving a snapshot label and amount.
- Supplier scanning failures are non-destructive and allow manual correction.
- Proposal merge, authoritative totals, purchasing records, and approval status commit atomically. Post-commit calendar/client-update delivery failures remain queued and visible for retry without reverting approved financial data.
- Unauthorized Durant queries return no protected rows and the UI shows a permission-safe empty/error state.
- Deep links to missing, unrelated, or non-Durant tickets show a safe not-found screen.
- Print generation never silently substitutes an empty password for a currently entered value.

## Verification and Release

Development follows red-green-refactor cycles. Required automated coverage includes:

- Selected-only historical dates versus current-day bottom checkout.
- Historical order date propagation to client updates and reporting without changing estimated delivery.
- Work-order and sale line discount math, tax, persistence, receipts, and reporting.
- Diagnostic minimum-labor math across all work-order types and Full Transfer credit.
- Immediate-before-print password persistence and both print payloads.
- Proposal staging, return, atomic approval, and downstream isolation before approval.
- Supabase RLS positive and negative Durant access cases.
- Responsive routing, deep-link restoration, manifest, Apple icon, and standalone metadata.
- Print header fit at supported paper size with QR and long client/date values.

Run the repository's typechecks, focused regression suites, complete production desktop/mobile/web builds, relevant Supabase policy tests/advisors, and browser visual checks at representative desktop, iPhone, and iPad viewports. Fix discovered regressions before release.

Use the established patch-version, changelog, annotated tag, GitHub Actions release, and GitHub Pages deployment workflow. Push the verified release branch/tag to the configured GadgetBoy POS GitHub repository and confirm both the release assets and published web URL.
