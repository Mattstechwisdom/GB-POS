const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const source = path.join(__dirname, '..', 'src', 'lib', 'consultationPricing.ts');
const result = esbuild.buildSync({ entryPoints: [source], bundle: true, write: false, platform: 'node', format: 'cjs' });
const moduleShim = { exports: {} };
new Function('module', 'exports', result.outputFiles[0].text)(moduleShim, moduleShim.exports);

const { calculateConsultationPricing } = moduleShim.exports;

assert.deepEqual(calculateConsultationPricing(1), {
  billedHours: 1,
  extraHours: 0,
  automaticLaborCharge: 75,
  laborCharge: 75,
});
assert.deepEqual(calculateConsultationPricing(2.5), {
  billedHours: 2.5,
  extraHours: 1.5,
  automaticLaborCharge: 150,
  laborCharge: 150,
});
assert.equal(calculateConsultationPricing(2.5, 180).laborCharge, 180);
assert.equal(calculateConsultationPricing(2, -20).laborCharge, 0);
assert.equal(calculateConsultationPricing(0).billedHours, 1);

console.log('Consultation automatic and custom pricing checks passed.');
