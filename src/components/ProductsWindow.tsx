import React, { useEffect, useMemo, useRef, useState } from 'react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { useContextMenu } from '../lib/useContextMenu';
import MoneyInput from './MoneyInput';
import { derivePartVendorFromUrl, normalizePartInventoryTitle, scrapePartUrl } from '../lib/partOrdering';

type Product = {
  id?: number;
  itemDescription: string;
  price?: number;
  internalCost?: number;
  condition?: string;
  notes?: string;
  category?: string;
  associatedDevices?: string[];
  itemType?: 'Product' | 'Part';
  partCategory?: string;
  distributor?: string;
  distributorSku?: string;
  reorderQty?: number;
  reorderUrlTemplate?: string;
  createdAt?: string;
  updatedAt?: string;
  // Inventory / stock tracking
  trackStock?: boolean;
  stockCount?: number;
  lowStockThreshold?: number;
};

type ProductsWindowProps = {
  onClose?: () => void;
  pickerMode?: boolean;
  onPick?: (product: Record<string, any>) => void;
};

const ProductsWindow: React.FC<ProductsWindowProps> = ({ onClose, pickerMode = false, onPick }) => {
  const [list, setList] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<number|undefined>(undefined);
  const blank: Product = {
    itemDescription: '',
    price: undefined,
    internalCost: undefined,
    notes: '',
    condition: 'New',
    associatedDevices: [],
    itemType: 'Product',
    partCategory: '',
    distributor: '',
    distributorSku: '',
    reorderQty: 1,
    reorderUrlTemplate: '',
    trackStock: false,
    stockCount: undefined,
    lowStockThreshold: undefined,
  };
  const [editing, setEditing] = useState<Product>(blank);
  const [search, setSearch] = useState('');
  const [priceManuallyEdited, setPriceManuallyEdited] = useState(false);
  const [scrapingUrl, setScrapingUrl] = useState(false);
  const scrapeSequenceRef = useRef(0);
  const lastScrapedUrlRef = useRef('');
  const CATEGORY_OPTIONS = ['Phone', 'Tablet', 'Laptop', 'Desktop', 'Game Console', 'TV', 'Audio', 'Drone', 'Accessory', 'Other'];
  const [categoryFilter, setCategoryFilter] = useState<Product['category'] | ''>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'product' | 'part' | ''>('');
  const ITEM_TYPE_OPTIONS: Array<NonNullable<Product['itemType']>> = ['Product', 'Part'];
  const PART_CATEGORY_PRESETS = ['Screen', 'Battery', 'Charging Port', 'Camera', 'Speaker', 'Microphone', 'Buttons', 'Housing', 'Motherboard', 'Power Supply', 'Cable', 'Adhesive', 'Other'];
  const PRODUCT_CONDITION_OPTIONS = ['New', 'Like New', 'Excellent', 'Good', 'Fair', 'Poor'];
  const PART_CONDITION_OPTIONS = ['New', 'Used'];
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
    if (pickerMode) return true;
    const params = new URLSearchParams(window.location.search);
    return params.get('picker') === 'sale';
  }, [pickerMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(p => {
      const type = (p.itemType || 'Product');
      const matchesQ = q ? (p.itemDescription || '').toLowerCase().includes(q) : true;
      const matchesType = isPicker
        ? type === 'Product'
        : (typeFilter ? (typeFilter === 'product' ? type === 'Product' : type === 'Part') : true);
      const devices = Array.isArray(p.associatedDevices) ? p.associatedDevices : [];
      const matchesCat = categoryFilter ? (p.category === categoryFilter || devices.includes(categoryFilter)) : true;
      return matchesQ && matchesType && matchesCat;
    });
  }, [list, search, typeFilter, categoryFilter, isPicker]);

  const emitPickedProduct = () => {
    if (!selectedId || !editing?.itemDescription?.trim()) return;
    const stockCount = Number(editing.stockCount);
    const payload = {
      inventoryProductId: editing.id,
      itemDescription: editing.itemDescription.trim(),
      price: Number(editing.price || 0),
      quantity: 1,
      condition: editing.condition || 'New',
      internalCost: typeof editing.internalCost === 'number' ? editing.internalCost : undefined,
      category: editing.category,
      itemType: editing.itemType || 'Product',
      distributor: editing.distributor || '',
      distributorSku: editing.distributorSku || '',
      productUrl: editing.reorderUrlTemplate || '',
      vendorRelationship: (editing as any).vendorRelationship,
      vendorSharePct: (editing as any).vendorSharePct,
      vendorTaxExempt: !!(editing as any).vendorTaxExempt,
      trackStock: !!editing.trackStock,
      stockCount: Number.isFinite(stockCount) ? stockCount : undefined,
      inStock: !editing.trackStock || (Number.isFinite(stockCount) && stockCount > 0),
    };
    if (onPick) {
      onPick(payload);
      return;
    }
    try {
      if ((window as any).api?._emitSaleProductSelected) {
        (window as any).api._emitSaleProductSelected(payload);
      } else {
        const { ipcRenderer } = (window as any).require ? (window as any).require('electron') : { ipcRenderer: null };
        ipcRenderer?.send('sale-product-selected', payload);
      }
      try { window.opener?.postMessage({ type: 'sale-product-selected', product: payload }, '*'); } catch {}
    } catch {}
    window.close();
  };

  const autofillFromOrderUrl = async (url: string) => {
    if (!url || url.includes('{{') || lastScrapedUrlRef.current === url) return;
    const sequence = ++scrapeSequenceRef.current;
    lastScrapedUrlRef.current = url;
    setScrapingUrl(true);
    try {
      const meta = await scrapePartUrl(url);
      if (sequence !== scrapeSequenceRef.current) return;
      if (!meta?.ok && !meta?.title && typeof meta?.price !== 'number') return;
      const title = normalizePartInventoryTitle(meta.title);
      const vendor = meta.vendor || derivePartVendorFromUrl(url);
      const description = String(meta.description || '').trim();
      setEditing((ed) => {
        if (!ed) return ed;
        const next = { ...ed };
        if (title && !String(ed.itemDescription || '').trim()) next.itemDescription = title;
        if (vendor && !String(ed.distributor || '').trim()) next.distributor = vendor;
        if (description && !String(ed.notes || '').trim()) next.notes = description;
        if (typeof meta.price === 'number' && ed.internalCost == null) next.internalCost = meta.price;
        return next;
      });
    } catch (e) {
      console.error('Product URL autofill failed', e);
    } finally {
      if (sequence === scrapeSequenceRef.current) setScrapingUrl(false);
    }
  };

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
    if (!selectedId) { setEditing(blank); prevSelectedIdRef.current = undefined; lastScrapedUrlRef.current = ''; return; }
    const found = list.find(p => p.id === selectedId);
    setEditing(found ? { ...blank, ...found } : blank);
    // Only reset the manual-edit flag when the user picks a *different* item,
    // not when the list refreshes after saving the currently-selected item.
    if (prevSelectedIdRef.current !== selectedId) {
      lastScrapedUrlRef.current = String(found?.reorderUrlTemplate || '');
      // Treat any price already stored in the DB as manually confirmed — prevent
      // auto-calc from overwriting it when the item is (re-)loaded.
      const hasStoredPrice = !!(found?.id) && typeof found?.price === 'number';
      setPriceManuallyEdited(hasStoredPrice);
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
      itemType: (editing.itemType || 'Product') as any,
      category: ((editing.itemType || 'Product') === 'Product' ? (editing.category || 'Other') : (editing.category || 'Other')) as any,
      associatedDevices: Array.from(new Set((Array.isArray(editing.associatedDevices) ? editing.associatedDevices : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))),
      partCategory: ((editing.itemType || 'Product') === 'Part' ? String(editing.partCategory || '').trim() : ''),
      distributor: String(editing.distributor || '').trim(),
      distributorSku: String(editing.distributorSku || '').trim(),
      reorderUrlTemplate: String(editing.reorderUrlTemplate || '').trim(),
      reorderQty: (() => {
        const qty = Number(editing.reorderQty);
        if (!Number.isFinite(qty) || qty <= 0) return 1;
        return Math.round(qty);
      })(),
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

  if (pickerMode) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col bg-zinc-900 p-3 text-gray-100">
        <input
          type="search"
          placeholder="Search saved products"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-3 w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-3 text-base outline-none focus:border-[#39FF14]"
          autoFocus
        />
        <div className="min-h-0 flex-1 overflow-y-auto rounded border border-zinc-700 bg-zinc-950">
          {filtered.length ? filtered.map((product) => (
            <button
              type="button"
              key={product.id}
              onClick={() => setSelectedId(product.id)}
              className={`flex w-full items-center justify-between gap-3 border-b border-zinc-800 px-3 py-3 text-left last:border-b-0 ${selectedId === product.id ? 'bg-[#BC13FE]/20 ring-1 ring-inset ring-[#BC13FE]' : 'bg-zinc-950 active:bg-zinc-800'}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{product.itemDescription}</span>
                <span className="block truncate text-xs text-zinc-400">{product.category || 'Other'} · {product.condition || 'New'}{product.trackStock ? ` · ${product.stockCount ?? 0} in stock` : ''}</span>
              </span>
              <strong className="shrink-0 tabular-nums">${Number(product.price || 0).toFixed(2)}</strong>
            </button>
          )) : <div className="p-4 text-sm text-zinc-400">No saved products match this search.</div>}
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded bg-[#39FF14] px-4 py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          onClick={emitPickedProduct}
          disabled={!selectedId || !editing.itemDescription?.trim()}
        >
          Add Selected Product
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-900 text-gray-100">
      <div className="grid grid-cols-[620px_1fr] gap-4 h-full p-4 w-full">
        {/* Left pane: filters + list */}
        <div className="flex flex-col min-w-0">
          <div className="relative flex gap-2 mb-4 p-3 bg-zinc-800 rounded border border-zinc-700">
            <input type="text" placeholder="search products…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-1 text-sm focus:border-[#39FF14] focus:outline-none" />
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={`px-3 py-1 border rounded text-sm ${filtersOpen || typeFilter || categoryFilter ? 'bg-[#BC13FE]/20 border-[#BC13FE] text-white' : 'bg-zinc-700 hover:bg-zinc-600 border-zinc-600'}`}
              aria-label="Open product filters"
              aria-expanded={filtersOpen}
            >
              ☰
            </button>
            {filtersOpen ? (
              <div className="absolute right-3 top-full z-20 mt-2 w-72 rounded border border-zinc-700 bg-zinc-950 p-3 shadow-xl">
                <label className="block text-xs text-zinc-400 mb-2">
                  Type
                  <select value={typeFilter} onChange={e => setTypeFilter((e.target.value || '') as any)} className="mt-1 w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none">
                    <option value="">All Types</option>
                    <option value="product">Products</option>
                    <option value="part">Parts</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  Device Type
                  <select value={categoryFilter} onChange={e => setCategoryFilter((e.target.value || '') as any)} className="mt-1 w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none">
                    <option value="">All Device Types</option>
                    {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  className="mt-3 w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm hover:border-[#39FF14]"
                  onClick={() => {
                    setTypeFilter('');
                    setCategoryFilter('');
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : null}
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
                      <div className="truncate">
                        {((p.itemType || 'Product') === 'Part' ? ((p.partCategory || 'Parts') + ' - ') : ((p.category || 'Other') + ' - '))}
                        {(p.itemDescription || '')}
                      </div>
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
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">{selectedId ? 'Edit Listing' : 'Add Product'}</h3>
              <button type="button" onClick={addNew} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm">Add Product</button>
            </div>

            <label className="block text-sm">Type</label>
            <select
              value={editing.itemType || 'Product'}
              onChange={e => {
                const next = (e.target.value as any) as Product['itemType'];
                setEditing(ed => ({
                  ...ed,
                  itemType: next,
                  partCategory: next === 'Part' ? (ed.partCategory || '') : '',
                }));
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 mb-2"
            >
              {ITEM_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <label className="block text-sm">{(editing.itemType || 'Product') === 'Part' ? 'Part Details' : 'Device Type'}</label>
            {(editing.itemType || 'Product') === 'Part' ? (
              <>
                <label className="block text-xs text-zinc-400 -mt-1 mb-1">Device type</label>
                <input
                  list="product-device-type-presets"
                  value={editing.category || ''}
                  onChange={e => setEditing(ed => ({ ...ed, category: e.target.value || 'Other' }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 mb-2"
                  placeholder="e.g. Phone, Laptop, Game Console"
                />
                <datalist id="product-device-type-presets">
                  {CATEGORY_OPTIONS.map(v => <option key={v} value={v} />)}
                </datalist>
                <div className="mb-2">
                  <div className="block text-xs text-zinc-400 mb-1">Works with device types</div>
                  <div className="grid grid-cols-2 gap-1">
                    {CATEGORY_OPTIONS.map((value) => {
                      const checked = Array.isArray(editing.associatedDevices) && editing.associatedDevices.includes(value);
                      return (
                        <label key={value} className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${checked ? 'border-[#BC13FE] bg-[#BC13FE]/15 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}>
                          <input
                            type="checkbox"
                            className="accent-[#BC13FE]"
                            checked={checked}
                            onChange={(event) => setEditing(ed => {
                              const currentDevices = Array.isArray(ed.associatedDevices) ? ed.associatedDevices : [];
                              const next = event.target.checked
                                ? Array.from(new Set([...currentDevices, value]))
                                : currentDevices.filter((device) => device !== value);
                              return { ...ed, associatedDevices: next, category: next[0] || ed.category };
                            })}
                          />
                          {value}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <label className="block text-xs text-zinc-400 -mt-1 mb-1">Part type</label>
                <input
                  list="part-category-presets"
                  value={editing.partCategory || ''}
                  onChange={e => setEditing(ed => ({ ...ed, partCategory: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 mb-2"
                  placeholder="e.g. Screen, Charging Port"
                />
                <datalist id="part-category-presets">
                  {PART_CATEGORY_PRESETS.map(v => <option key={v} value={v} />)}
                </datalist>
              </>
            ) : (
              <select value={editing.category || ''} onChange={e => setEditing(ed => ({ ...ed, category: (e.target.value || undefined) as any }))} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 mb-2">
                <option value="">—</option>
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

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
              {((editing.itemType || 'Product') === 'Part' ? PART_CONDITION_OPTIONS : PRODUCT_CONDITION_OPTIONS).map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>

            <label className="block text-sm">Notes</label>
            <textarea value={editing.notes || ''} onChange={e => setEditing(ed => ({ ...ed, notes: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 min-h-[80px] mb-3" />

            {/* Reorder */}
            <div className="border border-zinc-700 rounded p-3 mb-3">
              <div className="text-sm font-medium mb-2">Reorder</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Distributor</label>
                  <input
                    value={editing.distributor || ''}
                    onChange={e => setEditing(ed => ({ ...ed, distributor: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
                    placeholder="e.g. MobileSentrix"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">SKU</label>
                  <input
                    value={editing.distributorSku || ''}
                    onChange={e => setEditing(ed => ({ ...ed, distributorSku: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
                    placeholder="Distributor SKU"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Reorder qty</label>
                  <input
                    type="number"
                    min="1"
                    value={editing.reorderQty ?? 1}
                    onChange={e => setEditing(ed => ({ ...ed, reorderQty: e.target.value === '' ? 1 : Number(e.target.value) }))}
                    className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">Add-to-cart URL template {scrapingUrl && <span className="text-[#39FF14]">· Looking up details…</span>}</label>
                  <input
                    value={editing.reorderUrlTemplate || ''}
                    onChange={e => setEditing(ed => ({ ...ed, reorderUrlTemplate: e.target.value }))}
                    onBlur={e => { void autofillFromOrderUrl(e.target.value.trim()); }}
                    onKeyDown={e => { if (e.key !== 'Enter') return; e.preventDefault(); void autofillFromOrderUrl((e.target as HTMLInputElement).value.trim()); }}
                    className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
                    placeholder="https://vendor.example/cart/add?sku={{sku}}&qty={{qty}}"
                  />
                  <div className="text-[11px] text-zinc-500 mt-1">Tokens supported: {'{{sku}}'}, {'{{qty}}'}</div>
                </div>
              </div>
            </div>

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
                  onClick={emitPickedProduct}
                  disabled={!selectedId || !editing.itemDescription?.trim()}
                >
                  Add Selected Product
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
