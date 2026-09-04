const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp', 'test-repair-tutorial-player.cjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
esbuild.buildSync({ absWorkingDir: root, entryPoints: ['./src/lib/repairTutorial.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs' });
const { tutorialEmbedUrl, shiftedTutorialTime } = require(output);

assert.equal(tutorialEmbedUrl({ mediaType: 'youtube', youtubeId: 'dQw4w9WgXcQ' }), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0&playsinline=1');
assert.equal(shiftedTutorialTime(5, -10, 120), 0);
assert.equal(shiftedTutorialTime(115, 10, 120), 120);

const player = fs.readFileSync(path.join(root, 'src', 'repairs', 'RepairTutorialPlayer.tsx'), 'utf8');
for (const label of ['Rewind 10 seconds', 'Play or pause', 'Skip 10 seconds', 'Playback speed', 'Full screen', 'Open in browser']) {
  assert.match(player, new RegExp(`aria-label=["']${label}["']`), `Missing ${label} control.`);
}
const desktop = fs.readFileSync(path.join(root, 'app', 'electron', 'electron-main.ts'), 'utf8');
assert.match(desktop, /ipcMain\.handle\('open-repair-tutorial'/);
assert.match(desktop, /nodeIntegration:\s*false/);
assert.match(desktop, /contextIsolation:\s*true/);
const mobile = fs.readFileSync(path.join(root, 'src', 'mobile', 'MobileApp.tsx'), 'utf8');
assert.match(mobile, /case 'repairTutorial'/);

console.log('Repair tutorial player contract passed.');
