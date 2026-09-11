import { normalizeCustomerEmail, normalizeCustomerPhone } from './customerDuplicates';

const clean = (value: any) => String(value || '').trim();

export function buildDropoffCatalog(rows: any[], fallbackCategories: string[] = []) {
  const groups: Record<string, Set<string>> = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const category = clean(row?.title || row?.category || row?.deviceCategory);
    const device = clean(row?.name || row?.deviceName || row?.model);
    if (!category || category.toLowerCase() === 'other') continue;
    groups[category] ||= new Set<string>();
    if (device && device.toLowerCase() !== 'other') groups[category].add(device);
  }
  for (const category of fallbackCategories.map(clean).filter(Boolean)) {
    if (category.toLowerCase() !== 'other') groups[category] ||= new Set<string>();
  }
  const categories = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  const devicesByCategory = Object.fromEntries(categories.map(category => [
    category,
    [...groups[category]].sort((a, b) => a.localeCompare(b)).concat('Other'),
  ]));
  return { categories: categories.concat('Other'), devicesByCategory };
}

export function findDropoffCustomer(customers: any[], candidate: { phone?: string; email?: string }) {
  const phone = normalizeCustomerPhone(candidate.phone)?.digits || '';
  const email = normalizeCustomerEmail(candidate.email);
  return (Array.isArray(customers) ? customers : []).find(customer => {
    const phones = [customer?.phone, customer?.phoneAlt].map(value => normalizeCustomerPhone(value)?.digits || '').filter(Boolean);
    return (!!phone && phones.includes(phone)) || (!!email && normalizeCustomerEmail(customer?.email) === email);
  }) || null;
}

export function buildDropoffWorkOrder(input: any) {
  const now = input.now || new Date().toISOString();
  return {
    customerId: input.customerId,
    customerName: clean(input.customerName),
    customerPhone: clean(input.customerPhone),
    customerEmail: clean(input.customerEmail),
    status: 'open',
    workflowStage: 'Checked in',
    assignedTo: null,
    checkInAt: now,
    activityAt: now,
    updatedAt: now,
    createdAt: now,
    productCategory: clean(input.deviceCategory),
    productDescription: clean(input.deviceName),
    problemInfo: clean(input.problem),
    password: clean(input.password),
    unlockType: clean(input.unlockType),
    intakeSource: 'Client Dropoff',
    clientDropoff: true,
    items: [],
    amountPaid: 0,
    laborCost: 0,
    partCosts: 0,
    discount: 0,
    taxRate: 8,
    totals: { subTotal: 0, tax: 0, total: 0, remaining: 0 },
  };
}
