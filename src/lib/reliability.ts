export function mergeLocalAndCloudRecords<T extends { id?: unknown; updatedAt?: unknown }>(local: T[], cloud: T[]): T[] {
  const merged = new Map<string, T>();
  const order: string[] = [];
  const add = (item: T) => {
    if (item?.id === null || typeof item?.id === 'undefined') return;
    const key = String(item.id);
    const previous = merged.get(key);
    if (!previous) { order.push(key); merged.set(key, item); return; }
    const previousTime = Date.parse(String(previous.updatedAt || '')) || 0;
    const nextTime = Date.parse(String(item.updatedAt || '')) || 0;
    if (nextTime >= previousTime) merged.set(key, item);
  };
  local.forEach(add);
  cloud.forEach(add);
  return order.map((key) => merged.get(key)!).filter(Boolean);
}

export function createSingleFlight<T>(action: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | null = null;
  return () => {
    if (current) return current;
    current = action().finally(() => { current = null; });
    return current;
  };
}

export async function closeMenuBeforeAction(close: () => void, action?: () => void | Promise<void>): Promise<void> {
  close();
  await action?.();
}

export function printPageProtectionCss(): string {
  return '@media print { .page { padding: 0; } } .final-block { break-inside: avoid-page; page-break-inside: avoid; }';
}
