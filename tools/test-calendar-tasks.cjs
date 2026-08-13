const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const calendar = read('src/components/CalendarWindow.tsx');
const dailyLook = read('src/components/DailyLookWindow.tsx');
const taskLogic = read('src/lib/calendarTasks.ts');
const desktopCloud = read('app/electron/electron-main.ts');
const mobileCloud = read('src/mobile/mobile-api.ts');
const migration = read('supabase/migrations/20260811174737_add_calendar_tasks.sql');

assert.match(calendar, /category\?:[^;]*'task'/, 'Calendar must support task records.');
assert.match(calendar, /calendarEventGroupKey/, 'Calendar must group repeated event icons.');
assert.match(calendar, /group\.length > 1/, 'Grouped icons must display a count.');
assert.match(calendar, /setTaskCompleted/, 'Calendar must complete tasks from its checklist.');
assert.match(dailyLook, /tasksForDailyLook/, 'Daily Look must include carried-forward tasks.');
assert.match(dailyLook, /dbUpdate\('calendarEvents'/, 'Daily Look completion must save to the shared calendar record.');
assert.match(taskLogic, /eventDate < date && taskIsCompleted\(event\)/, 'Only unfinished older tasks may carry forward.');
assert.match(taskLogic, /ALL_TECHNICIANS/, 'Tasks must support an explicit All Technicians assignment.');
assert.match(taskLogic, /isSharedTaskAssignment/, 'Shared tasks must remain visible in each technician Daily Look.');
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
