const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const build = esbuild.buildSync({ entryPoints: [path.join(root, 'src/lib/repairCompatibility.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const loaded = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(loaded, loaded.exports, require);
const { repairMatchesDevice, sortRepairsForDevice } = loaded.exports;

const ps5 = { title: 'HDMI Repair', category: 'Game Console', compatibleDevices: ['PlayStation 5', 'PlayStation 5 Slim'] };
const iphone = { title: 'Screen Repair', category: 'Phone', compatibleDevices: ['iPhone 7'] };
assert.equal(repairMatchesDevice(ps5, { deviceName: 'PlayStation 5 Slim' }), true);
assert.equal(repairMatchesDevice(ps5, { deviceName: 'iPhone 7' }), false);
assert.deepEqual(sortRepairsForDevice([iphone, ps5], { deviceName: 'PlayStation 5' }).map(row => row.title), ['HDMI Repair', 'Screen Repair']);
console.log('Repair compatibility ranking checks passed.');
