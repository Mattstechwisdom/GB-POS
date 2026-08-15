const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const build = esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'lib', 'purchaseBudget.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(moduleShim, moduleShim.exports, require);
const { checkedOutPurchaseSpend, purchaseBudgetSnapshot, selectedPurchaseCost } = moduleShim.exports;

const rows = [
  { key: 'a', distributor: 'Supplier A', totalCost: 10 },
  { key: 'b', distributor: 'Supplier A', totalCost: 20 },
  { key: 'c', distributor: 'Supplier B', totalCost: 40 },
];
assert.equal(selectedPurchaseCost({
  selectedRows: rows.slice(0, 2),
  allRows: rows,
  taxExemptByDistributor: { 'Supplier A': false },
  additionalCostsByDistributor: { 'Supplier A': 5 },
  salesTaxRate: 8,
}), 37.4, 'A full distributor selection should include tax and its additional checkout costs.');
assert.equal(selectedPurchaseCost({
  selectedRows: rows.slice(0, 1),
  allRows: rows,
  taxExemptByDistributor: { 'Supplier A': false },
  additionalCostsByDistributor: { 'Supplier A': 5 },
  salesTaxRate: 8,
}), 10.8, 'A partial distributor selection must not claim shared shipping or checkout costs.');

const start = new Date('2026-08-15T09:00:00.000Z');
const end = new Date('2026-08-16T08:59:59.999Z');
assert.equal(checkedOutPurchaseSpend([
  { status: 'checked_out', checkedOutAt: '2026-08-15T12:00:00.000Z', totalCost: 20 },
  { status: 'pending', checkedOutAt: '2026-08-15T13:00:00.000Z', totalCost: 90 },
  { status: 'checked_out', checkedOutAt: '2026-08-14T12:00:00.000Z', totalCost: 30 },
], start, end), 20, 'Only completed checkouts in the active accounting day should reduce the budget.');

assert.deepEqual(purchaseBudgetSnapshot(100, 20, 30), {
  dailyBudget: 100,
  completedSpend: 20,
  selectedSpend: 30,
  remaining: 80,
  available: 80,
  afterSelection: 50,
  overBy: 0,
  overBudget: false,
});
assert.equal(purchaseBudgetSnapshot(40, 20, 30).overBy, 10);

const eod = fs.readFileSync(path.join(root, 'src', 'components', 'EODWindow.tsx'), 'utf8');
const dailyLook = fs.readFileSync(path.join(root, 'src', 'components', 'DailyLookWindow.tsx'), 'utf8');
assert.match(eod, />Budget<\/button>/, 'The purchasing cart must expose the purple Budget action.');
assert.match(eod, /Cart guardrail only\. Reporting is unchanged\./, 'The UI must state that budget is separate from reporting.');
assert.match(eod, /dailyPurchaseBudgets/, 'Daily budgets must persist through shop settings.');
assert.doesNotMatch(eod, /partsCost\s*[+:=][^\n]*dailyBudget/, 'The budget must never be added to reported parts cost.');
assert.match(dailyLook, /aria-label={`Mark \$\{task\.title \|\| 'task'\} complete`}/, 'Task completion must remain a dedicated checkbox action.');
assert.match(dailyLook, /onClick=\{\(\) => openCalendarEntry\(task\)\}/, 'Clicking task content must open its details and notes.');
assert.match(dailyLook, /dispatchOpenModal\('eod', \{ showCart: true \}\)/, 'Unlinked order and delivery entries must open the purchasing cart.');

console.log('Daily purchasing budget and Daily Look navigation checks passed.');
