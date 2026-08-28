export function normalizeServiceKey(value: unknown): string {
  return String(value || '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function serviceDisplayLabel(assignment: any): string {
  const device = String(assignment?.model || assignment?.deviceName || assignment?.category || '').trim();
  const service = String(assignment?.title || assignment?.serviceName || assignment?.repairCategory || '').trim();
  return [device, service].filter(Boolean).join(' — ');
}

export function filterServiceAssignments<T extends Record<string, any>>(
  assignments: T[],
  context: { deviceCategory?: string; deviceName?: string; model?: string },
): T[] {
  const category = String(context.deviceCategory || '').trim().toLocaleLowerCase();
  const device = String(context.deviceName || context.model || '').trim().toLocaleLowerCase();
  return assignments.filter((assignment) => {
    const assignmentCategory = String(assignment.category || assignment.deviceCategory || '').trim().toLocaleLowerCase();
    const assignmentDevice = String(assignment.model || assignment.deviceName || '').trim().toLocaleLowerCase();
    return (!category || !assignmentCategory || assignmentCategory === category)
      && (!device || !assignmentDevice || assignmentDevice === device);
  });
}
