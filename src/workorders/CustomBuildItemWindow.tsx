import React, { useEffect, useMemo, useState } from 'react';

export type CustomBuildItemPayload = {
  title?: string;
  item?: {
    description?: string;
    price?: number;
    isParts?: boolean;
  } | null;
};

export type CustomBuildItemResult = {
  description: string;
  price: number;
  isParts: boolean;
};

function parsePayload(): CustomBuildItemPayload {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('customBuildItem');
    if (!raw) return {};
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return {};
  }
}

function sanitizeMoneyInput(raw: string): string {
  const cleaned = String(raw || '')
    .replace(/[^0-9.]/g, '')
    .replace(/(\..*?)\..*/g, '$1');
  return cleaned.slice(0, 12);
}

function asMoney(raw: string): number {
  const n = parseFloat(String(raw || '0'));
  const v = Number.isFinite(n) && n >= 0 ? n : 0;
  return Math.round(v * 100) / 100;
}

const CustomBuildItemWindow: React.FC = () => {
  const payload = useMemo(() => parsePayload(), []);
  const existing = payload?.item || null;

  const [description, setDescription] = useState<string>(String(existing?.description || ''));
  const [priceStr, setPriceStr] = useState<string>(
    existing?.price != null && Number.isFinite(Number(existing.price)) ? Number(existing.price).toFixed(2) : '0.00'
  );
  const [isParts, setIsParts] = useState<boolean>(existing?.isParts !== false);

  const price = useMemo(() => asMoney(priceStr), [priceStr]);
  const canSave = description.trim().length > 0 && price >= 0;

  useEffect(() => {
    try {
      document.title = payload?.title ? String(payload.title) : 'Custom Build Item';
    } catch {}
  }, [payload?.title]);

  function save() {
    if (!canSave) return;
    const res: CustomBuildItemResult = {
      description: description.trim(),
      price,
      isParts,
    };
    (window as any).api?._emitCustomBuildItemSave?.(res);
  }

  function cancel() {
    (window as any).api?._emitCustomBuildItemCancel?.();
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-900 text-zinc-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-[#39FF14]">{payload?.title || 'Line Item'}</div>
          <div className="text-xs text-zinc-400">Custom PC Build</div>
        </div>
        <button className="px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm" onClick={cancel}>Close</button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Description</label>
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neon-green"
            placeholder="e.g. RTX 4070 SUPER, 32GB DDR5 RAM, Assembly labor"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Price</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neon-green"
              value={priceStr}
              onChange={(e) => setPriceStr(sanitizeMoneyInput(e.target.value))}
              inputMode="decimal"
            />
            <div className="text-[11px] text-zinc-500 mt-1">Saved as ${price.toFixed(2)}</div>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input
                className="scale-95"
                type="checkbox"
                checked={isParts}
                onChange={(e) => setIsParts(e.target.checked)}
              />
              This is a parts line item (taxed)
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="px-4 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm" onClick={cancel}>Cancel</button>
          <button
            className={`px-4 py-2 rounded text-sm font-semibold ${canSave ? 'bg-neon-green text-zinc-900 hover:brightness-110' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
            onClick={save}
            disabled={!canSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomBuildItemWindow;
