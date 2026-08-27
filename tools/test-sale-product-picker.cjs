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
const desktopCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'index.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'mobile', 'mobile.css'), 'utf8');
assert.match(saleItemsTable, /onContextMenu=/, 'Quick Checkout sale items must support desktop right-click.');
assert.match(saleItemsTable, /onPointerDown=\{\(event\) => startHold\(event, it\)\}/, 'Quick Checkout sale items must support mobile press-and-hold.');
assert.match(saleItemsTable, /zIndex=\{100600\}/, 'The line-item menu must render above desktop and mobile modal shells.');
assert.match(saleItemsTable, /layout\?: 'stacked' \| 'split'/, 'Quick Checkout must provide a fixed split list/editor layout.');
assert.match(saleItemsTable, /has-editor/, 'Mobile Quick Checkout must switch from its list to a dedicated item editor.');
assert.match(saleItemsTable, /gb-sale-items-list-pane/, 'Quick Checkout must expose a separately controlled list pane.');
assert.match(saleItemsTable, /gb-mobile-editor-back/, 'Mobile item editing must provide a direct return to the checkout list.');
assert.match(saleItemsTable, /gb-sale-item-editor-actions/, 'Mobile item Save and Cancel controls must remain reachable.');
assert.match(saleItemsTable, /gb-sale-item-editor-fields/, 'Quick Checkout details must use a fixed, compact field pane.');
assert.match(saleItemsTable, /gb-sale-items-table-wrap overflow-y-auto/, 'Only the catalog and checkout line lists should scroll.');
assert.match(saleItemsTable, /Catalog records stay unchanged|temporarily edit its details/, 'Quick Checkout edits must be described as ticket-only changes.');
assert.match(quickSale, /allowAddItems=\{false\}/, 'Quick repair lines must use the editable line-item table without duplicate add controls.');
assert.match(quickSale, /layout="split"/, 'Quick Checkout must keep line-item fields fixed beside the scrolling list on desktop.');
assert.match(quickSale, /gb-quick-checkout-layout[\s\S]*grid-rows-\[auto_minmax\(0,1fr\)_auto\]/, 'Quick Checkout must reserve a separate non-overlapping totals row.');
assert.match(quickSale, /gb-quick-checkout-totals/, 'Quick Checkout totals need an isolated footer surface.');
assert.match(productsWindow, /gb-sale-catalog-results[\s\S]*min-h-0 flex-1 overflow-y-auto/, 'The product result list must be the desktop picker scroll surface.');
assert.match(productsWindow, /gb-sale-catalog-editor min-h-0 overflow-hidden/, 'The desktop product detail fields must remain stationary.');
assert.match(productsWindow, /gb-sale-catalog-picker \$\{selectedId \? 'has-selection'/, 'Mobile product picking must switch between readable list and detail states.');
assert.match(productsWindow, /gb-mobile-catalog-back/, 'Mobile product details must provide a direct return to the product list.');
assert.match(electronMain, /displayAwareWindowSize\([\s\S]*?\{ width: 1180, height: 840 \}[\s\S]*?\{ width: 880, height: 620 \}/, 'Quick Checkout must keep its default desktop size while fitting smaller display work areas.');
assert.match(electronMain, /displayAwareWindowSize\([\s\S]*?\{ width: 1280, height: 840 \}[\s\S]*?\{ width: 900, height: 620 \}/, 'The product picker must fit the active desktop work area.');
assert.match(electronMain, /function fitWindowIntoWorkArea[\s\S]*?setMinimumSize[\s\S]*?setBounds/, 'Daughter windows must retain their defaults when possible and fit the active work area when space is limited.');
assert.match(electronMain, /const reveal = \(\) => \{[\s\S]*?fitWindowIntoWorkArea\(win\)/, 'The shared daughter-window reveal path must enforce dynamic display fitting.');
assert.match(quickSale, /document\.documentElement[\s\S]*?html\.style\.overflow = 'hidden'[\s\S]*?body\.style\.overflow = 'hidden'/, 'Quick Checkout must lock document scrolling while open.');
assert.doesNotMatch(quickSale, />\s*Close\s*</, 'Quick Checkout must rely on its window X instead of rendering a duplicate Close button.');
assert.match(desktopCss, /\.gb-sale-catalog-picker\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/, 'The desktop product picker must remain locked to the daughter-window viewport.');
assert.match(desktopCss, /\.gb-sale-catalog-scroll\s*\{[\s\S]*?overflow-y:\s*auto;/, 'The left product list must own product-picker scrolling.');
assert.match(desktopCss, /\.gb-sale-catalog-editor-content\s*\{[\s\S]*?overflow:\s*hidden;/, 'Product detail fields and actions must remain stationary.');
assert.match(desktopCss, /\.gb-quick-checkout-layout\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*hidden;/, 'Quick Checkout must constrain its center content above the totals footer.');
assert.match(desktopCss, /\.gb-quick-checkout-totals\s*\{[\s\S]*?padding:\s*0\.55rem 0\.75rem !important;/, 'The Quick Checkout footer must remain compact enough to keep Checkout visible.');
assert.match(mobileCss, /\.gbpos-mobile \.gb-quick-checkout-totals > \.pt-2 button\s*\{[\s\S]*?min-height:\s*2\.15rem;/, 'Mobile Quick Checkout must keep its Checkout action compact and visible.');

console.log('Sale product picker tests passed.');
