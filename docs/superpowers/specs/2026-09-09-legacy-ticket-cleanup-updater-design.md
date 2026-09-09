# Legacy Ticket Cleanup, Attention Rules, and Updater Recovery

## Goal

Reduce the inherited open-ticket backlog without inventing payments or losing history, make repair exceptions actionable, normalize technician display, and make Windows updates recover from an older installation that cannot be removed silently.

## Configurable shop settings

Add a **Ticket Cleanup & Attention** section to the existing synchronized shop settings surface. It is available on desktop and mobile and stores its values in the existing `settings` record so every device uses the same policy.

- Enable automatic legacy-ticket cleanup: default on.
- Close diagnostic-only tickets after: default 20 days, minimum 1 day.
- Close all remaining open tickets after: default 30 days and constrained to be greater than or equal to the diagnostic-only threshold.
- Flag not-repairable devices awaiting pickup after: default 1 day, minimum 0 days.
- A preview reports how many records each rule will affect before settings are saved or cleanup is run.

## Cleanup classification

Age is measured from `checkInAt`, then `createdAt`; recent notes, payments, synchronization, or edits do not reset it.

A diagnostic-only work order has a diagnostic selection or diagnostic line and no repair, part, product, custom-build, or other labor line. Its saved payments and totals are never modified.

An open work order is changed to `status: "closed"` when either:

1. It is at least the configured diagnostic-only age and qualifies as diagnostic-only.
2. It is at least the configured universal age, regardless of its line items or remaining balance.

The cleanup does not create `checkoutDate`, `clientPickupDate`, a payment, a receipt, or an automatic customer email. It adds an idempotent internal audit marker containing the rule, policy age, and timestamp. Records remain searchable and visible under Closed Tickets. Updates use the existing local-first `dbUpdate` path and Supabase synchronization queue.

Cleanup runs after the authoritative work-order/settings load on desktop and mobile. The audit marker prevents repeated writes. A settings action can preview and run cleanup immediately after changing the policy.

## Not-repairable lifecycle and Needs Attention

`Repair Not Possible` is an operational state, not an immediate closure. It remains open until pickup is recorded. Recording pickup closes the ticket through the normal status path without creating a payment.

Needs Attention includes:

- A not-repairable device with no pickup after the configured attention delay.
- A work order with a pickup timestamp that is still open.
- A newly closed not-repairable ticket with no pickup timestamp, unless it carries a legacy age-cleanup audit marker.
- Missing technician assignment.
- An assignment value that cannot be resolved to a current technician.
- Existing broken-client, sync, and incomplete-record exceptions.

## Technician identity

Create one shared resolver used by Command Center, All Invoices, Work Orders, Sales, mobile record cards, and attention rules. It matches technician `id`, `legacyId`, `legacy_id`, `cloudId`, `cloud_id`, nickname, full name, and first name using normalized values.

Resolved assignments show the technician's display name. Empty values show `Unassigned`; unresolved identifiers show `Unknown technician`. Raw UUIDs or opaque identifiers are never displayed. The resolver does not guess or rewrite an assignment unless exactly one technician matches.

## Windows updater

The current updater uses a silent, non-elevating NSIS handoff. That gives the installer no recovery path when the old installation or uninstaller requires permission or still owns application files.

The update flow will:

1. Flush local writes and the Supabase queue.
2. Stop QR, Clover, daughter windows, and other background resources.
3. Close the update UI and main window before installer handoff.
4. Run the downloaded update in assisted mode so NSIS can display a retry/error and request elevation only when needed.
5. Package the elevation helper and retain a per-user installation, existing install directory, and `deleteAppDataOnUninstall: false`.
6. Log the installer handoff and expose a **Download installer** recovery button if automatic application cannot start.

No database, backups, settings, or customer files are stored in the application install directory or removed by the uninstaller.

## Verification

- Unit tests cover age boundaries, diagnostic-only detection, preserved balances/payments, audit idempotency, not-repairable pickup rules, and technician aliases.
- UI tests cover synchronized settings defaults, validation, preview counts, desktop/mobile visibility, and Needs Attention reasons.
- Updater tests assert assisted installation, elevation-helper packaging, shutdown ordering, and recovery controls.
- Existing Command Center, work-order, mobile-layout, synchronization, checkout, email, and updater tests remain passing.
- Build and inspect Windows and Android artifacts before publishing the next version.
