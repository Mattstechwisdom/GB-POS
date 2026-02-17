import React, { useMemo, useState } from 'react';
import { computeTotals, round2 } from '@/lib/calc';

const TAX_RATE = 8;

function sanitizeMoneyInput(raw: string): string {
  const cleaned = String(raw || '')
    .replace(/[^0-9.]/g, '')
    .replace(/(\..*?)\..*/g, '$1');
  // avoid absurd long strings
  return cleaned.slice(0, 12);
}

function asMoney(raw: string): number {
  const n = parseFloat(String(raw || '0'));
  return Number.isFinite(n) && n >= 0 ? round2(n) : 0;
}

const QuickSaleWindow: React.FC = () => {
  const [description, setDescription] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('0.00');
  const [taxed, setTaxed] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);

  const amount = useMemo(() => asMoney(amountStr), [amountStr]);
  const taxRate = taxed ? TAX_RATE : 0;
  const totals = useMemo(
    () => computeTotals({ laborCost: 0, partCosts: amount, discount: 0, taxRate, amountPaid: 0 }),
    [amount, taxRate]
  );

  const canCheckout = !busy && description.trim().length > 0 && amount > 0;

  async function closeSelf() {
    try {
      const api = (window as any).api;
      if (api?.closeSelfWindow) await api.closeSelfWindow({ focusMain: true });
      else window.close();
    } catch {
      try { window.close(); } catch {}
    }
  }

  async function handleCheckout() {
    if (!canCheckout) return;
    setBusy(true);
    try {
      const api = (window as any).api;
      const amountDue = totals.total || 0;
      const result = await api.openCheckout({ amountDue });
      if (!result) return;

      const amountPaid = Number(result.amountPaid || 0) || 0;
      const paymentType = result.paymentType;
      const remainingAfter = round2(Math.max(0, amountDue - amountPaid));
      const shouldClose = remainingAfter <= 0 || !!result.markClosed;

      const now = new Date().toISOString();
      const itemRow = {
        id: (globalThis.crypto as any)?.randomUUID?.() || `qs-${Date.now()}`,
        description: description.trim(),
        qty: 1,
        price: amount,
      };

      const payments = (amountPaid > 0)
        ? [{ amount: amountPaid, paymentType: String(paymentType || ''), at: now }]
        : [];

      const saleRecord: any = {
        createdAt: now,
        updatedAt: now,
        customerId: 0,
        customerName: '',
        customerPhone: '',
        itemDescription: description.trim(),
        quantity: 1,
        price: amount,
        items: [itemRow],
        inStock: true,
        notes: 'Quick Sale',
        status: shouldClose ? 'closed' : 'open',
        assignedTo: 'Quick Sale',
        checkInAt: now,
        repairCompletionDate: null,
        checkoutDate: shouldClose ? now : null,
        discount: 0,
        amountPaid,
        paymentType,
        payments,
        taxRate,
        laborCost: 0,
        partCosts: amount,
        totals,
        total: totals.total,
      };

      const created = await api.dbAdd('sales', saleRecord);

      if (result.printReceipt) {
        try {
          const receiptPayload = {
            id: created?.id,
            customerId: 0,
            customerName: '',
            customerPhone: '',
            customerEmail: '',
            productCategory: 'Quick Sale',
            productDescription: description.trim(),
            items: [{ description: description.trim(), parts: amount, labor: 0, qty: 1 }],
            partCosts: amount,
            laborCost: 0,
            discount: 0,
            taxRate,
            totals,
            amountPaid,
          };
          if (api?.openCustomerReceipt) {
            await api.openCustomerReceipt({
              data: receiptPayload,
              autoPrint: true,
              silent: true,
              autoCloseMs: 900,
              show: false,
            });
          }
        } catch (e) {
          console.error('QuickSale receipt failed', e);
        }
      }

      try { window.opener?.postMessage({ type: 'sales:changed', customerId: 0 }, '*'); } catch {}
      if (result.closeParent) {
        await closeSelf();
      }
    } catch (e) {
      console.error('QuickSale checkout failed', e);
      alert('Checkout failed. See console.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 font-sans">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#39FF14]">Quick Sale</h1>
          <div className="text-xs text-zinc-400">Create a sale without customer info</div>
        </div>
        <button className="px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm" onClick={closeSelf}>
          Close
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 gap-4">
        <div className="bg-zinc-950/40 border border-zinc-800 rounded p-4 space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Description</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neon-green"
              placeholder="e.g. Phone charger, HDMI cable, screen protector"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Sale amount</label>
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neon-green"
                value={amountStr}
                onChange={(e) => setAmountStr(sanitizeMoneyInput(e.target.value))}
                inputMode="decimal"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input
                  className="scale-95"
                  type="checkbox"
                  checked={taxed}
                  onChange={(e) => setTaxed(e.target.checked)}
                />
                Taxed
                <span className="text-xs text-zinc-400">(8%)</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Subtotal</div>
              <div className="text-lg font-semibold">${totals.subTotal.toFixed(2)}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Tax</div>
              <div className="text-lg font-semibold">${totals.tax.toFixed(2)}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Total</div>
              <div className="text-lg font-semibold text-neon-green">${totals.total.toFixed(2)}</div>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button className="px-4 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm" onClick={closeSelf} disabled={busy}>
              Cancel
            </button>
            <button
              className={`px-4 py-2 rounded text-sm font-semibold ${canCheckout ? 'bg-neon-green text-zinc-900 hover:brightness-110' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
              onClick={handleCheckout}
              disabled={!canCheckout}
            >
              {busy ? 'Processing…' : 'Checkout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickSaleWindow;
