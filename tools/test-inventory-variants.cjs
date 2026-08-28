const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'inventoryVariants.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);

const {
  eligibleInventoryVariants,
  inventoryAggregateStock,
  inventoryParentId,
  inventoryVariantAttributes,
  inventoryVariantsForParent,
  isInventoryParent,
} = moduleShim.exports;

const parent = { id: 100, itemDescription: 'iPhone 7 Screen', isParentPart: true, stockCount: 99 };
const black = { id: 101, parentProductId: 100, stockCount: 5, variantAttributes: { Color: 'Black', Quality: 'Premium' } };
const white = { id: 102, parentProductId: '100', stockCount: 2, variantAttributes: { Color: ' White ', Quality: 'Standard' } };
const unrelated = { id: 103, parentProductId: 999, stockCount: 8, variantAttributes: { Color: 'White' } };
const legacyStandalone = { id: 104, itemDescription: 'Legacy Part', stockCount: 3 };
const rows = [legacyStandalone, white, unrelated, parent, black];

assert.equal(isInventoryParent(parent), true);
assert.equal(isInventoryParent(legacyStandalone), false);
assert.equal(inventoryParentId(white), 100);
assert.deepEqual(inventoryVariantAttributes(white), { Color: 'White', Quality: 'Standard' });
assert.deepEqual(inventoryVariantsForParent(rows, 100).map((row) => row.id), [101, 102]);
assert.equal(inventoryAggregateStock(rows, 100), 7);
assert.deepEqual(eligibleInventoryVariants(rows, 100, { color: 'white' }).map((row) => row.id), [102]);
assert.deepEqual(eligibleInventoryVariants(rows, 100, { quality: 'PREMIUM' }).map((row) => row.id), [101]);

console.log('Inventory variant checks passed.');
