export interface CleanupSettings { enabled: boolean; diagnosticOnlyDays: number; closeAllDays: number; notRepairableAttentionDays: number }
export interface CleanupClassification { reason: 'diagnostic-only' | 'universal-age'; ageDays: number }
export interface AttentionReason { code: string; label: string }
export interface PickupLifecycle { active:boolean; anchor:string; daysWaiting:number; reminderDue:boolean; needsAttention:boolean; suggestedStorageFee:number }
export const DEFAULT_CLEANUP_SETTINGS: CleanupSettings = { enabled: true, diagnosticOnlyDays: 20, closeAllDays: 30, notRepairableAttentionDays: 1 };
const text = (value: unknown) => String(value ?? '').trim().toLowerCase();
const days = (value: unknown, fallback: number) => Math.max(0, Math.floor(Number(value ?? fallback) || fallback));

export function normalizeCleanupSettings(value: any): CleanupSettings {
  const diagnosticOnlyDays = Math.max(1, days(value?.diagnosticOnlyDays, 20));
  return { enabled: value?.enabled !== false, diagnosticOnlyDays, closeAllDays: Math.max(diagnosticOnlyDays, days(value?.closeAllDays, 30)), notRepairableAttentionDays: days(value?.notRepairableAttentionDays, 1) };
}
export function workOrderAgeDays(workOrder: any, now = new Date()) {
  const anchor = new Date(workOrder?.checkInAt || workOrder?.createdAt || 0).getTime();
  return Number.isFinite(anchor) && anchor > 0 ? Math.floor(Math.max(0, now.getTime() - anchor) / 86400000) : 0;
}
export function isDiagnosticOnlyWorkOrder(workOrder: any) {
  const lines = Array.isArray(workOrder?.items) ? workOrder.items : [];
  const hasSelection = /diagnostic/.test(text(workOrder?.diagnosticSelection?.label || workOrder?.diagnosticSelection?.name));
  const lineNames: string[] = lines.map((line: any) => text(line?.repair || line?.description || line?.title || line?.name || line?.altDescription));
  const hasDiagnostic = hasSelection || lineNames.some(name => /diagnostic/.test(name));
  const hasOther = lineNames.some(name => name && !/diagnostic|evaluation|assessment/.test(name));
  return hasDiagnostic && !hasOther;
}
export function classifyLegacyCleanup(workOrder: any, input: any, now = new Date()): CleanupClassification | null {
  const settings = normalizeCleanupSettings(input);
  if (!settings.enabled || text(workOrder?.status) === 'closed' || workOrder?.checkoutDate || workOrder?.legacyCleanup?.closedAt) return null;
  const ageDays = workOrderAgeDays(workOrder, now);
  if (ageDays >= settings.closeAllDays) return { reason: 'universal-age', ageDays };
  if (ageDays >= settings.diagnosticOnlyDays && isDiagnosticOnlyWorkOrder(workOrder)) return { reason: 'diagnostic-only', ageDays };
  return null;
}
export function buildLegacyClosePatch(classification: CleanupClassification, now = new Date(), input?: any) {
  const settings = normalizeCleanupSettings(input);
  return { status: 'closed', legacyCleanup: { rule: classification.reason, ageDays: classification.ageDays, diagnosticOnlyDays: settings.diagnosticOnlyDays, closeAllDays: settings.closeAllDays, closedAt: now.toISOString() }, updatedAt: now.toISOString() };
}
export function isRepairNotPossible(workOrder: any) { return /repair not possible|not repairable|cannot be repaired|unrepairable/.test(text(workOrder?.repairStatus || workOrder?.workflowStatus || workOrder?.status)); }
export function pickupLifecycleFor(workOrder:any, now=new Date()):PickupLifecycle {
  const closed=text(workOrder?.status)==='closed' || !!(workOrder?.pickedUpAt || workOrder?.clientPickupDate || workOrder?.checkoutDate);
  const anchorValue=workOrder?.scheduledPickupAt || workOrder?.pickupReadyAt || workOrder?.repairCompletionDate || workOrder?.repairStatusAt;
  const anchor=new Date(anchorValue || 0); const valid=Number.isFinite(anchor.getTime()) && anchor.getTime()>0;
  if(closed || !valid) return {active:false,anchor:'',daysWaiting:0,reminderDue:false,needsAttention:false,suggestedStorageFee:0};
  const daysWaiting=Math.floor(Math.max(0,now.getTime()-anchor.getTime())/86400000);
  const scheduled=!!workOrder?.scheduledPickupAt;
  return {active:true,anchor:anchor.toISOString(),daysWaiting,reminderDue:daysWaiting>=8 && !workOrder?.pickupReminderSentAt,needsAttention:daysWaiting>=12,suggestedStorageFee:Math.max(0,scheduled?daysWaiting:daysWaiting-7)*25};
}
export function buildPickedUpPatch(workOrder:any, actor:string, now=new Date(), allowBalance=false) {
  const remaining=Number(workOrder?.totals?.remaining ?? workOrder?.balance ?? 0)||0;
  if(remaining>0 && !allowBalance) throw new Error(`This work order has a remaining balance of $${remaining.toFixed(2)}.`);
  const at=now.toISOString(); return {status:'closed',repairStatus:'Picked Up',statusUpdate:'Picked Up / Ticket Closed',pickedUpAt:at,clientPickupDate:at,pickedUpBy:String(actor||'Technician'),updatedAt:at};
}
export function attentionReasonsForWorkOrder(workOrder: any, context: { now?: Date; settings?: any; technicianState?: string } = {}): AttentionReason[] {
  const now = context.now || new Date(); const settings = normalizeCleanupSettings(context.settings); const result: AttentionReason[] = [];
  const status = text(workOrder?.status); const pickup = workOrder?.clientPickupDate || workOrder?.pickupDate || workOrder?.checkoutDate;
  const stage=text(workOrder?.workflowStage||workOrder?.workflow_stage);
  const overdue=(value:any,days=0)=>{const at=new Date(value||0).getTime();return !!at&&Number.isFinite(at)&&now.getTime()-at>=days*86400000;};
  if (context.technicianState === 'unassigned') result.push({ code:'technician-unassigned', label:'No technician assigned' });
  if (context.technicianState === 'unknown') result.push({ code:'technician-unknown', label:'Technician assignment cannot be resolved' });
  if(stage==='approval'&&overdue(workOrder?.approvalRequestedAt||workOrder?.approval_requested_at,2)&&!workOrder?.clientDecision&&!workOrder?.client_decision) result.push({code:'approval-overdue',label:'Repair approval has not received a response'});
  if(overdue(workOrder?.promisedAt||workOrder?.promised_at)&&!workOrder?.promiseCompletedAt) result.push({code:'promise-overdue',label:'Customer promise is overdue'});
  if(stage==='parts'&&overdue(workOrder?.partEta||workOrder?.part_eta||workOrder?.partsEstDelivery||workOrder?.parts_est_delivery)) result.push({code:'part-overdue',label:'Part delivery estimate has passed'});
  if(text(workOrder?.emailDeliveryStatus||workOrder?.email_delivery_status)==='failed') result.push({code:'email-failed',label:'Client email delivery failed'});
  if(Number(workOrder?.unreadClientReplies||workOrder?.unread_client_replies||0)>0) result.push({code:'client-reply-unread',label:'Unread client reply'});
  if(workOrder?.pendingSync===true||workOrder?.pending_sync===true) result.push({code:'sync-pending',label:'Workflow update is waiting to synchronize'});
  if (pickup && status !== 'closed') result.push({ code:'pickup-still-open', label:'Pickup was recorded but the ticket is still open' });
  if (isRepairNotPossible(workOrder) && !pickup && status !== 'closed') {
    const markedAt = new Date(workOrder?.repairStatusAt || workOrder?.updatedAt || workOrder?.activityAt || workOrder?.checkInAt || 0).getTime();
    if (markedAt && now.getTime() - markedAt >= settings.notRepairableAttentionDays * 86400000) result.push({ code:'not-repairable-awaiting-pickup', label:'Not repairable and still awaiting pickup' });
  }
  if (isRepairNotPossible(workOrder) && status === 'closed' && !pickup && !workOrder?.legacyCleanup?.closedAt) result.push({ code:'not-repairable-closed-without-pickup', label:'Not-repairable ticket closed without pickup' });
  const lifecycle=pickupLifecycleFor(workOrder,now); if(lifecycle.needsAttention) result.push({code:'pickup-storage-review',label:`Pickup overdue — review suggested $${lifecycle.suggestedStorageFee} storage fee`});
  return result;
}
