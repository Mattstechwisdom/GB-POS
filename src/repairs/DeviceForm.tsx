import React, { useEffect, useMemo, useState } from 'react';
import ContextMenu, { ContextMenuItem } from '@/components/ContextMenu';
import { useContextMenu } from '@/lib/useContextMenu';

interface DeviceFormProps {
  onCancel: () => void;
  onSaved: () => void;
  titles: string[]; // existing main Titles to pick from
  devices?: Array<{ id?: number; name: string; title?: string }>; // existing device names (sub-categories)
  initialTitle?: string;
  initialDeviceName?: string;
}

// Device Categories live in the 'deviceCategories' collection.
export default function DeviceForm({ onCancel, onSaved, titles, devices = [], initialTitle, initialDeviceName }: DeviceFormProps) {
  const [titleText, setTitleText] = useState('');
  const [deviceNameText, setDeviceNameText] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (title: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  };

  // Group devices by title
  const groupedDevices = useMemo(() => {
    const map = new Map<string, Array<{ id?: number; name: string; title?: string }>>();
    for (const d of (devices || [])) {
      const key = (d.title || '').trim() || '(No Category)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [devices]);

  const deviceCtx = useContextMenu<{ id?: number; name: string; title?: string }>();

  const effectiveTitle = useMemo(() => (titleText || '').trim(), [titleText]);
  const canSave = (effectiveTitle.length > 0) && (deviceNameText.trim().length > 0 || selectedDeviceId !== undefined);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const api: any = (window as any).api || {};
      if (selectedDeviceId !== undefined && typeof api.update === 'function') {
        const updated = await api.update('deviceCategories', { id: selectedDeviceId, title: effectiveTitle });
        if (updated) { onSaved(); return; }
      }
      if (selectedDeviceId !== undefined && typeof api.dbUpdate === 'function') {
        const existing = (devices || []).find(d => Number(d.id) === Number(selectedDeviceId));
        const updated = await api.dbUpdate('deviceCategories', selectedDeviceId, { ...(existing || {}), name: (existing?.name || deviceNameText).trim(), title: effectiveTitle });
        if (updated) { onSaved(); return; }
      }
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

  // Seed from initial props
  useEffect(() => {
    if (initialDeviceName) {
      setDeviceNameText(initialDeviceName);
      const found = (devices || []).find(d => d.name === initialDeviceName);
      setSelectedDeviceId(typeof found?.id === 'number' ? found!.id : undefined);
      if (found?.title) setTitleText(found.title);
      else if (initialTitle) setTitleText(initialTitle);
    } else if (initialTitle) {
      setTitleText(initialTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTitle, initialDeviceName]);

  async function deleteDeviceById(deviceId: number) {
    const name = (devices || []).find(d => Number(d.id) === Number(deviceId))?.name || deviceNameText || 'this device';
    const ok = window.confirm(`Delete ${name}? This cannot be undone.`);
    if (!ok) return;
    try {
      const api: any = (window as any).api || {};
      if (typeof api.dbDelete === 'function') {
        const res = await api.dbDelete('deviceCategories', deviceId);
        if (res) { setSelectedDeviceId(undefined); setDeviceNameText(''); onSaved(); return; }
      } else if (typeof api.deleteFromCollection === 'function') {
        const res = await api.deleteFromCollection('deviceCategories', deviceId);
        if (res) { setSelectedDeviceId(undefined); setDeviceNameText(''); onSaved(); return; }
      }
      alert('Failed to delete device');
    } catch (e) {
      console.error('delete device failed', e);
      alert('Failed to delete device');
    }
  }

  async function deleteSelected() {
    if (selectedDeviceId === undefined) return;
    await deleteDeviceById(selectedDeviceId);
  }

  async function deleteCategoryByTitle(titleRaw: string) {
    const title = String(titleRaw || '').trim();
    if (!title) return;
    const ids = (devices || [])
      .filter(d => String((d as any).title || '').trim() === title)
      .map(d => (d as any).id)
      .filter((id: any) => id != null);
    if (ids.length === 0) { alert('No devices found under this category.'); return; }
    const ok = window.confirm(`Delete category "${title}" and all ${ids.length} device(s) under it? This cannot be undone.`);
    if (!ok) return;
    setSaving(true);
    try {
      const api: any = (window as any).api || {};
      if (typeof api.dbDelete === 'function') {
        for (const id of ids) { try { await api.dbDelete('deviceCategories', id); } catch {} }
      }
      setSelectedDeviceId(undefined);
      setDeviceNameText('');
      onSaved();
    } catch (e) {
      console.error('delete category failed', e);
      alert('Failed to delete category');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory() {
    await deleteCategoryByTitle(effectiveTitle);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Device Categories</h2>
        <div className="text-xs text-zinc-400 mt-1">Device types (Laptop, Game Console) and the specific devices within them.</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Category (device type)</label>
          <input
            type="text"
            list="gbpos-device-type-list"
            value={titleText}
            onChange={e => { setTitleText(e.target.value); setSelectedDeviceId(undefined); }}
            placeholder="e.g. Laptop, Game Console, Tablet"
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
          />
          <datalist id="gbpos-device-type-list">
            {effectiveTitles.map(t => <option key={t} value={t} />)}
          </datalist>
          <div className="text-xs text-zinc-400 mt-1">Select existing or type a new category.</div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Device</label>
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
            placeholder={effectiveTitle ? `e.g. a device within ${effectiveTitle}` : 'Type device name…'}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
          />
          <datalist id="gbpos-device-name-list">
            {devicesForTitle.map(n => <option key={n} value={n} />)}
          </datalist>
          <div className="text-xs text-zinc-400 mt-1">Pick an existing device or enter a new one.</div>
        </div>
      </div>

      {/* Device accordion list */}
      <div className="mt-4 border border-zinc-700 rounded overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="bg-zinc-800 px-3 py-2 text-sm font-semibold border-b border-zinc-700 flex items-center justify-between">
          <span>All Devices</span>
          {groupedDevices.length > 0 && (
            <span className="text-xs text-zinc-400 font-normal">{groupedDevices.length} {groupedDevices.length === 1 ? 'category' : 'categories'}</span>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {groupedDevices.length === 0 && (
            <div className="p-4 text-center text-zinc-500 text-sm">No devices yet</div>
          )}
          {groupedDevices.map(([catTitle, catDevices]) => {
            const isOpen = expandedCategories.has(catTitle);
            return (
              <div key={catTitle} className="border-b border-zinc-700 last:border-b-0">
                {/* Category header button */}
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-750 text-left text-sm font-medium text-gray-100 focus:outline-none focus:bg-zinc-700"
                  style={{ background: isOpen ? '#27272a' : undefined }}
                  onClick={() => {
                    toggleCategory(catTitle);
                    // Also load category into title field on click
                    setTitleText(catTitle === '(No Category)' ? '' : catTitle);
                    setDeviceNameText('');
                    setSelectedDeviceId(undefined);
                  }}
                >
                  <span>{catTitle}</span>
                  <span className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>{catDevices.length} device{catDevices.length !== 1 ? 's' : ''}</span>
                    <svg
                      className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
                {/* Devices within category */}
                {isOpen && (
                  <div className="bg-zinc-900">
                    {catDevices.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((d, idx) => (
                      <div
                        key={(d.id ?? idx) + '-' + d.name}
                        className={`flex items-center justify-between px-4 py-1.5 cursor-pointer border-l-2 text-sm ${
                          selectedDeviceId !== undefined && d.id === selectedDeviceId
                            ? 'border-l-[#39FF14] bg-zinc-800/60 text-white'
                            : 'border-l-transparent hover:bg-zinc-800/40 text-zinc-300'
                        }`}
                        onClick={() => {
                          setSelectedDeviceId(typeof d.id === 'number' ? d.id : undefined);
                          setDeviceNameText(d.name || '');
                          setTitleText(d.title || '');
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deviceCtx.openFromEvent(e, d);
                        }}
                        title="Click to load into fields for editing"
                      >
                        <span>{d.name}</span>
                        {selectedDeviceId !== undefined && d.id === selectedDeviceId && (
                          <span className="text-[#39FF14] text-xs">selected</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto pt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={deleteSelected}
            disabled={selectedDeviceId === undefined || saving}
            className="h-9 px-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded text-sm disabled:opacity-50"
            title={selectedDeviceId === undefined ? 'Select a device first' : 'Delete selected device'}
          >
            Delete Device
          </button>
          <button
            onClick={deleteCategory}
            disabled={!effectiveTitle || saving}
            className="h-9 px-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded text-sm disabled:opacity-50"
            title={!effectiveTitle ? 'Type a category name first' : 'Delete this entire category'}
          >
            Delete Category
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            onClick={onCancel}
            className="h-9 px-3 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="h-9 px-3 bg-[#39FF14] hover:bg-[#32E610] text-black font-medium rounded text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : (selectedDeviceId !== undefined ? 'Update Device' : 'Save Device')}
          </button>
        </div>
      </div>

      <ContextMenu
        id="device-form-device-ctx"
        open={deviceCtx.state.open}
        x={deviceCtx.state.x}
        y={deviceCtx.state.y}
        items={((): ContextMenuItem[] => {
          const d = deviceCtx.state.data;
          if (!d) return [];
          const deviceId = typeof d.id === 'number' ? d.id : undefined;
          const title = String(d.title || '').trim();
          const name = String(d.name || '').trim();
          return [
            { type: 'header', label: `${title || 'Category'} — ${name || 'Device'}` },
            {
              label: 'Edit / Load',
              onClick: () => {
                setSelectedDeviceId(deviceId);
                setDeviceNameText(d.name || '');
                setTitleText(d.title || '');
              },
            },
            { type: 'separator' },
            {
              label: 'Delete device…',
              danger: true,
              disabled: deviceId === undefined || saving,
              onClick: async () => {
                if (deviceId === undefined) return;
                await deleteDeviceById(deviceId);
              },
            },
            {
              label: 'Delete category…',
              danger: true,
              disabled: !title || saving,
              onClick: async () => {
                if (!title) return;
                await deleteCategoryByTitle(title);
              },
            },
          ];
        })()}
        onClose={deviceCtx.close}
      />
    </div>
  );
}