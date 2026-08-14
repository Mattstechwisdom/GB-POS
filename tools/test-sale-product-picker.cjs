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

const saleItemsTable = fs.readFileSync(path.join(__dirname, '..', 'src', 'sales', 'SaleItemsTable.tsx'), 'utf8');
const quickSale = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'QuickSaleWindow.tsx'), 'utf8');
const productsWindow = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ProductsWindow.tsx'), 'utf8');
const electronMain = fs.readFileSync(path.join(__dirname, '..', 'app', 'electron', 'electron-main.ts'), 'utf8');
assert.match(saleItemsTable, /onContextMenu=/, 'Quick Checkout sale items must support desktop right-click.');
assert.match(saleItemsTable, /onPointerDown=\{\(event\) => startHold\(event, it\)\}/, 'Quick Checkout sale items must support mobile press-and-hold.');
assert.match(saleItemsTable, /zIndex=\{100600\}/, 'The line-item menu must render above desktop and mobile modal shells.');
assert.match(saleItemsTable, /layout\?: 'stacked' \| 'split'/, 'Quick Checkout must provide a fixed split list/editor layout.');
assert.match(saleItemsTable, /gb-sale-items-table-wrap overflow-y-auto/, 'Only the catalog and checkout line lists should scroll.');
assert.match(saleItemsTable, /Catalog records stay unchanged|temporarily edit its details/, 'Quick Checkout edits must be described as ticket-only changes.');
assert.match(quickSale, /allowAddItems=\{false\}/, 'Quick repair lines must use the editable line-item table without duplicate add controls.');
assert.match(quickSale, /layout="split"/, 'Quick Checkout must keep line-item fields fixed beside the scrolling list on desktop.');
assert.match(quickSale, /gb-quick-checkout-layout[\s\S]*grid-rows-\[auto_minmax\(0,1fr\)_auto\]/, 'Quick Checkout must reserve a separate non-overlapping totals row.');
assert.match(quickSale, /gb-quick-checkout-totals/, 'Quick Checkout totals need an isolated footer surface.');
assert.match(productsWindow, /gb-sale-catalog-results[\s\S]*min-h-0 flex-1 overflow-y-auto/, 'The product result list must be the desktop picker scroll surface.');
assert.match(productsWindow, /gb-sale-catalog-editor min-h-0 overflow-hidden/, 'The desktop product detail fields must remain stationary.');
assert.match(electronMain, /title: windowTitle\('Quick Checkout'\)[\s\S]*?width: 1180|width: 1180[\s\S]*?title: windowTitle\('Quick Checkout'\)/, 'Quick Checkout needs enough desktop room for its fixed editor and totals.');
assert.doesNotMatch(quickSale, />\s*Close\s*</, 'Quick Checkout must rely on its window X instead of rendering a duplicate Close button.');

console.log('Sale product picker tests passed.');
