import React, { useEffect, useMemo, useState } from 'react';
import { dispatchOpenModal } from '../lib/modalBus';
import { technicianDisplayName } from '../lib/admin';
import { formatTime12FromHHmm } from '../lib/datetime';
import { isSharedTaskAssignment, taskAssignmentLabel, taskIsCompleted, tasksForDailyLook } from '../lib/calendarTasks';
import { technicianShiftsForDate } from '../lib/technicianSchedule';

type CalendarEvent = {
  id?: number;
  date: string;
  time?: string;
  title?: string;
  category?: 'parts' | 'event' | 'consultation' | 'schedule' | 'content' | 'task';
  partsStatus?: 'ordered' | 'delivery';
  partName?: string;
  customerName?: string;
  technician?: string;
  location?: string;
  source?: string;
  taskCompleted?: boolean;
  taskCompletedAt?: string;
  taskCompletedBy?: string;
  shiftEnd?: string;
  notes?: string;
  workOrderId?: number | string;
  saleId?: number | string;
  orderUrl?: string;
  trackingUrl?: string;
};

type CalendarNote = {
  id?: number | string;
  date: string;
  subject: string;
  body: string;
  createdAt?: string;
};

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const groupFor = (event: CalendarEvent) => {
  if (event.category === 'schedule') return 'Shifts';
  if (event.category === 'consultation') return 'Consultations';
  if (event.category === 'parts') return event.partsStatus === 'ordered' ? 'Orders' : 'Deliveries';
  if (event.category === 'content') return 'Streaming & Content';
  return 'Events';
};

const groupOrder = ['Shifts', 'Consultations', 'Deliveries', 'Orders', 'Events', 'Streaming & Content'];

const summaryFor = (event: CalendarEvent) => {
  const time = formatTime12FromHHmm(event.time || '');
  if (event.category === 'parts') return `${time ? `${time} - ` : ''}${event.partName || event.title || 'Part'}`;
  if (event.category === 'consultation') return `${time ? `${time} - ` : ''}${event.customerName || 'Client'}${event.title ? `: ${event.title}` : ''}`;
  if (event.category === 'schedule') {
    const range = [formatTime12FromHHmm(event.time || ''), formatTime12FromHHmm(event.shiftEnd || '')].filter(Boolean).join(' - ');
    return `${event.technician || event.title || 'Technician shift'}${range ? `: ${range}` : ''}`;
  }
  return `${time ? `${time} - ` : ''}${event.title || 'Calendar event'}`;
};

