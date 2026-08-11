const assert = require('node:assert/strict');
const fs = require('node:fs');
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
  quantity: 3,
  inStock: false,
});

assert.equal(picked.inventoryProductId, 42);
assert.equal(picked.itemDescription, 'PlayStation 5 Slim');
assert.equal(picked.price, 499.99);
assert.equal(picked.internalCost, 380);
assert.equal(picked.productUrl, 'https://example.test/ps5');
assert.equal(picked.quantity, 3);
assert.equal(picked.inStock, false);
assert.equal(buildSaleProductPickerPayload({ id: 43, itemDescription: '' }), null);

const productsWindow = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ProductsWindow.tsx'), 'utf8');
const desktopStyles = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'index.css'), 'utf8');
const mobileStyles = fs.readFileSync(path.join(__dirname, '..', 'src', 'mobile', 'mobile.css'), 'utf8');

assert.match(productsWindow, /gb-sale-catalog-editor[^\n]*overflow-hidden/);
assert.match(desktopStyles, /\.gb-sale-catalog-results\s*>\s*:last-child\s*\{[^}]*overflow-y:\s*auto\s*!important/s);
assert.match(desktopStyles, /\.gb-sale-catalog-editor\s*\{[^}]*overflow:\s*hidden\s*!important/s);
assert.match(mobileStyles, /\.gb-sale-catalog-picker\s*\{[^}]*overflow:\s*hidden/s);
assert.match(mobileStyles, /\.gb-sale-catalog-results\s*\{[^}]*overflow:\s*hidden/s);

console.log('Sale product picker tests passed.');
