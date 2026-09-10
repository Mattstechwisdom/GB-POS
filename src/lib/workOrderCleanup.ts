import { buildLegacyClosePatch, classifyLegacyCleanup, normalizeCleanupSettings } from './workOrderLifecycle';

export function previewWorkOrderCleanup(workOrders: any[] = [], input?: any, now = new Date()) {
  let diagnosticOnly = 0; let universal = 0;
  for (const workOrder of workOrders) {
    const classification = classifyLegacyCleanup(workOrder, input, now);
    if (classification?.reason === 'diagnostic-only') diagnosticOnly += 1;
    if (classification?.reason === 'universal-age') universal += 1;
  }
  return { scanned: workOrders.length, diagnosticOnly, universal, total: diagnosticOnly + universal };
}

export async function reconcileLegacyWorkOrders(api: any, options: { now?: Date; settings?: any; workOrders?: any[] } = {}) {
  const now = options.now || new Date();
  const workOrders = options.workOrders || await api?.dbGet?.('workOrders') || [];
  const settingsRows = options.settings ? [] : await api?.dbGet?.('settings').catch?.(() => []) || [];
  const settings = normalizeCleanupSettings(options.settings || settingsRows?.[0]?.ticketCleanupSettings);
  const result = { scanned: workOrders.length, diagnosticOnly: 0, universal: 0, updated: 0, skipped: 0, errors: [] as any[], updatedRecords: [] as any[] };
  if (!settings.enabled) { result.skipped = workOrders.length; return result; }
  for (const workOrder of workOrders) {
    const classification = classifyLegacyCleanup(workOrder, settings, now);
    if (!classification) { result.skipped += 1; continue; }
    result[classification.reason === 'diagnostic-only' ? 'diagnosticOnly' : 'universal'] += 1;
    try {
      const updatedRecord = { ...workOrder, ...buildLegacyClosePatch(classification, now, settings) };
      const saved = await api.dbUpdate('workOrders', workOrder.id, updatedRecord);
      if (!saved) throw new Error('Work order update returned no saved record.');
      result.updatedRecords.push(saved);
      result.updated += 1;
    }
    catch (error) { result.errors.push({ id: workOrder.id, error: String((error as any)?.message || error) }); }
  }
  return result;
}
