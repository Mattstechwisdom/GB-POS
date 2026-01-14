import React, { useEffect, useMemo, useState } from 'react';
import { useRepairCategoriesVM } from './useRepairCategoriesVM';
import DataGridSimple from '../components/DataGridSimple';
import '../repair-categories/repair-categories.css';
import { RepairItem } from './types';

export default function RepairCategoriesWindow() {
  const vm = useRepairCategoriesVM();
  const [editing, setEditing] = useState<RepairItem | null>(null);
  const [dirty, setDirty] = useState(false);

  // demo mode detection via query param: ?repairCategories=demo or ?demo=true
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('');
  const demo = params.get('repairCategories') === 'demo' || params.get('demo') === 'true';

  useEffect(() => {
    if (demo) {
      setEditing({ ...demoRepairs[0] });
    } else {
      setEditing(vm.selected ? { ...vm.selected } : null);
    }
    setDirty(false);
  }, [vm.selected]);

  // Demo sample data to visually match reference image (no persistence)
  const demoCategories = [
    { id: 'd1', name: 'Phones' },
    { id: 'd2', name: 'Computers' },
    { id: 'd3', name: 'Tablets' },
  ];

  const demoRepairs: RepairItem[] = [
    { id: 'r1', categoryName: 'Phones', name: 'Screen Replacement', type: 'service', modelNumber: 'iPhone X', altDescription: 'Front glass shattered', partCost: 29.0, laborCost: 49.0, partSource: 'Local', orderSourceUrl: '', deviceCategoryId: 'd1', orderDate: '', estDeliveryDate: '' },
    { id: 'r2', categoryName: 'Phones', name: 'Battery Replacement', type: 'service', modelNumber: 'Galaxy S9', altDescription: 'Battery swelling', partCost: 15.0, laborCost: 35.0, partSource: 'Online', orderSourceUrl: '', deviceCategoryId: 'd1', orderDate: '', estDeliveryDate: '' },
    { id: 'r3', categoryName: 'Computers', name: 'SSD Upgrade', type: 'product', modelNumber: 'M.2 1TB', altDescription: 'Upgrade storage', partCost: 120.0, laborCost: 40.0, partSource: 'Supplier', orderSourceUrl: '', deviceCategoryId: 'd2', orderDate: '', estDeliveryDate: '' },
  ];


  const columns = useMemo(() => [
    { key: 'categoryName', title: 'Category' },
    { key: 'name', title: 'Title' },
    { key: 'type', title: 'Type' },
    { key: 'modelNumber', title: 'Model #' },
  ], []);

  const rows = (demo ? demoRepairs : vm.rawRepairs).map(r => ({ ...r, categoryName: (demo ? demoCategories.find(c => c.id === r.deviceCategoryId)?.name : vm.categories.find(c => c.id === r.deviceCategoryId)?.name) || r.categoryName || '' }));

  const onSelect = (id: string) => {
    vm.setSelectedId(id);
  };

  const validateCosts = (v: number | undefined) => {
    if (v === undefined) return true;
    if (v < 0) return false;
    const s = v.toFixed(2);
    return /^\d+(\.\d{1,2})?$/.test(s);
  };

  const valid = editing ? (
    validateCosts(editing.partCost) && validateCosts(editing.laborCost) && (editing.orderSourceUrl ? /^https?:\/\/.+/.test(editing.orderSourceUrl) : true)
  ) : false;

  return (
    <div className="repair-root flex h-full text-white">
      <div className="left-pane p-4" style={{ flex: '0 0 65%' }}>
        <div className="toolbar flex items-center gap-2 mb-3 h-12">
          <label className="text-sm">Devices</label>
          <select value={vm.filterDevice || ''} onChange={e => vm.setFilterDevice(e.target.value || undefined)} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm">
            <option value="">All Devices</option>
            {vm.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="search products and services..." value={vm.searchText} onChange={e => vm.setSearchText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') {/* search reactive */} }} className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" />
          <button className="btn" onClick={() => {/* filter is reactive */}}>Find</button>
          <button className="btn" onClick={() => { vm.setSearchText(''); vm.setFilterDevice(undefined); }}>Show all</button>
        </div>
        <div className="data-grid h-[calc(100vh-160px)]">
          <DataGridSimple columns={columns} rows={rows} selectedId={vm.selected?.id} onSelect={onSelect} />
        </div>
      </div>
      <div className="right-pane p-4" style={{ flex: '0 0 35%', borderLeft: '1px solid #27272a', display: 'flex', flexDirection: 'column' }}>
        <h2 className="text-lg font-semibold mb-2">Repair Categories</h2>
        <label className="block text-sm">Device Category</label>
        <select value={editing?.deviceCategoryId || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, deviceCategoryId: e.target.value || undefined }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full mb-2">
          <option value="">—</option>
          {vm.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label className="block text-sm">Product / Service</label>
        <input value={editing?.name || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, name: e.target.value }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full mb-2" />

        <label className="block text-sm">Alt. description</label>
        <textarea value={editing?.altDescription || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, altDescription: e.target.value }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full mb-2" rows={4} />

        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-sm">Part costs</label>
            <input value={(editing?.partCost ?? 0).toFixed(2)} onChange={e => { const v = parseFloat(e.target.value || '0'); setEditing(ed => ed ? ({ ...ed, partCost: isNaN(v) ? 0 : v }) : ed); setDirty(true); }} className="bg-yellow-300 text-black border border-zinc-700 rounded px-2 py-1 text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm">Labor costs</label>
            <input value={(editing?.laborCost ?? 0).toFixed(2)} onChange={e => { const v = parseFloat(e.target.value || '0'); setEditing(ed => ed ? ({ ...ed, laborCost: isNaN(v) ? 0 : v }) : ed); setDirty(true); }} className="bg-yellow-300 text-black border border-zinc-700 rounded px-2 py-1 text-sm w-full" />
          </div>
        </div>

        <div className="mb-2">
          <label className="block text-sm">Internal Cost (reporting only)</label>
          <input value={editing?.internalCost === undefined || editing?.internalCost === null ? '' : Number(editing.internalCost).toFixed(2)} onChange={e => { const v = parseFloat(e.target.value || ''); setEditing(ed => ed ? ({ ...ed, internalCost: isNaN(v) ? undefined : v }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full" placeholder="$0.00" />
          <div className="text-xs text-zinc-400 mt-1">Not shown on work orders; used for reporting.</div>
        </div>

        <hr className="border-t border-zinc-700 my-2" />

        <label className="block text-sm">Order date</label>
        <input type="date" value={editing?.orderDate || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, orderDate: e.target.value }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full mb-2" />

        <label className="block text-sm">Est. delivery date</label>
        <input type="date" value={editing?.estDeliveryDate || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, estDeliveryDate: e.target.value }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full mb-2" />

        <label className="block text-sm">Part source</label>
        <input value={editing?.partSource || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, partSource: e.target.value }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full mb-2" />

        <label className="block text-sm">Order source url</label>
        <input value={editing?.orderSourceUrl || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, orderSourceUrl: e.target.value }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full mb-4" />

        <div className="mt-auto flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => { if (!dirty) { window.close(); } else { setEditing(vm.selected ? { ...vm.selected } : null); setDirty(false); } }}>Cancel</button>
          <button className="btn btn-primary" onClick={async () => { if (editing && valid) { await vm.save(editing); setDirty(false); } }} disabled={!valid}>Save</button>
        </div>
      </div>
    </div>
  );
}
