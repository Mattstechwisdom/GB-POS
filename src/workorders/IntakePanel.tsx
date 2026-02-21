import React, { useEffect, useState } from 'react';
import { WorkOrderFull, Customer } from '../lib/types';
import { INTAKE_SOURCES, INTAKE_SOURCE_PLACEHOLDER } from '../lib/intakeSources';
import { toLocalDatetimeInput, fromLocalDatetimeInput } from '../lib/datetime';
import { formatPhone } from '../lib/format';

interface Props { workOrder: WorkOrderFull; onChange: (p: Partial<WorkOrderFull>) => void; customerSummary?: { name?: string; phone?: string } }

const IntakePanel: React.FC<Props> = ({ workOrder, onChange, customerSummary }) => {
  const [fullCustomer, setFullCustomer] = useState<Customer | null>(null);
  const [customMode, setCustomMode] = useState<boolean>(false);

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
      <div className="bg-zinc-800 border border-zinc-700 rounded p-2 mb-2 space-y-0.5">
        <div className="text-sm text-neon-green font-medium truncate" title={displayName}>{displayName}</div>
        {displayEmail && <div className="text-xs text-zinc-300 truncate" title={displayEmail}>{displayEmail}</div>}
        <div className="text-xs text-zinc-400" title={displayPhone}>{displayPhone}</div>
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

export default IntakePanel;
