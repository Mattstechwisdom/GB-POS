const assert = require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node'}});
const { checkoutCompletionState } = require('../src/lib/checkoutCompletion.ts');

assert.deepEqual(checkoutCompletionState({ amountDue: 100, amountPaid: 100, paymentType: 'Card' }), { allowed: true, reason: '' });
assert.deepEqual(checkoutCompletionState({ amountDue: 0, amountPaid: 0, paymentType: '', markClosed: true }), { allowed: true, reason: '' });
assert.match(checkoutCompletionState({ amountDue: 0, amountPaid: 0, paymentType: '', markClosed: false }).reason, /no balance remains/i);
assert.match(checkoutCompletionState({ amountDue: 100, amountPaid: 100, paymentType: '' }).reason, /payment method/i);
assert.match(checkoutCompletionState({ amountDue: 100, amountPaid: 0, paymentType: 'Card' }).reason, /amount/i);
assert.match(checkoutCompletionState({ amountDue: 100, amountPaid: 100, paymentType: 'Cash + Card', cashApplied: 0, cardRemainder: 100 }).reason, /cash amount/i);

console.log('Checkout completion-state checks passed.');
