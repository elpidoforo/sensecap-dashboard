/*
  pmpair.js: daily PM10 at two OUTDOOR monitors (Nicosia traffic site, Agia Marina Xyliatou background site), ONE year at a time.
  SC.viz.pmpair.mount(host, model, { year, scale, onPick }) -> { set({ year, scale }), model(), destroy() }.
  The page builds its own <select>s from model.choices (years, source order) and model.scaleChoices ('full' | 'zoom').
  Historical data: nothing moves except a one-time reveal of the lines (none under prefers-reduced-motion).
  A day without a pair is a break in the lines. Pointer, click and arrow keys read one day: both values and the difference.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const tx = (p) => (Array.isArray(p) ? p[(window.SC && SC.lang === 'el') ? 1 : 0] : String(p == null ? '' : p));
  const COL = { nictra: '#FBBF24', amx: '#7DD3FC' };

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.pmpairData;
    let m = model, picked = -1, pinned = -1, W = 0, H = 0, raf = 0, dead = false, plot = null, reveal = 1, t0 = 0;
    const still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%';
    host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    if (D && m && m.available && (opts.year || opts.scale)) m = D.select(m, opts.year, opts.scale);
    const days = () => (m && m.days) || [];
    const aria = () => host.setAttribute('aria-label', tx(picked >= 0 && days()[picked] ? days()[picked].label : m.ariaLabel || m.empty));

    // wrapped text: returns the y after the last line; with dry = true it only measures
    function wrap(s, x, y, w, lh, dry) { let line = ''; for (const word of String(s).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { if (!dry) ctx.fillText(line, x, y); y += lh; line = word; } else line = t; } if (line) { if (!dry) ctx.fillText(line, x, y); y += lh; } return y; }

    // one pass lays the picture out from top to bottom; the dry pass gives the height, the second pass draws
    function pass(dry) {
      const pad = 10, w = W - 2 * pad; let y = pad + 13;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      if (!m || !m.available) { ctx.font = '12px ' + MONO; ctx.fillStyle = '#8ea3bf'; return wrap(tx(m && m.empty), pad, y + 6, w, 16, dry) + pad; }
      ctx.font = '700 13px ' + MONO; ctx.fillStyle = '#EAF0F7'; y = wrap(tx(m.strings.title) + ' · ' + m.year, pad, y, w, 17, dry);
      ctx.font = '11px ' + MONO; ctx.fillStyle = '#FBBF24'; y = wrap(tx(m.strings.still), pad, y, w, 15, dry) + 3;
      // legend: colour plus the name and what kind of monitor it is
      for (const k of ['nictra', 'amx']) {
        const s = m.sites[k]; ctx.font = '11px ' + MONO;
        if (!dry) { ctx.strokeStyle = COL[k]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(pad, y - 4); ctx.lineTo(pad + 18, y - 4); ctx.stroke(); }
        ctx.fillStyle = COL[k]; y = wrap(tx(s.name) + ': ' + tx(s.kind), pad + 24, y, w - 24, 15, dry);
      }
      y += 6;
      // the plot
      const left = pad + 34, pw = Math.max(120, W - left - pad - 4), ph = Math.round(Math.max(170, Math.min(340, W * 0.34))), top = y, max = m.axisMax || 10;
      const X = (d) => left + d.x * pw, Y = (v) => top + ph - Math.min(1, v / max) * ph;
      plot = { left, top, pw, ph };
      if (!dry) {
        ctx.font = '10px ' + MONO; ctx.lineWidth = 1;
        for (let v = 0; v <= max + 1e-9; v += m.axisStep) { const yy = Math.round(Y(v)) + .5; ctx.strokeStyle = v === 0 ? 'rgba(160,175,195,.55)' : 'rgba(160,175,195,.14)'; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(left + pw, yy); ctx.stroke(); ctx.fillStyle = '#9fb2cc'; ctx.textAlign = 'right'; ctx.fillText(String(v), left - 5, yy + 3); }
        ctx.textAlign = 'left'; ctx.fillStyle = '#9fb2cc'; ctx.fillText(m.unit, left + 4, top + 10);
        // month ticks
        let acc = 0; const lens = [31, m.daysInYear === 366 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        ctx.textAlign = 'center';
        lens.forEach((n, i) => { const x0 = left + (acc / m.daysInYear) * pw, x1 = left + ((acc + n) / m.daysInYear) * pw; if (i) { ctx.strokeStyle = 'rgba(160,175,195,.14)'; ctx.beginPath(); ctx.moveTo(Math.round(x0) + .5, top); ctx.lineTo(Math.round(x0) + .5, top + ph + 4); ctx.stroke(); } ctx.fillStyle = '#9fb2cc'; ctx.fillText(tx(m.monthTicks[i]), (x0 + x1) / 2, top + ph + 15); acc += n; });
        ctx.textAlign = 'left';
        if (!days().length) { ctx.fillStyle = '#8ea3bf'; ctx.font = '12px ' + MONO; ctx.fillText(tx(m.strings.noDays), left + 10, top + ph / 2); }
        // the two daily lines, run by run so that a missing day stays a gap; the reveal is a clip from the left
        ctx.save(); ctx.beginPath(); ctx.rect(left - 2, top - 6, (pw + 4) * reveal, ph + 12); ctx.clip();
        for (const k of ['amx', 'nictra']) {
          ctx.strokeStyle = COL[k]; ctx.fillStyle = COL[k]; ctx.lineWidth = W < 520 ? 1 : 1.3; ctx.lineJoin = 'round';
          for (const run of m.runs) {
            if (run.length === 1) { const d = m.days[run[0]]; ctx.beginPath(); ctx.arc(X(d), Y(d[k]), 1.4, 0, 6.3); ctx.fill(); continue; }
            ctx.beginPath(); run.forEach((i, j) => { const d = m.days[i]; if (j) ctx.lineTo(X(d), Y(d[k])); else ctx.moveTo(X(d), Y(d[k])); }); ctx.stroke();
          }
          // in the close-up, a day above the axis is a small triangle on the top edge (its value is in the read-out)
          if (m.cutDays) for (const d of m.days) if (d[k] > max) { const x = X(d), yy = top + (k === 'amx' ? 7 : 0); ctx.beginPath(); ctx.moveTo(x, yy - 5); ctx.lineTo(x - 3.5, yy + 1); ctx.lineTo(x + 3.5, yy + 1); ctx.closePath(); ctx.fill(); }
        }
        ctx.restore();
        if (picked >= 0 && days()[picked]) { const d = days()[picked], x = Math.round(X(d)) + .5; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + ph); ctx.stroke();
          for (const k of ['amx', 'nictra']) { ctx.fillStyle = COL[k]; ctx.strokeStyle = '#050b16'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, Y(d[k]), 4, 0, 6.3); ctx.fill(); ctx.stroke(); } }
      }
      y = top + ph + 30;
      ctx.font = '10px ' + MONO; ctx.fillStyle = '#8ea3bf'; y = wrap(tx(m.strings.gap), pad, y, w, 14, dry) + 3;
      if (m.scaleText) y = wrap(tx(m.scaleText), pad, y, w, 14, dry) + 3;
      // the two facts of the year: paired days, and the median difference with the days behind it
      ctx.font = '12px ' + MONO; ctx.fillStyle = '#EAF0F7'; y = wrap(tx(m.countText), pad, y + 3, w, 16, dry) + 2;
      ctx.font = '700 12px ' + MONO; ctx.fillStyle = '#fff'; y = wrap(tx(m.medianText), pad, y, w, 16, dry) + 2;
      ctx.font = '11px ' + MONO; ctx.fillStyle = '#9fb2cc'; y = wrap(tx(m.strings.limit), pad, y, w, 15, dry) + 4;
      // read-out: one day, both values and the difference (three lines are always reserved so the picture does not jump)
      const ry = y; ctx.font = '12px ' + MONO;
      if (!dry) {
        if (picked >= 0 && days()[picked]) { const d = days()[picked]; let yy = ry + 2; ctx.font = '700 12px ' + MONO; ctx.fillStyle = '#fff'; ctx.fillText(tx(d.dateText), pad, yy); yy += 16; ctx.font = '12px ' + MONO;
          ctx.fillStyle = COL.nictra; yy = wrap(tx(d.nictraText), pad, yy, w, 15, false); ctx.fillStyle = COL.amx; yy = wrap(tx(d.amxText), pad, yy, w, 15, false); ctx.fillStyle = '#EAF0F7'; wrap(tx(d.diffText), pad, yy, w, 15, false); }
        else { ctx.fillStyle = '#8ea3bf'; wrap(tx(m.strings.hint), pad, ry + 2, w, 16, false); }
      }
      y = ry + 16 + 15 * (W < 520 ? 5 : 3) + 4;
      ctx.font = '10px ' + MONO; ctx.fillStyle = '#6f84a3'; y = wrap(tx(m.strings.source), pad, y, w, 14, dry);
      return y + pad - 6;
    }
    function layout() {
      W = Math.max(240, host.clientWidth || 320);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0); H = Math.ceil(pass(true));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw(now) {
      raf = 0; if (dead) return;
      if (reveal < 1) { if (!t0) t0 = now || performance.now(); reveal = Math.min(1, ((now || performance.now()) - t0) / 700); }
      ctx.clearRect(0, 0, W, H); pass(false);
      if (reveal < 1 && !document.hidden) raf = requestAnimationFrame(draw); else reveal = 1;
    }
    const ask = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    function hit(ev) {
      const ds = days(); if (!plot || !ds.length) return -1;
      const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      if (x < plot.left - 6 || x > plot.left + plot.pw + 6 || y < plot.top - 8 || y > plot.top + plot.ph + 20) return -1;
      const f = (x - plot.left) / plot.pw; let lo = 0, hi = ds.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ds[mid].x < f) lo = mid + 1; else hi = mid; }
      if (lo > 0 && Math.abs(ds[lo - 1].x - f) <= Math.abs(ds[lo].x - f)) lo--;
      return Math.abs(ds[lo].x - f) * plot.pw <= Math.max(6, plot.pw / m.daysInYear * 1.5) ? lo : -1; // inside a gap nothing is picked
    }
    function pick(i, quiet) {
      if (i === picked) return; picked = i; aria(); ask();
      if (!quiet && opts.onPick) { const d = i >= 0 ? days()[i] : null; opts.onPick(d ? { date: d.date, year: m.year, nictra: d.nictra, amx: d.amx, diff: d.diff, unit: m.unit, label: d.label } : null); }
    }
    const onMove = (ev) => { const i = hit(ev); pick(i >= 0 ? i : pinned); cv.style.cursor = i >= 0 ? 'pointer' : 'default'; };
    const onLeave = () => pick(pinned);
    const onClick = (ev) => { const i = hit(ev); pinned = i; pick(i); };
    const onKey = (ev) => { const n = days().length; if (!n) return; let i = picked;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') i = picked < 0 ? 0 : Math.min(n - 1, picked + 1); else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') i = picked < 0 ? n - 1 : Math.max(0, picked - 1);
      else if (ev.key === 'PageDown') i = Math.min(n - 1, Math.max(0, picked) + 30); else if (ev.key === 'PageUp') i = Math.max(0, (picked < 0 ? n - 1 : picked) - 30);
      else if (ev.key === 'Home') i = 0; else if (ev.key === 'End') i = n - 1; else if (ev.key === 'Escape') i = -1; else return;
      ev.preventDefault(); pinned = i; pick(i); };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const w = Math.max(240, host.clientWidth || 320); if (w !== W) { layout(); ask(); } }) : null; if (ro) ro.observe(host);
    const onVis = () => { if (!document.hidden) ask(); }; document.addEventListener('visibilitychange', onVis);
    layout(); aria();
    if (still || !m || !m.available) { reveal = 1; draw(); } else { reveal = 0; ask(); } // the only motion: the lines are revealed once
    return {
      set(o) { if (o && D && m && m.available) { const n = D.select(m, o.year, o.scale); if (n !== m) { if (n.year !== m.year) { picked = pinned = -1; if (opts.onPick) opts.onPick(null); } m = n; } } layout(); aria(); ask(); return m; },
      model: () => m,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); },
    };
  }
  SC.viz.pmpair = { mount };
})();
