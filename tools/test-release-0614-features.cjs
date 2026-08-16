const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const mobile = read('src/mobile/MobileApp.tsx');
const checkout = read('src/workorders/CheckoutWindow.tsx');
const workOrder = read('src/workorders/NewWorkOrderWindow.tsx');
const quickSale = read('src/components/QuickSaleWindow.tsx');
const mobileCss = read('src/mobile/mobile.css');

assert.match(checkout, /peekWindowPayload\('checkout'\)/, 'Mobile checkout must retain its payload through React development remounts.');
assert.match(mobile, /api\.openCheckout = \(payload\?: any\) => new Promise/, 'Mobile checkout must wait for a real payment result.');
assert.match(mobile, /gbpos:mobile-checkout-saved/, 'Mobile checkout save bridge is missing.');
assert.match(mobile, /gbpos:mobile-checkout-cancelled/, 'Mobile checkout cancel bridge is missing.');
assert.match(workOrder, /remainingWorkOrderPaymentBuckets/, 'Work-order checkout must calculate remaining parts and labor independently.');
assert.match(workOrder, /gb-wo-mobile-intake/, 'Mobile client information must be placed at the top.');
assert.match(workOrder, /gb-wo-parts-card gb-wo-expandable/, 'Parts tracking must be collapsible on mobile.');
assert.match(workOrder, /gb-wo-notes-expandable gb-wo-expandable/, 'Internal notes must be collapsible on mobile.');
assert.match(quickSale, /gb-quick-checkout-header/, 'Quick Checkout needs its scoped mobile header.');
assert.match(quickSale, /gb-quick-repair-results/, 'Quick repair catalog needs an independently scrollable result pane.');
assert.match(mobileCss, /\.gbpos-mobile \.gb-checkout-body[\s\S]*overflow-y: auto/, 'Mobile checkout must be vertically usable.');
assert.match(mobileCss, /\.gbpos-mobile \.gb-sale-catalog-editor[\s\S]*overflow-y: auto !important/, 'Mobile catalog editor must keep all fields accessible.');

console.log('v0.6.14 mobile checkout and responsive workflow checks passed.');
