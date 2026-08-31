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

const { applyInventoryUrlAutofill, derivePartVendorFromUrl, normalizePartOrderUrl } = require(output);

assert.equal(normalizePartOrderUrl('phonelcdparts.com/apple/part'), 'https://phonelcdparts.com/apple/part');
assert.equal(derivePartVendorFromUrl('https://www.phonelcdparts.com/apple/part'), 'Phone LCD Parts');
assert.equal(derivePartVendorFromUrl('https://mobilesentrix.com/item'), 'MobileSentrix');
assert.equal(derivePartVendorFromUrl('https://www.injuredgadgets.com/item'), 'Injured Gadgets');
assert.equal(derivePartVendorFromUrl('https://example-parts.com/item'), 'Example Parts');
assert.equal(applyInventoryUrlAutofill({ distributor: '' }, { ok: false }, 'https://example-parts.com/item').distributor, 'Example Parts',
  'Standalone parts must derive the distributor even when remote page scraping is blocked.');
assert.equal(applyInventoryUrlAutofill({ distributor: 'Manual Vendor' }, { vendor: 'Example Parts' }, 'https://example-parts.com/item').distributor, 'Manual Vendor',
  'URL autofill must not overwrite a distributor entered by the user.');
const filled = applyInventoryUrlAutofill(
  { itemDescription: '', distributorSku: '', internalCost: undefined, price: undefined, markupPct: 10 },
  { ok: true, vendor: 'Parts Co', title: 'iPhone X OLED', price: 40, specs: [{ name: 'SKU', value: 'IPX-OLED' }] },
  'https://parts.example/ipx',
);
assert.equal(filled.itemDescription, 'iPhone X OLED');
assert.equal(filled.distributorSku, 'IPX-OLED');
assert.equal(filled.internalCost, 40);
assert.equal(filled.price, 44);
const preserved = applyInventoryUrlAutofill(
  { itemDescription: 'My title', distributorSku: 'MANUAL', internalCost: 35, price: 60, markupPct: 10 },
  { ok: true, title: 'Remote title', price: 40, specs: [{ name: 'Item #', value: 'REMOTE' }] },
  'https://parts.example/ipx',
);
assert.deepEqual(
  { itemDescription: preserved.itemDescription, distributorSku: preserved.distributorSku, internalCost: preserved.internalCost, price: preserved.price },
  { itemDescription: 'My title', distributorSku: 'MANUAL', internalCost: 35, price: 60 },
  'URL autofill must preserve intentional inventory values',
);

console.log('Local distributor URL detection checks passed.');
