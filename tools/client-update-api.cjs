const STATUS_OPTIONS = {
  repair: {
    pickup_reminder: 'Pickup Reminder',
    manual_update: 'Send Update',
    diagnosis: 'Diagnosis In Process',
    waiting_device: 'Waiting on Device',
    part_ordered: 'Part Ordered',
    waiting_part: 'Waiting on Part Delivery',
    part_delivered: 'Part Delivered',
    repair_complete: 'Repair Complete',
    not_possible: 'Repair Not Possible',
  },
  sale: {
    pickup_reminder: 'Pickup Reminder',
    manual_update: 'Send Update',
    product_ordered: 'Product Ordered',
    shipping_delayed: 'Shipping Delay',
    product_in_shop: 'Product Arrived',
  },
  consult: {
    consultation_reminder: 'Consultation Reminder',
    consultation_delayed: 'Consultation Schedule Change',
    consultation_confirmed: 'Consultation Confirmed',
    consultation_complete: 'Consultation Complete',
    manual_update: 'Send Update',
  },
};

const REPAIR_STATUS = {
  diagnosis: 'Diagnosis In Process',
  waiting_device: 'Waiting for Device Drop-off',
  part_ordered: 'Part Ordered',
  waiting_part: 'Waiting on Part Delivery',
  part_delivered: 'Part Delivered - Repairs Starting',
  repair_complete: 'Repair Complete',
  not_possible: 'Repair Not Possible',
};

const SALE_STATUS = {
  product_ordered: 'Product Ordered',
  shipping_delayed: 'Shipping Delayed',
  product_in_shop: 'Product Arrived',
};

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeType(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'sale') return 'sale';
  if (normalized === 'consult' || normalized === 'consultation') return 'consult';
  return 'repair';
}

