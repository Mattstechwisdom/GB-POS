const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260910190000_repair_workflow_events.sql');
assert.ok(fs.existsSync(migrationPath), 'Repair workflow migration is missing.');
const sql = fs.readFileSync(migrationPath, 'utf8');

for (const phrase of [
  'create table if not exists public.repair_workflow_events',
  'unique (shop_id, idempotency_key)',
  'enable row level security',
  'public.is_active_shop_staff(shop_id)',
  'create or replace function public.apply_repair_workflow_event',
  'p_idempotency_key text',
  'Unsupported repair workflow action',
  "when 'diagnosis' then 'Diagnosing'",
  "when 'part_ordered' then 'Parts'",
  "when 'repair_complete' then 'Pickup'",
  "when 'picked_up' then 'Completed'",
  'insert into public.repair_workflow_events',
]) assert.ok(sql.includes(phrase), `Migration is missing required behavior: ${phrase}`);

assert.match(sql, /select \* into v_existing[\s\S]*idempotency_key = p_idempotency_key/);
assert.match(sql, /update public\.work_orders[\s\S]*insert into public\.repair_workflow_events/);
console.log('Repair workflow schema contract checks passed.');
