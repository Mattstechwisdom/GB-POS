const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'src', 'workorders', 'CustomBuildItemsTable.tsx');
const built = esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react'],
  tsconfig: path.join(root, 'tsconfig.json'),
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { customBuildResultToRow, customBuildRowToPayload } = moduleShim.exports;

assert.equal(typeof customBuildResultToRow, 'function', 'Custom Build must map editor results into persistent work-order rows.');
assert.equal(typeof customBuildRowToPayload, 'function', 'Custom Build must reopen every saved ordering field for editing.');

const result = {
  description: 'RTX 5070 Ti',
  itemType: 'part',
  quantity: 2,
  price: 899.99,
  internalCost: 730,
  partSource: 'Distributor A',
  distributorSku: 'GPU-5070TI',
  orderSourceUrl: 'https://supplier.example/gpu',
  orderStatus: 'ordered',
  orderDate: '2026-09-08',
  estimatedDeliveryDate: '2026-09-12',
  trackingUrl: 'https://carrier.example/track/123',
};

const row = customBuildResultToRow(result, 'row-1');
assert.deepEqual(row, {
  id: 'row-1',
  device: 'Custom PC Build',
  repair: 'RTX 5070 Ti',
  parts: 899.99,
  labor: 0,
  quantity: 2,
  unitPrice: 899.99,
  internalCost: 730,
  partSource: 'Distributor A',
  distributorSku: 'GPU-5070TI',
  orderSourceUrl: 'https://supplier.example/gpu',
  requiresOrder: true,
  orderStatus: 'ordered',
  orderDate: '2026-09-08',
  estimatedDeliveryDate: '2026-09-12',
  trackingUrl: 'https://carrier.example/track/123',
  status: 'pending',
});
assert.deepEqual(customBuildRowToPayload(row), result, 'Editing must preserve the complete ordering record.');

const labor = customBuildResultToRow({ description: 'Assembly', itemType: 'labor', quantity: 1, price: 150 }, 'row-2');
assert.equal(labor.parts, 0);
assert.equal(labor.labor, 150);
assert.equal(labor.requiresOrder, false);

const editorSource = fs.readFileSync(path.join(root, 'src', 'workorders', 'CustomBuildItemWindow.tsx'), 'utf8');
assert.ok(editorSource.includes('overflow-y-auto'), 'The expanded Custom Build editor must remain scrollable on desktop and mobile.');
for (const label of ['Quantity', 'Customer price', 'Internal cost', 'Supplier / distributor', 'Order URL', 'Order status', 'Ordered date', 'Estimated delivery', 'Tracking URL']) {
  assert.ok(editorSource.includes(label), `Custom Build editor must show ${label}.`);
}

console.log('Custom Build ordering metadata checks passed.');
