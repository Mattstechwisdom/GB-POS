# Customer Data Integrity Design

## Purpose

GB POS must keep each client, work order, sale, purchasing entry, and invoice connected to one canonical customer identity across desktop, mobile, web, and Supabase. Customer search and duplicate detection must expose the same records, invoices must load even when a customer relationship needs repair, and every automated repair must be recoverable and auditable.

## Scope

This project covers customer identity normalization, duplicate detection and consolidation, transaction-link reconciliation, direct invoice loading, integrity monitoring, and recoverable backups. It does not redesign the customer, work-order, sale, or EOD interfaces beyond the controls and messages required to review ambiguous matches and report integrity status.

## Canonical Identity

- The Supabase `customers.id` UUID is the canonical customer identity.
- The existing numeric `legacy_id` remains a compatibility identifier and must remain unique within a shop.
- Work orders and sales retain both their canonical `customer_id` UUID and `legacy_customer_id` while legacy clients remain supported.
- Transaction customer names and contact fields remain immutable display snapshots for historical and offline use. They are not substitutes for the canonical relationship.
- All matching and repair operations are scoped by `shop_id`; records must never be linked or merged across shops.

## Normalization and Matching

One shared customer identity module will normalize and compare records for customer search, duplicate warnings, reconciliation, and administrative review.

- Phone numbers are compared by normalized digits, with extensions kept separate. Valid US numbers that differ only by punctuation or an optional leading country code match.
- Emails are trimmed and compared case-insensitively.
- Names are trimmed, whitespace-collapsed, and compared case-insensitively, but a name match alone is never sufficient for automatic consolidation.
- An exact normalized phone or email match permits automatic consolidation unless the matched records contain conflicting non-empty identity data that requires review.
- Name-only matches, conflicting phone/email matches, and one-to-many relationship ambiguity are placed in a manual review queue and remain unchanged.
- Customer search and new-customer duplicate detection call the same matching service and query the complete shop-scoped customer collection, so a duplicate warning cannot discover a customer that ordinary search hides.

## Duplicate Consolidation

Automatic consolidation selects one canonical customer deterministically: prefer the row already referenced by the most canonical UUID relationships, then the most complete contact record, then the oldest record. Before consolidation, the system creates an audit snapshot containing both source rows and every affected relationship.

The consolidation operation:

1. Copies only missing customer fields into the canonical record; it never silently replaces conflicting non-empty values.
2. Repoints work orders, sales, payments, calendar entries, QR/update records, and other customer foreign keys to the canonical UUID where applicable.
3. Preserves legacy customer identifiers in an alias/audit mapping so older references can still resolve.
4. Marks the duplicate as merged rather than immediately deleting it.
5. Records the actor, timestamp, reason, affected tables, before state, and after state.

Ambiguous candidates appear in an Admin data-integrity review screen where staff can compare records, select the canonical client, keep both, or merge explicitly.

## Transaction Reconciliation

The integrity service audits all work orders and sales for these states:

- canonical UUID and legacy ID agree;
- UUID is missing but the legacy ID uniquely identifies a customer;
- legacy ID is missing but UUID identifies a customer;
- both links are missing but an exact transaction snapshot phone or email uniquely identifies a customer;
- identifiers conflict or resolve to multiple customers;
- the referenced customer no longer exists.

Unique, deterministic matches are repaired automatically. Conflicts and name-only matches go to manual review. Historical transaction snapshots are preserved during link repair. EOD display names are resolved from the canonical customer first, then the transaction snapshot, then a clearly labeled client-number fallback.

## Invoice Loading

Invoice windows load the requested work order or sale directly by shop-scoped record ID rather than downloading a collection and searching it in memory. Transaction loading and customer loading are independent:

- A valid transaction always opens with its saved line items and totals.
- If its customer can be resolved, current customer details supplement the saved snapshot.
- If the relationship is broken, the invoice still displays its transaction snapshot and an integrity warning; it never silently presents an empty new-invoice form.
- A missing transaction produces an explicit “invoice not found” state showing the requested identifier.

## Continuous Integrity

- A lightweight audit runs after authenticated startup and after customer, work-order, sale, or import changes.
- Reconciliation is idempotent and safe to rerun.
- Automatic repairs run in bounded batches and persist progress so an interruption cannot leave an untraceable partial operation.
- The Admin review surface reports healthy records, automatically repaired links, ambiguous duplicates, orphaned transactions, and the last successful audit time.
- Failures are logged with actionable record identifiers without exposing sensitive client data in general application logs.

## Backup and Recovery

- A full versioned backup is created before any bulk consolidation or relationship-repair operation.
- Scheduled encrypted backups capture the customer and transaction relationship data needed to recover from accidental edits or synchronization faults.
- Local desktop backups remain available for offline recovery; cloud audit snapshots provide record-level rollback information across platforms.
- Backups are verified after creation by reading their manifest and record counts.
- Retention is bounded by an Admin-configurable policy with a safe default of 30 daily backups and 12 monthly backups.
- Automatic cleanup removes only backups outside the retention policy and never removes the newest successful backup.
- Restore remains an explicit Admin action and produces its own pre-restore backup and audit entry.

## Error Handling and Safety

- Reconciliation never guesses from a name alone.
- A failed batch rolls back its database transaction or leaves completed idempotent operations recorded for safe resumption.
- Foreign-key changes use shop-scoped database constraints and transactions.
- The application must not expose Supabase service-role credentials to clients.
- Existing RLS and authorization boundaries remain enforced; administrative merge and restore actions require an authorized admin.
- No production customer is hard-deleted by the automatic process.

## Verification

Automated tests must prove:

- search and duplicate detection return the same normalized phone/email matches;
- pagination cannot hide customers from ordinary search;
- exact phone/email duplicates consolidate while name-only and conflicting matches do not;
- legacy-only and UUID-only work orders and sales reconcile correctly;
- cross-shop records never match;
- EOD consistently displays the resolved client name;
- direct invoice lookup loads complete transaction data even with a broken customer relationship;
- missing invoices show an explicit error instead of a blank form;
- reconciliation is idempotent and interruption-safe;
- backups are produced before bulk repair, verify successfully, obey retention, and can restore affected relationships;
- desktop, mobile, and web adapters preserve the same identity fields and behavior.

Before any production reconciliation, the implementation will run a read-only inventory report showing counts of healthy links, deterministic repairs, ambiguous matches, and orphans. Production mutation requires a verified backup and a reviewed dry-run summary.

## Success Criteria

- A customer found by duplicate detection is always visible through normal customer search.
- Every resolvable work order and sale has a valid canonical customer UUID and compatible legacy identifier.
- EOD does not show a client number when a linked customer name or transaction snapshot exists.
- Opening a valid linked invoice never produces an empty form.
- Duplicate consolidation is deterministic, auditable, shop-scoped, and recoverable.
- Automated audits and verified backups make link loss detectable and reversible.
