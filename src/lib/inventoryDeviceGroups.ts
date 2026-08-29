export type DeviceGroupedInventoryItem = {
  id?: string | number;
  itemDescription?: string;
  itemType?: string;
  partCategory?: string;
  deviceModel?: string;
  associatedDevices?: string[];
  parentProductId?: string | number;
};

export type InventoryDeviceGroup<T> = {
  device: string;
  categories: Array<{ category: string; items: T[] }>;
};

export function buildInventoryDeviceGroups<T extends DeviceGroupedInventoryItem>(items: T[]): InventoryDeviceGroup<T>[] {
  const devices = new Map<string, Map<string, T[]>>();
  const childDevicesByParent = new Map<number, string[]>();
  items.forEach((item) => {
    const parentId = Number(item.parentProductId);
    if (!Number.isFinite(parentId) || parentId <= 0) return;
    const names = [...(Array.isArray(item.associatedDevices) ? item.associatedDevices : []), item.deviceModel]
      .map((value) => String(value || '').trim()).filter(Boolean);
    childDevicesByParent.set(parentId, [...(childDevicesByParent.get(parentId) || []), ...names]);
  });
  items.forEach((item) => {
    const compatible = Array.from(new Set([
      ...(Array.isArray(item.associatedDevices) ? item.associatedDevices : []),
      item.deviceModel,
      ...(item.id != null ? childDevicesByParent.get(Number(item.id)) || [] : []),
    ].map((value) => String(value || '').trim()).filter(Boolean)));
    const deviceNames = compatible.length ? compatible : ['Unassigned'];
    const category = String(item.partCategory || '').trim() || 'Other Parts';
    deviceNames.forEach((device) => {
      if (!devices.has(device)) devices.set(device, new Map());
      const categories = devices.get(device)!;
      if (!categories.has(category)) categories.set(category, []);
      categories.get(category)!.push(item);
    });
  });
  return [...devices.entries()]
    .sort(([left], [right]) => left === 'Unassigned' ? 1 : right === 'Unassigned' ? -1 : left.localeCompare(right, undefined, { numeric: true }))
    .map(([device, categories]) => ({
      device,
      categories: [...categories.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, groupedItems]) => ({ category, items: groupedItems })),
    }));
}
