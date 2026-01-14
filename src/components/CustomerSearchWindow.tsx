import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Customer } from '../lib/types';
import CustomerSearchForm, { CustomerSearchFilters } from './CustomerSearchForm';
import CustomerTable from './CustomerTable';
import Button from './Button';
import CustomerOverviewWindow from './CustomerOverviewWindow';

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
    </div>
  );
};

export default CustomerSearchWindow;
