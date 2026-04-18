import React, { useEffect, useState, useMemo } from 'react';
import MoneyInput from '../components/MoneyInput';

export type PaymentType = "Cash" | "Cash + Card" | "Card" | "Apple Pay" | "Google Pay" | "Other";

type CheckoutPayFor = 'both' | 'parts' | 'labor';

export interface CheckoutResult {
  amountDue: number;
  /** Applied to the balance (what counts toward amountDue). */
  amountPaid: number;
  /** Cash received from customer (tendered). For non-cash, equals amountPaid. */
  tendered?: number;
  changeDue: number;
  paymentType: PaymentType;
  /** Optional split tender detail; callers should prefer this when present. */
  payments?: Array<{ paymentType: PaymentType; applied: number; amount: number; tendered?: number; change?: number }>;
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

const paymentTypes: PaymentType[] = ["Cash", "Cash + Card", "Card", "Apple Pay", "Google Pay", "Other"];

const CheckoutWindow: React.FC = () => {
  const payload = parsePayload();
  const originalAmountDue = payload?.amountDue ?? 0;
  const partsDue = Number(payload?.partsDue || 0) || 0;
  const laborDue = Number(payload?.laborDue || 0) || 0;
  const hasPayFor = partsDue > 0 || laborDue > 0;

  const [payFor, setPayFor] = useState<CheckoutPayFor>('both');
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [cashEdited, setCashEdited] = useState<boolean>(false);
  const [amountToApply, setAmountToApply] = useState<number>(0);
  const [applyEdited, setApplyEdited] = useState<boolean>(false);
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
    const n = Number(cashReceived || 0);
    return Number.isFinite(n) && n >= 0 ? round2(n) : 0;
  }, [cashReceived]);

  const numericAmountToApply = useMemo(() => {
    const n = Number(amountToApply || 0);
    return Number.isFinite(n) && n >= 0 ? round2(n) : 0;
  }, [amountToApply]);

  const isSplit = (paymentType as any) === 'Cash + Card';
  const isCashOnly = (paymentType as any) === 'Cash';
  const isCashLike = isCashOnly || isSplit;

  const nonCashApplied = round2(Math.min(numericAmountToApply, Math.max(0, selectedDue)));
  const cashApplied = isCashLike ? round2(Math.min(numericCashReceived, Math.max(0, selectedDue))) : 0;
  const cardRemainder = isSplit ? round2(Math.max(0, round2(selectedDue) - cashApplied)) : 0;
  const appliedPaid = isSplit
    ? round2(Math.max(0, selectedDue))
    : (isCashOnly ? cashApplied : nonCashApplied);
  const tendered = isCashLike ? numericCashReceived : undefined;
  const changeDue = isCashOnly ? Math.max(numericCashReceived - cashApplied, 0) : 0;
  const canSave = !!paymentType
    && appliedPaid > 0
    && appliedPaid <= selectedDue + 0.0001
    && (!hasPayFor || selectedDue > 0)
    && (isCashLike ? numericCashReceived >= cashApplied : true)
    && (!isSplit || (cashApplied > 0 && cardRemainder > 0));

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
    const payments: Array<{ paymentType: PaymentType; applied: number; amount: number; tendered?: number; change?: number }> = [];
    if (isSplit) {
      payments.push({
        paymentType: 'Cash',
        applied: round2(cashApplied),
        amount: Number.isFinite(numericCashReceived) ? numericCashReceived : round2(cashApplied),
        tendered: Number.isFinite(numericCashReceived) ? numericCashReceived : round2(cashApplied),
        change: Number.isFinite(changeDue) ? round2(changeDue) : 0,
      });
      payments.push({
        paymentType: 'Card',
        applied: round2(cardRemainder),
        amount: round2(cardRemainder),
      });
    } else if (isCashOnly) {
      payments.push({
        paymentType: 'Cash',
        applied: round2(appliedPaid),
        amount: Number.isFinite(numericCashReceived) ? numericCashReceived : round2(appliedPaid),
        tendered: Number.isFinite(numericCashReceived) ? numericCashReceived : round2(appliedPaid),
        change: Number.isFinite(changeDue) ? round2(changeDue) : 0,
      });
    } else {
      payments.push({
        paymentType: paymentType as PaymentType,
        applied: round2(appliedPaid),
        amount: round2(appliedPaid),
      });
    }
    const result: CheckoutResult = {
      amountDue: selectedDue,
      amountPaid: appliedPaid,
      ...(isCashLike ? { tendered } : {}),
      changeDue,
      paymentType: paymentType as PaymentType,
      payments,
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
    setCashReceived(round2(originalAmountDue));
    setAmountToApply(round2(originalAmountDue));
  }, []);

  useEffect(() => {
    // When the selected due changes, default inputs unless user edited.
    if (!applyEdited && paymentType !== 'Cash + Card') setAmountToApply(round2(selectedDue));
    if (paymentType === 'Cash' && !cashEdited && !applyEdited) setCashReceived(round2(selectedDue));
  }, [selectedDue, cashEdited, paymentType, applyEdited]);

  useEffect(() => {
    if (!isSplit) return;
    if (numericCashReceived <= selectedDue) return;
    setCashReceived(round2(selectedDue));
  }, [isSplit, numericCashReceived, selectedDue]);

  useEffect(() => {
    // When switching to cash, default cash received to amount due (but don't fight user edits for non-cash).
    if (paymentType === 'Cash') {
      setCashReceived(prev => {
        if (cashEdited) return prev;
        return (Number(prev) > 0) ? prev : round2(appliedPaid || selectedDue);
      });
    }
  }, [paymentType, selectedDue, cashEdited, applyEdited, appliedPaid]);

  function onRootKeyDownCapture(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;
    const tag = (target as any).tagName as string | undefined;
    if (tag === 'TEXTAREA') return;
    if (tag === 'BUTTON') return;

    // Don't submit when focused on checkboxes (Enter toggles them).
    if (target instanceof HTMLInputElement) {
      const t = (target.type || '').toLowerCase();
      if (t === 'checkbox' || t === 'radio' || t === 'button' || t === 'submit') return;
    }

    if (!canSave) return;
    e.preventDefault();
    save();
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-900 text-zinc-200 font-sans select-none" onKeyDownCapture={onRootKeyDownCapture}>
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
          {isCashLike ? (
            <div className="col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] uppercase tracking-wide text-zinc-500 mb-0.5">Cash received</label>
                <MoneyInput
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-neon-green"
                  value={numericCashReceived}
                  onValueChange={(v) => {
                    setCashEdited(true);
                    const next = Number(v || 0);
                    const safe = Number.isFinite(next) ? Math.max(0, next) : 0;
                    setCashReceived(isSplit ? Math.min(safe, selectedDue) : safe);
                  }}
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-wide text-zinc-500 mb-0.5">{isSplit ? 'Card remainder' : 'Applied to balance'}</label>
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                  value={(isSplit ? cardRemainder : cashApplied).toFixed(2)}
                  readOnly
                />
              </div>
              <div className="col-span-2 text-[10px] text-zinc-500">
                {isSplit ? (
                  <>
                    Cash: <span className="text-zinc-200 font-semibold">${cashApplied.toFixed(2)}</span>
                    {' '}+ Card: <span className="text-zinc-200 font-semibold">${cardRemainder.toFixed(2)}</span>
                    {' '}= <span className="text-zinc-200 font-semibold">${selectedDue.toFixed(2)}</span>
                    {(selectedDue > 0 && numericCashReceived >= selectedDue) ? (
                      <span className="ml-2 text-amber-400">(Cash covers total — use Cash)</span>
                    ) : null}
                  </>
                ) : (
                  <>Applied to balance: <span className="text-zinc-200 font-semibold">${cashApplied.toFixed(2)}</span></>
                )}
              </div>
            </div>
          ) : (
            <div className="col-span-2">
              <label className="block text-[9px] uppercase tracking-wide text-zinc-500 mb-0.5">Amount to apply</label>
              <MoneyInput
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-neon-green"
                value={appliedPaid}
                onValueChange={(v) => {
                  setApplyEdited(true);
                  const next = Number(v || 0);
                  const safe = Number.isFinite(next) ? Math.max(0, Math.min(next, selectedDue)) : 0;
                  setAmountToApply(safe);
                }}
              />
              <div className="text-[10px] text-zinc-500 mt-1">Max: <span className="text-zinc-200 font-semibold">${selectedDue.toFixed(2)}</span></div>
            </div>
          )}

          {isCashLike && (
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
              onChange={e => {
                const next = e.target.value as PaymentType;
                setPaymentType(next);
                if (next === 'Cash + Card') {
                  setCashEdited(false);
                  setCashReceived(0);
                }
              }}
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
