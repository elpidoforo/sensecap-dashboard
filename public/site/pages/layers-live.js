/*
  Data layers, the live views (used by pages/layers.js):
    SC.layersLive.island(host, api)   the living island: wind, sea, haze, schools, official stations, newest satellite data, replay of the last day
    SC.layersLive.pulse(host, api)    the pulse board: one row per layer with its trend, value and the time to its next reading
    SC.layersLive.compare(host, api)  same question, every source: one measurement of one city from every layer that has it
    SC.layersLive.sky(host, api)      sky to ground: where each layer's data is born
  Each returns { update(live), destroy() }. `live` is the answer of GET /layers/api/live; api = { openLayer(id), city(), setCity(id), cities() }.
  Data: /layers/api/live, /layers/api/replay, /layers/api/compare. Needs window.ISLAND (island.js).
  Privacy: a vehicle is never drawn. Buses and cars are a count ("4 of 4 reporting") and a city-level number.
  Motion: everything that moves stops for people who ask for reduced motion, and while the tab or the view is hidden.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/layers-live.css');
  const isEl = () => SC.lang === 'el';
  const nm = (l) => (isEl() && l.nameEl) || l.name;
  const lab = (a) => (Array.isArray(a) ? a[isEl() ? 1 : 0] : a) || '';
  const still = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COL = { own: '#F2A56B', official: '#4CCBEA', model: '#B6A7F0', context: '#7FD3A0', bad: '#FF8B7D' };
  const GROUP = { own: ['Our sensors', 'Οι αισθητήρες μας'], official: ['Official stations', 'Επίσημοι σταθμοί'], model: ['Models and satellites', 'Μοντέλα και δορυφόροι'], context: ['City context', 'Πλαίσιο πόλης'] };
  const ORDER = ['own', 'official', 'model', 'context'];
  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const OWN = ['sensecap-classrooms', 'sensecap-buses', 'sensecap-cars'];
  const isLive = (l) => l.state === 'live' || l.state === 'late';
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const setVar = (e, k, v) => e.style.setProperty(k, v);
  // a length of time in a few characters: "14 s", "3 min", "2 h"
  function dur(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 90) return s + T(' s', ' δ.');
    const m = Math.round(s / 60);
    if (m < 90) return m + T(' min', ' λ.');
    const hr = Math.round(m / 60);
    if (hr < 48) return hr + T(' h', ' ώ.');
    return Math.round(hr / 24) + T(' days', ' ημ.');
  }
  const compass = (deg) => (isEl() ? ['Β', 'ΒΑ', 'Α', 'ΝΑ', 'Ν', 'ΝΔ', 'Δ', 'ΒΔ'] : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  // when a layer is expected to speak next: { p: share of the wait that is left (1 = just spoke), ms: time left, late }
  function nextOf(l, now) {
    if (!l.lastAt || !l.everyMs) return null;
    const left = l.lastAt + l.everyMs - now;
    return { p: clamp(left / l.everyMs, 0, 1), ms: left, late: left < -l.everyMs * 0.25 };
  }
  // one ticker for everything that counts down (rings, "in 14 s"): once a second, only while the tab is visible
  const tickers = new Set();
  let tickTimer = 0;
  function onTick(fn) {
    tickers.add(fn);
    if (!tickTimer) tickTimer = setInterval(() => { if (!document.hidden) tickers.forEach((f) => { try { f(Date.now()); } catch (e) { /* a view that is gone */ } }); }, 1000);
    return () => { tickers.delete(fn); if (!tickers.size) { clearInterval(tickTimer); tickTimer = 0; } };
  }
  const ring = (cls) => h('i', { class: 'lv-ring' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
  const liveBadge = () => h('span', { class: 'lv-live' }, h('i'), T('Live', 'Ζωντανά'));
  function sparkSvg(values, col, w, hgt, dead) {
    const svg = sv('svg', { viewBox: '0 0 ' + w + ' ' + hgt, width: w, height: hgt, class: 'lv-spark', 'aria-hidden': 'true' });
    const v = (values || []).filter((x) => x != null && isFinite(x));
    if (v.length < 2) { svg.append(sv('line', { x1: 4, x2: w - 4, y1: hgt / 2, y2: hgt / 2, stroke: col, 'stroke-opacity': 0.35, 'stroke-width': 2, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' })); return svg; }
    const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    const X = (i) => 4 + (i / (v.length - 1)) * (w - 12), Y = (x) => hgt - 5 - ((x - lo) / span) * (hgt - 10);
    const d = v.map((x, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1)).join('');
    svg.append(sv('path', { d: d + 'L' + X(v.length - 1).toFixed(1) + ' ' + hgt + 'L' + X(0).toFixed(1) + ' ' + hgt + 'Z', fill: col, 'fill-opacity': 0.13 }),
      sv('path', { d, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...(dead ? { 'stroke-dasharray': '3 4', opacity: 0.6 } : {}) }));
    if (!dead) svg.append(sv('circle', { class: 'lv-spark-halo', cx: X(v.length - 1), cy: Y(v[v.length - 1]), r: 7, fill: col, opacity: 0.25 }), sv('circle', { cx: X(v.length - 1), cy: Y(v[v.length - 1]), r: 3.4, fill: col }));
    return svg;
  }
  // what our own sensors say for one city: CO2 if a classroom has it, else the temperature
  function ownOf(live, cityId) {
    const rows = ((live.cities[cityId] || {}).rows || []).filter((r) => OWN.includes(r.source) && !r.stale);
    for (const variable of ['co2', 'temperature']) for (const src of OWN) { const r = rows.find((x) => x.source === src && x.variable === variable); if (r) return r; }
    return null;
  }
  const ownText = (r) => (r.variable === 'co2' ? 'CO₂ ' + num(r.value) + ' ppm' : num(r.value) + ' ' + r.unit);

  /* ================================================================== 1. the living island ================================== */
  function island(host, api) {
    const VB = [-10, -30, 1020, 660];
    const px = (x) => ((x - VB[0]) / VB[2]) * 100, py = (y) => ((y - VB[1]) / VB[3]) * 100;
    const P = (lng, lat) => ISLAND.project(lng, lat);
    let live = null, dead = false, replay = null, playing = 0, playIdx = -1, windScale = 1;
    const land = Object.keys(ISLAND.districts).map((k) => ISLAND.districts[k]).join('');

    /* --- the drawing under the wind --- */
    const defs = sv('defs', null,
      sv('filter', { id: 'lvBlurSea', x: '-30%', y: '-30%', width: '160%', height: '160%' }, sv('feGaussianBlur', { stdDeviation: 34 })),
      sv('filter', { id: 'lvBlurHaze', x: '-30%', y: '-30%', width: '160%', height: '160%' }, sv('feGaussianBlur', { stdDeviation: 26 })),
      sv('clipPath', { id: 'lvLand' }, sv('path', { d: land })));
    const gSea = sv('g', { filter: 'url(#lvBlurSea)', class: 'lv-sea' });
    const gHaze = sv('g', { filter: 'url(#lvBlurHaze)', 'clip-path': 'url(#lvLand)', class: 'lv-haze' });
    const base = sv('svg', { viewBox: VB.join(' '), class: 'lv-base', role: 'img', 'aria-label': T('Map of Cyprus with the live layers', 'Χάρτης της Κύπρου με τα ζωντανά στρώματα') },
      defs, gSea, sv('path', { d: land, fill: '#13263d' }), sv('path', { d: land, fill: 'rgba(255,255,255,.05)', stroke: 'rgba(143,227,247,.42)', 'stroke-width': 1 }), gHaze);
    const canvas = h('canvas', { class: 'lv-wind', 'aria-hidden': 'true' });
    const band = h('div', { class: 'lv-band', 'aria-hidden': 'true' });
    const marks = h('div', { class: 'lv-marks' });
    const chipWind = h('button', { class: 'lv-float lv-fw', type: 'button' }), chipSat = h('button', { class: 'lv-float lv-fs', type: 'button' }), chipSea = h('button', { class: 'lv-float lv-fsea', type: 'button' });
    const stage = h('div', { class: 'lv-map' }, base, canvas, band, marks, chipWind, chipSat, chipSea);
    const info = h('p', { class: 'lv-info', 'aria-live': 'polite' });
    const stamp = h('span', { class: 'lv-sub' });
    const clock = h('b', { class: 'lv-clock' });

    /* --- replay bar --- */
    const playBtn = h('button', { class: 'lv-play', type: 'button', onclick: () => (playing ? stopPlay() : startPlay()) });
    const bars = h('div', { class: 'lv-bars', 'aria-hidden': 'true' });
    const range = h('input', { type: 'range', min: '0', max: '0', value: '0', step: '1', class: 'lv-range', 'aria-label': T('Move through the last 24 hours', 'Κινήσου μέσα στις τελευταίες 24 ώρες'), oninput: () => { stopPlay(true); showAt(Number(range.value)); } });
    const ticks = h('div', { class: 'lv-ticks', 'aria-hidden': 'true' });
    const replayNote = h('p', { class: 'lv-fine' });
    const chips = h('div', { class: 'lv-chips' });
    const key = h('details', { class: 'lv-key' }, h('summary', null, T('How to read the motion', 'Πώς διαβάζεις την κίνηση')),
      h('div', null,
        h('div', null, h('b', null, T('Pulse ring', 'Δαχτυλίδι παλμού')), T('Each school pulses. A faster pulse means a fresher reading from our sensors.', 'Κάθε σχολείο πάλλεται. Πιο γρήγορος παλμός σημαίνει πιο φρέσκια μέτρηση από τους αισθητήρες μας.')),
        h('div', null, h('b', null, T('Wind streaks', 'Γραμμές ανέμου')), T('Short trails flow the way the weather model says the wind blows, faster where it is stronger.', 'Μικρές γραμμές κυλούν όπως λέει το μοντέλο καιρού ότι φυσά ο άνεμος, πιο γρήγορα όπου είναι δυνατότερος.')),
        h('div', null, h('b', null, T('Glow in the sea', 'Λάμψη στη θάλασσα')), T('The colour of the sea is its temperature: blue is cooler, green is warmer.', 'Το χρώμα της θάλασσας είναι η θερμοκρασία της: το μπλε είναι πιο δροσερό, το πράσινο πιο ζεστό.')),
        h('div', null, h('b', null, T('Violet band', 'Μοβ ζώνη')), T('It sweeps across when the newest satellite data arrives, and replays that pass.', 'Περνά πάνω από το νησί όταν φτάνουν τα νεότερα δορυφορικά δεδομένα και ξαναδείχνει εκείνο το πέρασμα.')),
        h('div', null, h('b', null, T('What is never drawn', 'Τι δεν σχεδιάζεται ποτέ')), T('Buses and cars. You only see how many of them are reporting.', 'Λεωφορεία και αυτοκίνητα. Βλέπεις μόνο πόσα από αυτά στέλνουν μετρήσεις.'))));
    host.replaceChildren(h('div', { class: 'lv-isl' },
      h('div', { class: 'lv-hd' }, h('h3', null, T('Cyprus, right now', 'Η Κύπρος, αυτή τη στιγμή')), liveBadge(), clock, stamp),
      stage, info,
      h('div', { class: 'lv-replay' }, playBtn, h('div', { class: 'lv-track' }, bars, range, ticks)),
      replayNote, chips, key));

    /* --- wind particles on the canvas --- */
    const GW = 27, GH = 17;   // a coarse grid of the wind over the map, filled from the model's grid points
    let field = null, parts = [], raf = 0, cw = 0, ch = 0, visible = true;
    function buildField() {
      const pts = ((live && live.map.wind) || []).map((p) => { const q = P(p.lng, p.lat); const a = (p.wd * Math.PI) / 180; return { x: q[0], y: q[1], u: -p.ws * Math.sin(a), v: p.ws * Math.cos(a) }; });   // wd is where the wind comes FROM; on screen y grows downward
      if (!pts.length) { field = null; return; }
      field = new Float32Array(GW * GH * 2);
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const x = VB[0] + (i / (GW - 1)) * VB[2], y = VB[1] + (j / (GH - 1)) * VB[3];
        let su = 0, svv = 0, sw = 0;
        for (const p of pts) { const d2 = (p.x - x) ** 2 + (p.y - y) ** 2 + 400; const w = 1 / (d2 * d2); su += p.u * w; svv += p.v * w; sw += w; }
        field[(j * GW + i) * 2] = su / sw; field[(j * GW + i) * 2 + 1] = svv / sw;
      }
    }
    function windAt(x, y) {   // x, y in map units; bilinear
      const fx = clamp(((x - VB[0]) / VB[2]) * (GW - 1), 0, GW - 1.001), fy = clamp(((y - VB[1]) / VB[3]) * (GH - 1), 0, GH - 1.001);
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
      const at = (ii, jj, k) => field[(jj * GW + ii) * 2 + k];
      const mix = (k) => (at(i, j, k) * (1 - tx) + at(i + 1, j, k) * tx) * (1 - ty) + (at(i, j + 1, k) * (1 - tx) + at(i + 1, j + 1, k) * tx) * ty;
      return [mix(0), mix(1)];
    }
    const spawn = (p) => { p.x = VB[0] + Math.random() * VB[2]; p.y = VB[1] + Math.random() * VB[3]; p.life = 40 + Math.random() * 90; return p; };
    function sizeCanvas() {
      const r = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      cw = Math.max(1, Math.round(r.width * dpr)); ch = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      const want = r.width < 520 ? 170 : 360;
      if (parts.length !== want) parts = Array.from({ length: want }, () => spawn({}));
    }
    function frame() {
      raf = 0;
      if (dead) return;
      if (!field || !visible || document.hidden) return;
      const ctx = canvas.getContext('2d'), kx = cw / VB[2], ky = ch / VB[3];
      ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = 'rgba(0,0,0,.93)'; ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, cw / 720);
      for (const p of parts) {
        const [u, v] = windAt(p.x, p.y), sp = Math.hypot(u, v);
        const nx = p.x + u * 0.55 * windScale, ny = p.y + v * 0.55 * windScale;
        ctx.strokeStyle = 'rgba(207,239,250,' + clamp(0.18 + sp * 0.06, 0.18, 0.6).toFixed(2) + ')';
        ctx.beginPath(); ctx.moveTo((p.x - VB[0]) * kx, (p.y - VB[1]) * ky); ctx.lineTo((nx - VB[0]) * kx, (ny - VB[1]) * ky); ctx.stroke();
        p.x = nx; p.y = ny;
        if (--p.life < 0 || nx < VB[0] || nx > VB[0] + VB[2] || ny < VB[1] || ny > VB[1] + VB[3]) spawn(p);
      }
      raf = requestAnimationFrame(frame);
    }
    function drawStill() {   // reduced motion: one picture of the wind instead of a film
      if (!field) return;
      const ctx = canvas.getContext('2d'), kx = cw / VB[2], ky = ch / VB[3];
      ctx.clearRect(0, 0, cw, ch); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, cw / 640); ctx.strokeStyle = 'rgba(207,239,250,.4)';
      for (let j = 1; j < 12; j++) for (let i = 1; i < 20; i++) {
        const x = VB[0] + (i / 20) * VB[2], y = VB[1] + (j / 12) * VB[3], [u, v] = windAt(x, y);
        ctx.beginPath(); ctx.moveTo((x - VB[0]) * kx, (y - VB[1]) * ky); ctx.lineTo((x + u * 5 - VB[0]) * kx, (y + v * 5 - VB[1]) * ky); ctx.stroke();
      }
    }
    const kick = () => { if (dead || !field) return; if (still()) { drawStill(); return; } if (!raf) raf = requestAnimationFrame(frame); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { sizeCanvas(); kick(); }) : null;
    if (ro) ro.observe(stage);
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); }) : null;
    if (io) io.observe(stage);
    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis);

    /* --- markers and labels --- */
    const ANCH = { lefkosia: 'nw', larnaka: 'e', limassol: 'e', paphos: 'ne' };
    const say = (text) => { info.textContent = text; };
    function drawMarks(own, airBy) {
      const kids = [];
      // official stations: a dot each; the ones nearest to a city also get a label on a wide screen
      const st = (live.map.stations || []).map((s) => ({ ...s, q: P(s.lng, s.lat) })).filter((s) => s.q[0] > 0 && s.q[0] < 1000 && s.q[1] > 0 && s.q[1] < 600);
      const near = new Set();
      (ISLAND.schools || []).forEach((sc) => { let best = null; st.forEach((s) => { const d = (s.lng - sc.lng) ** 2 + (s.lat - sc.lat) ** 2; if (!best || d < best.d) best = { s, d }; }); if (best) near.add(best.s); });
      const coldest = st.slice().sort((a, b) => a.temp - b.temp)[0]; if (coldest) near.add(coldest);
      st.forEach((s) => {
        const text = s.name + ': ' + num(s.temp) + ' °C' + (s.at ? ', ' + SC.ago(s.at) : '');
        const b = h('button', { class: 'lv-st' + (near.has(s) ? ' lv-st-l' : ''), type: 'button', title: text, 'aria-label': T('Official station ', 'Επίσημος σταθμός ') + text, onclick: () => say(T('Official station ', 'Επίσημος σταθμός ') + text) }, h('i'), near.has(s) ? h('span', null, s.name + ' ', h('b', null, num(s.temp) + '°')) : null);
        b.style.left = px(s.q[0]) + '%'; b.style.top = py(s.q[1]) + '%';
        kids.push(b);
      });
      (ISLAND.schools || []).forEach((sc) => {
        const q = P(sc.lng, sc.lat), r = own[sc.id], air = airBy[sc.id];
        const cn = lab(CITY[sc.id] || [sc.id, sc.id]);
        const fresh = r && r.ageMin != null ? r.ageMin : null;
        const text = r ? cn + ': ' + ownText(r) + (fresh != null ? ', ' + (fresh < 2 ? T('just now', 'μόλις τώρα') : T(fresh + ' min ago', 'πριν ' + fresh + ' λ.')) : '') + T(' (our sensors)', ' (οι αισθητήρες μας)') : cn + ': ' + T('no fresh reading from our sensors', 'καμία πρόσφατη μέτρηση από τους αισθητήρες μας');
        const b = h('button', { class: 'lv-sch lv-a-' + (ANCH[sc.id] || 'ne') + (r ? '' : ' lv-quiet'), type: 'button', 'aria-label': text, onclick: () => { say(text + (air != null ? T('. Outside: ', '. Έξω: ') + num(air) + ' °C' : '')); if (api.setCity) api.setCity(sc.id); } },
          h('i'), h('span', null, h('strong', null, cn), r ? h('b', null, ownText(r)) : h('em', null, T('quiet', 'σιωπή'))));
        b.style.left = px(q[0]) + '%'; b.style.top = py(q[1]) + '%';
        setVar(b, '--beat', (fresh == null ? 4 : fresh < 5 ? 1.6 : fresh < 30 ? 2.4 : 3.6) + 's');
        kids.push(b);
      });
      marks.replaceChildren(...kids);
    }
    function ramp(t) {   // sea temperature: cooler blue to warmer green
      const a = [46, 123, 214], b = [47, 183, 201], c = [111, 224, 176];
      const m = t < 0.5 ? [a, b, t * 2] : [b, c, (t - 0.5) * 2];
      return 'rgb(' + m[0].map((x, i) => Math.round(x + (m[1][i] - x) * m[2])).join(',') + ')';
    }
    function drawGlow() {
      const sea = live.map.sea || [];
      gSea.replaceChildren();
      if (sea.length) {
        const lo = Math.min(...sea.map((p) => p.sst)), hi = Math.max(...sea.map((p) => p.sst));
        sea.forEach((p) => { const q = P(p.lng, p.lat); gSea.append(sv('circle', { cx: q[0], cy: q[1], r: 78, fill: ramp(hi > lo ? (p.sst - lo) / (hi - lo) : 0.5), opacity: 0.55 })); });
      }
      gHaze.replaceChildren();
      (live.map.air || []).forEach((p) => { const q = P(p.lng, p.lat); const o = clamp((p.pm25 - 5) / 60, 0, 0.5); if (o > 0.03) gHaze.append(sv('circle', { cx: q[0], cy: q[1], r: 70, fill: COL.model, opacity: o.toFixed(2) })); });
    }
    function drawFloats() {
      const w = live.map.wind || [];
      if (w.length) {
        let u = 0, v = 0, s = 0; w.forEach((p) => { const a = (p.wd * Math.PI) / 180; u += Math.sin(a) * p.ws; v += Math.cos(a) * p.ws; s += p.ws; });
        const from = (Math.atan2(u, v) * 180) / Math.PI, kmh = (s / w.length) * 3.6;
        chipWind.replaceChildren(T('Wind ', 'Άνεμος '), h('b', null, num(kmh) + ' km/h'), T(' from ', ' από '), compass(from));
        chipWind.hidden = false; chipWind.onclick = () => api.openLayer('openmeteo-weather');
      } else chipWind.hidden = true;
      const sea = live.map.sea || [];
      if (sea.length) { chipSea.replaceChildren(T('Sea ', 'Θάλασσα '), h('b', null, num(sea.reduce((a, p) => a + p.sst, 0) / sea.length) + ' °C')); chipSea.hidden = false; chipSea.onclick = () => api.openLayer('openmeteo-marine'); } else chipSea.hidden = true;
      const sat = live.newestSatellite;
      if (sat) { chipSat.replaceChildren(T('Newest satellite data: ', 'Νεότερα δορυφορικά δεδομένα: '), h('b', null, nm(sat)), ', ' + SC.ago(sat.at)); chipSat.hidden = false; chipSat.onclick = () => api.openLayer(sat.id); } else chipSat.hidden = true;
      band.classList.toggle('on', Boolean(sat) && !still());
    }
    let untick = null;
    function drawChips() {
      const ls = live.layers.slice().sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
      const shown = ls.filter(isLive);
      const quiet = ls.filter((l) => l.state === 'down' || l.state === 'off' || l.state === 'checking').length, planned = ls.filter((l) => l.state === 'planned').length;
      const more = (n, cls, en, el) => (n ? h('button', { class: 'lv-chip ' + cls, type: 'button', onclick: () => api.setView && api.setView('pulse') }, h('span', null, h('b', null, String(n)), h('small', null, T(en, el)))) : null);
      const cand = ls.filter((l) => l.state === 'candidate').length;
      const items = shown.map((l) => {
        const on = isLive(l), col = l.state === 'down' ? COL.bad : COL[l.group];
        const sub = on ? (OWN.includes(l.id) && l.sensors ? T(l.fresh + ' of ' + l.sensors, l.fresh + ' από ' + l.sensors) + ' · ' : l.head ? num(l.head.value) + ' ' + l.head.unit + ' · ' : '') + (l.period ? lab(l.period) : l.lastAt ? SC.ago(l.lastAt) : '') : l.state === 'planned' ? T('planned', 'σχεδιάζεται') : l.state === 'checking' ? T('checking', 'έλεγχος') : l.state === 'off' ? T('switched off', 'κλειστό') : T('not answering', 'δεν απαντά');
        const r = ring();
        const b = h('button', { class: 'lv-chip lv-' + (on ? 'on' : l.state), type: 'button', onclick: () => api.openLayer(l.id) }, r, h('span', null, h('b', null, nm(l)), h('small', null, sub)));
        setVar(b, '--c', col);
        return { l, r, b };
      });
      chips.replaceChildren(...[...items.map((x) => x.b), more(quiet, 'lv-down', 'not answering', 'δεν απαντούν'), more(planned, 'lv-planned', 'planned', 'σχεδιάζονται'), more(cand, 'lv-cand', cand === 1 ? 'candidate' : 'candidates', cand === 1 ? 'υποψήφιο' : 'υποψήφια')].filter(Boolean));
      if (untick) untick();
      const paint = (now) => items.forEach(({ l, r }) => { const n = isLive(l) ? nextOf(l, now) : null; setVar(r, '--p', n ? Math.round(n.p * 100) : l.state === 'down' ? 100 : 0); });
      paint(Date.now()); untick = onTick(paint);
    }

    /* --- the picture of one moment: now, or a moment of the replay --- */
    function showNow() {
      playIdx = -1; windScale = 1;
      const own = {}, air = {};
      Object.keys(CITY).forEach((c) => { own[c] = ownOf(live, c); const r = ((live.cities[c] || {}).rows || []).find((x) => x.variable === 'temperature' && x.env === 'outdoor' && !x.stale); air[c] = r ? r.value : null; });
      drawMarks(own, air);
      clock.textContent = ''; stamp.textContent = T('updated ', 'ενημέρωση ') + SC.time(live.at);
      stage.classList.remove('lv-past');
    }
    function showAt(i) {
      if (!replay || !replay.times.length) return;
      i = clamp(i, 0, replay.times.length - 1);
      if (i === replay.times.length - 1 && !playing) { range.value = String(i); showNow(); return; }
      playIdx = i; range.value = String(i);
      const own = {}, air = {}; let ws = [], wsNow = [];
      Object.keys(CITY).forEach((c) => {
        const d = (replay.cities[c] || {}), o = d.own;
        own[c] = o && o.values[i] != null ? { variable: o.variable, value: o.values[i], unit: o.unit, ageMin: null } : null;
        air[c] = d.air && d.air.values[i] != null ? d.air.values[i] : null;
        if (d.wind && d.wind.values[i] != null) { ws.push(d.wind.values[i]); const lastV = d.wind.values[d.wind.values.length - 1]; if (lastV != null) wsNow.push(lastV); }
      });
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      windScale = ws.length && wsNow.length && mean(wsNow) > 0.2 ? clamp(mean(ws) / mean(wsNow), 0.3, 3) : 1;
      drawMarks(own, air);
      clock.textContent = SC.dateTime(replay.times[i]); stamp.textContent = T('replay of the saved readings', 'αναπαραγωγή των αποθηκευμένων μετρήσεων');
      stage.classList.add('lv-past');
    }
    const playLabel = () => playBtn.replaceChildren(sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, sv('path', { d: playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M7 4.5v15l13-7.5z', fill: 'currentColor' })), playing ? T('Pause', 'Παύση') : T('Replay 24 h', 'Επανάληψη 24 ωρών'));
    function stopPlay(keep) { if (playing) { clearInterval(playing); playing = 0; } playLabel(); if (!keep && live) { range.value = range.max; showNow(); } }
    function startPlay() {
      if (!replay || replay.times.length < 3) return;
      let i = Number(range.value) >= replay.times.length - 1 ? 0 : Number(range.value);
      playing = setInterval(() => { if (dead) return stopPlay(true); showAt(i); if (++i >= replay.times.length) stopPlay(); }, still() ? 400 : 110);
      playLabel();
    }
    function drawReplay() {
      const n = replay ? replay.times.length : 0;
      range.max = String(Math.max(0, n - 1)); if (playIdx < 0) range.value = range.max;
      range.disabled = n < 3; playBtn.disabled = n < 3;
      // the bars: the average outdoor temperature of the four cities at each moment (taller is warmer)
      const vals = [];
      for (let i = 0; i < n; i++) { const a = Object.keys(CITY).map((c) => { const d = replay.cities[c]; return d && d.air ? d.air.values[i] : null; }).filter((v) => v != null); vals.push(a.length ? a.reduce((x, y) => x + y, 0) / a.length : null); }
      const ok = vals.filter((v) => v != null), lo = Math.min(...ok), hi = Math.max(...ok);
      const step = Math.max(1, Math.ceil(n / 72));
      bars.replaceChildren(...vals.filter((_, i) => i % step === 0).map((v) => { const b = h('i'); b.style.height = (v == null ? 8 : 22 + (hi > lo ? ((v - lo) / (hi - lo)) * 78 : 40)) + '%'; if (v == null) b.style.opacity = '.35'; return b; }));
      ticks.replaceChildren(...(n >= 3 ? [0, 0.33, 0.66].map((f) => h('span', null, SC.time(replay.times[Math.round(f * (n - 1))]))).concat(h('span', null, T('now', 'τώρα'))) : []));
      const first = n ? replay.times[0] : null, span = n ? replay.times[n - 1] - first : 0;
      replayNote.textContent = n < 3 ? T('The replay fills as readings are saved, one every ' + dur(replay ? replay.every : 300000) + '. Come back in a little while.', 'Η επανάληψη γεμίζει όσο αποθηκεύονται μετρήσεις, μία κάθε ' + dur(replay ? replay.every : 300000) + '. Έλα ξανά σε λίγο.')
        : span < 23 * 3600000 ? T('Saved readings start at ' + SC.dateTime(first) + '. The bar grows until it holds a full day. Taller bars are warmer moments.', 'Οι αποθηκευμένες μετρήσεις αρχίζουν στις ' + SC.dateTime(first) + '. Η μπάρα μεγαλώνει μέχρι να χωρέσει μια ολόκληρη μέρα. Οι ψηλότερες μπάρες είναι πιο ζεστές στιγμές.')
          : T('Taller bars are warmer moments of the last 24 hours.', 'Οι ψηλότερες μπάρες είναι πιο ζεστές στιγμές των τελευταίων 24 ωρών.');
    }
    let replayAt = 0;
    function loadReplay() {
      if (Date.now() - replayAt < 120000) return;
      replayAt = Date.now();
      SC.api('/layers/api/replay').then((r) => { if (dead) return; replay = r; drawReplay(); }).catch(() => { replayAt = 0; });
    }
    playLabel();

    return {
      update(l) {
        live = l;
        buildField(); sizeCanvas(); drawGlow(); drawFloats(); drawChips();
        if (playIdx < 0) showNow();
        loadReplay(); kick();
      },
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (playing) clearInterval(playing); if (untick) untick(); if (ro) ro.disconnect(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', onVis); },
    };
  }

  /* ================================================================== 2. the pulse board ==================================== */
  function pulse(host, api) {
    let untick = null, seen = new Map(), first = true;
    const wrap = h('div', { class: 'lv-pulse' });
    host.replaceChildren(wrap);
    return {
      update(live) {
        const now = Date.now(), c = live.counts || {};
        const bad = (c.down || 0) + (c.off || 0);
        const seg = h('div', { class: 'lv-seg', role: 'img', 'aria-label': T((c.connected || 0) + ' live, ' + bad + ' not answering, ' + (c.planned || 0) + ' planned, ' + (c.candidate || 0) + ' candidates', (c.connected || 0) + ' ζωντανά, ' + bad + ' δεν απαντούν, ' + (c.planned || 0) + ' σχεδιάζονται, ' + (c.candidate || 0) + ' υποψήφια') },
          [['a', c.connected || 0], ['b', bad], ['c', c.planned || 0], ['d', c.candidate || 0]].filter((x) => x[1] > 0).map(([k, n]) => { const e = h('i', { class: k }); e.style.flexGrow = String(n); return e; }));
        const legend = h('div', { class: 'lv-lg' },
          h('span', { class: 'a' }, h('b', null, c.connected || 0), ' ', T('live', 'ζωντανά')),
          bad ? h('span', { class: 'b' }, h('b', null, bad), ' ', T('not answering', 'δεν απαντούν')) : null,
          h('span', { class: 'c' }, h('b', null, c.planned || 0), ' ', T('planned', 'σχεδιάζονται')),
          h('span', { class: 'd' }, h('b', null, c.candidate || 0), ' ', T('candidates', 'υποψήφια')));
        const nextBox = h('div', { class: 'lv-next' });
        const rows = [], kids = [h('div', { class: 'lv-sum' }, h('h3', null, T('All layers', 'Όλα τα στρώματα')), liveBadge(), seg), legend, nextBox];
        ORDER.forEach((g) => {
          const all = live.layers.filter((l) => l.group === g && (l.status !== 'candidate') && l.state !== 'planned' && l.state !== 'candidate' && l.state !== 'retired');
          if (!all.length) return;
          const liveN = all.filter(isLive).length;
          const gh = h('div', { class: 'lv-gh' }, h('i'), h('h4', null, lab(GROUP[g])), h('span', null, T(liveN + ' of ' + all.length + ' live', liveN + ' από ' + all.length + ' ζωντανά')));
          setVar(gh, '--c', COL[g]);
          kids.push(gh);
          all.forEach((l) => {
            const on = isLive(l), down = !on;
            const fresh = !first && on && seen.has(l.id) && l.lastAt && l.lastAt > seen.get(l.id);
            const rg = ring(), nx = h('small', null, '');
            const sub = OWN.includes(l.id) && l.sensors ? T(l.fresh + ' of ' + l.sensors + ' sensors reporting', l.fresh + ' από ' + l.sensors + ' αισθητήρες στέλνουν') : (isEl() ? l.taglineEl : l.tagline) || '';
            const val = down ? h('span', { class: 'lv-val' }, h('b', { class: 'dn' }, l.state === 'checking' ? T('checking', 'έλεγχος') : l.state === 'off' ? T('switched off', 'κλειστό') : T('no answer', 'δεν απαντά')))
              : l.head ? h('span', { class: 'lv-val' }, h('b', null, num(l.head.value)), h('small', null, l.head.unit + ' · ' + lab(l.head.label).toLowerCase()))
                : h('span', { class: 'lv-val' }, h('b', { class: 'tx' }, l.count ? String(l.count) : '✓'), h('small', null, isEl() ? l.noteEl : l.note));
            const row = h('button', { class: 'lv-row' + (on ? ' is-live' : ' is-down') + (fresh ? ' is-fresh' : ''), type: 'button', onclick: () => api.openLayer(l.id), 'aria-label': nm(l) + (l.head ? ', ' + num(l.head.value) + ' ' + l.head.unit : '') },
              h('span', { class: 'lv-dot' }, h('i')),
              h('span', { class: 'lv-nm' }, h('b', null, nm(l)), h('small', null, sub, fresh ? h('em', null, T('new reading', 'νέα μέτρηση')) : null)),
              h('span', { class: 'lv-sp' }, sparkSvg(l.spark, down ? COL.bad : COL[g], 150, 36, down)),
              val, h('span', { class: 'lv-nx' }, rg, nx));
            setVar(row, '--c', down ? COL.bad : COL[g]);
            rows.push({ l, rg, nx, on });
            kids.push(row);
            if (l.lastAt) seen.set(l.id, l.lastAt);
          });
        });
        const waiting = live.layers.filter((l) => l.state === 'planned' || l.state === 'candidate');
        if (waiting.length) {
          const gh = h('div', { class: 'lv-gh' }, h('i'), h('h4', null, T('Not connected yet', 'Δεν έχουν συνδεθεί ακόμη')), h('span', null, T((c.planned || 0) + ' planned, ' + (c.candidate || 0) + ' candidates', (c.planned || 0) + ' σχεδιάζονται, ' + (c.candidate || 0) + ' υποψήφια')));
          setVar(gh, '--c', 'rgba(255,255,255,.4)');
          kids.push(gh, h('div', { class: 'lv-ghost' }, waiting.map((l) => h('button', { type: 'button', class: l.state === 'planned' ? 'pl' : '', onclick: () => api.openLayer(l.id) }, nm(l)))));
        }
        kids.push(h('p', { class: 'lv-fine' }, live.since ? T('Each line is the value of that layer, averaged over the cities, since ' + SC.dateTime(live.since) + ' (at most the last day). The ring empties until the layer is due to speak again.', 'Κάθε γραμμή είναι η τιμή του στρώματος, ως μέσος όρος των πόλεων, από τις ' + SC.dateTime(live.since) + ' (το πολύ η τελευταία μέρα). Το δαχτυλίδι αδειάζει μέχρι να έρθει η ώρα να ξαναμιλήσει το στρώμα.') : T('The trend lines fill as readings are saved. The ring empties until the layer is due to speak again.', 'Οι γραμμές τάσης γεμίζουν όσο αποθηκεύονται μετρήσεις. Το δαχτυλίδι αδειάζει μέχρι να έρθει η ώρα να ξαναμιλήσει το στρώμα.')));
        wrap.replaceChildren(...kids);
        first = false;
        if (untick) untick();
        const paint = (t) => {
          let soon = null; const after = [];
          rows.forEach(({ l, rg, nx, on }) => {
            const n = on ? nextOf(l, t) : null;
            setVar(rg, '--p', n ? Math.round(n.p * 100) : 0);
            nx.textContent = !on ? (l.lastAt ? T('quiet ', 'σιωπή ') + dur(t - l.lastAt) : '') : l.period ? T('yearly', 'ετήσιο') : !n ? '' : n.ms > 0 ? dur(n.ms) : n.late ? T('late ', 'αργεί ') + dur(-n.ms) : T('due now', 'τώρα');
            if (n && n.ms > 0) { after.push({ l, ms: n.ms }); if (!soon || n.ms < soon.ms) soon = { l, ms: n.ms }; }
          });
          after.sort((a, b) => a.ms - b.ms);
          if (soon) {
            const rg2 = ring('big'); setVar(rg2, '--p', Math.round(clamp(soon.ms / soon.l.everyMs, 0, 1) * 100)); setVar(rg2, '--c', COL[soon.l.group]);
            nextBox.replaceChildren(rg2, h('div', null, h('b', null, T('Next to speak: ', 'Επόμενο που θα μιλήσει: ') + nm(soon.l) + T(', in ', ', σε ') + dur(soon.ms)),
              after.length > 1 ? h('small', null, T('Then ', 'Μετά ') + after.slice(1, 4).map((x) => nm(x.l) + T(' in ', ' σε ') + dur(x.ms)).join(', ')) : null));
            nextBox.hidden = false;
          } else nextBox.hidden = true;
        };
        paint(now); untick = onTick(paint);
      },
      destroy() { if (untick) untick(); },
    };
  }

  /* ================================================================== 3. same question, every source ======================== */
  const WHY = {   // one plain line on what a kind of source really measures
    indoor: ['Inside a room or a vehicle, so steadier than the air outside.', 'Μέσα σε αίθουσα ή όχημα, άρα πιο σταθερό από τον αέρα έξω.'],
    vehicle: ['On a moving vehicle: the air around it, not the whole city.', 'Πάνω σε κινούμενο όχημα: ο αέρας γύρω του, όχι όλη η πόλη.'],
    'reference-station': ['Official station, outside, checked instruments.', 'Επίσημος σταθμός, έξω, ελεγμένα όργανα.'],
    'calibrated-network': ['A calibrated network of stations, outside.', 'Βαθμονομημένο δίκτυο σταθμών, έξω.'],
    'low-cost-sensor': ['A low-cost sensor: good for change over time, not calibrated.', 'Αισθητήρας χαμηλού κόστους: καλός για την αλλαγή στον χρόνο, όχι βαθμονομημένος.'],
    'crowd-sourced': ['A volunteer’s sensor: useful, not checked.', 'Αισθητήρας εθελοντή: χρήσιμος, όχι ελεγμένος.'],
    model: ['A model’s average over a square about 11 km wide, so it smooths hot spots.', 'Μέσος όρος μοντέλου σε τετράγωνο πλάτους περίπου 11 km, άρα εξομαλύνει τα ακραία σημεία.'],
    reanalysis: ['A model’s average over a wide square.', 'Μέσος όρος μοντέλου σε μεγάλο τετράγωνο.'],
    satellite: ['Seen from space: an area, only when the sky is clear, at the time of the pass.', 'Από το διάστημα: μια περιοχή, μόνο με καθαρό ουρανό, την ώρα του περάσματος.'],
  };
  const whyOf = (s) => lab(s.env === 'indoor' ? WHY.indoor : s.env === 'vehicle' || s.env === 'mobile' ? WHY.vehicle : WHY[s.kind] || ['', '']);
  function compare(host, api) {
    let dead = false, data = null, variable = null, tok = 0, timer = 0, lastCity = null, loading = false, err = null;
    const wrap = h('div', { class: 'lv-cmp' });
    host.replaceChildren(wrap);
    const dash = { model: '7 6', reanalysis: '7 6' };
    function chart() {
      const W = 720, H = 360, L = 46, R = 196, Tp = 16, B = 34, pw = W - L - R, ph = H - Tp - B;
      const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'lv-chart', role: 'img', 'aria-label': T('The last 24 hours of ', 'Οι τελευταίες 24 ώρες: ') + lab((data.variables.find((v) => v.id === data.variable) || {}).label) });
      const now = data.at, t0 = now - 24 * 3600000;
      const all = data.series.flatMap((s) => s.points.map((p) => p[1]).concat(s.value));
      let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.15 || Math.max(1, Math.abs(hi) * 0.05); lo -= pad; hi += pad;
      const X = (t) => L + clamp((t - t0) / (now - t0), 0, 1) * pw, Y = (v) => Tp + (1 - (v - lo) / (hi - lo)) * ph;
      const stepRaw = (hi - lo) / 5, mag = Math.pow(10, Math.floor(Math.log10(stepRaw))), step = [1, 2, 5, 10].map((k) => k * mag).find((k) => k >= stepRaw) || stepRaw;
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) svg.append(sv('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: 'rgba(255,255,255,.10)' }), sv('text', { x: L - 8, y: Y(v) + 5, 'text-anchor': 'end', class: 'ax' }, num(Math.round(v * 100) / 100)));
      [0, 0.25, 0.5, 0.75].forEach((f) => svg.append(sv('text', { x: L + f * pw, y: H - 10, 'text-anchor': f === 0 ? 'start' : 'middle', class: 'ax' }, SC.time(t0 + f * (now - t0)))));
      svg.append(sv('text', { x: W - R, y: H - 10, 'text-anchor': 'end', class: 'ax' }, T('now', 'τώρα')));
      svg.append(sv('line', { x1: W - R, x2: W - R, y1: Tp, y2: Tp + ph, stroke: COL.own, 'stroke-width': 2, 'stroke-dasharray': '2 5' }));
      const ends = [];
      data.series.forEach((s) => {
        const col = COL[s.group] || '#fff', raw = s.points.filter((p) => p[0] >= t0);
        const pts = s.kind === 'satellite' ? raw.filter((p, i, a) => i === 0 || p[1] !== a[i - 1][1]) : raw;   // a satellite value stays the same until the next pass: one mark per pass
        if (s.kind === 'satellite' || pts.length < 2) pts.forEach((p) => svg.append(sv('rect', { x: X(p[0]) - 5, y: Y(p[1]) - 5, width: 10, height: 10, fill: col, stroke: '#0C1626', 'stroke-width': 1.5, transform: 'rotate(45 ' + X(p[0]) + ' ' + Y(p[1]) + ')' })));
        else {
          const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
          if (s.group === 'own') svg.append(sv('path', { d, fill: 'none', stroke: col, 'stroke-width': 7, opacity: 0.22, 'stroke-linejoin': 'round' }));
          svg.append(sv('path', { d, fill: 'none', stroke: col, 'stroke-width': s.group === 'own' ? 3.6 : 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...(dash[s.kind] ? { 'stroke-dasharray': dash[s.kind] } : {}), class: 'lv-line' }));
        }
        ends.push({ s, col, y: Y(s.value) });
      });
      ends.sort((a, b) => a.y - b.y);
      ends.forEach((e, i) => { e.ly = i && e.y - ends[i - 1].ly < 25 ? ends[i - 1].ly + 25 : e.y; });
      const over = ends.length ? ends[ends.length - 1].ly - (Tp + ph) : 0;
      if (over > 0) ends.forEach((e) => { e.ly -= over; });
      ends.forEach((e) => {
        svg.append(sv('circle', { cx: W - R, cy: e.y, r: 9, fill: e.col, opacity: 0.25, class: 'lv-halo' }), sv('circle', { cx: W - R, cy: e.y, r: 4.8, fill: e.col, stroke: '#0C1626', 'stroke-width': 2 }));
        if (Math.abs(e.ly - e.y) > 2) svg.append(sv('path', { d: 'M' + (W - R + 6) + ' ' + e.y + 'L' + (W - R + 14) + ' ' + e.ly, stroke: e.col, 'stroke-opacity': 0.6 }));
        svg.append(sv('text', { x: W - R + 18, y: e.ly + 7, class: 'ev', fill: e.col }, num(e.s.value)), sv('text', { x: W - R + 18 + String(num(e.s.value)).length * 12.5 + 8, y: e.ly + 6, class: 'en' }, (nm(e.s).length > 17 ? nm(e.s).slice(0, 16) + '…' : nm(e.s))));
      });
      return svg;
    }
    function draw() {
      const cities = api.cities(), city = api.city();
      const cityBar = h('div', { class: 'lv-pick', role: 'tablist', 'aria-label': T('City', 'Πόλη') }, cities.map((c) => h('button', { type: 'button', role: 'tab', class: c.id === city ? 'on' : '', 'aria-selected': c.id === city ? 'true' : 'false', onclick: () => api.setCity(c.id) }, c.name)));
      if (!data) { wrap.replaceChildren(cityBar, err ? h('div', { class: 'err', role: 'alert' }, err) : h('div', { class: 'ly-skel', style: { height: '320px' } })); return; }
      const vars = data.variables.slice(0, 9);
      const varBar = h('div', { class: 'lv-pick lv-vars', role: 'tablist', 'aria-label': T('What to measure', 'Τι να μετρήσουμε') }, vars.map((v) => h('button', { type: 'button', role: 'tab', class: v.id === data.variable ? 'on' : '', 'aria-selected': v.id === data.variable ? 'true' : 'false', title: T(v.sources + (v.sources === 1 ? ' source' : ' sources'), v.sources + (v.sources === 1 ? ' πηγή' : ' πηγές')), onclick: () => { variable = v.id; load(true); } }, lab(v.label), h('small', null, String(v.sources)))));
      if (!data.series.length) { wrap.replaceChildren(cityBar, varBar, h('p', { class: 'lv-fine' }, T('No layer has a reading for this city right now.', 'Κανένα στρώμα δεν έχει μέτρηση για αυτή την πόλη αυτή τη στιγμή.'))); return; }
      const most = Math.max(...data.series.map((s) => s.points.length));
      const f = data.finding;
      wrap.replaceChildren(varBar, cityBar,
        h('div', { class: 'lv-hd' }, h('h3', null, lab(data.cityName) + T(', last 24 hours', ', τελευταίες 24 ώρες')), liveBadge(), h('span', { class: 'lv-sub' }, T('a new point every ' + dur(data.every), 'νέο σημείο κάθε ' + dur(data.every)))),
        h('div', { class: 'lv-chartbox' + (loading ? ' is-loading' : '') }, chart()),
        most < 3 || (data.since && data.at - data.since < 23 * 3600000) ? h('p', { class: 'lv-fine' }, T('The lines started at ' + SC.dateTime(data.since || data.at) + ' and grow with every saved reading, up to a full day.', 'Οι γραμμές άρχισαν στις ' + SC.dateTime(data.since || data.at) + ' και μεγαλώνουν με κάθε αποθηκευμένη μέτρηση, μέχρι μια ολόκληρη μέρα.')) : null,
        h('div', { class: 'lv-key4' }, data.series.map((s) => { const b = h('button', { type: 'button', class: 'lv-k4', onclick: () => api.openLayer(s.source) }, h('i'), h('span', null, h('b', null, nm(s) + ' ', h('u', null, num(s.value) + ' ' + s.unit)), h('small', null, whyOf(s) + (s.ageMin != null ? ' ' + (s.ageMin < 2 ? T('Just now.', 'Μόλις τώρα.') : T(s.ageMin + ' min ago.', 'Πριν ' + s.ageMin + ' λ.')) : '')))); setVar(b, '--c', COL[s.group] || '#fff'); return b; })),
        f ? h('div', { class: 'lv-why lv-' + f.kind }, h('b', null, T('The master brain says: ', 'Ο κύριος εγκέφαλος λέει: ')), lab([f.title.en, f.title.el]) + '. ', lab([f.body.en, f.body.el]),
          h('small', null, T('Standard wording written by the code from these readings, not by AI. Indoor readings are never compared with the street.', 'Τυπική διατύπωση από τον κώδικα με βάση αυτές τις μετρήσεις, όχι από ΤΝ. Οι μετρήσεις εσωτερικού χώρου δεν συγκρίνονται ποτέ με τον δρόμο.'))) : null);
    }
    async function load(show) {
      const city = api.city(); if (!city || city === 'all') return;
      const my = ++tok; loading = Boolean(show && data); if (loading) draw();
      try {
        let r;
        try { r = await SC.api('/layers/api/compare?city=' + encodeURIComponent(city) + (variable ? '&variable=' + encodeURIComponent(variable) : '')); }
        catch (e) { if (e.status === 404 && variable) { variable = null; r = await SC.api('/layers/api/compare?city=' + encodeURIComponent(city)); } else throw e; }
        if (dead || my !== tok) return;
        data = r; variable = r.variable; err = null;
      } catch (e) { if (dead || my !== tok) return; err = (e && e.message) || T('Something went wrong.', 'Κάτι πήγε στραβά.'); if (!show) return; data = null; }
      loading = false; lastCity = city; draw();
    }
    draw();
    return {
      update() { if (api.city() !== lastCity) { data = lastCity ? data : null; load(true); } else load(false); },
      setVariable(v) { variable = v; load(true); },
      destroy() { dead = true; clearTimeout(timer); },
    };
  }

  /* ================================================================== 4. sky to ground =======================================
     One scene from space down to the sea, as in the approved picture: two satellites with their beams, the wind, the model's grid
     of numbers, a school with a sensor, a bus (a drawing: no vehicle position exists here), a weather mast, the city and the sea.
     A dotted line runs from each of them to its tag, and a dot travels along it while that layer is answering. On a wide card the
     tags are part of the scene; on a narrow one the scene is on top and the tags are listed under it, so the text stays readable. */
  function sky(host, api) {
    const wrap = h('div', { class: 'lv-sky' });
    host.replaceChildren(wrap);
    const W = 724, H = 980, SW = 452, TX = 458, TW = 258, GROUND = 706, SEA = 790, GY = 446;
    let uid = 0;
    function scene(tags, grid, full) {
      const id = 'lvS' + (++uid);
      const vw = full ? W : SW;
      const svg = sv('svg', { viewBox: '0 0 ' + vw + ' ' + H, class: 'lv-scene', role: 'img', 'aria-label': T('Where each layer is born, from space down to the sea', 'Πού γεννιέται κάθε στρώμα, από το διάστημα μέχρι τη θάλασσα') });
      const grad = (gid, stops) => sv('linearGradient', { id: id + gid, x1: 0, y1: 0, x2: 0, y2: 1 }, ...stops.map(([o, c, a]) => sv('stop', { offset: o, 'stop-color': c, 'stop-opacity': a == null ? 1 : a })));
      svg.append(sv('defs', null,
        grad('sk', [[0, '#0a1020'], [0.24, '#152848'], [0.55, '#1b3a5e'], [0.7, '#173149'], [1, '#0f2a42']]),
        grad('bm', [[0, COL.model, 0.6], [1, COL.model, 0]]), grad('sw', [[0, '#2FB7C9', 0.6], [1, '#0d3550', 0.95]]),
        sv('clipPath', { id: id + 'cc' }, sv('rect', { width: vw, height: H, rx: 22 }))));
      const g = sv('g', { 'clip-path': 'url(#' + id + 'cc)' });
      svg.append(g);
      g.append(sv('rect', { width: vw, height: H, fill: 'url(#' + id + 'sk)' }));
      for (let i = 0; i < 44; i++) g.append(sv('circle', { class: i % 5 === 0 ? 'lv-tw' : null, style: i % 5 === 0 ? 'animation-delay:' + (-(i % 7) * 0.6) + 's' : null, cx: 60 + ((i * 97) % 380), cy: 10 + ((i * 53) % 200), r: 0.7 + (i % 3) * 0.45, fill: '#fff', opacity: 0.25 + (i % 4) * 0.14 }));
      g.append(sv('path', { d: 'M24 196 Q 220 30 440 200', fill: 'none', stroke: COL.model, 'stroke-opacity': 0.55, 'stroke-dasharray': '4 7' }), sv('path', { d: 'M60 124 Q 250 14 440 142', fill: 'none', stroke: COL.model, 'stroke-opacity': 0.35, 'stroke-dasharray': '4 7' }));
      const sat = (x, y, rot, cls) => sv('g', { class: 'lv-sat2 ' + cls }, sv('path', { d: 'M' + x + ' ' + (y + 14) + ' L' + (x - 54) + ' 300 L' + (x + 56) + ' 300 Z', fill: 'url(#' + id + 'bm)' }),
        sv('g', { transform: 'translate(' + x + ' ' + y + ') rotate(' + rot + ')' }, sv('rect', { x: -8, y: -8, width: 16, height: 16, rx: 3, fill: '#cfc6f7', stroke: COL.model }), sv('rect', { x: -34, y: -5, width: 22, height: 10, fill: '#6f63b8', stroke: COL.model }), sv('rect', { x: 12, y: -5, width: 22, height: 10, fill: '#6f63b8', stroke: COL.model })));
      g.append(sat(150, 96, -22, 'a'), sat(330, 112, 18, 'b'));
      [236, 428, 612, GROUND + 52].forEach((y) => g.append(sv('line', { x1: 62, y1: y, x2: 446, y2: y, stroke: 'rgba(255,255,255,.16)', 'stroke-dasharray': '2 6' })));
      [[118, T('Space', 'Διάστημα')], [332, T('Air', 'Αέρας')], [660, T('Ground', 'Έδαφος')], [880, T('Sea', 'Θάλασσα')]].forEach(([y, t]) => g.append(sv('text', { x: 24, y, class: 'lv-zone', transform: 'rotate(-90 24 ' + y + ')', 'text-anchor': 'middle' }, t)));
      [[78, 318, 70], [150, 352, 96], [60, 388, 84], [230, 330, 60], [260, 392, 80]].forEach(([x, y, l], i) => g.append(sv('g', { class: 'lv-arrow', style: 'animation-delay:' + (-i * 0.8) + 's' }, sv('path', { d: 'M' + x + ' ' + y + 'h' + l + 'm-8 -5.5l8 5.5l-8 5.5', fill: 'none', stroke: '#CFEFFA', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))));
      g.append(sv('ellipse', { cx: 300, cy: 420, rx: 88, ry: 15, fill: COL.model, opacity: 0.22 }));
      // the model's grid: real numbers of the air-quality model when it answers (fine particles, µg/m³)
      const lo = grid.length ? Math.min(...grid) : 0, hi = grid.length ? Math.max(...grid) : 1;
      for (let i = 0; i < 24; i++) {
        const c = i % 6, r = Math.floor(i / 6), v = grid.length ? grid[i % grid.length] : null;
        g.append(sv('rect', { class: 'lv-cell', style: 'animation-delay:' + (-((c * 3 + r * 5) % 7) * 0.5) + 's', x: 64 + c * 60, y: GY + r * 28, width: 56, height: 24, rx: 4, fill: COL.model, 'fill-opacity': v == null ? 0.1 : 0.1 + (hi > lo ? (v - lo) / (hi - lo) : 0.5) * 0.32, stroke: COL.model, 'stroke-opacity': 0.5 }),
          sv('text', { x: 64 + c * 60 + 28, y: GY + r * 28 + 17, class: 'lv-gn', 'text-anchor': 'middle' }, v == null ? '·' : String(Math.round(v))));
      }
      g.append(sv('path', { d: 'M0 ' + GROUND + ' L80 ' + (GROUND - 10) + ' L170 ' + (GROUND + 4) + ' L270 ' + (GROUND - 12) + ' L350 ' + GROUND + ' L446 ' + (GROUND - 8) + ' L446 ' + (GROUND + 44) + ' L0 ' + (GROUND + 44) + ' Z', fill: '#14281f', stroke: COL.context, 'stroke-opacity': 0.4 }),
        sv('rect', { x: 66, y: GROUND - 78, width: 118, height: 72, rx: 4, fill: '#20344f', stroke: COL.own, 'stroke-opacity': 0.75 }));
      [0, 1, 2, 3].forEach((i) => g.append(sv('rect', { x: 78 + i * 26, y: GROUND - 62, width: 15, height: 15, rx: 2, fill: COL.own, opacity: i === 1 ? 1 : 0.35 })));
      g.append(sv('circle', { class: 'lv-beat', cx: 111, cy: GROUND - 54, r: 13, fill: 'none', stroke: COL.own, 'stroke-width': 2 }), sv('circle', { cx: 111, cy: GROUND - 54, r: 12, fill: 'none', stroke: COL.own, 'stroke-width': 2, opacity: 0.7 }));
      const bus = sv('g', { class: 'lv-bus' }, sv('rect', { x: 200, y: GROUND - 30, width: 66, height: 26, rx: 6, fill: COL.own, stroke: '#1c0f06', 'stroke-width': 2 }), sv('circle', { cx: 218, cy: GROUND - 3, r: 5, fill: '#0C1626' }), sv('circle', { cx: 250, cy: GROUND - 3, r: 5, fill: '#0C1626' }));
      [0, 1, 2].forEach((i) => bus.append(sv('rect', { x: 206 + i * 18, y: GROUND - 25, width: 14, height: 9, rx: 2, fill: '#0C1626' })));
      g.append(bus, sv('path', { d: 'M330 ' + (GROUND - 4) + ' V' + (GROUND - 92) + ' M312 ' + (GROUND - 82) + ' h36', stroke: COL.official, 'stroke-width': 3, fill: 'none' }), sv('circle', { cx: 330, cy: GROUND - 98, r: 7, fill: '#0C1626', stroke: COL.official, 'stroke-width': 3 }),
        sv('path', { class: 'lv-wave', d: 'M352 ' + (GROUND - 60) + ' q18 -9 36 0 m-36 11 q18 -9 36 0', stroke: COL.official, 'stroke-opacity': 0.7, fill: 'none', 'stroke-width': 2 }));
      [0, 1, 2, 3].forEach((i) => g.append(sv('rect', { x: 384 + i * 15, y: GROUND - 4 - 38 - (i % 2) * 16, width: 12, height: 38 + (i % 2) * 16, fill: COL.context, opacity: 0.4 + i * 0.1 })));
      const wave = (y, a, o) => { let d = 'M-30 ' + y; for (let x = -30; x <= 476; x += 20) d += 'L' + x + ' ' + (y + Math.sin((x + o) / 26) * a).toFixed(1); return d; };
      const seaClip = sv('clipPath', { id: id + 'sc' }, sv('rect', { x: 0, y: SEA - 12, width: 446, height: H }));
      svg.querySelector('defs').append(seaClip);
      g.append(sv('g', { 'clip-path': 'url(#' + id + 'sc)' }, sv('path', { class: 'lv-swell', d: wave(SEA, 5, 0) + ' L476 ' + (H + 10) + ' L-30 ' + (H + 10) + ' Z', fill: 'url(#' + id + 'sw)' }), sv('path', { class: 'lv-swell b', d: wave(SEA + 30, 4, 40), fill: 'none', stroke: '#CFEFFA', 'stroke-opacity': 0.5 }), sv('path', { class: 'lv-swell', d: wave(SEA + 62, 4, 90), fill: 'none', stroke: '#CFEFFA', 'stroke-opacity': 0.3 })),
        sv('g', { class: 'lv-buoy' }, sv('path', { d: 'M230 ' + (SEA + 100) + ' v-22', stroke: COL.model, 'stroke-width': 3.2 }), sv('circle', { cx: 230, cy: SEA + 110, r: 10, fill: '#0C1626', stroke: COL.model, 'stroke-width': 3.2 })));
      // the wires: level from the thing, one bend, then to the middle of its tag (or to the edge of a narrow scene)
      tags.forEach((t, k) => t.from.forEach(([x1, y1], j) => {
        const jx = 418 + ((k + j) % 4) * 9, ty = full ? t.y + t.h / 2 : y1, endX = full ? TX : SW;
        const dir = Math.sign(ty - y1);
        const d = dir === 0 ? 'M' + x1 + ' ' + y1 + 'H' + endX : 'M' + x1 + ' ' + y1 + 'H' + (jx - 10) + 'Q' + jx + ' ' + y1 + ' ' + jx + ' ' + (y1 + dir * 10) + 'V' + (ty - dir * 10) + 'Q' + jx + ' ' + ty + ' ' + (jx + 10) + ' ' + ty + 'H' + endX;
        g.append(sv('path', { d, fill: 'none', stroke: t.col, 'stroke-width': 1.7, 'stroke-dasharray': '3 5', opacity: t.on ? 0.8 : 0.3 }));
        if (t.on) g.append(sv('circle', { class: 'lv-pkt', r: 4.6, fill: t.col, style: "offset-path:path('" + d + "');animation-duration:" + t.trip + 's;animation-delay:' + (-(k * 0.7 + j * 1.3)) + 's' }));
      }));
      if (full) tags.forEach((t) => {
        const fo = sv('foreignObject', { x: TX, y: t.y, width: TW, height: t.h });
        fo.append(tagNode(t));
        g.append(fo);
      });
      return svg;
    }
    function tagNode(t) {
      const b = h(t.id ? 'button' : 'div', { class: 'lv-tag2' + (t.on ? ' is-on' : ' is-off'), ...(t.id ? { type: 'button', onclick: () => api.openLayer(t.id) } : {}) },
        h('span', { class: 'lv-tg-h' }, h('b', null, t.title), h('u', null, t.big || '')), t.lines.filter(Boolean).slice(0, 3).map((x) => h('small', null, x)));
      setVar(b, '--c', t.col);
      return b;
    }
    return {
      update(live) {
        const L = (id) => live.layers.find((l) => l.id === id);
        const on = (id) => isLive(L(id) || {});
        const rowsOf = (variable, pick) => Object.values(live.cities).flatMap((c) => c.rows).filter((r) => r.variable === variable && !r.stale && (!pick || pick(r)));
        const avg = (rows) => (rows.length ? rows.reduce((a, r) => a + r.value, 0) / rows.length : null);
        const trip = (id) => { const l = L(id); return l && l.everyMs ? clamp(l.everyMs / 60000 / 3, 3.5, 11) : 7; };
        const ago = (id) => { const l = L(id); return l && l.lastAt ? SC.ago(l.lastAt) : null; };
        const sats = live.layers.filter((l) => l.kind === 'satellite'), satOn = sats.filter(isLive), newest = live.newestSatellite;
        const sst = avg(rowsOf('sea_surface_temperature')), wave = avg(rowsOf('wave_height'));
        const wind = live.map.wind || [], windKmh = wind.length ? (wind.reduce((a, p) => a + p.ws, 0) / wind.length) * 3.6 : null;
        let from = null; if (wind.length) { let u = 0, v = 0; wind.forEach((p) => { const a = (p.wd * Math.PI) / 180; u += Math.sin(a) * p.ws; v += Math.cos(a) * p.ws; }); from = compass((Math.atan2(u, v) * 180) / Math.PI); }
        const pm = avg(rowsOf('pm25', (r) => r.kind === 'model'));
        const cls = L('sensecap-classrooms'), bus = L('sensecap-buses'), car = L('sensecap-cars');
        const co2 = avg(rowsOf('co2', (r) => r.source === 'sensecap-classrooms')), ownT = avg(rowsOf('temperature', (r) => r.source === 'sensecap-buses' || r.source === 'sensecap-cars'));
        const offT = avg(rowsOf('temperature', (r) => r.kind === 'reference-station'));
        const off = live.layers.filter((l) => l.group === 'official' && l.state !== 'planned' && l.state !== 'candidate'), offOn = off.filter(isLive);
        const ctx = live.layers.filter((l) => l.group === 'context'), ctxOn = ctx.filter(isLive), gt = L('gtfs-public-transport');
        const veh = [bus, car].filter(Boolean), vehN = veh.reduce((a, l) => a + (l.sensors || 0), 0), vehF = veh.reduce((a, l) => a + (l.fresh || 0), 0);
        const tags = [
          { y: 16, h: 118, col: COL.model, from: [[150, 96], [330, 112]], id: newest ? newest.id : (sats[0] || {}).id, on: satOn.length > 0, trip: 9, title: T('Satellites', 'Δορυφόροι'), big: satOn.length + T(' of ', ' από ') + sats.length,
            lines: [T('Heat, haze, plants, sea colour', 'Ζέστη, θολούρα, φυτά, χρώμα θάλασσας'), newest ? T('Newest: ', 'Νεότερο: ') + nm(newest) : T('None is answering right now', 'Κανένας δεν απαντά τώρα'), newest ? SC.ago(newest.at) : null] },
          { y: 150, h: 96, col: COL.model, from: [[300, 352]], id: 'openmeteo-weather', on: on('openmeteo-weather'), trip: trip('openmeteo-weather'), title: T('Weather model', 'Μοντέλο καιρού'), big: windKmh == null ? '' : num(windKmh) + ' km/h',
            lines: [from ? T('Wind from the ', 'Άνεμος από ') + from : null, T('Squares about 11 km wide, ', 'Τετράγωνα περίπου 11 km, ') + (ago('openmeteo-weather') || '')] },
          { y: 262, h: 96, col: COL.model, from: [[340, GY + 14]], id: 'openmeteo-air', on: on('openmeteo-air'), trip: trip('openmeteo-air'), title: T('Air model', 'Μοντέλο αέρα'), big: pm == null ? '' : num(pm) + ' µg/m³',
            lines: [T('Fine particles in each square', 'Λεπτά σωματίδια σε κάθε τετράγωνο'), T('Not one street, a whole square', 'Όχι ένας δρόμος, όλο το τετράγωνο')] },
          { y: 374, h: 96, col: COL.own, from: [[111, GROUND - 76]], id: 'sensecap-classrooms', on: on('sensecap-classrooms'), trip: 3.5, title: T('Classrooms', 'Τάξεις'), big: co2 != null ? num(co2) + ' ppm' : '',
            lines: [cls && cls.sensors ? T(cls.fresh + ' of ' + cls.sensors + ' sensors, ', cls.fresh + ' από ' + cls.sensors + ' αισθητήρες, ') + (ago('sensecap-classrooms') || '') : T('No classroom sensor reports yet', 'Κανένας αισθητήρας τάξης ακόμη'), T('CO₂, temperature, humidity', 'CO₂, θερμοκρασία, υγρασία')] },
          { y: 486, h: 96, col: COL.own, from: [[268, GROUND - 17]], id: bus ? 'sensecap-buses' : 'sensecap-cars', on: veh.some(isLive), trip: 3.5, title: T('Buses and cars', 'Οχήματα'), big: vehN ? vehF + T(' of ', ' από ') + vehN : '',
            lines: [ownT != null ? T('Air around them ', 'Ο αέρας γύρω τους ') + num(ownT) + ' °C' : T('No vehicle reports right now', 'Κανένα όχημα δεν στέλνει τώρα'), T('Only counted, never mapped', 'Μόνο μετριούνται, ποτέ σε χάρτη')] },
          { y: 598, h: 96, col: COL.official, from: [[330, GROUND - 98]], id: (offOn[0] || off[0] || {}).id, on: offOn.length > 0, trip: trip((offOn[0] || {}).id), title: T('Official stations', 'Επίσημοι σταθμοί'), big: offT != null ? num(offT) + ' °C' : '',
            lines: [T('Airports and weather masts', 'Αεροδρόμια και μετεωρολογικοί ιστοί'), offOn.length + T(' of ', ' από ') + off.length + T(' answering', ' απαντούν')] },
          { y: 710, h: 96, col: COL.context, from: [[440, GROUND - 22]], id: gt ? gt.id : (ctx[0] || {}).id, on: ctxOn.length > 0, trip: 11, title: T('City context', 'Πλαίσιο πόλης'), big: gt && gt.count ? num(gt.count) : '',
            lines: [gt ? T('Bus stops in the timetables', 'Στάσεις στα δρομολόγια') : null, (ctx.length - ctxOn.length) ? T((ctx.length - ctxOn.length) + ' more not connected yet', (ctx.length - ctxOn.length) + ' ακόμη δεν έχουν συνδεθεί') : null] },
          { y: 822, h: 96, col: COL.model, from: [[240, SEA + 110]], id: 'openmeteo-marine', on: on('openmeteo-marine'), trip: trip('openmeteo-marine'), title: T('Sea model', 'Μοντέλο θάλασσας'), big: sst == null ? '' : num(sst) + ' °C',
            lines: [wave != null ? T('Waves ', 'Κύματα ') + num(wave) + ' m' : null, ago('openmeteo-marine')] },
        ];
        const grid = (live.map.air || []).map((p) => p.pm25).filter((v) => v != null).slice(0, 24);
        wrap.replaceChildren(
          h('div', { class: 'lv-hd' }, h('h3', null, T('Where each layer is born', 'Πού γεννιέται κάθε στρώμα')), liveBadge(), h('span', { class: 'lv-sub' }, T('a dot travels while a source is answering', 'μια τελεία ταξιδεύει όσο απαντά μια πηγή'))),
          h('div', { class: 'lv-sky-full' }, scene(tags, grid, true)),
          h('div', { class: 'lv-sky-narrow' }, scene(tags, grid, false), h('div', { class: 'lv-tags2' }, tags.map(tagNode))),
          h('div', { class: 'lv-brainbar' }, h('i', { 'aria-hidden': 'true' }), h('span', null, h('b', null, T('The master brain', 'Ο κύριος εγκέφαλος')), T(' reads every tag that is lit, ' + (live.counts.connected || 0) + ' layers right now.', ' διαβάζει κάθε ετικέτα που είναι αναμμένη, ' + (live.counts.connected || 0) + ' στρώματα αυτή τη στιγμή.')), grid.length ? h('small', null, T('The numbers in the grid are the model’s fine particles (PM2.5, µg/m³) around Cyprus right now.', 'Οι αριθμοί στο πλέγμα είναι τα λεπτά σωματίδια του μοντέλου (PM2.5, µg/m³) γύρω από την Κύπρο αυτή τη στιγμή.')) : null));
      },
      destroy() { /* CSS animations only: nothing to stop */ },
    };
  }

  SC.layersLive = { island, pulse, compare, sky };
})();
