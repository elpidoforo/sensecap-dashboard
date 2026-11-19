/*
  The Cyprus data stack in 3D (#/stack): every layer Kleanthis holds, from the seabed up to space, stacked over the island and
  the sea around it, with the source of each one drawn in the scene. Shown inside the site shell through a same-origin frame
  (pages/stack.js), the way the city page is.

  The box is the region, not the island alone: 33.3-36.8 N, 31.0-36.3 E, the same box as the server's terrain grid, so the
  south coast of Turkey and the coast of Syria and Lebanon are in view. Cyprus keeps its detailed outline; the land around it
  is a quiet flat shape taken from the server's elevation grid (GET /api/terrain), and says "demo" when that grid is a stand-in.

  Honest limits, printed on the page itself: the relief of Cyprus and the sheets marked "example drawing" are drawn here, not
  fetched. Every other sheet draws only what its feed holds, and only where the feed has data: outside a model's grid nothing
  is painted. A new sheet is one entry in LAYERS (the contract is written above that list).
  Privacy: no person and no road vehicle is drawn. Aeroplanes are anonymous arrows (no callsign, no id, rounded places, nothing
  kept) and they stay a drawing: they never reach layers.js, the brain, a prompt or sources/*.json. Ports are published
  quarterly statistics; no ship is drawn or tracked.
*/
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const I = window.ISLAND;
const ISL = new Path2D(); Object.values(I.districts).forEach((p) => ISL.addPath(new Path2D(p)));
/* ---- the box: the whole region, on the same projection as the island's outline (east-west squeezed by I.k) ---- */
const R = { lat0: 33.3, lat1: 36.8, lng0: 31.0, lng1: 36.3 };
const RW = (R.lng1 - R.lng0) * I.k, RH = R.lat1 - R.lat0;            // the box in degrees of latitude: wide, tall
const uv = (lng, lat) => [(lng - R.lng0) * I.k / RW, 1 - (lat - R.lat0) / RH];
const iuv = (lng, lat) => { const b = I.bbox; return [(lng - b[0]) * I.k * I.sx / I.W, 1 - (lat - b[1]) * I.sx / I.H]; };   // inside the outline's own drawing
const ISLAND_BOX = { lng0: I.bbox[0], lat0: I.bbox[1], lng1: I.bbox[2], lat1: I.bbox[1] + I.H / I.sx };
const hash = (x, y) => { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v) + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v; }
function fbm(x, y, o = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= .5; } return s; }
const mobile = Math.min(innerWidth, innerHeight) < 700;
const Q = new URLSearchParams(location.search);
const EL = Q.get('lang') === 'el';
const T = (en, el) => (EL ? el : en);
const TT = (pair) => (pair ? T(pair[0], pair[1]) : '');
// People who ask for less motion get a still picture that carries the same information: arrows instead of moving
// lines, rings that stand instead of rings that spread, and no camera tour.
const RMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const still = () => !!(RMQ && RMQ.matches);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const nf = (v) => Number(v).toLocaleString(EL ? 'el-GR' : 'en-GB');
// every label on the page carries both languages
document.documentElement.lang = EL ? 'el' : 'en';
document.querySelectorAll('[data-el]').forEach((n) => { if (EL) n.textContent = n.getAttribute('data-el'); });
document.querySelectorAll('[data-ael]').forEach((n) => { if (EL) n.setAttribute('aria-label', n.getAttribute('data-ael')); });
document.querySelectorAll('[data-tel]').forEach((n) => { if (EL) n.title = n.getAttribute('data-tel'); });

/* ---- relief of Cyprus: Troodos, the Kyrenia ridge and the plain between them (drawn, and the page says so) ---- */
const GW = mobile ? 420 : 620, GH = Math.round(GW * I.H / I.W);
const g0 = (() => {
  const m = document.createElement('canvas'); m.width = GW; m.height = GH;
  const mx = m.getContext('2d'); mx.save(); mx.scale(GW / I.W, GH / I.H); mx.fillStyle = '#fff'; mx.fill(ISL); mx.restore();
  const a = mx.getImageData(0, 0, GW, GH).data, land = new Float32Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) land[i] = a[i * 4 + 3] / 255;
  const inland = Float32Array.from(land), tmp = new Float32Array(GW * GH);
  const blur = (src, dst, r) => {
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { let s = 0, n = 0;
      for (let k = -r; k <= r; k += 2) { const xx = Math.min(GW - 1, Math.max(0, x + k)); s += src[y * GW + xx]; n++; } dst[y * GW + x] = s / n; }
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { let s = 0, n = 0;
      for (let k = -r; k <= r; k += 2) { const yy = Math.min(GH - 1, Math.max(0, y + k)); s += dst[yy * GW + x]; n++; } src[y * GW + x] = s / n; }
  };
  for (let i = 0; i < 3; i++) blur(inland, tmp, 11);
  const px = (lng, lat) => { const [u, v] = iuv(lng, lat); return [u * GW, v * GH]; };
  const [tx, ty] = px(32.88, 34.93), ridge = [px(32.95, 35.36), px(33.4, 35.33), px(33.9, 35.27), px(34.3, 35.56)];
  const h = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x; if (land[i] < .5) continue;
    const dT = Math.hypot(x - tx, y - ty) / (GW * .17);
    let v = Math.exp(-dT * dT), dR = 1e9;
    for (const [rx, ry] of ridge) dR = Math.min(dR, Math.hypot(x - rx, y - ry) / (GW * .045));
    v += Math.exp(-dR * dR) * .42;
    h[i] = Math.max(0, v * (.45 + .75 * inland[i]) + .1 * inland[i] + (fbm(x / 15, y / 15, 4) - .5) * .16);
  }
  return { land, inland, h };
})();
/* ---- the sheet: one canvas the size of the region. U is the unit for marks sized to the region; Cyprus keeps its own. ---- */
const LW = mobile ? 768 : 1024, LH = Math.round(LW * RH / RW), U = LW / 1024;
const buf = () => { const c = document.createElement('canvas'); c.width = LW; c.height = LH; return c; };
const pxOf = (lng, lat) => { const [u, v] = uv(lng, lat); return [u * LW, v * LH]; };
const llOf = (x, y) => [R.lng0 + x / LW * RW / I.k, R.lat1 - y / LH * RH];
// where the island's own drawing sits on the sheet, and how to draw in it
const [IX0, IY0] = pxOf(ISLAND_BOX.lng0, ISLAND_BOX.lat1), [IX1, IY1] = pxOf(ISLAND_BOX.lng1, ISLAND_BOX.lat0);
const IW = IX1 - IX0, IH = IY1 - IY0, ICX = IX0 + IW / 2, ICY = IY0 + IH / 2;
const onIsl = (ctx, fn) => { ctx.save(); ctx.translate(IX0, IY0); ctx.scale(IW / I.W, IH / I.H); fn(I.W / IW); ctx.restore(); };   // fn gets "one sheet pixel" in outline units
const ipx = (u, v) => [IX0 + u * IW, IY0 + v * IH];                    // a place given as a share of the island's own box
const gi = (x, y) => { const u = (x - IX0) / IW, v = (y - IY0) / IH; return u < 0 || u >= 1 || v < 0 || v >= 1 ? -1 : Math.floor(v * GH) * GW + Math.floor(u * GW); };
const ramp = (t, st) => { for (let i = 1; i < st.length; i++) if (t <= st[i][0] || i === st.length - 1) {
  const a = st[i - 1], b = st[i], f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]; } };
// A drawn picture of Cyprus: only the island's own box is visited, so a drawing never spreads over the sea or the neighbours.
function raster(fn, seaFn) {
  const c = buf(), ctx = c.getContext('2d');
  const x0 = Math.max(0, Math.floor(IX0)), y0 = Math.max(0, Math.floor(IY0)), w = Math.min(LW - x0, Math.ceil(IW) + 1), h = Math.min(LH - y0, Math.ceil(IH) + 1);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, g = gi(x0 + x + .5, y0 + y + .5);
    const o = g < 0 ? null : g0.land[g] >= .5 ? fn(x0 + x, y0 + y, g) : (seaFn ? seaFn(x0 + x, y0 + y, g) : null);
    if (!o) continue;
    img.data[i] = o[0]; img.data[i + 1] = o[1]; img.data[i + 2] = o[2]; img.data[i + 3] = o[3];
  }
  ctx.putImageData(img, x0, y0); return c;
}
// the districts share borders, so stroke underneath and lay the raster on top: only the coastline survives
const coastUnder = (c, colour, w) => {
  const t = buf(), tx = t.getContext('2d');
  onIsl(tx, (u) => { tx.strokeStyle = colour; tx.lineWidth = (w || 1.3) * 2.2 * u; tx.lineJoin = 'round'; tx.stroke(ISL); });
  tx.drawImage(c, 0, 0);
  const ctx = c.getContext('2d'); ctx.clearRect(0, 0, LW, LH); ctx.drawImage(t, 0, 0);
};
const hillshade = (g, base) => { const hx = (g0.h[g + 1] - g0.h[g - 1]) * 34, hy = (g0.h[g + GW] - g0.h[g - GW]) * 34;
  const len = Math.hypot(-hx, -hy, 1), lam = Math.min(.95, Math.max(.12, (hx * .62 + hy * .55 + .56) / len));
  return base.map((v) => Math.min(255, v * (.3 + lam * .62))); };

/* ---- the colour scales: one per quantity, fixed, so the same colour always means the same number ---- */
const SCALE = {
  wind: { min: 0, max: 15, unit: 'm/s', st: [[0, 38, 96, 128], [.3, 89, 215, 232], [.65, 232, 251, 255], [1, 247, 196, 107]] },
  temp: { min: 0, max: 40, unit: '°C', st: [[0, 70, 110, 220], [.3, 80, 200, 230], [.55, 240, 225, 120], [.8, 245, 150, 70], [1, 225, 70, 60]] },
  sst: { min: 12, max: 30, unit: '°C', st: [[0, 70, 110, 220], [.3, 80, 200, 230], [.55, 240, 225, 120], [.8, 245, 150, 70], [1, 225, 70, 60]] },
  pm25: { min: 0, max: 50, unit: 'µg/m³', st: [[0, 70, 60, 120], [.4, 170, 120, 235], [.75, 240, 150, 220], [1, 255, 225, 200]] },
  cloud: { min: 0, max: 100, unit: '%', top: true, st: [[0, 30, 40, 55], [1, 236, 244, 255]] },
  rain: { min: 0, max: 5, unit: 'mm', st: [[0, 40, 70, 130], [1, 130, 190, 255]] },
  depth: { min: 0, max: 3000, unit: 'm', ends: [['shallow', 'ρηχά'], ['deep', 'βαθιά']], st: [[0, 168, 232, 236], [.07, 92, 190, 222], [.3, 44, 118, 190], [.65, 26, 62, 138], [1, 12, 22, 74]] },
};
const SCALE_NAME = { sst: ['Sea-surface temperature', 'Θερμοκρασία επιφάνειας θάλασσας'], temp: ['Air temperature', 'Θερμοκρασία αέρα'], pm25: ['Fine particles PM2.5', 'Λεπτά σωματίδια PM2.5'],
  wind: ['Wind speed', 'Ταχύτητα ανέμου'], rain: ['Rain in the hour', 'Βροχή μέσα στην ώρα'], cloud: ['Cloud cover', 'Νεφοκάλυψη'], depth: ['Depth of the sea floor', 'Βάθος του βυθού'] };
