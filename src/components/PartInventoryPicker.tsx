import React, { useEffect, useMemo, useState } from 'react';

export type InventoryPartSelection = {
  id?: number;
  itemDescription?: string;
  category?: string;
  deviceModel?: string;
  partCategory?: string;
  condition?: string;
  price?: number;
  internalCost?: number;
  markupPct?: number | string;
  distributor?: string;
  distributorSku?: string;
  reorderUrlTemplate?: string;
  vendorTaxExempt?: boolean;
  stockCount?: number;
};

type Props = {
  onSelect: (part: InventoryPartSelection) => void;
  onClose: () => void;
};

export default function PartInventoryPicker({ onSelect, onClose }: Props) {
  const [parts, setParts] = useState<InventoryPartSelection[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await (window as any).api?.dbGet?.('products');
        if (!active) return;
        setParts((Array.isArray(rows) ? rows : []).filter((row: any) => String(row?.itemType || 'Product') === 'Part'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter((part) => !q || [part.itemDescription, part.category, part.deviceModel, part.partCategory, part.distributor, part.distributorSku]
      .some((value) => String(value || '').toLowerCase().includes(q)));
  }, [parts, search]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3" role="dialog" aria-modal="true" aria-label="Select inventory part">
      <section className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-zinc-800 p-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Select Part</h2>
            <p className="text-xs text-zinc-500">Choose a synced inventory part for this repair.</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded border border-zinc-700 bg-zinc-900 text-lg" aria-label="Close part selection">X</button>
        </header>
        <div className="border-b border-zinc-800 p-3">
          <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search part, model, type, vendor, or SKU" className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[#39FF14]" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? <div className="py-12 text-center text-zinc-500">Loading parts...</div> : null}
          {!loading && !visible.length ? <div className="py-12 text-center text-zinc-500">No matching parts found.</div> : null}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {visible.map((part, index) => (
              <button key={part.id ?? `${part.itemDescription}-${index}`} type="button" onClick={() => onSelect(part)} className="min-w-0 rounded border border-zinc-800 bg-zinc-900 p-3 text-left hover:border-[#39FF14]">
                <div className="truncate font-semibold">{part.itemDescription || 'Unnamed part'}</div>
                <div className="mt-1 truncate text-xs text-zinc-400">{[part.category, part.deviceModel, part.partCategory, part.condition].filter(Boolean).join(' | ')}</div>
                <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-zinc-500">{part.distributor || 'No vendor'}</span>
                  <span className="font-semibold text-[#39FF14]">${Number(part.price || 0).toFixed(2)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
