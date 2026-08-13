const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow } = require('electron');

const PORT = 5197;
const ROOT = path.resolve(__dirname, '..');
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WINDOWS = [
  'newWorkOrder', 'newSale', 'calendar', 'journal', 'dailyLook', 'clockIn',
  'quoteGenerator', 'eod', 'products', 'inventory', 'vendors',
  'workOrderRepairPicker', 'addClient', 'customerOverview', 'customerSearch',
  'diagnosticTools', 'quickSale', 'consultation', 'checkout', 'devMenu',
  'dataTools', 'reporting', 'reportEmail', 'charts', 'notifications',
  'notificationSettings', 'releaseForm', 'customerReceipt', 'consultSheet',
  'productForm', 'backup', 'clearDb', 'repairCategories', 'deviceCategories',
  'customBuildItem', 'technicians', 'feedback', 'gameMenu',
];
const ORIENTATIONS = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
];

function waitForServer(timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const request = http.get(`${BASE_URL}/mobile.html`, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) resolve();
        else retry();
      });
      request.on('error', retry);
      request.setTimeout(1000, () => request.destroy());
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error('Timed out waiting for the mobile preview server.'));
      else setTimeout(poll, 200);
    };
    poll();
  });
}

function startVite() {
  const node = process.env.npm_node_execpath || 'node';
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  return spawn(node, [vite, '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

async function inspectWindow(win, type, orientation) {
  const runtimeErrors = [];
  const consoleHandler = (_event, level, message) => {
    if (level >= 3 && !/Browserslist|favicon/i.test(message)) runtimeErrors.push(message);
  };
  win.webContents.on('console-message', consoleHandler);
  await win.setContentSize(orientation.width, orientation.height);
  await win.loadURL(`${BASE_URL}/mobile.html?mobileWindowPreview=${encodeURIComponent(type)}`);
  await new Promise((resolve) => setTimeout(resolve, 425));

  const layout = await win.webContents.executeJavaScript(`(() => {
    const shell = document.querySelector('.mobile-modal-shell');
    const content = document.querySelector('.mobile-modal-content');
    const close = shell?.querySelector('.mobile-modal-bar button[aria-label="Close window"]');
    const shellRect = shell?.getBoundingClientRect();
    const closeRect = close?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const overflowCandidates = contentRect ? Array.from(content.querySelectorAll('*')).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, className: String(element.className || '').slice(0, 100), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
    }).filter((entry) => entry.right > contentRect.right + 3 || entry.left < contentRect.left - 3).slice(0, 8) : [];
    return {
      shell: Boolean(shell),
      content: Boolean(content),
      unknown: document.body.textContent.includes('Unknown window:'),
      uncaught: document.body.textContent.includes('Uncaught error:'),
      bodyOverflow: document.documentElement.scrollWidth > window.innerWidth + 3,
      contentOverflow: Boolean(content && content.scrollWidth > content.clientWidth + 3),
      shellFits: Boolean(shellRect && shellRect.left >= -2 && shellRect.right <= window.innerWidth + 2 && shellRect.top >= -2 && shellRect.bottom <= window.innerHeight + 2),
      closeVisible: Boolean(closeRect && closeRect.width >= 32 && closeRect.height >= 32 && closeRect.right <= window.innerWidth + 2),
      interactive: content?.querySelectorAll('button, input, select, textarea, a[href]').length || 0,
      overflowCandidates,
    };
  })()`);

  assert.equal(layout.shell, true, `${type} (${orientation.name}) did not render its mobile window shell.`);
  assert.equal(layout.content, true, `${type} (${orientation.name}) did not render mobile content.`);
  assert.equal(layout.unknown, false, `${type} (${orientation.name}) mapped to an unknown window.`);
  assert.equal(layout.uncaught, false, `${type} (${orientation.name}) rendered an uncaught-error screen.`);
  assert.equal(layout.bodyOverflow, false, `${type} (${orientation.name}) overflowed the app viewport horizontally.`);
  assert.equal(layout.contentOverflow, false, `${type} (${orientation.name}) contains clipped horizontal content: ${JSON.stringify(layout.overflowCandidates)}`);
  assert.equal(layout.shellFits, true, `${type} (${orientation.name}) escaped the mobile viewport.`);
  assert.equal(layout.closeVisible, true, `${type} (${orientation.name}) hid its close control.`);
  assert.equal(runtimeErrors.length, 0, `${type} (${orientation.name}) logged errors: ${runtimeErrors.join(' | ')}`);

  if (type === 'calendar') {
    const opened = await win.webContents.executeJavaScript(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((entry) => entry.textContent.trim() === 'Settings');
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(opened, true, `Calendar Settings button was missing in ${orientation.name}.`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const settings = await win.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('.gb-calendar-settings-dialog');
      const body = dialog?.querySelector('.gb-calendar-settings-body');
      const close = dialog?.querySelector('button[aria-label="Close calendar settings"]');
      const footer = dialog?.querySelector('.gb-calendar-settings-footer');
      const rect = dialog?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const dialogStyle = dialog ? getComputedStyle(dialog) : null;
      const footerStyle = footer ? getComputedStyle(footer) : null;
      const childRects = dialog ? Array.from(dialog.children).map((child) => { const childRect = child.getBoundingClientRect(); return { className: child.className, left: childRect.left, right: childRect.right, top: childRect.top, bottom: childRect.bottom }; }) : [];
      return {
        visible: Boolean(dialog && rect && rect.width > 300 && rect.height > 180),
        fits: Boolean(rect && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2),
        scrollable: Boolean(body && body.scrollHeight > 0 && getComputedStyle(body).overflowY === 'auto'),
        noHorizontalClip: Boolean(body && body.scrollWidth <= body.clientWidth + 3),
        closeVisible: Boolean(close && close.getBoundingClientRect().width >= 32),
        footerVisible: Boolean(footerRect && rect && footerRect.left >= rect.left - 2 && footerRect.right <= rect.right + 2 && footerRect.bottom <= rect.bottom + 2),
        colorControls: dialog?.querySelectorAll('input[type="color"]').length || 0,
        businessControls: dialog?.querySelectorAll('.gb-business-calendar-options input[type="checkbox"]').length || 0,
        dialogRect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null,
        footerRect: footerRect ? { left: footerRect.left, right: footerRect.right, top: footerRect.top, bottom: footerRect.bottom } : null,
        dialogStyle: dialogStyle ? { display: dialogStyle.display, flexDirection: dialogStyle.flexDirection } : null,
        footerStyle: footerStyle ? { position: footerStyle.position, width: footerStyle.width, marginLeft: footerStyle.marginLeft, transform: footerStyle.transform } : null,
        childRects,
      };
    })()`);
    assert.equal(settings.visible, true, `Calendar Settings did not become visible in ${orientation.name}.`);
    assert.equal(settings.fits, true, `Calendar Settings escaped the viewport in ${orientation.name}.`);
    assert.equal(settings.scrollable, true, `Calendar Settings content was not scrollable in ${orientation.name}.`);
    assert.equal(settings.noHorizontalClip, true, `Calendar Settings content clipped horizontally in ${orientation.name}.`);
    assert.equal(settings.closeVisible, true, `Calendar Settings close control was not usable in ${orientation.name}.`);
    assert.equal(settings.footerVisible, true, `Calendar Settings actions were not visible in ${orientation.name}: ${JSON.stringify(settings)}`);
    assert.ok(settings.colorControls >= 6, `Calendar Settings color controls did not load in ${orientation.name}.`);
    assert.ok(settings.businessControls >= 3, `Calendar Settings business options did not load in ${orientation.name}.`);
    const saved = await win.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('.gb-calendar-settings-dialog');
      const save = Array.from(dialog?.querySelectorAll('button') || []).find((entry) => entry.textContent.trim().toLowerCase().startsWith('save'));
      save?.click();
      return Boolean(save);
    })()`);
    assert.equal(saved, true, `Calendar Settings Save action was missing in ${orientation.name}.`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const stillOpen = await win.webContents.executeJavaScript(`Boolean(document.querySelector('.gb-calendar-settings-dialog'))`);
    assert.equal(stillOpen, false, `Calendar Settings did not close after Save in ${orientation.name}.`);
  }

  win.webContents.removeListener('console-message', consoleHandler);
}

async function run() {
  const vite = startVite();
  let viteOutput = '';
  vite.stdout.on('data', (chunk) => { viteOutput += String(chunk); });
  vite.stderr.on('data', (chunk) => { viteOutput += String(chunk); });
  try {
    await waitForServer();
    const win = new BrowserWindow({
      show: false,
      width: 390,
      height: 844,
      useContentSize: true,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    for (const orientation of ORIENTATIONS) {
      for (const type of WINDOWS) await inspectWindow(win, type, orientation);
    }
    win.destroy();
    console.log(`Mobile window layout checks passed for ${WINDOWS.length} windows in portrait and landscape.`);
  } catch (error) {
    if (viteOutput.trim()) console.error(viteOutput.trim());
    throw error;
  } finally {
    vite.kill();
  }
}

app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
