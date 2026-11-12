/* DisputeShield frontend. Vanilla JS, hash router, AG Grid Community (CDN). Every number on screen comes from the server's PayPal and Gemini calls. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- icons (inline SVG, stroke = currentColor) ----------
  const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    home: P('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    shield: P('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.6 7.5 9.5 4.3-.9 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>'),
    card: P('<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h4"/>'),
    gear: P('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>'),
    refresh: P('<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4"/>'),
    search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    arrow: P('<path d="M7 17 17 7M8 7h9v9"/>'),
    calendar: P('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 3v3M16 3v3"/>'),
    spark: P('<path d="M12 3c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7z"/>'),
    file: P('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    bolt: P('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    check: P('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    alert: P('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
    menu: P('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    plus: P('<path d="M12 5v14M5 12h14"/>'),
    msg: P('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
    inbox: P('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>'),
    chart: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    pie: P('<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'),
    link: P('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
    lock: P('<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
    store: P('<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/>'),
    paypal: P('<path d="M7.5 20 9.5 5h6a4 4 0 0 1 0 8h-4l-1 7z"/>'),
    ai: P('<rect x="5" y="7" width="14" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9.5 15.5h5"/>'),
    trophy: P('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>')
  };
  const LOGO = '<svg class="mark" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="11" fill="#121512"/><path d="M18 7.5 10 10.6v5.9c0 5 3.4 9.4 8 10.5 4.6-1.1 8-5.5 8-10.5v-5.9z" fill="#D8F36A"/><path d="m14.2 17.8 2.6 2.6 5-5" fill="none" stroke="#121512" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SPARKLE = '<svg viewBox="0 0 24 24"><path d="M12 2c.6 5.4 3.6 8.4 9 9-5.4.6-8.4 3.6-9 9-.6-5.4-3.6-8.4-9-9 5.4-.6 8.4-3.6 9-9z" fill="currentColor"/></svg>';

  // ---------- state ----------
  const state = {
    config: null,
    route: { name: '', params: {} },
    disputes: null, payments: null, activity: null, status: null, stats: null,
    syncedAt: null, syncing: false,
    detail: null, caseId: null,
    grid: null, filter: 'all', query: '',
    busy: {}, drafts: {},
    editingRecord: false, confirmRefund: false,
    banner: ''
  };

  // ---------- formatting ----------
  function money(value, currency = 'USD') {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value || 0); }
    catch { return `${Number(value || 0).toFixed(2)} ${currency}`; }
  }
  const moneyOf = (m) => (m ? money(m.value, m.currency) : '');
  function shortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function relTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - Date.parse(iso);
    if (Number.isNaN(diff)) return '';
    const s = Math.round(diff / 1000);
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return shortDate(iso);
  }
  function dueInfo(d) {
    if (d.status === 'RESOLVED') return { text: 'Closed', cls: '', hours: Infinity };
    if (!d.dueDate) return { text: d.status === 'UNDER_REVIEW' ? 'With PayPal' : 'No deadline', cls: '', hours: Infinity };
    const hours = (Date.parse(d.dueDate) - Date.now()) / 3_600_000;
    if (Number.isNaN(hours)) return { text: '—', cls: '', hours: Infinity };
    if (hours <= 0) return { text: 'Overdue', cls: 'urgent', hours };
    if (hours < 24) return { text: `${Math.max(1, Math.round(hours))}h left`, cls: 'urgent', hours };
    if (hours < 48) return { text: `${Math.round(hours)}h left`, cls: 'soon', hours };
    return { text: `${Math.round(hours / 24)} days left`, cls: '', hours };
  }
  function statusInfo(d) {
    if (d.status === 'RESOLVED') {
      const code = (d.outcome && d.outcome.code) || '';
      if (code.includes('SELLER')) return { label: 'Won', cls: 'won', key: 'resolved' };
      if (code.includes('BUYER') || code.includes('REFUND') || code.includes('ACCEPTED')) return { label: 'Refunded', cls: 'lost', key: 'resolved' };
      if (code.includes('CANCEL')) return { label: 'Cancelled by buyer', cls: 'neutral', key: 'resolved' };
      return { label: 'Resolved', cls: 'neutral', key: 'resolved' };
    }
    if (d.status === 'WAITING_FOR_SELLER_RESPONSE') return { label: d.submitted ? 'More needed' : 'Needs response', cls: 'respond', key: 'respond' };
    if (d.status === 'UNDER_REVIEW') return { label: 'Under review', cls: 'review', key: 'review' };
    if (d.status === 'WAITING_FOR_BUYER_RESPONSE') return { label: 'Waiting on buyer', cls: 'neutral', key: 'review' };
    if (d.status === 'OPEN') return { label: 'Open inquiry', cls: 'open', key: 'open' };
    return { label: String(d.status || '').replace(/_/g, ' ').toLowerCase(), cls: 'neutral', key: 'review' };
  }
  const stageLabel = (s) => ({ INQUIRY: 'Inquiry', CHARGEBACK: 'Claim', PRE_ARBITRATION: 'Appeal', ARBITRATION: 'Arbitration' }[s] || (s || '').toLowerCase());
  const scoreColor = (s) => (s >= 70 ? '#1a9a52' : s >= 45 ? '#e3a008' : '#e0454b');
  const ACTION_TEXT = { FIGHT: 'Fight this dispute', REFUND: 'Refund instead of fighting', NEED_INFO: 'More information needed' };
  const EVIDENCE_LABELS = { PROOF_OF_FULFILLMENT: 'Proof of fulfilment (tracking)', PROOF_OF_REFUND: 'Proof of refund', OTHER: 'Other (written explanation)' };
  const SENT_LABELS = { ...EVIDENCE_LABELS, SUPPORTING_INFO: 'supporting information (PayPal is reviewing the case)' };
  const REASON_COLORS = ['#c4e83b', '#9fcdf2', '#f3a9b3', '#c9bbf2', '#f0d48f', '#a9e0b7'];
  const isSandbox = () => state.config && state.config.paypalEnv === 'sandbox';
  const isOpen = (d) => d.status !== 'RESOLVED';
  const anyBusy = () => Object.values(state.busy).some(Boolean);

  // ---------- toast & api ----------
  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, kind === 'bad' ? 8000 : 3800);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.debugId = data.debugId;
      err.status = res.status;
      if (res.status === 401 && data.auth) { state.config.authed = false; go('#/login'); }
      throw err;
    }
    return data;
  }
  const errText = (err) => err.message + (err.debugId ? ` (PayPal debug id ${err.debugId})` : '');

  // ---------- data loaders ----------
  async function loadDisputes() {
    const data = await api('/api/disputes');
    state.disputes = data.disputes || [];
    state.syncedAt = data.fetchedAt || new Date().toISOString();
    return state.disputes;
  }
  async function loadPayments() { state.payments = (await api('/api/payments')).payments || []; return state.payments; }
  async function loadActivity() { state.activity = (await api('/api/activity')).activity || []; return state.activity; }
  async function loadStatus() { state.status = await api('/api/status'); return state.status; }
  async function loadStats() { state.stats = await api('/api/stats'); return state.stats; }

  async function sync({ quiet = false } = {}) {
    if (state.syncing) return;
    state.syncing = true;
    renderSync();
    try {
      await Promise.all([loadDisputes(), loadPayments(), loadActivity()]);
      if (!quiet) toast('Synced with PayPal');
    } catch (err) {
      if (err.status !== 401) toast(errText(err), 'bad');
    } finally {
      state.syncing = false;
      renderSync();
      updateNavCounts();
    }
  }

  // ---------- router ----------
  const ROUTES = [
    [/^#?\/?$/, 'landing'],
    [/^#\/login$/, 'login'],
    [/^#\/dashboard$/, 'dashboard'],
    [/^#\/disputes$/, 'disputes'],
    [/^#\/disputes\/([^/]+)$/, 'case'],
    [/^#\/payments$/, 'payments'],
    [/^#\/settings$/, 'settings']
  ];
  const APP_PAGES = ['dashboard', 'disputes', 'case', 'payments', 'settings', 'notfound'];
  const SECTION_ANCHORS = ['#live', '#how', '#features', '#apis', '#faq'];

  function parseRoute() {
    const h = window.location.hash || '#/';
    for (const [re, name] of ROUTES) {
      const m = h.match(re);
      if (m) return { name, params: { id: m[1] ? decodeURIComponent(m[1]) : null } };
    }
    return { name: 'notfound', params: {} };
  }
  function go(hash) { if (window.location.hash === hash) render(); else window.location.hash = hash; }

  function render() {
    const prev = state.route.name;
    stopHeroFX();
    state.route = parseRoute();
    const r = state.route;
    if (state.grid && r.name !== 'disputes') { try { state.grid.destroy(); } catch { /* ignore */ } state.grid = null; }
    if (r.name !== 'case') { state.caseId = null; state.detail = null; }
    closeSide();

    if (APP_PAGES.includes(r.name)) {
      if (state.config.authRequired && !state.config.authed) return renderLogin();
      if (!state.config.paypalConfigured) return renderSetup();
      if (!$('.shell')) renderShell();
      setActiveNav(r.name);
      const page = $('#page');
      page.classList.remove('view');
      void page.offsetWidth;
      page.classList.add('view');
      if (prev !== r.name || r.name === 'case') window.scrollTo(0, 0);
      ({ dashboard: pageDashboard, disputes: pageDisputes, case: pageCase, payments: pagePayments, settings: pageSettings, notfound: pageNotFound })[r.name]();
      return undefined;
    }
    if (r.name === 'login') return renderLogin();
    window.scrollTo(0, 0);
    return renderLanding();
  }

  // ---------- shell ----------
  function navLink(name, href, icon, label) {
    return `<a href="${href}" data-nav="${name}">${icon}<span>${label}</span>${name === 'disputes' ? '<span class="count hidden" id="navCount"></span>' : ''}</a>`;
  }
  function renderShell() {
    const c = state.config;
    const initials = (c.storeName || 'DS').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    $('#root').innerHTML = `
      <div class="shell">
        <aside class="side" id="side">
          <div class="side-inner">
            <a class="brand" href="#/">${LOGO}<div><b>DisputeShield</b><small>for PayPal merchants</small></div></a>
            <div class="nav-label">Workspace</div>
            <nav class="nav" aria-label="Workspace">
              ${navLink('dashboard', '#/dashboard', I.home, 'Overview')}
              ${navLink('disputes', '#/disputes', I.shield, 'Disputes')}
              ${navLink('payments', '#/payments', I.card, 'Payments')}
              ${navLink('settings', '#/settings', I.gear, 'Connections')}
            </nav>
            <div class="nav-label">More</div>
            <nav class="nav" aria-label="More">
              <a href="#/">${I.spark}<span>Product tour</span></a>
              <a href="https://developer.paypal.com/docs/api/customer-disputes/v1/" target="_blank" rel="noopener">${I.link}<span>Disputes API docs</span></a>
            </nav>
            <div class="side-foot">
              <div class="promo">
                <b>${esc(c.storeName)}</b>
                <p>PayPal ${isSandbox() ? 'sandbox' : 'live'} · Gemini ${esc(c.aiModel || 'not set')}</p>
                ${isSandbox() ? `<button class="btn btn-lime btn-sm btn-block" data-act="new-payment">${I.plus}New payment</button>` : ''}
              </div>
            </div>
          </div>
        </aside>
        <div class="main">
          <header class="topbar">
            <button class="icon-btn menu-btn" data-act="menu" aria-label="Open menu">${I.menu}</button>
            <label class="search"><span class="sr-only">Search disputes</span>${I.search}<input class="input" id="globalSearch" type="search" placeholder="Search buyer, dispute ID, reason…  ( / )" autocomplete="off" /></label>
            <div class="spacer"></div>
            <button class="sync" id="syncBtn" title="Fetch the latest from PayPal">${I.refresh}<span id="syncText">Syncing…</span></button>
            <div class="avatar" title="${esc(c.storeName)}">${esc(initials)}</div>
          </header>
          <div id="banner"></div>
          <main id="page" class="view"></main>
        </div>
      </div>
      <nav class="tabbar" aria-label="Main">
        <a href="#/dashboard" data-nav="dashboard">${I.home}<span>Overview</span></a>
        <a href="#/disputes" data-nav="disputes">${I.shield}<span>Disputes</span></a>
        <a href="#/payments" data-nav="payments">${I.card}<span>Payments</span></a>
        <a href="#/settings" data-nav="settings">${I.gear}<span>Connect</span></a>
      </nav>`;
    if (state.banner) { $('#banner').innerHTML = state.banner; state.banner = ''; }
    if (c.liveWritesBlocked) $('#banner').insertAdjacentHTML('afterbegin', '<div class="banner bad"><div class="grow"><b>Live PayPal without a password</b>Set APP_PASSWORD on the server. Until then DisputeShield only reads; it will not submit evidence, messages or refunds.</div></div>');
    if (!c.aiConfigured) $('#banner').insertAdjacentHTML('afterbegin', '<div class="banner bad"><div class="grow"><b>Gemini is not configured</b>Set GEMINI_API_KEY on the server and restart it. Disputes still load from PayPal, but cases cannot be analysed.</div></div>');
    renderSync();
    updateNavCounts();
  }
  function setActiveNav(name) {
    const n = name === 'case' ? 'disputes' : name;
    $$('[data-nav]').forEach((a) => { const on = a.dataset.nav === n; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  function renderSync() {
    const btn = $('#syncBtn');
    if (!btn) return;
    btn.classList.toggle('spinning', state.syncing);
    $('#syncText').textContent = state.syncing ? 'Syncing…' : state.syncedAt ? `Synced ${relTime(state.syncedAt)}` : 'Sync now';
  }
  function updateNavCounts() {
    const el = $('#navCount');
    if (!el || !state.disputes) return;
    const n = state.disputes.filter(isOpen).length;
    el.textContent = n;
    el.classList.toggle('hidden', !n);
  }
  function openSide() { const s = $('#side'); if (!s) return; s.classList.add('open'); if (!$('.side-scrim')) document.body.insertAdjacentHTML('beforeend', '<div class="side-scrim" data-act="close-side"></div>'); }
  function closeSide() { const s = $('#side'); if (s) s.classList.remove('open'); const sc = $('.side-scrim'); if (sc) sc.remove(); }

  // ---------- reveal & count-up animations ----------
  let io = null;
  function animateIn(root = document) {
    const els = $$('.reveal:not(.in)', root);
    if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); triggerCharts(root); return; }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('in');
          triggerCharts(e.target);
          io.unobserve(e.target);
        }
      }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    }
    els.forEach((e, i) => { if (!e.style.getPropertyValue('--d')) e.style.setProperty('--d', `${Math.min(i, 8) * 70}ms`); io.observe(e); });
  }
  function triggerCharts(root) {
    $$('[data-count]', root).forEach((el) => countUp(el));
    $$('.bar .col', root).forEach((el) => requestAnimationFrame(() => el.classList.add('grown')));
    $$('svg.area', root).forEach((el) => requestAnimationFrame(() => el.classList.add('drawn')));
    $$('.donut circle[data-dash]', root).forEach((c) => requestAnimationFrame(() => { c.style.strokeDasharray = c.dataset.dash; }));
  }
  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const target = Number(el.dataset.count);
    const fmt = el.dataset.fmt;
    const cur = el.dataset.cur || 'USD';
    const show = (v) => { el.textContent = fmt === 'money' ? money(v, cur) : Math.round(v).toLocaleString('en-US'); };
    if (reduceMotion || !target) { show(target); return; }
    const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 900); show(target * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // ---------- landing ----------
  // PayPal's own dispute reason codes (lib/normalize.js maps every one of them).
  const HERO_WORDS = ['Item not received', 'Not as described', 'Unauthorised payment', 'Duplicate charge', 'Refund not processed', 'Incorrect amount', 'Cancelled subscription'];
  const orbitNode = (icon, cls, deg) => `<span class="node ${cls}" style="--a:${deg}deg"><i>${icon}</i></span>`;
  function heroRows(st) {
    if (!st) return Array.from({ length: 4 }, () => '<div class="wr sk-row"><span class="sk s-dot"></span><span class="sk s-line"></span><span class="sk s-amt"></span></div>').join('');
    if (!st.queue || !st.queue.length) return `<div class="wr-empty">${I.check}No disputes yet. New ones land here the moment PayPal sends them.</div>`;
    return st.queue.map((d, i) => {
      const si = statusInfo(d);
      return `<a class="wr" href="#/disputes/${encodeURIComponent(d.id)}" tabindex="-1" style="--i:${i}"><span class="st ${si.cls}"></span><span class="wr-main"><b>${esc(d.reasonLabel)}</b><small class="mono">${esc(d.id)}</small></span><span class="wr-amt">${esc(money(d.amount.value, d.amount.currency))}</span><span class="pill ${si.cls}">${esc(si.label)}</span></a>`;
    }).join('');
  }
  function heroFoot(st) {
    if (!st) return '<span class="sk s-foot"></span>';
    const cur = st.currency;
    const seg = (n, cls, label) => (n ? `<i class="${cls}" style="flex:${n}" title="${n} ${label}"></i>` : '');
    const total = st.won + st.refunded + st.open + (st.cancelled || 0);
    return `<div class="split">${total ? seg(st.won, 'won', 'won') + seg(st.refunded, 'lost', 'refunded') + seg(st.open, 'open', 'open') + seg(st.cancelled, 'neutral', 'cancelled') : '<i class="neutral" style="flex:1"></i>'}</div>
      <div class="nums"><div><small>At risk</small><b>${esc(money(st.atRisk, cur))}</b></div><div><small>Kept</small><b>${esc(money(st.kept, cur))}</b></div><div><small>Win rate</small><b>${st.winRate == null ? '—' : `${st.winRate}%`}</b></div></div>`;
  }
  function heroVerdict(st) {
    const l = st && st.latest;
    const ai = l && l.ai;
    const score = ai ? Math.max(0, Math.min(100, Number(ai.score) || 0)) : 0;
    return `<small>Gemini verdict${l ? ` · <span class="mono">${esc(l.id)}</span>` : ''}</small><div class="score"><div class="ring" style="--p:${score}"><div>${ai ? score : 'AI'}</div></div><div><b>${ai ? esc(ACTION_TEXT[ai.action] || ai.action) : st ? 'Analysed on arrival' : 'Loading…'}</b><br><small>Facts checked against PayPal</small></div></div>`;
  }
  const toastIcon = (k) => (k === 'ai' ? I.ai : k === 'success' ? I.check : I.bolt);
  function heroToast(st, i = 0) {
    const list = (st && st.recent) || [];
    if (!st) return '<span class="tt"><b>Loading…</b></span>';
    if (!list.length) return `<span class="ti">${I.bolt}</span><span class="tt"><b>Watching PayPal for new disputes</b><small>webhooks + a check every minute</small></span>`;
    const a = list[i % list.length];
    return `<span class="ti ${esc(a.kind)}">${toastIcon(a.kind)}</span><span class="tt"><b>${esc(a.text)}</b><small>${esc(relTime(a.at))}</small></span>`;
  }
  function heroDue(st) {
    if (!st) return `<span class="ic">${I.clock}</span><span class="dl"><small>Respond-by tracker</small><b>Loading…</b></span>`;
    const n = st.nextDue;
    if (!n) return `<span class="ic">${I.clock}</span><span class="dl"><small>Respond-by tracker</small><b>Nothing due right now</b></span>`;
    return `<span class="ic">${I.clock}</span><span class="dl"><small>Next reply due · ${esc(money(n.amount.value, n.amount.currency))}</small><b class="cd" data-due="${esc(n.dueDate)}">${esc(countdown(n.dueDate))}</b></span>`;
  }
  function countdown(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return 'due now';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, '0')).join(':');
    return d ? `${d}d ${hms}` : hms;
  }

  // Hero effects: rotating reason, live activity toast, countdown, cursor spotlight, tilt and magnetic buttons.
  // Everything is torn down by stopHeroFX() when the route changes.
  let heroOff = null;
  let heroToastAt = 0;
  function stopHeroFX() { if (heroOff) { heroOff(); heroOff = null; } }
  function initHeroFX() {
    stopHeroFX();
    const landing = $('.landing');
    const stage = $('#stage');
    const bg = $('.hero-bg');
    if (!landing || !stage || !bg) return;
    const timers = [];
    const offs = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); offs.push(() => el.removeEventListener(ev, fn, opt)); };

    // live countdown to the next PayPal respond-by date
    timers.push(setInterval(() => { const el = $('#heroDue .cd'); if (el) el.textContent = countdown(el.dataset.due); }, 1000));

    // rotating reason pill: its width follows the word
    const rot = $('#heroRot');
    const words = rot ? $$('.w', rot) : [];
    let wi = 0;
    const fit = () => { if (rot && words[wi]) rot.style.width = `${words[wi].offsetWidth}px`; };
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit).catch(() => {});
    on(window, 'resize', fit, { passive: true });
    if (!reduceMotion && words.length > 1) {
      timers.push(setInterval(() => {
        if (document.hidden) return;
        const cur = words[wi];
        wi = (wi + 1) % words.length;
        const nx = words[wi];
        cur.classList.remove('in'); cur.classList.add('out');
        nx.classList.remove('out'); nx.classList.add('in');
        fit();
        setTimeout(() => cur.classList.remove('out'), 520);
      }, 2400));
    }

    // live activity toast cycles through the real activity log
    if (!reduceMotion) {
      timers.push(setInterval(() => {
        const box = $('#heroToast');
        const list = (state.stats && state.stats.recent) || [];
        if (!box || document.hidden || list.length < 2) return;
        heroToastAt = (heroToastAt + 1) % list.length;
        box.classList.add('out');
        setTimeout(() => { box.innerHTML = heroToast(state.stats, heroToastAt); box.classList.remove('out'); }, 300);
      }, 4200));
    }

    // fresh numbers every minute while the page is open (webhooks push sooner, see onRemoteChange)
    timers.push(setInterval(() => { if (!document.hidden) loadStats().then(updateLandingLive).catch(() => {}); }, 60_000));

    const fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (fine && !reduceMotion) {
      let tx = 0; let ty = 0; let cx = 0; let cy = 0; let raf = 0;
      const step = () => {
        cx += (tx - cx) * 0.1; cy += (ty - cy) * 0.1;
        stage.style.setProperty('--px', cx.toFixed(4));
        stage.style.setProperty('--py', cy.toFixed(4));
        raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(step) : 0;
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
      on(window, 'pointermove', (e) => {
        const r = bg.getBoundingClientRect();
        if (e.clientY > r.bottom || e.clientY < r.top) { if (tx || ty) { tx = 0; ty = 0; kick(); } bg.classList.remove('lit'); return; }
        bg.classList.add('lit');
        bg.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
        bg.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
        const s = stage.getBoundingClientRect();
        tx = Math.max(-1, Math.min(1, (e.clientX - (s.left + s.width / 2)) / (s.width / 1.4)));
        ty = Math.max(-1, Math.min(1, (e.clientY - (s.top + s.height / 2)) / (s.height / 1.4)));
        kick();
      }, { passive: true });
      on(document.documentElement, 'pointerleave', () => { tx = 0; ty = 0; kick(); bg.classList.remove('lit'); });
      $$('.magnet', landing).forEach((b) => {
        on(b, 'pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.translate = `${(((e.clientX - r.left) / r.width) - 0.5) * 14}px ${(((e.clientY - r.top) / r.height) - 0.5) * 10}px`; });
        on(b, 'pointerleave', () => { b.style.translate = ''; });
      });
      offs.push(() => { if (raf) cancelAnimationFrame(raf); });
    }
    heroOff = () => { timers.forEach(clearInterval); offs.forEach((f) => f()); };
  }

  function renderLanding() {
    const c = state.config;
    const st = state.stats;
    const host = window.location.host || 'disputeshield';
    const marquee = ['PayPal Disputes API', 'Orders v2', 'Payments v2', 'Transaction Search', 'Webhooks', 'Google Gemini', 'AG Grid', 'Render', 'Evidence PDF', 'Human approval'];
    const mq = [...marquee, ...marquee].map((m) => `<span class="item"><span class="star">✦</span>${esc(m)}</span>`).join('');
    const signedIn = !c.authRequired || c.authed;
    $('#root').innerHTML = `
      <div class="landing">
        <div class="blob b1" aria-hidden="true"></div><div class="blob b2" aria-hidden="true"></div><div class="blob b3" aria-hidden="true"></div>
        <header class="lnav">
          <a class="brand" href="#/">${LOGO}<div><b>DisputeShield</b><small>for PayPal merchants</small></div></a>
          <nav class="links" aria-label="Sections">
            <a href="#how" data-scroll="how">How it works</a>
            <a href="#features" data-scroll="features">Product</a>
            <a href="#apis" data-scroll="apis">PayPal APIs</a>
            <a href="#faq" data-scroll="faq">FAQ</a>
          </nav>
          <div class="right"><a class="btn btn-ink" href="#/dashboard">${signedIn ? 'Open dashboard' : 'Sign in'} <span class="arrow">→</span></a></div>
        </header>

        <div class="hero-bg" aria-hidden="true"><div class="grid"></div><div class="grid hi"></div><div class="spot"></div></div>
        <section class="wrap hero">
          <div class="hero-copy">
            <a class="live reveal" href="#live" data-scroll="live"><span class="badge"><i class="ping"></i>${c.paypalConfigured ? `PayPal ${isSandbox() ? 'sandbox' : 'live'}` : 'Setup needed'}</span><span id="liveLine">Loading live numbers…</span><span class="chev" aria-hidden="true">→</span></a>
            <h1 class="reveal">Win the PayPal disputes <span class="soft">you should</span> <span class="hl">never lose.</span></h1>
            <p class="rotline reveal"><span>Handles every PayPal reason:</span> <span class="rot" id="heroRot">${HERO_WORDS.map((w, i) => `<span class="w${i ? '' : ' in'}">${esc(w)}</span>`).join('')}</span></p>
            <p class="lead reveal">DisputeShield reads every dispute on your PayPal account, builds the case from PayPal's own record of the payment, lets Gemini draft the response, and sends it with an evidence PDF after one click from you.</p>
            <div class="ctas reveal">
              <a class="btn btn-ink btn-lg magnet shine" href="#/dashboard">Open your dispute queue <span class="arrow">→</span></a>
              <button class="btn btn-white btn-lg magnet" data-scroll="how">See how it works</button>
            </div>
            <div class="proof reveal">
              <div><b id="proofCases">—</b><span>disputes handled</span></div>
              <div><b id="proofWon">—</b><span>won for the merchant</span></div>
              <div><b id="proofKept">—</b><span>money kept</span></div>
            </div>
          </div>
          <div class="stage reveal" id="stage" aria-hidden="true">
            <div class="stage-3d">
              <div class="disc"></div>
              <div class="orbit o1">${orbitNode(I.paypal, 'pp', 20)}${orbitNode(I.ai, 'gm', 200)}</div>
              <div class="orbit o2">${orbitNode(I.bolt, 'wh', 75)}${orbitNode(I.file, 'pdf', 195)}${orbitNode(I.shield, 'sh', 315)}</div>
              <span class="sparkle s1">${SPARKLE}</span><span class="sparkle s2">${SPARKLE}</span><span class="sparkle s3">${SPARKLE}</span>
              <div class="layer win float-card">
                <div class="win-bar"><i></i><i></i><i></i><span class="url">${esc(host)}/#/disputes</span></div>
                <div class="win-body">
                  <div class="win-head"><b>Dispute queue</b><span class="win-live"><span class="dot good pulse"></span>Live from PayPal</span></div>
                  <div class="win-rows" id="winRows">${heroRows(st)}</div>
                  <div class="win-foot" id="winFoot">${heroFoot(st)}</div>
                  <div class="scan"></div>
                </div>
              </div>
              <div class="layer float-card fc-toast"><div class="toast-head"><span class="ping"></span>Live activity</div><div class="toast-body" id="heroToast">${heroToast(st)}</div></div>
              <div class="layer float-card fc-verdict beam" id="heroVerdict">${heroVerdict(st)}</div>
              <div class="layer float-card fc-chip fc-deadline" id="heroDue">${heroDue(st)}</div>
            </div>
          </div>
        </section>

        <div class="marquee" aria-label="Built with"><div class="track">${mq}</div></div>

        <section class="lsec live-sec" id="live">
          <div class="wrap">
            <span class="kicker reveal"><span class="dot good pulse"></span> Live from the database</span>
            <h2 class="reveal">What DisputeShield has done so far.</h2>
            <p class="sub reveal" id="liveSub">Every number below is read from DisputeShield's database and PayPal, not typed in.</p>
            <div class="stat-grid">
              <div class="card stat-card reveal"><span class="ico">${I.shield}</span><b id="lsCases">—</b><span>disputes handled</span></div>
              <div class="card stat-card lime reveal"><span class="ico">${I.trophy}</span><b id="lsWin">—</b><span>win rate on decided cases</span></div>
              <div class="card stat-card reveal"><span class="ico">${I.card}</span><b id="lsKept">—</b><span>kept by the merchant</span></div>
              <div class="card stat-card reveal"><span class="ico">${I.ai}</span><b id="lsAi">—</b><span>Gemini analyses</span></div>
              <div class="card stat-card reveal"><span class="ico">${I.file}</span><b id="lsSent">—</b><span>responses sent to PayPal</span></div>
              <div class="card stat-card reveal"><span class="ico">${I.clock}</span><b id="lsSpeed">—</b><span>average AI analysis time</span></div>
            </div>
            <div class="card live-feed reveal"><div class="card-head"><div class="card-title"><span class="ico">${I.bolt}</span>Latest activity</div><span class="muted small" id="lsUpdated"></span></div><div class="card-body"><ul class="feed" id="lsFeed"><li class="muted small">Loading…</li></ul></div></div>
            <p class="hint" id="lsNote"></p>
          </div>
        </section>

        <section class="lsec" id="how">
          <div class="wrap">
            <span class="kicker reveal">✦ How it works</span>
            <h2 class="reveal">From a new PayPal dispute to a submitted case in minutes.</h2>
            <p class="sub reveal">No exports, no copy and paste. Every step uses PayPal's own APIs, and nothing is sent without your click.</p>
            <div class="flow">
              <div class="card fstep hover reveal"><span class="no">01</span><div class="ic">${I.inbox}</div><h3>Dispute arrives</h3><p>A PayPal webhook or the one-minute check brings it into your queue.</p></div>
              <div class="card fstep hover reveal"><span class="no">02</span><div class="ic">${I.paypal}</div><h3>Case built from PayPal</h3><p>Capture, order, buyer, ship-to address, items and tracking, read straight from PayPal.</p></div>
              <div class="card fstep hover reveal"><span class="no">03</span><div class="ic">${I.ai}</div><h3>Gemini drafts it</h3><p>Fight, refund or ask for more; the evidence type; the response; every fact it relied on.</p></div>
              <div class="card fstep hover reveal"><span class="no">04</span><div class="ic">${I.check}</div><h3>You approve</h3><p>Edit the draft, attach the evidence PDF, and submit to PayPal with one click.</p></div>
            </div>
            <div class="rotor" aria-hidden="true">
              <svg class="text" viewBox="0 0 100 100"><defs><path id="circ" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0"/></defs><text font-size="9" font-weight="600" letter-spacing="2.2" fill="#121512"><textPath href="#circ" textLength="236" lengthAdjust="spacing">DISPUTES IN · CASES OUT · </textPath></text></svg>
              <a class="core" href="#/dashboard" tabindex="-1">↘</a>
            </div>
          </div>
        </section>

        <section class="lsec" id="features">
          <div class="wrap">
            <span class="kicker reveal">✦ Product</span>
            <h2 class="reveal">Everything a small seller needs to answer PayPal on time.</h2>
            <div class="bento">
              <div class="card hover b-a reveal">
                <h3>A queue ranked by deadline</h3>
                <p>Money at risk, cases due within 48 hours, what is waiting on you, and every AI verdict at a glance, in an AG Grid table you can sort and search.</p>
                <div class="mini-chips"><span class="pill respond">Needs response</span><span class="pill review">Under review</span><span class="pill open">Open inquiry</span><span class="pill won">Won</span></div>
              </div>
              <div class="card lime hover b-b reveal"><h3>Human approval, always</h3><p>Gemini only drafts. Evidence, messages and refunds go to PayPal only when you click.</p></div>
              <div class="card hover b-c reveal"><h3>Evidence PDF</h3><p>PayPal's facts, your fulfilment record and your statement in one document, attached to the submission.</p></div>
              <div class="card hover b-d reveal"><h3>Facts you can check</h3><p>Every claim in the draft shows as a chip; PayPal's verified data is kept apart from what you typed.</p></div>
              <div class="card ink b-e reveal" id="apis">
                <h3>Real PayPal APIs</h3>
                <div class="api-list"><span>/v1/customer/disputes</span><span>/provide-evidence</span><span>/provide-supporting-info</span><span>/v2/checkout/orders</span><span>/v2/payments/captures</span><span>/v1/notifications/webhooks</span></div>
              </div>
            </div>
          </div>
        </section>

        <section class="lsec" id="faq">
          <div class="wrap">
            <span class="kicker reveal">✦ FAQ</span>
            <h2 class="reveal">Questions merchants ask.</h2>
            <div class="faq">
              <details class="reveal"><summary>Does anything reach PayPal without my approval?</summary><p>No. The AI writes a draft. Evidence, buyer messages and refunds are sent only when you click Approve, Send or Confirm refund.</p></details>
              <details class="reveal"><summary>Where do the case facts come from?</summary><p>From PayPal itself: the capture, its order (payer, ship-to address, items, tracking) and, for other payments, Transaction Search. You add what PayPal cannot know, like delivery proof.</p></details>
              <details class="reveal"><summary>What if the case is weak or the AI is unsure?</summary><p>It says NEED_INFO and lists what is missing, or REFUND when fighting would only cost you the dispute fee. You decide.</p></details>
              <details class="reveal"><summary>Does it work with live PayPal?</summary><p>Yes: point PAYPAL_BASE_URL at the live API and set an APP_PASSWORD. Sandbox-only tools hide themselves on live accounts.</p></details>
            </div>
          </div>
        </section>

        <section class="wrap" style="padding-bottom:12px">
          <div class="cta-band reveal">
            <div><h2>Stop losing disputes to the deadline.</h2><p>Your queue is connected to PayPal ${isSandbox() ? 'sandbox' : 'live'}. Open it and let Gemini draft the first case.</p></div>
            <div class="ctas"><a class="btn btn-lime btn-lg" href="#/dashboard">Open dashboard <span class="arrow">→</span></a><a class="btn btn-white btn-lg" href="#/settings">Check connections</a></div>
          </div>
          <footer class="lfoot"><span>DisputeShield · built on PayPal REST APIs and Google Gemini · an independent tool, not made by PayPal</span><span>MIT licensed</span></footer>
        </section>
      </div>`;
    [['#winRows', heroRows(st)], ['#winFoot', heroFoot(st)], ['#heroVerdict', heroVerdict(st)], ['#heroDue', heroDue(st)]].forEach(([sel, html]) => { const el = $(sel); if (el) el.dataset.sig = html; });
    animateIn($('#root'));
    initHeroFX();
    if (state.stats) updateLandingLive();
    loadStats().then(() => { if (state.route.name === 'landing') updateLandingLive(); }).catch(() => { const l = $('#liveLine'); if (l) l.textContent = 'Live numbers are unavailable right now'; });
  }

  // Patch the live numbers in place, so late data never re-renders the page under the reader.
  function setCount(id, value, fmt, cur) {
    const el = $(id);
    if (!el) return;
    el.dataset.count = value;
    if (fmt) el.dataset.fmt = fmt;
    if (cur) el.dataset.cur = cur;
    delete el.dataset.done;
    countUp(el);
  }
  function updateLandingLive() {
    const st = state.stats;
    if (!st) return;
    const line = $('#liveLine');
    if (line) line.textContent = st.cases ? `${st.cases} dispute${st.cases === 1 ? '' : 's'} handled · ${st.won} won · ${st.open} open now` : 'Connected and watching for new disputes';
    setCount('#proofCases', st.cases);
    setCount('#proofWon', st.won);
    setCount('#proofKept', st.kept, 'money', st.currency);
    setCount('#lsCases', st.cases);
    const win = $('#lsWin'); if (win) win.textContent = st.winRate == null ? '—' : `${st.winRate}%`;
    setCount('#lsKept', st.kept, 'money', st.currency);
    setCount('#lsAi', st.analyses);
    setCount('#lsSent', st.responses);
    const sp = $('#lsSpeed'); if (sp) sp.textContent = st.avgAiSeconds == null ? '—' : `${st.avgAiSeconds}s`;
    const up = $('#lsUpdated'); if (up) up.textContent = `${st.database === 'supabase' ? 'Supabase' : 'Local database'} · updated ${relTime(st.updatedAt)}`;
    const feed = $('#lsFeed');
    if (feed) feed.innerHTML = st.recent.length ? st.recent.map((a) => `<li><span class="fi ${esc(a.kind)}">${a.kind === 'ai' ? I.ai : a.kind === 'success' ? I.check : a.kind === 'warn' ? I.alert : I.clock}</span><div><b class="fw4">${esc(a.text)}</b><time>${esc(relTime(a.at))}</time></div></li>`).join('') : '<li class="muted small">No activity yet.</li>';
    const note = $('#lsNote');
    if (note) note.textContent = `Every case here is a real PayPal ${isSandbox() ? 'sandbox ' : ''}dispute, read from PayPal's API and kept in ${st.database === 'supabase' ? 'Supabase' : 'the local database'}.`;
    // hero stage: only touch what changed, so nothing flickers on a refresh
    const patch = (sel, html) => { const el = $(sel); if (el && el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; } };
    patch('#winRows', heroRows(st));
    patch('#winFoot', heroFoot(st));
    patch('#heroVerdict', heroVerdict(st));
    patch('#heroDue', heroDue(st));
    const toast = $('#heroToast');
    if (toast) { if (heroToastAt >= (st.recent || []).length) heroToastAt = 0; toast.innerHTML = heroToast(st, heroToastAt); }
  }

  // ---------- login / setup ----------
  function renderLogin() {
    $('#root').innerHTML = `<div class="center-page"><form class="card setup-card view" id="loginForm">
        <a class="brand" href="#/">${LOGO}<div><b>DisputeShield</b><small>for PayPal merchants</small></div></a>
        <h2>Sign in</h2>
        <p class="muted">This server can submit evidence and refunds on a PayPal account, so it is password protected.</p>
        <label class="field">Password<input class="input" type="password" name="password" autocomplete="current-password" required autofocus /></label>
        <button class="btn btn-ink btn-lg btn-block" type="submit">Sign in <span class="arrow">→</span></button>
        <a class="link small" href="#/">Back to the product tour</a>
      </form></div>`;
  }
  function renderSetup() {
    const c = state.config;
    const missing = [!c.paypalConfigured && 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET', !c.aiConfigured && 'GEMINI_API_KEY'].filter(Boolean);
    $('#root').innerHTML = `<div class="center-page"><div class="card setup-card view">
        <a class="brand" href="#/">${LOGO}<div><b>DisputeShield</b><small>for PayPal merchants</small></div></a>
        <h2>Finish the server setup</h2>
        <p class="muted">DisputeShield works only on real PayPal data. Set ${esc(missing.join(' and '))} in <span class="mono">.env</span> (or your Render environment) and restart the server.</p>
        <ol class="muted small"><li>PayPal: developer.paypal.com › Apps &amp; Credentials › your app. Tick <b>Customer disputes</b> and <b>Transaction search</b>.</li><li>Gemini: aistudio.google.com › Get API key.</li></ol>
        <button class="btn btn-white" data-act="reload">Check again</button>
      </div></div>`;
  }

  // ---------- dashboard ----------
  const skeletonCards = (n = 3, cls = 'col-4') => Array.from({ length: n }, () => `<div class="card card-pad ${cls}"><div class="sk" style="height:18px;width:40%"></div><div class="sk" style="height:140px;margin-top:16px"></div></div>`).join('');

  async function pageDashboard() {
    const page = $('#page');
    const c = state.config;
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    page.innerHTML = `
      <div class="page-head">
        <div><span class="eyebrow">${esc(today)}</span><h1>${greet}, ${esc(c.storeName)}</h1><p>Your PayPal disputes, ranked by what needs you first.</p></div>
        <div class="actions"><button class="btn btn-white" data-act="analyze-all" id="analyzeAllBtn">${I.ai}Analyse all open</button><a class="btn btn-ink" href="#/disputes">Open queue <span class="arrow">→</span></a></div>
      </div>
      <div class="grid-dash" id="dash">${skeletonCards(3)}</div>`;
    if (!state.disputes || !state.payments || !state.activity) {
      try { await Promise.all([state.disputes ? 0 : loadDisputes(), state.payments ? 0 : loadPayments(), state.activity ? 0 : loadActivity()]); }
      catch (err) { if (err.status !== 401 && $('#dash')) $('#dash').innerHTML = `<div class="col-12 banner bad"><div class="grow"><b>Could not load from PayPal</b>${esc(errText(err))}</div><button class="btn btn-white btn-sm" data-act="sync">Retry</button></div>`; return; }
      renderSync(); updateNavCounts();
    }
    if (state.route.name !== 'dashboard') return;
    drawDashboard();
  }

  function drawDashboard() {
    if (!$('#dash')) return;
    const list = state.disputes || [];
    const open = list.filter(isOpen);
    const cur = (list[0] && list[0].amount.currency) || state.config.currency || 'USD';
    const atRisk = open.reduce((s, d) => s + (d.amount.value || 0), 0);
    const urgent = open.filter((d) => dueInfo(d).hours < 48).length;
    const needs = open.filter((d) => d.status === 'WAITING_FOR_SELLER_RESPONSE' && !d.submitted).length;
    const resolved = list.filter((d) => !isOpen(d));
    const won = resolved.filter((d) => d.outcome && d.outcome.code.includes('SELLER'));
    const kept = won.reduce((s, d) => s + d.amount.value, 0);

    // reasons donut
    const byReason = {};
    for (const d of list) byReason[d.reasonLabel] = (byReason[d.reasonLabel] || 0) + 1;
    const reasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
    const total = list.length;
    const R = 70;
    const C = 2 * Math.PI * R;
    let acc = 0;
    const gap = reasons.length > 1 ? 10 : 0;
    const segs = reasons.map(([, n], i) => {
      const len = Math.max(0.01, (n / total) * C - gap);
      const seg = `<circle cx="90" cy="90" r="${R}" stroke="${REASON_COLORS[i % REASON_COLORS.length]}" style="stroke-dasharray:0 ${C.toFixed(1)}" data-dash="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${(-acc).toFixed(1)}"/>`;
      acc += (n / total) * C;
      return seg;
    }).join('');

    // money disputed per day, last 14 days
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i)); return d; });
    const perDay = days.map((day) => list.filter((d) => { const t = new Date(d.createdAt); return t >= day && t < new Date(day.getTime() + 86_400_000); }).reduce((s, d) => s + d.amount.value, 0));
    const maxDay = Math.max(1, ...perDay);
    const W = 640; const H = 190; const padL = 34; const padB = 24; const padT = 14;
    const xs = (i) => padL + (i * (W - padL - 8)) / (days.length - 1);
    const ys = (v) => padT + (1 - v / maxDay) * (H - padT - padB);
    const pts = perDay.map((v, i) => [xs(i), ys(v)]);
    const path = pts.map((p, i) => {
      if (!i) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      const prev = pts[i - 1];
      const cx = (prev[0] + p[0]) / 2;
      return `C${cx.toFixed(1)},${prev[1].toFixed(1)} ${cx.toFixed(1)},${p[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    }).join(' ');
    const area = `${path} L${xs(days.length - 1)},${H - padB} L${padL},${H - padB} Z`;
    const ticks = [0, 0.5, 1].map((f) => ({ y: ys(maxDay * f), v: maxDay * f }));
    const peakI = perDay.indexOf(Math.max(...perDay));
    const sumDays = perDay.reduce((a, b) => a + b, 0);

    const scored = list.filter((d) => d.ai).sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0)).slice(-7);
    const topScore = Math.max(0, ...scored.map((d) => d.ai.score));
    const deadlines = [...open].sort((a, b) => dueInfo(a).hours - dueInfo(b).hours).slice(0, 5);
    const acts = (state.activity || []).slice(0, 7);
    const pays = (state.payments || []).filter((p) => p.captureId).slice(0, 4);

    $('#dash').innerHTML = `
      <section class="card col-5 reveal overview-card">
        <div class="hello">
          <div class="orb" aria-hidden="true"></div>
          <div class="hello-top"><div class="card-title"><span class="ico">${I.pie}</span>Overview</div><span class="muted small">Live from PayPal</span></div>
          <div class="kpis two">
            <div class="kpi hl"><div class="lbl">Money at risk</div><div class="val" data-count="${atRisk}" data-fmt="money" data-cur="${esc(cur)}">${money(atRisk, cur)}</div><div class="foot"><span>${open.length} open case${open.length === 1 ? '' : 's'}</span></div></div>
            <div class="kpi ${urgent ? 'alert' : ''}"><div class="lbl">Due within 48 h</div><div class="val" data-count="${urgent}">${urgent}</div><div class="foot"><span>${urgent ? 'Respond first' : 'Nothing urgent'}</span></div></div>
            <div class="kpi"><div class="lbl">Waiting on you</div><div class="val" data-count="${needs}">${needs}</div><div class="foot"><span>Evidence not sent</span></div></div>
            <div class="kpi"><div class="lbl">Won</div><div class="val">${won.length}<span class="of"> / ${resolved.length}</span></div><div class="foot"><span>${money(kept, cur)} kept</span></div></div>
          </div>
        </div>
      </section>

      <section class="card col-4 reveal">
        <div class="card-head"><div class="card-title"><span class="ico">${I.calendar}</span>Upcoming deadlines</div><a class="icon-btn sm" href="#/disputes" aria-label="Open the dispute queue">${I.arrow}</a></div>
        <div class="card-body"><div class="list">${deadlines.length ? deadlines.map((d) => { const x = dueInfo(d); return `<a class="list-row" href="#/disputes/${encodeURIComponent(d.id)}"><div><b>${esc(d.buyer.name || 'PayPal buyer')}</b><div class="sub">${esc(d.reasonLabel)} · ${esc(money(d.amount.value, d.amount.currency))}</div></div><div class="right"><span class="due ${x.cls}">${esc(x.text)}</span></div></a>`; }).join('') : `<div class="empty-mini">${I.check}No open disputes. New ones appear here automatically.</div>`}</div></div>
      </section>

      <section class="card col-3 reveal">
        <div class="card-head"><div class="card-title"><span class="ico">${I.pie}</span>By reason</div></div>
        <div class="card-body">${total ? `<div class="donut-wrap col">
            <div class="donut"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="${R}" stroke="#eef1ea"/>${segs}</svg><div class="center"><div><b data-count="${total}">${total}</b><span>dispute${total === 1 ? '' : 's'}</span></div></div></div>
            <div class="legend">${reasons.map(([label, n], i) => `<div><i style="background:${REASON_COLORS[i % REASON_COLORS.length]}"></i>${esc(label)}<b>${n}</b></div>`).join('')}</div>
          </div>` : `<div class="empty-mini">${I.pie}Reasons show up once PayPal reports a dispute.</div>`}</div>
      </section>

      <section class="card col-7 wide reveal">
        <div class="card-head"><div class="card-title"><span class="ico">${I.chart}</span>Money disputed · last 14 days</div><span class="chip">${esc(money(sumDays, cur))} total</span></div>
        <div class="card-body">
          <svg class="area" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="--len:1500" role="img" aria-label="Money disputed per day over the last 14 days">
            <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4e83b" stop-opacity=".55"/><stop offset="1" stop-color="#c4e83b" stop-opacity="0"/></linearGradient></defs>
            ${ticks.map((t) => `<line class="grid-line" x1="${padL}" x2="${W - 8}" y1="${t.y.toFixed(1)}" y2="${t.y.toFixed(1)}"/><text class="axis" x="0" y="${(t.y + 4).toFixed(1)}">${t.v >= 1000 ? `${Math.round(t.v / 100) / 10}k` : Math.round(t.v)}</text>`).join('')}
            <path class="fill" d="${area}" fill="url(#ag)"/>
            <path class="stroke" d="${path}"/>
            ${perDay[peakI] > 0 ? `<circle class="pt" cx="${pts[peakI][0].toFixed(1)}" cy="${pts[peakI][1].toFixed(1)}" r="5"/>` : ''}
            ${days.map((d, i) => ((i % 3 === 0 && i < days.length - 2) || i === days.length - 1 ? `<text class="axis" x="${xs(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === days.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}">${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}</text>` : '')).join('')}
          </svg>
        </div>
      </section>

      <section class="card col-5 reveal">
        <div class="card-head"><div class="card-title"><span class="ico">${I.ai}</span>AI strength · recent cases</div><span class="muted small">${scored.length ? `avg ${Math.round(scored.reduce((t, d) => t + d.ai.score, 0) / scored.length)}/100` : ''}</span></div>
        <div class="card-body">${scored.length ? `<div class="bars">${scored.map((d, i) => `<a class="bar" href="#/disputes/${encodeURIComponent(d.id)}" title="${esc(d.id)} · ${esc(d.ai.action)} ${d.ai.score}/100"><div class="col ${d.ai.score === topScore ? 'hl' : ''}" style="height:${Math.max(6, d.ai.score)}%;--d:${i * 90}ms">${d.ai.score === topScore ? `<span class="bubble">${d.ai.score}</span>` : ''}</div><span>${esc((d.buyer.name || d.id).split(' ')[0])}</span></a>`).join('')}</div>` : `<div class="empty-mini">${I.ai}Gemini scores each open case. Analyse one to see it here.<div class="mt12"><a class="btn btn-white btn-sm" href="#/disputes">Go to queue</a></div></div>`}</div>
      </section>

      <section class="card col-7 reveal">
        <div class="card-head"><div class="card-title"><span class="ico">${I.bolt}</span>Recent activity</div></div>
        <div class="card-body">${acts.length ? `<ul class="feed">${acts.map((a) => `<li><span class="fi ${esc(a.kind)}">${a.kind === 'ai' ? I.ai : a.kind === 'success' ? I.check : a.kind === 'warn' ? I.alert : I.clock}</span><div><a href="#/disputes/${encodeURIComponent(a.disputeId)}"><b class="fw4">${esc(a.text)}</b></a><time>${esc(a.disputeId)} · ${esc(relTime(a.at))}</time></div></li>`).join('')}</ul>` : `<div class="empty-mini">${I.clock}Analyses, submissions and PayPal events show up here.</div>`}</div>
      </section>

      <section class="card col-5 reveal">
        <div class="card-head"><div class="card-title"><span class="ico">${I.card}</span>Recent payments</div><a class="icon-btn sm" href="#/payments" aria-label="Open payments">${I.arrow}</a></div>
        <div class="card-body"><div class="list">${pays.length ? pays.map((p) => `<a class="list-row" href="${p.disputeId ? `#/disputes/${encodeURIComponent(p.disputeId)}` : '#/payments'}"><div><b>${esc(p.product || 'Order')}</b><div class="sub">${esc(p.buyerEmail || '')} · ${esc(relTime(p.capturedAt || p.createdAt))}</div></div><div class="right"><b>${esc(money(p.amount, p.currency))}</b><div class="sub">${p.disputeId ? 'Disputed' : 'Captured'}</div></div></a>`).join('') : `<div class="empty-mini">${I.card}Payments you take through DisputeShield show here.${isSandbox() ? '<div class="mt12"><button class="btn btn-lime btn-sm" data-act="new-payment">New sandbox payment</button></div>' : ''}</div>`}</div></div>
      </section>`;
    const btn = $('#analyzeAllBtn');
    if (btn && !state.busy.all) btn.disabled = !open.some((d) => !d.ai) || !state.config.aiConfigured;
    animateIn($('#dash'));
  }

  // ---------- disputes ----------
  const FILTERS = [['all', 'All'], ['respond', 'Needs response'], ['review', 'Under review'], ['open', 'Open inquiry'], ['resolved', 'Resolved']];
  const caseCell = (d) => `<div class="cell-case"><b>${esc(d.buyer.name || d.buyer.email || 'PayPal buyer')}</b><span>${esc(d.id)}${d.stage ? ` · ${esc(stageLabel(d.stage))}` : ''}</span></div>`;
  const statusCell = (d) => { const s = statusInfo(d); return `<span class="pill ${s.cls}">${esc(s.label)}</span>`; };
  const dueCell = (d) => { const x = dueInfo(d); return `<span class="due ${x.cls}">${esc(x.text)}</span>`; };
  const aiCell = (d) => (d.ai
    ? `<div class="ai-cell"><div class="meter"><i style="width:${Number(d.ai.score) || 0}%;background:${scoreColor(d.ai.score)}"></i></div><span class="tag ${esc(d.ai.action)}">${esc(d.ai.action.replace('_', ' '))}</span></div>`
    : (d.status === 'RESOLVED' ? '<span class="muted small">—</span>' : '<span class="link-cta">Analyse →</span>'));

  function filtered() {
    const q = (state.query || '').toLowerCase().trim();
    return (state.disputes || []).filter((d) => (state.filter === 'all' || statusInfo(d).key === state.filter) && (!q || `${d.buyer.name} ${d.buyer.email} ${d.id} ${d.reasonLabel} ${d.transactionId}`.toLowerCase().includes(q)));
  }

  async function pageDisputes() {
    const page = $('#page');
    page.innerHTML = `
      <div class="page-head">
        <div><div class="crumbs"><a href="#/dashboard">Overview</a>›<span>Disputes</span></div><h1>Dispute queue</h1><p>Every PayPal dispute on your account, open cases first, nearest deadline first.</p></div>
        <div class="actions"><a class="btn btn-white" href="/api/disputes.csv" download>${I.file}Export CSV</a><button class="btn btn-white" data-act="analyze-all" id="analyzeAllBtn">${I.ai}Analyse all open</button>${isSandbox() ? `<button class="btn btn-ink" data-act="new-payment">${I.plus}New sandbox payment</button>` : ''}</div>
      </div>
      <section class="card queue-card">
        <div class="toolbar">
          <div class="seg" role="tablist" aria-label="Filter by status" id="seg"></div>
          <label class="search"><span class="sr-only">Search the queue</span>${I.search}<input class="input" id="qSearch" type="search" placeholder="Search buyer, ID, reason" value="${esc(state.query)}" /></label>
        </div>
        <div id="grid" class="grid-host"><div style="padding:18px"><div class="sk" style="height:48px"></div><div class="sk" style="height:48px;margin-top:10px"></div><div class="sk" style="height:48px;margin-top:10px"></div></div></div>
        <div id="empty" class="empty hidden"></div>
      </section>`;
    if (!state.disputes) {
      try { await loadDisputes(); renderSync(); updateNavCounts(); }
      catch (err) { if (err.status !== 401 && $('#grid')) $('#grid').innerHTML = `<div class="empty"><h3>Could not load disputes from PayPal</h3><p>${esc(errText(err))}</p><button class="btn btn-white" data-act="sync">Retry</button></div>`; return; }
    }
    if (state.route.name !== 'disputes') return;
    $('#grid').innerHTML = '';
    state.grid = initGrid();
    drawDisputes();
  }

  function drawSeg() {
    const list = state.disputes || [];
    const counts = { all: list.length };
    for (const d of list) { const k = statusInfo(d).key; counts[k] = (counts[k] || 0) + 1; }
    const seg = $('#seg');
    if (seg) seg.innerHTML = FILTERS.map(([k, label]) => `<button class="${state.filter === k ? 'active' : ''}" data-filter="${k}" role="tab" aria-selected="${state.filter === k}">${label}<span class="n">${counts[k] || 0}</span></button>`).join('');
  }

  function drawDisputes() {
    if (state.route.name !== 'disputes' || !$('#grid')) return;
    drawSeg();
    const rows = filtered();
    const all = state.disputes || [];
    const empty = rows.length === 0;
    $('#grid').classList.toggle('hidden', empty);
    $('#empty').classList.toggle('hidden', !empty);
    const btn = $('#analyzeAllBtn');
    if (btn && !state.busy.all) btn.disabled = !all.some((d) => isOpen(d) && !d.ai) || !state.config.aiConfigured;
    if (empty) {
      $('#empty').innerHTML = all.length
        ? `<div class="art">${I.search}</div><h3>No disputes match</h3><p>Try another filter or clear the search.</p><button class="btn btn-white" data-act="clear-filter">Clear filters</button>`
        : isSandbox()
          ? `<div class="art">${I.shield}</div><h3>No disputes on your PayPal sandbox account yet</h3><p>Take a real sandbox payment, then dispute it as the buyer. It shows up here within a minute, and Gemini analyses it on arrival.</p>
             <div class="steps"><div class="step"><span class="num">1</span><b>Take a payment</b><span class="muted small">New sandbox payment, approved by a sandbox Personal buyer (US for a USD store).</span></div><div class="step"><span class="num">2</span><b>Buyer opens a dispute</b><span class="muted small">On sandbox.paypal.com as that buyer: Activity › the payment › Report a problem.</span></div><div class="step"><span class="num">3</span><b>Respond with AI</b><span class="muted small">Open the case, review Gemini's draft, approve and submit to PayPal.</span></div></div>
             <button class="btn btn-ink" data-act="new-payment">${I.plus}New sandbox payment</button>`
          : `<div class="art">${I.check}</div><h3>No disputes</h3><p>PayPal reports no disputes on this account. New ones appear here automatically.</p>`;
      return;
    }
    if (state.grid) state.grid.setGridOption('rowData', rows);
    else renderFallbackTable(rows);
  }

  function initGrid() {
    const host = $('#grid');
    if (!window.agGrid || typeof window.agGrid.createGrid !== 'function') return null;
    const theme = window.agGrid.themeQuartz
      ? window.agGrid.themeQuartz.withParams({
        fontFamily: 'Outfit, ui-sans-serif, system-ui, sans-serif', fontSize: 14, headerFontSize: 12.5, headerFontWeight: 500,
        headerTextColor: '#6c7469', headerBackgroundColor: '#f6f8f3', borderColor: '#eceee8', rowHoverColor: '#f5fbe0',
        accentColor: '#121512', foregroundColor: '#121512', wrapperBorder: false, wrapperBorderRadius: 0, cellHorizontalPadding: 20
      })
      : undefined;
    const options = {
      columnDefs: [
        { headerName: 'Case', colId: 'case', flex: 1.6, minWidth: 230, valueGetter: (p) => `${p.data.buyer.name} ${p.data.id}`, cellRenderer: (p) => caseCell(p.data) },
        { headerName: 'Amount', colId: 'amount', width: 125, valueGetter: (p) => p.data.amount.value, cellRenderer: (p) => `<b class="amt">${esc(money(p.data.amount.value, p.data.amount.currency))}</b>` },
        { headerName: 'Reason', colId: 'reason', flex: 1, minWidth: 160, valueGetter: (p) => p.data.reasonLabel },
        { headerName: 'Status', colId: 'status', width: 165, valueGetter: (p) => statusInfo(p.data).label, cellRenderer: (p) => statusCell(p.data) },
        { headerName: 'Respond by', colId: 'due', width: 140, valueGetter: (p) => dueInfo(p.data).hours, cellRenderer: (p) => dueCell(p.data) },
        { headerName: 'AI verdict', colId: 'ai', width: 190, valueGetter: (p) => (p.data.ai ? p.data.ai.score : -1), cellRenderer: (p) => aiCell(p.data) }
      ],
      defaultColDef: { sortable: true, resizable: true, suppressMovable: true },
      rowData: [],
      getRowId: (p) => p.data.id,
      rowHeight: 66,
      headerHeight: 46,
      domLayout: 'autoHeight',
      animateRows: true,
      suppressCellFocus: true,
      onRowClicked: (e) => go(`#/disputes/${encodeURIComponent(e.data.id)}`),
      overlayNoRowsTemplate: '<span class="muted">No disputes match.</span>'
    };
    if (theme) options.theme = theme;
    try { return window.agGrid.createGrid(host, options); } catch (err) { console.error('AG Grid failed to start', err); return null; }
  }

  function renderFallbackTable(rows) {
    $('#grid').innerHTML = `<table class="fallback-table"><thead><tr><th>Case</th><th>Amount</th><th>Reason</th><th>Status</th><th>Respond by</th><th>AI verdict</th></tr></thead><tbody>${
      rows.map((d) => `<tr data-id="${esc(d.id)}" tabindex="0"><td>${caseCell(d)}</td><td><b>${esc(money(d.amount.value, d.amount.currency))}</b></td><td>${esc(d.reasonLabel)}</td><td>${statusCell(d)}</td><td>${dueCell(d)}</td><td>${aiCell(d)}</td></tr>`).join('')
    }</tbody></table>`;
  }

  // ---------- case ----------
  async function pageCase() {
    const id = state.route.params.id;
    const same = state.caseId === id && state.detail;
    if (!same) { state.caseId = id; state.detail = null; state.editingRecord = false; state.confirmRefund = false; }
    if (!same) {
      $('#page').innerHTML = `<div class="crumbs"><a href="#/dashboard">Overview</a>›<a href="#/disputes">Disputes</a>›<span class="mono">${esc(id)}</span></div>
        <div class="card case-hero"><div style="flex:1"><div class="sk" style="height:40px;width:180px"></div><div class="sk" style="height:16px;width:60%;margin-top:14px"></div></div></div>
        <div class="case-grid"><div class="stack">${skeletonCards(2, '')}</div><div class="stack"><div class="ai-loading"><span class="spinner"></span>Loading the case from PayPal…</div>${skeletonCards(1, '')}</div></div>`;
    }
    await refreshCase(id, { refresh: false, silent: Boolean(same) });
  }

  async function refreshCase(id, { refresh = false, silent = false } = {}) {
    try {
      const det = await api(`/api/disputes/${encodeURIComponent(id)}${refresh ? '?refresh=1' : ''}`);
      if (state.caseId !== id || state.route.name !== 'case') return;
      state.detail = det;
      patchDispute(det.dispute);
      drawCase();
    } catch (err) {
      if (state.caseId !== id || err.status === 401) return;
      if (!silent) $('#page').innerHTML = `<div class="crumbs"><a href="#/disputes">Disputes</a>›<span class="mono">${esc(id)}</span></div><div class="card empty"><div class="art">${I.alert}</div><h3>Could not load this dispute</h3><p>${esc(errText(err))}</p><div class="center-actions"><a class="btn btn-white" href="#/disputes">Back to queue</a><button class="btn btn-ink" data-act="refresh-case">Try again</button></div></div>`;
      else toast(errText(err), 'bad');
    }
  }

  function patchDispute(d) {
    if (!state.disputes) return;
    const i = state.disputes.findIndex((x) => x.id === d.id);
    if (i >= 0) state.disputes[i] = d; else state.disputes.push(d);
    updateNavCounts();
  }

  function draftFor(d, analysis) {
    if (!state.drafts[d.id]) state.drafts[d.id] = { notes: analysis ? analysis.response_notes : '', evidence_type: analysis ? analysis.evidence_type : 'OTHER', message: analysis ? analysis.buyer_message || '' : '', attachPdf: true };
    return state.drafts[d.id];
  }

  function factsView(facts, error) {
    if (!facts) return `<div class="banner info compact"><div class="grow"><b>No PayPal transaction details</b>${esc(error || 'PayPal returned no details for this transaction.')}</div></div>`;
    const rows = [
      ['Paid', [facts.paidAt && shortDate(facts.paidAt), moneyOf(facts.amount), facts.status && facts.status.toLowerCase()].filter(Boolean).join(' · ')],
      ['Buyer', [facts.payer.name, facts.payer.email, facts.payer.accountStatus && `${facts.payer.accountStatus.toLowerCase()} account`].filter(Boolean).join(' · ')],
      ['Ship to', [facts.shipTo.name, facts.shipTo.address].filter(Boolean).join(', ')],
      ['Items', facts.items.map((i) => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''}${i.unitAmount ? ` (${moneyOf(i.unitAmount)})` : ''}`).join(', ') || facts.description],
      ['Tracking on PayPal', facts.trackers.map((t) => `${t.number}${t.status ? ` · ${t.status.toLowerCase()}` : ''}`).join(', ')],
      ['Seller protection', facts.sellerProtection && facts.sellerProtection.status && facts.sellerProtection.status.replace(/_/g, ' ').toLowerCase()],
      ['PayPal order', facts.orderId],
      ['Invoice', facts.invoiceId],
      ['PayPal fee', facts.fee && moneyOf(facts.fee)]
    ].filter(([, v]) => v);
    return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="hint">Read from the ${esc(facts.via)} · ${esc(relTime(facts.fetchedAt))} · <button class="link" data-act="refresh-case">Re-read</button></div>`;
  }

  function recordView(record) {
    const s = record.shipping || {};
    const rows = [
      ['Carrier', [s.carrier, s.trackingNumber].filter(Boolean).join(' · ')], ['Shipped', s.shippedAt && shortDate(s.shippedAt)],
      ['Delivered', s.deliveredAt ? shortDate(s.deliveredAt) : s.status], ['Delivery proof', s.deliveryProof], ['Listing', record.listing],
      ['Refund ID', record.refundId], ['Customer history', record.history], ['Notes', record.notes], ['Your order no.', record.orderId]
    ].filter(([, v]) => v);
    if (!rows.length) return '<p class="muted small m0">Nothing added yet.</p>';
    return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${record.trackingOnPayPal && record.trackingOnPayPal.length ? `<div class="hint">Tracking ${esc(record.trackingOnPayPal.join(', '))} is also on the PayPal order.</div>` : ''}`;
  }

  function recordForm(record) {
    const r = record || {};
    const s = r.shipping || {};
    const v = (x) => esc(x || '');
    return `<form id="recordForm" class="form-grid">
      <label class="field">Carrier<input class="input" name="carrier" value="${v(s.carrier)}" placeholder="UPS, USPS, FedEx, DHL…" /></label>
      <label class="field">Tracking number<input class="input" name="trackingNumber" value="${v(s.trackingNumber)}" /></label>
      <label class="field">Shipped on<input class="input" name="shippedAt" type="date" value="${v(s.shippedAt)}" /></label>
      <label class="field">Delivered on<input class="input" name="deliveredAt" type="date" value="${v(s.deliveredAt)}" /></label>
      <label class="field span-2">Delivery proof<input class="input" name="deliveryProof" value="${v(s.deliveryProof)}" placeholder="Signature, photo, GPS scan…" /></label>
      <label class="field span-2">Listing description<textarea class="input" name="listing" rows="2" placeholder="What the product page promised">${v(r.listing)}</textarea></label>
      <label class="field">Refund ID (if refunded)<input class="input" name="refundId" value="${v(r.refundId)}" /></label>
      <label class="field">Your order number<input class="input" name="orderId" value="${v(r.orderId)}" /></label>
      <label class="field span-2">Customer history<input class="input" name="history" value="${v(r.history)}" placeholder="Past orders, past disputes" /></label>
      <label class="field span-2">Other notes<textarea class="input" name="notes" rows="2" placeholder="Anything else PayPal should know">${v(r.notes)}</textarea></label>
      <div class="span-2 form-actions">${record ? '<button type="button" class="btn btn-ghost" data-act="cancel-record">Cancel</button>' : ''}<button type="submit" class="btn btn-ink" ${state.busy.record ? 'disabled' : ''}>${state.busy.record ? '<span class="spinner"></span>' : ''}Save facts</button></div>
      <p class="hint span-2 m0">A new tracking number is also added to the PayPal order when DisputeShield knows the order.</p>
    </form>`;
  }

  function aiSection(d, analysis) {
    if (!state.config.aiConfigured) return '<div class="banner bad compact"><div class="grow"><b>AI is not configured</b>Set GEMINI_API_KEY on the server.</div></div>';
    if (state.busy.analyze) return '<div class="ai-loading"><span class="spinner"></span>Gemini is reading the dispute, PayPal\'s record and your facts… busy models are skipped automatically.</div>';
    if (!analysis) {
      return `<p class="muted m0 mb12">Gemini reads the buyer's claim, PayPal's record of the payment and your fulfilment facts, decides whether to fight, picks the PayPal evidence type and writes the response.</p>
        <button class="btn btn-ink btn-lg btn-block" data-act="analyze" ${d.status === 'RESOLVED' ? 'disabled' : ''}>${I.ai}Analyse with Gemini</button>`;
    }
    const a = analysis;
    const draft = draftFor(d, a);
    const list = (items, cls, title) => (items && items.length ? `<div class="list-box ${cls}"><h5>${title}</h5><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
    const canMessage = d.actions.sendMessage;
    return `
      <div class="verdict ${esc(a.recommended_action)}">
        <div class="score-ring" style="--p:${Number(a.strength_score) || 0};--c:${scoreColor(a.strength_score)}"><div>${Number(a.strength_score) || 0}</div></div>
        <div class="verdict-text"><b>${esc(ACTION_TEXT[a.recommended_action] || a.recommended_action)}</b><p>${esc(a.summary)}</p></div>
      </div>
      <div class="lists">${list(a.strength_reasons, 'good', 'Working for you')}${list([...(a.risks || []), ...(a.missing_evidence || []).map((m) => `Missing: ${m}`)], 'bad', 'Risks and gaps')}</div>
      ${a.facts_used && a.facts_used.length ? `<div class="facts mb12" title="Facts the AI relied on">${a.facts_used.map((f) => `<span class="fact">${esc(f)}</span>`).join('')}</div>` : ''}
      ${d.status !== 'RESOLVED' ? `<label class="field mb10">Evidence type sent to PayPal
        <select class="input" id="evidenceType">${Object.entries(EVIDENCE_LABELS).map(([k, label]) => `<option value="${k}" ${draft.evidence_type === k ? 'selected' : ''}>${label}${k === a.evidence_type ? ' · AI pick' : ''}</option>`).join('')}</select>
      </label>
      <label class="field">Response to PayPal <span class="muted small fw4">Edit freely before submitting</span>
        <textarea class="input" id="notes" rows="8" maxlength="2000" placeholder="${a.recommended_action === 'REFUND' ? 'Gemini suggests refunding. Write a response only if you still want to fight.' : ''}">${esc(draft.notes)}</textarea>
      </label>
      <div class="notes-meta"><span id="notesCount">${draft.notes.length} / 2000</span><span>Check every fact before you approve</span></div>
      ${a.buyer_message ? `<details class="msg-box" ${canMessage ? 'open' : ''}><summary>Message to the buyer${canMessage ? '' : ' <span class="muted small fw4">(PayPal allows messages only at some stages)</span>'}</summary>
          <textarea class="input" id="buyerMessage" rows="4" maxlength="2000">${esc(draft.message)}</textarea>
          ${canMessage ? `<div class="msg-actions"><button class="btn btn-white" data-act="send-message" ${state.busy.message ? 'disabled' : ''}>${state.busy.message ? '<span class="spinner"></span>Sending…' : `${I.msg}Send to buyer through PayPal`}</button></div>` : ''}</details>` : ''}` : ''}
      <div class="engine">${esc(a.engine.provider)} · ${esc(a.engine.model)}${a.engine.fallbackFrom ? ` (fallback from ${esc(a.engine.fallbackFrom)})` : ''} · ${relTime(a.analysedAt)}${a.latencyMs ? ` · ${(a.latencyMs / 1000).toFixed(1)}s` : ''}${a.usage && a.usage.total ? ` · ${a.usage.total} tokens` : ''}${d.status !== 'RESOLVED' ? ' · <button class="link" data-act="analyze">Re-analyse</button>' : ''}</div>`;
  }

  function responseSection(d, analysis, submissions) {
    if (d.status === 'RESOLVED') {
      const won = d.outcome && d.outcome.code.includes('SELLER');
      return `<div class="outcome ${won ? 'won' : 'lost'}">${won ? I.trophy : I.alert}<span>${won ? `PayPal ruled in your favour. You keep ${esc(money(d.amount.value, d.amount.currency))}.` : `Closed ${esc(((d.outcome && d.outcome.code) || '').replace(/_/g, ' ').toLowerCase() || 'in the buyer\'s favour')}${d.outcome && d.outcome.refunded && d.outcome.refunded.value ? ` · ${esc(money(d.outcome.refunded.value, d.outcome.refunded.currency))} refunded` : ''}.`}</span></div>`;
    }
    const a = d.actions;
    const canSubmit = a.provideEvidence || a.provideSupportingInfo || (isSandbox() && a.requireEvidence && d.status === 'UNDER_REVIEW' && !submissions.some((s) => s.kind !== 'message'));
    const asSupporting = !a.provideEvidence && a.provideSupportingInfo && !(isSandbox() && a.requireEvidence);
    const latest = submissions.find((s) => s.kind !== 'message');
    const draft = draftFor(d, analysis);
    let html = '';
    if (latest) html += `<div class="banner good compact"><div class="grow"><b>Response submitted ${esc(relTime(latest.at))}</b>Sent as ${esc(SENT_LABELS[latest.evidenceType] || latest.evidenceType)}${latest.pdf ? ' with the evidence PDF' : ''}.${latest.fellBack ? ' PayPal refused the first format, so DisputeShield resent it (see activity).' : ''}</div></div>`;
    const busy = state.busy.submit;
    html += `<label class="check"><input type="checkbox" id="attachPdf" ${draft.attachPdf ? 'checked' : ''}/> Attach the evidence PDF · <a class="link" href="/api/disputes/${encodeURIComponent(d.id)}/evidence.pdf" data-act="preview-pdf" target="_blank" rel="noopener">Preview PDF</a></label>
      <div class="respond-row">
        <button class="btn btn-ink btn-lg" data-act="submit" ${!canSubmit || !analysis || busy ? 'disabled' : ''}>${busy ? '<span class="spinner"></span>Submitting to PayPal…' : `${I.check}${asSupporting ? 'Approve and send to PayPal' : 'Approve and submit to PayPal'}`}</button>
        ${a.acceptClaim ? (state.confirmRefund
          ? `<button class="btn btn-danger btn-lg" data-act="accept" ${state.busy.accept ? 'disabled' : ''}>${state.busy.accept ? '<span class="spinner"></span>' : ''}Confirm refund of ${esc(money(d.amount.value, d.amount.currency))}</button>`
          : '<button class="btn btn-white btn-lg" data-act="ask-accept">Accept and refund</button>') : ''}
      </div>`;
    if (!analysis && canSubmit) html += '<div class="hint">Run the analysis first so the response is built from the records.</div>';
    else if (asSupporting) html += '<div class="hint">PayPal is reviewing this case, so it takes your response as supporting information (notes and the PDF) rather than typed evidence.</div>';
    else if (!canSubmit && d.status === 'UNDER_REVIEW') html += `<div class="hint">PayPal is reviewing this case.${isSandbox() ? ' In the sandbox you can play PayPal\'s part below once PayPal offers it.' : ''}</div>`;
    else if (!canSubmit) html += `<div class="hint">PayPal is not asking for evidence on this case right now (status ${esc(d.status.replace(/_/g, ' ').toLowerCase())}).${a.sendMessage ? ' You can message the buyer instead.' : ''}</div>`;
    return html;
  }

  function sandboxSection(d) {
    const a = d.actions;
    if (d.status === 'RESOLVED') return '';
    const items = [];
    const b = (act, label, cls = 'btn-white') => `<button class="btn ${cls} btn-sm" data-act="sandbox" data-action="${act}" ${state.busy.sandbox ? 'disabled' : ''}>${label}</button>`;
    if (a.escalate) items.push(b('escalate', 'Escalate to claim'));
    if (isSandbox() && a.requireEvidence) items.push(b('seller_evidence', 'Ask merchant for evidence'));
    if (isSandbox() && a.adjudicate) { items.push(b('seller_favor', `${I.trophy}Settle: merchant wins`, 'btn-lime')); items.push(b('buyer_favor', 'Settle: buyer wins')); }
    if (!items.length) return '';
    return `<section class="card section sandbox-box">
      <div class="section-head"><h4>${isSandbox() ? 'Play PayPal\'s part' : 'More actions'}</h4><span class="muted small">${isSandbox() ? 'Sandbox-only PayPal endpoints' : ''}</span></div>
      ${isSandbox() ? '<p class="muted small m0 mb10">In production a PayPal agent decides the case. In the sandbox these call PayPal\'s adjudicate and require-evidence endpoints.</p>' : ''}
      <div class="sandbox-actions">${items.join('')}</div></section>`;
  }

  function timeline(d, activity) {
    const items = [
      ...activity.map((x) => ({ at: x.at, text: x.text, kind: x.kind })),
      ...d.messages.map((m) => ({ at: m.at, text: `${m.by === 'SELLER' ? 'You' : m.by === 'BUYER' ? 'Buyer' : m.by || 'PayPal'}: ${m.text}`, kind: '' })),
      ...d.evidences.filter((e) => e.at).map((e) => ({ at: e.at, text: `Evidence on file: ${e.type.replace(/_/g, ' ').toLowerCase()} (${(e.source || '').replace(/_/g, ' ').toLowerCase()})${e.documents.length ? ` · ${e.documents.join(', ')}` : ''}`, kind: '' })),
      ...(d.createdAt ? [{ at: d.createdAt, text: `Dispute opened · ${d.reasonLabel}`, kind: '' }] : [])
    ].filter((x) => x.text).sort((x, y) => Date.parse(y.at || 0) - Date.parse(x.at || 0));
    if (!items.length) return '<p class="muted small">No activity yet.</p>';
    return `<ul class="timeline">${items.slice(0, 30).map((x) => `<li><span class="tdot ${esc(x.kind)}"></span><div>${esc(x.text)}<time>${esc(x.at ? `${shortDate(x.at)} · ${relTime(x.at)}` : '')}</time></div></li>`).join('')}</ul>`;
  }

  function drawCase() {
    const det = state.detail;
    if (!det || state.route.name !== 'case') return;
    const d = det.dispute;
    const s = statusInfo(d);
    const due = dueInfo(d);
    const buyerMsgs = d.messages.filter((m) => m.by !== 'SELLER');
    const editing = state.editingRecord || !det.record;
    const y = window.scrollY;
    const focusId = document.activeElement && document.activeElement.id;
    $('#page').innerHTML = `
      <div class="crumbs"><a href="#/dashboard">Overview</a>›<a href="#/disputes">Disputes</a>›<span class="mono">${esc(d.id)}</span></div>
      <section class="card case-hero">
        <div>
          <div class="hero-line"><span class="amount">${esc(money(d.amount.value, d.amount.currency))}</span><span class="pill ${s.cls}">${esc(s.label)}</span>${d.stage ? `<span class="chip">${esc(stageLabel(d.stage))}</span>` : ''}</div>
          <div class="meta"><span><b>${esc(d.buyer.name || 'PayPal buyer')}</b>${d.buyer.email ? ` · ${esc(d.buyer.email)}` : ''}</span><span>${esc(d.reasonLabel)}</span><span class="mono">${esc(d.id)}</span></div>
        </div>
        <div class="deadline"><span class="eyebrow">Respond by</span><div class="big ${due.cls ? `due ${due.cls}` : ''}">${d.status === 'RESOLVED' ? 'Closed' : esc(due.text)}</div>${d.dueDate && d.status !== 'RESOLVED' ? `<div class="muted small">${esc(shortDate(d.dueDate))}</div>` : ''}<div class="mt8"><button class="btn btn-white btn-sm" data-act="refresh-case">${I.refresh}Refresh from PayPal</button></div></div>
      </section>
      <div class="case-grid">
        <div class="stack">
          <section class="card section">
            <div class="section-head"><h4><span class="n">1</span>The buyer's claim</h4><span class="muted small">${esc(d.channel ? d.channel.toLowerCase() : '')}</span></div>
            ${(() => { const notes = d.items.map((i) => i.notes).filter((t) => t && t.trim().length > 2); const msgs = buyerMsgs.filter((m) => m.text && m.text.trim().length > 2); const quotes = [...notes.map((t) => `<p class="quote"><span class="q-label">Buyer's note to PayPal</span>“${esc(t)}”</p>`), ...msgs.map((m) => `<p class="quote">“${esc(m.text)}”</p>`)]; return quotes.length ? quotes.join('') : `<p class="muted m0">PayPal reason: ${esc(d.reasonLabel)}. The buyer left no message.</p>`; })()}
            <dl class="kv mt12">
              <dt>Seller transaction</dt><dd class="mono">${esc(d.transactionId || 'Not provided')}</dd>
              ${d.items.length ? `<dt>Disputed items</dt><dd>${esc(d.items.map((i) => i.name).join(', '))}</dd>` : ''}
              ${d.createdAt ? `<dt>Opened</dt><dd>${esc(shortDate(d.createdAt))}</dd>` : ''}
              ${d.offer && d.offer.amount ? `<dt>${d.offer.type ? 'Offer' : 'Buyer asks for'}</dt><dd>${d.offer.type ? `${esc(d.offer.type.replace(/_/g, ' ').toLowerCase())} · ` : ''}${esc(moneyOf(d.offer.amount))}</dd>` : ''}
            </dl>
          </section>
          <section class="card section">
            <div class="section-head"><h4><span class="n">2</span>The payment, from PayPal</h4><span class="muted small">Verified, read only</span></div>
            ${factsView(det.facts, det.factsError)}
            <div class="subhead"><h5>Your fulfilment facts</h5>${det.record && !state.editingRecord ? '<button class="btn btn-ghost btn-sm" data-act="edit-record">Edit</button>' : ''}</div>
            ${editing ? `${!det.record ? '<p class="muted small m0 mb12">PayPal does not know how you shipped it. Add carrier, delivery proof, listing or refund facts; Gemini uses only what is on file.</p>' : ''}${recordForm(det.record)}` : recordView(det.record)}
          </section>
          <section class="card section">
            <div class="section-head"><h4>Activity</h4></div>
            ${timeline(d, det.activity)}
          </section>
        </div>
        <div class="stack">
          <section class="card section">
            <div class="section-head"><h4><span class="n">3</span>AI case builder</h4><span class="muted small">Google Gemini</span></div>
            ${aiSection(d, det.analysis)}
          </section>
          <section class="card section">
            <div class="section-head"><h4><span class="n">4</span>Respond</h4><span class="muted small">Nothing is sent without your click</span></div>
            ${responseSection(d, det.analysis, det.submissions)}
          </section>
          ${sandboxSection(d)}
        </div>
      </div>`;
    window.scrollTo(0, y);
    if (focusId && $(`#${focusId}`)) $(`#${focusId}`).focus({ preventScroll: true });
  }

  // ---------- payments ----------
  async function pagePayments() {
    $('#page').innerHTML = `
      <div class="page-head">
        <div><div class="crumbs"><a href="#/dashboard">Overview</a>›<span>Payments</span></div><h1>Payments</h1><p>Payments taken through DisputeShield with PayPal Orders v2. Their order, buyer and shipping facts link to any dispute automatically.</p></div>
        <div class="actions">${isSandbox() ? `<button class="btn btn-white" data-act="batch-orders" id="batchBtn">${I.bolt}Create 3 test orders</button><button class="btn btn-ink" data-act="new-payment">${I.plus}New sandbox payment</button>` : ''}</div>
      </div>
      ${isSandbox() ? `<section class="card how-test">
        <div class="card-title"><span class="ico">${I.spark}</span>Make real test data with PayPal</div>
        <ol>
          <li><b>Create test orders.</b> Real PayPal sandbox orders from a small catalogue; most get a tracking number, one does not.</li>
          <li><b>Approve each one</b> with a sandbox Personal buyer (US for a USD store). An Incognito window keeps the buyer login separate.</li>
          <li><b>Dispute two or three</b> on sandbox.paypal.com as that buyer (Activity › the payment › Report a problem), with different reasons.</li>
          <li><b>Answer them here.</b> Gemini analyses each case; submit evidence, message the buyer or accept and refund. Everything is saved to the database.</li>
        </ol>
      </section>` : ''}
      <section class="card" style="overflow:hidden" id="payCard"><div style="padding:18px"><div class="sk" style="height:56px"></div><div class="sk" style="height:56px;margin-top:10px"></div></div></section>`;
    try { await loadPayments(); } catch (err) { if (err.status !== 401 && $('#payCard')) $('#payCard').innerHTML = `<div class="empty"><h3>Could not load payments</h3><p>${esc(errText(err))}</p></div>`; return; }
    if (state.route.name !== 'payments') return;
    drawPayments();
  }

  function drawPayments() {
    const card = $('#payCard');
    if (!card) return;
    const list = (state.payments || []).filter((p) => p.captureId || p.status === 'PAYER_ACTION_REQUIRED' || p.status === 'CANCELLED');
    if (!list.length) {
      card.innerHTML = `<div class="empty"><div class="art">${I.card}</div><h3>No payments yet</h3><p>${isSandbox() ? 'Take a real sandbox payment. You approve it as a sandbox buyer; DisputeShield captures it and keeps its facts ready for any dispute.' : 'Payments made through DisputeShield appear here.'}</p>${isSandbox() ? `<button class="btn btn-ink" data-act="new-payment">${I.plus}New sandbox payment</button>` : ''}</div>`;
      return;
    }
    const captured = list.filter((p) => p.captureId);
    const volume = captured.reduce((s, p) => s + (p.amount || 0), 0);
    const cur = (captured[0] && captured[0].currency) || state.config.currency;
    card.innerHTML = `
      <div class="toolbar"><div class="card-title"><span class="ico">${I.card}</span>${captured.length} captured · ${esc(money(volume, cur))}</div><span class="muted small">${list.filter((p) => p.disputeId).length} disputed</span></div>
      <div class="pay-list">${list.slice(0, 30).map((p, i) => {
        let action = '';
        let badge = '';
        if (p.disputeId) { badge = '<span class="pill review">Disputed</span>'; action = `<a class="btn btn-ink btn-sm" href="#/disputes/${encodeURIComponent(p.disputeId)}">Open case <span class="arrow">→</span></a>`; }
        else if (p.captureId) { badge = '<span class="pill won">Captured</span>'; if (isSandbox()) action = '<a class="btn btn-white btn-sm" href="https://www.sandbox.paypal.com/myaccount/transactions" target="_blank" rel="noopener" title="Log in as the buyer, open this payment and choose Report a problem">Dispute as buyer ↗</a>'; }
        else if (p.status === 'CANCELLED') badge = '<span class="pill neutral">Cancelled</span>';
        else { badge = '<span class="pill respond">Awaiting approval</span>'; if (p.approveUrl) action = `<a class="btn btn-white btn-sm" href="${esc(p.approveUrl)}" target="_blank" rel="noopener">Approve on PayPal ↗</a>`; }
        return `<div class="pay-row reveal" style="--d:${Math.min(i, 8) * 50}ms">
            <div class="pay-main"><div class="pay-ico">${I.card}</div><div><b>${esc(p.product || 'Order')}</b><div class="muted small">${esc(p.buyerEmail || 'buyer not known yet')} · ${esc(relTime(p.capturedAt || p.createdAt))}</div><div class="mono">${p.captureId ? `capture ${esc(p.captureId)}` : `order ${esc(p.orderId)}`}</div></div></div>
            <div class="pay-actions"><span class="pay-amount">${esc(money(p.amount, p.currency))}</span>${badge}${action}</div>
          </div>`;
      }).join('')}</div>`;
    animateIn(card);
  }

  // ---------- connections ----------
  async function pageSettings() {
    $('#page').innerHTML = `
      <div class="page-head">
        <div><div class="crumbs"><a href="#/dashboard">Overview</a>›<span>Connections</span></div><h1>Connections</h1><p>Live health of PayPal, webhooks, the background check and the Gemini model chain.</p></div>
        <div class="actions"><button class="btn btn-white" data-act="check-status">${I.refresh}Check again</button></div>
      </div>
      <div class="grid-dash" id="conn">${skeletonCards(2, 'col-6')}</div>`;
    await drawStatus();
  }

  async function drawStatus() {
    try { await loadStatus(); } catch (err) { if (err.status !== 401 && $('#conn')) $('#conn').innerHTML = `<div class="col-12 banner bad"><div class="grow"><b>Could not read the server status</b>${esc(errText(err))}</div></div>`; return; }
    if (state.route.name !== 'settings' || !$('#conn')) return;
    const s = state.status;
    const ok = (b) => `<span class="dot ${b ? 'good' : 'bad'}"></span>`;
    $('#conn').innerHTML = `
      <section class="card col-7 reveal"><div class="card-head"><div class="card-title"><span class="ico">${I.link}</span>Integrations</div></div><div class="card-body">
        <div class="conn"><div class="logo">${I.paypal}</div><div class="grow"><b>PayPal ${esc(s.paypal.env)}</b><p>${esc(s.paypal.base)} · ${s.paypal.ok ? `signed in · ${s.paypal.latencyMs} ms` : esc(s.paypal.error || 'not signed in')}</p></div>${ok(s.paypal.ok)}</div>
        <div class="conn"><div class="logo">${I.bolt}</div><div class="grow"><b>Dispute webhooks</b><p>${s.webhook.active ? `Registered: ${esc(s.webhook.url || 'PAYPAL_WEBHOOK_ID')}` : esc(s.webhook.reason)}</p></div><span class="dot ${s.webhook.active ? 'good' : 'warn'}"></span></div>
        <div class="conn"><div class="logo">${I.refresh}</div><div class="grow"><b>Background check every ${s.poll.every} s</b><p>${s.poll.lastPoll ? `Last checked ${esc(relTime(s.poll.lastPoll))}` : 'First check pending'}${s.poll.error ? ` · error: ${esc(s.poll.error)}` : ''} · new disputes are ${s.autoAnalyze ? 'analysed automatically' : 'not analysed automatically'}</p></div>${ok(!s.poll.error)}</div>
        <div class="conn"><div class="logo">${I.clock}</div><div class="grow"><b>Keep-awake</b><p>${s.keepAlive && s.keepAlive.enabled ? `Pings ${esc(s.keepAlive.url)} every ${Math.round(s.keepAlive.every / 60)} min so the free host never sleeps · ${s.keepAlive.lastAt ? `last ping ${esc(relTime(s.keepAlive.lastAt))} ${s.keepAlive.ok ? `(${s.keepAlive.ms} ms)` : `failed: ${esc(s.keepAlive.error || '')}`}` : 'first ping in a few seconds'}` : esc((s.keepAlive && s.keepAlive.reason) || 'Off')} · up ${esc(Math.round(s.uptimeSeconds / 60))} min</p></div><span class="dot ${s.keepAlive && s.keepAlive.enabled ? (s.keepAlive.ok === false ? 'bad' : 'good') : 'warn'}"></span></div>
        <div class="conn"><div class="logo">${I.ai}</div><div class="grow"><b>Google Gemini · ${esc(s.ai.primary)}</b><p>${s.ai.configured ? (s.ai.lastGood ? `Last answered by ${esc(s.ai.lastGood)}` : 'No analysis since the server started') : 'GEMINI_API_KEY is not set'}</p>
          <div class="chain">${s.ai.chain.map((m) => `<span class="${m.model === s.ai.lastGood ? 'good' : m.restingFor ? 'rest' : ''}">${esc(m.model)}${m.restingFor ? ` · busy, retry in ${m.restingFor}s` : ''}</span>`).join('')}</div></div>${ok(s.ai.configured)}</div>
      </div></section>
      <section class="card col-5 reveal"><div class="card-head"><div class="card-title"><span class="ico">${I.chart}</span>Database</div></div><div class="card-body">
        <div class="conn"><div class="logo">${I.chart}</div><div class="grow"><b>${s.database.backend === 'supabase' ? 'Supabase' : s.database.configured ? 'Supabase not reachable, using the local file' : 'Local file'}</b><p>${s.database.backend === 'supabase' ? `${esc(s.database.url)} · ${s.database.lastSync ? `last write ${esc(relTime(s.database.lastSync))}` : 'connected'}${s.database.pending ? ` · ${s.database.pending} waiting to sync` : ''}` : esc(s.database.error || 'Set SUPABASE_URL and SUPABASE_KEY to keep data in Supabase.')}</p></div>${ok(s.database.backend === 'supabase' && s.database.ok)}</div>
        <dl class="kv">${Object.entries(s.database.counts).map(([k, v]) => `<dt>ds_${esc(k)}</dt><dd>${v.total} row${v.total === 1 ? '' : 's'}</dd>`).join('')}</dl>
        <p class="hint">${s.database.backend !== 'supabase' && s.database.configured ? 'Run supabase/schema.sql in the Supabase SQL editor, then restart.' : ''}</p>
      </div></section>
      <section class="card col-7 reveal"><div class="card-head"><div class="card-title"><span class="ico">${I.store}</span>Store profile</div></div><div class="card-body">
        <dl class="kv"><dt>Name</dt><dd>${esc(s.store.name)}</dd><dt>Currency</dt><dd>${esc(s.store.currency)}</dd><dt>Policy sent to AI</dt><dd>${esc(s.store.policy)}</dd></dl>
        <p class="hint">Set STORE_NAME, STORE_CURRENCY and STORE_POLICY on the server to change these.</p>
      </div></section>
      <section class="card col-12 reveal"><div class="card-head"><div class="card-title"><span class="ico">${I.lock}</span>Security</div></div><div class="card-body"><div class="health">
        <div>${ok(true)}<span><b>Keys stay on the server</b><span>PayPal and Gemini are called only by the server.</span></span></div>
        <div>${ok(s.security.password)}<span><b>${s.security.password ? 'Password protected' : 'No password set'}</b><span>${s.security.password ? 'APP_PASSWORD is required to sign in.' : 'Set APP_PASSWORD before sharing a public URL.'}</span></span></div>
        <div>${ok(true)}<span><b>Human approval</b><span>Evidence, messages and refunds need your click.</span></span></div>
        <div>${ok(!s.security.liveWritesBlocked)}<span><b>${s.paypal.env === 'live' ? 'Live PayPal' : 'Sandbox PayPal'}</b><span>${s.security.liveWritesBlocked ? 'Writes blocked until APP_PASSWORD is set.' : 'Write actions allowed.'}</span></span></div>
      </div></div></section>`;
    animateIn($('#conn'));
  }

  function pageNotFound() {
    $('#page').innerHTML = `<div class="card empty"><div class="art">${I.search}</div><h3>Page not found</h3><p>That address does not exist in DisputeShield.</p><a class="btn btn-ink" href="#/dashboard">Go to overview</a></div>`;
  }

  // ---------- actions ----------
  function redrawAfterChange() {
    const n = state.route.name;
    if (n === 'case') drawCase();
    else if (n === 'disputes') drawDisputes();
    else if (n === 'dashboard') drawDashboard();
    else if (n === 'payments') drawPayments();
  }

  async function caseAction(key, fn, okText) {
    state.busy[key] = true;
    drawCase();
    try {
      const det = await fn();
      if (det && det.dispute) { if (state.caseId === det.dispute.id) state.detail = det; patchDispute(det.dispute); }
      if (okText) toast(typeof okText === 'function' ? okText(det) : okText);
      return det;
    } catch (err) { toast(errText(err), 'bad'); return null; }
    finally { state.busy[key] = false; if (state.route.name === 'case') drawCase(); }
  }

  const runAnalyze = (id = state.caseId) => caseAction('analyze', async () => { const det = await api(`/api/disputes/${encodeURIComponent(id)}/analyze`, { method: 'POST' }); delete state.drafts[id]; return det; }, (det) => `Gemini: ${det.analysis.recommended_action.replace('_', ' ')}, strength ${det.analysis.strength_score}/100`);

  function runSubmit() {
    const d = state.detail.dispute;
    const draft = draftFor(d, state.detail.analysis);
    if (draft.notes.trim().length < 20) { toast('Write a short response before submitting.', 'bad'); if ($('#notes')) $('#notes').focus(); return; }
    caseAction('submit', () => api(`/api/disputes/${encodeURIComponent(d.id)}/submit`, { method: 'POST', body: { evidence_type: draft.evidence_type, notes: draft.notes, attach_pdf: draft.attachPdf } }), 'Response submitted to PayPal');
  }
  function runMessage() {
    const d = state.detail.dispute;
    const draft = draftFor(d, state.detail.analysis);
    if (!draft.message || draft.message.trim().length < 5) { toast('Write a message first.', 'bad'); return; }
    caseAction('message', () => api(`/api/disputes/${encodeURIComponent(d.id)}/message`, { method: 'POST', body: { message: draft.message } }), 'Message sent to the buyer through PayPal');
  }
  async function runAccept() {
    const d = state.detail.dispute;
    const det = await caseAction('accept', () => api(`/api/disputes/${encodeURIComponent(d.id)}/accept`, { method: 'POST', body: { note: 'We have accepted the claim and refunded the buyer in full.' } }), 'Claim accepted. PayPal refunds the buyer.');
    if (det) { state.confirmRefund = false; drawCase(); }
  }
  const runSandbox = (action) => caseAction('sandbox', () => api(`/api/disputes/${encodeURIComponent(state.detail.dispute.id)}/sandbox`, { method: 'POST', body: { action } }), action === 'seller_favor' ? 'PayPal settled it: case won' : 'Case updated by PayPal');

  async function saveRecord(form) {
    const d = state.detail.dispute;
    const f = Object.fromEntries(new FormData(form).entries());
    const prev = state.detail.record || {};
    const record = {
      orderId: f.orderId,
      shipping: { ...(prev.shipping || {}), carrier: f.carrier, trackingNumber: f.trackingNumber, shippedAt: f.shippedAt, deliveredAt: f.deliveredAt, status: f.deliveredAt ? 'Delivered' : f.trackingNumber ? 'Shipped' : '', deliveryProof: f.deliveryProof },
      listing: f.listing, refundId: f.refundId, history: f.history, notes: f.notes
    };
    const key = d.transactionId || `dispute:${d.id}`;
    state.busy.record = true;
    drawCase();
    try {
      const res = await api(`/api/records/${encodeURIComponent(key)}`, { method: 'PUT', body: { record, disputeId: d.id } });
      state.detail.record = res.record;
      state.editingRecord = false;
      if (res.trackingPushed && res.trackingPushed.ok) toast('Saved. Tracking added to the PayPal order too.');
      else if (res.trackingPushed && !res.trackingPushed.ok) toast(`Saved here, but PayPal refused the tracking: ${res.trackingPushed.error}`, 'bad');
      else toast('Saved. Re-analyse to use the new facts.');
      state.busy.record = false;
      await refreshCase(d.id, { refresh: true, silent: true });
    } catch (err) { toast(errText(err), 'bad'); }
    finally { state.busy.record = false; if (state.route.name === 'case') drawCase(); }
  }

  async function analyzeAll() {
    const targets = (state.disputes || []).filter((d) => isOpen(d) && !d.ai);
    if (!targets.length) { toast('Every open case already has an analysis.'); return; }
    state.busy.all = true;
    let done = 0;
    let failed = 0;
    for (const d of targets) {
      const btn = $('#analyzeAllBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>Analysing ${done + 1} of ${targets.length}`; }
      try { const det = await api(`/api/disputes/${encodeURIComponent(d.id)}/analyze`, { method: 'POST' }); patchDispute(det.dispute); }
      catch (err) { failed += 1; toast(`${d.id}: ${errText(err)}`, 'bad'); }
      done += 1;
    }
    state.busy.all = false;
    const btn = $('#analyzeAllBtn');
    if (btn) btn.innerHTML = `${I.ai}Analyse all open`;
    toast(`Analysed ${done - failed} of ${done} case${done === 1 ? '' : 's'}`, failed ? 'bad' : '');
    try { await loadActivity(); } catch { /* ignore */ }
    redrawAfterChange();
  }

  // ---------- payment modal ----------
  function openPaymentModal() {
    const modal = $('#paymentModal');
    $('#pmCurrency').textContent = state.config.currency;
    const shipped = modal.querySelector('[name="shippedAt"]');
    if (!shipped.value) shipped.value = new Date().toISOString().slice(0, 10);
    modal.classList.remove('hidden');
    closeSide();
    setTimeout(() => modal.querySelector('[name="product"]').focus(), 60);
  }
  function closeModal() { $('#paymentModal').classList.add('hidden'); }
  async function submitPayment(e) {
    e.preventDefault();
    const btn = $('#pmSubmit');
    const body = Object.fromEntries(new FormData(e.target).entries());
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Creating PayPal order…';
    try {
      const res = await api('/api/payments', { method: 'POST', body });
      window.location.href = res.approveUrl;
    } catch (err) {
      toast(errText(err), 'bad');
      btn.disabled = false;
      btn.innerHTML = 'Continue to PayPal <span class="arrow">→</span>';
    }
  }

  // ---------- PayPal return banner ----------
  function handleReturnParams() {
    const p = new URLSearchParams(window.location.search);
    const payment = p.get('payment');
    if (!payment) return;
    const x = '<button class="icon-btn sm ghost" data-act="dismiss-banner" aria-label="Dismiss">×</button>';
    if (payment === 'captured') {
      const txn = p.get('txn') || '';
      state.banner = `<div class="banner lime"><div class="grow"><b>Payment captured${txn ? ` · <span class="mono">${esc(txn)}</span>` : ''}</b>PayPal has the order, buyer and ship-to address. To test a dispute, log in to <a class="link" href="https://www.sandbox.paypal.com/myaccount/transactions" target="_blank" rel="noopener">sandbox.paypal.com</a> as the buyer, open this payment and choose <b>Report a problem</b>. It reaches your queue within a minute.</div>${x}</div>`;
    } else if (payment === 'cancelled') {
      state.banner = `<div class="banner info"><div class="grow"><b>Payment cancelled</b>No money moved.</div>${x}</div>`;
    } else if (payment === 'failed') {
      state.banner = `<div class="banner bad"><div class="grow"><b>Capture failed</b>${esc(p.get('reason') || 'PayPal did not capture the payment.')}</div>${x}</div>`;
    }
    window.history.replaceState({}, '', `${window.location.pathname}#/payments`);
  }

  // ---------- live updates ----------
  let reloadTimer = null;
  function onRemoteChange(id) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      if (state.route.name === 'landing') { if (id) loadStats().then(updateLandingLive).catch(() => {}); return; }
      if (anyBusy() || !APP_PAGES.includes(state.route.name)) return;
      state.syncing = true; renderSync();
      try { await Promise.all([loadDisputes(), loadActivity(), loadPayments()]); } catch { state.syncing = false; renderSync(); return; }
      state.syncing = false; renderSync(); updateNavCounts();
      const n = state.route.name;
      const typing = document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName);
      if (n === 'case') { if ((!id || id === state.caseId) && !typing) refreshCase(state.caseId, { silent: true }); }
      else if (!typing) redrawAfterChange();
    }, 500);
  }
  function connectEvents() {
    if (window.EventSource) {
      const es = new EventSource('/api/events');
      es.addEventListener('dispute', (e) => { let data = {}; try { data = JSON.parse(e.data); } catch { /* ignore */ } onRemoteChange(data.id); });
    }
    setInterval(() => { if (!document.hidden) onRemoteChange(null); }, 60_000);
    setInterval(renderSync, 10_000);
  }

  // ---------- events ----------
  function scrollToId(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function bindEvents() {
    window.addEventListener('hashchange', () => {
      if (SECTION_ANCHORS.includes(window.location.hash)) { const id = window.location.hash.slice(1); window.history.replaceState({}, '', `${window.location.pathname}#/`); scrollToId(id); return; }
      render();
    });
    $('#paymentForm').addEventListener('submit', submitPayment);
    $('#paymentModal').addEventListener('click', (e) => { if (e.target.id === 'paymentModal' || e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (!$('#paymentModal').classList.contains('hidden')) closeModal(); else closeSide(); }
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { const s = $('#qSearch') || $('#globalSearch'); if (s) { e.preventDefault(); s.focus(); } }
      if (e.key === 'Enter' && e.target.matches && e.target.matches('.fallback-table tr[data-id]')) go(`#/disputes/${encodeURIComponent(e.target.dataset.id)}`);
    });

    document.addEventListener('click', async (e) => {
      const scrollEl = e.target.closest('[data-scroll]');
      if (scrollEl) { e.preventDefault(); scrollToId(scrollEl.dataset.scroll); return; }
      const f = e.target.closest('[data-filter]');
      if (f) { state.filter = f.dataset.filter; drawDisputes(); return; }
      if (e.target.closest('#syncBtn')) { await sync(); redrawAfterChange(); if (state.route.name === 'case' && state.caseId) refreshCase(state.caseId, { refresh: true, silent: true }); return; }
      const tr = e.target.closest('.fallback-table tr[data-id]');
      if (tr) { go(`#/disputes/${encodeURIComponent(tr.dataset.id)}`); return; }
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'preview-pdf') {
        const d = state.detail && state.detail.dispute;
        if (d) el.href = `/api/disputes/${encodeURIComponent(d.id)}/evidence.pdf?notes=${encodeURIComponent(draftFor(d, state.detail.analysis).notes || '')}`;
        return;
      }
      if (el.tagName === 'A') e.preventDefault();
      switch (act) {
        case 'menu': openSide(); break;
        case 'close-side': closeSide(); break;
        case 'analyze': if (!state.busy.analyze) runAnalyze(); break;
        case 'analyze-all': if (!state.busy.all) analyzeAll(); break;
        case 'submit': if (!state.busy.submit) runSubmit(); break;
        case 'send-message': if (!state.busy.message) runMessage(); break;
        case 'ask-accept': state.confirmRefund = true; drawCase(); break;
        case 'accept': if (!state.busy.accept) runAccept(); break;
        case 'sandbox': if (!state.busy.sandbox) runSandbox(el.dataset.action); break;
        case 'edit-record': state.editingRecord = true; drawCase(); break;
        case 'cancel-record': state.editingRecord = false; drawCase(); break;
        case 'refresh-case': if (state.caseId) { el.disabled = true; await refreshCase(state.caseId, { refresh: true, silent: Boolean(state.detail) }); if (state.detail) toast('Case refreshed from PayPal'); } break;
        case 'new-payment': openPaymentModal(); break;
        case 'batch-orders': {
          el.disabled = true;
          el.innerHTML = '<span class="spinner"></span>Creating orders on PayPal…';
          try {
            const res = await api('/api/payments/batch', { method: 'POST', body: { count: 3 } });
            toast(`Created ${res.created.length} real PayPal sandbox orders. Approve each one as the buyer.`);
            await loadPayments();
            drawPayments();
          } catch (err) { toast(errText(err), 'bad'); }
          el.disabled = false;
          el.innerHTML = `${I.bolt}Create 3 test orders`;
          break;
        }
        case 'dismiss-banner': el.closest('.banner').remove(); break;
        case 'reload': window.location.reload(); break;
        case 'sync': await sync({ quiet: true }); render(); break;
        case 'check-status': await drawStatus(); toast('Connections checked'); break;
        case 'clear-filter': state.filter = 'all'; state.query = ''; if ($('#qSearch')) $('#qSearch').value = ''; if ($('#globalSearch')) $('#globalSearch').value = ''; drawDisputes(); break;
        default: break;
      }
    });

    document.addEventListener('submit', async (e) => {
      if (e.target.id === 'recordForm') { e.preventDefault(); saveRecord(e.target); }
      if (e.target.id === 'loginForm') {
        e.preventDefault();
        try {
          await api('/api/login', { method: 'POST', body: { password: new FormData(e.target).get('password') } });
          state.config = await api('/api/config');
          connectEvents();
          go('#/dashboard');
        } catch (err) { toast(err.message, 'bad'); }
      }
    });

    document.addEventListener('input', (e) => {
      if (e.target.id === 'qSearch') { state.query = e.target.value; const g = $('#globalSearch'); if (g) g.value = state.query; drawDisputes(); return; }
      if (e.target.id === 'globalSearch') {
        state.query = e.target.value;
        if (state.route.name !== 'disputes') {
          const keep = state.query;
          go('#/disputes');
          setTimeout(() => { const g = $('#globalSearch'); if (g) { g.value = keep; g.focus(); } }, 80);
        } else { const q = $('#qSearch'); if (q) q.value = state.query; drawDisputes(); }
        return;
      }
      if (!state.detail) return;
      const draft = draftFor(state.detail.dispute, state.detail.analysis);
      if (e.target.id === 'notes') { draft.notes = e.target.value; const c = $('#notesCount'); if (c) c.textContent = `${e.target.value.length} / 2000`; }
      if (e.target.id === 'buyerMessage') draft.message = e.target.value;
    });
    document.addEventListener('change', (e) => {
      if (!state.detail) return;
      const draft = draftFor(state.detail.dispute, state.detail.analysis);
      if (e.target.id === 'evidenceType') draft.evidence_type = e.target.value;
      if (e.target.id === 'attachPdf') draft.attachPdf = e.target.checked;
    });
  }

  // ---------- boot ----------
  async function boot() {
    bindEvents();
    try {
      state.config = await api('/api/config');
    } catch (err) {
      $('#root').innerHTML = `<div class="center-page"><div class="card setup-card"><h2>Server not reachable</h2><p class="muted">${esc(err.message)}</p><button class="btn btn-white" data-act="reload">Try again</button></div></div>`;
      return;
    }
    handleReturnParams();
    render();
    if (state.config.paypalConfigured && (!state.config.authRequired || state.config.authed)) connectEvents();
  }

  boot();
})();
