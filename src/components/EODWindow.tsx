import React, { useEffect, useMemo, useState } from 'react';
import { useAutosave } from '../lib/useAutosave';

interface EodSettings {
  id?: number;
  recipients: string;
  summaryStyle: 'concise' | 'detailed';
  includeWorkOrders: boolean;
  includeSales: boolean;
  includeUnpaid: boolean;
  includeTaxes: boolean;
  schedule: 'manual' | 'daily' | 'weekly';
  sendTime: string; // HH:mm
  batchOutTime?: string; // HH:mm
  autoBackup?: boolean;
  subjectTemplate: string;
  headline?: string;
  notes?: string;
  lastSentAt?: string | null;
}

const defaultSettings: EodSettings = {
  recipients: '',
  summaryStyle: 'concise',
  includeWorkOrders: true,
  includeSales: true,
  includeUnpaid: true,
  includeTaxes: true,
  schedule: 'daily',
  sendTime: '18:00',
  batchOutTime: '21:00',
  autoBackup: true,
  subjectTemplate: 'GadgetBoy EOD - {{date}}',
  headline: 'Daily wrap-up',
  notes: '',
  lastSentAt: null,
};

type RangeKey = 'today' | 'yesterday' | 'last7' | 'custom';

function getRange(key: RangeKey, customFrom: string, customTo: string) {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);
  if (key === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  }
  if (key === 'last7') {
    start.setDate(start.getDate() - 6);
  }
  if (key === 'custom') {
    const from = customFrom ? new Date(customFrom) : start;
    const to = customTo ? new Date(customTo) : end;
    return { start: from, end: to };
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatCurrency(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  try {
    const date = new Date(d);
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d;
  }
}

function renderTemplate(str: string, ctx: Record<string, string>) {
  return str.replace(/{{\s*(\w+)\s*}}/g, (_m, k) => ctx[k] || '');
}

export default function EODWindow() {
  const [settings, setSettings] = useState<EodSettings>(defaultSettings);
  const [range, setRange] = useState<RangeKey>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [sending, setSending] = useState(false);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [batchInfo, setBatchInfo] = useState<{ lastBackupPath?: string; lastBackupDate?: string; lastBatchOutDate?: string }>({});

  // Load saved settings
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await (window as any).api.dbGet('eodSettings').catch(() => []);
        const first = Array.isArray(rows) && rows.length ? rows[0] : null;
        if (mounted && first) setSettings({ ...defaultSettings, ...first });
      } catch (e) {
        console.error('Failed to load EOD settings', e);
      } finally {
        if (mounted) setLoadingSettings(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load data to summarize
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingData(true);
      try {
        const [wo, sa] = await Promise.all([
          (window as any).api.getWorkOrders?.() ?? (window as any).api.dbGet('workOrders'),
          (window as any).api.dbGet('sales'),
        ]);
        if (mounted) {
          setWorkOrders(Array.isArray(wo) ? wo : []);
          setSales(Array.isArray(sa) ? sa : []);
        }
      } catch (e) {
        console.error('Failed to load data for EOD', e);
      } finally {
        if (mounted) setLoadingData(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const info = await (window as any).api.getBatchOutInfo?.();
        if (mounted && info) setBatchInfo(info);
      } catch (e) {
        console.warn('Failed to load batch-out info', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Autosave settings
  useAutosave(settings, async (val) => {
    const api = (window as any).api;
    const payload = { ...defaultSettings, ...val, updatedAt: new Date().toISOString() } as any;
    if (payload.id) {
      await api.dbUpdate('eodSettings', payload.id, payload);
    } else {
      const saved = await api.dbAdd('eodSettings', payload);
      if (saved?.id) setSettings(s => ({ ...s, id: saved.id }));
    }
  }, {
    debounceMs: 1000,
    enabled: !loadingSettings,
    shouldSave: (v) => !!(v.recipients || v.headline),
  });

  const { start, end } = useMemo(() => getRange(range, customFrom, customTo), [range, customFrom, customTo]);

  const summary = useMemo(() => {
    const inRange = (d: any) => {
      try {
        const date = new Date(d || 0);
        return date >= start && date <= end;
      } catch {
        return false;
      }
    };

    const wo = settings.includeWorkOrders ? workOrders.filter(w => inRange(w.checkoutDate || w.createdAt || w.checkInAt)) : [];
    const sa = settings.includeSales ? sales.filter(s => inRange(s.createdAt || s.checkInAt)) : [];

    const woTotals = wo.reduce((acc, w) => {
      const total = Number(w.totals?.total || w.total || 0) || 0;
      const paid = Number(w.amountPaid || 0) || 0;
      acc.count += 1;
      acc.total += total;
      acc.paid += paid;
      acc.remaining += Math.max(0, total - paid);
      return acc;
    }, { count: 0, total: 0, paid: 0, remaining: 0 });

    const saTotals = sa.reduce((acc, s) => {
      const total = Number(s.totals?.total || s.total || 0) || 0;
      const paid = Number(s.amountPaid || 0) || 0;
      acc.count += 1;
      acc.total += total;
      acc.paid += paid;
      acc.remaining += Math.max(0, total - paid);
      return acc;
    }, { count: 0, total: 0, paid: 0, remaining: 0 });

    const grandTotal = woTotals.total + saTotals.total;
    const grandPaid = woTotals.paid + saTotals.paid;
    const grandRemaining = woTotals.remaining + saTotals.remaining;

    return {
      woTotals,
      saTotals,
      grandTotal,
      grandPaid,
      grandRemaining,
      items: { wo, sa },
    };
  }, [workOrders, sales, settings.includeSales, settings.includeWorkOrders, start, end]);

  const conciseLines = useMemo(() => {
    const parts = [] as string[];
    if (settings.includeWorkOrders) {
      parts.push(`Work Orders: ${summary.woTotals.count} | ${formatCurrency(summary.woTotals.total)} total | ${formatCurrency(summary.woTotals.remaining)} remaining`);
    }
    if (settings.includeSales) {
      parts.push(`Sales: ${summary.saTotals.count} | ${formatCurrency(summary.saTotals.total)} total | ${formatCurrency(summary.saTotals.remaining)} remaining`);
    }
    parts.push(`Combined: ${formatCurrency(summary.grandTotal)} | Collected: ${formatCurrency(summary.grandPaid)} | Remaining: ${formatCurrency(summary.grandRemaining)}`);
    return parts.join('\n');
  }, [settings.includeWorkOrders, settings.includeSales, summary]);

  const emailHtml = useMemo(() => {
    const dateLabel = `${start.toLocaleDateString()} — ${end.toLocaleDateString()}`;
    const sections: string[] = [];
    sections.push(`<h2 style="margin:0 0 8px 0;">${settings.headline || 'End of Day'}</h2>`);
    sections.push(`<div style="color:#888;margin-bottom:8px;">${dateLabel}</div>`);
    sections.push('<table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-family:Arial, sans-serif;font-size:13px;">'
      + '<thead><tr>'
      + '<th style="text-align:left;border-bottom:1px solid #333;padding:6px 4px;">Area</th>'
      + '<th style="text-align:right;border-bottom:1px solid #333;padding:6px 4px;">Count</th>'
      + '<th style="text-align:right;border-bottom:1px solid #333;padding:6px 4px;">Total</th>'
      + '<th style="text-align:right;border-bottom:1px solid #333;padding:6px 4px;">Remaining</th>'
      + '</tr></thead>'
      + '<tbody>'
      + (settings.includeWorkOrders ? `<tr><td style="padding:6px 4px;border-bottom:1px solid #222;">Work Orders</td><td style="padding:6px 4px;text-align:right;border-bottom:1px solid #222;">${summary.woTotals.count}</td><td style="padding:6px 4px;text-align:right;border-bottom:1px solid #222;">${formatCurrency(summary.woTotals.total)}</td><td style="padding:6px 4px;text-align:right;border-bottom:1px solid #222;">${formatCurrency(summary.woTotals.remaining)}</td></tr>` : '')
      + (settings.includeSales ? `<tr><td style="padding:6px 4px;border-bottom:1px solid #222;">Sales</td><td style="padding:6px 4px;text-align:right;border-bottom:1px solid #222;">${summary.saTotals.count}</td><td style="padding:6px 4px;text-align:right;border-bottom:1px solid #222;">${formatCurrency(summary.saTotals.total)}</td><td style="padding:6px 4px;text-align:right;border-bottom:1px solid #222;">${formatCurrency(summary.saTotals.remaining)}</td></tr>` : '')
      + `<tr><td style="padding:6px 4px;font-weight:700;">Combined</td><td style="padding:6px 4px;text-align:right;">${summary.woTotals.count + summary.saTotals.count}</td><td style="padding:6px 4px;text-align:right;font-weight:700;">${formatCurrency(summary.grandTotal)}</td><td style="padding:6px 4px;text-align:right;font-weight:700;">${formatCurrency(summary.grandRemaining)}</td></tr>`
      + '</tbody></table>');

    if (settings.summaryStyle === 'detailed') {
      const listRows = [...summary.items.wo.map(w => ({
        type: 'WO',
        id: w.id,
        label: w.productDescription || w.summary || w.productCategory || 'Work order',
        total: Number(w.totals?.total || w.total || 0) || 0,
        remaining: Math.max(0, (Number(w.totals?.total || w.total || 0) || 0) - (Number(w.amountPaid || 0) || 0)),
      })), ...summary.items.sa.map(s => ({
        type: 'Sale',
        id: s.id,
        label: (Array.isArray(s.items) && s.items[0]?.description) || s.itemDescription || 'Sale',
        total: Number(s.totals?.total || s.total || 0) || 0,
        remaining: Math.max(0, (Number(s.totals?.total || s.total || 0) || 0) - (Number(s.amountPaid || 0) || 0)),
      }))];
      listRows.sort((a, b) => b.total - a.total);
      sections.push('<div style="margin-top:4px; margin-bottom:12px; font-weight:600;">Line items</div>');
      sections.push('<table style="width:100%;border-collapse:collapse;font-family:Arial, sans-serif;font-size:12px;">'
        + '<thead><tr>'
        + '<th style="text-align:left;border-bottom:1px solid #333;padding:4px;">Type</th>'
        + '<th style="text-align:left;border-bottom:1px solid #333;padding:4px;">Label</th>'
        + '<th style="text-align:right;border-bottom:1px solid #333;padding:4px;">Total</th>'
        + '<th style="text-align:right;border-bottom:1px solid #333;padding:4px;">Remaining</th>'
        + '</tr></thead><tbody>'
        + listRows.map(r => `<tr><td style="padding:4px;border-bottom:1px solid #222;">${r.type}</td><td style="padding:4px;border-bottom:1px solid #222;">${r.label}</td><td style="padding:4px;text-align:right;border-bottom:1px solid #222;">${formatCurrency(r.total)}</td><td style="padding:4px;text-align:right;border-bottom:1px solid #222;">${formatCurrency(r.remaining)}</td></tr>`).join('')
        + '</tbody></table>');
    }

    if (settings.notes) {
      sections.push(`<div style="margin-top:12px;padding:10px;border:1px solid #333;border-radius:8px;background:#0f0f10;">${settings.notes}</div>`);
    }

    return sections.join('');
  }, [settings.headline, settings.includeSales, settings.includeWorkOrders, settings.notes, settings.summaryStyle, summary, start, end]);

  const subject = useMemo(() => {
    const dateStr = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    return renderTemplate(settings.subjectTemplate || defaultSettings.subjectTemplate, { date: dateStr });
  }, [settings.subjectTemplate, start, end]);

  async function handleSend() {
    if (sending) return;
    const recipients = (settings.recipients || '').split(/[;,]/).map(r => r.trim()).filter(Boolean);
    if (!recipients.length) { alert('Add at least one recipient'); return; }
    setSending(true);
    try {
      const api = (window as any).api;
      if (!api?.emailSendQuote) {
        alert('Email sending not configured in this build.');
        return;
      }
      const text = `${settings.headline || 'End of Day'}\n${conciseLines}\n${message || ''}`;
      for (const to of recipients) {
        await api.emailSendQuote({ to, subject, bodyText: text, filename: 'eod.html', html: emailHtml });
      }
      setSettings(s => ({ ...s, lastSentAt: new Date().toISOString() }));
      alert('EOD sent');
    } catch (e) {
      console.error('EOD send failed', e);
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

  const suggestions = [
    'Auto-attach CSV of daily totals',
    'Schedule SMS summary to store phone',
    'Include technician commission snapshot',
    'Send separate summaries for sales vs repairs',
  ];

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-50 p-4">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Admin</div>
            <h1 className="text-3xl font-bold text-[#39FF14]">End of Day</h1>
            <p className="text-zinc-400 text-sm max-w-2xl">Configure how daily totals are grouped, preview the concise email, and send or schedule EOD drops to your team.</p>
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]"
              onClick={() => handleSend()}
              disabled={sending}
            >{sending ? 'Sending…' : 'Send now'}</button>
            <button
              className="px-3 py-2 text-sm bg-[#39FF14] text-black border border-[#39FF14] rounded hover:brightness-110"
              onClick={() => handleBatchOutNow()}
              disabled={sending}
            >Batch Out now</button>
            <button
              className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]"
              onClick={() => window.close()}
            >Close</button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3">
          {/* Filters */}
          <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Date & Filters</h3>
              <span className="text-xs text-zinc-500">{loadingData ? 'Loading…' : 'Live'}</span>
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
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.includeWorkOrders} onChange={e => setSettings(s => ({ ...s, includeWorkOrders: e.target.checked }))} />Work Orders</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.includeSales} onChange={e => setSettings(s => ({ ...s, includeSales: e.target.checked }))} />Sales</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.includeUnpaid} onChange={e => setSettings(s => ({ ...s, includeUnpaid: e.target.checked }))} />Highlight remaining</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.includeTaxes} onChange={e => setSettings(s => ({ ...s, includeTaxes: e.target.checked }))} />Show taxes</label>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Style</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 px-3 py-2 rounded border text-sm ${settings.summaryStyle === 'concise' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}
                  onClick={() => setSettings(s => ({ ...s, summaryStyle: 'concise' }))}
                >Concise</button>
                <button
                  type="button"
                  className={`flex-1 px-3 py-2 rounded border text-sm ${settings.summaryStyle === 'detailed' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}
                  onClick={() => setSettings(s => ({ ...s, summaryStyle: 'detailed' }))}
                >Detailed</button>
              </div>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-300 leading-relaxed">
              Quick ideas: consider splitting delivery vs. pickup revenue, tracking deposits separately, or surfacing refunds in the daily note.
            </div>
          </div>

          {/* Recipients & scheduling */}
          <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
            <h3 className="text-lg font-semibold">Recipients & timing</h3>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">To (comma or semicolon)</label>
              <textarea
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm"
                placeholder="ops@gadgetboy.com; owner@gadgetboy.com"
                value={settings.recipients}
                onChange={e => setSettings(s => ({ ...s, recipients: e.target.value }))}
              />
            </div>
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
                <input
                  type="time"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2"
                  value={settings.sendTime}
                  onChange={e => setSettings(s => ({ ...s, sendTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm items-end">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Batch Out time (auto backup)</label>
                <input
                  type="time"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2"
                  value={settings.batchOutTime || ''}
                  onChange={e => setSettings(s => ({ ...s, batchOutTime: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.autoBackup !== false} onChange={e => setSettings(s => ({ ...s, autoBackup: e.target.checked }))} />
                Enable auto Batch Out backup
              </label>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Subject template</label>
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm"
                value={settings.subjectTemplate}
                onChange={e => setSettings(s => ({ ...s, subjectTemplate: e.target.value }))}
              />
              <div className="text-[11px] text-zinc-500 mt-1">Use {'{{date}}'} for the selected range.</div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Headline (optional)</label>
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm"
                value={settings.headline || ''}
                onChange={e => setSettings(s => ({ ...s, headline: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Footer note</label>
              <textarea
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm"
                value={settings.notes || ''}
                onChange={e => setSettings(s => ({ ...s, notes: e.target.value }))}
              />
            </div>
            <div className="text-xs text-zinc-500">Last sent: {settings.lastSentAt ? formatDate(settings.lastSentAt) : 'Not yet sent'}</div>
            <div className="text-xs text-zinc-500">Last Batch Out: {batchInfo?.lastBatchOutDate ? formatDate(batchInfo.lastBatchOutDate) : 'Not yet run'}</div>
          </div>

          {/* Preview & message */}
          <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Preview</h3>
              <span className="text-xs text-zinc-500">{subject}</span>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 text-sm font-mono whitespace-pre-wrap text-zinc-200">
              {conciseLines || 'No data in range.'}
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Add a short note (shown in email body)</label>
              <textarea
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm"
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded p-3 text-xs text-zinc-200 space-y-2">
              <div className="flex items-center justify-between">
                <span>Combined total</span>
                <span className="font-semibold text-[#39FF14]">{formatCurrency(summary.grandTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Collected</span>
                <span>{formatCurrency(summary.grandPaid)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Remaining</span>
                <span>{formatCurrency(summary.grandRemaining)}</span>
              </div>
            </div>
            <div className="text-xs text-zinc-400">Potential add-ons: {suggestions.join(' · ')}. Which ones should we prioritize next?</div>
          </div>
        </div>
      </div>
    </div>
  );
}
