const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('src/components/CommandCenter.tsx', 'utf8');
const start = source.indexOf('const openTodayItem =');
const end = source.indexOf('const recordLabel =', start);
assert.ok(start >= 0 && end > start);
const code = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2021 });
let opened;
const openInvoice = () => { opened = { type: 'invoice' }; };
const window = { api: { openNewWorkOrder: openInvoice, openNewSale: openInvoice } };
const props = { onOpenModal: (type, payload) => { opened = { type, payload }; } };
function click(row, title) {
  opened = null;
  new Function('window', 'props', 'data', 'panel', 'openRecord', 'row', `${code};openTodayItem(row);`)(window, props, { calendarNotes: [{ id: 91 }] }, { title }, openInvoice, row);
  return opened;
}
assert.deepEqual(click({ id: 91, category: 'task', title: 'Clean repair bench', workOrderId: 0, saleId: 0 }, 'Today · Tasks'), { type: 'calendar', payload: { calendarEventId: 91 } }, 'An unlinked task must open its expanded calendar entry, not a blank work order.');
assert.deepEqual(click({ id: 92, category: 'task', workOrderId: 1406 }, 'Today · Tasks'), { type: 'calendar', payload: { calendarEventId: 92 } }, 'Even a linked task opens its task details first.');
assert.deepEqual(click({ id: 91, subject: 'Shop note', workOrderId: 0 }, 'Today · Notes'), { type: 'calendar', payload: { calendarNoteId: 91 } });
assert.deepEqual(click({ id: 91, category: 'event' }, 'Today · Events'), { type: 'calendar', payload: { calendarEventId: 91 } }, 'A note ID collision must not open the wrong calendar entry.');
assert.deepEqual(click({ id: 93, kind: 'consultation', source: {} }, 'Today · Consultations'), { type: 'invoice' });
console.log('Command Center Tasks/Events/Notes/Consultation click routing passed.');
