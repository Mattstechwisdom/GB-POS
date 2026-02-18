import React, { useEffect, useState } from 'react';
import TechniciansWindow from './TechniciansWindow';
import { getUnreadCount, syncNotificationsFromCalendar } from '@/lib/notifications';

const Toolbar: React.FC<{ mode: 'workorders' | 'sales' | 'all'; onModeChange: (m: 'workorders' | 'sales' | 'all') => void }> = ({ mode, onModeChange }) => {

  const [isFull, setIsFull] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try { const v = await (window as any).api.getFullScreen?.(); setIsFull(!!v); } catch {}
    })();
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
    const offCal = api?.onCalendarEventsChanged?.(() => refresh());
    const offNot = api?.onNotificationsChanged?.(() => refresh());
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

  return (
    <>
    <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700 bg-zinc-900 relative">
      {/* Left side: App title */}
      <div className="flex items-center gap-3">
        <div className="text-xl font-bold tracking-wide text-[#39FF14]">Gadgetboy POS</div>
        <button
          className="px-4 py-2 bg-[#39FF14] text-black font-semibold rounded shadow-sm border border-[#39FF14] hover:brightness-110 text-sm"
          onClick={async () => {
            try {
              const api = (window as any).api;
              if (api && typeof api.openQuoteGenerator === 'function') await api.openQuoteGenerator();
              else {
                const url = window.location.origin + '/?quote=true';
                window.open(url, '_blank', 'width=1000,height=720');
              }
            } catch (e) {
              console.error('openQuoteGenerator failed, falling back to window.open', e);
              try {
                const url = window.location.origin + '/?quote=true';
                window.open(url, '_blank', 'width=1000,height=720');
              } catch (ee) { console.error(ee); }
            }
          }}
        >
          Generate Quote
        </button>

        <button
          className="px-4 py-2 bg-zinc-800 text-zinc-100 font-semibold rounded shadow-sm border border-zinc-700 hover:border-[#39FF14] hover:text-white text-sm"
          onClick={async () => {
            try {
              const api = (window as any).api;
              if (api && typeof api.openQuickSale === 'function') {
                await api.openQuickSale();
                return;
              }
              alert('Quick Sale requires the desktop app (update needed).');
            } catch (e) {
              console.error('openQuickSale failed, falling back to window.open', e);
              try { alert('Quick Sale failed to open. See console.'); } catch {}
            }
          }}
        >
          Quick Sale
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="relative px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
          onClick={async () => {
            try {
              const api = (window as any).api;
              if (api?.openNotifications) await api.openNotifications();
              else {
                const url = window.location.origin + '/?notifications=true';
                window.open(url, '_blank', 'width=860,height=720');
              }
            } catch (e) {
              console.error('openNotifications failed', e);
              try {
                const url = window.location.origin + '/?notifications=true';
                window.open(url, '_blank', 'width=860,height=720');
              } catch {}
            }
          }}
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
          onClick={() => setShowTechs(true)}
        >
          Technicians
        </button>
        <button
          className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
          onClick={async () => {
            try {
              const api = (window as any).api;
              if (api && typeof api.openCalendar === 'function') await api.openCalendar();
              else {
                const url = window.location.origin + '/?calendar=true';
                window.open(url, '_blank', 'width=1000,height=720');
              }
            } catch (e) {
              console.error('openCalendar failed, falling back to window.open', e);
              try {
                const url = window.location.origin + '/?calendar=true';
                window.open(url, '_blank', 'width=1000,height=720');
              } catch (ee) { console.error(ee); }
            }
          }}
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
