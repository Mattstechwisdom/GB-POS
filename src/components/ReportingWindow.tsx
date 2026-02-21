// SYNC_TEST_MARKER: reporting-window
import React, { useEffect, useMemo, useState } from 'react';
import { listTechnicians } from '@/lib/admin';
import { computeTotals } from '../lib/calc';

function startOfPeriod(date: Date, period: 'day' | 'week' | 'month' | 'year') {
  const d = new Date(date);
  if (period === 'day') {
    d.setHours(0,0,0,0);
  } else if (period === 'week') {
    const day = d.getDay();
    const diff = (day + 6) % 7; // make Monday start
    d.setDate(d.getDate() - diff);
    d.setHours(0,0,0,0);
  } else if (period === 'month') {
    d.setDate(1); d.setHours(0,0,0,0);
  } else if (period === 'year') {
    d.setMonth(0,1); d.setHours(0,0,0,0);
  }
  return d;
}

function formatCSV(rows: Array<Record<string, any>>) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

const PERIODS = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
] as const;

const ReportingWindow: React.FC = () => {
  const [period, setPeriod] = useState<'day'|'week'|'month'|'year'>('month');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  // Store filter removed
  const [tech, setTech] = useState<string>('');
  const [excludeTax, setExcludeTax] = useState<boolean>(true);
  const [data, setData] = useState<any[]>([]);
  const [csv, setCsv] = useState<string>('');
  const [topRepairs, setTopRepairs] = useState<Array<{title: string; count: number}>>([]);
  const [topSales, setTopSales] = useState<Array<{title: string; count: number}>>([]);
  const [includeRepairs, setIncludeRepairs] = useState<boolean>(true);
  const [includeSales, setIncludeSales] = useState<boolean>(true);
  const [dayMetric, setDayMetric] = useState<'orders'|'revenue'>('orders');

  useEffect(() => {
    // Debug marker to ensure the admin Reporting window is using the latest renderer bundle.
    console.log('[ReportingWindow] BUILD_MARKER: reporting-v2');
  }, []);

  useEffect(() => { (async () => {
    try {
      const wos = await (window as any).api.getWorkOrders();
      const sales = await (window as any).api.dbGet('sales').catch(() => []);
      // Tag repairs and normalize sales
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
          paymentType: s.paymentType,
          payments: s.payments,
          items,
        };
      });
      setData([...(mappedWOs || []), ...mappedSales]);
    } catch (e) { console.error(e); }
  })(); }, []);

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
        // Match exact nickname/firstName stored convention
        if (at.toLowerCase() !== tech.toLowerCase()) return false;
      }
      return true;
    });
  }, [data, from, to, tech, includeRepairs, includeSales]);

  // Registered technicians list
  const [technicians, setTechnicians] = useState<any[]>([]);
  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const list = await listTechnicians();
        if (!disposed) setTechnicians(list as any[]);
      } catch (e) { console.error('load technicians failed', e); }
    }
    refresh();
    const off = (window as any).api?.onTechniciansChanged?.(() => refresh());
    return () => { disposed = true; try { off && off(); } catch {} };
  }, []);
  const technicianOptions = useMemo(() => {
    return (technicians || []).map((t: any) => ({
      value: (t.nickname?.trim() || t.firstName || String(t.id)).toString(),
      label: [t.firstName, t.lastName].filter(Boolean).join(' ') || t.nickname || `Tech ${t.id}`,
    }));
  }, [technicians]);

  const weekdayTallies = useMemo(() => {
    // getDay(): 0=Sun..6=Sat; we will present Monday..Sunday
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const counts: Record<string, { orders: number; revenue: number }> = {};
    for (const n of names) counts[n] = { orders: 0, revenue: 0 };
    for (const w of filtered) {
      const d = new Date(w.checkInAt || w.repairCompletionDate || w.checkoutDate || w.createdAt || 0);
      const name = names[d.getDay()];
      const totals = computeTotals({
        laborCost: Number(w.laborCost || 0),
        partCosts: Number(w.partCosts || 0),
        discount: Number(w.discount || 0),
        taxRate: Number(w.taxRate || 0),
        amountPaid: Number(w.amountPaid || 0),
      });
      const labor = Number(w.laborCost || 0);
      const parts = Number(w.partCosts || 0);
      const discount = Number(w.discount || 0);
      const subtotal = Math.max(0, labor + parts - discount);
      const tax = totals.tax || 0;
      const revenue = excludeTax ? subtotal : (subtotal + tax);
      counts[name].orders += 1;
      counts[name].revenue += revenue;
    }
    const order = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return order.map(day => ({ day, ...counts[day] }));
  }, [filtered, excludeTax]);

  function sumInternalCost(w: any): number {
    // best-effort: look for internalCost per item or on the work order
    let sum = 0;
    if (Array.isArray(w.items)) {
      for (const it of w.items) {
        const val = Number((it && (it.internalCost || it.cost || 0)) || 0);
        if (Number.isFinite(val)) sum += val;
      }
    }
    // also check a direct field if ever stored
    const direct = Number((w.internalCost || 0));
    if (Number.isFinite(direct)) sum += direct;
    return sum;
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { orders: number; labor: number; parts: number; subtotal: number; tax: number; total: number; cost: number; profit: number }>();
    for (const w of filtered) {
      const totals = computeTotals({
        laborCost: Number(w.laborCost || 0),
        partCosts: Number(w.partCosts || 0),
        discount: Number(w.discount || 0),
        taxRate: Number(w.taxRate || 0),
        amountPaid: Number(w.amountPaid || 0),
      });
      const d = new Date(w.checkInAt || w.repairCompletionDate || w.checkoutDate || w.createdAt || 0);
      const bucket = startOfPeriod(d, period).toISOString().slice(0,10);
      const prev = map.get(bucket) || { orders: 0, labor: 0, parts: 0, subtotal: 0, tax: 0, total: 0, cost: 0, profit: 0 };
  const labor = Number(w.laborCost || 0);
  const parts = Number(w.partCosts || 0);
      const discount = Number(w.discount || 0);
      const subtotal = Math.max(0, labor + parts - discount);
  // Cost baseline is what WE pay: internal costs only
  const cost = sumInternalCost(w);
      const tax = totals.tax || 0;
      const revenue = excludeTax ? subtotal : (subtotal + tax);
      const profit = revenue - cost;
      prev.orders += 1;
      prev.labor += labor - discount; // discount assumed against labor
      prev.parts += parts;
      prev.subtotal += subtotal;
      prev.tax += tax;
      prev.total += revenue;
      prev.cost += cost;
      prev.profit += profit;
      map.set(bucket, prev);
    }
    return Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));
  }, [filtered, period, excludeTax]);

  const csvRows = useMemo(() => grouped.map(r => ({
    period_start: r.date,
    orders: r.orders,
    labor: r.labor.toFixed(2),
    parts: r.parts.toFixed(2),
    subtotal: r.subtotal.toFixed(2),
    tax: r.tax.toFixed(2),
    revenue: r.total.toFixed(2),
    cost: r.cost.toFixed(2),
    profit: r.profit.toFixed(2),
    margin_pct: ((r.subtotal ? (r.profit / r.subtotal) : 0) * 100).toFixed(1),
  })), [grouped]);

  useEffect(() => { setCsv(formatCSV(csvRows)); }, [csvRows]);

  useEffect(() => {
    const rep = new Map<string, number>();
    const sal = new Map<string, number>();
    for (const w of filtered) {
      const key = (w.productDescription || 'Unknown').toString();
      if (w.kind === 'sale') sal.set(key, (sal.get(key) || 0) + 1);
      else rep.set(key, (rep.get(key) || 0) + 1);
    }
    setTopRepairs(Array.from(rep.entries()).map(([title, count]) => ({ title, count })).sort((a,b) => b.count - a.count).slice(0, 10));
    setTopSales(Array.from(sal.entries()).map(([title, count]) => ({ title, count })).sort((a,b) => b.count - a.count).slice(0, 10));
  }, [filtered]);

  // Respond to ChartsWindow fallback requests
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'charts:request-data') {
        try {
          const payload = (filtered || []).map((w: any) => ({ ...w }));
          (e.source as WindowProxy | null)?.postMessage({ type: 'charts:data', payload }, '*');
        } catch {}
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [filtered]);

  function downloadCSV() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report-${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Summary metrics across filtered set
  const summary = useMemo(() => {
    const s = grouped.reduce((acc, g) => {
      acc.orders += g.orders; acc.labor += g.labor; acc.parts += g.parts; acc.subtotal += g.subtotal; acc.tax += g.tax; acc.revenue += g.total; acc.cost += g.cost; acc.profit += g.profit; return acc;
    }, { orders: 0, labor: 0, parts: 0, subtotal: 0, tax: 0, revenue: 0, cost: 0, profit: 0 });
    const margin = s.subtotal ? (s.profit / s.subtotal) : 0;
    const avgTicket = s.orders ? (s.revenue / s.orders) : 0;
    return { ...s, margin, avgTicket };
  }, [grouped]);

  const paymentTotals = useMemo(() => {
    let cashTender = 0;
    let cashChange = 0;
    let card = 0;

    for (const w of filtered) {
      const payments = Array.isArray((w as any).payments) ? (w as any).payments : [];
      if (payments.length) {
        for (const p of payments) {
          const pt = String((p && (p.paymentType ?? p.type)) || '').toLowerCase();
          const amt = Number(p?.amount || 0);
          const change = Number(p?.change || p?.changeDue || 0);
          if (!Number.isFinite(amt) || amt <= 0) continue;
          if (pt === 'cash') {
            cashTender += amt;
            if (Number.isFinite(change) && change > 0) cashChange += change;
          }
          if (pt === 'card') card += amt;
        }
        continue;
      }

      const pt = String((w as any).paymentType || '').toLowerCase();
      const amt = Number((w as any).amountPaid || 0);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      if (pt === 'cash') cashTender += amt;
      if (pt === 'card') card += amt;
    }

    const cashNet = cashTender - cashChange;
    return { cashTender, cashChange, cashNet, card };
  }, [filtered]);

  async function downloadSummary() {
    const payload = {
      generatedAt: new Date().toISOString(),
      filters: {
        period,
        from: from || null,
        to: to || null,
        technician: tech || null,
        excludeTax,
        includeRepairs,
        includeSales,
      },
      totals: {
        grandTotal: Number(summary.revenue || 0),
        cashTotal: Number(paymentTotals.cashTender || 0),
        cardTotal: Number(paymentTotals.card || 0),
        changeGiven: Number(paymentTotals.cashChange || 0),
        cashToDeposit: Number(paymentTotals.cashNet || 0),
      },
      popular: {
        repairs: topRepairs,
        products: topSales,
      },
    };

    const api = (window as any).api;
    if (api && typeof api.backupExportPayloadNamed === 'function') {
      await api.backupExportPayloadNamed(payload, 'reporting-summary');
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporting-summary-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function setQuickRange(key: 'today'|'week'|'month'|'year') {
    const now = new Date();
    if (key === 'today') {
      const d = new Date(); d.setHours(0,0,0,0); setFrom(d.toISOString().slice(0,10)); setTo(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString().slice(0,10)); setPeriod('day');
    } else if (key === 'week') {
      const start = startOfPeriod(now, 'week'); const end = new Date(start); end.setDate(start.getDate() + 6);
      setFrom(start.toISOString().slice(0,10)); setTo(end.toISOString().slice(0,10)); setPeriod('week');
    } else if (key === 'month') {
      const start = startOfPeriod(now, 'month'); const end = new Date(start.getFullYear(), start.getMonth()+1, 0);
      setFrom(start.toISOString().slice(0,10)); setTo(end.toISOString().slice(0,10)); setPeriod('month');
    } else if (key === 'year') {
      const start = startOfPeriod(now, 'year'); const end = new Date(start.getFullYear(), 11, 31);
      setFrom(start.toISOString().slice(0,10)); setTo(end.toISOString().slice(0,10)); setPeriod('year');
    }
  }

  async function openReportEmail() {
    const payload = {
      generatedAt: new Date().toISOString(),
      title: 'GadgetBoy Report',
      filters: {
        period,
        from: from || null,
        to: to || null,
        technician: tech || null,
        excludeTax,
        includeRepairs,
        includeSales,
      },
      totals: {
        grandTotal: Number(summary.revenue || 0),
        cashTotal: Number(paymentTotals.cashTender || 0),
        cardTotal: Number(paymentTotals.card || 0),
        changeGiven: Number(paymentTotals.cashChange || 0),
        cashToDeposit: Number(paymentTotals.cashNet || 0),
        orders: Number(summary.orders || 0),
        labor: Number(summary.labor || 0),
        parts: Number(summary.parts || 0),
        subtotal: Number(summary.subtotal || 0),
        tax: Number(summary.tax || 0),
        cost: Number(summary.cost || 0),
        profit: Number(summary.profit || 0),
        marginPct: Number((summary.margin || 0) * 100),
        avgTicket: Number(summary.avgTicket || 0),
      },
      grouped: (grouped || []).map((g: any) => ({
        date: g.date,
        orders: Number(g.orders || 0),
        labor: Number(g.labor || 0),
        parts: Number(g.parts || 0),
        subtotal: Number(g.subtotal || 0),
        tax: Number(g.tax || 0),
        total: Number(g.total || 0),
        cost: Number(g.cost || 0),
        profit: Number(g.profit || 0),
        marginPct: Number(((g.subtotal ? (g.profit / g.subtotal) : 0) * 100) || 0),
      })),
      csv: String(csv || ''),
    };

    const api = (window as any).api;
    if (api && typeof api.openReportEmail === 'function') {
      await api.openReportEmail(payload);
      return;
    }

    // Fallback for non-electron contexts
    const url = window.location.origin + '/?reportEmail=' + encodeURIComponent(JSON.stringify(payload));
    window.open(url, '_blank', 'width=1000,height=720');
  }

  return (
    <div className="h-screen bg-zinc-900 text-gray-100 p-4 space-y-4">
      <div className="text-xl font-bold">Reporting</div>
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
        {/* Store filter removed */}
        <div>
          <label className="block text-xs mb-1">Technician</label>
          <select className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={tech} onChange={e => setTech(e.target.value)}>
            <option value="">All</option>
            {technicianOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm ml-auto">
          <input type="checkbox" className="accent-[#39FF14]" checked={excludeTax} onChange={e => setExcludeTax(e.target.checked)} />
          Exclude tax from revenue
        </label>
        <div className="flex items-center gap-3 ml-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="accent-[#39FF14]" checked={includeRepairs} onChange={e => setIncludeRepairs(e.target.checked)} /> Repairs
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="accent-[#39FF14]" checked={includeSales} onChange={e => setIncludeSales(e.target.checked)} /> Sales
          </label>
        </div>
        <button className="ml-auto px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" onClick={async () => {
          const api = (window as any).api;
          const openFallback = () => {
            const url = window.location.origin + '/?charts=true';
            const win = window.open(url, '_blank', 'width=1200,height=800');
            // After small delay, send current normalized dataset for charts
            setTimeout(() => {
              try {
                const payload = (function () {
                  const all = filtered || [];
                  return all.map((w: any) => ({ ...w }));
                })();
                win && win.postMessage({ type: 'charts:data', payload }, '*');
              } catch {}
            }, 300);
          };
          if (api && typeof api.openCharts === 'function') {
            try { await api.openCharts(); }
            catch (e) { console.warn('openCharts failed, falling back to route', e); openFallback(); }
          } else {
            openFallback();
          }
        }}>Charts</button>
        <button className="px-3 py-2 bg-[#39FF14] text-black rounded font-semibold" onClick={downloadSummary} disabled={!filtered.length}>Download</button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <QuickRange onPick={setQuickRange} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Grand Total</div>
          <div className="mt-2 text-3xl font-bold text-neon-green">${summary.revenue.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Cash Intake</div>
          <div className="mt-2 text-2xl font-bold text-zinc-100">${paymentTotals.cashTender.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Change Given</div>
          <div className="mt-2 text-2xl font-bold text-zinc-100">-${paymentTotals.cashChange.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Cash to Deposit</div>
          <div className="mt-2 text-2xl font-bold text-neon-green">${paymentTotals.cashNet.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Card Total</div>
          <div className="mt-2 text-2xl font-bold text-zinc-100">${paymentTotals.card.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          className="px-4 py-2 bg-[#39FF14] text-black rounded font-semibold disabled:opacity-50"
          onClick={openReportEmail}
          disabled={!filtered.length}
          title={!filtered.length ? 'No data in range' : 'Open email window'}
        >
          Send Email
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Revenue & Orders</div>
          <div className="mt-2 space-y-1">
            <div>Orders: <span className="font-semibold">{summary.orders}</span></div>
            <div>Labor: <span className="font-semibold">${summary.labor.toFixed(2)}</span></div>
            <div>Parts: <span className="font-semibold">${summary.parts.toFixed(2)}</span></div>
            <div>Revenue {excludeTax ? '(excl tax)' : '(incl tax)'}: <span className="font-semibold">${summary.revenue.toFixed(2)}</span></div>
          </div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Cost & Profit</div>
          <div className="mt-2 space-y-1">
            <div>Cost baseline: <span className="font-semibold">${summary.cost.toFixed(2)}</span></div>
            <div>Gross profit: <span className="font-semibold">${summary.profit.toFixed(2)}</span></div>
            <div>Margin: <span className="font-semibold">{(summary.margin * 100).toFixed(1)}%</span></div>
            <div>Avg ticket: <span className="font-semibold">${summary.avgTicket.toFixed(2)}</span></div>
          </div>
          <div className="text-[11px] text-zinc-500 mt-2">Note: Cost baseline uses Internal Cost (what we paid). Parts is what we charged the client.</div>
        </div>
        {/* Repairs vs Sales split */}
        {(() => {
          const repOnly = filtered.filter((x:any) => x.kind !== 'sale');
          const salOnly = filtered.filter((x:any) => x.kind === 'sale');
          const accum = (arr: any[]) => arr.reduce((acc, w) => {
            const t = computeTotals({ laborCost: Number(w.laborCost||0), partCosts: Number(w.partCosts||0), discount: Number(w.discount||0), taxRate: Number(w.taxRate||0), amountPaid: Number(w.amountPaid||0) });
            const labor = Number(w.laborCost||0);
            const parts = Number(w.partCosts||0);
            const subtotal = Math.max(0, labor + parts - Number(w.discount||0));
            const tax = t.tax || 0;
            const revenue = excludeTax ? subtotal : (subtotal + tax);
            const cost = sumInternalCost(w);
            acc.orders += 1; acc.labor += labor; acc.parts += parts; acc.subtotal += subtotal; acc.tax += tax; acc.revenue += revenue; acc.cost += cost; acc.profit += (revenue - cost);
            return acc;
          }, { orders:0, labor:0, parts:0, subtotal:0, tax:0, revenue:0, cost:0, profit:0 });
          const repS = accum(repOnly); const salS = accum(salOnly);
          return (
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 col-span-2">
              <div className="text-sm text-zinc-400 mb-2">Split by Type</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-zinc-400">Repairs</div>
                  <div className="mt-1 space-y-1">
                    <div>Orders: <span className="font-semibold">{repS.orders}</span></div>
                    <div>Labor: <span className="font-semibold">${repS.labor.toFixed(2)}</span></div>
                    <div>Parts: <span className="font-semibold">${repS.parts.toFixed(2)}</span></div>
                    <div>Revenue: <span className="font-semibold">${repS.revenue.toFixed(2)}</span></div>
                    <div>Profit: <span className="font-semibold">${repS.profit.toFixed(2)}</span></div>
                  </div>
                </div>
                <div>
                  <div className="text-zinc-400">Sales</div>
                  <div className="mt-1 space-y-1">
                    <div>Orders: <span className="font-semibold">{salS.orders}</span></div>
                    <div>Revenue: <span className="font-semibold">${salS.revenue.toFixed(2)}</span></div>
                    <div>Profit: <span className="font-semibold">${salS.profit.toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {/* Trends moved to Charts window */}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400 mb-2">Top Repairs</div>
          <ul className="text-sm space-y-1">
            {topRepairs.map(r => (
              <li key={r.title} className="flex justify-between"><span className="text-zinc-300 truncate mr-2" title={r.title}>{r.title}</span><span className="text-zinc-400">{r.count}</span></li>
            ))}
            {topRepairs.length === 0 && <li className="text-zinc-500 text-sm">No data.</li>}
          </ul>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400 mb-2">Top Sales</div>
          <ul className="text-sm space-y-1">
            {topSales.map(r => (
              <li key={r.title} className="flex justify-between"><span className="text-zinc-300 truncate mr-2" title={r.title}>{r.title}</span><span className="text-zinc-400">{r.count}</span></li>
            ))}
            {topSales.length === 0 && <li className="text-zinc-500 text-sm">No data.</li>}
          </ul>
        </div>
      </div>

      {/* Popular Days moved to Charts window */}

      <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
        <div className="text-sm text-zinc-400 mb-2">Detail (by {period})</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800 text-zinc-400">
              <tr>
                <th className="px-2 py-1 text-left">Start</th>
                <th className="px-2 py-1 text-right">Orders</th>
                <th className="px-2 py-1 text-right">Labor</th>
                <th className="px-2 py-1 text-right">Parts</th>
                <th className="px-2 py-1 text-right">Subtotal</th>
                <th className="px-2 py-1 text-right">Tax</th>
                <th className="px-2 py-1 text-right">Revenue</th>
                <th className="px-2 py-1 text-right">Cost</th>
                <th className="px-2 py-1 text-right">Profit</th>
                <th className="px-2 py-1 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(g => (
                <tr key={g.date} className="border-b border-zinc-800">
                  <td className="px-2 py-1">{g.date}</td>
                  <td className="px-2 py-1 text-right">{g.orders}</td>
                  <td className="px-2 py-1 text-right">${g.labor.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.parts.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.subtotal.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.tax.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.total.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.cost.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.profit.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">{(g.subtotal ? (g.profit / g.subtotal) * 100 : 0).toFixed(1)}%</td>
                </tr>
              ))}
              {grouped.length === 0 && (
                <tr><td colSpan={10} className="px-2 py-6 text-center text-zinc-500">No data in range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
        <div className="text-sm text-zinc-400 mb-2">CSV Preview</div>
        <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">{csv || 'No rows.'}</pre>
      </div>
    </div>
  );
};

export default ReportingWindow;

const QuickRange: React.FC<{ onPick: (k: 'today'|'week'|'month'|'year') => void }> = ({ onPick }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-zinc-400">Quick range:</span>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('today')}>Today</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('week')}>This week</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('month')}>This month</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('year')}>This year</button>
  </div>
);

// Simple SVG donut chart with stroke-dasharray segments (no external deps)
const DonutChart: React.FC<{ data: Array<{ label: string; value: number }>; size?: number; thickness?: number }> = ({ data, size = 200, thickness = 24 }) => {
  const total = data.reduce((s, d) => s + Math.max(0, Number(d.value) || 0), 0);
  if (!(total > 0)) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="text-xs text-zinc-500">No data</div>
      </div>
    );
  }
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const colors = ['#39FF14','#7CFC00','#98FB98','#66CDAA','#20B2AA','#32CD32','#3CB371'];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size/2}, ${size/2}) rotate(-90)`}>
        {/* Background ring */}
        <circle r={r} cx={0} cy={0} fill="transparent" stroke="#27272a" strokeWidth={thickness} />
        {data.map((d, idx) => {
          const val = Math.max(0, Number(d.value) || 0);
          const frac = val / total;
          const dash = Math.max(0, frac * c);
          const gap = Math.max(0, c - dash);
          const offset = (c - acc) % c; // accumulate from top
          acc += dash;
          return (
            <circle
              key={d.label + idx}
              r={r}
              cx={0}
              cy={0}
              fill="transparent"
              stroke={colors[idx % colors.length]}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          );
        })}
      </g>
      {/* Center labels */}
      <g>
        <text x="50%" y="48%" textAnchor="middle" className="fill-zinc-200" style={{ fontSize: 14, fontWeight: 600 }}>{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</text>
        <text x="50%" y="62%" textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 11 }}>Total</text>
      </g>
    </svg>
  );
};
