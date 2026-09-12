# Command Center Operations Design

## Goal

Make the Command Center actively rank the next seven repairs, surface only genuine exceptions, expose learned repair statistics, and provide a direct ordered-product delivery workflow. Make checkout completion acknowledged and observable instead of relying on a silent one-way message.

## Repair queue

The compact queue contains no more than seven open, actionable work orders. Closed, completed, pickup-ready, future-part-ETA, and waiting-device records are excluded. Ranking is deterministic: expedited service first; diagnosing/testing second; historically quick repairs third; stagnant work fourth; all other eligible work last. Within a tier, promises come before untimed work and older activity comes first. The full queue remains available in its daughter panel.

A repair pattern is the normalized device category plus substantive repair line names. Diagnostic and expedited fee lines do not define a repair pattern. A pattern becomes a learned quick turnaround after at least two completed samples with a median diagnosis/check-in-to-repair-completion time of 24 hours or less.

## Needs Attention

Needs Attention contains records requiring action: overdue unchecked-in work, stalled active work, client updates without follow-up, overdue approvals/promises/parts, due or failed pickup reminders, pickup/storage review, unread replies, sync failures, unresolved client links, unknown technicians, invalid totals, missing device/line data, and unscheduled consultations. Future part ETAs, future pickup appointments, waiting-device stages, and normally progressing records are suppressed. Thresholds are synchronized POS settings.

## Statistics

Repair Statistics derives from stored work orders without duplicating source data. It shows completed sample count, average and median repair turnaround, quick-turnaround count/rate, most common repairs, and learned quick patterns. Statistics refresh whenever work orders change.

## Product delivery

Product Delivery lists sales and consultations with ordered product/part lines that are not delivered. It shows client, invoice, item count, product names, ETA, and status. Mark Delivered uses the existing authenticated client-updates function with exact item indexes, refreshes synchronized sales data, and removes fully delivered tickets from this section.

## Checkout reliability

Checkout completion uses a window-scoped request/acknowledgement channel. The checkout button shows a processing state, cannot double-submit, reports bridge/session errors in the window, and closes only after the desktop process acknowledges the result. The existing parent checkout persistence remains responsible for recording payments and updating inventory.

## Release

All targeted and release regression tests, renderer/main typechecks, production build, Windows packaging, and signed Android build must pass before publishing the next version through the tag-driven release workflow.
