
// New type for items in the work order table, per user spec
export type WorkOrderItemRow = {
  id: string;
  device: string;
  repairCategory?: string;
  repair: string;
  parts: number;
  labor: number;
  status?: string;
  note?: string;
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAutosave } from '../lib/useAutosave';
import { consumeWindowPayload } from '../lib/windowPayload';
import WorkOrderSidebar from './WorkOrderSidebar';
import WorkOrderForm from './WorkOrderForm';
import ItemsTable from './ItemsTable';
import CustomBuildItemsTable from './CustomBuildItemsTable';
import IntakePanel from './IntakePanel';
import PaymentPanel from './PaymentPanel';
import NotesPanel from './NotesPanel';
import DroneChecklistPanel, { defaultDroneChecklist } from './DroneChecklistPanel';
import DropoffAccessoriesPanel from './DropoffAccessoriesPanel';
import { computeTotals, round2 } from '../lib/calc';
import { WorkOrderFull, WorkOrderItem as BaseWorkOrderItem, DroneChecklist, DropoffAccessory } from '../lib/types';

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
    // Check the in-app modal payload store first (set when opened as internal modal).
    const stored = consumeWindowPayload('newWorkOrder');
    if (stored !== null) return stored;
  } catch {}
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('newWorkOrder');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch (e) { return null; }
}

function onlyDate(iso?: string | null) {
  return (iso || '').toString().slice(0, 10);
}

