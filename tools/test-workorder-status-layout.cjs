const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'workorders', 'NewWorkOrderWindow.tsx'), 'utf8');
const sidebarCall = source.slice(source.indexOf('<WorkOrderSidebar'), source.indexOf('/>', source.indexOf('<WorkOrderSidebar')) + 2);

assert.doesNotMatch(sidebarCall, /hideStatus/, 'Work-order status must remain visible in the left sidebar.');
assert.doesNotMatch(sidebarCall, /hideDates/, 'Repair-complete and checkout dates must remain visible in the left sidebar.');
assert.doesNotMatch(source, /WorkOrderDetailsMenu/, 'Status and dates must not remain hidden in the corner popover.');
console.log('Work-order status and date layout checks passed.');
