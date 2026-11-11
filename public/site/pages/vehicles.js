/*
  Vehicles: the buses and cars that carry a sensor.
    #/vehicles          status tiles, a card per vehicle (latest readings and 24 h sparklines), trips of the last 24 hours
    #/vehicles/<eui>    one vehicle: readings, a history chart per reading (24 h / 7 days / 30 days), Download CSV, Follow one trip
  Sources: /api/config /api/devices /api/latest /api/series /api/trails. Refreshes every 60 s.

  Privacy: the server already hands the public a position that is at least /api/config posDelayMin old and rounded to
  posGrid degrees (a teacher gets exact data). This page never prints a coordinate: positions are put in words ("about
  4 km north-east of Larnaka, about 2 h ago"), and nothing here says "now" about a position unless the server says it is exact.
  Motion and trips are worked out in the browser from the same delayed, rounded trails, so they are only as good as those.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  const sv = (tag, attrs, ...kids) => SC.svgEl(tag, attrs, ...kids.flat(Infinity));
  SC.css('/site/pages/vehicles.css');
  // replaceChildren that skips null and false (the native one would print them as text)
  const fill = (box, ...kids) => box.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));

  const HOUR = 3600000, DAY = 86400000, FRESH = 3 * HOUR;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const fmt = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d == null ? 1 : d).replace('-', '−'));
  const enc = encodeURIComponent;
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const when = (t) => (SC.date(t) === SC.date(Date.now()) ? SC.time(t) : SC.date(t) + ' ' + SC.time(t));

  /* ---------- small icons the shell does not have ---------- */
  const PATHS = {
    car: '<path d="M4 18v-5.4l1.7-4.5A2 2 0 017.6 6.8h8.8a2 2 0 011.9 1.3L20 12.6V18"/><path d="M3 18h18M4 12.6h16M6.5 18v2M17.5 18v2"/><circle cx="7.8" cy="15.3" r=".9" fill="currentColor"/><circle cx="16.2" cy="15.3" r=".9" fill="currentColor"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
  };
  function ico(name, size) {
    if (SC.icons && SC.icons[name]) return SC.icon(name, size);
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.innerHTML = PATHS[name] || '';
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    return s;
  }

  /* ---------- schools, towns and words for a position ---------- */
  const SCH = [
    { id: 'larnaka', n: T('PASCAL Larnaka', 'PASCAL Λάρνακα'), re: /larnak|larnac|λάρνακ/i },
    { id: 'lefkosia', n: T('PASCAL Lefkosia', 'PASCAL Λευκωσία'), re: /lefkos|nicosia|λευκωσ/i },
    { id: 'limassol', n: T('PASCAL Limassol', 'PASCAL Λεμεσός'), re: /limass|lemes|λεμεσ/i },
    { id: 'paphos', n: T('International School of Paphos', 'Διεθνές Σχολείο Πάφου'), gen: 'Διεθνούς Σχολείου Πάφου', re: /paph|pafos|πάφ|παφ/i },
  ];
  // Greek forms: acc = after "από"/"κοντά", gen = after a compass word
  const TOWNS = [
    { en: 'Lefkosia', el: 'Λευκωσία', acc: 'τη Λευκωσία', gen: 'της Λευκωσίας', lat: 35.1856, lng: 33.3823 },
    { en: 'Limassol', el: 'Λεμεσός', acc: 'τη Λεμεσό', gen: 'της Λεμεσού', lat: 34.6841, lng: 33.0379 },
    { en: 'Larnaka', el: 'Λάρνακα', acc: 'τη Λάρνακα', gen: 'της Λάρνακας', lat: 34.9229, lng: 33.6233 },
    { en: 'Paphos', el: 'Πάφος', acc: 'την Πάφο', gen: 'της Πάφου', lat: 34.7720, lng: 32.4297 },
    { en: 'Famagusta', el: 'Αμμόχωστος', acc: 'την Αμμόχωστο', gen: 'της Αμμοχώστου', lat: 35.1264, lng: 33.9419 },
    { en: 'Paralimni', el: 'Παραλίμνι', acc: 'το Παραλίμνι', gen: 'του Παραλιμνίου', lat: 35.0381, lng: 33.9836 },
    { en: 'Ayia Napa', el: 'Αγία Νάπα', acc: 'την Αγία Νάπα', gen: 'της Αγίας Νάπας', lat: 34.9882, lng: 34.0125 },
    { en: 'Troodos', el: 'Τρόοδος', acc: 'το Τρόοδος', gen: 'του Τροόδους', lat: 34.9333, lng: 32.8667 },
    { en: 'Kakopetria', el: 'Κακοπετριά', acc: 'την Κακοπετριά', gen: 'της Κακοπετριάς', lat: 34.9917, lng: 32.9 },
    { en: 'Agros', el: 'Άγρος', acc: 'τον Άγρο', gen: 'του Άγρου', lat: 34.9149, lng: 33.0157 },
    { en: 'Lefkara', el: 'Λεύκαρα', acc: 'τα Λεύκαρα', gen: 'των Λευκάρων', lat: 34.8667, lng: 33.3 },
    { en: 'Polis', el: 'Πόλη Χρυσοχούς', acc: 'την Πόλη Χρυσοχούς', gen: 'της Πόλης Χρυσοχούς', lat: 35.0361, lng: 32.4258 },
    { en: 'Pissouri', el: 'Πισσούρι', acc: 'το Πισσούρι', gen: 'του Πισσουρίου', lat: 34.67, lng: 32.7 },
  ];
  const DIR_EN = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const DIR_EL = ['βόρεια', 'βορειοανατολικά', 'ανατολικά', 'νοτιοανατολικά', 'νότια', 'νοτιοδυτικά', 'δυτικά', 'βορειοδυτικά'];
  const rad = (d) => d * Math.PI / 180;
  function km(a, b, c, d) {
    const dLat = rad(c - a), dLng = rad(d - b), x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  }
  function bearing(a, b, c, d) {   // from point 1 to point 2, in degrees
    const y = Math.sin(rad(d - b)) * Math.cos(rad(c)), x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  const roundKm = (k) => Math.max(1, k < 20 ? Math.round(k) : Math.round(k / 5) * 5);
  function schoolPoint(s) { const i = (window.ISLAND && ISLAND.schools || []).find((x) => x.id === s.id); return i ? { lat: i.lat, lng: i.lng } : null; }

  /* A position in words: { en, el } lower-case, to follow "Last seen ..." or be capitalised on its own. Never a coordinate. */
  function describe(lat, lng, stopped) {
    let bs = null;
    SCH.forEach((s) => { const p = schoolPoint(s); if (!p) return; const k = km(lat, lng, p.lat, p.lng); if (!bs || k < bs.k) bs = { s, k, p }; });
    if (bs && bs.k <= 1.5) {
      const nm = bs.s.n;
      return stopped ? { en: 'at ' + nm, el: 'στο ' + nm } : { en: 'near ' + nm, el: 'κοντά στο ' + nm };
    }
    let ref = null;
    if (bs && bs.k <= 3) ref = { en: bs.s.n, el: 'το ' + bs.s.n, acc: 'το ' + bs.s.n, gen: 'του ' + (bs.s.gen || bs.s.n), k: bs.k, p: bs.p };
    else TOWNS.forEach((t) => { const k = km(lat, lng, t.lat, t.lng); if (!ref || k < ref.k) ref = { en: t.en, acc: t.acc, gen: t.gen, k, p: t }; });
    if (!ref) return { en: 'in Cyprus', el: 'στην Κύπρο' };
    const r = roundKm(ref.k);
    if (ref.k < 2.5) return { en: 'about ' + r + ' km from ' + ref.en, el: 'περίπου ' + r + ' χλμ. από ' + ref.acc };
    const i = Math.round(bearing(ref.p.lat, ref.p.lng, lat, lng) / 45) % 8;
    return { en: 'about ' + r + ' km ' + DIR_EN[i] + ' of ' + ref.en, el: 'περίπου ' + r + ' χλμ. ' + DIR_EL[i] + ' ' + ref.gen };
  }
  const nearestTown = (lat, lng) => { let b = null; TOWNS.forEach((t) => { const k = km(lat, lng, t.lat, t.lng); if (!b || k < b.k) b = { t, k }; }); return b ? T(b.t.en, b.t.el) : ''; };

  /* ---------- devices ---------- */
  const VEH = /\b(bus|car|van|minibus|coach|vehicle|taxi|truck|shuttle)\b|λεωφορ|αυτοκίν|όχημα/i;
  const FIXED = /\b(class(room)?|lab|room|office|library|hall|gym|indoor|outdoor|roof|yard|playground|garden|fixed|station)\b|τάξη|αίθουσα|εργαστήρι/i;
  const BUS = /\b(bus|minibus|coach|shuttle)\b|λεωφορ/i, CAR = /\b(car|van|taxi|vehicle)\b|αυτοκίν|όχημα/i;
  const schoolOf = (d) => { for (const txt of [d.group, d.name]) for (const s of SCH) if (s.re.test(txt || '')) return s; return null; };
  const kindOf = (d) => (BUS.test(d.name || '') ? 'bus' : CAR.test(d.name || '') ? 'car' : 'other');
  const seenMs = (d) => { const m = d.lastSeen ? Date.parse(d.lastSeen) : NaN; return isFinite(m) ? m : 0; };
  function stateOf(d, now) {   // on: a reading in the last hour. quiet: nothing for over an hour. off: nothing for over a day, or never.
    const m = seenMs(d);
    if (d.online !== false && m && now - m <= HOUR) return 'on';
    return m && now - m <= DAY ? 'quiet' : 'off';
  }
  const LBL = { road: T('Moving', 'Σε κίνηση'), park: T('Stopped', 'Σταματημένο'), live: T('Reporting', 'Αναφέρει'), quiet: T('Quiet over 1 h', 'Σιωπηλό πάνω από 1 ώρα'), off: T('Offline', 'Εκτός λειτουργίας') };
  const BADGE = { road: 'ok', park: 'info', live: 'info', quiet: 'warn', off: 'bad' };
  const COL = { road: '#59d98e', park: '#6ea0f0', live: '#4CCBEA', quiet: '#F0B94A', off: '#FF7A6A' };
  const ORD = { road: 0, park: 1, live: 2, quiet: 3, off: 4 };

  /* ---------- readings: names and units come from /api/config ---------- */
  const READ = [
    { k: 'temp', en: 'Temperature', el: 'Θερμοκρασία', sen: 'Temp', sel: 'Θερμ.', ids: ['4097'], re: /temp/i, not: /soil|water|ground|dew|surface|probe|internal|core|wet/i, unit: '°C', dec: 1, color: '#E07F3F' },
    { k: 'pm25', en: 'PM2.5', el: 'PM2.5', ids: [], re: /pm\s*2[._]?5/i, unit: 'µg/m³', dec: 1, color: '#4C8BEA' },
    { k: 'noise', en: 'Noise', el: 'Θόρυβος', ids: [], re: /noise|sound|decibel/i, unit: 'dB', dec: 0, color: '#8f7bff' },
    { k: 'hum', en: 'Humidity', el: 'Υγρασία', ids: ['4098'], re: /humid/i, not: /soil|leaf|moisture/i, unit: '%', dec: 0, color: '#4CCBEA' },
    { k: 'co2', en: 'CO2', el: 'CO2', ids: ['4100'], re: /\bco2\b|carbon dioxide/i, unit: 'ppm', dec: 0, color: '#59d98e' },
    { k: 'light', en: 'Light', el: 'Φως', ids: ['4099'], re: /light|lux|illumin/i, unit: 'lx', dec: 0, color: '#F2B24C' },
    { k: 'press', en: 'Pressure', el: 'Πίεση', sen: 'Press.', sel: 'Πίεση', ids: ['4101'], re: /pressure|baro/i, unit: 'hPa', dec: 1, color: '#b7a6d2' },
  ];
  const UNIT = { '%rh': '%', celcius: '°C', celsius: '°C', 'ug/m3': 'µg/m³', 'μg/m3': 'µg/m³', 'µg/m3': 'µg/m³', lux: 'lx' };
  const PALETTE = ['#4C8BEA', '#E07F3F', '#59d98e', '#8f7bff', '#F2B24C', '#4CCBEA'];

  /* ---------- tiny helpers ---------- */
  async function pool(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } }));
    return out;
  }
  const settle = async (p) => { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, e }; } };
  const loadingBox = () => el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'));
  const arrow = () => ico('arrow', 16);

  // mean of the readings in each time slot: [{ t, v }] from [{ t, v }]
  function bucket(rows, width) {
    const m = new Map();
    rows.forEach((p) => { const k = Math.floor(p.t / width), e = m.get(k) || [0, 0]; e[0] += p.v; e[1]++; m.set(k, e); });
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, e]) => ({ t: k * width + width / 2, v: e[0] / e[1] }));
  }
  const toRows = (rows, scale) => (Array.isArray(rows) ? rows : []).map((p) => ({ t: Date.parse(p.t), v: Number(p.v) * (scale || 1) })).filter((p) => fin(p.t) && fin(p.v));

  // sparkline with gaps (null) like the mockup
  function spark(vals, color) {
    const W = 82, H = 26, pad = 3, n = vals.length, fv = vals.filter((x) => x != null);
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    if (!fv.length) return svg;
    let mn = Math.min(...fv), mx = Math.max(...fv); const rg = Math.max(mx - mn, 1e-6); mn -= rg * 0.15; mx += rg * 0.15;
    const X = (i) => pad + (W - pad * 2) * i / Math.max(1, n - 1), Y = (v) => H - 3 - (H - 8) * (v - mn) / (mx - mn);
    const segs = [[]];
    vals.forEach((v, i) => { if (v == null) { if (segs[segs.length - 1].length) segs.push([]); } else segs[segs.length - 1].push([X(i), Y(v)]); });
    const real = segs.filter((s) => s.length);
    real.forEach((sg) => {
      if (sg.length === 1) { svg.append(sv('circle', { cx: sg[0][0].toFixed(1), cy: sg[0][1].toFixed(1), r: 1.6, fill: color })); return; }
      const d = sg.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
      svg.append(sv('path', { d: d + 'L' + sg[sg.length - 1][0].toFixed(1) + ' ' + H + 'L' + sg[0][0].toFixed(1) + ' ' + H + 'Z', fill: color, 'fill-opacity': 0.16 }),
        sv('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    });
    const ls = real[real.length - 1], lp = ls[ls.length - 1];
    if (vals[n - 1] == null) svg.append(sv('path', { d: 'M' + (lp[0] + 4).toFixed(1) + ' ' + lp[1].toFixed(1) + 'H' + (W - pad), stroke: color, 'stroke-opacity': 0.35, 'stroke-dasharray': '2 3', fill: 'none' }));
    svg.append(sv('circle', { cx: lp[0].toFixed(1), cy: lp[1].toFixed(1), r: 4, fill: color, 'fill-opacity': 0.25 }), sv('circle', { cx: lp[0].toFixed(1), cy: lp[1].toFixed(1), r: 2.2, fill: color, stroke: '#0b1b30', 'stroke-width': 1 }));
    return svg;
  }
  const hourly = (rows, now) => {   // 24 hourly means ending now, null where nothing was read
    const t0 = Math.floor(now / HOUR) * HOUR - 23 * HOUR, b = new Array(24).fill(null).map(() => [0, 0]);
    rows.forEach((p) => { const i = Math.floor((p.t - t0) / HOUR); if (i >= 0 && i < 24) { b[i][0] += p.v; b[i][1]++; } });
    return b.map((e) => (e[1] ? e[0] / e[1] : null));
  };
  function ringSvg(n, total, color) {
    const C = 2 * Math.PI * 26, d = total ? C * n / total : 0;
    return sv('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true' },
      sv('circle', { cx: 32, cy: 32, r: 26, fill: 'none', stroke: 'rgba(255,255,255,.1)', 'stroke-width': 6 }),
      sv('circle', { cx: 32, cy: 32, r: 26, fill: 'none', stroke: color, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-dasharray': d.toFixed(1) + ' ' + C.toFixed(1), style: 'filter:drop-shadow(0 0 5px ' + color + ')' }));
  }
  const orb = (st, kind, big) => el('span', { class: 'vh-orb ' + (st === 'live' ? 'live-s' : st) + (st === 'road' ? ' live' : ''), 'aria-hidden': 'true' }, ico(kind === 'car' ? 'car' : 'bus'));

  /* ---------- trips from the public trails (delayed and rounded, so rough) ---------- */
  const snap = (v) => Math.round(v / 0.01) * 0.01;
  function cleanTrail(trail) {   // [[t, lat, lng, value]] -> rounded to the public grid, neighbouring duplicates removed
    const pts = []; let last = '';
    for (const p of trail || []) {
      if (!Array.isArray(p) || !fin(p[0]) || !fin(p[1]) || !fin(p[2])) continue;
      const la = snap(p[1]), lo = snap(p[2]), key = la.toFixed(2) + ',' + lo.toFixed(2);
      if (key === last) continue;
      last = key; pts.push([p[0], la, lo, fin(p[3]) ? p[3] : null]);
    }
    return pts;
  }
  function tripsOf(trail) {
    const pts = cleanTrail(trail), out = []; let cur = [];
    const flush = () => {
      if (cur.length >= 3) {
        let k = 0; for (let i = 1; i < cur.length; i++) k += km(cur[i - 1][1], cur[i - 1][2], cur[i][1], cur[i][2]);
        // a run of positions that never pauses for 6 hours is not one trip (a vehicle that parks leaves gaps in the public positions)
        if (k >= 2 && cur[cur.length - 1][0] - cur[0][0] <= 6 * HOUR) out.push({ t0: cur[0][0], t1: cur[cur.length - 1][0], km: k, vals: cur.map((p) => p[3]).filter(fin), a: cur[0], b: cur[cur.length - 1] });
      }
      cur = [];
    };
    pts.forEach((p) => { if (cur.length && p[0] - cur[cur.length - 1][0] > 30 * 60000) flush(); cur.push(p); });
    flush();
    return out;
  }
  const tripKm = (k) => (k < 10 ? Math.round(k) : Math.round(k / 5) * 5);
  const span = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 90 ? T(m + ' min', m + ' λεπτά') : T(Math.round(m / 6) / 10 + ' h', Math.round(m / 6) / 10 + ' ώρες'); };

  /* =============================================================================================================== */
  /* One model for both views: the data, and what it means.                                                           */
  function core() {
    const R = {};
    const val = (k) => (R[k] && R[k].ok ? R[k].v : null);
    const cfg = () => val('cfg') || { names: {}, gps: ['4198', '4197'] };
    const gpsIds = () => (cfg().gps || ['4198', '4197']).map(String);
    const devices = () => (Array.isArray(val('devices')) ? val('devices') : []);
    const latest = () => val('latest') || {};
    const exact = () => !!cfg().exactPositions;
    const delayMin = () => (exact() ? 0 : fin(cfg().posDelayMin) ? cfg().posDelayMin : val('trails') && fin(val('trails').delayMinutes) ? val('trails').delayMinutes : 120);
    const hasGps = (d) => (d.measurements || []).some((m) => gpsIds().includes(String(m)));
    const isVehicle = (d) => !FIXED.test(d.name || '') && (VEH.test(d.name || '') || hasGps(d));

    function meta(mid) {
      mid = String(mid);
      const nm = cfg().names && cfg().names[mid], name = nm ? String(nm[0]) : '', u0 = nm && nm[1] ? String(nm[1]) : '';
      const c = READ.find((r) => name && r.re.test(name) && !(r.not && r.not.test(name))) || READ.find((r) => r.ids.includes(mid) && !(name && r.not && r.not.test(name)));
      let unit = UNIT[u0.toLowerCase()] || u0 || (c ? c.unit : ''), scale = 1;
      if (unit.toLowerCase() === 'pa') { unit = 'hPa'; scale = 0.01; }
      const m = c ? { mid, k: c.k, en: c.en, el: c.el, sen: c.sen, sel: c.sel, color: c.color, dec: c.dec, order: READ.indexOf(c) }
        : { mid, k: 'm' + mid, en: name || 'Reading ' + mid, el: name || 'Μέτρηση ' + mid, color: PALETTE[Number(mid) % PALETTE.length] || PALETTE[0], dec: 1, order: 99 };
      if (scale !== 1) m.dec = 1;
      m.unit = unit; m.scale = scale; m.label = T(m.en, m.el); m.short = m.sen ? T(m.sen, m.sel) : m.label;
      return m;
    }
    const readingsOf = (d) => (d.measurements || []).filter((m) => !gpsIds().includes(String(m))).map(meta).sort((a, b) => a.order - b.order || Number(a.mid) - Number(b.mid));
    function lastRead(d, m) {
      const r = latest()[d.eui] && latest()[d.eui][m.mid];
      if (!r) return null;
      const v = Number(r.v), t = Date.parse(r.t);
      return isFinite(v) && isFinite(t) ? { v: v * m.scale, t } : null;
    }
    const trailOf = (d) => cleanTrail(val('trails') && val('trails').trails && val('trails').trails[d.eui]);
    function motion(d, now) {   // 'move' | 'still' | null (no public position to tell from)
      const pts = trailOf(d), ref = now - delayMin() * 60000;
      const upTo = pts.filter((p) => p[0] <= ref + 60000);
      if (!upTo.length) return null;
      if (ref - upTo[upTo.length - 1][0] > 45 * 60000) return 'still';
      const win = upTo.filter((p) => p[0] >= ref - 45 * 60000);
      if (win.length < 3) return 'still';
      const la = win.map((p) => p[1]), lo = win.map((p) => p[2]);
      const dLat = (Math.max(...la) - Math.min(...la)) * 111, dLng = (Math.max(...lo) - Math.min(...lo)) * 111 * Math.cos(rad(la[0]));
      return Math.hypot(dLat, dLng) >= 2 ? 'move' : 'still';
    }
    function vehicles(now) {
      return devices().filter(isVehicle).map((d) => {
        const s = stateOf(d, now);
        const mo = s === 'on' ? motion(d, now) : null;
        const st = s === 'on' ? (mo === 'move' ? 'road' : mo === 'still' ? 'park' : 'live') : s;
        return { d, st, kind: kindOf(d), school: schoolOf(d), seen: seenMs(d), gps: hasGps(d) };
      }).sort((a, b) => ORD[a.st] - ORD[b.st] || String(a.d.name).localeCompare(String(b.d.name), undefined, { numeric: true }));
    }
    function where(v) {
      const d = v.d, now = Date.now(), h = Math.max(1, Math.round(delayMin() / 60));
      if (!fin(d.lat) || !fin(d.lng)) {
        return { main: T('No public position yet', 'Δεν υπάρχει ακόμα δημόσια θέση'), sub: exact() ? T('This vehicle has sent no position.', 'Το όχημα δεν έχει στείλει θέση.') : T('A position becomes public ' + h + ' h after it is recorded.', 'Μια θέση γίνεται δημόσια ' + h + ' ώρες αφού καταγραφεί.') };
      }
      const desc = describe(d.lat, d.lng, v.st === 'park');
      const quiet = v.st === 'quiet' || v.st === 'off';
      const main = quiet ? T('Last seen ' + desc.en, 'Τελευταία θέση: ' + desc.el) : T(cap(desc.en), cap(desc.el));
      let sub;
      if (quiet) sub = v.seen ? T('Last signal ' + when(v.seen) + ' · ' + SC.ago(v.seen), 'Τελευταίο σήμα ' + when(v.seen) + ' · ' + SC.ago(v.seen)) : T('Never reported', 'Δεν έχει στείλει ποτέ');
      else if (exact()) sub = T('Exact position (teacher view)', 'Ακριβής θέση (προβολή εκπαιδευτικού)');
      else if (d.posAt) sub = T('Public position from ' + SC.time(d.posAt) + ', ' + SC.ago(d.posAt) + ' · rounded to 1 km', 'Δημόσια θέση από ' + SC.time(d.posAt) + ', ' + SC.ago(d.posAt) + ' · στρογγυλοποιημένη στο 1 χλμ.');
      else sub = T('Position is delayed and rounded to 1 km', 'Η θέση έχει καθυστέρηση και στρογγυλοποίηση στο 1 χλμ.');
      void now;
      return { main, sub };
    }
    async function load() {
      const [cfgR, devR, latR, trR] = await Promise.all([
        settle(SC.cached('/api/config', 300000)), settle(SC.cached('/api/devices', 20000)), settle(SC.cached('/api/latest', 20000)),
        settle(SC.cached('/api/trails?hours=24&mid=4097', 120000))]);
      R.cfg = cfgR; R.devices = devR; R.latest = latR; R.trails = trR;
    }
    return { R, val, cfg, devices, latest, exact, delayMin, hasGps, isVehicle, meta, readingsOf, lastRead, trailOf, motion, vehicles, where, load };
  }

  // the freshness pill, the demo tag and the privacy note, shared by both views
  function chrome(c, head) {
    const pill = head.querySelector('.fresh-pill'), pageHead = head.querySelector('.page-head'), lede = head.querySelector('.lede');
    return {
      fresh(vs, hide) {
        const now = Date.now(), last = Math.max(0, ...vs.map((v) => v.seen));
        pill.style.display = hide ? 'none' : '';
        pill.className = 'fresh-pill';
        if (!c.R.devices || !c.R.devices.ok) { pill.className = 'fresh-pill none'; pill.lastChild.textContent = T('Sensors unavailable', 'Οι αισθητήρες δεν είναι διαθέσιμοι'); return; }
        if (!last) { pill.className = 'fresh-pill none'; pill.lastChild.textContent = T('No readings yet', 'Καμία μέτρηση ακόμα'); }
        else if (now - last > HOUR) { pill.className = 'fresh-pill stale'; pill.lastChild.textContent = T('Last reading ' + SC.ago(last), 'Τελευταία μέτρηση ' + SC.ago(last)); }
        else pill.lastChild.textContent = T('Live · ' + SC.ago(last), 'Ζωντανά · ' + SC.ago(last));
        const demo = c.val('cfg') && c.val('cfg').demo, has = pageHead.querySelector('.t.demo');
        if (demo && !has) pageHead.insertBefore(el('span', { class: 't demo' }, T('Demo data', 'Δεδομένα επίδειξης')), lede);
        if (!demo && has) has.remove();
      },
      lede(text) { lede.textContent = text; },
    };
  }
  function privacyNote(c) {
    const h = Math.max(1, Math.round(c.delayMin() / 60));
    return c.exact()
      ? el('div', { class: 'vh-note' }, ico('shield'), el('div', null, el('b', null, T('You are signed in as a teacher, so positions are exact.', 'Έχετε συνδεθεί ως εκπαιδευτικός, οπότε οι θέσεις είναι ακριβείς.')), ' ', T('Visitors see them about ' + h + ' h late and rounded to 1 km.', 'Οι επισκέπτες τις βλέπουν με καθυστέρηση περίπου ' + h + ' ωρών και στρογγυλοποιημένες στο 1 χλμ.')))
      : el('div', { class: 'vh-note' }, ico('shield'), el('div', null, el('b', null, T('Positions are about ' + h + ' hours late and rounded to 1 km.', 'Οι θέσεις έχουν καθυστέρηση περίπου ' + h + ' ωρών και στρογγυλοποίηση στο 1 χλμ.')), ' ', T('This protects the students on board. Teachers see exact positions after sign-in.', 'Αυτό προστατεύει τους μαθητές που επιβαίνουν. Οι εκπαιδευτικοί βλέπουν ακριβείς θέσεις μετά τη σύνδεση.')));
  }
  const errBox = (msg, retry) => el('div', { class: 'vh-err' }, el('div', { class: 'err', role: 'alert' }, msg), el('button', { class: 'nm-btn', type: 'button', onclick: retry }, T('Try again', 'Δοκιμάστε ξανά')));
  const eMsg = (r) => (r && r.e && r.e.message ? ' ' + r.e.message : '');

  const tripRows = (c, trips, withVehicle) => trips.map((tr) => {
    const v = tr.v, a = nearestTown(tr.a[1], tr.a[2]), b = nearestTown(tr.b[1], tr.b[2]);
    const href = v ? '#/vehicles/' + enc(v.d.eui) : null;
    const mt = tr.vals.length ? mean(tr.vals) : null;
    return el('tr', { onclick: href ? (e) => { if (!e.target.closest('a')) location.hash = href; } : null },
      withVehicle ? el('td', null, el('a', { class: 'vh-veh', href, style: '--o:' + COL[v.st] }, el('i'), v.d.name)) : null,
      withVehicle ? el('td', { class: 'mut hs' }, v.school ? v.school.n : v.d.group || '') : null,
      el('td', { class: 'tm' }, when(tr.t0)),
      el('td', { class: 'num tm' }, T('about ', 'περίπου '), String(tripKm(tr.km)), el('u', null, ' ' + T('km', 'χλμ.'))),
      el('td', { class: 'num tm' }, span(tr.t1 - tr.t0)),
      el('td', { class: 'num tm' }, mt == null ? '–' : fmt(mt, 1), mt == null ? null : el('u', null, '°C')),
      el('td', { class: 'mut' }, a && b && a !== b ? a + ' → ' + b : T('around ' + (a || '?'), 'γύρω από ' + (a || '?'))),
      withVehicle ? el('td', null, el('span', { class: 'nm-badge nm-badge--' + BADGE[v.st] }, LBL[v.st])) : null,
      withVehicle ? el('td', { class: 'go' }, ico('chev')) : null);
  });
  const tripsFine = T('Worked out in your browser from the delayed, rounded public positions, so they are rough: a trip is a run of positions less than 30 minutes apart that covers at least 2 km and lasts under 6 hours, distances are to the nearest 5 km above 10 km, and the start is the first position that changed.',
    'Υπολογίζονται στον περιηγητή σας από τις καθυστερημένες, στρογγυλοποιημένες δημόσιες θέσεις, άρα είναι χονδρικές: μια διαδρομή είναι μια σειρά θέσεων με διαφορά μικρότερη των 30 λεπτών που καλύπτει τουλάχιστον 2 χλμ. και διαρκεί λιγότερο από 6 ώρες, οι αποστάσεις στρογγυλοποιούνται στα 5 χλμ. πάνω από 10 χλμ. και η αρχή είναι η πρώτη θέση που άλλαξε.');
  const tripsHead = (withVehicle) => el('tr', null,
    withVehicle ? el('th', null, T('Vehicle', 'Όχημα')) : null, withVehicle ? el('th', { class: 'hs' }, T('School', 'Σχολείο')) : null,
    el('th', null, T('Started', 'Έναρξη')), el('th', { class: 'num' }, T('Distance', 'Απόσταση')), el('th', { class: 'num' }, T('Time', 'Διάρκεια')), el('th', { class: 'num' }, T('Mean temp.', 'Μέση θερμ.')),
    el('th', null, T('Nearest towns', 'Κοντινότερες πόλεις')), withVehicle ? el('th', null, T('Now', 'Τώρα')) : null, withVehicle ? el('th', { class: 'go', 'aria-label': T('Open', 'Άνοιγμα') }) : null);

  /* =============================================================================================================== */
  function renderList(root, ctx) {
    const c = core();
    let alive = true, busy = false, filter = 'all', sparkAt = 0, rz = 0;
    const timers = [], sparks = {};   // sparks['eui|mid'] = 24 hourly values
    const head = SC.head({
      title: T('Vehicles', 'Οχήματα'),
      lede: T('Buses and cars that carry a sensor. Readings are live; positions are delayed and rounded.', 'Λεωφορεία και αυτοκίνητα που φέρουν αισθητήρα. Οι μετρήσεις είναι ζωντανές· οι θέσεις έχουν καθυστέρηση και στρογγυλοποίηση.'),
      fresh: T('Checking…', 'Έλεγχος…'),
      help: ['The Vehicles page lists the buses and cars that carry a sensor. Each card shows the vehicle’s state, where it was last seen in words, its latest readings with a 24-hour sparkline each, its battery and when it last sent a reading. Moving or stopped is worked out from the public positions, which are published about 2 hours late and rounded to about 1 km to protect the students on board, so it describes where the vehicle was then, not now. Quiet means nothing for over an hour, offline nothing for over a day. Open a vehicle to see a history chart for each reading and to download its readings as a CSV file. Teachers who sign in see exact positions.',
        'Η σελίδα Οχήματα εμφανίζει τα λεωφορεία και τα αυτοκίνητα που φέρουν αισθητήρα. Κάθε κάρτα δείχνει την κατάσταση του οχήματος, πού εθεάθη τελευταία με λόγια, τις τελευταίες μετρήσεις με ένα γράφημα 24 ωρών η καθεμία, την μπαταρία και πότε έστειλε τελευταία μέτρηση. Το αν κινείται ή είναι σταματημένο προκύπτει από τις δημόσιες θέσεις, που δημοσιεύονται με καθυστέρηση περίπου 2 ωρών και στρογγυλοποίηση περίπου 1 χλμ. για την προστασία των μαθητών, άρα περιγράφει πού ήταν το όχημα τότε και όχι τώρα. Σιωπηλό σημαίνει τίποτα για πάνω από μία ώρα, εκτός λειτουργίας τίποτα για πάνω από μία ημέρα. Ανοίξτε ένα όχημα για να δείτε γράφημα ιστορικού για κάθε μέτρηση και να κατεβάσετε τις μετρήσεις του σε αρχείο CSV. Οι εκπαιδευτικοί που συνδέονται βλέπουν ακριβείς θέσεις.'],
    });
    const ch = chrome(c, head);
    const cmd = el('div', { class: 'vh-cmd' }, el('span', { class: 'grow' }),
      ctx && SC.ready.has('map') ? el('a', { class: 'nm-btn vh-ghost', href: '#/map' }, ico('map'), T('Open the live map', 'Άνοιγμα ζωντανού χάρτη')) : null);
    const noteBox = el('div'), tilesBox = el('div', { class: 'vh-tiles' }, loadingBox());
    const secH = el('div', { class: 'vh-sech' });
    const gridBox = el('div', { class: 'vh-grid' });
    const tripsBody = el('div');
    const tripsCard = el('section', { class: 'nm-card vh-trips', 'aria-label': T('Trips in the last 24 hours', 'Διαδρομές τις τελευταίες 24 ώρες') }, tripsBody);
    root.append(head, cmd, noteBox, tilesBox, secH, gridBox, tripsCard);
    const retry = () => refresh(true);

    function tile(cls, st, kind, label, n, total, sub) {
      return el('div', { class: 'nm-card nm-card--glow vh-tile' + (cls || '') },
        el('span', { class: 'vh-orb ' + (st === 'live' ? 'live-s' : st) + (st === 'road' ? ' live' : ''), 'aria-hidden': 'true' }, ico(kind)),
        el('div', { class: 'tx' }, el('span', { class: 'kpi-label' }, label), el('span', { class: 'kpi-num' }, String(n)), el('span', { class: 'sub' }, sub)),
        el('div', { class: 'vh-ringn', role: 'img', 'aria-label': n + ' / ' + total }, ringSvg(n, total, COL[st]), el('span', null, n + '/' + total)));
    }
    const kinds = (list) => {
      const b = list.filter((v) => v.kind === 'bus').length, r = list.filter((v) => v.kind === 'car').length, o = list.length - b - r, p = [];
      if (b) p.push(T(b + (b === 1 ? ' bus' : ' buses'), b + (b === 1 ? ' λεωφορείο' : ' λεωφορεία')));
      if (r) p.push(T(r + (r === 1 ? ' car' : ' cars'), r + (r === 1 ? ' αυτοκίνητο' : ' αυτοκίνητα')));
      if (o) p.push(T(o + ' other', o + ' άλλα'));
      return p.join(T(' and ', ' και '));
    };

    function paintTiles(vs) {
      const now = Date.now(), h = Math.max(1, Math.round(c.delayMin() / 60)), ago = c.exact() ? T('now', 'τώρα') : T('about ' + h + ' h ago', 'πριν από περίπου ' + h + ' ώρες');
      const road = vs.filter((v) => v.st === 'road'), park = vs.filter((v) => v.st === 'park'), live = vs.filter((v) => v.st === 'live'), q = vs.filter((v) => v.st === 'quiet' || v.st === 'off');
      const sub1 = road.length ? kinds(road) + ' · ' + T('moving ' + ago, 'σε κίνηση ' + ago) : T('None was moving ' + ago + ' at its public position.', 'Κανένα δεν κινούνταν ' + ago + ' στη δημόσια θέση του.');
      const sub2 = (park.length ? kinds(park) + ' · ' + T('stopped ' + ago, 'σταματημένα ' + ago) : T('None was stopped ' + ago + '.', 'Κανένα δεν ήταν σταματημένο ' + ago + '.'))
        + (live.length ? ' ' + T('+' + live.length + ' with no public position yet.', '+' + live.length + ' χωρίς ακόμα δημόσια θέση.') : '');
      const oldest = q.slice().sort((a, b) => a.seen - b.seen)[0];
      const sub3 = !q.length ? T('Every vehicle sensor reported in the last hour.', 'Όλοι οι αισθητήρες οχημάτων έστειλαν μέτρηση την τελευταία ώρα.')
        : (q.length > 1 ? T(oldest.d.name + ' and ' + (q.length - 1) + ' more', oldest.d.name + ' και ' + (q.length - 1) + ' ακόμα') : oldest.d.name) + ', ' + (oldest.seen ? T('no reading since ' + when(oldest.seen), 'καμία μέτρηση από ' + when(oldest.seen)) : T('never reported', 'δεν έχει στείλει ποτέ'));
      void now;
      fill(tilesBox, tile('', 'road', 'bus', T('Moving', 'Σε κίνηση'), road.length, vs.length, sub1), tile('', 'park', 'pin', T('Stopped', 'Σταματημένα'), park.length, vs.length, sub2),
        tile(' q', 'quiet', 'sensor', T('Quiet over 1 h', 'Σιωπηλά πάνω από 1 ώρα'), q.length, vs.length, sub3));
    }

    function readTile(v, m) {
      const r = c.lastRead(v.d, m), old = !r || Date.now() - r.t > FRESH;
      const slot = el('div', { class: 'sp' });
      const key = v.d.eui + '|' + m.mid;
      if (sparks[key]) slot.append(spark(sparks[key], m.color));
      return { node: el('div', { class: 'vh-rd' + (old ? ' old' : ''), title: r ? T('Last reading ' + SC.ago(r.t), 'Τελευταία μέτρηση ' + SC.ago(r.t)) : null },
        el('span', { class: 'kpi-label', title: m.label }, m.short), el('div', { class: 'v' }, el('b', null, r ? fmt(r.v, m.dec) : '–'), el('u', null, m.unit)), slot,
        old && r ? el('span', { class: 'age' }, SC.ago(r.t)) : null), slot, key, m };
    }

    function card(v, pending) {
      const d = v.d, w = c.where(v), reads = c.readingsOf(d), show = reads.slice(0, 3);
      const tiles = show.map((m) => readTile(v, m));
      tiles.forEach((t) => { if (!sparks[t.key]) pending.push(t); });
      const bat = fin(d.battery) ? Math.max(0, Math.min(100, Math.round(d.battery))) : null;
      return el('article', { class: 'nm-card nm-card--glow nm-lift vh-card is-' + v.st },
        el('div', { class: 'vh-top' }, orb(v.st, v.kind), el('div', { class: 'vh-id' },
          el('div', { class: 'r1' }, el('h3', null, el('a', { href: '#/vehicles/' + enc(d.eui) }, d.name)), el('span', { class: 'nm-badge nm-badge--' + BADGE[v.st] }, LBL[v.st])),
          el('p', null, v.school ? v.school.n : d.group || ''))),
        el('div', { class: 'vh-loc' }, ico('pin'), el('div', null, el('b', null, w.main), el('small', null, w.sub))),
        show.length ? el('div', { class: 'vh-reads' + (show.length === 2 ? ' two' : show.length === 1 ? ' one' : '') }, tiles.map((t) => t.node))
          : el('div', { class: 'empty' }, T('This sensor reports no readings yet.', 'Ο αισθητήρας δεν στέλνει ακόμα μετρήσεις.')),
        reads.length > 3 ? el('p', { class: 'vh-more' }, T('+ ' + (reads.length - 3) + ' more readings on the vehicle page', '+ ' + (reads.length - 3) + ' ακόμα μετρήσεις στη σελίδα του οχήματος')) : null,
        el('div', { class: 'vh-foot' },
          el('div', { class: 'vh-meta' },
            bat != null ? el('span', { title: T('Battery', 'Μπαταρία') }, el('i', { class: 'vh-bat', style: '--p:' + bat + '%;--c:' + (bat < 20 ? '#FF7A6A' : bat < 50 ? '#F0B94A' : '#59d98e') }, el('i')), bat + ' %') : null,
            el('span', null, v.seen ? T('Last reading ' + SC.ago(v.seen), 'Τελευταία μέτρηση ' + SC.ago(v.seen)) : T('No reading yet', 'Καμία μέτρηση ακόμα'))),
          el('div', { class: 'vh-actions' },
            el('a', { class: 'nm-btn vh-ghost', href: '#/vehicles/' + enc(d.eui), 'aria-label': T('Open ' + d.name, 'Άνοιγμα ' + d.name) }, T('Details', 'Λεπτομέρειες')),
            v.gps && SC.ready.has('map')
              ? (v.st === 'off' ? el('button', { class: 'nm-btn vh-ghost', type: 'button', disabled: 'disabled', title: T('No signal, so there is nothing to follow', 'Χωρίς σήμα, άρα δεν υπάρχει τίποτα για παρακολούθηση') }, T('Follow this trip', 'Ακολουθήστε τη διαδρομή'), arrow())
                : el('a', { class: 'nm-btn vh-ghost', href: '#/map?eui=' + enc(d.eui) }, T('Follow this trip', 'Ακολουθήστε τη διαδρομή'), arrow())) : null)));
    }

    function paintGrid(vs) {
      const counts = { all: vs.length, bus: vs.filter((v) => v.kind === 'bus').length, car: vs.filter((v) => v.kind === 'car').length, other: vs.filter((v) => v.kind === 'other').length };
      if (filter !== 'all' && !counts[filter]) filter = 'all';
      const defs = [['all', T('All', 'Όλα')], ['bus', T('Buses', 'Λεωφορεία')], ['car', T('Cars', 'Αυτοκίνητα')], ['other', T('Other', 'Άλλα')]].filter(([k]) => k === 'all' || counts[k]);
      fill(secH, el('span', { class: 'eyebrow' }, T('All vehicles · ' + vs.length, 'Όλα τα οχήματα · ' + vs.length)), el('span', { class: 'ln' }),
        defs.length > 2 ? el('div', { class: 'nm-pillbar', role: 'group', 'aria-label': T('Show', 'Εμφάνιση') }, defs.map(([k, l]) => el('button', { type: 'button', class: filter === k ? 'on' : '', 'aria-pressed': filter === k ? 'true' : 'false',
          onclick: () => { filter = k; paintGrid(vs); const on = secH.querySelector('.on'); if (on) on.focus(); } }, l + ' ' + counts[k]))) : null);
      const list = vs.filter((v) => filter === 'all' || v.kind === filter), pending = [];
      fill(gridBox, ...list.map((v) => card(v, pending)));
      loadSparks(pending);
    }

    async function loadSparks(pending) {
      if (!pending.length) return;
      const now = Date.now();
      await pool(pending, 6, async (t) => {
        const [eui, mid] = t.key.split('|');
        const rows = toRows(await SC.cached('/api/series?eui=' + enc(eui) + '&mid=' + enc(mid) + '&days=1', 300000), t.m.scale);
        if (!alive) return;
        sparks[t.key] = hourly(rows, now);
        if (t.slot.isConnected) t.fill(slot, spark(sparks[t.key], t.m.color));
      });
      sparkAt = Date.now();
    }

    function paintTrips(vs) {
      const all = [];
      vs.forEach((v) => tripsOf(v.d && c.val('trails') && c.val('trails').trails ? c.val('trails').trails[v.d.eui] : []).forEach((tr) => all.push({ ...tr, v })));
      all.sort((a, b) => b.t0 - a.t0);
      const shown = all.slice(0, 40);
      const trOk = c.R.trails && c.R.trails.ok;
      fill(tripsBody, 
        el('div', { class: 'vh-trips-h' }, el('span', { class: 'nm-icon-tile', 'aria-hidden': 'true' }, ico('route')),
          el('div', null, el('h2', null, T('Trips in the last 24 hours', 'Διαδρομές τις τελευταίες 24 ώρες')),
            el('p', null, !trOk ? T('The positions could not be loaded.', 'Δεν φορτώθηκαν οι θέσεις.') : T(all.length + (all.length === 1 ? ' trip' : ' trips') + ' found in the public positions', 'Βρέθηκαν ' + all.length + (all.length === 1 ? ' διαδρομή' : ' διαδρομές') + ' στις δημόσιες θέσεις')))),
        !trOk ? errBox(T('The vehicle positions could not be loaded, so there are no trips to list.', 'Δεν φορτώθηκαν οι θέσεις των οχημάτων, άρα δεν υπάρχουν διαδρομές για προβολή.') + eMsg(c.R.trails), retry)
          : !shown.length ? el('div', { class: 'empty' }, T('No trips found yet. Positions are published late, so a trip shows up here a couple of hours after it starts.', 'Δεν βρέθηκαν ακόμα διαδρομές. Οι θέσεις δημοσιεύονται με καθυστέρηση, οπότε μια διαδρομή εμφανίζεται εδώ λίγες ώρες μετά την έναρξή της.'))
            : el('div', { class: 'nm-table-wrap', role: 'region', tabindex: '0', 'aria-label': T('Trips table, scrolls sideways', 'Πίνακας διαδρομών, κυλίεται πλευρικά') }, el('table', { class: 'nm-table' }, el('thead', null, tripsHead(true)), el('tbody', null, tripRows(c, shown, true)))),
        shown.length ? el('p', { class: 'vh-fine' }, tripsFine) : null);
    }

    function paintAll() {
      const vs = c.vehicles(Date.now());
      ch.fresh(vs);
      fill(noteBox, c.R.devices && c.R.devices.ok ? privacyNote(c) : '');
      if (!c.R.devices) return;
      if (!c.R.devices.ok) {
        const e = errBox(T('The vehicles could not be loaded.', 'Δεν φορτώθηκαν τα οχήματα.') + eMsg(c.R.devices), retry);
        fill(tilesBox, el('div', { style: 'grid-column:1/-1' }, e)); fill(secH, ); fill(gridBox, ); tripsCard.hidden = true;
        return;
      }
      tripsCard.hidden = false;
      if (!vs.length) {
        fill(tilesBox, ); fill(secH, );
        fill(gridBox, el('div', { class: 'empty', style: 'grid-column:1/-1' }, c.devices().length
          ? T('None of the listed sensors is a bus or car with a GPS yet. When one is added, its card appears here.', 'Κανένας από τους καταχωρισμένους αισθητήρες δεν είναι λεωφορείο ή αυτοκίνητο με GPS ακόμα. Όταν προστεθεί, η κάρτα του θα εμφανιστεί εδώ.')
          : T('No sensors are listed yet. When the sensor feed is connected, the vehicles appear here.', 'Δεν έχουν καταχωριστεί ακόμα αισθητήρες. Όταν συνδεθεί η τροφοδοσία αισθητήρων, τα οχήματα θα εμφανιστούν εδώ.')));
        tripsCard.hidden = true;
        return;
      }
      ch.lede(T('Buses and cars that carry a sensor: ' + vs.length + ' in all. Readings are live; positions are about ' + Math.max(1, Math.round(c.delayMin() / 60)) + ' hours late and rounded.', 'Λεωφορεία και αυτοκίνητα που φέρουν αισθητήρα: ' + vs.length + ' συνολικά. Οι μετρήσεις είναι ζωντανές· οι θέσεις έχουν καθυστέρηση περίπου ' + Math.max(1, Math.round(c.delayMin() / 60)) + ' ωρών και στρογγυλοποίηση.'));
      paintTiles(vs); paintGrid(vs); paintTrips(vs);
    }

    async function refresh(manual) {
      if (busy || !alive) return;
      busy = true;
      try {
        if (manual) { fill(tilesBox, loadingBox()); }
        await c.load();
        if (!alive) return;
        paintAll();
      } catch (e) { console.error('vehicles refresh', e); } finally { busy = false; }
    }
    refresh(false);
    timers.push(setInterval(() => refresh(false), 60000));
    return () => { alive = false; clearTimeout(rz); timers.forEach(clearInterval); };
  }

  /* =============================================================================================================== */
  function renderDetail(root, ctx, eui) {
    const c = core();
    let alive = true, busy = false, days = 1;
    const timers = [], raw = {};   // raw['mid|days'] = [{ t, v }] (scaled), or 'error'
    const head = SC.head({
      title: T('Vehicle', 'Όχημα'),
      lede: '\u00a0',
      fresh: T('Checking…', 'Έλεγχος…'),
      help: ['This page shows one vehicle: its state, where it was last seen in words, its latest readings and a history chart for each reading over 24 hours, 7 days or 30 days. Download CSV saves the readings you see as a spreadsheet file. Positions are published about 2 hours late and rounded to about 1 km, so they are never exact for visitors. Follow one trip opens the map on this vehicle.',
        'Αυτή η σελίδα δείχνει ένα όχημα: την κατάστασή του, πού εθεάθη τελευταία με λόγια, τις τελευταίες μετρήσεις και ένα γράφημα ιστορικού για κάθε μέτρηση σε 24 ώρες, 7 ημέρες ή 30 ημέρες. Το Λήψη CSV αποθηκεύει τις μετρήσεις που βλέπετε σε αρχείο υπολογιστικού φύλλου. Οι θέσεις δημοσιεύονται με καθυστέρηση περίπου 2 ωρών και στρογγυλοποίηση περίπου 1 χλμ., άρα δεν είναι ποτέ ακριβείς για τους επισκέπτες. Το «Ακολουθήστε τη διαδρομή» ανοίγει τον χάρτη σε αυτό το όχημα.'],
    });
    const ch = chrome(c, head), h1 = head.querySelector('h1');
    const back = el('a', { class: 'vh-back', href: '#/vehicles' }, ico('arrow'), T('All vehicles', 'Όλα τα οχήματα'));
    const cmd = el('div', { class: 'vh-cmd' });
    const noteBox = el('div'), heroBox = el('div'), readsBox = el('div'), rangeBox = el('div'), chartsBox = el('div', { class: 'vh-charts' }), tripsBody = el('div');
    const tripsCard = el('section', { class: 'nm-card vh-trips', 'aria-label': T('Trips in the last 24 hours', 'Διαδρομές τις τελευταίες 24 ώρες') }, tripsBody);
    heroBox.append(loadingBox());
    root.append(back, head, cmd, noteBox, heroBox, readsBox, rangeBox, chartsBox, tripsCard);
    tripsCard.hidden = true;
    const retry = () => refresh(true);
    let me = null, csvBtn = null;

    const find = () => c.vehicles(Date.now()).find((v) => v.d.eui === eui) || null;
    const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9Ͱ-Ͽ]+/g, '-').replace(/^-+|-+$/g, '') || 'vehicle';

    async function series(m) {
      const key = m.mid + '|' + days;
      if (raw[key] && raw[key] !== 'error') return raw[key];
      const rows = toRows(await SC.cached('/api/series?eui=' + enc(eui) + '&mid=' + enc(m.mid) + '&days=' + days, 120000), m.scale);
      raw[key] = rows;
      return rows;
    }
    async function downloadCsv() {
      if (!me) return;
      const reads = c.readingsOf(me.d);
      csvBtn.disabled = true;
      try {
        const got = await Promise.all(reads.map((m) => series(m).then((r) => ({ m, r }), () => ({ m, r: [] }))));
        // same columns as the Dashboard page: device, device_eui, measurement, unit, time, value
        const rows = [['device', 'device_eui', 'measurement', 'unit', 'time', 'value']];
        got.forEach(({ m, r }) => r.forEach((p) => rows.push([me.d.name, eui, m.en, m.unit, new Date(p.t).toISOString(), p.v])));
        if (rows.length === 1) { SC.toast(T('No readings in this period to download.', 'Δεν υπάρχουν μετρήσεις σε αυτό το διάστημα για λήψη.')); return; }
        const csv = '﻿' + rows.map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = 'vehicle-' + slug(me.d.name) + '-' + days + 'd.csv';
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } finally { csvBtn.disabled = false; }
    }

    function paintHero() {
      if (!c.R.devices) return;
      if (!c.R.devices.ok) {
        fill(heroBox, errBox(T('The vehicle could not be loaded.', 'Δεν φορτώθηκε το όχημα.') + eMsg(c.R.devices), retry));
        ch.fresh([]); fill(noteBox, ); fill(cmd, ); fill(readsBox, ); fill(rangeBox, ); fill(chartsBox, ); tripsCard.hidden = true;
        return;
      }
      me = find();
      ch.fresh(me ? [me] : [], !me);
      if (!me) {
        h1.textContent = T('Vehicle not found', 'Το όχημα δεν βρέθηκε');
        fill(heroBox, el('div', { class: 'empty' }, T('There is no vehicle with this code. It may have been removed, or the link is old.', 'Δεν υπάρχει όχημα με αυτόν τον κωδικό. Ίσως αφαιρέθηκε ή ο σύνδεσμος είναι παλιός.'), ' ', el('a', { class: 'vh-link', href: '#/vehicles' }, T('See all vehicles', 'Δείτε όλα τα οχήματα'))));
        fill(noteBox, ); fill(cmd, ); fill(readsBox, ); fill(rangeBox, ); fill(chartsBox, ); tripsCard.hidden = true;
        return;
      }
      const d = me.d, w = c.where(me), bat = fin(d.battery) ? Math.max(0, Math.min(100, Math.round(d.battery))) : null;
      h1.textContent = d.name;
      ch.lede(me.school ? me.school.n : d.group || '');
      fill(noteBox, privacyNote(c));
      csvBtn = el('button', { class: 'nm-btn vh-ghost', type: 'button', onclick: downloadCsv }, ico('download'), T('Download CSV', 'Λήψη CSV'));
      fill(cmd, 
        me.gps && SC.ready.has('map') ? el('a', { class: 'nm-btn nm-btn--primary', href: '#/map?eui=' + enc(d.eui) }, ico('bolt'), T('Follow one trip', 'Ακολουθήστε μια διαδρομή')) : null,
        csvBtn, el('span', { class: 'grow' }));
      fill(heroBox, el('section', { class: 'nm-card nm-card--glow vh-hero' },
        el('div', { class: 'vh-top' }, orb(me.st, me.kind), el('div', { class: 'vh-id' }, el('div', { class: 'r1' }, el('span', { class: 'nm-badge nm-badge--' + BADGE[me.st] }, LBL[me.st])),
          el('p', null, (me.kind === 'bus' ? T('Bus', 'Λεωφορείο') : me.kind === 'car' ? T('Car', 'Αυτοκίνητο') : T('Vehicle sensor', 'Αισθητήρας οχήματος')) + (me.school ? ' · ' + me.school.n : d.group ? ' · ' + d.group : ''))),),
        el('div', { class: 'vh-loc' }, ico('pin'), el('div', null, el('b', null, w.main), el('small', null, w.sub))),
        el('div', { class: 'vh-meta' },
          bat != null ? el('span', { title: T('Battery', 'Μπαταρία') }, el('i', { class: 'vh-bat', style: '--p:' + bat + '%;--c:' + (bat < 20 ? '#FF7A6A' : bat < 50 ? '#F0B94A' : '#59d98e') }, el('i')), bat + ' %') : null,
          el('span', null, me.seen ? T('Last reading ' + SC.ago(me.seen) + ' (' + when(me.seen) + ')', 'Τελευταία μέτρηση ' + SC.ago(me.seen) + ' (' + when(me.seen) + ')') : T('No reading yet', 'Καμία μέτρηση ακόμα')))));
    }

    function paintReads() {
      if (!me) return;
      const reads = c.readingsOf(me.d);
      if (!reads.length) { fill(readsBox, el('div', { class: 'empty' }, T('This sensor reports no readings yet.', 'Ο αισθητήρας δεν στέλνει ακόμα μετρήσεις.'))); return; }
      fill(readsBox, el('div', { class: 'vh-rdgrid', 'aria-label': T('Latest readings', 'Τελευταίες μετρήσεις') }, reads.map((m) => {
        const r = c.lastRead(me.d, m), old = !r || Date.now() - r.t > FRESH;
        return el('div', { class: 'vh-rdbig' + (old ? ' old' : '') }, el('span', { class: 'kpi-label' }, m.label), el('div', { class: 'v' }, el('b', null, r ? fmt(r.v, m.dec) : '–'), el('u', null, m.unit)),
          el('span', { class: 'age' }, r ? T('Reading from ' + SC.ago(r.t), 'Μέτρηση ' + SC.ago(r.t)) : T('No reading yet', 'Καμία μέτρηση ακόμα')));
      })));
    }

    function paintRange() {
      if (!me || !c.readingsOf(me.d).length) { fill(rangeBox, ); fill(chartsBox, ); return; }
      const defs = [[1, T('24 hours', '24 ώρες')], [7, T('7 days', '7 ημέρες')], [30, T('30 days', '30 ημέρες')]];
      fill(rangeBox, el('div', { class: 'vh-rangebar' }, el('span', { class: 'eyebrow' }, T('History', 'Ιστορικό')),
        el('div', { class: 'nm-pillbar', role: 'group', 'aria-label': T('Period', 'Περίοδος') }, defs.map(([n, l]) => el('button', { type: 'button', class: days === n ? 'on' : '', 'aria-pressed': days === n ? 'true' : 'false',
          onclick: () => { days = n; paintRange(); const on = rangeBox.querySelector('.on'); if (on) on.focus(); } }, l)))));
      paintCharts();
    }

    function paintCharts() {
      const reads = c.readingsOf(me.d), my = days;
      const cards = reads.map((m) => {
        const box = el('div', { 'aria-live': 'polite' }, loadingBox());
        return { m, box, node: el('section', { class: 'nm-card vh-chart', 'aria-label': m.label }, el('h3', null, el('i', { style: '--c:' + m.color }), m.label + (m.unit ? ' (' + m.unit + ')' : '')), box) };
      });
      fill(chartsBox, ...cards.map((x) => x.node));
      cards.forEach(async ({ m, box }) => {
        const draw = async () => {
          fill(box, loadingBox());
          let rows;
          try { rows = await series(m); } catch (e) {
            if (!alive || my !== days) return;
            fill(box, errBox(T('The history could not be loaded.', 'Δεν φορτώθηκε το ιστορικό.') + (e && e.message ? ' ' + e.message : ''), draw)); return;
          }
          if (!alive || my !== days) return;
          const width = days === 1 ? 300000 : days === 7 ? 1800000 : 7200000;
          const pts = bucket(rows, width), narrow = (box.clientWidth || 600) < 420;
          const holder = el('div'), box2 = [holder];
          if (!rows.length) { fill(box, el('div', { class: 'empty' }, T('This vehicle sent no ' + m.en.toLowerCase() + ' readings in this period.', 'Το όχημα δεν έστειλε μετρήσεις (' + m.el.toLowerCase() + ') σε αυτό το διάστημα.'))); return; }
          fill(box, ...box2, el('p', { class: 'vh-cnote' }, T(rows.length + ' readings; each point is the mean of a ' + (days === 1 ? '5-minute' : days === 7 ? '30-minute' : '2-hour') + ' slot. A gap means the sensor sent nothing.', rows.length + ' μετρήσεις· κάθε σημείο είναι ο μέσος όρος διαστήματος ' + (days === 1 ? '5 λεπτών' : days === 7 ? '30 λεπτών' : '2 ωρών') + '. Ένα κενό σημαίνει ότι ο αισθητήρας δεν έστειλε τίποτα.')));
          SCChart.line(holder, [{ name: m.label, color: m.color, pts, area: true }], { unit: m.unit, dec: m.dec, w: narrow ? Math.max(280, Math.round(box.clientWidth || 300)) : 560, h: 230, gap: days === 1 ? 5400000 : days === 7 ? 4 * HOUR : 12 * HOUR, label: m.label + ', ' + (days === 1 ? T('last 24 hours', 'τελευταίες 24 ώρες') : days === 7 ? T('last 7 days', 'τελευταίες 7 ημέρες') : T('last 30 days', 'τελευταίες 30 ημέρες')), latest: T('Latest ', 'Τελευταία '), empty: T('Not enough readings for this period yet.', 'Δεν υπάρχουν ακόμα αρκετές μετρήσεις.') });
        };
        draw();
      });
    }

    function paintTrips() {
      if (!me || !c.R.trails || !c.R.trails.ok || !me.gps) { tripsCard.hidden = true; return; }
      const trips = tripsOf(c.val('trails').trails && c.val('trails').trails[eui] || []).map((t) => ({ ...t, v: me })).sort((a, b) => b.t0 - a.t0);
      tripsCard.hidden = false;
      fill(tripsBody, 
        el('div', { class: 'vh-trips-h' }, el('span', { class: 'nm-icon-tile', 'aria-hidden': 'true' }, ico('route')),
          el('div', null, el('h2', null, T('Trips in the last 24 hours', 'Διαδρομές τις τελευταίες 24 ώρες')), el('p', null, T(trips.length + (trips.length === 1 ? ' trip' : ' trips') + ' found in the public positions', 'Βρέθηκαν ' + trips.length + (trips.length === 1 ? ' διαδρομή' : ' διαδρομές') + ' στις δημόσιες θέσεις')))),
        trips.length ? el('div', { class: 'nm-table-wrap', role: 'region', tabindex: '0', 'aria-label': T('Trips table, scrolls sideways', 'Πίνακας διαδρομών, κυλίεται πλευρικά') }, el('table', { class: 'nm-table' }, el('thead', null, tripsHead(false)), el('tbody', null, tripRows(c, trips, false))))
          : el('div', { class: 'empty' }, T('No trips found yet. Positions are published late, so a trip shows up here a couple of hours after it starts.', 'Δεν βρέθηκαν ακόμα διαδρομές. Οι θέσεις δημοσιεύονται με καθυστέρηση, οπότε μια διαδρομή εμφανίζεται εδώ λίγες ώρες μετά την έναρξή της.')),
        trips.length ? el('p', { class: 'vh-fine' }, tripsFine) : null);
    }

    let first = true;
    async function refresh(manual) {
      if (busy || !alive) return;
      busy = true;
      try {
        if (manual) fill(heroBox, loadingBox());
        await c.load();
        if (!alive) return;
        paintHero();
        if (me) {
          paintReads(); paintTrips();
          if (first || manual) { first = false; paintRange(); }
        }
      } catch (e) { console.error('vehicle refresh', e); } finally { busy = false; }
    }
    refresh(false);
    timers.push(setInterval(() => refresh(false), 60000));
    return () => { alive = false; timers.forEach(clearInterval); };
  }

  SC.register('vehicles', {
    title: ['Vehicles', 'Οχήματα'],
    render(root, ctx) {
      const eui = ctx && ctx.args && ctx.args[0] ? decodeURIComponent(ctx.args[0]) : null;
      return eui ? renderDetail(root, ctx, eui) : renderList(root, ctx);
    },
  });
})();
