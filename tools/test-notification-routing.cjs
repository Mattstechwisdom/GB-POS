const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const notifications = read('src/lib/notifications.ts');
const activity = read('android/app/src/main/java/com/gadgetboy/pos/MainActivity.java');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const calendar = read('src/components/CalendarWindow.tsx');
const electronMain = read('app/electron/electron-main.ts');

const bridgeRequest = notifications.indexOf("typeof window.GBPosAndroid?.requestNotificationPermission === 'function'");
const pluginRequest = notifications.indexOf('native?.requestPermissions', bridgeRequest);
assert.ok(bridgeRequest >= 0 && pluginRequest > bridgeRequest, 'Android bridge must be attempted before the Capacitor fallback.');
assert.match(notifications, /notificationPermissionRequest.*performDeviceNotificationPermissionRequest/s);
assert.match(notifications, /localNotificationActionPerformed/);
assert.match(notifications, /openNotificationDestination/);
assert.match(notifications, /recordCreatedAtMs\(row, key\) <= baselineMs/);
assert.match(notifications, /enabledAt: permission === 'granted'/);
assert.match(activity, /ActivityCompat\.requestPermissions/);
assert.match(activity, /dispatchNotificationPermissionResult/);
assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
assert.match(calendar, /calendarEventId/);
assert.match(calendar, /setViewing\(target\)/);
assert.match(electronMain, /notifications:native-clicked/);

console.log('Notification permission and destination routing checks passed.');
