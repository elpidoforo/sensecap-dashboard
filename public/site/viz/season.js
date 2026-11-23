/*
  season.js: two aligned charts, one above the other, month by month: hotel bedplaces occupied (%) and electricity available to
  the internal market (GWh per month, or GWh per calendar day). Each chart has its own axis and unit; there is no dual axis.
  SC.viz.season.mount(host, model, { unit, onPick }) -> { set({ unit }), model(), destroy() }.
  One shared marker reads the same month on both charts. A month with no value leaves a gap and a grey tick, never a zero.
  Eurostat status flags are written above the point. Still data: nothing moves.
  The page builds one <select> (or a two-way switch) from model.choices ('month' | 'day') and calls set({ unit }).
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const tx = (p) => (Array.isArray(p) ? p[(window.SC && SC.lang === 'el') ? 1 : 0] : String(p == null ? '' : p));
  const CY = '#7DD3FC', AM = '#FBBF24', DIM = '#9fb2cc', GRID = 'rgba(125,211,252,.14)';

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.seasonData;
    let m = model, picked = -1, pinned = -1, W = 0, H = 0, raf = 0, dead = false, G = null;
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%';
    host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    if (D && opts.unit) m = D.select(m, opts.unit);
    const ms = () => (m && m.months) || [];
    const aria = () => host.setAttribute('aria-label', tx(picked >= 0 && ms()[picked] ? ms()[picked].label : m.ariaLabel));

    function lines(s, w, font) { ctx.font = font; const out = []; let line = ''; for (const word of String(s).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
    const B13 = '700 13px ' + MONO, B11 = '700 11px ' + MONO, F12 = '12px ' + MONO, F11 = '11px ' + MONO, F10 = '10px ' + MONO;
    function layout() {
      W = Math.max(240, host.clientWidth || 320);
      const small = W < 520, pad = 10, gut = small ? 40 : 48, x0 = pad + gut, x1 = W - pad - 8, h = small ? 130 : 170, n = Math.max(1, ms().length), w = W - 2 * pad, ok = m && m.available;
      const L = ok ? { still: lines(tx(m.strings.still), w, F11), cap1: lines(tx(m.strings.occTitle), w, B11), cap2: lines(tx(m.elecTitle), w, B11), flag: lines(tx(m.counts.flagText) + (m.counts.missingOcc + m.counts.missingElec > 0 ? ' ▮ = ' + tx(m.strings.noValue) : ''), w, F10), cause: lines(tx(m.strings.noCause), w, F11) } : { still: [], cap1: [], cap2: [], flag: [], cause: [] };
      const y1 = 15 + L.still.length * 15 + 8 + L.cap1.length * 14, y2 = y1 + h + 36 + L.cap2.length * 14, flagY = y2 + h + 32, readY = flagY + L.flag.length * 13 + 12;
      // room for the longest read-out, so the widget does not change height while a month is read
      let nO = 1, nE = 1; if (ok) for (const x of ms()) { nO = Math.max(nO, lines(tx(x.occText), w, F12).length); nE = Math.max(nE, lines(tx(x.monthText), w, F12).length, lines(tx(x.dayText), w, F12).length); }
      const nRead = ok ? Math.max(nO + nE, lines(tx(m.strings.hint), w, F12).length - 1) : 2;
      G = { small, pad, x0, x1, y1, y2, h, L, flagY, readY, causeY: readY + 20 + nRead * 16 + 4, step: (x1 - x0) / n };
      H = G.causeY + L.cause.length * 15;
      const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const cx = (i) => G.x0 + (i + 0.5) * G.step;
    function panel(y, title, color, sc, val, flag) {
      const g = G, M = ms(), py = (v) => y + g.h - (v / sc.max) * g.h;
      ctx.textAlign = 'left'; ctx.fillStyle = color; ctx.font = B11; title.forEach((l, i) => ctx.fillText(l, g.pad, y - 11 - (title.length - 1 - i) * 14));
      ctx.font = '10px ' + MONO; ctx.lineWidth = 1;
      for (const t of sc.ticks) { const ty = py(t.v); ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(g.x0, ty + .5); ctx.lineTo(g.x1, ty + .5); ctx.stroke(); ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.fillText(tx(t.text), g.x0 - 5, ty + 3); }
      if (sc.full && sc.full < sc.max) { const ty = py(sc.full); ctx.strokeStyle = 'rgba(234,240,247,.45)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(g.x0, ty + .5); ctx.lineTo(g.x1, ty + .5); ctx.stroke(); ctx.setLineDash([]); }
      // year lines, the same on both charts so the months line up
      ctx.textAlign = 'left';
      for (const t of m.yearTicks) { const x = g.x0 + t.i * g.step; ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(x + .5, y); ctx.lineTo(x + .5, y + g.h + 4); ctx.stroke(); ctx.fillStyle = DIM; ctx.fillText(g.step * 12 < 30 ? "'" + String(t.year).slice(2) : String(t.year), x + 3, y + g.h + 14); }
      ctx.strokeStyle = color; ctx.lineWidth = g.small ? 1.5 : 2; ctx.lineJoin = 'round'; ctx.shadowColor = color; ctx.shadowBlur = 4; ctx.beginPath();
      let pen = false; M.forEach((x, i) => { const v = val(x); if (v == null) { pen = false; return; } if (pen) ctx.lineTo(cx(i), py(v)); else ctx.moveTo(cx(i), py(v)); pen = true; }); ctx.stroke(); ctx.shadowBlur = 0;
      M.forEach((x, i) => { const v = val(x), f = flag(x);
        if (v == null) { ctx.fillStyle = 'rgba(160,175,195,.6)'; ctx.fillRect(cx(i) - Math.max(1, g.step / 2 - .5), y + g.h - 7, Math.max(2, g.step - 1), 7); }
        else if ((i > 0 && val(M[i - 1]) == null || i === 0) && (i === M.length - 1 || val(M[i + 1]) == null)) { ctx.beginPath(); ctx.arc(cx(i), py(v), 2, 0, 6.2832); ctx.fillStyle = color; ctx.fill(); }
        if (f) { ctx.fillStyle = '#fff'; ctx.font = '700 10px ' + MONO; ctx.textAlign = 'center'; ctx.fillText(f, cx(i), (v == null ? y + g.h - 10 : py(v) - 6)); } });
      if (picked >= 0) { const v = val(M[picked]), x = cx(picked); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + .5, y); ctx.lineTo(x + .5, y + g.h); ctx.stroke(); if (v != null) { ctx.beginPath(); ctx.arc(x, py(v), 4.5, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); } }
    }
    function draw() {
      raf = 0; if (dead) return; ctx.clearRect(0, 0, W, H); ctx.textBaseline = 'alphabetic';
      if (!m || !m.available) { ctx.fillStyle = DIM; ctx.textAlign = 'left'; lines(tx(m && m.empty), W - 20, '12px ' + MONO).forEach((l, i) => ctx.fillText(l, 10, 24 + i * 16)); return; }
      const g = G, M = ms(), day = m.unit === 'day';
      ctx.textAlign = 'left'; ctx.fillStyle = AM; ctx.font = F11; g.L.still.forEach((l, i) => ctx.fillText(l, g.pad, 15 + i * 15));
      panel(g.y1, g.L.cap1, CY, m.scales.occ, (x) => x.occ, (x) => x.occStatus);
      panel(g.y2, g.L.cap2, AM, m.elecScale, (x) => (day ? x.perDay : x.gwh), (x) => x.gwhStatus);
      ctx.textAlign = 'left'; ctx.font = F10; ctx.fillStyle = DIM; g.L.flag.forEach((l, i) => ctx.fillText(l, g.pad, g.flagY + i * 13));
      // read-out: one month on both charts, each value in its own colour, then the not-a-cause sentence (always shown)
      let y = g.readY; const w = W - 2 * g.pad;
      if (picked >= 0) { const x = M[picked]; ctx.fillStyle = '#fff'; ctx.font = B13; ctx.fillText(tx(x.name), g.pad, y); y += 18;
        ctx.fillStyle = CY; lines(tx(x.occText), w, F12).forEach((l) => { ctx.fillText(l, g.pad, y); y += 16; });
        ctx.fillStyle = AM; lines(tx(day ? x.dayText : x.monthText), w, F12).forEach((l) => { ctx.fillText(l, g.pad, y); y += 16; }); }
      else { ctx.fillStyle = '#8ea3bf'; lines(tx(m.strings.hint), w, F12).forEach((l) => { ctx.fillText(l, g.pad, y); y += 16; }); }
      ctx.fillStyle = DIM; ctx.font = F11; g.L.cause.forEach((l, i) => ctx.fillText(l, g.pad, g.causeY + i * 15));
    }
    const ask = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    function hit(ev) { const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; if (!G || x < G.x0 - 4 || x > G.x1 + 4 || y < G.y1 - 10 || y > G.y2 + G.h + 18) return -1; return Math.max(0, Math.min(ms().length - 1, Math.floor((x - G.x0) / G.step))); }
    function pick(i, quiet) { if (i === picked) return; picked = i; aria(); ask(); if (!quiet && opts.onPick) { const x = i >= 0 ? ms()[i] : null; opts.onPick(x ? { ym: x.ym, year: x.year, month: x.month, days: x.days, occ: x.occ, occStatus: x.occStatus, gwh: x.gwh, gwhStatus: x.gwhStatus, perDay: x.perDay, unit: m.unit, name: x.name, label: x.label } : null); } }
    const onMove = (ev) => { const i = hit(ev); pick(i >= 0 ? i : pinned); cv.style.cursor = i >= 0 ? 'crosshair' : 'default'; };
    const onLeave = () => pick(pinned);
    const onClick = (ev) => { const i = hit(ev); pinned = i; pick(i); };
    const onKey = (ev) => { const n = ms().length; if (!n) return; let i = picked; const mv = (d) => (picked < 0 ? (d > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, picked + d)));
      if (ev.key === 'ArrowRight') i = mv(1); else if (ev.key === 'ArrowLeft') i = mv(-1); else if (ev.key === 'ArrowUp' || ev.key === 'PageUp') i = mv(12); else if (ev.key === 'ArrowDown' || ev.key === 'PageDown') i = mv(-12); else if (ev.key === 'Home') i = 0; else if (ev.key === 'End') i = n - 1; else if (ev.key === 'Escape') i = -1; else return;
      ev.preventDefault(); pinned = i; pick(i); };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { layout(); ask(); }) : null; if (ro) ro.observe(host);
    layout(); aria(); draw();
    return {
      // set({ unit: 'month' | 'day' }): the picked month is kept, so the same month can be read in both units.
      set(o) { if (o && o.unit && D) m = D.select(m, o.unit); layout(); aria(); ask(); return m; },
      model: () => m,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); },
    };
  }
  SC.viz.season = { mount };
})();
