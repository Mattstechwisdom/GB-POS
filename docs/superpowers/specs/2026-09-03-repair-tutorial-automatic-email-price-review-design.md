# Repair Tutorials, Automatic Client Emails, and Inventory Price Review

**Date:** 2026-09-03  
**Target:** GadgetBoy POS after v0.6.56

## Goal

Add three coordinated capabilities without weakening existing synchronization or approval safeguards:

1. Synchronized repair tutorial URLs with native desktop and mobile playback.
2. Branded, idempotent automatic client emails at the beginning of paid work and throughout consultation scheduling.
3. Batch supplier-cost verification that learns from staff corrections but never changes inventory without approval.

## 1. Repair Tutorial URLs and Players

### Data model

Each repair catalog record gains optional tutorial metadata:

- `tutorialUrl`: the normalized URL used on every device.
- `tutorialMediaType`: `youtube`, `direct-video`, or `webpage`; derived when saved and revalidated when opened.
- `tutorialUpdatedAt`: audit/synchronization timestamp.

Only URLs and metadata are stored. The POS does not upload or retain physical video files, avoiding video-storage costs. Existing repair synchronization must carry these fields across desktop, mobile, web, and Supabase.

### Repair UI

The repair editor shows a **Tutorial URL** field when no tutorial exists. It accepts YouTube watch/share/embed links, direct media URLs such as MP4 or WebM, and ordinary webpage URLs.

Once saved, repair-facing displays show a **Repair Tutorial** button in the URL field's normal display location. Edit mode provides **Change URL** and **Remove URL**. Ticket catalog pickers may expose the button without allowing the URL to obstruct selection or editing.

### Playback

- YouTube URLs are normalized to a video ID and opened in an embedded YouTube player.
- Direct compatible media URLs use the HTML video player.
- Generic pages or providers that refuse embedding show a clear **Open in Browser** fallback rather than a broken player.
- Invalid, unsafe, or unsupported URL schemes are rejected.

Desktop opens a compact independent tutorial window that may remain available while staff work elsewhere in the POS. Mobile opens a responsive in-app player page or overlay sized for the device. Both provide play/pause, rewind 10 seconds, skip 10 seconds, progress seeking, elapsed/duration, mute/volume where supported, playback speed, fullscreen, open externally, and close/back.

## 2. Branded Automatic Client Emails

### Delivery architecture

Automatic messages reuse the existing branded HTML renderer and protected delivery/outbox path used by QR-code **Update Client** messages. They share the GadgetBoy header, palette, typography, detail cards, responsive layout, sender name, Reply-To behavior, status link treatment, footer, plain-text fallback, history, and retry behavior.

The triggering record must be saved successfully before an email is queued. Every initial acknowledgment carries a stable event key scoped to shop, record kind, record ID, and event type. The database/outbox enforces uniqueness so repeated checkout calls, retries, refreshes, or multiple open devices cannot send the same initial acknowledgment twice.

Missing or declined email addresses create a visible `not_sent` history entry with the reason. Delivery failures remain queued for the existing retry workflow and must not roll back a successful payment or consultation save.

### Trigger classification

#### Diagnostic intake

Send once after the first successful positive payment that initiates a work order through a diagnostic fee.

**Subject:** `We’ve received your [Device] — Work Order #[Number]`

**Body:**

> Hi [Client First Name],
>
> Thank you for trusting GadgetBoy with your [Device Make/Model]. We’ve received your device and recorded your diagnostic payment of [Amount].
>
> **Device:** [Device]  
> **Reported issue:** [Problem]  
> **Work order:** #[Number]
>
> We’ll begin evaluating the device and send you an update as soon as we know more. We’ll use this email address for repair updates, estimates, approvals, and completion notices.
>
> Please add our email address to your contacts or safe-sender list so our updates do not go to spam. You may reply to this message if there is anything else we should know about the device.
>
> Thank you,  
> GadgetBoy

When available, the branded version includes **View Repair Status**.

#### Part paid / awaiting delivery

Send once after the first successful positive payment allocated to an ordered part when no diagnostic acknowledgment initiated the relationship.

**Subject:** `Your repair part has been ordered — Work Order #[Number]`

**Body:**

> Hi [Client First Name],
>
> Thank you for your payment of [Amount] toward the part needed for your [Device Make/Model].
>
> **Device:** [Device]  
> **Part:** [Part Description]  
> **Work order:** #[Number]  
> **Current status:** Awaiting part delivery
>
> We’ll send you another update when the part arrives or if the order status changes. Once it arrives, we’ll continue with the repair and keep you informed.
>
> Please add our email address to your contacts or safe-sender list so these updates do not go to spam. You may reply if there is anything else we should know.
>
> Thank you,  
> GadgetBoy

#### Completed in-stock sale

Send once when a sale is completed and no item is marked as requiring an order. A sale awaiting ordered merchandise does not use this in-stock completion message.

**Subject:** `Thank you for your purchase — Sale #[Number]`

**Body:**

> Hi [Client First Name],
>
> Thank you for your purchase from GadgetBoy.
>
> **Purchase:** [Item Summary]  
> **Total paid:** [Amount]  
> **Sale:** #[Number]
>
> We appreciate your business and hope everything works perfectly for you. If you have another device problem or need help in the future, we’d be happy to see you again.
>
> You may reply to this email if you have any questions about your purchase.
>
> Thank you,  
> GadgetBoy

#### Consultation scheduled

