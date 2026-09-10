export type CheckoutCompletionInput = {
  amountDue: number;
  amountPaid: number;
  paymentType: string;
  markClosed?: boolean;
  cashApplied?: number;
  cardRemainder?: number;
};

export function checkoutCompletionState(input: CheckoutCompletionInput): { allowed: boolean; reason: string } {
  const due = Number(input.amountDue || 0);
  const paid = Number(input.amountPaid || 0);
  const paymentType = String(input.paymentType || '').trim();
  if (!(due > 0.0001)) {
    return input.markClosed
      ? { allowed: true, reason: '' }
      : { allowed: false, reason: 'No balance remains. Select Mark closed to finish this ticket without another payment.' };
  }
  if (!paymentType) return { allowed: false, reason: 'Select a payment method to complete checkout.' };
  if (!(paid > 0.0001)) return { allowed: false, reason: 'Enter an amount to apply to this checkout.' };
  if (paid > due + 0.0001) return { allowed: false, reason: 'The applied payment cannot exceed the selected balance.' };
  if (paymentType === 'Cash + Card') {
    if (!(Number(input.cashApplied || 0) > 0.0001)) return { allowed: false, reason: 'Enter the cash amount for the split payment.' };
    if (!(Number(input.cardRemainder || 0) > 0.0001)) return { allowed: false, reason: 'Split payment requires both a cash amount and a card remainder.' };
  }
  return { allowed: true, reason: '' };
}
