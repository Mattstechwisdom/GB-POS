import React, { useEffect, useState } from 'react';
import { DeviceCategory, RepairItem } from '../lib/repairModels';
import { RepairsRepo } from '../lib/repairsRepo';

export default function RepairCategoriesWindow({ onClose }: { onClose?: () => void }) {
  const [categories, setCategories] = useState<DeviceCategory[]>([]);
  const [newName, setNewName] = useState('');
  const [repairs, setRepairs] = useState<RepairItem[]>([]);

  useEffect(() => {
    (async () => {
      setCategories(await RepairsRepo.listDeviceCategories());
      setRepairs(await RepairsRepo.listRepairs());
    })();
  }, []);

  const addCategory = async () => {
    if (!newName.trim()) return;
    await RepairsRepo.addDeviceCategory(newName.trim());
    setNewName('');
    setCategories(await RepairsRepo.listDeviceCategories());
  };

  const deleteCategory = async (id: string) => {
    await RepairsRepo.deleteDeviceCategory(id);
    setCategories(await RepairsRepo.listDeviceCategories());
    setRepairs(await RepairsRepo.listRepairs());
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Repair Catalog</h2>
        <div>
          <button className="btn" onClick={() => onClose?.() || window.close()}>Close</button>
        </div>
      </div>

      <section className="mb-6">
        <h3 className="font-medium">Device Categories</h3>
        <div className="flex gap-2 mt-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input" placeholder="Add category" />
          <button className="btn" onClick={addCategory}>Add</button>
        </div>
        <ul className="mt-3">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-1">
              <span>{c.name}</span>
              <button className="btn btn-sm" onClick={() => deleteCategory(c.id)}>Delete</button>
            </li>
          ))}
          {categories.length === 0 && <li className="text-sm text-muted mt-2">No categories yet.</li>}
        </ul>
      </section>

      <section>
        <h3 className="font-medium">Repairs</h3>
        <ul className="mt-2">
          {repairs.map((r) => (
            <li key={r.id} className="py-1">
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-sm text-muted">Category: {r.deviceCategory?.name ?? '—'}</div>
                </div>
                <div className="text-right">
                  <div>Part: ${r.partCost.toFixed(2)}</div>
                  <div>Labor: ${r.laborCost.toFixed(2)}</div>
                </div>
              </div>
            </li>
          ))}
          {repairs.length === 0 && <li className="text-sm text-muted mt-2">No repair items yet.</li>}
        </ul>
      </section>
    </div>
  );
}
