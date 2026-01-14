import { RepairItem, DeviceCategory } from './repairModels';

let deviceCategories: DeviceCategory[] = [
  { id: '1', name: 'Phones' },
  { id: '2', name: 'Computers' },
  { id: '3', name: 'Tablets' },
];

let repairItems: RepairItem[] = [
  {
    id: 'r1',
    name: 'Screen Replacement',
    type: 'service',
    partCost: 25,
    laborCost: 50,
    deviceCategory: deviceCategories[0],
  },
];

export const RepairsRepo = {
  listDeviceCategories: async (): Promise<DeviceCategory[]> => {
    return [...deviceCategories];
  },
  addDeviceCategory: async (name: string): Promise<DeviceCategory> => {
    const entry: DeviceCategory = { id: String(Date.now()), name };
    deviceCategories.push(entry);
    return entry;
  },
  deleteDeviceCategory: async (id: string): Promise<void> => {
    deviceCategories = deviceCategories.filter((c) => c.id !== id);
    // also clear category association
    repairItems = repairItems.map((r) => ({ ...r, deviceCategory: r.deviceCategory?.id === id ? null : r.deviceCategory }));
  },
  listRepairs: async (): Promise<RepairItem[]> => {
    return [...repairItems];
  },
  addRepair: async (item: Omit<RepairItem, 'id'>): Promise<RepairItem> => {
    const newItem: RepairItem = { ...item, id: String(Date.now()) };
    repairItems.push(newItem);
    return newItem;
  },
};
