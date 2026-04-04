import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatPhone } from '../lib/format';

const HOURLY_RATE_DEFAULT = 75;
const DRIVER_FEE_DEFAULT = 40;

type Customer = {
  id: number;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
};

type Technician = {
  id: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
};

function customerDisplayName(c: Customer) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || `Customer #${c.id}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addHour(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}

export default function ConsultationBookingWindow() {
  const api = (window as any).api;

  // ── Customer state ──────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [searchBusy, setSearchBusy] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Consultation state ──────────────────────────────────────────
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [technician, setTechnician] = useState('');
  const [locationType, setLocationType] = useState<'instore' | 'athome'>('instore');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState(1);
  const [hourlyRate, setHourlyRate] = useState(HOURLY_RATE_DEFAULT);
  const [driverFee, setDriverFee] = useState(0);

  type AddressHistoryRecord = { id: number; key?: string; address?: string; usedCount?: number; lastUsedAt?: string };
  const [addressHistory, setAddressHistory] = useState<AddressHistoryRecord[]>([]);
  const [addressMatches, setAddressMatches] = useState<AddressHistoryRecord[]>([]);
  const [addressSuggestOpen, setAddressSuggestOpen] = useState(false);
  const addressSuggestTimer = useRef<number | undefined>(undefined);
  const normalizeAddressKey = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const refreshAddressHistory = useCallback(async () => {
    try {
      const list = await api.dbGet('addressHistory');
      setAddressHistory(Array.isArray(list) ? list : []);
    } catch {
      setAddressHistory([]);
    }
  }, [api]);

  const upsertAddressHistory = useCallback(async (addr: string) => {
    try {
      const address = String(addr || '').trim();
      if (address.length < 8) return;
      if (!/\d/.test(address)) return;
      const key = normalizeAddressKey(address);
      if (!key) return;
      const now = new Date().toISOString();
      const existing = (addressHistory || []).find((r) => normalizeAddressKey(String(r.key || r.address || '')) === key);
      if (existing?.id != null) {
        await api.dbUpdate('addressHistory', existing.id, {
          ...existing,
          key,
          address,
          usedCount: (Number(existing.usedCount) || 0) + 1,
          lastUsedAt: now,
        });
      } else {
        await api.dbAdd('addressHistory', { key, address, usedCount: 1, lastUsedAt: now });
      }
      const after = await api.dbGet('addressHistory').catch(() => []);
      const arr: any[] = Array.isArray(after) ? after : [];
      const CAP = 500;
      if (arr.length > CAP) {
        const sorted = [...arr].sort((a, b) => String(b?.lastUsedAt || '').localeCompare(String(a?.lastUsedAt || '')));
        const extras = sorted.slice(CAP);
        for (const ex of extras) {
          try { if (ex?.id != null) await api.dbDelete('addressHistory', ex.id); } catch {}
        }
      }
      refreshAddressHistory();
    } catch {
      // ignore
    }
  }, [addressHistory, api, refreshAddressHistory]);

  // ── Technicians list ────────────────────────────────────────────
  const [techs, setTechs] = useState<Technician[]>([]);

  // ── Submission state ────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ saleId: number; customerName: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const list = await api.dbGet('technicians');
        setTechs(Array.isArray(list) ? list.filter((t: any) => t?.active !== false) : []);
      } catch {}
    })();
  }, [api]);

  useEffect(() => {
    refreshAddressHistory();
  }, [refreshAddressHistory]);

  // Live customer search
  const searchCustomers = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) { setCustomerResults([]); return; }
    setSearchBusy(true);
    try {
      const all: Customer[] = await api.dbGet('customers');
      const ql = query.toLowerCase();
      const digits = query.replace(/\D/g, '');
      const filtered = (all || []).filter(c => {
        const full = customerDisplayName(c).toLowerCase();
        if (full.includes(ql)) return true;
        if (digits && (c.phone || '').replace(/\D/g, '').includes(digits)) return true;
        return false;
      });
      setCustomerResults(filtered.slice(0, 8));
    } catch {
      setCustomerResults([]);
    } finally {
      setSearchBusy(false);
    }
  }, [api]);

  const handleQueryChange = (v: string) => {
    setCustomerQuery(v);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => searchCustomers(v), 200);
  };

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerQuery('');
    setCustomerResults([]);
    setShowNewCustomer(false);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setShowNewCustomer(false);
    setNewCust({ firstName: '', lastName: '', phone: '', email: '' });
  };

  // When start time changes, push end time by 1 hour
  const handleTimeChange = (v: string) => {
    setTime(v);
    setEndTime(addHour(v));
  };

  const techLabel = (t: Technician) =>
    t.nickname || [t.firstName, t.lastName].filter(Boolean).join(' ').trim() || t.id;

  const laborCost = hours * hourlyRate;
  const totalCost = laborCost + driverFee;

  // Auto-apply driver fee when switching location type
  const handleLocationChange = (type: 'instore' | 'athome') => {
    setLocationType(type);
    setDriverFee(type === 'athome' ? DRIVER_FEE_DEFAULT : 0);
  };

  const canBook = !saving && date && (selectedCustomer || (showNewCustomer && newCust.firstName.trim() && newCust.lastName.trim()));

  async function handleBook() {
    if (!canBook) return;
    setSaving(true);
    setError('');
    try {
      if (locationType === 'athome') {
        try { await upsertAddressHistory(address); } catch {}
      }
      // 1. Resolve or create customer
      let customer = selectedCustomer;
      if (!customer) {
        const now = new Date().toISOString();
        customer = await api.dbAdd('customers', {
          firstName: newCust.firstName.trim(),
          lastName: newCust.lastName.trim(),
          phone: newCust.phone.replace(/\D/g, '').slice(-10),
          email: newCust.email.trim(),
          createdAt: now,
          updatedAt: now,
        });
      }

      const customerName = customerDisplayName(customer!);
      const customerPhone = customer!.phone || '';
      const now = new Date().toISOString();

      // 2. Create consultation sale record
      const saleItem = {
        id: crypto.randomUUID(),
        description: title.trim() || 'Consultation',
        qty: hours,
        price: hourlyRate,
        consultationHours: hours,
        category: 'Consultation',
        inStock: true,
      };
      const driverItem = driverFee > 0 ? {
        id: crypto.randomUUID(),
        description: 'Driver / On-Site Visit Fee',
        qty: 1,
        price: driverFee,
        category: 'Consultation',
        inStock: true,
      } : null;
      const saleItems = driverItem ? [saleItem, driverItem] : [saleItem];

      const saleRecord: any = {
        customerId: customer!.id,
        customerName,
        customerPhone,
        category: 'Consultation',
        items: saleItems,
        itemDescription: title.trim() || 'Consultation',
        quantity: hours,
        price: hourlyRate,
        status: 'open',
        assignedTo: technician || undefined,
        notes: notes.trim() || undefined,
        consultationHours: hours,
        consultationType: locationType,
        consultationAddress: locationType === 'athome' ? address.trim() : undefined,
        appointmentDate: date,
        appointmentTime: time || undefined,
        appointmentEndTime: endTime || undefined,
        driverFee: driverFee > 0 ? driverFee : undefined,
        laborCost: laborCost,
        partCosts: 0,
        totals: { subTotal: totalCost, tax: 0, total: totalCost, remaining: totalCost },
        total: totalCost,
        checkInAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const createdSale = await api.dbAdd('sales', saleRecord);

      // 3. Create calendar event
      const location = locationType === 'athome'
        ? (address.trim() || 'At Home')
        : 'In-Store';

      await api.dbAdd('calendarEvents', {
        category: 'consultation',
        date,
        time: time || undefined,
        endTime: endTime || undefined,
        title: title.trim() || 'Consultation',
        customerName,
        customerPhone,
        customerId: customer!.id,
        technician: technician || undefined,
        notes: notes.trim() || undefined,
        location,
        consultationType: locationType,
        saleId: createdSale?.id,
        source: 'consultation',
      });

      setDone({ saleId: createdSale?.id, customerName });
    } catch (e: any) {
      setError(e?.message || String(e) || 'Failed to book consultation.');
    } finally {
      setSaving(false);
    }
  }

  // ── Success screen ──────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-zinc-900 text-gray-100 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">Consultation Booked</h1>
          <p className="text-zinc-300 mb-1">Client: <span className="font-semibold">{done.customerName}</span></p>
          <p className="text-zinc-300 mb-1">
            {date} at {time}{endTime ? ` – ${endTime}` : ''}
          </p>
          {done.saleId && (
            <p className="text-zinc-400 text-sm mb-4">Sale #{done.saleId} created</p>
          )}
          <p className="text-zinc-400 text-sm mb-6">
            Added to calendar. Check the Calendar window to view or edit.
          </p>
          <button
            onClick={() => window.close()}
            className="px-6 py-2 bg-[#39FF14] text-black font-semibold rounded hover:brightness-110 mr-3"
          >
            Close
          </button>
          <button
            onClick={() => { setDone(null); clearCustomer(); setTitle(''); setNotes(''); setDate(todayISO()); setTime('10:00'); setEndTime('11:00'); setHours(1); setError(''); }}
            className="px-6 py-2 bg-zinc-700 text-zinc-200 font-semibold rounded hover:bg-zinc-600"
          >
            Book Another
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-900 text-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-700 shrink-0">
        <h1 className="text-xl font-bold tracking-wide">Book Consultation</h1>
        <button
          onClick={() => window.close()}
          className="px-3 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4 space-y-5">

        {/* ── Client Section ─────────────────────────────────────── */}
        <section className="bg-zinc-800 border border-zinc-700 rounded p-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Client</h2>

          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-zinc-700 rounded px-3 py-2">
              <div>
                <div className="font-semibold">{customerDisplayName(selectedCustomer)}</div>
                {selectedCustomer.phone && (
                  <div className="text-sm text-zinc-400">{formatPhone(selectedCustomer.phone) || selectedCustomer.phone}</div>
                )}
                {selectedCustomer.email && (
                  <div className="text-sm text-zinc-400">{selectedCustomer.email}</div>
                )}
              </div>
              <button onClick={clearCustomer} className="text-xs text-zinc-400 hover:text-red-400 ml-4">Change</button>
            </div>
          ) : showNewCustomer ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-300">New Client</span>
                <button onClick={() => setShowNewCustomer(false)} className="text-xs text-zinc-400 hover:text-zinc-200">← Back to search</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">First Name <span className="text-red-400">*</span></label>
                  <input
                    className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    value={newCust.firstName}
                    onChange={e => setNewCust(p => ({ ...p, firstName: e.target.value }))}
                    placeholder="First name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Last Name <span className="text-red-400">*</span></label>
                  <input
                    className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    value={newCust.lastName}
                    onChange={e => setNewCust(p => ({ ...p, lastName: e.target.value }))}
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Phone</label>
                  <input
                    type="tel"
                    className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    value={newCust.phone}
                    onChange={e => setNewCust(p => ({ ...p, phone: e.target.value }))}
                    placeholder="555-555-5555"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    value={newCust.email}
                    onChange={e => setNewCust(p => ({ ...p, email: e.target.value }))}
                    placeholder="email@example.com"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="relative">
              <input
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm focus:border-blue-400 focus:outline-none pr-20"
                placeholder="Search by name or phone…"
                value={customerQuery}
                onChange={e => handleQueryChange(e.target.value)}
                autoFocus
              />
              {searchBusy && (
                <span className="absolute right-16 top-1/2 -translate-y-1/2 text-xs text-zinc-500">…</span>
              )}
              <button
                onClick={() => { setShowNewCustomer(true); setCustomerQuery(''); setCustomerResults([]); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
              >
                New
              </button>
              {customerResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 bg-zinc-800 border border-zinc-600 rounded shadow-xl max-h-44 overflow-auto">
                  {customerResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-700 text-sm flex items-center justify-between"
                    >
                      <span>{customerDisplayName(c)}</span>
                      {c.phone && <span className="text-zinc-400 text-xs ml-2">{formatPhone(c.phone) || c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Consultation Details ───────────────────────────────── */}
        <section className="bg-zinc-800 border border-zinc-700 rounded p-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Consultation Details</h2>

          <div className="grid grid-cols-2 gap-4">

            {/* Date */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Date <span className="text-red-400">*</span></label>
              <input
                type="date"
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>

            {/* Technician */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Technician</label>
              <select
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                value={technician}
                onChange={e => setTechnician(e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {techs.map(t => (
                  <option key={t.id} value={techLabel(t)}>{techLabel(t)}</option>
                ))}
              </select>
            </div>

            {/* Start Time */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Start Time</label>
              <input
                type="time"
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                value={time}
                onChange={e => handleTimeChange(e.target.value)}
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">End Time</label>
              <input
                type="time"
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>

            {/* Title / Purpose */}
            <div className="col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Purpose / Title</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                placeholder="e.g. Home network setup, device audit, data recovery consult…"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Notes</label>
              <textarea
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none resize-none"
                rows={2}
                placeholder="Additional notes for this consultation…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ── Location ──────────────────────────────────────────── */}
        <section className="bg-zinc-800 border border-zinc-700 rounded p-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Location</h2>
          <div className="flex gap-6 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="locationType"
                checked={locationType === 'instore'}
                onChange={() => handleLocationChange('instore')}
                className="accent-blue-500 w-4 h-4"
              />
              <span className="text-sm font-medium">In-Store</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="locationType"
                checked={locationType === 'athome'}
                onChange={() => handleLocationChange('athome')}
                className="accent-blue-500 w-4 h-4"
              />
              <span className="text-sm font-medium">At-Home / On-Site</span>
            </label>
          </div>
          {locationType === 'athome' && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Client Address</label>
              <div className="relative">
                <input
                  className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                  placeholder="123 Main St, City, State ZIP"
                  value={address}
                  onChange={e => {
                    const v = e.target.value;
                    setAddress(v);
                    if (addressSuggestTimer.current !== undefined) window.clearTimeout(addressSuggestTimer.current);
                    addressSuggestTimer.current = window.setTimeout(() => {
                      const q = normalizeAddressKey(v);
                      if (!q || q.length < 2) {
                        setAddressMatches([]);
                        setAddressSuggestOpen(false);
                        return;
                      }
                      const list = (addressHistory || [])
                        .filter((r) => normalizeAddressKey(String(r.address || '')).includes(q))
                        .sort((a, b) => {
                          const bc = Number(b.usedCount) || 0;
                          const ac = Number(a.usedCount) || 0;
                          if (bc !== ac) return bc - ac;
                          return String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || ''));
                        })
                        .slice(0, 8);
                      setAddressMatches(list);
                      setAddressSuggestOpen(true);
                    }, 120);
                  }}
                  onFocus={() => {
                    const q = normalizeAddressKey(address);
                    if (q.length >= 2) setAddressSuggestOpen(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setAddressSuggestOpen(false), 150);
                    upsertAddressHistory(address);
                  }}
                  autoFocus
                />
                {addressSuggestOpen && addressMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-zinc-800 border border-zinc-600 rounded shadow-xl max-h-44 overflow-auto">
                    {addressMatches.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700"
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          const addr = String(r.address || '');
                          setAddress(addr);
                          setAddressSuggestOpen(false);
                          setAddressMatches([]);
                          upsertAddressHistory(addr);
                        }}
                      >
                        <div className="text-zinc-100">{String(r.address || '')}</div>
                        <div className="text-[11px] text-zinc-400">Used {Number(r.usedCount) || 0}×</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Pricing ───────────────────────────────────────────── */}
        <section className="bg-zinc-800 border border-zinc-700 rounded p-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Pricing</h2>
          <div className="grid grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Estimated Hours</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                value={hours}
                onChange={e => setHours(Math.max(0.5, Number(e.target.value) || 0.5))}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Hourly Rate ($)</label>
              <input
                type="number"
                min="0"
                step="5"
                className="w-full bg-yellow-100 text-black border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                value={hourlyRate}
                onChange={e => setHourlyRate(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-400 mb-1">Labor</div>
              <div className="text-base font-semibold text-zinc-200">${laborCost.toFixed(2)}</div>
            </div>
          </div>
          {locationType === 'athome' && (
            <div className="mt-3 pt-3 border-t border-zinc-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-300">Driver / On-Site Visit Fee</span>
                <span className="text-xs text-zinc-500">(auto-applied for at-home calls)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">$</span>
                <input
                  type="number"
                  min="0"
                  step="5"
                  className="w-20 bg-yellow-100 text-black border border-zinc-600 rounded px-2 py-1 text-sm text-right focus:border-blue-400 focus:outline-none"
                  value={driverFee}
                  onChange={e => setDriverFee(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-zinc-700 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-300">Estimated Total</span>
            <span className="text-xl font-bold text-[#39FF14]">${totalCost.toFixed(2)}</span>
          </div>
        </section>

        {error && (
          <div className="text-red-400 text-sm bg-red-950/40 border border-red-700 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-5 py-3 border-t border-zinc-700 flex items-center justify-between bg-zinc-900">
        <div className="text-sm text-zinc-400">
          {canBook
            ? `Booking for ${selectedCustomer ? customerDisplayName(selectedCustomer) : `${newCust.firstName} ${newCust.lastName}`.trim()} on ${date}`
            : <span className="text-zinc-500">Select a client and date to book.</span>
          }
        </div>
        <button
          onClick={handleBook}
          disabled={!canBook}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded transition-colors"
        >
          {saving ? 'Booking…' : 'Book Consultation'}
        </button>
      </div>
    </div>
  );
}
