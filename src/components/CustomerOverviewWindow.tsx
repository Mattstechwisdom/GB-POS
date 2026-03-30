import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAutosave } from '../lib/useAutosave';
import CustomerForm from './CustomerForm';
import Button from './Button';
import { Customer } from '../lib/types';

interface Props {
  customer?: Customer | null;
  onClose: () => void;
  onSaved?: (c: Customer) => void;
  closeAfterSave?: boolean; // default: save closes the window
}

const CustomerOverviewWindow: React.FC<Props> = ({ customer, onClose, onSaved, closeAfterSave = true }) => {
  const [local, setLocal] = useState<Partial<Customer>>(customer || {});
  const [historyMode, setHistoryMode] = useState<'workorders'|'sales'|'quotes'|'consultations'|'all'>('all');
  const [errors, setErrors] = useState<string[]>([]);
  const [autoSaving, setAutoSaving] = useState(false);
  const lastChangeRef = useRef<number>(Date.now());
  const abortRef = useRef<any>(null);

  // If customer not passed, attempt to load by query param customerOverview
  useEffect(() => {
    if (customer) return; // already have
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('customerOverview');
    const id = idParam ? Number(idParam) : 0;
    if (!id) return;
    (async () => {
      try {
        const list = await (window as any).api.findCustomers({ id });
        if (Array.isArray(list) && list.length) {
          setLocal(list[0]);
        }
      } catch (e) {
        console.warn('Failed to load customer by id', e);
      }
    })();
  }, [customer]);

  useEffect(() => setLocal(customer || {}), [customer]);

  // Reload lists when child windows notify about sales changes via postMessage
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data: any = e?.data;
      if (!data || data.type !== 'sales:changed') return;
      // Force a re-render; child components will reload from their subscriptions
      setLocal(l => ({ ...l }));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const isCustomerValid = useCallback((c: Partial<Customer> | null | undefined) => {
    if (!c) return false;
    const hasFirst = !!c.firstName && !!c.firstName.trim();
    const hasLast = !!c.lastName && !!c.lastName.trim();
    const hasContact = !!(c.phone || c.email);
    const zipOk = !c.zip || /^[0-9]{5}$/.test(c.zip.toString());
    return hasFirst && hasLast && hasContact && zipOk;
  }, []);

  const validate = useCallback(() => {
    const errs: string[] = [];
    if (!local.firstName || !local.firstName.trim()) errs.push('First name required');
    if (!local.lastName || !local.lastName.trim()) errs.push('Last name required');
    if (!(local.phone || local.email)) errs.push('Phone or Email required');
    if (local.zip && !/^[0-9]{5}$/.test(local.zip.toString())) errs.push('Zip must be 5 digits');
    setErrors(errs);
    return errs.length === 0;
  }, [local]);

  async function handleSave() {
    const saved = await ensureCustomerSaved();
    if (saved && closeAfterSave) onClose();
  }

  async function ensureCustomerSaved(): Promise<Customer | null> {
    if (!validate()) return null;
    setAutoSaving(true);
    const payload = { ...local, updatedAt: new Date().toISOString(), createdAt: local.createdAt || new Date().toISOString() } as any;
    try {
      let saved: Customer | null = null;
      if ((payload as any).id) {
        saved = await window.api.update('customers', payload);
      } else {
        saved = await window.api.addCustomer(payload);
      }
      if (saved) {
        setLocal(saved);
        if (onSaved) onSaved(saved);
      }
      return saved;
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      setAutoSaving(false);
    }
  }

  // Auto-save using shared hook: wait 2s after input settles, only for existing customers and basic validity
  useAutosave(local, async (val) => {
    setAutoSaving(true);
    try {
      const payload = { ...val, updatedAt: new Date().toISOString(), createdAt: (val as any)?.createdAt || new Date().toISOString() } as any;
      let saved: Customer | null = null;
      if ((payload as any).id) {
        saved = await window.api.update('customers', payload);
      } else {
        saved = await window.api.addCustomer(payload);
      }
      if (saved) {
        setLocal(saved);
        if (onSaved) onSaved(saved);
      }
    } finally {
      setAutoSaving(false);
    }
  }, {
    debounceMs: 1000,
    enabled: isCustomerValid(local) || !!(local as any)?.id,
    shouldSave: (v) => {
      if (!v) return false;
      if ((v as any).id) return !!(v as any).firstName && !!(v as any).lastName;
      return isCustomerValid(v as any);
    },
  });

  async function makePayloadForCustomer(): Promise<{ customerId?: number; customerName?: string; customerPhone?: string }> {
    const saved = await ensureCustomerSaved();
    const c = (saved || local || {}) as any;
    if (!c.id) return {} as any;
    const name = (c.name || `${c.firstName || ''} ${c.lastName || ''}`).trim();
    return { customerId: c.id, customerName: name, customerPhone: c.phone || '' };
  }

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-6">
      <div className="bg-zinc-900 border border-zinc-700 rounded w-[1300px] max-w-[95vw] max-h-[95vh] overflow-auto p-4">
        {/* Top toolbar with actions */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold text-zinc-200">Customer Overview</div>
          <div className="flex items-center gap-2">
            <Button className="bg-zinc-700" onClick={onClose}>Close</Button>
            <Button neon onClick={handleSave}>Save</Button>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="w-5/12">
            <CustomerForm customer={local} onChange={c => setLocal(prev => ({ ...prev, ...c }))} />
          </div>
          <div className="w-7/12 flex flex-col gap-3">
            {/* Primary actions above filters */}
            <div className="flex items-center gap-2 mb-1">
              <Button
                className="px-4 py-2 text-sm bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]"
                onClick={async () => {
                  const payload = await makePayloadForCustomer();
                  await (window as any).api.openNewWorkOrder(payload);
                }}
              >New Work Order</Button>
              <Button
                className="px-4 py-2 text-sm bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]"
                onClick={async () => {
                  const payload = await makePayloadForCustomer();
                  await (window as any).api.openNewSale(payload);
                }}
              >New Sale</Button>
            </div>
            {/* Filter toggle (smaller) with hover-highlight / solid-when-selected */}
            <div className="flex items-center gap-2 mb-1">
              <button
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${historyMode==='workorders' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]'}`}
                onClick={() => setHistoryMode('workorders')}
                title="Show repair work orders only"
              >Work Orders</button>
              <button
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${historyMode==='sales' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]'}`}
                onClick={() => setHistoryMode('sales')}
                title="Show sales only"
              >Sales</button>
              <button
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${historyMode==='quotes' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]'}`}
                onClick={() => setHistoryMode('quotes')}
                title="Show quotes only"
              >Quotes</button>
              <button
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${historyMode==='consultations' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]'}`}
                onClick={() => setHistoryMode('consultations')}
                title="Show consultations only"
              >Consultations</button>
              <button
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${historyMode==='all' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]'}`}
                onClick={() => setHistoryMode('all')}
                title="Show everything"
              >All</button>
            </div>
            {/* Combined list with pagination */}
            <CombinedHistory
              customer={local as any}
              mode={historyMode}
            />
            {/* Completed Quotes: signed-off PDFs linked to this customer */}
            <CompletedQuotesPanel customer={local as any} />
          </div>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="flex flex-col gap-1">
            {!!errors.length && <div className="text-sm text-red-400">{errors.join(' · ')}</div>}
            {autoSaving && <div className="text-xs text-zinc-400 animate-pulse">Auto-saving…</div>}
            {!autoSaving && !errors.length && <div className="text-xs text-zinc-500">Auto-save enabled</div>}
          </div>
          <div />
        </div>
      </div>
    </div>
  );
};

