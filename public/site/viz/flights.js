/*
  flights.js: a calendar of daily bars for ONE airport and ONE year: international arrivals (up, cyan) and departures (down, amber),
  same unit and same scale. A day with no count in the source is hatched; a published zero is a small ring.
  SC.viz.flights.mount(host, model, { airport, year, onPick }) -> { set({ airport, year }), model(), destroy() }.
  The page builds two <select>s: airports from model.choices and years from model.years, and calls set(), which returns the current model.
  Historical data: nothing moves except one entrance when mounted (none under prefers-reduced-motion).
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const CY = '#7DD3FC', AM = '#FBBF24', INK = '#EAF0F7', DIM = '#9fb2cc';
  const tx = (p) => (Array.isArray(p) ? p[(window.SC && SC.lang === 'el') ? 1 : 0] : String(p == null ? '' : p));

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.flightsData;
    let m = model, picked = -1, pinned = -1, W = 0, H = 0, L = null, raf = 0, dead = false, grow = 1, t0 = 0;
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%';
    host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    if (D && (opts.airport || opts.year)) m = D.select(m, { airport: opts.airport, year: opts.year });
    const ok = () => m && m.available && Array.isArray(m.days);
    const aria = () => host.setAttribute('aria-label', tx(ok() && picked >= 0 ? m.days[picked].label : m.ariaLabel));
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    function lines(s, font, w) { ctx.font = font; const out = []; let line = ''; for (const word of String(s).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
    function layout() {
      const w = Math.max(240, host.clientWidth || 320), pad = 10, gap = 16;
      W = w;
      if (!ok()) { H = 90; size(); return; }
      const cols = w >= 1100 ? 4 : w >= 760 ? 3 : w >= 520 ? 2 : 1, rows = Math.ceil(12 / cols);
      const pw = (w - 2 * pad - (cols - 1) * gap) / cols, cw = pw / 31, hb = w >= 760 ? 30 : cols === 1 ? 20 : 24, ph = 16 + 2 * hb + 14;
      const f11 = '11px ' + MONO, inner = w - 2 * pad;
      const head = [
        { t: tx(m.airportName) + ' (' + m.airport + ') · ' + m.year, f: '700 14px ' + MONO, c: INK, h: 19 },
        { t: tx(m.strings.still) + ' · ' + tx(m.strings.perDay), f: f11, c: AM, h: 15 },
        { t: tx(m.lastText) + ' ' + tx(m.counts.text), f: f11, c: DIM, h: 15 },
        { t: tx(m.scaleText), f: f11, c: DIM, h: 15 },
      ].map((r) => Object.assign(r, { ls: lines(r.t, r.f, inner) }));
      let y = pad; head.forEach((r) => { r.y = y; y += r.ls.length * r.h; });
      // legend: each entry on one line when narrow, in a row when wide
      const leg = [{ k: 'a', t: tx(m.strings.arrivals) }, { k: 'd', t: tx(m.strings.departures) }, { k: 'x', t: tx(m.strings.missing) }, { k: '0', t: tx(m.strings.zero) }];
      ctx.font = f11; let lx = pad, ly = y + 6; leg.forEach((e) => { const ew = 20 + ctx.measureText(e.t).width + 16; if (lx > pad && lx + ew > w - pad) { lx = pad; ly += 16; } e.x = lx; e.y = ly; lx += ew; });
      const top = ly + 16 + 8;
      const panels = m.months.map((M, i) => ({ M, x: pad + (i % cols) * (pw + gap), y: top + Math.floor(i / cols) * (ph + 10), mid: top + Math.floor(i / cols) * (ph + 10) + 16 + hb }));
      const readY = top + rows * (ph + 10) + 4, rl = Math.min(6, Math.ceil((175 * 7.3) / inner) + 1);
      H = readY + rl * 16 + 18 + pad;
      L = { pad, pw, cw, hb, ph, head, leg, panels, readY, inner, rl };
      size();
    }
    function size() { const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function hatch(x, y, w, h) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.fillStyle = 'rgba(90,100,115,.35)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(190,200,215,.75)'; ctx.lineWidth = 1; ctx.beginPath(); for (let d = -h; d < w + h; d += 4) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); } ctx.stroke(); ctx.restore(); }
    function ring(x, y, c) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.stroke(); }
    function draw() {
      raf = 0; if (dead) return; ctx.clearRect(0, 0, W, H); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      if (!ok()) { ctx.fillStyle = DIM; ctx.font = '12px ' + MONO; lines(tx(m.empty || m.ariaLabel), ctx.font, W - 20).forEach((s, i) => ctx.fillText(s, 10, 28 + i * 16)); return; }
      const { pad, pw, cw, hb, head, leg, panels, readY, inner } = L;
      head.forEach((r) => { ctx.font = r.f; ctx.fillStyle = r.c; r.ls.forEach((s, i) => ctx.fillText(s, pad, r.y + r.h * (i + 1) - 4)); });
      ctx.font = '11px ' + MONO;
      leg.forEach((e) => { const y = e.y;
        if (e.k === 'a') { ctx.fillStyle = CY; ctx.fillRect(e.x + 3, y - 2, 6, 9); } else if (e.k === 'd') { ctx.fillStyle = AM; ctx.fillRect(e.x + 3, y - 2, 6, 9); } else if (e.k === 'x') hatch(e.x, y - 3, 13, 11); else ring(e.x + 6, y + 3, INK);
        ctx.fillStyle = DIM; ctx.fillText(e.t, e.x + 20, y + 7); });
      const bw = Math.max(1.5, cw - (cw >= 6 ? 2 : 1));
      for (const p of panels) {
        const M = p.M; ctx.fillStyle = INK; ctx.font = '700 11px ' + MONO; ctx.textAlign = 'left'; ctx.fillText(tx(M.name), p.x, p.y + 11);
        // frame: the full-bar height above and below the middle line
        ctx.strokeStyle = 'rgba(125,211,252,.10)'; ctx.lineWidth = 1; ctx.strokeRect(p.x + .5, p.mid - hb + .5, pw - 1, 2 * hb - 1);
        ctx.strokeStyle = 'rgba(160,175,195,.45)'; ctx.beginPath(); ctx.moveTo(p.x, p.mid + .5); ctx.lineTo(p.x + M.days * cw, p.mid + .5); ctx.stroke();
        for (let k = 0; k < M.days; k++) {
          const d = m.days[M.first + k], x = p.x + k * cw + (cw - bw) / 2, on = d.i === picked;
          if (d.missing) hatch(p.x + k * cw + .5, p.mid - hb + 1, cw - 1, 2 * hb - 2);
          else {
            if (d.a == null) hatch(p.x + k * cw + .5, p.mid - hb + 1, cw - 1, hb - 2); else if (d.a === 0) ring(x + bw / 2, p.mid - 4, CY); else { const h = Math.max(1, d.tA * (hb - 1) * grow); ctx.fillStyle = CY; ctx.globalAlpha = on || picked < 0 ? 1 : .8; ctx.fillRect(x, p.mid - h, bw, h); }
            if (d.d == null) hatch(p.x + k * cw + .5, p.mid + 1, cw - 1, hb - 2); else if (d.d === 0) ring(x + bw / 2, p.mid + 5, AM); else { const h = Math.max(1, d.tD * (hb - 1) * grow); ctx.fillStyle = AM; ctx.globalAlpha = on || picked < 0 ? 1 : .8; ctx.fillRect(x, p.mid + 1, bw, h); }
            ctx.globalAlpha = 1;
          }
          if (on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(p.x + k * cw - .5, p.mid - hb - 1, cw + 1, 2 * hb + 2); }
        }
        ctx.fillStyle = '#6f84a3'; ctx.font = '9px ' + MONO; ctx.textAlign = 'center';
        [1, 10, 20, M.days].forEach((dn) => ctx.fillText(String(dn), p.x + (dn - .5) * cw, p.mid + hb + 11));
      }
      ctx.textAlign = 'left';
      if (picked >= 0) { ctx.fillStyle = '#fff'; lines(tx(m.days[picked].label), '12px ' + MONO, inner).slice(0, L.rl).forEach((s, i) => ctx.fillText(s, pad, readY + 14 + i * 16)); }
      else { ctx.fillStyle = '#8ea3bf'; lines(tx(m.strings.hint), '12px ' + MONO, inner).slice(0, L.rl).forEach((s, i) => ctx.fillText(s, pad, readY + 14 + i * 16)); }
      ctx.fillStyle = '#6f84a3'; ctx.font = '10px ' + MONO; const src = lines(tx(m.strings.source), ctx.font, inner); ctx.fillText(src[0] + (src.length > 1 ? '…' : ''), pad, H - 10);
    }
    const ask = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    function enter(ts) { if (dead) return; if (!t0) t0 = ts; const k = Math.min(1, (ts - t0) / 500); grow = 1 - Math.pow(1 - k, 3); draw(); if (k < 1 && !document.hidden) requestAnimationFrame(enter); else if (grow < 1) { grow = 1; draw(); } }
    function hit(ev) { if (!ok() || !L) return -1; const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      for (const p of L.panels) { if (y < p.mid - L.hb - 2 || y > p.mid + L.hb + 2 || x < p.x || x >= p.x + L.pw) continue; const k = Math.floor((x - p.x) / L.cw); return k >= 0 && k < p.M.days ? p.M.first + k : -1; } return -1; }
    function pick(i, quiet) { if (i === picked) return; picked = i; aria(); ask(); if (!quiet && opts.onPick) { const d = i >= 0 ? m.days[i] : null; opts.onPick(d ? { date: d.date, arrivals: d.a, departures: d.d, missing: d.missing, airport: m.airport, year: m.year, label: d.label } : null); } }
    const onMove = (ev) => { const i = hit(ev); pick(i >= 0 ? i : pinned); cv.style.cursor = i >= 0 ? 'pointer' : 'default'; };
    const onLeave = () => pick(pinned);
    const onClick = (ev) => { const i = hit(ev); pinned = i; pick(i); };
    const onKey = (ev) => { if (!ok()) return; const n = m.days.length; let i = picked;
      if (ev.key === 'ArrowRight') i = picked < 0 ? 0 : Math.min(n - 1, picked + 1); else if (ev.key === 'ArrowLeft') i = picked < 0 ? n - 1 : Math.max(0, picked - 1);
      else if (ev.key === 'ArrowDown') i = picked < 0 ? 0 : Math.min(n - 1, picked + 7); else if (ev.key === 'ArrowUp') i = picked < 0 ? n - 1 : Math.max(0, picked - 7);
      else if (ev.key === 'Home') i = 0; else if (ev.key === 'End') i = n - 1; else if (ev.key === 'Escape') i = -1; else return;
      ev.preventDefault(); pinned = i; pick(i); };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { layout(); ask(); }) : null; if (ro) ro.observe(host);
    layout(); aria();
    if (still || document.hidden || !ok()) draw(); else { grow = 0; requestAnimationFrame(enter); }
    return {
      set(o) { if (o && D && (o.airport != null || o.year != null)) { const n = D.select(m, { airport: o.airport, year: o.year }); if (n !== m) { m = n; picked = pinned = -1; if (opts.onPick) opts.onPick(null); } } layout(); aria(); ask(); return m; },
      model: () => m,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); },
    };
  }
  SC.viz.flights = { mount };
})();
