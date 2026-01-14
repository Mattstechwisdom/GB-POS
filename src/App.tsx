import React, { useState } from 'react';
import SidebarFilters from './components/SidebarFilters';
import Toolbar from './components/Toolbar';
import WorkOrdersTable from './components/WorkOrdersTable';
import SalesTable from './components/SalesTable';
import Pagination from './components/Pagination';
import RecentCustomers from './components/RecentCustomers';
import CustomerSearchWindow from './components/CustomerSearchWindow';

const App: React.FC = () => {
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [technicianFilter, setTechnicianFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [mode, setMode] = useState<'workorders'|'sales'|'all'>('all');

  return (
    <div className="bg-zinc-900 min-h-screen text-white flex flex-col relative">
      <div className="flex flex-1">
        <aside className="w-[320px] bg-zinc-800 border-r border-zinc-700 p-4 flex flex-col gap-6 overflow-y-auto">
          <SidebarFilters
            technicianFilter={technicianFilter}
            onTechnicianFilterChange={setTechnicianFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onOpenCustomerSearch={() => setShowCustomerSearch(true)}
            mode={mode}
            onModeChange={setMode}
          />
          <div>
            <RecentCustomers />
          </div>
        </aside>
        <main className="flex-1 flex flex-col">
          <Toolbar mode={mode} onModeChange={setMode} />
          <div className="flex-1 overflow-auto">
            {mode === 'workorders' && (
              <WorkOrdersTable technicianFilter={technicianFilter} dateFrom={dateFrom} dateTo={dateTo} />
            )}
            {mode === 'sales' && (
              <SalesTable technicianFilter={technicianFilter} dateFrom={dateFrom} dateTo={dateTo} />
            )}
            {mode === 'all' && (
              <UnifiedList technicianFilter={technicianFilter} dateFrom={dateFrom} dateTo={dateTo} />
            )}
          </div>
          <div className="border-t border-zinc-700 p-2 flex items-center justify-end bg-zinc-900">
            <Pagination />
          </div>
        </main>
      </div>
      {/* Footer removed; table and pagination now consume extra space */}
      {showCustomerSearch && (
        <CustomerSearchWindow onClose={() => setShowCustomerSearch(false)} />
      )}
    </div>
  );
};

export default App;

// Unified list of Work Orders and Sales in one table, ordered by id desc
const UnifiedList: React.FC<{ technicianFilter?: string; dateFrom?: string; dateTo?: string }> = ({ technicianFilter = '', dateFrom = '', dateTo = '' }) => {
  const [wo, setWo] = React.useState<any[]>([]);
  const [sa, setSa] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [techIndex, setTechIndex] = React.useState<Record<string,string>>({});
  const [customerIndex, setCustomerIndex] = React.useState<Record<number, { name: string; phone?: string }>>({});

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [wos, sales] = await Promise.all([
        (window as any).api.getWorkOrders(),
        (window as any).api.dbGet('sales').catch(() => []),
      ]);
      setWo(Array.isArray(wos) ? wos : []);
      setSa(Array.isArray(sales) ? sales : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    const api = (window as any).api;
    if (!api) {
      // Running in plain Vite/browser without Electron preload; skip IPC subscriptions
      return;
    }
    const offWO = api.onWorkOrdersChanged?.(() => load());
    const offSA = api.onSalesChanged?.(() => load());
    return () => { try { offWO && offWO(); } catch {} try { offSA && offSA(); } catch {} };
  }, [load]);

  React.useEffect(() => {
    const refreshTechs = async () => {
      try {
        const techs = await (await import('./lib/admin')).listTechnicians();
        const map: Record<string,string> = {};
        techs.forEach((t: any) => { map[t.id] = (t.nickname && t.nickname.trim()) || t.firstName || t.id; });
        setTechIndex(map);
      } catch {}
    };
    const refreshCustomers = async () => {
      try {
        const customers = await ((window as any).api.getCustomers?.() ?? (window as any).api.dbGet('customers'));
        const cMap: Record<number, { name: string; phone?: string }> = {};
        (customers || []).forEach((c: any) => {
          const composed = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
          const name = composed || c.name || c.email || `Customer #${c.id}`;
          cMap[c.id] = { name, phone: c.phone || c.phoneAlt };
        });
        setCustomerIndex(cMap);
      } catch {}
    };
    refreshTechs();
    refreshCustomers();
    const offCustomers = (window as any).api.onCustomersChanged?.(() => refreshCustomers());
    return () => { try { offCustomers && offCustomers(); } catch {} };
  }, []);

  const rows = React.useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    const mapped = [
      ...wo.map(w => ({
        type: 'workorder' as const,
        id: w.id,
        date: new Date(w.checkInAt || w.createdAt || 0),
        status: (Math.max(0, Number(w.totals?.total || w.total || 0) - Number(w.amountPaid || 0)) <= 0 ? 'closed' : 'open') as 'open'|'closed',
        desc: w.productDescription || w.summary || '',
        items: (() => {
          const list = Array.isArray((w as any).items) ? (w as any).items : [];
          const titles = list.map((it: any) => (it.repair || it.description || it.title || it.name || it.altDescription || '').toString().trim()).filter(Boolean);
          return titles.join(', ');
        })(),
        problem: w.problemInfo || '',
        customer: (() => {
          const id = (w as any).customerId as number | undefined;
          const fromIndex = id ? customerIndex[id]?.name : '';
          if (fromIndex) return fromIndex;
          const inline = (w as any).customerName as string | undefined;
          if (inline && inline.trim()) return inline.trim();
          const composed = `${(w as any).firstName || ''} ${(w as any).lastName || ''}`.trim();
          if (composed) return composed;
          return id ? `Customer #${id}` : '';
        })(),
        phone: (w.customerId && customerIndex[w.customerId]?.phone) || w.customerPhone || w.phone || '',
        tech: ((): string => {
          const at = (w.assignedTo || '').toString().trim();
          if (!at) return '';
          if (techIndex[at]) return techIndex[at];
          // Try match by known label or first name
          for (const [, label] of Object.entries(techIndex)) {
            if (!label) continue;
            if (label === at) return label;
            const first = label.split(' ')[0];
            if (first && first === at) return label;
          }
          return '';
        })(),
        total: Number(w.totals?.total || w.total || 0) || 0,
        remaining: Number(w.totals?.remaining || w.balance || 0) || 0,
      })),
      ...sa.map(s => ({
        type: 'sale' as const,
        id: s.id,
        date: new Date(s.checkInAt || s.createdAt || 0),
        status: ((Number(s.totals?.total || s.total || 0) || 0) - (Number(s.amountPaid || 0) || 0) <= 0 ? 'closed' : 'open') as 'open'|'closed',
        desc: (Array.isArray(s.items) && s.items[0]?.description) || s.itemDescription || '',
        items: (() => {
          const list = Array.isArray(s.items) ? s.items : [];
          const titles = list.map((it: any) => (it.description || it.name || it.title || '').toString().trim()).filter(Boolean);
          return titles.join(', ');
        })(),
        problem: '',
        customer: (() => {
          const id = (s as any).customerId as number | undefined;
          const fromIndex = id ? customerIndex[id]?.name : '';
          if (fromIndex) return fromIndex;
          const inline = (s as any).customerName as string | undefined;
          if (inline && inline.trim()) return inline.trim();
          return id ? `Customer #${id}` : '';
        })(),
        phone: (s.customerId && customerIndex[s.customerId]?.phone) || s.customerPhone || '',
        tech: ((): string => {
          const at = (s.assignedTo || '').toString().trim();
          if (!at) return '';
          if (techIndex[at]) return techIndex[at];
          for (const [, label] of Object.entries(techIndex)) {
            if (!label) continue;
            if (label === at) return label;
            const first = label.split(' ')[0];
            if (first && first === at) return label;
          }
          return '';
        })(),
        total: Number(s.totals?.total || s.total || 0) || 0,
        remaining: (Number(s.totals?.total || s.total || 0) || 0) - (Number(s.amountPaid || 0) || 0),
      })),
    ];
    return mapped
      .filter(r => {
        if (technicianFilter) {
          const at = (r.tech || '').toString();
          if (technicianFilter === '__unassigned') { if (at) return false; }
          else {
            // allow match by tech id or by mapped label
            const match = Object.keys(techIndex).some(id => id === technicianFilter && (at === id || at === techIndex[id]));
            if (!match) return false;
          }
        }
        if (from && r.date < from) return false;
        if (to && r.date > to) return false;
        return true;
      })
      .sort((a, b) => b.id - a.id);
  }, [wo, sa, technicianFilter, dateFrom, dateTo, techIndex, customerIndex]);

  return (
    <div className="p-2">
      <table className="w-full text-sm">
        <thead className="bg-zinc-800 text-zinc-300">
          <tr>
            <th className="px-2 py-2 text-left">Invoice #</th>
            <th className="px-2 py-2 text-left">Type</th>
            <th className="px-2 py-2 text-left">Status</th>
            <th className="px-2 py-2 text-left">Tech</th>
            <th className="px-2 py-2 text-left">Customer</th>
            <th className="px-2 py-2 text-left">Phone</th>
            <th className="px-2 py-2 text-left">Date</th>
            <th className="px-2 py-2 text-left">Description</th>
            <th className="px-2 py-2 text-left">Items</th>
            <th className="px-2 py-2 text-left">Problem</th>
            <th className="px-2 py-2 text-right">Total</th>
            <th className="px-2 py-2 text-right">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {loading && (<tr><td colSpan={10} className="p-6 text-center text-zinc-500">Loading...</td></tr>)}
          {!loading && rows.length === 0 && (<tr><td colSpan={10} className="p-6 text-center text-zinc-500">No entries yet</td></tr>)}
          {!loading && rows.map(r => {
            const phone = (() => {
              const raw = (r.phone || '') as string;
              try { const { formatPhone } = require('./lib/format'); return formatPhone(raw) || raw || ''; } catch { return raw || ''; }
            })();
            return (
              <tr
                key={`${r.type}-${r.id}`}
                className="odd:bg-zinc-900 even:bg-zinc-800/40 cursor-pointer"
                onDoubleClick={async () => {
                  try {
                    const api = (window as any).api;
                    if (r.type === 'workorder') {
                      await api.openNewWorkOrder?.({ workOrderId: r.id });
                    } else {
                      const payload = { id: r.id };
                      await api.openNewSale?.(payload);
                    }
                  } catch (e) { console.error('Open editor failed', e); }
                }}
              >
                <td className="px-2 py-1 font-mono">GB{String(r.id).padStart(7,'0')}</td>
                <td className="px-2 py-1 capitalize">{r.type}</td>
                <td className="px-2 py-1 capitalize">{r.status}</td>
                <td className="px-2 py-1">{r.tech}</td>
                <td className="px-2 py-1 truncate" title={r.customer}>{r.customer || (r.type === 'sale' ? ('Customer #' + r.id) : '')}</td>
                <td className="px-2 py-1 whitespace-nowrap" title={phone}>{phone}</td>
                <td className="px-2 py-1">{isNaN(r.date.getTime()) ? '' : r.date.toISOString().slice(0,10)}</td>
                <td className="px-2 py-1 truncate" title={r.desc}>{r.desc}</td>
                <td className="px-2 py-1 max-w-[320px] truncate" title={r.items || ''}>{r.items || ''}</td>
                <td className="px-2 py-1 max-w-[260px] truncate" title={r.problem || ''}>{r.problem || ''}</td>
                <td className="px-2 py-1 text-right">${r.total.toFixed(2)}</td>
                <td className="px-2 py-1 text-right">${r.remaining.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
