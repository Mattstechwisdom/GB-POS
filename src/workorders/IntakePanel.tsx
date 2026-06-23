import React, { useEffect, useState } from 'react';
import { WorkOrderFull, Customer } from '../lib/types';
import { INTAKE_SOURCES, INTAKE_SOURCE_PLACEHOLDER } from '../lib/intakeSources';
import { toLocalDatetimeInput, fromLocalDatetimeInput } from '../lib/datetime';
import { formatPhone } from '../lib/format';

interface Props { workOrder: WorkOrderFull; onChange: (p: Partial<WorkOrderFull>) => void; customerSummary?: { name?: string; phone?: string }; recordType?: 'repair' | 'sale' }

const IntakePanel: React.FC<Props> = ({ workOrder, onChange, customerSummary, recordType = 'repair' }) => {
  const [fullCustomer, setFullCustomer] = useState<Customer | null>(null);
  const [customMode, setCustomMode] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrStatusUrl, setQrStatusUrl] = useState<string>('');

  // Load QR code for this record
  useEffect(() => {
    const id = Number(workOrder.id || 0);
    if (!id) { setQrDataUrl(''); setQrStatusUrl(''); return; }
    let alive = true;
    (async () => {
      try {
        const api = (window as any).api;
        if (!api?.qrGetStatusUrl) return;
        const urlRes = await api.qrGetStatusUrl(recordType, id);
        if (!alive || !urlRes?.ok || !urlRes?.url) return;
        setQrStatusUrl(urlRes.url);
        const qrRes = await api.qrGetDataUrl(urlRes.url);
        if (!alive || !qrRes?.ok || !qrRes?.dataUrl) return;
        setQrDataUrl(qrRes.dataUrl);
      } catch {}
    })();
    return () => { alive = false; };
  }, [workOrder.id, recordType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch full customer details if we have an id
  useEffect(() => {
    (async () => {
      if (!workOrder.customerId) { setFullCustomer(null); return; }
      try {
        // Assuming preload exposes findCustomers filterable by id
        const list = await (window as any).api.findCustomers({ id: workOrder.customerId });
        if (Array.isArray(list) && list.length) setFullCustomer(list[0]);
        else setFullCustomer(null);
      } catch (e) {
        console.warn('Failed to load customer details', e);
        setFullCustomer(null);
      }
    })();
  }, [workOrder.customerId]);

  const displayName = fullCustomer
    ? [fullCustomer.firstName, fullCustomer.lastName].filter(Boolean).join(' ')
    : (customerSummary?.name || 'Selected Customer');
  const displayPhoneRaw = fullCustomer?.phone || customerSummary?.phone || '';
  const displayPhone = (formatPhone(String(displayPhoneRaw || '')) || String(displayPhoneRaw || '') || '—');
  const displayEmail = fullCustomer?.email || '';

  const isKnownSource = !!(workOrder.intakeSource) && INTAKE_SOURCES.includes(workOrder.intakeSource as string);
  const isCustomValue = !!(workOrder.intakeSource) && !INTAKE_SOURCES.includes(workOrder.intakeSource as string);
  const showCustomInput = customMode || isCustomValue;
  const selectValue = showCustomInput ? '__custom__' : (workOrder.intakeSource || '');

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
      <h4 className="text-sm font-semibold text-zinc-200 mb-2">Check-in & Customer</h4>
  <label className="block text-xs text-zinc-400">Check-in</label>
  <input type="datetime-local" className="w-full mt-1 mb-2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={toLocalDatetimeInput(workOrder.checkInAt)} onChange={e => onChange({ checkInAt: fromLocalDatetimeInput(e.target.value) as any })} />

      <div className="mb-2 text-xs text-zinc-400">Customer info (read-only) — populated from selected client</div>
      <div className="flex gap-2 items-stretch mb-2">
        {qrDataUrl ? (
          <div className="flex-shrink-0 flex flex-col items-center justify-center bg-white rounded p-1 border border-zinc-600" title={qrStatusUrl || 'Status QR'} style={{ width: 64, height: 64 }}>
            <img src={qrDataUrl} alt="Status QR" style={{ width: 56, height: 56 }} />
          </div>
        ) : (
          <div className="flex-shrink-0 flex items-center justify-center bg-zinc-800 rounded border border-zinc-700 text-zinc-600 text-[9px] text-center" style={{ width: 64, height: 64, lineHeight: 1.2 }}>
            {Number(workOrder.id || 0) ? 'Loading QR…' : 'Save first'}
          </div>
        )}
        <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded p-2 space-y-0.5 min-w-0">
          <div className="text-sm text-neon-green font-medium truncate" title={displayName}>{displayName}</div>
          {displayEmail && <div className="text-xs text-zinc-300 truncate" title={displayEmail}>{displayEmail}</div>}
          <div className="text-xs text-zinc-400" title={displayPhone}>{displayPhone}</div>
        </div>
      </div>
      <button
        className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 mb-3"
        onClick={() => {
          if (workOrder.customerId) (window as any).api.openCustomerOverview(workOrder.customerId);
        }}
        disabled={!workOrder.customerId}
      >View customer</button>

      <label className="block text-xs text-zinc-400">How did you hear about us?</label>
      <select
        className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
        value={selectValue}
        onChange={e => {
          const val = e.target.value;
          if (val === '__custom__') {
            setCustomMode(true);
            // If current value is a known source, clear it to let user type; if already custom, keep it
            if (!isCustomValue) onChange({ intakeSource: '' });
          } else {
            setCustomMode(false);
            onChange({ intakeSource: val });
          }
        }}
      >
        <option value="">{INTAKE_SOURCE_PLACEHOLDER}</option>
        {INTAKE_SOURCES.map(src => (
          <option key={src} value={src}>{src}</option>
        ))}
        <option value="__custom__">Custom…</option>
      </select>

      {showCustomInput && (
        <div className="mt-2">
          <label className="block text-xs text-zinc-400 mb-1">Enter custom source</label>
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
            type="text"
            value={workOrder.intakeSource || ''}
            placeholder="Type source (e.g., Flyer, Craigslist, University, etc.)"
            onChange={e => onChange({ intakeSource: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export default React.memo(IntakePanel, (prev, next) => {
  const a = prev.workOrder;
  const b = next.workOrder;
  return Number(a.id || 0) === Number(b.id || 0)
    && Number(a.customerId || 0) === Number(b.customerId || 0)
    && String(a.checkInAt || '') === String(b.checkInAt || '')
    && String(a.intakeSource || '') === String(b.intakeSource || '')
    && String(prev.customerSummary?.name || '') === String(next.customerSummary?.name || '')
    && String(prev.customerSummary?.phone || '') === String(next.customerSummary?.phone || '')
    && String(prev.recordType || 'repair') === String(next.recordType || 'repair');
});
