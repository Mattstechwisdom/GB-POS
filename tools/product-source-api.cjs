const ROUTE = '/api/product-source';
const MAX_BODY_BYTES = 12 * 1024;
const MAX_SOURCE_BYTES = 1_500_000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 30;
const SOURCE_CACHE_MS = 15 * 60 * 1000;
const requestLog = new Map();
const sourceCache = new Map();
const pendingSources = new Map();

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let settled = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (settled) return;
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        settled = true;
        reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(Object.assign(new Error('Request body is not valid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function safeProductUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); } catch { return ''; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return '';
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1') return '';
  if (/^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) return '';
  parsed.hash = '';
  return parsed.toString();
}

function bearer(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

async function verifySession(options, token) {
  if (!options.supabaseUrl || !options.publishableKey || !token) throw Object.assign(new Error('Sign in before using product autofill.'), { status: 401 });
  const response = await fetch(`${options.supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: { apikey: options.publishableKey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Object.assign(new Error('Your shop session expired. Sign in again.'), { status: 401 });
}

function checkRateLimit(key) {
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) throw Object.assign(new Error('Too many product requests. Wait a moment and retry.'), { status: 429 });
  recent.push(now);
  requestLog.set(key, recent);
}

function readerUrls(url) {
  const parsed = new URL(url);
  const suffix = `${parsed.host}${parsed.pathname}${parsed.search}`;
  return [`https://r.jina.ai/https://${suffix}`, `https://r.jina.ai/http://${suffix}`];
}

async function fetchReaderSource(url) {
  const cached = sourceCache.get(url);
  if (cached && Date.now() - cached.savedAt < SOURCE_CACHE_MS) return cached.source;
  if (pendingSources.has(url)) return pendingSources.get(url);
  const pending = Promise.any(readerUrls(url).map(async (readerUrl) => {
    const response = await fetch(readerUrl, {
      headers: { Accept: 'text/plain', 'User-Agent': 'GadgetBoy-POS/1.0 product metadata reader' },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`Product reader failed (${response.status}).`);
    const source = (await response.text()).slice(0, MAX_SOURCE_BYTES);
    if (!source.trim()) throw new Error('Product reader returned an empty page.');
    return source;
  })).then((source) => {
    sourceCache.set(url, { savedAt: Date.now(), source });
    return source;
  }).finally(() => pendingSources.delete(url));
  pendingSources.set(url, pending);
  return pending;
}

function createProductSourceHandler(options = {}) {
  return async function handleProductSource(req, res) {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname !== ROUTE) return false;
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return true;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
      return true;
    }
    try {
      const token = bearer(req);
      await verifySession(options, token);
      checkRateLimit(token.slice(-24) || req.socket?.remoteAddress || 'unknown');
      const body = await readBody(req);
      const url = safeProductUrl(body?.url);
      if (!url) throw Object.assign(new Error('Enter a valid public product URL.'), { status: 400 });
      const source = await fetchReaderSource(url).catch((error) => {
        throw Object.assign(new Error(error?.message || 'Product page readers failed.'), { status: 502 });
      });
      sendJson(res, 200, { ok: true, url, format: 'reader-markdown', source });
    } catch (error) {
      sendJson(res, Number(error?.status) || 500, { ok: false, error: error?.message || 'Could not read product page.' });
    }
    return true;
  };
}

module.exports = { createProductSourceHandler, safeProductUrl, fetchReaderSource };
