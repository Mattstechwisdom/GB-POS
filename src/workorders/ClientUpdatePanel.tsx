import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatPhone } from '../lib/format';

type UpdateType = 'repair' | 'sale' | 'consult';
type StatusOption = {
  key: string;
  label: string;
  tone: string;
  detail?: 'date' | 'notes' | 'dateNotes' | 'dateTimeNotes';
};

type UpdateHistoryRow = {
  id: string;
  status_key: string;
  status_label: string;
  message?: string | null;
  estimated_date?: string | null;
  recipient_email?: string | null;
  delivery_status: 'pending' | 'sending' | 'sent' | 'failed' | 'not_requested';
  delivery_error?: string | null;
  created_at: string;
};

type DeliveryMode = 'email' | 'text';

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
  { key: 'shipping_delayed', label: 'Shipping Delay', tone: 'orange', detail: 'dateNotes' },
  { key: 'product_in_shop', label: 'Product Arrived', tone: 'green' },
];

const CONSULT_STATUSES: StatusOption[] = [
  { key: 'consultation_reminder', label: 'Send Reminder', tone: 'cyan' },
  { key: 'consultation_delayed', label: 'Request Schedule Change', tone: 'amber', detail: 'dateTimeNotes' },
  { key: 'consultation_confirmed', label: 'Consultation Confirmed', tone: 'green' },
  { key: 'consultation_complete', label: 'Consultation Complete', tone: 'green', detail: 'notes' },
  { key: 'manual_update', label: 'Send Update', tone: 'purple', detail: 'notes' },
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
      customerEmail: row.customer_email || '',
      status: row.status || '',
      productDescription: row.item_description || 'Consultation',
      category: row.category || 'Consultation',
      statusUpdate: row.status_update || '',
      statusUpdatedAt: row.status_updated_at || row.updated_at || '',
      appointmentDate: row.event_date || '',
      appointmentTime: row.event_time || '',
      consultationAddress: row.location || '',
      assignedTo: row.assigned_to || '',
      techNotes: row.tech_notes || '',
      lastUpdateNote: row.last_update_note || '',
      lastUpdateAt: row.last_update_at || '',
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

function deliveryLabel(entry: UpdateHistoryRow): string {
  if (entry.delivery_status === 'sent') return 'Email sent';
  if (entry.delivery_status === 'failed') return 'Email failed';
  if (entry.delivery_status === 'pending' || entry.delivery_status === 'sending') return 'Email queued';
  return entry.recipient_email ? 'Saved only' : 'Text prepared';
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
    shipping_delayed: 'Shipping Delayed',
    product_in_shop: 'Product Arrived',
    storage_fee: 'Storage Fee Notice',
  };
  return map[key] || '';
}

function localPatch(type: UpdateType, option: StatusOption, extra: { estimatedDate?: string; estimatedTime?: string; notes?: string }) {
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
  } else if (type === 'consult' && !isManual) {
    patch.status = option.label;
    if (option.key === 'consultation_delayed') {
      patch.appointmentDate = extra.estimatedDate || patch.appointmentDate;
      patch.appointmentTime = extra.estimatedTime || patch.appointmentTime;
    }
  }
  return patch;
}

