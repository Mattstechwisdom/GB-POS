const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
for (const relativePath of ['app/electron/electron-main.ts', 'src/mobile/mobile-api.ts']) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const functionSource = source.match(/function normalizeCloudId\(row: any\): number \| string \| null \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource, `${relativePath} cloud record ID normalizer must exist.`);
  const normalizeCloudRecordId = new Function(`${functionSource.replace(/: any|: number \| string \| null/g, '')}; return normalizeCloudId;`)();

  assert.equal(
    normalizeCloudRecordId({ id: 'cloud-row-uuid', legacy_id: '557jhgms' }),
    '557jhgms',
    `${relativePath}: text repair legacy IDs must remain authoritative so an edit updates the same row.`,
  );
  assert.equal(normalizeCloudRecordId({ id: 'cloud-row-uuid', legacy_id: '42' }), 42);
  assert.equal(normalizeCloudRecordId({ id: 'cloud-row-uuid', legacy_id: null }), 'cloud-row-uuid');
}

console.log('Cloud record identity checks passed.');
