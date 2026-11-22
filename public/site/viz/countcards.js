/*
  Count cards widget: SC.viz.countcards.mount(host, model, opts) -> handle. The model is built by countcards-data.js.
  A row of small cards (it wraps on narrow screens), one per data sheet, in the order of the model (never sorted): title,
  status, the number of records, a dot matrix (one dot = N records, N written on the card), kind and, for sheets that are
  fetched again, the age of the last fetch. Counts and ages only: nothing here knows a position.
  Motion: the kind dot of a LIVE and available card breathes softly; every other card is still. Nothing moves under
  prefers-reduced-motion or while the tab is hidden.
    opts.onPick({id, title:[en,el], count|null, status:[en,el], available}|null)   hover, click or arrow keys; null for a click on nothing
    opts.onOpen(id)                click on a card, or Enter / Space on the picked card (the page filters its sphere with it)
    opts.openId                    card drawn as the open one at mount
    opts.pick                      id of the card picked at mount (default: none until the reader moves)
  handle = { destroy(), update(model), select(id|null), setOpen(id|null), picked (id|null), openId, model }
  Keyboard (host is focusable): Left / Right one card, Up / Down one row, Home / End, Enter or Space opens.
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', PANEL = '#050b16', DIM = 'rgba(125,211,252,0.62)', WHITE = '#e8f6ff';
  const FRAME_MS = 70, BREATH_MS = 2600;

  function mount(host, model, opts) {
    opts = opts || {};
    const reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let sel = -1, openId = opts.openId || null, raf = 0, last = 0, dead = false, w = 0, cols = 1, hits = [];
    const idx = () => (SC.lang === 'el' ? 1 : 0), L = (p) => (p ? p[idx()] : '');
    const el = (tag, css) => { const e = document.createElement(tag); if (css) e.style.cssText = css; return e; };
    const cards = () => (model && Array.isArray(model.cards) ? model.cards : []);
    const pickOf = (c) => (c ? { id: c.id, title: c.title, count: c.count, status: c.statusLabel, available: c.available } : null);
    if (opts.pick != null) sel = cards().findIndex((c) => c.id === opts.pick);
    host.setAttribute('role', 'img');
    if (!host.hasAttribute('tabindex')) host.setAttribute('tabindex', '0');
    host.style.cssText += ';background:' + PANEL + ';color:' + CYAN + ';font-family:' + MONO + ';padding:10px;box-sizing:border-box;border:1px solid rgba(125,211,252,0.18);border-radius:8px;box-shadow:0 0 24px rgba(125,211,252,0.06)';
    const cv = el('canvas', 'display:block;width:100%;cursor:default'), ctx = cv.getContext('2d');
    const txt = el('div', 'margin-top:8px;font-size:11px;line-height:1.5;color:' + DIM);
    host.append(cv, txt);

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

    function draw(now) {
      if (dead) return;
      host.setAttribute('aria-label', L(model.ariaLabel));
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      w = Math.max(200, Math.floor(host.clientWidth - 22));
      const list = cards(), n = list.length;
      hits = [];
      txt.textContent = '';
      const line = (s, col) => { const p = el('p', 'margin:0 0 4px' + (col ? ';color:' + col : '')); p.textContent = s; txt.append(p); };
      if (!n) { cv.width = 1; cv.height = 1; cv.style.height = '1px'; line(L(model.empty || model.ariaLabel), CYAN); return; }
      const narrow = w < 520, gap = narrow ? 8 : 10;
      cols = Math.max(1, Math.min(n, Math.floor((w + gap) / ((narrow ? 150 : 190) + gap))));
      const cw = (w - gap * (cols - 1)) / cols, chh = 214, rows = Math.ceil(n / cols), hgt = rows * chh + (rows - 1) * gap + 2;
      cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt);
      ctx.textBaseline = 'middle';
      const breath = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(((now || 0) % BREATH_MS) / BREATH_MS * Math.PI * 2);

      list.forEach((c, i) => {
        const x = (i % cols) * (cw + gap), y = Math.floor(i / cols) * (chh + gap) + 1, pad = 10, iw = cw - pad * 2, on = i === sel, open = c.id === openId;
        hits.push({ x, y, w: cw, h: chh, i });
        // the card
        rr(x + 0.5, y + 0.5, cw - 1, chh - 1, 8);
        ctx.fillStyle = c.available ? 'rgba(125,211,252,0.06)' : 'rgba(125,211,252,0.025)'; ctx.fill();
        ctx.save();
        if (on) { ctx.shadowColor = AMBER; ctx.shadowBlur = 10; ctx.strokeStyle = AMBER; ctx.lineWidth = 1.5; }
        else { ctx.strokeStyle = 'rgba(125,211,252,' + (c.available ? 0.32 : 0.22) + ')'; ctx.lineWidth = 1; if (!c.available) ctx.setLineDash([4, 3]); }
        ctx.stroke(); ctx.restore();
        if (open) { ctx.fillStyle = AMBER; rr(x + 8, y + 1, cw - 16, 3, 1.5); ctx.fill(); }

        // kind: live = filled dot (breathes when available), scheduled = ring, fixed = small square. Demo tag on the right.
        const ky = y + 16, kx = x + pad + 4;
        if (c.kindClass === 'live') {
          ctx.save(); if (c.pulse) { ctx.shadowColor = CYAN; ctx.shadowBlur = 4 + 8 * breath; ctx.globalAlpha = 0.7 + 0.3 * breath; }
          ctx.fillStyle = c.pulse ? CYAN : DIM; ctx.beginPath(); ctx.arc(kx, ky, 3.5, 0, 6.3); ctx.fill(); ctx.restore();
        } else if (c.kindClass === 'scheduled') { ctx.strokeStyle = CYAN; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(kx, ky, 3.2, 0, 6.3); ctx.stroke(); }
        else { ctx.fillStyle = DIM; ctx.fillRect(kx - 3, ky - 3, 6, 6); }
        ctx.font = '9px ' + MONO; ctx.textAlign = 'left';
        const kindS = L(c.kindLabel).toUpperCase(), demoS = c.demoLabel ? L(c.demoLabel) : '';
        const demoTop = !!demoS && ctx.measureText(kindS).width + ctx.measureText(demoS).width + 24 <= iw;   // beside the kind when there is room, else above the foot
        if (demoS) { ctx.fillStyle = AMBER; ctx.textAlign = demoTop ? 'right' : 'left'; ctx.fillText(fit(demoS, iw), demoTop ? x + cw - pad : x + pad, demoTop ? ky + 0.5 : y + chh - 24); }
        ctx.textAlign = 'left'; ctx.fillStyle = c.kindClass === 'fixed' ? DIM : CYAN;
        ctx.fillText(fit(kindS, iw - 14), kx + 9, ky + 0.5);

        // title (up to three lines, never cut short on a normal card)
        ctx.font = '600 ' + (narrow ? 11 : 12) + 'px ' + MONO; ctx.fillStyle = WHITE;
        const tl = wrap(L(c.title), iw, 3), dy = tl.length > 2 ? 14 : 0;   // a third title line pushes the rest down
        tl.forEach((s, k) => ctx.fillText(s, x + pad, y + 36 + k * 14));
        // status
        ctx.font = '10px ' + MONO; ctx.fillStyle = c.available ? CYAN : AMBER;
        ctx.fillText(fit((c.available ? '● ' : '○ ') + L(c.statusLabel), iw), x + pad, y + 68 + dy);

        if (c.count != null) {
          // the count, its noun, then the dot matrix and what one dot stands for
          ctx.font = '600 24px ' + MONO; ctx.fillStyle = WHITE; ctx.fillText(L(c.countText), x + pad, y + 92 + dy);
          ctx.font = '9px ' + MONO; ctx.fillStyle = DIM;
          const nounLine = L(c.noun) + (c.extra ? ' · ' + L(c.extra.text) : '');
          wrap(nounLine, iw, 2).forEach((s, k) => ctx.fillText(s, x + pad, y + 110 + dy + k * 10));
          const g = c.grid, step = 7, gy = y + 130 + dy;
          if (g && g.dots) {
            ctx.fillStyle = CYAN;
            for (let d = 0; d < g.dots; d++) { ctx.beginPath(); ctx.arc(x + pad + 2.5 + (d % g.cols) * step, gy + 2.5 + Math.floor(d / g.cols) * step, 2.2, 0, 6.3); ctx.fill(); }
          }
          if (g) { ctx.fillStyle = DIM; wrap(L(g.label), iw, dy && g.rows > 3 ? 2 : 3).forEach((s, k) => ctx.fillText(s, x + pad, gy + Math.max(1, g.rows) * step + 8 + k * 10)); }
        } else if (c.reason) {
          // not available: the answer's own reason, in words
          ctx.font = '10px ' + MONO; ctx.fillStyle = 'rgba(232,246,255,0.82)';
          wrap(L(c.reason), iw, dy ? 6 : 7).forEach((s, k) => ctx.fillText(s, x + pad, y + 88 + dy + k * 12));
        }
        // age of the last fetch (live / scheduled) or the retrieval date (fixed)
        const foot = c.age ? L(c.age.text) : (c.retrieved ? L(c.retrieved) : '');
        if (foot) { ctx.font = '9px ' + MONO; ctx.fillStyle = c.age ? CYAN : DIM; ctx.fillText(fit(foot, iw), x + pad, y + chh - 11); }
      });

      line(L(model.note));
    }

    const moving = () => !reduce && !dead && !document.hidden && cards().some((c) => c.pulse);
    function frame(ts) { raf = 0; if (!moving()) return; if (ts - last >= FRAME_MS) { last = ts; draw(ts); } raf = root.requestAnimationFrame(frame); }
    function redraw() {
      if (dead) return;
      draw(reduce || !root.performance ? 0 : root.performance.now());
      if (moving() && !raf && root.requestAnimationFrame) raf = root.requestAnimationFrame(frame);
    }
    function go(i, quiet) {   // pick a card by index (-1 = none)
      const n = cards().length;
      i = n ? Math.max(-1, Math.min(n - 1, i)) : -1;
      if (i === sel) return false;
      sel = i; redraw();
      if (!quiet && opts.onPick) opts.onPick(pickOf(cards()[sel]) || null);
      return true;
    }
    function open(i) {
      const c = cards()[i]; if (!c) return;
      openId = c.id; redraw();
      if (opts.onOpen) opts.onOpen(c.id);
    }
    function update(next) {
      const keep = sel >= 0 && cards()[sel] ? cards()[sel].id : null;
      model = next || model;
      sel = keep ? cards().findIndex((c) => c.id === keep) : -1;
      if (openId && !cards().some((c) => c.id === openId)) openId = null;
      redraw();
    }

    const hitAt = (e) => {
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const h = hits.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
      return h ? h.i : -1;
    };
    const onMove = (e) => { const i = hitAt(e); cv.style.cursor = i >= 0 ? 'pointer' : 'default'; if (i >= 0) go(i); };
    const onClick = (e) => {
      const i = hitAt(e);
      if (i < 0) { if (opts.onPick) opts.onPick(null); return; }
      if (!go(i) && opts.onPick) opts.onPick(pickOf(cards()[i]));
      open(i);
    };
    const onKey = (e) => {
      const n = cards().length; if (!n || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key, cur = sel < 0 ? -1 : sel;
      if (k === 'ArrowRight') go(Math.min(n - 1, cur + 1));
      else if (k === 'ArrowLeft') go(Math.max(0, cur - 1));
      else if (k === 'ArrowDown') go(cur < 0 ? 0 : (cur + cols < n ? cur + cols : cur));
      else if (k === 'ArrowUp') go(cur < 0 ? 0 : (cur - cols >= 0 ? cur - cols : cur));
      else if (k === 'Home') go(0);
      else if (k === 'End') go(n - 1);
      else if (k === 'Enter' || k === ' ' || k === 'Spacebar') { if (sel >= 0) open(sel); }
      else return;
      e.preventDefault();
    };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);

    let lang = SC.lang;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => redraw()) : null;
    if (ro) ro.observe(host);
    const onVis = () => { if (!document.hidden) redraw(); };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(() => { if (SC.lang !== lang && !document.hidden) { lang = SC.lang; redraw(); } }, 500);
    redraw();

    return {
      destroy() { dead = true; clearInterval(poll); if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); host.removeEventListener('keydown', onKey); cv.remove(); txt.remove(); },
      update,
      select(id) { go(id == null ? -1 : cards().findIndex((c) => c.id === id), true); },
      setOpen(id) { openId = id != null && cards().some((c) => c.id === id) ? id : null; redraw(); },
      get picked() { return sel >= 0 && cards()[sel] ? cards()[sel].id : null; },
      get openId() { return openId; },
      get model() { return model; },
    };
  }

  SC.viz.countcards = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
