const assert = require('node:assert/strict');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
});

const { repairPresentationFor, shouldOpenAttentionPanel } = require('../src/lib/commandCenterPresentation.ts');

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

console.log('Command Center device-first repair presentation checks passed.');
