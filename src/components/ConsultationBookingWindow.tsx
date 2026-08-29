import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { formatPhone } from '../lib/format';
import { SC_CITIES } from '../lib/scCities';
import CustomerOverviewWindow from './CustomerOverviewWindow';
import ClientUpdatePanel from '../workorders/ClientUpdatePanel';
import { customerMatchesSearchText } from '../lib/customerDuplicates';
import { listTechnicians, technicianDisplayName } from '../lib/admin';
import { SHOP_CONSULTATION_LOCATION } from '../lib/consultationLocation';
import { calculateConsultationPricing, CONSULTATION_BASE_RATE, CONSULTATION_EXTRA_RATE } from '../lib/consultationPricing';
import { consumeWindowPayload } from '../lib/windowPayload';
import { TechnicianAvatar } from '../lib/technicianIcons';
import {
  calculatePartnerConsultationCharge,
  consultationPartnerAddress,
  consultationPartnerGroups,
  normalizeConsultationPartner,
  sortConsultationPartners,
  type ConsultationPartner,
} from '../lib/consultationPartners';

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
  profileIcon?: string;
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

function PartnerEditor({
  partner,
  partners,
  onClose,
  onSave,
}: {
  partner?: ConsultationPartner | null;
  partners: ConsultationPartner[];
  onClose: () => void;
  onSave: (partner: ConsultationPartner) => void;
}) {
  const [draft, setDraft] = useState<ConsultationPartner>(() => normalizeConsultationPartner(partner || {}));
  const groups = consultationPartnerGroups(partners);
  const valid = !!draft.businessName.trim() && draft.hourlyRate >= 0 && !!draft.streetAddress.trim() && !!draft.city.trim() && draft.zip.length === 5;

  return (
    <div className="gb-partner-editor-backdrop fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-3" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="gb-partner-editor w-full max-w-[560px] max-h-[92vh] overflow-y-auto bg-zinc-900 border border-zinc-600 rounded-lg shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-700 bg-zinc-900 px-4 py-3">
          <div>
            <h2 className="font-bold text-lg">{partner ? 'Edit Partner' : 'Add Partner'}</h2>
            <p className="text-xs text-zinc-400">Save the location and consultation rate for future bookings.</p>
          </div>
          <button type="button" className="gb-icon-button" aria-label="Close partner editor" onClick={onClose}>X</button>
        </header>
        <div className="grid grid-cols-2 gap-3 p-4">
          <label className="col-span-2 text-xs text-zinc-400">Group
            <input list="consultation-partner-groups" className="mt-1 w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100" value={draft.group} onChange={event => setDraft({ ...draft, group: event.target.value })} placeholder="Optional group" />
            <datalist id="consultation-partner-groups">{groups.map(group => <option key={group} value={group} />)}</datalist>
          </label>
          <label className="col-span-2 text-xs text-zinc-400">Business Name
            <input autoFocus className="mt-1 w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100" value={draft.businessName} onChange={event => setDraft({ ...draft, businessName: event.target.value })} />
          </label>
          <label className="col-span-2 text-xs text-zinc-400">Custom Hourly Pricing
            <div className="mt-1 flex items-center gap-2"><span className="text-zinc-300">$</span><input type="number" min="0" step="0.01" className="w-full bg-yellow-100 border border-zinc-600 rounded px-3 py-2 text-sm text-black" value={draft.hourlyRate} onChange={event => setDraft({ ...draft, hourlyRate: Math.max(0, Number(event.target.value) || 0) })} /></div>
          </label>
          <label className="col-span-2 text-xs text-zinc-400">Street Address
            <input className="mt-1 w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100" value={draft.streetAddress} onChange={event => setDraft({ ...draft, streetAddress: event.target.value })} placeholder="123 Main St" />
          </label>
          <label className="col-span-2 flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm">
            <input type="checkbox" checked={draft.hasUnitNumber} onChange={event => setDraft({ ...draft, hasUnitNumber: event.target.checked, unitNumber: event.target.checked ? draft.unitNumber : '' })} />
            Unit Number
          </label>
          {draft.hasUnitNumber ? <label className="col-span-2 text-xs text-zinc-400">Unit / Suite
            <input className="mt-1 w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100" value={draft.unitNumber} onChange={event => setDraft({ ...draft, unitNumber: event.target.value })} />
          </label> : null}
          <label className="text-xs text-zinc-400">City
            <input list="sc-cities-partner" className="mt-1 w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100" value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })} />
            <datalist id="sc-cities-partner">{SC_CITIES.map(cityName => <option key={cityName} value={cityName} />)}</datalist>
          </label>
          <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
            <label className="text-xs text-zinc-400">State<input readOnly className="mt-1 w-full bg-zinc-800/70 border border-zinc-700 rounded px-2 py-2 text-sm text-zinc-400" value={draft.state || 'SC'} /></label>
            <label className="text-xs text-zinc-400">ZIP<input inputMode="numeric" className="mt-1 w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-2 text-sm text-zinc-100" value={draft.zip} onChange={event => setDraft({ ...draft, zip: event.target.value.replace(/\D/g, '').slice(0, 5) })} /></label>
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-700 px-4 py-3">
          <button type="button" className="px-4 py-2 bg-zinc-800 border border-zinc-600 rounded" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!valid} className="px-5 py-2 bg-blue-600 disabled:opacity-40 rounded font-semibold" onClick={() => onSave(normalizeConsultationPartner(draft))}>Save Partner</button>
        </footer>
      </div>
    </div>
  );
}

