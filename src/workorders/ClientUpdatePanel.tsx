import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatPhone } from '../lib/format';

type UpdateType = 'repair' | 'sale' | 'consult';
type StatusOption = {
  key: string;
  label: string;
  tone: string;
  detail?: 'date' | 'notes';
};

type Props = {
  token?: string;
  recordType?: UpdateType;
  recordId?: number;
  initialRecord?: any;
  initialCustomer?: any;
  embedded?: boolean;
  onClose?: () => void;
  onUpdated?: (record: any) => void;
};

const REPAIR_STATUSES: StatusOption[] = [
  { key: 'pickup_reminder', label: 'Pickup Reminder', tone: 'cyan' },
  { key: 'manual_update', label: 'Send Update', tone: 'purple', detail: 'notes' },
  { key: 'diagnosis', label: 'Diagnosis In Process', tone: 'blue' },
  { key: 'waiting_device', label: 'Waiting on Device', tone: 'blue' },
  { key: 'part_ordered', label: 'Part Ordered', tone: 'amber', detail: 'date' },
  { key: 'waiting_part', label: 'Waiting on Part Delivery', tone: 'orange', detail: 'date' },
  { key: 'part_delivered', label: 'Part Delivered', tone: 'green' },
  { key: 'repair_complete', label: 'Repair Complete', tone: 'green', detail: 'notes' },
  { key: 'not_possible', label: 'Repair Not Possible', tone: 'red', detail: 'notes' },
];

const SALE_STATUSES: StatusOption[] = [
  { key: 'pickup_reminder', label: 'Pickup Reminder', tone: 'cyan' },
  { key: 'manual_update', label: 'Send Update', tone: 'purple', detail: 'notes' },
  { key: 'product_ordered', label: 'Product Ordered', tone: 'amber', detail: 'date' },
  { key: 'product_in_shop', label: 'Product In Shop', tone: 'green' },
];

function normalizeType(value: any): UpdateType {
  const raw = String(value || '').toLowerCase();
  if (raw === 'sale' || raw === 'sales') return 'sale';
  if (raw === 'consult' || raw === 'consultation') return 'consult';
  return 'repair';
}

function mapCloudRow(type: UpdateType, row: any): any {
  if (!row) return null;
  if (type === 'sale') {
    return {
      id: Number(row.legacy_id || 0) || row.legacy_id || row.id,
      cloudId: row.id,
      customerId: Number(row.legacy_customer_id || 0) || undefined,
      customerName: row.customer_name || '',
      customerPhone: row.customer_phone || '',
      customerEmail: row.customer_email || '',
      status: row.status || '',
      assignedTo: row.assigned_to || '',
      productDescription: row.item_description || row.category || 'Sale',
      category: row.category || '',
      statusUpdate: row.status_update || '',
      statusUpdatedAt: row.status_updated_at || '',
      estimatedDate: row.estimated_date || '',
      techNotes: row.tech_notes || '',
      lastUpdateNote: row.last_update_note || '',
      lastUpdateAt: row.last_update_at || '',
    };
  }
  if (type === 'consult') {
    return {
      id: Number(row.legacy_id || 0) || row.legacy_id || row.id,
      cloudId: row.id,
      customerId: Number(row.legacy_customer_id || 0) || undefined,
      customerName: row.customer_name || '',
      customerPhone: row.customer_phone || '',
      customerEmail: '',
      status: row.parts_status || '',
      productDescription: row.title || 'Consultation',
      category: row.category || 'consultation',
      statusUpdate: row.parts_status || '',
      statusUpdatedAt: row.updated_at || '',
    };
  }
  return {
    id: Number(row.legacy_id || 0) || row.legacy_id || row.id,
    cloudId: row.id,
    customerId: Number(row.legacy_customer_id || 0) || undefined,
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    customerEmail: row.customer_email || '',
    status: row.status || '',
    assignedTo: row.assigned_to || '',
    productCategory: row.product_category || '',
    productDescription: row.product_description || row.product_category || 'Device',
    model: row.model || '',
    serial: row.serial || '',
    problemInfo: row.problem_info || '',
    repairStatus: row.repair_status || '',
    statusUpdate: row.status_update || '',
    statusUpdatedAt: row.status_updated_at || '',
    estimatedDate: row.estimated_date || '',
    techNotes: row.tech_notes || '',
    lastUpdateNote: row.last_update_note || '',
    lastUpdateAt: row.last_update_at || '',
  };
}

