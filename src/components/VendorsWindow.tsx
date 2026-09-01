import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { groupVendorLinks, renameVendorLinks, vendorKey } from '../lib/vendorCatalog';

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

export default function VendorsWindow({ embedded = false }: { embedded?: boolean }) {
  const api = (window as any).api;
  const [mode, setMode] = useState<VendorMode>('Product');
  const [records, setRecords] = useState<VendorRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [editing, setEditing] = useState<VendorRecord>(() => blankVendor());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [repairs, setRepairs] = useState<any[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [mergeTargetId, setMergeTargetId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, partRows, repairRows] = await Promise.all([api?.dbGet?.('vendors').catch(() => []), api?.dbGet?.('products').catch(() => []), api?.dbGet?.('repairCategories').catch(() => [])]);
      setRecords(Array.isArray(list) ? list : []); setProducts(Array.isArray(partRows) ? partRows : []); setRepairs(Array.isArray(repairRows) ? repairRows : []);
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
    setSavedMessage(null);
  };

  const select = (row: VendorRecord) => {
    setSelectedId(row.id);
    setEditing({ ...blankVendor(mode), ...row, inventoryMode: mode });
    setSavedMessage(null);
  };

  const save = async () => {
    const name = String(editing.name || '').trim();
    if (!name) return alert('Vendor or distributor name is required.');
    const duplicate = records.find((row) => row.id !== selectedId && (row.inventoryMode || 'Product') === mode && vendorKey(row.name) === vendorKey(name));
    if (duplicate) return alert(`${name} already exists in ${mode === 'Part' ? 'Parts' : 'Products'}.`);
    if (editing.relationship === 'consignment') {
      const share = Number(editing.vendorSharePct);
      if (!Number.isFinite(share) || share < 0 || share > 100) return alert('Vendor share must be between 0% and 100%.');
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const previous = records.find(row => String(row.id) === String(selectedId));
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
      if (previous && vendorKey(previous.name) !== vendorKey(name)) {
        const renamed = renameVendorLinks(previous.name, name, products, repairs);
        await Promise.all(renamed.products.filter((row, index) => row !== products[index]).map(row => api?.dbUpdate?.('products', row.id, row)));
        await Promise.all(renamed.repairs.filter((row, index) => row !== repairs[index]).map(row => api?.dbUpdate?.('repairCategories', row.id, row)));
        setProducts(renamed.products); setRepairs(renamed.repairs);
      }
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
      setSavedMessage(`Saved "${merged.name}".`);
      window.setTimeout(() => setSavedMessage((current) => (current === `Saved "${merged.name}".` ? null : current)), 4000);
    } catch (error) {
      console.error('Vendor save failed', error);
      alert('Vendor or distributor could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    const links = groupVendorLinks(editing, products, repairs, mode);
    if (links.products.length || links.parts.length || links.repairs.length) {
      const summary = mode === 'Product'
        ? `${links.products.length} product(s)`
        : `${links.parts.length} part(s) and ${links.repairs.length} repair(s)`;
      return alert(`Reassign or merge this distributor first. It is linked to ${summary}.`);
    }
    if (!confirm(`Delete ${editing.name}?`)) return;
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

  const mergeSelected = async () => {
    const source = records.find(row => String(row.id) === String(selectedId));
    const target = records.find(row => String(row.id) === mergeTargetId);
    if (!source || !target || !confirm(`Merge "${source.name}" into "${target.name}"? Linked parts and repairs will use the target name.`)) return;
    setSaving(true);
    try {
      const renamed = renameVendorLinks(source.name, target.name, products, repairs);
      await Promise.all(renamed.products.filter((row, index) => row !== products[index]).map(row => api?.dbUpdate?.('products', row.id, row)));
      await Promise.all(renamed.repairs.filter((row, index) => row !== repairs[index]).map(row => api?.dbUpdate?.('repairCategories', row.id, row)));
      const deleted = await api?.dbDelete?.('vendors', source.id);
      if (deleted === false) throw new Error('The duplicate vendor record could not be removed.');
      setProducts(renamed.products); setRepairs(renamed.repairs); setMergeTargetId(''); clear(); await load();
    } catch (error) { console.error('Vendor merge failed', error); alert('The vendor merge could not be completed. No linked records were intentionally discarded.'); }
    finally { setSaving(false); }
  };

  return (
    <div className={`${embedded ? 'h-full rounded-xl border border-zinc-700' : 'h-screen'} overflow-hidden bg-zinc-900 text-zinc-100`}>
      <div className="flex h-full flex-col">
        {!embedded ? <header className="shrink-0 border-b border-zinc-700 px-4 py-3">
          <h1 className="text-xl font-bold">Distributors / Vendors</h1>
          <p className="text-xs text-zinc-400">Product vendors and parts distributors remain separate for accurate purchasing and reporting.</p>
        </header> : null}
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(340px,40%)_minmax(0,1fr)] lg:overflow-hidden">
          <section className="flex min-h-[300px] flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950">
            <div className="border-b border-zinc-800 p-3">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${mode === 'Part' ? 'parts distributors' : 'product vendors'}...`} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#39FF14]" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? <div className="p-4 text-sm text-zinc-400">Loading...</div> : visible.length === 0 ? <div className="p-4 text-sm text-zinc-500">No entries found.</div> : visible.map((row) => { const key = String(row.id ?? row.name); const links = groupVendorLinks(row, products, repairs, mode); const expanded = expandedIds.has(key); return <div key={key} className="border-b border-zinc-800"><div className={`flex border-l-4 ${selectedId != null && row.id != null && String(selectedId) === String(row.id) ? 'border-l-[#39FF14] bg-zinc-800' : 'border-l-transparent hover:bg-zinc-900'}`}><button type="button" onClick={() => select(row)} className="min-w-0 flex-1 px-3 py-3 text-left"><div className="truncate font-semibold">{row.name || '(unnamed)'}</div><div className="mt-1 text-xs text-zinc-400">{mode === 'Product' ? `${links.products.length} products` : `${links.parts.length} parts · ${links.repairs.length} repairs`} · {row.taxExempt ? 'Tax exempt' : 'Taxable'}</div></button><button type="button" aria-expanded={expanded} aria-label={`Show linked records for ${row.name}`} onClick={() => setExpandedIds(current => { const next = new Set(current); expanded ? next.delete(key) : next.add(key); return next; })} className="px-3 text-zinc-400">{expanded ? '−' : '+'}</button></div>{expanded ? mode === 'Product' ? <div className="bg-zinc-950 p-3 text-xs"><div><strong className="text-zinc-300">Products</strong>{links.products.length ? links.products.slice(0, 20).map(product => <button key={product.id} type="button" onClick={() => api?.openProducts?.({ productId: product.id })} className="mt-1 block w-full truncate rounded bg-zinc-900 px-2 py-1 text-left text-zinc-400 hover:text-white">{product.itemDescription || product.title || `Product ${product.id}`}</button>) : <p className="mt-1 text-zinc-600">None linked</p>}</div></div> : <div className="grid gap-2 bg-zinc-950 p-3 text-xs sm:grid-cols-2"><div><strong className="text-zinc-300">Parts</strong>{links.parts.length ? links.parts.slice(0, 20).map(part => <button key={part.id} type="button" onClick={() => api?.openInventory?.({ inventoryId: part.id })} className="mt-1 block w-full truncate rounded bg-zinc-900 px-2 py-1 text-left text-zinc-400 hover:text-white">{part.itemDescription || part.title || `Part ${part.id}`}</button>) : <p className="mt-1 text-zinc-600">None linked</p>}</div><div><strong className="text-zinc-300">Repairs</strong>{links.repairs.length ? links.repairs.slice(0, 20).map(repair => <button key={repair.id} type="button" onClick={() => api?.openRepairCategories?.({ repairId: repair.id })} className="mt-1 block w-full truncate rounded bg-zinc-900 px-2 py-1 text-left text-zinc-400 hover:text-white">{repair.title || `Repair ${repair.id}`}</button>) : <p className="mt-1 text-zinc-600">None linked</p>}</div></div> : null}</div>; })}
            </div>
          </section>

          <section className="min-w-0 rounded border border-zinc-700 bg-zinc-950 p-4 lg:overflow-y-auto">
            <div className="mb-4 flex flex-col gap-3 border-b border-zinc-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div><h2 className="text-lg font-semibold">{selectedId ? 'Edit Entry' : 'Add New Entry'}</h2><p className="text-xs text-zinc-500">{savedMessage || 'Select an entry on the left to edit it, then hit Save Entry.'}</p></div>
              <div className="gb-vendor-mode-toggle grid w-full grid-cols-2 rounded border border-zinc-700 bg-zinc-900 p-1 sm:w-[280px]" role="group" aria-label="Vendor inventory section">
                <button type="button" onClick={() => setMode('Product')} aria-pressed={mode === 'Product'} className={`rounded px-3 py-2 text-sm font-semibold ${mode === 'Product' ? 'bg-[#39FF14] text-black' : 'text-zinc-400'}`}>Products ({counts.Product})</button>
                <button type="button" onClick={() => setMode('Part')} aria-pressed={mode === 'Part'} className={`rounded px-3 py-2 text-sm font-semibold ${mode === 'Part' ? 'bg-[#BC13FE] text-white' : 'text-zinc-400'}`}>Parts ({counts.Part})</button>
              </div>
            </div>
            <div className="mb-4 flex gap-2">
              <button type="button" onClick={clear} className="rounded bg-[#39FF14] px-4 py-2 text-sm font-semibold text-black">Add New</button>
              <button type="button" onClick={clear} className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm">Clear</button>
            </div>
            {selectedId ? <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-purple-500/30 bg-purple-950/20 p-3"><label className="min-w-[190px] flex-1"><span className="mb-1 block text-xs font-semibold text-purple-200">Merge duplicate into</span><select value={mergeTargetId} onChange={event => setMergeTargetId(event.target.value)} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"><option value="">Choose canonical name…</option>{records.filter(row => row.id !== selectedId && (row.inventoryMode || 'Product') === mode).map(row => <option key={row.id} value={String(row.id)}>{row.name}</option>)}</select></label><button type="button" disabled={!mergeTargetId || saving} onClick={() => void mergeSelected()} className="rounded border border-purple-400 px-3 py-2 text-sm font-bold text-purple-200 disabled:opacity-40">Merge Records</button></div> : null}
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