export default function ConsultationBookingWindow() {
  const api = (window as any).api;
  const customerPayload = useMemo(() => {
    try {
      const stored = consumeWindowPayload('consultation');
      if (stored !== null) return stored;
    } catch {}
    try {
      const raw = new URLSearchParams(window.location.search).get('consultation');
      if (!raw || raw === '1') return null;
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }, []);
  const isModalShell = useMemo(() => {
    try { return !!document.querySelector('[data-modal-shell="1"]'); } catch { return false; }
  }, []);

  // ── Customer state ──────────────────────────────────────────────
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerCreator, setShowCustomerCreator] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerIndexRef = useRef<Customer[]>([]);

  // ── Consultation state ──────────────────────────────────────────
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [technician, setTechnician] = useState('');
  const [locationType, setLocationType] = useState<'instore' | 'athome' | 'partner'>('instore');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [hours, setHours] = useState(1);
  const [customLaborCharge, setCustomLaborCharge] = useState<number | null>(null);
  const [driverFee, setDriverFee] = useState(0);
  const [partners, setPartners] = useState<ConsultationPartner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [partnerEditor, setPartnerEditor] = useState<ConsultationPartner | null | undefined>(undefined);
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false);
  const [partnerActions, setPartnerActions] = useState<ConsultationPartner | null>(null);
  const [settingsRecordId, setSettingsRecordId] = useState<any>(null);
  const partnerHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const selectedPartner = useMemo(() => partners.find(partner => partner.id === selectedPartnerId) || null, [partners, selectedPartnerId]);

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
  const [done, setDone] = useState<{ saleId: number; eventId?: number; customerName: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [clientUpdateOpen, setClientUpdateOpen] = useState(false);

  useEffect(() => {
    if (!done?.eventId) return;
    let alive = true;
    (async () => {
      try {
        let qrUrl = '';
        try {
          const result = await api?.qrGetStatusUrl?.('consult', done.eventId);
          if (result?.ok && result.url) qrUrl = result.url;
        } catch { /* QR helper unavailable */ }
        if (qrUrl) {
          const dataUrl: string = await QRCode.toDataURL(qrUrl, { width: 180, margin: 1, color: { dark: '#000000', light: '#ffffff' }, errorCorrectionLevel: 'M' });
          if (alive) setQrDataUrl(dataUrl);
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, [done?.eventId]);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const list = await listTechnicians();
        setTechs(Array.isArray(list) ? list : []);
      } catch {}
    })();
  }, []);

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
        const partnerRecord = (existing || []).find((row: any) => Array.isArray(row?.consultationPartners)) || rec || (existing || [])[0];
        if (partnerRecord?.id != null) setSettingsRecordId(partnerRecord.id);
        const savedPartners = Array.isArray(partnerRecord?.consultationPartners) ? partnerRecord.consultationPartners : [];
        setPartners(sortConsultationPartners(savedPartners.map((row: any) => normalizeConsultationPartner(row))));
      } catch {
        // ignore
      }
    })();
  }, [api]);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.dbGet('customers');
        const customers = Array.isArray(list) ? list : [];
        setAllCustomers(customers);
        const customerId = Number(customerPayload?.customerId || 0);
        if (customerId > 0) {
          const matched = customers.find((customer: Customer) => Number(customer.id) === customerId);
          if (matched) setSelectedCustomer(matched);
        }
      } catch {
        setAllCustomers([]);
      }
    })();
  }, [api, customerPayload]);

  useEffect(() => {
    try {
      const safe = Array.isArray(allCustomers) ? allCustomers : [];
      customerIndexRef.current = safe;
    } catch {
      customerIndexRef.current = [];
    }
  }, [allCustomers]);

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
      const idx = customerIndexRef.current || [];
      const out: Customer[] = [];
      for (const customer of idx) {
        if (customerMatchesSearchText(customer, query)) out.push(customer);
        if (out.length >= 8) break;
      }
      setCustomerResults(out);
    } catch {
      setCustomerResults([]);
    } finally {
      setSearchBusy(false);
    }
  }, []);

  const handleQueryChange = (v: string) => {
    setCustomerQuery(v);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => searchCustomers(v), 200);
  };

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerQuery('');
    setCustomerResults([]);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
  };

  // When start time changes, push end time by 1 hour
  const handleTimeChange = (v: string) => {
    setTime(v);
    setEndTime(addHour(v));
  };

  const techLabel = (t: Technician) => technicianDisplayName(t);

  const standardPricing = calculateConsultationPricing(hours, customLaborCharge);
  const partnerPricing = calculatePartnerConsultationCharge(hours, selectedPartner?.hourlyRate || 0, customLaborCharge);
  const billedHours = standardPricing.billedHours;
  const extraHours = standardPricing.extraHours;
  const chargedLabor = locationType === 'partner' ? partnerPricing.charge : standardPricing.laborCharge;
  const totalCost = chargedLabor + driverFee;

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

  const handleLocationChange = (type: 'instore' | 'athome' | 'partner') => {
    setLocationType(type);
    setCustomLaborCharge(null);
    if (type !== 'athome') {
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

  const applyPartner = (partner: ConsultationPartner) => {
    setSelectedPartnerId(partner.id);
    setStreetAddress([partner.streetAddress, partner.hasUnitNumber && partner.unitNumber ? `Unit ${partner.unitNumber}` : ''].filter(Boolean).join(', '));
    setCity(partner.city);
    setZip(partner.zip);
    setCustomLaborCharge(null);
    setPartnerMenuOpen(false);
    setPartnerActions(null);
  };

  const persistPartners = useCallback(async (nextPartners: ConsultationPartner[]) => {
    const normalized = sortConsultationPartners(nextPartners.map(partner => normalizeConsultationPartner(partner)));
    const now = new Date().toISOString();
    if (settingsRecordId != null) {
      await api.dbUpdate('settings', settingsRecordId, { consultationPartners: normalized, updatedAt: now });
    } else {
      const created = await api.dbAdd('settings', { id: 1, consultationPartners: normalized, createdAt: now, updatedAt: now });
      setSettingsRecordId(created?.id ?? 1);
    }
    setPartners(normalized);
  }, [api, settingsRecordId]);

  const savePartner = async (partner: ConsultationPartner) => {
    const next = partners.some(row => row.id === partner.id)
      ? partners.map(row => row.id === partner.id ? partner : row)
      : [...partners, partner];
    await persistPartners(next);
    applyPartner(partner);
    setPartnerEditor(undefined);
  };

  const deletePartner = async (partner: ConsultationPartner) => {
    if (!window.confirm(`Delete ${partner.businessName} from consultation partners? Existing consultations will keep their saved address and pricing.`)) return;
    await persistPartners(partners.filter(row => row.id !== partner.id));
    if (selectedPartnerId === partner.id) setSelectedPartnerId('');
    setPartnerActions(null);
  };

  const openPartnerMaps = () => {
    const address = selectedPartner ? consultationPartnerAddress(selectedPartner) : fullAddress;
    if (!address) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    try { void api?.openUrl?.(url); } catch { window.open(url, '_blank', 'noopener,noreferrer'); }
  };

  const canBook = !saving && !!date && !!selectedCustomer && (locationType !== 'partner' || !!selectedPartner);

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
      if (locationType === 'partner' && !selectedPartner) throw new Error('Select a saved partner before booking.');

      let effectiveDriverFee = 0;
      if (locationType === 'athome') {
        const res = await computeDistanceFee(fullAddress);
        if (res.miles == null) {
          throw new Error('We could not verify the at-home address and driver fee. Check the address and try again before saving.');
        }
        effectiveDriverFee = res.fee;
        setDistanceMiles(res.miles);
        setDistanceFeeApplied(res.feeApplied);
        setDriverFee(res.fee);
      }

      const effectiveLaborCharge = locationType === 'partner'
        ? calculatePartnerConsultationCharge(hours, selectedPartner?.hourlyRate || 0, customLaborCharge).charge
        : calculateConsultationPricing(hours, customLaborCharge).laborCharge;
      const effectiveTotalCost = effectiveLaborCharge + effectiveDriverFee;

      if (locationType === 'athome') {
        try { await upsertAddressHistory(fullAddress); } catch {}
      }
      // New clients are persisted by the shared Add Client window before booking.
      const customer = selectedCustomer;
      if (!customer?.id) throw new Error('Select or add a saved client before booking.');

      const customerName = customerDisplayName(customer!);
      const customerPhone = customer!.phone || '';
      const now = new Date().toISOString();

      // 2. Create consultation sale record
      const purpose = title.trim() || 'Consultation';
      const customChargeItem: any = customLaborCharge != null || locationType === 'partner' ? {
        id: crypto.randomUUID(),
        description: purpose,
        qty: billedHours,
        price: effectiveLaborCharge / billedHours,
        consultationHours: billedHours,
        category: 'Consultation',
        inStock: true,
        partnerId: selectedPartner?.id,
        partnerGroup: selectedPartner?.group,
        partnerBusinessName: selectedPartner?.businessName,
        partnerHourlyRate: selectedPartner?.hourlyRate,
      } : null;
      const baseItem: any = customLaborCharge == null && locationType !== 'partner' ? {
        id: crypto.randomUUID(),
        description: purpose,
        qty: 1,
        price: CONSULTATION_BASE_RATE,
        consultationHours: 1,
        category: 'Consultation',
        inStock: true,
      } : null;
      const extraItem: any = customLaborCharge == null && locationType !== 'partner' && extraHours > 0 ? {
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

      const saleItems = [customChargeItem, baseItem, extraItem, driverItem].filter(Boolean);

      const saleRecord: any = {
        customerId: customer!.id,
        customerName,
        customerPhone,
        customerEmail: customer?.email || '',
        category: 'Consultation',
        items: saleItems,
        itemDescription: title.trim() || (selectedPartner ? `Consultation - ${selectedPartner.businessName}` : 'Consultation'),
        quantity: billedHours,
        price: locationType === 'partner' ? (effectiveLaborCharge / billedHours) : CONSULTATION_BASE_RATE,
        status: 'open',
        assignedTo: technician || undefined,
        notes: notes.trim() || undefined,
        consultationHours: billedHours,
        consultationType: locationType,
        consultationAddress: locationType === 'instore' ? SHOP_CONSULTATION_LOCATION : fullAddress.trim(),
        appointmentDate: date,
        appointmentTime: time || undefined,
        appointmentEndTime: endTime || undefined,
        driverFee: effectiveDriverFee > 0 ? effectiveDriverFee : undefined,
        laborCost: effectiveLaborCharge,
        partCosts: 0,
        totals: { subTotal: effectiveTotalCost, tax: 0, total: effectiveTotalCost, remaining: effectiveTotalCost },
        total: effectiveTotalCost,
        checkInAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const createdSale = await api.dbAdd('sales', saleRecord);

      // 3. Create calendar event
      const location = locationType === 'instore' ? SHOP_CONSULTATION_LOCATION : (fullAddress.trim() || (locationType === 'partner' ? selectedPartner?.businessName : 'At Home'));

      const createdEvent = await api.dbAdd('calendarEvents', {
        category: 'consultation',
        date,
        time: time || undefined,
        endTime: endTime || undefined,
        title: title.trim() || (selectedPartner ? `Consultation - ${selectedPartner.businessName}` : 'Consultation'),
        customerName,
        customerPhone,
        customerEmail: customer?.email || '',
        customerId: customer!.id,
        technician: technician || undefined,
        notes: notes.trim() || undefined,
        location,
        consultationType: locationType,
        consultationAddress: locationType === 'instore' ? SHOP_CONSULTATION_LOCATION : fullAddress.trim(),
        saleId: createdSale?.id,
        source: 'consultation',
      });

      setDone({ saleId: createdSale?.id, eventId: createdEvent?.id, customerName });
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
        {clientUpdateOpen ? <ClientUpdatePanel embedded recordType="consult" recordId={done.eventId} onClose={() => setClientUpdateOpen(false)} /> : null}
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">Consultation Booked</h1>
          <p className="text-zinc-300 mb-1">Client: <span className="font-semibold">{done.customerName}</span></p>
          <button
            type="button"
            onClick={() => setClientUpdateOpen(true)}
            disabled={!done.eventId}
            className="mb-3 mt-2 w-full rounded border border-[#BC13FE]/70 bg-[#BC13FE]/20 px-6 py-2 font-semibold text-fuchsia-100 hover:brightness-110"
          >
            Update Client
          </button>
          <p className="text-zinc-300 mb-1">
            {date} at {time}{endTime ? ` – ${endTime}` : ''}
          </p>
          {done.saleId && (
            <p className="text-zinc-400 text-sm mb-2">Sale #{done.saleId} created</p>
          )}

          {/* QR Code */}
          {qrDataUrl && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 mb-4 inline-block">
              <img src={qrDataUrl} alt="Consultation QR" style={{ width: 160, height: 160, display: 'block', borderRadius: 8 }} />
              <p className="text-xs text-zinc-400 mt-2">Scan to add calendar reminder</p>
            </div>
          )}
          {!qrDataUrl && done.eventId && (
            <p className="text-zinc-500 text-xs mb-4">Generating QR code…</p>
          )}

          <p className="text-zinc-400 text-sm mb-6">
            Added to the synced calendar. Scanning downloads a calendar event with a reminder one hour before the consultation.
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
            onClick={() => { setDone(null); setQrDataUrl(''); clearCustomer(); setTitle(''); setNotes(''); setDate(todayISO()); setTime('10:00'); setEndTime('11:00'); setHours(1); setCustomLaborCharge(null); setError(''); }}
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
    <>
    {partnerEditor !== undefined ? (
      <PartnerEditor
        partner={partnerEditor}
        partners={partners}
        onClose={() => setPartnerEditor(undefined)}
        onSave={partner => { void savePartner(partner).catch(errorValue => setError(errorValue?.message || 'Could not save partner.')); }}
      />
    ) : null}
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
          ) : (
            <div className="relative gb-consultation-client-search">
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
                onClick={() => { setShowCustomerCreator(true); setCustomerQuery(''); setCustomerResults([]); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
              >
                New
              </button>
              {customerResults.length > 0 && (
                <div className="mt-2 bg-zinc-800 border border-zinc-600 rounded shadow-xl max-h-44 overflow-auto">
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
              {showCustomerCreator ? (
                <div className="gb-consultation-client-create mt-3">
                  <CustomerOverviewWindow
                    customer={null}
                    closeAfterSave
                    childDialog
                    compactCreate
                    embeddedCreate
                    onClose={() => setShowCustomerCreator(false)}
                    onSaved={(saved) => {
                      const created = saved as Customer;
                      setAllCustomers((current) => current.some((row) => row.id === created.id) ? current : [created, ...current]);
                      selectCustomer(created);
                      setShowCustomerCreator(false);
                    }}
                  />
                </div>
              ) : null}
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
              <div className="flex items-center gap-2"><TechnicianAvatar iconId={techs.find(t => techLabel(t) === technician)?.profileIcon} size={34} ariaLabel={technician || 'Unassigned technician'} /><select
                className="min-w-0 flex-1 bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                value={technician}
                onChange={e => setTechnician(e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {techs.map(t => (
                  <option key={t.id} value={techLabel(t)}>{techLabel(t)}</option>
                ))}
              </select></div>
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
          <div className="gb-consultation-location-modes grid grid-cols-3 gap-2 mb-3">
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="locationType"
                checked={locationType === 'partner'}
                onChange={() => handleLocationChange('partner')}
                className="accent-purple-500 w-4 h-4"
              />
              <span className="text-sm font-medium">Partners</span>
            </label>
          </div>
          {locationType === 'partner' ? (
            <div className="gb-consultation-partner-picker relative mb-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <button type="button" className="min-h-[2.7rem] rounded border border-zinc-600 bg-zinc-900 px-3 text-left text-sm" onClick={() => setPartnerMenuOpen(open => !open)}>
                  {selectedPartner ? <><strong className="block text-zinc-100">{selectedPartner.businessName}</strong><span className="text-xs text-zinc-400">{selectedPartner.group ? `${selectedPartner.group} | ` : ''}$${selectedPartner.hourlyRate.toFixed(2)}/hr</span></> : <span className="text-zinc-400">Select a partner...</span>}
                </button>
                <button type="button" className="rounded border border-blue-500 bg-blue-600 px-3 text-sm font-semibold text-white" onClick={() => setPartnerEditor(null)}>Add Partner</button>
              </div>
              {partnerMenuOpen ? (
                <div className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-auto rounded border border-zinc-600 bg-zinc-900 p-1 shadow-2xl">
                  {!partners.length ? <div className="px-3 py-3 text-sm text-zinc-500">No partners saved yet.</div> : null}
                  {Array.from(new Set(partners.map(partner => partner.group || ''))).map(group => (
                    <div key={group || '__ungrouped'}>
                      {group ? <div className="sticky top-0 bg-zinc-800 px-3 py-1 text-[11px] font-bold uppercase text-purple-300">{group}</div> : null}
                      {partners.filter(partner => (partner.group || '') === group).map(partner => (
                        <div key={partner.id} className="border-b border-zinc-800 last:border-0">
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-zinc-800"
                            onClick={() => applyPartner(partner)}
                            onContextMenu={event => { event.preventDefault(); setPartnerActions(partner); }}
                            onPointerDown={event => {
                              if (event.pointerType !== 'touch') return;
                              if (partnerHoldTimer.current) clearTimeout(partnerHoldTimer.current);
                              partnerHoldTimer.current = setTimeout(() => setPartnerActions(partner), 550);
                            }}
                            onPointerUp={() => { if (partnerHoldTimer.current) clearTimeout(partnerHoldTimer.current); }}
                            onPointerCancel={() => { if (partnerHoldTimer.current) clearTimeout(partnerHoldTimer.current); }}
                          >
                            <strong className="block text-sm">{partner.businessName}</strong>
                            <span className="block truncate text-xs text-zinc-400">${partner.hourlyRate.toFixed(2)}/hr | {consultationPartnerAddress(partner)}</span>
                          </button>
                          {partnerActions?.id === partner.id ? (
                            <div className="grid grid-cols-2 gap-1 bg-zinc-950 p-1.5">
                              <button type="button" className="rounded bg-zinc-700 px-2 py-1.5 text-xs font-semibold" onClick={() => { setPartnerEditor(partner); setPartnerActions(null); setPartnerMenuOpen(false); }}>Edit</button>
                              <button type="button" className="rounded bg-red-700 px-2 py-1.5 text-xs font-semibold" onClick={() => { void deletePartner(partner); }}>Delete</button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="px-3 py-1 text-[10px] text-zinc-500">Right-click or press and hold a partner to edit or delete.</div>
                </div>
              ) : null}
            </div>
          ) : null}
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
          {locationType === 'partner' && selectedPartner ? (
            <div className="gb-consultation-partner-address rounded border border-zinc-700 bg-zinc-900 p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase text-zinc-500">Partner Address</div>
                  <strong className="mt-1 block break-words text-sm text-zinc-100">{consultationPartnerAddress(selectedPartner)}</strong>
                </div>
                <button type="button" className="gb-mobile-map-button rounded border border-blue-500 bg-blue-600 px-3 py-2 text-xs font-semibold" onClick={openPartnerMaps}>Open Maps</button>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── Pricing ───────────────────────────────────────────── */}
        <section className="bg-zinc-800 border border-zinc-700 rounded p-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Pricing</h2>
          <div className="gb-consultation-pricing-grid grid grid-cols-3 gap-4 items-end">
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
              <label className="block text-xs text-zinc-400 mb-1">Amount Charged ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full bg-yellow-100 text-black border border-zinc-600 rounded px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                value={chargedLabor}
                onChange={e => setCustomLaborCharge(Math.max(0, Number(e.target.value) || 0))}
              />
              <div className="mt-1 text-[11px] text-zinc-500">
                {locationType === 'partner' && selectedPartner
                  ? `Partner rate: $${selectedPartner.hourlyRate.toFixed(2)}/hr`
                  : `Auto: $${CONSULTATION_BASE_RATE} first hour + $${CONSULTATION_EXTRA_RATE}/hr after`}
                {customLaborCharge != null ? (
                  <button type="button" className="ml-2 text-blue-400 hover:text-blue-300" onClick={() => setCustomLaborCharge(null)}>Use automatic</button>
                ) : null}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-400 mb-1">Labor</div>
              <div className="text-base font-semibold text-zinc-200">${chargedLabor.toFixed(2)}</div>
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
            ? `Booking for ${selectedCustomer ? customerDisplayName(selectedCustomer) : ''} on ${date}`
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
    </>
  );
}
