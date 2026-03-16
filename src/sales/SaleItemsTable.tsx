import React, { useEffect, useMemo, useState } from 'react';
import ContextMenu, { ContextMenuItem } from '@/components/ContextMenu';
import { useContextMenu } from '@/lib/useContextMenu';
import MoneyInput from '@/components/MoneyInput';

export type SaleItemRow = {
  id: string;
  description: string;
  qty: number;
  price: number; // unit price
  consultationHours?: number;
  internalCost?: number;
  condition?: 'New' | 'Excellent' | 'Good' | 'Fair';
  inStock?: boolean; // whether this specific item is in stock
  productUrl?: string;
  category?: 'Device' | 'Accessory' | 'Consultation' | 'Other' | string;
};

interface Props {
  items: SaleItemRow[];
  onChange: (items: SaleItemRow[]) => void;
  showRequiredIndicator?: boolean;
}

const MAX_ITEMS = 20;

function isConsultationItem(row: Partial<SaleItemRow> | null | undefined) {
  const category = (row?.category || '').toString().trim().toLowerCase();
  return category === 'consultation' || category.startsWith('consult');
}

function effectiveUnits(row: Partial<SaleItemRow> | null | undefined) {
  if (isConsultationItem(row)) {
    const hours = Number(row?.consultationHours ?? row?.qty ?? 0);
    return Number.isFinite(hours) && hours > 0 ? hours : 0;
  }
  const qty = Number(row?.qty ?? 0);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function lineTotalFor(row: Partial<SaleItemRow> | null | undefined) {
  return effectiveUnits(row) * (Number(row?.price) || 0);
}

const SaleItemsTable: React.FC<Props> = ({ items, onChange, showRequiredIndicator }) => {
  const [selected, setSelected] = useState<string | null>(items[0]?.id || null);
  const [editing, setEditing] = useState<SaleItemRow | null>(null);

  const selectedRow = useMemo(() => {
    if (!selected) return null;
    return items.find(i => i.id === selected) || null;
  }, [items, selected]);

  useEffect(() => {
    if (items.length === 0) {
      setSelected(null);
      return;
    }
    if (!selected || !items.some(i => i.id === selected)) {
      setSelected(items[0].id);
    }
  }, [items, selected]);

  // Keep the inline editor in sync only after the user explicitly opens it.
  useEffect(() => {
    if (!selectedRow) {
      setEditing(null);
      return;
    }
    setEditing(prev => (prev ? (prev.id === selectedRow.id ? prev : { ...selectedRow }) : null));
  }, [selectedRow]);

  const ctx = useContextMenu<SaleItemRow>();
  const ctxRow = ctx.state.data;

  const ctxItems = useMemo<ContextMenuItem[]>(() => {
    if (!ctxRow) return [];
    const lineTotal = lineTotalFor(ctxRow);
    const url = (ctxRow.productUrl || '').trim();
    return [
      { type: 'header', label: ctxRow.description || 'Item' },
      { label: 'Edit…', onClick: () => { setSelected(ctxRow.id); setEditing(ctxRow); } },
      {
        label: 'Duplicate',
        onClick: () => {
          const copy: SaleItemRow = { ...ctxRow, id: crypto.randomUUID() };
          const idx = items.findIndex(i => i.id === ctxRow.id);
          const next = [...items];
          next.splice(idx >= 0 ? idx + 1 : next.length, 0, copy);
          if (next.length > MAX_ITEMS) next.pop();
          onChange(next);
          setSelected(copy.id);
          setEditing(null);
        },
      },
      ...(url
        ? ([
            { type: 'separator' as const },
            {
              label: 'Open product URL',
              hint: url.length > 24 ? url.slice(0, 24) + '…' : url,
              onClick: () => {
                try {
                  (window as any).api?.openUrl ? (window as any).api.openUrl(url) : window.open(url, '_blank');
                } catch {
                  window.open(url, '_blank');
                }
              },
            },
            {
              label: 'Copy product URL',
              onClick: async () => {
                try { await navigator.clipboard.writeText(url); } catch {}
              },
            },
          ] as ContextMenuItem[])
        : ([] as ContextMenuItem[])),
      { type: 'separator' },
      { label: 'Copy line total', hint: `$${lineTotal.toFixed(2)}`, onClick: async () => { try { await navigator.clipboard.writeText(String(lineTotal.toFixed(2))); } catch {} } },
      { type: 'separator' },
      {
        label: 'Remove…',
        danger: true,
        onClick: () => {
          onChange(items.filter(i => i.id !== ctxRow.id));
          if (selected === ctxRow.id) setSelected(null);
          if (editing?.id === ctxRow.id) setEditing(null);
        },
      },
    ];
  }, [ctxRow, items, onChange, selected, editing?.id]);

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
          consultationHours: typeof picked.consultationHours === 'number' ? picked.consultationHours : undefined,
          internalCost: typeof picked.internalCost === 'number' ? picked.internalCost : undefined,
          condition: picked.condition || 'New',
          inStock: !!picked.inStock,
          productUrl: picked.productUrl || picked.url || picked.link || '',
          category: picked.category,
        };
        onChange([...items, row].slice(0, MAX_ITEMS));
        setSelected(row.id);
        setEditing(null);
        return;
      } catch (e) {
        console.error('[SaleItemsTable] pickSaleProduct failed', e);
      }
    }
    // Fallback: open Products window in picker mode via URL param
    const url = window.location.origin + '/?products=true&picker=sale';
    window.open(url, '_blank', 'width=1280,height=800');
  }

  return (
    <div className={`bg-zinc-900 border ${showRequiredIndicator ? 'border-red-500' : 'border-zinc-700'} rounded p-3`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-zinc-200">
          Items
          {showRequiredIndicator && <span className="ml-1 text-red-500">*</span>}
        </h4>
        <div className="text-xs text-zinc-400">Add products (max {MAX_ITEMS})</div>
      </div>
      <div className="overflow-y-auto border border-zinc-800 rounded" style={{ maxHeight: '12rem' }}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="px-2 py-1">Item</th>
              <th className="px-2 py-1" style={{ width: 80 }}>Qty / Hrs</th>
              <th className="px-2 py-1" style={{ width: 110 }}>Price</th>
              <th className="px-2 py-1" style={{ width: 120, textAlign: 'right' }}>Total</th>
              <th className="px-2 py-1" style={{ width: 90, textAlign: 'center' }}>In stock</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const isSel = selected === it.id;
              const units = effectiveUnits(it);
              const lineTotal = lineTotalFor(it);
              return (
                <tr
                  key={it.id}
                  onClick={() => setSelected(it.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    ctx.openFromEvent(e, it);
                  }}
                  className={`cursor-pointer transition-colors border-l-4 ${isSel ? 'border-[#39FF14] bg-zinc-800/80 shadow-[inset_0_0_0_1px_#1f1f21,0_0_5px_1px_rgba(57,255,20,0.25)]' : 'border-transparent hover:bg-zinc-800/60'}`}
                >
                  <td className="px-2 py-1 font-medium truncate" title={it.description}>{it.description}</td>
                  <td className="px-2 py-1">{Number.isFinite(units) ? units : ''}</td>
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
        <div className="self-center text-[11px] text-zinc-400">Right-click an item and choose Edit to open the editor.</div>
      </div>

      {editing && (
        <div className="mt-2 bg-zinc-800 border border-zinc-700 rounded p-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-200">Edit selected</div>
            <div className="flex items-center gap-2 max-w-[75%]">
              <div className="text-[11px] text-zinc-400 truncate max-w-[60%]" title={editing.description || ''}>{editing.description || ''}</div>
              <button className="px-2 py-0.5 text-[11px] bg-zinc-900 border border-zinc-700 rounded" onClick={() => setEditing(null)}>Close</button>
            </div>
          </div>

          <label className="block text-xs text-zinc-400 mt-2">Item</label>
          <input className="w-full mt-1 bg-zinc-900 rounded px-2 py-1" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
          <div className="flex gap-2 mt-2">
            <div className="w-1/3">
              <label className="block text-xs text-zinc-400">{isConsultationItem(editing) ? 'Hours' : 'Qty'}</label>
              <input
                className="w-full bg-zinc-900 rounded px-2 py-1"
                type="number"
                min={0.25}
                step={isConsultationItem(editing) ? 0.25 : 1}
                value={isConsultationItem(editing) ? (editing.consultationHours ?? editing.qty) : editing.qty}
                onChange={e => {
                  const nextValue = Number(e.target.value);
                  if (isConsultationItem(editing)) {
                    const hours = Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 1;
                    setEditing({ ...editing, consultationHours: hours, qty: hours });
                    return;
                  }
                  setEditing({ ...editing, qty: Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 1 });
                }}
              />
            </div>
            <div className="w-2/3">
              <label className="block text-xs text-zinc-400">{isConsultationItem(editing) ? 'Hourly rate' : 'Price'}</label>
              <MoneyInput
                className="w-full bg-zinc-900 rounded px-2 py-1"
                value={Number(editing.price || 0)}
                onValueChange={(v) => setEditing({ ...editing, price: Number(v || 0) })}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            <div className="w-1/2">
              <label className="block text-xs text-zinc-400">Category</label>
              <select
                className="w-full bg-zinc-900 rounded px-2 py-1"
                value={(editing.category || '') as any}
                onChange={e => {
                  const nextCategory = (e.target.value || undefined) as any;
                  if (isConsultationItem({ category: nextCategory })) {
                    const hours = Number(editing.consultationHours ?? editing.qty ?? 1) || 1;
                    const rate = Number(editing.price || 0) > 0 ? Number(editing.price || 0) : 75;
                    setEditing({ ...editing, category: nextCategory, consultationHours: hours, qty: hours, price: rate });
                    return;
                  }
                  setEditing({ ...editing, category: nextCategory });
                }}
              >
                <option value="">—</option>
                <option value="Device">Device</option>
                <option value="Accessory">Accessory</option>
                <option value="Consultation">Consultation</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="w-1/2">
              <label className="block text-xs text-zinc-400">In stock</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!editing.inStock}
                  onChange={e => setEditing({ ...editing, inStock: e.target.checked })}
                />
                <span className="text-xs text-zinc-400">Available immediately</span>
              </div>
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
              <MoneyInput
                className="w-full bg-yellow-200 text-black rounded px-2 py-1"
                value={typeof editing.internalCost === 'number' ? editing.internalCost : undefined}
                onValueChange={(v) => setEditing({ ...editing, internalCost: v == null ? undefined : Number(v || 0) })}
                allowEmpty
              />
            </div>
          </div>
          {isConsultationItem(editing) ? (
            <div className="mt-2 text-[11px] text-zinc-400">
              Consultation totals use hours multiplied by the hourly rate. Technician payout is tracked separately in EOD reporting.
            </div>
          ) : null}
          <div className="mt-2">
            <label className="block text-xs text-zinc-400">Product URL</label>
            <input
              className="w-full bg-zinc-900 rounded px-2 py-1"
              type="url"
              placeholder="https://..."
              value={editing.productUrl || ''}
              onChange={e => setEditing({ ...editing, productUrl: e.target.value })}
            />
          </div>
          <div className="flex gap-2 mt-2 justify-end">
            <button
              className="px-3 py-1 bg-zinc-800 rounded"
              onClick={() => setEditing(selectedRow ? { ...selectedRow } : null)}
              disabled={!selectedRow}
            >
              Reset
            </button>
            <button
              className="px-3 py-1 bg-brand text-black rounded"
              onClick={() => {
                onChange(items.map(i => (i.id === editing.id ? editing : i)));
                // Keep editor open on the selected row
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      <ContextMenu
        id="sale-items-ctx"
        open={ctx.state.open}
        x={ctx.state.x}
        y={ctx.state.y}
        items={ctxItems}
        onClose={ctx.close}
      />
    </div>
  );
};

export default React.memo(SaleItemsTable);
