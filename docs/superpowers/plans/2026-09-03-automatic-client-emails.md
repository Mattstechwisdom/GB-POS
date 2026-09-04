# Automatic Client Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send branded, exactly-once acknowledgments for initial paid work/sales and accurate notices for scheduled or updated consultations.

**Architecture:** Pure trigger classification and template rendering feed a shop-scoped Supabase outbox RPC. Database uniqueness provides concurrency-safe idempotency; checkout and consultation flows enqueue only after their records save successfully, while the existing mail function performs delivery and retries.

**Tech Stack:** React/TypeScript, Supabase Edge Functions and Postgres, existing `client_update_history` and `send-pos-email` pipeline.

**Spec:** `docs/superpowers/specs/2026-09-03-repair-tutorial-automatic-email-price-review-design.md`

## Global Constraints

- Reuse the QR Update Client branded HTML language and Reply-To behavior.
- Never roll back a payment, sale, or consultation because email delivery fails.
- Initial work-order/sale acknowledgments send once; consultation changes send only for a changed communicated-field digest.
- Missing/declined addresses create visible `not_sent` history.

---

### Task 1: Trigger classifier and branded templates

**Files:**
- Create: `src/lib/automaticClientEmail.ts`
- Create: `supabase/functions/_shared/client-email-template.ts`
- Modify: `supabase/functions/client-updates/index.ts`
- Create: `tools/test-automatic-client-email.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `classifyAcknowledgment(record, payment): 'diagnostic-intake'|'part-awaiting-delivery'|'in-stock-sale'|null`
- Produces: `consultationDigest(consultation): string`
- Produces: `renderAutomaticClientEmail(kind, details): { subject, text, html }`

- [ ] **Step 1: Write failing behavior/snapshot assertions for all five subjects and bodies, escaped client data, GadgetBoy header, detail card, repair-status button, safe-sender wording, Reply-To copy, and plain-text fallback.**
- [ ] **Step 2: Assert diagnostic precedence, ordered-part classification only when no diagnostic acknowledgment exists, in-stock completed-sale classification, and consultation digest stability.**
- [ ] **Step 3: Run and verify RED.**
- [ ] **Step 4: Extract/reuse the branded renderer and implement the pure classifier/digest without network calls.**
- [ ] **Step 5: Add `test:automatic-client-email`; run it and `test:client-update-api`.**
- [ ] **Step 6: Commit with `git commit -m "feat: render branded automatic client emails"`.**

### Task 2: Idempotent outbox schema and RPC

**Files:**
- Create: CLI-generated migration under `supabase/migrations/`
- Modify: `supabase/functions/send-pos-email/index.ts`
- Create: `tools/test-automatic-email-outbox.cjs`

**Interfaces:**
- Produces RPC `queue_automatic_client_email(p_record_type text, p_legacy_record_id bigint, p_event_type text, p_event_digest text, p_payload jsonb)`.
- Adds unique identity `(shop_id, record_type, legacy_record_id, event_type, event_digest)`.

- [ ] **Step 1: Generate with `supabase migration new automatic_client_email_outbox`.**
- [ ] **Step 2: Write a failing migration contract test for RLS, active-shop derivation, authenticated grants, uniqueness, declined/missing handling, and atomic history/outbox insertion.**
- [ ] **Step 3: Run and verify RED.**
- [ ] **Step 4: Implement the RPC so the client never supplies a shop ID, conflicts return the existing history row, and delivery state starts `pending`, `not_sent`, or `sent` only through the mail worker.**
- [ ] **Step 5: Extend `send-pos-email` to claim these rows through the existing retry-safe delivery path.**
- [ ] **Step 6: Run migration tests, Supabase security/performance advisors, and the client-update API test.**
- [ ] **Step 7: Commit with `git commit -m "feat: queue automatic client emails safely"`.**

### Task 3: Checkout triggers

**Files:**
- Modify: `src/workorders/NewWorkOrderWindow.tsx`
- Modify: `src/sales/SaleWindow.tsx`
- Modify: `src/mobile/mobile-api.ts`
- Modify: `app/electron/electron-main.ts`
- Modify: `app/electron/preload.ts`
- Modify: `src/global.d.ts`
- Create: `tools/test-initial-payment-emails.cjs`

**Interfaces:**
- Consumes: `classifyAcknowledgment`, `queueAutomaticClientEmail`.

- [ ] **Step 1: Write failing tests showing enqueue occurs only after a saved positive first payment, checkout retry is harmless, diagnostic beats ordered-part, and completed ordered sales do not receive the in-stock template.**
- [ ] **Step 2: Run and verify RED.**
- [ ] **Step 3: Add adapter bindings and post-save enqueue calls; record nonfatal email status without changing checkout success.**
- [ ] **Step 4: Run focused tests, order-accounting/reporting tests, customer-contact test, and full typecheck.**
- [ ] **Step 5: Commit with `git commit -m "feat: acknowledge initial client payments"`.**

### Task 4: Consultation schedule/update triggers and history

**Files:**
- Modify: `src/components/ConsultationBookingWindow.tsx`
- Modify: `src/workorders/ClientUpdatePanel.tsx`
- Modify: `src/mobile/MobileApp.tsx`
- Create: `tools/test-consultation-automatic-emails.cjs`

**Interfaces:**
- Consumes: `consultationDigest`, `queueAutomaticClientEmail`.

- [ ] **Step 1: Write failing tests for initial schedule email, tracked-field update email, previous→new summary, unchanged saves, internal-only edits, debounce/consolidation, concurrent saves, and visible history states.**
- [ ] **Step 2: Run and verify RED.**
- [ ] **Step 3: Capture the saved prior digest, queue after save, debounce rapid edits, and label automatic entries in client-update history with Preview.**
- [ ] **Step 4: Run consultation tests, client-update tests, renderer/mobile typechecks, and builds.**
- [ ] **Step 5: Commit with `git commit -m "feat: email consultation schedules and changes"`.**

