const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const electron = require('electron');

const asarPath = path.resolve(process.argv[2] || '');
const modelPath = process.argv[3] ? path.resolve(process.argv[3]) : '';
const resultPath = process.env.GBPOS_GIDGET_TEST_RESULT || '';
if (!asarPath) throw new Error('Pass the packaged app.asar path.');
const moduleUrl = pathToFileURL(path.join(asarPath, 'node_modules', 'node-llama-cpp', 'dist', 'index.js')).href;

async function run() {
  if (resultPath) fs.writeFileSync(resultPath, 'starting', 'utf8');
  const module = await import(moduleUrl);
  const llama = await module.getLlama({ gpu: false, progressLogs: false, skipDownload: true });
  if (!llama) throw new Error('Packaged node-llama-cpp did not initialize.');
  if (modelPath) {
    const model = await llama.loadModel({ modelPath });
    if (!model) throw new Error('Packaged Gidget runtime did not load the GGUF model.');
    const context = await model.createContext({ contextSize: 4096 });
    const session = new module.LlamaChatSession({ contextSequence: context.getSequence() });
    const answer = await session.prompt('Reply with the words Gidget is ready.', { maxTokens: 32, temperature: 0 });
    if (!String(answer || '').trim()) throw new Error('Packaged Gidget runtime loaded but did not generate a response.');
    console.log(`Packaged Gidget generated: ${String(answer).trim()}`);
    await context.dispose();
    await model.dispose();
    console.log('Packaged Gidget GGUF model loaded.');
  }
  await llama.dispose();
  if (resultPath) fs.writeFileSync(resultPath, 'ok', 'utf8');
  console.log('Packaged Gidget native runtime initialized.');
}

async function fail(error) {
  if (resultPath) fs.writeFileSync(resultPath, String(error?.stack || error), 'utf8');
  console.error(error);
  process.exitCode = 1;
}

if (electron?.app?.whenReady) {
  electron.app.whenReady().then(run).catch(fail).finally(() => electron.app.exit(process.exitCode || 0));
} else {
  run().catch(fail);
}
