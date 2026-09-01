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

export function discountedWorkOrderItemAmounts(input: { parts: number; labor: number; quantity?: number } & LineDiscount) {
  const quantity = Number.isFinite(Number(input.quantity)) && Number(input.quantity) > 0 ? Number(input.quantity) : 1;
  const partsGross = roundCurrency(Math.max(0, Number(input.parts) || 0) * quantity);
  const laborGross = roundCurrency(Math.max(0, Number(input.labor) || 0));
  const gross = roundCurrency(partsGross + laborGross);
  const discount = lineDiscountAmount({ units: 1, unitPrice: gross, discountType: input.discountType, discountValue: input.discountValue });
  const parts = gross > 0 ? roundCurrency(partsGross - discount * (partsGross / gross)) : 0;
  const labor = roundCurrency(Math.max(0, gross - discount - parts));
  return { parts, labor, discount, gross, net: roundCurrency(parts + labor) };
}

type TicketLaborItem = {
  labor?: number;
  repair?: string;
  repairCategory?: string;
};

function isAdditiveLaborFee(item: TicketLaborItem): boolean {
  const description = `${item?.repairCategory || ''} ${item?.repair || ''}`.trim();
  if (/diagnostic/i.test(description)) return false;
  return /\b(fees?|surcharges?|expedit(?:e|ed|ing)?|rush)\b/i.test(description);
}

export function ticketLaborCharge(items: TicketLaborItem[], diagnostic?: Pick<DiagnosticSelection, 'amount'> | null): number {
  const laborItems = Array.isArray(items) ? items : [];
  const additiveFees = roundCurrency(laborItems.reduce((sum, item) => (
    sum + (isAdditiveLaborFee(item) ? Math.max(0, Number(item?.labor) || 0) : 0)
  ), 0));
  const repairLabor = roundCurrency(laborItems.reduce((sum, item) => (
    sum + (isAdditiveLaborFee(item) ? 0 : Math.max(0, Number(item?.labor) || 0))
  ), 0));
  const diagnosticMinimum = Math.max(0, Number(diagnostic?.amount) || 0);
  return roundCurrency(Math.max(repairLabor, diagnosticMinimum) + additiveFees);
}
