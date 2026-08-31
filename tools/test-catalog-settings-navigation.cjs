const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const root = path.resolve(__dirname, '..'); const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const toolbar = read('src/components/Toolbar.tsx'); const settings = read('src/components/CatalogSettingsWindow.tsx');
assert.match(toolbar, /label: 'Repairs'/); assert.doesNotMatch(toolbar, /label: 'Devices\/Repairs'/); assert.doesNotMatch(toolbar, /label: 'Distributors\/Vendors'/);
for (const label of ['Part Types', 'Distributors / Vendors', 'Defaults', 'Repair Types', 'Devices']) assert.ok(settings.includes(label), `missing settings label ${label}`);
assert.match(settings, /overflow-x-auto/); assert.match(read('src/components/InventoryWindow.tsx'), /Inventory Settings/); assert.match(read('src/repairs/RepairCategoriesWindow.tsx'), /Repair Settings/);
console.log('Catalog settings navigation checks passed.');
