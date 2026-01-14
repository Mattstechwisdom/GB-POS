import React, { useEffect, useMemo, useState } from 'react';

type LogLevel = 'info' | 'warn' | 'error';
interface LogEntry { ts: string; level: LogLevel; message: string }

const fmt = (n: number) => new Intl.NumberFormat().format(n);

export default function DataToolsWindow() {
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const hasElectron = typeof (window as any).api !== 'undefined';
  const api = hasElectron ? (window as any).api : null;
  const [availableCollections, setAvailableCollections] = useState<Array<{ key: string; label: string; defaultSelected?: boolean }>>([
    { key: 'customers', label: 'Customers', defaultSelected: true },
    { key: 'workOrders', label: 'Work Orders', defaultSelected: true },
    { key: 'sales', label: 'Sales', defaultSelected: true },
    { key: 'technicians', label: 'Technicians', defaultSelected: true },
    { key: 'timeEntries', label: 'Time Entries', defaultSelected: true },
    { key: 'deviceCategories', label: 'Device Categories', defaultSelected: true },
    { key: 'repairCategories', label: 'Repair Categories', defaultSelected: true },
    { key: 'products', label: 'Products', defaultSelected: true },
    { key: 'productCategories', label: 'Product Categories', defaultSelected: true },
    { key: 'calendarEvents', label: 'Calendar Events', defaultSelected: false },
    { key: 'intakeSources', label: 'Intake Sources', defaultSelected: false },
    { key: 'partSources', label: 'Part Sources', defaultSelected: false },
  ]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(([
      'customers','workOrders','sales','technicians','timeEntries','deviceCategories','repairCategories','products','productCategories'
    ]))
  );
  const [customKey, setCustomKey] = useState('');

  const log = (level: LogLevel, message: string) => setLogs(prev => [{ ts: new Date().toLocaleTimeString(), level, message }, ...prev].slice(0, 500));

  const getDb = async () => {
    const customers = await api.dbGet('customers');
    const workOrders = await api.dbGet('workOrders');
    const technicians = await api.dbGet('technicians');
    const deviceCategories = await api.dbGet('deviceCategories');
    return { customers, workOrders, technicians, deviceCategories };
  };

  // 1) Orphan/duplicate finder
  const findOrphansAndDuplicates = async () => {
    setBusy(true);
    try {
      const { customers, workOrders } = await getDb();
      const custById = new Map(customers.map((c: any) => [c.id, c]));
      const orphans = workOrders.filter((w: any) => !custById.has(w.customerId));
      const emailMap = new Map<string, number>();
      const phoneMap = new Map<string, number>();
      const dups: any[] = [];
      for (const c of customers) {
        const email = (c.email || '').trim().toLowerCase();
        const phone = (c.phone || '').replace(/\D/g, '');
        if (email) {
          const seen = emailMap.get(email) || 0; emailMap.set(email, seen + 1);
          if (seen >= 1) dups.push(c);
        }
        if (phone) {
          const seen = phoneMap.get(phone) || 0; phoneMap.set(phone, seen + 1);
          if (seen >= 1) dups.push(c);
        }
      }
      log('info', `Orphan WOs: ${fmt(orphans.length)}; Potential duplicate customers: ${fmt(dups.length)}`);
      if (orphans.length) log('warn', `Orphans: ${orphans.map((o: any) => o.id).join(', ')}`);
    } catch (e: any) { log('error', e?.message || String(e)); } finally { setBusy(false); }
  };

  // 2) Fix All Issues (recalc totals, close fully paid)
  const fixAllIssues = async () => {
    setBusy(true);
    try {
      const { workOrders } = await getDb();
      let updates = 0;
      for (const w of workOrders) {
        const labor = Number(w.laborCost || 0);
        const parts = Number(w.partCosts || 0);
        const discount = Number(w.discount || 0);
        const taxRate = Number(w.taxRate || 0);
        const amountPaid = Number(w.amountPaid || 0);
        const subTotal = Math.max(0, labor + parts - discount);
        const tax = Math.round((subTotal * (taxRate / 100)) * 100) / 100;
        const total = Math.round((subTotal + tax) * 100) / 100;
        const remaining = Math.max(0, Math.round((total - amountPaid) * 100) / 100);
        const newTotals = { subTotal, tax, total, remaining };
        const shouldBeClosed = remaining === 0;
        const changed = JSON.stringify(w.totals || {}) !== JSON.stringify(newTotals) || (w.status === 'closed') !== shouldBeClosed;
        if (changed) {
          const updated = { ...w, totals: newTotals, status: shouldBeClosed ? 'closed' : (w.status || 'open') };
          await api.dbUpdate('workOrders', w.id, updated);
          updates++;
        }
      }
      log('info', `Applied fixes to ${updates} work orders.`);
    } catch (e: any) { log('error', e?.message || String(e)); } finally { setBusy(false); }
  };

  // 3) Seed demo data
  const seedDemoData = async () => {
    setBusy(true);
    try {
      const ts = Date.now();
      const c = await api.dbAdd('customers', { name: `Demo Customer ${ts}`, phone: `555-${ts.toString().slice(-4)}` });
      await api.dbAdd('workOrders', { customerId: c.id, laborCost: 80, partCosts: 20, discount: 0, taxRate: 8, amountPaid: 0, totals: { subTotal: 100, tax: 8, total: 108, remaining: 108 }, status: 'open' });
      log('info', 'Inserted 1 demo customer + 1 work order.');
    } catch (e: any) { log('error', e?.message || String(e)); } finally { setBusy(false); }
  };

  // 4) Clear selected collections (guarded)
  const clearSelected = async () => {
    const confirm = window.prompt('Type CLEAR to confirm wiping SELECTED collections. A backup is created automatically.');
    if (confirm !== 'CLEAR') return;
    setBusy(true);
    try {
      await api.devBackupDatabase();
      const keys = [...selected];
      for (const key of keys) {
        const items = await api.dbGet(key);
        for (const item of items) await api.dbDelete(key, item.id);
      }
      log('info', `Cleared collections: ${keys.join(', ')} (backup saved).`);
    } catch (e: any) { log('error', e?.message || String(e)); } finally { setBusy(false); }
  };

  // 5) Anonymize + export (support bundle)
  const anonymize = (db: any) => {
    let custCounter = 1;
    const custAlias = new Map<any, string>();
    const aliasFor = (id: any) => {
      if (!custAlias.has(id)) custAlias.set(id, `Customer ${custCounter++}`);
      return custAlias.get(id)!;
    };
    const redactEmailPhone = (v: any) => (typeof v === 'string' ? v.replace(/[\w.-]+@[\w.-]+/g, 'email@example.com').replace(/\b\d{3}[- .]?\d{3}[- .]?\d{4}\b/g, '555-555-5555') : v);
    const out: any = {};
    for (const key of Object.keys(db || {})) {
      const arr = Array.isArray(db[key]) ? db[key] : [];
      switch (key) {
        case 'customers':
          out.customers = arr.map((c: any) => ({
            ...c,
            firstName: 'Customer',
            lastName: aliasFor(c.id).split(' ').slice(1).join(' ') || String(c.id ?? ''),
            name: undefined,
            phone: '555-555-5555',
            email: 'email@example.com',
            notes: undefined,
          }));
          break;
        case 'technicians':
          out.technicians = arr.map((t: any) => ({
            ...t,
            firstName: 'Tech',
            lastName: String(t.id ?? ''),
            name: undefined,
            phone: '555-555-5555',
            email: undefined,
            passcode: undefined,
          }));
          break;
        case 'workOrders':
          out.workOrders = arr.map((w: any) => ({
            ...w,
            notes: undefined,
            internalNotes: undefined,
            customerNotes: undefined,
          }));
          break;
        case 'sales':
          out.sales = arr.map((s: any) => ({
            ...s,
            notes: undefined,
          }));
          break;
        case 'timeEntries':
          out.timeEntries = arr.map((e: any) => ({ ...e }));
          break;
        case 'deviceCategories':
        case 'repairCategories':
        case 'products':
        case 'productCategories':
        case 'calendarEvents':
          out[key] = arr.map((x: any) => ({ ...x }));
          break;
        default:
          // Generic pass-through with basic redaction on strings
          out[key] = arr.map((x: any) => {
            const copy: any = { ...x };
            for (const k of Object.keys(copy)) {
              if (typeof copy[k] === 'string') copy[k] = redactEmailPhone(copy[k]);
            }
            return copy;
          });
      }
    }
    return out;
  };
  const anonymizeAndExport = async () => {
    setBusy(true);
    try {
      // Build payload from selected collections
      const keys = [...selected];
      const dbAny: any = {};
      for (const k of keys) dbAny[k] = await api.dbGet(k);
      const payload = anonymize(dbAny);
      const res = await api.backupExportPayload(payload);
      if (res?.ok) log('info', `Anonymized export written: ${res.filePath}`);
      else if (!res?.canceled) log('error', `Export failed: ${res?.error || 'unknown'}`);
    } catch (e: any) { log('error', e?.message || String(e)); } finally { setBusy(false); }
  };

  // 6) Import dry-run (counts/diffs)
  const importDryRun = async () => {
    setBusy(true);
    try {
      const picked = await api.backupPickAndRead();
      if (!picked?.ok) { if (!picked?.canceled) log('error', picked?.error || 'Dry-run failed'); return; }
      const target = picked.data || {};
      const keys = [...selected];
      for (const k of keys) {
        const a = await api.dbGet(k);
        const b = (target as any)[k] || [];
        log('info', `${k}: current=${fmt(a.length)} → import=${fmt(b.length)} (delta=${fmt((b.length - a.length))})`);
      }
    } catch (e: any) { log('error', e?.message || String(e)); } finally { setBusy(false); }
  };

  // 7) Export selected (raw snapshot)
  const exportSelected = async () => {
    setBusy(true);
    try {
      const keys = [...selected];
      const payload: any = {};
      for (const k of keys) payload[k] = await api.dbGet(k);
      const res = await api.backupExportPayload(payload);
      if (res?.ok) log('info', `Exported selected collections to: ${res.filePath}`);
      else if (!res?.canceled) log('error', `Export failed: ${res?.error || 'unknown'}`);
    } catch (e: any) { log('error', e?.message || String(e)); } finally { setBusy(false); }
  };

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const selectAll = () => setSelected(new Set(availableCollections.map(c => c.key)));
  const clearSelection = () => setSelected(new Set());

  useEffect(() => { if (!hasElectron) return; log('info', 'Data Tools ready'); }, [hasElectron]);

  return (
    <div className="h-screen bg-zinc-900 text-gray-100 p-4 space-y-4">
      <div className="text-xl font-bold">Data Tools</div>
      {!hasElectron && <div className="text-sm text-yellow-300">Electron bridge not detected. Open via the Electron app.</div>}
      {/* Collections selection */}
      <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-zinc-300">Collections</div>
          <div className="flex gap-2 items-center">
            <input value={customKey} onChange={e => setCustomKey(e.target.value)} placeholder="Add custom (e.g. products2)" className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded outline-none focus:border-[#39FF14] w-48" />
            <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]" onClick={async () => {
              const key = customKey.trim();
              if (!key) return;
              try {
                const arr = await api.dbGet(key);
                if (!Array.isArray(arr)) { log('error', `Collection "${key}" is not an array or not found.`); return; }
                setAvailableCollections(prev => prev.some(c => c.key === key) ? prev : [...prev, { key, label: key }]);
                setSelected(prev => new Set(prev).add(key));
                log('info', `Added collection: ${key} (${arr.length} items)`);
                setCustomKey('');
              } catch (e: any) {
                log('error', `Failed to load "${key}": ${e?.message || String(e)}`);
              }
            }} disabled={busy || !hasElectron}>Add</button>
            <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]" onClick={selectAll} disabled={busy}>Select All</button>
            <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]" onClick={clearSelection} disabled={busy}>Clear</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {availableCollections.map(c => (
            <label key={c.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[#39FF14]" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={exportSelected} disabled={busy || !hasElectron || selected.size===0}>Export Selected</button>
          <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={importDryRun} disabled={busy || !hasElectron || selected.size===0}>Import Dry-Run (compare)</button>
          <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={clearSelected} disabled={busy || !hasElectron || selected.size===0}>Clear Selected (guarded)</button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={findOrphansAndDuplicates} disabled={busy || !hasElectron}>Orphans & Duplicates</button>
        <button className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={fixAllIssues} disabled={busy || !hasElectron}>Fix All Issues</button>
        <button className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={seedDemoData} disabled={busy || !hasElectron}>Seed Demo Data</button>
        <button className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={anonymizeAndExport} disabled={busy || !hasElectron}>Anonymize + Export</button>
        {/* Import Dry-Run now available above in collections section as well */}
      </div>
      <div className="text-sm text-zinc-400">Log</div>
      <div className="h-80 overflow-auto bg-zinc-950 border border-zinc-800 rounded p-2 space-y-1">
        {logs.map((l, idx) => (
          <div key={idx} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-300' : 'text-zinc-300'}>
            [{l.ts}] {l.level.toUpperCase()}: {l.message}
          </div>
        ))}
      </div>
    </div>
  );
}
