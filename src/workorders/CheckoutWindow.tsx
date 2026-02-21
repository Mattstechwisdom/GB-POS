import React, { useEffect, useState, useMemo } from 'react';

export type PaymentType = "Cash" | "Card" | "Apple Pay" | "Google Pay" | "Other";

type CheckoutPayFor = 'both' | 'parts' | 'labor';

export interface CheckoutResult {
  amountDue: number;
  /** Applied to the balance (what counts toward amountDue). */
  amountPaid: number;
  /** Cash received from customer (tendered). For non-cash, equals amountPaid. */
  tendered?: number;
  changeDue: number;
  paymentType: PaymentType;
  payFor?: CheckoutPayFor;
  appliedParts?: number;
  appliedLabor?: number;
  closeParent: boolean;
  printReceipt: boolean;
  markClosed: boolean;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parsePayload(): { amountDue: number; partsDue?: number; laborDue?: number; title?: string } | null {
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
  const originalAmountDue = payload?.amountDue ?? 0;
  const partsDue = Number(payload?.partsDue || 0) || 0;
  const laborDue = Number(payload?.laborDue || 0) || 0;
  const hasPayFor = partsDue > 0 || laborDue > 0;

  const [payFor, setPayFor] = useState<CheckoutPayFor>('both');
  const [cashReceived, setCashReceived] = useState<string>('0.00');
  const [cashEdited, setCashEdited] = useState<boolean>(false);
  const [paymentType, setPaymentType] = useState<PaymentType | ''>('');
  const [closeParent, setCloseParent] = useState(true);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [markClosed, setMarkClosed] = useState(false);

  const payPartsChecked = !hasPayFor ? true : (payFor === 'both' || payFor === 'parts');
  const payLaborChecked = !hasPayFor ? true : (payFor === 'both' || payFor === 'labor');
  const payBothChecked = !hasPayFor ? true : (payFor === 'both');

  function setPayParts(next: boolean) {
    if (!hasPayFor) return;
    const labor = payLaborChecked;
    if (next && labor) setPayFor('both');
    else if (next) setPayFor('parts');
    else if (labor) setPayFor('labor');
  }

  function setPayLabor(next: boolean) {
    if (!hasPayFor) return;
    const parts = payPartsChecked;
    if (next && parts) setPayFor('both');
    else if (next) setPayFor('labor');
    else if (parts) setPayFor('parts');
  }

  function setPayBoth(next: boolean) {
    if (!hasPayFor) return;
    if (next) setPayFor('both');
    else {
      // keep at least one selected; default to parts if available else labor
      if (partsDue > 0) setPayFor('parts');
      else if (laborDue > 0) setPayFor('labor');
      else setPayFor('both');
    }
  }

  const selectedDue = useMemo(() => {
    const remaining = Number(originalAmountDue || 0) || 0;
    if (!hasPayFor) return remaining;
    if (payFor === 'parts') return round2(Math.min(partsDue || 0, remaining));
    if (payFor === 'labor') return round2(Math.min(laborDue || 0, remaining));
    return remaining;
  }, [originalAmountDue, hasPayFor, payFor, partsDue, laborDue]);

  const numericCashReceived = useMemo(() => {
    const n = parseFloat(cashReceived || '0');
    return Number.isFinite(n) && n >= 0 ? parseFloat(n.toFixed(2)) : 0;
  }, [cashReceived]);

  const isCash = (paymentType as any) === 'Cash';
  const tendered = isCash ? numericCashReceived : undefined;
  const changeDue = isCash ? Math.max(numericCashReceived - selectedDue, 0) : 0;
  const appliedPaid = selectedDue;
  const canSave = !!paymentType && (!hasPayFor || selectedDue > 0) && (isCash ? numericCashReceived >= selectedDue : true);

  const allocation = useMemo(() => {
    if (!hasPayFor) return { appliedParts: undefined as any, appliedLabor: undefined as any };

    if (payFor === 'parts') return { appliedParts: round2(appliedPaid), appliedLabor: 0 };
    if (payFor === 'labor') return { appliedParts: 0, appliedLabor: round2(appliedPaid) };

    // Both: allocate parts first (parts includes tax), remainder to labor.
    const p = round2(Math.min(appliedPaid, Math.max(0, partsDue || 0)));
    const l = round2(Math.max(0, appliedPaid - p));
    return { appliedParts: p, appliedLabor: l };
  }, [hasPayFor, payFor, appliedPaid, partsDue]);

  function save() {
    if (!canSave) return;
    const result: CheckoutResult = {
      amountDue: selectedDue,
      amountPaid: appliedPaid,
      ...(isCash ? { tendered } : {}),
      changeDue,
      paymentType: paymentType as PaymentType,
      payFor: hasPayFor ? payFor : undefined,
      appliedParts: hasPayFor ? allocation.appliedParts : undefined,
      appliedLabor: hasPayFor ? allocation.appliedLabor : undefined,
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
    setCashReceived(originalAmountDue.toFixed(2));
  }, []);

  useEffect(() => {
    // When the selected due changes, default the input fields (unless user edited).
    if (paymentType === 'Cash' && !cashEdited) setCashReceived(selectedDue.toFixed(2));
  }, [selectedDue, cashEdited, paymentType]);

  useEffect(() => {
    // When switching to cash, default cash received to amount due (but don't fight user edits for non-cash).
    if (paymentType === 'Cash') {
      setCashReceived(prev => {
        if (cashEdited) return prev;
        return (prev && prev !== '0' && prev !== '0.00') ? prev : selectedDue.toFixed(2);
      });
    }
  }, [paymentType, selectedDue, cashEdited]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-900 text-zinc-200 font-sans select-none">
      <div className="h-full p-2 flex flex-col gap-2 text-[13px] leading-tight">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{payload?.title ? String(payload.title) : 'Checkout'}</h2>
          <div className="text-[11px] text-zinc-400">
            Due <span className="text-neon-green font-semibold">${selectedDue.toFixed(2)}</span>
          </div>
        </div>

        {hasPayFor && (
          <div className="bg-zinc-950/30 border border-zinc-800 rounded p-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Paying for</div>
              <div className="text-[11px] text-zinc-400">
                <span className="mr-3">Parts: <span className="text-zinc-200 font-semibold">${partsDue.toFixed(2)}</span></span>
                <span>Labor: <span className="text-zinc-200 font-semibold">${laborDue.toFixed(2)}</span></span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 text-[12px]">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={payPartsChecked} onChange={(e) => setPayParts(e.target.checked)} />
                Parts
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={payLaborChecked} onChange={(e) => setPayLabor(e.target.checked)} />
                Labor
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={payBothChecked} onChange={(e) => setPayBoth(e.target.checked)} />
                Both
              </label>
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">Use this for partial payments (e.g. pay parts now, labor later).</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {isCash ? (
            <div className="col-span-2">
              <label className="block text-[9px] uppercase tracking-wide text-zinc-500 mb-0.5">Cash received</label>
              <input
                inputMode="decimal"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-neon-green"
                value={cashReceived}
                onChange={e => {
                  setCashEdited(true);
                  setCashReceived(e.target.value.replace(/[^0-9.]/g,'').replace(/(\..*?)\..*/,'$1'));
                }}
              />
              <div className="text-[10px] text-zinc-500 mt-1">Applied to balance: <span className="text-zinc-200 font-semibold">${appliedPaid.toFixed(2)}</span></div>
            </div>
          ) : (
            <div className="col-span-2">
              <label className="block text-[9px] uppercase tracking-wide text-zinc-500 mb-0.5">Amount to apply</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                value={selectedDue.toFixed(2)}
                readOnly
              />
            </div>
          )}

          {isCash && (
            <div>
              <label className="block text-[9px] uppercase tracking-wide text-zinc-500 mb-0.5">Change due</label>
              <input className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1" value={changeDue.toFixed(2)} readOnly />
            </div>
          )}
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
