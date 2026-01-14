import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from './Button';

interface Props {
  customerId?: number;
}

const CustomerSales: React.FC<Props> = ({ customerId }) => {
  const [sales, setSales] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!customerId) { setSales([]); return; }
    const all = await (window as any).api.dbGet('sales').catch(() => []);
    setSales((all || []).filter((s: any) => Number(s.customerId) === Number(customerId)));
  }, [customerId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const off = (window as any).api.onSalesChanged?.(() => load());
    return () => { if (typeof off === 'function') off(); };
  }, [load]);

  // Also listen to window.postMessage fallback from the Sale window
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'sales:changed') {
        if (!customerId || (d.customerId && Number(d.customerId) !== Number(customerId))) return;
        load();
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [load, customerId]);

  const totals = useMemo(() => {
    let totalPaid = 0;
    let totalBilled = 0;
    for (const s of sales) {
      const paid = Number(s.amountPaid || 0);
      const billed = Number(s.totals?.total || s.total || 0);
      totalPaid += paid;
      totalBilled += billed;
    }
    return { count: sales.length, totalPaid, totalBilled };
  }, [sales]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Sales</h3>
        <div className="text-xs text-zinc-400 flex gap-4">
          <span>Sales: {totals.count}</span>
          <span>Total Paid: ${totals.totalPaid.toFixed(2)}</span>
          <span>Total Billed: ${totals.totalBilled.toFixed(2)}</span>
        </div>
      </div>
      <div className="border border-zinc-700 rounded overflow-hidden">
        <div className="max-h-[20rem] overflow-y-auto">{/* taller to show more rows */}
          <table className="w-full text-sm">
            <thead className="bg-zinc-800 text-zinc-400 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1">Date</th>
                <th className="text-left px-2 py-1">Item</th>
                <th className="text-left px-2 py-1">Amount Due</th>
                <th className="text-left px-2 py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && (
                <tr><td colSpan={4} className="p-4 text-center text-zinc-500">No sales</td></tr>
              )}
              {sales.map((s: any) => {
                const date = (s.createdAt || s.checkInAt || '').toString().split('T')[0];
                const firstDesc = (Array.isArray(s.items) && s.items[0]?.description) || s.itemDescription || '';
                const total = Number(s.totals?.total || s.total || 0);
                const due = total - Number(s.amountPaid || 0);
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`${s.id === selectedId ? 'bg-zinc-700 ring-2 ring-[#39FF14]' : 'hover:bg-zinc-800'} cursor-pointer transition-colors`}
                  >
                    <td className="px-2 py-1">{date}</td>
                    <td className="px-2 py-1 truncate" title={firstDesc}>{firstDesc}</td>
                    <td className="px-2 py-1">${due.toFixed(2)}</td>
                    <td className="px-2 py-1">${total.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-between items-center mt-2">
        <div className="flex gap-2">
          <Button
            className={`${selectedId ? 'bg-red-600 hover:bg-red-500' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
            disabled={!selectedId}
            onClick={async () => {
              if (!selectedId) return;
              const ok = window.confirm(`Delete sale #GB${String(selectedId).padStart(7,'0')}? This cannot be undone.`);
              if (!ok) return;
              try { await (window as any).api.dbDelete('sales', selectedId); await load(); setSelectedId(null); } catch (e) { console.error('Delete sale failed', e); }
            }}
          >Delete</Button>
        </div>
      </div>
    </div>
  );
};

export default CustomerSales;
