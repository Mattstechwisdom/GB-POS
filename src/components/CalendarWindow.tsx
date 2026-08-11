import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatPhone } from '../lib/format';
import { useAutosave } from '@/lib/useAutosave';
import { formatTime12FromHHmm } from '@/lib/datetime';
import { listTechnicians, technicianDisplayName } from '@/lib/admin';
import { consumeWindowPayload } from '@/lib/windowPayload';
import { consultationLocationDisplay } from '@/lib/consultationLocation';
import { calendarEventGroupKey, taskIsCompleted, tasksForDailyLook } from '@/lib/calendarTasks';

type CalendarEvent = {
  id?: number;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:mm
  endTime?: string;   // HH:mm (optional)
  title: string;      // Display title
  category?: 'parts' | 'event' | 'consultation' | 'schedule' | 'content' | 'task';
  // For parts category, refine status for display
  partsStatus?: 'ordered' | 'delivery';
  // Identify source to style differently (e.g., sales vs work order)
  source?: 'sale' | 'workorder' | 'consultation' | 'streaming' | 'content' | 'business-calendar';
  businessKind?: 'federalHoliday' | 'scTaxFreeWeekend' | 'daylightSaving' | 'estimatedTaxDeadline';
  saleId?: number;
  notes?: string;
  // Optional linkage
  workOrderId?: number;
  partName?: string;
  orderUrl?: string;
  trackingUrl?: string;
  // Optional contact/location details
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  consultationAddress?: string;
  consultationType?: string;
  technician?: string;
  location?: string;
  taskCompleted?: boolean;
  taskCompletedAt?: string;
  taskCompletedBy?: string;
  // Weekly schedule (for category 'schedule')
  schedule?: {
    mon?: { start?: string; end?: string; off?: boolean };
    tue?: { start?: string; end?: string; off?: boolean };
    wed?: { start?: string; end?: string; off?: boolean };
    thu?: { start?: string; end?: string; off?: boolean };
    fri?: { start?: string; end?: string; off?: boolean };
    sat?: { start?: string; end?: string; off?: boolean };
    sun?: { start?: string; end?: string; off?: boolean };
  };
};

type CalendarNote = {
  id?: number | string;
  date: string;
  subject: string;
  body: string;
  createdAt?: string;
  updatedAt?: string;
};

type CalendarColors = {
  schedule: string;
  partsOrdered: string;
  partsDelivery: string;
  event: string;
  consultation: string;
  streaming: string;
  content: string;
  notes: string;
  task: string;
  federalHoliday: string;
  scTaxFreeWeekend: string;
  daylightSaving: string;
  estimatedTaxDeadline: string;
};

type BusinessCalendarSettings = {
  federalHolidays: boolean;
  scTaxFreeWeekend: boolean;
  daylightSaving: boolean;
  estimatedTaxDeadlines: boolean;
};

type CalendarPreferences = {
  colors?: Partial<CalendarColors>;
  technicianColors?: Record<string, string>;
  businessCalendar?: Partial<BusinessCalendarSettings>;
};

const DEFAULT_CALENDAR_COLORS: CalendarColors = {
  schedule: '#39FF14',
  partsOrdered: '#3B82F6',
  partsDelivery: '#22C55E',
  event: '#EF4444',
  consultation: '#EAB308',
  streaming: '#D946EF',
  content: '#22D3EE',
  notes: '#FBBF24',
  task: '#A78BFA',
  federalHoliday: '#F43F5E',
  scTaxFreeWeekend: '#22C55E',
  daylightSaving: '#38BDF8',
  estimatedTaxDeadline: '#FB923C',
};

const DEFAULT_BUSINESS_CALENDAR_SETTINGS: BusinessCalendarSettings = {
  federalHolidays: true,
  scTaxFreeWeekend: true,
  daylightSaving: true,
  estimatedTaxDeadlines: false,
};

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  const first = new Date(year, month, 1, 12, 0, 0, 0);
  return new Date(year, month, 1 + ((7 + weekday - first.getDay()) % 7) + ((nth - 1) * 7), 12, 0, 0, 0);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const last = new Date(year, month + 1, 0, 12, 0, 0, 0);
  return new Date(year, month, last.getDate() - ((7 + last.getDay() - weekday) % 7), 12, 0, 0, 0);
}

function observedFederalDate(date: Date) {
  if (date.getDay() === 6) return addDays(date, -1);
  if (date.getDay() === 0) return addDays(date, 1);
  return date;
}

function federalHolidayDates(year: number) {
  return [
    { title: "New Year's Day", actual: new Date(year, 0, 1, 12) },
    { title: 'Martin Luther King Jr. Day', actual: nthWeekdayOfMonth(year, 0, 1, 3) },
    { title: "Washington's Birthday", actual: nthWeekdayOfMonth(year, 1, 1, 3) },
    { title: 'Memorial Day', actual: lastWeekdayOfMonth(year, 4, 1) },
    { title: 'Juneteenth National Independence Day', actual: new Date(year, 5, 19, 12) },
    { title: 'Independence Day', actual: new Date(year, 6, 4, 12) },
    { title: 'Labor Day', actual: nthWeekdayOfMonth(year, 8, 1, 1) },
    { title: 'Columbus Day', actual: nthWeekdayOfMonth(year, 9, 1, 2) },
    { title: 'Veterans Day', actual: new Date(year, 10, 11, 12) },
    { title: 'Thanksgiving Day', actual: nthWeekdayOfMonth(year, 10, 4, 4) },
    { title: 'Christmas Day', actual: new Date(year, 11, 25, 12) },
  ].map(item => ({ ...item, observed: observedFederalDate(item.actual) }));
}

function nextBusinessDay(date: Date, federalObserved: Set<string>) {
  let result = new Date(date);
  while (result.getDay() === 0 || result.getDay() === 6 || federalObserved.has(fmtDate(result))) result = addDays(result, 1);
  return result;
}

function buildBusinessCalendarEvents(years: number[], settings: BusinessCalendarSettings): CalendarEvent[] {
  const entries: CalendarEvent[] = [];
  const uniqueYears = Array.from(new Set(years));
  for (const year of uniqueYears) {
    const federal = federalHolidayDates(year);
    if (settings.federalHolidays) {
      federal.forEach(({ title, actual, observed }) => entries.push({
        date: fmtDate(observed),
        title: `${title}${fmtDate(actual) === fmtDate(observed) ? '' : ' (observed)'}`,
        category: 'event', source: 'business-calendar', businessKind: 'federalHoliday',
        notes: 'Federal holiday. Confirm shop hours before publishing a closure.',
      }));
    }
    if (settings.scTaxFreeWeekend) {
      const friday = nthWeekdayOfMonth(year, 7, 5, 1);
      [0, 1, 2].forEach(offset => entries.push({
        date: fmtDate(addDays(friday, offset)),
        title: `SC Tax-Free Weekend${offset === 0 ? ' begins' : offset === 2 ? ' ends' : ''}`,
        category: 'event', source: 'business-calendar', businessKind: 'scTaxFreeWeekend',
        notes: 'South Carolina annual sales tax holiday. Confirm eligible products and reporting guidance with SCDOR.',
      }));
    }
    if (settings.daylightSaving) {
      entries.push({ date: fmtDate(nthWeekdayOfMonth(year, 2, 0, 2)), title: 'Daylight Saving Time begins', time: '02:00', category: 'event', source: 'business-calendar', businessKind: 'daylightSaving', notes: 'Clocks move forward one hour at 2:00 AM local time.' });
      entries.push({ date: fmtDate(nthWeekdayOfMonth(year, 10, 0, 1)), title: 'Daylight Saving Time ends', time: '02:00', category: 'event', source: 'business-calendar', businessKind: 'daylightSaving', notes: 'Clocks move back one hour at 2:00 AM local time.' });
    }
    if (settings.estimatedTaxDeadlines) {
      const observed = new Set(federal.map(item => fmtDate(item.observed)));
      const deadlines = [
        { date: new Date(year, 0, 15, 12), title: 'Estimated tax payment due (Q4 prior year)' },
        { date: new Date(year, 3, 15, 12), title: 'Estimated tax payment due (Q1)' },
        { date: new Date(year, 5, 15, 12), title: 'Estimated tax payment due (Q2)' },
        { date: new Date(year, 8, 15, 12), title: 'Estimated tax payment due (Q3)' },
      ];
      deadlines.forEach(item => entries.push({ date: fmtDate(nextBusinessDay(item.date, observed)), title: item.title, category: 'event', source: 'business-calendar', businessKind: 'estimatedTaxDeadline', notes: 'General calendar-year reminder only. Verify the applicable deadline with your accountant or current IRS guidance.' }));
    }
  }
  return entries;
}

function calendarEventVisual(ev: CalendarEvent, colors: CalendarColors = DEFAULT_CALENDAR_COLORS) {
  if (ev.businessKind) {
    const businessVisuals = {
      federalHoliday: { short: 'HOL', letter: 'H', color: colors.federalHoliday, label: 'Federal holiday' },
      scTaxFreeWeekend: { short: 'SC', letter: 'T', color: colors.scTaxFreeWeekend, label: 'SC tax-free weekend' },
      daylightSaving: { short: 'DST', letter: 'D', color: colors.daylightSaving, label: 'Daylight saving time' },
      estimatedTaxDeadline: { short: 'TAX', letter: '$', color: colors.estimatedTaxDeadline, label: 'Tax reminder' },
    };
    return businessVisuals[ev.businessKind];
  }
  if (ev.category === 'content') {
    const streaming = ev.source === 'streaming';
    return {
      short: streaming ? 'LIVE' : 'REC',
      letter: streaming ? 'V' : 'R',
      color: streaming ? colors.streaming : colors.content,
      label: streaming ? 'Streaming' : 'Content recording',
    };
  }
  if (ev.category === 'consultation') return { short: 'CONS', letter: 'C', color: colors.consultation, label: 'Consultation' };
  if (ev.category === 'task') return { short: 'TASK', letter: 'K', color: colors.task, label: taskIsCompleted(ev) ? 'Completed task' : 'Task' };
  if (ev.category === 'parts') {
    const delivery = ev.partsStatus === 'delivery' || !ev.partsStatus;
    return { short: delivery ? 'DUE' : 'ORD', letter: delivery ? 'D' : 'O', color: delivery ? colors.partsDelivery : colors.partsOrdered, label: delivery ? 'Expected delivery' : 'Part ordered' };
  }
  if (ev.category === 'schedule') return { short: 'SHIFT', letter: 'S', color: colors.schedule, label: 'Technician schedule' };
  return { short: 'EVENT', letter: 'E', color: colors.event, label: 'Event' };
}

