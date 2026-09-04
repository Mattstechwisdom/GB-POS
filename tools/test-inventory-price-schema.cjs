const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260904035102_inventory_price_review.sql'), 'utf8');
for (const table of ['inventory_price_rules', 'inventory_price_exceptions', 'inventory_price_check_runs', 'inventory_price_check_results', 'inventory_cost_change_audits']) {
  assert.match(sql, new RegExp(`create table public\\.${table}`, 'i'));
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
}
assert.match(sql, /approve_inventory_cost_change/i);
assert.match(sql, /for update/i);
assert.match(sql, /update public\.products[\s\S]*internal_cost/i);
assert.match(sql, /insert into public\.inventory_cost_change_audits/i);
assert.match(sql, /auth\.uid\(\)/i);
assert.match(sql, /grant execute[\s\S]*authenticated/i);
assert.doesNotMatch(sql, /update public\.products[\s\S]*\bprice\s*=/i);
console.log('Inventory price review schema contract passed.');
