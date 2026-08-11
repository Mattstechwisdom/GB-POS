const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const desktopMain = fs.readFileSync(path.join(root, 'app/electron/electron-main.ts'), 'utf8');
const desktopPreload = fs.readFileSync(path.join(root, 'app/electron/preload.ts'), 'utf8');
const desktopApp = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const mobileApi = fs.readFileSync(path.join(root, 'src/mobile/mobile-api.ts'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260810190000_enable_technician_realtime.sql'),
  'utf8',
);

for (const source of [desktopMain, mobileApi]) {
  assert.match(source, /technicians:\s*'staff_profiles'/, 'technicians must map to staff_profiles');
  assert.match(source, /technician_private_credentials/, 'technician passcodes must use the private credential table');
  assert.match(source, /key === 'technicians'/, 'technician rows need an explicit cloud conversion');
}

assert.match(desktopMain, /key === 'technicians'[^\n]*toCloudTextId/, 'desktop technician IDs must remain text IDs');
assert.match(desktopMain, /filter\(isAssignableDesktopTechnicianRow\)/, 'desktop must filter login-only profiles like mobile');
assert.match(desktopPreload, /cloudCollectionChanged/, 'preload must expose the Realtime refresh bridge');
assert.match(desktopApp, /table: 'staff_profiles'/, 'desktop must subscribe to technician profile changes');
assert.match(migration, /alter publication supabase_realtime add table public\.staff_profiles/, 'staff profiles must publish changes');
assert.doesNotMatch(migration, /add table public\.technician_private_credentials/, 'private passcodes must not be published through Realtime');

console.log('Technician desktop/mobile Supabase sync parity checks passed.');