const colOf = (sc, v) => ramp(clamp01((v - sc.min) / (sc.max - sc.min)), sc.st).map(Math.round);
const rgb = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a == null ? 1 : a})`;
const cssScale = (sc) => 'linear-gradient(90deg,' + sc.st.map((s) => `rgb(${s[1]},${s[2]},${s[3]}) ${Math.round(s[0] * 100)}%`).join(',') + ')';

/* ---- a sheet that has nothing to show says so, in words, on the sheet itself ---- */
function hatch(x, colour) { x.save(); x.strokeStyle = colour; x.globalAlpha = .16; x.lineWidth = 1; x.beginPath();
  for (let k = -LH; k < LW; k += 16) { x.moveTo(k, LH); x.lineTo(k + LH, 0); } x.stroke(); x.restore(); }
function pill(x, text, colour, cy, cx) {
  const fs = mobile ? 11 : 14, mx = cx == null ? ICX : cx; x.save(); x.font = `800 ${fs}px ui-monospace, Menlo, monospace`;
  const w = Math.min(LW - 8, x.measureText(text).width + 22), h = fs + 14, x0 = Math.max(4, Math.min(LW - w - 4, mx - w / 2)), y0 = (cy == null ? ICY : cy) - h / 2;
  x.fillStyle = 'rgba(4,10,18,.9)'; x.strokeStyle = colour; x.lineWidth = 1.2;
  x.beginPath(); if (x.roundRect) x.roundRect(x0, y0, w, h, 7); else x.rect(x0, y0, w, h); x.fill(); x.stroke();
  x.fillStyle = colour; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, x0 + w / 2, y0 + h / 2 + .5, w - 12); x.restore(); }
const DRAWN_WORDS = () => T('EXAMPLE DRAWING · NO LIVE DATA YET', 'ΣΧΕΔΙΟ-ΠΑΡΑΔΕΙΓΜΑ · ΧΩΡΙΣ ΖΩΝΤΑΝΑ ΔΕΔΟΜΕΝΑ ΑΚΟΜΗ');
// a sheet with no feed keeps its drawing, but faded and striped, with the words across it
function stampDrawn(c, colour) { const x = c.getContext('2d');
  x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 0, LW, LH); x.restore();
  hatch(x, colour); pill(x, DRAWN_WORDS(), colour); return c; }
// a sheet that is fed, at a moment when nothing has arrived for it
function emptySheet(c, colour, text) { const x = c.getContext('2d'); x.clearRect(0, 0, LW, LH); hatch(x, colour); pill(x, text, colour); }

/* ---- a model gives numbers at grid points. Between them the value is filled in by distance (and the key says so); beyond
        the outermost points, further than half a step, nothing is filled in at all. ---- */
const FW = 64;
const smallC = document.createElement('canvas');
const stepOf = (list, fallback) => { const a = [...new Set(list.map((v) => Math.round(v * 100) / 100))].sort((x, y) => x - y); let g = Infinity;
  for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; if (d > .5 && d < g) g = d; } return isFinite(g) ? g : fallback; };
function mkField(points, get) {
  const pts = []; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  (points || []).forEach((p) => { const v = get(p); if (v == null || !isFinite(v) || p.lat == null || p.lng == null) return;
    const [x, y] = pxOf(p.lng, p.lat); pts.push([x, y, v]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  if (!pts.length) return null;
  const hx = stepOf(pts.map((p) => p[0]), 48 * U) / 2, hy = stepOf(pts.map((p) => p[1]), 59 * U) / 2;   // half a grid step: a value stands for its own cell
  x0 -= hx; x1 += hx; y0 -= hy; y1 += hy;
  const w = x1 - x0, h = y1 - y0, FH = Math.max(4, Math.round(FW * h / w)), a = new Float32Array(FW * FH);
  const q = pts.map(([x, y, v]) => [(x - x0) / w * FW - .5, (y - y0) / h * FH - .5, v]);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { let s = 0, k0 = 0;
    for (const [qx, qy, v] of q) { const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d2 < 1e-4) { s = v; k0 = 1; break; } const k = 1 / (d2 * d2); s += k * v; k0 += k; }
    a[y * FW + x] = s / k0; }
  return { a, x0, y0, w, h, FH, n: pts.length };
}
const inF = (f, x, y) => !!f && x >= f.x0 && x <= f.x0 + f.w && y >= f.y0 && y <= f.y0 + f.h;
function sampleF(f, x, y) {
  const a = f.a, FH = f.FH, fx = Math.min(FW - 1, Math.max(0, (x - f.x0) / f.w * FW - .5)), fy = Math.min(FH - 1, Math.max(0, (y - f.y0) / f.h * FH - .5));
  const xa = Math.floor(fx), ya = Math.floor(fy), xb = Math.min(FW - 1, xa + 1), yb = Math.min(FH - 1, ya + 1), u = fx - xa, v = fy - ya;
  return a[ya * FW + xa] * (1 - u) * (1 - v) + a[ya * FW + xb] * u * (1 - v) + a[yb * FW + xa] * (1 - u) * v + a[yb * FW + xb] * u * v;
}
function paintField(ctx, f, fn) {
  smallC.width = FW; smallC.height = f.FH;
  const sx = smallC.getContext('2d'), img = sx.createImageData(FW, f.FH);
  for (let i = 0; i < FW * f.FH; i++) { const o = fn(f.a[i]); img.data[i * 4] = o[0]; img.data[i * 4 + 1] = o[1]; img.data[i * 4 + 2] = o[2]; img.data[i * 4 + 3] = o[3]; }
  sx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(smallC, f.x0, f.y0, f.w, f.h);
}
// the edge of what a model covers: a thin dashed frame, so the empty part of a sheet reads as "no data here", not as "zero"
function frameOf(ctx, f, colour) { if (!f) return; ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = colour; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
  ctx.strokeRect(f.x0 + .5, f.y0 + .5, f.w - 1, f.h - 1); ctx.restore(); }
function gridDots(ctx, pts, colour) { ctx.fillStyle = colour;
  (pts || []).forEach((p) => { const [x, y] = pxOf(p.lng, p.lat); ctx.fillRect(x - 1, y - 1, 2, 2); }); }
const tinyText = (c, text, x, y, size) => { c.font = `700 ${size || (mobile ? 9 : 10)}px ui-monospace, Menlo, monospace`; c.lineWidth = 2.4; c.strokeStyle = 'rgba(2,6,12,.9)';
  c.strokeText(text, x, y); c.fillStyle = '#f3f8fd'; c.fillText(text, x, y); };

/* ---- the land around Cyprus, from the server's elevation grid: land wherever the grid is above sea level ---- */
// Cyprus itself always comes from its own detailed outline. The neighbours come from GET /api/terrain (about 12 km
// between points), smoothed into a quiet shape with a thin coastline. No border is drawn and no territory is named
// inside Cyprus. In test mode the server's grid is a rough stand-in, and every sheet that shows it says "demo".
let terrain = null;                                                    // { kind: 'real' | 'demo' } once the grid has arrived
const landA = new Uint8Array(LW * LH);                                 // 1 where the grid says land (outside Cyprus)
const landC = buf(), regionCoastC = buf(), coastC = buf();
const LAND_FILL = [38, 50, 58], COAST_LINE = [150, 186, 208];
function buildCoast() {
  const x = coastC.getContext('2d'); x.clearRect(0, 0, LW, LH);
  onIsl(x, (u) => { x.strokeStyle = 'rgba(200,225,245,.75)'; x.lineWidth = 2.6 * u; x.lineJoin = 'round'; x.stroke(ISL);
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fill(ISL); });
  x.globalCompositeOperation = 'source-over'; x.drawImage(regionCoastC, 0, 0);
}
function buildRegion(t) {
  const rows = t.rows, cols = t.cols, step = t.step || (t.lat1 - t.lat0) / (rows - 1);
  const small = document.createElement('canvas'); small.width = cols; small.height = rows;
  const sx = small.getContext('2d'), si = sx.createImageData(cols, rows), pad = step * 1.1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lat = t.lat0 + r * step, lng = t.lng0 + c * step;
    const cyprus = lat > ISLAND_BOX.lat0 - pad && lat < ISLAND_BOX.lat1 + pad && lng > ISLAND_BOX.lng0 - pad && lng < ISLAND_BOX.lng1 + pad;
    const i = ((rows - 1 - r) * cols + c) * 4;                         // the grid starts in the south, a picture starts at the top
    si.data[i] = si.data[i + 1] = si.data[i + 2] = 255; si.data[i + 3] = !cyprus && t.elev[r * cols + c] > 0 ? 255 : 0;
  }
  sx.putImageData(si, 0, 0);
  const big = buf(), bx = big.getContext('2d', { willReadFrequently: true }); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high';
  const [xa, ya] = pxOf(t.lng0 - step / 2, t.lat0 + (rows - .5) * step), [xb, yb] = pxOf(t.lng0 + (cols - .5) * step, t.lat0 - step / 2);
  bx.drawImage(small, xa, ya, xb - xa, yb - ya);
  const d = bx.getImageData(0, 0, LW, LH).data;
  for (let i = 0; i < LW * LH; i++) landA[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  const fx = landC.getContext('2d'), fi = fx.createImageData(LW, LH), kx = regionCoastC.getContext('2d'), ki = kx.createImageData(LW, LH);
  const e = Math.max(2, Math.round(2 * U));
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) { const i = y * LW + x; if (!landA[i]) continue;
    const edge = (x >= e && !landA[i - e]) || (x < LW - e && !landA[i + e]) || (y >= e && !landA[i - e * LW]) || (y < LH - e && !landA[i + e * LW]);
    const o = i * 4; fi.data[o] = LAND_FILL[0]; fi.data[o + 1] = LAND_FILL[1]; fi.data[o + 2] = LAND_FILL[2]; fi.data[o + 3] = 235;
    if (edge) { ki.data[o] = COAST_LINE[0]; ki.data[o + 1] = COAST_LINE[1]; ki.data[o + 2] = COAST_LINE[2]; ki.data[o + 3] = 170; } }
  fx.putImageData(fi, 0, 0); kx.putImageData(ki, 0, 0);
  terrain = { kind: t.mock ? 'demo' : 'real', rows, cols, step };
  buildCoast();
}
buildCoast();
// Every coastline as a thin line, for the sheets of the air and the sea: without it nobody can tell where a number sits.
const coast = (c) => { c.globalCompositeOperation = 'source-over'; c.drawImage(coastC, 0, 0); };
// The land as flat shapes: the neighbours from the grid, Cyprus from its outline.
function landFill(c, colour) { c.globalCompositeOperation = 'source-over'; c.drawImage(landC, 0, 0);
  onIsl(c, () => { c.fillStyle = colour || rgb(LAND_FILL, .92); c.fill(ISL); }); }
// Sea, as far as this page can tell: not Cyprus (its outline) and not the neighbours' land (the grid, once it is here).
const isSea = (x, y) => { if (x < 0 || y < 0 || x >= LW || y >= LH) return false; const g = gi(x, y); if (g >= 0 && g0.land[g] >= .5) return false; return !landA[Math.floor(y) * LW + Math.floor(x)]; };
// Plain names for what is around the island. Places are for the reader's bearings only.
const PLACES = [
  { t: ['Türkiye', 'Τουρκία'], lng: 33.25, lat: 36.56, align: 'center', land: true },
  { t: ['Syria', 'Συρία'], lng: 36.24, lat: 35.32, align: 'right', land: true },
  { t: ['Lebanon', 'Λίβανος'], lng: 36.24, lat: 33.98, align: 'right', land: true },
  { t: ['Mediterranean Sea', 'Μεσόγειος'], lng: 31.95, lat: 33.55, align: 'center', land: false },
];
const DEMO_COAST = () => T('demo coastline, not the real shape', 'δοκιμαστική ακτογραμμή, όχι το πραγματικό σχήμα');
function regionLabels(c) {
  c.save(); c.globalCompositeOperation = 'source-over'; c.textBaseline = 'middle';
  PLACES.forEach((p) => { const [x, y] = pxOf(p.lng, p.lat);
    c.textAlign = p.align; c.font = `${p.land ? '700' : 'italic 600'} ${Math.round(15 * U)}px Inter, "Segoe UI", system-ui, sans-serif`;
    c.lineWidth = 3; c.strokeStyle = 'rgba(2,6,12,.8)'; c.strokeText(TT(p.t), x, y);
    c.fillStyle = p.land ? 'rgba(206,220,232,.86)' : 'rgba(140,190,226,.78)'; c.fillText(TT(p.t), x, y);
    if (p.land && terrain && terrain.kind === 'demo') { c.font = `700 ${Math.round(9.5 * U)}px ui-monospace, Menlo, monospace`;
      c.strokeText(DEMO_COAST(), x, y + 15 * U); c.fillStyle = '#F2A56B'; c.fillText(DEMO_COAST(), x, y + 15 * U); } });
  c.restore();
}

/* ---- what the painted sheets stand on: only numbers that arrived ---- */
const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
const ageText = (m) => (m == null ? T('not stated', 'δεν δηλώνεται')
  : m < 1 ? T('just now', 'μόλις τώρα') : m < 90 ? T(Math.round(m) + ' min ago', 'πριν ' + Math.round(m) + ' λ')
    : T(Math.round(m / 60) + ' h ago', 'πριν ' + Math.round(m / 60) + ' ώ'));
let live = null, liveAt = 0;
let grid = [];            // the weather model's grid points: wind, rain, cloud at each
let gridF = null;         // the rectangle those points cover (half a step around the outermost ones)
let windF = null;         // the wind as two fields in m/s: u blows to the east, v blows to the north
let rainCells = [], rainKnown = false, cellW = 40, cellH = 40;
let cloudF = null, airF = null, airPts = [], specks = [];
let seaPts = [], stationPts = [];
let windDir = null, windSrc = null, rainMm = null, cloudPct = null, skyAt = null, airportWind = [];
let soloId = null;
const need = {};          // sheet id -> repaint once, even when nothing moves
const touch = (id) => { need[id] = true; };
const touchAll = () => LAYERS.forEach((l) => { if (l.paint) need[l.id] = true; });
const WAIT = () => T('WAITING FOR THE FIRST READINGS…', 'ΑΝΑΜΟΝΗ ΓΙΑ ΤΙΣ ΠΡΩΤΕΣ ΜΕΤΡΗΣΕΙΣ…');
const NOTHING = () => T('NO DATA ARRIVED FOR THIS SHEET', 'ΔΕΝ ΗΡΘΑΝ ΔΕΔΟΜΕΝΑ ΓΙΑ ΑΥΤΟ ΤΟ ΦΥΛΛΟ');
const emptyWords = () => (live ? NOTHING() : WAIT());
// the names of the neighbours go on the floors, and on whichever sheet is being read on its own
const withNames = (id) => soloId === id;
function arrow(c, x, y, ang, len, colour, w) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len, hd = Math.max(3, Math.min(6, len * .4));
  c.strokeStyle = colour; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey);
  c.moveTo(ex, ey); c.lineTo(ex + Math.cos(ang + 2.6) * hd, ey + Math.sin(ang + 2.6) * hd);
  c.moveTo(ex, ey); c.lineTo(ex + Math.cos(ang - 2.6) * hd, ey + Math.sin(ang - 2.6) * hd); c.stroke();
}
// what the airports measured: one amber arrow per airport, pointing the way its wind blows, longer for stronger wind
function airportArrows(c) {
  c.globalCompositeOperation = 'source-over';
  airportWind.forEach((a) => { if (a.lat == null || a.lng == null) return;
    const [x, y] = pxOf(a.lng, a.lat), to = ((a.wd + 180) % 360) * Math.PI / 180;
    arrow(c, x, y, Math.atan2(-Math.cos(to), Math.sin(to)), 9 + Math.min(15, a.ws) * 2.2, '#F7C46B', 2.2);
    c.fillStyle = '#F7C46B'; c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill();
    tinyText(c, fmt(a.ws) + ' m/s', x + 5, y + 11); });
}
/* ---- wind ---- */
const NP = mobile ? 1200 : 2600, pcl = new Float32Array(NP * 4);
for (let i = 0; i < NP; i++) { pcl[i * 4] = -1; pcl[i * 4 + 1] = -1; pcl[i * 4 + 3] = Math.random() * 150; }
const WIND_PX = 15;       // sheet pixels a line travels each second for every m/s of wind: twice the wind, twice the speed
let windBlank = true;
function windStep(c, t, anim, dt) {
  if (!windF) { emptySheet(c.canvas, '#59d7e8', emptyWords()); windBlank = true; return; }
  const f = windF.u;
  if (!anim) {            // the still picture: an arrow at every step of a lattice, pointing downwind, longer and brighter for faster wind
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH); windBlank = true;
    const step = mobile ? 30 : 26;
    for (let y = f.y0 + step / 2; y < f.y0 + f.h; y += step) for (let x = f.x0 + step / 2; x < f.x0 + f.w; x += step) {
      const u = sampleF(windF.u, x, y), v = sampleF(windF.v, x, y), sp = Math.hypot(u, v); if (sp < .05) continue;
      arrow(c, x, y, Math.atan2(-v, u), 4 + Math.min(15, sp) * 1.3, rgb(colOf(SCALE.wind, sp), .95), 1.3); }
    coast(c); if (withNames('wind')) regionLabels(c); frameOf(c, f, 'rgba(89,215,232,.5)'); airportArrows(c); return; }
  c.globalCompositeOperation = 'source-over';
  if (windBlank) { c.clearRect(0, 0, LW, LH); windBlank = false; }
  // Outside the grid nothing flows, so that part is wiped clean each time; inside, the old lines fade.
  c.clearRect(0, 0, LW, f.y0); c.clearRect(0, f.y0 + f.h, LW, LH); c.clearRect(0, f.y0, f.x0, f.h); c.clearRect(f.x0 + f.w, f.y0, LW, f.h);
  c.fillStyle = 'rgba(3,8,14,.12)'; c.fillRect(f.x0, f.y0, f.w, f.h);
  c.lineCap = 'round';                                               // plain paint, not added light: a line keeps the colour of its speed
  for (let i = 0; i < NP; i++) { const o = i * 4, x = pcl[o], y = pcl[o + 1];
    if (!inF(f, x, y) || pcl[o + 3] > 150) { pcl[o] = f.x0 + Math.random() * f.w; pcl[o + 1] = f.y0 + Math.random() * f.h; pcl[o + 3] = 0; continue; }
    const u = sampleF(windF.u, x, y), v = sampleF(windF.v, x, y), sp = Math.hypot(u, v);
    const nx = x + u * WIND_PX * dt, ny = y - v * WIND_PX * dt, hot = Math.min(1, sp / 10);
    if (inF(f, nx, ny)) { c.strokeStyle = rgb(colOf(SCALE.wind, sp), (.55 + hot * .4).toFixed(3));
      c.lineWidth = .8 + hot; c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke(); }
    pcl[o] = nx; pcl[o + 1] = ny; pcl[o + 3]++; }
  coast(c); if (withNames('wind')) regionLabels(c); frameOf(c, f, 'rgba(89,215,232,.5)'); airportArrows(c);
}
// Rain: one square per model grid cell that has rain in it, with its millimetres. Rings (drops landing, seen from
// above) appear only inside those squares, and more of them where the model says more rain. No square, no rain.
function rainStep(c, t, anim) {
  if (!rainKnown) { emptySheet(c.canvas, '#7fb3ff', emptyWords()); return; }
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  coast(c); if (withNames('rain')) regionLabels(c); frameOf(c, gridF, 'rgba(127,179,255,.5)'); gridDots(c, grid, 'rgba(150,190,255,.55)');
  if (!rainCells.length) { pill(c, T('THE MODEL SAYS NO RAIN THIS HOUR', 'ΤΟ ΜΟΝΤΕΛΟ ΛΕΕΙ: ΚΑΘΟΛΟΥ ΒΡΟΧΗ ΑΥΤΗ ΤΗΝ ΩΡΑ'), '#7fb3ff'); return; }
  rainCells.forEach((cell, ci) => {
    const x0 = cell.x - cellW / 2, y0 = cell.y - cellH / 2, k = clamp01(cell.mm / SCALE.rain.max);
    c.fillStyle = rgb(colOf(SCALE.rain, cell.mm), (.3 + .4 * k).toFixed(3)); c.fillRect(x0, y0, cellW, cellH);
    c.strokeStyle = 'rgba(170,205,255,.8)'; c.lineWidth = 1; c.strokeRect(x0 + .5, y0 + .5, cellW - 1, cellH - 1);
    const n = Math.max(2, Math.min(16, Math.round(2 + cell.mm * 5)));
    c.lineWidth = 1.1;
    for (let j = 0; j < n; j++) {
      const h0 = hash(ci * 31 + j, 7), cyc = anim ? t * .8 + h0 : .55 + h0 * .4, lap = Math.floor(cyc), ph = cyc - lap;
      const rx = x0 + 5 + hash(ci * 131 + j, lap + 3) * (cellW - 10), ry = y0 + 12 + hash(ci * 71 + j, lap + 11) * (cellH - 18);
      c.strokeStyle = `rgba(215,236,255,${(.9 * (1 - ph)).toFixed(3)})`;
      c.beginPath(); c.arc(rx, ry, 1 + ph * 6, 0, 7); c.stroke(); }
    tinyText(c, fmt(cell.mm) + ' mm', x0 + 4, y0 + 10);
  });
}
// Cloud: how much of the sky the model says is covered, whiter for more. It does not move: the feed has no drift in it.
function cloudPaint(c) {
  if (!cloudF) { emptySheet(c.canvas, '#e8f4ff', emptyWords()); return; }
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  paintField(c, cloudF, (v) => [236, 244, 255, Math.round(clamp01(v / 100) * 215)]);
  coast(c); if (withNames('cloud')) regionLabels(c); frameOf(c, cloudF, 'rgba(232,244,255,.45)'); gridDots(c, grid, 'rgba(160,190,220,.7)');
}
// Air: the model's fine particles as a colour, and as specks: each candidate speck is kept with a chance that grows
// with PM2.5 at its spot, so more specks really is more particles. They shimmer in place and go nowhere.
function seedSpecks() { specks = []; if (!airF) return;
  const M = mobile ? 1100 : 2600;
  for (let i = 0; i < M; i++) { const x = airF.x0 + Math.random() * airF.w, y = airF.y0 + Math.random() * airF.h;
    if (Math.random() < clamp01(sampleF(airF, x, y) / SCALE.pm25.max)) specks.push([x, y, Math.random() * 6.283]); } }
const airBase = buf();
function airField() { const c = airBase.getContext('2d'); c.clearRect(0, 0, LW, LH); if (!airF) return;
  paintField(c, airF, (v) => colOf(SCALE.pm25, v).concat(150)); coast(c); frameOf(c, airF, 'rgba(217,179,255,.5)'); gridDots(c, airPts, 'rgba(240,225,255,.7)'); }
function airStep(c, t, anim) {
  if (!airF) { emptySheet(c.canvas, '#d9b3ff', emptyWords()); return; }
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH); c.drawImage(airBase, 0, 0); if (withNames('air')) regionLabels(c);
  specks.forEach(([x, y, ph]) => { const k = anim ? t : 0;
    c.fillStyle = `rgba(255,240,255,${(.55 + .35 * Math.sin(k * 1.7 + ph)).toFixed(3)})`;
    c.fillRect(x + Math.sin(k * 1.3 + ph) * 1.4, y + Math.cos(k * 1.1 + ph * 1.7) * 1.4, 1.5, 1.5); });
}
// Ground: the official stations, each a dot coloured by the air temperature it measured. A ring spreads from a station
// that reported in the last half hour; an older reading keeps a wide faint ring that stands still.
const PING_MIN = 30, HALO_FULL = 180;                                // three hours out, a ring is as faint as it gets
let reliefC = null, floorC = null;                                   // floorC is thrown away when the land around Cyprus arrives
function islandFloor() {                                            // dark sea, the neighbours as quiet land, Cyprus with its drawn relief
  if (floorC) return floorC;
  floorC = buf(); const c = floorC.getContext('2d');
  if (!reliefC) { reliefC = raster((x, y, g) => hillshade(g, ramp(Math.min(1, g0.h[g] / 1.6),
    [[0, 52, 84, 58], [.18, 78, 100, 58], [.4, 112, 110, 68], [.62, 124, 106, 78], [.82, 112, 100, 92], [1, 150, 152, 158]])).concat(255));
    coastUnder(reliefC, 'rgba(190,235,255,.85)', 1.4); }
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  c.fillStyle = 'rgba(5,17,30,.8)'; c.fillRect(0, 0, LW, LH);
  c.drawImage(landC, 0, 0); c.drawImage(regionCoastC, 0, 0); c.drawImage(reliefC, 0, 0); regionLabels(c);
  return floorC;
}
function islandStep(c, t, anim) {
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH); c.drawImage(islandFloor(), 0, 0);
  const now = Date.now();
  stationPts.forEach((p, i) => { const [x, y] = pxOf(p.lng, p.lat), age = p.at ? (now - p.at) / 60000 : null;
    if (age != null && age < PING_MIN) { const ph = anim ? (t * .45 + i * .37) % 1 : .6;
      c.strokeStyle = `rgba(255,255,255,${(.85 * (1 - ph)).toFixed(3)})`; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, 4 + ph * 11, 0, 7); c.stroke(); }
    else { const f = age == null ? 1 : clamp01(age / HALO_FULL);
      c.strokeStyle = `rgba(160,180,205,${(.55 - f * .35).toFixed(3)})`; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 7 + f * 8, 0, 7); c.stroke(); }
    c.fillStyle = rgb(colOf(SCALE.temp, p.temp)); c.strokeStyle = 'rgba(2,6,12,.95)'; c.lineWidth = 1.2;
    c.beginPath(); c.arc(x, y, 3.6, 0, 7); c.fill(); c.stroke(); tinyText(c, fmt(p.temp) + '°', x + 6, y + 3); });
}

/* ---- seabed: a published depth grid, when the file is there ---- */
// The file is written by fieldwork/import_seabed_grid.py from the EMODnet Bathymetry service and served at
// /api/fieldwork/seabedgrid. Until someone has run that import there is no file, and then this sheet draws no sea floor
// at all: a flat dark floor, the coasts, and the words that say no depth data is loaded. Nothing is made up.
let seabed = null;                                                    // { grid, elev, meta } once a grid is loaded
const depthC = buf();
function buildDepth() {
  const g = seabed.grid, e = seabed.elev, x = depthC.getContext('2d'); x.clearRect(0, 0, LW, LH);
  const [xa, ya] = pxOf(g.lng0 - g.step / 2, g.lat0 + (g.rows - .5) * g.step), [xb, yb] = pxOf(g.lng0 + (g.cols - .5) * g.step, g.lat0 - g.step / 2);
  const x0 = Math.max(0, Math.floor(xa)), y0 = Math.max(0, Math.floor(ya)), w = Math.min(LW, Math.ceil(xb)) - x0, h = Math.min(LH, Math.ceil(yb)) - y0;
  if (w <= 0 || h <= 0) return;
  const dep = new Float32Array(w * h).fill(-1);                       // metres below the datum; -1 where there is no sea floor to draw
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const [lng, lat] = llOf(x0 + xx + .5, y0 + y + .5), fr = (lat - g.lat0) / g.step, fc = (lng - g.lng0) / g.step;
    if (fr < -.5 || fc < -.5 || fr > g.rows - .5 || fc > g.cols - .5) continue;          // outside the grid: nothing
    const near = e[Math.min(g.rows - 1, Math.max(0, Math.round(fr))) * g.cols + Math.min(g.cols - 1, Math.max(0, Math.round(fc)))];
    if (near == null || near >= 0) continue;                           // the nearest cell is land, or has no value: nothing
    const r0 = Math.min(g.rows - 1, Math.max(0, Math.floor(fr))), c0 = Math.min(g.cols - 1, Math.max(0, Math.floor(fc)));
    const r1 = Math.min(g.rows - 1, r0 + 1), c1 = Math.min(g.cols - 1, c0 + 1), u = clamp01(fc - c0), v = clamp01(fr - r0);
    let s = 0, k = 0;
    [[r0, c0, (1 - u) * (1 - v)], [r0, c1, u * (1 - v)], [r1, c0, (1 - u) * v], [r1, c1, u * v]].forEach(([r, cc, wgt]) => { const val = e[r * g.cols + cc];
      if (val != null && val < 0 && wgt > 0) { s += val * wgt; k += wgt; } });      // only cells that are sea take part
    dep[y * w + xx] = k > 0 ? -s / k : -near;
  }
  const img = x.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const i = y * w + xx, d = dep[i]; if (d < 0) continue;
    const l = xx > 0 && dep[i - 1] >= 0 ? dep[i - 1] : d, r = xx < w - 1 && dep[i + 1] >= 0 ? dep[i + 1] : d, up = y > 0 && dep[i - w] >= 0 ? dep[i - w] : d, dn = y < h - 1 && dep[i + w] >= 0 ? dep[i + w] : d;
    const lam = Math.min(1.3, Math.max(.6, 1 + ((r - l) * .55 + (dn - up) * .45) / 110));   // light from the north-west: a slope facing it is brighter
    const col = colOf(SCALE.depth, d), o = i * 4;
    img.data[o] = Math.min(255, col[0] * lam); img.data[o + 1] = Math.min(255, col[1] * lam); img.data[o + 2] = Math.min(255, col[2] * lam); img.data[o + 3] = 250; }
  x.putImageData(img, x0, y0);
}
const NO_DEPTH = () => T('NO DEPTH DATA LOADED YET · THE SEA FLOOR IS NOT DRAWN', 'ΔΕΝ ΕΧΟΥΝ ΦΟΡΤΩΘΕΙ ΑΚΟΜΗ ΔΕΔΟΜΕΝΑ ΒΑΘΟΥΣ · Ο ΒΥΘΟΣ ΔΕΝ ΣΧΕΔΙΑΖΕΤΑΙ');
function seabedPaint(c) {
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  c.fillStyle = 'rgba(5,13,24,.95)'; c.fillRect(0, 0, LW, LH);
  if (seabed) c.drawImage(depthC, 0, 0);
  landFill(c, '#0b1826'); coast(c); regionLabels(c);
  if (!seabed) { hatch(c, '#2f7fb8'); pill(c, NO_DEPTH(), '#8fd0f5', IY1 + 40 * U); }
  else if (seabed.meta.testOnly) pill(c, T('TEST FIXTURE · NOT REAL DEPTHS', 'ΔΟΚΙΜΑΣΤΙΚΟ ΑΡΧΕΙΟ · ΟΧΙ ΠΡΑΓΜΑΤΙΚΑ ΒΑΘΗ'), '#F2A56B', IY1 + 40 * U);
}
async function loadSeabed() {
  const r = await fetch('/api/fieldwork/seabedgrid', { headers: { accept: 'application/json' } });
  if (!r.ok) { seabed = null; return; }                               // no file yet: the sheet says so
  const j = await r.json(), g = j && j.grid, e = j && j.elevation;
  const okGrid = g && [g.lat0, g.lng0, g.step].every((v) => typeof v === 'number' && isFinite(v)) && g.step > 0 && Number.isInteger(g.rows) && Number.isInteger(g.cols)
    && g.rows > 1 && g.cols > 1 && g.rows * g.cols <= 400000 && Array.isArray(e) && e.length === g.rows * g.cols && j.unit === 'm';
  if (!okGrid) { seabed = null; return; }
  const elev = e.map((v) => (typeof v === 'number' && isFinite(v) ? v : null)), sea = elev.filter((v) => v != null && v < 0);
  if (!sea.length) { seabed = null; return; }
  seabed = { grid: { lat0: g.lat0, lng0: g.lng0, step: g.step, rows: g.rows, cols: g.cols }, elev, cells: sea.length, deepest: Math.round(-Math.min(...sea)),
    meta: { attribution: String(j.attribution || '').slice(0, 160), licence: String(j.licence || '').slice(0, 40), retrievedAt: String(j.retrievedAt || '').slice(0, 10), testOnly: j.testOnly === true } };
  buildDepth();
}

/* ---- waves: the sea model's points, with crests that travel the way the model says the waves travel ---- */
// Wavelength in deep water grows with the square of the period (about 1.56 x T x T metres), so the gap between crests
// is drawn wider for a longer period. It is far too small to draw to scale: the gap shows longer or shorter, not metres.
const waveGap = (period) => (5 + Math.min(14, period) ** 2 * .16) * (mobile ? .85 : 1);
const WAVE_COL = '225,244,255';
function wavesPaint(c, t, anim) {
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  coast(c); if (withNames('waves')) regionLabels(c);
  if (!seaPts.length) { pill(c, emptyWords(), '#8fd0f5'); return; }
  c.lineCap = 'round';
  seaPts.forEach((p) => { const [x, y] = pxOf(p.lng, p.lat);
    if (!isSea(x, y)) return;                                          // a sea model has nothing to say on land
    if (p.wave != null) { const hgt = Math.min(4, Math.max(0, p.wave));
      if (p.dir != null && p.period != null && p.period > 0) {
        const b = ((p.dir + 180) % 360) * Math.PI / 180, dx = Math.sin(b), dy = -Math.cos(b);   // the feed says where waves come FROM; they travel the other way
        const gap = waveGap(p.period), half = 5 + hgt * 5, reach = gap * 2.4, ph = anim ? (t / p.period) % 1 : 0;   // one crest passes the dot every wave period
        for (let k = -3; k <= 3; k++) { const s = (k + ph) * gap; if (Math.abs(s) > reach) continue;
          const cx = x + dx * s, cy = y + dy * s; if (!isSea(cx, cy)) continue;
          c.strokeStyle = `rgba(${WAVE_COL},${(.22 + .7 * (1 - Math.abs(s) / reach)).toFixed(3)})`; c.lineWidth = 1 + hgt * .55;
          c.beginPath(); c.moveTo(cx + dy * half, cy - dx * half); c.quadraticCurveTo(cx + dx * half * .4, cy + dy * half * .4, cx - dy * half, cy + dx * half); c.stroke(); }
        if (!anim) arrow(c, x + dx * (reach + 3), y + dy * (reach + 3), Math.atan2(dy, dx), 9, `rgba(${WAVE_COL},.95)`, 1.5);
      } else {                                                         // no direction or period in the feed: a ring that stands still, wider for higher waves
        c.strokeStyle = `rgba(${WAVE_COL},.9)`; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, 4 + Math.min(3, hgt) * 8, 0, 7); c.stroke(); } }
    if (p.sst != null) { c.fillStyle = rgb(colOf(SCALE.sst, p.sst)); c.strokeStyle = 'rgba(2,6,12,.9)'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); c.stroke(); tinyText(c, fmt(p.sst) + '°', x + 7, y - 6); }
    if (p.wave != null) tinyText(c, fmt(p.wave) + ' m' + (p.period != null ? ' · ' + fmt(p.period) + ' s' : ''), x + 7, y + 13); });
}

/* ---- ships: published statistics by quarter at five ports. No ship is drawn, and nothing here travels. ---- */
// Eurostat mar_tf_qm (vessel arrivals at Larnaka and Lemesos) and mar_go_qm_cy (gross weight of goods at five ports),
// read from the frozen extracts behind #/fieldwork/sea. Each port is a marker at an approximate place. Two rules, both
// stated in the key: the ring's area grows with the arrivals of the latest reported quarter, and the ring brightens and
// dims in place at a pace of one pulse every 8 seconds for one arrival a day (PULSE_S / arrivals per day).
const PULSE_S = 8;
const quarterDays = (q) => { const m = /^(\d{4})-Q([1-4])$/.exec(q || ''); if (!m) return null; const y = Number(m[1]), leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return [leap ? 91 : 90, 91, 92, 92][Number(m[2]) - 1]; };
const quarterIndex = (q) => { const m = /^(\d{4})-Q([1-4])$/.exec(q || ''); return m ? Number(m[1]) * 4 + Number(m[2]) : null; };
let ships = null;                                                     // { ports, arrivals: meta, freight: meta } once the two extracts are read
async function loadShips() {
  const get = async (name) => { const r = await fetch('/api/fieldwork/' + name, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(name + ' ' + r.status); return r.json(); };
  let arr = null, fr = null;
  try { [arr, fr] = await Promise.all([get('seaarrivals'), get('seafreight')]); } catch (e) { ships = null; return; }
  const valueAt = (file, code, q) => { const s = (file.series || []).find((x) => x.code === code); const hit = s && (s.points || []).find((pt) => pt[0] === q);
    return hit && typeof hit[1] === 'number' && isFinite(hit[1]) ? hit[1] : null; };
  const newest = quarterIndex(fr.coverage && fr.coverage.lastObservedPeriod);
  const ports = (fr.ports || []).filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number').map((p) => {
    const cq = fr.coverage && fr.coverage.lastTotalByPort && fr.coverage.lastTotalByPort[p.code], cargo = cq ? valueAt(fr, p.code + '|TOTAL|TOTAL', cq) : null;
    const aq = arr.coverage && arr.coverage.lastTotalByPort && arr.coverage.lastTotalByPort[p.code], arrivals = aq ? valueAt(arr, p.code + '|TOTAL', aq) : null;
    const days = quarterDays(aq), perDay = arrivals != null && days ? arrivals / days : null;
    return { code: p.code, name: [String(p.name), String(p.nameEl || p.name)], lat: p.latitude, lng: p.longitude, approx: p.positionApproximate === true,
      cargo, cargoQ: cq || null, ended: newest != null && quarterIndex(cq) != null && newest - quarterIndex(cq) > 4,   // more than a year behind the newest quarter in the file
      arrivals, arrQ: aq || null, perDay, pulseS: perDay ? PULSE_S / perDay : null };
  });
  if (!ports.length) { ships = null; return; }
  const meta = (f) => ({ id: String(f.datasetId || ''), retrieved: String(f.retrievedAt || '').slice(0, 10), attribution: [String(f.attribution || ''), String(f.attributionEl || f.attribution || '')] });
  ships = { ports, maxCargo: Math.max(1, ...ports.filter((p) => !p.ended && p.cargo != null).map((p) => p.cargo)), arrivals: meta(arr), freight: meta(fr),
    arrQ: (arr.coverage && arr.coverage.lastObservedPeriod) || null, cargoQ: (fr.coverage && fr.coverage.lastObservedPeriod) || null };
}
const shipRing = (p) => (7 + Math.sqrt(p.arrivals) * 1.05) * U;       // the area of the ring grows with the arrivals
const shipsPanel = () => { const [bx, by] = pxOf(32.62, 34.36); return { bx, by, pw: 392 * U, ph: (44 + ships.ports.length * 19 + 2 * 15 + 22) * U }; };
// the part of the region this sheet uses: its ports, their rings, and the panel of figures
function shipsWin() { if (!ships) return null; const q = shipsPanel(); let x0 = q.bx - 12 * U, y0 = q.by - 10 * U, x1 = x0 + q.pw + 4 * U, y1 = y0 + q.ph + 4 * U;
  ships.ports.forEach((p) => { const [x, y] = pxOf(p.lng, p.lat), r = (p.arrivals != null ? shipRing(p) : 7 * U) + 4 * U; x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); });
  return { x0, y0, w: x1 - x0, h: y1 - y0 }; }
function shipsPaint(c, t, anim) {
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  coast(c); if (withNames('ships')) regionLabels(c);
  if (!ships) { pill(c, T('THE PORT STATISTICS COULD NOT BE READ', 'ΤΑ ΣΤΑΤΙΣΤΙΚΑ ΤΩΝ ΛΙΜΑΝΙΩΝ ΔΕΝ ΔΙΑΒΑΣΤΗΚΑΝ'), '#ffb86b'); return; }
  const mono = (px, w) => `${w || 700} ${Math.round(px * U)}px ui-monospace, Menlo, monospace`;
  ships.ports.forEach((p, i) => { const [x, y] = pxOf(p.lng, p.lat);
    if (p.arrivals != null && p.pulseS) {                             // the ring stays where it is and at its size; only its brightness beats
      const beat = anim ? .5 + .5 * Math.cos(t * 2 * Math.PI / p.pulseS) : 1;
      c.strokeStyle = `rgba(255,184,107,${(.3 + .65 * beat).toFixed(3)})`; c.lineWidth = 2.4 * U; c.beginPath(); c.arc(x, y, shipRing(p), 0, 7); c.stroke(); }
    c.beginPath(); c.arc(x, y, 6.5 * U, 0, 7); c.lineWidth = 1.4 * U;
    if (p.ended) { c.fillStyle = 'rgba(8,16,26,.9)'; c.fill(); c.strokeStyle = '#8fa9c4'; c.stroke(); } else { c.fillStyle = '#ffb86b'; c.fill(); c.strokeStyle = 'rgba(2,6,12,.95)'; c.stroke(); }
    c.font = mono(9, 800); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = p.ended ? '#8fa9c4' : '#06131f'; c.fillText(String(i + 1), x, y + .5); });
  // the figures, set out in open water south of the island: one row per port, the bar is the weight of goods
  const { bx, by, pw, ph } = shipsPanel(), rowH = 19 * U, barX = bx + 104 * U, barW = 150 * U;
  c.fillStyle = 'rgba(4,10,18,.86)'; c.strokeStyle = 'rgba(255,184,107,.45)'; c.lineWidth = 1; c.beginPath();
  if (c.roundRect) c.roundRect(bx - 10 * U, by - 8 * U, pw, ph, 8 * U); else c.rect(bx - 10 * U, by - 8 * U, pw, ph); c.fill(); c.stroke();
  c.textAlign = 'left'; c.textBaseline = 'middle'; let yy = by + 6 * U;
  c.font = mono(9.5, 800); c.fillStyle = '#ffb86b'; c.fillText(T('GOODS HANDLED · THOUSAND TONNES · LATEST QUARTER', 'ΕΜΠΟΡΕΥΜΑΤΑ · ΧΙΛΙΑΔΕΣ ΤΟΝΟΙ · ΤΕΛΕΥΤΑΙΟ ΤΡΙΜΗΝΟ'), bx, yy, pw - 20 * U); yy += 20 * U;
  ships.ports.forEach((p, i) => {
    c.font = mono(10, 700); c.fillStyle = p.ended ? '#8fa9c4' : '#eaf2fb'; c.fillText((i + 1) + ' ' + TT(p.name), bx, yy, 98 * U);
    if (p.ended || p.cargo == null) { c.font = mono(9, 600); c.fillStyle = '#8fa9c4';
      c.fillText(p.cargoQ ? T('no figures after ' + p.cargoQ, 'κανένα στοιχείο μετά το ' + p.cargoQ) : T('no figure published', 'δεν δημοσιεύτηκε στοιχείο'), barX, yy, pw - 124 * U); }
    else { const w = Math.max(1, barW * p.cargo / ships.maxCargo);
      c.fillStyle = 'rgba(255,184,107,.9)'; c.fillRect(barX, yy - 5 * U, w, 10 * U);
      c.font = mono(9.5, 700); c.fillStyle = '#eaf2fb'; c.fillText(nf(p.cargo) + ' · ' + p.cargoQ, barX + w + 6 * U, yy, pw - 124 * U - w); }
    yy += rowH; });
  yy += 2 * U;
  ships.ports.filter((p) => p.arrivals != null).forEach((p) => { c.font = mono(9.5, 700); c.fillStyle = '#ffd9ae';
    c.fillText(T(TT(p.name) + ': ' + nf(p.arrivals) + ' vessel arrivals in ' + p.arrQ + ' · about ' + fmt(p.perDay) + ' a day', TT(p.name) + ': ' + nf(p.arrivals) + ' αφίξεις πλοίων το ' + p.arrQ + ' · περίπου ' + fmt(p.perDay) + ' την ημέρα'), bx, yy, pw - 20 * U); yy += 15 * U; });
  c.font = mono(8.5, 700); c.fillStyle = '#8fa9c4';
  c.fillText(T('EUROSTAT, BY QUARTER · PLACES ARE APPROXIMATE · NOT LIVE SHIPS', 'EUROSTAT, ΑΝΑ ΤΡΙΜΗΝΟ · ΘΕΣΕΙΣ ΚΑΤΑ ΠΡΟΣΕΓΓΙΣΗ · ΟΧΙ ΠΛΟΙΑ ΤΩΡΑ'), bx, yy + 4 * U, pw - 20 * U);
}

/* ---- aeroplanes: an anonymous arrow per aircraft, lifted by its height (the 3D marks are built further down) ---- */
// GET /api/aircraft gives points { id, lat, lng, altFt, onGround, gs, track, phase }: no callsign, no hex id, places
// rounded, nothing kept. This sheet only draws them. They are never added to layers.js, the brain or a prompt.
const AC = { every: 20000, oldMs: 90000, ftStep: 10000, yStep: 17, driftMaxS: 25 };   // 10,000 ft lifts an arrow 17 units: 45,000 ft is still under the next sheet
const AC_PHASE = {                                                    // the same words as the Aeroplanes page (pages/aircraft.js)
  high: ['High: likely passing over', 'Ψηλά: μάλλον περνά από πάνω'], low: ['Low: likely arriving or departing', 'Χαμηλά: μάλλον φτάνει ή φεύγει'],
  ground: ['On the ground', 'Στο έδαφος'], unknown: ['Height not reported', 'Χωρίς αναφορά ύψους'] };
const AC_COL = { high: '#f4fbff', low: '#F7C46B', ground: '#9db6d1', unknown: '#c8b6ff' };
const AC_DEMO = () => T('DEMO DATA · NOT REAL AEROPLANES', 'ΔΕΔΟΜΕΝΑ ΕΠΙΔΕΙΞΗΣ · ΟΧΙ ΠΡΑΓΜΑΤΙΚΑ ΑΕΡΟΠΛΑΝΑ');
const AC_FAIL = () => T('NO POSITIONS JUST NOW · THIS IS NOT AN EMPTY SKY', 'ΧΩΡΙΣ ΘΕΣΕΙΣ ΑΥΤΗ ΤΗ ΣΤΙΓΜΗ · ΔΕΝ ΣΗΜΑΙΝΕΙ ΑΔΕΙΟ ΟΥΡΑΝΟ');
let planes = null;                                                    // { at, pts, mock, centre, failed }
const planesFresh = () => !!(planes && !planes.failed && Date.now() - planes.at < AC.oldMs);
function aircraftPaint(c) {
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  coast(c); if (withNames('aircraft')) regionLabels(c);
  if (!planes) { pill(c, T('LISTENING FOR AEROPLANES…', 'ΑΚΟΥΜΕ ΓΙΑ ΑΕΡΟΠΛΑΝΑ…'), '#f4fbff'); return; }
  if (planes.centre) { const [x, y] = pxOf(planes.centre.lng, planes.centre.lat), ry = planes.centre.distNm / 60 * LH / RH, rx = planes.centre.distNm / 60 / Math.cos(planes.centre.lat * Math.PI / 180) * I.k * LW / RW;
    c.save(); c.strokeStyle = 'rgba(244,251,255,.45)'; c.lineWidth = 1.2; c.setLineDash([6, 6]); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.stroke(); c.restore(); }   // how far we ask
  if (!planesFresh()) { pill(c, AC_FAIL(), '#F2A56B'); return; }
  planes.pts.forEach((p) => { const [x, y] = pxOf(p.lng, p.lat);     // the place it was heard, and its height in words: the arrow itself floats above
    c.fillStyle = AC_COL[p.phase]; c.strokeStyle = 'rgba(2,6,12,.9)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill(); c.stroke();
    tinyText(c, p.onGround ? T('on the ground', 'στο έδαφος') : p.altFt == null ? T('height not reported', 'χωρίς ύψος') : nf(p.altFt) + ' ft', x + 6, y + 12); });
  if (planes.mock) pill(c, AC_DEMO(), '#F2A56B', IY0 - 34 * U);
  else if (!planes.pts.length) pill(c, T('NO AEROPLANE HEARD · THE SKY MAY NOT BE EMPTY', 'ΔΕΝ ΑΚΟΥΣΤΗΚΕ ΑΕΡΟΠΛΑΝΟ · Ο ΟΥΡΑΝΟΣ ΙΣΩΣ ΔΕΝ ΕΙΝΑΙ ΑΔΕΙΟΣ'), '#f4fbff', IY0 - 34 * U);
}
async function loadAircraft() {
  try {
    const r = await fetch('/api/aircraft', { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
    const pts = (Array.isArray(j.points) ? j.points : []).filter((p) => p && num(p.lat) != null && num(p.lng) != null && AC_PHASE[p.phase]).slice(0, 200)
      .map((p) => ({ id: String(p.id), lat: p.lat, lng: p.lng, altFt: num(p.altFt), onGround: p.onGround === true, gs: num(p.gs), track: num(p.track), phase: p.phase }));
    const ce = j.centre && num(j.centre.lat) != null && num(j.centre.lng) != null && num(j.centre.distNm) != null ? { lat: j.centre.lat, lng: j.centre.lng, distNm: j.centre.distNm } : null;
    planes = { at: Date.now(), pts, mock: j.mock === true, centre: ce, more: num(j.more) || 0, failed: false };
  } catch (e) { planes = { at: Date.now(), pts: [], mock: false, centre: planes && planes.centre, more: 0, failed: true }; }
  buildPlanes();
}

/* ---- THE SHEETS, seabed up to space ----
   HOW TO ADD A SHEET: add one object to LAYERS (its place in the list is its height in the stack) and, if it is fed, one
   paint function. Nothing else needs to know about it: the rail, the key, the ruler, the camera and the tests all read LAYERS.

   id, band     a short id; band is one of SPACE / AIR / GROUND / CITY / WATER (the groups of the rail, which fold).
   name, src    [English, Greek]: the sheet's name, and one line naming its source. c is the sheet's own colour.
   height       [English, Greek]: the words on the ruler for the level this sheet stands for.
   info         the key, every line as [English, Greek]:
                  cap    what the sheet shows, in one plain sentence     scale  a key of SCALE: a colour bar with units (optional)
                  move   what the motion means                           rest   the same for reduced motion (still marks, same information)
                  never  used instead of move/rest when nothing moves    marks  more lines: an array, or a function returning one
   A SHEET WITH NO DATA YET: give it make() (its example drawing) and nolive: true. It is faded, striped and stamped
                "example drawing · no live data yet"; its key shows no scale and claims no motion. Never invent numbers.
   A FED SHEET: give it paint(ctx, t, anim, dt). It repaints its own canvas from what arrived: only what the feed holds,
                only where the feed has data, and when there is nothing it says so in words (emptySheet / pill). anim is
                false for reduced motion. beat: n repaints every n-th frame while animating; without it the sheet is
                repainted only after touch(id). state() returns { kind, text } for the key's source line, kind being
                'measured' | 'model' | 'published' | 'demo' | 'none'. card() may return { b, em, cls } for the rail.
   HOW LIVE DATA ARRIVES: through /layers/api/live (feed: { vars, own } names the measurements; paintWind() fills the
                grids), or through the sheet's own load(): an async function that fetches and keeps what it got, run at
                the start and then every `every` milliseconds while the sheet is shown. After a load the sheet is
                touched and the rail and the key are brought up to date.
   WHERE IT DRAWS: by default a sheet's canvas is the whole region. win: 'island' makes it the island's box only (a drawing
                of Cyprus); win: () => field makes it as large as a model's grid (mkField), refitted when data lands. Paint
                in sheet pixels (pxOf(lng, lat)) either way: the canvas is shifted for you, and what falls outside is cut off.
   Options:     solid (an opaque floor), additive (light adds up: the air), lines() rows for the panel under a sheet on its
                own, srcNow() a source line that depends on what has loaded, link [url, text] shown under the key's source.
*/
const none = (text) => ({ kind: 'none', text });
const NO_LIVE = () => none(T('No live data yet. The picture on this sheet is an example drawing, not a measurement.', 'Χωρίς ζωντανά δεδομένα ακόμη. Η εικόνα σε αυτό το φύλλο είναι σχέδιο-παράδειγμα, όχι μέτρηση.'));
const GONE = () => (live ? none(T('No data arrived for this sheet, so nothing is drawn on it.', 'Δεν ήρθαν δεδομένα για αυτό το φύλλο, άρα δεν σχεδιάζεται τίποτα πάνω του.'))
  : none(T('Waiting for the first readings…', 'Αναμονή για τις πρώτες μετρήσεις…')));
// the name a source goes by in the register (in the reader's language), or its id when the register is not here yet
const srcName = (id) => { const row = live && live.layers && live.layers.find((l) => l.id === id); return row ? T(row.name, row.nameEl || row.name) : id; };
const skyAge = () => (skyAt ? ageText((Date.now() - skyAt) / 60000) : T('age not stated', 'η ηλικία δεν δηλώνεται'));
const modelState = (src, n, age) => ({ kind: 'model', text: srcName(src) + ' · ' + T(n + ' grid points', n + ' σημεία πλέγματος') + ' · ' + age });
const EDGE_MARK = ['Nothing is drawn outside the dashed frame: the model grid we ask for ends there. Empty does not mean zero.', 'Έξω από το διακεκομμένο πλαίσιο δεν σχεδιάζεται τίποτα: εκεί τελειώνει το πλέγμα του μοντέλου που ζητάμε. Κενό δεν σημαίνει μηδέν.'];
const demoCoastMark = () => (terrain && terrain.kind === 'demo' ? [['Demo: the land around Cyprus is a rough stand-in shape here, not the real coastline.', 'Δοκιμή: η στεριά γύρω από την Κύπρο είναι εδώ ένα πρόχειρο σχήμα, όχι η πραγματική ακτογραμμή.']] : []);
const LAYERS = [
  { id: 'seabed', band: 'WATER', c: '#2f7fb8', solid: true, name: ['Seabed depth', 'Βάθος βυθού'], src: ['no depth grid loaded yet', 'δεν έχει φορτωθεί ακόμη πλέγμα βάθους'],
    height: ['SEA FLOOR', 'ΒΥΘΟΣ'], paint: seabedPaint, load: loadSeabed,
    srcNow: () => (seabed ? (seabed.meta.testOnly ? ['TEST FIXTURE · not real depths', 'ΔΟΚΙΜΑΣΤΙΚΟ ΑΡΧΕΙΟ · όχι πραγματικά βάθη'] : ['EMODnet Bathymetry · published depth grid', 'EMODnet Bathymetry · δημοσιευμένο πλέγμα βάθους']) : null),
    lines: () => (seabed ? [[T('deepest cell in the grid', 'βαθύτερο κελί του πλέγματος'), nf(seabed.deepest) + ' m', seabed.meta.testOnly ? T('test fixture', 'δοκιμαστικό αρχείο') : 'EMODnet']] : []),
    state: () => (seabed ? { kind: seabed.meta.testOnly ? 'demo' : 'published',
      text: (seabed.meta.testOnly ? T('Test fixture, not real depths. ', 'Δοκιμαστικό αρχείο, όχι πραγματικά βάθη. ') : '') + seabed.meta.attribution + ' · ' + seabed.meta.licence + ' · '
        + T(nf(seabed.cells) + ' sea cells, one every ' + fmt(seabed.grid.step * 111) + ' km · retrieved ' + seabed.meta.retrievedAt, nf(seabed.cells) + ' κελιά θάλασσας, ένα κάθε ' + fmt(seabed.grid.step * 111) + ' km · ανάκτηση ' + seabed.meta.retrievedAt) }
      : none(T('No depth grid has been loaded, so the sea floor is not drawn. Nothing on this sheet is a depth.', 'Δεν έχει φορτωθεί πλέγμα βάθους, άρα ο βυθός δεν σχεδιάζεται. Τίποτα σε αυτό το φύλλο δεν είναι βάθος.'))),
    card: () => (seabed ? { b: nf(seabed.deepest), em: 'm · ' + T('deepest cell', 'βαθύτερο κελί'), cls: 'old' } : { b: '—', em: T('no depth data yet', 'χωρίς δεδομένα βάθους ακόμη'), cls: 'year' }),
    info: { scale: 'depth',
      cap: ['How deep the sea floor lies around Cyprus, from a published depth grid. Darker blue is deeper.', 'Πόσο βαθιά βρίσκεται ο βυθός γύρω από την Κύπρο, από ένα δημοσιευμένο πλέγμα βάθους. Πιο σκούρο μπλε σημαίνει πιο βαθιά.'],
      never: ['Nothing moves here: the sea floor does not change from one day to the next.', 'Εδώ δεν κινείται τίποτα: ο βυθός δεν αλλάζει από τη μια μέρα στην άλλη.'],
      marks: () => [['The light and shade show the slopes of the sea floor. They are worked out from the same depths.', 'Το φως και η σκιά δείχνουν τις πλαγιές του βυθού. Υπολογίζονται από τα ίδια βάθη.'],
        ['The grid is put together from many surveys, some old, and filled in between them. It is for learning, not for navigation.', 'Το πλέγμα συντίθεται από πολλές μετρήσεις, κάποιες παλιές, και συμπληρώνεται ανάμεσά τους. Είναι για μάθηση, όχι για ναυσιπλοΐα.'],
        ['Where the grid has no value, nothing is drawn.', 'Όπου το πλέγμα δεν έχει τιμή, δεν σχεδιάζεται τίποτα.']].concat(demoCoastMark()) } },
  { id: 'waves', band: 'WATER', c: '#8fd0f5', name: ['Waves and sea temperature', 'Κύματα και θερμοκρασία θάλασσας'], src: ['Open-Meteo marine model · sea points', 'Θαλάσσιο μοντέλο Open-Meteo · σημεία θάλασσας'],
    height: ['SEA SURFACE', 'ΕΠΙΦΑΝΕΙΑ ΘΑΛΑΣΣΑΣ'], paint: wavesPaint, beat: 2, feed: { vars: ['sea_surface_temperature', 'wave_height'] },
    state: () => { if (!seaPts.length) return GONE(); const r = best('sea_surface_temperature', false);
      return { kind: 'model', text: srcName('openmeteo-marine') + ' · ' + T(seaPts.length + ' sea points', seaPts.length + ' σημεία θάλασσας') + ' · ' + (r ? ageText(r.ageMin) : T('age not stated', 'η ηλικία δεν δηλώνεται')) }; },
    info: { scale: 'sst',
      cap: ['How high the waves are, which way they travel and how warm the sea surface is, at the points the sea model reports.', 'Πόσο ψηλά είναι τα κύματα, προς τα πού ταξιδεύουν και πόσο ζεστή είναι η επιφάνεια της θάλασσας, στα σημεία που δίνει το μοντέλο της θάλασσας.'],
      move: () => (seaPts.some((p) => p.dir != null && p.period != null)
        ? ['The crests travel the way the model says the waves travel. One crest passes each dot every wave period, in real time. Longer, thicker crests mean higher waves; a wider gap means a longer wave.', 'Οι κορυφές ταξιδεύουν προς τα εκεί που λέει το μοντέλο ότι πάνε τα κύματα. Μία κορυφή περνά από κάθε κουκκίδα σε κάθε περίοδο κύματος, σε πραγματικό χρόνο. Πιο μακριές και χοντρές κορυφές σημαίνουν πιο ψηλά κύματα· πιο μεγάλο κενό σημαίνει πιο μακρύ κύμα.']
        : ['Nothing moves: the feed gave no wave direction or period, so each ring stands still. A wider ring means higher waves.', 'Τίποτα δεν κινείται: η πηγή δεν έδωσε κατεύθυνση ή περίοδο κύματος, άρα κάθε δαχτυλίδι μένει ακίνητο. Πιο φαρδύ δαχτυλίδι σημαίνει πιο ψηλά κύματα.']),
      rest: () => (seaPts.some((p) => p.dir != null && p.period != null)
        ? ['The crests stand still and the small arrow shows which way the waves travel. Longer, thicker crests mean higher waves; a wider gap means a longer wave.', 'Οι κορυφές μένουν ακίνητες και το μικρό βέλος δείχνει προς τα πού ταξιδεύουν τα κύματα. Πιο μακριές και χοντρές κορυφές σημαίνουν πιο ψηλά κύματα· πιο μεγάλο κενό σημαίνει πιο μακρύ κύμα.']
        : ['The feed gave no wave direction or period, so each ring stands still. A wider ring means higher waves.', 'Η πηγή δεν έδωσε κατεύθυνση ή περίοδο κύματος, άρα κάθε δαχτυλίδι μένει ακίνητο. Πιο φαρδύ δαχτυλίδι σημαίνει πιο ψηλά κύματα.']),
      marks: [['The dot colour is the sea temperature. Beside it: the temperature, the wave height in metres and the wave period in seconds.', 'Το χρώμα της κουκκίδας είναι η θερμοκρασία της θάλασσας. Δίπλα της: η θερμοκρασία, το ύψος κύματος σε μέτρα και η περίοδος κύματος σε δευτερόλεπτα.'],
        ['This is a model, not a buoy: nobody measured these waves. The gap between crests is not to scale.', 'Αυτό είναι μοντέλο, όχι σημαδούρα: κανείς δεν μέτρησε αυτά τα κύματα. Το κενό ανάμεσα στις κορυφές δεν είναι σε κλίμακα.'],
        ['Marks are drawn only at the points of the sea model, never over land. Between the points nothing is filled in.', 'Τα σημάδια σχεδιάζονται μόνο στα σημεία του μοντέλου της θάλασσας, ποτέ πάνω από στεριά. Ανάμεσα στα σημεία δεν συμπληρώνεται τίποτα.']] } },
  { id: 'ships', band: 'WATER', c: '#ffb86b', win: shipsWin, name: ['Ports and ships, by quarter', 'Λιμάνια και πλοία, ανά τρίμηνο'], src: ['Eurostat · published port statistics', 'Eurostat · δημοσιευμένα στατιστικά λιμανιών'],
    height: ['SEA LEVEL · PORTS', 'ΣΤΑΘΜΗ ΘΑΛΑΣΣΑΣ · ΛΙΜΑΝΙΑ'], paint: shipsPaint, beat: 3, load: loadShips,
    state: () => (ships ? { kind: 'published', text: T('Eurostat, ' + ships.arrivals.id + ' (vessel arrivals, ' + ships.arrQ + ') and ' + ships.freight.id + ' (goods, ' + ships.cargoQ + ') · retrieved ' + ships.freight.retrieved + ' · ',
      'Eurostat, ' + ships.arrivals.id + ' (αφίξεις πλοίων, ' + ships.arrQ + ') και ' + ships.freight.id + ' (εμπορεύματα, ' + ships.cargoQ + ') · ανάκτηση ' + ships.freight.retrieved + ' · ') + TT(ships.freight.attribution) }
      : none(T('The port statistics could not be read, so nothing is drawn on this sheet.', 'Τα στατιστικά των λιμανιών δεν διαβάστηκαν, άρα δεν σχεδιάζεται τίποτα σε αυτό το φύλλο.'))),
    card: () => (ships ? { b: ships.cargoQ || '—', em: T(ships.ports.length + ' ports · published', ships.ports.length + ' λιμάνια · δημοσιευμένα'), cls: 'year' } : { b: '—', em: T('nothing arrived', 'δεν ήρθε τίποτα'), cls: 'year' }),
    lines: () => (ships ? ships.ports.map((p) => [TT(p.name), p.ended || p.cargo == null ? T('no figures after ' + p.cargoQ, 'κανένα στοιχείο μετά το ' + p.cargoQ)
      : nf(p.cargo) + ' ' + T('thousand tonnes', 'χιλ. τόνοι') + ' · ' + p.cargoQ + (p.arrivals != null ? ' · ' + nf(p.arrivals) + ' ' + T('arrivals', 'αφίξεις') + ' · ' + p.arrQ : ''), 'Eurostat']) : []),
    info: {
      cap: ['Five ports that report to Eurostat, with what was published for the latest quarter: the weight of goods handled, in thousand tonnes, and for Larnaka and Lemesos the number of vessel arrivals.', 'Πέντε λιμάνια που δίνουν στοιχεία στη Eurostat, με ό,τι δημοσιεύτηκε για το τελευταίο τρίμηνο: το βάρος των εμπορευμάτων, σε χιλιάδες τόνους, και για τη Λάρνακα και τη Λεμεσό ο αριθμός αφίξεων πλοίων.'],
      move: ['Only the rings beat, and they stay in place: a port with 1 arrival a day in that quarter beats once every 8 seconds, with 4 a day four times as often. This is the pace of a past quarter, not ships arriving now.', 'Μόνο τα δαχτυλίδια πάλλονται, και μένουν στη θέση τους: ένα λιμάνι με 1 άφιξη την ημέρα σε εκείνο το τρίμηνο πάλλεται μία φορά κάθε 8 δευτερόλεπτα, με 4 την ημέρα τέσσερις φορές πιο συχνά. Αυτός είναι ο ρυθμός ενός περασμένου τριμήνου, όχι πλοία που φτάνουν τώρα.'],
      rest: ['Nothing moves. The number beside each port says how many arrivals a day it had in that quarter. This is the pace of a past quarter, not ships arriving now.', 'Τίποτα δεν κινείται. Ο αριθμός δίπλα σε κάθε λιμάνι λέει πόσες αφίξεις την ημέρα είχε σε εκείνο το τρίμηνο. Αυτός είναι ο ρυθμός ενός περασμένου τριμήνου, όχι πλοία που φτάνουν τώρα.'],
      marks: [['A bigger ring means more vessel arrivals in the quarter (the area of the ring grows with the count). Arrivals a day is the count divided by the days of that quarter.', 'Πιο μεγάλο δαχτυλίδι σημαίνει περισσότερες αφίξεις πλοίων στο τρίμηνο (το εμβαδόν του δαχτυλιδιού μεγαλώνει με τον αριθμό). Οι αφίξεις την ημέρα είναι ο αριθμός διά τις ημέρες του τριμήνου.'],
        ['Each bar is the published total of goods for one port, in thousand tonnes. Each arrival counts once, so one ship can be counted many times.', 'Κάθε μπάρα είναι το δημοσιευμένο σύνολο εμπορευμάτων για ένα λιμάνι, σε χιλιάδες τόνους. Κάθε άφιξη μετρά μία φορά, άρα το ίδιο πλοίο μπορεί να μετρηθεί πολλές φορές.'],
        ['A hollow grey marker is a port with no published figure for the latest quarters.', 'Ένα κενό γκρίζο σημάδι είναι λιμάνι χωρίς δημοσιευμένο στοιχείο για τα τελευταία τρίμηνα.'],
        ['The numbered markers show approximate positions, added by Kleanthis. No ship is drawn: there is no live ship position on this page.', 'Τα αριθμημένα σημάδια δείχνουν θέσεις κατά προσέγγιση, που πρόσθεσε ο Κλεάνθης. Δεν σχεδιάζεται κανένα πλοίο: δεν υπάρχει ζωντανή θέση πλοίου σε αυτή τη σελίδα.']] } },
  { id: 'water', band: 'WATER', c: '#5bc8e0', nolive: true, win: 'island', name: ['Reservoirs and river reaches', 'Φράγματα και τμήματα ποταμών'], src: ['Water Development Department', 'Τμήμα Αναπτύξεως Υδάτων'],
    height: ['GROUND LEVEL', 'ΣΤΑΘΜΗ ΕΔΑΦΟΥΣ'],
    make: () => { const c = buf(), x = c.getContext('2d'); x.strokeStyle = 'rgba(91,200,224,.6)'; x.lineWidth = 1.1;
      for (let i = 0; i < 24; i++) { let [px, py] = ipx(.3 + hash(i, 3) * .42, .3 + hash(i, 9) * .3);
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 22; k++) { const g = gi(px, py); if (g < 0) break;
          px += -(g0.h[g + 1] - g0.h[g - 1]) * 150 + (fbm(px / 40, py / 40, 2) - .5) * 5;
          py += -(g0.h[g + GW] - g0.h[g - GW]) * 150 + (fbm(py / 40, px / 40, 2) - .5) * 5;
          x.lineTo(px, py); }
        x.globalAlpha = .3 + hash(i, 11) * .5; x.stroke(); }
      x.globalAlpha = 1;
      [[.3, .62, 10], [.42, .55, 7], [.24, .45, 6], [.52, .42, 5]].forEach(([u, v, r]) => { const [cx, cy] = ipx(u, v);
        const g = x.createRadialGradient(cx, cy, 1, cx, cy, r * 2.4);
        g.addColorStop(0, 'rgba(130,225,250,.95)'); g.addColorStop(1, 'rgba(60,150,200,0)');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r * 2.4, 0, 7); x.fill(); });
      return c; },
    info: { cap: ['Reservoirs and rivers. No live feed is connected yet, so this is an example drawing and shows no real amounts.', 'Φράγματα και ποτάμια. Δεν έχει συνδεθεί ακόμη ζωντανή πηγή, άρα αυτό είναι σχέδιο-παράδειγμα και δεν δείχνει πραγματικές ποσότητες.'] } },
  { id: 'island', band: 'GROUND', c: '#F7C46B', solid: true, name: ['Island relief and sensors', 'Ανάγλυφο και αισθητήρες'], src: ['OpenStreetMap · our SenseCAP cards', 'OpenStreetMap · οι κάρτες SenseCAP μας'],
    height: ['GROUND', 'ΕΔΑΦΟΣ'], paint: islandStep, beat: 3, feed: { vars: ['temperature', 'co2', 'pm25'], own: true },
    state: () => { if (!stationPts.length) return GONE();
      const names = [...new Set(stationPts.map((p) => p.src))].map(srcName).join(', '), newest = Math.max(...stationPts.map((p) => p.at || 0));
      return { kind: 'measured', text: names + ' · ' + T(stationPts.length + ' stations', stationPts.length + ' σταθμοί') + ' · ' + (newest ? ageText((Date.now() - newest) / 60000) : T('age not stated', 'η ηλικία δεν δηλώνεται')) }; },
    info: { scale: 'temp',
      cap: ['The air temperature measured at the official weather stations, and the four schools that carry our own sensors.', 'Η θερμοκρασία του αέρα όπως τη μετρούν οι επίσημοι μετεωρολογικοί σταθμοί, και τα τέσσερα σχολεία με τους δικούς μας αισθητήρες.'],
      move: ['A ring spreads from every station that reported in the last 30 minutes. An older reading keeps a wide, faint ring that stands still.', 'Ένα δαχτυλίδι απλώνεται από κάθε σταθμό που έστειλε μέτρηση τα τελευταία 30 λεπτά. Μια πιο παλιά μέτρηση έχει φαρδύ, αχνό δαχτυλίδι που μένει ακίνητο.'],
      rest: ['A bright ring marks a station that reported in the last 30 minutes. An older reading has a wide, faint ring.', 'Φωτεινό δαχτυλίδι σημαίνει σταθμός που έστειλε μέτρηση τα τελευταία 30 λεπτά. Μια πιο παλιά μέτρηση έχει φαρδύ, αχνό δαχτυλίδι.'],
      marks: () => [['Amber pins are the schools. The ring under a pin shows how old that school’s reading is: tight when new, wide and faint when hours old.', 'Οι κεχριμπαρένιες πινέζες είναι τα σχολεία. Το δαχτυλίδι κάτω από την πινέζα δείχνει πόσο παλιά είναι η μέτρηση του σχολείου: σφιχτό όταν είναι καινούρια, φαρδύ και αχνό όταν είναι ωρών.'],
        ['Our sensors are not coloured on this scale: they do not measure the same air as an outdoor station.', 'Οι αισθητήρες μας δεν χρωματίζονται με αυτή την κλίμακα: δεν μετρούν τον ίδιο αέρα με έναν εξωτερικό σταθμό.'],
        ['The hills of Cyprus are drawn, not surveyed. The land around Cyprus is a flat shape with no readings on it: it is there for your bearings.', 'Οι λόφοι της Κύπρου είναι σχεδιασμένοι, όχι μετρημένοι. Η στεριά γύρω από την Κύπρο είναι ένα επίπεδο σχήμα χωρίς μετρήσεις: υπάρχει για να προσανατολίζεσαι.']].concat(demoCoastMark()) } },
  { id: 'city', band: 'CITY', c: '#C4B8FF', nolive: true, win: 'island', name: ['Streets, buses, EV, people', 'Δρόμοι, λεωφορεία, φόρτιση, κάτοικοι'], src: ['OSM · GTFS · CYSTAT census', 'OSM · GTFS · απογραφή CYSTAT'],
    height: ['STREET LEVEL', 'ΣΤΑΘΜΗ ΔΡΟΜΟΥ'],
    make: () => { const c = buf(), x = c.getContext('2d');
      const towns = [[.63, .55, 1], [.49, .36, .95], [.3, .72, .9], [.1, .56, .7], [.76, .3, .6], [.38, .2, .5]].map(([u, v, w]) => [...ipx(u, v), w]);
      towns.forEach(([tx, ty, w]) => { for (let i = 0; i < 120 * w; i++) { const a = i * 2.399, d = Math.sqrt((i % 61) / 61) * 40 * w;
          x.fillStyle = `rgba(196,184,255,${(.5 - d / 120).toFixed(3)})`; x.fillRect(tx + Math.cos(a) * d, ty + Math.sin(a) * d * .8, 1.4, 1.4); }
        const g = x.createRadialGradient(tx, ty, 2, tx, ty, 44 * w);
        g.addColorStop(0, 'rgba(196,184,255,.4)'); g.addColorStop(1, 'rgba(160,140,255,0)');
        x.fillStyle = g; x.beginPath(); x.arc(tx, ty, 44 * w, 0, 7); x.fill(); });
      x.strokeStyle = 'rgba(214,206,255,.55)'; x.lineWidth = 1;
      [[0, 1], [1, 2], [2, 3], [1, 4], [0, 2], [1, 5]].forEach(([a, b]) => { const A = towns[a], B = towns[b];
        x.beginPath(); x.moveTo(A[0], A[1]);
        x.quadraticCurveTo((A[0] + B[0]) / 2 + 10, (A[1] + B[1]) / 2 - 8, B[0], B[1]); x.stroke(); });
      return c; },
    info: { cap: ['Streets, bus stops, chargers and where people live. No live feed is connected yet, so this is an example drawing.', 'Δρόμοι, στάσεις, φορτιστές και πού ζει ο κόσμος. Δεν έχει συνδεθεί ακόμη ζωντανή πηγή, άρα αυτό είναι σχέδιο-παράδειγμα.'] } },
  { id: 'heat', band: 'GROUND', c: '#ff9a6b', nolive: true, win: 'island', name: ['Ground heat', 'Θερμότητα εδάφους'], src: ['MODIS LST · Terra and Aqua', 'MODIS LST · Terra και Aqua'],
    height: ['GROUND SURFACE', 'ΕΠΙΦΑΝΕΙΑ ΕΔΑΦΟΥΣ'],
    make: () => raster((x, y, g) => { const t = Math.min(1, Math.max(0, .78 - g0.h[g] * .5 + (fbm(x / 40, y / 40, 3) - .5) * .4));
      const [r, gg, b] = ramp(t, [[0, 40, 60, 120], [.4, 120, 90, 110], [.7, 220, 130, 70], [1, 255, 215, 150]]); return [r, gg, b, 120]; }),
    info: { cap: ['How hot the ground is, as a satellite sees it. No satellite reading has arrived, so this is an example drawing.', 'Πόσο ζεστό είναι το έδαφος, όπως το βλέπει ένας δορυφόρος. Δεν έχει έρθει δορυφορική μέτρηση, άρα αυτό είναι σχέδιο-παράδειγμα.'] } },
  { id: 'veg', band: 'GROUND', c: '#8fd98a', nolive: true, win: 'island', name: ['Greenness', 'Πρασινάδα'], src: ['MODIS NDVI · every 16 days', 'MODIS NDVI · κάθε 16 ημέρες'],
    height: ['GROUND SURFACE', 'ΕΠΙΦΑΝΕΙΑ ΕΔΑΦΟΥΣ'],
    make: () => raster((x, y, g) => { const n = Math.min(1, Math.max(0, fbm(x / 28, y / 28, 4) * 1.4 - .18 + g0.h[g] * .3));
      const [r, gg, b] = ramp(n, [[0, 120, 104, 70], [.45, 118, 140, 72], [1, 46, 136, 62]]); return [r, gg, b, 115]; }),
    info: { cap: ['How green the land is, as a satellite sees it. No satellite reading has arrived, so this is an example drawing.', 'Πόσο πράσινη είναι η γη, όπως τη βλέπει ένας δορυφόρος. Δεν έχει έρθει δορυφορική μέτρηση, άρα αυτό είναι σχέδιο-παράδειγμα.'] } },
  { id: 'air', band: 'AIR', c: '#d9b3ff', additive: true, win: () => airF, name: ['Air quality', 'Ποιότητα αέρα'], src: ['Open-Meteo air-quality model · grid', 'Μοντέλο ποιότητας αέρα Open-Meteo · πλέγμα'],
    height: ['WHERE PEOPLE BREATHE', 'ΕΚΕΙ ΠΟΥ ΑΝΑΠΝΕΟΥΜΕ'], paint: airStep, beat: 3, feed: { vars: ['pm25', 'pm10', 'ozone'] },
    state: () => { if (!airF) return GONE(); const r = best('pm25', false); return modelState('openmeteo-air', airPts.length, r ? ageText(r.ageMin) : T('age not stated', 'η ηλικία δεν δηλώνεται')); },
    info: { scale: 'pm25',
      cap: ['Fine particles in the air (PM2.5), from the air-quality model. Between the model’s grid points the colour is filled in.', 'Λεπτά σωματίδια στον αέρα (PM2.5), από το μοντέλο ποιότητας αέρα. Ανάμεσα στα σημεία του πλέγματος το χρώμα συμπληρώνεται.'],
      move: ['More specks mean more fine particles there. The specks only shimmer: they do not show where the air is going.', 'Περισσότερες κουκκίδες σημαίνουν περισσότερα λεπτά σωματίδια εκεί. Οι κουκκίδες απλώς τρεμοπαίζουν: δεν δείχνουν προς τα πού πάει ο αέρας.'],
      rest: ['More specks mean more fine particles there.', 'Περισσότερες κουκκίδες σημαίνουν περισσότερα λεπτά σωματίδια εκεί.'],
      marks: [['Small square dots are the model’s grid points: the only places it gives a number.', 'Οι μικρές τετράγωνες κουκκίδες είναι τα σημεία του πλέγματος: μόνο εκεί δίνει αριθμό το μοντέλο.'], EDGE_MARK] } },
  { id: 'wind', band: 'AIR', c: '#59d7e8', additive: true, win: () => windF && windF.u, name: ['Wind at 10 m', 'Άνεμος στα 10 m'], src: ['Open-Meteo model grid · airport readings', 'Πλέγμα μοντέλου Open-Meteo · μετρήσεις αεροδρομίων'],
    height: ['10 M ABOVE GROUND', '10 M ΠΑΝΩ ΑΠΟ ΤΟ ΕΔΑΦΟΣ'], paint: windStep, beat: 1, feed: { vars: ['wind_speed'] },
    state: () => { if (!windF) return GONE(); const s = modelState('openmeteo-weather', grid.length, skyAge());
      if (airportWind.length) s.text += ' · ' + T('measured at ' + airportWind.length + ' airport(s): ', 'μετρημένος σε ' + airportWind.length + ' αεροδρόμιο/α: ') + srcName('metar-airports'); return s; },
    info: { scale: 'wind',
      cap: ['Which way and how fast the air moves 10 m above the ground, from the weather model’s grid.', 'Προς τα πού και πόσο γρήγορα κινείται ο αέρας 10 m πάνω από το έδαφος, από το πλέγμα του μοντέλου καιρού.'],
      move: ['The lines travel the way the wind blows. Twice the wind speed, twice as fast and brighter.', 'Οι γραμμές ταξιδεύουν προς τα εκεί που φυσά ο άνεμος. Διπλάσια ταχύτητα ανέμου, διπλάσια ταχύτητα και πιο φωτεινές.'],
      rest: ['Each arrow points the way the wind blows. A longer, brighter arrow is faster wind.', 'Κάθε βέλος δείχνει προς τα πού φυσά ο άνεμος. Πιο μακρύ και φωτεινό βέλος σημαίνει πιο γρήγορο άνεμο.'],
      marks: [['Amber arrows are the wind measured at the airports, with its speed.', 'Τα κεχριμπαρένια βέλη είναι ο άνεμος που μετρούν τα αεροδρόμια, με την ταχύτητά του.'], EDGE_MARK] } },
  { id: 'rain', band: 'AIR', c: '#7fb3ff', additive: true, win: () => gridF, name: ['Rain this hour', 'Βροχή αυτή την ώρα'], src: ['Open-Meteo model · 11 km grid', 'Μοντέλο Open-Meteo · πλέγμα 11 km'],
    height: ['CLOUD BASE', 'ΒΑΣΗ ΝΕΦΩΝ'], paint: rainStep, beat: 2,
    state: () => (rainKnown ? modelState('openmeteo-weather', grid.length, skyAge()) : GONE()),
    lines: () => (rainMm != null ? [[T('grid over Cyprus', 'πλέγμα πάνω από την Κύπρο'), fmt(rainMm) + ' mm · ' + T('model', 'μοντέλο'), 'openmeteo-weather']] : []),
    info: { scale: 'rain',
      cap: ['Where the weather model puts rain this hour: one square for each grid cell with rain, and its millimetres.', 'Πού βάζει βροχή το μοντέλο καιρού αυτή την ώρα: ένα τετράγωνο για κάθε κελί του πλέγματος με βροχή, και τα χιλιοστά του.'],
      move: ['Rings are drops landing, seen from above. They appear only inside a square with rain, and more rain makes more rings.', 'Τα δαχτυλίδια είναι σταγόνες που πέφτουν, όπως φαίνονται από ψηλά. Εμφανίζονται μόνο μέσα σε τετράγωνο με βροχή, και περισσότερη βροχή φτιάχνει περισσότερα.'],
      rest: ['Rings appear only inside a square with rain, and more rain means more rings.', 'Τα δαχτυλίδια εμφανίζονται μόνο μέσα σε τετράγωνο με βροχή, και περισσότερη βροχή σημαίνει περισσότερα.'],
      marks: [['No square means the model has no rain there. It is a model, not a rain gauge.', 'Χωρίς τετράγωνο, το μοντέλο δεν έχει βροχή εκεί. Είναι μοντέλο, όχι βροχόμετρο.'], EDGE_MARK] } },
  { id: 'haze', band: 'AIR', c: '#ffd7a8', nolive: true, win: 'island', name: ['Haze and aerosol column', 'Αιθαλομίχλη και αερολύματα'], src: ['AERONET sun photometers · CAMS', 'Ηλιακά φωτόμετρα AERONET · CAMS'],
    height: ['THE WHOLE AIR COLUMN', 'ΟΛΗ Η ΣΤΗΛΗ ΑΕΡΑ'],
    make: () => raster((x, y) => [255, 210, 160, 26 + fbm(x / 54 + 4, y / 54, 4) * 80], (x, y) => [255, 210, 160, 14 + fbm(x / 54 + 4, y / 54, 4) * 44]),
    info: { cap: ['Dust and haze in the whole column of air. No reading has arrived, so this is an example drawing.', 'Σκόνη και θολούρα σε όλη τη στήλη του αέρα. Δεν έχει έρθει μέτρηση, άρα αυτό είναι σχέδιο-παράδειγμα.'] } },
  { id: 'aircraft', band: 'AIR', c: '#f4fbff', name: ['Aeroplanes', 'Αεροπλάνα'], src: ['adsb.fi · volunteer receivers', 'adsb.fi · δέκτες εθελοντών'],
    height: ['THE SKY · 10,000 FT A STEP', 'Ο ΟΥΡΑΝΟΣ · 10.000 FT ΤΟ ΒΗΜΑ'], paint: aircraftPaint, load: loadAircraft, every: AC.every,
    state: () => { if (!planes) return none(T('Listening for aeroplanes…', 'Ακούμε για αεροπλάνα…'));
      if (!planesFresh()) return none(T('We could not get the positions just now. This is a problem with the connection to adsb.fi, not a sign that the sky is empty.', 'Δεν μπορέσαμε να πάρουμε τις θέσεις αυτή τη στιγμή. Είναι πρόβλημα στη σύνδεση με το adsb.fi, όχι ένδειξη ότι ο ουρανός είναι άδειος.'));
      const n = planes.pts.length, count = n === 1 ? T('1 aeroplane in range', '1 αεροπλάνο εντός εμβέλειας') : T(n + ' aeroplanes in range', n + ' αεροπλάνα εντός εμβέλειας'), age = ageText((Date.now() - planes.at) / 60000);
      return planes.mock ? { kind: 'demo', text: T('Demo data: these points are made-up examples for testing, not real aeroplanes. ', 'Δεδομένα επίδειξης: αυτά τα σημεία είναι φτιαχτά παραδείγματα για δοκιμή, όχι πραγματικά αεροπλάνα. ') + count + ' · ' + age }
        : { kind: 'measured', text: T('adsb.fi (open data from volunteer receivers, for personal and non-commercial use) · ', 'adsb.fi (ανοιχτά δεδομένα από δέκτες εθελοντών, για προσωπική και μη εμπορική χρήση) · ') + count + ' · ' + age }; },
    link: ['https://adsb.fi/', 'adsb.fi'],
    card: () => (!planes ? { b: '—', em: T('listening', 'ακούμε'), cls: 'year' } : !planesFresh() ? { b: '—', em: T('no positions now', 'χωρίς θέσεις τώρα'), cls: 'year' }
      : { b: String(planes.pts.length), em: planes.mock ? T('DEMO · not real', 'ΕΠΙΔΕΙΞΗ · όχι πραγματικά') : T('in range · ', 'εντός εμβέλειας · ') + ageText((Date.now() - planes.at) / 60000), cls: planes.mock ? 'year' : 'live' }),
    lines: () => (planesFresh() ? ['high', 'low', 'ground', 'unknown'].map((k) => [TT(AC_PHASE[k]), String(planes.pts.filter((p) => p.phase === k).length), planes.mock ? T('demo', 'επίδειξη') : 'adsb.fi']) : []),
    info: {
      cap: ['Where aeroplanes around the island are right now, as far as volunteer radio receivers can hear them. The picture renews every 20 seconds.', 'Πού βρίσκονται τώρα τα αεροπλάνα γύρω από το νησί, όσο μπορούν να τα ακούσουν οι ραδιοδέκτες εθελοντών. Η εικόνα ανανεώνεται κάθε 20 δευτερόλεπτα.'],
      move: ['Between two refreshes each arrow slides along its heading at its reported speed. That in-between movement is worked out from speed and direction, not observed.', 'Ανάμεσα σε δύο ανανεώσεις κάθε βέλος γλιστρά κατά την πορεία του με την ταχύτητα που ανέφερε. Αυτή η ενδιάμεση κίνηση υπολογίζεται από ταχύτητα και κατεύθυνση, δεν παρατηρείται.'],
      rest: ['Each arrow stands where the aeroplane was last heard and points the way it was moving.', 'Κάθε βέλος μένει εκεί όπου ακούστηκε τελευταία το αεροπλάνο και δείχνει προς τα πού κινούνταν.'],
      marks: () => [['Height: every 10,000 ft lifts an arrow one step above the sheet, up the thin line under it (the ruler at the corner of the sheet marks the steps). The dot on the sheet is where it was heard, with its height in feet.', 'Ύψος: κάθε 10.000 ft σηκώνουν το βέλος ένα βήμα πάνω από το φύλλο, πάνω στη λεπτή γραμμή από κάτω του (ο χάρακας στη γωνία του φύλλου δείχνει τα βήματα). Η κουκκίδα στο φύλλο είναι εκεί όπου ακούστηκε, με το ύψος του σε πόδια.'],
        ['Filled arrow: ' + AC_PHASE.high[0] + '. Hollow arrow: ' + AC_PHASE.low[0] + '. Square: ' + AC_PHASE.ground[0] + '. Ring: ' + AC_PHASE.unknown[0] + '. The words after "likely" are a guess from the height, not a fact.',
          'Γεμάτο βέλος: ' + AC_PHASE.high[1] + '. Κενό βέλος: ' + AC_PHASE.low[1] + '. Τετράγωνο: ' + AC_PHASE.ground[1] + '. Δαχτυλίδι: ' + AC_PHASE.unknown[1] + '. Οι λέξεις μετά το "μάλλον" είναι εικασία από το ύψος, όχι γεγονός.'],
        ['Aeroplanes send their position by radio. Volunteers with small receivers pick it up and share it through adsb.fi. So coverage has gaps, especially far out at sea and close to the ground. A missing aeroplane does not mean an empty sky.', 'Τα αεροπλάνα στέλνουν τη θέση τους με ραδιοκύματα. Εθελοντές με μικρούς δέκτες τη λαμβάνουν και τη μοιράζονται μέσω του adsb.fi. Γι’ αυτό η κάλυψη έχει κενά, ειδικά μακριά στη θάλασσα και κοντά στο έδαφος. Αν λείπει ένα αεροπλάνο, δεν σημαίνει ότι ο ουρανός είναι άδειος.'],
        ['The dashed circle is how far we ask. There are no flight names, places are rounded and nothing is saved.', 'Ο διακεκομμένος κύκλος δείχνει μέχρι πού ρωτάμε. Δεν υπάρχουν ονόματα πτήσεων, οι θέσεις είναι στρογγυλεμένες και τίποτα δεν αποθηκεύεται.']] } },
  { id: 'cloud', band: 'SPACE', c: '#e8f4ff', additive: true, win: () => cloudF, name: ['Clouds', 'Σύννεφα'], src: ['Open-Meteo weather model · grid', 'Μοντέλο καιρού Open-Meteo · πλέγμα'],
    height: ['CLOUD TOPS', 'ΚΟΡΥΦΕΣ ΝΕΦΩΝ'], paint: cloudPaint,
    state: () => (cloudF ? modelState('openmeteo-weather', grid.length, skyAge()) : GONE()),
    lines: () => (cloudPct != null ? [[T('grid over Cyprus', 'πλέγμα πάνω από την Κύπρο'), cloudPct + ' % · ' + T('model', 'μοντέλο'), 'openmeteo-weather']] : []),
    info: { scale: 'cloud',
      cap: ['How much of the sky is covered by cloud, from the weather model. Whiter means more cover.', 'Πόσο μέρος του ουρανού σκεπάζουν τα σύννεφα, από το μοντέλο καιρού. Πιο λευκό σημαίνει περισσότερη κάλυψη.'],
      never: ['Nothing moves here: the model says how much cloud there is, not which way it drifts.', 'Εδώ δεν κινείται τίποτα: το μοντέλο λέει πόσα σύννεφα υπάρχουν, όχι προς τα πού πάνε.'],
      marks: [['Small square dots are the model’s grid points.', 'Οι μικρές τετράγωνες κουκκίδες είναι τα σημεία του πλέγματος.'], EDGE_MARK] } },
  { id: 'sat', band: 'SPACE', c: '#9fe0f5', win: 'island', name: ['Satellite picture', 'Δορυφορική εικόνα'], src: ['NASA GIBS · pass 17:00Z', 'NASA GIBS · πέρασμα 17:00Z'],
    height: ['FROM ORBIT', 'ΑΠΟ ΤΡΟΧΙΑ'],
    card: () => (satReal ? { b: '1', em: T('real picture', 'πραγματική εικόνα'), cls: 'old' } : null),
    make: () => { const c = raster((x, y, g) => { const n = fbm(x / 18, y / 18, 5), veg = Math.min(1, Math.max(0, n * 1.5 - .25 + g0.h[g] * .25));
      return [128 - veg * 76, 116 + veg * 42, 78 - veg * 34, 215]; }); coastUnder(c, 'rgba(200,240,255,.5)'); return c; },
    state: () => (satReal ? { kind: 'measured', text: T('A real satellite picture is shown.', 'Φαίνεται πραγματική δορυφορική εικόνα.') }
      : none(T('No satellite picture is stored, so a drawn stand-in is shown.', 'Δεν υπάρχει αποθηκευμένη δορυφορική εικόνα, άρα φαίνεται ένα σχέδιο στη θέση της.'))),
    info: { cap: ['A picture of Cyprus taken from space on one pass of a satellite.', 'Μια εικόνα της Κύπρου από το διάστημα, από ένα πέρασμα δορυφόρου.'],
      never: ['Nothing moves here: it is one picture of one moment.', 'Εδώ δεν κινείται τίποτα: είναι μία εικόνα μιας στιγμής.'], always: true } },
];
const FEED = {}; LAYERS.forEach((l) => { if (l.feed) FEED[l.id] = l.feed; });
const layerOf = (id) => LAYERS.find((l) => l.id === id);
function sheetState(id) { const l = layerOf(id); return l.nolive ? NO_LIVE() : l.state ? l.state() : GONE(); }
window.__sheetState = (id) => sheetState(id).kind;

/* ---- scene ---- */
const canvas = document.getElementById('gl');
// Shown inside another page (the home page) the scene sits on that page's own background rather than on its own
// black, so the section matches everything around it. On its own page nothing changes.
const SITE_BG = new URLSearchParams(location.search).get('bg') === 'site';
if (SITE_BG) document.documentElement.classList.add('on-site');
// A machine with no graphics card draws the scene in software (SwiftShader, llvmpipe), where smoothing every edge and
// drawing at double density cost far more than they give. There the scene is drawn plain, at one pixel per pixel.
// ?aa=1 asks for the smooth picture anyway (for a screenshot), ?aa=0 for the plain one.
const SOFT_GL = (() => { try { const g = document.createElement('canvas').getContext('webgl'); if (!g) return false;
  const e = g.getExtension('WEBGL_debug_renderer_info'), name = String(g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER));
  const lose = g.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
  return /swiftshader|llvmpipe|softpipe|software/i.test(name); } catch (e) { return false; } })();
const PLAIN = Q.get('aa') === '0' || (SOFT_GL && Q.get('aa') !== '1');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile && !PLAIN, powerPreference: 'high-performance', alpha: SITE_BG });
renderer.setPixelRatio(PLAIN ? 1 : Math.min(mobile ? 1.5 : 2, devicePixelRatio || 1));
const scene = new THREE.Scene(); scene.background = SITE_BG ? null : new THREE.Color('#02050a');
const camera = new THREE.PerspectiveCamera(38, 2, 1, 60000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .06;
controls.minDistance = 220; controls.maxDistance = 16000;
scene.add(new THREE.AmbientLight('#9ec4e6', 1));
const key = new THREE.DirectionalLight('#eef6ff', 1.5); key.position.set(-500, 900, 500); scene.add(key);
const rim = new THREE.DirectionalLight('#4CCBEA', .55); rim.position.set(600, 240, -700); scene.add(rim);

// The sheet is the region. Cyprus is about as wide in the scene as it was when the sheet was the island alone, so the
// pins, masts and labels on it keep their size.
const SW = 2400, SH = SW * RH / RW, GAPY = 86;
const TOP = (LAYERS.length - 1) * GAPY, MID = TOP / 2;
const p3 = (lng, lat, y) => { const [u, v] = uv(lng, lat); return new THREE.Vector3((u - .5) * SW, y, (v - .5) * SH); };
const ISLE = (() => { const a = p3(ISLAND_BOX.lng0, ISLAND_BOX.lat1, 0), b = p3(ISLAND_BOX.lng1, ISLAND_BOX.lat0, 0); return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: b.x - a.x, d: b.z - a.z }; })();
{
  const n = mobile ? 700 : 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const r = 16000 + Math.random() * 8000, a = Math.random() * 6.283, b = (Math.random() - .5) * 2.2;
    pos[i * 3] = Math.cos(a) * Math.cos(b) * r; pos[i * 3 + 1] = Math.sin(b) * r * .6 + 600; pos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * r; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#bcd6f2', size: 18, sizeAttenuation: true, transparent: true, opacity: .75 })));
}
function label(text, sub, colour, size) {
  const c = document.createElement('canvas'); c.width = 620; c.height = 150;
  const x = c.getContext('2d');
  x.font = '800 40px ui-monospace, Menlo, monospace'; x.fillStyle = colour; x.textBaseline = 'top';
  x.fillText(text.toUpperCase(), 10, 14);
  x.font = '600 27px ui-monospace, Menlo, monospace'; x.fillStyle = 'rgba(176,200,225,.72)';
  x.fillText(sub.toUpperCase(), 10, 72);
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(size * 620 / 150, size, 1); s.center.set(0, .5);
  return s;
}
const SHEET_LABEL = mobile ? 110 : 82;
const CPU2D = Q.get('gpu2d') === '1' ? undefined : { willReadFrequently: true };
// A sheet's picture covers only the part of the region where it can have anything to show (its "window"): the whole
// region for the sea, the floors and the sky, the model's grid for the weather, the island for a drawing of the island.
// Outside its window a sheet is not there at all, so nothing can be painted where there is no data, and the scene has
// far less empty glass to draw. The thin frame of every sheet still shows the whole region.
const ISLAND_WIN = { x0: IX0 - IW * .14, y0: IY0 - IH * .22, w: IW * 1.28, h: IH * 1.44 };
const winOf = (r) => { if (!r) return { x0: 0, y0: 0, w: LW, h: LH }; const x0 = Math.max(0, Math.floor(r.x0)), y0 = Math.max(0, Math.floor(r.y0));
  return { x0, y0, w: Math.max(8, Math.min(LW, Math.ceil(r.x0 + r.w)) - x0), h: Math.max(8, Math.min(LH, Math.ceil(r.y0 + r.h)) - y0) }; };
const winGeo = (w) => new THREE.PlaneGeometry(w.w / LW * SW, w.h / LH * SH);
const winPlace = (mesh, w, y) => mesh.position.set(((w.x0 + w.w / 2) / LW - .5) * SW, y, ((w.y0 + w.h / 2) / LH - .5) * SH);
function setWin(s, rect) {
  const w = winOf(rect), o = s.win;
  if (o && o.x0 === w.x0 && o.y0 === w.y0 && o.w === w.w && o.h === w.h) return;
  s.win = w;
  if (s.layer.ctx) { s.layer.ctx.canvas.width = w.w; s.layer.ctx.canvas.height = w.h; }
  s.mesh.geometry.dispose(); s.mesh.geometry = winGeo(w); winPlace(s.mesh, w, s.y);
  s.tex.dispose(); s.tex.needsUpdate = true; touch(s.layer.id);       // a picture of a new size needs a new texture
}
// the sheets a model feeds are as large as that model's grid, plus the width of the frame drawn around it
// A sheet that is being read on its own gets the whole region back, so the coasts and the names around it can be drawn.
function fitWindows() { sheets.forEach((s) => { if (typeof s.layer.win !== 'function') return;
  if (soloId === s.layer.id) { setWin(s, null); return; }
  const f = s.layer.win();
  setWin(s, f ? { x0: f.x0 - 4, y0: f.y0 - 4, w: f.w + 8, h: f.h + 8 } : ISLAND_WIN); }); }
const sheets = [], sheetOf = {};
LAYERS.forEach((layer, i) => {
  const y = i * GAPY, group = new THREE.Group(); scene.add(group);
  const win = winOf(layer.win ? ISLAND_WIN : null);
  let made;
  if (layer.paint) { made = document.createElement('canvas'); made.width = win.w; made.height = win.h; layer.ctx = made.getContext('2d', CPU2D); need[layer.id] = true; }
  else { const whole = layer.make(); if (layer.nolive) stampDrawn(whole, layer.c);
    made = document.createElement('canvas'); made.width = win.w; made.height = win.h; made.getContext('2d').drawImage(whole, -win.x0, -win.y0); }
  const tex = new THREE.CanvasTexture(made); tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
  const mesh = new THREE.Mesh(winGeo(win), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: !!layer.solid,
    opacity: layer.solid ? 1 : layer.additive ? .72 : .8,
    blending: layer.additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  mesh.rotation.x = -Math.PI / 2; winPlace(mesh, win, y); group.add(mesh);
  const pts = [[-SW / 2, -SH / 2], [SW / 2, -SH / 2], [SW / 2, SH / 2], [-SW / 2, SH / 2], [-SW / 2, -SH / 2]].map(([a, b]) => new THREE.Vector3(a, y, b));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: layer.c, transparent: true, opacity: .3 })));
  const lab = label(TT(layer.name), TT(layer.src), layer.c, SHEET_LABEL);
  lab.position.set(-SW / 2 - 60, y + 4, SH / 2 + 60); group.add(lab);
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-SW / 2, y, SH / 2), new THREE.Vector3(-SW / 2 - 62, y, SH / 2 + 62)]),
    new THREE.LineBasicMaterial({ color: layer.c, transparent: true, opacity: .45 })));
  lab.material.transparent = true;
  const s = { layer, mesh, tex, y, group, lab, win, on: true };
  sheets.push(s); sheetOf[layer.id] = s;
});
const yOf = (id) => sheetOf[id].y;
const ISLAND_Y = yOf('island');
// the line of small print under a sheet's name in the scene: its source, or what it is showing now
function setSheetSub(s, sub) { const next = label(TT(s.layer.name), sub, s.layer.c, SHEET_LABEL), old = s.lab.material.map;
  s.lab.material.map = next.material.map; s.lab.material.needsUpdate = true; if (old) old.dispose(); next.material.dispose(); }

/* ---- where each layer comes from ---- */
const beams = [];
function beam(from, to, colour, tag, city) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: .35 })); scene.add(line);
  const dots = [];
  for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), new THREE.MeshBasicMaterial({ color: colour }));
    scene.add(d); dots.push({ mesh: d, t: i / 3 }); }
  const b = { from, to, dots, line, tag: tag || null, city: city || null }; beams.push(b); return b;
}
(I.stations || []).forEach((st, i) => { const lng = st.lng, lat = st.lat;
  const p = p3(lng, lat, ISLAND_Y);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 26, 8),
    new THREE.MeshStandardMaterial({ color: '#9fd4ea', emissive: '#2a6b84', metalness: .7, roughness: .4 }));
  mast.position.set(p.x, ISLAND_Y + 13, p.z); scene.add(mast);
  const cup = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#d9f0ff', emissive: '#59d7e8', emissiveIntensity: .7 }));
  cup.position.set(p.x, ISLAND_Y + 28, p.z); scene.add(cup);
  beam(new THREE.Vector3(p.x, ISLAND_Y + 28, p.z), new THREE.Vector3(p.x, yOf(i < 3 ? 'wind' : 'air'), p.z), i < 3 ? '#59d7e8' : '#d9b3ff', 'stations');
});
I.schools.forEach((sc) => {
  const p = p3(sc.lng, sc.lat, ISLAND_Y);
  const pin = new THREE.Mesh(new THREE.ConeGeometry(7, 22, 12),
    new THREE.MeshStandardMaterial({ color: '#F7C46B', emissive: '#7a4c10', emissiveIntensity: .8, metalness: .5, roughness: .3 }));
  pin.position.set(p.x, ISLAND_Y + 11, p.z); scene.add(pin);
  const ring = new THREE.Mesh(new THREE.RingGeometry(14, 19, 28), new THREE.MeshBasicMaterial({ color: '#F7C46B', transparent: true, opacity: .35, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, ISLAND_Y + 1.5, p.z); scene.add(ring);
  beam(new THREE.Vector3(p.x, ISLAND_Y + 22, p.z), new THREE.Vector3(p.x, TOP, p.z), '#F7C46B', 'own', sc.id);
});
function sourceBox(pos, colour, text, sub, toY, tag) {
  const group = new THREE.Group(); scene.add(group);
  const geo = new THREE.BoxGeometry(56, 56, 56);
  const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#16293f', emissive: colour, emissiveIntensity: .25, metalness: .6, roughness: .35 }));
  b.position.copy(pos); group.add(b);
  const w = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: .8 }));
  w.position.copy(pos); group.add(w);
  const lab = label(text, sub, colour, mobile ? 76 : 54); lab.position.set(pos.x + 44, pos.y + 4, pos.z); group.add(lab);
  const bm = beam(pos.clone(), new THREE.Vector3(pos.x, toY, pos.z), colour, tag || null);
  return { group, show: (on) => { group.visible = on; bm.line.visible = on; bm.hidden = !on; } };
}
sourceBox(new THREE.Vector3(-SW * .6, yOf('rain') + 1.4 * GAPY, -SH * .3), '#7fb3ff', 'Open-Meteo', T('MODEL · 0.25° GRID', 'ΜΟΝΤΕΛΟ · ΠΛΕΓΜΑ 0,25°'), yOf('rain'), 'model');
sourceBox(new THREE.Vector3(SW * .58, yOf('city'), SH * .34), '#C4B8FF', 'CYSTAT · GTFS', T('PUBLISHED FILES', 'ΔΗΜΟΣΙΕΥΜΕΝΑ ΑΡΧΕΙΑ'), yOf('city'));
// The seabed's source is named in the scene only once its file has really been loaded.
const seabedBox = sourceBox(new THREE.Vector3(SW * .58, yOf('seabed'), -SH * .3), '#2f7fb8', 'EMODnet', T('BATHYMETRY · PUBLISHED GRID', 'ΒΑΘΥΜΕΤΡΙΑ · ΔΗΜΟΣΙΕΥΜΕΝΟ ΠΛΕΓΜΑ'), yOf('seabed'));
seabedBox.show(false);
sourceBox(new THREE.Vector3(SW * .58, yOf('ships'), SH * .1), '#ffb86b', 'Eurostat', T('PORT STATISTICS · BY QUARTER', 'ΣΤΑΤΙΣΤΙΚΑ ΛΙΜΑΝΙΩΝ · ΑΝΑ ΤΡΙΜΗΝΟ'), yOf('ships'));
sourceBox(new THREE.Vector3(-SW * .6, yOf('water'), SH * .36), '#5bc8e0', T('WDD gauges', 'Μετρητές ΤΑΥ'), T('RESERVOIRS · REACHES', 'ΦΡΑΓΜΑΤΑ · ΤΜΗΜΑΤΑ'), yOf('water'));
sourceBox(new THREE.Vector3(-SW * .6, yOf('aircraft') + .5 * GAPY, SH * .1), '#f4fbff', 'adsb.fi', T('VOLUNTEER RECEIVERS · 20 S', 'ΔΕΚΤΕΣ ΕΘΕΛΟΝΤΩΝ · 20 S'), yOf('aircraft'), 'adsb');

/* ---- aeroplanes in the scene: an arrow lifted by its height, on a thin line down to the sheet ---- */
const planeGroup = new THREE.Group(); sheetOf.aircraft.group.add(planeGroup);                               // hidden and shown with their sheet
const arrowShape = (() => { const s = new THREE.Shape(); s.moveTo(0, 32); s.lineTo(21, -24); s.lineTo(0, -13); s.lineTo(-21, -24); s.closePath(); return s; })();
const arrowFill = new THREE.ShapeGeometry(arrowShape), arrowEdge = new THREE.BufferGeometry().setFromPoints(arrowShape.getPoints());
const planeObjs = [];
const planeLift = (p) => (p.altFt != null && !p.onGround ? Math.max(0, p.altFt) / AC.ftStep * AC.yStep : 0);
function buildPlanes() {
  while (planeGroup.children.length) { const o = planeGroup.children.pop(); o.traverse((n) => { if (n.geometry && n.geometry !== arrowFill && n.geometry !== arrowEdge) n.geometry.dispose(); if (n.material) n.material.dispose(); }); }
  planeObjs.length = 0;
  if (!planesFresh()) return;
  const y0 = yOf('aircraft');
  planes.pts.forEach((p) => {
    const g = new THREE.Group(), lift = planeLift(p), col = AC_COL[p.phase], at = p3(p.lng, p.lat, y0);
    const flat = (o) => { o.rotation.x = -Math.PI / 2; return o; };
    if (p.phase === 'ground') g.add(flat(new THREE.Mesh(new THREE.PlaneGeometry(15, 15), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }))));
    else if (p.phase === 'unknown') g.add(flat(new THREE.Mesh(new THREE.RingGeometry(7, 10, 24), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }))));
    else {
      const head = new THREE.Group(); head.position.y = lift;
      if (p.track == null) head.add(new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), new THREE.MeshBasicMaterial({ color: col })));   // no direction reported: a dot, not an arrow that would point somewhere
      else { head.rotation.y = -p.track * Math.PI / 180;               // a track is degrees clockwise from north; north is away from the viewer of the sheet (-z)
        head.add(flat(p.phase === 'high' ? new THREE.Mesh(arrowFill, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }))
          : new THREE.LineLoop(arrowEdge, new THREE.LineBasicMaterial({ color: col })))); }
      g.add(head);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, lift, 0)]), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: .5 })));
      const steps = []; for (let k = 1; k * AC.yStep <= lift + .01; k++) steps.push(new THREE.Vector3(0, k * AC.yStep, 0));   // one bead for every full 10,000 ft
      if (steps.length) g.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(steps), new THREE.PointsMaterial({ color: col, size: 5, sizeAttenuation: false })));
    }
    g.position.set(at.x, y0 + 1.5, at.z); planeGroup.add(g);
    // only an aeroplane in the air with both a speed and a heading can be moved along between refreshes
    const moves = !p.onGround && p.gs != null && p.gs > 0 && p.track != null && (p.phase === 'high' || p.phase === 'low');
    planeObjs.push({ p, g, moves, lat: p.lat, lng: p.lng, lift });
  });
}
// Between refreshes: where each arrow would be if it kept its heading and speed. It is arithmetic, and the key says so.
function stepPlanes(anim) {
  if (!planeObjs.length) return;
  if (!planesFresh()) { buildPlanes(); touch('aircraft'); return; }   // too old to call live: the arrows go, and the sheet says why
  const dt = anim ? Math.min(AC.driftMaxS, (Date.now() - planes.at) / 1000) : 0, y0 = yOf('aircraft');
  planeObjs.forEach((o) => { if (!o.moves) return;
    const nm = o.p.gs * dt / 3600, tr = o.p.track * Math.PI / 180;     // knots are nautical miles an hour; a nautical mile is a minute of latitude
    o.lat = o.p.lat + nm * Math.cos(tr) / 60; o.lng = o.p.lng + nm * Math.sin(tr) / (60 * Math.cos(o.p.lat * Math.PI / 180));
    const at = p3(o.lng, o.lat, y0); o.g.position.x = at.x; o.g.position.z = at.z; });
}
{ // the ruler of heights at the corner of the aeroplanes' sheet: one tick every 10,000 ft
  const y0 = yOf('aircraft'), rx = SW / 2, rz = SH / 2, g = sheetOf.aircraft.group;
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(rx, y0, rz), new THREE.Vector3(rx, y0 + 4 * AC.yStep, rz)]), new THREE.LineBasicMaterial({ color: '#f4fbff', transparent: true, opacity: .6 })));
  for (let k = 1; k <= 4; k++) { const y = y0 + k * AC.yStep;
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(rx - 30, y, rz), new THREE.Vector3(rx, y, rz)]), new THREE.LineBasicMaterial({ color: '#f4fbff', transparent: true, opacity: .6 })));
    const lab = label(nf(k * AC.ftStep) + ' ft', '', '#f4fbff', mobile ? 40 : 30); lab.center.set(1, .72); lab.position.set(rx - 36, y, rz); g.add(lab); }
}
window.__aircraft = () => ({ n: planeObjs.length, demo: !!(planes && planes.mock), fresh: planesFresh(), sheetY: yOf('aircraft'), yPerFt: AC.yStep / AC.ftStep,
  pts: planeObjs.map((o) => ({ id: o.p.id, phase: o.p.phase, altFt: o.p.altFt, gs: o.p.gs, track: o.p.track, lat0: o.p.lat, lng0: o.p.lng, lat: o.lat, lng: o.lng, moves: o.moves,
    y: o.g.position.y + o.lift, heading: o.g.children[0] && o.g.children[0].rotation ? -o.g.children[0].rotation.y * 180 / Math.PI : null })) });

/* ---- satellites ---- */
function satellite(scale) {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#d9a441', metalness: .95, roughness: .28, emissive: '#2a1c07', emissiveIntensity: .5 });
  const white = new THREE.MeshStandardMaterial({ color: '#e8eef6', metalness: .5, roughness: .4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1b2a3c', metalness: .8, roughness: .35 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(34, 26, 26), gold));
  const hat = new THREE.Mesh(new THREE.BoxGeometry(36, 8, 28), dark); hat.position.y = 15; g.add(hat);
  const panelGeo = new THREE.BoxGeometry(62, 1.6, 26);
  const pm = new THREE.MeshStandardMaterial({ color: '#19406e', metalness: .85, roughness: .22, emissive: '#071a30', emissiveIntensity: .6 });
  [-1, 1].forEach((s) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 16, 8), white);
    arm.rotation.z = Math.PI / 2; arm.position.x = s * 25; g.add(arm);
    const p = new THREE.Mesh(panelGeo, pm); p.position.x = s * 64; g.add(p);
    const grid2 = new THREE.LineSegments(new THREE.EdgesGeometry(panelGeo), new THREE.LineBasicMaterial({ color: '#6fb6e8', transparent: true, opacity: .55 }));
    grid2.position.x = s * 64; g.add(grid2);
    for (let k = -2; k <= 2; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 26), new THREE.MeshBasicMaterial({ color: '#4d93c9' }));
      rib.position.set(s * 64 + k * 12, 1.1, 0); g.add(rib); }
  });
  const dish = new THREE.Mesh(new THREE.SphereGeometry(13, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshStandardMaterial({ color: '#f1f6fb', metalness: .6, roughness: .3, side: THREE.DoubleSide }));
  dish.rotation.x = Math.PI; dish.position.y = -20; g.add(dish);
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 12, 8), white); feed.position.y = -14; g.add(feed);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, 40, 6), white); mast.position.y = 30; g.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff6b5e' }));
  beacon.position.y = 50; g.add(beacon); g.userData.beacon = beacon;
  g.scale.setScalar(scale); return g;
}
const ORBIT = { rx: SW * .5, rz: SH * .6, y: TOP + 300 };
const polar = satellite(2.8); scene.add(polar);
const geo = satellite(2.1); scene.add(geo); geo.position.set(SW * .62, TOP + 620, -SH * .62);
const geoLabel = label('Meteosat', T('GEOSTATIONARY · 15 MIN', 'ΓΕΩΣΤΑΤΙΚΟΣ · 15 ΛΕΠΤΑ'), '#e8f4ff', mobile ? 76 : 54);
geoLabel.position.copy(geo.position.clone().add(new THREE.Vector3(120, 0, 0))); scene.add(geoLabel);
const polarLabel = label(T('Polar satellite', 'Πολικός δορυφόρος'), T('NASA GIBS · MODIS · PASS 17:00Z', 'NASA GIBS · MODIS · ΠΕΡΑΣΜΑ 17:00Z'), '#9fe0f5', mobile ? 76 : 54); scene.add(polarLabel);
const cone = new THREE.Mesh(new THREE.ConeGeometry(150, 300, 32, 1, true),
  new THREE.MeshBasicMaterial({ color: '#9fe0f5', transparent: true, opacity: .085, side: THREE.DoubleSide, depthWrite: false })); scene.add(cone);
const geoCone = new THREE.Mesh(new THREE.ConeGeometry(190, 620, 32, 1, true),
  new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: .035, side: THREE.DoubleSide, depthWrite: false })); scene.add(geoCone);
{
  const pts = Array.from({ length: 200 }, (_, i) => { const a = i / 199 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * ORBIT.rx, ORBIT.y + Math.sin(a * 2) * 40, Math.sin(a) * ORBIT.rz); });
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineDashedMaterial({ color: '#8FE3F7', transparent: true, opacity: .3, dashSize: 30, gapSize: 40 }));
  l.computeLineDistances(); scene.add(l);
}

// the tests read this: what each painted sheet is standing on right now
window.__sheets = () => ({ still: still(), tour, wind: !!windF, rainKnown, rainCells: rainCells.length, cloud: !!cloudF, air: !!airF,
  specks: specks.length, sea: seaPts.length, stations: stationPts.length, beamsLive: beams.filter((b) => b.live).length,
  waves: seaPts.filter((p) => p.dir != null && p.period != null).length, seabed: seabed ? { cells: seabed.cells, deepest: seabed.deepest, testOnly: seabed.meta.testOnly } : null,
  ships: ships ? ships.ports.map((p) => ({ code: p.code, xy: pxOf(p.lng, p.lat), arrivals: p.arrivals, arrQ: p.arrQ, perDay: p.perDay, pulseS: p.pulseS, cargo: p.cargo, cargoQ: p.cargoQ, ended: p.ended, ring: p.arrivals != null ? shipRing(p) : null })) : null,
  layers: LAYERS.map((l) => l.id), terrain: terrain ? terrain.kind : 'none' });
// one painted sheet at one place: how opaque it is there, and its colour (the tests use it to see that a sheet is empty where it has no data)
window.__inkAt = (id, lng, lat, r) => { const l = layerOf(id); if (!l || !l.ctx) return null; const [x, y] = pxOf(lng, lat), k = r || 3, w = sheetOf[id].win;
  const cx = Math.round(x) - w.x0, cy = Math.round(y) - w.y0; if (cx + k < 0 || cy + k < 0 || cx - k >= w.w || cy - k >= w.h) return { alpha: 0, rgb: [0, 0, 0], outside: true };   // beyond the sheet's window there is no picture at all
  const d = l.ctx.getImageData(cx - k, cy - k, 2 * k + 1, 2 * k + 1).data; let a = 0, rr = 0, gg = 0, bb = 0;
  for (let i = 0; i < d.length; i += 4) { a = Math.max(a, d[i + 3]); rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; } const n = d.length / 4;
  return { alpha: a, rgb: [Math.round(rr / n), Math.round(gg / n), Math.round(bb / n)] }; };
// a sum over one whole sheet that changes whenever its picture does (for the reduced-motion and "nothing moves" tests)
window.__sheetInk = (id) => { const l = layerOf(id); if (!l || !l.ctx) return null; const d = l.ctx.getImageData(0, 0, l.ctx.canvas.width, l.ctx.canvas.height).data; let lit = 0, sum = 0;
  for (let i = 3; i < d.length; i += 4) { if (d[i] > 40) lit++; sum = (sum + d[i] * (i % 251) + d[i - 1]) % 1000000007; } return { lit, sum }; };
window.__windInk = () => window.__sheetInk('wind');
// the wind the sheet draws at one place, as a bearing it comes FROM and a speed, so a test can hold it against the feed; null outside the grid
window.__windAt = (lng, lat) => { if (!windF) return null; const [x, y] = pxOf(lng, lat); if (!inF(windF.u, x, y)) return null; const u = sampleF(windF.u, x, y), v = sampleF(windF.v, x, y);
  return { from: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360, ms: Math.hypot(u, v) }; };

/* ---- the rail: every sheet, in bands that fold ---- */
const rail = document.getElementById('rail');
const BAND = { SPACE: ['SPACE', 'ΔΙΑΣΤΗΜΑ'], AIR: ['AIR', 'ΑΕΡΑΣ'], GROUND: ['GROUND', 'ΕΔΑΦΟΣ'], CITY: ['CITY', 'ΠΟΛΗ'], WATER: ['WATER', 'ΝΕΡΟ'] };
// A sheet is switched on or off in one place, so a sheet that fetches for itself can start again the moment it is shown.
function setOn(s, on) { s.on = on; s.group.visible = on; if (s.btn) s.btn.setAttribute('aria-pressed', String(on)); if (on) wake(s.layer); }
Object.keys(BAND).forEach((b) => {
  const list = LAYERS.filter((x) => x.band === b).slice().reverse(); if (!list.length) return;
  const head = document.createElement('button'); head.type = 'button'; head.className = 'band'; head.dataset.fold = b;
  const open0 = innerWidth > 860;                                    // on a narrow screen the groups start folded, so the scene is not hidden behind the list
  head.setAttribute('aria-expanded', String(open0)); head.setAttribute('aria-controls', 'band-' + b);
  head.title = T('Fold or unfold this group of layers', 'Δίπλωσε ή ξεδίπλωσε αυτή την ομάδα στρωμάτων');
  const nm = document.createElement('span'); nm.textContent = TT(BAND[b]);
  const n = document.createElement('em'); n.textContent = String(list.length);
  const chev = document.createElement('i'); chev.setAttribute('aria-hidden', 'true');
  head.append(nm, n, chev);
  const body = document.createElement('div'); body.className = 'band-body'; body.id = 'band-' + b; body.hidden = !open0;
  head.addEventListener('click', () => { const open = head.getAttribute('aria-expanded') !== 'true'; head.setAttribute('aria-expanded', String(open)); body.hidden = !open; });
  rail.append(head, body);
  list.forEach((x) => {
    const s = sheetOf[x.id];
    const btn = document.createElement('button');
    btn.className = 'lay'; btn.type = 'button'; btn.style.setProperty('--c', x.c); btn.setAttribute('aria-pressed', 'true');
    const keyEl = document.createElement('span'); keyEl.className = 'key';
    const name = document.createElement('span'); name.className = 'nm'; name.append(document.createElement('b'), document.createElement('small'));
    const val = document.createElement('span'); val.className = 'val';
    const st = document.createElement('span'); st.className = 'st year';
    const go = document.createElement('i'); go.className = 'go'; go.setAttribute('aria-hidden', 'true');
    btn.append(keyEl, name, val, st, go);
    btn.querySelector('b').textContent = TT(x.name);
    btn.querySelector('small').textContent = TT(x.src);
    btn.addEventListener('click', () => { setOn(s, !s.on); drawTwins(); });
    const row = document.createElement('div'); row.className = 'row'; row.style.setProperty('--c', x.c); row.dataset.id = x.id;
    const rowHead = document.createElement('div'); rowHead.className = 'head';
    const solo = document.createElement('button');
    solo.type = 'button'; solo.className = 'solo'; solo.textContent = '◎'; solo.setAttribute('aria-pressed', 'false');
    solo.setAttribute('aria-label', T('Show only this sheet, with what it holds', 'Δείξε μόνο αυτό το φύλλο, με ό,τι περιέχει'));
    solo.title = solo.getAttribute('aria-label');
    solo.addEventListener('click', (ev) => { ev.stopPropagation(); setSolo(x.id); });
    const cities = document.createElement('div'); cities.className = 'cities'; cities.hidden = true;
    s.btn = btn; s.solo = solo; s.cities = cities;
    rowHead.append(btn, solo); row.append(rowHead, cities); body.appendChild(row);
  });
});
const cityName = (c) => { const n = (live.cities[c] || {}).name; return Array.isArray(n) ? T(n[0], n[1]) : (n || c); };
function cityLines(id) {
  const out = [], layer = layerOf(id), feed = FEED[id];
  if (feed && live && live.cities) {
    Object.keys(live.cities).forEach((c) => {
      let r = null;
      for (const name of feed.vars) { r = pick(c, name, feed.own) || pick(c, name, false); if (r) break; }
      out.push([cityName(c),
        r ? fmt(r.value) + ' ' + (r.unit || '') + ' · ' + ageText(r.ageMin) : T('nothing arrived', 'δεν ήρθε τίποτα'),
        r ? r.source : '']);
    });
    return out;
  }
  if (layer.lines) out.push(...layer.lines());
  if (!out.length) out.push(layer.nolive || id === 'sat' ? [T('This sheet is drawn', 'Αυτό το φύλλο είναι σχεδιασμένο'), T('not measured yet', 'όχι ακόμη μετρημένο'), '']
    : [T('Nothing to list', 'Τίποτα για λίστα'), T('nothing arrived', 'δεν ήρθε τίποτα'), '']);
  return out;
}
function paintCities(s) {
  if (!s.cities) return;
  s.cities.replaceChildren(...cityLines(s.layer.id).map(([a, b, src]) => {
    const d = document.createElement('div');
    const x1 = document.createElement('span'); x1.textContent = a;
    const x2 = document.createElement('b'); x2.textContent = b + (src ? ' · ' + src : '');
    d.append(x1, x2); return d;
  }));
}
function setSolo(id) {
  soloId = soloId === id ? null : id;
  allBtn.setAttribute('aria-pressed', String(soloId == null));
  if (onlyBtn) onlyBtn.setAttribute('aria-pressed', 'false');
  tools.querySelectorAll('[data-band]').forEach((o) => o.setAttribute('aria-pressed', 'false'));
  sheets.forEach((s) => {
    setOn(s, soloId == null ? true : s.layer.id === soloId);
    if (s.solo) s.solo.setAttribute('aria-pressed', String(s.layer.id === soloId));
    if (s.cities) { const show = s.layer.id === soloId; s.cities.hidden = !show; if (show) paintCities(s); }
  });
  fitWindows(); drawTwins(); touchAll();                             // the sheet on its own gets the whole region, and the names of the places around it
  document.body.classList.toggle('solo-on', soloId != null);
  paintLegend();
  const pose = poseFor(viewMode); flyTo(pose[0], pose[1]);
}
/* ---- the key: for one sheet at a time, what it shows, what the colours and the motion mean, and where it comes from ---- */
const NO_MOVE = () => T('Nothing moves here, because there is no reading to show.', 'Εδώ δεν κινείται τίποτα, γιατί δεν υπάρχει μέτρηση να δείξει.');
const STATE_WORD = { measured: ['MEASURED', 'ΜΕΤΡΗΜΕΝΟ'], model: ['MODEL, NOT A MEASUREMENT', 'ΜΟΝΤΕΛΟ, ΟΧΙ ΜΕΤΡΗΣΗ'], published: ['PUBLISHED FIGURES, NOT LIVE', 'ΔΗΜΟΣΙΕΥΜΕΝΑ ΣΤΟΙΧΕΙΑ, ΟΧΙ ΖΩΝΤΑΝΑ'],
  demo: ['DEMO DATA, NOT REAL', 'ΔΕΔΟΜΕΝΑ ΕΠΙΔΕΙΞΗΣ, ΟΧΙ ΠΡΑΓΜΑΤΙΚΑ'], none: ['NO LIVE DATA', 'ΧΩΡΙΣ ΖΩΝΤΑΝΑ ΔΕΔΟΜΕΝΑ'] };
const legend = document.getElementById('legend');
const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const say = (v) => TT(typeof v === 'function' ? v() : v);
function stepSolo(dir) {
  const i = LAYERS.findIndex((l) => l.id === soloId);
  const next = LAYERS[(i + dir + LAYERS.length) % LAYERS.length].id;
  setSolo(next);
  const b = legend.querySelector(dir > 0 ? '.lg-next' : '.lg-prev'); if (b) b.focus();       // the key is rebuilt: keep the keyboard where it was
}
function paintLegend() {
  if (!legend) return;
  const out = [];
  if (soloId == null) {
    legend.style.removeProperty('--c');
    out.push(mk('h2', null, T('HOW TO READ THE STACK', 'ΠΩΣ ΔΙΑΒΑΖΕΤΑΙ Η ΣΤΟΙΒΑ')));
    const go = mk('button', 'lg-go', T('Show the layers one by one', 'Δείξε τα στρώματα ένα ένα')); go.type = 'button';
    go.addEventListener('click', () => { setSolo(LAYERS[0].id); const b = legend.querySelector('.lg-next'); if (b) b.focus(); });
    out.push(go);
    out.push(mk('p', 'lg-gen', T('Each layer then gets a key here: what it shows, its units, where the numbers come from and what the motion means.', 'Κάθε στρώμα παίρνει τότε εδώ το υπόμνημά του: τι δείχνει, τις μονάδες του, από πού έρχονται οι αριθμοί και τι σημαίνει η κίνηση.')));
    out.push(mk('p', 'lg-gen', T('The sheets cover the sea and the coasts around Cyprus. A sheet is empty wherever its source has no data: empty does not mean zero.', 'Τα φύλλα καλύπτουν τη θάλασσα και τις ακτές γύρω από την Κύπρο. Ένα φύλλο είναι άδειο όπου η πηγή του δεν έχει δεδομένα: άδειο δεν σημαίνει μηδέν.')));
    out.push(mk('p', 'lg-gen', T('Dots climb a beam only while its source reported in the last 90 minutes. A bare line is a quiet source.', 'Οι κουκκίδες ανεβαίνουν μια δέσμη μόνο όσο η πηγή της έστειλε κάτι τα τελευταία 90 λεπτά. Σκέτη γραμμή σημαίνει σιωπηλή πηγή.')));
    out.push(mk('p', 'lg-gen', T('A striped sheet with the words "no live data" is an example drawing, not a measurement.', 'Ένα ριγέ φύλλο με τις λέξεις "χωρίς ζωντανά δεδομένα" είναι σχέδιο-παράδειγμα, όχι μέτρηση.')));
    if (terrain && terrain.kind === 'demo') out.push(mk('p', 'lg-gen lg-demo', T('Demo: the land drawn around Cyprus is a rough stand-in shape, not the real coastline.', 'Δοκιμή: η στεριά γύρω από την Κύπρο είναι ένα πρόχειρο σχήμα, όχι η πραγματική ακτογραμμή.')));
    legend.dataset.layer = ''; legend.dataset.state = '';
    legend.replaceChildren(...out); return;
  }
  const layer = layerOf(soloId), info = layer.info, st = sheetState(soloId), i = LAYERS.indexOf(layer);
  legend.style.setProperty('--c', layer.c); legend.dataset.layer = soloId; legend.dataset.state = st.kind;
  const step = mk('div', 'lg-step');
  const prev = mk('button', 'lg-prev', '◀'), next = mk('button', 'lg-next', '▶'), all = mk('button', 'lg-all', T('All', 'Όλα'));
  prev.type = next.type = all.type = 'button';
  prev.setAttribute('aria-label', T('Previous layer', 'Προηγούμενο στρώμα')); next.setAttribute('aria-label', T('Next layer', 'Επόμενο στρώμα'));
  all.setAttribute('aria-label', T('Back to all layers', 'Πίσω σε όλα τα στρώματα'));
  prev.addEventListener('click', () => stepSolo(-1)); next.addEventListener('click', () => stepSolo(1));
  all.addEventListener('click', () => { setSolo(soloId); const b = legend.querySelector('.lg-go'); if (b) b.focus(); });
  step.append(prev, mk('span', 'lg-n', T('LAYER ', 'ΣΤΡΩΜΑ ') + (i + 1) + ' / ' + LAYERS.length), next, all);
  out.push(step, mk('h3', null, TT(layer.name)), mk('p', 'lg-cap', say(info.cap)));
  const has = st.kind !== 'none';
  if (info.scale && has) {
    const sc = SCALE[info.scale], box = mk('div', 'lg-scale'), ends = sc.ends || [['low', 'χαμηλά'], ['high', 'ψηλά']];
    box.append(mk('div', 'lg-scale-name', TT(SCALE_NAME[info.scale]) + ' · ' + sc.unit));
    const bar = mk('div', 'lg-bar'); bar.style.background = cssScale(sc); box.append(bar);
    const ticks = mk('div', 'lg-ticks'), mid = (sc.min + sc.max) / 2;
    [TT(ends[0]) + ' ' + sc.min, String(mid), sc.max + (sc.top ? '' : '+') + ' ' + TT(ends[1])].forEach((x) => ticks.append(mk('span', null, x)));
    box.append(ticks); out.push(box);
  }
  const moveLine = info.always ? say(info.never) : !has ? NO_MOVE() : info.never ? say(info.never) : info.move ? say(still() ? info.rest : info.move) : NO_MOVE();
  const mv = mk('p', 'lg-move'); mv.append(mk('b', null, T('Motion: ', 'Κίνηση: ')), moveLine); out.push(mv);
  const marks = typeof info.marks === 'function' ? info.marks() : info.marks;
  if (has && marks) marks.forEach((m) => out.push(mk('p', 'lg-mark', TT(m))));
  const state = mk('div', 'lg-state ' + st.kind); state.setAttribute('aria-live', 'off');   // its age ticks; a screen reader is not told every half minute
  state.append(mk('b', null, TT(STATE_WORD[st.kind])), mk('span', null, (has ? T('Source: ', 'Πηγή: ') : '') + st.text));
  if (layer.link) { const a = mk('a', 'lg-link', layer.link[1]); a.href = layer.link[0]; a.target = '_blank'; a.rel = 'noopener noreferrer'; state.append(a); }
  out.push(state);
  legend.replaceChildren(...out);
}
// Between changes of sheet only the source line is brought up to date, so the key is not rebuilt under a reader's hands.
function refreshLegend(whole) {
  const st = soloId == null ? null : sheetState(soloId);
  if (whole || (st && legend.dataset.state !== st.kind)) { const had = legend.contains(document.activeElement) ? document.activeElement.className : null;
    paintLegend(); if (had) { const b = legend.querySelector('.' + had.split(' ')[0]); if (b) b.focus(); } return; }
  if (!st) return;
  const sp = legend.querySelector('.lg-state span');
  if (sp) sp.textContent = (st.kind !== 'none' ? T('Source: ', 'Πηγή: ') : '') + st.text;
}
// Which beams have a source that spoke in the last hour and a half: only those carry moving dots.
const BEAM_FRESH_MIN = 90;
function markBeams() {
  const m = (live && live.map) || {}, now = Date.now();
  const stationsFresh = (m.stations || []).some((st) => st.at && (now - st.at) / 60000 < BEAM_FRESH_MIN);
  const modelFresh = !!skyAt && (now - skyAt) / 60000 < BEAM_FRESH_MIN;
  beams.forEach((b) => {
    if (b.tag === 'own') { let r = null; for (const name of FEED.island.vars) { r = pick(SCHOOL_CITY[b.city] || b.city, name, true); if (r) break; }
      b.live = !!(r && r.ageMin != null && r.ageMin < BEAM_FRESH_MIN); }
    else if (b.tag === 'stations') b.live = stationsFresh;
    else if (b.tag === 'model') b.live = modelFresh;
    else if (b.tag === 'adsb') b.live = planesFresh() && !planes.mock;  // made-up test points are not a source reporting
    else b.live = false;                                           // published files and drawn sheets send nothing
  });
}

const setAll = (fn) => {
  soloId = null;
  sheets.forEach((s) => {
    setOn(s, fn(s));
    if (s.solo) s.solo.setAttribute('aria-pressed', 'false');
    if (s.cities) s.cities.hidden = true;
  });
  fitWindows(); drawTwins(); touchAll();
  document.body.classList.remove('solo-on');
  paintLegend();
};
const tools = document.querySelector('.tools');
const allBtn = document.getElementById('all'), tourBtn = document.getElementById('tour'), hint = document.getElementById('hint');
tools.querySelectorAll('[data-band]').forEach((b) => b.addEventListener('click', () => {
  const band = b.dataset.band;
  const only = b.getAttribute('aria-pressed') !== 'true';
  tools.querySelectorAll('[data-band]').forEach((o) => o.setAttribute('aria-pressed', String(o === b && only)));
  allBtn.setAttribute('aria-pressed', String(!only));
  setAll((s) => (only ? s.layer.band === band || s.layer.id === 'island' : true));
}));
// Which sheets stand on a reading rather than on a drawing, a model or a published table: the ones with a measured
// feed, the satellite when a real picture has landed, and a sheet that reports itself as measured right now.
const MEASURED_KIND = new Set(['reference-station', 'calibrated-network', 'low-cost-sensor', 'crowd-sourced']);
function measuredIds() {
  const ids = new Set();
  Object.keys(FEED).forEach((id) => {
    const feed = FEED[id];
    for (const name of feed.vars) {
      const r = best(name, feed.own);
      if (r) { if (MEASURED_KIND.has(r.kind)) ids.add(id); break; }
    }
  });
  LAYERS.forEach((l) => { if (!FEED[l.id] && !l.nolive && l.state && l.state().kind === 'measured') ids.add(l.id); });
  return ids;                                                      // rain, cloud, waves, ports, seabed never qualify: a model or a table is not a gauge
}
const onlyBtn = document.getElementById('measured');
if (onlyBtn) onlyBtn.addEventListener('click', () => {
  const on = onlyBtn.getAttribute('aria-pressed') !== 'true';
  onlyBtn.setAttribute('aria-pressed', String(on));
  allBtn.setAttribute('aria-pressed', String(!on));
  tools.querySelectorAll('[data-band]').forEach((o) => o.setAttribute('aria-pressed', 'false'));
  const ids = measuredIds();
  setAll((s) => (on ? ids.has(s.layer.id) : true));
});
allBtn.addEventListener('click', () => {
  if (onlyBtn) onlyBtn.setAttribute('aria-pressed', 'false');
  allBtn.setAttribute('aria-pressed', 'true');
  tools.querySelectorAll('[data-band]').forEach((o) => o.setAttribute('aria-pressed', 'false'));
  setAll(() => true);
});

/* ---- the camera: the whole region, or flown in to Cyprus ---- */
// How far back the camera must stand for a ball of radius r to fit the part of the window the panels leave free.
const usable = () => (innerWidth > 860 ? .6 : 1);
const fitDist = (r) => { const half = Math.min(19 * Math.PI / 180, Math.atan(Math.tan(19 * Math.PI / 180) * camera.aspect * usable())); return r / Math.sin(half); };
const VIEW_DIR = (() => { const v = [-.6, .42, .68], n = Math.hypot(...v); return v.map((k) => k / n); })();
const away = (tgt, d) => [[tgt[0] + VIEW_DIR[0] * d, tgt[1] + VIEW_DIR[1] * d, tgt[2] + VIEW_DIR[2] * d], tgt];
const homePose = () => away([0, MID, 0], Math.min(15500, fitDist(Math.hypot(SW / 2, SH / 2, TOP / 2) * 1.08)));
const cyprusPose = () => away([ISLE.x, MID * .9, ISLE.z], Math.min(15500, fitDist(Math.hypot(ISLE.w / 2, ISLE.d / 2, TOP / 2) * 1.3)));
/* one sheet on its own is looked at from above, so its picture can be read: the whole sheet, or Cyprus on it */
function soloPose(y, mode) {
  const wide = innerWidth > 860, share = wide ? .5 : 1;              // the panels on both sides cover part of a wide screen
  const width = mode === 'cyprus' ? ISLE.w * 1.2 : SW, cx = mode === 'cyprus' ? ISLE.x : 0, cz = mode === 'cyprus' ? ISLE.z : 0;
  const d = Math.min(15500, (mode === 'cyprus' ? 1.1 : 1.22) * width / (2 * Math.tan(19 * Math.PI / 180) * camera.aspect * share));
  const n = Math.hypot(.16, .8, .9);
  const ty = wide ? y : y - .15 * d;                                // on a phone the key sits at the bottom, so the sheet is lifted clear of it
  return [[cx - .16 / n * d, ty + .8 / n * d, cz + .9 / n * d], [cx, ty, cz]];
}
let viewMode = 'region', labelFade = 1;
const LABEL_CORNER = new THREE.Vector3(-SW / 2, MID, SH / 2);
const poseFor = (mode) => (soloId != null ? soloPose(yOf(soloId), mode) : mode === 'cyprus' ? cyprusPose() : homePose());
const viewBtns = { region: document.getElementById('view-region'), cyprus: document.getElementById('view-cyprus') };
function setView(mode) {
  viewMode = mode;
  Object.keys(viewBtns).forEach((k) => { if (viewBtns[k]) viewBtns[k].setAttribute('aria-pressed', String(k === mode)); });
  const pose = poseFor(mode); flyTo(pose[0], pose[1]);
}
Object.keys(viewBtns).forEach((k) => { if (viewBtns[k]) viewBtns[k].addEventListener('click', () => setView(k)); });

/* ---- the tour, which steps aside the moment you take hold ---- */
// From the whole region in to Cyprus, low over the sea sheets, up through the ground and the air to the sky, and back out.
let TOUR = [];
function planTour() { const H = homePose(), C = cyprusPose();
  TOUR = [
    { t: 0, pos: H[0], tgt: H[1] },
    { t: 9, pos: C[0], tgt: C[1] },
    { t: 17, pos: [ISLE.x - 620, yOf('ships') + 420, ISLE.z + 900], tgt: [ISLE.x - 40, yOf('waves'), ISLE.z] },
    { t: 25, pos: [ISLE.x + 340, yOf('veg') + 300, ISLE.z + 760], tgt: [ISLE.x + 80, yOf('island') + 60, ISLE.z + 30] },
    { t: 33, pos: [ISLE.x + 1500, yOf('aircraft') + 620, ISLE.z + 1400], tgt: [ISLE.x, yOf('wind'), ISLE.z] },
    { t: 42, pos: H[0], tgt: H[1] },
  ]; }
// With reduced motion the camera does not tour by itself: the view stands still until the reader moves it.
let tour = !still(), tourT = 0;
const ease = (a, b, f) => a + (b - a) * (f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);
tourBtn.setAttribute('aria-pressed', String(tour)); hint.hidden = !tour;
function stopTour() { if (!tour) return; tour = false; tourBtn.setAttribute('aria-pressed', 'false'); hint.hidden = true; }
tourBtn.addEventListener('click', () => { tour = !tour; fly = null; tourBtn.setAttribute('aria-pressed', String(tour)); hint.hidden = !tour; });
controls.addEventListener('start', () => { stopTour(); fly = null; });
canvas.addEventListener('wheel', () => { stopTour(); fly = null; }, { passive: true });

let fly = null;
function flyTo(pos, tgt) {
  stopTour();
  if (still()) { camera.position.set(pos[0], pos[1], pos[2]); controls.target.set(tgt[0], tgt[1], tgt[2]); fly = null; return; }
  fly = { p0: camera.position.toArray(), t0: controls.target.toArray(), p1: pos, t1: tgt, f: 0 };
}

function size() { const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); planTour(); }
addEventListener('resize', size); size();
{ const H = homePose(); camera.position.set(H[0][0], H[0][1], H[0][2]); controls.target.set(H[1][0], H[1][1], H[1][2]); }   // the opening view is the whole region
window.__region = () => ({ box: R, view: viewMode, flying: !!fly, cam: camera.position.toArray(), tgt: controls.target.toArray(), dist: camera.position.distanceTo(controls.target),
  island: ISLE, sheet: { w: SW, h: SH }, terrain: terrain ? terrain.kind : 'none' });
window.__landAt = (lng, lat) => { const [x, y] = pxOf(lng, lat), g = gi(x, y); return g >= 0 && g0.land[g] >= .5 ? 'cyprus' : isSea(x, y) ? 'sea' : 'land'; };

// the clock in the corner is this browser's own time, in Cyprus
{
  const d = new Date();
  const mon = EL ? ['ΙΑΝ','ΦΕΒ','ΜΑΡ','ΑΠΡ','ΜΑΪ','ΙΟΥΝ','ΙΟΥΛ','ΑΥΓ','ΣΕΠ','ΟΚΤ','ΝΟΕ','ΔΕΚ'] : ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const p2 = (n) => String(n).padStart(2, '0');
  document.getElementById('clock').textContent =
    `${p2(d.getDate())} ${mon[d.getMonth()]} ${d.getFullYear()} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/* ---- a sheet that fetches for itself: at the start, then on its own clock while it is on show ---- */
