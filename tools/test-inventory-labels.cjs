const assert = require('node:assert/strict');
const fs = require('node:fs');

const helper = fs.readFileSync('src/lib/inventoryLabels.ts', 'utf8');
const inventory = fs.readFileSync('src/components/InventoryWindow.tsx', 'utf8');
const mobile = fs.readFileSync('src/mobile/MobileApp.tsx', 'utf8');

assert.match(helper, /inventoryId/);
assert.match(helper, /2\.25 × 1\.25 in/);
assert.match(inventory, /Inventory Label Preview/);
assert.match(inventory, /SKU \/ Item #/);
assert.match(inventory, /VITE_PUBLIC_APP_URL/);
assert.match(inventory, /inventoryReorderQuantity\(editing\)/, 'scan view must default to the item MOQ');
assert.match(inventory, /Full Supplier Cost/);
assert.match(inventory, /Added .* to the EOD purchasing cart/);
assert.match(mobile, /inventoryDeepLink/);
assert.match(mobile, /initialWindow=\{inventoryDeepLink \? 'inventory' : ''\}/);
console.log('Inventory label and scanner checks passed.');
