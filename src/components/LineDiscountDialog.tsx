import React, { useEffect, useState } from 'react';
import type { LineDiscount } from '@/lib/ticketAccounting';

export default function LineDiscountDialog({ title, gross, value, onClose, onApply }: {
  title: string;
  gross: number;
  value: LineDiscount;
  onClose: () => void;
  onApply: (discount: LineDiscount) => void;
}) {
  const [type, setType] = useState<'percent' | 'amount'>(value.discountType || 'percent');
  const [entered, setEntered] = useState(value.discountValue == null ? '' : String(value.discountValue));
  const number = Number(entered);
  const invalid = !Number.isFinite(number) || number < 0 || (type === 'percent' ? number > 100 : number > gross);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="fixed inset-0 z-[100300] flex items-center justify-center bg-black/75 p-3" onMouseDown={onClose}>
    <section className="w-full max-w-sm rounded-lg border border-violet-400/60 bg-zinc-950 p-4 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="line-discount-title" onMouseDown={event => event.stopPropagation()}>
      <h3 id="line-discount-title" className="text-lg font-semibold">Add Discount</h3>
      <p className="mt-1 truncate text-xs text-zinc-400" title={title}>{title} · ${gross.toFixed(2)}</p>
      <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Discount type">
        <button type="button" aria-pressed={type === 'percent'} className={`rounded border px-3 py-2 text-sm ${type === 'percent' ? 'border-violet-300 bg-violet-600' : 'border-zinc-700 bg-zinc-900'}`} onClick={() => setType('percent')}>Percentage</button>
        <button type="button" aria-pressed={type === 'amount'} className={`rounded border px-3 py-2 text-sm ${type === 'amount' ? 'border-violet-300 bg-violet-600' : 'border-zinc-700 bg-zinc-900'}`} onClick={() => setType('amount')}>Amount</button>
      </div>
      <label className="mt-3 block text-sm"><span className="mb-1 block text-zinc-300">{type === 'percent' ? 'Percent off' : 'Amount off'}</span><div className="flex items-center rounded border border-zinc-700 bg-zinc-900 px-3"><span className="text-zinc-500">{type === 'percent' ? '%' : '$'}</span><input autoFocus type="number" min="0" max={type === 'percent' ? 100 : gross} step={type === 'percent' ? 0.1 : 0.01} className="min-w-0 flex-1 bg-transparent px-2 py-2 outline-none" value={entered} onChange={event => setEntered(event.target.value)} /></div></label>
      {invalid && entered ? <p className="mt-2 text-xs text-red-300" role="alert">Enter {type === 'percent' ? 'a percentage from 0 to 100' : `an amount from $0.00 to $${gross.toFixed(2)}`}.</p> : null}
      <footer className="mt-4 flex flex-wrap justify-end gap-2">
        {value.discountType ? <button type="button" className="mr-auto rounded border border-red-500/70 px-3 py-2 text-sm text-red-200" onClick={() => onApply({})}>Remove Discount</button> : null}
        <button type="button" className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" onClick={onClose}>Cancel</button>
        <button type="button" disabled={invalid || entered === ''} className="rounded bg-[#39FF14] px-3 py-2 text-sm font-bold text-black disabled:opacity-50" onClick={() => onApply({ discountType: type, discountValue: number })}>Apply</button>
      </footer>
    </section>
  </div>;
}
