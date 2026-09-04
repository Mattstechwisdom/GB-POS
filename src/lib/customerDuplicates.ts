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

export type NormalizedCustomerPhone = { digits: string; extension: string };

export function normalizeCustomerPhone(value: any): NormalizedCustomerPhone | null {
  const input = compact(value);
  if (!input) return null;
  const extensionMatch = input.match(/(?:ext\.?|x|extension)\s*(\d+)\s*$/i);
  const extension = extensionMatch?.[1] || '';
  let digits = input.slice(0, extensionMatch?.index ?? input.length).replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length < 7) return null;
  return { digits: digits.slice(-10), extension };
}

function phoneDigits(value: any): string {
  return normalizeCustomerPhone(value)?.digits || '';
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
  const phoneQuery = String(filters?.phone || '').replace(/\D+/g, '').slice(-10);
  const firstName = normalizeCustomerName(customer?.firstName);
  const lastName = normalizeCustomerName(customer?.lastName);
  const fullName = compact(`${customer?.firstName || ''} ${customer?.lastName || ''}`).toLowerCase();
  const mainPhone = phoneDigits(customer?.phone);
  const altPhone = phoneDigits(customer?.phoneAlt);
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
  const mainPhone = phoneDigits(customer?.phone);
  const altPhone = phoneDigits(customer?.phoneAlt);
  return fullName.includes(text)
    || email.includes(text)
    || (!!digits && (mainPhone.includes(digits) || altPhone.includes(digits)));
}

export function customerDisplayName(customer: Partial<Customer> | any): string {
  const name = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim();
  return name || customer?.name || customer?.email || `Client #${customer?.id || ''}`.trim();
}

export type CustomerIdentityMatch = {
  strength: 'exact-contact' | 'name-only' | 'conflict' | 'none';
  reasons: CustomerDuplicateReason[];
  autoMergeSafe: boolean;
};

export function classifyCustomerMatch(candidate: any, existing: any): CustomerIdentityMatch {
  const reasons: CustomerDuplicateReason[] = [];
  const firstName = normalizeCustomerName(candidate?.firstName);
  const lastName = normalizeCustomerName(candidate?.lastName);
  if (firstName && lastName && firstName === normalizeCustomerName(existing?.firstName)
    && lastName === normalizeCustomerName(existing?.lastName)) reasons.push('name');

  const candidatePhones = [phoneDigits(candidate?.phone), phoneDigits(candidate?.phoneAlt)].filter(Boolean);
  const existingPhones = [phoneDigits(existing?.phone), phoneDigits(existing?.phoneAlt)].filter(Boolean);
  const phoneMatch = candidatePhones.some((phone) => existingPhones.includes(phone));
  if (phoneMatch) reasons.push('phone');
  const candidateEmail = normalizeCustomerEmail(candidate?.email);
  const existingEmail = normalizeCustomerEmail(existing?.email);
  const emailMatch = !!candidateEmail && candidateEmail === existingEmail;
  if (emailMatch) reasons.push('email');

  const contactMatch = phoneMatch || emailMatch;
  const conflictingEmail = !!candidateEmail && !!existingEmail && candidateEmail !== existingEmail;
  const conflictingPhone = candidatePhones.length > 0 && existingPhones.length > 0 && !phoneMatch;
  if (contactMatch && (conflictingEmail || conflictingPhone)) {
    return { strength: 'conflict', reasons, autoMergeSafe: false };
  }
  if (contactMatch) return { strength: 'exact-contact', reasons, autoMergeSafe: true };
  if (reasons.includes('name')) return { strength: 'name-only', reasons, autoMergeSafe: false };
  return { strength: 'none', reasons: [], autoMergeSafe: false };
}

function customerUuid(customer: any): string {
  return String(customer?.uuid || customer?.cloudId || customer?.customerId || '');
}

export function chooseCanonicalCustomer<T extends Record<string, any>>(customers: T[], referenceCounts: Record<string, number> = {}): T {
  if (!customers.length) throw new Error('At least one customer is required.');
  return [...customers].sort((left, right) => {
    const referenceDelta = (referenceCounts[customerUuid(right)] || 0) - (referenceCounts[customerUuid(left)] || 0);
    if (referenceDelta) return referenceDelta;
    const contactCount = (value: any) => [value?.phone, value?.phoneAlt, value?.email].filter((item) => compact(item)).length;
    const contactDelta = contactCount(right) - contactCount(left);
    if (contactDelta) return contactDelta;
    const createdDelta = Date.parse(left?.createdAt || left?.created_at || '') - Date.parse(right?.createdAt || right?.created_at || '');
    if (Number.isFinite(createdDelta) && createdDelta) return createdDelta;
    return Number(left?.legacyId || left?.legacy_id || left?.id || Number.MAX_SAFE_INTEGER)
      - Number(right?.legacyId || right?.legacy_id || right?.id || Number.MAX_SAFE_INTEGER);
  })[0];
}

export function resolveTransactionCustomerLabel(transaction: any, customer?: any): string {
  const snapshot = compact(transaction?.customerName || transaction?.clientName);
  if (snapshot) return snapshot;
  if (customer) {
    const resolved = customerDisplayName(customer);
    if (resolved && !resolved.startsWith('Client #')) return resolved;
  }
  const id = transaction?.customerId ?? transaction?.customer_id ?? transaction?.clientId;
  return id == null || id === '' ? 'Unassigned client' : `Client #${id}`;
}

export function findDuplicateCustomers(
  candidate: Partial<Customer> | any,
  customers: Array<Partial<Customer> | any>,
  opts: { excludeId?: number } = {},
): CustomerDuplicateMatch[] {
  const excludeId = Number(opts.excludeId || candidate?.id || 0);
  const firstName = normalizeCustomerName(candidate?.firstName);
  const lastName = normalizeCustomerName(candidate?.lastName);
  const phone = phoneDigits(candidate?.phone);
  const phoneAlt = phoneDigits(candidate?.phoneAlt);
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
    if (phone && phoneDigits(raw?.phone) === phone) reasons.push('phone');
    if (phoneAlt && phoneDigits(raw?.phoneAlt) === phoneAlt) reasons.push('phoneAlt');
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
