const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'commandCenter.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { buildCommandCenterModel, liveCommandCenterPanelRecords, removeCommandCenterRecord, upsertCommandCenterWorkOrder } = moduleShim.exports;

const model = buildCommandCenterModel({
  now: new Date('2026-09-09T12:00:00'),
  technicians: [{ id: 'local-7', legacyId: '7', cloudId: 'cloud-tech-id', firstName: 'Matthew' }],
  workOrders: [
    { id: 10, status: 'closed', totals: { total: 100, remaining: 70 }, assignedTo: '7' },
    { id: 11, status: 'open', checkoutDate: '2026-09-08T10:00:00', assignedTo: 'cloud-tech-id' },
    { id: 12, status: 'cancelled', assignedTo: 'local-7' },
    { id: 13, status: 'open', assignedTo: '7', repairStatus: 'Diagnosing' },
    { id: 14, status: 'open', assignedTo: 'unresolved-random-id' },
    { id: 15, status: 'closed', workflowStage: 'Diagnosing', assignedTo: '7' },
  ],
});

const recurringTaskModel = buildCommandCenterModel({
  now: new Date('2026-09-11T14:00:00.000Z'),
  calendarEvents: [{
    id: 91,
    category: 'task',
    title: 'Clean repair benches',
    date: '2026-09-04',
    recurrenceRule: { version: 1, frequency: 'weekly', interval: 1, weekdays: [5] },
  }],
});
assert.equal(recurringTaskModel.today.tasks.length, 1, 'Today must include recurring task occurrences whose master date is earlier.');
assert.equal(recurringTaskModel.today.tasks[0].date, '2026-09-11');
assert.deepEqual(upsertCommandCenterWorkOrder([{ id: 1, status: 'open' }], { id: 2, status: 'open' }).map(row => row.id), [2, 1], 'A newly checked-in device must appear immediately.');
assert.equal(upsertCommandCenterWorkOrder([{ id: 1, status: 'open' }], { id: 1, status: 'closed' })[0].status, 'closed', 'An existing Command Center record must update in place.');
assert.deepEqual(liveCommandCenterPanelRecords('Active Work Orders', model, [{ id: 10, kind: 'workorder' }]).map(row => row.id), [13, 14], 'The open Active Work Orders panel must derive from live records and remove closed tickets.');
assert.deepEqual(liveCommandCenterPanelRecords('Checked in Repairs', model, [{ id: 15, kind: 'workorder' }]).map(row => row.id), [14], 'The open stage panel must remove tickets that leave that stage.');

assert.deepEqual(model.activeWorkOrders.map((row) => row.id), [13, 14], 'closed, checked-out, and cancelled work orders must not be active');
assert.equal(model.workOrders.find((row) => row.id === 15).stage, 'Completed', 'a terminal status must override a stale explicit workflow stage');
assert.equal(model.stages['Checked in'].length, 1, 'only genuinely open unclassified work orders belong in Checked in');
assert.equal(model.workOrders.find((row) => row.id === 13).technician, 'Matthew');
assert.equal(model.workOrders.find((row) => row.id === 11).technician, 'Matthew');
assert.equal(model.workOrders.find((row) => row.id === 14).technician, 'Unknown technician');

const openPanelRows = [
  { id: 13, kind: 'workorder' },
  { id: 13, kind: 'sale' },
  { id: 14, kind: 'workorder' },
];
assert.deepEqual(
  removeCommandCenterRecord(openPanelRows, { id: 13, kind: 'workorder' }),
  [openPanelRows[1], openPanelRows[2]],
  'closing a work order must remove that exact row from the currently open Command Center list',
);

console.log('Command Center model regression checks passed.');