function mapCustomer(row: any): any {
  if (!row) return null;
  return {
    id: Number(row.legacy_id || 0) || row.legacy_id || row.id,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    phone: row.phone || '',
    phoneAlt: row.phone_alt || '',
    email: row.email || '',
  };
}

function clientName(record: any, customer: any) {
  const full = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim();
  return full || record?.customerName || 'Client';
}

function recordTitle(type: UpdateType, record: any) {
  if (type === 'sale') return record?.productDescription || record?.itemDescription || record?.category || 'Sale';
  if (type === 'consult') return record?.productDescription || record?.title || 'Consultation';
  return [record?.productDescription, record?.model].filter(Boolean).join(' - ') || record?.productCategory || 'Device';
}

function repairStatusLabel(key: string): string {
  const map: Record<string, string> = {
    diagnosis: 'Diagnosis In Process',
    waiting_device: 'Waiting for Device Drop-off',
    part_ordered: 'Part Ordered',
    waiting_part: 'Waiting on Part Delivery',
    part_delivered: 'Part Delivered - Repairs Starting',
    repair_complete: 'Repair Complete',
    not_possible: 'Repair Not Possible',
    storage_fee: 'Storage Fee Notice',
  };
  return map[key] || '';
}

function saleStatusLabel(key: string): string {
  const map: Record<string, string> = {
    product_ordered: 'Product Ordered',
    product_in_shop: 'Product In Shop',
    storage_fee: 'Storage Fee Notice',
  };
  return map[key] || '';
}

function cloudPatch(type: UpdateType, option: StatusOption, extra: { estimatedDate?: string; notes?: string }) {
  const now = new Date().toISOString();
  const isManual = option.key === 'manual_update';
  const base: any = {
    status_update: isManual ? undefined : option.label,
    status_updated_at: now,
    estimated_date: extra.estimatedDate || null,
    tech_notes: extra.notes || '',
    last_update_note: isManual ? (extra.notes || option.label) : undefined,
    last_update_at: isManual ? now : undefined,
  };
  Object.keys(base).forEach((key) => typeof base[key] === 'undefined' && delete base[key]);
  if (type === 'repair') {
    const repairStatus = repairStatusLabel(option.key);
    if (repairStatus && !isManual) base.repair_status = repairStatus;
  } else if (type === 'sale') {
    const saleStatus = saleStatusLabel(option.key);
    if (saleStatus && !isManual) base.status = saleStatus;
  }
  return base;
}

function localPatch(type: UpdateType, option: StatusOption, extra: { estimatedDate?: string; notes?: string }) {
  const now = new Date().toISOString();
  const isManual = option.key === 'manual_update';
  const patch: any = {
    statusUpdatedAt: now,
    estimatedDate: extra.estimatedDate || '',
    techNotes: extra.notes || '',
  };
  if (isManual) {
    patch.lastUpdateNote = extra.notes || option.label;
    patch.lastUpdateAt = now;
  } else {
    patch.statusUpdate = option.label;
  }
  if (type === 'repair') {
    const repairStatus = repairStatusLabel(option.key);
    if (repairStatus && !isManual) patch.repairStatus = repairStatus;
  } else if (type === 'sale') {
    const saleStatus = saleStatusLabel(option.key);
    if (saleStatus && !isManual) patch.status = saleStatus;
  }
  return patch;
}

