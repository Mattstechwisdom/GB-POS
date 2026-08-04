export function buildSaleProductPickerPayload(product: Record<string, any>) {
  const itemDescription = String(product?.itemDescription || '').trim();
  if (!product?.id || !itemDescription) return null;
  const stockCount = Number(product.stockCount);
  return {
    inventoryProductId: product.id,
    itemDescription,
    price: Number(product.price || 0),
    quantity: 1,
    condition: product.condition || 'New',
    internalCost: typeof product.internalCost === 'number' ? product.internalCost : undefined,
    category: product.category,
    itemType: product.itemType || 'Product',
    distributor: product.distributor || '',
    distributorSku: product.distributorSku || '',
    productUrl: product.reorderUrlTemplate || '',
    vendorRelationship: product.vendorRelationship,
    vendorSharePct: product.vendorSharePct,
    vendorTaxExempt: !!product.vendorTaxExempt,
    trackStock: !!product.trackStock,
    stockCount: Number.isFinite(stockCount) ? stockCount : undefined,
    inStock: !product.trackStock || (Number.isFinite(stockCount) && stockCount > 0),
  };
}