const loading = new Set();
function runLoad(l) {
  if (!l.load || loading.has(l.id)) return;
  loading.add(l.id); l.loadedAt = Date.now();
  Promise.resolve().then(() => l.load()).catch((e) => { console.error('The sheet "' + l.id + '" could not load: ' + String((e && e.message) || e)); })
    .then(() => { loading.delete(l.id); fitWindows(); touch(l.id); seabedBox.show(!!seabed && !seabed.meta.testOnly); paintRail(); markBeams(); refreshLegend(soloId === l.id); paintSolo(); });
}
function wake(l) { if (l.load && l.every && Date.now() - (l.loadedAt || 0) > l.every) runLoad(l); }
// the land around Cyprus: asked for once, and again while the server is still collecting it
async function loadTerrain(tries) {
  try {
    const r = await fetch('/api/terrain', { headers: { accept: 'application/json' } });
    if (r.status === 202 && tries < 60) { setTimeout(() => loadTerrain(tries + 1), 6000); return; }
    if (!r.ok) return;
    const t = await r.json();
    const good = t && Number.isInteger(t.rows) && Number.isInteger(t.cols) && t.rows > 1 && t.cols > 1 && Array.isArray(t.elev) && t.elev.length === t.rows * t.cols
      && [t.lat0, t.lat1, t.lng0, t.lng1].every((v) => typeof v === 'number' && isFinite(v));
    if (!good) return;
    buildRegion(t); floorC = null; airField(); touchAll(); refreshLegend(true);
  } catch (e) { /* no grid: Cyprus is still drawn from its outline, and the sea around it stays empty of land */ }
}

