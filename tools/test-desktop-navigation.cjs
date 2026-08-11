const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
const toolbar = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.tsx'), 'utf8');

assert.match(app, /const desktopNavigationEnabled = true;/, 'Desktop navigation must be enabled without a preview query.');
assert.match(app, /desktopDrawerPreviewOpen.*desktopNavPreview/, 'The preview query may only control the initial open state.');
assert.match(app, /drawerMode=\{desktopNavigationEnabled\}/, 'The production toolbar must expose the menu button.');
assert.match(app, /onMouseEnter=\{\(\) => setDesktopDrawerOpen\(true\)\}/, 'The left edge must open the desktop drawer on hover.');
assert.match(app, /<DesktopNotificationDrawer/, 'The production desktop shell must include the notification drawer.');
assert.doesNotMatch(app, /desktop-drawer-primary[\s\S]*?Quick Checkout[\s\S]*?<\/div>/, 'Quick Checkout must not be duplicated in the desktop drawer.');
assert.match(toolbar, /desktop-preview-client-actions[\s\S]*?Search Client[\s\S]*?Add Client[\s\S]*?Quick Checkout/, 'Desktop client actions must place Search Client, Add Client, and Quick Checkout together above search.');

console.log('Desktop side navigation production checks passed.');
