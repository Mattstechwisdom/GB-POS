import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Customer } from '../lib/types';
import CustomerSearchForm, { CustomerSearchFilters } from './CustomerSearchForm';
import CustomerTable from './CustomerTable';
import Button from './Button';
import CustomerOverviewWindow from './CustomerOverviewWindow';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { useContextMenu } from '../lib/useContextMenu';
import { formatPhone } from '../lib/format';

interface Props {
  onClose: () => void;
}

const CustomerSearchWindow: React.FC<Props> = ({ onClose }) => {
  const [filters, setFilters] = useState<CustomerSearchFilters>({ firstName: '', lastName: '', phone: '', email: '' });
  const [selected, setSelected] = useState<Customer | null>(null);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

	const ctx = useContextMenu<Customer>();
	const ctxCustomer = ctx.state.data;

  const loadCustomers = useCallback(async () => {
    try {
      const list = await window.api.getCustomers();
      setCustomersList(list || []);
    } catch (e) {
      setCustomersList([]);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
    const offCust = (window as any).api.onCustomersChanged?.(() => loadCustomers());
    const offSales = (window as any).api.onSalesChanged?.(() => loadCustomers());
    const offWO = (window as any).api.onWorkOrdersChanged?.(() => loadCustomers());
    return () => { try { offCust && offCust(); } catch {} try { offSales && offSales(); } catch {} try { offWO && offWO(); } catch {} };
  }, [loadCustomers]);

  const filtered = useMemo(() => {
    const f = customersList || [];
    const qFirst = (filters.firstName ?? '').trim().toLowerCase();
    const qLast = (filters.lastName ?? '').trim().toLowerCase();
    const qPhone = (filters.phone ?? '').trim().toLowerCase();
    const qEmail = (filters.email ?? '').trim().toLowerCase();
    const anyFilled = !!(qFirst || qLast || qPhone || qEmail);
    if (!anyFilled) {
      // No filters: show only the 8 most recently updated/created customers (newest first)
      const sorted = f.slice().sort((a, b) => {
        const au = a.updatedAt || a.createdAt || '';
        const bu = b.updatedAt || b.createdAt || '';
        const cmp = (bu as string).localeCompare(au as string);
        return cmp !== 0 ? cmp : ((b.id || 0) - (a.id || 0));
      });
      return sorted.slice(0, 8);
    }
    return f.filter(c => {
      const first = (c.firstName ?? '').toLowerCase();
      const last = (c.lastName ?? '').toLowerCase();
      const phone = ((c.phone ?? '')).toLowerCase();
      const email = (c.email ?? '').toLowerCase();
      return (!qFirst || first.includes(qFirst)) &&
             (!qLast || last.includes(qLast)) &&
             (!qPhone || phone.includes(qPhone)) &&
             (!qEmail || email.includes(qEmail));
    });
  }, [filters, customersList]);

  const handleSearch = useCallback((f: CustomerSearchFilters) => {
    setFilters(f);
  }, []);

  const handleActivate = useCallback((c: Customer) => {
    setSelected(c);
    try {
      if ((window as any).api?.openCustomerOverview) {
        (window as any).api.openCustomerOverview(c.id);
      } else {
        // Fallback: reuse existing inline overview modal
        setEditingCustomer(c);
        setShowOverview(true);
      }
    } catch (e) {
      console.error('open customer overview failed', e);
    }
  }, []);

  const openContextMenu = useCallback((e: React.MouseEvent, c: Customer) => {
    setSelected(c);
    ctx.openFromEvent(e, c);
  }, [ctx]);

  const ctxItems: ContextMenuItem[] = useMemo(() => {
    if (!ctxCustomer) return [];
    const name = [ctxCustomer.firstName, ctxCustomer.lastName].filter(Boolean).join(' ').trim() || `Customer #${ctxCustomer.id}`;
    const phone = (formatPhone(String(ctxCustomer.phone || '')) || String(ctxCustomer.phone || '')).trim();
    const phoneAlt = (formatPhone(String((ctxCustomer as any).phoneAlt || '')) || String((ctxCustomer as any).phoneAlt || '')).trim();
    const email = String((ctxCustomer as any).email || '').trim();
    const api = (window as any).api;

    return [
      { type: 'header', label: name },
      { label: 'Open Customer', onClick: async () => { await api?.openCustomerOverview?.(ctxCustomer.id); } },
      { label: 'New Work Order', onClick: async () => {
        await api?.openNewWorkOrder?.({ customerId: ctxCustomer.id, customerName: name, customerPhone: ctxCustomer.phone || '' });
      }},
      { type: 'separator' },
      { label: 'Copy Phone', disabled: !phone, hint: phone || undefined, onClick: async () => { if (!phone) return; try { await navigator.clipboard.writeText(phone); } catch {} } },
      { label: 'Copy Phone (alt)', disabled: !phoneAlt, hint: phoneAlt || undefined, onClick: async () => { if (!phoneAlt) return; try { await navigator.clipboard.writeText(phoneAlt); } catch {} } },
      { label: 'Copy Email', disabled: !email, hint: email || undefined, onClick: async () => { if (!email) return; try { await navigator.clipboard.writeText(email); } catch {} } },
      { type: 'separator' },
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

  async function handleAddCustomer(payload: Partial<Customer>) {
    try {
      const added = await window.api.addCustomer({ ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      if (added) setCustomersList(s => [...s, added]);
      setShowAdd(false);
    } catch (e) {
      console.error('failed to add', e);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 overflow-auto">
      <div className="w-full max-w-5xl bg-zinc-900 border border-zinc-700 rounded shadow-xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-zinc-700">
          <h2 className="font-bold text-lg">Customer Search</h2>
        </div>
        <div className="p-4 space-y-4 overflow-auto">
          <CustomerSearchForm onSearch={handleSearch} />
          <CustomerTable
            customers={filtered}
            selectedId={selected?.id}
            onSelect={c => setSelected(c)}
            onActivate={handleActivate}
				onContextMenu={openContextMenu}
          />
        </div>
        <div className="mt-auto p-3 border-t border-zinc-700 flex items-center justify-between gap-2 bg-zinc-800/60 sticky bottom-0">
          <div className="flex gap-2">
            <Button onClick={() => { setEditingCustomer(null); setShowOverview(true); }} className="bg-zinc-700 hover:bg-zinc-600">New Customer</Button>
          </div>
          <Button neon onClick={onClose}>Close</Button>
        </div>
      </div>
      {showOverview && (
        <CustomerOverviewWindow
          customer={editingCustomer}
          onClose={() => { setShowOverview(false); setEditingCustomer(null); }}
          onSaved={(c) => { setCustomersList(s => { const idx = s.findIndex(x => x.id === c.id); if (idx === -1) return [...s, c]; const copy = [...s]; copy[idx] = c; return copy; }); }}
        />
      )}

		<ContextMenu
			id="customer-search-ctx"
			open={ctx.state.open}
			x={ctx.state.x}
			y={ctx.state.y}
			items={ctxItems}
			onClose={ctx.close}
		/>
    </div>
  );
};

export default CustomerSearchWindow;
