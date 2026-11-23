/*
  gridmap.js: ONE layer of a regular lat/lon grid drawn as coloured squares, with a degree graticule and a fixed colour key.
  SC.viz.gridmap.mount(host, model, { layer, onPick, island }) -> { set({layer}), model(), destroy() }.
  Used for public/site/data/shipdensity.json and public/site/data/blackcarbon.json (model from SC.viz.gridmapData.build).
  No basemap. Three cell states: a colour for a value above zero, one dark colour for a published zero, hatching for no data.
  If the page has the site's own island drawing (window.ISLAND from /site/island.js, or opts.island) its coast is laid on top as a
  thin guide line and the key says so; without it only the grid, the box and the graticule are drawn.
  Still data: nothing moves.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const lang = () => ((window.SC && SC.lang === 'el') ? 1 : 0);
  const tx = (p) => (Array.isArray(p) ? p[lang()] : String(p == null ? '' : p));
  // dark to bright on the dark board; the number in the read-out is always the second cue
  const STOPS = [[0, [38, 66, 118]], [0.35, [36, 132, 186]], [0.6, [125, 211, 252]], [0.82, [251, 191, 36]], [1, [255, 247, 214]]];
  const ZERO = 'rgb(13,25,46)', LUT = [];
  for (let i = 0; i < 256; i++) { const t = i / 255; let k = 1; while (k < STOPS.length - 1 && STOPS[k][0] < t) k++; const a = STOPS[k - 1], b = STOPS[k], f = (t - a[0]) / (b[0] - a[0]); LUT.push('rgb(' + [0, 1, 2].map((j) => Math.round(a[1][j] + (b[1][j] - a[1][j]) * f)).join(',') + ')'); }
  const colour = (t) => (t === -1 ? ZERO : LUT[Math.round(Math.max(0, Math.min(1, t)) * 255)]);

  // the site's island drawing (SVG paths, M/L/Z only, in its own picture units) -> rings of [lon, lat]
  function islandRings(I) {
    try {
      if (!I || !I.districts || !I.bbox || !(I.k > 0) || !(I.sx > 0) || !(I.H > 0)) return null;
      const rings = [];
      for (const id in I.districts) for (const part of String(I.districts[id]).split('M')) {
        const nums = part.replace(/[LZ]/g, ' ').trim().split(/\s+/).map(Number); if (nums.length < 6 || nums.some((v) => !isFinite(v))) continue;
        const ring = []; for (let i = 0; i + 1 < nums.length; i += 2) ring.push([I.bbox[0] + nums[i] / (I.k * I.sx), I.bbox[1] + (I.H - nums[i + 1]) / I.sx]);
        rings.push(ring);
      }
      return rings.length ? rings : null;
    } catch (e) { return null; }
  }

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.gridmapData;
    let m = model, cur = null, pinned = null, W = 0, H = 0, L = null, raf = 0, dead = false, gridCv = null, dpr = 1;
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%';
    host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    if (opts.layer && D && m.available) m = D.select(m, opts.layer);
    const rings = islandRings(opts.island === undefined ? window.ISLAND : opts.island);
    const item = () => (cur && D ? D.cell(m, cur.row, cur.col) : null);
    const aria = () => { const it = item(); host.setAttribute('aria-label', tx(it ? it.label : m.ariaLabel)); };

    function lines(s, w, font) { ctx.font = font; const out = []; let line = ''; for (const word of String(s).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
    const F = { head: '700 13px ' + MONO, sub: '11px ' + MONO, small: '10px ' + MONO, read: '12px ' + MONO };

    function layout() {
      const w = Math.max(240, host.clientWidth || 320), pad = 10, inner = w - 2 * pad; W = w;
      if (!m.available) { L = { empty: lines(tx(m.empty), inner, F.read) }; H = 30 + L.empty.length * 16; size(); return; }
      const g = m.grid, axis = 40, S = m.strings;
      const head = lines(tx(m.layerName), inner, F.head), sub = lines(tx(m.still) + ' · ' + tx(m.quantity) + ', ' + tx(m.unit), inner, F.sub);
      let mw = inner - axis, mh = mw / g.aspect; const cap = Math.max(200, Math.min(560, (window.innerHeight || 800) * 0.62));
      if (mh > cap) { mh = cap; mw = mh * g.aspect; }
      const mapX = pad + axis + (inner - axis - mw) / 2, mapY = pad + head.length * 17 + sub.length * 14 + 8;
      const keyY = mapY + mh + 22, kw = Math.min(340, inner - 8);
      const same = m.groups[m.group].length > 1 ? ' ' + tx(S.sameScale) + ': ' + tx(m.groupName) + '.' : '';
      const keyText = lines(tx(m.unit) + '. ' + tx(S[m.scale.type]) + same, inner, F.small);
      const marks = [[ZERO, tx(S.zero), false], [null, tx(S.nodata), true]];
      const marksY = keyY + 30 + keyText.length * 13 + 4, two = inner < 520;
      const readY = marksY + (two ? 34 : 18) + 8;
      const it = item(); let read;
      if (it) read = it.lines.map((ln, i) => lines(tx(ln), inner, i === 0 ? F.head : F.read)); else read = [lines(tx(S.hint), inner, F.read)];
      const readN = Math.max(read.reduce((n, a) => n + a.length, 0), inner < 520 ? 7 : 4);   // room kept so the picture does not jump while reading
      const credit = lines(tx(S.source) + ': ' + m.sourceShort + (m.sources[0] ? ' · ' + tx(m.sources[0].licence) : '') + ' · ' + tx(S.retrieved) + ' ' + m.retrieved + (rings ? ' · ' + tx(S.outline) : ''), inner, F.small);
      const creditY = readY + readN * 16 + 6;
      L = { pad, inner, head, sub, mapX, mapY, mw, mh, keyY, kw, keyText, marks, marksY, two, readY, read, credit, creditY };
      H = creditY + credit.length * 13 + pad; size(); paintGrid();
    }
    function size() { dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function hatchPattern(c, scale) {
      const p = document.createElement('canvas'), s = Math.max(4, Math.round(6 * scale)); p.width = p.height = s; const x = p.getContext('2d');
      x.fillStyle = 'rgb(34,42,56)'; x.fillRect(0, 0, s, s); x.strokeStyle = 'rgba(170,185,205,.75)'; x.lineWidth = Math.max(1, scale * 0.9);
      x.beginPath(); x.moveTo(-1, s + 1); x.lineTo(s + 1, -1); x.moveTo(-1, 1); x.lineTo(1, -1); x.moveTo(s - 1, s + 1); x.lineTo(s + 1, s - 1); x.stroke();
      return c.createPattern(p, 'repeat');
    }
    // the whole grid is painted once per layer and size into its own canvas; hover only redraws the overlay
    function paintGrid() {
      const g = m.grid, pw = Math.max(1, Math.round(L.mw * dpr)), ph = Math.max(1, Math.round(L.mh * dpr));
      gridCv = document.createElement('canvas'); gridCv.width = pw; gridCv.height = ph; const c = gridCv.getContext('2d');
      const xs = g.gx.map((f) => Math.round(f * pw)), ys = g.gy.map((f) => Math.round(f * ph)), hatch = hatchPattern(c, dpr), t = m.t;
      for (let pass = 0; pass < 2; pass++) {           // no-data cells first as one hatched area, then the values
        if (pass === 0) c.fillStyle = hatch;
        for (let r = 0, i = 0; r < g.rows; r++) for (let col = 0; col < g.cols; col++, i++) {
          const v = t[i]; if ((v == null) !== (pass === 0)) continue;
          if (pass === 1) c.fillStyle = colour(v);
          c.fillRect(xs[col], ys[r], Math.max(1, xs[col + 1] - xs[col]), Math.max(1, ys[r + 1] - ys[r]));
        }
      }
      const cw = pw / g.cols, ch = ph / g.rows;
      if (cw >= 9 * dpr && ch >= 9 * dpr) { c.strokeStyle = 'rgba(5,11,22,.55)'; c.lineWidth = 1; c.beginPath(); for (const x of xs) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, ph); } for (const y of ys) { c.moveTo(0, y + 0.5); c.lineTo(pw, y + 0.5); } c.stroke(); }
      for (const k in m.flags) { const r = Math.floor(k / g.cols), col = k % g.cols, x = (xs[col] + xs[col + 1]) / 2, y = (ys[r] + ys[r + 1]) / 2; c.fillStyle = '#fff'; c.strokeStyle = '#050b16'; c.lineWidth = dpr; c.beginPath(); c.arc(x, y, Math.max(1.5 * dpr, Math.min(cw, ch) * 0.16), 0, 6.3); c.fill(); c.stroke(); }
      if (rings) {                                      // coast only: stroke every district, then cut the inside away so shared borders vanish
        const o = document.createElement('canvas'); o.width = pw; o.height = ph; const x = o.getContext('2d'), b = g.bbox;
        const trace = () => { x.beginPath(); for (const ring of rings) { ring.forEach((p, i) => { const px = ((p[0] - b.west) / (b.east - b.west)) * pw, py = ((b.north - p[1]) / (b.north - b.south)) * ph; if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.closePath(); } };
        trace(); x.strokeStyle = 'rgba(240,246,252,.9)'; x.lineWidth = 2.6 * dpr; x.lineJoin = 'round'; x.stroke();
        x.globalCompositeOperation = 'destination-out'; trace(); x.fillStyle = '#000'; x.fill('nonzero'); x.lineWidth = 0.6 * dpr; x.stroke();
        c.drawImage(o, 0, 0);
      }
    }
    function text(arr, x, y, lh, font, fill) { ctx.font = font; ctx.fillStyle = fill; for (const s of arr) { ctx.fillText(s, x, y); y += lh; } return y; }
    function draw() {
      raf = 0; if (dead) return; ctx.clearRect(0, 0, W, H); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      if (!m.available) { text(L.empty, 10, 26, 16, F.read, '#8ea3bf'); return; }
      const g = m.grid, S = m.strings, x0 = L.mapX, y0 = L.mapY;
      let y = text(L.head, L.pad, L.pad + 13, 17, F.head, '#EAF0F7'); text(L.sub, L.pad, y - 2, 14, F.sub, '#FBBF24');
      ctx.drawImage(gridCv, x0, y0, L.mw, L.mh);
      // graticule and box: whole and half degrees, labelled
      ctx.strokeStyle = 'rgba(234,240,247,.28)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath();
      for (const a of g.graticule.lats) { const yy = Math.round(y0 + a.f * L.mh) + 0.5; ctx.moveTo(x0, yy); ctx.lineTo(x0 + L.mw, yy); }
      for (const a of g.graticule.lons) { const xx = Math.round(x0 + a.f * L.mw) + 0.5; ctx.moveTo(xx, y0); ctx.lineTo(xx, y0 + L.mh); }
      ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = 'rgba(125,211,252,.7)'; ctx.strokeRect(Math.round(x0) - 0.5, Math.round(y0) - 0.5, Math.round(L.mw) + 1, Math.round(L.mh) + 1);
      ctx.font = F.small; ctx.fillStyle = '#9fb2cc'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const a of g.graticule.lats) ctx.fillText(tx(a.label), x0 - 5, Math.max(y0 + 5, Math.min(y0 + L.mh - 5, y0 + a.f * L.mh)));
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center'; let lastX = -1e9;
      for (const a of g.graticule.lons) { const s = tx(a.label), w = ctx.measureText(s).width, xx = Math.max(x0 + w / 2 - 12, Math.min(x0 + L.mw - w / 2 + 4, x0 + a.f * L.mw)); if (xx - w / 2 < lastX + 6) continue; ctx.fillText(s, xx, y0 + L.mh + 13); lastX = xx + w / 2; }
      ctx.textAlign = 'left';
      // the picked cell
      if (cur) { const cx0 = x0 + g.gx[cur.col] * L.mw, cx1 = x0 + g.gx[cur.col + 1] * L.mw, cy0 = y0 + g.gy[cur.row] * L.mh, cy1 = y0 + g.gy[cur.row + 1] * L.mh, mx = (cx0 + cx1) / 2, my = (cy0 + cy1) / 2, hw = Math.max(4, (cx1 - cx0) / 2 + 1), hh = Math.max(4, (cy1 - cy0) / 2 + 1);
        ctx.strokeStyle = 'rgba(5,11,22,.9)'; ctx.lineWidth = 3.5; ctx.strokeRect(mx - hw, my - hh, 2 * hw, 2 * hh); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(mx - hw, my - hh, 2 * hw, 2 * hh);
        ctx.beginPath(); ctx.moveTo(mx, y0 + L.mh); ctx.lineTo(mx, y0 + L.mh + 4); ctx.moveTo(x0 - 4, my); ctx.lineTo(x0, my); ctx.stroke(); }
      // key: the fixed scale of this group of layers
      const kx = L.pad + 4, ky = L.keyY, kw = L.kw, grad = ctx.createLinearGradient(kx, 0, kx + kw, 0); for (const s of STOPS) grad.addColorStop(s[0], 'rgb(' + s[1].join(',') + ')');
      ctx.fillStyle = grad; ctx.fillRect(kx, ky, kw, 9); ctx.font = F.small; ctx.fillStyle = '#9fb2cc'; ctx.strokeStyle = '#9fb2cc'; ctx.lineWidth = 1; let last = -1e9;
      m.scale.ticks.forEach((tk, i) => { const xx = kx + tk.t * kw, s = (i === 0 && m.scale.type === 'log' ? '≤' : '') + tx(tk.label), w = ctx.measureText(s).width, lx = Math.max(kx, Math.min(kx + kw - w, xx - w / 2));
        ctx.beginPath(); ctx.moveTo(Math.round(xx) + (i ? -0.5 : 0.5), ky + 9); ctx.lineTo(Math.round(xx) + (i ? -0.5 : 0.5), ky + 13); ctx.stroke(); if (lx < last + 5) return; ctx.fillText(s, lx, ky + 24); last = lx + w; });
      y = text(L.keyText, L.pad, ky + 40, 13, F.small, '#9fb2cc');
      let sx = L.pad + 4, sy = L.marksY; const hp = hatchPattern(ctx, 1);
      for (const mk of L.marks) { ctx.fillStyle = mk[2] ? hp : mk[0]; ctx.fillRect(sx, sy, 16, 10); ctx.strokeStyle = 'rgba(160,175,195,.8)'; ctx.strokeRect(sx + 0.5, sy + 0.5, 15, 9); ctx.fillStyle = '#9fb2cc'; ctx.font = F.small; ctx.fillText(mk[1], sx + 22, sy + 9);
        if (L.two) sy += 16; else sx += 22 + ctx.measureText(mk[1]).width + 22; }
      // read-out: one cell, its centre, its value with unit, and the same cell in the layers that share the scale
      y = L.readY + 12;
      if (cur) L.read.forEach((arr, i) => { y = text(arr, L.pad, y, 16, i === 0 ? F.head : F.read, i === 0 ? '#fff' : i === 1 ? '#7DD3FC' : '#c5d2e4'); });
      else text(L.read[0], L.pad, y, 16, F.read, '#8ea3bf');
      text(L.credit, L.pad, L.creditY + 10, 13, F.small, '#7f93ad');
    }
    const ask = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    function relayoutRead() { layout(); ask(); }
    function hit(ev) { if (!m.available || !L || !L.mw) return null; const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; return D.locate(m, (x - L.mapX) / L.mw, (y - L.mapY) / L.mh); }
    const same = (a, b) => (a === b) || (a && b && a.row === b.row && a.col === b.col);
    function pick(c, quiet) { if (same(c, cur)) return; cur = c ? { row: c.row, col: c.col } : null; aria(); relayoutRead(); if (!quiet && opts.onPick) opts.onPick(item()); }
    const onMove = (ev) => { const c = hit(ev); pick(c || pinned); cv.style.cursor = c ? 'crosshair' : 'default'; };
    const onLeave = () => pick(pinned);
    const onClick = (ev) => { const c = hit(ev); pinned = c; pick(c); };
    const onKey = (ev) => { if (!m.available) return; const g = m.grid, step = ev.shiftKey ? 10 : 1; let c = cur ? { row: cur.row, col: cur.col } : null;
      const start = () => { if (!c) { c = { row: g.rows >> 1, col: g.cols >> 1 }; return true; } return false; };
      if (ev.key === 'ArrowRight') { if (!start()) c.col = Math.min(g.cols - 1, c.col + step); } else if (ev.key === 'ArrowLeft') { if (!start()) c.col = Math.max(0, c.col - step); }
      else if (ev.key === 'ArrowDown') { if (!start()) c.row = Math.min(g.rows - 1, c.row + step); } else if (ev.key === 'ArrowUp') { if (!start()) c.row = Math.max(0, c.row - step); }
      else if (ev.key === 'Home') { start(); c.col = 0; } else if (ev.key === 'End') { start(); c.col = g.cols - 1; } else if (ev.key === 'Escape') c = null; else return;
      ev.preventDefault(); pinned = c; pick(c); };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (dead || Math.max(240, host.clientWidth || 320) === W) return; layout(); ask(); }) : null; if (ro) ro.observe(host);
    layout(); aria(); draw();
    return {
      // the picked cell is kept when the layer changes, so the same place can be read on another layer
      set(o) { if (o && o.layer && D && m.available) { const n = D.select(m, o.layer); if (n !== m && n.layer !== m.layer) { m = n; if (cur && opts.onPick) opts.onPick(item()); } } layout(); aria(); ask(); return m; },
      model: () => m,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); },
    };
  }
  SC.viz.gridmap = { mount };
})();
