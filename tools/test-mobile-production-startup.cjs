const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const ROOT = path.resolve(__dirname, '..', 'dist-mobile');
const CONTENT_TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestPath = decodeURIComponent(String(request.url || '/').split('?')[0]);
      const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
      const filePath = path.resolve(ROOT, relativePath);
      if (!filePath.startsWith(ROOT)) {
        response.writeHead(403).end();
        return;
      }
      fs.readFile(filePath, (error, body) => {
        if (error) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream' });
        response.end(body);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  assert.equal(fs.existsSync(path.join(ROOT, 'index.html')), true, 'Build the mobile production bundle before running this test.');
  const server = await startServer();
  const address = server.address();
  const runtimeErrors = [];
  const window = new BrowserWindow({
    show: false,
    width: 390,
    height: 844,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3 && !/favicon|Browserslist/i.test(message)) runtimeErrors.push(message);
  });
  window.webContents.on('render-process-gone', (_event, details) => runtimeErrors.push(`Renderer exited: ${details.reason}`));

  try {
    await window.loadURL(`http://127.0.0.1:${address.port}/index.html`);
    await new Promise(resolve => setTimeout(resolve, 2_000));
    const state = await window.webContents.executeJavaScript(`(() => ({
      text: document.body.innerText,
      rootChildren: document.getElementById('root')?.childElementCount || 0,
      startupFailed: document.getElementById('gbpos-initial-loader')?.dataset.error === 'true',
    }))()`);
    assert.ok(state.rootChildren > 0, 'The mobile production bundle left an empty root element.');
    assert.equal(state.startupFailed, false, `The mobile startup fail-safe reported an error: ${state.text}`);
    assert.match(state.text, /Sign in|Checking login|Connecting to Supabase|GADGETBOY POS/i, 'The mobile app did not reach a visible startup state.');
    assert.deepEqual(runtimeErrors, [], `The mobile production bundle logged startup errors: ${runtimeErrors.join(' | ')}`);
    console.log('Mobile production startup check passed.');
  } finally {
    window.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}

app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
