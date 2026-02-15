import React, { useEffect, useMemo, useState } from 'react';
import { printReleaseForm, WorkOrder as PrintWorkOrder } from './releasePrint';
import { WorkOrderFull, WorkOrderStatus } from '../lib/types';
import { toLocalDatetimeInput, fromLocalDatetimeInput } from '../lib/datetime';
import { listTechnicians } from '../../src/lib/admin';

interface Props {
  workOrder: WorkOrderFull;
  onChange: (patch: Partial<WorkOrderFull>) => void;
  hideStatus?: boolean; // optionally hide status control (used by Sale window)
  saleDates?: boolean; // when true, relabel date fields and show extra Client pickup
  hideDates?: boolean; // optionally hide the date controls entirely (used by Sale window)
  hideOrderDeliveryDates?: boolean; // when true in Sale window, hide Product ordered & Product delivered (keep Client pickup)
  renderActions?: (workOrder: WorkOrderFull) => React.ReactNode; // override default print buttons
  validationFlags?: Partial<Record<'assignedTo', boolean>>;
}

const WorkOrderSidebar: React.FC<Props> = ({ workOrder, onChange, hideStatus = false, saleDates = false, hideDates = false, hideOrderDeliveryDates = false, renderActions, validationFlags }) => {
  const [techs, setTechs] = useState<any[]>([]);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const list = await listTechnicians();
        if (mounted) setTechs(list || []);
      } catch (e) { console.error('Failed to load technicians', e); }
    };
    refresh();
    const off = (window as any).api?.onTechniciansChanged?.(() => refresh());
    return () => { mounted = false; try { off && off(); } catch {} };
  }, []);
  const selectedTechId = useMemo(() => {
    if (!workOrder.assignedTo) return '';
    const raw = String(workOrder.assignedTo).trim();
    // If stored as id
    if (techs.some((t: any) => String(t.id) === raw)) return raw;
    // If stored as label (nickname/first)
    const matchByLabel = techs.find((t: any) => (t.nickname?.trim() || t.firstName) === raw);
    return matchByLabel ? String(matchByLabel.id) : '';
  }, [techs, workOrder.assignedTo]);

  return (
    <div className="bg-gradient-to-b from-slate-800 to-slate-900 p-3 rounded border border-zinc-700 h-full flex flex-col">
      <h4 className="text-sm font-semibold text-zinc-200 mb-3">Status & Dates</h4>
      {!hideStatus && (
        <>
          <label className="block text-xs text-zinc-400">Status</label>
          <select className="w-full mt-1 mb-2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand" value={workOrder.status} onChange={e => onChange({ status: e.target.value as WorkOrderStatus })}>
            <option value="open">open</option>
            <option value="in progress">in progress</option>
            <option value="closed">closed</option>
          </select>
        </>
      )}
          <label className="block text-xs text-zinc-400">
            Assigned to
            {validationFlags?.assignedTo && <span className="ml-1 text-red-500">*</span>}
          </label>
          {techs.length === 0 ? (
            <select disabled className="w-full mt-1 mb-2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-500"><option>— No technicians —</option></select>
          ) : (
            <select
              className={`w-full mt-1 mb-2 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand bg-zinc-800 border ${validationFlags?.assignedTo ? 'border-red-500' : 'border-zinc-700'}`}
              value={selectedTechId}
              onChange={e => {
                const id = e.target.value;
                if (!id) { onChange({ assignedTo: null }); return; }
                const tech = techs.find((t: any) => String(t.id) === id);
                // Store technician reference as id string for consistency across app
                onChange({ assignedTo: tech ? String(tech.id) : null });
              }}
            >
              <option value="">—</option>
              {techs.map((t: any) => (
                <option key={t.id} value={String(t.id)}>{t.nickname?.trim() || t.firstName}</option>
              ))}
            </select>
          )}


      {!hideDates && (
        <>
          {/* Hide ordered/delivered when requested in Sales, but keep Client pickup */}
          {!saleDates || !hideOrderDeliveryDates ? (
            <>
              <label className="block text-xs text-zinc-400">{saleDates ? 'Product ordered' : 'Repair complete'}</label>
              <div className="flex gap-2 mb-2">
                <input type="datetime-local" className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={toLocalDatetimeInput(workOrder.repairCompletionDate)} onChange={e => onChange({ repairCompletionDate: fromLocalDatetimeInput(e.target.value) as any })} />
                <button className="px-2 py-1 bg-brand text-black rounded" onClick={() => onChange({ repairCompletionDate: new Date().toISOString() })}>Now</button>
              </div>

              <label className="block text-xs text-zinc-400">{saleDates ? 'Product delivered' : 'Check-out'}</label>
              <div className="flex gap-2 mb-2">
                <input type="datetime-local" className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={toLocalDatetimeInput(workOrder.checkoutDate)} onChange={e => onChange({ checkoutDate: fromLocalDatetimeInput(e.target.value) as any })} />
                <button className="px-2 py-1 bg-brand text-black rounded" onClick={() => onChange({ checkoutDate: new Date().toISOString() })}>Now</button>
              </div>
            </>
          ) : null}

          {saleDates && (
            <>
              <label className="block text-xs text-zinc-400">Client pickup</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="datetime-local"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                  value={toLocalDatetimeInput((workOrder as any).clientPickupDate)}
                  onChange={e => onChange({ ...( { } as any), clientPickupDate: fromLocalDatetimeInput(e.target.value) as any })}
                />
                <button className="px-2 py-1 bg-brand text-black rounded" onClick={() => onChange({ ...( { } as any), clientPickupDate: new Date().toISOString() as any })}>Now</button>
              </div>
            </>
          )}
        </>
      )}

      <div className="mt-auto">
        {renderActions ? (
          <>{renderActions(workOrder)}</>
        ) : (
          <>
            <button
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 mb-2"
              onClick={async () => {
                try {
                  let customerName = (workOrder as any).customerName;
                  let customerPhone = (workOrder as any).customerPhone;
                  let customerEmail = '';
                  try {
                    const id = (workOrder as any).customerId;
                    if (id && (window as any).api?.findCustomers) {
                      const list = await (window as any).api.findCustomers({ id });
                      const c = Array.isArray(list) && list.length ? list[0] : null;
                      if (c) {
                        const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
                        customerName = full || customerName;
                        customerPhone = c.phone || customerPhone;
                        customerEmail = c.email || '';
                      }
                    }
                  } catch {}

                  const itemsRaw = (workOrder as any).items || [];
                  const items = itemsRaw.map((it: any) => ({
                    description: it.repair || it.description || it.title || it.name || it.altDescription || '',
                    parts: typeof it.parts === 'number' ? it.parts : (typeof it.partCost === 'number' ? it.partCost : 0),
                    labor: typeof it.labor === 'number' ? it.labor : (typeof it.unitPrice === 'number' ? it.unitPrice : (typeof it.laborCost === 'number' ? it.laborCost : 0)),
                    qty: typeof it.qty === 'number' ? it.qty : undefined,
                  }));

                  const wo: PrintWorkOrder = {
                    invoiceId: String((workOrder as any).id ?? ''),
                    dateTimeISO: (workOrder as any).checkInAt || new Date().toISOString(),
                    clientName: customerName || `${(workOrder as any).firstName ?? ''} ${(workOrder as any).lastName ?? ''}`.trim(),
                    phone: customerPhone || (workOrder as any).phone || '',
                    email: customerEmail,

                    device: workOrder.productCategory || '',
                    description: workOrder.productDescription || '',
                    model: (workOrder as any).model || '',
                    serialNumber: (workOrder as any).serial || '',
                    password: (workOrder as any).password || '',
                    patternSequence: Array.isArray((workOrder as any).patternSequence) ? (workOrder as any).patternSequence : [],
                    problem: workOrder.problemInfo || '',

                    items,
                    subTotalParts: Number((workOrder as any).partCosts || 0),
                    subTotalLabor: Number((workOrder as any).laborCost || 0),
                    discount: Number((workOrder as any).discount || 0),
                    taxRate: Number((workOrder as any).taxRate || 0),
                    taxes: Number((workOrder as any).totals?.tax || 0),
                    amountPaid: Number((workOrder as any).amountPaid || 0),
                    notes: (workOrder as any).internalNotes || '',
                  };

                  await printReleaseForm(wo, { autoCloseMs: 0, autoPrint: true });
                } catch (e) { console.error('Failed to open release form', e); }
              }}
            >
              Print release form
            </button>
            <button
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-200"
              onClick={async () => {
                try {
                  let customerName = (workOrder as any).customerName;
                  let customerPhone = (workOrder as any).customerPhone;
                  let customerEmail = (workOrder as any).customerEmail;
                  try {
                    const id = (workOrder as any).customerId;
                    if (id && (window as any).api?.findCustomers) {
                      const list = await (window as any).api.findCustomers({ id });
                      const c = Array.isArray(list) && list.length ? list[0] : null;
                      if (c) {
                        const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
                        customerName = full || customerName;
                        customerPhone = c.phone || customerPhone;
                        customerEmail = c.email || customerEmail;
                      }
                    }
                  } catch {}
                  const payload = {
                    id: (workOrder as any).id,
                    customerId: (workOrder as any).customerId,
                    customerName,
                    customerPhone,
                    customerEmail,
                    productCategory: workOrder.productCategory,
                    productDescription: workOrder.productDescription,
                    model: (workOrder as any).model,
                    serial: (workOrder as any).serial,
                    problemInfo: workOrder.problemInfo,
                    items: (workOrder as any).items || [],
                    partCosts: (workOrder as any).partCosts,
                    laborCost: (workOrder as any).laborCost,
                    discount: (workOrder as any).discount,
                    taxRate: (workOrder as any).taxRate,
                    totals: (workOrder as any).totals,
                    amountPaid: (workOrder as any).amountPaid,
                  };
                  if ((window as any).api?.openCustomerReceipt) {
                    await (window as any).api.openCustomerReceipt(payload);
                  } else {
                    const u = new URL(window.location.href);
                    u.search = `?customerReceipt=${encodeURIComponent(JSON.stringify(payload))}`;
                    window.open(u.toString(), '_blank');
                  }
                } catch (e) { console.error('Failed to open customer receipt', e); }
              }}
            >
              Print customer receipt
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default WorkOrderSidebar;
