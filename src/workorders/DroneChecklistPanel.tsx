import React from 'react';
import type { DroneChecklist } from '../lib/types';

interface DroneChecklistPanelProps {
  checklist: DroneChecklist;
  onChange: (next: DroneChecklist) => void;
}

function field<K extends keyof DroneChecklist>(
  checklist: DroneChecklist,
  onChange: (next: DroneChecklist) => void,
  key: K,
  value: DroneChecklist[K]
) {
  onChange({ ...checklist, [key]: value });
}

const ITEMS: Array<{
  key: keyof DroneChecklist;
  label: string;
  qtyKey?: keyof DroneChecklist;
}> = [
  { key: 'droneBody',         label: 'Drone Body' },
  { key: 'remote',            label: 'Remote' },
  { key: 'propellers',        label: 'Propellers',        qtyKey: 'propellersQty' },
  { key: 'propellerGuards',   label: 'Propeller Guards',  qtyKey: 'propellerGuardsQty' },
  { key: 'batteries',         label: 'Batteries',         qtyKey: 'batteriesQty' },
  { key: 'chargingDockCable', label: 'Charging Dock / Cable' },
  { key: 'carryingCase',      label: 'Carrying Case' },
  { key: 'microSDCard',       label: 'MicroSD Card',      qtyKey: 'microSDCardQty' },
];

export function defaultDroneChecklist(): DroneChecklist {
  return {
    droneBody: false,
    remote: false,
    propellers: false,
    propellersQty: '',
    propellerGuards: false,
    propellerGuardsQty: '',
    batteries: false,
    batteriesQty: '',
    chargingDockCable: false,
    carryingCase: false,
    microSDCard: false,
    microSDCardQty: '',
    other: false,
    otherDescription: '',
  };
}

export default function DroneChecklistPanel({ checklist, onChange }: DroneChecklistPanelProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-zinc-200">Drone Drop-off Items</h4>
        <span className="text-[11px] text-zinc-500">Check all items included at drop-off</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ITEMS.map(({ key, label, qtyKey }) => (
          <div key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`drone-${key}`}
              checked={!!checklist[key]}
              onChange={e => field(checklist, onChange, key, e.target.checked as any)}
              className="w-4 h-4 accent-[#39FF14] flex-shrink-0"
            />
            <label htmlFor={`drone-${key}`} className="text-sm text-zinc-300 cursor-pointer flex-1">
              {label}
            </label>
            {qtyKey && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-zinc-500">QTY:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(checklist[qtyKey] ?? '')}
                  onChange={e => field(checklist, onChange, qtyKey, e.target.value as any)}
                  placeholder="—"
                  className="w-14 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-sm text-center focus:border-[#39FF14] focus:outline-none"
                />
              </div>
            )}
          </div>
        ))}

        {/* Other — full width */}
        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="drone-other"
            checked={!!checklist.other}
            onChange={e => field(checklist, onChange, 'other', e.target.checked as any)}
            className="w-4 h-4 accent-[#39FF14] flex-shrink-0"
          />
          <label htmlFor="drone-other" className="text-sm text-zinc-300 cursor-pointer whitespace-nowrap">
            Other:
          </label>
          <input
            type="text"
            value={checklist.otherDescription}
            onChange={e => field(checklist, onChange, 'otherDescription', e.target.value as any)}
            placeholder="Describe other item(s)…"
            className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
