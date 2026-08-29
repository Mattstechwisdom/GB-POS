export interface CommissionSettings {
  salesCommissionPercent: number;
  consultationTechHourlyRate: number;
  salesCommissionTechnicianIds: string[];
  consultationCommissionTechnicianIds: string[];
}

export const DEFAULT_COMMISSION_SETTINGS: CommissionSettings = {
  salesCommissionPercent: 5,
  consultationTechHourlyRate: 25,
  salesCommissionTechnicianIds: [],
  consultationCommissionTechnicianIds: [],
};

function finiteBetween(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function normalizeCommissionSettings(value: any): CommissionSettings {
  return {
    salesCommissionPercent: finiteBetween(value?.salesCommissionPercent, 5, 0, 100),
    consultationTechHourlyRate: finiteBetween(value?.consultationTechHourlyRate, 25, 0, 1000),
    salesCommissionTechnicianIds: Array.from(new Set(
      (Array.isArray(value?.salesCommissionTechnicianIds) ? value.salesCommissionTechnicianIds : [])
        .map((id: unknown) => String(id || '').trim())
        .filter(Boolean),
    )),
    consultationCommissionTechnicianIds: Array.from(new Set(
      (Array.isArray(value?.consultationCommissionTechnicianIds) ? value.consultationCommissionTechnicianIds : [])
        .map((id: unknown) => String(id || '').trim())
        .filter(Boolean),
    )),
  };
}

export function technicianCommissionId(technician: any) {
  return String(technician?.id || technician?.legacyId || technician?.nickname || technician?.firstName || '').trim();
}

export function selectedSalesCommissionTechnicians(technicians: any[], settings: CommissionSettings) {
  const active = (Array.isArray(technicians) ? technicians : []).filter(tech => tech && tech.active !== false);
  const selected = new Set(settings.salesCommissionTechnicianIds.map(String));
  if (!selected.size) return active;
  return active.filter(tech => selected.has(technicianCommissionId(tech)));
}

export function technicianReceivesConsultationCommission(technician: any, settings: CommissionSettings) {
  const selected = new Set(settings.consultationCommissionTechnicianIds.map(String));
  return !selected.size || selected.has(technicianCommissionId(technician));
}

export function salesCommissionPool(salesTotal: number, settings: CommissionSettings) {
  return Math.round(Math.max(0, Number(salesTotal) || 0) * (settings.salesCommissionPercent / 100) * 100) / 100;
}

export function splitCommissionPool(pool: number, technicianCount: number) {
  if (!(technicianCount > 0)) return 0;
  return Math.round((Math.max(0, Number(pool) || 0) / technicianCount) * 100) / 100;
}

export function allocateCommissionPool(pool: number, technicianCount: number) {
  if (!(technicianCount > 0)) return [];
  const totalCents = Math.round(Math.max(0, Number(pool) || 0) * 100);
  const baseCents = Math.floor(totalCents / technicianCount);
  const remainder = totalCents - (baseCents * technicianCount);
  return Array.from({ length: technicianCount }, (_, index) => (baseCents + (index < remainder ? 1 : 0)) / 100);
}

export function allocateMonthlySalesCommission(
  salesBase: number,
  settings: CommissionSettings,
  technicianCount = settings.salesCommissionTechnicianIds.length,
) {
  const pool = salesCommissionPool(salesBase, settings);
  return { pool, shares: allocateCommissionPool(pool, technicianCount) };
}

export function consultationCommission(hours: number, settings: CommissionSettings) {
  return Math.round(Math.max(0, Number(hours) || 0) * settings.consultationTechHourlyRate * 100) / 100;
}
