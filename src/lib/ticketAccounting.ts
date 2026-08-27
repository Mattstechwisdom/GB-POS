export type LineDiscount = {
  discountType?: 'percent' | 'amount';
  discountValue?: number;
};

export type DiagnosticSelection = {
  catalogId: string | number;
  label: string;
  amount: number;
};

export function roundCurrency(value: number): number {
  return Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
}

export function lineDiscountAmount(input: { units: number; unitPrice: number } & LineDiscount): number {
  const gross = Math.max(0, roundCurrency((Number(input.units) || 0) * (Number(input.unitPrice) || 0)));
  const entered = Math.max(0, Number(input.discountValue) || 0);
  if (input.discountType === 'percent') return roundCurrency(gross * Math.min(100, entered) / 100);
  if (input.discountType === 'amount') return roundCurrency(Math.min(gross, entered));
  return 0;
}

export function discountedLineTotal(input: { units: number; unitPrice: number } & LineDiscount): number {
  const gross = Math.max(0, roundCurrency((Number(input.units) || 0) * (Number(input.unitPrice) || 0)));
  return roundCurrency(Math.max(0, gross - lineDiscountAmount(input)));
}

export function ticketLaborCharge(items: Array<{ labor?: number }>, diagnostic?: Pick<DiagnosticSelection, 'amount'> | null): number {
  const labor = roundCurrency((Array.isArray(items) ? items : []).reduce((sum, item) => sum + Math.max(0, Number(item?.labor) || 0), 0));
  return roundCurrency(Math.max(labor, Math.max(0, Number(diagnostic?.amount) || 0)));
}
