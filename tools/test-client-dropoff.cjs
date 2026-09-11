const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'src', 'lib', 'clientDropoff.ts');
const built = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false });
const shim = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(shim, shim.exports, require);
const { buildDropoffCatalog, findDropoffCustomer, buildDropoffWorkOrder } = shim.exports;

const catalog = buildDropoffCatalog([
  { id: 1, title: 'Game Console', name: 'PlayStation 5' },
  { id: 2, title: 'Game Console', name: 'Xbox Series X' },
  { id: 3, title: 'Phone', name: 'iPhone' },
]);
assert.deepEqual(catalog.categories, ['Game Console', 'Phone', 'Other']);
assert.deepEqual(catalog.devicesByCategory['Game Console'], ['PlayStation 5', 'Xbox Series X', 'Other']);
assert.deepEqual(catalog.devicesByCategory.Phone, ['iPhone', 'Other']);

const customers = [
  { id: 4, firstName: 'Sam', lastName: 'Jones', phone: '(555) 222-1212', email: 'sam@example.com' },
];
assert.equal(findDropoffCustomer(customers, { phone: '555-222-1212' }).id, 4);
assert.equal(findDropoffCustomer(customers, { email: 'SAM@example.com' }).id, 4);

const order = buildDropoffWorkOrder({
  customerId: 4,
  customerName: 'Sam Jones',
  customerPhone: '555-222-1212',
  deviceCategory: 'Game Console',
  deviceName: 'PlayStation 5',
  problem: 'No power',
  password: '1234',
  now: '2026-09-11T12:00:00.000Z',
});
assert.equal(order.status, 'open');
assert.equal(order.workflowStage, 'Checked in');
assert.equal(order.productCategory, 'Game Console');
assert.equal(order.productDescription, 'PlayStation 5');
assert.equal(order.problemInfo, 'No power');
assert.deepEqual(order.items, []);
assert.equal(order.model, undefined);
assert.equal(order.serial, undefined);
assert.equal(order.totals.total, 0);

const component = fs.readFileSync(path.join(root, 'src', 'workorders', 'ClientDropoffWindow.tsx'), 'utf8');
assert.match(component, /Complete Form/);
assert.match(component, /Please hand (?:the )?device back to a technician/i);
assert.match(component, /onDoubleClick/);
assert.match(component, /setTimeout[\s\S]{0,200}returnToCommandCenter/);
assert.doesNotMatch(component, /Model|Serial Number|Add Repair|Checkout/);

console.log('Client Dropoff intake checks passed.');
