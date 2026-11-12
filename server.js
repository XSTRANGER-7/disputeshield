'use strict';
/**
 * DisputeShield server. Zero dependencies: Node 18.17+ only.
 *   node server.js        -> http://localhost:3000
 * Every dispute, payment and outcome comes from PayPal's REST APIs; the analysis comes from
 * Google Gemini. Nothing is mocked.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv, config, ROOT } = require('./lib/config');

loadEnv();

const paypal = require('./lib/paypal');
const store = require('./lib/store');
const ai = require('./lib/ai');
const records = require('./lib/records');
const { shipment, evidenceVariants, evidencePdf, money } = require('./lib/evidence');
const { normalize } = require('./lib/normalize');

const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://www.sandbox.paypal.com https://www.paypal.com"
};

const state = { webhookId: config().paypal.webhookId || null, webhookUrl: null, webhookError: null, lastPoll: null, pollError: null, keepAlive: { enabled: false } };

// ---------- helpers ----------
const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function readRaw(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(httpError(413, 'Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readBody(req) {
  const buf = await readRaw(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw httpError(400, 'Invalid JSON body'); }
}

function baseUrl(req) {
  const fixed = config().publicUrl;
  if (fixed) return fixed;
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

const str = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);
const recordKey = (d) => d.transactionId || `dispute:${d.id}`;
const isOpen = (d) => d.status !== 'RESOLVED';

// ---------- optional password gate (APP_PASSWORD) ----------
function sessionToken() {
  return crypto.createHmac('sha256', 'disputeshield:' + config().appPassword).update('session-v1').digest('hex');
}
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function authed(req) {
  if (!config().appPassword) return true;
  const got = cookies(req).ds_session || '';
  const want = sessionToken();
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
function requireWriteAllowed() {
  const c = config();
  if (!c.paypal.sandbox && !c.appPassword) throw httpError(403, 'This server talks to LIVE PayPal. Set APP_PASSWORD before submitting evidence, messages or refunds.');
}

// ---------- server-sent events (live queue updates) ----------
const clients = new Set();
function broadcast(type, data = {}) {
  const line = `event: ${type}\ndata: ${JSON.stringify({ ...data, at: new Date().toISOString() })}\n\n`;
  for (const res of clients) { try { res.write(line); } catch { clients.delete(res); } }
}

// ---------- case file ----------
/** Keeps a snapshot of every dispute in the database (history, stats, CSV), written only when it changed. */
function snapshotCase(d) {
  const prev = store.getCase(d.id);
  const code = (x) => (x && x.outcome && x.outcome.code) || '';
  if (prev && prev.updatedAt === d.updatedAt && prev.status === d.status && code(prev) === code(d)) return;
  store.setCase(d.id, d);
}

async function loadCase(id, { force = false } = {}) {
  const d = normalize(await paypal.getDispute(id));
  snapshotCase(d);
  const { facts, error } = await records.paypalFacts(d.transactionId, d.transactionDate, { force });
  return { d, facts, factsError: error, merchant: store.getRecord(recordKey(d)) };
}


/** A payment taken through DisputeShield gets linked to the dispute PayPal opens on it (capture id = seller_transaction_id). */
function linkPayments(list) {
  for (const d of list) {
    snapshotCase(d);
    const p = d.transactionId && store.paymentByCapture(d.transactionId);
    if (p && p.disputeId !== d.id) store.setPayment(p.orderId, { disputeId: d.id, disputeReason: d.reason, disputedAt: d.createdAt });
  }
}

function summary(d) {
  const analysis = store.getAnalysis(d.id);
  return {
    ...d,
    hasFacts: Boolean(store.getFacts(d.transactionId)) || Boolean(store.getRecord(recordKey(d))),
    ai: analysis ? { action: analysis.recommended_action, score: analysis.strength_score, evidenceType: analysis.evidence_type, model: analysis.engine && analysis.engine.model } : null,
    submitted: store.getSubmissions(d.id).some((s) => s.kind !== 'message'),
    fromApp: Boolean(d.transactionId && store.paymentByCapture(d.transactionId))
  };
}

function detail(c) {
  return {
    dispute: summary(c.d),
    facts: c.facts,
    factsError: c.factsError,
    record: c.merchant,
    analysis: store.getAnalysis(c.d.id),
    submissions: store.getSubmissions(c.d.id),
    activity: store.getActivity(c.d.id),
    payment: c.d.transactionId ? store.paymentByCapture(c.d.transactionId) : null
  };
}

// ---------- route handlers ----------
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, ...opts });

route('GET', '/api/health', async () => ({ ok: true, time: new Date().toISOString() }), { open: true });

