const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles', 'desktop-nav-preview.css'), 'utf8');
const workOrders = fs.readFileSync(path.join(root, 'src', 'components', 'WorkOrdersTable.tsx'), 'utf8');
const sales = fs.readFileSync(path.join(root, 'src', 'components', 'SalesTable.tsx'), 'utf8');

const mapBody = app.match(/const API_TO_MODAL:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1] || '';
const mappedTypes = [...mapBody.matchAll(/:\s*'([^']+)'/g)].map(match => match[1]);
const caseTypes = new Set([...app.matchAll(/case\s+'([^']+)'/g)].map(match => match[1]));
assert.ok(mappedTypes.length >= 20, 'The production window map unexpectedly lost routes.');
mappedTypes.forEach(type => assert.ok(caseTypes.has(type), `Mapped production window ${type} has no ModalContent route.`));

assert.match(app, /data-modal-type=\{entry\.type\}/, 'Each embedded window needs its production type hook.');
assert.match(app, /gb-window-profile-\$\{windowProfile\}/, 'Each embedded window needs a size profile.');
assert.match(css, /data-modal-type="calendar"/, 'Calendar needs dedicated embedded sizing.');
assert.match(css, /width:\s*calc\(100vw\s*-\s*24px\)/, 'Calendar must use the available viewport width.');
assert.match(css, /\.gb-calendar-month-grid/, 'Calendar month cells need scoped responsive rules.');
for (const source of [app, workOrders, sales]) {
  assert.match(source, /gb-responsive-record-list/, 'Every invoice/work-order list needs the responsive mobile card hook.');
  assert.match(source, /data-label=/, 'Responsive record cells need accessible mobile labels.');
}
assert.match(css, /\.gb-responsive-record-list/, 'Responsive record-list CSS is required.');
assert.match(css, /\.gb-window-profile-dense/, 'Dense production tools need a wide profile.');
assert.match(css, /\.gb-window-profile-compact/, 'Small production tools need a compact profile.');
assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?button/, 'Compact controls must have explicit mobile sizing.');

console.log(`Production window fidelity checks passed for ${mappedTypes.length} mapped routes.`);
