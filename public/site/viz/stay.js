/*
  stay.js: tourists by place of stay, ONE reporting location at a time (CYSTAT survey table 2022062E, yearly).
  SC.viz.stay.mount(host, model, { type, location, onPick }) -> { set({ type, location }), model(), destroy() }.
  Upper panel: the location's share (%) as a line. Lower panel: the total number of tourists for the accommodation type as bars.
  The two panels have their own scales and never share an axis. A year with the publisher's marker (u or ...) shows the marker,
  not a point. A series break (Pafos/Polis after 2023) is a dashed line. Still data: nothing moves.
  The page builds two <select>s: model.choices (accommodation types) and model.locations (reporting locations), then calls set().
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const tx = (p) => (Array.isArray(p) ? p[(window.SC && SC.lang === 'el') ? 1 : 0] : String(p == null ? '' : p));
  const CY = '#7DD3FC', AM = '#FBBF24', DIM = '#9fb2cc', GRID = 'rgba(125,211,252,.14)';

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.stayData;
    let m = model, picked = -1, pinned = -1, W = 0, H = 0, raf = 0, dead = false, G = null;
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%';
    host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    if (D && (opts.type != null || opts.location != null)) m = D.select(m, { type: opts.type, location: opts.location });
    const pts = () => (m && m.points) || [];
    const aria = () => host.setAttribute('aria-label', tx(picked >= 0 && pts()[picked] ? pts()[picked].label : m.ariaLabel));

    function lines(s, w, font) { ctx.font = font; const out = []; let line = ''; for (const word of String(s).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
    const B13 = '700 13px ' + MONO, B11 = '700 11px ' + MONO, F12 = '12px ' + MONO, F11 = '11px ' + MONO, F10 = '10px ' + MONO;
    const readText = (i) => tx(pts()[i].label) + (m.breaks.length ? ' ' + tx(m.breaks[0].text) : '');
    function layout() {
      W = Math.max(240, host.clientWidth || 320);
      const small = W < 520, pad = 10, gut = small ? 50 : 58, x0 = pad + gut, x1 = W - pad - 8, h1 = small ? 150 : 190, h2 = small ? 96 : 120, w = W - 2 * pad, ok = m && m.available;
      const L = ok ? { name: lines(tx(m.locationName), w, B13), type: lines(tx(m.strings.accommodation) + ': ' + tx(m.typeName), w, F11), still: lines(tx(m.strings.still), w, F11), cap1: lines(tx(m.strings.shareAxis), w, B11), cap2: lines(tx(m.strings.totalAxis), w, B11), key: lines(tx(m.strings.markerKey), w, F10) } : { name: [], type: [], still: [], cap1: [], cap2: [], key: [] };
      const nameY = 17, typeY = nameY + (L.name.length - 1) * 17 + 17, stillY = typeY + L.type.length * 15, y1 = stillY + L.still.length * 15 + 10 + L.cap1.length * 14, y2 = y1 + h1 + 36 + L.cap2.length * 14, keyY = y2 + h2 + 32, readY = keyY + L.key.length * 13 + 10;
      let nRead = ok ? lines(tx(m.strings.hint), w, F12).length : 3; if (ok) pts().forEach((p, i) => { nRead = Math.max(nRead, lines(readText(i), w, F12).length); });
      G = { small, pad, x0, x1, y1, h1, y2, h2, L, nameY, typeY, stillY, keyY, readY, step: (x1 - x0) / Math.max(1, pts().length) };
      H = readY + nRead * 16;
      const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const cx = (i) => G.x0 + (i + 0.5) * G.step;
    function frame(y, h, sc, title, color) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color; ctx.font = B11; title.forEach((l, i) => ctx.fillText(l, G.pad, y - 11 - (title.length - 1 - i) * 14));
      ctx.font = '10px ' + MONO; ctx.lineWidth = 1;
      for (const t of sc.ticks) { const ty = y + h - (t.v / sc.max) * h; ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(G.x0, ty + .5); ctx.lineTo(G.x1, ty + .5); ctx.stroke(); ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.fillText(tx(t.text), G.x0 - 6, ty + 3); }
      ctx.textAlign = 'center'; ctx.fillStyle = DIM; pts().forEach((p, i) => ctx.fillText(G.step < 30 ? "'" + String(p.year).slice(2) : String(p.year), cx(i), y + h + 14));
    }
    function mark(i, y, h, text) { ctx.font = '700 12px ' + MONO; ctx.textAlign = 'center'; const w = Math.max(16, ctx.measureText(text).width + 8); ctx.fillStyle = 'rgba(90,100,115,.35)'; ctx.fillRect(cx(i) - w / 2, y + h - 22, w, 17); ctx.strokeStyle = 'rgba(160,175,195,.7)'; ctx.lineWidth = 1; ctx.strokeRect(cx(i) - w / 2 + .5, y + h - 21.5, w - 1, 16); ctx.fillStyle = '#EAF0F7'; ctx.fillText(text, cx(i), y + h - 9); }
    function draw() {
      raf = 0; if (dead) return; ctx.clearRect(0, 0, W, H);
      if (!m || !m.available) { ctx.fillStyle = DIM; ctx.font = '12px ' + MONO; ctx.textAlign = 'left'; lines(tx(m && m.empty), W - 20, '12px ' + MONO).forEach((l, i) => ctx.fillText(l, 10, 24 + i * 16)); return; }
      const P = pts(), S = m.scales, g = G;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#EAF0F7'; ctx.font = B13; g.L.name.forEach((l, i) => ctx.fillText(l, g.pad, g.nameY + i * 17));
      ctx.fillStyle = DIM; ctx.font = F11; g.L.type.forEach((l, i) => ctx.fillText(l, g.pad, g.typeY + i * 15));
      ctx.fillStyle = AM; g.L.still.forEach((l, i) => ctx.fillText(l, g.pad, g.stillY + i * 15));
      // picked year: one band across both panels
      if (picked >= 0) { ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(cx(picked) - g.step / 2, g.y1, g.step, g.h1); ctx.fillRect(cx(picked) - g.step / 2, g.y2, g.step, g.h2); }
      // upper panel: share, %
      frame(g.y1, g.h1, S.share, g.L.cap1, CY);
      const sy = (v) => g.y1 + g.h1 - (v / S.share.max) * g.h1, brk = m.breaks.map((b) => b.index);
      ctx.strokeStyle = CY; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(125,211,252,.5)'; ctx.shadowBlur = 6;
      for (let i = 1; i < P.length; i++) if (P[i].share != null && P[i - 1].share != null && brk.indexOf(i - 1) < 0) { ctx.beginPath(); ctx.moveTo(cx(i - 1), sy(P[i - 1].share)); ctx.lineTo(cx(i), sy(P[i].share)); ctx.stroke(); }
      ctx.shadowBlur = 0;
      P.forEach((p, i) => { if (p.share != null) { ctx.beginPath(); ctx.arc(cx(i), sy(p.share), i === picked ? 5 : 3.5, 0, 6.2832); ctx.fillStyle = i === picked ? '#fff' : CY; ctx.fill(); } else mark(i, g.y1, g.h1, p.marker || '?'); });
      for (const b of m.breaks) { const bx = g.x0 + (b.index + 1) * g.step; ctx.strokeStyle = AM; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(bx, g.y1); ctx.lineTo(bx, g.y1 + g.h1); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '10px ' + MONO; ctx.fillStyle = AM; const t = tx(m.strings.brk), right = bx + 6 + ctx.measureText(t).width < g.x1; ctx.textAlign = right ? 'left' : 'right'; ctx.fillText(t, bx + (right ? 6 : -6), g.y1 + 11); }
      // lower panel: total number, its own scale
      frame(g.y2, g.h2, S.total, g.L.cap2, AM);
      const bw = Math.max(6, Math.min(34, g.step * 0.56));
      P.forEach((p, i) => { if (p.total != null) { const h = (p.total / S.total.max) * g.h2; ctx.fillStyle = i === picked ? '#FDE68A' : 'rgba(251,191,36,.72)'; ctx.fillRect(cx(i) - bw / 2, g.y2 + g.h2 - h, bw, Math.max(1, h)); } else mark(i, g.y2, g.h2, p.totalMarker || '?'); });
      ctx.textAlign = 'left'; ctx.font = F10; ctx.fillStyle = DIM; g.L.key.forEach((l, i) => ctx.fillText(l, g.pad, g.keyY + i * 13));
      // read-out
      const text = picked >= 0 ? readText(picked) : tx(m.strings.hint);
      ctx.fillStyle = picked >= 0 ? '#fff' : '#8ea3bf'; lines(text, W - 2 * g.pad, F12).forEach((l, i) => ctx.fillText(l, g.pad, g.readY + i * 16));
    }
    const ask = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    function hit(ev) { const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; if (!G || x < G.x0 || x > G.x1 || y < G.y1 - 10 || y > G.y2 + G.h2 + 18) return -1; const i = Math.floor((x - G.x0) / G.step); return i >= 0 && i < pts().length ? i : -1; }
    function pick(i, quiet) { if (i === picked) return; picked = i; aria(); ask(); if (!quiet && opts.onPick) { const p = i >= 0 ? pts()[i] : null; opts.onPick(p ? { year: p.year, share: p.share, marker: p.marker, total: p.total, totalMarker: p.totalMarker, type: m.type, location: m.location, typeName: m.typeName, locationName: m.locationName, label: p.label } : null); } }
    const onMove = (ev) => { const i = hit(ev); pick(i >= 0 ? i : pinned); cv.style.cursor = i >= 0 ? 'pointer' : 'default'; };
    const onLeave = () => pick(pinned);
    const onClick = (ev) => { const i = hit(ev); pinned = i; pick(i); };
    const onKey = (ev) => { const n = pts().length; if (!n) return; let i = picked;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') i = picked < 0 ? 0 : Math.min(n - 1, picked + 1); else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') i = picked < 0 ? n - 1 : Math.max(0, picked - 1); else if (ev.key === 'Home') i = 0; else if (ev.key === 'End') i = n - 1; else if (ev.key === 'Escape') i = -1; else return;
      ev.preventDefault(); pinned = i; pick(i); };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { layout(); ask(); }) : null; if (ro) ro.observe(host);
    layout(); aria(); draw();
    return {
      // set({ type, location }): ids from model.choices / model.locations. The picked year is kept, so a year can be followed across locations.
      set(o) { if (o && D) { const n = D.select(m, { type: o.type, location: o.location }); if (n !== m) { m = n; if (picked >= pts().length) picked = pinned = -1; } } layout(); aria(); ask(); return m; },
      model: () => m,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); },
    };
  }
  SC.viz.stay = { mount };
})();
