const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'repairDeviceScope.ts');
const source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/^import type .*?;\r?\n/m, '');
const result = esbuild.transformSync(source, {
  loader: 'ts',
  format: 'cjs',
  target: 'node20',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', result.code)(compiled, compiled.exports, require);
const { isUniversalRepairFee, matchesRepairDeviceAutofilter, matchesRepairDeviceFilter } = compiled.exports;

const devices = [
  { title: 'Game Console', name: 'PlayStation 5' },
  { title: 'Game Console', name: 'Xbox Series S' },
];
const filter = { deviceCategory: 'Game Console', deviceName: 'PlayStation 5' };

assert.equal(matchesRepairDeviceFilter({ category: 'Game Console', model: '' }, devices, filter), true);
assert.equal(matchesRepairDeviceFilter({ category: 'Game Console', model: 'PlayStation 5' }, devices, filter), true);
assert.equal(matchesRepairDeviceFilter({ category: 'Game Console', model: 'Xbox Series S' }, devices, filter), false);
assert.equal(matchesRepairDeviceFilter({ category: 'PlayStation 5', model: '' }, devices, filter), true);
assert.equal(matchesRepairDeviceFilter({ category: 'Xbox Series S', model: '' }, devices, filter), false);
assert.equal(matchesRepairDeviceFilter({ category: 'Game Console', model: 'Xbox Series S' }, devices, { deviceCategory: 'Game Console' }), true);
assert.equal(matchesRepairDeviceFilter({ category: 'Game Console', model: '' }, devices, { deviceName: 'PlayStation 5' }), true);
assert.equal(matchesRepairDeviceFilter({ category: 'Game Console', model: 'PlayStation 5' }, devices, { deviceName: 'PlayStation 5' }), true);

assert.equal(isUniversalRepairFee('Diagnostic'), true);
assert.equal(isUniversalRepairFee('Diagnostic Fee - Console'), true);
assert.equal(isUniversalRepairFee('Solder Diagnostic'), true);
assert.equal(isUniversalRepairFee('Additional Fee'), true);
assert.equal(isUniversalRepairFee('Additional Fees'), true);
assert.equal(isUniversalRepairFee('Screen Repair'), false);

assert.equal(matchesRepairDeviceAutofilter({ category: 'Phone', model: 'iPhone 16', repairCategory: 'Diagnostic Fee' }, devices, filter), true);
assert.equal(matchesRepairDeviceAutofilter({ category: 'Game Console', model: 'Xbox Series S', repairCategory: 'Additional Fees' }, devices, filter), true);
assert.equal(matchesRepairDeviceAutofilter({ category: 'Game Console', model: 'Xbox Series S', repairCategory: 'HDMI Repair' }, devices, filter), false);
assert.equal(matchesRepairDeviceAutofilter({ category: 'Game Console', model: 'PlayStation 5', repairCategory: 'HDMI Repair' }, devices, filter), true);

console.log('Repair device filter tests passed.');
