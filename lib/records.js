'use strict';
/**
 * Builds the case file for a disputed transaction from PayPal itself:
 *   capture (Payments v2) -> order (Orders v2: payer, items, ship-to, trackers)
 *   and, when the payment was not made through Orders v2, Transaction Search.
 * These facts are read-only. The merchant's own fulfilment facts (carrier, delivery proof,
 * listing, notes) are stored separately and never overwrite PayPal's data.
 */
const paypal = require('./paypal');
const store = require('./store');

const FRESH_MS = 5 * 60_000;

const money = (m) => (m && m.value != null ? { value: Number(m.value), currency: m.currency_code || '' } : null);
const joinName = (n) => (n ? n.full_name || [n.given_name, n.surname].filter(Boolean).join(' ') || n.alternate_full_name || '' : '');

function formatAddress(a) {
  if (!a) return '';
  return [a.address_line_1 || a.line1, a.address_line_2 || a.line2, a.admin_area_2 || a.city, [a.admin_area_1 || a.state, a.postal_code].filter(Boolean).join(' '), a.country_code]
    .filter((x) => x && String(x).trim()).join(', ');
}

function trackerNumber(t, captureId) {
  const id = String(t.id || '');
  return captureId && id.startsWith(captureId + '-') ? id.slice(captureId.length + 1) : id;
}

function fromOrder(capture, order) {
  const unit = (order && order.purchase_units && order.purchase_units[0]) || {};
  const ship = unit.shipping || {};
  const payer = (order && order.payer) || {};
  const wallet = (order && order.payment_source && order.payment_source.paypal) || {};
  const breakdown = capture.seller_receivable_breakdown || {};
  return {
    via: order ? 'PayPal Orders and Payments APIs' : 'PayPal Payments API',
    captureId: capture.id,
    orderId: (capture.supplementary_data && capture.supplementary_data.related_ids && capture.supplementary_data.related_ids.order_id) || '',
    status: capture.status || '',
    amount: money(capture.amount),
    fee: money(breakdown.paypal_fee),
    net: money(breakdown.net_amount),
    paidAt: capture.create_time || '',
    invoiceId: capture.invoice_id || unit.invoice_id || '',
    reference: capture.custom_id || unit.custom_id || unit.reference_id || '',
    sellerProtection: capture.seller_protection ? { status: capture.seller_protection.status || '', categories: capture.seller_protection.dispute_categories || [] } : null,
    payer: {
      name: joinName(payer.name) || joinName(wallet.name),
      email: payer.email_address || wallet.email_address || '',
      payerId: payer.payer_id || wallet.account_id || '',
      accountStatus: wallet.account_status || ''
    },
    shipTo: { name: joinName(ship.name), address: formatAddress(ship.address) },
    items: (unit.items || []).map((i) => ({ name: i.name, quantity: Number(i.quantity) || 1, unitAmount: money(i.unit_amount), sku: i.sku || '' })),
    description: unit.description || '',
    trackers: (ship.trackers || []).map((t) => ({ number: trackerNumber(t, capture.id), status: t.status || '', addedAt: t.create_time || '' }))
  };
}

function fromSearch(d) {
  const ti = d.transaction_info || {};
  const pi = d.payer_info || {};
  const si = d.shipping_info || {};
  const ci = d.cart_info || {};
  return {
    via: 'PayPal Transaction Search API',
    captureId: ti.transaction_id || '',
    orderId: '',
    status: ti.transaction_status === 'S' ? 'COMPLETED' : ti.transaction_status || '',
    amount: money(ti.transaction_amount),
    fee: money(ti.fee_amount),
    net: null,
    paidAt: ti.transaction_initiation_date || '',
    invoiceId: ti.invoice_id || '',
    reference: ti.custom_field || '',
    sellerProtection: ti.protection_eligibility ? { status: ti.protection_eligibility === '01' ? 'ELIGIBLE' : ti.protection_eligibility === '02' ? 'PARTIALLY_ELIGIBLE' : 'NOT_ELIGIBLE', categories: [] } : null,
    payer: { name: joinName(pi.payer_name), email: pi.email_address || '', payerId: pi.account_id || '', accountStatus: pi.payer_status === 'Y' ? 'VERIFIED' : pi.payer_status === 'N' ? 'UNVERIFIED' : '' },
    shipTo: { name: si.name || '', address: formatAddress(si.address) },
    items: (ci.item_details || []).map((i) => ({ name: i.item_name || i.item_code || 'Item', quantity: Number(i.item_quantity) || 1, unitAmount: money(i.item_unit_price), sku: i.item_code || '' })),
    description: ti.transaction_subject || ti.transaction_note || '',
    trackers: ci.tracking_number ? [{ number: ci.tracking_number, status: '', addedAt: '' }] : []
  };
}

/** PayPal's facts for a transaction, cached for a few minutes. Never throws: returns { facts, error }. */
async function paypalFacts(transactionId, transactionDate, { force = false } = {}) {
  if (!transactionId) return { facts: null, error: 'PayPal did not include a seller transaction id on this dispute.' };
  const cached = store.getFacts(transactionId);
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < FRESH_MS) return { facts: cached, error: null };
  let facts = null;
  let error = null;
  try {
    const capture = await paypal.getCapture(transactionId);
    const orderId = capture.supplementary_data && capture.supplementary_data.related_ids && capture.supplementary_data.related_ids.order_id;
    let order = null;
    if (orderId) {
      try { order = await paypal.getOrder(orderId); } catch { order = null; }
    }
    facts = fromOrder(capture, order);
  } catch (err) {
    try {
      const found = await paypal.searchTransaction(transactionId, transactionDate);
      if (found) facts = fromSearch(found);
      else error = 'PayPal has no capture or searchable transaction for this id yet (Transaction Search can lag by up to 3 hours).';
    } catch (err2) {
      error = `Could not read the transaction from PayPal: ${err.message}`;
    }
  }
  if (facts) {
    facts.fetchedAt = new Date().toISOString();
    store.setFacts(transactionId, facts);
    return { facts, error: null };
  }
  return { facts: cached || null, error };
}

module.exports = { paypalFacts, formatAddress, fromOrder, fromSearch };
