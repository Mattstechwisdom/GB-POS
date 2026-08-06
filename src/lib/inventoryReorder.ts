export type ReorderInventoryItem = {
  id?: number;
  itemDescription?: string;
  itemType?: 'Product' | 'Part' | string;
  internalCost?: number;
  distributor?: string;
  distributorSku?: string;
  reorderQty?: number;
  reorderUrlTemplate?: string;
  trackStock?: boolean;
  stockCount?: number;
  lowStockThreshold?: number;
  vendorTaxExempt?: boolean;
};

export function inventoryReorderQuantity(item: ReorderInventoryItem): number {
  return Math.max(1, Math.round(Number(item.reorderQty) || 1));
}

export function isInventoryLowStock(item: ReorderInventoryItem): boolean {
  if (!item.trackStock) return false;
  const count = Number(item.stockCount);
  if (!Number.isFinite(count)) return false;
  const threshold = Math.max(0, Math.round(Number(item.lowStockThreshold) || 0));
  return count <= threshold;
}

export function inventoryLowStockFingerprint(item: ReorderInventoryItem): string {
  const count = Math.max(0, Math.round(Number(item.stockCount) || 0));
  const threshold = Math.max(0, Math.round(Number(item.lowStockThreshold) || 0));
  return `${count}:${threshold}`;
}

export function fillInventoryReorderUrl(template: string, item: ReorderInventoryItem, quantity = inventoryReorderQuantity(item)): string {
  const sku = String(item.distributorSku || '');
  const qty = String(Math.max(1, Math.round(Number(quantity) || 1)));
  return String(template || '')
    .replace(/\{\{\s*sku\s*\}\}/gi, encodeURIComponent(sku))
    .replace(/\{\{\s*qty\s*\}\}/gi, encodeURIComponent(qty));
}

export function buildInventoryReorderPurchase(item: ReorderInventoryItem, now = new Date().toISOString()) {
  const inventoryId = Number(item.id);
  const title = String(item.itemDescription || '').trim();
  const distributor = String(item.distributor || '').trim();
  const quantity = inventoryReorderQuantity(item);
  const unitCost = Number(item.internalCost);
  if (!Number.isFinite(inventoryId) || inventoryId <= 0) throw new Error('A saved inventory item is required.');
  if (!title) throw new Error('The inventory item needs a title.');
  if (!distributor) throw new Error('The inventory item needs a distributor.');
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('The inventory item needs a valid supplier cost.');
  const roundedUnitCost = Math.round(unitCost * 100) / 100;
  return {
    status: 'pending',
    sourceType: 'inventory',
    inventoryId,
    itemType: item.itemType === 'Product' ? 'Product' : 'Part',
    title,
    distributor,
    orderUrl: fillInventoryReorderUrl(String(item.reorderUrlTemplate || ''), item, quantity),
    quantity,
    unitCost: roundedUnitCost,
    itemCost: Math.round(roundedUnitCost * quantity * 100) / 100,
    taxExempt: item.vendorTaxExempt === true,
    supplierTaxRate: 8,
    createdAt: now,
    updatedAt: now,
  };
}
