import { supabase } from './supabase';
import type { AutomaticClientEmailKind } from './automaticClientEmail';
import { classifyAcknowledgment, renderAutomaticClientEmail } from './automaticClientEmail';

export type AutomaticEmailQueueInput = {
  recordType: 'repair' | 'sale' | 'consult';
  legacyRecordId: number;
  eventType: AutomaticClientEmailKind;
  eventDigest: string;
  recipientEmail?: string;
  emailDeclined?: boolean;
  statusLabel: string;
  subject: string;
  text: string;
  html: string;
};

export async function queueAutomaticClientEmail(input: AutomaticEmailQueueInput) {
  const { data, error } = await supabase.rpc('queue_automatic_client_email', {
    p_record_type: input.recordType,
    p_legacy_record_id: input.legacyRecordId,
    p_event_type: input.eventType,
    p_event_digest: input.eventDigest,
    p_payload: {
      recipient_email: input.recipientEmail || null,
      email_declined: Boolean(input.emailDeclined),
      status_label: input.statusLabel,
      email_subject: input.subject,
      email_text: input.text,
      email_html: input.html,
    },
  });
  if (error) return { ok: false, queued: false, error: error.message };
  const history = Array.isArray(data) ? data[0] : data;
  if (!history || history.delivery_status === 'not_sent' || history.delivery_status === 'sent') {
    return { ok: true, queued: false, history };
  }
  const shopId = String(history.shop_id || '');
  const { data: delivery, error: deliveryError } = await supabase.functions.invoke('send-pos-email', {
    body: { action: 'send-client-update', shopId, historyId: history.id },
  });
  return deliveryError
    ? { ok: true, queued: true, history, error: deliveryError.message }
    : { ok: true, queued: !delivery?.ok, history, delivery };
}

export async function queueInitialPaymentAcknowledgment(input: {
  recordType: 'repair' | 'sale';
  record: Record<string, any>;
  payment: Record<string, any>;
  customer?: Record<string, any> | null;
  statusUrl?: string;
}) {
  try {
    const record: Record<string, any> = { ...input.record, recordType: input.recordType };
    const kind = classifyAcknowledgment(record, input.payment);
    const legacyRecordId = Number(record.id || 0);
    if (!kind || !(legacyRecordId > 0)) return { ok: true, queued: false };
    const customer = input.customer || {};
    const device = [record.productDescription || record.productCategory, record.model].filter(Boolean).join(' - ') || 'your device';
    const items = Array.isArray(record.items) ? record.items : [];
    const rendered = renderAutomaticClientEmail(kind, {
      firstName: customer.firstName || String(record.customerName || '').trim().split(/\s+/)[0] || 'there',
      recordNumber: legacyRecordId,
      device,
      amount: Number(input.payment.applied ?? input.payment.amount ?? 0),
      problem: record.problemInfo || 'Not provided',
      part: items.find((item: any) => item?.inStock === false)?.description || items[0]?.description || 'Repair part',
      itemSummary: items.map((item: any) => item.description).filter(Boolean).join(', ') || record.itemDescription || 'Purchase',
      statusUrl: input.statusUrl,
    });
    return await queueAutomaticClientEmail({
      recordType: input.recordType,
      legacyRecordId,
      eventType: kind,
      eventDigest: 'initial-payment-v1',
      recipientEmail: customer.email || record.customerEmail || '',
      emailDeclined: Boolean(customer.emailDeclined || customer.declinedEmail),
      statusLabel: kind === 'diagnostic-intake' ? 'Diagnostic intake acknowledgment' : kind === 'part-awaiting-delivery' ? 'Ordered part payment acknowledgment' : 'Completed sale thank-you',
      ...rendered,
    });
  } catch (error) {
    console.warn('Automatic client acknowledgment could not be queued; checkout remains saved.', error);
    return { ok: false, queued: false, error: String((error as any)?.message || error) };
  }
}
