export type PurchaseBudgetRow = {
  key: string;
  distributor: string;
  totalCost: number;
};

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function purchaseBudgetDayKey(accountingDayEnd: Date) {
  const date = new Date(accountingDayEnd.getTime());
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function checkedOutPurchaseSpend(records: any[], start: Date, end: Date) {
  const min = start.getTime();
  const max = end.getTime();
  return roundMoney((Array.isArray(records) ? records : []).reduce((sum, record) => {
    if (String(record?.status || '').toLowerCase() !== 'checked_out') return sum;
    const when = new Date(record?.checkedOutAt || record?.updatedAt || 0).getTime();
    if (!Number.isFinite(when) || when < min || when > max) return sum;
    return sum + Math.max(0, Number(record?.totalCost) || 0);
  }, 0));
}

export function selectedPurchaseCost(options: {
  selectedRows: PurchaseBudgetRow[];
  allRows: PurchaseBudgetRow[];
  taxExemptByDistributor: Record<string, boolean>;
  additionalCostsByDistributor: Record<string, string | number>;
  salesTaxRate: number;
}) {
  const selectedByDistributor = new Map<string, PurchaseBudgetRow[]>();
  options.selectedRows.forEach(row => {
    const list = selectedByDistributor.get(row.distributor) || [];
    list.push(row);
    selectedByDistributor.set(row.distributor, list);
  });

  let total = 0;
  selectedByDistributor.forEach((rows, distributor) => {
    const subtotal = roundMoney(rows.reduce((sum, row) => sum + Math.max(0, Number(row.totalCost) || 0), 0));
    const tax = options.taxExemptByDistributor[distributor]
      ? 0
      : roundMoney(subtotal * Math.max(0, Number(options.salesTaxRate) || 0) / 100);
    const allDistributorRows = options.allRows.filter(row => row.distributor === distributor);
    const includesWholeDistributor = rows.length === allDistributorRows.length
      && allDistributorRows.every(row => rows.some(selected => selected.key === row.key));
    const additional = includesWholeDistributor
      ? Math.max(0, Number(options.additionalCostsByDistributor[distributor]) || 0)
      : 0;
    total += subtotal + tax + additional;
  });
  return roundMoney(total);
}

export function purchaseBudgetSnapshot(budget: number, spent: number, selected: number) {
  const dailyBudget = roundMoney(Math.max(0, Number(budget) || 0));
  const completedSpend = roundMoney(Math.max(0, Number(spent) || 0));
  const selectedSpend = roundMoney(Math.max(0, Number(selected) || 0));
  const remaining = roundMoney(dailyBudget - completedSpend);
  const afterSelection = roundMoney(remaining - selectedSpend);
  const overBy = roundMoney(Math.max(0, -afterSelection));
  return {
    dailyBudget,
    completedSpend,
    selectedSpend,
    remaining,
    available: remaining,
    afterSelection,
    overBy,
    overBudget: selectedSpend > 0 && overBy > 0,
  };
}
