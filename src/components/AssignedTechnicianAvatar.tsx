import React, { useEffect, useMemo, useState } from 'react';
import { listTechnicians, technicianDisplayName } from '../lib/admin';
import { TechnicianAvatar } from '../lib/technicianIcons';

export default function AssignedTechnicianAvatar({ assignedTo, size = 34 }: { assignedTo?: unknown; size?: number }) {
  const [technicians, setTechnicians] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = async () => { const rows = await listTechnicians().catch(() => []); if (active) setTechnicians(rows); };
    void refresh();
    const off = (window as any).api?.onTechniciansChanged?.(() => void refresh());
    return () => { active = false; try { off?.(); } catch {} };
  }, []);
  const match = useMemo(() => {
    const value = String(assignedTo || '').trim().toLowerCase();
    return technicians.find((tech) => String(tech.id) === String(assignedTo || '') || technicianDisplayName(tech).toLowerCase() === value);
  }, [assignedTo, technicians]);
  return <TechnicianAvatar iconId={match?.profileIcon} size={size} ariaLabel={match ? technicianDisplayName(match) : 'Unassigned technician'} />;
}
