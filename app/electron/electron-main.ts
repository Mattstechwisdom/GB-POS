const electron = require('electron');
const { app, BrowserWindow, ipcMain, shell, dialog, Menu, safeStorage } = electron;
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// -------------------------------------------------------------
// Startup crash logging (helps diagnose packaged SyntaxError)
// -------------------------------------------------------------
function safeGetUserDataPath(): string {
  try {
    return app.getPath('userData');
  } catch {
    // Fallback: best-effort relative folder
    return path.join(process.cwd(), 'userData');
  }
}

function appendStartupLog(line: string) {
  try {
    const dir = safeGetUserDataPath();
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const logPath = path.join(dir, 'gbpos-startup.log');
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`, 'utf-8');
  } catch {
    // ignore
  }
}

function setupStartupCrashLogging() {
  // Capture the most common “Uncaught exception / SyntaxError” details.
  try {
    appendStartupLog('--- app start ---');
    appendStartupLog(`versions node=${process.versions?.node} electron=${process.versions?.electron} chrome=${process.versions?.chrome}`);

    process.on('uncaughtException', (err: any) => {
      try {
        const msg = err?.stack || err?.message || String(err);
        appendStartupLog(`uncaughtException: ${msg}`);
      } catch {}
    });

    process.on('unhandledRejection', (reason: any) => {
      try {
        const msg = reason?.stack || reason?.message || String(reason);
        appendStartupLog(`unhandledRejection: ${msg}`);
      } catch {}
    });
  } catch {
    // ignore
  }
}

setupStartupCrashLogging();

// Determine dev mode early so it is available for handlers
const isDev = !app.isPackaged;
// Control whether DevTools auto-open. Disable by default to avoid noisy DevTools protocol warnings (e.g., Autofill.enable)
const OPEN_MAIN_DEVTOOLS = process.env.OPEN_MAIN_DEVTOOLS === '1';
const OPEN_CHILD_DEVTOOLS = process.env.OPEN_CHILD_DEVTOOLS === '1';

// Silence Electron security warnings in development to avoid the dev popup/console banner
if (!app.isPackaged && process.env.ELECTRON_DISABLE_SECURITY_WARNINGS !== 'true') {
  // Note: Keep contextIsolation true and nodeIntegration false (already configured) for safety
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

// Central dev server base (adjust here if port changes)
const DEV_SERVER_URL = 'http://localhost:5173';

function normalizeVersion(v: string): string {
  return String(v || '0.0.0').trim().replace(/^v/i, '');
}

function compareVersions(aRaw: string, bRaw: string): number {
  const a = normalizeVersion(aRaw).split(/[.+-]/)[0].split('.').map((x) => parseInt(x, 10));
  const b = normalizeVersion(bRaw).split(/[.+-]/)[0].split('.').map((x) => parseInt(x, 10));
  for (let i = 0; i < 3; i += 1) {
    const av = Number.isFinite(a[i]) ? a[i] : 0;
    const bv = Number.isFinite(b[i]) ? b[i] : 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function readUpdateConfig(): { skippedVersion?: string } {
  try {
    const p = path.join(app.getPath('userData'), 'update-config.json');
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf-8');
    const json = JSON.parse(raw);
    return json && typeof json === 'object' ? json : {};
  } catch {
    return {};
  }
}

function writeUpdateConfig(cfg: { skippedVersion?: string }) {
  try {
    const p = path.join(app.getPath('userData'), 'update-config.json');
    fs.writeFileSync(p, JSON.stringify(cfg || {}, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

// -------------------------------------------------------------
// Email (Company sender via SMTP)
// -------------------------------------------------------------
function emailConfigPath(): string {
  return path.join(app.getPath('userData'), 'email-config.json');
}

function readEmailConfig(): any {
  try {
    const p = emailConfigPath();
    if (!fs.existsSync(p)) return { fromEmail: 'gadgetboysc@gmail.com', fromName: 'GadgetBoy Repair & Retail' };
    const raw = fs.readFileSync(p, 'utf-8');
    const json = JSON.parse(raw);
    if (!json || typeof json !== 'object') return { fromEmail: 'gadgetboysc@gmail.com', fromName: 'GadgetBoy Repair & Retail' };
    return {
      fromEmail: json.fromEmail || 'gadgetboysc@gmail.com',
      fromName: json.fromName || 'GadgetBoy Repair & Retail',
      // Stored encrypted (base64)
      gmailAppPasswordEnc: json.gmailAppPasswordEnc || null,
    };
  } catch {
    return { fromEmail: 'gadgetboysc@gmail.com', fromName: 'GadgetBoy Repair & Retail' };
  }
}

function writeEmailConfig(cfg: any) {
  try {
    const p = emailConfigPath();
    fs.writeFileSync(p, JSON.stringify(cfg || {}, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

function decryptAppPassword(cfg: any): string | null {
  try {
    const enc = cfg?.gmailAppPasswordEnc;
    if (!enc || typeof enc !== 'string') return null;
    const buf = Buffer.from(enc, 'base64');
    if (safeStorage && typeof safeStorage.decryptString === 'function') {
      return safeStorage.decryptString(buf);
    }
    return null;
  } catch {
    return null;
  }
}

function broadcastUpdateEvent(payload: any) {
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      try { w.webContents.send('update:event', payload); } catch {}
    }
  } catch {
    // ignore
  }
}

function setupAutoUpdater() {
  try {
    // electron-updater uses electron-builder publish config in packaged builds.
    autoUpdater.autoDownload = false;
    autoUpdater.on('checking-for-update', () => broadcastUpdateEvent({ kind: 'checking' }));
    autoUpdater.on('update-available', (info: any) => broadcastUpdateEvent({
      kind: 'available',
      version: info?.version,
      releaseName: info?.releaseName,
      releaseNotes: info?.releaseNotes,
    }));
    autoUpdater.on('update-not-available', (info: any) => broadcastUpdateEvent({ kind: 'not-available', version: info?.version }));
    autoUpdater.on('download-progress', (p: any) => broadcastUpdateEvent({
      kind: 'progress',
      percent: p?.percent,
      transferred: p?.transferred,
      total: p?.total,
      bytesPerSecond: p?.bytesPerSecond,
    }));
    autoUpdater.on('update-downloaded', (info: any) => broadcastUpdateEvent({
      kind: 'downloaded',
      version: info?.version,
      releaseName: info?.releaseName,
    }));
    autoUpdater.on('error', (err: any) => broadcastUpdateEvent({ kind: 'error', message: String(err?.message || err) }));
  } catch (e) {
    // ignore
  }
}

function getWindowIconPath(): string | undefined {
  try {
    const devCandidate = path.join(process.cwd(), 'build', 'icon.ico');
    const resourcesPath = (process as any).resourcesPath || app.getAppPath();
    const prodCandidate = path.join(resourcesPath, 'build', 'icon.ico');
    const candidate = app.isPackaged ? prodCandidate : devCandidate;
    if (candidate && fs.existsSync(candidate)) return candidate;
  } catch (_e) {
    // ignore
  }
  return undefined;
}

const WINDOW_ICON = getWindowIconPath();

// Helper: center a window either over its parent (if any) or the active screen
function centerWindow(win: any) {
  try {
    const parent = typeof win.getParentWindow === 'function' ? win.getParentWindow() : null;
    if (parent) {
      const pb = parent.getBounds();
      const wb = win.getBounds();
      const x = Math.max(pb.x + Math.round((pb.width - wb.width) / 2), 0);
      const y = Math.max(pb.y + Math.round((pb.height - wb.height) / 2), 0);
      win.setPosition(x, y);
    } else {
      // Fallback to Electron's built-in centering on the active display
      if (typeof win.center === 'function') win.center();
    }
  } catch (_e) {
    // best-effort; ignore positioning errors
  }
}

// Global context menu: enable Cut/Copy/Paste/Select All and Inspect (dev)
function setupContextMenu(win: typeof BrowserWindow.prototype) {
  try {
    win.webContents.on('context-menu', (event: any, params: any) => {
      const { isEditable, selectionText } = params || {};
      const template: any[] = [];
      if (isEditable) {
        template.push(
          { role: 'cut', label: 'Cut' },
          { role: 'copy', label: 'Copy' },
          { role: 'paste', label: 'Paste' },
          { type: 'separator' },
          { role: 'selectAll', label: 'Select All' },
        );
      } else {
        if (selectionText && String(selectionText).trim().length) {
          template.push({ role: 'copy', label: 'Copy' });
        }
        template.push({ role: 'selectAll', label: 'Select All' });
      }
      if (template.length && isDev) {
        template.push({ type: 'separator' });
      }
      if (isDev) {
        template.push({ label: 'Inspect Element', click: () => { try { win.webContents.inspectElement(params.x, params.y); } catch {} } });
      }
      if (!template.length) return;
      const menu = Menu.buildFromTemplate(template);
      const x = typeof params?.x === 'number' ? params.x : undefined;
      const y = typeof params?.y === 'number' ? params.y : undefined;
      // On Windows, omitting x/y can cause the first popup to appear at (0,0).
      if (typeof x === 'number' && typeof y === 'number') menu.popup({ window: win, x, y });
      else menu.popup({ window: win });
    });
  } catch {}
}

// Application menu: enables standard keyboard shortcuts (Undo/Redo/Cut/Copy/Paste, etc.)
function setupApplicationMenu() {
  try {
    const isMac = process.platform === 'darwin';
    const template: any[] = [];

    if (isMac) {
      template.push({
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      });
    }

    // Edit menu provides the accelerators for Ctrl/Cmd + C/V, etc.
    template.push({
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    });

    // Keep a minimal View menu for dev convenience; hidden menu still enables accelerators
    template.push({
      label: 'View',
      submenu: [
        { role: 'reload', visible: isDev },
        { role: 'forceReload', visible: isDev },
        { role: 'toggleDevTools', visible: isDev },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    });

    template.push({
      label: 'Window',
      submenu: isMac
        ? [ { role: 'minimize' }, { role: 'zoom' }, { role: 'close' } ]
        : [ { role: 'minimize' }, { role: 'close' } ],
    });

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  } catch {
    // best effort; if menu fails, keyboard shortcuts might be limited
  }
}

app.on('browser-window-created', (_event: any, win: typeof BrowserWindow.prototype) => {
  setupContextMenu(win);
});

// IPC handler for promise-based repair picker (returns selected repair)
ipcMain.handle('pick-repair-item', async (_event: any) => {
  return new Promise((resolve) => {
    const child = new BrowserWindow({
      width: 1000,
      height: 620,
      resizable: true,
      parent: BrowserWindow.getAllWindows()[0] || undefined,
      modal: true,
      ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
      backgroundColor: '#18181b',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      },
      show: false,
      title: 'Add Repair to Work Order',
    });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
    const url = isDev
      ? `${DEV_SERVER_URL}/?workOrderRepairPicker=true`
      : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?workOrderRepairPicker=true`;
    child.loadURL(url);

    // Listen for repair-selected event from picker window
    const handler = (_event: any, repair: any) => {
      resolve(repair);
      child.close();
      ipcMain.off('repair-selected', handler);
    };
    ipcMain.on('repair-selected', handler);

    child.on('closed', () => {
      ipcMain.off('repair-selected', handler);
      resolve(null); // If closed without selection
    });
  });
});

