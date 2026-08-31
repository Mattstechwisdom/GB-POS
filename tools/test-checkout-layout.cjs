const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'workorders', 'CheckoutWindow.tsx'), 'utf8');
for (const marker of ['gb-checkout-summary', 'gb-checkout-scope-card', 'gb-checkout-payment-tile', 'gb-checkout-option-card', 'gb-checkout-actions']) {
  assert.match(source, new RegExp(marker), `checkout layout must include ${marker}`);
}
for (const feature of ['Parts', 'Labor', 'Both', 'Cash', 'Card', 'Split Pay', 'Close window', 'Print receipt', 'Mark closed', 'Charge on Clover Device', 'Cancel']) {
  assert.ok(source.includes(feature), `checkout redesign must retain ${feature}`);
}
assert.match(source, /aria-pressed=/, 'selectable checkout tiles must expose selected state');
assert.match(source, /Complete Checkout/, 'primary action must clearly describe completion');
console.log('Checkout layout contract checks passed.');
