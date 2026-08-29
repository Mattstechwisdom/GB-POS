const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve('src/components/TechniciansWindow.tsx'), 'utf8');
assert.match(source, /skipInitialSave:\s*true/, 'Opening Edit Technician must not autosave unchanged data after two seconds.');
assert.match(source, /onAutosave=\{async \(patch\) => \{ await updateTechnician\(\{ id: editing\.id, \.\.\.patch \}\); await refresh\(\); \}\}/,
  'Background technician edits must save without closing the edit window.');
assert.match(source, /onSave=\{async \(patch\) => \{ await updateTechnician\(\{ id: editing\.id, \.\.\.patch \}\); setEditing\(null\); await refresh\(\); \}\}/,
  'Only explicit Save should close the edit window after persistence.');
console.log('Technician edit-window lifecycle checks passed.');
