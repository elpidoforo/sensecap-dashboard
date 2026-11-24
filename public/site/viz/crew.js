/*
  crew.js: the AI at Work board. One canvas, one clock. Left: what goes into a Council session (the question, the data brief, what
  never goes in, the daily limit). A routing column carries it to a grid of nine tiles: the AI role-play seats, the Chair, the
  teacher and the published sessions. Below: the run log and the background helpers with their state now.
  The run is a WALK-THROUGH of how one session goes, as written in the site's code; it is not a session happening now and no
  answer is shown (a seat tile lists which fields it hands back, not values). Live on the board: whether the Council room is on,
  the sessions left today, the number of published sessions and the state of each helper.
  SC.viz.crew.mount(host, model, { onTime }) -> { play, pause, replay, seek, time, duration, isPaused, update(model), destroy }.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const C = { bg: '#030712', pan: 'rgba(9,18,36,.95)', pan2: 'rgba(14,28,52,.95)', line: 'rgba(125,211,252,.2)', cyan: '#5fd4ff', amber: '#FBBF24', ink: '#EAF0F7', mute: '#7f93ad', teal: '#2dd4bf', rose: '#fb7185', white: '#ffffff', grey: 'rgba(140,155,178,.6)', violet: '#a78bfa' };
  const IN = ['#5fd4ff', '#34D399', '#fb7185', '#facc15'];
  const lg = () => (window.SC && SC.lang === 'el' ? 1 : 0), tx = (p) => (Array.isArray(p) ? p[lg()] : String(p == null ? '' : p)), L2 = (en, el) => (lg() ? el : en);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), c01 = (v) => clamp(v, 0, 1), ease = (t) => { t = c01(t); return t * t * (3 - 2 * t); };
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const HCOL = { ok: C.teal, late: C.amber, error: C.rose, off: C.grey, unknown: C.grey }, HMARK = { ok: '●', late: '!', error: '×', off: '○', unknown: '?' };

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.crewData, reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%'; host.textContent = ''; host.append(cv); host.setAttribute('role', 'img');
    const ctx = cv.getContext('2d'); let m = model, W = 0, H = 0, L = null, raf = 0, dead = false, paused = false, T = 0, amb = 0, lastNow = 0;
    const rr = (x, y, w, h, r) => { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    const fit = (s, w) => { s = String(s); if (ctx.measureText(s).width <= w) return s; while (s.length > 2 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
    const text = (s, x, y, col, font, al, maxW) => { ctx.font = font; ctx.fillStyle = col; if (al != null) ctx.globalAlpha = al; ctx.fillText(maxW ? fit(s, maxW) : s, x, y); ctx.globalAlpha = 1; };
    // words wrapped into at most `rows` lines
    const wrap = (s, x, y, w, lh, rows, col, font) => { ctx.font = font; ctx.fillStyle = col; const words = String(s).split(' '); let line = '', n = 0; for (let k = 0; k < words.length; k++) { const t = line ? line + ' ' + words[k] : words[k]; if (ctx.measureText(t).width > w && line) { if (n === rows - 1) { ctx.fillText(fit(line + ' ' + words.slice(k).join(' '), w), x, y + n * lh); return n + 1; } ctx.fillText(line, x, y + n * lh); n++; line = words[k]; } else line = t; } if (line) { ctx.fillText(fit(line, w), x, y + n * lh); n++; } return n; };
    const bez = (q, t) => { const u = 1 - t; return [u * u * u * q[0][0] + 3 * u * u * t * q[1][0] + 3 * u * t * t * q[2][0] + t * t * t * q[3][0], u * u * u * q[0][1] + 3 * u * u * t * q[1][1] + 3 * u * t * t * q[2][1] + t * t * t * q[3][1]]; };
    const stroke = (q, col, al, lw) => { ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.bezierCurveTo(q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]); ctx.stroke(); ctx.globalAlpha = 1; };
    const packet = (q, seed, col, n) => { if (reduce.matches) return; for (let k = 0; k < (n || 1); k++) { const t = ((amb / 900) + rnd(seed + k * 5)) % 1, p = bez(q, t); ctx.globalAlpha = Math.sin(t * Math.PI); ctx.fillStyle = C.white; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; } };

    function layout() {
      const w = Math.max(300, host.clientWidth || 320), wide = w >= 900, pad = wide ? 12 : 8, o = { wide, pad, cards: [], seats: [] }, nS = m.seats.length, nI = m.inputs.length;
      if (wide) {
        const top = 52, botH = 148, h = clamp(Math.round(w * 0.62), 720, 900), y0 = top + 8, y1 = h - pad - botH - 10; W = w; H = h;
        const cw = w * 0.2, gap = 8, ch = (y1 - y0 - gap * (nI - 1)) / nI; for (let k = 0; k < nI; k++) o.cards.push({ x: pad, y: y0 + k * (ch + gap), w: cw, h: ch });
        o.route = { x0: pad + cw, x1: w * 0.285 };
        const gx = o.route.x1, cols = 3, sRows = Math.max(1, Math.ceil(nS / cols)), tg = 9, tw = (w - pad - gx - tg * (cols - 1)) / cols, th = (y1 - y0 - tg * sRows) / (sRows + 1);
        for (let k = 0; k < nS; k++) o.seats.push({ x: gx + (k % cols) * (tw + tg), y: y0 + Math.floor(k / cols) * (th + tg), w: tw, h: th });
        const ly = y0 + sRows * (th + tg); o.chair = { x: gx, y: ly, w: tw, h: th }; o.teacher = { x: gx + tw + tg, y: ly, w: tw, h: th }; o.pub = { x: gx + 2 * (tw + tg), y: ly, w: tw, h: th };
        const by = h - pad - botH; o.log = { x: pad, y: by, w: w * 0.55 - pad, h: botH }; o.help = { x: w * 0.55 + 8, y: by, w: w * 0.45 - pad - 8, h: botH };
      } else {
        let y = 92; W = w; const cw = w - pad * 2; for (let k = 0; k < nI; k++) { o.cards.push({ x: pad, y, w: cw, h: 62 }); y += 68; } y += 4; o.route = null;
        const tg = 6, tw = (cw - tg) / 2, th = 150; for (let k = 0; k < nS; k++) o.seats.push({ x: pad + (k % 2) * (tw + tg), y: y + Math.floor(k / 2) * (th + tg), w: tw, h: th }); y += Math.ceil(nS / 2) * (th + tg);
        o.chair = { x: pad, y, w: cw, h: 84 }; y += 90; o.teacher = { x: pad, y, w: cw, h: 84 }; y += 90; o.pub = { x: pad, y, w: cw, h: 84 }; y += 94;
        o.log = { x: pad, y, w: cw, h: 214 }; y += 222; o.help = { x: pad, y, w: cw, h: 34 + m.helpers.length * 30 }; y += o.help.h + pad; H = y;
      }
      L = o; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const fromCard = (ci, t, fy) => { const c = L.cards[ci], a = [c.x + c.w, c.y + c.h / 2], b = [t.x, t.y + t.h * (fy == null ? 0.5 : fy)], mx = (L.route.x0 + L.route.x1) / 2; return [a, [mx, a[1]], [mx, b[1]], b]; };
    const tileBox = (t, active, done, inn) => { ctx.globalAlpha = inn; rr(t.x, t.y, t.w, t.h, 6); ctx.fillStyle = active ? C.pan2 : C.pan; ctx.fill(); ctx.strokeStyle = active ? C.cyan : done ? 'rgba(45,212,191,.45)' : C.line; ctx.lineWidth = active ? 1.6 : 1; if (active) { ctx.shadowColor = C.cyan; ctx.shadowBlur = 14; } ctx.stroke(); ctx.shadowBlur = 0; const hh = 20; ctx.save(); rr(t.x, t.y, t.w, t.h, 6); ctx.clip(); ctx.fillStyle = active ? C.cyan : done ? 'rgba(45,212,191,.16)' : 'rgba(125,211,252,.07)'; ctx.fillRect(t.x, t.y, t.w, hh); ctx.restore(); ctx.globalAlpha = 1; return hh; };
    const bar = (t, f, col) => { const py = t.y + t.h - 11; ctx.fillStyle = 'rgba(125,211,252,.12)'; ctx.fillRect(t.x + 8, py, t.w - 16, 3); ctx.fillStyle = col; ctx.fillRect(t.x + 8, py, (t.w - 16) * c01(f), 3); };

    function drawTop(S) {
      const o = L, c = m.council, st = m.steps[S.step];
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; text('ai-at-work / kleanthis', o.pad + 2, 20, C.ink, '700 ' + (o.wide ? 15 : 12) + 'px ' + MONO); text(L2('a walk-through, with the state now', 'περιήγηση, με την τωρινή κατάσταση'), o.pad + 2, 36, C.mute, '10px ' + MONO);
      const room = !c.known ? ['–', C.grey] : c.on ? [L2('ON', 'ΑΝΟΙΧΤΗ'), C.teal] : [L2('RESTING', 'ΣΕ ΠΑΥΣΗ'), C.amber], pub = m.published;
      const cells = [[L2('STEP', 'ΒΗΜΑ'), (S.step + 1) + '/' + m.steps.length + ' ' + tx(st.n), C.amber], [L2('COUNCIL ROOM', 'ΑΙΘΟΥΣΑ'), room[0], room[1]], [L2('LEFT TODAY', 'ΑΠΟΜΕΝΟΥΝ'), c.remaining == null ? '–' : c.remaining + '/' + c.limit, C.ink], [L2('PUBLISHED', 'ΔΗΜΟΣΙΕΥΜ.'), !pub.known ? '–' : pub.n + (pub.capped ? '+' : ''), C.cyan], [L2('HELPERS', 'ΒΟΗΘΟΙ'), m.helpers.length ? m.helpersOk + '/' + m.helpers.length : '–', C.teal]];
      const x0 = o.wide ? 250 : o.pad + 2, dy = o.wide ? 0 : 40, cw = (W - x0 - (o.wide ? W * 0.24 : o.pad)) / cells.length;
      cells.forEach((cl, i) => { const x = x0 + i * cw; text(cl[0], x, 14 + dy, C.mute, '9px ' + MONO, null, cw - 6); text(cl[1], x, 33 + dy, cl[2], '700 ' + (o.wide ? 14 : 10.5) + 'px ' + MONO, null, cw - 8); ctx.fillStyle = 'rgba(125,211,252,.22)'; ctx.fillRect(x, 39 + dy, cw - 10, 1.5); });
      if (o.wide) { ctx.textAlign = 'right'; text(L2('WALK-THROUGH', 'ΠΕΡΙΗΓΗΣΗ'), W - o.pad - 2, 20, C.amber, '700 10.5px ' + MONO); text(L2('not a session happening now', 'όχι συνεδρία που γίνεται τώρα'), W - o.pad - 2, 35, C.mute, '9.5px ' + MONO); ctx.textAlign = 'left'; }
    }
    function drawCards(S) {
      const o = L, hot = [S.id === 'ask', S.id === 'brief' || S.id === 'seats', S.id === 'brief', S.id === 'ask'];
      m.inputs.forEach((inp, k) => { const c = o.cards[k], col = IN[k % IN.length], inn = reduce.matches ? 1 : c01((T + 500 - k * 120) / 400), on = hot[k]; ctx.globalAlpha = inn; rr(c.x, c.y, c.w, c.h, 6); ctx.fillStyle = on ? C.pan2 : C.pan; ctx.fill(); ctx.strokeStyle = on ? col : C.line; ctx.lineWidth = on ? 1.5 : 1; ctx.stroke(); ctx.fillStyle = col; ctx.fillRect(c.x, c.y + 6, 2.5, c.h - 12); ctx.globalAlpha = 1;
        text(tx(inp.name), c.x + 10, c.y + 16, C.ink, '700 10.5px ' + MONO, inn, c.w - 20); let y = c.y + 30; inp.lines.forEach((ln) => { y += 12 * wrap(tx(ln), c.x + 10, y, c.w - 20, 12, 2, C.mute, '9.5px ' + MONO); });
        const gy = Math.max(y + 2, c.y + c.h - 30), gw = c.w - 20, gx = c.x + 10; if (gy + 16 > c.y + c.h) return;
        if (inp.id === 'question') { /* a line being typed: bars only, no words */ const f = S.id === 'ask' ? S.ask : 1; ctx.fillStyle = 'rgba(125,211,252,.1)'; ctx.fillRect(gx, gy + 4, gw, 5); ctx.fillStyle = col; ctx.globalAlpha = 0.75; ctx.fillRect(gx, gy + 4, gw * 0.8 * f, 5); ctx.globalAlpha = 1; text(L2('no question is shown here', 'εδώ δεν φαίνεται καμία ερώτηση'), gx, gy + 22, C.mute, '8.5px ' + MONO, 0.8, gw); }
        else if (inp.id === 'brief') { /* slots for the readings: outlines, a sweep while the brief is built */ const n = m.wired.maxReadings, per = 24, s = Math.min(8, gw / per - 1.5), f = S.id === 'brief' ? S.brief : T >= m.phases.seats ? 1 : 0; for (let i = 0; i < n; i++) { const x = gx + (i % per) * (s + 1.5), yy = gy + Math.floor(i / per) * (s + 1.5); ctx.strokeStyle = i / n < f ? col : 'rgba(125,211,252,.2)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, yy + 0.5, s - 1, s - 1); } }
        else if (inp.id === 'rules') { /* three struck-out slots */ [L2('position', 'θέση'), L2('device', 'συσκευή'), L2('0.123456', '0,123456')].forEach((s, i) => { const x = gx + i * (gw / 3); text(s, x, gy + 12, C.grey, '9px ' + MONO, null, gw / 3 - 6); const tw = Math.min(gw / 3 - 6, ctx.measureText(s).width); ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x - 1, gy + 9); ctx.lineTo(x + tw + 1, gy + 9); ctx.stroke(); }); }
        else if (inp.id === 'limits' && m.council.limit != null) { /* live: one pip per session of the daily limit, filled = still left */ const n = Math.min(12, m.council.limit), left = m.council.remaining == null ? 0 : m.council.remaining; for (let i = 0; i < n; i++) { const x = gx + i * 18; ctx.beginPath(); ctx.arc(x + 6, gy + 8, 5.5, 0, 7); if (m.council.remaining != null && i < left) { ctx.fillStyle = col; ctx.fill(); } else { ctx.strokeStyle = m.council.remaining == null ? C.grey : col; ctx.lineWidth = 1.2; ctx.stroke(); } } text(L2('live', 'ζωντανά'), gx + n * 18 + 6, gy + 12, C.teal, '700 8.5px ' + MONO); } });
    }
    function drawWires(S) {
      const o = L; if (!o.route) return; const P = m.phases;
      ctx.fillStyle = 'rgba(125,211,252,.035)'; ctx.fillRect((o.route.x0 + o.route.x1) / 2 - 9, o.cards[0].y, 18, o.cards[o.cards.length - 1].y + o.cards[o.cards.length - 1].h - o.cards[0].y);
      const seatsOn = S.id === 'seats', after = T >= P.seats;
      m.seats.forEach((s, i) => { const t = o.seats[i]; [0, 1].forEach((ci) => { const q = fromCard(ci, t, ci ? 0.62 : 0.38), live = seatsOn && S.seat[i] < 1; stroke(q, live ? IN[ci] : '#9fb2cc', live ? 0.5 : after ? 0.1 : 0.05, live ? 1.2 : 1); if (live) packet(q, i * 9 + ci, IN[ci], 2); }); });
      if (S.id === 'ask') { const q = fromCard(0, o.seats[0], 0.38); stroke(q, IN[0], 0.2 + 0.4 * S.ask, 1.2); packet(q, 1, IN[0], 1); }
      if (S.id === 'brief') { const q = fromCard(1, o.seats[0], 0.62); stroke(q, IN[1], 0.2 + 0.4 * S.brief, 1.2); packet(q, 2, IN[1], 2); }
      // seats to the Chair, the Chair to the teacher, the teacher to the published sessions
      const ch = o.chair, te = o.teacher, pb = o.pub, chairOn = S.id === 'chair';
      m.seats.forEach((s, i) => { const t = o.seats[i], a = [t.x + t.w / 2, t.y + t.h], b = [ch.x + ch.w * (0.2 + 0.6 * (i + 0.5) / m.seats.length), ch.y], q = [a, [a[0], a[1] + 30], [b[0], b[1] - 30], b], done = T >= s.doneAt; if (!done) return; stroke(q, chairOn ? C.violet : C.teal, chairOn ? 0.6 : 0.16, chairOn ? 1.3 : 1); if (chairOn) packet(q, 40 + i, C.violet, 1); });
      const link = (a, b, on, done, seed) => { const p0 = [a.x + a.w, a.y + a.h / 2], p1 = [b.x, b.y + b.h / 2], q = [p0, [p0[0] + 6, p0[1]], [p1[0] - 6, p1[1]], p1]; stroke(q, on ? C.cyan : C.teal, on ? 0.9 : done ? 0.4 : 0.1, on ? 2 : 1.2); if (on) packet(q, seed, C.cyan, 1); };
      link(ch, te, S.id === 'teacher' || S.id === 'draft', T >= P.publish, 60); link(te, pb, S.id === 'publish', S.done, 61);
    }
    function drawTiles(S) {
      const o = L, P = m.phases;
      m.seats.forEach((s, i) => { const t = o.seats[i], f = S.seat[i], active = S.id === 'seats' && f < 1, done = T >= s.doneAt, inn = reduce.matches ? 1 : c01((T + 300 - i * 60) / 350), hh = tileBox(t, active, done, inn);
        text(tx(s.name), t.x + 8, t.y + hh - 6, active ? '#04202f' : done ? C.ink : C.mute, '700 10.5px ' + MONO, inn, t.w - 70); ctx.textAlign = 'right'; text(L2('AI role-play', 'ρόλος ΤΝ'), t.x + t.w - 8, t.y + hh - 6, active ? '#04202f' : C.mute, '8.5px ' + MONO, inn); ctx.textAlign = 'left';
        if (s.focus) text(tx(s.focus), t.x + 8, t.y + hh + 14, C.mute, '9.5px ' + MONO, inn, t.w - 16);
        // "writing": bars that grow, never words
        const wy = t.y + hh + 24, rows = o.wide ? 3 : 2; for (let k = 0; k < rows; k++) { const full = (t.w - 16) * (0.55 + 0.4 * rnd(i * 5 + k)), ff = c01(f * rows - k); ctx.fillStyle = 'rgba(125,211,252,.08)'; ctx.fillRect(t.x + 8, wy + k * 8, t.w - 16, 4); ctx.fillStyle = done ? 'rgba(45,212,191,.55)' : C.cyan; ctx.globalAlpha = inn * 0.8; ctx.fillRect(t.x + 8, wy + k * 8, full * ff, 4); ctx.globalAlpha = 1; }
        // the fields a seat hands back, lit one after the other (names of fields, not values)
        let fy = wy + rows * 8 + 12; const maxRows = Math.floor((t.y + t.h - 16 - fy) / 12) + 1; m.fields.slice(0, Math.max(0, maxRows)).forEach((fd, k) => { const on = f >= (k + 1) / (m.fields.length + 0.2); text((on ? '✓ ' : '· ') + tx(fd.n), t.x + 8, fy, on ? (done ? C.teal : C.ink) : 'rgba(127,147,173,.55)', '9px ' + MONO, inn, t.w - 16); fy += 12; });
        bar(t, f, done ? C.teal : C.cyan); });
      // the Chair
      { const t = o.chair, active = S.id === 'chair', done = T >= P.draft, hh = tileBox(t, active, done, 1); text(L2('Chair', 'Προεδρείο'), t.x + 8, t.y + hh - 6, active ? '#04202f' : done ? C.ink : C.mute, '700 10.5px ' + MONO, null, t.w - 70); ctx.textAlign = 'right'; text(L2('AI role-play', 'ρόλος ΤΝ'), t.x + t.w - 8, t.y + hh - 6, active ? '#04202f' : C.mute, '8.5px ' + MONO); ctx.textAlign = 'left';
        let y = t.y + hh + 15; [[L2('reads every seat', 'διαβάζει κάθε θέση'), 0.15], [L2('scores the options', 'βαθμολογεί τις επιλογές'), 0.5], [L2('says what data is missing', 'λέει ποια δεδομένα λείπουν'), 0.85]].forEach((r) => { const on = S.chair >= r[1]; text((on ? '✓ ' : '· ') + r[0], t.x + 8, y, on ? (done ? C.teal : C.ink) : 'rgba(127,147,173,.55)', '9.5px ' + MONO, null, t.w - 16); y += 13; });
        if (T >= P.draft && y + 20 < t.y + t.h - 12) { const k = reduce.matches ? 1 : ease(S.draft * 2.5); ctx.globalAlpha = k; rr(t.x + 8, y + 2, Math.min(t.w - 16, 190), 17, 4); ctx.strokeStyle = C.amber; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); text(L2('DRAFT: not public', 'ΠΡΟΧΕΙΡΟ: όχι δημόσιο'), t.x + 15, y + 14, C.amber, '700 9px ' + MONO, k, Math.min(t.w - 30, 176)); }
        bar(t, S.chair, done ? C.teal : C.cyan); }
      // the teacher: a person, not an AI
      { const t = o.teacher, active = S.id === 'teacher' || S.id === 'draft', done = T >= P.publish, hh = tileBox(t, active, done, 1); text(L2('Teacher', 'Εκπαιδευτικός'), t.x + 8, t.y + hh - 6, active ? '#04202f' : done ? C.ink : C.mute, '700 10.5px ' + MONO, null, t.w - 70); ctx.textAlign = 'right'; text(L2('a person', 'άνθρωπος'), t.x + t.w - 8, t.y + hh - 6, active ? '#04202f' : C.amber, '700 8.5px ' + MONO); ctx.textAlign = 'left';
        let y = t.y + hh + 15; y += 12 * wrap(L2('reads the draft; the AI decides nothing', 'διαβάζει το πρόχειρο· η ΤΝ δεν αποφασίζει τίποτα'), t.x + 8, y, t.w - 16, 12, 2, C.mute, '9.5px ' + MONO);
        const bw = Math.min(110, (t.w - 24) / 2), byy = Math.min(y + 2, t.y + t.h - 40); [[L2('publish', 'δημοσίευση'), C.teal, done], [L2('reject', 'απόρριψη'), C.rose, false]].forEach((b, k) => { const x = t.x + 8 + k * (bw + 8); rr(x, byy, bw, 19, 5); if (b[2]) { ctx.fillStyle = 'rgba(45,212,191,.2)'; ctx.fill(); } ctx.strokeStyle = b[1]; ctx.globalAlpha = active || b[2] ? 1 : 0.45; ctx.lineWidth = 1.2; ctx.stroke(); ctx.textAlign = 'center'; text(b[0], x + bw / 2, byy + 13, b[1], '700 9.5px ' + MONO, active || b[2] ? 1 : 0.45, bw - 8); ctx.textAlign = 'left'; });
        if (o.wide && byy + 34 < t.y + t.h - 12) text(L2('this walk-through follows the "publish" path', 'η περιήγηση ακολουθεί τη διαδρομή "δημοσίευση"'), t.x + 8, byy + 33, 'rgba(127,147,173,.8)', '8.5px ' + MONO, null, t.w - 16);
        bar(t, S.teacher, done ? C.teal : C.cyan); }
      // published sessions: a live number
      { const t = o.pub, active = S.id === 'publish', done = S.done, hh = tileBox(t, active, done, 1), pub = m.published; text(L2('Published', 'Δημοσιευμένες'), t.x + 8, t.y + hh - 6, active ? '#04202f' : done ? C.ink : C.mute, '700 10.5px ' + MONO, null, t.w - 60); ctx.textAlign = 'right'; text(L2('live', 'ζωντανά'), t.x + t.w - 8, t.y + hh - 6, active ? '#04202f' : C.teal, '700 8.5px ' + MONO); ctx.textAlign = 'left';
        const big = Math.round(clamp(t.h * 0.26, 18, 34)); text(!pub.known ? '–' : pub.n + (pub.capped ? '+' : ''), t.x + 8, t.y + hh + 10 + big, pub.known ? C.ink : C.grey, '700 ' + big + 'px ' + MONO);
        let y = t.y + hh + 24 + big; y += 12 * wrap(!pub.known ? L2('the number was not reported', 'ο αριθμός δεν αναφέρθηκε') : L2('sessions published by teachers so far', 'συνεδρίες που έχουν δημοσιεύσει εκπαιδευτικοί'), t.x + 8, y, t.w - 16, 12, 2, C.mute, '9.5px ' + MONO);
        if (y + 6 < t.y + t.h - 14) wrap(L2('visitors can read only these', 'οι επισκέπτες διαβάζουν μόνο αυτές'), t.x + 8, y + 2, t.w - 16, 12, 1, 'rgba(127,147,173,.8)', '9px ' + MONO);
        bar(t, S.publish, C.teal); }
    }
    function drawBottom(S) {
      const o = L, r = o.log, u = o.help;
      rr(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke(); text('// council.log  ' + L2('(walk-through, as written in the code)', '(περιήγηση, όπως στον κώδικα)'), r.x + 12, r.y + 15, C.mute, '9px ' + MONO, null, r.w - 24);
      const lh = o.wide ? 17 : 21; let y = r.y + 33; m.steps.forEach((s, k) => { if (T < s.at + 100 && !reduce.matches) return; const full = String(k + 1).padStart(2, '0') + ' ' + tx(s.log), n = reduce.matches ? full.length : Math.min(full.length, Math.floor((T - s.at - 100) / 11)), newest = k === S.step; if (y > r.y + r.h - 6) return; ctx.font = (o.wide ? 10 : 9) + 'px ' + MONO; if (o.wide) { text(full.slice(0, n) + (newest && n < full.length ? '▌' : ''), r.x + 12, y, newest ? C.white : '#9fb2cc', '10px ' + MONO, null, r.w - 24); y += lh; } else { y += 11 * wrap(full.slice(0, n), r.x + 12, y, r.w - 24, 11, 2, newest ? C.white : '#9fb2cc', '9px ' + MONO) + 1; } });
      rr(u.x, u.y, u.w, u.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke(); text(L2('BACKGROUND HELPERS, NOW', 'ΒΟΗΘΟΙ ΠΑΡΑΣΚΗΝΙΟΥ, ΤΩΡΑ'), u.x + 12, u.y + 15, C.mute, '700 9px ' + MONO); ctx.textAlign = 'right'; text(L2('live', 'ζωντανά'), u.x + u.w - 10, u.y + 15, C.teal, '700 8.5px ' + MONO); ctx.textAlign = 'left';
      if (!m.helpers.length) { text(L2('the state of the helpers was not reported', 'η κατάσταση των βοηθών δεν αναφέρθηκε'), u.x + 12, u.y + 36, '#9fb2cc', '10px ' + MONO, null, u.w - 24); return; }
      const rh = Math.min(30, (u.h - 26) / m.helpers.length); m.helpers.forEach((h, k) => { const yy = u.y + 24 + k * rh, col = HCOL[h.state]; if (h.state === 'ok' && !reduce.matches) { const p = 0.5 + 0.5 * Math.sin(amb / 500 + k); ctx.globalAlpha = 0.25 * p; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(u.x + 17, yy + 9, 4 + 4 * p, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.textAlign = 'center'; text(HMARK[h.state], u.x + 17, yy + 13, col, '700 11px ' + MONO); ctx.textAlign = 'left'; const stW = 96; text(tx(h.name), u.x + 30, yy + 11, C.ink, '700 10px ' + MONO, null, u.w - 44 - stW); ctx.textAlign = 'right'; text(tx(h.stateText), u.x + u.w - 10, yy + 11, col, '700 9.5px ' + MONO, null, stW); ctx.textAlign = 'left';
        if (rh >= 22) text((h.last ? L2('last run ', 'τελευταία εκτέλεση ') + tx(h.last) + '. ' : '') + (h.detail ? tx(h.detail) : tx(h.what)), u.x + 30, yy + 22, C.mute, '8.5px ' + MONO, null, u.w - 42); });
    }
    function frame(now) {
      raf = 0; if (dead) return; const dt = lastNow ? Math.min(100, now - lastNow) : 0; lastNow = now; const dur = m.duration || 1; if (!paused && !reduce.matches) { amb += dt; if (T < dur) T += dt; } T = clamp(T, 0, dur);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      if (!m.available) { ctx.textAlign = 'center'; text(tx(m.empty), W / 2, H / 2, C.ink, '13px ' + MONO, null, W - 30); ctx.textAlign = 'left'; return; }
      const S = D.at(m, T); drawTop(S); drawWires(S); drawCards(S); drawTiles(S); drawBottom(S);
      if (opts.onTime) { try { opts.onTime(T, dur, !paused && T < dur, S); } catch (e) { /* page handler */ } }
      // the helpers keep pulsing after the walk-through ends, because their state is live; nothing else moves then
      if (document.hidden || reduce.matches || paused) { lastNow = 0; return; } if (T >= dur && !m.helpers.some((h) => h.state === 'ok')) { lastNow = 0; return; } raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (Math.abs((host.clientWidth || 0) - W) > 2) { layout(); kick(); } }) : null; if (ro) ro.observe(host);
    const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);
    layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); if (reduce.matches) T = m.duration; kick();
    return { play() { paused = false; if (T >= m.duration) T = 0; lastNow = 0; kick(); }, pause(on) { paused = on !== false; lastNow = 0; kick(); }, replay() { T = 0; paused = false; lastNow = 0; kick(); }, seek(ms) { T = clamp(ms, 0, m.duration); lastNow = 0; if (raf) { cancelAnimationFrame(raf); raf = 0; } kick(); }, time: () => T, duration: () => m.duration, isPaused: () => paused,
      update(next) { if (!next || !next.available) return; const same = next.seats.length === m.seats.length && next.helpers.length === m.helpers.length; m = next; if (!same) layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); kick(); },
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); } };
  }
  SC.viz.crew = { mount };
})();
