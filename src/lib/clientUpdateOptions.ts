export type ClientUpdateDetail = 'date' | 'notes' | 'dateNotes' | 'dateTimeNotes' | 'approval' | 'promise';
export type ClientUpdateOption = {
  key: string;
  label: string;
  tone: string;
  detail?: ClientUpdateDetail;
};

export const REPAIR_UPDATE_OPTIONS: ClientUpdateOption[] = [
  { key: 'pickup_reminder', label: 'Pickup Reminder', tone: 'cyan' },
  { key: 'manual_update', label: 'Send Update', tone: 'purple', detail: 'notes' },
  { key: 'repair_approval', label: 'Request Repair Approval', tone: 'purple', detail: 'approval' },
  { key: 'customer_promise', label: 'Add / Update Promise', tone: 'cyan', detail: 'promise' },
  { key: 'technician_progress', label: 'Technician Progress', tone: 'blue', detail: 'notes' },
  { key: 'diagnosis', label: 'Diagnosis In Process', tone: 'blue' },
  { key: 'testing_in_progress', label: 'Testing In Progress', tone: 'blue', detail: 'notes' },
  { key: 'waiting_device', label: 'Waiting on Device', tone: 'blue' },
  { key: 'part_ordered', label: 'Part Ordered', tone: 'amber', detail: 'date' },
  { key: 'waiting_part', label: 'Waiting on Part Delivery', tone: 'orange', detail: 'date' },
  { key: 'part_delivered', label: 'Part Delivered', tone: 'green' },
  { key: 'repair_complete', label: 'Repair Complete', tone: 'green', detail: 'notes' },
  { key: 'not_possible', label: 'Repair Not Possible', tone: 'red', detail: 'notes' },
];

export function clientDeliveryForRepairAction(key: string): 'client' | 'internal' {
  return key === 'technician_progress' ? 'internal' : 'client';
}

export function repairActionPatch(key: string, extra: { notes?: string }, now = new Date().toISOString()) {
  const notes = String(extra.notes || '').trim();
  if (key === 'technician_progress') {
    return { techNotes: notes, lastUpdateNote: notes, lastUpdateAt: now };
  }
  if (key === 'testing_in_progress') {
    return { repairStatus: 'Testing In Progress', statusUpdate: 'Testing In Progress', statusUpdatedAt: now, techNotes: notes };
  }
  return {};
}

