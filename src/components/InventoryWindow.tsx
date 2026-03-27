import React, { useEffect, useState, useCallback } from 'react';

type InventoryKind = 'product' | 'repair';
type FilterTab = 'all' | 'low' | 'products' | 'repairs';

interface InventoryRow {
  id: number;
  kind: InventoryKind;
  name: string;
  category: string;
  trackStock: boolean;
  stockCount: number | undefined;
  lowStockThreshold: number | undefined;
  orderSourceUrl?: string;
  // raw record for updates
  _raw: any;
}

function isLow(row: InventoryRow): boolean {
  return (
    row.trackStock &&
    typeof row.stockCount === 'number' &&
    row.stockCount <= (row.lowStockThreshold ?? 1)
  );
}

export default function InventoryWindow() {
  const api = (window as any).api;

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>('all');
  // inline editing state: { id+kind -> field -> value }
  const [edits, setEdits] = useState<Record<string, Partial<InventoryRow>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const rowKey = (r: Pick<InventoryRow, 'id' | 'kind'>) => `${r.kind}-${r.id}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [products, repairs] = await Promise.all([
        api.dbGet('products').catch(() => []),
        api.dbGet('repairCategories').catch(() => []),
      ]);

      const productRows: InventoryRow[] = (products as any[]).map((p: any) => ({
        id: p.id,
        kind: 'product',
        name: p.itemDescription || '(unnamed)',
        category: p.category || 'Other',
        trackStock: !!p.trackStock,
        stockCount: typeof p.stockCount === 'number' ? p.stockCount : undefined,
        lowStockThreshold: typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : undefined,
        orderSourceUrl: undefined,
        _raw: p,
      }));

      const repairRows: InventoryRow[] = (repairs as any[])
        .filter((r: any) => Number(r.partCost || 0) > 0)
        .map((r: any) => ({
        id: r.id,
        kind: 'repair',
        name: r.title || r.altDescription || '(unnamed)',
        category: r.category || r.repairCategory || 'Repair',
        trackStock: !!r.trackStock,
        stockCount: typeof r.stockCount === 'number' ? r.stockCount : undefined,
        lowStockThreshold: typeof r.lowStockThreshold === 'number' ? r.lowStockThreshold : undefined,
        orderSourceUrl: r.orderSourceUrl || '',
        _raw: r,
      }));

      setRows([...productRows, ...repairRows]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const filteredRows = rows.filter(r => {
    if (tab === 'low') return isLow(r);
    if (tab === 'products') return r.kind === 'product';
    if (tab === 'repairs') return r.kind === 'repair';
    return true;
  });

  // Build sorted category groups from the filtered rows
  const groups = (() => {
    const map = new Map<string, InventoryRow[]>();
    for (const r of filteredRows) {
      const cat = r.category || (r.kind === 'repair' ? 'Uncategorized' : 'Other');
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, rows]) => ({ category, rows }));
  })();

  const getEdit = (r: InventoryRow) => edits[rowKey(r)] ?? {};
  const mergedRow = (r: InventoryRow): InventoryRow => ({ ...r, ...getEdit(r) } as InventoryRow);

  const setField = (r: InventoryRow, field: keyof InventoryRow, value: any) => {
    const k = rowKey(r);
    setEdits(prev => ({ ...prev, [k]: { ...(prev[k] ?? {}), [field]: value } }));
  };

  const saveRow = async (r: InventoryRow) => {
    const k = rowKey(r);
    const pending = getEdit(r);
    if (Object.keys(pending).length === 0) return;
    setSaving(prev => ({ ...prev, [k]: true }));
    try {
      const collection = r.kind === 'product' ? 'products' : 'repairCategories';
      const merged = mergedRow(r);
      const updated = {
        ...r._raw,
        trackStock: merged.trackStock,
        stockCount: merged.stockCount,
        lowStockThreshold: merged.lowStockThreshold,
      };
      await api.dbUpdate(collection, r.id, updated);
      setEdits(prev => { const next = { ...prev }; delete next[k]; return next; });
      // Refresh the row in local state
      setRows(prev => prev.map(row =>
        row.id === r.id && row.kind === r.kind
          ? { ...row, ...pending, _raw: updated }
          : row
      ));
    } catch (err) {
      console.error('InventoryWindow saveRow error:', err);
    } finally {
      setSaving(prev => ({ ...prev, [k]: false }));
    }
  };

  const adjustStock = async (r: InventoryRow, delta: number) => {
    const current = mergedRow(r);
    const newCount = Math.max(0, (current.stockCount ?? 0) + delta);
    const k = rowKey(r);
    setSaving(prev => ({ ...prev, [k]: true }));
    try {
      const collection = r.kind === 'product' ? 'products' : 'repairCategories';
      const updated = { ...r._raw, stockCount: newCount };
      await api.dbUpdate(collection, r.id, updated);
      setRows(prev => prev.map(row =>
        row.id === r.id && row.kind === r.kind
          ? { ...row, stockCount: newCount, _raw: updated }
          : row
      ));
      setEdits(prev => {
        if (!prev[k]) return prev;
        const next = { ...prev[k] };
        delete (next as any).stockCount;
        return { ...prev, [k]: next };
      });
    } catch (err) {
      console.error('InventoryWindow adjustStock error:', err);
    } finally {
      setSaving(prev => ({ ...prev, [k]: false }));
    }
  };

  const lowCount = rows.filter(isLow).length;

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All Items' },
    { id: 'low', label: `⚠ Low Stock${lowCount > 0 ? ` (${lowCount})` : ''}` },
    { id: 'products', label: 'Products' },
    { id: 'repairs', label: 'Repairs' },
  ];

  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-700 shrink-0">
        <h1 className="text-xl font-bold tracking-wide">Inventory</h1>
        <button
          onClick={load}
          className="px-3 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded hover:bg-zinc-700"
        >
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-5 pt-3 pb-1 border-b border-zinc-700 shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm rounded-t font-medium transition-colors ${
              tab === t.id
                ? 'bg-zinc-700 border border-zinc-600 border-b-0 text-[#39FF14]'
                : 'text-zinc-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">Loading…</div>
      ) : filteredRows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
          {tab === 'low' ? 'No low-stock items.' : 'No items found.'}
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-5 py-3">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-zinc-400 text-xs uppercase border-b border-zinc-700">
                <th className="text-left pb-2 pr-3 font-medium w-[38%]">Item</th>
                <th className="text-center pb-2 pr-3 font-medium w-[10%]">Type</th>
                <th className="text-center pb-2 pr-3 font-medium w-[12%]">Track</th>
                <th className="text-center pb-2 pr-3 font-medium w-[16%]">Stock</th>
                <th className="text-center pb-2 pr-3 font-medium w-[12%]">Alert At</th>
                <th className="text-center pb-2 font-medium w-[12%]">Save</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ category: groupCat, rows: groupRows }) => (
                <React.Fragment key={groupCat}>
                  <tr className="bg-zinc-800/70 border-t border-zinc-700">
                    <td colSpan={6} className="px-3 py-1.5 text-xs font-semibold text-zinc-300 uppercase tracking-wide">
                      {groupCat}
                      <span className="ml-2 font-normal text-zinc-500 normal-case">({groupRows.length})</span>
                    </td>
                  </tr>
                  {groupRows.map(r => {
                const m = mergedRow(r);
                const k = rowKey(r);
                const low = isLow(m);
                const dirty = Object.keys(getEdit(r)).length > 0;
                const busy = !!saving[k];

                return (
                  <tr
                    key={k}
                    className={`transition-colors border-b border-zinc-800 ${
                      low
                        ? 'bg-red-950/40 hover:bg-red-950/60'
                        : 'hover:bg-zinc-800/50'
                    }`}
                  >
                    {/* Item name */}
                    <td className="py-2 pr-3">
                      <div className="font-medium truncate max-w-[300px]" title={m.name}>{m.name}</div>
                      {m.kind === 'repair' && m.orderSourceUrl && (
                        <a
                          href={m.orderSourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-xs text-blue-400 hover:underline truncate block max-w-[300px]"
                          title={m.orderSourceUrl}
                        >
                          {m.orderSourceUrl}
                        </a>
                      )}
                    </td>

                    {/* Type badge */}
                    <td className="py-2 pr-3 text-center">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${m.kind === 'product' ? 'bg-zinc-700 text-zinc-300' : 'bg-blue-900/60 text-blue-300'}`}>
                        {m.kind === 'product' ? 'Product' : 'Repair'}
                      </span>
                    </td>

                    {/* Track checkbox */}
                    <td className="py-2 pr-3 text-center">
                      <input
                        type="checkbox"
                        checked={!!m.trackStock}
                        onChange={e => setField(r, 'trackStock', e.target.checked)}
                        className="accent-[#39FF14] w-4 h-4"
                      />
                    </td>

                    {/* Stock count with +/- buttons */}
                    <td className="py-2 pr-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => adjustStock(r, -1)}
                          disabled={busy || !m.trackStock}
                          className="w-6 h-6 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                        >−</button>
                        <input
                          type="number"
                          min="0"
                          disabled={!m.trackStock || busy}
                          value={m.stockCount ?? ''}
                          onChange={e => setField(r, 'stockCount', e.target.value === '' ? undefined : Number(e.target.value))}
                          onBlur={() => saveRow(r)}
                          className={`w-14 text-center bg-zinc-800 border rounded px-1 py-0.5 text-sm focus:outline-none disabled:opacity-40 ${
                            low ? 'border-red-500 text-red-300' : 'border-zinc-600 focus:border-[#39FF14]'
                          }`}
                        />
                        <button
                          onClick={() => adjustStock(r, 1)}
                          disabled={busy || !m.trackStock}
                          className="w-6 h-6 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                        >+</button>
                      </div>
                    </td>

                    {/* Threshold */}
                    <td className="py-2 pr-3 text-center">
                      <input
                        type="number"
                        min="0"
                        disabled={!m.trackStock || busy}
                        value={m.lowStockThreshold ?? ''}
                        onChange={e => setField(r, 'lowStockThreshold', e.target.value === '' ? undefined : Number(e.target.value))}
                        onBlur={() => saveRow(r)}
                        className="w-14 text-center bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-sm focus:border-[#39FF14] focus:outline-none disabled:opacity-40"
                      />
                    </td>

                    {/* Save */}
                    <td className="py-2 text-center">
                      {dirty && (
                        <button
                          onClick={() => saveRow(r)}
                          disabled={busy}
                          className="px-2 py-0.5 text-xs bg-[#39FF14] text-black rounded font-semibold hover:bg-green-400 disabled:opacity-50"
                        >
                          {busy ? '…' : 'Save'}
                        </button>
                      )}
                      {busy && !dirty && (
                        <span className="text-xs text-zinc-500">…</span>
                      )}
                    </td>
                  </tr>
                );
              })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer summary */}
      {!loading && (
        <div className="shrink-0 px-5 py-2 border-t border-zinc-700 text-xs text-zinc-500 flex gap-4">
          <span>{rows.filter(r => r.kind === 'product').length} products</span>
          <span>{rows.filter(r => r.kind === 'repair').length} repair parts</span>
          <span>{rows.filter(r => r.trackStock).length} tracked</span>
          {lowCount > 0 && <span className="text-red-400 font-medium">{lowCount} low stock</span>}
        </div>
      )}
    </div>
  );
}