const clock = new THREE.Clock();
if (RMQ && RMQ.addEventListener) RMQ.addEventListener('change', () => { touchAll(); if (still()) { stopTour(); fly = null; } paintLegend(); });
let frame = 0;
// A seam for measuring only: ?prof=1 keeps a tally of where a frame's time goes (painting each sheet, drawing the scene).
const PROF = Q.get('prof') === '1' ? (window.__prof = { paint: {}, render: 0, frames: 0, uploads: 0 }) : null;
// On a slow machine (software drawing, an old tablet) the moving sheets are repainted less often, so the camera stays
// smooth: the pace is measured every 8 frames. The pictures show the same things, only refreshed at a calmer rate.
let slow = 1, slowAcc = 0;
function tick() {
  const dt = clock.getDelta(), t = clock.getElapsedTime();
  slowAcc += dt; if (frame % 8 === 7) { const avg = slowAcc / 8; slow = avg > .09 ? 3 : avg > .04 ? 2 : 1; slowAcc = 0; }
  const anim = !still(), ts = anim ? t : 0;
  // A painted sheet is redrawn when something changed it, and (unless motion is turned down) on its own beat. A hidden
  // sheet is left alone and catches up when it is shown again.
  for (let i = 0; i < sheets.length; i++) { const s = sheets[i], l = s.layer;
    if (!l.paint || !s.on) continue;
    if (!(need[l.id] || (anim && l.beat && (frame + i) % (l.beat * slow) === 0))) continue;
    const p0 = PROF ? performance.now() : 0, since = l.paintedAt == null ? dt : t - l.paintedAt;
    l.ctx.setTransform(1, 0, 0, 1, -s.win.x0, -s.win.y0);            // paint in sheet pixels, whatever part of the sheet this canvas covers
    l.paint(l.ctx, t, anim, Math.min(since, .12)); l.paintedAt = t; need[l.id] = false; s.tex.needsUpdate = true;
    if (PROF) { PROF.paint[l.id] = (PROF.paint[l.id] || 0) + performance.now() - p0; PROF.uploads++; PROF.slow = slow; } }
  stepPlanes(anim);
  // the names at the corner of the sheets are for the wide view: close in, they would stand between the reader and the island
  { const near = camera.position.distanceTo(LABEL_CORNER), o = clamp01((near - 2900) / 700);
    if (Math.abs(o - labelFade) > .01) { labelFade = o; sheets.forEach((s) => { s.lab.material.opacity = o; s.lab.visible = o > .02; }); } }
  const a = ts * .16;
  const sp = new THREE.Vector3(Math.cos(a) * ORBIT.rx, ORBIT.y + Math.sin(a * 2) * 40, Math.sin(a) * ORBIT.rz);
  polar.position.copy(sp); polar.lookAt(0, TOP, 0); polar.rotateX(Math.PI / 2);
  polarLabel.position.set(sp.x + 120, sp.y + 16, sp.z);
  polar.userData.beacon.material.color.set(!anim || (t * 2) % 1 > .5 ? '#ff6b5e' : '#3a1410');
  cone.position.copy(sp.clone().lerp(new THREE.Vector3(sp.x * .25, TOP, sp.z * .25), .5));
  cone.lookAt(sp); cone.rotateX(Math.PI / 2);
  geo.rotation.y = ts * .08;
  geoCone.position.copy(geo.position.clone().lerp(new THREE.Vector3(0, TOP, 0), .5));
  geoCone.lookAt(geo.position); geoCone.rotateX(Math.PI / 2);
  // Dots climb a beam only while its source has reported lately (markBeams). A quiet source has a bare line; with
  // reduced motion the dots of a reporting source stand still on the line.
  beams.forEach((b) => b.dots.forEach((d) => { d.mesh.visible = !!b.live && !b.hidden; if (!d.mesh.visible) return;
    if (anim) d.t = (d.t + dt * .24) % 1; d.mesh.position.lerpVectors(b.from, b.to, d.t); }));
  stepPulses(dt);
  pinLabels.forEach((rec, i) => {
    const h = haloAt(rec.ageMin);
    const pulse = anim && rec.ageMin != null && rec.ageMin < 15 ? 1 + Math.sin(t * 2 + i) * .06 : 1;
    rec.halo.scale.setScalar((h.r / 18) * pulse);
    rec.halo.material.color.set(h.c);
    rec.halo.material.opacity = h.o;
  });
  if (tour) {
    tourT += dt; const span = TOUR[TOUR.length - 1].t, tt = tourT % span;
    let i = 0; while (i < TOUR.length - 2 && TOUR[i + 1].t <= tt) i++;
    const A = TOUR[i], B = TOUR[i + 1], f = (tt - A.t) / (B.t - A.t);
    camera.position.set(ease(A.pos[0], B.pos[0], f), ease(A.pos[1], B.pos[1], f), ease(A.pos[2], B.pos[2], f));
    controls.target.set(ease(A.tgt[0], B.tgt[0], f), ease(A.tgt[1], B.tgt[1], f), ease(A.tgt[2], B.tgt[2], f));
  } else if (fly) {
    fly.f = Math.min(1, fly.f + dt / .9);
    camera.position.set(ease(fly.p0[0], fly.p1[0], fly.f), ease(fly.p0[1], fly.p1[1], fly.f), ease(fly.p0[2], fly.p1[2], fly.f));
    controls.target.set(ease(fly.t0[0], fly.t1[0], fly.f), ease(fly.t0[1], fly.t1[1], fly.f), ease(fly.t0[2], fly.t1[2], fly.f));
    if (fly.f >= 1) fly = null;
  }
  controls.update();
  const r0 = PROF ? performance.now() : 0;
  renderer.render(scene, camera); frame++;
  if (PROF) { PROF.render += performance.now() - r0; PROF.frames++; }
  requestAnimationFrame(tick);
}
/* ---- twin pins: where two sources measure the same thing in the same city and do not agree ---- */
// Which sheet a measurement belongs to. Only the variables a sheet actually shows (its feed, above) are listed, so a
// disagreement is never drawn on a sheet that does not carry that measurement.
const VAR_SHEET = { temperature: 'island', co2: 'island', pm25: 'air', pm10: 'air', ozone: 'air',
  wind_speed: 'wind', sea_surface_temperature: 'waves', wave_height: 'waves' };
