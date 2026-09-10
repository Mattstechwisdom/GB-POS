const assert = require('node:assert/strict');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
});

const { buildWindowsUpdateHandoff } = require('../app/electron/update-launcher.ts');

const handoff = buildWindowsUpdateHandoff("C:\\Users\\Shop User\\Updates\\GB POS's Update.exe", 4321);
assert.equal(handoff.executable.toLowerCase(), 'powershell.exe');
assert.deepEqual(handoff.args.slice(0, 4), ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden']);
assert.ok(handoff.args.includes('-EncodedCommand'));

const encoded = handoff.args[handoff.args.indexOf('-EncodedCommand') + 1];
const script = Buffer.from(encoded, 'base64').toString('utf16le');
assert.match(script, /WaitForExit\(\)/, 'The installer launcher must wait for GadgetBoy POS to exit.');
assert.match(script, /Start-Sleep -Milliseconds 750/, 'Windows needs a short lock-release grace period after process exit.');
assert.match(script, /Start-Process -FilePath 'C:\\Users\\Shop User\\Updates\\GB POS''s Update\.exe'/);
assert.match(script, /'--updated','\/S','--force-run'/);
assert.match(script, /-WindowStyle Hidden/);

console.log('Windows update handoff checks passed.');
