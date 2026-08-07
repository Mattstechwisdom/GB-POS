const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp', 'test-consultation-location.cjs');
esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'lib', 'consultationLocation.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
});

const { SHOP_CONSULTATION_LOCATION, consultationLocationDisplay } = require(output);

assert.equal(consultationLocationDisplay({ consultationType: 'instore' }), SHOP_CONSULTATION_LOCATION);
assert.equal(consultationLocationDisplay({ location: 'In-Store' }), SHOP_CONSULTATION_LOCATION);
assert.equal(consultationLocationDisplay({ consultationAddress: 'In Store' }), SHOP_CONSULTATION_LOCATION);
assert.equal(consultationLocationDisplay({ consultationAddress: 'At Shop Location' }), SHOP_CONSULTATION_LOCATION);
assert.equal(consultationLocationDisplay({ consultationType: 'athome', consultationAddress: '123 Main St' }), '123 Main St');
assert.equal(consultationLocationDisplay({ consultationType: 'at-home' }), 'At Home');

console.log('Consultation shop-location fallback checks passed.');
