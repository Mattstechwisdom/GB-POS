const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
const toolbar = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles', 'desktop-nav-preview.css'), 'utf8');
const notificationDrawer = fs.readFileSync(path.join(root, 'src', 'components', 'DesktopNotificationDrawer.tsx'), 'utf8');

assert.match(app, /const desktopNavigationEnabled = true;/, 'Desktop navigation must be enabled without a preview query.');
assert.match(app, /desktopDrawerPreviewOpen.*desktopNavPreview/, 'The preview query may only control the initial open state.');
assert.match(app, /drawerMode=\{desktopNavigationEnabled\}/, 'The production toolbar must expose the menu button.');
assert.match(app, /onMouseEnter=\{\(\) => showDesktopDrawer\(false\)\}/, 'The left edge must open the desktop drawer on hover.');
assert.match(app, /desktopDrawerClosing[\s\S]*?desktop-drawer-layer/, 'The desktop drawer must preserve its close animation state.');
assert.match(app, /<DesktopNotificationDrawer/, 'The production desktop shell must include the notification drawer.');
assert.match(app, /desktop-preview-tabs[\s\S]*?desktop-preview-filter-control[\s\S]*?>All Activity</, 'Desktop record controls must place Filters before the invoice-type buttons.');
assert.doesNotMatch(app, /desktop-drawer-primary[\s\S]*?Quick Checkout[\s\S]*?<\/div>/, 'Quick Checkout must not be duplicated in the desktop drawer.');
assert.match(toolbar, /desktop-preview-client-actions[\s\S]*?Search Client[\s\S]*?Add Client[\s\S]*?Quick Checkout/, 'Desktop client actions must place Search Client, Add Client, and Quick Checkout together above search.');
assert.match(styles, /\.desktop-drawer-primary\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,[\s\S]*?margin-inline:\s*auto;/, 'Generate Quote and Consultation must remain centered as a two-button drawer row.');
assert.match(notificationDrawer, /onMouseEnter=[\s\S]*?onOpen\(\)/, 'The right notification rail must open on hover.');
assert.match(notificationDrawer, /await markAllNotificationsRead\(\)/, 'Dismiss must mark notifications read instead of closing the drawer.');
assert.match(notificationDrawer, /className="settings"[\s\S]*?>Settings</, 'Notification Settings must remain beside Dismiss.');
assert.match(notificationDrawer, /notifications\.filter\(item => !item\.readAt\)/, 'The desktop drawer must hide dismissed notifications.');

console.log('Desktop side navigation production checks passed.');
