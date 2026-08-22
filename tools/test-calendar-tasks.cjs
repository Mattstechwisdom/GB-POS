const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const calendar = read('src/components/CalendarWindow.tsx');
const dailyLook = read('src/components/DailyLookWindow.tsx');
const taskLogic = read('src/lib/calendarTasks.ts');
const shiftLogic = read('src/lib/technicianSchedule.ts');
const desktopCloud = read('app/electron/electron-main.ts');
const mobileCloud = read('src/mobile/mobile-api.ts');
const migration = read('supabase/migrations/20260811174737_add_calendar_tasks.sql');

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
assert.match(calendar, /Save Tasks \(\$\{taskQueue\.length\}\)/, 'Task editor must show how many staged tasks will be saved.');
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
assert.match(shiftLogic, /SHIFT_OVERRIDE_SOURCE = 'shift-override'/, 'Shift overrides need a stable shared-record marker.');
assert.match(shiftLogic, /effectiveTechnicianShiftForDate/, 'Calendar and Daily Look must resolve date-specific overrides over master schedules.');
assert.match(dailyLook, /technicianShiftsForDate\(techs, date, technician, events\)/, 'Daily Look must apply synced shift overrides.');
assert.match(desktopCloud, /source[^\n]*shift-override/, 'Local backups must retain synced shift overrides.');
for (const source of [desktopCloud, mobileCloud]) {
  assert.match(source, /taskCompleted:\s*row\.task_completed === true/);
  assert.match(source, /task_completed:\s*toCloudBool\(item\.taskCompleted\)/);
  assert.match(source, /task_completed_at:/);
}
assert.match(desktopCloud, /key === 'calendarEvents'[\s\S]*Date\.now\(\) \* 1000/, 'Desktop tasks need cross-device-safe calendar ids.');
assert.match(mobileCloud, /key === 'calendarEvents'[\s\S]*crypto\.getRandomValues/, 'Mobile tasks need cross-device-safe calendar ids.');
assert.match(migration, /calendar_events_open_tasks_idx/);
assert.match(migration, /where category = 'task' and task_completed = false/);

console.log('Calendar task carry-forward, grouping, and Supabase mapping checks passed.');
