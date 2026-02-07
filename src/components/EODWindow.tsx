import React, { useEffect, useMemo, useState } from 'react';
import { computeTotals } from '../lib/calc';
import { useAutosave } from '../lib/useAutosave';

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

  const date = extractRecordDate(enriched);
  if (!date) return null;
  const { total, paid, remaining } = resolveTotals(enriched);
  const payments = collectPayments(enriched);
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
    status: kind === 'work' ? enriched?.status : undefined,
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
    const wo = { count: 0, total: 0, paid: 0, remaining: 0 };
    const sa = { count: 0, total: 0, paid: 0, remaining: 0 };
    unified.forEach(row => {
      const bucket = row.kind === 'work' ? wo : sa;
      bucket.count += 1;
      bucket.total += row.total;
      bucket.paid += row.paid;
      bucket.remaining += row.remaining;
    });
    const grandTotal = wo.total + sa.total;
    const grandPaid = wo.paid + sa.paid;
    const grandRemaining = wo.remaining + sa.remaining;
    return { woTotals: wo, saTotals: sa, grandTotal, grandPaid, grandRemaining };
  }, [unified]);

  const paymentSummary = useMemo(() => {
    let cashTender = 0;
    let cashChange = 0;
    let card = 0;
    let other = 0;
    let paymentsCount = 0;

    const addPayment = (p: any) => {
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
      if (!payments.length && row.paid > 0) addPayment({ amount: row.paid, paymentType: 'unknown', change: 0 });
    });

    const cashNet = cashTender - cashChange;
    return { cashTender, cashChange, cashNet, card, other, paymentsCount };
  }, [unified]);

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
    if (settings.includeBatchInfo && batchInfo) {
      const last = batchInfo?.lastBatchOutDate ? formatDate(batchInfo.lastBatchOutDate) : 'Not yet run';
      const backup = batchInfo?.lastBackupPath ? `Backup: ${batchInfo.lastBackupPath}` : '';
      lines.push(`Batch Out: ${last}${backup ? ` — ${backup}` : ''}`);
    }
    return lines.filter(Boolean).join('\n');
  }, [batchInfo, paymentSummary.cashChange, paymentSummary.cashNet, paymentSummary.cashTender, paymentSummary.card, paymentSummary.other, settings.includeBatchInfo, workStatusCounts.closed, workStatusCounts.open, workStatusCounts.total]);

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
    return {
      work: workOrderRows,
      sales: salesRows,
      outstanding: outstandingRows,
      collected: collectedRows,
    };
  }, [unified]);

  const [activeList, setActiveList] = useState<keyof typeof filteredLists | null>(null);

  const listMeta = useMemo(() => {
    if (!activeList) return null;
    const titleMap: Record<keyof typeof filteredLists, string> = {
      work: 'Work orders in range',
      sales: 'Sales in range',
      outstanding: 'Outstanding balances',
      collected: 'Closed work orders (collected)',
    };
    const rows = filteredLists[activeList];
    return {
      title: titleMap[activeList],
      rows,
    };
  }, [activeList, filteredLists]);

  async function handleRowOpen(row: UnifiedRow) {
    if (row.kind !== 'work') return;
    const api = (window as any).api;
    if (!api?.openNewWorkOrder) return;
    try {
      await api.openNewWorkOrder({ workOrderId: row.id });
    } catch (err) {
      console.error('Failed to open work order', err);
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
                    <div className="text-[11px] text-zinc-400">{formatCurrency(summary.woTotals.total)} total</div>
                  </button>
                  <button
                    type="button"
                    className={`text-left bg-zinc-800 border border-zinc-700 rounded p-2 transition ${activeList === 'sales' ? 'border-[#39FF14] shadow-[0_0_0_1px_rgba(57,255,20,0.25)]' : 'hover:border-[#39FF14] hover:shadow-[0_0_0_1px_rgba(57,255,20,0.1)]'}`}
                    onClick={() => setActiveList(prev => (prev === 'sales' ? null : 'sales'))}
                  >
                    <div className="text-xs text-zinc-500">Sales</div>
                    <div className="text-xl font-semibold">{summary.saTotals.count}</div>
                    <div className="text-[11px] text-zinc-400">{formatCurrency(summary.saTotals.total)} total</div>
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
                            className={`${row.kind === 'work' ? 'hover:bg-zinc-800/50 cursor-pointer' : 'hover:bg-zinc-800/40'} transition-colors`}
                            onClick={() => { if (row.kind === 'work') { void handleRowOpen(row); } }}
                          >
                            <td className="py-2 pr-4 font-mono text-xs text-zinc-200">{row.id}</td>
                            <td className="py-2 pr-4 text-zinc-300">{row.date.toLocaleDateString()}</td>
                            <td className="py-2 pr-4 capitalize text-zinc-300">{row.kind === 'work' ? 'Work order' : 'Sale'}</td>
                            <td className="py-2 pr-4 text-zinc-400">{row.status || '—'}</td>
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
