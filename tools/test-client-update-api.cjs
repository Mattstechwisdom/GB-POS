const assert = require('assert');
const { Readable } = require('stream');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.GBPOS_CLIENT_UPDATE_DELIVERY_WAIT_MS = '50';

const historyWrites = [];
let deliveryShouldComplete = true;
global.fetch = async (url, options = {}) => {
  const method = String(options.method || 'GET').toUpperCase();
  const value = String(url);
  let status = 200;
  let body = null;

  if (value.endsWith('/auth/v1/user')) {
    body = { id: '00000000-0000-0000-0000-000000000001' };
  } else if (value.includes('/rest/v1/qr_status_tokens')) {
    body = [{
      id: '00000000-0000-0000-0000-000000000010',
      shop_id: '00000000-0000-0000-0000-000000000020',
      record_type: 'repair',
      legacy_record_id: 123,
    }];
  } else if (value.includes('/rest/v1/work_orders') && method === 'PATCH') {
    body = [{
      id: '00000000-0000-0000-0000-000000000030',
      shop_id: '00000000-0000-0000-0000-000000000020',
      legacy_id: 123,
      legacy_customer_id: 77,
      product_description: 'Test Phone',
      status_update: 'Diagnosis In Process',
    }];
  } else if (value.includes('/rest/v1/work_orders')) {
    body = [{
      id: '00000000-0000-0000-0000-000000000030',
      shop_id: '00000000-0000-0000-0000-000000000020',
      legacy_id: 123,
      legacy_customer_id: 77,
      product_description: 'Test Phone',
    }];
  } else if (value.includes('/rest/v1/customers')) {
    body = [{
      id: '00000000-0000-0000-0000-000000000040',
      first_name: 'Test',
      last_name: 'Client',
      email: 'client@example.com',
      phone: '8035550100',
    }];
  } else if (value.includes('/rest/v1/client_update_history') && method === 'POST') {
    const row = JSON.parse(String(options.body || '{}'));
    historyWrites.push(row);
    body = [{ ...row, id: `history-${historyWrites.length}`, created_at: new Date().toISOString() }];
  } else if (value.includes('/rest/v1/client_update_history') && method === 'GET') {
    const row = historyWrites[historyWrites.length - 1];
    body = row ? [{
      ...row,
      id: `history-${historyWrites.length}`,
      delivery_status: deliveryShouldComplete ? 'sent' : 'pending',
      provider_message_id: deliveryShouldComplete ? 'test-message-id' : null,
    }] : [];
  } else {
    status = 404;
    body = { message: `Unexpected request: ${method} ${value}` };
  }

  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
};

const { handleClientUpdateApi } = require('./client-update-api.cjs');

async function testCorsPreflight() {
  const req = Readable.from([]);
  req.url = '/api/client-updates/send';
  req.method = 'OPTIONS';
  req.headers = { origin: 'capacitor://localhost' };
  let status = 0;
  let headers = {};
  const res = {
    writeHead(nextStatus, nextHeaders) {
      status = nextStatus;
      headers = nextHeaders || {};
    },
    end() {},
  };
  const handled = await handleClientUpdateApi(req, res);
  assert.equal(handled, true);
  assert.equal(status, 204);
  assert.equal(headers['Access-Control-Allow-Origin'], '*');
  assert.match(headers['Access-Control-Allow-Methods'], /POST/);
  assert.match(headers['Access-Control-Allow-Headers'], /Authorization/);
}

async function invoke(statusKey) {
  const payload = JSON.stringify({ token: 'test-token', statusKey });
  const req = Readable.from([payload]);
  req.url = '/api/client-updates/send';
  req.method = 'POST';
  req.headers = { authorization: 'Bearer test-user-token' };
  let status = 0;
  let raw = '';
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead(nextStatus) {
      status = nextStatus;
      this.headersSent = true;
    },
    end(value) {
      raw = String(value || '');
      this.writableEnded = true;
    },
  };
  const handled = await handleClientUpdateApi(req, res);
  assert.equal(handled, true);
  assert.equal(status, 200);
  return JSON.parse(raw);
}

async function invokeTextWithoutSession(statusKey) {
  const payload = JSON.stringify({ token: 'test-token', statusKey, deliveryMode: 'text' });
  const req = Readable.from([payload]);
  req.url = '/api/client-updates/send';
  req.method = 'POST';
  req.headers = {};
  let status = 0;
  let raw = '';
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead(nextStatus) {
      status = nextStatus;
      this.headersSent = true;
    },
    end(value) {
      raw = String(value || '');
      this.writableEnded = true;
    },
  };
  const handled = await handleClientUpdateApi(req, res);
  assert.equal(handled, true);
  assert.equal(status, 200);
  return JSON.parse(raw);
}

(async () => {
  await testCorsPreflight();
  const sent = await invoke('diagnosis');
  assert.equal(sent.ok, true);
  assert.equal(sent.deliveryStatus, 'sent');
  assert.equal(historyWrites[0].delivery_status, 'pending');
  assert.equal(historyWrites[0].recipient_email, 'client@example.com');
  assert.match(historyWrites[0].email_html, /GADGETBOY Repair/);

  deliveryShouldComplete = false;
  const queued = await invoke('part_ordered');
  assert.equal(queued.ok, true);
  assert.equal(queued.statusSaved, true);
  assert.equal(queued.deliveryStatus, 'queued');
  assert.match(queued.message, /queued for secure delivery/);
  assert.equal(historyWrites[1].delivery_status, 'pending');

  const text = await invokeTextWithoutSession('repair_complete');
  assert.equal(text.ok, true);
  assert.equal(text.statusSaved, true);
  assert.equal(text.deliveryStatus, 'text_prepared');
  assert.equal(text.recipientPhone, '8035550100');
  assert.match(text.textMessage, /GADGETBOY UPDATE/);
  assert.match(text.textMessage, /Great news! Your repair is complete/);
  assert.match(text.textMessage, /Call us at \(803\) 708-0101 or email gadgetboysc@gmail\.com/);
  assert.doesNotMatch(text.textMessage, /reply to this email/i);
  assert.equal(historyWrites[2].delivery_status, 'not_requested');
  assert.equal(historyWrites[2].message, text.textMessage);

  console.log('Client update API tests passed (email outbox, delivered/queued states, and secure QR text preparation).');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