const CITY_POS = {};   // filled once the island is placed
const twins = new THREE.Group(); scene.add(twins);
/* ---- the ruler down the side: what height each sheet stands for ---- */
// Plain words, not invented numbers: the sheets are stacked for reading, not drawn to any scale, and the ruler says so.
{
  const rx = SW * .5 + 110, rz = SH * .5 + 50, lo = 0, hi = TOP;
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(rx, lo, rz), new THREE.Vector3(rx, hi, rz)]),
    new THREE.LineBasicMaterial({ color: '#4d6a86', transparent: true, opacity: .5 }));
  scene.add(line);
  LAYERS.forEach((layer, i) => {
    const y = i * GAPY, h = layer.height; if (!h) return;
    const tk = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(rx - 44, y, rz), new THREE.Vector3(rx, y, rz)]),
      new THREE.LineBasicMaterial({ color: layer.c, transparent: true, opacity: .55 }));
    scene.add(tk);
    const lab = label(TT(h), '', '#8fa9c4', mobile ? 60 : 42);
    lab.position.set(rx + 20, y, rz); scene.add(lab);
  });
  const head = label(T('WHAT EACH SHEET STANDS FOR', 'ΤΙ ΔΕΙΧΝΕΙ ΚΑΘΕ ΦΥΛΛΟ'), T('stacked to be read, not to scale', 'στοιβαγμένα για να διαβάζονται, όχι σε κλίμακα'), '#8fa9c4', mobile ? 66 : 48);
  head.position.set(rx + 20, hi + GAPY * .55, rz); scene.add(head);
}

