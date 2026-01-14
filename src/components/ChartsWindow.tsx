import React, { useEffect, useMemo, useState } from 'react';
import { listTechnicians } from '@/lib/admin';
import { computeTotals } from '../lib/calc';

function startOfPeriod(date: Date, period: 'day' | 'week' | 'month' | 'year') {
  const d = new Date(date);
  if (period === 'day') d.setHours(0,0,0,0);
  else if (period === 'week') { const day = d.getDay(); const diff = (day + 6) % 7; d.setDate(d.getDate() - diff); d.setHours(0,0,0,0); }
  else if (period === 'month') { d.setDate(1); d.setHours(0,0,0,0); }
  else if (period === 'year') { d.setMonth(0,1); d.setHours(0,0,0,0); }
  return d;
}

const PERIODS = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
] as const;

const ChartsWindow: React.FC = () => {
  const [period, setPeriod] = useState<'day'|'week'|'month'|'year'>('month');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [tech, setTech] = useState<string>('');
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [excludeTax, setExcludeTax] = useState<boolean>(true);
  const [includeRepairs, setIncludeRepairs] = useState<boolean>(true);
  const [includeSales, setIncludeSales] = useState<boolean>(true);
  const [dayMetric, setDayMetric] = useState<'orders'|'revenue'>('orders');
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const api = (window as any).api;
        if (!api) {
          // Fallback: ask opener for normalized data
          if (window.opener) {
            window.opener.postMessage({ type: 'charts:request-data' }, '*');
          }
          return; // wait for message handler to set data
        }
        const wos = await api.getWorkOrders();
        const sales = await api.dbGet('sales').catch(() => []);
        const mappedWOs = (Array.isArray(wos) ? wos : []).map((w: any) => ({ ...w, kind: 'repair' as const }));
        const mappedSales = (Array.isArray(sales) ? sales : []).map((s: any) => {
          const items = Array.isArray(s.items) ? s.items : [{ description: s.itemDescription, qty: s.quantity || 1, price: s.price || 0, internalCost: s.internalCost }];
          const parts = items.reduce((sum: number, it: any) => sum + (Number(it.qty || 1) * Number(it.price || 0)), 0);
          return {
            kind: 'sale' as const,
            id: s.id,
            checkInAt: s.checkInAt || s.createdAt,
            assignedTo: s.assignedTo,
            productDescription: (items[0]?.description || s.itemDescription || 'Sale Item'),
            laborCost: 0,
            partCosts: Number(s.partCosts || parts || 0),
            discount: Number(s.discount || 0),
            taxRate: Number(s.taxRate || 0),
            amountPaid: Number(s.amountPaid || 0),
            items,
          };
        });
        setData([...(mappedWOs || []), ...mappedSales]);
      } catch (e) { console.error(e); }
    };
    // Message listener for fallback payloads
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'charts:data') {
        const incoming = Array.isArray(d.payload) ? d.payload : [];
        setData(incoming);
      }
    };
    window.addEventListener('message', onMsg);
    load();
    // Load technicians if api exists
    (async () => { try { const list = await listTechnicians(); setTechnicians(list as any[]); } catch {} })();
    const offTech = (window as any).api?.onTechniciansChanged?.(async () => {
      try { const list = await listTechnicians(); setTechnicians(list as any[]); } catch {}
    });
    const api = (window as any).api;
    const offWO = api?.onWorkOrdersChanged?.(() => load());
    const offSales = api?.onSalesChanged?.(() => load());
    return () => {
      window.removeEventListener('message', onMsg);
      try { offWO && offWO(); } catch {}
      try { offSales && offSales(); } catch {}
      try { offTech && offTech(); } catch {}
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data?.length) return [] as any[];
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    return data.filter(w => {
      if (w.kind === 'repair' && !includeRepairs) return false;
      if (w.kind === 'sale' && !includeSales) return false;
      const d = new Date(w.checkInAt || w.repairCompletionDate || w.checkoutDate || w.createdAt || 0);
      if (isNaN(d.getTime())) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      if (tech) {
        const at = (w.assignedTo ?? '').toString();
        if (tech === '__unassigned') { if (at) return false; }
        else if (at.toLowerCase() !== tech.toLowerCase()) return false;
      }
      return true;
    });
  }, [data, from, to, tech, includeRepairs, includeSales]);

  const grouped = useMemo(() => {
    const map = new Map<string, { orders: number; total: number; profit: number }>();
    const sumCost = (w:any) => {
      let sum = 0; if (Array.isArray(w.items)) for (const it of w.items) sum += Number(it.internalCost||it.cost||0)||0; sum += Number(w.internalCost||0)||0; return sum;
    };
    for (const w of filtered) {
      const t = computeTotals({ laborCost: Number(w.laborCost||0), partCosts: Number(w.partCosts||0), discount: Number(w.discount||0), taxRate: Number(w.taxRate||0), amountPaid: Number(w.amountPaid||0) });
      const d = new Date(w.checkInAt || w.repairCompletionDate || w.checkoutDate || w.createdAt || 0);
      const bucket = startOfPeriod(d, period).toISOString().slice(0,10);
      const prev = map.get(bucket) || { orders: 0, total: 0, profit: 0 };
      const labor = Number(w.laborCost||0); const parts = Number(w.partCosts||0); const discount = Number(w.discount||0);
      const subtotal = Math.max(0, labor + parts - discount);
      const revenue = excludeTax ? subtotal : (subtotal + (t.tax||0));
      const profit = revenue - sumCost(w);
      prev.orders += 1; prev.total += revenue; prev.profit += profit; map.set(bucket, prev);
    }
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));
  }, [filtered, period, excludeTax]);

  const weekdayTallies = useMemo(() => {
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const counts: Record<string, { orders: number; revenue: number }> = {}; for (const n of names) counts[n] = { orders: 0, revenue: 0 };
    for (const w of filtered) {
      const d = new Date(w.checkInAt || w.repairCompletionDate || w.checkoutDate || w.createdAt || 0);
      const name = names[d.getDay()];
      const t = computeTotals({ laborCost: Number(w.laborCost||0), partCosts: Number(w.partCosts||0), discount: Number(w.discount||0), taxRate: Number(w.taxRate||0), amountPaid: Number(w.amountPaid||0) });
      const labor = Number(w.laborCost||0); const parts = Number(w.partCosts||0); const discount = Number(w.discount||0);
      const subtotal = Math.max(0, labor + parts - discount);
      const revenue = excludeTax ? subtotal : (subtotal + (t.tax||0));
      counts[name].orders += 1; counts[name].revenue += revenue;
    }
    const order = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return order.map(day => ({ day, ...counts[day] }));
  }, [filtered, excludeTax]);

  function setQuickRange(key: 'today'|'week'|'month'|'year') {
    const now = new Date();
    if (key === 'today') { const d = new Date(); d.setHours(0,0,0,0); setFrom(d.toISOString().slice(0,10)); setTo(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString().slice(0,10)); setPeriod('day'); }
    else if (key === 'week') { const start = startOfPeriod(now, 'week'); const end = new Date(start); end.setDate(start.getDate() + 6); setFrom(start.toISOString().slice(0,10)); setTo(end.toISOString().slice(0,10)); setPeriod('week'); }
    else if (key === 'month') { const start = startOfPeriod(now, 'month'); const end = new Date(start.getFullYear(), start.getMonth()+1, 0); setFrom(start.toISOString().slice(0,10)); setTo(end.toISOString().slice(0,10)); setPeriod('month'); }
    else if (key === 'year') { const start = startOfPeriod(now, 'year'); const end = new Date(start.getFullYear(), 11, 31); setFrom(start.toISOString().slice(0,10)); setTo(end.toISOString().slice(0,10)); setPeriod('year'); }
  }

  return (
    <div className="h-screen bg-zinc-900 text-gray-100 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold">Charts</div>
        <button className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded" onClick={() => window.close()}>Close</button>
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs mb-1">Period</label>
          <select className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={period} onChange={e => setPeriod(e.target.value as any)}>
            {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">From</label>
          <input type="date" className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs mb-1">To</label>
          <input type="date" className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs mb-1">Technician</label>
          <select className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={tech} onChange={e => setTech(e.target.value)}>
            <option value="">All</option>
            <option value="__unassigned">Unassigned</option>
            {(technicians || []).map((t:any) => {
              const value = (t.nickname?.trim() || t.firstName || String(t.id)).toString();
              const label = [t.firstName, t.lastName].filter(Boolean).join(' ') || t.nickname || `Tech ${t.id}`;
              return <option key={value} value={value}>{label}</option>;
            })}
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm ml-auto">
          <input type="checkbox" className="accent-[#39FF14]" checked={excludeTax} onChange={e => setExcludeTax(e.target.checked)} />
          Exclude tax from revenue
        </label>
        <div className="flex items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="accent-[#39FF14]" checked={includeRepairs} onChange={e => setIncludeRepairs(e.target.checked)} /> Repairs
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="accent-[#39FF14]" checked={includeSales} onChange={e => setIncludeSales(e.target.checked)} /> Sales
          </label>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <QuickRange onPick={setQuickRange} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400 mb-2">Trends</div>
          <div className="h-48 flex items-end gap-2">
            {(() => {
              const max = Math.max(1, ...grouped.map(x => x.total));
              return grouped.map(g => {
                const h = Math.round((g.total / max) * 160);
                return (
                  <div key={g.date} className="flex-1 flex flex-col items-center" title={`${g.date}\nOrders: ${g.orders}\nRevenue: $${g.total.toFixed(2)}\nProfit: $${g.profit.toFixed(2)}`}>
                    <div className="text-[10px] text-zinc-400 mb-1">${g.total.toFixed(0)}</div>
                    <div className="w-6 bg-[#39FF14]" style={{ height: h }}></div>
                    <div className="text-[10px] text-zinc-400 mt-1">{g.date.slice(5)}</div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-zinc-400">Popular Days</div>
            <div className="flex items-center gap-2 text-xs">
              <label className={`px-2 py-0.5 rounded cursor-pointer ${dayMetric==='orders'?'bg-zinc-800 border border-zinc-700':''}`}>
                <input type="radio" className="hidden" name="dayMetric" checked={dayMetric==='orders'} onChange={() => setDayMetric('orders')} /> Orders
              </label>
              <label className={`px-2 py-0.5 rounded cursor-pointer ${dayMetric==='revenue'?'bg-zinc-800 border border-zinc-700':''}`}>
                <input type="radio" className="hidden" name="dayMetric" checked={dayMetric==='revenue'} onChange={() => setDayMetric('revenue')} /> Revenue {excludeTax ? '(excl tax)' : '(incl tax)'}
              </label>
            </div>
          </div>
          {weekdayTallies.length === 0 ? (
            <div className="px-2 py-6 text-center text-zinc-500 text-sm">No data in range.</div>
          ) : (
            <div className="flex items-center gap-6">
              <DonutChart
                data={weekdayTallies.map(d => ({ label: d.day, value: dayMetric==='orders' ? d.orders : d.revenue }))}
                size={180}
                thickness={26}
              />
              <ul className="text-sm space-y-1">
                {weekdayTallies.map(d => (
                  <li key={d.day} className="flex justify-between gap-6">
                    <span className="text-zinc-300 w-20">{d.day}</span>
                    <span className="text-zinc-400">{dayMetric==='orders' ? d.orders : `$${d.revenue.toFixed(2)}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChartsWindow;

const QuickRange: React.FC<{ onPick: (k: 'today'|'week'|'month'|'year') => void }> = ({ onPick }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-zinc-400">Quick range:</span>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('today')}>Today</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('week')}>This week</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('month')}>This month</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('year')}>This year</button>
  </div>
);

// Simple SVG donut chart (copied from Reporting)
const DonutChart: React.FC<{ data: Array<{ label: string; value: number }>; size?: number; thickness?: number }> = ({ data, size = 200, thickness = 24 }) => {
  const total = data.reduce((s, d) => s + Math.max(0, Number(d.value) || 0), 0);
  if (!(total > 0)) return (<div className="flex items-center justify-center" style={{ width: size, height: size }}><div className="text-xs text-zinc-500">No data</div></div>);
  const r = (size - thickness) / 2; const c = 2 * Math.PI * r; let acc = 0;
  const colors = ['#39FF14','#7CFC00','#98FB98','#66CDAA','#20B2AA','#32CD32','#3CB371'];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size/2}, ${size/2}) rotate(-90)`}>
        <circle r={r} cx={0} cy={0} fill="transparent" stroke="#27272a" strokeWidth={thickness} />
        {data.map((d, idx) => {
          const val = Math.max(0, Number(d.value) || 0); const frac = val / total; const dash = Math.max(0, frac * c); const gap = Math.max(0, c - dash); const offset = (c - acc) % c; acc += dash;
          return (<circle key={d.label + idx} r={r} cx={0} cy={0} fill="transparent" stroke={colors[idx % colors.length]} strokeWidth={thickness} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={offset} strokeLinecap="butt" />);
        })}
      </g>
      <g>
        <text x="50%" y="48%" textAnchor="middle" className="fill-zinc-200" style={{ fontSize: 14, fontWeight: 600 }}>{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</text>
        <text x="50%" y="62%" textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 11 }}>Total</text>
      </g>
    </svg>
  );
};
