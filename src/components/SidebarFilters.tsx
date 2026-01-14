import React, { useEffect, useState } from 'react';
import { listTechnicians } from '../lib/admin';

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
}

const SidebarFilters: React.FC<Props> = ({ technicianFilter, onTechnicianFilterChange, dateFrom = '', dateTo = '', onDateFromChange, onDateToChange, onOpenCustomerSearch, mode = 'all', onModeChange }) => {
  const [techs, setTechs] = useState<any[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  useEffect(() => { (async () => { try { setTechs(await listTechnicians()); } catch (e) { console.error(e); } })(); }, []);
  return (
    <form className="flex flex-col gap-3">
      {/* Admin dropdown moved here and centered; dropdown opens same width below */}
      <div className="w-full flex items-center justify-center">
        <div className="relative w-48">
          <button
            type="button"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm"
            onClick={() => setShowAdmin(v => !v)}
          >Admin ▾</button>
          {showAdmin && (
            <div className="absolute left-0 top-full mt-2 w-full bg-zinc-900 border border-zinc-700 rounded shadow-lg z-50">
              <button className="w-full text-left px-3 py-2 hover:bg-zinc-800" onClick={async () => {
                setShowAdmin(false);
                try { await (window as any).api.openRepairCategories?.(); }
                catch { const mod = await import('../repair-category/openRepairCategoriesWindow'); mod.default(); }
              }}>Devices/Repairs</button>
              <button className="w-full text-left px-3 py-2 hover:bg-zinc-800" onClick={async () => {
                setShowAdmin(false);
                try { await (window as any).api.openProducts?.(); }
                catch { const url = window.location.origin + '/?products=true'; window.open(url, '_blank', 'width=1280,height=800'); }
              }}>Products</button>
              <button className="w-full text-left px-3 py-2 hover:bg-zinc-800" onClick={async () => {
                setShowAdmin(false);
                try { const api = (window as any).api; if (api?.openReporting) await api.openReporting(); else window.open(window.location.origin + '/?reporting=true', '_blank'); }
                catch (e) { console.error(e); }
              }}>Reporting</button>
              <button className="w-full text-left px-3 py-2 hover:bg-zinc-800" onClick={async () => {
                setShowAdmin(false);
                const openRoute = () => { const url = window.location.origin + '/?backup=true'; window.open(url, '_blank', 'noopener,noreferrer'); };
                try { const api = (window as any).api; if (api?.openBackup) await api.openBackup(); else openRoute(); }
                catch (e) { console.error(e); openRoute(); }
              }}>Data Mgmt</button>
              <button className="w-full text-left px-3 py-2 hover:bg-zinc-800" onClick={async () => {
                setShowAdmin(false);
                try { const api = (window as any).api; if (api?.openDevMenu) await api.openDevMenu(); else window.open(window.location.origin + '/?devMenu=true', '_blank', 'noopener,noreferrer'); }
                catch (e) { console.error(e); }
              }}>Dev Menu</button>
            </div>
          )}
        </div>
      </div>
      {/* Logo: smaller, centered, no border/background */}
      <div className="w-full mb-2 flex items-center justify-center">
        <img src="/logo.png" alt="Logo" className="w-1/2 max-w-[140px] h-auto object-contain" />
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
