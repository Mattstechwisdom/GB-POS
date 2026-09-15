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
  const receiptMode = process.env.QR_PRINT_RUNTIME_KIND === 'receipt';
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
    const payload = encodeURIComponent(JSON.stringify({ id: receiptMode ? 0 : 4321, workOrderId: receiptMode ? 0 : 4321, customerName: 'Runtime Test', productCategory: 'Console', productDescription: 'Test Device', partEta:'', payments:[{at:'invalid legacy date',applied:45,paymentType:'Cash'}] }));
    const url = `${pathToFileURL(path.resolve(__dirname, '..', 'dist', 'index.html')).href}?${receiptMode ? 'customerReceipt' : 'releaseForm'}=${payload}${receiptMode ? '&autoPrint=1' : ''}`;
    await win.loadURL(url);
    await win.webContents.executeJavaScript(`window.print = () => { document.documentElement.dataset.releaseFormPrintCalled = 'true'; }; true;`);

    await new Promise(resolve => setTimeout(resolve, 100));
    const printedEarly = await win.webContents.executeJavaScript(`document.documentElement.dataset.releaseFormPrintCalled === 'true'`);
    if (!receiptMode) assert.equal(printedEarly, false, 'Release form printed before the delayed QR response arrived.');

    const rendered = await waitFor(() => win.webContents.executeJavaScript(`(() => {
      const qr = document.querySelector('img[alt="${receiptMode ? 'Google Review QR' : 'Tech Status QR'}"]');
      return !!qr && qr.complete && qr.naturalWidth > 0 && qr.src.startsWith('data:image/png')
        && document.documentElement.dataset.releaseFormPrintCalled === 'true';
    })()`));
    assert.equal(rendered, true);
    assert.equal(qrRequested, !receiptMode, 'Customer receipts must not request internal status URLs.');
    if (receiptMode) {
      const expectedQr = await require('qrcode').toDataURL('https://search.google.com/local/writereview?placeid=ChIJq5X1V5i7-IgR_P2o34Acjaw', { width: 176, margin: 1, color: { dark: '#000000', light: '#ffffff' }, errorCorrectionLevel: 'M' });
      const actualQr = await win.webContents.executeJavaScript(`document.querySelector('img[alt="Google Review QR"]').getAttribute('src')`);
      const { nativeImage } = require('electron');
      assert.deepEqual(nativeImage.createFromDataURL(actualQr).toBitmap(), nativeImage.createFromDataURL(expectedQr).toBitmap(), 'Printed QR pixels must encode the shop Google Review URL.');
      assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.brand-center').textContent.trim()`), 'SCAN ME');
    }
    console.log(`${receiptMode ? 'Customer receipt' : 'Release-form'} runtime rendered and decoded its QR before printing.`);
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
