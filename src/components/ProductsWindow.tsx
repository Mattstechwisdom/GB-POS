import React, { useEffect, useMemo, useState } from 'react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { useContextMenu } from '../lib/useContextMenu';
import MoneyInput from './MoneyInput';

type Product = {
  id?: number;
  itemDescription: string;
  price?: number;
  internalCost?: number;
  condition?: 'New'|'Excellent'|'Good'|'Fair';
  notes?: string;
  category?: 'Device' | 'Accessory' | 'Consultation' | 'Other';
  createdAt?: string;
  updatedAt?: string;
  // Inventory / stock tracking
  trackStock?: boolean;
  stockCount?: number;
  lowStockThreshold?: number;
};

const ProductsWindow: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [list, setList] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<number|undefined>(undefined);
  const blank: Product = { itemDescription: '', price: undefined, internalCost: undefined, notes: '', condition: 'New', trackStock: false, stockCount: undefined, lowStockThreshold: undefined };
  const [editing, setEditing] = useState<Product>(blank);
  const [search, setSearch] = useState('');
  const [priceManuallyEdited, setPriceManuallyEdited] = useState(false);
  const CATEGORY_OPTIONS: Array<Product['category']> = ['Device', 'Accessory', 'Consultation', 'Other'];
  const [categoryFilter, setCategoryFilter] = useState<Product['category'] | ''>('');
  const api = useMemo(() => {
    try {
      const a = (window as any).api || ((window as any).opener && (window as any).opener.api);
      return a || null;
    } catch { return null; }
  }, []);

  const ctx = useContextMenu<Product>();
  const ctxRow = ctx.state.data;

  const ctxItems = useMemo<ContextMenuItem[]>(() => {
    if (!ctxRow) return [];
    const label = `${(ctxRow.category || 'Other')} - ${(ctxRow.itemDescription || '')}`.trim();
    return [
      { type: 'header', label: label || 'Product' },
      {
        label: 'Load / Edit',
        onClick: () => {
          if (ctxRow?.id != null) setSelectedId(ctxRow.id);
        },
      },
      { type: 'separator' },
      {
        label: 'Delete…',
        danger: true,
        disabled: !ctxRow?.id,
        onClick: async () => {
          const id = ctxRow?.id;
          if (!id) return;
          if (!confirm('Delete this product?')) return;
          try {
            await api?.dbDelete?.('products', id);
            setList(lst => lst.filter(p => p.id !== id));
            if (selectedId === id) {
              setSelectedId(undefined);
              setEditing(blank);
            }
          } catch (e) { console.error('delete product failed', e); }
        },
      },
    ];
  }, [ctxRow, api, blank, selectedId]);
  const isPicker = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('picker') === 'sale';
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(p => {
      const matchesQ = q ? (p.itemDescription || '').toLowerCase().includes(q) : true;
      const matchesCat = categoryFilter ? (p.category === categoryFilter) : true;
      return matchesQ && matchesCat;
    });
  }, [list, search, categoryFilter]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const items = await api?.dbGet?.('products');
        if (!mounted) return;
        setList(Array.isArray(items) ? items : []);
      } catch (e) { console.error('load products failed', e); }
    })();
    const off = api?.onProductsChanged?.(async () => {
      try { const items = await api?.dbGet?.('products'); setList(Array.isArray(items) ? items : []); } catch {}
    });
    return () => { if (typeof off === 'function') off(); mounted = false; };
  }, []);

  const prevSelectedIdRef = React.useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!selectedId) { setEditing(blank); prevSelectedIdRef.current = undefined; return; }
    const found = list.find(p => p.id === selectedId);
    setEditing(found ? { ...found } : blank);
    // Only reset the manual-edit flag when the user picks a *different* item,
    // not when the list refreshes after saving the currently-selected item.
    if (prevSelectedIdRef.current !== selectedId) {
      setPriceManuallyEdited(false);
      prevSelectedIdRef.current = selectedId;
    }
  }, [selectedId, list]);

  // Auto-calc price from internalCost if not manually edited
  useEffect(() => {
    if (!editing) return;
    const cost = Number(editing.internalCost);
    if (Number.isFinite(cost) && cost > 0 && !priceManuallyEdited) {
      const suggested = +(cost * 1.15).toFixed(2);
      setEditing(e => e ? ({ ...e, price: suggested }) : e);
    }
  }, [editing?.internalCost, priceManuallyEdited]);

  async function save() {
    if (!editing) return;
    const payload: Product = {
      ...editing,
      itemDescription: (editing.itemDescription || '').trim(),
      condition: (editing.condition || 'New') as any,
      category: (editing.category || 'Other') as any,
    };
    if (!payload.itemDescription) { alert('Item description is required'); return; }
    try {
      if (payload.id) {
        if (!api?.update) throw new Error('Products window is missing API bridge');
        const updated = await api.update('products', payload);
        // Update the list immediately from the returned record so the
        // selectedId effect finds the correct (fresh) data when it re-runs.
        const merged = { ...payload, ...(updated || {}) };
        setList(lst => {
          const idx = lst.findIndex(p => p.id === merged.id);
          if (idx === -1) return [...lst, merged];
          const copy = [...lst];
          copy[idx] = merged;
          return copy;
        });
        setEditing(merged);
        if (merged.id) setSelectedId(merged.id);
      } else {
        const now = new Date().toISOString();
        if (!api?.dbAdd) throw new Error('Products window is missing API bridge');
        const created = await api.dbAdd('products', { ...payload, createdAt: now, updatedAt: now });
        if (created) {
          try {
            const fresh = await api.dbGet('products');
            setList(Array.isArray(fresh) ? fresh : []);
          } catch {
            setList(lst => [...lst, created]);
          }
          setSelectedId(created.id);
          setEditing(created);
          // Ensure new item is visible in the list
          setSearch('');
          setCategoryFilter('');
        }
      }
    } catch (e) { console.error('save product failed', e); }
  }

  async function addNew() {
    setSelectedId(undefined);
    setEditing({ ...blank });
    setPriceManuallyEdited(false);
  }

  async function remove() {
    if (!selectedId) return;
    if (!confirm('Delete this product?')) return;
    try {
      await api?.dbDelete?.('products', selectedId);
      setList(lst => lst.filter(p => p.id !== selectedId));
      setSelectedId(undefined);
      setEditing(blank);
    } catch (e) { console.error('delete product failed', e); }
  }

  return (
    <div className="flex h-screen bg-zinc-900 text-gray-100">
      <div className="grid grid-cols-[620px_1fr] gap-4 h-full p-4 w-full">
        {/* Left pane: filters + list */}
        <div className="flex flex-col min-w-0">
          <div className="flex gap-2 mb-4 p-3 bg-zinc-800 rounded border border-zinc-700">
            <select value={categoryFilter} onChange={e => setCategoryFilter((e.target.value || '') as any)} className="bg-zinc-800 border border-zinc-600 rounded px-3 py-1 text-sm focus:border-[#39FF14] focus:outline-none">
              <option value="">All Categories</option>
              {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" placeholder="search products…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-1 text-sm focus:border-[#39FF14] focus:outline-none" />
            <button onClick={addNew} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm">Clear</button>
          </div>
          <div className="flex-1 overflow-auto rounded border border-zinc-700">
            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-zinc-400">No products yet.</div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {filtered.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      ctx.openFromEvent(e as any, p);
                    }}
                    className={`px-3 py-2 cursor-pointer hover:bg-zinc-800 ${selectedId === p.id ? 'bg-zinc-800' : ''}`}
                  >
                    <div className="flex justify-between gap-3">
                      <div className="truncate">{(p.category || 'Other') + ' - ' + (p.itemDescription || '')}</div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.trackStock && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                            typeof p.stockCount === 'number' && p.stockCount <= (p.lowStockThreshold ?? 1)
                              ? 'bg-red-900 text-red-300'
                              : 'bg-zinc-700 text-zinc-300'
                          }`}>◆ {p.stockCount ?? 0}</span>
                        )}
                        <div className="text-zinc-300">{typeof p.price === 'number' ? `$${p.price.toFixed(2)}` : '—'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <ContextMenu
          id="products-ctx"
          open={ctx.state.open}
          x={ctx.state.x}
          y={ctx.state.y}
          items={ctxItems}
          onClose={ctx.close}
        />

        {/* Right pane: form */}
        <div className="flex flex-col">
          <div className="bg-zinc-800 border border-zinc-700 rounded p-4">
            <h3 className="text-lg font-semibold mb-3">Product Details</h3>
            <label className="block text-sm">Category</label>
            <select value={editing.category || ''} onChange={e => setEditing(ed => ({ ...ed, category: (e.target.value || undefined) as any }))} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 mb-2">
              <option value="">—</option>
              {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <label className="block text-sm">Item description</label>
            <input value={editing.itemDescription || ''} onChange={e => setEditing(ed => ({ ...ed, itemDescription: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 mb-2" />

            <label className="block text-sm">Internal cost</label>
            <MoneyInput
              className="w-full bg-yellow-200 text-black border border-yellow-400 rounded px-2 py-1 mb-2"
              value={typeof editing.internalCost === 'number' ? editing.internalCost : undefined}
              onValueChange={(v) => setEditing(ed => ({ ...ed, internalCost: v == null ? undefined : Number(v || 0) }))}
              allowEmpty
            />

            <label className="block text-sm">Price</label>
            <MoneyInput
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 mb-2"
              value={typeof editing.price === 'number' ? editing.price : undefined}
              onValueChange={(v) => {
                setPriceManuallyEdited(true);
                setEditing(ed => ({ ...ed, price: v == null ? undefined : Number(v || 0) }));
              }}
              allowEmpty
            />

            <label className="block text-sm">Condition</label>
            <select value={editing.condition || 'New'} onChange={e => setEditing(ed => ({ ...ed, condition: e.target.value as any }))} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 mb-2">
              <option value="New">New</option>
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
            </select>

            <label className="block text-sm">Notes</label>
            <textarea value={editing.notes || ''} onChange={e => setEditing(ed => ({ ...ed, notes: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 min-h-[80px] mb-3" />

            {/* Stock tracking */}
            <div className="border border-zinc-700 rounded p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  id="track-stock-cb"
                  type="checkbox"
                  checked={!!editing.trackStock}
                  onChange={e => setEditing(ed => ({ ...ed, trackStock: e.target.checked }))}
                  className="accent-[#39FF14]"
                />
                <label htmlFor="track-stock-cb" className="text-sm font-medium cursor-pointer">Track stock</label>
              </div>
              {editing.trackStock && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Stock count</label>
                    <input
                      type="number"
                      min="0"
                      value={editing.stockCount ?? ''}
                      onChange={e => setEditing(ed => ({ ...ed, stockCount: e.target.value === '' ? undefined : Number(e.target.value) }))}
                      className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Low stock alert at</label>
                    <input
                      type="number"
                      min="0"
                      value={editing.lowStockThreshold ?? ''}
                      onChange={e => setEditing(ed => ({ ...ed, lowStockThreshold: e.target.value === '' ? undefined : Number(e.target.value) }))}
                      className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isPicker && (
                <>
                  <button className="px-3 py-1.5 bg-neon-green text-black rounded font-semibold" onClick={save}>Save</button>
                  <button className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded disabled:opacity-50 disabled:cursor-not-allowed" onClick={remove} disabled={!selectedId}>Delete</button>
                </>
              )}
              {isPicker && (
                <button
                  className="px-3 py-1.5 bg-neon-green text-black rounded font-semibold"
                  onClick={() => {
                    const payload = {
                      itemDescription: editing.itemDescription || '',
                      price: editing.price || 0,
                      quantity: 1,
                      condition: editing.condition || 'New',
                      internalCost: editing.internalCost,
                      category: editing.category,
                    };
                    try {
                      if ((window as any).api?._emitSaleProductSelected) {
                        (window as any).api._emitSaleProductSelected(payload);
                      } else {
                        const { ipcRenderer } = (window as any).require ? (window as any).require('electron') : { ipcRenderer: null };
                        ipcRenderer?.send('sale-product-selected', payload);
                      }
                      // Always try to notify the opener via postMessage for fallback flows
                      try { window.opener?.postMessage({ type: 'sale-product-selected', product: payload }, '*'); } catch {}
                    } catch {}
                    window.close();
                  }}
                >
                  Add to Sale Form
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductsWindow;
