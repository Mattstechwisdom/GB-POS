const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function load(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', result.outputText)(mod, mod.exports, require);
  return mod.exports;
}

(async () => {
  const {
    mergeLocalAndCloudRecords,
    createSingleFlight,
    closeMenuBeforeAction,
    printPageProtectionCss,
  } = load('src/lib/reliability.ts');

  const localOnly = { id: 91, firstName: 'Local', updatedAt: '2026-09-08T12:00:00.000Z' };
  const merged = mergeLocalAndCloudRecords(
    [localOnly, { id: 7, firstName: 'Old', updatedAt: '2026-09-01T12:00:00.000Z' }],
    [{ id: 7, firstName: 'Current', updatedAt: '2026-09-07T12:00:00.000Z' }],
  );
  assert.deepEqual(merged.map((row) => row.firstName), ['Local', 'Current'], 'search data must include queued local clients and the newest cloud copy');

  let runs = 0;
  let release;
  const gate = createSingleFlight(async () => {
    runs += 1;
    await new Promise((resolve) => { release = resolve; });
    return 42;
  });
  const first = gate();
  const second = gate();
  assert.equal(runs, 1, 'double checkout must start only one save operation');
  release();
  assert.equal(await first, 42);
  assert.equal(await second, 42);

  const events = [];
  let finishDelete;
  const deletion = closeMenuBeforeAction(
    () => { events.push('closed'); },
    async () => {
      events.push('delete-started');
      await new Promise((resolve) => { finishDelete = resolve; });
      events.push('delete-finished');
    },
  );
  assert.deepEqual(events, ['closed', 'delete-started'], 'the input-blocking menu overlay must close before an async delete waits');
  finishDelete();
  await deletion;

  const printCss = printPageProtectionCss();
  assert.match(printCss, /@media print\s*\{[^}]*\.page\s*\{[^}]*padding:\s*0/s, 'print must not combine page margins with a second 12mm content margin');
  assert.match(printCss, /\.final-block\s*\{[^}]*break-inside:\s*avoid-page/s, 'terms and signature must stay together when printing');

  console.log('Reliability patch behavior checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
