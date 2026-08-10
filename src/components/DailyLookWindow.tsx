import React, { useEffect, useMemo, useState } from 'react';
import { dispatchOpenModal } from '../lib/modalBus';
import { technicianDisplayName } from '../lib/admin';
import { formatTime12FromHHmm } from '../lib/datetime';

type CalendarEvent = {
  id?: number;
  date: string;
  time?: string;
  title?: string;
  category?: 'parts' | 'event' | 'consultation' | 'schedule' | 'content';
  partsStatus?: 'ordered' | 'delivery';
  partName?: string;
  customerName?: string;
  technician?: string;
  location?: string;
  source?: string;
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
  if (event.category === 'schedule') return event.technician || event.title || 'Technician shift';
  return `${time ? `${time} - ` : ''}${event.title || 'Calendar event'}`;
};

export default function DailyLookWindow() {
  const [date, setDate] = useState(today);
  const [technician, setTechnician] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [techs, setTechs] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const api: any = window.api;
      const [calendarEvents, technicians] = await Promise.all([
        api?.dbGet?.('calendarEvents').catch(() => []),
        api?.dbGet?.('technicians').catch(() => []),
      ]);
      if (!active) return;
      setEvents(Array.isArray(calendarEvents) ? calendarEvents : []);
      setTechs(Array.isArray(technicians) ? technicians.filter((item: any) => item?.active !== false) : []);
    })();
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => {
    const dayEvents = events.filter((event) => event.date === date && (!technician || event.technician === technician));
    return groupOrder.map((name) => ({ name, items: dayEvents.filter((event) => groupFor(event) === name) }));
  }, [date, events, technician]);

  const openCalendarEntry = (event: CalendarEvent) => {
    if (event.id != null) dispatchOpenModal('calendar', { calendarEventId: event.id });
  };

  return (
    <main className="gb-daily-look min-h-[100dvh] overflow-x-hidden bg-zinc-900 p-3 text-gray-100 sm:p-5">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3 border-b border-zinc-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Daily Look</h1>
          <p className="mt-1 text-sm text-zinc-400">Today&apos;s shifts, consultations, orders, deliveries, events, and content work.</p>
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
        {groups.map(({ name, items }) => (
          <section key={name} className="min-w-0 border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{name}</h2><span className="text-xs text-zinc-500">{items.length}</span></div>
            {items.length ? <div className="space-y-2">{items.map((item, index) => (
              <button key={item.id ?? `${name}-${index}`} type="button" onClick={() => openCalendarEntry(item)} disabled={item.id == null} className="w-full min-w-0 border-l-2 border-zinc-600 bg-zinc-900 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800 disabled:cursor-default">
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
