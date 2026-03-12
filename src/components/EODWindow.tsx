import React, { useEffect, useMemo, useState } from 'react';
import { computeTotals } from '../lib/calc';
import { useAutosave } from '../lib/useAutosave';
import { listTechnicians } from '../lib/admin';

type RangeKey = 'today' | 'yesterday' | 'last7' | 'custom';

interface EodSettings {
  id?: number;
  recipients: string;
  subject?: string;
  includeWorkOrders: boolean;
  includeSales: boolean;
  includeOutstanding: boolean;
  includePayments: boolean;
  includeCounts: boolean;
  includeBatchInfo: boolean;
  schedule: 'manual' | 'daily' | 'weekly';
  sendTime: string; // HH:mm
  batchOutTime?: string; // HH:mm
  autoBackup?: boolean;
  emailBody?: string;
  lastSentAt?: string | null;
}

const defaultSettings: EodSettings = {
  recipients: '',
  subject: 'Daily batch report',
  includeWorkOrders: true,
  includeSales: true,
  includeOutstanding: true,
  includePayments: true,
  includeCounts: true,
  includeBatchInfo: true,
  schedule: 'daily',
  sendTime: '18:00',
  batchOutTime: '21:00',
  autoBackup: true,
  emailBody: '',
  lastSentAt: null,
};

function formatCurrency(n: number) {
  if (!Number.isFinite(n)) return '$0.00';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(input: string | Date | null | undefined) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeSaleItems(sale: any): Array<{ description: string; qty: number; price: number; category?: string }> {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  if (items.length) {
    return items.map((it: any) => ({
      description: (it?.description || it?.name || it?.title || '').toString(),
      qty: Number(it?.qty ?? it?.quantity ?? 1) || 1,
      price: Number(it?.price ?? it?.unitPrice ?? 0) || 0,
      category: it?.category,
    }));
  }
  const desc = (sale?.itemDescription || sale?.description || '').toString();
  const qty = Number(sale?.quantity ?? 1) || 1;
  const price = Number(sale?.price ?? 0) || 0;
  if (!desc && !(qty || price)) return [];
  return [{ description: desc, qty, price, category: sale?.category }];
}

function normalizeCategory(cat: any): string {
  const s = (cat == null ? '' : String(cat)).trim();
  if (!s) return 'Uncategorized';
  const lower = s.toLowerCase();
  if (lower === 'consultation' || lower.startsWith('consult')) return 'Consultation';
  if (lower === 'device') return 'Device';
  if (lower === 'accessory') return 'Accessory';
  if (lower === 'other') return 'Other';
  return s;
}

function normalizeTechKey(v: any) {
  return (v == null ? '' : String(v)).trim().toLowerCase();
}

function isConsultationCategory(cat: any) {
  return normalizeCategory(cat).toLowerCase() === 'consultation';
}

function saleGross(items: Array<{ qty: number; price: number }>) {
  return items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
}

function computeSaleBreakdown(sale: any, commissionRate: number) {
  const items = normalizeSaleItems(sale);
  const discount = Math.max(0, Number(sale?.discount || 0) || 0);
  const gross = saleGross(items);
  const net = Math.max(0, gross - discount);

  const byCategoryGross = new Map<string, number>();
  const byCategoryNet = new Map<string, number>();

  for (const it of items) {
    const cat = normalizeCategory(it.category);
    const line = (Number(it.qty) || 0) * (Number(it.price) || 0);
    if (!Number.isFinite(line) || line === 0) continue;
    byCategoryGross.set(cat, (byCategoryGross.get(cat) || 0) + line);
  }

  // Allocate discount proportionally across categories (so mixed tickets behave well).
  const denom = gross > 0 ? gross : 0;
  for (const [cat, catGross] of byCategoryGross.entries()) {
    const share = denom > 0 ? (catGross / denom) : 0;
    const catNet = Math.max(0, catGross - discount * share);
    byCategoryNet.set(cat, catNet);
  }

  const consultationNet = Array.from(byCategoryNet.entries()).reduce((sum, [cat, amt]) => (isConsultationCategory(cat) ? sum + amt : sum), 0);
  const commissionableNet = Math.max(0, net - consultationNet);
  const commission = round2(commissionableNet * commissionRate);

  return {
    items,
    gross: round2(gross),
    net: round2(net),
    discount: round2(discount),
    byCategoryGross,
    byCategoryNet,
    consultationNet: round2(consultationNet),
    commissionableNet: round2(commissionableNet),
    commission,
  };
}

function renderTemplate(template: string, data: Record<string, string>) {
  return (template || '').replace(/\{\{(.*?)\}\}/g, (_m, key) => data[key.trim()] ?? '');
}

function rangeLabel(range: RangeKey, start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString(undefined, opts);
  const endStr = end.toLocaleDateString(undefined, opts);
  if (start.toDateString() === end.toDateString()) return startStr;
  return `${startStr} - ${endStr}`;
}

function resolveRange(range: RangeKey, customFrom: string, customTo: string) {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    start = new Date(y.setHours(0, 0, 0, 0));
    end = new Date(y.setHours(23, 59, 59, 999));
  } else if (range === 'last7') {
    const s = new Date(now);
    s.setDate(s.getDate() - 6);
    start = new Date(s.setHours(0, 0, 0, 0));
    end.setHours(23, 59, 59, 999);
  } else if (range === 'custom') {
    const s = customFrom ? new Date(customFrom) : now;
    const e = customTo ? new Date(customTo) : s;
    start = new Date(s.setHours(0, 0, 0, 0));
    end = new Date(e.setHours(23, 59, 59, 999));
  }

  return { start, end };
}

const DATE_KEYS = [
  'completedAt', 'completedDate', 'completed_on',
  'closedAt', 'closedDate', 'closed_on',
  'finishedAt', 'finishedDate',
  'checkInAt',
  'checkoutDate',
  'repairCompletionDate',
  'clientPickupDate',
  'invoiceDate', 'invoice_date', 'saleDate', 'sale_date', 'transactionDate', 'transaction_date',
  'date', 'dateCreated', 'date_created', 'created', 'createdAt', 'createdDate', 'created_at', 'created_on',
  'updatedAt', 'updatedDate', 'updated_at',
  'timestamp', 'time', 'openedAt', 'openedDate'
];

