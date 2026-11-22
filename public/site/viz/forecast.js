/*
  Forecast strip widget: SC.viz.forecast.mount(host, model, opts) -> handle. The model is built by forecast-data.js from the
  answer of /api/forecast. A strip of cells, one per forecast day the answer has (high, low, sky words, wind), and a thin line
  of the highs and lows under it. The canvas always carries the model's sentence "Forecast from a weather model, not a
  measurement" with the source and the time it was fetched. Nothing moves by itself: there is no autoplay; the only thing
  that moves is the marker the reader scrubs.
    opts.index                     first marker position (default: the model's `first`, today's cell when there is one)
    opts.onPick({time, index, label:[en,el], values:{tmax,tmin,code,wind,windDir,rain}}|null)
                                   every time the marker lands on another day (pointer, keys, seek) and once at mount;
                                   null for a click on nothing
  handle = { destroy(), seek(i), update(answer, now) -> model, index, model }
    update() takes a fresh ANSWER of /api/forecast and rebuilds the model with SC.viz.forecastData.build (numbers stay in the data file).
  Keyboard (host is focusable): Left / Right move one day, Home / End jump.
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', PANEL = '#050b16', DIM = 'rgba(125,211,252,0.62)', WHITE = '#e8f6ff';
  const PULSE_MS = 380;

  function mount(host, model, opts) {
    opts = opts || {};
    const reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let at = 0, raf = 0, pulse0 = 0, dead = false, w = 0, hits = [], lineBox = null, down = false;
    const idx = () => (SC.lang === 'el' ? 1 : 0), L = (p) => (p ? p[idx()] : '');
    const el = (tag, css) => { const e = document.createElement(tag); if (css) e.style.cssText = css; return e; };
    const ok = () => !!(model && model.available && model.cells.length);
    const clampI = (i) => Math.max(0, Math.min(model.cells.length - 1, Math.round(Number(i)) || 0));
    if (ok()) at = clampI(opts.index != null ? opts.index : model.first);
    host.setAttribute('role', 'img');
    if (!host.hasAttribute('tabindex')) host.setAttribute('tabindex', '0');
    host.style.cssText += ';background:' + PANEL + ';color:' + CYAN + ';font-family:' + MONO + ';padding:10px;box-sizing:border-box;border:1px solid rgba(125,211,252,0.18);border-radius:8px;box-shadow:0 0 24px rgba(125,211,252,0.06)';
    const cv = el('canvas', 'display:block;width:100%;cursor:default;touch-action:pan-y'), ctx = cv.getContext('2d');
    const txt = el('div', 'margin-top:8px;font-size:11px;line-height:1.5;color:' + DIM);
    host.append(cv, txt);

    const record = () => { const c = model.cells[at]; return { time: c.time, index: c.i, label: c.label, values: Object.assign({}, c.values) }; };
    const fire = () => { if (opts.onPick && ok()) opts.onPick(record()); };
    const fit = (s, max) => { while (s.length > 3 && ctx.measureText(s).width > max) s = s.slice(0, -2) + '…'; return s; };
    function wrap(s, max, lines) {
      const out = []; let cur = '';
      for (const word of s.split(' ')) {
        const t = cur ? cur + ' ' + word : word;
        if (ctx.measureText(t).width <= max || !cur) cur = t;
        else if (out.length < lines - 1) { out.push(cur); cur = word; }
        else { cur = t; }
      }
      out.push(fit(cur, max));
      return out;
    }
    function rr(x, y, ww, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + ww, y, x + ww, y + hh, r); ctx.arcTo(x + ww, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + ww, y, r); ctx.closePath(); }
    // amber pill with a sentence, wrapped to as many lines as it needs (never cut: it is the honesty label); returns its height
    function pill(s, y, col, measureOnly) {
      ctx.font = '600 ' + (w < 520 ? 10 : 11) + 'px ' + MONO;
      const lines = wrap(s, w - 18, 4), h = 8 + lines.length * 14, ww = Math.min(w - 1, Math.max(...lines.map((q) => ctx.measureText(q).width)) + 16);
      if (measureOnly) return h;
      rr(0.5, y + 0.5, ww, h - 1, 5); ctx.fillStyle = col === AMBER ? 'rgba(251,191,36,0.10)' : 'rgba(125,211,252,0.08)'; ctx.fill();
      ctx.strokeStyle = col === AMBER ? 'rgba(251,191,36,0.7)' : 'rgba(125,211,252,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col; ctx.textAlign = 'left'; lines.forEach((q, i) => ctx.fillText(q, 8, y + 11.5 + i * 14));
      return h;
    }

    function draw(now) {
      if (dead) return;
      host.setAttribute('aria-label', L(model.ariaLabel));
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      w = Math.max(200, Math.floor(host.clientWidth - 22));
      txt.textContent = '';
      const line = (s, col) => { const p = el('p', 'margin:0 0 4px' + (col ? ';color:' + col : '')); p.textContent = s; txt.append(p); };
      hits = []; lineBox = null;
      if (!ok()) { cv.width = 1; cv.height = 1; cv.style.height = '1px'; line(L(model.empty || model.ariaLabel), CYAN); return; }
      const n = model.cells.length, narrow = w < 520;
      const per = Math.min(n, Math.max(1, Math.floor((w + 4) / (narrow ? 62 : 96)))), nRows = Math.ceil(n / per);
      const gx = narrow ? 4 : 8, cw = (w - gx * (per - 1)) / per, dayH = 16, ch = narrow ? 82 : 92, rowH = dayH + ch + 8;
      const lineTop = 14, lineH = 50, lineBot = 14;
      ctx.textBaseline = 'middle';
      // measure the head (label pills + source line) and the read-out before sizing the canvas
      let headH = pill(L(model.label), 0, AMBER, true) + 4;
      if (model.mockLabel) headH += pill(L(model.mockLabel), 0, AMBER, true) + 4;
      ctx.font = (narrow ? 10 : 11) + 'px ' + MONO;
      const metaLines = wrap(L(model.meta) + (model.made && model.made.ageText ? ' (' + L(model.made.ageText) + ')' : ''), w, 3);
      headH += metaLines.length * 14 + 10;
      const read = wrap(L(model.cells[at].label), w, 4), readH = 6 + read.length * 14;
      const yCells = headH, yLine = yCells + nRows * rowH + 2, hgt = Math.ceil(yLine + lineTop + lineH + lineBot + readH + 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt);
      ctx.textBaseline = 'middle';

      // 1. the honesty label, always on the picture; then source, place and the time it was fetched
      let y = 0;
      y += pill(L(model.label), y, AMBER) + 4;
      if (model.mockLabel) y += pill(L(model.mockLabel), y, AMBER) + 4;
      ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; ctx.fillStyle = DIM; ctx.textAlign = 'left';
      metaLines.forEach((s, i) => ctx.fillText(s, 0, y + 8 + i * 14));

      // 2. the strip: one cell per forecast day
      const p = reduce || !pulse0 ? 1 : Math.min(1, ((now || 0) - pulse0) / PULSE_MS), ease = 1 - (1 - p) * (1 - p);
      const pos = [];
      let cur = null;
      model.cells.forEach((c, i) => {
        const r = Math.floor(i / per), k = i % per, x = k * (cw + gx), yy = yCells + r * rowH + dayH;
        pos.push({ x: x + cw / 2, row: r });
        hits.push({ x: x - gx / 2, y: yy - dayH, w: cw + gx, h: rowH, i });
        ctx.font = (c.isToday ? '600 ' : '') + (narrow ? 10 : 11) + 'px ' + MONO; ctx.textAlign = 'center';
        ctx.fillStyle = i === at ? AMBER : (c.isToday ? WHITE : DIM);
        const dayWord = c.isToday && !narrow ? L(model.strings.today) + ' · ' + L(c.dayShort) : L(c.dayShort);
        ctx.fillText(fit(dayWord + ' ' + c.time.slice(8).replace(/^0/, ''), cw + gx - 2), x + cw / 2, yy - dayH / 2);
        rr(x + 0.5, yy + 0.5, cw - 1, ch - 1, 6);
        ctx.fillStyle = 'rgba(125,211,252,' + (c.past ? 0.03 : 0.07) + ')'; ctx.fill();
        ctx.strokeStyle = 'rgba(125,211,252,' + (c.isToday ? 0.6 : 0.24) + ')'; ctx.lineWidth = 1; ctx.stroke();
        // high (big) and low (small)
        ctx.globalAlpha = c.past ? 0.55 : 1;
        let fh = narrow ? 20 : 24, fl = narrow ? 11 : 13, hw, lw;   // shrink the pair until it fits the cell
        const hiS = c.hi + '°', loS = c.lo + '°';
        for (;;) {
          ctx.font = '600 ' + fh + 'px ' + MONO; hw = ctx.measureText(hiS).width;
          ctx.font = fl + 'px ' + MONO; lw = ctx.measureText(loS).width;
          if (hw + 4 + lw <= cw - 8 || fh <= 13) break;
          fh--; if (fl > 9) fl--;
        }
        const x0 = x + (cw - (hw + 4 + lw)) / 2;
        ctx.textAlign = 'left';
        ctx.font = '600 ' + fh + 'px ' + MONO; ctx.fillStyle = WHITE; ctx.fillText(hiS, x0, yy + 20);
        ctx.font = fl + 'px ' + MONO; ctx.fillStyle = CYAN; ctx.fillText(loS, x0 + hw + 4, yy + 20 + (fh - fl) / 4);
        // sky words (up to two lines), rain when the answer has it, wind
        ctx.textAlign = 'center'; ctx.fillStyle = CYAN;
        let ty = yy + 42;
        if (c.sky) {
          let fs = narrow ? 9 : 10; const words = L(c.sky.text).split(' ');
          ctx.font = fs + 'px ' + MONO;
          while (fs > 7 && words.some((q) => ctx.measureText(q).width > cw - 4)) { fs--; ctx.font = fs + 'px ' + MONO; }   // a long word gets smaller letters, not an ellipsis
          wrap(L(c.sky.text), cw - 4, c.rain ? 2 : 3).forEach((s) => { ctx.fillText(s, x + cw / 2, ty); ty += 10; });
        }
        ctx.font = (narrow ? 9 : 10) + 'px ' + MONO;
        if (c.rain) { ctx.fillStyle = WHITE; ctx.fillText(fit(L(model.strings.rain) + ' ' + L(c.rain.text), cw - 4), x + cw / 2, Math.min(ty + 1, yy + ch - 22)); }
        ctx.fillStyle = DIM;
        ctx.fillText(fit(c.wind ? L(c.wind.short) : '–', cw - 6), x + cw / 2, yy + ch - 10);
        ctx.globalAlpha = 1;
        if (i === at) cur = { x, y: yy };
      });
      if (cur) {   // the marker cell glows; the glow settles after each step (still under reduced motion)
        ctx.save(); ctx.shadowColor = AMBER; ctx.shadowBlur = 8 + 12 * (1 - ease); ctx.strokeStyle = AMBER; ctx.lineWidth = 2;
        rr(cur.x + 1, cur.y + 1, cw - 2, ch - 2, 6); ctx.stroke(); ctx.restore();
      }

      // 3. the thin line of highs and lows on the fixed scale of the model
      const y0 = yLine + lineTop, yb = y0 + lineH, px = (i) => (nRows === 1 ? pos[i].x : (i + 0.5) * (w / n)), py = (t) => yb - t * lineH;
      lineBox = { x: 0, y: y0 - 6, w, h: lineH + 12, px };
      ctx.strokeStyle = 'rgba(125,211,252,0.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, yb + 0.5); ctx.lineTo(w, yb + 0.5); ctx.stroke();
      ctx.save(); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(0, y0 + 0.5); ctx.lineTo(w, y0 + 0.5); ctx.stroke(); ctx.restore();
      ctx.font = '9px ' + MONO; ctx.fillStyle = DIM; ctx.textAlign = 'right';
      ctx.fillText(model.scale.max + ' ' + L(model.unit), w, y0 - 7); ctx.fillText(model.scale.min + ' ' + L(model.unit), w, yb + 8);
      ctx.textAlign = 'left'; ctx.fillStyle = WHITE; ctx.fillText('— ' + L(model.strings.high), 0, y0 - 7);
      ctx.fillStyle = DIM; ctx.fillText('┄ ' + L(model.strings.low), ctx.measureText('— ' + L(model.strings.high)).width + 14, y0 - 7);
      const path = (key, col, dash) => {
        ctx.save(); if (dash) ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.beginPath();
        model.cells.forEach((c, i) => { if (i) ctx.lineTo(px(i), py(c[key])); else ctx.moveTo(px(i), py(c[key])); });
        ctx.stroke(); ctx.restore();
        ctx.fillStyle = col; model.cells.forEach((c, i) => { ctx.beginPath(); ctx.arc(px(i), py(c[key]), 2, 0, 6.3); ctx.fill(); });
      };
      path('tLo', 'rgba(125,211,252,0.7)', [4, 3]); path('tHi', WHITE, null);
      const hx = Math.round(px(at)) + 0.5, hc = model.cells[at];
      ctx.strokeStyle = 'rgba(251,191,36,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, y0 - 2); ctx.lineTo(hx, yb + 2); ctx.stroke();
      ctx.save(); ctx.shadowColor = AMBER; ctx.shadowBlur = 8; ctx.fillStyle = AMBER;
      for (const t of [hc.tHi, hc.tLo]) { ctx.beginPath(); ctx.arc(px(at), py(t), 3.5, 0, 6.3); ctx.fill(); }
      ctx.restore();

      // 4. read-out: the sentence of the marker day
      ctx.textAlign = 'left'; ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; ctx.fillStyle = WHITE;
      read.forEach((s, i) => ctx.fillText(s, 0, yb + lineBot + 12 + i * 14));

      // text under the picture (all from the model)
      line(L(model.scale.text));
      for (const l of model.legend) line(L(l));
      line(L(model.note));
    }

    function frame(ts) { raf = 0; if (dead || document.hidden) return; draw(ts); if (pulse0 && ts - pulse0 < PULSE_MS) raf = root.requestAnimationFrame(frame); }
    function redraw(step) {
      if (dead) return;
      if (reduce || !root.requestAnimationFrame) { draw(0); return; }
      if (step) pulse0 = root.performance.now();
      draw(root.performance.now());
      if (step && !raf) raf = root.requestAnimationFrame(frame);
    }
    function go(i) {   // move the marker; true when it moved
      if (!ok()) return false;
      i = clampI(i);
      if (i === at) return false;
      at = i; redraw(true); fire(); return true;
    }
    function seek(i) { if (!ok()) return; if (!go(i)) redraw(false); }
    function update(answer, now) {
      const D = SC.viz.forecastData;
      if (!D) return model;
      const keep = ok() ? model.cells[at].time : null;
      model = D.build(answer, {}, now);
      if (ok()) { const j = keep ? model.cells.findIndex((c) => c.time === keep) : -1; at = j >= 0 ? j : clampI(model.first); }
      else at = 0;
      redraw(false); fire();
      return model;
    }

    const hitAt = (e) => {
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const h = hits.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
      if (h) return h.i;
      if (lineBox && y >= lineBox.y && y < lineBox.y + lineBox.h) {   // on the line: the nearest day
        let best = 0, bd = Infinity;
        model.cells.forEach((c, i) => { const d = Math.abs(lineBox.px(i) - x); if (d < bd) { bd = d; best = i; } });
        return best;
      }
      return null;
    };
    const onMove = (e) => { if (!ok()) return; const i = hitAt(e); cv.style.cursor = i != null ? 'pointer' : 'default'; if (i != null && (e.pointerType === 'mouse' || down)) go(i); };
    const onDown = (e) => { if (!ok()) return; down = true; const i = hitAt(e); if (i != null) go(i); };
    const onUp = () => { down = false; };
    const onClick = (e) => { if (!ok()) return; const i = hitAt(e); if (i != null) { go(i); } else if (opts.onPick) opts.onPick(null); };
    const onKey = (e) => {
      if (!ok() || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowLeft') go(at + (k === 'ArrowRight' ? 1 : -1));
      else if (k === 'Home') go(0);
      else if (k === 'End') go(model.cells.length - 1);
      else return;
      e.preventDefault();
    };
    cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerdown', onDown); root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', onUp);
    cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);

    let lang = SC.lang;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => redraw(false)) : null;
    if (ro) ro.observe(host);
    const onVis = () => { if (!document.hidden) redraw(false); };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(() => { if (SC.lang !== lang && !document.hidden) { lang = SC.lang; redraw(false); } }, 500);
    redraw(false);
    fire();

    return {
      destroy() { dead = true; clearInterval(poll); if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); root.removeEventListener('pointerup', onUp); root.removeEventListener('pointercancel', onUp); host.removeEventListener('keydown', onKey); cv.remove(); txt.remove(); },
      seek, update,
      get index() { return at; },
      get model() { return model; },
    };
  }

  SC.viz.forecast = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
