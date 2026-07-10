const fs = require('fs');
const path = require('path');

const config = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
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
