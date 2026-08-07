const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp', 'test-distributor-url.cjs');
esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'lib', 'partOrdering.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
});

const { derivePartVendorFromUrl, normalizePartOrderUrl } = require(output);

assert.equal(normalizePartOrderUrl('phonelcdparts.com/apple/part'), 'https://phonelcdparts.com/apple/part');
assert.equal(derivePartVendorFromUrl('https://www.phonelcdparts.com/apple/part'), 'Phone LCD Parts');
assert.equal(derivePartVendorFromUrl('https://mobilesentrix.com/item'), 'MobileSentrix');
assert.equal(derivePartVendorFromUrl('https://www.injuredgadgets.com/item'), 'Injured Gadgets');
assert.equal(derivePartVendorFromUrl('https://example-parts.com/item'), 'Example Parts');

console.log('Local distributor URL detection checks passed.');
