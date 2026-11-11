/*
  City board: the whole project at a glance, from real data only.
    - island with one column per school; the column shows the chosen reading (Temperature, Humidity, CO2, PM2.5, Noise:
      whichever the sensors really report), averaged over that school's sensors that reported in the last 3 hours
    - sensors online ring with real counts (online / quiet over an hour / offline, vehicle / fixed / name does not say)
    - tiles: Met Office warnings, island temperature (all Met Office stations), air quality, vehicles reporting
    - last 24 hours: the schools' temperature next to the Met Office stations nearest the schools
    - ticker: only real events (a change on the Met Office warnings page, sensors that went quiet)
  Sources: /api/config /api/devices /api/latest /api/series /api/trails /api/cydom /api/cydom/history /api/air /api/opensensors
  /api/dom/page?name=warnings /api/dom/pages/history?name=warnings. Refreshes every 60 s.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  const sv = (tag, attrs, ...kids) => SC.svgEl(tag, attrs, ...kids.flat(Infinity));
  SC.css('/site/pages/board.css');

  const HOUR = 3600000, DAY = 86400000, FRESH = 3 * HOUR;

  /* ---------- readings: which measurement is which (by the names in /api/config, then by the well-known ids) ---------- */
  const CATS = [
    { id: 'temp', en: 'Temperature', el: 'Θερμοκρασία', ids: ['4097'], re: /temp/i, not: /soil|water|ground|dew|surface|probe|internal|core|wet/i, unit: '°C', dec: 1, lo: 10, hi: 40 },
    { id: 'hum', en: 'Humidity', el: 'Υγρασία', ids: ['4098'], re: /humid/i, not: /soil|leaf|moisture/i, unit: '%', dec: 0, lo: 0, hi: 100 },
    { id: 'co2', en: 'CO2', el: 'CO2', ids: ['4100'], re: /\bco2\b|carbon dioxide/i, unit: 'ppm', dec: 0, lo: 400, hi: 2000 },
    { id: 'pm25', en: 'PM2.5', el: 'PM2.5', ids: [], re: /pm\s*2[._]?5/i, unit: 'µg/m³', dec: 1, lo: 0, hi: 50 },
    { id: 'noise', en: 'Noise', el: 'Θόρυβος', ids: [], re: /noise|sound|decibel/i, unit: 'dB', dec: 0, lo: 30, hi: 90 },
  ];
  const cat = (id) => CATS.find((c) => c.id === id);
  const UNIT = { '%rh': '%', celcius: '°C', celsius: '°C', 'ug/m3': 'µg/m³', 'μg/m3': 'µg/m³', 'µg/m3': 'µg/m³' };

  /* ---------- schools and devices ---------- */
  const SCH = [
    { id: 'lefkosia', short: T('Lefkosia', 'Λευκωσία'), n: T('PASCAL Lefkosia', 'PASCAL Λευκωσία'), re: /lefkos|nicosia|λευκωσ/i, dist: 'nicosia' },
    { id: 'larnaka', short: T('Larnaka', 'Λάρνακα'), n: T('PASCAL Larnaka', 'PASCAL Λάρνακα'), re: /larnak|larnac|λάρνακ/i, dist: 'larnaca' },
    { id: 'limassol', short: T('Limassol', 'Λεμεσός'), n: T('PASCAL Limassol', 'PASCAL Λεμεσός'), re: /limass|lemes|λεμεσ/i, dist: 'limassol' },
    { id: 'paphos', short: T('Paphos', 'Πάφος'), n: T('International School of Paphos', 'Διεθνές Σχολείο Πάφου'), re: /paph|pafos|πάφ|παφ/i, dist: 'paphos' },
  ];
  const VEH = /\b(bus|car|van|minibus|coach|vehicle|taxi|truck|shuttle)\b|λεωφορ|αυτοκίν|όχημα/i;
  const FIXED = /\b(class(room)?|lab|room|office|library|hall|gym|indoor|outdoor|roof|yard|playground|garden|fixed|station)\b|τάξη|αίθουσα|εργαστήρι/i;
  const schoolOf = (d) => { for (const txt of [d.group, d.name]) for (const s of SCH) if (s.re.test(txt || '')) return s.id; return null; };
  const kindOf = (d) => (VEH.test(d.name || '') ? 'veh' : FIXED.test(d.name || '') ? 'fixed' : 'other');
  const seenMs = (d) => { const m = d.lastSeen ? Date.parse(d.lastSeen) : NaN; return isFinite(m) ? m : 0; };
  // on: reported in the last hour. quiet: nothing for over an hour. off: nothing for over a day (or never).
  function stateOf(d, now) {
    const m = seenMs(d);
    if (d.online !== false && (!m || now - m <= HOUR)) return 'on';
    return m && now - m <= DAY ? 'quiet' : 'off';
  }
  function span(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    if (m < 90) return T(m + ' min', m + ' λεπτά');
    const h = Math.round(m / 60);
    if (h < 36) return T(h + ' h', h + ' ώρες');
    const d = Math.round(h / 24);
    return T(d + ' days', d + ' ημέρες');
  }
  const when = (t) => (SC.date(t) === SC.date(Date.now()) ? SC.time(t) : SC.date(t));
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const fmt = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d == null ? 1 : d).replace('-', '−').replace(/\B(?=(\d{3})+(?!\d))/g, (m, off, s) => (s.indexOf('.') >= 0 && off > s.indexOf('.') ? '' : ',')));

  /* ---------- colour ---------- */
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const rgbMix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const mixHex = (a, b, t) => 'rgb(' + rgbMix(hex(a), hex(b), t).join(',') + ')';
  const RAMP = [hex('#4C8BEA'), hex('#B7A6D2'), hex('#E8843F')];
  const ramp = (t) => { t = Math.max(0, Math.min(1, t)); const s = t * 2, i = Math.min(1, Math.floor(s)); return rgbMix(RAMP[i], RAMP[i + 1], s - i); };
  const rgb = (a, k) => { k = k == null ? 1 : k; return 'rgb(' + a.map((v) => Math.round(v * k)).join(',') + ')'; };
  const f1 = (n) => Math.round(n * 10) / 10;

  /* ---------- the pseudo-3D island (geometry fitted once) ---------- */
  const VBW = 700, VBH = 408, DEPTH = 15, TH = -12 * Math.PI / 180, K = 0.6, cs = Math.cos(TH), sn = Math.sin(TH), PIV = [500, 300];
  let GEO = null;
  function geo() {
    if (GEO) return GEO;
    const ext = [1e9, 1e9, -1e9, -1e9];
    Object.keys(ISLAND.districts).forEach((n) => {
      ISLAND.districts[n].replace(/(-?[\d.]+) (-?[\d.]+)/g, (m, x, y) => {
        const dx = x - PIV[0], dy = y - PIV[1], u = dx * cs - dy * sn, v = (dx * sn + dy * cs) * K;
        if (u < ext[0]) ext[0] = u; if (v < ext[1]) ext[1] = v; if (u > ext[2]) ext[2] = u; if (v > ext[3]) ext[3] = v;
        return m;
      });
    });
    const S = Math.min((VBW - 36) / (ext[2] - ext[0]), 0.9);
    const Tt = [VBW / 2 - (ext[0] + ext[2]) / 2 * S, VBH - 22 - DEPTH - ext[3] * S];
    const P = (x, y) => { const dx = x - PIV[0], dy = y - PIV[1]; return [Tt[0] + (dx * cs - dy * sn) * S, Tt[1] + (dx * sn + dy * cs) * K * S]; };
    const MAT = 'matrix(' + [cs * S, sn * K * S, -sn * S, cs * K * S, Tt[0] - (PIV[0] * cs - PIV[1] * sn) * S, Tt[1] - (PIV[0] * sn + PIV[1] * cs) * K * S].map((n) => n.toFixed(5)).join(' ') + ')';
    GEO = { P, MAT };
    return GEO;
  }

  // cols: [{ s (school), val (number or null), t (0..1 or null), txt, unit }]; stations: Met Office stations [{ lat, lng, hot }]
  function drawIsland(svgNode, cols, stations) {
    const { P, MAT } = geo();
    const names = Object.keys(ISLAND.districts);
    const byId = {}; cols.forEach((c) => { byId[c.s.id] = c; });
    const near = { kyrenia: 'lefkosia', famagusta: 'larnaka' };
    const tint = (dn) => {
      const sc = SCH.find((s) => s.dist === dn);
      const c = byId[sc ? sc.id : near[dn]];
      const base = hex('#2a62b0');
      return c && c.t != null ? rgb(rgbMix(base, ramp(c.t), 0.55)) : rgb(base);
    };
    const kids = [sv('defs', null,
      sv('radialGradient', { id: 'bd-aur', cx: '50%', cy: '54%', r: '55%' }, sv('stop', { offset: 0, 'stop-color': '#4CCBEA', 'stop-opacity': 0.16 }), sv('stop', { offset: 0.55, 'stop-color': '#4C8BEA', 'stop-opacity': 0.05 }), sv('stop', { offset: 1, 'stop-color': '#4C8BEA', 'stop-opacity': 0 })),
      sv('linearGradient', { id: 'bd-shine', x1: 0, y1: 0, x2: 0, y2: 1 }, sv('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.3 }), sv('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0.28 })),
      sv('filter', { id: 'bd-blur', x: '-50%', y: '-50%', width: '200%', height: '200%' }, sv('feGaussianBlur', { stdDeviation: 6 })),
      sv('g', { id: 'bd-isl', stroke: 'none' }, names.map((n) => sv('path', { d: ISLAND.districts[n] }))))];
    kids.push(sv('ellipse', { cx: 350, cy: 236, rx: 340, ry: 170, fill: 'url(#bd-aur)' }));
    [[300, 150], [235, 112]].forEach((r) => kids.push(sv('ellipse', { cx: 350, cy: 244, rx: r[0], ry: r[1], fill: 'none', stroke: 'rgba(143,227,247,.10)', 'stroke-width': 1 })));
    kids.push(sv('g', { transform: 'translate(0 16)', filter: 'url(#bd-blur)', opacity: 0.55 }, sv('use', { href: '#bd-isl', transform: MAT, fill: '#02060d' })));
    for (let z = 0; z <= DEPTH; z++) kids.push(sv('use', { href: '#bd-isl', transform: 'translate(0 ' + (-z) + ') ' + MAT, fill: mixHex('#0a1626', '#1f4a82', Math.pow(z / DEPTH, 1.2)) }));
    kids.push(sv('g', { transform: 'translate(0 ' + (-DEPTH) + ') ' + MAT, stroke: 'rgba(160,225,245,.22)', 'stroke-width': 0.7, 'stroke-linejoin': 'round' }, names.map((n) => sv('path', { d: ISLAND.districts[n], fill: tint(n) }))));
    kids.push(sv('g', { transform: 'translate(0 ' + (-DEPTH) + ') ' + MAT, opacity: 0.22 }, sv('use', { href: '#bd-isl', fill: 'url(#bd-shine)' })));

    (stations || []).forEach((s) => {
      const p = ISLAND.project(s.lng, s.lat), q = P(p[0], p[1]);
      kids.push(sv('circle', { cx: f1(q[0]), cy: f1(q[1] - DEPTH), r: s.hot ? 3.6 : 2.4, fill: '#fff', opacity: s.hot ? 1 : 0.75 }));
      if (s.hot) kids.push(sv('circle', { cx: f1(q[0]), cy: f1(q[1] - DEPTH), r: 7, fill: 'none', stroke: '#F7C46B', 'stroke-width': 1.4 }));
    });

    const poly = (pts, fill, extra) => sv('polygon', Object.assign({ points: pts.map((q) => f1(q[0]) + ',' + f1(q[1])).join(' '), fill }, extra || {}));
    const placed = cols.map((c) => {
      const sc = ISLAND.schools.find((x) => x.id === c.s.id);
      const p = ISLAND.project(sc.lng, sc.lat);
      return { c, p, base: P(p[0], p[1]) };
    }).sort((a, b) => a.base[1] - b.base[1]);
    const labels = [];
    placed.forEach(({ c, p }) => {
      const has = c.t != null;
      const h = has ? 30 + 100 * Math.max(0, Math.min(1, c.t)) : 9;
      const col = has ? ramp(c.t) : [107, 127, 153], d = 15;
      const cn = [[-d, -d], [d, -d], [d, d], [-d, d]].map((k) => { const q = P(p[0] + k[0], p[1] + k[1]); return [q[0], q[1] - DEPTH]; });
      const cx = (cn[0][0] + cn[1][0] + cn[2][0] + cn[3][0]) / 4, cy = (cn[0][1] + cn[1][1] + cn[2][1] + cn[3][1]) / 4;
      kids.push(sv('ellipse', { cx: f1(cx), cy: f1(cy + 2), rx: 30, ry: 15, fill: rgb(col), opacity: 0.2 }),
        sv('ellipse', { cx: f1(cx), cy: f1(cy + 2), rx: 30, ry: 15, fill: 'none', stroke: rgb(col), 'stroke-opacity': 0.7, 'stroke-width': 1.2 }));
      for (let i = 0; i < 4; i++) {
        const a = cn[i], b = cn[(i + 1) % 4];
        const my = (a[1] + b[1]) / 2 - cy, mx = (a[0] + b[0]) / 2 - cx;
        if (my <= 0) continue;                       // face turned away from the viewer
        const k = mx < 0 ? 0.92 : 0.58;             // light from the upper left
        const quad = [a, b, [b[0], b[1] - h], [a[0], a[1] - h]];
        kids.push(poly(quad, rgb(col, k), has ? null : { opacity: 0.6 }), has ? poly(quad, 'url(#bd-shine)', { opacity: 0.55 }) : null);
      }
      const top = cn.map((q) => [q[0], q[1] - h]);
      kids.push(poly(top, rgb(rgbMix(col, [255, 255, 255], 0.28)), { stroke: 'rgba(255,255,255,.5)', 'stroke-width': 0.8, opacity: has ? 1 : 0.6 }));
      const tx = cx, ty = cy - h, w = 96, hh = 40, ly = ty - 16 - hh;
      labels.push(sv('g', { class: 'bd-lbl' },
        sv('line', { x1: f1(tx), y1: f1(ty - 1), x2: f1(tx), y2: f1(ly + hh), stroke: 'rgba(255,255,255,.45)', 'stroke-width': 1 }),
        sv('g', { transform: 'translate(' + f1(tx - w / 2) + ' ' + f1(ly) + ')' },
          sv('rect', { width: w, height: hh, rx: 11, fill: 'rgba(8,16,30,.82)', stroke: rgb(col), 'stroke-opacity': 0.75 }),
          sv('text', { x: w / 2, y: 15, 'text-anchor': 'middle', 'font-family': 'Inter,sans-serif', 'font-size': 10.5, 'font-weight': 600, 'letter-spacing': '.04em', fill: '#b4c3d6' }, c.s.short),
          has
            ? sv('text', { x: w / 2, y: 32, 'text-anchor': 'middle', 'font-family': 'Inter Display,Inter,sans-serif', 'font-size': 16, 'font-weight': 600, fill: '#fff' }, c.txt, sv('tspan', { 'font-family': 'Inter,sans-serif', 'font-size': 10.5, 'font-weight': 500, fill: '#b4c3d6' }, ' ' + c.unit))
            : sv('text', { x: w / 2, y: 31, 'text-anchor': 'middle', 'font-family': 'Inter,sans-serif', 'font-size': 11.5, 'font-weight': 500, fill: '#9fb2ca' }, T('no reading', 'χωρίς μέτρηση')))));
    });
    kids.push(...labels);
    svgNode.replaceChildren(...kids);
  }

  /* ---------- small charts ---------- */
  function ringSvg(on, quiet, off, veh, fixed, other) {
    const cx = 77, cy = 77, r = 62, sw = 16, C = 2 * Math.PI * r, gap = 4, total = on + quiet + off;
    const kids = [sv('circle', { cx, cy, r, fill: 'none', stroke: 'rgba(255,255,255,.06)', 'stroke-width': sw })];
    let acc = 0;
    [[on, '#59d98e'], [quiet, '#F2B24C'], [off, '#FF7A6A']].forEach(([n, c]) => {
      if (!n || !total) return;
      const len = C * n / total, g = n === total ? 0 : gap;
      kids.push(sv('circle', { cx, cy, r, fill: 'none', stroke: c, 'stroke-width': sw, 'stroke-dasharray': f1(len - g) + ' ' + f1(C - len + g), 'stroke-dashoffset': f1(-acc - g / 2), transform: 'rotate(-90 ' + cx + ' ' + cy + ')' }));
      acc += len;
    });
    const r2 = 47, C2 = 2 * Math.PI * r2;
    kids.push(sv('circle', { cx, cy, r: r2, fill: 'none', stroke: '#3b5478', 'stroke-opacity': 0.45, 'stroke-width': 4 }));
    let a2 = 0;
    [[veh, '#4CCBEA'], [fixed, '#7d93b3'], [other, '#4b6a8c']].forEach(([n, c]) => {
      if (!n || !total) return;
      const len = C2 * n / total, g = n === total ? 0 : 3;
      kids.push(sv('circle', { cx, cy, r: r2, fill: 'none', stroke: c, 'stroke-width': 4, 'stroke-dasharray': f1(len - g) + ' ' + f1(C2), 'stroke-dashoffset': f1(-a2), transform: 'rotate(-90 ' + cx + ' ' + cy + ')' }));
      a2 += len;
    });
    kids.push(sv('text', { x: 77, y: 79, 'text-anchor': 'middle', 'font-family': 'Inter Display,Inter,sans-serif', 'font-size': 38, 'font-weight': 600, fill: '#fff' }, String(on)),
      sv('text', { x: 77, y: 97, 'text-anchor': 'middle', 'font-family': 'Inter,sans-serif', 'font-size': 11.5, fill: '#9fb2ca' }, T('of ' + total + ' online', 'από ' + total + ' σε λειτ.')));
    return sv('svg', { viewBox: '0 0 154 154', role: 'img', 'aria-label': T(on + ' of ' + total + ' sensors online', on + ' από ' + total + ' αισθητήρες σε λειτουργία') }, kids);
  }

  function warnStrip(level) {   // level: 0 none (green), 1 yellow, 2 orange, 3 red, -1 in force but not stated
    const L = [[T('Green', 'Πράσινο'), '#59d98e'], [T('Yellow', 'Κίτρινο'), '#F0B94A'], [T('Orange', 'Πορτοκαλί'), '#F2873F'], [T('Red', 'Κόκκινο'), '#FF5C6C']];
    const kids = [];
    L.forEach((l, i) => {
      const x = i * 60, on = i === level;
      kids.push(sv('rect', { x, y: 6, width: 56, height: 9, rx: 4.5, fill: l[1], opacity: on ? 1 : 0.28 }),
        sv('text', { x: x + 28, y: 35, 'text-anchor': 'middle', 'font-family': 'Inter,sans-serif', 'font-size': 10.5, 'font-weight': on ? 700 : 500, fill: on ? '#EAF0F7' : '#7f93ab' }, l[0]));
      if (on) kids.push(sv('path', { d: 'M' + (x + 28) + ' 4 l-4 -6 h8z', fill: l[1], transform: 'translate(0 6)' }));
    });
    const al = level < 0 ? T('Warning in force, level not stated in the text', 'Προειδοποίηση σε ισχύ, το επίπεδο δεν αναφέρεται στο κείμενο') : level === 0 ? T('No warnings in force', 'Καμία προειδοποίηση σε ισχύ') : T('Warning level ' + L[level][0].toLowerCase(), 'Επίπεδο προειδοποίησης: ' + L[level][0].toLowerCase());
    return sv('svg', { viewBox: '0 0 240 40', role: 'img', 'aria-label': al }, kids);
  }

  function gauge(v) {   // PM2.5, scale 0..50: good up to 15, fair to 35, poor above
    const cx = 182, cy = 54, r = 38;
    const pt = (fr, rr) => { const a = Math.PI * (1 - fr); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
    const arc = (f0, f1_, col, op) => { const p0 = pt(f0, r), p1 = pt(f1_, r); return sv('path', { d: 'M' + f1(p0[0]) + ' ' + f1(p0[1]) + ' A' + r + ' ' + r + ' 0 0 1 ' + f1(p1[0]) + ' ' + f1(p1[1]), fill: 'none', stroke: col, 'stroke-width': 8, 'stroke-opacity': op }); };
    const lvl = v <= 15 ? 0 : v <= 35 ? 1 : 2;
    const kids = [arc(0, 0.3, '#59d98e', lvl === 0 ? 1 : 0.32), arc(0.315, 0.695, '#F0B94A', lvl === 1 ? 1 : 0.32), arc(0.71, 1, '#FF5C6C', lvl === 2 ? 1 : 0.32)];
    for (let i = 0; i <= 10; i++) { const a0 = pt(i / 10, r + 8), a1 = pt(i / 10, r + (i % 5 === 0 ? 13 : 10.5)); kids.push(sv('line', { x1: f1(a0[0]), y1: f1(a0[1]), x2: f1(a1[0]), y2: f1(a1[1]), stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1 })); }
    const nd = pt(Math.max(0, Math.min(1, v / 50)), r - 4);
    kids.push(sv('line', { x1: cx, y1: cy, x2: f1(nd[0]), y2: f1(nd[1]), stroke: '#fff', 'stroke-width': 2.4, 'stroke-linecap': 'round' }), sv('circle', { cx, cy, r: 4.5, fill: '#fff' }),
      sv('text', { x: cx - r - 8, y: cy + 9, 'text-anchor': 'middle', 'font-family': 'Inter,sans-serif', 'font-size': 9.5, fill: '#7f93ab' }, '0'),
      sv('text', { x: cx + r + 8, y: cy + 9, 'text-anchor': 'middle', 'font-family': 'Inter,sans-serif', 'font-size': 9.5, fill: '#7f93ab' }, '50'));
    [['#59d98e', T('Good: up to 15', 'Καλή: έως 15'), '#9BD88F', 600], ['#F0B94A', T('Fair: 15 to 35', 'Μέτρια: 15 έως 35'), '#9fb2ca', 500], ['#FF5C6C', T('Poor: over 35', 'Κακή: πάνω από 35'), '#9fb2ca', 500]].forEach((l, i) => {
      kids.push(sv('circle', { cx: 5, cy: 16 + i * 17, r: 3.5, fill: l[0] }), sv('text', { x: 16, y: 20 + i * 17, 'font-family': 'Inter,sans-serif', 'font-size': 11.5, 'font-weight': l[3], fill: l[2] }, l[1]));
    });
    return sv('svg', { viewBox: '0 0 240 62', role: 'img', 'aria-label': T('PM2.5 scale from 0 to 50 with the reading at ' + f1(v), 'Κλίμακα PM2.5 από 0 έως 50 με την τιμή ' + f1(v)) }, kids);
  }

  function hourBars(counts, t0, max) {
    const bw = 14, gp = 5.8, kids = [];
    counts.forEach((v, i) => {
      const hh = 3 + (max ? v / max : 0) * 30, x = i * (bw + gp) + 2, last = i === counts.length - 1;
      kids.push(sv('rect', { x: f1(x), y: f1(38 - hh), width: bw, height: f1(hh), rx: 3, fill: '#4CCBEA', opacity: last ? 1 : 0.38 + (max ? v / max : 0) * 0.4 }));
    });
    kids.push(sv('text', { x: 2, y: 49, 'font-family': 'Inter,sans-serif', 'font-size': 11.5, fill: '#9fb2ca' }, SC.time(t0)), sv('text', { x: 238, y: 49, 'text-anchor': 'end', 'font-family': 'Inter,sans-serif', 'font-size': 11.5, fill: '#9fb2ca' }, T('now', 'τώρα')));
    return sv('svg', { viewBox: '0 0 240 52', role: 'img', 'aria-label': T('Vehicle sensors reporting each hour, last ' + counts.length + ' hours', 'Αισθητήρες οχημάτων που έστειλαν μετρήσεις ανά ώρα, τελευταίες ' + counts.length + ' ώρες') }, kids);
  }

  /* ---------- vehicle movement from the trails (positions are delayed and rounded; see privacy.js) ---------- */
  const snap = (v) => Math.round(v / 0.01) * 0.01;
  function movingAt(trail, ref) {
    const pts = []; let last = '';
    for (const p of trail || []) {
      if (!Array.isArray(p) || !fin(p[0]) || !fin(p[1]) || !fin(p[2])) continue;
      const la = snap(p[1]), lo = snap(p[2]), key = la.toFixed(2) + ',' + lo.toFixed(2);
      if (key === last) continue;
      last = key; pts.push([p[0], la, lo]);
    }
    const win = pts.filter((p) => p[0] >= ref - 45 * 60000 && p[0] <= ref + 60000);
    if (win.length < 3) return false;
    const la = win.map((p) => p[1]), lo = win.map((p) => p[2]);
    const dLat = (Math.max(...la) - Math.min(...la)) * 111, dLng = (Math.max(...lo) - Math.min(...lo)) * 111 * Math.cos(la[0] * Math.PI / 180);
    return Math.hypot(dLat, dLng) >= 2;
  }

  /* ---------- tiny helpers for panels ---------- */
  const loadingBox = () => el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'));
  const arrowSvg = () => sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, sv('path', { d: 'M5 12h14M13 6l6 6-6 6' }));
  const ext = (href, text) => el('a', { class: 'bd-src', href, target: '_blank', rel: 'noopener' }, text, ' ↗');
  const inl = (id, text) => el('a', { class: 'bd-src', href: '#/' + id }, text, ' ↗');
  const ready = (id) => SC.ready && SC.ready.has(id);
  async function pool(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } }));
    return out;
  }
  const settle = async (p) => { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, e }; } };

  /* =============================================================================================================== */
  SC.register('board', {
    title: ['City board', 'Πίνακας πόλης'],
    render(root, ctx) {
      let alive = true, busy = false, seriesAt = 0, chartNarrow = null, rz = 0;
      const R = {};                 // fetched data: R.name = { ok, v } or { ok: false, e }
      const st = { cat: null, series: null, met: null, airApi: null, open: null };
      const timers = [];

      const val = (k) => (R[k] && R[k].ok ? R[k].v : null);
      const cfg = () => val('cfg') || { names: {}, gps: ['4198', '4197'] };
      const devices = () => (Array.isArray(val('devices')) ? val('devices') : []);
      const latest = () => val('latest') || {};
      const isGps = (m) => (cfg().gps || ['4198', '4197']).map(String).includes(String(m));
      const catOf = (mid) => {
        const nm = cfg().names && cfg().names[mid];
        const name = nm ? String(nm[0]) : '';
        for (const c of CATS) if (name && c.re.test(name) && !(c.not && c.not.test(name))) return c.id;
        for (const c of CATS) if (c.ids.includes(String(mid)) && !(name && c.not && c.not.test(name))) return c.id;
        return null;
      };
      const unitOf = (c, mid) => {
        const nm = cfg().names && mid != null && cfg().names[mid];
        const u = nm && nm[1] ? String(nm[1]) : '';
        return UNIT[u.toLowerCase()] || u || cat(c).unit;
      };
      const midsOf = (c) => { const out = new Set(); devices().forEach((d) => (d.measurements || []).forEach((m) => { if (!isGps(m) && catOf(m) === c) out.add(String(m)); })); return [...out]; };
      function reading(d, c, now) {   // newest fresh value of category c on device d
        let best = null;
        (d.measurements || []).forEach((m) => {
          if (isGps(m) || catOf(m) !== c) return;
          const r = latest()[d.eui] && latest()[d.eui][m];
          if (!r) return;
          const v = Number(r.v), t = Date.parse(r.t);
          if (!isFinite(v) || !isFinite(t) || now - t > FRESH) return;
          if (!best || t > best.t) best = { v, t, mid: String(m) };
        });
        return best;
      }

      /* ---------- skeleton ---------- */
      const head = SC.head({
        title: T('City board', 'Πίνακας πόλης'),
        lede: T('From the schools’ sensors and the Met Office. Every figure links to its source.', 'Από τους αισθητήρες των σχολείων και τη Μετεωρολογική Υπηρεσία. Κάθε στοιχείο οδηγεί στην πηγή του.'),
        fresh: T('Checking…', 'Έλεγχος…'),
        help: ['The City board shows the project at a glance, from real data only. The island has one column per school: its height and colour show the reading you choose, averaged over the school’s sensors that reported in the last 3 hours (a school with no recent reading shows "no reading"). The ring counts the sensors: online means a reading in the last hour, quiet means nothing for over an hour, offline means nothing for over a day. The four tiles come from the Met Office warnings page, the Met Office stations, the air-quality readings and the vehicles. The chart compares our temperature with the Met Office stations nearest the schools. The page refreshes every minute.',
          'Ο Πίνακας πόλης δείχνει το έργο με μια ματιά, μόνο από πραγματικά δεδομένα. Το νησί έχει μία στήλη ανά σχολείο: το ύψος και το χρώμα της δείχνουν τη μέτρηση που διαλέγετε, με μέσο όρο των αισθητήρων του σχολείου που έστειλαν μέτρηση τις τελευταίες 3 ώρες (σχολείο χωρίς πρόσφατη μέτρηση δείχνει «χωρίς μέτρηση»). Ο δακτύλιος μετρά τους αισθητήρες: σε λειτουργία σημαίνει μέτρηση την τελευταία ώρα, σιωπηλός σημαίνει τίποτα για πάνω από μία ώρα, εκτός λειτουργίας σημαίνει τίποτα για πάνω από μία ημέρα. Τα τέσσερα πλακίδια προέρχονται από τη σελίδα προειδοποιήσεων της Μετεωρολογικής, τους σταθμούς της, τις μετρήσεις ποιότητας αέρα και τα οχήματα. Το γράφημα συγκρίνει τη θερμοκρασία μας με τους σταθμούς της Μετεωρολογικής που βρίσκονται πιο κοντά στα σχολεία. Η σελίδα ανανεώνεται κάθε λεπτό.'],
      });
      const pill = head.querySelector('.fresh-pill');
      const lede = head.querySelector('.lede');
      const pageHead = head.querySelector('.page-head');

      const links = el('nav', { class: 'bd-links', 'aria-label': T('Related pages', 'Σχετικές σελίδες') },
        [['weather', T('Weather', 'Καιρός')], ['explore', T('Air', 'Αέρας')], ['vehicles', T('Vehicles', 'Οχήματα')], ['city3d', T('Cyprus 3D', 'Κύπρος 3D')]]
          .concat(SC.me ? [['approvals', T('Oversight', 'Εποπτεία')]] : []).filter(([id]) => ready(id))
          .map(([id, l]) => el('a', { class: 'bd-lk', href: '#/' + id }, l, arrowSvg())));

      const ticker = el('div', { class: 'bd-ticker', 'aria-label': T('Latest events', 'Τελευταία γεγονότα') }, el('span', { class: 'tk lead' }, T('Latest on the board', 'Τελευταία στον πίνακα')), el('span', { class: 'tk' }, T('Loading…', 'Φόρτωση…')));

      // map card
      const chipsBox = el('div', { class: 'bd-chips', role: 'group', 'aria-label': T('Choose a reading', 'Επιλέξτε μέτρηση') });
      const mapDesc = el('p', { class: 'bd-mc-desc' });
      const mapSvg = sv('svg', { viewBox: '0 0 ' + VBW + ' ' + VBH, role: 'img', 'aria-label': T('Pseudo-3D map of Cyprus with a column at each of the four schools', 'Ψευδο-τρισδιάστατος χάρτης της Κύπρου με μία στήλη σε καθένα από τα τέσσερα σχολεία') });
      const valsList = el('ul', { class: 'bd-vals', 'aria-label': T('Reading at each school', 'Μέτρηση σε κάθε σχολείο') });
      const mapBox = el('div', { class: 'bd-mapbox' }, mapSvg);
      const mapMsg = el('div');
      const scaleNote = el('span', { class: 'lg' });
      const mapCard = el('section', { class: 'nm-card bd-br bd-map', 'aria-label': T('Island map', 'Χάρτης νησιού') },
        el('div', { class: 'bd-mc-head' }, el('div', null, el('div', { class: 'bd-eb' }, T('Cyprus · the four schools', 'Κύπρος · τα τέσσερα σχολεία')), mapDesc), chipsBox),
        mapMsg, mapBox, valsList,
        el('div', { class: 'bd-foot' }, el('span', { class: 'lg' }, el('span', null, T('Lower', 'Χαμηλότερο')), el('span', { class: 'ramp' }), el('span', null, T('Higher', 'Υψηλότερο'))), scaleNote,
          el('span', { class: 'lg' }, el('span', { class: 'sq' }), T('School (column)', 'Σχολείο (στήλη)')), el('span', { class: 'lg' }, el('span', { class: 'st' }), T('Met Office station', 'Σταθμός Μετεωρολογικής')),
          ready('city3d') ? inl('city3d', T('Turn it in Cyprus 3D', 'Γυρίστε το σε 3D')) : null));

      const ringBody = el('div', null, loadingBox());
      const ringCard = el('section', { class: 'nm-card bd-br bd-ringcard', 'aria-label': T('Sensors online', 'Αισθητήρες σε λειτουργία') }, ringBody);

      const kWarn = el('div', null, loadingBox()), kTemp = el('div', null, loadingBox()), kAir = el('div', null, loadingBox()), kVeh = el('div', null, loadingBox());
      const kpi = (box) => el('section', { class: 'nm-card bd-br bd-kpi' }, box);
      const kpis = el('div', { class: 'bd-kpis' }, kpi(kWarn), kpi(kTemp), kpi(kAir), kpi(kVeh));

      const chartBox = el('div', { 'aria-live': 'polite' }, loadingBox());
      const chartHead = el('div');
      const chartCard = el('section', { class: 'nm-card nm-card--glow bd-br bd-chartcard', 'aria-label': T('Last 24 hours', 'Τελευταίες 24 ώρες') }, chartHead, chartBox);

      root.append(head, links, ticker, el('div', { class: 'bd-hero' }, mapCard, ringCard), kpis, chartCard);

      /* ---------- paint: freshness ---------- */
      function paintFresh() {
        const dv = devices(), now = Date.now();
        const last = Math.max(0, ...dv.map(seenMs));
        pill.className = 'fresh-pill';
        if (!R.devices || !R.devices.ok) { pill.className = 'fresh-pill none'; pill.lastChild.textContent = T('Sensors unavailable', 'Οι αισθητήρες δεν είναι διαθέσιμοι'); return; }
        if (!last) { pill.className = 'fresh-pill none'; pill.lastChild.textContent = T('No readings yet', 'Καμία μέτρηση ακόμα'); return; }
        if (now - last > HOUR) { pill.className = 'fresh-pill stale'; pill.lastChild.textContent = T('Last reading ' + SC.ago(last), 'Τελευταία μέτρηση ' + SC.ago(last)); return; }
        pill.lastChild.textContent = T('Live · ' + SC.ago(last), 'Ζωντανά · ' + SC.ago(last));
        const demo = val('cfg') && val('cfg').demo;
        const has = pageHead.querySelector('.t.demo');
        if (demo && !has) pageHead.insertBefore(el('span', { class: 't demo' }, T('Demo data', 'Δεδομένα επίδειξης')), lede);
        if (!demo && has) has.remove();
      }
      function paintLede() {
        const dv = devices();
        const nSch = new Set(dv.map(schoolOf).filter(Boolean)).size;
        lede.textContent = dv.length
          ? T('From ' + nSch + ' schools, ' + dv.length + ' sensors and the Met Office. Every figure links to its source.', 'Από ' + nSch + ' σχολεία, ' + dv.length + ' αισθητήρες και τη Μετεωρολογική Υπηρεσία. Κάθε στοιχείο οδηγεί στην πηγή του.')
          : T('From the schools’ sensors and the Met Office. Every figure links to its source.', 'Από τους αισθητήρες των σχολείων και τη Μετεωρολογική Υπηρεσία. Κάθε στοιχείο οδηγεί στην πηγή του.');
      }

      const retryBtn = () => el('button', { class: 'nm-btn', type: 'button', onclick: () => refresh(true) }, T('Try again', 'Δοκιμάστε ξανά'));
      const errBox = (msg) => el('div', { class: 'bd-err' }, el('div', { class: 'err', role: 'alert' }, msg), retryBtn());

      /* ---------- paint: map ---------- */
      function paintMap() {
        if (!R.devices) return;
        if (!R.devices.ok) { mapMsg.replaceChildren(errBox(T('The sensors could not be loaded, so the island has no readings. ', 'Δεν φορτώθηκαν οι αισθητήρες, οπότε το νησί δεν έχει μετρήσεις. ') + (R.devices.e && R.devices.e.message ? R.devices.e.message : ''))); mapBox.hidden = true; return; }
        mapBox.hidden = false; mapMsg.replaceChildren();
        const avail = CATS.filter((c) => midsOf(c.id).length);
        if (!avail.length) {
          chipsBox.replaceChildren(); mapDesc.textContent = '';
          mapBox.hidden = true; valsList.replaceChildren();
          mapMsg.replaceChildren(el('div', { class: 'empty' }, devices().length ? T('The sensors report no temperature, humidity, CO2, PM2.5 or noise yet. When they do, a column per school appears here.', 'Οι αισθητήρες δεν στέλνουν ακόμα θερμοκρασία, υγρασία, CO2, PM2.5 ή θόρυβο. Όταν στείλουν, θα εμφανιστεί εδώ μία στήλη ανά σχολείο.') : T('No sensors are listed yet. When the sensor feed is connected, a column per school appears here.', 'Δεν έχουν καταχωριστεί ακόμα αισθητήρες. Όταν συνδεθεί η τροφοδοσία αισθητήρων, θα εμφανιστεί εδώ μία στήλη ανά σχολείο.')));
          return;
        }
        if (!st.cat || !avail.find((c) => c.id === st.cat)) st.cat = avail[0].id;
        chipsBox.replaceChildren(...avail.map((c) => el('button', { class: 'bd-chip' + (c.id === st.cat ? ' on' : ''), type: 'button', 'aria-pressed': c.id === st.cat ? 'true' : 'false', onclick: () => { st.cat = c.id; paintMap(); } }, T(c.en, c.el))));
        const C = cat(st.cat), now = Date.now(), dv = devices();
        const cols = SCH.map((s) => {
          const vals = []; let unit = null;
          dv.filter((d) => schoolOf(d) === s.id).forEach((d) => { const r = reading(d, C.id, now); if (r) { vals.push(r.v); unit = unit || unitOf(C.id, r.mid); } });
          const v = mean(vals);
          return { s, val: v, n: vals.length, t: v == null ? null : Math.max(0, Math.min(1, (v - C.lo) / (C.hi - C.lo))), txt: v == null ? '' : fmt(v, C.dec), unit: unit || C.unit };
        });
        const unit = (cols.find((c) => c.val != null) || { unit: C.unit }).unit;
        mapDesc.textContent = T('Height and colour show the chosen reading, averaged over each school’s sensors that reported in the last 3 hours. Fixed scale: ' + C.lo + ' to ' + C.hi + ' ' + unit + '. Blue lower, copper higher.',
          'Το ύψος και το χρώμα δείχνουν την επιλεγμένη μέτρηση, με μέσο όρο των αισθητήρων κάθε σχολείου που έστειλαν μέτρηση τις τελευταίες 3 ώρες. Σταθερή κλίμακα: ' + C.lo + ' έως ' + C.hi + ' ' + unit + '. Μπλε χαμηλότερο, χάλκινο υψηλότερο.');
        scaleNote.textContent = C.lo + ' – ' + C.hi + ' ' + unit;
        mapSvg.setAttribute('aria-label', T('Pseudo-3D map of Cyprus with a column at each school: ', 'Ψευδο-τρισδιάστατος χάρτης της Κύπρου με μία στήλη σε κάθε σχολείο: ') + cols.map((c) => c.s.short + ' ' + (c.val == null ? T('no reading', 'χωρίς μέτρηση') : c.txt + ' ' + c.unit)).join(', '));
        valsList.replaceChildren(...cols.map((c) => el('li', null, c.s.n, el('b', null, c.val == null ? T('no reading', 'χωρίς μέτρηση') : c.txt + ' ' + c.unit), c.val == null ? null : T(c.n + (c.n === 1 ? ' sensor' : ' sensors'), c.n + (c.n === 1 ? ' αισθητήρας' : ' αισθητήρες')))));
        const cy = val('cydom'), pts = cy && Array.isArray(cy.points) ? cy.points.filter((p) => fin(p.lat) && fin(p.lng)) : [];
        const hot = pts.filter((p) => fin(p.temp)).sort((a, b) => b.temp - a.temp)[0];
        drawIsland(mapSvg, cols, pts.map((p) => ({ lat: p.lat, lng: p.lng, hot: hot && p.id === hot.id })));
      }

      /* ---------- paint: ring ---------- */
      function paintRing() {
        if (!R.devices) return;
        if (!R.devices.ok) { ringBody.replaceChildren(errBox(T('The sensors could not be loaded. ', 'Δεν φορτώθηκαν οι αισθητήρες. ') + (R.devices.e && R.devices.e.message ? R.devices.e.message : ''))); return; }
        const dv = devices(), now = Date.now();
        if (!dv.length) { ringBody.replaceChildren(el('div', { class: 'bd-eb' }, T('Sensors online', 'Αισθητήρες σε λειτουργία')), el('div', { class: 'empty' }, T('No sensors are listed yet. When the sensor feed is connected, the ring counts them here.', 'Δεν έχουν καταχωριστεί ακόμα αισθητήρες. Όταν συνδεθεί η τροφοδοσία αισθητήρων, ο δακτύλιος θα τους μετρά εδώ.'))); return; }
        const sts = dv.map((d) => stateOf(d, now));
        const n = (k) => sts.filter((x) => x === k).length;
        const on = n('on'), quiet = n('quiet'), off = n('off');
        const kinds = dv.map(kindOf), kn = (k) => kinds.filter((x) => x === k).length;
        const veh = kn('veh'), fixed = kn('fixed'), other = kn('other');
        const pct = Math.round(on / dv.length * 100);
        const li = (color, text, n_) => el('li', null, el('i', { style: 'background:' + color }), text, el('b', null, n_));
        const bad = dv.map((d, i) => ({ d, s: sts[i], m: seenMs(d) })).filter((x) => x.s !== 'on').sort((a, b) => a.m - b.m).slice(0, 4);
        ringBody.replaceChildren(
          el('div', { class: 'bd-eb' }, T('Sensors online · all ' + dv.length + ' sensors', 'Αισθητήρες σε λειτουργία · και οι ' + dv.length)),
          el('div', { class: 'bd-ringtop', style: 'margin-top:14px' }, ringSvg(on, quiet, off, veh, fixed, other),
            el('ul', { class: 'bd-leg' }, li('#59d98e', T('Online', 'Σε λειτουργία'), on), li('#F2B24C', T('Quiet for over an hour', 'Σιωπηλοί πάνω από μία ώρα'), quiet), li('#FF7A6A', T('Offline', 'Εκτός λειτουργίας'), off), el('hr'),
              li('#4CCBEA', T('Named as bus or car', 'Ονομάζονται λεωφορείο/αυτοκίνητο'), veh), li('#7d93b3', T('Named as classroom or fixed', 'Ονομάζονται τάξη/σταθερός'), fixed), li('#4b6a8c', T('Name does not say', 'Το όνομα δεν το δηλώνει'), other))),
          el('div', { style: 'margin-top:14px' }, el('div', { class: 'bd-bigok' + (pct < 50 ? ' bad' : pct < 80 ? ' warn' : '') }, String(pct), el('small', null, T('% online', '% σε λειτουργία'))),
            el('p', { style: 'margin-top:4px' }, T(on + ' of ' + dv.length + ' sensors sent a reading in the last hour. ', on + ' από ' + dv.length + ' αισθητήρες έστειλαν μέτρηση την τελευταία ώρα. '), ready('vehicles') ? inl('vehicles', T('Vehicles', 'Οχήματα')) : null)),
          el('div', { class: 'nm-callout nm-callout--info' }, T('Quiet: nothing sent for over an hour. Offline: nothing for over a day. Moving or fixed is not guessed: it follows the device name.', 'Σιωπηλός: τίποτα για πάνω από μία ώρα. Εκτός λειτουργίας: τίποτα για πάνω από μία ημέρα. Το αν κινείται ή είναι σταθερός δεν εικάζεται: ακολουθεί το όνομα της συσκευής.')),
          bad.length ? el('ul', { class: 'bd-quiet' }, bad.map((x) => el('li', null, el('i', { style: 'background:' + (x.s === 'quiet' ? '#F2B24C' : '#FF7A6A') }), el('em', { title: x.d.name }, x.d.name),
            el('span', null, !x.m ? T('never seen', 'δεν έχει εμφανιστεί') : x.s === 'quiet' ? T('quiet for ' + span(now - x.m), 'σιωπηλός ' + span(now - x.m)) : T('offline since ' + SC.date(x.m), 'εκτός από ' + SC.date(x.m)))))) : null);
      }

      /* ---------- paint: tiles ---------- */
      function head4(label) { return el('div', { class: 'bd-eb' }, label); }

      function paintWarn() {
        if (!R.warn) return;
        if (!R.warn.ok) { kWarn.replaceChildren(head4(T('Met Office warnings', 'Προειδοποιήσεις Μετεωρολογικής')), errBox(T('The warnings page could not be read. ', 'Δεν διαβάστηκε η σελίδα προειδοποιήσεων. ') + (R.warn.e && R.warn.e.message ? R.warn.e.message : ''))); return; }
        const p = R.warn.v || {}, txt = String(p.text || '').replace(/\s+/g, ' ').trim();
        const none = txt.length < 40;                   // with nothing in force the page shows only its heading (see metoffice.html)
        const low = txt.toLowerCase();
        const level = none ? 0 : /\bred\b/.test(low) ? 3 : /\borange\b/.test(low) ? 2 : /\byellow\b/.test(low) ? 1 : -1;
        const names = [T('None', 'Καμία'), T('Yellow', 'Κίτρινη'), T('Orange', 'Πορτοκαλί'), T('Red', 'Κόκκινη')];
        const checked = p.fetched ? Date.parse(p.fetched) : 0;
        const excerpt = txt.replace(/^issued weather warnings\s*/i, '').slice(0, 150);
        kWarn.replaceChildren(head4(T('Met Office warnings', 'Προειδοποιήσεις Μετεωρολογικής')),
          el('div', { class: 'val' }, el('span', { class: 'num ' + (none ? 'bd-ok' : level >= 2 ? 'bd-bd' : 'bd-wn') }, none ? T('None', 'Καμία') : T('In force', 'Σε ισχύ')),
            el('span', { class: 'chipu' }, none ? T('in force', 'σε ισχύ') : level < 0 ? T('level not stated', 'επίπεδο μη δηλωμένο') : names[level])),
          el('p', { class: 'sub' }, none ? T('The Met Office warnings page lists none right now.', 'Η σελίδα προειδοποιήσεων της Μετεωρολογικής δεν αναφέρει καμία αυτή τη στιγμή.') : excerpt + (txt.length > 150 ? '…' : ''), ' ',
            checked ? T('Checked ' + SC.ago(checked) + '. ', 'Έλεγχος ' + SC.ago(checked) + '. ') : '', ext(p.url || 'https://www.dom.org.cy/WARNING/', 'dom.org.cy')),
          el('div', { class: 'gfx' }, warnStrip(level)));
      }

      function paintTemp() {
        const lab = head4(T('Island temperature', 'Θερμοκρασία νησιού'));
        if (!R.cydom) return;
        if (!R.cydom.ok) { kTemp.replaceChildren(lab, errBox(T('The Met Office stations could not be read. ', 'Δεν διαβάστηκαν οι σταθμοί της Μετεωρολογικής. ') + (R.cydom.e && R.cydom.e.message ? R.cydom.e.message : ''))); return; }
        const all = (R.cydom.v.points || []).filter((p) => fin(p.temp)), now = Date.now();
        const recent = all.filter((p) => p.time && now - Date.parse(p.time) < FRESH);
        const use = recent.length ? recent : all;
        if (!use.length) { kTemp.replaceChildren(lab, el('div', { class: 'empty', style: 'margin-top:10px' }, T('The Met Office feed has no temperature readings right now.', 'Η τροφοδοσία της Μετεωρολογικής δεν έχει μετρήσεις θερμοκρασίας αυτή τη στιγμή.'))); return; }
        const avg = mean(use.map((p) => p.temp)), hot = use.slice().sort((a, b) => b.temp - a.temp)[0], cold = use.slice().sort((a, b) => a.temp - b.temp)[0];
        const newest = Math.max(...use.map((p) => (p.time ? Date.parse(p.time) : 0)));
        const g = el('div', { class: 'gfx' });
        const m = st.met && st.met.pts && st.met.pts.length > 1 ? st.met.pts : null;
        if (m) { g.append(SCChart.spark(m.map((p) => p.v), { w: 240, h: 48, color: '#F2A56B' }), el('div', { class: 'muted', style: 'display:flex;justify-content:space-between;font-size:10.5px;margin-top:2px' }, el('span', null, T('24 h ago', 'πριν 24 ώρες')), el('span', null, T('now · stations nearest the schools', 'τώρα · σταθμοί κοντά στα σχολεία')))); }
        else g.append(el('div', { class: 'empty' }, st.met === 'loading' ? T('Loading 24 h history…', 'Φόρτωση ιστορικού 24 ω…') : T('The 24-hour history is still being collected on this server.', 'Το ιστορικό 24 ωρών συλλέγεται ακόμα σε αυτόν τον διακομιστή.')));
        kTemp.replaceChildren(lab,
          el('div', { class: 'val' }, el('span', { class: 'num' }, fmt(avg, 1), el('small', null, '°C')), el('span', { class: 'chipu' }, T(use.length + ' stations', use.length + ' σταθμοί'))),
          el('p', { class: 'sub' }, T('Average of ' + use.length + ' Met Office stations. Hottest: ' + hot.name + ' ' + fmt(hot.temp, 1) + ' °C. Coldest: ' + cold.name + ' ' + fmt(cold.temp, 1) + ' °C. ', 'Μέσος όρος ' + use.length + ' σταθμών της Μετεωρολογικής. Θερμότερος: ' + hot.name + ' ' + fmt(hot.temp, 1) + ' °C. Ψυχρότερος: ' + cold.name + ' ' + fmt(cold.temp, 1) + ' °C. '),
            !recent.length && newest ? T('Newest reading ' + SC.ago(newest) + '. ', 'Νεότερη μέτρηση ' + SC.ago(newest) + '. ') : '', ready('weather') ? inl('weather', T('Stations', 'Σταθμοί')) : null), g);
      }

      function airValue() {
        const now = Date.now(), vals = [];
        devices().forEach((d) => { const r = reading(d, 'pm25', now); if (r) vals.push(r.v); });
        if (vals.length) return { v: mean(vals), n: vals.length, src: 'dev' };
        const a = st.airApi && st.airApi.points ? st.airApi.points.map((p) => p.pm25).filter(fin) : [];
        if (a.length) return { v: mean(a), n: a.length, src: 'model' };
        const o = st.open && st.open.points ? st.open.points.map((p) => p.pm25).filter(fin) : [];
        if (o.length) return { v: mean(o), n: o.length, src: 'open' };
        return null;
      }
      function paintAir() {
        const lab = head4(T('Air quality · PM2.5', 'Ποιότητα αέρα · PM2.5'));
        if (!R.devices) return;
        const a = airValue();
        if (!a) {
          const pending = st.airApi === 'loading' || st.open === 'loading';
          kAir.replaceChildren(lab, el('div', { class: 'val' }, el('span', { class: 'num' }, '–')), el('div', { class: 'empty', style: 'margin-top:10px' }, pending ? T('Loading…', 'Φόρτωση…') : T('No PM2.5 reading yet: our sensors do not report it and the open air-quality feeds returned nothing.', 'Δεν υπάρχει ακόμα μέτρηση PM2.5: οι αισθητήρες μας δεν τη στέλνουν και οι ανοιχτές πηγές δεν επέστρεψαν τίποτα.')));
          return;
        }
        const lvl = a.v <= 15 ? 0 : a.v <= 35 ? 1 : 2;
        const badge = [['ok', T('Good', 'Καλή')], ['warn', T('Fair', 'Μέτρια')], ['bad', T('Poor', 'Κακή')]][lvl];
        const srcText = a.src === 'dev' ? T('Mean of ' + a.n + ' school sensors. ', 'Μέσος όρος ' + a.n + ' αισθητήρων σχολείων. ') : a.src === 'model' ? T('Open-Meteo model, mean of ' + a.n + ' points over Cyprus (no school sensor reports PM2.5). ', 'Μοντέλο Open-Meteo, μέσος όρος ' + a.n + ' σημείων στην Κύπρο (κανένας αισθητήρας σχολείου δεν στέλνει PM2.5). ') : T('Mean of ' + a.n + ' public Sensor.Community sensors (no school sensor reports PM2.5). ', 'Μέσος όρος ' + a.n + ' δημόσιων αισθητήρων Sensor.Community (κανένας αισθητήρας σχολείου δεν στέλνει PM2.5). ');
        kAir.replaceChildren(lab,
          el('div', { class: 'val' }, el('span', { class: 'num ' + ['bd-ok', 'bd-wn', 'bd-bd'][lvl] }, fmt(a.v, a.v < 10 ? 1 : 0), el('small', null, 'µg/m³')), el('span', { class: 'nm-badge nm-badge--' + badge[0] }, badge[1])),
          el('p', { class: 'sub' }, srcText, lvl === 0 ? T('At or under the WHO 24-hour guide of 15. ', 'Μέχρι το όριο των 15 του ΠΟΥ για 24 ώρες. ') : T('Above the WHO 24-hour guide of 15. ', 'Πάνω από το όριο των 15 του ΠΟΥ για 24 ώρες. '), ready('explore') ? inl('explore', T('Explore data', 'Εξερεύνηση')) : null),
          el('div', { class: 'gfx' }, gauge(a.v)));
      }

      function paintVeh() {
        const lab = head4(T('Vehicles reporting', 'Οχήματα που στέλνουν'));
        if (!R.devices) return;
        if (!R.devices.ok) { kVeh.replaceChildren(lab, errBox(T('The sensors could not be loaded.', 'Δεν φορτώθηκαν οι αισθητήρες.'))); return; }
        const dv = devices().filter((d) => kindOf(d) !== 'fixed'), now = Date.now();
        if (!dv.length) { kVeh.replaceChildren(lab, el('div', { class: 'empty', style: 'margin-top:10px' }, T('No vehicle sensors are listed yet.', 'Δεν έχουν καταχωριστεί ακόμα αισθητήρες οχημάτων.'))); return; }
        const on = dv.filter((d) => stateOf(d, now) === 'on');
        let moving = null;
        const tr = val('trails');
        const exactNow = !!(val('cfg') && val('cfg').exactPositions);
        const delayMin = exactNow ? 0 : (val('cfg') && fin(val('cfg').posDelayMin) ? val('cfg').posDelayMin : tr && fin(tr.delayMinutes) ? tr.delayMinutes : 120);
        const delayH = Math.max(1, Math.round(delayMin / 60));
        if (tr && tr.trails) {
          const delay = delayMin * 60000;
          moving = on.filter((d) => movingAt(tr.trails[d.eui], now - delay)).length;
        }
        const g = el('div', { class: 'gfx' });
        const tm = cat('temp') && st.series ? st.series : null;
        if (tm) {
          const t0 = Math.floor(now / HOUR) * HOUR - 11 * HOUR, counts = new Array(12).fill(0);
          dv.forEach((d) => { const pts = tm[d.eui]; if (!pts) return; const seen = new Set(); pts.forEach((p) => { const b = Math.floor((p.t - t0) / HOUR); if (b >= 0 && b < 12) seen.add(b); }); seen.forEach((b) => { counts[b]++; }); });
          g.append(hourBars(counts, t0, Math.max(1, dv.length)));
        } else g.append(el('div', { class: 'empty' }, st.series === 'loading' ? T('Loading…', 'Φόρτωση…') : T('No hourly history yet.', 'Δεν υπάρχει ακόμα ωριαίο ιστορικό.')));
        const delayNote = exactNow ? T('You are signed in as a teacher, so positions are exact. ', 'Είστε συνδεδεμένος ως εκπαιδευτικός, οπότε οι θέσεις είναι ακριβείς. ') : T('Positions are public only after ' + delayH + ' h, rounded to about 1 km. ', 'Οι θέσεις δημοσιεύονται μετά από ' + delayH + ' ώρες, στρογγυλοποιημένες περίπου στο 1 χλμ. ');
        kVeh.replaceChildren(lab,
          el('div', { class: 'val' }, el('span', { class: 'num bd-cy' }, String(on.length)), el('span', { class: 'chipu' }, T('of ' + dv.length, 'από ' + dv.length)), moving != null ? el('span', { class: 'chipu' }, exactNow ? T(moving + ' moving now', moving + ' σε κίνηση τώρα') : T(moving + ' moving about ' + delayH + ' h ago', moving + ' σε κίνηση πριν από περίπου ' + delayH + ' ώρες')) : null),
          el('p', { class: 'sub' }, T('Vehicle sensors that sent a reading in the last hour. ', 'Αισθητήρες οχημάτων που έστειλαν μέτρηση την τελευταία ώρα. '), delayNote, ready('vehicles') ? inl('vehicles', T('Vehicles', 'Οχήματα')) : null), g);
      }

      /* ---------- paint: 24 hour chart ---------- */
      function bucketMean(perDevice) {   // perDevice: [[{t, v}]] -> [{t, v}] in 30-minute slots, mean of the per-device means
        const slots = new Map();
        perDevice.forEach((pts, di) => (pts || []).forEach((p) => {
          const k = Math.floor(p.t / 1800000), s = slots.get(k) || new Map(), e = s.get(di) || [0, 0];
          e[0] += p.v; e[1]++; s.set(di, e); slots.set(k, s);
        }));
        return [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([k, s]) => ({ t: k * 1800000 + 900000, v: mean([...s.values()].map((e) => e[0] / e[1])) }));
      }
      function paintChart() {
        chartHead.replaceChildren(el('div', { class: 'bd-eb' }, T('Last 24 hours · temperature', 'Τελευταίες 24 ώρες · θερμοκρασία')),
          el('h3', null, T('Our sensors next to the Met Office', 'Οι αισθητήρες μας δίπλα στη Μετεωρολογική')));
        if (!R.devices) return;
        if (!R.devices.ok) { chartBox.replaceChildren(errBox(T('The sensors could not be loaded, so there is no chart. ', 'Δεν φορτώθηκαν οι αισθητήρες, οπότε δεν υπάρχει γράφημα. '))); return; }
        if (!midsOf('temp').length) { chartBox.replaceChildren(el('div', { class: 'empty' }, T('The sensors report no temperature yet, so there is nothing to compare with the Met Office.', 'Οι αισθητήρες δεν στέλνουν ακόμα θερμοκρασία, οπότε δεν υπάρχει τίποτα για σύγκριση με τη Μετεωρολογική.'))); return; }
        if (st.series === 'loading' || !st.series) { chartBox.replaceChildren(loadingBox()); return; }
        if (st.series === 'error') { chartBox.replaceChildren(errBox(T('The 24-hour history could not be loaded.', 'Δεν φορτώθηκε το ιστορικό 24 ωρών.'))); return; }
        const eu = Object.keys(st.series), ours = bucketMean(eu.map((e) => st.series[e]));
        const series = [], notes = [];
        const nOurs = eu.filter((e) => st.series[e] && st.series[e].length).length;
        if (ours.length > 1) series.push({ name: T('Our sensors (mean of ' + nOurs + ')', 'Οι αισθητήρες μας (μέσος όρος ' + nOurs + ')'), color: SCChart.COLORS[1], pts: ours, area: true });
        const met = st.met && st.met.pts && st.met.pts.length > 1 ? st.met : null;
        if (met) { series.push({ name: T('Met Office (mean of ' + met.names.length + ' stations)', 'Μετεωρολογική (μέσος όρος ' + met.names.length + ' σταθμών)'), color: SCChart.COLORS[0], pts: met.pts, dash: true }); notes.push(T('Met Office stations nearest the schools: ' + met.names.join(', ') + '.', 'Σταθμοί της Μετεωρολογικής πιο κοντά στα σχολεία: ' + met.names.join(', ') + '.')); }
        else notes.push(st.met === 'loading' ? T('Loading the Met Office history…', 'Φόρτωση ιστορικού Μετεωρολογικής…') : T('The Met Office history is still being collected on this server, so only our sensors are drawn.', 'Το ιστορικό της Μετεωρολογικής συλλέγεται ακόμα σε αυτόν τον διακομιστή, οπότε σχεδιάζονται μόνο οι αισθητήρες μας.'));
        if (!series.length) { chartBox.replaceChildren(el('div', { class: 'empty' }, T('Not enough readings in the last 24 hours to draw a chart yet.', 'Δεν υπάρχουν αρκετές μετρήσεις στις τελευταίες 24 ώρες για γράφημα ακόμα.'))); return; }
        const box = el('div');
        chartBox.replaceChildren(box, el('p', { class: 'bd-note' }, T('Each point is the mean of the readings in a 30-minute slot. The sensors are not all in one place (buses move), so the lines are not expected to match. ', 'Κάθε σημείο είναι ο μέσος όρος των μετρήσεων σε διάστημα 30 λεπτών. Οι αισθητήρες δεν βρίσκονται όλοι στο ίδιο σημείο (τα λεωφορεία κινούνται), οπότε οι γραμμές δεν αναμένεται να ταυτίζονται. ') + notes.join(' '), ' ', ready('weather') ? inl('weather', T('Met Office record', 'Μετεωρολογικό αρχείο')) : null));
        const narrow = (chartBox.clientWidth || 720) < 640;
        chartNarrow = narrow;
        SCChart.line(box, series, { unit: '°C', dec: 1, w: narrow ? Math.max(300, Math.round(chartBox.clientWidth)) : 720, h: narrow ? 250 : 260, gap: 5400000, label: T('Temperature, last 24 hours', 'Θερμοκρασία, τελευταίες 24 ώρες'), latest: T('Latest ', 'Τελευταία '), empty: T('Not enough readings for this period yet.', 'Δεν υπάρχουν ακόμα αρκετές μετρήσεις.') });
      }

      /* ---------- paint: ticker (only real events) ---------- */
      function paintTicker() {
        const ev = [], now = Date.now();
        devices().forEach((d) => {
          const m = seenMs(d), s = stateOf(d, now);
          if (s === 'quiet') ev.push({ t: m, who: d.name, what: T('went quiet, last reading ' + SC.ago(m), 'σίγησε, τελευταία μέτρηση ' + SC.ago(m)) });
          else if (s === 'off' && m) ev.push({ t: m, who: d.name, what: T('offline since ' + SC.date(m), 'εκτός λειτουργίας από ' + SC.date(m)) });
        });
        const wh = val('warnHist');
        if (Array.isArray(wh)) {
          const none = (x) => String((x && x.text) || '').replace(/\s+/g, ' ').trim().length < 40;
          const clip = (x) => String(x.text || '').replace(/\s+/g, ' ').replace(/^issued weather warnings\s*/i, '').trim().slice(0, 90);
          wh.forEach((v, i) => {
            const prev = wh[i - 1];
            if (!prev) { if (!none(v)) ev.push({ t: v.t, who: T('Met Office', 'Μετεωρολογική'), what: T('warning in force: ' + clip(v), 'προειδοποίηση σε ισχύ: ' + clip(v)) }); return; }
            if (none(prev) && !none(v)) ev.push({ t: v.t, who: T('Met Office', 'Μετεωρολογική'), what: T('warning issued: ' + clip(v), 'εκδόθηκε προειδοποίηση: ' + clip(v)) });
            else if (!none(prev) && none(v)) ev.push({ t: v.t, who: T('Met Office', 'Μετεωρολογική'), what: T('warnings ended, none in force', 'οι προειδοποιήσεις έληξαν, καμία σε ισχύ') });
            else if (!none(v)) ev.push({ t: v.t, who: T('Met Office', 'Μετεωρολογική'), what: T('warning text changed: ' + clip(v), 'άλλαξε το κείμενο προειδοποίησης: ' + clip(v)) });
          });
        }
        ev.sort((a, b) => b.t - a.t);
        const lead = el('span', { class: 'tk lead' }, T('Latest on the board', 'Τελευταία στον πίνακα'));
        if (!ev.length) { ticker.replaceChildren(lead, el('span', { class: 'tk' }, T('No events yet. A line appears here when a warning changes or a sensor goes quiet.', 'Κανένα γεγονός ακόμα. Μια γραμμή εμφανίζεται εδώ όταν αλλάζει μια προειδοποίηση ή ένας αισθητήρας σιωπά.'))); return; }
        ticker.replaceChildren(lead, ...ev.slice(0, 6).map((e) => el('span', { class: 'tk' }, el('span', { class: 'tm' }, when(e.t)), el('span', { class: 'nm' }, e.who), e.what)));
      }

      function paintAll() {
        [paintFresh, paintLede, paintMap, paintRing, paintWarn, paintTemp, paintAir, paintVeh, paintChart, paintTicker].forEach((fn) => {
          try { fn(); } catch (e) { console.error('board: ' + fn.name, e); }
        });
      }

      /* ---------- data ---------- */
      async function loadExtras() {
        // slower things: 24 h series of the sensors, the Met Office history, the open air-quality feeds
        const dv = devices(), now = Date.now();
        const needSeries = !st.series || st.series === 'error' || now - seriesAt > 600000;
        const jobs = [];
        if (needSeries) {
          const tmids = midsOf('temp');
          dv.slice(0, 30).forEach((d) => { const m = (d.measurements || []).map(String).find((x) => tmids.includes(x)); if (m) jobs.push({ eui: d.eui, mid: m }); });
          if (jobs.length) {
            if (!st.series) st.series = 'loading';
            const res = await pool(jobs, 4, async (j) => {
              const rows = await SC.cached('/api/series?eui=' + encodeURIComponent(j.eui) + '&mid=' + encodeURIComponent(j.mid) + '&days=1', 300000);
              return (Array.isArray(rows) ? rows : []).map((p) => ({ t: Date.parse(p.t), v: Number(p.v) })).filter((p) => fin(p.t) && fin(p.v));
            });
            if (!alive) return;
            if (res.every((r) => r === null)) st.series = st.series === 'loading' ? 'error' : st.series;
            else { st.series = {}; jobs.forEach((j, i) => { if (res[i]) st.series[j.eui] = res[i]; }); seriesAt = Date.now(); }
          } else st.series = {};
          paintVeh(); paintChart();
        }
        // Met Office: the station nearest each school, last 24 hours of temperature
        const cy = val('cydom');
        if (cy && Array.isArray(cy.points) && (!st.met || st.met === 'error' || needSeries)) {
          if (!st.met) st.met = 'loading';
          const withT = cy.points.filter((p) => fin(p.temp) && fin(p.lat) && fin(p.lng));
          const pick = new Map();
          ISLAND.schools.forEach((s) => {
            const best = withT.slice().sort((a, b) => Math.hypot(a.lat - s.lat, (a.lng - s.lng) * 0.82) - Math.hypot(b.lat - s.lat, (b.lng - s.lng) * 0.82))[0];
            if (best) pick.set(best.id, best);
          });
          const sts = [...pick.values()];
          const res = await pool(sts, 4, async (p) => {
            const h = await SC.cached('/api/cydom/history?station=' + encodeURIComponent(p.id) + '&hours=24&keys=temp', 300000);
            const i = h && Array.isArray(h.keys) ? h.keys.indexOf('temp') : -1;
            if (i < 0) return [];
            return (h.rows || []).map((r) => ({ t: r[0], v: r[i + 1] })).filter((x) => fin(x.t) && fin(x.v));
          });
          if (!alive) return;
          const got = sts.map((p, i) => ({ p, pts: res[i] })).filter((x) => x.pts && x.pts.length);
          st.met = got.length ? { names: got.map((x) => x.p.name), pts: bucketMean(got.map((x) => x.pts)) } : { names: [], pts: [] };
          paintTemp(); paintChart();
        }
        // air quality: only when no school sensor reports PM2.5. The model and the open sensors are asked together.
        if (!midsOf('pm25').length) {
          if (!st.airApi && !st.open) { st.airApi = 'loading'; st.open = 'loading'; paintAir(); }
          await Promise.all([
            settle(SC.cached('/api/air', 600000)).then((a) => { if (alive) { st.airApi = a.ok ? a.v : null; paintAir(); } }),
            settle(SC.cached('/api/opensensors', 300000)).then((o) => { if (alive) { st.open = o.ok ? o.v : null; paintAir(); } }),
          ]);
        } else paintAir();
      }

      async function refresh(manual) {
        if (busy || !alive) return;
        busy = true;
        try {
          if (manual) { ringBody.replaceChildren(loadingBox()); }
          const [cfgR, devR, latR, cyR, warnR, whR, trR] = await Promise.all([
            settle(SC.cached('/api/config', 300000)), settle(SC.cached('/api/devices', 20000)), settle(SC.cached('/api/latest', 20000)),
            settle(SC.cached('/api/cydom', 120000)), settle(SC.cached('/api/dom/page?name=warnings', 120000)),
            settle(SC.cached('/api/dom/pages/history?name=warnings&days=30', 120000)), settle(SC.cached('/api/trails?hours=24&mid=4097', 120000))]);
          if (!alive) return;
          R.cfg = cfgR; R.devices = devR; R.latest = latR; R.cydom = cyR; R.warn = warnR; R.warnHist = whR; R.trails = trR;
          if (!devR.ok && R.devices) R.devices = devR;
          paintAll();
          await loadExtras();
        } catch (e) { console.error('board refresh', e); } finally { busy = false; }
      }

      // the chart is drawn at the width of its box on a phone, so its labels stay readable: redraw when the box crosses that line
      const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (alive && chartNarrow != null && (chartBox.clientWidth < 640) !== chartNarrow) paintChart(); }, 200); };
      window.addEventListener('resize', onResize);
      refresh(false);
      timers.push(setInterval(() => refresh(false), 60000));
      return () => { alive = false; clearTimeout(rz); window.removeEventListener('resize', onResize); timers.forEach(clearInterval); };
    },
  });
})();
