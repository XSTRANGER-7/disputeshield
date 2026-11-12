'use strict';
// Unit tests: node --test   (zero dependencies, no network)
const test = require('node:test');
const assert = require('node:assert/strict');

const { normalize } = require('../lib/normalize');
const ai = require('../lib/ai');
const { evidenceVariants, trackingInfo, evidencePdf } = require('../lib/evidence');
const pdf = require('../lib/pdf');
const { fromOrder, fromSearch, formatAddress } = require('../lib/records');
const { buildMultipart } = require('../lib/paypal');

const BASE = 'https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-R-1';
const rawDispute = (over = {}) => ({
  dispute_id: 'PP-R-1',
  create_time: '2026-11-12T14:09:37Z',
  reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
  status: 'WAITING_FOR_SELLER_RESPONSE',
  dispute_amount: { currency_code: 'USD', value: '89.00' },
  dispute_life_cycle_stage: 'CHARGEBACK',
  seller_response_due_date: '2026-11-22T10:00:00Z',
  disputed_transactions: [{ seller_transaction_id: 'CAP1', buyer_transaction_id: 'BUY1', buyer: { name: 'John Doe' }, items: [{ item_name: 'Headphones', item_quantity: '1' }] }],
  messages: [{ posted_by: 'BUYER', time_posted: '2026-11-12T14:10:00Z', content: 'Never arrived' }],
  evidences: [{ evidence_type: 'OTHER', source: 'SUBMITTED_BY_SELLER', date: '2026-11-12T14:35:00Z', documents: [{ name: 'evidence.pdf' }] }],
  offer: { buyer_requested_amount: { currency_code: 'USD', value: '89.00' } },
  links: [
    { rel: 'self', href: BASE },
    { rel: 'provide_evidence', href: `${BASE}/provide-evidence` },
    { rel: 'accept_claim', href: `${BASE}/accept-claim` },
    { rel: 'send_message', href: `${BASE}/send-message` }
  ],
  ...over
});

test('normalize maps a PayPal dispute and reads actions from HATEOAS links', () => {
  const d = normalize(rawDispute());
  assert.equal(d.id, 'PP-R-1');
  assert.equal(d.reasonLabel, 'Item not received');
  assert.deepEqual(d.amount, { value: 89, currency: 'USD' });
  assert.equal(d.transactionId, 'CAP1');
  assert.equal(d.buyer.name, 'John Doe');
  assert.equal(d.items[0].name, 'Headphones');
  assert.equal(d.messages[0].text, 'Never arrived');
  assert.deepEqual(d.evidences[0].documents, ['evidence.pdf']);
  assert.deepEqual(d.offer.amount, { value: 89, currency: 'USD' });
  assert.equal(d.actions.provideEvidence, true);
  assert.equal(d.actions.acceptClaim, true);
  assert.equal(d.actions.sendMessage, true);
  assert.equal(d.actions.adjudicate, false);
  assert.equal(d.actions.provideSupportingInfo, false);
});

test('normalize infers actions from status when PayPal sent no action links', () => {
  const d = normalize(rawDispute({ status: 'UNDER_REVIEW', links: [{ rel: 'self', href: BASE }] }));
  assert.equal(d.actions.provideEvidence, false);
  assert.equal(d.actions.adjudicate, true);
  assert.equal(d.actions.requireEvidence, true);
});

test('normalize survives a minimal list item', () => {
  const d = normalize({ dispute_id: 'X', status: 'RESOLVED', dispute_outcome: { outcome_code: 'RESOLVED_SELLER_FAVOUR' } });
  assert.equal(d.status, 'RESOLVED');
  assert.equal(d.reasonLabel, 'Other');
  assert.equal(d.outcome.code, 'RESOLVED_SELLER_FAVOUR');
  assert.deepEqual(d.items, []);
});

