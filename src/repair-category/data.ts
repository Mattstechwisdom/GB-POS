import { DeviceCategory, RepairItem } from './types';

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
  const c = { id: String(Date.now()), name };
  categories.push(c);
  return c;
}
