const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const entry = path.join(__dirname, '..', 'src', 'lib', 'calendarRecordLabels.ts');
const built = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false });
const shim = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(shim, shim.exports, require);
const { enrichCalendarEventLabels } = shim.exports;

const [resolved, missing] = enrichCalendarEventLabels([
  { id: 1, category: 'parts', technician: 'a-cloud-tech-uuid', workOrderId: 'wo-cloud-uuid', partName: 'HDMI port' },
  { id: 2, category: 'parts', technician: 'unresolved-gibberish', workOrderId: 'missing-work-order' },
], [{ id: 7, cloudId: 'a-cloud-tech-uuid', firstName: 'Matthew' }], [{ id: 1219, cloudId: 'wo-cloud-uuid' }], []);

assert.equal(resolved.technician, 'Matthew');
assert.equal(resolved.workOrderLabel, 'WO #1219');
assert.equal(missing.technician, 'Unknown technician');
assert.equal(missing.workOrderLabel, 'Work order unavailable');
assert.doesNotMatch(`${missing.technician} ${missing.workOrderLabel}`, /unresolved-gibberish|missing-work-order/);

console.log('Calendar readable-link checks passed.');
