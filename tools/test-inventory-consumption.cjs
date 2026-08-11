const assert = require('node:assert/strict');
const fs = require('node:fs');
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
const { consumeInStockInventory } = moduleShim.exports;

async function main() {
  let products = [{ id: 7, itemDescription: 'Test Part', trackStock: true, stockCount: 5, inventoryConsumptionKeys: [] }];
  const api = {
    dbGet: async () => products.map((row) => ({ ...row })),
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

  const quickSaleSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'QuickSaleWindow.tsx'), 'utf8');
  assert.match(quickSaleSource, /consumeInStockInventory\(api,\s*'sale',\s*Number\(created\.id\),\s*normalizedItems\)/, 'Quick Checkout must consume linked inventory after saving the sale.');
  console.log('Inventory consumption checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
