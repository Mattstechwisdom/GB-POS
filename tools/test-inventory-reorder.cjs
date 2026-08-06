const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'inventoryReorder.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const {
  buildInventoryReorderPurchase,
  fillInventoryReorderUrl,
  inventoryLowStockFingerprint,
  inventoryReorderQuantity,
  isInventoryLowStock,
} = moduleShim.exports;

const tracked = {
  id: 42,
  itemDescription: 'PlayStation 5 Power Supply',
  itemType: 'Part',
  distributor: 'Console Parts Direct',
  distributorSku: 'PS5-PSU-01',
  internalCost: 54.995,
  reorderQty: 2.4,
  reorderUrlTemplate: 'https://parts.example/order?sku={{sku}}&qty={{qty}}',
  trackStock: true,
  stockCount: 1,
  lowStockThreshold: 1,
  vendorTaxExempt: true,
};

assert.equal(isInventoryLowStock(tracked), true, 'stock at the threshold must alert');
assert.equal(isInventoryLowStock({ ...tracked, stockCount: 2 }), false, 'stock above the threshold must not alert');
assert.equal(isInventoryLowStock({ ...tracked, trackStock: false }), false, 'untracked stock must not alert');
assert.equal(inventoryReorderQuantity(tracked), 2, 'MOQ must normalize to a positive whole quantity');
assert.equal(inventoryReorderQuantity({ reorderQty: 0 }), 1, 'MOQ must never fall below one');
assert.equal(inventoryLowStockFingerprint(tracked), '1:1', 'dismissal fingerprint must describe the current low-stock episode');
assert.equal(fillInventoryReorderUrl(tracked.reorderUrlTemplate, tracked), 'https://parts.example/order?sku=PS5-PSU-01&qty=2');

const purchase = buildInventoryReorderPurchase(tracked, '2026-08-05T12:00:00.000Z');
assert.deepEqual(purchase, {
  status: 'pending',
  sourceType: 'inventory',
  inventoryId: 42,
  itemType: 'Part',
  title: 'PlayStation 5 Power Supply',
  distributor: 'Console Parts Direct',
  orderUrl: 'https://parts.example/order?sku=PS5-PSU-01&qty=2',
  quantity: 2,
  unitCost: 55,
  itemCost: 110,
  taxExempt: true,
  supplierTaxRate: 8,
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
});

assert.throws(() => buildInventoryReorderPurchase({ ...tracked, distributor: '' }), /distributor/i);
assert.throws(() => buildInventoryReorderPurchase({ ...tracked, internalCost: undefined }), /supplier cost/i);
console.log('Inventory reorder checks passed.');
