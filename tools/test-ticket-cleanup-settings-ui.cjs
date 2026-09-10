const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'src','components','CatalogSettingsWindow.tsx'),'utf8');
for(const phrase of ['Diagnostic-only tickets','Close every open ticket','Not-repairable attention','Run Cleanup Now','Preview']) assert.match(ui,new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(ui,/Ticket Cleanup &(?:amp;\s|\s)Attention/);
assert.match(ui,/ticketCleanupSettings/); assert.match(ui,/previewWorkOrderCleanup/); assert.match(ui,/reconcileLegacyWorkOrders/);
console.log('Ticket cleanup settings UI checks passed.');
