/*
  lidar.js: aerosol classes above Limassol on ONE day, as a grid: hours (UTC) across, altitude bands up.
  SC.viz.lidar.mount(host, model, { measure, onPick }) -> { set({ measure }), model(), destroy() }.
  The page builds its own <select> from model.choices ('only' = class 8, 'insects' = class 10) and calls set().
  Each cell is coloured by the share of its grid cells in the chosen class; the two classes are never added.
  A cell with no classified data is hatched grey (unknown, not zero). Historical data: nothing moves except a
  one-time fade-in (none under prefers-reduced-motion). Pointer, click and the four arrow keys read one cell.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const tx = (p) => (Array.isArray(p) ? p[(window.SC && SC.lang === 'el') ? 1 : 0] : String(p == null ? '' : p));
  const RAMP = { only: [[24, 38, 62], [125, 211, 252]], insects: [[24, 38, 62], [251, 191, 36]] };
  const mix = (r, t) => { const a = r[0], b = r[1], k = Math.max(0, Math.min(1, t)); return 'rgb(' + [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)).join(',') + ')'; };

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.lidarData;
    let m = model, picked = -1, pinned = -1, W = 0, H = 0, raf = 0, dead = false, grid = null, fade = 1, t0 = 0;
    const still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%';
    host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    if (D && m && m.available && opts.measure) m = D.select(m, opts.measure);
    const cells = () => (m && m.cells) || [];
    const aria = () => host.setAttribute('aria-label', tx(picked >= 0 && cells()[picked] ? cells()[picked].label : m.ariaLabel || m.empty));
    function wrap(s, x, y, w, lh, dry) { let line = ''; for (const word of String(s).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { if (!dry) ctx.fillText(line, x, y); y += lh; line = word; } else line = t; } if (line) { if (!dry) ctx.fillText(line, x, y); y += lh; } return y; }
    function hatch(x, y, w, h) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.fillStyle = 'rgba(90,100,115,.35)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(160,175,195,.6)'; ctx.lineWidth = 1; ctx.beginPath(); for (let d = -h; d < w + h; d += 5) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); } ctx.stroke(); ctx.restore(); }

    function pass(dry) {
      const pad = 10, w = W - 2 * pad, small = W < 520; let y = pad + 13;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      if (!m || !m.available) { ctx.font = '12px ' + MONO; ctx.fillStyle = '#8ea3bf'; return wrap(tx(m && m.empty), pad, y + 6, w, 16, dry) + pad; }
      const key = m.shareKey, ramp = RAMP[m.measure] || RAMP.only;
      ctx.font = '700 13px ' + MONO; ctx.fillStyle = '#EAF0F7'; y = wrap(tx(m.strings.title) + ': ' + tx(m.measureName), pad, y, w, 17, dry);
      ctx.font = '11px ' + MONO; ctx.fillStyle = '#FBBF24'; y = wrap(tx(m.strings.still), pad, y, w, 15, dry);
      ctx.font = '10px ' + MONO; ctx.fillStyle = '#9fb2cc'; y = wrap(tx(m.strings.yAxis), pad, y + 4, w, 14, dry) + 2;
      // the grid: hours across, bands up (lowest band at the bottom); rows have one height although bands differ in thickness
      const nb = m.bands.length, nh = m.hours.length, left = pad + (small ? 62 : 86), gw = Math.max(120, W - left - pad), cw = gw / nh, ch = Math.round(Math.max(34, Math.min(64, W * 0.07))), top = y, gh = ch * nb;
      grid = { left, top, cw, ch, nb, nh };
      if (!dry) {
        ctx.globalAlpha = fade;
        cells().forEach((c, i) => {
          const x = left + c.hour * cw, yy = top + (nb - 1 - c.band) * ch, v = c[key];
          if (v == null) hatch(x + .5, yy + .5, cw - 1, ch - 1);
          else { ctx.fillStyle = mix(ramp, v / m.scale.max); ctx.fillRect(x + .5, yy + .5, cw - 1, ch - 1);
            if (c.incomplete) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + cw - 1, yy + 1); ctx.lineTo(x + cw - 8, yy + 1); ctx.lineTo(x + cw - 1, yy + 8); ctx.closePath(); ctx.fill(); }
            if (cw >= 30) { ctx.font = '10px ' + MONO; ctx.textAlign = 'center'; ctx.fillStyle = v > 55 ? '#050b16' : '#dbe6f5'; ctx.fillText(Math.round(v) + '%', x + cw / 2, yy + ch / 2 + 3); ctx.textAlign = 'left'; } }
        });
        ctx.globalAlpha = 1;
        ctx.font = '10px ' + MONO; ctx.fillStyle = '#9fb2cc'; ctx.textAlign = 'right';
        m.bands.forEach((b, bi) => { const yy = top + (nb - 1 - bi) * ch + ch / 2 + 3; ctx.fillText(small ? b.lower + '–' + b.upper : tx(b.name), left - 6, yy); });
        ctx.textAlign = 'center'; const every = cw >= 26 ? 1 : cw >= 16 ? 2 : 3;
        m.hours.forEach((h) => { if (h % every === 0) ctx.fillText((h < 10 ? '0' : '') + h, left + h * cw + cw / 2, top + gh + 13); });
        ctx.textAlign = 'left';
        if (picked >= 0 && cells()[picked]) { const c = cells()[picked]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(left + c.hour * cw + .5, top + (nb - 1 - c.band) * ch + .5, cw - 1, ch - 1); }
      }
      y = top + gh + 28;
      ctx.font = '10px ' + MONO; ctx.fillStyle = '#9fb2cc'; if (!dry) { ctx.textAlign = 'right'; ctx.fillText(tx(m.strings.xAxis), W - pad, y); ctx.textAlign = 'left'; } y += 12;
      // key: one fixed scale, 0 to 100 percent, the same for both classes; plus the hatch for unknown
      const kw = Math.min(180, w * 0.5);
      if (!dry) { const g = ctx.createLinearGradient(pad, 0, pad + kw, 0); g.addColorStop(0, mix(ramp, 0)); g.addColorStop(1, mix(ramp, 1)); ctx.fillStyle = g; ctx.fillRect(pad, y, kw, 8); ctx.fillStyle = '#9fb2cc'; ctx.fillText('0%', pad, y + 21); ctx.textAlign = 'right'; ctx.fillText('100%', pad + kw, y + 21); ctx.textAlign = 'left'; if (small) { hatch(pad, y + 30, 14, 8); ctx.fillStyle = '#9fb2cc'; ctx.fillText(tx(m.strings.unknown), pad + 20, y + 38); } else { hatch(pad + kw + 14, y, 14, 8); ctx.fillStyle = '#9fb2cc'; ctx.fillText(tx(m.strings.unknown), pad + kw + 34, y + 8); } }
      y += small ? 54 : 36; ctx.font = '10px ' + MONO; ctx.fillStyle = '#9fb2cc'; y = wrap('% ' + tx(m.strings.keyOf) + (m.counts.incomplete ? ' · ◥ ' + tx(m.strings.partly) : ''), pad, y, w, 14, dry) + 4;
      ctx.font = '12px ' + MONO; ctx.fillStyle = '#EAF0F7'; y = wrap(tx(m.counts.text), pad, y + 2, w, 16, dry) + 2;
      ctx.font = '11px ' + MONO; ctx.fillStyle = '#9fb2cc'; y = wrap(tx(m.strings.limit), pad, y, w, 15, dry) + 4;
      // read-out: one cell, both classes with both counts, and how many cells were classified
      const ry = y + 2;
      if (!dry) {
        if (picked >= 0 && cells()[picked]) { const c = cells()[picked]; let yy = ry; ctx.font = '700 12px ' + MONO; ctx.fillStyle = '#fff'; yy = wrap(tx(c.whereText), pad, yy, w, 16, false); ctx.font = '12px ' + MONO;
          if (!c.unknown) { ctx.fillStyle = '#7DD3FC'; yy = wrap(tx(c.onlyText), pad, yy, w, 15, false); ctx.fillStyle = '#FBBF24'; yy = wrap(tx(c.insectsText), pad, yy, w, 15, false); }
          ctx.fillStyle = '#EAF0F7'; wrap(tx(c.statusText), pad, yy, w, 15, false); }
        else { ctx.font = '12px ' + MONO; ctx.fillStyle = '#8ea3bf'; wrap(tx(m.strings.hint), pad, ry, w, 16, false); }
      }
      y = ry + (small ? 16 * 2 + 15 * 7 : 16 + 15 * 3) + 4;
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
      if (fade < 1) { if (!t0) t0 = now || performance.now(); fade = Math.min(1, ((now || performance.now()) - t0) / 500); }
      ctx.clearRect(0, 0, W, H); pass(false);
      if (fade < 1 && !document.hidden) raf = requestAnimationFrame(draw); else fade = 1;
    }
    const ask = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    const index = (hour, band) => cells().findIndex((c) => c.hour === hour && c.band === band);
    function hit(ev) {
      if (!grid || !cells().length) return -1;
      const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      const h = Math.floor((x - grid.left) / grid.cw), row = Math.floor((y - grid.top) / grid.ch);
      if (h < 0 || h >= grid.nh || row < 0 || row >= grid.nb) return -1;
      return index(m.hours[h], grid.nb - 1 - row);
    }
    function pick(i, quiet) {
      if (i === picked) return; picked = i; aria(); ask();
      if (!quiet && opts.onPick) { const c = i >= 0 ? cells()[i] : null; opts.onPick(c ? { date: m.date, hourUTC: c.hour, lowerM: c.lower, upperM: c.upper, gridCells: c.grid, classifiedCells: c.classified, aerosolOnlyCells: c.only, aerosolWithInsectsCells: c.insects, shareOnly: c.shareOnly, shareInsects: c.shareInsects, unknown: c.unknown, measure: m.measure, label: c.label } : null); }
    }
    const onMove = (ev) => { const i = hit(ev); pick(i >= 0 ? i : pinned); cv.style.cursor = i >= 0 ? 'pointer' : 'default'; };
    const onLeave = () => pick(pinned);
    const onClick = (ev) => { const i = hit(ev); pinned = i; pick(i); };
    const onKey = (ev) => { if (!cells().length || !grid) return; const c = picked >= 0 ? cells()[picked] : null; let h = c ? c.hour : 0, b = c ? c.band : 0, i;
      if (ev.key === 'Escape') i = -1; else if (ev.key === 'Home') i = index(0, b); else if (ev.key === 'End') i = index(grid.nh - 1, b);
      else if (!c && /^Arrow/.test(ev.key)) i = index(0, 0);
      else if (ev.key === 'ArrowRight') i = index(Math.min(grid.nh - 1, h + 1), b); else if (ev.key === 'ArrowLeft') i = index(Math.max(0, h - 1), b);
      else if (ev.key === 'ArrowUp') i = index(h, Math.min(grid.nb - 1, b + 1)); else if (ev.key === 'ArrowDown') i = index(h, Math.max(0, b - 1)); else return;
      ev.preventDefault(); pinned = i; pick(i); };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const w = Math.max(240, host.clientWidth || 320); if (w !== W) { layout(); ask(); } }) : null; if (ro) ro.observe(host);
    const onVis = () => { if (!document.hidden) ask(); }; document.addEventListener('visibilitychange', onVis);
    layout(); aria();
    if (still || !m || !m.available) { fade = 1; draw(); } else { fade = 0; ask(); } // the only motion: one fade-in
    return {
      // the picked cell stays picked when the measure changes: it is the same hour and band, read with the other colour
      set(o) { if (o && o.measure && D && m && m.available) m = D.select(m, o.measure); layout(); aria(); ask(); return m; },
      model: () => m,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); },
    };
  }
  SC.viz.lidar = { mount };
})();
