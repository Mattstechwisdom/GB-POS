const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const build = esbuild.buildSync({ entryPoints: [path.join(root, 'src/lib/inventoryNavigation.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const loaded = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(loaded, loaded.exports, require);
const { findExactDeviceMatch, inventoryRowActions, duplicateInventoryVariant } = loaded.exports;

assert.equal(findExactDeviceMatch(' iphone   7 ', ['iPhone 7', 'iPhone 7 Plus']), 'iPhone 7');
assert.equal(findExactDeviceMatch('screen', ['iPhone 7']), null);
assert.deepEqual(inventoryRowActions('parent', false), ['edit', 'add-variant', 'expand', 'delete']);
assert.deepEqual(inventoryRowActions('parent', true), ['edit', 'add-variant', 'collapse', 'delete']);
assert.deepEqual(inventoryRowActions('variant'), ['edit', 'duplicate', 'print-label', 'delete']);
assert.deepEqual(duplicateInventoryVariant({ id: 8, itemDescription: 'Screen', distributorSku: 'A-1', stockCount: 4, parentProductId: 2 }), { itemDescription: 'Screen', distributorSku: '', stockCount: 0, parentProductId: 2 });
console.log('Inventory navigation behavior checks passed.');
