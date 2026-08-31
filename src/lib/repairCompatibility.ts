export type DeviceContext = { deviceCategory?: string; deviceName?: string; deviceModel?: string };
const normalize = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
export function repairMatchesDevice(repair: any, context: DeviceContext): boolean {
  const wanted = [context.deviceName, context.deviceModel].map(normalize).filter(Boolean);
  if (!wanted.length) return false;
  const compatible = [repair?.model, ...(Array.isArray(repair?.compatibleDevices) ? repair.compatibleDevices : [])].map(normalize).filter(Boolean);
  return wanted.some(device => compatible.some(candidate => candidate === device || candidate.includes(device) || device.includes(candidate)));
}
export function sortRepairsForDevice<T extends any>(repairs: T[], context: DeviceContext): T[] {
  return [...repairs].sort((left, right) => Number(repairMatchesDevice(right, context)) - Number(repairMatchesDevice(left, context)));
}
