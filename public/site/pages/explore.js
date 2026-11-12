/*
  Explore data. Five tools over the school sensors and the Met Office stations: Compare, Timeline, Number finder,
  Sensor vs official and Download. Every number shows its source. Route: #/explore?tool=compare|timeline|finder|official|download
  (optional: a=<reading>, b=<reading>, r=24|48|168). Data: /api/config, /api/devices, /api/latest, /api/series,
  /api/cydom, /api/cydom/history (.csv). Nothing here prints a position or a student name; GPS readings are never offered.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/explore.css');

  const MIN = 60000, HOUR = 3600000, DAY = 86400000, KN = 0.514444;
  const GPS = new Set(['4197', '4198']);
  const fill = (el, ...kids) => { el.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false)); return el; };
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const num = SC.num;
  const sgn = (v, d) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 1 : d);
  const hhmm = (t) => SC.time(t), dm = (t) => SC.date(t), dmhm = (t) => SC.date(t) + ' ' + SC.time(t);
  const fmtDur = (ms) => {
    const m = Math.round(ms / MIN);
    if (m < 90) return m + ' min';
    if (m < 2880) { const hh = Math.floor(m / 60), mm = m % 60; return hh + ' h' + (mm ? ' ' + mm + ' min' : ''); }
    return Math.round(m / 1440) + ' ' + T('days', 'ημέρες');
  };
  // custom properties cannot go through the style object of SC.el, so set them on the element
  const cv = (el, color) => { el.style.setProperty('--c', color); return el; };
  const errText = (e) => (e && e.message ? e.message : '');

  /* Cyprus clock (Asia/Nicosia, DST handled by Intl) */
  const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Nicosia', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  function cyOff(t) {
    const p = {};
    partsFmt.formatToParts(t).forEach((x) => { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / MIN) * MIN;
  }
  const cyHour = (t) => (((t + cyOff(t)) % DAY) + DAY) % DAY / HOUR;
  const cyStamp = (t) => new Date(t + cyOff(t)).toISOString().slice(0, 16).replace('T', ' ');

  function errBox(whatEn, whatEl, e, retry) {
    return h('div', { class: 'err', role: 'alert' },
      T('Could not load ' + whatEn + '. ', 'Δεν ήταν δυνατή η φόρτωση ' + whatEl + '. '), errText(e) ? h('span', { class: 'ex-errmsg' }, errText(e) + ' ') : null,
      h('button', { class: 'nm-btn', type: 'button', onclick: retry }, T('Try again', 'Δοκιμάστε ξανά')));
  }
  const infoIcon = (n) => SC.svgEl('svg', { viewBox: '0 0 24 24', width: n || 16, height: n || 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    SC.svgEl('circle', { cx: 12, cy: 12, r: 9.5 }), SC.svgEl('path', { d: 'M12 11v5.5' }), SC.svgEl('path', { d: 'M12 7.6v.1' }));
  const loading = (en, el) => h('div', { class: 'loading', role: 'status' }, T(en || 'Loading', el || 'Φόρτωση'));
  const empty = (en, el) => h('div', { class: 'empty', role: 'status' }, T(en, el));

  /* ---------- statistics ---------- */
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  function stepOf(pts) {
    if (pts.length < 3) return 10 * MIN;
    const d = [];
    for (let i = 1; i < pts.length; i++) d.push(pts[i].t - pts[i - 1].t);
    d.sort((x, y) => x - y);
    return Math.max(MIN, d[d.length >> 1]);
  }
  function summary(pts) {
    if (!pts.length) return null;
    let lo = Infinity, hi = -Infinity, sum = 0, lt = 0, ht = 0;
    pts.forEach((p) => { if (p.v < lo) { lo = p.v; lt = p.t; } if (p.v > hi) { hi = p.v; ht = p.t; } sum += p.v; });
    return { n: pts.length, min: lo, minT: lt, max: hi, maxT: ht, mean: sum / pts.length, last: pts[pts.length - 1], first: pts[0] };
  }
  function nearest(pts, t) {
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t < t) lo = m; else hi = m; }
    return Math.abs(pts[lo].t - t) <= Math.abs(pts[hi].t - t) ? pts[lo] : pts[hi];
  }
  // pairs each point of the sparser series with the nearest point of the other one, within tol
  function pairUp(a, b) {
    if (!a.length || !b.length) return [];
    const sa = stepOf(a), sb = stepOf(b);
    const aRef = sa >= sb, ref = aRef ? a : b, oth = aRef ? b : a;
    const tol = Math.max(5 * MIN, Math.min(15 * MIN, Math.max(sa, sb) / 2 + 1));
    const out = [];
    let j = 0;
    ref.forEach((p) => {
      while (j + 1 < oth.length && Math.abs(oth[j + 1].t - p.t) <= Math.abs(oth[j].t - p.t)) j++;
      if (Math.abs(oth[j].t - p.t) <= tol) { const x = aRef ? p.v : oth[j].v, y = aRef ? oth[j].v : p.v; out.push({ t: p.t, a: x, b: y, d: x - y }); }
    });
    return out;
  }
  function pearson(pr) {
    if (pr.length < 12) return null;
    const ma = mean(pr.map((p) => p.a)), mb = mean(pr.map((p) => p.b));
    let sab = 0, saa = 0, sbb = 0;
    pr.forEach((p) => { sab += (p.a - ma) * (p.b - mb); saa += (p.a - ma) ** 2; sbb += (p.b - mb) ** 2; });
    if (saa < 1e-9 || sbb < 1e-9) return null;
    return sab / Math.sqrt(saa * sbb);
  }

  /* ---------- the chart: one or two axes, gaps, a difference band, period bands and a threshold line ---------- */
  function niceTicks(lo, hi, want) {
    if (!(hi > lo)) { const c = lo || 0; lo = c - 1; hi = c + 1; }
    const raw = (hi - lo) / Math.max(1, want), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    const step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
    for (let v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(10));
    return { ticks, lo: a, hi: b, step };
  }
  function timeTicks(t0, t1, wPx) {
    const want = Math.max(3, Math.floor(wPx / 62)), span = t1 - t0;
    const step = ([1, 2, 3, 4, 6, 12, 24, 48].map((x) => x * HOUR).find((s) => span / s <= want)) || 72 * HOUR;
    const off = cyOff(t0), out = [];
    for (let t = Math.ceil((t0 + off) / step) * step - off; t <= t1; t += step) out.push({ t, day: (((t + off) % DAY) + DAY) % DAY < MIN, step });
    return out;
  }
  const decOf = (s) => (s.dec != null ? s.dec : 1);
  const withUnit = (v, s) => num(v, decOf(s)) + (s.unit ? ' ' + s.unit : '');

  function exChart(box, o) {
    const NSV = SC.svgEl;
    const wrap = h('div', { class: 'ex-chartw' });
    const tip = h('div', { class: 'ex-tip', hidden: true });
    const readout = h('div', { class: 'ex-readout' }, o.hint || T('Move over the chart, or press the arrow keys, to read a value.', 'Μετακινήστε τον δείκτη πάνω στο διάγραμμα ή πατήστε τα βέλη για να δείτε μια τιμή.'));
    fill(box, wrap, readout);
    const series = o.series.filter((s) => s.pts && s.pts.length);
    if (!series.length) { fill(box, h('div', { class: 'empty', role: 'status' }, T('No readings to draw.', 'Δεν υπάρχουν μετρήσεις για σχεδίαση.'))); return { destroy() {} }; }
    const gapMs = o.gap || 90 * MIN;
    let geo = null, cursor = null;

    function draw() {
      const W = Math.max(280, Math.round(box.clientWidth || 640)), small = W < 520, H = o.h || (small ? 250 : 310);
      const dual = series.some((s) => s.axis === 1);
      const M = { l: 48, r: dual ? 48 : 14, t: 20, b: 28 }, pw = W - M.l - M.r, ph = H - M.t - M.b, t0 = o.t0, t1 = o.t1;
      const X = (t) => M.l + ((t - t0) / (t1 - t0)) * pw;
      const axes = [0, 1].map((ax) => {
        const vals = [];
        series.filter((s) => (s.axis || 0) === ax).forEach((s) => s.pts.forEach((p) => vals.push(p.v)));
        (o.lines || []).filter((l) => (l.axis || 0) === ax).forEach((l) => vals.push(l.v));
        if (!vals.length) return null;
        let lo = Infinity, hi = -Infinity;
        vals.forEach((v) => { if (v < lo) lo = v; if (v > hi) hi = v; });
        const pad = (hi - lo) * 0.07 || Math.abs(hi) * 0.02 || 1;
        return niceTicks(lo - pad, hi + pad, small ? 4 : 5);
      });
      if (!axes[0] && axes[1]) { axes[0] = axes[1]; }
      const Y = (ax) => { const a = axes[ax] || axes[0]; return (v) => M.t + (1 - (v - a.lo) / (a.hi - a.lo)) * ph; };
      const svg = NSV('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': o.label || '', class: 'ex-svg', tabindex: '0', focusable: 'true' });
      // grid and axes
      const grid = NSV('g', { class: 'ex-axes' });
      axes[0].ticks.forEach((v) => {
        const y = Y(0)(v);
        grid.append(NSV('line', { x1: M.l, x2: W - M.r, y1: y, y2: y }), NSV('text', { x: M.l - 7, y: y + 4, 'text-anchor': 'end', fill: dual ? series.find((s) => !s.axis).color : null }, num(v, axes[0].step < 1 ? (axes[0].step < 0.1 ? 2 : 1) : 0)));
      });
      if (dual && axes[1]) axes[1].ticks.forEach((v) => grid.append(NSV('text', { x: W - M.r + 7, y: Y(1)(v) + 4, 'text-anchor': 'start', fill: series.find((s) => s.axis === 1).color }, num(v, axes[1].step < 1 ? (axes[1].step < 0.1 ? 2 : 1) : 0))));
      const unit0 = (series.find((s) => !s.axis) || series[0]).unit;
      if (unit0) grid.append(NSV('text', { x: M.l - 7, y: 10, 'text-anchor': 'end', class: 'ex-unit', fill: dual ? series.find((s) => !s.axis).color : null }, unit0));
      const s1 = dual ? series.find((s) => s.axis === 1) : null;
      if (s1 && s1.unit) grid.append(NSV('text', { x: W - M.r + 7, y: 10, 'text-anchor': 'start', class: 'ex-unit', fill: s1.color }, s1.unit));
      timeTicks(t0, t1, pw).forEach((k) => {
        const x = X(k.t);
        // a midnight line carries its date at the top (as in the picture); the time stays at the bottom. From one tick a day up the date is the label.
        grid.append(NSV('line', { x1: x, x2: x, y1: M.t, y2: M.t + ph, class: k.day ? 'ex-day' : '' }),
          NSV('text', { x, y: H - 9, 'text-anchor': 'middle' }, k.step >= DAY ? dm(k.t) : hhmm(k.t)));
        if (k.day && k.step < DAY) grid.append(NSV('text', { x, y: M.t - 7, 'text-anchor': 'middle', class: 'ex-major' }, dm(k.t)));
      });
      svg.append(grid);
      // period bands, then gaps
      const bandG = NSV('g', { class: 'ex-bands' });
      const addBand = (from, to, color, label, op, labelColor) => {
        const a = Math.max(M.l, X(Math.max(from, t0))), b = Math.min(W - M.r, X(Math.min(to, t1)));
        if (b - a < 1) return;
        bandG.append(NSV('rect', { x: a, y: M.t, width: b - a, height: ph, fill: color, opacity: op }));
        // the label may be wider than a narrow band (as in the picture); it is kept inside the plot
        if (label && b - a > 14) { const lw = label.length * 5.6, cx = Math.max(M.l + lw / 2, Math.min(W - M.r - lw / 2, (a + b) / 2)); bandG.append(NSV('text', { x: cx, y: M.t + 12, 'text-anchor': 'middle', fill: labelColor || color, class: 'ex-bandl' }, label)); }
      };
      (o.bands || []).forEach((b) => addBand(b.from, b.to, b.color || '#E07F3F', b.label, 0.22));
      if (o.gaps !== false) series.forEach((s) => {
        const list = [];
        if (s.pts[0].t - t0 > gapMs) list.push([t0, s.pts[0].t]);
        for (let i = 1; i < s.pts.length; i++) if (s.pts[i].t - s.pts[i - 1].t > gapMs) list.push([s.pts[i - 1].t, s.pts[i].t]);
        if (t1 - s.pts[s.pts.length - 1].t > gapMs) list.push([s.pts[s.pts.length - 1].t, t1]);
        list.slice(0, 14).forEach(([a, b]) => addBand(a, b, '#9FB2CA', list.length <= 4 ? (s.gapLabel || T('No reading', 'Χωρίς μέτρηση')) : '', 0.16, '#F2CF86'));
      });
      svg.append(bandG);
      // difference band between two series on the same axis
      if (o.diff && series[o.diff.a] && series[o.diff.b]) {
        const A = series[o.diff.a], B = series[o.diff.b], Yf = Y(0), g = NSV('g', { class: 'ex-diff' });
        const pr = pairUp(A.pts, B.pts);
        const poly = (pts, color) => g.append(NSV('polygon', { points: pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '), fill: color, opacity: 0.34 }));
        // one polygon per stretch where the same line is higher, so there are no seams between thin slices
        const runs = [];
        let cur = null;
        const flush = () => { if (cur && cur.top.length > 1) runs.push(cur); cur = null; };
        const begin = (sign) => { cur = { sign, top: [], bot: [] }; };
        pr.forEach((p, i) => {
          const prev = pr[i - 1], sign = p.d >= 0 ? 1 : -1;
          if (prev && p.t - prev.t > gapMs) flush();
          if (cur && sign !== cur.sign) {
            const f = prev.d / (prev.d - p.d), xc = X(prev.t + (p.t - prev.t) * f), yc = Yf(prev.a + (p.a - prev.a) * f);
            cur.top.push([xc, yc]); cur.bot.push([xc, yc]);
            flush(); begin(sign);
            cur.top.push([xc, yc]); cur.bot.push([xc, yc]);
          }
          if (!cur) begin(sign);
          cur.top.push([X(p.t), Yf(p.a)]); cur.bot.push([X(p.t), Yf(p.b)]);
        });
        flush();
        runs.forEach((r) => poly(r.top.concat(r.bot.reverse()), r.sign > 0 ? o.diff.pos : o.diff.neg));
        svg.append(g);
      }
      // threshold lines
      (o.lines || []).forEach((l) => {
        const y = Y(l.axis || 0)(l.v);
        svg.append(NSV('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, stroke: l.color || '#F2B24C', 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }),
          NSV('text', { x: W - M.r - 4, y: y - 5, 'text-anchor': 'end', fill: l.color || '#F2B24C', class: 'ex-bandl' }, l.label || ''));
      });
      // lines
      series.forEach((s) => {
        const Yf = Y(s.axis || 0), runs = [];
        let cur = null, prev = null;
        s.pts.forEach((p) => {
          if (p.t < t0 || p.t > t1) return;
          if (prev == null || p.t - prev > (s.gap || gapMs)) { cur = []; runs.push(cur); }
          cur.push(p); prev = p.t;
        });
        let d = '';
        const dots = [];
        runs.forEach((r) => {
          if (r.length === 1) { dots.push(r[0]); return; }
          r.forEach((p, i) => { d += (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Yf(p.v).toFixed(1); });
        });
        const g = NSV('g', { class: 'ex-ser' });
        if (d) g.append(NSV('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dash || null, opacity: s.opacity || 1 }));
        dots.forEach((p) => g.append(NSV('circle', { cx: X(p.t), cy: Yf(p.v), r: 2.6, fill: s.color })));
        svg.append(g);
      });
      // hover layer
      const hov = NSV('g', { class: 'ex-hov', visibility: 'hidden' });
      const vline = NSV('line', { y1: M.t, y2: M.t + ph, class: 'ex-vline' });
      hov.append(vline);
      const dotEls = series.map((s) => { const c = NSV('circle', { r: 4.5, fill: s.color, stroke: '#0c1626', 'stroke-width': 1.5, visibility: 'hidden' }); hov.append(c); return c; });
      svg.append(hov);
      const catcher = NSV('rect', { x: M.l, y: M.t, width: pw, height: ph, fill: 'transparent', class: 'ex-catch' });
      svg.append(catcher);
      geo = { W, M, pw, X, Y, t0, t1 };

      function show(tc) {
        if (tc == null) return;
        cursor = tc;
        const x = X(tc);
        vline.setAttribute('x1', x); vline.setAttribute('x2', x);
        hov.setAttribute('visibility', 'visible');
        const vals = series.map((s, i) => {
          const p = nearest(s.pts, tc), ok = Math.abs(p.t - tc) <= (s.gap || gapMs);
          dotEls[i].setAttribute('visibility', ok ? 'visible' : 'hidden');
          if (ok) { dotEls[i].setAttribute('cx', X(p.t)); dotEls[i].setAttribute('cy', Y(s.axis || 0)(p.v)); }
          return ok ? p : null;
        });
        const bits = [];
        const rows = series.map((s, i) => vals[i] ? cv(h('div', { class: 'ex-tp' }, h('i'), h('span', null, s.name), h('b', null, withUnit(vals[i].v, s))), s.color) : null);
        series.forEach((s, i) => { if (vals[i]) bits.push(s.name + ' ' + withUnit(vals[i].v, s)); });
        let diffTxt = '';
        if (o.diff && vals[o.diff.a] && vals[o.diff.b]) {
          const d = vals[o.diff.a].v - vals[o.diff.b].v, s0 = series[o.diff.a];
          diffTxt = (d >= 0 ? (o.diff.posLabel || T('First higher by', 'Το πρώτο υψηλότερο κατά')) : (o.diff.negLabel || T('Second higher by', 'Το δεύτερο υψηλότερο κατά'))) + ' ' + num(Math.abs(d), decOf(s0)) + (s0.unit ? ' ' + s0.unit : '');
          rows.push(h('div', { class: 'ex-tp ex-tpd' }, h('span', null, diffTxt)));
          bits.push(diffTxt);
        }
        fill(tip, h('span', { class: 'ex-tt' }, dmhm(tc)), rows.filter(Boolean).slice(0, 10));
        tip.hidden = false;
        const tw = tip.offsetWidth || 160;
        tip.style.left = Math.max(4, Math.min(W - tw - 4, x + 12)) + 'px';
        tip.style.top = M.t + 4 + 'px';
        readout.textContent = dmhm(tc) + (bits.length ? ' · ' + bits.join(' · ') : ' · ' + T('no reading at this time', 'καμία μέτρηση αυτή την ώρα'));
      }
      function hide() {
        if (o.pin != null && series.some((s) => s.pts.length)) { show(nearest(series[0].pts, o.pin).t); return; }   // back to the pinned point (the biggest gap)
        hov.setAttribute('visibility', 'hidden'); tip.hidden = true; cursor = null;
      }
      function atPointer(e) {
        const r = catcher.getBoundingClientRect(), x = ((e.clientX - r.left) / (r.width || 1)) * pw;
        const t = t0 + (x / pw) * (t1 - t0);
        let best = null;
        series.forEach((s) => { const p = nearest(s.pts, t); if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p; });
        show(best && best.t);
      }
      catcher.addEventListener('pointermove', atPointer);
      catcher.addEventListener('pointerdown', atPointer);
      catcher.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
      svg.addEventListener('keydown', (e) => {
        if (!series.length) return;
        const base = series[0].pts;
        if (e.key === 'Escape') { hide(); return; }
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        let i = cursor == null ? base.length - 1 : base.indexOf(nearest(base, cursor));
        const stepN = e.shiftKey ? 12 : 1;
        if (e.key === 'ArrowLeft') i -= stepN; else if (e.key === 'ArrowRight') i += stepN; else i = e.key === 'Home' ? 0 : base.length - 1;
        show(base[Math.max(0, Math.min(base.length - 1, i))].t);
      });
      wrap.replaceChildren(svg, tip);
      if (cursor != null) show(cursor); else if (o.pin != null) show(nearest(series[0].pts, o.pin).t);
    }
    draw();
    let timer = 0;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => { if (box.isConnected && Math.abs((box.clientWidth || 0) - geo.W) > 2) draw(); }, 120); }) : null;
    if (ro) ro.observe(box);
    return { destroy() { clearTimeout(timer); if (ro) ro.disconnect(); } };
  }

  /* ---------- sources (a school sensor or a Met Office station) and readings ---------- */
  const DEFAULT_NAMES = { 4097: ['Air temperature', '°C'], 4098: ['Air humidity', '%RH'], 4099: ['Light intensity', 'Lux'], 4100: ['CO2', 'ppm'], 4101: ['Barometric pressure', 'Pa'] };
  const MID_EL = { 4097: 'Θερμοκρασία αέρα', 4098: 'Υγρασία αέρα', 4099: 'Φωτεινότητα', 4100: 'CO₂', 4101: 'Βαρομετρική πίεση' };
  const UNIT_FIX = { '%RH': '%', Lux: 'lux' };
  const ST_KEYS = [
    ['temp', 'Temperature', 'Θερμοκρασία', '°C', 1, 'temp'], ['hum', 'Humidity', 'Υγρασία', '%', 0, 'hum'],
    ['ws10', 'Wind 10 m', 'Άνεμος 10 m', 'm/s', 1, 'wind'], ['ws2', 'Wind 2 m', 'Άνεμος 2 m', 'm/s', 1, 'wind2'],
    ['pmsl', 'Pressure', 'Πίεση', 'hPa', 1, 'pres'], ['pstn', 'Station pressure', 'Πίεση σταθμού', 'hPa', 1, 'pres2'],
    ['rain10', 'Rain (10 min)', 'Βροχή (10 λεπτά)', 'mm', 1, 'rain'], ['dsr', 'Direct sun', 'Άμεσος ήλιος', 'W/m²', 0, 'sun'],
    ['tmax', 'Day max', 'Μέγιστη ημέρας', '°C', 1, 'tmax'], ['tmin', 'Day min', 'Ελάχιστη ημέρας', '°C', 1, 'tmin'],
  ];
  const FAMS = [['temp', 'Temperature', 'Θερμοκρασία'], ['hum', 'Humidity', 'Υγρασία'], ['wind', 'Wind 10 m', 'Άνεμος 10 m'], ['pres', 'Pressure', 'Πίεση']];
  let E = null;                 // the loaded sources, see loadEnv
  const RD = new Map();         // readings by id

  const famOfMid = (mid, name) => ({ 4097: 'temp', 4098: 'hum', 4099: 'light', 4100: 'co2', 4101: 'pres' }[mid] || (/wind speed/i.test(name) ? 'wind' : /temperature/i.test(name) ? 'temp' : /humidity/i.test(name) ? 'hum' : /pressure/i.test(name) ? 'pres' : 'other'));
  function makeReading(src, key) {
    const id = src.id + '|' + key;
    if (RD.has(id)) return RD.get(id);
    let r;
    if (src.kind === 'sensor') {
      const cfg = E.names[key] || [key, ''];
      let unit = UNIT_FIX[cfg[1]] || cfg[1] || '', conv = (v) => v;
      if (unit === 'Pa') { unit = 'hPa'; conv = (v) => v / 100; }
      const en = String(cfg[0]).replace(/CO2/g, 'CO₂');
      r = { id, src, key, kind: 'sensor', name: T(en, MID_EL[key] || en), unit, dec: unit === 'ppm' || unit === 'lux' ? 0 : 1, fam: famOfMid(key, cfg[0]), conv };
    } else {
      const k = ST_KEYS.find((x) => x[0] === key);
      if (!k) return null;
      r = { id, src, key, kind: 'station', name: T(k[1], k[2]), unit: k[3], dec: k[4], fam: k[5], conv: (v) => v, note: key === 'ws10' ? T('Wind is converted from knots to m/s.', 'Ο άνεμος μετατρέπεται από κόμβους σε m/s.') : key === 'pmsl' ? T('Pressure reduced to sea level.', 'Πίεση αναγμένη στη στάθμη της θάλασσας.') : '' };
    }
    r.label = src.name + ' · ' + r.name;
    RD.set(id, r);
    return r;
  }
  const readingsOf = (src) => (src.kind === 'sensor' ? src.mids.map((m) => makeReading(src, m)) : ST_KEYS.map((k) => makeReading(src, k[0]))).filter(Boolean);
  function getReading(id) {
    if (!id || !E) return null;
    const i = id.lastIndexOf('|');
    const src = E.byId.get(id.slice(0, i));
    if (!src) return null;
    const key = id.slice(i + 1);
    if (src.kind === 'sensor' && !src.mids.includes(key)) return null;
    return makeReading(src, key);
  }
  const sourceText = (r) => (r.kind === 'sensor'
    ? T('School sensor “' + r.src.name + '”' + (r.src.group && r.src.group !== r.src.name ? ' (' + r.src.group + ')' : '') + ', as recorded by our server', 'Αισθητήρας σχολείου «' + r.src.name + '»' + (r.src.group && r.src.group !== r.src.name ? ' (' + r.src.group + ')' : '') + ', όπως καταγράφεται από τον διακομιστή μας')
    : T('Met Office station ' + r.src.name + ' (dom.org.cy), shown as published', 'Σταθμός Μετεωρολογικής Υπηρεσίας ' + r.src.name + ' (dom.org.cy), όπως δημοσιεύεται')) + (r.note ? '. ' + r.note : '');
  const sensorsOf = () => E.sources.filter((s) => s.kind === 'sensor');
  const stationsOf = () => E.sources.filter((s) => s.kind === 'station');

  async function loadEnv() {
    const safe = (p) => p.then((v) => ({ v }), (e) => ({ e }));
    const [cfg, dev, st, lat] = await Promise.all([safe(SC.cached('/api/config', 300000)), safe(SC.cached('/api/devices', 60000)), safe(SC.cached('/api/cydom', 60000)), safe(SC.cached('/api/latest', 30000))]);
    const n = { demo: false, names: { ...DEFAULT_NAMES }, sources: [], byId: new Map(), notes: [], latest: {}, feedTime: null };
    if (cfg.v) { n.demo = !!cfg.v.demo; Object.assign(n.names, cfg.v.names || {}); }
    if (lat.v && typeof lat.v === 'object') n.latest = lat.v;
    if (dev.v && Array.isArray(dev.v)) {
      dev.v.forEach((d) => {
        const mids = (d.measurements || []).map(String).filter((m) => !GPS.has(m));
        if (!mids.length) return;
        n.sources.push({ id: 'd:' + d.eui, kind: 'sensor', eui: d.eui, name: d.name || d.eui, group: d.group || '', moving: (d.measurements || []).some((m) => GPS.has(String(m))), mids, online: !!d.online, lastSeen: d.lastSeen ? Date.parse(d.lastSeen) : null, lat: d.lat, lng: d.lng });
      });
    } else n.notes.push({ en: 'the school sensors', el: 'οι αισθητήρες των σχολείων', e: dev.e });
    if (st.v && Array.isArray(st.v.points)) {
      st.v.points.forEach((p) => n.sources.push({ id: 'm:' + p.id, kind: 'station', st: p.id, name: p.name || p.id, group: '', lat: p.lat, lng: p.lng, time: p.time ? Date.parse(p.time) || p.time : null }));
      const ft = st.v.feedTime;
      n.feedTime = ft == null ? null : typeof ft === 'number' ? ft : Date.parse(ft);
    } else n.notes.push({ en: 'the Met Office stations', el: 'οι σταθμοί της Μετεωρολογικής Υπηρεσίας', e: st.e });
    if (!dev.v && !st.v) throw dev.e || st.e || new Error('No data');
    n.sources.sort((a, b) => (a.kind === b.kind ? (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name) : a.kind === 'sensor' ? -1 : 1));
    n.sources.forEach((s) => n.byId.set(s.id, s));
    E = n;
    RD.clear();
    return n;
  }

  // distance in km between a sensor and a station (rounded positions are good enough for "nearest")
  function kmBetween(a, b) {
    if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return null;
    const R = 6371, rad = Math.PI / 180, dLa = (b.lat - a.lat) * rad, dLo = (b.lng - a.lng) * rad;
    const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function stationsByDistance(sensor) {
    const list = stationsOf().map((s) => ({ s, km: sensor ? kmBetween(sensor, s) : null }));
    list.sort((a, b) => (a.km == null ? 1e9 : a.km) - (b.km == null ? 1e9 : b.km) || a.s.name.localeCompare(b.s.name));
    return list;
  }
  const kmText = (km) => (km == null ? '' : km < 5 ? T('under 5 km', 'κάτω από 5 km') : T('about ' + Math.round(km / 5) * 5 + ' km', 'περίπου ' + Math.round(km / 5) * 5 + ' km'));

  /* ---------- fetching a series (cached for a minute) ---------- */
  async function fetchPts(r, hours) {
    const from = Date.now() - hours * HOUR;
    let pts;
    if (r.kind === 'sensor') {
      const days = Math.min(30, Math.max(1, Math.ceil(hours / 24)));
      const rows = await SC.cached('/api/series?eui=' + encodeURIComponent(r.src.eui) + '&mid=' + encodeURIComponent(r.key) + '&days=' + days, 60000);
      pts = (Array.isArray(rows) ? rows : []).map((p) => ({ t: typeof p.t === 'number' ? p.t : Date.parse(p.t), v: r.conv(Number(p.v)) }));
    } else {
      const js = await SC.cached('/api/cydom/history?station=' + encodeURIComponent(r.src.st) + '&hours=' + Math.min(720, Math.ceil(hours)) + '&keys=' + encodeURIComponent(r.key), 60000);
      const i = ((js && js.keys) || []).indexOf(r.key), u = js && js.units && js.units[r.key];
      const knots = /kn/i.test((u && u.unit) || (r.key === 'ws10' ? 'kn' : ''));
      pts = i < 0 ? [] : (js.rows || []).filter((row) => row[i + 1] != null).map((row) => ({ t: Number(row[0]), v: Number(row[i + 1]) * (knots ? KN : 1) }));
    }
    return pts.filter((p) => isFinite(p.t) && isFinite(p.v) && p.t >= from).sort((a, b) => a.t - b.t);
  }

  /* ---------- small widgets ---------- */
  function pickField(labelText, control, cls) { return h('div', { class: 'ex-pick' + (cls ? ' ' + cls : '') }, h('label', { for: control.id }, labelText), control); }
  let uid = 0;
  function srcSelect(srcs, cur, onPick, o) {
    o = o || {};
    const sel = h('select', { id: 'ex-s' + ++uid, class: 'ex-sel', onchange: () => onPick(sel.value) });
    if (o.none) sel.append(h('option', { value: '' }, o.none));
    const groups = new Map();
    srcs.forEach((s) => {
      const g = s.kind === 'sensor' ? (s.group || T('School sensors', 'Αισθητήρες σχολείων')) : T('Met Office stations', 'Σταθμοί Μετεωρολογικής Υπηρεσίας');
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    });
    groups.forEach((list, g) => { const og = h('optgroup', { label: g }); list.forEach((s) => og.append(h('option', { value: s.id }, o.label ? o.label(s) : s.name))); sel.append(og); });
    sel.value = cur || '';
    if (sel.value !== (cur || '')) sel.selectedIndex = 0;
    return sel;
  }
  function readingSelect(src, cur, onPick, filter) {
    const sel = h('select', { id: 'ex-s' + ++uid, class: 'ex-sel', onchange: () => onPick(sel.value) });
    (src ? readingsOf(src).filter(filter || (() => true)) : []).forEach((r) => sel.append(h('option', { value: r.key }, r.name + (r.unit ? ' (' + r.unit + ')' : ''))));
    sel.value = cur;
    if (sel.value !== cur) sel.selectedIndex = 0;
    return sel;
  }
  function chips(items, current, onPick, label) {
    const row = h('div', { class: 'ex-chips', role: 'group', 'aria-label': label });
    const btns = new Map();
    const set = (id) => btns.forEach((b, k) => { b.classList.toggle('on', k === id); b.setAttribute('aria-pressed', String(k === id)); });
    items.forEach(([id, text]) => { const b = h('button', { class: 'ex-chip', type: 'button', 'aria-pressed': 'false', onclick: () => { set(id); onPick(id); } }, text); btns.set(id, b); row.append(b); });
    set(current);
    return { el: row, set };
  }
  const RANGES = [[24, T('24 h', '24 ώρες')], [48, T('48 h', '48 ώρες')], [168, T('7 days', '7 ημέρες')]];
  function rangeBar(cur, onPick, list, label) {
    const row = h('span', { class: 'ex-rng', role: 'group', 'aria-label': label || T('Period', 'Περίοδος') });
    const btns = new Map();
    const set = (v) => btns.forEach((b, k) => { b.classList.toggle('on', k === v); b.setAttribute('aria-pressed', String(k === v)); });
    (list || RANGES).forEach(([v, text]) => { const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { set(v); onPick(v); } }, text); btns.set(v, b); row.append(b); });
    set(cur);
    return { el: row, set };
  }
  function srcLine(readings) {
    const seen = new Set(), items = [];
    readings.filter(Boolean).forEach((r) => { const t = sourceText(r); if (!seen.has(t)) { seen.add(t); items.push(h('li', null, t)); } });
    return h('div', { class: 'ex-src' }, h('b', null, items.length > 1 ? T('Sources', 'Πηγές') : T('Source', 'Πηγή')), h('ul', null, items));
  }
  function staleNote(r, pts) {
    if (!pts.length) return null;
    const last = pts[pts.length - 1].t;
    return Date.now() - last > 3 * HOUR ? h('p', { class: 'ex-stale', role: 'status' }, T(r.label + ': last reading ' + SC.ago(last) + ' (' + dmhm(last) + ').', r.label + ': τελευταία μέτρηση ' + SC.ago(last) + ' (' + dmhm(last) + ').')) : null;
  }
  function legend(items) {
    return h('div', { class: 'ex-legend' }, items.map((it) => cv(h('span', null, h('i', { class: it.box ? 'bx' : 'ln' }), it.text), it.color)));
  }
  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function saveCsv(name, rows) {
    const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name, hidden: true });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'reading';
  // 2-col table: used under charts to show the numbers behind a line
  function statTable(items) {
    return h('div', { class: 'nm-table-wrap' }, h('table', { class: 'nm-table ex-table' },
      h('thead', null, h('tr', null, [T('Reading', 'Μέτρηση'), T('Latest', 'Τελευταία'), T('Lowest', 'Χαμηλότερη'), T('Highest', 'Υψηλότερη'), T('Average', 'Μέσος όρος'), T('Readings', 'Μετρήσεις')].map((x, i) => h('th', { class: i ? 'n' : '' }, x)))),
      h('tbody', null, items.map(({ r, pts, color }) => {
        const s = summary(pts), u = r.unit ? ' ' + r.unit : '';
        return h('tr', null,
          h('td', null, h('span', { class: 'ex-dot', style: { background: color } }), h('b', null, r.label)),
          s ? [h('td', { class: 'n' }, num(s.last.v, r.dec) + u, h('small', null, ' ' + hhmm(s.last.t))), h('td', { class: 'n' }, num(s.min, r.dec) + u, h('small', null, ' ' + dmhm(s.minT))), h('td', { class: 'n' }, num(s.max, r.dec) + u, h('small', null, ' ' + dmhm(s.maxT))), h('td', { class: 'n' }, num(s.mean, r.dec) + u), h('td', { class: 'n' }, String(s.n))]
            : h('td', { class: 'n', colspan: 5 }, T('No readings in this period', 'Καμία μέτρηση σε αυτή την περίοδο')));
      }))));
  }

  async function pool(items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; try { out[k] = { v: await fn(items[k]) }; } catch (e) { out[k] = { e }; } }
    }));
    return out;
  }
  // columns of readings joined on the minute: [[label, pts, dec]] -> rows for a CSV
  function mergedRows(cols) {
    const maps = cols.map((c) => { const m = new Map(); c[1].forEach((p) => m.set(Math.round(p.t / MIN), p.v)); return m; });
    const keys = [...new Set(maps.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
    const head = [T('time (Cyprus)', 'ώρα (Κύπρος)'), 'time_utc'].concat(cols.map((c) => c[0]));
    return [head].concat(keys.map((k) => [cyStamp(k * MIN), new Date(k * MIN).toISOString()].concat(maps.map((m, i) => (m.has(k) ? +m.get(k).toFixed(cols[i][2] == null ? 2 : Math.max(2, cols[i][2])) : '')))));
  }
  const COL = { a: '#E07F3F', b: '#4C8BEA', ok: '#59d98e', violet: '#8f7bff', gold: '#F2B24C' };
  const SCHOOL_COLORS = ['#4C8BEA', '#E07F3F', '#59d98e', '#8f7bff', '#F2B24C', '#4CCBEA', '#F2A56B', '#FF8FA3'];
  const ariaOf = (rs, datas, hours) => rs.map((r, i) => {
    const s = summary(datas[i]);
    return s ? r.label + ': ' + T('from ' + num(s.min, r.dec) + ' to ' + num(s.max, r.dec) + ' ' + r.unit + ', latest ' + num(s.last.v, r.dec) + ' ' + r.unit, 'από ' + num(s.min, r.dec) + ' έως ' + num(s.max, r.dec) + ' ' + r.unit + ', τελευταία ' + num(s.last.v, r.dec) + ' ' + r.unit) : r.label + ': ' + T('no readings', 'καμία μέτρηση');
  }).join('. ') + '. ' + T('Last ' + rangeWord(hours) + '.', 'Τελευταίες ' + rangeWord(hours) + '.');
  const rangeWord = (hours) => (hours >= 72 && hours % 24 === 0 ? (hours === 168 ? T('7 days', '7 ημέρες') : hours / 24 + ' ' + T('days', 'ημέρες')) : hours + ' ' + T('hours', 'ώρες'));

  // two selects: a source (sensor or station) and one of its readings. onPick(readingId)
  function readingPicker(title, curId, onPick, o) {
    o = o || {};
    let id = curId || '';
    const rdWrap = h('div');
    const filter = o.filter || (() => true);
    const first = getReading(id);
    const drawRd = () => {
      const r = getReading(id);
      const sel = readingSelect(r ? r.src : null, r ? r.key : '', (key) => { const rr = getReading(id); id = rr.src.id + '|' + key; onPick(id); }, filter);
      sel.disabled = !r;
      fill(rdWrap, pickField(T('Measurement', 'Μέτρηση'), sel));
    };
    const srcSel = srcSelect(o.sources || E.sources, first ? first.src.id : '', (sid) => {
      const src = E.byId.get(sid), prev = getReading(id);
      const list = src ? readingsOf(src).filter(filter) : [];
      id = ((prev && list.find((x) => x.fam === prev.fam)) || list[0] || {}).id || '';
      drawRd(); onPick(id);
    }, { none: o.none });
    drawRd();
    return {
      el: h('div', { class: 'ex-pickpair' }, pickField(title, srcSel), rdWrap),
      get: () => id,
      set(nid) { id = nid || ''; const r = getReading(id); srcSel.value = r ? r.src.id : ''; drawRd(); },
    };
  }
  const hasFam = (s, fam) => readingsOf(s).some((r) => r.fam === fam);
  const defaultReading = (fam) => {
    const sensor = sensorsOf().find((s) => s.online && !s.moving && hasFam(s, fam)) || sensorsOf().find((s) => s.online && hasFam(s, fam)) || sensorsOf().find((s) => hasFam(s, fam));
    const near = sensor && stationsByDistance(sensor)[0];
    const st = (near && near.km != null && near.s) || stationsOf().find((s) => /larnaca|larnaka/i.test(s.name) && /airport|ap\b/i.test(s.name)) || stationsOf().find((s) => /larnaca|larnaka/i.test(s.name)) || stationsOf()[0];
    return { sensor: sensor && readingsOf(sensor).find((r) => r.fam === fam), station: st && readingsOf(st).find((r) => r.fam === fam) };
  };

  /* ---------- tool 1: Compare ---------- */
  function mountCompare(S, slots) {
    const st = S.cmp;
    let tok = 0, chart = null;
    const out = h('div');
    const rng = rangeBar(st.r, (v) => { st.r = v; S.sync(); title.textContent = heading(); run(); });
    const pa = readingPicker(T('Reading A', 'Μέτρηση Α'), st.a, (id) => { st.a = id; S.sync(); run(); });
    const pb = readingPicker(T('Reading B (optional)', 'Μέτρηση Β (προαιρετικά)'), st.b, (id) => { st.b = id; S.sync(); run(); }, { none: T('None', 'Καμία') });
    const heading = () => T('Compare · last ' + rangeWord(st.r), 'Σύγκριση · τελευταίες ' + rangeWord(st.r));
    const title = h('span', { class: 'kpi-label', id: 'ex-mh' }, heading());
    slots.hint(T('Put any two readings on one chart: a school sensor, a Met Office station, or one of each. Readings in different units get their own scale.', 'Βάλτε δύο μετρήσεις στο ίδιο διάγραμμα: αισθητήρα σχολείου, σταθμό της Μετεωρολογικής Υπηρεσίας ή έναν από τον καθένα. Μετρήσεις με διαφορετικές μονάδες έχουν δική τους κλίμακα.'));
    slots.main.append(h('div', { class: 'card-h' }, title, rng.el), h('div', { class: 'ex-picks one' }, pa.el, pb.el), out);
    async function run() {
      const my = ++tok;
      const rs = [getReading(st.a), getReading(st.b)].filter(Boolean);
      if (chart) { chart.destroy(); chart = null; }
      if (!rs.length) { fill(out, empty('Pick a reading above to see it here.', 'Επιλέξτε μια μέτρηση παραπάνω για να τη δείτε εδώ.')); return; }
      fill(out, loading());
      let datas;
      try { datas = await Promise.all(rs.map((r) => fetchPts(r, st.r))); } catch (e) { if (my === tok) fill(out, errBox('the readings', 'των μετρήσεων', e, run)); return; }
      if (my !== tok || !slots.alive()) return;
      const now = Date.now(), t0 = now - st.r * HOUR;
      const box = h('div', { class: 'ex-chartbox' });
      const notes = rs.map((r, i) => (datas[i].length ? staleNote(r, datas[i]) : h('p', { class: 'ex-stale', role: 'status' }, T(r.label + ': no readings in the last ' + rangeWord(st.r) + '. Try a longer period or a different reading.', r.label + ': καμία μέτρηση τις τελευταίες ' + rangeWord(st.r) + '. Δοκιμάστε μεγαλύτερη περίοδο ή άλλη μέτρηση.'))));
      const live = rs.map((r, i) => ({ r, pts: datas[i], color: i ? COL.b : COL.a })).filter((x) => x.pts.length);
      if (!live.length) { fill(out, notes, empty('Nothing to draw. Pick another reading or a longer period.', 'Δεν υπάρχει τίποτα για σχεδίαση. Επιλέξτε άλλη μέτρηση ή μεγαλύτερη περίοδο.')); return; }
      const dual = live.length === 2 && live[0].r.unit !== live[1].r.unit;
      const series = live.map((x, i) => ({ name: x.r.label, color: x.color, pts: x.pts, unit: x.r.unit, dec: x.r.dec, axis: dual && i ? 1 : 0, gapLabel: T('No reading', 'Χωρίς μέτρηση') }));
      fill(out, h('div', { class: 'ex-legendrow' }, legend(live.map((x) => ({ color: x.color, text: x.r.label }))), dual ? h('span', { class: 'ex-note' }, T('Two scales: the left axis is for the first line, the right axis for the second.', 'Δύο κλίμακες: ο αριστερός άξονας ανήκει στην πρώτη γραμμή, ο δεξιός στη δεύτερη.')) : null), box, notes,
        statTable(live), srcLine(live.map((x) => x.r)),
        h('div', { class: 'ex-btnrow' }, h('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: () => saveCsv('compare-' + slug(live[0].r.label) + (live[1] ? '-vs-' + slug(live[1].r.label) : '') + '-' + rangeWord(st.r).replace(/\s/g, '') + '.csv', mergedRows(live.map((x) => [x.r.label + (x.r.unit ? ' (' + x.r.unit + ')' : ''), x.pts, x.r.dec]))) }, SC.icon('download', 17), T('Download CSV', 'Λήψη CSV')),
          h('span', { class: 'ex-note' }, T('Exactly the readings in the chart, one row per time, in Cyprus time and UTC.', 'Ακριβώς οι μετρήσεις του διαγράμματος, μία γραμμή ανά ώρα, σε ώρα Κύπρου και UTC.'))));
      chart = exChart(box, { series, t0, t1: now, label: T('Chart. ', 'Διάγραμμα. ') + ariaOf(live.map((x) => x.r), live.map((x) => x.pts), st.r) });
    }
    run();
    return () => { tok++; if (chart) chart.destroy(); };
  }

  /* ---------- tool 2: Timeline (one reading across all schools, 7 days) ---------- */
  function mountTimeline(S, slots) {
    const st = S.tl;
    let tok = 0, chart = null;
    const out = h('div');
    const mids = [];
    sensorsOf().forEach((s) => s.mids.forEach((m) => { if (!mids.includes(m)) mids.push(m); }));
    mids.sort();
    if (!mids.includes(st.mid)) st.mid = mids.includes('4097') ? '4097' : mids[0];
    const nameOfMid = (m) => { const s = sensorsOf().find((x) => x.mids.includes(m)); const r = s && makeReading(s, m); return r ? r.name + (r.unit ? ' (' + r.unit + ')' : '') : m; };
    const chipSet = chips(mids.map((m) => [m, nameOfMid(m)]), st.mid, (m) => { st.mid = m; S.sync(); run(); }, T('Reading to show', 'Μέτρηση προς εμφάνιση'));
    const modeSet = chips([['school', T('Average per school', 'Μέσος όρος ανά σχολείο')], ['sensor', T('Each sensor', 'Κάθε αισθητήρας')]], st.by, (v) => { st.by = v; S.sync(); run(); }, T('Lines', 'Γραμμές'));
    slots.top.append(h('div', { class: 'ex-chiprow' }, h('span', { class: 'ex-chiplab' }, T('Show', 'Εμφάνιση')), chipSet.el, h('span', { class: 'ex-chiplab' }, T('Lines', 'Γραμμές')), modeSet.el));
    slots.main.append(h('div', { class: 'card-h' }, h('span', { class: 'kpi-label' }, T('Timeline · all schools · last 7 days', 'Χρονολόγιο · όλα τα σχολεία · τελευταίες 7 ημέρες'))),
      h('p', { class: 'card-sub' }, T('One reading from every school sensor over the last week. Each school has its own colour. The average line is the mean of that school’s sensors for each hour.', 'Μία μέτρηση από κάθε αισθητήρα σχολείου την τελευταία εβδομάδα. Κάθε σχολείο έχει το δικό του χρώμα. Η γραμμή μέσου όρου είναι ο μέσος όρος των αισθητήρων του σχολείου για κάθε ώρα.')), out);
    async function run() {
      const my = ++tok;
      if (chart) { chart.destroy(); chart = null; }
      const list = sensorsOf().filter((s) => s.mids.includes(st.mid));
      if (!list.length) { fill(out, empty('No school sensor reports this reading yet.', 'Κανένας αισθητήρας σχολείου δεν αναφέρει ακόμα αυτή τη μέτρηση.')); return; }
      fill(out, loading('Reading ' + list.length + ' sensors', 'Ανάγνωση ' + list.length + ' αισθητήρων'));
      const res = await pool(list, 5, (s) => fetchPts(makeReading(s, st.mid), 168));
      if (my !== tok || !slots.alive()) return;
      const ok = list.map((s, i) => ({ s, r: makeReading(s, st.mid), pts: res[i].v || [], err: res[i].e })).filter((x) => x.pts.length);
      const failed = res.filter((x) => x.e).length, silent = list.length - ok.length - failed;
      if (!ok.length) { fill(out, failed ? errBox('the sensor readings', 'των μετρήσεων των αισθητήρων', res.find((x) => x.e).e, run) : empty('None of the ' + list.length + ' sensors sent this reading in the last 7 days.', 'Κανένας από τους ' + list.length + ' αισθητήρες δεν έστειλε αυτή τη μέτρηση τις τελευταίες 7 ημέρες.')); return; }
      const r0 = ok[0].r, schools = [...new Set(ok.map((x) => x.s.group || T('Other', 'Άλλο')))].sort();
      const colorOf = (g) => SCHOOL_COLORS[schools.indexOf(g) % SCHOOL_COLORS.length];
      const now = Date.now(), t0 = now - 168 * HOUR;
      const bySchool = schools.map((g) => {
        const members = ok.filter((x) => (x.s.group || T('Other', 'Άλλο')) === g);
        const buckets = new Map();
        members.forEach((m) => {
          const per = new Map();
          m.pts.forEach((p) => { const k = Math.floor(p.t / HOUR), e = per.get(k) || [0, 0]; e[0] += p.v; e[1]++; per.set(k, e); });
          per.forEach((e, k) => { const b = buckets.get(k) || []; b.push(e[0] / e[1]); buckets.set(k, b); });
        });
        const pts = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ t: k * HOUR + HOUR / 2, v: mean(v) }));
        return { g, members, pts, color: colorOf(g) };
      });
      const series = st.by === 'sensor'
        ? ok.map((x) => ({ name: x.s.name, color: colorOf(x.s.group || T('Other', 'Άλλο')), pts: x.pts, unit: r0.unit, dec: r0.dec, width: 1.4, opacity: 0.9, gap: 3 * HOUR }))
        : bySchool.map((b) => ({ name: b.g, color: b.color, pts: b.pts, unit: r0.unit, dec: r0.dec, gap: 3 * HOUR }));
      const box = h('div', { class: 'ex-chartbox' });
      const table = h('div', { class: 'nm-table-wrap' }, h('table', { class: 'nm-table ex-table' },
        h('thead', null, h('tr', null, [T('School', 'Σχολείο'), T('Sensors', 'Αισθητήρες'), T('Latest hourly average', 'Τελευταίος ωριαίος μέσος όρος'), T('Lowest', 'Χαμηλότερη'), T('Highest', 'Υψηλότερη')].map((x, i) => h('th', { class: i ? 'n' : '' }, x)))),
        h('tbody', null, bySchool.map((b) => {
          const s = summary(b.pts), u = r0.unit ? ' ' + r0.unit : '';
          return h('tr', null, h('td', null, h('span', { class: 'ex-dot', style: { background: b.color } }), h('b', null, b.g)), h('td', { class: 'n' }, String(b.members.length)),
            s ? [h('td', { class: 'n' }, num(s.last.v, r0.dec) + u, h('small', null, ' ' + dmhm(s.last.t))), h('td', { class: 'n' }, num(s.min, r0.dec) + u), h('td', { class: 'n' }, num(s.max, r0.dec) + u)] : h('td', { class: 'n', colspan: 3 }, '–'));
        }))));
      const miss = [];
      if (silent > 0) miss.push(T(silent + ' sensor' + (silent === 1 ? '' : 's') + ' had no readings in the last 7 days and ' + (silent === 1 ? 'is' : 'are') + ' left out.', silent + ' αισθητήρες δεν είχαν μετρήσεις τις τελευταίες 7 ημέρες και παραλείπονται.'));
      if (failed) miss.push(T(failed + ' sensor' + (failed === 1 ? '' : 's') + ' could not be read just now.', failed + ' αισθητήρες δεν μπόρεσαν να διαβαστούν τώρα.'));
      fill(out, legend(bySchool.map((b) => ({ color: b.color, text: b.g + ' · ' + T(b.members.length + (b.members.length === 1 ? ' sensor' : ' sensors'), b.members.length + ' αισθητήρες') }))), box,
        miss.map((m) => h('p', { class: 'ex-stale', role: 'status' }, m)), table, h('div', { class: 'ex-src' }, h('b', null, T('Source', 'Πηγή')), h('ul', null, h('li', null, T('School sensors, as recorded by our server (' + ok.length + ' sensors, ' + schools.length + ' schools). Each average line uses hourly means.', 'Αισθητήρες σχολείων, όπως καταγράφονται από τον διακομιστή μας (' + ok.length + ' αισθητήρες, ' + schools.length + ' σχολεία). Κάθε γραμμή μέσου όρου χρησιμοποιεί ωριαίους μέσους όρους.')))),
        h('div', { class: 'ex-btnrow' }, h('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: () => saveCsv('timeline-' + slug(r0.name) + '-7days.csv', mergedRows(ok.map((x) => [x.s.name + ' (' + (x.s.group || '') + ') ' + r0.name + (r0.unit ? ' (' + r0.unit + ')' : ''), x.pts, x.r.dec]))) }, SC.icon('download', 17), T('Download every sensor (CSV)', 'Λήψη όλων των αισθητήρων (CSV)'))));
      chart = exChart(box, { series, t0, t1: now, gaps: false, h: 320, label: T('Chart. ', 'Διάγραμμα. ') + r0.name + ' ' + T('across ' + schools.length + ' schools, last 7 days: ', 'σε ' + schools.length + ' σχολεία, τελευταίες 7 ημέρες: ') + bySchool.map((b) => { const s = summary(b.pts); return b.g + (s ? ' ' + num(s.min, r0.dec) + ' ' + T('to', 'έως') + ' ' + num(s.max, r0.dec) + ' ' + r0.unit : ''); }).join('; ') + '.' });
    }
    run();
    return () => { tok++; if (chart) chart.destroy(); };
  }

  /* ---------- tool 3: Number finder ---------- */
  const FD_RANGES = [[168, T('7 days', '7 ημέρες')], [336, T('14 days', '14 ημέρες')], [720, T('30 days', '30 ημέρες')]];
  function findRuns(pts, op, x, gapMs, step) {
    const runs = [];
    let cur = null;
    pts.forEach((p) => {
      const hit = op === 'above' ? p.v > x : p.v < x;
      if (!hit) { cur = null; return; }
      if (cur && p.t - cur.last <= gapMs) { cur.last = p.t; cur.n++; if (op === 'above' ? p.v > cur.ext : p.v < cur.ext) { cur.ext = p.v; cur.extT = p.t; } }
      else { cur = { start: p.t, last: p.t, n: 1, ext: p.v, extT: p.t }; runs.push(cur); }
    });
    runs.forEach((r) => { r.dur = r.last - r.start + step; });
    return runs;
  }
  function mountFinder(S, slots) {
    const st = S.fd;
    let tok = 0, chart = null, touched = st.v !== '' && st.v != null;
    const out = h('div');
    const unitEl = h('span', { class: 'ex-unitin' });
    const hint = h('p', { class: 'ex-note ex-hintline', id: 'ex-fdhint' });
    const opSel = h('select', { id: 'ex-fdop', class: 'ex-sel', onchange: () => { st.op = opSel.value; if (!touched) { st.v = ''; valIn.value = ''; } S.sync(); start(); } },
      h('option', { value: 'above' }, T('above', 'πάνω από')), h('option', { value: 'below' }, T('below', 'κάτω από')));
    opSel.value = st.op;
    const valIn = h('input', { id: 'ex-fdval', class: 'nm-input ex-in', type: 'number', step: 'any', inputmode: 'decimal', value: st.v == null ? '' : st.v, 'aria-describedby': 'ex-fdhint', oninput: () => { touched = true; } });
    const per = rangeBar(st.hours, (v) => { st.hours = v; if (!touched) { st.v = ''; valIn.value = ''; } S.sync(); start(); }, FD_RANGES, T('Period to search', 'Περίοδος αναζήτησης'));
    const pk = readingPicker(T('Reading', 'Μέτρηση'), st.id, (id) => { st.id = id; if (!touched) { st.v = ''; valIn.value = ''; } S.sync(); start(); });
    const form = h('form', { class: 'ex-form', onsubmit: (e) => { e.preventDefault(); touched = true; st.v = valIn.value; S.sync(); run(); } },
      pk.el,
      h('div', { class: 'ex-pickpair' }, pickField(T('Was it', 'Ήταν'), opSel), pickField(T('This value', 'Αυτή την τιμή'), h('span', { class: 'ex-inwrap' }, valIn, unitEl))),
      h('div', { class: 'ex-formrow' }, per.el, h('button', { class: 'nm-btn nm-btn--primary', type: 'submit' }, SC.icon('search', 17), T('Find', 'Αναζήτηση'))));
    slots.hint(T('Ask a plain question: “When was the temperature above 30 °C?” We list every stretch that matches and say it in a sentence.', 'Κάντε μια απλή ερώτηση: «Πότε ήταν η θερμοκρασία πάνω από 30 °C;» Παραθέτουμε κάθε περίοδο που ταιριάζει και το λέμε με μία πρόταση.'));
    slots.main.append(h('div', { class: 'card-h' }, h('span', { class: 'kpi-label' }, T('Number finder', 'Αναζήτηση τιμής'))), form, hint, out);

    // fill the value from the reading itself (its 85th or 15th percentile) when the person has not typed one
    async function start() {
      const my = ++tok;
      const r = getReading(st.id);
      unitEl.textContent = r ? r.unit : '';
      if (!r) { hint.textContent = ''; fill(out, empty('Pick a reading, type a number and press Find.', 'Επιλέξτε μια μέτρηση, πληκτρολογήστε έναν αριθμό και πατήστε Αναζήτηση.')); return; }
      if (touched && valIn.value !== '') { run(); return; }
      fill(out, loading());
      try {
        const pts = await fetchPts(r, st.hours);
        if (my !== tok || !slots.alive()) return;
        if (pts.length) {
          const vs = pts.map((p) => p.v).sort((a, b) => a - b), q = vs[Math.min(vs.length - 1, Math.floor(vs.length * (st.op === 'above' ? 0.85 : 0.15)))];
          valIn.value = String(r.dec ? Math.round(q * 10) / 10 : Math.round(q));
          st.v = valIn.value;
        }
      } catch (e) { if (my === tok) fill(out, errBox('the readings', 'των μετρήσεων', e, start)); return; }
      run(true);
    }
    async function run(prefilled) {
      const my = ++tok;
      if (chart) { chart.destroy(); chart = null; }
      const r = getReading(st.id), x = parseFloat(valIn.value);
      unitEl.textContent = r ? r.unit : '';
      if (!r) { fill(out, empty('Pick a reading, type a number and press Find.', 'Επιλέξτε μια μέτρηση, πληκτρολογήστε έναν αριθμό και πατήστε Αναζήτηση.')); return; }
      fill(out, loading());
      let pts;
      try { pts = await fetchPts(r, st.hours); } catch (e) { if (my === tok) fill(out, errBox('the readings', 'των μετρήσεων', e, run)); return; }
      if (my !== tok || !slots.alive()) return;
      const days = rangeWord(st.hours), u = r.unit ? ' ' + r.unit : '';
      if (!pts.length) { fill(out, empty('No readings from ' + r.label + ' in the last ' + days + '. Try a longer period or another reading.', 'Καμία μέτρηση από ' + r.label + ' τις τελευταίες ' + days + '. Δοκιμάστε μεγαλύτερη περίοδο ή άλλη μέτρηση.')); hint.textContent = ''; return; }
      const sm = summary(pts);
      hint.textContent = T('In the last ' + days + ' this reading ranged from ' + num(sm.min, r.dec) + u + ' to ' + num(sm.max, r.dec) + u + (prefilled === true ? '. We filled in a value to start with; change it and press Find.' : '.'), 'Τις τελευταίες ' + days + ' η μέτρηση κυμάνθηκε από ' + num(sm.min, r.dec) + u + ' έως ' + num(sm.max, r.dec) + u + (prefilled === true ? '. Βάλαμε μια τιμή για αρχή· αλλάξτε την και πατήστε Αναζήτηση.' : '.'));
      if (!isFinite(x)) { fill(out, empty('Type a number in the box above and press Find.', 'Πληκτρολογήστε έναν αριθμό στο πλαίσιο παραπάνω και πατήστε Αναζήτηση.')); return; }
      const step = stepOf(pts), gapMs = Math.max(75 * MIN, 3.5 * step), now = Date.now(), t0 = now - st.hours * HOUR;
      const runs = findRuns(pts, st.op, x, gapMs, step);
      let gaps = 0;
      for (let i = 1; i < pts.length; i++) if (pts[i].t - pts[i - 1].t > gapMs) gaps += pts[i].t - pts[i - 1].t - step;
      const above = st.op === 'above', total = runs.reduce((a, b) => a + b.dur, 0), longest = runs.slice().sort((a, b) => b.dur - a.dur)[0];
      const opEn = above ? 'above' : 'below', opEl = above ? 'πάνω από' : 'κάτω από';
      const val = num(x, r.dec) + u;
      let big, sub;
      if (!runs.length) {
        const e = above ? sm.max : sm.min, eT = above ? sm.maxT : sm.minT;
        big = T(r.label + ' was never ' + opEn + ' ' + val + ' in the last ' + days + '.', r.label + ': δεν ήταν ποτέ ' + opEl + ' ' + val + ' τις τελευταίες ' + days + '.');
        sub = T('The ' + (above ? 'highest' : 'lowest') + ' reading was ' + num(e, r.dec) + u + ' on ' + dmhm(eT) + '.', 'Η ' + (above ? 'υψηλότερη' : 'χαμηλότερη') + ' μέτρηση ήταν ' + num(e, r.dec) + u + ' στις ' + dmhm(eT) + '.');
      } else {
        big = T(r.label + ' was ' + opEn + ' ' + val + ' ' + (runs.length === 1 ? 'once' : runs.length + ' times') + ' in the last ' + days + ', for ' + fmtDur(total) + ' in total.',
          r.label + ': ήταν ' + opEl + ' ' + val + ' ' + (runs.length === 1 ? 'μία φορά' : runs.length + ' φορές') + ' τις τελευταίες ' + days + ', συνολικά για ' + fmtDur(total) + '.');
        sub = T('The longest stretch ran from ' + dmhm(longest.start) + ' to ' + hhmm(longest.last) + ' (' + fmtDur(longest.dur) + ') and ' + (above ? 'peaked' : 'bottomed out') + ' at ' + num(longest.ext, r.dec) + u + '.',
          'Η μεγαλύτερη περίοδος κράτησε από ' + dmhm(longest.start) + ' έως ' + hhmm(longest.last) + ' (' + fmtDur(longest.dur) + ') και ' + (above ? 'έφτασε το μέγιστο' : 'έπεσε στο ελάχιστο') + ' ' + num(longest.ext, r.dec) + u + '.');
      }
      const box = h('div', { class: 'ex-chartbox' });
      const rows = runs.slice().reverse();
      const shown = rows.slice(0, 30);
      const table = runs.length ? h('div', { class: 'nm-table-wrap' }, h('table', { class: 'nm-table ex-table' },
        h('thead', null, h('tr', null, [T('From', 'Από'), T('To', 'Έως'), T('Lasted', 'Διάρκεια'), above ? T('Peak', 'Μέγιστο') : T('Lowest', 'Ελάχιστο'), T('Readings', 'Μετρήσεις')].map((c, i) => h('th', { class: i > 2 ? 'n' : '' }, c)))),
        h('tbody', null, shown.map((q) => h('tr', null, h('td', null, dmhm(q.start)), h('td', null, dmhm(q.last), q.last === pts[pts.length - 1].t && now - q.last < gapMs ? h('span', { class: 'ex-live' }, ' ' + T('still going', 'συνεχίζεται')) : null), h('td', null, fmtDur(q.dur)), h('td', { class: 'n' }, num(q.ext, r.dec) + u, h('small', null, ' ' + hhmm(q.extT))), h('td', { class: 'n' }, String(q.n))))))) : null;
      const color = above ? COL.a : COL.b;
      fill(out, h('p', { class: 'cap-big', 'aria-live': 'polite' }, big), h('p', { class: 'cap-sub' }, sub),
        h('div', { class: 'ex-legendrow' }, legend([{ color: COL.gold, text: r.label }, { color, text: T('Time ' + opEn + ' ' + val, 'Χρόνος ' + opEl + ' ' + val), box: true }])), box,
        staleNote(r, pts), table, rows.length > shown.length ? h('p', { class: 'ex-note' }, T('Showing the latest 30 of ' + rows.length + ' stretches. The CSV has all of them.', 'Εμφανίζονται οι τελευταίες 30 από ' + rows.length + ' περιόδους. Το CSV τις έχει όλες.')) : null,
        h('p', { class: 'ex-note' }, T('Checked ' + sm.n + ' readings from ' + dmhm(sm.first.t) + ' to ' + dmhm(sm.last.t) + '. Time without any reading (' + fmtDur(Math.max(0, gaps)) + ') is not counted, and a stretch ends where a gap begins.', 'Ελέγχθηκαν ' + sm.n + ' μετρήσεις από ' + dmhm(sm.first.t) + ' έως ' + dmhm(sm.last.t) + '. Ο χρόνος χωρίς καμία μέτρηση (' + fmtDur(Math.max(0, gaps)) + ') δεν υπολογίζεται και μια περίοδος τελειώνει εκεί που αρχίζει ένα κενό.')),
        srcLine([r]),
        runs.length ? h('div', { class: 'ex-btnrow' }, h('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: () => saveCsv('finder-' + slug(r.label) + '-' + opEn + '-' + String(x).replace('.', '_') + '.csv',
          [[T('from (Cyprus)', 'από (Κύπρος)'), T('to (Cyprus)', 'έως (Κύπρος)'), 'minutes', (above ? 'peak' : 'lowest') + (r.unit ? ' (' + r.unit + ')' : ''), 'readings', 'source']].concat(rows.map((q) => [cyStamp(q.start), cyStamp(q.last), Math.round(q.dur / MIN), +q.ext.toFixed(2), q.n, sourceText(r)]))) }, SC.icon('download', 17), T('Download these periods (CSV)', 'Λήψη αυτών των περιόδων (CSV)'))) : null);
      chart = exChart(box, { series: [{ name: r.label, color: COL.gold, pts, unit: r.unit, dec: r.dec }], t0, t1: now, gap: gapMs,
        lines: [{ v: x, label: (above ? '> ' : '< ') + num(x, r.dec) + u, color }], bands: runs.map((q) => ({ from: q.start - step / 2, to: q.last + step / 2, color })),
        label: T('Chart. ', 'Διάγραμμα. ') + big + ' ' + sub });
    }
    start();
    return () => { tok++; if (chart) chart.destroy(); };
  }

  /* ---------- tool 4: Sensor vs official ---------- */
  const OF_SCALE = { temp: 5, hum: 20, wind: 5, pres: 10 };
  function mountOfficial(S, slots) {
    const st = S.of;
    let tok = 0, chart = null;
    const sensors = sensorsOf().filter((s) => FAMS.some(([f]) => readingsOf(s).some((r) => r.fam === f)));
    const out = h('div'), chipBox = h('div', { class: 'ex-chiprow' }), noteBox = h('p', { class: 'ex-note ex-hintline' });
    if (!sensors.length || !stationsOf().length) {
      slots.hint(T('Put one of our sensors next to a Met Office station and see how far apart they are.', 'Βάλτε έναν από τους αισθητήρες μας δίπλα σε έναν σταθμό της Μετεωρολογικής Υπηρεσίας και δείτε πόσο απέχουν.'));
      slots.main.append(h('div', { class: 'card-h' }, h('span', { class: 'kpi-label' }, T('Sensor vs official', 'Αισθητήρας και επίσημος σταθμός'))),
        empty(!sensors.length && E.notes.some((n) => n.en === 'the school sensors') ? 'The school sensors could not be loaded just now, so there is nothing to put next to the Met Office. Use Try again above.' : !sensors.length ? 'None of the school sensors reports temperature, humidity, pressure or wind yet, so there is nothing to put next to the Met Office.' : 'The Met Office station list is not available right now, so there is nothing to compare with.',
          !sensors.length && E.notes.some((n) => n.en === 'the school sensors') ? 'Οι αισθητήρες των σχολείων δεν φορτώθηκαν τώρα, οπότε δεν υπάρχει τίποτα να συγκριθεί με τη Μετεωρολογική Υπηρεσία. Χρησιμοποιήστε το «Δοκιμάστε ξανά» παραπάνω.' : !sensors.length ? 'Κανένας αισθητήρας σχολείου δεν αναφέρει ακόμα θερμοκρασία, υγρασία, πίεση ή άνεμο, οπότε δεν υπάρχει τίποτα να συγκριθεί με τη Μετεωρολογική Υπηρεσία.' : 'Ο κατάλογος σταθμών της Μετεωρολογικής Υπηρεσίας δεν είναι διαθέσιμος τώρα, οπότε δεν υπάρχει με τι να συγκριθεί.'));
      return () => {};
    }
    if (!E.byId.get(st.sensor) || !sensors.includes(E.byId.get(st.sensor))) st.sensor = (sensors.find((s) => s.online && !s.moving) || sensors.find((s) => s.online) || sensors[0]).id;
    let manual = Boolean(st.station && E.byId.get(st.station));
    const nearestOf = (sensor) => stationsByDistance(sensor);
    if (!manual) st.station = nearestOf(E.byId.get(st.sensor))[0].s.id;
    const famsOf = (sensor) => FAMS.filter(([f]) => readingsOf(sensor).some((r) => r.fam === f));
    if (!famsOf(E.byId.get(st.sensor)).some(([f]) => f === st.fam)) st.fam = famsOf(E.byId.get(st.sensor))[0][0];

    const rng = rangeBar(st.r, (v) => { st.r = v; S.sync(); title.textContent = heading(); run(); });
    const heading = () => T('Sensor vs official · ' + (FAMS.find((f) => f[0] === st.fam) || [])[1].toLowerCase() + ' · last ' + rangeWord(st.r), 'Αισθητήρας και επίσημος σταθμός · ' + (FAMS.find((f) => f[0] === st.fam) || [])[2].toLowerCase() + ' · τελευταίες ' + rangeWord(st.r));
    const title = h('span', { class: 'kpi-label', id: 'ex-mh' }, heading());
    const sensorSel = srcSelect(sensors, st.sensor, (sid) => {
      st.sensor = sid;
      const sn = E.byId.get(sid);
      if (!famsOf(sn).some(([f]) => f === st.fam)) st.fam = famsOf(sn)[0][0];
      if (!manual) { st.station = nearestOf(sn)[0].s.id; drawStationSel(); }
      else drawNear();
      drawChips(); title.textContent = heading(); S.sync(); run();
    });
    const stationWrap = h('div');
    function drawStationSel() {
      const list = nearestOf(E.byId.get(st.sensor));
      const sel = srcSelect(list.map((x) => x.s), st.station, (sid) => { st.station = sid; manual = true; drawNear(); S.sync(); run(); }, { label: (s) => { const k = (list.find((x) => x.s === s) || {}).km; return s.name + (k != null ? ' (' + kmText(k) + ')' : ''); } });
      fill(stationWrap, pickField(T('Official station', 'Επίσημος σταθμός'), sel));
      drawNear();
    }
    function drawNear() {
      const list = nearestOf(E.byId.get(st.sensor)), top = list[0];
      noteBox.textContent = top && top.km != null ? T('Nearest station to where this sensor was last reported: ' + top.s.name + ' (' + kmText(top.km) + '). A moving sensor can be far from it.', 'Ο πλησιέστερος σταθμός στο σημείο όπου αναφέρθηκε τελευταία αυτός ο αισθητήρας: ' + top.s.name + ' (' + kmText(top.km) + '). Ένας κινούμενος αισθητήρας μπορεί να βρίσκεται μακριά του.') : '';
    }
    function drawChips() {
      const sn = E.byId.get(st.sensor), ok = famsOf(sn).map((f) => f[0]);
      const row = h('div', { class: 'ex-chips', role: 'group', 'aria-label': T('Reading to compare', 'Μέτρηση προς σύγκριση') });
      FAMS.forEach(([f, en, el]) => {
        const can = ok.includes(f);
        row.append(h('button', { class: 'ex-chip' + (st.fam === f ? ' on' : ''), type: 'button', 'aria-pressed': String(st.fam === f), disabled: can ? null : true, title: can ? null : T('This sensor does not measure it.', 'Ο αισθητήρας δεν το μετρά.'), onclick: () => { st.fam = f; drawChips(); title.textContent = heading(); S.sync(); run(); } }, T(en, el)));
      });
      const skipped = readingsOf(sn).filter((r) => !FAMS.some(([f]) => f === r.fam)).map((r) => r.name);
      fill(chipBox, h('span', { class: 'ex-chiplab' }, T('Compare on', 'Σύγκριση σε')), row,
        skipped.length ? h('span', { class: 'ex-chipnote' }, infoIcon(15), T('The Met Office does not measure ' + skipped.join(', ') + ', so those cannot be compared here.', 'Η Μετεωρολογική Υπηρεσία δεν μετρά: ' + skipped.join(', ') + '· γι’ αυτό δεν συγκρίνονται εδώ.')) : null);
    }
    slots.hint(T('Put one of our sensors next to a Met Office station and see how far apart they are.', 'Βάλτε έναν από τους αισθητήρες μας δίπλα σε έναν σταθμό της Μετεωρολογικής Υπηρεσίας και δείτε πόσο απέχουν.')); slots.top.append(chipBox);
    drawChips();
    drawStationSel();
    if (slots.after) slots.after.append(
h('aside', { class: 'nm-callout nm-callout--info how' }, h('b', { class: 't1' }, T('How to read this chart', 'Πώς διαβάζεται αυτό το διάγραμμα')),
          T('Do the two lines move together? The orange line is our sensor. The blue line is the Met Office station, outdoors in a standard weather screen. The shaded band between them shows who reads higher.', 'Κινούνται μαζί οι δύο γραμμές; Η πορτοκαλί γραμμή είναι ο αισθητήρας μας. Η μπλε είναι ο σταθμός της Μετεωρολογικής Υπηρεσίας, σε ανοιχτό χώρο, σε τυπικό κιβώτιο μετρήσεων. Η σκιασμένη ζώνη ανάμεσά τους δείχνει ποιος δείχνει υψηλότερα.'),
          h('ul', null,
            h('li', null, T('A steady gap is normal: a room is warmer than the street at night and cooler than a sunny airport at noon; a vehicle is in the sun or the shade.', 'Μια σταθερή διαφορά είναι φυσιολογική: ένα δωμάτιο είναι θερμότερο από τον δρόμο τη νύχτα και δροσερότερο από ένα ηλιόλουστο αεροδρόμιο το μεσημέρι· ένα όχημα βρίσκεται στον ήλιο ή στη σκιά.')),
            h('li', null, T('A gap that jumps can mean a window was opened, the sun reached the sensor or the sensor needs checking.', 'Μια διαφορά που αλλάζει απότομα μπορεί να σημαίνει ότι άνοιξε ένα παράθυρο, ότι ο ήλιος έπεσε πάνω στον αισθητήρα ή ότι ο αισθητήρας χρειάζεται έλεγχο.')),
            h('li', null, T('The correlation tells you whether the shapes match, even when the levels do not.', 'Η συσχέτιση δείχνει αν τα σχήματα ταιριάζουν, ακόμα κι όταν τα επίπεδα δεν ταιριάζουν.')),
            h('li', null, T('The line first shows the moment the two differ most. Move over the chart, or press the arrow keys, to read any other moment.', 'Η γραμμή δείχνει πρώτα τη στιγμή με τη μεγαλύτερη διαφορά. Μετακινήστε τον δείκτη πάνω στο διάγραμμα ή πατήστε τα βέλη για να δείτε οποιαδήποτε άλλη στιγμή.')))));
    slots.main.append(h('div', { class: 'card-h' }, title, rng.el), h('div', { class: 'ex-picks' }, pickField(T('Our sensor', 'Ο αισθητήρας μας'), sensorSel), stationWrap), out);

    async function run() {
      const my = ++tok;
      if (chart) { chart.destroy(); chart = null; }
      const sensor = E.byId.get(st.sensor), station = E.byId.get(st.station);
      const rs = readingsOf(sensor).find((r) => r.fam === st.fam);
      if (!rs || !station) { fill(out, empty('Pick a sensor and a station above.', 'Επιλέξτε αισθητήρα και σταθμό παραπάνω.')); return; }
      fill(out, loading());
      const keys = st.fam === 'pres' ? ['pstn', 'pmsl'] : st.fam === 'wind' ? ['ws10'] : [st.fam];
      let a, b, rb;
      try {
        a = await fetchPts(rs, st.r);
        for (const k of keys) { rb = makeReading(station, k); b = await fetchPts(rb, st.r); if (b.length) break; }
      } catch (e) { if (my === tok) fill(out, errBox('the readings', 'των μετρήσεων', e, run)); return; }
      if (my !== tok || !slots.alive()) return;
      const notes = [];
      if (!a.length) notes.push(T(rs.label + ' sent no readings in the last ' + rangeWord(st.r) + (sensor.lastSeen ? ' (last seen ' + SC.ago(sensor.lastSeen) + ')' : '') + '.', rs.label + ' δεν έστειλε μετρήσεις τις τελευταίες ' + rangeWord(st.r) + (sensor.lastSeen ? ' (τελευταία εμφάνιση ' + SC.ago(sensor.lastSeen) + ')' : '') + '.'));
      if (!b.length) notes.push(T(station.name + ' has no ' + (rb ? rb.name.toLowerCase() : '') + ' readings in the last ' + rangeWord(st.r) + '. Pick another station.', 'Ο σταθμός ' + station.name + ' δεν έχει μετρήσεις (' + (rb ? rb.name.toLowerCase() : '') + ') τις τελευταίες ' + rangeWord(st.r) + '. Επιλέξτε άλλον σταθμό.'));
      if (!a.length || !b.length) { fill(out, notes.map((n) => h('p', { class: 'ex-stale', role: 'status' }, n)), empty('Nothing to compare yet. Pick another sensor, station or a longer period.', 'Δεν υπάρχει ακόμα τίποτα για σύγκριση. Επιλέξτε άλλον αισθητήρα, σταθμό ή μεγαλύτερη περίοδο.'), srcLine([rs, rb])); return; }
      const pr = pairUp(a, b), hoursSet = Math.min(st.r, new Set(pr.map((p) => Math.floor(p.t / HOUR))).size);
      const enough = pr.length >= 6 && hoursSet >= 2;
      const u = rs.unit ? ' ' + rs.unit : '', temp = st.fam === 'temp';
      const meanD = enough ? mean(pr.map((p) => p.d)) : null, corr = enough ? pearson(pr) : null;
      const inH = (lo, hi) => { const x = pr.filter((p) => { const c = cyHour(p.t); return c >= lo && c < hi; }); return x.length >= 6 ? mean(x.map((p) => p.d)) : null; };
      const night = enough ? inH(0, 6) : null, noon = enough ? inH(12, 16) : null;
      let big, sub = '';
      if (!enough) big = T('Not enough overlap to compare.', 'Δεν υπάρχει αρκετή επικάλυψη για σύγκριση.');
      else if (Math.abs(meanD) < Math.pow(10, -rs.dec) / 2) big = T('On average our sensor and the station agree.', 'Κατά μέσο όρο ο αισθητήρας μας και ο σταθμός συμφωνούν.');
      else big = null;
      const bigNode = big ? h('p', { class: 'cap-big' }, big) : h('p', { class: 'cap-big' },
        T('Our sensor reads ', 'Ο αισθητήρας μας δείχνει κατά μέσο όρο '), h('span', { class: 'hl' }, num(Math.abs(meanD), rs.dec) + u + ' ' + (meanD >= 0 ? (temp ? T('warmer', 'θερμότερα') : T('higher', 'υψηλότερα')) : (temp ? T('cooler', 'ψυχρότερα') : T('lower', 'χαμηλότερα')))), T(' on average than the station.', ' από τον σταθμό.'));
      if (!enough) sub = T('Both had a reading at the same time only ' + pr.length + ' times (' + hoursSet + ' hour' + (hoursSet === 1 ? '' : 's') + ') in the last ' + rangeWord(st.r) + '. We need at least 6 matching readings across 2 hours. Try a longer period, or another sensor or station.', 'Και οι δύο είχαν μέτρηση την ίδια στιγμή μόνο ' + pr.length + ' φορές (' + hoursSet + ' ώρες) τις τελευταίες ' + rangeWord(st.r) + '. Χρειάζονται τουλάχιστον 6 ταυτόχρονες μετρήσεις σε 2 ώρες. Δοκιμάστε μεγαλύτερη περίοδο ή άλλον αισθητήρα ή σταθμό.');
      else if (night != null && noon != null) sub = T('Between 00:00 and 06:00 the sensor reads ' + sgn(night, rs.dec) + u + ' compared with the station; between 12:00 and 16:00 it reads ' + sgn(noon, rs.dec) + u + '. A steady gap is normal: a room or a vehicle is not the same air as a weather station in the open.', 'Μεταξύ 00:00 και 06:00 ο αισθητήρας δείχνει ' + sgn(night, rs.dec) + u + ' σε σχέση με τον σταθμό· μεταξύ 12:00 και 16:00 δείχνει ' + sgn(noon, rs.dec) + u + '. Μια σταθερή διαφορά είναι φυσιολογική: ένα δωμάτιο ή ένα όχημα δεν έχει τον ίδιο αέρα με έναν μετεωρολογικό σταθμό στην ύπαιθρο.');
      else sub = T('A steady gap is normal: a room or a vehicle is not the same air as a weather station in the open.', 'Μια σταθερή διαφορά είναι φυσιολογική: ένα δωμάτιο ή ένα όχημα δεν έχει τον ίδιο αέρα με έναν μετεωρολογικό σταθμό στην ύπαιθρο.');
      const sc = OF_SCALE[st.fam] || 5, pctMean = enough ? Math.max(0, Math.min(100, ((meanD + sc) / (2 * sc)) * 100)) : 50;
      const tile = (k, v, p, meter, lab) => h('div', { class: 'nm-card nm-card--well tile' }, h('div', { class: 'kpi-label' }, k), h('div', { class: 'kpi-num' }, v), h('p', null, p), meter, h('div', { class: 'meter-l' }, lab.map((x) => h('span', null, x))));
      const m1 = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: { left: Math.min(50, pctMean) + '%', width: Math.abs(pctMean - 50) + '%', background: 'linear-gradient(90deg,#E07F3F,#F2A56B)' } }), enough ? h('b', { style: { left: pctMean + '%' } }) : null);
      const m2 = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: { width: (corr == null ? 0 : Math.max(0, corr) * 100) + '%', background: 'linear-gradient(90deg,#8f7bff,#4C8BEA)' } }));
      const m3 = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: { width: Math.min(100, (hoursSet / (st.r)) * 100) + '%', background: 'linear-gradient(90deg,#59d98e,#4CCBEA)' } }));
      const tiles = h('div', { class: 'tiles' },
        tile(T('Mean difference', 'Μέση διαφορά'), enough ? [sgn(meanD, rs.dec), h('small', null, rs.unit)] : '–', T('Sensor minus station, averaged over the ' + rangeWord(st.r) + '.', 'Αισθητήρας μείον σταθμός, κατά μέσο όρο στις ' + rangeWord(st.r) + '.'), m1, ['−' + sc, '0', '+' + sc + (rs.unit ? ' ' + rs.unit : '')]),
        tile(T('Correlation', 'Συσχέτιση'), corr == null ? '–' : num(corr, 2), corr == null && enough ? T('Not enough change in one of the lines to measure it.', 'Δεν υπάρχει αρκετή μεταβολή σε μία από τις γραμμές για να μετρηθεί.') : T('1 means the two lines rise and fall together. 0 means they do not.', '1 σημαίνει ότι οι δύο γραμμές ανεβοκατεβαίνουν μαζί. 0 σημαίνει ότι δεν συμβαίνει αυτό.'), m2, ['0', '0.5', '1']),
        tile(T('Hours compared', 'Ώρες σύγκρισης'), [String(hoursSet), h('small', null, T('of ' + st.r, 'από ' + st.r))], T('Hours when both had a reading. Gaps in either line are left out.', 'Ώρες όπου και οι δύο είχαν μέτρηση. Τα κενά και στις δύο γραμμές παραλείπονται.'), m3, ['0', String(Math.round(st.r / 2)), st.r + ' h']));
      const box = h('div', { class: 'ex-chartbox' });
      const sName = T('Our sensor', 'Ο αισθητήρας μας') + ' · ' + sensor.name;
      const aria = T('Chart. ', 'Διάγραμμα. ') + ariaOf([rs, rb], [a, b], st.r) + (enough ? ' ' + T('Mean difference ' + sgn(meanD, rs.dec) + u + (corr == null ? '' : ', correlation ' + num(corr, 2)) + ', ' + hoursSet + ' hours compared.', 'Μέση διαφορά ' + sgn(meanD, rs.dec) + u + (corr == null ? '' : ', συσχέτιση ' + num(corr, 2)) + ', ' + hoursSet + ' ώρες σύγκρισης.') : '');
      fill(out, h('div', { class: 'ex-legendrow' }, legend([{ color: COL.a, text: sensor.name }, { color: COL.b, text: station.name }, { color: COL.a, text: T('Sensor higher', 'Ο αισθητήρας υψηλότερα'), box: true }, { color: COL.b, text: T('Station higher', 'Ο σταθμός υψηλότερα'), box: true }])),
        box, notes.map((n) => h('p', { class: 'ex-stale', role: 'status' }, n)), staleNote(rs, a), staleNote(rb, b),
        enough ? null : h('div', { class: 'nm-callout nm-callout--warn ex-overlap', role: 'status' }, h('b', null, big), ' ', sub),
        enough ? [bigNode, h('p', { class: 'cap-sub' }, sub)] : null, tiles,
        h('div', { class: 'ex-btnrow' }, h('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: pr.length ? null : true, onclick: () => saveCsv('sensor-vs-official-' + slug(sensor.name) + '-' + slug(station.name) + '-' + st.fam + '-' + rangeWord(st.r).replace(/\s/g, '') + '.csv',
          [[T('time (Cyprus)', 'ώρα (Κύπρος)'), 'time_utc', sName + (rs.unit ? ' (' + rs.unit + ')' : ''), T('Station', 'Σταθμός') + ' · ' + station.name + ' ' + rb.name + (rb.unit ? ' (' + rb.unit + ')' : ''), T('difference', 'διαφορά') + (rs.unit ? ' (' + rs.unit + ')' : '')]].concat(pr.map((p) => [cyStamp(p.t), new Date(p.t).toISOString(), +p.a.toFixed(2), +p.b.toFixed(2), +p.d.toFixed(2)]))) }, SC.icon('download', 17), T('Download CSV', 'Λήψη CSV')),
          h('span', { class: 'ex-note' }, T('Paired readings with their difference, in Cyprus time and UTC.', 'Ζευγαρωμένες μετρήσεις με τη διαφορά τους, σε ώρα Κύπρου και UTC.'))),
        h('div', { class: 'ex-foot' }, noteBox, h('p', { class: 'ex-note' }, rb.key === 'pstn' ? T('The sensor’s pressure is compared with the station’s own (not sea-level) pressure.', 'Η πίεση του αισθητήρα συγκρίνεται με την πίεση του ίδιου του σταθμού (όχι στη στάθμη της θάλασσας).') : rb.key === 'pmsl' ? T('The station publishes pressure reduced to sea level, so a steady gap can come from the sensor’s height.', 'Ο σταθμός δημοσιεύει πίεση αναγμένη στη στάθμη της θάλασσας, οπότε μια σταθερή διαφορά μπορεί να οφείλεται στο ύψος του αισθητήρα.') : T('Readings are paired when they are less than about ' + Math.round(Math.max(5, Math.min(15, Math.max(stepOf(a), stepOf(b)) / 2 / MIN + 0.5))) + ' minutes apart.', 'Οι μετρήσεις ζευγαρώνουν όταν απέχουν λιγότερο από περίπου ' + Math.round(Math.max(5, Math.min(15, Math.max(stepOf(a), stepOf(b)) / 2 / MIN + 0.5))) + ' λεπτά.')),
        srcLine([rs, rb])));
      // the line the reader sees first: the moment the two differ most (as in the picture); moving the pointer shows any other moment
      const biggest = enough ? pr.reduce((m, p) => (Math.abs(p.d) > Math.abs(m.d) ? p : m), pr[0]) : null;
      chart = exChart(box, { series: [{ name: T('Sensor', 'Αισθητήρας'), color: COL.a, pts: a, unit: rs.unit, dec: rs.dec, gapLabel: T('Sensor offline', 'Αισθητήρας εκτός σύνδεσης') }, { name: T('Station', 'Σταθμός'), color: COL.b, pts: b, unit: rs.unit, dec: rs.dec, gapLabel: T('No station data', 'Χωρίς δεδομένα σταθμού') }],
        pin: biggest ? biggest.t : null,
        t0: Date.now() - st.r * HOUR, t1: Date.now(), diff: enough ? { a: 0, b: 1, pos: COL.a, neg: COL.b, posLabel: T('Sensor higher by', 'Ο αισθητήρας υψηλότερα κατά'), negLabel: T('Station higher by', 'Ο σταθμός υψηλότερα κατά') } : null, label: aria });
    }
    run();
    return () => { tok++; if (chart) chart.destroy(); };
  }

  /* ---------- tool 5: Download ---------- */
  const DL_RANGES = [[24, T('24 h', '24 ώρες')], [168, T('7 days', '7 ημέρες')], [720, T('30 days', '30 ημέρες')]];
  function mountDownload(S, slots) {
    const st = S.dl;
    let tok = 0;
    const out = h('div'), extraBox = h('div');
    const per = rangeBar(st.hours, (v) => { st.hours = v; S.sync(); run(); }, DL_RANGES, T('Period to download', 'Περίοδος λήψης'));
    const pk = readingPicker(T('Source', 'Πηγή'), st.a, (id) => { st.a = id; st.extra = []; S.sync(); drawExtra(); run(); });
    function drawExtra() {
      const r = getReading(st.a);
      if (!r || r.kind !== 'sensor' || r.src.mids.length < 2) { fill(extraBox); return; }
      const boxes = r.src.mids.filter((m) => m !== r.key).map((m) => {
        const rr = makeReading(r.src, m), cb = h('input', { type: 'checkbox', id: 'ex-x' + m, checked: st.extra.includes(m) ? true : null, onchange: () => { st.extra = cb.checked ? st.extra.concat(m) : st.extra.filter((x) => x !== m); S.sync(); run(); } });
        return h('label', { class: 'ex-check', for: 'ex-x' + m }, cb, rr.name + (rr.unit ? ' (' + rr.unit + ')' : ''));
      });
      fill(extraBox, h('fieldset', { class: 'ex-fieldset' }, h('legend', null, T('Also include from this sensor', 'Να περιληφθούν και από αυτόν τον αισθητήρα')), h('div', { class: 'ex-checks' }, boxes)));
    }
    slots.hint(T('Pick a source, a reading and a period. The CSV is built here in your browser from exactly the readings below, with the time in Cyprus time and UTC and the source named.', 'Επιλέξτε πηγή, μέτρηση και περίοδο. Το CSV δημιουργείται εδώ στον περιηγητή σας από ακριβώς τις μετρήσεις παρακάτω, με την ώρα σε ώρα Κύπρου και UTC και την πηγή ονομασμένη.'));
    slots.main.append(h('div', { class: 'card-h' }, h('span', { class: 'kpi-label' }, T('Download', 'Λήψη')), per.el), h('div', { class: 'ex-picks one' }, pk.el, extraBox), out);
    drawExtra();
    async function run() {
      const my = ++tok;
      const r = getReading(st.a);
      if (!r) { fill(out, empty('Pick a source and a reading to prepare a file.', 'Επιλέξτε πηγή και μέτρηση για να ετοιμαστεί αρχείο.')); return; }
      fill(out, loading());
      const rs = [r].concat(r.kind === 'sensor' ? st.extra.map((m) => makeReading(r.src, m)).filter(Boolean) : []);
      let datas;
      try { datas = await Promise.all(rs.map((x) => fetchPts(x, st.hours))); } catch (e) { if (my === tok) fill(out, errBox('the readings', 'των μετρήσεων', e, run)); return; }
      if (my !== tok || !slots.alive()) return;
      const cols = rs.map((x, i) => [x.name + (x.unit ? ' (' + x.unit + ')' : ''), datas[i], x.dec]);
      const rows = mergedRows(cols);
      const srcShort = r.kind === 'sensor' ? T('School sensor ', 'Αισθητήρας σχολείου ') + r.src.name : T('Met Office station ', 'Σταθμός Μετεωρολογικής Υπηρεσίας ') + r.src.name + ' (dom.org.cy)';
      const full = rows.map((row, i) => row.concat(i ? srcShort : 'source'));
      const days = Math.min(30, Math.ceil(st.hours / 24));
      const empties = datas.map((d, i) => (d.length ? null : h('p', { class: 'ex-stale', role: 'status' }, T(rs[i].label + ': no readings in this period.', rs[i].label + ': καμία μέτρηση σε αυτή την περίοδο.'))));
      const first = datas.flat().sort((a, b) => a.t - b.t);
      fill(out, h('p', { class: 'cap-big' }, rows.length > 1 ? T('Ready: ' + (rows.length - 1) + ' rows, ' + rs.length + ' reading' + (rs.length === 1 ? '' : 's') + '.', 'Έτοιμο: ' + (rows.length - 1) + ' γραμμές, ' + rs.length + ' μέτρηση' + (rs.length === 1 ? '' : 'εις') + '.') : T('Nothing to download for this choice.', 'Δεν υπάρχει τίποτα για λήψη με αυτή την επιλογή.')),
        rows.length > 1 ? h('p', { class: 'cap-sub' }, T('From ' + dmhm(first[0].t) + ' to ' + dmhm(first[first.length - 1].t) + ' (Cyprus time). The first rows:', 'Από ' + dmhm(first[0].t) + ' έως ' + dmhm(first[first.length - 1].t) + ' (ώρα Κύπρου). Οι πρώτες γραμμές:')) : null,
        empties,
        rows.length > 1 ? h('div', { class: 'nm-table-wrap' }, h('table', { class: 'nm-table ex-table' }, h('thead', null, h('tr', null, full[0].slice(0, -1).map((c, i) => h('th', { class: i > 1 ? 'n' : '' }, c)))),
          h('tbody', null, full.slice(1, 7).map((row) => h('tr', null, row.slice(0, -1).map((c, i) => h('td', { class: i > 1 ? 'n' : '' }, c === '' ? '–' : i === 1 ? String(c).slice(0, 16).replace('T', ' ') : String(c)))))))) : empty('No readings in this period. Try a longer period or another reading.', 'Καμία μέτρηση σε αυτή την περίοδο. Δοκιμάστε μεγαλύτερη περίοδο ή άλλη μέτρηση.'),
        rows.length > 1 ? h('p', { class: 'ex-note' }, T('The file has one more column, named source, with the name of the sensor or station on every row.', 'Το αρχείο έχει μία ακόμα στήλη, με όνομα source, με το όνομα του αισθητήρα ή του σταθμού σε κάθε γραμμή.')) : null,
        srcLine(rs),
        h('div', { class: 'ex-btnrow' },
          h('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: rows.length > 1 ? null : true, onclick: () => saveCsv('explore-' + slug(r.label) + '-' + rangeWord(st.hours).replace(/\s/g, '') + '.csv', full) }, SC.icon('download', 17), T('Download CSV', 'Λήψη CSV')),
          r.kind === 'station' ? [h('a', { class: 'nm-btn', href: '/api/cydom/history.csv?station=' + encodeURIComponent(r.src.st) + '&days=' + days, download: '' }, SC.icon('download', 17), T('All readings of this station (server file)', 'Όλες οι μετρήσεις του σταθμού (αρχείο διακομιστή)')),
            h('a', { class: 'nm-btn', href: '/api/cydom/history.csv?days=' + days, download: '' }, SC.icon('download', 17), T('Every station (large file)', 'Όλοι οι σταθμοί (μεγάλο αρχείο)'))] : null));
    }
    run();
    return () => { tok++; };
  }

  /* ---------- the left card: readings that changed most in the last 6 hours ---------- */
  const FAM_COLOR = { temp: '#E07F3F', tmax: '#E07F3F', tmin: '#E07F3F', hum: '#4C8BEA', co2: '#8f7bff', pres: '#F2B24C', pres2: '#F2B24C', wind: '#4CCBEA', wind2: '#4CCBEA', light: '#59d98e', other: '#9FB2CA' };
  const FAM_NAME = { temp: ['Temperature', 'Θερμοκρασία'], hum: ['Humidity', 'Υγρασία'], co2: ['CO₂', 'CO₂'], pres: ['Pressure', 'Πίεση'], wind: ['Wind', 'Άνεμος'], light: ['Light', 'Φως'] };
  const FLOOR = { '°C': 0.5, '%': 3, ppm: 50, hPa: 0.5, 'm/s': 0.7, lux: 300 };
  function changeOf(r, pts) {
    if (pts.length < 8) return null;
    const last = pts[pts.length - 1];
    if (Date.now() - last.t > 3 * HOUR) return null;
    const at = (t) => { const p = nearest(pts, t); return Math.abs(p.t - t) <= 40 * MIN ? p : null; };
    const ref = at(last.t - 6 * HOUR);
    if (!ref) return null;
    const d = last.v - ref.v;
    let lo = Infinity, hi = -Infinity;
    pts.forEach((p) => { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; });
    const floor = FLOOR[r.unit] || (hi - lo) * 0.1;
    if (Math.abs(d) < floor || Math.abs(d) < 1e-9) return null;
    let mx = 0;
    pts.forEach((p) => { if (p.t - pts[0].t < 6 * HOUR - 40 * MIN) return; const q = at(p.t - 6 * HOUR); if (q) mx = Math.max(mx, Math.abs(p.v - q.v)); });
    return { r, last, d, score: mx > 0 ? Math.min(1, Math.abs(d) / mx) : 1, size: Math.abs(d) / floor };
  }
  async function collectChanges() {
    const items = [], notes = [];
    let looked = 0;
    const jobs = [];
    sensorsOf().filter((s) => s.online || (s.lastSeen && Date.now() - s.lastSeen < 3 * HOUR)).forEach((s) => s.mids.forEach((m) => { if (jobs.length < 160) jobs.push(makeReading(s, m)); }));
    const [sens, st] = await Promise.all([
      pool(jobs, 6, (r) => fetchPts(r, 24)),
      stationsOf().length ? SC.api('/api/cydom/history.csv?days=1', { text: true }).then((v) => ({ v }), (e) => ({ e })) : Promise.resolve({ v: '' }),
    ]);
    jobs.forEach((r, i) => { if (sens[i].v) { looked++; const c = changeOf(r, sens[i].v); if (c) items.push(c); } });
    if (jobs.length && sens.every((x) => x.e)) notes.push(T('The school sensor readings could not be loaded just now.', 'Οι μετρήσεις των αισθητήρων των σχολείων δεν φορτώθηκαν τώρα.'));
    if (st.e) notes.push(T('The Met Office station history could not be loaded just now.', 'Το ιστορικό των σταθμών της Μετεωρολογικής Υπηρεσίας δεν φορτώθηκε τώρα.'));
    else if (st.v) {
      const lines = st.v.replace(/^﻿/, '').split('\n'), head = (lines[0] || '').split(',');
      const iS = head.indexOf('station'), iU = head.indexOf('time_utc');
      const cols = {};
      ['temp', 'hum', 'ws10', 'pmsl'].forEach((k) => { const i = head.findIndex((c) => c.startsWith(k + ' (')); if (i >= 0) cols[k] = i; });
      if (iS >= 0 && iU >= 0) {
        const per = new Map();
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i]) continue;
          const c = lines[i].split(','), t = Date.parse(c[iU]);
          if (!isFinite(t)) continue;
          Object.keys(cols).forEach((k) => {
            const raw = c[cols[k]];
            if (raw === '' || raw == null) return;
            const v = Number(raw);
            if (!isFinite(v)) return;
            const key = c[iS] + '|' + k;
            if (!per.has(key)) per.set(key, []);
            per.get(key).push({ t, v: k === 'ws10' ? v * KN : v });
          });
        }
        const byStation = new Map(stationsOf().map((s) => [s.st, s]));
        per.forEach((pts, key) => {
          const j = key.lastIndexOf('|'), s = byStation.get(key.slice(0, j));
          if (!s) return;
          const r = makeReading(s, key.slice(j + 1));
          pts.sort((a, b) => a.t - b.t);
          looked++;
          const c = changeOf(r, pts);
          if (c) items.push(c);
        });
      }
    }
    const rankOf = (c) => c.score + 0.3 * Math.min(1, c.size / 10);
    items.sort((a, b) => rankOf(b) - rankOf(a));
    return { items, looked, notes };
  }
  function rankCard(onOpen, isSel) {
    const list = h('ol', { class: 'ex-rk' });
    const body = h('div');
    const key = h('div', { class: 'ex-rkkey' }, Object.keys(FAM_NAME).map((k) => cv(h('span', null, h('i'), T(FAM_NAME[k][0], FAM_NAME[k][1])), FAM_COLOR[k])));
    const card = h('section', { class: 'nm-card ex-br ex-rkcard', 'aria-labelledby': 'ex-rkh' },
      h('div', { class: 'card-h' }, h('span', { class: 'kpi-label', id: 'ex-rkh' }, T('Readings that changed most today', 'Μετρήσεις που άλλαξαν περισσότερο σήμερα'))),
      h('p', { class: 'card-sub' }, T('Change over the last 6 hours. The bar shows how big it is next to the biggest 6-hour change that reading made in the last 24 hours. Click a row to explore it.', 'Μεταβολή τις τελευταίες 6 ώρες. Η μπάρα δείχνει πόσο μεγάλη είναι σε σχέση με τη μεγαλύτερη μεταβολή 6 ωρών που έκανε η μέτρηση το τελευταίο 24ωρο. Πατήστε μια γραμμή για να την εξερευνήσετε.')),
      body);
    let data = null, all = false, tok = 0, first = true;
    const tri = (up) => SC.svgEl('svg', { viewBox: '0 0 10 10', fill: 'currentColor', 'aria-hidden': 'true' }, SC.svgEl('path', { d: up ? 'M5 1l4.5 8h-9z' : 'M5 9L.5 1h9z' }));
    function draw() {
      const seen = new Map(), spread = data.items.filter((c) => { const k = c.r.kind + c.r.fam, n = seen.get(k) || 0; seen.set(k, n + 1); return n < 3; });
      const rows = all ? data.items.slice(0, 60) : spread.slice(0, 14);
      list.replaceChildren(...rows.map((c, i) => {
        const r = c.r, color = FAM_COLOR[r.fam] || FAM_COLOR.other, up = c.d >= 0, u = r.unit ? ' ' + r.unit : '';
        // short names, as in the picture ("Pressure", not "Barometric pressure"); the full reading name is in the tooltip
        const nameBits = [h('b', null, r.kind === 'sensor' && FAM_NAME[r.fam] ? T(FAM_NAME[r.fam][0], FAM_NAME[r.fam][1]) : r.name), ' · ', r.src.name];
        if (r.kind === 'station') nameBits.push(h('i', { class: 'ex-mo' }, ' (' + T('Met Office', 'Μετ. Υπηρεσία') + ')'));
        return cv(h('li', { class: isSel(r) ? 'sel' : '' },
          h('button', { type: 'button', class: 'ex-rkbtn', onclick: () => onOpen(r), title: r.name + ' · ' + sourceText(r), 'aria-label': r.label + ': ' + num(c.last.v, r.dec) + u + ', ' + T('changed by ' + sgn(c.d, r.dec) + u + ' in 6 hours. Open in Compare.', 'μεταβολή ' + sgn(c.d, r.dec) + u + ' σε 6 ώρες. Άνοιγμα στη Σύγκριση.') },
            h('span', { class: 'n' }, String(i + 1)),
            h('div', null,
              h('div', { class: 'l1' }, h('i', { class: 'mk' }), h('span', { class: 'nm' }, nameBits)),
              h('div', { class: 'l2' }, h('span', { class: 'bar' }, h('i', { style: { width: Math.round(c.score * 100) + '%' } })), h('span', { class: 'v' }, num(c.last.v, r.dec), h('small', null, r.unit)),
                h('span', { class: 'ch ' + (up ? 'up' : 'dn') }, tri(up), num(Math.abs(c.d), r.dec)))))), color);
      }));
      const shown = rows.length;
      fill(body, list, key,
        h('div', { class: 'ex-rkfoot' }, h('span', null, T('Showing ' + shown + ' of ' + data.items.length + ' changed readings', 'Εμφανίζονται ' + shown + ' από ' + data.items.length + ' μετρήσεις που άλλαξαν')),
          data.items.length > rows.length || all ? h('button', { class: 'ex-lnk', type: 'button', onclick: () => { all = !all; draw(); } }, all ? T('Show fewer', 'Λιγότερες') : T('Show more', 'Περισσότερες')) : null),
        h('details', { class: 'ex-how' }, h('summary', null, T('How this list is made', 'Πώς φτιάχνεται η λίστα')),
          h('p', { class: 'ex-note' }, T('Looked at ' + data.looked + ' readings with data in the last 24 hours. Changes smaller than a noticeable step (for example 0.5 °C or 3 %) are left out. Sources: school sensors (our server) and Met Office stations (dom.org.cy, as published).', 'Εξετάστηκαν ' + data.looked + ' μετρήσεις με δεδομένα το τελευταίο 24ωρο. Μεταβολές μικρότερες από ένα αισθητό βήμα (π.χ. 0,5 °C ή 3 %) παραλείπονται. Πηγές: αισθητήρες σχολείων (ο διακομιστής μας) και σταθμοί της Μετεωρολογικής Υπηρεσίας (dom.org.cy, όπως δημοσιεύονται).'))),
        data.notes.map((n) => h('p', { class: 'ex-stale', role: 'status' }, n)));
    }
    async function load(silent) {
      const my = ++tok;
      if (!silent || first) fill(body, loading('Looking at the readings', 'Έλεγχος των μετρήσεων'));
      try {
        const d = await collectChanges();
        if (my !== tok) return;
        data = d; first = false;
        if (!d.items.length) fill(body, empty(d.looked ? 'No reading has changed by a noticeable amount in the last 6 hours.' : 'No sensor or station has sent a reading in the last day, so there is nothing to rank yet.', d.looked ? 'Καμία μέτρηση δεν άλλαξε αισθητά τις τελευταίες 6 ώρες.' : 'Κανένας αισθητήρας ή σταθμός δεν έστειλε μέτρηση το τελευταίο 24ωρο, οπότε δεν υπάρχει ακόμα κάτι προς κατάταξη.'), d.notes.map((n) => h('p', { class: 'ex-stale', role: 'status' }, n)));
        else draw();
      } catch (e) { if (my === tok && (!silent || first)) { fill(body, errBox('the readings', 'των μετρήσεων', e, () => load(false))); first = false; } }
    }
    load(false);
    return { el: card, reload: load, restyle() { if (data && data.items.length) draw(); }, destroy() { tok++; } };
  }

  /* ---------- the page ---------- */
  const TOOLS = [['compare', T('Compare', 'Σύγκριση')], ['timeline', T('Timeline', 'Χρονολόγιο')], ['finder', T('Number finder', 'Αναζήτηση τιμής')], ['official', T('Sensor vs official', 'Αισθητήρας και επίσημος')], ['download', T('Download', 'Λήψη')]];
  const TOOL_ALIAS = { vs: 'official', sensor: 'official', number: 'finder', find: 'finder', csv: 'download' };
  const MOUNT = { compare: mountCompare, timeline: mountTimeline, finder: mountFinder, official: mountOfficial, download: mountDownload };

  // The card "My school sensor vs the nearest official station" is its own file (explore-air.js), loaded here and never needed by the five tools.
  let airCleanup = null, airTok = 0;
  function airSlot(host, isAlive) {
    const my = ++airTok;
    if (airCleanup) { try { airCleanup(); } catch (e) { /* ignore */ } airCleanup = null; }
    const go = () => { try { if (my === airTok && isAlive() && window.SCExploreAir) airCleanup = window.SCExploreAir.mount(host, { alive: isAlive, sensors: sensorsOf(), names: E.names }); } catch (e) { /* the card is optional */ } };
    if (window.SCExploreAir) return go();
    const s = document.createElement('script'); s.src = '/site/pages/explore-air.js?v=1'; s.onload = go; s.onerror = () => s.remove(); document.head.append(s);
  }

  SC.register('explore', {
    title: ['Explore data', 'Εξερεύνηση'],
    render(root, ctx) {
      let alive = true, toolCleanup = null, rank = null, mounted = '';
      const timers = [];
      const q = (k) => (ctx.query && typeof ctx.query.get === 'function' ? ctx.query.get(k) : ctx.query && ctx.query[k]) || '';
      const head = SC.head({
        title: T('Explore the data', 'Εξερευνήστε τα δεδομένα'),
        lede: T('Five tools over the readings from our schools and the Met Office. Pick a tool, change the place or the dates, and download exactly what you see. Every reading keeps its source.',
          'Πέντε εργαλεία πάνω στις μετρήσεις των σχολείων μας και της Μετεωρολογικής Υπηρεσίας. Επιλέξτε εργαλείο, αλλάξτε τόπο ή ημερομηνίες και κατεβάστε ακριβώς αυτό που βλέπετε. Κάθε μέτρηση κρατά την πηγή της.'),
        help: ['Compare puts two readings on one chart. Timeline shows one reading for every school over a week. Number finder lists when a reading was above or below a number you choose. Sensor vs official sets one of our sensors beside a Met Office station and works out the difference, the correlation and how many hours both had a reading. Download builds a CSV file in your browser. The list on the left shows which readings changed most in the last 6 hours; click one to open it in Compare.',
          'Η Σύγκριση βάζει δύο μετρήσεις στο ίδιο διάγραμμα. Το Χρονολόγιο δείχνει μία μέτρηση για κάθε σχολείο σε μία εβδομάδα. Η Αναζήτηση τιμής παραθέτει πότε μια μέτρηση ήταν πάνω ή κάτω από έναν αριθμό της επιλογής σας. Το «Αισθητήρας και επίσημος» βάζει έναν αισθητήρα μας δίπλα σε έναν σταθμό της Μετεωρολογικής Υπηρεσίας και υπολογίζει τη διαφορά, τη συσχέτιση και πόσες ώρες είχαν μέτρηση και οι δύο. Η Λήψη φτιάχνει αρχείο CSV στον περιηγητή σας. Η λίστα αριστερά δείχνει ποιες μετρήσεις άλλαξαν περισσότερο τις τελευταίες 6 ώρες· πατήστε μία για να ανοίξει στη Σύγκριση.'],
      });
      root.append(head);
      const body = h('div', { class: 'ex-body' });
      root.append(body);
      const every = (fn, ms) => timers.push(setInterval(() => { if (alive && !document.hidden) fn(); }, ms));

      const S = { tool: 'compare', cmp: { a: q('a'), b: q('b'), r: [24, 48, 168].includes(Number(q('r'))) ? Number(q('r')) : 48 }, tl: { mid: q('mid') || '4097', by: q('by') === 'sensor' ? 'sensor' : 'school' },
        fd: { id: q('a'), op: q('op') === 'below' ? 'below' : 'above', v: q('v'), hours: [168, 336, 720].includes(Number(q('r'))) ? Number(q('r')) : 168 },
        of: { sensor: q('a'), station: q('b'), fam: FAMS.some((f) => f[0] === q('fam')) ? q('fam') : 'temp', r: [24, 48, 168].includes(Number(q('r'))) ? Number(q('r')) : 48 },
        dl: { a: q('a'), extra: [], hours: [24, 168, 720].includes(Number(q('r'))) ? Number(q('r')) : 168 } };
      const want = TOOL_ALIAS[q('tool')] || q('tool');
      if (MOUNT[want]) S.tool = want;
      S.sync = () => {
        const p = new URLSearchParams();
        p.set('tool', S.tool);
        if (S.tool === 'compare') { if (S.cmp.a) p.set('a', S.cmp.a); if (S.cmp.b) p.set('b', S.cmp.b); p.set('r', S.cmp.r); }
        else if (S.tool === 'timeline') { p.set('mid', S.tl.mid); p.set('by', S.tl.by); }
        else if (S.tool === 'finder') { if (S.fd.id) p.set('a', S.fd.id); p.set('op', S.fd.op); if (S.fd.v !== '' && S.fd.v != null) p.set('v', S.fd.v); p.set('r', S.fd.hours); }
        else if (S.tool === 'official') { if (S.of.sensor) p.set('a', S.of.sensor); if (S.of.station) p.set('b', S.of.station); p.set('fam', S.of.fam); p.set('r', S.of.r); }
        else if (S.tool === 'download') { if (S.dl.a) p.set('a', S.dl.a); p.set('r', S.dl.hours); }
        try { window.history.replaceState(null, '', '#/explore?' + p.toString()); } catch (e) { /* the address stays as it is */ }
        if (rank) rank.restyle();
      };

      async function boot() {
        fill(body, loading('Loading the sensors and stations', 'Φόρτωση αισθητήρων και σταθμών'));
        try { await loadEnv(); } catch (e) { if (alive) fill(body, errBox('the sensors and stations', 'των αισθητήρων και των σταθμών', e, boot)); return; }
        if (!alive) return;
        build();
      }
      function build() {
        {
          const ph = head.querySelector('.page-head'), lede = head.querySelector('.lede');
          const seen = Math.max(0, ...sensorsOf().map((s) => s.lastSeen || 0));
          const fresh = !seen ? null : Date.now() - seen < 3 * HOUR ? { txt: T('Live · ' + SC.ago(seen), 'Ζωντανά · ' + SC.ago(seen)), cls: '' } : { txt: T('Last sensor reading ' + SC.ago(seen), 'Τελευταία μέτρηση αισθητήρα ' + SC.ago(seen)), cls: ' stale' };
          if (ph && lede && fresh) ph.insertBefore(h('span', { class: 'fresh-pill' + fresh.cls }, h('i'), fresh.txt), lede);
          if (E.demo && ph && lede) ph.insertBefore(h('span', { class: 't demo' }, T('Demo data', 'Δοκιμαστικά δεδομένα')), lede);
        }
        if (!E.sources.length) { fill(body, empty('No school sensor or Met Office station has reported yet. Come back in a few minutes, or open the live map to see what is connected.', 'Κανένας αισθητήρας σχολείου ή σταθμός της Μετεωρολογικής Υπηρεσίας δεν έχει αναφέρει ακόμα. Ελέγξτε ξανά σε λίγα λεπτά ή ανοίξτε τον ζωντανό χάρτη για να δείτε τι είναι συνδεδεμένο.')); return; }
        // starting readings, from the address when valid
        const dc = defaultReading('temp');
        if (!getReading(S.cmp.a)) S.cmp.a = (dc.sensor || dc.station || {}).id || '';
        if (S.cmp.b && !getReading(S.cmp.b)) S.cmp.b = '';
        if (!S.cmp.b && !q('b')) S.cmp.b = dc.sensor && dc.station ? dc.station.id : '';
        if (!getReading(S.fd.id)) S.fd.id = (dc.station || dc.sensor || {}).id || '';
        if (!getReading(S.dl.a)) S.dl.a = (dc.sensor || dc.station || {}).id || '';
        const asSource = (id) => { const s = E.byId.get(id); return s && s.kind; };
        if (asSource(S.of.sensor) !== 'sensor') S.of.sensor = '';
        if (asSource(S.of.station) !== 'station') S.of.station = '';
        const sensorId = (id) => { const r = getReading(id); return r && r.kind === 'sensor' ? r.src.id : ''; };
        if (!S.of.sensor && q('tool') && (TOOL_ALIAS[q('tool')] || q('tool')) === 'official') S.of.sensor = sensorId(q('a'));

        const metaBits = [];
        const ns = sensorsOf().length, nm = stationsOf().length;
        metaBits.push(T(ns + ' school sensor' + (ns === 1 ? '' : 's'), ns + ' αισθητήρες σχολείων'), T(nm + ' Met Office station' + (nm === 1 ? '' : 's'), nm + ' σταθμοί Μετεωρολογικής Υπηρεσίας'));
        const lastSeen = Math.max(0, ...sensorsOf().map((s) => s.lastSeen || 0));
        if (lastSeen) metaBits.push(T('newest sensor reading ' + SC.ago(lastSeen), 'νεότερη μέτρηση αισθητήρα ' + SC.ago(lastSeen)));
        if (E.feedTime) metaBits.push(T('newest station reading ' + hhmm(E.feedTime), 'νεότερη μέτρηση σταθμού ' + hhmm(E.feedTime)));

        const pills = h('div', { class: 'nm-pillbar ex-pills', role: 'tablist', 'aria-label': T('Analysis tools', 'Εργαλεία ανάλυσης') });
        const btns = new Map();
        TOOLS.forEach(([id, label]) => {
          const b = h('button', { type: 'button', role: 'tab', id: 'ex-tab-' + id, 'aria-controls': 'ex-panel', 'aria-selected': 'false', tabindex: '-1', onclick: () => openTool(id),
            onkeydown: (e) => {
              const i = TOOLS.findIndex((x) => x[0] === id);
              let to = null;
              if (e.key === 'ArrowRight') to = TOOLS[(i + 1) % TOOLS.length][0]; else if (e.key === 'ArrowLeft') to = TOOLS[(i + TOOLS.length - 1) % TOOLS.length][0];
              else if (e.key === 'Home') to = TOOLS[0][0]; else if (e.key === 'End') to = TOOLS[TOOLS.length - 1][0];
              if (to) { e.preventDefault(); openTool(to); btns.get(to).focus(); }
            } }, label);
          btns.set(id, b); pills.append(b);
        });
        const toolHint = h('span', { class: 'ex-toolhint' });
        const top = h('div', { class: 'ex-top' });
        const main = h('section', { class: 'nm-card ex-br ex-main', id: 'ex-panel', role: 'tabpanel', tabindex: '-1' });
        const after = h('div', { class: 'ex-after' });   // a tool may put a note under its card (the reading guide of Sensor vs official)
        const notes = E.notes.length ? h('div', { class: 'nm-callout nm-callout--warn ex-note-box', role: 'status' }, T('Not loaded just now: ' + E.notes.map((n) => n.en).join(' and ') + '. The other readings still work. ', 'Δεν φορτώθηκαν τώρα: ' + E.notes.map((n) => n.el).join(' και ') + '. Οι υπόλοιπες μετρήσεις λειτουργούν κανονικά. '),
          h('button', { class: 'nm-btn', type: 'button', onclick: async () => { try { await loadEnv(); } catch (e) { return; } if (alive) { toolCleanup && toolCleanup(); toolCleanup = null; if (rank) rank.destroy(); build(); } } }, T('Try again', 'Δοκιμάστε ξανά'))) : null;
        rank = rankCard((r) => { S.cmp.a = r.id; openTool('compare', true); }, (r) => {
          // the readings the open tool is showing are outlined in the list
          if (S.tool === 'compare') return r.id === S.cmp.a || r.id === S.cmp.b;
          if (S.tool === 'finder') return r.id === S.fd.id;
          if (S.tool === 'download') return r.id === S.dl.a;
          if (S.tool === 'official') return r.fam === S.of.fam && (r.src.id === S.of.sensor || r.src.id === S.of.station);
          return false;
        });
        fill(body,
          h('div', { class: 'ex-tabs-row' }, pills, toolHint),
          notes, top,
          h('div', { class: 'ex-grid' }, rank.el, h('div', { class: 'ex-col' }, main, after)),
          h('p', { class: 'ex-meta' }, metaBits.join(' · ')));
        airSlot(body, () => alive);

        function openTool(id, fromRank) {
          if (!MOUNT[id]) id = 'compare';
          if (toolCleanup) { try { toolCleanup(); } catch (e) { /* ignore */ } toolCleanup = null; }
          S.tool = id; mounted = id;
          btns.forEach((b, k) => { b.classList.toggle('on', k === id); b.setAttribute('aria-selected', String(k === id)); b.tabIndex = k === id ? 0 : -1; });
          const cur = btns.get(id);
          if (pills.scrollWidth > pills.clientWidth) pills.scrollLeft = cur.offsetLeft - (pills.clientWidth - cur.offsetWidth) / 2;
          main.setAttribute('aria-labelledby', 'ex-tab-' + id);
          fill(top); fill(main); fill(after);
          toolHint.textContent = '';
          toolCleanup = MOUNT[id](S, { top, main, after, hint: (t) => { toolHint.textContent = t; }, alive: () => alive && mounted === id }) || null;
          S.sync();
          if (rank) rank.restyle();
          if (fromRank && window.innerWidth < 1180) main.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
        }
        openTool(S.tool);
        every(() => rank && rank.reload(true), 300000);
      }
      boot();
      return () => { alive = false; timers.forEach(clearInterval); if (toolCleanup) { try { toolCleanup(); } catch (e) { /* ignore */ } } if (rank) rank.destroy(); };
    },
  });
})();
