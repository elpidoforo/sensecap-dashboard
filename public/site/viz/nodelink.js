/* Node-link widget: publishers (left) to stack sheets by band (right). All numbers come from nodelink-data.js. */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {}); SC.viz = SC.viz || {};
  const BG = '#050b16', CYAN = '#7DD3FC', AMBER = '#FBBF24', MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const el = () => (SC.lang === 'el' ? 1 : 0);

  function mount(host, model, opts) {
    opts = opts || {};
    const doc = host.ownerDocument, canvas = doc.createElement('canvas');
    host.setAttribute('role', 'img'); host.setAttribute('aria-label', (model.aria || ['', ''])[el()]);
    host.appendChild(canvas); canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.background = BG; canvas.style.borderRadius = '8px';
    const ctx = canvas.getContext('2d');
    const reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let W = 0, H = 0, dpr = 1, nodes = [], links = [], sel = null, hover = null, raf = 0, t0 = 0, dead = false;

    const maxCount = Math.max(1, ...model.publishers.map((p) => p.count));
    const rad = (c) => 4 + 5 * Math.sqrt(c / maxCount);          // size = number of sheets only

    function layout() {
      const rowS = 21, bandGap = 18, pad = 14;
      const rows = model.sheets.length, nb = model.bands.length;
      const need = pad * 2 + rows * rowS + nb * bandGap;
      H = Math.max(need, model.publishers.length * 24 + pad * 2, 260);
      canvas.style.height = H + 'px'; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const lab = Math.max(84, Math.min(210, Math.floor(W * (W < 520 ? 0.35 : 0.3))));
      const lx = lab + 10, rx = W - lab - 10;
      nodes = []; const byId = {};
      let y = pad;
      for (const b of model.bands) {
        y += bandGap; nodes.push({ type: 'band', id: b.k, label: b.n, x: rx - 12, y: y - 8 });
        for (const s of model.sheets.filter((x) => x.band === b.k)) {
          const nd = { type: 'sheet', id: s.id, label: s.n, x: rx, y: y + rowS / 2 - 4, r: 4, style: s.style, ref: s }; nodes.push(nd); byId['s:' + s.id] = nd; y += rowS;
        }
      }
      const np = model.publishers.length, span = H - pad * 2, step = span / np;
      model.publishers.forEach((p, i) => { const nd = { type: 'publisher', id: p.id, label: p.n, x: lx, y: pad + step * (i + 0.5), r: rad(p.count), ref: p }; nodes.push(nd); byId['p:' + p.id] = nd; });
      links = model.edges.map((e) => ({ a: byId['p:' + e.from], b: byId['s:' + e.to], style: e.style, from: e.from, to: e.to })).filter((l) => l.a && l.b);
    }
    const on = (l) => !sel || (sel.type === 'publisher' ? l.from === sel.id : l.to === sel.id);
    const lit = (n) => !sel || (n.type === 'band') || (sel.type === n.type && sel.id === n.id) || links.some((l) => on(l) && (l.a === n || l.b === n));

    function fit(text, max) { if (ctx.measureText(text).width <= max) return text; let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1); return t.trimEnd() + '…'; }

    function draw(ts) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      const ph = reduce ? 0 : ((ts - t0) / 1000) * 8;
      for (const l of links) {
        const a = l.a, b = l.b, mx = (a.x + b.x) / 2, hot = !!sel && on(l);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
        ctx.strokeStyle = hot ? AMBER : CYAN; ctx.globalAlpha = sel ? (hot ? 0.95 : 0.07) : 0.4; ctx.lineWidth = hot ? 1.6 : 1;
        if (l.style === 'flow') { ctx.setLineDash([6, 6]); ctx.lineDashOffset = -ph; }
        else if (l.style === 'dash') { ctx.setLineDash([5, 4]); ctx.lineDashOffset = 0; }
        else { ctx.setLineDash([]); ctx.lineDashOffset = 0; }
        ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.textBaseline = 'middle';
      const lab = Math.max(84, Math.min(210, Math.floor(W * (W < 520 ? 0.35 : 0.3)))), fs = W < 520 ? 10 : 11;
      ctx.font = fs + 'px ' + MONO;
      for (const n of nodes) {
        if (n.type === 'band') { ctx.globalAlpha = 0.8; ctx.fillStyle = CYAN; ctx.textAlign = 'left'; ctx.font = '600 ' + (fs - 1) + 'px ' + MONO; ctx.fillText(n.label[el()].toUpperCase(), n.x, n.y); ctx.font = fs + 'px ' + MONO; ctx.globalAlpha = 1; continue; }
        const on_ = lit(n), cur = (hover && hover === n) || (sel && sel.type === n.type && sel.id === n.id);
        ctx.globalAlpha = on_ ? 1 : 0.3;
        ctx.save(); ctx.shadowColor = AMBER; ctx.shadowBlur = cur ? 18 : 9; ctx.fillStyle = AMBER;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.fillStyle = cur ? '#fff' : '#cfe3f3';
        if (n.type === 'publisher') { ctx.textAlign = 'right'; ctx.fillText(fit(n.label[el()], lab - 6 - ctx.measureText(' · ' + n.ref.count).width) + ' · ' + n.ref.count, n.x - n.r - 6, n.y); }
        else { ctx.textAlign = 'left'; ctx.fillText(fit(n.label[el()], lab - 6), n.x + n.r + 6, n.y); }
      }
      ctx.globalAlpha = 1;
      if (model.empty) { ctx.fillStyle = '#cfe3f3'; ctx.textAlign = 'center'; ctx.font = '12px ' + MONO; ctx.fillText(model.empty[el()], W / 2, H / 2); }
    }

    function tick(ts) { raf = 0; if (dead) return; draw(ts); schedule(); }
    const animated = () => !reduce && !doc.hidden && !model.empty && links.some((l) => l.style === 'flow');
    function schedule() { if (animated() && !raf) raf = root.requestAnimationFrame(tick); }
    function redraw() { if (raf) { root.cancelAnimationFrame(raf); raf = 0; } draw(root.performance.now()); schedule(); }

    function resize() { W = Math.max(280, host.clientWidth || 600); dpr = Math.min(2, root.devicePixelRatio || 1); layout(); redraw(); }
    function hit(ev) {
      const r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; let best = null, bd = 1e9;
      for (const n of nodes) { if (n.type === 'band') continue; const dy = Math.abs(y - n.y); const inX = n.type === 'publisher' ? x <= n.x + n.r + 6 && x >= 0 : x >= n.x - n.r - 6; if (dy < 10 && inX && dy < bd) { best = n; bd = dy; } }
      return best;
    }
    const pick = (n) => ({ type: n.type, id: n.id });
    canvas.addEventListener('mousemove', (ev) => { const n = hit(ev); if (n !== hover) { hover = n; canvas.style.cursor = n ? 'pointer' : 'default'; redraw(); } });
    canvas.addEventListener('mouseleave', () => { hover = null; redraw(); });
    canvas.addEventListener('click', (ev) => {
      const n = hit(ev);
      if (!n || (sel && sel.type === n.type && sel.id === n.id)) sel = null; else sel = pick(n);
      redraw(); if (opts.onPick) opts.onPick(sel ? { type: sel.type, id: sel.id } : null);
    });
    const onVis = () => { if (!doc.hidden) { redraw(); } else if (raf) { root.cancelAnimationFrame(raf); raf = 0; } };
    doc.addEventListener('visibilitychange', onVis);
    const ro = typeof root.ResizeObserver === 'function' ? new root.ResizeObserver(resize) : null; if (ro) ro.observe(host);
    t0 = root.performance.now(); resize();
    return { destroy() { dead = true; if (raf) root.cancelAnimationFrame(raf); if (ro) ro.disconnect(); doc.removeEventListener('visibilitychange', onVis); if (canvas.parentNode) canvas.parentNode.removeChild(canvas); } };
  }
  SC.viz.nodelink = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
