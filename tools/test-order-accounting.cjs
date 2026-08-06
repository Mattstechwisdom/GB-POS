const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const build = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'orderAccounting.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { applyPurchaseQueueRemovalToItems, calculateSalesTax, collectOrderCartRows, groupOrderCartRows } = moduleShim.exports;

assert.equal(calculateSalesTax(100, false, 8), 8, 'Non-exempt supplier purchases should add 8% South Carolina sales tax.');
assert.equal(calculateSalesTax(100, true, 8), 0, 'Tax-exempt supplier purchases must not add sales tax.');

const workOrders = [{
  id: 101,
  customerName: 'Test Client',
  checkInAt: '2025-01-01T12:00:00.000Z',
  amountPaid: 145,
  payments: [{ applied: 145, appliedParts: 120, appliedLabor: 25 }],
  items: [{
    id: 'part-1',
    repair: 'PS5 Power Supply',
    parts: 120,
    labor: 75,
    internalCost: 100,
    distributor: 'Phone LCD Parts',
    orderSourceUrl: 'https://www.phonelcdparts.com/parts/ps5-power-supply',
    requiresOrder: true,
    orderStatus: 'needed',
  }, {
    id: 'removed-part',
    repair: 'Removed Purchasing Task',
    parts: 50,
    internalCost: 25,
    distributor: 'Other Source',
    requiresOrder: true,
    orderStatus: 'needed',
    purchaseQueueRemovedAt: '2026-08-05T12:00:00.000Z',
  }],
}, {
  id: 102,
  customerName: 'Missing Cost',
  amountPaid: 0,
  items: [{
    id: 'part-2',
    repair: 'Custom Screen',
    parts: 80,
    distributor: 'Other Source',
    requiresOrder: true,
    orderStatus: 'needed',
  }, {
    id: 'removed-product',
    description: 'Removed Sale Purchase',
    qty: 1,
    price: 30,
    internalCost: 15,
    distributor: 'Amazon',
    inStock: false,
    requiresOrder: true,
    purchaseQueueRemovedAt: '2026-08-05T12:00:00.000Z',
  }],
}];

const sales = [{
  id: 201,
  customerName: 'Paid Sale',
  amountPaid: 154,
  totals: { total: 154, remaining: 0 },
  items: [{
    id: 'product-1',
    description: 'USB-C Dock',
    qty: 2,
    price: 70,
    internalCost: 50,
    distributor: 'Amazon',
    productUrl: 'https://www.amazon.com/dp/example',
    inStock: false,
    requiresOrder: true,
    orderStatus: 'needed',
  }],
}, {
  id: 202,
  customerName: 'Partial Sale',
  amountPaid: 20,
  totals: { total: 100, remaining: 80 },
  items: [{
    id: 'product-2',
    description: 'Controller',
    qty: 1,
    price: 100,
    internalCost: 60,
    distributor: 'Other Source',
    productUrl: 'https://vendor.example/controller',
    inStock: false,
    requiresOrder: true,
  }],
}];

const purchaseOrders = [{
  id: 301,
  status: 'pending',
  sourceType: 'inventory',
  inventoryId: 88,
  itemType: 'Part',
  title: 'PS5 Power Supply',
  distributor: 'Phone LCD Parts',
  orderUrl: 'https://www.phonelcdparts.com/parts/ps5-power-supply',
  quantity: 3,
  unitCost: 40,
  sourceItemIndex: 2,
}, {
  id: 302,
  status: 'checked_out',
  sourceType: 'manual',
  title: 'Already purchased',
  distributor: 'Other Source',
  quantity: 1,
  unitCost: 20,
}];

const rows = collectOrderCartRows(workOrders, sales, purchaseOrders);
assert.equal(rows.length, 5, 'Outstanding source lines and pending purchase records should enter the cart.');
assert.equal(rows.some(row => row.itemId === 'removed-part' || row.itemId === 'removed-product'), false, 'Deleted cart tasks must remain suppressed without deleting their source items.');

