const path = require('path');
const { pathToFileURL } = require('url');

const asarPath = path.resolve(process.argv[2] || '');
if (!asarPath) throw new Error('Pass the packaged app.asar path.');

const moduleUrl = pathToFileURL(path.join(asarPath, 'node_modules', 'node-llama-cpp', 'dist', 'index.js')).href;
import(moduleUrl).then(async (module) => {
  const llama = await module.getLlama({ gpu: false, progressLogs: false, skipDownload: true });
  if (!llama) throw new Error('Packaged node-llama-cpp did not initialize.');
  await llama.dispose();
  console.log('Packaged Gidget native runtime initialized.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
