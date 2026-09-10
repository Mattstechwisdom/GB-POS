const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp', 'test-inventory-price-review.cjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
esbuild.buildSync({ absWorkingDir: root, entryPoints: ['./src/lib/inventoryPriceReview.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs' });
const { rankPriceCandidates, classifyPriceResult } = require(output);
const candidates = [
  { value: 99, currency: 'USD', sourceKind: 'list', selectorFingerprint: '.list-price', confidence: .6, evidence: 'List price' },
  { value: 69, currency: 'USD', sourceKind: 'current', selectorFingerprint: '.sale-price', confidence: .9, evidence: 'Sale price' },
  { value: 59, currency: 'USD', sourceKind: 'member', selectorFingerprint: '.member-price', confidence: .4, evidence: 'Member price' },
];
assert.equal(rankPriceCandidates(candidates)[0].value, 69);
assert.equal(rankPriceCandidates(candidates, { selectorFingerprint: '.list-price' })[0].value, 99);
assert.equal(rankPriceCandidates(candidates, { selectorFingerprint: '.list-price' }, { selectorFingerprint: '.sale-price' })[0].value, 69);
assert.equal(classifyPriceResult(60, rankPriceCandidates(candidates)), 'changed');
assert.equal(classifyPriceResult(69, rankPriceCandidates(candidates)), 'unchanged');
assert.equal(classifyPriceResult(10, rankPriceCandidates(candidates)), 'needs-review');
assert.equal(classifyPriceResult(10, [], { loginRequired: true }), 'login-required');
assert.equal(classifyPriceResult(10, []), 'failed');
console.log('Inventory price candidate ranking passed.');
