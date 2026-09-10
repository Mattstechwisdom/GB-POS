const assert = require('node:assert/strict');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
});

const {
  REPAIR_UPDATE_OPTIONS,
  clientDeliveryForRepairAction,
  repairActionPatch,
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
