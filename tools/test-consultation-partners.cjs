const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const source = path.join(root, 'src', 'lib', 'consultationPartners.ts');
const result = esbuild.buildSync({ entryPoints: [source], bundle: true, write: false, platform: 'node', format: 'cjs' });
const moduleShim = { exports: {} };
new Function('module', 'exports', result.outputFiles[0].text)(moduleShim, moduleShim.exports);

const {
  calculatePartnerConsultationCharge,
  consultationPartnerAddress,
  consultationPartnerGroups,
  normalizeConsultationPartner,
  sortConsultationPartners,
} = moduleShim.exports;

assert.deepEqual(calculatePartnerConsultationCharge(2.5, 60), { billedHours: 2.5, automaticCharge: 150, charge: 150 });
assert.equal(calculatePartnerConsultationCharge(2.5, 60, 125).charge, 125);
assert.equal(calculatePartnerConsultationCharge(0, 60).billedHours, 1);

const partner = normalizeConsultationPartner({
  id: 'partner-1', group: 'Property Managers', businessName: 'Devine Offices', hourlyRate: 55,
  streetAddress: '100 Devine St', hasUnitNumber: true, unitNumber: '200', city: 'Columbia', state: 'SC', zip: '29205',
});
assert.equal(consultationPartnerAddress(partner), '100 Devine St, Unit 200, Columbia, SC 29205');
assert.deepEqual(consultationPartnerGroups([partner, { ...partner, id: '2', group: 'Property Managers' }, { ...partner, id: '3', group: 'Schools' }]), ['Property Managers', 'Schools']);
assert.equal(sortConsultationPartners([{ ...partner, id: 'u', group: '' }, partner])[0].id, 'partner-1');

const consultation = fs.readFileSync(path.join(root, 'src', 'components', 'ConsultationBookingWindow.tsx'), 'utf8');
assert.match(consultation, /consultationPartners/);
assert.match(consultation, /onContextMenu=/);
assert.match(consultation, /partnerHoldTimer/);
assert.match(consultation, /Open Maps/);
assert.match(consultation, /partnerHourlyRate/);
assert.match(consultation, /dbUpdate\('settings'/);

for (const relative of ['src/mobile/mobile-api.ts', 'app/electron/electron-main.ts']) {
  const sourceText = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.match(sourceText, /settings:\s*'shop_settings'/, `${relative} must sync partner settings through shop_settings.`);
  assert.match(sourceText, /settings:\s*'settings:changed'/, `${relative} must publish settings changes.`);
}

const quote = fs.readFileSync(path.join(root, 'src', 'components', 'QuoteGeneratorWindow.tsx'), 'utf8');
const actionsIndex = quote.indexOf('gb-quote-client-actions');
const creatorIndex = quote.indexOf('gb-quote-client-create');
const summaryIndex = quote.indexOf('gb-quote-client-summary', actionsIndex + 1);
assert.ok(actionsIndex >= 0 && creatorIndex > actionsIndex && creatorIndex < summaryIndex, 'Quote Add Client form must render directly below its client buttons.');
assert.match(quote, /embeddedCreate/);

console.log('Consultation partner directory, pricing, navigation, and quote client placement checks passed.');