// Forward 'repair-selected' from picker window to the first main window
ipcMain.on('repair-selected', (_event: any, repair: any) => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length > 0) {
    allWindows[0].webContents.send('repair-selected', repair);
    console.log('Sent repair-selected to first main window');
  } else {
    console.log('No main window found for repair-selected');
  }
});

// Open a file with the OS default application
ipcMain.handle('os:openFile', async (_e: any, filePath: string) => {
  try {
    if (!filePath) return { ok: false, error: 'No file path' };
    const res = await shell.openPath(String(filePath));
    if (res) return { ok: false, error: res };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// Open a URL in the user's default browser
ipcMain.handle('os:openUrl', async (_e: any, url: string) => {
  try {
    if (!url) return { ok: false, error: 'No URL' };
    const success = await shell.openExternal(String(url));
    // openExternal returns void in recent Electron, so assume success if no exception
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// -------------------------
// Email IPC
// -------------------------
ipcMain.handle('email:getConfig', async () => {
  try {
    const cfg = readEmailConfig();
    // Never return secrets to the renderer
    return {
      ok: true,
      fromEmail: cfg.fromEmail || 'gadgetboysc@gmail.com',
      fromName: cfg.fromName || 'GadgetBoy Repair & Retail',
      hasAppPassword: !!decryptAppPassword(cfg),
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('email:setGmailAppPassword', async (_e: any, appPassword: string, fromName?: string) => {
  try {
    const pass = String(appPassword || '').trim();
    if (!pass) return { ok: false, error: 'Missing app password' };
    if (!(safeStorage && typeof safeStorage.encryptString === 'function')) {
      return { ok: false, error: 'safeStorage not available on this system' };
    }
    const cfg = readEmailConfig();
    const encBuf = safeStorage.encryptString(pass);
    cfg.fromEmail = 'gadgetboysc@gmail.com';
    if (fromName != null) cfg.fromName = String(fromName || '').trim() || 'GadgetBoy Repair & Retail';
    cfg.gmailAppPasswordEnc = Buffer.from(encBuf).toString('base64');
    writeEmailConfig(cfg);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('email:setFromName', async (_e: any, fromName: string) => {
  try {
    const cfg = readEmailConfig();
    cfg.fromEmail = 'gadgetboysc@gmail.com';
    cfg.fromName = String(fromName || '').trim() || 'GadgetBoy Repair & Retail';
    writeEmailConfig(cfg);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('email:clearGmailAppPassword', async () => {
  try {
    const cfg = readEmailConfig();
    cfg.gmailAppPasswordEnc = null;
    writeEmailConfig(cfg);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('email:sendQuoteHtml', async (_e: any, payload: any) => {
  try {
    const cfg = readEmailConfig();
    const appPass = decryptAppPassword(cfg);
    if (!appPass) return { ok: false, error: 'Email not configured. Set Gmail App Password first.' };

    const to = String(payload?.to || '').trim();
    if (!to) return { ok: false, error: 'Missing recipient email' };
    const subject = String(payload?.subject || 'Gadgetboy Quote');
    const bodyText = String(payload?.bodyText || '');
    const htmlAttachment = String(payload?.html || '');
    if (!htmlAttachment) return { ok: false, error: 'Missing HTML attachment content' };
    const filename = String(payload?.filename || 'gadgetboy-quote.html').trim() || 'gadgetboy-quote.html';

    // Lazy require to keep startup fast
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'gadgetboysc@gmail.com',
        pass: appPass,
      },
    });

    const fromName = String(cfg.fromName || 'GadgetBoy Repair & Retail').trim() || 'GadgetBoy Repair & Retail';
    const from = `${fromName} <gadgetboysc@gmail.com>`;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: bodyText,
      attachments: [
        {
          filename,
          content: htmlAttachment,
          contentType: 'text/html; charset=utf-8',
        },
      ],
    });

    return { ok: true, messageId: info?.messageId || null };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// App info (used for update/version gating)
ipcMain.handle('app:getInfo', async () => {
  try {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    };
  } catch (e) {
    return {
      version: '0.0.0',
      platform: process.platform,
      arch: process.arch,
      error: String(e),
    };
  }
});

ipcMain.handle('update:check', async () => {
  try {
    const currentVersion = normalizeVersion(app.getVersion());
    if (!app.isPackaged) return { ok: true, notPackaged: true, updateAvailable: false, currentVersion };

    const cfg = readUpdateConfig();

    let latestVersion: string | undefined;
    let releaseName: string | undefined;
    let releaseNotes: any;
    try {
      const res = await autoUpdater.checkForUpdates();
      latestVersion = res?.updateInfo?.version ? normalizeVersion(res.updateInfo.version) : undefined;
      releaseName = res?.updateInfo?.releaseName;
      releaseNotes = res?.updateInfo?.releaseNotes;
    } catch (e: any) {
      // If publishing isn't configured or network is down, surface the error to the UI.
      return { ok: false, error: String(e?.message || e), currentVersion };
    }

    const updateAvailable = !!(latestVersion && compareVersions(currentVersion, latestVersion) < 0);
    const skipped = !!(updateAvailable && cfg?.skippedVersion && normalizeVersion(cfg.skippedVersion) === latestVersion);
    return {
      ok: true,
      currentVersion,
      latestVersion,
      updateAvailable: updateAvailable && !skipped,
      skippedVersion: cfg?.skippedVersion,
      releaseName,
      releaseNotes,
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('update:download', async () => {
  try {
    if (!app.isPackaged) return { ok: false, error: 'Updates are only available in the packaged app.' };
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('update:quitAndInstall', async () => {
  try {
    if (!app.isPackaged) return { ok: false, error: 'Updates are only available in the packaged app.' };
    // quits and installs immediately
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('update:skip', async (_e: any, version: string) => {
  try {
    if (!version) return { ok: false, error: 'Missing version' };
    const cfg = readUpdateConfig();
    cfg.skippedVersion = normalizeVersion(version);
    writeUpdateConfig(cfg);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// isDev already declared above

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'GadgetBoy POS',
  });
  win.once('ready-to-show', () => { try { win.maximize(); } catch {} win.show(); });
  if (isDev && OPEN_MAIN_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
  let url;
  if (isDev) {
    url = DEV_SERVER_URL;
  } else {
    // In production, load the bundled index.html from the app path
    url = `file://${path.join(app.getAppPath(), 'dist', 'index.html')}`;
  }
  win.loadURL(url);
  // After loading, check for ?newWorkOrder= in the URL and set the title
  win.webContents.on('did-finish-load', () => {
  win.webContents.executeJavaScript('window.location.search').then((search: string) => {
      if (search && search.includes('newWorkOrder=')) {
        win.setTitle('New Work Order');
      }
    });
  });
}

// Window fullscreen controls (renderer-triggered)
ipcMain.handle('window:getFullScreen', async (event: any) => {
  try { const w = BrowserWindow.fromWebContents(event.sender); return !!w?.isFullScreen(); } catch { return false; }
});
ipcMain.handle('window:setFullScreen', async (event: any, flag: boolean) => {
  try { const w = BrowserWindow.fromWebContents(event.sender); w?.setFullScreen(!!flag); return { ok: true, value: !!w?.isFullScreen() }; } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
});
ipcMain.handle('window:toggleFullScreen', async (event: any) => {
  try { const w = BrowserWindow.fromWebContents(event.sender); if (!w) return { ok: false, error: 'no-window' }; const next = !w.isFullScreen(); w.setFullScreen(next); return { ok: true, value: next }; } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
});
// Open Calendar window
ipcMain.handle('open-calendar', async () => {
  console.log('[IPC] open-calendar invoked');
  const { screen } = electron;
  const primary = screen.getPrimaryDisplay();
  const bounds = primary && primary.bounds ? primary.bounds : ({ x: 0, y: 0, width: 1920, height: 1080 } as any);
  const child = new BrowserWindow({
    x: (bounds as any).x ?? 0,
    y: (bounds as any).y ?? 0,
    width: Math.max(1400, (bounds as any).width ?? bounds.width),
    height: Math.max(900, (bounds as any).height ?? bounds.height),
    minWidth: Math.min(1200, (bounds as any).width ?? bounds.width),
    minHeight: Math.min(800, (bounds as any).height ?? bounds.height),
    useContentSize: true,
    resizable: true,
    maximizable: true,
    frame: true,
    parent: undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Calendar',
  });
  try { child.setFullScreen(false); } catch {}
  try { if (typeof child.setFullScreenable === 'function') child.setFullScreenable(true); } catch {}
  // Ensure bounds are set to full display bounds prior to showing
  try { child.setBounds({ x: (bounds as any).x ?? 0, y: (bounds as any).y ?? 0, width: (bounds as any).width, height: (bounds as any).height }); } catch {}
  // Show when ready; dev server might delay first paint
  child.once('ready-to-show', () => {
    try { child.setBounds({ x: (bounds as any).x ?? 0, y: (bounds as any).y ?? 0, width: (bounds as any).width, height: (bounds as any).height }); } catch {}
    try { child.maximize(); } catch {}
    child.show();
    try { child.focus(); } catch {}
  });
  child.on('show', () => { try { child.maximize(); child.focus(); } catch {} });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?calendar=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?calendar=true`;
  console.log('[Calendar] Loading URL:', url);
  child.loadURL(url).catch((e: any) => console.error('[Calendar] loadURL failed', e));
  return { ok: true };
});

// Open Backup (Data Management) window
ipcMain.handle('open-backup', async () => {
  const child = new BrowserWindow({
    width: 1100,
    height: 800,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Data Management',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?backup=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?backup=true`;
  child.loadURL(url);
  return { ok: true };
});

// Open Clock In window
ipcMain.handle('open-clock-in', async () => {
  console.log('[IPC] open-clock-in invoked');
  const child = new BrowserWindow({
    width: 900,
    height: 700,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Employee Clock In/Out',
  });
  // Center and show when ready; dev server might delay first paint
  child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?clockIn=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?clockIn=true`;
  console.log('[ClockIn] Loading URL:', url);
  child.loadURL(url).catch((e: any) => console.error('[ClockIn] loadURL failed', e));
  return { ok: true };
});

// Open Quote Generator window
ipcMain.handle('open-quote-generator', async () => {
  // If the quote generator is already open, focus it and reload in dev so UI changes appear immediately.
  try {
    const existing = BrowserWindow.getAllWindows().find((w: any) => {
      try { return String(w?.webContents?.getURL?.() || '').includes('quote=true'); } catch { return false; }
    });
    if (existing && !existing.isDestroyed()) {
      try { existing.show(); } catch {}
      try { existing.focus(); } catch {}
      try { if (isDev) existing.webContents.reloadIgnoringCache(); } catch {}
      return { ok: true, reused: true };
    }
  } catch {}

  const { screen } = electron;
  const primary = screen.getPrimaryDisplay();
  const bounds = primary && primary.bounds ? primary.bounds : ({ x: 0, y: 0, width: 1920, height: 1080 } as any);
  const child = new BrowserWindow({
    x: (bounds as any).x ?? 0,
    y: (bounds as any).y ?? 0,
    width: Math.max(1400, (bounds as any).width ?? bounds.width),
    height: Math.max(900, (bounds as any).height ?? bounds.height),
    minWidth: Math.min(1200, (bounds as any).width ?? bounds.width),
    minHeight: Math.min(800, (bounds as any).height ?? bounds.height),
    useContentSize: true,
    resizable: true,
    maximizable: true,
    frame: true,
    parent: undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Generate Quote',
  });
  try { child.setFullScreen(false); } catch {}
  try { if (typeof child.setFullScreenable === 'function') child.setFullScreenable(true); } catch {}
  // Ensure bounds are set to full display bounds prior to showing
  try { child.setBounds({ x: (bounds as any).x ?? 0, y: (bounds as any).y ?? 0, width: (bounds as any).width, height: (bounds as any).height }); } catch {}
  child.once('ready-to-show', () => {
    try { child.setBounds({ x: (bounds as any).x ?? 0, y: (bounds as any).y ?? 0, width: (bounds as any).width, height: (bounds as any).height }); } catch {}
    try { child.maximize(); } catch {}
    child.show();
    try { child.focus(); } catch {}
  });
  child.on('show', () => { try { child.maximize(); child.focus(); } catch {} });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev
    ? `${DEV_SERVER_URL}/?quote=true&t=${Date.now()}`
    : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?quote=true`;
  child.loadURL(url).catch((e: any) => console.error('[Quote] loadURL failed', e));
  return { ok: true };
});

// Simple JSON file DB stored in userData
const dbFile = path.join(app.getPath('userData'), 'gbpos-db.json');

function readDb() {
  try {
    if (!fs.existsSync(dbFile)) return { customers: [], workOrders: [] };
    const raw = fs.readFileSync(dbFile, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return { customers: [], workOrders: [] };
  }
}

// Simple atomic write with a tiny in-process queue to serialize writes
let writeQueue: Promise<void> = Promise.resolve();
function writeDb(db: any) {
  writeQueue = writeQueue.then(() => {
    const tmp = dbFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmp, dbFile);
  }).catch(() => { /* swallow to keep queue moving */ });
  return true;
}

ipcMain.handle('db-reset-all', async () => {
  const removed: string[] = [];
  const errors: string[] = [];

  // Ensure any pending writes finish before we remove files.
  try {
    await writeQueue;
  } catch {
    // ignore
  }
  writeQueue = Promise.resolve();

  function tryUnlink(p: string) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        removed.push(p);
      }
    } catch (e: any) {
      errors.push(`${p}: ${String(e?.message || e)}`);
    }
  }

  function tryRmDir(p: string) {
    try {
      if (fs.existsSync(p)) {
        // Node 14+ supports rmSync
        if (typeof (fs as any).rmSync === 'function') {
          (fs as any).rmSync(p, { recursive: true, force: true });
        } else {
          (fs as any).rmdirSync(p, { recursive: true });
        }
        removed.push(p);
      }
    } catch (e: any) {
      errors.push(`${p}: ${String(e?.message || e)}`);
    }
  }

  const userDataPath = app.getPath('userData');
  const backupsDir = path.join(userDataPath, 'backups');
  const backupConfigPath = path.join(userDataPath, 'backup-config.json');
  const updateConfigPath = path.join(userDataPath, 'update-config.json');

  // Primary database
  tryUnlink(dbFile);
  tryUnlink(dbFile + '.tmp');

  // Local configs/backups
  tryUnlink(backupConfigPath);
  tryUnlink(updateConfigPath);
  tryRmDir(backupsDir);

  // Notify renderers to refresh in case any window is open.
  try {
    const wins = BrowserWindow.getAllWindows();
    for (const w of wins) {
      try { w.webContents.send('customers:changed'); } catch {}
      try { w.webContents.send('workorders:changed'); } catch {}
      try { w.webContents.send('sales:changed'); } catch {}
      try { w.webContents.send('technicians:changed'); } catch {}
      try { w.webContents.send('deviceCategories:changed'); } catch {}
      try { w.webContents.send('productCategories:changed'); } catch {}
      try { w.webContents.send('products:changed'); } catch {}
      try { w.webContents.send('partSources:changed'); } catch {}
      try { w.webContents.send('calendarEvents:changed'); } catch {}
      try { w.webContents.send('timeEntries:changed'); } catch {}
    }
  } catch {
    // ignore
  }

  return { ok: errors.length === 0, removed, errors, userDataPath };
});

ipcMain.handle('db-get', async (_e: any, key: string) => {
  const db = readDb();
  return db[key] || [];
});

ipcMain.handle('db-add', async (_e: any, key: string, item: any) => {
  console.log('[DB-ADD] Key:', key, 'Incoming item:', item);
  const db = readDb();
  db[key] = db[key] || [];
  // Assign global invoice id sequence (strictly increasing by entry time) for workOrders and sales
  if (key === 'workOrders' || key === 'sales') {
    // Initialize invoiceSeq if missing by scanning both collections
    if (typeof (db as any).invoiceSeq !== 'number' || !Number.isFinite((db as any).invoiceSeq)) {
      const wo = Array.isArray(db['workOrders']) ? db['workOrders'] : [];
      const sa = Array.isArray(db['sales']) ? db['sales'] : [];
      const max = [...wo, ...sa].reduce((m: number, it: any) => Math.max(m, it?.id || 0), 0);
      (db as any).invoiceSeq = max;
    }
    // Always override incoming id to prevent duplicates
    (db as any).invoiceSeq = ((db as any).invoiceSeq || 0) + 1;
    item.id = (db as any).invoiceSeq;
  } else {
    // For other collections, assign incremental id per-collection if missing
    if (!item.id) {
      const max = db[key].reduce((m: number, it: any) => Math.max(m, it.id || 0), 0);
      item.id = max + 1;
      console.log('[DB-ADD] Assigned new ID:', item.id, 'for', key);
    }
  }
  db[key].push(item);
  console.log('[DB-ADD] Final item being added:', item);
  const ok = writeDb(db);
  if (ok) {
    if (key === 'workOrders') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('workorders:changed'));
    } else if (key === 'customers') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('customers:changed'));
    } else if (key === 'sales') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('sales:changed'));
    } else if (key === 'deviceCategories') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('deviceCategories:changed'));
    } else if (key === 'productCategories') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('productCategories:changed'));
    } else if (key === 'products') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('products:changed'));
    } else if (key === 'partSources') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('partSources:changed'));
    } else if (key === 'technicians') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('technicians:changed'));
    } else if (key === 'calendarEvents') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('calendarEvents:changed'));
    } else if (key === 'timeEntries') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('timeEntries:changed'));
    }
    return item;
  }
  return null;
});

ipcMain.handle('db-find', async (_e: any, key: string, q: any) => {
  const db = readDb();
  const list = db[key] || [];
  // naive filter: check if any provided field is included (case-insensitive)
  return list.filter((it: any) => {
    for (const k of Object.keys(q || {})) {
      const v = (q[k] || '').toString().toLowerCase();
      if (!v) continue;
      const val = ((it[k] || '')).toString().toLowerCase();
      if (!val.includes(v)) return false;
    }
    return true;
  });
});

ipcMain.handle('db-update', async (_e: any, key: string, a: any, b?: any) => {
  // Support both forms: (key, item) and (key, id, item)
  const incomingItem = (typeof b !== 'undefined') ? b : a;
  console.log('[DB-UPDATE] Key:', key, 'ID:', (typeof b !== 'undefined') ? a : (incomingItem?.id), 'Data:', incomingItem);
  const db = readDb();
  db[key] = db[key] || [];
  const targetId = (typeof b !== 'undefined') ? a : (incomingItem?.id);
  
  // Handle both string and numeric IDs properly
  console.log('[DB-UPDATE] Target ID:', targetId, 'Type:', typeof targetId);
  
  const idx = db[key].findIndex((it: any) => {
    console.log('[DB-UPDATE] Comparing item ID:', it.id, 'type:', typeof it.id, 'with target:', targetId, 'type:', typeof targetId);
    console.log('[DB-UPDATE] Direct comparison:', it.id === targetId);
    
    // First try exact string/value comparison
    if (it.id === targetId) return true;
    // Then try numeric comparison for numeric IDs
    if (typeof it.id === 'number' && typeof targetId === 'number') {
      return it.id === targetId;
    }
    // Try numeric comparison if both can be converted to numbers
    const itemIdNum = Number(it.id);
    const targetIdNum = Number(targetId);
    if (!isNaN(itemIdNum) && !isNaN(targetIdNum)) {
      return itemIdNum === targetIdNum;
    }
    return false;
  });
  console.log('[DB-UPDATE] Found index:', idx, 'for ID:', targetId);
  if (idx === -1) return null;
  const updatedItem = { ...db[key][idx], ...incomingItem, id: targetId, updatedAt: new Date().toISOString() };
  console.log('[DB-UPDATE] Updated item:', updatedItem);
  db[key][idx] = updatedItem;
  const ok = writeDb(db);
  console.log('[DB-UPDATE] Write success:', ok);
  if (ok) {
    if (key === 'workOrders') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('workorders:changed'));
    } else if (key === 'customers') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('customers:changed'));
    } else if (key === 'sales') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('sales:changed'));
    } else if (key === 'deviceCategories') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('deviceCategories:changed'));
    } else if (key === 'productCategories') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('productCategories:changed'));
    } else if (key === 'products') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('products:changed'));
    } else if (key === 'partSources') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('partSources:changed'));
    } else if (key === 'technicians') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('technicians:changed'));
    } else if (key === 'calendarEvents') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('calendarEvents:changed'));
    } else if (key === 'timeEntries') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('timeEntries:changed'));
    }
    return db[key][idx];
  }
  return null;
});


