import React, { useState, useEffect } from 'react';
import Input from './Input';
import Button from './Button';

interface Props {
  workOrder?: any;
  onSave: (w: any) => void;
  onCancel: () => void;
}

const WorkOrderForm: React.FC<Props> = ({ workOrder, onSave, onCancel }) => {
  const [local, setLocal] = useState<any>(workOrder || {});
  useEffect(() => setLocal(workOrder || {}), [workOrder]);

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/50">
      <div className="bg-zinc-900 border border-zinc-700 rounded p-4 w-[640px]">
        <h3 className="font-semibold mb-2">Work Order</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400">Summary</label>
            <Input value={local.summary || ''} onChange={e => setLocal((s:any) => ({ ...s, summary: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Assigned To</label>
            <Input value={local.assignedTo || ''} onChange={e => setLocal((s:any) => ({ ...s, assignedTo: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Total</label>
            <Input value={local.total || 0} onChange={e => setLocal((s:any) => ({ ...s, total: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Balance</label>
            <Input value={local.balance || 0} onChange={e => setLocal((s:any) => ({ ...s, balance: Number(e.target.value) }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button className="bg-zinc-700" onClick={onCancel}>Cancel</Button>
          <Button neon onClick={() => onSave(local)}>Save</Button>
        </div>
      </div>
    </div>
  );
};

export default WorkOrderForm;
