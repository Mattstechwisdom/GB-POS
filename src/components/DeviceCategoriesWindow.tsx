import React, { useEffect, useState } from 'react';
import Button from './Button';

interface DeviceCategory { id?: number; name: string; }

const DeviceCategoriesWindow: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [list, setList] = useState<DeviceCategory[]>([]);
  const [newName, setNewName] = useState('');
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const items = await (window as any).api.getDeviceCategories();
        const arr = items || [];
        setList(arr);
        setSelectedId(arr.length ? arr[0].id : undefined);
      } catch (e) { setList([]); }
    })();
  }, []);

  async function add() {
    if (!newName.trim()) return;
    const item = { name: newName.trim() };
    try {
      const added = await (window as any).api.addDeviceCategory(item);
      if (added) {
          // refresh from DB to get canonical list with IDs
          const items = await (window as any).api.getDeviceCategories();
          const arr = items || [];
          setList(arr);
          setNewName('');
          setSelectedId(arr.length ? arr[arr.length - 1].id : undefined);
        }
    } catch (e) { console.error('Failed to add device category', e); alert('Failed to add category'); }
  }

  async function remove(id?: number) {
    const target = id ?? selectedId;
    if (!target) return;
    try {
      const ok = await (window as any).api.deleteFromCollection('deviceCategories', target);
      if (ok) {
        const items = await (window as any).api.getDeviceCategories();
        const arr = items || [];
        setList(arr);
        setSelectedId(arr.length ? arr[0].id : undefined);
      }
    } catch (e) { console.error('Failed to remove device category', e); alert('Failed to remove category'); }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-6">
      <div className="bg-zinc-900 border border-zinc-700 rounded w-[700px] p-4">
        <h3 className="font-bold mb-3">Device Categories</h3>
        <div className="mb-3">
          {list.length === 0 ? (
            <div className="text-sm text-zinc-400 mb-2">No categories yet.</div>
          ) : (
            <div className="flex items-center gap-2">
              <select className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={selectedId} onChange={e => setSelectedId(Number(e.target.value))}>
                {list.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
              <button className="px-2 py-1 bg-red-700 text-white rounded" onClick={() => remove()}>Remove</button>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add new device category" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Button className="bg-brand text-black" onClick={add}>Add</Button>
        </div>

        <div className="flex justify-end mt-4">
          <Button className="bg-zinc-700" onClick={() => { if (onClose) { onClose(); } else { try { window.close(); } catch (e) { /* ignore */ } } }}>Close</Button>
        </div>
      </div>
    </div>
  );
};

export default DeviceCategoriesWindow;
