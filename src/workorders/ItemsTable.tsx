import React, { useState, useEffect, useRef } from 'react';

// Use the new WorkOrderItemRow type
export type WorkOrderItemRow = {
  id: string;
  device: string;
  repair: string;
  parts: number;
  labor: number;
  status?: string;
  note?: string;
};

interface Props { items: WorkOrderItemRow[]; onChange: (items: WorkOrderItemRow[]) => void }

const MAX_ITEMS = 5;

const ItemsTable: React.FC<Props> = ({ items, onChange }) => {
  const [selected, setSelected] = useState<string | null>(items[0]?.id || null);
  const [editing, setEditing] = useState<WorkOrderItemRow | null>(null);

  useEffect(() => { if (items.length === 0) setSelected(null); }, [items]);

  async function newItem() {
    if (items.length >= MAX_ITEMS) return;
    const api: any = window.api;
    if (!api) return;
    // Prefer promise-based picker if available
    if (typeof api.pickRepairItem === 'function') {
      let selected: any;
      try {
        selected = await api.pickRepairItem();
        console.log('[ItemsTable] pickRepairItem resolved', selected);
      } catch (e) {
        console.error('[ItemsTable] pickRepairItem failed', e);
        return;
      }
      if (!selected) return; // cancelled
      const row: WorkOrderItemRow = {
        id: crypto.randomUUID(),
        device: selected.category || selected.deviceCategoryName || selected.device || '',
        repair: selected.altDescription || selected.title || selected.repair || '',
        parts: Number(selected.partCost ?? 0) || 0,
        labor: Number(selected.laborCost ?? 0) || 0,
        status: 'pending',
        note: selected.model || selected.modelNumber || '',
      };
      onChange([...items, row].slice(0, MAX_ITEMS));
      return;
    }
    // Fallback: open legacy picker window
    if (api.openWorkOrderRepairPicker) {
      api.openWorkOrderRepairPicker();
    } else {
      const url = window.location.origin + '/?workOrderRepairPicker=true';
      window.open(url, '_blank', 'width=1000,height=620');
    }
  }

  // Listen for repair selection from picker window via Electron IPC
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  // No IPC handler here; handled in parent

  function removeSelected() {
    if (!selected) return;
    onChange(items.filter(i => i.id !== selected));
    setSelected(null);
  }

  function editSelected() {
    const f = items.find(i => i.id === selected);
    if (f) setEditing(f);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-zinc-200">Items</h4>
        <div className="text-xs text-zinc-400">Add parts/services (max {MAX_ITEMS})</div>
      </div>
      <div className="overflow-y-auto border border-zinc-800 rounded" style={{ maxHeight: '10rem' }}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="px-2 py-1">Device</th>
              <th className="px-2 py-1">Repair</th>
              <th className="px-2 py-1">Parts</th>
              <th className="px-2 py-1">Labor</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const isSel = selected === it.id;
              return (
                <tr
                  key={it.id}
                  onClick={() => setSelected(it.id)}
                  className={`cursor-pointer transition-colors border-l-4 ${isSel ? 'border-[#39FF14] bg-zinc-800/80 shadow-[inset_0_0_0_1px_#1f1f21,0_0_5px_1px_rgba(57,255,20,0.25)]' : 'border-transparent hover:bg-zinc-800/60'}`}
                >
                  <td className="px-2 py-1 font-medium">{it.device || ''}</td>
                  <td className="px-2 py-1">{it.repair}</td>
                  <td className="px-2 py-1">{typeof it.parts === 'number' ? `$${it.parts.toFixed(2)}` : ''}</td>
                  <td className="px-2 py-1">{typeof it.labor === 'number' ? `$${it.labor.toFixed(2)}` : ''}</td>
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, MAX_ITEMS - items.length) }).map((_, idx) => (
              <tr key={`filler-${idx}`} className="opacity-60">
                <td className="px-2 py-1">&nbsp;</td>
                <td className="px-2 py-1">&nbsp;</td>
                <td className="px-2 py-1">&nbsp;</td>
                <td className="px-2 py-1">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 mt-2">
        <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded disabled:opacity-50" onClick={newItem} disabled={items.length >= MAX_ITEMS}>New item</button>
        <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded" onClick={editSelected} disabled={!selected}>Edit selected</button>
        <button className="px-3 py-1 bg-red-700 text-white rounded" onClick={removeSelected} disabled={!selected}>Remove selected</button>
      </div>

      {editing && (
        <div className="mt-2 bg-zinc-800 border border-zinc-700 rounded p-2">
          <label className="block text-xs text-zinc-400">Repair</label>
          <input className="w-full mt-1 bg-zinc-900 rounded px-2 py-1" value={editing.repair} onChange={e => setEditing({ ...editing, repair: e.target.value })} />
          <div className="flex gap-2 mt-2">
            <input className="w-1/2 bg-zinc-900 rounded px-2 py-1" value={editing.parts} onChange={e => setEditing({ ...editing, parts: Number(e.target.value) })} />
            <input className="w-1/2 bg-zinc-900 rounded px-2 py-1" value={editing.labor} onChange={e => setEditing({ ...editing, labor: Number(e.target.value) })} />
          </div>
          <div className="flex gap-2 mt-2 justify-end">
            <button className="px-3 py-1 bg-zinc-800 rounded" onClick={() => setEditing(null)}>Cancel</button>
            <button className="px-3 py-1 bg-brand text-black rounded" onClick={() => { onChange(items.map(i => i.id === editing.id ? editing : i)); setEditing(null); }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ItemsTable;
