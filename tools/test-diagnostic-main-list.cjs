const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
const table = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'WorkOrdersTable.tsx'), 'utf8');
assert.match(app, /titles\.join\(', '\)\s*\|\|\s*\(w as any\)\.diagnosticSelection\?\.label/);
assert.match(table, /itemRepairs \|\| r\.diagnosticSelection\?\.label/);
console.log('Diagnostic main-list display checks passed.');
