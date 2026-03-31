import React, { useEffect, useState } from 'react';
import { listTechnicians } from '../lib/admin';
import { publicAsset } from '../lib/publicAsset';

interface Props {
  technicianFilter: string;
  onTechnicianFilterChange: (v: string) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (v: string) => void;
  onDateToChange?: (v: string) => void;
  onOpenCustomerSearch?: () => void;
  mode?: 'workorders' | 'sales' | 'all';
  onModeChange?: (m: 'workorders' | 'sales' | 'all') => void;
  invoiceQuery?: string;
  onInvoiceQueryChange?: (v: string) => void;
}

const SidebarFilters: React.FC<Props> = ({ technicianFilter, onTechnicianFilterChange, dateFrom = '', dateTo = '', onDateFromChange, onDateToChange, onOpenCustomerSearch, mode = 'all', onModeChange, invoiceQuery = '', onInvoiceQueryChange }) => {
  const [techs, setTechs] = useState<any[]>([]);
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const list = await listTechnicians();
        if (mounted) setTechs(list || []);
      } catch (e) { console.error(e); }
    };
    refresh();
    const off = (window as any).api?.onTechniciansChanged?.(() => refresh());
    return () => { mounted = false; try { off && off(); } catch {} };
  }, []);
  return (
    <form className="flex flex-col gap-3">
      {/* App title above logo */}
      <div className="w-full flex flex-col items-center justify-center pt-1 pb-0">
        <div className="gbpos-title text-2xl text-center leading-tight">GADGETBOY POS</div>
        {appVersion && (
          <div className="text-xs text-zinc-500 mt-0.5">v{appVersion}</div>
        )}
      </div>
      {/* Logo: smaller, centered, no border/background */}
      <div className="w-full mb-2 flex items-center justify-center">
        <img src={publicAsset('logo.png')} alt="Logo" className="w-1/2 max-w-[140px] h-auto object-contain" />
      </div>
      <div>
        <label className="block text-xs mb-1 leading-none">Status</label>
        <select className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      {/* Store removed: single location */}
      <div>
        <label className="block text-xs mb-1 leading-none">Filter by Technician</label>
        <select
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"
          value={technicianFilter}
          onChange={e => onTechnicianFilterChange(e.target.value)}
        >
          <option value="">All</option>
          <option value="__unassigned">Unassigned</option>
          {techs.map(t => {
            const label = [t.firstName, t.lastName].filter(Boolean).join(' ') || (t.nickname && t.nickname.trim()) || t.id;
            return <option key={t.id} value={t.id}>{label}</option>;
          })}
        </select>
      </div>
      {mode === 'sales' && (
        <div>
          <label className="block text-xs mb-1 leading-none">Invoice #</label>
          <input
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"
            placeholder="GB0000123 or 123"
            value={invoiceQuery}
            onChange={e => onInvoiceQueryChange && onInvoiceQueryChange(e.target.value)}
          />
          <div className="text-[11px] text-zinc-500 mt-1">Filters the Sales list by invoice number.</div>
        </div>
      )}
      {mode !== 'sales' && (
      <div>
        <label className="block text-xs mb-1 leading-none">Checked-in between</label>
        <div className="flex gap-1">
          <input
            type="date"
            className="w-1/2 bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
            value={dateFrom}
            onChange={e => onDateFromChange && onDateFromChange(e.target.value)}
          />
          <input
            type="date"
            className="w-1/2 bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
            value={dateTo}
            onChange={e => onDateToChange && onDateToChange(e.target.value)}
          />
        </div>
      </div>
      )}
      {/* Mode toggle moved from top toolbar */}
      <div className="w-full flex items-center justify-center gap-2 mt-2">
          <button
            type="button"
            className={`text-sm font-semibold px-4 py-2 rounded border transition-colors ${mode==='all'
              ? 'bg-[#39FF14] text-black border-[#39FF14]'
              : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]'}
            `}
            onClick={() => onModeChange && onModeChange('all')}
          >All</button>
          <button
            type="button"
            className={`text-sm font-semibold px-4 py-2 rounded border transition-colors ${mode==='workorders'
              ? 'bg-[#39FF14] text-black border-[#39FF14]'
              : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]'}
            `}
            onClick={() => onModeChange && onModeChange('workorders')}
          >Work Orders</button>
          <button
            type="button"
            className={`text-sm font-semibold px-4 py-2 rounded border transition-colors ${mode==='sales'
              ? 'bg-[#39FF14] text-black border-[#39FF14]'
              : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]'}
            `}
            onClick={() => onModeChange && onModeChange('sales')}
          >Sales</button>
        </div>
      
      <div className="flex gap-2 mt-1">
        <button type="button" className="flex-1 bg-zinc-700 rounded px-2 py-1 text-xs">Clear</button>
        <button type="button" className="flex-1 bg-[#39FF14] text-black rounded px-2 py-1 text-xs font-bold">Refresh</button>
      </div>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => onOpenCustomerSearch && onOpenCustomerSearch()}
          className="w-full bg-zinc-900 border border-zinc-700 hover:border-[#39FF14] hover:text-[#39FF14] transition rounded px-3 py-2 text-xs font-semibold text-zinc-300"
        >Customer Search</button>
      </div>
    </form>
  );
};

export default SidebarFilters;
