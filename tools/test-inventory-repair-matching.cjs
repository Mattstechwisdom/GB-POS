const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const result = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'inventoryPartMatching.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const moduleRef = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(moduleRef, moduleRef.exports, require);
const { findInventoryPartForRepair } = moduleRef.exports;

const parts = [
  { id: 1, itemType: 'Part', itemDescription: 'HDMI Port', category: 'Game Console', repairType: 'Port Repair', associatedDevices: ['PlayStation 5', 'PlayStation 5 Slim', 'PlayStation 5 Pro'], stockCount: 10 },
  { id: 2, itemType: 'Part', itemDescription: 'Xbox HDMI Port', category: 'Game Console', repairType: 'Port Repair', associatedDevices: ['Xbox Series S'], stockCount: 4 },
  { id: 3, itemType: 'Part', itemDescription: 'Universal Diagnostic Supply', category: 'Game Console', repairType: 'Diagnostic', associatedDevices: [], stockCount: 2 },
];

assert.equal(findInventoryPartForRepair(parts, { repairCategory: 'Port Repair' }, { deviceCategory: 'Game Console', deviceName: 'PlayStation 5 Pro' })?.id, 1);
assert.equal(findInventoryPartForRepair(parts, { repairCategory: 'Port Repair' }, { deviceCategory: 'Game Console', deviceName: 'Xbox Series S' })?.id, 2);
assert.equal(findInventoryPartForRepair(parts, { repairCategory: 'Diagnostic' }, { deviceCategory: 'Game Console', deviceName: 'PlayStation 5' })?.id, 3);
assert.equal(findInventoryPartForRepair(parts, { repairCategory: 'Power Repair' }, { deviceCategory: 'Game Console', deviceName: 'PlayStation 5' }), null);
assert.equal(findInventoryPartForRepair(parts, { repairCategory: 'Port Repair' }, { deviceCategory: 'Phone', deviceName: 'PlayStation 5' }), null);

console.log('Inventory repair matching checks passed.');
