/*
  Smart Cities site shell (Nemesis Classic look).
  One page, hash routes: #/ #/board #/vehicles/<eui> ...   Old links like /#<eui> go to #/vehicles/<eui>.

  A page is one file, public/site/pages/<id>.js, loaded when first opened. It registers itself:

    SC.register('board', {
      title: ['City board', 'Πίνακας πόλης'],
      render(root, ctx) {            // root: the empty #view element; ctx: { id, args, query, me, lang, go }
        root.append(SC.head({ title: SC.t('City board', 'Πίνακας πόλης'), lede: '...', fresh: 'Live · 2 min ago' }));
        ...
        return () => { stop timers, remove listeners };   (cleanup, optional)
      },
    });

  Helpers on window.SC: t, el, svgEl, esc, api, cached, icon, head, toast, modal, css, go, time, date, day, dateTime, ago, num, me, store.
*/
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  SC.store = store;

  /* ---------- language ---------- */
  const qs = new URLSearchParams(location.search);
  SC.lang = (qs.get('lang') || store.get('sc.lang') || 'en') === 'el' ? 'el' : 'en';
  if (qs.get('lang')) store.set('sc.lang', SC.lang);
  document.documentElement.lang = SC.lang;
  SC.t = (en, el) => (SC.lang === 'el' && el != null ? el : en);

  /* ---------- small DOM helpers ---------- */
  // SC.el('div', { class: 'x', onclick: fn, dataset: {a: 1} }, 'text', childNode, [more]) - text is always escaped.
  SC.el = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'html') throw new Error('SC.el: html is not allowed, build nodes instead');
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (x) => {
      if (x == null || x === false) return;
      if (Array.isArray(x)) x.forEach(add);
      else e.append(x instanceof Node ? x : document.createTextNode(String(x)));
    };
    kids.forEach(add);
    return e;
  };
  SC.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NS = 'http://www.w3.org/2000/svg';
  SC.svgEl = function (tag, attrs, ...kids) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    kids.forEach((x) => { if (x != null) e.append(x instanceof Node ? x : document.createTextNode(String(x))); });
    return e;
  };

  /* ---------- icons (24px grid, stroke) ---------- */
  const I = {
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    board: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 010 7M18 14.3c2 .7 3.5 2.6 3.5 5.7"/>',
    bars: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    refresh: '<path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5M3 17.5l9 5 9-5" opacity=".7"/>',
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
    cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12L3 7M12 12v10"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 000-6H9a3 3 0 010-6h6.5"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3"/><circle cx="8" cy="15" r=".8"/><circle cx="16" cy="15" r=".8"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4M12 14v4M8 21h8"/>',
    pencil: '<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>',
    inbox: '<path d="M3 13l3-9h12l3 9v7H3zM3 13h5l1 3h6l1-3h5"/>',
    pin: '<path d="M12 21s7-6 7-12a7 7 0 10-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    sensor: '<circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M4.9 4.9a10 10 0 000 14.2M19.1 4.9a10 10 0 010 14.2"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  SC.icons = I;
  SC.icon = function (name, size) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    s.innerHTML = I[name] || '';
    return s;
  };

  /* ---------- time and numbers (Cyprus time) ---------- */
  const TZ = 'Asia/Nicosia';
  const fmtHM = new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fmtDM = new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
  const fmtDay = new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  SC.time = (t) => fmtHM.format(t);
  SC.date = (t) => fmtDM.format(t);
  SC.day = (t) => fmtDay.format(t);
  SC.dateTime = (t) => fmtDM.format(t) + ' ' + fmtHM.format(t);
  SC.ago = function (t) {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 90) return SC.t('just now', 'μόλις τώρα');
    const m = Math.round(s / 60);
    if (m < 90) return SC.t(m + ' min ago', 'πριν ' + m + ' λεπτά');
    const h = Math.round(m / 60);
    if (h < 36) return SC.t(h + ' h ago', 'πριν ' + h + ' ώρες');
    const d = Math.round(h / 24);
    return SC.t(d + ' days ago', 'πριν ' + d + ' ημέρες');
  };
  SC.num = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d == null ? 1 : d).replace('-', '−'));

  /* ---------- fetch ---------- */
  SC.api = async function (url, opts) {
    opts = opts || {};
    const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    let r;
    try { r = await fetch(url, init); } catch (e) { const er = new Error(SC.t('No connection. Check your network and try again.', 'Δεν υπάρχει σύνδεση. Ελέγξτε το δίκτυό σας και δοκιμάστε ξανά.')); er.status = 0; throw er; }
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
    if (!r.ok) { const er = new Error((json && json.error) || 'HTTP ' + r.status); er.status = r.status; er.body = json; throw er; }
    return opts.text ? text : json;
  };
  const memo = new Map();
  SC.cached = function (url, ttl) {   // GET with a short memory cache shared by pages
    const hit = memo.get(url), now = Date.now();
    if (hit && now - hit.at < (ttl || 30000)) return hit.p;
    const p = SC.api(url);
    memo.set(url, { at: now, p });
    p.catch(() => memo.delete(url));
    return p;
  };

  /* ---------- toast and modal ---------- */
  let toastTimer = 0;
  SC.toast = function (msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  };
  SC.modal = function ({ title, body, actions }) {
    const prev = document.activeElement;
    const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const box = SC.el('div', { class: 'mod nm-enter', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, SC.el('h2', null, title), body,
      SC.el('div', { class: 'row' }, (actions || [{ label: SC.t('Close', 'Κλείσιμο'), primary: true }]).map((a) => SC.el('button', { class: 'nm-btn' + (a.primary ? ' nm-btn--primary' : ''), onclick: () => { close(); if (a.run) a.run(); } }, a.label))));
    const scrim = SC.el('div', { class: 'mod-scrim', onclick: (e) => { if (e.target === scrim) close(); } }, box);
    document.body.append(scrim);
    document.addEventListener('keydown', onKey);
    const b = box.querySelector('button'); if (b) b.focus();
    return close;
  };

  const cssDone = new Set();
  SC.css = function (href) {   // load a page's stylesheet once: SC.css('/site/pages/board.css')
    if (cssDone.has(href)) return;
    cssDone.add(href);
    document.head.append(SC.el('link', { rel: 'stylesheet', href }));
  };

  /* ---------- page head ---------- */
  // SC.head({ title, lede, fresh, tags:[{text, cls}], help: [en, el] | string, actions:[nodes] })
  SC.head = function (o) {
    const wrap = SC.el('div');
    if (o.help !== false) {
      const helpText = Array.isArray(o.help) ? SC.t(o.help[0], o.help[1]) : o.help || o.lede;
      wrap.append(SC.el('button', { class: 'how-btn', type: 'button', onclick: () => SC.modal({ title: SC.t('How this page works', 'Πώς λειτουργεί αυτή η σελίδα'), body: SC.el('p', null, helpText || '') }) },
        SC.el('i', null, '?'), SC.t('How this page works', 'Πώς λειτουργεί αυτή η σελίδα')));
    }
    const h = SC.el('div', { class: 'page-head' }, SC.el('h1', null, o.title));
    if (o.fresh) h.append(SC.el('span', { class: 'fresh-pill' }, SC.el('i'), o.fresh));
    (o.tags || []).forEach((t) => h.append(SC.el('span', { class: 't ' + (t.cls || 'demo') }, t.text)));
    if (o.actions && o.actions.length) h.append(SC.el('span', { style: { marginLeft: 'auto', display: 'inline-flex', gap: '10px', flexWrap: 'wrap' } }, o.actions));
    if (o.lede) h.append(SC.el('p', { class: 'lede' }, o.lede));
    wrap.append(h);
    return wrap;
  };

  /* ---------- menu ---------- */
  // ready: false items are not shown yet (they appear when their page is built).
  const MENU = [
    { items: [['home', 'globe', 'The whole project', 'Όλο το έργο']] },
    { h: ['Today', 'Σήμερα'], items: [['board', 'board', 'City board', 'Πίνακας πόλης'], ['city3d', 'globe', 'Cyprus 3D', 'Κύπρος 3D'], ['alerts', 'bell', 'Alerts', 'Ειδοποιήσεις']] },
    { h: ['The record', 'Το αρχείο'], items: [['weather', 'check', 'Met Office record', 'Μετεωρολογικό αρχείο'], ['explore', 'search', 'Explore data', 'Εξερεύνηση'], ['library', 'db', 'Library', 'Βιβλιοθήκη']] },
    { h: ['Schools and places', 'Σχολεία και τόποι'], items: [['schools', 'users', 'Schools and teams', 'Σχολεία και ομάδες'], ['districts', 'bars', 'Districts and neighbourhoods', 'Επαρχίες και γειτονιές'], ['guides', 'bolt', 'Sensor guides', 'Οδηγοί αισθητήρων']] },
    { h: ['Think', 'Σκέψη'], items: [['council', 'shield', 'Council room', 'Αίθουσα συμβουλίου'], ['mirror', 'users', 'Mirror', 'Καθρέφτης'], ['whatif', 'refresh', 'What-if', 'Σενάρια'], ['reports', 'file', 'Reports', 'Αναφορές']] },
    { h: ['In the field', 'Στο πεδίο'], items: [['map', 'map', 'Live map', 'Ζωντανός χάρτης'], ['vehicles', 'bus', 'Vehicles', 'Οχήματα'], ['trip', 'route', 'Follow one trip', 'Ακολουθήστε μία διαδρομή'], ['desk', 'home', 'Today’s desk', 'Το γραφείο σήμερα'], ['projects', 'flag', 'Running projects', 'Ενεργά έργα'], ['start', 'layers', 'Start a project', 'Νέο έργο']] },
    { h: ['Data sources', 'Πηγές δεδομένων'], items: [['research', 'search', 'Research', 'Έρευνα'], ['archive', 'layers', 'Data archive', 'Αρχείο δεδομένων'], ['feeds', 'sensor', 'Feed list', 'Λίστα πηγών'], ['helpers', 'bolt', 'Helpers', 'Βοηθοί'], ['warnwatch', 'mic', 'Warnings watch', 'Παρακολούθηση προειδοποιήσεων']] },
    { h: ['Output', 'Παραγωγή'], items: [['studio', 'pencil', 'Build studio', 'Στούντιο'], ['submitted', 'inbox', 'Submitted work', 'Υποβολές']] },
    { h: ['Oversight', 'Εποπτεία'], teacher: true, items: [['approvals', 'check', 'Approvals', 'Εγκρίσεις'], ['opsmap', 'layers', 'Operations map', 'Χάρτης λειτουργιών'], ['league', 'trophy', 'League', 'Πρωτάθλημα'], ['settings', 'gear', 'Settings', 'Ρυθμίσεις']] },
  ];
  // Pages that exist. Add an id here when its file is added in public/site/pages/.
  const READY = new Set(['home', 'board', 'city3d', 'weather', 'explore', 'schools', 'map', 'vehicles', 'ask', 'studio', 'approvals']);
  SC.ready = READY;
  const TEACHER_ONLY = new Set(['approvals', 'opsmap', 'league', 'settings']);
  const TOUR = ['city3d', 'board', 'weather', 'explore', 'map', 'ask'];
  const labelOf = {};
  MENU.forEach((g) => g.items.forEach((it) => { labelOf[it[0]] = [it[2], it[3], it[1]]; }));
  labelOf.ask = ['Ask', 'Ρωτήστε', 'sparkle'];

  SC.me = null;   // { name, role, school } when a teacher is signed in, else null
  const isTeacher = () => Boolean(SC.me && (SC.me.role === 'teacher' || SC.me.role === 'admin'));

  function brandSvg() {
    const s = SC.svgEl('svg', { viewBox: '0 0 38 38', 'aria-hidden': 'true' });
    s.innerHTML = '<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4CCBEA"/><stop offset="1" stop-color="#E07F3F"/></linearGradient></defs><rect x="1" y="1" width="36" height="36" rx="10" fill="#10223a" stroke="url(#lg)" stroke-width="1.5"/><circle cx="19" cy="19" r="3" fill="url(#lg)"/><path d="M12.5 12.5a9.2 9.2 0 000 13M25.5 12.5a9.2 9.2 0 010 13M8.6 8.6a14.7 14.7 0 000 20.8M29.4 8.6a14.7 14.7 0 010 20.8" fill="none" stroke="url(#lg)" stroke-width="1.8" stroke-linecap="round"/>';
    return s;
  }

  function buildMenu(active) {
    const side = document.getElementById('side');
    side.className = 'nm-side';
    side.replaceChildren();
    side.append(
      SC.el('div', { class: 'sm-brand' }, brandSvg(), SC.el('div', null, SC.el('b', null, 'SMART CITIES'), SC.el('small', null, SC.t('Cyprus · live from our schools', 'Κύπρος · ζωντανά από τα σχολεία μας')))),
      SC.el('button', { class: 'sm-search', type: 'button', style: { width: '100%', textAlign: 'left', cursor: 'pointer' }, onclick: openPalette }, SC.icon('search', 16), SC.el('span', null, SC.t('Search or jump to…', 'Αναζήτηση…')), SC.el('kbd', null, 'Ctrl K')),
      SC.el('div', { class: 'sm-brief' + (tourOn ? ' on' : ''), id: 'tour-card', role: 'switch', 'aria-checked': tourOn ? 'true' : 'false', tabindex: 0, onclick: toggleTour, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTour(); } } },
        SC.el('div', null, SC.el('b', null, SC.t('Tour mode', 'Λειτουργία ξενάγησης')), SC.el('small', null, SC.t('A ' + TOUR.length + '-step route', 'Διαδρομή ' + TOUR.length + ' βημάτων'))), SC.el('i')));
    const nav = SC.el('nav', { 'aria-label': SC.t('Pages', 'Σελίδες') });
    MENU.forEach((g) => {
      if (g.teacher && !isTeacher()) return;
      const items = g.items.filter((it) => READY.has(it[0]) && (!TEACHER_ONLY.has(it[0]) || isTeacher()));
      if (!items.length) return;
      if (g.h) nav.append(SC.el('div', { class: 'nm-side-h' }, SC.t(g.h[0], g.h[1])));
      items.forEach(([id, ic, en, el]) => nav.append(SC.el('a', { class: 'nm-side-a' + (id === active ? ' on' : ''), href: id === 'home' ? '#/' : '#/' + id, 'aria-current': id === active ? 'page' : null }, SC.icon(ic), SC.el('span', null, SC.t(en, el)))));
    });
    side.append(nav);
    side.append(SC.el('a', { class: 'sm-ask' + (active === 'ask' ? ' on' : ''), href: '#/ask' }, SC.icon('sparkle'), SC.el('span', null, SC.t('Ask', 'Ρωτήστε'), SC.el('small', null, SC.t('answers from our data', 'απαντήσεις από τα δεδομένα μας')))));
    side.append(SC.el('div', { class: 'sm-foot' },
      SC.el('div', { class: 'nm-side-card sm-fresh' }, SC.el('i', { id: 'fresh-dot' }), SC.el('div', null, SC.el('span', { id: 'fresh-text' }, SC.t('Checking sensors…', 'Έλεγχος αισθητήρων…')), SC.el('small', { id: 'fresh-sub' }, SC.t('Cyprus Met Office beside our own', 'Η Μετεωρολογική Υπηρεσία δίπλα στα δικά μας')))),
      SC.el('div', { class: 'sm-user' }, SC.el('div', { class: 'av' }, isTeacher() ? 'T' : 'V'), SC.el('div', null,
        SC.el('b', null, isTeacher() ? SC.t('Teacher', 'Εκπαιδευτικός') : SC.t('Visitor', 'Επισκέπτης')),
        SC.el('small', null, isTeacher() ? (SC.me.school ? SC.me.school.short : '') : SC.t('No sign-in needed · teachers sign in', 'Χωρίς σύνδεση · οι εκπαιδευτικοί συνδέονται'))))));
    refreshFresh();
  }

  async function refreshFresh() {
    try {
      const dv = await SC.cached('/api/devices', 60000);
      const seen = dv.map((d) => (d.lastSeen ? new Date(d.lastSeen).getTime() : 0)).filter(Boolean);
      const last = seen.length ? Math.max(...seen) : 0;
      const online = dv.filter((d) => d.online).length;
      const t = document.getElementById('fresh-text'), s = document.getElementById('fresh-sub'), dot = document.getElementById('fresh-dot');
      if (!t) return;
      t.textContent = SC.t(online + ' of ' + dv.length + ' sensors online', online + ' από ' + dv.length + ' αισθητήρες σε λειτουργία');
      s.textContent = last ? SC.t('last reading ' + SC.ago(last), 'τελευταία μέτρηση ' + SC.ago(last)) : '';
      dot.style.background = online ? '' : '#F2CF86';
    } catch (e) { /* the footer stays on its default text */ }
  }

  function buildTopbar() {
    const top = document.getElementById('top');
    top.replaceChildren(
      SC.el('button', { class: 'burger', type: 'button', 'aria-label': SC.t('Open menu', 'Άνοιγμα μενού'), onclick: () => document.body.classList.toggle('drawer') }, SC.icon('menu')),
      SC.el('button', { class: 'jump', type: 'button', onclick: openPalette }, SC.icon('search'), SC.t('Jump to…', 'Μετάβαση…'), SC.el('kbd', null, 'Ctrl K')),
      SC.el('span', { class: 'nm-lang', role: 'group', 'aria-label': 'Language' },
        ['en', 'el'].map((l) => SC.el('button', { type: 'button', class: SC.lang === l ? 'on' : '', 'aria-pressed': SC.lang === l ? 'true' : 'false', onclick: () => { if (SC.lang !== l) { store.set('sc.lang', l); location.reload(); } } }, l.toUpperCase()))));
  }

  /* ---------- palette (Ctrl K) ---------- */
  function openPalette() {
    if (document.querySelector('.pal-scrim')) return;
    const items = [];
    MENU.forEach((g) => g.items.forEach(([id, ic, en, el]) => { if (READY.has(id) && (!TEACHER_ONLY.has(id) || isTeacher())) items.push({ id, ic, label: SC.t(en, el), group: g.h ? SC.t(g.h[0], g.h[1]) : '' }); }));
    items.push({ id: 'ask', ic: 'sparkle', label: SC.t('Ask', 'Ρωτήστε'), group: '' });
    const input = SC.el('input', { type: 'text', placeholder: SC.t('Search or jump to…', 'Αναζήτηση…'), 'aria-label': SC.t('Search pages', 'Αναζήτηση σελίδων') });
    const list = SC.el('ul', { role: 'listbox' });
    let sel = 0, shown = items;
    const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey, true); };
    const go = (it) => { close(); location.hash = it.id === 'home' ? '#/' : '#/' + it.id; };
    const draw = () => {
      list.replaceChildren(...shown.map((it, i) => SC.el('li', { class: i === sel ? 'on' : '', role: 'option', onclick: () => go(it) }, SC.icon(it.ic), it.label, SC.el('small', null, it.group))));
      if (!shown.length) list.append(SC.el('li', null, SC.t('Nothing matches.', 'Δεν βρέθηκε τίποτα.')));
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[sel]) go(shown[sel]); }
    };
    input.addEventListener('input', () => { const q = input.value.trim().toLowerCase(); shown = items.filter((it) => it.label.toLowerCase().includes(q) || it.id.includes(q)); sel = 0; draw(); });
    const scrim = SC.el('div', { class: 'pal-scrim', onclick: (e) => { if (e.target === scrim) close(); } }, SC.el('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true' }, input, list));
    document.body.append(scrim);
    document.addEventListener('keydown', onKey, true);
    draw(); input.focus();
  }
  SC.openPalette = openPalette;
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } });

  /* ---------- tour mode ---------- */
  let tourOn = store.get('sc.tour') === '1', tourBar = null;
  function tourIndex() { return TOUR.indexOf(current().id); }
  function drawTour() {
    if (tourBar) { tourBar.remove(); tourBar = null; }
    const card = document.getElementById('tour-card');
    if (card) { card.classList.toggle('on', tourOn); card.setAttribute('aria-checked', tourOn ? 'true' : 'false'); }
    if (!tourOn) return;
    const i = tourIndex();
    const step = (d) => { const n = Math.max(0, Math.min(TOUR.length - 1, (i < 0 ? -1 : i) + d)); location.hash = '#/' + TOUR[n]; };
    tourBar = SC.el('div', { class: 'tour', role: 'region', 'aria-label': SC.t('Tour', 'Ξενάγηση') },
      SC.el('span', null, i < 0 ? SC.t('Tour mode', 'Λειτουργία ξενάγησης') : SC.el('span', null, SC.t('Step ', 'Βήμα '), SC.el('b', null, (i + 1) + '/' + TOUR.length), ' · ' + SC.t(labelOf[TOUR[i]][0], labelOf[TOUR[i]][1]))),
      SC.el('button', { class: 'nm-btn', type: 'button', disabled: i === 0, onclick: () => step(-1) }, SC.t('Back', 'Πίσω')),
      SC.el('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: i === TOUR.length - 1, onclick: () => step(1) }, i < 0 ? SC.t('Start', 'Έναρξη') : SC.t('Next', 'Επόμενο')),
      SC.el('button', { class: 'nm-btn nm-btn--ghost', type: 'button', 'aria-label': SC.t('Leave the tour', 'Έξοδος από την ξενάγηση'), onclick: toggleTour }, SC.icon('close', 16)));
    document.body.append(tourBar);
  }
  function toggleTour() { tourOn = !tourOn; store.set('sc.tour', tourOn ? '1' : '0'); drawTour(); }
  SC.startTour = () => { tourOn = true; store.set('sc.tour', '1'); location.hash = '#/' + TOUR[0]; drawTour(); };

  /* ---------- welcome pop-up ---------- */
  function welcome(force) {
    if (!force && (store.get('sc.welcome.v1') === '1' || navigator.webdriver)) return;
    const hero = SC.el('div', { class: 'wl-hero' });
    const dots = SC.svgEl('svg', { viewBox: '0 0 760 300', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid slice' });
    let g = '<g fill="none" stroke="url(#wg)" stroke-width="3" stroke-linecap="round"><circle cx="380" cy="186" r="9" fill="#F2A56B" stroke="none"/><path d="M356 162a34 34 0 000 48M404 162a34 34 0 010 48M338 144a60 60 0 000 84M422 144a60 60 0 010 84" opacity=".9"/></g>';
    [[110, 170], [650, 160], [210, 240], [560, 245]].forEach(([x, y]) => { g += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#8FE3F7"/><circle cx="' + x + '" cy="' + y + '" r="13" fill="none" stroke="#8FE3F7" opacity=".4"/><path d="M' + x + ' ' + y + 'L380 186" stroke="#8FE3F7" opacity=".18" stroke-dasharray="3 6"/>'; });
    for (let i = 0; i < 26; i++) g += '<circle cx="' + ((i * 97) % 740 + 10) + '" cy="' + ((i * 53) % 280 + 10) + '" r="' + (1 + (i % 3) * .6) + '" fill="#fff" opacity="' + (.15 + (i % 4) * .1) + '"/>';
    dots.innerHTML = '<defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4CCBEA"/><stop offset="1" stop-color="#F7C46B"/></linearGradient></defs>' + g;
    hero.append(dots,
      SC.el('div', { class: 'wl-motto' }, SC.el('span', null, SC.t('Our schools.', 'Τα σχολεία μας.')), SC.el('span', null, SC.t('One live city.', 'Μία ζωντανή πόλη.'))),
      SC.el('div', { class: 'wl-sub' }, SC.t('Live readings you can check', 'Ζωντανές μετρήσεις που μπορείτε να ελέγξετε')));
    const card = (ic, h, p) => SC.el('div', { class: 'wl-cd' }, SC.el('div', { class: 'ic' }, SC.icon(ic)), SC.el('b', null, h), SC.el('p', null, p));
    const never = SC.el('input', { type: 'checkbox', id: 'wl-never', checked: true });
    const close = (tour) => { ov.remove(); document.removeEventListener('keydown', onKey); if (never.checked) store.set('sc.welcome.v1', '1'); if (tour) SC.startTour(); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    const ov = SC.el('div', { class: 'wl-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Smart Cities' },
      SC.el('div', { class: 'wl' }, hero, SC.el('div', { class: 'wl-body' },
        SC.el('div', { class: 'wl-cards' },
          card('sensor', SC.t('Live from our schools', 'Ζωντανά από τα σχολεία μας'), SC.t('Readings from sensors on buses, cars and classrooms at four schools, in one place.', 'Μετρήσεις από αισθητήρες σε λεωφορεία, αυτοκίνητα και αίθουσες σε τέσσερα σχολεία, σε ένα μέρος.')),
          card('shield', SC.t('Official weather beside it', 'Επίσημος καιρός δίπλα τους'), SC.t('Cyprus Met Office warnings, forecast, radar and stations sit next to our numbers.', 'Οι προειδοποιήσεις, η πρόγνωση, το ραντάρ και οι σταθμοί της Μετεωρολογικής Υπηρεσίας δίπλα στα δικά μας δεδομένα.')),
          card('sparkle', SC.t('Ask, then check the source', 'Ρωτήστε και ελέγξτε την πηγή'), SC.t('Ask in plain words. Every answer shows the readings and pages behind it.', 'Ρωτήστε με απλά λόγια. Κάθε απάντηση δείχνει τις μετρήσεις και τις σελίδες πίσω της.'))),
        SC.el('div', { class: 'wl-foot' }, SC.el('label', { for: 'wl-never' }, never, SC.t('Don’t show again', 'Να μην εμφανιστεί ξανά')), SC.el('span', { class: 'sp' }),
          SC.el('button', { class: 'nm-btn', type: 'button', onclick: () => close(false) }, SC.t('Skip', 'Παράλειψη')),
          SC.el('button', { class: 'nm-btn btn-gold', type: 'button', onclick: () => close(true) }, SC.t('Start the tour', 'Ξεκινήστε την ξενάγηση'))),
        SC.el('p', { class: 'muted', style: { margin: '12px 0 0', fontSize: '12.5px' } }, SC.t('No sign-in needed. Vehicle positions are shown about 2 hours late and rounded to 1 km.', 'Δεν χρειάζεται σύνδεση. Οι θέσεις των οχημάτων εμφανίζονται με καθυστέρηση περίπου 2 ωρών και στρογγυλοποιημένες στο 1 χλμ.')))));
    document.body.append(ov);
    document.addEventListener('keydown', onKey);
    const b = ov.querySelector('.btn-gold'); if (b) b.focus();
  }
  SC.welcome = () => welcome(true);

  /* ---------- router ---------- */
  SC.pages = {};
  SC.register = (id, def) => { SC.pages[id] = def; };
  const loading = {};
  const BUILD = '1';
  function loadPage(id) {
    if (SC.pages[id]) return Promise.resolve(SC.pages[id]);
    if (loading[id]) return loading[id];
    loading[id] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/site/pages/' + id + '.js?v=' + BUILD;
      s.onload = () => (SC.pages[id] ? resolve(SC.pages[id]) : reject(new Error('Page ' + id + ' did not register')));
      s.onerror = () => reject(new Error('Page ' + id + ' could not be loaded'));
      document.head.append(s);
    });
    loading[id].catch(() => { delete loading[id]; });
    return loading[id];
  }
  function parse() {
    let h = location.hash.replace(/^#/, '');
    if (h && !h.startsWith('/')) h = '/vehicles/' + h;   // old links: /#<eui>
    const [p, q] = h.split('?');
    const parts = p.split('/').filter(Boolean).map(decodeURIComponent);
    return { id: parts[0] || 'home', args: parts.slice(1), query: new URLSearchParams(q || '') };
  }
  let route = parse();
  const current = () => route;
  SC.go = (path) => { location.hash = '#/' + String(path).replace(/^#?\/?/, ''); };
  let cleanup = null, token = 0;

  async function show() {
    route = parse();
    const my = ++token;
    document.body.classList.remove('drawer');
    const id = route.id;
    const view = document.getElementById('view');
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    const known = READY.has(id) && (!TEACHER_ONLY.has(id) || true);
    buildMenu(known ? id : '');
    drawTour();
    const fresh = view.cloneNode(false);
    fresh.id = 'view'; fresh.className = 'nm-enter'; fresh.tabIndex = -1;
    view.replaceWith(fresh);
    document.title = SC.t(labelOf[id] ? labelOf[id][0] : 'Smart Cities', labelOf[id] ? labelOf[id][1] : 'Smart Cities') + ' · Smart Cities';
    if (!known) {
      fresh.append(SC.head({ title: SC.t('Page not found', 'Η σελίδα δεν βρέθηκε'), help: false, lede: SC.t('That page does not exist yet. Use the menu to open another one.', 'Αυτή η σελίδα δεν υπάρχει ακόμα. Χρησιμοποιήστε το μενού για να ανοίξετε άλλη.') }),
        SC.el('div', null, SC.el('a', { class: 'nm-btn nm-btn--primary', href: '#/' }, SC.t('Go to the whole project', 'Στο ολόκληρο έργο'))));
      return;
    }
    fresh.append(SC.el('div', { class: 'loading' }, SC.t('Loading', 'Φόρτωση')));
    try {
      const def = await loadPage(id);
      if (my !== token) return;
      fresh.replaceChildren();
      window.scrollTo(0, 0);
      const out = await def.render(fresh, { id, args: route.args, query: route.query, me: SC.me, lang: SC.lang, go: SC.go });
      if (my !== token) { if (typeof out === 'function') out(); return; }
      if (typeof out === 'function') cleanup = out;
      fresh.focus({ preventScroll: true });
    } catch (e) {
      if (my !== token) return;
      console.error(e);
      fresh.replaceChildren(SC.head({ title: SC.t('Something went wrong', 'Κάτι πήγε στραβά'), help: false }), SC.el('div', { class: 'err', role: 'alert' }, e.message || String(e)),
        SC.el('div', null, SC.el('button', { class: 'nm-btn', type: 'button', onclick: show }, SC.t('Try again', 'Δοκιμάστε ξανά'))));
    }
  }
  window.addEventListener('hashchange', show);

  /* ---------- start ---------- */
  async function start() {
    buildTopbar();
    document.getElementById('side-scrim').addEventListener('click', () => document.body.classList.remove('drawer'));
    try { const r = await SC.api('/app/api/me'); const u = r && (r.user || r.me); if (u && (u.role === 'teacher' || u.role === 'admin') && u.status !== 'pending') SC.me = u; } catch (e) { /* not signed in */ }
    await show();
    if (qs.get('tour') === '1') welcome(true); else welcome(false);
  }
  start();
})();
