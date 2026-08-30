export type RepairInventoryPart = {
  id?: number;
  isParentPart?: boolean;
  category?: string;
  deviceModel?: string;
  associatedDevices?: string[];
  price?: number;
  internalCost?: number;
  markupPct?: number | string;
  distributor?: string;
  reorderUrlTemplate?: string;
  vendorTaxExempt?: boolean;
  stockCount?: number;
  trackStock?: boolean;
};

export function applyInventoryPartToRepair(current: any, part: RepairInventoryPart): any {
  if (part.isParentPart) {
    return {
      ...current,
      category: current.category || part.category || '',
      model: current.model || part.deviceModel || part.associatedDevices?.[0] || '',
      inventoryParentId: Number(part.id || 0) || undefined,
      inventoryProductId: undefined,
      internalCost: undefined,
      partSource: '',
      orderSourceUrl: '',
      trackStock: false,
      stockCount: undefined,
    };
  }
  return {
    ...current,
    category: current.category || part.category || '',
    model: current.model || part.deviceModel || part.associatedDevices?.[0] || '',
    partCost: Number(part.price || 0),
    internalCost: typeof part.internalCost === 'number' ? part.internalCost : current.internalCost,
    markupPct: part.markupPct ?? '10',
    partSource: part.distributor || '',
    orderSourceUrl: part.reorderUrlTemplate || '',
    taxExempt: part.vendorTaxExempt === true,
    inventoryParentId: undefined,
    inventoryProductId: Number(part.id || 0) || undefined,
    trackStock: part.trackStock === true,
    stockCount: part.stockCount,
  };
}

export function resolveWorkOrderRepairPricing(repair: any, linkedInventory: any): { parts: number; internalCost?: number; markupPct: number | string } {
  const usesFamilyVariant = Number(repair?.inventoryParentId || 0) > 0;
  return {
    parts: Number(usesFamilyVariant ? linkedInventory?.price ?? repair?.partCost ?? 0 : repair?.partCost ?? linkedInventory?.price ?? 0) || 0,
    internalCost: usesFamilyVariant && typeof linkedInventory?.internalCost === 'number'
      ? linkedInventory.internalCost
      : typeof repair?.internalCost === 'number' ? repair.internalCost : linkedInventory?.internalCost,
    markupPct: usesFamilyVariant ? linkedInventory?.markupPct ?? repair?.markupPct ?? 10 : repair?.markupPct ?? linkedInventory?.markupPct ?? 10,
  };
}
