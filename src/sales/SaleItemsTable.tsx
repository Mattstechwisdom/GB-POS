import React, { useEffect, useState } from 'react';

export type SaleItemRow = {
  id: string;
  description: string;
  qty: number;
  price: number; // unit price
  internalCost?: number;
  condition?: 'New' | 'Excellent' | 'Good' | 'Fair';
  inStock?: boolean; // whether this specific item is in stock
};

interface Props {
  items: SaleItemRow[];
  onChange: (items: SaleItemRow[]) => void;
}

const MAX_ITEMS = 20;

const SaleItemsTable: React.FC<Props> = ({ items, onChange }) => {
  const [selected, setSelected] = useState<string | null>(items[0]?.id || null);
  const [editing, setEditing] = useState<SaleItemRow | null>(null);

  useEffect(() => { if (items.length === 0) setSelected(null); }, [items]);

  async function newItem() {
    if (items.length >= MAX_ITEMS) return;
    const api: any = (window as any).api || (window as any).opener?.api;
    if (!api) return;
    if (typeof api.pickSaleProduct === 'function') {
      try {
        const picked = await api.pickSaleProduct();
        if (!picked) return; // cancelled
        const row: SaleItemRow = {
          id: crypto.randomUUID(),
          description: picked.itemDescription || picked.title || picked.name || 'Item',
          qty: Number(picked.quantity ?? 1) || 1,
          price: Number(picked.price ?? 0) || 0,
          internalCost: typeof picked.internalCost === 'number' ? picked.internalCost : undefined,
          condition: picked.condition || 'New',
          inStock: !!picked.inStock,
        };
        onChange([...items, row].slice(0, MAX_ITEMS));
        return;
      } catch (e) {
        console.error('[SaleItemsTable] pickSaleProduct failed', e);
      }
    }
    // Fallback: open Products window in picker mode via URL param
    const url = window.location.origin + '/?products=true&picker=sale';
    window.open(url, '_blank', 'width=1280,height=800');
  }

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
    <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-zinc-200">Items</h4>
        <div className="text-xs text-zinc-400">Add products (max {MAX_ITEMS})</div>
      </div>
      <div className="overflow-y-auto border border-zinc-800 rounded" style={{ maxHeight: '12rem' }}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="px-2 py-1">Item</th>
              <th className="px-2 py-1" style={{ width: 80 }}>Qty</th>
              <th className="px-2 py-1" style={{ width: 110 }}>Price</th>
              <th className="px-2 py-1" style={{ width: 120, textAlign: 'right' }}>Total</th>
              <th className="px-2 py-1" style={{ width: 90, textAlign: 'center' }}>In stock</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const isSel = selected === it.id;
              const lineTotal = (Number(it.qty) || 0) * (Number(it.price) || 0);
              return (
                <tr
                  key={it.id}
                  onClick={() => setSelected(it.id)}
                  className={`cursor-pointer transition-colors border-l-4 ${isSel ? 'border-[#39FF14] bg-zinc-800/80 shadow-[inset_0_0_0_1px_#1f1f21,0_0_5px_1px_rgba(57,255,20,0.25)]' : 'border-transparent hover:bg-zinc-800/60'}`}
                >
                  <td className="px-2 py-1 font-medium truncate" title={it.description}>{it.description}</td>
                  <td className="px-2 py-1">{it.qty}</td>
                  <td className="px-2 py-1">{typeof it.price === 'number' ? `$${it.price.toFixed(2)}` : ''}</td>
                  <td className="px-2 py-1" style={{ textAlign: 'right' }}>{`$${lineTotal.toFixed(2)}`}</td>
                  <td className="px-2 py-1" style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 align-middle"
                      checked={!!it.inStock}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        const next = items.map(row => row.id === it.id ? { ...row, inStock: e.target.checked } : row);
                        onChange(next);
                      }}
                    />
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, MAX_ITEMS - items.length) }).map((_, idx) => (
              <tr key={`filler-${idx}`} className="opacity-60">
                <td className="px-2 py-1">&nbsp;</td>
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
          <label className="block text-xs text-zinc-400">Item</label>
          <input className="w-full mt-1 bg-zinc-900 rounded px-2 py-1" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
          <div className="flex gap-2 mt-2">
            <div className="w-1/3">
              <label className="block text-xs text-zinc-400">Qty</label>
              <input className="w-full bg-zinc-900 rounded px-2 py-1" type="number" min={1} value={editing.qty} onChange={e => setEditing({ ...editing, qty: Number(e.target.value) || 1 })} />
            </div>
            <div className="w-2/3">
              <label className="block text-xs text-zinc-400">Price</label>
              <input className="w-full bg-zinc-900 rounded px-2 py-1" type="number" step="0.01" min={0} value={editing.price} onChange={e => setEditing({ ...editing, price: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <div className="w-1/2">
              <label className="block text-xs text-zinc-400">Condition</label>
              <select className="w-full bg-zinc-900 rounded px-2 py-1" value={editing.condition || 'New'} onChange={e => setEditing({ ...editing, condition: e.target.value as any })}>
                <option value="New">New</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
              </select>
            </div>
            <div className="w-1/2">
              <label className="block text-xs text-zinc-400">Internal cost</label>
              <input className="w-full bg-yellow-200 text-black rounded px-2 py-1" type="number" step="0.01" min={0} value={typeof editing.internalCost === 'number' ? editing.internalCost : '' as any} onChange={e => setEditing({ ...editing, internalCost: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex gap-2 mt-2 justify-end">
            <button className="px-3 py-1 bg-zinc-800 rounded" onClick={() => setEditing(null)}>Cancel</button>
            <button className="px-3 py-1 bg-brand text-black rounded" onClick={() => { onChange(items.map(i => i.id === editing.id ? editing : i)); setEditing(null); }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaleItemsTable;
