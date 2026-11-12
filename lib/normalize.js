'use strict';
/** Turns a raw PayPal dispute into the shape the UI and the AI use. */

const REASONS = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'Item not received',
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'Not as described',
  UNAUTHORISED: 'Unauthorised payment',
  CREDIT_NOT_PROCESSED: 'Refund not processed',
  DUPLICATE_TRANSACTION: 'Duplicate charge',
  INCORRECT_AMOUNT: 'Incorrect amount',
  PAYMENT_BY_OTHER_MEANS: 'Paid by other means',
  CANCELED_RECURRING_BILLING: 'Cancelled subscription',
  PROBLEM_WITH_REMITTANCE: 'Remittance problem',
  OTHER: 'Other'
};

function hasAction(links, name) {
  return links.some((l) => l && typeof l.href === 'string' && l.href.split('?')[0].replace(/\/+$/, '').endsWith('/' + name));
}

function actionsFrom(raw) {
  const links = Array.isArray(raw.links) ? raw.links : [];
  const actionLinks = links.filter((l) => l && l.rel !== 'self');
  if (actionLinks.length) {
    return {
      provideEvidence: hasAction(links, 'provide-evidence'),
      acceptClaim: hasAction(links, 'accept-claim'),
      escalate: hasAction(links, 'escalate'),
      requireEvidence: hasAction(links, 'require-evidence'),
      adjudicate: hasAction(links, 'adjudicate'),
      appeal: hasAction(links, 'appeal'),
      sendMessage: hasAction(links, 'send-message'),
      makeOffer: hasAction(links, 'make-offer'),
      provideSupportingInfo: hasAction(links, 'provide-supporting-info')
    };
  }
  // No HATEOAS links (for example a list item that failed its detail call): infer from status.
  const s = raw.status;
  return {
    provideEvidence: s === 'WAITING_FOR_SELLER_RESPONSE',
    acceptClaim: s === 'WAITING_FOR_SELLER_RESPONSE' || s === 'OPEN',
    escalate: false,
    requireEvidence: s === 'UNDER_REVIEW',
    adjudicate: s === 'UNDER_REVIEW',
    appeal: false,
    sendMessage: false,
    makeOffer: false,
    provideSupportingInfo: false
  };
}

function money(m) {
  if (!m) return null;
  return { value: Number(m.value || 0), currency: m.currency_code || 'USD' };
}

function normalize(raw) {
  const tx = (Array.isArray(raw.disputed_transactions) && raw.disputed_transactions[0]) || {};
  const buyer = tx.buyer || {};
  const amount = money(raw.dispute_amount) || money(tx.gross_amount) || { value: 0, currency: 'USD' };
  const outcomeRaw = raw.dispute_outcome || raw.outcome || null;
  const items = Array.isArray(tx.items) ? tx.items : Array.isArray(raw.disputed_items) ? raw.disputed_items : [];
  return {
    id: raw.dispute_id,
    reason: raw.reason || 'OTHER',
    reasonLabel: REASONS[raw.reason] || (raw.reason ? String(raw.reason).replace(/_/g, ' ').toLowerCase() : 'Other'),
    status: raw.status || 'OPEN',
    stage: raw.dispute_life_cycle_stage || '',
    channel: raw.dispute_channel || '',
    amount,
    createdAt: raw.create_time || null,
    updatedAt: raw.update_time || null,
    dueDate: raw.seller_response_due_date || null,
    buyerDueDate: raw.buyer_response_due_date || null,
    buyer: { name: buyer.name || '', email: buyer.email || '' },
    transactionId: tx.seller_transaction_id || '',
    buyerTransactionId: tx.buyer_transaction_id || '',
    transactionDate: tx.create_time || null,
    invoice: tx.invoice_number || '',
    items: items.map((it) => ({
      name: it.item_name || it.item_description || it.item_id || 'Item',
      quantity: it.item_quantity || '',
      reason: it.reason || '',
      notes: it.notes || ''
    })),
    messages: (Array.isArray(raw.messages) ? raw.messages : []).map((m) => ({ by: m.posted_by || '', at: m.time_posted || null, text: m.content || '' })),
    evidences: (Array.isArray(raw.evidences) ? raw.evidences : []).map((e) => ({ type: e.evidence_type || '', source: e.source || '', at: e.date || null, notes: e.notes || '', documents: (Array.isArray(e.documents) ? e.documents : []).map((d) => d && d.name).filter(Boolean) })),
    offer: raw.offer ? { type: raw.offer.offer_type || '', amount: money(raw.offer.seller_offered_amount) || money(raw.offer.buyer_requested_amount) } : null,
    outcome: outcomeRaw ? { code: outcomeRaw.outcome_code || '', refunded: money(outcomeRaw.amount_refunded) } : null,
    actions: actionsFrom(raw)
  };
}

module.exports = { normalize, REASONS, actionsFrom };
