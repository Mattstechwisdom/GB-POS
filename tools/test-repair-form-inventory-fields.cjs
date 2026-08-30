const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'repairs', 'RepairItemForm.tsx'), 'utf8');
assert.doesNotMatch(source, /Track part stock/);
assert.doesNotMatch(source, /Low stock alert at/);
assert.doesNotMatch(source, /Stock count/);
assert.match(source, /Select Inventory Part or Family/);
assert.match(source, /Part Charged/);
assert.match(source, /Inventory Cost/);
console.log('Repair form inventory-field checks passed.');
