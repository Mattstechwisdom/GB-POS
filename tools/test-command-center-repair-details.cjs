const assert = require('node:assert/strict');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
});

const { repairPresentationFor, shouldOpenAttentionPanel, isExpeditedWorkOrder, compareRepairQueuePriority, partEtaFor } = require('../src/lib/commandCenterPresentation.ts');

const current = repairPresentationFor({
  id: 417,
  productCategory: 'Game Console',
  productDescription: 'PlayStation 5',
  model: 'CFI-1215A Disc Edition',
  serial: 'AJ1234567',
  problemInfo: 'No video after a power surge; HDMI port feels loose.',
  items: [{ repair: 'Diagnostic' }],
});

assert.deepEqual(current, {
  deviceLabel: 'PlayStation 5 - CFI-1215A Disc Edition',
  deviceCategory: 'Game Console',
  model: 'CFI-1215A Disc Edition',
  serial: 'AJ1234567',
  problem: 'No video after a power surge; HDMI port feels loose.',
});

const legacy = repairPresentationFor({
  productCategory: 'Laptop',
  items: [{ repair: 'Diagnostic' }],
});

assert.equal(legacy.deviceLabel, 'Laptop');
assert.equal(legacy.problem, 'Problem not entered');
assert.notEqual(legacy.deviceLabel, 'Diagnostic');

assert.equal(shouldOpenAttentionPanel(4, 4), false, 'A data refresh must not reopen Needs Attention.');
assert.equal(shouldOpenAttentionPanel(4, 5), true, 'A new explicit request must open Needs Attention.');
assert.equal(shouldOpenAttentionPanel(0, 0), false);

assert.equal(isExpeditedWorkOrder({ items: [{ repair: 'Expedited Service Fee', labor: 49 }] }), true);
assert.equal(isExpeditedWorkOrder({ items: [{ repair: 'Diagnostic', labor: 50 }] }), false);
assert.ok(compareRepairQueuePriority({ expedited: true, activityAt: '2026-09-10' }, { expedited: false, activityAt: '2026-09-01' }) < 0, 'Expedited work must sort before older standard work.');
assert.equal(partEtaFor({ repairStatus: 'Waiting on Part Delivery', estimatedDate: '2026-09-18', partsEstDelivery: '2026-09-17' }), '2026-09-17');
assert.equal(partEtaFor({ repairStatus: 'Customer Promise Scheduled', estimatedDate: '2026-09-18' }), '', 'A customer promise must not become a part ETA.');

console.log('Command Center device-first repair presentation checks passed.');
