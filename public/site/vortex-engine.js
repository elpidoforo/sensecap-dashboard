/* Data Vortex engine: a funnel of spheres on a 2D canvas, with depth, slow rotation, a glowing hub and rays to the records of the
   chosen group. No WebGL. Ported from the Nemesis Data Vortex. The page owns the data and the DOM around it; this file only draws and
   reports which sphere is under the pointer. Needs /site/vortexdata.js first. */
(function () {
'use strict';
const SC = window.SC = window.SC || {};

const sprite = (col) => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gl = g.createRadialGradient(32, 32, 8, 32, 32, 32); gl.addColorStop(0, col + '88'); gl.addColorStop(1, col + '00'); g.fillStyle = gl; g.fillRect(0, 0, 64, 64);
  const sp = g.createRadialGradient(26, 24, 1, 32, 32, 15); sp.addColorStop(0, '#ffffff'); sp.addColorStop(0.25, col); sp.addColorStop(1, '#0b1020'); g.fillStyle = sp; g.beginPath(); g.arc(32, 32, 14, 0, 7); g.fill();
  return c;
};

function mountVortex(canvas, { onPick, onHover } = {}) {
  const x = canvas.getContext('2d');
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, model = null, pts = [], SP = {}, WH = sprite('#ffffff');
  let lit = new Set(), hub = null, hubName = '', selT = 0, t0 = performance.now(), raf = 0, paused = false, P = [], pickI = -1, hoverI = -1, angle = 0, last = 0, dragging = null;

  function resize() {
    const r = canvas.getBoundingClientRect(); dpr = Math.min(1.75, window.devicePixelRatio || 1);
    W = Math.max(280, r.width); H = Math.max(320, r.height); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  function setModel(m) {
    model = m; SP = {}; for (const b of m.bands) SP[b.k] = sprite(b.c);
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    pts = SC.vortexData.layout(m).map((p, i) => ({ ...p, i, it: m.items[i], r: 2.1 + m.items[i].s * 5.4 + (i % 7) * 0.12, sx: (rnd() - 0.5) * 2600, sy: (rnd() - 0.5) * 2000, sz: (rnd() - 0.5) * 2600 }));
    lit = new Set(); hub = null; pickI = -1; hoverI = -1; t0 = performance.now(); P = [];   // no stale positions from the previous data set
  }
  // key: group key or null; index/of place the hub down the funnel in list order, like a cursor walking the list
  function select(key, name, index = 0, of = 1) {
    lit = new Set(); if (key === null || key === undefined) { hub = null; return; }
    pts.forEach((p) => { if (p.it.g === key) lit.add(p.i); });
    const f = 0.12 + 0.76 * (of > 1 ? index / (of - 1) : 0.4), rad = Math.pow(1 - f, 1.25) * 330 + 26, a = index * 2.4;
    hub = { x: Math.cos(a) * rad * 0.35, y: -360 + f * 720, z: Math.sin(a) * rad * 0.35 }; hubName = name || ''; selT = performance.now();
  }
  function frame(now) {
    raf = 0; if (!canvas.isConnected) return;                       // the page went away: stop, the page mounts a new one
    if (!model) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (!still && !paused && !dragging) angle += dt * 0.2;
    const t = (now - t0) / 1000, e = still ? 1 : 1 - Math.pow(1 - Math.min(1, t / 2.2), 3);
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, canvas.width, canvas.height); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;   // transparent: the tile behind the canvas shows through
    const CX = W * 0.5, CY = H * 0.5 - 4, S = Math.min(W / (W < 520 ? 600 : 900), H / 860);   // on a phone the funnel may use the full width
    const bg = x.createRadialGradient(CX, CY + 110 * S, 10, CX, CY, 560 * S); bg.addColorStop(0, 'rgba(70,120,210,.16)'); bg.addColorStop(1, 'rgba(10,22,40,0)'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
    const ca = Math.cos(angle), sa = Math.sin(angle), tilt = 0.24, ct = Math.cos(tilt), st = Math.sin(tilt), cam = 1250 - (still ? 0 : 110 * Math.sin(t * 0.13));
    const proj = (px, py, pz) => { const X = px * ca - pz * sa, Z = px * sa + pz * ca, Y = py * ct - Z * st, Z2 = py * st + Z * ct, k = cam / (cam + Z2); return [CX + X * k * S, CY + Y * k * S, k, Z2]; };
    P = pts.map((p) => { const wob = still ? 0 : Math.sin(t * 0.7 + p.ph) * 5; const q = proj(p.sx + (p.x - p.sx) * e, p.sy + (p.y + wob - p.sy) * e, p.sz + (p.z - p.sz) * e); return { p, X: q[0], Y: q[1], k: q[2], Z: q[3] }; }).sort((a, b) => b.Z - a.Z);
    const grow = still ? 1 : Math.min(1, (now - selT) / 700), any = lit.size > 0;
    let h = null;
    if (hub && any) {
      const q = proj(hub.x, hub.y, hub.z); h = { X: q[0], Y: q[1] };
      x.globalCompositeOperation = 'lighter'; x.lineWidth = 0.7;
      for (const o of P) { if (!lit.has(o.p.i)) continue; x.strokeStyle = `rgba(235,242,255,${(0.05 + 0.22 * o.k * o.k) * grow})`; x.beginPath(); x.moveTo(h.X, h.Y); x.lineTo(h.X + (o.X - h.X) * grow, h.Y + (o.Y - h.Y) * grow); x.stroke(); }
      x.globalCompositeOperation = 'source-over';
    }
    for (const o of P) {
      const on = lit.has(o.p.i), depth = Math.max(0.18, Math.min(1, (o.k - 0.62) * 2.2)), s = o.p.r * o.k * (on ? 1.75 : 1) * 2.3 * S; o.s = s;
      x.globalAlpha = (!any ? 1 : on ? 1 : 0.4) * depth * e; x.drawImage(SP[o.p.it.b] || WH, o.X - s, o.Y - s, s * 2, s * 2);
      if (on && grow > 0.5) { x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.33 * depth; x.drawImage(WH, o.X - s * 1.5, o.Y - s * 1.5, s * 3, s * 3); x.globalCompositeOperation = 'source-over'; }
    }
    x.globalAlpha = 1;
    for (const [idx, col] of [[hoverI, 'rgba(255,255,255,.6)'], [pickI, '#ffffff']]) { if (idx < 0) continue; const o = P.find((q) => q.p.i === idx); if (o) { x.strokeStyle = col; x.lineWidth = 1.6; x.beginPath(); x.arc(o.X, o.Y, Math.max(7, o.s * 0.62 + 4), 0, 7); x.stroke(); } }
    if (h) {
      x.globalCompositeOperation = 'lighter'; const R = (70 + (still ? 0 : 10 * Math.sin(t * 3))) * S; const hg = x.createRadialGradient(h.X, h.Y, 0, h.X, h.Y, R);
      hg.addColorStop(0, `rgba(255,255,255,${0.95 * grow})`); hg.addColorStop(0.25, `rgba(190,215,255,${0.45 * grow})`); hg.addColorStop(1, 'rgba(120,160,255,0)'); x.fillStyle = hg; x.beginPath(); x.arc(h.X, h.Y, R, 0, 7); x.fill();
      x.globalCompositeOperation = 'source-over';
      if (hubName) { x.font = '600 12px ui-monospace, Menlo, monospace'; const name = hubName.length > 34 ? hubName.slice(0, 33) + '…' : hubName, w = x.measureText(name).width + 16, lx = Math.min(W - w - 8, h.X + 14); x.globalAlpha = grow; x.fillStyle = '#BFE0FF'; x.fillRect(lx, h.Y - 11, w, 22); x.fillStyle = '#06203a'; x.fillText(name, lx + 8, h.Y + 4); x.globalAlpha = 1; }
    }
    if (!still || dragging) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  // nearest sphere under the pointer, front ones first
  function hit(ev) {
    const r = canvas.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top; let best = -1, bd = 1e9;
    for (let i = P.length - 1; i >= 0; i--) { const o = P[i], d = Math.hypot(o.X - mx, o.Y - my), reach = Math.max(9, (o.s || 4) * 0.7); if (d <= reach && d < bd) { bd = d; best = o.p.i; if (d < 4) break; } }
    return best;
  }
  const move = (ev) => {
    if (dragging) { angle = dragging.a + (ev.clientX - dragging.x) * 0.006; dragging.moved = dragging.moved || Math.abs(ev.clientX - dragging.x) > 5; kick(); return; }
    const i = hit(ev); if (i !== hoverI) { hoverI = i; canvas.style.cursor = i >= 0 ? 'pointer' : 'grab'; onHover && onHover(i >= 0 ? model.items[i] : null, ev); kick(); }
  };
  const down = (ev) => { dragging = { x: ev.clientX, a: angle, moved: false }; canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId); };
  const up = (ev) => { const d = dragging; dragging = null; if (d && d.moved) return; const i = hit(ev); pickI = i; onPick && onPick(i >= 0 ? model.items[i] : null); kick(); };
  canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointerup', up);
  // a touch that turns into a page scroll is cancelled by the browser: drop the drag, or the scene stays frozen
  const cancel = () => { if (dragging) { dragging = null; kick(); } };
  canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('lostpointercapture', cancel);
  canvas.addEventListener('pointerleave', () => { if (hoverI >= 0) { hoverI = -1; onHover && onHover(null); kick(); } });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resize(); kick(); }) : null; ro && ro.observe(canvas);
  resize(); kick();
  return {
    setModel(m) { setModel(m); kick(); }, select(...a) { select(...a); kick(); }, still,
    setPaused(v) { paused = !!v; kick(); }, clearPick() { pickI = -1; kick(); },
    destroy() { if (raf) cancelAnimationFrame(raf); raf = 0; ro && ro.disconnect(); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('lostpointercapture', cancel); },
  };
}
SC.mountVortex = mountVortex;
})();
