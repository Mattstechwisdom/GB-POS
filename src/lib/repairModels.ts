export interface DeviceCategory {
  id: string;
  name: string;
  // Optional sub-category/title (e.g., Apple, Android, Laptop)
  title?: string;
}

export interface RepairItem {
  id: string;
  name: string;
  type: 'product' | 'service' | string;
  modelNumber?: string;
  altDescription?: string;
  partCost: number;
  laborCost: number;
  // Internal cost for reporting only; never shown in work orders
  internalCost?: number;
  partSource?: string;
  orderSourceUrl?: string;
  deviceCategory?: DeviceCategory | null;
}