function fmtDate(d: Date) {
  // Format YYYY-MM-DD in LOCAL time to avoid UTC shifting around DST/timezones
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(date: Date) {
  // Local time month start at midnight
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(date: Date) {
  // Local time month end (last day of current month)
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 0, 0, 0, 0);
}
function addDays(d: Date, days: number) {
  // Add days in local time to avoid DST glitches
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

function activeShiftEvents(day: Date, events: CalendarEvent[]) {
  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day.getDay()] as keyof NonNullable<CalendarEvent['schedule']>;
  return events.filter((event) => {
    const shift = event.category === 'schedule' ? event.schedule?.[dayKey] : null;
    return Boolean(shift && !shift.off && (shift.start || shift.end));
  });
}

const Cell: React.FC<{ day: Date; events: CalendarEvent[]; notes: CalendarNote[]; notesVisible: boolean; colors: CalendarColors; technicianColors: Record<string, string>; onPick: (day: Date) => void; onOpenGroup: (events: CalendarEvent[]) => void; onOpenNotes: (day: Date) => void; onOpenShifts: (day: Date) => void; isToday?: boolean }>
  = ({ day, events, notes, notesVisible, colors, technicianColors, onPick, onOpenGroup, onOpenNotes, onOpenShifts, isToday }) => {
  const dayNum = day.getDate();
  function blipFor(ev: CalendarEvent) {
    // Letter & color by type
    if (ev.businessKind) {
      const visual = calendarEventVisual(ev, colors);
      return { letter: visual.letter, color: visual.color, title: visual.label + ': ' + ev.title };
    }
    if (ev.category === 'event') return { letter: 'E', color: colors.event, title: `${formatTime12FromHHmm(ev.time || '')} ${ev.title}`.trim() };
    if (ev.category === 'parts') {
      const status = ev.partsStatus || 'ordered';
      const isSale = ev.source === 'sale';
      const colorDelivery = isSale ? colors.content : colors.partsDelivery;
      const colorOrdered = isSale ? colors.content : colors.partsOrdered;
      if (status === 'delivery') return { letter: 'D', color: colorDelivery, title: `${formatTime12FromHHmm(ev.time || '')} Est. Delivery ${ev.partName || ev.title || ''}`.trim() };
      return { letter: 'O', color: colorOrdered, title: `${formatTime12FromHHmm(ev.time || '')} Ordered ${ev.partName || ev.title || ''}`.trim() };
    }
    if (ev.category === 'consultation') return { letter: 'C', color: colors.consultation, title: `${formatTime12FromHHmm(ev.time || '')} Consult ${ev.customerName || ''} ${ev.title || ''}`.trim() };
    if (ev.category === 'task') return { letter: taskIsCompleted(ev) ? 'X' : 'K', color: colors.task, title: `${taskIsCompleted(ev) ? 'Completed' : 'Task'}: ${ev.title || 'Untitled task'}` };
    if (ev.category === 'content') {
      const visual = calendarEventVisual(ev);
      return { letter: visual.letter, color: visual.color, title: `${formatTime12FromHHmm(ev.time || '')} ${visual.label}: ${ev.title || ''}`.trim() };
    }
    if (ev.category === 'schedule') {
      // Show technician schedule for the current day
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const dayKey = dayNames[day.getDay()] as keyof NonNullable<CalendarEvent['schedule']>;
      const daySchedule = ev.schedule?.[dayKey];
      
      if (daySchedule?.off) {
        return { letter: 'X', color: '#71717A', title: `${ev.technician} - Off` };
      } else if (daySchedule?.start && daySchedule?.end) {
        const startTime = formatTime12FromHHmm(daySchedule.start);
        const endTime = formatTime12FromHHmm(daySchedule.end);
        return { letter: 'T', color: technicianColors[ev.technician || ''] || colors.schedule, title: `${ev.technician}: ${startTime} - ${endTime}` };
      }
      return null; // No schedule for this day
    }
    return { letter: ev.title?.[0]?.toUpperCase?.() || '?', color: '#71717A', title: ev.title || '' };
  }
  // Separate schedule and other events
  const scheduleEvents = events.filter(ev => ev.category === 'schedule');
  const otherEvents = events.filter(ev => ev.category !== 'schedule');
  const activeShifts = activeShiftEvents(day, scheduleEvents);
  const groupedEvents = Array.from(otherEvents.reduce((groups, event) => {
    const key = calendarEventGroupKey(event);
    const existing = groups.get(key) || [];
    existing.push(event);
    groups.set(key, existing);
    return groups;
  }, new Map<string, CalendarEvent[]>()).values());

  return (
    <div className="p-2 h-full min-h-0 flex flex-col overflow-hidden">
      <div className="text-sm text-zinc-400 flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={isToday ? 'inline-flex items-center justify-center w-7 h-7 rounded-full border-2 border-[#39FF14] text-[#39FF14] font-bold text-sm' : 'font-medium'}>{dayNum}</div>
          {activeShifts.length ? <button type="button" className="shrink-0 inline-flex items-center gap-1 rounded border border-[#39FF14]/70 bg-[#39FF14]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#d9ffd2] hover:bg-[#39FF14]/20" title={`Show ${activeShifts.length} active shift${activeShifts.length === 1 ? '' : 's'}`} onClick={() => onOpenShifts(day)}><span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-[#39FF14] text-[8px] text-zinc-950">S</span>{activeShifts.length}</button> : null}
        </div>
        <button className="text-xs px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700 transition-colors" onClick={() => onPick(day)}>
          + Add
        </button>
      </div>
      
      <div className="flex-1 min-h-0" />
      
      {/* Other event icons at bottom */}
      {groupedEvents.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-zinc-700">
          {groupedEvents.map((group) => {
            const ev = group[0];
            const b = blipFor(ev);
            if (!b) return null;
            return (
              <button
                type="button"
                key={calendarEventGroupKey(ev)}
                title={group.length > 1 ? `${group.length} ${calendarEventVisual(ev, colors).label} entries` : b.title}
                onClick={() => onOpenGroup(group)}
                className="relative w-6 h-6 rounded-md text-black font-bold text-[10px] flex items-center justify-center cursor-pointer shadow-md hover:brightness-110 border border-black/10 transition-all hover:scale-105"
                style={{ backgroundColor: b.color }}
              >
                {b.letter}
                {group.length > 1 ? <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-white px-1 text-[9px] font-black text-zinc-950 shadow">{group.length}</span> : null}
              </button>
            );
          })}
        </div>
      )}
      {notesVisible && (
        <button
          type="button"
          onClick={() => onOpenNotes(day)}
          title={notes.length ? notes.map(note => note.subject).filter(Boolean).join('\n') : 'No notes for this day. Click to add one.'}
          className={`mt-2 min-h-9 w-full border rounded px-2 py-1.5 text-sm font-semibold transition-colors ${notes.length ? 'text-black hover:brightness-110' : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
          style={notes.length ? { borderColor: colors.notes, backgroundColor: colors.notes } : undefined}
        >
          Notes{notes.length ? ` (${notes.length})` : ''}
        </button>
      )}
    </div>
  );
};

const CalendarWindow: React.FC = () => {
  const calendarPayload = useMemo(() => consumeWindowPayload('calendar'), []);
  const targetEventId = useMemo(() => {
    const queryId = new URLSearchParams(window.location.search).get('calendarEventId');
    return Number(calendarPayload?.calendarEventId || queryId || 0) || 0;
  }, [calendarPayload]);
  const targetOpenedRef = useRef(false);
  const [current, setCurrent] = useState<Date>(new Date());
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('month');
  const [isMobileCalendar, setIsMobileCalendar] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendarNotes, setCalendarNotes] = useState<CalendarNote[]>([]);
  const [notesDate, setNotesDate] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState({ subject: '', body: '' });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [contentEditorLocked, setContentEditorLocked] = useState(false);
  const [viewing, setViewing] = useState<CalendarEvent | null>(null);
  const [viewingGroup, setViewingGroup] = useState<CalendarEvent[] | null>(null);
  const [shiftDay, setShiftDay] = useState<string | null>(null);
  const [contentScheduleOpen, setContentScheduleOpen] = useState(false);
  const [dailyLookOpen, setDailyLookOpen] = useState<boolean>(() => Boolean(calendarPayload?.dailyLook));
  const [dailyLookDate, setDailyLookDate] = useState<string>(fmtDate(new Date()));
  const [dailyLookAssignedTo, setDailyLookAssignedTo] = useState<string>('');
  const [calendarColors, setCalendarColors] = useState<CalendarColors>(DEFAULT_CALENDAR_COLORS);
  const [savedCalendarColors, setSavedCalendarColors] = useState<CalendarColors>(DEFAULT_CALENDAR_COLORS);
  const [technicianColors, setTechnicianColors] = useState<Record<string, string>>({});
  const [savedTechnicianColors, setSavedTechnicianColors] = useState<Record<string, string>>({});
  const [businessCalendar, setBusinessCalendar] = useState<BusinessCalendarSettings>(DEFAULT_BUSINESS_CALENDAR_SETTINGS);
  const [savedBusinessCalendar, setSavedBusinessCalendar] = useState<BusinessCalendarSettings>(DEFAULT_BUSINESS_CALENDAR_SETTINGS);
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false);
  const [calendarSettingsSaving, setCalendarSettingsSaving] = useState(false);
  // For adding multiple estimated delivery dates in one go (parts only)
  const [deliveryDates, setDeliveryDates] = useState<string[]>([]);
  const [deliveryDateInput, setDeliveryDateInput] = useState<string>('');
  // Live technicians for deriving schedules
  const [techs, setTechs] = useState<any[]>([]);
  
  // Event type filters
  const [filters, setFilters] = useState({
    schedule: true,
    parts: true,
    events: true,
    consultation: true,
    content: true,
    tasks: true,
    notes: true,
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [settingsRows, legacyRows] = await Promise.all([
          (window as any).api.dbGet('settings').catch(() => []),
          (window as any).api.dbGet('calendarPreferences').catch(() => []),
        ]);
        const shopSettings = Array.isArray(settingsRows) ? settingsRows[0] : null;
        const legacy = Array.isArray(legacyRows) ? legacyRows[0] : null;
        const stored = (shopSettings?.calendarPreferences || legacy) as CalendarPreferences | null;
        if (!active || !stored) return;
        const colors = { ...DEFAULT_CALENDAR_COLORS, ...(stored.colors && typeof stored.colors === 'object' ? stored.colors : {}) };
        setCalendarColors(colors);
        setSavedCalendarColors(colors);
        const savedTechnicians = stored?.technicianColors && typeof stored.technicianColors === 'object' ? stored.technicianColors : {};
        setTechnicianColors(savedTechnicians);
        setSavedTechnicianColors(savedTechnicians);
        const savedBusiness = { ...DEFAULT_BUSINESS_CALENDAR_SETTINGS, ...(stored?.businessCalendar && typeof stored.businessCalendar === 'object' ? stored.businessCalendar : {}) };
        setBusinessCalendar(savedBusiness);
        setSavedBusinessCalendar(savedBusiness);
      } catch {
        // Calendar presentation uses defaults until preferences can be read.
      }
    })();
    return () => { active = false; };
  }, []);

  const saveCalendarSettings = async () => {
    setCalendarSettingsSaving(true);
    try {
      const rows = await (window as any).api.dbGet('settings');
      const existing = Array.isArray(rows) ? rows[0] : null;
      const now = new Date().toISOString();
      const calendarPreferences = { colors: calendarColors, technicianColors, businessCalendar, updatedAt: now };
      const payload = { ...(existing || {}), calendarPreferences, updatedAt: now };
      if (existing?.id != null) await (window as any).api.dbUpdate('settings', existing.id, payload);
      else await (window as any).api.dbAdd('settings', { ...payload, id: 1, createdAt: now });
      setSavedCalendarColors(calendarColors);
      setSavedTechnicianColors(technicianColors);
      setSavedBusinessCalendar(businessCalendar);
      setCalendarSettingsOpen(false);
    } finally {
      setCalendarSettingsSaving(false);
    }
  };

  useEffect(() => {
    if (!editing) setNotesExpanded(false);
  }, [editing]);

  useEffect(() => {
    if (!targetEventId || targetOpenedRef.current || !events.length) return;
    const target = events.find((event) => Number(event.id) === targetEventId);
    if (!target) return;
    targetOpenedRef.current = true;
    setCurrent(new Date(`${target.date}T12:00:00`));
    setViewing(target);
  }, [events, targetEventId]);

  useEffect(() => {
    const detect = () => {
      const mobile = /mobile\.html$/i.test(window.location.pathname) || !!document.querySelector('.gbpos-mobile');
      setIsMobileCalendar(mobile);
      if (mobile) setCalendarView((view) => view === 'month' ? 'week' : view);
    };
    detect();
    window.addEventListener('resize', detect);
    return () => window.removeEventListener('resize', detect);
  }, []);

  async function resolveConsultationLinks(ev: CalendarEvent) {
    const api: any = (window as any).api;
    let sale: any = null;
    const eventSaleId = Number((ev as any).saleId || 0) || 0;
    if (eventSaleId > 0 && api?.dbGet) {
      try {
        const sales = await api.dbGet('sales');
        sale = Array.isArray(sales) ? sales.find((s: any) => Number(s?.id || 0) === eventSaleId) || null : null;
      } catch {}
    }

    let customerId = Number((ev as any).customerId || 0) || Number(sale?.customerId || 0) || 0;
    let customerName = String(sale?.customerName || ev.customerName || '').trim();
    let customerPhone = String(sale?.customerPhone || ev.customerPhone || '').trim();

    // Fallback: try to resolve customer by exact phone/name when event has no customerId.
    if (!customerId && api?.dbGet) {
      try {
        const customers = await api.dbGet('customers');
        const needlePhone = String(ev.customerPhone || '').replace(/\D+/g, '').slice(-10);
        const needleName = String(ev.customerName || '').trim().toLowerCase();
        const found = Array.isArray(customers) ? customers.find((c: any) => {
          const cPhone = String(c?.phone || '').replace(/\D+/g, '').slice(-10);
          const cPhoneAlt = String(c?.phoneAlt || '').replace(/\D+/g, '').slice(-10);
          const cName = String(([c?.firstName, c?.lastName].filter(Boolean).join(' ') || c?.name || '')).trim().toLowerCase();
          const phoneMatch = !!needlePhone && (cPhone === needlePhone || cPhoneAlt === needlePhone);
          const nameMatch = !!needleName && !!cName && cName === needleName;
          return phoneMatch || nameMatch;
        }) : null;
        if (found) {
          customerId = Number(found.id || 0) || 0;
          if (!customerName) customerName = String(([found.firstName, found.lastName].filter(Boolean).join(' ') || found.name || '')).trim();
          if (!customerPhone) customerPhone = String(found.phone || '').trim();
        }
      } catch {}
    }

    return {
      sale,
      saleId: Number(sale?.id || eventSaleId || 0) || 0,
      customerId,
      customerName,
      customerPhone,
    };
  }

  async function openConsultationSale(ev: CalendarEvent) {
    const api: any = (window as any).api;
    const links = await resolveConsultationLinks(ev);
    if (!links.saleId) {
      alert('No linked sale found for this consultation event.');
      return;
    }
    if (!api?.openNewSale) return;
    await api.openNewSale({
      id: links.saleId,
      customerId: links.customerId || undefined,
      customerName: links.customerName || undefined,
      customerPhone: links.customerPhone || undefined,
    });
  }

  async function openConsultationCustomer(ev: CalendarEvent) {
    const api: any = (window as any).api;
    const links = await resolveConsultationLinks(ev);
    if (!links.customerId) {
      alert('No linked customer found for this consultation event.');
      return;
    }
    if (!api?.openCustomerOverview) return;
    await api.openCustomerOverview(links.customerId);
  }

  // Load events on open
  useEffect(() => {
    let alive = true;
    const refreshNotes = async () => {
      try {
        const list = await (window as any).api.dbGet('calendarNotes');
        if (alive && Array.isArray(list)) setCalendarNotes(list);
      } catch (error) {
        console.error('load calendar notes failed', error);
      }
    };
    const refreshEvents = async () => {
      try {
        const [list, customers] = await Promise.all([
          (window as any).api.dbGet('calendarEvents'),
          (window as any).api.dbGet('customers').catch(() => []),
        ]);
        const customerById = new Map((Array.isArray(customers) ? customers : []).map((customer: any) => [Number(customer?.id || 0), customer]));
        const enriched = (Array.isArray(list) ? list : []).map((event: CalendarEvent) => {
          const normalizedEvent = event.category === 'consultation' ? {
            ...event,
            location: consultationLocationDisplay(event),
            consultationAddress: consultationLocationDisplay(event),
          } : event;
          const customer: any = customerById.get(Number(event.customerId || 0));
          if (!customer) return normalizedEvent;
          return {
            ...normalizedEvent,
            customerEmail: normalizedEvent.customerEmail || customer.email || '',
            customerPhone: normalizedEvent.customerPhone || customer.phone || '',
            customerName: normalizedEvent.customerName || [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim(),
          };
        });
        if (alive) setEvents(enriched);
      } catch (e) { console.error('load calendar events failed', e); }
    };
    void refreshEvents();
    void refreshNotes();
    // Live updates
    const off = (window as any).api.onCalendarEventsChanged?.(() => { void refreshEvents(); });
    const offNotes = (window as any).api.onCalendarNotesChanged?.(() => { void refreshNotes(); });
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshEvents();
        void refreshNotes();
      }
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshEvents();
        void refreshNotes();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      if (off) off();
      if (offNotes) offNotes();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Load technicians for live schedule derivation
  useEffect(() => {
    let mounted = true;
    (async () => {
      try { const l = await listTechnicians(); if (mounted && Array.isArray(l)) setTechs(l as any); } catch {}
    })();
    const api: any = (window as any).api;
    const unsub = api?.onTechniciansChanged?.(async () => {
      try { const l = await listTechnicians(); setTechs(l as any); } catch {}
    });
    return () => { mounted = false; if (unsub) unsub(); };
  }, []);

  const monthDays = useMemo(() => {
    const start = startOfMonth(current);
    const end = endOfMonth(current);
    const startWeekday = start.getDay(); // 0-6
    const days: Date[] = [];
    // leading blanks (previous month fill) so the first week aligns with weekday
    for (let i = 0; i < startWeekday; i++) {
      days.push(addDays(start, i - startWeekday));
    }
    // current month days
    for (let d = 1; d <= end.getDate(); d++) {
      days.push(new Date(current.getFullYear(), current.getMonth(), d));
    }
    // trailing blanks to complete weeks only (no extra full row)
    const remainder = days.length % 7;
    const missing = remainder === 0 ? 0 : (7 - remainder);
    for (let i = 1; i <= missing; i++) {
      days.push(addDays(end, i));
    }
    return days;
  }, [current]);

  const calendarDays = useMemo(() => {
    if (!isMobileCalendar || calendarView === 'month') return monthDays;
    if (calendarView === 'day') return [new Date(current.getFullYear(), current.getMonth(), current.getDate())];
    const start = addDays(current, -current.getDay());
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [calendarView, current, isMobileCalendar, monthDays]);

  const businessCalendarEvents = useMemo(() => buildBusinessCalendarEvents(
    [current.getFullYear() - 1, current.getFullYear(), current.getFullYear() + 1],
    businessCalendar,
  ), [businessCalendar, current]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    
    // Process regular events
    for (const ev of events) {
      if (ev.category !== 'schedule') {
        // Apply filters
        const shouldShow = 
          (ev.category === 'parts' && filters.parts) ||
          (ev.category === 'event' && filters.events) ||
          (ev.category === 'consultation' && filters.consultation) ||
          (ev.category === 'content' && filters.content) ||
          (ev.category === 'task' && filters.tasks);
          
        if (shouldShow) {
          const k = ev.date;
          if (!map[k]) map[k] = [];
          map[k].push(ev);
        }
      }
    }

    if (filters.events) {
      for (const ev of businessCalendarEvents) {
        const k = ev.date;
        if (!map[k]) map[k] = [];
        map[k].push(ev);
      }
    }
    
    // Derive schedules live from technicians to avoid stale persisted schedule events
    if (filters.schedule && Array.isArray(techs) && techs.length) {
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
      calendarDays.forEach(day => {
        const k = fmtDate(day);
        for (const t of techs) {
          const schedule = t?.schedule || {};
          const dayKey = dayNames[day.getDay()] as keyof NonNullable<CalendarEvent['schedule']>;
          const sd = schedule?.[dayKey];
          if (!sd) continue;
          // Show line if off or has start/end
          if (sd.off || (sd.start && sd.end)) {
            if (!map[k]) map[k] = [];
            const techName = technicianDisplayName(t);
            const ev: CalendarEvent = {
              date: k,
              title: `${techName} - Work Schedule`,
              category: 'schedule',
              technician: techName,
              schedule: schedule,
            };
            map[k].push(ev);
          }
        }
      });
    }
    
    return map;
  }, [businessCalendarEvents, calendarDays, events, filters, techs]);

  const notesByDay = useMemo(() => {
    const map: Record<string, CalendarNote[]> = {};
    for (const note of calendarNotes) {
      const key = String(note?.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      if (!map[key]) map[key] = [];
      map[key].push(note);
    }
    for (const list of Object.values(map)) {
      list.sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
    }
    return map;
  }, [calendarNotes]);

  function openNotes(day: Date) {
    setNotesDate(fmtDate(day));
    setNoteDraft({ subject: '', body: '' });
    setEditingNoteId(null);
  }

  async function saveNote() {
    const date = String(notesDate || '').slice(0, 10);
    const subject = noteDraft.subject.trim();
    const body = noteDraft.body.trim();
    if (!date || !subject || !body || noteSaving) return;
    setNoteSaving(true);
    try {
      const existing = editingNoteId === null ? null : calendarNotes.find(note => String(note.id) === editingNoteId);
      const saved = existing
        ? await (window as any).api.dbUpdate('calendarNotes', existing.id, { ...existing, subject, body, updatedAt: new Date().toISOString() })
        : await (window as any).api.dbAdd('calendarNotes', { id: crypto.randomUUID(), date, subject, body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      if (saved) setCalendarNotes(list => existing ? list.map(note => String(note.id) === String(saved.id) ? saved : note) : [...list, saved]);
      setNoteDraft({ subject: '', body: '' });
      setEditingNoteId(null);
    } catch (error) {
      console.error('save calendar note failed', error);
    } finally {
      setNoteSaving(false);
    }
  }

  async function deleteNote(note: CalendarNote) {
    if (!note.id) return;
    try {
      const deleted = await (window as any).api.dbDelete('calendarNotes', note.id);
      if (deleted) setCalendarNotes(list => list.filter(item => item.id !== note.id));
    } catch (error) {
      console.error('delete calendar note failed', error);
    }
  }

  // Build a simple grouping key for parts events to relate deliveries to an order
  function partsGroupKey(ev: CalendarEvent) {
    if (ev.category !== 'parts') return '';
    const wo = ev.workOrderId ? String(ev.workOrderId) : '';
    const id2 = (ev.partName || ev.title || '').toString().trim();
    return `${wo}::${id2}`;
  }

  function movePeriod(direction: -1 | 1) {
    if (!isMobileCalendar || calendarView === 'month') {
      setCurrent(new Date(current.getFullYear(), current.getMonth() + direction, 1, 0, 0, 0, 0));
      return;
    }
    setCurrent(addDays(current, direction * (calendarView === 'week' ? 7 : 1)));
  }

  function onPick(day: Date) {
    setContentEditorLocked(false);
    setEditing({ date: fmtDate(day), title: '', time: '', category: 'event' });
    setDeliveryDates([]);
    setDeliveryDateInput('');
  }

  async function setTaskCompleted(event: CalendarEvent, completed: boolean) {
    if (event.id == null || event.category !== 'task') return;
    const now = new Date().toISOString();
    const updated = await (window as any).api.dbUpdate('calendarEvents', event.id, {
      ...event,
      taskCompleted: completed,
      taskCompletedAt: completed ? now : '',
      taskCompletedBy: completed ? String(event.technician || '') : '',
      updatedAt: now,
    });
    if (updated) {
      setEvents(list => list.map(item => String(item.id) === String(updated.id) ? updated : item));
      setViewing(currentViewing => currentViewing && String(currentViewing.id) === String(updated.id) ? updated : currentViewing);
      setViewingGroup(group => group ? group.map(item => String(item.id) === String(updated.id) ? updated : item) : group);
    }
  }
  function onEdit(ev: CalendarEvent) {
    if (ev.source === 'business-calendar') {
      setEditing(null);
      setViewing(ev);
      return;
    }
    setContentEditorLocked(false);
    setViewing(null);
    setEditing(ev);
    setDeliveryDateInput('');
    if (ev.category === 'parts') {
      const key = partsGroupKey(ev);
      const existing = events.filter(e => e.category === 'parts' && e.partsStatus === 'delivery' && partsGroupKey(e) === key).map(e => e.date);
      // unique preserve order
      const uniq = Array.from(new Set(existing));
      setDeliveryDates(uniq);
    } else {
      setDeliveryDates([]);
    }
  }

  async function saveEvent(ev: CalendarEvent) {
    try {
      // Derive title for certain categories if missing
      const payload: CalendarEvent = { ...ev };
      if (payload.category === 'parts' && !payload.partsStatus) payload.partsStatus = 'ordered';
      if (payload.category === 'parts' && (!payload.title || !payload.title.trim())) {
        payload.title = payload.partName || 'Part/Product';
      }
      if (payload.category === 'content' && !payload.source) payload.source = 'streaming';
      if (payload.category === 'task') {
        payload.title = payload.title.trim() || 'Task';
        payload.taskCompleted = payload.taskCompleted === true;
        if (!payload.taskCompleted) {
          payload.taskCompletedAt = '';
          payload.taskCompletedBy = '';
        }
      }
      // If user typed a date but didn't click Add, include it
      if (payload.category === 'parts' && deliveryDateInput && /^\d{4}-\d{2}-\d{2}$/.test(deliveryDateInput)) {
        if (!deliveryDates.includes(deliveryDateInput)) deliveryDates.push(deliveryDateInput);
      }
      if (ev.id) {
        const updated = await (window as any).api.dbUpdate('calendarEvents', ev.id, payload);
        if (updated) setEvents(list => list.map(x => x.id === updated.id ? updated : x));
      } else {
        const added = await (window as any).api.dbAdd('calendarEvents', payload);
        if (added) setEvents(list => [...list, added]);
      }
      // If parts and user entered multiple estimated delivery dates, sync calendar entries
      if (payload.category === 'parts') {
        const key = partsGroupKey(payload);
        const existingDeliveries = events.filter(e => e.category === 'parts' && e.partsStatus === 'delivery' && partsGroupKey(e) === key);
        const existingDates = new Set(existingDeliveries.map(e => e.date));
        const desiredDates = new Set(deliveryDates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)));

        // Add missing
        for (const iso of desiredDates) {
          if (!existingDates.has(iso)) {
            const deliveryEvent: CalendarEvent = { ...payload, id: undefined, date: iso, partsStatus: 'delivery' };
            try {
              const addedDelivery = await (window as any).api.dbAdd('calendarEvents', deliveryEvent);
              if (addedDelivery) setEvents(list => [...list, addedDelivery]);
            } catch (e) { console.error('add delivery event failed', e); }
          }
        }
        // Remove deleted
        for (const e of existingDeliveries) {
          if (!desiredDates.has(e.date) && e.id != null) {
            try {
              const ok = await (window as any).api.dbDelete('calendarEvents', e.id);
              if (ok) setEvents(list => list.filter(x => x.id !== e.id));
            } catch (e2) { console.error('delete delivery event failed', e2); }
          }
        }
      }
      setEditing(null);
      setContentEditorLocked(false);
      setDeliveryDates([]);
      setDeliveryDateInput('');
    } catch (e) { console.error('save event failed', e); }
  }

  // Silent autosave version (does not close modal or clear arrays)
  async function saveEventSilent(ev: CalendarEvent) {
    try {
      const payload: CalendarEvent = { ...ev };
      if (payload.category === 'parts' && !payload.partsStatus) payload.partsStatus = 'ordered';
      if (payload.category === 'parts' && (!payload.title || !payload.title.trim())) {
        payload.title = payload.partName || 'Part/Product';
      }
      if (payload.category === 'content' && !payload.source) payload.source = 'streaming';
      if (payload.category === 'task') {
        payload.title = payload.title.trim() || 'Task';
        payload.taskCompleted = payload.taskCompleted === true;
      }
      if (ev.id) {
        const updated = await (window as any).api.dbUpdate('calendarEvents', ev.id, payload);
        if (updated) setEvents(list => list.map(x => x.id === updated.id ? updated : x));
      } else {
        const added = await (window as any).api.dbAdd('calendarEvents', payload);
        if (added) {
          setEvents(list => [...list, added]);
          setEditing({ ...payload, id: added.id });
        }
      }
      // Sync delivery dates for parts silently
      if (payload.category === 'parts') {
        const key = partsGroupKey(payload);
        const existingDeliveries = events.filter(e => e.category === 'parts' && e.partsStatus === 'delivery' && partsGroupKey(e) === key);
        const existingDates = new Set(existingDeliveries.map(e => e.date));
        const desiredDates = new Set(deliveryDates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)));
        for (const iso of desiredDates) {
          if (!existingDates.has(iso)) {
            const deliveryEvent: CalendarEvent = { ...payload, id: undefined, date: iso, partsStatus: 'delivery' };
            try { const addedDelivery = await (window as any).api.dbAdd('calendarEvents', deliveryEvent); if (addedDelivery) setEvents(list => [...list, addedDelivery]); } catch {}
          }
        }
        for (const e of existingDeliveries) {
          if (!desiredDates.has(e.date) && e.id != null) {
            try { const ok = await (window as any).api.dbDelete('calendarEvents', e.id); if (ok) setEvents(list => list.filter(x => x.id !== e.id)); } catch {}
          }
        }
      }
    } catch (e) { /* silent */ }
  }

  async function deleteEvent(ev: CalendarEvent) {
    console.log('=== DELETE EVENT ATTEMPT ===');
    console.log('Event to delete:', ev);
    console.log('Event ID:', ev.id);
    console.log('Event category:', ev.category);
    
    if (!ev.id) { 
      console.log('No ID found, closing modal');
      setEditing(null); 
      setContentEditorLocked(false);
      return; 
    }
    
    let actualId = ev.id;
    
    // Handle virtual schedule event IDs
    if (ev.category === 'schedule' && ev.id && ev.id > 10) {
      // Virtual schedule events have IDs like: originalId + dayOfWeek
      // Extract original ID by removing the last digit (day of week)
      const idStr = ev.id.toString();
      if (idStr.length > 1) {
        actualId = Number(idStr.slice(0, -1));
        console.log('Schedule event - converted virtual ID', ev.id, 'to actual ID', actualId);
      }
    }
    
    try {
      console.log('Calling dbDelete for calendarEvents with actual ID:', actualId);
      const ok = await (window as any).api.dbDelete('calendarEvents', actualId);
      console.log('Delete result:', ok);
      
      if (ok) {
        console.log('Delete successful, updating local state');
        // Remove all schedule events with the same base ID (all virtual days)
        if (ev.category === 'schedule') {
          setEvents(list => list.filter(x => {
            if (x.category === 'schedule' && x.id && actualId) {
              const xActualId = x.id > 10 ? Number(x.id.toString().slice(0, -1)) : x.id;
              return xActualId !== actualId;
            }
            return x.id !== ev.id;
          }));
        } else {
          setEvents(list => list.filter(x => x.id !== ev.id));
        }
      } else {
        console.log('Delete failed - database returned false');
      }
      setEditing(null);
      setContentEditorLocked(false);
    } catch (e) { 
      console.error('delete event failed', e); 
    }
    console.log('=== DELETE EVENT END ===');
  }

  // Minimal validation for autosave
  function canAutosave(ev: CalendarEvent | null) {
    if (!ev) return false;
    if (!ev.date) return false;
    if (ev.category === 'parts') return !!(ev.partName || ev.title);
    if (ev.category === 'event') return !!(ev.title || ev.location || ev.time);
    if (ev.category === 'consultation') return !!(ev.customerName || ev.title);
    if (ev.category === 'content') return !!(ev.title && ev.technician);
    if (ev.category === 'task') return !!ev.title.trim();
    return true;
  }

  // Autosave editing after 2s of inactivity; keep modal open
  const autosavePayload = useMemo(() => ({ ev: editing, deliveryDates }), [editing, deliveryDates]);
  useAutosave(autosavePayload, async (val) => {
    if (!val.ev) return;
    await saveEventSilent(val.ev);
  }, {
    debounceMs: 1000,
    enabled: !!editing,
    skipInitialSave: true,
    shouldSave: (v) => canAutosave(v.ev),
    equals: Object.is,
  });

  const dailyLookData = useMemo(() => {
    const ymd = String(dailyLookDate || '').slice(0, 10);
    const dayDate = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)), 0, 0, 0, 0) : new Date();
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    const dayKey = dayNames[dayDate.getDay()];
    const assigned = (dailyLookAssignedTo || '').trim();

    const schedules: Array<{ name: string; start?: string; end?: string; off?: boolean }> = [];
    for (const t of Array.isArray(techs) ? techs : []) {
      const schedule = t?.schedule || {};
      const sd = schedule?.[dayKey];
      if (!sd) continue;
      const techName = technicianDisplayName(t);
      if (assigned && techName !== assigned) continue;
      if (sd.off || (sd.start && sd.end)) schedules.push({ name: techName, start: sd.start, end: sd.end, off: !!sd.off });
    }
    schedules.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const todays = [...(Array.isArray(events) ? events : []), ...businessCalendarEvents].filter(e => String(e?.date || '').slice(0, 10) === ymd);
    const consultations = todays
      .filter(e => e.category === 'consultation')
      .filter(e => (!assigned ? true : (String(e.technician || '').trim() === assigned)))
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    const eventItems = todays
      .filter(e => e.category === 'event')
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    const contentItems = todays
      .filter(e => e.category === 'content')
      .filter(e => (!assigned ? true : String(e.technician || '').trim() === assigned))
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    const partsAll = todays
      .filter(e => e.category === 'parts')
      .filter(e => (!assigned ? true : (String(e.technician || '').trim() === assigned)))
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    const partsDelivery = partsAll.filter(e => (e.partsStatus === 'delivery' || !e.partsStatus));
    const partsOrdered = partsAll.filter(e => e.partsStatus === 'ordered');
    const tasks = tasksForDailyLook(events, ymd, assigned);

    return { ymd, assigned, schedules, consultations, eventItems, contentItems, partsDelivery, partsOrdered, tasks };
  }, [businessCalendarEvents, dailyLookDate, dailyLookAssignedTo, events, techs]);

  useEffect(() => {
    if (isMobileCalendar && calendarView === 'day') setDailyLookDate(fmtDate(current));
  }, [calendarView, current, isMobileCalendar]);

  const periodLabel = useMemo(() => {
    if (!isMobileCalendar || calendarView === 'month') return current.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    if (calendarView === 'day') return current.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const start = addDays(current, -current.getDay());
    const end = addDays(start, 6);
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }, [calendarView, current, isMobileCalendar]);

  function eventSummary(ev: CalendarEvent): string {
    const time = formatTime12FromHHmm(ev.time || '');
    if (ev.category === 'schedule') {
      const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
      const schedule = ev.schedule?.[keys[new Date(`${ev.date}T12:00:00`).getDay()]];
      return `${ev.technician || 'Technician'}${schedule?.off ? ' - Off' : schedule?.start && schedule?.end ? ` - ${formatTime12FromHHmm(schedule.start)} to ${formatTime12FromHHmm(schedule.end)}` : ''}`;
    }
    if (ev.category === 'parts') {
      const action = ev.partsStatus === 'delivery' || !ev.partsStatus ? 'Expected' : 'Ordered';
      return `${time ? `${time} - ` : ''}${action}: ${ev.partName || ev.title || 'Part'}${ev.workOrderId ? ` (WO #${ev.workOrderId})` : ev.saleId ? ` (Sale #${ev.saleId})` : ''}`;
    }
    if (ev.category === 'consultation') return `${time ? `${time} - ` : ''}${ev.customerName || 'Consultation'}${ev.title ? `: ${ev.title}` : ''}`;
    if (ev.category === 'content') {
      const kind = ev.source === 'streaming' ? 'Stream' : 'Record';
      const end = formatTime12FromHHmm(ev.endTime || '');
      return `${time ? `${time}${end ? ` - ${end}` : ''} - ` : ''}${kind}: ${ev.title || 'Content session'}${ev.technician ? ` with ${ev.technician}` : ''}`;
    }
    return `${time ? `${time} - ` : ''}${ev.title || 'Event'}`;
  }

  const contentWeekDays = useMemo(() => {
    const start = addDays(current, -current.getDay());
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [current]);

  return (
    <div className="gb-calendar-window box-border p-4 bg-zinc-900 text-gray-100 h-[100dvh] max-h-[100dvh] min-h-0 flex flex-col overflow-hidden">
      <div className="gb-calendar-header flex shrink-0 flex-wrap items-center justify-between gap-3 mb-3">
        <div className="gb-calendar-title-actions flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-2xl font-semibold">Calendar - Schedule Management</h2>
          <button
            className="gb-calendar-content-schedule px-3 py-1 bg-fuchsia-700 border border-fuchsia-500 rounded text-sm"
            onClick={() => setContentScheduleOpen(true)}
          >
            Streaming/Content Schedule
          </button>
        </div>
        <div className="gb-calendar-controls flex flex-wrap items-center justify-end gap-2">
          <button className="gb-calendar-period-arrow px-2 py-1 bg-zinc-800 border border-zinc-700 rounded" aria-label="Previous calendar period" onClick={() => movePeriod(-1)}>&lt;</button>
          <div className="gb-calendar-period text-sm text-zinc-300 w-36 text-center">
            {periodLabel}
          </div>
          <button className="gb-calendar-period-arrow px-2 py-1 bg-zinc-800 border border-zinc-700 rounded" aria-label="Next calendar period" onClick={() => movePeriod(1)}>&gt;</button>
          <button
            className="gb-calendar-settings px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
            onClick={() => { setCalendarColors(savedCalendarColors); setTechnicianColors(savedTechnicianColors); setBusinessCalendar(savedBusinessCalendar); setCalendarSettingsOpen(true); }}
          >
            Settings
          </button>
        </div>
      </div>

      <div className="gb-calendar-view-toggle" role="group" aria-label="Calendar view">
        {(['day', 'week', 'month'] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={calendarView === view}
            onClick={() => {
              if (view === 'day') setCurrent(new Date());
              setCalendarView(view);
            }}
          >
            {view === 'day' ? 'Daily' : view === 'week' ? 'Weekly' : 'Monthly'}
          </button>
        ))}
      </div>

      {/* Event Type Filters */}
      <div className="gb-calendar-filters shrink-0 mb-2 p-2 bg-zinc-800 rounded-lg">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-zinc-400 font-medium">Show:</span>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[#39FF14]"
              checked={filters.schedule}
              onChange={(e) => setFilters(prev => ({ ...prev, schedule: e.target.checked }))}
            />
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded text-black text-xs flex items-center justify-center font-bold" style={{ backgroundColor: calendarColors.schedule }}>S</div>
              <span className="text-sm text-zinc-300">Schedules</span>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[#39FF14]"
              checked={filters.parts}
              onChange={(e) => setFilters(prev => ({ ...prev, parts: e.target.checked }))}
            />
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded text-black text-xs flex items-center justify-center font-bold" style={{ backgroundColor: calendarColors.partsOrdered }}>O</div>
              <span className="text-sm text-zinc-300">Orders/Parts</span>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[#39FF14]"
              checked={filters.events}
              onChange={(e) => setFilters(prev => ({ ...prev, events: e.target.checked }))}
            />
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded text-black text-xs flex items-center justify-center font-bold" style={{ backgroundColor: calendarColors.event }}>E</div>
              <span className="text-sm text-zinc-300">Events</span>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[#39FF14]"
              checked={filters.consultation}
              onChange={(e) => setFilters(prev => ({ ...prev, consultation: e.target.checked }))}
            />
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded text-black text-xs flex items-center justify-center font-bold" style={{ backgroundColor: calendarColors.consultation }}>C</div>
              <span className="text-sm text-zinc-300">Consultations</span>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-fuchsia-500"
              checked={filters.content}
              onChange={(e) => setFilters(prev => ({ ...prev, content: e.target.checked }))}
            />
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded text-black text-[9px] flex items-center justify-center font-bold" style={{ backgroundColor: calendarColors.streaming }}>V</div>
              <span className="text-sm text-zinc-300">Content</span>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-violet-400" checked={filters.tasks} onChange={(event) => setFilters(previous => ({ ...previous, tasks: event.target.checked }))} />
            <div className="flex items-center gap-1"><div className="w-4 h-4 rounded text-black text-xs flex items-center justify-center font-bold" style={{ backgroundColor: calendarColors.task }}>K</div><span className="text-sm text-zinc-300">Tasks</span></div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-amber-400"
              checked={filters.notes}
              onChange={(event) => setFilters(previous => ({ ...previous, notes: event.target.checked }))}
            />
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded text-black text-xs flex items-center justify-center font-bold" style={{ backgroundColor: calendarColors.notes }}>N</div>
              <span className="text-sm text-zinc-300">Important Notes</span>
            </div>
          </label>

          <div className="ml-3 flex gap-2">
            <button
              className="px-2.5 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded hover:bg-zinc-600 transition-colors"
              onClick={() => setFilters({ schedule: true, parts: true, events: true, consultation: true, content: true, tasks: true, notes: true })}
            >
              Select All
            </button>
            <button
              className="px-2.5 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded hover:bg-zinc-600 transition-colors"
              onClick={() => setFilters({ schedule: false, parts: false, events: false, consultation: false, content: false, tasks: false, notes: false })}
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      {!isMobileCalendar || calendarView === 'month' ? <div className="gb-calendar-month flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="grid grid-cols-7 gap-1.5 bg-zinc-800 rounded-lg overflow-hidden">
          {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => (
            <div key={d} className="text-sm font-medium text-zinc-300 bg-zinc-800 px-2.5 py-2.5 text-center">{d}</div>
          ))}
        </div>
        <div
          className="gb-calendar-month-grid grid grid-cols-7 gap-1.5 mt-1.5 flex-1 min-h-0 overflow-hidden"
          style={{ gridTemplateRows: `repeat(${Math.ceil(monthDays.length / 7)}, minmax(0, 1fr))` }}
        >
          {(() => { const todayStr = fmtDate(new Date()); return monthDays.map((day, idx) => {
            const key = fmtDate(day);
            const isCurrentMonth = day.getMonth() === current.getMonth();
            return (
              <div key={idx} className={`${isCurrentMonth ? 'bg-zinc-900' : 'bg-zinc-900/60'} rounded-lg border border-zinc-700 h-full min-h-0 overflow-hidden`}>
                {isCurrentMonth || isMobileCalendar ? (
                  <Cell
                    day={day}
                    events={eventsByDay[key] || []}
                    notes={notesByDay[key] || []}
                    notesVisible={filters.notes}
                    colors={calendarColors}
                    technicianColors={technicianColors}
                    onPick={onPick}
                    onOpenGroup={setViewingGroup}
                    onOpenNotes={openNotes}
                    onOpenShifts={(day) => setShiftDay(fmtDate(day))}
                    isToday={key === todayStr}
                  />
                ) : null}
              </div>
            );
          }); })()}
        </div>
      </div> : null}

      {isMobileCalendar && calendarView === 'week' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="gb-calendar-week-filter">
            <label>
              <span>Week of</span>
              <input
                type="date"
                value={fmtDate(current)}
                aria-label="Choose a date to show its week"
                onChange={(event) => {
                  const selected = new Date(`${event.target.value}T12:00:00`);
                  if (!Number.isNaN(selected.getTime())) setCurrent(selected);
                }}
              />
            </label>
          </div>
          <div className="gb-calendar-week flex-1 min-h-0 overflow-y-auto">
            {calendarDays.map((day) => {
              const key = fmtDate(day);
              const dayEvents = eventsByDay[key] || [];
              const dayNotes = notesByDay[key] || [];
              const activeShifts = activeShiftEvents(day, dayEvents);
              const nonShiftEvents = dayEvents.filter((event) => event.category !== 'schedule');
              const groupedDayEvents = Array.from(nonShiftEvents.reduce((groups, event) => {
                const groupKey = calendarEventGroupKey(event);
                const group = groups.get(groupKey) || [];
                group.push(event);
                groups.set(groupKey, group);
                return groups;
              }, new Map<string, CalendarEvent[]>()).values());
              const isToday = key === fmtDate(new Date());
              return (
                <section key={key} className={isToday ? 'is-today' : ''}>
                  <header>
                    <button type="button" onClick={() => { setCurrent(day); setCalendarView('day'); }}>
                      <strong>{day.toLocaleDateString(undefined, { weekday: 'short' })}</strong>
                      <span>{day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      {isToday ? <em>Today</em> : null}
                    </button>
                    <button type="button" aria-label={`Add calendar entry for ${key}`} onClick={() => onPick(day)}>+</button>
                  </header>
                  <div className="gb-calendar-agenda-list">
                    {activeShifts.length ? <button type="button" className="gb-calendar-week-shifts" aria-label={`Show ${activeShifts.length} active shift${activeShifts.length === 1 ? '' : 's'} for ${key}`} onClick={() => setShiftDay(key)}><span style={{ backgroundColor: calendarColors.schedule }}>S</span><strong>{activeShifts.length}</strong></button> : null}
                    {groupedDayEvents.map((group, index) => {
                      const event = group[0];
                      const visual = calendarEventVisual(event, calendarColors);
                      return (
                        <button
                          key={event.id || `${key}-${index}`}
                          type="button"
                          className={`gb-calendar-week-event type-${event.category || 'event'}`}
                          aria-label={`${visual.label}: ${eventSummary(event)}`}
                          onClick={() => setViewingGroup(group)}
                        >
                          <span className="gb-calendar-event-icon relative" style={{ backgroundColor: visual.color }}>{visual.short}{group.length > 1 ? <b className="absolute -right-2 -top-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-white px-1 text-[10px] text-zinc-950 shadow">{group.length}</b> : null}</span>
                          <span className="gb-calendar-event-copy">
                            <strong>{group.length > 1 ? `${group.length} ${visual.label} entries` : eventSummary(event)}</strong>
                            <small>{visual.label}{group.length > 1 ? ' - tap to view list' : ''}</small>
                          </span>
                        </button>
                      );
                    })}
                    {filters.notes ? (
                      <button
                        type="button"
                        className={`gb-calendar-week-note${dayNotes.length ? ' has-notes' : ''}`}
                        aria-label={dayNotes.length ? `${dayNotes.length} important note${dayNotes.length === 1 ? '' : 's'} for ${key}` : `Add an important note for ${key}`}
                        title={dayNotes.length ? dayNotes.map(note => note.subject).filter(Boolean).join('\n') : 'Add an important note'}
                        onClick={() => openNotes(day)}
                      >
                        <span>N</span>{dayNotes.length ? <strong>{dayNotes.length}</strong> : null}
                      </button>
                    ) : null}
                    {!activeShifts.length && !nonShiftEvents.length && (!filters.notes || !dayNotes.length) ? <span aria-label="No scheduled activity">—</span> : null}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {isMobileCalendar && calendarView === 'day' ? (
        <div className="gb-calendar-day flex-1 overflow-y-auto">
          <div className="gb-calendar-day-actions">
            <input type="date" value={dailyLookData.ymd} onChange={(event) => { setDailyLookDate(event.target.value); const next = new Date(`${event.target.value}T12:00:00`); if (!Number.isNaN(next.getTime())) setCurrent(next); }} />
            <select value={dailyLookAssignedTo} onChange={(event) => setDailyLookAssignedTo(event.target.value)} aria-label="Filter daily calendar by technician">
              <option value="">All technicians</option>
              {techs.map((tech: any) => { const name = technicianDisplayName(tech); return <option key={tech.id || name} value={name}>{name}</option>; })}
            </select>
            <button type="button" onClick={() => onPick(current)}>+ Add</button>
          </div>
          <div className="gb-calendar-day-sections">
            {filters.schedule ? <section><h3>Schedules <span>{dailyLookData.schedules.length}</span></h3>{dailyLookData.schedules.map((item) => <div key={item.name}><strong>{item.name}</strong><span>{item.off ? 'Off' : `${formatTime12FromHHmm(item.start || '')} - ${formatTime12FromHHmm(item.end || '')}`}</span></div>)}{!dailyLookData.schedules.length ? <p>No schedules.</p> : null}</section> : null}
            {filters.consultation ? <section><h3>Consultations <span>{dailyLookData.consultations.length}</span></h3>{dailyLookData.consultations.map((item, index) => <button key={item.id || index} type="button" onClick={() => onEdit(item)}>{eventSummary(item)}</button>)}{!dailyLookData.consultations.length ? <p>No consultations.</p> : null}</section> : null}
            {filters.parts ? <section><h3>Expected Deliveries <span>{dailyLookData.partsDelivery.length}</span></h3>{dailyLookData.partsDelivery.map((item, index) => <button key={item.id || index} type="button" onClick={() => onEdit(item)}>{eventSummary(item)}</button>)}{!dailyLookData.partsDelivery.length ? <p>No expected deliveries.</p> : null}</section> : null}
            {filters.parts ? <section><h3>Parts Ordered <span>{dailyLookData.partsOrdered.length}</span></h3>{dailyLookData.partsOrdered.map((item, index) => <button key={item.id || index} type="button" onClick={() => onEdit(item)}>{eventSummary(item)}</button>)}{!dailyLookData.partsOrdered.length ? <p>No parts ordered.</p> : null}</section> : null}
            {filters.events ? <section><h3>Events <span>{dailyLookData.eventItems.length}</span></h3>{dailyLookData.eventItems.map((item, index) => <button key={item.id || index} type="button" onClick={() => onEdit(item)}>{eventSummary(item)}</button>)}{!dailyLookData.eventItems.length ? <p>No events.</p> : null}</section> : null}
            {filters.content ? <section><h3>Streaming/Content <span>{dailyLookData.contentItems.length}</span></h3>{dailyLookData.contentItems.map((item, index) => <button key={item.id || index} type="button" onClick={() => setViewing(item)}>{eventSummary(item)}</button>)}{!dailyLookData.contentItems.length ? <p>No content sessions.</p> : null}</section> : null}
            {filters.tasks ? <section><h3>Tasks <span>{dailyLookData.tasks.length}</span></h3>{dailyLookData.tasks.map((task, index) => <label key={task.id || index} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-violet-400" checked={taskIsCompleted(task)} onChange={event => { void setTaskCompleted(task, event.target.checked); }} /><span className={taskIsCompleted(task) ? 'line-through text-zinc-500' : ''}><strong>{task.title || 'Task'}</strong><small className="block text-zinc-400">{task.date < dailyLookData.ymd ? `Carried from ${task.date}` : task.technician || 'All technicians'}</small></span></label>)}{!dailyLookData.tasks.length ? <p>No tasks.</p> : null}</section> : null}
            {filters.notes ? <section><h3>Important Notes <span>{(notesByDay[dailyLookData.ymd] || []).length}</span></h3>{(notesByDay[dailyLookData.ymd] || []).map((note) => <button key={String(note.id)} type="button" onClick={() => { setNotesDate(dailyLookData.ymd); setEditingNoteId(String(note.id)); setNoteDraft({ subject: note.subject || '', body: note.body || '' }); }}><strong>{note.subject}</strong><span className="block text-xs text-zinc-400">{note.body}</span></button>)}{!(notesByDay[dailyLookData.ymd] || []).length ? <p>No important notes.</p> : null}</section> : null}
          </div>
        </div>
      ) : null}

      {notesDate && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-3" onClick={() => setNotesDate(null)}>
          <div className="calendar-notes-dialog bg-zinc-900 border border-zinc-700 rounded w-full max-w-[1040px] h-[min(82vh,720px)] flex flex-col p-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-semibold">Important Notes</h3>
                <div className="text-sm text-zinc-400">{new Date(`${notesDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
              </div>
              <button type="button" className="gb-icon-button" aria-label="Close notes" onClick={() => setNotesDate(null)}>X</button>
            </div>
            <div className="calendar-notes-workspace grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] gap-3">
              <section className="calendar-note-reader min-h-0 flex flex-col rounded border border-zinc-700 bg-zinc-950/50 p-3">
                <div className="font-semibold text-sm mb-2">{editingNoteId === null ? 'Add New Note' : 'Edit Note'}</div>
                <input className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" placeholder="Subject" value={noteDraft.subject} onChange={event => setNoteDraft(draft => ({ ...draft, subject: event.target.value }))} />
                <textarea className="mt-2 min-h-0 flex-1 w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-3 resize-none leading-relaxed" placeholder="Write the important note..." value={noteDraft.body} onChange={event => setNoteDraft(draft => ({ ...draft, body: event.target.value }))} />
                <div className="mt-3 flex justify-end gap-2">
                {editingNoteId !== null ? <button type="button" className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded" onClick={() => { setEditingNoteId(null); setNoteDraft({ subject: '', body: '' }); }}>Cancel edit</button> : null}
                <button type="button" className="px-3 py-1.5 bg-amber-400 text-black font-semibold rounded disabled:opacity-50" disabled={!noteDraft.subject.trim() || !noteDraft.body.trim() || noteSaving} onClick={() => { void saveNote(); }}>
                  {noteSaving ? 'Saving...' : editingNoteId === null ? 'Add New Note' : 'Save Note'}
                </button>
                </div>
              </section>
              <aside className="calendar-note-list min-h-0 overflow-y-auto rounded border border-zinc-700 bg-zinc-950/50 p-2">
                {(notesByDay[notesDate] || []).length === 0 ? <div className="text-sm text-zinc-500 p-2">No notes for this day yet.</div> : (notesByDay[notesDate] || []).map(note => (
                  <div key={String(note.id)} className={`mb-2 rounded border p-2 ${String(note.id) === editingNoteId ? 'border-amber-400 bg-amber-400/15' : 'border-zinc-700 bg-zinc-900'}`}>
                    <button type="button" className="w-full text-left" onClick={() => { setEditingNoteId(String(note.id)); setNoteDraft({ subject: note.subject || '', body: note.body || '' }); }}><strong className="block truncate text-sm text-amber-100">{note.subject}</strong><span className="mt-1 block line-clamp-3 whitespace-pre-wrap text-xs text-zinc-400">{note.body}</span></button>
                    <button type="button" className="mt-2 text-xs text-zinc-500 hover:text-red-300" onClick={() => { void deleteNote(note); }}>Delete</button>
                  </div>
                ))}
              </aside>
            </div>
          </div>
        </div>
      )}

      {shiftDay && (() => {
        const day = new Date(`${shiftDay}T12:00:00`);
        const shifts = activeShiftEvents(day, eventsByDay[shiftDay] || []);
        const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day.getDay()] as keyof NonNullable<CalendarEvent['schedule']>;
        return <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-3">
          <section className="gb-calendar-shifts-dialog bg-zinc-900 border border-zinc-700 rounded w-full max-w-[480px] max-h-[88vh] flex flex-col p-4" role="dialog" aria-modal="true" aria-labelledby="calendar-shifts-title">
            <div className="flex items-start justify-between gap-3 mb-4"><div><h3 id="calendar-shifts-title" className="text-xl font-semibold">Active Shifts</h3><div className="text-sm text-zinc-400">{day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div></div><button type="button" className="gb-icon-button" aria-label="Close active shifts" onClick={() => setShiftDay(null)}>X</button></div>
            <div className="min-h-0 overflow-y-auto space-y-2 pr-1">
              {shifts.map((event, index) => { const shift = event.schedule?.[dayKey]; return <div key={event.id || `${event.technician}-${index}`} className="flex items-center justify-between gap-3 border border-zinc-700 bg-zinc-800 rounded p-3"><strong>{event.technician || 'Technician'}</strong><span className="text-sm text-zinc-300">{formatTime12FromHHmm(shift?.start || '')} - {formatTime12FromHHmm(shift?.end || '')}</span></div>; })}
            </div>
          </section>
        </div>;
      })()}

      {calendarSettingsOpen && (
        <div className="gb-calendar-settings-layer fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
          <section className="gb-calendar-settings-dialog bg-zinc-900 border border-zinc-700 rounded w-full max-w-[860px] max-h-[90vh] flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="calendar-settings-title">
            <div className="gb-calendar-settings-header flex items-center justify-between gap-3 border-b border-zinc-700 p-4">
              <div><h3 id="calendar-settings-title" className="text-xl font-semibold">Calendar Settings</h3><p className="text-sm text-zinc-400">Choose business dates, calendar colors, and technician shift colors.</p></div>
              <button type="button" className="gb-icon-button" aria-label="Close calendar settings" onClick={() => { setCalendarColors(savedCalendarColors); setTechnicianColors(savedTechnicianColors); setBusinessCalendar(savedBusinessCalendar); setCalendarSettingsOpen(false); }}>X</button>
            </div>
            <div className="gb-calendar-settings-body min-h-0 overflow-y-auto p-4">
              <section className="gb-calendar-settings-section">
                <div className="gb-calendar-settings-section-title"><div><strong>Business Calendar</strong><span>Show useful dates without creating editable calendar records.</span></div></div>
                <div className="gb-business-calendar-options">
                  {([
                    ['federalHolidays', 'U.S. federal holidays', 'Observed federal holiday dates and shop-hours reminders.'],
                    ['scTaxFreeWeekend', 'South Carolina tax-free weekend', 'The annual 72-hour sales tax holiday beginning the first Friday in August.'],
                    ['daylightSaving', 'Daylight saving time changes', 'Spring-forward and fall-back reminders at 2:00 AM local time.'],
                    ['estimatedTaxDeadlines', 'Estimated tax payment reminders', 'General quarterly reminders; verify applicability with your accountant.'],
                  ] as Array<[keyof BusinessCalendarSettings, string, string]>).map(([key, label, detail]) => (
                    <label key={key}><input type="checkbox" checked={businessCalendar[key]} onChange={(event) => setBusinessCalendar(settings => ({ ...settings, [key]: event.target.checked }))} /><span><strong>{label}</strong><small>{detail}</small></span></label>
                  ))}
                </div>
              </section>

              <details className="gb-calendar-settings-section" open>
                <summary>Calendar Color Wheels</summary>
                <div className="gb-calendar-color-grid">{([
                  ['schedule', 'Default technician shifts'], ['partsOrdered', 'Parts ordered'], ['partsDelivery', 'Expected deliveries'], ['event', 'Events'], ['consultation', 'Consultations'], ['streaming', 'Streaming'], ['content', 'Content recording'], ['task', 'Tasks'], ['notes', 'Important notes'], ['federalHoliday', 'Federal holidays'], ['scTaxFreeWeekend', 'SC tax-free weekend'], ['daylightSaving', 'Daylight saving time'], ['estimatedTaxDeadline', 'Tax reminders'],
                ] as Array<[keyof CalendarColors, string]>).map(([key, label]) => <div key={key} className="gb-calendar-color-row"><input className="gb-calendar-color-wheel" type="color" value={calendarColors[key]} aria-label={`${label} color wheel`} onChange={(event) => setCalendarColors(colors => ({ ...colors, [key]: event.target.value }))} /><span>{label}</span><button type="button" onClick={() => setCalendarColors(colors => ({ ...colors, [key]: DEFAULT_CALENDAR_COLORS[key] }))}>Default</button></div>)}</div>
              </details>

              <details className="gb-calendar-settings-section">
                <summary>Technician Shift Color Wheels</summary>
                <div className="gb-calendar-color-grid technician-colors">
                  {techs.filter((tech: any) => tech?.active !== false).map((tech: any) => { const name = technicianDisplayName(tech); return <div key={tech.id || name} className="gb-calendar-color-row"><input className="gb-calendar-color-wheel" type="color" value={technicianColors[name] || calendarColors.schedule} aria-label={`${name} shift color wheel`} onChange={(event) => setTechnicianColors(colors => ({ ...colors, [name]: event.target.value }))} /><span>{name}</span><button type="button" onClick={() => setTechnicianColors(colors => { const next = { ...colors }; delete next[name]; return next; })}>Default</button></div>; })}
                  {!techs.length ? <p className="text-sm text-zinc-500">Add technicians in Admin to assign individual shift colors.</p> : null}
                </div>
              </details>
            </div>
            <div className="gb-calendar-settings-footer flex justify-between gap-2 border-t border-zinc-700 p-4">
              <button type="button" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" onClick={() => setCalendarColors(DEFAULT_CALENDAR_COLORS)}>Restore defaults</button>
              <div className="flex gap-2"><button type="button" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" onClick={() => { setCalendarColors(savedCalendarColors); setTechnicianColors(savedTechnicianColors); setBusinessCalendar(savedBusinessCalendar); setCalendarSettingsOpen(false); }}>Cancel</button><button type="button" className="px-3 py-2 bg-[#39FF14] text-black font-semibold rounded disabled:opacity-50" disabled={calendarSettingsSaving} onClick={() => { void saveCalendarSettings(); }}>{calendarSettingsSaving ? 'Saving...' : 'Save settings'}</button></div>
            </div>
          </section>
        </div>
      )}

      {viewingGroup && viewingGroup.length ? (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={() => setViewingGroup(null)}>
          <section className="w-full max-w-[620px] max-h-[86vh] overflow-hidden rounded border border-zinc-700 bg-zinc-900 shadow-2xl flex flex-col" role="dialog" aria-modal="true" aria-labelledby="calendar-group-title" onClick={event => event.stopPropagation()}>
            <header className="flex items-start justify-between gap-3 border-b border-zinc-800 p-4"><div><h3 id="calendar-group-title" className="text-xl font-semibold">{calendarEventVisual(viewingGroup[0], calendarColors).label}</h3><p className="text-sm text-zinc-400">{new Date(`${viewingGroup[0].date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} - {viewingGroup.length} {viewingGroup.length === 1 ? 'entry' : 'entries'}</p></div><button type="button" className="gb-icon-button" aria-label="Close grouped calendar entries" onClick={() => setViewingGroup(null)}>X</button></header>
            <div className="min-h-0 overflow-y-auto p-3 space-y-2">
              {viewingGroup.slice().sort((left, right) => toMinutes(left.time) - toMinutes(right.time)).map((event, index) => (
                <div key={event.id || index} className="flex items-center gap-3 rounded border border-zinc-700 bg-zinc-800 p-3">
                  {event.category === 'task' ? <input type="checkbox" className="h-5 w-5 shrink-0 accent-violet-400" checked={taskIsCompleted(event)} aria-label={`Mark ${event.title || 'task'} complete`} onChange={change => { void setTaskCompleted(event, change.target.checked); }} /> : <span className="gb-calendar-event-icon shrink-0" style={{ backgroundColor: calendarEventVisual(event, calendarColors).color }}>{calendarEventVisual(event, calendarColors).short}</span>}
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setViewingGroup(null); setViewing(event); }}><strong className={`block break-words ${taskIsCompleted(event) ? 'text-zinc-500 line-through' : ''}`}>{eventSummary(event)}</strong><small className="block text-zinc-400">{event.technician || event.location || (event.id != null ? 'Open details' : '')}</small></button>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
          <div className="gb-calendar-event-detail bg-zinc-900 border border-zinc-700 rounded w-full max-w-[480px] max-h-[88vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-zinc-800">
              <div className="flex items-center gap-3 min-w-0">
                <span className="gb-calendar-event-icon" style={{ backgroundColor: calendarEventVisual(viewing, calendarColors).color }}>{calendarEventVisual(viewing, calendarColors).short}</span>
                <div className="min-w-0">
                  <div className="text-xs uppercase text-zinc-400">{calendarEventVisual(viewing, calendarColors).label}</div>
                  <h3 className="font-semibold text-lg break-words">{viewing.title || calendarEventVisual(viewing, calendarColors).label}</h3>
                </div>
              </div>
              <button type="button" className="gb-icon-button" aria-label="Close event details" onClick={() => setViewing(null)}>X</button>
            </div>
            <div className="gb-calendar-detail-grid p-4">
              <div><span>Date</span><strong>{new Date(`${viewing.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</strong></div>
              <div><span>Time</span><strong>{formatTime12FromHHmm(viewing.time || '') || 'Not specified'}{viewing.endTime ? ` - ${formatTime12FromHHmm(viewing.endTime)}` : ''}</strong></div>
              {viewing.technician ? <div><span>Assigned</span><strong>{viewing.technician}</strong></div> : null}
              {viewing.customerName ? <div><span>Client</span><strong>{viewing.customerName}</strong></div> : null}
              {viewing.customerPhone ? <div><span>Phone</span><strong>{formatPhone(viewing.customerPhone)}</strong></div> : null}
              {viewing.customerEmail ? <div><span>Email</span><strong>{viewing.customerEmail}</strong></div> : null}
              {viewing.category === 'consultation' && viewing.consultationAddress ? <div className="detail-wide"><span>Address</span><strong>{viewing.consultationAddress}</strong></div> : null}
              {viewing.location ? <div><span>Platform / location</span><strong>{viewing.location}</strong></div> : null}
              {viewing.partName ? <div><span>Part / product</span><strong>{viewing.partName}</strong></div> : null}
              {viewing.workOrderId ? <div><span>Work order</span><strong>#{viewing.workOrderId}</strong></div> : null}
              {viewing.notes ? <div className="detail-wide"><span>Notes</span><strong>{viewing.notes}</strong></div> : null}
            </div>
            {viewing.category !== 'schedule' ? (
              <div className="flex justify-end gap-2 p-4 border-t border-zinc-800">
                {viewing.category === 'task' ? <button type="button" className={`px-3 py-2 rounded font-semibold ${taskIsCompleted(viewing) ? 'bg-zinc-700 text-zinc-100' : 'bg-violet-500 text-white'}`} onClick={() => { void setTaskCompleted(viewing, !taskIsCompleted(viewing)); }}>{taskIsCompleted(viewing) ? 'Mark Incomplete' : 'Complete Task'}</button> : null}
                <button type="button" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" onClick={() => onEdit(viewing)}>Edit</button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {contentScheduleOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-3">
          <div className="gb-content-schedule bg-zinc-900 border border-zinc-700 rounded w-full max-w-[1180px] max-h-[92vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-800">
              <div>
                <h3 className="font-semibold text-xl">Streaming/Content Schedule</h3>
                <p className="text-xs text-zinc-400">Plan streams, filming, and production work for the selected week.</p>
              </div>
              <button type="button" className="gb-icon-button" aria-label="Close streaming and content schedule" onClick={() => setContentScheduleOpen(false)}>X</button>
            </div>
            <div className="gb-content-week-nav">
              <button type="button" aria-label="Previous content week" onClick={() => setCurrent(addDays(current, -7))}>&lt;</button>
              <strong>{contentWeekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {contentWeekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
              <button type="button" aria-label="Next content week" onClick={() => setCurrent(addDays(current, 7))}>&gt;</button>
            </div>
            <div className="gb-content-week-list">
              {contentWeekDays.map((day) => {
                const date = fmtDate(day);
                const isToday = date === fmtDate(new Date());
                const entries = events
                  .filter((event) => event.category === 'content' && event.date === date)
                  .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
                return (
                  <section key={date} className={isToday ? 'is-today' : ''}>
                    <header>
                      <button
                        type="button"
                        className="gb-content-day-button"
                        onClick={() => {
                          setCurrent(day);
                          setCalendarView('day');
                          setContentScheduleOpen(false);
                        }}
                      >
                        <strong>{day.toLocaleDateString(undefined, { weekday: 'short' })}</strong>
                        <span>{day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        {isToday ? <em>Today</em> : null}
                      </button>
                      <button
                        type="button"
                        aria-label={`Add streaming or content entry for ${date}`}
                        onClick={() => {
                          setContentEditorLocked(true);
                          setEditing({ date, title: '', time: '', endTime: '', category: 'content', source: 'streaming', technician: '' });
                        }}
                      >
                        +
                      </button>
                    </header>
                    <div className="gb-content-day-events">
                      {entries.map((entry, index) => {
                        const visual = calendarEventVisual(entry);
                        return (
                          <button
                            key={entry.id || `${date}-${index}`}
                            type="button"
                            aria-label={`${visual.label}: ${eventSummary(entry)}`}
                            onClick={() => setViewing(entry)}
                          >
                            <span className={`gb-calendar-event-icon ${visual.color}`}>{visual.short}</span>
                            <span><strong>{eventSummary(entry)}</strong>{entry.location ? <small>{entry.location}</small> : null}</span>
                          </button>
                        );
                      })}
                      {!entries.length ? <p aria-label="No streaming or content scheduled">—</p> : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="gb-calendar-editor bg-zinc-900 border border-zinc-700 rounded p-4 w-[520px]">
            <h3 className="font-semibold mb-2">
              {contentEditorLocked ? 'Add streaming/content entry' : `${editing.id ? 'Edit' : 'Add'} calendar entry`}
            </h3>
            {/* Category selector */}
            {!contentEditorLocked && !editing.id ? <div className="flex flex-wrap gap-2 mb-3">
              {([
                { key: 'parts', label: 'Parts/Products' },
                { key: 'event', label: 'Events' },
                { key: 'consultation', label: 'Consultation' },
                { key: 'content', label: 'Streaming/Content' },
                { key: 'task', label: 'Tasks' },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  className={`px-2 py-1 rounded border text-xs ${editing.category === opt.key ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}
                  onClick={() => setEditing({ ...editing, category: opt.key as any })}
                >{opt.label}</button>
              ))}
            </div> : !contentEditorLocked ? <div className="mb-3 flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"><span className={`gb-calendar-event-icon ${calendarEventVisual(editing).color}`}>{calendarEventVisual(editing).short}</span><strong>{calendarEventVisual(editing).label}</strong></div> : null}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-zinc-400">Date</label>
                <input type="date" className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Time</label>
                <input type="time" className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.time || ''} onChange={e => setEditing({ ...editing, time: e.target.value })} />
              </div>
              {editing.category === 'content' && (
                <div>
                  <label className="block text-xs text-zinc-400">End time</label>
                  <input type="time" className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.endTime || ''} onChange={e => setEditing({ ...editing, endTime: e.target.value })} />
                </div>
              )}
              {/* Dynamic fields per category */}
              {editing.category === 'parts' && (
                <>
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400">Part or product name</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.partName || ''} onChange={e => setEditing({ ...editing, partName: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">Work order # (optional)</label>
                    <input type="number" className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.workOrderId || ''} onChange={e => setEditing({ ...editing, workOrderId: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">Order URL (optional)</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.orderUrl || ''} onChange={e => setEditing({ ...editing, orderUrl: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">Tracking URL (optional)</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={(editing as any).trackingUrl || ''} onChange={e => setEditing({ ...(editing as any), trackingUrl: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400">Estimated delivery date(s)</label>
                    <div className="flex items-end gap-2 mt-1">
                      <div className="flex-1">
                        <input
                          type="date"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                          value={deliveryDateInput}
                          onChange={e => setDeliveryDateInput(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                        onClick={() => {
                          const v = (deliveryDateInput || '').trim();
                          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                          setDeliveryDates(list => (list.includes(v) ? list : [...list, v]));
                          setDeliveryDateInput('');
                        }}
                      >Add</button>
                    </div>
                    {deliveryDates.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {deliveryDates.map(d => (
                          <span key={d} className="inline-flex items-center gap-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5">
                            {d}
                            <button
                              type="button"
                              className="text-zinc-400 hover:text-zinc-200"
                              onClick={() => setDeliveryDates(list => list.filter(x => x !== d))}
                              aria-label={`Remove ${d}`}
                            >×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-500 mt-1">Saving will add one calendar entry per date above, marked as delivery (D).</div>
                  </div>
                </>
              )}
              {editing.category === 'event' && (
                <>
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400">Title</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400">Location (optional)</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.location || ''} onChange={e => setEditing({ ...editing, location: e.target.value })} />
                  </div>
                </>
              )}
              {editing.category === 'task' && (
                <>
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400">Task</label>
                    <input autoFocus className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.title || ''} onChange={event => setEditing({ ...editing, title: event.target.value })} placeholder="What needs to be completed?" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400">Assigned technician (optional)</label>
                    <select className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.technician || ''} onChange={event => setEditing({ ...editing, technician: event.target.value })}>
                      <option value="">All technicians</option>
                      {techs.map((tech: any) => { const name = technicianDisplayName(tech); return <option key={tech.id || name} value={name}>{name}</option>; })}
                    </select>
                  </div>
                  {editing.id != null ? <label className="col-span-2 flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-violet-400" checked={taskIsCompleted(editing)} onChange={event => setEditing({ ...editing, taskCompleted: event.target.checked, taskCompletedAt: event.target.checked ? new Date().toISOString() : '', taskCompletedBy: event.target.checked ? String(editing.technician || '') : '' })} /><span>Completed</span></label> : null}
                </>
              )}
              {editing.category === 'consultation' && (
                <>
                  <div>
                    <label className="block text-xs text-zinc-400">Customer name</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.customerName || ''} onChange={e => setEditing({ ...editing, customerName: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">Phone</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.customerPhone || ''} onChange={e => setEditing({ ...editing, customerPhone: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">Email</label>
                    <input type="email" className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.customerEmail || ''} onChange={e => setEditing({ ...editing, customerEmail: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">Address</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.consultationAddress || editing.location || ''} onChange={e => setEditing({ ...editing, consultationAddress: e.target.value, location: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">Technician</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.technician || ''} onChange={e => setEditing({ ...editing, technician: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">Title (optional)</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
                  </div>
                  <div className="col-span-2 flex gap-2 mt-1">
                    <button
                      type="button"
                      className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                      onClick={() => { void openConsultationSale(editing); }}
                      title="Open linked consultation sale"
                    >
                      View Consultation Sale
                    </button>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                      onClick={() => { void openConsultationCustomer(editing); }}
                      title="Open linked customer record"
                    >
                      View Client Info
                    </button>
                  </div>
                </>
              )}
              {editing.category === 'content' && (
                <>
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400">Session type</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        type="button"
                        className={`px-3 py-2 border rounded text-sm ${editing.source === 'streaming' ? 'bg-fuchsia-600 border-fuchsia-400 text-white' : 'bg-zinc-800 border-zinc-700'}`}
                        onClick={() => setEditing({ ...editing, source: 'streaming' })}
                      >
                        Streaming
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-2 border rounded text-sm ${editing.source === 'content' ? 'bg-cyan-500 border-cyan-300 text-black' : 'bg-zinc-800 border-zinc-700'}`}
                        onClick={() => setEditing({ ...editing, source: 'content' })}
                      >
                        Record Content
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400">Who is involved</label>
                    <input
                      list="calendar-content-names"
                      className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                      value={editing.technician || ''}
                      onChange={e => setEditing({ ...editing, technician: e.target.value })}
                      placeholder="Name or names"
                    />
                    <datalist id="calendar-content-names">
                      {techs.map((tech: any) => {
                        const name = technicianDisplayName(tech);
                        return <option key={tech.id || name} value={name} />;
                      })}
                    </datalist>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400">What is being streamed or recorded</label>
                    <input
                      className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                      value={editing.title || ''}
                      onChange={e => setEditing({ ...editing, title: e.target.value })}
                      placeholder="Game, stream type, video topic, or production task"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400">Platform or location (optional)</label>
                    <input
                      className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                      value={editing.location || ''}
                      onChange={e => setEditing({ ...editing, location: e.target.value })}
                      placeholder="Twitch, YouTube, studio, shop floor..."
                    />
                  </div>
                </>
              )}
              {/* Schedule entries are managed in Admin → Technicians and are not editable here */}
              <div className="col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-xs text-zinc-400">Notes</label>
                  <button
                    type="button"
                    className="px-2.5 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                    onClick={() => setNotesExpanded(true)}
                  >
                    Expand Notes
                  </button>
                </div>
                <textarea
                  className="gb-calendar-notes w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-2 min-h-[190px] resize-y"
                  value={editing.notes || ''}
                  onChange={e => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              {editing.id && <button className="px-3 py-1 bg-red-700 text-white rounded" onClick={() => deleteEvent(editing)}>Delete</button>}
              <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded" onClick={() => { setEditing(null); setContentEditorLocked(false); }}>Cancel</button>
              <button className="px-3 py-1 bg-[#39FF14] text-black rounded" onClick={() => saveEvent(editing)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {editing && notesExpanded && (
        <div
          className="fixed inset-0 z-[70] bg-black/75 flex items-center justify-center p-3 sm:p-6"
          role="presentation"
          onClick={() => setNotesExpanded(false)}
        >
          <div
            className="w-full max-w-[860px] max-h-[88vh] bg-zinc-900 border border-zinc-700 rounded shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-expanded-notes-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800">
              <div className="min-w-0">
                <h3 id="calendar-expanded-notes-title" className="font-semibold text-lg">Calendar Entry Notes</h3>
                <p className="text-xs text-zinc-400 truncate">{editing.title || calendarEventVisual(editing).label}</p>
              </div>
              <button type="button" className="gb-icon-button" aria-label="Close expanded notes" onClick={() => setNotesExpanded(false)}>X</button>
            </div>
            <div className="p-4 flex-1 min-h-0">
              <textarea
                autoFocus
                className="w-full h-[58vh] min-h-[300px] max-h-[68vh] bg-zinc-800 border border-zinc-700 rounded px-3 py-3 resize-none leading-relaxed"
                value={editing.notes || ''}
                onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
                placeholder="Add detailed notes for this calendar entry..."
              />
            </div>
          </div>
        </div>
      )}

      {dailyLookOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4 w-[780px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-xl font-semibold">Daily Look</div>
                <div className="text-xs text-zinc-400">Schedules, tasks, parts, events, consultations, and important notes for the day.</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
                  value={dailyLookData.ymd}
                  onChange={e => setDailyLookDate(e.target.value)}
                />
                <select
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm max-w-[220px]"
                  value={dailyLookAssignedTo}
                  onChange={e => setDailyLookAssignedTo(e.target.value)}
                  title="Assigned to"
                >
                  <option value="">Assigned: All</option>
                  {Array.isArray(techs) && techs.map((t: any) => {
                    const techName = technicianDisplayName(t);
                    return (
                      <option key={t.id || techName} value={techName}>
                        {techName}
                      </option>
                    );
                  })}
                </select>
                <button
                  className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
                  onClick={() => setDailyLookOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto grid grid-cols-2 gap-3">
              <div className="border border-violet-500/40 rounded p-3 col-span-2 bg-violet-500/5">
                <div className="font-semibold mb-2 flex items-center justify-between"><span>Tasks</span><span className="text-xs text-violet-300">{dailyLookData.tasks.filter(task => !taskIsCompleted(task)).length} open</span></div>
                {dailyLookData.tasks.length === 0 ? <div className="text-sm text-zinc-500">No tasks for this day.</div> : <div className="grid grid-cols-2 gap-2">{dailyLookData.tasks.map((task, index) => <label key={task.id || index} className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-900/60 p-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-violet-400" checked={taskIsCompleted(task)} onChange={event => { void setTaskCompleted(task, event.target.checked); }} /><span className={`min-w-0 ${taskIsCompleted(task) ? 'line-through text-zinc-500' : ''}`}><strong className="block break-words">{task.title || 'Task'}</strong><small className="text-zinc-400">{task.date < dailyLookData.ymd ? `Carried from ${task.date}` : task.technician || 'All technicians'}</small></span></label>)}</div>}
              </div>
              <div className="border border-zinc-800 rounded p-3">
                <div className="font-semibold mb-2">Schedules</div>
                {dailyLookData.schedules.length === 0 ? (
                  <div className="text-sm text-zinc-500">No schedules found{dailyLookData.assigned ? ` for ${dailyLookData.assigned}.` : '.'}</div>
                ) : (
                  <div className="space-y-1">
                    {dailyLookData.schedules.map(s => (
                      <div key={s.name} className="text-sm text-zinc-200 flex items-center justify-between gap-2">
                        <div className="truncate">{s.name}</div>
                        <div className="text-zinc-400 whitespace-nowrap">
                          {s.off ? 'Off' : `${formatTime12FromHHmm(s.start || '')} - ${formatTime12FromHHmm(s.end || '')}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-zinc-800 rounded p-3">
                <div className="font-semibold mb-2">Parts expected (delivery)</div>
                {dailyLookData.partsDelivery.length === 0 ? (
                  <div className="text-sm text-zinc-500">No deliveries{dailyLookData.assigned ? ` for ${dailyLookData.assigned}.` : '.'}</div>
                ) : (
                  <div className="space-y-2">
                    {dailyLookData.partsDelivery.map((p, idx) => (
                      <div key={(p.id ?? idx) as any} className="text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate">
                            <span className="text-zinc-400 mr-2">{formatTime12FromHHmm(p.time || '')}</span>
                            <span className="text-zinc-100">{p.partName || p.title || 'Part'}</span>
                          </div>
                          <div className="text-xs text-zinc-400 whitespace-nowrap">
                            {p.workOrderId ? `WO #${p.workOrderId}` : (p.saleId ? `Sale #${p.saleId}` : '')}
                          </div>
                        </div>
                        <div className="mt-1 flex gap-2">
                          {p.orderUrl ? (
                            <button className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700" onClick={async () => {
                              try { await (window as any).api.openUrl(p.orderUrl); } catch {}
                            }}>Order link</button>
                          ) : null}
                          {(p as any).trackingUrl ? (
                            <button className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700" onClick={async () => {
                              try { await (window as any).api.openUrl((p as any).trackingUrl); } catch {}
                            }}>Tracking</button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-zinc-800 rounded p-3">
                <div className="font-semibold mb-2">Consultations</div>
                {dailyLookData.consultations.length === 0 ? (
                  <div className="text-sm text-zinc-500">No consultations{dailyLookData.assigned ? ` for ${dailyLookData.assigned}.` : '.'}</div>
                ) : (
                  <div className="space-y-2">
                    {dailyLookData.consultations.map((c, idx) => (
                      <div key={(c.id ?? idx) as any} className="text-sm border border-zinc-800 rounded p-2 bg-zinc-900/50">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate">
                            <span className="text-zinc-400 mr-2">{formatTime12FromHHmm(c.time || '')}</span>
                            <span className="text-zinc-100">{c.customerName || 'Customer'}</span>
                            {c.title ? <span className="text-zinc-300"> — {c.title}</span> : null}
                          </div>
                          {c.technician ? <div className="text-xs text-zinc-400 whitespace-nowrap">{c.technician}</div> : null}
                        </div>
                        {c.customerPhone ? <div className="text-xs text-zinc-500">{formatPhone(String(c.customerPhone || '')) || c.customerPhone}</div> : null}
                        <div className="mt-1 flex gap-2">
                          <button
                            className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                            onClick={() => { void openConsultationSale(c); }}
                            title="Open linked consultation sale"
                          >
                            View Consultation Sale
                          </button>
                          <button
                            className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                            onClick={() => { void openConsultationCustomer(c); }}
                            title="Open linked customer record"
                          >
                            View Client Info
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-zinc-800 rounded p-3">
                <div className="font-semibold mb-2">Events</div>
                {dailyLookData.eventItems.length === 0 ? (
                  <div className="text-sm text-zinc-500">No events.</div>
                ) : (
                  <div className="space-y-2">
                    {dailyLookData.eventItems.map((e, idx) => (
                      <div key={(e.id ?? idx) as any} className="text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate">
                            <span className="text-zinc-400 mr-2">{formatTime12FromHHmm(e.time || '')}</span>
                            <span className="text-zinc-100">{e.title || 'Event'}</span>
                          </div>
                          {e.location ? <div className="text-xs text-zinc-400 whitespace-nowrap">{e.location}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-zinc-800 rounded p-3 col-span-2">
                <div className="font-semibold mb-2">Streaming/Content</div>
                {dailyLookData.contentItems.length === 0 ? (
                  <div className="text-sm text-zinc-500">No streaming or content sessions.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {dailyLookData.contentItems.map((entry, idx) => {
                      const visual = calendarEventVisual(entry);
                      return (
                        <button key={(entry.id ?? idx) as any} type="button" className="text-left border border-zinc-800 rounded p-2 bg-zinc-900/50" onClick={() => setViewing(entry)}>
                          <div className="flex items-center gap-2">
                            <span className={`gb-calendar-event-icon ${visual.color}`}>{visual.short}</span>
                            <span className="min-w-0">
                              <strong className="block text-sm truncate">{entry.title || visual.label}</strong>
                              <small className="block text-zinc-400">{eventSummary(entry)}</small>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border border-zinc-800 rounded p-3 col-span-2">
                <div className="font-semibold mb-2">Parts ordered</div>
                {dailyLookData.partsOrdered.length === 0 ? (
                  <div className="text-sm text-zinc-500">No orders{dailyLookData.assigned ? ` for ${dailyLookData.assigned}.` : '.'}</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {dailyLookData.partsOrdered.map((p, idx) => (
                      <div key={(p.id ?? idx) as any} className="text-sm border border-zinc-800 rounded p-2 bg-zinc-900/50">
                        <div className="truncate">
                          <span className="text-zinc-400 mr-2">{formatTime12FromHHmm(p.time || '')}</span>
                          <span className="text-zinc-100">{p.partName || p.title || 'Part'}</span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {p.workOrderId ? `WO #${p.workOrderId}` : (p.saleId ? `Sale #${p.saleId}` : '')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarWindow;

// Autosave editing modal content after 2s of inactivity (min fields required)
// Placed after default export to avoid rerender churn; hook call occurs conditionally via component scope
(function attachAutosave() {
  // We cannot call hooks outside components; this is a no-op placeholder to document autosave inclusion above.
})();

// --- Helpers and small components ---
function toMinutes(t?: string) { if (!t) return 0; const [h,m] = t.split(':').map(Number); return (h||0)*60 + (m||0); }
function diffMinutes(start?: string, end?: string) { const s = toMinutes(start), e = toMinutes(end); return Math.max(0, e - s); }
function formatScheduleTotal(schedule: CalendarEvent['schedule']) {
  const days: (keyof NonNullable<CalendarEvent['schedule']>)[] = ['mon','tue','wed','thu','fri','sat','sun'];
  const totalMin = days.reduce((sum, d) => sum + diffMinutes(schedule?.[d]?.start, schedule?.[d]?.end), 0);
  const hours = (totalMin / 60).toFixed(2);
  return `${hours} hrs`;
}

const TechnicianSelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [techs, setTechs] = useState<{ id: string; firstName?: string; lastName?: string; nickname?: string }[]>([]);
  async function refresh() { try { const l = await listTechnicians(); setTechs(l as any); } catch (e) { console.error('load techs failed', e); } }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const api: any = (window as any).api;
    if (!api?.onTechniciansChanged) return;
    const unsub = api.onTechniciansChanged(() => { refresh(); });
    return unsub;
  }, []);
  return (
    <select className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select technician</option>
      {techs.map(t => (
        <option key={t.id} value={technicianDisplayName(t)}>
          {technicianDisplayName(t)}
        </option>
      ))}
    </select>
  );
};
