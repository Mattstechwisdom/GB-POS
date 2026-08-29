const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'InventoryWindow.tsx'), 'utf8');
assert.match(source, /Create Parent Part/);
assert.match(source, /Add Variant/);
assert.match(source, /Duplicate Variant/);
assert.match(source, /Variant Attributes/);
assert.match(source, /inventoryAggregateStock/);
assert.match(source, /parentProductId/);
assert.match(source, /isParentPart/);
assert.match(source, /Parent parts organize variants and are never sold or deducted/);
assert.match(source, /Move to Parent/);
assert.match(source, /Remove or move its variants before deleting this parent part/);
assert.match(source, /expandedParentIds/);
assert.match(source, /aria-label={`\$\{expanded \? 'Collapse' : 'Expand'\} variants for/);
assert.match(source, /expandedParentIds\.has\(parentId\)/);
assert.doesNotMatch(source, /key=\{`\$\{name\}-\$\{index\}`\}/, 'Attribute row keys must not change while the name input is being typed.');
assert.match(source, /key=\{`variant-attribute-\$\{index\}`\}/, 'Attribute rows need a stable key so their inputs retain focus.');

console.log('Inventory parent UI checks passed.');
