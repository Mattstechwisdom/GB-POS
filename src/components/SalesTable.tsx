import React, { useEffect, useMemo, useState } from 'react';
import { listTechnicians } from '../lib/admin';
import { formatPhone } from '../lib/format';
import { usePagination } from '../lib/pagination';

type Props = {
  technicianFilter?: string;
  dateFrom?: string;
  dateTo?: string;
};

const SalesTable: React.FC<Props> = ({ technicianFilter = '', dateFrom = '', dateTo = '' }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [techIndex, setTechIndex] = useState<Record<string, string>>({});
  const [customerIndex, setCustomerIndex] = useState<Record<number, { name: string; phone?: string }>>({});
  const { page, setPage, pageSize, setTotalItems } = usePagination();

  async function load() {
    try {
      setLoading(true);
      const list = await (window as any).api.dbGet('sales');
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Failed loading sales', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const off = (window as any).api.onSalesChanged?.(() => load());
    return () => { try { off && off(); } catch {} };
  }, []);

  useEffect(() => {
    const refreshTechs = async () => {
      try {
        const techs = await listTechnicians();
        const map: Record<string, string> = {};
        techs.forEach((t: any) => { map[t.id] = (t.nickname && t.nickname.trim()) || t.firstName || t.id; });
        setTechIndex(map);
      } catch (e) { /* ignore */ }
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
      } catch (e) { /* ignore */ }
    };
    refreshTechs();
    refreshCustomers();
    const offCustomers = (window as any).api.onCustomersChanged?.(() => refreshCustomers());
    return () => { try { offCustomers && offCustomers(); } catch {} };
  }, []);

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    return rows.filter((s: any) => {
      if (technicianFilter) {
        const at = (s.assignedTo || '').toString();
        if (technicianFilter === '__unassigned') { if (at) return false; }
        else {
          const match = Object.keys(techIndex).some(id => id === technicianFilter && (at === id || at === techIndex[id]));
          if (!match) return false;
        }
      }
      const d = new Date(s.checkInAt || s.createdAt || 0);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }).sort((a: any, b: any) => {
      const ad = new Date(a.checkInAt || a.createdAt || 0).getTime();
      const bd = new Date(b.checkInAt || b.createdAt || 0).getTime();
      return bd - ad;
    });
  }, [rows, technicianFilter, dateFrom, dateTo]);

  useEffect(() => {
    setTotalItems(filtered.length);
    return () => {
      setTotalItems(0);
    };
  }, [filtered.length, setTotalItems]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const paged = useMemo(() => filtered.slice(startIdx, endIdx), [filtered, startIdx, endIdx]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage, setPage]);

  return (
    <div className="p-2">
      <table className="w-full text-sm">
        <thead className="bg-zinc-800 text-zinc-300">
          <tr>
            <th className="px-2 py-2 text-left">Invoice #</th>
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
          {loading && (
            <tr><td colSpan={11} className="p-6 text-center text-zinc-500">Loading...</td></tr>
          )}
          {!loading && filtered.length === 0 && (
            <tr><td colSpan={11} className="p-6 text-center text-zinc-500">No sales yet</td></tr>
          )}
          {!loading && paged.map((s: any) => {
            const date = (s.createdAt || s.checkInAt || '').toString().split('T')[0];
            const desc = (Array.isArray(s.items) && s.items[0]?.description) || s.itemDescription || '';
            const total = Number(s.totals?.total || s.total || 0) || 0;
            const remaining = total - Number(s.amountPaid || 0);
            const status = remaining <= 0 ? 'closed' : 'open';
            const techLabel = (() => {
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
            })();
            const phoneRaw = (s.customerPhone || (s.customerId && customerIndex[s.customerId!]?.phone) || '') as string;
            const phone = formatPhone(phoneRaw || '') || phoneRaw || '';
            const itemsText = (() => {
              const items = Array.isArray(s.items) ? s.items : [];
              const titles = items.map((it: any) => (it.description || it.name || it.title || '').toString().trim()).filter(Boolean);
              return titles.join(', ');
            })();
            const customerLabel = (() => {
              const id = (s as any).customerId as number | undefined;
              const fromIndex = id ? customerIndex[id]?.name : '';
              if (fromIndex) return fromIndex;
              const inline = (s as any).customerName as string | undefined;
              if (inline && inline.trim()) return inline.trim();
              return id ? (`Customer #${id}`) : '';
            })();
            return (
              <tr
                key={s.id}
                className="border-b border-zinc-800 hover:bg-zinc-800/60 cursor-pointer"
                onDoubleClick={async () => {
                  try {
                    const api = (window as any).api;
                    const payload = { id: s.id, customerId: s.customerId, customerName: s.customerName, customerPhone: s.customerPhone };
                    if (api && typeof api.openNewSale === 'function') await api.openNewSale(payload);
                    else {
                      const url = window.location.origin + '/?newSale=' + encodeURIComponent(JSON.stringify(payload));
                      window.open(url, '_blank', 'width=1600,height=1000');
                    }
                  } catch (e) { console.error('Open sale failed', e); }
                }}
              >
                <td className="px-2 py-2 font-mono">{typeof s.id === 'number' ? `GB${String(s.id).padStart(7,'0')}` : ''}</td>
                <td className="px-2 py-2 capitalize">{status}</td>
                <td className="px-2 py-2">{techLabel}</td>
                <td className="px-2 py-2 truncate" title={customerLabel}>{customerLabel}</td>
                <td className="px-2 py-2 whitespace-nowrap" title={phone}>{phone}</td>
                <td className="px-2 py-2">{date}</td>
                <td className="px-2 py-2 truncate" title={desc}>{desc || 'Sale Item'}</td>
                <td className="px-2 py-2 max-w-[320px] truncate" title={itemsText}>{itemsText}</td>
                <td className="px-2 py-2 max-w-[260px] truncate" title=""></td>
                <td className="px-2 py-2 text-right">${total.toFixed(2)}</td>
                <td className="px-2 py-2 text-right">${remaining.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SalesTable;
