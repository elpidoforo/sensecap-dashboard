/*
  argo.js: ONE dive of one Argo float: temperature against pressure and salinity against pressure, two panels side by side,
  pressure growing downward (dbar, as measured; not converted to metres).
  SC.viz.argo.mount(host, model, { cycle, qc, range, onPick }) -> { set({cycle, qc, range}), model(), destroy() }.
  The page builds three <select>s: model.choices (dives by date), model.qcChoices ('good' | 'all') and model.rangeChoices
  ('full' | 'top'), each {id, name:[en,el]}, and calls set({cycle: id}), set({qc: id}) or set({range: id}); set returns the model.
  Archive data: nothing moves except a one-time entrance (none under prefers-reduced-motion). Gaps stay gaps.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const CY = '#7DD3FC', GR = '#6EE7B7', AM = '#FBBF24', INK = '#EAF0F7', DIM = '#9fb2cc', GRID = 'rgba(125,211,252,.13)';
  const tx = (p) => (Array.isArray(p) ? p[(window.SC && SC.lang === 'el') ? 1 : 0] : String(p == null ? '' : p));

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.argoData;
    let m = model, picked = -1, pinned = -1, W = 0, H = 0, L = null, raf = 0, dead = false, anim = 1, t0 = 0;
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%';
    host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    if (D && (opts.cycle || opts.qc || opts.range)) m = D.select(m, { cycle: opts.cycle, qc: opts.qc, range: opts.range });
    const ok = () => m && m.available && m.levels;
    const item = (i) => { const l = ok() && m.levels[i]; return l ? { kind: 'level', cycle: m.cycle, scheme: l.scheme, pressure: l.p, temperature: l.tShow ? l.t : null, salinity: l.sShow ? l.s : null, temperatureFlag: l.tq, salinityFlag: l.sq, adjusted: l.adjusted, label: l.label } : null; };
    const aria = () => host.setAttribute('aria-label', tx(picked >= 0 && item(picked) ? item(picked).label : (m && (m.ariaLabel || m.empty)) || ''));
    function lines(s, font, w) { ctx.font = font; const out = []; let line = ''; for (const word of String(s).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
    function put(ls, x, y, lh, font, color) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ls.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); return y + ls.length * lh; }
    function size(dpr) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

    function layout() {
      const w = Math.max(240, host.clientWidth || 320), pad = 12, full = w - 2 * pad, dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!ok()) { const e = lines(tx((m && m.empty) || ''), '13px ' + MONO, full); L = { empty: e, pad }; W = w; H = pad * 2 + e.length * 18 + 6; size(dpr); return; }
      const S = m.strings; let y = pad + 12;
      const title = lines(tx(S.title) + ' · ' + tx(S.taken) + ' ' + tx(m.dateText), '700 13px ' + MONO, full); const titleY = y; y += title.length * 17;
      const where = lines(tx(m.place) + ' (' + tx(S.near) + ')', '12px ' + MONO, full); const whereY = y; y += where.length * 16;
      const still = lines(tx(S.still) + ' · ' + tx(m.valueKind) + ' · ' + tx(S.noDec), '11px ' + MONO, full); const stillY = y; y += still.length * 15 + 4;
      const pres = lines('↓ ' + tx(S.pres), '10px ' + MONO, full); const presY = y; y += pres.length * 13 + 16;
      const gut = 42, gap = w < 520 ? 12 : 22, pw = (full - gut - gap) / 2, ph = w < 520 ? 330 : 400;
      const panels = [{ k: 't', name: S.temp, color: CY, sc: m.scales.t, x: pad + gut, y, w: pw, h: ph, d: 0 }, { k: 's', name: S.sal, color: GR, sc: m.scales.s, x: pad + gut + pw + gap, y, w: pw, h: ph, d: 1 }];
      y += ph + 24;
      const count = lines(tx(m.countText) + ' ' + tx(m.rangeText), '11px ' + MONO, full); const countY = y + 6; y = countY + count.length * 15;
      const key = lines([tx(S.keyLine), tx(S.keySurf)].concat(m.qc === 'all' ? [tx(S.keyFlag)] : []).join(' · '), '11px ' + MONO, full); const keyY = y + 2; y = keyY + key.length * 15;
      const limit = lines(tx(S.limit), '11px ' + MONO, full); const limitY = y + 4; y = limitY + limit.length * 15;
      const readLines = w < 520 ? 6 : w < 900 ? 4 : 2, readY = y + 8; y = readY + readLines * 16;
      L = { pad, full, title, titleY, where, whereY, still, stillY, pres, presY, panels, gut, count, countY, key, keyY, limit, limitY, readY, readLines };
      W = w; H = y + pad - 8; size(dpr);
    }
    const X = (p, v) => p.x + v * p.w, Y = (p, v) => p.y + v * p.h;
    function series(p) {
      const k = p.k === 't' ? 'tx' : 'sx', show = p.k === 't' ? 'tShow' : 'sShow', good = p.k === 't' ? 'tGood' : 'sGood';
      // main profile: one line, broken wherever the source has a gap or a value is filtered out (no bridging)
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.beginPath(); let prev = null, lonely = [];
      const main = m.levels.filter((l) => l.scheme === 0);
      main.forEach((l, j) => {
        if (!l[show]) { prev = null; return; }
        const joined = prev && Math.abs(l.i - prev.i) === 1;
        if (joined) ctx.lineTo(X(p, l[k]), Y(p, l.y)); else { ctx.moveTo(X(p, l[k]), Y(p, l.y)); const nx = main[j + 1]; if (!(nx && nx[show] && Math.abs(nx.i - l.i) === 1)) lonely.push(l); }
        prev = l;
      });
      ctx.stroke();
      ctx.fillStyle = p.color; lonely.forEach((l) => { ctx.beginPath(); ctx.arc(X(p, l[k]), Y(p, l.y), 2, 0, 6.3); ctx.fill(); });
      // values not flagged good (only present in the all-values view): amber dots on top
      ctx.fillStyle = AM; main.forEach((l) => { if (l[show] && !l[good]) { ctx.beginPath(); ctx.arc(X(p, l[k]), Y(p, l.y), 2.6, 0, 6.3); ctx.fill(); } });
      // second profile near the surface: hollow squares, never joined to the main line
      ctx.lineWidth = 1.3; m.levels.forEach((l) => { if (l.scheme === 0 || !l[show]) return; ctx.strokeStyle = l[good] ? p.color : AM; ctx.strokeRect(X(p, l[k]) - 3, Y(p, l.y) - 3, 6, 6); });
    }
    function draw(now) {
      raf = 0; if (dead || !L) return; ctx.clearRect(0, 0, W, H);
      if (L.empty) { put(L.empty, L.pad, L.pad + 14, 18, '13px ' + MONO, DIM); return; }
      if (anim < 1) anim = Math.min(1, ((now || performance.now()) - t0) / 600);
      const S = m.strings, e = 1 - Math.pow(1 - anim, 3);
      put(L.title, L.pad, L.titleY, 17, '700 13px ' + MONO, INK); put(L.where, L.pad, L.whereY, 16, '12px ' + MONO, INK);
      put(L.still, L.pad, L.stillY, 15, '11px ' + MONO, AM); put(L.pres, L.pad, L.presY + 2, 13, '10px ' + MONO, DIM);
      const step = m.pTop <= 300 ? 50 : m.pTop <= 1000 ? 200 : 500, pk = picked >= 0 ? m.levels[picked] : null;
      for (const p of L.panels) {
        ctx.fillStyle = p.color; ctx.font = '700 12px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(tx(p.name), p.x, p.y - 7);
        ctx.fillStyle = 'rgba(125,211,252,.035)'; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.strokeStyle = 'rgba(125,211,252,.35)'; ctx.lineWidth = 1; ctx.strokeRect(p.x + .5, p.y + .5, p.w - 1, p.h - 1);
        ctx.font = '10px ' + MONO;
        for (let v = 0; v <= m.pTop + 1e-9; v += step) { const gy = Math.round(Y(p, v / m.pTop)) + .5; if (v > 0 && v < m.pTop) { ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(p.x, gy); ctx.lineTo(p.x + p.w, gy); ctx.stroke(); } if (p.d === 0) { ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(v), p.x - 6, gy); } }
        const dec = p.k === 't' ? 0 : 2;
        [0, .5, 1].forEach((f) => { const v = p.sc.min + (p.sc.max - p.sc.min) * f, gx = Math.round(X(p, f)) + .5; if (f === .5) { ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(gx, p.y); ctx.lineTo(gx, p.y + p.h); ctx.stroke(); } ctx.fillStyle = DIM; ctx.textBaseline = 'alphabetic'; ctx.textAlign = f === 0 ? 'left' : f === 1 ? 'right' : 'center'; ctx.fillText(p.k === 't' && Number.isInteger(v) ? String(v) : v.toFixed(p.k === 't' ? 1 : dec), f === 0 ? p.x : f === 1 ? p.x + p.w : gx, p.y + p.h + 14); });
        ctx.save(); ctx.beginPath(); ctx.rect(p.x - 4, p.y - 4, p.w + 8, (p.h + 8) * e); ctx.clip(); series(p); ctx.restore();
        if (!m.levels.length) { const nl = lines(tx(S.none), '11px ' + MONO, p.w - 16); put(nl, p.x + 8, p.y + 22, 15, '11px ' + MONO, DIM); }
        if (pk) { // the picked level: one line across both panels at its pressure
          const gy = Y(p, pk.y); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, gy); ctx.lineTo(p.x + p.w, gy); ctx.stroke();
          const v = p.k === 't' ? pk.tx : pk.sx; if (v != null) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(p, v), gy, 4, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#050b16'; ctx.lineWidth = 1.5; ctx.stroke(); }
        }
      }
      if (pk) { const p0 = L.panels[0], gy = Y(p0, pk.y), s = pk.p.toFixed(1); ctx.font = '700 10px ' + MONO; const tw = ctx.measureText(s).width; ctx.fillStyle = '#050b16'; ctx.fillRect(p0.x - 8 - tw, gy - 7, tw + 6, 14); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(s, p0.x - 5, gy); }
      put(L.count, L.pad, L.countY + 8, 15, '11px ' + MONO, INK); put(L.key, L.pad, L.keyY + 8, 15, '11px ' + MONO, DIM); put(L.limit, L.pad, L.limitY + 8, 15, '11px ' + MONO, DIM);
      const it = picked >= 0 ? item(picked) : null, rl = lines(tx(it ? it.label : S.hint), '12px ' + MONO, L.full).slice(0, L.readLines);
      put(rl, L.pad, L.readY + 8, 16, '12px ' + MONO, it ? '#fff' : '#8ea3bf');
      if (anim < 1) ask();
    }
    const ask = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    // the level whose pressure is nearest to the pointer (levels are in pressure order)
    function hit(ev) {
      if (!ok() || !m.levels.length || !L.panels) return -1;
      const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, a = L.panels[0], b = L.panels[1];
      if (x < a.x - L.gut || x > b.x + b.w + 6 || y < a.y - 8 || y > a.y + a.h + 8) return -1;
      const v = (y - a.y) / a.h; let lo = 0, hi = m.levels.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (m.levels[mid].y < v) lo = mid; else hi = mid; }
      return Math.abs(m.levels[lo].y - v) <= Math.abs(m.levels[hi].y - v) ? lo : hi;
    }
    function pick(i, quiet) { if (i === picked) return; picked = i; aria(); ask(); if (!quiet && opts.onPick) opts.onPick(i >= 0 ? item(i) : null); }
    const onMove = (ev) => { const i = hit(ev); pick(i >= 0 ? i : pinned); cv.style.cursor = i >= 0 ? 'crosshair' : 'default'; };
    const onLeave = () => pick(pinned);
    const onClick = (ev) => { const i = hit(ev); pinned = i; pick(i); };
    const onKey = (ev) => { const n = ok() ? m.levels.length : 0; if (!n) return; let i = picked; const cl = (v) => Math.max(0, Math.min(n - 1, v));
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') i = cl(picked + 1); else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') i = picked < 0 ? 0 : cl(picked - 1);
      else if (ev.key === 'PageDown') i = cl(picked + 25); else if (ev.key === 'PageUp') i = cl(picked - 25);
      else if (ev.key === 'Home') i = 0; else if (ev.key === 'End') i = n - 1; else if (ev.key === 'Escape') i = -1; else return;
      ev.preventDefault(); pinned = i; pick(i); };
    const onVis = () => { if (document.hidden) anim = 1; ask(); };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onVis);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { layout(); ask(); }) : null; if (ro) ro.observe(host);
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!calm && !document.hidden && ok()) { anim = 0; t0 = performance.now(); }
    layout(); aria(); draw(t0);
    return {
      set(o) { if (o && D) { const n = D.select(m, { cycle: o.cycle, qc: o.qc, range: o.range }); if (n !== m) { m = n; picked = pinned = -1; } } layout(); aria(); ask(); return m; },
      model: () => m,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); },
    };
  }
  SC.viz.argo = { mount };
})();
