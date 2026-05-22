import React, { useEffect, useRef, useState } from 'react';
import TechniciansWindow from './TechniciansWindow';
import { getUnreadCount, syncNotificationsFromCalendar } from '@/lib/notifications';
import { dispatchOpenModal } from '@/lib/modalBus';

type TicketSearchResult = {
  type: 'workorder' | 'sale';
  id: number;
  invoice: string;
  activityAt: string;
  customerName?: string;
  description?: string;
};

const Toolbar: React.FC<{ mode: 'workorders' | 'sales' | 'all'; onModeChange: (m: 'workorders' | 'sales' | 'all') => void }> = ({ mode, onModeChange }) => {

  const [isFull, setIsFull] = useState<boolean>(false);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    (async () => {
      try { const v = await (window as any).api.getFullScreen?.(); setIsFull(!!v); } catch {}
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const info = await (window as any).api?.getAppInfo?.();
        const v = String(info?.version || '').trim();
        if (alive) setAppVersion(v);
      } catch {
        // ignore
      }
    })();
    return () => { alive = false; };
  }, []);
  const [showTechs, setShowTechs] = useState(false);
  const [unread, setUnread] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        await syncNotificationsFromCalendar();
      } catch {
        // ignore
      }
      try {
        const c = await getUnreadCount();
        if (alive) setUnread(c);
      } catch {
        // ignore
      }
    };
    refresh();
    const api: any = (window as any).api;
    // Calendar / tech changes need a full sync; notification writes just refresh the badge count.
    const refreshCountOnly = async () => {
      try {
        const c = await getUnreadCount();
        if (alive) setUnread(c);
      } catch {
        // ignore
      }
    };
    const offCal = api?.onCalendarEventsChanged?.(() => refresh());
    const offNot = api?.onNotificationsChanged?.(() => refreshCountOnly());
    const offTech = api?.onTechniciansChanged?.(() => refresh());
    const timer = window.setInterval(() => refresh(), 60_000);
    return () => {
      alive = false;
      try { offCal && offCal(); } catch {}
      try { offNot && offNot(); } catch {}
      try { offTech && offTech(); } catch {}
      try { window.clearInterval(timer); } catch {}
    };
  }, []);

  const [showAdmin, setShowAdmin] = useState(false);
  const adminRef = useRef<HTMLDivElement>(null);

  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketResults, setTicketResults] = useState<TicketSearchResult[]>([]);
  const [ticketActiveIndex, setTicketActiveIndex] = useState<number>(-1);
  const ticketRef = useRef<HTMLDivElement>(null);
  const ticketListRef = useRef<HTMLDivElement>(null);
  const ticketItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const ticketReqRef = useRef(0);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) setShowAdmin(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ticketRef.current && !ticketRef.current.contains(e.target as Node)) setTicketOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const api: any = (window as any).api;
    if (!api?.searchTickets) return;

    const q = ticketQuery.trim();
    if (!q) {
      setTicketResults([]);
      setTicketActiveIndex(-1);
      setTicketLoading(false);
      setTicketOpen(false);
      return;
    }

    const requestId = ++ticketReqRef.current;
    setTicketLoading(true);
    setTicketOpen(true);

    const t = window.setTimeout(async () => {
      try {
        const res = await api.searchTickets(q, { limit: 20 });
        if (ticketReqRef.current !== requestId) return;
        if (res?.ok && Array.isArray(res?.results)) {
          setTicketResults(res.results);
          setTicketActiveIndex(res.results.length > 0 ? 0 : -1);
        } else {
          setTicketResults([]);
          setTicketActiveIndex(-1);
        }
      } catch {
        if (ticketReqRef.current === requestId) {
          setTicketResults([]);
          setTicketActiveIndex(-1);
        }
      } finally {
        if (ticketReqRef.current === requestId) setTicketLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [ticketQuery]);

  const openTicket = (r: TicketSearchResult) => {
    try {
      setTicketOpen(false);
      setTicketQuery('');
      setTicketResults([]);
      setTicketActiveIndex(-1);
      if (r.type === 'workorder') {
        dispatchOpenModal('newWorkOrder', { workOrderId: r.id });
      } else {
        dispatchOpenModal('newSale', { id: r.id });
      }
    } catch (e) {
      console.error('Failed to open ticket from search', e);
    }
  };

  useEffect(() => {
    try {
      if (!ticketOpen) return;
      if (ticketActiveIndex < 0) return;
      const el = ticketItemRefs.current[ticketActiveIndex];
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    } catch {
      // ignore
    }
  }, [ticketOpen, ticketActiveIndex, ticketResults.length]);

  return (
    <>
    <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-700 bg-zinc-900 relative">
      {/* Left side: Admin dropdown + action buttons */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Admin dropdown */}
        <div ref={adminRef} className="relative">
          <button
            className="px-5 py-2 bg-zinc-800 text-zinc-100 font-semibold rounded shadow-sm border border-zinc-700 hover:border-[#BC13FE] hover:text-[#BC13FE] text-sm min-w-[110px]"
            onClick={() => setShowAdmin(v => !v)}
          >Admin ▾</button>
          {showAdmin && (
            <div className="absolute left-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-50">
              {[
                { label: 'Devices/Repairs', action: () => dispatchOpenModal('repairCategories') },
                { label: 'Products',        action: () => dispatchOpenModal('products') },
                { label: 'Reports',         action: () => dispatchOpenModal('eod') },
                { label: 'Clover Connection', action: () => dispatchOpenModal('cloverConnection') },
                { label: 'Technicians',     action: () => setShowTechs(true) },
                { label: 'Data Management', action: () => dispatchOpenModal('backup') },
                { label: 'Notifications',   action: () => dispatchOpenModal('notificationSettings') },
                { label: 'Dev Menu',        action: () => dispatchOpenModal('devMenu') },
              ].map(item => (
                <button key={item.label} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800" onClick={() => { setShowAdmin(false); item.action(); }}>{item.label}</button>
              ))}
            </div>
          )}
        </div>
        <button
          className="px-4 py-2 bg-[#39FF14] text-black font-semibold rounded shadow-sm border border-[#39FF14] hover:brightness-110 text-sm"
          onClick={() => dispatchOpenModal('quoteGenerator')}
        >
          Generate Quote
        </button>

        <button
          className="px-4 py-2 bg-zinc-800 text-zinc-100 font-semibold rounded shadow-sm border border-zinc-700 hover:border-[#39FF14] hover:text-white text-sm"
          onClick={() => dispatchOpenModal('quickSale')}
        >
          Quick Sale
        </button>

        <button
          className="px-4 py-2 bg-blue-600 text-white font-semibold rounded shadow-sm border border-blue-500 hover:bg-blue-500 text-sm"
          onClick={() => dispatchOpenModal('consultation')}
        >
          Consultation
        </button>
      </div>

      {/* Center: ticket keyword search */}
      {(window as any).api?.searchTickets ? (
        <div className="flex-1 min-w-0">
          <div ref={ticketRef} className="relative max-w-[720px] mx-auto">
            <input
              value={ticketQuery}
              onChange={(e) => setTicketQuery(e.target.value)}
              onFocus={() => { if (ticketQuery.trim()) setTicketOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setTicketOpen(false);
                  setTicketActiveIndex(-1);
                }
                if (e.key === 'ArrowDown') {
                  if (!ticketQuery.trim()) return;
                  if (!ticketOpen) setTicketOpen(true);
                  if (ticketResults.length === 0) return;
                  e.preventDefault();
                  setTicketActiveIndex((prev) => {
                    if (prev < 0) return 0;
                    return Math.min(prev + 1, ticketResults.length - 1);
                  });
                  return;
                }
                if (e.key === 'ArrowUp') {
                  if (!ticketQuery.trim()) return;
                  if (!ticketOpen) setTicketOpen(true);
                  if (ticketResults.length === 0) return;
                  e.preventDefault();
                  setTicketActiveIndex((prev) => {
                    const next = Math.max((prev < 0 ? 0 : prev) - 1, 0);
                    return next;
                  });
                  return;
                }
                if (e.key === 'Enter') {
                  const idx = ticketActiveIndex >= 0 ? ticketActiveIndex : 0;
                  const r = ticketResults[idx];
                  if (r) {
                    e.preventDefault();
                    openTicket(r);
                  }
                }
              }}
              placeholder="Search tickets (WO#, device, description, notes…)"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#39FF14]"
            />

            {ticketOpen && ticketQuery.trim() && (
              <div className="absolute left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-50 overflow-hidden">
                {ticketLoading && (
                  <div className="px-3 py-2 text-xs text-zinc-400">Searching…</div>
                )}

                {!ticketLoading && ticketResults.length === 0 && (
                  <div className="px-3 py-2 text-xs text-zinc-500">No matches</div>
                )}

                {ticketResults.length > 0 && (
                  <div ref={ticketListRef} className="max-h-[320px] overflow-y-auto">
                    {ticketResults.map((r, idx) => (
                      <button
                        key={`${r.type}-${r.id}`}
                        ref={(el) => { ticketItemRefs.current[idx] = el; }}
                        type="button"
                        className={
                          `w-full text-left px-3 py-2 border-b border-zinc-800 last:border-b-0 h-16 ` +
                          (idx === ticketActiveIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800')
                        }
                        onClick={() => openTicket(r)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-mono text-sm text-zinc-100">{r.invoice}</div>
                          <div className="text-xs text-zinc-500">{r.type === 'workorder' ? 'Work Order' : 'Sale'}</div>
                        </div>
                        <div className="text-xs text-zinc-300 truncate">
                          {[r.customerName, r.description].filter(Boolean).join(' — ') || ' '}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex items-center gap-3 shrink-0">
        <button
          className="relative px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
          onClick={() => dispatchOpenModal('notifications')}
        >
          Notifications
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] leading-[18px] text-center border border-zinc-900">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
        <button
          className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
          onClick={() => dispatchOpenModal('calendar')}
        >
          Calendar
        </button>
        <button
          className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm flex items-center justify-center"
          title={isFull ? 'Exit full screen' : 'Enter full screen'}
          onClick={async () => {
            try { await (window as any).api.toggleFullScreen?.(); const v = await (window as any).api.getFullScreen?.(); setIsFull(!!v); } catch (e) { console.error('toggleFullScreen failed', e); }
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      {/* Reset DB button removed per request */}
     </div>
   </div>
   {showTechs && <TechniciansWindow onClose={() => setShowTechs(false)} />}
    </>
  );
};

export default Toolbar;