function icsEscape(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function icsDate(date, time) {
  const day = String(date || '').replace(/-/g, '');
  const clock = String(time || '09:00').replace(':', '').padEnd(4, '0');
  return `${day}T${clock}00`;
}

async function handleConsultationReminder(req, res, config, parsed) {
  if (!config.supabaseUrl || !config.publishableKey || !config.serviceRoleKey) {
    json(res, 503, { ok: false, error: 'Secure consultation reminders are not configured.' });
    return;
  }
  const token = String(parsed.searchParams.get('token') || '').trim();
  if (!token) { json(res, 400, { ok: false, error: 'Missing reminder token.' }); return; }
  try {
    const tokenRows = await selectRows(config, config.serviceRoleKey, 'qr_status_tokens', { token: `eq.${token}`, record_type: 'eq.consult', revoked_at: 'is.null' });
    const tokenRow = tokenRows[0];
    if (!tokenRow) throw Object.assign(new Error('This consultation reminder link is not active.'), { status: 404 });
    if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) throw Object.assign(new Error('This consultation reminder link has expired.'), { status: 410 });
    const eventRows = await selectRows(config, config.serviceRoleKey, 'calendar_events', { shop_id: `eq.${tokenRow.shop_id}`, legacy_id: `eq.${tokenRow.legacy_record_id}` });
    const event = eventRows[0];
    if (!event) throw Object.assign(new Error('The consultation could not be found.'), { status: 404 });
    const start = icsDate(event.event_date, event.event_time);
    const end = icsDate(event.event_date, event.end_time || event.event_time || '10:00');
    const uid = `consult-${tokenRow.shop_id}-${tokenRow.legacy_record_id}@gadgetboypos`;
    const calendar = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GadgetBoy POS//Consultation Reminder//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${icsEscape(uid)}`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,`DTSTART:${start}`,`DTEND:${end}`,`SUMMARY:${icsEscape(event.title || 'GadgetBoy Consultation')}`,`LOCATION:${icsEscape(event.location || '')}`,`DESCRIPTION:${icsEscape(event.notes || 'Scheduled consultation with GadgetBoy Repair & Retail.')}`,'BEGIN:VALARM','TRIGGER:-PT1H','ACTION:DISPLAY','DESCRIPTION:Consultation begins in one hour','END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="GadgetBoy-Consultation-${tokenRow.legacy_record_id}.ics"`, 'Cache-Control': 'no-store' });
    res.end(calendar);
  } catch (error) {
    json(res, Number(error?.status || 500) || 500, { ok: false, error: String(error?.message || error) });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function serverConfig() {
  return {
    supabaseUrl: String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, ''),
    publishableKey: String(
      process.env.SUPABASE_PUBLISHABLE_KEY
      || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
      || process.env.SUPABASE_ANON_KEY
      || '',
    ),
    serviceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    deliveryWaitMs: Math.min(10_000, Math.max(0, Number(process.env.GBPOS_CLIENT_UPDATE_DELIVERY_WAIT_MS || 10_000) || 0)),
  };
}

function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = body?.message
      || body?.error_description
      || body?.error?.message
      || (typeof body?.error === 'string' ? body.error : '')
      || text
      || `HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    throw error;
  }
  return body;
}

function restHeaders(config, token, extras) {
  return {
    apikey: config.publishableKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extras,
  };
}

function restUrl(config, table, filters, select = '*') {
  const params = new URLSearchParams();
  params.set('select', select);
  Object.entries(filters || {}).forEach(([key, value]) => params.set(key, String(value)));
  return `${config.supabaseUrl}/rest/v1/${table}?${params.toString()}`;
}

async function verifyUser(config, token) {
  return fetchJson(`${config.supabaseUrl}/auth/v1/user`, {
    headers: restHeaders(config, token),
  });
}

async function selectRows(config, token, table, filters, select = '*') {
  const rows = await fetchJson(restUrl(config, table, filters, select), {
    headers: restHeaders(config, token),
  });
  return Array.isArray(rows) ? rows : [];
}

async function resolveTicket(config, token, body) {
  let tokenRow = null;
  let type = normalizeType(body.recordType);
  let legacyRecordId = Number(body.recordId || 0) || 0;
  let shopId = '';

  if (body.token) {
    const tokenRows = await selectRows(config, token, 'qr_status_tokens', {
      token: `eq.${String(body.token).trim()}`,
      revoked_at: 'is.null',
    }, 'id,shop_id,record_type,legacy_record_id,expires_at');
    tokenRow = tokenRows[0] || null;
    if (!tokenRow) throw Object.assign(new Error('QR token was not found or is no longer active.'), { status: 404 });
    if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) {
      throw Object.assign(new Error('This QR token is expired.'), { status: 410 });
    }
    type = normalizeType(tokenRow.record_type);
    legacyRecordId = Number(tokenRow.legacy_record_id || 0) || 0;
    shopId = String(tokenRow.shop_id || '');
  }

  if (!legacyRecordId) throw Object.assign(new Error('A saved ticket number is required.'), { status: 400 });
  const table = type === 'sale' || type === 'consult' ? 'sales' : 'work_orders';
  const filters = { legacy_id: `eq.${legacyRecordId}` };
  if (shopId) filters.shop_id = `eq.${shopId}`;
  const recordRows = await selectRows(config, token, table, filters);
  const record = recordRows[0] || null;
  if (!record) throw Object.assign(new Error('The synced ticket could not be found.'), { status: 404 });
  shopId = String(record.shop_id || shopId);

  let customer = null;
  if (record.customer_id) {
    const rows = await selectRows(config, token, 'customers', {
      shop_id: `eq.${shopId}`,
      id: `eq.${record.customer_id}`,
    });
    customer = rows[0] || null;
  } else if (record.legacy_customer_id) {
    const rows = await selectRows(config, token, 'customers', {
      shop_id: `eq.${shopId}`,
      legacy_id: `eq.${record.legacy_customer_id}`,
    });
    customer = rows[0] || null;
  }

  return { tokenRow, type, legacyRecordId, shopId, table, record, customer };
}

function customerDetails(context) {
  const record = context.record || {};
  const customer = context.customer || {};
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
    || record.customer_name
    || 'Client';
  const email = String(customer.email || record.customer_email || '').trim();
  const phone = String(customer.phone || record.customer_phone || '').trim();
  const item = context.type === 'sale' || context.type === 'consult'
    ? (record.item_description || record.category || 'order')
    : ([record.product_description, record.model].filter(Boolean).join(' - ') || record.product_category || 'device');
  const order = context.type === 'sale' ? `INV-${context.legacyRecordId}` : context.type === 'consult' ? `CONS-${context.legacyRecordId}` : `WO-${context.legacyRecordId}`;
  return { name, email, phone, item, order };
}

function buildPatch(type, statusKey, statusLabel, estimatedDate, estimatedTime, notes) {
  const now = new Date().toISOString();
  const manual = statusKey === 'manual_update';
  const patch = {
    status_updated_at: now,
    estimated_date: estimatedDate || null,
    tech_notes: notes || '',
  };
  if (manual) {
    patch.last_update_note = notes || statusLabel;
    patch.last_update_at = now;
  } else {
    patch.status_update = statusLabel;
  }
  if (type === 'repair' && REPAIR_STATUS[statusKey]) patch.repair_status = REPAIR_STATUS[statusKey];
  if (type === 'sale' && SALE_STATUS[statusKey]) patch.status = SALE_STATUS[statusKey];
  if (type === 'consult') {
    patch.status = statusLabel;
    if (statusKey === 'consultation_delayed') {
      if (estimatedDate) patch.appointment_date = estimatedDate;
      if (estimatedTime) patch.appointment_time = estimatedTime;
    }
  }
  return patch;
}

function emailCopy(context, statusKey, statusLabel, estimatedDate, estimatedTime, notes) {
  const details = customerDetails(context);
  const manual = statusKey === 'manual_update';
  const subject = manual
    ? `Update from GadgetBoy - ${details.order}`
    : `${statusLabel} - ${details.order}`;
  const updateText = manual ? (notes || statusLabel) : statusLabel;
  const dateText = estimatedDate ? `\n${statusKey === 'consultation_delayed' ? 'Proposed date' : 'Estimated date'}: ${estimatedDate}${estimatedTime ? ` at ${estimatedTime}` : ''}` : '';
  const noteText = !manual && notes ? `\nTechnician note: ${notes}` : '';
  const text = `Hi ${details.name},\n\nHere is an update for ${details.item} (${details.order}):\n\n${updateText}${dateText}${noteText}\n\nQuestions? Call (803) 708-0101 or reply to this email.\n\nGadgetBoy Repair & Retail\n2822 Devine Street, Columbia, SC 29205`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b"><div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #d4d4d8"><div style="padding:18px 22px;background:#18181b;border-bottom:4px solid #39ff14;color:#fff"><div style="font-size:18px;font-weight:800">GADGETBOY Repair &amp; Retail</div><div style="margin-top:4px;font-size:12px;color:#d4d4d8">2822 Devine Street, Columbia, SC 29205 | (803) 708-0101</div></div><div style="padding:24px"><p style="margin-top:0">Hi <strong>${esc(details.name)}</strong>,</p><p>Here is an update for <strong>${esc(details.item)}</strong> (${esc(details.order)}).</p><div style="margin:20px 0;padding:16px;border:1px solid #a1a1aa;border-left:5px solid #8b5cf6;background:#fafafa"><div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#52525b">Current update</div><div style="margin-top:6px;font-size:18px;font-weight:800">${esc(updateText)}</div>${estimatedDate ? `<div style="margin-top:10px"><strong>${statusKey === 'consultation_delayed' ? 'Proposed date' : 'Estimated date'}:</strong> ${esc(estimatedDate)}${estimatedTime ? ` at ${esc(estimatedTime)}` : ''}</div>` : ''}${!manual && notes ? `<div style="margin-top:10px"><strong>Technician note:</strong> ${esc(notes)}</div>` : ''}</div><p style="font-size:13px;color:#52525b">Questions? Call (803) 708-0101 or reply to this email.</p></div></div></body></html>`;
  return { ...details, subject, text, html };
}

