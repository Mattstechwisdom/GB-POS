import { buildTechnicianIndex, resolveTechnician } from './technicianIdentity';

const value = (input: any) => String(input ?? '').trim();
const keysFor = (record: any) => [record?.id, record?.legacyId, record?.legacy_id, record?.cloudId, record?.cloud_id, record?.uuid]
  .map(value).filter(Boolean);

function recordIndex(records: any[]) {
  const index = new Map<string, any>();
  for (const record of Array.isArray(records) ? records : []) for (const key of keysFor(record)) index.set(key.toLowerCase(), record);
  return index;
}

function readableNumber(record: any) {
  return value(record?.legacyId || record?.legacy_id || record?.id);
}

export function enrichCalendarEventLabels(events: any[], technicians: any[], workOrders: any[], sales: any[]) {
  const technicianIndex = buildTechnicianIndex(technicians || []);
  const workOrderIndex = recordIndex(workOrders);
  const saleIndex = recordIndex(sales);
  return (Array.isArray(events) ? events : []).map(event => {
    const rawTechnician = value(event?.technician);
    let technician = rawTechnician;
    if (rawTechnician && !/^all technicians$/i.test(rawTechnician) && rawTechnician !== '__all_technicians__') {
      const resolved = resolveTechnician(rawTechnician, technicianIndex);
      const identifierLike = rawTechnician.length > 16 || /^[a-z0-9_-]{12,}$/i.test(rawTechnician);
      technician = resolved.state === 'resolved' ? resolved.name : identifierLike ? 'Unknown technician' : rawTechnician;
    }
    const rawWorkOrderId = value(event?.workOrderId);
    const linkedWorkOrder = rawWorkOrderId ? workOrderIndex.get(rawWorkOrderId.toLowerCase()) : null;
    const workOrderNumber = linkedWorkOrder ? readableNumber(linkedWorkOrder) : (/^\d+$/.test(rawWorkOrderId) ? rawWorkOrderId : '');
    const rawSaleId = value(event?.saleId);
    const linkedSale = rawSaleId ? saleIndex.get(rawSaleId.toLowerCase()) : null;
    const saleNumber = linkedSale ? readableNumber(linkedSale) : (/^\d+$/.test(rawSaleId) ? rawSaleId : '');
    return {
      ...event,
      technician,
      workOrderLabel: rawWorkOrderId ? (workOrderNumber ? `WO #${workOrderNumber}` : 'Work order unavailable') : '',
      saleLabel: rawSaleId ? (saleNumber ? `Sale #${saleNumber}` : 'Sale unavailable') : '',
    };
  });
}
