/*
  Alerts. Rule-based: a rule fires when a reading crosses a line, and every alert shows its rule, its source and the time.
  Nobody is named. The rules come from GET /app/api/alerts/rules (teachers change them in Settings; the standard lines are
  used when the server has none). Everything is checked in the browser on public data by /site/alerts-core.js, the same
  evaluator that fills the number on the menu, so the page and the badge agree.
  Sources: /api/devices /api/latest /api/cydom /api/opensensors /api/dom/page?name=warnings /api/series /api/cydom/history.
  No coordinates are shown, only "about N km from <school>". Refreshes every 60 s. Mutes live in this browser only.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  const sv = (tag, attrs, ...kids) => SC.svgEl(tag, attrs, ...kids.flat(Infinity));
  SC.css('/site/pages/alerts.css');
  const fill = (box, ...kids) => box.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the shell loads alerts-core.js itself (script #alerts-core); wait for that one, or add it
  function loadCore() {
    if (SC.alertsEvaluate) return Promise.resolve();
    return new Promise((ok, no) => {
      const done = () => (SC.alertsEvaluate ? ok() : no(new Error('alerts-core.js did not start')));
      let s = document.getElementById('alerts-core');
      if (!s) { s = document.createElement('script'); s.id = 'alerts-core'; s.src = '/site/alerts-core.js'; document.head.append(s); }
      s.addEventListener('load', done); s.addEventListener('error', () => no(new Error('alerts-core.js could not be loaded')));
      let n = 0;
      const poll = setInterval(() => { if (SC.alertsEvaluate) { clearInterval(poll); ok(); } else if (++n > 100) { clearInterval(poll); no(new Error('alerts-core.js could not be loaded')); } }, 50);
    });
  }

  /* ---------- icons ---------- */
  const PATH = {
    air: '<path d="M3 9h11a3 3 0 10-3-3M3 15h15a3 3 0 11-3 3M3 12h8"/>',
    battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10v4M5 10v4"/>',
    temp: '<path d="M10 14.5V5a2 2 0 014 0v9.5a4 4 0 11-4 0z"/><path d="M12 9v7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M5 19l1.8-1.8M17.2 6.8L19 5"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    muteBell: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0M3 3l18 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    doc: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    radio: '<circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3"/><circle cx="8" cy="15" r=".8"/><circle cx="16" cy="15" r=".8"/>',
    sensor: '<circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M4.9 4.9a10 10 0 000 14.2M19.1 4.9a10 10 0 010 14.2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    refresh: '<path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5"/>',
  };
  function ico(name) {
    const s = sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'al-svg' });
    s.innerHTML = PATH[name] || '';   // static strings above, never data
    return s;
  }
  const TONE = { high: 'bad', medium: 'warn', info: 'info' }, CLS = { high: 'hi', medium: 'md', info: 'in' };
  const LVL = { high: T('High', 'Υψηλό'), medium: T('Medium', 'Μεσαίο'), info: T('Info', 'Πληροφορία') };
  const COL = { high: '#FF7A6A', medium: '#F0B94A', info: '#4CCBEA' };
  const CAT = { air: T('Air', 'Αέρας'), weather: T('Weather', 'Καιρός'), sensors: T('Sensors', 'Αισθητήρες') };

  /* ---------- small charts ---------- */
  let uid = 0;
  const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  const f1 = (n) => Math.round(n * 10) / 10;
  const TXT = { 'font-family': 'Inter,sans-serif', 'font-size': 9.5, fill: '#7f93ab' };

  // a line of readings with its limit: pts [{ t, v }], o { from, to, thr, color, dec, unit, mark: { t, label }, label }
  function lineSvg(pts, o) {
    const W = 316, H = 92, L = 36, R = 6, TP = 8, B = 18, w = W - L - R, h = H - TP - B, id = 'al' + (++uid);
    let lo = o.thr, hi = o.thr;
    pts.forEach((p) => { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; });
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    const step = niceStep((hi - lo) / 3), y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    const X = (t) => L + ((t - o.from) / Math.max(1, o.to - o.from)) * w, Y = (v) => TP + (1 - (v - y0) / (y1 - y0)) * h;
    const kids = [sv('defs', null,
      sv('clipPath', { id: id + 'c' }, sv('rect', { x: L, y: 0, width: w, height: f1(Y(o.thr)) })),
      sv('linearGradient', { id: id + 'g', x1: 0, y1: 0, x2: 0, y2: 1 }, sv('stop', { offset: 0, 'stop-color': o.color, 'stop-opacity': 0.34 }), sv('stop', { offset: 1, 'stop-color': o.color, 'stop-opacity': 0 })))];
    for (let v = y0; v <= y1 + step / 2; v += step) {
      kids.push(sv('line', { x1: L, y1: f1(Y(v)), x2: W - R, y2: f1(Y(v)), stroke: 'rgba(255,255,255,.07)' }), sv('text', Object.assign({ x: L - 5, y: f1(Y(v) + 3), 'text-anchor': 'end' }, TXT), SC.alerts.num(v, step < 1 ? 1 : 0)));
    }
    const segs = [[]];
    pts.forEach((p, i) => { if (i && p.t - pts[i - 1].t > 45 * 60000) segs.push([]); segs[segs.length - 1].push(p); });
    segs.forEach((sg) => {
      if (sg.length < 2) { if (sg.length) kids.push(sv('circle', { cx: f1(X(sg[0].t)), cy: f1(Y(sg[0].v)), r: 2, fill: o.color })); return; }
      const d = sg.map((p, i) => (i ? 'L' : 'M') + f1(X(p.t)) + ' ' + f1(Y(p.v))).join('');
      kids.push(sv('path', { d: d + 'L' + f1(X(sg[sg.length - 1].t)) + ' ' + (TP + h) + 'L' + f1(X(sg[0].t)) + ' ' + (TP + h) + 'Z', fill: 'url(#' + id + 'g)', opacity: 0.55 }),
        sv('path', { d: d + 'L' + f1(X(sg[sg.length - 1].t)) + ' ' + f1(Y(o.thr)) + 'L' + f1(X(sg[0].t)) + ' ' + f1(Y(o.thr)) + 'Z', fill: o.color, opacity: 0.22, 'clip-path': 'url(#' + id + 'c)' }));
    });
    kids.push(sv('line', { x1: L, y1: f1(Y(o.thr)), x2: W - R, y2: f1(Y(o.thr)), stroke: '#FFA69B', 'stroke-width': 1, 'stroke-dasharray': '4 3' }),
      sv('text', { x: L + 4, y: f1(Y(o.thr) - 4), 'font-family': 'Inter,sans-serif', 'font-size': 9.5, 'font-weight': 600, fill: '#FFA69B' }, SC.alerts.numA(o.thr) + ' ' + o.unit));
    if (o.mark && o.mark.t > o.from && o.mark.t < o.to) {
      const mx = X(o.mark.t);
      kids.push(sv('line', { x1: f1(mx), y1: TP, x2: f1(mx), y2: TP + h, stroke: 'rgba(255,255,255,.35)', 'stroke-dasharray': '2 3' }),
        sv('text', Object.assign({ x: f1(mx > L + w * 0.65 ? mx - 4 : mx + 4), y: TP + h - 4, 'text-anchor': mx > L + w * 0.65 ? 'end' : 'start' }, TXT), o.mark.label));
    }
    segs.forEach((sg) => {
      if (sg.length > 1) kids.push(sv('path', { d: sg.map((p, i) => (i ? 'L' : 'M') + f1(X(p.t)) + ' ' + f1(Y(p.v))).join(''), fill: 'none', stroke: o.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });
    const last = pts[pts.length - 1];
    kids.push(sv('circle', { cx: f1(X(last.t)), cy: f1(Y(last.v)), r: 3.4, fill: o.color }), sv('circle', { cx: f1(X(last.t)), cy: f1(Y(last.v)), r: 6.5, fill: 'none', stroke: o.color, 'stroke-opacity': 0.4 }));
    kids.push(sv('text', Object.assign({ x: L, y: H - 3, 'text-anchor': 'start' }, TXT), SC.time(o.from)),
      sv('text', Object.assign({ x: L + w / 2, y: H - 3, 'text-anchor': 'middle' }, TXT), SC.time((o.from + o.to) / 2)),
      sv('text', Object.assign({ x: W - R, y: H - 3, 'text-anchor': 'end' }, TXT), T('now', 'τώρα')));
    const aria = o.label + ': ' + SC.alerts.num(last.v, o.dec) + ' ' + o.unit + ' ' + T('at the latest reading', 'στην τελευταία μέτρηση') + ', ' + T('line at ', 'όριο στα ') + SC.alerts.numA(o.thr) + ' ' + o.unit;
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': aria }, kids);
  }

  /* ---------- the countdown ring (the page checks again every 60 s) ---------- */
  const rings = [];
  const C = 2 * Math.PI * 18;
  function countdown(color) {
    const pg = sv('circle', { cx: 22, cy: 22, r: 18, fill: 'none', stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round' });
    const b = el('b', null, '1:00');
    const box = el('div', { class: 'al-cd', role: 'timer', 'aria-label': T('Next check', 'Επόμενος έλεγχος') },
      sv('svg', { viewBox: '0 0 44 44', 'aria-hidden': 'true' }, sv('circle', { cx: 22, cy: 22, r: 18, fill: 'none', stroke: 'rgba(255,255,255,.12)', 'stroke-width': 4 }), pg),
      el('div', { class: 'cdt' }, el('span', null, T('Re-check in', 'Νέος έλεγχος σε')), b));
    rings.push({ pg, b, box });
    return box;
  }

  /* ---------- the page ---------- */
  SC.register('alerts', {
    title: ['Alerts', 'Ειδοποιήσεις'],
    async render(root, ctx) {
      await loadCore();
      const A = SC.alerts;
      const head = SC.head({
        title: T('Alerts', 'Ειδοποιήσεις'), fresh: T('Checking…', 'Έλεγχος…'),
        lede: T('A rule fires when a reading crosses a line. Every alert shows its rule, its source and the time. Nobody is named.', 'Ένας κανόνας ενεργοποιείται όταν μια μέτρηση περνά ένα όριο. Κάθε ειδοποίηση δείχνει τον κανόνα, την πηγή και την ώρα της. Κανείς δεν κατονομάζεται.'),
        help: ['Alerts are made by fixed rules, written by teachers, that this page checks in your browser against the public readings: our school sensors, the Met Office stations and warnings, and public air sensors near the schools. Each card says which rule fired, which sensor or source it came from, when the reading crossed the line and how to see the readings behind it. The page checks again every minute. "Mute for a day" hides an alert on this device only. A teacher can change the lines in Settings.',
          'Οι ειδοποιήσεις προκύπτουν από σταθερούς κανόνες, γραμμένους από εκπαιδευτικούς, που αυτή η σελίδα ελέγχει στον περιηγητή σας πάνω στις δημόσιες μετρήσεις: τους αισθητήρες των σχολείων, τους σταθμούς και τις προειδοποιήσεις της Μετεωρολογικής και δημόσιους αισθητήρες αέρα κοντά στα σχολεία. Κάθε κάρτα λέει ποιος κανόνας ενεργοποιήθηκε, από ποιον αισθητήρα ή πηγή, πότε η μέτρηση πέρασε το όριο και πού να δείτε τις μετρήσεις. Η σελίδα ελέγχει ξανά κάθε λεπτό. Το «Σίγαση για μία ημέρα» κρύβει μια ειδοποίηση μόνο σε αυτή τη συσκευή. Ένας εκπαιδευτικός μπορεί να αλλάξει τα όρια στις Ρυθμίσεις.'],
      });
      root.append(head);
      const pill = head.querySelector('.fresh-pill'), pageHead = head.querySelector('.page-head'), lede = head.querySelector('.lede');
      const sevBox = el('div', { class: 'al-sevs' });
      const barBox = el('div', { class: 'al-bar' });
      const probBox = el('div', { class: 'al-prob' });
      const listBox = el('div', { class: 'al-list' }, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      const endBox = el('div', { class: 'al-list' });
      const noteBox = el('p', { class: 'al-note' });
      const rulesBox = el('section', { class: 'nm-card al-rules', id: 'al-rules', tabindex: -1, 'aria-label': T('The rules', 'Οι κανόνες') });
      root.append(sevBox, barBox, probBox, listBox, noteBox, endBox, rulesBox);

      const S = { res: null, err: null, busy: false, level: ctx.query.get('level') || 'all', cat: ctx.query.get('cat') || 'all', school: ctx.query.get('school') || 'all', why: new Set(), next: Date.now() + 60000 };
      if (!['all', 'high', 'medium', 'info'].includes(S.level)) S.level = 'all';
      if (!['all', 'air', 'weather', 'sensors'].includes(S.cat)) S.cat = 'all';
      let alive = true;
      const teacher = Boolean(ctx.me && (ctx.me.role === 'teacher' || ctx.me.role === 'admin'));

      /* ----- one alert card ----- */
      function vizBox(a) {
        const v = a.viz || {}, box = el('div', { class: 'al-viz' });
        const title = (left, right) => el('div', { class: 'vt' }, el('span', null, left), el('span', null, right || ''));
        const none = (msg) => el('div', { class: 'none' }, msg);
        if (v.type === 'series') {
          box.append(title(v.label, v.unit));
          const pts = (a.series || []).filter((p) => p.t > Date.now() - 24 * 3600000);
          if (pts.length < 2) { box.append(none(a.series ? T('Not enough readings in the last day to draw a line.', 'Δεν υπάρχουν αρκετές μετρήσεις την τελευταία ημέρα για γραμμή.') : T('The history of this reading could not be loaded.', 'Το ιστορικό αυτής της μέτρησης δεν φορτώθηκε.'))); return box; }
          const now = Date.now(), from = a.sinceKind === 'crossed' ? Math.max(now - 24 * 3600000, Math.min(now - 2 * 3600000, a.since - 40 * 60000)) : now - 2 * 3600000;
          const shown = pts.filter((p) => p.t >= from);
          box.append(shown.length > 1 ? lineSvg(shown, { from, to: now, thr: v.thr, color: v.color, unit: v.unit, dec: v.dec, mark: a.sinceKind === 'crossed' && !a.atLeast ? { t: a.since, label: T('above ' + SC.time(a.since), 'πάνω από ' + SC.time(a.since)) } : null, label: v.label }) : none(T('Not enough recent readings to draw a line.', 'Δεν υπάρχουν αρκετές πρόσφατες μετρήσεις για γραμμή.')));
          return box;
        }
        if (v.type === 'station') {
          box.append(title(v.label, v.unit));
          const holder = el('div', null, el('div', { class: 'none' }, T('Loading', 'Φόρτωση')));
          box.append(holder);
          SC.cached('/api/cydom/history?station=' + encodeURIComponent(v.station) + '&hours=12&keys=' + encodeURIComponent(v.key), 300000).then((h) => {
            const i = h && Array.isArray(h.keys) ? h.keys.indexOf(v.key) : -1;
            const pts = i < 0 ? [] : (h.rows || []).map((r) => ({ t: r[0], v: r[i + 1] })).filter((p) => fin(p.t) && fin(p.v));
            if (!alive) return;
            if (pts.length < 2) { fill(holder, none(T('The station history is still being collected on this server.', 'Το ιστορικό του σταθμού συλλέγεται ακόμα σε αυτόν τον διακομιστή.'))); return; }
            const now = Date.now();
            fill(holder, lineSvg(pts, { from: Math.min(pts[0].t, now - 6 * 3600000), to: now, thr: v.thr, color: v.color, unit: v.unit, dec: 1, label: v.label }));
          }).catch(() => { if (alive) fill(holder, none(T('The station history could not be loaded.', 'Το ιστορικό του σταθμού δεν φορτώθηκε.'))); });
          return box;
        }
        if (v.type === 'cells') {
          box.append(title(T('Readings per hour · last 12 h', 'Μετρήσεις ανά ώρα · τελευταίες 12 ώρες'), ''));
          const holder = el('div', null, el('div', { class: 'none' }, T('Loading', 'Φόρτωση')));
          box.append(holder);
          const mid = (v.mids || [])[0];
          if (!mid) { fill(holder, none(T('This sensor has no reading to count.', 'Αυτός ο αισθητήρας δεν έχει μέτρηση για καταμέτρηση.'))); return box; }
          A.readSeries(v.eui, mid, 1).then((pts) => {
            if (!alive) return;
            const now = Date.now(), t0 = Math.floor(now / 3600000) * 3600000 - 11 * 3600000, on = new Array(12).fill(0);
            pts.forEach((p) => { const k = Math.floor((p.t - t0) / 3600000); if (k >= 0 && k < 12) on[k]++; });
            const lastK = Math.floor((v.last - t0) / 3600000);
            const cells = el('div', { class: 'al-cells', role: 'img', 'aria-label': T('Hours with a reading in the last 12 hours: ' + on.filter(Boolean).length + ' of 12', 'Ώρες με μέτρηση τις τελευταίες 12 ώρες: ' + on.filter(Boolean).length + ' από 12') }, on.map((n, k) => el('i', { class: k === lastK ? 'last' : n ? 'on' : '' })));
            const lab = el('div', { class: 'al-cells-l' }, el('span', { style: { left: 0 } }, SC.time(t0)),
              lastK >= 0 && lastK < 11 ? el('span', { style: { left: ((lastK + 0.5) / 12 * 100) + '%', transform: 'translateX(-50%)' } }, T('last ' + SC.time(v.last), 'τελευταία ' + SC.time(v.last))) : null,
              el('span', { style: { right: 0 } }, T('now', 'τώρα')));
            fill(holder, cells, lab);
          }).catch(() => { if (alive) fill(holder, none(T('The hourly counts could not be loaded.', 'Οι ωριαίες καταμετρήσεις δεν φορτώθηκαν.'))); });
          return box;
        }
        if (v.type === 'bar') {
          box.append(title(v.label, v.unit));
          const g = el('div', { class: 'al-gauge', role: 'img', 'aria-label': v.label + ' ' + A.num(v.v, 0) + ' ' + v.unit + ', ' + T('line at ', 'όριο στα ') + A.numA(v.thr) + ' ' + v.unit }, el('i', { style: { width: Math.min(100, v.v / v.max * 100) + '%', '--g': COL[a.level] } }), el('u', { style: { left: Math.min(100, v.thr / v.max * 100) + '%' } }));
          box.append(g, el('div', { class: 'al-gauge-l' }, el('span', null, '0'), el('span', null, T('line ', 'όριο ') + A.numA(v.thr) + ' ' + v.unit), el('span', null, A.numA(v.max))));
          return box;
        }
        if (v.type === 'warn') {
          box.append(title(T('As published', 'Όπως δημοσιεύθηκε'), 'dom.org.cy'));
          box.append(el('blockquote', null, a.excerpt || T('The page lists a warning in force.', 'Η σελίδα αναφέρει προειδοποίηση σε ισχύ.')));
          return box;
        }
        return null;
      }

      function card(a, ended) {
        const muted = !ended && A.isMuted(a.id);
        const tone = TONE[a.level], cl = CLS[a.level];
        const sinceFact = (() => {
          const latest = a.readingAt ? T('Latest reading ' + A.when(a.readingAt), 'Τελευταία μέτρηση ' + A.when(a.readingAt)) : '';
          if (ended) return [T('Ended ' + A.when(a.since), 'Έληξε ' + A.when(a.since)), T('Kept here for 24 hours', 'Παραμένει εδώ για 24 ώρες')];
          if (a.sinceKind === 'crossed') return a.atLeast
            ? [T('Above for at least ' + A.dur(Date.now() - a.since), 'Πάνω από το όριο για τουλάχιστον ' + A.dur(Date.now() - a.since)), latest]
            : [T('Above since ' + A.when(a.since) + ' · ' + A.dur(Date.now() - a.since), 'Πάνω από το όριο από ' + A.when(a.since) + ' · ' + A.dur(Date.now() - a.since)), latest];
          if (a.sinceKind === 'seen') return [T('Last reading ' + A.when(a.since), 'Τελευταία μέτρηση ' + A.when(a.since)), T('Quiet for ' + A.dur(Date.now() - a.since), 'Σιωπηλός για ' + A.dur(Date.now() - a.since))];
          if (a.sinceKind === 'copied') return [T('In force since ' + A.when(a.since), 'Σε ισχύ από ' + A.when(a.since)), T('First copy we saved. Page checked ' + A.when(a.readingAt), 'Πρώτο αντίγραφο που αποθηκεύσαμε. Έλεγχος σελίδας ' + A.when(a.readingAt))];
          if (a.sinceKind === 'checked') return [T('Now', 'Τώρα'), T('Page checked ' + A.when(a.readingAt), 'Έλεγχος σελίδας ' + A.when(a.readingAt))];
          return [T('Now', 'Τώρα'), latest];
        })();
        const peak = a.peak && !ended ? T(' · peak ' + A.num(a.peak.v, a.viz && a.viz.dec) + ' at ' + A.when(a.peak.t), ' · κορυφή ' + A.num(a.peak.v, a.viz && a.viz.dec) + ' στις ' + A.when(a.peak.t)) : '';
        const stText = ended ? T('Ended ' + A.when(a.since), 'Έληξε ' + A.when(a.since))
          : a.sinceKind === 'crossed' ? T('Open · above since ' + A.when(a.since), 'Ανοιχτή · πάνω από το όριο από ' + A.when(a.since))
            : a.sinceKind === 'seen' ? T('Open · quiet since ' + A.when(a.since), 'Ανοιχτή · σιωπηλός από ' + A.when(a.since))
              : a.sinceKind === 'copied' ? T('Open · in force since ' + A.when(a.since), 'Ανοιχτή · σε ισχύ από ' + A.when(a.since))
                : T('Open · now', 'Ανοιχτή · τώρα');
        const whyOpen = S.why.has(a.id);
        const why = el('details', { open: whyOpen || null, ontoggle: (e) => { if (e.target.open) S.why.add(a.id); else S.why.delete(a.id); } },
          el('summary', null, ico('chev'), T('Why this alert', 'Γιατί αυτή η ειδοποίηση')), el('p', null, a.why || ''));
        const srcCls = a.source.kind === 'sensorcommunity' ? 'nm-badge--violet' : 'nm-badge--info';
        const viz = a.viz ? vizBox(a) : null;
        const readLabel = a.sinceKind === 'seen' ? T('Last reading ' + A.when(a.readingAt), 'Τελευταία μέτρηση ' + A.when(a.readingAt)) : a.sinceKind === 'checked' ? T('Fetched ' + A.when(a.readingAt), 'Λήψη ' + A.when(a.readingAt)) : ended ? T('Fetched ' + A.when(a.readingAt), 'Λήψη ' + A.when(a.readingAt)) : T('Reading at ' + A.when(a.readingAt), 'Μέτρηση στις ' + A.when(a.readingAt));
        return el('article', { class: 'al-card nm-card nm-callout nm-callout--' + tone + ' ' + cl + (muted ? ' is-muted' : '') + (ended ? ' is-ended' : ''), dataset: { id: a.id, level: a.level, cat: a.cat, school: a.school || 'none' } },
          el('div', { class: 'al-top' },
            el('div', { class: 'al-ic', 'aria-hidden': 'true' }, ico(a.icon || 'bell')),
            el('div', { class: 'al-tt' },
              el('div', { class: 'al-meta' }, el('span', { class: 'nm-badge nm-badge--' + tone }, LVL[a.level]), el('span', { class: 'nm-badge' }, CAT[a.cat]), el('span', { class: 'st' }, el('i', { class: ended ? 'e' : a.level === 'high' ? '' : a.level === 'medium' ? 'q' : 'e' }), stText)),
              el('h3', null, a.title),
              el('p', { class: 'al-where' }, a.where)),
            ended ? null : countdown(COL[a.level])),
          el('div', { class: 'al-body' },
            el('dl', { class: 'al-facts' },
              el('div', null, el('dt', null, T('Rule', 'Κανόνας')), el('dd', null, a.ruleText, el('small', null, a.ruleName))),
              el('div', null, el('dt', null, T('Line', 'Όριο')), el('dd', null, a.limit.text, el('small', null, T('Now ', 'Τώρα '), el('b', null, a.nowText), peak))),
              el('div', null, el('dt', null, T('Source', 'Πηγή')), el('dd', null, a.sensor, a.sensorNote ? el('small', null, a.sensorNote) : null)),
              el('div', null, el('dt', null, T('Time', 'Ώρα')), el('dd', null, sinceFact[0], sinceFact[1] ? el('small', null, sinceFact[1]) : null))),
            viz),
          el('div', { class: 'al-prov' }, el('span', { class: 'lbl' }, T('Source', 'Πηγή')),
            el('span', { class: 'nm-badge ' + srcCls }, ico(a.source.kind === 'sensecap' ? 'radio' : 'globe'), a.source.label),
            el('span', { class: 'nm-badge' }, ico('doc'), T('Rule · ', 'Κανόνας · ') + a.ruleName),
            el('span', { class: 'nm-badge' }, ico('clock'), readLabel),
            el('a', { class: 'al-src', href: a.home }, a.homeLabel + ' ↗'),
            a.external ? el('a', { class: 'al-src', href: a.external, target: '_blank', rel: 'noopener' }, 'dom.org.cy ↗') : null),
          el('div', { class: 'al-foot' }, why,
            ended ? null : el('button', { class: 'nm-btn nm-btn--ghost al-mute', type: 'button', onclick: () => { if (muted) A.unmute(a.id); else { A.mute(a.id); SC.toast(T('Muted for a day on this device.', 'Σίγαση για μία ημέρα σε αυτή τη συσκευή.')); } paint(); if (SC.refreshBadges) SC.refreshBadges(); } },
              ico('muteBell'), muted ? T('Muted for a day · undo', 'Σίγαση για μία ημέρα · αναίρεση') : T('Mute for a day', 'Σίγαση για μία ημέρα'))));
      }

      /* ----- the rules panel ----- */
      const LINE = {
        co2_high: (r) => T('above ' + A.numA(r.threshold) + ' ' + (r.unit || 'ppm'), 'πάνω από ' + A.numA(r.threshold) + ' ' + (r.unit || 'ppm')),
        pm25_spike: (r) => T('above ' + A.numA(r.threshold) + ' ' + (r.unit || 'µg/m³'), 'πάνω από ' + A.numA(r.threshold) + ' ' + (r.unit || 'µg/m³')),
        met_warning: () => T('any warning in force', 'οποιαδήποτε προειδοποίηση σε ισχύ'),
        sensor_quiet: (r) => T('quiet for more than ' + A.numA(r.threshold) + ' ' + (r.unit || 'min'), 'σιωπηλός για περισσότερο από ' + A.numA(r.threshold) + ' ' + (r.unit || 'λεπτά')),
        battery_low: (r) => T('under ' + A.numA(r.threshold) + ' ' + (r.unit || '%'), 'κάτω από ' + A.numA(r.threshold) + ' ' + (r.unit || '%')),
        temp_high: (r) => T('above ' + A.numA(r.threshold) + ' ' + (r.unit || '°C'), 'πάνω από ' + A.numA(r.threshold) + ' ' + (r.unit || '°C')),
      };
      const SRC = { co2_high: ['sensors', 'readings'], pm25_spike: ['sensors', 'readings'], met_warning: ['warnings'], sensor_quiet: ['sensors'], battery_low: ['sensors'], temp_high: ['sensors', 'readings'] };
      function paintRules() {
        const res = S.res;
        if (!res) { fill(rulesBox); return; }
        const bad = new Set(res.problems.map((p) => p.what));
        const rows = res.rules.map((r) => {
          const open = res.alerts.filter((a) => a.key === r.key).length;
          const blocked = (SRC[r.key] || []).some((k) => bad.has(k));
          const st = !r.enabled ? el('span', { class: 'nm-badge' }, T('Off', 'Ανενεργός')) : blocked ? el('span', { class: 'nm-badge nm-badge--warn' }, T('Not checked', 'Δεν ελέγχθηκε')) : open ? el('span', { class: 'nm-badge nm-badge--' + TONE[res.alerts.find((a) => a.key === r.key).level] }, T(open + ' open', open + ' ανοιχτές')) : el('span', { class: 'nm-badge nm-badge--ok' }, T('Clear', 'Καθαρός'));
          const lvl = A.LEVEL[r.severity] || 'medium';
          return el('tr', null, el('td', { class: 'nm' }, T(r.name[0], r.name[1])), el('td', { class: 'tx' }, T(r.text[0], r.text[1])), el('td', { class: 'th' }, (LINE[r.key] || (() => ''))(r)),
            el('td', null, el('span', { class: 'nm-badge nm-badge--' + TONE[lvl] }, LVL[lvl])), el('td', null, st));
        });
        const ck = res.checked;
        fill(rulesBox,
          el('h2', { class: 'card-h' }, T('The rules', 'Οι κανόνες'), el('span', { class: 't live' }, T('Checked ' + SC.time(res.at), 'Έλεγχος ' + SC.time(res.at)))),
          el('p', { class: 'card-sub' }, T('Alerts come from these lines only. A rule can be on or off and a line can move, but a rule never names a person.', 'Οι ειδοποιήσεις προκύπτουν μόνο από αυτά τα όρια. Ένας κανόνας μπορεί να είναι ανοιχτός ή κλειστός και ένα όριο να αλλάξει, αλλά ένας κανόνας δεν κατονομάζει ποτέ πρόσωπο.')),
          el('div', { class: 'nm-table-wrap' }, el('table', { class: 'nm-table' },
            el('thead', null, el('tr', null, ['Rule', 'What it means', 'Line', 'Level', 'Now'].map((h, i) => el('th', { scope: 'col' }, T(h, ['Κανόνας', 'Τι σημαίνει', 'Όριο', 'Επίπεδο', 'Τώρα'][i]))))),
            el('tbody', null, rows))),
          el('div', { class: 'al-rules-foot' },
            el('span', { class: 'grow' }, T('Last check: ' + ck.sensors + ' sensors, ' + ck.stations + ' Met Office stations, ' + ck.publicSensors + ' public air sensors, warnings page ' + (ck.warnings ? 'read' : 'not read') + '.', 'Τελευταίος έλεγχος: ' + ck.sensors + ' αισθητήρες, ' + ck.stations + ' σταθμοί Μετεωρολογικής, ' + ck.publicSensors + ' δημόσιοι αισθητήρες αέρα, σελίδα προειδοποιήσεων ' + (ck.warnings ? 'διαβάστηκε' : 'δεν διαβάστηκε') + '.'),
              res.rulesFrom === 'default' ? ' ' + T('The rules list could not be read from the server, so the standard lines are used.', 'Η λίστα κανόνων δεν διαβάστηκε από τον διακομιστή, γι’ αυτό χρησιμοποιούνται τα στάνταρ όρια.') : ''),
            teacher ? el('a', { class: 'nm-btn', href: '#/settings' }, ico('gear'), T('Change the lines in Settings', 'Αλλαγή ορίων στις Ρυθμίσεις'))
              : el('span', null, T('Teachers can change the lines after signing in.', 'Οι εκπαιδευτικοί μπορούν να αλλάξουν τα όρια μετά τη σύνδεση.'))));
      }

      /* ----- paint ----- */
      function paint() {
        rings.length = 0;
        const res = S.res;
        if (!res) {
          if (S.err) {
            fill(sevBox); fill(barBox); fill(endBox); fill(noteBox);
            fill(listBox, el('div', { class: 'err', role: 'alert' }, T('The alerts could not be checked. ', 'Οι ειδοποιήσεις δεν ελέγχθηκαν. ') + (S.err.message || '')), el('div', null, el('button', { class: 'nm-btn', type: 'button', onclick: () => run(true) }, T('Try again', 'Δοκιμάστε ξανά'))));
            pill.className = 'fresh-pill none'; pill.lastChild.textContent = T('Not checked', 'Δεν ελέγχθηκε');
          }
          return;
        }
        const all = res.alerts, open = all.filter((a) => !A.isMuted(a.id)), mutedN = all.length - open.length;
        const n = (lv) => open.filter((a) => a.level === lv).length;
        const demo = res.cfg && res.cfg.demo, has = pageHead.querySelector('.t.demo');
        if (demo && !has) pageHead.insertBefore(el('span', { class: 't demo' }, T('Demo data', 'Δεδομένα επίδειξης')), lede);
        if (!demo && has) has.remove();
        const coreFail = res.problems.some((p) => p.what === 'sensors' || p.what === 'readings');
        pill.className = 'fresh-pill' + (coreFail ? ' none' : res.problems.length ? ' stale' : '');
        pill.lastChild.textContent = coreFail ? T('Sensors unavailable', 'Οι αισθητήρες δεν είναι διαθέσιμοι') : T('Live · checked ' + SC.time(res.at), 'Ζωντανά · έλεγχος ' + SC.time(res.at));

        // level tiles
        const tile = (lv, cls, icon, label, sub) => el('button', { class: 'al-sev ' + cls, type: 'button', 'aria-pressed': S.level === lv ? 'true' : 'false', 'aria-label': T('Show only ' + label.toLowerCase() + ' alerts: ' + n(lv), 'Μόνο ειδοποιήσεις: ' + label.toLowerCase() + ': ' + n(lv)),
          onclick: () => { S.level = S.level === lv ? 'all' : lv; paint(); } },
        el('span', { class: 'ic' }, ico(icon)), el('div', { class: 'n' }, el('b', null, coreFail ? '–' : String(n(lv))), label), el('small', null, sub));
        fill(sevBox,
          tile('high', 'hi', 'warn', LVL.high, T('Look today. Health or safety could be affected.', 'Δείτε το σήμερα. Μπορεί να επηρεάζεται η υγεία ή η ασφάλεια.')),
          tile('medium', 'md', 'bell', LVL.medium, T('Check within the school day.', 'Ελέγξτε μέσα στη σχολική ημέρα.')),
          tile('info', 'in', 'info', LVL.info, T('Good to know. No action needed today.', 'Καλό να γνωρίζετε. Δεν χρειάζεται ενέργεια σήμερα.')),
          el('section', { class: 'al-sev nt' }, el('span', { class: 'ic', style: { color: 'var(--nm-copper-2)' } }, ico('shield')), el('div', { class: 'n' }, T('How alerts are made', 'Πώς γίνονται οι ειδοποιήσεις')),
            el('p', null, el('b', null, T('Alerts come from fixed rules written by teachers. Nobody is named.', 'Οι ειδοποιήσεις προκύπτουν από σταθερούς κανόνες γραμμένους από εκπαιδευτικούς. Κανείς δεν κατονομάζεται.')), ' ',
              el('button', { class: 'link al-src', type: 'button', onclick: () => { rulesBox.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' }); rulesBox.focus({ preventScroll: true }); } }, T('See the ' + res.rules.length + ' rules', 'Δείτε τους ' + res.rules.length + ' κανόνες') + ' ↗'),
              teacher ? [' ', el('a', { class: 'al-src', href: '#/settings' }, T('Settings', 'Ρυθμίσεις') + ' ↗')] : null)));

        // filters
        const catN = (c) => open.filter((a) => a.cat === c).length;
        const pills = el('div', { class: 'nm-pillbar', role: 'group', 'aria-label': T('Filter alerts by kind', 'Φίλτρο ειδοποιήσεων ανά είδος') },
          [['all', T('All', 'Όλες'), open.length], ['air', CAT.air, catN('air')], ['weather', CAT.weather, catN('weather')], ['sensors', CAT.sensors, catN('sensors')]].map(([k, label, c]) =>
            el('button', { type: 'button', class: S.cat === k ? 'on' : '', 'aria-pressed': S.cat === k ? 'true' : 'false', onclick: () => { S.cat = k; paint(); } }, label, el('em', null, String(c)))));
        const schoolsIn = A.SCHOOLS;
        const sel = el('select', { class: 'nm-input', id: 'al-school', onchange: (e) => { S.school = e.target.value; paint(); } },
          el('option', { value: 'all', selected: S.school === 'all' || null }, T('All schools', 'Όλα τα σχολεία')),
          schoolsIn.map((s) => el('option', { value: s.id, selected: S.school === s.id || null }, A.schoolName(s))),
          el('option', { value: 'none', selected: S.school === 'none' || null }, T('Not at a school', 'Εκτός σχολείου')));
        const need = n('high') + n('medium');
        fill(barBox, pills, el('label', { class: 'al-sel', for: 'al-school' }, T('School', 'Σχολείο'), sel),
          el('span', { class: 'al-hint grow' }, el('b', null, need === 1 ? T('1 needs a look', '1 θέλει προσοχή') : T(need + ' need a look', need + ' θέλουν προσοχή')), ' · ' + T(n('info') + ' for information', n('info') + ' για ενημέρωση') + ' · ' + T('sorted by level, then newest', 'ταξινόμηση ανά επίπεδο και μετά νεότερες') + (mutedN ? ' · ' + T(mutedN + ' muted', mutedN + ' σε σίγαση') : '')),
          el('button', { class: 'nm-btn', type: 'button', disabled: S.busy || null, onclick: () => run(true) }, ico('refresh'), S.busy ? T('Checking…', 'Έλεγχος…') : T('Check now', 'Έλεγχος τώρα')));

        // problems
        const WHAT = {
          sensors: ['The sensor list could not be read, so the sensor rules were not checked.', 'Η λίστα αισθητήρων δεν διαβάστηκε, γι’ αυτό δεν ελέγχθηκαν οι κανόνες των αισθητήρων.'],
          readings: ['The latest readings could not be read, so the reading rules were not checked.', 'Οι τελευταίες μετρήσεις δεν διαβάστηκαν, γι’ αυτό δεν ελέγχθηκαν οι κανόνες των μετρήσεων.'],
          stations: ['The Met Office stations could not be read, so station temperatures were not checked.', 'Οι σταθμοί της Μετεωρολογικής δεν διαβάστηκαν, γι’ αυτό δεν ελέγχθηκαν οι θερμοκρασίες τους.'],
          warnings: ['The Met Office warnings page could not be read, so the warning rule was not checked.', 'Η σελίδα προειδοποιήσεων της Μετεωρολογικής δεν διαβάστηκε, γι’ αυτό δεν ελέγχθηκε ο κανόνας προειδοποιήσεων.'],
          public: ['The public air sensors could not be read, so they were not checked.', 'Οι δημόσιοι αισθητήρες αέρα δεν διαβάστηκαν, γι’ αυτό δεν ελέγχθηκαν.'],
        };
        fill(probBox, res.problems.map((p) => el('div', { class: 'err', role: 'alert' }, T(WHAT[p.what][0], WHAT[p.what][1]), p.msg ? ' ' + p.msg + ' ' : ' ', el('button', { class: 'nm-btn', type: 'button', onclick: () => run(true) }, T('Try again', 'Δοκιμάστε ξανά')))));

        // list
        const keep = (a) => (S.level === 'all' || a.level === S.level) && (S.cat === 'all' || a.cat === S.cat) && (S.school === 'all' || (S.school === 'none' ? !a.school : a.school === S.school));
        const shown = all.filter(keep);
        if (!all.length) {
          const ck = res.checked;
          fill(listBox, coreFail ? null : el('section', { class: 'nm-card al-clear' }, el('span', { class: 'ok', 'aria-hidden': 'true' }, ico('shield')),
            el('div', null, el('h2', null, T('No alerts. All sensors inside their limits.', 'Καμία ειδοποίηση. Όλοι οι αισθητήρες είναι εντός των ορίων τους.')),
              el('p', null, T('Checked ' + SC.time(res.at) + ': ' + ck.sensors + ' sensors, ' + ck.stations + ' Met Office stations' + (ck.warnings ? ' and the warnings page' : '') + '. This page checks again every minute.', 'Έλεγχος ' + SC.time(res.at) + ': ' + ck.sensors + ' αισθητήρες, ' + ck.stations + ' σταθμοί της Μετεωρολογικής' + (ck.warnings ? ' και η σελίδα προειδοποιήσεων' : '') + '. Η σελίδα ελέγχει ξανά κάθε λεπτό.')))));
        } else if (!shown.length) {
          fill(listBox, el('div', { class: 'empty', role: 'status' }, T('No alerts match these filters.', 'Καμία ειδοποίηση δεν ταιριάζει με αυτά τα φίλτρα.'), ' ', el('button', { class: 'link', type: 'button', onclick: () => { S.level = 'all'; S.cat = 'all'; S.school = 'all'; paint(); } }, T('Show all', 'Εμφάνιση όλων'))));
        } else fill(listBox, shown.map((a) => card(a, false)));
        fill(noteBox, all.length ? T('A muted alert comes back after 24 hours. Mutes are kept in this browser only.', 'Μια ειδοποίηση σε σίγαση επανέρχεται μετά από 24 ώρες. Οι σιγάσεις κρατιούνται μόνο σε αυτόν τον περιηγητή.') : null);
        const endShown = (res.ended || []).filter(keep);
        fill(endBox, endShown.length ? [el('div', { class: 'al-sech' }, el('span', { class: 'eyebrow' }, T('Ended in the last 24 hours', 'Έληξαν τις τελευταίες 24 ώρες')), el('span', { class: 'ln' })), endShown.map((a) => card(a, true))] : null);
        paintRules();
        tick();
      }

      /* ----- the check: now and every minute ----- */
      async function run(force) {
        if (S.busy) return;
        S.busy = true;
        if (S.res) paint();
        try { S.res = await SC.alertsEvaluate({ force: Boolean(force) }); S.err = null; } catch (e) { S.err = e; if (!S.res) S.res = null; }
        S.busy = false;
        if (!alive) return;
        S.next = Date.now() + 60000;
        paint();
      }
      function tick() {
        const left = Math.max(0, S.next - Date.now()), s = Math.ceil(left / 1000);
        rings.forEach((r) => {
          r.b.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
          r.pg.setAttribute('stroke-dasharray', (C * left / 60000).toFixed(1) + ' ' + C.toFixed(1));
        });
      }
      const timer = setInterval(() => { if (!alive) return; tick(); if (S.next - Date.now() <= 0 && !S.busy) run(false); }, 1000);
      await run(false);
      return () => { alive = false; clearInterval(timer); rings.length = 0; };
    },
  });
})();
