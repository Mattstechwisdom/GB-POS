const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = esbuild.buildSync({
  absWorkingDir: root,
  entryPoints: ['./src/lib/calendarRecurrence.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
}).outputFiles[0].text;
const compiledModule = { exports: {} };
new Function('module', 'exports', 'require', output)(compiledModule, compiledModule.exports, require);

const {
  applyOccurrenceExceptions,
  calendarOccurrenceKey,
  expandRecurringEvent,
  monthlyWeekdayPatternForDate,
  normalizeRecurrenceRule,
} = compiledModule.exports;

const dates = (rows) => rows.map((row) => row.occurrenceDate);
const rangeStart = '2026-09-01';
const rangeEnd = '2026-10-31';

assert.deepEqual(
  dates(expandRecurringEvent({ id: 10, date: '2026-09-01', title: 'Daily', recurrenceRule: { version: 1, frequency: 'daily', interval: 1 } }, rangeStart, '2026-09-04')),
  ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
  'Daily recurrence must include each day in the visible range.',
);

assert.deepEqual(
  dates(expandRecurringEvent({ id: 11, date: '2026-09-01', title: 'MWF', recurrenceRule: { version: 1, frequency: 'weekly', interval: 1, weekdays: [1, 3, 5] } }, rangeStart, '2026-09-11')),
  ['2026-09-02', '2026-09-04', '2026-09-07', '2026-09-09', '2026-09-11'],
  'Weekly recurrence must honor every selected weekday.',
);

assert.deepEqual(
  dates(expandRecurringEvent({ id: 12, date: '2026-09-15', title: 'Month day', recurrenceRule: { version: 1, frequency: 'monthly', interval: 1, monthlyMode: 'dayOfMonth', monthDay: 15 } }, rangeStart, rangeEnd)),
  ['2026-09-15', '2026-10-15'],
  'Monthly day recurrence must use the saved calendar day.',
);

assert.deepEqual(
  dates(expandRecurringEvent({ id: 13, date: '2026-09-26', title: 'Last Saturday', recurrenceRule: { version: 1, frequency: 'monthly', interval: 1, monthlyMode: 'weekdayPattern', monthlyOrdinal: -1, monthlyWeekday: 6 } }, rangeStart, rangeEnd)),
  ['2026-09-26', '2026-10-31'],
  'Monthly weekday recurrence must support the last Saturday of every month.',
);

assert.deepEqual(monthlyWeekdayPatternForDate('2026-09-26'), { ordinal: -1, weekday: 6 }, 'A last Saturday start date must infer the last-Saturday rule.');

const untilRows = expandRecurringEvent({ id: 14, date: '2026-09-01', recurrenceRule: { version: 1, frequency: 'daily', interval: 1, until: '2026-09-03' } }, rangeStart, '2026-09-10');
assert.deepEqual(dates(untilRows), ['2026-09-01', '2026-09-02', '2026-09-03'], 'The recurrence end date must be inclusive.');

assert.equal(calendarOccurrenceKey(22, '2026-09-03'), '22::2026-09-03', 'Occurrence keys must be stable across devices.');

const base = expandRecurringEvent({ id: 22, date: '2026-09-01', title: 'Series', recurrenceRule: { version: 1, frequency: 'daily', interval: 1 } }, rangeStart, '2026-09-03');
const adjusted = applyOccurrenceExceptions(base, [
  { seriesLegacyId: 22, occurrenceDate: '2026-09-02', cancelled: true },
  { seriesLegacyId: 22, occurrenceDate: '2026-09-03', cancelled: false, overridePayload: { title: 'Changed once' } },
]);
assert.deepEqual(adjusted.map((row) => [row.occurrenceDate, row.title]), [['2026-09-01', 'Series'], ['2026-09-03', 'Changed once']], 'Exceptions must cancel or override only their occurrence.');

assert.deepEqual(normalizeRecurrenceRule({ frequency: 'weekly', weekdays: [5, 1, 5, 99], interval: 0 }), {
  version: 1,
  frequency: 'weekly',
  interval: 1,
  weekdays: [1, 5],
}, 'Rules must normalize duplicate weekdays and invalid intervals.');

console.log('Calendar recurrence domain checks passed.');
