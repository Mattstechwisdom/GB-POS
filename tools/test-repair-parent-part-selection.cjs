const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp', 'test-repair-parent-part-selection.cjs');
esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'lib', 'repairPartLinking.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
});

const { applyInventoryPartToRepair } = require(output);

const repair = { partCost: 129.99, internalCost: 42, inventoryProductId: 7 };
const parent = { id: 100, isParentPart: true, itemDescription: 'iPhone 7 Screen' };
const linkedFamily = applyInventoryPartToRepair(repair, parent);
assert.equal(linkedFamily.inventoryParentId, 100);
assert.equal(linkedFamily.inventoryProductId, undefined);
assert.equal(linkedFamily.partCost, 129.99, 'A parent family must not replace the configured repair price.');
assert.equal(linkedFamily.internalCost, 42, 'Variant cost is chosen later and must not replace the repair cost while linking a family.');

const variant = { id: 101, parentProductId: 100, price: 79.99, internalCost: 48, distributor: 'Parts Co', trackStock: true };
const linkedExact = applyInventoryPartToRepair(repair, variant);
assert.equal(linkedExact.inventoryParentId, undefined);
assert.equal(linkedExact.inventoryProductId, 101);
assert.equal(linkedExact.partCost, 79.99);

console.log('Repair parent-part selection checks passed.');
