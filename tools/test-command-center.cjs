const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const component = read('src', 'components', 'CommandCenter.tsx');
const model = read('src', 'lib', 'commandCenter.ts');
const styles = read('src', 'styles', 'command-center.css');
const app = read('src', 'App.tsx');

assert.match(model, /buildCommandCenterModel/, 'Command Center must derive its data from persisted records.');
assert.match(model, /waiting.*part|awaiting.*part/i, 'The model must classify repairs waiting on parts.');
assert.match(model, /searchCommandCenterRecords/, 'Global search must use a grouped, non-destructive result model.');
assert.match(component, /Active work orders/i);
assert.match(component, /Awaiting parts/i);
assert.match(component, /Ready for pickup/i);
assert.match(component, /Collected today/i);
assert.match(component, /Today.{0,20}s Repair Queue/i);
assert.match(app, /All Invoices/i);
assert.match(component, /onOpenModal\('calendar'/, 'Calendar must retain its production route.');
assert.match(component, /showToday\(String\(label\)/, 'Today summary buttons must open their own at-a-glance panels.');
assert.match(component, /panel\.kind === 'today'/, 'Today panels must render compact persisted calendar details.');
assert.doesNotMatch(component, /<strong>Ready for Pickup<\/strong>[\s\S]{0,500}View All/, 'The duplicate lower Ready for Pickup section must not remain below the repair queue.');
assert.match(model, /consultationDateFor/, 'Consultations must be counted using their scheduled appointment date.');
assert.match(model, /!\/task\|delivery\|consult/, 'Consultations must not be counted again as generic calendar events.');
assert.match(app, /openModal\('notifications'\)/, 'Notifications must retain their production route through the toolbar bell.');
assert.match(component, /getWorkOrders|dbGet\('workOrders'/, 'The component must load real work orders.');
assert.doesNotMatch(component, /Marcus Hill|Jessica Stone|example\.com/, 'No preview customer data may ship.');
assert.match(styles, /@media\s*\(max-width:\s*1100px\)/, 'Tablet layout must adapt automatically.');
assert.match(styles, /@media\s*\(max-width:\s*720px\)/, 'Phone-width layout must remain usable.');
assert.match(styles, /command-center-section-toggle/, 'Small layouts must offer collapsible sections.');
assert.match(app, /<CommandCenter/, 'The production App must render Command Center.');
assert.doesNotMatch(app, /className="daily"[\s\S]{0,160}Daily Look/, 'Daily Look must not remain in the redesigned desktop drawer.');

console.log('Command Center production checks passed.');
