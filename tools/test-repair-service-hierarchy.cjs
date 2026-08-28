const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'repairServiceHierarchy.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { filterServiceAssignments, normalizeServiceKey, serviceDisplayLabel } = moduleShim.exports;

const rows = [
  { id: 'ps5-usb', category: 'Game Console', model: 'PlayStation 5', title: 'USB Port Repair', serviceKey: 'usb-port-repair' },
  { id: 'laptop-usb', category: 'Laptop', model: 'Dell XPS', title: 'USB Port Repair', serviceKey: 'usb-port-repair' },
];
assert.equal(normalizeServiceKey(' USB Port Repair '), 'usb-port-repair');
assert.equal(serviceDisplayLabel(rows[0]), 'PlayStation 5 — USB Port Repair');
assert.deepEqual(filterServiceAssignments(rows, { deviceCategory: 'Game Console', deviceName: 'PlayStation 5' }).map((row) => row.id), ['ps5-usb']);
console.log('Repair service hierarchy checks passed.');
