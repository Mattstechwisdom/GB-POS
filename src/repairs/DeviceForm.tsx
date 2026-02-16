import React, { useEffect, useMemo, useState } from 'react';

interface DeviceFormProps {
  onCancel: () => void;
  onSaved: () => void;
  titles: string[]; // existing main Titles to pick from
  devices?: Array<{ id?: number; name: string; title?: string }>; // existing device names (sub-categories)
  initialTitle?: string;
  initialDeviceName?: string;
}

type AdditionalFeeRecord = {
  id?: number;
  category: string;
  name: string;
  amount?: number;
};

// Device Categories live in the 'deviceCategories' collection
// We'll add optional 'title' (aka sub-category) on the category.
export default function DeviceForm({ onCancel, onSaved, titles, devices = [], initialTitle, initialDeviceName }: DeviceFormProps) {
  // Repair Categories (devices): Title = device type (Laptop, Game Console), Name = a device within that type.
  const [titleText, setTitleText] = useState('');
  const [deviceNameText, setDeviceNameText] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | undefined>(undefined);

  // Additional Fees
  const [fees, setFees] = useState<AdditionalFeeRecord[]>([]);
  const [feeCategoryText, setFeeCategoryText] = useState('');
  const [feeNameText, setFeeNameText] = useState('');
  const [feeAmountText, setFeeAmountText] = useState('');
  const [selectedFeeId, setSelectedFeeId] = useState<number | undefined>(undefined);

  const [saving, setSaving] = useState(false);

  async function reloadFees() {
    try {
      const api: any = (window as any).api || {};
      const list = await api.dbGet?.('additionalFees').catch(() => []);
      setFees(Array.isArray(list) ? (list as any) : []);
    } catch {
      setFees([]);
    }
  }

  const effectiveTitle = useMemo(() => (titleText || '').trim(), [titleText]);
  const canSave = (effectiveTitle.length > 0) && (deviceNameText.trim().length > 0 || selectedDeviceId !== undefined);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const api: any = (window as any).api || {};
      // If an existing device is selected, update its title (use correct signature api.update)
      if (selectedDeviceId !== undefined && typeof api.update === 'function') {
        const updated = await api.update('deviceCategories', { id: selectedDeviceId, title: effectiveTitle });
        if (updated) { onSaved(); return; }
      }
      if (selectedDeviceId !== undefined && typeof api.dbUpdate === 'function') {
        const existing = (devices || []).find(d => Number(d.id) === Number(selectedDeviceId));
        const updated = await api.dbUpdate('deviceCategories', selectedDeviceId, { ...(existing || {}), name: (existing?.name || deviceNameText).trim(), title: effectiveTitle });
        if (updated) { onSaved(); return; }
      }
      // Else create new device with the provided name and title
      const payload: any = { name: deviceNameText.trim(), title: effectiveTitle };
      if (api.addDeviceCategory) {
        const added = await api.addDeviceCategory(payload);
        if (added) { onSaved(); return; }
      } else if (api.dbAdd) {
        const added = await api.dbAdd('deviceCategories', payload);
        if (added) { onSaved(); return; }
      }
      alert('Failed to save device category');
    } catch (e) {
      console.error('save device category failed', e);
      alert('Failed to save device category');
    } finally {
      setSaving(false);
    }
  }

  const effectiveTitles = useMemo(() => Array.from(new Set([...(titles || [])].filter(Boolean))).sort(), [titles]);
  const devicesForTitle = useMemo(() => {
    const t = effectiveTitle;
    const list = (devices || []).filter(d => (d.title || '').trim() === t).map(d => d.name).filter(Boolean) as string[];
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
  }, [devices, effectiveTitle]);

  const feeCategories = useMemo(() => {
    const list = (fees || []).map(f => String((f as any).category || '').trim()).filter(Boolean);
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
  }, [fees]);
  const feesForCategory = useMemo(() => {
    const c = String(feeCategoryText || '').trim();
    const list = (fees || []).filter(f => String((f as any).category || '').trim() === c).map(f => String((f as any).name || '').trim()).filter(Boolean);
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
  }, [fees, feeCategoryText]);

  function parseMoney(v: string) {
    const n = Number(String(v || '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  async function upsertFeeRepairItem(fee: AdditionalFeeRecord) {
    const api: any = (window as any).api || {};
    if (!api?.dbGet || !api?.dbAdd || !api?.dbUpdate) return;
    if (fee?.id == null) return;

    const id = `fee:${fee.id}`;
    const payload: any = {
      id,
      category: String(fee.category || '').trim() || 'Additional Fees',
      title: String(fee.name || '').trim() || 'Fee',
      altDescription: '',
      partCost: 0,
      laborCost: Number(fee.amount ?? 0) || 0,
      type: 'service',
      model: '',
    };

    const list = await api.dbGet('repairCategories').catch(() => []);
    const existing = (Array.isArray(list) ? list : []).find((r: any) => String(r?.id) === id);
    if (existing) {
      await api.dbUpdate('repairCategories', id, { ...existing, ...payload });
    } else {
      await api.dbAdd('repairCategories', payload);
    }
  }

  async function saveFee() {
    const api: any = (window as any).api || {};
    if (!api?.dbAdd || !api?.dbUpdate) return;
    const category = String(feeCategoryText || '').trim();
    const name = String(feeNameText || '').trim();
    const amount = parseMoney(feeAmountText);
    if (!category || !name) return;

    setSaving(true);
    try {
      if (selectedFeeId != null) {
        const existing = fees.find(f => Number(f.id) === Number(selectedFeeId));
        await api.dbUpdate('additionalFees', selectedFeeId, { ...(existing || {}), category, name, amount });
        await upsertFeeRepairItem({ id: selectedFeeId, category, name, amount });
      } else {
        const added = await api.dbAdd('additionalFees', { category, name, amount });
        const newId = Number((added as any)?.id);
        if (Number.isFinite(newId)) {
          await upsertFeeRepairItem({ id: newId, category, name, amount });
        }
      }
      await reloadFees();
      onSaved();
      setSelectedFeeId(undefined);
      setFeeNameText('');
      setFeeAmountText('');
    } catch (e) {
      console.error('save fee failed', e);
      alert('Failed to save additional fee');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedFee() {
    if (selectedFeeId == null) return;
    const f = fees.find(x => Number(x.id) === Number(selectedFeeId));
    const label = `${String(f?.category || '').trim()}: ${String(f?.name || '').trim()}`.trim();
    const ok = window.confirm(`Delete ${label || 'this fee'}? This cannot be undone.`);
    if (!ok) return;
    setSaving(true);
    try {
      const api: any = (window as any).api || {};
      await api.dbDelete?.('additionalFees', selectedFeeId);
      await api.dbDelete?.('repairCategories', `fee:${selectedFeeId}`);
      await reloadFees();
      onSaved();
      setSelectedFeeId(undefined);
      setFeeCategoryText('');
      setFeeNameText('');
      setFeeAmountText('');
    } catch (e) {
      console.error('delete fee failed', e);
      alert('Failed to delete additional fee');
    } finally {
      setSaving(false);
    }
  }

  // Seed from initial props (e.g., when a repair is selected on the left)
  useEffect(() => {
    if (initialDeviceName) {
      setDeviceNameText(initialDeviceName);
      const found = (devices || []).find(d => d.name === initialDeviceName);
      setSelectedDeviceId(typeof found?.id === 'number' ? found!.id : undefined);
      if (found?.title) {
        setTitleText(found.title);
      } else if (initialTitle) {
        setTitleText(initialTitle);
      }
    } else if (initialTitle) {
      setTitleText(initialTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTitle, initialDeviceName]);

  useEffect(() => {
    reloadFees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deleteSelected() {
    if (selectedDeviceId === undefined) return;
    const name = (devices || []).find(d => d.id === selectedDeviceId)?.name || deviceNameText || 'this device';
    const ok = window.confirm(`Delete ${name}? This cannot be undone.`);
    if (!ok) return;
    try {
      const api: any = (window as any).api || {};
      if (typeof api.dbDelete === 'function') {
        const res = await api.dbDelete('deviceCategories', selectedDeviceId);
        if (res) {
          setSelectedDeviceId(undefined);
          setDeviceNameText('');
          onSaved();
          return;
        }
      } else if (typeof api.deleteFromCollection === 'function') {
        const res = await api.deleteFromCollection('deviceCategories', selectedDeviceId);
        if (res) {
          setSelectedDeviceId(undefined);
          setDeviceNameText('');
          onSaved();
          return;
        }
      }
      alert('Failed to delete device');
    } catch (e) {
      console.error('delete device failed', e);
      alert('Failed to delete device');
    }
  }

  async function deleteCategory() {
    const title = (effectiveTitle || '').trim();
    if (!title) return;
    const ids = (devices || [])
      .filter(d => String((d as any).title || '').trim() === title)
      .map(d => (d as any).id)
      .filter((id: any) => id != null);
    if (ids.length === 0) {
      alert('No devices found under this category.');
      return;
    }
    const ok = window.confirm(`Delete category "${title}" and all ${ids.length} devices under it? This cannot be undone.`);
    if (!ok) return;
    setSaving(true);
    try {
      const api: any = (window as any).api || {};
      if (typeof api.dbDelete === 'function') {
        for (const id of ids) {
          try { await api.dbDelete('deviceCategories', id); } catch {}
        }
      }
      setSelectedDeviceId(undefined);
      setDeviceNameText('');
      // keep titleText so user sees what was deleted; clear if they start typing
      onSaved();
    } catch (e) {
      console.error('delete category failed', e);
      alert('Failed to delete category');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Repair Categories</h2>
        <div className="text-xs text-zinc-400 mt-1">Device types (Laptop, Game Console) and the devices within them.</div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Category (device type)</label>
            <input
              type="text"
              list="gbpos-device-type-list"
              value={titleText}
              onChange={e => { setTitleText(e.target.value); setSelectedDeviceId(undefined); }}
              placeholder="Start typing… (Laptop, Game Console, Tablet)"
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
            />
            <datalist id="gbpos-device-type-list">
              {effectiveTitles.map(t => <option key={t} value={t} />)}
            </datalist>
            <div className="text-xs text-zinc-400 mt-1">Select an existing category or type a new one.</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Device (within category)</label>
            <input
              type="text"
              list="gbpos-device-name-list"
              value={deviceNameText}
              onChange={e => {
                const v = e.target.value;
                setDeviceNameText(v);
                const found = (devices || []).find(d => (d.name || '').trim().toLowerCase() === v.trim().toLowerCase());
                if (found && typeof found.id === 'number') {
                  setSelectedDeviceId(found.id);
                  if (found.title) setTitleText(found.title);
                } else {
                  setSelectedDeviceId(undefined);
                }
              }}
              placeholder={effectiveTitle ? `Start typing… (${effectiveTitle})` : 'Start typing…'}
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
            />
            <datalist id="gbpos-device-name-list">
              {devicesForTitle.map(n => <option key={n} value={n} />)}
            </datalist>
            <div className="text-xs text-zinc-400 mt-1">Pick an existing device or type a new one for this category.</div>
          </div>
        </div>
      </div>

      {/* Devices list (5 rows tall, scrollable) */}
      <div className="mt-4 border border-zinc-700 rounded overflow-hidden">
        <div className="bg-zinc-800 px-3 py-2 text-sm font-semibold border-b border-zinc-700">Devices</div>
        <div className="max-h-40 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800 sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-zinc-700">Title</th>
                <th className="text-left p-2 border-b border-zinc-700">Device</th>
              </tr>
            </thead>
            <tbody>
              {(!devices || devices.length === 0) && (
                <tr><td colSpan={2} className="p-3 text-center text-zinc-500">No devices yet</td></tr>
              )}
              {(devices || []).map((d, idx) => (
                <tr
                  key={(d.id ?? idx) + '-' + d.name}
                  className={`${idx % 2 ? 'bg-zinc-900' : 'bg-zinc-850'} cursor-pointer ${selectedDeviceId !== undefined && d.id === selectedDeviceId ? 'outline outline-1 outline-[#39FF14]' : ''}`}
                  onClick={() => {
                    setSelectedDeviceId(typeof d.id === 'number' ? d.id : undefined);
                    setDeviceNameText(d.name || '');
                    setTitleText(d.title || '');
                  }}
                  title="Click to load into fields for editing"
                >
                  <td className="p-2 border-b border-zinc-800">{d.title || ''}</td>
                  <td className="p-2 border-b border-zinc-800">{d.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-auto flex justify-between gap-2 pt-4">
        <div>
          <button
            onClick={deleteSelected}
            disabled={selectedDeviceId === undefined || saving}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded text-sm disabled:opacity-50"
            title={selectedDeviceId === undefined ? 'Select a device to delete' : 'Delete selected device'}
          >
            Delete
          </button>
          <button
            onClick={deleteCategory}
            disabled={!effectiveTitle || saving}
            className="ml-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded text-sm disabled:opacity-50"
            title={!effectiveTitle ? 'Select or type a category (device type) first' : 'Delete the entire category (all devices under it)'}
          >
            Delete Category
          </button>
        </div>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!canSave || saving}
          className="px-4 py-2 bg-[#39FF14] hover:bg-[#32E610] text-black font-medium rounded text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : (selectedDeviceId !== undefined ? 'Update Device Title' : 'Save New Device')}
        </button>
      </div>

      {/* Additional Fees */}
      <div className="mt-6 border border-zinc-700 rounded p-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Additional Fees</div>
            <div className="text-xs text-zinc-400 mt-0.5">Diagnostic, expedited service, infestation, etc. Saved here and also synced into the Repair picker.</div>
          </div>
          <button
            type="button"
            className="px-3 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs"
            onClick={async () => { await reloadFees(); }}
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="block text-xs text-zinc-400">Fee category</label>
            <input
              type="text"
              list="gbpos-fee-category-list"
              value={feeCategoryText}
              onChange={e => { setFeeCategoryText(e.target.value); setSelectedFeeId(undefined); }}
              placeholder="Start typing… (Diagnostics, Service Fees)"
              className="w-full mt-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm"
            />
            <datalist id="gbpos-fee-category-list">
              {feeCategories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Fee</label>
            <input
              type="text"
              list="gbpos-fee-name-list"
              value={feeNameText}
              onChange={e => {
                const v = e.target.value;
                setFeeNameText(v);
                const found = (fees || []).find(f => String((f as any).category || '').trim().toLowerCase() === String(feeCategoryText || '').trim().toLowerCase() && String((f as any).name || '').trim().toLowerCase() === v.trim().toLowerCase());
                if (found?.id != null) {
                  setSelectedFeeId(Number(found.id));
                  setFeeAmountText(String((found as any).amount ?? ''));
                } else {
                  setSelectedFeeId(undefined);
                }
              }}
              placeholder={feeCategoryText ? `Start typing… (${feeCategoryText})` : 'Start typing…'}
              className="w-full mt-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm"
            />
            <datalist id="gbpos-fee-name-list">
              {feesForCategory.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Amount (labor)</label>
            <input
              type="text"
              inputMode="decimal"
              value={feeAmountText}
              onChange={e => setFeeAmountText(e.target.value)}
              placeholder="$0.00"
              className="w-full mt-1 bg-yellow-200 text-black border border-yellow-300 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button
            type="button"
            className="px-3 py-1 bg-red-700 text-white rounded text-sm disabled:opacity-50"
            disabled={selectedFeeId == null || saving}
            onClick={deleteSelectedFee}
          >
            Delete fee
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-[#39FF14] text-black rounded text-sm disabled:opacity-50"
            disabled={saving || !String(feeCategoryText || '').trim() || !String(feeNameText || '').trim()}
            onClick={saveFee}
          >
            {saving ? 'Saving…' : (selectedFeeId != null ? 'Update fee' : 'Save fee')}
          </button>
        </div>

        <div className="mt-3 border border-zinc-800 rounded overflow-hidden">
          <div className="bg-zinc-800 px-3 py-2 text-xs font-semibold border-b border-zinc-700">Saved fees</div>
          <div className="max-h-40 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800 sticky top-0">
                <tr>
                  <th className="text-left p-2 border-b border-zinc-700">Category</th>
                  <th className="text-left p-2 border-b border-zinc-700">Fee</th>
                  <th className="text-right p-2 border-b border-zinc-700">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(fees || []).length === 0 && (
                  <tr><td colSpan={3} className="p-3 text-center text-zinc-500">No additional fees yet</td></tr>
                )}
                {(fees || []).slice().sort((a, b) => {
                  const ac = String((a as any).category || '').localeCompare(String((b as any).category || ''));
                  if (ac !== 0) return ac;
                  return String((a as any).name || '').localeCompare(String((b as any).name || ''));
                }).map((f, idx) => (
                  <tr
                    key={String((f as any).id ?? idx)}
                    className={`${idx % 2 ? 'bg-zinc-900' : 'bg-zinc-850'} cursor-pointer ${selectedFeeId != null && Number((f as any).id) === Number(selectedFeeId) ? 'outline outline-1 outline-[#39FF14]' : ''}`}
                    onClick={() => {
                      setSelectedFeeId((f as any).id != null ? Number((f as any).id) : undefined);
                      setFeeCategoryText(String((f as any).category || ''));
                      setFeeNameText(String((f as any).name || ''));
                      setFeeAmountText(String((f as any).amount ?? ''));
                    }}
                    title="Click to load into fields for editing"
                  >
                    <td className="p-2 border-b border-zinc-800">{String((f as any).category || '')}</td>
                    <td className="p-2 border-b border-zinc-800">{String((f as any).name || '')}</td>
                    <td className="p-2 border-b border-zinc-800 font-mono text-right">{Number((f as any).amount ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