ipcMain.handle('db-delete', async (_e: any, key: string, id: any) => {
  console.log('[DB-DELETE] Key:', key, 'ID:', id, 'Type:', typeof id);
  const db = readDb();
  db[key] = db[key] || [];
  console.log('[DB-DELETE] Available items in', key, ':', db[key].map((item: any) => ({ id: item.id, type: typeof item.id })));
  // Try exact match first (handles string IDs)
  let idx = db[key].findIndex((it: any) => it.id === id);
  if (idx === -1) {
    // Fallback to numeric comparison when both sides are numeric-like
    const target = Number(id);
    if (!Number.isNaN(target)) {
      idx = db[key].findIndex((it: any) => {
        const n = Number(it.id);
        return !Number.isNaN(n) && n === target;
      });
    }
  }
  console.log('[DB-DELETE] Found index:', idx);
  if (idx === -1) return false;
  db[key].splice(idx, 1);
  const ok = writeDb(db);
  console.log('[DB-DELETE] Write success:', ok);
  if (ok) {
    if (key === 'workOrders') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('workorders:changed'));
    } else if (key === 'customers') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('customers:changed'));
    } else if (key === 'sales') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('sales:changed'));
    } else if (key === 'deviceCategories') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('deviceCategories:changed'));
    } else if (key === 'productCategories') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('productCategories:changed'));
    } else if (key === 'products') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('products:changed'));
    } else if (key === 'partSources') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('partSources:changed'));
    } else if (key === 'technicians') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('technicians:changed'));
    } else if (key === 'calendarEvents') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('calendarEvents:changed'));
    } else if (key === 'timeEntries') {
      BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => w.webContents.send('timeEntries:changed'));
    }
  }
  return ok;
});

