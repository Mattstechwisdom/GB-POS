import { RRule, type Weekday } from 'rrule';

export type CalendarRecurrenceFrequency = 'daily' | 'weekly' | 'monthly';
export type CalendarMonthlyMode = 'dayOfMonth' | 'weekdayPattern';

export type CalendarRecurrenceRule = {
  version: 1;
  frequency: CalendarRecurrenceFrequency;
  interval: number;
  weekdays?: number[];
  monthlyMode?: CalendarMonthlyMode;
  monthDay?: number;
  monthlyOrdinal?: 1 | 2 | 3 | 4 | -1;
  monthlyWeekday?: number;
  until?: string;
  completedDates?: string[];
};

export type CalendarOccurrenceException = {
  id?: number | string;
  seriesLegacyId: number | string;
  occurrenceDate: string;
  cancelled?: boolean;
  overridePayload?: Record<string, unknown>;
};

export type RecurringCalendarEvent = {
  id?: number | string;
  date: string;
  recurrenceRule?: CalendarRecurrenceRule | null;
  [key: string]: unknown;
};

export type CalendarOccurrence<T extends RecurringCalendarEvent = RecurringCalendarEvent> = T & {
  recurrenceSeriesId: number | string;
  recurrenceMaster: T;
  occurrenceDate: string;
  recurrenceOccurrenceKey: string;
};

const WEEKDAYS: Weekday[] = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clampInt(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function parseIsoDate(value: unknown, endOfDay = false) {
  const text = String(value || '').slice(0, 10);
  if (!ISO_DATE.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, endOfDay ? 23 : 12, endOfDay ? 59 : 0, endOfDay ? 59 : 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function formatIsoDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function normalizeRecurrenceRule(input: Partial<CalendarRecurrenceRule> | null | undefined): CalendarRecurrenceRule | null {
  const frequency = input?.frequency;
  if (frequency !== 'daily' && frequency !== 'weekly' && frequency !== 'monthly') return null;
  const normalized: CalendarRecurrenceRule = {
    version: 1,
    frequency,
    interval: clampInt(input?.interval, 1, 365, 1),
  };
  if (frequency === 'weekly') {
    normalized.weekdays = Array.from(new Set((Array.isArray(input?.weekdays) ? input.weekdays : [])
      .map(Number)
      .filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)))
      .sort((left, right) => left - right);
  }
  if (frequency === 'monthly') {
    normalized.monthlyMode = input?.monthlyMode === 'weekdayPattern' ? 'weekdayPattern' : 'dayOfMonth';
    if (normalized.monthlyMode === 'weekdayPattern') {
      const ordinal = Number(input?.monthlyOrdinal);
      normalized.monthlyOrdinal = ([1, 2, 3, 4, -1].includes(ordinal) ? ordinal : 1) as 1 | 2 | 3 | 4 | -1;
      normalized.monthlyWeekday = clampInt(input?.monthlyWeekday, 0, 6, 0);
    } else {
      normalized.monthDay = clampInt(input?.monthDay, 1, 31, 1);
    }
  }
  const until = String(input?.until || '').slice(0, 10);
  if (ISO_DATE.test(until) && parseIsoDate(until)) normalized.until = until;
  const completedDates = Array.from(new Set((Array.isArray(input?.completedDates) ? input.completedDates : [])
    .map((value) => String(value || '').slice(0, 10))
    .filter((value) => ISO_DATE.test(value) && parseIsoDate(value)))).sort();
  if (completedDates.length) normalized.completedDates = completedDates;
  return normalized;
}

export function monthlyWeekdayPatternForDate(value: string): { ordinal: 1 | 2 | 3 | 4 | -1; weekday: number } {
  const date = parseIsoDate(value);
  if (!date) return { ordinal: 1, weekday: 0 };
  const day = date.getUTCDate();
  const weekday = date.getUTCDay();
  const nextSameWeekday = new Date(date.getTime());
  nextSameWeekday.setUTCDate(day + 7);
  const ordinal = nextSameWeekday.getUTCMonth() !== date.getUTCMonth()
    ? -1
    : Math.min(4, Math.floor((day - 1) / 7) + 1);
  return { ordinal: ordinal as 1 | 2 | 3 | 4 | -1, weekday };
}

export function calendarOccurrenceKey(seriesLegacyId: number | string, occurrenceDate: string) {
  return `${String(seriesLegacyId)}::${String(occurrenceDate).slice(0, 10)}`;
}

function toRRuleOptions(event: RecurringCalendarEvent, rule: CalendarRecurrenceRule) {
  const dtstart = parseIsoDate(event.date);
  if (!dtstart) return null;
  const options: ConstructorParameters<typeof RRule>[0] = {
    dtstart,
    interval: rule.interval,
    wkst: RRule.SU,
    freq: rule.frequency === 'daily' ? RRule.DAILY : rule.frequency === 'weekly' ? RRule.WEEKLY : RRule.MONTHLY,
  };
  if (rule.until) options.until = parseIsoDate(rule.until, true) || undefined;
  if (rule.frequency === 'weekly') {
    const fallback = dtstart.getUTCDay();
    const weekdays = rule.weekdays?.length ? rule.weekdays : [fallback];
    options.byweekday = weekdays.map((weekday) => WEEKDAYS[weekday]);
  }
  if (rule.frequency === 'monthly') {
    if (rule.monthlyMode === 'weekdayPattern') {
      options.byweekday = WEEKDAYS[rule.monthlyWeekday ?? dtstart.getUTCDay()].nth(rule.monthlyOrdinal || 1);
    } else {
      options.bymonthday = rule.monthDay || dtstart.getUTCDate();
    }
  }
  return options;
}

export function expandRecurringEvent<T extends RecurringCalendarEvent>(event: T, rangeStart: string, rangeEnd: string): Array<CalendarOccurrence<T>> {
  const rule = normalizeRecurrenceRule(event.recurrenceRule);
  const start = parseIsoDate(rangeStart);
  const end = parseIsoDate(rangeEnd, true);
  if (!rule || !start || !end || event.id == null) return [];
  const options = toRRuleOptions(event, rule);
  if (!options) return [];
  return new RRule(options).between(start, end, true).map((date) => {
    const occurrenceDate = formatIsoDate(date);
    const completed = rule.completedDates?.includes(occurrenceDate) === true;
    return {
      ...event,
      date: occurrenceDate,
      ...(event.category === 'task' ? {
        taskCompleted: completed,
        taskCompletedAt: completed ? event.taskCompletedAt : '',
      } : {}),
      recurrenceSeriesId: event.id as number | string,
      recurrenceMaster: event,
      occurrenceDate,
      recurrenceOccurrenceKey: calendarOccurrenceKey(event.id as number | string, occurrenceDate),
    };
  });
}

export function applyOccurrenceExceptions<T extends RecurringCalendarEvent>(occurrences: Array<CalendarOccurrence<T>>, exceptions: CalendarOccurrenceException[]): Array<CalendarOccurrence<T>> {
  const byKey = new Map(exceptions.map((exception) => [calendarOccurrenceKey(exception.seriesLegacyId, exception.occurrenceDate), exception]));
  return occurrences.flatMap((occurrence) => {
    const exception = byKey.get(occurrence.recurrenceOccurrenceKey);
    if (exception?.cancelled) return [];
    return [{
      ...occurrence,
      ...(exception?.overridePayload || {}),
      date: occurrence.occurrenceDate,
      occurrenceExceptionId: exception?.id,
    }];
  });
}
