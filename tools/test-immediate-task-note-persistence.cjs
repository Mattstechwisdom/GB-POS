const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const helperPath = path.join(root, 'src/lib/immediatePersistence.ts');
assert.ok(fs.existsSync(helperPath), 'Immediate task/note updates need a shared optimistic persistence helper.');

const build = esbuild.buildSync({
  stdin: {
    contents: fs.readFileSync(helperPath, 'utf8'),
    loader: 'ts',
    resolveDir: path.dirname(helperPath),
  },
  bundle: false,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const helperModule = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(helperModule, helperModule.exports, require);
const { replaceRecordById, taskCompletionPatch } = helperModule.exports;

assert.equal(typeof replaceRecordById, 'function');
assert.equal(typeof taskCompletionPatch, 'function');

const original = [{ id: 7, title: 'Test HDMI port', taskCompleted: false }, { id: 8, title: 'Call client' }];
const replaced = replaceRecordById(original, { id: '7', title: 'Test HDMI port', taskCompleted: true });
assert.equal(replaced[0].taskCompleted, true, 'String/numeric IDs must reconcile to the same synced row.');
assert.equal(replaced[1], original[1], 'Unchanged records must retain identity.');

const completed = taskCompletionPatch({ id: 7, category: 'task', technician: 'Matt' }, true, '2026-08-25', 'Matt', '2026-08-25T15:00:00.000Z');
assert.equal(completed.taskCompleted, true);
assert.equal(completed.taskCompletedAt, '2026-08-25T15:00:00.000Z');
assert.equal(completed.taskCompletedBy, 'Matt');

const recurring = taskCompletionPatch({
  id: 9,
  category: 'task',
  recurrenceRule: { version: 1, frequency: 'weekly', interval: 1, completedDates: ['2026-08-18'] },
}, true, '2026-08-25', '', '2026-08-25T15:00:00.000Z');
assert.deepEqual(recurring.recurrenceRule.completedDates, ['2026-08-18', '2026-08-25']);
const reopened = taskCompletionPatch(recurring, false, '2026-08-25', '', '2026-08-25T15:05:00.000Z');
assert.deepEqual(reopened.recurrenceRule.completedDates, ['2026-08-18']);
assert.equal(reopened.taskCompleted, false);
assert.equal(reopened.taskCompletedAt, '');

const calendar = read('src/components/CalendarWindow.tsx');
const dailyLook = read('src/components/DailyLookWindow.tsx');
const workOrder = read('src/workorders/NewWorkOrderWindow.tsx');
const notesPanel = read('src/workorders/NotesPanel.tsx');
const electron = read('app/electron/electron-main.ts');

for (const source of [calendar, dailyLook]) {
  assert.match(source, /taskCompletionPatch/, 'Calendar task completion must use the shared recurrence-safe patch.');
  assert.match(source, /replaceRecordById/, 'Saved task rows must immediately reconcile by stable ID.');
}
assert.match(calendar, /optimisticNote/, 'Calendar notes must appear before the database round trip completes.');
assert.match(calendar, /previousNotes/, 'A failed calendar note save must restore the prior visible list.');
assert.match(workOrder, /persistJournalNote/, 'Save Note must immediately persist an existing work order.');
assert.match(workOrder, /dbUpdate\('workOrders'/, 'Immediate journal persistence must update the shared work-order record.');
assert.match(notesPanel, /Promise<void>/, 'The journal panel must await its asynchronous Save Note action.');
assert.match(notesPanel, /Saving\.\.\./, 'The journal panel must show when its explicit save is still running.');

const updateHandler = electron.slice(electron.indexOf("ipcMain.handle('db-update'"), electron.indexOf("ipcMain.handle('db-delete'"));
assert.ok(updateHandler.indexOf("await syncCloudWriteOrQueue('upsert'") < updateHandler.indexOf('scheduleCollectionChanged(key)'), 'Desktop updates must finish or queue Supabase persistence before broadcasting a refresh.');

console.log('Immediate task and note persistence regression checks passed.');
