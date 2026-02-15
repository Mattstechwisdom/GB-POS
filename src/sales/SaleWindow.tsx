import React, { useEffect, useMemo, useRef, useState } from 'react';
import WorkOrderSidebar from '@/workorders/WorkOrderSidebar';
import IntakePanel from '@/workorders/IntakePanel';
import PaymentPanel from '@/workorders/PaymentPanel';
import { computeTotals } from '@/lib/calc';
import { WorkOrderFull } from '@/lib/types';
import SaleItemsTable, { SaleItemRow } from './SaleItemsTable';

type SalePayload = {
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
};

type SaleRecord = {
  id?: number;
  createdAt?: string;
  updatedAt?: string;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  // legacy single-item fields (kept for backward-compat in prints/receipt)
  itemDescription?: string;
  quantity?: number;
  price?: number;
  // new multi-item list
  items?: SaleItemRow[];
  inStock?: boolean; // true when item is available immediately
  orderedDate?: string | null; // YYYY-MM-DD
  estimatedDeliveryDate?: string | null; // YYYY-MM-DD
  partsOrderUrl?: string;
  partsTrackingUrl?: string;
  notes?: string;
  total?: number;
  // Fields to align with shared panels
  status?: string;
  assignedTo?: string | null;
  checkInAt?: string | null;
  repairCompletionDate?: string | null;
  checkoutDate?: string | null;
  clientPickupDate?: string | null;
  discount?: number;
  amountPaid?: number;
  taxRate?: number;
  laborCost?: number;
  partCosts?: number;
  totals?: { subTotal: number; tax: number; total: number; remaining: number };
  internalCost?: number; // deprecated: moved per-item; kept for old records
  condition?: 'New' | 'Excellent' | 'Good' | 'Fair'; // deprecated: moved per-item
};

type SaleRequiredKey = 'assignedTo' | 'itemDetails';

type ValidationActionKey = 'save' | 'checkout' | 'close';

const SALE_REQUIRED_LABELS: Record<SaleRequiredKey, string> = {
  assignedTo: 'Assigned technician',
  itemDetails: 'At least one product',
};

function readPayload(): SalePayload | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('newSale');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

