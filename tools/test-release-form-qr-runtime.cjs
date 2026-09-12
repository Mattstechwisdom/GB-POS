const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain } = require('electron');

async function waitFor(check, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out after ${timeoutMs}ms.`);
}

app.whenReady().then(async () => {
  let qrRequested = false;
  ipcMain.handle('app:getInfo', () => ({ version: 'runtime-test', platform: process.platform }));
  ipcMain.handle('db-find', () => []);
  ipcMain.handle('db-get', () => []);
  ipcMain.handle('qr:getStatusUrl', async (_event, type, id) => {
    qrRequested = true;
    assert.equal(type, 'repair');
    assert.equal(id, 4321);
    await new Promise(resolve => setTimeout(resolve, 300));
    return { ok: true, url: 'https://example.com/public-repair-status/4321' };
  });

  const win = new BrowserWindow({
    show: false,
    width: 850,
    height: 1100,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.resolve(__dirname, '..', 'dist-main', 'app', 'electron', 'preload.js'),
    },
  });

  try {
    const payload = encodeURIComponent(JSON.stringify({ id: 4321, workOrderId: 4321, customerName: 'Runtime Test', productCategory: 'Console', productDescription: 'Test Device' }));
    const url = `${pathToFileURL(path.resolve(__dirname, '..', 'dist', 'index.html')).href}?releaseForm=${payload}`;
    await win.loadURL(url);
    await win.webContents.executeJavaScript(`window.print = () => { document.documentElement.dataset.releaseFormPrintCalled = 'true'; }; true;`);

    await new Promise(resolve => setTimeout(resolve, 100));
    const printedEarly = await win.webContents.executeJavaScript(`document.documentElement.dataset.releaseFormPrintCalled === 'true'`);
    assert.equal(printedEarly, false, 'Release form printed before the delayed QR response arrived.');

    const rendered = await waitFor(() => win.webContents.executeJavaScript(`(() => {
      const qr = document.querySelector('img[alt="Tech Status QR"]');
      return !!qr && qr.complete && qr.naturalWidth > 0 && qr.src.startsWith('data:image/png')
        && document.documentElement.dataset.releaseFormPrintCalled === 'true';
    })()`));
    assert.equal(rendered, true);
    assert.equal(qrRequested, true);
    console.log('Release-form runtime rendered and decoded its QR before printing.');
  } finally {
    try { ipcMain.removeHandler('qr:getStatusUrl'); } catch {}
    try { ipcMain.removeHandler('app:getInfo'); } catch {}
    try { ipcMain.removeHandler('db-find'); } catch {}
    try { ipcMain.removeHandler('db-get'); } catch {}
    if (!win.isDestroyed()) win.destroy();
    app.quit();
  }
}).catch(error => {
  console.error(error);
  app.exit(1);
});
