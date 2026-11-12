'use strict';
/**
 * Minimal Supabase (PostgREST) client: select all rows of a table and upsert rows.
 * Works with the new sb_publishable_/sb_secret_ keys (sent as apikey) and legacy JWT keys.
 */
const { config } = require('./config');

class SupabaseError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}

function headers(extra = {}) {
  const { key } = config().supabase;
  const h = { apikey: key, Accept: 'application/json', ...extra };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

async function call(method, path, { body, prefer } = {}) {
  const { url } = config().supabase;
  const h = headers(body ? { 'Content-Type': 'application/json' } : {});
  if (prefer) h.Prefer = prefer;
  let res;
  try {
    res = await fetch(`${url}/rest/v1/${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new SupabaseError(`Could not reach Supabase (${err.name === 'TimeoutError' ? 'timed out' : (err.cause && err.cause.code) || err.message})`, 504);
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const msg = (data && (data.message || data.error_description || data.hint)) || `HTTP ${res.status}`;
    throw new SupabaseError(`Supabase ${res.status}: ${msg}`, res.status, data && data.code);
  }
  return data;
}

function isConfigured() {
  const s = config().supabase;
  return Boolean(s.url && s.key);
}

async function selectAll(table) {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const batch = await call('GET', `${table}?select=id,data,updated_at&order=id.asc&offset=${from}&limit=${page}`);
    rows.push(...(batch || []));
    if (!batch || batch.length < page) break;
  }
  return rows;
}

function upsert(table, rows) {
  if (!rows.length) return Promise.resolve();
  return call('POST', `${table}?on_conflict=id`, { body: rows, prefer: 'resolution=merge-duplicates,return=minimal' });
}

function remove(table, ids) {
  if (!ids.length) return Promise.resolve();
  const list = ids.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
  return call('DELETE', `${table}?id=in.(${encodeURIComponent(list)})`, { prefer: 'return=minimal' });
}

module.exports = { isConfigured, selectAll, upsert, remove, SupabaseError };
