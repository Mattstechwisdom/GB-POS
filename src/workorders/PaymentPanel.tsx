import React from 'react';
import { WorkOrderFull } from '../lib/types';

interface Props {
  workOrder: WorkOrderFull;
  onChange: (p: Partial<WorkOrderFull>) => void;
  onCheckout: () => void;
  salesMode?: boolean; // when true, hide labor/parts and discount; show single Product row
}

const PaymentPanel: React.FC<Props> = ({ workOrder, onChange, onCheckout, salesMode = false }) => {
  const t = workOrder.totals || { subTotal: 0, tax: 0, total: 0, remaining: 0 };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
      <h4 className="text-sm font-semibold text-zinc-200 mb-2">Payment</h4>

      <div className="grid grid-cols-2 gap-2">
        {!salesMode && (
          <div className="col-span-2">
            <label className="block text-xs text-zinc-400">Discount (labor only)</label>
            <div className="mt-1 flex flex-wrap gap-2 items-start">
              <select
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-32"
                value={workOrder.discountType || ''}
                onChange={e => {
                  const dt = e.target.value as any;
                  let discount = workOrder.discount || 0;
                  if (dt === 'pct_5') discount = (workOrder.laborCost || 0) * 0.05;
                  else if (dt === 'pct_10') discount = (workOrder.laborCost || 0) * 0.10;
                  else if (dt === 'custom_pct') {
                    const pct = workOrder.discountPctValue || 0;
                    discount = (workOrder.laborCost || 0) * (pct / 100);
                  } else if (dt === 'custom_amt') {
                    discount = workOrder.discountCustomAmount || 0;
                  } else {
                    discount = 0;
                  }
                  onChange({ discountType: dt, discount });
                }}
              >
                <option value="">None</option>
                <option value="pct_5">5%</option>
                <option value="pct_10">10%</option>
                <option value="custom_pct">Custom %</option>
                <option value="custom_amt">Custom $</option>
              </select>
              {workOrder.discountType === 'custom_pct' && (
                <input
                  type="number"
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
                  placeholder="%"
                  value={workOrder.discountPctValue ?? ''}
                  onChange={e => {
                    const pct = Number(e.target.value) || 0;
                    const discount = (workOrder.laborCost || 0) * (pct / 100);
                    onChange({ discountPctValue: pct, discount });
                  }}
                />
              )}
              {workOrder.discountType === 'custom_amt' && (
                <input
                  type="number"
                  className="w-28 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
                  placeholder="$"
                  value={workOrder.discountCustomAmount ?? ''}
                  onChange={e => {
                    const amt = Number(e.target.value) || 0;
                    onChange({ discountCustomAmount: amt, discount: amt });
                  }}
                />
              )}
              <div className="text-xs text-zinc-300 self-center px-2 py-1 bg-zinc-800 rounded">${(workOrder.discount || 0).toFixed(2)}</div>
              {workOrder.discountType?.startsWith('pct_') && (
                <div className="text-[10px] text-zinc-500 self-center">({workOrder.discountType === 'pct_5' ? '5%' : workOrder.discountType === 'pct_10' ? '10%' : ''})</div>
              )}
              {workOrder.discountType === 'custom_pct' && typeof workOrder.discountPctValue === 'number' && (
                <div className="text-[10px] text-zinc-500 self-center">({workOrder.discountPctValue}% of labor)</div>
              )}
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">Applies to labor only. Amount auto-recalculates if labor changes.</div>
          </div>
        )}
        <div>
          <label className="block text-xs text-zinc-400">Amount paid</label>
          <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={workOrder.amountPaid || 0} onChange={e => onChange({ amountPaid: Number(e.target.value) })} />
        </div>
        <div>
          <label className="block text-xs text-zinc-400">Sales tax %</label>
          <input className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={workOrder.taxRate || 0} onChange={e => onChange({ taxRate: Number(e.target.value) })} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {salesMode ? (
          <>
            <div className="text-zinc-400">Product</div><div className="text-zinc-200">${(workOrder.partCosts || 0).toFixed(2)}</div>
          </>
        ) : (
          <>
            <div className="text-zinc-400">Labor</div><div className="text-zinc-200">${(workOrder.laborCost || 0).toFixed(2)}</div>
            <div className="text-zinc-400">Parts</div><div className="text-zinc-200">${(workOrder.partCosts || 0).toFixed(2)}</div>
          </>
        )}
        <div className="text-zinc-400">Tax</div><div className="text-zinc-200">${(t.tax || 0).toFixed(2)}</div>
        <div className="text-zinc-400">Total</div><div className="text-zinc-200">${(t.total || 0).toFixed(2)}</div>
        <div className="text-zinc-400">Remaining</div><div className="text-zinc-200">${(t.remaining || 0).toFixed(2)}</div>
      </div>

      <div className="mt-3">
        <button className="w-full px-3 py-2 rounded bg-neon-green text-zinc-900 font-semibold hover:brightness-110" onClick={() => onCheckout()}>Checkout</button>
      </div>
    </div>
  );
}

export default PaymentPanel;
