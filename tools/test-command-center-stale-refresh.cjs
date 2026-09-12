const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/components/CommandCenter.tsx'), 'utf8');

assert.match(source, /loadGenerationRef\.current \+= 1/,
  'Command Center refreshes must be assigned a monotonically increasing generation.');
assert.match(source, /if \(loadGeneration !== loadGenerationRef\.current\) return;/,
  'An older refresh must not overwrite newer Command Center state.');
assert.match(source, /closedWorkOrderIdsRef\.current\.has\(String\(record\.id\)\)/,
  'Locally closed work orders must remain suppressed while cloud synchronization catches up.');
assert.match(source, /resolvedResponseIdsRef\.current\.has\(String\(row\.id\)\)/,
  'Locally resolved replies must remain suppressed while cloud synchronization catches up.');
assert.match(source, /\.select\('id'\)\.maybeSingle\(\)/,
  'Resolving a reply must verify that Supabase actually updated the row.');

console.log('Command Center stale refresh checks passed.');
