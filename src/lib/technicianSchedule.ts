import { technicianDisplayName } from './admin';

export type TechnicianShift = {
  name: string;
  start: string;
  end: string;
};

const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function localDate(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').slice(0, 10));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

export function technicianShiftsForDate(technicians: any[], dateKey: string, assignedTo = ''): TechnicianShift[] {
  const date = localDate(dateKey);
  if (!date) return [];
  const dayKey = dayKeys[date.getDay()];
  const assigned = String(assignedTo || '').trim().toLowerCase();
  return (Array.isArray(technicians) ? technicians : [])
    .filter(technician => technician?.active !== false && technician?.status !== 'disabled')
    .map(technician => {
      const name = technicianDisplayName(technician);
      const shift = technician?.schedule?.[dayKey];
      return {
        name,
        start: String(shift?.start || '').trim(),
        end: String(shift?.end || '').trim(),
        off: shift?.off === true,
      };
    })
    .filter(shift => !shift.off && !!(shift.start || shift.end))
    .filter(shift => !assigned || shift.name.toLowerCase() === assigned)
    .map(({ name, start, end }) => ({ name, start, end }))
    .sort((left, right) => left.start.localeCompare(right.start) || left.name.localeCompare(right.name));
}
