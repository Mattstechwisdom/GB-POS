const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');
const esbuild = require('esbuild');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const root = path.join(__dirname, '..');
  const mobileApp = fs.readFileSync(path.join(root, 'src', 'mobile', 'MobileApp.tsx'), 'utf8');
  const contextMenuSurfaces = [
    'src/workorders/ItemsTable.tsx',
    'src/sales/SaleItemsTable.tsx',
    'src/repairs/RepairItemList.tsx',
    'src/components/WorkOrdersTable.tsx',
  ];
  assert(/installMobileLongPressContextMenu\(\)/.test(mobileApp), 'Mobile must install long-press handling across the app.');
  for (const relativePath of contextMenuSurfaces) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert(/onContextMenu=/.test(source), `${relativePath} must preserve its desktop right-click action for touch holds.`);
  }

  const sourcePath = path.join(__dirname, '..', 'src', 'mobile', 'longPressContextMenu.ts');
  const build = await esbuild.build({
    entryPoints: [sourcePath],
    bundle: true,
    format: 'iife',
    globalName: 'GBLongPress',
    platform: 'browser',
    write: false,
  });

  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false } });
  await win.loadURL('data:text/html,<main id="fixture"></main>');
  await win.webContents.executeJavaScript(build.outputFiles[0].text);

  const result = await win.webContents.executeJavaScript(`(async () => {
    const fixture = document.getElementById('fixture');
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const pointer = (type, target, options = {}) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
      pointerId: options.pointerId || 1,
      isPrimary: true,
      button: 0,
      clientX: options.clientX || 20,
      clientY: options.clientY || 20,
    }));

    const cleanup = GBLongPress.installMobileLongPressContextMenu(document);
    const makeRow = () => {
      const row = document.createElement('article');
      const label = document.createElement('span');
      row.appendChild(label);
      fixture.appendChild(row);
      const state = { contexts: 0, clicks: 0 };
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        state.contexts += 1;
      });
      row.addEventListener('click', () => { state.clicks += 1; });
      return { row, label, state };
    };

    const held = makeRow();
    pointer('pointerdown', held.label);
    await wait(610);
    pointer('pointerup', held.label);
    held.label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const tapped = makeRow();
    pointer('pointerdown', tapped.label, { pointerId: 2 });
    await wait(40);
    pointer('pointerup', tapped.label, { pointerId: 2 });
    tapped.label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const moved = makeRow();
    pointer('pointerdown', moved.label, { pointerId: 3 });
    pointer('pointermove', moved.label, { pointerId: 3, clientX: 40 });
    await wait(610);
    pointer('pointerup', moved.label, { pointerId: 3, clientX: 40 });

    const inputRow = makeRow();
    const input = document.createElement('input');
    inputRow.row.appendChild(input);
    pointer('pointerdown', input, { pointerId: 4 });
    await wait(610);
    pointer('pointerup', input, { pointerId: 4 });

    cleanup();
    return {
      held: held.state,
      tapped: tapped.state,
      moved: moved.state,
      input: inputRow.state,
    };
  })()`);

  assert(result.held.contexts === 1, 'Long press should open exactly one context menu.');
  assert(result.held.clicks === 0, 'Long press should suppress its follow-up click.');
  assert(result.tapped.contexts === 0 && result.tapped.clicks === 1, 'A normal tap should remain a normal click.');
  assert(result.moved.contexts === 0, 'Finger movement should cancel the long press.');
  assert(result.input.contexts === 0, 'Form controls should not trigger a row context menu.');

  win.destroy();
  console.log('Mobile long-press context-menu checks passed.');
}

app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
