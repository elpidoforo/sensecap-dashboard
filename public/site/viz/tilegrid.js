/*
  Tile grid widget (canvas 2D). SC.viz.tilegrid.mount(host, model, opts) -> { destroy(), update(model) }
  model comes from SC.viz.tilegridData.build(). All statuses and ages are already in the model; this file only draws.
  opts.onPick(tile|null) on click; opts.onHover(tile|null) on hover (optional).
  Motion: tiles scale gently on hover; tiles with tile.pulse (live and fresh) breathe slowly. Nothing else moves.
*/
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {}); SC.viz = SC.viz || {};
  const BG = '#050b16', CYAN = '#7DD3FC', MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const COL = { fresh: '#5EEAD4', ageing: '#FBBF24', overdue: '#FB923C', unavailable: '#F87171', fixed: '#8DA2C0', unknown: '#C4A1FF' };
  const GAP = 10, MIN_W = 142, MIN_H = 98, MAX_H = 112, HEAD = 26, PAD = 12;

  function mount(host, model, opts) {
    opts = opts || {};
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    cv.style.display = 'block'; cv.style.width = '100%'; cv.style.cursor = 'default'; cv.style.touchAction = 'pan-y';
    const prevOv = host.style.overflowY, prevRole = host.getAttribute('role'), prevAria = host.getAttribute('aria-label');
    host.style.overflowY = 'auto'; host.setAttribute('role', 'img');
    host.appendChild(cv);

    let m = model, W = 0, H = 0, dpr = 1, rects = [], hover = -1, hs = [], raf = 0, destroyed = false, mouse = null;
    const rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const lg = () => (SC.lang === 'el' ? 1 : 0);
    const tx = (p) => (p ? p[lg()] : '');

    function layout() {
      cv.style.display = 'none'; const hostH = host.clientHeight, hostW = host.clientWidth; cv.style.display = 'block';
      const avail = Math.max(120, hostW || 320), inner = avail - 2 * PAD;
      if (opts.compact) { // a strip of small cells: one cell per sheet, the name is in the tooltip and the page read-out
        const g = 4, cols = Math.max(1, Math.floor((inner + g) / (62 + g))), tw = (inner - (cols - 1) * g) / cols, th = 46;
        rects = []; let i = 0;
        for (const b of m.bands) for (const t of b.tiles) { rects.push({ t, b, x: PAD + (i % cols) * (tw + g), y: PAD + Math.floor(i / cols) * (th + g), w: tw, h: th }); i++; }
        layout.heads = [];
        return { w: avail, h: PAD * 2 + Math.ceil(i / cols) * (th + g) - g };
      }
      const cols = Math.max(1, Math.floor((inner + GAP) / (MIN_W + GAP)));
      const tw = (inner - (cols - 1) * GAP) / cols;
      let rows = 0; for (const b of m.bands) rows += Math.ceil(b.tiles.length / cols);
      const nb = m.bands.length;
      let th = MIN_H;
      if (hostH > 0 && rows) th = Math.max(MIN_H, Math.min(MAX_H, (hostH - 2 * PAD - nb * HEAD - rows * GAP) / rows));
      let y = PAD; rects = [];
      const heads = [];
      for (const b of m.bands) {
        heads.push({ y, b }); y += HEAD;
        b.tiles.forEach((t, i) => { rects.push({ t, x: PAD + (i % cols) * (tw + GAP), y: y + Math.floor(i / cols) * (th + GAP), w: tw, h: th }); });
        y += Math.ceil(b.tiles.length / cols) * (th + GAP);
      }
      layout.heads = heads;
      return { w: avail, h: Math.max(y + PAD - GAP, m.total ? 0 : 120, hostH) };
    }

    function size() {
      const L = layout(); W = L.w; H = L.h; dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
      if (hs.length !== rects.length) hs = rects.map(() => 0);
    }

    function wrap(text, maxW, maxLines) {
      const words = String(text).split(/\s+/), out = []; let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (cur && ctx.measureText(t).width > maxW) { out.push(cur); cur = w; } else cur = t;
      }
      if (cur) out.push(cur);
      if (out.length > maxLines) { out.length = maxLines; let l = out[maxLines - 1]; while (l.length > 1 && ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1); out[maxLines - 1] = l + '…'; }
      return out;
    }
    function fit(text, maxW) {
      let s = String(text); if (ctx.measureText(s).width <= maxW) return s;
      while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
      return s + '…';
    }

    function glyph(kind, cx, cy, r, c) {
      ctx.save(); ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath();
      if (kind === 'circle') { ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill(); }
      else if (kind === 'half') { ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill(); }
      else if (kind === 'triangle') { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.85); ctx.lineTo(cx - r, cy + r * 0.85); ctx.closePath(); ctx.fill(); }
      else if (kind === 'cross') { ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); }
      else if (kind === 'square') { ctx.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7); ctx.fill(); }
      else { ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); }
      ctx.restore();
    }

    function draw(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      if (!m.total) {
        ctx.fillStyle = CYAN; ctx.font = '13px ' + MONO; ctx.textBaseline = 'top';
        wrap(tx(m.empty), W - 2 * PAD, 4).forEach((l, i) => ctx.fillText(l, PAD, PAD + i * 18));
        return;
      }
      for (const h of layout.heads) {
        ctx.font = '600 11px ' + MONO; ctx.textBaseline = 'middle'; ctx.fillStyle = CYAN; ctx.globalAlpha = 0.85;
        const label = tx(h.b.n).toUpperCase() + '  ' + h.b.tiles.length;
        ctx.fillText(label, PAD, h.y + 10);
        const lw = ctx.measureText(label).width;
        ctx.globalAlpha = 0.25; ctx.strokeStyle = CYAN; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD + lw + 10, h.y + 10.5); ctx.lineTo(W - PAD, h.y + 10.5); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const order = rects.map((_, i) => i).sort((a, b) => hs[a] - hs[b]);
      for (const i of order) tile(rects[i], hs[i], now);
      if (hover >= 0 && mouse && !opts.compact) tip(rects[hover].t);
    }

    function tile(r, h, now) {
      const t = r.t, c = COL[t.status] || CYAN, s = 1 + 0.045 * h;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (opts.compact) {
        const glow = t.pulse ? (rmq.matches ? 0.5 : 0.5 + 0.5 * Math.sin(now / 1000 * 2 * Math.PI / 5.5)) : 0;
        ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
        ctx.shadowColor = c; ctx.shadowBlur = (t.pulse ? 4 + 10 * glow : 0) + 8 * h;
        ctx.fillStyle = 'rgba(12,22,40,0.96)'; rr(r.x, r.y, r.w, r.h, 3); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = c; ctx.globalAlpha = t.status === 'unavailable' ? 0.16 : t.status === 'fixed' ? 0.2 : 0.3 + 0.1 * glow; rr(r.x, r.y, r.w, r.h, 3); ctx.fill();
        ctx.globalAlpha = 0.6 + 0.4 * h; ctx.strokeStyle = c; ctx.lineWidth = 1 + 0.8 * h; if (t.status === 'unavailable') ctx.setLineDash([3, 3]);
        rr(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 3); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        glyph(t.glyph, cx, r.y + 15, 5, c);
        ctx.font = '600 9px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#C9D8EA';
        ctx.fillText(fit(tx(t.title), r.w - 6), cx, r.y + r.h - 8); ctx.textAlign = 'left';
        ctx.restore(); return;
      }
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
      let glow = 0;
      if (t.pulse) glow = rmq.matches ? 0.5 : 0.5 + 0.5 * Math.sin(now / 1000 * 2 * Math.PI / 5.5);
      ctx.shadowColor = c; ctx.shadowBlur = (t.pulse ? 6 + 14 * glow : 0) + 10 * h;
      ctx.fillStyle = 'rgba(12,22,40,0.96)'; rr(r.x, r.y, r.w, r.h, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = c; ctx.globalAlpha = t.status === 'unavailable' ? 0.1 : t.status === 'fixed' ? 0.14 : 0.2 + 0.08 * glow + 0.06 * h; rr(r.x, r.y, r.w, r.h, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.lineWidth = 1.2 + 0.6 * h; ctx.globalAlpha = 0.55 + 0.45 * h;
      if (t.status === 'unavailable') ctx.setLineDash([4, 3]);
      rr(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 7); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      // text
      const px = r.x + 10, mw = r.w - 20;
      ctx.textBaseline = 'top'; ctx.font = '600 11px ' + MONO; ctx.fillStyle = '#E2ECF8';
      const tl = wrap(tx(t.title), mw - (t.live ? 34 : 0), 2);
      tl.forEach((l, i) => ctx.fillText(l, px, r.y + 8 + i * 13));
      if (t.live) { ctx.font = '600 9px ' + MONO; ctx.fillStyle = CYAN; ctx.textAlign = 'right'; ctx.fillText(lg() ? 'ΖΩΝΤ.' : 'LIVE', r.x + r.w - 9, r.y + 10); ctx.textAlign = 'left'; }
      const sy = r.y + 44;
      glyph(t.glyph, px + 6, sy + 8, 6, c);
      ctx.font = '700 15px ' + MONO;
      let big = 15, lines = wrap(tx(t.statusLabel), mw - 22, 1);
      if (ctx.measureText(lines[0]).width > mw - 22 || lines[0] !== tx(t.statusLabel)) { big = 12; ctx.font = '700 12px ' + MONO; lines = wrap(tx(t.statusLabel), mw - 22, 2); }
      ctx.fillStyle = c;
      lines.forEach((l, i) => ctx.fillText(l, px + 18, sy + (lines.length > 1 ? 0 : 1) + i * (big + 2)));
      ctx.font = '10px ' + MONO; ctx.fillStyle = '#9FB3CC'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(fit(tx(t.line), mw), px, r.y + r.h - 8);
      ctx.restore();
    }
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

    function tip(t) {
      const L = lg(), rows = [];
      rows.push(['700', tx(t.title)]);
      rows.push(['', (L ? 'Κατάσταση: ' : 'Status: ') + tx(t.statusLabel) + (t.ageText ? ' · ' + tx(t.ageText) : '')]);
      if (t.intervalSeconds) rows.push(['', (L ? 'Ανανεώνεται κάθε ' : 'Refreshes every ') + tx(intervalOf(t))]);
      if (t.reason) rows.push(['', (L ? 'Λόγος: ' : 'Reason: ') + tx(t.reason)]);
      rows.push(['', (L ? 'Πηγή: ' : 'Source: ') + (t.source ? tx(t.source) : L ? 'δεν δίνεται' : 'not given')]);
      rows.push(['', (L ? 'Άδεια: ' : 'Licence: ') + (t.licence || (L ? 'δεν δίνεται' : 'not given'))]);
      rows.push(['', (L ? 'Λήψη: ' : 'Retrieved: ') + (t.retrieved || (L ? 'δεν δίνεται' : 'not given'))]);
      const bw = Math.min(W - 16, 320); ctx.font = '11px ' + MONO; ctx.textBaseline = 'top';
      const lines = []; rows.forEach(([w, s]) => wrap(s, bw - 20, 3).forEach((l) => lines.push([w, l])));
      const bh = lines.length * 15 + 16;
      let x = mouse.x + 14, y = mouse.y + 14; if (x + bw > W - 6) x = mouse.x - bw - 14; if (x < 6) x = 6; if (y + bh > H - 6) y = Math.max(6, mouse.y - bh - 10);
      ctx.fillStyle = 'rgba(5,11,22,0.96)'; rr(x, y, bw, bh, 6); ctx.fill(); ctx.strokeStyle = CYAN; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      lines.forEach(([w, l], i) => { ctx.font = (w ? '700 ' : '') + '11px ' + MONO; ctx.fillStyle = w ? '#E2ECF8' : '#B8CAE0'; ctx.fillText(l, x + 10, y + 8 + i * 15); });
    }
    function intervalOf(t) { const s = t.intervalSeconds; return s < 120 ? [s + ' s', s + ' δευτ.'] : s < 7200 ? [Math.round(s / 60) + ' min', Math.round(s / 60) + ' λ.'] : s < 172800 ? [Math.round(s / 3600) + ' h', Math.round(s / 3600) + ' ώ.'] : [Math.round(s / 86400) + ' d', Math.round(s / 86400) + ' ημ.']; }

    // loop: runs only while something moves (a breathing tile, or a hover easing) and the page is visible
    const anyPulse = () => m.tiles.some((t) => t.pulse);
    function frame(ts) {
      raf = 0; if (destroyed || document.hidden) return;
      let moving = false;
      for (let i = 0; i < hs.length; i++) {
        const target = i === hover ? 1 : 0, d = target - hs[i];
        if (Math.abs(d) > 0.01) { hs[i] += d * 0.22; moving = true; } else hs[i] = target;
      }
      draw(ts); schedule(moving);
    }
    let lastPulse = 0;
    function schedule(moving) {
      if (raf || destroyed || document.hidden) return;
      if (rmq.matches) return;
      if (moving) raf = requestAnimationFrame(frame);
      else if (anyPulse()) raf = requestAnimationFrame((ts) => { raf = 0; if (ts - lastPulse < 50) { schedule(false); return; } lastPulse = ts; frame(ts); });
    }
    function redraw() { if (rmq.matches) { hs = hs.map((_, i) => (i === hover ? 1 : 0)); draw(0); } else if (!raf) { raf = requestAnimationFrame(frame); } }

    function pos(e) { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
    function hit(p) { for (let i = 0; i < rects.length; i++) { const r = rects[i]; if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i; } return -1; }
    function onMove(e) {
      mouse = pos(e); const i = hit(mouse);
      if (i !== hover) { hover = i; cv.style.cursor = i >= 0 ? 'pointer' : 'default'; if (opts.onHover) opts.onHover(i >= 0 ? rects[i].t : null); }
      redraw();
    }
    function onLeave() { mouse = null; if (hover !== -1) { hover = -1; if (opts.onHover) opts.onHover(null); } redraw(); }
    function onClick(e) { const i = hit(pos(e)); if (opts.onPick) opts.onPick(i >= 0 ? rects[i].t : null); }
    cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerleave', onLeave); cv.addEventListener('click', onClick);

    function labels() { host.setAttribute('aria-label', tx(m.ariaLabel)); }
    function full() { size(); labels(); draw(performance.now()); schedule(false); }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!destroyed) full(); }) : null;
    if (ro) ro.observe(host);
    const onVis = () => { if (!document.hidden) { draw(performance.now()); schedule(false); } };
    document.addEventListener('visibilitychange', onVis);
    full();

    return {
      destroy() {
        destroyed = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerleave', onLeave); cv.removeEventListener('click', onClick);
        if (cv.parentNode) cv.parentNode.removeChild(cv);
        host.style.overflowY = prevOv;
        if (prevRole == null) host.removeAttribute('role'); else host.setAttribute('role', prevRole);
        if (prevAria == null) host.removeAttribute('aria-label'); else host.setAttribute('aria-label', prevAria);
      },
      update(next) { m = next; hover = -1; hs = []; full(); },
    };
  }
  SC.viz.tilegrid = { mount };
})();
