'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Minimal .env loader (no dependencies). Existing environment variables win. */
function loadEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const DEFAULT_POLICY = [
  'Returns accepted within 30 days of delivery for unused items in original packaging.',
  'Refunds are issued to the original payment method within 5 business days of receiving the return.',
  'Orders ship within 2 business days with tracking.'
].join(' ');

// Models tried in order when the configured one is overloaded (503), rate limited (429) or retired (404).
// Pro models are left out: free-tier keys get 429 (quota) on them.
const DEFAULT_FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

function config() {
  const base = (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').replace(/\/+$/, '');
  const model = (process.env.GEMINI_MODEL || 'gemini-3.5-flash').trim();
  const fallbacks = list(process.env.GEMINI_FALLBACK_MODELS).length ? list(process.env.GEMINI_FALLBACK_MODELS) : DEFAULT_FALLBACK_MODELS;
  return {
    port: Number(process.env.PORT) || 3000,
    paypal: {
      clientId: (process.env.PAYPAL_CLIENT_ID || '').trim(),
      secret: (process.env.PAYPAL_CLIENT_SECRET || '').trim(),
      base,
      sandbox: base.includes('sandbox'),
      webhookId: (process.env.PAYPAL_WEBHOOK_ID || '').trim()
    },
    gemini: {
      key: (process.env.GEMINI_API_KEY || '').trim(),
      model,
      models: [model, ...fallbacks.filter((m) => m !== model)],
      base: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')
    },
    store: {
      name: process.env.STORE_NAME || 'My Store',
      currency: (process.env.STORE_CURRENCY || 'USD').toUpperCase(),
      policy: process.env.STORE_POLICY || DEFAULT_POLICY
    },
    supabase: {
      url: (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
      // A secret (sb_secret_… / service_role) key is preferred; a publishable (sb_publishable_… / anon) key works with the policies in supabase/schema.sql.
      key: (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
    },
    appPassword: process.env.APP_PASSWORD || '',
    publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '')
  };
}

module.exports = { loadEnv, config, ROOT };
