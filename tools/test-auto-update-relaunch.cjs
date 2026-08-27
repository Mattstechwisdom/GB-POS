const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const electronMain = fs.readFileSync(path.join(root, 'app/electron/electron-main.ts'), 'utf8');
const mobileUpdate = fs.readFileSync(path.join(root, 'src/mobile/MobileUpdateCheck.tsx'), 'utf8');

function assertIncludes(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

assertIncludes(electronMain, 'Auto Update and Relaunch', 'Desktop update popup is missing its automatic action.');
assertIncludes(electronMain, "'auto-download-install'", 'Desktop update popup does not dispatch the automatic action.');
assertIncludes(electronMain, 'autoInstallAfterDownload = true', 'Automatic install preference is not retained during download.');
assertIncludes(electronMain, 'if (autoInstallAfterDownload)', 'Downloaded updates are not automatically applied.');
assertIncludes(electronMain, 'await installDownloadedUpdate()', 'Automatic flow does not install and relaunch after download.');
assertIncludes(electronMain, 'Download Only', 'Desktop updater is missing the manual download fallback.');
assertIncludes(mobileUpdate, 'Download and install', 'Android updater action does not describe the native installer flow.');
assertIncludes(mobileUpdate, 'isNativeAndroidUpdateRuntime', 'Mobile updater does not distinguish the native Android app from the browser/PWA.');
assertIncludes(mobileUpdate, 'if (!isNativeAndroidUpdateRuntime()) return;', 'Browser/PWA sessions are not prevented from running Android update checks.');

console.log('Auto update and relaunch checks passed.');