Send when a consultation is first saved successfully, independently of payment.

**Subject:** `Your GadgetBoy consultation is scheduled — [Date and Time]`

**Body:**

> Hi [Client First Name],
>
> Your consultation with GadgetBoy has been scheduled.
>
> **Date:** [Date]  
> **Time:** [Time]  
> **Location/type:** [Location or Remote]  
> **Topic:** [Consultation Type]  
> **Device:** [Device, when provided]  
> **Estimated duration:** [Duration]
>
> Please reply to this message with any additional details, questions, photos, or information you’d like us to review before the consultation.
>
> If you need to make a change, reply to this email or contact us before the scheduled time.
>
> Thank you,  
> GadgetBoy

#### Consultation updated

Send when a saved consultation's date, time, location/type, duration, topic, device, or assigned consultant changes. Rapid successive edits are debounced and consolidated. Cosmetic/internal changes do not generate an email. Each update records a digest of the communicated fields so saving an unchanged appointment cannot resend it.

**Subject:** `Updated GadgetBoy consultation details — [Date and Time]`

**Body:**

> Hi [Client First Name],
>
> Your GadgetBoy consultation has been updated. Please review the current details below.
>
> **Date:** [Updated Date]  
> **Time:** [Updated Time]  
> **Location/type:** [Updated Location or Remote]  
> **Topic:** [Updated Consultation Type]  
> **Device:** [Updated Device, when provided]  
> **Estimated duration:** [Updated Duration]
>
> **Changed:** [Concise list of previous → updated values]
>
> Please reply to this email if anything is incorrect or if you’d like to add information before the consultation.
>
> Thank you,  
> GadgetBoy

### Visibility

Staff can preview the final rendered email and see queued, sent, failed, or not-sent status in the existing client-update history context. Automatic messages are clearly labeled by trigger type.

## 3. Inventory Supplier-Cost Review

### Entry points

- **Check All Prices** is the primary Inventory toolbar action.
- Existing inventory selection checkboxes enable **Check Selected** when at least one part/product is selected.
- An individual part/product editor provides **Check Price**.

The system checks only active parts/products with usable supplier URLs. Batch execution is bounded, rate-conscious, reports progress, and can resume safely.

### Extraction

The implementation extends the existing distributor-page extraction logic. Candidate costs are collected from structured product metadata and visible page content. The scorer considers currency, availability, sale/current price markers, crossed-out/list prices, page proximity to the product title or purchasing controls, learned supplier rules, and item-specific exceptions.

Approving a detected value reinforces the successful selector/fingerprint. If staff edit the proposed value before approval, the system records the originally detected value and correction, penalizes the incorrect candidate, and learns the corrected price location. Supplier-domain rules are preferred where page layouts are consistent; item-specific exceptions override them.

Learning data is advisory. It may improve candidate ranking but can never bypass human approval.

### Review window

Results are categorized as **Changed**, **Unchanged**, **Needs Review**, **Login Required**, and **Failed**. The primary review list contains:

- Selection control
- Item and supplier
- Previous cost
- Editable proposed cost, prefilled with the detected value
- Dollar and percentage change
- Confidence and warning explanation
- **Open Part URL**
- **Approve**
- **Skip**

Staff may edit the proposed cost and then approve. Approval updates only the item's acquisition/internal cost. It never changes retail price, markup, or sale price automatically. Suspiciously large changes and ambiguous pages receive low confidence and stronger warnings. Login-required, blocked, unreachable, or unparseable pages never create price changes.

Each approved change records shop, item, previous cost, detected cost, approved cost, source URL, supplier rule/item exception used, staff member, and timestamp. Audit history supports review and reversal.

## Synchronization and Security

- All new database records and queries remain scoped by `shop_id` and protected by RLS.
- Tutorial URLs and extraction feedback synchronize through the established desktop/mobile Supabase adapters.
- Email idempotency is enforced server-side rather than relying only on UI state.
- URL protocols are allowlisted; rendered external content is isolated from privileged Electron APIs.
- Supplier credentials and authenticated page contents are not stored in extraction-learning records.
- Cost updates require authenticated staff authorization and explicit approval.

## Failure Handling

- Tutorial player errors retain an **Open in Browser** fallback.
- An email failure does not invalidate its triggering payment, sale, or appointment; it enters the retry queue.
- Consultation update digests prevent duplicate notices after retries or concurrent saves.
- Price-check failures are isolated per item; one failed supplier page does not abort the batch.
- No candidate price is written until approval succeeds and an audit event is stored.

## Verification

Automated coverage will include:

- URL normalization, YouTube ID parsing, unsafe-scheme rejection, and embed fallback.
- Desktop/mobile repair-field synchronization and player controls.
- Email trigger classification, stable idempotency keys, no duplicate checkout messages, consultation change digests, declined/missing-email behavior, branded HTML snapshots, Reply-To, history, and retry integration.
- Price candidate ranking, learned domain rules, item exceptions, edited approvals, no unapproved mutations, suspicious-change warnings, partial batch failures, audit/reversal data, and desktop/mobile adapter parity.
- Renderer/main typechecks, desktop/mobile/web builds, and existing release regression suites.

## Explicit Non-Goals

- Uploading or storing physical tutorial video files.
- Downloading or copying YouTube media.
- Automatically changing customer-facing retail prices or markup.
- Automatically approving any detected supplier cost.
- Sending consultation-update emails for changes outside the communicated appointment fields.
