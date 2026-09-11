const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
});

const {
  REPAIR_UPDATE_OPTIONS,
  clientDeliveryForRepairAction,
  repairActionPatch,
  groupRepairUpdateOptions,
  groupClientRepairUpdateOptions,
  deliverableItemIndexes,
} = require('../src/lib/clientUpdateOptions.ts');

const keys = REPAIR_UPDATE_OPTIONS.map((option) => option.key);
for (const key of ['repair_approval', 'approval_received', 'repair_declined', 'customer_promise', 'technician_progress', 'testing_in_progress', 'schedule_pickup', 'picked_up', 'items_delivered']) {
  assert.ok(keys.includes(key), `Missing shared QR action: ${key}`);
}

assert.equal(clientDeliveryForRepairAction('technician_progress'), 'internal');
assert.equal(clientDeliveryForRepairAction('testing_in_progress'), 'client');
assert.equal(clientDeliveryForRepairAction('repair_approval'), 'client');
assert.equal(clientDeliveryForRepairAction('customer_promise'), 'client');
assert.equal(clientDeliveryForRepairAction('picked_up'), 'internal');
assert.equal(clientDeliveryForRepairAction('items_delivered'), 'client');

const grouped = groupRepairUpdateOptions(REPAIR_UPDATE_OPTIONS);
assert.deepEqual(Object.keys(grouped), ['client', 'technician', 'ticket']);
assert.ok(grouped.client.every((option) => clientDeliveryForRepairAction(option.key) === 'client'));
assert.deepEqual(grouped.technician.map((option) => option.key), ['technician_progress']);
assert.deepEqual(grouped.ticket.map((option) => option.key), ['picked_up', 'approve_storage_fee']);
assert.equal(grouped.client.length + grouped.technician.length + grouped.ticket.length, REPAIR_UPDATE_OPTIONS.length);

const clientSections = groupClientRepairUpdateOptions(grouped.client);
assert.deepEqual(Object.keys(clientSections), ['communication', 'approval', 'progress', 'parts']);
assert.deepEqual(clientSections.communication.map((option) => option.key), ['pickup_reminder', 'manual_update', 'customer_promise', 'schedule_pickup']);
assert.deepEqual(clientSections.approval.map((option) => option.key), ['repair_approval', 'approval_received', 'repair_declined']);
assert.deepEqual(clientSections.progress.map((option) => option.key), ['diagnosis', 'testing_in_progress', 'repair_complete', 'not_possible']);
assert.deepEqual(clientSections.parts.map((option) => option.key), ['waiting_device', 'part_ordered', 'waiting_part', 'part_delivered', 'items_delivered']);
assert.equal(Object.values(clientSections).flat().length, grouped.client.length);

assert.deepEqual(deliverableItemIndexes([
  { description: 'Diagnostic Fee', labor: 50 },
  { description: 'HDMI Port', parts: 18, labor: 90, requiresOrder: true, orderStatus: 'ordered' },
  { description: 'Expedited Service Fee', labor: 25, feeType: 'expedited' },
  { description: 'Screen', parts: 45, inStock: false, orderStatus: 'needed' },
  { description: 'In-stock Cable', parts: 10, inStock: true, orderStatus: 'in_stock' },
  { description: 'Storage Fee', labor: 25, feeType: 'storage' },
  { description: 'Battery', parts: 30, requiresOrder: true, orderStatus: 'received' },
]), [1, 3, 6]);

const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'workorders', 'ClientUpdatePanel.tsx'), 'utf8');
assert.match(panelSource, /<details className={`gb-client-update-subsection \${key}`}>/);
assert.doesNotMatch(panelSource, /<details[^>]+\sopen(?:=|\s|>)/, 'QR action sections must all start collapsed');

assert.deepEqual(
  repairActionPatch('technician_progress', { notes: 'Removed shield and tested PSU.' }, '2026-09-10T18:00:00.000Z'),
  {
    techNotes: 'Removed shield and tested PSU.',
    lastUpdateNote: 'Removed shield and tested PSU.',
    lastUpdateAt: '2026-09-10T18:00:00.000Z',
  },
);

assert.deepEqual(
  repairActionPatch('approval_received', { notes: '' }, '2026-09-10T18:00:00.000Z'),
  { repairStatus: 'Repair In Progress', statusUpdate: 'Repair Approved', statusUpdatedAt: '2026-09-10T18:00:00.000Z', techNotes: '' },
);

assert.deepEqual(
  repairActionPatch('repair_declined', { notes: 'Client declined board repair.' }, '2026-09-10T18:00:00.000Z'),
  { repairStatus: 'Repair Declined - Awaiting Pickup', statusUpdate: 'Repair Declined', statusUpdatedAt: '2026-09-10T18:00:00.000Z', techNotes: 'Client declined board repair.' },
);

assert.deepEqual(
  repairActionPatch('testing_in_progress', { notes: 'Running a one-hour load test.' }, '2026-09-10T18:00:00.000Z'),
  {
    repairStatus: 'Testing In Progress',
    statusUpdate: 'Testing In Progress',
    statusUpdatedAt: '2026-09-10T18:00:00.000Z',
    techNotes: 'Running a one-hour load test.',
  },
);

assert.deepEqual(
  repairActionPatch('customer_promise', { estimatedDate: '2026-09-11', estimatedTime: '13:30', notes: 'Diagnostic update by 1:30 PM.' }, '2026-09-10T18:00:00.000Z'),
  {
    promisedAt: new Date('2026-09-11T13:30:00').toISOString(),
    promiseNote: 'Diagnostic update by 1:30 PM.',
  },
);

console.log('Repair QR workflow action contract checks passed.');
