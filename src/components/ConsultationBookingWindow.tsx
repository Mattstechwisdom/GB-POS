import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatPhone } from '../lib/format';
import { SC_CITIES } from '../lib/scCities';

const CONSULTATION_BASE_RATE = 75;
const CONSULTATION_EXTRA_RATE = 50;
const CONSULTATION_DISTANCE_FEE = 20;
const CONSULTATION_DISTANCE_THRESHOLD = 15; // miles

// Haversine formula – returns distance in miles between two lat/lng points
function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GEOCODE_CACHE = new Map<string, { lat: number; lng: number } | null>();

async function geocodeAddress(address: string, near?: { lat: number; lng: number }): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = String(address || '').trim();
    if (!q) return null;

    const cacheKey = `${q.toLowerCase()}|${near ? `${near.lat.toFixed(4)},${near.lng.toFixed(4)}` : ''}`;
    if (GEOCODE_CACHE.has(cacheKey)) return GEOCODE_CACHE.get(cacheKey) ?? null;

    const params = new URLSearchParams({
      q,
      format: 'json',
      limit: '5',
      addressdetails: '1',
      countrycodes: 'us',
    });

    if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
      const delta = 1.0;
      const left = (near.lng - delta).toFixed(6);
      const right = (near.lng + delta).toFixed(6);
      const top = (near.lat + delta).toFixed(6);
      const bottom = (near.lat - delta).toFixed(6);
      params.set('viewbox', `${left},${top},${right},${bottom}`);
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { 'Accept-Language': 'en-US,en' } }
    );
    const data = await res.json() as any[];
    if (!Array.isArray(data) || !data.length) {
      GEOCODE_CACHE.set(cacheKey, null);
      return null;
    }

    const parsed = data
      .map((d) => ({
        lat: Number.parseFloat(String(d?.lat ?? '')),
        lng: Number.parseFloat(String(d?.lon ?? '')),
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (!parsed.length) {
      GEOCODE_CACHE.set(cacheKey, null);
      return null;
    }

    let best = parsed[0];
    if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
      let bestD = Number.POSITIVE_INFINITY;
      for (const p of parsed) {
        const d = haversineDistanceMiles(near.lat, near.lng, p.lat, p.lng);
        if (d < bestD) { bestD = d; best = p; }
      }
    }

    GEOCODE_CACHE.set(cacheKey, best);
    return best;
  } catch {
    return null;
  }
}

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
  const isModalShell = useMemo(() => {
    try { return !!document.querySelector('[data-modal-shell="1"]'); } catch { return false; }
  }, []);

  // ── Customer state ──────────────────────────────────────────────
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
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
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [hours, setHours] = useState(1);
  const [driverFee, setDriverFee] = useState(0);

  // Shop location (used for distance-based driver fee)
  const [shopAddress, setShopAddress] = useState<string>('');
  const [shopLat, setShopLat] = useState<number | null>(null);
  const [shopLng, setShopLng] = useState<number | null>(null);
  const [distanceMiles, setDistanceMiles] = useState<number | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceFeeApplied, setDistanceFeeApplied] = useState(false);

  const normalizeAddressKey = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const formatScAddress = useCallback((street: string, cityName: string, zipCode: string) => {
    const s = String(street || '').trim();
    const c = String(cityName || '').trim();
    const z = String(zipCode || '').trim();

    const parts: string[] = [];
    if (s) parts.push(s);
    if (c) parts.push(c);

    const tail = `SC${z ? ` ${z}` : ''}`.trim();
    if (tail) parts.push(tail);

    return parts.join(', ').trim();
  }, []);

  const fullAddress = useMemo(
    () => formatScAddress(streetAddress, city, zip),
    [city, formatScAddress, streetAddress, zip]
  );

  const upsertAddressHistory = useCallback(async (addr: string) => {
    try {
      const address = String(addr || '').trim();
      if (address.length < 8) return;
      if (!/\d/.test(address)) return;
      const key = normalizeAddressKey(address);
      if (!key) return;
      const now = new Date().toISOString();

      const existingList = await api.dbGet('addressHistory').catch(() => []);
      const arr: any[] = Array.isArray(existingList) ? existingList : [];
      const existing = arr.find((r) => normalizeAddressKey(String(r?.key || r?.address || '')) === key);
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
      const afterArr: any[] = Array.isArray(after) ? after : [];
      const CAP = 500;
      if (afterArr.length > CAP) {
        const sorted = [...afterArr].sort((a, b) => String(b?.lastUsedAt || '').localeCompare(String(a?.lastUsedAt || '')));
        const extras = sorted.slice(CAP);
        for (const ex of extras) {
          try { if (ex?.id != null) await api.dbDelete('addressHistory', ex.id); } catch {}
        }
      }
    } catch {
      // ignore
    }
  }, [api]);

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
    (async () => {
      try {
        const existing = await api.dbGet('settings');
        const rec = (existing || []).find((s: any) => s?.shopAddress != null || s?.shopLat != null || s?.shopLng != null);
        if (rec) {
          setShopAddress(String(rec.shopAddress || '').trim());
          const slat = rec.shopLat;
          const slng = rec.shopLng;
          setShopLat(typeof slat === 'number' ? slat : (slat == null ? null : Number(slat)));
          setShopLng(typeof slng === 'number' ? slng : (slng == null ? null : Number(slng)));
        }
      } catch {
        // ignore
      }
    })();
  }, [api]);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.dbGet('customers');
        setAllCustomers(Array.isArray(list) ? list : []);
      } catch {
        setAllCustomers([]);
      }
    })();
  }, [api]);

  useEffect(() => () => {
    if (searchDebounce.current) {
      clearTimeout(searchDebounce.current);
      searchDebounce.current = null;
    }
  }, []);

  // Live customer search
  const searchCustomers = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) { setCustomerResults([]); return; }
    setSearchBusy(true);
    try {
      const ql = query.toLowerCase();
      const digits = query.replace(/\D/g, '');
      const filtered = (allCustomers || []).filter(c => {
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
  }, [allCustomers]);

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

  const billedHours = Math.max(1, Number(hours) || 1);
  const extraHours = Math.max(0, billedHours - 1);
  const laborCost = CONSULTATION_BASE_RATE + (extraHours * CONSULTATION_EXTRA_RATE);
  const totalCost = laborCost + driverFee;

  const computeDistanceFee = useCallback(async (clientAddress: string) => {
    const addr = String(clientAddress || '').trim();
    if (!addr) return { miles: null as number | null, feeApplied: false, fee: 0 };
    let sLat = shopLat;
    let sLng = shopLng;
    let sAddr = shopAddress;

    if ((sLat == null || sLng == null) && sAddr) {
      const sc = await geocodeAddress(sAddr);
      if (sc) {
        sLat = sc.lat;
        sLng = sc.lng;
      }
    }

    if (sLat == null || sLng == null) {
      return { miles: null as number | null, feeApplied: false, fee: 0 };
    }

    const clientCoords = await geocodeAddress(addr, { lat: sLat, lng: sLng });
    if (!clientCoords) {
      return { miles: null as number | null, feeApplied: false, fee: 0 };
    }

    const miles = haversineDistanceMiles(sLat, sLng, clientCoords.lat, clientCoords.lng);
    const feeApplied = miles > CONSULTATION_DISTANCE_THRESHOLD;
    return { miles, feeApplied, fee: feeApplied ? CONSULTATION_DISTANCE_FEE : 0 };
  }, [shopAddress, shopLat, shopLng]);

  const checkClientDistance = useCallback(async (clientAddress: string) => {
    if (!String(clientAddress || '').trim()) return;
    setDistanceLoading(true);
    try {
      const res = await computeDistanceFee(clientAddress);
      setDistanceMiles(res.miles);
      setDistanceFeeApplied(res.feeApplied);
      setDriverFee(res.fee);

      // If we successfully geocoded shop coords on-the-fly, persist them in local state.
      // (We don't write them back to DB here; Sales window owns shop settings edits.)
      if ((shopLat == null || shopLng == null) && shopAddress && res.miles != null) {
        const sc = await geocodeAddress(shopAddress);
        if (sc) { setShopLat(sc.lat); setShopLng(sc.lng); }
      }
    } catch {
      setDistanceMiles(null);
      setDistanceFeeApplied(false);
      setDriverFee(0);
    } finally {
      setDistanceLoading(false);
    }
  }, [computeDistanceFee, shopAddress, shopLat, shopLng]);

  const handleLocationChange = (type: 'instore' | 'athome') => {
    setLocationType(type);
    if (type === 'instore') {
      setDriverFee(0);
      setDistanceMiles(null);
      setDistanceFeeApplied(false);
    } else {
      setDriverFee(0);
      setDistanceMiles(null);
      setDistanceFeeApplied(false);
      if (String(fullAddress || '').trim() && (shopAddress || (shopLat != null && shopLng != null))) {
        checkClientDistance(fullAddress);
      }
    }
  };

  const canBook = !saving && date && (selectedCustomer || (showNewCustomer && newCust.firstName.trim() && newCust.lastName.trim()));

  async function handleBook() {
    if (!canBook) return;
    setSaving(true);
    setError('');
    try {
      if (locationType === 'athome') {
        const street = streetAddress.trim();
        const cityName = city.trim();
        const zipDigits = zip.replace(/\D/g, '').slice(0, 5);
        if (!street) throw new Error('Please enter the street address for at-home consultations.');
        if (!cityName) throw new Error('Please select a South Carolina city for at-home consultations.');
        const cityOk = SC_CITIES.some((c) => c.toLowerCase() === cityName.toLowerCase());
        if (!cityOk) throw new Error('Please choose a city from the SC list for at-home consultations.');
        if (zipDigits.length !== 5) throw new Error('Please enter a 5-digit ZIP code for at-home consultations.');
      }

      let effectiveDriverFee = 0;
      if (locationType === 'athome') {
        const res = await computeDistanceFee(fullAddress);
        effectiveDriverFee = res.fee;
        setDistanceMiles(res.miles);
        setDistanceFeeApplied(res.feeApplied);
        setDriverFee(res.fee);
      }

      const effectiveTotalCost = laborCost + effectiveDriverFee;

      if (locationType === 'athome') {
        try { await upsertAddressHistory(fullAddress); } catch {}
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
        if (customer?.id != null) {
          const created = customer as Customer;
          setAllCustomers((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            if (list.some((c) => c?.id === created.id)) return list;
            return [created, ...list];
          });
        }
      }

      const customerName = customerDisplayName(customer!);
      const customerPhone = customer!.phone || '';
      const now = new Date().toISOString();

      // 2. Create consultation sale record
      const purpose = title.trim() || 'Consultation';
      const baseItem: any = {
        id: crypto.randomUUID(),
        description: purpose,
        qty: 1,
        price: CONSULTATION_BASE_RATE,
        consultationHours: 1,
        category: 'Consultation',
        inStock: true,
      };
      const extraItem: any = extraHours > 0 ? {
        id: crypto.randomUUID(),
        description: `${purpose} (Additional Hours)`,
        qty: extraHours,
        price: CONSULTATION_EXTRA_RATE,
        consultationHours: extraHours,
        category: 'Consultation',
        inStock: true,
      } : null;

      const driverItem = effectiveDriverFee > 0 ? {
        id: crypto.randomUUID(),
        description: `Driver / Distance Fee (> ${CONSULTATION_DISTANCE_THRESHOLD} mi)`,
        qty: 1,
        price: effectiveDriverFee,
        category: 'Consultation',
        inStock: true,
      } : null;

      const saleItems = [baseItem, extraItem, driverItem].filter(Boolean);

      const saleRecord: any = {
        customerId: customer!.id,
        customerName,
        customerPhone,
        category: 'Consultation',
        items: saleItems,
        itemDescription: title.trim() || 'Consultation',
        quantity: billedHours,
        price: CONSULTATION_BASE_RATE,
        status: 'open',
        assignedTo: technician || undefined,
        notes: notes.trim() || undefined,
        consultationHours: billedHours,
        consultationType: locationType,
        consultationAddress: locationType === 'athome' ? fullAddress.trim() : undefined,
        appointmentDate: date,
        appointmentTime: time || undefined,
        appointmentEndTime: endTime || undefined,
        driverFee: effectiveDriverFee > 0 ? effectiveDriverFee : undefined,
        laborCost: laborCost,
        partCosts: 0,
        totals: { subTotal: effectiveTotalCost, tax: 0, total: effectiveTotalCost, remaining: effectiveTotalCost },
        total: effectiveTotalCost,
        checkInAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const createdSale = await api.dbAdd('sales', saleRecord);

      // 3. Create calendar event
      const location = locationType === 'athome'
        ? (fullAddress.trim() || 'At Home')
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
          {!isModalShell && (
            <button
              onClick={() => window.close()}
              className="px-6 py-2 bg-[#39FF14] text-black font-semibold rounded hover:brightness-110 mr-3"
            >
              Close
            </button>
          )}
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
    <div className="h-screen bg-zinc-900 text-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-700 shrink-0">
        <h1 className="text-xl font-bold tracking-wide">Book Consultation</h1>
        {!isModalShell && (
          <button
            onClick={() => window.close()}
            className="px-3 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded hover:bg-zinc-700"
          >
            Cancel
          </button>
        )}
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
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-4">
                  <label className="block text-[11px] text-zinc-500 mb-1">Street Address</label>
                  <input
                    className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    placeholder="123 Main St"
                    value={streetAddress}
                    onChange={e => setStreetAddress(e.target.value)}
                    onBlur={() => {
                      if (fullAddress) upsertAddressHistory(fullAddress);
                      if (shopAddress || (shopLat != null && shopLng != null)) {
                        if (fullAddress) checkClientDistance(fullAddress);
                      }
                    }}
                    autoFocus
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] text-zinc-500 mb-1">City (SC)</label>
                  <input
                    list="sc-cities"
                    className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    placeholder="Start typing…"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    onBlur={() => {
                      if (fullAddress) upsertAddressHistory(fullAddress);
                      if (shopAddress || (shopLat != null && shopLng != null)) {
                        if (fullAddress) checkClientDistance(fullAddress);
                      }
                    }}
                  />
                  <datalist id="sc-cities">
                    {SC_CITIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">State</label>
                  <input
                    className="w-full bg-zinc-900/70 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-400"
                    value="SC"
                    readOnly
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">ZIP</label>
                  <input
                    inputMode="numeric"
                    className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    placeholder="#####"
                    value={zip}
                    onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    onBlur={() => {
                      if (fullAddress) upsertAddressHistory(fullAddress);
                      if (shopAddress || (shopLat != null && shopLng != null)) {
                        if (fullAddress) checkClientDistance(fullAddress);
                      }
                    }}
                  />
                </div>
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
                min="1"
                step="0.5"
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                value={hours}
                onChange={e => setHours(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">First Hour ($)</label>
              <input
                type="number"
                min="0"
                step="5"
                className="w-full bg-yellow-100 text-black border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                value={CONSULTATION_BASE_RATE}
                readOnly
              />
              <div className="mt-1 text-[11px] text-zinc-500">
                Additional hours: ${CONSULTATION_EXTRA_RATE}/hr
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-400 mb-1">Labor</div>
              <div className="text-base font-semibold text-zinc-200">${laborCost.toFixed(2)}</div>
            </div>
          </div>
          {locationType === 'athome' && (
            <div className="mt-3 pt-3 border-t border-zinc-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-300">Driver / Distance Fee</span>
                  <span className="text-xs text-zinc-500">(only if &gt;{CONSULTATION_DISTANCE_THRESHOLD} miles from shop)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">$</span>
                  <input
                    type="number"
                    className="w-20 bg-yellow-100 text-black border border-zinc-600 rounded px-2 py-1 text-sm text-right focus:border-blue-400 focus:outline-none"
                    value={driverFee}
                    readOnly
                  />
                  <button
                    type="button"
                    className="px-3 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => checkClientDistance(fullAddress)}
                    disabled={distanceLoading || !fullAddress.trim() || !(shopAddress || (shopLat != null && shopLng != null))}
                    title={!shopAddress && (shopLat == null || shopLng == null) ? 'Set shop location in the Sales window to enable distance checks.' : undefined}
                  >
                    {distanceLoading ? 'Checking…' : 'Check'}
                  </button>
                </div>
              </div>
              {distanceMiles != null && (
                <div className={`mt-1 text-xs ${distanceFeeApplied ? 'text-orange-400' : 'text-green-400'}`}>
                  {distanceFeeApplied
                    ? `⚠ ${distanceMiles.toFixed(1)} mi from shop — $${CONSULTATION_DISTANCE_FEE} fee applied`
                    : `✓ ${distanceMiles.toFixed(1)} mi from shop — within range`}
                </div>
              )}
              {!shopAddress && (shopLat == null || shopLng == null) && (
                <div className="mt-1 text-[11px] text-zinc-500">
                  Shop location not set — distance check unavailable.
                </div>
              )}
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