export default CustomerOverviewWindow;

// Combined history (Work Orders + Sales) with pagination and filters
const PAGE_SIZE = 6;

function normalizeCustomerName(value: any) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeCustomerPhone(value: any) {
  return String(value || '').replace(/\D+/g, '').slice(-10);
}

function saleMatchesCustomer(sale: any, customer: any) {
  const customerId = Number(customer?.id || 0);
  const saleCustomerId = Number(sale?.customerId || 0);
  if (customerId > 0 && saleCustomerId > 0 && saleCustomerId === customerId) return true;

  const customerName = normalizeCustomerName(customer?.name || `${customer?.firstName || ''} ${customer?.lastName || ''}`);
  const customerPhone = normalizeCustomerPhone(customer?.phone);
  const saleName = normalizeCustomerName(sale?.customerName);
  const salePhone = normalizeCustomerPhone(sale?.customerPhone);

  const hasCustomerName = !!customerName;
  const hasCustomerPhone = !!customerPhone;
  const nameMatches = hasCustomerName && !!saleName && saleName === customerName;
  const phoneMatches = hasCustomerPhone && !!salePhone && salePhone === customerPhone;

  if (hasCustomerName && hasCustomerPhone) return nameMatches && phoneMatches;
  if (hasCustomerName) return nameMatches;
  if (hasCustomerPhone) return phoneMatches;
  return false;
}

