const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const calendar = read('src/components/CalendarWindow.tsx');
const mobile = read('src/mobile/mobile-api.ts');
const desktop = read('app/electron/electron-main.ts');
const migration = read('supabase/migrations/20260823222420_add_calendar_recurrence.sql');
const eod = read('src/components/EODWindow.tsx');

assert(calendar.includes('Recurring entry'), 'Calendar Add Entry must expose the recurrence checkbox.');
assert(calendar.includes('Weekday pattern') && calendar.includes('<option value="-1">Last</option>'), 'Monthly recurrence must support last-weekday patterns.');
assert(calendar.includes('const body = noteDraft.body;'), 'Calendar notes must preserve their exact body whitespace.');
assert(calendar.includes("notes: String(editing.notes || ''),"), 'Queued task details must preserve pasted whitespace.');
assert(calendar.includes('expandRecurringEvent(event, firstVisibleDate, lastVisibleDate)'), 'Calendar must expand recurring entries for the visible range.');
assert(mobile.includes('recurrence_rule:') && mobile.includes('recurrenceRule:'), 'Android/mobile Supabase mapping must round-trip recurrence rules.');
assert(desktop.includes('recurrence_rule:') && desktop.includes('recurrenceRule:'), 'Desktop Supabase mapping must round-trip recurrence rules.');
assert(migration.includes('add column if not exists recurrence_rule jsonb'), 'Supabase migration must add recurrence storage.');
assert(eod.includes('pendingDeliveries') && eod.includes('Mark Delivered'), 'EOD must show purchased items awaiting delivery.');
assert(eod.includes("statusKey: sourceType === 'workOrder' ? 'part_delivered' : 'product_in_shop'"), 'Delivered purchases must send the correct client arrival update.');
assert(eod.includes("orderStatus: 'received'"), 'Delivered purchases must mark the linked invoice line item received.');
assert(eod.includes('No client update was required.'), 'Standalone inventory purchases must still be markable as delivered.');

console.log('v0.6.27 calendar recurrence and EOD delivery regression checks passed.');
