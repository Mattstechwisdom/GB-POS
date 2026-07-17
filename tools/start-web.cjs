const path = require('path');
const { spawn } = require('child_process');

require('./write-runtime-config.cjs');
if (process.exitCode) process.exit(process.exitCode);

const rawPort = String(process.env.PORT || '3000').trim();
const port = /^\d+$/.test(rawPort) ? rawPort : '3000';
const serveBin = path.join(process.cwd(), 'node_modules', 'serve', 'build', 'main.js');

console.log(`Starting GadgetBoy POS web server on 0.0.0.0:${port}`);
const child = spawn(process.execPath, [serveBin, '-s', 'dist', '-l', `tcp://0.0.0.0:${port}`], {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  console.error('Web server failed to start:', error.message || error);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code == null ? 1 : code);
});
