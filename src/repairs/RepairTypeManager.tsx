import React, { useState, useEffect } from 'react';
import ContextMenu, { ContextMenuItem } from '@/components/ContextMenu';
import { useContextMenu } from '@/lib/useContextMenu';

type RepairType = { id: number; name: string };

export default function RepairTypeManager() {
  const [types, setTypes] = useState<RepairType[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  const ctx = useContextMenu<RepairType>();

  async function reload() {
    const api = (window as any).api;
    const list = await api?.dbGet?.('repairTypes').catch(() => []);
    setTypes(Array.isArray(list) ? list : []);
  }

  useEffect(() => { reload(); }, []);

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
      if (selectedId != null) {
        await api?.dbUpdate?.('repairTypes', selectedId, { id: selectedId, name });
      } else {
        await api?.dbAdd?.('repairTypes', { name });
      }
      clearSelection();
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function deleteById(id: number) {
    setPendingDelete(id);
  }

  async function confirmDelete() {
    if (pendingDelete == null) return;
    const id = pendingDelete;
    setPendingDelete(null);
    const api = (window as any).api;
    await api?.dbDelete?.('repairTypes', id);
    if (selectedId === id) clearSelection();
    await reload();
  }

  const ctxItems: ContextMenuItem[] = ctx.state.data
    ? [
        { type: 'header', label: ctx.state.data.name },
        { label: 'Edit', onClick: () => { if (ctx.state.data) selectType(ctx.state.data); } },
        { type: 'separator' },
        {
          label: 'Delete…',
          danger: true,
          onClick: () => { if (ctx.state.data) deleteById(ctx.state.data.id); },
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Service / Repair Types</h2>
        <div className="text-xs text-zinc-400 mt-1">
          Define categories of repair work — e.g. Diagnostic, Screen Repair, Battery, Virus Removal, Additional Fee.
          These become selectable on each repair item and flow into work orders.
        </div>
      </div>

      {/* Input form */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
          placeholder={selectedId != null ? 'Edit name…' : 'New repair type…'}
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

      {/* List */}
      <div className="flex-1 border border-zinc-700 rounded overflow-hidden flex flex-col min-h-0">
        <div className="bg-zinc-800 px-3 py-2 text-sm font-semibold border-b border-zinc-700 flex items-center justify-between">
          <span>Repair Types</span>
          <span className="text-xs font-normal text-zinc-400">{types.length} defined</span>
        </div>
        <div className="flex-1 overflow-auto">
          {types.length === 0 ? (
            <div className="p-6 text-center text-zinc-500 text-sm">
              No repair types defined yet. Add your first above.
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
                    <td className="px-3 py-2 border-b border-zinc-800">{t.name}</td>
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
              <span className="text-sm text-red-400">Delete "{types.find(t => t.id === selectedId)?.name}"?</span>
              <button onClick={confirmDelete} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Yes, delete</button>
              <button onClick={() => setPendingDelete(null)} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => deleteById(selectedId)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
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
