const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260904033122_repair_tutorial_urls.sql'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'app', 'electron', 'electron-main.ts'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'src', 'mobile', 'mobile-api.ts'), 'utf8');

for (const column of ['tutorial_url', 'tutorial_media_type', 'tutorial_updated_at']) {
  assert.match(migration, new RegExp(`${column}\\s+`), `Migration must add ${column}.`);
  assert.match(desktop, new RegExp(`${column}:`), `Desktop writes must persist ${column}.`);
  assert.match(mobile, new RegExp(`${column}:`), `Mobile writes must persist ${column}.`);
}
assert.match(migration, /check\s*\(tutorial_media_type is null or tutorial_media_type in\s*\('youtube',\s*'direct-video',\s*'webpage'\)\)/i);
assert.match(migration, /check\s*\(tutorial_url is null or char_length\(tutorial_url\) <= 2048\)/i);
for (const source of [desktop, mobile]) {
  assert.match(source, /tutorialUrl:\s*row\.tutorial_url/);
  assert.match(source, /tutorialMediaType:\s*row\.tutorial_media_type/);
  assert.match(source, /tutorialUpdatedAt:\s*(?:cloudDate\()?row\.tutorial_updated_at\)?/);
}

console.log('Repair tutorial synchronization contract passed.');
