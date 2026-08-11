import type { RepairItem } from './types';

export type RepairDeviceRecord = { name?: string; title?: string };

function normalized(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function isUniversalRepairFee(value: unknown): boolean {
  const category = normalized(value).replace(/[^a-z0-9]+/g, ' ');
  return category.includes('diagnostic') || category.includes('additional fee');
}

export function deriveRepairDeviceScope(item: Pick<RepairItem, 'category' | 'model'>, devices: RepairDeviceRecord[]) {
  const byName = new Map<string, string>(
    devices.map(device => [normalized(device.name), String(device.title || '').trim()] as const),
  );
  const titles = new Map<string, string>(
    devices
      .map(device => [normalized(device.title), String(device.title || '').trim()] as const)
      .filter(([key]) => !!key),
  );
  const storedCategory = String(item.category || '').trim();
  const storedModel = String(item.model || '').trim();
  const legacyTitle = byName.get(normalized(storedCategory)) || '';
  const category = titles.get(normalized(storedCategory)) || legacyTitle;
  const device = byName.has(normalized(storedCategory))
    ? storedCategory
    : (byName.has(normalized(storedModel)) ? storedModel : '');
  return { category, device };
}

export function matchesRepairDeviceFilter(
  item: Pick<RepairItem, 'category' | 'model'>,
  devices: RepairDeviceRecord[],
  filter: { deviceCategory?: string; deviceName?: string },
): boolean {
  const wantedDevice = normalized(filter.deviceName);
  const inferredCategory = wantedDevice
    ? devices.find(device => normalized(device.name) === wantedDevice)?.title
    : '';
  const wantedCategory = normalized(filter.deviceCategory || inferredCategory);
  if (!wantedCategory && !wantedDevice) return true;

  const scope = deriveRepairDeviceScope(item, devices);
  if (wantedCategory && normalized(scope.category) !== wantedCategory) return false;
  if (!wantedDevice) return true;

  // Category-wide entries have no exact device and apply to every device in that category.
  if (!scope.device) return !!wantedCategory && normalized(scope.category) === wantedCategory;
  return normalized(scope.device) === wantedDevice;
}

export function matchesRepairDeviceAutofilter(
  item: Pick<RepairItem, 'category' | 'model' | 'repairCategory'>,
  devices: RepairDeviceRecord[],
  filter: { deviceCategory?: string; deviceName?: string },
): boolean {
  return isUniversalRepairFee(item.repairCategory) || matchesRepairDeviceFilter(item, devices, filter);
}
