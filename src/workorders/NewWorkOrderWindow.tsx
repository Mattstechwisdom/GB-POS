
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
  partSource?: string;
  orderSourceUrl?: string;
  internalCost?: number;
  markupPct?: number | string;
  distributor?: string;
  requiresOrder?: boolean;
  taxExempt?: boolean;
  supplierTaxRate?: number;
  orderStatus?: 'needed' | 'ordered' | 'received' | 'in_stock';
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAutosave } from '../lib/useAutosave';
import { consumeWindowPayload, peekWindowPayload } from '../lib/windowPayload';
import WorkOrderSidebar from './WorkOrderSidebar';
import WorkOrderForm from './WorkOrderForm';
import ItemsTable from './ItemsTable';
import CustomBuildItemsTable from './CustomBuildItemsTable';
import IntakePanel from './IntakePanel';
import PaymentPanel from './PaymentPanel';
import NotesPanel from './NotesPanel';
import ClientUpdatePanel from './ClientUpdatePanel';
import DroneChecklistPanel, { defaultDroneChecklist } from './DroneChecklistPanel';
import DropoffAccessoriesPanel from './DropoffAccessoriesPanel';
import { computeTotals, round2 } from '../lib/calc';
import { WorkOrderFull, WorkOrderItem as BaseWorkOrderItem, DroneChecklist, DropoffAccessory, WorkOrderStatus } from '../lib/types';
import { toLocalDatetimeInput, fromLocalDatetimeInput } from '../lib/datetime';
import { listTechnicians, technicianDisplayName } from '../lib/admin';
import { formatPhone } from '../lib/format';
import { INTAKE_SOURCES, INTAKE_SOURCE_PLACEHOLDER } from '../lib/intakeSources';
import type { SaleItemRow } from '../sales/SaleItemsTable';
import { DEFAULT_PART_MARKUP_PCT, PART_MARKUP_PRESETS, derivePartVendorFromUrl, markedUpPartPrice, normalizePartInventoryTitle, scrapePartUrl, type PartUrlMetadata } from '../lib/partOrdering';

type RequiredKey = 'assignedTo' | 'productDescription' | 'problemInfo' | 'password' | 'model' | 'serial';

type ValidationActionKey = 'save' | 'checkout' | 'close';

type TechnicianOption = { id: string | number; nickname?: string; firstName?: string; email?: string };

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
    // Peek during render so React StrictMode cannot consume the payload on its
    // discarded development render. The mounted component clears it below.
    const stored = peekWindowPayload('newWorkOrder');
    if (stored !== null) return stored;
  } catch {}
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('newWorkOrder');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch (e) { return null; }
}

async function hydrateWorkOrderCustomerSnapshot(
  raw: any,
  fallback: { name?: string; phone?: string; phoneAlt?: string; email?: string } = {},
) {
  const next = { ...(raw || {}) };
  const customerId = Number(next.customerId || next.customerID || next.customer_id || 0) || 0;
  let customerName = String(next.customerName || next.clientName || '').trim() || fallback.name || '';
  let customerPhone = String(next.customerPhone || next.phone || '').trim() || fallback.phone || '';
  let customerPhoneAlt = String(next.customerPhoneAlt || next.phoneAlt || next.altPhone || '').trim() || fallback.phoneAlt || '';
  let customerEmail = String(next.customerEmail || next.email || '').trim() || fallback.email || '';

  try {
    const api: any = (window as any).api;
    if (customerId && api?.findCustomers) {
      const list = await api.findCustomers({ id: customerId });
      const customer = Array.isArray(list) && list.length ? list[0] : null;
      if (customer) {
        const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
        customerName = fullName || customer.name || customer.customerName || customerName;
        customerPhone = customer.phone || customer.customerPhone || customerPhone;
        customerPhoneAlt = customer.phoneAlt || customer.altPhone || customer.customerPhoneAlt || customerPhoneAlt;
        customerEmail = customer.email || customer.customerEmail || customerEmail;
      }
    }
  } catch {
    // Opening a work order should still succeed if the customer lookup is temporarily unavailable.
  }

  return {
    ...next,
    customerId: customerId || next.customerId,
    customerName,
    customerPhone,
    customerPhoneAlt,
    customerEmail,
  };
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

function normalizeMaybeUrl(value: any): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function urlHostLabel(value: any): string {
  const raw = normalizeMaybeUrl(value);
  if (!raw) return 'Open Order URL';
  try {
    return new URL(raw).hostname.replace(/^www\./i, '') || 'Open Order URL';
  } catch {
    return 'Open Order URL';
  }
}

const AssignedTechnicianField: React.FC<{
  value: WorkOrderFull['assignedTo'];
  invalid?: boolean;
  onChange: (assignedTo: string | null) => void;
}> = ({ value, invalid = false, onChange }) => {
  const [techs, setTechs] = useState<TechnicianOption[]>([]);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const list = await listTechnicians();
        if (mounted) setTechs(Array.isArray(list) ? list : []);
      } catch {
        if (mounted) setTechs([]);
      }
    };
    void refresh();
    const off = (window as any).api?.onTechniciansChanged?.(() => void refresh());
    return () => { mounted = false; try { off && off(); } catch {} };
  }, []);

  const selectedTechId = useMemo(() => {
    if (!value) return '';
    const raw = String(value).trim();
    if (techs.some((t: any) => String(t.id) === raw)) return raw;
    const matchByLabel = techs.find((t: any) => technicianDisplayName(t) === raw);
    return matchByLabel ? String(matchByLabel.id) : '';
  }, [techs, value]);

  return (
    <div className="gb-wo-assigned-field">
      <label className="block text-xs text-zinc-400">
        Assigned to
        {invalid && <span className="ml-1 text-red-500">*</span>}
      </label>
      {techs.length === 0 ? (
        <select disabled className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-500">
          <option>No technicians</option>
        </select>
      ) : (
        <select
          className={`w-full mt-1 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand bg-zinc-800 border ${invalid ? 'border-red-500' : 'border-zinc-700'}`}
          value={selectedTechId}
          onChange={e => {
            const id = e.target.value;
            if (!id) { onChange(null); return; }
            const tech = techs.find((t: any) => String(t.id) === id);
            onChange(tech ? String(tech.id) : null);
          }}
        >
          <option value="">Unassigned</option>
          {techs.map((t: any) => (
            <option key={t.id} value={String(t.id)}>{technicianDisplayName(t)}</option>
          ))}
        </select>
      )}
    </div>
  );
};

