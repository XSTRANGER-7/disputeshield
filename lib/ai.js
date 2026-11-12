'use strict';
/**
 * Dispute analyst powered by Google Gemini (generateContent REST API) with a strict JSON
 * response schema. No canned fallback: if Gemini cannot answer, the merchant sees the error.
 * Overloaded (503), rate-limited (429) or retired (404) models are retried and then the next
 * model in GEMINI_MODEL + GEMINI_FALLBACK_MODELS is tried.
 */
const { config } = require('./config');

const EVIDENCE_TYPES = ['PROOF_OF_FULFILLMENT', 'PROOF_OF_REFUND', 'OTHER'];
const ACTIONS = ['FIGHT', 'REFUND', 'NEED_INFO'];
const NOTES_LIMIT = 2000;
const MESSAGE_LIMIT = 2000;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    recommended_action: { type: 'STRING', enum: ACTIONS },
    category: { type: 'STRING' },
    evidence_type: { type: 'STRING', enum: EVIDENCE_TYPES },
    strength_score: { type: 'INTEGER' },
    summary: { type: 'STRING' },
    strength_reasons: { type: 'ARRAY', items: { type: 'STRING' } },
    risks: { type: 'ARRAY', items: { type: 'STRING' } },
    missing_evidence: { type: 'ARRAY', items: { type: 'STRING' } },
    response_notes: { type: 'STRING' },
    buyer_message: { type: 'STRING' },
    facts_used: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['recommended_action', 'category', 'evidence_type', 'strength_score', 'summary', 'strength_reasons', 'risks', 'missing_evidence', 'response_notes', 'buyer_message', 'facts_used'],
  propertyOrdering: ['recommended_action', 'category', 'evidence_type', 'strength_score', 'summary', 'strength_reasons', 'risks', 'missing_evidence', 'response_notes', 'buyer_message', 'facts_used']
};

const SYSTEM = `You are DisputeShield, a payments dispute analyst working for an online merchant that sells through PayPal.
You receive one PayPal dispute, PayPal's own records of the disputed transaction, the merchant's fulfilment facts and the store policy.
Decide the best response and draft it.

Rules:
- Use ONLY facts present in the input. Never invent tracking numbers, dates, signatures, refunds, addresses or conversations.
- paypal_transaction is read from PayPal's APIs and is verified. merchant_fulfilment is typed in by the merchant; treat it as the merchant's claim and cite it as such when it matters.
- recommended_action: FIGHT when the records clearly support the merchant; REFUND when the buyer is likely right or the evidence is too weak to win (fighting costs the dispute fee and time); NEED_INFO when a key fact is missing but could exist (say what in missing_evidence).
- evidence_type: PROOF_OF_FULFILLMENT only when a carrier and tracking number exist that show the item was shipped or delivered; PROOF_OF_REFUND only when a refund id exists; OTHER for everything else (item matches its description, the payment was authorised, a written timeline).
- strength_score: 0 to 100, your honest estimate that PayPal rules for the merchant if this evidence is submitted. Without delivery proof an item-not-received case is weak.
- summary: two sentences a busy merchant can read in five seconds.
- strength_reasons and risks: short phrases, each under 15 words, each citing a specific fact.
- response_notes: the text the merchant will send to PayPal with the evidence. Under 1,500 characters. Factual, chronological, polite, first person plural as the merchant. Cite order or invoice number, payment date, amount, carrier and tracking number, delivery date, refund id or listing details where they exist. No markdown, no headings. Empty string if recommended_action is REFUND.
- buyer_message: a short, friendly message (under 600 characters) the merchant can send to the buyer through PayPal's dispute messages to resolve the issue directly. Do not promise refunds unless recommended_action is REFUND.
- facts_used: the exact values you relied on (for example "UPS 1Z999AA10123456784 delivered 2026-11-06", "Capture 5TY0… paid 2026-11-02").
- Check the dates against each other and against today. Shipping before the payment, delivery before shipping, or a delivery date in the future means a record is wrong: list it under risks, lower the score, and do not cite the contradictory date to PayPal.
- If the dispute is in the INQUIRY stage, the merchant can usually message the buyer before evidence is due; mention that in the summary when helpful.`;

