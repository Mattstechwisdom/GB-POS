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

export const ALL_TECHNICIANS = '__all_technicians__';

export function isSharedTaskAssignment(value: unknown): boolean {
  const assignment = String(value || '').trim().toLowerCase();
  return !assignment || assignment === ALL_TECHNICIANS || assignment === 'all technicians';
}

export function taskAssignmentLabel(value: unknown): string {
  return isSharedTaskAssignment(value) ? 'All Technicians' : taskAssignments(value).join(', ');
}

export function taskAssignments(value: unknown): string[] {
  if (isSharedTaskAssignment(value)) return [];
  return Array.from(new Set(String(value || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)));
}

export function taskAssignmentIncludes(value: unknown, technician: unknown): boolean {
  const name = String(technician || '').trim().toLowerCase();
  if (!name || isSharedTaskAssignment(value)) return true;
  return taskAssignments(value).some((assigned) => assigned.toLowerCase() === name);
}

export function toggleTaskAssignment(value: unknown, technician: unknown): string {
  const name = String(technician || '').trim();
  if (!name || isSharedTaskAssignment(name)) return ALL_TECHNICIANS;
  const selected = taskAssignments(value);
  const existingIndex = selected.findIndex((assigned) => assigned.toLowerCase() === name.toLowerCase());
  if (existingIndex >= 0) selected.splice(existingIndex, 1);
  else selected.push(name);
  return selected.length ? selected.join(', ') : ALL_TECHNICIANS;
}

export function tasksPendingSave<T extends CalendarTaskRecord>(queue: readonly T[], draft: T | null | undefined): T[] {
  const pending = Array.isArray(queue) ? [...queue] : [];
  const title = String(draft?.title || '').trim();
  if (!draft || draft.category !== 'task' || draft.id != null || !title) return pending;
  return [...pending, {
    ...draft,
    id: undefined,
    title,
    technician: draft.technician || ALL_TECHNICIANS,
    taskCompleted: false,
    taskCompletedAt: '',
    taskCompletedBy: '',
  }];
}

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
      if (assigned && !taskAssignmentIncludes(event.technician, assigned)) return false;
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
