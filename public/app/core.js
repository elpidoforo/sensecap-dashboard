'use strict';
/* Core of the Smart Cities app: small DOM helper, API calls, router, shell, sign-in screens and the live stream. */
(function () {
  const App = (window.App = { state: { me: null, schools: [], unread: 0, pending: 0, reasons: {}, helplines: {}, bot: false }, routes: [], handlers: {}, cleanups: [] });

  /* ---------- helpers ---------- */

  // The screens build their content from nested lists that may hold null or false for "nothing here".
  // Make append() and replaceChildren() accept those, the way the h() helper below does.
  const flatKids = (kids) => kids.flat(Infinity).filter((k) => k != null && k !== false);
  const nativeAppend = Element.prototype.append, nativeReplace = Element.prototype.replaceChildren;
  Element.prototype.append = function (...kids) { return nativeAppend.apply(this, flatKids(kids)); };
  Element.prototype.replaceChildren = function (...kids) { return nativeReplace.apply(this, flatKids(kids)); };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = true;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  App.h = h; App.$ = $;

  const ICONS = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    ask: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 015 .8c0 1.7-2.5 2.2-2.5 3.7"/><path d="M12 17.5v.01"/></svg>',
    manage: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6 8-6s7 1.5 8 6"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    cube: '<svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
    sky: '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 010-8 5.5 5.5 0 0110.6 1.2A3.4 3.4 0 0117 18z"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V4"/><path d="M4 20h16"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-8z"/></svg>',
  };
  App.icon = (name) => { const s = document.createElement('span'); s.style.display = 'contents'; s.innerHTML = ICONS[name] || ''; return s; };

  const TZ = 'Asia/Nicosia';
  const fmt = (App.fmt = {
    clock: (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ms)),
    day: (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ms)),
    dayKey: (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms)),
    full: (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)),
    ago(ms) {
      if (!isFinite(ms)) return '';
      const m = Math.round((Date.now() - ms) / 60000);
      if (m < 2) return 'just now';
      if (m < 60) return m + ' min ago';
      if (m < 36 * 60) return Math.round(m / 60) + ' h ago';
      return Math.round(m / 1440) + ' days ago';
    },
    num(v, d) { return v == null || !isFinite(v) ? '–' : (Math.round(v * 10 ** (d == null ? 1 : d)) / 10 ** (d == null ? 1 : d)).toString(); },
  });
  const toMs = (t) => (typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Date.parse(t));
  App.toMs = toMs;

  const schoolClass = (name) => {
    const n = String(name || '').toLowerCase();
    return n.includes('larnaka') ? 'larnaka' : n.includes('lefkosia') ? 'lefkosia' : n.includes('limassol') ? 'limassol' : n.includes('paphos') ? 'paphos' : '';
  };
  App.schoolDot = (name) => h('span', { class: 'dot ' + schoolClass(name) });

  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
  }
  App.store = store;

  // A very small subset of markdown for assistant answers and handbook pages: paragraphs, "-" lists and **bold**.
  App.md = function (text) {
    const frag = document.createDocumentFragment();
    const inline = (s, parent) => {
      s.split(/(\*\*[^*]+\*\*)/).forEach((p) => { if (/^\*\*[^*]+\*\*$/.test(p)) parent.append(h('b', null, p.slice(2, -2))); else if (p) parent.append(p); });
    };
    let list = null;
    String(text).replace(/\r/g, '').split('\n').forEach((line) => {
      const li = /^\s*[-*•]\s+(.*)$/.exec(line);
      if (li) { if (!list) { list = h('ul'); frag.append(list); } const el = h('li'); inline(li[1], el); list.append(el); return; }
      list = null;
      if (!line.trim()) return;
      const p = h('p'); inline(line.replace(/^#+\s*/, ''), p); frag.append(p);
    });
    return frag;
  };

  /* ---------- toast, sheet, confirm ---------- */

  App.toast = function (msg, bad) {
    const box = $('#toast');
    while (box.children.length >= 2) box.firstChild.remove();
    const el = h('div', { class: bad ? 'bad' : '' }, msg);
    box.append(el);
    setTimeout(() => el.remove(), bad ? 5000 : 3000);
  };

  App.sheet = function (title, body, opts) {
    const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); if (opts && opts.onClose) opts.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const scrim = h('div', { class: 'scrim', onclick: (e) => { if (e.target === scrim) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' }, title ? h('h2', null, title) : null, body));
    document.addEventListener('keydown', onKey);
    document.body.append(scrim);
    const first = scrim.querySelector('input, textarea, select, button');
    if (first && !(opts && opts.noFocus)) first.focus();
    return { close, el: scrim };
  };

  App.confirm = (title, text, okLabel, danger) => new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } sh.close(); };
    const sh = App.sheet(title, h('div', null,
      text ? h('p', { class: 'muted' }, text) : null,
      h('div', { class: 'actions', style: 'margin-top:14px' },
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => finish(true) }, okLabel || 'OK'),
        h('button', { class: 'btn', onclick: () => finish(false) }, 'Cancel'))), { onClose: () => { if (!done) { done = true; resolve(false); } } });
  });

  /* ---------- API ---------- */

  class ApiError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
  App.ApiError = ApiError;
  async function api(path, body, method) {
    const opts = { method: method || (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let r;
    try { r = await fetch(path, opts); } catch (e) { throw new ApiError(0, 'No connection. Check your internet and try again.'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && App.state.me && path.startsWith('/app/api/') && !path.includes('/login')) { App.state.me = null; stopStream(); render(); }
      throw new ApiError(r.status, data.error || 'Something went wrong.', data.code);
    }
    return data;
  }
  App.api = api;

  /* ---------- events from the server (live stream) ---------- */

  App.on = function (event, fn) {
    (App.handlers[event] = App.handlers[event] || new Set()).add(fn);
    return () => App.handlers[event].delete(fn);
  };
  const emit = (event, data) => { for (const fn of [...(App.handlers[event] || [])]) { try { fn(data); } catch (e) { console.error(e); } } };
  let es = null, poller = null;
  function startStream() {
    stopStream();
    if (!window.EventSource) return;
    es = new EventSource('/app/api/stream');
    for (const ev of ['message', 'deleted', 'refresh']) es.addEventListener(ev, (e) => { let d = {}; try { d = JSON.parse(e.data); } catch (x) { /* ignore */ } emit(ev, d); });
    es.addEventListener('hello', () => emit('connected', {}));
    poller = setInterval(refreshCounts, 60000);
  }
  function stopStream() { if (es) es.close(); es = null; if (poller) clearInterval(poller); poller = null; }

  App.openChannel = null;
  async function refreshCounts() {
    const me = App.state.me;
    if (!me || me.status !== 'active') return;
    try {
      const c = await api('/app/api/channels');
      App.state.channels = c.channels;
      App.state.unread = c.channels.reduce((n, x) => n + x.unread, 0);
      if (me.role !== 'student') { const o = await api('/app/api/manage/overview'); App.state.pending = o.pending + o.reports.length; }
      paintBadges();
    } catch (e) { /* offline: keep old numbers */ }
  }
  App.refreshCounts = refreshCounts;
  function paintBadges() {
    const set = (id, n) => { const b = $('#badge-' + id); if (b) { b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n); } };
    set('chat', App.state.unread); set('manage', App.state.pending);
    if (navigator.setAppBadge) { try { App.state.unread ? navigator.setAppBadge(App.state.unread) : navigator.clearAppBadge(); } catch (e) { /* not supported */ } }
  }
  App.paintBadges = paintBadges;

  App.on('message', (m) => {
    const me = App.state.me;
    if (!me || (m.user && m.user.id === me.id)) return;
    if (m.channel !== App.openChannel) { App.state.unread++; paintBadges(); }
  });
  App.on('refresh', async (d) => {
    if (d.what === 'me') { await loadMe(); render(); }
    else if (d.what === 'pending' || d.what === 'reports') refreshCounts();
  });

  /* ---------- router ---------- */

  App.route = (re, view, opts) => App.routes.push({ re, view, tab: (opts && opts.tab) || null, staff: !!(opts && opts.staff), top: opts && opts.top });
  const path = () => (location.hash || '#/').slice(1) || '/';
  App.go = (p) => { if (path() === p) render(); else location.hash = '#' + p; };
  App.cleanup = (fn) => App.cleanups.push(fn);
  const runCleanups = () => { const list = App.cleanups.splice(0); list.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); App.openChannel = null; };

  App.setTop = function (opts) {
    const top = $('#top');
    if (!top) return;
    top.replaceChildren(
      opts.back ? h('button', { class: 'back', 'aria-label': 'Back', onclick: () => (typeof opts.back === 'string' ? App.go(opts.back) : history.back()) }, '‹') : null,
      h('h1', null, opts.title || 'Smart Cities'),
      opts.right || null);
  };

  let shellFor = null;
  function shell() {
    const me = App.state.me;
    const key = me.id + ':' + me.role;
    if (shellFor === key && $('#view')) return;
    shellFor = key;
    const tabs = [['home', 'Home', '/home'], ['chat', 'Chat', '/chat'], ['ask', 'Ask', '/ask']];
    if (me.role !== 'student') tabs.push(['manage', 'Manage', '/manage']);
    tabs.push(['me', 'Me', '/me']);
    $('#root').replaceChildren(
      h('header', { class: 'top', id: 'top' }),
      h('div', { id: 'banners' }),
      h('main', { id: 'view' }),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, tabs.map(([id, label, to]) =>
        h('a', { href: '#' + to, 'data-tab': id }, App.icon(id), label, (id === 'chat' || id === 'manage') ? h('span', { class: 'badge hidden', id: 'badge-' + id }) : null))));
  }

  async function render() {
    runCleanups();
    const me = App.state.me;
    if (!me) { shellFor = null; stopStream(); return renderGuest(); }
    if (me.status === 'pending') { shellFor = null; return renderWaiting(); }
    if (me.status !== 'active') { App.state.me = null; return renderGuest(); }
    if (me.must_change) { shellFor = null; return renderMustChange(); }
    shell();
    if (!es) { startStream(); refreshCounts(); }
    const banners = $('#banners');
    banners.replaceChildren();
    if (me.muted_until && me.muted_until > Date.now()) banners.append(h('div', { class: 'banner bad' }, `You are muted until ${fmt.full(me.muted_until)}. ${me.mute_reason || ''}`));
    let target = path();
    let route = App.routes.find((x) => x.re.test(target));
    if (!route || (route.staff && me.role === 'student')) { target = '/home'; route = App.routes.find((x) => x.re.test(target)); }
    const params = route.re.exec(target).slice(1).map((v) => (v == null ? v : decodeURIComponent(v)));
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === route.tab));
    const view = $('#view');
    view.replaceChildren();
    view.scrollTop = 0;
    App.setTop({ title: 'Smart Cities', right: me.school ? h('span', { class: 'schoolchip' }, App.schoolDot(me.school.short), me.school.short) : h('span', { class: 'schoolchip' }, 'Admin') });
    paintBadges();
    try { await route.view(view, params); } catch (e) { view.replaceChildren(h('div', { class: 'page' }, h('p', { class: 'error' }, e.message || 'This page could not load.'))); }
  }
  App.render = render;
  window.addEventListener('hashchange', render);

  /* ---------- sign-in screens ---------- */

  function form(fields, submitLabel, onSubmit, extra) {
    const err = h('p', { class: 'error hidden', role: 'alert' });
    const btn = h('button', { class: 'btn primary block', type: 'submit' }, submitLabel);
    const f = h('form', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      err.classList.add('hidden');
      btn.disabled = true;
      try { await onSubmit(); } catch (x) { err.textContent = x.message; err.classList.remove('hidden'); } finally { btn.disabled = false; }
    } }, fields, extra || null, err, btn);
    return f;
  }
  const field = (label, input, hint) => h('label', { class: 'field' }, h('span', null, label), input, hint ? h('small', null, hint) : null);

  function installHelp() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return h('div', { class: 'rules' },
      App.installEvt ? h('button', { class: 'btn primary small', onclick: async () => { App.installEvt.prompt(); App.installEvt = null; } }, 'Install the app')
        : h('span', null, ios ? 'To install: tap Share, then Add to Home Screen.' : 'To install: open the browser menu and choose Install app or Add to Home screen.'));
  }
  App.installHelp = installHelp;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); App.installEvt = e; });

  function renderGuest() {
    const p = path();
    if (p === '/join') return joinView();
    if (p === '/signin') return signInView();
    if (p === '/staff') return staffView();
    if (!App.state.schools.length && !renderGuest.asked) {
      renderGuest.asked = true;
      api('/app/api/schools').then((r) => { App.state.schools = r.schools || []; if (!App.state.me && path() === '/') renderGuest(); }).catch(() => {});
    }
    $('#root').replaceChildren(h('div', { class: 'welcome' },
      h('img', { class: 'logo', src: '/app/icons/icon.svg', alt: '' }),
      h('h1', null, 'Smart Cities'),
      h('p', null, 'Sensors on school buses and cars in Cyprus. See the data, share the maps, talk with your team.'),
      h('div', { class: 'schools' }, App.state.schools.map((s) => h('div', null, App.schoolDot(s.short), s.name))),
      h('div', { class: 'actions' },
        h('a', { class: 'btn primary', href: '#/join' }, 'Join with a school code'),
        h('a', { class: 'btn', href: '#/signin' }, 'Sign in')),
      h('p', { class: 'fine' }, 'Teachers and admins: ', h('a', { href: '#/staff' }, 'staff setup'))));
  }

  function backHeader(title) { return h('header', { class: 'top' }, h('button', { class: 'back', 'aria-label': 'Back', onclick: () => App.go('/') }, '‹'), h('h1', null, title)); }

  async function joinView() {
    let schools = App.state.schools;
    if (!schools.length) { try { schools = App.state.schools = (await api('/app/api/schools')).schools; } catch (e) { schools = []; } }
    let school = null, role = 'student';
    const body = h('div', { class: 'page' });
    const draw = () => {
      body.replaceChildren(
        h('h2', { style: 'margin-bottom:10px' }, '1. Choose your school'),
        h('div', { class: 'schoolpick' }, schools.map((s) => h('button', { type: 'button', class: school === s.id ? 'on' : '', 'aria-pressed': String(school === s.id), onclick: () => { school = s.id; draw(); } }, App.schoolDot(s.short), s.name))),
        school ? joinForm() : h('p', { class: 'muted' }, schools.length ? 'Then you will enter the school code your teacher gave you.' : 'The school list could not load. Check your connection.'));
    };
    const joinForm = () => {
      const code = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'XXXX-XXXX', 'aria-label': 'School code' });
      const name = h('input', { type: 'text', autocomplete: 'off', maxlength: '24', 'aria-label': 'Display name' });
      const pw = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Password' });
      const consent = h('input', { type: 'checkbox', id: 'consent' });
      return h('div', null,
        h('h2', { style: 'margin:6px 0 10px' }, '2. Your details'),
        h('div', { class: 'seg' }, ['student', 'teacher'].map((r) => h('button', { type: 'button', class: role === r ? 'on' : '', onclick: () => { role = r; draw(); } }, r === 'student' ? 'I am a student' : 'I am a teacher'))),
        form([
          field(role === 'teacher' ? 'Teacher code' : 'School code', code, role === 'teacher' ? 'Ask the project admin for the teacher code.' : 'Your teacher gave you this code.'),
          field('Display name', name, 'Other people see this. Use your first name and an initial. Do not use your full name.'),
          field('Password', pw, 'At least 8 characters. Do not share it.'),
          h('label', { class: 'check' }, consent, h('span', null, 'I know my teachers can read the chat and my questions to the assistant, and that I must not share private details.')),
        ], 'Ask to join', async () => {
          const r = await api('/app/api/join', { school_id: school, role, code: code.value, name: name.value, password: pw.value, consent: consent.checked });
          App.state.me = r.user; await loadMe(); location.hash = '#/'; render();
        }));
    };
    draw();
    $('#root').replaceChildren(backHeader('Join'), h('div', { class: 'sheetpage' }, body));
  }

  async function signInView() {
    let schools = App.state.schools;
    if (!schools.length) { try { schools = App.state.schools = (await api('/app/api/schools')).schools; } catch (e) { schools = []; } }
    const sel = h('select', { 'aria-label': 'School' }, schools.map((s) => h('option', { value: s.id }, s.name)), h('option', { value: 'staff' }, 'Admin (no school)'));
    const last = store('sc_school'); if (last) sel.value = last;
    const name = h('input', { type: 'text', autocomplete: 'username', 'aria-label': 'Display name' });
    const pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Password' });
    $('#root').replaceChildren(backHeader('Sign in'), h('div', { class: 'sheetpage' }, h('div', { class: 'page' },
      form([field('School', sel), field('Display name', name), field('Password', pw)], 'Sign in', async () => {
        const r = await api('/app/api/login', { school_id: sel.value, name: name.value, password: pw.value });
        store('sc_school', sel.value);
        App.state.me = r.user; await loadMe(); location.hash = '#/home'; render();
      }, h('p', { class: 'muted small' }, 'Forgot your password? Ask your teacher to reset it.')))));
  }

  function staffView() {
    const code = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Setup code' });
    const name = h('input', { type: 'text', autocomplete: 'username', maxlength: '24', 'aria-label': 'Display name' });
    const pw = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Password' });
    $('#root').replaceChildren(backHeader('Admin setup'), h('div', { class: 'sheetpage' }, h('div', { class: 'page' },
      h('p', { class: 'muted' }, 'Creates an admin account for the whole project. You need the setup code that was set on the server (ADMIN_SETUP_CODE). Teachers do not use this: they join with their school\'s teacher code.'),
      form([field('Setup code', code), field('Display name', name), field('Password', pw, 'At least 8 characters.')], 'Create admin account', async () => {
        const r = await api('/app/api/admin-join', { setup_code: code.value, name: name.value, password: pw.value });
        App.state.me = r.user; await loadMe(); location.hash = '#/home'; render();
      }))));
  }

  function renderWaiting() {
    const me = App.state.me;
    $('#root').replaceChildren(h('header', { class: 'top' }, h('h1', null, 'Smart Cities')),
      h('div', { class: 'sheetpage' }, h('div', { class: 'page waiting' },
        h('div', { class: 'pulse' }),
        h('h2', null, 'Waiting for approval'),
        h('p', { class: 'muted' }, `${me.name} · ${me.school ? me.school.name : ''}`),
        h('p', null, me.role === 'teacher' ? 'The project admin has to approve your teacher account.' : 'A teacher at your school has to approve you. This page updates by itself.'),
        h('p', { class: 'muted small' }, 'You can close the app and come back later.'),
        h('button', { class: 'btn', onclick: signOut }, 'Sign out'))));
    const timer = setInterval(async () => {
      try { const before = App.state.me.status; await loadMe(); if (!App.state.me || App.state.me.status !== before) render(); } catch (e) { /* offline */ }
    }, 8000);
    App.cleanup(() => clearInterval(timer));
  }

  function renderMustChange() {
    const pw = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'New password' });
    $('#root').replaceChildren(h('header', { class: 'top' }, h('h1', null, 'Choose a new password')),
      h('div', { class: 'sheetpage' }, h('div', { class: 'page' },
        h('p', null, 'A teacher reset your password. Choose a new one that only you know.'),
        form([field('New password', pw, 'At least 8 characters.')], 'Save password', async () => {
          await api('/app/api/me/password', { password: pw.value });
          await loadMe(); render();
        }))));
  }

  async function signOut() {
    try { await api('/app/api/logout', {}); } catch (e) { /* already signed out */ }
    App.state.me = null; stopStream(); shellFor = null; location.hash = '#/'; render();
  }
  App.signOut = signOut;

  async function loadMe() {
    try {
      const r = await api('/app/api/me');
      App.state.me = Object.assign({}, r.user);
      App.state.bot = r.bot.configured; App.state.reasons = r.reasons; App.state.helplines = r.helplines;
    } catch (e) {
      if (e.status === 401) App.state.me = null;
      else if (!App.state.me) throw e;
    }
    return App.state.me;
  }
  App.loadMe = loadMe;

  App.start = async function () {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden && App.state.me) refreshCounts(); });
    try { await loadMe(); } catch (e) { $('#root').replaceChildren(h('div', { class: 'page' }, h('p', { class: 'error' }, e.message))); return; }
    render();
  };
  document.addEventListener('DOMContentLoaded', () => App.start());
})();
