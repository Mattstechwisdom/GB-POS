export type CalendarTaskRecord = {
  id?: number | string;
  date?: string;
  title?: string;
  category?: string;
  technician?: string;
  taskCompleted?: boolean;
  taskCompletedAt?: string;
  taskCompletedBy?: string;
};

export function isCalendarTask(event: CalendarTaskRecord | null | undefined): boolean {
  return event?.category === 'task';
}

export function taskIsCompleted(event: CalendarTaskRecord | null | undefined): boolean {
  return isCalendarTask(event) && event?.taskCompleted === true;
}

export function tasksForDailyLook<T extends CalendarTaskRecord>(events: T[], date: string, technician = ''): T[] {
  const assigned = technician.trim().toLowerCase();
  return events
    .filter((event) => {
      if (!isCalendarTask(event)) return false;
      const eventDate = String(event.date || '').slice(0, 10);
      if (!eventDate || eventDate > date) return false;
      if (eventDate < date && taskIsCompleted(event)) return false;
      if (assigned && String(event.technician || '').trim().toLowerCase() !== assigned) return false;
      return true;
    })
    .sort((left, right) => {
      const completionDifference = Number(taskIsCompleted(left)) - Number(taskIsCompleted(right));
      if (completionDifference) return completionDifference;
      return String(left.date || '').localeCompare(String(right.date || ''))
        || String(left.title || '').localeCompare(String(right.title || ''));
    });
}

export function calendarEventGroupKey(event: CalendarTaskRecord & { partsStatus?: string; source?: string; businessKind?: string }): string {
  if (event.businessKind) return `business:${event.businessKind}`;
  if (event.category === 'parts') return `parts:${event.partsStatus || 'delivery'}:${event.source || ''}`;
  if (event.category === 'content') return `content:${event.source || 'content'}`;
  return event.category || 'event';
}
