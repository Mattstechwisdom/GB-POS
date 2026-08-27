const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'ticketAccounting.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { discountedLineTotal, discountedWorkOrderItemAmounts, lineDiscountAmount, ticketLaborCharge } = moduleShim.exports;

assert.equal(lineDiscountAmount({ units: 2, unitPrice: 50, discountType: 'percent', discountValue: 10 }), 10);
assert.equal(lineDiscountAmount({ units: 1, unitPrice: 40, discountType: 'amount', discountValue: 50 }), 40);
assert.equal(discountedLineTotal({ units: 1, unitPrice: 40, discountType: 'amount', discountValue: 50 }), 0);
assert.equal(discountedLineTotal({ units: 3, unitPrice: 19.99, discountType: 'percent', discountValue: 15 }), 50.97);
assert.equal(lineDiscountAmount({ units: 1, unitPrice: 100, discountType: 'percent', discountValue: -5 }), 0);
assert.equal(lineDiscountAmount({ units: 1, unitPrice: 100, discountType: 'percent', discountValue: 120 }), 100);
assert.equal(ticketLaborCharge([{ labor: 100 }], { amount: 50 }), 100);
assert.equal(ticketLaborCharge([], { amount: 50 }), 50);
assert.equal(ticketLaborCharge([{ labor: 20 }, { labor: 15 }], null), 35);
assert.deepEqual(
  discountedWorkOrderItemAmounts({ parts: 40, labor: 60, quantity: 1, discountType: 'percent', discountValue: 10 }),
  { parts: 36, labor: 54, discount: 10, gross: 100, net: 90 },
);
assert.deepEqual(
  discountedWorkOrderItemAmounts({ parts: 20, labor: 30, quantity: 2, discountType: 'amount', discountValue: 25 }),
  { parts: 25.71, labor: 19.29, discount: 25, gross: 70, net: 45 },
);

console.log('Ticket line discount and diagnostic accounting checks passed.');
