import React, { useEffect, useMemo, useState } from 'react';
import Button from './Button';

type TileDef = {
  key: string;
  label: string;
  collections: string[];
  count: number;
};

const ClearDatabaseWindow: React.FC = () => {
  const hasElectron = typeof (window as any).api !== 'undefined';
  const [message, setMessage] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmText, setConfirmText] = useState<string>('');
  const api = hasElectron ? (window as any).api : null;

  // Same comprehensive scan list used in BackupWindow (kept smaller here, can expand later)
  const dataCollections = useMemo(() => Array.from(new Set([
    'technicians','timeEntries','customers','workOrders','sales','calendarEvents','deviceCategories','productCategories','products','partSources','repairCategories','repairItems','intakeSources',
    'quoteFiles',
    // safe extras if present
    'suppliers','vendors','invoices','payments','settings','preferences','userProfiles','systemLogs'
  ])), []);

  async function loadCounts() {
    const map: Record<string, number> = {};
    for (const k of dataCollections) {
      try {
        const list = await api.dbGet(k);
        map[k] = Array.isArray(list) ? list.length : 0;
      } catch {
        // not available
      }
    }
    setCounts(map);
  }

  useEffect(() => { if (api) loadCounts(); }, []);

  const tiles: TileDef[] = useMemo(() => {
    const add = (key: string, label?: string) => ({ key, label: label || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()), collections: [key], count: counts[key] || 0 });
    const base: TileDef[] = [];
    const preferredOrder = ['technicians','customers','workOrders','sales','calendarEvents','deviceCategories','productCategories','products','timeEntries','repairCategories','repairItems','partSources','intakeSources'];
    for (const k of preferredOrder) if (k in counts) base.push(add(k));
    // any other detected keys
    for (const k of Object.keys(counts)) { if (!preferredOrder.includes(k)) base.push(add(k)); }
    return base;
  }, [counts]);

  function isSelected(tile: TileDef) { return tile.collections.every(c => selected.has(c)); }
  function toggle(tile: TileDef) {
    setSelected(prev => {
      const next = new Set(prev);
      if (isSelected(tile)) tile.collections.forEach(c => next.delete(c));
      else tile.collections.forEach(c => next.add(c));
      return next;
    });
  }
  function selectAll() {
    const next = new Set<string>();
    tiles.forEach(t => t.collections.forEach(c => next.add(c)));
    setSelected(next);
  }
  function deselectAll() { setSelected(new Set()); }

  const selectedCollections = useMemo(() => Array.from(selected), [selected]);
  const totalSelectedRecords = useMemo(() => selectedCollections.reduce((n, c) => n + (counts[c] || 0), 0), [selectedCollections, counts]);

  async function performDelete() {
    if (!api) return;
    setBusy(true);
    setMessage('⏳ Deleting selected data...');
    try {
      for (const col of selectedCollections) {
        const list = await api.dbGet(col);
        if (Array.isArray(list)) {
          for (const item of list) {
            try { await api.dbDelete(col, item?.id); } catch { /* continue */ }
          }
        }
      }
      setMessage(`✅ Deleted ${totalSelectedRecords} record(s) across ${selectedCollections.length} collection(s).`);
      // reload counts after a short delay
      setTimeout(loadCounts, 300);
    } catch (e) {
      setMessage('❌ Failed to delete some items. See console.');
    } finally {
      setBusy(false);
      setConfirmOpen(false);
      setConfirmText('');
      setSelected(new Set());
    }
  }

  const canDelete = selectedCollections.length > 0 && totalSelectedRecords >= 0;
  const confirmEnabled = confirmText.trim().toUpperCase() === 'CLEAR';

  async function factoryReset() {
    if (!api) return;
    setBusy(true);
    setMessage('⏳ Wiping all local data (database, backups, update config)…');
    try {
      const res = await api.dbResetAll?.();
      const removedCount = Array.isArray(res?.removed) ? res.removed.length : 0;
      setMessage(`✅ Factory reset complete. Removed ${removedCount} file(s)/folder(s).`);
      setSelected(new Set());
      setConfirmOpen(false);
      setConfirmText('');
      setTimeout(loadCounts, 250);
    } catch (e: any) {
      setMessage(`❌ Factory reset failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-screen bg-zinc-900 text-gray-100 p-4">
      <div className="max-w-5xl mx-auto space-y-3">
        <h1 className="text-2xl font-bold text-[#39FF14]">Clear Database</h1>
        <div className="bg-zinc-800 border border-zinc-700 rounded p-3 text-sm text-gray-200">
          <div className="font-semibold mb-1">Danger zone</div>
          <p>
            Select the data categories to permanently remove from the local database. This action cannot be undone.
            Make a backup first if you might need this data again.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              onClick={factoryReset}
              disabled={busy}
              className="px-3 py-1 text-xs bg-red-700 hover:bg-red-800 border border-red-600 rounded disabled:opacity-50"
            >
              Factory Reset (Wipe Everything)
            </Button>
            <div className="text-xs text-zinc-400">
              Removes the DB file, backups, and update-skip config.
            </div>
          </div>
        </div>

        <div className="bg-zinc-800 border border-zinc-700 rounded p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm text-zinc-300">Collections</div>
            <div className="flex items-center gap-2">
              <button onClick={loadCounts} disabled={busy} className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded disabled:opacity-50">Refresh</button>
              <button onClick={selectAll} disabled={busy} className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded disabled:opacity-50">✓ Select All</button>
              <button onClick={deselectAll} disabled={busy} className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded disabled:opacity-50">✕ Deselect All</button>
              <Button onClick={() => setConfirmOpen(true)} disabled={!canDelete || busy} className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 border border-red-500 rounded disabled:opacity-50">Delete Selected…</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {tiles.map(tile => {
              const sel = isSelected(tile);
              return (
                <button
                  type="button"
                  key={tile.key}
                  onClick={() => toggle(tile)}
                  className={`relative text-left p-2 rounded border transition-colors h-16 ${sel ? 'bg-zinc-950 border-[#39FF14] ring-1 ring-[#39FF14]/40' : 'bg-zinc-900 border-zinc-600 hover:bg-zinc-800'}`}
                >
                  <div className="text-xs text-gray-400">{tile.label}</div>
                  <div className="text-xl font-bold text-[#39FF14] leading-none">{tile.count}</div>
                  {sel && (<div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#39FF14] text-black text-[9px] font-bold flex items-center justify-center">✓</div>)}
                </button>
              );
            })}
          </div>
        </div>

        {message && (
          <div className="bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-center">{message}</div>
        )}

        {confirmOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => !busy && setConfirmOpen(false)}>
            <div className="w-[560px] max-w-[95vw] bg-zinc-900 border border-zinc-700 rounded p-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="text-lg font-semibold text-red-400 mb-2">This will permanently delete data</div>
              <div className="text-sm text-zinc-300 space-y-2">
                <p>You are about to delete:</p>
                <ul className="list-disc pl-5">
                  {selectedCollections.map(k => (
                    <li key={k}><span className="text-gray-200">{k}</span> — <span className="text-[#39FF14]">{counts[k] || 0}</span> record(s)</li>
                  ))}
                </ul>
                <p className="pt-1">Total: <span className="text-[#39FF14] font-semibold">{totalSelectedRecords}</span> record(s).</p>
                <p className="pt-2">Type <span className="px-1 bg-zinc-800 border border-zinc-700 rounded">CLEAR</span> to confirm.</p>
                <input value={confirmText} onChange={e => setConfirmText(e.target.value)} className="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-gray-100" placeholder="Type CLEAR" />
              </div>
              <div className="flex items-center justify-end gap-2 mt-3">
                <button className="px-3 py-1 text-sm bg-zinc-800 border border-zinc-700 rounded disabled:opacity-50" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</button>
                <button className={`px-3 py-1 text-sm rounded border ${confirmEnabled ? 'bg-red-600 hover:bg-red-700 border-red-500' : 'bg-red-900/50 border-red-800 text-zinc-400'} disabled:opacity-50`} onClick={performDelete} disabled={!confirmEnabled || busy}>
                  {busy ? 'Deleting…' : `I understand, delete ${totalSelectedRecords} record(s)`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClearDatabaseWindow;
