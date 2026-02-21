import React, { useMemo, useState } from 'react';
import ContextMenu, { ContextMenuItem } from '@/components/ContextMenu';
import { useContextMenu } from '@/lib/useContextMenu';
import type { CustomBuildItemResult } from './CustomBuildItemWindow';

export type WorkOrderItemRow = {
  id: string;
  device: string;
  repair: string;
  parts: number;
  labor: number;
  status?: string;
  note?: string;
};

interface Props {
  items: WorkOrderItemRow[];
  onChange: (items: WorkOrderItemRow[]) => void;
}

function newId(): string {
  try {
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(n: any) {
  const v = Number(n || 0);
  return Number.isFinite(v) && v > 0 ? `$${v.toFixed(2)}` : '';
}

const CustomBuildItemsTable: React.FC<Props> = ({ items, onChange }) => {
  const [selected, setSelected] = useState<string | null>(items[0]?.id || null);

  const ctx = useContextMenu<WorkOrderItemRow>();
  const ctxRow = ctx.state.data;

  async function openEditor(title: string, existing?: WorkOrderItemRow | null): Promise<CustomBuildItemResult | null> {
    const api: any = (window as any).api;
    if (!api?.openCustomBuildItem) {
      alert('Custom Build item editor requires the desktop app.');
      return null;
    }

    const payload = {
      title,
      item: existing
        ? {
            description: existing.repair,
            price: existing.parts > 0 ? existing.parts : existing.labor,
            isParts: (existing.parts || 0) > 0,
          }
        : null,
    };

    const res = await api.openCustomBuildItem(payload);
    return res || null;
  }

  async function addItem() {
    const res = await openEditor('Add Line Item', null);
    if (!res) return;

    const row: WorkOrderItemRow = {
      id: newId(),
      device: 'Custom PC Build',
      repair: res.description,
      parts: res.isParts ? Number(res.price || 0) : 0,
      labor: res.isParts ? 0 : Number(res.price || 0),
      status: 'pending',
    };

    onChange([...(items || []), row]);
    setSelected(row.id);
  }

  async function editItem(row: WorkOrderItemRow) {
    const res = await openEditor('Edit Line Item', row);
    if (!res) return;

    const next: WorkOrderItemRow = {
      ...row,
      repair: res.description,
      parts: res.isParts ? Number(res.price || 0) : 0,
      labor: res.isParts ? 0 : Number(res.price || 0),
    };

    onChange(items.map((it) => (it.id === row.id ? next : it)));
  }

  function removeItem(row: WorkOrderItemRow) {
    onChange(items.filter((it) => it.id !== row.id));
    if (selected === row.id) setSelected(null);
  }

  function duplicateItem(row: WorkOrderItemRow) {
    const copy: WorkOrderItemRow = { ...row, id: newId() };
    onChange([...(items || []), copy]);
    setSelected(copy.id);
  }

  const ctxItems = useMemo<ContextMenuItem[]>(() => {
    if (!ctxRow) return [];
    return [
      { type: 'header', label: ctxRow.repair || 'Line Item' },
      { label: 'Edit…', onClick: () => editItem(ctxRow) },
      { label: 'Duplicate', onClick: () => duplicateItem(ctxRow) },
      { type: 'separator' },
      { label: 'Remove…', danger: true, onClick: () => removeItem(ctxRow) },
    ];
  }, [ctxRow, items]);

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-zinc-200">Build Line Items</h4>
        <div className="text-xs text-zinc-400">Parts are taxed • Labor is not</div>
      </div>

      <div className="overflow-y-auto border border-zinc-800 rounded" style={{ maxHeight: '14rem' }}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="px-2 py-1 text-left font-semibold">Description</th>
              <th className="px-2 py-1 text-right font-semibold">Parts</th>
              <th className="px-2 py-1 text-right font-semibold">Labor</th>
            </tr>
          </thead>
          <tbody>
            {(items || []).map((it) => {
              const isSel = selected === it.id;
              return (
                <tr
                  key={it.id}
                  onClick={() => setSelected(it.id)}
                  onDoubleClick={() => editItem(it)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    ctx.openFromEvent(e, it);
                  }}
                  className={`cursor-pointer transition-colors border-l-4 ${
                    isSel
                      ? 'border-[#39FF14] bg-zinc-800/80 shadow-[inset_0_0_0_1px_#1f1f21,0_0_5px_1px_rgba(57,255,20,0.25)]'
                      : 'border-transparent hover:bg-zinc-800/60'
                  }`}
                >
                  <td className="px-2 py-1 font-medium overflow-hidden text-ellipsis">{it.repair}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(it.parts)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(it.labor)}</td>
                </tr>
              );
            })}
            {(!items || items.length === 0) && (
              <tr>
                <td colSpan={3} className="px-2 py-8 text-center text-zinc-500">
                  No line items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 mt-2">
        <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded" onClick={addItem}>
          Add line item
        </button>
        <button
          className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded disabled:opacity-50"
          onClick={() => {
            const row = items.find((x) => x.id === selected);
            if (row) editItem(row);
          }}
          disabled={!selected}
        >
          Edit selected
        </button>
        <button
          className="px-3 py-1 bg-red-700 text-white rounded disabled:opacity-50"
          onClick={() => {
            const row = items.find((x) => x.id === selected);
            if (row) removeItem(row);
          }}
          disabled={!selected}
        >
          Remove selected
        </button>
      </div>

      <ContextMenu
        id="custom-build-items-ctx"
        open={ctx.state.open}
        x={ctx.state.x}
        y={ctx.state.y}
        items={ctxItems}
        onClose={ctx.close}
      />
    </div>
  );
};

export default CustomBuildItemsTable;
