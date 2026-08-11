const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');

assert.match(app, /const desktopNavigationEnabled = true;/, 'Desktop navigation must be enabled without a preview query.');
assert.match(app, /desktopDrawerPreviewOpen.*desktopNavPreview/, 'The preview query may only control the initial open state.');
assert.match(app, /drawerMode=\{desktopNavigationEnabled\}/, 'The production toolbar must expose the menu button.');
assert.match(app, /onMouseEnter=\{\(\) => setDesktopDrawerOpen\(true\)\}/, 'The left edge must open the desktop drawer on hover.');
assert.match(app, /<DesktopNotificationDrawer/, 'The production desktop shell must include the notification drawer.');

console.log('Desktop side navigation production checks passed.');
