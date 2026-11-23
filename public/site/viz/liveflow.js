/*
  liveflow.js: the Live Board pipeline. One dense canvas board that plays one "run" for every fetch of the live feeds:
  feed by feed, the feed's dot grid fills (one dot per station or record in the answer), particles stream into the hub, the four
  stage clusters light, the sheet pill lights, the counter climbs, the reading card shows the newest reading and the log types
  a line. After the last feed the hub shows a tick and the card a summary; then the board idles until the next fetch.
  SC.viz.liveflow.mount(host, model, opts) -> { run(model), setNext(ms), pause(bool), destroy() }.
  Timings (a step 1.8 s, the finished state held 3.7 s) were measured from the owner's reference recording.
  Every number drawn comes from the model (liveflow-data.js). A feed that does not answer is drawn hatched and says so.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace', STEP = 1800, HOLD = 3700;
  const C = { bg: '#02060d', pan: 'rgba(8,18,34,.92)', line: 'rgba(125,211,252,.22)', cyan: '#5fd4ff', amber: '#FBBF24', ink: '#EAF0F7', mute: '#7f93ad', dim: 'rgba(120,140,170,.16)', green: '#34D399', red: '#f87171', violet: '#a78bfa' };
  const HUE = { cyan: C.cyan, green: C.green, red: C.red, violet: C.violet };
  const lg = () => (window.SC && SC.lang === 'el' ? 1 : 0), tx = (p) => (Array.isArray(p) ? p[lg()] : String(p == null ? '' : p));
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function mount(host, model, opts) {
    opts = opts || {};
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%'; host.textContent = ''; host.append(cv); host.setAttribute('role', 'img');
    const ctx = cv.getContext('2d');
    // ONE CLOCK: T is the run time in ms. Everything about the run (which feed is active, the grids, the counter, the card, the
    // log) is computed from T alone, so pause, replay and seek always bring every part back together. amb is the ambient clock
    // for the slow drift of the particles; it stops when the board is paused.
    let m = model, W = 0, H = 0, L = null, raf = 0, dead = false, paused = false, phase = 'idle', idx = -1, P = 1, T = 0, amb = 0, lastNow = 0, lastIdx = -2, shown = 0, nextAt = 0, runAt = 0, runs = 0;
    const CARD_DELAY = 440, CARD_FADE = 250;
    const total = () => m.feeds.length * STEP, dur = () => total() + HOLD;
    const hubPts = []; for (let i = 0; i < 1100; i++) hubPts.push({ r: Math.sqrt(rnd(i)) , a: rnd(i + 999) * 6.283, s: 0.5 + rnd(i + 5) * 1.6, w: rnd(i + 77) * 6.283 });
    const clPts = []; for (let i = 0; i < 70; i++) clPts.push({ r: Math.sqrt(rnd(i + 3000)), a: rnd(i + 4000) * 6.283, w: rnd(i + 5000) * 6.283 });

    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function panel(r, hot, col) { rr(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = hot ? (col || C.amber) : C.line; ctx.lineWidth = hot ? 1.6 : 1; if (hot) { ctx.shadowColor = col || C.amber; ctx.shadowBlur = 14; } ctx.stroke(); ctx.shadowBlur = 0; }
    function fit(s, w) { if (ctx.measureText(s).width <= w) return s; while (s.length > 3 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
    function wrap(s, w, max) { const out = []; let ln = ''; for (const word of String(s).split(' ')) { const t = ln ? ln + ' ' + word : word; if (ctx.measureText(t).width > w && ln) { out.push(ln); ln = word; if (out.length === max) break; } else ln = t; } if (out.length < max && ln) out.push(ln); else if (out.length === max) out[max - 1] = fit(out[max - 1] + ' …', w); return out; }
    const bez = (a, c1, c2, b, t) => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]; };

    function layout() {
      const w = Math.max(300, host.clientWidth || 320), n = m.feeds.length, wide = w >= 860, pad = wide ? 12 : 8, top = 46;
      const o = { wide, pad, top, cards: [], pills: [] };
      if (wide) {
        const h = clamp(Math.round(w * 0.6), 620, 880), cw = Math.round(w * 0.215), pw = Math.round(w * 0.2), ch = (h - top - pad * 2 - (n - 1) * 8) / n;
        for (let i = 0; i < n; i++) o.cards.push({ x: pad, y: top + pad + i * (ch + 8), w: cw, h: ch });
        const mx = pad + cw + 14, mw = w - mx - pw - pad - 14, logH = Math.round(h * 0.2), cardH = Math.round(h * 0.165), cntH = Math.round(h * 0.14);
        o.count = { x: mx, y: top + pad, w: mw, h: cntH };
        o.log = { x: mx + 18, y: h - pad - logH, w: mw - 18, h: logH };
        o.card = { x: mx, y: o.log.y - 8 - cardH, w: Math.round(mw * 0.86), h: cardH };
        const hubTop = o.count.y + cntH, hubBot = o.card.y; o.R = Math.min((hubBot - hubTop) * 0.36, mw * 0.2); o.cx = mx + mw * 0.36; o.cy = (hubTop + hubBot) / 2 + 4;
        const ph = Math.min(44, (h - top - pad * 2 - (n - 1) * 10) / n), py0 = top + pad + (h - top - pad * 2 - (n * ph + (n - 1) * 14)) / 2;
        for (let i = 0; i < n; i++) o.pills.push({ x: w - pad - pw, y: py0 + i * (ph + 14), w: pw, h: ph });
        W = w; H = h;
      } else {
        const cw = (w - pad * 2 - 8) / 2, ch = 112, rows = Math.ceil(n / 2); let y = top + pad;
        o.count = { x: pad, y, w: w - pad * 2, h: 84 }; y += 92;
        for (let i = 0; i < n; i++) o.cards.push({ x: pad + (i % 2) * (cw + 8), y: y + Math.floor(i / 2) * (ch + 8), w: cw, h: ch }); y += rows * (ch + 8) + 4;
        o.R = Math.min(92, w * 0.24); o.cx = w * 0.4; o.cy = y + o.R + 30; y = o.cy + o.R + 40;
        for (let i = 0; i < n; i++) o.pills.push({ x: pad + (i % 2) * (cw + 8), y: y + Math.floor(i / 2) * 44, w: cw, h: 36 }); y += rows * 44 + 6;
        o.card = { x: pad, y, w: w - pad * 2, h: 132 }; y += 140; o.log = { x: pad, y, w: w - pad * 2, h: 170 }; y += 178;
        W = w; H = y;
      }
      o.cl = [-39, -13, 13, 39].map((deg, k) => { const a = deg * Math.PI / 180, d = o.R * (wide ? (k === 0 || k === 3 ? 1.62 : 1.95) : 1.6); return { x: o.cx + Math.cos(a) * d, y: o.cy + Math.sin(a) * d, r: o.R * 0.27 }; });
      L = o; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // where the run is: p = progress of the current step (0..1); done(i) = feed i has been through
    const prog = () => (phase === 'step' ? P : 1);
    const done = (i) => phase === 'ready' || phase === 'idle' && runs > 0 || (phase === 'step' && i < idx);
    const cum = (k) => m.feeds.slice(0, k).reduce((s, f) => s + (f.available ? f.total : 0), 0);

    function drawTop(now) {
      const o = L; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.fillStyle = C.ink; ctx.font = '700 ' + (o.wide ? 15 : 13) + 'px ' + MONO; ctx.fillText('live / kleanthis', o.pad + 2, 20);
      ctx.fillStyle = C.mute; ctx.font = '10px ' + MONO; ctx.fillText(m.totals.feeds + ' ' + (lg() ? 'πηγές' : 'feeds') + ' · 4 ' + (lg() ? 'στάδια' : 'stages'), o.pad + 2, 35);
      const cells = [[lg() ? 'ΒΗΜΑ' : 'STEP', phase === 'step' ? String(idx + 1).padStart(2, '0') + '/' + String(m.feeds.length).padStart(2, '0') : runs ? (lg() ? 'ΕΤΟΙΜΟ' : 'READY') : '–', C.amber],
        [lg() ? 'ΕΓΓΡΑΦΕΣ' : 'RECORDS', String(Math.round(shown)), C.ink], [lg() ? 'ΝΕΕΣ' : 'NEW', String(m.totals.added), C.cyan],
        [lg() ? 'ΠΗΓΕΣ' : 'FEEDS', m.totals.answering + '/' + m.totals.feeds, m.totals.answering === m.totals.feeds ? C.green : C.amber]];
      if (o.wide) cells.push([lg() ? 'ΕΠΟΜΕΝΗ ΛΗΨΗ' : 'NEXT FETCH', nextAt ? Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)) + ' s' : '–', C.ink]);
      const x0 = o.wide ? 190 : 150, cw = (W - x0 - (o.wide ? 120 : 8)) / cells.length;
      cells.forEach((c, i) => { const x = x0 + i * cw; ctx.fillStyle = C.mute; ctx.font = '9px ' + MONO; ctx.fillText(c[0], x, 14); ctx.fillStyle = c[2]; ctx.font = '700 ' + (o.wide ? 15 : 12) + 'px ' + MONO; ctx.fillText(c[1], x, 33); ctx.fillStyle = 'rgba(125,211,252,.25)'; ctx.fillRect(x, 39, cw - 10, 1.5); });
      if (o.wide) { const demo = m.totals.demo, lab = demo ? (lg() ? 'ΔΟΚΙΜΑΣΤΙΚΕΣ ΤΙΜΕΣ' : 'TEST VALUES') : m.totals.answering ? (lg() ? 'ΖΩΝΤΑΝΑ' : 'LIVE') : (lg() ? 'ΧΩΡΙΣ ΑΠΑΝΤΗΣΗ' : 'NO ANSWER'), col = demo || !m.totals.answering ? C.amber : C.green;
        ctx.textAlign = 'right'; ctx.fillStyle = col; ctx.font = '700 11px ' + MONO; ctx.fillText(lab, W - o.pad - 2, 26); const tw = ctx.measureText(lab).width; ctx.beginPath(); ctx.arc(W - o.pad - tw - 12, 22, 4 + (reduce.matches || paused ? 0 : Math.sin(amb / 300) * 1.3), 0, 7); ctx.fill(); ctx.textAlign = 'left'; }
    }

    function drawCard(i, now) {
      const o = L, r = o.cards[i], f = m.feeds[i], act = phase === 'step' && idx === i, p = act ? prog() : done(i) ? 1 : 0, col = HUE[f.hue] || C.cyan;
      panel(r, act); ctx.textAlign = 'left';
      ctx.fillStyle = act ? C.amber : C.ink; ctx.font = '700 11px ' + MONO; ctx.fillText(fit(tx(f.name).toUpperCase(), r.w - 34), r.x + 10, r.y + 17);
      ctx.fillStyle = col; ctx.font = '9.5px ' + MONO; ctx.fillText(fit(tx(f.sub), r.w - 34), r.x + 10, r.y + 30);
      ctx.strokeStyle = act ? C.amber : col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(r.x + r.w - 14, r.y + 16, 5, 0, 7); ctx.stroke(); if (p >= 1 && f.available) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(r.x + r.w - 14, r.y + 16, 2.2, 0, 7); ctx.fill(); }
      // the dot grid: one cell per station or record (or per N when there are many)
      const gx = r.x + 10, gy = r.y + 38, gw = r.w - 20, gh = Math.max(24, r.h - 38 - 44), cols = o.wide ? 18 : 14, cell = gw / cols, rows = Math.max(2, Math.floor(gh / cell)), cap = cols * rows, per = Math.max(1, Math.ceil(f.total / cap)), cells = f.available ? Math.ceil(f.total / per) : 0;
      for (let k = 0; k < cap; k++) { const x = gx + (k % cols) * cell, y = gy + Math.floor(k / cols) * cell, s = cell - 2;
        let fill = C.dim;
        if (!f.available) fill = 'rgba(120,140,170,.07)';
        else if (k < cells) { const d = f.dots[Math.min(f.dots.length - 1, k * per)] || {}, reach = p * 1.25 - (k / cells) * 0.25;
          if (reach <= 0) fill = 'rgba(120,140,170,.22)';
          else if (reach < 0.5 && !reduce.matches) fill = rnd(k + Math.floor(T / 70)) > 0.45 ? C.amber : 'rgba(251,191,36,.25)';
          else fill = d.isNew ? C.amber : d.state === 'old' ? 'rgba(95,212,255,.25)' : col; }
        ctx.fillStyle = fill; ctx.fillRect(x, y, s, s); }
      // fragments: as the grid resolves, one bright fragment per lit cell leaves for the hub (the reading being sent)
      if (act && f.available && !reduce.matches) { const ex = o.wide ? r.x + r.w : r.x + r.w / 2, ey = o.wide ? r.y + r.h / 2 : r.y + r.h;
        for (let k = 0; k < cells; k++) { const start = 0.08 + (k / cells) * 0.34, q = (p - start) / 0.2; if (q <= 0 || q >= 1) continue; const x0 = gx + (k % cols) * cell + cell / 2, y0 = gy + Math.floor(k / cols) * cell + cell / 2, e2 = ease(q), bow = Math.sin(q * Math.PI) * (rnd(k + 40) - 0.5) * 26;
          ctx.fillStyle = k % 3 ? C.amber : '#fff'; ctx.globalAlpha = 1 - q * 0.5; ctx.fillRect(x0 + (ex - x0) * e2 - 1.5, y0 + (ey - y0) * e2 + bow - 1.5, 3, 3); } ctx.globalAlpha = 1; }
      if (!f.available) { ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, rows * cell); ctx.clip(); ctx.strokeStyle = 'rgba(160,175,195,.28)'; ctx.lineWidth = 1; ctx.beginPath(); for (let d = -gh; d < gw + gh; d += 8) { ctx.moveTo(gx + d, gy); ctx.lineTo(gx + d + rows * cell, gy + rows * cell); } ctx.stroke(); ctx.restore(); }
      const by = gy + rows * cell + 6, bw = r.w - 20 - 26;
      [[lg() ? 'φρ' : 'ok', f.available && f.total ? f.fresh / f.total : 0, col], [lg() ? 'νέα' : 'new', f.available && f.total ? f.added / f.total : 0, C.amber]].forEach((b, k) => { const y = by + k * 9; ctx.fillStyle = C.mute; ctx.font = '8px ' + MONO; ctx.fillText(b[0], r.x + 10, y + 6); ctx.fillStyle = 'rgba(125,211,252,.12)'; ctx.fillRect(r.x + 34, y, bw, 5); ctx.fillStyle = b[2]; ctx.fillRect(r.x + 34, y, bw * b[1] * p, 5); });
      ctx.font = '700 10.5px ' + MONO; ctx.fillStyle = f.available ? C.ink : C.amber;
      const cap1 = !f.available ? tx(f.reason) : p <= 0 ? (lg() ? 'σε αναμονή' : 'queued') : f.total + ' ' + tx(f.noun) + (per > 1 ? ' · ' + (lg() ? '1 κελί = ' : '1 cell = ') + per : '') + (f.added ? ' · ' + f.added + ' ' + (lg() ? 'νέες' : 'new') : '');
      ctx.fillText(fit(cap1, r.w - 20), r.x + 10, Math.min(r.y + r.h - 7, by + 30));
    }

    function drawPill(i, now) {
      const o = L, r = o.pills[i], f = m.feeds[i], act = phase === 'step' && idx === i && prog() > 0.45, dn = done(i), col = HUE[f.hue] || C.cyan;
      rr(r.x, r.y, r.w, r.h, r.h / 2); ctx.fillStyle = act ? 'rgba(251,191,36,.14)' : 'rgba(12,24,44,.95)'; ctx.fill(); ctx.strokeStyle = act ? C.amber : dn && f.available ? 'rgba(95,212,255,.55)' : C.line; ctx.lineWidth = act ? 1.8 : 1; if (act) { ctx.shadowColor = C.amber; ctx.shadowBlur = 16; } ctx.stroke(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(r.x + r.h / 2, r.y + r.h / 2, r.h * 0.26, 0, 7); ctx.strokeStyle = act ? C.amber : col; ctx.lineWidth = 1.2; ctx.stroke(); if (dn && f.available) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(r.x + r.h / 2, r.y + r.h / 2, r.h * 0.12, 0, 7); ctx.fill(); }
      const cnt = !f.available ? '–' : dn || act ? String(f.total) : ''; ctx.font = '700 11px ' + MONO; ctx.textAlign = 'right'; ctx.fillStyle = act ? C.amber : dn ? C.ink : C.mute; ctx.fillText(cnt, r.x + r.w - 12, r.y + r.h / 2 - 1); const cwid = ctx.measureText(cnt).width;
      ctx.textAlign = 'left'; ctx.fillStyle = act ? C.amber : dn ? C.ink : C.mute; ctx.fillText(fit(tx(f.sheet), r.w - r.h - cwid - 22), r.x + r.h, r.y + r.h / 2 - 1);
      const bw = r.w - r.h - 14, k = !f.available || !f.total ? 0 : (dn ? 1 : act ? ease((prog() - 0.45) / 0.5) : 0) * (f.fresh / f.total); ctx.fillStyle = 'rgba(125,211,252,.14)'; ctx.fillRect(r.x + r.h, r.y + r.h / 2 + 7, bw, 2.5); ctx.fillStyle = act ? C.amber : col; ctx.fillRect(r.x + r.h, r.y + r.h / 2 + 7, bw * k, 2.5);
    }

    function streams(now) {
      const o = L, mv = !reduce.matches && !paused;
      m.feeds.forEach((f, i) => { const c = o.cards[i], pl = o.pills[i], act = phase === 'step' && idx === i, p = act ? prog() : 0, col = HUE[f.hue] || C.cyan;
        const a = o.wide ? [c.x + c.w, c.y + c.h / 2] : [c.x + c.w / 2, c.y + c.h], b = [o.cx - o.R, o.cy], c1 = o.wide ? [a[0] + 46, a[1]] : [a[0], a[1] + 30], c2 = o.wide ? [b[0] - 60, b[1]] : [b[0] - 20, b[1] - 40];
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b[0], b[1]); ctx.strokeStyle = act ? C.amber : col; ctx.globalAlpha = !f.available ? 0.08 : act ? 0.75 : done(i) ? 0.3 : 0.14; ctx.lineWidth = act ? 1.6 : 1; ctx.stroke(); ctx.globalAlpha = 1;
        const k = Math.min(3, Math.max(0, Math.floor(p * 4))), cl = o.cl[act ? k : i % 4], e = o.wide ? [pl.x, pl.y + pl.h / 2] : [pl.x + pl.w / 2, pl.y], s = [cl.x + cl.r * 0.7, cl.y], d1 = [s[0] + 40, s[1]], d2 = o.wide ? [e[0] - 50, e[1]] : [e[0], e[1] - 30], lit = act && p > 0.45;
        ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.bezierCurveTo(d1[0], d1[1], d2[0], d2[1], e[0], e[1]); ctx.strokeStyle = lit ? C.amber : col; ctx.globalAlpha = !f.available ? 0.06 : lit ? 0.8 : done(i) ? 0.26 : 0.1; ctx.lineWidth = lit ? 1.6 : 1; ctx.stroke(); ctx.globalAlpha = 1;
        if (!f.available || !mv) return;
        const n = act ? 46 : done(i) ? 5 : 0, sp = act ? 1 / 900 : 1 / 5200;
        for (let q = 0; q < n; q++) { const t = ((act ? T : amb) * sp + rnd(q + i * 50)) % 1, pt = bez(a, c1, c2, b, t), jx = (rnd(q * 3 + i) - 0.5) * (act ? 9 : 2), jy = (rnd(q * 7 + i) - 0.5) * (act ? 9 : 2);
          ctx.fillStyle = act ? (q % 3 ? C.amber : '#fff') : col; ctx.globalAlpha = act ? 0.9 * Math.sin(t * Math.PI) * (p < 0.75 ? 1 : (1 - p) * 4) : 0.6; ctx.fillRect(pt[0] + jx * Math.sin(t * Math.PI), pt[1] + jy * Math.sin(t * Math.PI), act ? 2 : 1.5, act ? 2 : 1.5); }
        if (lit) for (let q = 0; q < 30; q++) { const t = (T / 800 + rnd(q + 900 + i)) % 1, pt = bez(s, d1, d2, e, t); ctx.fillStyle = q % 2 ? C.amber : '#fff'; ctx.globalAlpha = 0.9 * Math.sin(t * Math.PI); ctx.fillRect(pt[0], pt[1] + (rnd(q * 5) - 0.5) * 6 * Math.sin(t * Math.PI), 2, 2); }
        ctx.globalAlpha = 1;
        if (act) { // the travelling pulse: card to hub in the first part of the step, hub to cluster to pill in the second
          const leg1 = clamp(p / 0.42, 0, 1), leg2 = clamp((p - 0.5) / 0.4, 0, 1);
          const tail = (A, B1, B2, Bz, t, colr) => { for (let q = 0; q < 10; q++) { const tt = t - q * 0.018; if (tt <= 0 || tt >= 1) continue; const pt = bez(A, B1, B2, Bz, ease(tt)); ctx.fillStyle = q ? colr : '#fff'; ctx.globalAlpha = (1 - q / 10); ctx.shadowColor = colr; ctx.shadowBlur = q ? 0 : 14; ctx.beginPath(); ctx.arc(pt[0], pt[1], q ? 2.4 - q * 0.18 : 3.6, 0, 7); ctx.fill(); } ctx.shadowBlur = 0; ctx.globalAlpha = 1; };
          if (leg1 > 0 && leg1 < 1) tail(a, c1, c2, b, leg1, C.amber); if (leg2 > 0 && leg2 < 1) tail(s, d1, d2, e, leg2, C.amber);
        } });
    }

    function drawHub(now) {
      const o = L, tt = reduce.matches ? 0 : amb / 1000, act = phase === 'step', p = prog();
      // faint orbit swirls
      ctx.strokeStyle = 'rgba(125,211,252,.07)'; ctx.lineWidth = 1; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(o.cx, o.cy, o.R * (1.5 + k * 0.32), o.R * (1.15 + k * 0.26), 0.3 + k * 0.2 + tt * 0.02, 0, 6.283); ctx.stroke(); }
      // stage clusters
      o.cl.forEach((c, k) => { const on = phase === 'ready' || (phase === 'idle' && runs > 0) ? 0.55 : act ? clamp((p - 0.12 - k * 0.2) / 0.12, 0, 1) * (p > 0.12 + (k + 1) * 0.2 + 0.1 ? 0.6 : 1) : 0.12, col = k % 2 ? C.amber : C.cyan;
        ctx.beginPath(); ctx.moveTo(o.cx + Math.cos(Math.atan2(c.y - o.cy, c.x - o.cx)) * o.R, o.cy + Math.sin(Math.atan2(c.y - o.cy, c.x - o.cx)) * o.R); ctx.lineTo(c.x - c.r * 0.9, c.y); ctx.strokeStyle = col; ctx.globalAlpha = 0.15 + 0.5 * on; ctx.lineWidth = 1; ctx.stroke();
        ctx.globalAlpha = 0.25 + 0.75 * on; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 7); ctx.stroke();
        if (on > 0.5) { ctx.shadowColor = col; ctx.shadowBlur = 18; }
        for (const q of clPts) { const a = q.a + tt * 0.5 * (k % 2 ? -1 : 1), rr2 = q.r * c.r * 0.86; ctx.fillStyle = col; ctx.globalAlpha = (0.12 + 0.85 * on) * (0.5 + 0.5 * Math.sin(q.w + tt * 3)); ctx.fillRect(c.x + Math.cos(a) * rr2, c.y + Math.sin(a) * rr2, 1.6, 1.6); }
        ctx.shadowBlur = 0; ctx.globalAlpha = 0.45 + 0.55 * on; ctx.fillStyle = col; ctx.font = '700 9px ' + MONO; ctx.textAlign = 'left'; ctx.fillText(tx(m.stages[k]).toUpperCase(), c.x + c.r + 5, c.y + 3); ctx.globalAlpha = 1; });
      // the hub: a disc of particles; it is brighter the more of the feeds have come through
      const frac = m.totals.records ? shown / m.totals.records : 0, g = ctx.createRadialGradient(o.cx, o.cy, 2, o.cx, o.cy, o.R * 1.5); g.addColorStop(0, 'rgba(95,212,255,' + (0.1 + 0.16 * frac) + ')'); g.addColorStop(1, 'rgba(95,212,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R * 1.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R, 0, 7); ctx.fillStyle = 'rgba(6,14,28,.9)'; ctx.fill(); ctx.strokeStyle = act ? C.amber : C.cyan; ctx.lineWidth = 1.6; ctx.shadowColor = act ? C.amber : C.cyan; ctx.shadowBlur = 16; ctx.stroke(); ctx.shadowBlur = 0;
      const nDraw = Math.round(hubPts.length * (0.2 + 0.8 * frac)), swell = 0.74 + 0.16 * frac + (act ? 0.05 * Math.sin(clamp((p - 0.42) / 0.3, 0, 1) * Math.PI) : 0);
      for (let i = 0; i < nDraw; i++) { const q = hubPts[i], a = q.a + tt * (0.25 + (act ? 0.5 : 0)) * q.s, r = q.r * o.R * swell; ctx.fillStyle = i % 9 === 0 ? '#fff' : C.cyan; ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(q.w + tt * 2.2)); const s = i % 7 === 0 ? 2.6 : 1.7; ctx.fillRect(o.cx + Math.cos(a) * r, o.cy + Math.sin(a) * r * 0.96, s, s); }
      ctx.globalAlpha = 1;
      if (nextAt && (phase === 'ready' || phase === 'idle') && runAt) { const k = clamp((Date.now() - runAt) / Math.max(1, nextAt - runAt), 0, 1); ctx.strokeStyle = 'rgba(251,191,36,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R + 7, -Math.PI / 2, -Math.PI / 2 + k * 6.283); ctx.stroke(); }
      if (phase === 'ready' || (phase === 'idle' && runs > 0)) { const k = reduce.matches ? 1 : clamp((T - total()) / 350, 0, 1), r = o.R * 0.42; ctx.globalAlpha = k; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3, o.R * 0.06); ctx.lineCap = 'round'; ctx.shadowColor = C.cyan; ctx.shadowBlur = 16; ctx.beginPath(); ctx.moveTo(o.cx - r * 0.55, o.cy); ctx.lineTo(o.cx - r * 0.1, o.cy + r * 0.42); ctx.lineTo(o.cx + r * 0.62, o.cy - r * 0.42); ctx.stroke(); ctx.shadowBlur = 0; ctx.lineCap = 'butt'; ctx.globalAlpha = 1; }
      if (act && !reduce.matches) { const k = (p - 0.42) / 0.3; if (k > 0 && k < 1) { ctx.strokeStyle = 'rgba(251,191,36,' + (1 - k) + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R * (0.3 + 0.9 * ease(k)), 0, 7); ctx.stroke(); } } // the hub answers when the pulse arrives
      const lab = phase === 'step' ? tx(m.feeds[idx].name).toUpperCase() : runs ? (lg() ? 'ΕΤΟΙΜΟ' : 'READY') : (lg() ? 'ΑΝΑΜΟΝΗ' : 'WAITING'); ctx.font = '700 9.5px ' + MONO; ctx.textAlign = 'center'; const lw = ctx.measureText(lab).width + 16; rr(o.cx - lw / 2, o.cy + o.R + 6, lw, 16, 8); ctx.fillStyle = 'rgba(6,14,28,.95)'; ctx.fill(); ctx.strokeStyle = act ? C.amber : C.cyan; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = act ? C.amber : C.cyan; ctx.fillText(lab, o.cx, o.cy + o.R + 17.5);
      ctx.fillStyle = C.ink; ctx.font = '10px ' + MONO; ctx.fillText(Math.round(shown) + ' ' + (lg() ? 'εγγραφές' : 'records'), o.cx, o.cy + o.R + 36); ctx.textAlign = 'left';
    }

    function drawCount(now) {
      const o = L, r = o.count; panel(r, false); ctx.textAlign = 'left';
      ctx.fillStyle = C.mute; ctx.font = '9px ' + MONO; ctx.fillText(lg() ? 'ΣΤΑΘΜΟΙ ΚΑΙ ΕΓΓΡΑΦΕΣ ΣΕ ΑΥΤΗ ΤΗ ΛΗΨΗ' : 'STATIONS AND RECORDS IN THIS FETCH', r.x + 12, r.y + 15);
      const big = Math.min(46, r.h * 0.5); ctx.font = '700 ' + big + 'px ' + MONO; ctx.fillStyle = phase === 'step' ? C.ink : C.cyan; if (phase !== 'step') { ctx.shadowColor = C.cyan; ctx.shadowBlur = 12; } ctx.fillText(String(Math.round(shown)), r.x + 12, r.y + 18 + big); ctx.shadowBlur = 0;
      ctx.font = '10px ' + MONO; ctx.fillStyle = C.amber; ctx.fillText(m.totals.fresh + ' ' + (lg() ? 'φρέσκιες' : 'fresh') + ' · ' + m.totals.added + ' ' + (lg() ? 'νέες από την τελευταία λήψη' : 'new since the last fetch'), r.x + 12, r.y + r.h - 9);
      // the climb: cumulative records feed by feed
      const gx = r.x + r.w * 0.46, gw = r.w * 0.5, gy = r.y + 14, gh = r.h - 30, n = m.feeds.length, tot = Math.max(1, m.totals.records), upto = phase === 'step' ? idx + prog() : runs ? n : 0;
      ctx.strokeStyle = 'rgba(125,211,252,.12)'; ctx.lineWidth = 1; for (let k = 0; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(gx, gy + gh * k / 3); ctx.lineTo(gx + gw, gy + gh * k / 3); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(gx, gy + gh); let lx = gx, ly = gy + gh; for (let k = 1; k <= n; k++) { const part = clamp(upto - (k - 1), 0, 1); if (part <= 0) break; const y0 = gy + gh - gh * cum(k - 1) / tot, y1 = gy + gh - gh * cum(k) / tot; lx = gx + gw * (k - 1 + part) / n; ly = y0 + (y1 - y0) * part; ctx.lineTo(lx, ly); }
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.8; ctx.shadowColor = C.cyan; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0; ctx.lineTo(lx, gy + gh); ctx.closePath(); ctx.fillStyle = 'rgba(95,212,255,.12)'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = C.mute; ctx.font = '8.5px ' + MONO; ctx.textAlign = 'right'; ctx.fillText(lg() ? 'πηγή προς πηγή' : 'feed by feed', gx + gw, r.y + r.h - 6); ctx.textAlign = 'left';
    }

    function feedCard(i, p, al) {
      const o = L, r = o.card, f = m.feeds[i], k = Math.min(3, Math.floor(p * 4)); ctx.globalAlpha = al; ctx.textAlign = 'left';
      ctx.fillStyle = C.amber; ctx.font = '9px ' + MONO; ctx.fillText(tx(m.stages[k]).toUpperCase() + ' · ' + (lg() ? 'στάδιο ' : 'stage ') + (k + 1) + '/4', r.x + 12, r.y + 15);
      const tag = String(i + 1).padStart(2, '0') + '/' + String(m.feeds.length).padStart(2, '0'); ctx.font = '700 9px ' + MONO; const tw = ctx.measureText(tag).width + 12; rr(r.x + r.w - tw - 10, r.y + 6, tw, 14, 7); ctx.fillStyle = C.amber; ctx.fill(); ctx.fillStyle = '#1b1200'; ctx.fillText(tag, r.x + r.w - tw - 4, r.y + 16.5);
      ctx.fillStyle = C.ink; ctx.font = '700 ' + (o.wide ? 21 : 17) + 'px ' + MONO; ctx.fillText(fit(tx(f.name), r.w - 24), r.x + 12, r.y + 40);
      ctx.font = '10.5px ' + MONO; const lines = wrap(f.available ? (f.newest ? tx(f.newest.text) : f.total + ' ' + tx(f.noun)) : tx(f.reason), r.w - 24, Math.max(1, Math.floor((r.h - 78) / 14)));
      lines.forEach((ln, q) => { ctx.fillStyle = q === 0 ? C.amber : '#c6d3e6'; ctx.fillText(ln, r.x + 12, r.y + 58 + q * 14); });
      ctx.fillStyle = C.mute; ctx.font = '9px ' + MONO; ctx.fillText((lg() ? 'φύλλο: ' : 'sheet: ') + tx(f.sheet) + (f.demo ? ' · ' + (lg() ? 'δοκιμαστικές τιμές' : 'test values') : ''), r.x + 12, r.y + r.h - 16);
      ctx.fillStyle = 'rgba(125,211,252,.14)'; ctx.fillRect(r.x + 12, r.y + r.h - 9, r.w - 24, 3); ctx.fillStyle = C.cyan; ctx.fillRect(r.x + 12, r.y + r.h - 9, (r.w - 24) * p, 3); ctx.globalAlpha = 1;
    }
    function summaryCard(al) {
      const o = L, r = o.card; ctx.textAlign = 'left'; ctx.globalAlpha = al; ctx.fillStyle = C.cyan; ctx.font = '9px ' + MONO; ctx.fillText(lg() ? 'Η ΛΗΨΗ ΤΕΛΕΙΩΣΕ' : 'FETCH COMPLETE', r.x + 12, r.y + 15);
      ctx.fillStyle = C.ink; ctx.font = '700 30px ' + MONO; ctx.fillText(String(m.totals.answering) + '/' + m.totals.feeds, r.x + 12, r.y + 48); ctx.font = '10.5px ' + MONO; ctx.fillStyle = C.amber; ctx.fillText((lg() ? 'πηγές απάντησαν · ' : 'feeds answered · ') + m.totals.records + (lg() ? ' εγγραφές' : ' records'), r.x + 12, r.y + 66);
      const gx = r.x + Math.min(190, r.w * 0.4), cw = (r.x + r.w - 10 - gx) / Math.min(3, m.feeds.length), rh = (r.h - 16) / Math.ceil(m.feeds.length / 3);
      m.feeds.forEach((f, i) => { const x = gx + (i % 3) * cw, y = r.y + 8 + Math.floor(i / 3) * rh, show = reduce.matches ? 1 : clamp((T - total() - CARD_DELAY - i * 90) / 200, 0, 1); ctx.globalAlpha = al * show; ctx.strokeStyle = HUE[f.hue] || C.cyan; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + cw - 8, y + 2); ctx.stroke(); ctx.fillStyle = C.ink; ctx.font = '9px ' + MONO; ctx.fillText(fit(tx(f.name), cw - 10), x, y + 15); ctx.fillStyle = f.available ? (HUE[f.hue] || C.cyan) : C.amber; ctx.font = '700 11px ' + MONO; ctx.fillText(fit(f.available ? (f.kind === 'points' ? String(f.total) : f.fresh + '/' + f.total) : tx(f.reason), cw - 10), x, y + 30); });
      ctx.globalAlpha = 1;
    }
    // the card follows the highlight: it changes CARD_DELAY ms after a step starts and fades over CARD_FADE ms
    function drawDetail() {
      const o = L, r = o.card, fin = T >= total(), n = m.feeds.length; panel(r, true, fin && T - total() > CARD_DELAY ? C.cyan : C.amber);
      const since = fin ? T - total() : P * STEP, a = reduce.matches ? 1 : clamp((since - CARD_DELAY) / CARD_FADE, 0, 1), cur = fin ? n : idx, prev = cur - 1;
      if (a < 1) { if (prev >= 0) feedCard(prev, 1, 1 - a); else { ctx.globalAlpha = 1 - a; ctx.fillStyle = C.mute; ctx.font = '11px ' + MONO; ctx.textAlign = 'left'; ctx.fillText(lg() ? 'Η λήψη ξεκινά.' : 'The fetch is starting.', r.x + 12, r.y + 24); ctx.globalAlpha = 1; } }
      if (a > 0) { if (fin) summaryCard(a); else feedCard(cur, P, a); }
    }

    function drawLog() {
      const o = L, r = o.log, n = m.feeds.length, fin = T >= total(); panel(r, false); ctx.textAlign = 'left'; ctx.fillStyle = C.mute; ctx.font = '9px ' + MONO; ctx.fillText('// LIVE  fetch.log', r.x + 12, r.y + 15);
      ctx.textAlign = 'right'; ctx.fillText(!fin ? (lg() ? 'βήμα ' : 'step ') + String(idx + 1).padStart(2, '0') + '/' + String(n).padStart(2, '0') : (lg() ? 'έτοιμο' : 'ready'), r.x + r.w - 12, r.y + 15); ctx.textAlign = 'left';
      rr(r.x + 10, r.y + 22, r.w - 20, 18, 3); ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();
      const cmd = fin ? (lg() ? 'η λήψη τελείωσε · ' : 'fetch complete · ') + m.totals.answering + '/' + m.totals.feeds + (lg() ? ' πηγές · ' : ' feeds · ') + m.totals.records + (lg() ? ' εγγραφές' : ' records') : 'fetch ' + String(idx + 1).padStart(2, '0') + '/' + String(n).padStart(2, '0') + ' ' + m.feeds[idx].id + ' → ' + tx(m.feeds[idx].sheet).toLowerCase();
      const since = fin ? T - total() : P * STEP, shownN = reduce.matches ? cmd.length : Math.min(cmd.length, Math.floor(since / 16)); ctx.fillStyle = C.ink; ctx.font = '700 10.5px ' + MONO; ctx.fillText(fit('› ' + cmd.slice(0, shownN) + (!reduce.matches && !paused && Math.floor(amb / 400) % 2 ? '▌' : ''), r.w - 30), r.x + 16, r.y + 35);
      // one entry per feed, written a moment after its step starts (the event first, the card after)
      ctx.font = '10px ' + MONO; const maxLines = Math.floor((r.h - 50) / 13), rows = [];
      m.feeds.forEach((f, i) => { const at = i * STEP + 300; if (T < at) return; const ls = wrap(String(i + 1).padStart(2, '0') + ' ' + tx(f.line), r.w - 28, 3); ls.forEach((l, q) => rows.push({ t: (q ? '   ' : '') + l, at, warn: !f.available, newest: !fin && i === idx })); });
      rows.slice(-maxLines).forEach((row, i) => { ctx.fillStyle = row.warn ? C.amber : row.newest ? '#fff' : '#9fb2cc'; ctx.globalAlpha = reduce.matches ? 1 : clamp((T - row.at) / 350, 0, 1); ctx.fillText(row.t, r.x + 14, r.y + 54 + i * 13); }); ctx.globalAlpha = 1;
    }

    // everything about the run, from the clock alone
    function derive() {
      const n = m.feeds.length; T = clamp(T, 0, dur());
      if (T < n * STEP) { phase = 'step'; idx = Math.min(n - 1, Math.floor(T / STEP)); P = clamp((T - idx * STEP) / STEP, 0, 1); runs = 0; } else { phase = T < dur() ? 'ready' : 'idle'; idx = n - 1; P = 1; runs = 1; }
      shown = phase === 'step' ? cum(idx) + (m.feeds[idx].available ? m.feeds[idx].total : 0) * ease(clamp(P / 0.55, 0, 1)) : m.totals.records;
      const key = phase === 'step' ? idx : -1; if (key !== lastIdx) { lastIdx = key; if (opts.onStep) { try { opts.onStep(key < 0 ? { index: -1, feed: null, label: m.ariaLabel } : { index: key, feed: m.feeds[key], label: m.feeds[key].line }); } catch (e) { /* page handler */ } } }
    }

    function frame(now) {
      raf = 0; if (dead) return; const dt = lastNow ? Math.min(100, now - lastNow) : 0; lastNow = now;
      if (!paused && !reduce.matches) { amb += dt; if (T < dur()) T += dt; }
      derive();
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      drawTop(now); streams(now); drawHub(now); m.feeds.forEach((f, i) => drawCard(i, now)); m.feeds.forEach((f, i) => drawPill(i, now)); drawCount(now); drawDetail(); drawLog();
      if (opts.onTime) { try { opts.onTime(T, dur(), !paused && T < dur()); } catch (e) { /* page handler */ } }
      if (document.hidden) { lastNow = 0; return; }
      if (reduce.matches || paused) { lastNow = 0; if (nextAt && !dead) setTimeout(kick, 1000); return; } // a still board; only the countdown text is refreshed
      raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
    function run(model) {
      m = model || m; layout(); runAt = Date.now(); lastIdx = -2; host.setAttribute('aria-label', tx(m.ariaLabel));
      T = reduce.matches ? dur() : 0; kick();
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (Math.abs((host.clientWidth || 0) - W) > 2) { layout(); kick(); } }) : null; if (ro) ro.observe(host);
    const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);
    layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); if (opts.autorun !== false) run(m); else kick();
    return { run, setNext(ms) { nextAt = ms; kick(); }, pause(on) { paused = !!on; lastNow = 0; kick(); },
      play() { paused = false; if (T >= dur()) T = 0; lastNow = 0; kick(); }, replay() { T = 0; paused = false; lastIdx = -2; lastNow = 0; kick(); },
      seek(ms) { T = clamp(ms, 0, dur()); lastNow = 0; if (raf) { cancelAnimationFrame(raf); raf = 0; } derive(); kick(); }, time: () => T, duration: () => dur(), stepMs: STEP, isPaused: () => paused,
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); } };
  }
  SC.viz.liveflow = { mount, STEP, HOLD };
})();
