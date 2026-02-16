import React, { useState, useEffect, useRef } from 'react';
import type { RepairItem } from '../lib/types';

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
  const [formData, setFormData] = useState<Partial<RepairItem>>({
    category: '',
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
  // Device types (Titles) from DB
  const [deviceCategories, setDeviceCategories] = useState<string[]>([]);
  // Track focus for cost fields
  const [partCostFocused, setPartCostFocused] = useState(false);
  const [laborCostFocused, setLaborCostFocused] = useState(false);
  const [internalCostFocused, setInternalCostFocused] = useState(false);
  // no external partSources list anymore; free-text with optional autofill
  // Search/filter logic
  const filteredCategories = deviceCategories.filter(cat =>
    cat.toLowerCase().includes(deviceCategoryInput.toLowerCase())
  );

  // Fetch device categories from DB on mount
  useEffect(() => {
    (async () => {
      if (window.api?.dbGet) {
        const cats = await window.api.dbGet('deviceCategories');
        const titles = Array.isArray(cats)
          ? Array.from(new Set(cats.map((c: any) => String(c?.title || '').trim()).filter(Boolean)))
          : [];
        setDeviceCategories(titles);
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
    } else {
      setFormData({
        category: '',
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
    }
  }, [selectedItem]);

  // no date fields in this form; dates are managed in Work Order and Calendar

  return (
    <div className="flex flex-col h-full">
      {/* Edit Repair button at top (admin only) */}
      {effectiveMode === 'admin' && showCreateAction && (
        <div className="flex justify-end mb-4">
          <button
            type="button"
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
            onClick={() => {
              setFormData({
                category: '',
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
            }}
          >
            Edit Repair
          </button>
        </div>
      )}
      {/* Form header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Work Order Item</h2>
        {!selectedItem && (
          <p className="text-sm text-gray-400 mt-1">Select an item from the list to edit</p>
        )}
      </div>
      <div className="flex-1 space-y-6">
        {/* Repair Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-300 mb-1">Device Category</label>
            <input
              id="category"
              name="category"
              type="text"
              ref={inputRef}
              value={deviceCategoryInput}
              onChange={handleDeviceCategoryInput}
              onFocus={() => setShowCategoryDropdown(true)}
              onBlur={handleCategoryBlur}
              /* always enabled */
              autoComplete="off"
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none disabled:opacity-50 disabled:cursor-text"
              required
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
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Repair / Service</label>
      <input type="text" value={formData.title || ''} name="title" onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">Alt. description</label>
      <input type="text" value={formData.altDescription || ''} name="altDescription" onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Part costs</label>
            <input
              type="text"
              inputMode="decimal"
              pattern="^\$?\d{1,3}(,\d{3})*(\.\d{0,2})?$"
              value={
                partCostFocused
                  ? (formData.partCost === undefined || formData.partCost === null ? '' : String(formData.partCost))
                  : (formData.partCost === undefined || formData.partCost === null ? '' : Number(formData.partCost).toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
              }
              name="partCost"
              onChange={e => {
                const raw = e.target.value.replace(/[^\d.]/g, '');
                setFormData(prev => ({ ...prev, partCost: raw === '' ? undefined : Number(raw) }));
              }}
              onFocus={() => setPartCostFocused(true)}
              onBlur={e => {
                setPartCostFocused(false);
                let val = e.target.value.replace(/[^\d.]/g, '');
                let num = parseFloat(val);
                setFormData(prev => ({ ...prev, partCost: isNaN(num) ? undefined : num }));
              }}
              className="w-full bg-yellow-200 text-black border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text appearance-none"
              placeholder="$0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Labor costs</label>
            <input
              type="text"
              inputMode="decimal"
              pattern="^\$?\d{1,3}(,\d{3})*(\.\d{0,2})?$"
              value={
                laborCostFocused
                  ? (formData.laborCost === undefined || formData.laborCost === null ? '' : String(formData.laborCost))
                  : (formData.laborCost === undefined || formData.laborCost === null ? '' : Number(formData.laborCost).toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
              }
              name="laborCost"
              onChange={e => {
                const raw = e.target.value.replace(/[^\d.]/g, '');
                setFormData(prev => ({ ...prev, laborCost: raw === '' ? undefined : Number(raw) }));
              }}
              onFocus={() => setLaborCostFocused(true)}
              onBlur={e => {
                setLaborCostFocused(false);
                let val = e.target.value.replace(/[^\d.]/g, '');
                let num = parseFloat(val);
                setFormData(prev => ({ ...prev, laborCost: isNaN(num) ? undefined : num }));
              }}
              className="w-full bg-yellow-200 text-black border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text appearance-none"
              placeholder="$0.00"
            />
          </div>
          {effectiveMode === 'admin' && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">Internal Cost (reporting only)</label>
              <input
                type="text"
                inputMode="decimal"
                pattern="^\$?\d{1,3}(,\d{3})*(\.\d{0,2})?$"
                value={
                  internalCostFocused
                    ? (formData.internalCost === undefined || formData.internalCost === null ? '' : String(formData.internalCost))
                    : (formData.internalCost === undefined || formData.internalCost === null ? '' : Number(formData.internalCost).toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
                }
                name="internalCost"
                onChange={e => {
                  const raw = e.target.value.replace(/[^\d.]/g, '');
                  setFormData(prev => ({ ...prev, internalCost: raw === '' ? undefined : Number(raw) }));
                }}
                onFocus={() => setInternalCostFocused(true)}
                onBlur={e => {
                  setInternalCostFocused(false);
                  let val = e.target.value.replace(/[^\d.]/g, '');
                  let num = parseFloat(val);
                  setFormData(prev => ({ ...prev, internalCost: isNaN(num) ? undefined : num }));
                }}
                className="w-full bg-zinc-800 text-gray-100 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text appearance-none"
                placeholder="$0.00"
              />
              <div className="text-xs text-zinc-400 mt-1">Not shown to customers; used for reporting only.</div>
            </div>
          )}
        </div>

        {/* Divider */}
        <hr className="border-zinc-700 my-2" />

        {/* Part source + URL (stacked to avoid overlap in narrower windows) */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Part source</label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                name="partSource"
                value={formData.partSource || ''}
                onChange={handleChange}
                className="w-full sm:flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
                placeholder="Vendor name (auto from URL)"
              />
              <button
                type="button"
                className="px-2 py-2 text-xs bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded whitespace-nowrap"
                onClick={() => {
                  const v = deriveVendorLabelFromUrl(formData.orderSourceUrl || '');
                  if (v) setFormData(prev => ({ ...prev, partSource: v }));
                }}
              >
                Autofill
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Order source url</label>
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
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none cursor-text"
            />
          </div>
        </div>
      </div>

      {/* Footer buttons */}
      {mode === 'admin' && (
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm focus:border-[#39FF14] focus:outline-none"
          >
            Cancel
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
              !formData.category ||
              !formData.title ||
              formData.partCost === undefined || isNaN(Number(formData.partCost)) ||
              formData.laborCost === undefined || isNaN(Number(formData.laborCost))
            }
            className="px-4 py-2 bg-[#39FF14] hover:bg-[#32E610] text-black font-medium rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#39FF14] focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (
                formData.category &&
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
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm focus:border-[#39FF14] focus:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              !formData.category ||
              !formData.title ||
              formData.partCost === undefined || isNaN(Number(formData.partCost)) ||
              formData.laborCost === undefined || isNaN(Number(formData.laborCost))
            }
            className="px-4 py-2 bg-[#39FF14] hover:bg-[#32E610] text-black font-medium rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#39FF14] focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (
                formData.category &&
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