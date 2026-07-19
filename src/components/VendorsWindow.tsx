import React, { useCallback, useEffect, useMemo, useState } from 'react';

type VendorMode = 'Product' | 'Part';
type VendorRelationship = 'wholesale' | 'consignment';

export type VendorRecord = {
  id?: number;
  name: string;
  inventoryMode: VendorMode;
  relationship: VendorRelationship;
  taxExempt: boolean;
  vendorSharePct?: number;
  website?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  accountNumber?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

function blankVendor(mode: VendorMode = 'Product'): VendorRecord {
  return {
    name: '',
    inventoryMode: mode,
    relationship: 'wholesale',
    taxExempt: false,
    vendorSharePct: undefined,
    website: '',
    contactName: '',
    email: '',
    phone: '',
    accountNumber: '',
    notes: '',
  };
}

export default function VendorsWindow() {
  const api = (window as any).api;
  const [mode, setMode] = useState<VendorMode>('Product');
  const [records, setRecords] = useState<VendorRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [editing, setEditing] = useState<VendorRecord>(() => blankVendor());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api?.dbGet?.('vendors').catch(() => []);
      setRecords(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setSelectedId(undefined);
    setEditing(blankVendor(mode));
    setSearch('');
  }, [mode]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .filter((row) => (row.inventoryMode || 'Product') === mode)
      .filter((row) => !q || [row.name, row.contactName, row.email, row.phone, row.website]
        .some((value) => String(value || '').toLowerCase().includes(q)))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [mode, records, search]);

  const counts = useMemo(() => ({
    Product: records.filter((row) => (row.inventoryMode || 'Product') === 'Product').length,
    Part: records.filter((row) => row.inventoryMode === 'Part').length,
  }), [records]);

  const clear = () => {
    setSelectedId(undefined);
    setEditing(blankVendor(mode));
  };

  const select = (row: VendorRecord) => {
    setSelectedId(row.id);
    setEditing({ ...blankVendor(mode), ...row, inventoryMode: mode });
  };

  const save = async () => {
    const name = String(editing.name || '').trim();
    if (!name) return alert('Vendor or distributor name is required.');
    const duplicate = records.find((row) => row.id !== selectedId
      && (row.inventoryMode || 'Product') === mode
      && String(row.name || '').trim().toLowerCase() === name.toLowerCase());
    if (duplicate) return alert(`${name} already exists in ${mode === 'Part' ? 'Parts' : 'Products'}.`);
    if (editing.relationship === 'consignment') {
      const share = Number(editing.vendorSharePct);
      if (!Number.isFinite(share) || share < 0 || share > 100) return alert('Vendor share must be between 0% and 100%.');
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload: VendorRecord = {
        ...editing,
        name,
        inventoryMode: mode,
        relationship: editing.relationship === 'consignment' ? 'consignment' : 'wholesale',
        taxExempt: !!editing.taxExempt,
        vendorSharePct: editing.relationship === 'consignment' ? Number(editing.vendorSharePct || 0) : undefined,
        website: String(editing.website || '').trim(),
        contactName: String(editing.contactName || '').trim(),
        email: String(editing.email || '').trim(),
        phone: String(editing.phone || '').trim(),
        accountNumber: String(editing.accountNumber || '').trim(),
        notes: String(editing.notes || '').trim(),
        updatedAt: now,
      };
      const saved = payload.id
        ? await api?.update?.('vendors', payload)
        : await api?.dbAdd?.('vendors', { ...payload, createdAt: now });
      const merged = { ...payload, ...(saved || {}) };
      setRecords((current) => {
        if (!merged.id) return current;
        const index = current.findIndex((row) => row.id === merged.id);
        if (index < 0) return [...current, merged];
        const next = [...current];
        next[index] = merged;
        return next;
      });
      setSelectedId(merged.id);
      setEditing(merged);
    } catch (error) {
      console.error('Vendor save failed', error);
      alert('Vendor or distributor could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !confirm(`Delete ${editing.name}? Existing inventory and transaction records will not be changed.`)) return;
    setSaving(true);
    try {
      await api?.dbDelete?.('vendors', selectedId);
      setRecords((current) => current.filter((row) => row.id !== selectedId));
      clear();
    } catch (error) {
      console.error('Vendor delete failed', error);
      alert('Vendor or distributor could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-zinc-900 text-zinc-100">
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b border-zinc-700 px-4 py-3">
          <h1 className="text-xl font-bold">Distributors / Vendors</h1>
          <p className="text-xs text-zinc-400">Product vendors and parts distributors remain separate for accurate purchasing and reporting.</p>
        </header>
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(340px,40%)_minmax(0,1fr)] lg:overflow-hidden">
          <section className="flex min-h-[300px] flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950">
            <div className="border-b border-zinc-800 p-3">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${mode === 'Part' ? 'parts distributors' : 'product vendors'}...`} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? <div className="p-4 text-sm text-zinc-400">Loading...</div> : visible.length === 0 ? <div className="p-4 text-sm text-zinc-500">No entries found.</div> : visible.map((row) => (
                <button key={row.id} type="button" onClick={() => select(row)} className={`w-full border-b border-l-4 border-zinc-800 px-3 py-3 text-left ${selectedId === row.id ? 'border-l-[#39FF14] bg-zinc-800' : 'border-l-transparent hover:bg-zinc-900'}`}>
                  <div className="font-semibold">{row.name || '(unnamed)'}</div>
                  <div className="mt-1 text-xs text-zinc-400">{row.relationship === 'consignment' ? `Consignment - ${Number(row.vendorSharePct || 0)}% vendor share` : 'Wholesale / direct purchase'}{row.taxExempt ? ' - Tax exempt' : ''}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="min-w-0 rounded border border-zinc-700 bg-zinc-950 p-4 lg:overflow-y-auto">
            <div className="mb-4 flex flex-col gap-3 border-b border-zinc-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div><h2 className="text-lg font-semibold">{selectedId ? 'Edit Entry' : 'Add New Entry'}</h2><p className="text-xs text-zinc-500">Settings apply only to this inventory section.</p></div>
              <div className="gb-vendor-mode-toggle grid w-full grid-cols-2 rounded border border-zinc-700 bg-zinc-900 p-1 sm:w-[280px]" role="group" aria-label="Vendor inventory section">
                <button type="button" onClick={() => setMode('Product')} aria-pressed={mode === 'Product'} className={`rounded px-3 py-2 text-sm font-semibold ${mode === 'Product' ? 'bg-[#39FF14] text-black' : 'text-zinc-400'}`}>Products ({counts.Product})</button>
                <button type="button" onClick={() => setMode('Part')} aria-pressed={mode === 'Part'} className={`rounded px-3 py-2 text-sm font-semibold ${mode === 'Part' ? 'bg-[#BC13FE] text-white' : 'text-zinc-400'}`}>Parts ({counts.Part})</button>
              </div>
            </div>
            <div className="mb-4 flex gap-2">
              <button type="button" onClick={clear} className="rounded bg-[#39FF14] px-4 py-2 text-sm font-semibold text-black">Add New</button>
              <button type="button" onClick={clear} className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm">Clear</button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="md:col-span-2"><span className="mb-1 block text-xs text-zinc-400">Vendor / Distributor Name</span><input value={editing.name} onChange={(event) => setEditing((current) => ({ ...current, name: event.target.value }))} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[#39FF14]" /></label>
              <label><span className="mb-1 block text-xs text-zinc-400">Relationship</span><select value={editing.relationship} onChange={(event) => setEditing((current) => ({ ...current, relationship: event.target.value as VendorRelationship }))} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2"><option value="wholesale">Wholesale / direct purchase</option>{mode === 'Product' ? <option value="consignment">Consignment / revenue share</option> : null}</select></label>
              {editing.relationship === 'consignment' && mode === 'Product' ? <label><span className="mb-1 block text-xs text-zinc-400">Vendor Share %</span><input type="number" min="0" max="100" step="0.01" value={editing.vendorSharePct ?? ''} onChange={(event) => setEditing((current) => ({ ...current, vendorSharePct: event.target.value === '' ? undefined : Number(event.target.value) }))} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2" /></label> : <div />}
              <label className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"><input type="checkbox" checked={editing.taxExempt} onChange={(event) => setEditing((current) => ({ ...current, taxExempt: event.target.checked }))} className="accent-[#39FF14]" /> Tax exempt purchases</label>
              <label><span className="mb-1 block text-xs text-zinc-400">Website</span><input value={editing.website || ''} onChange={(event) => setEditing((current) => ({ ...current, website: event.target.value }))} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2" /></label>
              <label><span className="mb-1 block text-xs text-zinc-400">Contact Name</span><input value={editing.contactName || ''} onChange={(event) => setEditing((current) => ({ ...current, contactName: event.target.value }))} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2" /></label>
              <label><span className="mb-1 block text-xs text-zinc-400">Email</span><input type="email" value={editing.email || ''} onChange={(event) => setEditing((current) => ({ ...current, email: event.target.value }))} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2" /></label>
              <label><span className="mb-1 block text-xs text-zinc-400">Phone</span><input value={editing.phone || ''} onChange={(event) => setEditing((current) => ({ ...current, phone: event.target.value }))} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2" /></label>
              <label><span className="mb-1 block text-xs text-zinc-400">Account Number</span><input value={editing.accountNumber || ''} onChange={(event) => setEditing((current) => ({ ...current, accountNumber: event.target.value }))} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2" /></label>
              <label className="md:col-span-2"><span className="mb-1 block text-xs text-zinc-400">Notes</span><textarea value={editing.notes || ''} onChange={(event) => setEditing((current) => ({ ...current, notes: event.target.value }))} className="min-h-[100px] w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2" /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={remove} disabled={!selectedId || saving} className="rounded border border-red-700 bg-red-950 px-4 py-2 text-sm text-red-100 disabled:opacity-40">Delete</button><button type="button" onClick={save} disabled={saving} className="rounded bg-[#39FF14] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{saving ? 'Saving...' : 'Save Entry'}</button></div>
          </section>
        </main>
      </div>
    </div>
  );
}
