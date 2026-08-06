type InventoryApi = {
  dbGet?: (key: string) => Promise<any[]>;
  update?: (key: string, value: any) => Promise<any>;
  dbUpdate?: (key: string, id: number, value: any) => Promise<any>;
};

function units(item: any) {
  const value = Number(item?.qty ?? item?.quantity ?? 1);
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 1;
}

export async function consumeInStockInventory(api: InventoryApi, sourceType: 'sale' | 'workOrder', sourceId: number, items: any[]) {
  if (!api?.dbGet || !sourceId) return { applied: 0, skipped: 0 };
  const candidates = (Array.isArray(items) ? items : []).filter((item) => Number(item?.inventoryProductId || 0) > 0 && item?.requiresOrder !== true);
  if (!candidates.length) return { applied: 0, skipped: 0 };
  const products: any[] = await api.dbGet('products').catch(() => []);
  if (!Array.isArray(products)) throw new Error('Inventory could not be loaded for checkout.');

  let applied = 0;
  let skipped = 0;
  for (const item of candidates) {
    const inventoryId = Number(item.inventoryProductId);
    const product = products.find((row: any) => Number(row?.id) === inventoryId);
    if (!product || product.trackStock !== true) { skipped += 1; continue; }
    const key = `${sourceType}:${sourceId}:${String(item?.id || inventoryId)}`;
    const consumedKeys = Array.isArray(product.inventoryConsumptionKeys) ? product.inventoryConsumptionKeys.map(String) : [];
    if (consumedKeys.includes(key)) { skipped += 1; continue; }
    const quantity = units(item);
    const stockCount = Math.max(0, Math.round(Number(product.stockCount || 0)));
    if (stockCount < quantity) throw new Error(`${product.itemDescription || 'Inventory item'} has ${stockCount} in stock but checkout requires ${quantity}.`);
    const updated = {
      ...product,
      stockCount: stockCount - quantity,
      inventoryConsumptionKeys: [...consumedKeys, key].slice(-250),
      updatedAt: new Date().toISOString(),
    };
    const saved = api.update
      ? await api.update('products', updated)
      : await api.dbUpdate?.('products', inventoryId, updated);
    if (!saved) throw new Error(`${product.itemDescription || 'Inventory item'} stock update returned no record.`);
    const index = products.indexOf(product);
    products[index] = saved;
    applied += 1;
  }
  return { applied, skipped };
}
