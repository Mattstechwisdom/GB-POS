
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
import type { SaleItemRow } from '../sales/SaleItemsTable';

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

const ADDON_SALE_MAX_ITEMS = 20;

function isConsultationSaleItem(row: Partial<SaleItemRow> | null | undefined): boolean {
  const cat = (row as any)?.category;
  const s = (cat == null ? '' : String(cat)).trim().toLowerCase();
  return s === 'consultation' || s.startsWith('consult');
}

function addonSaleUnits(row: Partial<SaleItemRow> | null | undefined): number {
  if (isConsultationSaleItem(row)) {
    const hours = Number((row as any)?.consultationHours ?? row?.qty ?? 0);
    return Number.isFinite(hours) && hours > 0 ? hours : 0;
  }
  const qty = Number(row?.qty ?? 0);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function addonSaleLineTotal(row: Partial<SaleItemRow> | null | undefined): number {
  return addonSaleUnits(row) * (Number(row?.price) || 0);
}

function computeAddonSaleTotals(opts: { items: SaleItemRow[]; taxRate: number; discount: number; amountPaid: number }) {
  const items = Array.isArray(opts.items) ? opts.items : [];
  const taxRate = Number(opts.taxRate || 0) || 0;
  const discount = Number(opts.discount || 0) || 0;
  const amountPaid = Number(opts.amountPaid || 0) || 0;

  const partCosts = round2(items.reduce((sum, r) => sum + addonSaleLineTotal(r), 0));
  const consultationTotal = round2(items.reduce((sum, r) => (isConsultationSaleItem(r) ? sum + addonSaleLineTotal(r) : sum), 0));

  const discountedTotal = round2(Math.max(0, partCosts - discount));
  const taxableParts = Math.max(0, discountedTotal - consultationTotal);
  const subTotal = round2(partCosts);
  const tax = round2(taxableParts * taxRate / 100);
  const total = round2(discountedTotal + tax);
  const remaining = Math.max(0, round2(total - amountPaid));

  return {
    partCosts,
    laborCost: 0,
    totals: { subTotal, tax, total, remaining },
  };
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
    addonSaleId: null,
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
  const [addonSale, setAddonSale] = useState<any | null>(null);
  const [armedValidationActions, setArmedValidationActions] = useState<Record<ValidationActionKey, boolean>>({
    save: false,
    checkout: false,
    close: false,
  });

  // Load the attached retail sale (if any) so we can display quick context.
  useEffect(() => {
    const saleId = Number((wo as any).addonSaleId || 0);
    if (!saleId) { setAddonSale(null); return; }

    let alive = true;
    (async () => {
      try {
        const api: any = (window as any).api;
        if (!api?.dbGet) { if (alive) setAddonSale(null); return; }
        const list = await api.dbGet('sales').catch(() => []);
        const found = Array.isArray(list) ? list.find((s: any) => Number(s?.id || 0) === saleId) : null;
        if (alive) setAddonSale(found || null);
      } catch {
        if (alive) setAddonSale(null);
      }
    })();

    return () => { alive = false; };
  }, [wo.addonSaleId]);

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

  // For the Payment panel + checkout, treat the linked retail sale as additional balance due.
  // This is UI-only: we do NOT roll retail dollars into the persisted Work Order totals.
  const paymentWorkOrder = useMemo<WorkOrderFull>(() => {
    const base: any = workOrderFull as any;
    const baseTotals = (base as any).totals || { subTotal: 0, tax: 0, total: 0, remaining: 0 };
    if (!addonSale) return base as WorkOrderFull;

    const sale: any = addonSale as any;
    const computed = (() => {
      const t = sale?.totals;
      const pc = Number(sale?.partCosts ?? 0) || 0;
      if (t && typeof t === 'object' && Number.isFinite(pc) && pc > 0) return { partCosts: pc, totals: t };
      const items = Array.isArray(sale?.items) ? (sale.items as SaleItemRow[]) : [];
      const taxRate = Number(sale?.taxRate || 0) || 0;
      const discount = Number(sale?.discount || 0) || 0;
      const amountPaid = Number(sale?.amountPaid || 0) || 0;
      return computeAddonSaleTotals({ items, taxRate, discount, amountPaid });
    })();

    const salePartCosts = round2(Number(computed?.partCosts || 0) || 0);
    const saleTotals = computed?.totals;
    const combinedPartCosts = round2((Number(base.partCosts || 0) || 0) + salePartCosts);

    const combinedTotals = {
      ...baseTotals,
      subTotal: round2((Number(baseTotals.subTotal || 0) || 0) + (Number(saleTotals?.subTotal || 0) || 0)),
      tax: round2((Number(baseTotals.tax || 0) || 0) + (Number(saleTotals?.tax || 0) || 0)),
      total: round2((Number(baseTotals.total || 0) || 0) + (Number(saleTotals?.total || 0) || 0)),
      remaining: round2((Number(baseTotals.remaining || 0) || 0) + (Number(saleTotals?.remaining || 0) || 0)),
    };

    return { ...base, partCosts: combinedPartCosts, totals: combinedTotals } as WorkOrderFull;
  }, [workOrderFull, addonSale]);

  const readonlyAddonRows = useMemo<WorkOrderItemRow[]>(() => {
    const sale: any = addonSale as any;
    const list: SaleItemRow[] = Array.isArray(sale?.items) ? (sale.items as SaleItemRow[]) : [];
    if (!list.length) return [];

    return list.map((row, idx) => {
      const isConsult = isConsultationSaleItem(row);
      const units = addonSaleUnits(row);
      const lineTotal = round2(addonSaleLineTotal(row));
      const baseDesc = String(row?.description || 'Item').trim();
      const showUnits = Number.isFinite(units) && units > 0 && Math.abs(units - 1) > 0.0001;
      const suffix = showUnits ? (isConsult ? ` (${units} hrs)` : ` (x${units})`) : '';
      return {
        id: `addon-${String((row as any)?.id || idx)}`,
        device: 'Retail',
        repairCategory: String((row as any)?.category || 'Retail'),
        repair: `${baseDesc}${suffix}`.trim(),
        parts: lineTotal,
        labor: 0,
        status: 'done',
        note: sale?.id ? `Sale #${sale.id}` : undefined,
      };
    });
  }, [addonSale]);

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

  async function handleAddProduct() {
    try {
      const api: any = (window as any).api;
      const workOrderId = Number((wo as any).id || 0) || 0;
      const customerId = Number((wo as any).customerId || 0) || 0;
      if (!customerId) {
        triggerWarningBanner('Customer is missing', 'Select a customer, then click Add Product again.');
        return;
      }
      if (!workOrderId) {
        triggerWarningBanner('Save work order first', 'Wait for the Work Order to get an invoice #, then try again.');
        return;
      }

      if (typeof api?.pickSaleProduct !== 'function') {
        triggerWarningBanner('Product picker unavailable', 'This build is missing the sale product picker IPC bridge.');
        return;
      }

      const picked = await api.pickSaleProduct();
      if (!picked) return; // cancelled

      const row: SaleItemRow = {
        id: crypto.randomUUID(),
        description: String(picked.itemDescription || picked.title || picked.name || 'Item'),
        qty: Number(picked.quantity ?? 1) || 1,
        price: Number(picked.price ?? 0) || 0,
        consultationHours: typeof picked.consultationHours === 'number' ? picked.consultationHours : undefined,
        internalCost: typeof picked.internalCost === 'number' ? picked.internalCost : undefined,
        condition: picked.condition || 'New',
        inStock: picked.inStock == null ? true : !!picked.inStock,
        productUrl: picked.productUrl || picked.url || picked.link || '',
        category: picked.category,
      };

      // Resolve customer info for the Sale record.
      let customerName = customerSummary.name || String((wo as any).customerName || '').trim();
      let customerPhone = customerSummary.phone || String((wo as any).customerPhone || '').trim();
      try {
        if (customerId && api?.findCustomers) {
          const list = await api.findCustomers({ id: customerId });
          const c = Array.isArray(list) && list.length ? list[0] : null;
          if (c) {
            const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
            customerName = full || customerName;
            customerPhone = c.phone || customerPhone;
          }
        }
      } catch {}

      // Load existing add-on sale if one is already linked.
      const existingSaleId = Number((wo as any).addonSaleId || 0) || 0;
      let existingSale: any = null;
      if (existingSaleId && api?.dbGet) {
        try {
          const list = await api.dbGet('sales').catch(() => []);
          existingSale = Array.isArray(list) ? list.find((s: any) => Number(s?.id || 0) === existingSaleId) : null;
        } catch {}
      }

      const existingItems: SaleItemRow[] = Array.isArray(existingSale?.items) ? (existingSale.items as SaleItemRow[]) : [];
      const nextItems = [...existingItems, row].slice(0, ADDON_SALE_MAX_ITEMS);

      const nowIso = new Date().toISOString();
      const existingTaxRate = Number(existingSale?.taxRate || 0) || 0;
      const woTaxRate = Number((wo as any).taxRate || 0) || 0;
      const taxRate = existingTaxRate > 0 ? existingTaxRate : (woTaxRate > 0 ? woTaxRate : 8);
      const discount = Number(existingSale?.discount || 0) || 0;
      const amountPaid = Number(existingSale?.amountPaid || 0) || 0;
      const { partCosts, laborCost, totals } = computeAddonSaleTotals({ items: nextItems, taxRate, discount, amountPaid });

      const first = nextItems[0];

      const baseRecord: any = {
        ...(existingSale || {}),
        customerId,
        customerName,
        customerPhone,
        // multi-item list
        items: nextItems,
        // align with shared panels + tables
        status: (existingSale?.status || (totals.remaining <= 0.009 ? 'closed' : 'open')),
        assignedTo: (wo as any).assignedTo ?? existingSale?.assignedTo ?? null,
        checkInAt: (existingSale?.checkInAt || nowIso),
        createdAt: (existingSale?.createdAt || nowIso),
        updatedAt: nowIso,
        inStock: existingSale?.inStock ?? true,
        // totals
        partCosts,
        laborCost,
        discount,
        taxRate,
        amountPaid,
        totals,
        total: totals.total,
        // legacy single-item mirror (kept for backward-compatible prints)
        itemDescription: first ? first.description : (existingSale?.itemDescription || ''),
        quantity: first ? addonSaleUnits(first) : (existingSale?.quantity || 1),
        price: first ? first.price : (existingSale?.price || 0),
        consultationHours: first && isConsultationSaleItem(first)
          ? Number((first as any).consultationHours ?? addonSaleUnits(first)) || undefined
          : (existingSale?.consultationHours || undefined),
      };

      let savedSale: any = null;
      if (existingSale?.id) {
        savedSale = await api.dbUpdate('sales', existingSale.id, { ...baseRecord, id: existingSale.id });
      } else {
        savedSale = await api.dbAdd('sales', baseRecord);
      }

      const newSaleId = Number(savedSale?.id || existingSale?.id || 0) || 0;
      if (newSaleId) {
        setWo(w => ({ ...w, addonSaleId: newSaleId }));
      }
      setAddonSale(savedSale || { ...baseRecord, id: newSaleId });
      triggerWarningBanner('Product added', newSaleId ? `Attached to Sale #${newSaleId}.` : undefined);
    } catch (e) {
      console.error('Add Product failed', e);
      triggerWarningBanner('Failed to add product', 'See console for details.');
    }
  }

  async function handleRemoveRetailAddonRow(row: WorkOrderItemRow) {
    try {
      const api: any = (window as any).api;
      const addonSaleId = Number((wo as any).addonSaleId || 0) || 0;
      if (!addonSaleId) {
        triggerWarningBanner('No retail sale linked', 'There is no add-on Sale attached to this work order.');
        return;
      }
      if (!api?.dbGet || !api?.dbUpdate) {
        triggerWarningBanner('Database unavailable', 'This build is missing the dbGet/dbUpdate bridge methods.');
        return;
      }

      let saleRecord: any = null;
      if (addonSale && Number((addonSale as any)?.id || 0) === addonSaleId) {
        saleRecord = addonSale;
      } else {
        const list = await api.dbGet('sales').catch(() => []);
        saleRecord = Array.isArray(list) ? list.find((s: any) => Number(s?.id || 0) === addonSaleId) : null;
      }
      if (!saleRecord) {
        triggerWarningBanner('Retail sale not found', `Could not load Sale #${addonSaleId}.`);
        return;
      }

      const token = String((row as any)?.id || '').trim();
      const rawId = token.startsWith('addon-') ? token.slice('addon-'.length) : token;
      const prevItems: SaleItemRow[] = Array.isArray(saleRecord?.items) ? (saleRecord.items as SaleItemRow[]) : [];
      if (!prevItems.length) {
        triggerWarningBanner('Retail sale is empty');
        return;
      }

      // Prefer stable removal by item.id, but support legacy rows without item ids (fallback to index).
      let nextItems: SaleItemRow[] = prevItems.filter((it: any) => {
        try {
          const itId = it?.id;
          if (itId != null && String(itId) === rawId) return false;
        } catch {}
        return true;
      });

      if (nextItems.length === prevItems.length) {
        const idx = Number(rawId);
        if (Number.isInteger(idx) && idx >= 0 && idx < prevItems.length) {
          nextItems = prevItems.filter((_it, i) => i !== idx);
        }
      }

      if (nextItems.length === prevItems.length) {
        triggerWarningBanner('Item not found', 'Could not match this row to a Sale item.');
        return;
      }

      const taxRate = Number(saleRecord?.taxRate || 0) || (Number((wo as any).taxRate || 0) || 0);
      const discount = Number(saleRecord?.discount || 0) || 0;
      const amountPaid = Number(saleRecord?.amountPaid || 0) || 0;
      const computed = computeAddonSaleTotals({ items: nextItems, taxRate, discount, amountPaid });

      const first = nextItems[0];
      const prevStatus = String(saleRecord?.status || 'open');
      const status = prevStatus === 'closed'
        ? 'closed'
        : ((computed.totals?.remaining || 0) <= 0.009 ? 'closed' : 'open');

      const nowIso = new Date().toISOString();
      const nextSale: any = {
        ...(saleRecord || {}),
        id: addonSaleId,
        updatedAt: nowIso,
        items: nextItems,
        status,
        // totals
        partCosts: computed.partCosts,
        laborCost: computed.laborCost,
        totals: computed.totals,
        total: computed.totals.total,
        taxRate,
        discount,
        amountPaid,
        // legacy single-item mirror (kept for backward-compatible prints)
        itemDescription: first ? first.description : '',
        quantity: first ? addonSaleUnits(first) : 1,
        price: first ? first.price : 0,
        consultationHours: first && isConsultationSaleItem(first)
          ? Number((first as any).consultationHours ?? addonSaleUnits(first)) || undefined
          : undefined,
      };

      const savedSale = await api.dbUpdate('sales', addonSaleId, { ...nextSale, id: addonSaleId });
      setAddonSale(savedSale || nextSale);
      triggerWarningBanner(
        'Retail item removed',
        nextItems.length ? `Remaining retail items: ${nextItems.length}` : 'No retail items remaining.'
      );
    } catch (e) {
      console.error('handleRemoveRetailAddonRow failed', e);
      triggerWarningBanner('Failed to remove retail item', 'See console for details.');
    }
  }

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
        const api: any = (window as any).api;
        const woRemaining = Number(wo.totals?.remaining || 0) || 0;

        // If a retail add-on sale is linked, include its remaining balance in the checkout due.
        const addonSaleId = Number((wo as any).addonSaleId || 0) || 0;
        let addonSaleRecord: any = null;
        if (addonSaleId) {
          if (addonSale && Number((addonSale as any)?.id || 0) === addonSaleId) {
            addonSaleRecord = addonSale;
          } else if (api?.dbGet) {
            try {
              const list = await api.dbGet('sales').catch(() => []);
              addonSaleRecord = Array.isArray(list) ? list.find((s: any) => Number(s?.id || 0) === addonSaleId) : null;
            } catch {}
          }
        }

        const addonSaleTotals = (() => {
          if (!addonSaleRecord) return null;
          const t = (addonSaleRecord as any)?.totals;
          if (t && typeof t === 'object') return t;
          const items = Array.isArray((addonSaleRecord as any)?.items) ? ((addonSaleRecord as any).items as SaleItemRow[]) : [];
          const taxRate = Number((addonSaleRecord as any)?.taxRate || 0) || 0;
          const discount = Number((addonSaleRecord as any)?.discount || 0) || 0;
          const amountPaid = Number((addonSaleRecord as any)?.amountPaid || 0) || 0;
          return computeAddonSaleTotals({ items, taxRate, discount, amountPaid }).totals;
        })();

        const addonRemaining = Number(addonSaleTotals?.remaining || 0) || 0;
        const amountDue = round2(woRemaining + addonRemaining);

        const checkoutPayload: any = {
          amountDue,
          title: isCustomBuild ? 'Custom Build Checkout' : 'Work Order Checkout',
        };

        // Only show the parts/labor split when this checkout is purely the Work Order balance.
        if (!(addonRemaining > 0)) {
          const partCosts = Number(wo.partCosts || 0) || 0;
          const laborCost = Number(wo.laborCost || 0) || 0;
          const discount = Number(wo.discount || 0) || 0;
          const taxRate = Number(wo.taxRate || 0) || 0;
          const laborAfterDiscount = Math.max(0, laborCost - discount);
          const partsWithTax = Math.round(((partCosts + (partCosts * taxRate / 100)) + Number.EPSILON) * 100) / 100;
          checkoutPayload.partsDue = Math.min(partsWithTax, amountDue);
          checkoutPayload.laborDue = Math.min(laborAfterDiscount, amountDue);
        }

        const result = await api.openCheckout(checkoutPayload);
        if (!result) return;

        const nowIso = new Date().toISOString();

        const checkoutLines = Array.isArray(result.payments) ? result.payments : [];
        const normalizedLines = checkoutLines.length
          ? checkoutLines
          : [
              {
                paymentType: result.paymentType,
                applied: Number(result.amountPaid || 0) || 0,
                amount: (() => {
                  const pt = String(result.paymentType || '');
                  const isCash = pt.toLowerCase().includes('cash');
                  const tendered = Number(result.tendered ?? result.amountPaid);
                  return isCash ? (Number.isFinite(tendered) ? tendered : Number(result.amountPaid || 0) || 0) : (Number(result.amountPaid || 0) || 0);
                })(),
                tendered: result.tendered,
                change: result.changeDue,
              },
            ];

        const woPaymentAdds: any[] = [];
        const addonPaymentAdds: any[] = [];

        if (addonSaleRecord && addonRemaining > 0.009) {
          let remainingWo = woRemaining;
          let remainingAddon = addonRemaining;

          normalizedLines.forEach((p: any) => {
            const pt = String(p?.paymentType || '');
            const isCash = pt.toLowerCase().includes('cash');
            const lineApplied = round2(Number(p?.applied || 0) || 0);
            if (!(lineApplied > 0)) return;

            const appliedToWo = round2(Math.min(lineApplied, Math.max(0, remainingWo)));
            const appliedToAddon = round2(Math.min(lineApplied - appliedToWo, Math.max(0, remainingAddon)));

            remainingWo = round2(Math.max(0, remainingWo - appliedToWo));
            remainingAddon = round2(Math.max(0, remainingAddon - appliedToAddon));

            const tendered = Number(p?.tendered ?? p?.amount ?? 0);
            const change = Number(p?.change ?? 0);
            const primary = appliedToWo > 0 ? 'workorder' : (appliedToAddon > 0 ? 'sale' : null);

            if (appliedToWo > 0) {
              const entry: any = {
                amount: isCash
                  ? (primary === 'workorder' ? (Number.isFinite(tendered) ? tendered : appliedToWo) : 0)
                  : appliedToWo,
                applied: appliedToWo,
                paymentType: pt,
                at: nowIso,
              };
              if (isCash && primary === 'workorder') entry.change = Number.isFinite(change) ? Math.max(0, change) : 0;
              woPaymentAdds.push(entry);
            }

            if (appliedToAddon > 0) {
              const entry: any = {
                amount: isCash
                  ? (primary === 'sale' ? (Number.isFinite(tendered) ? tendered : appliedToAddon) : 0)
                  : appliedToAddon,
                applied: appliedToAddon,
                paymentType: pt,
                at: nowIso,
              };
              if (isCash && primary === 'sale') entry.change = Number.isFinite(change) ? Math.max(0, change) : 0;
              addonPaymentAdds.push(entry);
            }
          });
        } else {
          let remainingParts = Number(checkoutPayload.partsDue || 0) || 0;

          normalizedLines.forEach((p: any) => {
            const pt = String(p?.paymentType || '');
            const isCash = pt.toLowerCase().includes('cash');
            const applied = round2(Number(p?.applied || 0) || 0);
            if (!(applied > 0)) return;

            const tendered = Number(p?.tendered ?? p?.amount ?? applied);
            const change = Number(p?.change ?? 0);

            const entry: any = {
              amount: isCash ? (Number.isFinite(tendered) ? tendered : applied) : applied,
              applied,
              paymentType: pt,
              at: nowIso,
            };
            if (isCash) entry.change = Number.isFinite(change) ? Math.max(0, change) : 0;

            if (result?.payFor) {
              entry.payFor = result.payFor;
              if (result.payFor === 'parts') {
                entry.appliedParts = applied;
                entry.appliedLabor = 0;
              } else if (result.payFor === 'labor') {
                entry.appliedParts = 0;
                entry.appliedLabor = applied;
              } else {
                const pAmt = round2(Math.min(applied, Math.max(0, remainingParts)));
                const lAmt = round2(Math.max(0, applied - pAmt));
                remainingParts = round2(Math.max(0, remainingParts - pAmt));
                entry.appliedParts = pAmt;
                entry.appliedLabor = lAmt;
              }
            }

            woPaymentAdds.push(entry);
          });
        }

        const appliedToWorkOrder = round2(woPaymentAdds.reduce((sum: number, p: any) => sum + (Number(p?.applied) || 0), 0));
        const appliedToAddonSale = round2(addonPaymentAdds.reduce((sum: number, p: any) => sum + (Number(p?.applied) || 0), 0));

        let newAmountPaid = round2((wo.amountPaid || 0) + appliedToWorkOrder);
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
        const hadOutstandingBalance = woRemaining > 0.009;
        if (result.markClosed || (updatedTotals?.remaining || 0) <= 0) {
          status = 'closed';
          if (!checkoutDate || (appliedToWorkOrder > 0 && hadOutstandingBalance)) {
            checkoutDate = nowIso;
          }
          updatedItems = wo.items.map(it => ({ ...it, status: 'done' }));
        }

        const prevPayments = buildNormalizedCheckoutPayments(wo as any);
        const payments = appliedToWorkOrder > 0 ? [...prevPayments, ...woPaymentAdds] : prevPayments;

        // Update the linked retail Sale record (if any) with its portion of the payment.
        let savedAddonSale: any = null;
        if (addonSaleRecord && addonSaleId && api?.dbUpdate && (appliedToAddonSale > 0 || result.markClosed)) {
          try {
            const prevSalePayments = buildNormalizedCheckoutPayments(addonSaleRecord as any);
            const salePayments = appliedToAddonSale > 0 ? [...prevSalePayments, ...addonPaymentAdds] : prevSalePayments;

            const existingSaleAmountPaid = Number((addonSaleRecord as any)?.amountPaid || 0) || 0;
            const newSaleAmountPaid = round2(existingSaleAmountPaid + appliedToAddonSale);

            const items = Array.isArray((addonSaleRecord as any)?.items) ? ((addonSaleRecord as any).items as SaleItemRow[]) : [];
            const taxRate = Number((addonSaleRecord as any)?.taxRate || 0) || 0;
            const discount = Number((addonSaleRecord as any)?.discount || 0) || 0;
            const computed = computeAddonSaleTotals({ items, taxRate, discount, amountPaid: newSaleAmountPaid });

            let saleStatus = String((addonSaleRecord as any)?.status || 'open');
            let saleCheckoutDate = ((addonSaleRecord as any)?.checkoutDate as string | null) || null;
            const hadSaleOutstanding = addonRemaining > 0.009;
            if (result.markClosed || (computed.totals?.remaining || 0) <= 0) {
              saleStatus = 'closed';
              if (!saleCheckoutDate || (appliedToAddonSale > 0 && hadSaleOutstanding)) {
                saleCheckoutDate = nowIso;
              }
            }

            const nextSale: any = {
              ...(addonSaleRecord as any),
              updatedAt: nowIso,
              amountPaid: newSaleAmountPaid,
              paymentType: result.paymentType,
              payments: salePayments,
              status: saleStatus,
              checkoutDate: saleCheckoutDate,
              partCosts: computed.partCosts,
              laborCost: computed.laborCost,
              totals: computed.totals,
              total: computed.totals.total,
            };

            savedAddonSale = await api.dbUpdate('sales', addonSaleId, { ...nextSale, id: addonSaleId });
            setAddonSale(savedAddonSale || nextSale);
          } catch (e) {
            console.error('Failed updating add-on sale payment', e);
          }
        }

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
            await api.update('workOrders', { ...nextWo });
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

            let addonSale: any = null;
            try {
              const addonSaleId = Number((nextWo as any).addonSaleId || (wo as any).addonSaleId || 0) || 0;
              if (addonSaleId && (window as any).api?.dbGet) {
                const sales = await (window as any).api.dbGet('sales').catch(() => []);
                addonSale = Array.isArray(sales) ? sales.find((s: any) => Number(s?.id || 0) === addonSaleId) : null;
              }
            } catch {}

            const payload = {
              id: (wo as any).id,
              customerId: (wo as any).customerId,
              customerName,
              customerPhone,
              customerPhoneAlt,
              customerEmail,
              paymentType: (nextWo as any).paymentType ?? (wo as any).paymentType,
              payments: (nextWo as any).payments ?? (wo as any).payments ?? [],
              addonSaleId: addonSale?.id ?? (nextWo as any).addonSaleId ?? (wo as any).addonSaleId ?? null,
              addonSale: addonSale || null,
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
            <CustomBuildItemsTable
              items={wo.items}
              onChange={handleItemsChange}
              onAddProduct={handleAddProduct}
              addProductDisabled={!wo.customerId || !Number((wo as any).id || 0)}
              readonlyItems={readonlyAddonRows as any}
              onRemoveReadonlyItem={handleRemoveRetailAddonRow as any}
            />
          ) : (
            <ItemsTable
              items={wo.items}
              onChange={handleItemsChange}
              onAddProduct={handleAddProduct}
              addProductDisabled={!wo.customerId || !Number((wo as any).id || 0)}
              readonlyItems={readonlyAddonRows as any}
              onRemoveReadonlyItem={handleRemoveRetailAddonRow as any}
            />
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
          <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-zinc-200">Retail add-on</h4>
              {Number((wo as any).addonSaleId || 0) ? (
                <div className="text-[11px] text-zinc-500">Sale #{Number((wo as any).addonSaleId || 0)}</div>
              ) : (
                <div className="text-[11px] text-zinc-500">No sale linked</div>
              )}
            </div>
            {addonSale && Array.isArray((addonSale as any).items) && (addonSale as any).items.length > 0 ? (
              <div className="mt-2 text-xs text-zinc-400">
                Attached items: {(addonSale as any).items.length}
              </div>
            ) : null}
          </div>
          <PaymentPanel workOrder={paymentWorkOrder} onChange={handlePaymentChange} onCheckout={handleCheckout} />
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

