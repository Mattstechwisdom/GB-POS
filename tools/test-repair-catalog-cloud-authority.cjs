const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'electron', 'electron-main.ts'), 'utf8');
const mergeStart = source.indexOf('function mergeCloudRowsIntoLocalCache');
const mergeEnd = source.indexOf('async function getCloudCount', mergeStart);
assert.ok(mergeStart >= 0 && mergeEnd > mergeStart, 'cloud merge implementation must exist');
const mergeSource = source.slice(mergeStart, mergeEnd);

assert.match(
  mergeSource,
  /const cloudAuthoritative = key === 'repairCategories'/,
  'Repair catalog must treat the cloud list as authoritative so deleted/orphaned local repairs do not reappear.',
);
assert.match(
  mergeSource,
  /if \(!cloudAuthoritative \|\| pendingUpserts\.has\(String\(id\)\)\) byId\.set\(String\(id\), item\)/,
  'Only pending offline repair edits may survive when absent from the cloud repair catalog.',
);

console.log('Repair catalog cloud-authority checks passed.');
