const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const calendar = read('src/components/CalendarWindow.tsx');
const workOrder = read('src/workorders/NewWorkOrderWindow.tsx');
const technicians = read('src/components/TechniciansWindow.tsx');
const app = read('src/App.tsx');
const mobile = read('src/mobile/MobileApp.tsx');
const main = read('app/electron/electron-main.ts');
const game = read('src/components/GameMenuWindow.tsx');
const builder = read('electron-builder.yml');

assert.ok(calendar.indexOf('Assigned technician') < calendar.indexOf('What needs to be completed?'), 'Task assignment must appear before the task field.');
assert.match(calendar, /Open invoice/);
assert.match(calendar, /Open order URL/);
assert.match(calendar, /Open tracking URL/);
assert.match(calendar, /Delete entry/);
assert.match(calendar, /onContextMenu=.*calendarContext\.openFromEvent/);
assert.match(calendar, /icons: calendarIcons/);
assert.match(calendar, /Use letters, symbols, emoji/);

assert.match(workOrder, /durantReport/);
assert.match(workOrder, /Send to Durant/);
assert.match(workOrder, /emailSendReportHtml/);
assert.match(workOrder, /workOrderType: 'durantReport'/);

assert.match(technicians, /useCompactCardLayout = true/);
assert.match(app, /keyword === 'GADGETBOY'/);
assert.match(mobile, /query === 'GADGETBOY'/);
assert.doesNotMatch(app, /keyword\.toUpperCase\(\) === 'GADGETBOY'/);
assert.match(main, /ipcMain\.handle\('open-game-menu'/);
assert.match(main, /frame: true/);
assert.match(main, /trackingUrl: row\.tracking_url \|\| ''/);
assert.match(main, /tracking_url: toCloudString\(item\.trackingUrl\)/);
assert.match(game, /Ship, Captain & Crew/);
assert.match(game, /lockShipCaptainCrew/);
assert.match(game, /round > 5/);

assert.match(builder, /requestedExecutionLevel:\s*asInvoker/);
assert.match(builder, /perMachine:\s*false/);
assert.match(builder, /allowElevation:\s*false/);
assert.match(builder, /packElevateHelper:\s*false/);

console.log('v0.5.93 feature checks passed.');
