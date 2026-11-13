/*
  Data layers, the "Mission control" view (used by pages/layers.js, after layers-live.js): SC.layersLive.core(host, api).
  One dark console built only from live numbers of GET /layers/api/live and /layers/api/replay:
    - a grid with one tile per layer (green: answering, red: quiet, dashed: not connected yet), with its value
    - the core: a turning sphere of points, one colour per kind of source, sized by how many layers are answering. On its left the
      measurements that several layers share (the "rivers"), each with its range in the chosen city; on its right the four cities.
      Streams of dots run from every measurement into the core and from the core to every city. A measurement whose sources
      differ sends red dots and makes the core's inner column shake.
    - the wind and the fine particles of the model's grid, west to east, as two rows of bars
    - the outdoor temperature of the four cities over the saved day
  Press a measurement, a city or a tile to read it in words. No vehicle position is used anywhere.
  Motion stops for reduced motion, off screen and in a hidden tab.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  const isEl = () => SC.lang === 'el';
  const nm = (l) => (isEl() && l.nameEl) || l.name;
  const lab = (a) => (Array.isArray(a) ? a[isEl() ? 1 : 0] : a) || '';
  const still = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COL = { own: '#F2A56B', official: '#4CCBEA', model: '#B6A7F0', context: '#7FD3A0', bad: '#FF6B5E', ok: '#5EE0A8' };
  const RGB = { own: [242, 165, 107], official: [76, 203, 234], model: [182, 167, 240], context: [127, 211, 160] };
  const isLive = (l) => l.state === 'live' || l.state === 'late';
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const setVar = (e, k, v) => e.style.setProperty(k, v);
  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const SHORT = { temperature: ['Temperature', 'Θερμοκρασία'], relative_humidity: ['Humidity', 'Υγρασία'], wind_speed: ['Wind', 'Άνεμος'], pressure: ['Pressure', 'Πίεση'], co2: ['CO₂', 'CO₂'], pm25: ['Fine particles', 'Λεπτά σωματίδια'], pm10: ['Coarse particles', 'Χονδρά σωματίδια'], sea_surface_temperature: ['Sea heat', 'Ζέστη θάλασσας'], aerosol_optical_depth: ['Haze', 'Θολούρα'], ozone: ['Ozone', 'Όζον'], solar_irradiance: ['Sunshine', 'Ήλιος'] };
  const shortOf = (r) => lab(SHORT[r.variable] || r.label);
  function spark(values, col, w, hh) {
    const s = sv('svg', { viewBox: '0 0 ' + w + ' ' + hh, class: 'mc-sp', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
    const v = (values || []).filter((x) => x != null && isFinite(x));
    if (v.length < 2) { s.append(sv('line', { x1: 0, x2: w, y1: hh / 2, y2: hh / 2, stroke: col, 'stroke-opacity': 0.35, 'stroke-dasharray': '2 4' })); return s; }
    const lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1;
    const d = v.map((x, i) => (i ? 'L' : 'M') + ((i / (v.length - 1)) * w).toFixed(1) + ' ' + (hh - 3 - ((x - lo) / sp) * (hh - 6)).toFixed(1)).join('');
    s.append(sv('path', { d: d + 'L' + w + ' ' + hh + 'L0 ' + hh + 'Z', fill: col, 'fill-opacity': 0.16 }), sv('path', { d, fill: 'none', stroke: col, 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke' }));
    return s;
  }

  function core(host, api) {
    let live = null, replay = null, dead = false, raf = 0, visible = true, lastT = 0, sel = null, replayAt = 0;
    const grid = h('div', { class: 'mc-grid' });
    const canvas = h('canvas', { class: 'mc-cv', 'aria-hidden': 'true' });
    const ins = h('div', { class: 'mc-ins' }), outs = h('div', { class: 'mc-outs' });
    const hud = h('div', { class: 'mc-hud' });
    const stage = h('div', { class: 'mc-core' }, canvas, ins, h('div', { class: 'mc-mid' }, hud), outs);
    const info = h('p', { class: 'mc-info', 'aria-live': 'polite' });
    const bars = h('div', { class: 'mc-panel mc-bars' }), day = h('div', { class: 'mc-panel mc-day' });
    host.replaceChildren(h('div', { class: 'mc' },
      h('div', { class: 'mc-top' }, h('h3', null, T('Mission control', 'Κέντρο ελέγχου')), h('span', { class: 'lv-live' }, h('i'), T('Live', 'Ζωντανά')), h('span', { class: 'mc-sub' }, T('every number here is live', 'κάθε αριθμός εδώ είναι ζωντανός'))),
      h('div', { class: 'mc-panel' }, h('div', { class: 'mc-ph' }, h('b', null, T('Layer grid', 'Πλέγμα στρωμάτων')), h('span', null, T('one tile per layer', 'ένα πλακίδιο ανά στρώμα'))), grid),
      h('div', { class: 'mc-panel mc-stagep' }, h('div', { class: 'mc-ph' }, h('b', null, T('The core', 'Ο πυρήνας')), h('span', null, T('measurements flow in, findings flow out to the cities', 'οι μετρήσεις μπαίνουν, τα ευρήματα βγαίνουν προς τις πόλεις'))), stage, info),
      h('div', { class: 'mc-row2' }, bars, day)));

    /* ---------- the sphere and the streams (canvas) ---------- */
    const N = 1500, pts = new Float32Array(N * 3), grp = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * 2.399963; pts[i * 3] = Math.cos(a) * r; pts[i * 3 + 1] = y; pts[i * 3 + 2] = Math.sin(a) * r; }
    let anchors = { ins: [], outs: [], cx: 0, cy: 0, R: 0, w: 0, h: 0 }, packets = [], rot = 0, shake = 0, energy = 0.5;
    const ORDER = ['own', 'official', 'model', 'context'];
    function colourPoints() {   // the share of points of each colour is the share of answering layers of each kind
      const on = live.layers.filter(isLive), n = on.length || 1;
      const cut = []; let acc = 0;
      ORDER.forEach((g) => { acc += on.filter((l) => l.group === g).length / n; cut.push(acc); });
      for (let i = 0; i < N; i++) { const u = ((i * 0.61803398875) % 1); grp[i] = Math.max(0, cut.findIndex((c) => u < c)); }
      energy = clamp(on.length / Math.max(1, live.layers.filter((l) => l.state !== 'planned' && l.state !== 'candidate').length), 0.15, 1);
    }
    function measure() {
      const st = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = st.width, hh = st.height;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
      const mid = stage.querySelector('.mc-mid').getBoundingClientRect();
      const cx = mid.left - st.left + mid.width / 2, cy = mid.top - st.top + mid.height / 2, R = Math.min(mid.width, mid.height) * 0.44;
      const horizontal = mid.width < st.width - 40;   // inputs left and outputs right; on a narrow screen they are above and below
      const edge = (el, first) => { const r = el.getBoundingClientRect(); return horizontal ? { x: (first ? r.right : r.left) - st.left, y: r.top - st.top + r.height / 2 } : { x: r.left - st.left + r.width / 2, y: (first ? r.bottom : r.top) - st.top }; };
      anchors = { cx, cy, R, w, h: hh, horizontal, ins: [...ins.children].map((e) => ({ ...edge(e, true), key: e.dataset.k, state: e.dataset.s })), outs: [...outs.children].map((e) => ({ ...edge(e, false), key: e.dataset.k })) };
    }
    const curve = (a, b, t, horizontal) => {   // an S-shaped path from a to b
      const c1 = horizontal ? { x: (a.x + b.x) / 2, y: a.y } : { x: a.x, y: (a.y + b.y) / 2 }, c2 = horizontal ? { x: (a.x + b.x) / 2, y: b.y } : { x: b.x, y: (a.y + b.y) / 2 };
      const u = 1 - t;
      return [u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y];
    };
    const lit = (kind, key) => !sel || (sel.kind === kind && sel.id === key);
    function strokeCurve(ctx, a, b, horizontal) {
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if (horizontal) ctx.bezierCurveTo((a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y, b.x, b.y); else ctx.bezierCurveTo(a.x, (a.y + b.y) / 2, b.x, (a.y + b.y) / 2, b.x, b.y);
      ctx.stroke();
    }
    function paint(dt, moving) {
      const A = anchors, ctx = canvas.getContext('2d'), k = canvas.width / (A.w || 1);
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, A.w, A.h);
      const centre = { x: A.cx, y: A.cy };
      // the paths
      ctx.lineWidth = 1;
      A.ins.forEach((a) => { const on = lit('river', a.key) || (sel && sel.kind === 'city'); ctx.strokeStyle = a.state === 'differ' ? 'rgba(255,107,94,' + (on ? 0.5 : 0.1) + ')' : 'rgba(126,224,192,' + (on ? 0.38 : 0.08) + ')'; strokeCurve(ctx, a, { x: A.cx + (a.x < A.cx ? -A.R * 0.9 : A.R * 0.9) * (A.horizontal ? 1 : 0), y: A.cy + (A.horizontal ? 0 : (a.y < A.cy ? -A.R * 0.9 : A.R * 0.9)) }, A.horizontal); });
      A.outs.forEach((b) => { const on = lit('city', b.key) || (sel && sel.kind === 'river'); ctx.strokeStyle = 'rgba(247,196,107,' + (on ? 0.42 : 0.1) + ')'; strokeCurve(ctx, { x: A.cx + (A.horizontal ? A.R * 0.9 : 0), y: A.cy + (A.horizontal ? 0 : A.R * 0.9) }, b, A.horizontal); });
      // the sphere: points turned round a tilted axis, nearer points brighter
      if (moving) rot += dt * 0.32;
      const sinR = Math.sin(rot), cosR = Math.cos(rot), tilt = 0.42, sinT = Math.sin(tilt), cosT = Math.cos(tilt);
      const jit = shake * 0.035;
      for (let i = 0; i < N; i++) {
        let x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
        const x1 = x * cosR + z * sinR, z1 = -x * sinR + z * cosR;
        const y2 = y * cosT - z1 * sinT, z2 = y * sinT + z1 * cosT;
        const depth = (z2 + 1) / 2, c = RGB[ORDER[grp[i]]];
        const px = A.cx + x1 * A.R * (1 + (jit ? (Math.sin(i * 12.9898 + rot * 40) * jit) : 0)), py = A.cy + y2 * A.R;
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.16 + depth * (0.45 + 0.4 * energy)).toFixed(2) + ')';
        const s = 0.9 + depth * 1.9;
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      }
      // the inner column: a twisting thread of light, steady when the sources agree, restless when some differ
      ctx.lineWidth = 1.4;
      for (let strand = 0; strand < 3; strand++) {
        ctx.beginPath();
        for (let j = 0; j <= 40; j++) {
          const t = j / 40, yy = (t - 0.5) * 1.7, tw = Math.sin(t * Math.PI), a = rot * 2.2 + t * 7 + strand * 2.094;
          const wob = shake * 0.12 * Math.sin(rot * 9 + j * 0.9 + strand);
          const px = A.cx + (Math.cos(a) * 0.16 * tw + wob) * A.R, py = A.cy + yy * A.R * 0.95;
          if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.strokeStyle = shake > 0.3 ? 'rgba(255,170,150,' + (0.35 + strand * 0.12) + ')' : 'rgba(255,233,196,' + (0.35 + strand * 0.12) + ')';
        ctx.stroke();
      }
      // the orbit ring
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(A.cx, A.cy, A.R * 1.22, A.R * 0.34, -0.35, 0, 6.2832); ctx.stroke();
      const oa = rot * 1.7; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(A.cx + Math.cos(oa) * A.R * 1.22 * Math.cos(-0.35) - Math.sin(oa) * A.R * 0.34 * Math.sin(-0.35), A.cy + Math.cos(oa) * A.R * 1.22 * Math.sin(-0.35) + Math.sin(oa) * A.R * 0.34 * Math.cos(-0.35), 2.4, 0, 6.2832); ctx.fill();
      // the travelling dots
      for (const p of packets) {
        const a = p.inp ? A.ins[p.i] : null, b = p.inp ? null : A.outs[p.i];
        if ((p.inp && !a) || (!p.inp && !b)) { p.t = 2; continue; }
        const from = p.inp ? a : { x: A.cx + (A.horizontal ? A.R * 0.9 : 0), y: A.cy + (A.horizontal ? 0 : A.R * 0.9) };
        const to = p.inp ? { x: A.cx - (A.horizontal ? A.R * 0.9 : 0), y: A.cy - (A.horizontal ? 0 : A.R * 0.9) } : b;
        const [x, y] = curve(from, to, clamp(p.t, 0, 1), A.horizontal);
        const on = p.inp ? (lit('river', a.key) || (sel && sel.kind === 'city')) : (lit('city', b.key) || (sel && sel.kind === 'river'));
        const col = p.inp ? (a.state === 'differ' ? '255,107,94' : '126,224,192') : '247,196,107';
        ctx.fillStyle = 'rgba(' + col + ',' + (on ? 0.95 : 0.12) + ')'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(' + col + ',' + (on ? 0.2 : 0.03) + ')'; ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.2832); ctx.fill();
      }
    }
    function step(dt) {
      const A = anchors;
      if (packets.length < 90 && Math.random() < dt * (4 + A.ins.length * 1.6)) { const inp = Math.random() < 0.62 && A.ins.length; const n = inp ? A.ins.length : A.outs.length; if (n) packets.push({ inp: Boolean(inp), i: Math.floor(Math.random() * n), t: 0, sp: 0.45 + Math.random() * 0.3 }); }
      for (const p of packets) p.t += dt * p.sp;
      packets = packets.filter((p) => p.t < 1);
      const target = A.ins.some((a) => a.state === 'differ') ? 1 : 0;
      shake += (target - shake) * Math.min(1, dt * 2);
    }
    function frame(t) {
      raf = 0;
      if (dead || !live || !visible || document.hidden) { lastT = 0; return; }
      const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016; lastT = t;
      step(dt); paint(dt, true);
      raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (dead || !live) return; measure(); if (still()) { shake = anchors.ins.some((a) => a.state === 'differ') ? 1 : 0; paint(0, false); return; } if (!raf) raf = requestAnimationFrame(frame); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => kick()) : null; if (ro) ro.observe(stage);
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); }) : null; if (io) io.observe(stage);
    const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);

    /* ---------- the panels ---------- */
    const city = () => api.city();
    function say() {
      if (!sel) { info.textContent = T('Green streams are measurements whose sources agree in ' + lab(CITY[city()] || [city(), city()]) + '. Red streams are measurements whose sources differ: the thread inside the core gets restless. Gold streams carry the findings to the cities.', 'Οι πράσινες ροές είναι μετρήσεις που οι πηγές τους συμφωνούν (' + lab(CITY[city()] || [city(), city()]) + '). Οι κόκκινες είναι μετρήσεις που οι πηγές τους διαφέρουν: το νήμα μέσα στον πυρήνα γίνεται ανήσυχο. Οι χρυσές ροές μεταφέρουν τα ευρήματα στις πόλεις.'); return; }
      if (sel.kind === 'river') {
        const r = live.rivers.find((x) => x.variable === sel.id); if (!r) { sel = null; return say(); }
        const c = r.cities[city()], cn = lab(CITY[city()] || [city(), city()]);
        const names = r.sources.map((id) => nm(live.layers.find((l) => l.id === id) || { name: id })).join(', ');
        info.replaceChildren(h('b', null, lab(r.label)), ': ' + names + '. ' + (!c ? T('Only one of them has a reading for ' + cn + ' right now.', 'Μόνο ένα από αυτά έχει μέτρηση για: ' + cn + ' αυτή τη στιγμή.') : c.state === 'differ' ? T('In ' + cn + ' they differ: ' + num(c.low) + ' to ' + num(c.high) + ' ' + r.unit + ', more than the ' + num(c.tolerance) + ' ' + r.unit + ' we accept.', cn + ': διαφέρουν, ' + num(c.low) + ' έως ' + num(c.high) + ' ' + r.unit + ', περισσότερο από τα ' + num(c.tolerance) + ' ' + r.unit + ' που δεχόμαστε.') : c.state === 'agree' ? T('In ' + cn + ' they agree: ' + num(c.low) + ' to ' + num(c.high) + ' ' + r.unit + '.', cn + ': συμφωνούν, ' + num(c.low) + ' έως ' + num(c.high) + ' ' + r.unit + '.') : T('In ' + cn + ' they read ' + num(c.low) + ' to ' + num(c.high) + ' ' + r.unit + '. We have no agreed tolerance for this one yet.', cn + ': δείχνουν ' + num(c.low) + ' έως ' + num(c.high) + ' ' + r.unit + '. Δεν έχουμε ακόμη συμφωνημένη ανοχή.')));
      } else {
        const rs = (live.rivers || []).filter((r) => r.cities[sel.id]);
        info.replaceChildren(h('b', null, lab(CITY[sel.id])), ': ' + T(((live.cities[sel.id] || {}).rows || []).length + ' readings reach the core for this city. ', ((live.cities[sel.id] || {}).rows || []).length + ' μετρήσεις φτάνουν στον πυρήνα για αυτή την πόλη. ') + (rs.filter((r) => r.cities[sel.id].state === 'agree').length ? T('Sources agree on: ', 'Οι πηγές συμφωνούν για: ') + rs.filter((r) => r.cities[sel.id].state === 'agree').map(shortOf).join(', ') + '. ' : '') + (rs.filter((r) => r.cities[sel.id].state === 'differ').length ? T('They differ on: ', 'Διαφέρουν για: ') + rs.filter((r) => r.cities[sel.id].state === 'differ').map(shortOf).join(', ') + '.' : ''));
      }
    }
    function pick(kind, id) { sel = sel && sel.kind === kind && sel.id === id ? null : { kind, id }; if (kind === 'city' && sel && api.setCity) { api.setCity(id); return; } drawCore(); say(); kick(); }
    function drawGrid() {
      const order = { live: 0, late: 0, down: 1, off: 1, checking: 1, planned: 2, candidate: 3 };
      const ls = live.layers.slice().sort((a, b) => (order[a.state] ?? 4) - (order[b.state] ?? 4) || ['own', 'official', 'model', 'context'].indexOf(a.group) - ['own', 'official', 'model', 'context'].indexOf(b.group));
      grid.replaceChildren(...ls.map((l) => {
        const on = isLive(l), quiet = l.state === 'down' || l.state === 'off' || l.state === 'checking';
        const val = on ? (l.head ? num(l.head.value) : l.sensors ? l.fresh + '/' + l.sensors : l.count ? num(l.count) : '✓') : quiet ? '×' : '·';
        const unit = on ? (l.head ? l.head.unit : l.period ? T('context', 'πλαίσιο') : '') : quiet ? T('quiet', 'σιωπή') : l.state === 'planned' ? T('planned', 'σχέδιο') : T('idea', 'ιδέα');
        const b = h('button', { type: 'button', class: 'mc-tile ' + (on ? 'on' : quiet ? 'quiet' : 'wait'), title: nm(l), 'aria-label': nm(l) + ': ' + (on ? val + ' ' + unit : unit), onclick: () => api.openLayer(l.id) }, h('small', null, nm(l)), h('b', null, val), h('i', null, unit));
        setVar(b, '--c', COL[l.group]); setVar(b, '--d', (-(l.id.length % 7) * 0.4) + 's');
        return b;
      }));
    }
    function drawCore() {
      const rv = (live.rivers || []).slice(0, 6);
      ins.replaceChildren(...rv.map((r) => {
        const c = r.cities[city()], st = c ? c.state : 'none';
        const src = live.layers.find((l) => r.sources.includes(l.id) && l.head && l.head.variable === r.variable);
        const b = h('button', { type: 'button', class: 'mc-in ' + st + (sel && sel.kind === 'river' && sel.id === r.variable ? ' sel' : ''), 'data-k': r.variable, 'data-s': st, 'aria-pressed': sel && sel.kind === 'river' && sel.id === r.variable ? 'true' : 'false', onclick: () => pick('river', r.variable) },
          h('span', null, h('b', null, shortOf(r)), h('em', null, st === 'differ' ? T('differ', 'διαφέρουν') : st === 'agree' ? T('agree', 'συμφωνούν') : st === 'unknown' ? T('no rule yet', 'χωρίς κανόνα') : T('one source', 'μία πηγή'))),
          h('u', null, c ? (c.low === c.high ? num(c.low) : num(c.low) + ' – ' + num(c.high)) + ' ' + r.unit : '–'),
          spark(src ? src.spark : [], st === 'differ' ? COL.bad : COL.ok, 120, 26), h('small', null, T(r.sources.length + ' layers', r.sources.length + ' στρώματα')));
        return b;
      }));
      outs.replaceChildren(...Object.keys(CITY).map((id) => {
        const rs = (live.rivers || []).filter((r) => r.cities[id]), ag = rs.filter((r) => r.cities[id].state === 'agree').length, df = rs.filter((r) => r.cities[id].state === 'differ').length;
        const t = ((live.cities[id] || {}).rows || []).find((r) => r.variable === 'temperature' && r.env === 'outdoor' && !r.stale);
        return h('button', { type: 'button', class: 'mc-out' + (city() === id ? ' cur' : '') + (sel && sel.kind === 'city' && sel.id === id ? ' sel' : ''), 'data-k': id, 'aria-pressed': city() === id ? 'true' : 'false', onclick: () => pick('city', id) },
          h('b', null, lab(CITY[id])), h('u', null, t ? num(t.value) + ' °C' : '–'), h('small', null, h('i', { class: 'a' }), String(ag), ' ', T('agree', 'συμφ.'), '  ', h('i', { class: 'd' }), String(df), ' ', T('differ', 'διαφ.')));
      }));
      const on = live.layers.filter(isLive).length, reads = live.layers.filter((l) => isLive(l) && l.reads !== false).length;
      hud.replaceChildren(h('span', { class: 'tl' }, h('b', null, String(on)), T(' layers answering', ' στρώματα απαντούν')), h('span', { class: 'tr' }, h('b', null, String(reads)), T(' read by the brain', ' διαβάζει ο εγκέφαλος')), h('span', { class: 'bl' }, h('b', null, String((live.rivers || []).length)), T(' shared measurements', ' κοινές μετρήσεις')), h('span', { class: 'br' }, T('updated ', 'ενημέρωση ') + SC.time(live.at)));
    }
    function drawBars() {
      const w = (live.map.wind || []).slice().sort((a, b) => a.lng - b.lng), air = (live.map.air || []).slice().sort((a, b) => a.lng - b.lng);
      const mx = Math.max(1, ...w.map((p) => p.ws)), ma = Math.max(1, ...air.map((p) => p.pm25));
      const row = (list, f, cls) => h('div', { class: 'mc-brow ' + cls }, list.map((p) => { const e = h('i'); e.style.height = Math.max(4, f(p) * 100) + '%'; return e; }));
      bars.replaceChildren(...[h('div', { class: 'mc-ph' }, h('b', null, T('Across the island, west to east', 'Κατά μήκος του νησιού, από δύση προς ανατολή')), h('span', null, T('the model’s grid points', 'τα σημεία πλέγματος του μοντέλου'))),
        w.length ? h('div', { class: 'mc-bl' }, h('em', null, T('Wind, up to ', 'Άνεμος, έως ') + num(mx * 3.6) + ' km/h'), row(w, (p) => p.ws / mx, 'up')) : null,
        air.length ? h('div', { class: 'mc-bl' }, row(air, (p) => p.pm25 / ma, 'down'), h('em', null, T('Fine particles, up to ', 'Λεπτά σωματίδια, έως ') + num(ma) + ' µg/m³')) : null,
        !w.length && !air.length ? h('p', { class: 'lv-fine' }, T('The weather and air models are not answering right now.', 'Τα μοντέλα καιρού και αέρα δεν απαντούν αυτή τη στιγμή.')) : null].filter(Boolean));
    }
    function drawDay() {
      const W = 560, H = 150;
      const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'mc-dsvg', role: 'img', 'aria-label': T('Outdoor temperature of the four cities over the saved day', 'Εξωτερική θερμοκρασία των τεσσάρων πόλεων στη διάρκεια της αποθηκευμένης μέρας') });
      const n = replay ? replay.times.length : 0, series = [];
      if (n >= 2) Object.keys(CITY).forEach((c, i) => { const d = replay.cities[c]; if (d && d.air) series.push({ c, v: d.air.values, col: ['#F2A56B', '#4CCBEA', '#B6A7F0', '#7FD3A0'][i] }); });
      const all = series.flatMap((s) => s.v.filter((x) => x != null));
      if (all.length > 1) {
        const lo = Math.min(...all) - 0.5, hi = Math.max(...all) + 0.5;
        [0.25, 0.5, 0.75].forEach((f) => svg.append(sv('line', { x1: 0, x2: W, y1: H * f, y2: H * f, stroke: 'rgba(255,255,255,.07)' })));
        series.forEach((s) => { let d = '', pen = false; s.v.forEach((x, i) => { if (x == null) { pen = false; return; } d += (pen ? 'L' : 'M') + ((i / (n - 1)) * (W - 8) + 4).toFixed(1) + ' ' + (H - 8 - ((x - lo) / (hi - lo)) * (H - 16)).toFixed(1); pen = true; }); svg.append(sv('path', { d, fill: 'none', stroke: s.col, 'stroke-width': 2, 'stroke-linejoin': 'round', class: 'mc-dl' })); });
        day.replaceChildren(h('div', { class: 'mc-ph' }, h('b', null, T('Outdoor temperature, saved day', 'Εξωτερική θερμοκρασία, αποθηκευμένη μέρα')), h('span', null, SC.time(replay.times[0]) + ' – ' + T('now', 'τώρα') + ' · ' + num(lo + 0.5) + ' – ' + num(hi - 0.5) + ' °C')), svg,
          h('div', { class: 'mc-leg' }, series.map((s) => { const e = h('span', null, h('i'), lab(CITY[s.c])); setVar(e, '--c', s.col); return e; })));
      } else day.replaceChildren(h('div', { class: 'mc-ph' }, h('b', null, T('Outdoor temperature, saved day', 'Εξωτερική θερμοκρασία, αποθηκευμένη μέρα'))), h('p', { class: 'lv-fine' }, T('This fills as readings are saved, one every few minutes.', 'Γεμίζει όσο αποθηκεύονται μετρήσεις, μία κάθε λίγα λεπτά.')));
    }
    function loadReplay() { if (Date.now() - replayAt < 120000) return; replayAt = Date.now(); SC.api('/layers/api/replay').then((r) => { if (!dead) { replay = r; drawDay(); } }).catch(() => { replayAt = 0; }); }

    return {
      update(l) {
        live = l;
        if (sel && sel.kind === 'river' && !(l.rivers || []).some((r) => r.variable === sel.id)) sel = null;
        if (sel && sel.kind === 'city') sel = { kind: 'city', id: city() };
        colourPoints(); drawGrid(); drawCore(); drawBars(); drawDay(); say(); loadReplay();
        requestAnimationFrame(kick);
      },
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', onVis); },
    };
  }
  SC.layersLive = SC.layersLive || {};
  SC.layersLive.core = core;
})();