async function invokeClientUpdate(body: Record<string, unknown>) {
  const request = supabase.functions.invoke('client-updates', { body });
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new DOMException('Supabase did not respond in time.', 'AbortError')), 25_000);
  });
  const { data, error } = await Promise.race([request, timeout]);
  if (error) {
    const contextBody = (error as any)?.context?.body;
    throw new Error(String(contextBody?.error || (error as any)?.message || 'Client update failed.'));
  }
  if (!data?.ok) throw new Error(String(data?.error || 'Client update failed.'));
  return data;
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
  const [estimatedTime, setEstimatedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    deliveryStatus?: string;
    statusSaved?: boolean;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyRows, setHistoryRows] = useState<UpdateHistoryRow[]>([]);
  const [historyShopId, setHistoryShopId] = useState('');
  const [historyRetrying, setHistoryRetrying] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('email');

  const isMobileApp = useMemo(() => {
    try {
      return /mobile\.html$/i.test(window.location.pathname)
        || !!document.querySelector('.gbpos-mobile')
        || !!(window as any).GBPosAndroid;
    } catch {
      return false;
    }
  }, []);

  const options = type === 'sale' ? SALE_STATUSES : type === 'consult' ? CONSULT_STATUSES : REPAIR_STATUSES;
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
            setHistoryShopId(String(res.token?.shop_id || ''));
            return;
          }
          const resolved = await loadFromDirectSupabase(token);
          if (!alive) return;
          setType(resolved.type);
          setRecord(resolved.record);
          setCustomer(resolved.customer);
          setHistoryShopId(String(resolved.tokenRow?.shop_id || ''));
          return;
        }

        const nextType = normalizeType(recordType);
        setType(nextType);
        let nextRecord = initialRecord || null;
        if (!nextRecord && recordId && api) {
          if ((nextType === 'sale' || nextType === 'consult') && api.dbGet) {
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

  const loadHistory = useCallback(async () => {
    const legacyRecordId = Number(record?.id || recordId || 0) || 0;
    if (!legacyRecordId) {
      setHistoryRows([]);
      return;
    }
    setHistoryLoading(true);
    setHistoryError('');
    try {
      let scopedShopId = historyShopId || String(record?.shopId || record?.shop_id || '');
      if (!scopedShopId) {
        const session = await supabase.auth.getSession();
        const userId = session.data.session?.user?.id || '';
        if (userId) {
          const profile = await supabase
            .from('staff_profiles')
            .select('shop_id')
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle();
          if (!profile.error) scopedShopId = String(profile.data?.shop_id || '');
        }
      }
      let query = supabase
        .from('client_update_history')
        .select('id,status_key,status_label,message,estimated_date,recipient_email,delivery_status,delivery_error,created_at')
        .eq('record_type', type)
        .eq('legacy_record_id', legacyRecordId);
      if (scopedShopId) query = query.eq('shop_id', scopedShopId);
      const response = await query.order('created_at', { ascending: false }).limit(100);
      if (response.error) throw new Error(response.error.message);
      setHistoryRows((response.data || []) as UpdateHistoryRow[]);
    } catch (e: any) {
      setHistoryError(e?.message || String(e));
    } finally {
      setHistoryLoading(false);
    }
  }, [historyShopId, record?.id, record?.shopId, record?.shop_id, recordId, type]);

  useEffect(() => {
    if (!historyOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHistoryOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [historyOpen]);

  const name = clientName(record, customer);
  const phoneRaw = customer?.phone || record?.customerPhone || '';
  const phoneAltRaw = customer?.phoneAlt || record?.customerPhoneAlt || '';
  const email = customer?.email || record?.customerEmail || '';
  const orderLabel = type === 'sale' ? `INV-${record?.id || recordId || ''}` : type === 'consult' ? `CONS-${record?.id || recordId || ''}` : `WO-${record?.id || recordId || ''}`;
  const historySummary = useMemo(() => ({
    sent: historyRows.filter((entry) => entry.delivery_status === 'sent').length,
    queued: historyRows.filter((entry) => entry.delivery_status === 'pending' || entry.delivery_status === 'sending').length,
    failed: historyRows.filter((entry) => entry.delivery_status === 'failed').length,
  }), [historyRows]);

  const retryQueuedEmails = useCallback(async () => {
    let shopId = historyShopId || String(record?.shopId || record?.shop_id || '');
    setHistoryRetrying(true);
    setHistoryError('');
    try {
      if (!shopId) {
        const session = await supabase.auth.getSession();
        const userId = session.data.session?.user?.id || '';
        if (userId) {
          const profile = await supabase.from('staff_profiles').select('shop_id').eq('user_id', userId).eq('status', 'active').maybeSingle();
          if (!profile.error) shopId = String(profile.data?.shop_id || '');
        }
      }
      if (!shopId) throw new Error('The shop session is not ready. Sign in again.');
      const { data, error: retryError } = await supabase.functions.invoke('send-pos-email', {
        body: { action: 'retry-client-updates', shopId },
      });
      if (retryError || !data?.ok) throw new Error(String((retryError as any)?.context?.body?.error || data?.error || retryError?.message || 'Queued emails could not be retried.'));
      if (Number(data.failed || 0) > 0) setHistoryError(`${data.sent || 0} queued email(s) sent; ${data.failed} still need attention.`);
      await loadHistory();
    } catch (e: any) {
      setHistoryError(e?.message || String(e));
    } finally {
      setHistoryRetrying(false);
    }
  }, [historyShopId, loadHistory, record?.shopId, record?.shop_id]);

  const openTextMessage = useCallback((phone: string, message: string) => {
    const digits = String(phone || '').replace(/[^\d+]/g, '');
    if (!digits) throw new Error('The client does not have a valid phone number on file.');
    const separator = /iPad|iPhone|iPod/i.test(navigator.userAgent) ? '&' : '?';
    const smsUrl = `sms:${digits}${separator}body=${encodeURIComponent(message)}`;
    const androidBridge = (window as any).GBPosAndroid;
    if (androidBridge?.openExternalUrl) {
      androidBridge.openExternalUrl(smsUrl);
      return;
    }
    window.location.href = smsUrl;
  }, []);

  const saveStatus = useCallback(async (option: StatusOption) => {
    if (!record) return;
    const extra = { estimatedDate, estimatedTime, notes };
    setSavingKey(option.key);
    setResult(null);
    try {
      const api: any = (window as any).api;
      const sessionResult = await supabase.auth.getSession();
      const accessToken = sessionResult.data.session?.access_token || '';
      if (!accessToken) throw new Error('Your login session expired. Sign in again before sending an update.');
      const selectedDelivery: DeliveryMode = isMobileApp ? deliveryMode : 'email';
      const delivery = await invokeClientUpdate({
        token: token || undefined,
        recordType: type,
        recordId: Number(record?.id || recordId || 0) || undefined,
        statusKey: option.key,
        estimatedDate: extra.estimatedDate || undefined,
        estimatedTime: extra.estimatedTime || undefined,
        notes: extra.notes || undefined,
        deliveryMode: selectedDelivery,
      });

      if (delivery?.record) {
        const saved = mapCloudRow(type, delivery.record);
        setRecord(saved);
        onUpdated?.(saved);
        if (delivery?.statusSaved && api?.dbUpdate) {
          const key = type === 'sale' || type === 'consult' ? 'sales' : 'workOrders';
          const patch = localPatch(type, option, extra);
          void api.dbUpdate(key, record.id, { ...record, ...patch })
            .then((localSaved: any) => {
              if (!localSaved) return;
              setRecord(localSaved);
              onUpdated?.(localSaved);
            })
            .catch((syncError: any) => {
              console.error('Client update was saved to Supabase, but the local cache refresh failed.', syncError);
            });
        }
      } else if (delivery?.statusSaved && api?.dbUpdate) {
        const key = type === 'sale' || type === 'consult' ? 'sales' : 'workOrders';
        const patch = localPatch(type, option, extra);
        const saved = await api.dbUpdate(key, record.id, { ...record, ...patch });
        setRecord(saved || { ...record, ...patch });
        onUpdated?.(saved || { ...record, ...patch });
      }

      if (selectedDelivery === 'text' && delivery?.textMessage) {
        openTextMessage(delivery?.recipientPhone || phoneRaw, delivery.textMessage);
      }

      setResult({
        ok: !!delivery?.ok,
        message: delivery?.message || delivery?.error || 'Status update processed.',
        deliveryStatus: delivery?.deliveryStatus,
        statusSaved: !!delivery?.statusSaved,
      });
      setOpenKey('');
      setEstimatedDate('');
      setEstimatedTime('');
      setNotes('');
      void loadHistory();
    } catch (e: any) {
      const message = e?.name === 'AbortError'
        ? 'The update server did not respond in time. Nothing is locked; check the connection and tap the update again.'
        : (e?.message || String(e));
      setResult({ ok: false, message, deliveryStatus: 'failed', statusSaved: false });
    } finally {
      setSavingKey('');
    }
  }, [deliveryMode, estimatedDate, estimatedTime, isMobileApp, loadHistory, notes, onUpdated, openTextMessage, phoneRaw, record, recordId, token, type]);

  const exitUpdateScreen = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    try {
      window.close();
    } catch {
      // Browser QR pages generally cannot close themselves unless opened by script.
    }
    window.setTimeout(() => {
      if (!window.closed) window.location.assign('/');
    }, 100);
  }, [onClose]);

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
            {option.detail === 'date' || option.detail === 'dateNotes' || option.detail === 'dateTimeNotes' ? (
              <label>
                <span>{option.key === 'consultation_delayed' ? 'Proposed consultation date' : option.key === 'waiting_part' ? 'Estimated arrival date' : 'Estimated delivery date'}</span>
                <input type="date" value={estimatedDate} onChange={(event) => setEstimatedDate(event.target.value)} />
              </label>
            ) : (
              <label>
                <span>{option.key === 'manual_update' ? 'Message for customer' : 'Notes for customer'}</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Type the update..." />
              </label>
            )}
            {option.detail === 'dateTimeNotes' ? <label><span>Proposed consultation time</span><input type="time" value={estimatedTime} onChange={(event) => setEstimatedTime(event.target.value)} /></label> : null}
            {option.detail === 'dateNotes' || option.detail === 'dateTimeNotes' ? <label><span>{option.key === 'consultation_delayed' ? 'Reason or schedule details' : 'Shipping delay details'}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={option.key === 'consultation_delayed' ? 'Explain the proposed change and ask the client to confirm...' : 'Explain the delay and the revised delivery expectation...'} /></label> : null}
            <button type="button" className="gb-client-update-send" disabled={!!savingKey} onClick={() => void saveStatus(option)}>
              {savingKey === option.key ? 'Saving...' : 'Save Update'}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={embedded ? 'gb-client-update-shell embedded' : 'gb-client-update-shell'}>
      <div className="gb-client-update-panel">
        <div className="gb-client-update-header">
          <div>
            <div className="gb-client-update-kicker">GadgetBoy POS</div>
            <h2>Update Client</h2>
          </div>
          <div className="gb-client-update-header-actions">
            <button
                type="button"
                className={historyOpen ? 'gb-client-update-history-toggle active' : 'gb-client-update-history-toggle'}
                onClick={() => {
                  setHistoryOpen(true);
                  void loadHistory();
                }}
              >
                History
              </button>
            {onClose ? (
              <button type="button" className="gb-client-update-close" onClick={onClose} aria-label="Close update client">
                x
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="gb-client-update-state">Loading update panel...</div>
        ) : error ? (
          <div className="gb-client-update-error">{error}</div>
        ) : savingKey ? (
          <section className="gb-client-update-confirmation sending" role="status" aria-live="polite">
            <div className="gb-client-update-progress" aria-hidden="true"><span /></div>
            <h3>Sending Client Update</h3>
            <p>Saving the ticket status and delivering the email. Keep this window open for a moment.</p>
          </section>
        ) : result ? (
          <section className={result.ok ? 'gb-client-update-confirmation success' : 'gb-client-update-confirmation failure'} role="alert">
            <div className="gb-client-update-confirmation-mark" aria-hidden="true">{result.ok ? 'OK' : '!'}</div>
            <h3>{result.ok ? (result.deliveryStatus === 'text_prepared' ? 'Text Message Ready' : result.deliveryStatus === 'queued' ? 'Update Queued' : 'Email Sent') : 'Email Not Sent'}</h3>
            <p>{result.message}</p>
            {!result.ok && result.statusSaved ? (
              <div className="gb-client-update-saved-note">The ticket status was saved, but the client was not emailed.</div>
            ) : null}
            <div className="gb-client-update-confirmation-actions">
              <button type="button" className="primary" onClick={() => setResult(null)}>Back to Update Screen</button>
              <button type="button" onClick={exitUpdateScreen}>Exit</button>
            </div>
          </section>
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

            {isMobileApp ? (
              <section className="gb-client-update-delivery" aria-label="Send update by">
                <span>Send update by</span>
                <div role="group" aria-label="Delivery method">
                  <button type="button" className={deliveryMode === 'email' ? 'active email' : ''} onClick={() => setDeliveryMode('email')} disabled={!email}>
                    Email
                  </button>
                  <button type="button" className={deliveryMode === 'text' ? 'active text' : ''} onClick={() => setDeliveryMode('text')} disabled={!phoneRaw}>
                    Text
                  </button>
                </div>
                <small>
                  {deliveryMode === 'text'
                    ? 'The update is saved first, then your phone opens the message for you to review and send.'
                    : email ? `Email will be sent to ${email}.` : 'This client has no email address on file.'}
                </small>
              </section>
            ) : null}

            <section className="gb-client-update-section">
              <h3>Quick Actions</h3>
              {quickOptions.map(renderOption)}
            </section>

            <section className="gb-client-update-section">
              <h3>Status Updates</h3>
              {mainOptions.map(renderOption)}
            </section>
          </>
        )}

        {historyOpen ? (
          <div className="gb-client-update-history-layer" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryOpen(false);
          }}>
            <section className="gb-client-update-history" role="dialog" aria-modal="true" aria-labelledby="gb-client-update-history-title">
              <header className="gb-client-update-history-heading">
                <div>
                  <div className="gb-client-update-kicker">{orderLabel}</div>
                  <h3 id="gb-client-update-history-title">Client Update History</h3>
                  <p>{name} | {recordTitle(type, record)}</p>
                </div>
                <button type="button" className="gb-client-update-history-close" onClick={() => setHistoryOpen(false)} aria-label="Close update history">x</button>
              </header>

              <div className="gb-client-update-history-summary" aria-label="Update delivery summary">
                <div><strong>{historyRows.length}</strong><span>Total</span></div>
                <div><strong>{historySummary.sent}</strong><span>Sent</span></div>
                <div><strong>{historySummary.queued}</strong><span>Queued</span></div>
                <div><strong>{historySummary.failed}</strong><span>Failed</span></div>
              </div>

              <div className="gb-client-update-history-toolbar">
                <span>Newest updates first</span>
                <button type="button" onClick={() => void retryQueuedEmails()} disabled={historyLoading || historyRetrying || historySummary.queued === 0}>
                  {historyRetrying ? 'Retrying...' : 'Retry queued emails'}
                </button>
                <button type="button" onClick={() => void loadHistory()} disabled={historyLoading}>
                  {historyLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              <div className="gb-client-update-history-list">
                {historyLoading && historyRows.length === 0 ? <div className="gb-client-update-history-empty">Loading history...</div> : null}
                {!historyLoading && historyError ? <div className="gb-client-update-error">{historyError}</div> : null}
                {!historyLoading && !historyError && historyRows.length === 0 ? (
                  <div className="gb-client-update-history-empty">No updates have been sent for this invoice yet.</div>
                ) : null}
                {!historyError ? historyRows.map((entry) => (
                  <article className="gb-client-update-history-item" key={entry.id}>
                    <div className="gb-client-update-history-item-top">
                      <strong>{entry.status_label}</strong>
                      <span className={`delivery-${entry.delivery_status}`}>{deliveryLabel(entry)}</span>
                    </div>
                    <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
                    {entry.recipient_email ? <div className="gb-client-update-history-recipient">To: {entry.recipient_email}</div> : null}
                    {entry.estimated_date ? <div className="gb-client-update-history-date">Estimated date: {entry.estimated_date}</div> : null}
                    {entry.message ? <p>{entry.message}</p> : null}
                    {entry.delivery_error ? <div className="gb-client-update-history-error">{entry.delivery_error}</div> : null}
                  </article>
                )) : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ClientUpdatePanel;
