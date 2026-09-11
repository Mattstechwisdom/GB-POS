const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'app', 'electron', 'update-launcher.ts');
const out = path.join(os.tmpdir(), `gbpos-update-launcher-${process.pid}.cjs`);
esbuild.buildSync({ entryPoints: [source], outfile: out, bundle: true, platform: 'node', format: 'cjs' });
const { buildWindowsUpdateHandoff, resolveDownloadedInstallerPath } = require(out);

assert.equal(resolveDownloadedInstallerPath(['C:\\cache\\latest.blockmap', 'C:\\cache\\GB-POS-0.6.83.exe']), 'C:\\cache\\GB-POS-0.6.83.exe');
assert.equal(resolveDownloadedInstallerPath('C:\\cache\\GB-POS-0.6.83.exe'), 'C:\\cache\\GB-POS-0.6.83.exe');
const handoff = buildWindowsUpdateHandoff('C:\\cache\\GB-POS-0.6.83.exe', 4321);
assert.equal(handoff.executable, 'powershell.exe');
const script = Buffer.from(handoff.args.at(-1), 'base64').toString('utf16le');
assert.match(script, /Get-Process -Id 4321/);
assert.match(script, /WaitForExit\(\)/);
assert.match(script, /Start-Sleep -Milliseconds 1000/);
assert.match(script, /--updated/);
assert.match(script, /\/S/);
assert.match(script, /--force-run/);
assert.match(script, /-WindowStyle Hidden/);
fs.unlinkSync(out);
console.log('Windows updater handoff waits for process exit and launches the downloaded installer.');
