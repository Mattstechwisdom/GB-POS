import React, { useState, useEffect } from 'react';
import ContextMenu, { ContextMenuItem } from '@/components/ContextMenu';
import { useContextMenu } from '@/lib/useContextMenu';

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

export default function RepairTypeManager() {
  const [types, setTypes] = useState<RepairType[]>([]);
  const [repairRows, setRepairRows] = useState<RepairRow[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<number | string | null>(null);

  const ctx = useContextMenu<RepairType>();

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

  useEffect(() => { reload(); }, []);

  function selectType(t: RepairType) {
    setSelectedId(t.id);
    setInputText(t.name);
    setPendingDelete(null);
  }

  function clearSelection() {
    setSelectedId(null);
    setInputText('');
    setPendingDelete(null);
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
    setPendingDelete(id);
  }

  async function confirmDelete() {
    if (pendingDelete == null) return;
    const id = pendingDelete;
    setPendingDelete(null);
    const selected = types.find(t => String(t.id) === String(id));
    if (!selected?.definedId) return;
    const api = (window as any).api;
    await api?.dbDelete?.('repairTypes', selected.definedId);
    if (String(selectedId) === String(id)) clearSelection();
    await reload();
  }

  const selectedType = selectedId != null ? types.find(t => String(t.id) === String(selectedId)) : null;
  const selectedCanDelete = !!selectedType?.definedId;

  const ctxItems: ContextMenuItem[] = ctx.state.data
    ? [
        { type: 'header', label: ctx.state.data.name },
        { label: 'Edit', onClick: () => { if (ctx.state.data) selectType(ctx.state.data); } },
        { type: 'separator' },
        {
          label: 'Delete...',
          danger: true,
          disabled: !ctx.state.data.definedId,
          onClick: () => { if (ctx.state.data) deleteById(ctx.state.data.id); },
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
        {selectedId != null && (
          <button
            onClick={clearSelection}
            className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm"
          >
            Cancel
          </button>
        )}
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
                {types.map((t, idx) => (
                  <tr
                    key={t.id}
                    className={`cursor-pointer border-l-2 ${selectedId === t.id ? 'border-l-[#39FF14] bg-zinc-800/60' : 'border-l-transparent hover:bg-zinc-800/30'} ${idx % 2 ? 'bg-zinc-900' : ''}`}
                    onClick={() => selectType(t)}
                    onContextMenu={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      ctx.openFromEvent(e, t);
                    }}
                  >
                    <td className="px-3 py-2 border-b border-zinc-800">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate">{t.name}</span>
                        <span className="shrink-0 text-[11px] text-zinc-500">
                          {t.repairCount} item{t.repairCount === 1 ? '' : 's'}
                          {t.source === 'recovered' ? ' - recovered' : ''}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedId != null && (
        <div className="flex justify-start mt-3">
          {pendingDelete === selectedId ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400">
                {selectedCanDelete
                  ? `Delete "${selectedType?.name}" from the saved type list? Repairs using it stay unchanged.`
                  : 'This type is recovered from repair items. Rename the type or edit the repair items first.'}
              </span>
              {selectedCanDelete && (
                <button onClick={confirmDelete} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Yes, delete</button>
              )}
              <button onClick={() => setPendingDelete(null)} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => deleteById(selectedId)}
              disabled={!selectedCanDelete}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title={selectedCanDelete ? 'Delete saved service type' : 'Recovered types cannot be deleted directly'}
            >
              Delete
            </button>
          )}
        </div>
      )}

      <ContextMenu
        id="repair-type-ctx"
        open={ctx.state.open}
        x={ctx.state.x}
        y={ctx.state.y}
        items={ctxItems}
        onClose={ctx.close}
      />
    </div>
  );
}
