import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeviceCategory, RepairItem } from './types';
import { getDeviceCategories, getRepairs, saveRepair } from './data';

export function useRepairCategoriesVM() {
  const [categories, setCategories] = useState<DeviceCategory[]>([]);
  const [repairs, setRepairs] = useState<RepairItem[]>([]);
  const [filterDevice, setFilterDevice] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCategories(await getDeviceCategories());
      setRepairs(await getRepairs());
    })();
  }, []);

  const filtered = useMemo(() => {
    const txt = searchText.trim().toLowerCase();
    return repairs.filter((r) => {
      if (filterDevice && filterDevice !== '') {
        if (r.deviceCategoryId !== filterDevice) return false;
      }
      if (!txt) return true;
      return [r.name, r.altDescription || '', r.modelNumber || ''].some(s => s.toLowerCase().includes(txt));
    });
  }, [repairs, filterDevice, searchText]);

  const selected = useMemo(() => repairs.find(r => r.id === selectedId) || null, [repairs, selectedId]);

  const save = useCallback(async (item: RepairItem) => {
    await saveRepair(item);
    setRepairs(await getRepairs());
  }, []);

  const refresh = useCallback(async () => {
    setCategories(await getDeviceCategories());
    setRepairs(await getRepairs());
  }, []);

  return {
    categories,
    repairs: filtered,
    rawRepairs: repairs,
    filterDevice,
    setFilterDevice,
    searchText,
    setSearchText,
    selectedId,
    setSelectedId,
    selected,
    save,
    refresh,
  };
}
