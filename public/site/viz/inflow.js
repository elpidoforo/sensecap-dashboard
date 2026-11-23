/*
  inflow.js: water entering the reservoirs in ONE water year (October to September): one bar per reporting interval, the pooled
  July-to-September figure as one wider bar, the published total beside it, and a strip of all years' published totals in time order.
  SC.viz.inflow.mount(host, model, { year, onPick }) -> { set({year}), model(), destroy() }.
  The page builds its <select> from model.choices ({id, name:[en,el]}) and calls set({year: id}), which returns the current model.
  Historical data: nothing moves except a one-time entrance (none under prefers-reduced-motion). Blank intervals stay empty.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const CY = '#7DD3FC', AM = '#FBBF24', INK = '#EAF0F7', DIM = '#9fb2cc', GRID = 'rgba(125,211,252,.14)';
  const tx = (p) => (Array.isArray(p) ? p[(window.SC && SC.lang === 'el') ? 1 : 0] : String(p == null ? '' : p));

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.inflowData;
    let m = model, picked = -1, pinned = -1, W = 0, H = 0, L = null, hits = [], raf = 0, dead = false, anim = 1, t0 = 0;
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%';
    host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    if (opts.year && D) m = D.select(m, opts.year);
    const ok = () => m && m.available && m.intervals;
    const items = () => (ok() ? m.intervals.map((it) => ({ kind: 'interval', year: m.year, period: it.k, months: it.months, value: it.value, published: it.published, label: it.label }))
      .concat(m.strip.map((s) => ({ kind: 'year', year: s.year, total: s.total, partial: s.partial, label: s.label }))) : []);
    const aria = () => host.setAttribute('aria-label', tx(picked >= 0 && items()[picked] ? items()[picked].label : (m && (m.ariaLabel || m.empty)) || ''));
    function lines(s, font, w) { ctx.font = font; const out = []; let line = ''; for (const word of String(s).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
    function put(ls, x, y, lh, font, color) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ls.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); return y + ls.length * lh; }

    function layout() {
      const w = Math.max(240, host.clientWidth || 320), pad = 12, full = w - 2 * pad, wide = w >= 760, dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!ok()) { const e = lines(tx((m && m.empty) || ''), '13px ' + MONO, full); L = { empty: e, pad }; W = w; H = pad * 2 + e.length * 18 + 6; size(dpr); return; }
      const S = m.strings; let y = pad;
      const title = lines(tx(S.title) + ' · ' + tx(S.waterYear) + ' ' + m.year + (m.partial ? ' (' + tx(S.partial) + ')' : '') + ' · ' + tx(m.yearName), '700 13px ' + MONO, full);
      const still = lines(tx(S.still) + ' · ' + tx(S.source), '11px ' + MONO, full);
      const titleY = y + 12; y = titleY + (title.length - 1) * 17 + 17; const stillY = y; y += (still.length - 1) * 15 + 12;
      const chartW = wide ? Math.round(full * 0.64) : full, gut = 40;
      const axis = lines(tx(S.axis), '10px ' + MONO, chartW); const axisY = y + 10; y = axisY + (axis.length - 1) * 13 + 14;
      const plot = { x: pad + gut, y, w: chartW - gut, h: 190 }; const u = plot.w / 12;
      const chartBottom = plot.y + plot.h + 34;
      // the published total and the sum check: beside the chart when wide, under it when narrow
      const sx = wide ? pad + chartW + 26 : pad, sw = wide ? full - chartW - 26 : full; let sy = wide ? axisY : chartBottom + 8;
      const side = { x: sx, labelY: sy + 4, numY: sy + 36 };
      const check = lines(tx(m.check.text), '12px ' + MONO, sw), part = m.partialText ? lines(tx(m.partialText), '12px ' + MONO, sw) : [];
      side.checkY = side.numY + 26; side.check = check; side.partY = side.checkY + check.length * 16 + 6; side.part = part;
      const sideBottom = side.partY + part.length * 16;
      y = Math.max(chartBottom, sideBottom) + 12;
      const stripT = lines(tx(S.strip), '11px ' + MONO, full); const stripTY = y + 10; y = stripTY + (stripT.length - 1) * 14 + (m.strip.some((s) => s.partial) ? 24 : 10);
      const strip = { x: pad + gut, y, w: full - gut, h: 62 }; y = strip.y + strip.h + 30;
      const limit = lines(tx(S.limit), '11px ' + MONO, full); const limitY = y + 4; y = limitY + limit.length * 15;
      const readY = y + 12, readLines = w < 520 ? 6 : w < 900 ? 4 : 3; y = readY + readLines * 16;
      L = { pad, full, wide, title, titleY, still, stillY, axis, axisY, plot, u, side, stripT, stripTY, strip, limit, limitY, readY, readLines };
      W = w; H = y + pad - 8; size(dpr);
      // hit boxes: the ten intervals, then every year of the strip
      hits = []; let k = 0;
      m.intervals.forEach((it) => { hits.push({ x: plot.x + k * u, y: plot.y - 6, w: it.months * u, h: plot.h + 40 }); k += it.months; });
      const sw1 = strip.w / m.strip.length; m.strip.forEach((s, i) => hits.push({ x: strip.x + i * sw1, y: strip.y - 4, w: sw1, h: strip.h + 22 }));
    }
    function size(dpr) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function hatch(x, y, w, h, color) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); for (let d = -h; d < w + h; d += 4) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); } ctx.stroke(); ctx.restore(); }

    function draw(now) {
      raf = 0; if (dead || !L) return; ctx.clearRect(0, 0, W, H);
      if (L.empty) { put(L.empty, L.pad, L.pad + 14, 18, '13px ' + MONO, DIM); return; }
      if (anim < 1) { anim = Math.min(1, ((now || performance.now()) - t0) / 500); }
      const e = 1 - Math.pow(1 - anim, 3), S = m.strings, P = L.plot, u = L.u, small = u < 46;
      put(L.title, L.pad, L.titleY, 17, '700 13px ' + MONO, INK);
      put(L.still, L.pad, L.stillY, 15, '11px ' + MONO, AM);
      put(L.axis, L.pad, L.axisY, 13, '10px ' + MONO, DIM);
      // grid and scale (this year's own scale, written on the axis)
      ctx.font = '10px ' + MONO; ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) { const v = (m.yMax * i) / 4, gy = P.y + P.h - (P.h * i) / 4; ctx.strokeStyle = i ? GRID : 'rgba(125,211,252,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.x, gy + .5); ctx.lineTo(P.x + P.w, gy + .5); ctx.stroke(); ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.fillText(String(+v.toPrecision(4)), P.x - 6, gy); }
      let k = 0;
      m.intervals.forEach((it, i) => {
        const x = P.x + k * u, w = it.months * u, inset = small ? 2 : 5, bx = x + inset, bw = w - 2 * inset, on = i === picked; k += it.months;
        if (it.value == null) {
          // blank in the source: an empty slot with the word, never a bar and never a zero
          ctx.setLineDash([3, 3]); ctx.strokeStyle = on ? '#fff' : 'rgba(159,178,204,.55)'; ctx.lineWidth = 1; ctx.strokeRect(bx + .5, P.y + P.h - 44.5, bw - 1, 44); ctx.setLineDash([]);
          ctx.save(); ctx.translate(bx + bw / 2, P.y + P.h - 22); if (bw < 44) ctx.rotate(-Math.PI / 2); ctx.fillStyle = on ? '#fff' : DIM; ctx.font = '10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tx(S.blank), 0, 0); ctx.restore();
        } else {
          const h = Math.max(it.value > 0 ? 1.5 : 0, P.h * it.t * e), by = P.y + P.h - h;
          ctx.fillStyle = it.pooled ? 'rgba(251,191,36,' + (on ? .95 : .75) + ')' : 'rgba(125,211,252,' + (on ? .95 : .7) + ')';
          if (h > 0) ctx.fillRect(bx, by, bw, h); else { ctx.fillRect(bx, P.y + P.h - 1, bw, 2); }
          if (on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(bx - .5, Math.min(by, P.y + P.h - 2) - .5, bw + 1, Math.max(h, 2) + 1); }
          if (!small || on) { ctx.fillStyle = on ? '#fff' : INK; ctx.font = (on ? '700 ' : '') + '10px ' + MONO; ctx.textBaseline = 'alphabetic'; const s = it.published, tw = ctx.measureText(s).width; const cx = Math.max(P.x + tw / 2, Math.min(P.x + P.w - tw / 2, bx + bw / 2)); ctx.textAlign = 'center'; ctx.fillText(s, cx, Math.max(P.y - 2, by - 5)); }
        }
        ctx.fillStyle = on ? '#fff' : DIM; ctx.font = (small ? '9px ' : '10px ') + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(tx(it.short), x + w / 2, P.y + P.h + 14);
        if (it.pooled) { // a bracket under the wide bar: three months, one figure
          ctx.strokeStyle = AM; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, P.y + P.h + 18); ctx.lineTo(bx, P.y + P.h + 21); ctx.lineTo(bx + bw, P.y + P.h + 21); ctx.lineTo(bx + bw, P.y + P.h + 18); ctx.stroke();
          ctx.fillStyle = AM; ctx.font = '9px ' + MONO; const s = tx(S.pooled), tw = ctx.measureText(s).width; ctx.textAlign = tw > w ? 'right' : 'center'; ctx.fillText(s, tw > w ? P.x + P.w : x + w / 2, P.y + P.h + 32);
        }
      });
      // published total and whether the intervals add up to it
      const sd = L.side; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = DIM; ctx.font = '11px ' + MONO; ctx.fillText(tx(S.total) + ' · ' + m.year + (m.partial ? ' · ' + tx(S.partial) : ''), sd.x, sd.labelY + 8);
      ctx.fillStyle = m.partial ? AM : CY; ctx.font = '700 26px ' + MONO; const num = m.totalPublished == null ? '–' : m.totalPublished; ctx.fillText(num, sd.x, sd.numY + 6); const nw = ctx.measureText(num).width;
      ctx.fillStyle = DIM; ctx.font = '12px ' + MONO; ctx.fillText(tx(m.unit), sd.x + nw + 8, sd.numY + 6);
      put(sd.check, sd.x, sd.checkY + 8, 16, '12px ' + MONO, m.check.kind === 'larger' || m.check.kind === 'rounding' ? AM : INK);
      if (sd.part.length) put(sd.part, sd.x, sd.partY + 8, 16, '12px ' + MONO, AM);
      // strip: every year's published total, in time order
      const T = L.strip, n = m.strip.length, bw = T.w / n; put(L.stripT, L.pad, L.stripTY, 14, '11px ' + MONO, DIM);
      ctx.strokeStyle = 'rgba(125,211,252,.5)'; ctx.beginPath(); ctx.moveTo(T.x, T.y + T.h + .5); ctx.lineTo(T.x + T.w, T.y + T.h + .5); ctx.stroke();
      ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(T.x, T.y + .5); ctx.lineTo(T.x + T.w, T.y + .5); ctx.stroke();
      ctx.fillStyle = DIM; ctx.font = '10px ' + MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(m.stripMax), T.x - 6, T.y); ctx.fillText('0', T.x - 6, T.y + T.h);
      const every = bw >= 34 ? 3 : bw >= 17 ? 5 : 10;
      m.strip.forEach((s, i) => {
        const x = T.x + i * bw, g = Math.min(2, bw * .15), sel = s.year === m.year, on = picked === m.intervals.length + i;
        if (s.total == null) { ctx.fillStyle = DIM; ctx.font = '9px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('–', x + bw / 2, T.y + T.h - 4); }
        else {
          const h = Math.max(s.total > 0 ? 1.5 : 0, T.h * s.t), y = T.y + T.h - h, c = sel ? (s.partial ? AM : CY) : 'rgba(125,211,252,.38)';
          if (s.partial) { ctx.fillStyle = 'rgba(251,191,36,.18)'; ctx.fillRect(x + g, y, bw - 2 * g, h); hatch(x + g, y, bw - 2 * g, h, AM); ctx.strokeStyle = AM; ctx.lineWidth = 1; ctx.strokeRect(x + g + .5, y - .5, bw - 2 * g - 1, h); }
          else { ctx.fillStyle = c; ctx.fillRect(x + g, y, bw - 2 * g, h); }
          if (on || sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = on ? 1.5 : 1; ctx.strokeRect(x + g - .5, y - .5, bw - 2 * g + 1, h + 1); }
        }
        if (sel) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + bw / 2 - 4, T.y + T.h + 4); ctx.lineTo(x + bw / 2 + 4, T.y + T.h + 4); ctx.lineTo(x + bw / 2, T.y + T.h + 9); ctx.closePath(); ctx.fill(); }
        ctx.font = '9px ' + MONO; const lw = ctx.measureText(s.year).width;
        if (i % every === 0 && i < n - 1 && x + lw + 8 < T.x + T.w - lw) { ctx.fillStyle = DIM; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s.year, x, T.y + T.h + 22); }
        else if (i === n - 1) { ctx.fillStyle = s.partial ? AM : DIM; ctx.font = '9px ' + MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s.year, T.x + T.w, T.y + T.h + 22); }
      });
      if (m.strip.some((s) => s.partial)) { ctx.font = '10px ' + MONO; ctx.fillStyle = AM; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(tx(S.stripKey), L.pad, T.y - 8); }
      put(L.limit, L.pad, L.limitY + 8, 15, '11px ' + MONO, DIM);
      // read-out: the picked interval or year, or the hint
      const it = picked >= 0 ? items()[picked] : null, rl = lines(tx(it ? it.label : S.hint), '12px ' + MONO, L.full).slice(0, L.readLines);
      put(rl, L.pad, L.readY + 8, 16, '12px ' + MONO, it ? '#fff' : '#8ea3bf');
      if (anim < 1) ask();
    }
    const ask = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    function hit(ev) { const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; for (let i = 0; i < hits.length; i++) { const h = hits[i]; if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return i; } return -1; }
    function pick(i, quiet) { if (i === picked) return; picked = i; aria(); ask(); if (!quiet && opts.onPick) opts.onPick(i >= 0 ? items()[i] || null : null); }
    const onMove = (ev) => { const i = hit(ev); pick(i >= 0 ? i : pinned); cv.style.cursor = i >= 0 ? 'pointer' : 'default'; };
    const onLeave = () => pick(pinned);
    const onClick = (ev) => { const i = hit(ev); pinned = i; pick(i); };
    const onKey = (ev) => { const n = items().length; if (!n) return; let i = picked; const ni = m.intervals.length;
      if (ev.key === 'ArrowRight') i = (picked + 1 + n) % n; else if (ev.key === 'ArrowLeft') i = (picked - 1 + n) % n;
      else if (ev.key === 'ArrowDown') i = picked < ni ? ni + Math.max(0, m.strip.findIndex((s) => s.year === m.year)) : picked; else if (ev.key === 'ArrowUp') i = picked >= ni ? 0 : picked < 0 ? 0 : picked;
      else if (ev.key === 'Home') i = 0; else if (ev.key === 'End') i = n - 1; else if (ev.key === 'Escape') i = -1; else return;
      ev.preventDefault(); pinned = i; pick(i); };
    const onVis = () => { if (document.hidden) { anim = 1; } ask(); };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onVis);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { layout(); ask(); }) : null; if (ro) ro.observe(host);
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!calm && !document.hidden && ok()) { anim = 0; t0 = performance.now(); }
    layout(); aria(); draw(t0);
    return {
      set(o) { if (o && o.year && D) { const n = D.select(m, o.year); if (n !== m) { m = n; picked = pinned = -1; } } layout(); aria(); ask(); return m; },
      model: () => m,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); },
    };
  }
  SC.viz.inflow = { mount };
})();
