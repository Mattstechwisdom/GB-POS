import { DeviceCategory, RepairItem } from './types';

// Stub implementations — replace with real persistence integration as needed.
let categories: DeviceCategory[] = [];
let repairs: RepairItem[] = [];

export async function getDeviceCategories(): Promise<DeviceCategory[]> {
  return [...categories];
}

export async function getRepairs(): Promise<RepairItem[]> {
  return [...repairs];
}

export async function saveRepair(item: RepairItem): Promise<void> {
  const idx = repairs.findIndex(r => r.id === item.id);
  if (idx === -1) repairs.push(item);
  else repairs[idx] = item;
}

export async function addDeviceCategory(name: string): Promise<DeviceCategory> {
  const entry = { id: String(Date.now()), name };
  categories.push(entry);
  return entry;
}
