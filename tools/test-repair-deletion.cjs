const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const result = esbuild.buildSync({ entryPoints: [path.join(root, 'src/lib/repairDeletion.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
const { deleteRepair, deleteRepairType, canDeleteRepairType, repairContextMenuZIndex } = mod.exports;
(async () => {
  const calls = [];
  assert.deepEqual(await deleteRepair({ dbDelete: async (key, id) => { calls.push([key, id]); return true; } }, 'r1'), { ok: true });
  assert.deepEqual(calls, [['repairCategories', 'r1']]);
  assert.equal((await deleteRepair({ dbDelete: async () => false }, 'r2')).ok, false);
  const cascade = [];
  const summary = await deleteRepairType({ dbDelete: async (key, id) => { cascade.push([key, id]); return true; } }, { definedId: 8 }, [{ id: 'a' }, { id: 'b' }], 'type-and-repairs');
  assert.equal(summary.ok, true);
  assert.deepEqual(cascade, [['repairCategories', 'a'], ['repairCategories', 'b'], ['repairTypes', 8]]);
  const recovered = await deleteRepairType({ dbDelete: async () => true }, {}, [{ id: 'a' }], 'type-only');
  assert.equal(recovered.ok, false, 'a recovered type cannot pretend to be deleted while repairs remain');
  assert.equal(canDeleteRepairType({ definedId: 8 }), true, 'Saved repair types must be deletable.');
  assert.equal(canDeleteRepairType({}), true, 'Recovered repair types must offer deletion so assigned repairs can be removed.');
  assert.ok(repairContextMenuZIndex(true) > 100000, 'Repair context menus must render above modal repair windows.');
  assert.ok(repairContextMenuZIndex(false) >= 50, 'Standalone repair windows retain a visible context-menu layer.');
  const desktopApi = fs.readFileSync(path.join(root, 'app/electron/electron-main.ts'), 'utf8');
  const mobileApi = fs.readFileSync(path.join(root, 'src/mobile/mobile-api.ts'), 'utf8');
  for (const source of [desktopApi, mobileApi]) {
    assert.match(source, /delete\(\).*?select\('legacy_id'\)/s, 'cloud deletes must request the deleted identifier');
    assert.match(source, /no matching saved record was removed/, 'zero-row cloud deletes must be reported as failures');
  }
  assert.match(desktopApi, /key === 'repairCategories' && shouldUseCloudDb\(key\)[\s\S]*await cloudDbDelete\(key, id\)[\s\S]*scheduleCollectionChanged\(key\)[\s\S]*return true/, 'Desktop repair deletion must reach Supabase even when the row is absent from the local JSON cache.');
  assert.ok(desktopApi.indexOf("key === 'repairCategories' && shouldUseCloudDb(key)") < desktopApi.indexOf('if (idx === -1) return false;', desktopApi.indexOf("ipcMain.handle('db-delete'")), 'Cloud repair deletion must run before the local-cache missing-row return.');
  const main = fs.readFileSync(path.join(root, 'src/repairs/RepairCategoriesWindow.tsx'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'src/repairs/RepairTypeManager.tsx'), 'utf8');
  assert.match(main, /deleteRepair\(/);
  assert.match(settings, /type-and-repairs/);
  console.log('Repair deletion regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