function parseCheckoutPaymentDate(value: any): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function checkoutPaymentAppliedAmount(payment: any): number {
  const applied = Number(payment?.applied);
  if (Number.isFinite(applied) && applied > 0) return round2(applied);
  const amount = Number(payment?.amount ?? payment?.tender ?? payment?.paid ?? 0);
  const change = Number(payment?.change ?? payment?.changeDue ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (Number.isFinite(change) && change > 0) return round2(Math.max(0, amount - change));
  return round2(amount);
}

function buildNormalizedCheckoutPayments(record: any) {
  const existing = Array.isArray(record?.payments)
    ? [...record.payments]
    : Array.isArray(record?.paymentHistory)
      ? [...record.paymentHistory]
      : Array.isArray(record?.paymentLogs)
        ? [...record.paymentLogs]
        : [];
  const paid = round2(Number(record?.amountPaid || 0) || 0);
  const recorded = round2(existing.reduce((sum: number, payment: any) => sum + checkoutPaymentAppliedAmount(payment), 0));
  const missing = round2(paid - recorded);
  if (missing <= 0.009) return existing;

  const anchor = parseCheckoutPaymentDate(record?.checkoutDate)
    || parseCheckoutPaymentDate(record?.clientPickupDate)
    || parseCheckoutPaymentDate(record?.repairCompletionDate)
    || parseCheckoutPaymentDate(record?.checkInAt)
    || parseCheckoutPaymentDate(record?.createdAt);
  if (!anchor) return existing;

  return [{
    amount: missing,
    applied: missing,
    paymentType: String(record?.paymentType || 'Legacy'),
    at: anchor,
    inferred: true,
  }, ...existing];
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
  type WOState = Omit<WorkOrderFull, 'items'> & {
    items: WorkOrderItemRow[];
    internalNotesLog?: { id: number; text: string; createdAt?: string }[];
    workOrderType?: 'standard' | 'customBuild' | 'drone';
  };
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
    workOrderType: (payload as any)?.workOrderType === 'customBuild' || (payload as any)?.isCustomBuild ? 'customBuild'
      : (payload as any)?.workOrderType === 'drone' ? 'drone'
      : 'standard',
  partsOrdered: false,
  partsEstimatedDelivery: null,
  partsDates: '',
  partsOrderUrl: '',
  partsTrackingUrl: '',
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
  droneChecklist: defaultDroneChecklist(),
  dropoffAccessories: [] as DropoffAccessory[],
  });
  const [validationActive, setValidationActive] = useState<boolean>(false);
  const [warningBanner, setWarningBanner] = useState<{ message: string; details?: string } | null>(null);
  const [warningBannerVisible, setWarningBannerVisible] = useState<boolean>(false);
  const warningHideTimer = useRef<number | undefined>(undefined);
  const warningRemoveTimer = useRef<number | undefined>(undefined);
  const lastPartsCalendarSyncKey = useRef<string>('');
  const handleCheckoutRef = useRef<() => Promise<void>>(async () => {});
  const [armedValidationActions, setArmedValidationActions] = useState<Record<ValidationActionKey, boolean>>({
    save: false,
    checkout: false,
    close: false,
  });

  const isCustomBuild = wo.workOrderType === 'customBuild';
  const isDrone = wo.workOrderType === 'drone';

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
    if (!isCustomBuild && !isDrone) {
      if (!(wo.password || '').toString().trim()) missing.push('password');
      if (!(wo.model || '').toString().trim()) missing.push('model');
      if (!(wo.serial || '').toString().trim()) missing.push('serial');
    }
    return missing;
  }, [wo.assignedTo, wo.productDescription, wo.problemInfo, wo.password, wo.model, wo.serial, isCustomBuild, isDrone]);

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
          repairCategory: it.repairCategory || '',
          repair: (it.repair || it.description || it.title || it.name || it.altDescription || ''),
          parts: typeof it.parts === 'number' ? it.parts : (typeof it.partCost === 'number' ? it.partCost : 0),
          labor: typeof it.labor === 'number' ? it.labor : (typeof it.unitPrice === 'number' ? it.unitPrice : (typeof it.laborCost === 'number' ? it.laborCost : 0)),
          status: it.status || 'pending',
          note: it.note || it.model || it.modelNumber || '',
        }));
        setWo(w => ({
          ...w,
          ...existing,
          workOrderType: ((existing as any).workOrderType === 'customBuild' || (existing as any).isCustomBuild) ? 'customBuild'
            : (existing as any).workOrderType === 'drone' ? 'drone'
            : (w.workOrderType || 'standard'),
          partsOrdered: existing.partsOrdered ?? w.partsOrdered,
          partsEstimatedDelivery: existing.partsEstimatedDelivery ?? w.partsEstimatedDelivery,
          partsDates: (existing as any).partsDates ?? w.partsDates,
          partsOrderUrl: (existing as any).partsOrderUrl ?? w.partsOrderUrl,
          partsTrackingUrl: (existing as any).partsTrackingUrl ?? w.partsTrackingUrl,
          partsOrderDate: (existing as any).partsOrderDate ?? w.partsOrderDate,
          partsEstDelivery: (existing as any).partsEstDelivery ?? w.partsEstDelivery,
          items: mappedItems.length ? mappedItems : w.items,
          totals: existing.totals || w.totals,
          droneChecklist: (existing as any).droneChecklist ?? w.droneChecklist,
          dropoffAccessories: Array.isArray((existing as any).dropoffAccessories) ? (existing as any).dropoffAccessories : w.dropoffAccessories,
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
    setWo(w => {
      const existing = w.totals || { subTotal: 0, tax: 0, total: 0, remaining: 0 };
      const totalsUnchanged =
        Number(existing.subTotal || 0) === Number(totals.subTotal || 0) &&
        Number(existing.tax || 0) === Number(totals.tax || 0) &&
        Number(existing.total || 0) === Number(totals.total || 0) &&
        Number(existing.remaining || 0) === Number(totals.remaining || 0);
      if (
        Number(w.partCosts || 0) === Number(partCosts || 0) &&
        Number(w.laborCost || 0) === Number(laborCost || 0) &&
        totalsUnchanged
      ) {
        return w;
      }
      return { ...w, partCosts, laborCost, totals };
    });
  }, [wo.items, wo.discount, wo.taxRate, wo.amountPaid, (wo as any).discountType, (wo as any).discountPctValue, (wo as any).discountCustomAmount]);

  const onSaveRef = useRef<() => void>(() => {});
  const onCancelRef = useRef<() => void>(() => {});
  const woRef = useRef<any>(wo);
  const isEditingExistingRef = useRef<boolean>(isEditingExisting);
  useEffect(() => { woRef.current = wo; }, [wo]);
  useEffect(() => { isEditingExistingRef.current = isEditingExisting; }, [isEditingExisting]);

  // Bind the latest functions each render.
  onSaveRef.current = onSave;
  onCancelRef.current = onCancel;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        try { onSaveRef.current(); } catch {}
      }
      if (e.key === 'Escape') {
        try { onCancelRef.current(); } catch {}
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Attempt auto-save when the window is being closed if fields look valid
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const current = woRef.current || {};
      const requiredOk = !!(current.productCategory && current.productDescription && current.customerId && current.assignedTo);
      if (!requiredOk) return; // nothing to do
      // If it's a new order (id 0) or editing, persist synchronously before allowing close
      // Prevent default close, then perform save and close programmatically
      e.preventDefault();
      e.returnValue = '';
      (async () => {
        try {
          const api = (window as any).api || {};
          if (isEditingExistingRef.current || (current.id && current.id !== 0)) {
            if (typeof api.update === 'function') await api.update('workOrders', { ...current });
            else if (typeof api.dbUpdate === 'function') await api.dbUpdate('workOrders', current.id, { ...current });
          } else {
            if (typeof api.addWorkOrder === 'function') await api.addWorkOrder({ ...current });
            else if (typeof api.dbAdd === 'function') await api.dbAdd('workOrders', { ...current });
          }
          try { window.opener?.postMessage({ type: 'workorders:changed', id: current.id }, '*'); } catch {}
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
  }, []);

  // Autosave work order after 2 seconds of inactivity
  useAutosave(wo, async (val) => {
    try {
      const api = (window as any).api || {};
      let saved: any = null;
      // Decide add vs update
      if (isEditingExisting || (val.id && val.id !== 0)) {
        if (typeof api.update === 'function') saved = await api.update('workOrders', { ...val });
        else if (typeof api.dbUpdate === 'function') saved = await api.dbUpdate('workOrders', val.id, { ...val });
      } else {
        // Only create a new record when some key fields have content
        const hasMeaningful = !!(val.productCategory || val.productDescription || val.customerId || (val.items && val.items.length));
        if (!hasMeaningful) return;
        const added = typeof api.addWorkOrder === 'function' ? await api.addWorkOrder({ ...val }) : await api.dbAdd('workOrders', { ...val });
        saved = added;
        if (added?.id) setWo(w => ({ ...w, id: added.id }));
      }
      setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }));
      try { window.opener?.postMessage({ type: 'workorders:changed', id: (val as any).id }, '*'); } catch {}

      // Reflect parts into Calendar only when relevant fields changed
      try {
        const id = Number((saved?.id ?? val.id) || 0);
        const key = [
          id,
          onlyDate((saved?.partsOrderDate ?? (val as any).partsOrderDate) || null),
          onlyDate((saved?.partsEstDelivery ?? (val as any).partsEstDelivery) || null),
          String((saved?.partsOrderUrl ?? (val as any).partsOrderUrl) || ''),
          String((saved?.partsTrackingUrl ?? (val as any).partsTrackingUrl) || ''),
        ].join('|');
        if (id && key !== lastPartsCalendarSyncKey.current) {
          lastPartsCalendarSyncKey.current = key;
          await reflectWorkOrderInCalendar(saved || val);
        }
      } catch {
        // ignore
      }
    } catch (e) {
      // silent
    }
  }, {
    debounceMs: 1000,
    enabled: true,
    equals: Object.is,
    skipInitialSave: isEditingExisting,
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

  async function reflectWorkOrderInCalendar(saved: any) {
    const api: any = (window as any).api;
    if (!api?.dbGet || !api?.dbAdd || !api?.dbDelete) return;

    const all: any[] = await api.dbGet('calendarEvents').catch(() => []);
    const workOrderId = Number(saved?.id || 0);
    if (!workOrderId) return;

    const partName = `WO #${workOrderId} ${String(saved?.productDescription || saved?.productCategory || 'Parts').trim()}`.trim();
    const base = {
      category: 'parts',
      partName,
      title: partName,
      customerName: saved?.customerName || customerSummary.name,
      customerPhone: saved?.customerPhone || customerSummary.phone,
      technician: saved?.assignedTo || undefined,
      source: 'workorder',
      workOrderId,
      orderUrl: saved?.partsOrderUrl || undefined,
      trackingUrl: saved?.partsTrackingUrl || undefined,
    } as any;

    async function syncOne(status: 'ordered' | 'delivery', desiredDate: string | null) {
      const existing = all.filter(e => e.category === 'parts' && e.source === 'workorder' && e.workOrderId === workOrderId && e.partsStatus === status);
      if (!desiredDate) {
        for (const e of existing) {
          if (e?.id != null) await api.dbDelete('calendarEvents', e.id).catch(() => {});
        }
        return;
      }
      const sameDate = existing.find(e => e.date === desiredDate);
      for (const e of existing) {
        if (sameDate && e === sameDate) continue;
        if (e?.id != null) await api.dbDelete('calendarEvents', e.id).catch(() => {});
      }
      if (sameDate?.id != null && api.dbUpdate) {
        await api.dbUpdate('calendarEvents', sameDate.id, { ...sameDate, ...base, date: desiredDate, partsStatus: status }).catch(() => {});
      } else {
        await api.dbAdd('calendarEvents', { ...base, date: desiredDate, partsStatus: status }).catch(() => {});
      }
    }

    const orderedDate = onlyDate(saved?.partsOrderDate);
    const deliveryDate = onlyDate(saved?.partsEstDelivery);
    await syncOne('ordered', orderedDate ? orderedDate : null);
    await syncOne('delivery', deliveryDate ? deliveryDate : null);
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
        let saved: any = null;
        if (isEditingExisting || (wo.id && wo.id !== 0)) {
          if (typeof api.update === 'function') saved = await api.update('workOrders', { ...wo });
          else if (typeof api.dbUpdate === 'function') saved = await api.dbUpdate('workOrders', wo.id, { ...wo });
          console.log('Work order updated', saved);
        } else {
          if (typeof api.addWorkOrder === 'function') saved = await api.addWorkOrder({ ...wo });
          else if (typeof api.dbAdd === 'function') saved = await api.dbAdd('workOrders', { ...wo });
          console.log('Work order added', saved);
        }
        const savedId = Number(saved?.id || wo.id || 0);
        try { window.opener?.postMessage({ type: 'workorders:changed', id: savedId }, '*'); } catch {}
        setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }));

        // Reflect parts ordered/delivery dates into Calendar
        try {
          await reflectWorkOrderInCalendar(saved || wo);
        } catch (e) {
          console.warn('calendar sync failed', e);
        }

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

  const workOrderFull = useMemo<WorkOrderFull>(() => {
    const items = wo.items.map(row => ({
      id: row.id,
      status: row.status as any || 'pending',
      description: row.repair,
      qty: 1,
      unitPrice: (row.parts || 0) + (row.labor || 0),
      parts: row.parts,
      labor: row.labor,
    })) as any;
    return { ...wo, items } as unknown as WorkOrderFull;
  }, [wo]);

  const handleSidebarChange = useCallback((patch: Partial<WorkOrderFull>) => {
    setWo(w => ({ ...w, ...patch, items: w.items }));
  }, []);

  const handleFormChange = useCallback((patch: Partial<WorkOrderFull>) => {
    setWo(w => ({ ...w, ...patch, items: w.items }));
  }, []);

  const handleItemsChange = useCallback((items: WorkOrderItemRow[]) => {
    setWo(w => ({ ...w, items }));
  }, []);

  const handleIntakeChange = useCallback((patch: Partial<WorkOrderFull>) => {
    setWo(w => ({ ...w, ...patch, items: w.items }));
  }, []);

  const handlePaymentChange = useCallback((patch: Partial<WorkOrderFull>) => {
    setWo(w => ({ ...w, ...patch, items: w.items }));
  }, []);

  useEffect(() => {
    handleCheckoutRef.current = async () => {
      if (!ensureRequired('checkout', 'checking out')) return;
      if (!isCustomBuild && (!wo.productCategory || !wo.productCategory.trim())) {
        triggerWarningBanner('Device category is missing', 'Select a device category, then click Checkout again.');
        return;
      }
      if (!wo.customerId) {
        triggerWarningBanner('Customer is missing', 'Select a customer, then click Checkout again.');
        return;
      }
      try {
        const amountDue = wo.totals?.remaining || 0;

        const partCosts = Number(wo.partCosts || 0) || 0;
        const laborCost = Number(wo.laborCost || 0) || 0;
        const discount = Number(wo.discount || 0) || 0;
        const taxRate = Number(wo.taxRate || 0) || 0;
        const laborAfterDiscount = Math.max(0, laborCost - discount);
        const partsWithTax = Math.round(((partCosts + (partCosts * taxRate / 100)) + Number.EPSILON) * 100) / 100;

        const result = await (window as any).api.openCheckout({
          amountDue,
          partsDue: Math.min(partsWithTax, amountDue),
          laborDue: Math.min(laborAfterDiscount, amountDue),
          title: isCustomBuild ? 'Custom Build Checkout' : 'Work Order Checkout',
        });
        if (!result) return;
        const additionalPaid = Number(result.amountPaid || 0);
        let newAmountPaid = (wo.amountPaid || 0) + additionalPaid;
        if (!Number.isFinite(newAmountPaid) || newAmountPaid < 0) newAmountPaid = wo.amountPaid || 0;

        const updatedTotals = computeTotals({
          laborCost: Number(wo.laborCost || 0) || 0,
          partCosts: Number(wo.partCosts || 0) || 0,
          discount: Number(wo.discount || 0) || 0,
          taxRate: Number(wo.taxRate || 0) || 0,
          amountPaid: newAmountPaid,
        });

        let updatedItems = wo.items;
        let status = wo.status;
        let checkoutDate = wo.checkoutDate;
        const hadOutstandingBalance = Number(wo.totals?.remaining || 0) > 0.009;
        if (result.markClosed || (updatedTotals?.remaining || 0) <= 0) {
          status = 'closed';
          if (!checkoutDate || (additionalPaid > 0 && hadOutstandingBalance)) {
            checkoutDate = new Date().toISOString();
          }
          updatedItems = wo.items.map(it => ({ ...it, status: 'done' }));
        }

        const prevPayments = buildNormalizedCheckoutPayments(wo as any);
        const payments = (() => {
          if (!(additionalPaid > 0)) return prevPayments;
          const now = new Date().toISOString();
          const pt = String(result.paymentType || '');
          const isCash = pt.toLowerCase().includes('cash');
          const tendered = Number(result.tendered ?? additionalPaid);
          const change = Number(result.changeDue || 0);
          const entry: any = {
            amount: isCash ? (Number.isFinite(tendered) ? tendered : additionalPaid) : additionalPaid,
            applied: additionalPaid,
            paymentType: pt,
            at: now,
          };
          if (isCash) entry.change = Number.isFinite(change) ? Math.max(0, change) : 0;
          if (result?.payFor) entry.payFor = result.payFor;
          if (typeof result?.appliedParts === 'number') entry.appliedParts = result.appliedParts;
          if (typeof result?.appliedLabor === 'number') entry.appliedLabor = result.appliedLabor;
          return [...prevPayments, entry];
        })();

        const nextWo = {
          ...wo,
          amountPaid: newAmountPaid,
          paymentType: result.paymentType,
          payments,
          status,
          checkoutDate,
          items: updatedItems,
          totals: updatedTotals,
        };

        setWo(() => nextWo);

        if (wo.id && wo.id > 0) {
          try {
            await (window as any).api.update('workOrders', { ...nextWo });
          } catch (e) {
            console.error('Failed persisting checkout update', e);
          }
        }

        if (result.printReceipt) {
          try {
            let customerName = (wo as any).customerName || '';
            let customerPhone = (wo as any).customerPhone || '';
            let customerPhoneAlt = '';
            let customerEmail = (wo as any).customerEmail || '';
            try {
              const id = (wo as any).customerId;
              if (id && (window as any).api?.findCustomers) {
                const list = await (window as any).api.findCustomers({ id });
                const c = Array.isArray(list) && list.length ? list[0] : null;
                if (c) {
                  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
                  customerName = full || customerName;
                  customerPhone = c.phone || customerPhone;
                  customerPhoneAlt = c.phoneAlt || '';
                  customerEmail = c.email || customerEmail;
                }
              }
            } catch {}

            const payload = {
              id: (wo as any).id,
              customerId: (wo as any).customerId,
              customerName,
              customerPhone,
              customerPhoneAlt,
              customerEmail,
              productCategory: wo.productCategory,
              productDescription: wo.productDescription,
              model: (wo as any).model,
              serial: (wo as any).serial,
              password: (nextWo as any).password ?? (wo as any).password ?? '',
              patternSequence: Array.isArray((nextWo as any).patternSequence)
                ? (nextWo as any).patternSequence
                : (Array.isArray((wo as any).patternSequence) ? (wo as any).patternSequence : []),
              problemInfo: wo.problemInfo,
              items: (nextWo as any).items || [],
              partCosts: (nextWo as any).partCosts,
              laborCost: (nextWo as any).laborCost,
              discount: (nextWo as any).discount,
              taxRate: (nextWo as any).taxRate,
              totals: (nextWo as any).totals,
              amountPaid: (nextWo as any).amountPaid,
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
          const delayMs = 0;
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
    };
  });

  const handleCheckout = useCallback(() => {
    void handleCheckoutRef.current();
  }, []);

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
        <WorkOrderSidebar workOrder={workOrderFull} onChange={handleSidebarChange} validationFlags={sidebarValidationFlags} />
        <div className="flex flex-col gap-2 col-span-1 pb-16 min-h-0 overflow-auto">
          <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-zinc-200">Work Order Type</div>
              <div className="text-xs text-zinc-500">Switching types can clear fields</div>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                className={`px-3 py-1.5 rounded border text-sm ${!isCustomBuild && !isDrone ? 'bg-neon-green text-zinc-900 border-transparent' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}
                onClick={() => {
                  if (!isCustomBuild && !isDrone) return;
                  const hasData = Boolean((wo.items?.length || 0) > 0 || (wo.password || wo.model || wo.serial));
                  if (hasData && !confirm('Switch to Standard Work Order? This will clear custom-build-only fields and may clear some device fields.')) return;
                  setWo((w) => ({
                    ...w,
                    workOrderType: 'standard',
                    productCategory: w.productCategory || '',
                  }));
                }}
              >
                Standard
              </button>
              <button
                className={`px-3 py-1.5 rounded border text-sm ${isCustomBuild ? 'bg-neon-green text-zinc-900 border-transparent' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}
                onClick={() => {
                  if (isCustomBuild) return;
                  const hasData = Boolean((wo.items?.length || 0) > 0 || (wo.password || wo.model || wo.serial || wo.productCategory));
                  if (hasData && !confirm('Switch to Custom PC Build? This will clear device fields (password/model/serial/category).')) return;
                  setWo((w) => ({
                    ...w,
                    workOrderType: 'customBuild',
                    productCategory: 'Custom PC Build',
                    password: '',
                    model: '',
                    serial: '',
                    patternSequence: [] as any,
                  }));
                }}
              >
                Custom PC Build
              </button>
              <button
                className={`px-3 py-1.5 rounded border text-sm ${isDrone ? 'bg-neon-green text-zinc-900 border-transparent' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}
                onClick={() => {
                  if (isDrone) return;
                  const hasData = Boolean((wo.items?.length || 0) > 0 || (wo.password || wo.model || wo.serial || wo.productCategory));
                  if (hasData && !confirm('Switch to Drone? This will clear device fields (password/model/serial/category).')) return;
                  setWo((w) => ({
                    ...w,
                    workOrderType: 'drone',
                    productCategory: 'Drone',
                    password: '',
                    model: '',
                    serial: '',
                    patternSequence: [] as any,
                  }));
                }}
              >
                Drone
              </button>
            </div>
          </div>

          <WorkOrderForm
            workOrder={workOrderFull}
            onChange={handleFormChange}
            validationFlags={formValidationFlags}
            mode={isCustomBuild ? 'customBuild' : 'standard'}
          />

          {isDrone && (
            <DroneChecklistPanel
              checklist={wo.droneChecklist ?? defaultDroneChecklist()}
              onChange={cl => setWo(w => ({ ...w, droneChecklist: cl }))}
            />
          )}

          {isCustomBuild ? (
            <CustomBuildItemsTable items={wo.items} onChange={handleItemsChange} />
          ) : (
            <ItemsTable items={wo.items} onChange={handleItemsChange} />
          )}

          <DropoffAccessoriesPanel
            accessories={wo.dropoffAccessories ?? []}
            onChange={acc => setWo(w => ({ ...w, dropoffAccessories: acc }))}
          />
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
                <label className="block text-xs text-zinc-400">Order URL</label>
                <input
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                  placeholder="https://..."
                  value={(wo as any).partsOrderUrl || ''}
                  onChange={e => setWo(w => ({ ...w, partsOrderUrl: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Tracking URL</label>
                <input
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                  placeholder="https://..."
                  value={(wo as any).partsTrackingUrl || ''}
                  onChange={e => setWo(w => ({ ...w, partsTrackingUrl: e.target.value }))}
                />
              </div>
              <div className="col-span-4">
                <label className="block text-xs text-zinc-400">Dates/notes</label>
                <input
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                  placeholder="e.g. Ordered 10/04, ETA 10/10"
                  value={(wo as any).partsDates || ''}
                  onChange={e => setWo(w => ({ ...w, partsDates: e.target.value }))}
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
          <IntakePanel workOrder={workOrderFull} customerSummary={customerSummary} onChange={handleIntakeChange} />
          <PaymentPanel workOrder={workOrderFull} onChange={handlePaymentChange} onCheckout={handleCheckout} />
        </div>
      </div>

      <div className="fixed bottom-4 left-4 right-3 flex items-center justify-between">
        <div className="text-xs text-zinc-500 min-h-[1.2rem]">Auto-save enabled</div>
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

