const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const pngToIco = require('png-to-ico');

function generateAndroidIcons(repoRoot) {
  if (process.platform !== 'win32') {
    console.log('Skipping Android launcher icon generation: PowerShell/System.Drawing generator is Windows-only.');
    return;
  }

  const script = path.join(repoRoot, 'tools', 'generate-android-icons.ps1');
  if (!fs.existsSync(script)) {
    console.warn(`Android icon generator not found: ${path.relative(repoRoot, script)}`);
    return;
  }

  console.log('Generating Android launcher icons from public/logo.png');
  const res = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Android icon generation failed with exit code ${res.status}`);
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const inputPng = path.join(repoRoot, 'public', 'logo.png');
  const outDir = path.join(repoRoot, 'build');
  const outIco = path.join(outDir, 'icon.ico');

  if (!fs.existsSync(inputPng)) {
    console.error(`Icon source not found: ${inputPng}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  // If an icon already exists, keep it unless the source PNG is newer.
  if (fs.existsSync(outIco)) {
    const pngMtime = fs.statSync(inputPng).mtimeMs;
    const icoMtime = fs.statSync(outIco).mtimeMs;
    if (icoMtime >= pngMtime) {
      console.log(`Icon already up-to-date: ${path.relative(repoRoot, outIco)}`);
      generateAndroidIcons(repoRoot);
      return;
    }
  }

  console.log(`Generating ICO from ${path.relative(repoRoot, inputPng)} -> ${path.relative(repoRoot, outIco)}`);
  const icoBuf = await pngToIco(inputPng);
  fs.writeFileSync(outIco, icoBuf);
  console.log('Done.');
  generateAndroidIcons(repoRoot);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