test('AI output is validated: unknown enums, score clamp, note length', () => {
  const out = ai.clean({ recommended_action: 'ATTACK', evidence_type: 'PHOTO', strength_score: 180, response_notes: 'x'.repeat(5000), strength_reasons: [' a ', '', 'b'], facts_used: 'not-an-array' });
  assert.equal(out.recommended_action, 'NEED_INFO');
  assert.equal(out.evidence_type, 'OTHER');
  assert.equal(out.strength_score, 100);
  assert.equal(out.response_notes.length, ai.NOTES_LIMIT);
  assert.deepEqual(out.strength_reasons, ['a', 'b']);
  assert.deepEqual(out.facts_used, []);
  assert.equal(ai.clean({ strength_score: 'abc' }).strength_score, 50);
  assert.equal(ai.clean({ strength_score: -4 }).strength_score, 0);
});

test('AI context keeps PayPal facts apart from merchant claims', () => {
  const d = normalize(rawDispute());
  const ctx = ai.buildContext(d, { captureId: 'CAP1' }, null);
  assert.deepEqual(ctx.paypal_transaction, { captureId: 'CAP1' });
  assert.match(ctx.merchant_fulfilment, /has not entered/);
  assert.equal(ctx.dispute.messages[0].from, 'BUYER');
  const ctx2 = ai.buildContext(d, null, { shipping: { carrier: 'UPS', trackingNumber: '1Z' } });
  assert.match(ctx2.paypal_transaction, /no transaction details/);
  assert.equal(ctx2.merchant_fulfilment.shipping.carrier, 'UPS');
});

test('AI response schema restricts the action and evidence type', () => {
  assert.deepEqual(ai.SCHEMA.properties.recommended_action.enum, ['FIGHT', 'REFUND', 'NEED_INFO']);
  assert.deepEqual(ai.SCHEMA.properties.evidence_type.enum, ['PROOF_OF_FULFILLMENT', 'PROOF_OF_REFUND', 'OTHER']);
  assert.ok(ai.SCHEMA.required.includes('facts_used'));
});

test('tracking info maps known carriers and falls back to OTHER', () => {
  assert.deepEqual(trackingInfo('ups', '1Z9'), { carrier_name: 'UPS', tracking_number: '1Z9' });
  assert.deepEqual(trackingInfo('Fed Ex', '77'), { carrier_name: 'FEDEX', tracking_number: '77' });
  assert.deepEqual(trackingInfo('Delhivery', 'D1'), { carrier_name: 'OTHER', carrier_name_other: 'Delhivery', tracking_number: 'D1' });
});

test('evidence variants: typed first, OTHER with details as fallback', () => {
  const merchant = { shipping: { carrier: 'UPS', trackingNumber: '1Z999' } };
  const v = evidenceVariants('PROOF_OF_FULFILLMENT', 'Delivered on time.', merchant, null);
  assert.equal(v.length, 2);
  assert.equal(v[0].evidence_type, 'PROOF_OF_FULFILLMENT');
  assert.equal(v[0].evidence_info.tracking_info[0].tracking_number, '1Z999');
  assert.equal(v[1].evidence_type, 'OTHER');
  assert.match(v[1].notes, /1Z999/);

  const fromPayPal = evidenceVariants('PROOF_OF_FULFILLMENT', 'n', null, { trackers: [{ number: 'TRK' }] });
  assert.equal(fromPayPal[0].evidence_info.tracking_info[0].tracking_number, 'TRK');

  const refund = evidenceVariants('PROOF_OF_REFUND', 'Refunded.', { refundId: 'R-1' }, null);
  assert.equal(refund[0].evidence_info.refund_ids[0].refund_id, 'R-1');

  const noTracking = evidenceVariants('PROOF_OF_FULFILLMENT', 'n', {}, null);
  assert.deepEqual(noTracking.map((x) => x.evidence_type), ['OTHER']);
});

