const assert = require('assert');
const { Readable } = require('stream');
const nodemailer = require('nodemailer');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.GBPOS_GMAIL_APP_PASSWORD = 'test-app-password';

let mailShouldFail = false;
nodemailer.createTransport = () => ({
  sendMail: async (message) => {
    assert.equal(message.to, 'client@example.com');
    if (mailShouldFail) throw new Error('Simulated provider rejection');
    return { messageId: 'test-message-id' };
  },
});

const historyWrites = [];
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
    }];
  } else if (value.includes('/rest/v1/client_update_history') && method === 'POST') {
    const row = JSON.parse(String(options.body || '{}'));
    historyWrites.push(row);
    body = [{ ...row, id: `history-${historyWrites.length}`, created_at: new Date().toISOString() }];
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

(async () => {
  await testCorsPreflight();
  const sent = await invoke('diagnosis');
  assert.equal(sent.ok, true);
  assert.equal(sent.deliveryStatus, 'sent');
  assert.equal(historyWrites[0].delivery_status, 'sent');
  assert.equal(historyWrites[0].provider_message_id, 'test-message-id');

  mailShouldFail = true;
  const failed = await invoke('part_ordered');
  assert.equal(failed.ok, false);
  assert.equal(failed.statusSaved, true);
  assert.equal(failed.deliveryStatus, 'failed');
  assert.match(failed.error, /Simulated provider rejection/);
  assert.equal(historyWrites[1].delivery_status, 'failed');
  assert.match(historyWrites[1].delivery_error, /Simulated provider rejection/);

  console.log('Client update API tests passed (sent and failed delivery history).');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
