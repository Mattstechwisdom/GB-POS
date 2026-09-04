export type DeviceCategory = { id: string; name: string; title?: string };

export type RepairItem = {
  id: string;
  categoryName?: string;
  name: string;
  type: 'product' | 'service';
  modelNumber?: string;
  altDescription?: string;
  partCost?: number;
  laborCost?: number;
  // Internal cost for reporting/analytics only; not shown in work order UI
  internalCost?: number;
  partSource?: string;
  orderSourceUrl?: string;
  tutorialUrl?: string;
  tutorialMediaType?: 'youtube' | 'direct-video' | 'webpage';
  tutorialUpdatedAt?: string;
  orderDate?: string;
  estDeliveryDate?: string;
  deviceCategoryId?: string;
};
