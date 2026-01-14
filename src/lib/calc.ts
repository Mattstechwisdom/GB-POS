export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeTotals({
  laborCost, partCosts, discount, taxRate, amountPaid
}: { laborCost: number; partCosts: number; discount: number; taxRate: number; amountPaid: number; }) {
  const lc = laborCost || 0;
  const pc = partCosts || 0;
  const d = discount || 0;
  // Discount now applies ONLY to labor
  const laborAfterDiscount = Math.max(0, lc - d);
  const sub = round2(laborAfterDiscount + pc);
  // Tax still only on parts (unchanged)
  const taxableParts = pc;
  const tax = round2(taxableParts * (taxRate || 0) / 100);
  const total = round2(sub + tax);
  const remaining = Math.max(0, round2(total - (amountPaid || 0)));
  return { subTotal: sub, tax, total, remaining };
}

export default { round2, computeTotals };
