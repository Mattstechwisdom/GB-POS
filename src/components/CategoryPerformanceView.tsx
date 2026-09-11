import React, { useMemo, useState } from 'react';
import { buildCategoryPerformance } from '@/lib/categoryPerformance';
import { inventoryIncomingQuantity } from '@/lib/inventoryReorder';

type Props = { records: any[]; inventory: any[]; purchaseOrders: any[]; from: string; to: string; onFromChange: (value: string) => void; onToChange: (value: string) => void };
type BusinessFilter = 'All' | 'Retail Sales' | 'Repairs' | 'Consultations';
const money = (value: number) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function CategoryPerformanceView({ records, inventory, purchaseOrders, from, to, onFromChange, onToChange }: Props) {
  const [businessFilter, setBusinessFilter] = useState<BusinessFilter>('Retail Sales');
  const [categoryFilter, setCategoryFilter] = useState('Beverages');
  const report = useMemo(() => {
    const incoming = new Map<number, number>();
    for (const item of inventory || []) {
      const id = Number(item?.id);
      if (id > 0) incoming.set(id, inventoryIncomingQuantity(id, purchaseOrders || []));
    }
    return buildCategoryPerformance(records, inventory, {
      from: from ? new Date(`${from}T00:00:00`) : null,
      to: to ? new Date(`${to}T23:59:59.999`) : null,
      incomingByInventoryId: incoming,
    });
  }, [records, inventory, purchaseOrders, from, to]);

  const categories = report.categories.map(row => row.category);
  const selectedCategory = categoryFilter === 'All categories' ? categoryFilter : (categories.includes(categoryFilter) ? categoryFilter : (categories[0] || 'Beverages'));
  const visibleLines = report.lines.filter(line => selectedCategory === 'All categories' || line.category === selectedCategory);
  const selected = selectedCategory === 'All categories' ? report.categories.reduce((total, row) => ({
    category: 'All categories', unitsSold: total.unitsSold + row.unitsSold, revenue: total.revenue + row.revenue,
    knownCost: total.knownCost + row.knownCost, grossProfit: total.grossProfit + row.grossProfit,
    marginPct: 0, missingCostCount: total.missingCostCount + row.missingCostCount, lowStockCount: total.lowStockCount + row.lowStockCount,
  }), { category: 'All categories', unitsSold: 0, revenue: 0, knownCost: 0, grossProfit: 0, marginPct: 0, missingCostCount: 0, lowStockCount: 0 }) : report.categories.find(row => row.category === selectedCategory);
  if (selected && selectedCategory === 'All categories') selected.marginPct = selected.missingCostCount || !selected.revenue ? null as any : selected.grossProfit / selected.revenue * 100;
  const businessRows = report.businessLines.filter(row => businessFilter === 'All' || row.line === businessFilter);
  const businessRevenue = businessRows.reduce((sum, row) => sum + row.revenue, 0);
  const businessTransactions = businessRows.reduce((sum, row) => sum + row.transactions, 0);
  const maxCategoryRevenue = Math.max(1, ...report.categories.map(row => row.revenue));

  return <div className="space-y-4">
    <section className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Category Performance</h2>
          <p className="text-xs text-zinc-400">Collected sales, verified margin, and current inventory health for the selected reporting dates.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-zinc-400">From<input type="date" value={from} onChange={event => onFromChange(event.target.value)} className="mt-1 block rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-white" /></label>
          <label className="text-xs text-zinc-400">To<input type="date" value={to} onChange={event => onToChange(event.target.value)} className="mt-1 block rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-white" /></label>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(['All', 'Retail Sales', 'Repairs', 'Consultations'] as BusinessFilter[]).map(value => <button key={value} type="button" onClick={() => setBusinessFilter(value)} className={`rounded px-3 py-2 text-sm font-semibold ${businessFilter === value ? 'bg-[#BC13FE] text-white' : 'border border-zinc-700 bg-zinc-900 text-zinc-300'}`}>{value}</button>)}
      </div>
    </section>

    {businessFilter !== 'Retail Sales' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Metric label="Collected revenue" value={money(businessRevenue)} />
      <Metric label="Transactions" value={String(businessTransactions)} />
      <Metric label="Average transaction" value={money(businessTransactions ? businessRevenue / businessTransactions : 0)} />
    </div>}

    {(businessFilter === 'All' || businessFilter === 'Retail Sales') && <>
      <div className="flex flex-wrap gap-2">
        {['All categories', ...categories].map(category => <button key={category} type="button" onClick={() => setCategoryFilter(category)} className={`rounded-full border px-3 py-1.5 text-sm ${selectedCategory === category ? 'border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14]' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}>{category}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric label="Revenue" value={money(selected?.revenue || 0)} />
        <Metric label="Units sold" value={String(selected?.unitsSold || 0)} />
        <Metric label="Internal cost" value={money(selected?.knownCost || 0)} />
        <Metric label="Gross profit" value={selected?.missingCostCount ? 'Needs cost' : money(selected?.grossProfit || 0)} warning={!!selected?.missingCostCount} />
        <Metric label="Margin" value={selected?.marginPct == null ? 'Needs cost' : `${selected.marginPct.toFixed(1)}%`} warning={selected?.marginPct == null && !!selected?.revenue} />
        <Metric label="Low stock" value={String(selected?.lowStockCount || 0)} warning={!!selected?.lowStockCount} />
      </div>

      <section className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,2fr)]">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Category comparison</h3>
          <div className="mt-3 space-y-3">{report.categories.map(row => <button key={row.category} type="button" onClick={() => setCategoryFilter(row.category)} className="block w-full text-left">
            <div className="flex justify-between gap-3 text-xs"><span>{row.category}</span><span>{money(row.revenue)}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-gradient-to-r from-[#BC13FE] to-[#39FF14]" style={{ width: `${Math.max(row.revenue > 0 ? 3 : 0, row.revenue / maxCategoryRevenue * 100)}%` }} /></div>
          </button>)}</div>
        </div>
        <div className="min-w-0">
          <div className="space-y-2 md:hidden">{visibleLines.map(line => <button key={`mobile-${line.key}`} type="button" onClick={() => line.inventoryId && (window as any).api?.openInventory?.({ inventoryId: line.inventoryId })} className={`w-full rounded-lg border p-3 text-left ${line.lowStock ? 'border-red-500/50 bg-red-500/5' : 'border-zinc-800 bg-zinc-900'}`}>
            <div className="flex items-start justify-between gap-3"><strong className="min-w-0 truncate">{line.title}</strong><span className="shrink-0 text-[#39FF14]">{money(line.revenue)}</span></div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-400"><span>Sold <b className="block text-white">{line.unitsSold}</b></span><span>Margin <b className="block text-white">{line.marginPct == null ? '—' : `${line.marginPct.toFixed(1)}%`}</b></span><span>On hand <b className={line.lowStock ? 'block text-red-300' : 'block text-white'}>{line.stockCount ?? 'Not tracked'}</b></span></div>
          </button>)}</div>
          <div className="hidden overflow-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-zinc-900 text-xs text-zinc-400"><tr><th className="px-2 py-2 text-left">Item</th><th className="px-2 py-2 text-right">Sold</th><th className="px-2 py-2 text-right">Revenue</th><th className="px-2 py-2 text-right">Cost</th><th className="px-2 py-2 text-right">Profit</th><th className="px-2 py-2 text-right">Margin</th><th className="px-2 py-2 text-right">On hand</th><th className="px-2 py-2 text-right">Incoming</th><th className="px-2 py-2 text-right">Est. days</th></tr></thead>
            <tbody>{visibleLines.map(line => <tr key={line.key} className={`border-b border-zinc-800 ${line.lowStock ? 'bg-red-500/5' : ''}`}>
              <td className="px-2 py-2"><button type="button" className="max-w-[240px] truncate text-left font-semibold text-white hover:text-[#39FF14]" title={line.title} onClick={() => line.inventoryId && (window as any).api?.openInventory?.({ inventoryId: line.inventoryId })}>{line.title}</button>{line.lowStock && <div className="text-[10px] font-bold uppercase text-red-300">Low stock</div>}</td>
              <td className="px-2 py-2 text-right">{line.unitsSold}</td><td className="px-2 py-2 text-right">{money(line.revenue)}</td><td className="px-2 py-2 text-right">{line.missingCostCount ? 'Missing' : money(line.knownCost)}</td><td className="px-2 py-2 text-right">{line.missingCostCount ? '—' : money(line.grossProfit)}</td><td className="px-2 py-2 text-right">{line.marginPct == null ? '—' : `${line.marginPct.toFixed(1)}%`}</td><td className="px-2 py-2 text-right">{line.stockCount ?? 'Not tracked'}</td><td className="px-2 py-2 text-right">{line.incoming || '—'}</td><td className="px-2 py-2 text-right">{line.daysRemaining == null ? '—' : line.daysRemaining}</td>
            </tr>)}</tbody>
          </table>
          </div>
          {!visibleLines.length && <div className="py-8 text-center text-sm text-zinc-500">No inventory or sales are categorized here yet.</div>}
        </div>
      </section>
    </>}
  </div>;
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3"><div className="text-xs text-zinc-500">{label}</div><div className={`mt-1 text-xl font-bold ${warning ? 'text-amber-300' : 'text-white'}`}>{value}</div></div>;
}
