const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'commandCenter.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { buildCommandCenterModel } = moduleShim.exports;

const model = buildCommandCenterModel({
  now: new Date('2026-09-09T12:00:00'),
  technicians: [{ id: 'local-7', legacyId: '7', cloudId: 'cloud-tech-id', firstName: 'Matthew' }],
  workOrders: [
    { id: 10, status: 'closed', totals: { total: 100, remaining: 70 }, assignedTo: '7' },
    { id: 11, status: 'open', checkoutDate: '2026-09-08T10:00:00', assignedTo: 'cloud-tech-id' },
    { id: 12, status: 'cancelled', assignedTo: 'local-7' },
    { id: 13, status: 'open', assignedTo: '7', repairStatus: 'Diagnosing' },
    { id: 14, status: 'open', assignedTo: 'unresolved-random-id' },
  ],
});

assert.deepEqual(model.activeWorkOrders.map((row) => row.id), [13, 14], 'closed, checked-out, and cancelled work orders must not be active');
assert.equal(model.stages['Checked in'].length, 1, 'only genuinely open unclassified work orders belong in Checked in');
assert.equal(model.workOrders.find((row) => row.id === 13).technician, 'Matthew');
assert.equal(model.workOrders.find((row) => row.id === 11).technician, 'Matthew');
assert.equal(model.workOrders.find((row) => row.id === 14).technician, 'Unknown technician');

console.log('Command Center model regression checks passed.');
