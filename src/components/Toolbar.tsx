import React, { useEffect, useState } from 'react';
import TechniciansWindow from './TechniciansWindow';

const Toolbar: React.FC<{ mode: 'workorders' | 'sales' | 'all'; onModeChange: (m: 'workorders' | 'sales' | 'all') => void }> = ({ mode, onModeChange }) => {

  const [isFull, setIsFull] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try { const v = await (window as any).api.getFullScreen?.(); setIsFull(!!v); } catch {}
    })();
  }, []);
  const [showTechs, setShowTechs] = useState(false);

  return (
    <>
    <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700 bg-zinc-900 relative">
      {/* Left side: App title */}
      <div className="flex items-center gap-3">
        <div className="text-xl font-bold tracking-wide text-[#39FF14]">Gadgetboy POS</div>
      </div>
      <div className="flex items-center gap-3">
        {/* Top search and Admin dropdown removed; use left sidebar filters and Dev Menu window instead */}
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
          className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
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
        {/* Clock In moved to Technicians window per request */}
        <button
          className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
          title={isFull ? 'Exit full screen' : 'Enter full screen'}
          onClick={async () => {
            try { await (window as any).api.toggleFullScreen?.(); const v = await (window as any).api.getFullScreen?.(); setIsFull(!!v); } catch (e) { console.error('toggleFullScreen failed', e); }
          }}
        >
          {isFull ? 'Windowed' : 'Full Screen'}
        </button>
  {/* Reset DB button removed per request */}
     </div>
   </div>
   {showTechs && <TechniciansWindow onClose={() => setShowTechs(false)} />}
    </>
  );
};

export default Toolbar;
