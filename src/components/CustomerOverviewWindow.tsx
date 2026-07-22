import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAutosave } from '../lib/useAutosave';
import { consumeWindowPayload } from '../lib/windowPayload';
import CustomerForm from './CustomerForm';
import Button from './Button';
import DuplicateCustomerDialog from './DuplicateCustomerDialog';
import { Customer } from '../lib/types';
import { CustomerDuplicateMatch, findDuplicateCustomers } from '../lib/customerDuplicates';
import { formatPhone } from '../lib/format';

interface Props {
  customer?: Customer | null;
  onClose: () => void;
  onSaved?: (c: Customer) => void;
  closeAfterSave?: boolean; // default: save closes the window
  childDialog?: boolean;
}

function phoneDigits(value: any): string {
  return String(value || '').replace(/\D+/g, '');
}

function isValidPhone(value: any): boolean {
  return phoneDigits(value).length === 10;
}

function isValidEmail(value: any): boolean {
  const email = String(value || '').trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanCustomerPayload(value: Partial<Customer>): Partial<Customer> {
  const next: any = { ...(value || {}) };
  next.firstName = String(next.firstName || '').trim();
  next.lastName = String(next.lastName || '').trim();
  next.email = String(next.email || '').trim();
  next.phone = String(next.phone || '').trim();
  next.phoneAlt = String(next.phoneAlt || '').trim();
  next.zip = String(next.zip || '').trim();
  next.notes = String(next.notes || '');
  return next;
}

const CustomerOverviewWindow: React.FC<Props> = ({ customer, onClose, onSaved, closeAfterSave = true, childDialog = false }) => {
  const isModalShell = useMemo(() => {
    try { return !!document.querySelector('[data-modal-shell="1"]'); } catch { return false; }
  }, []);
  const [local, setLocal] = useState<Partial<Customer>>(customer || {});
  const [detailsEditing, setDetailsEditing] = useState(!customer?.id);
  const [historyMode, setHistoryMode] = useState<'workorders'|'sales'|'consultations'|'all'>('all');
  const [errors, setErrors] = useState<string[]>([]);
  const [duplicateMatches, setDuplicateMatches] = useState<CustomerDuplicateMatch[]>([]);
  const [autoSaving, setAutoSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const lastChangeRef = useRef<number>(Date.now());
  const abortRef = useRef<any>(null);
  const editSeqRef = useRef(0);
  const duplicatePromptSignatureRef = useRef('');

  // If customer not passed, attempt to load by payload store or query param customerOverview
  useEffect(() => {
    if (customer) return; // already have
    let id = 0;
    try {
      const stored = consumeWindowPayload('customerOverview');
      if (stored !== null) id = Number(stored);
    } catch {}
    if (!id) {
      const params = new URLSearchParams(window.location.search);
      const idParam = params.get('customerOverview');
      id = idParam ? Number(idParam) : 0;
    }
    if (!id) return;
    (async () => {
      try {
        const list = await (window as any).api.findCustomers({ id });
        if (Array.isArray(list) && list.length) {
          setLocal(list[0]);
          setDetailsEditing(false);
          setDirty(false);
          editSeqRef.current = 0;
        }
      } catch (e) {
        console.warn('Failed to load customer by id', e);
      }
    })();
  }, [customer]);

  useEffect(() => {
    setLocal(customer || {});
    setDetailsEditing(!customer?.id);
    setDirty(false);
    editSeqRef.current = 0;
  }, [customer]);

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
    const cleaned = cleanCustomerPayload(c);
    const hasFirst = !!cleaned.firstName;
    const hasLast = !!cleaned.lastName;
    const phoneOk = !cleaned.phone || isValidPhone(cleaned.phone);
    const phoneAltOk = !cleaned.phoneAlt || isValidPhone(cleaned.phoneAlt);
    const emailOk = !cleaned.email || isValidEmail(cleaned.email);
    const hasContact = (!!cleaned.phone && phoneOk) || (!!cleaned.email && emailOk);
    const zipOk = !c.zip || /^[0-9]{5}$/.test(c.zip.toString());
    return hasFirst && hasLast && hasContact && phoneOk && phoneAltOk && emailOk && zipOk;
  }, []);

  const validate = useCallback(() => {
    const errs: string[] = [];
    const cleaned = cleanCustomerPayload(local);
    const phoneOk = !cleaned.phone || isValidPhone(cleaned.phone);
    const phoneAltOk = !cleaned.phoneAlt || isValidPhone(cleaned.phoneAlt);
    const emailOk = !cleaned.email || isValidEmail(cleaned.email);
    if (!cleaned.firstName) errs.push('First name required');
    if (!cleaned.lastName) errs.push('Last name required');
    if (!cleaned.phone && !cleaned.email) errs.push('Phone or Email required');
    if (cleaned.phone && !phoneOk) errs.push('Phone must be 10 digits');
    if (cleaned.phoneAlt && !phoneAltOk) errs.push('Alt phone must be 10 digits');
    if (cleaned.email && !emailOk) errs.push('Email must be valid');
    if (!cleaned.phone && cleaned.email && !emailOk) errs.push('A valid phone or email is required');
    if (cleaned.phone && !phoneOk && (!cleaned.email || !emailOk)) errs.push('A valid phone or email is required');
    if (cleaned.zip && !/^[0-9]{5}$/.test(cleaned.zip.toString())) errs.push('Zip must be 5 digits');
    setErrors(errs);
    return errs.length === 0;
  }, [local]);

  const duplicateSignature = useCallback((matches: CustomerDuplicateMatch[]) => {
    return matches
      .map((m) => `${m.customer.id}:${m.reasons.slice().sort().join(',')}`)
      .sort()
      .join('|');
  }, []);

  const checkForDuplicateCustomer = useCallback(async (
    candidate: Partial<Customer>,
    opts: { silentRepeat?: boolean } = {},
  ): Promise<CustomerDuplicateMatch[]> => {
    if ((candidate as any)?.id) return [];
    try {
      const list = await ((window as any).api.getCustomers?.() ?? (window as any).api.dbGet?.('customers') ?? []);
      const matches = findDuplicateCustomers(candidate, Array.isArray(list) ? list : []);
      if (!matches.length) {
        duplicatePromptSignatureRef.current = '';
        return [];
      }

      const sig = duplicateSignature(matches);
      if (!opts.silentRepeat || duplicatePromptSignatureRef.current !== sig) {
        duplicatePromptSignatureRef.current = sig;
        setDuplicateMatches(matches);
      }
      return matches;
    } catch (e) {
      console.warn('Duplicate customer check failed', e);
      return [];
    }
  }, [duplicateSignature]);

  const openDuplicateCustomer = useCallback(async (customerId: number) => {
    setDuplicateMatches([]);
    try {
      await (window as any).api?.openCustomerOverview?.(customerId);
      onClose();
    } catch (e) {
      console.error('open duplicate customer failed', e);
    }
  }, [onClose]);

  async function handleClose() {
    if (!(local as any)?.id) {
      const matches = await checkForDuplicateCustomer(local);
      if (matches.length) return;
    }
    onClose();
  }

  async function handleSave() {
    const wasExisting = !!(local as any)?.id;
    const saved = await ensureCustomerSaved();
    if (!saved) return;
    if (wasExisting) {
      setDetailsEditing(false);
      return;
    }
    if (closeAfterSave) onClose();
  }

  async function ensureCustomerSaved(): Promise<Customer | null> {
    if (!validate()) return null;
    setAutoSaving(true);
    const saveSeq = editSeqRef.current;
    const payload = { ...cleanCustomerPayload(local), id: (local as any).id, updatedAt: new Date().toISOString(), createdAt: local.createdAt || new Date().toISOString() } as any;
    try {
      let saved: Customer | null = null;
      if ((payload as any).id) {
        saved = await window.api.update('customers', payload);
      } else {
        const matches = await checkForDuplicateCustomer(payload);
        if (matches.length) return null;
        saved = await window.api.addCustomer(payload);
      }
      if (saved) {
        setLocal(saved);
        if (editSeqRef.current === saveSeq) setDirty(false);
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

  // Auto-save using shared hook: wait a bit after input settles, only for existing customers and basic validity
  useAutosave(local, async (val) => {
    const saveSeq = editSeqRef.current;
    setAutoSaving(true);
    try {
      const payload = { ...cleanCustomerPayload(val as any), id: (val as any)?.id, updatedAt: new Date().toISOString(), createdAt: (val as any)?.createdAt || new Date().toISOString() } as any;
      let saved: Customer | null = null;
      if ((payload as any).id) {
        saved = await window.api.update('customers', payload);
      } else {
        const matches = await checkForDuplicateCustomer(payload, { silentRepeat: true });
        if (matches.length) return null;
        saved = await window.api.addCustomer(payload);
      }
      if (saved) {
        // For autosave, avoid clobbering in-progress edits with a round-trip copy.
        // Only merge the id/timestamps for brand-new customers.
        if (!(val as any)?.id && (saved as any)?.id) {
          setLocal(prev => ({
            ...prev,
            id: (saved as any).id,
            createdAt: (saved as any).createdAt ?? (prev as any).createdAt,
            updatedAt: (saved as any).updatedAt ?? (prev as any).updatedAt,
          }));
        }
        if (onSaved) onSaved(saved);
        if (editSeqRef.current === saveSeq) setDirty(false);
      }
      return saved;
    } finally {
      setAutoSaving(false);
    }
  }, {
    debounceMs: 6000,
    enabled: dirty && !!(local as any)?.id && isCustomerValid(local),
    equals: Object.is,
    getLastSavedValue: (_pending, res) => (res as any) || _pending,
    shouldSave: (v) => {
      if (!v) return false;
      return !!(v as any).id && isCustomerValid(v as any);
    },
  });

  async function makePayloadForCustomer(): Promise<{ customerId?: number; customerName?: string; customerPhone?: string; customerPhoneAlt?: string; customerEmail?: string }> {
    const saved = await ensureCustomerSaved();
    const c = (saved || local || {}) as any;
    if (!c.id) return {} as any;
    const name = (c.name || `${c.firstName || ''} ${c.lastName || ''}`).trim();
    return {
      customerId: c.id,
      customerName: name,
      customerPhone: c.phone || '',
      customerPhoneAlt: c.phoneAlt || '',
      customerEmail: c.email || '',
    };
  }

  async function openNewWorkOrderForCustomer() {
    const payload = await makePayloadForCustomer();
    if (!payload.customerId) return;
    await (window as any).api.openNewWorkOrder(payload);
  }

  async function openNewSaleForCustomer() {
    const payload = await makePayloadForCustomer();
    if (!payload.customerId) return;
    await (window as any).api.openNewSale(payload);
  }

  return (
    <>
    <div className={`gb-customer-overview-overlay ${childDialog ? 'is-child-dialog' : ''} fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-6`}>
      <div className="gb-customer-overview-panel bg-zinc-900 border border-zinc-700 rounded w-[1300px] max-w-[95vw] max-h-[95vh] overflow-auto p-4">
        {/* Top toolbar with actions */}
        <div className="gb-customer-overview-header flex items-center justify-between mb-3">
          <div className="text-lg font-semibold text-zinc-200">Customer Overview</div>
          <div className="flex items-center gap-2">
            {detailsEditing ? <Button neon onClick={handleSave}>Save</Button> : null}
            {childDialog ? (
              <button
                type="button"
                aria-label="Close customer form"
                title="Close customer form"
                onClick={handleClose}
                className="h-9 w-9 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded text-zinc-200 hover:border-red-500 hover:text-red-400"
              >
                &#10005;
              </button>
            ) : null}
            {!isModalShell && (
              <button
                type="button"
                aria-label="Close"
                onClick={handleClose}
                className="h-9 w-9 mr-4 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded text-zinc-200 hover:border-[#39FF14] hover:text-[#39FF14]"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div className={`gb-customer-overview-layout flex gap-4 ${!(local as any)?.id ? 'is-new-customer' : 'is-existing-customer'} ${detailsEditing ? 'is-editing' : 'is-viewing'}`}>
          <div className="gb-customer-overview-form w-5/12">
            {(local as any)?.id && !detailsEditing ? (
              <ClientInfoCard
                customer={local}
                onEdit={() => setDetailsEditing(true)}
                onNewWorkOrder={() => void openNewWorkOrderForCustomer()}
                onNewSale={() => void openNewSaleForCustomer()}
              />
            ) : (
              <CustomerForm
                customer={local}
                onChange={c => {
                  editSeqRef.current += 1;
                  setDirty(true);
                  setLocal(prev => ({ ...prev, ...c }));
                }}
              />
            )}
          </div>
          <div className="gb-customer-overview-history w-7/12 flex flex-col gap-3">
            {/* Primary actions above filters */}
            {(!(local as any)?.id || detailsEditing) ? <div className={`gb-customer-primary-actions flex items-center gap-2 mb-1 ${!(local as any)?.id ? 'is-unsaved-client' : ''}`}>
              <Button
                className="px-4 py-2 text-sm bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]"
                onClick={() => void openNewWorkOrderForCustomer()}
              >New Work Order</Button>
              <Button
                className="px-4 py-2 text-sm bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-[#39FF14] hover:text-[#39FF14]"
                onClick={() => void openNewSaleForCustomer()}
              >New Sale</Button>
            </div> : null}
            {(local as any)?.id ? <>
            {/* Filter toggle (smaller) with hover-highlight / solid-when-selected */}
            <div className="gb-customer-history-filters flex items-center gap-2 mb-1">
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
            <SavedQuotesPanel customer={local as any} />
            </> : null}
          </div>
        </div>
        <div className="gb-customer-overview-footer flex items-center justify-between mt-4">
          <div className="flex flex-col gap-1">
            {!!errors.length && <div className="text-sm text-red-400">{errors.join(' · ')}</div>}
            {autoSaving && <div className="text-xs text-zinc-400 animate-pulse">Auto-saving…</div>}
            {!autoSaving && !errors.length && <div className="text-xs text-zinc-500">Auto-save enabled</div>}
          </div>
          <div />
        </div>
      </div>
    </div>
    {duplicateMatches.length > 0 && (
      <DuplicateCustomerDialog
        matches={duplicateMatches}
        onOpenCustomer={openDuplicateCustomer}
        onClose={() => setDuplicateMatches([])}
      />
    )}
    </>
  );
};

export default CustomerOverviewWindow;

const ClientInfoCard: React.FC<{
  customer: Partial<Customer>;
  onEdit: () => void;
  onNewWorkOrder: () => void;
  onNewSale: () => void;
}> = ({ customer, onEdit, onNewWorkOrder, onNewSale }) => {
  const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() || `Client #${customer.id}`;
  const phone = formatPhone(customer.phone || '') || customer.phone || '';
  const altPhone = formatPhone((customer as any).phoneAlt || '') || (customer as any).phoneAlt || '';

  return (
    <section className="gb-client-info-card">
      <header>
        <div>
          <span>Client #{customer.id}</span>
          <h2>{fullName}</h2>
        </div>
        <button type="button" onClick={onEdit} aria-label="Edit client information" title="Edit client information">
          <span aria-hidden="true">&#9998;</span>
        </button>
      </header>
      <div className="gb-client-contact-grid">
        <div><span>Phone</span><strong>{phone || 'Not provided'}</strong></div>
        <div><span>Email</span><strong>{customer.email || 'Not provided'}</strong></div>
        <div><span>Alt. Phone</span><strong>{altPhone || 'Not provided'}</strong></div>
        <div><span>ZIP</span><strong>{customer.zip || 'Not provided'}</strong></div>
      </div>
      {customer.notes ? <div className="gb-client-info-notes"><span>Notes</span><p>{customer.notes}</p></div> : null}
      <div className="gb-client-card-actions">
        <button type="button" onClick={onNewWorkOrder}>New Work Order</button>
        <button type="button" onClick={onNewSale}>New Sale</button>
      </div>
    </section>
  );
};

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

const CombinedHistory: React.FC<{ customer?: Partial<Customer> | null; mode: 'workorders'|'sales'|'consultations'|'all' }> = ({ customer, mode }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ type: 'workorder'|'sale'|'consultation'; id: number } | null>(null);

  const customerId = Number((customer as any)?.id || 0);

  // Ref lets the callback always read the latest customer for filtering without
  // including the whole object in its dependency array.
  const customerRef = useRef(customer);
  customerRef.current = customer;

  const load = useCallback(async () => {
    // New (unsaved) customers have no history — skip all IPC calls.
    if (!customerId) { setOrders([]); setSales([]); return; }
    try {
      const [wo, allSales] = await Promise.all([
        (window as any).api.findWorkOrders({ customerId }).catch(() => []),
        (window as any).api.dbGet('sales').catch(() => []),
      ]);
      // Read latest customer from ref so filtering is always accurate even if the
      // parent re-rendered after load started.
      const cust = customerRef.current;
      setOrders(Array.isArray(wo) ? wo : []);
      setSales((Array.isArray(allSales) ? allSales : []).filter((s: any) => saleMatchesCustomer(s, cust)));
    } catch (e) {
      setOrders([]); setSales([]);
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
    let merged = [...w, ...s];
    merged.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
    if (mode === 'workorders') merged = merged.filter(r => r.type === 'workorder');
    if (mode === 'sales') merged = merged.filter(r => r.type === 'sale');
    if (mode === 'consultations') merged = merged.filter(r => r.type === 'consultation');
    return merged;
  }, [orders, sales, mode]);

  const totalPages = Math.max(1, Math.ceil((rows.length || 0) / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const paged = useMemo(() => rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE), [rows, pageSafe]);

  // Delete selected row with confirmation
  const handleDeleteSelected = useCallback(async () => {
    if (!selected) return;
    const typeLabel = selected.type === 'sale' ? 'sale' : selected.type === 'consultation' ? 'consultation' : 'work order';
    const confirmed = window.confirm(`Delete this ${typeLabel} #${selected.id}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      const collection = selected.type === 'workorder' ? 'workOrders' : 'sales';
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
          <table className="gb-customer-history-table w-full text-sm">
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
                    } else {
                      await (window as any).api.openNewSale({ id: r.id });
                    }
                  }}
                >
                  <td className="px-2 py-1">{r.date}</td>
                  <td className="px-2 py-1">
                    {r.type === 'workorder' ? 'Work Order'
                      : r.type === 'consultation' ? 'Consultation'
                      : 'Sale'}
                  </td>
                  <td className="px-2 py-1 truncate" title={r.label}>{r.label}</td>
                  <td className="px-2 py-1">{`$${r.amountDue.toFixed(2)}`}</td>
                  <td className="px-2 py-1">{`$${r.total.toFixed(2)}`}</td>
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
            title={selected ? `Delete ${selected.type === 'sale' ? 'Sale' : selected.type === 'consultation' ? 'Consultation' : 'Work Order'} #${selected.id}` : 'Select a row to delete'}
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

const SavedQuotesPanel: React.FC<{ customer: Partial<Customer> | any }> = ({ customer }) => {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [quoteFiles, setQuoteFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [savedRows, fileRows] = await Promise.all([
        (window as any).api.dbGet('quotes').catch(() => []),
        (window as any).api.dbGet('quoteFiles').catch(() => []),
      ]);
      setQuotes(Array.isArray(savedRows) ? savedRows : []);
      setQuoteFiles(Array.isArray(fileRows) ? fileRows : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const off = (window as any).api.onQuotesChanged?.(() => void refresh());
    return () => { try { off && off(); } catch {} };
  }, [refresh]);

  const matchesCustomer = useCallback((quote: any) => {
    const customerId = Number(customer?.id || 0);
    const quoteCustomerId = Number(quote?.customerId || 0);
    if (customerId > 0 && quoteCustomerId > 0) return customerId === quoteCustomerId;
    if (quoteCustomerId > 0) return false;
    const customerName = normalizeCustomerName(customer?.name || `${customer?.firstName || ''} ${customer?.lastName || ''}`);
    const quoteName = normalizeCustomerName(quote?.customerName);
    const customerPhone = normalizeCustomerPhone(customer?.phone);
    const quotePhone = normalizeCustomerPhone(quote?.customerPhone);
    return !!customerName && !!customerPhone && customerName === quoteName && customerPhone === quotePhone;
  }, [customer]);

  const rows = useMemo(() => {
    const saved = quotes.filter(matchesCustomer).map((quote) => ({ ...quote, rowKey: `quote-${quote.id}`, collection: 'quotes', isFile: false }));
    const files = quoteFiles.filter(matchesCustomer).map((quote) => ({ ...quote, rowKey: `file-${quote.id || quote.filePath}`, collection: 'quoteFiles', isFile: true }));
    return [...saved, ...files].sort((a, b) => new Date(b.contentUpdatedAt || b.updatedAt || b.createdAt || 0).getTime() - new Date(a.contentUpdatedAt || a.updatedAt || a.createdAt || 0).getTime());
  }, [matchesCustomer, quoteFiles, quotes]);

  const quoteTitle = (quote: any) => {
    if (quote.title) return quote.title;
    const firstItem = Array.isArray(quote.items) ? quote.items[0] : Array.isArray(quote.lines) ? quote.lines[0] : null;
    return firstItem?.model || firstItem?.description || `${quote.type === 'repairs' ? 'Repair' : 'Sales'} Quote #${quote.id || ''}`.trim();
  };

  const removeQuote = async (quote: any) => {
    if (quote?.id == null) return;
    if (!window.confirm(`Delete ${quoteTitle(quote)}? This cannot be undone.`)) return;
    await (window as any).api.dbDelete(quote.collection, quote.id);
    await refresh();
  };

  return (
    <details className="gb-client-quotes">
      <summary>
        <span>Quotes</span>
        <strong>{loading ? '...' : rows.length}</strong>
      </summary>
      <div className="gb-client-quotes-list">
        {rows.length ? rows.map((quote) => {
          const total = Number(quote?.totals?.total ?? quote?.total);
          return (
            <article key={quote.rowKey}>
              <div>
                <strong>{quoteTitle(quote)}</strong>
                <span>{new Date(quote.contentUpdatedAt || quote.updatedAt || quote.createdAt || 0).toLocaleString()}</span>
              </div>
              {Number.isFinite(total) ? <b>${total.toFixed(2)}</b> : null}
              <div className="gb-client-quote-actions">
                {quote.isFile && quote.filePath ? <button type="button" onClick={() => void (window as any).api.openFile(quote.filePath)}>Open</button> : null}
                <button type="button" className="danger" onClick={() => void removeQuote(quote)}>Delete</button>
              </div>
            </article>
          );
        }) : <p>No saved quotes for this client.</p>}
      </div>
    </details>
  );
};

// Legacy signed PDF records remain readable for older desktop-created quotes.
const CompletedQuotesPanel: React.FC<{ customer: Partial<Customer> | any }> = ({ customer }) => {
  const [allRows, setAllRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
    const cid = Number((customer as any)?.id || 0);
    if (!cid) return [];
    const filtered = arr.filter((q: any) => {
      if (!q?.filePath) return false;
      return Number(q?.customerId || 0) === cid;
    });
    filtered.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return filtered;
  }, [allRows, customer]);

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
