const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve('src/mobile/MobileApp.tsx'), 'utf8');
const quickbar = source.match(/<nav className="mobile-quickbar"[\s\S]*?<\/nav>/)?.[0] || '';
const drawer = source.match(/function MobileDrawer[\s\S]*?function DiagnosticToolsWindow/)?.[0] || '';

assert.match(quickbar, /openModal\('quickSale'\)[\s\S]*Quick (?:Sale|Checkout)/, 'Mobile quick bar must open the quick checkout workflow.');
assert.match(quickbar, /openModal\('addClient'\)[\s\S]*Add Client/, 'Mobile quick bar must open Add Client.');
assert.match(quickbar, /openModal\('customerSearch'\)[\s\S]*Search Client/, 'Mobile quick bar must open Search Client.');
assert.doesNotMatch(quickbar, /newWorkOrder|New WO|newSale|New Sale/, 'Mobile quick bar must not include New WO or New Sale.');
assert.doesNotMatch(drawer, /handleOpenModal\('quickSale'\)|handleOpenModal\('addClient'\)|handleOpenModal\('customerSearch'\)/, 'Moved quick actions must not be duplicated in the mobile drawer.');
assert.match(drawer, /className="mobile-drawer-layer is-open"/, 'An open mobile drawer must apply the interactive, visible is-open state.');

console.log('Mobile home shortcut checks passed.');
