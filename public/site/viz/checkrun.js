/*
  checkrun.js: the Check run board. One canvas, one clock. It replays a RECORDED run of the site's widget tests: the runner
  hands work to one card per test file; the cards fold into a list; one dot appears for every check; the dots are graded
  (teal = passed, amber = failed, hatched grey = no result) and each file sends a marker into the pass gate, which counts the
  checks that passed. Four fact cards under the gate say what was run and when.
  SC.viz.checkrun.mount(host, model, { onTime }) -> { play, pause, replay, seek, time, duration, isPaused, phases, destroy }.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const C = { bg: '#02060d', pan: 'rgba(8,18,34,.94)', line: 'rgba(125,211,252,.22)', cyan: '#5fd4ff', amber: '#FBBF24', ink: '#EAF0F7', mute: '#7f93ad', teal: '#2dd4bf', white: '#ffffff', grey: 'rgba(140,155,178,.5)' };
  const HUES = ['#5fd4ff', '#a78bfa', '#f472b6', '#34D399', '#fb923c', '#facc15'];
  const PH = { cards: 0, fold: 3800, dots: 5600, grade: 9600, gate: 11600, hold: 14600, end: 18200 };
  const lg = () => (window.SC && SC.lang === 'el' ? 1 : 0), tx = (p) => (Array.isArray(p) ? p[lg()] : String(p == null ? '' : p));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), c01 = (v) => clamp(v, 0, 1), ease = (t) => { t = c01(t); return t * t * (3 - 2 * t); }, lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function mount(host, model, opts) {
    opts = opts || {};
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%'; host.textContent = ''; host.append(cv); host.setAttribute('role', 'img');
    const ctx = cv.getContext('2d'), m = model; let W = 0, H = 0, L = null, raf = 0, dead = false, paused = false, T = 0, amb = 0, lastNow = 0;
    const rr = (x, y, w, h, r) => { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    const fit = (s, w) => { if (ctx.measureText(s).width <= w) return s; while (s.length > 3 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
    const bez = (a, c1, c2, b, t) => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]; };
    const curve = (a, b) => { const dx = (b[0] - a[0]) * 0.5; return [a, [a[0] + dx, a[1]], [b[0] - dx, b[1]], b]; };
    const path = (q, col, al, lw, upto) => { ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = lw || 1; ctx.beginPath(); const n = upto == null || upto >= 1 ? 24 : Math.max(2, Math.round(24 * upto)), u = upto == null ? 1 : Math.min(1, upto); for (let k = 0; k <= n; k++) { const p = bez(q[0], q[1], q[2], q[3], u * k / n); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); ctx.globalAlpha = 1; };
    const dot = (p, r, col, al, glow) => { ctx.globalAlpha = al; ctx.fillStyle = col; if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; } ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; };
    const hue = (i) => HUES[i % HUES.length];

    function layout() {
      const w = Math.max(300, host.clientWidth || 320), n = m.files.length, wide = w >= 900, pad = wide ? 12 : 8, top = wide ? 50 : 84, o = { wide, pad, top, cards: [], rows: [] };
      const maxC = m.files.reduce((a, f) => Math.max(a, f.total), 1);
      if (wide) {
        const h = clamp(Math.round(w * 0.6), 680, 900), logH = 90, y0 = top + pad, y1 = h - pad - logH - 10, span = y1 - y0; W = w; H = h; o.log = { x: pad, y: h - pad - logH, w: w - pad * 2, h: logH };
        o.hub = { x: w * 0.065, y: y0 + span / 2, r: clamp(w * 0.028, 22, 36) };
        const cols = 3, per = Math.ceil(n / cols), ax = w * 0.125, aw = w * 0.44, cw = (aw - (cols - 1) * 8) / cols, ch = (span - (per - 1) * 5) / per;
        for (let i = 0; i < n; i++) o.cards.push({ x: ax + Math.floor(i / per) * (cw + 8), y: y0 + (i % per) * (ch + 5), w: cw, h: ch, col: Math.floor(i / per), row: i % per });
        const rh = span / n, lw = w * 0.15; for (let i = 0; i < n; i++) o.rows.push({ x: ax, y: y0 + i * rh + 1, w: lw, h: rh - 2 });
        o.field = { x: ax + lw + 10, w: w * 0.4 }; o.lines = Math.max(1, Math.min(3, Math.floor((rh - 4) / 4.5))); o.pitch = Math.max(3.2, Math.min(5.2, o.field.w / Math.ceil(maxC / o.lines)));
        o.gate = { x: w * 0.875, y: y0 + span * 0.3, r: clamp(w * 0.055, 48, 76) }; o.facts = { x: w * 0.79, y: y0 + span * 0.62, w: w * 0.21 - pad, h: span * 0.38 };
      } else {
        const cw = (w - pad * 2 - 6) / 2; let y = top + pad; W = w; o.hub = { x: w / 2, y: y + 26, r: 22 }; y += 62;
        const per = Math.ceil(n / 2), ch = 26; for (let i = 0; i < n; i++) o.cards.push({ x: pad + Math.floor(i / per) * (cw + 6), y: y + (i % per) * (ch + 4), w: cw, h: ch, col: Math.floor(i / per), row: i % per });
        const rh = 17, lw = w * 0.3; for (let i = 0; i < n; i++) o.rows.push({ x: pad, y: y + i * rh + 1, w: lw, h: rh - 2 }); o.field = { x: pad + lw + 6, w: w - pad * 2 - lw - 6 }; o.lines = 2; o.pitch = Math.max(2.4, Math.min(5, o.field.w / Math.ceil(maxC / 2)));
        y += Math.max(per * (ch + 4), n * rh) + 70; o.gate = { x: w / 2, y, r: 54 }; y += 74; o.facts = { x: pad, y, w: w - pad * 2, h: 128 }; y += 136; o.log = { x: pad, y, w: w - pad * 2, h: 100 }; H = y + 100 + pad;
      }
      L = o; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const cardIn = (i) => c01((T - (300 + L.cards[i].col * 900 + L.cards[i].row * 90)) / 300), fold = (i) => ease((T - PH.fold - i * 24) / 800);
    const dotsIn = (i) => c01((T - PH.dots - i * 70) / 1500), grade = (i) => c01((T - PH.grade - (m.files.length - 1 - i) * 30) / 800), mark = (i) => c01((T - PH.gate - i * 60) / 900);
    const rect = (i) => { const a = L.cards[i], b = L.rows[i], f = fold(i); return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), w: lerp(a.w, b.w, f), h: lerp(a.h, b.h, f), f }; };

    function drawTop() {
      const o = L, t = m.totals, ph = T < PH.fold ? (lg() ? 'ΑΝΑΘΕΣΗ' : 'HAND OUT') : T < PH.dots ? (lg() ? 'ΛΙΣΤΑ' : 'LIST') : T < PH.grade ? (lg() ? 'ΕΛΕΓΧΟΙ' : 'CHECKS') : T < PH.gate ? (lg() ? 'ΒΑΘΜΟΛΟΓΗΣΗ' : 'GRADING') : T < PH.hold ? (lg() ? 'ΠΥΛΗ' : 'GATE') : (lg() ? 'ΕΤΟΙΜΟ' : 'READY');
      const filesIn = m.files.filter((f, i) => cardIn(i) >= 1).length, shown = m.files.reduce((a, f, i) => a + Math.round(f.total * dotsIn(i)), 0), through = m.files.reduce((a, f, i) => a + (mark(i) >= 1 ? f.passed : 0), 0);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.ink; ctx.font = '700 ' + (o.wide ? 15 : 12) + 'px ' + MONO; ctx.fillText('checks / kleanthis', o.pad + 2, 20); ctx.fillStyle = C.mute; ctx.font = '10px ' + MONO; ctx.fillText(lg() ? 'καταγραμμένη εκτέλεση' : 'a recorded run', o.pad + 2, 36);
      const cells = [[lg() ? 'ΦΑΣΗ' : 'PHASE', ph, C.amber], [lg() ? 'ΑΡΧΕΙΑ' : 'FILES', filesIn + '/' + t.files, C.ink], [lg() ? 'ΕΛΕΓΧΟΙ' : 'CHECKS', String(shown), C.cyan], [lg() ? 'ΠΕΡΑΣΑΝ' : 'PASSED', String(through), C.teal]];
      const x0 = o.wide ? 210 : o.pad + 2, dy = o.wide ? 0 : 36, cw = (W - x0 - (o.wide ? 260 : o.pad)) / cells.length; cells.forEach((c, i) => { const x = x0 + i * cw; ctx.fillStyle = C.mute; ctx.font = '9px ' + MONO; ctx.fillText(c[0], x, 14 + dy); ctx.fillStyle = c[2]; ctx.font = '700 ' + (o.wide ? 15 : 12) + 'px ' + MONO; ctx.fillText(fit(c[1], cw - 8), x, 33 + dy); ctx.fillStyle = 'rgba(125,211,252,.25)'; ctx.fillRect(x, 39 + dy, cw - 10, 1.5); });
      if (o.wide) { ctx.textAlign = 'right'; ctx.fillStyle = C.amber; ctx.font = '700 10px ' + MONO; ctx.fillText(fit((lg() ? 'ΚΑΤΑΓΡΑΦΗ: ' : 'RECORDED: ') + tx(m.when), 250), W - o.pad - 2, 20); ctx.fillStyle = C.mute; ctx.font = '9.5px ' + MONO; ctx.fillText(lg() ? 'όχι εκτέλεση στον φυλλομετρητή σας' : 'not a run in your browser', W - o.pad - 2, 35); ctx.textAlign = 'left'; }
    }
    function drawHub() {
      const o = L, hub = o.hub, mv = !reduce.matches, g = ctx.createRadialGradient(hub.x, hub.y, 2, hub.x, hub.y, hub.r * 2.3); g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(1, 'rgba(95,212,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hub.x, hub.y, hub.r * 2.3, 0, 7); ctx.fill();
      m.files.forEach((f, i) => { const inn = cardIn(i); if (inn <= 0) return; const r = rect(i), q = o.wide ? curve([hub.x + hub.r, hub.y], [r.x, r.y + r.h / 2]) : [[hub.x, hub.y + hub.r], [hub.x, hub.y + hub.r + 20], [r.x + r.w / 2, r.y - 20], [r.x + r.w / 2, r.y]]; path(q, hue(i), (0.1 + 0.22 * (1 - r.f)) * inn, 1);
        if (mv && T < PH.dots) { const t = ((T / 1200) + rnd(i + 9)) % 1; dot(bez(q[0], q[1], q[2], q[3], t), 1.7, C.white, Math.sin(t * Math.PI) * inn * (1 - r.f * 0.5)); } });
      ctx.beginPath(); ctx.arc(hub.x, hub.y, hub.r, 0, 7); ctx.fillStyle = '#eef6ff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b2a4a'; ctx.font = '700 ' + Math.round(hub.r * 0.42) + 'px ' + MONO; ctx.textAlign = 'center'; ctx.fillText(lg() ? 'ΕΛΕΓΧ' : 'RUN', hub.x, hub.y + hub.r * 0.15); ctx.fillStyle = C.ink; ctx.font = '700 9px ' + MONO; ctx.fillText(lg() ? 'ΕΚΤΕΛΕΣΤΗΣ' : 'RUNNER', hub.x, hub.y + hub.r + 14);
      if (o.wide) { ctx.fillStyle = C.mute; ctx.font = '9px ' + MONO; [lg() ? 'κώδικας' : 'model code', lg() ? 'αρχεία δεδομένων' : 'data files', lg() ? 'ακραίες περιπτώσεις' : 'edge cases'].forEach((s, k) => ctx.fillText(fit(s, hub.r * 4), hub.x, hub.y - hub.r - 44 + k * 13)); }
      ctx.textAlign = 'left';
    }
    function drawFiles() {
      const o = L;
      m.files.forEach((f, i) => { const inn = cardIn(i); if (inn <= 0) return; const r = rect(i), col = hue(i), gr = grade(i), bad = f.state !== 'passed', done = gr >= 1;
        ctx.globalAlpha = inn; rr(r.x, r.y, r.w, r.h, lerp(5, r.h / 2, r.f)); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = done ? (bad ? C.amber : C.teal) : col; ctx.globalAlpha = inn * 0.75; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = inn;
        dot([r.x + Math.min(10, r.h / 2), r.y + r.h / 2], Math.min(3.6, r.h * 0.26), done ? (bad ? C.amber : C.teal) : col, inn);
        ctx.fillStyle = C.ink; ctx.font = '700 ' + clamp(Math.round(r.h * 0.5), 8, 11) + 'px ' + MONO; const cnt = f.known ? String(f.total) : '?'; ctx.textAlign = 'right'; ctx.fillStyle = C.mute; ctx.fillText(cnt, r.x + r.w - 7, r.y + r.h / 2 + 3.5); const cwid = ctx.measureText(cnt).width; ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText(fit(f.id, r.w - 30 - cwid), r.x + Math.min(10, r.h / 2) + 9, r.y + r.h / 2 + 3.5);
        if (r.f < 0.5 && r.h > 26) { ctx.globalAlpha = inn * (1 - r.f * 2); ctx.fillStyle = 'rgba(125,211,252,.12)'; ctx.fillRect(r.x + 8, r.y + r.h - 5, r.w - 16, 2); ctx.fillStyle = col; ctx.fillRect(r.x + 8, r.y + r.h - 5, (r.w - 16) * ease(inn), 2); }
        ctx.globalAlpha = 1;
        // one dot per check, in the row of its file; graded from the right
        const di = dotsIn(i); if (di <= 0 || !f.total) { if (di > 0 && !f.known) { const b = o.rows[i]; ctx.fillStyle = C.grey; ctx.font = '9px ' + MONO; ctx.fillText(lg() ? 'δεν καταγράφηκε αποτέλεσμα' : 'no result recorded', o.field.x, b.y + b.h / 2 + 3); } return; }
        const b = o.rows[i], per = Math.ceil(f.total / o.lines), nShow = Math.round(f.total * di), sz = Math.max(1.6, o.pitch - 1.4), y0 = b.y + (b.h - o.lines * (sz + 1.4)) / 2;
        for (let k = 0; k < nShow; k++) { const cx = k % per, ln = Math.floor(k / per), graded = gr >= 1 || gr > 1 - (cx + 1) / per, failedDot = k >= f.passed; ctx.fillStyle = !graded ? col : failedDot ? C.amber : C.teal; ctx.globalAlpha = !graded ? 0.55 : failedDot ? 1 : 0.9; ctx.fillRect(o.field.x + cx * o.pitch, y0 + ln * (sz + 1.4), sz, sz); }
        ctx.globalAlpha = 1; });
    }
    function drawGate() {
      const o = L, G = o.gate, n = m.files.length, on = c01((T - PH.gate + 500) / 500), t = m.totals; if (on <= 0) return; const mv = !reduce.matches; let through = 0;
      m.files.forEach((f, i) => { const b = o.rows[i], per = Math.ceil(Math.max(1, f.total) / o.lines), a = o.wide ? [o.field.x + Math.min(o.field.w, per * o.pitch) + 4, b.y + b.h / 2] : [b.x + b.w / 2, b.y + b.h], e = o.wide ? [G.x - G.r, G.y + (i / (n - 1 || 1) - 0.5) * G.r * 1.2] : [G.x + (i / (n - 1 || 1) - 0.5) * G.r * 1.4, G.y - G.r], q = o.wide ? curve(a, e) : [a, [a[0], a[1] + 40], [e[0], e[1] - 40], e], k = mark(i), ok = f.state === 'passed';
        path(q, ok ? C.teal : f.state === 'failed' ? C.amber : C.grey, (0.14 + 0.2 * c01(k * 2)) * on, 1, c01(k * 1.6));
        if (k >= 1) { through += f.passed; } else if (k > 0 && mv) dot(bez(q[0], q[1], q[2], q[3], ease(k)), 3, ok ? C.teal : C.amber, 1, 10); });
      ctx.globalAlpha = on; const g = ctx.createRadialGradient(G.x, G.y, 2, G.x, G.y, G.r * 1.6); g.addColorStop(0, 'rgba(45,212,191,.22)'); g.addColorStop(1, 'rgba(45,212,191,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(G.x, G.y, G.r * 1.6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(G.x, G.y, G.r, 0, 7); ctx.fillStyle = 'rgba(6,14,28,.94)'; ctx.fill(); ctx.strokeStyle = 'rgba(45,212,191,.4)'; ctx.lineWidth = 6; ctx.stroke();
      const frac = t.checks ? through / t.checks : 0; ctx.strokeStyle = C.teal; ctx.lineWidth = 6; ctx.shadowColor = C.teal; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(G.x, G.y, G.r, -Math.PI / 2, -Math.PI / 2 + frac * 6.283); ctx.stroke(); ctx.shadowBlur = 0;
      const doneAll = T >= PH.gate + (n - 1) * 60 + 900; ctx.textAlign = 'center'; ctx.fillStyle = C.ink; ctx.font = '700 ' + Math.round(G.r * 0.34) + 'px ' + MONO; ctx.fillText(String(through), G.x, G.y - 2); ctx.fillStyle = C.mute; ctx.font = '10px ' + MONO; ctx.fillText((lg() ? 'από ' : 'of ') + t.checks, G.x, G.y + 14);
      ctx.fillStyle = C.teal; ctx.font = '700 9.5px ' + MONO; ctx.fillText(lg() ? 'ΠΥΛΗ ΕΛΕΓΧΟΥ' : 'PASS GATE', G.x, G.y + G.r + 18);
      if (doneAll) { const k = reduce.matches ? 1 : c01((T - (PH.gate + (n - 1) * 60 + 900)) / 500); ctx.globalAlpha = on * k; ctx.fillStyle = t.failed || t.unknown ? C.amber : C.teal; ctx.font = '700 ' + Math.round(G.r * 0.3) + 'px ' + MONO; ctx.fillText((t.pct == null ? '–' : t.pct) + '%', G.x, G.y + G.r * 0.62); }
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
    function drawFacts() {
      const o = L, F = o.facts, t = m.totals, facts = [[lg() ? 'αρχεία ελέγχου' : 'test files', String(t.files), t.filesClean + (lg() ? ' χωρίς αποτυχία' : ' with no failure')], [lg() ? 'έλεγχοι' : 'checks', String(t.checks), t.failed ? t.failed + (lg() ? ' απέτυχαν' : ' failed') : (lg() ? 'κανένας δεν απέτυχε' : 'none failed')], [lg() ? 'καταγραφή' : 'recorded', tx(m.when).split(',')[0], (tx(m.when).split(',')[1] || '').trim()], [lg() ? 'έκδοση' : 'version', m.commit || '–', lg() ? 'του κώδικα' : 'of the code']];
      const cols = 2, gw = (F.w - 8) / cols, gh = Math.min(64, (F.h - 8) / 2);
      facts.forEach((f, k) => { const on = reduce.matches ? (T >= PH.hold ? 1 : 0) : c01((T - PH.hold - k * 180) / 350); if (on <= 0) return; const x = F.x + (k % cols) * (gw + 8), y = F.y + Math.floor(k / cols) * (gh + 8) + (1 - ease(on)) * 10; ctx.globalAlpha = on; rr(x, y, gw, gh, 5); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.mute; ctx.font = '8.5px ' + MONO; ctx.fillText(fit(f[0].toUpperCase(), gw - 14), x + 8, y + 14); ctx.fillStyle = C.ink; ctx.font = '700 ' + (gh > 50 ? 13 : 12) + 'px ' + MONO; if (ctx.measureText(f[1]).width > gw - 14) ctx.font = '700 10.5px ' + MONO; ctx.fillText(fit(f[1], gw - 14), x + 8, y + (gh > 50 ? 34 : 29)); ctx.fillStyle = C.teal; ctx.font = '9px ' + MONO; ctx.fillText(fit(f[2], gw - 14), x + 8, y + gh - 8); ctx.globalAlpha = 1; });
    }
    function drawLog() {
      const o = L, r = o.log, t = m.totals; rr(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = C.mute; ctx.font = '9px ' + MONO; ctx.fillText('// checks.log  ' + (lg() ? '(καταγραμμένη εκτέλεση)' : '(a recorded run)'), r.x + 12, r.y + 15);
      const bad = m.files.filter((f) => f.state !== 'passed');
      const lines = [[0, lg() ? 'ο εκτελεστής δίνει δουλειά σε ' + t.files + ' αρχεία ελέγχου' : 'the runner hands work to ' + t.files + ' test files'], [PH.dots, lg() ? 'κάθε τελεία είναι ένας έλεγχος: ' + t.checks + ' συνολικά' : 'every dot is one check: ' + t.checks + ' in all'], [PH.grade, bad.length ? (lg() ? 'δεν πέρασαν όλα: ' : 'not all clean: ') + bad.map((f) => f.id).join(', ') : (lg() ? 'βαθμολόγηση: κανένας έλεγχος δεν απέτυχε' : 'grading: no check failed')], [PH.hold, (lg() ? 'πέρασαν ' + t.passed + ' από ' + t.checks : t.passed + ' of ' + t.checks + ' passed') + ' (' + (t.pct == null ? '–' : t.pct) + '%)'], [PH.hold + 900, lg() ? 'έλεγχος που περνά δεν σημαίνει σωστά δεδομένα' : 'a passing check does not mean the data is right']];
      const lh = Math.min(14, (r.h - 24) / lines.length); ctx.font = (o.wide ? 10.5 : 9) + 'px ' + MONO;
      lines.forEach((ln, k) => { if (T < ln[0] + 150) return; const txt = String(k + 1).padStart(2, '0') + ' ' + ln[1], n = reduce.matches ? txt.length : Math.min(txt.length, Math.floor((T - ln[0] - 150) / 14)), newest = !lines[k + 1] || T < lines[k + 1][0] + 150; ctx.fillStyle = k === 2 && bad.length ? C.amber : newest ? C.white : '#9fb2cc'; ctx.fillText(fit(txt.slice(0, n) + (newest && n < txt.length ? '▌' : ''), r.w - 24), r.x + 12, r.y + 30 + k * lh); });
    }
    function frame(now) {
      raf = 0; if (dead) return; const dt = lastNow ? Math.min(100, now - lastNow) : 0; lastNow = now; if (!paused && !reduce.matches) { amb += dt; if (T < PH.end) T += dt; } T = clamp(T, 0, PH.end);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      if (!m.available) { ctx.fillStyle = C.ink; ctx.font = '13px ' + MONO; ctx.textAlign = 'center'; ctx.fillText(fit(tx(m.empty), W - 30), W / 2, H / 2); ctx.textAlign = 'left'; return; }
      drawTop(); drawHub(); drawGate(); drawFiles(); drawFacts(); drawLog();
      if (opts.onTime) { try { opts.onTime(T, PH.end, !paused && T < PH.end); } catch (e) { /* page handler */ } }
      if (document.hidden || reduce.matches || paused || T >= PH.end) { lastNow = 0; return; } raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (Math.abs((host.clientWidth || 0) - W) > 2) { layout(); kick(); } }) : null; if (ro) ro.observe(host);
    const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);
    layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); if (reduce.matches) T = PH.end; kick();
    return { play() { paused = false; if (T >= PH.end) T = 0; lastNow = 0; kick(); }, pause(on) { paused = on !== false; lastNow = 0; kick(); }, replay() { T = 0; paused = false; lastNow = 0; kick(); }, seek(ms) { T = clamp(ms, 0, PH.end); lastNow = 0; if (raf) { cancelAnimationFrame(raf); raf = 0; } kick(); }, time: () => T, duration: () => PH.end, isPaused: () => paused, phases: PH,
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); } };
  }
  SC.viz.checkrun = { mount, PH };
})();
