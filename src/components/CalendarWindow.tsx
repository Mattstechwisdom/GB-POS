import React, { useEffect, useMemo, useState } from 'react';
import { useAutosave } from '@/lib/useAutosave';
import { formatTime12FromHHmm } from '@/lib/datetime';
import { listTechnicians } from '@/lib/admin';

type CalendarEvent = {
  id?: number;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:mm
  endTime?: string;   // HH:mm (optional)
  title: string;      // Display title
  category?: 'parts' | 'event' | 'consultation' | 'schedule';
  // For parts category, refine status for display
  partsStatus?: 'ordered' | 'delivery';
  // Identify source to style differently (e.g., sales vs work order)
  source?: 'sale' | 'workorder';
  saleId?: number;
  notes?: string;
  // Optional linkage
  workOrderId?: number;
  partName?: string;
  orderUrl?: string;
  // Optional contact/location details
  customerName?: string;
  customerPhone?: string;
  technician?: string;
  location?: string;
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

const Cell: React.FC<{ day: Date; events: CalendarEvent[]; onPick: (day: Date) => void; onEdit: (ev: CalendarEvent) => void }>
  = ({ day, events, onPick, onEdit }) => {
  const dayNum = day.getDate();
  function blipFor(ev: CalendarEvent) {
    // Letter & color by type
    if (ev.category === 'event') return { letter: 'E', color: 'bg-red-500', title: `${formatTime12FromHHmm(ev.time || '')} ${ev.title}`.trim() };
    if (ev.category === 'parts') {
      const status = ev.partsStatus || 'ordered';
      const isSale = ev.source === 'sale';
      const colorDelivery = isSale ? 'bg-teal-500' : 'bg-green-500';
      const colorOrdered = isSale ? 'bg-teal-500' : 'bg-blue-500';
      if (status === 'delivery') return { letter: 'D', color: colorDelivery, title: `${formatTime12FromHHmm(ev.time || '')} Est. Delivery ${ev.partName || ev.title || ''}`.trim() };
      return { letter: 'O', color: colorOrdered, title: `${formatTime12FromHHmm(ev.time || '')} Ordered ${ev.partName || ev.title || ''}`.trim() };
    }
    if (ev.category === 'consultation') return { letter: 'C', color: 'bg-yellow-500', title: `${formatTime12FromHHmm(ev.time || '')} Consult ${ev.customerName || ''} ${ev.title || ''}`.trim() };
    if (ev.category === 'schedule') {
      // Show technician schedule for the current day
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const dayKey = dayNames[day.getDay()] as keyof NonNullable<CalendarEvent['schedule']>;
      const daySchedule = ev.schedule?.[dayKey];
      
      if (daySchedule?.off) {
        return { letter: 'X', color: 'bg-gray-500', title: `${ev.technician} - Off` };
      } else if (daySchedule?.start && daySchedule?.end) {
        const startTime = formatTime12FromHHmm(daySchedule.start);
        const endTime = formatTime12FromHHmm(daySchedule.end);
        return { letter: 'T', color: 'bg-[#39FF14]', title: `${ev.technician}: ${startTime} - ${endTime}` };
      }
      return null; // No schedule for this day
    }
    return { letter: ev.title?.[0]?.toUpperCase?.() || '?', color: 'bg-zinc-500', title: ev.title || '' };
  }
  // Separate schedule and other events
  const scheduleEvents = events.filter(ev => ev.category === 'schedule');
  const otherEvents = events.filter(ev => ev.category !== 'schedule');

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="text-sm text-zinc-400 flex items-center justify-between mb-2">
        <div className="font-medium">{dayNum}</div>
        <button className="text-xs px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700 transition-colors" onClick={() => onPick(day)}>
          + Add
        </button>
      </div>
      
      {/* Schedule text display */}
      <div className="flex-1 space-y-1">
        {scheduleEvents.map(ev => {
          const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
          const dayKey = dayNames[day.getDay()] as keyof NonNullable<CalendarEvent['schedule']>;
          const daySchedule = ev.schedule?.[dayKey];
          
          // Only show if working (not off day and has times)
          if (daySchedule && !daySchedule.off && daySchedule.start && daySchedule.end) {
            const startTime = formatTime12FromHHmm(daySchedule.start);
            const endTime = formatTime12FromHHmm(daySchedule.end);
            const nickname = ev.technician?.split(' ')[0] || ev.technician; // Get first name or nickname
            
            return (
              <div
                key={ev.id || ev.title + ev.date}
                onClick={() => onEdit(ev)}
                className="text-xs text-[#39FF14] cursor-pointer hover:text-[#32E610] transition-colors font-medium whitespace-nowrap"
                title={`${ev.technician}: ${startTime} - ${endTime}`}
              >
                {nickname}: {startTime} - {endTime}
              </div>
            );
          }
          return null;
        })}
      </div>
      
      {/* Other event icons at bottom */}
      {otherEvents.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-zinc-700">
          {otherEvents.map(ev => {
            const b = blipFor(ev);
            if (!b) return null;
            return (
              <div
                key={ev.id || ev.title + ev.date}
                title={b.title}
                onClick={() => onEdit(ev)}
                className={`w-5 h-5 rounded-md ${b.color} text-black font-bold text-[10px] flex items-center justify-center cursor-pointer shadow-md hover:brightness-110 border border-black/10 transition-all hover:scale-105`}
              >
                {b.letter}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const CalendarWindow: React.FC = () => {
  const [current, setCurrent] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
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
    consultation: true
  });

  // Load events on open
  useEffect(() => {
    (async () => {
      try {
        const list = await (window as any).api.dbGet('calendarEvents');
        if (Array.isArray(list)) setEvents(list);
      } catch (e) { console.error('load calendar events failed', e); }
    })();
    // Live updates
    const off = (window as any).api.onCalendarEventsChanged?.(async () => {
      try { const list = await (window as any).api.dbGet('calendarEvents'); if (Array.isArray(list)) setEvents(list); } catch {}
    });
    return () => { if (off) off(); };
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

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    
    // Process regular events
    for (const ev of events) {
      if (ev.category !== 'schedule') {
        // Apply filters
        const shouldShow = 
          (ev.category === 'parts' && filters.parts) ||
          (ev.category === 'event' && filters.events) ||
          (ev.category === 'consultation' && filters.consultation);
          
        if (shouldShow) {
          const k = ev.date;
          if (!map[k]) map[k] = [];
          map[k].push(ev);
        }
      }
    }
    
    // Derive schedules live from technicians to avoid stale persisted schedule events
    if (filters.schedule && Array.isArray(techs) && techs.length) {
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
      monthDays.forEach(day => {
        const k = fmtDate(day);
        for (const t of techs) {
          const schedule = t?.schedule || {};
          const dayKey = dayNames[day.getDay()] as keyof NonNullable<CalendarEvent['schedule']>;
          const sd = schedule?.[dayKey];
          if (!sd) continue;
          // Show line if off or has start/end
          if (sd.off || (sd.start && sd.end)) {
            if (!map[k]) map[k] = [];
            const techName = t.nickname || `${t.firstName || ''} ${t.lastName || ''}`.trim() || `Tech ${t.id}`;
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
  }, [events, monthDays, filters, techs]);

  // Build a simple grouping key for parts events to relate deliveries to an order
  function partsGroupKey(ev: CalendarEvent) {
    if (ev.category !== 'parts') return '';
    const wo = ev.workOrderId ? String(ev.workOrderId) : '';
    const id2 = (ev.partName || ev.title || '').toString().trim();
    return `${wo}::${id2}`;
  }

  function prevMonth() {
    setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1, 0, 0, 0, 0));
  }
  function nextMonth() {
    setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1, 0, 0, 0, 0));
  }

  function onPick(day: Date) {
    setEditing({ date: fmtDate(day), title: '', time: '', category: 'event' });
    setDeliveryDates([]);
    setDeliveryDateInput('');
  }
  function onEdit(ev: CalendarEvent) {
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
    return true;
  }

  // Autosave editing after 2s of inactivity; keep modal open
  useAutosave({ ev: editing, deliveryDates }, async (val) => {
    if (!val.ev) return;
    await saveEventSilent(val.ev);
  }, {
    debounceMs: 2000,
    enabled: !!editing,
    shouldSave: () => canAutosave(editing),
    equals: (a, b) => {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
    }
  });

  return (
    <div className="p-4 bg-zinc-900 text-gray-100 h-screen flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-semibold">Calendar - Schedule Management</h2>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded" onClick={prevMonth}>&lt;</button>
          <div className="text-sm text-zinc-300 w-36 text-center">
            {current.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <button className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded" onClick={nextMonth}>&gt;</button>
        </div>
      </div>

      {/* Event Type Filters */}
      <div className="mb-2 p-2 bg-zinc-800 rounded-lg">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-400 font-medium">Show:</span>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[#39FF14]"
              checked={filters.schedule}
              onChange={(e) => setFilters(prev => ({ ...prev, schedule: e.target.checked }))}
            />
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-[#39FF14] rounded text-black text-xs flex items-center justify-center font-bold">S</div>
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
              <div className="w-4 h-4 bg-blue-500 rounded text-black text-xs flex items-center justify-center font-bold">O</div>
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
              <div className="w-4 h-4 bg-red-500 rounded text-white text-xs flex items-center justify-center font-bold">E</div>
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
              <div className="w-4 h-4 bg-yellow-500 rounded text-black text-xs flex items-center justify-center font-bold">C</div>
              <span className="text-sm text-zinc-300">Consultations</span>
            </div>
          </label>

          <div className="ml-3 flex gap-2">
            <button
              className="px-2.5 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded hover:bg-zinc-600 transition-colors"
              onClick={() => setFilters({ schedule: true, parts: true, events: true, consultation: true })}
            >
              Select All
            </button>
            <button
              className="px-2.5 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded hover:bg-zinc-600 transition-colors"
              onClick={() => setFilters({ schedule: false, parts: false, events: false, consultation: false })}
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-7 gap-1.5 bg-zinc-800 rounded-lg overflow-hidden">
          {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => (
            <div key={d} className="text-sm font-medium text-zinc-300 bg-zinc-800 px-2.5 py-2.5 text-center">{d}</div>
          ))}
        </div>
  <div className="grid grid-cols-7 gap-1.5 mt-1.5 flex-1 overflow-hidden" style={{ gridAutoRows: '1fr' }}>
          {monthDays.map((day, idx) => {
            const key = fmtDate(day);
            const isCurrentMonth = day.getMonth() === current.getMonth();
            return (
              <div key={idx} className={`${isCurrentMonth ? 'bg-zinc-900' : 'bg-zinc-900/60'} rounded-lg border border-zinc-700 h-full`}>
                <Cell
                  day={day}
                  events={eventsByDay[key] || []}
                  onPick={onPick}
                  onEdit={onEdit}
                />
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4 w-[520px]">
            <h3 className="font-semibold mb-2">{editing.id ? 'Edit' : 'Add'} calendar entry</h3>
            {/* Category selector */}
            <div className="flex gap-2 mb-3">
              {([
                { key: 'parts', label: 'Parts/Products' },
                { key: 'event', label: 'Events' },
                { key: 'consultation', label: 'Consultation' },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  className={`px-2 py-1 rounded border text-xs ${editing.category === opt.key ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}
                  onClick={() => setEditing({ ...editing, category: opt.key as any })}
                >{opt.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-zinc-400">Date</label>
                <input type="date" className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Time</label>
                <input type="time" className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.time || ''} onChange={e => setEditing({ ...editing, time: e.target.value })} />
              </div>
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
                    <label className="block text-xs text-zinc-400">Technician</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.technician || ''} onChange={e => setEditing({ ...editing, technician: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">Title (optional)</label>
                    <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
                  </div>
                </>
              )}
              {/* Schedule entries are managed in Admin → Technicians and are not editable here */}
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400">Notes</label>
                <textarea className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 h-20" value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              {editing.id && <button className="px-3 py-1 bg-red-700 text-white rounded" onClick={() => deleteEvent(editing)}>Delete</button>}
              <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded" onClick={() => setEditing(null)}>Cancel</button>
              <button className="px-3 py-1 bg-[#39FF14] text-black rounded" onClick={() => saveEvent(editing)}>Save</button>
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
        <option key={t.id} value={t.nickname || `${t.firstName||''} ${t.lastName||''}`.trim()}>
          {(t.nickname || `${t.firstName||''} ${t.lastName||''}`.trim()) || t.id}
        </option>
      ))}
    </select>
  );
};
