const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp', 'test-automatic-client-email.cjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
esbuild.buildSync({ absWorkingDir: root, entryPoints: ['./src/lib/automaticClientEmail.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs' });
const { classifyAcknowledgment, consultationDigest, consultationChanges, renderAutomaticClientEmail } = require(output);

assert.equal(classifyAcknowledgment({ recordType: 'repair', diagnosticSelection: { price: 49 }, hasDiagnosticAcknowledgment: false }, { applied: 49 }), 'diagnostic-intake');
assert.equal(classifyAcknowledgment({ recordType: 'repair', orderedPart: true, diagnosticSelection: { price: 49 }, hasDiagnosticAcknowledgment: false }, { applied: 30 }), 'diagnostic-intake');
assert.equal(classifyAcknowledgment({ recordType: 'repair', orderedPart: true, hasDiagnosticAcknowledgment: false }, { applied: 30 }), 'part-awaiting-delivery');
assert.equal(classifyAcknowledgment({ recordType: 'sale', completed: true, inStock: true }, { applied: 100 }), 'in-stock-sale');
assert.equal(classifyAcknowledgment({ recordType: 'sale', completed: true, inStock: false }, { applied: 100 }), null);
assert.equal(classifyAcknowledgment({ recordType: 'sale', completed: true, inStock: true }, { applied: 0 }), null);

const consult = { date: '2026-09-05', time: '10:00', location: 'In store', topic: 'Setup', device: 'Laptop', duration: '1 hour', consultant: 'Alex', internalNote: 'private' };
assert.equal(consultationDigest(consult), consultationDigest({ ...consult, internalNote: 'changed' }));
assert.notEqual(consultationDigest(consult), consultationDigest({ ...consult, time: '11:00' }));
assert.deepEqual(consultationChanges(consult, { ...consult, time: '11:00' }), ['Time: 10:00 → 11:00']);

const common = { firstName: '<Sam>', recordNumber: 42, device: 'Apple iPhone 15', amount: 49, problem: 'Broken screen', part: 'OLED display', itemSummary: 'USB-C cable', date: 'September 5, 2026', time: '10:00 AM', location: 'In store', topic: 'Device setup', duration: '1 hour', consultant: 'Alex', statusUrl: 'https://example.com/status' };
const expected = {
  'diagnostic-intake': 'We’ve received your Apple iPhone 15 — Work Order #42',
  'part-awaiting-delivery': 'Your repair part has been ordered — Work Order #42',
  'in-stock-sale': 'Thank you for your purchase — Sale #42',
  'consultation-scheduled': 'Your GadgetBoy consultation is scheduled — September 5, 2026 at 10:00 AM',
  'consultation-updated': 'Updated GadgetBoy consultation details — September 5, 2026 at 10:00 AM',
};
for (const [kind, subject] of Object.entries(expected)) {
  const rendered = renderAutomaticClientEmail(kind, { ...common, changes: ['Time: 9:00 AM → 10:00 AM'] });
  assert.equal(rendered.subject, subject);
  assert.match(rendered.html, /GADGETBOY Repair &amp; Retail/);
  assert.match(rendered.html, /&lt;Sam&gt;/);
  assert.doesNotMatch(rendered.html, /<Sam>/);
  assert.match(rendered.html, /safe-sender list/);
  assert.match(rendered.html, /reply to this (message|email)/i);
  assert.match(rendered.text, /GadgetBoy/);
}
assert.match(renderAutomaticClientEmail('diagnostic-intake', common).html, /View Repair Status/);
console.log('Automatic client email classification and templates passed.');
