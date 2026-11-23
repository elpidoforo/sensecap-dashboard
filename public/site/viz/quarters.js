/*
  quarters.js: two linked maps of the quarters of ONE city: residents aged 65 and over, and ground classed as tree cover.
  SC.viz.quarters.mount(host, model, { city, onPick }) -> { set({city}), model(), destroy() }.
  Still data: nothing moves. A quarter with no census figure is hatched grey on the age map and says so.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const tx = (p) => (Array.isArray(p) ? p[(window.SC && SC.lang === 'el') ? 1 : 0] : String(p == null ? '' : p));
  // light-to-strong ramps on the dark board; a second cue is always the number in the read-out
  const RAMP = { old: [[28, 44, 70], [251, 191, 36]], tree: [[28, 44, 70], [52, 211, 153]] };
  const mix = (r, t) => { const a = r[0], b = r[1], k = Math.max(0, Math.min(1, t)); return 'rgb(' + [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)).join(',') + ')'; };

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.quartersData;
    let m = model, picked = -1, pinned = -1, W = 0, H = 0, maps = [], raf = 0, dead = false;
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%';
    host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    if (opts.city && D) m = D.select(m, opts.city);
    const aria = () => host.setAttribute('aria-label', tx(picked >= 0 ? m.quarters[picked].label : m.ariaLabel));

    function layout() {
      const w = Math.max(240, host.clientWidth || 320), two = w >= 620, pad = 10, gap = 14, head = 62, key = 52;
      const mw = two ? (w - 2 * pad - gap) / 2 : w - 2 * pad;
      const mh = Math.min(two ? 420 : 380, Math.max(160, mw / (m.aspect || 1)));
      const dw = Math.min(mw, mh * (m.aspect || 1)), dh = dw / (m.aspect || 1);
      maps = m.measures.map((ms, i) => { const x = pad + (two ? i * (mw + gap) : 0), y = pad + (two ? 0 : i * (head + mh + key + 12)); return { ms, x, y, w: mw, mapX: x + (mw - dw) / 2, mapY: y + head, dw, dh, keyY: y + head + mh + 8 }; });
      W = w; H = pad * 2 + (two ? 1 : 2) * (head + mh + key) + (two ? 0 : 12) + 58;
      const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function path(q, mp) { ctx.beginPath(); for (const poly of q.shape) for (const ring of poly) { ring.forEach((p, i) => { const x = mp.mapX + p[0] * mp.dw, y = mp.mapY + p[1] * mp.dh; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); } }
    function hatch(mp) { ctx.save(); ctx.clip('evenodd'); ctx.strokeStyle = 'rgba(160,175,195,.55)'; ctx.lineWidth = 1; ctx.beginPath(); for (let d = -mp.dh; d < mp.dw + mp.dh; d += 6) { ctx.moveTo(mp.mapX + d, mp.mapY); ctx.lineTo(mp.mapX + d + mp.dh, mp.mapY + mp.dh); } ctx.stroke(); ctx.restore(); }
    function draw() {
      raf = 0; if (dead) return; ctx.clearRect(0, 0, W, H);
      for (const mp of maps) {
        const k = mp.ms.k, sc = m.scales[k];
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#EAF0F7'; ctx.font = '700 13px ' + MONO; ctx.fillText(tx(mp.ms.name), mp.x, mp.y + 14);
        ctx.fillStyle = '#FBBF24'; ctx.font = '11px ' + MONO; ctx.fillText(fit(tx(m.cityName), mp.w), mp.x, mp.y + 31); ctx.fillText(fit(tx(m.strings.still), mp.w), mp.x, mp.y + 46);
        m.quarters.forEach((q, i) => {
          const t = k === 'old' ? q.tOld : q.tTree; path(q, mp);
          ctx.fillStyle = t == null ? 'rgba(90,100,115,.35)' : mix(RAMP[k], t); ctx.fill('evenodd');
          if (t == null) { path(q, mp); hatch(mp); }
          path(q, mp); ctx.strokeStyle = i === picked ? '#fff' : 'rgba(5,11,22,.9)'; ctx.lineWidth = i === picked ? 2.5 : 1; ctx.stroke();
        });
        if (picked >= 0) { path(m.quarters[picked], mp); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke(); }
        // key: a fixed scale, the same for every city
        const kw = Math.min(200, mp.w - 60), kx = mp.x, ky = mp.keyY; const g = ctx.createLinearGradient(kx, 0, kx + kw, 0); g.addColorStop(0, mix(RAMP[k], 0)); g.addColorStop(1, mix(RAMP[k], 1));
        ctx.fillStyle = g; ctx.fillRect(kx, ky, kw, 8); ctx.fillStyle = '#9fb2cc'; ctx.font = '10px ' + MONO; ctx.textAlign = 'left'; ctx.fillText(sc.min + '%', kx, ky + 21); ctx.textAlign = 'right'; ctx.fillText(sc.max + '%', kx + kw, ky + 21); ctx.textAlign = 'left';
        ctx.fillText(fit(tx(mp.ms.of), mp.w), kx, ky + 35);
        if (k === 'old' && m.quarters.some((q) => q.noCensus)) { const hy = ky + 41; ctx.fillStyle = 'rgba(90,100,115,.35)'; ctx.fillRect(kx, hy, 14, 8); ctx.strokeStyle = 'rgba(160,175,195,.7)'; ctx.lineWidth = 1; ctx.strokeRect(kx + .5, hy + .5, 13, 7); ctx.fillStyle = '#9fb2cc'; ctx.fillText(fit(tx(m.strings.noCensus), mp.w - 22), kx + 20, hy + 8); }
      }
      // the read-out sentence for the picked quarter, with both counts behind each share
      const y = H - 48; ctx.textAlign = 'left'; ctx.font = '12px ' + MONO;
      if (picked >= 0) { const q = m.quarters[picked]; ctx.fillStyle = '#fff'; ctx.font = '700 13px ' + MONO; ctx.fillText(q.name, 10, y); ctx.font = '12px ' + MONO; ctx.fillStyle = '#FBBF24'; ctx.fillText(fit(tx(q.oldText), W - 20), 10, y + 18); ctx.fillStyle = '#34D399'; ctx.fillText(fit(tx(q.treeText), W - 20), 10, y + 35); }
      else { ctx.fillStyle = '#8ea3bf'; wrap(tx(m.strings.hint), 10, y + 4, W - 20, 16); }
    }
    function fit(s, w) { if (ctx.measureText(s).width <= w) return s; while (s.length > 4 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
    function wrap(s, x, y, w, lh) { let line = ''; for (const word of s.split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, y); y += lh; line = word; } else line = t; } if (line) ctx.fillText(line, x, y); }
    const ask = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    function hit(ev) { const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; for (const mp of maps) for (let i = 0; i < m.quarters.length; i++) { path(m.quarters[i], mp); if (ctx.isPointInPath(x * (cv.width / W), y * (cv.height / H), 'evenodd')) return i; } return -1; }
    function pick(i, quiet) { if (i === picked) return; picked = i; aria(); ask(); if (!quiet && opts.onPick) { const q = i >= 0 ? m.quarters[i] : null; opts.onPick(q ? { code: q.code, name: q.name, residents: q.residents, age65plus: q.age65plus, old: q.old, tree: q.tree, label: q.label, city: m.city } : null); } }
    const onMove = (ev) => { const i = hit(ev); pick(i >= 0 ? i : pinned); cv.style.cursor = i >= 0 ? 'pointer' : 'default'; };
    const onLeave = () => pick(pinned);
    const onClick = (ev) => { const i = hit(ev); pinned = i; pick(i); };
    const onKey = (ev) => { const n = m.quarters.length; if (!n) return; let i = picked;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') i = (picked + 1 + n) % n; else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') i = (picked - 1 + n) % n; else if (ev.key === 'Home') i = 0; else if (ev.key === 'End') i = n - 1; else if (ev.key === 'Escape') i = -1; else return;
      ev.preventDefault(); pinned = i; pick(i); };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { layout(); ask(); }) : null; if (ro) ro.observe(host);
    layout(); aria(); draw();
    return {
      set(o) { if (o && o.city && D) { const n = D.select(m, o.city); if (n !== m) { m = n; picked = pinned = -1; } } layout(); aria(); ask(); return m; },
      model: () => m,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); },
    };
  }
  SC.viz.quarters = { mount };
})();
