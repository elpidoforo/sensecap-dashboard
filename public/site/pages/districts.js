/*
  Districts and neighbourhoods: Lefkosia, Larnaka, Lemesos and Pafos side by side.
    #/districts                          readings by district (default)
    #/districts?view=squares             the route squares: our vehicles' grouped, delayed 1 km cells drawn on the island
    #/districts?d=<lefkosia|larnaka|lemesos|pafos>&m=<temp|hum|co2>     pre-select a district / a measurement
  Sources: /cities/api/overview  per school: sensors, online, average temperature, humidity and CO2, and route "cells" [lat, lng, visits]
           (grouped to about 1 km and built only from points at least 2 hours old; no vehicle positions are anywhere in it)
           /api/cydom             the Met Office stations (name, coordinates, temperature, humidity, time)
           /api/trails?hours=24&mid=<id>   the public (delayed, rounded) trails with a value on every point, only to average a measurement per square
           /api/devices           which vehicle belongs to which school (group name), for the per-square averages
           /api/config            demo flag, the grid size and the delay
  District shapes come from island.js (ISLAND.districts). A Met Office station belongs to the district whose shape holds it;
  if it sits on an edge, to the district with the nearest centre (our own rule, not an official boundary, and the page says so).
  Nothing here is invented: no station in a district, no reading for a square, or a feed that is down all say so.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/districts.css');

  const HOUR = 3600000;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dateOf = (v) => { const n = typeof v === 'number' ? v : Date.parse(v); return isFinite(n) && n > 0 ? n : null; };

  // The four districts we compare. id: the shape in ISLAND.districts; school: the id used by /cities/api/overview.
  const DIST = [
    { id: 'nicosia', key: 'lefkosia', school: 'lefkosia', col: '#E07F3F', n: ['Lefkosia', 'Λευκωσία'], aka: 'Nicosia', re: /lefkos|nicosia|λευκωσ/i },
    { id: 'larnaca', key: 'larnaka', school: 'larnaca', col: '#4C8BEA', n: ['Larnaka', 'Λάρνακα'], aka: 'Larnaca', re: /larnak|larnac|λάρνακ/i },
    { id: 'limassol', key: 'lemesos', school: 'limassol', col: '#59d98e', n: ['Lemesos', 'Λεμεσός'], aka: 'Limassol', re: /limass|lemes|λεμεσ/i },
    { id: 'paphos', key: 'pafos', school: 'paphos', col: '#8f7bff', n: ['Pafos', 'Πάφος'], aka: 'Paphos', re: /paph|pafos|πάφ|παφ/i },
  ];
  const dName = (d) => T(d.n[0], d.n[1]);
  const byAlias = (s) => { s = String(s || '').toLowerCase(); return DIST.find((d) => d.id === s || d.key === s || d.school === s || d.aka.toLowerCase() === s) || null; };
  // measurements: o = the field in the school overview, c = the field of a Met Office point, mid = the sensor id for the per-square average
  const MET = {
    temp: { name: ['Temperature', 'Θερμοκρασία'], unit: '°C', dec: 1, o: 'temp', c: 'temp', mid: '4097' },
    hum: { name: ['Humidity', 'Υγρασία'], unit: '%', dec: 0, o: 'humidity', c: 'hum', mid: '4098' },
    co2: { name: ['CO2', 'CO2'], unit: 'ppm', dec: 0, o: 'co2', c: null, mid: '4100' },
  };
  const num = (v, d) => (fin(v) ? SC.num(v, d) : '–');

  /* ---------- the shapes ---------- */
  const GEO = {};
  function buildGeo() {
    if (GEO.ready || typeof ISLAND === 'undefined') return;
    Object.keys(ISLAND.districts).forEach((id) => {
      const polys = ISLAND.districts[id].split('M').filter(Boolean).map((seg) => seg.replace(/Z/g, '').split('L').map((p) => p.trim().split(/[ ,]+/).map(Number)).filter((p) => p.length === 2 && fin(p[0]) && fin(p[1]))).filter((p) => p.length > 2);
      let A = 0, X = 0, Y = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const xs = [], ys = [];
      polys.forEach((p) => {
        let a = 0, cx = 0, cy = 0;
        for (let i = 0; i < p.length; i++) {
          const q = p[(i + 1) % p.length], c = p[i][0] * q[1] - q[0] * p[i][1];
          a += c; cx += (p[i][0] + q[0]) * c; cy += (p[i][1] + q[1]) * c;
          x0 = Math.min(x0, p[i][0]); x1 = Math.max(x1, p[i][0]); y0 = Math.min(y0, p[i][1]); y1 = Math.max(y1, p[i][1]);
          xs.push(p[i][0]); ys.push(p[i][1]);
        }
        a /= 2;
        if (Math.abs(a) < 1e-6) return;
        const w = Math.abs(a); A += w; X += (cx / (6 * a)) * w; Y += (cy / (6 * a)) * w;
      });
      // the main body: the box that holds 97 % of the points, so far-off pieces and enclaves do not shrink the zoom
      const q = (a, f) => { const b = a.slice().sort((m, n) => m - n); return b[Math.min(b.length - 1, Math.max(0, Math.round(f * (b.length - 1))))]; };
      GEO[id] = { polys, c: A ? [X / A, Y / A] : [0, 0], box: [x0, y0, x1, y1], main: [q(xs, 0.015), q(ys, 0.015), q(xs, 0.985), q(ys, 0.985)] };
    });
    GEO.ready = true;
  }
  function inPoly(p, x, y) {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  }
  // which district shape (any of the six) a point is in; the nearest centre when it is on an edge or just off the coast
  function districtAt(lng, lat) {
    const q = ISLAND.project(lng, lat), ids = Object.keys(ISLAND.districts);
    for (const id of ids) { const g = GEO[id]; if (q[0] < g.box[0] || q[0] > g.box[2] || q[1] < g.box[1] || q[1] > g.box[3]) continue; if (g.polys.some((p) => inPoly(p, q[0], q[1]))) return id; }
    let best = null, bd = Infinity;
    ids.forEach((id) => { const d = Math.hypot(GEO[id].c[0] - q[0], GEO[id].c[1] - q[1]); if (d < bd) { bd = d; best = id; } });
    return best;
  }
  const RAMP = [[76, 203, 234], [247, 196, 107], [232, 105, 63]];
  function ramp(t) {
    t = clamp(t, 0, 1);
    const a = t < 0.5 ? RAMP[0] : RAMP[1], b = t < 0.5 ? RAMP[1] : RAMP[2], u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',') + ')';
  }
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };

  SC.register('districts', {
    title: ['Districts and neighbourhoods', 'Επαρχίες και γειτονιές'],
    async render(root, ctx) {
      buildGeo();
      const q0 = ctx.query;
      const S = {
        view: q0.get('view') === 'squares' ? 'squares' : 'compare',
        sel: (byAlias(q0.get('d')) || DIST[0]).id,
        met: MET[q0.get('m')] ? q0.get('m') : 'temp',
        sq: { m: 'visits', zoom: 'all', cell: null },
      };
      const D = { ov: null, cy: null, cyErr: null, cfg: null, devs: null, trails: {}, trailErr: {}, loading: {} };
      let alive = true, timer = 0, sig = '';

      const cfg0 = await SC.cached('/api/config', 600000).catch(() => null);
      D.cfg = cfg0;
      const head = SC.head({
        title: T('Districts and neighbourhoods', 'Επαρχίες και γειτονιές'),
        tags: cfg0 && cfg0.demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
        lede: T('Compare Lefkosia, Larnaka, Lemesos and Pafos: what our school sensors read next to the Met Office stations of each district, and how the readings change from one 1 km route square to the next.',
          'Συγκρίνετε Λευκωσία, Λάρνακα, Λεμεσό και Πάφο: τι μετρούν οι αισθητήρες των σχολείων μας δίπλα στους σταθμούς της Μετεωρολογικής Υπηρεσίας κάθε επαρχίας και πώς αλλάζουν οι μετρήσεις από το ένα τετράγωνο διαδρομής του 1 χλμ στο επόμενο.'),
        help: [
          'Pick a district on the island or in the table. “School sensors” is the average of the sensors of that district’s school, mostly on buses and cars, so it is the air around a vehicle. “Met Office stations” is the average of the official stations inside the district, outdoors. The two can differ: that difference is a good question for a class. In “Route squares” each square is about 1 km wide and shows where that school’s vehicles drove in the last 24 hours. Squares are built from points at least 2 hours old, so no vehicle can be followed.',
          'Επιλέξτε μια επαρχία στο νησί ή στον πίνακα. Οι «Αισθητήρες σχολείου» είναι ο μέσος όρος των αισθητήρων του σχολείου της επαρχίας, κυρίως σε λεωφορεία και αυτοκίνητα, δηλαδή ο αέρας γύρω από ένα όχημα. Οι «Σταθμοί Μετεωρολογικής» είναι ο μέσος όρος των επίσημων σταθμών μέσα στην επαρχία, στο ύπαιθρο. Οι δύο μπορεί να διαφέρουν: η διαφορά είναι μια καλή ερώτηση για μια τάξη. Στα «Τετράγωνα διαδρομής» κάθε τετράγωνο έχει πλάτος περίπου 1 χλμ και δείχνει πού κινήθηκαν τα οχήματα του σχολείου τις τελευταίες 24 ώρες. Τα τετράγωνα φτιάχνονται από σημεία παλαιότερα των 2 ωρών, οπότε κανένα όχημα δεν μπορεί να ακολουθηθεί.',
        ],
      });
      root.append(head);

      const tabs = el('div', { class: 'nm-pillbar ds-tabs', role: 'tablist', 'aria-label': T('Views', 'Προβολές') });
      const body = el('div', { class: 'ds' }, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      const tabRow = el('div', { class: 'ds-tabrow' }, tabs, el('span', { class: 'ds-privacy' }, SC.icon('lock', 15), T('No vehicle positions here: squares are about 1 km and at least 2 hours old.', 'Χωρίς θέσεις οχημάτων εδώ: τα τετράγωνα είναι περίπου 1 χλμ και παλαιότερα των 2 ωρών.')));
      root.append(tabRow, body);

      /* ---------- data ---------- */
      const th = (a, b) => el('th', { scope: 'col' }, T(a, b));
      const gridDeg = () => (D.cfg && D.cfg.posGrid ? D.cfg.posGrid : 0.01);
      const schoolOf = (id) => (D.ov ? D.ov.schools.find((s) => s.id === id) : null);
      let stMemo = { src: null, list: [] };
      const stations = () => {
        const src = D.cy && D.cy.points;
        if (stMemo.src !== src) stMemo = { src, list: (src || []).filter((p) => fin(p.lat) && fin(p.lng)).map((p) => Object.assign({ dist: districtAt(p.lng, p.lat) }, p)) };
        return stMemo.list;
      };
      const stationsIn = (distId) => stations().filter((p) => p.dist === distId);
      function rows() {
        const all = stations();
        return DIST.map((d) => {
          const sc = schoolOf(d.school), sts = all.filter((p) => p.dist === d.id);
          const tv = sts.map((p) => p.temp).filter(fin), hv = sts.map((p) => p.hum).filter(fin);
          return { d, sc, sts, st: { n: sts.length, temp: avg(tv), hum: avg(hv), tMin: tv.length ? Math.min(...tv) : null, tMax: tv.length ? Math.max(...tv) : null } };
        });
      }
      async function loadMain() {
        const [ov, cy, cf] = await Promise.allSettled([SC.api('/cities/api/overview'), SC.api('/api/cydom'), SC.cached('/api/config', 600000)]);
        if (cf.status === 'fulfilled') D.cfg = cf.value;
        if (ov.status === 'rejected') { if (!D.ov) throw ov.reason; } else D.ov = ov.value;
        if (cy.status === 'fulfilled') { D.cy = cy.value; D.cyErr = null; } else D.cyErr = cy.reason;
        if (D.cy && D.cy.error) { D.cyErr = new Error(D.cy.error); }
      }
      async function loadDevs() {
        if (D.devs) return;
        try { const r = await SC.cached('/api/devices', 60000); D.devs = Array.isArray(r) ? r : (r && r.devices) || []; } catch (e) { D.devs = []; }
      }
      const schoolIdOfDevice = (d) => { const t = (d.group || '') + ' ' + (d.name || ''); const x = DIST.find((k) => k.re.test(t)); return x ? x.school : null; };
      // average of one measurement per square, per school, from the public (delayed, rounded) trails: { school: Map(cellKey -> { sum, n }) }
      async function loadTrails(m) {
        const key = MET[m].mid;
        if (D.trails[key] || D.loading[key]) return;
        D.loading[key] = true; delete D.trailErr[key];
        try {
          await loadDevs();
          const r = await SC.api('/api/trails?hours=24&mid=' + key);
          const g = gridDeg(), out = {};
          Object.keys(r.trails || {}).forEach((eui) => {
            const dev = D.devs.find((d) => d.eui === eui), sid = (dev && schoolIdOfDevice(dev)) || '*';
            const map = out[sid] || (out[sid] = new Map());
            (r.trails[eui] || []).forEach((p) => {
              if (!Array.isArray(p) || !fin(p[1]) || !fin(p[2]) || !fin(p[3])) return;
              const k = Math.round(p[1] / g) + ',' + Math.round(p[2] / g), c = map.get(k) || { sum: 0, n: 0 };
              c.sum += p[3]; c.n++; map.set(k, c);
            });
          });
          D.trails[key] = out;
        } catch (e) { D.trailErr[key] = e; }
        delete D.loading[key];
        if (alive && S.view === 'squares') draw();
      }

      /* ---------- small pieces ---------- */
      const errBox = (what, whatEl, e, retry) => el('div', { class: 'ds-err' },
        el('div', { class: 'err', role: 'alert' }, T('Could not load ' + what + '. ', 'Δεν φορτώθηκαν ' + whatEl + '. '), e && e.message ? el('span', { class: 'muted' }, e.message) : null),
        el('div', null, el('button', { class: 'nm-btn', type: 'button', onclick: retry }, T('Try again', 'Δοκιμάστε ξανά'))));
      const dot = (c) => { const i = el('i', { class: 'ds-dot' }); i.style.background = c; return i; };
      function pick(id) { S.sel = id; draw(); sync(); }
      function sync() {
        const p = new URLSearchParams();
        if (S.view === 'squares') p.set('view', 'squares');
        const d = DIST.find((x) => x.id === S.sel); if (d) p.set('d', d.key);
        if (S.view === 'compare' && S.met !== 'temp') p.set('m', S.met);
        try { history.replaceState(history.state, '', '#/districts' + (p.toString() ? '?' + p.toString() : '')); } catch (e) { /* the address bar stays */ }
      }
      function drawFresh() {
        const old = head.querySelector('.fresh-pill'); if (old) old.remove();
        const t = D.ov ? dateOf(D.ov.updated) : null; if (!t) return;
        const stale = Date.now() - t > 3 * HOUR;
        const pill = el('span', { class: 'fresh-pill' + (stale ? ' ds-old' : '') }, el('i'), stale ? T('Old · school averages ' + SC.ago(t), 'Παλιά · μέσοι όροι σχολείων ' + SC.ago(t)) : T('Live · school averages ' + SC.ago(t), 'Ζωντανά · μέσοι όροι σχολείων ' + SC.ago(t)));
        const h1 = head.querySelector('.page-head h1'); if (h1) h1.after(pill);
      }
      function drawTabs() {
        const T2 = [['compare', T('By district', 'Ανά επαρχία')], ['squares', T('Route squares', 'Τετράγωνα διαδρομής')]];
        tabs.replaceChildren(...T2.map(([id, label], i) => el('button', { type: 'button', role: 'tab', class: S.view === id ? 'on' : '', 'aria-selected': S.view === id ? 'true' : 'false', tabindex: S.view === id ? '0' : '-1',
          onclick: () => { S.view = id; draw(); sync(); },
          onkeydown: (e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); S.view = T2[(i + d + 2) % 2][0]; draw(); sync(); const b = tabs.querySelector('[aria-selected="true"]'); if (b) b.focus(); } } }, label)));
      }

      /* ---------- the island ---------- */
      function viewBox(zoomId) {
        const full = [0, 0, ISLAND.W, ISLAND.H];
        if (!zoomId || zoomId === 'all' || !GEO[zoomId]) return full;
        const m = GEO[zoomId].main, asp = ISLAND.W / ISLAND.H, pad = 0.14;
        let w = (m[2] - m[0]) * (1 + pad * 2), h = (m[3] - m[1]) * (1 + pad * 2);
        if (w / h > asp) h = w / asp; else w = h * asp;
        w = Math.min(w, ISLAND.W); h = Math.min(h, ISLAND.H);
        const cx = (m[0] + m[2]) / 2, cy = (m[1] + m[3]) / 2;
        return [clamp(cx - w / 2, 0, ISLAND.W - w), clamp(cy - h / 2, 0, ISLAND.H - h), w, h];
      }
      function baseSvg(vb, label, soft) {   // soft: the squares view, where the districts only tint the ground
        const svg = sv('svg', { viewBox: vb.join(' '), role: 'img', 'aria-label': label, class: 'ds-svg' });
        Object.keys(ISLAND.districts).forEach((id) => {
          const sel = DIST.find((x) => x.id === id), on = id === S.sel;
          svg.append(sv('path', { d: ISLAND.districts[id], fill: sel ? rgba(sel.col, soft ? (on ? 0.14 : 0.07) : on ? 0.5 : 0.13) : 'rgba(255,255,255,.04)', stroke: on ? (soft ? 'rgba(255,255,255,.4)' : sel.col) : 'rgba(143,227,247,.28)', 'stroke-width': on ? (soft ? 0.6 : 1.6) : 0.5, 'stroke-linejoin': 'round' }));
        });
        return svg;
      }
      function schoolDots(svg, scale) {
        DIST.forEach((d) => {
          const s = schoolOf(d.school); if (!s || !fin(s.lat) || !fin(s.lng)) return;
          const p = ISLAND.project(s.lng, s.lat);
          svg.append(sv('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: (16 * scale).toFixed(1), fill: d.col, stroke: '#fff', 'stroke-width': (5 * scale).toFixed(1), 'pointer-events': 'none' }));
        });
      }
      function picker() {
        const svg = baseSvg([0, 0, ISLAND.W, ISLAND.H], T('Map of Cyprus. Pick one of four districts.', 'Χάρτης της Κύπρου. Επιλέξτε μία από τέσσερις επαρχίες.'));
        // clickable layer: the four district shapes, on top, see-through
        DIST.forEach((d) => {
          const hit = sv('path', { d: ISLAND.districts[d.id], fill: 'transparent', stroke: 'none', class: 'ds-hit', tabindex: '0', role: 'button', 'aria-pressed': S.sel === d.id ? 'true' : 'false', 'aria-label': T('Show ' + dName(d), 'Εμφάνιση: ' + dName(d)), 'data-k': 'hit-' + d.id }, sv('title', null, dName(d)));
          hit.addEventListener('click', () => pick(d.id));
          hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(d.id); } });
          svg.append(hit);
        });
        stations().forEach((p) => {
          const d = DIST.find((x) => x.id === p.dist), q = ISLAND.project(p.lng, p.lat);
          svg.append(sv('circle', { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: d && d.id === S.sel ? 5.2 : 3.8, fill: d ? d.col : '#8CA0B8', opacity: d && d.id === S.sel ? 1 : 0.8, stroke: '#fff', 'stroke-width': d && d.id === S.sel ? 1.3 : 0.8, 'pointer-events': 'none' }));
        });
        schoolDots(svg, 1);
        DIST.forEach((d) => {
          const c = GEO[d.id].c;
          const t = sv('text', { x: c[0].toFixed(0), y: (c[1] - 30).toFixed(0), 'text-anchor': 'middle', class: 'ds-lbl' + (S.sel === d.id ? ' on' : ''), 'pointer-events': 'none' }, dName(d));
          svg.append(t);
        });
        return svg;
      }

      /* ---------- view A: compare ---------- */
      function barValue(r, m, kind) { const M = MET[m]; return kind === 'school' ? (r.sc ? r.sc[M.o] : null) : (M.c ? r.st[M.c] : null); }
      function drawCompare() {
        const R = rows(), M = MET[S.met], parts = [];
        if (D.cyErr) parts.push(el('div', { class: 'nm-callout nm-callout--warn ds-note' }, T('The Met Office stations could not be loaded (' + (D.cyErr.message || 'no answer') + '), so only the school sensors are compared. ', 'Οι σταθμοί της Μετεωρολογικής Υπηρεσίας δεν φορτώθηκαν (' + (D.cyErr.message || 'καμία απάντηση') + '), οπότε συγκρίνονται μόνο οι αισθητήρες των σχολείων. '), el('button', { class: 'link', type: 'button', onclick: retryMain }, T('Try again', 'Δοκιμάστε ξανά'))));
        else if (D.cy && D.cy.feedTime && Date.now() - dateOf(D.cy.feedTime) > HOUR) parts.push(el('div', { class: 'nm-callout nm-callout--warn ds-note' }, T('The newest station reading is ' + SC.ago(dateOf(D.cy.feedTime)) + ', so the station numbers are old.', 'Η νεότερη μέτρηση σταθμού είναι ' + SC.ago(dateOf(D.cy.feedTime)) + ', οπότε οι αριθμοί των σταθμών είναι παλιοί.')));

        /* island picker */
        const chips = el('div', { class: 'ds-chips', role: 'group', 'aria-label': T('District', 'Επαρχία') }, DIST.map((d) => el('button', { type: 'button', class: 'ds-chip' + (S.sel === d.id ? ' on' : ''), 'aria-pressed': S.sel === d.id ? 'true' : 'false', 'data-k': 'chip-' + d.id, onclick: () => pick(d.id) }, dot(d.col), dName(d))));
        const other = stations().filter((p) => !DIST.some((d) => d.id === p.dist)).length;
        const mapCard = el('section', { class: 'nm-card ds-mapcard', 'aria-labelledby': 'ds-map-h' },
          el('div', { class: 'card-eye' }, T('Pick a district', 'Επιλέξτε επαρχία')), el('h2', { class: 'card-h', id: 'ds-map-h' }, T('The island', 'Το νησί')),
          el('div', { class: 'ds-map' }, picker()), chips,
          el('p', { class: 'ds-key muted' }, el('i', { class: 'ds-key-s' }), T('school', 'σχολείο'), '  ', el('i', { class: 'ds-key-t' }), T('Met Office station', 'σταθμός Μετεωρολογικής'), other ? T('. ' + other + (other === 1 ? ' station lies' : ' stations lie') + ' in districts that are not compared.', '. ' + other + (other === 1 ? ' σταθμός βρίσκεται' : ' σταθμοί βρίσκονται') + ' σε επαρχίες που δεν συγκρίνονται.') : ''));

        /* bars */
        const vals = []; R.forEach((r) => { ['school', 'st'].forEach((k) => { const v = barValue(r, S.met, k); if (fin(v)) vals.push(v); }); });
        const top = vals.length ? Math.max(...vals) * 1.08 : 1;
        const bar = (label, v, col, cls) => el('div', { class: 'ds-b ' + (cls || '') },
          el('span', { class: 'ds-b-l' }, label),
          el('div', { class: 'ds-trk' }, fin(v) ? (() => { const f = el('i', { class: 'ds-fill' }); f.style.width = clamp(v / top * 100, 1.5, 100) + '%'; f.style.background = col; return f; })() : el('em', null, T('no reading', 'χωρίς μέτρηση'))),
          el('b', { class: 'mono' }, fin(v) ? SC.num(v, M.dec) + ' ' + M.unit : '–'));
        const bars = el('div', { class: 'ds-bars' }, R.map((r) => {
          const sv_ = barValue(r, S.met, 'school'), st_ = barValue(r, S.met, 'st');
          const diff = fin(sv_) && fin(st_) ? sv_ - st_ : null;
          return el('div', { class: 'ds-row' + (S.sel === r.d.id ? ' on' : '') },
            el('button', { type: 'button', class: 'ds-rname', 'data-k': 'row-' + r.d.id, 'aria-pressed': S.sel === r.d.id ? 'true' : 'false', onclick: () => pick(r.d.id) }, dot(r.d.col), dName(r.d), diff != null ? el('small', null, T('school ' + (diff >= 0 ? '+' : '−') + SC.num(Math.abs(diff), M.dec) + ' ' + M.unit + ' vs stations', 'σχολείο ' + (diff >= 0 ? '+' : '−') + SC.num(Math.abs(diff), M.dec) + ' ' + M.unit + ' έναντι σταθμών')) : null),
            el('div', { class: 'ds-pair' },
              bar(T('School sensors', 'Αισθητήρες σχολείου'), sv_, r.d.col, 'school'),
              M.c ? bar(T('Met Office stations' + (r.st.n ? ' (' + r.st.n + ')' : ''), 'Σταθμοί Μετεωρολογικής' + (r.st.n ? ' (' + r.st.n + ')' : '')), st_, r.d.col, 'st') : null));
        }));
        const metChips = el('div', { class: 'ds-chips', role: 'group', 'aria-label': T('Measurement', 'Μέτρηση') }, Object.keys(MET).map((k) => el('button', { type: 'button', class: 'ds-chip' + (S.met === k ? ' on' : ''), 'aria-pressed': S.met === k ? 'true' : 'false', 'data-k': 'met-' + k, onclick: () => { S.met = k; draw(); sync(); } }, T(MET[k].name[0], MET[k].name[1]) + ' (' + MET[k].unit + ')')));
        const barCard = el('section', { class: 'nm-card ds-barcard', 'aria-labelledby': 'ds-bar-h' },
          el('div', { class: 'card-eye' }, T('School sensors and Met Office stations', 'Αισθητήρες σχολείου και σταθμοί Μετεωρολογικής')), el('h2', { class: 'card-h', id: 'ds-bar-h' }, T('How the four districts compare', 'Πώς συγκρίνονται οι τέσσερις επαρχίες')),
          metChips, bars,
          !M.c ? el('p', { class: 'ds-foot muted' }, T('The Met Office stations do not measure CO2, so there is nothing to put beside the school sensors.', 'Οι σταθμοί της Μετεωρολογικής δεν μετρούν CO2, οπότε δεν υπάρχει κάτι να τεθεί δίπλα στους αισθητήρες των σχολείων.')) : el('p', { class: 'ds-foot muted' }, T('Bars start at zero. A school sensor reads the air around a vehicle or a room; a Met Office station is outdoors, so a difference is a question, not an error.', 'Οι μπάρες ξεκινούν από το μηδέν. Ένας αισθητήρας σχολείου μετρά τον αέρα γύρω από ένα όχημα ή μια αίθουσα· ένας σταθμός είναι στο ύπαιθρο, οπότε μια διαφορά είναι ερώτηση, όχι λάθος.')));

        /* table */
        const table = el('div', { class: 'nm-table-wrap' }, el('table', { class: 'nm-table ds-table' },
          el('thead', null, el('tr', null, th('District', 'Επαρχία'), th('Sensors online', 'Αισθητήρες σε λειτουργία'), th('School °C', 'Σχολείο °C'), th('School %', 'Σχολείο %'), th('School CO2 ppm', 'Σχολείο CO2 ppm'), th('Stations', 'Σταθμοί'), th('Stations °C', 'Σταθμοί °C'), th('Stations %', 'Σταθμοί %'), th('School − stations (°C)', 'Σχολείο − σταθμοί (°C)'))),
          el('tbody', null, R.map((r) => {
            const diff = r.sc && fin(r.sc.temp) && fin(r.st.temp) ? r.sc.temp - r.st.temp : null;
            return el('tr', { class: S.sel === r.d.id ? 'on' : '' },
              el('th', { scope: 'row' }, el('button', { type: 'button', class: 'ds-rname ds-rname-t', 'data-k': 'tr-' + r.d.id, onclick: () => pick(r.d.id) }, dot(r.d.col), dName(r.d))),
              el('td', { class: 'mono' }, r.sc ? r.sc.online + ' / ' + r.sc.sensors : '–'), el('td', { class: 'mono' }, num(r.sc && r.sc.temp, 1)), el('td', { class: 'mono' }, num(r.sc && r.sc.humidity, 0)), el('td', { class: 'mono' }, num(r.sc && r.sc.co2, 0)),
              el('td', { class: 'mono' }, D.cyErr && !D.cy ? '–' : String(r.st.n)), el('td', { class: 'mono' }, num(r.st.temp, 1)), el('td', { class: 'mono' }, num(r.st.hum, 0)),
              el('td', { class: 'mono' }, diff == null ? '–' : (diff >= 0 ? '+' : '−') + SC.num(Math.abs(diff), 1)));
          }))));
        const tableCard = el('section', { class: 'nm-card nm-table-card ds-tablecard', 'aria-labelledby': 'ds-tab-h' },
          el('h2', { class: 'card-h', id: 'ds-tab-h' }, T('All the numbers side by side', 'Όλοι οι αριθμοί δίπλα-δίπλα')), el('p', { class: 'card-sub' }, T('Averages of the newest readings. A district with no sensor online or no station shows a dash.', 'Μέσοι όροι των νεότερων μετρήσεων. Μια επαρχία χωρίς αισθητήρα σε λειτουργία ή χωρίς σταθμό δείχνει παύλα.')), table);

        /* the selected district */
        const r = R.find((x) => x.d.id === S.sel) || R[0];
        const stRows = r.sts.slice().sort((a, b) => (fin(b.temp) ? b.temp : -99) - (fin(a.temp) ? a.temp : -99));
        const sc = r.sc;
        const tile = (k, v, sub) => el('div', { class: 'tile ds-tile' }, el('div', { class: 'kpi-label' }, k), el('div', { class: 'kpi-num mono' }, v), sub ? el('small', null, sub) : null);
        const detail = el('section', { class: 'nm-card ds-detail', 'aria-labelledby': 'ds-det-h' },
          el('div', { class: 'ds-det-top' }, el('div', null, el('div', { class: 'card-eye' }, T('In detail', 'Αναλυτικά')), el('h2', { class: 'card-h', id: 'ds-det-h' }, dot(r.d.col), T(dName(r.d) + ' district', 'Επαρχία ' + dName(r.d))),
            el('p', { class: 'card-sub' }, sc ? sc.name : T('No school found for this district.', 'Δεν βρέθηκε σχολείο για αυτή την επαρχία.')))),
          sc ? el('div', { class: 'cols-4 ds-tiles' },
            tile(T('School sensors online', 'Αισθητήρες σχολείου'), sc.online + ' / ' + sc.sensors, sc.sensors ? null : T('this school has no sensors yet', 'το σχολείο δεν έχει ακόμα αισθητήρες')),
            tile(T('School temperature', 'Θερμοκρασία σχολείου'), fin(sc.temp) ? SC.num(sc.temp, 1) + ' °C' : '–', fin(sc.temp) ? T('Met Office stations: ' + (fin(r.st.temp) ? SC.num(r.st.temp, 1) + ' °C' : 'none'), 'Σταθμοί: ' + (fin(r.st.temp) ? SC.num(r.st.temp, 1) + ' °C' : 'κανένας')) : T('no reading now', 'καμία μέτρηση τώρα')),
            tile(T('School humidity', 'Υγρασία σχολείου'), fin(sc.humidity) ? SC.num(sc.humidity, 0) + ' %' : '–', fin(sc.humidity) ? T('Met Office stations: ' + (fin(r.st.hum) ? SC.num(r.st.hum, 0) + ' %' : 'none'), 'Σταθμοί: ' + (fin(r.st.hum) ? SC.num(r.st.hum, 0) + ' %' : 'κανένας')) : T('no reading now', 'καμία μέτρηση τώρα')),
            tile('CO2', fin(sc.co2) ? SC.num(sc.co2, 0) + ' ppm' : '–', fin(sc.co2) ? T('outdoors about 420 ppm', 'στο ύπαιθρο περίπου 420 ppm') : T('no reading now', 'καμία μέτρηση τώρα'))) : null,
          el('h3', { class: 'ds-h3' }, T('Met Office stations in ' + dName(r.d), 'Σταθμοί της Μετεωρολογικής στην επαρχία ' + dName(r.d))),
          D.cyErr && !D.cy ? errBox(T('the Met Office stations', 'οι σταθμοί της Μετεωρολογικής'), T('the Met Office stations', 'οι σταθμοί της Μετεωρολογικής'), D.cyErr, retryMain)
            : !stRows.length ? el('div', { class: 'empty' }, T('No Met Office station lies in this district right now.', 'Κανένας σταθμός της Μετεωρολογικής δεν βρίσκεται αυτή τη στιγμή σε αυτή την επαρχία.'))
              : el('div', { class: 'nm-table-wrap' }, el('table', { class: 'nm-table ds-table ds-stt' },
                el('thead', null, el('tr', null, th('Station', 'Σταθμός'), th('Temperature °C', 'Θερμοκρασία °C'), th('Humidity %', 'Υγρασία %'), th('Reading', 'Μέτρηση'))),
                el('tbody', null, stRows.map((p, i) => {
                  const t = dateOf(p.time), old = t && Date.now() - t > 3 * HOUR;
                  return el('tr', null, el('th', { scope: 'row' }, p.name || p.id, i === 0 && fin(p.temp) && stRows.length > 1 ? el('span', { class: 'nm-badge nm-badge--warn ds-tag' }, T('warmest', 'θερμότερος')) : null, i === stRows.length - 1 && fin(p.temp) && stRows.length > 1 ? el('span', { class: 'nm-badge nm-badge--info ds-tag' }, T('coolest', 'ψυχρότερος')) : null),
                    el('td', { class: 'mono' }, num(p.temp, 1)), el('td', { class: 'mono' }, num(p.hum, 0)), el('td', { class: old ? 'ds-oldt' : '' }, t ? SC.time(t) + (old ? ' · ' + SC.ago(t) : '') : '–'));
                })))),
          el('p', { class: 'ds-foot muted' }, T('A station is put in the district whose shape on the map holds it (the district with the nearest centre when it sits on an edge). This is our own rule, not an official boundary.', 'Ένας σταθμός ανήκει στην επαρχία της οποίας το σχήμα στον χάρτη τον περιέχει (στην επαρχία με το πλησιέστερο κέντρο όταν βρίσκεται σε όριο). Είναι δικός μας κανόνας, όχι επίσημο όριο.')));

        parts.push(el('div', { class: 'cols-main ds-main' }, mapCard, barCard), tableCard, detail);
        body.replaceChildren(...parts);
      }

      /* ---------- view B: route squares ---------- */
      function cellsOf(s) { return (s && Array.isArray(s.cells) ? s.cells : []).filter((c) => Array.isArray(c) && fin(c[0]) && fin(c[1]) && fin(c[2])); }
      function drawSquares() {
        const sq = S.sq, parts = [], g = gridDeg();
        const key = sq.m === 'visits' ? null : MET[sq.m].mid;
        if (key && !D.trails[key] && !D.trailErr[key]) loadTrails(sq.m);
        const tr = key ? D.trails[key] : null;
        const lookup = (schoolId, la, ln) => { if (!tr) return null; const k = Math.round(la / g) + ',' + Math.round(ln / g), a = (tr[schoolId] && tr[schoolId].get(k)) || (tr['*'] && tr['*'].get(k)); return a && a.n ? a.sum / a.n : null; };
        // all cells with their school
        const all = []; D.ov.schools.forEach((s) => { const d = DIST.find((x) => x.school === s.id); cellsOf(s).forEach((c) => all.push({ s, d, la: c[0], ln: c[1], n: c[2] })); });
        const maxN = {}; all.forEach((c) => { maxN[c.s.id] = Math.max(maxN[c.s.id] || 1, c.n); });
        let lo = Infinity, hi = -Infinity;
        if (key) all.forEach((c) => { c.v = lookup(c.s.id, c.la, c.ln); if (fin(c.v)) { lo = Math.min(lo, c.v); hi = Math.max(hi, c.v); } });
        const vb = viewBox(sq.zoom), scale = vb[2] / ISLAND.W;
        const svg = baseSvg(vb, T('Map of Cyprus with ' + all.length + ' route squares of about 1 km', 'Χάρτης της Κύπρου με ' + all.length + ' τετράγωνα διαδρομής περίπου 1 χλμ'), true);
        svg.classList.add('ds-svg-sq');
        const enlarge = sq.zoom === 'all' ? 2 : 1;   // on the whole island a true 1 km square is about 3 pixels, so it is drawn twice as wide there
        const w = g * ISLAND.k * ISLAND.sx * enlarge, h = g * ISLAND.sx * enlarge;
        const gSq = sv('g', { class: 'ds-sqs' });
        all.forEach((c) => {
          const p = ISLAND.project(c.ln, c.la);
          let fill, op;
          if (!key) { fill = c.d ? c.d.col : '#4CCBEA'; op = 0.28 + 0.72 * (c.n / maxN[c.s.id]); }
          else if (fin(c.v)) { fill = ramp(hi > lo ? (c.v - lo) / (hi - lo) : 0.5); op = 0.92; }
          else { fill = '#8CA0B8'; op = 0.18; }
          const on = sq.cell && sq.cell.s === c.s.id && sq.cell.la === c.la && sq.cell.ln === c.ln;
          const r = sv('rect', { x: (p[0] - w / 2).toFixed(2), y: (p[1] - h / 2).toFixed(2), width: w.toFixed(2), height: h.toFixed(2), fill, opacity: op, stroke: on ? '#fff' : 'rgba(12,22,38,.55)', 'stroke-width': ((on ? 1.6 : 0.25) * scale).toFixed(2), class: 'ds-sq' });
          r.addEventListener('click', () => { sq.cell = { s: c.s.id, la: c.la, ln: c.ln }; draw(); });
          gSq.append(r);
        });
        svg.append(gSq);
        schoolDots(svg, Math.max(0.3, scale * 0.55));
        const mapCard = el('section', { class: 'nm-card ds-mapcard ds-sqmap', 'aria-labelledby': 'ds-sq-h' },
          el('div', { class: 'card-eye' }, T('Last 24 hours, delayed', 'Τελευταίες 24 ώρες, με καθυστέρηση')), el('h2', { class: 'card-h', id: 'ds-sq-h' }, T('Route squares', 'Τετράγωνα διαδρομής')),
          all.length ? el('div', { class: 'ds-map ds-map-big' }, svg) : el('div', { class: 'empty' }, T('No route squares yet. Squares appear for trips that are more than 2 hours old.', 'Δεν υπάρχουν ακόμα τετράγωνα διαδρομής. Τα τετράγωνα εμφανίζονται για διαδρομές παλαιότερες των 2 ωρών.')),
          el('p', { class: 'ds-foot muted' }, T('Each square is about ' + (D.ov.cellKm || 1) + ' km wide. It is built from points at least ' + Math.round((D.ov.delayMinutes || 120) / 60) + ' hours old, grouped so that no single vehicle can be followed. ' + (sq.zoom === 'all' ? 'On the whole island the squares are drawn twice as wide so that you can see them; zoom to a district for true scale.' : 'Squares are drawn to scale.'), 'Κάθε τετράγωνο έχει πλάτος περίπου ' + (D.ov.cellKm || 1) + ' χλμ. Φτιάχνεται από σημεία παλαιότερα των ' + Math.round((D.ov.delayMinutes || 120) / 60) + ' ωρών, ομαδοποιημένα ώστε να μην ακολουθείται κανένα όχημα. ' + (sq.zoom === 'all' ? 'Στο όλο νησί τα τετράγωνα σχεδιάζονται διπλάσια σε πλάτος για να φαίνονται· εστιάστε σε μια επαρχία για πραγματική κλίμακα.' : 'Τα τετράγωνα σχεδιάζονται υπό κλίμακα.'))));

        /* side: measurement, zoom, legend, selected square, per-school list */
        const mChips = el('div', { class: 'ds-chips', role: 'group', 'aria-label': T('Colour the squares by', 'Χρωματισμός τετραγώνων ανά') },
          [['visits', T('Visits', 'Επισκέψεις')]].concat(Object.keys(MET).map((k) => [k, T(MET[k].name[0], MET[k].name[1])])).map(([k, label]) => el('button', { type: 'button', class: 'ds-chip' + (sq.m === k ? ' on' : ''), 'aria-pressed': sq.m === k ? 'true' : 'false', 'data-k': 'sm-' + k, onclick: () => { sq.m = k; draw(); } }, label)));
        const zChips = el('div', { class: 'ds-chips', role: 'group', 'aria-label': T('Zoom to', 'Εστίαση σε') },
          [['all', T('Whole island', 'Όλο το νησί'), null]].concat(DIST.map((d) => [d.id, dName(d), d.col])).map(([k, label, col]) => el('button', { type: 'button', class: 'ds-chip' + (sq.zoom === k ? ' on' : ''), 'aria-pressed': sq.zoom === k ? 'true' : 'false', 'data-k': 'sz-' + k, onclick: () => { sq.zoom = k; if (k !== 'all') S.sel = k; draw(); sync(); } }, col ? dot(col) : null, label)));
        let legend;
        if (!key) legend = el('div', { class: 'ds-legend' }, el('div', { class: 'ds-grad ds-grad-v' }), el('div', { class: 'ds-grad-l' }, el('span', null, T('fewer visits', 'λιγότερες επισκέψεις')), el('span', null, T('more visits', 'περισσότερες επισκέψεις'))), el('small', { class: 'muted' }, T('Each school has its own scale: its busiest square is the strongest colour.', 'Κάθε σχολείο έχει τη δική του κλίμακα: το πιο πολυσύχναστο τετράγωνό του έχει το πιο έντονο χρώμα.')));
        else if (D.loading[key]) legend = el('div', { class: 'loading' }, T('Loading readings', 'Φόρτωση μετρήσεων'));
        else if (D.trailErr[key]) legend = el('div', { class: 'ds-err' }, el('div', { class: 'err', role: 'alert' }, T('Could not load the readings for the squares. ', 'Δεν φορτώθηκαν οι μετρήσεις για τα τετράγωνα. '), el('span', { class: 'muted' }, D.trailErr[key].message)), el('div', null, el('button', { class: 'nm-btn', type: 'button', onclick: () => { delete D.trailErr[key]; draw(); } }, T('Try again', 'Δοκιμάστε ξανά'))));
        else if (!fin(lo)) legend = el('div', { class: 'empty' }, T('No reading of this kind falls in a square. Our vehicles may not carry this sensor.', 'Καμία μέτρηση αυτού του είδους δεν πέφτει σε τετράγωνο. Τα οχήματά μας μπορεί να μην έχουν αυτόν τον αισθητήρα.'));
        else {
          const M = MET[sq.m], gr = el('div', { class: 'ds-grad' }); gr.style.background = 'linear-gradient(90deg,' + ramp(0) + ',' + ramp(0.5) + ',' + ramp(1) + ')';
          legend = el('div', { class: 'ds-legend' }, gr, el('div', { class: 'ds-grad-l' }, el('span', { class: 'mono' }, SC.num(lo, M.dec) + ' ' + M.unit), el('span', { class: 'mono' }, SC.num(hi, M.dec) + ' ' + M.unit)),
            el('small', { class: 'muted' }, T('Average of the readings in each square over 24 hours. Grey squares have no reading of this kind. Vehicle sensors read the air around the vehicle.', 'Μέσος όρος των μετρήσεων σε κάθε τετράγωνο σε 24 ώρες. Τα γκρι τετράγωνα δεν έχουν μέτρηση αυτού του είδους. Οι αισθητήρες των οχημάτων μετρούν τον αέρα γύρω από το όχημα.')));
        }
        let readout;
        const sel = sq.cell && all.find((c) => c.s.id === sq.cell.s && c.la === sq.cell.la && c.ln === sq.cell.ln);
        if (sel) {
          readout = el('div', { class: 'ds-read' }, el('div', { class: 'card-eye' }, T('Selected square', 'Επιλεγμένο τετράγωνο')),
            el('b', null, sel.d ? dName(sel.d) : sel.s.name), el('p', null, T('About 1 km wide, ' + sel.n + (sel.n === 1 ? ' visit' : ' visits') + ' by ' + sel.s.name + ' vehicles in 24 hours.', 'Περίπου 1 χλμ πλάτος, ' + sel.n + (sel.n === 1 ? ' επίσκεψη' : ' επισκέψεις') + ' οχημάτων του σχολείου ' + (sel.s.el || sel.s.name) + ' σε 24 ώρες.')),
            key ? el('p', null, fin(sel.v) ? T('Average ' + MET[sq.m].name[0].toLowerCase() + ': ', 'Μέσος όρος: ') + SC.num(sel.v, MET[sq.m].dec) + ' ' + MET[sq.m].unit : T('No reading of this kind in this square.', 'Καμία μέτρηση αυτού του είδους σε αυτό το τετράγωνο.')) : null,
            el('button', { class: 'link', type: 'button', onclick: () => { sq.cell = null; draw(); } }, T('Clear', 'Καθαρισμός')));
        } else readout = el('p', { class: 'muted ds-read-h' }, all.length ? T('Press a square to read it. Squares have no names and no positions: only the district, the visits and the average.', 'Πατήστε ένα τετράγωνο για να το διαβάσετε. Τα τετράγωνα δεν έχουν ονόματα ούτε θέσεις: μόνο την επαρχία, τις επισκέψεις και τον μέσο όρο.') : '');
        const per = D.ov.schools.map((s) => { const cs = cellsOf(s); const d = DIST.find((x) => x.school === s.id); return { s, d, n: cs.length, visits: cs.reduce((a, c) => a + c[2], 0), top: cs.reduce((a, c) => Math.max(a, c[2]), 0) }; });
        const side = el('div', { class: 'ds-side' },
          el('section', { class: 'nm-card ds-ctl' }, el('div', { class: 'card-eye' }, T('Colour by', 'Χρωματισμός ανά')), mChips, el('div', { class: 'card-eye ds-zl' }, T('Zoom to', 'Εστίαση σε')), zChips, legend, readout),
          el('section', { class: 'nm-card nm-table-card ds-per' }, el('h2', { class: 'card-h' }, T('Squares by school', 'Τετράγωνα ανά σχολείο')),
            el('div', { class: 'nm-table-wrap' }, el('table', { class: 'nm-table ds-table' },
              el('thead', null, el('tr', null, th('School', 'Σχολείο'), th('Squares', 'Τετράγωνα'), th('Visits', 'Επισκέψεις'), th('Busiest', 'Πιο πολυσύχναστο'))),
              el('tbody', null, per.map((p) => el('tr', null, el('th', { scope: 'row' }, p.d ? dot(p.d.col) : null, p.d ? dName(p.d) : p.s.name), el('td', { class: 'mono' }, String(p.n)), el('td', { class: 'mono' }, String(p.visits)), el('td', { class: 'mono' }, p.n ? String(p.top) : '–'))))))));
        parts.push(el('div', { class: 'cols-main ds-main ds-main-sq' }, mapCard, side));
        body.replaceChildren(...parts);
      }

      /* ---------- the page ---------- */
      function draw() {
        if (!alive) return;
        const a = document.activeElement, keep = a && a.dataset ? a.dataset.k : null;
        drawTabs(); drawFresh();
        if (S.view === 'squares') drawSquares(); else drawCompare();
        if (keep) { const n = body.querySelector('[data-k="' + (window.CSS && CSS.escape ? CSS.escape(keep) : keep) + '"]'); if (n) n.focus({ preventScroll: true }); }
      }
      async function retryMain() { try { await loadMain(); } catch (e) { /* the page keeps what it has */ } if (alive) { sig = ''; draw(); } }
      async function refresh() {
        try { await loadMain(); } catch (e) { return; }
        if (!alive) return;
        const s = JSON.stringify([D.ov, D.cy && D.cy.updated, D.cyErr && D.cyErr.message]);
        if (s === sig) return;
        sig = s; D.trails = {};
        draw();
      }

      async function start() {
        body.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        try { await loadMain(); } catch (e) {
          if (!alive) return;
          body.replaceChildren(errBox(T('the school averages', 'οι μέσοι όροι των σχολείων'), T('the school averages', 'οι μέσοι όροι των σχολείων'), e, start));
          return;
        }
        if (!alive) return;
        sig = JSON.stringify([D.ov, D.cy && D.cy.updated, D.cyErr && D.cyErr.message]);
        draw();
        if (!timer) timer = setInterval(refresh, 60000);
      }
      await start();
      return () => { alive = false; clearInterval(timer); };
    },
  });
})();
