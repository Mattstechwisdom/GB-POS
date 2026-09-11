# Repair Workflow and Command Center Design

## Purpose

Make each staff QR action a reliable operational event. A technician records the real shop activity once; the work order, Command Center, repair queue, Needs Attention inbox, client history, technician history, synchronization state, and reporting projections update from the same event.

This workflow augments the existing check-in, checkout, and manual editing processes. It does not require technicians to scan at every physical movement, block manual corrections, or automatically charge customers.

## Source of Truth

Every repair action is represented by a normalized `RepairWorkflowEvent`. The authenticated `client-updates` Edge Function validates the action and writes the event and resulting work-order projection in one database transaction. The response includes the saved event and authoritative work order. The desktop and mobile clients replace their cached record with that response and refresh relevant Command Center models.

```ts
type RepairWorkflowEvent = {
  id: string;
  shopId: string;
  workOrderId: string;
  legacyRecordId: number;
  action: RepairWorkflowAction;
  audience: 'internal' | 'client';
  actorUserId: string | null;
  occurredAt: string;
  note: string;
  payload: Record<string, unknown>;
  deliveryStatus: 'internal' | 'pending' | 'sent' | 'queued' | 'failed';
};
```

Legacy `client_update_history` rows remain readable. New workflow events are projected into the existing history interface so Client Updates and Tech Notes stay visibly separated.

## Action Contract

| Action | Work-order projection | Queue and attention effect | Client contact |
|---|---|---|---|
| Diagnosis In Process | `repair_status=Diagnosis In Process`, set `diagnosis_started_at` | Diagnosing; include in today queue | Send concise diagnosis-started update |
| Technician Progress | Preserve stage; set `last_technician_activity_at` | Refresh activity and stale-work timer | None; Tech Notes only |
| Request Repair Approval | `repair_status=Awaiting Repair Approval`, store estimate and expiry | Approval stage; attention when unanswered or expired | Send Approve, Decline, Ask a Question buttons |
| Approval Received | `repair_status=Repair In Progress`, record source | Repair stage; ready for technician work | Optional acknowledgment email |
| Repair Declined | `repair_status=Repair Declined - Awaiting Pickup`, set pickup-ready anchor | Pickup stage and timer | Confirmation email |
| Add / Update Promise | Store promise time and note without overwriting repair stage | Prioritize due promises; attention only when overdue | Send promise summary and Ask a Question |
| Waiting on Device | `repair_status=Waiting on Device` | Exclude until device arrival; attention if overdue promise | Send request/instructions |
| Part Ordered | Set ordered item state and ETA; `repair_status=Part Ordered` | Parts stage; exclude before ETA | Send part/ETA update |
| Waiting on Part Delivery | Preserve ordered item states and ETA | Exclude before ETA; attention after ETA | Send delay update |
| Part Delivered / Items Delivered | Mark selected physical items received; when all required items arrive set `repair_status=Ready for Repair` | Return to queue when all required parts arrive | Send arrival/update email when appropriate |
| Testing In Progress | `repair_status=Testing In Progress`, set testing timestamp | Testing stage; include in queue | Send testing update |
| Repair Complete | `repair_status=Ready for Pickup`, set `pickup_ready_at` | Pickup stage; start reminder/storage timeline | Send ready-for-pickup buttons and status link |
| Repair Not Possible | `repair_status=Not Repairable - Awaiting Pickup`, set `pickup_ready_at` | Pickup stage; start same timeline | Send outcome and pickup options |
| Schedule Pickup | Store requested/confirmed appointment independently of stage | Suppress premature reminders until appointment passes | Confirm, Request Another Time, Add Information |
| Pickup Reminder | Preserve stage; set reminder timestamp only after successful/queued delivery | Prevent duplicate reminders; attention on delivery failure | Send reminder and pickup options |
| Picked Up / Close Ticket | `status=closed`, set pickup actor/time | Remove immediately from active lists and queue | None unless staff explicitly sends receipt/thanks |
| Review / Approve Storage Fee | Add one non-taxable fee only after staff confirmation | Clear storage-review attention after success | No automatic contact |

General Send Update changes no lifecycle stage. It records communication and refreshes the client-contact timestamp only.

## Client Interaction

Interactive emails use expiring, random, hashed tokens scoped to one work order and one allowed response set. The public page exposes only the customer-facing repair summary, requested choice, and reply form. It never exposes POS navigation, internal notes, costs not included in the request, other clients, or staff APIs.

Client responses are append-only records with unread and unresolved flags. Approval and decline responses set the visible customer decision immediately but do not silently perform staff-only financial actions. The Command Center presents them in Client Replies:

- Hover/focus preview: client, work order, device, problem, originating message, full reply, choice, and timestamp.
- Right-click/long-press: Open Work Order, Acknowledge and Advance, Respond by Email, Call Client, Mark Resolved/Unresolved, Reopen Conversation, Copy Contact Information.
- Acknowledge and Advance applies the appropriate lifecycle action. Questions and requested schedule changes retain the existing repair stage until staff acts.
- Staff replies create another outbound email in the same visible conversation and preserve complete history.

## Derived Command Center Behavior

The Command Center derives stages from explicit lifecycle fields rather than loosely matching display strings. Awaiting-parts work is excluded from today’s repair queue while its ETA is in the future and no exception exists. It returns when all required parts arrive, the ETA passes, or a technician manually resumes it. Expedited tickets sort first, followed by due promises, then actionable age and expected turnaround.

Needs Attention is derived from specific reasons: failed/queued-too-long delivery, unread client reply, expired approval, missed promise, overdue part ETA, missing technician, stale actionable repair, pickup reminder due, pickup/storage review due, inconsistent closed/pickup state, or unsynchronized workflow event. Each reason carries a direct fix action.

Immediate local refresh uses the authoritative returned record. Realtime subscription and normal cloud synchronization reconcile other devices. Lists opened in daughter windows subscribe to the same record-change event, preventing stale rows after closing or changing a work order.

## Reporting

Reporting consumes workflow event timestamps for diagnostic start, approval duration, part-wait duration, active bench time, testing time, completion-to-pickup time, client response time, promise performance, and turnaround. Existing financial reporting remains based on ticket items and payments; workflow events never create payments automatically.

## Failure Handling

- A database projection and its workflow event commit together or neither commits.
- Email delivery occurs from an outbox after the state commit. Failure leaves the operational status saved and creates a retryable Needs Attention reason.
- Repeated taps use an idempotency key and cannot duplicate events, emails, fees, or item delivery.
- Offline desktop actions remain queued locally with a visible pending-sync state, then reconcile against the authoritative event when connected.
- Manual corrections record a correction event with actor, reason, before state, and after state.

## Security

Staff QR workflows require an authenticated active staff account and shop membership. Public response tokens are hashed at rest, single-work-order scoped, action constrained, rate limited, revocable, and expire. Public pages use service-side field allowlists and never accept arbitrary work-order patches.

## Verification

Automated contract tests cover every action’s projection, queue membership, attention reasons, client-delivery behavior, idempotency, and local/cloud mapping. Integration tests cover public approval, decline, question, pickup scheduling, staff reply, realtime list refresh, and email failure. Desktop and mobile UI tests cover hover/focus previews and right-click/long-press actions. Existing check-in, checkout, financial, QR printing, and reporting suites must remain green.

The Windows release separately replaces the custom PowerShell updater handoff with Electron Updater’s supported NSIS path, persists updater diagnostics, uses an installer configuration verified for silent update mode, and tests update launch and relaunch on a clean per-user installation.
