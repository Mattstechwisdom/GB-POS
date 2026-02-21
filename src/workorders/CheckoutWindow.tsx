import React, { useEffect, useState, useMemo } from 'react';

export type PaymentType = "Cash" | "Card" | "Apple Pay" | "Google Pay" | "Other";
export interface CheckoutResult {
  amountDue: number;
  amountPaid: number;
  changeDue: number;
  paymentType: PaymentType;
  closeParent: boolean;
  printReceipt: boolean;
  markClosed: boolean;
}

function parsePayload(): { amountDue: number } | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('checkout');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch { return null; }
}

const paymentTypes: PaymentType[] = ["Cash", "Card", "Apple Pay", "Google Pay", "Other"];

const CheckoutWindow: React.FC = () => {
  const payload = parsePayload();
  const amountDue = payload?.amountDue ?? 0;
  const [amountPaid, setAmountPaid] = useState<string>('0.00');
  const [paymentType, setPaymentType] = useState<PaymentType | ''>('');
  const [closeParent, setCloseParent] = useState(true);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [markClosed, setMarkClosed] = useState(false);

  const numericPaid = useMemo(() => {
    const n = parseFloat(amountPaid || '0');
    return Number.isFinite(n) && n >= 0 ? parseFloat(n.toFixed(2)) : 0;
  }, [amountPaid]);
  const changeDue = Math.max(numericPaid - amountDue, 0);
  const canSave = paymentType && numericPaid >= amountDue;

  function save() {
    if (!canSave) return;
    const result: CheckoutResult = {
      amountDue,
      amountPaid: numericPaid,
      changeDue,
      paymentType: paymentType as PaymentType,
      closeParent,
      printReceipt,
      markClosed,
    };
    (window as any).api._emitCheckoutSave(result); // will be bridged via ipc send
  }
  function cancel() {
    (window as any).api._emitCheckoutCancel();
  }

  useEffect(() => {
    // ensure initial formatting
    setAmountPaid(amountDue.toFixed(2));
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-900 text-zinc-200 font-sans select-none">
      <div className="h-full p-2 flex flex-col gap-2 text-[13px] leading-tight">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Checkout</h2>
          <div className="text-[11px] text-zinc-400">
            Due <span className="text-neon-green font-semibold">${amountDue.toFixed(2)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="block text-[9px] uppercase tracking-wide text-zinc-500 mb-0.5">Amount paid</label>
            <input
              inputMode="decimal"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-neon-green"
              value={amountPaid}
              onChange={e => setAmountPaid(e.target.value.replace(/[^0-9.]/g,'').replace(/(\..*?)\..*/,'$1'))}
            />
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wide text-zinc-500 mb-0.5">Change due</label>
            <input className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1" value={changeDue.toFixed(2)} readOnly />
          </div>
          <div>
            <label className="block text-[9px] uppercase tracking-wide text-zinc-500 mb-0.5">Payment type</label>
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-neon-green"
              value={paymentType}
              onChange={e => setPaymentType(e.target.value as PaymentType)}
            >
              <option value="">Select…</option>
              {paymentTypes.map(pt => <option key={pt} value={pt}>{pt}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <label className="flex items-center gap-2 cursor-pointer"><input className="scale-90" type="checkbox" checked={closeParent} onChange={e => setCloseParent(e.target.checked)} /> Close window</label>
          <label className="flex items-center gap-2 cursor-pointer"><input className="scale-90" type="checkbox" checked={printReceipt} onChange={e => setPrintReceipt(e.target.checked)} /> Print receipt</label>
          <label className="flex items-center gap-2 cursor-pointer col-span-2"><input className="scale-90" type="checkbox" checked={markClosed} onChange={e => setMarkClosed(e.target.checked)} /> Mark closed</label>
        </div>

        <div className="mt-auto flex justify-end gap-2">
          <button className="px-3 py-1.5 rounded bg-zinc-700 text-[11px]" onClick={cancel}>Cancel</button>
          <button
            className={`px-3 py-1.5 rounded text-[11px] font-semibold ${canSave ? 'bg-neon-green text-zinc-900 hover:brightness-110' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
            disabled={!canSave}
            onClick={save}
          >Save</button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutWindow;
