const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const result = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'lib', 'quoteSalesPrompt.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(compiled, compiled.exports, require);
const { buildQuoteSalesPrompt, copyQuotePromptText } = compiled.exports;

assert.equal(typeof copyQuotePromptText, 'function', 'quote prompt clipboard helper should be exported');

const iphonePrompt = buildQuoteSalesPrompt({
  deviceType: 'Apple Devices',
  brand: 'Apple',
  model: 'iPhone 15 Pro',
  condition: 'Excellent',
  internalCost: 600,
  price: 690,
  markupPct: 15,
  dynamic: {
    device: 'iPhone',
    storage: 256,
    color: 'Natural Titanium',
    cellular: 'Unlocked',
    batteryHealth: 92,
    sourceVendor: 'Example Vendor',
    quotedPrice: 690,
  },
});

assert.match(iphonePrompt, /== CONFIRMED SPECS/);
assert.match(iphonePrompt, /- Model: iPhone 15 Pro/);
assert.match(iphonePrompt, /- Storage: 256/);
assert.match(iphonePrompt, /- Battery Health: 92/);
assert.match(iphonePrompt, /Exactly one paragraph, 5-7 sentences/);
assert.doesNotMatch(iphonePrompt, /600|690|Example Vendor|Quoted Price/);

const customBuildPrompt = buildQuoteSalesPrompt({
  deviceType: 'Custom Build',
  dynamic: { cpu: 'Ryzen 7 7800X3D', cpuCores: 8, ramSize: 32, psuWatt: 850 },
});
assert.match(customBuildPrompt, /8 cores/);
assert.match(customBuildPrompt, /RAM: 32/);
assert.match(customBuildPrompt, /850W/);

async function testClipboardFallback() {
  const calls = [];
  const textarea = {
    value: '',
    style: {},
    focus() { calls.push('focus'); },
    select() { calls.push('select'); },
  };
  const copyEnvironment = {
    clipboard: {
      async writeText() {
        calls.push('modern-copy');
        throw new Error('Clipboard permission denied');
      },
    },
    document: {
      body: {
        appendChild(node) {
          assert.equal(node, textarea);
          calls.push('append');
        },
        removeChild(node) {
          assert.equal(node, textarea);
          calls.push('remove');
        },
      },
      createElement(tag) {
        assert.equal(tag, 'textarea');
        return textarea;
      },
      execCommand(command) {
        assert.equal(command, 'copy');
        calls.push('fallback-copy');
        return true;
      },
    },
  };

  await copyQuotePromptText('Generated quote prompt', copyEnvironment);
  assert.equal(textarea.value, 'Generated quote prompt');
  assert.deepEqual(calls, ['modern-copy', 'append', 'focus', 'select', 'fallback-copy', 'remove']);
}

testClipboardFallback()
  .then(() => console.log('Quote sales prompt tests passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