route('GET', '/api/config', async ({ req }) => {
  const c = config();
  return {
    paypalConfigured: paypal.isConfigured(),
    paypalEnv: c.paypal.sandbox ? 'sandbox' : 'live',
    aiConfigured: ai.isConfigured(),
    aiModel: c.gemini.key ? c.gemini.model : null,
    aiFallbacks: c.gemini.models.slice(1),
    storeName: c.store.name,
    currency: c.store.currency,
    authRequired: Boolean(c.appPassword),
    authed: authed(req),
    liveWritesBlocked: !c.paypal.sandbox && !c.appPassword,
    webhook: state.webhookId ? { active: true, url: state.webhookUrl } : { active: false, reason: state.webhookError || 'Set PUBLIC_URL to an https address to receive PayPal webhooks. The queue still refreshes every minute.' }
  };
}, { open: true });

route('POST', '/api/login', async ({ body, res }) => {
  const pw = config().appPassword;
  if (!pw) return { ok: true };
  const a = Buffer.from(String(body.password || ''));
  const b = Buffer.from(pw);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw httpError(401, 'Wrong password.');
  res.setHeader('Set-Cookie', `ds_session=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${config().publicUrl.startsWith('https') ? '; Secure' : ''}`);
  return { ok: true };
}, { open: true });

route('GET', '/api/paypal/check', async () => {
  await paypal.getToken(true);
  return { ok: true, message: `Connected to PayPal ${config().paypal.sandbox ? 'sandbox' : 'live'}.` };
});

route('GET', '/api/disputes', async () => {
  const raws = await paypal.listDisputes();
  const normalized = raws.map(normalize);
  linkPayments(normalized);
  const list = normalized.map(summary);
  list.sort((a, b) => {
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
    return (a.dueDate ? Date.parse(a.dueDate) : Infinity) - (b.dueDate ? Date.parse(b.dueDate) : Infinity) || Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);
  });
  return { env: config().paypal.sandbox ? 'sandbox' : 'live', disputes: list, fetchedAt: new Date().toISOString() };
});

route('GET', '/api/disputes/:id', async ({ params, url }) => detail(await loadCase(params.id, { force: url.searchParams.get('refresh') === '1' })));

async function analyzeCase(id, { force = true } = {}) {
  const c = await loadCase(id, { force });
  const analysis = await ai.analyze(c.d, c.facts, c.merchant);
  store.setAnalysis(c.d.id, analysis);
  store.log(c.d.id, `Gemini (${analysis.engine.model}) recommended ${analysis.recommended_action}, strength ${analysis.strength_score}/100${analysis.engine.fallbackFrom ? ` (fallback from ${analysis.engine.fallbackFrom})` : ''}`, 'ai');
  return c;
}

route('POST', '/api/disputes/:id/analyze', async ({ params }) => {
  const c = await analyzeCase(params.id);
  broadcast('dispute', { id: c.d.id, change: 'analysed' });
  return detail(c);
});

