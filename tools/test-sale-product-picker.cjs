const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const result = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'saleProductPicker.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(compiled, compiled.exports, require);
const { buildSaleProductPickerPayload } = compiled.exports;

const picked = buildSaleProductPickerPayload({
  id: 42,
  itemDescription: '  PlayStation 5 Slim  ',
  price: 499.99,
  internalCost: 380,
  condition: 'Excellent',
  category: 'Game Console',
  distributor: 'Test Vendor',
  distributorSku: 'PS5-SLIM',
  reorderUrlTemplate: 'https://example.test/ps5',
  trackStock: true,
  stockCount: 2,
});

assert.equal(picked.inventoryProductId, 42);
assert.equal(picked.itemDescription, 'PlayStation 5 Slim');
assert.equal(picked.price, 499.99);
assert.equal(picked.internalCost, 380);
assert.equal(picked.productUrl, 'https://example.test/ps5');
assert.equal(picked.inStock, true);
assert.equal(buildSaleProductPickerPayload({ id: 43, itemDescription: '' }), null);

console.log('Sale product picker tests passed.');
