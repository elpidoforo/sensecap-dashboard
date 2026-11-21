/*
  Cell sphere widget. SC.viz.sphere.mount(host, model, opts) -> { destroy, select(groupKey), setModel(model) }.
  model: a Data Vortex model (see sphere-data.js). One disc = one real record. Canvas 2D only, no libraries.
  opts: { onPick(item|null), group (initial selected group key) }
  Drag to rotate, hover to highlight a disc (calls onPick), click to pin it (click again or on empty space to release).
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {}); SC.viz = SC.viz || {};
  const BG = '#050b16', CYAN = '#7DD3FC', AMBER = '#FBBF24', FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const lang = () => (SC.lang === 'el' ? 1 : 0);
  const rgb = (hex) => { const h = String(hex || '#7DD3FC').replace('#', ''), v = h.length === 3 ? h.replace(/./g, '$&$&') : h; const n = parseInt(v, 16); return isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [125, 211, 252]; };
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  const mix = (c, d, t) => [Math.round(c[0] + (d[0] - c[0]) * t), Math.round(c[1] + (d[1] - c[1]) * t), Math.round(c[2] + (d[2] - c[2]) * t)];
  const BLUE = [60, 130, 255], WHITE = [255, 255, 255];

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.sphereData || (typeof require === 'function' ? require('./sphere-data.js') : null);
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    cv.style.display = 'block'; cv.style.width = '100%'; cv.style.height = '100%'; cv.style.touchAction = 'pan-y'; cv.style.cursor = 'grab';
    host.appendChild(cv);
    if (!host.clientHeight) host.style.minHeight = '340px';
    host.setAttribute('role', 'img');

    let data = null, group = opts.group == null ? null : opts.group, cur = model;
    let yaw = 0.6, pitch = 0.38, W = 0, H = 0, dpr = 1, hover = -1, pinned = -1, drag = null, last = 0, raf = 0, dead = false, proj = [];
    const reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

    function rebuild() {
      data = model && model.cells ? model : D.build(cur, group);
      data._rgb = data.cells.map((c) => rgb(c.color));
      hover = -1; pinned = -1;
      host.setAttribute('aria-label', data.ariaLabel[lang()]);
    }
    function size() {
      dpr = Math.min(2, root.devicePixelRatio || 1);
      W = Math.max(120, host.clientWidth); H = Math.max(120, host.clientHeight);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      need();
    }

    // rotation: yaw about the vertical axis, then pitch; view z points at the viewer
    function rot(x, y, z) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
    }
    const geom = () => { const R = Math.max(40, Math.min(W * 0.46, (H - 150) / 2)); return { R, cx: W / 2, cy: 34 + R + Math.max(0, (H - 150 - 2 * R) / 2) }; };
    const cam = 4.2, persp = (z) => cam / (cam - z);
    const P = (v, g) => { const k = persp(v[2]); return [g.cx + v[0] * g.R * k, g.cy - v[1] * g.R * k, v[2], k]; };

    function wrap(text, maxW, maxLines) {
      const words = String(text).split(' '), out = []; let line = '';
      for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
      if (line) out.push(line);
      if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/.{0,2}$/, '') + '…'; }
      return out;
    }

    function drawDisc(c, i, g, v, p, dim) {
      const rgb0 = data._rgb[i], front = (v[2] + 1) / 2, a = (0.3 + 0.7 * front) * dim;
      const rad = c.cr * g.R * p[3], nz = Math.max(0.12, Math.abs(v[2])), ang = Math.atan2(-v[1], v[0]);
      const hot = i === hover || i === pinned;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang); ctx.scale(nz, 1);
      // body: deep blue glass tinted by the band colour
      const body = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
      body.addColorStop(0, rgba(mix(rgb0, BLUE, 0.35), 0.5 * a)); body.addColorStop(0.65, rgba(mix(rgb0, BLUE, 0.6), 0.2 * a)); body.addColorStop(1, rgba(mix(rgb0, BLUE, 0.4), 0.34 * a));
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.2832); ctx.fill();
      ctx.lineWidth = hot ? 2 / Math.max(nz, 0.5) : 1 / Math.max(nz, 0.6); ctx.strokeStyle = hot ? rgba(WHITE, 0.95) : rgba(mix(rgb0, WHITE, 0.25), 0.55 * a); ctx.stroke();
      // glowing centre
      ctx.globalCompositeOperation = 'lighter';
      const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, rad * 0.8);
      gl.addColorStop(0, rgba(mix(rgb0, WHITE, 0.7), 0.95 * a)); gl.addColorStop(0.3, rgba(rgb0, 0.55 * a)); gl.addColorStop(1, rgba(rgb0, 0));
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, rad * 0.8, 0, 6.2832); ctx.fill();
      // a few bright dots (fixed place on each disc: decoration, not data)
      if (rad > 4 && front > 0.45) {
        ctx.fillStyle = rgba(WHITE, 0.8 * a);
        for (let k = 0; k < 3; k++) { const t = (i * 2.399 + k * 2.1), rr = rad * (0.45 + 0.3 * ((i * 7 + k * 3) % 5) / 5); ctx.beginPath(); ctx.arc(Math.cos(t) * rr, Math.sin(t) * rr, Math.max(0.7, rad * 0.045), 0, 6.2832); ctx.fill(); }
      }
      ctx.restore();
    }

    function drawArcs(g, ids) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const [ia, ib] of data.arcs) {
        const A = data.cells[ia], B = data.cells[ib], dot = Math.max(-1, Math.min(1, A.x * B.x + A.y * B.y + A.z * B.z)), th = Math.acos(dot);
        if (th < 1e-4) continue;
        const sn = Math.sin(th), lift = 0.05 + 0.3 * (th / Math.PI); let prev = null;
        for (let s = 0; s <= 20; s++) {
          const t = s / 20, ka = Math.sin((1 - t) * th) / sn, kb = Math.sin(t * th) / sn, h = 1 + lift * Math.sin(Math.PI * t);
          const q = P(rot((A.x * ka + B.x * kb) * h, (A.y * ka + B.y * kb) * h, (A.z * ka + B.z * kb) * h), g);
          if (prev) {
            const f = (q[2] + prev[2]) / 2, al = 0.1 + 0.65 * Math.max(0, (f + 0.6) / 1.6);
            ctx.strokeStyle = rgba([150, 220, 255], al); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
          }
          prev = q;
        }
      }
      ctx.restore();
    }

    function draw() {
      raf = 0; if (dead || !data) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = geom(), L = lang();
      const bg = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, Math.max(W, H) * 0.7);
      bg.addColorStop(0, '#0b1d3a'); bg.addColorStop(0.55, '#06101f'); bg.addColorStop(1, BG);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // halo and glass body of the sphere
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(g.cx, g.cy, g.R * 0.7, g.cx, g.cy, g.R * 1.35);
      halo.addColorStop(0, 'rgba(40,110,255,0.20)'); halo.addColorStop(0.6, 'rgba(30,90,230,0.06)'); halo.addColorStop(1, 'rgba(30,90,230,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R * 1.35, 0, 6.2832); ctx.fill();
      const core = ctx.createRadialGradient(g.cx - g.R * 0.25, g.cy - g.R * 0.3, 0, g.cx, g.cy, g.R);
      core.addColorStop(0, 'rgba(70,140,255,0.16)'); core.addColorStop(1, 'rgba(20,60,160,0.05)');
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R, 0, 6.2832); ctx.fill(); ctx.restore();
      ctx.strokeStyle = 'rgba(125,211,252,0.16)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R * 1.005, 0, 6.2832); ctx.stroke();

      const cs = data.cells, inGroup = data.stats.groupKey != null;
      proj = cs.map((c) => { const v = rot(c.x, c.y, c.z); return { v, p: P(v, g) }; });
      const order = cs.map((_, i) => i).sort((a, b) => proj[a].v[2] - proj[b].v[2]);
      for (const i of order) { const c = cs[i], dim = inGroup && c.g !== data.stats.groupKey ? 0.45 : 1; drawDisc(c, i, g, proj[i].v, proj[i].p, dim); }
      if (data.arcs.length) drawArcs(g);
      // ring on the discs of the selected group, so the arcs read as "these belong together"
      if (inGroup) { ctx.strokeStyle = rgba([255, 255, 255], 0.5); ctx.lineWidth = 1; for (const i of order) { const c = cs[i]; if (c.g === data.stats.groupKey && proj[i].v[2] > -0.2) { const q = proj[i]; ctx.beginPath(); ctx.arc(q.p[0], q.p[1], c.cr * g.R * q.p[3] + 3, 0, 6.2832); ctx.stroke(); } } }

      // text: title top-left, picked record and legend at the bottom
      const m = cur || {}, title = (m.n && m.n[L]) || '', unit = (m.unit && m.unit[L]) || '';
      ctx.textBaseline = 'top'; ctx.font = '600 11px ' + FONT; ctx.fillStyle = CYAN; ctx.textAlign = 'left';
      ctx.fillText(String(title).toUpperCase(), 16, 14);
      ctx.font = '11px ' + FONT; ctx.fillStyle = 'rgba(200,225,245,0.65)';
      const st = data.stats, cnt = st.total ? (st.notShown ? st.shown + ' / ' + st.total : String(st.total)) + ' ' + unit : '';
      ctx.fillText(st.total ? cnt : data.emptyText[L], 16, 30);
      if (st.notShown) { ctx.fillStyle = AMBER; const t = (L ? st.notShown + ' δεν εμφανίζονται' : st.notShown + ' not shown'); ctx.textAlign = 'right'; ctx.fillText(t, W - 16, 14); ctx.textAlign = 'left'; }
      if (inGroup) { ctx.fillStyle = 'rgba(200,225,245,0.65)'; ctx.textAlign = 'right'; ctx.fillText((L ? 'τόξο = ίδια ομάδα' : 'arc = same group'), W - 16, st.notShown ? 30 : 14); ctx.textAlign = 'left'; }
      const pick = hover >= 0 ? hover : pinned, bw = W - 32; let y = H - 16;
      // legend (wraps, grows upward)
      ctx.font = '10.5px ' + FONT; const lg = data.legend, rowsL = []; let row = [], rw = 0;
      for (const l of lg) { const w = 14 + ctx.measureText(l.n[L] + ': ' + l.count).width + 14; if (rw + w > bw && row.length) { rowsL.push(row); row = []; rw = 0; } row.push([l, w]); rw += w; }
      if (row.length) rowsL.push(row);
      y -= rowsL.length * 15 - 3;
      for (const r of rowsL) { let x = 16; for (const [l, w] of r) { ctx.fillStyle = rgba(rgb(l.c), 0.95); ctx.beginPath(); ctx.arc(x + 4, y + 6, 4, 0, 6.2832); ctx.fill(); ctx.fillStyle = 'rgba(200,225,245,0.8)'; ctx.fillText(l.n[L] + ': ' + l.count, x + 14, y); x += w; } y += 15; }
      y -= rowsL.length * 15 + 8;
      if (pick >= 0 && cs[pick]) {
        const it = cs[pick].item; ctx.font = '600 12px ' + FONT; const tl = wrap(it.t, bw, 2); ctx.font = '11px ' + FONT; const sl = wrap((it.sub && it.sub[L]) || '', bw, 2);
        const lines = tl.length + sl.length + (it.d ? 1 : 0), top = y - lines * 15 - 2;
        ctx.fillStyle = 'rgba(5,11,22,0.78)'; ctx.fillRect(10, top - 6, W - 20, lines * 15 + 10);
        ctx.strokeStyle = rgba(rgb(cs[pick].color), 0.5); ctx.lineWidth = 1; ctx.strokeRect(10.5, top - 5.5, W - 21, lines * 15 + 9);
        let ty = top; ctx.font = '600 12px ' + FONT; ctx.fillStyle = '#EAF6FF'; for (const s of tl) { ctx.fillText(s, 16, ty); ty += 15; }
        ctx.font = '11px ' + FONT; ctx.fillStyle = 'rgba(200,225,245,0.8)'; for (const s of sl) { ctx.fillText(s, 16, ty); ty += 15; }
        if (it.d) { ctx.fillStyle = CYAN; ctx.fillText(it.d, 16, ty); }
        if (pick === pinned) { ctx.textAlign = 'right'; ctx.fillStyle = AMBER; ctx.fillText(L ? 'καρφιτσωμένο' : 'pinned', W - 16, top); ctx.textAlign = 'left'; }
      }
    }

    function need() { if (!raf && !dead) raf = root.requestAnimationFrame(draw); }
    function tick(ts) {
      if (dead) return;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
      if (!drag && hover < 0 && pinned < 0 && !document.hidden) yaw += dt * 0.1;
      draw();
      loop = root.requestAnimationFrame(tick);
    }
    let loop = 0;
    function start() { if (reduce || loop || dead) return; last = 0; loop = root.requestAnimationFrame(tick); }
    function stop() { if (loop) root.cancelAnimationFrame(loop); loop = 0; }
    const onVis = () => { if (document.hidden) stop(); else start(); };

    // picking: the front-most disc under the pointer, with a few pixels of slack
    function hit(ev) {
      const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, g = geom(); let best = -1, bz = -9;
      for (let i = 0; i < proj.length; i++) {
        const q = proj[i]; if (q.v[2] < -0.05) continue;
        const rad = data.cells[i].cr * g.R * q.p[3] + 4;
        if (Math.hypot(x - q.p[0], y - q.p[1]) <= rad && q.v[2] > bz) { bz = q.v[2]; best = i; }
      }
      return best;
    }
    const emit = (i) => { if (typeof opts.onPick === 'function') opts.onPick(i >= 0 && data.cells[i] ? data.cells[i].item : null); };
    function setHover(i) { if (i !== hover) { hover = i; emit(i >= 0 ? i : pinned); cv.style.cursor = i >= 0 ? 'pointer' : 'grab'; need(); } }
    const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} };
    const onMove = (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (drag.moved || Math.hypot(dx, dy) > 4) { drag.moved = true; yaw += dx * 0.008; pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.008)); drag.x = e.clientX; drag.y = e.clientY; cv.style.cursor = 'grabbing'; need(); }
      } else if (data) setHover(hit(e));
    };
    const onUp = (e) => {
      const d = drag; drag = null; cv.style.cursor = 'grab';
      if (d && !d.moved) { const i = hit(e); pinned = i >= 0 && i !== pinned ? i : -1; hover = i; emit(i >= 0 ? i : -1); }
      need();
    };
    const onLeave = () => { if (!drag) { hover = -1; emit(pinned); need(); } };
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp); cv.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVis);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null; if (ro) ro.observe(host); else root.addEventListener('resize', size);

    rebuild(); size(); start();
    return {
      destroy() { dead = true; stop(); if (raf) root.cancelAnimationFrame(raf); if (ro) ro.disconnect(); else root.removeEventListener('resize', size); document.removeEventListener('visibilitychange', onVis); cv.remove(); },
      select(k) { group = k == null ? null : k; model = null; rebuild(); need(); },
      setModel(m) { cur = m; model = null; rebuild(); need(); },
    };
  }
  SC.viz.sphere = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
