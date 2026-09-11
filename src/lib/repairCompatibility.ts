export type DeviceContext = { deviceCategory?: string; deviceName?: string; deviceModel?: string };
const normalize = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');

export function repairCatalogIdentity(repair: any): string {
  return [repair?.category, repair?.model, repair?.title].map(normalize).join('|');
}

export function dedupeRepairCatalog<T extends any>(repairs: T[]): T[] {
  const byService = new Map<string, { item: T; index: number; updatedAt: number }>();
  (Array.isArray(repairs) ? repairs : []).forEach((item, index) => {
    const row: any = item;
    const identity = repairCatalogIdentity(item);
    // Untitled/incomplete drafts cannot be identified safely; retain by id.
    const key = identity.endsWith('|') ? `${identity}|${String(row?.id ?? index)}` : identity;
    const updatedAt = Date.parse(String(row?.updatedAt || row?.createdAt || '')) || 0;
    const previous = byService.get(key);
    if (!previous || updatedAt >= previous.updatedAt) byService.set(key, { item, index: previous?.index ?? index, updatedAt });
  });
  return [...byService.values()].sort((left, right) => left.index - right.index).map(entry => entry.item);
}
export function repairMatchesDevice(repair: any, context: DeviceContext): boolean {
  const wanted = [context.deviceName, context.deviceModel].map(normalize).filter(Boolean);
  if (!wanted.length) return false;
  const compatible = [repair?.model, ...(Array.isArray(repair?.compatibleDevices) ? repair.compatibleDevices : [])].map(normalize).filter(Boolean);
  return wanted.some(device => compatible.some(candidate => candidate === device || candidate.includes(device) || device.includes(candidate)));
}
export function sortRepairsForDevice<T extends any>(repairs: T[], context: DeviceContext): T[] {
  return dedupeRepairCatalog(repairs).sort((left, right) => Number(repairMatchesDevice(right, context)) - Number(repairMatchesDevice(left, context)));
}
