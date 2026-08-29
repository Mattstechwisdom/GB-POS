const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const build = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/lib/quickCheckoutLifecycle.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const loaded = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(loaded, loaded.exports, require);

const { finishSuccessfulQuickCheckout } = loaded.exports;

(async () => {
  const events = [];
  await finishSuccessfulQuickCheckout(async () => { events.push('closed'); });
  assert.deepEqual(events, ['closed'], 'a completed Quick Checkout must close its window once');

  await assert.rejects(
    finishSuccessfulQuickCheckout(async () => { throw new Error('close failed'); }),
    /close failed/,
    'close failures must remain observable to the checkout error path',
  );
  console.log('Quick Checkout completion lifecycle checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
