import { buildTechnicianIndex, resolveTechnician } from './technicianIdentity';
import { repairPresentationFor } from './commandCenterPresentation';

export type CommandCenterKind = 'workorder' | 'sale' | 'consultation';

export interface CommandCenterRecord {
  id: string | number;
  kind: CommandCenterKind;
  customerId?: string | number;
  customerName: string;
  title: string;
  deviceLabel: string;
  deviceCategory: string;
  problem: string;
  model: string;
  serial: string;
  status: string;
  technician: string;
  total: number;
  remaining: number;
  activityAt: string;
  stage?: string;
  partEta?: string;
  searchText: string;
  source: any;
}

export interface CommandCenterModel {
  records: CommandCenterRecord[];
  workOrders: CommandCenterRecord[];
  sales: CommandCenterRecord[];
  activeWorkOrders: CommandCenterRecord[];
  awaitingParts: CommandCenterRecord[];
  readyForPickup: CommandCenterRecord[];
  repairQueue: CommandCenterRecord[];
  collectedToday: number;
  paymentsToday: number;
  stages: Record<string, CommandCenterRecord[]>;
  today: { tasks: any[]; events: any[]; consultations: CommandCenterRecord[]; deliveries: any[] };
}

type CommandCenterInput = { customers?: any[]; technicians?: any[]; workOrders?: any[]; sales?: any[]; calendarEvents?: any[]; purchaseOrders?: any[]; now?: Date };

