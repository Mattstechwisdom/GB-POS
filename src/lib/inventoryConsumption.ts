type InventoryApi = {
  dbGet?: (key: string) => Promise<any[]>;
  update?: (key: string, value: any) => Promise<any>;
  dbUpdate?: (key: string, id: number, value: any) => Promise<any>;
};

type ConsumeOptions = {
  allowShortfall?: boolean;
};

type ConsumptionResult = {
  applied: number;
  skipped: number;
  shortfalls: Array<{ productId: number; title: string; requested: number; available: number }>;
};

let reconciliationPromise: Promise<ConsumptionResult> | null = null;

function units(item: any) {
  const value = Number(item?.qty ?? item?.quantity ?? 1);
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 1;
}

function itemConsumptionKey(sourceType: 'sale' | 'workOrder', sourceId: number, item: any, index: number) {
  const lineId = String(item?.id || '').trim() || `line-${index}`;
  return `${sourceType}:${sourceId}:${lineId}`;
}

function paidAmount(record: any) {
  const direct = Number(record?.amountPaid || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const payments = Array.isArray(record?.payments) ? record.payments : [];
  return payments.reduce((sum: number, payment: any) => {
    const applied = Number(payment?.applied ?? payment?.amount ?? 0);
    return sum + (Number.isFinite(applied) && applied > 0 ? applied : 0);
  }, 0);
}

export function saleHasCheckoutPayment(sale: any) {
  return paidAmount(sale) > 0;
}

async function saveProduct(api: InventoryApi, product: any) {
  if (api.update) return api.update('products', product);
  return api.dbUpdate?.('products', Number(product.id), product);
}

async function consumeWithProducts(
  api: InventoryApi,
  products: any[],
  sourceType: 'sale' | 'workOrder',
  sourceId: number,
  items: any[],
  options: ConsumeOptions = {},
): Promise<ConsumptionResult> {
  const result: ConsumptionResult = { applied: 0, skipped: 0, shortfalls: [] };
  const dirtyProducts = new Map<number, any>();

  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    const inventoryId = Number(item?.inventoryProductId || 0);
    if (!(inventoryId > 0) || item?.requiresOrder === true) continue;
    const productIndex = products.findIndex((row: any) => Number(row?.id) === inventoryId);
    const product = productIndex >= 0 ? products[productIndex] : null;
    if (!product || product.trackStock !== true) {
      result.skipped += 1;
      continue;
    }

    const key = itemConsumptionKey(sourceType, sourceId, item, index);
    const consumedKeys = Array.isArray(product.inventoryConsumptionKeys)
      ? product.inventoryConsumptionKeys.map(String).filter(Boolean)
      : [];
    if (consumedKeys.includes(key)) {
      result.skipped += 1;
      continue;
    }

    const quantity = units(item);
    const stockCount = Math.max(0, Math.round(Number(product.stockCount || 0)));
    if (stockCount < quantity && !options.allowShortfall) {
      throw new Error(`${product.itemDescription || 'Inventory item'} has ${stockCount} in stock but checkout requires ${quantity}.`);
    }
    if (stockCount < quantity) {
      result.shortfalls.push({
        productId: inventoryId,
        title: String(product.itemDescription || 'Inventory item'),
        requested: quantity,
        available: stockCount,
      });
    }

    const updated = {
      ...product,
      stockCount: Math.max(0, stockCount - quantity),
      // Durable markers prevent a second device or a later reconciliation
      // from subtracting the same paid sale line again.
      inventoryConsumptionKeys: [...consumedKeys, key],
      updatedAt: new Date().toISOString(),
    };
    products[productIndex] = updated;
    dirtyProducts.set(inventoryId, updated);
    result.applied += 1;
  }

  for (const product of dirtyProducts.values()) {
    const saved = await saveProduct(api, product);
    if (!saved) throw new Error(`${product.itemDescription || 'Inventory item'} stock update returned no record.`);
    const index = products.findIndex((row: any) => Number(row?.id) === Number(product.id));
    if (index >= 0) products[index] = saved;
  }

  return result;
}

export async function consumeInStockInventory(
  api: InventoryApi,
  sourceType: 'sale' | 'workOrder',
  sourceId: number,
  items: any[],
  options: ConsumeOptions = {},
) {
  if (!api?.dbGet || !sourceId) return { applied: 0, skipped: 0, shortfalls: [] };
  const products: any[] = await api.dbGet('products').catch(() => []);
  if (!Array.isArray(products)) throw new Error('Inventory could not be loaded for checkout.');
  return consumeWithProducts(api, products, sourceType, sourceId, items, options);
}

export async function reconcilePaidSaleInventory(api: InventoryApi): Promise<ConsumptionResult> {
  if (!api?.dbGet) return { applied: 0, skipped: 0, shortfalls: [] };
  if (reconciliationPromise) return reconciliationPromise;

  reconciliationPromise = (async () => {
    const [sales, products] = await Promise.all([
      api.dbGet!('sales').catch(() => []),
      api.dbGet!('products').catch(() => []),
    ]);
    if (!Array.isArray(sales) || !Array.isArray(products)) {
      throw new Error('Sales or inventory could not be loaded for reconciliation.');
    }

    const total: ConsumptionResult = { applied: 0, skipped: 0, shortfalls: [] };
    const orderedSales = sales
      .filter((sale: any) => Number(sale?.id || 0) > 0 && saleHasCheckoutPayment(sale))
      .sort((a: any, b: any) => Number(a?.id || 0) - Number(b?.id || 0));

    for (const sale of orderedSales) {
      const result = await consumeWithProducts(
        api,
        products,
        'sale',
        Number(sale.id),
        Array.isArray(sale.items) ? sale.items : [],
        { allowShortfall: true },
      );
      total.applied += result.applied;
      total.skipped += result.skipped;
      total.shortfalls.push(...result.shortfalls);
    }
    return total;
  })().finally(() => {
    reconciliationPromise = null;
  });

  return reconciliationPromise;
}
