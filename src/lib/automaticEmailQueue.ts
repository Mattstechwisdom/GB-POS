import { supabase } from './supabase';
import type { AutomaticClientEmailKind } from './automaticClientEmail';

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
