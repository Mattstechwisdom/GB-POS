const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const source = path.join(__dirname, '..', 'src', 'lib', 'consultationRecord.ts');
const result = esbuild.buildSync({ entryPoints: [source], bundle: true, write: false, platform: 'node', format: 'cjs' });
const moduleShim = { exports: {} };
new Function('module', 'exports', result.outputFiles[0].text)(moduleShim, moduleShim.exports);

const { isConsultationRecord, mainRecordKind, mainRecordTypeLabel } = moduleShim.exports;

assert.equal(isConsultationRecord({ category: 'Consultation' }), true);
assert.equal(isConsultationRecord({ consultationType: 'instore' }), true);
assert.equal(isConsultationRecord({ items: [{ category: 'Consultation', consultationHours: 2 }] }), true);
assert.equal(isConsultationRecord({ category: 'Device', items: [{ category: 'Accessory' }] }), false);
assert.equal(mainRecordKind('workorder', { category: 'Consultation' }), 'workorder');
assert.equal(mainRecordKind('sale', { consultationHours: 1 }), 'consultation');
assert.equal(mainRecordKind('sale', { category: 'Device' }), 'sale');
assert.equal(mainRecordTypeLabel('consultation'), 'Consultation');
assert.equal(mainRecordTypeLabel('consultation', true), 'CONS');

console.log('Main-page work order, sale, and consultation type checks passed.');