function smsCopy(context, statusKey, statusLabel, estimatedDate, estimatedTime, notes) {
  const details = customerDetails(context);
  const statusMessages = {
    pickup_reminder: `\u{1F44B} Friendly reminder: Your ${details.item} is ready for pickup whenever it is convenient for you.`,
    diagnosis: '\u{1F50D} Diagnosis is underway. Our technicians are carefully checking your device and will keep you posted.',
    waiting_device: '\u{1F4F1} We are ready for the next step and are currently waiting for your device to be dropped off.',
    part_ordered: '\u{1F4E6} Your repair part has been ordered. We will let you know as soon as it arrives.',
    waiting_part: '\u{1F69A} Your repair is waiting on the ordered part to arrive. We are tracking it and will keep you updated.',
    part_delivered: '\u{2705} Your part has arrived, and your repair is moving into the next stage.',
    repair_complete: '\u{1F389} Great news! Your repair is complete and your device is ready for pickup.',
    not_possible: '\u{2139}\u{FE0F} We completed our assessment, but unfortunately the repair could not be completed.',
    product_ordered: '\u{1F4E6} Your product has been ordered. We will let you know as soon as it arrives.',
    shipping_delayed: '\u{23F0} Shipping has been delayed. We are monitoring the order and will keep you updated.',
    product_in_shop: '\u{1F389} Great news! Your product has arrived and is ready for pickup.',
    consultation_reminder: '\u{1F4C5} This is a friendly reminder about your upcoming GadgetBoy consultation.',
    consultation_delayed: '\u{23F0} We need to adjust the scheduled time for your consultation. Please review the proposed date and reply to confirm.',
    consultation_confirmed: '\u{2705} Your GadgetBoy consultation is confirmed.',
    consultation_complete: '\u{2705} Your consultation has been completed. Thank you for working with GadgetBoy.',
  };
  const updateText = statusKey === 'manual_update'
    ? `\u{1F4AC} ${notes || statusLabel}`
    : (statusMessages[statusKey] || statusLabel);
  const dateText = estimatedDate ? `\n\u{1F4C5} ${statusKey === 'consultation_delayed' ? 'Proposed date' : 'Estimated date'}: ${estimatedDate}${estimatedTime ? ` at ${estimatedTime}` : ''}` : '';
  const noteText = statusKey !== 'manual_update' && notes
    ? `\n\u{1F4DD} Technician note: ${notes}`
    : '';
  const text = `GADGETBOY UPDATE\n\nHi ${details.name}! Here is the latest on your ${details.item}:\n\n${updateText}${dateText}${noteText}\n\nTicket: ${details.order}\nQuestions? Call us at (803) 708-0101 or email gadgetboysc@gmail.com.\n\nGadgetBoy Repair & Retail`;
  return { ...details, text };
}

