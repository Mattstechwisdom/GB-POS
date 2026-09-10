const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'lib', 'customerDuplicates.ts');
const output = path.join(root, 'tmp', 'test-customer-identity.cjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
esbuild.buildSync({ entryPoints: [source], outfile: output, bundle: true, platform: 'node', format: 'cjs' });

const {
  normalizeCustomerPhone,
  classifyCustomerMatch,
  chooseCanonicalCustomer,
  resolveTransactionCustomerLabel,
} = require(output);

assert.equal(normalizeCustomerPhone('(803) 555-1212')?.digits, '8035551212');
assert.equal(normalizeCustomerPhone('+1 803 555 1212')?.digits, '8035551212');
assert.equal(normalizeCustomerPhone('803-555-1212 ext 4')?.extension, '4');
assert.equal(classifyCustomerMatch(
  { firstName: 'Lynn', lastName: 'Hutto' },
  { firstName: 'lynn', lastName: 'hutto' },
).autoMergeSafe, false);
assert.equal(classifyCustomerMatch(
  { email: ' A@Example.com ' },
  { email: 'a@example.com' },
).strength, 'exact-contact');
assert.equal(classifyCustomerMatch(
  { phone: '8035551212', email: 'a@example.com' },
  { phone: '8035551212', email: 'different@example.com' },
).strength, 'conflict');
assert.equal(resolveTransactionCustomerLabel({ customerName: 'Saved Name', customerId: 42 }), 'Saved Name');
assert.equal(resolveTransactionCustomerLabel({ customerId: 42 }, { firstName: 'Lynn', lastName: 'Hutto' }), 'Lynn Hutto');

const canonical = chooseCanonicalCustomer([
  { id: 12, uuid: 'newer', phone: '8035551212', createdAt: '2026-01-02' },
  { id: 11, uuid: 'referenced', createdAt: '2026-01-01' },
], { referenced: 3, newer: 1 });
assert.equal(canonical.uuid, 'referenced');

console.log('Customer identity rules passed.');
