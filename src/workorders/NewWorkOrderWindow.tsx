
// New type for items in the work order table, per user spec
export type WorkOrderItemRow = {
  id: string;
  device: string;
  repair: string;
  parts: number;
  labor: number;
  status?: string;
  note?: string;
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAutosave } from '../lib/useAutosave';
import WorkOrderSidebar from './WorkOrderSidebar';
import WorkOrderForm from './WorkOrderForm';
import ItemsTable from './ItemsTable';
import IntakePanel from './IntakePanel';
import PaymentPanel from './PaymentPanel';
import NotesPanel from './NotesPanel';
import { computeTotals } from '../lib/calc';
import { WorkOrderFull, WorkOrderItem as BaseWorkOrderItem } from '../lib/types';

type RequiredKey = 'assignedTo' | 'productDescription' | 'problemInfo' | 'password' | 'model' | 'serial';

type ValidationActionKey = 'save' | 'checkout' | 'close';

const REQUIRED_LABELS: Record<RequiredKey, string> = {
  assignedTo: 'Assigned technician',
  productDescription: 'Device description',
  problemInfo: 'Problem details',
  password: 'Device password',
  model: 'Device model',
  serial: 'Device serial',
};

function parsePayload() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('newWorkOrder');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch (e) { return null; }
}

