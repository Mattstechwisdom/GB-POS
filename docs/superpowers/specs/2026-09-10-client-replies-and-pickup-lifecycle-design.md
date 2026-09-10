# Client Replies and Pickup Lifecycle Design

## Goal

Make repair approval and pickup communication actionable inside the POS, without requiring a payment to close an already-paid or non-repairable work order.

## Client replies

Repair-approval email contains signed Approve, Decline, and Ask a Question links. Public responses never reuse the staff QR token. Approve advances the work order to repair or awaiting parts, Decline advances it to awaiting pickup, and a question keeps it awaiting approval. Every response is stored with shop, work order, client, device, response type, message, timestamps, and resolution state.

The Command Center displays the five newest unresolved responses in a Client Replies section. Rows show client, device, work order, response type, preview, and received time. View All opens a complete response list. Questions appear in Needs Attention; approvals and declines remain visible until acknowledged. The notification count includes unread replies.

The Ask a Question form is the synchronized reply channel in this release. Ordinary Gmail replies remain in Gmail because outbound SMTP cannot read a mailbox.

## Pickup lifecycle

Repair Complete and Repair Not Possible set a pickup-ready timestamp and start the pickup clock. A scheduled pickup date/time replaces the ordinary seven-day grace deadline. Picked Up / Close Ticket records pickup time and actor, closes the ticket, and creates no payment. A positive balance blocks ordinary closure and requires checkout or an explicit manager override.

On day 8 after the applicable pickup-ready/grace anchor, the system queues one automatic pickup reminder if the device has not been collected. On day 12 it adds Needs Attention and suggests a storage fee. The suggested fee is $25 for each day beginning on day 8; it is never added automatically. A technician must review and approve the suggested line item. If a scheduled pickup is missed, fee calculation begins the following calendar day.

## Compatibility

The workflow applies immediately to newly updated repairs. Existing tickets are not bulk-mutated and continue to age out through the configured legacy cleanup rules. Desktop, mobile, local records, Supabase records, existing QR links, and the Command Center must remain synchronized.

## Safety and testing

Public response tokens are random, stored as hashes, expire, and may only affect their linked work order. Duplicate submissions are idempotent. Tests cover lifecycle dates, reminder deduplication, storage-fee suggestions, signed responses, Command Center replies, zero-payment pickup closure, balance blocking, mobile rendering, and existing QR behavior.
