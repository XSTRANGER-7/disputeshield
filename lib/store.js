'use strict';
/**
 * DisputeShield's own data. PayPal stays the source of truth for disputes, payments and outcomes;
 * this keeps the work around them:
 *   cases       snapshot of every dispute seen (history, stats, landing page numbers)
 *   records     merchant-entered fulfilment facts, keyed by PayPal transaction (capture) id
 *   facts       cached copy of PayPal's transaction facts
 *   analyses    latest AI analysis per dispute
 *   submissions evidence / supporting info / messages sent per dispute
 *   activity    per-dispute log
 *   payments    payments created through DisputeShield (order id -> details)
 *
 * Storage: Supabase (one table per collection, see supabase/schema.sql) when SUPABASE_URL and a key
 * are set, with data/store.json as a local backup; data/store.json alone otherwise.
 * Reads are served from memory; writes go to memory, then to the file and Supabase in the background.
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const supabase = require('./supabase');

const DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const FILE = path.join(DIR, 'store.json');
const COLLECTIONS = ['cases', 'records', 'facts', 'analyses', 'submissions', 'activity', 'payments'];
const TABLE = (c) => `ds_${c}`;

const empty = () => Object.fromEntries(COLLECTIONS.map((c) => [c, {}]));

function loadFile() {
  for (const f of [FILE, FILE + '.bak']) {
    try {
      if (fs.existsSync(f)) {
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (data && typeof data === 'object') return { ...empty(), ...data };
      }
    } catch (err) {
      console.warn(`[store] could not read ${path.basename(f)}: ${err.message}`);
    }
  }
  return empty();
}

const db = loadFile();
const dirty = Object.fromEntries(COLLECTIONS.map((c) => [c, new Set()]));
const sync = { backend: 'file', ok: true, error: null, lastSync: null, lastLoad: null, migrated: 0 };
let timer = null;
let flushing = null;

function writeFile() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, JSON.stringify(db, null, 2));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE + '.bak');
    fs.renameSync(tmp, FILE);
  } catch (err) {
    console.warn('[store] could not save the local backup:', err.message);
  }
}

async function pushDirty() {
  if (sync.backend !== 'supabase') { for (const c of COLLECTIONS) dirty[c].clear(); return; }
  for (const c of COLLECTIONS) {
    if (!dirty[c].size) continue;
    const ids = [...dirty[c]];
    const now = new Date().toISOString();
    const rows = ids.filter((id) => db[c][id] !== undefined).map((id) => ({ id, data: db[c][id], updated_at: now }));
    const gone = ids.filter((id) => db[c][id] === undefined);
    try {
      for (let i = 0; i < rows.length; i += 200) await supabase.upsert(TABLE(c), rows.slice(i, i + 200));
      if (gone.length) await supabase.remove(TABLE(c), gone);
      ids.forEach((id) => dirty[c].delete(id));
      sync.ok = true;
      sync.error = null;
      sync.lastSync = now;
    } catch (err) {
      sync.ok = false;
      sync.error = err.message;
      console.warn(`[store] Supabase write to ${TABLE(c)} failed (kept for retry): ${err.message}`);
      return;
    }
  }
}

async function flush() {
  timer = null;
  writeFile();
  if (flushing) { await flushing; }
  flushing = pushDirty().finally(() => { flushing = null; });
  await flushing;
  const pending = COLLECTIONS.some((c) => dirty[c].size);
  if (pending && sync.backend === 'supabase' && !timer) timer = setTimeout(flush, 15_000);
}

function touch(c, id) {
  dirty[c].add(id);
  if (!timer) timer = setTimeout(flush, 250);
}

/** Load from Supabase (when configured). Local rows Supabase does not have yet are uploaded. */
async function init() {
  if (!supabase.isConfigured()) { sync.backend = 'file'; return status(); }
  sync.backend = 'supabase';
  try {
    for (const c of COLLECTIONS) {
      const rows = await supabase.selectAll(TABLE(c));
      const remote = new Set();
      for (const r of rows) { db[c][r.id] = r.data; remote.add(r.id); }
      for (const id of Object.keys(db[c])) if (!remote.has(id)) { dirty[c].add(id); sync.migrated += 1; }
    }
    sync.ok = true;
    sync.error = null;
    sync.lastLoad = new Date().toISOString();
    await flush();
  } catch (err) {
    sync.ok = false;
    sync.error = /PGRST205|42P01|Could not find the table|does not exist/i.test(`${err.code} ${err.message}`)
      ? 'The DisputeShield tables do not exist yet. Run supabase/schema.sql once in the Supabase SQL editor, then restart.'
      : err.message;
    console.warn(`[store] Supabase unavailable, using the local file: ${sync.error}`);
    sync.backend = 'file';
    for (const c of COLLECTIONS) dirty[c].clear();
  }
  return status();
}