const workOrder = rows.find(row => row.key === 'workOrder:101:part-1');
assert.equal(workOrder.totalCost, 100);
assert.equal(workOrder.totalCharge, 120);
assert.equal(workOrder.knownProfit, 20);
assert.equal(workOrder.paymentStatus, 'paid');

const taxedWorkOrder = collectOrderCartRows([{
  ...workOrders[0],
  id: 103,
  taxRate: 8,
  payments: [{ applied: 154.6, appliedParts: 129.6, appliedLabor: 25 }],
  items: [workOrders[0].items[0]],
}], [], [])[0];
assert.equal(taxedWorkOrder.baseTotalCharge, 120);
assert.equal(taxedWorkOrder.clientTax, 9.6);
assert.equal(taxedWorkOrder.totalCharge, 129.6, 'Cart Charged must include the saved client tax rate.');
assert.equal(taxedWorkOrder.knownProfit, 20, 'Client tax collected must not be treated as shop margin.');
assert.equal(taxedWorkOrder.paymentStatus, 'paid');

const removedWorkOrder = applyPurchaseQueueRemovalToItems(workOrders[0].items, workOrder, '2026-08-05T15:00:00.000Z');
assert.equal(removedWorkOrder.matched, true);
assert.equal(removedWorkOrder.items.length, workOrders[0].items.length, 'Removing a cart task must retain every work-order line.');
assert.equal(removedWorkOrder.items[0].purchaseQueueRemovedAt, '2026-08-05T15:00:00.000Z');
assert.equal(removedWorkOrder.items[0].orderStatus, 'needed');
assert.equal(removedWorkOrder.items[0].trackingNumber, '');
assert.match(removedWorkOrder.items[0].purchaseQueueRemovalNotice, /Payment was recorded/);
assert.equal(collectOrderCartRows([{ ...workOrders[0], items: removedWorkOrder.items }], [], []).some(row => row.key === workOrder.key), false, 'A removed task must stay out of the EOD cart while its work-order item remains saved.');

const missingCost = rows.find(row => row.key === 'workOrder:102:part-2');
assert.equal(missingCost.hasCost, false);
assert.equal(missingCost.knownProfit, null);
assert.equal(missingCost.paymentStatus, 'unpaid');

const paidSale = rows.find(row => row.key === 'sale:201:product-1');
assert.equal(paidSale.totalCost, 100, 'Full unit cost must be multiplied by quantity.');
assert.equal(paidSale.totalCharge, 140);
assert.equal(paidSale.paymentStatus, 'paid');

const partialSale = rows.find(row => row.key === 'sale:202:product-2');
assert.equal(partialSale.paymentStatus, 'unverified', 'Partial sale payments must not be guessed at the product level.');

const restock = rows.find(row => row.key === 'purchaseOrder:301');
assert.equal(restock.sourceType, 'inventory');
assert.equal(restock.totalCost, 120);
assert.equal(restock.paymentStatus, 'not_required');
assert.equal(restock.itemIndex, 2, 'Pending purchase records must retain their source line index for safe removal updates.');
assert.equal(rows.some(row => row.key === 'purchaseOrder:302'), false, 'Verified purchases must not re-enter the pending cart.');

const groups = groupOrderCartRows(rows);
const phoneLcd = groups.find(group => group.distributor === 'Phone LCD Parts');
assert.equal(phoneLcd.checkoutLabel, 'Open cart');
assert.equal(phoneLcd.checkoutUrl, 'https://www.phonelcdparts.com/checkout/cart');
assert.equal(phoneLcd.paymentWarnings, 0, 'Inventory restocks do not require client-payment evidence.');
const amazon = groups.find(group => group.distributor === 'Amazon');
assert.equal(amazon.checkoutUrl, 'https://www.amazon.com/gp/cart/view.html');

const other = groups.find(group => group.distributor === 'Other Source');
assert.equal(other.paymentWarnings, 2);
assert.equal(other.missingCost, 1);

console.log('Order accounting and EOD cart checks passed.');
