/*
  journey.js: the Data Journey board. One canvas, one clock. It plays how data is collected and handed out on this site:
  publishers feed the collector; every data sheet appears as a card with what the site knows about it now; the cards fold into a
  rail of pills; the pages of the site appear and are joined to the sheets they show; a marker per sheet travels to the check
  ring, which counts the sheets that answered. Sheets that did not answer stay outside the ring and are named.
  SC.viz.journey.mount(host, model, opts) -> { play(), pause(on), replay(), seek(ms), time(), duration(), isPaused(), run(model), destroy() }.
  Everything drawn is computed from the run time T, so pause, replay and seek always agree. Numbers come from journey-data.js.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const C = { bg: '#02060d', pan: 'rgba(8,18,34,.94)', line: 'rgba(125,211,252,.22)', cyan: '#5fd4ff', amber: '#FBBF24', ink: '#EAF0F7', mute: '#7f93ad', teal: '#2dd4bf', white: '#ffffff' };
  const BAND = { WATER: '#38bdf8', GROUND: '#34d399', CITY: '#c4b5fd', AIR: '#a5f3fc', SPACE: '#f9a8d4' };
  const PH = { cards: 0, fold: 4200, pages: 6000, check: 10800, hold: 14200, end: 17900 };
  const lg = () => (window.SC && SC.lang === 'el' ? 1 : 0), tx = (p) => (Array.isArray(p) ? p[lg()] : String(p == null ? '' : p));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), c01 = (v) => clamp(v, 0, 1), ease = (t) => { t = c01(t); return t * t * (3 - 2 * t); }, lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const short = (s, n) => { s = String(s).split(/[,(:]/)[0].trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function mount(host, model, opts) {
    opts = opts || {};
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%'; host.textContent = ''; host.append(cv); host.setAttribute('role', 'img');
    const ctx = cv.getContext('2d');
    let m = model, W = 0, H = 0, L = null, raf = 0, dead = false, paused = false, T = 0, amb = 0, lastNow = 0;

    const rr = (x, y, w, h, r) => { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    const fit = (s, w) => { if (ctx.measureText(s).width <= w) return s; while (s.length > 3 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
    const bez = (a, c1, c2, b, t) => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]; };
    const curve = (a, b, bend) => { const dx = (b[0] - a[0]) * (bend == null ? 0.5 : bend); return [a, [a[0] + dx, a[1]], [b[0] - dx, b[1]], b]; };
    const stroke = (q, col, al, lw, upto) => { ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = lw || 1; ctx.beginPath(); if (upto == null || upto >= 1) { ctx.moveTo(q[0][0], q[0][1]); ctx.bezierCurveTo(q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]); } else { const n = Math.max(2, Math.round(24 * upto)); for (let k = 0; k <= n; k++) { const p = bez(q[0], q[1], q[2], q[3], upto * k / n); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } } ctx.stroke(); ctx.globalAlpha = 1; };
    const dot = (p, r, col, al, glow) => { ctx.globalAlpha = al; ctx.fillStyle = col; if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; } ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; };

    function layout() {
      const w = Math.max(300, host.clientWidth || 320), n = m.sheets.length, np = m.pages.length, wide = w >= 900, pad = wide ? 12 : 8, top = 50, o = { wide, pad, top, cards: [], pills: [], pages: [], pubs: [] };
      if (wide) {
        const h = clamp(Math.round(w * 0.6), 660, 900), logH = 92, y0 = top + pad, y1 = h - pad - logH - 10, span = y1 - y0; W = w; H = h;
        o.log = { x: pad, y: h - pad - logH, w: w - pad * 2, h: logH };
        const px = pad, pw = w * 0.15; m.publishers.forEach((p, k) => o.pubs.push({ x: px, y: y0 + (k + 0.5) * span / Math.max(1, m.publishers.length), w: pw }));
        o.hub = { x: w * 0.215, y: y0 + span / 2, r: clamp(w * 0.03, 24, 40) };
        o.gates = [{ x: w * 0.262, y: y0 + span * 0.22, w: w * 0.066, h: 54 }, { x: w * 0.262, y: y0 + span * 0.66, w: w * 0.066, h: 54 }];
        const cols = 3, rows = Math.ceil(n / cols), ax = w * 0.355, aw = w * 0.335, cw = (aw - (cols - 1) * 8) / cols, ch = (span - (rows - 1) * 6) / rows;
        for (let i = 0; i < n; i++) { const c = Math.floor(i / rows), r = i % rows; o.cards.push({ x: ax + c * (cw + 8), y: y0 + r * (ch + 6) + (c === 1 ? ch * 0.18 : 0) * (rows * (ch + 6) + ch * 0.18 <= span + ch ? 0 : 0), w: cw, h: ch, col: c }); }
        const ph = Math.min(24, span / n - 4), rx = w * 0.385, rw = w * 0.185; for (let i = 0; i < n; i++) o.pills.push({ x: rx, y: y0 + (i + 0.5) * span / n - ph / 2, w: rw, h: ph });
        const gx = w * 0.655, gw = w * 0.185, gh = Math.min(70, span / np - 12); for (let k = 0; k < np; k++) o.pages.push({ x: gx, y: y0 + (k + 0.5) * span / np - gh / 2, w: gw, h: gh });
        o.ring = { x: w * 0.925, y: y0 + span / 2, r: clamp(w * 0.047, 40, 64) };
      } else {
        const cw = (w - pad * 2 - 8) / 2; let y = top + pad; W = w;
        o.hub = { x: w / 2, y: y + 34, r: 26 }; o.gates = [{ x: pad, y: y + 8, w: cw * 0.62, h: 50 }, { x: w - pad - cw * 0.62, y: y + 8, w: cw * 0.62, h: 50 }]; y += 86;
        const rows = Math.ceil(n / 2), ch = 46; for (let i = 0; i < n; i++) o.cards.push({ x: pad + (i % 2) * (cw + 8), y: y + Math.floor(i / 2) * (ch + 5), w: cw, h: ch, col: i % 2 });
        for (let i = 0; i < n; i++) o.pills.push({ x: pad + (i % 2) * (cw + 8), y: y + Math.floor(i / 2) * 26, w: cw, h: 21 }); y += rows * 26 + 26;
        for (let k = 0; k < np; k++) o.pages.push({ x: pad + (k % 2) * (cw + 8), y: y + Math.floor(k / 2) * 62, w: cw, h: 52 }); y += Math.ceil(np / 2) * 62 + 70;
        o.ring = { x: w / 2, y: y, r: 54 }; y += 76; o.log = { x: pad, y, w: w - pad * 2, h: 118 }; H = y + 118 + pad;
      }
      L = o; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // timing of each part, all from T
    const cardIn = (i) => { const c = L.cards[i]; return c01((T - (350 + c.col * 950 + (i % Math.ceil(m.sheets.length / (L.wide ? 3 : 2))) * 110)) / 320); };
    const fold = (i) => ease((T - PH.fold - i * 28) / 900);
    const pageIn = (k) => c01((T - PH.pages - k * 680) / 300), linkIn = (k) => c01((T - PH.pages - k * 680 - 150) / 900);
    const mark = (i) => c01((T - PH.check - i * 95) / 1150);
    const band = (s) => BAND[s.band] || C.cyan;

    function sheetRect(i) { const a = L.cards[i], b = L.pills[i], f = fold(i); return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), w: lerp(a.w, b.w, f), h: lerp(a.h, b.h, f), f }; }

    function drawTop() {
      const o = L, t = m.totals, ph = T < PH.fold ? 0 : T < PH.pages ? 1 : T < PH.check ? 2 : 3, names = [[lg() ? 'ΣΥΛΛΟΓΗ' : 'COLLECT'], [lg() ? 'ΕΤΙΚΕΤΑ' : 'LABEL'], [lg() ? 'ΔΙΑΝΟΜΗ' : 'HAND OUT'], [T < PH.hold ? (lg() ? 'ΕΛΕΓΧΟΣ' : 'CHECK') : (lg() ? 'ΕΤΟΙΜΟ' : 'READY')]];
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.ink; ctx.font = '700 ' + (o.wide ? 15 : 13) + 'px ' + MONO; ctx.fillText('journey / kleanthis', o.pad + 2, 20);
      ctx.fillStyle = C.mute; ctx.font = '10px ' + MONO; ctx.fillText(t.sheets + ' ' + (lg() ? 'φύλλα' : 'sheets') + ' · ' + t.pages + ' ' + (lg() ? 'σελίδες' : 'pages'), o.pad + 2, 36);
      const seen = m.sheets.filter((s, i) => cardIn(i) >= 1), recs = seen.reduce((a, s) => a + (s.available ? s.count || 0 : 0), 0), links = m.pages.reduce((a, p, k) => a + Math.round(p.sheets.length * linkIn(k)), 0), inRing = m.sheets.filter((s, i) => s.available && mark(i) >= 1).length;
      const cells = [[lg() ? 'ΦΑΣΗ' : 'PHASE', names[ph][0], C.amber], [lg() ? 'ΦΥΛΛΑ' : 'SHEETS', seen.length + '/' + t.sheets, C.ink], [lg() ? 'ΕΓΓΡΑΦΕΣ' : 'RECORDS', String(recs), C.cyan], [lg() ? 'ΣΥΝΔΕΣΕΙΣ' : 'LINKS', String(links), C.ink], [lg() ? 'ΑΠΑΝΤΗΣΑΝ' : 'ANSWERED', inRing + '/' + t.sheets, C.teal]];
      const x0 = o.wide ? 210 : 158, cw = (W - x0 - (o.wide ? 130 : 6)) / (o.wide ? cells.length : 4);
      cells.slice(0, o.wide ? 5 : 4).forEach((c, i) => { const x = x0 + i * cw; ctx.fillStyle = C.mute; ctx.font = '9px ' + MONO; ctx.fillText(c[0], x, 14); ctx.fillStyle = c[2]; ctx.font = '700 ' + (o.wide ? 15 : 11) + 'px ' + MONO; ctx.fillText(fit(c[1], cw - 8), x, 33); ctx.fillStyle = 'rgba(125,211,252,.25)'; ctx.fillRect(x, 39, cw - 10, 1.5); });
      if (o.wide) { const lab = m.totals.demo ? (lg() ? 'ΜΕ ΔΟΚΙΜΑΣΤΙΚΕΣ ΤΙΜΕΣ' : 'INCLUDES TEST VALUES') : (lg() ? 'ΟΠΩΣ ΕΙΝΑΙ ΤΩΡΑ' : 'AS IT IS NOW'); ctx.textAlign = 'right'; ctx.fillStyle = m.totals.demo ? C.amber : C.teal; ctx.font = '700 10.5px ' + MONO; ctx.fillText(lab, W - o.pad - 2, 26); ctx.textAlign = 'left'; }
    }

    function drawIntake() {
      const o = L, hub = o.hub, mv = !reduce.matches;
      // publishers -> collector
      o.pubs.forEach((p, k) => { const pub = m.publishers[k], a = [p.x + p.w, p.y], q = curve(a, [hub.x - hub.r, hub.y], 0.55), on = c01((T - k * 70) / 300);
        stroke(q, C.cyan, 0.12 + 0.22 * on, 1); ctx.globalAlpha = on; ctx.font = '9.5px ' + MONO; ctx.textAlign = 'right'; ctx.fillStyle = '#c6d3e6'; ctx.fillText(fit(short(tx(pub.name), 30), p.w - 12), p.x + p.w - 8, p.y + 3); ctx.textAlign = 'left'; ctx.globalAlpha = 1; dot(a, 2.2, C.cyan, on);
        if (mv && T < PH.fold + 600) { const t = ((T / 1500) + rnd(k)) % 1, pt = bez(q[0], q[1], q[2], q[3], t); dot(pt, 1.8, C.white, Math.sin(t * Math.PI) * on); } });
      // collector hub
      const g = ctx.createRadialGradient(hub.x, hub.y, 2, hub.x, hub.y, hub.r * 2.4); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(95,212,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hub.x, hub.y, hub.r * 2.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(hub.x, hub.y, hub.r, 0, 7); ctx.fillStyle = '#eef6ff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
      for (let i = 0; i < 46; i++) { const a = rnd(i) * 6.283 + (mv ? amb / 2600 : 0) * (i % 2 ? 1 : -1), r = Math.sqrt(rnd(i + 60)) * hub.r * 0.82; ctx.fillStyle = '#0b2a4a'; ctx.globalAlpha = 0.55; ctx.fillRect(hub.x + Math.cos(a) * r, hub.y + Math.sin(a) * r, 1.8, 1.8); } ctx.globalAlpha = 1;
      ctx.font = '700 9px ' + MONO; ctx.textAlign = 'center'; ctx.fillStyle = C.ink; ctx.fillText(tx(m.stages[0]).toUpperCase(), hub.x, hub.y + hub.r + 14); ctx.textAlign = 'left';
      // the two gates
      o.gates.forEach((r, k) => { const on = c01((T - 200 - k * 250) / 300); ctx.globalAlpha = on; rr(r.x, r.y, r.w, r.h, 5); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = k ? C.amber : C.cyan; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = k ? C.amber : C.cyan; ctx.font = '700 9.5px ' + MONO; ctx.fillText(fit(tx(m.stages[k + 1]).toUpperCase(), r.w - 12), r.x + 7, r.y + 15); ctx.fillStyle = C.mute; ctx.font = '8.5px ' + MONO;
        const l = k ? [lg() ? 'ζωντανό ή' : 'live or', lg() ? 'σταθερό' : 'fixed'] : [lg() ? 'μονάδα, ώρα,' : 'unit, time,', lg() ? 'πηγή' : 'source']; ctx.fillText(fit(l[0], r.w - 12), r.x + 7, r.y + 30); ctx.fillText(fit(l[1], r.w - 12), r.x + 7, r.y + 42); ctx.globalAlpha = 1;
        stroke(curve([hub.x + hub.r * 0.8, hub.y], [r.x, r.y + r.h / 2], 0.6), k ? C.amber : C.cyan, 0.4 * on, 1); });
    }

    function drawSheets() {
      const o = L, mv = !reduce.matches;
      m.sheets.forEach((s, i) => { const inn = cardIn(i); if (inn <= 0) return; const r = sheetRect(i), col = band(s), g = o.gates[i % 2], from = [g.x + g.w, g.y + g.h / 2], to = [r.x, r.y + r.h / 2], q = curve(from, to, 0.5);
        stroke(q, col, (0.1 + 0.25 * (1 - r.f)) * inn, 1);
        if (mv && T < PH.pages) { const t = ((T / 1300) + rnd(i + 200)) % 1, pt = bez(q[0], q[1], q[2], q[3], t); dot(pt, 1.7, col, Math.sin(t * Math.PI) * inn * (1 - r.f * 0.6)); } });
      // fine links between neighbouring cards while they are cards
      if (T < PH.pages) m.sheets.forEach((s, i) => { const j = i + 1; if (j >= m.sheets.length || cardIn(j) <= 0) return; const a = sheetRect(i), b = sheetRect(j), al = 0.16 * (1 - a.f) * cardIn(j); if (al <= 0.01) return; const p0 = [a.x + a.w / 2, a.y + a.h], p1 = [b.x + b.w / 2, b.y]; ctx.strokeStyle = C.cyan; ctx.globalAlpha = al; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo((p0[0] + p1[0]) / 2 + 14, (p0[1] + p1[1]) / 2, p1[0], p1[1]); ctx.stroke(); ctx.globalAlpha = 1; });
      m.sheets.forEach((s, i) => { const inn = cardIn(i); if (inn <= 0) return; const r = sheetRect(i), col = band(s), f = r.f, mk = mark(i), gone = !s.available;
        ctx.globalAlpha = inn; ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); const sc = 0.92 + 0.08 * ease(inn); ctx.scale(sc, sc); ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
        rr(r.x, r.y, r.w, r.h, lerp(6, r.h / 2, f)); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = gone ? C.amber : mk >= 1 ? C.teal : col; ctx.globalAlpha = inn * (gone ? 0.95 : 0.7); ctx.lineWidth = 1; if (gone) ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = inn;
        // marker dot (stays with the sheet; turns teal once checked)
        const mx = r.x + lerp(11, r.h / 2, f), my = r.y + lerp(13, r.h / 2, f); dot([mx, my], lerp(4, Math.min(5, r.h * 0.24), f), gone ? C.amber : mk > 0 ? C.teal : col, inn, f > 0.9 ? 6 : 0);
        ctx.fillStyle = C.ink; ctx.font = '700 ' + (o.wide ? 10.5 : 9.5) + 'px ' + MONO; const tx0 = mx + lerp(9, r.h * 0.45, f); ctx.fillText(fit(tx(s.title), r.x + r.w - tx0 - (f > 0.5 ? 34 : 6)), tx0, r.y + lerp(16.5, r.h / 2 + 3.5, f));
        if (f < 0.6) { ctx.globalAlpha = inn * (1 - f / 0.6); ctx.font = '9px ' + MONO; ctx.fillStyle = gone ? C.amber : col; ctx.fillText(fit(tx(s.status), r.w - 16), r.x + 8, r.y + Math.min(r.h - 16, 32)); ctx.fillStyle = C.mute; if (r.h > 52) ctx.fillText(fit(tx(s.kind), r.w - 16), r.x + 8, r.y + Math.min(r.h - 5, 46));
          if (r.h > 34) { ctx.fillStyle = 'rgba(125,211,252,.12)'; ctx.fillRect(r.x + 8, r.y + r.h - 6, r.w - 16, 2.5); ctx.fillStyle = gone ? C.amber : col; ctx.fillRect(r.x + 8, r.y + r.h - 6, (r.w - 16) * (gone ? 0 : ease(inn)), 2.5); } }
        if (f > 0.5) { ctx.globalAlpha = inn * c01((f - 0.5) / 0.5); ctx.font = '700 9.5px ' + MONO; ctx.textAlign = 'right'; ctx.fillStyle = gone ? C.amber : C.mute; ctx.fillText(gone ? '–' : s.count == null ? '✓' : String(s.count), r.x + r.w - 9, r.y + r.h / 2 + 3.5); ctx.textAlign = 'left'; }
        ctx.restore(); ctx.globalAlpha = 1; });
    }

    function drawPages() {
      const o = L, mv = !reduce.matches;
      m.pages.forEach((p, k) => { const inn = pageIn(k), li = linkIn(k); if (inn <= 0) return; const r = o.pages[k];
        p.sheets.forEach((i, q) => { const s = m.sheets[i], sr = sheetRect(i), a = o.wide ? [sr.x + sr.w, sr.y + sr.h / 2] : [sr.x + sr.w / 2, sr.y + sr.h], b = o.wide ? [r.x, r.y + r.h * (0.2 + 0.6 * (q + 0.5) / p.sheets.length)] : [r.x + r.w / 2, r.y], cv2 = o.wide ? curve(a, b, 0.5) : [a, [a[0], a[1] + 30], [b[0], b[1] - 30], b], part = c01(li * 1.3 - (q / p.sheets.length) * 0.3);
          if (part <= 0) return; stroke(cv2, s.available ? band(s) : C.amber, (s.available ? 0.2 : 0.12) + (T < PH.check ? 0.12 * (1 - Math.abs(part - 0.5) * 2 < 0 ? 0 : 1) : 0), 1, part);
          if (mv && part > 0 && part < 1) { const pt = bez(cv2[0], cv2[1], cv2[2], cv2[3], part); dot(pt, 2.2, C.white, 1, 8); }
          else if (mv && s.available && T < PH.hold) { const t = ((T / 2600) + rnd(i * 7 + k * 31)) % 1, pt = bez(cv2[0], cv2[1], cv2[2], cv2[3], t); dot(pt, 1.4, band(s), 0.7 * Math.sin(t * Math.PI)); } });
        ctx.globalAlpha = inn; rr(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = li > 0 && li < 1 ? C.amber : C.line; ctx.lineWidth = li > 0 && li < 1 ? 1.6 : 1; if (li > 0 && li < 1) { ctx.shadowColor = C.amber; ctx.shadowBlur = 12; } ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = C.ink; ctx.font = '700 ' + (o.wide ? 11.5 : 10) + 'px ' + MONO; ctx.fillText(fit(tx(p.title), r.w - 18), r.x + 10, r.y + 18);
        const shownN = Math.round(p.sheets.length * li); ctx.font = '9.5px ' + MONO; ctx.fillStyle = C.cyan; ctx.fillText(fit(shownN + ' ' + (lg() ? 'φύλλα' : 'sheets') + (li >= 1 ? ' · ' + p.answered + ' ' + (lg() ? 'απάντησαν' : 'answered') : ''), r.w - 18), r.x + 10, r.y + 33);
        const bw = r.w - 20; ctx.fillStyle = 'rgba(125,211,252,.12)'; ctx.fillRect(r.x + 10, r.y + r.h - 10, bw, 3); ctx.fillStyle = C.cyan; ctx.fillRect(r.x + 10, r.y + r.h - 10, bw * li * (p.sheets.length / m.sheets.length), 3);
        // tiny tick marks: one per sheet it shows
        if (r.h > 56) p.sheets.forEach((i, q) => { if (q / p.sheets.length > li) return; ctx.fillStyle = m.sheets[i].available ? band(m.sheets[i]) : C.amber; ctx.fillRect(r.x + 10 + q * Math.min(7, bw / p.sheets.length), r.y + 40, Math.max(2, Math.min(5, bw / p.sheets.length - 2)), 6); });
        ctx.globalAlpha = 1; });
    }

    function drawRing() {
      const o = L, R = o.ring, n = m.sheets.length, on = c01((T - PH.check + 400) / 400); if (on <= 0) return; const mv = !reduce.matches;
      // one route from every page into the ring
      m.pages.forEach((p, k) => { const r = o.pages[k], a = o.wide ? [r.x + r.w, r.y + r.h / 2] : [r.x + r.w / 2, r.y + r.h], b = o.wide ? [R.x - R.r, R.y] : [R.x, R.y - R.r]; stroke(o.wide ? curve(a, b, 0.5) : [a, [a[0], a[1] + 20], [b[0], b[1] - 20], b], C.teal, 0.3 * on, 1); });
      ctx.globalAlpha = on; ctx.strokeStyle = 'rgba(45,212,191,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(R.x, R.y, R.r, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(R.x, R.y, R.r * 0.62, 0, 7); ctx.fillStyle = 'rgba(6,14,28,.92)'; ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
      let inside = 0;
      m.sheets.forEach((s, i) => { const k = mark(i); if (k <= 0) return; const sr = sheetRect(i), from = [sr.x + sr.h / 2, sr.y + sr.h / 2], ang = -Math.PI / 2 + (i / n) * 6.283, to = [R.x + Math.cos(ang) * R.r, R.y + Math.sin(ang) * R.r];
        if (!s.available) { if (mv) { const w = Math.sin(c01(k) * Math.PI * 3) * 3 * (1 - k); dot([from[0] + w, from[1]], 3.5, C.amber, 1, 8); } return; }
        if (k >= 1) { inside++; dot(to, 3.4, C.teal, 1, 8); return; }
        const pg = L.pages[s.pages[0] != null ? s.pages[0] : 0], via = o.wide ? [pg.x + pg.w / 2, pg.y + pg.h / 2] : [pg.x + pg.w / 2, pg.y + pg.h / 2], e = ease(k), p1 = e < 0.5 ? [lerp(from[0], via[0], ease(e * 2)), lerp(from[1], via[1], ease(e * 2))] : [lerp(via[0], to[0], ease(e * 2 - 1)), lerp(via[1], to[1], ease(e * 2 - 1))];
        dot(p1, 3.2, e < 0.25 ? band(s) : C.teal, 1, 10); });
      const done = T >= PH.check + (n - 1) * 95 + 1150; ctx.textAlign = 'center'; ctx.fillStyle = done ? C.teal : C.ink; ctx.font = '700 ' + Math.round(R.r * 0.42) + 'px ' + MONO; if (done) { ctx.shadowColor = C.teal; ctx.shadowBlur = 12; } ctx.fillText(String(inside), R.x, R.y + R.r * 0.08); ctx.shadowBlur = 0;
      ctx.font = '8.5px ' + MONO; ctx.fillStyle = C.mute; ctx.fillText((lg() ? 'από ' : 'of ') + n, R.x, R.y + R.r * 0.34);
      ctx.font = '700 9px ' + MONO; ctx.fillStyle = C.teal; ctx.globalAlpha = on; ctx.fillText(lg() ? 'ΑΠΑΝΤΗΣΑΝ' : 'ANSWERED', R.x, R.y + R.r + 16);
      const miss = m.sheets.filter((s) => !s.available); if (done && miss.length) { ctx.fillStyle = C.amber; ctx.font = '9px ' + MONO; ctx.fillText(miss.length + ' ' + (lg() ? 'δεν απάντησαν' : 'did not answer'), R.x, R.y + R.r + 30); }
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }

    function drawLog() {
      const o = L, r = o.log, t = m.totals, miss = m.sheets.filter((s) => !s.available);
      rr(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = C.mute; ctx.font = '9px ' + MONO; ctx.textAlign = 'left'; ctx.fillText('// journey.log  ' + (lg() ? '(όπως είναι καλωδιωμένος ο ιστότοπος)' : '(as wired in the site)'), r.x + 12, r.y + 15);
      const lines = [[0, lg() ? 'συλλογή: ' + t.publishers + ' εκδότες στέλνουν δεδομένα για ' + t.sheets + ' φύλλα' : 'collect: ' + t.publishers + ' publishers send data for ' + t.sheets + ' sheets'],
        [PH.fold, lg() ? 'έλεγχος και ετικέτα: ' + t.answered + ' φύλλα απάντησαν με ' + t.records + ' εγγραφές' : 'check and label: ' + t.answered + ' sheets answered with ' + t.records + ' records'],
        [PH.pages, lg() ? 'διανομή: ' + t.pages + ' σελίδες δείχνουν τα φύλλα μέσα από ' + t.links + ' συνδέσεις' : 'hand out: ' + t.pages + ' pages show the sheets through ' + t.links + ' links'],
        [PH.check, miss.length ? (lg() ? 'δεν απάντησαν: ' : 'did not answer: ') + miss.map((s) => tx(s.title)).join(', ') : (lg() ? 'όλα τα φύλλα απάντησαν' : 'every sheet answered')],
        [PH.hold, lg() ? 'έτοιμο: ' + t.answered + '/' + t.sheets + ' φύλλα στον δακτύλιο ελέγχου' : 'ready: ' + t.answered + '/' + t.sheets + ' sheets in the check ring']];
      const lh = Math.min(15, (r.h - 26) / lines.length); ctx.font = (o.wide ? 10.5 : 9.5) + 'px ' + MONO;
      lines.forEach((ln, k) => { if (T < ln[0] + 150) return; const txt = String(k + 1).padStart(2, '0') + ' ' + ln[1], n = reduce.matches ? txt.length : Math.min(txt.length, Math.floor((T - ln[0] - 150) / 14)), newest = !lines[k + 1] || T < lines[k + 1][0] + 150; ctx.fillStyle = k === 3 && miss.length ? C.amber : newest ? C.white : '#9fb2cc'; ctx.fillText(fit(txt.slice(0, n) + (newest && n < txt.length ? '▌' : ''), r.w - 24), r.x + 12, r.y + 31 + k * lh); });
    }

    function frame(now) {
      raf = 0; if (dead) return; const dt = lastNow ? Math.min(100, now - lastNow) : 0; lastNow = now;
      if (!paused && !reduce.matches) { amb += dt; if (T < PH.end) T += dt; }
      T = clamp(T, 0, PH.end);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      if (!m.available) { ctx.fillStyle = C.ink; ctx.font = '13px ' + MONO; ctx.textAlign = 'center'; ctx.fillText(fit(tx(m.empty), W - 30), W / 2, H / 2); ctx.textAlign = 'left'; return; }
      drawTop(); drawIntake(); drawPages(); drawSheets(); drawRing(); drawLog();
      if (opts.onTime) { try { opts.onTime(T, PH.end, !paused && T < PH.end); } catch (e) { /* page handler */ } }
      if (document.hidden || reduce.matches || paused || T >= PH.end) { lastNow = 0; return; }
      raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (Math.abs((host.clientWidth || 0) - W) > 2) { layout(); kick(); } }) : null; if (ro) ro.observe(host);
    const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);
    layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); if (reduce.matches) T = PH.end; kick();
    return { run(model) { m = model || m; layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); T = reduce.matches ? PH.end : 0; lastNow = 0; kick(); },
      play() { paused = false; if (T >= PH.end) T = 0; lastNow = 0; kick(); }, pause(on) { paused = on !== false; lastNow = 0; kick(); }, replay() { T = 0; paused = false; lastNow = 0; kick(); },
      seek(ms) { T = clamp(ms, 0, PH.end); lastNow = 0; if (raf) { cancelAnimationFrame(raf); raf = 0; } kick(); }, time: () => T, duration: () => PH.end, isPaused: () => paused, phases: PH,
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); } };
  }
  SC.viz.journey = { mount, PH };
})();
