import React, { useEffect, useMemo, useState } from 'react';

type ReportEmailPayload = {
  generatedAt?: string;
  filters?: {
    period?: string;
    from?: string | null;
    to?: string | null;
    technician?: string | null;
    excludeTax?: boolean;
    includeRepairs?: boolean;
    includeSales?: boolean;
  };
  totals?: {
    grandTotal?: number;
    cashTotal?: number;
    cardTotal?: number;
    changeGiven?: number;
    cashToDeposit?: number;
    orders?: number;
    labor?: number;
    parts?: number;
    subtotal?: number;
    tax?: number;
    cost?: number;
    profit?: number;
    marginPct?: number;
    avgTicket?: number;
  };
  grouped?: Array<{
    date: string;
    orders: number;
    labor: number;
    parts: number;
    subtotal: number;
    tax: number;
    total: number;
    cost: number;
    profit: number;
    marginPct?: number;
  }>;
  csv?: string;
  title?: string;
};

function tryDecodePayload(raw: string | null): ReportEmailPayload | null {
  try {
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

function formatMoney(n: any) {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return '$0.00';
  return `$${num.toFixed(2)}`;
}

const ReportEmailWindow: React.FC<{ payload?: ReportEmailPayload | null }> = ({ payload: payloadProp }) => {
  const payload = useMemo(() => {
    if (payloadProp !== undefined) return payloadProp;
    const params = new URLSearchParams(window.location.search);
    return tryDecodePayload(params.get('reportEmail'));
  }, [payloadProp]);

  const [to, setTo] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);

  const csv = String(payload?.csv || '').trim();

  const computedSubject = useMemo(() => {
    const f = payload?.filters || {};
    const period = (f.period || 'report').toString();
    const from = f.from ? String(f.from) : '';
    const toVal = f.to ? String(f.to) : '';
    const range = from && toVal ? `${from} to ${toVal}` : (from || toVal || '');
    const tech = f.technician ? ` - ${String(f.technician)}` : '';
    const suffix = range ? ` (${range})` : '';
    return `GadgetBoy ${period} report${suffix}${tech}`;
  }, [payload]);

  const computedBody = useMemo(() => {
    const f = payload?.filters || {};
    const t = payload?.totals || {};
    const lines: string[] = [];

    lines.push(payload?.title ? String(payload.title) : 'GadgetBoy Reporting');
    lines.push('');

    const from = f.from ? String(f.from) : '-';
    const toVal = f.to ? String(f.to) : '-';
    lines.push(`Period: ${String(f.period || '-')}`);
    lines.push(`Range: ${from} to ${toVal}`);
    lines.push(`Technician: ${String(f.technician || 'All')}`);
    lines.push(`Include repairs: ${f.includeRepairs === false ? 'No' : 'Yes'}`);
    lines.push(`Include sales: ${f.includeSales === false ? 'No' : 'Yes'}`);
    lines.push(`Revenue: ${f.excludeTax === false ? 'incl tax' : 'excl tax'}`);
    lines.push('');

    if (t.orders != null) lines.push(`Orders: ${Number(t.orders || 0)}`);
    if (t.grandTotal != null) lines.push(`Grand Total: ${formatMoney(t.grandTotal)}`);
    if (t.cashTotal != null) lines.push(`Cash Total: ${formatMoney(t.cashTotal)}`);
    if (t.cardTotal != null) lines.push(`Card Total: ${formatMoney(t.cardTotal)}`);
    if (t.changeGiven != null) lines.push(`Change Given: ${formatMoney(t.changeGiven)}`);
    if (t.cashToDeposit != null) lines.push(`Cash to Deposit: ${formatMoney(t.cashToDeposit)}`);
    if (t.profit != null) lines.push(`Profit: ${formatMoney(t.profit)}`);
    if (t.marginPct != null) lines.push(`Margin: ${Number(t.marginPct || 0).toFixed(1)}%`);
    if (t.avgTicket != null) lines.push(`Avg Ticket: ${formatMoney(t.avgTicket)}`);

    lines.push('');
    lines.push('Attached: report CSV');

    return lines.join('\n');
  }, [payload]);

  useEffect(() => {
    setSubject(computedSubject);
    setBody(computedBody);
  }, [computedSubject, computedBody]);

  async function send() {
    try {
      setMsg(null);
      const api = (window as any).api;
      if (!api || typeof api.emailSendReportCsv !== 'function') {
        setMsg('Email sending is only available inside the Electron app.');
        return;
      }
      const toVal = String(to || '').trim();
      if (!toVal) {
        setMsg('Enter a recipient email.');
        return;
      }
      if (!csv) {
        setMsg('No report data to attach (empty CSV).');
        return;
      }

      setSending(true);

      const filenameBase = (() => {
        const f = payload?.filters || {};
        const from = f.from ? String(f.from) : '';
        const toV = f.to ? String(f.to) : '';
        const range = from && toV ? `${from}_to_${toV}` : (from || toV || '');
        const period = String(f.period || 'report');
        return `gadgetboy-${period}-report${range ? '-' + range : ''}`.replace(/[^a-zA-Z0-9._-]+/g, '-');
      })();

      const res = await api.emailSendReportCsv({
        to: toVal,
        subject: String(subject || computedSubject),
        bodyText: String(body || computedBody),
        filename: `${filenameBase}.csv`,
        csv,
      });

      if (res?.ok) {
        setMsg('Email sent.');
      } else {
        setMsg(String(res?.error || 'Could not send email'));
      }
    } catch (e: any) {
      setMsg(String(e?.message || e || 'Could not send email'));
    } finally {
      setSending(false);
    }
  }

  const rows = payload?.grouped || [];

  return (
    <div className="h-screen bg-zinc-900 text-gray-100 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold">Send Report Email</div>
        <button className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" onClick={() => window.close()}>Close</button>
      </div>

      {!payload && (
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3 text-sm text-amber-300">
          Missing report payload. Open this window from Reporting.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">To</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
              placeholder="name@domain.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <div className="text-[11px] text-zinc-500 mt-1">Tip: you can paste multiple emails separated by commas.</div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Subject</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Body</label>
            <textarea
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 h-56 text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              className="px-4 py-2 bg-[#39FF14] text-black font-semibold rounded disabled:opacity-50"
              disabled={sending || !payload}
              onClick={send}
            >
              {sending ? 'Sending…' : 'Send Email'}
            </button>
            <div className="text-xs text-zinc-400">{csv ? `Attachment: ${csv.split('\n').length - 1} row(s)` : 'No CSV attached'}</div>
          </div>

          {msg && (
            <div className={"text-sm " + (msg.toLowerCase().includes('sent') ? 'text-neon-green' : 'text-amber-300')}>
              {msg}
            </div>
          )}
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400 mb-2">Report Preview</div>
          <div className="text-sm space-y-1">
            <div><span className="text-zinc-400">Grand Total:</span> <span className="font-semibold text-neon-green">{formatMoney(payload?.totals?.grandTotal)}</span></div>
            <div><span className="text-zinc-400">Cash:</span> <span className="font-semibold">{formatMoney(payload?.totals?.cashTotal)}</span></div>
            <div><span className="text-zinc-400">Change given:</span> <span className="font-semibold">{formatMoney(payload?.totals?.changeGiven)}</span></div>
            <div><span className="text-zinc-400">Cash to deposit:</span> <span className="font-semibold">{formatMoney(payload?.totals?.cashToDeposit)}</span></div>
            <div><span className="text-zinc-400">Card:</span> <span className="font-semibold">{formatMoney(payload?.totals?.cardTotal)}</span></div>
          </div>

          <div className="mt-3 overflow-auto max-h-[420px] border border-zinc-800 rounded">
            <table className="w-full text-xs">
              <thead className="bg-zinc-800 text-zinc-300 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">Start</th>
                  <th className="px-2 py-1 text-right">Orders</th>
                  <th className="px-2 py-1 text-right">Revenue</th>
                  <th className="px-2 py-1 text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} className="border-b border-zinc-800">
                    <td className="px-2 py-1">{r.date}</td>
                    <td className="px-2 py-1 text-right">{r.orders}</td>
                    <td className="px-2 py-1 text-right">{formatMoney(r.total)}</td>
                    <td className="px-2 py-1 text-right">{formatMoney(r.profit)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="px-2 py-6 text-center text-zinc-500">No rows.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-zinc-500 mt-2">
            CSV attachment includes full columns (labor/parts/subtotal/tax/cost/margin).
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportEmailWindow;