export default function DailyLookWindow() {
  const [date, setDate] = useState(today);
  const [technician, setTechnician] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [techs, setTechs] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const api: any = window.api;
      const [calendarEvents, calendarNotes, technicians] = await Promise.all([
        api?.dbGet?.('calendarEvents').catch(() => []),
        api?.dbGet?.('calendarNotes').catch(() => []),
        api?.dbGet?.('technicians').catch(() => []),
      ]);
      if (!active) return;
      setEvents(Array.isArray(calendarEvents) ? calendarEvents : []);
      setNotes(Array.isArray(calendarNotes) ? calendarNotes : []);
      setTechs(Array.isArray(technicians) ? technicians.filter((item: any) => item?.active !== false) : []);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const api: any = window.api;
    const reloadNotes = async () => {
      const rows = await api?.dbGet?.('calendarNotes').catch(() => []);
      setNotes(Array.isArray(rows) ? rows : []);
    };
    const reloadEvents = async () => {
      const rows = await api?.dbGet?.('calendarEvents').catch(() => []);
      setEvents(Array.isArray(rows) ? rows : []);
    };
    const reloadTechnicians = async () => {
      const rows = await api?.dbGet?.('technicians').catch(() => []);
      setTechs(Array.isArray(rows) ? rows.filter((item: any) => item?.active !== false) : []);
    };
    const offNotes = api?.onCalendarNotesChanged?.(() => { void reloadNotes(); });
    const offEvents = api?.onCalendarEventsChanged?.(() => { void reloadEvents(); });
    const offTechnicians = api?.onTechniciansChanged?.(() => { void reloadTechnicians(); });
    const refreshSharedCalendar = () => {
      if (document.visibilityState !== 'visible') return;
      void reloadNotes();
      void reloadEvents();
    };
    const timer = window.setInterval(refreshSharedCalendar, 20_000);
    document.addEventListener('visibilitychange', refreshSharedCalendar);
    window.addEventListener('focus', refreshSharedCalendar);
    return () => {
      offNotes?.();
      offEvents?.();
      offTechnicians?.();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshSharedCalendar);
      window.removeEventListener('focus', refreshSharedCalendar);
    };
  }, []);

  const groups = useMemo(() => {
    const dayEvents = events.filter((event) => event.category !== 'task' && event.category !== 'schedule' && event.date === date && (!technician || event.technician === technician));
    const shifts: CalendarEvent[] = technicianShiftsForDate(techs, date, technician, events).map(shift => ({
      date,
      category: 'schedule',
      technician: shift.name,
      title: `${shift.name} - Work Schedule`,
      time: shift.start,
      shiftEnd: shift.end,
    }));
    return groupOrder.map((name) => ({ name, items: name === 'Shifts' ? shifts : dayEvents.filter((event) => groupFor(event) === name) }));
  }, [date, events, technician, techs]);

  const dayNotes = useMemo(() => notes
    .filter((note) => String(note.date || '').slice(0, 10) === date)
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || ''))), [date, notes]);

  const tasks = useMemo(() => tasksForDailyLook(events, date, technician), [date, events, technician]);

  const setTaskCompleted = async (task: CalendarEvent, completed: boolean) => {
    if (task.id == null) return;
    const now = new Date().toISOString();
    const updated = await (window as any).api.dbUpdate('calendarEvents', task.id, {
      ...task,
      taskCompleted: completed,
      taskCompletedAt: completed ? now : '',
      taskCompletedBy: completed && !isSharedTaskAssignment(task.technician) ? String(task.technician || '') : '',
      updatedAt: now,
    });
    if (updated) setEvents(list => list.map(item => String(item.id) === String(updated.id) ? updated : item));
  };

  const openCalendarEntry = (event: CalendarEvent) => {
    if (event.id != null) dispatchOpenModal('calendar', { calendarEventId: event.id });
  };

  const openDailyItem = async (event: CalendarEvent) => {
    const api: any = window.api;
    if (event.workOrderId != null) {
      await api?.openNewWorkOrder?.({ workOrderId: Number(event.workOrderId) });
      return;
    }
    if (event.saleId != null) {
      await api?.openNewSale?.({ id: Number(event.saleId) });
      return;
    }
    if (event.category === 'parts') {
      dispatchOpenModal('eod', { showCart: true });
      return;
    }
    openCalendarEntry(event);
  };

  return (
    <main className="gb-daily-look min-h-[100dvh] overflow-x-hidden bg-zinc-900 p-3 text-gray-100 sm:p-5">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3 border-b border-zinc-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Daily Look</h1>
          <p className="mt-1 text-sm text-zinc-400">Today&apos;s tasks, notes, shifts, consultations, orders, deliveries, events, and content work.</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
          <input className="min-w-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-2" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <select className="min-w-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-2" value={technician} onChange={(event) => setTechnician(event.target.value)}>
            <option value="">All technicians</option>
            {techs.map((item) => { const name = technicianDisplayName(item); return <option key={item.id || name} value={name}>{name}</option>; })}
          </select>
        </div>
      </header>
      <div className="mx-auto mt-4 grid w-full max-w-6xl grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="min-w-0 border border-violet-400/30 bg-violet-400/5 p-3 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-violet-100">Tasks</h2><span className="text-xs text-violet-200/70">{tasks.filter(task => !taskIsCompleted(task)).length} open</span></div>
          {tasks.length ? <div className="grid gap-2 md:grid-cols-2">{tasks.map((task, index) => <div key={task.id ?? index} className="flex min-w-0 items-start gap-3 border-l-2 border-violet-400 bg-zinc-900 px-3 py-2"><input type="checkbox" aria-label={`Mark ${task.title || 'task'} complete`} className="mt-0.5 h-5 w-5 shrink-0 accent-violet-400" checked={taskIsCompleted(task)} onChange={event => { void setTaskCompleted(task, event.target.checked); }} /><button type="button" className={`min-w-0 flex-1 text-left text-sm ${taskIsCompleted(task) ? 'text-zinc-500 line-through' : ''}`} onClick={() => openCalendarEntry(task)}><strong className="block break-words">{task.title || 'Task'}</strong><small className="mt-1 block text-zinc-400">{task.date < date ? `Carried from ${task.date}` : taskAssignmentLabel(task.technician)}{task.notes ? ' - View notes' : ''}</small></button></div>)}</div> : <p className="text-sm text-zinc-500">No tasks for this day.</p>}
        </section>
        <section className="min-w-0 border border-amber-400/30 bg-amber-400/5 p-3 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-amber-100">Important Notes</h2><span className="text-xs text-amber-200/70">{dayNotes.length}</span></div>
          {dayNotes.length ? <div className="grid gap-2 md:grid-cols-2">{dayNotes.map((note) => <article key={String(note.id)} className="min-w-0 border-l-2 border-amber-400 bg-zinc-900 px-3 py-2"><strong className="block break-words font-medium text-amber-100">{note.subject}</strong><p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-300">{note.body}</p></article>)}</div> : <p className="text-sm text-zinc-500">No important notes for this day.</p>}
        </section>
        {groups.map(({ name, items }) => (
          <section key={name} className="min-w-0 border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{name}</h2><span className="text-xs text-zinc-500">{items.length}</span></div>
            {items.length ? <div className="space-y-2">{items.map((item, index) => (
              <button key={item.id ?? `${name}-${index}`} type="button" onClick={() => { void openDailyItem(item); }} disabled={item.id == null && item.category !== 'parts'} className="w-full min-w-0 border-l-2 border-zinc-600 bg-zinc-900 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800 disabled:cursor-default">
                <strong className="block break-words font-medium">{summaryFor(item)}</strong>
                <span className="mt-1 block break-words text-xs text-zinc-400">{item.technician || item.location || (item.id != null ? 'Open in Calendar' : '')}</span>
              </button>
            ))}</div> : <p className="text-sm text-zinc-500">Nothing scheduled.</p>}
          </section>
        ))}
      </div>
    </main>
  );
}
