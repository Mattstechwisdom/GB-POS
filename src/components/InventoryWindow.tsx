import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MoneyInput from './MoneyInput';
import PercentInput from './PercentInput';

type InventoryMode = 'parts' | 'products';

type InventoryItem = {
  id?: number;
  itemDescription: string;
  itemType?: 'Product' | 'Part';
  category?: string;
  associatedDevices?: string[];
  partCategory?: string;
  condition?: string;
  price?: number;
  internalCost?: number;
  markupPct?: number | string;
  notes?: string;
  distributor?: string;
  distributorSku?: string;
  reorderQty?: number;
  reorderUrlTemplate?: string;
  trackStock?: boolean;
  stockCount?: number;
  lowStockThreshold?: number;
  createdAt?: string;
  updatedAt?: string;
};

const DEVICE_CATEGORY_OPTIONS = ['Phone', 'Tablet', 'Laptop', 'Desktop', 'Game Console', 'TV', 'Audio', 'Drone', 'Accessory', 'Other'];
const PART_CATEGORY_OPTIONS = ['Screen', 'Battery', 'Charging Port', 'Camera', 'Speaker', 'Microphone', 'Buttons', 'Housing', 'Motherboard', 'Power Supply', 'Cable', 'Adhesive', 'Other'];
const PART_CONDITIONS = ['New', 'Used'];
const PRODUCT_CONDITIONS = ['New', 'Like New', 'Excellent', 'Good', 'Fair', 'Poor'];
const MARKUP_PRESETS = [5, 10, 15, 20, 25];
const DEFAULT_MARKUP_PCT = '5';

function blankItem(mode: InventoryMode): InventoryItem {
  return {
    itemDescription: '',
    itemType: mode === 'parts' ? 'Part' : 'Product',
    category: mode === 'parts' ? 'Phone' : 'Phone',
    associatedDevices: mode === 'parts' ? ['Phone'] : [],
    partCategory: mode === 'parts' ? 'Screen' : '',
    condition: 'New',
    price: undefined,
    internalCost: undefined,
    markupPct: DEFAULT_MARKUP_PCT,
    notes: '',
    distributor: '',
    distributorSku: '',
    reorderQty: 1,
    reorderUrlTemplate: '',
    trackStock: true,
    stockCount: 0,
    lowStockThreshold: 1,
  };
}

function fillUrlTemplate(template: string, values: { sku?: string; qty: number }) {
  const sku = values.sku ?? '';
  const qty = Number.isFinite(values.qty) && values.qty > 0 ? String(Math.round(values.qty)) : '1';
  return template
    .replace(/\{\{\s*sku\s*\}\}/gi, encodeURIComponent(String(sku)))
    .replace(/\{\{\s*qty\s*\}\}/gi, encodeURIComponent(qty));
}

function isLow(item: InventoryItem): boolean {
  return !!item.trackStock && typeof item.stockCount === 'number' && item.stockCount <= (item.lowStockThreshold ?? 1);
}

function money(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '-';
}

function markedUpPrice(cost: unknown, pct: unknown): number | undefined {
  const c = Number(cost);
  const p = Number(pct);
  if (!Number.isFinite(c) || c < 0 || !Number.isFinite(p) || p < 0) return undefined;
  return Math.round(c * (1 + p / 100) * 100) / 100;
}

function normalizeOrderUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export default function InventoryWindow() {
  const api = (window as any).api;
  const [mode, setMode] = useState<InventoryMode>('parts');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [editing, setEditing] = useState<InventoryItem>(() => blankItem('parts'));
  const [editingOrderUrl, setEditingOrderUrl] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const products = await api?.dbGet?.('products').catch(() => []);
      setItems(Array.isArray(products) ? products : []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
    const off = api?.onProductsChanged?.(() => load());
    return () => { try { off && off(); } catch {} };
  }, [api, load]);

  useEffect(() => {
    setSelectedId(undefined);
    setEditing(blankItem(mode));
    setSearch('');
    setDeviceFilter('');
    setFiltersOpen(false);
  }, [mode]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => (mode === 'parts' ? (item.itemType || 'Product') === 'Part' : (item.itemType || 'Product') !== 'Part'))
      .filter((item) => !lowOnly || isLow(item))
      .filter((item) => {
        if (!deviceFilter) return true;
        const devices = Array.isArray(item.associatedDevices) ? item.associatedDevices : [];
        return item.category === deviceFilter || devices.includes(deviceFilter);
      })
      .filter((item) => {
        if (!q) return true;
        return [
          item.itemDescription,
          item.category,
          item.partCategory,
          item.condition,
          item.distributor,
          item.distributorSku,
        ].some((value) => String(value || '').toLowerCase().includes(q));
      })
      .sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')) || String(a.itemDescription || '').localeCompare(String(b.itemDescription || '')));
  }, [deviceFilter, items, lowOnly, mode, search]);

  const counts = useMemo(() => {
    const parts = items.filter((item) => (item.itemType || 'Product') === 'Part');
    const products = items.filter((item) => (item.itemType || 'Product') !== 'Part');
    return {
      parts: parts.length,
      products: products.length,
      low: items.filter(isLow).length,
      tracked: items.filter((item) => item.trackStock).length,
    };
  }, [items]);

  const selectItem = (item: InventoryItem) => {
    setSelectedId(item.id);
    setEditing({ ...blankItem(mode), ...item, markupPct: item.markupPct ?? DEFAULT_MARKUP_PCT });
    setEditingOrderUrl(!item.reorderUrlTemplate);
  };

  const startNew = () => {
    setSelectedId(undefined);
    setEditing(blankItem(mode));
    setEditingOrderUrl(false);
  };

  const save = async () => {
    const description = String(editing.itemDescription || '').trim();
    if (!description) {
      alert(mode === 'parts' ? 'Part name is required.' : 'Product name is required.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload: InventoryItem = {
        ...editing,
        itemDescription: description,
        itemType: mode === 'parts' ? 'Part' : 'Product',
        category: String(editing.category || 'Other').trim() || 'Other',
        associatedDevices: Array.from(new Set((Array.isArray(editing.associatedDevices) ? editing.associatedDevices : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean))),
        partCategory: mode === 'parts' ? (String(editing.partCategory || 'Other').trim() || 'Other') : '',
        condition: String(editing.condition || 'New').trim() || 'New',
        markupPct: editing.markupPct ?? DEFAULT_MARKUP_PCT,
        distributor: String(editing.distributor || '').trim(),
        distributorSku: String(editing.distributorSku || '').trim(),
        reorderUrlTemplate: normalizeOrderUrl(editing.reorderUrlTemplate),
        reorderQty: Math.max(1, Math.round(Number(editing.reorderQty || 1))),
        trackStock: !!editing.trackStock,
        stockCount: editing.trackStock ? Math.max(0, Math.round(Number(editing.stockCount || 0))) : undefined,
        lowStockThreshold: editing.trackStock ? Math.max(0, Math.round(Number(editing.lowStockThreshold || 0))) : undefined,
        updatedAt: now,
      };

      let saved: InventoryItem | undefined;
      if (payload.id) {
        saved = await api?.update?.('products', payload);
      } else {
        saved = await api?.dbAdd?.('products', { ...payload, createdAt: now });
      }
      const merged = { ...payload, ...(saved || {}) };
      setItems((current) => {
        const id = merged.id;
        if (!id) return current;
        const idx = current.findIndex((item) => item.id === id);
        if (idx === -1) return [...current, merged];
        const next = [...current];
        next[idx] = merged;
        return next;
      });
      setSelectedId(merged.id);
      setEditing(merged);
      setEditingOrderUrl(!merged.reorderUrlTemplate);
    } catch (err) {
      console.error('Inventory save failed', err);
      alert('Inventory item could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    if (!confirm(mode === 'parts' ? 'Delete this repair part listing?' : 'Delete this product listing?')) return;
    setSaving(true);
    try {
      await api?.dbDelete?.('products', selectedId);
      setItems((current) => current.filter((item) => item.id !== selectedId));
      startNew();
    } catch (err) {
      console.error('Inventory delete failed', err);
      alert('Inventory item could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  const adjustStock = async (item: InventoryItem, delta: number) => {
    const nextCount = Math.max(0, Math.round(Number(item.stockCount || 0) + delta));
    const updated = { ...item, trackStock: true, stockCount: nextCount, updatedAt: new Date().toISOString() };
    setItems((current) => current.map((row) => row.id === item.id ? updated : row));
    if (selectedId === item.id) setEditing(updated);
    try {
      await api?.update?.('products', updated);
    } catch (err) {
      console.error('Inventory stock update failed', err);
      load();
    }
  };

  const openReorder = async (item: InventoryItem) => {
    const template = String(item.reorderUrlTemplate || '').trim();
    if (!template) return;
    const url = fillUrlTemplate(template, { sku: item.distributorSku, qty: Number(item.reorderQty || 1) });
    try { await api?.openUrl?.(url); } catch { window.open(url, '_blank', 'noopener,noreferrer'); }
  };

  const modeLabel = mode === 'parts' ? 'Repair Parts' : 'Products';
  const categoryOptions = DEVICE_CATEGORY_OPTIONS;
  const conditionOptions = mode === 'parts' ? PART_CONDITIONS : PRODUCT_CONDITIONS;

  return (
    <div className="h-screen bg-zinc-900 text-gray-100 overflow-hidden">
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b border-zinc-700 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-wide">Inventory</h1>
              <div className="text-xs text-zinc-400">{counts.tracked} tracked items, {counts.low} low-stock alerts</div>
            </div>
            <div className="flex rounded border border-zinc-700 bg-zinc-950 p-1">
              <button
                type="button"
                onClick={() => setMode('parts')}
                className={`px-4 py-2 text-sm font-semibold rounded ${mode === 'parts' ? 'bg-[#BC13FE] text-white' : 'text-zinc-400 hover:text-white'}`}
              >
                Parts ({counts.parts})
              </button>
              <button
                type="button"
                onClick={() => setMode('products')}
                className={`px-4 py-2 text-sm font-semibold rounded ${mode === 'products' ? 'bg-[#39FF14] text-black' : 'text-zinc-400 hover:text-white'}`}
              >
                Products ({counts.products})
              </button>
            </div>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(360px,44%)_1fr]">
          <section className="flex min-h-[320px] flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950">
            <div className="shrink-0 border-b border-zinc-800 p-3">
              <div className="relative flex flex-wrap gap-2">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Search ${modeLabel.toLowerCase()}...`}
                  className="min-w-[180px] flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                />
                <button
                  type="button"
                  onClick={() => setFiltersOpen((open) => !open)}
                  className={`rounded border px-3 py-2 text-sm ${filtersOpen || lowOnly || deviceFilter ? 'border-[#BC13FE] bg-[#BC13FE]/20 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}
                  aria-label="Open inventory filters"
                  aria-expanded={filtersOpen}
                >
                  ☰
                </button>
                <button
                  type="button"
                  onClick={() => setLowOnly((current) => !current)}
                  className={`rounded border px-3 py-2 text-sm ${lowOnly ? 'border-red-500 bg-red-950 text-red-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}
                >
                  Low Stock
                </button>
                {filtersOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded border border-zinc-700 bg-zinc-950 p-3 shadow-xl">
                    <label className="block">
                      <span className="mb-1 block text-xs text-zinc-400">Device type</span>
                      <select
                        value={deviceFilter}
                        onChange={(event) => setDeviceFilter(event.target.value)}
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                      >
                        <option value="">All device types</option>
                        {DEVICE_CATEGORY_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setLowOnly(false);
                        setDeviceFilter('');
                      }}
                      className="mt-3 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:border-[#39FF14]"
                    >
                      Clear Filters
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="p-4 text-sm text-zinc-400">Loading...</div>
              ) : visibleItems.length === 0 ? (
                <div className="p-4 text-sm text-zinc-500">No {modeLabel.toLowerCase()} found.</div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {visibleItems.map((item) => {
                    const low = isLow(item);
                    const selected = selectedId === item.id;
                    const devices = Array.isArray(item.associatedDevices) ? item.associatedDevices : [];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectItem(item)}
                        className={`w-full border-l-4 px-3 py-2 text-left transition ${selected ? 'bg-zinc-800' : 'hover:bg-zinc-900'} ${low ? 'border-red-500' : 'border-transparent'}`}
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_86px_76px] items-center gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-zinc-100">{item.itemDescription || '(unnamed)'}</div>
                            <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-zinc-400">
                              <span>{item.category || 'Other'}</span>
                              {devices.length ? <span>- {devices.slice(0, 2).join(', ')}{devices.length > 2 ? ` +${devices.length - 2}` : ''}</span> : null}
                              {mode === 'parts' ? <span>• {item.partCategory || 'Part'}</span> : null}
                              <span>• {item.condition || 'New'}</span>
                              {item.distributor ? <span>• {item.distributor}</span> : null}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Price</div>
                            <div className="font-mono text-sm font-semibold text-zinc-100">{money(item.price)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Stock</div>
                            <div className={`font-mono text-sm font-semibold ${low ? 'text-red-300' : 'text-zinc-200'}`}>
                              {item.trackStock ? (item.stockCount ?? 0) : '-'}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="rounded border border-zinc-700 bg-zinc-950 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{selectedId ? `Edit ${mode === 'parts' ? 'Repair Part' : 'Product'}` : `Add ${mode === 'parts' ? 'Repair Part' : 'Product'}`}</h2>
                <div className="text-xs text-zinc-500">Saved here syncs through the Products collection.</div>
              </div>
              <button type="button" onClick={startNew} className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm hover:border-[#39FF14]">
                Add {mode === 'parts' ? 'Part' : 'Product'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs text-zinc-400">{mode === 'parts' ? 'Part Name' : 'Product Name'}</span>
                <input
                  value={editing.itemDescription || ''}
                  onChange={(event) => setEditing((current) => ({ ...current, itemDescription: event.target.value }))}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                  placeholder={mode === 'parts' ? 'iPhone 14 Digi/LCD Assembly' : 'iPhone 14 Pro 256GB'}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-zinc-400">Device Type</span>
                <input
                  list="inventory-device-types"
                  value={editing.category || ''}
                  onChange={(event) => setEditing((current) => ({ ...current, category: event.target.value }))}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                />
              </label>
              <datalist id="inventory-device-types">
                {categoryOptions.map((value) => <option key={value} value={value} />)}
              </datalist>

              {mode === 'parts' ? (
                <div className="block md:col-span-2">
                  <span className="mb-2 block text-xs text-zinc-400">Works With Devices</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {DEVICE_CATEGORY_OPTIONS.map((value) => {
                      const checked = Array.isArray(editing.associatedDevices) && editing.associatedDevices.includes(value);
                      return (
                        <label key={value} className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${checked ? 'border-[#BC13FE] bg-[#BC13FE]/15 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}>
                          <input
                            type="checkbox"
                            className="accent-[#BC13FE]"
                            checked={checked}
                            onChange={(event) => setEditing((current) => {
                              const currentDevices = Array.isArray(current.associatedDevices) ? current.associatedDevices : [];
                              const next = event.target.checked
                                ? Array.from(new Set([...currentDevices, value]))
                                : currentDevices.filter((device) => device !== value);
                              return { ...current, associatedDevices: next, category: next[0] || current.category };
                            })}
                          />
                          {value}
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">Use this for universal parts like power cables that fit multiple device families.</div>
                </div>
              ) : null}

              {mode === 'parts' ? (
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-400">Part Type</span>
                  <input
                    list="inventory-part-types"
                    value={editing.partCategory || ''}
                    onChange={(event) => setEditing((current) => ({ ...current, partCategory: event.target.value }))}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                  />
                  <datalist id="inventory-part-types">
                    {PART_CATEGORY_OPTIONS.map((value) => <option key={value} value={value} />)}
                  </datalist>
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-400">Condition</span>
                  <select
                    value={editing.condition || 'New'}
                    onChange={(event) => setEditing((current) => ({ ...current, condition: event.target.value }))}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                  >
                    {conditionOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              )}

              {mode === 'parts' ? (
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-400">Condition</span>
                  <select
                    value={editing.condition || 'New'}
                    onChange={(event) => setEditing((current) => ({ ...current, condition: event.target.value }))}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                  >
                    {conditionOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              ) : null}

              <label className="block">
                <span className="mb-1 block text-xs text-zinc-400">Cost</span>
                <MoneyInput
                  value={typeof editing.internalCost === 'number' ? editing.internalCost : undefined}
                  onValueChange={(value) => setEditing((current) => {
                    const internalCost = value == null ? undefined : Number(value || 0);
                    const price = internalCost == null ? current.price : markedUpPrice(internalCost, current.markupPct ?? DEFAULT_MARKUP_PCT);
                    return { ...current, internalCost, ...(price == null ? {} : { price }) };
                  })}
                  allowEmpty
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-zinc-400">Markup %</span>
                <PercentInput
                  value={editing.markupPct ?? DEFAULT_MARKUP_PCT}
                  onChange={(value) => setEditing((current) => {
                    const markupPct = value || DEFAULT_MARKUP_PCT;
                    const price = markedUpPrice(current.internalCost, markupPct);
                    return { ...current, markupPct, ...(price == null ? {} : { price }) };
                  })}
                  presets={MARKUP_PRESETS}
                  className="w-full rounded border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs text-zinc-400">{mode === 'parts' ? 'Part Sold Price' : 'Sale Price'}</span>
                <MoneyInput
                  value={typeof editing.price === 'number' ? editing.price : undefined}
                  onValueChange={(value) => setEditing((current) => ({ ...current, price: value == null ? undefined : Number(value || 0) }))}
                  allowEmpty
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                />
              </label>

              <div className="rounded border border-zinc-800 bg-zinc-900 p-3 md:col-span-2">
                <label className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={!!editing.trackStock}
                    onChange={(event) => setEditing((current) => ({ ...current, trackStock: event.target.checked }))}
                    className="accent-[#39FF14]"
                  />
                  Track stock
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-400">On Hand</span>
                    <input
                      type="number"
                      min="0"
                      value={editing.stockCount ?? ''}
                      disabled={!editing.trackStock}
                      onChange={(event) => setEditing((current) => ({ ...current, stockCount: event.target.value === '' ? undefined : Number(event.target.value) }))}
                      className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none disabled:opacity-50 focus:border-[#39FF14]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-400">Low Alert At</span>
                    <input
                      type="number"
                      min="0"
                      value={editing.lowStockThreshold ?? ''}
                      disabled={!editing.trackStock}
                      onChange={(event) => setEditing((current) => ({ ...current, lowStockThreshold: event.target.value === '' ? undefined : Number(event.target.value) }))}
                      className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none disabled:opacity-50 focus:border-[#39FF14]"
                    />
                  </label>
                </div>
                {selectedId ? (
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => adjustStock(editing, -1)} className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm">-1</button>
                    <button type="button" onClick={() => adjustStock(editing, 1)} className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm">+1</button>
                  </div>
                ) : null}
              </div>

              <label className="block">
                <span className="mb-1 block text-xs text-zinc-400">Distributor</span>
                <input
                  value={editing.distributor || ''}
                  onChange={(event) => setEditing((current) => ({ ...current, distributor: event.target.value }))}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                  placeholder="MobileSentrix"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-zinc-400">SKU</span>
                <input
                  value={editing.distributorSku || ''}
                  onChange={(event) => setEditing((current) => ({ ...current, distributorSku: event.target.value }))}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-zinc-400">Reorder Qty</span>
                <input
                  type="number"
                  min="1"
                  value={editing.reorderQty ?? 1}
                  onChange={(event) => setEditing((current) => ({ ...current, reorderQty: event.target.value === '' ? 1 : Number(event.target.value) }))}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                />
              </label>

              <div className="block md:col-span-2">
                <span className="mb-1 block text-xs text-zinc-400">Reorder URL Template</span>
                {editing.reorderUrlTemplate && !editingOrderUrl ? (
                  <div className="flex flex-wrap items-center gap-2 rounded border border-zinc-700 bg-zinc-900 p-2">
                    <button
                      type="button"
                      onClick={() => openReorder(editing)}
                      className="rounded bg-[#39FF14] px-3 py-2 text-sm font-semibold text-black"
                    >
                      Order URL
                    </button>
                    <button type="button" onClick={() => setEditingOrderUrl(true)} className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">Edit</button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing((current) => ({ ...current, reorderUrlTemplate: '' }));
                        setEditingOrderUrl(true);
                      }}
                      className="rounded border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-100"
                    >
                      Clear
                    </button>
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-400" title={editing.reorderUrlTemplate}>{editing.reorderUrlTemplate}</span>
                  </div>
                ) : (
                  <>
                    <input
                      value={editing.reorderUrlTemplate || ''}
                      onChange={(event) => setEditing((current) => ({ ...current, reorderUrlTemplate: event.target.value }))}
                      onBlur={() => {
                        const normalized = normalizeOrderUrl(editing.reorderUrlTemplate);
                        if (normalized) {
                          setEditing((current) => ({ ...current, reorderUrlTemplate: normalized }));
                          setEditingOrderUrl(false);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        const normalized = normalizeOrderUrl(editing.reorderUrlTemplate);
                        if (!normalized) return;
                        event.preventDefault();
                        setEditing((current) => ({ ...current, reorderUrlTemplate: normalized }));
                        setEditingOrderUrl(false);
                      }}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                      placeholder="https://vendor.example/cart/add?sku={{sku}}&qty={{qty}}"
                    />
                    <div className="mt-1 text-[11px] text-zinc-500">Paste the vendor link once. After it is saved here, this becomes an Order URL button. Tokens supported: {'{{sku}}'} and {'{{qty}}'}.</div>
                  </>
                )}
              </div>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs text-zinc-400">Notes</span>
                <textarea
                  value={editing.notes || ''}
                  onChange={(event) => setEditing((current) => ({ ...current, notes: event.target.value }))}
                  className="min-h-[88px] w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {editing.reorderUrlTemplate ? (
                <button type="button" onClick={() => openReorder(editing)} className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:border-[#39FF14]">Open Reorder Link</button>
              ) : null}
              <button type="button" onClick={remove} disabled={!selectedId || saving} className="rounded border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-100 disabled:opacity-40">Delete</button>
              <button type="button" onClick={save} disabled={saving} className="rounded bg-[#39FF14] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Listing'}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
