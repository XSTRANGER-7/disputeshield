'use strict';
/**
 * PayPal REST client. Uses the built-in fetch in Node 18+.
 * OAuth, Orders v2 (create, capture, details, tracking), Payments v2 (capture details),
 * Transaction Search, Disputes v1 (list, detail, evidence, messages, accept claim and the
 * sandbox-only require-evidence and adjudicate endpoints) and Webhooks (register + verify).
 */
const crypto = require('crypto');
const { config } = require('./config');

class PayPalError extends Error {
  constructor(message, status, body, debugId) {
    super(message);
    this.name = 'PayPalError';
    this.status = status;
    this.body = body;
    this.debugId = debugId || (body && body.debug_id) || null;
  }
}

let tokenCache = { token: null, expiresAt: 0, clientId: '' };

function isConfigured() {
  const c = config().paypal;
  return Boolean(c.clientId && c.secret);
}

async function getToken(force = false) {
  const c = config().paypal;
  if (!isConfigured()) throw new PayPalError('PayPal credentials are missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.', 400, null);
  if (!force && tokenCache.token && tokenCache.clientId === c.clientId && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  let res;
  for (let i = 0; i < 3; i += 1) {
    try {
      res = await fetch(`${c.base}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${c.clientId}:${c.secret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(20_000)
      });
      if (res.status < 500) break;
    } catch (err) {
      if (i === 2) throw new PayPalError(`Could not reach PayPal to sign in (${err.name === 'TimeoutError' ? 'timed out' : (err.cause && err.cause.code) || err.message}).`, 504, null);
    }
    await sleep(700 * (i + 1));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new PayPalError(`PayPal sign-in failed: ${data.error_description || data.error || res.status}. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.`, res.status === 401 ? 502 : res.status, data, res.headers.get('paypal-debug-id'));
  }
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3000) * 1000, clientId: c.clientId, appId: data.app_id };
  return tokenCache.token;
}

function describeError(data) {
  if (!data || typeof data !== 'object') return '';
  const parts = [];
  if (data.message) parts.push(data.message);
  else if (data.error_description) parts.push(data.error_description);
  else if (data.name) parts.push(data.name);
  const d = Array.isArray(data.details) ? data.details[0] : null;
  if (d) {
    const detail = [d.issue, d.description].filter(Boolean).join(': ');
    if (detail) parts.push(detail + (d.field ? ` (field ${d.field})` : ''));
  }
  return parts.join('. ');
}

function buildMultipart(boundary, parts) {
  const chunks = [];
  for (const p of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename) head += `; filename="${p.filename}"`;
    head += '\r\n';
    if (p.contentType) head += `Content-Type: ${p.contentType}\r\n`;
    head += '\r\n';
    chunks.push(Buffer.from(head, 'utf8'));
    chunks.push(Buffer.isBuffer(p.value) ? p.value : Buffer.from(String(p.value), 'utf8'));
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One PayPal call. GETs are retried on network errors and 5xx; writes are not retried
 * (orders use PayPal-Request-Id so PayPal itself de-duplicates them).
 */
async function request(method, path, { json, multipart, headers: extra = {}, retries } = {}) {
  const c = config().paypal;
  const attempts = retries != null ? retries + 1 : method === 'GET' ? 3 : 1;
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', ...extra };
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (multipart) {
      const boundary = '----DisputeShield' + crypto.randomBytes(12).toString('hex');
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      body = buildMultipart(boundary, multipart);
    }
    let res;
    try {
      res = await fetch(`${c.base}${path}`, { method, headers, body, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      lastErr = new PayPalError(`Could not reach PayPal (${err.name === 'TimeoutError' ? 'timed out' : (err.cause && err.cause.code) || err.message}).`, 504, null);
      if (i < attempts - 1) { await sleep(600 * (i + 1)); continue; }
      throw lastErr;
    }
    const text = await res.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
    }
    if (res.status === 401 && i < attempts) { tokenCache.token = null; }
    if (res.ok) return data;
    lastErr = new PayPalError(describeError(data) || `PayPal returned HTTP ${res.status}`, res.status, data, res.headers.get('paypal-debug-id'));
    if ((res.status >= 500 || res.status === 401) && i < attempts - 1) { await sleep(600 * (i + 1)); continue; }
    throw lastErr;
  }
  throw lastErr;
}

const enc = encodeURIComponent;
// ---------- Disputes ----------
// Dispute details are reused for a short time when PayPal's update_time has not moved,
// and concurrent list calls (dashboard + background poll) share one PayPal request.
const detailCache = new Map(); // id -> { updateTime, at, data }
const DETAIL_TTL = 30_000;
let listInFlight = null;

function listDisputes() {
  if (listInFlight) return listInFlight;
  listInFlight = (async () => {
    const data = await request('GET', '/v1/customer/disputes?page_size=50');
    const items = Array.isArray(data.items) ? data.items : [];
    const capped = items.slice(0, 30);
    const details = await Promise.allSettled(capped.map((d) => {
      const hit = detailCache.get(d.dispute_id);
      if (hit && hit.updateTime === d.update_time && Date.now() - hit.at < DETAIL_TTL) return hit.data;
      return getDispute(d.dispute_id);
    }));
    return capped.map((item, i) => (details[i].status === 'fulfilled' ? details[i].value : item));
  })().finally(() => { listInFlight = null; });
  return listInFlight;
}

async function getDispute(id) {
  try {
    const data = await request('GET', `/v1/customer/disputes/${enc(id)}`);
    detailCache.set(id, { updateTime: data.update_time, at: Date.now(), data });
    return data;
  } catch (err) {
    // PayPal unreachable (network blip): serve the last copy we read rather than failing the page.
    const hit = detailCache.get(id);
    if (err.status === 504 && hit) {
      console.warn(`[paypal] ${err.message} Serving dispute ${id} from ${Math.round((Date.now() - hit.at) / 1000)}s ago.`);
      return hit.data;
    }
    throw err;
  }
}

/** evidences: PayPal evidence objects. files: [{ filename, contentType, data: Buffer }] */
function provideEvidence(id, evidences, files = []) {
  const parts = [{ name: 'input', value: JSON.stringify({ evidences }), contentType: 'application/json' }];
  for (const f of files) parts.push({ name: 'evidence-file', filename: f.filename, contentType: f.contentType, value: f.data });
  return request('POST', `/v1/customer/disputes/${enc(id)}/provide-evidence`, { multipart: parts });
}

/** While PayPal reviews a case (UNDER_REVIEW) the merchant can add notes and documents as supporting information. */
function provideSupportingInfo(id, notes, files = []) {
  const parts = [{ name: 'input', value: JSON.stringify({ notes }), contentType: 'application/json' }];
  for (const f of files) parts.push({ name: 'supporting-document', filename: f.filename, contentType: f.contentType, value: f.data });
  return request('POST', `/v1/customer/disputes/${enc(id)}/provide-supporting-info`, { multipart: parts });
}

const sendMessage = (id, message) => request('POST', `/v1/customer/disputes/${enc(id)}/send-message`, {
  multipart: [{ name: 'input', value: JSON.stringify({ message }), contentType: 'application/json' }]
});

const acceptClaim = (id, note) => request('POST', `/v1/customer/disputes/${enc(id)}/accept-claim`, { json: { note, accept_claim_type: 'REFUND' } });
const escalate = (id, note) => request('POST', `/v1/customer/disputes/${enc(id)}/escalate`, { json: { note } });
// Sandbox only: moves UNDER_REVIEW -> WAITING_FOR_SELLER_RESPONSE / WAITING_FOR_BUYER_RESPONSE
const requireEvidence = (id, action) => request('POST', `/v1/customer/disputes/${enc(id)}/require-evidence`, { json: { action } });
// Sandbox only: settles UNDER_REVIEW disputes. outcome = SELLER_FAVOR | BUYER_FAVOR
const adjudicate = (id, outcome) => request('POST', `/v1/customer/disputes/${enc(id)}/adjudicate`, { json: { adjudication_outcome: outcome } });

// ---------- Orders and payments ----------
function createOrder({ amount, currency, description, referenceId, brandName, returnUrl, cancelUrl }) {
  const value = Number(amount).toFixed(2);
  return request('POST', '/v2/checkout/orders', {
    headers: { 'PayPal-Request-Id': `ds-${referenceId}` },
    json: {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: referenceId,
        custom_id: referenceId,
        invoice_id: referenceId,
        description: String(description).slice(0, 127),
        amount: { currency_code: currency, value, breakdown: { item_total: { currency_code: currency, value } } },
        items: [{ name: String(description).slice(0, 127), quantity: '1', category: 'PHYSICAL_GOODS', unit_amount: { currency_code: currency, value } }]
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: String(brandName).slice(0, 127),
            shipping_preference: 'GET_FROM_FILE',
            user_action: 'PAY_NOW',
            return_url: returnUrl,
            cancel_url: cancelUrl
          }
        }
      }
    }
  });
}

const captureOrder = (orderId) => request('POST', `/v2/checkout/orders/${enc(orderId)}/capture`, { json: {}, headers: { 'PayPal-Request-Id': `ds-cap-${orderId}` } });
const getOrder = (orderId) => request('GET', `/v2/checkout/orders/${enc(orderId)}`);
const getCapture = (captureId) => request('GET', `/v2/payments/captures/${enc(captureId)}`);

const TRACK_CARRIERS = { UPS: 'UPS', USPS: 'USPS', FEDEX: 'FEDEX', 'FED EX': 'FEDEX', DHL: 'DHL', 'DHL EXPRESS': 'DHL' };

/** Adds shipment tracking to the PayPal order (Orders v2 track). PayPal then shows it on the transaction. */
function addTracking(orderId, { captureId, trackingNumber, carrier }) {
  const key = String(carrier || '').trim().toUpperCase();
  const body = { capture_id: captureId, tracking_number: String(trackingNumber).slice(0, 64), notify_payer: false };
  if (TRACK_CARRIERS[key]) body.carrier = TRACK_CARRIERS[key];
  else { body.carrier = 'OTHER'; body.carrier_name_other = String(carrier || 'Other').slice(0, 64); }
  return request('POST', `/v2/checkout/orders/${enc(orderId)}/track`, { json: body });
}

/** Transaction Search for one transaction id. PayPal limits the window to 31 days. */
async function searchTransaction(transactionId, aroundIso) {
  const at = aroundIso && !Number.isNaN(Date.parse(aroundIso)) ? Date.parse(aroundIso) : Date.now();
  const start = new Date(at - 15 * 86_400_000);
  const end = new Date(Math.min(Date.now(), at + 15 * 86_400_000));
  const fmt = (d) => d.toISOString().slice(0, 19) + 'Z';
  const data = await request('GET', `/v1/reporting/transactions?transaction_id=${enc(transactionId)}&start_date=${fmt(start)}&end_date=${fmt(end)}&fields=all&page_size=1`);
  return (data.transaction_details || [])[0] || null;
}

// ---------- Webhooks ----------
const WEBHOOK_EVENTS = ['CUSTOMER.DISPUTE.CREATED', 'CUSTOMER.DISPUTE.UPDATED', 'CUSTOMER.DISPUTE.RESOLVED'];

async function ensureWebhook(url) {
  const data = await request('GET', '/v1/notifications/webhooks');
  const found = (data.webhooks || []).find((w) => w.url === url);
  if (found) return found.id;
  const created = await request('POST', '/v1/notifications/webhooks', { json: { url, event_types: WEBHOOK_EVENTS.map((name) => ({ name })) } });
  return created.id;
}

async function verifyWebhook(headers, event, webhookId) {
  const h = (k) => headers[k] || headers[k.toLowerCase()];
  const data = await request('POST', '/v1/notifications/verify-webhook-signature', {
    json: {
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event
    }
  });
  return data.verification_status === 'SUCCESS';
}

module.exports = {
  PayPalError, isConfigured, getToken, buildMultipart,
  listDisputes, getDispute, provideEvidence, provideSupportingInfo, sendMessage, acceptClaim, escalate, requireEvidence, adjudicate,
  createOrder, captureOrder, getOrder, getCapture, addTracking, searchTransaction,
  ensureWebhook, verifyWebhook, WEBHOOK_EVENTS
};
