const nodemailer = require('nodemailer');

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
    product_in_shop: 'Product In Shop',
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
  product_in_shop: 'Product In Shop',
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
  return String(value || '').toLowerCase() === 'sale' ? 'sale' : 'repair';
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
    gmailUser: String(process.env.GBPOS_EMAIL_FROM || 'gadgetboysc@gmail.com').trim(),
    gmailAppPassword: String(process.env.GBPOS_GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
    fromName: String(process.env.GBPOS_EMAIL_FROM_NAME || 'GadgetBoy Repair & Retail').trim(),
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
    const message = body?.message || body?.error_description || body?.error || text || `HTTP ${response.status}`;
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
    }, 'id,shop_id,record_type,legacy_record_id');
    tokenRow = tokenRows[0] || null;
    if (!tokenRow) throw Object.assign(new Error('QR token was not found or is no longer active.'), { status: 404 });
    type = normalizeType(tokenRow.record_type);
    legacyRecordId = Number(tokenRow.legacy_record_id || 0) || 0;
    shopId = String(tokenRow.shop_id || '');
  }

  if (!legacyRecordId) throw Object.assign(new Error('A saved ticket number is required.'), { status: 400 });
  const table = type === 'sale' ? 'sales' : 'work_orders';
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
  const item = context.type === 'sale'
    ? (record.item_description || record.category || 'order')
    : ([record.product_description, record.model].filter(Boolean).join(' - ') || record.product_category || 'device');
  const order = context.type === 'sale' ? `INV-${context.legacyRecordId}` : `WO-${context.legacyRecordId}`;
  return { name, email, item, order };
}

function buildPatch(type, statusKey, statusLabel, estimatedDate, notes) {
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
  return patch;
}

function emailCopy(context, statusKey, statusLabel, estimatedDate, notes) {
  const details = customerDetails(context);
  const manual = statusKey === 'manual_update';
  const subject = manual
    ? `Update from GadgetBoy - ${details.order}`
    : `${statusLabel} - ${details.order}`;
  const updateText = manual ? (notes || statusLabel) : statusLabel;
  const dateText = estimatedDate ? `\nEstimated date: ${estimatedDate}` : '';
  const noteText = !manual && notes ? `\nTechnician note: ${notes}` : '';
  const text = `Hi ${details.name},\n\nHere is an update for ${details.item} (${details.order}):\n\n${updateText}${dateText}${noteText}\n\nQuestions? Call (803) 708-0101 or reply to this email.\n\nGadgetBoy Repair & Retail\n2822 Devine Street, Columbia, SC 29205`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b"><div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #d4d4d8"><div style="padding:18px 22px;background:#18181b;border-bottom:4px solid #39ff14;color:#fff"><div style="font-size:18px;font-weight:800">GADGETBOY Repair &amp; Retail</div><div style="margin-top:4px;font-size:12px;color:#d4d4d8">2822 Devine Street, Columbia, SC 29205 | (803) 708-0101</div></div><div style="padding:24px"><p style="margin-top:0">Hi <strong>${esc(details.name)}</strong>,</p><p>Here is an update for <strong>${esc(details.item)}</strong> (${esc(details.order)}).</p><div style="margin:20px 0;padding:16px;border:1px solid #a1a1aa;border-left:5px solid #8b5cf6;background:#fafafa"><div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#52525b">Current update</div><div style="margin-top:6px;font-size:18px;font-weight:800">${esc(updateText)}</div>${estimatedDate ? `<div style="margin-top:10px"><strong>Estimated date:</strong> ${esc(estimatedDate)}</div>` : ''}${!manual && notes ? `<div style="margin-top:10px"><strong>Technician note:</strong> ${esc(notes)}</div>` : ''}</div><p style="font-size:13px;color:#52525b">Questions? Call (803) 708-0101 or reply to this email.</p></div></div></body></html>`;
  return { ...details, subject, text, html };
}

let mailTransport = null;

async function sendEmail(config, message) {
  if (!message.email) throw new Error('The client does not have an email address on file.');
  if (!config.gmailAppPassword) throw new Error('Railway email delivery is not configured. Add GBPOS_GMAIL_APP_PASSWORD.');
  if (!mailTransport) {
    mailTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: config.gmailUser, pass: config.gmailAppPassword },
    });
  }
  const info = await mailTransport.sendMail({
    from: `${config.fromName} <${config.gmailUser}>`,
    to: message.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return String(info?.messageId || '');
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

async function handleSend(req, res) {
  const config = serverConfig();
  if (!config.supabaseUrl || !config.publishableKey) {
    json(res, 503, { ok: false, error: 'The server Supabase configuration is incomplete.' });
    return;
  }
  const token = bearerToken(req);
  if (!token) {
    json(res, 401, { ok: false, error: 'Sign in before sending a client update.' });
    return;
  }

  try {
    await verifyUser(config, token);
    const body = await readBody(req);
    const context = await resolveTicket(config, token, body);
    const statusKey = String(body.statusKey || '').trim();
    const statusLabel = STATUS_OPTIONS[context.type]?.[statusKey];
    if (!statusLabel) throw Object.assign(new Error('That status update is not supported for this ticket.'), { status: 400 });
    const estimatedDate = String(body.estimatedDate || '').trim();
    const notes = String(body.notes || '').trim().slice(0, 5000);
    if (statusKey === 'manual_update' && !notes) {
      throw Object.assign(new Error('Enter the message you want to send to the client.'), { status: 400 });
    }

    const savedRecord = await updateTicket(
      config,
      token,
      context,
      buildPatch(context.type, statusKey, statusLabel, estimatedDate, notes),
    );
    const message = emailCopy(context, statusKey, statusLabel, estimatedDate, notes);
    let deliveryStatus = 'sent';
    let deliveryError = '';
    let providerMessageId = '';
    try {
      providerMessageId = await sendEmail(config, message);
    } catch (error) {
      deliveryStatus = 'failed';
      deliveryError = String(error?.message || error);
    }

    const history = await insertHistory(config, token, {
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
      delivery_status: deliveryStatus,
      delivery_error: deliveryError || null,
      provider_message_id: providerMessageId || null,
    });

    if (deliveryStatus === 'failed') {
      json(res, 200, {
        ok: false,
        statusSaved: true,
        deliveryStatus,
        error: `Status saved, but email was not sent: ${deliveryError}`,
        record: savedRecord,
        history,
      });
      return;
    }
    json(res, 200, {
      ok: true,
      statusSaved: true,
      deliveryStatus,
      message: `Status saved and email sent to ${message.email}.`,
      record: savedRecord,
      history,
    });
  } catch (error) {
    const status = Number(error?.status || 500) || 500;
    json(res, status, { ok: false, error: String(error?.message || error) });
  }
}

async function handleClientUpdateApi(req, res) {
  const parsed = new URL(req.url || '/', 'http://localhost');
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