function parseDateValue(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const normalized = value > 1e12 ? value : value * 1000;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function extractRecordDate(record: any): Date | null {
  if (!record || typeof record !== 'object') return null;
  for (const key of DATE_KEYS) {
    const date = parseDateValue((record as any)[key]);
    if (date) return date;
  }
  return null;
}

function readNumber(record: any, key: string): number | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const raw = (record as any)[key];
  if (raw === null || raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function resolveTotals(record: any) {
  const totalFields = ['total', 'grandTotal', 'invoiceTotal', 'totalAmount', 'amountTotal', 'totalDue', 'total_due', 'amountDue', 'amount_due', 'balanceDue', 'balance_due', 'balance'];
  const paidFields = ['amountPaid', 'paid', 'totalPaid', 'paidAmount', 'paid_amount', 'collected', 'amountCollected'];
  const remainingFields = ['remaining', 'balance', 'balanceDue', 'balance_due', 'amountDue', 'amount_due', 'due', 'totalDue', 'total_due'];

  let total = totalFields.map(key => readNumber(record, key)).find(val => val !== undefined);
  let paid = paidFields.map(key => readNumber(record, key)).find(val => val !== undefined);
  let remaining = remainingFields.map(key => readNumber(record, key)).find(val => val !== undefined);

  if (total === undefined) {
    const subTotal = ['subTotal', 'subtotal', 'sub_total'].map(key => readNumber(record, key)).find(val => val !== undefined) ?? 0;
    const tax = ['taxTotal', 'tax', 'tax_amount'].map(key => readNumber(record, key)).find(val => val !== undefined) ?? 0;
    if (subTotal || tax) {
      total = subTotal + tax;
    } else {
      const labor = readNumber(record, 'laborCost') ?? readNumber(record, 'labor') ?? readNumber(record, 'laborTotal') ?? 0;
      const parts = readNumber(record, 'partCosts') ?? readNumber(record, 'partCost') ?? readNumber(record, 'partsTotal') ?? readNumber(record, 'parts') ?? 0;
      const discount = readNumber(record, 'discount') ?? readNumber(record, 'laborDiscount') ?? 0;
      const taxRate = readNumber(record, 'taxRate') ?? readNumber(record, 'taxPercent') ?? readNumber(record, 'taxPercentage') ?? 0;
      const amountPaid = paid ?? 0;
      const computed = computeTotals({ laborCost: labor, partCosts: parts, discount, taxRate, amountPaid });
      total = computed.total;
      if (remaining === undefined) remaining = computed.remaining;
    }
  }

  if (paid === undefined && total !== undefined && remaining !== undefined) {
    paid = Math.max(0, (total || 0) - (remaining || 0));
  }
  if (remaining === undefined && total !== undefined && paid !== undefined) {
    remaining = Math.max(0, (total || 0) - (paid || 0));
  }

  const safeTotal = Number.isFinite(total ?? NaN) ? (total as number) : 0;
  const safePaid = Number.isFinite(paid ?? NaN) ? (paid as number) : 0;
  const safeRemaining = Number.isFinite(remaining ?? NaN) ? (remaining as number) : Math.max(0, safeTotal - safePaid);

  return { total: safeTotal, paid: safePaid, remaining: safeRemaining };
}

function collectPayments(record: any) {
  if (!record || typeof record !== 'object') return [];
  if (Array.isArray(record.payments)) return record.payments;
  if (Array.isArray(record.paymentHistory)) return record.paymentHistory;
  if (Array.isArray(record.paymentLogs)) return record.paymentLogs;
  return [];
}

function paymentAppliedAmount(p: any): number {
  const applied = Number(p?.applied);
  if (Number.isFinite(applied) && applied > 0) return applied;
  const amount = Number(p?.amount ?? p?.tender ?? p?.paid ?? 0);
  const change = Number(p?.change ?? p?.changeDue ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (Number.isFinite(change) && change > 0) return Math.max(0, amount - change);
  return amount;
}

function paymentEventDate(p: any): Date | null {
  return parseDateValue(p?.at ?? p?.date ?? p?.createdAt ?? p?.timestamp ?? null);
}

function isDateWithin(date: Date | null, startMs: number, endMs: number) {
  if (!date) return false;
  const ts = date.getTime();
  return ts >= startMs && ts <= endMs;
}

function getTimelineDate(record: any): Date | null {
  const payments = collectPayments(record)
    .map((p: any) => paymentEventDate(p))
    .filter(Boolean) as Date[];
  if (payments.length) {
    payments.sort((a, b) => b.getTime() - a.getTime());
    return payments[0];
  }

  const orderedKeys = [
    'checkoutDate',
    'repairCompletionDate',
    'clientPickupDate',
    'updatedAt',
    'checkInAt',
    'createdAt',
  ];
  for (const key of orderedKeys) {
    const d = parseDateValue(record?.[key]);
    if (d) return d;
  }
  return extractRecordDate(record);
}

function collectedAmountInRange(record: any, startMs: number, endMs: number, fallbackDate?: Date | null): number {
  const payments = collectPayments(record);
  if (payments.length) {
    return round2(payments.reduce((sum: number, p: any) => {
      const d = paymentEventDate(p);
      if (!isDateWithin(d, startMs, endMs)) return sum;
      return sum + paymentAppliedAmount(p);
    }, 0));
  }

  const date = fallbackDate || getTimelineDate(record);
  if (!isDateWithin(date, startMs, endMs)) return 0;
  const { paid, total } = resolveTotals(record);
  const value = Number(paid || 0) || Number(total || 0) || 0;
  return round2(Math.max(0, value));
}

function latestPaymentDateInRange(record: any, startMs: number, endMs: number): Date | null {
  const dates = collectPayments(record)
    .map((p: any) => paymentEventDate(p))
    .filter((d: Date | null) => isDateWithin(d, startMs, endMs)) as Date[];
  if (!dates.length) return null;
  dates.sort((a, b) => b.getTime() - a.getTime());
  return dates[0];
}

function computeSaleCommissionInRange(sale: any, startMs: number, endMs: number, commissionRate: number) {
  const breakdown = computeSaleBreakdown(sale, commissionRate);
  const net = Number(breakdown.net || 0) || 0;
  const commissionableRatio = net > 0 ? Math.min(1, Math.max(0, (Number(breakdown.commissionableNet || 0) || 0) / net)) : 0;
  const consultationRatio = net > 0 ? Math.min(1, Math.max(0, (Number(breakdown.consultationNet || 0) || 0) / net)) : 0;

  const collected = collectedAmountInRange(sale, startMs, endMs, getTimelineDate(sale));
  if (!(collected > 0)) return null;

  const commissionableCollected = round2(collected * commissionableRatio);
  const consultationCollected = round2(collected * consultationRatio);
  const commission = round2(commissionableCollected * commissionRate);
  const date = latestPaymentDateInRange(sale, startMs, endMs) || getTimelineDate(sale) || new Date(0);

  return {
    sale,
    date,
    collected: round2(collected),
    commissionableCollected,
    consultationCollected,
    commission,
    breakdown,
  };
}

function normalizeRow(kind: UnifiedRow['kind'], record: any): UnifiedRow | null {
  if (!record) return null;
  const enriched = kind === 'sale' && record && typeof record === 'object'
    ? {
        ...record,
        partCosts: readNumber(record, 'partCosts') ?? readNumber(record, 'partsTotal') ?? (Array.isArray(record.items)
          ? record.items.reduce((sum: number, item: any) => sum + Number(item?.price ?? 0) * Number(item?.qty ?? 1), 0)
          : 0),
      }
    : record;

  const date = getTimelineDate(enriched);
  if (!date) return null;
  const { total, paid, remaining } = resolveTotals(enriched);
  const payments = collectPayments(enriched);

  const statusRaw = (enriched as any)?.status;
  const status = typeof statusRaw === 'string'
    ? statusRaw
    : (statusRaw === null || statusRaw === undefined ? undefined : String(statusRaw));

  const checkoutRaw = (enriched as any)?.checkoutDate;
  const checkoutDate = typeof checkoutRaw === 'string'
    ? checkoutRaw
    : (checkoutRaw === null || checkoutRaw === undefined ? null : String(checkoutRaw));

  const assignedToRaw = (enriched as any)?.assignedTo;
  const assignedTo = typeof assignedToRaw === 'string'
    ? assignedToRaw
    : (assignedToRaw === null || assignedToRaw === undefined ? null : String(assignedToRaw));

  const customerNameRaw = (enriched as any)?.customerName
    ?? (enriched as any)?.name
    ?? (enriched as any)?.customer
    ?? [
      (enriched as any)?.firstName,
      (enriched as any)?.lastName,
    ].filter(Boolean).join(' ').trim();
  const customerName = typeof customerNameRaw === 'string' && customerNameRaw.trim() ? customerNameRaw.trim() : undefined;

  const titleRaw = kind === 'work'
    ? ((enriched as any)?.productCategory || (enriched as any)?.productDescription || (enriched as any)?.summary || '').toString()
    : (() => {
        const items = Array.isArray((enriched as any)?.items) ? (enriched as any).items : [];
        const first = items.find((it: any) => (it?.description || '').toString().trim());
        return (first?.description || (enriched as any)?.itemDescription || '').toString();
      })();
  const title = titleRaw && titleRaw.trim() ? titleRaw.trim() : undefined;

  const diagnosticLike = kind === 'work' && Array.isArray((enriched as any)?.items)
    ? (enriched as any).items.some((it: any) => /diagnos/i.test((it?.description || '').toString()))
    : false;
  const id = enriched?.id
    ?? enriched?.ticketNumber
    ?? enriched?.ticketNo
    ?? enriched?.invoiceNumber
    ?? enriched?.invoiceNo
    ?? enriched?.uuid
    ?? enriched?.guid
    ?? enriched?.workorderId
    ?? `${kind}-${date.getTime()}`;

  return {
    kind,
    id,
    date,
    total,
    paid,
    remaining,
    payments,
    status,
    checkoutDate,
    assignedTo,
    customerName,
    title,
    diagnosticLike,
  };
}

type UnifiedRow = {
  kind: 'work' | 'sale';
  id: any;
  date: Date;
  total: number;
  paid: number;
  remaining: number;
  payments: any[];
  status?: string;
  checkoutDate?: string | null;
  assignedTo?: string | null;
  customerName?: string;
  title?: string;
  diagnosticLike?: boolean;
};

const EODWindow: React.FC = () => {
  const [settings, setSettings] = useState<EodSettings>(defaultSettings);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [range, setRange] = useState<RangeKey>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [settingsReady, setSettingsReady] = useState(false);
  const [batchInfo, setBatchInfo] = useState<any>(null);
  const [emailBody, setEmailBody] = useState('');
  const [bodyTouched, setBodyTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [viewMode, setViewMode] = useState<'reports' | 'trends'>('reports');

  const [technicians, setTechnicians] = useState<any[]>([]);
  const [techSummary, setTechSummary] = useState<string>('');

  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const list = await listTechnicians();
        if (!disposed) setTechnicians(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error('Failed loading technicians', e);
      }
    }
    refresh();
    const off = (window as any).api?.onTechniciansChanged?.(() => refresh());
    return () => { disposed = true; try { off && off(); } catch {} };
  }, []);

  const technicianOptions = useMemo(() => {
    return (technicians || []).filter((t: any) => t && (t.active !== false)).map((t: any) => {
      const value = (t.nickname?.trim() || t.firstName || String(t.id)).toString();
      const label = [t.firstName, t.lastName].filter(Boolean).join(' ').trim() || t.nickname || `Tech ${t.id}`;
      return { value, label };
    });
  }, [technicians]);

  const techAliasToCanonical = useMemo(() => {
    const map = new Map<string, string>();
    const labelMap = new Map<string, string>();

    for (const t of (technicians || [])) {
      if (!t || (t.active === false)) continue;
      const canonicalDisplay = (t.nickname?.trim() || t.firstName || String(t.id)).toString();
      const canonicalKey = normalizeTechKey(canonicalDisplay);
      const fullName = [t.firstName, t.lastName].filter(Boolean).join(' ').trim();
      const label = fullName || t.nickname || `Tech ${t.id}`;

      labelMap.set(canonicalKey, label);

      const aliases = new Set<string>();
      aliases.add(canonicalDisplay);
      if (t.id) aliases.add(String(t.id));
      if (t.nickname) aliases.add(String(t.nickname));
      if (t.firstName) aliases.add(String(t.firstName));
      if (fullName) aliases.add(fullName);
      if (fullName) aliases.add(fullName.split(' ')[0]);

      for (const a of aliases) {
        const k = normalizeTechKey(a);
        if (!k) continue;
        map.set(k, canonicalKey);
      }
    }

    return { map, labelMap };
  }, [technicians]);

  const canonicalizeAssignedTo = (raw: any): string => {
    const k = normalizeTechKey(raw);
    if (!k) return '';
    return techAliasToCanonical.map.get(k) || k;
  };

  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        setLoadingData(true);
        const api = (window as any).api ?? {};
        const woPromise = api.getWorkOrders ? api.getWorkOrders().catch(() => []) : Promise.resolve([]);
        const saPromise = api.getSales ? api.getSales().catch(() => []) : Promise.resolve([]);
        const settingsPromise = api.dbGet ? api.dbGet('eodSettings').catch(() => []) : Promise.resolve([]);
        const batchPromise = api.getBatchOutInfo
          ? api.getBatchOutInfo().catch(() => null)
          : api.dbGet
            ? api.dbGet('batchInfo').catch(() => null)
            : Promise.resolve(null);

        const [wo, sa, stored, batch] = await Promise.all([woPromise, saPromise, settingsPromise, batchPromise]);
        if (disposed) return;

        setWorkOrders(Array.isArray(wo) ? wo : []);
        setSales(Array.isArray(sa) ? sa : []);

        const storedSettings = Array.isArray(stored) ? stored[0] : stored;
        if (storedSettings && typeof storedSettings === 'object') {
          setSettings(prev => ({ ...prev, ...storedSettings }));
          if (storedSettings.emailBody) {
            setEmailBody(storedSettings.emailBody);
          }
        }

        const batchRecord = Array.isArray(batch) ? batch[0] : batch;
        setBatchInfo(batchRecord || null);
        setSettingsReady(true);
      } catch (err) {
        console.error('Failed to load EOD data', err);
        if (!disposed) setSettingsReady(true);
      } finally {
        if (!disposed) setLoadingData(false);
      }
    }
    load();
    return () => {
      disposed = true;
    };
  }, []);

  const settingsPayload = useMemo(() => ({ ...settings, emailBody }), [settings, emailBody]);

  useAutosave(settingsPayload, async payload => {
    if (!settingsReady) return;
    const api = (window as any).api;
    if (!api) return;
    try {
      if (payload.id && api.dbUpdate) {
        await api.dbUpdate('eodSettings', payload.id, payload);
      } else if (!payload.id && api.dbAdd) {
        const created = await api.dbAdd('eodSettings', payload);
        if (created?.id) {
          setSettings(s => ({ ...s, id: created.id }));
        }
      }
    } catch (err) {
      console.error('Failed to save EOD settings', err);
    }
  }, { enabled: settingsReady, debounceMs: 1500 });

  const { start, end } = useMemo(() => resolveRange(range, customFrom, customTo), [range, customFrom, customTo]);
  const rangeKey = `${start.getTime()}-${end.getTime()}`;

  const unified = useMemo(() => {
    const rows: UnifiedRow[] = [];
    const min = start.getTime();
    const max = end.getTime();
    const push = (kind: UnifiedRow['kind'], record: any) => {
      const normalized = normalizeRow(kind, record);
      if (!normalized) return;
      const ts = normalized.date.getTime();
      if (ts < min || ts > max) return;
      rows.push(normalized);
    };

    (workOrders || []).forEach(wo => push('work', wo));
    (sales || []).forEach(sa => push('sale', sa));

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    return rows;
  }, [workOrders, sales, rangeKey]);

  const trendRows = useMemo(() => {
    const rows: UnifiedRow[] = [];
    (workOrders || []).forEach(wo => {
      const normalized = normalizeRow('work', wo);
      if (normalized) rows.push(normalized);
    });
    (sales || []).forEach(sa => {
      const normalized = normalizeRow('sale', sa);
      if (normalized) rows.push(normalized);
    });
    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    return rows;
  }, [workOrders, sales]);

  const summary = useMemo(() => {
    const min = start.getTime();
    const max = end.getTime();
    const wo = { count: 0, total: 0, paid: 0, remaining: 0 };
    const sa = { count: 0, total: 0, paid: 0, remaining: 0 };
    unified.forEach(row => {
      const bucket = row.kind === 'work' ? wo : sa;
      const collected = collectedAmountInRange(row, min, max, row.date);
      bucket.count += 1;
      bucket.total += collected;
      bucket.paid += collected;
      bucket.remaining += row.remaining;
    });
    const grandTotal = wo.total + sa.total;
    const grandPaid = wo.paid + sa.paid;
    const grandRemaining = wo.remaining + sa.remaining;
    return { woTotals: wo, saTotals: sa, grandTotal, grandPaid, grandRemaining };
  }, [unified, rangeKey]);

  const COMMISSION_RATE = 0.05;

  const salesInRange = useMemo(() => {
    const min = start.getTime();
    const max = end.getTime();
    return (sales || []).filter(sa => {
      const d = extractRecordDate(sa);
      if (!d) return false;
      const ts = d.getTime();
      return ts >= min && ts <= max;
    });
  }, [sales, rangeKey]);

  const salesCategoryTotals = useMemo(() => {
    const map = new Map<string, { count: number; gross: number; net: number }>();
    for (const sa of salesInRange) {
      const b = computeSaleBreakdown(sa, COMMISSION_RATE);
      for (const [cat, gross] of b.byCategoryGross.entries()) {
        const net = b.byCategoryNet.get(cat) || 0;
        const prev = map.get(cat) || { count: 0, gross: 0, net: 0 };
        prev.count += 1;
        prev.gross += gross;
        prev.net += net;
        map.set(cat, prev);
      }
    }
    const rows = Array.from(map.entries()).map(([category, v]) => ({ category, count: v.count, gross: round2(v.gross), net: round2(v.net) }));
    rows.sort((a, b) => b.net - a.net);
    return rows;
  }, [salesInRange]);

  const commissionSummary = useMemo(() => {
    const min = start.getTime();
    const max = end.getTime();
    let commissionableNet = 0;
    let commission = 0;
    let consultationNet = 0;
    for (const sa of sales || []) {
      const row = computeSaleCommissionInRange(sa, min, max, COMMISSION_RATE);
      if (!row) continue;
      commissionableNet += row.commissionableCollected;
      consultationNet += row.consultationCollected;
      commission += row.commission;
    }
    return {
      commissionableNet: round2(commissionableNet),
      consultationNet: round2(consultationNet),
      commission: round2(commission),
    };
  }, [sales, rangeKey]);

  const salesCommissionInRange = useMemo(() => {
    const min = start.getTime();
    const max = end.getTime();
    const rows = (sales || []).map(sa => computeSaleCommissionInRange(sa, min, max, COMMISSION_RATE)).filter(Boolean) as Array<{
      sale: any;
      date: Date;
      collected: number;
      commissionableCollected: number;
      consultationCollected: number;
      commission: number;
      breakdown: ReturnType<typeof computeSaleBreakdown>;
    }>;
    rows.sort((a, b) => b.date.getTime() - a.date.getTime());
    return rows;
  }, [sales, rangeKey]);

  const commissionByTechnician = useMemo(() => {
    const map = new Map<string, { salesCount: number; commissionableNet: number; commission: number }>();
    for (const row of salesCommissionInRange) {
      const tech = canonicalizeAssignedTo(row.sale?.assignedTo);
      if (!tech) continue;
      const prev = map.get(tech) || { salesCount: 0, commissionableNet: 0, commission: 0 };
      prev.salesCount += 1;
      prev.commissionableNet += row.commissionableCollected;
      prev.commission += row.commission;
      map.set(tech, prev);
    }
    return map;
  }, [salesCommissionInRange, techAliasToCanonical]);

  const technicianCommissionRows = useMemo(() => {
    const rows = Array.from(commissionByTechnician.entries()).map(([tech, v]) => ({
      tech,
      salesCount: v.salesCount,
      commissionableNet: round2(v.commissionableNet),
      commission: round2(v.commission),
    }));
    rows.sort((a, b) => b.commission - a.commission);
    return rows;
  }, [commissionByTechnician]);

  const techSummaryKey = useMemo(() => normalizeTechKey(techSummary), [techSummary]);

  const techSummarySales = useMemo(() => {
    if (!techSummaryKey) return [] as Array<{ id: any; date: Date; title: string; totalNet: number; commission: number }>;
    const rows: Array<{ id: any; date: Date; title: string; totalNet: number; commission: number }> = [];
    for (const row of salesCommissionInRange) {
      const sa = row.sale;
      if (canonicalizeAssignedTo(sa?.assignedTo) !== techSummaryKey) continue;
      const items = normalizeSaleItems(sa);
      const title = (items.find(it => (it.description || '').trim())?.description || sa?.itemDescription || 'Sale').toString();
      rows.push({ id: sa?.id, date: row.date, title, totalNet: row.collected, commission: row.commission });
    }
    rows.sort((a, b) => b.date.getTime() - a.date.getTime());
    return rows;
  }, [salesCommissionInRange, techSummaryKey, techAliasToCanonical]);

  const techSummaryWorkOrders = useMemo(() => {
    if (!techSummaryKey) return [] as UnifiedRow[];
    const rows = unified.filter(r => r.kind === 'work' && canonicalizeAssignedTo(r.assignedTo) === techSummaryKey);
    rows.sort((a, b) => b.date.getTime() - a.date.getTime());
    return rows;
  }, [unified, techSummaryKey, techAliasToCanonical]);

  const techSummaryTotals = useMemo(() => {
    if (!techSummaryKey) return null;
    const salesCount = techSummarySales.length;
    const salesNet = round2(techSummarySales.reduce((sum, r) => sum + (Number(r.totalNet) || 0), 0));
    const commission = round2(techSummarySales.reduce((sum, r) => sum + (Number(r.commission) || 0), 0));
    const workCount = techSummaryWorkOrders.length;
    const workTotal = round2(techSummaryWorkOrders.reduce((sum, r) => sum + (Number(r.total) || 0), 0));
    return { salesCount, salesNet, commission, workCount, workTotal };
  }, [techSummaryKey, techSummarySales, techSummaryWorkOrders]);

  const paymentSummary = useMemo(() => {
    const min = start.getTime();
    const max = end.getTime();
    let cashTender = 0;
    let cashChange = 0;
    let card = 0;
    let other = 0;
    let paymentsCount = 0;

    const addPayment = (p: any) => {
      const d = paymentEventDate(p);
      if (!isDateWithin(d, min, max)) return;
      const amt = Number(p?.amount || p?.tender || p?.paid || 0);
      if (!Number.isFinite(amt)) return;
      const change = Number(p?.change || p?.changeDue || 0);
      const type = (p?.paymentType || p?.method || '').toString().toLowerCase();
      if (type.includes('cash')) {
        cashTender += amt;
        cashChange += Math.max(0, change);
      } else if (type.includes('card') || type.includes('credit') || type.includes('debit')) {
        card += amt;
      } else if (amt) {
        other += amt;
      }
      paymentsCount += 1;
    };

    unified.forEach(row => {
      const payments = Array.isArray(row.payments) ? row.payments : [];
      payments.forEach(addPayment);
      if (!payments.length) {
        const collected = collectedAmountInRange(row, min, max, row.date);
        if (collected > 0) addPayment({ amount: collected, paymentType: 'unknown', change: 0, at: row.date });
      }
    });

    const cashNet = cashTender - cashChange;
    return { cashTender, cashChange, cashNet, card, other, paymentsCount };
  }, [unified, rangeKey]);

  const workStatusCounts = useMemo(() => {
    let open = 0;
    let closed = 0;
    let total = 0;
    unified.forEach(row => {
      if (row.kind !== 'work') return;
      total += 1;
      const st = (row.status || '').toLowerCase();
      if (st === 'closed') closed += 1; else open += 1;
    });
    return { total, open, closed };
  }, [unified]);

  const monthlyTrends = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    trendRows.forEach(row => {
      const d = row.date;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const existing = map.get(key) || { count: 0, total: 0 };
      existing.count += 1;
      existing.total += row.total;
      map.set(key, existing);
    });
    const entries = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, val]) => {
        const [year, month] = key.split('-').map(Number);
        const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        return { key, label, count: val.count, total: val.total };
      });
    return entries;
  }, [trendRows]);

  const busiestDays = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = new Array(7).fill(0);
    trendRows.forEach(row => {
      counts[row.date.getDay()] += 1;
    });
    return days.map((label, idx) => ({ label, count: counts[idx] }))
      .sort((a, b) => b.count - a.count);
  }, [trendRows]);

  const topDevices = useMemo(() => {
    const map = new Map<string, number>();
    (workOrders || []).forEach((wo: any) => {
      const device = (wo.productCategory || wo.productDescription || 'Unknown device').toString().trim();
      if (!device) return;
      map.set(device, (map.get(device) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }, [workOrders]);

  const topRepairs = useMemo(() => {
    const map = new Map<string, number>();
    (workOrders || []).forEach((wo: any) => {
      const items = Array.isArray(wo.items) ? wo.items : [];
      items.forEach((it: any) => {
        const label = (it.repair || it.description || it.title || it.name || it.altDescription || '').toString().trim();
        if (!label) return;
        map.set(label, (map.get(label) || 0) + 1);
      });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }, [workOrders]);

  const reportLines = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Work orders: ${workStatusCounts.total} total (open ${workStatusCounts.open} / closed ${workStatusCounts.closed})`);
    lines.push(`Card intake: ${formatCurrency(paymentSummary.card)}${paymentSummary.other ? ` · Other: ${formatCurrency(paymentSummary.other)}` : ''}`);
    lines.push(`Cash intake: ${formatCurrency(paymentSummary.cashTender)}`);
    lines.push(`Change given: ${formatCurrency(paymentSummary.cashChange)}`);
    lines.push(`Cash to deposit: ${formatCurrency(paymentSummary.cashNet)}`);
    const grandIntake = paymentSummary.cashTender + paymentSummary.card + paymentSummary.other;
    lines.push(`Grand totals: Card ${formatCurrency(paymentSummary.card + paymentSummary.other)} · Cash ${formatCurrency(paymentSummary.cashTender)} · Combined ${formatCurrency(grandIntake)}`);
    if (salesCommissionInRange.length) {
      lines.push(`Commissionable collected (non-consultation): ${formatCurrency(commissionSummary.commissionableNet)}`);
      lines.push(`Consultation collected (excluded): ${formatCurrency(commissionSummary.consultationNet)}`);
      lines.push(`Commission @ ${(COMMISSION_RATE * 100).toFixed(0)}%: ${formatCurrency(commissionSummary.commission)}`);
    }
    if (settings.includeBatchInfo && batchInfo) {
      const last = batchInfo?.lastBatchOutDate ? formatDate(batchInfo.lastBatchOutDate) : 'Not yet run';
      const backup = batchInfo?.lastBackupPath ? `Backup: ${batchInfo.lastBackupPath}` : '';
      lines.push(`Batch Out: ${last}${backup ? ` — ${backup}` : ''}`);
    }
    return lines.filter(Boolean).join('\n');
  }, [batchInfo, commissionSummary.commission, commissionSummary.commissionableNet, commissionSummary.consultationNet, paymentSummary.cashChange, paymentSummary.cashNet, paymentSummary.cashTender, paymentSummary.card, paymentSummary.other, salesCommissionInRange.length, settings.includeBatchInfo, workStatusCounts.closed, workStatusCounts.open, workStatusCounts.total]);

  const presetBody = useMemo(() => {
    return [`Daily batch for ${rangeLabel(range, start, end)}`, reportLines].filter(Boolean).join('\n\n');
  }, [range, reportLines, start, end]);


  useEffect(() => {
    if (!bodyTouched && !emailBody) {
      setEmailBody(presetBody);
    }
  }, [presetBody, bodyTouched, emailBody]);

  const emailHtml = useMemo(() => {
    const lines = reportLines.split('\n').filter(Boolean).map(l => `<li>${l}</li>`).join('');
    const bodyBlock = emailBody ? `<div style="margin-bottom:12px;white-space:pre-wrap;font-family:Arial, sans-serif;">${emailBody}</div>` : '';
    return `<div style="font-family:Arial, sans-serif;font-size:13px;color:#f8f8f8;background:#0b0b0c;padding:12px;">${bodyBlock}<ul style="padding-left:16px;">${lines}</ul></div>`;
  }, [emailBody, reportLines]);

  const subject = useMemo(() => {
    return settings.subject || 'Daily batch report';
  }, [settings.subject]);

  const filteredLists = useMemo(() => {
    const workOrderRows = unified.filter(row => row.kind === 'work');
    const salesRows = unified.filter(row => row.kind === 'sale');
    const outstandingRows = unified.filter(row => row.remaining > 0.01);
    const collectedRows = workOrderRows.filter(row => (row.status || '').toLowerCase() === 'closed');

    const openTicketRows: UnifiedRow[] = [];
    const pushOpen = (kind: UnifiedRow['kind'], record: any) => {
      const normalized = normalizeRow(kind, record);
      if (!normalized) return;
      const st = (normalized.status || '').toLowerCase();
      const isClosed = st === 'closed';
      const needsCheckout = !normalized.checkoutDate;
      if (!isClosed || needsCheckout) {
        openTicketRows.push(normalized);
      }
    };
    (workOrders || []).forEach(wo => pushOpen('work', wo));
    (sales || []).forEach(sa => pushOpen('sale', sa));
    openTicketRows.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      work: workOrderRows,
      sales: salesRows,
      outstanding: outstandingRows,
      collected: collectedRows,
      openTickets: openTicketRows,
    };
  }, [sales, unified, workOrders]);

  const [activeList, setActiveList] = useState<keyof typeof filteredLists | null>(null);

  const listMeta = useMemo(() => {
    if (!activeList) return null;
    const titleMap: Record<keyof typeof filteredLists, string> = {
      work: 'Work orders in range',
      sales: 'Sales in range',
      outstanding: 'Outstanding balances',
      collected: 'Closed work orders (collected)',
      openTickets: 'Open tickets (not completed / not checked out)',
    };
    const rows = filteredLists[activeList];
    return {
      title: titleMap[activeList],
      rows,
    };
  }, [activeList, filteredLists]);

  async function handleRowOpen(row: UnifiedRow) {
    const api = (window as any).api;
    if (!api) return;
    try {
      if (row.kind === 'work') {
        if (!api?.openNewWorkOrder) return;
        await api.openNewWorkOrder({ workOrderId: row.id });
      } else {
        if (!api?.openNewSale) return;
        await api.openNewSale({ id: row.id });
      }
    } catch (err) {
      console.error('Failed to open record', err);
    }
  }

  async function handleSend() {
    if (sending) return;
    const recipients = (settings.recipients || '').split(/[;,]/).map(r => r.trim()).filter(Boolean);
    if (!recipients.length) { alert('Add at least one recipient'); return; }
    setSending(true);
    try {
      const api = (window as any).api;
      if (!api?.emailSendQuoteHtml) {
        alert('Email sending not configured in this build.');
        return;
      }
      const text = [emailBody, reportLines].filter(Boolean).join('\n\n');
      for (const to of recipients) {
        await api.emailSendQuoteHtml({ to, subject, bodyText: text, filename: 'reports.html', html: emailHtml });
      }
      setSettings(s => ({ ...s, lastSentAt: new Date().toISOString() }));
      alert('Report sent');
    } catch (e) {
      console.error('Report send failed', e);
      alert('Send failed. Check console for details.');
    } finally {
      setSending(false);
    }
  }

  async function handleBatchOutNow() {
    try {
      setSending(true);
      const res = await (window as any).api.runBatchOut?.();
      if (res?.ok) {
        const info = await (window as any).api.getBatchOutInfo?.();
        if (info) setBatchInfo(info);
        alert('Batch Out complete. Backup saved.');
      } else {
        alert(res?.error || 'Batch Out failed.');
      }
    } catch (e) {
      console.error('Batch Out failed', e);
      alert('Batch Out failed. See console for details.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-50 p-4">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {viewMode === 'trends' && (
              <button
                className="mt-1 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]"
                onClick={() => setViewMode('reports')}
              >← Back</button>
            )}
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Reports</div>
              <h1 className="text-3xl font-bold text-[#39FF14]">{viewMode === 'trends' ? 'Trends & Insights' : 'Daily & Custom Reports'}</h1>
              <p className="text-zinc-400 text-sm max-w-2xl">{viewMode === 'trends'
                ? 'Review monthly volume, busy days, and popular devices/repairs at a glance.'
                : 'Track work orders, cash and card intake, and totals for any range. Craft a quick report email with the data you pick.'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {viewMode === 'reports' && (
              <>
                <button
                  className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]"
                  onClick={() => handleSend()}
                  disabled={sending}
                >{sending ? 'Sending…' : 'Send report'}</button>
                <button
                  className="px-3 py-2 text-sm bg-[#39FF14] text-black border border-[#39FF14] rounded hover:brightness-110"
                  onClick={() => handleBatchOutNow()}
                  disabled={sending}
                >Batch Out now</button>
                <button
                  className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]"
                  onClick={() => setViewMode('trends')}
                >Trends</button>
              </>
            )}
            <button
              className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]"
              onClick={() => window.close()}
            >Close</button>
          </div>
        </div>

        {viewMode === 'reports' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Date & Filters</h3>
                  <span className="text-xs text-zinc-500">{loadingData ? 'Loading…' : rangeLabel(range, start, end)}</span>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Range</label>
                  <select
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm"
                    value={range}
                    onChange={e => setRange(e.target.value as RangeKey)}
                  >
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last7">Last 7 days</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                {range === 'custom' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">From</label>
                      <input type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">To</label>
                      <input type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                    </div>
                  </div>
                )}
                <div className="bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-300 leading-relaxed">
                  Report contents are fixed for consistency. Adjust the date range above to change the report window.
                </div>
              </div>

              <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">At a glance</h3>
                  <span className="text-xs text-zinc-500">{loadingData ? '...' : `${summary.woTotals.count + summary.saTotals.count} records`}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <button
                    type="button"
                    className={`text-left bg-zinc-800 border border-zinc-700 rounded p-2 transition ${activeList === 'work' ? 'border-[#39FF14] shadow-[0_0_0_1px_rgba(57,255,20,0.25)]' : 'hover:border-[#39FF14] hover:shadow-[0_0_0_1px_rgba(57,255,20,0.1)]'}`}
                    onClick={() => setActiveList(prev => (prev === 'work' ? null : 'work'))}
                  >
                    <div className="text-xs text-zinc-500">Work orders</div>
                    <div className="text-xl font-semibold">{summary.woTotals.count}</div>
                    <div className="text-[11px] text-zinc-400">{formatCurrency(summary.woTotals.total)} collected</div>
                  </button>
                  <button
                    type="button"
                    className={`text-left bg-zinc-800 border border-zinc-700 rounded p-2 transition ${activeList === 'sales' ? 'border-[#39FF14] shadow-[0_0_0_1px_rgba(57,255,20,0.25)]' : 'hover:border-[#39FF14] hover:shadow-[0_0_0_1px_rgba(57,255,20,0.1)]'}`}
                    onClick={() => setActiveList(prev => (prev === 'sales' ? null : 'sales'))}
                  >
                    <div className="text-xs text-zinc-500">Sales</div>
                    <div className="text-xl font-semibold">{summary.saTotals.count}</div>
                    <div className="text-[11px] text-zinc-400">{formatCurrency(summary.saTotals.total)} collected</div>
                  </button>
                  <button
                    type="button"
                    className={`text-left bg-zinc-800 border border-zinc-700 rounded p-2 transition ${activeList === 'collected' ? 'border-[#39FF14] shadow-[0_0_0_1px_rgba(57,255,20,0.25)]' : 'hover:border-[#39FF14] hover:shadow-[0_0_0_1px_rgba(57,255,20,0.1)]'}`}
                    onClick={() => setActiveList(prev => (prev === 'collected' ? null : 'collected'))}
                  >
                    <div className="text-xs text-zinc-500">Collected (closed)</div>
                    <div className="text-xl font-semibold">{formatCurrency(filteredLists.collected.reduce((sum, row) => sum + row.paid, 0))}</div>
                    <div className="text-[11px] text-zinc-400">{filteredLists.collected.length} closed</div>
                  </button>
                  <button
                    type="button"
                    className={`text-left bg-zinc-800 border border-zinc-700 rounded p-2 transition ${activeList === 'outstanding' ? 'border-[#39FF14] shadow-[0_0_0_1px_rgba(57,255,20,0.25)]' : 'hover:border-[#39FF14] hover:shadow-[0_0_0_1px_rgba(57,255,20,0.1)]'}`}
                    onClick={() => setActiveList(prev => (prev === 'outstanding' ? null : 'outstanding'))}
                  >
                    <div className="text-xs text-zinc-500">Outstanding</div>
                    <div className="text-xl font-semibold text-orange-300">{formatCurrency(summary.grandRemaining)}</div>
                    <div className="text-[11px] text-zinc-400">{filteredLists.outstanding.length} with balance</div>
                  </button>

                  <button
                    type="button"
                    className={`text-left bg-zinc-800 border border-zinc-700 rounded p-2 transition ${activeList === 'openTickets' ? 'border-[#39FF14] shadow-[0_0_0_1px_rgba(57,255,20,0.25)]' : 'hover:border-[#39FF14] hover:shadow-[0_0_0_1px_rgba(57,255,20,0.1)]'}`}
                    onClick={() => setActiveList(prev => (prev === 'openTickets' ? null : 'openTickets'))}
                  >
                    <div className="text-xs text-zinc-500">Open tickets</div>
                    <div className="text-xl font-semibold">{filteredLists.openTickets.length}</div>
                    <div className="text-[11px] text-zinc-400">not closed / needs checkout</div>
                  </button>
                </div>
              </div>

              <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Payments</h3>
                  <span className="text-xs text-zinc-500">{paymentSummary.paymentsCount} payments</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span>Cash received</span><span className="font-semibold">{formatCurrency(paymentSummary.cashTender)}</span></div>
                  <div className="flex items-center justify-between text-orange-200"><span>Change given</span><span className="font-semibold">-{formatCurrency(paymentSummary.cashChange)}</span></div>
                  <div className="flex items-center justify-between text-[#39FF14]"><span>Cash to deposit</span><span className="font-semibold">{formatCurrency(paymentSummary.cashNet)}</span></div>
                  <div className="flex items-center justify-between"><span>Card</span><span className="font-semibold">{formatCurrency(paymentSummary.card)}</span></div>
                  {paymentSummary.other ? <div className="flex items-center justify-between"><span>Other</span><span className="font-semibold">{formatCurrency(paymentSummary.other)}</span></div> : null}
                  <div className="pt-2 border-t border-zinc-800 text-xs text-zinc-400">Last Batch Out: {batchInfo?.lastBatchOutDate ? formatDate(batchInfo.lastBatchOutDate) : 'Not yet run'}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Commission</h3>
                  <div className="text-xs text-zinc-500">{(COMMISSION_RATE * 100).toFixed(0)}% (non-consultation)</div>
                </div>
                <div className="mt-2 space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-zinc-300">Commissionable collected</span><span className="font-semibold">{formatCurrency(commissionSummary.commissionableNet)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-zinc-300">Consultation collected</span><span className="font-semibold">{formatCurrency(commissionSummary.consultationNet)}</span></div>
                  <div className="flex items-center justify-between text-[#39FF14]"><span className="text-zinc-100">Commission</span><span className="font-semibold">{formatCurrency(commissionSummary.commission)}</span></div>
                </div>
                <div className="text-[11px] text-zinc-500 mt-2">Uses sales item categories. Discount is allocated proportionally across categories.</div>
              </div>

              <div className="col-span-8 bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">Sales by Category</h3>
                  <div className="text-xs text-zinc-500">{salesCommissionInRange.length} sale record{salesCommissionInRange.length === 1 ? '' : 's'} with collected payments</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                        <th className="py-2 pr-4">Category</th>
                        <th className="py-2 pr-4 text-right">Tickets</th>
                        <th className="py-2 pr-4 text-right">Gross</th>
                        <th className="py-2 text-right">Net (after discount)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {salesCategoryTotals.map(r => (
                        <tr key={r.category} className="hover:bg-zinc-800/40">
                          <td className="py-2 pr-4">{r.category}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{r.count}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(r.gross)}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">{formatCurrency(r.net)}</td>
                        </tr>
                      ))}
                      {!salesCategoryTotals.length && (
                        <tr><td colSpan={4} className="py-6 text-center text-zinc-500">No sales in range.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold">Technician Summary</h3>
                  <div className="text-xs text-zinc-500">Sales + work orders for a technician (commission from sales only)</div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-zinc-400">Technician</label>
                  <select
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm min-w-[220px]"
                    value={techSummary}
                    onChange={e => setTechSummary(e.target.value)}
                  >
                    <option value="">All technicians</option>
                    {technicianOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {!techSummaryKey ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                        <th className="py-2 pr-4">Technician</th>
                        <th className="py-2 pr-4 text-right">Sales</th>
                        <th className="py-2 pr-4 text-right">Commissionable</th>
                        <th className="py-2 text-right">Commission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {technicianCommissionRows.map(r => (
                        <tr key={r.tech} className="hover:bg-zinc-800/40">
                          <td className="py-2 pr-4">{techAliasToCanonical.labelMap.get(r.tech) || r.tech}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{r.salesCount}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(r.commissionableNet)}</td>
                          <td className="py-2 text-right tabular-nums font-semibold text-[#39FF14]">{formatCurrency(r.commission)}</td>
                        </tr>
                      ))}
                      {!technicianCommissionRows.length && (
                        <tr><td colSpan={4} className="py-6 text-center text-zinc-500">No commissionable sales in range.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-4 bg-zinc-800 border border-zinc-700 rounded p-3">
                    <div className="text-xs text-zinc-400">Sales (net)</div>
                    <div className="text-2xl font-semibold">{formatCurrency(techSummaryTotals?.salesNet || 0)}</div>
                    <div className="text-[11px] text-zinc-400">{techSummaryTotals?.salesCount || 0} sale record{(techSummaryTotals?.salesCount || 0) === 1 ? '' : 's'}</div>
                    <div className="mt-3 text-xs text-zinc-400">Commission</div>
                    <div className="text-xl font-semibold text-[#39FF14]">{formatCurrency(techSummaryTotals?.commission || 0)}</div>
                    <div className="mt-3 text-xs text-zinc-400">Work orders</div>
                    <div className="text-xl font-semibold">{techSummaryTotals?.workCount || 0}</div>
                    <div className="text-[11px] text-zinc-400">{formatCurrency(techSummaryTotals?.workTotal || 0)} total</div>
                  </div>

                  <div className="col-span-12 md:col-span-8 grid grid-cols-2 gap-3">
                    <div className="bg-zinc-800 border border-zinc-700 rounded p-3">
                      <div className="text-sm font-semibold mb-2">Recent Sales</div>
                      <div className="max-h-[260px] overflow-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs uppercase tracking-wide text-zinc-400">
                              <th className="py-1 pr-2 text-left">Invoice</th>
                              <th className="py-1 pr-2 text-left">Date</th>
                              <th className="py-1 pr-2 text-right">Net</th>
                              <th className="py-1 text-right">Comm</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-700">
                            {techSummarySales.slice(0, 15).map(r => (
                              <tr key={String(r.id)} className="hover:bg-zinc-900/40">
                                <td className="py-1 pr-2 font-mono">{typeof r.id === 'number' ? `GB${String(r.id).padStart(7,'0')}` : String(r.id || '')}</td>
                                <td className="py-1 pr-2">{r.date.toISOString().slice(0,10)}</td>
                                <td className="py-1 pr-2 text-right tabular-nums">{formatCurrency(r.totalNet)}</td>
                                <td className="py-1 text-right tabular-nums text-[#39FF14]">{formatCurrency(r.commission)}</td>
                              </tr>
                            ))}
                            {!techSummarySales.length && (
                              <tr><td colSpan={4} className="py-6 text-center text-zinc-500">No sales for this tech in range.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-zinc-800 border border-zinc-700 rounded p-3">
                      <div className="text-sm font-semibold mb-2">Recent Work Orders</div>
                      <div className="max-h-[260px] overflow-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs uppercase tracking-wide text-zinc-400">
                              <th className="py-1 pr-2 text-left">Invoice</th>
                              <th className="py-1 pr-2 text-left">Date</th>
                              <th className="py-1 pr-2 text-left">Status</th>
                              <th className="py-1 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-700">
                            {techSummaryWorkOrders.slice(0, 15).map(r => (
                              <tr key={String(r.id)} className="hover:bg-zinc-900/40">
                                <td className="py-1 pr-2 font-mono">{typeof r.id === 'number' ? `GB${String(r.id).padStart(7,'0')}` : String(r.id || '')}</td>
                                <td className="py-1 pr-2">{r.date.toISOString().slice(0,10)}</td>
                                <td className="py-1 pr-2">{(r.status || '').toString()}</td>
                                <td className="py-1 text-right tabular-nums">{formatCurrency(r.total)}</td>
                              </tr>
                            ))}
                            {!techSummaryWorkOrders.length && (
                              <tr><td colSpan={4} className="py-6 text-center text-zinc-500">No work orders for this tech in range.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {listMeta ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold">{listMeta.title}</h3>
                    <div className="text-xs text-zinc-500">{listMeta.rows.length} record{listMeta.rows.length === 1 ? '' : 's'} in view</div>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]"
                    onClick={() => setActiveList(null)}
                  >Close</button>
                </div>
                {listMeta.rows.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                          <th className="py-2 pr-4">Ticket</th>
                          <th className="py-2 pr-4">Date</th>
                          <th className="py-2 pr-4">Type</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4 text-right">Total</th>
                          <th className="py-2 pr-4 text-right">Paid</th>
                          <th className="py-2 text-right">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {listMeta.rows.map(row => (
                          <tr
                            key={`${row.kind}-${row.id}`}
                            className="hover:bg-zinc-800/50 cursor-pointer transition-colors"
                            onClick={() => { void handleRowOpen(row); }}
                          >
                            <td className="py-2 pr-4">
                              <div className="font-mono text-xs text-zinc-200">{row.id}</div>
                              {row.customerName ? <div className="text-[11px] text-zinc-400 truncate max-w-[220px]">{row.customerName}</div> : null}
                            </td>
                            <td className="py-2 pr-4 text-zinc-300">{row.date.toLocaleDateString()}</td>
                            <td className="py-2 pr-4 text-zinc-300">
                              <div className="capitalize">{row.kind === 'work' ? 'Work order' : 'Sale'}</div>
                              {row.title ? <div className="text-[11px] text-zinc-400 truncate max-w-[260px]">{row.title}</div> : null}
                            </td>
                            <td className="py-2 pr-4 text-zinc-400">
                              <div>{row.status || '—'}</div>
                              {!row.checkoutDate ? <div className="text-[11px] text-orange-200">Needs checkout</div> : null}
                              {row.paid > 0.01 && row.remaining > 0.01 ? <div className="text-[11px] text-yellow-200">Partial payment</div> : null}
                              {row.diagnosticLike ? <div className="text-[11px] text-zinc-300">Diagnostic</div> : null}
                            </td>
                            <td className="py-2 pr-4 text-right text-zinc-200">{formatCurrency(row.total)}</td>
                            <td className="py-2 pr-4 text-right text-zinc-200">{formatCurrency(row.paid)}</td>
                            <td className={`py-2 text-right ${row.remaining > 0.01 ? 'text-orange-300' : 'text-zinc-400'}`}>{formatCurrency(row.remaining)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-zinc-400">No records in this category for the selected range.</div>
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-7 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Email report</h3>
                    <div className="text-xs text-zinc-500">Subject: {subject}</div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded" onClick={() => { setEmailBody(presetBody); setBodyTouched(true); }}>Use preset</button>
                    <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded" onClick={() => { setEmailBody(''); setBodyTouched(true); }}>Clear</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Recipients</label>
                    <textarea
                      rows={2}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm"
                      placeholder="ops@gadgetboy.com; owner@gadgetboy.com"
                      value={settings.recipients}
                      onChange={e => setSettings(s => ({ ...s, recipients: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Subject</label>
                    <input
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm"
                      value={settings.subject || ''}
                      onChange={e => setSettings(s => ({ ...s, subject: e.target.value }))}
                    />
                    <div className="text-[11px] text-zinc-500 mt-1">Sent at the scheduled batch-out time.</div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Message body</label>
                  <textarea
                    rows={4}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-sm"
                    value={emailBody}
                    onChange={e => { setEmailBody(e.target.value); setBodyTouched(true); }}
                  />
                  <div className="text-[11px] text-zinc-500 mt-1">Batch totals will be appended below this message.</div>
                </div>
                <div className="bg-zinc-800 border border-zinc-700 rounded p-3 text-xs text-zinc-200 space-y-2">
                  <div className="font-semibold text-zinc-100">Batch totals preview</div>
                  <pre className="whitespace-pre-wrap text-[12px] text-zinc-300">{reportLines || 'No data in range.'}</pre>
                </div>
              </div>

              <div className="col-span-5 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
                <h3 className="text-lg font-semibold">EOD Batches</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Schedule</label>
                    <select
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2"
                      value={settings.schedule}
                      onChange={e => setSettings(s => ({ ...s, schedule: e.target.value as EodSettings['schedule'] }))}
                    >
                      <option value="manual">Manual only</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Send time</label>
                    <input type="time" className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2" value={settings.sendTime} onChange={e => setSettings(s => ({ ...s, sendTime: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Batch Out time</label>
                    <input type="time" className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2" value={settings.batchOutTime || ''} onChange={e => setSettings(s => ({ ...s, batchOutTime: e.target.value }))} />
                  </div>
                </div>
                <div className="text-xs text-zinc-500 -mt-1">Auto backups are managed in Backup/Restore; this schedule controls batch-out and email timing only.</div>
                <div className="bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-300 leading-relaxed">
                  <div>Last sent: {settings.lastSentAt ? formatDate(settings.lastSentAt) : 'Not yet sent'}</div>
                  <div>Last Batch Out: {batchInfo?.lastBatchOutDate ? formatDate(batchInfo.lastBatchOutDate) : 'Not yet run'}</div>
                  {batchInfo?.lastBackupPath ? <div className="truncate">Backup path: {batchInfo.lastBackupPath}</div> : null}
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" onClick={() => handleBatchOutNow()} disabled={sending}>Run Batch Out now</button>
                  <button className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" onClick={() => handleSend()} disabled={sending}>{sending ? 'Sending…' : 'Send email'}</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 bg-zinc-900 border border-zinc-800 rounded-lg p-4 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Monthly volume (last 12 months)</h3>
                <span className="text-xs text-zinc-500">{trendRows.length} total records</span>
              </div>
              <div className="space-y-2">
                {monthlyTrends.map(item => {
                  const max = Math.max(1, ...monthlyTrends.map(m => m.count));
                  const pct = Math.round((item.count / max) * 100);
                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-zinc-400">{item.label}</div>
                      <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
                        <div className="h-3 bg-[#39FF14]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-16 text-right text-xs text-zinc-300">{item.count}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
              <h3 className="text-lg font-semibold mb-3">Busiest days</h3>
              <div className="space-y-2">
                {busiestDays.map(item => {
                  const max = Math.max(1, ...busiestDays.map(d => d.count));
                  const pct = Math.round((item.count / max) * 100);
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="w-10 text-xs text-zinc-400">{item.label}</div>
                      <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
                        <div className="h-3 bg-[#39FF14]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-10 text-right text-xs text-zinc-300">{item.count}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
              <h3 className="text-lg font-semibold mb-3">Popular devices</h3>
              <div className="space-y-2">
                {topDevices.map(item => {
                  const max = Math.max(1, ...topDevices.map(d => d.count));
                  const pct = Math.round((item.count / max) * 100);
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-zinc-400 truncate">{item.label}</div>
                      <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
                        <div className="h-3 bg-[#39FF14]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-10 text-right text-xs text-zinc-300">{item.count}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
              <h3 className="text-lg font-semibold mb-3">Popular repairs</h3>
              <div className="space-y-2">
                {topRepairs.map(item => {
                  const max = Math.max(1, ...topRepairs.map(d => d.count));
                  const pct = Math.round((item.count / max) * 100);
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-zinc-400 truncate">{item.label}</div>
                      <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
                        <div className="h-3 bg-[#39FF14]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-10 text-right text-xs text-zinc-300">{item.count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EODWindow;
