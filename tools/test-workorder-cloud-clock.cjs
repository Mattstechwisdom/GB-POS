const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const file of ['app/electron/electron-main.ts', 'src/mobile/mobile-api.ts']) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('function fromCloudRow(');
  const end = source.indexOf('\nfunction ', start + 1);
  const compiled = ts.transpile(source.slice(start, end), { module: ts.ModuleKind.CommonJS });
  const map = new Function('cloudDate', 'normalizeCloudId', 'cloudNullableNumber', 'cloudNumber', 'cloudObject', 'cloudArray', `${compiled}; return fromCloudRow;`)(v => v || undefined, row => Number(row.legacy_id), v => v == null ? null : Number(v), v => Number(v) || 0, v => v || {}, v => v || []);
  const record = map('workOrders', { legacy_id: 17, legacy_updated_at: '2026-09-01T12:00:00Z', updated_at: '2026-09-15T12:00:00Z', workflow_updated_at: '2026-09-15T12:00:00Z', workflow_stage: 'Testing', repair_status: 'Testing In Progress' });
  assert.equal(record.updatedAt, '2026-09-15T12:00:00Z', `${file}: QR changes must be newer than the desktop cache`);
  assert.equal(record.workflowUpdatedAt, '2026-09-15T12:00:00Z');
}
console.log('Work-order cloud clock checks passed.');
