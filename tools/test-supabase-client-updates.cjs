const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const panel = read('src/workorders/ClientUpdatePanel.tsx');
const desktop = read('app/electron/electron-main.ts');
const mobile = read('src/mobile/mobile-api.ts');
const mobileApp = read('src/mobile/MobileApp.tsx');
const updateFunction = read('supabase/functions/client-updates/index.ts');
const statusFunction = read('supabase/functions/qr-status/index.ts');
const consultationPage = read('public/consultation.html');
const saleWindow = read('src/sales/SaleWindow.tsx');
const salePrint = read('src/sales/salePrint.ts');
const saleReceipt = read('src/workorders/CustomerReceiptWindow.tsx');
const consultSheet = read('src/sales/ConsultSheetWindow.tsx');
const consultBooking = read('src/components/ConsultationBookingWindow.tsx');
const intakePanel = read('src/workorders/IntakePanel.tsx');

expect(panel.includes("supabase.functions.invoke('client-updates'"), 'Update Client must invoke the Supabase client-updates function.');
expect(panel.includes("from('client_update_history')"), 'Update Client history must load the invoice archive from Supabase.');
expect(panel.includes('role="dialog"'), 'Update Client history must open in an accessible daughter window.');
expect(panel.includes('Client Update History'), 'Update Client and QR panels must expose the history window.');
expect(panel.includes('event.target === event.currentTarget'), 'The mobile history backdrop must close the daughter window.');
expect(!panel.includes('gb-pos-production.up.railway.app'), 'Update Client still contains a Railway fallback.');
expect(desktop.includes('https://mattstechwisdom.github.io/GB-POS'), 'Desktop QR links must use the free GitHub Pages app.');
expect(mobile.includes('https://mattstechwisdom.github.io/GB-POS'), 'Mobile QR links must use the free GitHub Pages app.');
expect(!mobile.includes('railway.app'), 'Mobile QR routing must not fall back to Railway.');
expect(!read('src/components/GidgetChat.tsx').includes('railway.app'), 'Gidget must not fall back to Railway.');
expect(mobileApp.includes("get('clientUpdateToken')"), 'The hosted mobile app must read QR update tokens.');
expect(mobileApp.includes('<ClientUpdatePanel'), 'The hosted mobile app must open the Update Client panel for QR links.');
expect(updateFunction.includes('Sign in before sending a client update.'), 'The client-updates function must require authentication.');
expect(updateFunction.includes('send-client-update'), 'The client-updates function must hand email delivery to send-pos-email.');
expect(updateFunction.includes('client_update_history'), 'The client-updates function must archive every update.');
expect(statusFunction.includes('format') && statusFunction.includes('text/calendar'), 'Consultation QR status must support calendar reminders.');
expect(consultationPage.includes('/functions/v1/qr-status'), 'The consultation page must load through Supabase.');
expect(salePrint.includes("qrGetStatusUrl?.('sale', recordId)"), 'Printed sales forms must use the Supabase-backed sale QR route.');
expect(saleReceipt.includes("qrGetStatusUrl?.('sale', recordId)"), 'Printed sales receipts must use the Supabase-backed sale QR route.');
expect(saleReceipt.includes('alt="Sale update QR"'), 'Printed sales receipts must render the sale QR image.');
expect(consultSheet.includes("qrGetStatusUrl?.('consult', eventId)"), 'Printed consultation sheets must use the consultation calendar-event QR route.');
expect(consultSheet.includes('alt="Consultation update QR"'), 'Printed consultation sheets must render the consultation QR image.');
expect(saleWindow.includes("recordType: 'sale'"), 'Sales must open their own Update Client workflow.');
expect(saleWindow.includes("recordType: 'consult'"), 'Consultations edited from a sale window must open their own Update Client workflow.');
expect(saleWindow.includes('findConsultationEventId'), 'Consultation updates and printouts must resolve the linked calendar event.');
expect(consultBooking.includes('recordId={done.eventId}'), 'New consultation updates must use the consultation event ID.');
expect(intakePanel.indexOf('Update Client') < intakePanel.indexOf('View customer'), 'Update Client must sit directly beneath client information.');

console.log('Supabase client update and QR routing checks passed.');