/* ---- a reading arriving is the only thing that sends a pulse up a beam ---- */
const pulses = [];
const lastSeen = new Map();            // sheet id -> the reading it last showed, so only a new one fires
// Which kind of beam belongs to a source: our own cards at the schools, the stations on the island, the model boxes
// off to the side. A source with no beam of its own sends no pulse, rather than borrowing someone else's.
const beamOf = (src) => (/^sensecap/.test(src) ? 'own' : /^(cydom|metar)/.test(src) ? 'stations'
  : /^(openmeteo|cams|ecmwf|copernicus|noaa)/.test(src) ? 'model' : null);
let pulsesSent = 0;
window.__pulses = () => pulsesSent;        // the tests count the readings that travelled up a beam
function firePulse(tag, city) {
  beams.filter((b) => b.tag === tag && (!city || b.city === city) && b.from.distanceTo(b.to) > 1).forEach((b) => {
    pulsesSent++;
    const m = new THREE.Mesh(new THREE.SphereGeometry(5.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .95 }));
    m.position.copy(b.from); scene.add(m);
    pulses.push({ mesh: m, from: b.from, to: b.to, t: 0 });
  });
}
function stepPulses(dt) {
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.t += dt * .75;                                      // about a second and a third from source to sheet
    if (p.t >= 1) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); pulses.splice(i, 1); continue; }
    p.mesh.position.lerpVectors(p.from, p.to, p.t);
    p.mesh.material.opacity = .95 * (1 - p.t * p.t);
    p.mesh.scale.setScalar(1 + p.t * 1.6);
  }
}
// What each sheet is showing now; when that changes, the reading is new and the beam carries it up.
// A reading is the same reading whenever it was taken at the same minute, however often the page asks for it: the age
// the feed gives and the time of the fetch put that minute back together. Only a reading taken at a new minute is new.
const readingKey = (r) => r.source + '|' + r.variable + '|' + r.value + '|' + Math.round((Date.now() - r.ageMin * 60000) / 60000);
let firstArrivals = true;
function markArrivals() {
  if (!live) return;
  const fire = (key2, value, tag, city, cardId, ageMin) => {
    const had = lastSeen.get(key2);
    lastSeen.set(key2, value);
    if (had === value) return;
    // On the very first fetch only what has just come in is announced; nothing old is paraded as an arrival.
    if (firstArrivals && !(ageMin != null && ageMin < 30)) return;
    if (tag) firePulse(tag, city);
    flashCard(cardId);
  };
  Object.keys(FEED).forEach((id) => {
    const feed = FEED[id];
    let r = null;
    for (const name of feed.vars) { r = best(name, feed.own); if (r) break; }
    if (!r) return;
    if (id === 'island') return;                                   // our own sensors are announced school by school, below
    fire(id, readingKey(r), beamOf(r.source), null, id, r.ageMin);
  });
  // our own cards: the beam that lights up is the school the reading came from
  I.schools.forEach((sc) => {
    const city = SCHOOL_CITY[sc.id] || sc.id;
    let r = null;
    for (const name of FEED.island.vars) { r = pick(city, name, true); if (r) break; }
    if (r) fire('own|' + sc.id, readingKey(r), 'own', sc.id, 'island', r.ageMin);
  });
  if (rainMm != null && skyAt) fire('rain', 'model|' + rainMm + '|' + skyAt, 'model', null, 'rain', (Date.now() - skyAt) / 60000);
  if (cloudPct != null && skyAt) fire('cloud', 'model|' + cloudPct + '|' + skyAt, null, null, 'cloud', (Date.now() - skyAt) / 60000);
  firstArrivals = false;
}
function flashCard(id) {
  const sh = sheetOf[id];
  if (!sh || !sh.btn) return;
  sh.btn.classList.remove('fresh');
  void sh.btn.offsetWidth;                                 // let the browser see it go, so the same card can flash twice
  sh.btn.classList.add('fresh');
}

