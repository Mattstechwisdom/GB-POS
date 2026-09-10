import React, { useEffect, useMemo, useState } from 'react';
import MoneyInput from '../components/MoneyInput';

export type CustomBuildItemPayload = {
  title?: string;
  item?: Partial<CustomBuildItemResult> | null;
};

export type CustomBuildItemResult = {
  description: string;
  itemType: 'part' | 'labor';
  quantity: number;
  price: number;
  internalCost?: number;
  partSource?: string;
  distributorSku?: string;
  orderSourceUrl?: string;
  orderStatus?: 'needed' | 'ordered' | 'received' | 'in_stock';
  orderDate?: string;
  estimatedDeliveryDate?: string;
  trackingUrl?: string;
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

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const CustomBuildItemWindow: React.FC = () => {
  const payload = useMemo(() => parsePayload(), []);
  const existing = payload?.item || null;

  const [description, setDescription] = useState<string>(String(existing?.description || ''));
  const [price, setPrice] = useState<number>(
    existing?.price != null && Number.isFinite(Number(existing.price)) ? round2(Number(existing.price)) : 0
  );
  const [itemType, setItemType] = useState<'part' | 'labor'>(existing?.itemType === 'labor' ? 'labor' : 'part');
  const [quantity, setQuantity] = useState(Math.max(1, Number(existing?.quantity || 1) || 1));
  const [internalCost, setInternalCost] = useState(Math.max(0, Number(existing?.internalCost || 0) || 0));
  const [partSource, setPartSource] = useState(String(existing?.partSource || ''));
  const [distributorSku, setDistributorSku] = useState(String(existing?.distributorSku || ''));
  const [orderSourceUrl, setOrderSourceUrl] = useState(String(existing?.orderSourceUrl || ''));
  const [orderStatus, setOrderStatus] = useState<CustomBuildItemResult['orderStatus']>(existing?.orderStatus || 'in_stock');
  const [orderDate, setOrderDate] = useState(String(existing?.orderDate || ''));
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState(String(existing?.estimatedDeliveryDate || ''));
  const [trackingUrl, setTrackingUrl] = useState(String(existing?.trackingUrl || ''));

  const validUrl = (value: string) => !value.trim() || /^https?:\/\//i.test(value.trim());
  const canSave = description.trim().length > 0 && price >= 0 && quantity > 0
    && (itemType === 'labor' || (validUrl(orderSourceUrl) && validUrl(trackingUrl)));

  useEffect(() => {
    try {
      document.title = payload?.title ? String(payload.title) : 'Custom Build Item';
    } catch {}
  }, [payload?.title]);

  function save() {
    if (!canSave) return;
    const res: CustomBuildItemResult = {
      description: description.trim(),
      itemType,
      quantity: itemType === 'part' ? quantity : 1,
      price,
      ...(itemType === 'part' ? {
        internalCost,
        partSource: partSource.trim(),
        distributorSku: distributorSku.trim(),
        orderSourceUrl: orderSourceUrl.trim(),
        orderStatus,
        orderDate,
        estimatedDeliveryDate,
        trackingUrl: trackingUrl.trim(),
      } : {}),
    };
    (window as any).api?._emitCustomBuildItemSave?.(res);
  }

  function cancel() {
    (window as any).api?._emitCustomBuildItemCancel?.();
  }

  return (
    <div className="h-screen w-screen overflow-y-auto bg-zinc-900 text-zinc-100 p-4">
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
            <label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Line type</label>
            <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" value={itemType} onChange={(e) => setItemType(e.target.value as 'part' | 'labor')}>
              <option value="part">Part (taxed)</option>
              <option value="labor">Labor (not taxed)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Customer price</label>
            <MoneyInput
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neon-green"
              value={price}
              onValueChange={(v) => setPrice(round2(Number(v || 0)))}
            />
            <div className="text-[11px] text-zinc-500 mt-1">Saved as ${price.toFixed(2)}</div>
          </div>

        </div>

        {itemType === 'part' ? (
          <div className="grid grid-cols-2 gap-3 rounded border border-zinc-700 bg-zinc-950/30 p-3">
            <div><label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Quantity</label><input type="number" min="1" step="1" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} /></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Internal cost</label><MoneyInput className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" value={internalCost} onValueChange={(v) => setInternalCost(round2(Number(v || 0)))} /></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Supplier / distributor</label><input className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" value={partSource} onChange={(e) => setPartSource(e.target.value)} /></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Supplier SKU</label><input className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" value={distributorSku} onChange={(e) => setDistributorSku(e.target.value)} /></div>
            <div className="col-span-2"><label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Order URL</label><input type="url" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" placeholder="https://supplier.example/item" value={orderSourceUrl} onChange={(e) => setOrderSourceUrl(e.target.value)} /></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Order status</label><select className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" value={orderStatus} onChange={(e) => setOrderStatus(e.target.value as CustomBuildItemResult['orderStatus'])}><option value="in_stock">In stock</option><option value="needed">Needs ordering</option><option value="ordered">Ordered</option><option value="received">Received</option></select></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Ordered date</label><input type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Estimated delivery</label><input type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" value={estimatedDeliveryDate} onChange={(e) => setEstimatedDeliveryDate(e.target.value)} /></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Tracking URL</label><input type="url" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} /></div>
          </div>
        ) : null}

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