function buildContext(dispute, facts, merchant) {
  const c = config();
  return {
    today: new Date().toISOString().slice(0, 10),
    store: { name: c.store.name, policy: c.store.policy },
    dispute: {
      id: dispute.id,
      reason: dispute.reason,
      reason_label: dispute.reasonLabel,
      status: dispute.status,
      lifecycle_stage: dispute.stage,
      channel: dispute.channel,
      amount: `${dispute.amount.value.toFixed(2)} ${dispute.amount.currency}`,
      opened: dispute.createdAt,
      seller_response_due: dispute.dueDate,
      buyer: dispute.buyer,
      seller_transaction_id: dispute.transactionId,
      transaction_date: dispute.transactionDate,
      disputed_items: dispute.items,
      messages: dispute.messages.map((m) => ({ from: m.by || 'PAYPAL', at: m.at, text: m.text })).filter((m) => m.text),
      evidence_requested_or_sent: dispute.evidences
    },
    paypal_transaction: facts || 'PayPal returned no transaction details for this dispute.',
    merchant_fulfilment: merchant && Object.values(merchant).some((v) => v && (typeof v !== 'object' || Object.values(v).some(Boolean)))
      ? merchant
      : 'The merchant has not entered any fulfilment facts (carrier, tracking, delivery proof, listing, refund id).'
  };
}

function clean(out) {
  const arr = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 8) : []);
  const action = ACTIONS.includes(out.recommended_action) ? out.recommended_action : 'NEED_INFO';
  const type = EVIDENCE_TYPES.includes(out.evidence_type) ? out.evidence_type : 'OTHER';
  let score = Math.round(Number(out.strength_score));
  if (!Number.isFinite(score)) score = 50;
  score = Math.max(0, Math.min(100, score));
  return {
    recommended_action: action,
    category: String(out.category || '').slice(0, 80),
    evidence_type: type,
    strength_score: score,
    summary: String(out.summary || '').slice(0, 600),
    strength_reasons: arr(out.strength_reasons),
    risks: arr(out.risks),
    missing_evidence: arr(out.missing_evidence),
    response_notes: String(out.response_notes || '').trim().slice(0, NOTES_LIMIT),
    buyer_message: String(out.buyer_message || '').trim().slice(0, MESSAGE_LIMIT),
    facts_used: arr(out.facts_used)
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class GeminiError extends Error {
  constructor(message, { status = 502, retryable = false, nextModel = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.nextModel = nextModel;
  }
}

async function callGemini(model, context) {
  const { key, base } = config().gemini;
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: 'Analyse this dispute and draft the response. Input JSON:\n' + JSON.stringify(context, null, 2) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: SCHEMA }
  };
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    throw new GeminiError(`Gemini ${model} did not answer (${err.name === 'TimeoutError' ? 'timed out after 30 s' : err.message}).`, { retryable: true, nextModel: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `HTTP ${res.status}`;
    if (res.status === 404) throw new GeminiError(`Gemini model ${model} is not available: ${msg}`, { nextModel: true });
    if (res.status === 429 || res.status >= 500) throw new GeminiError(`Gemini ${model} is busy (${res.status}): ${msg}`, { retryable: true, nextModel: true });
    if (res.status === 400 && /api key/i.test(msg)) throw new GeminiError(`Gemini rejected GEMINI_API_KEY: ${msg}`, { status: 502 });
    throw new GeminiError(`Gemini error (${res.status}): ${msg}`, { status: 502 });
  }
  const cand = Array.isArray(data.candidates) ? data.candidates[0] : null;
  const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.filter((p) => !p.thought).map((p) => p.text || '').join('') : '';
  if (!text) {
    const reason = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || 'empty response';
    throw new GeminiError(`Gemini returned no analysis (${reason}).`, { retryable: true });
  }
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  } catch {
    throw new GeminiError('Gemini returned malformed JSON.', { retryable: true });
  }
  return { parsed, modelVersion: data.modelVersion || model, usage: data.usageMetadata || null };
}

