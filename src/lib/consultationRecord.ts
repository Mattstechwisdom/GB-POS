export type MainRecordKind = 'workorder' | 'sale' | 'consultation';

function startsWithConsultation(value: unknown) {
  return String(value ?? '').trim().toLowerCase().startsWith('consult');
}

export function isConsultationRecord(record: any) {
  if (!record || typeof record !== 'object') return false;
  if (String(record.consultationType ?? '').trim()) return true;
  if (startsWithConsultation(record.category) || startsWithConsultation(record.type) || startsWithConsultation(record.kind)) return true;
  if (Number(record.consultationHours) > 0) return true;
  return Array.isArray(record.items) && record.items.some((item: any) => (
    startsWithConsultation(item?.category)
    || startsWithConsultation(item?.type)
    || Number(item?.consultationHours) > 0
  ));
}

export function mainRecordKind(storageType: 'workorder' | 'sale', record: any): MainRecordKind {
  if (storageType === 'workorder') return 'workorder';
  return isConsultationRecord(record) ? 'consultation' : 'sale';
}

export function mainRecordTypeLabel(kind: MainRecordKind, compact = false) {
  if (kind === 'workorder') return compact ? 'WO' : 'Work Order';
  if (kind === 'consultation') return compact ? 'CONS' : 'Consultation';
  return 'Sale';
}
