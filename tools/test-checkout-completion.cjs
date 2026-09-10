const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const path = require('node:path');

const entry = path.join(__dirname, '..', 'src', 'lib', 'checkoutCompletion.ts');
const built = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false });
const Module = module.constructor;
const loaded = new Module();
loaded._compile(built.outputFiles[0].text, entry);
const { checkoutCompletionState } = loaded.exports;

assert.deepEqual(checkoutCompletionState({ amountDue: 100, amountPaid: 100, paymentType: 'Card' }), { allowed: true, reason: '' });
assert.deepEqual(checkoutCompletionState({ amountDue: 0, amountPaid: 0, paymentType: '', markClosed: true }), { allowed: true, reason: '' });
assert.match(checkoutCompletionState({ amountDue: 0, amountPaid: 0, paymentType: '', markClosed: false }).reason, /no balance remains/i);
assert.match(checkoutCompletionState({ amountDue: 100, amountPaid: 100, paymentType: '' }).reason, /payment method/i);
assert.match(checkoutCompletionState({ amountDue: 100, amountPaid: 0, paymentType: 'Card' }).reason, /amount/i);
assert.match(checkoutCompletionState({ amountDue: 100, amountPaid: 100, paymentType: 'Cash + Card', cashApplied: 0, cardRemainder: 100 }).reason, /cash amount/i);

console.log('Checkout completion-state checks passed.');
