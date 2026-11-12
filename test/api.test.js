'use strict';
// API tests against a real server process started with no PayPal or Gemini keys (offline).
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let child;
let dataDir;

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-test-'));
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '', GEMINI_API_KEY: '', APP_PASSWORD: '', PUBLIC_URL: '', SUPABASE_URL: '', SUPABASE_KEY: '', DATA_DIR: dataDir },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i += 1) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

test.after(() => {
  if (child) child.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('health is up', async () => {
  const r = await fetch(`${BASE}/api/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('config reports missing keys honestly', async () => {
  const c = await (await fetch(`${BASE}/api/config`)).json();
  assert.equal(c.paypalConfigured, false);
  assert.equal(c.aiConfigured, false);
  assert.equal(c.paypalEnv, 'sandbox');
  assert.equal(c.authRequired, false);
});

test('PayPal routes refuse to run without credentials (no fake data)', async () => {
  const r = await fetch(`${BASE}/api/disputes`);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /PayPal is not configured/);
});

test('stats are public, real and start at zero on an empty database', async () => {
  const r = await fetch(`${BASE}/api/stats`);
  assert.equal(r.status, 200);
  const s = await r.json();
  assert.equal(s.cases, 0);
  assert.equal(s.won, 0);
  assert.equal(s.winRate, null);
  assert.equal(s.database, 'file');
  assert.deepEqual(s.recent, []);
});

test('public stats feed the hero without buyer details', async () => {
  // a second server with one stored case, so the shape of latest / queue / nextDue can be checked
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-stats-'));
  const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const kase = { id: 'PP-D-TEST-1', reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', reasonLabel: 'Item not received', status: 'WAITING_FOR_SELLER_RESPONSE', stage: 'CHARGEBACK', amount: { value: 42.5, currency: 'USD' }, createdAt: new Date().toISOString(), dueDate: due, buyer: { name: 'Private Person', email: 'private@example.com' }, outcome: null };
  fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify({ cases: { [kase.id]: kase } }));
  const port = PORT + 100;
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '', GEMINI_API_KEY: '', APP_PASSWORD: '', PUBLIC_URL: '', SUPABASE_URL: '', SUPABASE_KEY: '', DATA_DIR: dir },
    stdio: 'ignore'
  });
  try {
    let s = null;
    for (let i = 0; i < 50 && !s; i += 1) {
      try { const r = await fetch(`http://127.0.0.1:${port}/api/stats`); if (r.ok) s = await r.json(); } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(s, 'stats server did not start');
    assert.equal(s.cases, 1);
    assert.equal(s.open, 1);
    assert.equal(s.atRisk, 42.5);
    assert.equal(s.latest.id, 'PP-D-TEST-1');
    assert.equal(s.queue.length, 1);
    assert.deepEqual(s.nextDue, { id: 'PP-D-TEST-1', dueDate: due, amount: { value: 42.5, currency: 'USD' }, reasonLabel: 'Item not received' });
    const text = JSON.stringify(s);
    assert.ok(!text.includes('Private Person') && !text.includes('private@example.com'), 'buyer details must not be public');
  } finally {
    p.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('test orders and CSV export need PayPal credentials', async () => {
  const r = await fetch(`${BASE}/api/payments/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"count":3}' });
  assert.equal(r.status, 503);
  const c = await fetch(`${BASE}/api/disputes.csv`);
  assert.equal(c.status, 503);
});

test('unknown API route is a JSON 404', async () => {
  const r = await fetch(`${BASE}/api/nope`);
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type'), /json/);
});

test('the app shell is served with security headers', async () => {
  const r = await fetch(`${BASE}/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /DisputeShield/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('static files cannot escape the public folder', async () => {
  const r = await fetch(`${BASE}/..%2f..%2fserver.js`);
  assert.notEqual(r.status, 200);
  const r2 = await fetch(`${BASE}/%2e%2e/.env`);
  assert.ok(![200].includes(r2.status) || !(await r2.text()).includes('PAYPAL_CLIENT_SECRET'));
});

test('bad JSON bodies are rejected cleanly', async () => {
  const r = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(r.status, 400);
});

test('webhook endpoint refuses unverifiable events', async () => {
  const r = await fetch(`${BASE}/api/webhooks/paypal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { dispute_id: 'PP-FAKE' } }) });
  assert.ok(r.status >= 400);
});
