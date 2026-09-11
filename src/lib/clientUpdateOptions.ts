export type ClientUpdateDetail = 'date' | 'notes' | 'dateNotes' | 'dateTimeNotes' | 'approval' | 'promise' | 'pickup' | 'items';
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
  { key: 'approval_received', label: 'Approval Received', tone: 'green', detail: 'notes' },
  { key: 'repair_declined', label: 'Repair Declined', tone: 'red', detail: 'notes' },
  { key: 'customer_promise', label: 'Add / Update Promise', tone: 'cyan', detail: 'promise' },
  { key: 'schedule_pickup', label: 'Schedule Pickup', tone: 'cyan', detail: 'pickup' },
  { key: 'picked_up', label: 'Picked Up / Close Ticket', tone: 'green' },
  { key: 'approve_storage_fee', label: 'Review / Approve Storage Fee', tone: 'red' },
  { key: 'technician_progress', label: 'Technician Progress', tone: 'blue', detail: 'notes' },
  { key: 'diagnosis', label: 'Diagnosis In Process', tone: 'blue' },
  { key: 'testing_in_progress', label: 'Testing In Progress', tone: 'blue', detail: 'notes' },
  { key: 'waiting_device', label: 'Waiting on Device', tone: 'blue' },
  { key: 'part_ordered', label: 'Part Ordered', tone: 'amber', detail: 'date' },
  { key: 'waiting_part', label: 'Waiting on Part Delivery', tone: 'orange', detail: 'date' },
  { key: 'part_delivered', label: 'Part Delivered', tone: 'green' },
  { key: 'items_delivered', label: 'Mark Items Delivered', tone: 'green', detail: 'items' },
  { key: 'repair_complete', label: 'Repair Complete / Ready for Pickup', tone: 'green', detail: 'notes' },
  { key: 'not_possible', label: 'Repair Not Possible', tone: 'red', detail: 'notes' },
];

export function clientDeliveryForRepairAction(key: string): 'client' | 'internal' {
  return key === 'technician_progress' || key === 'picked_up' || key === 'approve_storage_fee' ? 'internal' : 'client';
}

export function groupRepairUpdateOptions(options: ClientUpdateOption[] = REPAIR_UPDATE_OPTIONS) {
  const ticketKeys = new Set(['picked_up', 'approve_storage_fee']);
  return {
    client: options.filter((option) => clientDeliveryForRepairAction(option.key) === 'client'),
    technician: options.filter((option) => option.key === 'technician_progress'),
    ticket: options.filter((option) => ticketKeys.has(option.key)),
  };
}

export function groupClientRepairUpdateOptions(options: ClientUpdateOption[]) {
  const groups = {
    communication: new Set(['pickup_reminder', 'manual_update', 'customer_promise', 'schedule_pickup']),
    approval: new Set(['repair_approval', 'approval_received', 'repair_declined']),
    progress: new Set(['diagnosis', 'testing_in_progress', 'repair_complete', 'not_possible']),
    parts: new Set(['waiting_device', 'part_ordered', 'waiting_part', 'part_delivered', 'items_delivered']),
  };
  return {
    communication: options.filter((option) => groups.communication.has(option.key)),
    approval: options.filter((option) => groups.approval.has(option.key)),
    progress: options.filter((option) => groups.progress.has(option.key)),
    parts: options.filter((option) => groups.parts.has(option.key)),
  };
}

export function deliverableItemIndexes(items: any[]): number[] {
  return (Array.isArray(items) ? items : []).flatMap((item, index) => {
    const status = String(item?.orderStatus || item?.partStatus || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const orderedPhysicalItem = item?.requiresOrder === true
      || item?.inStock === false
      || ['needed', 'ordered', 'received', 'delivered', 'in_transit', 'awaiting_delivery'].includes(status);
    return orderedPhysicalItem ? [index] : [];
  });
}

export function repairActionPatch(key: string, extra: { notes?: string; estimatedDate?: string; estimatedTime?: string }, now = new Date().toISOString()) {
  const notes = String(extra.notes || '').trim();
  if (key === 'customer_promise') {
    return {
      promisedAt: extra.estimatedDate ? new Date(`${extra.estimatedDate}T${extra.estimatedTime || '12:00'}:00`).toISOString() : '',
      promiseNote: notes,
    };
  }
  if (key === 'technician_progress') {
    return { techNotes: notes, lastUpdateNote: notes, lastUpdateAt: now };
  }
  if (key === 'testing_in_progress') {
    return { repairStatus: 'Testing In Progress', statusUpdate: 'Testing In Progress', statusUpdatedAt: now, techNotes: notes };
  }
  if (key === 'approval_received') {
    return { repairStatus: 'Repair In Progress', statusUpdate: 'Repair Approved', statusUpdatedAt: now, techNotes: notes };
  }
  if (key === 'repair_declined') {
    return { repairStatus: 'Repair Declined - Awaiting Pickup', statusUpdate: 'Repair Declined', statusUpdatedAt: now, techNotes: notes };
  }
  if(key==='picked_up') return {repairStatus:'Picked Up',status:'closed',statusUpdate:'Picked Up / Ticket Closed',pickedUpAt:now,clientPickupDate:now,updatedAt:now};
  return {};
}
