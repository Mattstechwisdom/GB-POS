const fs = require('fs');
const path = require('path');
const assert = require('assert');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const calendar = read('src/components/CalendarWindow.tsx');
const dailyLook = read('src/components/DailyLookWindow.tsx');
const taskLogic = read('src/lib/calendarTasks.ts');
const shiftLogic = read('src/lib/technicianSchedule.ts');
const desktopCloud = read('app/electron/electron-main.ts');
const mobileCloud = read('src/mobile/mobile-api.ts');
const migration = read('supabase/migrations/20260811174737_add_calendar_tasks.sql');
const shiftRequestMigration = read('supabase/migrations/20260823162803_add_calendar_shift_requests.sql');

function loadCalendarRequestStatus(source) {
  const match = source.match(/function calendarRequestStatus\(value: any\):[^\{]+\{[\s\S]*?\n\}/);
  assert.ok(match, 'Calendar cloud serializers must define request-status normalization.');
  const js = match[0].replace(/\(value: any\):[^\{]+\{/, '(value) {');
  return new Function(`${js}; return calendarRequestStatus;`)();
}

for (const source of [desktopCloud, mobileCloud]) {
  const normalizeStatus = loadCalendarRequestStatus(source);
  assert.equal(normalizeStatus(undefined), null);
  assert.equal(normalizeStatus(''), null);
  assert.equal(normalizeStatus('ordinary-task'), null);
  assert.equal(normalizeStatus('PENDING'), 'pending');
  assert.equal(normalizeStatus('approved'), 'approved');
  assert.equal(normalizeStatus('declined'), 'declined');
}

const taskBuild = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/lib/calendarTasks.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const taskModule = { exports: {} };
new Function('module', 'exports', 'require', taskBuild.outputFiles[0].text)(taskModule, taskModule.exports, require);
const { calendarEventAutosaveEnabled, tasksPendingSave } = taskModule.exports;

assert.equal(typeof tasksPendingSave, 'function', 'Task saving must include a typed draft even when Add to Task List was not clicked.');
assert.equal(typeof calendarEventAutosaveEnabled, 'function', 'Calendar autosave eligibility must protect unsaved task drafts.');
assert.equal(calendarEventAutosaveEnabled({ category: 'task', title: 'Draft task' }), false, 'A new task draft must not autosave into edit mode.');
assert.equal(calendarEventAutosaveEnabled({ id: 42, category: 'task', title: 'Saved task' }), true, 'An existing task may continue to autosave while edited.');
assert.equal(calendarEventAutosaveEnabled({ category: 'event', title: 'Store event' }), true, 'Other calendar entry types must retain autosave.');
const typedDraft = { date: '2026-08-24', category: 'task', title: '  Count inventory  ', notes: 'Finish before close', technician: '' };
const pendingTypedTask = tasksPendingSave([], typedDraft);
assert.equal(pendingTypedTask.length, 1, 'Pressing Save with a typed task must produce one task to persist.');
assert.equal(pendingTypedTask[0].title, 'Count inventory');
assert.equal(pendingTypedTask[0].technician, '__all_technicians__');
assert.equal(pendingTypedTask[0].taskCompleted, false);
assert.equal(tasksPendingSave([{ ...typedDraft, title: 'Already staged' }], { ...typedDraft, title: '' }).length, 1, 'An empty draft must not duplicate staged tasks.');

assert.match(calendar, /category\?:[^;]*'task'/, 'Calendar must support task records.');
assert.match(calendar, /calendarEventGroupKey/, 'Calendar must group repeated event icons.');
assert.match(calendar, /group\.length > 1/, 'Grouped icons must display a count.');
assert.match(calendar, /setTaskCompleted/, 'Calendar must complete tasks from its checklist.');
assert.match(calendar, /gb-calendar-day-actions/, 'Desktop calendar dates must split Notes and Tasks into dedicated controls.');
assert.match(calendar, /onOpenTasks/, 'The daily Tasks control must open that date task list.');
assert.match(calendar, />All Day</, 'Task editor must provide an All Day option.');
assert.match(calendar, />Start time</, 'Timed tasks must provide a start time.');
assert.match(calendar, />End time</, 'Timed tasks must provide an end time.');
assert.match(calendar, /Task end time must be later than its start time/, 'Timed tasks must reject an invalid range.');
assert.match(calendar, /addTaskToQueue/, 'Task editor must stage multiple tasks before the final save.');
assert.match(calendar, /saveTaskBatch/, 'Task editor must save the staged task list together.');
assert.match(calendar, /Add to Task List/, 'Task editor must expose an explicit queue action.');
assert.match(calendar, /visibleTaskAssignments/, 'Task editor must show existing assignments for the selected technician and day.');
assert.match(calendar, /tasksPendingSave/, 'Task save must include the current typed draft as well as staged tasks.');
assert.match(calendar, /Save Tasks \(\$\{taskSaveCount\}\)/, 'Task editor must show the complete number of tasks that will be saved.');
for (const source of [desktopCloud, mobileCloud]) {
  assert.match(source, /endTime:\s*row\.end_time/, 'Task end time must load from the shared calendar record.');
  assert.match(source, /end_time:\s*toCloudString\(item\.endTime\)/, 'Task end time must save to the shared calendar record.');
}
assert.match(dailyLook, /tasksForDailyLook/, 'Daily Look must include carried-forward tasks.');
assert.match(dailyLook, /dbUpdate\('calendarEvents'/, 'Daily Look completion must save to the shared calendar record.');
assert.match(taskLogic, /eventDate < date && taskIsCompleted\(event\)/, 'Only unfinished older tasks may carry forward.');
assert.match(taskLogic, /ALL_TECHNICIANS/, 'Tasks must support an explicit All Technicians assignment.');
assert.match(taskLogic, /isSharedTaskAssignment/, 'Shared tasks must remain visible in each technician Daily Look.');
assert.match(taskLogic, /split\(','\)/, 'Task assignments must support comma-separated technicians.');
assert.match(taskLogic, /taskAssignmentIncludes/, 'Daily Look must match any technician in a multi-assignment task.');
assert.match(taskLogic, /toggleTaskAssignment/, 'Task assignment choices must toggle independently.');
assert.match(calendar, /Assigned technicians/, 'The task editor must expose the multi-technician field.');
assert.match(calendar, /aria-pressed=\{selected\}/, 'Selected technicians must be visibly highlighted.');
assert.match(calendar, /gb-calendar-entry-type-rail/, 'The add-entry window must place entry types in a dedicated left rail.');
assert.match(calendar, /Shift Change/, 'The day shift window must expose date-specific shift changes.');
assert.match(calendar, /Save Shift Changes/, 'Shift changes must have an explicit synced save action.');
assert.match(calendar, /shiftOverridden/, 'Calendar shift icons must distinguish date-specific changes.');
assert.match(calendar, /Request Time Off/, 'Calendar header must expose the prominent time-off request action.');
assert.match(calendar, /gb-calendar-timeoff-badge/, 'Pending shift requests must display a prominent notification badge.');
assert.match(calendar, /Full Day OFF/, 'Shift requests must support a full-day absence.');
assert.match(calendar, /Different Hours/, 'Shift requests must support custom start and end hours.');
assert.match(calendar, /Submit Shift Request/, 'Technicians must explicitly submit a synced shift request.');
assert.match(calendar, /reviewShiftRequest\(request, 'approved'\)/, 'Approving a request must convert it into a dated shift override.');
assert.match(calendar, /reviewShiftRequest\(request, 'declined'\)/, 'Schedule managers must be able to decline a pending request.');
assert.match(shiftLogic, /SHIFT_OVERRIDE_SOURCE = 'shift-override'/, 'Shift overrides need a stable shared-record marker.');
assert.match(shiftLogic, /SHIFT_REQUEST_SOURCE = 'shift-request'/, 'Shift requests need a stable shared-record marker.');
assert.match(shiftLogic, /effectiveTechnicianShiftForDate/, 'Calendar and Daily Look must resolve date-specific overrides over master schedules.');
assert.match(dailyLook, /technicianShiftsForDate\(techs, date, technician, events\)/, 'Daily Look must apply synced shift overrides.');
assert.match(desktopCloud, /source[^\n]*shift-override/, 'Local backups must retain synced shift overrides.');
assert.match(desktopCloud, /source[^\n]*shift-request/, 'Local backups must retain synced shift requests.');
for (const source of [desktopCloud, mobileCloud]) {
  assert.match(source, /taskCompleted:\s*row\.task_completed === true/);
  assert.match(source, /task_completed:\s*toCloudBool\(item\.taskCompleted\)/);
  assert.match(source, /task_completed_at:/);
  assert.match(source, /requestStatus:\s*row\.request_status/);
  assert.match(source, /request_status:\s*calendarRequestStatus\(item\.requestStatus\)/, 'Ordinary calendar entries must serialize a missing request status as null.');
  assert.match(source, /shift_request_off:/);
}
assert.match(desktopCloud, /key === 'calendarEvents'[\s\S]*Date\.now\(\) \* 1000/, 'Desktop tasks need cross-device-safe calendar ids.');
assert.match(mobileCloud, /key === 'calendarEvents'[\s\S]*crypto\.getRandomValues/, 'Mobile tasks need cross-device-safe calendar ids.');
assert.match(migration, /calendar_events_open_tasks_idx/);
assert.match(migration, /where category = 'task' and task_completed = false/);
assert.match(shiftRequestMigration, /request_status text/);
assert.match(shiftRequestMigration, /calendar_events_pending_shift_requests_idx/);

console.log('Calendar task carry-forward, grouping, and Supabase mapping checks passed.');
