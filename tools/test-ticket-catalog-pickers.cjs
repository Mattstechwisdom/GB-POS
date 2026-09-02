const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const repairPicker = read('src/workorders/WorkOrderRepairPickerWindow.tsx');
const productPicker = read('src/components/ProductsWindow.tsx');
const workOrderItems = read('src/workorders/ItemsTable.tsx');
const saleItems = read('src/sales/SaleItemsTable.tsx');

assert.doesNotMatch(repairPicker, /RepairItemForm/, 'Work-order selection must not expose the Admin repair editor.');
assert.match(repairPicker, /Repair selection/, 'Work-order picker must present a compact selection summary.');
assert.match(repairPicker, /Parent part family|Exact inventory part|No inventory part linked/, 'Repair selection must clearly identify its inventory relationship.');
assert.match(productPicker, /Inventory selection/, 'Sale picker must present a compact inventory summary.');
assert.match(productPicker, /Catalog details are managed in Admin → Inventory/, 'Sale picker must separate catalog administration from ticket selection.');
assert.match(workOrderItems, /Catalog-linked details/, 'Work-order line editing must distinguish catalog data from ticket-only fields.');
assert.match(saleItems, /Inventory-linked item/, 'Sale line editing must distinguish inventory data from ticket-only fields.');

console.log('Ticket catalog picker layout checks passed.');
