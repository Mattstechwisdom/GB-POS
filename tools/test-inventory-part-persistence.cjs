const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const inventory = read('src/components/InventoryWindow.tsx');
const desktop = read('app/electron/electron-main.ts');
const mobile = read('src/mobile/mobile-api.ts');
const workOrderItems = read('src/workorders/ItemsTable.tsx');
const workOrderWindow = read('src/workorders/NewWorkOrderWindow.tsx');

for (const source of [desktop, mobile]) {
  assert.match(source, /itemType:\s*row\.item_type\s*\|\|\s*'Product'/, 'Cloud reads must restore inventory item type.');
  assert.match(source, /associatedDevices:\s*Array\.isArray\(row\.associated_devices\)/, 'Cloud reads must restore compatible devices.');
  assert.match(source, /repairType:\s*row\.repair_type/, 'Cloud reads must restore inventory repair type.');
  assert.match(source, /item_type:\s*toCloudString\(item\.itemType\s*\|\|\s*'Product'\)/, 'Cloud writes must save inventory item type.');
  assert.match(source, /associated_devices:\s*Array\.isArray\(item\.associatedDevices\)/, 'Cloud writes must save compatible devices.');
  assert.match(source, /repair_type:\s*toCloudString\(item\.repairType\)/, 'Cloud writes must save inventory repair type.');
}

assert.match(inventory, /type="search"[\s\S]*aria-label="Search compatible devices"/, 'Compatible devices must provide a searchable picker.');
assert.match(inventory, /existing\.includes\(model\)\s*\?\s*existing\.filter/, 'Compatible device selection must support toggling multiple devices.');
assert.match(inventory, />Linked Repair Service \(optional\)</, 'Parts inventory must expose the linked repair-service field without conflating it with the physical part type.');
assert.match(inventory, /inventory-repair-types/, 'Repair type must use saved repair values for suggestions.');
assert.match(inventory, /Optional for Used Parts/, 'Used parts must make distributor and cost optional.');
assert.match(inventory, /Inventory save did not return a saved listing/, 'Inventory saves must reject false success responses.');
assert.match(inventory, /save\('update'\)/, 'Inventory must expose an explicit update action.');
assert.match(inventory, /save\('create'\)/, 'Inventory must expose an explicit create action.');
assert.match(workOrderItems, /findInventoryPartForRepair\(products, selected, \{ deviceCategory, deviceName, deviceModel \}\)/, 'Work-order repairs must resolve their matching inventory part.');
assert.match(workOrderItems, /inventoryProductId:\s*Number\(selectedRepair\.inventoryProductId \|\| linkedInventory\?\.id/, 'Explicit repair links must remain authoritative before a matched inventory part.');
assert.match(workOrderWindow, /consumeInStockInventory\(api, 'workOrder', effectiveId, updatedItems/, 'Paid work-order parts must deduct linked inventory.');

console.log('Inventory part persistence and form checks passed.');
