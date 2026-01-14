// Clear all technicians from the GadgetBoy POS JSON DB with a safety backup
// Windows-focused: looks in %APPDATA% for the Electron userData folder

const fs = require('fs');
const path = require('path');

function findDbFile() {
  const appData = process.env.APPDATA || '';
  const candidates = [
    path.join(appData, 'gadgetboy-pos', 'gbpos-db.json'),
    path.join(appData, 'gadgetboy-pos (development)', 'gbpos-db.json'),
    path.join(appData, 'GadgetBoy POS', 'gbpos-db.json'),
    path.join(appData, 'GadgetBoy POS (development)', 'gbpos-db.json'),
    path.join(appData, 'electron', 'gbpos-db.json'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  // Fallback: scan top-level subfolders under %APPDATA% for gbpos-db.json
  try {
    const entries = fs.readdirSync(appData, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = path.join(appData, e.name, 'gbpos-db.json');
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return null;
}

function backupFile(srcPath) {
  const dir = path.dirname(srcPath);
  const base = path.basename(srcPath, '.json');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(dir, `${base}-backup-${stamp}.json`);
  fs.copyFileSync(srcPath, backup);
  return backup;
}

function main() {
  const dbPath = findDbFile();
  if (!dbPath) {
    console.error('Could not find db file in %APPDATA%/gadgetboy-pos or %APPDATA%/GadgetBoy POS');
    process.exit(1);
  }
  console.log('DB file:', dbPath);
  const raw = fs.readFileSync(dbPath, 'utf-8');
  let db = {};
  try {
    db = JSON.parse(raw || '{}');
  } catch (e) {
    console.error('Failed parsing DB JSON:', e && e.message);
    process.exit(2);
  }
  const before = Array.isArray(db.technicians) ? db.technicians.length : 0;
  const backup = backupFile(dbPath);
  db.technicians = [];
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  const after = Array.isArray(db.technicians) ? db.technicians.length : 0;
  console.log(`Cleared technicians: ${before} -> ${after}`);
  console.log('Backup saved at:', backup);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e); process.exit(1); }
}
