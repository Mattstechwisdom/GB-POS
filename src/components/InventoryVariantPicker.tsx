import React, { useMemo } from 'react';
import { inventoryVariantAttributes, inventoryVariantsForParent } from '../lib/inventoryVariants';

type Props = {
  parentId: number;
  products: any[];
  onSelect: (product: any) => void;
  onClose: () => void;
};

export default function InventoryVariantPicker({ parentId, products, onSelect, onClose }: Props) {
  const variants = useMemo(() => inventoryVariantsForParent(products, parentId), [parentId, products]);
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-label="Choose exact inventory variant">
    <section className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#BC13FE]/70 bg-zinc-950 text-white shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 p-4"><div><h2 className="text-lg font-bold">Choose Exact Part Used</h2><p className="text-xs text-zinc-400">Select the color/type physically installed so inventory reports correctly.</p></div><button type="button" onClick={onClose} className="rounded border border-zinc-600 px-3 py-2">Close</button></header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {!variants.length ? <div className="rounded border border-amber-700 bg-amber-950/50 p-4 text-sm text-amber-100">This parent part has no variants yet. Add stocked variants in Inventory first.</div> : variants.map((variant) => {
          const attributes = inventoryVariantAttributes(variant);
          const inStock = !variant.trackStock || Number(variant.stockCount || 0) > 0;
          return <button key={variant.id} type="button" disabled={!inStock} onClick={() => onSelect(variant)} className="w-full rounded border border-zinc-700 bg-zinc-900 p-3 text-left hover:border-[#39FF14] disabled:cursor-not-allowed disabled:opacity-50">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold">{variant.itemDescription || 'Inventory variant'}</div><div className="mt-1 flex flex-wrap gap-1">{Object.entries(attributes).map(([key, value]) => <span key={key} className="rounded bg-[#BC13FE]/15 px-2 py-0.5 text-xs text-fuchsia-100">{key}: {value}</span>)}</div><div className="mt-2 text-xs text-zinc-500">SKU {variant.distributorSku || '—'} · {variant.distributor || 'No vendor'}</div></div><div className="shrink-0 text-right"><div className="font-mono font-bold text-[#39FF14]">${Number(variant.price || 0).toFixed(2)}</div><div className={inStock ? 'text-xs text-zinc-400' : 'text-xs text-red-300'}>{variant.trackStock ? `${Number(variant.stockCount || 0)} in stock` : 'Stock not tracked'}</div></div></div>
          </button>;
        })}
      </div>
    </section>
  </div>;
}
