import { supabase } from './supabase';

export type CloudEmailAttachment = {
  filename: string;
  content?: string;
  contentBase64?: string;
  contentType?: string;
  encoding?: 'base64';
};

export type CloudEmailPayload = {
  shopId: string;
  to: string;
  bcc?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: CloudEmailAttachment[];
};

function resultError(error: unknown) {
  const context = (error as any)?.context;
  const contextBody = context?.body;
  if (contextBody && typeof contextBody === 'object' && contextBody.error) return String(contextBody.error);
  return String((error as any)?.message || error || 'Supabase email request failed.');
}

export async function getCloudEmailStatus(shopId: string) {
  if (!shopId) return { ok: false, configured: false, error: 'Cloud session is not ready. Sign in again.' };
  const { data, error } = await supabase.functions.invoke('send-pos-email', {
    body: { action: 'status', shopId },
  });
  if (error) return { ok: false, configured: false, error: resultError(error) };
  return {
    ok: Boolean(data?.ok),
    configured: Boolean(data?.configured),
    fromEmail: data?.fromEmail ? String(data.fromEmail) : undefined,
    fromName: data?.fromName ? String(data.fromName) : undefined,
    error: data?.error ? String(data.error) : undefined,
  };
}

export async function sendCloudEmail(payload: CloudEmailPayload) {
  if (!payload.shopId) return { ok: false, error: 'Cloud session is not ready. Sign in again.' };
  const { data, error } = await supabase.functions.invoke('send-pos-email', {
    body: { action: 'send', ...payload },
  });
  if (error) return { ok: false, error: resultError(error) };
  return {
    ok: Boolean(data?.ok),
    messageId: data?.messageId ? String(data.messageId) : null,
    error: data?.error ? String(data.error) : undefined,
  };
}
