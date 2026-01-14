import React, { useEffect, useState } from 'react';
import DevicePicker from '@/components/DevicePicker';
import PatternLock from '../components/PatternLock';
import { WorkOrderFull } from '../lib/types';

const DeviceCategorySelect: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => (
  <div className="mt-1">
    <DevicePicker value={value} onChange={onChange} onTitleSelect={onChange} className="w-full" />
  </div>
);

interface DeviceCategory { id?: number; name: string }

interface Props {
  workOrder: WorkOrderFull;
  onChange: (patch: Partial<WorkOrderFull>) => void;
}

const WorkOrderForm: React.FC<Props> = ({ workOrder, onChange }) => {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-zinc-200">Item / Problem</h3>
        <div className="text-xs text-zinc-400">Product info</div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className="block text-xs text-zinc-400">Device Category</label>
          <DeviceCategorySelect value={workOrder.productCategory} onChange={val => onChange({ productCategory: val })} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-400">Product description</label>
          <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={workOrder.productDescription} onChange={e => onChange({ productDescription: e.target.value })} />
        </div>
      </div>

      <div className="mb-2">
        <label className="block text-xs text-zinc-400">Problem / Additional info</label>
        <textarea className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 h-16" value={workOrder.problemInfo || ''} onChange={e => onChange({ problemInfo: e.target.value })} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-zinc-400">Password</label>
          <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={workOrder.password || ''} onChange={e => onChange({ password: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-zinc-400">Model</label>
          <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={workOrder.model || ''} onChange={e => onChange({ model: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-zinc-400">Serial</label>
          <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={workOrder.serial || ''} onChange={e => onChange({ serial: e.target.value })} />
        </div>
      </div>

      <PatternSection workOrder={workOrder} onChange={onChange} />
    </div>
  );
}

export default WorkOrderForm;

const PatternSection: React.FC<{ workOrder: WorkOrderFull; onChange: (patch: Partial<WorkOrderFull>) => void }> = ({ workOrder, onChange }) => {
  const [enabled, setEnabled] = useState<boolean>(() => Array.isArray((workOrder as any).patternSequence) && (workOrder as any).patternSequence.length > 0);
  const seq = (workOrder as any).patternSequence as number[] | undefined;

  if (!enabled) {
    return (
      <div className="mt-2">
        <button
          type="button"
          className="text-xs px-2 py-1 border border-zinc-700 rounded bg-zinc-800 hover:bg-zinc-700"
          onClick={() => setEnabled(true)}
        >
          Add unlock pattern
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <label className="block text-xs text-zinc-400 mb-1">Pattern (drag to set)</label>
      <div className="flex items-center gap-3">
        <PatternLock
          value={Array.isArray(seq) ? seq : []}
          onChange={(s) => onChange({ patternSequence: s as any })}
          size={140}
          dotRadius={7}
          strokeColor="#39FF14"
        />
        <div className="text-xs text-zinc-400">
          <div>• Drag from a dot; release to finish</div>
          <div>• Arrow shows the end of the path</div>
          <button
            type="button"
            className="mt-1 text-xs px-2 py-1 border border-zinc-700 rounded bg-zinc-800 hover:bg-zinc-700"
            onClick={() => { onChange({ patternSequence: [] as any }); setEnabled(false); }}
          >
            Remove pattern
          </button>
        </div>
      </div>
    </div>
  );
};