// Open Products window
ipcMain.handle('open-products', async () => {
  const child = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 720,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Products',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?products=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?products=true`;
  child.loadURL(url);
  return { ok: true };
});

// --- Dev Menu handlers ---
ipcMain.handle('open-dev-menu', async () => {
  const child = new BrowserWindow({
    width: 900,
    height: 700,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Dev Menu',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?devMenu=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?devMenu=true`;
  child.loadURL(url);
  return { ok: true };
});

ipcMain.handle('dev:openUserDataFolder', async () => {
  const folder = app.getPath('userData');
  try {
    await shell.openPath(folder);
    return { ok: true, folder };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), folder };
  }
});

ipcMain.handle('dev:backupDb', async () => {
  try {
    const userData = app.getPath('userData');
    const backupsDir = path.join(userData, 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    const ts = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    const backupPath = path.join(backupsDir, `gbpos-db-backup-${stamp}.json`);
    if (fs.existsSync(dbFile)) {
      fs.copyFileSync(dbFile, backupPath);
      return { ok: true, backupPath };
    } else {
      // create empty db backup to mark point-in-time
      fs.writeFileSync(backupPath, JSON.stringify(readDb(), null, 2), 'utf-8');
      return { ok: true, backupPath, note: 'source db did not exist, wrote snapshot of current in-memory view' };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Export full database to a user-selected file
ipcMain.handle('backup:export', async () => {
  try {
    const ts = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    // MMDDYY HHMMSS (12-hour)
    const mm = pad(ts.getMonth() + 1);
    const dd = pad(ts.getDate());
    const yy = String(ts.getFullYear()).slice(-2);
    const h24 = ts.getHours();
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const hh = pad(h12);
    const mi = pad(ts.getMinutes());
    const ss = pad(ts.getSeconds());
    const stamp = `${mm}${dd}${yy} ${hh}${mi}${ss}`;
    const defaultPath = path.join(app.getPath('documents') || app.getPath('downloads') || app.getPath('userData'), `gbpos-export-${stamp}.json`);
    const result = await dialog.showSaveDialog({
      title: 'Export Backup',
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const db = readDb();
    fs.writeFileSync(result.filePath, JSON.stringify(db, null, 2), 'utf-8');
    return { ok: true, filePath: result.filePath };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Import full database from a user-selected file (replaces current DB after auto-backup)
ipcMain.handle('backup:import', async () => {
  try {
    const open = await dialog.showOpenDialog({
      title: 'Import Backup',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (open.canceled || !open.filePaths.length) return { ok: false, canceled: true };
    const filePath = open.filePaths[0];
    const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object') return { ok: false, error: 'Invalid backup file format' };

  // Support both plain-DB exports and BackupData { collections: {...} } shape
  const collectionsShape = (data as any)?.collections;
  const dbPayload = (collectionsShape && typeof collectionsShape === 'object') ? collectionsShape : data;

    // Auto-backup current DB before overwriting
    try {
      const userData = app.getPath('userData');
      const backupsDir = path.join(userData, 'backups');
      if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
      const ts = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
      const backupPath = path.join(backupsDir, `gbpos-pre-import-backup-${stamp}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(readDb(), null, 2), 'utf-8');
    } catch (_e) { /* best effort */ }

  // Replace database
  fs.writeFileSync(dbFile, JSON.stringify(dbPayload, null, 2), 'utf-8');

    // Notify renderers that data might have changed
    const channels = [
      'workorders:changed',
      'customers:changed',
      'sales:changed',
      'technicians:changed',
      'deviceCategories:changed',
      'productCategories:changed',
      'products:changed',
      'partSources:changed',
      'calendarEvents:changed',
      'timeEntries:changed',
    ];
    BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => {
      channels.forEach(ch => {
        try { w.webContents.send(ch); } catch {}
      });
    });
    return { ok: true, filePath };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('dev:environmentInfo', async () => {
  try {
    return {
      ok: true,
      versions: process.versions,
      platform: process.platform,
      arch: process.arch,
      appVersion: app.getVersion ? app.getVersion() : undefined,
      userData: app.getPath('userData'),
      cwd: process.cwd(),
      isDev,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('dev:openAllDevTools', async () => {
  try {
    BrowserWindow.getAllWindows().forEach((w: any) => {
      try { w.webContents.openDevTools({ mode: 'detach' }); } catch (_e) {}
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Open Data Tools window
ipcMain.handle('open-data-tools', async () => {
  const child = new BrowserWindow({
    width: 1000,
    height: 800,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Data Tools',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?dataTools=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?dataTools=true`;
  child.loadURL(url);
  return { ok: true };
});

// Open Clear Database window
ipcMain.handle('open-clear-database', async (event: any) => {
  const parentWin = (() => { try { return BrowserWindow.fromWebContents(event?.sender); } catch { return null; } })() || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || undefined;
  const child = new BrowserWindow({
    width: 900,
    height: 750,
    resizable: true,
    parent: parentWin as any,
    modal: true,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Clear Database',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); try { child.focus(); } catch {} });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?clearDb=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?clearDb=true`;
  child.loadURL(url);
  return { ok: true };
});

// Open Charts window (Reporting charts)
ipcMain.handle('open-charts', async () => {
  const child = new BrowserWindow({
    width: 1200,
    height: 800,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Charts',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?charts=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?charts=true`;
  child.loadURL(url);
  return { ok: true };
});

// Open JSON file and return parsed content (dry-run import)
ipcMain.handle('backup:pickAndRead', async () => {
  try {
    const open = await dialog.showOpenDialog({
      title: 'Select Backup (Dry-Run)',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (open.canceled || !open.filePaths.length) return { ok: false, canceled: true };
    const filePath = open.filePaths[0];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return { ok: true, filePath, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Export provided payload to a user-selected file (anonymized export)
ipcMain.handle('backup:exportPayload', async (_e: any, payload: any) => {
  try {
    const ts = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    // MMDDYY HHMMSS (12-hour)
    const mm = pad(ts.getMonth() + 1);
    const dd = pad(ts.getDate());
    const yy = String(ts.getFullYear()).slice(-2);
    const h24 = ts.getHours();
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const hh = pad(h12);
    const mi = pad(ts.getMinutes());
    const ss = pad(ts.getSeconds());
    const stamp = `${mm}${dd}${yy} ${hh}${mi}${ss}`;
    const defaultPath = path.join(app.getPath('documents') || app.getPath('downloads') || app.getPath('userData'), `gbpos-anonymized-${stamp}.json`);
    const result = await dialog.showSaveDialog({
      title: 'Export Anonymized Backup',
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(payload || {}, null, 2), 'utf-8');
    return { ok: true, filePath: result.filePath };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Export provided payload with a custom filename label
ipcMain.handle('backup:exportPayloadNamed', async (_e: any, payload: any, label?: string) => {
  try {
    const ts = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    const base = label ? label.replace(/[^a-z0-9\-\_\+]+/gi, '-') : 'gbpos-export';
    const defaultPath = path.join(app.getPath('documents') || app.getPath('downloads') || app.getPath('userData'), `${base}-${stamp}.json`);
    const result = await dialog.showSaveDialog({
      title: 'Export Backup',
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(payload || {}, null, 2), 'utf-8');
    // Persist last backup path for UI convenience
    try {
      const userDataPath = app.getPath('userData');
      const configPath = path.join(userDataPath, 'backup-config.json');
      const config = { lastBackupPath: result.filePath, lastBackupDate: new Date().toISOString() };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch {}
    return { ok: true, filePath: result.filePath };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Export provided HTML to a user-selected .html file
ipcMain.handle('export-html', async (_e: any, html: string, filenameBase?: string) => {
  try {
    const ts = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const mm = pad(ts.getMonth() + 1), dd = pad(ts.getDate()), yy = String(ts.getFullYear()).slice(-2);
    const h24 = ts.getHours();
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const hh = pad(h12), mi = pad(ts.getMinutes()), ss = pad(ts.getSeconds());
    const stamp = `${mm}${dd}${yy} ${hh}${mi}${ss}`;
    const base = (filenameBase || 'gadgetboy-quote')
      .toString()
      .replace(/[^a-z0-9\-\_\+]+/gi, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
    const defaultPath = path.join(app.getPath('documents') || app.getPath('downloads') || app.getPath('userData'), `${base}-${stamp}.html`);
    const result = await dialog.showSaveDialog({
      title: 'Save Quote (Interactive HTML)',
      defaultPath,
      filters: [{ name: 'HTML', extensions: ['html'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const fs = require('fs');
    fs.writeFileSync(result.filePath, html || '', 'utf-8');
    return { ok: true, filePath: result.filePath };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Export provided HTML as a PDF using an offscreen BrowserWindow and printToPDF
ipcMain.handle('export-pdf', async (_e: any, html: string, filenameBase?: string) => {
  try {
    const ts = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const mm = pad(ts.getMonth() + 1), dd = pad(ts.getDate()), yy = String(ts.getFullYear()).slice(-2);
    const h24 = ts.getHours();
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const hh = pad(h12), mi = pad(ts.getMinutes());
    const stamp = `${mm}${dd}${yy} ${hh}${mi}`;
    const base = (filenameBase || 'gadgetboy-quote')
      .toString()
      .replace(/[^a-z0-9\-\_\+]+/gi, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
    const defaultPath = path.join(app.getPath('documents') || app.getPath('downloads') || app.getPath('userData'), `${base}-${stamp}.pdf`);
    const result = await dialog.showSaveDialog({
      title: 'Save Quote (PDF)',
      defaultPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };

    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      },
      ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
      backgroundColor: '#ffffff',
    });

    // Avoid giant data: URLs (can exceed Chromium/Electron limits when HTML contains base64 images)
    // by writing the HTML to a temp file and loading via file://.
    const tempDir = path.join(app.getPath('userData'), 'quote-previews');
    try { fs.mkdirSync(tempDir, { recursive: true }); } catch {}
    const safeBase = String(filenameBase || 'gadgetboy-quote')
      .replace(/[^a-z0-9\-\_\+]+/gi, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'gadgetboy-quote';
    const tempPath = path.join(tempDir, `${safeBase}-${Date.now()}-pdf.html`);
    fs.writeFileSync(tempPath, String(html || ''), 'utf-8');
    await win.loadFile(tempPath);
    // Give layout a moment to settle
    await new Promise((r) => setTimeout(r, 150));
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'default' },
      pageSize: 'A4',
      landscape: false,
    } as any);
    fs.writeFileSync(result.filePath, pdfBuffer);
    try { fs.unlinkSync(tempPath); } catch {}
    try { win.destroy(); } catch {}
    return { ok: true, filePath: result.filePath };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Open a child window to display provided HTML for interactive editing (with preload enabled)
ipcMain.handle('open-interactive-html', async (_e: any, html: string, title?: string) => {
  try {
    // Open a resizable child window sized for comfortable editing
    const child = new BrowserWindow({
      width: 1100,
      height: 800,
      useContentSize: true,
      resizable: true,
      movable: true,
      minimizable: false,
      maximizable: true,
      parent: BrowserWindow.getAllWindows()[0] || undefined,
      modal: false,
      ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      },
      show: false,
      title: title || 'Interactive Quote',
    });
    if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });

    // Load from a temp file instead of a data: URL to avoid URL-length limits for large HTML.
    const tempDir = path.join(app.getPath('userData'), 'quote-previews');
    try { fs.mkdirSync(tempDir, { recursive: true }); } catch {}
    const safeTitle = String(title || 'Interactive Quote')
      .replace(/[^a-z0-9\-\_\+]+/gi, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'interactive-quote';
    const tempPath = path.join(tempDir, `${safeTitle}-${Date.now()}.html`);
    fs.writeFileSync(tempPath, String(html || ''), 'utf-8');

    // Pre-set a reasonable content size
    try { child.setContentSize(1100, 800); } catch {}
    // Register load listener BEFORE loading to avoid missing the event
    child.webContents.once('did-finish-load', () => {
      try { centerWindow(child); child.show(); child.focus(); } catch {}
    });
    await child.loadFile(tempPath);
    // Fallback: if for some reason the event fired before registration, ensure shown
    try { if (!child.isVisible()) { centerWindow(child); child.show(); child.focus(); } } catch {}
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});
// Release Form print window
ipcMain.handle('open-release-form', async (_event: any, payload: any) => {
  const child = new BrowserWindow({
    width: 850,
    height: 1100,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Release Form',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const encoded = encodeURIComponent(JSON.stringify(payload || {}));
  const url = isDev ? `${DEV_SERVER_URL}/?releaseForm=${encoded}` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?releaseForm=${encoded}`;
  child.loadURL(url);
  return { ok: true };
});

// Customer Receipt print window
ipcMain.handle('open-customer-receipt', async (event: any, payload: any) => {
  const parentWin = (() => { try { return BrowserWindow.fromWebContents(event?.sender); } catch { return null; } })() || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || undefined;
  const child = new BrowserWindow({
    width: 850,
    height: 1100,
    resizable: true,
    parent: parentWin as any,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Customer Receipt',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); try { child.focus(); } catch {} });
  child.on('closed', () => { try { (parentWin as any)?.show?.(); (parentWin as any)?.focus?.(); } catch {} });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const encoded = encodeURIComponent(JSON.stringify(payload || {}));
  const url = isDev ? `${DEV_SERVER_URL}/?customerReceipt=${encoded}` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?customerReceipt=${encoded}`;
  child.loadURL(url);
  return { ok: true };
});

// Product Form print window (Sales)
ipcMain.handle('open-product-form', async (event: any, payload: any) => {
  const parentWin = (() => { try { return BrowserWindow.fromWebContents(event?.sender); } catch { return null; } })() || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || undefined;
  const child = new BrowserWindow({
    width: 850,
    height: 1100,
    resizable: true,
    parent: parentWin as any,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Product Form',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); try { child.focus(); } catch {} });
  child.on('closed', () => { try { (parentWin as any)?.show?.(); (parentWin as any)?.focus?.(); } catch {} });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const encoded = encodeURIComponent(JSON.stringify(payload || {}));
  const url = isDev ? `${DEV_SERVER_URL}/?productForm=${encoded}` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?productForm=${encoded}`;
  child.loadURL(url);
  return { ok: true };
});

// Reporting window
ipcMain.handle('open-reporting', async () => {
  const child = new BrowserWindow({
    width: 1100,
    height: 800,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Reporting',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?reporting=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?reporting=true`;
  child.loadURL(url);
  return { ok: true };
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (BrowserWindow.getAllWindows().length) {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) win.focus();
    }
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('com.gadgetboy.pos');
    // Set a global application menu so Ctrl/Cmd+C/V and other edit shortcuts work everywhere
    setupApplicationMenu();
    setupAutoUpdater();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// IPC stub for future
ipcMain.handle('open-work-order', async (_event: any, id: any) => {
  // Placeholder for future logic
  return { ok: true, id };
});

ipcMain.handle('open-new-workorder', async (_event: any, payload: any) => {
  const { screen } = electron;
  const primary = screen.getPrimaryDisplay();
  const bounds = primary && primary.bounds ? primary.bounds : ({ x: 0, y: 0, width: 1920, height: 1080 } as any);
  const child = new BrowserWindow({
    x: (bounds as any).x ?? 0,
    y: (bounds as any).y ?? 0,
    width: (bounds as any).width,
    height: (bounds as any).height,
    minWidth: Math.min(1200, (bounds as any).width ?? bounds.width),
    minHeight: Math.min(800, (bounds as any).height ?? bounds.height),
    useContentSize: true,
    resizable: true,
    maximizable: true,
    frame: true,
    parent: undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'New Work Order',
  });
  child.once('ready-to-show', () => {
    try { child.setBounds({ x: (bounds as any).x ?? 0, y: (bounds as any).y ?? 0, width: (bounds as any).width, height: (bounds as any).height }); } catch {}
    try { child.maximize(); } catch {}
    child.show();
    try { child.focus(); } catch {}
  });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  // Load renderer with query params carrying payload
  const url = isDev ? `${DEV_SERVER_URL}/?newWorkOrder=${encodeURIComponent(JSON.stringify(payload))}` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?newWorkOrder=${encodeURIComponent(JSON.stringify(payload))}`;
  child.loadURL(url);
  return { ok: true };
});

ipcMain.handle('open-device-categories', async (_event: any) => {
  const child = new BrowserWindow({
    width: 900,
    height: 600,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Device Categories',
  });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?deviceCategories=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?deviceCategories=true`;
  child.loadURL(url);
  return { ok: true };
});

ipcMain.handle('open-repair-categories', async (_event: any) => {
  const child = new BrowserWindow({
    width: 1000,
    height: 620,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Work Order Item',
  });
  child.once('ready-to-show', () => child.show());
  if (isDev) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev ? `${DEV_SERVER_URL}/?repairCategories=true` : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?repairCategories=true`;
  child.loadURL(url);
  return { ok: true };
});

// IPC handler for opening the WorkOrderRepairPicker window
ipcMain.handle('open-workorder-repair-picker', async (_event: any) => {
  const child = new BrowserWindow({
    width: 1000,
    height: 620,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Add Repair to Work Order',
  });
  child.once('ready-to-show', () => child.show());
  if (isDev) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev
    ? `${DEV_SERVER_URL}/?workOrderRepairPicker=true`
    : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?workOrderRepairPicker=true`;
  child.loadURL(url);
  return { ok: true };
});

// IPC handler for promise-based sale product picker (returns selected product-like payload)
ipcMain.handle('pick-sale-product', async (_event: any) => {
  return new Promise((resolve) => {
    const child = new BrowserWindow({
      width: 1280,
      height: 800,
      resizable: true,
      parent: BrowserWindow.getAllWindows()[0] || undefined,
      modal: true,
      ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
      backgroundColor: '#18181b',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      },
      show: false,
      title: 'Pick Product for Sale',
    });
    child.once('ready-to-show', () => { centerWindow(child); child.show(); });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
    const url = isDev
      ? `${DEV_SERVER_URL}/?products=true&picker=sale`
      : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?products=true&picker=sale`;
    child.loadURL(url);

    const handler = (_ev: any, payload: any) => {
      resolve(payload);
      child.close();
      ipcMain.off('sale-product-selected', handler);
    };
    ipcMain.on('sale-product-selected', handler);

    child.on('closed', () => {
      ipcMain.off('sale-product-selected', handler);
      resolve(null);
    });
  });
});

// IPC handler for opening customer overview window
ipcMain.handle('open-customer-overview', async (_event: any, customerId: number) => {
  const child = new BrowserWindow({
    width: 1100,
    height: 760,
    resizable: true,
    parent: BrowserWindow.getAllWindows()[0] || undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'Customer Overview',
  });
  child.once('ready-to-show', () => child.show());
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const url = isDev
    ? `${DEV_SERVER_URL}/?customerOverview=${customerId}`
    : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?customerOverview=${customerId}`;
  child.loadURL(url);
  return { ok: true };
});

// IPC handler for opening a simple New Sale window
ipcMain.handle('open-new-sale', async (_event: any, payload: any) => {
  const { screen } = electron;
  const primary = screen.getPrimaryDisplay();
  const bounds = primary && primary.bounds ? primary.bounds : ({ x: 0, y: 0, width: 1920, height: 1080 } as any);
  const child = new BrowserWindow({
    x: (bounds as any).x ?? 0,
    y: (bounds as any).y ?? 0,
    width: (bounds as any).width,
    height: (bounds as any).height,
    minWidth: Math.min(1200, (bounds as any).width ?? bounds.width),
    minHeight: Math.min(800, (bounds as any).height ?? bounds.height),
    useContentSize: true,
    resizable: true,
    maximizable: true,
    frame: true,
    parent: undefined,
    modal: false,
    ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
    backgroundColor: '#18181b',
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
    },
    show: false,
    title: 'New Sale',
  });
  child.once('ready-to-show', () => {
    try { child.setBounds({ x: (bounds as any).x ?? 0, y: (bounds as any).y ?? 0, width: (bounds as any).width, height: (bounds as any).height }); } catch {}
    try { child.maximize(); } catch {}
    child.show();
    try { child.focus(); } catch {}
  });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
  const encoded = encodeURIComponent(JSON.stringify(payload || {}));
  const url = isDev
    ? `${DEV_SERVER_URL}/?newSale=${encoded}`
    : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?newSale=${encoded}`;
  child.loadURL(url);
  return { ok: true };
});

// Checkout window handler
ipcMain.handle('workorder:openCheckout', async (event: any, payload: { amountDue: number }) => {
  return new Promise(resolve => {
    const parentWin = (() => { try { return BrowserWindow.fromWebContents(event?.sender); } catch { return null; } })() || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || undefined;
    const child = new BrowserWindow({
      width: 400,
      height: 420,
      resizable: false,
      parent: parentWin as any,
      modal: true,
      ...(WINDOW_ICON ? { icon: WINDOW_ICON } : {}),
      backgroundColor: '#18181b',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      },
      show: false,
      title: 'Checkout',
      alwaysOnTop: false,
    });
  child.once('ready-to-show', () => { centerWindow(child); child.show(); try { child.focus(); } catch {} });
  if (isDev && OPEN_CHILD_DEVTOOLS) child.webContents.openDevTools({ mode: 'detach' });
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const url = isDev
      ? `${DEV_SERVER_URL}/?checkout=${encoded}`
      : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}?checkout=${encoded}`;
    child.loadURL(url);

    const saveHandler = (_e: any, result: any) => {
      resolve(result);
      cleanup();
    };
    const cancelHandler = () => {
      resolve(null);
      cleanup();
    };
    function cleanup() {
      ipcMain.off('workorder:checkout:save', saveHandler);
      ipcMain.off('workorder:checkout:cancel', cancelHandler);
      if (!child.isDestroyed()) child.close();
      try { (parentWin as any)?.show?.(); (parentWin as any)?.focus?.(); } catch {}
    }
    ipcMain.on('workorder:checkout:save', saveHandler);
    ipcMain.on('workorder:checkout:cancel', cancelHandler);
    child.on('closed', () => resolve(null));
  });
});

// ============================================
// BACKUP & RESTORE IPC HANDLERS
// ============================================

// Open Backup window

// Create encrypted backup
ipcMain.handle('create-encrypted-backup', async (_event: any, backupData: any, password: string) => {
  try {
    console.log('[BACKUP] Creating encrypted backup...');
    
    // Show save dialog
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0], {
      title: 'Save Encrypted Backup',
      defaultPath: `GadgetBoyPOS-Backup-${new Date().toISOString().slice(0, 10)}.gbpos`,
      filters: [
        { name: 'GadgetBoy POS Backup', extensions: ['gbpos'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Save canceled by user' };
    }

    // Import backup utilities (dynamically to avoid import issues)
    const crypto = require('crypto');
    const zlib = require('zlib');

    // Encrypt the backup data
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

    // Compress and encrypt
    const jsonData = JSON.stringify(backupData);
    const compressed = zlib.gzipSync(Buffer.from(jsonData, 'utf8'));
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('GadgetBoyPOS-Backup-v1'));
    
    const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const tag = cipher.getAuthTag();

    const encryptedBackup = {
      version: '1.0.0',
      algorithm: 'aes-256-gcm',
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted.toString('hex'),
      timestamp: new Date().toISOString()
    };

    // Write to file
    fs.writeFileSync(result.filePath, JSON.stringify(encryptedBackup, null, 2));

    // Store last backup path
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'backup-config.json');
    const config = { lastBackupPath: result.filePath, lastBackupDate: new Date().toISOString() };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('[BACKUP] Backup created successfully:', result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (error: any) {
    console.error('[BACKUP] Failed to create backup:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
});

// Restore from encrypted backup
ipcMain.handle('restore-encrypted-backup', async (_event: any, password: string) => {
  try {
    console.log('[RESTORE] Starting restore process...');

    // Show open dialog
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0], {
      title: 'Select Backup File to Restore',
      filters: [
        { name: 'GadgetBoy POS Backup', extensions: ['gbpos'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'Restore canceled by user' };
    }

    const filePath = result.filePaths[0];
    console.log('[RESTORE] Reading backup file:', filePath);

    // Read and parse backup file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const encryptedBackup = JSON.parse(fileContent);

    // Import crypto utilities
    const crypto = require('crypto');
    const zlib = require('zlib');

    // Decrypt the backup
    const salt = Buffer.from(encryptedBackup.salt, 'hex');
    const iv = Buffer.from(encryptedBackup.iv, 'hex');
    const tag = Buffer.from(encryptedBackup.tag, 'hex');
    const encryptedData = Buffer.from(encryptedBackup.data, 'hex');
    
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

    const decipher = crypto.createDecipheriv(encryptedBackup.algorithm, key, iv);
    decipher.setAAD(Buffer.from('GadgetBoyPOS-Backup-v1'));
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    const decompressed = zlib.gunzipSync(decrypted);
    const backupData = JSON.parse(decompressed.toString('utf8'));

    // Restore all collections
    const db = readDb();
    let totalRecords = 0;

    for (const [collectionName, items] of Object.entries(backupData.collections)) {
      if (Array.isArray(items)) {
        db[collectionName] = items;
        totalRecords += items.length;
        console.log(`[RESTORE] Restored ${items.length} records to ${collectionName}`);
      }
    }

    // Write restored data back to database
    const writeSuccess = writeDb(db);
    if (!writeSuccess) {
      throw new Error('Failed to write restored data to database');
    }

    // Notify all windows about data changes
    const changedCollections = Object.keys(backupData.collections);
    BrowserWindow.getAllWindows().forEach((w: typeof BrowserWindow.prototype) => {
      changedCollections.forEach(collection => {
        w.webContents.send(`${collection}:changed`);
      });
    });

    console.log('[RESTORE] Restore completed successfully, total records:', totalRecords);
    return { success: true, recordsCount: totalRecords };
  } catch (error: any) {
    console.error('[RESTORE] Failed to restore backup:', error);
    if (error.message.includes('bad decrypt') || error.message.includes('authentication')) {
      return { success: false, error: 'Invalid password or corrupted backup file' };
    }
    return { success: false, error: error.message || 'Unknown error' };
  }
});

// Get last backup path
ipcMain.handle('get-last-backup-path', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'backup-config.json');
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.lastBackupPath || '';
    }
    return '';
  } catch (error) {
    console.warn('[BACKUP] Failed to get last backup path:', error);
    return '';
  }
});
