const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const build = esbuild.buildSync({ entryPoints: [path.join(root, 'src/lib/dailyLookTechnicians.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const loaded = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(loaded, loaded.exports, require);
const { countOpenTasksByTechnician, sharedDailyLookTasks, tasksForSelectedTechnician } = loaded.exports;
const tasks = [
  { category: 'task', technician: 'Luke', title: 'Open', taskCompleted: false },
  { category: 'task', technician: 'Luke', title: 'Done', taskCompleted: true },
  { category: 'task', technician: 'Mia', title: 'Other', taskCompleted: false },
  { category: 'task', technician: '__all_technicians__', title: 'Shared', taskCompleted: false },
];
assert.deepEqual(countOpenTasksByTechnician(tasks, ['Luke', 'Mia']), { Luke: 1, Mia: 1 });
assert.deepEqual(tasksForSelectedTechnician(tasks, 'Luke').map((task) => task.title), ['Open', 'Done']);
assert.deepEqual(sharedDailyLookTasks(tasks).map((task) => task.title), ['Shared']);
console.log('Daily Look technician task grouping checks passed.');
