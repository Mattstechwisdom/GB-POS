const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const migration = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter(name => name.endsWith('.sql'))
  .map(name => fs.readFileSync(path.join(root, 'supabase', 'migrations', name), 'utf8'))
  .join('\n');
for (const pattern of [
  /add column if not exists event_type/i,
  /add column if not exists event_digest/i,
  /unique index[\s\S]*shop_id[\s\S]*record_type[\s\S]*legacy_record_id[\s\S]*event_type[\s\S]*event_digest/i,
  /queue_automatic_client_email/i,
  /from public\.staff_profiles[\s\S]*auth\.uid\(\)[\s\S]*status = 'active'/i,
  /on conflict[\s\S]*do nothing/i,
  /delivery_status[\s\S]*not_sent/i,
  /security definer/i,
  /set search_path/i,
  /revoke all on function[\s\S]*from public/i,
  /grant execute on function[\s\S]*to authenticated/i,
]) assert.match(migration, pattern);
assert.match(migration, /repair-completed/i, 'The outbox RPC must accept the repair completion event.');
assert.doesNotMatch(migration, /p_shop_id/i, 'The caller must not choose a shop id.');
console.log('Automatic email outbox migration contract passed.');
