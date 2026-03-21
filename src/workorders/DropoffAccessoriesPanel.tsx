import React, { useState } from 'react';
import { DropoffAccessory } from '../lib/types';

interface Props {
  accessories: DropoffAccessory[];
  onChange: (next: DropoffAccessory[]) => void;
}

let _nextId = 1;
function genId() { return `doa-${Date.now()}-${_nextId++}`; }

const DropoffAccessoriesPanel: React.FC<Props> = ({ accessories, onChange }) => {
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');

  const add = () => {
    const trimmed = desc.trim();
    if (!trimmed) return;
    onChange([...accessories, { id: genId(), description: trimmed, qty: qty.trim() || '1' }]);
    setDesc('');
    setQty('1');
  };

  const remove = (id: string) => onChange(accessories.filter(a => a.id !== id));

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-2 mt-2">
      <h3 className="font-semibold text-zinc-200 mb-2 text-sm">Drop-off Accessories</h3>

      {/* Add row */}
      <div className="flex gap-2 mb-2">
        <input
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
          placeholder="Accessory description (e.g. Charger, Case)"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <input
          className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-center"
          placeholder="Qty"
          value={qty}
          onChange={e => setQty(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button
          type="button"
          className="px-3 py-1 rounded text-sm font-semibold"
          style={{ background: '#39FF14', color: '#000' }}
          onClick={add}
        >Add</button>
      </div>

      {/* List */}
      {accessories.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">No accessories added.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-400 border-b border-zinc-700">
              <th className="text-left py-1 font-normal">Description</th>
              <th className="w-14 text-center py-1 font-normal">Qty</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {accessories.map(a => (
              <tr key={a.id} className="border-b border-zinc-800">
                <td className="py-1 text-zinc-200">{a.description}</td>
                <td className="py-1 text-center text-zinc-300">{a.qty}</td>
                <td className="py-1 text-center">
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-300 text-xs"
                    title="Remove"
                    onClick={() => remove(a.id)}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DropoffAccessoriesPanel;
