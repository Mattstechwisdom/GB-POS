const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'inventoryConsumption.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { resolveConsumedInventoryId, validateRequiredVariant } = moduleShim.exports;
const products = [{ id: 100, isParentPart: true }, { id: 101, parentProductId: 100, stockCount: 4 }, { id: 102, parentProductId: 100, stockCount: 2 }];
const parentLinkedLine = { inventoryParentId: 100 };
assert.equal(resolveConsumedInventoryId(parentLinkedLine, products), undefined);
assert.equal(resolveConsumedInventoryId({ ...parentLinkedLine, inventoryProductId: 102 }, products), 102);
assert.throws(() => validateRequiredVariant(parentLinkedLine, products), /choose the exact part used/i);
assert.doesNotThrow(() => validateRequiredVariant({ ...parentLinkedLine, inventoryProductId: 101 }, products));
assert.equal(resolveConsumedInventoryId({ inventoryProductId: 100 }, products), undefined, 'Organizational parents cannot be consumed.');

const itemsTable = fs.readFileSync(path.join(__dirname, '..', 'src', 'workorders', 'ItemsTable.tsx'), 'utf8');
assert.match(itemsTable, /InventoryVariantPicker/);
assert.match(itemsTable, /inventoryParentId/);
assert.match(itemsTable, /resolveInventoryVariantForRepair/);
assert.match(itemsTable, /resolution === 'automatic'/);
const salePickerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'saleProductPicker.ts'), 'utf8');
assert.match(salePickerSource, /product\?\.isParentPart/);
console.log('Checkout inventory variant checks passed.');
