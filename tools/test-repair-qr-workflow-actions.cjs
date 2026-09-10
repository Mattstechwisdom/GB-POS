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
for (const key of ['repair_approval', 'customer_promise', 'technician_progress', 'testing_in_progress']) {
  assert.ok(keys.includes(key), `Missing shared QR action: ${key}`);
}

assert.equal(clientDeliveryForRepairAction('technician_progress'), 'internal');
assert.equal(clientDeliveryForRepairAction('testing_in_progress'), 'client');
assert.equal(clientDeliveryForRepairAction('repair_approval'), 'client');
assert.equal(clientDeliveryForRepairAction('customer_promise'), 'client');

assert.deepEqual(
  repairActionPatch('technician_progress', { notes: 'Removed shield and tested PSU.' }, '2026-09-10T18:00:00.000Z'),
  {
    techNotes: 'Removed shield and tested PSU.',
    lastUpdateNote: 'Removed shield and tested PSU.',
    lastUpdateAt: '2026-09-10T18:00:00.000Z',
  },
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

console.log('Repair QR workflow action contract checks passed.');

