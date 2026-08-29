export type InventoryRowKind = 'parent' | 'variant';
export type InventoryActionId = 'edit' | 'add-variant' | 'expand' | 'collapse' | 'duplicate' | 'print-label' | 'delete';

export function normalizeInventorySearch(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function findExactDeviceMatch(query: string, deviceNames: string[]): string | null {
  const normalized = normalizeInventorySearch(query);
  if (!normalized) return null;
  return deviceNames.find((name) => normalizeInventorySearch(name) === normalized) || null;
}

export function inventoryRowActions(kind: InventoryRowKind, expanded = false): InventoryActionId[] {
  if (kind === 'parent') return ['edit', 'add-variant', expanded ? 'collapse' : 'expand', 'delete'];
  return ['edit', 'duplicate', 'print-label', 'delete'];
}

export function duplicateInventoryVariant<T extends Record<string, any>>(item: T): Omit<T, 'id'> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copy } = item;
  return { ...copy, distributorSku: '', stockCount: 0 } as Omit<T, 'id'>;
}
