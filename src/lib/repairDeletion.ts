type DbApi = { dbDelete?: (key: string, id: any) => Promise<any> };
export type RepairDeleteResult = { ok: boolean; error?: string; deletedRepairs?: number; deletedType?: boolean };

export function canDeleteRepairType(_type: { definedId?: any }): boolean {
  return true;
}

export function repairContextMenuZIndex(isModalShell: boolean): number {
  return isModalShell ? 100600 : 50;
}

export async function deleteRepair(api: DbApi | undefined, id: any): Promise<RepairDeleteResult> {
  if (id === null || typeof id === 'undefined' || !api?.dbDelete) return { ok: false, error: 'This repair is missing a saved ID.' };
  try {
    const result = await api.dbDelete('repairCategories', id);
    return result === false ? { ok: false, error: 'The repair could not be removed from storage.' } : { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'The repair could not be removed.' };
  }
}

export async function deleteRepairType(
  api: DbApi | undefined,
  type: { definedId?: any },
  assignedRows: Array<{ id?: any }>,
  mode: 'type-only' | 'type-and-repairs',
): Promise<RepairDeleteResult> {
  if (mode === 'type-only' && type.definedId == null) return { ok: false, error: 'This type is recovered from assigned repairs. Remove its repairs to remove the type.' };
  let deletedRepairs = 0;
  if (mode === 'type-and-repairs') {
    for (const row of assignedRows) {
      const result = await deleteRepair(api, row.id);
      if (!result.ok) return { ...result, deletedRepairs };
      deletedRepairs += 1;
    }
  }
  if (type.definedId != null) {
    try {
      const result = await api?.dbDelete?.('repairTypes', type.definedId);
      if (result === false) return { ok: false, error: 'The saved repair type could not be removed.', deletedRepairs };
    } catch (error: any) {
      return { ok: false, error: error?.message || 'The saved repair type could not be removed.', deletedRepairs };
    }
  }
  return { ok: true, deletedRepairs, deletedType: type.definedId != null };
}
