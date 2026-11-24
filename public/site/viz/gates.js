/*
  gates.js: the Data Gates board. One canvas, one clock. Five stacked cards on the left hold the sources of the site (one bar per
  source); a routing column carries them to a grid of gates, one tile per check. The gates light up one after the other: the
  active tile gets a bright header, its wires glow, packets travel, and one cell per checked source fills in with the status the
  server reported (filled = passed, ring = warning, cross = failed). The last tile adds everything up; the strip below names the
  warnings and failures and the tools and pages that use the checked data.
  The order is a walk-through for watching: the server reports all gates together. The numbers are the reported ones.
  SC.viz.gates.mount(host, model, { onTime }) -> { play, pause, replay, seek, time, duration, isPaused, update(model), destroy }.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const C = { bg: '#030712', pan: 'rgba(9,18,36,.95)', pan2: 'rgba(14,28,52,.95)', line: 'rgba(125,211,252,.2)', cyan: '#5fd4ff', amber: '#FBBF24', ink: '#EAF0F7', mute: '#7f93ad', teal: '#2dd4bf', rose: '#fb7185', white: '#ffffff', grey: 'rgba(140,155,178,.55)' };
  const GH = { official: '#5fd4ff', own: '#34D399', model: '#a78bfa', context: '#facc15', extract: '#f472b6' };
  const lg = () => (window.SC && SC.lang === 'el' ? 1 : 0), tx = (p) => (Array.isArray(p) ? p[lg()] : String(p == null ? '' : p)), L2 = (en, el) => (lg() ? el : en);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), c01 = (v) => clamp(v, 0, 1), ease = (t) => { t = c01(t); return t * t * (3 - 2 * t); };
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const SCOL = { pass: C.teal, warn: C.amber, fail: C.rose, unknown: C.grey };

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.gatesData, reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%'; host.textContent = ''; host.append(cv); host.setAttribute('role', 'img');
    const ctx = cv.getContext('2d'); let m = model, W = 0, H = 0, L = null, raf = 0, dead = false, paused = false, T = 0, amb = 0, lastNow = 0;
    const rr = (x, y, w, h, r) => { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    const fit = (s, w) => { s = String(s); if (ctx.measureText(s).width <= w) return s; while (s.length > 2 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
    const bez = (q, t) => { const u = 1 - t; return [u * u * u * q[0][0] + 3 * u * u * t * q[1][0] + 3 * u * t * t * q[2][0] + t * t * t * q[3][0], u * u * u * q[0][1] + 3 * u * u * t * q[1][1] + 3 * u * t * t * q[2][1] + t * t * t * q[3][1]]; };
    const stroke = (q, col, al, lw) => { ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.bezierCurveTo(q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]); ctx.stroke(); ctx.globalAlpha = 1; };
    const text = (s, x, y, col, font, al, maxW) => { ctx.font = font; ctx.fillStyle = col; if (al != null) ctx.globalAlpha = al; ctx.fillText(maxW ? fit(s, maxW) : s, x, y); ctx.globalAlpha = 1; };

    function layout() {
      const w = Math.max(300, host.clientWidth || 320), wide = w >= 900, pad = wide ? 12 : 8, o = { wide, pad, cards: [], ports: [], tiles: [] }, ng = m.gates.length, nG = m.groups.length || 1;
      if (wide) {
        const top = 52, botH = 132, h = clamp(Math.round(w * 0.62), 720, 900), y0 = top + 8, y1 = h - pad - botH - 10; W = w; H = h;
        const cw = w * 0.185, cx = pad, total = m.items.length || 1, gap = 7, avail = y1 - y0 - gap * (nG - 1); let y = y0;
        m.groups.forEach((g) => { const hh = Math.max(64, avail * (0.11 + 0.45 * g.items.length / total)); o.cards.push({ x: cx, y, w: cw, h: hh }); y += hh + gap; });
        const sc = (y1 - y0) / (y - gap - y0); o.cards.forEach((c) => { c.y = y0 + (c.y - y0) * sc; c.h *= sc; });
        o.route = { x0: cx + cw, x1: w * 0.275 };
        const gx = o.route.x1, cols = 4, rows = Math.ceil((ng + 1) / cols), tg = 8, tw = (w - pad - gx - tg * (cols - 1)) / cols, th = (y1 - y0 - tg * (rows - 1)) / rows;
        for (let k = 0; k < ng; k++) o.tiles.push({ x: gx + (k % cols) * (tw + tg), y: y0 + Math.floor(k / cols) * (th + tg), w: tw, h: th });
        const rc = ng % cols, rrw = Math.floor(ng / cols); o.result = { x: gx + rc * (tw + tg), y: y0 + rrw * (th + tg), w: (cols - rc) * tw + (cols - rc - 1) * tg, h: th };
        const by = h - pad - botH; o.log = { x: pad, y: by, w: w * 0.6 - pad, h: botH }; o.uses = { x: w * 0.6 + 8, y: by, w: w * 0.4 - pad - 8, h: botH }; o.top = top;
      } else {
        const top = 86; let y = top + 6; W = w; const cw = w - pad * 2;
        m.groups.forEach(() => { o.cards.push({ x: pad, y, w: cw, h: 46 }); y += 52; }); y += 6; o.route = null;
        const cols = 2, tg = 6, tw = (cw - tg) / 2, th = 86; for (let k = 0; k < ng; k++) o.tiles.push({ x: pad + (k % cols) * (tw + tg), y: y + Math.floor(k / cols) * (th + tg), w: tw, h: th });
        const rw = Math.ceil(ng / cols); o.result = { x: pad, y: y + rw * (th + tg), w: cw, h: 104 };
        y += rw * (th + tg) + 104 + tg + 6; o.log = { x: pad, y, w: cw, h: 150 }; y += 158; o.uses = { x: pad, y, w: cw, h: 128 }; y += 128 + pad; H = y; o.top = top;
      }
      // one port per source on the right edge of its card (wide) and one bar per source inside the card
      m.groups.forEach((g, gi) => { const c = o.cards[gi], n = g.items.length; g.items.forEach((ii, k) => { o.ports[ii] = { x: c.x + c.w, y: c.y + 10 + (c.h - 20) * (n === 1 ? 0.5 : k / (n - 1)), card: gi, k, n }; }); });
      L = o; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const wire = (ii, gi) => { const p = L.ports[ii], t = L.tiles[gi], a = [p.x, p.y], b = [t.x, t.y + 14 + (t.h - 28) * rnd(ii * 7 + gi)], mx = (L.route.x0 + L.route.x1) / 2; return [a, [mx, a[1]], [mx, b[1]], b]; };

    function drawTop(S) {
      const o = L, t = m.totals, g = S.active >= 0 ? m.gates[S.active] : null, ph = g ? tx(g.n) : S.result ? L2('ALL GATES REPORTED', 'ΟΛΕΣ ΟΙ ΠΥΛΕΣ') : S.done >= t.gates ? L2('ADDING UP', 'ΑΘΡΟΙΣΗ') : S.done ? L2('NEXT GATE', 'ΕΠΟΜΕΝΗ ΠΥΛΗ') : L2('SOURCES ARRIVE', 'ΟΙ ΠΗΓΕΣ ΦΤΑΝΟΥΝ');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; text('gates / kleanthis', o.pad + 2, 20, C.ink, '700 ' + (o.wide ? 15 : 12) + 'px ' + MONO); text(L2('reported at ', 'αναφορά ') + tx(m.when), o.pad + 2, 36, C.mute, '10px ' + MONO);
      const cells = [[L2('GATE', 'ΠΥΛΗ'), (S.active >= 0 ? (S.active + 1) : S.done) + '/' + t.gates, C.ink], [L2('CHECKS', 'ΕΛΕΓΧΟΙ'), S.checks + '/' + t.checks, C.cyan], [L2('PASSED', 'ΠΕΡΑΣΑΝ'), String(S.pass), C.teal], [L2('WARNINGS', 'ΠΡΟΕΙΔ.'), String(S.warn), C.amber], [L2('FAILED', 'ΑΠΕΤΥΧΑΝ'), String(S.fail), C.rose]];
      const x0 = o.wide ? 200 : o.pad + 2, dy = o.wide ? 0 : 38, cw = (W - x0 - (o.wide ? W * 0.3 : o.pad)) / cells.length;
      cells.forEach((c, i) => { const x = x0 + i * cw; text(c[0], x, 14 + dy, C.mute, '9px ' + MONO); text(c[1], x, 33 + dy, c[2], '700 ' + (o.wide ? 15 : 11) + 'px ' + MONO, null, cw - 8); ctx.fillStyle = 'rgba(125,211,252,.22)'; ctx.fillRect(x, 39 + dy, cw - 10, 1.5); });
      if (o.wide) { ctx.textAlign = 'right'; ctx.font = '700 10.5px ' + MONO; text(ph.toUpperCase(), W - o.pad - 2, 20, C.amber, '700 10.5px ' + MONO, null, W * 0.28); text(L2('walk-through: the gates are reported together', 'περιήγηση: οι πύλες αναφέρονται μαζί'), W - o.pad - 2, 35, C.mute, '9.5px ' + MONO); ctx.textAlign = 'left'; }
    }
    function drawCards(S) {
      const o = L, act = S.active >= 0 ? m.gates[S.active] : null, hot = {}; if (act) act.cells.slice(0, S.shown[S.active] + 1).forEach((c) => { hot[c.item] = 1; });
      m.groups.forEach((g, gi) => { const c = o.cards[gi], col = GH[g.id] || C.cyan, inn = reduce.matches ? 1 : c01((T - gi * 140) / 400); ctx.globalAlpha = inn; rr(c.x, c.y, c.w, c.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = col; ctx.fillRect(c.x, c.y + 6, 2.5, c.h - 12);
        text(tx(g.name), c.x + 10, c.y + 15, C.ink, '700 10.5px ' + MONO, inn, c.w - 46); ctx.textAlign = 'right'; text(String(g.items.length), c.x + c.w - 8, c.y + 15, col, '700 11px ' + MONO, inn); ctx.textAlign = 'left';
        const sub = g.saved ? g.saved + L2(' files', ' αρχεία') : g.live + L2(' answering', ' απαντούν') + (g.quiet ? ', ' + g.quiet + L2(' not answering', ' δεν απαντούν') : ''); text(sub, c.x + 10, c.y + 28, C.mute, '9px ' + MONO, inn, c.w - 18);
        // one bar per source: height = how many gates it faces; a source that is not answering is an empty outline, never a zero bar
        const n = g.items.length, bx = c.x + 10, bw = c.w - 22, by = c.y + c.h - 7, bh = Math.max(6, c.h - 44), slot = Math.min(16, bw / n), maxC = 8;
        if (c.h > 44) g.items.forEach((ii, k) => { const it = m.items[ii], hgt = Math.max(3, bh * Math.min(1, it.checks / maxC)), x = bx + k * slot, wB = Math.max(2, slot - 2), on = hot[ii];
          if (it.state === 'quiet') { ctx.strokeStyle = on ? C.white : C.grey; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.strokeRect(x + 0.5, by - hgt + 0.5, wB - 1, hgt - 1); ctx.setLineDash([]); }
          else { ctx.fillStyle = on ? C.white : col; ctx.globalAlpha = inn * (on ? 1 : 0.6); ctx.fillRect(x, by - hgt, wB, hgt); ctx.globalAlpha = inn; } });
        ctx.globalAlpha = 1; });
    }
    function drawWires(S) {
      const o = L; if (!o.route) return; const mv = !reduce.matches;
      // the column itself
      ctx.fillStyle = 'rgba(125,211,252,.035)'; ctx.fillRect((o.route.x0 + o.route.x1) / 2 - 9, o.cards[0].y, 18, o.cards[o.cards.length - 1].y + o.cards[o.cards.length - 1].h - o.cards[0].y);
      m.gates.forEach((g) => { const done = S.shown[g.i] >= g.total && S.active !== g.i, active = S.active === g.i; if (active) return; g.cells.forEach((c, k) => { if (k % 2 && !done) return; stroke(wire(c.item, g.i), done ? SCOL[c.status] : '#9fb2cc', done ? 0.1 : 0.045, 1); }); });
      if (S.active >= 0) { const g = m.gates[S.active], n = S.shown[g.i]; g.cells.forEach((c, k) => { const q = wire(c.item, g.i), on = k < n; stroke(q, on ? SCOL[c.status] : C.cyan, on ? 0.55 : 0.2, on ? 1.2 : 1);
        if (mv) { const t = ((amb / 700) + rnd(c.item + k * 3)) % 1, p = bez(q, t); ctx.globalAlpha = Math.sin(t * Math.PI); ctx.fillStyle = C.white; ctx.shadowColor = C.cyan; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(p[0], p[1], 1.9, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; } });
        m.groups.forEach((gr, gi) => { /* ports */ gr.items.forEach((ii) => { const p = o.ports[ii]; ctx.fillStyle = GH[gr.id]; ctx.globalAlpha = 0.8; ctx.fillRect(p.x - 1, p.y - 1, 3, 2); ctx.globalAlpha = 1; }); }); }
    }
    function cellMark(x, y, s, st) { if (st === 'pass') { ctx.fillStyle = C.teal; ctx.fillRect(x, y, s, s); } else if (st === 'warn') { ctx.strokeStyle = C.amber; ctx.lineWidth = 1.4; ctx.strokeRect(x + 0.7, y + 0.7, s - 1.4, s - 1.4); ctx.fillStyle = C.amber; ctx.fillRect(x + s / 2 - 1, y + s / 2 - 1, 2, 2); } else if (st === 'fail') { ctx.fillStyle = 'rgba(251,113,133,.25)'; ctx.fillRect(x, y, s, s); ctx.strokeStyle = C.rose; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + s - 1, y + s - 1); ctx.moveTo(x + s - 1, y + 1); ctx.lineTo(x + 1, y + s - 1); ctx.stroke(); } else { ctx.strokeStyle = C.grey; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1); ctx.setLineDash([]); } }
    function drawTiles(S) {
      const o = L;
      m.gates.forEach((g) => { const t = o.tiles[g.i], n = S.shown[g.i], active = S.active === g.i, done = n >= g.total && !active, inn = reduce.matches ? 1 : c01((T - 300 - g.i * 50) / 350); ctx.globalAlpha = inn;
        rr(t.x, t.y, t.w, t.h, 6); ctx.fillStyle = active ? C.pan2 : C.pan; ctx.fill(); ctx.strokeStyle = active ? C.cyan : done ? 'rgba(45,212,191,.35)' : C.line; ctx.lineWidth = active ? 1.6 : 1; if (active) { ctx.shadowColor = C.cyan; ctx.shadowBlur = 14; } ctx.stroke(); ctx.shadowBlur = 0;
        const hh = o.wide ? 20 : 18; ctx.save(); rr(t.x, t.y, t.w, t.h, 6); ctx.clip(); ctx.fillStyle = active ? C.cyan : 'rgba(125,211,252,.07)'; ctx.fillRect(t.x, t.y, t.w, hh); ctx.restore();
        text(String(g.i + 1).padStart(2, '0') + ' ' + tx(g.n), t.x + 7, t.y + hh - 6, active ? '#04202f' : done ? C.ink : C.mute, '700 ' + (o.wide ? 10 : 9) + 'px ' + MONO, inn, t.w - 14);
        text(tx(g.kind) + ', ' + g.total + L2(' sources', ' πηγές'), t.x + 7, t.y + hh + 13, C.mute, '9px ' + MONO, inn, t.w - 14);
        // one cell per checked source
        const ax = t.x + 7, ay = t.y + hh + 20, aw = t.w - 14, ah = t.h - hh - 20 - 24, per = Math.max(1, Math.ceil(Math.sqrt(g.total * aw / Math.max(10, ah)))), s = clamp(Math.min(aw / per, ah / Math.ceil(g.total / per)) - 2, 3, 15);
        for (let k = 0; k < g.total; k++) { const x = ax + (k % per) * (s + 2), y = ay + Math.floor(k / per) * (s + 2); if (k < n) cellMark(x, y, s, g.cells[k].status); else { ctx.fillStyle = 'rgba(125,211,252,.08)'; ctx.fillRect(x, y, s, s); } }
        // progress bar and the count so far
        const py = t.y + t.h - 14, f = g.total ? n / g.total : 0; ctx.fillStyle = 'rgba(125,211,252,.12)'; ctx.fillRect(t.x + 7, py, t.w - 14, 3); ctx.fillStyle = active ? C.cyan : g.fail ? C.rose : g.warn ? C.amber : C.teal; ctx.fillRect(t.x + 7, py, (t.w - 14) * f, 3);
        if (n > 0) { let p = 0, w2 = 0, fl = 0; for (let k = 0; k < n; k++) { const st = g.cells[k].status; if (st === 'pass') p++; else if (st === 'warn') w2++; else if (st === 'fail') fl++; } ctx.textAlign = 'right'; ctx.font = '9px ' + MONO; let x = t.x + t.w - 7; const seg = (v, col, mark) => { if (!v) return; const s2 = mark + v; ctx.fillStyle = col; ctx.fillText(s2, x, py - 3); x -= ctx.measureText(s2).width + 7; }; seg(fl, C.rose, '×'); seg(w2, C.amber, '!'); seg(p, C.teal, '✓'); ctx.textAlign = 'left'; }
        ctx.globalAlpha = 1; });
      // the result tile
      const R = o.result, t = m.totals, on = reduce.matches ? (S.result ? 1 : 0.35) : 0.35 + 0.65 * ease((T - m.resultAt) / 500); ctx.globalAlpha = on; rr(R.x, R.y, R.w, R.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = S.result ? C.teal : C.line; ctx.lineWidth = S.result ? 1.6 : 1; ctx.stroke();
      text(L2('ALL GATES', 'ΟΛΕΣ ΟΙ ΠΥΛΕΣ'), R.x + 10, R.y + 16, C.mute, '700 9.5px ' + MONO, on);
      const big = Math.round(clamp(R.h * 0.3, 18, 34)); text(S.checks + ' / ' + t.checks, R.x + 10, R.y + 20 + big, C.ink, '700 ' + big + 'px ' + MONO, on); text(L2('checks counted', 'έλεγχοι μετρήθηκαν'), R.x + 10, R.y + 34 + big, C.mute, '9.5px ' + MONO, on);
      const bx = R.x + 10, bw = R.w - 20, by = R.y + R.h - 30; ctx.fillStyle = 'rgba(125,211,252,.1)'; ctx.fillRect(bx, by, bw, 6); let x = bx; [['pass', S.pass], ['warn', S.warn], ['fail', S.fail]].forEach((p) => { const w2 = t.checks ? bw * p[1] / t.checks : 0; ctx.fillStyle = SCOL[p[0]]; ctx.fillRect(x, by, w2, 6); x += w2; });
      ctx.font = '700 10px ' + MONO; let lx = bx; [[C.teal, '✓ ' + S.pass + L2(' passed', ' πέρασαν')], [C.amber, '! ' + S.warn + L2(' warnings', ' προειδ.')], [C.rose, '× ' + S.fail + L2(' failed', ' απέτυχαν')]].forEach((p) => { if (lx + ctx.measureText(p[1]).width > bx + bw) return; ctx.fillStyle = p[0]; ctx.fillText(p[1], lx, by + 20); lx += ctx.measureText(p[1]).width + 14; }); ctx.globalAlpha = 1;
    }
    function drawBottom(S) {
      const o = L, r = o.log, u = o.uses;
      rr(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke(); text('// gates.log  ' + (o.wide ? L2('(warnings and failures, as reported)', '(προειδοποιήσεις και αποτυχίες, όπως αναφέρθηκαν)') : L2('(as reported)', '(όπως αναφέρθηκαν)')), r.x + 12, r.y + 15, C.mute, '9px ' + MONO);
      // an issue appears when its gate has finished; the newest lines stay in view
      const seen = m.issues.filter((x) => x.gate >= 0 && S.shown[x.gate] >= m.gates[x.gate].total && S.active !== x.gate), lh = 13, rows = Math.max(2, Math.floor((r.h - 26) / lh)), list = seen.slice(-rows);
      if (!seen.length) text(S.result ? L2('no warning and no failure was reported', 'δεν αναφέρθηκε προειδοποίηση ή αποτυχία') : L2('waiting for the first gate to finish', 'αναμονή για την πρώτη πύλη'), r.x + 12, r.y + 32, '#9fb2cc', '10px ' + MONO);
      list.forEach((x, k) => { const mark = x.status === 'fail' ? '×' : '!', col = x.status === 'fail' ? C.rose : C.amber, y = r.y + 32 + k * lh; text(mark, r.x + 12, y, col, '700 10px ' + MONO); text(tx(x.name) + ': ' + tx(x.check) + (x.note ? '. ' + tx(x.note) : ''), r.x + 26, y, k === list.length - 1 ? C.white : '#9fb2cc', (o.wide ? 10 : 9) + 'px ' + MONO, null, r.w - 40); });
      if (seen.length > rows) { ctx.textAlign = 'right'; text('+' + (seen.length - rows) + L2(' earlier', ' προηγούμενα'), r.x + r.w - 10, r.y + 15, C.mute, '9px ' + MONO); ctx.textAlign = 'left'; }
      rr(u.x, u.y, u.w, u.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke(); text(L2('WHAT USES THE CHECKED DATA', 'ΤΙ ΧΡΗΣΙΜΟΠΟΙΕΙ ΤΑ ΕΛΕΓΜΕΝΑ ΔΕΔΟΜΕΝΑ'), u.x + 12, u.y + 15, C.mute, '700 9px ' + MONO);
      let x = u.x + 12, y = u.y + 24; ctx.font = '9.5px ' + MONO; const chip = (s, col, k) => { const on = reduce.matches ? (S.result ? 1 : 0.3) : 0.3 + 0.7 * c01((T - m.resultAt - 300 - k * 110) / 300), w2 = Math.min(u.w - 24, ctx.measureText(s).width + 14); if (x + w2 > u.x + u.w - 10) { x = u.x + 12; y += 20; } if (y + 16 > u.y + u.h - 4) return; ctx.globalAlpha = on; rr(x, y, w2, 16, 8); ctx.fillStyle = 'rgba(125,211,252,.06)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = C.ink; ctx.fillText(fit(s, w2 - 12), x + 7, y + 11.5); ctx.globalAlpha = 1; x += w2 + 6; };
      m.builders.forEach((b, k) => chip(tx(b.n), C.cyan, k)); x = u.x + 12; y += 24; m.pages.forEach((p, k) => chip(tx(p.n), C.teal, m.builders.length + k));
    }
    function frame(now) {
      raf = 0; if (dead) return; const dt = lastNow ? Math.min(100, now - lastNow) : 0; lastNow = now; const dur = m.duration || 1; if (!paused && !reduce.matches) { amb += dt; if (T < dur) T += dt; } T = clamp(T, 0, dur);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      if (!m.available) { ctx.textAlign = 'center'; text(fit(tx(m.empty), W - 30), W / 2, H / 2, C.ink, '13px ' + MONO); ctx.textAlign = 'left'; return; }
      const S = D.at(m, T); drawTop(S); drawWires(S); drawCards(S); drawTiles(S); drawBottom(S);
      if (opts.onTime) { try { opts.onTime(T, dur, !paused && T < dur, S); } catch (e) { /* page handler */ } }
      if (document.hidden || reduce.matches || paused || T >= dur) { lastNow = 0; return; } raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (Math.abs((host.clientWidth || 0) - W) > 2) { layout(); kick(); } }) : null; if (ro) ro.observe(host);
    const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);
    layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); if (reduce.matches) T = m.duration; kick();
    return { play() { paused = false; if (T >= m.duration) T = 0; lastNow = 0; kick(); }, pause(on) { paused = on !== false; lastNow = 0; kick(); }, replay() { T = 0; paused = false; lastNow = 0; kick(); }, seek(ms) { T = clamp(ms, 0, m.duration); lastNow = 0; if (raf) { cancelAnimationFrame(raf); raf = 0; } kick(); }, time: () => T, duration: () => m.duration, isPaused: () => paused,
      update(next) { if (!next || !next.available) return; const frac = m.duration ? T / m.duration : 0, same = next.gates.length === m.gates.length; m = next; if (!same) T = 0; else T = Math.min(T, m.duration); void frac; layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); kick(); },
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); } };
  }
  SC.viz.gates = { mount };
})();
