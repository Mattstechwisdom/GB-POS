const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('app/electron/electron-main.ts');
const receipt = read('src/workorders/CustomerReceiptWindow.tsx');
const consult = read('src/sales/ConsultSheetWindow.tsx');

assert.match(main, /const SILENT_PRINT_RENDERER_READY_TIMEOUT_MS = 7000;/,
  'Silent printing must allow enough time for a cloud-backed QR to be created and rendered.');
assert.equal(
  (main.match(/setTimeout\(startSilentPrint, SILENT_PRINT_RENDERER_READY_TIMEOUT_MS\)/g) || []).length,
  2,
  'Both receipt printing (work orders and sales) and consultation printing must wait for QR readiness.',
);
assert.match(receipt, /QR status URL timed out[\s\S]{0,80}5000/,
  'Work-order and sales QR lookup must have a bounded failure path.');
assert.match(consult, /QR status URL timed out[\s\S]{0,80}5000/,
  'Consultation QR lookup must have the same bounded failure path.');
assert.equal(
  (consult.match(/if \(consultationRequiresQr && !qrSrc\) return;/g) || []).length,
  2,
  'Manual and silent consultation printing must not signal readiness without the required QR image.',
);

console.log('Print QR readiness checks passed.');
