const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const calendar = fs.readFileSync(path.join(root, 'src', 'components', 'CalendarWindow.tsx'), 'utf8');

assert.match(calendar, /key\.slice\(5\) === '09-11'/, 'September 11 must be identified independently of year.');
assert.match(calendar, /gb-calendar-september-11-art/, 'The September 11 month cell must render its dedicated artwork layer.');
assert.match(calendar, /publicAsset\('calendar\/911-memorial\.png'\)/, 'The calendar must reference the packaged memorial artwork through the deployment-safe asset helper.');
assert.match(calendar, /pointer-events-none[\s\S]*object-cover[\s\S]*opacity-30/, 'Artwork must be clipped, non-interactive, and slightly transparent.');
assert.ok(fs.existsSync(path.join(root, 'public', 'calendar', '911-memorial.png')), 'The memorial artwork must be packaged with the app.');

console.log('September 11 calendar artwork checks passed.');
