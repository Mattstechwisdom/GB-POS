const fs = require('fs');
const path = require('path');

const root = process.cwd();
const desktopDir = path.join(root, 'dist');
const mobileDir = path.join(root, 'dist-mobile');

if (!fs.existsSync(path.join(desktopDir, 'index.html'))) {
  throw new Error('Desktop web build is missing dist/index.html.');
}
if (!fs.existsSync(path.join(mobileDir, 'mobile.html'))) {
  throw new Error('Mobile web build is missing dist-mobile/mobile.html.');
}

fs.copyFileSync(path.join(mobileDir, 'mobile.html'), path.join(desktopDir, 'mobile.html'));
fs.cpSync(path.join(mobileDir, 'assets'), path.join(desktopDir, 'assets'), { recursive: true, force: true });
for (const name of fs.readdirSync(mobileDir)) {
  if (name === 'index.html' || name === 'mobile.html' || name === 'assets' || name === 'runtime-env.js') continue;
  fs.cpSync(path.join(mobileDir, name), path.join(desktopDir, name), { recursive: true, force: true });
}
console.log('Merged desktop and mobile web builds into dist/.');
