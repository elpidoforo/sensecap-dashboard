/*
  Pipeline widget (SC.viz.pipeline). Scripted explanation of the real Kleanthis data path, labelled "how it works", not live.
  Left: record sources, each with a pixel grid (one cell per record, or a fixed 20x20 with "one cell = N records").
  Centre: a ring with one particle per record (capped, "one particle = N records") drifting in, swirling through the four
  plain steps and leaving to the right. Right: the stack sheets. All numbers come from SC.viz.pipelineData.build().
  Classic script, 2D canvas, no libraries. Model: see pipeline-data.js.
*/
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  SC.viz = SC.viz || {};

  const BG = '#050b16', CYAN = '#7DD3FC', AMBER = '#FBBF24', INK = '#E6F6FF', MUTED = '#8aa4bd';
  const PAL = ['#8de4c0', '#ffb3d1', '#6ec8ff', '#ffd678', '#C4A1FF', '#FDA4AF'];
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const PERIOD = 16, STILL_T = 7.3, DEG = Math.PI / 180;

  const L = () => (SC.lang === 'el' ? 1 : 0);
  const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
  const qb = (p0, p1, p2, t) => { const u = 1 - t; return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y }; };

  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function fit(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    let s = text; while (s.length > 1 && c.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function wrap(c, text, maxW, maxLines) {
    const words = String(text).split(/\s+/), lines = []; let cur = '';
    for (let i = 0; i < words.length; i++) {
      const t = cur ? cur + ' ' + words[i] : words[i];
      if (c.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = words[i]; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = fit(c, lines[maxLines - 1] + ' …', maxW); }
    return lines.map((s) => fit(c, s, maxW));
  }

  function layout(W, H, model) {
    const wide = W >= 600, pad = 14, nS = model.sources.length, nP = model.sheets.length;
    const o = { wide, W, H, pad, headH: wide ? 54 : 58, cards: [], pills: [] };
    if (wide) {
      const colW = Math.round(W * 0.27), colR = Math.round(W * 0.29), top = o.headH + 4, bot = H - pad, gap = 8;
      const ch = nS ? (bot - top - gap * (nS - 1)) / nS : 0;
      model.sources.forEach((s, i) => o.cards.push({ x: pad, y: top + i * (ch + gap), w: colW, h: ch }));
      const ph = Math.min(36, nP ? (bot - top - 10 * (nP - 1)) / nP : 36), pg = nP > 1 ? Math.min(22, (bot - top - ph * nP) / (nP - 1)) : 0;
      const ptop = top + ((bot - top) - (ph * nP + pg * (nP - 1))) / 2;
      model.sheets.forEach((s, i) => o.pills.push({ x: W - pad - colR, y: ptop + i * (ph + pg), w: colR, h: ph }));
      o.cx = W / 2; o.cy = top + (bot - top) / 2; o.R = Math.max(40, Math.min(W * 0.125, (bot - top) / 2 - 34));
      o.a0 = 180; o.font = 11;
    } else {
      const gap = 6, cw = nS ? (W - 2 * pad - gap * (nS - 1)) / nS : 0, ch = 150, top = o.headH;
      model.sources.forEach((s, i) => o.cards.push({ x: pad + i * (cw + gap), y: top, w: cw, h: ch }));
      const ph = 28, pg = 5, ptop = H - pad - (ph * nP + pg * (nP - 1));
      model.sheets.forEach((s, i) => o.pills.push({ x: pad + 16, y: ptop + i * (ph + pg), w: W - 2 * pad - 16, h: ph }));
      const ay = top + ch + 10, by = ptop - 8;
      o.cx = W / 2; o.cy = (ay + by) / 2; o.R = Math.max(40, Math.min(W * 0.26, (by - ay) / 2 - 22));
      o.a0 = 270; o.font = 10;
    }
    o.ptop = o.pills.length ? o.pills[0].y : H;
    return o;
  }
  const cardOut = (o, r) => (o.wide ? { x: r.x + r.w, y: r.y + r.h / 2 } : { x: r.x + r.w / 2, y: r.y + r.h });
  const pillIn = (o, r) => (o.wide ? { x: r.x, y: r.y + r.h / 2 } : { x: r.x, y: r.y + r.h / 2 });
  const ringPt = (o, ang, rad) => ({ x: o.cx + Math.cos(ang * DEG) * rad, y: o.cy + Math.sin(ang * DEG) * rad });

  function mount(host, model, opts) {
    opts = opts || {};
    const doc = host.ownerDocument || document;
    const canvas = doc.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.borderRadius = '10px'; canvas.style.touchAction = 'manipulation';
    host.appendChild(canvas);
    host.setAttribute('role', 'img');
    const ctx = canvas.getContext('2d');

    // The button lives next to the picture (children of role="img" are not reachable by keyboard or screen reader).
    const btn = doc.createElement('button');
    btn.type = 'button';
    const bs = btn.style;
    bs.font = '11px ' + MONO; bs.color = CYAN; bs.background = BG; bs.border = '1px solid rgba(125,211,252,0.55)';
    bs.borderRadius = '999px'; bs.padding = '5px 14px'; bs.margin = '8px 0 0'; bs.cursor = 'pointer'; bs.minHeight = '28px';
    (host.parentNode ? host.parentNode.insertBefore(btn, host.nextSibling) : host.appendChild(btn));

    // Particles: one per record (or one per N records), owner source from the model.
    const parts = model.particles.list.map((si, i) => ({ si, h1: hash(i, 1), h2: hash(i, 2), h3: hash(i, 3), h4: hash(i, 4) }));
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    let W = 0, H = 0, lay = null, t = STILL_T, paused = false, raf = 0, last = 0, hover = null, lastLang = -1, dead = false;
    const pill = (si) => model.sources[si].sheetIndex;
    const moving = () => !reduce.matches && !paused;

    function size() {
      const w = Math.max(240, Math.floor(host.clientWidth || host.getBoundingClientRect().width || 600));
      const h = opts.height || Math.round(w >= 600 ? w * 0.58 : w * 1.78);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w !== W || h !== H || canvas.width !== Math.round(w * dpr)) {
        W = w; H = h; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); lay = layout(W, H, model);
      }
    }

    function syncText() {
      const lg = L();
      host.setAttribute('aria-label', model.ariaLabel[lg]);
      btn.textContent = paused ? model.strings.play[lg] : model.strings.pause[lg];
      btn.setAttribute('aria-label', btn.textContent + ' (' + model.strings.mode[lg] + ')');
      btn.hidden = reduce.matches;
      lastLang = lg;
    }

    // Which sheet pill is lit: the hovered one, else a scripted rotation among sheets that have records.
    // A page may drive the highlight itself (opts.scripted): step(i) lights source i and its sheet, ready(true) shows the finished mark.
    const ext = { on: !!opts.scripted, active: -1, ready: false, at: 0 };
    const hotSrc = (i) => (hover ? hover.kind === 'source' && hover.index === i : ext.on && !ext.ready && ext.active === i);
    function litSheet() {
      if (!hover && ext.on) return ext.ready || ext.active < 0 || !model.sources[ext.active] ? -1 : model.sources[ext.active].sheetIndex;
      if (hover) return hover.kind === 'sheet' ? hover.index : model.sources[hover.index].sheetIndex;
      const live = []; model.sheets.forEach((s, i) => { if (s.records > 0) live.push(i); });
      return live.length ? live[Math.floor(t / 3.5) % live.length] : -1;
    }

    function particlePos(p, o, tt) {
      const u = (tt / PERIOD + p.h1) % 1, s = model.sources[p.si], card = o.cards[p.si], pl = o.pills[s.sheetIndex];
      const a0 = o.a0, R = o.R, from = cardOut(o, card), to = pillIn(o, pl);
      from.x += (p.h2 - 0.5) * (o.wide ? 4 : card.w * 0.5); from.y += (p.h3 - 0.5) * (o.wide ? card.h * 0.5 : 4);
      const spread = 0.8 + 0.28 * p.h2, S1 = 0.22, S2 = 0.78;
      if (u < S1) {
        const q = ease(u / S1), e = ringPt(o, a0 + (p.h4 - 0.5) * 24, R * spread);
        const ctl = { x: (from.x + e.x) / 2 + (p.h3 - 0.5) * 30, y: (from.y + e.y) / 2 + (p.h4 - 0.5) * 30 };
        const pt = qb(from, ctl, e, q); pt.a = Math.min(1, u / 0.03); pt.stage = -1; return pt;
      }
      if (u < S2) {
        const q = (u - S1) / (S2 - S1), e = ease(q), ang = a0 + 540 * e + (p.h4 - 0.5) * 14;
        const rad = R * lerp(spread, 0.42, e) * (1 + (p.h3 - 0.5) * 0.18 * (1 - e));
        const pt = ringPt(o, ang, rad); pt.a = 1; pt.ang = ((ang % 360) + 360) % 360; pt.stage = 1; return pt;
      }
      const q = ease((u - S2) / (1 - S2)), s0 = ringPt(o, a0 + 540 + (p.h4 - 0.5) * 14, R * 0.42);
      const ctl = o.wide ? { x: lerp(s0.x, to.x, 0.5), y: s0.y + (p.h3 - 0.5) * 20 } : { x: s0.x + (p.h3 - 0.5) * 20, y: lerp(s0.y, to.y, 0.5) };
      const pt = qb(s0, ctl, { x: to.x, y: to.y + (p.h2 - 0.5) * pl.h * 0.5 }, q); pt.a = Math.min(1, (1 - u) / 0.04); pt.stage = -1; return pt;
    }

    function flowLine(a, b, o, col, alpha, dashed, dir) {
      ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = 1;
      if (dashed) { ctx.setLineDash([3, 6]); ctx.lineDashOffset = -t * 16; }
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if (o.wide) ctx.bezierCurveTo(lerp(a.x, b.x, 0.5), a.y, lerp(a.x, b.x, 0.5), b.y, b.x, b.y);
      else ctx.bezierCurveTo(a.x, lerp(a.y, b.y, 0.5), b.x, lerp(a.y, b.y, 0.5), b.x, b.y);
      ctx.stroke(); ctx.restore();
    }

    function drawGrid(src, col, gx, gy, gs, tt, still) {
      const g = src.grid; if (!g.cells) return;
      const cs = gs / Math.max(g.cols, g.rows), cell = cs >= 4 ? cs - 1 : cs >= 2.4 ? cs - 0.7 : Math.max(1, cs - 0.4);
      const x0 = gx + (gs - cs * g.cols) / 2, y0 = gy;
      ctx.fillStyle = col;
      const total = g.capped ? g.cols * g.rows : g.cells;
      for (let k = 0; k < total; k++) {
        const cx = k % g.cols, cy = Math.floor(k / g.cols), filled = k < g.cells;
        ctx.globalAlpha = filled ? (still ? 0.85 : 0.55 + 0.35 * Math.sin(tt * 2 - (cx + cy) * 0.45)) : 0.1;
        ctx.fillRect(x0 + cx * cs, y0 + cy * cs, cell, cell);
      }
      ctx.globalAlpha = 1;
    }

    function drawCard(o, i, tt, hot, lg) {
      const r = o.cards[i], s = model.sources[i], col = PAL[i % PAL.length], f = o.font;
      rrect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fillStyle = 'rgba(10,24,42,0.9)'; ctx.fill();
      ctx.strokeStyle = hot ? AMBER : 'rgba(125,211,252,0.28)'; ctx.lineWidth = hot ? 1.5 : 1; ctx.stroke();
      const rec = s.recordsText[lg];
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      const barY = r.y + r.h - 12;
      if (o.wide) {
        const tw = r.w - 20 - Math.min(r.h - 36, r.w * 0.4) - 8, gs = Math.min(r.h - 38, r.w * 0.4);
        ctx.font = 'bold ' + f + 'px ' + MONO; ctx.fillStyle = INK;
        const tl = wrap(ctx, s.title[lg], tw, 2); tl.forEach((ln, k) => ctx.fillText(ln, r.x + 10, r.y + 18 + k * (f + 2)));
        const cy = r.y + 18 + tl.length * (f + 2) + 4;
        ctx.font = f + 'px ' + MONO; ctx.fillStyle = col; ctx.fillText(fit(ctx, rec, tw), r.x + 10, cy);
        if (s.grid.label) { ctx.font = (f - 2) + 'px ' + MONO; ctx.fillStyle = MUTED; wrap(ctx, s.grid.label[lg], tw, 2).forEach((ln, k) => ctx.fillText(ln, r.x + 10, cy + 12 + k * 10)); }
        drawGrid(s, col, r.x + r.w - 10 - gs, r.y + 10, gs, tt, !moving());
        drawBar(r.x + 10, barY, r.w - 20, s, col, lg, f, true);
      } else {
        const gs = Math.min(r.w - 12, 72);
        ctx.font = 'bold ' + (f - 1) + 'px ' + MONO; ctx.fillStyle = INK;
        const tl = wrap(ctx, s.title[lg], r.w - 10, 3); tl.forEach((ln, k) => ctx.fillText(ln, r.x + 5, r.y + 13 + k * 10));
        ctx.font = (f - 2) + 'px ' + MONO; ctx.fillStyle = col; ctx.fillText(fit(ctx, rec, r.w - 8), r.x + 5, r.y + 13 + 3 * 10 + 4);
        drawGrid(s, col, r.x + (r.w - gs) / 2, r.y + 56, gs, tt, !moving());
        if (s.grid.label) { ctx.font = (f - 3) + 'px ' + MONO; ctx.fillStyle = MUTED; ctx.fillText(fit(ctx, s.grid.label[lg].replace(/^[^=]*= /, '1 = '), r.w - 6), r.x + 4, r.y + r.h - 20); }
        drawBar(r.x + 6, barY, r.w - 12, s, col, lg, f, false);
      }
    }
    function drawBar(x, y, w, s, col, lg, f, labels) {
      let bx = x, bw = w;
      ctx.font = (f - 2) + 'px ' + MONO; ctx.fillStyle = MUTED;
      if (labels) {
        const inT = model.strings.inLabel[lg], outT = s.count ? model.strings.oneSheet[lg] : model.strings.noRecords[lg];
        ctx.fillText(inT, x, y + 4); const iw = ctx.measureText(inT).width + 5, ow = ctx.measureText(outT).width + 5;
        bx = x + iw; bw = w - iw - ow; ctx.textAlign = 'right'; ctx.fillText(outT, x + w, y + 4); ctx.textAlign = 'left';
      }
      ctx.fillStyle = 'rgba(125,211,252,0.15)'; ctx.fillRect(bx, y, bw, 4);
      ctx.fillStyle = col; ctx.fillRect(bx, y, Math.max(s.count ? 2 : 0, bw * s.share), 4);
    }

    function drawPill(o, i, hot, lg) {
      const r = o.pills[i], sh = model.sheets[i], f = o.font, has = sh.records > 0;
      ctx.save();
      if (hot) { ctx.shadowColor = AMBER; ctx.shadowBlur = 14; }
      rrect(ctx, r.x, r.y, r.w, r.h, r.h / 2); ctx.fillStyle = hot ? 'rgba(251,191,36,0.16)' : 'rgba(10,24,42,0.95)'; ctx.fill();
      ctx.restore();
      rrect(ctx, r.x, r.y, r.w, r.h, r.h / 2); ctx.strokeStyle = hot ? AMBER : has ? 'rgba(125,211,252,0.45)' : 'rgba(125,211,252,0.18)'; ctx.lineWidth = hot ? 1.6 : 1; ctx.stroke();
      ctx.font = f + 'px ' + MONO; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      const cnt = sh.recordsText[lg]; ctx.fillStyle = hot ? AMBER : CYAN; ctx.fillText(cnt, r.x + r.w - r.h / 2 + 2, r.y + r.h / 2 + 0.5);
      const cw = ctx.measureText(cnt).width; ctx.textAlign = 'left'; ctx.fillStyle = has ? INK : MUTED;
      ctx.fillText(fit(ctx, sh.title[lg], r.w - r.h / 2 - cw - 20), r.x + r.h / 2 + 2, r.y + r.h / 2 + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
    

    function draw() {
      size(); const o = lay, lg = L(), tt = t, mv = moving(); ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      const lit = litSheet(), f = o.font;

      // header: the two counted numbers and the honest mode label
      ctx.textBaseline = 'alphabetic';
      ctx.font = f + 'px ' + MONO; ctx.fillStyle = MUTED; ctx.textAlign = 'center';
      ctx.fillText(fit(ctx, model.strings.title[lg] + '  ·  ' + model.strings.mode[lg], W - 2 * o.pad), W / 2, 17);
      ctx.textAlign = 'left'; ctx.font = 'bold ' + (o.wide ? 26 : 22) + 'px ' + MONO; ctx.fillStyle = CYAN;
      const ni = model.recordsInText[lg], ns = model.sheetsOutText[lg];
      ctx.fillText(ni, o.pad, o.headH - 14);
      ctx.font = 'bold ' + (o.wide ? 26 : 22) + 'px ' + MONO; const niw = ctx.measureText(ni).width; ctx.fillStyle = MUTED;
      ctx.font = (f - 1) + 'px ' + MONO; ctx.fillText(model.strings.recordsIn[lg], o.pad + niw + 8, o.headH - 14);
      ctx.textAlign = 'right'; ctx.font = (f - 1) + 'px ' + MONO; ctx.fillText(model.strings.sheetsOut[lg], W - o.pad, o.headH - 14);
      const lw = ctx.measureText(model.strings.sheetsOut[lg]).width;
      ctx.font = 'bold ' + (o.wide ? 26 : 22) + 'px ' + MONO; ctx.fillStyle = AMBER; ctx.fillText(ns, W - o.pad - lw - 8, o.headH - 14);
      ctx.textAlign = 'left';

      // connecting lines (flowing)
      model.sources.forEach((s, i) => {
        const a = cardOut(o, o.cards[i]), e = ringPt(o, o.a0, o.R), hot = hotSrc(i);
        flowLine(a, e, o, PAL[i % PAL.length], s.count ? (hot ? 0.9 : 0.35) : 0.1, s.count > 0, 1);
        const pi = s.sheetIndex, b = pillIn(o, o.pills[pi]), x = ringPt(o, o.a0 + 540, o.R * 0.42);
        flowLine(x, b, o, pi === lit ? AMBER : PAL[i % PAL.length], s.count ? (pi === lit ? 0.9 : 0.3) : 0.1, s.count > 0, 1);
      });

      // ring with glow
      ctx.save();
      const g = ctx.createRadialGradient(o.cx, o.cy, o.R * 0.1, o.cx, o.cy, o.R * 1.1);
      g.addColorStop(0, 'rgba(125,211,252,0.10)'); g.addColorStop(1, 'rgba(125,211,252,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R * 1.1, 0, 7); ctx.fill();
      ctx.shadowColor = CYAN; ctx.shadowBlur = 16; ctx.strokeStyle = 'rgba(125,211,252,0.7)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R, 0, 7); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = 'rgba(125,211,252,0.22)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R * 0.7, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R * 0.42, 0, 7); ctx.stroke();

      // particles; stage glow from how many are passing each stage
      const dens = [0, 0, 0, 0], stAng = [0, 1, 2, 3].map((k) => (o.a0 + 45 + 90 * k) % 360);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i], pt = particlePos(p, o, tt);
        ctx.globalAlpha = pt.a * 0.9; ctx.fillStyle = PAL[p.si % PAL.length];
        const r = o.wide ? 1.5 : 1.3; ctx.fillRect(pt.x - r / 2, pt.y - r / 2, r + 0.4, r + 0.4);
        if (pt.stage === 1) for (let k = 0; k < 4; k++) { let d = Math.abs(pt.ang - stAng[k]); d = Math.min(d, 360 - d); if (d < 22) dens[k]++; }
      }
      ctx.globalAlpha = 1;
      const dmax = Math.max(1, parts.length * 0.06);
      model.stages.forEach((st, k) => {
        const a = o.a0 + 45 + 90 * k, pt = ringPt(o, a, o.R), b = Math.min(1, dens[k] / dmax), right = Math.cos(a * DEG) > 0, down = Math.sin(a * DEG) > 0;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3 + 2.5 * b, 0, 7); ctx.fillStyle = b > 0.5 ? AMBER : CYAN; ctx.globalAlpha = 0.55 + 0.45 * b; ctx.fill(); ctx.globalAlpha = 1;
        ctx.font = f + 'px ' + MONO; ctx.fillStyle = b > 0.5 ? AMBER : INK; ctx.textAlign = right ? 'left' : 'right';
        ctx.fillText((k + 1) + ' ' + st.n[lg], pt.x + (right ? 9 : -9), pt.y + (down ? 14 : -7));
      });
      ctx.textAlign = 'center';
      ctx.font = f + 'px ' + MONO; ctx.fillStyle = AMBER;
      if (model.empty) { ctx.fillStyle = MUTED; wrap(ctx, model.empty[lg], o.R * 1.1, 4).forEach((ln, k) => ctx.fillText(ln, o.cx, o.cy - 10 + k * (f + 3))); }
      else if (ext.on && ext.ready) { // the finished mark: a tick in a ring, as at the end of a run
        const k = reduce.matches ? 1 : Math.min(1, (performance.now() - ext.at) / 350), r = Math.max(12, o.R * 0.2);
        ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.globalAlpha = k; ctx.beginPath(); ctx.arc(o.cx, o.cy - 6, r, 0, 7); ctx.stroke();
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(o.cx - r * 0.45, o.cy - 6); ctx.lineTo(o.cx - r * 0.1, o.cy - 6 + r * 0.35); ctx.lineTo(o.cx + r * 0.5, o.cy - 6 - r * 0.35); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = CYAN; ctx.fillText(lg ? 'ΕΤΟΙΜΟ' : 'READY', o.cx, o.cy + r + 12); ctx.globalAlpha = 1;
      }
      else {
        ctx.fillText(model.strings.mode[lg].split(',')[0], o.cx, o.cy - 2);
        ctx.fillStyle = MUTED; ctx.font = (f - 1) + 'px ' + MONO;
        ctx.fillText(reduce.matches ? model.strings.still[lg] : paused ? model.strings.paused[lg] : model.strings.mode[lg].split(',')[1].trim(), o.cx, o.cy + f + 2);
      }
      if (model.particles.label) { ctx.fillStyle = MUTED; ctx.font = (f - 1) + 'px ' + MONO; ctx.fillText(model.particles.label[lg], o.cx, o.cy + o.R + (o.wide ? 26 : 38)); }
      ctx.textAlign = 'left';

      model.sources.forEach((s, i) => drawCard(o, i, tt, hotSrc(i), lg));
      model.sheets.forEach((s, i) => drawPill(o, i, i === lit, lg));
      void mv;
    }

    function frame(now) {
      raf = 0; if (dead) return;
      if (!doc.hidden) { if (last) t += Math.min(0.1, (now - last) / 1000); last = now; draw(); } else last = 0;
      if (moving()) raf = requestAnimationFrame(frame);
    }
    function kick() {
      cancelAnimationFrame(raf); raf = 0; last = 0;
      if (moving()) raf = requestAnimationFrame(frame); else { if (reduce.matches) t = STILL_T; draw(); }
    }
    function refresh() { syncText(); if (moving()) { if (!raf) kick(); } else draw(); }

    btn.addEventListener('click', () => { paused = !paused; syncText(); kick(); });

    // pointer: hover or click a card or a pill; reports { kind, id, ... } or null
    function hit(ev) {
      const b = canvas.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top, o = lay; if (!o) return null;
      const inR = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      for (let i = 0; i < o.cards.length; i++) if (inR(o.cards[i])) return { kind: 'source', index: i };
      for (let i = 0; i < o.pills.length; i++) if (inR(o.pills[i])) return { kind: 'sheet', index: i };
      return null;
    }
    function item(h) {
      if (!h) return null;
      if (h.kind === 'source') { const s = model.sources[h.index]; return { kind: 'source', id: s.id, title: s.title, count: s.count, sheetId: s.sheetId, sheetTitle: s.sheetTitle, grid: s.grid }; }
      const sh = model.sheets[h.index]; return { kind: 'sheet', id: sh.id, title: sh.title, records: sh.records, sources: sh.sources };
    }
    const same = (a, b) => (!a && !b) || (a && b && a.kind === b.kind && a.index === b.index);
    function setHover(h, force) {
      if (same(h, hover) && !force) return;
      hover = h; canvas.style.cursor = h ? 'pointer' : 'default';
      if (!moving()) draw();
      if (opts.onPick) { try { opts.onPick(item(h)); } catch (e) { /* page handler error must not stop drawing */ } }
    }
    canvas.addEventListener('pointermove', (ev) => setHover(hit(ev)));
    canvas.addEventListener('pointerleave', () => setHover(null));
    canvas.addEventListener('click', (ev) => setHover(hit(ev), true));

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!dead) { size(); if (!moving()) draw(); } }) : null;
    if (ro) ro.observe(host);
    const onVis = () => { last = 0; if (!doc.hidden && moving() && !raf) kick(); };
    doc.addEventListener('visibilitychange', onVis);
    const onMq = () => { syncText(); kick(); };
    if (reduce.addEventListener) reduce.addEventListener('change', onMq);
    const langTimer = setInterval(() => { if (!dead && L() !== lastLang) refresh(); }, 800);

    size(); syncText(); kick();

    return {
      step(i) { ext.active = i; ext.ready = false; ext.at = performance.now(); kick(); },
      ready(on) { ext.ready = !!on; ext.at = performance.now(); kick(); },
      destroy() {
        dead = true; cancelAnimationFrame(raf); clearInterval(langTimer); if (ro) ro.disconnect();
        doc.removeEventListener('visibilitychange', onVis); if (reduce.removeEventListener) reduce.removeEventListener('change', onMq);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas); if (btn.parentNode) btn.parentNode.removeChild(btn);
        host.removeAttribute('role'); host.removeAttribute('aria-label');
      },
    };
  }

  SC.viz.pipeline = { mount };
})();
