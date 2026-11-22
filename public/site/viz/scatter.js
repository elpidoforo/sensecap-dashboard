/*
  Scatter widget: the earthquake dot cloud on one canvas (2D, no libraries). All numbers and positions come from the model built
  by scatter-data.js; this file only multiplies fractions by pixels and draws. One glowing dot per listed event. Two views,
  switched with the two tabs drawn on the canvas, the V key, or handle.set({view}):
    'magnitude' time across, magnitude up, with the catalogue's lower limit as a dashed line and a hatched "not listed" zone;
    'depth'     time across, depth downward from the surface, dot size by magnitude.
  Nothing joins the dots: no line, no average, no fitted curve. The dots are still data and never move; the only motion is one
  fade-in on mount (none under prefers-reduced-motion, paused while the tab is hidden).
  Hover or click the nearest dot (generous radius): ring + crosshair + a small card, and opts.onPick(item) fires; leaving or
  clicking empty space fires opts.onPick(null) unless a clicked dot is still selected. Keyboard (host is focusable): Left/Right
  (Home/End) walk the events in time order, Enter or Space fires onPick, Escape clears, V changes the view.
  SC.viz.scatter = { mount(host, model, opts) } -> { destroy(), set({view, selected}), get() }
    opts: { view:'magnitude'|'depth', onPick(item|null), onView(view) }
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {}); SC.viz = SC.viz || {};
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', INK = '#E2EEF9', DIM = '#8ea2b7', LINE = 'rgba(125,211,252,0.35)', GRID = 'rgba(125,211,252,0.10)', BG = '#050b16';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const FADE_MS = 700, HIT = 30, HIT_TOUCH = 40;

  function mount(host, model, opts) {
    opts = opts || {};
    const doc = host.ownerDocument, win = doc.defaultView || root;
    const L = () => (SC.lang === 'el' ? 1 : 0), tx = (pair) => (Array.isArray(pair) ? pair[L()] : String(pair == null ? '' : pair));
    const canvas = doc.createElement('canvas');
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.touchAction = 'pan-y';
    host.appendChild(canvas);
    const hadTab = host.hasAttribute('tabindex'), oldTab = host.getAttribute('tabindex');
    host.setAttribute('role', 'img'); if (!hadTab) host.tabIndex = 0;
    const ctx = canvas.getContext('2d');
    const reduce = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const pts = model.points || [], views = model.views || [];
    const okView = (v) => views.some((x) => x.k === v);
    let view = okView(opts.view) ? opts.view : okView(model.view) ? model.view : 'magnitude';
    let W = 0, H = 0, dpr = 1, hover = -1, sel = -1, focused = false, progress = reduce ? 1 : 0, raf = 0, t0 = 0, dead = false, geo = null;

    const viewDef = () => views.find((v) => v.k === view) || { k: view, label: '', yTitle: '', aria: model.aria };
    const setAria = () => {
      const cur = hover >= 0 ? hover : sel;
      host.setAttribute('aria-label', (cur >= 0 && pts[cur] ? tx(pts[cur].label) + '. ' : '') + tx(viewDef().aria || model.ariaLabel || model.aria));
    };
    const yFrac = (p) => (view === 'depth' ? p.yDepth : p.yMag);
    const shown = (p) => yFrac(p) !== null && yFrac(p) !== undefined;

    function wrap(text, maxW) {
      const words = String(text).split(/\s+/), lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur); return lines;
    }

    // everything that depends on width, language and view; called before the canvas is sized, so the height fits the text
    function layout() {
      const narrow = W < 520, padL = narrow ? 36 : 46, padR = narrow ? 12 : 18;
      ctx.font = '11px ' + MONO;
      const tabs = []; let tw = 0;
      for (const v of views) { const w = Math.ceil(ctx.measureText(tx(v.label)).width) + 22; tabs.push({ k: v.k, w, label: tx(v.label) }); tw += w; }
      ctx.font = 'bold 12px ' + MONO;
      const titleLines = wrap(tx(model.n), narrow ? W - 20 : W - tw - 34);
      let y = 12 + titleLines.length * 16;
      const tabH = 26; let tabY, tabX;
      if (narrow) { tabY = y + 2; tabX = 10; y = tabY + tabH + 8; } else { tabY = 8; tabX = W - 10 - tw; y = Math.max(y, tabY + tabH) + 8; }
      let cx = tabX; for (const t of tabs) { t.x = cx; t.y = tabY; t.h = tabH; cx += t.w; }
      if (model.empty) { geo = { narrow, tabs: [], titleLines, empty: true, H: Math.max(200, y + 120) }; return; }
      ctx.font = '10px ' + MONO;
      const yTitleLines = wrap(tx(viewDef().yTitle), W - 20), yTitleY = y;
      y += yTitleLines.length * 13 + 6;
      const plotH = narrow ? 230 : Math.round(Math.max(210, Math.min(300, W * 0.3)));
      const y0 = y, y1 = y + plotH, x0 = padL, x1 = W - padR, inset = 10;
      y = y1 + 22;
      const foot = [];
      const s = model.strings || {};
      const add = (text, color) => { if (text) wrap(text, W - 20).forEach((l) => foot.push({ l, color })); };
      if (view === 'depth') add('● ' + tx(s.sizeKey), CYAN);
      add(tx(s.countLine) + '. ' + tx(s.caption), DIM);
      if (s.sourceLine) add(tx(s.sourceLine), DIM);
      const footY = y + 16;
      geo = { narrow, tabs, titleLines, yTitleLines, yTitleY, x0, x1, y0, y1, inset, foot, footY, H: footY + foot.length * 13 + 10,
        px: (p) => x0 + inset + p.x * (x1 - x0 - 2 * inset),
        py: (p) => (view === 'depth' ? y0 + inset + p.yDepth * (y1 - y0 - 2 * inset) : y1 - inset - p.yMag * (y1 - y0 - 2 * inset)),
        ax: (at) => x0 + inset + at * (x1 - x0 - 2 * inset),
        ay: (at) => (view === 'depth' ? y0 + inset + at * (y1 - y0 - 2 * inset) : y1 - inset - at * (y1 - y0 - 2 * inset)),
        rad: (p) => (view === 'depth' ? (p.size === null ? 3.5 : (narrow ? 3.5 : 4) + p.size * (narrow ? 8 : 10)) : narrow ? 4.5 : 5) };
    }

    function drawTabs() {
      ctx.font = '11px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const t of geo.tabs) {
        const on = t.k === view;
        ctx.fillStyle = on ? 'rgba(125,211,252,0.16)' : 'rgba(125,211,252,0.03)'; ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.strokeStyle = on ? CYAN : LINE; ctx.lineWidth = 1; ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
        if (on) { ctx.fillStyle = CYAN; ctx.fillRect(t.x, t.y + t.h - 2, t.w, 2); }
        ctx.fillStyle = on ? INK : DIM; ctx.fillText(t.label, t.x + t.w / 2, t.y + t.h / 2);
      }
    }

    function draw() {
      if (dead || !W || !geo) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      const g = geo;
      ctx.font = 'bold 12px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = INK;
      g.titleLines.forEach((l, k) => ctx.fillText(l, 10, 10 + k * 16));
      if (g.empty) {
        ctx.fillStyle = DIM; ctx.font = '13px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const ls = wrap(tx(model.empty), W - 40); ls.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + 10 + (i - (ls.length - 1) / 2) * 18));
        frame(); return;
      }
      drawTabs();
      ctx.font = '10px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = CYAN;
      g.yTitleLines.forEach((l, k) => ctx.fillText(l, 10, g.yTitleY + k * 13));

      // plot frame and grid, from the model's ticks
      const ax = model.axes, yT = (view === 'depth' ? ax.depth : ax.magnitude).ticks || [];
      ctx.lineWidth = 1; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const t of yT) {
        const y = Math.round(g.ay(t.at)) + 0.5;
        ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
        ctx.fillStyle = DIM; ctx.fillText(tx(t.label), g.x0 - 6, y);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      let lastX = -99; const gap = g.narrow ? 40 : 34;
      for (const t of ax.time.ticks || []) {
        const x = Math.round(g.ax(t.at)) + 0.5;
        ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1 + 3); ctx.stroke();
        const w = ctx.measureText(tx(t.label)).width;
        if (x - lastX >= Math.max(gap, w + 8) && x - w / 2 >= 2 && x + w / 2 <= W - 2) { ctx.fillStyle = DIM; ctx.fillText(tx(t.label), x, g.y1 + 6); lastX = x; }
      }
      ctx.strokeStyle = LINE; ctx.strokeRect(g.x0 + 0.5, g.y0 + 0.5, g.x1 - g.x0 - 1, g.y1 - g.y0 - 1);
      ctx.textAlign = 'right'; ctx.fillStyle = DIM; ctx.fillText(tx(ax.time.title) + ' →', g.x1, g.y1 + 20);

      // the catalogue's lower limit: dashed amber line, hatched zone below it, its sentence written on it
      if (view === 'magnitude' && model.floor) {
        const fy = Math.round(g.ay(model.floor.at)) + 0.5;
        ctx.save(); ctx.beginPath(); ctx.rect(g.x0 + 1, fy, g.x1 - g.x0 - 2, g.y1 - fy - 1); ctx.clip();
        ctx.fillStyle = 'rgba(251,191,36,0.05)'; ctx.fillRect(g.x0, fy, g.x1 - g.x0, g.y1 - fy);
        ctx.strokeStyle = 'rgba(251,191,36,0.16)'; ctx.beginPath();
        for (let x = g.x0 - (g.y1 - fy); x < g.x1; x += 9) { ctx.moveTo(x, g.y1); ctx.lineTo(x + (g.y1 - fy), fy); }
        ctx.stroke(); ctx.restore();
        ctx.strokeStyle = AMBER; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(g.x0, fy); ctx.lineTo(g.x1, fy); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '10px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = AMBER;
        const ls = wrap(tx(model.floor.label), g.x1 - g.x0 - 14), room = Math.max(1, Math.floor((g.y1 - fy - 6) / 12));
        ls.slice(0, room).forEach((l, k) => {
          const w = ctx.measureText(l).width; ctx.fillStyle = 'rgba(5,11,22,0.85)'; ctx.fillRect(g.x0 + 5, fy + 4 + k * 12, w + 6, 12);
          ctx.fillStyle = AMBER; ctx.fillText(l, g.x0 + 8, fy + 5 + k * 12);
        });
      }

      // the dots: still data, one per event
      const cur = hover >= 0 ? hover : sel;
      let any = false;
      ctx.save(); ctx.globalAlpha = progress;
      for (const p of pts) {
        if (!shown(p)) continue; any = true;
        const x = g.px(p), y = g.py(p), r = g.rad(p);
        ctx.shadowColor = CYAN; ctx.shadowBlur = 12;
        if (view === 'depth' && p.size === null) { ctx.strokeStyle = CYAN; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); continue; }
        ctx.fillStyle = view === 'depth' ? 'rgba(125,211,252,0.30)' : 'rgba(125,211,252,0.55)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = CYAN; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#eafaff'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore(); ctx.shadowBlur = 0; ctx.lineWidth = 1;
      if (!any) {
        ctx.fillStyle = DIM; ctx.font = '12px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const ls = wrap(tx((model.strings || {}).noDots), g.x1 - g.x0 - 30); ls.forEach((l, i) => ctx.fillText(l, (g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2 + (i - (ls.length - 1) / 2) * 16));
      }

      ctx.font = '10px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      g.foot.forEach((f, k) => { ctx.fillStyle = f.color; ctx.fillText(f.l, 10, g.footY + k * 13); });

      if (cur >= 0 && pts[cur] && shown(pts[cur])) highlight(pts[cur]);
      frame();
    }

    // keyboard focus is shown on the canvas itself, so it does not depend on page CSS
    function frame() { if (focused) { ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2); ctx.lineWidth = 1; } }

    function highlight(p) {
      const g = geo, x = g.px(p), y = g.py(p), r = g.rad(p);
      ctx.strokeStyle = 'rgba(251,191,36,0.55)'; ctx.setLineDash([3, 3]); ctx.beginPath();
      ctx.moveTo(g.x0, Math.round(y) + 0.5); ctx.lineTo(g.x1, Math.round(y) + 0.5); ctx.moveTo(Math.round(x) + 0.5, g.y0); ctx.lineTo(Math.round(x) + 0.5, g.y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = AMBER; ctx.lineWidth = 2; ctx.shadowColor = AMBER; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; ctx.lineWidth = 1;
      const s = (model.strings || {}).tip || {}, none = tx(s.none);
      ctx.font = '11px ' + MONO;
      const maxW = Math.min(300, W - 24);
      const lines = [{ l: tx(p.date), c: INK }];
      if (p.place) wrap(p.place, maxW - 14).forEach((l) => lines.push({ l, c: INK }));
      lines.push({ l: tx(s.magnitude) + ': ' + (p.magText ? tx(p.magText) : none), c: view === 'magnitude' ? AMBER : DIM });
      lines.push({ l: tx(s.depth) + ': ' + (p.depthText ? tx(p.depthText) : none), c: view === 'depth' ? AMBER : DIM });
      const w = Math.min(maxW, Math.max(...lines.map((o) => ctx.measureText(o.l).width)) + 14), h = lines.length * 15 + 8;
      let bx = x + r + 12; if (bx + w > W - 4) bx = x - r - 12 - w; if (bx < 4) bx = Math.max(4, Math.min(W - w - 4, x - w / 2));
      let by = y - h - r - 10; if (by < g.y0 + 2) by = y + r + 10; if (by + h > H - 4) by = H - h - 4;
      ctx.fillStyle = 'rgba(5,11,22,0.95)'; ctx.fillRect(bx, by, w, h); ctx.strokeStyle = AMBER; ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((o, k) => { ctx.fillStyle = o.c; ctx.fillText(o.l, bx + 7, by + 5 + k * 15); });
    }

    function size() {
      if (dead) return;
      const r = host.getBoundingClientRect(); const w = Math.max(240, Math.round(r.width || host.clientWidth || 600));
      dpr = Math.min(2, win.devicePixelRatio || 1); W = w;
      layout(); H = geo.H;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px';
      draw();
    }

    function tick(now) {
      raf = 0; if (dead || doc.hidden) return; // resumes from the visibilitychange handler
      if (!t0) t0 = now - progress * FADE_MS;
      progress = Math.min(1, (now - t0) / FADE_MS); draw();
      if (progress < 1) raf = win.requestAnimationFrame(tick);
    }
    function start() { if (!raf && progress < 1 && !dead && !model.empty) raf = win.requestAnimationFrame(tick); }

    const pickOf = (i) => { const p = pts[i]; return { id: p.id, time: p.time, place: p.place, magnitude: p.magnitude, magnitudeType: p.magnitudeType, depthKm: p.depthKm, url: p.url, label: p.label }; };
    const fire = (i) => { if (opts.onPick) opts.onPick(i >= 0 && pts[i] ? pickOf(i) : null); };
    const pos = (ev) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    const tabAt = (q) => (geo && geo.tabs ? geo.tabs.find((t) => q.x >= t.x && q.x <= t.x + t.w && q.y >= t.y - 3 && q.y <= t.y + t.h + 3) : null);
    // nearest drawn dot within a generous radius; on a tie in distance the later event wins (it is drawn on top)
    function nearest(q, touch) {
      if (!geo || geo.empty) return -1;
      let best = -1, bd = Infinity;
      for (const p of pts) { if (!shown(p)) continue; const d = Math.hypot(geo.px(p) - q.x, geo.py(p) - q.y) - geo.rad(p); if (d <= bd) { bd = d; best = p.i; } }
      return bd <= (touch ? HIT_TOUCH : HIT) ? best : -1;
    }
    function setView(v, tell) {
      if (!okView(v) || v === view) return;
      view = v; hover = -1; if (sel >= 0 && !shown(pts[sel])) sel = -1;
      size(); setAria(); if (tell && opts.onView) opts.onView(view);
    }
    const onMove = (ev) => {
      if (model.empty || ev.pointerType === 'touch') return;
      const q = pos(ev); canvas.style.cursor = tabAt(q) ? 'pointer' : '';
      const i = tabAt(q) ? -1 : nearest(q, false);
      if (i >= 0) canvas.style.cursor = 'pointer';
      if (i !== hover) { hover = i; draw(); setAria(); fire(i >= 0 ? i : sel); }
    };
    const onLeave = () => { if (hover !== -1) { hover = -1; draw(); setAria(); fire(sel); } };
    const onClick = (ev) => {
      if (model.empty) return;
      const q = pos(ev), t = tabAt(q);
      if (t) { setView(t.k, true); return; }
      const i = nearest(q, true);
      sel = i; hover = -1; draw(); setAria(); fire(i);
    };
    const order = () => pts.filter(shown).map((p) => p.i); // already in time order
    const onKey = (ev) => {
      if (model.empty || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const k = ev.key, ids = order(), at = ids.indexOf(sel);
      let done = true;
      if (k === 'ArrowRight') { if (ids.length) sel = ids[at < 0 ? 0 : Math.min(ids.length - 1, at + 1)]; }
      else if (k === 'ArrowLeft') { if (ids.length) sel = ids[at < 0 ? ids.length - 1 : Math.max(0, at - 1)]; }
      else if (k === 'Home') { if (ids.length) sel = ids[0]; }
      else if (k === 'End') { if (ids.length) sel = ids[ids.length - 1]; }
      else if (k === 'Enter' || k === ' ') { if (sel >= 0) fire(sel); else done = false; }
      else if (k === 'Escape') { if (sel >= 0) { sel = -1; fire(-1); } else done = false; }
      else if (k === 'v' || k === 'V') { const n = views.findIndex((v) => v.k === view); setView(views[(n + 1) % views.length].k, true); }
      else done = false;
      if (done) { ev.preventDefault(); hover = -1; draw(); setAria(); }
    };
    const onFocus = () => { focused = true; draw(); }, onBlur = () => { focused = false; draw(); };
    const onVis = () => { if (!doc.hidden) { draw(); start(); } };
    canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('click', onClick);
    host.addEventListener('keydown', onKey); host.addEventListener('focus', onFocus); host.addEventListener('blur', onBlur);
    doc.addEventListener('visibilitychange', onVis);
    let ro = null; if (win.ResizeObserver) { ro = new win.ResizeObserver(() => size()); ro.observe(host); } else win.addEventListener('resize', size);
    setAria(); size(); start();

    return {
      // set({view}) switches the view; set({selected: id|null}) highlights an event by id; set() or set({}) redraws (after a language change)
      set(next) {
        if (dead) return;
        next = next || {};
        if ('selected' in next) { const p = pts.find((x) => x.id === next.selected); sel = p && (shown(p) || (next.view && okView(next.view))) ? p.i : -1; }
        if (next.view && okView(next.view) && next.view !== view) setView(next.view, false);
        else { if (sel >= 0 && !shown(pts[sel])) sel = -1; size(); setAria(); }
      },
      get() { return { view, selected: sel >= 0 ? pts[sel].id : null }; },
      destroy() {
        dead = true; if (raf) win.cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else win.removeEventListener('resize', size);
        doc.removeEventListener('visibilitychange', onVis);
        canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('click', onClick);
        host.removeEventListener('keydown', onKey); host.removeEventListener('focus', onFocus); host.removeEventListener('blur', onBlur);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        host.removeAttribute('role'); host.removeAttribute('aria-label');
        if (!hadTab) host.removeAttribute('tabindex'); else host.setAttribute('tabindex', oldTab);
      },
    };
  }

  SC.viz.scatter = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
