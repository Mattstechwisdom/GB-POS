const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

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
      return;
    }
  }

  console.log(`Generating ICO from ${path.relative(repoRoot, inputPng)} -> ${path.relative(repoRoot, outIco)}`);
  const icoBuf = await pngToIco(inputPng);
  fs.writeFileSync(outIco, icoBuf);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
