import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MoneyInput from './MoneyInput';
import PercentInput from './PercentInput';
import type { VendorRecord } from './VendorsWindow';
import { derivePartVendorFromUrl, normalizePartInventoryTitle, scrapePartUrl } from '../lib/partOrdering';

type InventoryMode = 'parts' | 'products';

type InventoryItem = {
  id?: number;
  itemDescription: string;
  itemType?: 'Product' | 'Part';
  category?: string;
  deviceModel?: string;
  associatedDevices?: string[];
  partCategory?: string;
  condition?: string;
  price?: number;
  internalCost?: number;
  markupPct?: number | string;
  notes?: string;
  distributor?: string;
  vendorRelationship?: 'wholesale' | 'consignment';
  vendorSharePct?: number;
  vendorTaxExempt?: boolean;
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
    deviceModel: '',
    associatedDevices: [],
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
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [repairCategories, setRepairCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [editing, setEditing] = useState<InventoryItem>(() => blankItem('parts'));
  const [editingOrderUrl, setEditingOrderUrl] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scrapingUrl, setScrapingUrl] = useState(false);
  const scrapeSequenceRef = useRef(0);
  const lastScrapedUrlRef = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [products, vendorRows, repairRows] = await Promise.all([
        api?.dbGet?.('products').catch(() => []),
        api?.dbGet?.('vendors').catch(() => []),
        api?.dbGet?.('repairCategories').catch(() => []),
      ]);
      setItems(Array.isArray(products) ? products : []);
      setVendors(Array.isArray(vendorRows) ? vendorRows : []);
      setRepairCategories(Array.isArray(repairRows) ? repairRows : []);
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
          item.deviceModel,
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

  const visibleVendors = useMemo(() => vendors
    .filter((vendor) => (vendor.inventoryMode || 'Product') === (mode === 'parts' ? 'Part' : 'Product'))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))), [mode, vendors]);

  const deviceModels = useMemo(() => {
    const deviceType = String(editing.category || '').trim().toLowerCase();
    const models = repairCategories
      .filter((row) => String(row?.type || row?.category || '').trim().toLowerCase() === deviceType)
      .map((row) => String(row?.model || row?.deviceModel || '').trim())
      .filter(Boolean);
    items.forEach((item) => {
      if (String(item.category || '').trim().toLowerCase() === deviceType && String(item.deviceModel || '').trim()) {
        models.push(String(item.deviceModel).trim());
      }
    });
    return Array.from(new Set(models)).sort((a, b) => a.localeCompare(b));
  }, [editing.category, items, repairCategories]);

  const selectItem = (item: InventoryItem) => {
    setSelectedId(item.id);
    setEditing({ ...blankItem(mode), ...item, markupPct: item.markupPct ?? DEFAULT_MARKUP_PCT });
    setEditingOrderUrl(!item.reorderUrlTemplate);
    lastScrapedUrlRef.current = String(item.reorderUrlTemplate || '');
  };

  const startNew = () => {
    setSelectedId(undefined);
    setEditing(blankItem(mode));
    setEditingOrderUrl(false);
    lastScrapedUrlRef.current = '';
  };

  const clearFields = () => {
    setSelectedId(undefined);
    setEditing(blankItem(mode));
    setEditingOrderUrl(false);
    lastScrapedUrlRef.current = '';
  };

  const ensureVendor = async (nameValue: string) => {
    const name = nameValue.trim();
    if (!name) return;
    const inventoryMode = mode === 'parts' ? 'Part' : 'Product';
    const existing = vendors.find((vendor) => (vendor.inventoryMode || 'Product') === inventoryMode
      && String(vendor.name || '').trim().toLowerCase() === name.toLowerCase());
    if (existing) return;
    const now = new Date().toISOString();
    const saved = await api?.dbAdd?.('vendors', {
      name,
      inventoryMode,
      relationship: 'wholesale',
      taxExempt: false,
      createdAt: now,
      updatedAt: now,
    });
    if (saved) setVendors((current) => [...current, saved]);
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
        deviceModel: String(editing.deviceModel || '').trim(),
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

      const selectedVendor = vendors.find((vendor) =>
        (vendor.inventoryMode || 'Product') === (mode === 'parts' ? 'Part' : 'Product')
        && String(vendor.name || '').trim().toLowerCase() === String(payload.distributor || '').trim().toLowerCase());
      payload.vendorRelationship = selectedVendor?.relationship === 'consignment' ? 'consignment' : 'wholesale';
      payload.vendorSharePct = selectedVendor?.relationship === 'consignment' ? Number(selectedVendor.vendorSharePct || 0) : undefined;
      payload.vendorTaxExempt = !!selectedVendor?.taxExempt;

      await ensureVendor(payload.distributor || '');

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

  const autofillFromOrderUrl = useCallback(async (url: string) => {
    if (!url || lastScrapedUrlRef.current === url) return;
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
      setEditing((current) => {
        const next = { ...current };
        if (title && !String(current.itemDescription || '').trim()) next.itemDescription = title;
        if (vendor && !String(current.distributor || '').trim()) next.distributor = vendor;
        if (description && !String(current.notes || '').trim()) next.notes = description;
        if (typeof meta.price === 'number' && current.internalCost == null) {
          next.internalCost = meta.price;
          const price = markedUpPrice(meta.price, current.markupPct ?? DEFAULT_MARKUP_PCT);
          if (price != null) next.price = price;
        }
        return next;
      });
    } catch (err) {
      console.error('Inventory URL autofill failed', err);
    } finally {
      if (sequence === scrapeSequenceRef.current) setScrapingUrl(false);
    }
  }, []);

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
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(360px,42%)_minmax(0,1fr)] lg:overflow-hidden">
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

          <section className="min-w-0 rounded border border-zinc-700 bg-zinc-950 p-4 lg:overflow-y-auto">
            <div className="mb-4 flex flex-col gap-3 border-b border-zinc-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{selectedId ? `Edit ${mode === 'parts' ? 'Repair Part' : 'Product'}` : `Add ${mode === 'parts' ? 'Repair Part' : 'Product'}`}</h2>
                <div className="text-xs text-zinc-500">Saved here syncs through the Products collection.</div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                <div className="gb-inventory-mode-toggle grid w-full grid-cols-2 rounded border border-zinc-700 bg-zinc-900 p-1 sm:w-[260px]" role="group" aria-label="Inventory section">
                  <button
                    type="button"
                    onClick={() => setMode('products')}
                    aria-pressed={mode === 'products'}
                    className={`rounded px-3 py-2 text-sm font-semibold transition ${mode === 'products' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Products ({counts.products})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('parts')}
                    aria-pressed={mode === 'parts'}
                    className={`rounded px-3 py-2 text-sm font-semibold transition ${mode === 'parts' ? 'bg-[#BC13FE] text-white' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Parts ({counts.parts})
                  </button>
                </div>
                <div className="gb-inventory-action-row grid w-full grid-cols-2 gap-2 sm:w-[260px]">
                  <button type="button" onClick={startNew} className="rounded bg-[#39FF14] px-3 py-2 text-sm font-semibold text-black">{mode === 'parts' ? 'Add Part' : 'Add Product'}</button>
                  <button type="button" onClick={clearFields} className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:border-[#39FF14]">Clear</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="block md:col-span-2">
                <span className="mb-1 block text-xs text-zinc-400">Order URL {scrapingUrl && <span className="text-[#39FF14]">· Looking up details…</span>}</span>
                {editing.reorderUrlTemplate && !editingOrderUrl ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => openReorder(editing)} className="rounded border border-red-500 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">Order URL</button>
                    <button type="button" onClick={() => setEditingOrderUrl(true)} className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">Edit</button>
                    <button type="button" onClick={() => { setEditing((current) => ({ ...current, reorderUrlTemplate: '' })); setEditingOrderUrl(true); lastScrapedUrlRef.current = ''; }} className="rounded border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-100">Clear URL</button>
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-500" title={editing.reorderUrlTemplate}>{editing.reorderUrlTemplate}</span>
                  </div>
                ) : (
                  <input
                    value={editing.reorderUrlTemplate || ''}
                    onChange={(event) => setEditing((current) => ({ ...current, reorderUrlTemplate: event.target.value }))}
                    onBlur={() => { const url = normalizeOrderUrl(editing.reorderUrlTemplate); if (url) { setEditing((current) => ({ ...current, reorderUrlTemplate: url })); setEditingOrderUrl(false); void autofillFromOrderUrl(url); } }}
                    onKeyDown={(event) => { if (event.key !== 'Enter') return; const url = normalizeOrderUrl(editing.reorderUrlTemplate); if (!url) return; event.preventDefault(); setEditing((current) => ({ ...current, reorderUrlTemplate: url })); setEditingOrderUrl(false); void autofillFromOrderUrl(url); }}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                    placeholder="Paste the distributor product URL"
                  />
                )}
              </div>

              <label className="block md:col-span-2 md:mx-auto md:w-[72%]">
                <span className="mb-1 block text-center text-xs text-zinc-400">Vendor / Distributor</span>
                <input
                  list={`inventory-vendors-${mode}`}
                  value={editing.distributor || ''}
                  onChange={(event) => setEditing((current) => ({ ...current, distributor: event.target.value }))}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-center text-sm outline-none focus:border-[#39FF14]"
                  placeholder={mode === 'parts' ? 'Select or enter a parts distributor' : 'Select or enter a product vendor'}
                />
                <datalist id={`inventory-vendors-${mode}`}>
                  {visibleVendors.map((vendor) => <option key={`${vendor.id}-${vendor.name}`} value={vendor.name} />)}
                </datalist>
                <span className="mt-1 block text-center text-[11px] text-zinc-500">New names are saved to the {mode === 'parts' ? 'Parts' : 'Products'} vendor list when this listing is saved.</span>
              </label>

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
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-400">Device Model</span>
                  <input list="inventory-device-models" value={editing.deviceModel || ''} onChange={(event) => setEditing((current) => ({ ...current, deviceModel: event.target.value }))} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]" placeholder="Select or enter a model" />
                  <datalist id="inventory-device-models">{deviceModels.map((value) => <option key={value} value={value} />)}</datalist>
                </label>
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
