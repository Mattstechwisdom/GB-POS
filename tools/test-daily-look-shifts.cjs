const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'technicianSchedule.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { technicianShiftsForDate } = moduleShim.exports;

const technicians = [
  { id: 1, nickname: 'Matt', active: true, schedule: { tue: { start: '10:00', end: '18:00' } } },
  { id: 2, nickname: 'Tank', active: true, schedule: { tue: { start: '09:00', end: '17:00' } } },
  { id: 3, nickname: 'Off Tech', active: true, schedule: { tue: { start: '09:00', end: '17:00', off: true } } },
  { id: 4, nickname: 'Disabled', active: false, schedule: { tue: { start: '08:00', end: '16:00' } } },
];

assert.deepEqual(technicianShiftsForDate(technicians, '2026-08-11'), [
  { name: 'Tank', start: '09:00', end: '17:00' },
  { name: 'Matt', start: '10:00', end: '18:00' },
]);
assert.deepEqual(technicianShiftsForDate(technicians, '2026-08-11', 'Matt'), [
  { name: 'Matt', start: '10:00', end: '18:00' },
]);
assert.deepEqual(technicianShiftsForDate(technicians, 'not-a-date'), []);

console.log('Daily Look technician shift checks passed.');
