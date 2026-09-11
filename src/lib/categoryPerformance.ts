import { collectReportingPayments, reportingRecordKind } from './reportingAccounting';

export type PerformanceLine = {
  key: string;
  inventoryId?: number;
  title: string;
  category: string;
  unitsSold: number;
  revenue: number;
  knownCost: number;
  grossProfit: number;
  marginPct: number | null;
  missingCostCount: number;
  stockCount: number | null;
  incoming: number;
  lowStock: boolean;
  daysRemaining: number | null;
};

const rounded = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const clean = (value: unknown) => String(value ?? '').trim();
const normalized = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const qty = (item: any) => Math.max(1, Number(item?.qty ?? item?.quantity ?? 1) || 1);
const paymentAmount = (payment: any) => {
  const applied = Number(payment?.applied);
  if (Number.isFinite(applied) && applied > 0) return applied;
  return Math.max(0, (Number(payment?.amount ?? payment?.paid ?? 0) || 0) - (Number(payment?.change ?? payment?.changeDue ?? 0) || 0));
};
const paymentDate = (payment: any) => new Date(payment?.at || payment?.date || payment?.createdAt || payment?.timestamp || 0);

export function normalizeSalesCategory(value: unknown): string {
  const category = normalized(value);
  if (!category) return 'Uncategorized';
  if (/\b(beverage|beverages|drink|drinks|soda|water|energy drink)\b/.test(category)) return 'Beverages';
  if (/accessor|cable|charger|case|screen protector|headphone|earbud/.test(category)) return 'Accessories';
  if (/consult/.test(category)) return 'Consultations';
  if (/repair|service|labor|diagnostic/.test(category)) return 'Repairs';
  if (/phone|tablet|laptop|desktop|console|device|computer|tv|audio|watch|camera|drone/.test(category)) return 'Devices';
  if (category === 'product' || category === 'products' || category === 'retail') return 'Products';
  return clean(value) || 'Uncategorized';
}

function inventoryMatch(item: any, inventory: any[]) {
  const id = Number(item?.inventoryProductId ?? item?.inventoryId ?? item?.productId);
  if (Number.isFinite(id) && id > 0) {
    const exact = inventory.find(row => Number(row?.id) === id);
    if (exact) return exact;
  }
  const title = normalized(item?.description || item?.itemDescription || item?.name || item?.title);
  return title ? inventory.find(row => normalized(row?.itemDescription || row?.title || row?.name) === title) : undefined;
}

