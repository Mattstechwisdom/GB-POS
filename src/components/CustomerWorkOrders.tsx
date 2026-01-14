import React, { useEffect, useState, useMemo } from 'react';
import Button from './Button';

interface Props {
  customerId?: number;
}

const CustomerWorkOrders: React.FC<Props> = ({ customerId }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  // Derive lifetime spend & order count
  const lifetime = useMemo(() => {
    let totalPaid = 0;
    let totalBilled = 0;
    for (const o of orders) {
      const paid = Number(o.amountPaid || 0);
      const billed = Number(o.totals?.total || o.total || 0);
      totalPaid += paid;
      totalBilled += billed;
    }
    return { totalPaid, totalBilled, orderCount: orders.length };
  }, [orders]);

  // Expose via data-attributes if needed for parent

  const load = React.useCallback(async () => {
    if (!customerId) { setOrders([]); setSelectedId(null); return; }
    const found = await window.api.findWorkOrders({ customerId });
    setOrders(found || []);
    // If selection no longer exists, clear it
    if (selectedId && !(found || []).some((o: any) => o.id === selectedId)) {
      setSelectedId(null);
    }
  }, [customerId, selectedId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsub = (window as any).api.onWorkOrdersChanged?.(() => load());
    return () => { if (unsub) unsub(); };
  }, [load]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Work Orders</h3>
        <div className="text-xs text-zinc-400 flex gap-4">
          <span>Orders: {lifetime.orderCount}</span>
          <span>Total Paid: ${lifetime.totalPaid.toFixed(2)}</span>
          <span>Total Billed: ${lifetime.totalBilled.toFixed(2)}</span>
        </div>
      </div>
      <div className="border border-zinc-700 rounded overflow-hidden">
        <div className="max-h-[20rem] overflow-y-auto">{/* taller to show more rows */}
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="text-left px-2 py-1">Date</th>
              <th className="text-left px-2 py-1">Device</th>
              <th className="text-left px-2 py-1">Amount Due</th>
              <th className="text-left px-2 py-1">Repair Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-zinc-500">No work orders</td></tr>
            )}
            {orders.map(o => {
              const due = (() => {
                const total = Number(o.totals?.total || o.total || 0);
                const paid = Number(o.amountPaid || 0);
                return total - paid;
              })();
              const repairTotal = Number(o.laborCost || 0) + Number(o.partCosts || 0);
              return (
                <tr
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  onDoubleClick={async () => { await (window as any).api.openNewWorkOrder({ workOrderId: o.id }); }}
                  className={`${o.id === selectedId ? 'bg-zinc-700 ring-2 ring-[#39FF14]' : 'hover:bg-zinc-800'} cursor-pointer transition-colors`}
                >
                  <td className="px-2 py-1">{o.checkInAt ? o.checkInAt.split('T')[0] : ''}</td>
                  <td className="px-2 py-1">{o.productDescription || o.productCategory || ''}</td>
                  <td className="px-2 py-1">${due.toFixed(2)}</td>
                  <td className="px-2 py-1">${repairTotal.toFixed(2)}</td>
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
              const confirm = await new Promise<boolean>((resolve) => {
                // Simple inline confirm modal
                const ok = window.confirm(`Delete work order #GB${String(selectedId).padStart(7,'0')}? This cannot be undone.`);
                resolve(ok);
              });
              if (!confirm) return;
              try {
                await (window as any).api.dbDelete('workOrders', selectedId);
                await load();
              } catch (e) {
                console.error('Delete failed', e);
              }
            }}
          >Delete</Button>
        </div>
      </div>
    </div>
  );
};

export default CustomerWorkOrders;
