const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const main = fs.readFileSync(path.join(root, 'app', 'electron', 'electron-main.ts'), 'utf8');
const rendererMain = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(builder, /requestedExecutionLevel:\s*asInvoker/);
assert.doesNotMatch(builder, /requestedExecutionLevel:\s*(?:highestAvailable|requireAdministrator)/);
assert.match(builder, /perMachine:\s*false/);
assert.match(builder, /allowElevation:\s*false/);
assert.match(builder, /packElevateHelper:\s*false/);
assert.match(builder, /allowToChangeInstallationDirectory:\s*false/);
assert.match(main, /autoUpdater\.quitAndInstall\(true,\s*true\)/);
assert.doesNotMatch(main, /autoUpdater\.quitAndInstall\(false/);
assert.equal(packageJson.devDependencies['electron-builder'], '24.13.1', 'Windows installer builds must avoid the NSIS 24.13.2+ uninstall regression.');
assert.match(main, /await prepareForUpdateInstall\(\)/, 'The updater must finish shutdown preparation before handing off to NSIS.');
assert.match(main, /await drainDbWrites\(\)/, 'Update shutdown must flush local database writes.');
assert.match(main, /drainCloudSyncQueue\(\)/, 'Update shutdown must attempt pending cloud synchronization.');
assert.match(main, /disposeCloverConnector\(\)/, 'Update shutdown must release the Clover connection.');
assert.match(main, /stopQrStatusServerForUpdate\(\)/, 'Update shutdown must release the QR status server port.');
const standaloneRoutes = rendererMain.match(/const STANDALONE_WINDOW_QUERY_KEYS = \[[\s\S]*?\];/)?.[0] || '';
assert.doesNotMatch(standaloneRoutes, /'checkout'/, 'Desktop checkout must rely on its native title bar instead of an overlapping in-window close button.');
assert.match(standaloneRoutes, /'newWorkOrder'/, 'Other standalone daughter windows should retain their in-window close control.');

console.log('Windows silent update and non-elevated installer checks passed.');
