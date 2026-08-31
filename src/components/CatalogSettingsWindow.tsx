import React, { useEffect, useMemo, useState } from 'react';
import RepairTypeManager from '../repairs/RepairTypeManager';
import DeviceForm from '../repairs/DeviceForm';
import { consumeWindowPayload } from '../lib/windowPayload';

const DEFAULT_PART_TYPES = ['Screen', 'Battery', 'Charging Port', 'Camera', 'Speaker', 'Microphone', 'Buttons', 'Housing', 'Motherboard', 'Power Supply', 'Cable', 'Adhesive', 'Other'];

function InventoryTypesSettings() {
  const api = (window as any).api;
  const [settingsId, setSettingsId] = useState<any>();
  const [types, setTypes] = useState<string[]>(DEFAULT_PART_TYPES);
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState('');
  const sorted = useMemo(() => [...types].sort((a, b) => a.localeCompare(b)), [types]);
  useEffect(() => { void (async () => {
    const rows = await api?.dbGet?.('settings').catch(() => []);
    const record = Array.isArray(rows) ? rows[0] : null;
    setSettingsId(record?.id);
    if (Array.isArray(record?.inventoryPartTypes) && record.inventoryPartTypes.length) setTypes(record.inventoryPartTypes);
  })(); }, [api]);
  async function persist(next: string[]) {
    const normalized = Array.from(new Set(next.map(item => item.trim()).filter(Boolean)));
    setTypes(normalized);
    const payload = { inventoryPartTypes: normalized, updatedAt: new Date().toISOString() };
    if (settingsId != null) await api?.dbUpdate?.('settings', settingsId, payload);
    else { const created = await api?.dbAdd?.('settings', { ...payload, createdAt: new Date().toISOString() }); setSettingsId(created?.id); }
  }
  async function save() {
    const name = value.trim(); if (!name) return;
    await persist(editing ? types.map(item => item === editing ? name : item) : [...types, name]);
    setValue(''); setEditing('');
  }
  return <section className="flex h-full min-h-0 flex-col">
    <div><h2 className="text-lg font-bold">Inventory Part Types</h2><p className="mt-1 text-xs text-zinc-400">These values power the Part Type dropdown in Inventory. Parent parts and variants remain editable from the Inventory list.</p></div>
    <div className="mt-4 flex gap-2"><input value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void save(); }} placeholder={editing ? 'Rename part type' : 'Add part type'} className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[#39FF14]"/><button onClick={() => void save()} className="rounded-lg bg-[#39FF14] px-4 font-bold text-black">{editing ? 'Rename' : 'Add'}</button>{editing ? <button onClick={() => { setEditing(''); setValue(''); }} className="rounded-lg border border-zinc-700 px-3">Cancel</button> : null}</div>
    <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border border-zinc-700 bg-zinc-950/50">{sorted.map(type => <div key={type} className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 last:border-0"><strong>{type}</strong><div className="flex gap-2"><button onClick={() => { setEditing(type); setValue(type); }} className="rounded border border-zinc-700 px-3 py-1 text-xs">Edit</button><button onClick={() => void persist(types.filter(item => item !== type))} className="rounded border border-red-500/60 px-3 py-1 text-xs text-red-300">Remove</button></div></div>)}</div>
  </section>;
}

export default function CatalogSettingsWindow() {
  const payload = consumeWindowPayload('catalogSettings');
  const initial = (payload === 'repairs' || payload?.tab === 'repairs' || new URLSearchParams(window.location.search).get('settingsTab') === 'repairs') ? 'repairs' : 'inventory';
  const [tab, setTab] = useState<'inventory' | 'repairs'>(initial);
  const [repairPane, setRepairPane] = useState<'types' | 'devices'>('types');
  const [devices, setDevices] = useState<any[]>([]);
  const reloadDevices = async () => { const rows = await (window as any).api?.dbGet?.('deviceCategories').catch(() => []); setDevices(Array.isArray(rows) ? rows : []); };
  useEffect(() => { void reloadDevices(); const off = (window as any).api?.onDeviceCategoriesChanged?.(() => void reloadDevices()); return () => { try { off?.(); } catch {} }; }, []);
  return <div className="flex h-screen flex-col overflow-hidden bg-zinc-900 p-4 text-zinc-100">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-700 pb-3"><div><h1 className="text-xl font-black">Catalog Settings</h1><p className="text-xs text-zinc-400">Manage the saved choices shared by Inventory and Repairs.</p></div><div className="flex rounded-xl border border-zinc-700 bg-zinc-950 p-1"><button onClick={() => setTab('inventory')} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === 'inventory' ? 'bg-[#39FF14] text-black' : ''}`}>Inventory</button><button onClick={() => setTab('repairs')} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === 'repairs' ? 'bg-[#39FF14] text-black' : ''}`}>Repairs</button></div></header>
    <main className="min-h-0 flex-1 pt-4">{tab === 'inventory' ? <InventoryTypesSettings/> : <div className="flex h-full min-h-0 flex-col"><div className="mb-3 flex gap-2"><button onClick={() => setRepairPane('types')} className={`rounded-lg border px-3 py-2 text-sm font-bold ${repairPane === 'types' ? 'border-purple-400 bg-purple-500/15 text-purple-200' : 'border-zinc-700'}`}>Repair Types</button><button onClick={() => setRepairPane('devices')} className={`rounded-lg border px-3 py-2 text-sm font-bold ${repairPane === 'devices' ? 'border-purple-400 bg-purple-500/15 text-purple-200' : 'border-zinc-700'}`}>Device Categories</button></div><div className="min-h-0 flex-1">{repairPane === 'types' ? <RepairTypeManager/> : <DeviceForm titles={Array.from(new Set(devices.map(row => String(row?.title || '')).filter(Boolean)))} devices={devices} onCancel={() => setRepairPane('types')} onSaved={reloadDevices} />}</div></div>}</main>
  </div>;
}
