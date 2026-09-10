const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp', 'test-automatic-client-email.cjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
esbuild.buildSync({ absWorkingDir: root, entryPoints: ['./src/lib/automaticClientEmail.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs' });
const { acknowledgmentAmount, classifyAcknowledgment, consultationDigest, consultationChanges, renderAutomaticClientEmail } = require(output);

assert.equal(classifyAcknowledgment({ recordType: 'repair', diagnosticSelection: { price: 49 } }, { applied: 49, appliedLabor: 49, priorLaborPaid: 0 }), 'diagnostic-intake');
assert.equal(classifyAcknowledgment({ recordType: 'repair', diagnosticSelection: { price: 49 } }, { applied: 70, appliedLabor: 70, priorLaborPaid: 49 }), null, 'later labor must not be mislabeled as a diagnostic payment');
assert.equal(classifyAcknowledgment({ recordType: 'repair', diagnosticSelection: { price: 49 } }, { applied: 70, appliedLabor: 70, priorLaborPaid: 49, isFinalPayment: true }), 'repair-completed', 'the final labor payment at pickup must send a completion thank-you');
assert.equal(classifyAcknowledgment({ recordType: 'repair' }, { applied: 100, appliedLabor: 100, priorLaborPaid: 0, isFinalPayment: true }), 'repair-completed', 'a fully paid repair without a diagnostic must send a completion thank-you');
assert.equal(classifyAcknowledgment({ recordType: 'repair', diagnosticSelection: { price: 50 } }, { applied: 50, appliedLabor: 50, priorLaborPaid: 0, isFinalPayment: true }), 'diagnostic-intake', 'a diagnostic-only checkout must remain a drop-off acknowledgment');
assert.equal(classifyAcknowledgment({ recordType: 'repair', items: [{ repairCategory: 'Diagnostic', repair: 'PS5 Diagnostic', labor: 50 }] }, { applied: 50, appliedLabor: 50, priorLaborPaid: 0 }), 'diagnostic-intake', 'a diagnostic catalog line must trigger the intake acknowledgment');
assert.equal(classifyAcknowledgment({ recordType: 'repair', orderedPart: true, diagnosticSelection: { price: 49 } }, { applied: 30, appliedParts: 30, appliedLabor: 0, priorLaborPaid: 0 }), 'part-awaiting-delivery');
assert.equal(classifyAcknowledgment({ recordType: 'repair', orderedPart: true, diagnosticSelection: { price: 49 } }, { applied: 90, appliedParts: 20, appliedLabor: 70, priorLaborPaid: 49, isFinalPayment: true }), 'repair-completed', 'a final pickup payment that includes labor must take precedence over the earlier ordered-part state');
assert.equal(classifyAcknowledgment({ recordType: 'repair', orderedPart: true }, { applied: 30, appliedParts: 0, appliedLabor: 30, priorLaborPaid: 0 }), null, 'labor-only payments must not be labeled as part deposits');
assert.equal(acknowledgmentAmount({ diagnosticSelection: { amount: 50 } }, { applied: 80, appliedLabor: 80, priorLaborPaid: 20 }, 'diagnostic-intake'), 30, 'the email must show only the diagnostic portion of a mixed labor payment');
assert.equal(acknowledgmentAmount({}, { applied: 30, appliedParts: 30 }, 'part-awaiting-delivery'), 30);
assert.equal(acknowledgmentAmount({}, { applied: 70, appliedLabor: 70 }, 'repair-completed'), 70);
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
  'repair-completed': 'Your Apple iPhone 15 repair is complete — Work Order #42',
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
assert.match(renderAutomaticClientEmail('repair-completed', common).text, /final labor payment of \$49\.00/i);
assert.match(renderAutomaticClientEmail('repair-completed', common).text, /thank you for choosing GadgetBoy/i);
console.log('Automatic client email classification and templates passed.');
