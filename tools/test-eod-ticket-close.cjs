const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const eod = fs.readFileSync(path.join(root, 'src/components/EODWindow.tsx'), 'utf8');
const contextMenu = fs.readFileSync(path.join(root, 'src/components/ContextMenu.tsx'), 'utf8');

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

requireMatch(eod, /Open Ticket Warnings/, 'EOD is missing its visible open-ticket warning.');
requireMatch(eod, /Payment taken without checkout/, 'EOD is missing the prior paid-ticket warning logic.');
requireMatch(eod, /Diagnostic fee not taken/, 'EOD is missing diagnostic-fee warning logic.');
requireMatch(eod, /Repair Complete update sent while still open/, 'EOD is missing repair-complete warning logic.');
requireMatch(eod, /onContextMenu=\{event => ticketContext\.openFromEvent\(event, ticket\.row\)\}/, 'EOD warning rows do not expose desktop/mobile context actions.');
requireMatch(eod, /label: 'Open Invoice'/, 'EOD context menu cannot open an invoice.');
requireMatch(eod, /label: 'Close Ticket'/, 'EOD context menu cannot close a ticket.');
requireMatch(eod, /const preservedPayments = collectPayments\(record\)/, 'EOD close must preserve recorded payment timing.');
requireMatch(eod, /status: 'closed',[\s\S]*checkoutDate: now,[\s\S]*payments: preservedPayments/, 'EOD close does not persist checkout metadata safely.');
requireMatch(eod, /remaining balance will stay on the invoice and will not be counted as money collected today/, 'EOD close confirmation does not explain unpaid-balance accounting.');
requireMatch(eod, /onWorkOrdersChanged\?\.\(\(\) => load\(\)\)/, 'EOD does not refresh when work orders sync.');
requireMatch(eod, /onSalesChanged\?\.\(\(\) => load\(\)\)/, 'EOD does not refresh when sales sync.');
requireMatch(contextMenu, /zIndex\?: number/, 'Shared context menus cannot be raised above daughter-window overlays.');

console.log('EOD open-ticket warning and close-accounting checks passed.');