route('GET', '/api/disputes/:id/evidence.pdf', async ({ params, url, res }) => {
  const c = await loadCase(params.id);
  const analysis = store.getAnalysis(c.d.id);
  const last = store.getSubmissions(c.d.id).find((s) => s.kind !== 'message');
  const notes = url.searchParams.get('notes') || (last && last.notes) || (analysis && analysis.response_notes) || '';
  const buf = evidencePdf(c.d, c.facts, c.merchant, notes.slice(0, ai.NOTES_LIMIT));
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="evidence-${c.d.id}.pdf"`, 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(buf);
  return undefined;
});

route('POST', '/api/disputes/:id/submit', async ({ params, body }) => {
  requireWriteAllowed();
  let c = await loadCase(params.id);
  const notes = str(body.notes, ai.NOTES_LIMIT);
  if (notes.length < 20) throw httpError(400, 'Write at least a couple of sentences of response notes before submitting.');
  const attachPdf = body.attach_pdf !== false;

  // Sandbox only: if PayPal has the case under review, ask for seller evidence first.
  if (!c.d.actions.provideEvidence && c.d.actions.requireEvidence && c.d.status === 'UNDER_REVIEW' && config().paypal.sandbox) {
    await paypal.requireEvidence(c.d.id, 'SELLER_EVIDENCE');
    store.log(c.d.id, 'Sandbox: asked PayPal to move the case to WAITING_FOR_SELLER_RESPONSE so evidence can be sent');
    // The sandbox applies the status change a few seconds later; wait for the provide-evidence link.
    for (let i = 0; i < 10; i += 1) {
      await new Promise((r) => setTimeout(r, 3000));
      c = await loadCase(params.id);
      if (c.d.actions.provideEvidence) break;
    }
  }
  const file = attachPdf ? { filename: `evidence-${c.d.id}.pdf`, contentType: 'application/pdf', data: evidencePdf(c.d, c.facts, c.merchant, notes) } : null;

  // While PayPal reviews the case it does not take evidence, but it does take supporting information.
  if (!c.d.actions.provideEvidence && c.d.actions.provideSupportingInfo) {
    const ship = shipment(c.merchant, c.facts);
    const text = `${notes}${ship && !notes.includes(ship.number) ? ` Tracking: ${ship.carrier || ''} ${ship.number}.` : ''}`.replace(/\s+\./g, '.').slice(0, ai.NOTES_LIMIT);
    const failures = [];
    let withPdf = false;
    for (const files of file ? [[file], []] : [[]]) {
      try {
        await paypal.provideSupportingInfo(c.d.id, text, files);
        withPdf = files.length > 0;
        break;
      } catch (err) {
        if (!(err.status >= 400 && err.status < 500) || !files.length) throw httpError(err.status || 502, err.message, { debugId: err.debugId });
        failures.push(`supporting info + PDF: ${err.message}${err.debugId ? ` (debug id ${err.debugId})` : ''}`);
      }
    }
    store.addSubmission(c.d.id, { kind: 'supporting', at: new Date().toISOString(), evidenceType: 'SUPPORTING_INFO', notes: text, requestedType: body.evidence_type || 'OTHER', pdf: withPdf, fellBack: failures.length > 0, failures });
    for (const f of failures) store.log(c.d.id, `PayPal refused ${f}. Sent the notes without the PDF.`, 'warn');
    store.log(c.d.id, `Response sent to PayPal as supporting information while the case is under review${withPdf ? ', with the evidence PDF attached' : ''}`, 'success');
    broadcast('dispute', { id: c.d.id, change: 'supporting-info' });
    return detail(await loadCase(params.id));
  }

  if (!c.d.actions.provideEvidence) {
    throw httpError(409, `PayPal is not accepting evidence for this case right now (status ${c.d.status}${c.d.stage ? `, ${c.d.stage}` : ''}).`);
  }

  const variants = evidenceVariants(body.evidence_type, notes, c.merchant, c.facts);
  const attempts = [];
  for (const v of variants) {
    attempts.push({ evidence: v, files: file ? [file] : [] });
    if (file) attempts.push({ evidence: v, files: [] });
  }
  let sent = null;
  const failures = [];
  for (const a of attempts) {
    try {
      await paypal.provideEvidence(c.d.id, [a.evidence], a.files);
      sent = a;
      break;
    } catch (err) {
      if (!(err.status >= 400 && err.status < 500)) throw err;
      failures.push(`${a.evidence.evidence_type}${a.files.length ? ' + PDF' : ''}: ${err.message}${err.debugId ? ` (debug id ${err.debugId})` : ''}`);
      if (failures.length === attempts.length) throw httpError(err.status, err.message, { debugId: err.debugId });
    }
  }
  const sub = { kind: 'evidence', at: new Date().toISOString(), evidenceType: sent.evidence.evidence_type, notes: sent.evidence.notes, requestedType: body.evidence_type || 'OTHER', pdf: sent.files.length > 0, fellBack: failures.length > 0, failures };
  store.addSubmission(c.d.id, sub);
  for (const f of failures) store.log(c.d.id, `PayPal refused ${f}. Tried the next format.`, 'warn');
  store.log(c.d.id, `Evidence submitted to PayPal as ${sub.evidenceType}${sub.pdf ? ' with the evidence PDF attached' : ''}`, 'success');
  broadcast('dispute', { id: c.d.id, change: 'evidence' });
  return detail(await loadCase(params.id));
});

route('POST', '/api/disputes/:id/message', async ({ params, body }) => {
  requireWriteAllowed();
  const c = await loadCase(params.id);
  const message = str(body.message, ai.MESSAGE_LIMIT);
  if (message.length < 5) throw httpError(400, 'Write a message first.');
  if (!c.d.actions.sendMessage) throw httpError(409, `PayPal does not allow messages on this case right now (status ${c.d.status}).`);
  await paypal.sendMessage(c.d.id, message);
  store.addSubmission(c.d.id, { kind: 'message', at: new Date().toISOString(), notes: message });
  store.log(c.d.id, 'Message sent to the buyer through PayPal', 'success');
  broadcast('dispute', { id: c.d.id, change: 'message' });
  return detail(await loadCase(params.id));
});

route('POST', '/api/disputes/:id/accept', async ({ params, body }) => {
  requireWriteAllowed();
  const c = await loadCase(params.id);
  if (!c.d.actions.acceptClaim) throw httpError(409, `This case cannot be accepted right now (status ${c.d.status}).`);
  const note = str(body.note || 'We have accepted the claim and refunded the buyer in full.', 2000);
  await paypal.acceptClaim(c.d.id, note);
  store.log(c.d.id, `Claim accepted. PayPal refunds ${money(c.d.amount)} to the buyer`, 'warn');
  broadcast('dispute', { id: c.d.id, change: 'accepted' });
  return detail(await loadCase(params.id));
});

route('POST', '/api/disputes/:id/sandbox', async ({ params, body }) => {
  if (!config().paypal.sandbox) throw httpError(403, 'These PayPal endpoints exist only in the sandbox.');
  const id = params.id;
  const labels = {
    escalate: 'Escalated the inquiry to a claim',
    seller_evidence: 'Sandbox: PayPal asked the merchant for evidence',
    seller_favor: 'Sandbox: PayPal settled the case in the merchant\'s favour',
    buyer_favor: 'Sandbox: PayPal settled the case in the buyer\'s favour'
  };
  const calls = {
    escalate: () => paypal.escalate(id, 'Escalated from DisputeShield.'),
    seller_evidence: () => paypal.requireEvidence(id, 'SELLER_EVIDENCE'),
    seller_favor: () => paypal.adjudicate(id, 'SELLER_FAVOR'),
    buyer_favor: () => paypal.adjudicate(id, 'BUYER_FAVOR')
  };
  if (!calls[body.action]) throw httpError(400, 'Unknown sandbox action');
  // The sandbox sometimes refuses a call while a previous change is still being applied; retry once.
  try { await calls[body.action](); } catch (err) {
    if (!(err.status === 400 || err.status === 422)) throw err;
    await new Promise((r) => setTimeout(r, 2500));
    await calls[body.action]();
  }
  store.log(id, labels[body.action], body.action === 'seller_favor' ? 'success' : 'info');
  broadcast('dispute', { id, change: body.action });
  return detail(await loadCase(id));
});

route('PUT', '/api/records/:txn', async ({ params, body }) => {
  const r = body.record || {};
  const txn = params.txn;
  const prev = store.getRecord(txn) || {};
  const record = {
    orderId: str(r.orderId, 60),
    shipping: {
      carrier: str(r.shipping && r.shipping.carrier, 40),
      trackingNumber: str(r.shipping && r.shipping.trackingNumber, 60),
      shippedAt: str(r.shipping && r.shipping.shippedAt, 30),
      deliveredAt: str(r.shipping && r.shipping.deliveredAt, 30),
      status: str(r.shipping && r.shipping.status, 80),
      deliveryProof: str(r.shipping && r.shipping.deliveryProof, 300)
    },
    listing: str(r.listing, 600),
    refundId: str(r.refundId, 60),
    history: str(r.history, 400),
    notes: str(r.notes, 600),
    trackingOnPayPal: prev.trackingOnPayPal || []
  };
  if (!record.shipping.status && record.shipping.deliveredAt) record.shipping.status = 'Delivered';

  // New tracking number on a payment we know the PayPal order for: add it to the PayPal order as well.
  const disputeId = str(body.disputeId, 60);
  let pushed = null;
  const number = record.shipping.trackingNumber;
  if (number && !record.trackingOnPayPal.includes(number) && !txn.startsWith('dispute:')) {
    const facts = store.getFacts(txn);
    const orderId = facts && facts.orderId;
    if (orderId && !(facts.trackers || []).some((t) => t.number === number)) {
      try {
        await paypal.addTracking(orderId, { captureId: txn, trackingNumber: number, carrier: record.shipping.carrier });
        record.trackingOnPayPal = [...record.trackingOnPayPal, number];
        pushed = { ok: true };
        if (disputeId) store.log(disputeId, `Tracking ${record.shipping.carrier || ''} ${number} added to the PayPal order ${orderId}`.replace(/\s+/g, ' '), 'success');
      } catch (err) {
        pushed = { ok: false, error: err.message };
        if (disputeId) store.log(disputeId, `PayPal did not accept the tracking number: ${err.message}`, 'warn');
      }
    }
  }
  const saved = store.setRecord(txn, record);
  if (disputeId) store.log(disputeId, 'Fulfilment record updated by the merchant');
  return { record: saved, trackingPushed: pushed };
});

// ---------- payments made through DisputeShield ----------
route('POST', '/api/payments', async ({ req, body }) => {
  requireWriteAllowed();
  const c = config();
  const amount = Number(body.amount);
  if (!(amount >= 1 && amount <= 10000)) throw httpError(400, 'Amount must be between 1 and 10,000.');
  const product = str(body.product || 'Order', 120) || 'Order';
  const ref = 'DS-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const base = baseUrl(req);
  const order = await paypal.createOrder({
    amount, currency: c.store.currency, description: product, referenceId: ref, brandName: c.store.name,
    returnUrl: `${base}/paypal/return`, cancelUrl: `${base}/paypal/cancel`
  });
  const link = (order.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  if (!link) throw httpError(502, 'PayPal did not return an approval link.');
  store.setPayment(order.id, {
    ref, product, amount, currency: c.store.currency, status: order.status || 'PAYER_ACTION_REQUIRED', createdAt: new Date().toISOString(), approveUrl: link.href,
    shipping: { carrier: str(body.carrier, 40), trackingNumber: str(body.trackingNumber, 60), shippedAt: str(body.shippedAt, 30), deliveredAt: str(body.deliveredAt, 30) }
  });
  return { orderId: order.id, approveUrl: link.href };
});

route('GET', '/api/payments', async () => ({ payments: store.listPayments().slice(0, 50) }));

// Sandbox helper: create several real PayPal orders from a small store catalogue in one go, so a test
// buyer can approve them one after another. Every order is a real PayPal sandbox order.
const TEST_CATALOGUE = [
  { product: 'Aurora Wireless Headphones', amount: 89, carrier: 'UPS', track: () => '1Z84A2E1' + digits(10) },
  { product: 'Merino Wool Throw, Slate', amount: 129, carrier: 'DHL', track: () => 'JD0146' + digits(12) },
  { product: 'Peak Hiking Backpack 45L', amount: 64.5, carrier: 'FedEx', track: () => '7712' + digits(8) },
  { product: 'Ceramic Pour-Over Set', amount: 42, carrier: '', track: () => '' },
  { product: 'Halo Desk Lamp', amount: 75, carrier: 'USPS', track: () => '94001118' + digits(14) }
];
function digits(n) { let t = ''; while (t.length < n) t += crypto.randomInt(0, 10); return t; }

route('POST', '/api/payments/batch', async ({ req, body }) => {
  requireWriteAllowed();
  const c = config();
  if (!c.paypal.sandbox) throw httpError(403, 'Test orders can only be created in the PayPal sandbox.');
  const count = Math.max(1, Math.min(TEST_CATALOGUE.length, Number(body.count) || 3));
  const base = baseUrl(req);
  const start = store.listPayments().length;
  const created = [];
  for (let i = 0; i < count; i += 1) {
    const item = TEST_CATALOGUE[(start + i) % TEST_CATALOGUE.length];
    const ref = 'DS-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const order = await paypal.createOrder({
      amount: item.amount, currency: c.store.currency, description: item.product, referenceId: ref, brandName: c.store.name,
      returnUrl: base + '/paypal/return', cancelUrl: base + '/paypal/cancel'
    });
    const link = (order.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve');
    const tracking = item.track();
    store.setPayment(order.id, {
      ref, product: item.product, amount: item.amount, currency: c.store.currency, status: order.status || 'PAYER_ACTION_REQUIRED', createdAt: new Date().toISOString(),
      approveUrl: link ? link.href : '', batch: true,
      shipping: { carrier: item.carrier, trackingNumber: tracking, shippedAt: tracking ? new Date().toISOString().slice(0, 10) : '', deliveredAt: '' }
    });
    created.push({ orderId: order.id, product: item.product, amount: item.amount, approveUrl: link ? link.href : '' });
  }
  return { created };
});

route('GET', '/api/activity', async () => ({ activity: store.recentActivity(40) }));

// ---------- stats (landing page + dashboard) and CSV export, from the database ----------
const outcomeOf = (x) => {
  const code = (x.outcome && x.outcome.code) || '';
  if (x.status !== 'RESOLVED') return 'open';
  if (/SELLER/.test(code)) return 'won';
  if (/CANCEL/.test(code)) return 'cancelled';
  return 'refunded';
};

function computeStats() {
  const c = config();
  const cases = store.listCases();
  const by = (k) => cases.filter((x) => outcomeOf(x) === k);
  const sum = (list) => Math.round(list.reduce((t, x) => t + ((x.amount && x.amount.value) || 0), 0) * 100) / 100;
  const won = by('won');
  const refunded = by('refunded');
  const open = by('open');
  const analyses = store.allAnalyses();
  const subs = store.allSubmissions();
  const payments = store.listPayments().filter((p) => p.captureId);
  const timed = analyses.filter((a) => a.latencyMs);
  const newest = [...cases].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  // /api/stats is open (the landing page reads it), so cases go out without buyer details.
  const publicCase = (x) => {
    const a = store.getAnalysis(x.id);
    return { id: x.id, reasonLabel: x.reasonLabel, amount: x.amount, status: x.status, stage: x.stage, createdAt: x.createdAt, dueDate: x.dueDate, outcome: x.outcome ? { code: x.outcome.code } : null, ai: a ? { action: a.recommended_action, score: a.strength_score } : null };
  };
  const now = Date.now();
  const due = open.filter((x) => x.dueDate && Date.parse(x.dueDate) > now).sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate))[0] || null;
  return {
    currency: (cases[0] && cases[0].amount && cases[0].amount.currency) || c.store.currency,
    cases: cases.length,
    open: open.length,
    won: won.length,
    refunded: refunded.length,
    cancelled: by('cancelled').length,
    winRate: won.length + refunded.length ? Math.round((won.length / (won.length + refunded.length)) * 100) : null,
    kept: sum(won),
    atRisk: sum(open),
    analyses: analyses.length,
    avgAiSeconds: timed.length ? Math.round(timed.reduce((t, a) => t + a.latencyMs, 0) / timed.length / 100) / 10 : null,
    responses: subs.filter((x) => x.kind !== 'message').length,
    pdfs: subs.filter((x) => x.pdf).length,
    messages: subs.filter((x) => x.kind === 'message').length,
    payments: payments.length,
    volume: Math.round(payments.reduce((t, p) => t + (p.amount || 0), 0) * 100) / 100,
    latest: newest[0] ? publicCase(newest[0]) : null,
    queue: newest.slice(0, 4).map(publicCase),
    nextDue: due ? { id: due.id, dueDate: due.dueDate, amount: due.amount, reasonLabel: due.reasonLabel } : null,
    recent: store.recentActivity(30).filter((a) => a.kind !== 'warn').slice(0, 6).map((a) => ({ text: a.text, at: a.at, kind: a.kind })),
    database: store.status().backend,
    updatedAt: new Date().toISOString()
  };
}

route('GET', '/api/stats', async () => computeStats(), { open: true });

const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };

route('GET', '/api/disputes.csv', async ({ res }) => {
  const rows = store.listCases().sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const head = ['dispute_id', 'opened', 'buyer', 'reason', 'amount', 'currency', 'status', 'outcome', 'ai_action', 'ai_score', 'evidence_type', 'responses_sent'];
  const lines = [head.join(',')];
  for (const x of rows) {
    const a = store.getAnalysis(x.id) || {};
    lines.push([x.id, x.createdAt, x.buyer && x.buyer.name, x.reasonLabel, x.amount && x.amount.value, x.amount && x.amount.currency, x.status, outcomeOf(x), a.recommended_action, a.strength_score, a.evidence_type, store.getSubmissions(x.id).filter((y) => y.kind !== 'message').length].map(csvCell).join(','));
  }
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="disputeshield-cases-' + new Date().toISOString().slice(0, 10) + '.csv"', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(lines.join('\n') + '\n');
  return undefined;
});

route('GET', '/api/status', async () => {
  const c = config();
  let paypalOk = false;
  let paypalError = null;
  const t = Date.now();
  try { await paypal.getToken(); paypalOk = true; } catch (err) { paypalError = err.message; }
  return {
    paypal: { ok: paypalOk, error: paypalError, env: c.paypal.sandbox ? 'sandbox' : 'live', base: c.paypal.base, latencyMs: Date.now() - t },
    webhook: state.webhookId ? { active: true, url: state.webhookUrl } : { active: false, reason: state.webhookError || 'Set PUBLIC_URL to an https address to receive PayPal webhooks.' },
    poll: { every: Math.max(30, Number(process.env.POLL_SECONDS) || 60), lastPoll: state.lastPoll, error: state.pollError },
    keepAlive: state.keepAlive,
    uptimeSeconds: Math.round(process.uptime()),
    ai: ai.health(),
    autoAnalyze: process.env.AUTO_ANALYZE !== 'false',
    store: { name: c.store.name, currency: c.store.currency, policy: c.store.policy },
    security: { password: Boolean(c.appPassword), liveWritesBlocked: !c.paypal.sandbox && !c.appPassword },
    liveClients: clients.size,
    database: { ...store.status(), url: config().supabase.url || null }
  };
});

// ---------- PayPal redirects ----------
async function handleReturn(req, res, url) {
  const orderId = url.searchParams.get('token');
  if (!orderId) { res.writeHead(302, { Location: '/?payment=missing' }); return res.end(); }
  try {
    const result = await paypal.captureOrder(orderId);
    const unit = (result.purchase_units || [])[0] || {};
    const capture = ((unit.payments || {}).captures || [])[0] || {};
    const payer = result.payer || {};
    const draft = store.getPayment(orderId) || {};
    const ship = draft.shipping || {};
    store.setPayment(orderId, {
      ref: draft.ref || unit.reference_id || '', product: draft.product || unit.description || '', amount: Number((capture.amount || {}).value) || draft.amount || 0,
      currency: (capture.amount || {}).currency_code || draft.currency || config().store.currency, createdAt: draft.createdAt || new Date().toISOString(),
      status: capture.status || result.status, captureId: capture.id || '', capturedAt: capture.create_time || new Date().toISOString(),
      buyerEmail: payer.email_address || '', buyerName: [((payer.name || {}).given_name), ((payer.name || {}).surname)].filter(Boolean).join(' '), payerId: payer.payer_id || ''
    });
    if (capture.id) {
      const record = {
        orderId: draft.ref || '',
        shipping: { carrier: ship.carrier || '', trackingNumber: ship.trackingNumber || '', shippedAt: ship.shippedAt || '', deliveredAt: ship.deliveredAt || '', status: ship.deliveredAt ? 'Delivered' : ship.trackingNumber ? 'Shipped' : '', deliveryProof: '' },
        listing: draft.product || '', refundId: '', history: '', notes: '', trackingOnPayPal: []
      };
      if (ship.trackingNumber) {
        try {
          await paypal.addTracking(orderId, { captureId: capture.id, trackingNumber: ship.trackingNumber, carrier: ship.carrier });
          record.trackingOnPayPal = [ship.trackingNumber];
        } catch (err) {
          console.warn('[paypal] tracking not added:', err.message);
        }
      }
      store.setRecord(capture.id, record);
      records.paypalFacts(capture.id, capture.create_time, { force: true }).catch(() => {});
    }
    res.writeHead(302, { Location: `/?payment=captured&order=${encodeURIComponent(orderId)}&txn=${encodeURIComponent(capture.id || '')}` });
  } catch (err) {
    console.error('[paypal] capture failed:', err.message, err.debugId || '');
    store.setPayment(orderId, { status: 'CAPTURE_FAILED', error: err.message });
    res.writeHead(302, { Location: `/?payment=failed&reason=${encodeURIComponent(err.message.slice(0, 200))}` });
  }
  res.end();
}

// ---------- PayPal webhooks ----------
async function handleWebhook(req, res) {
  const raw = await readRaw(req, 2_000_000);
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  if (!state.webhookId) return send(res, 503, { error: 'Webhook not configured' });
  let ok = false;
  try { ok = await paypal.verifyWebhook(req.headers, event, state.webhookId); } catch (err) { console.warn('[webhook] verify failed:', err.message); }
  if (!ok) return send(res, 400, { error: 'Signature verification failed' });
  const resource = event.resource || {};
  const id = resource.dispute_id || null;
  if (id) {
    const label = { 'CUSTOMER.DISPUTE.CREATED': 'PayPal webhook: dispute opened', 'CUSTOMER.DISPUTE.UPDATED': 'PayPal webhook: dispute updated', 'CUSTOMER.DISPUTE.RESOLVED': 'PayPal webhook: dispute resolved' }[event.event_type] || `PayPal webhook: ${event.event_type}`;
    store.log(id, `${label}${resource.status ? ` (${resource.status})` : ''}`);
    broadcast('dispute', { id, change: event.event_type });
    if (event.event_type === 'CUSTOMER.DISPUTE.CREATED') autoAnalyze([id]);
  }
  return send(res, 200, { ok: true });
}

// ---------- background agent: watch the queue, analyse new disputes ----------
const autoQueue = new Set();
const autoFailedAt = new Map(); // dispute id -> time of the last failed automatic analysis
let autoRunning = false;
async function autoAnalyze(ids) {
  if (!ai.isConfigured() || process.env.AUTO_ANALYZE === 'false') return;
  for (const id of ids) autoQueue.add(id);
  if (autoRunning) return;
  autoRunning = true;
  try {
    while (autoQueue.size) {
      const id = autoQueue.values().next().value;
      autoQueue.delete(id);
      if (store.getAnalysis(id)) continue;
      if (Date.now() - (autoFailedAt.get(id) || 0) < 15 * 60_000) continue;
      try {
        const c = await analyzeCase(id, { force: false });
        autoFailedAt.delete(id);
        store.log(id, 'Analysed automatically when the dispute arrived', 'ai');
        broadcast('dispute', { id: c.d.id, change: 'analysed' });
      } catch (err) {
        autoFailedAt.set(id, Date.now());
        store.log(id, `Automatic analysis failed: ${err.message}`, 'warn');
      }
    }
  } finally { autoRunning = false; }
}

async function poll() {
  if (!paypal.isConfigured()) return;
  try {
    const raws = await paypal.listDisputes();
    const list = raws.map(normalize);
    linkPayments(list);
    state.lastPoll = new Date().toISOString();
    state.pollError = null;
    const fresh = list.filter((d) => isOpen(d) && !store.getAnalysis(d.id)).map((d) => d.id);
    if (fresh.length) autoAnalyze(fresh.slice(0, 5));
  } catch (err) {
    state.pollError = err.message;
  }
}

async function setupWebhook() {
  const c = config();
  if (!paypal.isConfigured()) return;
  if (c.paypal.webhookId) { state.webhookId = c.paypal.webhookId; return; }
  if (!/^https:\/\//.test(c.publicUrl)) { state.webhookError = 'Webhooks need a public https URL (set PUBLIC_URL; Render sets RENDER_EXTERNAL_URL automatically). The queue refreshes every minute instead.'; return; }
  const url = `${c.publicUrl}/api/webhooks/paypal`;
  try {
    state.webhookId = await paypal.ensureWebhook(url);
    state.webhookUrl = url;
    console.log(`  PayPal webhook:  ${url}`);
  } catch (err) {
    state.webhookError = `Could not register the PayPal webhook: ${err.message}`;
    console.warn('[webhook]', state.webhookError);
  }
}

// ---------- keep-awake (free hosting) ----------
// Free hosts such as Render's free plan stop an app after ~15 minutes without inbound traffic, and the
// first visitor then waits about a minute. On Render (or with KEEP_ALIVE=true) the server requests its own
// public URL every 10 minutes; that request comes back through the host's router, so it counts as traffic.
function startKeepAlive() {
  const url = config().publicUrl;
  const flag = String(process.env.KEEP_ALIVE || '').trim();
  const enabled = flag ? /^(1|true|yes|on)$/i.test(flag) : Boolean(process.env.RENDER) || /\.onrender\.com$/i.test(url);
  if (!enabled || !/^https?:\/\//.test(url)) {
    state.keepAlive = { enabled: false, reason: enabled ? 'Needs PUBLIC_URL (Render sets RENDER_EXTERNAL_URL).' : 'Off: not on a free host that sleeps (set KEEP_ALIVE=true to force).' };
    return;
  }
  const every = Math.max(60, Number(process.env.KEEP_ALIVE_SECONDS) || 600);
  state.keepAlive = { enabled: true, url: url + '/api/health', every, lastAt: null, ok: null, error: null, count: 0 };
  const ping = async () => {
    const started = Date.now();
    try {
      const r = await fetch(url + '/api/health?keepalive=1', { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'DisputeShield-keepalive' } });
      Object.assign(state.keepAlive, { lastAt: new Date().toISOString(), ok: r.ok, error: r.ok ? null : 'HTTP ' + r.status, ms: Date.now() - started, count: state.keepAlive.count + 1 });
    } catch (err) {
      Object.assign(state.keepAlive, { lastAt: new Date().toISOString(), ok: false, error: err.message });
    }
  };
  setTimeout(ping, 15_000);
  setInterval(ping, every * 1000);
  console.log('  Keep-awake:      pinging ' + url + '/api/health every ' + Math.round(every / 60) + ' min');
}

// ---------- static files ----------
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) {
      if (!path.extname(rel)) {
        return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => (e2 ? send(res, 404, 'Not found') : (res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', ...SECURITY_HEADERS }), res.end(html))));
      }
      return send(res, 404, 'Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
    res.end(buf);
  });
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  try {
    if (pathname === '/paypal/return') return await handleReturn(req, res, url);
    if (pathname === '/paypal/cancel') {
      const token = url.searchParams.get('token');
      if (token && store.getPayment(token)) store.setPayment(token, { status: 'CANCELLED' });
      res.writeHead(302, { Location: '/?payment=cancelled' });
      return res.end();
    }
    if (pathname === '/api/webhooks/paypal' && req.method === 'POST') return await handleWebhook(req, res);
    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

    if (pathname === '/api/events' && req.method === 'GET') {
      if (!authed(req)) return send(res, 401, { error: 'Sign in first.' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 5000\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return undefined;
    }

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.re);
      if (!m) continue;
      if (!r.open && !authed(req)) return send(res, 401, { error: 'Sign in first.', auth: true });
      if (!r.open && !paypal.isConfigured()) throw httpError(503, 'PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the server.');
      const ctx = {
        req, res, url,
        params: Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)])),
        body: ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {}
      };
      const out = await r.handler(ctx);
      if (out === undefined) return undefined;
      return send(res, 200, out);
    }
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error('[error]', req.method, pathname, err.message, err.debugId || '');
    if (res.headersSent) return res.end();
    return send(res, status, { error: err.message || 'Something went wrong', debugId: err.debugId || null, paypal: err.body && err.body.name ? err.body.name : null });
  }
});

const { port } = config();
(async () => {
  const db = await store.init();
  const where = db.backend === 'supabase'
    ? (db.ok ? 'Supabase (' + config().supabase.url + ')' + (db.migrated ? ', uploaded ' + db.migrated + ' local rows' : '') : 'Supabase FAILED, using the local file: ' + db.error)
    : db.configured ? 'local file for now. Supabase: ' + db.error : 'local file ' + store.file + ' (set SUPABASE_URL and SUPABASE_KEY for Supabase)';
  console.log('  Database:        ' + where);
  server.listen(port, onListen);
})();

async function onListen() {
  const c = config();
  console.log(`\n  DisputeShield running at http://localhost:${port}`);
  console.log(`  PayPal:          ${paypal.isConfigured() ? `${c.paypal.sandbox ? 'sandbox' : 'LIVE'} (${c.paypal.base})` : 'NOT CONFIGURED (set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET)'}`);
  console.log(`  AI analyst:      ${c.gemini.key ? `Gemini ${c.gemini.model} (fallbacks: ${c.gemini.models.slice(1).join(', ')})` : 'NOT CONFIGURED (set GEMINI_API_KEY)'}`);
  if (c.appPassword) console.log('  Access:          password protected (APP_PASSWORD)');
  if (!c.paypal.sandbox && !c.appPassword) console.log('  WARNING:         live PayPal without APP_PASSWORD; write actions are blocked');
  if (paypal.isConfigured()) {
    try { await paypal.getToken(); console.log('  PayPal sign-in:  OK'); } catch (err) { console.log(`  PayPal sign-in:  FAILED - ${err.message}`); }
    await setupWebhook();
    startKeepAlive();
    const every = Math.max(30, Number(process.env.POLL_SECONDS) || 60) * 1000;
    setTimeout(poll, 3000);
    setInterval(poll, every).unref();
  }
  console.log('');
}

async function shutdown() { try { await Promise.race([store.flush(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* ignore */ } for (const r of clients) { try { r.end(); } catch { /* ignore */ } } server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
