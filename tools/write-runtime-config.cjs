const fs = require('fs');
const path = require('path');

function firstEnvironmentValue(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

const config = {
  VITE_SUPABASE_URL: firstEnvironmentValue('VITE_SUPABASE_URL', 'SUPABASE_URL'),
  VITE_SUPABASE_PUBLISHABLE_KEY: firstEnvironmentValue(
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
  ),
  VITE_SHOP_LOGIN_USERNAME: process.env.VITE_SHOP_LOGIN_USERNAME || 'Gadgetboyz',
  VITE_SHOP_LOGIN_EMAIL: process.env.VITE_SHOP_LOGIN_EMAIL || '',
};

const outDir = path.join(process.cwd(), 'dist');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'runtime-env.js'),
  `window.__GB_POS_CONFIG__ = ${JSON.stringify(config)};\n`,
  'utf8',
);

const present = Object.fromEntries(
  Object.entries(config).map(([key, value]) => [key, value ? 'present' : 'missing']),
);
console.log('Runtime config written:', present);

const missing = Object.entries({
  VITE_SUPABASE_URL: config.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: config.VITE_SUPABASE_PUBLISHABLE_KEY,
})
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`Missing required Railway variables: ${missing.join(', ')}`);
  process.exitCode = 1;
}
