import { technicianDisplayName } from './admin';

export type TechnicianShift = {
  name: string;
  start: string;
  end: string;
};

export type EffectiveTechnicianShift = TechnicianShift & {
  off: boolean;
  overridden: boolean;
  overrideId?: number | string;
};

export const SHIFT_OVERRIDE_SOURCE = 'shift-override';
const SHIFT_TECHNICIAN_PREFIX = 'technician:';

const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function localDate(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').slice(0, 10));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

export function technicianShiftIdentity(technician: any): string {
  return String(technician?.id || technician?.legacyId || technician?.cloudId || technicianDisplayName(technician)).trim();
}

export function shiftOverrideLocation(technician: any): string {
  return `${SHIFT_TECHNICIAN_PREFIX}${technicianShiftIdentity(technician)}`;
}

export function isShiftOverrideEvent(event: any): boolean {
  return event?.category === 'schedule' && event?.source === SHIFT_OVERRIDE_SOURCE;
}

function shiftOverrideForTechnician(events: any[], dateKey: string, technician: any): any | undefined {
  const identity = technicianShiftIdentity(technician).toLowerCase();
  const name = technicianDisplayName(technician).trim().toLowerCase();
  return (Array.isArray(events) ? events : []).find(event => {
    if (!isShiftOverrideEvent(event) || String(event?.date || '').slice(0, 10) !== dateKey) return false;
    const storedIdentity = String(event?.location || '').toLowerCase().replace(SHIFT_TECHNICIAN_PREFIX, '');
    const storedName = String(event?.technician || '').trim().toLowerCase();
    return (identity && storedIdentity === identity) || (name && storedName === name);
  });
}

export function effectiveTechnicianShiftForDate(technician: any, dateKey: string, events: any[] = []): EffectiveTechnicianShift | null {
  const date = localDate(dateKey);
  if (!date) return null;
  const dayKey = dayKeys[date.getDay()];
  const regular = technician?.schedule?.[dayKey] || {};
  const override = shiftOverrideForTechnician(events, dateKey, technician);
  const overridden = Boolean(override);
  return {
    name: technicianDisplayName(technician),
    start: String((overridden ? override?.time : regular?.start) || '').trim(),
    end: String((overridden ? override?.endTime : regular?.end) || '').trim(),
    off: overridden ? String(override?.notes || '').trim().toUpperCase() === 'OFF' : regular?.off === true,
    overridden,
    overrideId: override?.id,
  };
}

export function technicianShiftsForDate(technicians: any[], dateKey: string, assignedTo = '', events: any[] = []): TechnicianShift[] {
  const assigned = String(assignedTo || '').trim().toLowerCase();
  return (Array.isArray(technicians) ? technicians : [])
    .filter(technician => technician?.active !== false && technician?.status !== 'disabled')
    .map(technician => effectiveTechnicianShiftForDate(technician, dateKey, events))
    .filter((shift): shift is EffectiveTechnicianShift => Boolean(shift && !shift.off && (shift.start || shift.end)))
    .filter(shift => !assigned || shift.name.toLowerCase() === assigned)
    .map(({ name, start, end }) => ({ name, start, end }))
    .sort((left, right) => left.start.localeCompare(right.start) || left.name.localeCompare(right.name));
}
