/*
  Sensor guides: one sheet for each kind of sensor (what it measures, normal range, common mistakes).
    #/guides                          cards for every guide
    #/guides?doc=<name or title>      opens that guide's sheet  (also #/guides/<name>)
  Sources: GET /app/api/handbook/public -> { docs:[{ title, body, updated_at }] }; the guides are the pages titled "Sensor guide: <name>".
           They are written by teachers in the handbook and the assistant reads the same pages.
           /api/latest + /api/devices (+ /api/config for the names): the live mini reading on every card and in every sheet,
           the range across our sensors that report this measurement right now. No positions are read or shown (GPS has no live reading).
  Nothing is invented: a guide without a live sensor says "our sensors do not measure this", an old reading says how old it is.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  SC.css('/site/pages/guides.css');

  const HOUR = 3600000, FRESH = 3 * HOUR;
  const GUIDE_RE = /^\s*sensor guide\s*[:\-–]\s*/i;
  const fold = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const dateOf = (v) => { const n = typeof v === 'number' ? v : Date.parse(v); return isFinite(n) && n > 0 ? n : null; };

  /* the kinds of sensor we know how to connect to a live reading (regexes run on accent-free lower case) */
  const KINDS = [
    { k: 'temp', re: /temperat|θερμοκρ/, mid: '4097', ic: 'thermo' },
    { k: 'hum', re: /humid|υγρασ/, mid: '4098', ic: 'drop' },
    { k: 'light', re: /light|lux|φως|φωτ/, mid: '4099', ic: 'sun' },
    { k: 'co2', re: /co2|carbon|διοξειδ|ανθρακα/, mid: '4100', ic: 'cloud' },
    { k: 'press', re: /pressure|baromet|πιεση/, mid: '4101', ic: 'gauge' },
    { k: 'pm', re: /pm ?(2|10)|particle|σωματιδ/, mid: null, ic: 'dust', name: /particulate|pm/ },
    { k: 'noise', re: /noise|sound|θορυβ/, mid: null, ic: 'wave', name: /noise|sound|θορυβ/ },
    { k: 'wind', re: /wind|ανεμ/, mid: null, ic: 'wave', ref: true },
    { k: 'station', re: /station|σταθμ/, mid: null, ic: 'pin', ref: true },
    { k: 'gps', re: /gps|position|location|θεση/, mid: null, ic: 'pin', priv: true },
  ];
  const ICONS = {
    thermo: '<path d="M10 14.5V5a2 2 0 014 0v9.5a4 4 0 11-4 0z"/><path d="M12 9v7"/>',
    drop: '<path d="M12 3s6 6.2 6 10.5a6 6 0 01-12 0C6 9.2 12 3 12 3z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
    cloud: '<path d="M7 18a4 4 0 01-.5-7.97A5.5 5.5 0 0117 9a4.5 4.5 0 01.5 9z"/>',
    gauge: '<path d="M4 16a8 8 0 1116 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1"/>',
    dust: '<circle cx="7" cy="8" r="1.4"/><circle cx="14" cy="6" r="1"/><circle cx="17" cy="11" r="1.6"/><circle cx="10" cy="13" r="1.1"/><circle cx="6" cy="17" r="1"/><circle cx="14" cy="18" r="1.4"/>',
    wave: '<path d="M3 12h2l2-6 3 12 3-9 2 5 2-2h4"/>',
    pin: '<path d="M12 21s7-6 7-12a7 7 0 10-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    sensor: '<circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M4.9 4.9a10 10 0 000 14.2M19.1 4.9a10 10 0 010 14.2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', back: '<path d="M15 6l-6 6 6 6"/>', fwd: '<path d="M9 6l6 6-6 6"/>',
  };
  function ic(name, size) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    s.innerHTML = ICONS[name] || '';   // static strings only
    return s;
  }

  /* the sections of a guide: "What it measures", "Normal range", "Common mistakes" (labels may be a line of their own or start a line) */
  const LABELS = [
    ['what', /^(what it measures|what this measures)\b/i, T('What it measures', 'Τι μετρά')],
    ['whatis', /^(what it is|what is it)\b/i, T('What it is', 'Τι είναι')],
    ['holds', /^what a reading holds\b/i, T('What a reading holds', 'Τι περιέχει μια μέτρηση')],
    ['range', /^(normal range|typical range|usual range|normal values|what is normal)\b/i, T('Normal range', 'Κανονικό εύρος')],
    ['mistakes', /^(common mistakes|mistakes|common errors|pitfalls|things that go wrong)\b/i, T('Common mistakes', 'Συνηθισμένα λάθη')],
  ];
  function sections(body) {
    const out = []; let cur = null;
    const start = (key, label) => { cur = { key, label, lines: [] }; out.push(cur); };
    String(body || '').split(/\r?\n/).forEach((raw) => {
      let line = raw.trim().replace(/^#{1,4}\s+/, '').replace(/^\*\*(.+?)\*\*:?\s*/, '$1: ');
      if (!line) { if (cur) cur.lines.push(''); return; }
      let hitLabel = null;
      for (const L of LABELS) { const m = line.match(L[1]); if (m) { hitLabel = L; line = line.slice(m[0].length).replace(/^\s*[:\-–]?\s*/, ''); break; } }
      if (hitLabel) { start(hitLabel[0], hitLabel[2]); if (line) cur.lines.push(line); return; }
      if (!cur) start('intro', '');
      cur.lines.push(line);
    });
    out.forEach((s) => { while (s.lines.length && !s.lines[0]) s.lines.shift(); while (s.lines.length && !s.lines[s.lines.length - 1]) s.lines.pop(); });
    return out.filter((s) => s.lines.length);
  }
  function lines2nodes(lines) {
    const out = []; let list = null;
    lines.forEach((line) => {
      if (!line) { list = null; return; }
      let m;
      if ((m = line.match(/^[-*•]\s+(.*)$/))) { if (!list || list.tagName !== 'UL') { list = el('ul'); out.push(list); } list.append(el('li', null, m[1])); return; }
      if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { if (!list || list.tagName !== 'OL') { list = el('ol'); out.push(list); } list.append(el('li', null, m[1])); return; }
      list = null; out.push(el('p', null, line));
    });
    return out;
  }
  const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const firstSentence = (txt, n) => { const t = String(txt || '').replace(/\s+/g, ' ').trim(); const m = t.match(/^(.+?[.!?])(\s|$)/); const s = m ? m[1] : t; return s.length > (n || 140) ? s.slice(0, s.lastIndexOf(' ', n || 140) > 30 ? s.lastIndexOf(' ', n || 140) : n || 140) + ' …' : s; };

  SC.register('guides', {
    title: ['Sensor guides', 'Οδηγοί αισθητήρων'],
    async render(root, ctx) {
      const D = { docs: null, docsErr: null, latest: null, devs: [], cfg: null, liveErr: null, at: 0 };
      let alive = true, timer = 0, sheet = null, lastSig = '';
      const cfg0 = await SC.cached('/api/config', 600000).catch(() => null);
      D.cfg = cfg0;
      const head = SC.head({
        title: T('Sensor guides', 'Οδηγοί αισθητήρων'),
        tags: cfg0 && cfg0.demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
        lede: T('One sheet for each kind of sensor: what it measures, what is normal, and the mistakes to avoid. Each sheet also shows what our own sensors read right now. The assistant reads these guides too.',
          'Ένα φύλλο για κάθε είδος αισθητήρα: τι μετρά, τι είναι φυσιολογικό και ποια λάθη να αποφύγετε. Κάθε φύλλο δείχνει και τι μετρούν τώρα οι δικοί μας αισθητήρες. Τους οδηγούς τούς διαβάζει και ο βοηθός.'),
        help: [
          'Each card is one kind of sensor. The big numbers are the range of the readings of our sensors in the last 3 hours, so you can see whether the guide’s normal range fits what we measure. Open a card for the full sheet and the reading of each sensor. The guides are written by teachers in the handbook; the assistant reads the same pages. Positions are never shown: GPS has no live reading.',
          'Κάθε κάρτα είναι ένα είδος αισθητήρα. Οι μεγάλοι αριθμοί είναι το εύρος των μετρήσεων των αισθητήρων μας τις τελευταίες 3 ώρες, ώστε να δείτε αν το φυσιολογικό εύρος του οδηγού ταιριάζει με ό,τι μετράμε. Ανοίξτε μια κάρτα για το πλήρες φύλλο και τη μέτρηση κάθε αισθητήρα. Οι οδηγοί γράφονται από εκπαιδευτικούς στο εγχειρίδιο· ο βοηθός διαβάζει τις ίδιες σελίδες. Οι θέσεις δεν εμφανίζονται ποτέ: το GPS δεν έχει ζωντανή μέτρηση.',
        ],
      });
      root.append(head);
      const body = el('div', { class: 'gd' }, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      root.append(body);

      /* ---------- data ---------- */
      const nameOfMid = (m) => (D.cfg && D.cfg.names && D.cfg.names[m] ? D.cfg.names[m][0] : null);
      const unitOfMid = (m) => (D.cfg && D.cfg.names && D.cfg.names[m] ? D.cfg.names[m][1] : '');
      const gpsMids = () => (D.cfg && Array.isArray(D.cfg.gps) ? D.cfg.gps.map(String) : ['4197', '4198']);
      function kindOf(name) {
        const f = fold(name);
        const k = KINDS.find((x) => x.re.test(f));
        let mid = k ? k.mid : null;
        if (k && !mid && k.name && D.cfg && D.cfg.names) mid = Object.keys(D.cfg.names).find((m) => k.name.test(fold(D.cfg.names[m][0]))) || null;
        if (!k && D.cfg && D.cfg.names) mid = Object.keys(D.cfg.names).find((m) => fold(D.cfg.names[m][0]) && f.includes(fold(D.cfg.names[m][0]))) || null;
        if (mid && gpsMids().includes(String(mid))) mid = null;
        return { k: k ? k.k : 'other', ic: k ? k.ic : 'sensor', mid, priv: Boolean(k && k.priv), ref: Boolean(k && k.ref) };
      }
      const guides = () => (D.docs || []).filter((d) => GUIDE_RE.test(d.title)).map((d) => {
        const name = d.title.replace(GUIDE_RE, '').trim(), kd = kindOf(name), sec = sections(d.body);
        const what = sec.find((s) => s.key === 'what' || s.key === 'whatis') || sec[0];
        return Object.assign({ name, kd, sec, blurb: what ? cap(firstSentence(what.lines.filter(Boolean).join(' ').replace(/^[-*•]\s*/, ''))) : '' }, d);
      }).sort((a, b) => a.name.localeCompare(b.name));

      // the live range for a measurement: readings of the last 3 hours across our sensors
      function live(mid) {
        if (!mid || !D.latest) return null;
        const rows = [];
        Object.keys(D.latest).forEach((eui) => {
          const r = D.latest[eui] && D.latest[eui][mid];
          if (!r || !fin(Number(r.v))) return;
          const dev = D.devs.find((d) => d.eui === eui);
          rows.push({ eui, name: dev ? dev.name : eui, online: dev ? dev.online !== false : true, v: Number(r.v), t: dateOf(r.t) });
        });
        if (!rows.length) return { n: 0, rows, mid };
        const fresh = rows.filter((r) => r.t && Date.now() - r.t <= FRESH);
        const newest = rows.reduce((m, r) => Math.max(m, r.t || 0), 0);
        const vs = fresh.map((r) => r.v);
        return { n: fresh.length, silent: rows.length - fresh.length, rows: rows.sort((a, b) => a.name.localeCompare(b.name)), mid, min: vs.length ? Math.min(...vs) : null, max: vs.length ? Math.max(...vs) : null, newest: newest || null, unit: unitOfMid(mid) };
      }
      const dec = (mid, v) => (Math.abs(v) >= 1000 || mid === '4099' || mid === '4100' ? 0 : 1);
      const fmt = (mid, v) => SC.num(v, dec(mid, v)) + (unitOfMid(mid) ? ' ' + unitOfMid(mid) : '');

      async function loadDocs() {
        D.docsErr = null;
        try {
          const r = await SC.api('/app/api/handbook/public');
          D.docs = (r && Array.isArray(r.docs) ? r.docs : []).filter((d) => d && d.title).map((d) => ({ title: String(d.title), body: String(d.body || ''), at: dateOf(d.updated_at) }));
        } catch (e) { D.docs = null; D.docsErr = e; }
      }
      async function loadLive() {
        const [lat, dev, cfg] = await Promise.allSettled([SC.api('/api/latest'), SC.api('/api/devices'), SC.cached('/api/config', 600000)]);
        if (cfg.status === 'fulfilled') D.cfg = cfg.value;
        if (lat.status === 'fulfilled' && dev.status === 'fulfilled') { D.latest = lat.value || {}; D.devs = Array.isArray(dev.value) ? dev.value : (dev.value && dev.value.devices) || []; D.liveErr = null; D.at = Date.now(); }
        else { D.liveErr = (lat.status === 'rejected' ? lat.reason : dev.reason); if (!D.latest) D.latest = null; }
      }

      /* ---------- the mini reading (card and sheet) ---------- */
      function strip(L) {
        const fresh = L.rows.filter((r) => r.t && Date.now() - r.t <= FRESH);
        const lo = L.min, hi = L.max, span = hi - lo;
        const box = el('div', { class: 'gd-strip', 'aria-hidden': 'true' }, el('i', { class: 'gd-axis' }));
        fresh.forEach((r) => { const dot = el('b', { class: 'gd-dot' }); dot.style.left = (span > 1e-9 ? 6 + (r.v - lo) / span * 88 : 50) + '%'; box.append(dot); });
        return box;
      }
      function mini(kd) {
        if (kd.priv) return el('div', { class: 'gd-live off' }, el('div', { class: 'gd-live-t' }, T('No live reading by design', 'Χωρίς ζωντανή μέτρηση εκ σχεδιασμού')), el('small', null, T('Public pages show a vehicle about 1 km off and at least 2 hours late. Never live.', 'Οι δημόσιες σελίδες δείχνουν ένα όχημα με απόκλιση περίπου 1 χλμ και καθυστέρηση τουλάχιστον 2 ωρών. Ποτέ ζωντανά.')));
        if (D.liveErr && !D.latest) return el('div', { class: 'gd-live off' }, el('div', { class: 'gd-live-t' }, T('Live reading not available', 'Η ζωντανή μέτρηση δεν είναι διαθέσιμη')), el('small', null, D.liveErr.message));
        if (kd.ref) return el('div', { class: 'gd-live off' }, el('div', { class: 'gd-live-t' }, kd.k === 'station' ? T('Official stations, not our sensors', 'Επίσημοι σταθμοί, όχι οι αισθητήρες μας') : T('From the Met Office stations', 'Από τους σταθμούς της Μετεωρολογικής')),
          el('small', null, kd.k === 'station' ? T('The live readings of the stations are on the ', 'Οι ζωντανές μετρήσεις των σταθμών βρίσκονται στο ') : T('Our own sensors do not measure this. The official stations do: see the ', 'Οι δικοί μας αισθητήρες δεν το μετρούν. Το μετρούν οι επίσημοι σταθμοί: δείτε το '), el('a', { class: 'link', href: '#/weather', onclick: (e) => e.stopPropagation() }, T('Met Office record', 'μετεωρολογικό αρχείο')), '.'));
        if (!kd.mid) return el('div', { class: 'gd-live off' }, el('div', { class: 'gd-live-t' }, T('Not measured by our sensors', 'Δεν μετράται από τους αισθητήρες μας')), el('small', null, T('No sensor of ours reports this, so there is nothing live to show.', 'Κανένας δικός μας αισθητήρας δεν το αναφέρει, οπότε δεν υπάρχει κάτι ζωντανό να δείξουμε.')));
        const L = live(kd.mid);
        if (!L || !L.rows.length) return el('div', { class: 'gd-live off' }, el('div', { class: 'gd-live-t' }, T('No reading yet', 'Καμία μέτρηση ακόμα')), el('small', null, T('Our sensors have not sent this measurement.', 'Οι αισθητήρες μας δεν έχουν στείλει αυτή τη μέτρηση.')));
        if (!L.n) return el('div', { class: 'gd-live stale' }, el('div', { class: 'gd-live-t' }, T('Old readings only', 'Μόνο παλιές μετρήσεις')), el('small', null, T('Newest reading ' + SC.ago(L.newest) + ': ' + fmt(kd.mid, L.rows[0].v) + (L.rows.length > 1 ? ' and others' : ''), 'Νεότερη μέτρηση ' + SC.ago(L.newest) + ': ' + fmt(kd.mid, L.rows[0].v) + (L.rows.length > 1 ? ' και άλλες' : ''))));
        const same = Math.abs(L.max - L.min) < Math.pow(10, -dec(kd.mid, L.max));
        return el('div', { class: 'gd-live' },
          el('div', { class: 'gd-live-k' }, T('Our sensors now', 'Οι αισθητήρες μας τώρα')),
          el('div', { class: 'gd-live-v mono' }, same ? fmt(kd.mid, L.min) : SC.num(L.min, dec(kd.mid, L.min)) + ' – ' + fmt(kd.mid, L.max)),
          strip(L),
          el('small', null, T(L.n + (L.n === 1 ? ' sensor' : ' sensors') + ', newest ' + SC.ago(L.newest), L.n + (L.n === 1 ? ' αισθητήρας' : ' αισθητήρες') + ', νεότερη ' + SC.ago(L.newest)) + (L.silent ? T(', ' + L.silent + ' not heard from lately', ', ' + L.silent + ' χωρίς πρόσφατη επικοινωνία') : '')));
      }

      /* ---------- cards ---------- */
      function drawCards() {
        if (D.docsErr) {
          body.replaceChildren(el('div', { class: 'gd-errbox' }, el('div', { class: 'err', role: 'alert' }, T('Could not load the sensor guides. ', 'Δεν φορτώθηκαν οι οδηγοί αισθητήρων. '), el('span', { class: 'muted' }, D.docsErr.message)),
            el('div', null, el('button', { class: 'nm-btn', type: 'button', onclick: async () => { body.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); await loadDocs(); if (alive) { drawCards(); openFromUrl(); } } }, T('Try again', 'Δοκιμάστε ξανά')))));
          return;
        }
        const list = guides();
        const keep = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;
        const parts = [];
        if (D.liveErr && !D.latest) parts.push(el('div', { class: 'nm-callout nm-callout--warn gd-note' }, T('Live readings could not be loaded, so the cards show the guides only. ', 'Οι ζωντανές μετρήσεις δεν φορτώθηκαν, οπότε οι κάρτες δείχνουν μόνο τους οδηγούς. '), el('button', { class: 'link', type: 'button', onclick: refresh }, T('Try again', 'Δοκιμάστε ξανά'))));
        else if (D.liveErr) parts.push(el('div', { class: 'nm-callout nm-callout--warn gd-note' }, T('The last refresh failed, so these readings are from ' + SC.ago(D.at) + '.', 'Η τελευταία ανανέωση απέτυχε, οπότε αυτές οι μετρήσεις είναι από ' + SC.ago(D.at) + '.')));
        if (!list.length) {
          parts.push(el('div', { class: 'empty' }, T('No sensor guides have been published yet. Teachers add handbook pages titled “Sensor guide: …” in the student app, and each one becomes a card here.', 'Δεν έχουν δημοσιευτεί ακόμα οδηγοί αισθητήρων. Οι εκπαιδευτικοί προσθέτουν σελίδες εγχειριδίου με τίτλο «Sensor guide: …» στην εφαρμογή μαθητών και κάθε μία γίνεται κάρτα εδώ.')));
        } else {
          const grid = el('div', { class: 'cols-3 gd-grid' });
          list.forEach((g) => grid.append(el('article', { class: 'nm-card nm-lift gd-card', onclick: (e) => { if (!e.target.closest('button')) open(g, e.currentTarget.querySelector('.gd-open')); } },
            el('div', { class: 'gd-top' }, el('span', { class: 'nm-icon-tile' }, ic(g.kd.ic, 22)), el('div', null, el('div', { class: 'card-eye' }, T('Sensor guide', 'Οδηγός αισθητήρα')), el('h2', { class: 'card-h' }, g.name))),
            g.blurb ? el('p', { class: 'gd-blurb' }, g.blurb) : null,
            mini(g.kd),
            el('button', { class: 'gd-open', type: 'button', 'data-k': 'g-' + g.name, 'aria-label': T('Open the guide for ' + g.name, 'Άνοιγμα του οδηγού για ' + g.name), onclick: (e) => open(g, e.currentTarget) }, T('Open the sheet', 'Άνοιγμα φύλλου'), ic('arrow', 16)))));
          parts.push(grid);
        }
        body.replaceChildren(...parts);
        if (keep) { const n = body.querySelector('[data-k="' + (window.CSS && CSS.escape ? CSS.escape(keep) : keep) + '"]'); if (n) n.focus({ preventScroll: true }); }
        drawFresh();
      }
      function drawFresh() {
        const old = head.querySelector('.fresh-pill'); if (old) old.remove();
        if (!D.latest) return;
        const newest = Object.keys(D.latest).reduce((m, e) => { Object.keys(D.latest[e] || {}).forEach((k) => { const t = dateOf(D.latest[e][k] && D.latest[e][k].t); if (t && t > m && !gpsMids().includes(k)) m = t; }); return m; }, 0);
        if (!newest) return;
        const stale = Date.now() - newest > FRESH;
        const pill = el('span', { class: 'fresh-pill' + (stale ? ' gd-old' : '') }, el('i'), stale ? T('Old · last reading ' + SC.ago(newest), 'Παλιά · τελευταία μέτρηση ' + SC.ago(newest)) : T('Live · ' + SC.ago(newest), 'Ζωντανά · ' + SC.ago(newest)));
        const h1 = head.querySelector('.page-head h1'); if (h1) h1.after(pill);
      }

      /* ---------- the sheet ---------- */
      function urlFor(g) { try { history.replaceState(history.state, '', g ? '#/guides?doc=' + encodeURIComponent(g.name) : '#/guides'); } catch (e) { /* keep the address */ } }
      function close(leaving) {
        if (!sheet) return;
        const s = sheet; sheet = null;
        document.removeEventListener('keydown', s.onKey);
        s.scrim.remove(); document.body.classList.remove('gd-lock');
        if (leaving !== true) { urlFor(null); if (s.opener && s.opener.isConnected) s.opener.focus({ preventScroll: true }); }
      }
      function sheetLive(g) {
        const kd = g.kd, lab = kd.ref ? T('Where the live data is', 'Πού βρίσκονται τα ζωντανά δεδομένα') : T('Our sensors right now', 'Οι αισθητήρες μας τώρα');
        const wrap = el('section', { class: 'gd-sh-live', 'aria-label': lab });
        wrap.append(el('div', { class: 'card-eye' }, lab));
        if (kd.priv || kd.ref || !kd.mid || (D.liveErr && !D.latest)) { wrap.append(mini(kd)); return wrap; }
        const L = live(kd.mid);
        if (!L || !L.rows.length) { wrap.append(mini(kd)); return wrap; }
        wrap.append(mini(kd));
        wrap.append(el('ul', { class: 'gd-rows' }, L.rows.map((r) => {
          const old = !r.t || Date.now() - r.t > FRESH;
          return el('li', { class: old ? 'old' : '' }, el('span', { class: 'gd-dev' }, el('i', { class: 'gd-st ' + (old ? 'warn' : 'ok') }), r.name), el('b', { class: 'mono' }, fmt(kd.mid, r.v)), el('small', null, r.t ? SC.ago(r.t) : T('no time', 'χωρίς ώρα')));
        })));
        wrap.append(el('p', { class: 'gd-sh-note muted' }, T('Vehicle sensors read the air around the vehicle, not the weather of the town. Sun on the roof, an open window or the people inside change the numbers. Check the guide’s “Common mistakes” before you compare.', 'Οι αισθητήρες των οχημάτων μετρούν τον αέρα γύρω από το όχημα, όχι τον καιρό της πόλης. Ο ήλιος στην οροφή, ένα ανοιχτό παράθυρο ή οι άνθρωποι μέσα αλλάζουν τους αριθμούς. Δείτε τα «Συνηθισμένα λάθη» του οδηγού πριν συγκρίνετε.')));
        return wrap;
      }
      function open(g, opener) {
        if (sheet) { const o = sheet.opener; close(true); opener = opener || o; }
        const list = guides(), i = list.findIndex((x) => x.title === g.title);
        const prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
        const closeBtn = el('button', { class: 'gd-x', type: 'button', 'aria-label': T('Close the sheet', 'Κλείσιμο φύλλου'), onclick: () => close() }, ic('close', 20));
        const panel = el('aside', { class: 'gd-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gd-sh-h', tabindex: '-1' },
          el('header', { class: 'gd-sh-top' }, el('span', { class: 'nm-icon-tile' }, ic(g.kd.ic, 22)), el('div', { class: 'gd-sh-t' }, el('div', { class: 'card-eye' }, T('Sensor guide', 'Οδηγός αισθητήρα')), el('h2', { id: 'gd-sh-h' }, g.name)), closeBtn),
          el('div', { class: 'gd-sh-body' },
            sheetLive(g),
            ...g.sec.map((s) => el('section', { class: 'gd-sec gd-sec-' + s.key }, s.label ? el('h3', null, s.label) : null, lines2nodes(s.lines))),
            el('div', { class: 'gd-sh-foot' },
              el('div', { class: 'gd-tags' }, el('span', { class: 't team' }, T('Written by teachers', 'Γραμμένο από εκπαιδευτικούς')), g.at ? el('span', { class: 'muted' }, T('Updated ' + SC.date(g.at), 'Ενημερώθηκε ' + SC.date(g.at))) : null),
              el('p', { class: 'muted' }, T('The assistant reads this guide too.', 'Αυτόν τον οδηγό τον διαβάζει και ο βοηθός.')),
              el('div', { class: 'gd-acts' },
                el('a', { class: 'pill-link', href: '#/ask?q=' + encodeURIComponent(T('What is a normal ' + g.name + ' reading and how do our sensors compare?', 'Ποια είναι μια κανονική τιμή για ' + g.name + ' και πώς συγκρίνονται οι αισθητήρες μας;')) }, T('Ask the assistant', 'Ρωτήστε τον βοηθό'), ic('arrow', 14)),
                el('a', { class: 'pill-link', href: '#/library?tab=guides&doc=' + encodeURIComponent(g.name) }, T('Open in the library', 'Άνοιγμα στη βιβλιοθήκη'), ic('arrow', 14))),
              list.length > 1 ? el('div', { class: 'gd-pn' },
                el('button', { class: 'nm-btn', type: 'button', onclick: () => open(prev, opener) }, ic('back', 16), el('span', null, prev.name)),
                el('button', { class: 'nm-btn', type: 'button', onclick: () => open(next, opener) }, el('span', null, next.name), ic('fwd', 16))) : null)));
        const scrim = el('div', { class: 'gd-scrim', onclick: (e) => { if (e.target === scrim) close(); } }, panel);
        const onKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault(); close(); return; }
          if (e.key !== 'Tab') return;
          const f = Array.from(panel.querySelectorAll('a[href], button:not([disabled])')).filter((n) => n.offsetParent !== null);
          if (!f.length) return;
          const a = document.activeElement, first = f[0], last = f[f.length - 1];
          if (e.shiftKey && (a === first || a === panel)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
        };
        document.body.append(scrim); document.body.classList.add('gd-lock');
        document.addEventListener('keydown', onKey);
        sheet = { g, scrim, panel, onKey, opener: opener || document.activeElement };
        urlFor(g);
        closeBtn.focus({ preventScroll: true });
      }
      function openFromUrl() {
        const want = ctx.query.get('doc') || (ctx.args[0] || '');
        if (!want || !D.docs) return;
        const w = fold(want).replace(GUIDE_RE, ''), g = guides().find((x) => fold(x.name) === w || fold(x.title) === fold(want));
        if (g) open(g, body.querySelector('.gd-open'));
      }

      /* ---------- refresh ---------- */
      async function refresh() {
        await loadLive();
        if (!alive) return;
        const sig = JSON.stringify([D.latest, D.liveErr && D.liveErr.message]);
        if (sig === lastSig) return;
        lastSig = sig;
        drawCards();
        if (sheet) { const old = sheet.panel.querySelector('.gd-sh-live'); if (old) old.replaceWith(sheetLive(sheet.g)); }
      }

      await Promise.all([loadDocs(), loadLive()]);
      if (!alive) return () => {};
      lastSig = JSON.stringify([D.latest, D.liveErr && D.liveErr.message]);
      drawCards();
      openFromUrl();
      timer = setInterval(refresh, 60000);
      return () => { alive = false; clearInterval(timer); close(true); };
    },
  });
})();
