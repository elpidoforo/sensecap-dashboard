/*
  Heat matrix widget: SC.viz.heatmatrix.mount(host, model, opts) -> { destroy() }. The model is built by heatmatrix-data.js.
  Still data: nothing moves. The picture is redrawn only when the host is resized, the language changes, a cell is hovered
  or picked. opts.onPick({district, year, value, state, ...}) on a click on a cell (null when the click is on no cell);
  opts.onMode(k) when the 'show as' switch is used (only present when the answer carries floor area / value series).
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', PANEL = '#050b16', DIM = 'rgba(125,211,252,0.62)';
  const lo = [11, 38, 60], hi = [125, 211, 252];
  const ramp = (t) => 'rgb(' + lo.map((a, i) => Math.round(a + (hi[i] - a) * t)).join(',') + ')';   // one hue: deep blue to cyan

  function mount(host, model0, opts) {
    opts = opts || {};
    let model = model0, mode = model0.mode, hover = null, picked = null, w = 0, hits = [];
    const idx = () => (SC.lang === 'el' ? 1 : 0), L = (p) => (p ? p[idx()] : '');
    const el = (tag, css) => { const e = document.createElement(tag); if (css) e.style.cssText = css; return e; };
    host.setAttribute('role', 'img');
    host.style.cssText += ';background:' + PANEL + ';color:' + CYAN + ';font-family:' + MONO + ';padding:10px;box-sizing:border-box;border:1px solid rgba(125,211,252,0.18);border-radius:8px;box-shadow:0 0 24px rgba(125,211,252,0.06)';
    const sw = el('div', 'display:none;gap:6px;margin:0 0 8px;flex-wrap:wrap;font-size:11px');
    const cv = el('canvas', 'display:block;width:100%;cursor:default'), ctx = cv.getContext('2d');
    const txt = el('div', 'margin-top:8px;font-size:11px;line-height:1.5;color:' + DIM);
    host.append(sw, cv, txt);

    const view = () => (model.views && model.views[mode]) || { rows: model.rows };
    const mInfo = () => model.modes.find((m) => m.k === mode) || model.modes[0];

    function buildSwitch() {
      sw.textContent = '';
      if (!model.available || model.modes.length < 2) { sw.style.display = 'none'; return; }
      sw.style.display = 'flex';
      const lab = el('span', 'align-self:center;color:' + DIM); lab.textContent = idx() ? 'Εμφάνιση ως' : 'Show as'; sw.append(lab);
      for (const m of model.modes) {
        const b = el('button', 'font:inherit;font-size:11px;padding:3px 9px;border-radius:999px;cursor:pointer;background:' + (m.k === mode ? 'rgba(125,211,252,0.18)' : 'transparent') + ';color:' + CYAN + ';border:1px solid rgba(125,211,252,0.4)');
        b.type = 'button'; b.textContent = L(m.n); b.setAttribute('aria-pressed', m.k === mode ? 'true' : 'false');
        b.addEventListener('click', () => { mode = m.k; hover = null; picked = null; buildSwitch(); draw(); if (opts.onMode) opts.onMode(m.k); });
        sw.append(b);
      }
    }

    function draw() {
      host.setAttribute('aria-label', L(model.ariaLabel));
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      w = Math.max(200, Math.floor(host.clientWidth - 22));
      txt.textContent = '';
      const line = (s, col) => { const p = el('p', 'margin:0 0 4px' + (col ? ';color:' + col : '')); p.textContent = s; txt.append(p); };
      if (!model.available) {
        cv.width = 1; cv.height = 1; cv.style.height = '1px'; hits = [];
        line(L(model.empty), CYAN); return;
      }
      const rows = view().rows, years = model.years, narrow = w < 520;
      const labW = narrow ? Math.min(78, w * 0.2) : 130, gx = 3, padR = 2, top = 30, bottom = 22;
      const cw = (w - labW - padR - gx * (years.length - 1)) / years.length, ch = Math.max(30, Math.min(52, cw * 0.9)), gy = 3;
      const hgt = Math.ceil(top + rows.length * (ch + gy) + bottom);
      cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt);
      ctx.textBaseline = 'middle';
      hits = [];
      const ann = model.annotation && model.annotation.year;
      years.forEach((yr, i) => {   // header
        const x = labW + i * (cw + gx) + cw / 2;
        ctx.fillStyle = yr.partial ? AMBER : DIM; ctx.textAlign = 'center'; ctx.font = (narrow ? 9 : 11) + 'px ' + MONO;
        const t = narrow ? "'" + String(yr.y).slice(2) : String(yr.y);
        ctx.fillText(t + (ann === yr.y ? '*' : ''), x, 11);
        if (yr.partial) { ctx.font = '9px ' + MONO; const pt = idx() ? 'μερικό' : 'partial', hw = ctx.measureText(pt).width / 2; ctx.fillText(pt, Math.min(x, w - hw), 23); }
      });
      rows.forEach((r, ri) => {
        const y = top + ri * (ch + gy);
        ctx.fillStyle = CYAN; ctx.textAlign = 'left'; ctx.font = (narrow ? 10 : 12) + 'px ' + MONO;
        let nm = L(r.short); while (nm.length > 3 && ctx.measureText(nm).width > labW - 6) nm = nm.slice(0, -2) + '…';
        ctx.fillText(nm, 0, y + ch / 2);
        r.cells.forEach((c, ci) => {
          const x = labW + ci * (cw + gx);
          hits.push({ x, y, w: cw, h: ch, c, r });
          if (c.state === 'incomplete') {
            ctx.fillStyle = 'rgba(125,211,252,0.05)'; ctx.fillRect(x, y, cw, ch);
            ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip(); ctx.strokeStyle = 'rgba(125,211,252,0.45)'; ctx.lineWidth = 1; ctx.beginPath();
            for (let k = -ch; k < cw; k += 6) { ctx.moveTo(x + k, y + ch); ctx.lineTo(x + k + ch, y); }
            ctx.stroke(); ctx.restore();
          } else {
            ctx.fillStyle = ramp(c.t); ctx.fillRect(x, y, cw, ch);
            const s = c.text[idx()];
            ctx.font = (narrow ? 9 : 11) + 'px ' + MONO;
            if (ctx.measureText(s).width <= cw - 4) { ctx.fillStyle = c.t > 0.55 ? '#04121f' : '#dff3ff'; ctx.textAlign = 'center'; ctx.fillText(s, x + cw / 2, y + ch / 2); }
          }
          if (c.state !== 'full') {   // partial and incomplete cells: dashed edge
            ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = c.state === 'partial' ? AMBER : 'rgba(125,211,252,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1); ctx.restore();
          }
          const on = picked && picked.c === c, hv = hover && hover.c === c;
          if (on || hv) { ctx.strokeStyle = on ? AMBER : '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2); }
        });
      });
      // readout line: the sentence of the cell under the pointer, or of the picked cell
      const sel = hover || picked;
      ctx.textAlign = 'left'; ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; ctx.fillStyle = sel ? '#e8f6ff' : DIM;
      let rd = sel ? L(sel.c.label) : (idx() ? 'Πάτησε ένα κελί για λεπτομέρειες' : 'Click a cell for details');
      while (rd.length > 3 && ctx.measureText(rd).width > w) rd = rd.slice(0, -2) + '…';
      ctx.fillText(rd, 0, hgt - 9);
      // text under the picture: legend lines, the note, the annotation (all from the model)
      for (const l of model.legend) line(L(l));
      line(L(model.note));
      if (model.annotation) line((model.annotation.year ? '* ' : '') + L(model.annotation.text), AMBER);
    }

    const at = (e) => { const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; return hits.find((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) || null; };
    const onMove = (e) => { const h = at(e); if ((h && h.c) !== (hover && hover.c)) { hover = h; cv.style.cursor = h ? 'pointer' : 'default'; draw(); } };
    const onLeave = () => { if (hover) { hover = null; draw(); } };
    const onClick = (e) => {
      const h = at(e); picked = h;
      draw();
      if (!opts.onPick) return;
      if (!h) opts.onPick(null);
      else opts.onPick({ district: h.c.district, districtName: h.r.name, year: h.c.year, value: h.c.value, state: h.c.state, missing: h.c.missing, unit: mInfo().unit, mode });
    };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick);

    // redraw on size and language changes; also when the tab comes back (nothing moves, so there is nothing to pause)
    let lang = SC.lang;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
    if (ro) ro.observe(host);
    const onVis = () => { if (!document.hidden) draw(); };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(() => { if (SC.lang !== lang && !document.hidden) { lang = SC.lang; buildSwitch(); draw(); } }, 500);
    buildSwitch(); draw();
    return { destroy() { clearInterval(poll); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.remove(); sw.remove(); txt.remove(); } };
  }

  SC.viz.heatmatrix = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
