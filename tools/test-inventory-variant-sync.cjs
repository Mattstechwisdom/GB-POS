const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mobile = fs.readFileSync(path.join(root, 'src', 'mobile', 'mobile-api.ts'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'app', 'electron', 'electron-main.ts'), 'utf8');
const migrationName = fs.readdirSync(path.join(root, 'supabase', 'migrations')).find((name) => name.endsWith('_add_inventory_variants_and_repair_families.sql'));
assert.ok(migrationName, 'Supabase inventory hierarchy migration must exist.');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', migrationName), 'utf8');

for (const source of [mobile, desktop]) {
  assert.match(source, /isParentPart:\s*!!row\.is_parent_part/);
  assert.match(source, /parentProductId:\s*cloudNumber\(row\.parent_product_legacy_id\)/);
  assert.match(source, /variantAttributes:\s*cloudObject\(row\.variant_attributes\)/);
  assert.match(source, /is_parent_part:\s*toCloudBool\(item\.isParentPart\)/);
  assert.match(source, /parent_product_legacy_id:\s*toCloudIntId\(item\.parentProductId\)/);
  assert.match(source, /variant_attributes:\s*toCloudPayload\(item\.variantAttributes\s*\|\|\s*\{\}\)/);
  assert.match(source, /repairFamily:\s*row\.repair_family/);
  assert.match(source, /serviceKey:\s*row\.service_key/);
  assert.match(source, /inventoryParentId:\s*cloudNumber\(row\.inventory_parent_legacy_id\)/);
  assert.match(source, /repair_family:\s*toCloudString\(item\.repairFamily\)/);
  assert.match(source, /service_key:\s*toCloudString\(item\.serviceKey\)/);
  assert.match(source, /inventory_parent_legacy_id:\s*toCloudIntId\(item\.inventoryParentId\)/);
}

for (const field of ['is_parent_part', 'parent_product_legacy_id', 'variant_attributes', 'repair_family', 'service_key', 'inventory_parent_legacy_id']) {
  assert.match(mobile, new RegExp(`delete fallbackRow\\.${field}`), `Mobile schema-cache fallback must omit ${field}.`);
}

assert.match(migration, /is_parent_part boolean not null default false/);
assert.match(migration, /parent_product_legacy_id bigint/);
assert.match(migration, /variant_attributes jsonb not null default '\{\}'::jsonb/);
assert.match(migration, /repair_family text/);
assert.match(migration, /service_key text/);
assert.match(migration, /inventory_parent_legacy_id bigint/);
assert.match(migration, /jsonb_typeof\(variant_attributes\) = 'object'/);

console.log('Inventory variant synchronization checks passed.');
