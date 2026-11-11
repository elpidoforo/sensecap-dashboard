/*
  Mirror: a SIMULATED commute. Walk, take the bus or go by car along a route and see how much PM2.5 each would breathe in.
    #/mirror                       first school, a short example trip near it
    #/mirror?school=<slug>         the school you travel to (slug of /app/api/schools/public)
  The route is a straight line between two points taken from the school list, drawn on the stylised island (ISLAND). It is not a road route and
  no vehicle position is read or shown. "Near the school" starts at an EXAMPLE point a chosen number of km away (not an address).
  Real data: /app/api/schools/public (the points), /api/devices + /api/latest + /api/config (a school sensor that reports PM2.5, if any),
    /api/opensensors (Sensor.Community volunteer sensors), /api/air (Open-Meteo model grid). PM2.5 along the route comes from the first of
    those that has a value near each stretch. If none has a value the page says so and shows only typical ratios between the modes.
  Everything else (speeds, breathing rates, in-vehicle ratios) is a stated assumption with a range, listed in "How this simulation works".
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  const sv = (tag, attrs, ...kids) => SC.svgEl(tag, attrs, ...kids.flat(Infinity));
  SC.css('/site/pages/mirror.css');
  const fill = (box, ...kids) => box.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const HOUR = 3600000, DAY = 86400000, FRESH = 3 * HOUR;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const f1 = (x) => SC.num(x, 1);
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ICON = {
    play: '<path d="M7 5l12 7-12 7z"/>', replay: '<path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5"/>', alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4v.4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.2"/>', walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6-2.5-2.5 1-4.5 3 1.5 2 3M9.5 8.5L7 12"/>',
    car: '<path d="M5 16V11l2-5h10l2 5v5M3 16h18M7 16v3M17 16v3"/><circle cx="8" cy="13" r=".8"/><circle cx="16" cy="13" r=".8"/>',
  };
  function ic(name, size) {
    const s = sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    s.innerHTML = ICON[name] || (SC.icons && SC.icons[name]) || '';   // static strings only
    return s;
  }

  /* ---------- assumptions (all of them are shown on the page) ---------- */
  const ROAD = 1.3;       // road distance = straight line x 1.3 (rule of thumb, no routing service is used)
  const FAR = 10;         // km: above this the trip is treated as intercity
  const MODES = {
    walk: { l: ['Walking', 'Περπάτημα'], icon: 'walk', col: '#59d98e', near: 5, far: 5, vent: 1.2, ratio: 1.0, lo: 0.8, hi: 1.3,
      note: ['On the pavement beside traffic: about the same air as the outdoor reading. You breathe more air per hour because you are working.', 'Στο πεζοδρόμιο δίπλα στην κυκλοφορία: περίπου ο ίδιος αέρας με τη μέτρηση στο ύπαιθρο. Αναπνέετε περισσότερο αέρα ανά ώρα επειδή κοπιάζετε.'] },
    bus: { l: ['Bus', 'Λεωφορείο'], icon: 'bus', col: '#4CCBEA', near: 20, far: 50, vent: 0.5, ratio: 1.2, lo: 0.7, hi: 1.7,
      note: ['Seated, in traffic, doors opening at stops: a little more than outdoors on average, with a wide range.', 'Καθισμένοι, μέσα στην κυκλοφορία, με ανοιγόμενες πόρτες στις στάσεις: κατά μέσο όρο λίγο περισσότερο από το ύπαιθρο, με μεγάλο εύρος.'] },
    car: { l: ['Car', 'Αυτοκίνητο'], icon: 'car', col: '#E07F3F', near: 30, far: 80, vent: 0.5, ratio: 1.3, lo: 0.6, hi: 1.9,
      note: ['Seated. A closed car with a filter can be cleaner than outdoors, a car with open windows in queues can be dirtier. The range is the widest.', 'Καθισμένοι. Ένα κλειστό αυτοκίνητο με φίλτρο μπορεί να είναι καθαρότερο από το ύπαιθρο, ένα με ανοιχτά παράθυρα σε ουρά μπορεί να είναι βρωμερότερο. Το εύρος είναι το μεγαλύτερο.'] },
  };
  const MODE_IDS = ['walk', 'bus', 'car'];
  const SAMPLES = 10;     // stretches along the route

  const SCHOOL_NAMES = {
    'pascal-larnaka': { n: ['PASCAL Larnaka', 'PASCAL Λάρνακα'], s: ['Larnaka', 'Λάρνακα'] },
    'pascal-lefkosia': { n: ['PASCAL Lefkosia', 'PASCAL Λευκωσία'], s: ['Lefkosia', 'Λευκωσία'] },
    'pascal-limassol': { n: ['PASCAL Limassol', 'PASCAL Λεμεσός'], s: ['Limassol', 'Λεμεσός'] },
    'paphos-international': { n: ['International School of Paphos', 'Διεθνές Σχολείο Πάφου'], s: ['Paphos', 'Πάφος'] },
  };
  const nameOf = (s) => { const k = SCHOOL_NAMES[s.slug]; return k ? T(k.n[0], k.n[1]) : s.name; };
  const shortOf = (s) => { const k = SCHOOL_NAMES[s.slug]; return k ? T(k.s[0], k.s[1]) : s.short || s.name; };
  const km = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const spanText = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); if (m < 90) return T(m + ' min', m + ' λεπτά'); const h = Math.round(m / 60); if (h < 36) return T(h + ' h', h + ' ώρες'); const d = Math.round(h / 24); return T(d + ' days', d + ' ημέρες'); };
  const agoText = (t) => (t ? T(spanText(Date.now() - t) + ' ago', 'πριν ' + spanText(Date.now() - t)) : '');
  const durText = (h) => { const m = Math.max(1, Math.round(h * 60)); if (m < 60) return T(m + ' min', m + ' λεπτά'); const hh = Math.floor(m / 60), mm = m % 60; return T(hh + ' h' + (mm ? ' ' + mm + ' min' : ''), hh + ' ώρ.' + (mm ? ' ' + mm + ' λεπτά' : '')); };
  const band = (v) => (v <= 5 ? '#59d98e' : v <= 15 ? '#F2CF86' : v <= 35 ? '#F2A56B' : '#FF7A6A');
  const CAT = [{ id: 'pm25', re: /pm\s*2[._]?5/i }];

  SC.register('mirror', {
    title: ['Mirror', 'Καθρέφτης'],
    render(root, ctx) {
      const D = { cfg: null, devices: [], latest: {}, schools: [], air: null, open: null };
      const S = { school: null, from: null, kind: 'near', km: 2, mode: 'walk', zoom: null, p: 0 };
      let alive = true, timer = 0, raf = 0, rz = 0;
      const A = {};
      const headHolder = el('div');
      const body = el('div', { class: 'mr-page' });
      root.append(headHolder, body);

      const help = ['Pick the school you travel to and how you travel. The page draws a straight line on the island between two points taken from the school list, reads the PM2.5 near each stretch of the line (from a school sensor, volunteer sensors or the Open-Meteo model, whichever has a value) and works out how much PM2.5 you would breathe in on the way: walking, by bus and by car. It is a simulation with stated assumptions, not a measurement of any real trip. No vehicle position is used.',
        'Διαλέξτε το σχολείο στο οποίο πηγαίνετε και πώς μετακινείστε. Η σελίδα σχεδιάζει μια ευθεία γραμμή στο νησί ανάμεσα σε δύο σημεία από τη λίστα των σχολείων, διαβάζει το PM2.5 κοντά σε κάθε τμήμα της γραμμής (από αισθητήρα σχολείου, αισθητήρες εθελοντών ή το μοντέλο Open-Meteo, όποιο έχει τιμή) και υπολογίζει πόσο PM2.5 θα αναπνέατε στη διαδρομή: με τα πόδια, με λεωφορείο και με αυτοκίνητο. Είναι προσομοίωση με δηλωμένες παραδοχές, όχι μέτρηση κάποιας πραγματικής διαδρομής. Δεν χρησιμοποιείται καμία θέση οχήματος.'];
      function head(extra) {
        headHolder.replaceChildren(SC.head(Object.assign({
          title: T('Mirror', 'Καθρέφτης'),
          lede: T('A simulated commute: walk, take the bus or go by car along a route and see how much PM2.5 each way would breathe in.', 'Μια προσομοιωμένη μετακίνηση: με τα πόδια, με λεωφορείο ή με αυτοκίνητο σε μια διαδρομή, και πόσο PM2.5 θα αναπνέατε με κάθε τρόπο.'),
          help,
          tags: [{ text: T('Simulation', 'Προσομοίωση'), cls: 'arch' }].concat(D.cfg && D.cfg.demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : []),
        }, extra || {})));
      }
      head();

      /* ---------- data ---------- */
      const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
      async function load(force) {
        const get = (u, ttl) => (force ? SC.api(u) : SC.cached(u, ttl));
        const [cfg, dev, lat, sch, air, open] = await Promise.all([settle(get('/api/config', 300000)), settle(get('/api/devices', 20000)), settle(get('/api/latest', 20000)),
          settle(get('/app/api/schools/public', 300000)), settle(get('/api/air', 600000)), settle(get('/api/opensensors', 300000))]);
        if (!sch.ok) throw sch.e;
        D.schools = ((sch.v && sch.v.schools) || []).filter((s) => fin(s.lat) && fin(s.lng));
        D.cfg = cfg.ok ? cfg.v : null; D.devices = dev.ok && Array.isArray(dev.v) ? dev.v : []; D.latest = lat.ok && lat.v ? lat.v : {};
        D.air = air.ok ? air.v : null; D.open = open.ok ? open.v : null;
      }
      const wordsOf = (s) => String(s.match || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      function catOfMid(mid) { const n = D.cfg && D.cfg.names && D.cfg.names[mid]; const name = n ? String(n[0]) : ''; return name && CAT[0].re.test(name) ? 'pm25' : null; }
      // PM2.5 points we may use: school sensors that report it (placed at the school's listed point), volunteer sensors, and the model grid
      function pool() {
        const now = Date.now(), pts = [], model = [];
        D.schools.forEach((s) => {
          const vals = []; let t = 0;
          D.devices.forEach((d) => {
            const g = String(d.group || '').toLowerCase() + ' ' + String(d.name || '').toLowerCase();
            if (!wordsOf(s).some((w) => g.includes(w))) return;
            const l = D.latest[d.eui]; if (!l) return;
            for (const mid of Object.keys(l)) { if (catOfMid(mid) !== 'pm25') continue; const v = Number(l[mid].v), tt = Date.parse(l[mid].t); if (fin(v) && isFinite(tt) && now - tt < DAY) { vals.push(v); t = Math.max(t, tt); break; } }
          });
          if (vals.length) pts.push({ lat: s.lat, lng: s.lng, v: mean(vals), t, src: 'school' });
        });
        if (D.open && Array.isArray(D.open.points)) D.open.points.forEach((p) => { if (fin(p.pm25) && fin(p.lat) && fin(p.lng) && (!p.time || now - Date.parse(p.time) < FRESH)) pts.push({ lat: p.lat, lng: p.lng, v: p.pm25, t: p.time ? Date.parse(p.time) : Date.parse(D.open.updated) || now, src: 'open' }); });
        if (D.air && Array.isArray(D.air.points)) D.air.points.forEach((p) => { if (fin(p.pm25) && fin(p.lat) && fin(p.lng)) model.push({ lat: p.lat, lng: p.lng, v: p.pm25, t: Date.parse(D.air.updated) || now, src: 'model' }); });
        return { pts, model };
      }
      function pmAt(p, P) {
        const near = P.pts.map((q) => ({ q, d: km(p, q) })).filter((x) => x.d <= 8);
        if (near.length) {
          const w = near.map((x) => 1 / Math.pow(x.d + 1, 2)), sw = w.reduce((a, b) => a + b, 0);
          return { v: near.reduce((s, x, i) => s + x.q.v * w[i], 0) / sw, src: near.some((x) => x.q.src === 'school') ? 'school' : 'open', t: Math.max(...near.map((x) => x.q.t)), n: near.length };
        }
        if (P.model.length) { const b = P.model.map((q) => ({ q, d: km(p, q) })).sort((x, y) => x.d - y.d)[0]; return { v: b.q.v, src: 'model', t: b.q.t, n: 1 }; }
        return null;
      }

      /* ---------- the route and the numbers ---------- */
      const school = (slug) => D.schools.find((s) => s.slug === slug);
      function endpoints() {
        const dest = school(S.school);
        if (S.kind === 'between' && S.from && school(S.from) && S.from !== S.school) { const o = school(S.from); return { a: { lat: o.lat, lng: o.lng }, b: { lat: dest.lat, lng: dest.lng }, aName: nameOf(o), bName: nameOf(dest), example: false }; }
        // an example start point: straight-line distance (trip length / 1.3) from the school, towards the middle of the island
        const c = { lat: 35.0, lng: 33.2 }, r = Math.PI / 180, dLat = c.lat - dest.lat, dLng = (c.lng - dest.lng) * Math.cos(dest.lat * r), n = Math.hypot(dLat, dLng) || 1;
        const straight = S.km / ROAD, dl = (dLat / n) * straight / 111.2, dn = (dLng / n) * straight / (111.2 * Math.cos(dest.lat * r));
        return { a: { lat: dest.lat + dl, lng: dest.lng + dn }, b: { lat: dest.lat, lng: dest.lng }, aName: T('An example start point', 'Ένα παράδειγμα αφετηρίας'), bName: nameOf(dest), example: true };
      }
      function compute() {
        const e = endpoints(), straight = km(e.a, e.b), road = S.kind === 'between' && !e.example ? straight * ROAD : S.km;
        const P = pool(), segs = [];
        for (let i = 0; i < SAMPLES; i++) {
          const f0 = i / SAMPLES, f1_ = (i + 1) / SAMPLES, fm = (f0 + f1_) / 2;
          const m = { lat: e.a.lat + (e.b.lat - e.a.lat) * fm, lng: e.a.lng + (e.b.lng - e.a.lng) * fm };
          segs.push(Object.assign({ f0, f1: f1_ }, pmAt(m, P) || { v: null }));
        }
        const have = segs.filter((s) => s.v != null), live = have.length === SAMPLES;
        const cbar = have.length ? mean(have.map((s) => s.v)) : null;
        const modes = {};
        MODE_IDS.forEach((id) => {
          const M = MODES[id], speed = road > FAR ? M.far : M.near, h = road / speed;
          const base = cbar != null ? cbar : 1;     // 1 = a relative unit when no reading exists
          modes[id] = { id, h, speed, inside: base * M.ratio, dose: base * M.ratio * M.vent * h, lo: base * M.lo * M.vent * h, hi: base * M.hi * M.vent * h };
        });
        const ts = have.map((s) => s.t).filter(Boolean);
        return { e, straight, road, segs, have, live, cbar, modes, t: ts.length ? Math.min(...ts) : 0, src: { school: have.filter((s) => s.src === 'school').length, open: have.filter((s) => s.src === 'open').length, model: have.filter((s) => s.src === 'model').length } };
      }

      /* ---------- the map ---------- */
      function drawMap(R) {
        const W = Math.max(280, A.mapBox.clientWidth || 640);
        const pa = ISLAND.project(R.e.a.lng, R.e.a.lat), pb = ISLAND.project(R.e.b.lng, R.e.b.lat);
        const asp = ISLAND.H / ISLAND.W;
        let vx = 0, vy = 0, vw = ISLAND.W, vh = ISLAND.H;
        if (S.zoom) {
          const minX = Math.min(pa[0], pb[0]), maxX = Math.max(pa[0], pb[0]), minY = Math.min(pa[1], pb[1]), maxY = Math.max(pa[1], pb[1]);
          vw = Math.max(70, (maxX - minX) * 1.7, ((maxY - minY) * 1.7) / asp); vh = vw * asp;
          if (vw >= ISLAND.W) { vx = 0; vy = 0; vw = ISLAND.W; vh = ISLAND.H; } else { vx = (minX + maxX) / 2 - vw / 2; vy = (minY + maxY) / 2 - vh / 2; }
        }
        const u = vw / W;   // svg units per screen pixel
        const svg = sv('svg', { viewBox: vx.toFixed(2) + ' ' + vy.toFixed(2) + ' ' + vw.toFixed(2) + ' ' + vh.toFixed(2), role: 'img', class: 'mr-svg',
          'aria-label': T('Map of Cyprus with a straight line from ' + R.e.aName + ' to ' + R.e.bName + '. The line is coloured by the PM2.5 near each stretch. It is a simulation.', 'Χάρτης της Κύπρου με ευθεία γραμμή από ' + R.e.aName + ' προς ' + R.e.bName + '. Η γραμμή χρωματίζεται ανάλογα με το PM2.5 κοντά σε κάθε τμήμα. Είναι προσομοίωση.') });
        Object.keys(ISLAND.districts).forEach((n) => svg.append(sv('path', { d: ISLAND.districts[n], fill: 'rgba(76,203,234,.10)', stroke: 'rgba(143,227,247,.3)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' })));
        const pt = (f) => [pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f];
        // other school points, quiet
        D.schools.forEach((s) => { const p = ISLAND.project(s.lng, s.lat); if (p[0] < vx - 20 * u || p[0] > vx + vw + 20 * u || p[1] < vy - 20 * u || p[1] > vy + vh + 20 * u) return; svg.append(sv('circle', { cx: p[0].toFixed(2), cy: p[1].toFixed(2), r: (3.5 * u).toFixed(2), fill: 'rgba(143,227,247,.5)' })); });
        const line = (f0, f1_, col, w, op) => { const a = pt(f0), b = pt(f1_); return sv('line', { x1: a[0].toFixed(2), y1: a[1].toFixed(2), x2: b[0].toFixed(2), y2: b[1].toFixed(2), stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', opacity: op }); };
        svg.append(line(0, 1, 'rgba(6,13,26,.75)', 8, 1));
        R.segs.forEach((s) => svg.append(line(s.f0, s.f1, s.v != null ? band(s.v) : '#8CA0B8', 4.5, s.v != null ? 1 : 0.7)));
        const lab = (p, text, dy, anchor) => sv('text', { x: p[0].toFixed(2), y: (p[1] + dy * u).toFixed(2), 'text-anchor': anchor || 'middle', class: 'mr-lab', style: 'font-size:' + (12 * u).toFixed(2) + 'px;stroke-width:' + (3 * u).toFixed(2) + 'px' }, text);
        svg.append(sv('circle', { cx: pa[0].toFixed(2), cy: pa[1].toFixed(2), r: (6 * u).toFixed(2), fill: '#0C1626', stroke: '#fff', 'stroke-width': (2 * u).toFixed(2) }));
        svg.append(sv('circle', { cx: pb[0].toFixed(2), cy: pb[1].toFixed(2), r: (7 * u).toFixed(2), fill: '#E07F3F', stroke: '#fff', 'stroke-width': (2 * u).toFixed(2) }));
        const left = pa[0] > pb[0];
        svg.append(lab(pa, R.e.example ? T('Start (example)', 'Αφετηρία (παράδειγμα)') : R.e.aName, left ? 20 : -12, 'middle'), lab(pb, R.e.bName, left ? -12 : 20, 'middle'));
        const dot = sv('circle', { r: (6 * u).toFixed(2), fill: MODES[S.mode].col, stroke: '#fff', 'stroke-width': (2 * u).toFixed(2), class: 'mr-dot' });
        const place = (p) => { const q = pt(p); dot.setAttribute('cx', q[0].toFixed(2)); dot.setAttribute('cy', q[1].toFixed(2)); };
        place(S.p); A.place = place;
        svg.append(dot);
        fill(A.mapBox, svg);
      }

      /* ---------- results ---------- */
      const doseAt = (R, id, p) => {
        const m = R.modes[id], M = MODES[id], base = R.cbar != null ? 1 : 1;
        let sum = 0;
        R.segs.forEach((s) => { const w = Math.max(0, Math.min(s.f1, p) - s.f0); sum += (s.v != null ? s.v : R.cbar != null ? R.cbar : 1) * w; });
        return sum * M.ratio * M.vent * m.h * base;
      };
      const unitStr = (R) => (R.cbar != null ? 'µg' : T('relative units', 'σχετικές μονάδες'));
      function summary(R) {
        const m = R.modes[S.mode], M = MODES[S.mode];
        const rel = R.cbar == null;
        const counter = el('b', { class: 'mr-now' }, f1(doseAt(R, S.mode, S.p)));
        A.counter = counter;
        const play = el('button', { type: 'button', class: 'nm-btn nm-btn--primary', onclick: () => playTrip(R) }, ic(S.p > 0 && S.p < 1 ? 'replay' : 'play', 18), S.p >= 1 ? T('Play again', 'Αναπαραγωγή ξανά') : T('Play the trip', 'Αναπαραγωγή διαδρομής'));
        A.play = play;
        return el('section', { class: 'nm-card mr-sum', 'aria-label': T('Your trip', 'Η διαδρομή σας') },
          el('div', { class: 'mr-cap' }, T('Your trip, ' + M.l[0].toLowerCase(), 'Η διαδρομή σας, ' + M.l[1].toLowerCase())),
          el('div', { class: 'mr-big' },
            el('div', null, el('span', { class: 'k' }, T('Time on the way', 'Χρόνος διαδρομής')), el('strong', null, durText(m.h)), el('span', { class: 'sub' }, T('about ' + SC.num(R.road, R.road < 10 ? 1 : 0) + ' km at ' + m.speed + ' km/h', 'περίπου ' + SC.num(R.road, R.road < 10 ? 1 : 0) + ' χλμ. με ' + m.speed + ' χλμ./ώρα'))),
            el('div', null, el('span', { class: 'k' }, rel ? T('Breathed in (relative)', 'Εισπνοή (σχετική)') : T('PM2.5 breathed in', 'PM2.5 που εισπνέετε')), el('strong', null, rel ? SC.num(m.dose, 1) : f1(m.dose), el('small', null, rel ? '' : 'µg')),
              el('span', { class: 'sub' }, T('range ', 'εύρος ') + SC.num(m.lo, 1) + T(' to ', ' έως ') + SC.num(m.hi, 1) + (rel ? '' : ' µg')))),
          el('p', { class: 'mr-line' }, rel ? T('No PM2.5 reading is available right now, so these are typical ratios only (an air value of 1 along the whole route). Compare the modes with each other, not with a limit.', 'Δεν υπάρχει αυτή τη στιγμή μέτρηση PM2.5, γι’ αυτό είναι μόνο τυπικοί λόγοι (τιμή αέρα 1 σε όλη τη διαδρομή). Συγκρίνετε τους τρόπους μεταξύ τους, όχι με κάποιο όριο.')
            : T('Air along the route averages ' + f1(R.cbar) + ' µg/m³. Inside or beside a ' + M.l[0].toLowerCase() + ' it is taken as ' + f1(m.inside) + ' µg/m³ (' + SC.num(M.ratio, 1) + ' times), and you breathe ' + SC.num(M.vent, 1) + ' m³ of air an hour.', 'Ο αέρας κατά μήκος της διαδρομής έχει μέσο όρο ' + f1(R.cbar) + ' µg/m³. Μέσα ή δίπλα σε ' + M.l[1].toLowerCase() + ' θεωρείται ' + f1(m.inside) + ' µg/m³ (' + SC.num(M.ratio, 1) + ' φορές) και αναπνέετε ' + SC.num(M.vent, 1) + ' m³ αέρα την ώρα.')),
          el('div', { class: 'mr-playrow' }, play, el('span', { class: 'mr-so' }, T('Breathed in so far: ', 'Έχετε εισπνεύσει μέχρι τώρα: '), counter, ' ', unitStr(R))));
      }
      function compare(R) {
        const mx = Math.max(...MODE_IDS.map((i) => R.modes[i].hi), 1e-9), rel = R.cbar == null;
        const rows = MODE_IDS.map((id) => {
          const m = R.modes[id], M = MODES[id];
          const bar = el('span', { class: 'bar', role: 'img', 'aria-label': T(M.l[0] + ': ' + SC.num(m.dose, 1) + (rel ? '' : ' µg') + ', range ' + SC.num(m.lo, 1) + ' to ' + SC.num(m.hi, 1), M.l[1] + ': ' + SC.num(m.dose, 1) + (rel ? '' : ' µg') + ', εύρος ' + SC.num(m.lo, 1) + ' έως ' + SC.num(m.hi, 1)) }, el('i'), el('u'));
          bar.firstChild.style.width = (m.dose / mx) * 100 + '%'; bar.firstChild.style.background = M.col;
          bar.lastChild.style.left = (m.lo / mx) * 100 + '%'; bar.lastChild.style.width = Math.max(0.8, ((m.hi - m.lo) / mx) * 100) + '%';
          return el('button', { type: 'button', class: 'mr-mode' + (id === S.mode ? ' on' : ''), 'aria-pressed': id === S.mode ? 'true' : 'false', onclick: () => { S.mode = id; S.p = 0; stop(); paint(); } },
            el('div', { class: 'top' }, el('span', { class: 'ico', style: { color: M.col } }, ic(M.icon)), el('b', null, T(M.l[0], M.l[1])), el('span', { class: 'v' }, rel ? SC.num(m.dose, 1) : f1(m.dose), el('small', null, rel ? '' : ' µg'))),
            bar,
            el('div', { class: 'meta' }, el('span', null, durText(m.h)), el('span', null, rel ? T('relative', 'σχετικό') : f1(m.inside) + ' µg/m³'), el('span', null, T('range ', 'εύρος ') + SC.num(m.lo, 1) + '–' + SC.num(m.hi, 1))),
            el('p', null, T(M.note[0], M.note[1])));
        });
        const w = MODE_IDS.map((i) => R.modes[i]).sort((a, b) => a.dose - b.dose);
        const overlap = MODE_IDS.filter((a) => MODE_IDS.some((b) => a !== b && R.modes[a].lo <= R.modes[b].hi && R.modes[b].lo <= R.modes[a].hi)).length === MODE_IDS.length;
        const wk = R.modes.walk, cr = R.modes.car;
        return el('section', { class: 'nm-card mr-cmp', 'aria-label': T('Walking, bus and car compared', 'Σύγκριση περπατήματος, λεωφορείου και αυτοκινήτου') },
          el('div', { class: 'mr-cap' }, T('Walking, bus and car compared', 'Σύγκριση περπατήματος, λεωφορείου και αυτοκινήτου')),
          el('div', { class: 'mr-modes' }, rows),
          el('p', { class: 'mr-take' }, el('b', null, T('How to read this. ', 'Πώς να το διαβάσετε. ')),
            wk.h > cr.h * 1.5 ? T('Walking takes ' + SC.num(wk.h / cr.h, 1) + ' times as long as the car, and you breathe harder, so the walker breathes in more PM2.5 over the trip even though the air is no dirtier. ', 'Το περπάτημα διαρκεί ' + SC.num(wk.h / cr.h, 1) + ' φορές περισσότερο από το αυτοκίνητο και αναπνέετε πιο έντονα, γι’ αυτό ο πεζός εισπνέει περισσότερο PM2.5 στη διαδρομή χωρίς ο αέρας να είναι πιο βρώμικος. ') : '',
            overlap ? T('The ranges overlap, so do not read a winner into the numbers. ', 'Τα εύρη επικαλύπτονται, γι’ αυτό μην βγάλετε νικητή από τους αριθμούς. ') : '',
            T('Walking also has health benefits that this page does not count. It compares PM2.5 only.', 'Το περπάτημα έχει και οφέλη για την υγεία που αυτή η σελίδα δεν υπολογίζει. Συγκρίνει μόνο το PM2.5.')));
      }
      function strip(R) {
        const rel = !R.have.length;
        const srcBits = [];
        if (R.src.school) srcBits.push(T('a school sensor (' + R.src.school + ' stretches)', 'αισθητήρας σχολείου (' + R.src.school + ' τμήματα)'));
        if (R.src.open) srcBits.push(T('Sensor.Community volunteer sensors (' + R.src.open + ' stretches)', 'αισθητήρες εθελοντών Sensor.Community (' + R.src.open + ' τμήματα)'));
        if (R.src.model) srcBits.push(T('the Open-Meteo air-quality model (' + R.src.model + ' stretches)', 'το μοντέλο ποιότητας αέρα Open-Meteo (' + R.src.model + ' τμήματα)'));
        return el('section', { class: 'nm-card mr-strip', 'aria-label': T('PM2.5 along the route', 'PM2.5 κατά μήκος της διαδρομής') },
          el('div', { class: 'mr-cap' }, T('PM2.5 along the route, real readings', 'PM2.5 κατά μήκος της διαδρομής, πραγματικές μετρήσεις')),
          rel ? el('div', { class: 'empty' }, T('No PM2.5 reading is available near this route: no school sensor reports it, the volunteer sensors returned nothing nearby, and the Open-Meteo model could not be reached. The simulation shows typical ratios between the modes only.', 'Δεν υπάρχει μέτρηση PM2.5 κοντά σε αυτή τη διαδρομή: κανένας αισθητήρας σχολείου δεν την αναφέρει, οι αισθητήρες εθελοντών δεν επέστρεψαν τίποτα κοντά και το μοντέλο Open-Meteo δεν ήταν προσβάσιμο. Η προσομοίωση δείχνει μόνο τυπικούς λόγους μεταξύ των τρόπων.'))
            : el('div', null,
              el('div', { class: 'mr-cells', role: 'img', 'aria-label': T('PM2.5 per stretch, from the start to the school: ', 'PM2.5 ανά τμήμα, από την αφετηρία έως το σχολείο: ') + R.segs.map((s) => (s.v != null ? f1(s.v) : '–')).join(', ') },
                R.segs.map((s) => { const c = el('span', { class: 'c' }, s.v != null ? SC.num(s.v, 0) : '–'); if (s.v != null) c.style.setProperty('--c', band(s.v)); return c; })),
              el('p', { class: 'mr-src' }, T('From ', 'Από ') + srcBits.join(', ') + '. ' + (R.t ? T('Oldest reading used: ' + agoText(R.t) + '. ', 'Παλαιότερη μέτρηση που χρησιμοποιήθηκε: ' + agoText(R.t) + '. ') : '') + (R.have.length < SAMPLES ? T(R.have.length + ' of ' + SAMPLES + ' stretches have a value; the average uses those. ', R.have.length + ' από ' + SAMPLES + ' τμήματα έχουν τιμή· ο μέσος όρος χρησιμοποιεί αυτά. ') : ''),
                R.t && Date.now() - R.t > FRESH ? el('span', { class: 'nm-badge nm-badge--warn' }, T('Old reading', 'Παλιά μέτρηση')) : null),
              el('div', { class: 'mr-scale' }, [['≤5', '#59d98e', T('low', 'χαμηλό')], ['≤15', '#F2CF86', T('at the WHO guide', 'στο όριο ΠΟΥ')], ['≤35', '#F2A56B', T('raised', 'αυξημένο')], ['>35', '#FF7A6A', T('high', 'υψηλό')]].map(([t, c, w]) => { const s = el('span', null, t + ' µg/m³ ', el('em', null, w)); s.style.setProperty('--c', c); return s; }))));
      }
      function how() {
        const rows = MODE_IDS.map((id) => { const M = MODES[id]; return el('tr', null, el('td', null, T(M.l[0], M.l[1])), el('td', null, M.near + ' / ' + M.far + ' km/h'), el('td', null, SC.num(M.vent, 1) + ' m³/h'), el('td', null, SC.num(M.ratio, 1) + ' (' + SC.num(M.lo, 1) + ' – ' + SC.num(M.hi, 1) + ')'), el('td', { class: 'b' }, T(M.note[0], M.note[1]))); });
        const det = el('details', { class: 'mr-how nm-callout nm-callout--info' });
        det.open = typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches;
        det.append(el('summary', null, ic('info'), T('How this simulation works', 'Πώς λειτουργεί αυτή η προσομοίωση')),
          el('div', { class: 'mr-how-g' },
            el('ol', null,
              el('li', null, el('b', null, T('A route between two points. ', 'Μια διαδρομή ανάμεσα σε δύο σημεία. ')), T('Both points come from the school list. A straight line is drawn and the road length is taken as the line times ' + ROAD + ' (a rule of thumb: no routing service is used). "Near the school" starts at an example point the length you chose away from the school, towards the middle of the island. It is not an address and not a real road.', 'Και τα δύο σημεία προέρχονται από τη λίστα των σχολείων. Σχεδιάζεται ευθεία γραμμή και το μήκος του δρόμου λαμβάνεται ως η γραμμή επί ' + ROAD + ' (εμπειρικός κανόνας: δεν χρησιμοποιείται υπηρεσία δρομολόγησης). Το «Κοντά στο σχολείο» ξεκινά από ένα σημείο-παράδειγμα σε απόσταση όση διαλέξατε από το σχολείο, προς το κέντρο του νησιού. Δεν είναι διεύθυνση ούτε πραγματικός δρόμος.')),
              el('li', null, el('b', null, T('Real PM2.5 near each stretch. ', 'Πραγματικό PM2.5 κοντά σε κάθε τμήμα. ')), T('The line is cut into ' + SAMPLES + ' stretches. For each one the page takes, in this order: a school sensor or Sensor.Community sensors within 8 km (nearer ones count more), else the nearest point of the Open-Meteo air-quality model. The route average is the plain mean of the stretches.', 'Η γραμμή κόβεται σε ' + SAMPLES + ' τμήματα. Για κάθε ένα η σελίδα παίρνει, με αυτή τη σειρά: έναν αισθητήρα σχολείου ή αισθητήρες Sensor.Community σε απόσταση έως 8 χλμ. (οι πιο κοντινοί μετρούν περισσότερο), αλλιώς το πλησιέστερο σημείο του μοντέλου ποιότητας αέρα Open-Meteo. Ο μέσος όρος της διαδρομής είναι ο απλός μέσος όρος των τμημάτων.')),
              el('li', null, el('b', null, T('Time, air and breathing for each way. ', 'Χρόνος, αέρας και αναπνοή για κάθε τρόπο. ')), T('Inhaled PM2.5 = route average × in-vehicle ratio × breathing rate × time. The table gives the numbers. The range uses the low and high ratio.', 'Εισπνεόμενο PM2.5 = μέσος όρος διαδρομής × λόγος μέσα στο όχημα × ρυθμός αναπνοής × χρόνος. Ο πίνακας δίνει τους αριθμούς. Το εύρος χρησιμοποιεί τον χαμηλό και τον υψηλό λόγο.')),
              el('li', null, el('b', null, T('What it leaves out. ', 'Τι αφήνει έξω. ')), T('Real roads, traffic jams, open windows, filters, a particular child\'s lungs and the health benefits of walking. Treat the result as a way to think, not as advice.', 'Πραγματικούς δρόμους, μποτιλιάρισμα, ανοιχτά παράθυρα, φίλτρα, τους πνεύμονες ενός συγκεκριμένου παιδιού και τα οφέλη του περπατήματος. Δείτε το αποτέλεσμα ως τρόπο σκέψης, όχι ως συμβουλή.'))),
            el('div', { class: 'rt' }, el('pre', { class: 'mr-formula', tabindex: 0 }, 'road km     = straight line × ' + ROAD + '   (or the length you chose)\ntime (h)    = road km ÷ speed\ninhaled µg  = air µg/m³ × ratio × m³ per hour × time (h)\nrange       = same, with the low and the high ratio'),
              el('p', { class: 'mr-un' }, el('b', null, T('Not tested. ', 'Δεν έχει δοκιμαστεί. ')), T('Nobody has measured these ratios on our buses or cars. A PM2.5 sensor carried on a real trip would show how far off they are.', 'Κανείς δεν έχει μετρήσει αυτούς τους λόγους στα λεωφορεία ή τα αυτοκίνητά μας. Ένας αισθητήρας PM2.5 σε μια πραγματική διαδρομή θα έδειχνε πόσο απέχουν.'))),
            el('div', { class: 'mr-tbl' }, el('div', { class: 'nm-table-wrap' }, el('table', { class: 'nm-table' },
              el('thead', null, el('tr', null, el('th', null, T('Way', 'Τρόπος')), el('th', null, T('Speed, up to 10 km / over 10 km', 'Ταχύτητα, έως 10 χλμ. / πάνω από 10 χλμ.')), el('th', null, T('Breathing', 'Αναπνοή')), el('th', null, T('Air ratio (low – high)', 'Λόγος αέρα (χαμηλός – υψηλός)')), el('th', null, T('Why', 'Γιατί')))),
              el('tbody', null, rows)))),
            el('p', { class: 'mr-srcs' }, T('Where the numbers come from: speeds are our assumptions for school-day traffic in Cyprus. Breathing rates are rounded from the US EPA Exposure Factors Handbook (2011): about 0.5 m³/h seated and about 1.2 m³/h walking, for an adult; a child breathes less in absolute terms but the walking-to-seated ratio is similar. The air ratios are our rounded assumptions, informed by the review of in-transport air pollution studies by Cepeda et al. 2017 (Lancet Public Health 2:e23-e34), which found that levels depend heavily on the city, the vehicle and the traffic; the ranges are wide on purpose. The WHO 24-hour guide for PM2.5 is 15 µg/m³ (global air quality guidelines 2021); the colours above use 5, 15 and 35 µg/m³ only as a rough scale.',
              'Από πού προέρχονται οι αριθμοί: οι ταχύτητες είναι δικές μας παραδοχές για την κυκλοφορία σχολικής ημέρας στην Κύπρο. Οι ρυθμοί αναπνοής είναι στρογγυλεμένοι από το Exposure Factors Handbook της EPA των ΗΠΑ (2011): περίπου 0,5 m³/ώρα καθιστός και περίπου 1,2 m³/ώρα περπατώντας, για ενήλικα· ένα παιδί αναπνέει λιγότερο σε απόλυτους όρους αλλά ο λόγος περπάτημα προς κάθισμα είναι παρόμοιος. Οι λόγοι αέρα είναι δικές μας στρογγυλεμένες παραδοχές, βασισμένες στην ανασκόπηση μελετών ρύπανσης κατά τη μετακίνηση των Cepeda και συν. 2017 (Lancet Public Health 2:e23-e34), που βρήκε ότι τα επίπεδα εξαρτώνται πολύ από την πόλη, το όχημα και την κυκλοφορία· τα εύρη είναι μεγάλα σκόπιμα. Ο οδηγός 24 ωρών του ΠΟΥ για το PM2.5 είναι 15 µg/m³ (παγκόσμιες οδηγίες 2021)· τα χρώματα παραπάνω χρησιμοποιούν τα 5, 15 και 35 µg/m³ μόνο ως χονδρική κλίμακα.')));
        return det;
      }

      /* ---------- animation ---------- */
      function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
      function playTrip(R) {
        stop();
        if (reduced()) { S.p = 1; if (A.place) A.place(1); if (A.counter) A.counter.textContent = f1(doseAt(R, S.mode, 1)); paintPlay(R); return; }
        S.p = 0;
        const dur = Math.max(2500, Math.min(9000, 2500 + 1500 * Math.log2(1 + R.modes[S.mode].h / R.modes.car.h)));
        const t0 = performance.now();
        const step = (t) => {
          S.p = Math.min(1, (t - t0) / dur);
          if (A.place) A.place(S.p);
          if (A.counter) A.counter.textContent = f1(doseAt(R, S.mode, S.p));
          if (S.p < 1) raf = requestAnimationFrame(step); else { raf = 0; paintPlay(R); }
        };
        paintPlay(R);
        raf = requestAnimationFrame(step);
      }
      function paintPlay(R) { if (!A.play) return; fill(A.play, ic(S.p > 0 && S.p < 1 ? 'replay' : S.p >= 1 ? 'replay' : 'play', 18), S.p >= 1 ? T('Play again', 'Αναπαραγωγή ξανά') : S.p > 0 ? T('Playing…', 'Αναπαραγωγή…') : T('Play the trip', 'Αναπαραγωγή διαδρομής')); }

      /* ---------- the page ---------- */
      function paint() {
        stop();
        if (!A.res) return;
        const R = compute(); A.R = R;
        const rel = !R.have.length;
        fill(A.facts, el('span', null, el('b', null, T('From ', 'Από ')), R.e.example ? T('an example start point', 'ένα παράδειγμα αφετηρίας') : R.e.aName), el('span', null, el('b', null, T('To ', 'Προς ')), R.e.bName),
          el('span', null, el('b', null, T('Road length ', 'Μήκος δρόμου ')), '~' + SC.num(R.road, R.road < 10 ? 1 : 0) + ' km'), el('span', null, T('Straight line between points, not a road route', 'Ευθεία γραμμή ανάμεσα σε σημεία, όχι διαδρομή δρόμου')));
        A.mapBox.classList.toggle('empty-data', rel);
        drawMap(R);
        fill(A.res, summary(R), compare(R));
        fill(A.stripBox, strip(R));
        document.querySelectorAll('.mr-modeb button').forEach((b) => { const on = b.dataset.m === S.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        if (A.zoomBtn) A.zoomBtn.textContent = S.zoom ? T('Show the whole island', 'Εμφάνιση ολόκληρου του νησιού') : T('Zoom to the route', 'Μεγέθυνση στη διαδρομή');
        if (A.kmOut) A.kmOut.textContent = S.km + ' km';
        head({ fresh: R.t ? T('PM2.5 reading ', 'Μέτρηση PM2.5 ') + agoText(R.t) : null });
      }
      function drawPage() {
        if (D.schools.length < 1) { fill(body, el('div', { class: 'empty' }, T('No schools are listed yet, so there are no points to draw a route between.', 'Δεν υπάρχουν ακόμα σχολεία στη λίστα, άρα δεν υπάρχουν σημεία για διαδρομή.'))); return; }
        const want = ctx.query && ctx.query.get('school');
        if (!S.school || !school(S.school)) S.school = school(want) ? want : D.schools[0].slug;
        if (!S.from || S.from === S.school || !school(S.from)) { const o = D.schools.find((s) => s.slug !== S.school); S.from = o ? o.slug : null; }
        if (S.zoom == null) S.zoom = S.kind === 'near';
        const canBetween = D.schools.length > 1;
        if (S.kind === 'between' && !canBetween) S.kind = 'near';
        const pill = (cls, label, items) => el('div', null, el('span', { class: 'mr-lab' }, label), el('div', { class: 'nm-pillbar ' + cls, role: 'group', 'aria-label': label }, items));
        const kindBar = pill('mr-kind', T('Trip', 'Διαδρομή'), [['near', T('Near the school', 'Κοντά στο σχολείο')], canBetween ? ['between', T('Between two schools', 'Ανάμεσα σε δύο σχολεία')] : null].filter(Boolean).map(([k, l]) =>
          el('button', { type: 'button', class: S.kind === k ? 'on' : '', 'aria-pressed': S.kind === k ? 'true' : 'false', onclick: () => { S.kind = k; S.zoom = k === 'near'; S.p = 0; drawPage(); } }, l)));
        const schBar = pill('mr-sch', T('School you travel to', 'Σχολείο προορισμού'), D.schools.map((s) => el('button', { type: 'button', class: s.slug === S.school ? 'on' : '', 'aria-pressed': s.slug === S.school ? 'true' : 'false', onclick: () => { S.school = s.slug; S.p = 0; drawPage(); } }, shortOf(s))));
        const modeBar = pill('mr-modeb', T('How you travel', 'Πώς μετακινείστε'), MODE_IDS.map((id) => el('button', { type: 'button', 'data-m': id, onclick: () => { S.mode = id; S.p = 0; paint(); } }, T(MODES[id].l[0], MODES[id].l[1]))));
        let extra;
        if (S.kind === 'between') {
          const sel = el('select', { class: 'nm-input', id: 'mr-from', 'aria-label': T('Start school', 'Σχολείο αφετηρίας') }, D.schools.filter((s) => s.slug !== S.school).map((s) => el('option', { value: s.slug, selected: s.slug === S.from ? true : null }, nameOf(s))));
          sel.addEventListener('change', () => { S.from = sel.value; S.p = 0; paint(); });
          extra = el('div', { class: 'mr-extra' }, el('label', { class: 'mr-lab', for: 'mr-from' }, T('Start from', 'Αφετηρία')), sel);
          A.kmOut = null;
        } else {
          const rng = el('input', { type: 'range', id: 'mr-km', min: 1, max: 5, step: 0.5, value: S.km, 'aria-label': T('Trip length in km', 'Μήκος διαδρομής σε χλμ.') });
          const out = el('output', { for: 'mr-km' }, S.km + ' km'); A.kmOut = out;
          const fillP = () => rng.style.setProperty('--p', ((rng.value - rng.min) / (rng.max - rng.min)) * 100 + '%');
          rng.addEventListener('input', () => { S.km = Number(rng.value); S.p = 0; fillP(); paint(); });
          fillP();
          extra = el('div', { class: 'mr-extra' }, el('label', { class: 'mr-lab', for: 'mr-km' }, T('Trip length (road km)', 'Μήκος διαδρομής (χλμ. δρόμου)')), el('div', { class: 'mr-rng' }, rng, out));
        }
        A.mapBox = el('div', { class: 'mr-map' });
        A.zoomBtn = el('button', { type: 'button', class: 'nm-btn mr-zoom', onclick: () => { S.zoom = !S.zoom; paint(); } });
        A.facts = el('div', { class: 'mr-facts' });
        A.res = el('div', { class: 'mr-res' });
        A.stripBox = el('div');
        fill(body,
          el('section', { class: 'nm-card mr-ctl' }, kindBar, schBar, extra, modeBar),
          el('div', { class: 'mr-grid' },
            el('section', { class: 'nm-card mr-mapcard', 'aria-label': T('The route on the island', 'Η διαδρομή στο νησί') },
              el('div', { class: 'mr-cap-row' }, el('div', { class: 'mr-cap' }, T('The route on the island', 'Η διαδρομή στο νησί')), el('span', { class: 'mr-sim' }, ic('alert', 14), T('Simulation', 'Προσομοίωση')), A.zoomBtn),
              A.mapBox, A.facts),
            A.res),
          A.stripBox, how());
        paint();
      }

      /* ---------- start ---------- */
      function loadingBox() { return el('div', { class: 'loading' }, T('Loading the schools and the latest PM2.5', 'Φόρτωση των σχολείων και του τελευταίου PM2.5')); }
      async function start(force) {
        fill(body, loadingBox());
        try { await load(force); } catch (e) {
          if (alive) fill(body, el('div', null, el('div', { class: 'err', role: 'alert' }, T('The school list could not be loaded, so there is nothing to draw. ', 'Η λίστα των σχολείων δεν φορτώθηκε, άρα δεν υπάρχει τι να σχεδιαστεί. ') + (e && e.message ? e.message : '')),
            el('div', { style: { marginTop: '10px' } }, el('button', { type: 'button', class: 'nm-btn', onclick: () => start(true) }, T('Try again', 'Δοκιμάστε ξανά')))));
          return;
        }
        if (!alive) return;
        head(); drawPage();
      }
      async function refresh() { if (!alive || !D.schools.length || raf) return; try { await load(false); } catch (e) { return; } if (alive && A.res) paint(); }
      const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (alive && A.R && A.mapBox && A.mapBox.isConnected) drawMap(A.R); }, 200); };
      window.addEventListener('resize', onResize);
      timer = setInterval(refresh, 120000);
      start(false);
      return () => { alive = false; stop(); clearInterval(timer); clearTimeout(rz); window.removeEventListener('resize', onResize); };
    },
  });
})();