function isConfigured() { return Boolean(config().gemini.key); }

// Model health, so a busy model is not waited on again and again:
// the last model that answered goes first; a model that was busy (503/429/timeout) rests for a minute.
let lastGood = null;
const restingUntil = new Map();

function orderModels(models) {
  const now = Date.now();
  const list = lastGood && models.includes(lastGood) ? [lastGood, ...models.filter((m) => m !== lastGood)] : [...models];
  const awake = list.filter((m) => (restingUntil.get(m) || 0) <= now);
  const resting = list.filter((m) => (restingUntil.get(m) || 0) > now);
  return [...awake, ...resting];
}

function health() {
  const now = Date.now();
  const { models, model } = config().gemini;
  return {
    configured: isConfigured(),
    primary: model,
    lastGood,
    chain: models.map((m) => ({ model: m, restingFor: Math.max(0, Math.round(((restingUntil.get(m) || 0) - now) / 1000)) }))
  };
}

async function analyze(dispute, facts, merchant) {
  const { key } = config().gemini;
  const models = orderModels(config().gemini.models);
  if (!key) throw new GeminiError('GEMINI_API_KEY is not set on the server, so the AI analyst cannot run.', { status: 400 });
  const context = buildContext(dispute, facts, merchant);
  const started = Date.now();
  const tried = [];
  let lastErr;
  // Round 1 walks the whole chain; if every model was busy, round 2 walks it once more after a pause.
  const chain = [...models, ...models.map((m) => ({ again: m }))];
  for (const entry of chain) {
    const model = typeof entry === 'string' ? entry : entry.again;
    if (typeof entry !== 'string') {
      if (!lastErr || !lastErr.retryable || Date.now() - started > 60_000) break;
      if (model === models[0]) await sleep(2500);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (Date.now() - started > 110_000) break;
      try {
        const out = await callGemini(model, context);
        lastGood = model;
        restingUntil.delete(model);
        return {
          ...clean(out.parsed),
          engine: { provider: 'Google Gemini', model: out.modelVersion, requested: model, fallbackFrom: model === config().gemini.model ? null : config().gemini.model, tried },
          usage: out.usage ? { input: out.usage.promptTokenCount, output: out.usage.candidatesTokenCount, total: out.usage.totalTokenCount } : null,
          analysedAt: new Date().toISOString(),
          latencyMs: Date.now() - started
        };
      } catch (err) {
        lastErr = err;
        tried.push(`${model}: ${err.message.slice(0, 140)}`);
        if (!(err instanceof GeminiError)) throw err;
        if (err.retryable && err.nextModel) restingUntil.set(model, Date.now() + 60_000);
        if (lastGood === model) lastGood = null;
        if (err.retryable && attempt === 0 && !err.nextModel) { await sleep(800); continue; }
        if (err.retryable && attempt === 0 && err.nextModel && models.length === 1) { await sleep(1500); continue; }
        break;
      }
    }
    if (lastErr && !lastErr.nextModel && !lastErr.retryable) break;
    if (Date.now() - started > 110_000) break;
  }
  const names = [...new Set(tried.map((t) => t.split(':')[0]))];
  throw new GeminiError(`${lastErr ? lastErr.message : 'Gemini failed.'}${names.length > 1 ? ` Tried: ${names.join(', ')}.` : ''}`, { status: lastErr && lastErr.status === 400 ? 400 : 502 });
}

module.exports = { analyze, buildContext, clean, isConfigured, health, NOTES_LIMIT, MESSAGE_LIMIT, EVIDENCE_TYPES, SCHEMA };
