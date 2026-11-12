'use strict';
/** Evidence helpers: PayPal evidence objects (with fallbacks) and the evidence PDF. */
const { config } = require('./config');
const ai = require('./ai');
const pdf = require('./pdf');

const CARRIERS = { UPS: 'UPS', USPS: 'USPS', FEDEX: 'FEDEX', 'FED EX': 'FEDEX', DHL: 'DHL' };

function trackingInfo(carrier, number) {
  const key = String(carrier || '').trim().toUpperCase();
  return CARRIERS[key]
    ? { carrier_name: CARRIERS[key], tracking_number: number }
    : { carrier_name: 'OTHER', carrier_name_other: String(carrier || 'Other').slice(0, 64), tracking_number: number };
}

function shipment(merchant, facts) {
  const s = (merchant && merchant.shipping) || {};
  if (s.trackingNumber) return { carrier: s.carrier, number: s.trackingNumber };
  const t = facts && facts.trackers && facts.trackers[0];
  return t && t.number ? { carrier: s.carrier || 'Other', number: t.number } : null;
}

/** Ordered list of evidence variants to try: the typed one first, OTHER with the details in the notes as a fallback. */
function evidenceVariants(type, notes, merchant, facts) {
  const text = String(notes || '').trim().slice(0, ai.NOTES_LIMIT);
  const ship = shipment(merchant, facts);
  const refundId = merchant && merchant.refundId;
  const variants = [];
  if (type === 'PROOF_OF_FULFILLMENT' && ship) {
    variants.push({ evidence_type: 'PROOF_OF_FULFILLMENT', evidence_info: { tracking_info: [trackingInfo(ship.carrier, ship.number)] }, notes: text });
    variants.push({ evidence_type: 'OTHER', notes: `${text} Tracking: ${ship.carrier || ''} ${ship.number}.`.trim().slice(0, ai.NOTES_LIMIT) });
  } else if (type === 'PROOF_OF_REFUND' && refundId) {
    variants.push({ evidence_type: 'PROOF_OF_REFUND', evidence_info: { refund_ids: [{ refund_id: refundId }] }, notes: text });
    variants.push({ evidence_type: 'OTHER', notes: `${text} Refund ID: ${refundId}.`.slice(0, ai.NOTES_LIMIT) });
  } else {
    variants.push({ evidence_type: 'OTHER', notes: text });
  }
  return variants;
}

function money(m) {
  if (!m || m.value == null) return '';
  return `${Number(m.value).toFixed(2)} ${m.currency || ''}`.trim();
}

function evidencePdf(d, facts, merchant, notes) {
  const c = config();
  const s = (merchant && merchant.shipping) || {};
  const blocks = [
    { type: 'title', text: 'Dispute evidence summary' },
    { type: 'meta', text: `${c.store.name} · PayPal dispute ${d.id} · prepared ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC` },
    { type: 'rule' },
    { type: 'heading', text: 'Dispute' },
    { type: 'kv', key: 'Reason', value: d.reasonLabel },
    { type: 'kv', key: 'Amount', value: money(d.amount) },
    { type: 'kv', key: 'Opened', value: d.createdAt ? d.createdAt.slice(0, 10) : '' },
    { type: 'kv', key: 'Seller transaction', value: d.transactionId || 'not provided' }
  ];
  if (facts) {
    blocks.push({ type: 'heading', text: 'Payment, as recorded by PayPal' });
    const add = (key, value) => { if (value) blocks.push({ type: 'kv', key, value }); };
    add('Capture', `${facts.captureId}${facts.status ? ` (${facts.status})` : ''}`);
    add('PayPal order', facts.orderId);
    add('Invoice / reference', [facts.invoiceId, facts.reference].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / '));
    add('Paid', [facts.paidAt && facts.paidAt.slice(0, 10), money(facts.amount)].filter(Boolean).join(' · '));
    add('Buyer', [facts.payer.name, facts.payer.email, facts.payer.accountStatus && `account ${facts.payer.accountStatus.toLowerCase()}`].filter(Boolean).join(' · '));
    add('Ship to', [facts.shipTo.name, facts.shipTo.address].filter(Boolean).join(', '));
    add('Items', facts.items.map((i) => `${i.name} x${i.quantity}${i.unitAmount ? ` @ ${money(i.unitAmount)}` : ''}`).join('; '));
    add('Tracking on PayPal', facts.trackers.map((t) => `${t.number}${t.status ? ` (${t.status})` : ''}`).join(', '));
    add('Seller protection', facts.sellerProtection && facts.sellerProtection.status);
    blocks.push({ type: 'meta', text: `Source: ${facts.via}, read ${facts.fetchedAt ? facts.fetchedAt.slice(0, 16).replace('T', ' ') : ''} UTC.` });
  }
  const m = merchant || {};
  const fulfil = [
    ['Carrier', s.carrier], ['Tracking number', s.trackingNumber], ['Shipped', s.shippedAt], ['Delivered', s.deliveredAt || s.status],
    ['Delivery proof', s.deliveryProof], ['Listing description', m.listing], ['Refund ID', m.refundId], ['Customer history', m.history], ['Other notes', m.notes]
  ].filter(([, v]) => v);
  if (fulfil.length) {
    blocks.push({ type: 'heading', text: 'Fulfilment, from the merchant\'s records' });
    for (const [k, v] of fulfil) blocks.push({ type: 'kv', key: k, value: v });
  }
  blocks.push({ type: 'heading', text: 'Merchant statement' });
  blocks.push({ type: 'text', text: notes || '' });
  blocks.push({ type: 'rule' });
  blocks.push({ type: 'meta', text: 'Prepared with DisputeShield from PayPal API data and the merchant\'s own records, and approved by the merchant before submission.' });
  return pdf.render(blocks);
}


module.exports = { trackingInfo, shipment, evidenceVariants, evidencePdf, money };
