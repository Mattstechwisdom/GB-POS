export type DeviceCategory = { id: string; name: string };

export type RepairItem = {
  id: string;
  name: string; // Title
  type: 'product' | 'service';
  modelNumber?: string;
  altDescription?: string;
  partCost: number;
  laborCost: number;
  partSource?: string;
  orderSourceUrl?: string;
  deviceCategoryId?: string;
};
