const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const mobileCss = read('src/mobile/mobile.css');
const saleWindow = read('src/sales/SaleWindow.tsx');
const workOrder = read('src/workorders/NewWorkOrderWindow.tsx');
const products = read('src/components/ProductsWindow.tsx');
const saleItems = read('src/sales/SaleItemsTable.tsx');
const feedback = read('src/components/FeedbackWindow.tsx');
const app = read('src/App.tsx');
const mobileApp = read('src/mobile/MobileApp.tsx');
const customerSearch = read('src/components/CustomerSearchWindow.tsx');
const customerOverview = read('src/components/CustomerOverviewWindow.tsx');

assert.match(mobileCss, /gb-wo-payment-panel[\s\S]{0,80}display:\s*block\s*!important/, 'Mobile work-order payment panel must remain visible.');
assert.match(saleWindow, /className="gb-sale-window/);
assert.match(saleWindow, /className="gb-sale-layout/);
assert.match(saleWindow, /className="gb-sale-payment/);
assert.match(workOrder, /recordType="repair"/);
assert.match(workOrder, /onUpdateClient=\{\(\) => setClientUpdateOpen\(true\)\}/);

assert.match(products, /pickerSelections/);
assert.match(products, /payloads\.length === 1 \? payloads\[0\] : payloads/);
assert.match(saleItems, /Array\.isArray\(picked\) \? picked : \[picked\]/);
assert.match(saleItems, /onChange\(\[\.\.\.items, \.\.\.rows\]/);

assert.match(feedback, /event\.key !== 'Delete'/);
assert.match(customerSearch, /event\.target === event\.currentTarget\) onClose\(\)/);
assert.match(customerOverview, /event\.target === event\.currentTarget\) void handleClose\(\)/);
assert.match(app, /contentOwnsClose = entry\.type === 'customerSearch'/);
assert.match(mobileApp, /contentOwnsClose = entry\.type === 'customerSearch'/);

assert.match(workOrder, /customerName:\s*payload\?\.customerName/);
assert.match(workOrder, /findCustomers\?\.\(\{ id: customerId \}\)/);
assert.match(app, /type === 'workorders:changed' \|\| type === 'sales:changed' \|\| type === 'customers:changed'/);

console.log('v0.6.13 checkout, client, feedback, and refresh regression checks passed.');
