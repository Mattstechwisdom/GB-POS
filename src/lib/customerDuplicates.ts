import { Customer } from './types';

export type CustomerDuplicateReason = 'name' | 'phone' | 'phoneAlt' | 'email';

export type CustomerDuplicateMatch = {
  customer: Customer;
  reasons: CustomerDuplicateReason[];
};

function compact(value: any): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeCustomerName(value: any): string {
  return compact(value).toLowerCase();
}

export function normalizeCustomerEmail(value: any): string {
  return compact(value).toLowerCase();
}

export function normalizeCustomerPhone(value: any): string {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
}

export type CustomerSearchValues = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
};

export function customerMatchesSearch(customer: Partial<Customer> | any, filters: CustomerSearchValues): boolean {
  const firstQuery = normalizeCustomerName(filters?.firstName);
  const lastQuery = normalizeCustomerName(filters?.lastName);
  const emailQuery = normalizeCustomerEmail(filters?.email);
  const phoneQuery = String(filters?.phone || '').replace(/\D+/g, '');
  const firstName = normalizeCustomerName(customer?.firstName);
  const lastName = normalizeCustomerName(customer?.lastName);
  const fullName = compact(`${customer?.firstName || ''} ${customer?.lastName || ''}`).toLowerCase();
  const mainPhone = String(customer?.phone || '').replace(/\D+/g, '');
  const altPhone = String(customer?.phoneAlt || '').replace(/\D+/g, '');
  const email = normalizeCustomerEmail(customer?.email);

  return (!firstQuery || firstName.includes(firstQuery) || fullName.includes(firstQuery))
    && (!lastQuery || lastName.includes(lastQuery) || fullName.includes(lastQuery))
    && (!phoneQuery || mainPhone.includes(phoneQuery) || altPhone.includes(phoneQuery))
    && (!emailQuery || email.includes(emailQuery));
}

export function customerMatchesSearchText(customer: Partial<Customer> | any, query: any): boolean {
  const text = compact(query).toLowerCase();
  if (!text) return false;
  const digits = text.replace(/\D+/g, '');
  const fullName = compact(`${customer?.firstName || ''} ${customer?.lastName || ''}`).toLowerCase();
  const email = normalizeCustomerEmail(customer?.email);
  const mainPhone = String(customer?.phone || '').replace(/\D+/g, '');
  const altPhone = String(customer?.phoneAlt || '').replace(/\D+/g, '');
  return fullName.includes(text)
    || email.includes(text)
    || (!!digits && (mainPhone.includes(digits) || altPhone.includes(digits)));
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
  const firstName = normalizeCustomerName(candidate?.firstName);
  const lastName = normalizeCustomerName(candidate?.lastName);
  const phone = normalizeCustomerPhone(candidate?.phone);
  const phoneAlt = normalizeCustomerPhone(candidate?.phoneAlt);
  const email = normalizeCustomerEmail(candidate?.email);
  const canMatchName = !!firstName && !!lastName;

  const matches: CustomerDuplicateMatch[] = [];
  for (const raw of Array.isArray(customers) ? customers : []) {
    const id = Number(raw?.id || 0);
    if (excludeId && id === excludeId) continue;

    const reasons: CustomerDuplicateReason[] = [];
    if (
      canMatchName &&
      normalizeCustomerName(raw?.firstName) === firstName &&
      normalizeCustomerName(raw?.lastName) === lastName
    ) {
      reasons.push('name');
    }

    // Compare same field to same field only. Main phone does not match alt phone.
    if (phone && normalizeCustomerPhone(raw?.phone) === phone) reasons.push('phone');
    if (phoneAlt && normalizeCustomerPhone(raw?.phoneAlt) === phoneAlt) reasons.push('phoneAlt');
    if (email && normalizeCustomerEmail(raw?.email) === email) reasons.push('email');

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
