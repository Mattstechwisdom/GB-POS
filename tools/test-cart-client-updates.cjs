const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const eod = read('src/components/EODWindow.tsx');
const edge = read('supabase/functions/client-updates/index.ts');

expect(eod.includes("supabase.functions.invoke('client-updates'"), 'Cart checkout must use the authenticated Supabase client-update service.');
expect(eod.includes("statusKey: 'part_ordered'"), 'Work-order cart checkout must send Part Ordered.');
expect(eod.includes("statusKey: 'product_ordered'"), 'Sale cart checkout must send Product Ordered.');
expect(eod.includes("deliveryMode: 'email'"), 'Cart checkout must request client email delivery.');
expect(eod.includes('preserveTechNotes: true'), 'Automatic cart updates must preserve existing technician notes.');
expect(eod.includes('successfulPurchaseKeys.has(row.key)'), 'Client updates must only cover successfully checked-out cart lines.');
expect(eod.includes('const workOrderIds = Array.from(new Set('), 'Work-order updates must be deduplicated per invoice.');
expect(eod.includes('const saleIds = Array.from(new Set('), 'Sale updates must be deduplicated per invoice.');
expect(eod.includes('skipped because no email is on file'), 'Cart checkout must explain skipped client notifications.');
expect(!eod.includes('const subject = `Part ordered for WO-${workOrderId}`'), 'Legacy desktop-only cart email path is still present.');
expect(edge.includes('client_update_history'), 'Supabase client updates must archive notification history.');
expect(edge.includes('send-client-update'), 'Supabase client updates must hand email delivery to send-pos-email.');
expect(edge.includes('if (!preserveTechNotes) patch.tech_notes'), 'Supabase automatic updates must support preserving technician notes.');

console.log('Cart checkout client notification checks passed.');
