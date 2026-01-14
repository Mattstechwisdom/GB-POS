import React, { useEffect, useMemo, useState } from 'react';

interface DeviceFormProps {
  onCancel: () => void;
  onSaved: () => void;
  titles: string[]; // existing main Titles to pick from
  devices?: Array<{ id?: number; name: string; title?: string }>; // existing device names (sub-categories)
  initialTitle?: string;
  initialDeviceName?: string;
}

// Device Categories live in the 'deviceCategories' collection
// We'll add optional 'title' (aka sub-category) on the category.
export default function DeviceForm({ onCancel, onSaved, titles, devices = [], initialTitle, initialDeviceName }: DeviceFormProps) {
  // Title is the MAIN category now
  const [titleText, setTitleText] = useState(''); // main Title, e.g., "Apple", "Android", "Laptop"
  const [selectedTitle, setSelectedTitle] = useState(''); // optional: select an existing title to prefill
  // Device Name is the SUB category now
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | undefined>(undefined); // pick an existing device to reassign
  const [deviceNameText, setDeviceNameText] = useState(''); // or create a new Device Name
  const [saving, setSaving] = useState(false);

  // Use either the typed title or the selected existing title
  const effectiveTitle = useMemo(() => (titleText || selectedTitle).trim(), [titleText, selectedTitle]);
  const canSave = (effectiveTitle.length > 0) && ((selectedDeviceId !== undefined) || (deviceNameText.trim().length > 0));

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
  const deviceOptions = useMemo(() => (devices || []).map(d => ({ id: d.id, name: d.name })).filter(d => !!d.name), [devices]);

  // Seed from initial props (e.g., when a repair is selected on the left)
  useEffect(() => {
    if (initialDeviceName) {
      setDeviceNameText(initialDeviceName);
      const found = (devices || []).find(d => d.name === initialDeviceName);
      setSelectedDeviceId(typeof found?.id === 'number' ? found!.id : undefined);
      if (found?.title) {
        setTitleText(found.title);
        setSelectedTitle(found.title);
      } else if (initialTitle) {
        setTitleText(initialTitle);
        setSelectedTitle(initialTitle);
      }
    } else if (initialTitle) {
      setTitleText(initialTitle);
      setSelectedTitle(initialTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTitle, initialDeviceName]);

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

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Add / Update Device (Title as Main)</h2>
      </div>

      <div className="space-y-4">
        {/* Title (Main) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Title (Main)</label>
            <input
              type="text"
              value={titleText}
              onChange={e => setTitleText(e.target.value)}
              placeholder="e.g., Apple, Android, Laptop"
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Or select existing Title</label>
            <select
              value={selectedTitle}
              onChange={e => { setSelectedTitle(e.target.value); setTitleText(e.target.value); }}
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
            >
              <option value="">— Select —</option>
              {effectiveTitles.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Device Name (Sub) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Or enter new Device Name (Sub)</label>
            <input
              type="text"
              value={deviceNameText}
              onChange={e => setDeviceNameText(e.target.value)}
              placeholder="e.g., iPhone 15, Galaxy S25, MacBook Air"
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Select existing Device Name (Sub)</label>
            <select
              value={selectedDeviceId === undefined ? '' : String(selectedDeviceId)}
              onChange={e => setSelectedDeviceId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
            >
              <option value="">— None / Create New —</option>
              {deviceOptions.map(d => (
                <option key={String(d.id)} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
            <div className="text-xs text-zinc-400 mt-1">If selected, the device will be reassigned to the Title above.</div>
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
    </div>
  );
}