/* ---- how long each sheet has to wait for its next reading ---- */
function paintSolo() {
  if (soloId == null) return;
  const s = sheetOf[soloId];
  if (s) paintCities(s);
}
function paintWaits() {
  if (!live || !live.layers) return;
  const now = Date.now();
  LAYERS.forEach((layer) => {
    const sh = sheetOf[layer.id]; if (!sh || !sh.btn) return;
    const bar = sh.btn.querySelector('.go'); if (!bar) return;
    const row = live.layers.find((l) => l.id === sh.btn.dataset.src);
    if (!row || !row.everyMs || !row.lastAt) { bar.style.width = '0%'; bar.removeAttribute('title'); return; }
    const waited = now - row.lastAt, every = Math.round(row.everyMs / 60000);
    bar.style.width = (Math.max(0, Math.min(1, waited / row.everyMs)) * 100).toFixed(1) + '%';
    const over = Math.round((waited - row.everyMs) / 60000);
    bar.title = over > 0
      ? T(row.name + ' reports about every ' + every + ' min · about ' + over + ' min late',
        row.nameEl + ' στέλνει περίπου κάθε ' + every + ' λεπτά · περίπου ' + over + ' λεπτά αργοπορία')
      : T(row.name + ' reports about every ' + every + ' min · next in about ' + Math.round(-over) + ' min',
        row.nameEl + ' στέλνει περίπου κάθε ' + every + ' λεπτά · επόμενη σε περίπου ' + Math.round(-over) + ' λεπτά');
  });
}

