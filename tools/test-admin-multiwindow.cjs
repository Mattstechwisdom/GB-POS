const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const build = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/lib/adminWindowNavigation.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const loaded = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(loaded, loaded.exports, require);

const { openAdminTool } = loaded.exports;

(async () => {
  const opened = [];
  const fallback = [];
  await openAdminTool('vendors', { openVendors: async () => opened.push('vendors') }, key => fallback.push(key));
  await openAdminTool('technicians', { openTechnicians: async () => opened.push('technicians') }, key => fallback.push(key));
  assert.deepEqual(opened, ['vendors', 'technicians']);
  assert.deepEqual(fallback, []);

  await openAdminTool('inventory', {}, key => fallback.push(key));
  assert.deepEqual(fallback, ['inventory'], 'web/mobile must retain the in-app route');

  await openAdminTool('inventory', { openInventory: async () => opened.push('inventory') }, key => fallback.push(key));
  await openAdminTool('inventory', { openInventory: async () => opened.push('inventory') }, key => fallback.push(key));
  assert.deepEqual(opened.slice(-2), ['inventory', 'inventory'], 'each desktop click must invoke a new-window request');
  console.log('Admin window routing checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