function status() {
  const counts = {};
  for (const c of COLLECTIONS) {
    counts[c] = { total: Object.keys(db[c]).length };
  }
  return {
    backend: sync.backend,
    configured: supabase.isConfigured(),
    ok: sync.ok,
    error: sync.error,
    lastSync: sync.lastSync,
    lastLoad: sync.lastLoad,
    migrated: sync.migrated,
    pending: COLLECTIONS.reduce((n, c) => n + dirty[c].size, 0),
    tables: COLLECTIONS.map(TABLE),
    counts,
    file: FILE
  };
}

process.on('exit', () => { if (timer) { clearTimeout(timer); writeFile(); } });

module.exports = {
  file: FILE,
  init,
  status,
  getCase: (id) => db.cases[id] || null,
  setCase(id, snapshot) { db.cases[id] = { ...snapshot, savedAt: new Date().toISOString() }; touch('cases', id); return db.cases[id]; },
  listCases: () => Object.values(db.cases),
  getRecord: (txnId) => (txnId ? db.records[txnId] || null : null),
  setRecord(txnId, record) { db.records[txnId] = { ...record, transactionId: txnId, updatedAt: new Date().toISOString() }; touch('records', txnId); return db.records[txnId]; },
  getFacts: (txnId) => (txnId ? db.facts[txnId] || null : null),
  setFacts(txnId, facts) { db.facts[txnId] = facts; touch('facts', txnId); },
  getAnalysis: (id) => db.analyses[id] || null,
  setAnalysis(id, analysis) { db.analyses[id] = analysis; touch('analyses', id); return analysis; },
  allAnalyses: () => Object.entries(db.analyses).map(([id, a]) => ({ id, ...a })),
  getSubmissions: (id) => db.submissions[id] || [],
  addSubmission(id, sub) { (db.submissions[id] ||= []).unshift(sub); touch('submissions', id); },
  allSubmissions: () => Object.entries(db.submissions).flatMap(([id, list]) => list.map((s) => ({ disputeId: id, ...s }))),
  getActivity: (id) => db.activity[id] || [],
  log(id, text, kind = 'info') { (db.activity[id] ||= []).unshift({ at: new Date().toISOString(), text, kind }); db.activity[id] = db.activity[id].slice(0, 100); touch('activity', id); },
  setActivity(id, list) { db.activity[id] = list; touch('activity', id); },
  recentActivity(limit = 40) {
    const all = [];
    for (const [disputeId, list] of Object.entries(db.activity)) for (const a of list) all.push({ ...a, disputeId });
    return all.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
  },
  getPayment: (orderId) => db.payments[orderId] || null,
  setPayment(orderId, p) { db.payments[orderId] = { ...(db.payments[orderId] || {}), ...p, orderId, updatedAt: new Date().toISOString() }; touch('payments', orderId); return db.payments[orderId]; },
  listPayments: () => Object.values(db.payments).sort((a, b) => Date.parse(b.capturedAt || b.createdAt || 0) - Date.parse(a.capturedAt || a.createdAt || 0)),
  paymentByCapture: (captureId) => Object.values(db.payments).find((p) => p.captureId === captureId) || null,
  flush
};
