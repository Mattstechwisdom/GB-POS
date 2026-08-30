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

const { applyInventoryPartToRepair, resolveWorkOrderRepairPricing } = require(output);

const repair = { partCost: 129.99, internalCost: 42, inventoryProductId: 7 };
const parent = { id: 100, isParentPart: true, itemDescription: 'iPhone 7 Screen' };
const linkedFamily = applyInventoryPartToRepair(repair, parent);
assert.equal(linkedFamily.inventoryParentId, 100);
assert.equal(linkedFamily.inventoryProductId, undefined);
assert.equal(linkedFamily.partCost, 129.99, 'A parent family must not replace the configured repair price.');
assert.equal(linkedFamily.internalCost, undefined, 'A parent family must clear stale exact-part cost because the chosen variant supplies it later.');

const variant = { id: 101, parentProductId: 100, price: 79.99, internalCost: 48, distributor: 'Parts Co', trackStock: true };
const linkedExact = applyInventoryPartToRepair(repair, variant);
assert.equal(linkedExact.inventoryParentId, undefined);
assert.equal(linkedExact.inventoryProductId, 101);
assert.equal(linkedExact.partCost, 79.99);

assert.deepEqual(
  resolveWorkOrderRepairPricing({ inventoryParentId: 100, partCost: 129.99, internalCost: 40, markupPct: 10 }, { price: 149.99, internalCost: 62, markupPct: 25 }),
  { parts: 149.99, internalCost: 62, markupPct: 25 },
  'A chosen parent-family variant must supply its own charged price and inventory cost.',
);
assert.deepEqual(
  resolveWorkOrderRepairPricing({ inventoryProductId: 101, partCost: 129.99, internalCost: 40, markupPct: 10 }, { price: 149.99, internalCost: 62, markupPct: 25 }),
  { parts: 129.99, internalCost: 40, markupPct: 10 },
  'An exact-part repair keeps its saved catalog pricing.',
);

console.log('Repair parent-part selection checks passed.');
