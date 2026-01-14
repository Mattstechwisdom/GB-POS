import { WorkOrderFull, WorkOrderItem } from '../lib/types';

let _id = 1000;
const workOrders: WorkOrderFull[] = [];

export function listWorkOrders() {
  return workOrders.slice().sort((a,b) => b.id - a.id);
}

export function getWorkOrder(id: number) {
  return workOrders.find(w => w.id === id) || null;
}

export function addWorkOrder(w: Partial<WorkOrderFull>) : WorkOrderFull {
  const id = ++_id;
  const now = new Date().toISOString();
  const newW: WorkOrderFull = {
    id,
    status: (w.status as any) || 'open',
    assignedTo: w.assignedTo || null,
    customerId: (w.customerId as number) || 0,
    checkInAt: w.checkInAt || now,
    repairCompletionDate: w.repairCompletionDate || null,
    checkoutDate: w.checkoutDate || null,

    productCategory: w.productCategory || '',
    productDescription: w.productDescription || '',
    problemInfo: w.problemInfo || '',
    password: w.password || '',
  patternSequence: (w as any).patternSequence || [],
    model: w.model || '',
    serial: w.serial || '',

    intakeSource: w.intakeSource || '',

    discount: w.discount || 0,
    amountPaid: w.amountPaid || 0,
    taxRate: w.taxRate || 0,

    laborCost: w.laborCost || 0,
    partCosts: w.partCosts || 0,

    totals: w.totals || { subTotal: 0, tax: 0, total: 0, remaining: 0 },

    items: (w.items || []) as WorkOrderItem[],
    internalNotes: w.internalNotes || '',
  };
  workOrders.push(newW);
  return newW;
}

export function updateWorkOrder(id: number, patch: Partial<WorkOrderFull>) : WorkOrderFull | null {
  const idx = workOrders.findIndex(w => w.id === id);
  if (idx === -1) return null;
  const existing = workOrders[idx];
  const updated = { ...existing, ...patch, id } as WorkOrderFull;
  workOrders[idx] = updated;
  return updated;
}

export function removeWorkOrder(id: number) {
  const idx = workOrders.findIndex(w => w.id === id);
  if (idx === -1) return false;
  workOrders.splice(idx, 1);
  return true;
}
