export type RepairWorkflowAudience = 'client' | 'internal';
export type RepairWorkflowStage = 'Checked in' | 'Diagnosing' | 'Approval' | 'Parts' | 'Repair' | 'Testing' | 'Pickup' | 'Completed' | 'Waiting Device';

type Definition = { audience: RepairWorkflowAudience; stage: RepairWorkflowStage | null; sendsClientMessage: boolean; repairStatus?: string };
type ActionInput = { note?: string; estimatedDate?: string; estimatedTime?: string; itemIndexes?: number[]; actor?: string; idempotencyKey?: string };

const DEFINITIONS: Record<string, Definition> = {
  pickup_reminder: { audience: 'client', stage: 'Pickup', sendsClientMessage: true, repairStatus: 'Ready for Pickup' },
  manual_update: { audience: 'client', stage: null, sendsClientMessage: true },
  repair_approval: { audience: 'client', stage: 'Approval', sendsClientMessage: true, repairStatus: 'Awaiting Repair Approval' },
  approval_received: { audience: 'client', stage: 'Repair', sendsClientMessage: true, repairStatus: 'Repair In Progress' },
  repair_declined: { audience: 'client', stage: 'Pickup', sendsClientMessage: true, repairStatus: 'Repair Declined - Awaiting Pickup' },
  customer_promise: { audience: 'client', stage: null, sendsClientMessage: true },
  schedule_pickup: { audience: 'client', stage: 'Pickup', sendsClientMessage: true },
  picked_up: { audience: 'internal', stage: 'Completed', sendsClientMessage: false, repairStatus: 'Picked Up' },
  approve_storage_fee: { audience: 'internal', stage: null, sendsClientMessage: false },
  technician_progress: { audience: 'internal', stage: null, sendsClientMessage: false },
  diagnosis: { audience: 'client', stage: 'Diagnosing', sendsClientMessage: true, repairStatus: 'Diagnosis In Process' },
  testing_in_progress: { audience: 'client', stage: 'Testing', sendsClientMessage: true, repairStatus: 'Testing In Progress' },
  waiting_device: { audience: 'client', stage: 'Waiting Device', sendsClientMessage: true, repairStatus: 'Waiting on Device' },
  part_ordered: { audience: 'client', stage: 'Parts', sendsClientMessage: true, repairStatus: 'Part Ordered' },
  waiting_part: { audience: 'client', stage: 'Parts', sendsClientMessage: true, repairStatus: 'Waiting on Part Delivery' },
  part_delivered: { audience: 'client', stage: 'Repair', sendsClientMessage: true, repairStatus: 'Ready for Repair' },
  items_delivered: { audience: 'client', stage: 'Repair', sendsClientMessage: true, repairStatus: 'Ready for Repair' },
  repair_complete: { audience: 'client', stage: 'Pickup', sendsClientMessage: true, repairStatus: 'Ready for Pickup' },
  not_possible: { audience: 'client', stage: 'Pickup', sendsClientMessage: true, repairStatus: 'Not Repairable - Awaiting Pickup' },
};

export function repairWorkflowDefinition(action: string): Definition {
  const definition = DEFINITIONS[String(action || '')];
  if (!definition) throw new Error(`Unsupported repair workflow action: ${action}`);
  return definition;
}

const atDateTime = (date?: string, time?: string) => date ? new Date(`${date}T${time || '12:00'}:00`).toISOString() : '';

export function applyRepairWorkflowAction(record: any, action: string, input: ActionInput = {}, now = new Date()) {
  const definition = repairWorkflowDefinition(action);
  const at = now.toISOString();
  const patch: Record<string, any> = { statusUpdatedAt: at, updatedAt: at };
  if (definition.stage) patch.workflowStage = definition.stage;
  if (definition.repairStatus) {
    patch.repairStatus = definition.repairStatus;
    patch.statusUpdate = definition.repairStatus;
  }

  if (action === 'diagnosis') Object.assign(patch, { diagnosisStartedAt: at, lastTechnicianActivityAt: at });
  if (action === 'technician_progress') Object.assign(patch, { techNotes: String(input.note || '').trim(), lastUpdateNote: String(input.note || '').trim(), lastUpdateAt: at, lastTechnicianActivityAt: at });
  if (action === 'testing_in_progress') Object.assign(patch, { testingStartedAt: at, lastTechnicianActivityAt: at, techNotes: String(input.note || '').trim() });
  if (action === 'part_ordered' || action === 'waiting_part') patch.partEta = input.estimatedDate || '';
  if (action === 'customer_promise') Object.assign(patch, { promisedAt: atDateTime(input.estimatedDate, input.estimatedTime), promiseNote: String(input.note || '').trim() });
  if (action === 'schedule_pickup') patch.scheduledPickupAt = atDateTime(input.estimatedDate, input.estimatedTime);
  if (action === 'repair_complete' || action === 'not_possible' || action === 'repair_declined') Object.assign(patch, { pickupReadyAt: at, repairCompletionDate: at });
  if (action === 'pickup_reminder') patch.pickupReminderSentAt = at;
  if (action === 'approval_received' || action === 'repair_declined') patch.clientDecisionAt = at;
  if (action === 'picked_up') Object.assign(patch, { status: 'closed', pickedUpAt: at, clientPickupDate: at, pickedUpBy: String(input.actor || 'Technician') });

  if (action === 'items_delivered') {
    const selected = new Set((input.itemIndexes || []).filter(Number.isInteger));
    const items = (Array.isArray(record?.items) ? record.items : []).map((item: any, index: number) => selected.has(index)
      ? { ...item, orderStatus: 'received', partStatus: 'delivered', receivedAt: at, partDeliveredAt: at }
      : item);
    patch.items = items;
    const ordered = items.filter((item: any) => item?.requiresOrder === true || /needed|ordered|received|delivered|in.?transit|awaiting/i.test(String(item?.orderStatus || item?.partStatus || '')));
    const allDelivered = ordered.length > 0 && ordered.every((item: any) => /received|delivered|in.?stock/i.test(String(item?.orderStatus || item?.partStatus || '')));
    if (!allDelivered) {
      patch.workflowStage = 'Parts';
      patch.repairStatus = 'Waiting on Part Delivery';
      patch.statusUpdate = 'Some Items Delivered';
    }
  }

  if (action === 'manual_update' || action === 'customer_promise') {
    delete patch.workflowStage;
    delete patch.repairStatus;
    if (action === 'manual_update') patch.statusUpdate = String(input.note || '').trim();
  }

  return {
    patch,
    event: {
      action,
      audience: definition.audience,
      occurredAt: at,
      note: String(input.note || '').trim(),
      payload: { ...input },
      idempotencyKey: String(input.idempotencyKey || `${record?.id || 'repair'}:${action}:${at}`),
      deliveryStatus: definition.sendsClientMessage ? 'pending' : 'internal',
    },
  };
}
