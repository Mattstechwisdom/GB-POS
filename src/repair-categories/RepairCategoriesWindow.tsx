import React, { useEffect, useState } from 'react';
import { useRepairCategoriesVM } from './useRepairCategoriesVM';
import DataGrid from '../components/DataGrid';
import { RepairItem } from './types';
import '../repair-categories/repair-categories.css';

export default function RepairCategoriesWindow() {
  const vm = useRepairCategoriesVM();
  const [editing, setEditing] = useState<RepairItem | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setEditing(vm.selected ? { ...vm.selected } : null);
    setDirty(false);
  }, [vm.selected]);

  const columns = [
    { key: 'deviceCategoryName', title: 'Device' },
    { key: 'name', title: 'Title' },
    { key: 'type', title: 'Type' },
    { key: 'modelNumber', title: 'Model #' },
  ];

  const rows = vm.rawRepairs.map(r => ({ ...r, deviceCategoryName: vm.categories.find(c => c.id === r.deviceCategoryId)?.name || '' }));

  return (
    <div className="repair-root flex h-full text-white">
      <div className="left-pane flex-2 p-4">
        <div className="toolbar flex items-center gap-2 mb-3 h-12">
          <label className="text-sm">Devices</label>
          <select value={vm.filterDevice || ''} onChange={e => vm.setFilterDevice(e.target.value || undefined)} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm">
            <option value="">All Devices</option>
            {vm.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="search products and services..." value={vm.searchText} onChange={e => vm.setSearchText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') {/* trigger search - already reactive */} }} className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" />
          <button className="btn" onClick={() => { vm.setSearchText(''); vm.setFilterDevice(undefined); }}>Show all</button>
        </div>
        <div className="data-grid h-[calc(100vh-160px)]">
          <DataGrid columns={columns} rows={rows} selectedId={vm.selected?.id} onSelect={id => vm.setSelectedId(id)} />
        </div>
      </div>
      <div className="right-pane w-1/3 p-4 border-l border-zinc-700 flex flex-col">
        <div className="mb-2">
          <label className="block text-sm">Device</label>
          <select value={editing?.deviceCategoryId || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, deviceCategoryId: e.target.value || undefined }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full">
            <option value="">—</option>
            {vm.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="mb-2">
          <label className="block text-sm">Product / Service</label>
          <input value={editing?.name || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, name: e.target.value }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full" />
        </div>
        <div className="mb-2">
          <label className="block text-sm">Alt. description</label>
          <textarea value={editing?.altDescription || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, altDescription: e.target.value }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full" rows={4} />
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm">Part costs</label>
            <input value={editing?.partCost?.toFixed(2) || '0.00'} onChange={e => { const v = parseFloat(e.target.value || '0'); setEditing(ed => ed ? ({ ...ed, partCost: isNaN(v) ? 0 : v }) : ed); setDirty(true); }} className="bg-yellow-300 text-black border border-zinc-700 rounded px-2 py-1 text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm">Labor costs</label>
            <input value={editing?.laborCost?.toFixed(2) || '0.00'} onChange={e => { const v = parseFloat(e.target.value || '0'); setEditing(ed => ed ? ({ ...ed, laborCost: isNaN(v) ? 0 : v }) : ed); setDirty(true); }} className="bg-yellow-300 text-black border border-zinc-700 rounded px-2 py-1 text-sm w-full" />
          </div>
        </div>
        <div className="mb-2">
          <label className="block text-sm">Part source</label>
          <input value={editing?.partSource || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, partSource: e.target.value }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full" />
        </div>
        <div className="mb-2">
          <label className="block text-sm">Order source URL</label>
          <input value={editing?.orderSourceUrl || ''} onChange={e => { setEditing(ed => ed ? ({ ...ed, orderSourceUrl: e.target.value }) : ed); setDirty(true); }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full" />
        </div>
        <div className="mt-auto flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => { if (!dirty) { window.close(); } else { /* revert */ setEditing(vm.selected ? { ...vm.selected } : null); setDirty(false); } }}>Cancel</button>
          <button className="btn btn-primary" onClick={async () => { if (editing) { await vm.save(editing); setDirty(false); } }}>Save</button>
        </div>
      </div>
    </div>
  );
}
