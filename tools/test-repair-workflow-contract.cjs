const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' } });

const { REPAIR_UPDATE_OPTIONS } = require('../src/lib/clientUpdateOptions.ts');
const { applyRepairWorkflowAction, repairWorkflowDefinition } = require('../src/lib/repairWorkflow.ts');

const expected = {
  pickup_reminder: ['client', 'Pickup', true], manual_update: ['client', null, true],
  repair_approval: ['client', 'Approval', true], approval_received: ['client', 'Repair', true],
  repair_declined: ['client', 'Pickup', true], customer_promise: ['client', null, true],
  schedule_pickup: ['client', 'Pickup', true], picked_up: ['internal', 'Completed', false],
  approve_storage_fee: ['internal', null, false], technician_progress: ['internal', null, false],
  diagnosis: ['client', 'Diagnosing', true], testing_in_progress: ['client', 'Testing', true],
  waiting_device: ['client', 'Waiting Device', true], part_ordered: ['client', 'Parts', true],
  waiting_part: ['client', 'Parts', true], part_delivered: ['client', 'Repair', true],
  items_delivered: ['client', 'Repair', true], repair_complete: ['client', 'Pickup', true],
  not_possible: ['client', 'Pickup', true],
};

for (const option of REPAIR_UPDATE_OPTIONS) {
  const definition = repairWorkflowDefinition(option.key);
  assert.deepEqual([definition.audience, definition.stage, definition.sendsClientMessage], expected[option.key], `Wrong workflow definition for ${option.key}`);
}

const now = new Date('2026-09-10T18:00:00.000Z');
const base = { id: 82, status: 'open', workflowStage: 'Checked in', items: [
  { description: 'HDMI Port', requiresOrder: true, orderStatus: 'ordered' },
  { description: 'Labor', labor: 90 },
] };

let result = applyRepairWorkflowAction(base, 'diagnosis', { note: 'Beginning diagnosis.', idempotencyKey: 'diag-82' }, now);
assert.deepEqual(result.patch, { workflowStage: 'Diagnosing', repairStatus: 'Diagnosis In Process', statusUpdate: 'Diagnosis In Process', diagnosisStartedAt: now.toISOString(), lastTechnicianActivityAt: now.toISOString(), statusUpdatedAt: now.toISOString(), updatedAt: now.toISOString() });
assert.equal(result.event.idempotencyKey, 'diag-82');
assert.equal(result.event.action, 'diagnosis');

result = applyRepairWorkflowAction(base, 'part_ordered', { estimatedDate: '2026-09-15', note: 'Port ordered.' }, now);
assert.equal(result.patch.workflowStage, 'Parts');
assert.equal(result.patch.partEta, '2026-09-15');

result = applyRepairWorkflowAction(base, 'items_delivered', { itemIndexes: [0] }, now);
assert.equal(result.patch.workflowStage, 'Repair');
assert.equal(result.patch.items[0].orderStatus, 'received');
assert.equal(result.patch.items[1].description, 'Labor');

result = applyRepairWorkflowAction(base, 'customer_promise', { estimatedDate: '2026-09-11', estimatedTime: '13:30', note: 'Call with results.' }, now);
assert.equal(result.patch.workflowStage, undefined, 'A promise must not overwrite the repair stage.');
assert.equal(result.patch.promiseNote, 'Call with results.');

result = applyRepairWorkflowAction(base, 'repair_complete', { note: 'Passed testing.' }, now);
assert.equal(result.patch.workflowStage, 'Pickup');
assert.equal(result.patch.pickupReadyAt, now.toISOString());

result = applyRepairWorkflowAction({ ...base, totals: { remaining: 0 } }, 'picked_up', { actor: 'Tech A' }, now);
assert.equal(result.patch.status, 'closed');
assert.equal(result.patch.workflowStage, 'Completed');
assert.equal(result.patch.pickedUpAt, now.toISOString());

assert.throws(() => repairWorkflowDefinition('made_up_action'), /Unsupported repair workflow action/);
console.log('Repair workflow contract checks passed.');