const text = (value: any) => String(value ?? '').trim();
const number = (value: any) => Number(value || 0) || 0;
const lower = (value: any) => text(value).toLowerCase();
const timestamp = (value: any) => {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const sameLocalDay = (value: any, now: Date) => {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};

function customerNameFor(record: any, customers: Map<string, any>) {
  const customer = customers.get(text(record?.customerId));
  const composed = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim();
  return composed || text(customer?.name) || text(record?.customerName) || (record?.customerId ? `Client #${record.customerId}` : 'Walk-in');
}

function lineTitle(record: any) {
  const lines = Array.isArray(record?.items) ? record.items : [];
  const titles = lines.map((item: any) => text(item?.repair || item?.description || item?.title || item?.name)).filter(Boolean);
  return titles.join(', ') || text(record?.productDescription || record?.summary || record?.problemInfo || record?.problem) || 'Untitled record';
}

function isFinishedWorkOrder(workOrder: any) {
  const status = lower(workOrder?.status);
  return !!workOrder?.checkoutDate || /^(closed|cancelled|canceled|void|refunded|deleted|archived)$/.test(status);
}

function stageFor(workOrder: any, remaining: number) {
  const raw = lower(workOrder?.repairStatus || workOrder?.workflowStatus || workOrder?.status);
  const lines = Array.isArray(workOrder?.items) ? workOrder.items : [];
  const waitingPart = /awaiting.*part|waiting.*part|part.*ordered/.test(raw) || lines.some((line: any) => /ordered|awaiting|in transit/.test(lower(line?.orderStatus || line?.partStatus)));
  const delivered = /part.*delivered|received/.test(raw) || lines.some((line: any) => /delivered|received/.test(lower(line?.orderStatus || line?.partStatus)));
  if (isFinishedWorkOrder(workOrder) || (/complete.*paid/.test(raw) && remaining <= 0)) return 'Completed';
  if (/ready.*pickup|pickup/.test(raw)) return 'Pickup';
  if (/testing/.test(raw)) return 'Testing';
  if (/repair/.test(raw) && !waitingPart) return 'Repair';
  if (waitingPart && !delivered) return 'Parts';
  if (/approv|estimate/.test(raw)) return 'Approval';
  if (/diagnos|in progress/.test(raw)) return 'Diagnosing';
  return 'Checked in';
}

export function buildCommandCenterModel(input: CommandCenterInput): CommandCenterModel {
  const now = input.now || new Date();
  const customers = new Map((input.customers || []).map(customer => [text(customer?.id), customer]));
  const technicians = buildTechnicianIndex(input.technicians || []);
  const workOrders = (input.workOrders || []).map((record): CommandCenterRecord => {
    const total = number(record?.totals?.total ?? record?.total);
    const paid = number(record?.amountPaid ?? record?.totals?.paid);
    const remaining = Math.max(0, number(record?.totals?.remaining ?? record?.balance ?? (total - paid)));
    const stage = stageFor(record, remaining);
    const customerName = customerNameFor(record, customers);
    const title = lineTitle(record);
    const presentation = repairPresentationFor(record);
    const activityAt = text(record?.activityAt || record?.updatedAt || record?.checkInAt || record?.createdAt);
    return { id: record?.id, kind: 'workorder', customerId: record?.customerId, customerName, title, ...presentation, status: text(record?.status || stage), technician: resolveTechnician(record?.assignedTo, technicians).name, total, remaining, activityAt, stage, partEta: text(record?.partEta || record?.expectedDeliveryDate), searchText: `${record?.id} ${customerName} ${title} ${presentation.deviceLabel} ${presentation.problem} ${presentation.serial} ${record?.phone || ''} ${record?.email || ''}`.toLowerCase(), source: record };
  });
  const sales = (input.sales || []).map((record): CommandCenterRecord => {
    const total = number(record?.totals?.total ?? record?.total);
    const remaining = Math.max(0, number(record?.totals?.remaining ?? record?.balance ?? (total - number(record?.amountPaid))));
    const customerName = customerNameFor(record, customers);
    const title = lineTitle(record);
    const kind: CommandCenterKind = lower(record?.type || record?.saleType).includes('consult') ? 'consultation' : 'sale';
    const activityAt = text(record?.activityAt || record?.checkoutDate || record?.checkInAt || record?.createdAt);
    return { id: record?.id, kind, customerId: record?.customerId, customerName, title, deviceLabel: title, deviceCategory: '', problem: '', model: '', serial: '', status: text(record?.status), technician: resolveTechnician(record?.assignedTo, technicians).name, total, remaining, activityAt, searchText: `${record?.id} ${customerName} ${title} ${record?.phone || ''} ${record?.email || ''}`.toLowerCase(), source: record };
  });
  const stages: Record<string, CommandCenterRecord[]> = Object.fromEntries(['Checked in', 'Diagnosing', 'Approval', 'Parts', 'Repair', 'Testing', 'Pickup', 'Completed'].map(stage => [stage, []]));
  workOrders.forEach(record => stages[record.stage || 'Checked in']?.push(record));
  const activeWorkOrders = workOrders.filter(record => record.stage !== 'Completed');
  const awaitingParts = stages.Parts;
  const readyForPickup = stages.Pickup;
  const repairQueue = activeWorkOrders.filter(record => {
    if (record.stage !== 'Parts') return true;
    return !!record.partEta && timestamp(record.partEta) <= now.getTime();
  }).sort((a, b) => timestamp(a.activityAt) - timestamp(b.activityAt));
  const todayPayments = [...workOrders, ...sales].flatMap(record => {
    const payments = Array.isArray(record.source?.payments) ? record.source.payments : [];
    if (payments.length) return payments.filter((payment: any) => sameLocalDay(payment?.date || payment?.createdAt || payment?.paidAt, now)).map((payment: any) => number(payment?.amount));
    return sameLocalDay(record.source?.checkoutDate || record.source?.paidAt, now) ? [number(record.source?.amountPaid || record.total)] : [];
  });
  const calendar = input.calendarEvents || [];
  return { records: [...workOrders, ...sales].sort((a, b) => timestamp(b.activityAt) - timestamp(a.activityAt)), workOrders, sales, activeWorkOrders, awaitingParts, readyForPickup, repairQueue, collectedToday: todayPayments.reduce((sum, amount) => sum + amount, 0), paymentsToday: todayPayments.length, stages, today: { tasks: calendar.filter(event => sameLocalDay(event?.date || event?.start, now) && lower(event?.category || event?.type).includes('task')), events: calendar.filter(event => sameLocalDay(event?.date || event?.start, now) && !/task|delivery/.test(lower(event?.category || event?.type))), consultations: sales.filter(record => record.kind === 'consultation' && sameLocalDay(record.activityAt, now)), deliveries: [...calendar.filter(event => sameLocalDay(event?.date || event?.start, now) && lower(event?.category || event?.type).includes('delivery')), ...(input.purchaseOrders || []).filter(order => sameLocalDay(order?.expectedDeliveryDate || order?.eta, now))] } };
}

export function searchCommandCenterRecords(model: CommandCenterModel, query: string) {
  const terms = lower(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return model.records.filter(record => terms.every(term => record.searchText.includes(term))).slice(0, 30);
}

export function removeCommandCenterRecord<T extends Pick<CommandCenterRecord, 'id' | 'kind'>>(records: T[] = [], target: Pick<CommandCenterRecord, 'id' | 'kind'>) {
  return records.filter(record => !(String(record.id) === String(target.id) && record.kind === target.kind));
}
