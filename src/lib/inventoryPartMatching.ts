export type InventoryPartMatchContext = {
  deviceCategory?: unknown;
  deviceName?: unknown;
  deviceModel?: unknown;
};

function normalized(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizedValues(values: unknown[]): string[] {
  return Array.from(new Set(values.map(normalized).filter(Boolean)));
}

function repairTypeMatches(part: any, repair: any): boolean {
  const partType = normalized(part?.repairType);
  if (!partType) return false;
  return normalizedValues([repair?.repairCategory, repair?.repairType, repair?.title, repair?.repair]).includes(partType);
}

/**
 * Resolves a repair to a saved inventory part without fuzzy title guessing.
 * Device-specific matches win over category-wide matches, while an explicit
 * repair-to-inventory link always remains authoritative at the call site.
 */
export function findInventoryPartForRepair(products: any[], repair: any, context: InventoryPartMatchContext = {}): any | null {
  const category = normalized(context.deviceCategory || repair?.category || repair?.deviceCategoryName || repair?.device);
  const devices = normalizedValues([
    context.deviceName,
    context.deviceModel,
    repair?.model,
    repair?.modelNumber,
  ]);

  const candidates = (Array.isArray(products) ? products : [])
    .filter((part) => String(part?.itemType || 'Product') === 'Part')
    .filter((part) => repairTypeMatches(part, repair))
    .filter((part) => {
      const partCategory = normalized(part?.category);
      return !category || !partCategory || partCategory === category;
    })
    .map((part) => {
      const compatible = normalizedValues([
        ...(Array.isArray(part?.associatedDevices) ? part.associatedDevices : []),
        part?.deviceModel,
      ]);
      const exactDevice = compatible.length > 0 && devices.some((device) => compatible.includes(device));
      const categoryWide = compatible.length === 0;
      return { part, score: exactDevice ? 2 : categoryWide ? 1 : 0 };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const stockDiff = Number(b.part?.stockCount || 0) - Number(a.part?.stockCount || 0);
      if (stockDiff !== 0) return stockDiff;
      return Number(a.part?.id || Number.MAX_SAFE_INTEGER) - Number(b.part?.id || Number.MAX_SAFE_INTEGER);
    });

  return candidates[0]?.part || null;
}
