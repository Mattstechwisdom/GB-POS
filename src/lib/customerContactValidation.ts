export type CustomerContactDecisions = {
  declinedPhone: boolean;
  declinedEmail: boolean;
};

export function isCompleteCustomerPhone(value: unknown) {
  return String(value || '').replace(/\D/g, '').length === 10;
}

export function isCompleteCustomerEmail(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || '').trim());
}

export function newCustomerContactErrors(
  customer: { phone?: unknown; email?: unknown },
  decisions: CustomerContactDecisions,
) {
  const errors: string[] = [];
  if (!decisions.declinedPhone && !isCompleteCustomerPhone(customer.phone)) {
    errors.push('Enter a complete 10-digit phone number or select Declined phone');
  }
  if (!decisions.declinedEmail && !isCompleteCustomerEmail(customer.email)) {
    errors.push('Enter a complete email address or select Declined email');
  }
  return errors;
}
