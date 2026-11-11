/*
  Small line chart for Met Office station history, shared by the map popup and the Met Office page.
  No libraries. Draws SVG, shows a readout when you point at it, and leaves a gap where readings are missing.

    MOChart.render(box, points, { unit, label, color, ink, grid, w, h, hours, latest, empty, area, gaps, endDot, ticks, compact, lines })
      box     element to draw into (its contents are replaced)
      points  [{ t: milliseconds, v: number }] oldest first
      area    soft fill under the line;  gaps  amber band where more than an hour of readings is missing;  endDot  mark the newest reading
      ticks   small marks under the time labels;  compact  narrower margins;  lines  about how many grid lines (default 4)
    MOChart.series(station, hours)   -> promise of the /api/cydom/history answer
    MOChart.points(series, key)      -> [{ t, v }] for one reading
    MOChart.KEYS                     the readings worth charting, in order
*/
(function (g) {
  const NS = 'http://www.w3.org/2000/svg';
  const TZ = 'Asia/Nicosia';
  const KEYS = ['temp', 'hum', 'ws10', 'ws2', 'pmsl', 'rain10', 'dsr', 'tmax', 'tmin'];
  const NAMES = { temp: 'Temperature', hum: 'Humidity', ws10: 'Wind speed (10 m)', ws2: 'Wind speed (2 m)', pmsl: 'Pressure (sea level)', rain10: 'Rain (10 min)', dsr: 'Direct sun', tmax: 'Day maximum', tmin: 'Day minimum' };

  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const dm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
  const full = (t) => `${dm.format(t)} ${hm.format(t)}`;
  let uid = 0;
  const num = (v) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));

  function svg(name, attrs, text) {
    const el = document.createElementNS(NS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    return el;
  }
  function div(cls, text) {
    const el = document.createElement('div');
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  // 1, 2, 5 times a power of ten
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function render(box, points, o) {
    o = o || {};
    box.replaceChildren();
    const pts = (points || []).filter((p) => p && isFinite(p.t) && isFinite(p.v));
    if (pts.length < 2) {
      box.append(div('mo-empty', o.empty || 'Not enough readings saved for this period yet. The server saves a reading every 10 minutes.'));
      return;
    }
    const W = o.w || 640, H = o.h || 240;
    const m = o.compact ? { l: 30, r: 8, t: 8, b: 22 } : { l: 40, r: 10, t: 10, b: 22 };
    const ink = o.ink || 'var(--ink2, #5c5b57)';
    const grid = o.grid || 'var(--line, rgba(0,0,0,.14))';
    const color = o.color || 'var(--acc, #2a78d6)';
    let lo = Infinity, hi = -Infinity;
    pts.forEach((p) => { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; });
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const step = niceStep((hi - lo) / (o.lines || 4));
    const y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const X = (t) => m.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - m.l - m.r);
    const Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);

    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img' });
    s.style.display = 'block';
    s.style.touchAction = 'pan-y';
    const last = pts[pts.length - 1];
    s.setAttribute('aria-label', `${o.label || 'Reading'}, ${o.hours ? o.hours + ' hours' : 'history'}: lowest ${num(lo)}, highest ${num(hi)}, latest ${num(last.v)} ${o.unit || ''} at ${full(last.t)}`);

    for (let v = y0; v <= y1 + step / 2; v += step) {
      const y = Y(v);
      s.append(svg('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: grid, 'stroke-width': 1 }));
      s.append(svg('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: ink }, num(v)));
    }
    // time labels on round local times: whole hours for a day or two, midnights for longer
    const span = t1 - t0;
    const maxLabels = W < 400 ? 4 : 6;
    const parts = (t) => { const o = {}; hm.formatToParts(t).forEach((x) => { o[x.type] = Number(x.value); }); return o; };
    const long = span > 36 * 3600000;
    let cand = [];
    for (let t = Math.ceil(t0 / 1800000) * 1800000; t <= t1; t += 1800000) {
      const q = parts(t);
      if (q.minute === 0 && (!long || q.hour === 0)) cand.push({ t, h: q.hour });
    }
    const steps = long ? [1, 2, 3, 5, 7, 10, 14] : [1, 2, 3, 4, 6, 12];
    const tickStep = steps.find((k) => cand.filter((c, i) => (long ? i % k === 0 : c.h % k === 0)).length <= maxLabels) || steps[steps.length - 1];
    cand.filter((c, i) => (long ? i % tickStep === 0 : c.h % tickStep === 0)).forEach((c) => {
      const x = X(c.t);
      if (x < m.l + 14 || x > W - m.r - 14) return;
      s.append(svg('text', { x, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: ink }, long ? dm.format(c.t) : hm.format(c.t)));
      if (o.ticks) s.append(svg('line', { x1: x, x2: x, y1: H - m.b, y2: H - m.b + 3.5, stroke: ink, 'stroke-opacity': 0.6 }));
    });
    // pieces of the line: a new piece starts where more than an hour of readings is missing
    const segs = [[]];
    pts.forEach((p, i) => { if (i && p.t - pts[i - 1].t > 3600000) segs.push([]); segs[segs.length - 1].push(p); });
    if (o.gaps) {
      for (let i = 1; i < segs.length; i++) {
        const xa = X(segs[i - 1][segs[i - 1].length - 1].t), xb = X(segs[i][0].t);
        s.append(svg('rect', { x: xa, y: m.t, width: Math.max(1, xb - xa), height: H - m.t - m.b, fill: 'rgba(240,185,74,.10)' }));
        [xa, xb].forEach((gx) => s.append(svg('line', { x1: gx, x2: gx, y1: m.t, y2: H - m.b, stroke: 'rgba(240,185,74,.5)', 'stroke-dasharray': '2 3' })));
      }
    }
    if (o.area) {
      const gid = 'mo-area-' + (++uid);
      const defs = svg('defs', {});
      const lg = svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
      lg.append(svg('stop', { offset: 0, 'stop-color': color, 'stop-opacity': 0.3 }), svg('stop', { offset: 1, 'stop-color': color, 'stop-opacity': 0 }));
      defs.append(lg); s.append(defs);
      segs.forEach((sg) => {
        if (sg.length < 2) return;
        s.append(svg('path', { d: 'M' + sg.map((p) => X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join('L') + 'L' + X(sg[sg.length - 1].t).toFixed(1) + ' ' + (H - m.b) + 'L' + X(sg[0].t).toFixed(1) + ' ' + (H - m.b) + 'Z', fill: 'url(#' + gid + ')', stroke: 'none' }));
      });
    }
    // the line, broken where more than an hour of readings is missing
    let d = '', prev = null;
    pts.forEach((p) => {
      d += (prev && p.t - prev.t <= 3600000 ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1);
      prev = p;
    });
    s.append(svg('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
    if (o.endDot) {
      s.append(svg('circle', { cx: X(last.t), cy: Y(last.v), r: 6, fill: color, 'fill-opacity': 0.22 }));
      s.append(svg('circle', { cx: X(last.t), cy: Y(last.v), r: 3.3, fill: '#8FE3F7', stroke: '#0b1b30', 'stroke-width': 1.2 }));
    }
    const dot = svg('circle', { r: 4, fill: color, stroke: '#fff', 'stroke-width': 1.5, visibility: 'hidden' });
    const guide = svg('line', { y1: m.t, y2: H - m.b, stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' });
    s.append(guide, dot);

    const readout = div('mo-readout', `${o.latest || 'Latest '}${num(last.v)} ${o.unit || ''} · ${full(last.t)}`);
    const show = (clientX) => {
      const r = s.getBoundingClientRect();
      const t = t0 + ((clientX - r.left) / Math.max(1, r.width) * W - m.l) / (W - m.l - m.r) * span;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      guide.setAttribute('x1', X(best.t)); guide.setAttribute('x2', X(best.t));
      dot.setAttribute('cx', X(best.t)); dot.setAttribute('cy', Y(best.v));
      guide.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
      readout.textContent = `${num(best.v)} ${o.unit || ''} · ${full(best.t)}`;
    };
    s.addEventListener('pointermove', (e) => show(e.clientX));
    s.addEventListener('pointerdown', (e) => show(e.clientX));
    s.addEventListener('pointerleave', () => {
      guide.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden');
      readout.textContent = `${o.latest || 'Latest '}${num(last.v)} ${o.unit || ''} · ${full(last.t)}`;
    });
    box.append(s, readout);
  }

  function series(station, hours) {
    return fetch(`/api/cydom/history?station=${encodeURIComponent(station)}&hours=${hours || 24}`).then((r) => {
      if (!r.ok) throw new Error('The history could not be loaded (HTTP ' + r.status + ').');
      return r.json();
    });
  }

  function points(s, key) {
    const i = s.keys.indexOf(key);
    if (i < 0) return [];
    return s.rows.filter((r) => r[i + 1] != null).map((r) => ({ t: r[0], v: Number(r[i + 1]) }));
  }

  g.MOChart = { render, series, points, KEYS, NAMES, full, num };
})(window);
