export type ConsultationPartner = {
  id: string;
  group: string;
  businessName: string;
  hourlyRate: number;
  streetAddress: string;
  hasUnitNumber: boolean;
  unitNumber: string;
  city: string;
  state: string;
  zip: string;
  createdAt?: string;
  updatedAt?: string;
};

export function normalizeConsultationPartner(input: Partial<ConsultationPartner>): ConsultationPartner {
  const now = new Date().toISOString();
  return {
    id: String(input.id || crypto.randomUUID()),
    group: String(input.group || '').trim(),
    businessName: String(input.businessName || '').trim(),
    hourlyRate: Math.max(0, Number(input.hourlyRate) || 0),
    streetAddress: String(input.streetAddress || '').trim(),
    hasUnitNumber: !!input.hasUnitNumber,
    unitNumber: input.hasUnitNumber ? String(input.unitNumber || '').trim() : '',
    city: String(input.city || '').trim(),
    state: String(input.state || 'SC').trim().toUpperCase() || 'SC',
    zip: String(input.zip || '').replace(/\D/g, '').slice(0, 5),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

export function consultationPartnerAddress(partner?: Partial<ConsultationPartner> | null): string {
  if (!partner) return '';
  const street = [String(partner.streetAddress || '').trim(), partner.hasUnitNumber && partner.unitNumber ? `Unit ${String(partner.unitNumber).trim()}` : '']
    .filter(Boolean)
    .join(', ');
  const locality = [String(partner.city || '').trim(), String(partner.state || 'SC').trim().toUpperCase()].filter(Boolean).join(', ');
  return [street, [locality, String(partner.zip || '').trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export function consultationPartnerGroups(partners: ConsultationPartner[]): string[] {
  return Array.from(new Set((partners || []).map((partner) => String(partner.group || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
}

export function sortConsultationPartners(partners: ConsultationPartner[]): ConsultationPartner[] {
  return [...(partners || [])].sort((a, b) => {
    const groupA = String(a.group || '').trim();
    const groupB = String(b.group || '').trim();
    if (!groupA && groupB) return 1;
    if (groupA && !groupB) return -1;
    return groupA.localeCompare(groupB) || String(a.businessName || '').localeCompare(String(b.businessName || ''));
  });
}

export function calculatePartnerConsultationCharge(hours: number, hourlyRate: number, customCharge: number | null = null) {
  const billedHours = Math.max(1, Number(hours) || 1);
  const automaticCharge = Math.round(billedHours * Math.max(0, Number(hourlyRate) || 0) * 100) / 100;
  const charge = customCharge == null ? automaticCharge : Math.max(0, Number(customCharge) || 0);
  return { billedHours, automaticCharge, charge };
}
