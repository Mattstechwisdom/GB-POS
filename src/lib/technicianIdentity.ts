export type TechnicianResolution = { state: 'resolved'; name: string; technician: any } | { state: 'unassigned' | 'unknown'; name: string };
export type TechnicianIdentityIndex = Map<string, any[]>;

const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();
export const technicianDisplayName = (technician: any) => String(technician?.nickname || [technician?.firstName || technician?.first_name, technician?.lastName || technician?.last_name].filter(Boolean).join(' ') || technician?.email?.split?.('@')?.[0] || '').trim();

export function buildTechnicianIndex(technicians: any[] = []): TechnicianIdentityIndex {
  const index: TechnicianIdentityIndex = new Map();
  for (const technician of technicians) {
    const fullName = [technician?.firstName || technician?.first_name, technician?.lastName || technician?.last_name].filter(Boolean).join(' ');
    const keys = [technician?.id, technician?.legacyId, technician?.legacy_id, technician?.cloudId, technician?.cloud_id, technician?.nickname, fullName, technician?.firstName, technician?.first_name];
    for (const value of keys) {
      const key = normalized(value); if (!key) continue;
      const rows = index.get(key) || []; if (!rows.includes(technician)) rows.push(technician); index.set(key, rows);
    }
  }
  return index;
}

export function resolveTechnician(value: unknown, index: TechnicianIdentityIndex): TechnicianResolution {
  const key = normalized(value);
  if (!key) return { state: 'unassigned', name: 'Unassigned' };
  const matches = index.get(key) || [];
  if (matches.length !== 1) return { state: 'unknown', name: 'Unknown technician' };
  return { state: 'resolved', name: technicianDisplayName(matches[0]) || 'Unknown technician', technician: matches[0] };
}
