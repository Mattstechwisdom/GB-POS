const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const build = esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'lib', 'categoryPerformance.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { buildCategoryPerformance, normalizeSalesCategory } = moduleShim.exports;

assert.equal(normalizeSalesCategory('Drinks'), 'Beverages');
assert.equal(normalizeSalesCategory('beverage'), 'Beverages');
assert.equal(normalizeSalesCategory('Phone Accessories'), 'Accessories');
assert.equal(normalizeSalesCategory('Consultation'), 'Consultations');

const inventory = [
  { id: 10, itemDescription: 'Cola', itemType: 'Product', category: 'Drinks', internalCost: 0.5, price: 2, trackStock: true, stockCount: 2, lowStockThreshold: 3 },
  { id: 11, itemDescription: 'USB-C Cable', itemType: 'Product', category: 'Accessories', internalCost: 4, price: 12, trackStock: true, stockCount: 8, lowStockThreshold: 2 },
];
const records = [
  {
    id: 100,
    kind: 'sale',
    discount: 0,
    taxRate: 8,
    items: [
      { inventoryProductId: 10, description: 'Cola', qty: 3, price: 2, internalCost: 0.5, category: 'Drink' },
      { inventoryProductId: 11, description: 'USB-C Cable', qty: 1, price: 12, internalCost: 4, category: 'Accessories' },
    ],
    payments: [{ applied: 19.44, at: '2026-09-10T14:00:00.000Z' }],
  },
  {
    id: 101,
    kind: 'sale',
    category: 'Consultation',
    items: [{ description: 'Consultation', qty: 1, price: 75, category: 'Consultation' }],
    payments: [{ applied: 75, at: '2026-09-10T15:00:00.000Z' }],
  },
  {
    id: 102,
    kind: 'repair',
    laborCost: 100,
    payments: [{ applied: 100, at: '2026-09-10T16:00:00.000Z' }],
  },
];

const report = buildCategoryPerformance(records, inventory, {
  from: new Date('2026-09-10T00:00:00.000Z'),
  to: new Date('2026-09-10T23:59:59.999Z'),
});
const beverages = report.categories.find((row) => row.category === 'Beverages');
assert.ok(beverages, 'Beverage category must be present.');
assert.equal(beverages.unitsSold, 3);
assert.equal(beverages.revenue, 6);
assert.equal(beverages.knownCost, 1.5);
assert.equal(beverages.grossProfit, 4.5);
assert.equal(beverages.marginPct, 75);
assert.equal(beverages.lowStockCount, 1);
assert.equal(report.lines.find((row) => row.title === 'Cola').stockCount, 2);
assert.equal(report.businessLines.find((row) => row.line === 'Consultations').revenue, 75);
assert.equal(report.businessLines.find((row) => row.line === 'Repairs').revenue, 100);

const partial = buildCategoryPerformance([{
  id: 200,
  kind: 'sale',
  items: [{ description: 'Mystery Drink', qty: 2, price: 4, category: 'Beverage' }],
  payments: [{ applied: 4, at: '2026-09-10T17:00:00.000Z' }],
}], [], { from: new Date('2026-09-10T00:00:00.000Z'), to: new Date('2026-09-10T23:59:59.999Z') });
assert.equal(partial.categories[0].revenue, 4, 'Partial payment recognizes only collected revenue.');
assert.equal(partial.categories[0].missingCostCount, 1, 'Missing product cost remains visible.');

const saleWindow = fs.readFileSync(path.join(root, 'src', 'sales', 'SaleWindow.tsx'), 'utf8');
assert.match(saleWindow, /inventoryProductId:\s*picked\.inventoryProductId/, 'New sale lines must retain their inventory link.');
const reporting = fs.readFileSync(path.join(root, 'src', 'components', 'ReportingWindow.tsx'), 'utf8');
const categoryView = fs.readFileSync(path.join(root, 'src', 'components', 'CategoryPerformanceView.tsx'), 'utf8');
assert.match(reporting, /Category Performance/);
assert.match(reporting, /dbGet\('products'\)/);
assert.match(categoryView, /Low stock/);

console.log('Category performance reporting checks passed.');