async function updateTicket(config, token, context, patch) {
  const rows = await fetchJson(restUrl(config, context.table, {
    shop_id: `eq.${context.shopId}`,
    legacy_id: `eq.${context.legacyRecordId}`,
  }), {
    method: 'PATCH',
    headers: restHeaders(config, token, { Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  });
  const saved = Array.isArray(rows) ? rows[0] : null;
  if (!saved) throw new Error('The ticket status could not be updated.');
  return saved;
}

async function insertHistory(config, token, row) {
  const result = await fetchJson(`${config.supabaseUrl}/rest/v1/client_update_history?select=*`, {
    method: 'POST',
    headers: restHeaders(config, token, { Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  return Array.isArray(result) ? result[0] : null;
}

async function waitForQueuedDelivery(config, token, historyId, timeoutMs = 10_000) {
  if (!historyId) return null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const rows = await selectRows(config, token, 'client_update_history', { id: `eq.${historyId}` });
    const current = rows[0] || null;
    if (!current || current.delivery_status === 'sent' || current.delivery_status === 'failed') return current;
  }
  return null;
}

async function requestCloudEmailDelivery(config, history) {
  if (!history?.id || !history?.shop_id || !config.serviceRoleKey) return null;
  try {
    return await fetchJson(`${config.supabaseUrl}/functions/v1/send-pos-email`, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'send-client-update',
        shopId: history.shop_id,
        historyId: history.id,
      }),
    });
  } catch (error) {
    console.error('Supabase client-update email delivery failed:', error?.message || String(error));
    return null;
  }
}

async function handleSend(req, res) {
  const config = serverConfig();
  if (!config.supabaseUrl || !config.publishableKey) {
    json(res, 503, { ok: false, error: 'The server Supabase configuration is incomplete.' });
    return;
  }
  try {
    const body = await readBody(req);
    const userToken = bearerToken(req);
    const qrToken = String(body.token || '').trim();
    if (userToken) {
      await verifyUser(config, userToken);
    } else if (!qrToken) {
      throw Object.assign(new Error('Sign in before sending a client update.'), { status: 401 });
    } else if (!config.serviceRoleKey) {
      throw Object.assign(new Error('Secure QR updates are not configured on the server.'), { status: 503 });
    }
    // The service key never leaves Railway. It is used only after the request
    // presents an active, unexpired QR capability token.
    const dataToken = userToken || config.serviceRoleKey;
    const context = await resolveTicket(config, dataToken, body);
    const statusKey = String(body.statusKey || '').trim();
    const statusLabel = STATUS_OPTIONS[context.type]?.[statusKey];
    if (!statusLabel) throw Object.assign(new Error('That status update is not supported for this ticket.'), { status: 400 });
    const estimatedDate = String(body.estimatedDate || '').trim();
    const estimatedTime = String(body.estimatedTime || '').trim();
    const notes = String(body.notes || '').trim().slice(0, 5000);
    if (statusKey === 'manual_update' && !notes) {
      throw Object.assign(new Error('Enter the message you want to send to the client.'), { status: 400 });
    }

    const deliveryMode = String(body.deliveryMode || 'email').toLowerCase() === 'text' ? 'text' : 'email';
    if (statusKey === 'consultation_delayed' && (!estimatedDate || !estimatedTime)) {
      throw Object.assign(new Error('Enter the proposed consultation date and time.'), { status: 400 });
    }
    const message = emailCopy(context, statusKey, statusLabel, estimatedDate, estimatedTime, notes);
    if (deliveryMode === 'email' && !message.email) {
      throw Object.assign(new Error('The client does not have an email address on file.'), { status: 400 });
    }
    const savedRecord = await updateTicket(
      config,
      dataToken,
      context,
      buildPatch(context.type, statusKey, statusLabel, estimatedDate, estimatedTime, notes),
    );
    if (deliveryMode === 'text') {
      const sms = smsCopy(context, statusKey, statusLabel, estimatedDate, estimatedTime, notes);
      if (!sms.phone) throw Object.assign(new Error('The client does not have a phone number on file.'), { status: 400 });
      const history = await insertHistory(config, dataToken, {
        shop_id: context.shopId,
        qr_token_id: context.tokenRow?.id || null,
        record_type: context.type,
        legacy_record_id: context.legacyRecordId,
        status_key: statusKey,
        status_label: statusLabel,
        message: sms.text,
        estimated_date: estimatedDate || null,
        recipient_email: null,
        email_subject: null,
        delivery_status: 'not_requested',
        delivery_error: null,
        provider_message_id: null,
      });
      json(res, 200, {
        ok: true,
        statusSaved: true,
        deliveryStatus: 'text_prepared',
        message: 'Status saved. Your messaging app is ready with the client and update filled in.',
        recipientPhone: sms.phone,
        textMessage: sms.text,
        record: savedRecord,
        history,
      });
      return;
    }
    const history = await insertHistory(config, dataToken, {
      shop_id: context.shopId,
      qr_token_id: context.tokenRow?.id || null,
      record_type: context.type,
      legacy_record_id: context.legacyRecordId,
      status_key: statusKey,
      status_label: statusLabel,
      message: notes || null,
      estimated_date: estimatedDate || null,
      recipient_email: message.email || null,
      email_subject: message.subject,
      email_text: message.text,
      email_html: message.html,
      delivery_status: 'pending',
      delivery_error: null,
      provider_message_id: null,
      delivery_attempts: 0,
      next_attempt_at: new Date().toISOString(),
      delivery_updated_at: new Date().toISOString(),
    });
    await requestCloudEmailDelivery(config, history);
    const delivered = await waitForQueuedDelivery(config, dataToken, history?.id, config.deliveryWaitMs);
    if (delivered?.delivery_status === 'sent') {
      json(res, 200, {
        ok: true,
        statusSaved: true,
        deliveryStatus: 'sent',
        message: `Status saved and email sent to ${message.email}.`,
        record: savedRecord,
        history: delivered,
      });
      return;
    }
    json(res, 200, {
      ok: true,
      statusSaved: true,
      deliveryStatus: 'queued',
      message: `Status saved. Email to ${message.email} is queued for secure delivery by the shop POS.`,
      record: savedRecord,
      history: delivered || history,
    });
  } catch (error) {
    const status = Number(error?.status || 500) || 500;
    json(res, status, { ok: false, error: String(error?.message || error) });
  }
}

async function handleClientUpdateApi(req, res) {
  const parsed = new URL(req.url || '/', 'http://localhost');
  if (parsed.pathname === '/api/consultation-reminder' && req.method === 'GET') {
    await handleConsultationReminder(req, res, serverConfig(), parsed);
    return true;
  }
  if (parsed.pathname !== '/api/client-updates/send') return false;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return true;
  }
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Method not allowed.' });
    return true;
  }
  await handleSend(req, res);
  return true;
}

module.exports = { handleClientUpdateApi };
