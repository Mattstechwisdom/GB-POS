const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const fs = require('node:fs');
const build = esbuild.buildSync({ entryPoints: [path.join(root, 'src/lib/repairCompatibility.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const loaded = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(loaded, loaded.exports, require);
const { dedupeRepairCatalog, repairMatchesDevice, sortRepairsForDevice } = loaded.exports;

const ps5 = { title: 'HDMI Repair', category: 'Game Console', compatibleDevices: ['PlayStation 5', 'PlayStation 5 Slim'] };
const iphone = { title: 'Screen Repair', category: 'Phone', compatibleDevices: ['iPhone 7'] };
assert.equal(repairMatchesDevice(ps5, { deviceName: 'PlayStation 5 Slim' }), true);
assert.equal(repairMatchesDevice(ps5, { deviceName: 'iPhone 7' }), false);
assert.deepEqual(sortRepairsForDevice([iphone, ps5], { deviceName: 'PlayStation 5' }).map(row => row.title), ['HDMI Repair', 'Screen Repair']);
const hdmiOld = { id: 'old', title: 'HDMI', category: 'Game Console', model: '', repairCategory: 'Solder Labor', updatedAt: '2026-07-01T00:00:00Z' };
const hdmiCurrent = { id: 'new', title: ' hdmi ', category: 'game console', model: null, repairCategory: 'HDMI', updatedAt: '2026-08-01T00:00:00Z' };
const xboxHdmi = { id: 'xbox', title: 'HDMI', category: 'Game Console', model: 'Xbox Series X', repairCategory: 'HDMI', updatedAt: '2026-09-01T00:00:00Z' };
assert.deepEqual(
  dedupeRepairCatalog([hdmiOld, hdmiCurrent, xboxHdmi]).map(row => row.id),
  ['new', 'xbox'],
  'Same device service must appear once, while a model-specific service remains distinct.',
);
const form = fs.readFileSync(path.join(root, 'src/repairs/RepairItemForm.tsx'), 'utf8');
const desktopApi = fs.readFileSync(path.join(root, 'app/electron/electron-main.ts'), 'utf8');
const mobileApi = fs.readFileSync(path.join(root, 'src/mobile/mobile-api.ts'), 'utf8');
assert.match(form, /Compatible Devices/);
assert.match(form, /compatibleDevices/);
assert.doesNotMatch(form, />Reusable Service</);
for (const source of [desktopApi, mobileApi]) {
  assert.match(source, /compatibleDevices: Array\.isArray\(row\.compatible_devices\)/);
  assert.match(source, /compatible_devices: Array\.isArray\(item\.compatibleDevices\)/);
}
console.log('Repair compatibility ranking checks passed.');