const SaleWindow: React.FC = () => {
  const payload = useMemo(() => readPayload() || {}, []);
  const [sale, setSale] = useState<Partial<SaleRecord>>({
    customerId: payload.customerId,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    items: [],
    inStock: false,
    orderedDate: null,
    estimatedDeliveryDate: null,
    partsOrderUrl: '',
    partsTrackingUrl: '',
    notes: '',
    // shared-panel fields
    status: 'open',
    assignedTo: null,
    checkInAt: new Date().toISOString(),
    repairCompletionDate: null,
    checkoutDate: null,
    discount: 0,
    amountPaid: 0,
    taxRate: 8,
    laborCost: 0,
    partCosts: 0,
    totals: { subTotal: 0, tax: 0, total: 0, remaining: 0 },
    // sales-only
    clientPickupDate: null as any,
    internalCost: undefined,
    condition: 'New',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [validationActive, setValidationActive] = useState<boolean>(false);
  const [warningBanner, setWarningBanner] = useState<{ message: string; details?: string } | null>(null);
  const [warningBannerVisible, setWarningBannerVisible] = useState<boolean>(false);
  const warningHideTimer = useRef<number | undefined>(undefined);
  const warningRemoveTimer = useRef<number | undefined>(undefined);
  const [armedValidationActions, setArmedValidationActions] = useState<Record<ValidationActionKey, boolean>>({
    save: false,
    checkout: false,
    close: false,
  });

  function triggerWarningBanner(message: string, details?: string) {
    if (warningHideTimer.current !== undefined) {
      window.clearTimeout(warningHideTimer.current);
      warningHideTimer.current = undefined;
    }
    if (warningRemoveTimer.current !== undefined) {
      window.clearTimeout(warningRemoveTimer.current);
      warningRemoveTimer.current = undefined;
    }
    setWarningBanner({ message, details });
    setWarningBannerVisible(true);
    warningHideTimer.current = window.setTimeout(() => {
      setWarningBannerVisible(false);
      warningRemoveTimer.current = window.setTimeout(() => {
        setWarningBanner(null);
        warningRemoveTimer.current = undefined;
      }, 400);
    }, 6000);
  }

  const missingRequired = useMemo<SaleRequiredKey[]>(() => {
    const missing: SaleRequiredKey[] = [];
    const assigned = (sale.assignedTo ?? '').toString().trim();
    if (!assigned) missing.push('assignedTo');
    const rows = Array.isArray(sale.items) ? sale.items : [];
    const legacyDesc = (sale as any).itemDescription;
    const hasItem = (rows.length > 0) || (typeof legacyDesc === 'string' && legacyDesc.trim().length > 0);
    if (!hasItem) missing.push('itemDetails');
    return missing;
  }, [sale]);

  const hasMeaningfulInput = useMemo(() => {
    const assigned = (sale.assignedTo ?? '').toString().trim();
    const rows = Array.isArray(sale.items) ? sale.items : [];
    const legacyDesc = (sale as any).itemDescription;
    return Boolean(
      assigned ||
      rows.length > 0 ||
      (typeof legacyDesc === 'string' && legacyDesc.trim().length > 0) ||
      (sale.notes && sale.notes.trim()) ||
      (Number(sale.discount) || 0) !== 0 ||
      (Number(sale.amountPaid) || 0) !== 0 ||
      sale.inStock ||
      (sale.orderedDate && sale.orderedDate.toString().trim()) ||
      (sale.estimatedDeliveryDate && sale.estimatedDeliveryDate.toString().trim()) ||
      (sale as any).quantity ||
      (sale as any).price
    );
  }, [sale]);

  useEffect(() => {
    if (validationActive && missingRequired.length === 0) {
      setValidationActive(false);
    }
  }, [validationActive, missingRequired]);

  useEffect(() => () => {
    if (warningHideTimer.current !== undefined) {
      window.clearTimeout(warningHideTimer.current);
      warningHideTimer.current = undefined;
    }
    if (warningRemoveTimer.current !== undefined) {
      window.clearTimeout(warningRemoveTimer.current);
      warningRemoveTimer.current = undefined;
    }
  }, []);

  useEffect(() => {
    if (missingRequired.length === 0) {
      if (warningHideTimer.current !== undefined) {
        window.clearTimeout(warningHideTimer.current);
        warningHideTimer.current = undefined;
      }
      if (warningRemoveTimer.current !== undefined) {
        window.clearTimeout(warningRemoveTimer.current);
        warningRemoveTimer.current = undefined;
      }
      setWarningBannerVisible(false);
      setWarningBanner(null);
      setArmedValidationActions({ save: false, checkout: false, close: false });
    }
  }, [missingRequired.length]);

  const sidebarValidationFlags = useMemo<Partial<Record<'assignedTo', boolean>> | undefined>(() => {
    if (!validationActive) return undefined;
    const set = new Set(missingRequired);
    return { assignedTo: set.has('assignedTo') };
  }, [validationActive, missingRequired]);

  const itemsSectionNeedsAttention = validationActive && missingRequired.includes('itemDetails');

  // If payload contains an id, load the existing sale from DB for editing
  useEffect(() => {
    (async () => {
      try {
        const pid = (payload as any)?.id;
        if (!pid) return;
        const list = await (window as any).api.dbGet('sales').catch(() => []);
        const found = (Array.isArray(list) ? list : []).find((s: any) => Number(s.id) === Number(pid));
        if (found) {
          // Auto-migrate legacy single-item fields to items for editing
          if ((!Array.isArray(found.items) || found.items.length === 0) && (found.itemDescription || found.quantity || found.price)) {
            const row: SaleItemRow = {
              id: crypto.randomUUID(),
              description: found.itemDescription || 'Item',
              qty: Number(found.quantity || 1) || 1,
              price: Number(found.price || 0) || 0,
              internalCost: typeof found.internalCost === 'number' ? found.internalCost : undefined,
              condition: (found as any).condition || 'New',
              productUrl: (found as any).productUrl,
            } as any;
            setSale({ ...found, items: [row] });
          } else {
            setSale(found);
          }
        }
      } catch (e) { console.warn('Failed to load sale by id from payload', e); }
    })();
  }, [payload]);

  const itemTotal = (row: SaleItemRow) => (Number(row.qty) || 0) * (Number(row.price) || 0);
  const total = useMemo(() => {
    const rows = sale.items || [];
    if (rows.length > 0) return rows.reduce((sum, r) => sum + itemTotal(r), 0);
    // Legacy single item fallback
    const q = Number((sale as any).quantity || 0);
    const p = Number((sale as any).price || 0);
    return (q > 0 && p > 0) ? (q * p) : 0;
  }, [sale.items, (sale as any).quantity, (sale as any).price]);

  // Recompute partCosts and totals like the Work Order window, treating sales as parts-only
  useEffect(() => {
    const partCosts = total;
    const laborCost = 0;
    const totals = computeTotals({
      laborCost,
      partCosts,
      discount: sale.discount || 0,
      taxRate: sale.taxRate || 0,
      amountPaid: sale.amountPaid || 0,
    });
    setSale(s => ({ ...s, partCosts, laborCost, totals }));
  }, [total, sale.discount, sale.taxRate, sale.amountPaid]);

  // Per-item internal cost editing and pricing handled inside SaleItemsTable edit flow.

  function ensureRequired(action: ValidationActionKey, actionDescription: string): boolean {
    if (missingRequired.length === 0) {
      setValidationActive(false);
      setArmedValidationActions(prev => ({ ...prev, [action]: false }));
      return true;
    }

    setValidationActive(true);
    const detailText = missingRequired.map(key => SALE_REQUIRED_LABELS[key]).join(', ');

    if (!armedValidationActions[action]) {
      setArmedValidationActions(prev => ({ ...prev, [action]: true }));
      triggerWarningBanner(
        `Review required fields before ${actionDescription}`,
        `${detailText}. Click again to continue.`
      );
      return false;
    }

    setArmedValidationActions(prev => ({ ...prev, [action]: false }));
    triggerWarningBanner(`Continuing with missing fields`, detailText);
    return true;
  }

  function validate(actionDescription: string): boolean {
    if (!ensureRequired(actionDescription.includes('checking out') ? 'checkout' : 'save', actionDescription)) return false;
    if ((sale as any).id) {
      setErrors([]);
      return true;
    }

    const errs: string[] = [];
    const rows = sale.items || [];
    if (rows.length === 0) {
      const desc = (sale as any).itemDescription;
      const qty = Number((sale as any).quantity || 0);
      const price = Number((sale as any).price || 0);
      if (!desc || !desc.toString().trim()) errs.push('Item description required');
      if (!(qty > 0)) errs.push('Qty must be >= 1');
      if (!(price >= 0)) errs.push('Price must be ≥ 0');
    } else {
      rows.forEach((r, idx) => {
        if (!r.description || !r.description.toString().trim()) errs.push(`Row ${idx + 1}: description required`);
        if (!(Number(r.qty) > 0)) errs.push(`Row ${idx + 1}: qty must be >= 1`);
        if (!(Number(r.price) >= 0)) errs.push(`Row ${idx + 1}: price must be ≥ 0`);
      });
    }

    setErrors(errs);
    if (errs.length > 0) {
      triggerWarningBanner(`Fix fields before ${actionDescription}`, errs.slice(0, 4).join(' · '));
      return false;
    }
    return true;
  }

  const canSave = useMemo(() => {
    // Existing sale can always be saved to persist metadata like technician/dates
    if ((sale as any).id) return true;
    const rows = sale.items || [];
    if (rows.length === 0) {
      // Legacy single item fallback
      const desc = (sale as any).itemDescription;
      const qty = Number((sale as any).quantity || 0);
      const price = Number((sale as any).price || 0);
      return !!(desc && desc.toString().trim() && qty > 0 && price >= 0);
    }
    for (const r of rows) {
      if (!r.description || !r.description.toString().trim()) return false;
      if (!(Number(r.qty) > 0)) return false;
      if (!(Number(r.price) >= 0)) return false;
    }
    return true;
  }, [sale.items, (sale as any).itemDescription, (sale as any).quantity, (sale as any).price, (sale as any).id]);

  function buildSaleRecordBase(): SaleRecord {
    const now = new Date().toISOString();
    const record: SaleRecord = {
      ...sale,
      // legacy fields: mirror first row for compatibility
      itemDescription: sale.items && sale.items[0] ? sale.items[0].description : (sale as any).itemDescription,
      quantity: sale.items && sale.items[0] ? sale.items[0].qty : (sale as any).quantity,
        price: sale.items && sale.items[0] ? sale.items[0].price : (sale as any).price,
      // If inStock, null out order/delivery fields to avoid confusion
      orderedDate: sale.inStock ? null : sale.orderedDate || null,
      estimatedDeliveryDate: sale.inStock ? null : sale.estimatedDeliveryDate || null,
      partsOrderUrl: sale.inStock ? '' : (sale.partsOrderUrl || ''),
      partsTrackingUrl: sale.inStock ? '' : (sale.partsTrackingUrl || ''),
      createdAt: (sale as any).id ? (sale.createdAt || now) : now,
      updatedAt: now,
      total: total,
      items: sale.items as any,
    } as SaleRecord;
    // Preserve original checkInAt for updates
    if ((sale as any).id) {
      (record as any).checkInAt = sale.checkInAt || record.checkInAt || null;
    }
    return record;
  }

  async function handleSave() {
    if (!validate('saving this sale')) return;
    const record = buildSaleRecordBase();
    try {
      let saved;
      if ((sale as any).id) {
        saved = await window.api.dbUpdate('sales', (sale as any).id, { ...record, id: (sale as any).id });
      } else {
        saved = await window.api.dbAdd('sales', record);
      }
      if (saved) {
        setSale(saved);
        setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }));
        // Reflect in Calendar: add parts/events based on dates present
        try { await reflectSaleInCalendar(saved); } catch (e) { console.warn('calendar sync failed', e); }
        // Nudge any opener window (e.g., Customer Overview) to reload sales in fallback scenarios
        try { window.opener?.postMessage({ type: 'sales:changed', customerId: saved.customerId }, '*'); } catch {}

        // After saving, return the user to the main/customer screen.
        window.close();
      }
    } catch (e) {
      console.error('Save failed', e);
      triggerWarningBanner('Failed to save sale', 'See console for details.');
    }
  }

  function onlyDate(iso?: string | null) { return (iso || '').toString().slice(0, 10); }
  function onlyTime(iso?: string | null) {
    const v = (iso || '').toString();
    if (!v.includes('T')) return '';
    return v.split('T')[1].slice(0, 5); // HH:mm
  }

  async function reflectSaleInCalendar(saved: SaleRecord) {
    const all: any[] = await (window as any).api.dbGet('calendarEvents').catch(() => []);
    const firstDesc = saved.items && saved.items[0] ? saved.items[0].description : saved.itemDescription;
    const safeItem = (firstDesc || 'Product').toString().trim();
    const base = {
      category: 'parts',
      partName: safeItem,
      title: safeItem,
      customerName: saved.customerName,
      customerPhone: saved.customerPhone,
      technician: saved.assignedTo || undefined,
      source: 'sale',
      saleId: saved.id,
      orderUrl: (saved as any).partsOrderUrl || undefined,
      trackingUrl: (saved as any).partsTrackingUrl || undefined,
    } as any;

    async function syncOne(status: 'ordered' | 'delivery', desiredDate: string | null) {
      const existing = all.filter(e => e.category === 'parts' && e.source === 'sale' && e.saleId === saved.id && e.partsStatus === status);
      if (!desiredDate) {
        for (const e of existing) {
          if (e?.id != null) await (window as any).api.dbDelete('calendarEvents', e.id).catch(() => {});
        }
        return;
      }
      const sameDate = existing.find(e => e.date === desiredDate);
      for (const e of existing) {
        if (sameDate && e === sameDate) continue;
        if (e?.id != null) await (window as any).api.dbDelete('calendarEvents', e.id).catch(() => {});
      }
      if (sameDate?.id != null) {
        await (window as any).api.dbUpdate('calendarEvents', sameDate.id, { ...sameDate, ...base, date: desiredDate, partsStatus: status }).catch(() => {});
      } else {
        await (window as any).api.dbAdd('calendarEvents', { ...base, date: desiredDate, partsStatus: status }).catch(() => {});
      }
    }

    // Ordered (O)
    const od = saved.inStock ? null : onlyDate(saved.orderedDate || undefined);
    // Estimated Delivery (D)
    const dd = saved.inStock ? null : onlyDate(saved.estimatedDeliveryDate || undefined);
    await syncOne('ordered', od ? od : null);
    await syncOne('delivery', dd ? dd : null);
    // Client pickup as regular event with time if provided
    const cpDate = onlyDate((saved as any).clientPickupDate);
    const cpTime = onlyTime((saved as any).clientPickupDate);
    if (cpDate) {
      const title = `Pickup: ${safeItem}`;
      const exists = all.some(e => e.category === 'event' && e.title === title && e.date === cpDate && (e.time || '') === (cpTime || ''));
      if (!exists) {
        await (window as any).api.dbAdd('calendarEvents', { category: 'event', date: cpDate, time: cpTime || undefined, title, customerName: saved.customerName, customerPhone: saved.customerPhone });
      }
    }
  }

  function toWorkOrderFull(): WorkOrderFull {
    // Map sale to a WorkOrderFull-like shape for shared panels
    const rows = (sale.items || []) as SaleItemRow[];
    const items = (rows.length ? rows : [{ id: 'sale-item', description: sale.itemDescription || 'Retail item', qty: sale.quantity || 1, price: sale.price || 0 } as any]).map((r: any) => ({
      id: r.id || crypto.randomUUID(),
      description: r.description,
      qty: r.qty || 1,
      unitPrice: r.price,
      parts: (Number(r.qty) || 0) * (Number(r.price) || 0),
      labor: 0,
      status: 'pending',
    }));
    return {
      id: (sale as any).id || 0,
      customerId: sale.customerId || 0,
      status: (sale.status as any) || 'open',
      assignedTo: sale.assignedTo || null,
      checkInAt: sale.checkInAt || null,
      repairCompletionDate: sale.repairCompletionDate || null,
      checkoutDate: sale.checkoutDate || null,
      productCategory: 'Retail',
      productDescription: (sale.items && sale.items[0]?.description) || sale.itemDescription || '',
      problemInfo: '',
      password: '',
      model: '',
      serial: '',
      intakeSource: '',
      discount: sale.discount || 0,
      amountPaid: sale.amountPaid || 0,
      taxRate: sale.taxRate || 0,
      laborCost: sale.laborCost || 0,
      partCosts: items.reduce((s, r) => s + (r.parts || 0), 0),
      totals: sale.totals as any,
      items: items,
      clientPickupDate: (sale as any).clientPickupDate || null,
    } as unknown as WorkOrderFull;
  }

  async function handleCheckout() {
    if (!validate('checking out this sale')) return;
    try {
      const amountDue = (sale.totals?.remaining || 0);
      const result = await (window as any).api.openCheckout({ amountDue });
      if (!result) return; // cancelled
      const additionalPaid = Number(result.amountPaid || 0);
      let newAmountPaid = (sale.amountPaid || 0) + additionalPaid;
      if (!Number.isFinite(newAmountPaid) || newAmountPaid < 0) newAmountPaid = sale.amountPaid || 0;

      const prevPayments = Array.isArray((sale as any).payments) ? (sale as any).payments : [];
      const payments = (additionalPaid > 0)
        ? [...prevPayments, { amount: additionalPaid, paymentType: String(result.paymentType || ''), at: new Date().toISOString() }]
        : prevPayments;
      let status = sale.status;
      let checkoutDate = sale.checkoutDate as string | null;
      if ((sale.totals?.remaining || 0) - additionalPaid <= 0 || result.markClosed) {
        status = 'closed';
        checkoutDate = new Date().toISOString();
      }
      // Ensure the sale exists in DB. If unsaved, create it first.
      let currentId = (sale as any).id as number | undefined;
      if (!currentId) {
        const base = buildSaleRecordBase();
        const created = await (window as any).api.dbAdd('sales', base);
        if (created && created.id) {
          currentId = created.id;
          setSale(created);
          try { await reflectSaleInCalendar(created); } catch (e) { console.warn('calendar sync failed', e); }
        }
      }
      // Now persist payment/status changes
      setSale(s => ({ ...s, id: currentId, amountPaid: newAmountPaid, paymentType: result.paymentType, payments, status, checkoutDate }));
      if (currentId) {
        try { await (window as any).api.dbUpdate('sales', currentId, { amountPaid: newAmountPaid, paymentType: result.paymentType, payments, status, checkoutDate }); } catch {}
      }
      try { window.opener?.postMessage({ type: 'sales:changed', customerId: (sale as any).customerId }, '*'); } catch {}
      if (result.printReceipt) {
        // Reuse customer receipt for now, mapping fields
        try {
          const payload = {
            id: currentId || (sale as any).id,
            customerId: sale.customerId,
            customerName: sale.customerName,
            customerPhone: sale.customerPhone,
            productCategory: 'Retail',
            productDescription: sale.itemDescription,
            items: [
              { description: sale.itemDescription, parts: total, labor: 0, qty: sale.quantity || 1 },
            ],
            partCosts: total,
            laborCost: 0,
            discount: sale.discount || 0,
            taxRate: sale.taxRate || 0,
            totals: sale.totals,
            amountPaid: newAmountPaid,
          };
          if ((window as any).api?.openCustomerReceipt) {
            await (window as any).api.openCustomerReceipt(payload);
          }
        } catch (e) { console.error('openCustomerReceipt failed', e); }
      }
      if (result.closeParent) window.close();
    } catch (e) {
      console.error('Checkout failed', e);
      alert('Checkout failed. See console.');
    }
  }

  function onCancel() {
    if (!(sale as any).id && !hasMeaningfulInput) {
      window.close();
      return;
    }
    if (!ensureRequired('close', 'closing this sale window')) return;
    window.close();
  }

  // Listen for product selection from Products picker via window message or IPC
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e?.data;
      if (!data || data.type !== 'sale-product-selected') return;
      const picked = data.product || {};
      const row: SaleItemRow = {
        id: crypto.randomUUID(),
        description: picked.itemDescription || picked.title || picked.name || 'Item',
        qty: Number(picked.quantity ?? 1) || 1,
        price: Number(picked.price ?? 0) || 0,
        internalCost: typeof picked.internalCost === 'number' ? picked.internalCost : undefined,
        condition: picked.condition || 'New',
        productUrl: picked.productUrl || picked.url || picked.link || '',
      };
      setSale(s => ({ ...s, items: ([...(s.items || []), row]) }));
    }
    window.addEventListener('message', onMessage);
    // IPC pathway, if available
    try {
      const { ipcRenderer } = (window as any).require ? (window as any).require('electron') : { ipcRenderer: null };
      if (ipcRenderer) {
        ipcRenderer.on('sale-product-selected', (_event: any, product: any) => {
          const picked = product || {};
          const row: SaleItemRow = {
            id: crypto.randomUUID(),
            description: picked.itemDescription || picked.title || picked.name || 'Item',
            qty: Number(picked.quantity ?? 1) || 1,
            price: Number(picked.price ?? 0) || 0,
            internalCost: typeof picked.internalCost === 'number' ? picked.internalCost : undefined,
            condition: picked.condition || 'New',
            productUrl: picked.productUrl || picked.url || picked.link || '',
          };
          setSale(s => ({ ...s, items: ([...(s.items || []), row]) }));
        });
      }
    } catch {}
    return () => {
      window.removeEventListener('message', onMessage);
      try {
        const { ipcRenderer } = (window as any).require ? (window as any).require('electron') : { ipcRenderer: null };
        ipcRenderer?.removeAllListeners?.('sale-product-selected');
      } catch {}
    };
  }, []);

  return (
    <div className="h-screen overflow-hidden p-3 bg-zinc-900 text-gray-100">
      {warningBanner && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(640px,calc(100%-48px))] transition-opacity duration-300 pointer-events-none ${warningBannerVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="bg-amber-400 text-zinc-900 px-4 py-3 rounded shadow-lg border border-amber-300">
            <div className="text-sm font-semibold">{warningBanner.message}</div>
            {warningBanner.details ? <div className="text-xs mt-1 leading-snug opacity-80">{warningBanner.details}</div> : null}
          </div>
        </div>
      )}
      <div className="grid h-full" style={{ gridTemplateColumns: '220px 1fr 320px', columnGap: 12, rowGap: 8 }}>
    <WorkOrderSidebar
      workOrder={toWorkOrderFull()}
      onChange={patch => {
        const { items: _ignore, ...rest } = (patch as any) || {};
        // If patch contains assignedTo from WorkOrderSidebar selection, it will be technician id string
        setSale(s => ({ ...s, ...rest }));
      }}
      hideStatus
      saleDates
      hideOrderDeliveryDates
      validationFlags={sidebarValidationFlags}
      renderActions={() => (
        <>
          <button
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 mb-2"
            onClick={async () => {
              const first = (sale.items && sale.items[0]) as SaleItemRow | undefined;
              const payload = {
                id: (sale as any).id,
                customerName: sale.customerName,
                customerPhone: sale.customerPhone,
                itemDescription: first?.description || sale.itemDescription,
                condition: first?.condition || sale.condition,
                quantity: first?.qty || sale.quantity,
                price: first?.price ?? sale.price,
                notes: sale.notes,
                discount: sale.discount,
                taxRate: sale.taxRate,
                totals: sale.totals,
                amountPaid: sale.amountPaid,
              };
              await (window as any).api.openProductForm(payload);
            }}
          >
            Print Product Form
          </button>
          <button
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-200"
            onClick={async () => {
              const rows = (sale.items || []) as SaleItemRow[];
              const receiptItems = (rows.length ? rows : [{ description: sale.itemDescription, qty: sale.quantity || 1, price: sale.price || 0 } as any]).map(r => ({
                description: r.description,
                parts: (Number(r.qty) || 0) * (Number(r.price) || 0),
                labor: 0,
                qty: r.qty || 1,
              }));
              const payload = {
                id: (sale as any).id,
                customerId: sale.customerId,
                customerName: sale.customerName,
                customerPhone: sale.customerPhone,
                productCategory: 'Retail',
                productDescription: rows[0]?.description || sale.itemDescription,
                items: receiptItems,
                partCosts: receiptItems.reduce((s, r) => s + (r.parts || 0), 0),
                laborCost: 0,
                discount: sale.discount || 0,
                taxRate: sale.taxRate || 0,
                totals: sale.totals,
                amountPaid: sale.amountPaid || 0,
              };
              await (window as any).api.openCustomerReceipt(payload);
            }}
          >
            Print Customer Receipt
          </button>
        </>
      )}
    />
  <div className="flex flex-col gap-2 col-span-1 pb-16 min-h-0 overflow-auto">
          <h1 className="text-xl font-semibold mb-2">New Sale</h1>
          <div className="grid grid-cols-1 gap-4 bg-zinc-900 border border-zinc-700 rounded p-3">
            <SaleItemsTable
              items={(sale.items || []) as SaleItemRow[]}
              onChange={items => setSale(s => ({ ...s, items }))}
              showRequiredIndicator={itemsSectionNeedsAttention}
            />


            {/* Ordered and ETA date inputs side-by-side */}
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Ordered date</label>
                <input
                  type="date"
                  className={`w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 ${sale.inStock ? 'opacity-50 pointer-events-none' : ''}`}
                  value={sale.orderedDate || ''}
                  disabled={!!sale.inStock}
                  onChange={e => setSale(s => ({ ...s, orderedDate: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Estimated delivery</label>
                <input
                  type="date"
                  className={`w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 ${sale.inStock ? 'opacity-50 pointer-events-none' : ''}`}
                  value={sale.estimatedDeliveryDate || ''}
                  disabled={!!sale.inStock}
                  onChange={e => setSale(s => ({ ...s, estimatedDeliveryDate: e.target.value || null }))}
                />
              </div>
            </div>

            {/* Parts URLs */}
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Part ordered URL</label>
                <input
                  className={`w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 ${sale.inStock ? 'opacity-50 pointer-events-none' : ''}`}
                  placeholder="https://..."
                  value={(sale as any).partsOrderUrl || ''}
                  disabled={!!sale.inStock}
                  onChange={e => setSale(s => ({ ...s, partsOrderUrl: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Tracking URL</label>
                <input
                  className={`w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 ${sale.inStock ? 'opacity-50 pointer-events-none' : ''}`}
                  placeholder="https://..."
                  value={(sale as any).partsTrackingUrl || ''}
                  disabled={!!sale.inStock}
                  onChange={e => setSale(s => ({ ...s, partsTrackingUrl: e.target.value }))}
                />
              </div>
            </div>
          <div className="col-span-2">
            <label className="block text-sm text-zinc-400 mb-1">Notes</label>
            <textarea
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 min-h-[80px]"
              value={sale.notes || ''}
              onChange={e => setSale(s => ({ ...s, notes: e.target.value }))}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-end">
          <div className="flex items-center gap-2">
            {errors.length > 0 && (
              <div className="text-sm text-red-400 mr-2">{errors.join(' · ')}</div>
            )}
            {savedAt && errors.length === 0 && (
              <div className="text-xs text-neon-green mr-2">Saved {savedAt}</div>
            )}
          </div>
        </div>
        </div>
        <div className="flex flex-col gap-3 min-h-0 overflow-auto">
          <IntakePanel workOrder={toWorkOrderFull()} customerSummary={{ name: sale.customerName, phone: sale.customerPhone }} onChange={patch => {
            const { items: _ignore, ...rest } = (patch as any) || {};
            setSale(s => ({ ...s, ...rest }));
          }} />
          <PaymentPanel salesMode workOrder={toWorkOrderFull()} onChange={patch => {
            const { items: _ignore, ...rest } = (patch as any) || {};
            setSale(s => ({ ...s, ...rest }));
          }} onCheckout={handleCheckout} />
        </div>
      </div>
      <div className="fixed bottom-4 left-4 right-3 flex items-center justify-between gap-2">
        <div className="text-xs text-neon-green min-h-[1.2rem]">{savedAt ? `Saved at ${savedAt}` : ''}</div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 bg-zinc-800 rounded" onClick={onCancel}>Cancel</button>
          <button
          className={`px-3 py-1.5 rounded font-semibold shadow focus:outline-none focus:ring-2 focus:ring-neon-green/70 active:scale-[0.98] transition ${canSave ? 'bg-neon-green text-zinc-900 hover:brightness-110' : 'bg-zinc-800 text-zinc-300 hover:border hover:border-amber-300'}`}
          onClick={handleSave}
        >Save</button>
        </div>
      </div>
    </div>
  );
};

export default SaleWindow;
