export interface Technician {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  phone?: string;
  email?: string;
  passcode?: string; // 4-digit code for clock in/out
  role?: string;
  status?: string;
  cloudId?: string;
  legacyId?: string;
  isLoginProfile?: boolean;
  schedule?: {
    mon?: { start?: string; end?: string; off?: boolean };
    tue?: { start?: string; end?: string; off?: boolean };
    wed?: { start?: string; end?: string; off?: boolean };
    thu?: { start?: string; end?: string; off?: boolean };
    fri?: { start?: string; end?: string; off?: boolean };
    sat?: { start?: string; end?: string; off?: boolean };
    sun?: { start?: string; end?: string; off?: boolean };
  };
}

function hasScheduleValue(schedule: any): boolean {
  return !!schedule && typeof schedule === 'object' && Object.keys(schedule).length > 0;
}

export function isAssignableTechnician(t: any): boolean {
  if (!t || t.active === false || t.status === 'disabled') return false;
  const id = String(t.id || '').trim();
  const cloudId = String(t.cloudId || '').trim();
  const profileOnly = !!t.isLoginProfile || (!!id && !!cloudId && id === cloudId && !t.legacyId);
  if (!profileOnly) return true;
  return !!(
    String(t.nickname || '').trim()
    || String(t.passcode || '').trim()
    || String(t.phone || '').trim()
    || hasScheduleValue(t.schedule)
  );
}

export function technicianDisplayName(t: any): string {
  const nick = String(t?.nickname || '').trim();
  if (nick) return nick;
  const first = String(t?.firstName || t?.first_name || '').trim();
  if (first) return first.split(/\s+/)[0] || first;
  const email = String(t?.email || '').trim();
  if (email) return email.split('@')[0] || email;
  const id = String(t?.id || '').trim();
  return id ? `Tech ${id}` : 'Technician';
}

function normalizeTechnician(t: any): Technician {
  const id = String(t?.id || t?.legacyId || t?.legacy_id || '').trim();
  return {
    ...(t || {}),
    id,
    firstName: String(t?.firstName ?? t?.first_name ?? '').trim(),
    lastName: String(t?.lastName ?? t?.last_name ?? '').trim(),
    nickname: String(t?.nickname ?? '').trim(),
    phone: String(t?.phone ?? '').trim(),
    email: String(t?.email ?? '').trim(),
  } as Technician;
}

export async function listTechnicians(): Promise<Technician[]> {
  // use preload generic dbGet to read technicians collection
  const res = await (window as any).api.dbGet('technicians');
  return (Array.isArray(res) ? res : [])
    .map(normalizeTechnician)
    .filter(isAssignableTechnician);
}

export async function addTechnician(t: Partial<Technician>): Promise<Technician> {
  const id = Math.random().toString(36).slice(2,9);
  const tech: Technician = {
    id,
    firstName: t.firstName || '',
    lastName: t.lastName || '',
    nickname: t.nickname || '',
    phone: t.phone || '',
    email: t.email || '',
    passcode: (t.passcode || '').toString().slice(0,4),
  };
  const added = await (window as any).api.dbAdd('technicians', tech);
  return added as Technician;
}

export async function removeTechnician(id: string | number): Promise<boolean> {
  try {
    // Resolve to the exact stored ID value to avoid type mismatches
    const list = await (window as any).api.dbGet('technicians');
    const match = (Array.isArray(list) ? list : []).find((it: any) => {
      if (it?.id === id) return true;
      const a = Number(it?.id);
      const b = Number(id as any);
      return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
    });
    const targetId = match ? match.id : id;
    const ok = await (window as any).api.dbDelete('technicians', targetId);
    return !!ok;
  } catch (_e) {
    return false;
  }
}

export async function updateTechnician(t: Partial<Technician> & { id: string }): Promise<Technician> {
  // Use preload 'dbUpdate' which expects collection, id, and update data
  const patch: any = { ...t };
  if (typeof patch.passcode !== 'undefined') patch.passcode = String(patch.passcode || '').slice(0,4);
  const updated = await (window as any).api.dbUpdate('technicians', t.id, patch);
  return updated as Technician;
}