const CombinedHistory: React.FC<{ customer?: Partial<Customer> | null; mode: 'workorders'|'sales'|'quotes'|'consultations'|'all' }> = ({ customer, mode }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [quoteFiles, setQuoteFiles] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ type: 'workorder'|'sale'|'consultation'|'quote'; id: number } | null>(null);

  const customerId = Number((customer as any)?.id || 0);

  // Ref lets the callback always read the latest customer for filtering without
  // including the whole object in its dependency array.
  const customerRef = useRef(customer);
  customerRef.current = customer;

  const load = useCallback(async () => {
    // New (unsaved) customers have no history — skip all IPC calls.
    if (!customerId) { setOrders([]); setSales([]); setQuoteFiles([]); return; }
    try {
      const [wo, allSales, allQuoteFiles] = await Promise.all([
        (window as any).api.findWorkOrders({ customerId }).catch(() => []),
        (window as any).api.dbGet('sales').catch(() => []),
        (window as any).api.dbGet('quoteFiles').catch(() => []),
      ]);
      // Read latest customer from ref so filtering is always accurate even if the
      // parent re-rendered after load started.
      const cust = customerRef.current;
      const custNameNorm = normalizeCustomerName((cust as any)?.name || `${(cust as any)?.firstName || ''} ${(cust as any)?.lastName || ''}`);
      const custPhoneNorm = normalizeCustomerPhone((cust as any)?.phone);
      setOrders(Array.isArray(wo) ? wo : []);
      setSales((Array.isArray(allSales) ? allSales : []).filter((s: any) => saleMatchesCustomer(s, cust)));
      setQuoteFiles((Array.isArray(allQuoteFiles) ? allQuoteFiles : []).filter((q: any) => {
        if (customerId && q.customerId === customerId) return true;
        const qName = normalizeCustomerName(q.customerName);
        const qPhone = normalizeCustomerPhone(q.customerPhone);
        return (!!custNameNorm && qName === custNameNorm) && (!!custPhoneNorm ? qPhone === custPhoneNorm : true);
      }));
    } catch (e) {
      setOrders([]); setSales([]); setQuoteFiles([]);
    }
  }, [customerId]); // Only re-create when the saved customer ID changes — not on every keystroke

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const off1 = (window as any).api.onWorkOrdersChanged?.(() => load());
    const off2 = (window as any).api.onSalesChanged?.(() => load());
    return () => { try { off1 && off1(); off2 && off2(); } catch {} };
  }, [load]);

  // Merge and normalize
  const rows = useMemo(() => {
    const w = (orders || []).map((o: any) => {
      const total = Number(o.totals?.total || o.total || 0);
      const paid = Number(o.amountPaid || 0);
      return {
        key: `wo-${o.id}`,
        id: o.id,
        type: 'workorder' as const,
        date: (o.checkInAt || '').toString().split('T')[0] || '',
        label: o.productDescription || o.productCategory || '',
        amountDue: total - paid,
        total: total,
        filePath: undefined as string | undefined,
      };
    });
    const s = (sales || []).map((x: any) => {
      const total = Number(x.totals?.total || x.total || 0);
      const paid = Number(x.amountPaid || 0);
      const firstDesc = (Array.isArray(x.items) && x.items[0]?.description) || x.itemDescription || '';
      const isConsultation = String(x.category || '').toLowerCase() === 'consultation';
      return {
        key: `sale-${x.id}`,
        id: x.id,
        type: isConsultation ? 'consultation' as const : 'sale' as const,
        date: (x.createdAt || x.checkInAt || '').toString().split('T')[0] || '',
        label: firstDesc,
        amountDue: total - paid,
        total: total,
        filePath: undefined as string | undefined,
      };
    });
    const q = (quoteFiles || []).map((qf: any) => ({
      key: `quote-${qf.id}`,
      id: qf.id,
      type: 'quote' as const,
      date: (qf.createdAt || '').toString().split('T')[0] || '',
      label: qf.title || 'Quote',
      amountDue: 0,
      total: 0,
      filePath: qf.filePath as string | undefined,
    }));
    let merged = [...w, ...s, ...q];
    merged.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
    if (mode === 'workorders') merged = merged.filter(r => r.type === 'workorder');
    if (mode === 'sales') merged = merged.filter(r => r.type === 'sale');
    if (mode === 'quotes') merged = merged.filter(r => r.type === 'quote');
    if (mode === 'consultations') merged = merged.filter(r => r.type === 'consultation');
    return merged;
  }, [orders, sales, quoteFiles, mode]);

  const totalPages = Math.max(1, Math.ceil((rows.length || 0) / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const paged = useMemo(() => rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE), [rows, pageSafe]);

  // Delete selected row with confirmation
  const handleDeleteSelected = useCallback(async () => {
    if (!selected) return;
    const typeLabel = selected.type === 'sale' ? 'sale' : selected.type === 'consultation' ? 'consultation' : selected.type === 'quote' ? 'quote' : 'work order';
    const confirmed = window.confirm(`Delete this ${typeLabel} #${selected.id}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      const collection = selected.type === 'workorder' ? 'workOrders' : selected.type === 'quote' ? 'quoteFiles' : 'sales';
      await (window as any).api.dbDelete(collection, selected.id);
      setSelected(null);
      await load();
    } catch (e) {
      console.error('Delete failed', e);
    }
  }, [selected, load]);

  return (
    <div className="flex flex-col gap-2">
      <div className="border border-zinc-700 rounded overflow-hidden">
        <div className="min-h-[16rem] max-h-[24rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800 text-zinc-400 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1">Date</th>
                <th className="text-left px-2 py-1">Type</th>
                <th className="text-left px-2 py-1">Item / Device</th>
                <th className="text-left px-2 py-1">Amount Due</th>
                <th className="text-left px-2 py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-zinc-500">No records</td></tr>
              )}
              {paged.map(r => (
                <tr
                  key={r.key}
                  className={`${selected && selected.type==='workorder' && r.type==='workorder' && selected.id===r.id ? 'bg-zinc-700 ring-2 ring-[#39FF14]' : selected && selected.type==='sale' && r.type==='sale' && selected.id===r.id ? 'bg-zinc-700 ring-2 ring-[#39FF14]' : 'hover:bg-zinc-800'} cursor-pointer transition-colors`}
                  onClick={() => setSelected({ type: r.type, id: r.id })}
                  onDoubleClick={async () => {
                    if (r.type === 'workorder') {
                      await (window as any).api.openNewWorkOrder({ workOrderId: r.id });
                    } else if (r.type === 'quote') {
                      if (r.filePath) { try { await (window as any).api.openFile(r.filePath); } catch {} }
                    } else {
                      await (window as any).api.openNewSale({ id: r.id });
                    }
                  }}
                >
                  <td className="px-2 py-1">{r.date}</td>
                  <td className="px-2 py-1">
                    {r.type === 'workorder' ? 'Work Order'
                      : r.type === 'consultation' ? 'Consultation'
                      : r.type === 'quote' ? 'Quote'
                      : 'Sale'}
                  </td>
                  <td className="px-2 py-1 truncate" title={r.label}>{r.label}</td>
                  <td className="px-2 py-1">{r.type === 'quote' ? '—' : `$${r.amountDue.toFixed(2)}`}</td>
                  <td className="px-2 py-1">{r.type === 'quote' ? '—' : `$${r.total.toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Pagination & Delete action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 text-xs bg-red-700 hover:bg-red-800 border border-red-600 rounded text-white disabled:opacity-50"
            disabled={!selected}
            title={selected ? `Delete ${selected.type === 'sale' ? 'Sale' : 'Work Order'} #${selected.id}` : 'Select a row to delete'}
            onClick={handleDeleteSelected}
          >
            Delete
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded disabled:opacity-50"
            disabled={pageSafe <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >Prev</button>

          {/* Page block navigation: show pages in blocks of 5 */}
          <PageBlockControls
            totalPages={totalPages}
            currentPage={pageSafe}
            onChangePage={(n: number) => setPage(n)}
          />

          <button
            className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded disabled:opacity-50"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >Next</button>
        </div>
      </div>
    </div>
  );
};

// Page block controls component: shows up to 5 page numbers starting from blockStart, with '...' to reveal next block
const PageBlockControls: React.FC<{ totalPages: number; currentPage: number; onChangePage: (n: number) => void }> = ({ totalPages, currentPage, onChangePage }) => {
  const [blockStart, setBlockStart] = useState(1);

  useEffect(() => {
    // Ensure blockStart contains currentPage
    const b = Math.floor((currentPage - 1) / 5) * 5 + 1;
    setBlockStart(Math.max(1, Math.min(b, Math.max(1, totalPages - ((totalPages - 1) % 5)))));
  }, [currentPage, totalPages]);

  const visibleEnd = Math.min(blockStart + 4, totalPages);
  const pages = [] as number[];
  for (let i = blockStart; i <= visibleEnd; i++) pages.push(i);

  return (
    <div className="flex items-center gap-1">
      {pages.map(n => (
        <button
          key={n}
          className={`px-2 py-1 text-xs border rounded ${n === currentPage ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}
          onClick={() => onChangePage(n)}
        >{n}</button>
      ))}
      {visibleEnd < totalPages && (
        <button
          className="px-2 py-1 text-xs border rounded bg-zinc-800 border-zinc-700 text-zinc-200"
          onClick={() => setBlockStart(s => Math.min(s + 5, totalPages - ((totalPages - 1) % 5) || s + 5))}
          title="Show next pages"
        >…</button>
      )}
    </div>
  );
};

// Panel listing completed quote PDFs associated with this customer
const CompletedQuotesPanel: React.FC<{ customer: Partial<Customer> | any }> = ({ customer }) => {
  const [allRows, setAllRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const nameNorm = useMemo(() => {
    const name = (customer?.name || `${customer?.firstName || ''} ${customer?.lastName || ''}`).trim();
    return name.toLowerCase();
  }, [customer]);
  const phoneNorm = useMemo(() => String(customer?.phone || '').replace(/\D+/g,'').slice(-10), [customer]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await (window as any).api.dbGet('quoteFiles').catch(() => []);
      setAllRows(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const rows = useMemo(() => {
    const arr = Array.isArray(allRows) ? allRows : [];
    const cid = (customer as any)?.id;
    const filtered = arr.filter((q: any) => {
      if (cid && q.customerId === cid) return true;
      const qName = String(q.customerName || '').trim().toLowerCase();
      const qPhone = String(q.customerPhone || '').replace(/\D+/g,'').slice(-10);
      return (!!nameNorm && qName === nameNorm) && (!!phoneNorm ? qPhone === phoneNorm : true);
    });
    filtered.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return filtered;
  }, [allRows, customer, nameNorm, phoneNorm]);

  const handleOpen = async (r: any) => {
    if (!r?.filePath) return;
    try { await (window as any).api.openFile(r.filePath); } catch {}
  };
  const handleDelete = async (r: any) => {
    if (!r?.id) return;
    const ok = window.confirm('Delete this quote file record?');
    if (!ok) return;
    try { await (window as any).api.dbDelete('quoteFiles', r.id); await refresh(); } catch {}
  };

  return (
    <div className="mt-2 border border-zinc-700 rounded">
      <div className="flex items-center justify-between px-2 py-1 bg-zinc-800">
        <div className="text-sm text-zinc-200">Completed Quotes</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={refresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-3 text-xs text-zinc-400">No completed quotes found for this customer.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
              <tr>
                <th className="text-left px-2 py-1">Date</th>
                <th className="text-left px-2 py-1">Title</th>
                <th className="text-left px-2 py-1">File</th>
                <th className="px-2 py-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id || r.filePath} className="hover:bg-zinc-800">
                  <td className="px-2 py-1">{new Date(r.createdAt || 0).toLocaleString()}</td>
                  <td className="px-2 py-1 truncate" title={r.title || ''}>{r.title || '-'}</td>
                  <td className="px-2 py-1 truncate" title={r.filePath || ''}>{r.filePath || ''}</td>
                  <td className="px-2 py-1 text-right">
                    <button className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded mr-1" onClick={() => handleOpen(r)}>Open</button>
                    <button className="px-2 py-0.5 text-xs bg-red-800 border border-red-700 rounded" onClick={() => handleDelete(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