test('evidence PDF is a valid, complete PDF and paginates long statements', () => {
  const d = normalize(rawDispute());
  const facts = fromOrder({ id: 'CAP1', status: 'COMPLETED', amount: { value: '89.00', currency_code: 'USD' }, create_time: '2026-11-12T13:59:00Z' }, null);
  const buf = evidencePdf(d, facts, { shipping: { carrier: 'UPS', trackingNumber: '1Z' } }, 'We shipped it. '.repeat(400));
  const text = buf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Count [2-9]/);
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
});

test('pdf wrap hard-breaks words longer than a line and maps typographic quotes', () => {
  const lines = pdf.wrap('x'.repeat(400), 10, false, 200);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((l) => l.length > 0));
  assert.deepEqual(pdf.wrap('“quoted” — dash', 10, false, 500), ['"quoted" - dash']);
});

test('case file from a PayPal capture and order', () => {
  const capture = {
    id: 'CAP1', status: 'COMPLETED', amount: { value: '89.00', currency_code: 'USD' }, create_time: '2026-11-12T13:59:00Z',
    seller_protection: { status: 'ELIGIBLE', dispute_categories: ['ITEM_NOT_RECEIVED'] },
    seller_receivable_breakdown: { paypal_fee: { value: '4.45', currency_code: 'USD' } },
    supplementary_data: { related_ids: { order_id: 'ORD1' } }
  };
  const order = {
    payer: { name: { given_name: 'John', surname: 'Doe' }, email_address: 'buyer@example.com', payer_id: 'P1' },
    purchase_units: [{ items: [{ name: 'Headphones', quantity: '1', unit_amount: { value: '89.00', currency_code: 'USD' } }], shipping: { name: { full_name: 'John Doe' }, address: { address_line_1: '1 Main St', admin_area_2: 'San Jose', admin_area_1: 'CA', postal_code: '95131', country_code: 'US' }, trackers: [{ id: 'CAP1-1Z999', status: 'SHIPPED' }] } }]
  };
  const f = fromOrder(capture, order);
  assert.equal(f.orderId, 'ORD1');
  assert.equal(f.payer.name, 'John Doe');
  assert.equal(f.shipTo.address, '1 Main St, San Jose, CA 95131, US');
  assert.equal(f.trackers[0].number, '1Z999');
  assert.equal(f.fee.value, 4.45);
  assert.equal(f.sellerProtection.status, 'ELIGIBLE');
});

test('case file from Transaction Search', () => {
  const f = fromSearch({
    transaction_info: { transaction_id: 'T1', transaction_status: 'S', transaction_amount: { value: '10.00', currency_code: 'USD' }, protection_eligibility: '01' },
    payer_info: { email_address: 'b@example.com', payer_name: { alternate_full_name: 'Bee' }, payer_status: 'Y' },
    shipping_info: { name: 'Bee', address: { line1: '2 Elm', city: 'Austin', state: 'TX', postal_code: '78701', country_code: 'US' } },
    cart_info: { item_details: [{ item_name: 'Mug', item_quantity: '2' }] }
  });
  assert.equal(f.status, 'COMPLETED');
  assert.equal(f.sellerProtection.status, 'ELIGIBLE');
  assert.equal(f.payer.accountStatus, 'VERIFIED');
  assert.equal(f.items[0].quantity, 2);
  assert.equal(formatAddress(null), '');
});

test('multipart body matches PayPal: JSON input part without filename, file part with filename', () => {
  const body = buildMultipart('B', [
    { name: 'input', value: '{"a":1}', contentType: 'application/json' },
    { name: 'evidence-file', filename: 'e.pdf', contentType: 'application/pdf', value: Buffer.from('%PDF') }
  ]).toString('utf8');
  assert.match(body, /--B\r\nContent-Disposition: form-data; name="input"\r\nContent-Type: application\/json\r\n\r\n\{"a":1\}\r\n/);
  assert.match(body, /name="evidence-file"; filename="e.pdf"\r\nContent-Type: application\/pdf/);
  assert.ok(body.endsWith('--B--\r\n'));
});
