import React, { useEffect, useMemo, useState } from 'react';

type JournalEntry = {
  key: string;
  date: string;
  at: string;
  title: string;
  body: string;
  source: 'Calendar' | 'Work Order' | 'Sale';
  recordId?: number;
  technician?: string;
};

function dayKey(value: any): string {
  const raw = String(value || '');
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function workOrderEntries(record: any): JournalEntry[] {
  const id = Number(record?.id || 0) || undefined;
  const log = Array.isArray(record?.internalNotesLog) ? record.internalNotesLog : [];
  const entries = log.map((note: any, index: number) => {
    const body = String(note?.body || note?.note || note?.text || '').trim();
    const at = String(note?.createdAt || note?.at || note?.updatedAt || record?.updatedAt || record?.checkInAt || '');
    return body ? {
      key: `work-${id || 'unknown'}-${note?.id || index}`,
      date: dayKey(at),
      at,
      title: String(note?.subject || `WO #${id || ''} Repair Journal`).trim(),
      body,
      source: 'Work Order' as const,
      recordId: id,
      technician: String(note?.technician || note?.author || record?.assignedTo || '').trim(),
    } : null;
  }).filter(Boolean) as JournalEntry[];
  const current = String(record?.internalNotes || '').trim();
  if (current && !entries.some(entry => entry.body === current)) {
    const at = String(record?.updatedAt || record?.activityAt || record?.checkInAt || '');
    entries.push({ key: `work-${id || 'unknown'}-current`, date: dayKey(at), at, title: `WO #${id || ''} Internal Notes`, body: current, source: 'Work Order', recordId: id, technician: String(record?.assignedTo || '').trim() });
  }
  return entries;
}

function saleEntries(record: any): JournalEntry[] {
  const body = String(record?.notes || record?.internalNotes || '').trim();
  if (!body) return [];
  const id = Number(record?.id || 0) || undefined;
  const at = String(record?.updatedAt || record?.checkInAt || record?.createdAt || '');
  return [{ key: `sale-${id || 'unknown'}`, date: dayKey(at), at, title: `Sale #${id || ''} Notes`, body, source: 'Sale', recordId: id, technician: String(record?.assignedTo || '').trim() }];
}

export default function JournalWindow() {
  const [calendarNotes, setCalendarNotes] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedEntryKey, setSelectedEntryKey] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const api = (window as any).api || {};
      try {
        const [notes, work, saleList] = await Promise.all([
          api.dbGet?.('calendarNotes').catch(() => []),
          api.dbGet?.('workOrders').catch(() => []),
          api.dbGet?.('sales').catch(() => []),
        ]);
        if (!active) return;
        setCalendarNotes(Array.isArray(notes) ? notes : []);
        setWorkOrders(Array.isArray(work) ? work : []);
        setSales(Array.isArray(saleList) ? saleList : []);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const api = (window as any).api || {};
    const unsubs = [api.onCalendarNotesChanged?.(load), api.onWorkOrdersChanged?.(load), api.onSalesChanged?.(load)].filter(Boolean);
    return () => { active = false; unsubs.forEach((unsubscribe: any) => unsubscribe?.()); };
  }, []);

  const entries = useMemo<JournalEntry[]>(() => {
    const calendar = calendarNotes.map((note, index) => {
      const at = String(note?.createdAt || note?.updatedAt || note?.date || '');
      return {
        key: `calendar-${note?.id || index}`,
        date: dayKey(note?.date || at),
        at,
        title: String(note?.subject || 'Important Note'),
        body: String(note?.body || ''),
        source: 'Calendar' as const,
      };
    });
    return [...calendar, ...workOrders.flatMap(workOrderEntries), ...sales.flatMap(saleEntries)]
      .filter(entry => entry.date && entry.body)
      .sort((a, b) => String(b.at || b.date).localeCompare(String(a.at || a.date)));
  }, [calendarNotes, sales, workOrders]);

  const days = useMemo(() => Array.from(new Set(entries.map(entry => entry.date))).sort((a, b) => b.localeCompare(a)), [entries]);
  const activeDay = selectedDay || days[0] || '';
  const dayEntries = entries.filter(entry => entry.date === activeDay);
  const selectedEntry = dayEntries.find(entry => entry.key === selectedEntryKey) || dayEntries[0];

  async function openSource(entry: JournalEntry) {
    const api = (window as any).api || {};
    if (entry.source === 'Work Order' && entry.recordId) await api.openNewWorkOrder?.({ workOrderId: entry.recordId });
    if (entry.source === 'Sale' && entry.recordId) await api.openNewSale?.({ id: entry.recordId });
  }

  return (
    <div className="journal-window h-full min-h-0 bg-zinc-950 p-4 text-zinc-100 flex flex-col">
      <header className="mb-3"><h2 className="text-2xl font-semibold">Technician Journal</h2><p className="text-sm text-zinc-400">Important calendar notes and ticket journals, organized by day.</p></header>
      {loading ? <div className="text-sm text-zinc-500">Loading journal...</div> : null}
      {!loading && !entries.length ? <div className="rounded border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-500">No journal entries have been saved yet.</div> : null}
      {entries.length ? (
        <div className="journal-layout grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)] gap-3">
          <aside className="journal-days min-h-0 overflow-auto rounded border border-zinc-800 bg-zinc-900 p-2">
            {days.map(day => <button key={day} type="button" className={`mb-1 w-full rounded px-3 py-2 text-left ${day === activeDay ? 'bg-[#BC13FE]/20 text-white ring-1 ring-[#BC13FE]' : 'bg-zinc-950 text-zinc-300'}`} onClick={() => { setSelectedDay(day); setSelectedEntryKey(''); }}><span className="block text-sm font-semibold">{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span className="text-[11px] text-zinc-500">{entries.filter(entry => entry.date === day).length} entries</span></button>)}
          </aside>
          <section className="journal-day min-h-0 rounded border border-zinc-800 bg-zinc-900 p-3 flex flex-col">
            <div className="mb-3 text-sm font-semibold">{new Date(`${activeDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
            <div className="journal-entry-layout grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_220px] gap-3">
              <article className="min-h-0 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-4">
                {selectedEntry ? <><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{selectedEntry.title}</h3><div className="mt-1 text-xs text-zinc-500">{selectedEntry.source}{selectedEntry.technician ? ` - ${selectedEntry.technician}` : ''}</div></div>{selectedEntry.recordId ? <button type="button" className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs" onClick={() => { void openSource(selectedEntry); }}>Open Ticket</button> : null}</div><div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{selectedEntry.body}</div></> : null}
              </article>
              <aside className="min-h-0 space-y-1 overflow-auto">{dayEntries.map(entry => <button key={entry.key} type="button" className={`w-full rounded border px-3 py-2 text-left ${entry.key === selectedEntry?.key ? 'border-[#BC13FE] bg-[#BC13FE]/10' : 'border-zinc-800 bg-zinc-950'}`} onClick={() => setSelectedEntryKey(entry.key)}><span className="block truncate text-sm font-medium">{entry.title}</span><span className="mt-1 block text-[11px] text-zinc-500">{entry.source}</span></button>)}</aside>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