const ClientUpdatePanel: React.FC<Props> = ({
  token,
  recordType = 'repair',
  recordId,
  initialRecord,
  initialCustomer,
  embedded = false,
  onClose,
  onUpdated,
}) => {
  const [type, setType] = useState<UpdateType>(normalizeType(recordType));
  const [record, setRecord] = useState<any>(initialRecord || null);
  const [customer, setCustomer] = useState<any>(initialCustomer || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openKey, setOpenKey] = useState<string>('');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const options = type === 'sale' ? SALE_STATUSES : REPAIR_STATUSES;
  const quickOptions = options.filter((o) => o.key === 'pickup_reminder' || o.key === 'manual_update');
  const mainOptions = options.filter((o) => !quickOptions.some((q) => q.key === o.key));

  const loadFromDirectSupabase = useCallback(async (qrToken: string) => {
    const tokenRes = await supabase
      .from('qr_status_tokens')
      .select('*')
      .eq('token', qrToken)
      .is('revoked_at', null)
      .maybeSingle();
    if (tokenRes.error) throw new Error(tokenRes.error.message);
    if (!tokenRes.data) throw new Error('QR token was not found.');
    if (tokenRes.data.expires_at && new Date(tokenRes.data.expires_at).getTime() < Date.now()) {
      throw new Error('This QR token is expired.');
    }
    const nextType = normalizeType(tokenRes.data.record_type);
    const table = nextType === 'sale' ? 'sales' : nextType === 'consult' ? 'calendar_events' : 'work_orders';
    const recordRes = await supabase
      .from(table)
      .select('*')
      .eq('shop_id', tokenRes.data.shop_id)
      .eq('legacy_id', Number(tokenRes.data.legacy_record_id))
      .maybeSingle();
    if (recordRes.error) throw new Error(recordRes.error.message);
    if (!recordRes.data) throw new Error('The linked record no longer exists.');

    const mappedRecord = mapCloudRow(nextType, recordRes.data);
    let mappedCustomer: any = null;
    const customerId = Number(mappedRecord?.customerId || 0) || 0;
    if (customerId > 0) {
      const customerRes = await supabase
        .from('customers')
        .select('*')
        .eq('shop_id', tokenRes.data.shop_id)
        .eq('legacy_id', customerId)
        .maybeSingle();
      if (!customerRes.error && customerRes.data) mappedCustomer = mapCustomer(customerRes.data);
    }

    void supabase.from('qr_status_tokens').update({ last_opened_at: new Date().toISOString() }).eq('id', tokenRes.data.id);
    return { type: nextType, record: mappedRecord, customer: mappedCustomer, tokenRow: tokenRes.data };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const api: any = (window as any).api;
        if (token) {
          if (api?.qrResolveStatusToken) {
            const res = await api.qrResolveStatusToken(token);
            if (!res?.ok) throw new Error(res?.error || 'QR token could not be resolved.');
            if (!alive) return;
            setType(normalizeType(res.type));
            setRecord(res.record || null);
            setCustomer(res.customer || null);
            return;
          }
          const resolved = await loadFromDirectSupabase(token);
          if (!alive) return;
          setType(resolved.type);
          setRecord(resolved.record);
          setCustomer(resolved.customer);
          return;
        }

        const nextType = normalizeType(recordType);
        setType(nextType);
        let nextRecord = initialRecord || null;
        if (!nextRecord && recordId && api) {
          if (nextType === 'sale' && api.dbGet) {
            const list = await api.dbGet('sales').catch(() => []);
            nextRecord = Array.isArray(list) ? list.find((row: any) => Number(row?.id || 0) === Number(recordId)) : null;
          } else if (api.findWorkOrders) {
            const list = await api.findWorkOrders({ id: recordId });
            nextRecord = Array.isArray(list) ? list[0] : null;
          }
        }
        if (!nextRecord) throw new Error('Record could not be loaded.');

        let nextCustomer = initialCustomer || null;
        const customerId = Number(nextRecord?.customerId || 0) || 0;
        if (!nextCustomer && customerId && api?.findCustomers) {
          const list = await api.findCustomers({ id: customerId }).catch(() => []);
          nextCustomer = Array.isArray(list) ? list[0] : null;
        }
        if (!alive) return;
        setRecord(nextRecord);
        setCustomer(nextCustomer);
      } catch (e: any) {
        if (alive) setError(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [initialCustomer, initialRecord, loadFromDirectSupabase, recordId, recordType, token]);

  const saveStatus = useCallback(async (option: StatusOption) => {
    if (!record) return;
    const extra = { estimatedDate, notes };
    setSavingKey(option.key);
    setResult(null);
    try {
      const api: any = (window as any).api;
      if (api?.dbUpdate) {
        const key = type === 'sale' ? 'sales' : 'workOrders';
        const patch = localPatch(type, option, extra);
        const saved = await api.dbUpdate(key, record.id, { ...record, ...patch });
        setRecord(saved || { ...record, ...patch });
        onUpdated?.(saved || { ...record, ...patch });
      } else if (token) {
        const tokenRes = await supabase
          .from('qr_status_tokens')
          .select('shop_id,record_type,legacy_record_id')
          .eq('token', token)
          .is('revoked_at', null)
          .maybeSingle();
        if (tokenRes.error) throw new Error(tokenRes.error.message);
        if (!tokenRes.data) throw new Error('QR token could not be resolved for update.');
        const nextType = normalizeType(tokenRes.data.record_type);
        const table = nextType === 'sale' ? 'sales' : 'work_orders';
        if (nextType === 'consult') throw new Error('Consultation QR updates are view-only in this panel.');
        const res = await supabase
          .from(table)
          .update(cloudPatch(nextType, option, extra))
          .eq('shop_id', tokenRes.data.shop_id)
          .eq('legacy_id', Number(tokenRes.data.legacy_record_id))
          .select('*')
          .maybeSingle();
        if (res.error) throw new Error(res.error.message);
        const saved = mapCloudRow(nextType, res.data);
        setRecord(saved);
        onUpdated?.(saved);
      } else {
        throw new Error('No update API is available.');
      }
      setResult({ ok: true, message: 'Status update saved and synced.' });
      setOpenKey('');
      setEstimatedDate('');
      setNotes('');
    } catch (e: any) {
      setResult({ ok: false, message: e?.message || String(e) });
    } finally {
      setSavingKey('');
    }
  }, [estimatedDate, notes, onUpdated, record, token, type]);

  const renderOption = (option: StatusOption) => {
    const open = openKey === option.key;
    return (
      <div key={option.key} className="gb-client-update-action">
        <button
          type="button"
          className={`gb-client-update-button tone-${option.tone}`}
          onClick={() => {
            if (option.detail) {
              setOpenKey(open ? '' : option.key);
              setResult(null);
              return;
            }
            void saveStatus(option);
          }}
          disabled={!!savingKey}
        >
          <span>{option.label}</span>
          {option.detail ? <b>{open ? 'Close' : 'Details'}</b> : null}
        </button>
        {option.detail && open ? (
          <div className="gb-client-update-detail">
            {option.detail === 'date' ? (
              <label>
                <span>{option.key === 'waiting_part' ? 'Estimated arrival date' : 'Estimated delivery date'}</span>
                <input type="date" value={estimatedDate} onChange={(event) => setEstimatedDate(event.target.value)} />
              </label>
            ) : (
              <label>
                <span>{option.key === 'manual_update' ? 'Message for customer' : 'Notes for customer'}</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Type the update..." />
              </label>
            )}
            <button type="button" className="gb-client-update-send" disabled={!!savingKey} onClick={() => void saveStatus(option)}>
              {savingKey === option.key ? 'Saving...' : 'Save Update'}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const name = clientName(record, customer);
  const phoneRaw = customer?.phone || record?.customerPhone || '';
  const phoneAltRaw = customer?.phoneAlt || record?.customerPhoneAlt || '';
  const email = customer?.email || record?.customerEmail || '';
  const orderLabel = type === 'sale' ? `INV-${record?.id || recordId || ''}` : type === 'consult' ? `CONS-${record?.id || recordId || ''}` : `WO-${record?.id || recordId || ''}`;

  return (
    <div className={embedded ? 'gb-client-update-shell embedded' : 'gb-client-update-shell'}>
      <div className="gb-client-update-panel">
        <div className="gb-client-update-header">
          <div>
            <div className="gb-client-update-kicker">GadgetBoy POS</div>
            <h2>Update Client</h2>
          </div>
          {onClose ? (
            <button type="button" className="gb-client-update-close" onClick={onClose} aria-label="Close update client">
              x
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="gb-client-update-state">Loading update panel...</div>
        ) : error ? (
          <div className="gb-client-update-error">{error}</div>
        ) : (
          <>
            <section className="gb-client-update-card">
              <div className="gb-client-update-row"><span>Order</span><strong>{orderLabel}</strong></div>
              <div className="gb-client-update-row"><span>Client</span><strong>{name}</strong></div>
              {phoneRaw ? <div className="gb-client-update-row"><span>Phone</span><strong>{formatPhone(phoneRaw) || phoneRaw}</strong></div> : null}
              {phoneAltRaw ? <div className="gb-client-update-row"><span>Alt Phone</span><strong>{formatPhone(phoneAltRaw) || phoneAltRaw}</strong></div> : null}
              {email ? <div className="gb-client-update-row"><span>Email</span><strong>{email}</strong></div> : null}
              <div className="gb-client-update-row"><span>{type === 'sale' ? 'Item' : 'Device'}</span><strong>{recordTitle(type, record)}</strong></div>
              {record?.statusUpdate || record?.repairStatus || record?.status ? (
                <div className="gb-client-update-row"><span>Current</span><strong>{record?.statusUpdate || record?.repairStatus || record?.status}</strong></div>
              ) : null}
            </section>

            <section className="gb-client-update-section">
              <h3>Quick Actions</h3>
              {quickOptions.map(renderOption)}
            </section>

            <section className="gb-client-update-section">
              <h3>Status Updates</h3>
              {mainOptions.map(renderOption)}
            </section>

            {result ? (
              <div className={result.ok ? 'gb-client-update-result ok' : 'gb-client-update-result bad'}>
                {result.message}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default ClientUpdatePanel;
