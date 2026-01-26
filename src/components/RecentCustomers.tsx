import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { formatPhone } from '../lib/format';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { useContextMenu } from '../lib/useContextMenu';

interface CustomerLite {
  id: number;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt?: string;
}

const RecentCustomers: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

	const ctx = useContextMenu<CustomerLite>();
	const ctxCustomer = ctx.state.data;

  const ctxItems = useMemo<ContextMenuItem[]>(() => {
    if (!ctxCustomer) return [];
    const name = [ctxCustomer.firstName, ctxCustomer.lastName].filter(Boolean).join(' ').trim() || `Customer #${ctxCustomer.id}`;
    const phone = formatPhone(ctxCustomer.phone || '') || (ctxCustomer.phone || '');
    const api = (window as any).api;
    return [
      { type: 'header', label: name },
      { label: 'Open Customer', onClick: async () => { await api?.openCustomerOverview?.(ctxCustomer.id); } },
      { label: 'New Work Order', onClick: async () => { await api?.openNewWorkOrder?.({ customerId: ctxCustomer.id, customerName: name, customerPhone: ctxCustomer.phone || '' }); } },
      { type: 'separator' },
      { label: 'Copy Phone', disabled: !phone, hint: phone || undefined, onClick: async () => { if (!phone) return; try { await navigator.clipboard.writeText(String(phone)); } catch {} } },
      { label: 'Copy Name', onClick: async () => { try { await navigator.clipboard.writeText(name); } catch {} } },
      { type: 'separator' },
      {
        label: 'Delete…',
        danger: true,
        onClick: async () => {
          try {
            const orders = await api?.findWorkOrders?.({ customerId: ctxCustomer.id }).catch(() => []);
            const count = Array.isArray(orders) ? orders.length : 0;
            const msg = count > 0
              ? `Delete ${name}?\n\nThis customer has ${count} work order(s). Deleting the customer may leave old work orders without a linked customer.`
              : `Delete ${name}?`;
            if (!window.confirm(msg)) return;
            await api?.dbDelete?.('customers', ctxCustomer.id);
          } catch (e) {
            console.error('Delete customer failed', e);
          }
        },
      },
    ];
  }, [ctxCustomer]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const api = (window as any).api;
      const [allCustomers, workOrders] = await Promise.all([
        api?.getCustomers ? api.getCustomers() : (api?.dbGet ? api.dbGet('customers') : Promise.resolve([])),
        api?.getWorkOrders ? api.getWorkOrders() : (api?.dbGet ? api.dbGet('workOrders') : Promise.resolve([])),
      ]);
      const customerMap = new Map<number, CustomerLite>();
      (allCustomers || []).forEach((c: any) => customerMap.set(c.id, c));

      // Sort work orders by most recent activity (checkInAt desc, then id desc)
      const sorted = (workOrders || []).slice().sort((a: any, b: any) => {
        const ad = a.checkInAt || ''; const bd = b.checkInAt || '';
        const cmp = bd.localeCompare(ad);
        return cmp !== 0 ? cmp : ((b.id || 0) - (a.id || 0));
      });

  // Take first 8 recent customers, prioritizing recent work orders, then fill with newest customers
      const seen = new Set<number | string>();
      const recent: CustomerLite[] = [];
      for (const w of sorted) {
        const key = (typeof w.customerId !== 'undefined' && w.customerId !== null) ? w.customerId : (w.customerName || `${w.firstName || ''} ${w.lastName || ''}` || w.phone);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        let c: CustomerLite | undefined;
        if (typeof key === 'number' && customerMap.has(key)) {
          const found = customerMap.get(key)!;
          c = {
            id: found.id,
            firstName: (found as any).firstName,
            lastName: (found as any).lastName,
            phone: (found as any).phone || (found as any).phoneAlt,
            createdAt: (found as any).createdAt,
          };
        } else {
          // Fallback for legacy/inlined data
          c = {
            id: (typeof w.customerId === 'number' ? w.customerId : w.id),
            firstName: w.firstName || undefined,
            lastName: w.lastName || undefined,
            phone: w.customerPhone || w.phone || undefined,
            createdAt: w.checkInAt,
          };
        }
        recent.push(c);
        if (recent.length >= 8) break;
      }

      // If we have fewer than 8, backfill with newest customers by updatedAt/createdAt
      if (recent.length < 8) {
        const sortedCustomers = (allCustomers || []).slice().sort((a:any, b:any) => {
          const au = a.updatedAt || a.createdAt || ''; const bu = b.updatedAt || b.createdAt || '';
          const cmp = (bu as string).localeCompare(au as string);
          return cmp !== 0 ? cmp : ((b.id || 0) - (a.id || 0));
        });
        for (const c of sortedCustomers) {
          if (seen.has(c.id)) continue;
          recent.push({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone || c.phoneAlt, createdAt: c.createdAt });
          if (recent.length >= 8) break;
        }
      }

      setCustomers(recent);
    } catch (e:any) {
      console.error('recent customers load', e);
      setError('Load failed');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const api = (window as any).api;
    const offWO = api?.onWorkOrdersChanged?.(() => load());
    const offCust = api?.onCustomersChanged?.(() => load());
    const offSales = api?.onSalesChanged?.(() => load());
    return () => { try { offWO && offWO(); } catch {} try { offCust && offCust(); } catch {} try { offSales && offSales(); } catch {} };
  }, [load]);

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm">Recent Customers</span>
        <button onClick={load} className="bg-zinc-700 text-xs px-2 py-1 rounded disabled:opacity-50" disabled={loading}>{loading ? '...' : 'Reload'}</button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-400">
            <th className="text-left">Last Name</th>
            <th className="text-left">First Name</th>
            <th className="text-left">Phone</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={3} className="py-4 text-center text-zinc-500">Loading...</td></tr>
          )}
          {!loading && error && (
            <tr><td colSpan={3} className="py-4 text-center text-red-400">{error}</td></tr>
          )}
          {!loading && !error && customers.length === 0 && (
            <tr><td colSpan={3} className="py-4 text-center text-zinc-500">No customers yet</td></tr>
          )}
          {!loading && !error && customers.map((c, i) => (
            <tr
              key={c.id}
              className={`${i % 2 ? 'bg-zinc-900' : 'bg-zinc-800'} hover:bg-zinc-700 cursor-pointer`}
              title="Open customer overview"
              onClick={() => { if (typeof c.id === 'number' && c.id > 0) { (window as any).api.openCustomerOverview?.(c.id); } }}
        onContextMenu={(e) => {
          if (typeof c.id === 'number' && c.id > 0) {
            ctx.openFromEvent(e, c);
          }
        }}
            >
              <td className="py-1 pr-2">{c.lastName || ''}</td>
              <td className="py-1 pr-2">{c.firstName || ''}</td>
              <td className="py-1">{formatPhone(c.phone || '')}</td>
            </tr>
          ))}
        </tbody>
      </table>

    <ContextMenu
      id="recent-customers-ctx"
      open={ctx.state.open}
      x={ctx.state.x}
      y={ctx.state.y}
      items={ctxItems}
      onClose={ctx.close}
    />
    </div>
  );
};

export default RecentCustomers;
