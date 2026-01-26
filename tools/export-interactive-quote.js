#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function findDbPath() {
  const appData = process.env.APPDATA;
  if (!appData) return null;

  const candidates = [
    path.join(appData, 'Electron', 'gbpos-db.json'),
    path.join(appData, 'gadgetboy-pos', 'gbpos-db.json'),
    path.join(appData, 'GadgetBoy POS', 'gbpos-db.json'),
    path.join(appData, 'GB POS', 'gbpos-db.json'),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function main() {
  const customerQuery = (process.argv[2] || '').trim();
  const outName = (process.argv[3] || '').trim();

  if (!customerQuery) {
    console.error('Usage: node tools/export-interactive-quote.js "Matt Floyd" [outputFileName.html]');
    process.exit(2);
  }

  const dbPath = findDbPath();
  if (!dbPath) {
    console.error('Could not locate gbpos-db.json under %APPDATA%.');
    process.exit(1);
  }

  const raw = fs.readFileSync(dbPath, 'utf8');
  const db = JSON.parse(raw);
  const quoteFiles = Array.isArray(db.quoteFiles) ? db.quoteFiles : [];

  const re = new RegExp(customerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const matches = quoteFiles
    .filter((q) => re.test(String(q.customerName || '')))
    .filter((q) => typeof q.html === 'string' && q.html.trim().startsWith('<'));

  if (matches.length === 0) {
    console.error(`No quoteFiles entries with embedded html found for customer matching: ${customerQuery}`);
    console.error(`DB: ${dbPath}`);
    process.exit(1);
  }

  matches.sort((a, b) => {
    const da = Date.parse(String(a.createdAt || ''));
    const dbb = Date.parse(String(b.createdAt || ''));
    return (isNaN(dbb) ? 0 : dbb) - (isNaN(da) ? 0 : da);
  });

  const picked = matches[0];
  const html = String(picked.html || '');

  const safeBase = outName || `interactive-${String(picked.customerName || 'customer').toLowerCase().replace(/\s+/g, '-')}.html`;
  const outPath = path.join(process.cwd(), 'exports', safeBase);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');

  console.log(`Exported interactive HTML to: ${outPath}`);
  console.log(`Source DB: ${dbPath}`);
  console.log(`Picked createdAt: ${picked.createdAt || '(unknown)'}`);
}

main();
