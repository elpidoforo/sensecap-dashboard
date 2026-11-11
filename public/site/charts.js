/*
  Small SVG charts for the site. No libraries. Time axes use Cyprus time.

    SCChart.line(box, series, opts)   multi-line time chart with hover readout; gaps break the line
        series: [{ name, color, pts: [{ t: ms, v: number }], area?: true, dash?: true }]   (oldest first)
        opts:   { unit, dec, h, w, yMin, yMax, gap (ms, default 1 h), empty, label, band: [{ from, to, label }] }
    SCChart.spark(pts, opts)          tiny line, returns an <svg>. pts: [number] or [{ v }]. opts: { w, h, color, area }
    SCChart.donut(segments, opts)     segments: [{ value, color, label }], opts: { size, thick, big, small }
    SCChart.bars(items, opts)         items: [{ label, value, color }] horizontal bars. opts: { max, unit, dec }
    SCChart.COLORS                    the palette: blue, copper, green, violet, gold
*/
(function (g) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const TZ = 'Asia/Nicosia';
  const COLORS = ['#4C8BEA', '#E07F3F', '#59d98e', '#8f7bff', '#F2B24C'];
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
  const full = (t) => dm.format(t) + ' ' + hm.format(t);
  const fmt = (v, d) => (v == null || !isFinite(v) ? '–' : (d != null ? Number(v).toFixed(d) : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−'));

  function s(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs || {}) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function d(cls, text) { const e = document.createElement('div'); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  const parts = (t) => { const o = {}; hm.formatToParts(t).forEach((x) => { o[x.type] = Number(x.value); }); return o; };

  function line(box, series, o) {
    o = o || {};
    box.replaceChildren();
    series = (series || []).map((x, i) => ({ name: x.name, color: x.color || COLORS[i % COLORS.length], area: x.area, dash: x.dash,
      pts: (x.pts || []).filter((p) => p && isFinite(p.t) && isFinite(p.v)) })).filter((x) => x.pts.length);
    const all = [].concat(...series.map((x) => x.pts));
    if (all.length < 2) { box.append(d('empty', o.empty || 'Not enough readings for this period yet.')); return; }
    const W = o.w || 720, H = o.h || 260, m = { l: 44, r: 12, t: 12, b: 24 };
    let lo = o.yMin != null ? o.yMin : Infinity, hi = o.yMax != null ? o.yMax : -Infinity;
    all.forEach((p) => { if (o.yMin == null && p.v < lo) lo = p.v; if (o.yMax == null && p.v > hi) hi = p.v; });
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const step = niceStep((hi - lo) / 4);
    const y0 = o.yMin != null ? lo : Math.floor(lo / step) * step, y1 = o.yMax != null ? hi : Math.ceil(hi / step) * step;
    let t0 = Infinity, t1 = -Infinity;
    all.forEach((p) => { if (p.t < t0) t0 = p.t; if (p.t > t1) t1 = p.t; });
    const X = (t) => m.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - m.l - m.r);
    const Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img' });
    svg.style.display = 'block'; svg.style.touchAction = 'pan-y';
    const label = o.label || series.map((x) => x.name).filter(Boolean).join(', ');
    svg.setAttribute('aria-label', label + ': ' + fmt(lo, o.dec) + ' to ' + fmt(hi, o.dec) + ' ' + (o.unit || '') + ', ' + full(t0) + ' to ' + full(t1));
    const ink = '#8CA0B8', grid = 'rgba(255,255,255,.09)';
    for (let v = y0; v <= y1 + step / 2; v += step) {
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: grid }));
      svg.append(s('text', { x: m.l - 7, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: ink }, fmt(v, step < 1 ? 1 : 0)));
    }
    (o.band || []).forEach((b) => {
      const a = Math.max(t0, b.from), z = Math.min(t1, b.to);
      if (z > a) { svg.append(s('rect', { x: X(a), y: m.t, width: Math.max(1, X(z) - X(a)), height: H - m.t - m.b, fill: 'rgba(255,255,255,.07)' })); if (b.label) svg.append(s('text', { x: X(a) + 4, y: m.t + 12, 'font-size': 10.5, fill: '#F2CF86' }, b.label)); }
    });
    const span = t1 - t0, long = span > 36 * 3600000, maxL = W < 420 ? 4 : 7, cand = [];
    for (let t = Math.ceil(t0 / 1800000) * 1800000; t <= t1; t += 1800000) { const q = parts(t); if (q.minute === 0 && (!long || q.hour === 0)) cand.push({ t, h: q.hour }); }
    const steps = long ? [1, 2, 3, 5, 7, 10, 14] : [1, 2, 3, 4, 6, 12];
    const ts = steps.find((k) => cand.filter((c, i) => (long ? i % k === 0 : c.h % k === 0)).length <= maxL) || steps[steps.length - 1];
    cand.filter((c, i) => (long ? i % ts === 0 : c.h % ts === 0)).forEach((c) => {
      const x = X(c.t); if (x < m.l + 14 || x > W - m.r - 14) return;
      svg.append(s('text', { x, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: ink }, long ? dm.format(c.t) : hm.format(c.t)));
    });
    const gap = o.gap || 3600000;
    series.forEach((x) => {
      let dd = '', prev = null, first = null, lastp = null;
      x.pts.forEach((p) => { const brk = !prev || p.t - prev.t > gap; dd += (brk ? 'M' : 'L') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1); prev = p; });
      if (x.area) {
        let a = '', seg = [];
        const flush = () => { if (seg.length > 1) a += 'M' + X(seg[0].t).toFixed(1) + ' ' + Y(y0).toFixed(1) + seg.map((p) => 'L' + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join('') + 'L' + X(seg[seg.length - 1].t).toFixed(1) + ' ' + Y(y0).toFixed(1) + 'Z'; seg = []; };
        prev = null; x.pts.forEach((p) => { if (prev && p.t - prev.t > gap) flush(); seg.push(p); prev = p; }); flush();
        svg.append(s('path', { d: a, fill: x.color, opacity: 0.14 }));
      }
      svg.append(s('path', { d: dd, fill: 'none', stroke: x.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': x.dash ? '5 4' : null, 'vector-effect': 'non-scaling-stroke' }));
    });
    const guide = s('line', { y1: m.t, y2: H - m.b, stroke: '#cfdaea', 'stroke-dasharray': '3 3', visibility: 'hidden' });
    const dots = series.map((x) => s('circle', { r: 4, fill: x.color, stroke: '#fff', 'stroke-width': 1.5, visibility: 'hidden' }));
    svg.append(guide, ...dots);
    const lastAll = series.map((x) => x.pts[x.pts.length - 1]);
    const base = () => series.map((x, i) => (series.length > 1 ? x.name + ' ' : '') + fmt(lastAll[i].v, o.dec) + ' ' + (o.unit || '')).join(' · ') + ' · ' + full(Math.max(...lastAll.map((p) => p.t)));
    const latestLabel = o.latest != null ? o.latest : 'Latest ';
    const readout = d('chart-readout', latestLabel + base());
    readout.style.cssText = 'margin-top:6px;font-size:13.5px;color:var(--nm-text);min-height:1.4em';
    const show = (cx) => {
      const r = svg.getBoundingClientRect();
      const t = t0 + ((((cx - r.left) / Math.max(1, r.width)) * W - m.l) / (W - m.l - m.r)) * span;
      let bestT = null;
      series.forEach((x) => { x.pts.forEach((p) => { if (bestT == null || Math.abs(p.t - t) < Math.abs(bestT - t)) bestT = p.t; }); });
      guide.setAttribute('x1', X(bestT)); guide.setAttribute('x2', X(bestT)); guide.setAttribute('visibility', 'visible');
      const bits = [];
      series.forEach((x, i) => {
        let best = null; x.pts.forEach((p) => { if (!best || Math.abs(p.t - bestT) < Math.abs(best.t - bestT)) best = p; });
        if (best && Math.abs(best.t - bestT) <= gap) { dots[i].setAttribute('cx', X(best.t)); dots[i].setAttribute('cy', Y(best.v)); dots[i].setAttribute('visibility', 'visible'); bits.push((series.length > 1 ? x.name + ' ' : '') + fmt(best.v, o.dec) + ' ' + (o.unit || '')); } else dots[i].setAttribute('visibility', 'hidden');
      });
      readout.textContent = bits.join(' · ') + ' · ' + full(bestT);
    };
    svg.addEventListener('pointermove', (e) => show(e.clientX));
    svg.addEventListener('pointerdown', (e) => show(e.clientX));
    svg.addEventListener('pointerleave', () => { guide.setAttribute('visibility', 'hidden'); dots.forEach((x) => x.setAttribute('visibility', 'hidden')); readout.textContent = latestLabel + base(); });
    if (series.length > 1) {
      const lg = d('chart-legend'); lg.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;font-size:13px;color:var(--nm-muted)';
      series.forEach((x) => { const i = d(); i.style.cssText = 'display:inline-flex;align-items:center;gap:7px'; const sw = d(); sw.style.cssText = 'width:12px;height:3px;border-radius:2px;background:' + x.color; i.append(sw, document.createTextNode(x.name)); lg.append(i); });
      box.append(svg, lg, readout);
    } else box.append(svg, readout);
  }

  function spark(pts, o) {
    o = o || {};
    const W = o.w || 120, H = o.h || 34, color = o.color || COLORS[0];
    const v = (pts || []).map((p) => (typeof p === 'number' ? p : p && p.v)).filter((x) => x != null && isFinite(x));
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: o.width || W, height: o.height || H, 'aria-hidden': 'true' });
    svg.style.display = 'block'; svg.style.overflow = 'visible';
    if (v.length < 2) return svg;
    let lo = Math.min(...v), hi = Math.max(...v); if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const X = (i) => 2 + (i / (v.length - 1)) * (W - 4), Y = (x) => H - 3 - ((x - lo) / (hi - lo)) * (H - 6);
    const dd = v.map((x, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1)).join('');
    if (o.area !== false) svg.append(s('path', { d: dd + 'L' + X(v.length - 1).toFixed(1) + ' ' + H + 'L' + X(0).toFixed(1) + ' ' + H + 'Z', fill: color, opacity: 0.16 }));
    svg.append(s('path', { d: dd, fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    svg.append(s('circle', { cx: X(v.length - 1), cy: Y(v[v.length - 1]), r: 2.6, fill: color }));
    return svg;
  }

  function donut(segs, o) {
    o = o || {};
    const S = o.size || 160, th = o.thick || 18, R = S / 2 - th / 2 - 2, C = 2 * Math.PI * R;
    const svg = s('svg', { viewBox: '0 0 ' + S + ' ' + S, width: S, height: S, role: 'img', 'aria-label': o.label || (segs || []).map((x) => x.label + ' ' + x.value).join(', ') });
    svg.append(s('circle', { cx: S / 2, cy: S / 2, r: R, fill: 'none', stroke: 'rgba(255,255,255,.08)', 'stroke-width': th }));
    const total = (segs || []).reduce((a, x) => a + (x.value || 0), 0) || 1;
    let off = 0;
    (segs || []).forEach((x) => {
      if (!x.value) return;
      const len = (x.value / total) * C;
      svg.append(s('circle', { cx: S / 2, cy: S / 2, r: R, fill: 'none', stroke: x.color, 'stroke-width': th, 'stroke-dasharray': Math.max(0, len - 2) + ' ' + (C - Math.max(0, len - 2)), 'stroke-dashoffset': -off, transform: 'rotate(-90 ' + S / 2 + ' ' + S / 2 + ')' }));
      off += len;
    });
    if (o.big != null) {
      svg.append(s('text', { x: S / 2, y: S / 2 + (o.small ? 2 : 10), 'text-anchor': 'middle', 'font-size': S * 0.27, 'font-weight': 600, fill: '#fff', 'font-family': 'Inter Display, Inter, sans-serif' }, String(o.big)));
      if (o.small) svg.append(s('text', { x: S / 2, y: S / 2 + S * 0.16, 'text-anchor': 'middle', 'font-size': S * 0.085, fill: '#9fb2ca' }, o.small));
    }
    return svg;
  }

  function bars(items, o) {
    o = o || {};
    const wrap = d('bars'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:9px';
    const max = o.max || Math.max(1e-9, ...(items || []).map((x) => x.value || 0));
    (items || []).forEach((x, i) => {
      const row = d(); row.style.cssText = 'display:grid;grid-template-columns:minmax(90px,38%) 1fr auto;gap:10px;align-items:center;font-size:14px';
      const lab = d(null, x.label); lab.style.color = 'var(--nm-text)';
      const track = d(); track.style.cssText = 'height:10px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden';
      const fill = d(); fill.style.cssText = 'height:100%;border-radius:6px;width:' + Math.max(2, Math.min(100, ((x.value || 0) / max) * 100)) + '%;background:' + (x.color || COLORS[i % COLORS.length]);
      track.append(fill);
      const val = d('mono', fmt(x.value, o.dec) + (o.unit ? ' ' + o.unit : '')); val.style.color = 'var(--nm-ink-soft)';
      row.append(lab, track, val); wrap.append(row);
    });
    return wrap;
  }

  g.SCChart = { line, spark, donut, bars, COLORS, fmt, full };
})(window);