function clearGroup(g) { while (g.children.length) { const c = g.children.pop();
  if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } } }

function drawTwins() {
  clearGroup(twins);
  window.__twins = 0;
  if (!live || !live.riversAll) return;
  const seen = new Map();   // one pair per city and sheet: the widest disagreement wins the space
  live.riversAll.forEach((rv) => {
    const sheetId = VAR_SHEET[rv.variable]; if (!sheetId) return;
    const sheet = sheetOf[sheetId]; if (!sheet || !sheet.on) return;
    Object.keys(rv.cities || {}).forEach((cityId) => {
      const st = rv.cities[cityId];
      if (!st || st.state !== 'differ' || st.low == null || st.high == null) return;
      const over = st.tolerance ? st.spread / st.tolerance : 1;
      const key2 = cityId + '|' + sheetId;
      const cur = seen.get(key2);
      const more = cur ? cur.more + 1 : 0;                           // how many other disagreements this one stands for
      if (!cur || over > cur.over) seen.set(key2, { rv, st, over, cityId, sheet, more });
      else cur.more = more;
    });
  });
  seen.forEach(({ rv, st, over, cityId, sheet, more }) => {
    const base = CITY_POS[cityId]; if (!base) return;
    // Both readings stand on the same spot, one above the other: the gap is the size of the disagreement, never a
    // position. Nothing here places a sensor anywhere but the school site the pin already marks.
    const y = sheet.y, span = Math.min(52, 16 + over * 12);
    const a = new THREE.Vector3(base.x, y + 10, base.z);
    const b = new THREE.Vector3(base.x, y + 10 + span, base.z);
    const colour = '#F2CF86';
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, span, 10),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: .5 }));
    bar.position.set(base.x, y + 10 + span / 2, base.z); twins.add(bar);
    [a, b].forEach((p) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(4.5, 12, 10), new THREE.MeshBasicMaterial({ color: colour }));
      dot.position.copy(p); twins.add(dot);
      const ring = new THREE.Mesh(new THREE.RingGeometry(6.5, 8.5, 24), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: .45, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(p); twins.add(ring);
    });
    const unit = Array.isArray(rv.unit) ? rv.unit[0] : rv.unit;
    const name = EL && rv.label && rv.label[1] ? rv.label[1] : (rv.label && rv.label[0]) || rv.variable;
    const short = name.length > 14 ? name.slice(0, 13) + '…' : name;
    const src = (st.sources || []).slice(0, 2).join(' / ');
    const tail = more ? ' +' + more : '';
    const lab = label(`${fmt(st.low)}–${fmt(st.high)} ${unit || ''}`,
      `${short} · ${T('two sources for this city', 'δύο πηγές για αυτή την πόλη')} · ${src}${tail}`,
      colour, mobile ? 40 : 26);
    lab.position.set(base.x + 18, y + 24 + span, base.z);   // clear of the school's own label
    twins.add(lab);
  });
  // what the tests read: how many disagreements are drawn, and how many pins carry an age
  window.__twins = twins.children.length ? seen.size : 0;
  window.__halos = pinLabels.filter((r) => r.ageMin != null && r.ageMin < 1e8).length;
}

/* ---- the real readings ---- */
const CITY = ['larnaka', 'lefkosia', 'limassol', 'paphos'];
const SCHOOL_CITY = { larnaka: 'larnaka', lefkosia: 'lefkosia', limassol: 'limassol', paphos: 'paphos' };
// The feed states how old each reading was when it was fetched. The page is open for much longer than that, and a
// fetch can fail, so the clock has to keep running here: every age is the one in the snapshot plus the time since.
const ageNow = (m) => (m == null ? null : m + (Date.now() - liveAt) / 60000);

function pick(cityId, variable, ownOnly) {
  const c = live && live.cities && live.cities[cityId];
  if (!c) return null;
  const rows = c.rows.filter((r) => r.variable === variable && (!ownOnly || /^sensecap-/.test(r.source)));
  if (!rows.length) return null;
  rows.sort((a, b) => (a.ageMin == null ? 1e9 : a.ageMin) - (b.ageMin == null ? 1e9 : b.ageMin));
  return { ...rows[0], ageMin: ageNow(rows[0].ageMin) };
}
function best(variable, ownOnly) {          // the newest reading of one measurement anywhere on the island
  let out = null;
  CITY.forEach((c) => { const r = pick(c, variable, ownOnly); if (r && (!out || (r.ageMin || 0) < (out.ageMin || 0))) out = { ...r, city: c }; });
  return out;
}

const MODEL_SHEET = new Set(['rain', 'cloud']);                      // paintSky owns these two cards
function putCard(s, b, em, cls) {
  s.btn.querySelector('.val').replaceChildren(Object.assign(document.createElement('b'), { textContent: String(b) }), Object.assign(document.createElement('em'), { textContent: em }));
  s.btn.querySelector('.st').className = 'st ' + cls;
}
function paintRail() {
  LAYERS.forEach((layer) => {
    if (MODEL_SHEET.has(layer.id)) return;     // rain and cloud come from the model grid; paintSky owns those two cards
    const s = sheetOf[layer.id]; if (!s || !s.btn) return;
    const stEl = s.btn.querySelector('.st'), srcEl = s.btn.querySelector('small');
    if (layer.srcNow) { const text = TT(layer.srcNow() || layer.src);  // a source is named only while its data is really here
      if (s.srcText !== text) { s.srcText = text; srcEl.textContent = text; setSheetSub(s, text); } }
    const own = layer.card ? layer.card() : null;
    if (own) { putCard(s, own.b, own.em, own.cls); return; }
    const feed = FEED[layer.id];
    if (!feed || !live) {
      putCard(s, T('drawn', 'σχεδιασμένο'), T('not measured yet', 'όχι ακόμη μετρημένο'), 'year');
      stEl.title = T('This sheet is drawn, not measured.', 'Αυτό το φύλλο είναι σχεδιασμένο, όχι μετρημένο.');
      return;
    }
    let r = null;
    for (const name of feed.vars) { r = best(name, feed.own); if (r) break; }
    if (!r) { putCard(s, '—', T('nothing arrived', 'δεν ήρθε τίποτα'), 'year'); return; }
    putCard(s, fmt(r.value), (r.unit || '') + ' · ' + ageText(r.ageMin), r.ageMin != null && r.ageMin < 90 ? 'live' : 'old');
    stEl.title = r.source + ' · ' + ageText(r.ageMin);
    srcEl.textContent = r.source + (r.where ? ' · ' + r.where : '');
    s.btn.dataset.src = r.source;
  });
}

function paintProbe() {
  const box = document.querySelector('.probe');
  const rows = [
    ['AIR TEMP', 'ΘΕΡΜΟΚΡΑΣΙΑ', 'temperature', true],
    ['CO₂', 'CO₂', 'co2', true],
    ['PM2.5', 'PM2.5', 'pm25', false],
    ['WIND 10 M', 'ΑΝΕΜΟΣ 10 M', 'wind_speed', false],
    ['PRESSURE', 'ΠΙΕΣΗ', 'pressure', false],
    ['SEA', 'ΘΑΛΑΣΣΑ', 'sea_surface_temperature', false],
  ];
  const city = 'larnaka';
  const out = [document.createElement('h2')];
  out[0].textContent = T('PROBE · PASCAL LARNAKA', 'ΜΕΤΡΗΣΗ · PASCAL ΛΑΡΝΑΚΑ');
  rows.forEach(([en, el, variable, own]) => {
    const r = pick(city, variable, own) || pick(city, variable, false);
    const d = document.createElement('div'); d.className = 'kv';
    const a = document.createElement('span'); a.textContent = T(en, el);
    const b = document.createElement('b');
    if (r) {
      b.textContent = String(fmt(r.value));
      const em = document.createElement('em');
      // the wind row carries its bearing, so the one line says how hard and which way
      const from = variable === 'wind_speed' && windDir != null ? ' · ' + T('from ', 'από ') + Math.round(windDir) + '°' : '';
      em.textContent = (r.unit || '') + from + ' · ' + ageText(r.ageMin);
      b.append(em);
    }
    else { b.textContent = '—'; }
    d.append(a, b); out.push(d);
  });
  const p = document.createElement('p');
  p.textContent = live
    ? T('These are the newest readings Kleanthis holds for Larnaka, with the age of each one. Sheets marked "drawn" are not measured yet.',
      'Αυτές είναι οι πιο πρόσφατες μετρήσεις που κρατά ο Kleanthis για τη Λάρνακα, με την ηλικία της καθεμιάς. Τα φύλλα που λένε "σχεδιασμένο" δεν μετριούνται ακόμη.')
    : T('Waiting for the newest readings…', 'Αναμονή για τις πιο πρόσφατες μετρήσεις…');
  out.push(p);
  box.replaceChildren(...out);
}

// the four school pins carry the newest reading of their own city, and a halo that shows its age
const pinLabels = [];
I.schools.forEach((sc) => {
  const p = p3(sc.lng, sc.lat, ISLAND_Y);
  CITY_POS[sc.id] = p;
  const lab = label(sc.name, '—', '#F7C46B', mobile ? 40 : 28);
  lab.position.set(p.x + 14, ISLAND_Y + 34, p.z); scene.add(lab);
  const halo = new THREE.Mesh(new THREE.RingGeometry(16, 20, 40),
    new THREE.MeshBasicMaterial({ color: '#F7C46B', transparent: true, opacity: .5, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(p.x, ISLAND_Y + 2.5, p.z); scene.add(halo);
  pinLabels.push({ sc, lab, p, halo, ageMin: null });
});
function paintPins() {
  pinLabels.forEach(({ sc, lab }) => {
    const city = SCHOOL_CITY[sc.id] || sc.id;
    // Only this school's own sensors: a model value for the city says nothing about whether the school is reporting.
    const t1 = pick(city, 'temperature', true);
    const c1 = pick(city, 'co2', true);
    const bits = [];
    if (t1) bits.push(fmt(t1.value) + ' ' + (t1.unit || ''));
    if (c1) bits.push(fmt(c1.value) + ' ' + (c1.unit || ''));
    const age = [t1, c1].filter(Boolean).map((r) => (r.ageMin == null ? 1e9 : r.ageMin));
    const youngest = age.length ? Math.max(...age) : null;   // the halo keeps the older of the two, never the flattering one
    const sub = bits.length ? bits.join(' · ') + ' · ' + T('our sensors', 'οι αισθητήρες μας') + ' · ' + ageText(youngest)
      : T('no reading from our sensors here', 'καμία μέτρηση από τους αισθητήρες μας εδώ');
    const old = lab.material.map;
    const next = label(sc.name, sub, '#F7C46B', mobile ? 40 : 28);
    lab.material.map = next.material.map; lab.material.needsUpdate = true;
    if (old) old.dispose();
    const rec = pinLabels.find((x) => x.sc === sc); if (rec) rec.ageMin = youngest;
  });
}
// The halo: one hue for every school, because the ring says how old a reading is and nothing about the school.
// A reading that just arrived sits tight and clear; an older one spreads and fades; nothing arrived is grey.
function haloAt(ageMin) {
  if (ageMin == null || ageMin > 1e8) return { r: 34, o: .09, c: '#7f93ac' };
  const f = Math.min(1, ageMin / HALO_FULL);
  return { r: 16 + f * 22, o: .55 - f * .42, c: '#8ecfe6' };
}

// Which way the wind blows, how much rain fell this hour, how much of the sky is covered. The bearing is measured at
// the airports when they are reporting (METAR gives a wind direction); otherwise it is the model's, and the card says
// which. Rain and cloud are the model's own grid values, never a gauge, and they are labelled "model" wherever shown.
const meanBearing = (list) => {
  if (!list.length) return null;
  let x = 0, y = 0;
  list.forEach((d) => { const a = d * Math.PI / 180; x += Math.cos(a); y += Math.sin(a); });
  if (!x && !y) return null;
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};
const meanOf = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
window.__meanBearing = meanBearing;     // the tests check the circular mean, which plain averaging gets wrong

// The model grid now reaches out over the sea, so the one-line summaries on the cards (a mean bearing, a mean rain, a
// mean cloud cover) are taken from the grid points over Cyprus only, and are labelled as the model's. What the airports
// measure is a reading at one airport: it is named, one airport at a time, and never averaged into anything.
const overCyprus = (p) => p.lat >= ISLAND_BOX.lat0 - .13 && p.lat <= ISLAND_BOX.lat1 + .13 && p.lng >= ISLAND_BOX.lng0 - .13 && p.lng <= ISLAND_BOX.lng1 + .13;
function paintWind() {
  const m = (live && live.map) || {};
  const fresh = (st) => st.at == null || Date.now() - st.at < 2 * 3600000;
  airportWind = (m.stations || [])
    .filter((st) => st.src === 'metar-airports' && st.wd != null && st.ws != null && st.ws > 0 && fresh(st))
    .map((st) => ({ name: st.name, wd: Math.round(st.wd), ws: st.ws, lat: st.lat, lng: st.lng }));
  // The moving lines follow the grid itself, point by point: a bearing names where the wind comes FROM, so the air
  // travels the opposite way. u is the part that blows east, v the part that blows north, both in m/s.
  grid = (m.wind || []).filter((p) => p.lat != null && p.lng != null);
  const home = grid.filter(overCyprus);
  const bearings = home.filter((p) => p.wd != null);
  windDir = bearings.length ? meanBearing(bearings.map((p) => p.wd)) : null;
  windSrc = windDir == null ? null : 'openmeteo-weather';
  const blows = grid.filter((p) => p.wd != null && p.ws != null);
  const rad = (p) => p.wd * Math.PI / 180;
  const fu = mkField(blows, (p) => -p.ws * Math.sin(rad(p))), fv = mkField(blows, (p) => -p.ws * Math.cos(rad(p)));
  windF = fu && fv ? { u: fu, v: fv } : null;
  gridF = mkField(grid, () => 0);
  // rain: the cells that have any, each the size of one step of the grid
  const at = grid.map((p) => pxOf(p.lng, p.lat));
  cellW = stepOf(at.map((q) => q[0]), 48 * U); cellH = stepOf(at.map((q) => q[1]), 59 * U);
  rainKnown = grid.some((p) => p.rain != null);
  rainCells = grid.filter((p) => p.rain != null && p.rain > 0).map((p) => { const [x, y] = pxOf(p.lng, p.lat); return { x, y, mm: p.rain }; });
  cloudF = mkField(grid.filter((p) => p.cloud != null), (p) => p.cloud);
  airPts = (m.air || []).filter((p) => p.pm25 != null && p.lat != null && p.lng != null);
  airF = mkField(airPts, (p) => p.pm25); airField(); seedSpecks();
  seaPts = (m.sea || []).filter((p) => p.lat != null && p.lng != null && (p.sst != null || p.wave != null));
  stationPts = (m.stations || []).filter((p) => p.temp != null && p.lat != null && p.lng != null);
  fitWindows(); touchAll();
  const rains = home.map((p) => p.rain).filter((v) => v != null);
  const clouds = home.map((p) => p.cloud).filter((v) => v != null);
  rainMm = rains.length ? Math.round(meanOf(rains) * 100) / 100 : null;
  cloudPct = clouds.length ? Math.round(meanOf(clouds)) : null;
  skyAt = m.weatherAt || null;                                     // when the model grid itself was made
}

// The three sheets the model feeds: wind direction on the wind card, rain and cloud on their own. Each says "model"
// unless the bearing came from an airport, and each keeps the age of the reading behind it.
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const COMPASS_EL = ['Β', 'ΒΒΑ', 'ΒΑ', 'ΑΒΑ', 'Α', 'ΑΝΑ', 'ΝΑ', 'ΝΝΑ', 'Ν', 'ΝΝΔ', 'ΝΔ', 'ΔΝΔ', 'Δ', 'ΔΒΔ', 'ΒΔ', 'ΒΒΔ'];
const compass = (deg) => (EL ? COMPASS_EL : COMPASS)[Math.round(deg / 22.5) % 16];
function paintSky() {
  const age = skyAt ? ageText((Date.now() - skyAt) / 60000) : T('age unknown', 'άγνωστη ηλικία');
  const w = sheetOf.wind;
  if (w && w.btn) {
    const air = airportWind.map((a) => a.name.replace(/ airport$/i, '') + ' ' + a.wd + '° ' + compass(a.wd)).join(' · ');
    const from = windDir == null ? '' : T('model grid, mean over Cyprus: from ', 'πλέγμα μοντέλου, μέσος όρος πάνω από την Κύπρο: από ')
      + Math.round(windDir) + '° ' + compass(windDir);
    const both = [from, air ? T('airports measure ', 'τα αεροδρόμια μετρούν ') + air : ''].filter(Boolean).join(' · ');
    const sub = both ? both.toUpperCase() : TT(w.layer.src);
    if (both) w.btn.title = both; else w.btn.removeAttribute('title');   // nothing said which way: the sheet says nothing either
    if (w.subText !== sub) { w.subText = sub; setSheetSub(w, sub); }
  }
  const r = sheetOf.rain;
  if (r && r.btn) {
    r.btn.dataset.src = 'openmeteo-weather';
    if (rainMm == null) putCard(r, T('drawn', 'σχεδιασμένο'), T('not measured yet', 'όχι ακόμη μετρημένο'), 'year');
    else putCard(r, fmt(rainMm), 'MM · ' + T('model · ', 'μοντέλο · ') + age, 'live');
  }
  const c = sheetOf.cloud;
  if (c && c.btn) {
    c.btn.dataset.src = 'openmeteo-weather';
    if (cloudPct == null) putCard(c, T('drawn', 'σχεδιασμένο'), T('not measured yet', 'όχι ακόμη μετρημένο'), 'year');
    else putCard(c, cloudPct, '% · ' + T('model · ', 'μοντέλο · ') + age, 'live');   // the sheet itself is painted cell by cell, in cloudPaint
  }
}

// a real satellite picture, when the site has one stored: laid on the sheet where its own bounding box says it belongs
let satReal = false, satSub = null;
async function loadSatellite() {
  try {
    const r = await fetch('/api/satellite/images', { headers: { accept: 'application/json' } });
    if (!r.ok) return;
    const j = await r.json(), list = (j && j.images) || [];
    if (!list.length) return;
    list.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
    const im = list[0];
    const sheet = sheetOf.sat; if (!sheet) return;
    const img = new Image();
    img.onload = () => {
      const bb = Array.isArray(im.bbox) && im.bbox.length === 4 && im.bbox.every((v) => typeof v === 'number' && isFinite(v)) && im.bbox[2] > im.bbox[0] && im.bbox[3] > im.bbox[1]
        ? im.bbox : [ISLAND_BOX.lng0, ISLAND_BOX.lat0, ISLAND_BOX.lng1, ISLAND_BOX.lat1];   // [west, south, east, north]
      const [x0, y0] = pxOf(bb[0], bb[3]), [x1, y1] = pxOf(bb[2], bb[1]);
      setWin(sheet, { x0, y0, w: x1 - x0, h: y1 - y0 });               // the sheet's picture is now as large as the photograph, clipped to the region
      const w = sheet.win, k = Math.max(1, Math.min(2048 / w.w, img.width / Math.max(1, x1 - x0)));   // keep the picture's own detail where the sheet can hold it
      const c = document.createElement('canvas'); c.width = Math.round(w.w * k); c.height = Math.round(w.h * k);
      c.getContext('2d').drawImage(img, (x0 - w.x0) * k, (y0 - w.y0) * k, (x1 - x0) * k, (y1 - y0) * k);
      const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
      sheet.tex = tex; sheet.mesh.material.map = tex;
      sheet.mesh.material.needsUpdate = true;
      satReal = true; paintLegend();
      const when = im.time ? new Date(im.time) : null;
      satSub = (im.feed || 'satellite') + (when ? ' · ' + when.toISOString().slice(11, 16) + 'Z' : '');
      setSheetSub(sheet, satSub);
      if (sheet.btn) { sheet.btn.querySelector('small').textContent = satSub; paintRail(); }
    };
    img.src = '/api/satellite/image/' + encodeURIComponent(im.feed) + '/' + encodeURIComponent(im.id);
  } catch (e) { /* no picture: the drawn stand-in stays, and the rail still says "drawn" */ }
}

async function loadLive() {
  try {
    const r = await fetch('/layers/api/live', { headers: { accept: 'application/json' } });
    if (!r.ok) return;
    live = await r.json(); liveAt = Date.now();
    paintWind(); paintRail(); paintProbe(); paintPins(); paintSky(); drawTwins();   // the sky is read first (the probe shows its bearing) and painted last (its two cards are its own)
    markBeams(); refreshLegend();
    markArrivals(); paintWaits(); paintSolo();
  } catch (e) {
    // Keep what is on the screen and try again at the next refresh; the ages on it keep running, so nothing here
    // starts looking fresher than it is. The reason is kept where the tests and the console can see it.
    window.__liveError = String((e && e.message) || e);
    console.error('The live readings could not be shown: ' + window.__liveError);
  }
}
paintRail(); paintProbe(); paintLegend();
loadLive(); loadSatellite(); loadTerrain(0);
LAYERS.forEach((l) => { if (!l.load) return; runLoad(l);
  if (l.every) setInterval(() => { if (!document.hidden && sheetOf[l.id].on) runLoad(l); }, l.every); });
setInterval(() => { if (!document.hidden) loadLive(); }, 120000);
// The readings on the screen age even when no new ones arrive, so the clock on them keeps running between fetches.
setInterval(() => { if (!document.hidden && live) { paintRail(); paintProbe(); paintPins(); paintSky(); paintSolo(); markBeams(); touch('island'); refreshLegend(); } }, 30000);
setInterval(() => { if (!document.hidden) paintWaits(); }, 5000);
// A seam for the tests only: move this page's clock forward and repaint, to check that the ages and the rings
// really do keep running when no new reading arrives. It changes nothing that a reader can reach.
window.__ageForward = (minutes) => {
  liveAt -= minutes * 60000; paintRail(); paintProbe(); paintPins();
  // the ring is measured in the same breath, so a refresh landing a moment later cannot confuse the reading
  const h = pinLabels.map((r) => haloAt(r.ageMin).r / 18);
  return { ages: pinLabels.map((r) => r.ageMin), halo: Math.max(...h) };
};
window.__haloWidth = () => (pinLabels[0] ? pinLabels[0].halo.scale.x : 0);

tick();
window.__embedReady = true;
