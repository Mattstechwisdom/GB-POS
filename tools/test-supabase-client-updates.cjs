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

expect(panel.includes("supabase.functions.invoke('client-updates'"), 'Update Client must invoke the Supabase client-updates function.');
expect(!panel.includes('gb-pos-production.up.railway.app'), 'Update Client still contains a Railway fallback.');
expect(desktop.includes('https://mattstechwisdom.github.io/GB-POS'), 'Desktop QR links must use the free GitHub Pages app.');
expect(mobile.includes('https://mattstechwisdom.github.io/GB-POS'), 'Mobile QR links must use the free GitHub Pages app.');
expect(mobileApp.includes("get('clientUpdateToken')"), 'The hosted mobile app must read QR update tokens.');
expect(mobileApp.includes('<ClientUpdatePanel'), 'The hosted mobile app must open the Update Client panel for QR links.');
expect(updateFunction.includes('Sign in before sending a client update.'), 'The client-updates function must require authentication.');
expect(updateFunction.includes('send-client-update'), 'The client-updates function must hand email delivery to send-pos-email.');
expect(updateFunction.includes('client_update_history'), 'The client-updates function must archive every update.');
expect(statusFunction.includes('format') && statusFunction.includes('text/calendar'), 'Consultation QR status must support calendar reminders.');
expect(consultationPage.includes('/functions/v1/qr-status'), 'The consultation page must load through Supabase.');

console.log('Supabase client update and QR routing checks passed.');
