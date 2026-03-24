import React, { useState, useEffect, useRef } from 'react';
import type { RepairItem } from '../lib/types';
import MoneyInput from '../components/MoneyInput';

interface RepairItemFormProps {
  selectedItem: RepairItem | null;
  onSave: (item: RepairItem) => void;
  onCancel: () => void;
  onDelete?: (itemId: string | number | undefined) => void;
  mode?: 'admin' | 'workorder' | 'workorderpicker';
  // When true (default), show the internal Edit Repair action at the top
  showCreateAction?: boolean;
}

// Helper to derive a vendor label from a URL (editable afterwards)
function deriveVendorLabelFromUrl(url: string): string {
  if (!url) return '';
  try {
    const withProto = /^(https?:)?\/\//i.test(url) ? url : 'https://' + url;
    const u = new URL(withProto);
    let host = (u.hostname || '').replace(/^www\./i, '');
    const base = host.split('.')[0];
    const cleaned = (base || '').replace(/[^a-z0-9]/gi, '');
    if (!cleaned) return '';
    // Simple PascalCase: first letter upper, rest lower; user can edit on the fly
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  } catch {
    return '';
  }
}

// Dummy device categories for now; replace with prop or API as needed
const DUMMY_DEVICE_CATEGORIES = [
  'iPhone 13',
  'iPhone 14',
  'iPad Pro',
  'Samsung Galaxy S22',
  'MacBook Air',
  'Dell XPS',
  'Other'
];

