/*
  Wave widget: mirrored year-on-year area chart on one canvas (2D, no libraries). All numbers come from the model built by
  wave-data.js; this file only draws. Teal above the centre line = more permits than a year before, amber below = fewer, with an
  arrow glyph in the legend so colour is not the only signal. Gaps are drawn as gaps. The reveal (left to right, once, on mount) is
  a scripted entrance, not data moving; afterwards the picture is still. Hover or click reports a month through opts.onPick.
  SC.viz.wave = { mount(host, model, opts) } -> { destroy() }
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {}); SC.viz = SC.viz || {};
  const UP = '#5EEAD4', DOWN = '#FBBF24', INK = '#E2EEF9', DIM = '#7f93a8', LINE = 'rgba(125,211,252,0.35)', BG = '#050b16', BAND = 'rgba(125,211,252,0.10)';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const REVEAL_MS = 1600;

  function mount(host, model, opts) {
    opts = opts || {};
    const doc = host.ownerDocument, win = doc.defaultView || root;
    const L = () => (SC.lang === 'el' ? 1 : 0), tx = (pair) => (Array.isArray(pair) ? pair[L()] : String(pair));
    const canvas = doc.createElement('canvas');
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.touchAction = 'pan-y';
    host.appendChild(canvas);
    host.setAttribute('role', 'img');
    const setAria = () => host.setAttribute('aria-label', tx(model.aria));
    setAria();
    const ctx = canvas.getContext('2d');
    const reduce = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);

    let W = 0, H = 0, dpr = 1, hover = -1, progress = reduce ? 1 : 0, raf = 0, t0 = 0, dead = false, geo = null;
    const pts = model.points || [];

    function layout() {
      const narrow = W < 520;
      const padL = narrow ? 34 : 52, padR = narrow ? 8 : 16, padT = narrow ? 58 : 46, padB = 26;
      let maxAbs = 0; for (const p of pts) if (!p.gap) maxAbs = Math.max(maxAbs, Math.abs(p.change));
      maxAbs = maxAbs || 1;
      const step = Math.pow(10, Math.floor(Math.log10(maxAbs))), nice = [1, 2, 5, 10].map((k) => k * step).find((v) => v >= maxAbs) || maxAbs;
      let cap = [];
      if (model.band) { ctx.font = '10px ' + MONO; cap = wrap(model.band.label[L()] + ' ' + tx(model.band.text) + ' ' + tx(model.band.span), W - 16); }
      const capH = cap.length ? cap.length * 12 + 10 : 0;
      const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB - capH, cy = (y0 + y1) / 2, n = Math.max(1, pts.length - 1);
      geo = { cap, capH, narrow, padL, padR, padT, padB, x0, x1, y0, y1, cy, nice, xOf: (i) => x0 + ((x1 - x0) * i) / n, yOf: (v) => cy - (v / nice) * ((y1 - y0) / 2) };
    }

    function wrap(text, maxW) {
      const words = String(text).split(/\s+/), lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur); return lines;
    }

    function legend() {
      ctx.font = '11px ' + MONO; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const items = [[UP, tx(model.legend.up)], [DOWN, tx(model.legend.down)], [DIM, tx(model.legend.gap)]];
      let x = geo.padL, y = 10;
      for (const [c, t] of items) {
        const w = ctx.measureText(t).width + (c === DIM ? 0 : 0);
        if (x + w > W - 8 && x > geo.padL) { x = geo.padL; y += 15; }
        ctx.fillStyle = c; ctx.fillText(t, x, y); x += w + 18;
      }
    }

    function draw() {
      if (dead || !W) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      layout();
      if (model.empty) {
        ctx.fillStyle = DIM; ctx.font = '13px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const ls = wrap(tx(model.empty), W - 40); ls.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (ls.length - 1) / 2) * 18)); return;
      }
      legend();
      const g = geo;
      // annotation band (drawn under the data), labelled with the answer's own text
      if (model.band) {
        const b = model.band, bx0 = g.xOf(b.from) - (g.x1 - g.x0) / Math.max(1, pts.length - 1) / 2, bx1 = g.xOf(b.to) + (g.x1 - g.x0) / Math.max(1, pts.length - 1) / 2;
        const xa = Math.max(g.x0, bx0), xb = Math.min(g.x1, bx1);
        ctx.fillStyle = BAND; ctx.fillRect(xa, g.y0, xb - xa, g.y1 - g.y0);
        ctx.strokeStyle = 'rgba(125,211,252,0.7)'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(xa, g.y0); ctx.lineTo(xa, g.y1); ctx.stroke(); ctx.setLineDash([]);
      }
      // grid: centre line and +- nice
      ctx.font = '10px ' + MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const v of [g.nice, g.nice / 2, 0, -g.nice / 2, -g.nice]) {
        const y = g.yOf(v); ctx.strokeStyle = v === 0 ? LINE : 'rgba(125,211,252,0.10)'; ctx.lineWidth = v === 0 ? 1.2 : 1;
        ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
        ctx.fillStyle = DIM; ctx.fillText((v > 0 ? '+' : '') + (Number.isInteger(v) ? v : v.toFixed(1)), g.x0 - 5, y);
      }
      ctx.lineWidth = 1;
      // x labels: January of each year (or every second on narrow screens)
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = DIM;
      let lastX = -99;
      pts.forEach((p, i) => { if (p.m.slice(5) === '01') { const x = g.xOf(i); if (x - lastX > (g.narrow ? 44 : 34) && x > g.x0 + 8 && x < g.x1 - 8) { ctx.fillText(p.m.slice(0, 4), x, g.y1 + 6); lastX = x; } } });

      // data, clipped by the reveal
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, g.x0 + (W - g.x0) * progress, H); ctx.clip();
      let i = 0;
      while (i < pts.length) {
        if (pts[i].gap) { i++; continue; }
        let j = i; while (j + 1 < pts.length && !pts[j + 1].gap) j++;
        area(i, j, true); area(i, j, false); outline(i, j);
        i = j + 1;
      }
      // single isolated months have no area: draw a small tick so they are not lost
      pts.forEach((p, k) => { if (!p.gap && (k === 0 || pts[k - 1].gap) && (k === pts.length - 1 || pts[k + 1].gap)) { ctx.fillStyle = p.change >= 0 ? UP : DOWN; const x = g.xOf(k); ctx.fillRect(x - 1, Math.min(g.cy, g.yOf(p.change)), 2, Math.abs(g.yOf(p.change) - g.cy) || 1); } });
      // flags at turning points
      for (const t of model.turns || []) {
        const p = pts[t.i], x = g.xOf(t.i), y = g.yOf(p.change), c = t.kind === 'peak' ? UP : DOWN, dir = t.kind === 'peak' ? -1 : 1;
        ctx.strokeStyle = c; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + dir * 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + dir * 12); ctx.lineTo(x + 7, y + dir * 9); ctx.lineTo(x, y + dir * 6); ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // band tag on top of the band, and the answer's full text as a caption under the axis
      if (model.band) {
        const step = (g.x1 - g.x0) / Math.max(1, pts.length - 1), xa = Math.max(g.x0, g.xOf(model.band.from) - step / 2);
        ctx.font = '10px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#9fdcf7';
        ctx.fillText(model.band.label[L()], xa + 4, g.y0 + 3);
        g.cap.forEach((l, k) => ctx.fillText(l, 8, g.y1 + 24 + k * 12));
      }
      if (hover >= 0) tooltip();
    }

    function area(i, j, up) {
      const g = geo; if (i === j) return;
      ctx.beginPath(); ctx.moveTo(g.xOf(i), g.cy);
      for (let k = i; k <= j; k++) { const c = pts[k].change, v = up ? Math.max(0, c) : Math.min(0, c); ctx.lineTo(g.xOf(k), g.yOf(v)); }
      ctx.lineTo(g.xOf(j), g.cy); ctx.closePath();
      const grad = ctx.createLinearGradient(0, g.cy, 0, up ? g.y0 : g.y1);
      grad.addColorStop(0, up ? 'rgba(94,234,212,0.08)' : 'rgba(251,191,36,0.08)'); grad.addColorStop(1, up ? 'rgba(94,234,212,0.55)' : 'rgba(251,191,36,0.55)');
      ctx.fillStyle = grad; ctx.fill();
      ctx.lineWidth = 1;
    }

    // outline of the change, coloured by sign, split where it crosses the centre line
    function outline(i, j) {
      const g = geo; ctx.lineWidth = 1.4;
      for (let k = i; k < j; k++) {
        const c0 = pts[k].change, c1 = pts[k + 1].change, x0 = g.xOf(k), x1 = g.xOf(k + 1);
        const seg = (xa, ya, xb, yb, c) => { ctx.strokeStyle = c > 0 ? UP : DOWN; ctx.beginPath(); ctx.moveTo(xa, g.yOf(ya)); ctx.lineTo(xb, g.yOf(yb)); ctx.stroke(); };
        if (c0 * c1 < 0) { const t = c0 / (c0 - c1), xm = x0 + (x1 - x0) * t; seg(x0, c0, xm, 0, c0); seg(xm, 0, x1, c1, c1); }
        else if (c0 === 0 && c1 === 0) continue;
        else seg(x0, c0, x1, c1, c0 !== 0 ? c0 : c1);
      }
      ctx.lineWidth = 1;
    }

    function tooltip() {
      const g = geo, p = pts[hover], x = g.xOf(hover);
      ctx.strokeStyle = 'rgba(226,238,249,0.5)'; ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); ctx.stroke();
      const el = L() === 1, lines = [p.label[L()]];
      if (p.gap) lines.push(el ? 'Κενό: δεν γίνεται σύγκριση' : 'Gap: no comparison possible', p.v === null ? (el ? 'Τιμή: καμία (N.A.)' : 'Value: none (N.A.)') : (el ? 'Τιμή: ' : 'Value: ') + p.v);
      else lines.push((el ? 'Τιμή: ' : 'Value: ') + p.v, (el ? 'Ίδιος μήνας πέρσι (' : 'Year earlier (') + (SC.viz.waveData ? SC.viz.waveData.monthLabel(p.prevM)[L()] : p.prevM) + '): ' + p.prev, (el ? 'Μεταβολή: ' : 'Change: ') + (p.change > 0 ? '▲ +' : p.change < 0 ? '▼ ' : '') + p.change);
      ctx.font = '11px ' + MONO; const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, h = lines.length * 15 + 8;
      let bx = x + 12; if (bx + w > W - 4) bx = x - 12 - w; bx = Math.max(4, bx);
      const by = Math.max(4, Math.min(g.cy - h / 2, H - h - 4));
      ctx.fillStyle = 'rgba(5,11,22,0.94)'; ctx.strokeStyle = LINE; ctx.fillRect(bx, by, w, h); ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; lines.forEach((l, k) => ctx.fillText(l, bx + 7, by + 5 + k * 15));
    }

    function size() {
      const r = host.getBoundingClientRect(); const w = Math.max(240, Math.round(r.width || host.clientWidth || 600));
      const h = w < 520 ? Math.round(Math.max(300, w * 0.95)) : Math.round(Math.max(260, Math.min(420, w * 0.42)));
      dpr = Math.min(2, win.devicePixelRatio || 1); W = w; H = h;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + 'px';
      draw();
    }

    function tick(now) {
      raf = 0; if (dead) return;
      if (doc.hidden) return; // resumes from the visibilitychange handler
      if (!t0) t0 = now;
      progress = Math.min(1, (now - t0) / REVEAL_MS); const e = 1 - Math.pow(1 - progress, 3); const keep = progress; progress = e; draw(); progress = keep;
      if (progress < 1) raf = win.requestAnimationFrame(tick); else { progress = 1; draw(); }
    }
    function start() { if (!raf && progress < 1 && !dead) raf = win.requestAnimationFrame(tick); }

    function indexAt(ev) {
      if (!geo || !pts.length) return -1;
      const r = canvas.getBoundingClientRect(), x = ev.clientX - r.left;
      if (x < geo.x0 - 4 || x > geo.x1 + 4) return -1;
      return Math.max(0, Math.min(pts.length - 1, Math.round(((x - geo.x0) / (geo.x1 - geo.x0)) * (pts.length - 1))));
    }
    const pickOf = (i) => { const p = pts[i]; return { month: p.m, label: p.label, value: p.v, previous: p.prev, previousMonth: p.prevM, change: p.change, gap: p.gap }; };
    const onMove = (ev) => { if (model.empty || progress < 1) return; const i = indexAt(ev); if (i !== hover) { hover = i; draw(); if (opts.onPick) opts.onPick(i >= 0 ? pickOf(i) : null); } };
    const onLeave = () => { if (hover !== -1) { hover = -1; draw(); if (opts.onPick) opts.onPick(null); } };
    const onClick = (ev) => { if (model.empty) return; const i = indexAt(ev); if (i >= 0 && opts.onPick) opts.onPick(pickOf(i)); };
    const onVis = () => { if (!doc.hidden) { draw(); start(); } };
    canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('click', onClick);
    doc.addEventListener('visibilitychange', onVis);
    let ro = null; if (win.ResizeObserver) { ro = new win.ResizeObserver(() => size()); ro.observe(host); } else win.addEventListener('resize', size);
    size(); start();

    return {
      destroy() {
        dead = true; if (raf) win.cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else win.removeEventListener('resize', size);
        doc.removeEventListener('visibilitychange', onVis);
        canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('click', onClick);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        host.removeAttribute('role'); host.removeAttribute('aria-label');
      },
    };
  }

  SC.viz.wave = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
