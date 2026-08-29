const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'inventoryDeviceGroups.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { buildInventoryDeviceGroups } = moduleShim.exports;

const rows = [
  { id: 1, itemType: 'Part', itemDescription: 'iPhone 7 Screen', partCategory: 'Screen', associatedDevices: [], isParentPart: true },
  { id: 2, itemType: 'Part', itemDescription: 'iPhone 7 Screen Black', partCategory: 'Screen', associatedDevices: ['iPhone 7'], parentProductId: 1 },
  { id: 3, itemType: 'Part', itemDescription: 'PS5 HDMI Port', partCategory: 'HDMI Port', associatedDevices: ['PS5', 'PS5 Slim'] },
  { id: 4, itemType: 'Part', itemDescription: 'Unassigned Cable', partCategory: 'Cable', associatedDevices: [] },
];

const groups = buildInventoryDeviceGroups(rows);
assert.deepEqual(groups.map(group => group.device), ['iPhone 7', 'PS5', 'PS5 Slim', 'Unassigned']);
assert.deepEqual(groups[0].categories.map(category => category.category), ['Screen']);
assert.deepEqual(groups[0].categories[0].items.map(item => item.id), [1, 2]);
assert.deepEqual(groups[1].categories[0].items.map(item => item.id), [3]);
assert.deepEqual(groups[2].categories[0].items.map(item => item.id), [3], 'one stock record may appear under each compatible device');
assert.deepEqual(groups[3].categories[0].items.map(item => item.id), [4]);

const inventoryUi = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'InventoryWindow.tsx'), 'utf8');
assert.match(inventoryUi, />All Parts</);
assert.match(inventoryUi, />By Device</);
assert.match(inventoryUi, /Parts grouped by compatible device/);
assert.match(inventoryUi, /expandedDeviceGroups/);
assert.match(inventoryUi, /expandedDeviceCategories/);

console.log('Inventory device grouping checks passed.');
