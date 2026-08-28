export const INVENTORY_LABEL_SIZES = [
  { id: '2x1', label: '2 × 1 in', widthIn: 2, heightIn: 1 },
  { id: '2.25x1.25', label: '2.25 × 1.25 in', widthIn: 2.25, heightIn: 1.25 },
  { id: '3x2', label: '3 × 2 in', widthIn: 3, heightIn: 2 },
] as const;

export type InventoryLabelSizeId = typeof INVENTORY_LABEL_SIZES[number]['id'];

export function inventoryItemNumber(item: { id?: number; distributorSku?: string }): string {
  return String(item.distributorSku || item.id || '').trim();
}

export function inventoryLabelUrl(inventoryId: number, origin = window.location.origin, pathname = window.location.pathname): string {
  if (!Number.isFinite(inventoryId) || inventoryId <= 0) throw new Error('A saved inventory item is required.');
  const url = new URL(pathname || '/', origin);
  url.search = '';
  url.hash = '';
  url.searchParams.set('inventoryId', String(inventoryId));
  return url.toString();
}
