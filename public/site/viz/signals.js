/*
  signals.js: the Signals over Cyprus board. One canvas, one clock.
  Sky: the live sources, each a small drawn instrument that drifts a little. Middle: a row of cards with what the sources say
  now, with one small bar per reading. Ground: the island of this site's own drawing on a tilted plane with a latitude and
  longitude grid. Silky bundles of light run from each source to its own cards; from a card one strand falls for every record
  to the place the record gives for itself and leaves a pool of light there. A running line at the bottom names the records.
  The records of ONE fetch are played one after the other so they can be watched, and the play repeats until the next fetch;
  they arrived together, and the board says so. A source that is not answering is drawn dashed and sends no light.
  Places are those published by the sources (stations, satellite detections, earthquake epicentres); no vehicle and no school
  sensor is placed. The drift of the instruments and the shimmer of the strands are decoration, not data.
  Needs window.ISLAND (island.js) and SC.viz.signalsData.
  SC.viz.signals.mount(host, model, { onTime, loop }) -> { play, pause, replay, seek, time, duration, isPaused, run(model), destroy }.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const C = { bg: '#030408', ink: '#EAF0F7', mute: '#7f93ad', line: 'rgba(125,211,252,.18)', pan: 'rgba(8,12,22,.9)', amber: '#FBBF24', grey: 'rgba(140,155,178,.6)', white: '#ffffff' };
  // where each instrument floats in the sky (share of the width, share of the sky height); far from its cards on purpose, so the bundles cross
  const SKY = { met: [0.8, 0.56], airports: [0.19, 0.34], air: [0.42, 0.16], fires: [0.63, 0.1], quakes: [0.1, 0.72] };
  // on a phone the sky is narrow: the instruments sit at different heights so their labels do not meet
  const SKY_NARROW = { met: [0.86, 0.66], airports: [0.14, 0.44], air: [0.36, 0.0], fires: [0.72, 0.3], quakes: [0.1, 0.92] };
  const lg = () => (window.SC && SC.lang === 'el' ? 1 : 0), tx = (p) => (Array.isArray(p) ? p[lg()] : String(p == null ? '' : p)), L2 = (en, el) => (lg() ? el : en);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), c01 = (v) => clamp(v, 0, 1), ease = (t) => { t = c01(t); return t * t * (3 - 2 * t); };
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.signalsData, IS = window.ISLAND, reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%'; host.textContent = ''; host.append(cv); host.setAttribute('role', 'img');
    const ctx = cv.getContext('2d'); let m = model, W = 0, H = 0, L = null, raf = 0, dead = false, paused = false, T = 0, amb = 0, lastNow = 0;
    const paths = IS && IS.districts && typeof Path2D === 'function' ? Object.keys(IS.districts).map((k) => new Path2D(IS.districts[k])) : [];
    const fit = (s, w) => { s = String(s); if (ctx.measureText(s).width <= w) return s; while (s.length > 2 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
    const text = (s, x, y, col, font, al, maxW) => { ctx.font = font; ctx.fillStyle = col; ctx.globalAlpha = al == null ? 1 : al; ctx.fillText(maxW ? fit(s, maxW) : s, x, y); ctx.globalAlpha = 1; };
    // up to two lines, broken at a space
    const text2 = (s, x, y, lh, col, font, al, maxW) => { ctx.font = font; ctx.fillStyle = col; ctx.globalAlpha = al == null ? 1 : al; s = String(s); if (ctx.measureText(s).width <= maxW) { ctx.fillText(s, x, y); ctx.globalAlpha = 1; return 1; } const w = s.split(' '); let a = ''; let k = 0; for (; k < w.length; k++) { const t = a ? a + ' ' + w[k] : w[k]; if (ctx.measureText(t).width > maxW && a) break; a = t; } ctx.fillText(fit(a, maxW), x, y); const rest = w.slice(k).join(' '); if (rest) ctx.fillText(fit(rest, maxW), x, y + lh); ctx.globalAlpha = 1; return rest ? 2 : 1; };
    const rr = (x, y, w, h, r) => { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    const bez = (q, t) => { const u = 1 - t; return [u * u * u * q[0][0] + 3 * u * u * t * q[1][0] + 3 * u * t * t * q[2][0] + t * t * t * q[3][0], u * u * u * q[0][1] + 3 * u * u * t * q[1][1] + 3 * u * t * t * q[2][1] + t * t * t * q[3][1]]; };
    // part of a curve, from share a to share b of its length
    const seg = (q, col, al, lw, a, b) => { a = c01(a); b = c01(b); if (b <= a) return; ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = lw; ctx.beginPath(); const n = Math.max(2, Math.round(22 * (b - a))); for (let k = 0; k <= n; k++) { const p = bez(q, a + (b - a) * k / n); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); ctx.globalAlpha = 1; };
    const glow = (x, y, r, col, al, ry) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = al; ctx.fillStyle = g; ctx.beginPath(); if (ry) ctx.ellipse(x, y, r, ry, 0, 0, 7); else ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; };

    function layout() {
      const w = Math.max(300, host.clientWidth || 320), wide = w >= 820, pad = wide ? 14 : 8, nC = m.cards.length, o = { wide, pad }; W = w;
      o.top = wide ? 54 : 80;
      const perRow = wide ? nC : 2, rows = Math.ceil(nC / perRow), gap = 6, cardH = wide ? 74 : 56, cw = (w - pad * 2 - gap * (perRow - 1)) / perRow;
      const h = wide ? clamp(Math.round(w * 0.74), 700, 980) : Math.round(o.top + Math.max(240, w * 0.56) + rows * (cardH + gap) + w * 0.62 + 96); H = h;
      const skyH = wide ? h * 0.32 : Math.max(240, w * 0.56), cardY = o.top + skyH + 10; o.sky = { y: o.top, h: skyH };
      o.em = m.sources.map((s) => { const p = (wide ? SKY : SKY_NARROW)[s.id] || [0.5, 0.5]; return { bx: pad + (w - pad * 2) * (wide ? p[0] : 0.14 + 0.72 * p[0]), by: o.top + (wide ? 34 : 50) + (skyH - (wide ? 86 : 96)) * p[1] }; });
      o.cards = m.cards.map((c, k) => ({ x: pad + (k % perRow) * (cw + gap), y: cardY + Math.floor(k / perRow) * (cardH + gap), w: cw, h: cardH })); o.cardBottom = cardY + rows * (cardH + gap);
      const tickH = 26, mapTop = o.cardBottom + (wide ? 40 : 30), mapBot = h - pad - tickH - 22, mapH = mapBot - mapTop, tilt = wide ? 0.6 : 0.62, iw = IS ? IS.W : 1000, ih = IS ? IS.H : 600, sc = Math.min((w - pad * 2) * 0.9 / iw, mapH / (ih * tilt));
      o.map = { top: mapTop, bot: mapBot, sc, tilt, ox: (w - iw * sc) / 2, oy: mapTop + (mapH - ih * sc * tilt) / 2, iw, ih }; o.tick = { x: pad, y: h - pad - tickH, w: w - pad * 2, h: tickH };
      L = o; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // island drawing coordinates -> screen. The far (north) side is drawn narrower: a tilt, not a map projection.
    const KFAR = 0.78;
    const scr = (ix, iy) => { const M = L.map, v = iy / M.ih, k = KFAR + (1 - KFAR) * v, cx = M.iw / 2; return [M.ox + (cx + (ix - cx) * k) * M.sc, M.oy + iy * M.sc * M.tilt]; };
    const place = (lng, lat) => { const p = IS.project(lng, lat); return scr(p[0], p[1]); };
    // where an instrument is now: its place in the sky plus a slow drift (decoration)
    const emit = (i) => { const e = L.em[i], mv = !reduce.matches; return { x: e.bx + (mv ? Math.sin(amb / 2300 + i * 1.7) * 6 : 0), y: e.by + (mv ? Math.sin(amb / 1700 + i * 2.3) * 5 : 0) }; };

    function drawTop(S) {
      const o = L, t = m.totals, act = S.active >= 0 ? m.sources[S.active] : null;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; text('signals / cyprus', o.pad + 2, 20, C.ink, '700 ' + (o.wide ? 15 : 12) + 'px ' + MONO); text(L2('one fetch, played back', 'μία λήψη, σε επανάληψη'), o.pad + 2, 36, C.mute, '10px ' + MONO);
      const cells = [[L2('SOURCES', 'ΠΗΓΕΣ'), t.answering + '/' + t.sources, C.ink], [L2('RECORDS', 'ΕΓΓΡΑΦΕΣ'), String(t.records), '#5fd4ff'], [L2('ON THE ISLAND', 'ΣΤΟ ΝΗΣΙ'), S.landed + '/' + t.placed, '#2dd4bf'], [L2('FETCHED', 'ΛΗΨΗ'), tx(m.when), C.amber]];
      const x0 = o.wide ? 200 : o.pad + 2, dy = o.wide ? 0 : 40, cw = (W - x0 - (o.wide ? W * 0.3 : o.pad)) / cells.length;
      cells.forEach((c, i) => { const x = x0 + i * cw; text(c[0], x, 14 + dy, C.mute, '9px ' + MONO, 1, cw - 6); text(c[1], x, 33 + dy, c[2], '700 ' + (o.wide ? 15 : 11) + 'px ' + MONO, 1, cw - 8); ctx.fillStyle = 'rgba(125,211,252,.2)'; ctx.fillRect(x, 39 + dy, cw - 10, 1.5); });
      if (o.wide) { ctx.textAlign = 'right'; text((act && !S.done ? tx(act.name) : S.done ? L2('ALL RECORDS PLACED', 'ΟΛΕΣ ΟΙ ΕΓΓΡΑΦΕΣ') : L2('SOURCES', 'ΠΗΓΕΣ')).toUpperCase(), W - o.pad - 2, 20, act && !S.done ? act.hue : C.amber, '700 10.5px ' + MONO, 1, W * 0.28); text(m.demo ? L2('test values, not real readings', 'δοκιμαστικές τιμές, όχι πραγματικές') : L2('the records arrived together', 'οι εγγραφές έφτασαν μαζί'), W - o.pad - 2, 35, m.demo ? C.amber : C.mute, '9.5px ' + MONO); ctx.textAlign = 'left'; }
    }
    function glyph(kind, x, y, col, on, s) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; if (!on) ctx.setLineDash([3, 3]);
      if (kind === 'mast') { ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 14); ctx.moveTo(-8, 14); ctx.lineTo(0, -4); ctx.lineTo(8, 14); ctx.moveTo(-9, -12); ctx.lineTo(9, -12); ctx.stroke(); ctx.beginPath(); ctx.arc(-9, -12, 2.5, 0, 7); ctx.arc(9, -12, 2.5, 0, 7); if (on) ctx.fill(); else ctx.stroke(); }
      else if (kind === 'tower') { ctx.beginPath(); ctx.moveTo(-4, 14); ctx.lineTo(-3, -4); ctx.lineTo(3, -4); ctx.lineTo(4, 14); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.rect(-9, -12, 18, 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -18); ctx.stroke(); }
      else if (kind === 'post') { ctx.beginPath(); ctx.rect(-7, -10, 14, 16); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 15); ctx.moveTo(-4, -4); ctx.lineTo(4, -4); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke(); }
      else if (kind === 'satellite') { ctx.rotate(-0.35); ctx.beginPath(); ctx.rect(-5, -5, 10, 10); ctx.stroke(); ctx.beginPath(); ctx.rect(-19, -4, 11, 8); ctx.rect(8, -4, 11, 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(0, 11); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-8, 0); ctx.lineTo(-5, -9); ctx.lineTo(-1, 11); ctx.lineTo(3, -14); ctx.lineTo(6, 6); ctx.lineTo(9, 0); ctx.lineTo(16, 0); ctx.stroke(); }
      ctx.restore();
    }
    function drawGround() {
      const o = L, M = o.map, B = m.box; if (!IS) return; const inn = reduce.matches ? 1 : c01(T / 700);
      // the plane: the frame of the drawing, tilted
      const c0 = place(B.w, B.n), c1 = place(B.e, B.n), c2 = place(B.e, B.s), c3 = place(B.w, B.s), g = ctx.createLinearGradient(0, c0[1], 0, c3[1]); g.addColorStop(0, 'rgba(20,32,60,.0)'); g.addColorStop(1, 'rgba(20,32,60,.5)');
      ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(125,211,252,.22)'; ctx.lineWidth = 1; ctx.stroke();
      // the latitude and longitude grid, every quarter of a degree; whole degrees a little stronger
      for (let lng = Math.ceil(B.w * 4) / 4; lng <= B.e + 1e-9; lng += 0.25) { const a = place(lng, B.s), b = place(lng, B.n); ctx.strokeStyle = 'rgba(125,211,252,' + (Math.abs(lng - Math.round(lng)) < 1e-6 ? 0.22 : 0.07) + ')'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      for (let lat = Math.ceil(B.s * 4) / 4; lat <= B.n + 1e-9; lat += 0.25) { const a = place(B.w, lat), b = place(B.e, lat); ctx.strokeStyle = 'rgba(125,211,252,' + (Math.abs(lat - Math.round(lat)) < 1e-6 ? 0.22 : 0.07) + ')'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      // the island: the outlines of this site's drawing, in thin slices so the far side can be narrower
      const bands = 28; for (let b = 0; b < bands; b++) { const y0 = M.ih * b / bands, y1 = M.ih * (b + 1) / bands, k = KFAR + (1 - KFAR) * ((y0 + y1) / 2 / M.ih), s0 = scr(0, y0), s1 = scr(0, y1); ctx.save(); ctx.beginPath(); ctx.rect(0, s0[1] - 0.5, W, s1[1] - s0[1] + 1); ctx.clip(); ctx.translate(M.ox + (M.iw / 2) * M.sc * (1 - k), M.oy); ctx.scale(M.sc * k, M.sc * M.tilt); ctx.lineWidth = 0.9 / (M.sc * k); ctx.fillStyle = 'rgba(120,190,255,' + 0.07 * inn + ')'; ctx.strokeStyle = 'rgba(200,228,255,' + 0.42 * inn + ')'; paths.forEach((p) => { ctx.fill(p); ctx.stroke(p); }); ctx.restore(); }
      // one colour per source along the near edge of the plane
      const n = m.sources.length, ew = (c2[0] - c3[0]) / n; m.sources.forEach((s, i) => { ctx.fillStyle = s.available ? s.hue : 'rgba(140,155,178,.4)'; ctx.globalAlpha = s.available ? 0.75 : 0.4; ctx.fillRect(c3[0] + i * ew + 2, c3[1] + 5, ew - 4, 2.5); ctx.globalAlpha = 1; });
      text(L2('Island: the drawing of this site, tilted. A guide, not a map to measure on.', 'Νησί: το σχέδιο αυτής της ιστοσελίδας, με κλίση. Οδηγός, όχι χάρτης για μετρήσεις.'), o.pad + 2, c3[1] + 20, 'rgba(127,147,173,.75)', '9px ' + MONO, 1, W - o.pad * 2);
    }
    function drawFlow(S) {
      const o = L, mv = !reduce.matches, FIB = o.wide ? 18 : 11; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      m.sources.forEach((s) => { if (!s.available) return; const lit = S.lit[s.id] || 0; if (lit <= 0) return; const e = emit(s.i), active = S.active === s.i && !S.done, cardIdx = m.cards.map((c, k) => (c.from.indexOf(s.id) >= 0 ? k : -1)).filter((k) => k >= 0), main = m.cards.findIndex((c) => c.id === s.card);
        glow(e.x, e.y, active ? 96 : 54, s.hue, (active ? 0.7 : 0.32) * lit); if (active) { glow(e.x, e.y + 12, 26, '#ffffff', 0.85 * lit); glow(e.x, e.y + 12, 60, s.hue, 0.5 * lit); }
        // a silky bundle from the instrument to each of its cards: many thin strands that fan out across the card
        cardIdx.forEach((k, j) => { const c = o.cards[k], a = [e.x, e.y + 16];
          for (let f = 0; f < FIB; f++) { const u = FIB === 1 ? 0.5 : f / (FIB - 1), b = [c.x + 6 + (c.w - 12) * u, c.y], bend = (rnd(s.i * 31 + k * 7 + f) - 0.5) * 70, dy = b[1] - a[1], q = [a, [a[0] + (b[0] - a[0]) * 0.08 + bend, a[1] + dy * 0.62], [b[0] + bend * 0.25, b[1] - dy * 0.38], b], core = f === Math.floor(FIB / 2);
            seg(q, s.hue, (core ? 0.75 : 0.16 + 0.16 * rnd(f + k)) * lit * (active ? 1 : 0.7), core ? 1.6 : 0.9, 0, lit); if (core) seg(q, '#ffffff', 0.35 * lit * (active ? 1 : 0.4), 0.7, 0, lit);
            // a short bright piece that runs down the strand while its source is being played
            if (mv && active) { const sp = 0.55 + 0.5 * rnd(f * 3 + k), t = ((amb / 1000) * sp + rnd(f + j * 5 + s.i)) % 1.25 - 0.12; seg(q, '#ffffff', 0.5, 1.1, t, t + 0.1); seg(q, s.hue, 0.6, 2.2, t + 0.02, t + 0.08); } }
          if (active) { glow(c.x + c.w / 2, c.y, c.w * 0.6, s.hue, 0.5, 16); glow(c.x + c.w / 2, c.y, c.w * 0.3, '#ffffff', 0.35, 6); } });
        // from the card one strand falls for every record to the place the record gives for itself
        const c = o.cards[main >= 0 ? main : cardIdx[0]]; if (!c) return;
        s.placed.forEach((r, j) => { const f = (T - r.at) / m.fall; if (f <= 0) return; const b = place(r.lng, r.lat), a = [c.x + c.w * (0.12 + 0.76 * rnd(j * 3 + s.i)), c.y + c.h], dy = b[1] - a[1], q = [a, [a[0], a[1] + dy * 0.5], [b[0], b[1] - dy * 0.62], b], landed = f >= 1;
          if (landed) { ctx.setLineDash([1, 4]); seg(q, s.hue, r.fresh ? 0.42 : 0.2, 1, 0, 1); ctx.setLineDash([]); } else { seg(q, s.hue, 0.8, 1.4, 0, f); seg(q, '#ffffff', 0.9, 1.6, f - 0.12, f); const p = bez(q, c01(f)); glow(p[0], p[1], 9, '#ffffff', 0.9); }
          if (landed) { const since = T - r.at - m.fall, ring = mv ? c01(since / 700) : 1, pulse = mv ? 0.75 + 0.25 * Math.sin(amb / 600 + j) : 1, R = (r.fresh ? 30 : 15) * (o.wide ? 1 : 0.62);
            glow(b[0], b[1], R, s.hue, (r.fresh ? 0.8 : 0.35) * pulse, R * L.map.tilt); glow(b[0], b[1], R * 0.4, s.hue, (r.fresh ? 0.7 : 0.3) * pulse, R * 0.4 * L.map.tilt); glow(b[0], b[1], 3.4, '#ffffff', r.fresh ? 1 : 0.55);
            if (ring < 1) { ctx.globalAlpha = (1 - ring) * 0.9; ctx.strokeStyle = s.hue; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(b[0], b[1], 4 + ring * 26, (4 + ring * 26) * L.map.tilt, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; } } }); });
      ctx.restore();
    }
    function drawSources(S) {
      const o = L, gs = o.wide ? 1.35 : 1;
      m.sources.forEach((s) => { const e = emit(s.i), on = s.available, inn = reduce.matches ? 1 : c01((T - s.i * 110) / 400), col = on ? s.hue : C.grey, right = e.x > W * 0.55, lw = o.wide ? 190 : 104;
        ctx.globalAlpha = inn; glyph(s.glyph, e.x, e.y, col, on, gs); ctx.globalAlpha = 1;
        // the label sits beside the instrument, away from the middle of the sky
        if (!o.wide) { // on a phone the label sits above the instrument, kept inside the board
          const room = 104, cx = clamp(e.x, o.pad + room / 2, W - o.pad - room / 2); ctx.textAlign = 'center'; text(tx(s.name), cx, e.y - 34, on ? C.ink : C.mute, '700 8.5px ' + MONO, inn, room); text(on ? s.total + L2(' records', ' εγγραφές') : L2('not answering', 'δεν απαντά'), cx, e.y - 23, on ? col : C.amber, '8px ' + MONO, inn, room); ctx.textAlign = 'left'; return; }
        const lx = right ? e.x + 26 * gs : e.x - 26 * gs; ctx.textAlign = right ? 'left' : 'right'; const room = right ? Math.min(lw, W - o.pad - lx) : Math.min(lw, lx - o.pad);
        const n = text2(tx(s.name), lx, e.y - 6, 11, on ? C.ink : C.mute, '700 10.5px ' + MONO, inn, room);
        text2(on ? s.total + L2(' records', ' εγγραφές') : tx(s.reason), lx, e.y - 6 + n * 11 + 2, 10, on ? col : C.amber, '9.5px ' + MONO, inn, room);
        if (on) text(tx(s.sub), lx, e.y - 6 + n * 11 + 14, C.mute, '8.5px ' + MONO, inn * 0.9, room); ctx.textAlign = 'left'; });
    }
    function drawCards(S) {
      const o = L;
      m.cards.forEach((c, k) => { const r = o.cards[k], lit = S.cards[k], src = m.sources.find((s) => s.id === c.from[0]), col = c.known ? src.hue : C.grey, shown = c.known && (lit >= 1 || reduce.matches);
        rr(r.x, r.y, r.w, r.h, 5); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = lit > 0 && c.known ? col : C.line; ctx.globalAlpha = c.known ? 0.35 + 0.65 * lit : 0.6; ctx.lineWidth = 1; if (!c.known) ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        text(tx(c.name), r.x + 7, r.y + 14, C.mute, (o.wide ? 9 : 8.5) + 'px ' + MONO, 1, r.w - 14);
        const val = !c.known ? tx(c.text) : shown ? tx(c.text) : lit > 0 ? '…' : '';
        if (c.known) text(val, r.x + 7, r.y + (o.wide ? 33 : 31), C.ink, '700 ' + (o.wide ? 12.5 : 11.5) + 'px ' + MONO, 1, r.w - 14); else text2(val, r.x + 7, r.y + 28, 11, C.amber, '700 9px ' + MONO, 1, r.w - 14);
        // one small bar per reading, in the order the source gives them; the height runs from the lowest to the highest reading
        if (shown && Array.isArray(c.values) && c.values.length > 1) { const v = c.values, lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), bx = r.x + 7, bw = r.w - 14, bh = r.h - (o.wide ? 46 : 40), by = r.y + r.h - 6, slot = Math.min(7, bw / v.length); v.forEach((x, i) => { const hgt = Math.max(2, bh * (hi > lo ? 0.2 + 0.8 * (x - lo) / (hi - lo) : 0.6)); ctx.fillStyle = col; ctx.globalAlpha = 0.75; ctx.fillRect(bx + i * slot, by - hgt, Math.max(1, slot - 1.5), hgt); }); ctx.globalAlpha = 1; }
        else if (shown && c.lo == null) { ctx.fillStyle = col; ctx.globalAlpha = 0.8; ctx.fillRect(r.x + 7, r.y + r.h - 8, r.w - 14, 2); ctx.globalAlpha = 1; } });
    }
    function drawTicker(S) {
      const o = L, r = o.tick; rr(r.x, r.y, r.w, r.h, 5); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
      const lab = L2('FETCH ', 'ΛΗΨΗ ') + tx(m.when); ctx.font = '700 9.5px ' + MONO; const lw = ctx.measureText(lab).width + 16; rr(r.x + 4, r.y + 4, lw, r.h - 8, 4); ctx.fillStyle = 'rgba(251,191,36,.16)'; ctx.fill(); text(lab, r.x + 12, r.y + r.h / 2 + 3.5, C.amber, '700 9.5px ' + MONO);
      if (!m.ticker.length) { text(L2('no record with a place in this fetch', 'καμία εγγραφή με θέση σε αυτή τη λήψη'), r.x + lw + 14, r.y + r.h / 2 + 3.5, C.mute, '10px ' + MONO, 1, r.w - lw - 24); return; }
      // the lines of the records of this fetch, running to the left; with reduced motion they stand still
      ctx.save(); ctx.beginPath(); ctx.rect(r.x + lw + 10, r.y + 1, r.w - lw - 14, r.h - 2); ctx.clip(); ctx.font = '10px ' + MONO; const gap = 26; let total = 0; const ws = m.ticker.map((t) => { const w2 = ctx.measureText(tx(t.text)).width + gap; total += w2; return w2; });
      const span = r.w - lw - 14, off = reduce.matches ? 0 : (amb * 0.045) % total; let x = r.x + lw + 14 - off; const y = r.y + r.h / 2 + 3.5;
      for (let pass = 0; pass < 3 && x < r.x + r.w; pass++) for (let i = 0; i < m.ticker.length && x < r.x + r.w; i++) { if (x + ws[i] > r.x + lw) { ctx.fillStyle = m.ticker[i].hue; ctx.fillRect(x, y - 7, 5, 5); ctx.fillStyle = '#cfe0f5'; ctx.fillText(tx(m.ticker[i].text), x + 9, y); } x += ws[i]; if (total < span && pass === 0 && i === m.ticker.length - 1 && reduce.matches) pass = 3; }
      ctx.restore();
    }
    function frame(now) {
      raf = 0; if (dead) return; const dt = lastNow ? Math.min(100, now - lastNow) : 0; lastNow = now; const dur = m.duration || 1;
      if (!paused && !reduce.matches) { amb += dt; if (T < dur) T += dt; else if (opts.loop && m.available) T = 0; } T = clamp(T, 0, dur);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      if (!m.available) { ctx.textAlign = 'center'; text(tx(m.empty), W / 2, H / 2, C.ink, '13px ' + MONO, 1, W - 30); ctx.textAlign = 'left'; return; }
      const S = D.at(m, T); drawTop(S); drawGround(); drawFlow(S); drawSources(S); drawCards(S);
      if (opts.loop && !reduce.matches && dur - T < 600) { ctx.fillStyle = C.bg; ctx.globalAlpha = 1 - c01((dur - T) / 600); ctx.fillRect(0, L.top, W, L.tick.y - L.top - 2); ctx.globalAlpha = 1; }   // the picture fades before it starts again
      drawTicker(S);
      if (opts.onTime) { try { opts.onTime(T, dur, !paused && (T < dur || !!opts.loop), S); } catch (e) { /* page handler */ } }
      if (document.hidden || reduce.matches || paused || (T >= dur && !opts.loop)) { lastNow = 0; return; } raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (Math.abs((host.clientWidth || 0) - W) > 2) { layout(); kick(); } }) : null; if (ro) ro.observe(host);
    const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);
    layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); if (reduce.matches) T = m.duration; kick();
    return { play() { paused = false; if (T >= m.duration) T = 0; lastNow = 0; kick(); }, pause(on) { paused = on !== false; lastNow = 0; kick(); }, replay() { T = 0; paused = false; lastNow = 0; kick(); }, seek(ms) { T = clamp(ms, 0, m.duration); lastNow = 0; if (raf) { cancelAnimationFrame(raf); raf = 0; } kick(); }, time: () => T, duration: () => m.duration, isPaused: () => paused,
      run(next) { if (!next) return; m = next; T = reduce.matches ? m.duration : 0; layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); lastNow = 0; kick(); },
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); } };
  }
  SC.viz.signals = { mount };
})();
