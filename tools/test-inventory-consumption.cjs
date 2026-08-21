const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'inventoryConsumption.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { consumeInStockInventory, reconcilePaidSaleInventory, saleHasCheckoutPayment } = moduleShim.exports;

async function main() {
  let products = [{ id: 7, itemDescription: 'Test Part', trackStock: true, stockCount: 5, inventoryConsumptionKeys: [] }];
  const api = {
    dbGet: async (key) => key === 'products' ? products.map((row) => ({ ...row })) : [],
    update: async (_key, value) => {
      products = products.map((row) => row.id === value.id ? { ...value } : row);
      return { ...value };
    },
  };
  const items = [{ id: 'line-1', inventoryProductId: 7, qty: 2, requiresOrder: false }];
  const first = await consumeInStockInventory(api, 'workOrder', 101, items);
  assert.equal(first.applied, 1);
  assert.equal(products[0].stockCount, 3);

  const retry = await consumeInStockInventory(api, 'workOrder', 101, items);
  assert.equal(retry.applied, 0);
  assert.equal(retry.skipped, 1);
  assert.equal(products[0].stockCount, 3, 'Retry must not consume the same work-order line twice.');

  await assert.rejects(
    () => consumeInStockInventory(api, 'sale', 202, [{ id: 'line-2', inventoryProductId: 7, qty: 4, requiresOrder: false }]),
    /has 3 in stock but checkout requires 4/,
  );
  assert.equal(products[0].stockCount, 3, 'Insufficient stock must not change inventory.');

  assert.equal(saleHasCheckoutPayment({ amountPaid: 0, payments: [] }), false);
  assert.equal(saleHasCheckoutPayment({ amountPaid: 0, payments: [{ applied: 2 }] }), true);

  let historyProducts = [{ id: 9, itemDescription: 'GadgetBoy Drink', trackStock: true, stockCount: 8, inventoryConsumptionKeys: [] }];
  const historySales = [
    { id: 301, amountPaid: 6.48, items: [{ id: 'drink-a', inventoryProductId: 9, qty: 2, requiresOrder: false }] },
    { id: 302, amountPaid: 0, items: [{ id: 'unpaid-drink', inventoryProductId: 9, qty: 3, requiresOrder: false }] },
    { id: 303, payments: [{ applied: 3.24 }], items: [{ id: 'drink-b', inventoryProductId: 9, qty: 1, requiresOrder: false }] },
  ];
  const historyApi = {
    dbGet: async (key) => key === 'products'
      ? historyProducts.map((row) => ({ ...row, inventoryConsumptionKeys: [...row.inventoryConsumptionKeys] }))
      : historySales.map((row) => ({ ...row })),
    update: async (_key, value) => {
      historyProducts = historyProducts.map((row) => row.id === value.id ? { ...value } : row);
      return { ...value };
    },
  };
  const historical = await reconcilePaidSaleInventory(historyApi);
  assert.equal(historical.applied, 2);
  assert.equal(historyProducts[0].stockCount, 5, 'Only paid historical sales should reduce stock.');

  const historicalRetry = await reconcilePaidSaleInventory(historyApi);
  assert.equal(historicalRetry.applied, 0);
  assert.equal(historyProducts[0].stockCount, 5, 'A historical rescan must be idempotent.');

  let shortStock = [{ id: 10, itemDescription: 'Low Stock Drink', trackStock: true, stockCount: 1, inventoryConsumptionKeys: [] }];
  const shortApi = {
    dbGet: async (key) => key === 'products' ? shortStock.map((row) => ({ ...row })) : [
      { id: 401, amountPaid: 10, items: [{ id: 'drink-c', inventoryProductId: 10, qty: 3, requiresOrder: false }] },
    ],
    update: async (_key, value) => {
      shortStock = [{ ...value }];
      return { ...value };
    },
  };
  const shortResult = await reconcilePaidSaleInventory(shortApi);
  assert.equal(shortStock[0].stockCount, 0, 'Historical overselling should reconcile to zero, never negative stock.');
  assert.equal(shortResult.shortfalls.length, 1);
  console.log('Inventory consumption checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
