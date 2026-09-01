import React, { useRef, useState, useEffect } from 'react';
import ContextMenu, { ContextMenuItem } from '@/components/ContextMenu';
import { useContextMenu } from '@/lib/useContextMenu';
import type { RepairItem } from '@/lib/types';
import { canDeleteRepairType, deleteRepair, deleteRepairType, repairContextMenuZIndex } from '@/lib/repairDeletion';

type RepairType = {
  id: number | string;
  name: string;
  definedId?: number | string;
  repairCount: number;
  source: 'defined' | 'recovered';
};

type RepairRow = {
  id?: number | string;
  repairCategory?: string;
  [key: string]: unknown;
};

type RepairTypeManagerProps = {
  onRepairEdit?: (repair: RepairItem) => void;
  onRepairDeleted?: (repairId: string | number) => void;
};

function normalizeName(value: unknown): string {
  return String(value || '').trim();
}

function serviceTypeKey(value: unknown): string {
  return normalizeName(value).toLowerCase();
}

function serviceTypeRank(value: unknown): number {
  const normalized = normalizeName(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  if (normalized === 'diagnostic' || normalized.startsWith('diagnostic ')) return 0;
  if (
    normalized === 'additional fees' ||
    normalized === 'additional fee' ||
    normalized.startsWith('additional fee ')
  ) return 1;
  return 2;
}

function compareServiceTypeNames(a: string, b: string): number {
  const rankDiff = serviceTypeRank(a) - serviceTypeRank(b);
  if (rankDiff !== 0) return rankDiff;
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

export default function RepairTypeManager({ onRepairEdit, onRepairDeleted }: RepairTypeManagerProps) {
  const [types, setTypes] = useState<RepairType[]>([]);
  const [repairRows, setRepairRows] = useState<RepairRow[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedTypeIds, setExpandedTypeIds] = useState<Set<number | string>>(new Set());
  const holdTimerRef = useRef<number | null>(null);

  const ctx = useContextMenu<RepairType>();
  const repairCtx = useContextMenu<RepairRow>();
  const contextMenuZIndex = repairContextMenuZIndex(typeof document !== 'undefined' && !!document.querySelector('[data-modal-shell="1"]'));

  async function reload() {
    const api = (window as any).api;
    const [typeList, repairList] = await Promise.all([
      api?.dbGet?.('repairTypes').catch(() => []),
      api?.dbGet?.('repairCategories').catch(() => []),
    ]);

    const repairs = Array.isArray(repairList) ? repairList : [];
    setRepairRows(repairs);

    const byName = new Map<string, RepairType>();
    const repairCounts = new Map<string, number>();

    repairs.forEach((row: RepairRow) => {
      const name = normalizeName(row?.repairCategory);
      if (!name) return;
      const key = serviceTypeKey(name);
      repairCounts.set(key, (repairCounts.get(key) || 0) + 1);
      if (!byName.has(key)) {
        byName.set(key, {
          id: `recovered:${key}`,
          name,
          repairCount: 0,
          source: 'recovered',
        });
      }
    });

    (Array.isArray(typeList) ? typeList : []).forEach((row: any) => {
      const name = normalizeName(row?.name);
      if (!name) return;
      const key = serviceTypeKey(name);
      byName.set(key, {
        id: row?.id ?? `defined:${key}`,
        definedId: row?.id,
        name,
        repairCount: 0,
        source: 'defined',
      });
    });

    const merged = Array.from(byName.values())
      .map(type => ({ ...type, repairCount: repairCounts.get(serviceTypeKey(type.name)) || 0 }))
      .sort((a, b) => compareServiceTypeNames(a.name, b.name));

    setTypes(merged);
  }

  useEffect(() => {
    void reload();
    const api = (window as any).api;
    const offTypes = api?.onRepairTypesChanged?.(() => void reload());
    const offRepairs = api?.onRepairCategoriesChanged?.(() => void reload());
    return () => { try { offTypes?.(); offRepairs?.(); } catch {} };
  }, []);

  function selectType(t: RepairType) {
    setSelectedId(t.id);
    setInputText(t.name);
  }

  function clearSelection() {
    setSelectedId(null);
    setInputText('');
  }

  async function save() {
    const name = inputText.trim();
    if (!name) return;
    setSaving(true);
    try {
      const api = (window as any).api;
      const selected = selectedId != null ? types.find(t => String(t.id) === String(selectedId)) : null;

      if (selected) {
        const previousName = selected.name || '';
        const renamed = previousName && serviceTypeKey(previousName) !== serviceTypeKey(name);
        const affected = renamed
          ? repairRows.filter(row => serviceTypeKey(row?.repairCategory) === serviceTypeKey(previousName))
          : [];

        if (renamed && affected.length > 0) {
          const ok = window.confirm(
            `Rename ${affected.length} saved repair item(s) from "${previousName}" to "${name}"?`
          );
          if (!ok) return;
        }

        if (selected.definedId != null) {
          await api?.dbUpdate?.('repairTypes', selected.definedId, { id: selected.definedId, name });
        } else {
          await api?.dbAdd?.('repairTypes', { name });
        }

        if (renamed) {
          for (const row of affected) {
            if (row?.id == null) continue;
            await api?.dbUpdate?.('repairCategories', row.id, { ...row, repairCategory: name });
          }
        }
      } else {
        const existing = types.find(t => serviceTypeKey(t.name) === serviceTypeKey(name));
        if (!existing?.definedId) {
          await api?.dbAdd?.('repairTypes', { name });
        }
      }

      clearSelection();
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function deleteById(id: number | string) {
    const selected = types.find(t => String(t.id) === String(id));
    if (!selected) return;
    const assigned = repairRows.filter(row => serviceTypeKey(row.repairCategory) === serviceTypeKey(selected.name));
    const removeRepairs = assigned.length > 0 && window.confirm(`Delete the repair type AND its ${assigned.length} assigned repair(s)?\n\nChoose Cancel to keep the repairs and remove only the saved type.`);
    if (!removeRepairs && selected.definedId == null) { window.alert('This type comes from assigned repairs. Delete its assigned repairs to remove it.'); return; }
    if (!window.confirm(removeRepairs ? `Permanently delete "${selected.name}" and all assigned repairs?` : `Remove "${selected.name}" from the saved type list?`)) return;
    const api = (window as any).api;
    const result = await deleteRepairType(api, selected, assigned, removeRepairs ? 'type-and-repairs' : 'type-only');
    if (!result.ok) { window.alert(result.error || 'Repair type could not be deleted.'); return; }
    if (String(selectedId) === String(id)) clearSelection();
    await reload();
  }

  async function deleteRepairRow(row: RepairRow) {
    if (row.id == null || !window.confirm(`Delete "${String((row as any).title || 'this repair')}"? This cannot be undone.`)) return;
    const result = await deleteRepair((window as any).api, row.id);
    if (!result.ok) { window.alert(result.error || 'Repair could not be deleted.'); return; }
    onRepairDeleted?.(row.id);
    await reload();
  }

  const toggleType = (id: number | string) => setExpandedTypeIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const clearHold = () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const holdContext = (event: React.PointerEvent, open: (x: number, y: number) => void) => {
    if (event.pointerType === 'mouse') return;
    clearHold();
    const x = event.clientX;
    const y = event.clientY;
    holdTimerRef.current = window.setTimeout(() => open(x, y), 650);
  };

  const ctxItems: ContextMenuItem[] = ctx.state.data
    ? [
        { type: 'header', label: ctx.state.data.name },
        { label: 'Edit', onClick: () => { if (ctx.state.data) selectType(ctx.state.data); } },
        { type: 'separator' },
        {
          label: 'Delete...',
          danger: true,
          disabled: !canDeleteRepairType(ctx.state.data),
          onClick: () => ctx.state.data ? deleteById(ctx.state.data.id) : undefined,
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Service / Repair Types</h2>
        <div className="text-xs text-zinc-400 mt-1">
          Define categories of repair work, like Diagnostic, Screen Repair, Battery, Virus Removal, and Additional Fee.
          Existing repair categories are recovered here automatically so they can be selected and cleaned up.
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
          placeholder={selectedId != null ? 'Edit name...' : 'New repair type...'}
          className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-[#39FF14] focus:outline-none"
        />
        <button
          onClick={save}
          disabled={!inputText.trim() || saving}
          className="px-4 py-2 bg-[#39FF14] hover:bg-[#32E610] text-black font-medium rounded text-sm disabled:opacity-50"
        >
          {selectedId != null ? 'Update' : 'Add'}
        </button>
      </div>

      <div className="flex-1 border border-zinc-700 rounded overflow-hidden flex flex-col min-h-0">
        <div className="bg-zinc-800 px-3 py-2 text-sm font-semibold border-b border-zinc-700 flex items-center justify-between">
          <span>Repair Types</span>
          <span className="text-xs font-normal text-zinc-400">{types.length} shown</span>
        </div>
        <div className="flex-1 overflow-auto">
          {types.length === 0 ? (
            <div className="p-6 text-center text-zinc-500 text-sm">
              No repair types found yet. Add your first above.
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {types.map((t, idx) => {
                  const expanded = expandedTypeIds.has(t.id);
                  const assigned = repairRows.filter((row) => serviceTypeKey(row.repairCategory) === serviceTypeKey(t.name));
                  return <React.Fragment key={t.id}>
                    <tr
                      className={`cursor-pointer border-l-2 ${selectedId === t.id ? 'border-l-[#39FF14] bg-zinc-800/60' : 'border-l-transparent hover:bg-zinc-800/30'} ${idx % 2 ? 'bg-zinc-900' : ''}`}
                      onClick={() => toggleType(t.id)}
                      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); ctx.openFromEvent(e, t); }}
                      onPointerDown={(event) => holdContext(event, (x, y) => ctx.openAt(x, y, t))}
                      onPointerUp={clearHold}
                      onPointerCancel={clearHold}
                      onPointerLeave={clearHold}
                    >
                      <td className="px-3 py-2 border-b border-zinc-800">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate">{t.name}</span>
                          <span className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500">
                            {t.repairCount} item{t.repairCount === 1 ? '' : 's'}
                            <span aria-hidden="true">{expanded ? '▲' : '▼'}</span>
                          </span>
                        </div>
                      </td>
                    </tr>
                    {expanded ? <tr><td className="border-b border-zinc-800 bg-zinc-950 px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">Assigned repairs</div>
                      {assigned.length ? assigned.map((repair) => <button
                        type="button"
                        key={String(repair.id)}
                        className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                        onClick={() => onRepairEdit?.(repair as unknown as RepairItem)}
                        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); repairCtx.openFromEvent(event, repair); }}
                        onPointerDown={(event) => holdContext(event, (x, y) => repairCtx.openAt(x, y, repair))}
                        onPointerUp={clearHold}
                        onPointerCancel={clearHold}
                        onPointerLeave={clearHold}
                      ><span className="truncate">{String((repair as any).title || 'Untitled repair')}</span><span className="shrink-0 text-xs text-zinc-500">{String((repair as any).category || 'All devices')}</span></button>) : <div className="px-3 py-2 text-sm text-zinc-500">No assigned repairs.</div>}
                    </td></tr> : null}
                  </React.Fragment>;
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ContextMenu
        id="repair-type-ctx"
        open={ctx.state.open}
        x={ctx.state.x}
        y={ctx.state.y}
        items={ctxItems}
        onClose={ctx.close}
        zIndex={contextMenuZIndex}
      />
      <ContextMenu
        id="repair-type-item-ctx"
        open={repairCtx.state.open}
        x={repairCtx.state.x}
        y={repairCtx.state.y}
        items={repairCtx.state.data ? [
          { type: 'header', label: String((repairCtx.state.data as any).title || 'Repair') },
          { label: 'Edit Repair', onClick: () => onRepairEdit?.(repairCtx.state.data as unknown as RepairItem) },
          { type: 'separator' },
          { label: 'Delete Repair…', danger: true, onClick: () => { if (repairCtx.state.data) void deleteRepairRow(repairCtx.state.data); } },
        ] : []}
        onClose={repairCtx.close}
        zIndex={contextMenuZIndex}
      />
    </div>
  );
}
