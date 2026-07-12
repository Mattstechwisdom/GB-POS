import { Customer } from './types';

export type CustomerDuplicateReason = 'name' | 'phone' | 'phoneAlt' | 'email';

export type CustomerDuplicateMatch = {
  customer: Customer;
  reasons: CustomerDuplicateReason[];
};

function compact(value: any): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeName(value: any): string {
  return compact(value).toLowerCase();
}

function normalizeEmail(value: any): string {
  return compact(value).toLowerCase();
}

function normalizePhone(value: any): string {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
}

export function customerDisplayName(customer: Partial<Customer> | any): string {
  const name = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim();
  return name || customer?.name || customer?.email || `Client #${customer?.id || ''}`.trim();
}

export function findDuplicateCustomers(
  candidate: Partial<Customer> | any,
  customers: Array<Partial<Customer> | any>,
  opts: { excludeId?: number } = {},
): CustomerDuplicateMatch[] {
  const excludeId = Number(opts.excludeId || candidate?.id || 0);
  const firstName = normalizeName(candidate?.firstName);
  const lastName = normalizeName(candidate?.lastName);
  const phone = normalizePhone(candidate?.phone);
  const phoneAlt = normalizePhone(candidate?.phoneAlt);
  const email = normalizeEmail(candidate?.email);
  const canMatchName = !!firstName && !!lastName;

  const matches: CustomerDuplicateMatch[] = [];
  for (const raw of Array.isArray(customers) ? customers : []) {
    const id = Number(raw?.id || 0);
    if (excludeId && id === excludeId) continue;

    const reasons: CustomerDuplicateReason[] = [];
    if (
      canMatchName &&
      normalizeName(raw?.firstName) === firstName &&
      normalizeName(raw?.lastName) === lastName
    ) {
      reasons.push('name');
    }

    // Compare same field to same field only. Main phone does not match alt phone.
    if (phone && normalizePhone(raw?.phone) === phone) reasons.push('phone');
    if (phoneAlt && normalizePhone(raw?.phoneAlt) === phoneAlt) reasons.push('phoneAlt');
    if (email && normalizeEmail(raw?.email) === email) reasons.push('email');

    if (reasons.length) matches.push({ customer: raw as Customer, reasons });
  }

  return matches;
}

export function duplicateReasonsLabel(reasons: CustomerDuplicateReason[]): string {
  const labels = reasons.map((reason) => {
    if (reason === 'name') return 'matching first and last name';
    if (reason === 'phone') return 'matching phone';
    if (reason === 'phoneAlt') return 'matching alt phone';
    return 'matching email';
  });
  return labels.join(', ');
}