const NewWorkOrderWindow: React.FC = () => {
  const payload = parsePayload();
  const isEditingExisting = !!payload?.workOrderId;
  const isChildWindow = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.has('newWorkOrder');
    } catch {
      return false;
    }
  }, []);
  const [loaded, setLoaded] = useState(!isEditingExisting);
  const [customerSummary, setCustomerSummary] = useState<{ name: string; phone: string }>({ name: payload?.customerName || '', phone: payload?.customerPhone || '' });
  const [initialCustomerId, setInitialCustomerId] = useState<number>(payload?.customerId || 0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const now = new Date().toISOString();
  type WOState = Omit<WorkOrderFull, 'items'> & { items: WorkOrderItemRow[]; internalNotesLog?: { id: number; text: string; createdAt?: string }[] };
  const [wo, setWo] = useState<WOState>({
    id: 0,
    customerId: initialCustomerId,
  status: 'open',
  assignedTo: null,
    checkInAt: now,
    repairCompletionDate: null,
    checkoutDate: null,
    productCategory: '',
    productDescription: '',
    password: '',
    model: '',
    serial: '',
    intakeSource: '',
  partsOrdered: false,
  partsEstimatedDelivery: null,
  partsDates: '',
  partsOrderUrl: '',
  partsOrderDate: null,
  partsEstDelivery: null,
    discount: 0,
    amountPaid: 0,
    taxRate: 8,
    laborCost: 0,
    partCosts: 0,
    totals: { subTotal: 0, tax: 0, total: 0, remaining: 0 },
  items: [] as WorkOrderItemRow[],
  internalNotes: '',
  internalNotesLog: [],
  });
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

  const missingRequired = useMemo<RequiredKey[]>(() => {
    const missing: RequiredKey[] = [];
    const assigned = (wo.assignedTo ?? '').toString().trim();
    if (!assigned) missing.push('assignedTo');
    if (!(wo.productDescription || '').toString().trim()) missing.push('productDescription');
    if (!(wo.problemInfo || '').toString().trim()) missing.push('problemInfo');
    if (!(wo.password || '').toString().trim()) missing.push('password');
    if (!(wo.model || '').toString().trim()) missing.push('model');
    if (!(wo.serial || '').toString().trim()) missing.push('serial');
    return missing;
  }, [wo.assignedTo, wo.productDescription, wo.problemInfo, wo.password, wo.model, wo.serial]);

  const hasMeaningfulInput = useMemo(() => {
    return Boolean(
      (wo.productCategory && wo.productCategory.trim()) ||
      (wo.productDescription && wo.productDescription.trim()) ||
      (wo.problemInfo && wo.problemInfo.trim()) ||
      (wo.password && wo.password.trim()) ||
      (wo.model && wo.model.trim()) ||
      (wo.serial && wo.serial.trim()) ||
      (wo.intakeSource && wo.intakeSource.trim()) ||
      (wo.items && wo.items.length > 0) ||
      (Number(wo.discount) || 0) !== 0 ||
      (Number(wo.amountPaid) || 0) !== 0 ||
      (Number(wo.laborCost) || 0) !== 0 ||
      (Number(wo.partCosts) || 0) !== 0 ||
      ((wo.assignedTo ?? '').toString().trim().length > 0)
    );
  }, [wo]);

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

  const formValidationFlags = useMemo<
    Partial<Record<'productDescription' | 'problemInfo' | 'password' | 'model' | 'serial', boolean>> | undefined
  >(() => {
    if (!validationActive) return undefined;
    const set = new Set(missingRequired);
    return {
      productDescription: set.has('productDescription'),
      problemInfo: set.has('problemInfo'),
      password: set.has('password'),
      model: set.has('model'),
      serial: set.has('serial'),
    };
  }, [validationActive, missingRequired]);

  const sidebarValidationFlags = useMemo<Partial<Record<'assignedTo', boolean>> | undefined>(() => {
    if (!validationActive) return undefined;
    const set = new Set(missingRequired);
    return { assignedTo: set.has('assignedTo') };
  }, [validationActive, missingRequired]);


  // Load existing work order if editing
  useEffect(() => {
    if (!isEditingExisting) return;
    (async () => {
      try {
        const list = await (window as any).api.findWorkOrders({ id: payload.workOrderId });
        const existing = (list && list[0]) || null;
        if (!existing) { setLoaded(true); return; }
        // Map existing.items (WorkOrderItem[]) to WorkOrderItemRow[] if present
        const mappedItems: WorkOrderItemRow[] = (existing.items || []).map((it: any) => ({
          id: it.id?.toString() || Math.random().toString(36).slice(2),
          device: (it.device || existing.productDescription || existing.productCategory || ''),
          repair: (it.repair || it.description || it.title || it.name || it.altDescription || ''),
          parts: typeof it.parts === 'number' ? it.parts : (typeof it.partCost === 'number' ? it.partCost : 0),
          labor: typeof it.labor === 'number' ? it.labor : (typeof it.unitPrice === 'number' ? it.unitPrice : (typeof it.laborCost === 'number' ? it.laborCost : 0)),
          status: it.status || 'pending',
          note: it.note || it.model || it.modelNumber || '',
        }));
        setWo(w => ({
          ...w,
          ...existing,
          partsOrdered: existing.partsOrdered ?? w.partsOrdered,
          partsEstimatedDelivery: existing.partsEstimatedDelivery ?? w.partsEstimatedDelivery,
          partsDates: (existing as any).partsDates ?? w.partsDates,
          partsOrderUrl: (existing as any).partsOrderUrl ?? w.partsOrderUrl,
          partsOrderDate: (existing as any).partsOrderDate ?? w.partsOrderDate,
          partsEstDelivery: (existing as any).partsEstDelivery ?? w.partsEstDelivery,
          items: mappedItems.length ? mappedItems : w.items,
          totals: existing.totals || w.totals,
          internalNotesLog: Array.isArray(existing.internalNotesLog) ? existing.internalNotesLog : (existing.internalNotes ? existing.internalNotes.split('\n').map((line: string, idx: number) => ({ id: idx + 1, text: line })) : []),
        }));
  setInitialCustomerId(existing.customerId || existing.customerID || existing.customer_id || 0);
        setCustomerSummary({ name: existing.customerName || customerSummary.name, phone: existing.customerPhone || customerSummary.phone });
      } catch (e) {
        console.error('Failed loading existing work order', e);
      } finally {
        setLoaded(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute partCosts, laborCost, and totals whenever items or payment fields change
  useEffect(() => {
    const partCosts = wo.items.reduce((sum, r) => sum + (r.parts || 0), 0);
    const laborCost = wo.items.reduce((sum, r) => sum + (r.labor || 0), 0);
    const totals = computeTotals({
      laborCost,
      partCosts,
      discount: wo.discount || 0,
      taxRate: wo.taxRate || 0,
      amountPaid: wo.amountPaid || 0,
    });
    setWo(w => ({ ...w, partCosts, laborCost, totals }));
  }, [wo.items, wo.discount, wo.taxRate, wo.amountPaid, (wo as any).discountType, (wo as any).discountPctValue, (wo as any).discountCustomAmount]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSave(); }
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wo]);

  // Attempt auto-save when the window is being closed if fields look valid
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const requiredOk = !!(wo.productCategory && wo.productDescription && wo.customerId && wo.assignedTo);
      if (!requiredOk) return; // nothing to do
      // If it's a new order (id 0) or editing, persist synchronously before allowing close
      // Prevent default close, then perform save and close programmatically
      e.preventDefault();
      e.returnValue = '';
      (async () => {
        try {
          const api = (window as any).api || {};
          if (isEditingExisting || (wo.id && wo.id !== 0)) {
            if (typeof api.update === 'function') await api.update('workOrders', { ...wo });
            else if (typeof api.dbUpdate === 'function') await api.dbUpdate('workOrders', wo.id, { ...wo });
          } else {
            if (typeof api.addWorkOrder === 'function') await api.addWorkOrder({ ...wo });
            else if (typeof api.dbAdd === 'function') await api.dbAdd('workOrders', { ...wo });
          }
          try { window.opener?.postMessage({ type: 'workorders:changed', id: wo.id }, '*'); } catch {}
        } catch (err) {
          console.warn('Auto-save on close failed', err);
        } finally {
          // Remove the listener to avoid loops then close
          window.removeEventListener('beforeunload', handler as any);
          window.close();
        }
      })();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [wo, isEditingExisting]);

  // Autosave work order after 2 seconds of inactivity
  useAutosave(wo, async (val) => {
    try {
      const api = (window as any).api || {};
      // Decide add vs update
      if (isEditingExisting || (val.id && val.id !== 0)) {
        if (typeof api.update === 'function') await api.update('workOrders', { ...val });
        else if (typeof api.dbUpdate === 'function') await api.dbUpdate('workOrders', val.id, { ...val });
      } else {
        // Only create a new record when some key fields have content
        const hasMeaningful = !!(val.productCategory || val.productDescription || val.customerId || (val.items && val.items.length));
        if (!hasMeaningful) return;
        const added = typeof api.addWorkOrder === 'function' ? await api.addWorkOrder({ ...val }) : await api.dbAdd('workOrders', { ...val });
        if (added?.id) setWo(w => ({ ...w, id: added.id }));
      }
      setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }));
      try { window.opener?.postMessage({ type: 'workorders:changed', id: (val as any).id }, '*'); } catch {}
    } catch (e) {
      // silent
    }
  }, {
    debounceMs: 2000,
    enabled: true,
    // Ensure autosave does not fire for brand-new empty forms
    shouldSave: (v) => !!(isEditingExisting || (v.id && v.id !== 0) || v.productCategory || v.productDescription || v.customerId || (v.items && v.items.length)),
  });

  function ensureRequired(action: ValidationActionKey, actionDescription: string): boolean {
    if (missingRequired.length === 0) {
      setValidationActive(false);
      setArmedValidationActions(prev => ({ ...prev, [action]: false }));
      return true;
    }

    setValidationActive(true);
    const detailText = missingRequired.map(key => REQUIRED_LABELS[key]).join(', ');

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

  function onSave() {
    if (!ensureRequired('save', 'saving the work order')) return;
    if (!wo.productCategory || !wo.productCategory.trim()) {
      triggerWarningBanner('Device category is missing', 'Select a device category, then click Save again.');
      return;
    }
    if (!wo.customerId) {
      triggerWarningBanner('Customer is missing', 'Select a customer, then click Save again.');
      return;
    }
    (async () => {
      try {
        const api = (window as any).api || {};
        if (isEditingExisting || (wo.id && wo.id !== 0)) {
          let updated = null;
          if (typeof api.update === 'function') updated = await api.update('workOrders', { ...wo });
          else if (typeof api.dbUpdate === 'function') updated = await api.dbUpdate('workOrders', wo.id, { ...wo });
          console.log('Work order updated', updated);
        } else {
          let added = null;
          if (typeof api.addWorkOrder === 'function') added = await api.addWorkOrder({ ...wo });
          else if (typeof api.dbAdd === 'function') added = await api.dbAdd('workOrders', { ...wo });
          console.log('Work order added', added);
        }
        try { window.opener?.postMessage({ type: 'workorders:changed', id: wo.id }, '*'); } catch {}
        setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }));

        // After saving, return the user to the main/customer screen.
        // Use a safe close so we never accidentally close the main window.
        try {
          const api = (window as any).api;
          if (api?.closeSelfWindow) {
            await api.closeSelfWindow({ focusMain: true });
          } else {
            window.close();
          }
        } catch {
          try { window.close(); } catch {}
        }
      } catch (err) {
        console.error('DB save failed', err);
        triggerWarningBanner('Failed to save work order', 'See console for details.');
        return;
      }
    })();
  }
  function onCancel() {
    if (!isEditingExisting && !hasMeaningfulInput) {
      try {
        const api = (window as any).api;
        if (api?.closeSelfWindow) api.closeSelfWindow({ focusMain: true });
        else window.close();
      } catch { try { window.close(); } catch {} }
      return;
    }
    if (!ensureRequired('close', 'closing this work order window')) return;
    try {
      const api = (window as any).api;
      if (api?.closeSelfWindow) api.closeSelfWindow({ focusMain: true });
      else window.close();
    } catch { try { window.close(); } catch {} }
  }

  // Removed local onNewItemClick; ItemsTable owns New Item adding via picker

  // Helper to map our local wo (with WorkOrderItemRow[]) to a WorkOrderFull for child components
  function toWorkOrderFull(): WorkOrderFull {
    // Map WorkOrderItemRow[] to WorkOrderItem[] (minimal, for compatibility)
    const items = wo.items.map(row => ({
      id: row.id,
      status: row.status as any || 'pending',
      description: row.repair,
      qty: 1,
      // Keep unitPrice for legacy consumers, but also carry granular fields for printing
      unitPrice: (row.parts || 0) + (row.labor || 0),
      parts: row.parts,
      labor: row.labor,
    })) as any;
    return { ...wo, items } as unknown as WorkOrderFull;
  }

  async function handleCheckout() {
    if (!ensureRequired('checkout', 'checking out')) return;
    if (!wo.productCategory || !wo.productCategory.trim()) {
      triggerWarningBanner('Device category is missing', 'Select a device category, then click Checkout again.');
      return;
    }
    if (!wo.customerId) {
      triggerWarningBanner('Customer is missing', 'Select a customer, then click Checkout again.');
      return;
    }
    try {
      const amountDue = wo.totals?.remaining || 0;
      const result = await (window as any).api.openCheckout({ amountDue });
      if (!result) return; // user cancelled
      const additionalPaid = Number(result.amountPaid || 0);
      // Add to existing amountPaid to allow partial payments accumulation
      let newAmountPaid = (wo.amountPaid || 0) + additionalPaid;
      if (!Number.isFinite(newAmountPaid) || newAmountPaid < 0) newAmountPaid = wo.amountPaid || 0;

      // Prepare updated items if marking closed
      let updatedItems = wo.items;
      let status = wo.status;
      let checkoutDate = wo.checkoutDate;
      if (result.markClosed || (wo.totals?.remaining || 0) - additionalPaid <= 0) {
        status = 'closed';
        checkoutDate = new Date().toISOString();
        updatedItems = wo.items.map(it => ({ ...it, status: 'done' }));
      }

      const prevPayments = Array.isArray((wo as any).payments) ? (wo as any).payments : [];
      const payments = (additionalPaid > 0)
        ? [...prevPayments, { amount: additionalPaid, paymentType: String(result.paymentType || ''), at: new Date().toISOString() }]
        : prevPayments;

      setWo(w => ({
        ...w,
        amountPaid: newAmountPaid,
        paymentType: result.paymentType,
        payments,
        status,
        checkoutDate,
        items: updatedItems,
      }));

      // Persist if already saved (id > 0)
      if (wo.id && wo.id > 0) {
        try {
          await (window as any).api.update('workOrders', { ...wo, amountPaid: newAmountPaid, paymentType: result.paymentType, payments, status, checkoutDate, items: updatedItems });
        } catch (e) {
          console.error('Failed persisting checkout update', e);
        }
      }

      if (result.printReceipt) {
        try {
          const payload = {
            id: (wo as any).id,
            customerId: (wo as any).customerId,
            customerName: (wo as any).customerName,
            customerPhone: (wo as any).customerPhone,
            productCategory: wo.productCategory,
            productDescription: wo.productDescription,
            model: (wo as any).model,
            serial: (wo as any).serial,
            problemInfo: wo.problemInfo,
            items: (wo as any).items || [],
            partCosts: (wo as any).partCosts,
            laborCost: (wo as any).laborCost,
            discount: (wo as any).discount,
            taxRate: (wo as any).taxRate,
            totals: (wo as any).totals,
            amountPaid: (wo as any).amountPaid,
          };
          if ((window as any).api?.openCustomerReceipt) {
            await (window as any).api.openCustomerReceipt({
              data: payload,
              autoPrint: true,
              silent: true,
              autoCloseMs: 900,
              show: false,
            });
          } else {
            const u = new URL(window.location.href);
            u.search = `?customerReceipt=${encodeURIComponent(JSON.stringify(payload))}`;
            window.open(u.toString(), '_blank');
          }
        } catch (e) { console.error('openCustomerReceipt failed', e); }
      }
      if (result.closeParent) {
        const delayMs = result.printReceipt ? 1300 : 0;
        setTimeout(() => {
          try {
            const api = (window as any).api;
            if (api?.closeSelfWindow) api.closeSelfWindow({ focusMain: true });
            else window.close();
          } catch { try { window.close(); } catch {} }
        }, delayMs);
      }
    } catch (e) {
      console.error('Checkout failed', e);
      alert('Checkout failed. See console.');
    }
  }

  // (removed legacy printCustomerReceipt stub in favor of shared HTML builder)

  if (!loaded) {
    return <div className="p-4 text-zinc-200">Loading work order...</div>;
  }

  const saveDisabled = false;

  return (
    <div className="h-screen overflow-hidden p-3 bg-zinc-900 text-zinc-200">
      {warningBanner && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(640px,calc(100%-48px))] transition-opacity duration-300 pointer-events-none ${warningBannerVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="bg-amber-400 text-zinc-900 px-4 py-3 rounded shadow-lg border border-amber-300">
            <div className="text-sm font-semibold">{warningBanner.message}</div>
            {warningBanner.details ? <div className="text-xs mt-1 leading-snug opacity-80">{warningBanner.details}</div> : null}
          </div>
        </div>
      )}
      <div className="grid h-full" style={{ gridTemplateColumns: '220px 1fr 320px', columnGap: 12, rowGap: 8 }}>
        <WorkOrderSidebar workOrder={toWorkOrderFull()} onChange={patch => setWo(w => ({ ...w, ...patch, items: w.items }))} validationFlags={sidebarValidationFlags} />
        <div className="flex flex-col gap-2 col-span-1 pb-16 min-h-0 overflow-auto">
          <WorkOrderForm workOrder={toWorkOrderFull()} onChange={patch => setWo(w => ({ ...w, ...patch, items: w.items }))} validationFlags={formValidationFlags} />
          <ItemsTable items={wo.items} onChange={items => { setWo(w => ({ ...w, items })); }} />
          {/* Parts dates + order URL (under line items) */}
          <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-semibold text-zinc-200">Parts tracking</h4>
              <div className="text-[11px] text-zinc-500">Not shown on printouts</div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-xs text-zinc-400">Order date</label>
                <input
                  type="date"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                  value={(wo as any).partsOrderDate ? String((wo as any).partsOrderDate).substring(0, 10) : ''}
                  onChange={e => setWo(w => ({ ...w, partsOrderDate: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Est. delivery</label>
                <input
                  type="date"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                  value={(wo as any).partsEstDelivery ? String((wo as any).partsEstDelivery).substring(0, 10) : ''}
                  onChange={e => setWo(w => ({ ...w, partsEstDelivery: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Dates/notes</label>
                <input
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                  placeholder="e.g. Ordered 10/04, ETA 10/10"
                  value={(wo as any).partsDates || ''}
                  onChange={e => setWo(w => ({ ...w, partsDates: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Order URL</label>
                <input
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                  placeholder="https://..."
                  value={(wo as any).partsOrderUrl || ''}
                  onChange={e => setWo(w => ({ ...w, partsOrderUrl: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <NotesPanel
            notes={wo.internalNotes || ''}
            log={wo.internalNotesLog || []}
            onChange={n => setWo(w => ({ ...w, internalNotes: n }))}
            onAdd={(text) => {
              const stamp = new Date().toISOString().slice(0,16).replace('T',' ');
              setWo(w => ({
                ...w,
                internalNotes: (w.internalNotes ? w.internalNotes + '\n' : '') + `${stamp} — ${text}`,
                internalNotesLog: [...(w.internalNotesLog || []), { id: (w.internalNotesLog?.length || 0) + 1, text: `${stamp} — ${text}`, createdAt: stamp }]
              }));
            }}
          />
        </div>
        <div className="flex flex-col gap-3 min-h-0 overflow-auto">
          <IntakePanel workOrder={toWorkOrderFull()} customerSummary={customerSummary} onChange={patch => setWo(w => ({ ...w, ...patch, items: w.items }))} />
          <PaymentPanel workOrder={toWorkOrderFull()} onChange={patch => setWo(w => ({ ...w, ...patch, items: w.items }))} onCheckout={handleCheckout} />
        </div>
      </div>

      <div className="fixed bottom-4 left-4 right-3 flex items-center justify-between">
        <div className="text-xs text-neon-green min-h-[1.2rem]">{savedAt ? `Saved at ${savedAt}` : ''}</div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-zinc-800 rounded" onClick={onCancel}>Cancel</button>
          <button
            className={`px-3 py-1.5 rounded font-semibold shadow focus:outline-none focus:ring-2 focus:ring-neon-green/70 active:scale-[0.98] transition ${saveDisabled ? 'bg-zinc-800 text-zinc-500' : 'bg-neon-green text-zinc-900 hover:brightness-110'}`}
            onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default NewWorkOrderWindow;

