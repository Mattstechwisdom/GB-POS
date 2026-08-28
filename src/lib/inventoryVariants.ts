export type InventoryVariantAttributes = Record<string, string>;

export interface InventoryVariantLike {
  id?: string | number;
  isParentPart?: boolean;
  parentProductId?: string | number | null;
  variantAttributes?: unknown;
  stockCount?: string | number | null;
}

export function isInventoryParent(item: InventoryVariantLike | null | undefined): boolean {
  return item?.isParentPart === true;
}

export function inventoryParentId(item: InventoryVariantLike | null | undefined): number | undefined {
  const value = Number(item?.parentProductId);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function inventoryVariantAttributes(item: InventoryVariantLike | null | undefined): InventoryVariantAttributes {
  const attributes = item?.variantAttributes;
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return {};
  return Object.fromEntries(
    Object.entries(attributes)
      .map(([key, value]) => [String(key).trim(), String(value ?? '').trim()])
      .filter(([key, value]) => Boolean(key && value)),
  );
}

export function inventoryVariantsForParent<T extends InventoryVariantLike>(items: T[], parentId: string | number): T[] {
  const normalizedParentId = Number(parentId);
  if (!Number.isFinite(normalizedParentId) || normalizedParentId <= 0) return [];
  return items
    .filter((item) => !isInventoryParent(item) && inventoryParentId(item) === normalizedParentId)
    .sort((left, right) => Number(left.id || 0) - Number(right.id || 0));
}

export function inventoryAggregateStock(items: InventoryVariantLike[], parentId: string | number): number {
  return inventoryVariantsForParent(items, parentId).reduce((total, item) => {
    const stock = Number(item.stockCount);
    return total + (Number.isFinite(stock) ? Math.max(0, stock) : 0);
  }, 0);
}

export function eligibleInventoryVariants<T extends InventoryVariantLike>(
  items: T[],
  parentId: string | number,
  context: InventoryVariantAttributes = {},
): T[] {
  const required = Object.entries(context)
    .map(([key, value]) => [key.trim().toLocaleLowerCase(), String(value ?? '').trim().toLocaleLowerCase()] as const)
    .filter(([key, value]) => Boolean(key && value));
  return inventoryVariantsForParent(items, parentId).filter((item) => {
    const attributes = Object.fromEntries(
      Object.entries(inventoryVariantAttributes(item)).map(([key, value]) => [key.toLocaleLowerCase(), value.toLocaleLowerCase()]),
    );
    return required.every(([key, value]) => attributes[key] === value);
  });
}
