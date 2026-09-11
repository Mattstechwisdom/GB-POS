const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'EODWindow.tsx'), 'utf8');
const globalStyles = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'index.css'), 'utf8');

assert.match(source, /dbGet\('calendarEvents'\)/, 'EOD must load the shared calendar events collection.');
assert.match(source, /onCalendarEventsChanged/, 'EOD must stay synchronized when calendar tasks change elsewhere.');
assert.match(source, /Technician Task Checklist/, 'EOD must render the daily technician checklist.');
assert.match(source, /taskCompletionPatch/, 'Checklist completion must use the same persistence logic as Calendar.');
assert.match(source, /dbUpdate\('calendarEvents'/, 'Checklist changes must persist to the shared calendar record.');
assert.match(source, /lg:overflow-hidden/, 'Desktop EOD must keep page-level overflow contained.');
assert.match(globalStyles, /scrollbar-color/, 'Firefox-compatible scrollbars must use the POS theme.');
assert.match(globalStyles, /::-webkit-scrollbar-thumb/, 'Chromium/Electron scrollbars must use the POS theme.');

console.log('EOD technician checklist checks passed.');