export function buildCategoryPerformance(records: any[], inventoryRows: any[], range: { from?: Date | null; to?: Date | null; incomingByInventoryId?: Map<number, number> } = {}) {
  const inventory = (inventoryRows || []).filter(row => (row?.itemType || 'Product') !== 'Part' && row?.isParentPart !== true);
  const lines = new Map<string, PerformanceLine>();
  const business = new Map<string, { line: string; transactions: Set<string>; revenue: number }>();
  const from = range.from && !Number.isNaN(range.from.getTime()) ? range.from : null;
  const to = range.to && !Number.isNaN(range.to.getTime()) ? range.to : null;
  const rangeDays = from && to ? Math.max(1, (to.getTime() - from.getTime()) / 86400000) : 30;

  const addBusiness = (line: string, recordKey: string, revenue: number) => {
    const row = business.get(line) || { line, transactions: new Set<string>(), revenue: 0 };
    row.transactions.add(recordKey);
    row.revenue = rounded(row.revenue + revenue);
    business.set(line, row);
  };

  for (const record of records || []) {
    const recordKind = reportingRecordKind(record);
    const recordKey = `${recordKind}:${record?.id ?? record?.ticketNumber ?? 'unknown'}`;
    const payments = collectReportingPayments(record).filter(payment => {
      const date = paymentDate(payment);
      return !Number.isNaN(date.getTime()) && (!from || date >= from) && (!to || date <= to);
    });
    const collected = rounded(payments.reduce((sum, payment) => sum + paymentAmount(payment), 0));
    if (!(collected > 0)) continue;
    if (recordKind === 'repair') {
      addBusiness('Repairs', recordKey, collected);
      continue;
    }
    const items = Array.isArray(record?.items) && record.items.length ? record.items : [{
      description: record?.itemDescription || 'Sale Item', quantity: record?.quantity || 1,
      price: record?.price || record?.partCosts || 0, internalCost: record?.internalCost, category: record?.category,
    }];
    const consultation = items.every((item: any) => normalizeSalesCategory(item?.category || record?.category || item?.description) === 'Consultations');
    if (consultation) {
      addBusiness('Consultations', recordKey, collected);
      continue;
    }
    const gross = items.reduce((sum: number, item: any) => sum + qty(item) * Math.max(0, Number(item?.price ?? item?.unitPrice) || 0), 0);
    const discount = Math.max(0, Number(record?.discount) || 0);
    const netBeforeTax = Math.max(0, gross - discount);
    const taxRate = Math.max(0, Number(record?.taxRate) || 0) / 100;
    const payable = netBeforeTax * (1 + taxRate);
    const paidRatio = payable > 0 ? Math.min(1, collected / payable) : 0;
    const collectedNet = rounded(netBeforeTax * paidRatio);
    addBusiness('Retail Sales', recordKey, collectedNet);

    for (const item of items) {
      const itemGross = qty(item) * Math.max(0, Number(item?.price ?? item?.unitPrice) || 0);
      if (!(itemGross > 0)) continue;
      const allocatedDiscount = gross > 0 ? discount * (itemGross / gross) : 0;
      const revenue = rounded(Math.max(0, itemGross - allocatedDiscount) * paidRatio);
      const soldUnits = rounded(qty(item) * paidRatio);
      const match = inventoryMatch(item, inventory);
      const inventoryId = Number(match?.id ?? item?.inventoryProductId ?? item?.inventoryId);
      const title = clean(item?.description || item?.itemDescription || item?.name || item?.title || match?.itemDescription) || 'Sale Item';
      const category = normalizeSalesCategory(item?.category || match?.category || record?.category);
      const key = Number.isFinite(inventoryId) && inventoryId > 0 ? `inventory:${inventoryId}` : `${category}:${normalized(title)}`;
      const existing = lines.get(key) || {
        key, inventoryId: Number.isFinite(inventoryId) && inventoryId > 0 ? inventoryId : undefined, title, category,
        unitsSold: 0, revenue: 0, knownCost: 0, grossProfit: 0, marginPct: null, missingCostCount: 0,
        stockCount: Number.isFinite(Number(match?.stockCount)) ? Number(match.stockCount) : null,
        incoming: range.incomingByInventoryId?.get(inventoryId) || 0,
        lowStock: match?.trackStock === true && Number(match?.stockCount) <= Math.max(0, Number(match?.lowStockThreshold) || 0),
        daysRemaining: null,
      };
      const rawUnitCost = item?.internalCost ?? item?.cost ?? match?.internalCost;
      const unitCost = Number(rawUnitCost);
      const hasCost = rawUnitCost !== '' && rawUnitCost !== null && rawUnitCost !== undefined && Number.isFinite(unitCost) && unitCost >= 0;
      const cost = hasCost ? rounded(unitCost * qty(item) * paidRatio) : 0;
      existing.unitsSold = rounded(existing.unitsSold + soldUnits);
      existing.revenue = rounded(existing.revenue + revenue);
      existing.knownCost = rounded(existing.knownCost + cost);
      existing.grossProfit = rounded(existing.revenue - existing.knownCost);
      if (!hasCost) existing.missingCostCount += 1;
      lines.set(key, existing);
    }
  }

  for (const item of inventory) {
    const inventoryId = Number(item?.id);
    const key = Number.isFinite(inventoryId) && inventoryId > 0 ? `inventory:${inventoryId}` : `${normalizeSalesCategory(item?.category)}:${normalized(item?.itemDescription)}`;
    if (lines.has(key)) continue;
    lines.set(key, {
      key, inventoryId: Number.isFinite(inventoryId) && inventoryId > 0 ? inventoryId : undefined,
      title: clean(item?.itemDescription) || 'Inventory Item', category: normalizeSalesCategory(item?.category),
      unitsSold: 0, revenue: 0, knownCost: 0, grossProfit: 0, marginPct: null, missingCostCount: 0,
      stockCount: Number.isFinite(Number(item?.stockCount)) ? Number(item.stockCount) : null,
      incoming: range.incomingByInventoryId?.get(inventoryId) || 0,
      lowStock: item?.trackStock === true && Number(item?.stockCount) <= Math.max(0, Number(item?.lowStockThreshold) || 0),
      daysRemaining: null,
    });
  }

  const resultLines = Array.from(lines.values()).map(line => {
    const dailyVelocity = line.unitsSold / rangeDays;
    return {
      ...line,
      marginPct: line.missingCostCount || !(line.revenue > 0) ? null : rounded((line.grossProfit / line.revenue) * 100),
      daysRemaining: line.stockCount !== null && dailyVelocity > 0 ? rounded(line.stockCount / dailyVelocity) : null,
    };
  }).sort((a, b) => b.revenue - a.revenue || a.title.localeCompare(b.title));

  const categoryMap = new Map<string, any>();
  for (const line of resultLines) {
    const row = categoryMap.get(line.category) || { category: line.category, unitsSold: 0, revenue: 0, knownCost: 0, grossProfit: 0, marginPct: null, missingCostCount: 0, lowStockCount: 0 };
    row.unitsSold = rounded(row.unitsSold + line.unitsSold);
    row.revenue = rounded(row.revenue + line.revenue);
    row.knownCost = rounded(row.knownCost + line.knownCost);
    row.grossProfit = rounded(row.revenue - row.knownCost);
    row.missingCostCount += line.missingCostCount;
    if (line.lowStock) row.lowStockCount += 1;
    row.marginPct = row.missingCostCount || !(row.revenue > 0) ? null : rounded((row.grossProfit / row.revenue) * 100);
    categoryMap.set(line.category, row);
  }
  return {
    lines: resultLines,
    categories: Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue || a.category.localeCompare(b.category)),
    businessLines: Array.from(business.values()).map(row => ({ line: row.line, transactions: row.transactions.size, revenue: row.revenue })),
  };
}
