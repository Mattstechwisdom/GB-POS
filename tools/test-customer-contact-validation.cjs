const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'lib', 'customerContactValidation.ts');
const formSource = fs.readFileSync(path.join(root, 'src', 'components', 'CustomerForm.tsx'), 'utf8');
const overviewSource = fs.readFileSync(path.join(root, 'src', 'components', 'CustomerOverviewWindow.tsx'), 'utf8');
const output = path.join(root, 'tmp', 'test-customer-contact-validation.cjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
esbuild.buildSync({ entryPoints: [source], outfile: output, bundle: true, platform: 'node', format: 'cjs' });
const { isCompleteCustomerEmail, isCompleteCustomerPhone, newCustomerContactErrors } = require(output);

assert.equal(isCompleteCustomerPhone('(803) 555-0199'), true);
assert.equal(isCompleteCustomerPhone('803-555-019'), false);
assert.equal(isCompleteCustomerEmail('client@example.com'), true);
assert.equal(isCompleteCustomerEmail('client@example'), false);
assert.deepEqual(newCustomerContactErrors({}, { declinedPhone: false, declinedEmail: false }).length, 2);
assert.deepEqual(newCustomerContactErrors({}, { declinedPhone: true, declinedEmail: true }), []);
assert.deepEqual(newCustomerContactErrors({ phone: '803-555-0199', email: 'client@example.com' }, { declinedPhone: false, declinedEmail: false }), []);
assert.equal(newCustomerContactErrors({ phone: '803-555-019', email: 'client@example.com' }, { declinedPhone: false, declinedEmail: false })[0].includes('10-digit'), true);
assert.match(formSource, /aria-label="Phone contact declined"/);
assert.match(formSource, /aria-label="Email contact declined"/);
assert.equal((formSource.match(/aria-label=".* contact declined"/g) || []).length, 2);
assert.equal((overviewSource.match(/if \(!payload\) return;/g) || []).length, 2);

console.log('New-client phone and email decision checks passed.');