const WorkOrderDetailsMenu: React.FC<{
  open: boolean;
  workOrder: WorkOrderFull;
  onToggle: () => void;
  onClose: () => void;
  onChange: (patch: Partial<WorkOrderFull>) => void;
}> = ({ open, workOrder, onToggle, onClose, onChange }) => {
  return (
    <div className="gb-wo-details-menu">
      <button
        type="button"
        className={`gb-wo-menu-button ${open ? 'active' : ''}`}
        onClick={onToggle}
        aria-label="Open status and dates"
        aria-expanded={open}
      >
        <span aria-hidden="true"><i /><i /><i /></span>
      </button>
      {open ? (
        <div className="gb-wo-details-popover" role="dialog" aria-label="Status and dates">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold text-zinc-100">Status & Dates</div>
              <div className="text-[11px] text-zinc-500">Optional work order timing</div>
            </div>
            <button type="button" className="gb-wo-details-close" onClick={onClose} aria-label="Close status and dates">x</button>
          </div>

          <label className="block text-xs text-zinc-400">Status</label>
          <select
            className="w-full mt-1 mb-3 bg-zinc-800 border border-zinc-700 rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
            value={workOrder.status}
            onChange={e => onChange({ status: e.target.value as WorkOrderStatus })}
          >
            <option value="open">open</option>
            <option value="in progress">in progress</option>
            <option value="closed">closed</option>
          </select>

          <label className="block text-xs text-zinc-400">Repair complete</label>
          <div className="gb-wo-date-row mb-3">
            <input
              type="datetime-local"
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2"
              value={toLocalDatetimeInput(workOrder.repairCompletionDate)}
              onChange={e => onChange({ repairCompletionDate: fromLocalDatetimeInput(e.target.value) as any })}
            />
            <button type="button" className="bg-brand text-black rounded px-3 py-2 font-semibold" onClick={() => onChange({ repairCompletionDate: new Date().toISOString() })}>Now</button>
          </div>

          <label className="block text-xs text-zinc-400">Check-out</label>
          <div className="gb-wo-date-row">
            <input
              type="datetime-local"
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2"
              value={toLocalDatetimeInput(workOrder.checkoutDate)}
              onChange={e => onChange({ checkoutDate: fromLocalDatetimeInput(e.target.value) as any })}
            />
            <button type="button" className="bg-brand text-black rounded px-3 py-2 font-semibold" onClick={() => onChange({ checkoutDate: new Date().toISOString() })}>Now</button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const WorkOrderMobileTitleCard: React.FC<{
  workOrder: WorkOrderFull;
  customerSummary: { name?: string; phone?: string };
  onChange: (patch: Partial<WorkOrderFull>) => void;
  detailsMenu?: React.ReactNode;
  onUpdateClient?: () => void;
}> = ({ workOrder, customerSummary, onChange, detailsMenu, onUpdateClient }) => {
  const [customMode, setCustomMode] = useState(false);
  const invoiceId = Number((workOrder as any).id || 0) || 0;
  const invoiceLabel = invoiceId > 0 ? `GB${String(invoiceId).padStart(7, '0')}` : 'Draft Work Order';
  const name = customerSummary.name || String((workOrder as any).customerName || '').trim() || 'No client selected';
  const rawPhone = customerSummary.phone || String((workOrder as any).customerPhone || '').trim();
  const phone = formatPhone(rawPhone) || rawPhone;
  const email = String((workOrder as any).customerEmail || '').trim();
  const contact = [phone, email].filter(Boolean).join(' | ');
  const isCustomValue = !!workOrder.intakeSource && !INTAKE_SOURCES.includes(workOrder.intakeSource as string);
  const showCustomInput = customMode || isCustomValue;
  const selectValue = showCustomInput ? '__custom__' : (workOrder.intakeSource || '');

  return (
    <section className="gb-wo-mobile-title-card" aria-label="Work order client summary">
      {detailsMenu ? (
        <div className="gb-wo-mobile-title-menu">
          {detailsMenu}
        </div>
      ) : null}
      <div className="gb-wo-title-line">
        <span>Work Order</span>
        <strong>{invoiceLabel}</strong>
      </div>
      <div className="gb-wo-client-line">
        <span>Client</span>
        <strong>{name}</strong>
        <small>{contact || 'Client info will appear after selecting a customer.'}</small>
      </div>
      <button
        type="button"
        className="gb-wo-view-customer"
        onClick={() => {
          if (workOrder.customerId) (window as any).api.openCustomerOverview(workOrder.customerId);
        }}
        disabled={!workOrder.customerId}
      >
        View Customer
      </button>
      {onUpdateClient ? (
        <button
          type="button"
          className="gb-wo-update-client-button"
          onClick={onUpdateClient}
        >
          Update Client
        </button>
      ) : null}
      <label className="gb-wo-source-field">
        <span>How did you hear about us?</span>
        <select
          value={selectValue}
          onChange={e => {
            const val = e.target.value;
            if (val === '__custom__') {
              setCustomMode(true);
              if (!isCustomValue) onChange({ intakeSource: '' });
              return;
            }
            setCustomMode(false);
            onChange({ intakeSource: val });
          }}
        >
          <option value="">{INTAKE_SOURCE_PLACEHOLDER}</option>
          {INTAKE_SOURCES.map(src => (
            <option key={src} value={src}>{src}</option>
          ))}
          <option value="__custom__">Custom...</option>
        </select>
      </label>
      {showCustomInput ? (
        <input
          className="gb-wo-source-custom"
          type="text"
          value={workOrder.intakeSource || ''}
          placeholder="Type source"
          onChange={e => onChange({ intakeSource: e.target.value })}
        />
      ) : null}
    </section>
  );
};

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
    customerName: payload?.customerName || '',
    customerPhone: payload?.customerPhone || '',
    customerPhoneAlt: payload?.customerPhoneAlt || '',
    customerEmail: payload?.customerEmail || '',
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
  const [detailsMenuOpen, setDetailsMenuOpen] = useState<boolean>(false);
  const [clientUpdateOpen, setClientUpdateOpen] = useState<boolean>(false);
  const warningHideTimer = useRef<number | undefined>(undefined);
  const warningRemoveTimer = useRef<number | undefined>(undefined);
  const lastPartsCalendarSyncKey = useRef<string>('');
  const handleCheckoutRef = useRef<() => Promise<void>>(async () => {});
  const [addonSale, setAddonSale] = useState<any | null>(null);
  const [partsOrderUrlDraft, setPartsOrderUrlDraft] = useState('');
  const [partsTrackingUrlDraft, setPartsTrackingUrlDraft] = useState('');
  const [partsOrderUrlEditing, setPartsOrderUrlEditing] = useState(true);
  const [partsTrackingUrlEditing, setPartsTrackingUrlEditing] = useState(true);
  const [partsUrlScraping, setPartsUrlScraping] = useState(false);
  const [partsUrlMeta, setPartsUrlMeta] = useState<PartUrlMetadata | null>(null);
  const lastPartsScrapeUrlRef = useRef('');
  const partsScrapeSequenceRef = useRef(0);
  const [partsSaveBusy, setPartsSaveBusy] = useState<'part' | 'repair' | null>(null);
  const [armedValidationActions, setArmedValidationActions] = useState<Record<ValidationActionKey, boolean>>({
    save: false,
    checkout: false,
    close: false,
  });

  useEffect(() => {
    consumeWindowPayload('newWorkOrder');
  }, []);

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
  const isMobileRuntime = useMemo(() => {
    try { return document.body.classList.contains('gbpos-mobile'); } catch { return false; }
  }, []);

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
        const hydratedExisting = await hydrateWorkOrderCustomerSnapshot(existing, customerSummary);
        // Map existing.items (WorkOrderItem[]) to WorkOrderItemRow[] if present
        const mappedItems: WorkOrderItemRow[] = (hydratedExisting.items || []).map((it: any) => ({
          id: it.id?.toString() || Math.random().toString(36).slice(2),
          device: (it.device || hydratedExisting.productDescription || hydratedExisting.productCategory || ''),
          repairCategory: it.repairCategory || '',
          repair: (it.repair || it.description || it.title || it.name || it.altDescription || ''),
          parts: typeof it.parts === 'number' ? it.parts : (typeof it.partCost === 'number' ? it.partCost : 0),
          labor: typeof it.labor === 'number' ? it.labor : (typeof it.unitPrice === 'number' ? it.unitPrice : (typeof it.laborCost === 'number' ? it.laborCost : 0)),
          status: it.status || 'pending',
          note: it.note || it.model || it.modelNumber || '',
          partSource: it.partSource || '',
          orderSourceUrl: it.orderSourceUrl || '',
        }));
        setWo(w => ({
          ...w,
          ...hydratedExisting,
          workOrderType: ((hydratedExisting as any).workOrderType === 'customBuild' || (hydratedExisting as any).isCustomBuild) ? 'customBuild'
            : (hydratedExisting as any).workOrderType === 'drone' ? 'drone'
            : (w.workOrderType || 'standard'),
          partsOrdered: hydratedExisting.partsOrdered ?? w.partsOrdered,
          partsEstimatedDelivery: hydratedExisting.partsEstimatedDelivery ?? w.partsEstimatedDelivery,
          partsDates: (hydratedExisting as any).partsDates ?? w.partsDates,
          partsOrderUrl: (hydratedExisting as any).partsOrderUrl ?? w.partsOrderUrl,
          partsTrackingUrl: (hydratedExisting as any).partsTrackingUrl ?? w.partsTrackingUrl,
          partsOrderDate: (hydratedExisting as any).partsOrderDate ?? w.partsOrderDate,
          partsEstDelivery: (hydratedExisting as any).partsEstDelivery ?? w.partsEstDelivery,
          items: mappedItems.length ? mappedItems : w.items,
          totals: hydratedExisting.totals || w.totals,
          droneChecklist: (hydratedExisting as any).droneChecklist ?? w.droneChecklist,
          dropoffAccessories: Array.isArray((hydratedExisting as any).dropoffAccessories) ? (hydratedExisting as any).dropoffAccessories : w.dropoffAccessories,
          internalNotesLog: Array.isArray(hydratedExisting.internalNotesLog) ? hydratedExisting.internalNotesLog : (hydratedExisting.internalNotes ? hydratedExisting.internalNotes.split('\n').map((line: string, idx: number) => ({ id: idx + 1, text: line })) : []),
        }));
        setInitialCustomerId(hydratedExisting.customerId || hydratedExisting.customerID || hydratedExisting.customer_id || 0);
        setCustomerSummary({
          name: hydratedExisting.customerName || customerSummary.name,
          phone: hydratedExisting.customerPhone || customerSummary.phone,
        });
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

  const enrichWorkOrderCustomer = useCallback(async (raw: any) => {
    return hydrateWorkOrderCustomerSnapshot(raw, customerSummary);
  }, [customerSummary.name, customerSummary.phone]);

  const applySavedCustomerSnapshot = useCallback((saved: any) => {
    const savedId = Number(saved?.id || 0) || 0;
    const customerName = String(saved?.customerName || '').trim();
    const customerPhone = String(saved?.customerPhone || '').trim();
    const customerPhoneAlt = String(saved?.customerPhoneAlt || '').trim();
    const customerEmail = String(saved?.customerEmail || '').trim();
    setWo(w => {
      const next = {
        ...w,
        ...(savedId > 0 ? { id: savedId } : {}),
        ...(customerName ? { customerName } : {}),
        ...(customerPhone ? { customerPhone } : {}),
        ...(customerPhoneAlt ? { customerPhoneAlt } : {}),
        ...(customerEmail ? { customerEmail } : {}),
      };
      const unchanged =
        Number((w as any).id || 0) === Number((next as any).id || 0) &&
        String((w as any).customerName || '') === String((next as any).customerName || '') &&
        String((w as any).customerPhone || '') === String((next as any).customerPhone || '') &&
        String((w as any).customerPhoneAlt || '') === String((next as any).customerPhoneAlt || '') &&
        String((w as any).customerEmail || '') === String((next as any).customerEmail || '');
      return unchanged ? w : next;
    });
    if (customerName || customerPhone) {
      setCustomerSummary(prev => ({
        name: customerName || prev.name,
        phone: customerPhone || prev.phone,
      }));
    }
  }, []);

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
          const payload = await enrichWorkOrderCustomer(current);
          let saved: any = null;
          if (isEditingExistingRef.current || (current.id && current.id !== 0)) {
            if (typeof api.update === 'function') saved = await api.update('workOrders', { ...payload });
            else if (typeof api.dbUpdate === 'function') saved = await api.dbUpdate('workOrders', current.id, { ...payload });
          } else {
            if (typeof api.addWorkOrder === 'function') saved = await api.addWorkOrder({ ...payload });
            else if (typeof api.dbAdd === 'function') saved = await api.dbAdd('workOrders', { ...payload });
          }
          const savedId = Number(saved?.id || payload.id || current.id || 0);
          try { window.opener?.postMessage({ type: 'workorders:changed', id: savedId }, '*'); } catch {}
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
  }, [enrichWorkOrderCustomer]);

  // Autosave work order after a short idle period (keeps UI responsive during typing)
  useAutosave(wo, async (val) => {
    try {
      const api = (window as any).api || {};
      const payload = await enrichWorkOrderCustomer(val);
      let saved: any = null;
      // Decide add vs update
      if (isEditingExisting || (val.id && val.id !== 0)) {
        if (typeof api.update === 'function') saved = await api.update('workOrders', { ...payload });
        else if (typeof api.dbUpdate === 'function') saved = await api.dbUpdate('workOrders', val.id, { ...payload });
      } else {
        // Only create a new record when some key fields have content
        const hasMeaningful = !!(val.productCategory || val.productDescription || val.customerId || (val.items && val.items.length));
        if (!hasMeaningful) return;
        const added = typeof api.addWorkOrder === 'function' ? await api.addWorkOrder({ ...payload }) : await api.dbAdd('workOrders', { ...payload });
        saved = added;
      }
      applySavedCustomerSnapshot(saved || payload);
      setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }));
      const savedId = Number((saved?.id ?? payload.id ?? (val as any).id) || 0);
      try { window.opener?.postMessage({ type: 'workorders:changed', id: savedId }, '*'); } catch {}

      // Reflect parts into Calendar only when relevant fields changed
      try {
        const id = Number((saved?.id ?? payload.id ?? val.id) || 0);
        const key = [
          id,
          onlyDate((saved?.partsOrderDate ?? payload.partsOrderDate) || null),
          onlyDate((saved?.partsEstDelivery ?? payload.partsEstDelivery) || null),
          String((saved?.partsOrderUrl ?? payload.partsOrderUrl) || ''),
          String((saved?.partsTrackingUrl ?? payload.partsTrackingUrl) || ''),
        ].join('|');
        if (id && key !== lastPartsCalendarSyncKey.current) {
          lastPartsCalendarSyncKey.current = key;
          await reflectWorkOrderInCalendar(saved || payload);
        }
      } catch {
        // ignore
      }
    } catch (e) {
      // silent
    }
  }, {
    debounceMs: 8000,
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
        const payload = await enrichWorkOrderCustomer(wo);
        let saved: any = null;
        if (isEditingExisting || (wo.id && wo.id !== 0)) {
          if (typeof api.update === 'function') saved = await api.update('workOrders', { ...payload });
          else if (typeof api.dbUpdate === 'function') saved = await api.dbUpdate('workOrders', wo.id, { ...payload });
          console.log('Work order updated', saved);
        } else {
          if (typeof api.addWorkOrder === 'function') saved = await api.addWorkOrder({ ...payload });
          else if (typeof api.dbAdd === 'function') saved = await api.dbAdd('workOrders', { ...payload });
          console.log('Work order added', saved);
        }
        applySavedCustomerSnapshot(saved || payload);
        const savedId = Number(saved?.id || payload.id || wo.id || 0);
        try { window.opener?.postMessage({ type: 'workorders:changed', id: savedId }, '*'); } catch {}
        setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }));

        // Reflect parts ordered/delivery dates into Calendar
        try {
          await reflectWorkOrderInCalendar(saved || payload);
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

  // Stable ref so handleSidebarForceSave doesn't change on every render
  const workOrderFullRef = useRef<WorkOrderFull>(workOrderFull);
  useEffect(() => { workOrderFullRef.current = workOrderFull; }, [workOrderFull]);

  // Called by the sidebar "Print customer receipt" button when the work order
  // hasn't been persisted yet (id=0). Saves immediately so the receipt can
  // embed a real QR-code status URL.
  const handleSidebarForceSave = useCallback(async (): Promise<number> => {
    const current = workOrderFullRef.current as any;
    const existingId = Number(current?.id || 0) || 0;
    if (existingId > 0) return existingId; // already saved — nothing to do
    const api: any = (window as any).api;
    if (typeof api.addWorkOrder !== 'function') return 0;
    try {
      const payload = await enrichWorkOrderCustomer(current);
      const added = await api.addWorkOrder({ ...payload });
      if (added?.id) {
        const newId = Number(added.id) || 0;
        // Sync React state so the autosave takes the UPDATE path, not CREATE again
        applySavedCustomerSnapshot({ ...payload, ...added, id: newId });
        return newId;
      }
    } catch (e) { console.error('Force-save before receipt failed', e); }
    return 0;
  }, [applySavedCustomerSnapshot, enrichWorkOrderCustomer]); // reads latest workOrder from ref

  const handleOpenClientUpdate = useCallback(async () => {
    try {
      if (!Number((workOrderFullRef.current as any)?.customerId || 0)) {
        triggerWarningBanner('Customer is missing', 'Select a customer before opening Update Client.');
        return;
      }
      let id = Number((workOrderFullRef.current as any)?.id || 0) || 0;
      if (!id) id = await handleSidebarForceSave();
      if (!id) {
        triggerWarningBanner('Save work order first', 'The update panel needs a saved work order number.');
        return;
      }
      setClientUpdateOpen(true);
    } catch (e) {
      console.error('Open Update Client failed', e);
      triggerWarningBanner('Could not open Update Client', 'Save the work order and try again.');
    }
  }, [handleSidebarForceSave]);

  const handleFormChange = useCallback((patch: Partial<WorkOrderFull>) => {
    setWo(w => ({ ...w, ...patch, items: w.items }));
  }, []);

  const handleItemsChange = useCallback((items: WorkOrderItemRow[]) => {
    setWo(w => ({ ...w, items }));
  }, []);

  useEffect(() => {
    const orderUrl = String((wo as any).partsOrderUrl || '').trim();
    const trackingUrl = String((wo as any).partsTrackingUrl || '').trim();
    setPartsOrderUrlDraft(orderUrl);
    setPartsTrackingUrlDraft(trackingUrl);
    setPartsOrderUrlEditing(!orderUrl);
    setPartsTrackingUrlEditing(!trackingUrl);
  }, [loaded, wo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (String((wo as any).partsOrderUrl || '').trim()) return;
    const sourceUrl = (wo.items || [])
      .map((item: any) => String(item?.orderSourceUrl || '').trim())
      .find(Boolean);
    if (!sourceUrl) return;
    const normalized = normalizeMaybeUrl(sourceUrl);
    setWo(w => ({ ...w, partsOrderUrl: normalized, partsOrdered: true }));
    setPartsOrderUrlDraft(normalized);
    setPartsOrderUrlEditing(false);
  }, [wo.items, (wo as any).partsOrderUrl]);

  const primaryPartsItem = useMemo(() => {
    const rows = Array.isArray(wo.items) ? wo.items : [];
    return rows.find((item: any) => String(item?.orderSourceUrl || '').trim())
      || rows.find((item: any) => Number(item?.parts || 0) > 0)
      || rows[0]
      || null;
  }, [wo.items]);

  const updatePrimaryPartsItem = useCallback((patch: Partial<WorkOrderItemRow>) => {
    setWo(w => {
      const items = Array.isArray(w.items) ? [...w.items] : [];
      let idx = items.findIndex((item: any) => item.id === (primaryPartsItem as any)?.id);
      if (idx < 0) idx = items.findIndex((item: any) => Number(item?.parts || 0) > 0);
      if (idx < 0) return w;
      items[idx] = { ...items[idx], ...patch };
      return { ...w, items };
    });
  }, [primaryPartsItem]);

  const scrapeAndApplyPartsUrl = useCallback(async (value: string) => {
    const orderUrl = normalizeMaybeUrl(value);
    if (!orderUrl) return null;
    if (lastPartsScrapeUrlRef.current === orderUrl) return partsUrlMeta;
    const sequence = ++partsScrapeSequenceRef.current;
    setPartsUrlScraping(true);
    try {
      const scraped = await scrapePartUrl(orderUrl);
      if (sequence !== partsScrapeSequenceRef.current) return null;
      const meta = { ...scraped, title: normalizePartInventoryTitle(scraped.title) };
      const vendor = meta.vendor || derivePartVendorFromUrl(orderUrl);
      lastPartsScrapeUrlRef.current = orderUrl;
      setPartsUrlMeta(meta);
      setWo(w => {
        const items = Array.isArray(w.items) ? [...w.items] : [];
        let idx = items.findIndex((item: any) => String(item?.orderSourceUrl || '').trim() === orderUrl);
        if (idx < 0) idx = items.findIndex((item: any) => Number(item?.parts || 0) > 0);
        if (idx < 0 && items.length) idx = 0;
        if (idx < 0 && (meta.title || typeof meta.price === 'number')) {
          const internalCost = typeof meta.price === 'number' ? meta.price : undefined;
          items.push({
            id: crypto.randomUUID(),
            device: String((w as any).productCategory || 'Other'),
            repairCategory: 'Repair',
            repair: meta.title || 'Repair Part',
            parts: internalCost == null ? 0 : (markedUpPartPrice(internalCost, DEFAULT_PART_MARKUP_PCT) || 0),
            labor: 0,
            status: 'pending',
            note: '',
            partSource: vendor,
            distributor: vendor,
            internalCost,
            markupPct: DEFAULT_PART_MARKUP_PCT,
            requiresOrder: true,
            orderStatus: 'needed',
            taxExempt: false,
            supplierTaxRate: 8,
            orderSourceUrl: orderUrl,
          });
          idx = items.length - 1;
        }
        if (idx >= 0) {
          const current: any = items[idx];
          const nextParts = typeof meta.price === 'number' && Number(current.parts || 0) <= 0
            ? (markedUpPartPrice(meta.price, DEFAULT_PART_MARKUP_PCT) ?? current.parts)
            : current.parts;
          items[idx] = {
            ...current,
            repair: meta.title || current.repair,
            parts: Number(nextParts || 0) || 0,
            partSource: current.partSource || vendor,
            distributor: current.distributor || vendor,
            internalCost: typeof meta.price === 'number' ? meta.price : current.internalCost,
            markupPct: current.markupPct ?? DEFAULT_PART_MARKUP_PCT,
            requiresOrder: true,
            orderStatus: current.orderStatus === 'ordered' || current.orderStatus === 'received' ? current.orderStatus : 'needed',
            taxExempt: current.taxExempt === true,
            supplierTaxRate: Number(current.supplierTaxRate ?? 8),
            orderSourceUrl: orderUrl,
          };
        }
        return {
          ...w,
          items,
          partsOrderUrl: orderUrl,
          partsOrdered: true,
        };
      });
      if (meta.ok) {
        triggerWarningBanner('Part URL scanned', meta.title || vendor || 'Part details were found.');
      } else if (meta.error) {
        triggerWarningBanner('URL saved', `Could not auto-fill details: ${meta.error}`);
      }
      return meta;
    } catch (error: any) {
      triggerWarningBanner('Could not scan part URL', error?.message || 'The URL was saved for ordering.');
      return null;
    } finally {
      if (sequence === partsScrapeSequenceRef.current) setPartsUrlScraping(false);
    }
  }, [partsUrlMeta]);

  const commitPartsOrderUrl = useCallback((value: string) => {
    const orderUrl = normalizeMaybeUrl(value);
    if (!orderUrl) return;
    setPartsOrderUrlDraft(orderUrl);
    setPartsOrderUrlEditing(false);
    setWo(w => ({
      ...w,
      partsOrderUrl: orderUrl,
      partsOrdered: true,
    }));
    void scrapeAndApplyPartsUrl(orderUrl);
  }, [scrapeAndApplyPartsUrl]);

  const commitPartsTrackingUrl = useCallback((value: string) => {
    const trackingUrl = normalizeMaybeUrl(value);
    if (!trackingUrl) return;
    setPartsTrackingUrlDraft(trackingUrl);
    setPartsTrackingUrlEditing(false);
    setWo(w => ({
      ...w,
      partsTrackingUrl: trackingUrl,
      partsOrdered: true,
    }));
  }, []);

  const handleSavePartsTracking = useCallback(() => {
    const orderUrl = normalizeMaybeUrl(partsOrderUrlDraft);
    const trackingUrl = normalizeMaybeUrl(partsTrackingUrlDraft);
    setWo(w => ({
      ...w,
      partsOrderUrl: orderUrl,
      partsTrackingUrl: trackingUrl,
      partsOrdered: Boolean(orderUrl || trackingUrl || (w as any).partsOrderDate || (w as any).partsEstDelivery),
    }));
    setPartsOrderUrlDraft(orderUrl);
    setPartsTrackingUrlDraft(trackingUrl);
    setPartsOrderUrlEditing(!orderUrl);
    setPartsTrackingUrlEditing(!trackingUrl);
  }, [partsOrderUrlDraft, partsTrackingUrlDraft]);

  const handleClearPartsTracking = useCallback(() => {
    lastPartsScrapeUrlRef.current = '';
    partsScrapeSequenceRef.current += 1;
    setPartsUrlMeta(null);
    setPartsUrlScraping(false);
    setPartsOrderUrlDraft('');
    setPartsTrackingUrlDraft('');
    setPartsOrderUrlEditing(true);
    setPartsTrackingUrlEditing(true);
    setWo(w => ({
      ...w,
      partsOrdered: false,
      partsOrderDate: null,
      partsEstDelivery: null,
      partsOrderUrl: '',
      partsTrackingUrl: '',
      partsDates: '',
    }));
  }, []);

  const handleOpenOrderUrl = useCallback(async () => {
    const url = normalizeMaybeUrl((wo as any).partsOrderUrl || partsOrderUrlDraft);
    if (!url) return;
    try {
      if ((window as any).api?.openUrl) await (window as any).api.openUrl(url);
      else if ((window as any).api?.openExternal) await (window as any).api.openExternal(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {}
  }, [wo, partsOrderUrlDraft]);

  const handleOpenTrackingUrl = useCallback(async () => {
    const url = normalizeMaybeUrl((wo as any).partsTrackingUrl || partsTrackingUrlDraft);
    if (!url) return;
    try {
      if ((window as any).api?.openUrl) await (window as any).api.openUrl(url);
      else if ((window as any).api?.openExternal) await (window as any).api.openExternal(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {}
  }, [wo, partsTrackingUrlDraft]);

  const buildPartOrderingContext = useCallback(() => {
    const item: any = primaryPartsItem || {};
    const orderUrl = normalizeMaybeUrl((wo as any).partsOrderUrl || partsOrderUrlDraft || item.orderSourceUrl);
    const vendor = item.partSource || partsUrlMeta?.vendor || derivePartVendorFromUrl(orderUrl);
    const title = String(partsUrlMeta?.title || item.repair || (wo as any).productDescription || 'Repair Part').trim();
    const device = String(item.device || (wo as any).productCategory || (wo as any).productDescription || 'Other').trim() || 'Other';
    const repairCategory = String(item.repairCategory || 'Repair').trim() || 'Repair';
    const internalCost = typeof item.internalCost === 'number'
      ? item.internalCost
      : (typeof partsUrlMeta?.price === 'number' ? partsUrlMeta.price : undefined);
    const partCost = Number(item.parts || 0) > 0
      ? Number(item.parts || 0)
      : (internalCost != null ? (markedUpPartPrice(internalCost, DEFAULT_PART_MARKUP_PCT) || 0) : 0);
    const laborCost = Number(item.labor || 0) || 0;
    return { item, orderUrl, vendor, title, device, repairCategory, internalCost, partCost, laborCost };
  }, [partsOrderUrlDraft, partsUrlMeta, primaryPartsItem, wo]);

  const handleSavePartSource = useCallback(async (opts?: { silent?: boolean }) => {
    const api: any = (window as any).api;
    const ctx = buildPartOrderingContext();
    if (!ctx.orderUrl) {
      if (!opts?.silent) triggerWarningBanner('Order URL is missing', 'Paste the distributor URL before saving this part.');
      return null;
    }
    if (!ctx.title) {
      if (!opts?.silent) triggerWarningBanner('Part title is missing', 'Enter or scrape the part title first.');
      return null;
    }
    setPartsSaveBusy('part');
    try {
      let current = await api?.dbGet?.('products').catch(() => []);
      if (!Array.isArray(current)) current = [];
      const normalizedUrl = normalizeMaybeUrl(ctx.orderUrl);
      const existing = current.find((row: any) => {
        const rowUrl = normalizeMaybeUrl(row?.reorderUrlTemplate);
        return (rowUrl && rowUrl === normalizedUrl)
          || (String(row?.itemDescription || '').trim().toLowerCase() === ctx.title.toLowerCase()
            && String(row?.distributor || '').trim().toLowerCase() === String(ctx.vendor || '').trim().toLowerCase());
      });
      const now = new Date().toISOString();
      const payload: any = {
        ...(existing || {}),
        itemDescription: ctx.title,
        itemType: 'Part',
        category: ctx.device,
        associatedDevices: Array.from(new Set([ctx.device].filter(Boolean))),
        partCategory: ctx.repairCategory,
        condition: 'New',
        price: ctx.partCost,
        internalCost: ctx.internalCost,
        markupPct: DEFAULT_PART_MARKUP_PCT,
        distributor: ctx.vendor || '',
        reorderQty: 1,
        reorderUrlTemplate: normalizedUrl,
        trackStock: true,
        stockCount: Number(existing?.stockCount ?? 0) || 0,
        lowStockThreshold: Number(existing?.lowStockThreshold ?? 1) || 1,
        updatedAt: now,
      };
      const saved = existing?.id
        ? (api?.update ? await api.update('products', payload) : await api?.dbUpdate?.('products', existing.id, payload))
        : await api?.dbAdd?.('products', { ...payload, createdAt: now });
      if (!opts?.silent) triggerWarningBanner('Part saved', `${ctx.title} is now saved in Inventory.`);
      return saved || payload;
    } catch (error) {
      console.error('Save part source failed', error);
      if (!opts?.silent) triggerWarningBanner('Part could not be saved', 'See console for details.');
      return null;
    } finally {
      setPartsSaveBusy(null);
    }
  }, [buildPartOrderingContext]);

  const handleSaveRepairTemplate = useCallback(async () => {
    const api: any = (window as any).api;
    const ctx = buildPartOrderingContext();
    if (!ctx.title || !ctx.repairCategory) {
      triggerWarningBanner('Repair details missing', 'Add a repair line item before saving the repair template.');
      return;
    }
    setPartsSaveBusy('repair');
    try {
      await handleSavePartSource({ silent: true });
      let rows = await api?.dbGet?.('repairCategories').catch(() => []);
      if (!Array.isArray(rows)) rows = [];
      const existing = rows.find((row: any) =>
        String(row?.category || '').trim().toLowerCase() === ctx.device.toLowerCase()
        && String(row?.repairCategory || '').trim().toLowerCase() === ctx.repairCategory.toLowerCase()
        && String(row?.title || '').trim().toLowerCase() === ctx.title.toLowerCase()
      );
      const payload: any = {
        ...(existing || {}),
        category: ctx.device,
        repairCategory: ctx.repairCategory,
        title: ctx.title,
        altDescription: ctx.item?.repair || ctx.title,
        partCost: ctx.partCost,
        laborCost: ctx.laborCost,
        internalCost: ctx.internalCost,
        markupPct: DEFAULT_PART_MARKUP_PCT,
        partSource: ctx.vendor || '',
        orderSourceUrl: ctx.orderUrl,
        type: 'service',
        model: ctx.item?.note || '',
      };
      const saved = existing?.id
        ? (api?.update ? await api.update('repairCategories', payload) : await api?.dbUpdate?.('repairCategories', existing.id, payload))
        : await api?.dbAdd?.('repairCategories', { ...payload, id: crypto.randomUUID() });
      triggerWarningBanner('Repair saved', `${ctx.title} is now available in Devices/Repairs.`);
      return saved || payload;
    } catch (error) {
      console.error('Save repair template failed', error);
      triggerWarningBanner('Repair could not be saved', 'See console for details.');
      return null;
    } finally {
      setPartsSaveBusy(null);
    }
  }, [buildPartOrderingContext, handleSavePartSource]);

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
      if (!picked.inventoryProductId || String(picked.itemType || 'Product') !== 'Product') {
        triggerWarningBanner('Select a saved product', 'Choose a Product listing from Inventory before adding it.');
        return;
      }
      if (!String(picked.itemDescription || '').trim()) {
        triggerWarningBanner('Product name is missing', 'Choose a product with a saved item description.');
        return;
      }

      const row: SaleItemRow = {
        id: crypto.randomUUID(),
        inventoryProductId: Number(picked.inventoryProductId),
        description: String(picked.itemDescription || picked.title || picked.name || 'Item'),
        qty: Number(picked.quantity ?? 1) || 1,
        price: Number(picked.price ?? 0) || 0,
        consultationHours: typeof picked.consultationHours === 'number' ? picked.consultationHours : undefined,
        internalCost: typeof picked.internalCost === 'number' ? picked.internalCost : undefined,
        condition: picked.condition || 'New',
        inStock: picked.inStock == null ? true : !!picked.inStock,
        productUrl: picked.productUrl || picked.url || picked.link || '',
        category: picked.category,
        distributor: picked.distributor || '',
        vendorRelationship: picked.vendorRelationship,
        vendorSharePct: typeof picked.vendorSharePct === 'number' ? picked.vendorSharePct : undefined,
        vendorTaxExempt: !!picked.vendorTaxExempt,
        trackStock: !!picked.trackStock,
        stockCountAtSelection: typeof picked.stockCount === 'number' ? picked.stockCount : undefined,
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
      if (existingItems.length >= ADDON_SALE_MAX_ITEMS) {
        triggerWarningBanner('Product limit reached', `This linked sale already has ${ADDON_SALE_MAX_ITEMS} items.`);
        return;
      }
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
      if (!newSaleId) throw new Error('The linked sale did not return an invoice number.');
      const linkedWorkOrder = { ...(woRef.current || wo), addonSaleId: newSaleId, updatedAt: nowIso };
      let savedWorkOrder: any = null;
      if (typeof api.update === 'function') savedWorkOrder = await api.update('workOrders', linkedWorkOrder);
      else if (typeof api.dbUpdate === 'function') savedWorkOrder = await api.dbUpdate('workOrders', workOrderId, linkedWorkOrder);
      applySavedCustomerSnapshot(savedWorkOrder || linkedWorkOrder);
      setAddonSale(savedSale || { ...baseRecord, id: newSaleId });
      triggerWarningBanner('Product added', `Attached to Sale #${newSaleId} and linked to this work order.`);
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

        // Always show the parts/labor split.
        // If a retail add-on sale is linked, treat its remaining balance as Parts for checkout allocation.
        {
          const partCosts = Number(wo.partCosts || 0) || 0;
          const laborCost = Number(wo.laborCost || 0) || 0;
          const discount = Number(wo.discount || 0) || 0;
          const taxRate = Number(wo.taxRate || 0) || 0;
          const laborAfterDiscount = Math.max(0, laborCost - discount);
          const partsWithTax = round2(partCosts + (partCosts * taxRate / 100));

          // Work Order buckets should never exceed the Work Order's own remaining balance.
          const woPartsDue = Math.min(partsWithTax, woRemaining);
          const woLaborDue = Math.min(laborAfterDiscount, woRemaining);

          checkoutPayload.partsDue = round2(woPartsDue + Math.max(0, addonRemaining));
          checkoutPayload.laborDue = round2(woLaborDue);
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

        const partsDue = Number(checkoutPayload.partsDue || 0) || 0;
        const laborDue = Number(checkoutPayload.laborDue || 0) || 0;
        let remainingCombinedParts = partsDue;
        let remainingSaleParts = (addonSaleRecord && addonRemaining > 0.009) ? addonRemaining : 0;
        let remainingWoParts = Math.max(0, round2(partsDue - remainingSaleParts));
        let remainingWoLabor = laborDue;

        normalizedLines.forEach((p: any) => {
          const pt = String(p?.paymentType || '');
          const isCash = pt.toLowerCase().includes('cash');
          const lineApplied = round2(Number(p?.applied || 0) || 0);
          if (!(lineApplied > 0)) return;

          const tendered = Number(p?.tendered ?? p?.amount ?? lineApplied);
          const change = Number(p?.change ?? 0);

          // Split this payment line into Parts vs Labor based on the checkout selection.
          let lineParts = 0;
          let lineLabor = 0;
          if (result?.payFor === 'parts') {
            lineParts = lineApplied;
            lineLabor = 0;
          } else if (result?.payFor === 'labor') {
            lineParts = 0;
            lineLabor = lineApplied;
          } else if (result?.payFor) {
            const pAmt = round2(Math.min(lineApplied, Math.max(0, remainingCombinedParts)));
            const lAmt = round2(Math.max(0, lineApplied - pAmt));
            remainingCombinedParts = round2(Math.max(0, remainingCombinedParts - pAmt));
            lineParts = pAmt;
            lineLabor = lAmt;
          } else {
            // No split selection available — treat as a Work Order payment.
            lineParts = 0;
            lineLabor = lineApplied;
          }

          // Allocate Parts: retail add-on Sale first, then Work Order parts.
          const partsToSale = remainingSaleParts > 0
            ? round2(Math.min(lineParts, Math.max(0, remainingSaleParts)))
            : 0;
          remainingSaleParts = round2(Math.max(0, remainingSaleParts - partsToSale));

          let partsToWo = round2(Math.max(0, lineParts - partsToSale));
          const cappedWoParts = round2(Math.min(partsToWo, Math.max(0, remainingWoParts)));
          remainingWoParts = round2(Math.max(0, remainingWoParts - cappedWoParts));
          partsToWo = cappedWoParts;

          let laborToWo = round2(Math.max(0, lineLabor));
          const cappedWoLabor = round2(Math.min(laborToWo, Math.max(0, remainingWoLabor)));
          remainingWoLabor = round2(Math.max(0, remainingWoLabor - cappedWoLabor));
          laborToWo = cappedWoLabor;

          const appliedToWo = round2(partsToWo + laborToWo);
          const appliedToAddon = round2(partsToSale);
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

            if (result?.payFor) {
              entry.payFor = result.payFor;
              entry.appliedParts = partsToWo;
              entry.appliedLabor = laborToWo;
            }

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

        const nextWo = await enrichWorkOrderCustomer({
          ...wo,
          amountPaid: newAmountPaid,
          paymentType: result.paymentType,
          payments,
          status,
          checkoutDate,
          items: updatedItems,
          totals: updatedTotals,
        });

        setWo(() => nextWo);

        // Persist the work order. If it's brand-new (id=0) we create it here so the
        // receipt can include a real QR-code URL. If already saved, update it.
        let effectiveId = Number((wo as any).id || 0) || 0;
        if (effectiveId > 0) {
          try {
            const savedWo = await api.update('workOrders', { ...nextWo });
            applySavedCustomerSnapshot(savedWo || nextWo);
          } catch (e) {
            console.error('Failed persisting checkout update', e);
          }
        } else {
          // Brand-new work order — save it now so we have a real ID for the receipt QR
          try {
            const added = typeof api.addWorkOrder === 'function'
              ? await api.addWorkOrder({ ...nextWo })
              : await api.dbAdd('workOrders', { ...nextWo });
            if (added?.id) {
              effectiveId = Number(added.id) || 0;
              // Sync state so autosave won't create a duplicate
              applySavedCustomerSnapshot({ ...nextWo, ...added, id: effectiveId });
            }
          } catch (e) {
            console.error('Failed creating work order on checkout', e);
          }
        }

        if (result.printReceipt) {
          try {
            let customerName = (nextWo as any).customerName || (wo as any).customerName || '';
            let customerPhone = (nextWo as any).customerPhone || (wo as any).customerPhone || '';
            let customerPhoneAlt = (nextWo as any).customerPhoneAlt || '';
            let customerEmail = (nextWo as any).customerEmail || (wo as any).customerEmail || '';
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
              id: effectiveId || (wo as any).id,
              customerId: (nextWo as any).customerId || (wo as any).customerId,
              customerName,
              customerPhone,
              customerPhoneAlt,
              customerEmail,
              paymentType: (nextWo as any).paymentType ?? (wo as any).paymentType,
              payments: (nextWo as any).payments ?? (wo as any).payments ?? [],
              addonSaleId: addonSale?.id ?? (nextWo as any).addonSaleId ?? (wo as any).addonSaleId ?? null,
              addonSale: addonSale || null,
              productCategory: (nextWo as any).productCategory ?? wo.productCategory,
              productDescription: (nextWo as any).productDescription ?? wo.productDescription,
              model: (nextWo as any).model ?? (wo as any).model,
              serial: (nextWo as any).serial ?? (wo as any).serial,
              password: (nextWo as any).password ?? (wo as any).password ?? '',
              patternSequence: Array.isArray((nextWo as any).patternSequence)
                ? (nextWo as any).patternSequence
                : (Array.isArray((wo as any).patternSequence) ? (wo as any).patternSequence : []),
              problemInfo: (nextWo as any).problemInfo ?? wo.problemInfo,
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
  const partsSourceSummary = useMemo(() => {
    const rows = (wo.items || []).filter((item: any) => item?.partSource || item?.orderSourceUrl);
    if (!rows.length) return '';
    const sourceNames = Array.from(new Set(
      rows
        .map((item: any) => String(item?.partSource || '').trim())
        .filter(Boolean),
    ));
    if (sourceNames.length) return sourceNames.slice(0, 2).join(', ');
    return `${rows.length} repair ${rows.length === 1 ? 'item' : 'items'} with saved order info`;
  }, [wo.items]);

  if (!loaded) {
    return <div className="p-4 text-zinc-200">Loading work order...</div>;
  }

  const saveDisabled = false;

  return (
    <div className="gb-wo-window h-screen overflow-hidden p-3 bg-zinc-900 text-zinc-200">
      {warningBanner && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(640px,calc(100%-48px))] transition-opacity duration-300 pointer-events-none ${warningBannerVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="bg-amber-400 text-zinc-900 px-4 py-3 rounded shadow-lg border border-amber-300">
            <div className="text-sm font-semibold">{warningBanner.message}</div>
            {warningBanner.details ? <div className="text-xs mt-1 leading-snug opacity-80">{warningBanner.details}</div> : null}
          </div>
        </div>
      )}
      {clientUpdateOpen ? (
        <ClientUpdatePanel
          embedded
          recordType="repair"
          recordId={Number((workOrderFull as any).id || 0) || undefined}
          initialRecord={workOrderFull}
          initialCustomer={undefined}
          onClose={() => setClientUpdateOpen(false)}
          onUpdated={(updated) => {
            if (updated) {
              setWo(w => ({ ...w, ...updated, items: w.items }));
            }
          }}
        />
      ) : null}
      <div className="gb-wo-layout grid h-full" style={{ gridTemplateColumns: '220px 1fr 320px', columnGap: 12, rowGap: 8 }}>
        <WorkOrderSidebar
          workOrder={workOrderFull}
          onChange={handleSidebarChange}
          hideStatus={isMobileRuntime}
          hideDates={isMobileRuntime}
          hideAssigned={isMobileRuntime}
          validationFlags={sidebarValidationFlags}
          onRequestForceSave={handleSidebarForceSave}
          footerActions={isMobileRuntime ? (
            <button
              type="button"
              className="gb-wo-mobile-checkout-button w-full px-3 py-2 bg-neon-green text-zinc-900 font-semibold rounded"
              onClick={handleCheckout}
            >
              Checkout
            </button>
          ) : undefined}
        />
        <div className="gb-wo-main-scroll flex flex-col gap-2 col-span-1 pb-16 min-h-0 overflow-auto">
          <div className="gb-wo-top-card bg-zinc-900 border border-zinc-700 rounded p-2">
            {isMobileRuntime ? (
              <>
                <WorkOrderMobileTitleCard
                  workOrder={workOrderFull}
                  customerSummary={customerSummary}
                  onChange={handleIntakeChange}
                  onUpdateClient={handleOpenClientUpdate}
                  detailsMenu={(
                    <WorkOrderDetailsMenu
                      open={detailsMenuOpen}
                      workOrder={workOrderFull}
                      onToggle={() => setDetailsMenuOpen(open => !open)}
                      onClose={() => setDetailsMenuOpen(false)}
                      onChange={handleSidebarChange}
                    />
                  )}
                />
                <div className="gb-wo-top-row">
                  <AssignedTechnicianField
                    value={workOrderFull.assignedTo}
                    invalid={!!sidebarValidationFlags?.assignedTo}
                    onChange={assignedTo => handleSidebarChange({ assignedTo })}
                  />
                  <div className="gb-wo-desktop-details-menu">
                    <WorkOrderDetailsMenu
                      open={detailsMenuOpen}
                      workOrder={workOrderFull}
                      onToggle={() => setDetailsMenuOpen(open => !open)}
                      onClose={() => setDetailsMenuOpen(false)}
                      onChange={handleSidebarChange}
                    />
                  </div>
                </div>
              </>
            ) : null}
            <div className={`flex items-center justify-between ${isMobileRuntime ? 'mt-3' : ''}`}>
              <div className="text-sm font-semibold text-zinc-200">Work Order Type</div>
              <div className="text-xs text-zinc-500">Switching types can clear fields</div>
            </div>
            <div className={isMobileRuntime ? 'gb-wo-type-grid mt-2' : 'flex gap-2 mt-2'}>
              <button
                type="button"
                className={`${isMobileRuntime ? 'gb-wo-type-button ' : ''}px-3 py-1.5 rounded border text-sm ${!isCustomBuild && !isDrone ? 'bg-neon-green text-zinc-900 border-transparent' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}
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
                type="button"
                className={`${isMobileRuntime ? 'gb-wo-type-button ' : ''}px-3 py-1.5 rounded border text-sm ${isCustomBuild ? 'bg-neon-green text-zinc-900 border-transparent' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}
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
                type="button"
                className={`${isMobileRuntime ? 'gb-wo-type-button ' : ''}px-3 py-1.5 rounded border text-sm ${isDrone ? 'bg-neon-green text-zinc-900 border-transparent' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}
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
          <div className="gb-wo-parts-card bg-zinc-900 border border-zinc-700 rounded p-3">
            <div className="gb-wo-parts-header">
              <div>
                <h4 className="text-sm font-semibold text-zinc-200">Parts tracking</h4>
                <div className="text-[11px] text-zinc-500">Internal ordering details, not shown on printouts</div>
              </div>
              {partsSourceSummary ? (
                <div className="gb-wo-parts-source-pill" title={partsSourceSummary}>
                  {partsSourceSummary}
                </div>
              ) : null}
            </div>
            {(partsUrlMeta?.title || partsUrlMeta?.price || primaryPartsItem) ? (
              <div className="gb-wo-parts-meta-row">
                <div className="gb-wo-parts-meta-main" title={partsUrlMeta?.title || primaryPartsItem?.repair || ''}>
                  {partsUrlMeta?.title || primaryPartsItem?.repair || 'No part selected'}
                </div>
                <div className="gb-wo-parts-meta-sub">
                  {partsUrlMeta?.price != null ? `Internal $${partsUrlMeta.price.toFixed(2)}` : 'Internal cost not scanned'}
                  {primaryPartsItem?.parts != null ? ` • Sold $${Number(primaryPartsItem.parts || 0).toFixed(2)}` : ''}
                  {primaryPartsItem?.labor != null ? ` • Labor $${Number(primaryPartsItem.labor || 0).toFixed(2)}` : ''}
                </div>
              </div>
            ) : null}
            {primaryPartsItem ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <label className="text-xs text-zinc-400">Internal cost
                  <input type="number" min="0" step="0.01" className="gb-wo-parts-control mt-1"
                    value={primaryPartsItem.internalCost ?? ''}
                    onChange={e => {
                      const internalCost = e.target.value === '' ? undefined : Number(e.target.value);
                      const parts = internalCost == null ? primaryPartsItem.parts : markedUpPartPrice(internalCost, primaryPartsItem.markupPct ?? DEFAULT_PART_MARKUP_PCT);
                      updatePrimaryPartsItem({ internalCost, ...(parts == null ? {} : { parts }) });
                    }} />
                </label>
                <label className="text-xs text-zinc-400">Markup %
                  <input type="number" min="0" step="1" list="part-markup-presets" className="gb-wo-parts-control mt-1"
                    value={primaryPartsItem.markupPct ?? DEFAULT_PART_MARKUP_PCT}
                    onChange={e => {
                      const markupPct = Number(e.target.value || 0);
                      const parts = markedUpPartPrice(primaryPartsItem.internalCost, markupPct);
                      updatePrimaryPartsItem({ markupPct, ...(parts == null ? {} : { parts }) });
                    }} />
                  <datalist id="part-markup-presets">{PART_MARKUP_PRESETS.map(value => <option key={value} value={value} />)}</datalist>
                </label>
                <label className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm">
                  <input type="checkbox" checked={primaryPartsItem.requiresOrder !== false}
                    onChange={e => updatePrimaryPartsItem({ requiresOrder: e.target.checked, orderStatus: e.target.checked ? 'needed' : 'in_stock' })} />
                  Order required
                </label>
                <label className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm">
                  <input type="checkbox" checked={primaryPartsItem.taxExempt === true}
                    onChange={e => updatePrimaryPartsItem({ taxExempt: e.target.checked, supplierTaxRate: 8 })} />
                  Tax Exempt
                </label>
              </div>
            ) : null}
            <div className="gb-wo-parts-grid">
              <div className="gb-wo-parts-date-field">
                <label className="block text-xs text-zinc-400">Order date</label>
                <input
                  type="date"
                  className="gb-wo-parts-control"
                  value={(wo as any).partsOrderDate ? String((wo as any).partsOrderDate).substring(0, 10) : ''}
                  onChange={e => setWo(w => ({ ...w, partsOrderDate: e.target.value || null, partsOrdered: Boolean(e.target.value || (w as any).partsEstDelivery || (w as any).partsOrderUrl || (w as any).partsTrackingUrl) }))}
                />
              </div>
              <div className="gb-wo-parts-date-field">
                <label className="block text-xs text-zinc-400">Est. delivery</label>
                <input
                  type="date"
                  className="gb-wo-parts-control"
                  value={(wo as any).partsEstDelivery ? String((wo as any).partsEstDelivery).substring(0, 10) : ''}
                  onChange={e => setWo(w => ({ ...w, partsEstDelivery: e.target.value || null, partsOrdered: Boolean((w as any).partsOrderDate || e.target.value || (w as any).partsOrderUrl || (w as any).partsTrackingUrl) }))}
                />
              </div>
              <div className="gb-wo-parts-url-field">
                <label className="block text-xs text-zinc-400">Order URL</label>
                {String((wo as any).partsOrderUrl || '').trim() && !partsOrderUrlEditing ? (
                  <div className="gb-wo-parts-button-row">
                    <button
                      type="button"
                      className="gb-wo-parts-link-button"
                      onClick={handleOpenOrderUrl}
                      title={String((wo as any).partsOrderUrl || '')}
                    >
                      Order URL
                    </button>
                    <button
                      type="button"
                      className="gb-wo-parts-secondary-button"
                      onClick={() => setPartsOrderUrlEditing(true)}
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <input
                    type="url"
                    className="gb-wo-parts-control"
                    placeholder="https://..."
                    value={partsOrderUrlDraft}
                    onChange={e => setPartsOrderUrlDraft(e.target.value)}
                    onPaste={e => {
                      const pasted = e.clipboardData.getData('text');
                      window.setTimeout(() => commitPartsOrderUrl(pasted || partsOrderUrlDraft), 0);
                    }}
                    onBlur={() => commitPartsOrderUrl(partsOrderUrlDraft)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitPartsOrderUrl(partsOrderUrlDraft);
                      }
                    }}
                  />
                )}
              </div>
              <div className="gb-wo-parts-url-field">
                <label className="block text-xs text-zinc-400">Tracking URL</label>
                {String((wo as any).partsTrackingUrl || '').trim() && !partsTrackingUrlEditing ? (
                  <div className="gb-wo-parts-button-row">
                    <button
                      type="button"
                      className="gb-wo-parts-link-button gb-wo-parts-tracking-button"
                      onClick={handleOpenTrackingUrl}
                      title={String((wo as any).partsTrackingUrl || '')}
                    >
                      Tracking URL
                    </button>
                    <button
                      type="button"
                      className="gb-wo-parts-secondary-button"
                      onClick={() => setPartsTrackingUrlEditing(true)}
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <input
                    type="url"
                    className="gb-wo-parts-control"
                    placeholder="https://..."
                    value={partsTrackingUrlDraft}
                    onChange={e => setPartsTrackingUrlDraft(e.target.value)}
                    onPaste={e => {
                      const pasted = e.clipboardData.getData('text');
                      window.setTimeout(() => commitPartsTrackingUrl(pasted || partsTrackingUrlDraft), 0);
                    }}
                    onBlur={() => commitPartsTrackingUrl(partsTrackingUrlDraft)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitPartsTrackingUrl(partsTrackingUrlDraft);
                      }
                    }}
                  />
                )}
              </div>
              <div className="gb-wo-parts-notes-field">
                <label className="block text-xs text-zinc-400">Order notes</label>
                <input
                  className="gb-wo-parts-control"
                  placeholder="e.g. Ordered 10/04, ETA 10/10"
                  value={(wo as any).partsDates || ''}
                  onChange={e => setWo(w => ({ ...w, partsDates: e.target.value }))}
                />
              </div>
              <div className="gb-wo-parts-actions">
                <button
                  type="button"
                  className="gb-wo-parts-secondary-button gb-wo-parts-clear-button"
                  onClick={handleClearPartsTracking}
                >
                  Clear
                </button>
                {partsUrlScraping ? <span className="gb-wo-parts-scan-status" role="status">Reading part details...</span> : null}
                <button
                  type="button"
                  className="gb-wo-parts-secondary-button gb-wo-parts-save-part-button"
                  disabled={partsSaveBusy !== null || !String((wo as any).partsOrderUrl || partsOrderUrlDraft || '').trim()}
                  onClick={() => { void handleSavePartSource(); }}
                >
                  {partsSaveBusy === 'part' ? 'Saving...' : 'Save Part'}
                </button>
                <button
                  type="button"
                  className="gb-wo-parts-secondary-button gb-wo-parts-save-repair-button"
                  disabled={partsSaveBusy !== null || !primaryPartsItem}
                  onClick={() => { void handleSaveRepairTemplate(); }}
                >
                  {partsSaveBusy === 'repair' ? 'Saving...' : 'Save Repair'}
                </button>
                <button
                  type="button"
                  className="gb-wo-parts-save-button"
                  onClick={handleSavePartsTracking}
                >
                  Save Tracking
                </button>
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
        <div className="gb-wo-payment-scroll flex flex-col gap-3 min-h-0 overflow-auto">
          <IntakePanel workOrder={workOrderFull} customerSummary={customerSummary} onChange={handleIntakeChange} />
          {!isMobileRuntime ? (
            <button
              type="button"
              className="gb-wo-update-client-button"
              onClick={handleOpenClientUpdate}
            >
              Update Client
            </button>
          ) : null}
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

