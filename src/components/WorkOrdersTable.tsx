import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { listTechnicians } from '../lib/admin';
import { formatPhone } from '../lib/format';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { useContextMenu } from '../lib/useContextMenu';
import { usePagination } from '../lib/pagination';

interface WorkOrderRow {
  id: number; status?: string; assignedTo?: string | null; checkInAt?: string; customerId?: number;
  totals?: { total?: number; remaining?: number }; amountPaid?: number; productDescription?: string; productCategory?: string; problemInfo?: string;
  items?: any[];
}

const WorkOrdersTable: React.FC<{ technicianFilter?: string; dateFrom?: string; dateTo?: string }> = ({ technicianFilter = '', dateFrom = '', dateTo = '' }) => {
  const [rows, setRows] = useState<WorkOrderRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [techIndex, setTechIndex] = useState<Record<string,string>>({});
  const [customerIndex, setCustomerIndex] = useState<Record<number, { name: string; phone?: string }>>({});
  const [loading, setLoading] = useState(false);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const { page, setPage, pageSize, setTotalItems } = usePagination();

	const ctx = useContextMenu<WorkOrderRow>();
	const ctxRow = ctx.state.data;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const api = (window as any).api;
      const list = await (api?.getWorkOrders ? api.getWorkOrders() : (api?.dbGet ? api.dbGet('workOrders') : Promise.resolve([])));
      // Sort newest first by checkInAt or id
      list.sort((a: any, b: any) => {
        const ad = a.checkInAt || ''; const bd = b.checkInAt || '';
        return (bd.localeCompare(ad)) || (b.id - a.id);
      });
      setRows(list);
    } catch (e) { console.error('Failed loading work orders', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const refreshCustomers = async () => {
      try {
        const customers = await ((window as any).api.getCustomers?.() ?? (window as any).api.dbGet('customers'));
        const cMap: Record<number, { name: string; phone?: string }> = {};
        (customers || []).forEach((c: any) => {
          const composed = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
          const name = composed || c.name || c.email || `Customer #${c.id}`;
          cMap[c.id] = { name, phone: c.phone || c.phoneAlt };
        });
        setCustomerIndex(cMap);
      } catch (e) { console.error('customer load', e); }
    };
    const refreshTechs = async () => {
      try {
        const techs = await listTechnicians();
        const map: Record<string,string> = {};
        techs.forEach((t: any) => { map[t.id] = (t.nickname && t.nickname.trim()) || t.firstName || t.id; });
        setTechIndex(map);
      } catch (e) { console.error('tech load', e); }
    };
    refreshTechs();
    refreshCustomers();
    const api = (window as any).api;
    const unsubWO = api?.onWorkOrdersChanged?.(() => { load(); refreshCustomers(); });
    const unsubTech = api?.onTechniciansChanged?.(() => refreshTechs());
    return () => { try { unsubWO && unsubWO(); } catch {} try { unsubTech && unsubTech(); } catch {} };
  }, [load]);

  const filteredRows = useMemo(() => {
    return rows
      .filter(r => {
        if (!technicianFilter) return true;
        const at = r.assignedTo as any;
        if (technicianFilter === '__unassigned') {
          return !at;
        }
        if (!at) return false;
        // If assignedTo stored as technician id, compare directly
        if (typeof at === 'string' && techIndex[at]) {
          return at === technicianFilter;
        }
        // If stored as label (nickname/first name), compare against display label for the selected id
        const selectedLabel = techIndex[technicianFilter] || '';
        if (typeof at === 'string') {
          // accept exact match or first-name match
          const first = at.split(' ')[0];
          return at === selectedLabel || first === selectedLabel;
        }
        return false;
      })
      .filter(r => {
        // Date range filter: inclusive between dateFrom and dateTo (YYYY-MM-DD). If either missing, skip that bound.
        if (!dateFrom && !dateTo) return true;
        const ci = r.checkInAt ? new Date(r.checkInAt) : null;
        if (!ci) return false;
        const fromOk = dateFrom ? ci >= new Date(dateFrom + 'T00:00:00') : true;
        const toOk = dateTo ? ci <= new Date(dateTo + 'T23:59:59.999') : true;
        return fromOk && toOk;
      });
  }, [rows, technicianFilter, dateFrom, dateTo, techIndex]);

  useEffect(() => {
    setTotalItems(filteredRows.length);
    return () => {
      setTotalItems(0);
    };
  }, [filteredRows.length, setTotalItems]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filteredRows.length);
  const pagedRows = filteredRows.slice(startIdx, endIdx);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage, setPage]);


  const openContextMenu = (e: React.MouseEvent, r: WorkOrderRow) => {
    setSelectedId(r.id);
    ctx.openFromEvent(e, r);
  };

  const computeTotals = (w: any) => {
    const labor = Number(w.laborCost || 0);
    const parts = Number(w.partCosts || 0);
    const discount = Number(w.discount || 0);
    const taxRate = Number(w.taxRate || 0);
    const subTotal = Math.max(0, labor + parts - discount);
    const tax = Math.round((subTotal * (taxRate / 100)) * 100) / 100;
    const total = Math.round((subTotal + tax) * 100) / 100;
    const amountPaid = Number(w.amountPaid || 0);
    const remaining = Math.max(0, Math.round((total - amountPaid) * 100) / 100);
    return { subTotal, tax, total, remaining };
  };

  const onOpen = async () => {
    if (!ctxRow) return;
    await (window as any).api?.openNewWorkOrder?.({ workOrderId: ctxRow.id });
  };
  const onViewCustomer = async () => {
    if (!ctxRow?.customerId) return;
    await (window as any).api?.openCustomerOverview?.(ctxRow.customerId);
  };
  const onCopyInvoice = async () => {
    if (!ctxRow) return;
    const inv = `GB${String(ctxRow.id).padStart(7,'0')}`;
    try { await navigator.clipboard.writeText(inv); } catch { /* ignore */ }
  };
  const onCopyPhone = async () => {
    if (!ctxRow) return;
    const rawPhone = (ctxRow.customerId && customerIndex[ctxRow.customerId!]?.phone) || (ctxRow as any).customerPhone || (ctxRow as any).phone || '';
    const phone = (formatPhone(rawPhone || '') || rawPhone || '').toString().trim();
    if (!phone) return;
    try { await navigator.clipboard.writeText(phone); } catch { /* ignore */ }
  };
  const onPrintReceipt = async () => {
    if (!ctxRow) return;
    await (window as any).api?.openCustomerReceipt?.({ workOrderId: ctxRow.id });
  };
  const onPrintReleaseForm = async () => {
    if (!ctxRow) return;
    await (window as any).api?.openReleaseForm?.({ workOrderId: ctxRow.id });
  };
  const onDuplicate = async () => {
    if (!ctxRow) return;
    const nowIso = new Date().toISOString();
    const base = { ...ctxRow } as any;
    delete base.id;
    const draft = {
      ...base,
      status: 'open',
      amountPaid: 0,
      checkInAt: nowIso,
    };
    const totals = computeTotals(draft);
    draft.totals = totals;
    await (window as any).api?.dbAdd?.('workOrders', draft);
  };
  const onMarkPaid = async () => {
    if (!ctxRow) return;
    const totals = computeTotals(ctxRow);
    const updated = { ...ctxRow, amountPaid: totals.total, totals: { ...totals, remaining: 0 }, status: 'closed' };
    await (window as any).api?.dbUpdate?.('workOrders', ctxRow.id, updated);
  };
  const onReopen = async () => {
    if (!ctxRow) return;
    const totals = computeTotals(ctxRow);
    const updated = { ...ctxRow, status: 'open', totals };
    await (window as any).api?.dbUpdate?.('workOrders', ctxRow.id, updated);
  };
  const onDelete = async () => {
    if (!ctxRow) return;
    setConfirmText('');
    setConfirmOpen(true);
  };

  const performDelete = async () => {
    if (!ctxRow) return;
    if (confirmText !== 'DELETE') return;
    await (window as any).api.dbDelete('workOrders', ctxRow.id);
    setConfirmOpen(false);
  };

  const ctxItems: ContextMenuItem[] = useMemo(() => {
    if (!ctxRow) return [];
    const inv = `GB${String(ctxRow.id).padStart(7,'0')}`;
    const remaining = (ctxRow.totals?.remaining ?? Math.max(0, (ctxRow.totals?.total ?? 0) - (ctxRow.amountPaid || 0)));
    const hasCustomer = !!ctxRow.customerId;
    const rawPhone = (ctxRow.customerId && customerIndex[ctxRow.customerId!]?.phone) || (ctxRow as any).customerPhone || (ctxRow as any).phone || '';
    const phone = (formatPhone(rawPhone || '') || rawPhone || '').toString().trim();

    return [
      { type: 'header', label: `Invoice ${inv}` },
      { label: 'Edit / Open', onClick: onOpen },
      { label: 'View Customer', onClick: onViewCustomer, disabled: !hasCustomer },
      { type: 'separator' },
      { label: 'Copy Invoice #', onClick: onCopyInvoice },
      { label: 'Copy Phone', onClick: onCopyPhone, disabled: !phone, hint: phone ? phone : undefined },
      { type: 'separator' },
      { label: 'Print Customer Receipt', onClick: onPrintReceipt },
      { label: 'Print Release Form', onClick: onPrintReleaseForm },
      { type: 'separator' },
      { label: 'Duplicate', onClick: onDuplicate },
      remaining > 0 ? ({ label: 'Mark Paid in Full', onClick: onMarkPaid } as ContextMenuItem) : ({ label: 'Reopen', onClick: onReopen } as ContextMenuItem),
      { type: 'separator' },
      { label: 'Delete…', onClick: onDelete, danger: true },
    ];
  }, [ctxRow, customerIndex]);

  return (
    <div className="overflow-x-auto relative" ref={tableRef}>
      <table className="min-w-full text-sm border-separate border-spacing-0">
        <thead className="bg-zinc-800">
          <tr>
            <th className="px-2 py-2 text-left">Invoice #</th>
            <th className="px-2 py-2 text-left">Status</th>
            <th className="px-2 py-2 text-left">Tech</th>
            <th className="px-2 py-2 text-left">Client</th>
            <th className="px-2 py-2 text-left">Phone</th>
            <th className="px-2 py-2 text-left">Date</th>
            <th className="px-2 py-2 text-left">Description</th>
            <th className="px-2 py-2 text-left">Items</th>
            <th className="px-2 py-2 text-left">Problem</th>
            <th className="px-2 py-2 text-left">Total</th>
            <th className="px-2 py-2 text-left">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={11} className="p-6 text-center text-zinc-500">Loading...</td></tr>
          )}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={11} className="p-6 text-center text-zinc-500">No work orders yet</td></tr>
          )}
          {!loading && pagedRows.map(r => {
            const total = r.totals?.total ?? 0;
            const remaining = r.totals?.remaining ?? Math.max(0, total - (r.amountPaid || 0));
            const computedStatus = remaining <= 0 ? 'closed' : 'open';
            const clientName = (r.customerId && customerIndex[r.customerId!]?.name) || (r as any).customerName || [
              (r as any).firstName,
              (r as any).lastName,
            ].filter(Boolean).join(' ').trim();
            const rawPhone = (r.customerId && customerIndex[r.customerId!]?.phone) || (r as any).customerPhone || (r as any).phone || '';
            const clientPhone = formatPhone(rawPhone || '') || rawPhone || '';
            const repairs = (() => {
              const items = Array.isArray((r as any).items) ? (r as any).items : [];
              if (!items.length) return '';
              const titles = items.map((it: any) => (it.repair || it.description || it.title || it.name || it.altDescription || '').toString().trim()).filter(Boolean);
              const text = titles.join(', ');
              return text;
            })();
            return (
              <tr
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                onContextMenu={(e) => openContextMenu(e, r)}
                onDoubleClick={async () => { await (window as any).api.openNewWorkOrder({ workOrderId: r.id }); }}
                className={`odd:bg-zinc-900 even:bg-zinc-800/40 cursor-pointer transition-colors border-l-4 ${selectedId === r.id ? 'border-[#39FF14] bg-zinc-800/80 shadow-[inset_0_0_0_1px_#1f1f21,0_0_6px_1px_rgba(57,255,20,0.25)]' : 'border-transparent hover:bg-zinc-800/70'}`}
              >
                <td className="px-2 py-1 font-mono">GB{String(r.id).padStart(7,'0')}</td>
                <td className="px-2 py-1 capitalize">{computedStatus}</td>
                <td className="px-2 py-1">{(() => {
                  const atRaw = r.assignedTo as any;
                  if (atRaw === null || typeof atRaw === 'undefined') return '';
                  const at = String(atRaw).trim();
                  // Direct id match
                  if (techIndex[at]) return techIndex[at];
                  // Label or first-name match against admin-defined labels
                  const entries = Object.entries(techIndex);
                  for (const [, label] of entries) {
                    if (!label) continue;
                    if (label === at) return label;
                    const first = label.split(' ')[0];
                    if (first && first === at) return label;
                  }
                  return '';
                })()}</td>
                <td className="px-2 py-1 max-w-[200px] truncate" title={clientName}>{clientName}</td>
                <td className="px-2 py-1 whitespace-nowrap" title={clientPhone}>{clientPhone}</td>
                <td className="px-2 py-1">{r.checkInAt ? r.checkInAt.split('T')[0] : ''}</td>
                <td className="px-2 py-1 max-w-[220px] truncate" title={r.productDescription || r.productCategory || ''}>{r.productDescription || r.productCategory || ''}</td>
                <td className="px-2 py-1 max-w-[320px] truncate" title={repairs}>{repairs}</td>
                <td className="px-2 py-1 max-w-[260px] truncate" title={r.problemInfo || ''}>{r.problemInfo || ''}</td>
                <td className="px-2 py-1">${total.toFixed(2)}</td>
                <td className="px-2 py-1">${remaining.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ContextMenu
        id="wo-ctx-menu"
        open={ctx.state.open}
        x={ctx.state.x}
        y={ctx.state.y}
        items={ctxItems}
        onClose={ctx.close}
      />

      {confirmOpen && ctxRow && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmOpen(false)} />
          <div className="relative z-10 w-[460px] max-w-[92vw] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-4 space-y-3">
            <div className="text-lg font-semibold">Delete Work Order</div>
            <div className="text-sm text-zinc-300">This will permanently remove invoice <span className="font-mono">GB{String(ctxRow.id).padStart(7,'0')}</span>. This action cannot be undone.</div>
            <div className="text-sm text-zinc-400">Type <span className="font-mono text-red-400">DELETE</span> to confirm.</div>
            <input
              autoFocus
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded outline-none focus:border-[#39FF14]"
              placeholder="DELETE"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-zinc-500" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button
                className={`px-3 py-2 border rounded ${confirmText === 'DELETE' ? 'bg-red-600 border-red-500 hover:bg-red-500' : 'bg-red-900/30 border-red-800 cursor-not-allowed'}`}
                disabled={confirmText !== 'DELETE'}
                onClick={performDelete}
              >Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default WorkOrdersTable;