export default function RepairItemForm({ selectedItem, onSave, onCancel, onDelete, mode = 'admin', showCreateAction = true }: RepairItemFormProps) {
  // treat 'workorderpicker' as 'workorder' for UI logic
  const effectiveMode = mode === 'workorderpicker' ? 'workorder' : mode;
  // Device Category search/dropdown state
  const [deviceCategoryInput, setDeviceCategoryInput] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Repair Category search/dropdown state
  const [repairCategoryInput, setRepairCategoryInput] = useState('');
  const [showRepairCategoryDropdown, setShowRepairCategoryDropdown] = useState(false);
  const repairCategoryRef = useRef<HTMLInputElement>(null);
  // Whether to show the device category field
  const [hasDeviceCategory, setHasDeviceCategory] = useState(false);
  const [markupPct, setMarkupPct] = useState<string>('');
  const [formData, setFormData] = useState<Partial<RepairItem>>({
    category: '',
    repairCategory: '',
    title: '',
    altDescription: '',
    partCost: 0,
    laborCost: 0,
    internalCost: undefined,
    orderDate: '',
    estDelivery: '',
    partSource: '',
    orderSourceUrl: '',
    type: 'service',
    model: '',
    trackStock: false,
    stockCount: undefined,
    lowStockThreshold: undefined,
  });
  // Device types (Titles) from DB
  const [deviceCategories, setDeviceCategories] = useState<string[]>([]);
  // Repair types from DB + existing repair items (merged, deduped)
  const [repairTypes, setRepairTypes] = useState<string[]>([]);
  // no external partSources list anymore; free-text with optional autofill
  // Search/filter logic
  const filteredCategories = deviceCategories.filter(cat =>
    cat.toLowerCase().includes(deviceCategoryInput.toLowerCase())
  );
  const filteredRepairTypes = repairTypes.filter(rt =>
    rt.toLowerCase().includes(repairCategoryInput.toLowerCase())
  );

  // Fetch device categories and repair types from DB on mount
  useEffect(() => {
    (async () => {
      if (window.api?.dbGet) {
        const cats = await window.api.dbGet('deviceCategories');
        const titles = Array.isArray(cats)
          ? Array.from(new Set(cats.map((c: any) => String(c?.title || '').trim()).filter(Boolean)))
          : [];
        setDeviceCategories(titles);

        // Pull from repairTypes master list AND from existing repair items' repairCategory values
        const [rt, repairItems] = await Promise.all([
          window.api.dbGet('repairTypes').catch(() => []),
          window.api.dbGet('repairCategories').catch(() => []),
        ]);
        const fromTypes = Array.isArray(rt)
          ? rt.map((r: any) => String(r?.name || '').trim()).filter(Boolean)
          : [];
        const fromItems = Array.isArray(repairItems)
          ? repairItems.map((r: any) => String(r?.repairCategory || '').trim()).filter(Boolean)
          : [];
        const merged = Array.from(new Set([...fromTypes, ...fromItems])).sort((a, b) => a.localeCompare(b));
        setRepairTypes(merged);
      }
    })();
  }, []);

  // Part sources are now free-text; no subscription needed
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Device Category input change
  const handleDeviceCategoryInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDeviceCategoryInput(e.target.value);
    setShowCategoryDropdown(true);
    setFormData(prev => ({ ...prev, category: e.target.value }));
  };

  // Select from dropdown
  const handleCategorySelect = (cat: string) => {
    setDeviceCategoryInput(cat);
    setShowCategoryDropdown(false);
    setFormData(prev => ({ ...prev, category: cat }));
    inputRef.current?.blur();
  };

  // Hide dropdown on blur (with delay for click)
  const handleCategoryBlur = () => {
    setTimeout(() => setShowCategoryDropdown(false), 100);
  };

  // Update form when selectedItem changes
  useEffect(() => {
    if (selectedItem) {
      setFormData({
        ...selectedItem,
        orderDate: selectedItem.orderDate || '',
        estDelivery: selectedItem.estDelivery || ''
      });
      setDeviceCategoryInput(selectedItem.category || '');
      setRepairCategoryInput(selectedItem.repairCategory || '');
      setHasDeviceCategory(!!(selectedItem.category || '').trim());
    } else {
      setFormData({
        category: '',
        repairCategory: '',
        title: '',
        altDescription: '',
        partCost: 0,
        laborCost: 0,
        internalCost: undefined,
        orderDate: '',
        estDelivery: '',
        partSource: '',
        orderSourceUrl: '',
        type: 'service',
        model: '',
        trackStock: false,
        stockCount: undefined,
        lowStockThreshold: undefined,
      });
      setDeviceCategoryInput('');
      setRepairCategoryInput('');
      setHasDeviceCategory(false);
    }
  }, [selectedItem]);

  // no date fields in this form; dates are managed in Work Order and Calendar

  const clearFormFields = () => {
    setFormData({
      category: '',
      repairCategory: '',
      title: '',
      altDescription: '',
      partCost: 0,
      laborCost: 0,
      internalCost: undefined,
      orderDate: '',
      estDelivery: '',
      partSource: '',
      orderSourceUrl: '',
      type: 'service',
      model: '',
      trackStock: false,
      stockCount: undefined,
      lowStockThreshold: undefined,
    });
    setDeviceCategoryInput('');
    setRepairCategoryInput('');
    setHasDeviceCategory(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Edit Repair button at top (admin only) */}
      {effectiveMode === 'admin' && showCreateAction && (
        <div className="flex justify-end mb-4">
          <button
            type="button"
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
            onClick={clearFormFields}
          >
            Edit Repair
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {/* Repair Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Repair Category — always required, comes first */}
          <div className="md:col-span-2 relative">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Repair Category <span className="text-red-400">*</span>
            </label>
            <input
              ref={repairCategoryRef}
              type="text"
              autoComplete="off"
              value={repairCategoryInput}
              onChange={e => {
                const v = e.target.value;
                setRepairCategoryInput(v);
                setFormData(prev => ({ ...prev, repairCategory: v }));
                setShowRepairCategoryDropdown(true);
              }}
              onFocus={() => setShowRepairCategoryDropdown(true)}
              onBlur={() => setTimeout(() => setShowRepairCategoryDropdown(false), 100)}
              placeholder="e.g. Diagnostic, Screen Repair, Liquid Damage, Extra Fee\u2026"
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
            />
            {showRepairCategoryDropdown && filteredRepairTypes.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 bg-zinc-900 border border-zinc-700 mt-1 rounded shadow-lg max-h-40 overflow-y-auto">
                {filteredRepairTypes.map(rt => (
                  <li
                    key={rt}
                    className="px-3 py-2 hover:bg-[#39FF14] hover:text-black cursor-pointer text-sm"
                    onMouseDown={() => {
                      setRepairCategoryInput(rt);
                      setFormData(prev => ({ ...prev, repairCategory: rt }));
                      setShowRepairCategoryDropdown(false);
                      repairCategoryRef.current?.blur();
                    }}
                  >
                    {rt}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 2. Device Category — optional, behind a checkbox */}
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 cursor-pointer select-none mb-2">
              <input
                type="checkbox"
                checked={hasDeviceCategory}
                onChange={e => {
                  setHasDeviceCategory(e.target.checked);
                  if (!e.target.checked) {
                    setDeviceCategoryInput('');
                    setFormData(prev => ({ ...prev, category: '' }));
                  }
                }}
                className="w-4 h-4 rounded accent-[#39FF14]"
              />
              Specific to a device?
            </label>
            {hasDeviceCategory && (
              <div className="relative">
                <input
                  id="category"
                  name="category"
                  type="text"
                  ref={inputRef}
                  value={deviceCategoryInput}
                  onChange={handleDeviceCategoryInput}
                  onFocus={() => setShowCategoryDropdown(true)}
                  onBlur={handleCategoryBlur}
                  autoComplete="off"
                  placeholder="e.g. iPhone, Game Console, Android Tablet…"
                  className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
                />
                {showCategoryDropdown && filteredCategories.length > 0 && (
                  <ul className="absolute z-10 left-0 right-0 bg-zinc-900 border border-zinc-700 mt-1 rounded shadow-lg max-h-40 overflow-y-auto">
                    {filteredCategories.map(cat => (
                      <li
                        key={cat}
                        className="px-3 py-2 hover:bg-[#39FF14] hover:text-black cursor-pointer"
                        onMouseDown={() => handleCategorySelect(cat)}
                      >
                        {cat}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* 3. Repair Description */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Repair Description <span className="text-red-400">*</span>
            </label>
            <input type="text" value={formData.title || ''} name="title" onChange={handleChange} placeholder="Short name for this repair or service" className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">Alt. description</label>
            <input type="text" value={formData.altDescription || ''} name="altDescription" onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Part costs</label>
            <MoneyInput
              className="w-full bg-yellow-200 text-black border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text appearance-none"
              value={Number(formData.partCost || 0)}
              onValueChange={(v) => setFormData(prev => ({ ...prev, partCost: Number(v || 0) }))}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Labor costs</label>
            <MoneyInput
              className="w-full bg-yellow-200 text-black border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text appearance-none"
              value={Number(formData.laborCost || 0)}
              onValueChange={(v) => setFormData(prev => ({ ...prev, laborCost: Number(v || 0) }))}
              placeholder="0.00"
            />
          </div>
          {effectiveMode === 'admin' && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">Internal Cost (reporting only)</label>
              <MoneyInput
                className="w-full bg-zinc-800 text-gray-100 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text appearance-none"
                value={typeof formData.internalCost === 'number' ? formData.internalCost : undefined}
                onValueChange={(v) => setFormData(prev => ({ ...prev, internalCost: v == null ? undefined : Number(v || 0) }))}
                allowEmpty
                placeholder="0.00"
              />
              <div className="text-xs text-zinc-400 mt-1">Not shown to customers; used for reporting only.</div>
              {/* Markup % helper — computes Part Costs from Internal Cost */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs text-zinc-400 whitespace-nowrap">Markup %:</span>
                <select
                  className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs focus:border-[#39FF14] focus:outline-none"
                  value={markupPct}
                  onChange={e => setMarkupPct(e.target.value)}
                >
                  <option value="">— preset —</option>
                  <option value="5">5%</option>
                  <option value="10">10%</option>
                  <option value="15">15%</option>
                  <option value="20">20%</option>
                  <option value="25">25%</option>
                  <option value="30">30%</option>
                  <option value="40">40%</option>
                  <option value="50">50%</option>
                  <option value="100">100%</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={markupPct}
                  onChange={e => setMarkupPct(e.target.value)}
                  placeholder="%"
                  className="w-16 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs focus:border-[#39FF14] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!markupPct || !formData.internalCost}
                  onClick={() => {
                    const ic = Number(formData.internalCost || 0);
                    const pct = Number(markupPct || 0);
                    if (ic > 0 && pct > 0) {
                      const newPartCost = Math.round(ic * (1 + pct / 100) * 100) / 100;
                      setFormData(prev => ({ ...prev, partCost: newPartCost }));
                    }
                  }}
                  className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  → Set Part Cost
                </button>
                {typeof formData.internalCost === 'number' && formData.internalCost > 0 &&
                 typeof formData.partCost === 'number' && formData.partCost > 0 && (
                  <span className="text-xs text-zinc-400 whitespace-nowrap">
                    (implied: {(((formData.partCost / formData.internalCost) - 1) * 100).toFixed(1)}%)
                  </span>
                )}
              </div>

              {/* Stock tracking (admin only) */}
              <div className="border border-zinc-700 rounded p-3 mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    id="repair-track-stock-cb"
                    type="checkbox"
                    checked={!!formData.trackStock}
                    onChange={e => setFormData(prev => ({ ...prev, trackStock: e.target.checked }))}
                    className="accent-[#39FF14]"
                  />
                  <label htmlFor="repair-track-stock-cb" className="text-sm font-medium cursor-pointer">Track part stock</label>
                </div>
                {formData.trackStock && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Stock count</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.stockCount ?? ''}
                        onChange={e => setFormData(prev => ({ ...prev, stockCount: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Low stock alert at</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.lowStockThreshold ?? ''}
                        onChange={e => setFormData(prev => ({ ...prev, lowStockThreshold: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <hr className="border-zinc-700 my-2" />

        {/* Part source + URL side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Part source</label>
            <input
              type="text"
              name="partSource"
              value={formData.partSource || ''}
              onChange={handleChange}
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
              placeholder="Vendor name (auto from URL)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Order source url</label>
            <div className="flex gap-1">
              <input
                type="url"
                value={formData.orderSourceUrl || ''}
                name="orderSourceUrl"
                onChange={(e) => {
                  const url = e.target.value;
                  setFormData(prev => ({ ...prev, orderSourceUrl: url }));
                  if (!formData.partSource) {
                    const v = deriveVendorLabelFromUrl(url);
                    if (v) setFormData(prev => ({ ...prev, partSource: v }));
                  }
                }}
                placeholder="https://"
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text"
              />
              <button
                type="button"
                title="Open URL"
                disabled={!formData.orderSourceUrl}
                onClick={() => {
                  const url = formData.orderSourceUrl;
                  if (url) (window as any).api?.openExternal?.(url);
                }}
                className="px-3 py-2 rounded text-sm border border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Open
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer buttons */}
      {mode === 'admin' && (
        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-zinc-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm focus:border-[#39FF14] focus:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={clearFormFields}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm focus:border-[#39FF14] focus:outline-none"
          >
            Clear
          </button>
          {formData.id && typeof onDelete === 'function' && (
            <button
              type="button"
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
              onClick={() => onDelete(formData.id)}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            disabled={
              !formData.repairCategory ||
              !formData.title ||
              formData.partCost === undefined || isNaN(Number(formData.partCost)) ||
              formData.laborCost === undefined || isNaN(Number(formData.laborCost))
            }
            className="px-4 py-2 bg-[#39FF14] hover:bg-[#32E610] text-black font-medium rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#39FF14] focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (
                formData.repairCategory &&
                formData.title &&
                formData.partCost !== undefined && !isNaN(Number(formData.partCost)) &&
                formData.laborCost !== undefined && !isNaN(Number(formData.laborCost))
              ) {
                onSave({
                  ...formData,
                  partCost: Number(formData.partCost),
                  laborCost: Number(formData.laborCost),
                  internalCost: formData.internalCost === undefined || formData.internalCost === null ? undefined : Number(formData.internalCost),
                  id: formData.id || undefined,
                } as RepairItem);
                // Only reset if not editing
                if (!formData.id) {
                  setFormData({
                    category: '',
                    repairCategory: '',
                    title: '',
                    altDescription: '',
                    partCost: 0,
                    laborCost: 0,
                    internalCost: undefined,
                    orderDate: '',
                    estDelivery: '',
                    partSource: '',
                    orderSourceUrl: '',
                    type: 'service',
                    model: '',
                  });
                  setDeviceCategoryInput('');
                  setHasDeviceCategory(false);
                }
              }
            }}
          >
            Save
          </button>
        </div>
      )}
      {/* In workorder mode, do not show any admin controls */}
  {effectiveMode === 'workorder' && (
        <div style={{ display: 'none' }} />
      )}
      {(mode === 'workorder' || mode === 'workorderpicker') && (
        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-zinc-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm focus:border-[#39FF14] focus:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={clearFormFields}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm focus:border-[#39FF14] focus:outline-none"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={
              !formData.repairCategory ||
              !formData.title ||
              formData.partCost === undefined || isNaN(Number(formData.partCost)) ||
              formData.laborCost === undefined || isNaN(Number(formData.laborCost))
            }
            className="px-4 py-2 bg-[#39FF14] hover:bg-[#32E610] text-black font-medium rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#39FF14] focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (
                formData.repairCategory &&
                formData.title &&
                formData.partCost !== undefined && !isNaN(Number(formData.partCost)) &&
                formData.laborCost !== undefined && !isNaN(Number(formData.laborCost))
              ) {
                onSave({
                  ...formData,
                  partCost: Number(formData.partCost),
                  laborCost: Number(formData.laborCost),
                  internalCost: formData.internalCost === undefined || formData.internalCost === null ? undefined : Number(formData.internalCost),
                  id: formData.id || Math.random().toString(36).slice(2, 10),
                } as RepairItem);
              }
            }}
          >
            Add to Work Order
          </button>
        </div>
      )}
    </div>
  );
}