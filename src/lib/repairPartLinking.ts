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
