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
// Full paths, not the short name 'three': some tablets and older browsers do not apply the page's import map, and then the
// short name cannot be found and the whole scene never starts.
import * as THREE from '/vendor/three-r160/build/three.module.js';
import { OrbitControls } from '/vendor/three-r160/examples/jsm/controls/OrbitControls.js';

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
  age: { min: 36, max: 44, unit: 'years', unitEl: 'έτη', ends: [['younger', 'νεότεροι'], ['older', 'μεγαλύτεροι']], st: [[0, 110, 205, 190], [.5, 235, 225, 150], [1, 235, 130, 150]] },
  qdepth: { min: 0, max: 70, unit: 'km', ends: [['shallow', 'ρηχά'], ['deep', 'βαθιά']], st: [[0, 255, 214, 120], [.4, 240, 130, 90], [1, 150, 80, 190]] },
  built: { min: 0, max: 100, unit: '%', top: true, st: [[0, 24, 30, 48], [.35, 110, 96, 170], [.7, 196, 184, 255], [1, 255, 250, 235]] },
  no2: { min: 0, max: 80, unit: 'µg/m³', st: [[0, 40, 60, 110], [.4, 120, 150, 235], [.75, 240, 170, 120], [1, 255, 90, 80]] },
  o3: { min: 0, max: 160, unit: 'µg/m³', st: [[0, 40, 60, 110], [.4, 100, 190, 200], [.75, 235, 220, 130], [1, 255, 120, 80]] },
  aod: { min: 0, max: 0.6, unit: '', top: false, st: [[0, 60, 70, 100], [.5, 255, 215, 168], [1, 255, 150, 90]] },
};
const SCALE_NAME = { sst: ['Sea-surface temperature', 'Θερμοκρασία επιφάνειας θάλασσας'], temp: ['Air temperature', 'Θερμοκρασία αέρα'], pm25: ['Fine particles PM2.5', 'Λεπτά σωματίδια PM2.5'],
  wind: ['Wind speed', 'Ταχύτητα ανέμου'], rain: ['Rain in the hour', 'Βροχή μέσα στην ώρα'], cloud: ['Cloud cover', 'Νεφοκάλυψη'], depth: ['Depth of the sea floor', 'Βάθος του βυθού'],
  age: ['Mean age of residents', 'Μέση ηλικία κατοίκων'], qdepth: ['Depth of the earthquake', 'Βάθος του σεισμού'], built: ['Ground under a building', 'Έδαφος κάτω από κτίριο'],
  no2: ['Nitrogen dioxide in the hour', 'Διοξείδιο του αζώτου την ώρα'], o3: ['Ozone in the hour', 'Όζον την ώρα'], aod: ['Aerosol optical depth at 500 nm, daily mean', 'Οπτικό βάθος αερολυμάτων στα 500 nm, ημερήσιος μέσος'] };
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
let seaF = null;                                                      // the sea temperature, filled in between the model's sea points
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
      c.lineWidth = .8 + hot; c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
      if (hot > .35) { c.fillStyle = 'rgba(235,252,255,' + (.35 + hot * .5).toFixed(3) + ')'; c.beginPath(); c.arc(nx, ny, .9 + hot * 1.1, 0, 7); c.fill(); } }   // a bright head on the faster lines, so the flow reads as moving light
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
const NO_DEPTH = () => (profiles() ? T('NO DEPTH GRID LOADED YET · ONLY THE THREE COLOURED LINES ARE DEPTHS', 'ΔΕΝ ΕΧΕΙ ΦΟΡΤΩΘΕΙ ΑΚΟΜΗ ΠΛΕΓΜΑ ΒΑΘΟΥΣ · ΜΟΝΟ ΟΙ ΤΡΕΙΣ ΧΡΩΜΑΤΙΣΤΕΣ ΓΡΑΜΜΕΣ ΕΙΝΑΙ ΒΑΘΗ')
  : T('NO DEPTH DATA LOADED YET · THE SEA FLOOR IS NOT DRAWN', 'ΔΕΝ ΕΧΟΥΝ ΦΟΡΤΩΘΕΙ ΑΚΟΜΗ ΔΕΔΟΜΕΝΑ ΒΑΘΟΥΣ · Ο ΒΥΘΟΣ ΔΕΝ ΣΧΕΔΙΑΖΕΤΑΙ'));
// Three real profiles already exist (the coast investigation cut them through the EMODnet model): 13 points along a line
// off three cities. They are drawn as they are, a dot per point coloured by its depth, hollow where the value was interpolated.
const profiles = () => (has('seabed-profiles') && (pd('seabed-profiles').features || []).length ? pd('seabed-profiles') : null);
function profileLines(c) { const p = profiles(); if (!p) return;
  p.features.forEach((f) => { const pts = (f.points || []).filter((q) => ok2(q) && typeof q.elevation === 'number'); if (pts.length < 2) return;
    c.strokeStyle = 'rgba(2,6,12,.9)'; c.lineWidth = 4 * U; c.lineCap = 'round'; c.beginPath(); pts.forEach((q, i) => { const [x, y] = pxOf(q.lng, q.lat); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
    pts.forEach((q) => { const [x, y] = pxOf(q.lng, q.lat), col = rgb(colOf(SCALE.depth, Math.max(0, -q.elevation)));
      if (q.interpolated) disc(c, x, y, 1.5 * U, 'rgba(4,10,18,.95)', col, .9 * U); else disc(c, x, y, 1.8 * U, col, '#ffffff', .6 * U); });
    const e = pts[pts.length - 1], [x, y] = pxOf(e.lng, e.lat); tinyText(c, f.name + ' · ' + nf(Math.round(Math.max(0, -e.elevation))) + ' m ' + T('deep, ', 'βάθος, ') + e.km + ' km ' + T('out', 'ανοιχτά'), x + 5 * U, y + 3 * U, 8.5 * U); });
}
function seabedPaint(c) {
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  c.fillStyle = 'rgba(5,13,24,.95)'; c.fillRect(0, 0, LW, LH);
  if (seabed) c.drawImage(depthC, 0, 0);
  landFill(c, '#0b1826'); islandFloor(); if (reliefC) c.drawImage(reliefC, 0, 0); coast(c); regionLabels(c);   // Cyprus keeps its drawn relief
  if (!seabed) hatch(c, '#2f7fb8');
  profileLines(c);
  if (!seabed) pill(c, NO_DEPTH(), '#8fd0f5', IY1 + 40 * U);
  else if (seabed.meta.testOnly) pill(c, T('TEST FIXTURE · NOT REAL DEPTHS', 'ΔΟΚΙΜΑΣΤΙΚΟ ΑΡΧΕΙΟ · ΟΧΙ ΠΡΑΓΜΑΤΙΚΑ ΒΑΘΗ'), '#F2A56B', IY1 + 40 * U);
}
async function loadSeabed() {
  await askStack('seabed-profiles');
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
// The sea colour: the temperature at the model's points, filled in between them (said on the sheet), kept to the sea only.
const seaBase = buf();
function seaField() { const c = seaBase.getContext('2d'); c.clearRect(0, 0, LW, LH); if (!seaF) return;
  paintField(c, seaF, (v) => colOf(SCALE.sst, v).concat(150));
  c.globalCompositeOperation = 'destination-out'; c.drawImage(landC, 0, 0); onIsl(c, () => { c.fillStyle = '#000'; c.fill(ISL); }); c.globalCompositeOperation = 'source-over'; }
function wavesPaint(c, t, anim) {
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  if (seaF) c.drawImage(seaBase, 0, 0);
  islandFloor(); if (reliefC) c.drawImage(reliefC, 0, 0);               // Cyprus keeps its drawn relief, the same as on the island sheet
  coast(c); if (withNames('waves')) regionLabels(c);
  if (seaF) frameOf(c, seaF, 'rgba(143,208,245,.4)');
  if (!seaPts.length) { pill(c, emptyWords(), '#8fd0f5'); return; }
  c.lineCap = 'round';
  seaPts.forEach((p) => { const [x, y] = pxOf(p.lng, p.lat);
    if (!isSea(x, y)) return;                                          // a sea model has nothing to say on land
    if (p.wave != null) { const hgt = Math.min(4, Math.max(0, p.wave));
      if (p.dir != null && p.period != null && p.period > 0) {
        const b = ((p.dir + 180) % 360) * Math.PI / 180, dx = Math.sin(b), dy = -Math.cos(b);   // the feed says where waves come FROM; they travel the other way
        const gap = waveGap(p.period), half = 12 + hgt * 9, reach = gap * 3.6, ph = anim ? (t / p.period) % 1 : 0;   // one crest passes the dot every wave period
        for (let k = -5; k <= 5; k++) { const s = (k + ph) * gap; if (Math.abs(s) > reach) continue;
          const cx = x + dx * s, cy = y + dy * s; if (!isSea(cx, cy)) continue;
          c.strokeStyle = `rgba(${WAVE_COL},${(.18 + .6 * (1 - Math.abs(s) / reach)).toFixed(3)})`; c.lineWidth = 1.2 + hgt * .8;
          c.beginPath(); c.moveTo(cx + dy * half, cy - dx * half); c.quadraticCurveTo(cx + dx * half * .4, cy + dy * half * .4, cx - dy * half, cy + dx * half); c.stroke(); }
        if (!anim) arrow(c, x + dx * (reach + 3), y + dy * (reach + 3), Math.atan2(dy, dx), 9, `rgba(${WAVE_COL},.95)`, 1.5);
      } else {                                                         // no direction or period in the feed: a ring that stands still, wider for higher waves
        c.strokeStyle = `rgba(${WAVE_COL},.9)`; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, 4 + Math.min(3, hgt) * 8, 0, 7); c.stroke(); } }
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.6; c.beginPath(); c.arc(x, y, 4, 0, 7); c.stroke();      // a ring on every model point
    if (withNames('waves')) {                                           // the numbers only when this sheet is shown alone: a full stack stays readable
      if (p.sst != null) tinyText(c, fmt(p.sst) + '°', x + 7, y - 6);
      if (p.wave != null) tinyText(c, fmt(p.wave) + ' m' + (p.period != null ? ' · ' + fmt(p.period) + ' s' : ''), x + 7, y + 13); } });
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
const AC = { every: 20000, oldMs: 90000, ftStep: 10000, yStep: 11, driftMaxS: 25 };   // 10,000 ft lifts an arrow 11 units: 45,000 ft is still under the next sheet
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


/* ---- sheets fed by GET /api/stack/<id> (the contract is docs/STACK-DATA.md) ---- */
// The server builds one map-ready answer per dataset. A sheet names the answers it needs (stack: 'id' or ['id', 'id']) and
// gives one draw function; everything else is done here, the same way for every such sheet:
//   - the answer is fetched only when the sheet is first switched on, and again no sooner than its own refreshSeconds;
//   - `honesty` is shown in the key word for word, `attribution` beside the source, `reason` when there is no data;
//   - `demo: true` puts "demo data" on the sheet and in the key; `available: false` leaves the sheet empty, with the reason;
//   - only a live, delayed or scheduled answer may keep moving. Anything else may reveal itself once and must then stand still.
const SD = {}, SDat = {};                                              // answer id -> the answer as it arrived; and when it was asked for
const pd = (id) => (SD[id] && !SD[id].failed ? SD[id] : null);
const has = (id) => { const p = pd(id); return !!p && p.available !== false; };
const idsOf = (l) => [].concat(l.stack);
async function askStack(id) {
  const old = pd(id), pace = old && typeof old.refreshSeconds === 'number' && old.refreshSeconds > 0 ? old.refreshSeconds * 1000 : 0;
  if (old && (!pace || Date.now() - SDat[id] < pace - 500)) return;   // it never changes, or it is not due yet: never ask more often than the answer says
  try { const r = await fetch('/api/stack/' + id, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); if (!j || j.id !== id) throw new Error('not the answer asked for'); SD[id] = j; SDat[id] = Date.now(); window.__stackAsks = (window.__stackAsks || 0) + 1; }
  catch (e) { if (!old) SD[id] = { failed: true }; console.warn('The stack answer "' + id + '" could not be read: ' + String((e && e.message) || e)); }
}
async function loadStack(l) {
  await Promise.all(idsOf(l).map(askStack));
  const secs = idsOf(l).map((id) => pd(id) && pd(id).refreshSeconds).filter((v) => typeof v === 'number' && v > 0);
  l.every = secs.length ? Math.max(30, Math.min(...secs)) * 1000 : 0;
  l.base = null; if (l.ready) l.ready(...idsOf(l).map((id) => (has(id) ? pd(id) : null)));
  l.asked = true;
}
// A reveal: the marks of a sheet appear once, in a stated order, when it is opened; then nothing moves. Returns 0..1.
function rev(l, t, anim) { if (!anim) { l.revealDone = true; return 1; } if (l.revealFrom == null) l.revealFrom = t;
  const k = clamp01((t - l.revealFrom) / (l.reveal || 2)); if (k >= 1) l.revealDone = true; return k; }
const restartReveal = (l) => { l.revealFrom = null; l.revealDone = false; };
const stepIn = (k, i, n) => clamp01(k * n - i);                         // mark i of n in a reveal: 0 before its turn, 1 after
const KIND_RANK = ['scheduled', 'delayed', 'measured', 'published'];
const KIND_OF = { live: 'measured', delayed: 'delayed', scheduled: 'scheduled' };
const DEMO_SHEET = () => T('DEMO DATA · MADE-UP VALUES', 'ΔΟΚΙΜΑΣΤΙΚΑ ΔΕΔΟΜΕΝΑ · ΦΤΙΑΧΤΕΣ ΤΙΜΕΣ');
const NO_STACK = () => T('NO DATA FOR THIS SHEET RIGHT NOW · THE KEY SAYS WHY', 'ΧΩΡΙΣ ΔΕΔΟΜΕΝΑ ΓΙΑ ΑΥΤΟ ΤΟ ΦΥΛΛΟ ΤΩΡΑ · ΤΟ ΥΠΟΜΝΗΜΑ ΛΕΕΙ ΓΙΑΤΙ');
const dayText = (iso) => { const d = new Date(iso); return isNaN(d) ? String(iso || '') : d.toLocaleDateString(EL ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const whenOf = (p) => (p.period ? T('period: ', 'περίοδος: ') + p.period : p.updated ? T('newest value: ', 'νεότερη τιμή: ') + ageText((Date.now() - Date.parse(p.updated)) / 60000) : '');
function stackState(l) {
  const ps = idsOf(l).map(pd);
  if (!ps.some(Boolean)) return none(l.asked ? T('The data of this sheet could not be read, so nothing is drawn on it.', 'Τα δεδομένα αυτού του φύλλου δεν διαβάστηκαν, άρα δεν σχεδιάζεται τίποτα πάνω του.') : T('Not asked for yet: the data is fetched when the sheet is first switched on.', 'Δεν ζητήθηκαν ακόμη: τα δεδομένα φορτώνονται όταν ανάψεις το φύλλο για πρώτη φορά.'));
  const got = ps.filter((p) => p && p.available !== false);
  if (!got.length) return none(ps.filter(Boolean).map((p) => TT(p.reason)).join(' '));
  const demo = got.some((p) => p.demo === true), kinds = got.map((p) => KIND_OF[p.kind] || 'published');
  const text = (demo ? T('Demo data: the values on this sheet are made up by the test mode, not real. ', 'Δοκιμαστικά δεδομένα: οι τιμές σε αυτό το φύλλο είναι φτιαχτές από τη δοκιμαστική λειτουργία, όχι πραγματικές. ') : '')
    + got.map((p) => T(p.attribution, p.attributionEl || p.attribution) + (whenOf(p) ? ' · ' + whenOf(p) : '')).join(' · ');
  return { kind: demo ? 'demo' : KIND_RANK.find((k) => kinds.includes(k)), text };
}
const KIND_CARD = { measured: ['measured', 'μετρημένο'], scheduled: ['timetable', 'δρομολόγιο'], delayed: ['delayed', 'με καθυστέρηση'], published: ['published', 'δημοσιευμένα'], demo: ['DEMO · not real', 'ΔΟΚΙΜΗ · όχι πραγματικά'] };
function stackCard(l) { const st = stackState(l);
  if (st.kind === 'none') return { b: '—', em: l.asked ? T('no data now', 'χωρίς δεδομένα τώρα') : T('switch on to load', 'άναψέ το για φόρτωση'), cls: 'year' };
  const n = l.count ? l.count(...idsOf(l).map((id) => (has(id) ? pd(id) : null))) : null;
  return { b: n == null ? '✓' : nf(n), em: (l.countWord ? TT(l.countWord) + ' · ' : '') + TT(KIND_CARD[st.kind]), cls: st.kind === 'measured' ? 'live' : 'year' }; }
// what every /api/stack sheet does before and after its own drawing
function paintStack(l) { return (c, t, anim, dt) => {
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  coast(c); if (withNames(l.id) && typeof l.win !== 'string') regionLabels(c);   // a sheet that covers Cyprus only has no room for the neighbours' names
  const ids = idsOf(l), ps = ids.map(pd);
  if (!ps.some(Boolean)) { pill(c, l.asked ? T('THE DATA OF THIS SHEET COULD NOT BE READ', 'ΤΑ ΔΕΔΟΜΕΝΑ ΑΥΤΟΥ ΤΟΥ ΦΥΛΛΟΥ ΔΕΝ ΔΙΑΒΑΣΤΗΚΑΝ') : T('LOADING…', 'ΦΟΡΤΩΝΕΙ…'), l.c); l.revealDone = true; return; }
  if (!ids.some(has)) { hatch(c, l.c); pill(c, NO_STACK(), l.c); l.revealDone = true; return; }
  l.draw(c, t, anim, l, ...ids.map((id) => (has(id) ? pd(id) : null)));
  if (ps.some((p) => p && p.available !== false && p.demo === true)) pill(c, DEMO_SHEET(), '#F2A56B', IY0 - 42 * U);
}; }
// A picture that does not change between two answers is drawn once and kept, so a moving sheet only redraws what moves.
function cached(l, c, fn) { const cv = c.canvas;
  if (!l.base || l.base.width !== cv.width || l.base.height !== cv.height) { l.base = document.createElement('canvas'); l.base.width = cv.width; l.base.height = cv.height;
    const b = l.base.getContext('2d'); b.setTransform(c.getTransform()); fn(b); }
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(l.base, 0, 0); c.restore(); }
const ok2 = (f) => f && typeof f.lat === 'number' && typeof f.lng === 'number' && isFinite(f.lat) && isFinite(f.lng);
const mono = (px, w) => `${w || 700} ${(px * U).toFixed(1)}px ui-monospace, Menlo, monospace`;
const disc = (c, x, y, r, fill, stroke, lw) => { c.beginPath(); c.arc(x, y, r, 0, 7); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); } };
const areaR = (v, ref, rRef) => Math.sqrt(Math.max(0, v) / ref) * rRef * U;   // a circle whose AREA grows with the value
// A small panel of figures in the open water south of Cyprus, for the sheets that replay a past period: one row per place,
// one box per step of time, so the whole period can be read at once (and with reduced motion that is the whole picture).
const PANEL_AT = () => pxOf(32.3, 34.33);
function stripPanel(c, colour, title, rows, opt) {
  const [bx, by] = PANEL_AT(), n = rows.length ? rows[0].cells.length : 0, nameW = (opt.nameW || 118) * U, bw = (opt.boxW || 5) * U, rowH = 12 * U;
  const pw = nameW + n * bw + 22 * U, ph = (30 + rows.length * 12 + (opt.foot ? 14 : 0)) * U;
  c.fillStyle = 'rgba(4,10,18,.88)'; c.strokeStyle = colour; c.lineWidth = 1; c.beginPath();
  if (c.roundRect) c.roundRect(bx - 8 * U, by - 8 * U, pw, ph, 7 * U); else c.rect(bx - 8 * U, by - 8 * U, pw, ph); c.fill(); c.stroke();
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = mono(8.5, 800); c.fillStyle = colour; c.fillText(title, bx, by + 4 * U, pw - 16 * U);
  rows.forEach((row, ri) => { const y = by + (20 + ri * 12) * U;
    c.font = mono(8, 700); c.fillStyle = '#eaf2fb'; c.fillText(row.name, bx, y, nameW - 6 * U);
    row.cells.forEach((col, i) => { const x = bx + nameW + i * bw;
      if (col) { c.fillStyle = col; c.fillRect(x, y - 4 * U, bw - .6 * U, 8 * U); } else { c.strokeStyle = 'rgba(160,180,205,.45)'; c.lineWidth = .6; c.strokeRect(x + .3, y - 4 * U + .3, bw - 1.2 * U, 8 * U - .6); } }); });
  if (opt.cursor != null) { const x = bx + nameW + opt.cursor * bw; c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.strokeRect(x - .6, by + 13 * U, bw + .4, rows.length * rowH + 2 * U); }
  if (opt.foot) { c.font = mono(7.5, 700); c.fillStyle = '#8fa9c4'; c.fillText(opt.foot, bx, by + (22 + rows.length * 12) * U + 4 * U, pw - 16 * U); }
}
// the big line of words that a replay must always carry: what moment of the past is on show
function replayClock(c, colour, text) { c.save(); c.font = mono(11, 800); c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(text).width + 18 * U, x = ICX, y = IY0 - 8 * U; c.fillStyle = 'rgba(4,10,18,.9)'; c.strokeStyle = colour; c.lineWidth = 1;
  c.beginPath(); if (c.roundRect) c.roundRect(x - w / 2, y - 9 * U, w, 18 * U, 6 * U); else c.rect(x - w / 2, y - 9 * U, w, 18 * U); c.fill(); c.stroke();
  c.fillStyle = colour; c.fillText(text, x, y + .5); c.restore(); }
// a reference mark drawn on the sheet itself, so a size can be read without the key
function refNote(c, x, y, text) { c.save(); c.font = mono(8, 700); c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineWidth = 2.2; c.strokeStyle = 'rgba(2,6,12,.9)'; c.strokeText(text, x, y); c.fillStyle = '#cfe0f0'; c.fillText(text, x, y); c.restore(); }

/* ---- residents and their age: the census of 1 October 2021. Nothing here moves after the sheet has opened. ---- */
const levelOf = (l, p) => (l.mode === 'districts' ? p.districts : p.features).filter(ok2);
const POP_REF = [25000, 50000, 100000];
function drawPopulation(c, t, anim, l, p) {
  const list = levelOf(l, p).filter((f) => typeof f.residents === 'number').slice().sort((a, b) => a.residents - b.residents), k = rev(l, t, anim);   // the order of the reveal only
  list.forEach((f, i) => { const a = stepIn(k, i, list.length); if (a <= 0) return; const [x, y] = pxOf(f.lng, f.lat), r = areaR(f.residents, 100000, 15);
    c.globalAlpha = a; disc(c, x, y, r, 'rgba(196,184,255,.32)', '#C4B8FF', 1.4 * U); disc(c, x, y, 1.6 * U, '#ffffff');
    tinyText(c, TT(f.name) + ' · ' + nf(f.residents), x + r * .72 + 3 * U, y - r * .72 - 2 * U, 9 * U); c.globalAlpha = 1; });
  const [lx, ly] = ipx(-.1, 1.08);                                      // the three reference circles, in the sea below the island
  POP_REF.forEach((v, i) => { const r = areaR(v, 100000, 15), x = lx + (i * 78 + 10) * U; disc(c, x, ly, r, null, 'rgba(196,184,255,.85)', 1 * U); refNote(c, x + r + 3 * U, ly, nf(v)); });
  refNote(c, lx, ly + 22 * U, T('circle area = residents on 1 October 2021', 'εμβαδόν κύκλου = κάτοικοι την 1η Οκτωβρίου 2021'));
}
const AGE_PART = ['#7fd6c2', '#b9c2d6', '#f09aa8'];                     // under 15, 15 to 64, 65 and over
function drawAge(c, t, anim, l, p) {
  const list = levelOf(l, p).slice().sort((a, b) => (a.meanAge == null ? 1e9 : a.meanAge) - (b.meanAge == null ? 1e9 : b.meanAge)), k = rev(l, t, anim);
  list.forEach((f, i) => { const a = stepIn(k, i, list.length); if (a <= 0) return; const [x, y] = pxOf(f.lng, f.lat);
    c.globalAlpha = a;
    if (f.meanAge == null) { disc(c, x, y, 7 * U, null, '#b9c2d6', 1.3 * U); tinyText(c, TT(f.name) + ' · ' + T('too few residents', 'πολύ λίγοι κάτοικοι'), x + 10 * U, y - 6 * U, 9 * U); c.globalAlpha = 1; return; }
    disc(c, x, y, 7 * U, rgb(colOf(SCALE.age, f.meanAge)), 'rgba(2,6,12,.95)', 1.2 * U);
    tinyText(c, TT(f.name) + ' · ' + fmt(f.meanAge) + ' ' + T('y', 'έτη'), x + 10 * U, y - 6 * U, 9 * U);
    const parts = [f.under15Percent, f.age15to64Percent, f.age65plusPercent];
    if (parts.every((v) => typeof v === 'number')) { let bx = x + 10 * U; const w = 48 * U;
      parts.forEach((v, j) => { c.fillStyle = AGE_PART[j]; c.fillRect(bx, y + 2 * U, w * v / 100, 5 * U); bx += w * v / 100; });
      tinyText(c, Math.round(parts[0]) + ' · ' + Math.round(parts[1]) + ' · ' + Math.round(parts[2]) + ' %', x + 10 * U + w + 4 * U, y + 7 * U, 8 * U); }
    c.globalAlpha = 1; });
  const [lx, ly] = ipx(-.1, 1.1); [['under 15', 'κάτω των 15'], ['15 to 64', '15 έως 64'], ['65 and over', '65 και άνω']].forEach((w, j) => { c.fillStyle = AGE_PART[j]; c.fillRect(lx + j * 86 * U, ly - 3 * U, 9 * U, 6 * U); refNote(c, lx + j * 86 * U + 12 * U, ly, TT(w)); });
}

/* ---- built-up ground: four boxes of 1.8 km, at their true size. They are tiny on this map, so the key offers to fly in. ---- */
const bPatch = {};                                                     // city key -> { cv, tex, mesh, order }
function readyBuildings(p) {
  const s = sheetOf.buildings; Object.keys(bPatch).forEach((k) => { s.group.remove(bPatch[k].mesh); bPatch[k].mesh.geometry.dispose(); bPatch[k].tex.dispose(); bPatch[k].mesh.material.dispose(); delete bPatch[k]; });
  if (!p) return;
  (p.features || []).forEach((f) => { const b = f.box; if (!f.available || !b || !Array.isArray(f.share) || f.share.length !== f.cols * f.rows) return;
    const cv = document.createElement('canvas'); cv.width = f.cols * 8; cv.height = f.rows * 8;
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter;
    const a = p3(b.west, b.north, 0), z = p3(b.east, b.south, 0);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(z.x - a.x, z.z - a.z), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set((a.x + z.x) / 2, s.y + .35, (a.z + z.z) / 2); s.group.add(mesh);
    bPatch[f.key] = { cv, tex, mesh, order: f.share.map((v, i) => i).sort((i, j) => f.share[i] - f.share[j]) }; });
}
function drawBuildings(c, t, anim, l, p) {
  const k = rev(l, t, anim);
  (p.features || []).forEach((f) => { const q = bPatch[f.key], ce = f.centre; if (!ce) return; const [x, y] = pxOf(ce.lng, ce.lat);
    disc(c, x, y, 9 * U, null, 'rgba(196,184,255,.9)', 1.2 * U);        // a ring to find the box by; the box itself is the small square inside it, at true size
    tinyText(c, TT(f.name) + (q ? ' · ' + fmt(f.coveredPercent) + ' % ' + T('of the box built on', 'του τετραγώνου χτισμένο') : ' · ' + T('no data', 'χωρίς δεδομένα')), x + 12 * U, y - 6 * U, 9 * U);
    if (!q) return;
    const g = q.cv.getContext('2d'), n = q.order.length; g.clearRect(0, 0, q.cv.width, q.cv.height);
    q.order.forEach((ci, oi) => { const a = stepIn(k, oi, n) > 0 ? 1 : 0; if (!a) return;     // cells appear from the emptiest to the fullest, then stand
      const col = colOf(SCALE.built, f.share[ci]); g.fillStyle = rgb(col, .96); g.fillRect((ci % f.cols) * 8, (f.rows - 1 - Math.floor(ci / f.cols)) * 8, 7.4, 7.4); });
    q.tex.needsUpdate = true; });
  const [lx, ly] = ipx(-.1, 1.08); refNote(c, lx, ly, T('each ring holds one box of 1.8 km, drawn at its true size · use "fly to" in the key', 'κάθε δαχτυλίδι έχει ένα τετράγωνο 1,8 km στο πραγματικό του μέγεθος · πάτα "πέτα σε" στο υπόμνημα'));
}

/* ---- buses: the lines and stops of the timetable files, and where each bus should be by the timetable. Nobody saw these buses. ---- */
function alongPath(path, s) {                                           // path = [[seconds from `at`, lat, lng], ...]
  if (!Array.isArray(path) || !path.length || s > path[path.length - 1][0]) return null;   // past its last point: it is not drawn until the next answer
  if (s <= path[0][0]) return [path[0][1], path[0][2]];
  for (let i = 1; i < path.length; i++) if (s <= path[i][0]) { const a = path[i - 1], b = path[i], f = b[0] === a[0] ? 1 : (s - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
  return null;
}
let busMarks = [];
function drawBuses(c, t, anim, l, net, now) {
  cached(l, c, (b) => { if (!net) return;
    b.lineJoin = 'round'; b.lineCap = 'round';
    (net.lines || []).forEach((ln) => { const a = ln.line; if (!Array.isArray(a) || a.length < 4) return;
      b.beginPath(); for (let i = 0; i + 1 < a.length; i += 2) { const [x, y] = pxOf(a[i + 1], a[i]); if (i) b.lineTo(x, y); else b.moveTo(x, y); }
      b.setLineDash(ln.drawn === 'stops' ? [3 * U, 2.5 * U] : []); b.strokeStyle = 'rgba(160,214,180,.8)'; b.lineWidth = .9 * U; b.stroke(); });
    b.setLineDash([]); const sp = (net.stops && net.stops.points) || []; b.fillStyle = 'rgba(226,246,232,.9)';
    for (let i = 0; i + 1 < sp.length; i += 2) { const [x, y] = pxOf(sp[i + 1], sp[i]); b.fillRect(x - .7 * U, y - .7 * U, 1.4 * U, 1.4 * U); } });
  busMarks = [];
  if (now) { const s = (Date.now() - Date.parse(now.at)) / 1000, h = 2.6 * U;
    (now.trips || []).forEach((tr) => { const at = alongPath(tr.path, s); if (!at) return; const [x, y] = pxOf(at[1], at[0]); busMarks.push([at[0], at[1]]);
      c.fillStyle = 'rgba(4,10,18,.85)'; c.fillRect(x - h, y - h, 2 * h, 2 * h); c.strokeStyle = '#ffffff'; c.lineWidth = 1.1 * U; c.strokeRect(x - h, y - h, 2 * h, 2 * h); });   // hollow: a planned place, not a seen one
    replayClock(c, '#a0d6b4', T('TIMETABLE · ', 'ΔΡΟΜΟΛΟΓΙΟ · ') + TT(now.dayType).toUpperCase() + ' ' + now.cyprusTime + ' · ' + T(busMarks.length + ' planned buses drawn', busMarks.length + ' προγραμματισμένα λεωφορεία')); }
  else replayClock(c, '#a0d6b4', T('LINES AND STOPS ONLY · NO TIMETABLE FOR THIS MINUTE', 'ΜΟΝΟ ΓΡΑΜΜΕΣ ΚΑΙ ΣΤΑΣΕΙΣ · ΧΩΡΙΣ ΔΡΟΜΟΛΟΓΙΟ ΓΙΑ ΑΥΤΟ ΤΟ ΛΕΠΤΟ'));
}

/* ---- our own sensor vehicles: a replay of where they were at least two hours ago, on the 1 km grid the server rounds to ---- */
// Nothing here is finer than the answer: a mark sits exactly on a grid point of the trail and jumps from one to the next
// (it is never eased to a place in between), and no line is drawn from point to point, so a silence is simply a gap.
const VEH = { loopS: 80, gapS: 45 * 60, tailS: 3 * 3600 };
let vehMarks = [], vehClock = null;
function drawVehicles(c, t, anim, l, p) {
  const vs = (p.vehicles || []).filter((v) => Array.isArray(v.trail) && v.trail.length), g = p.gridDegrees || .01;
  vehMarks = []; if (!vs.length) { pill(c, T('NO VEHICLE HAS A TRAIL OLD ENOUGH TO SHOW', 'ΚΑΝΕΝΑ ΟΧΗΜΑ ΔΕΝ ΕΧΕΙ ΔΙΑΔΡΟΜΗ ΑΡΚΕΤΑ ΠΑΛΙΑ ΓΙΑ ΝΑ ΦΑΝΕΙ'), l.c); return; }
  const t0 = Math.min(...vs.map((v) => v.trail[0][0])), t1 = Math.max(...vs.map((v) => v.trail[v.trail.length - 1][0]));
  const now = anim ? t0 + ((t % VEH.loopS) / VEH.loopS) * (t1 - t0) : t1;   // the moment of the past that is on show
  const [ax, ay] = pxOf(33, 35), [bx2, by2] = pxOf(33 + g, 35 + g), hw = Math.max(1.4 * U, (bx2 - ax) / 2), hh = Math.max(1.4 * U, (ay - by2) / 2);
  const clockOf = (s) => new Date(s * 1000).toLocaleString(EL ? 'el-GR' : 'en-GB', { timeZone: 'Asia/Nicosia', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  vs.forEach((v) => { let last = null;
    v.trail.forEach((q) => { if (q[0] > now) return; last = q; const age = now - q[0]; if (anim && age > VEH.tailS) return;
      const [x, y] = pxOf(q[2], q[1]); c.fillStyle = `rgba(255,214,150,${(anim ? .1 + .28 * (1 - age / VEH.tailS) : .2).toFixed(3)})`; c.fillRect(x - hw, y - hh, 2 * hw, 2 * hh); });
    if (!last || now - last[0] > VEH.gapS) return;                      // silent for more than 45 minutes: no mark, until it speaks again
    const [x, y] = pxOf(last[2], last[1]); vehMarks.push({ n: v.n, type: v.type, lat: last[1], lng: last[2], at: last[0] });
    if (v.type === 'bus') { c.fillStyle = '#ffd696'; c.fillRect(x - hw, y - hh, 2 * hw, 2 * hh); c.strokeStyle = 'rgba(2,6,12,.95)'; c.lineWidth = .8 * U; c.strokeRect(x - hw, y - hh, 2 * hw, 2 * hh); }
    else { c.fillStyle = 'rgba(4,10,18,.8)'; c.fillRect(x - hw, y - hh, 2 * hw, 2 * hh); c.strokeStyle = '#ffd696'; c.lineWidth = 1.1 * U; c.strokeRect(x - hw, y - hh, 2 * hw, 2 * hh); } });
  vehClock = now;
  replayClock(c, '#ffd696', (anim ? T('REPLAY · ', 'ΕΠΑΝΑΛΗΨΗ · ') + clockOf(now) : T('STILL · UP TO ', 'ΑΚΙΝΗΤΟ · ΕΩΣ ') + clockOf(t1)) + T(' · AT LEAST ' + p.delayMinutes + ' MIN AGO', ' · ΤΟΥΛΑΧΙΣΤΟΝ ' + p.delayMinutes + ' ΛΕΠΤΑ ΠΡΙΝ'));
  const [lx, ly] = ipx(-.1, 1.08); c.fillStyle = '#ffd696'; c.fillRect(lx, ly - hh, 2 * hw, 2 * hh); refNote(c, lx + 2 * hw + 4 * U, ly, T('one square = about ' + (p.gridKm || 1) + ' km · filled: bus · hollow: car', 'ένα τετράγωνο = περίπου ' + (p.gridKm || 1) + ' km · γεμάτο: λεωφορείο · κενό: αυτοκίνητο'));
}

/* ---- earthquakes: a catalogue of past events. Each ripples once, in date order, when the sheet opens; then they stand. ---- */
const quakeR = (m) => (4 + Math.max(0, m - 4.5) * 13) * U;
function drawQuakes(c, t, anim, l, p) {
  const list = (p.features || []).filter(ok2), n = list.length, k = rev(l, t, anim);
  list.forEach((f, i) => { const a = k * n - i; if (a <= 0) return; const [x, y] = pxOf(f.lng, f.lat), r = quakeR(f.magnitude), col = colOf(SCALE.qdepth, f.depthKm);
    if (a < 1.6 && k < 1) { c.strokeStyle = rgb(col, (.9 * (1 - a / 1.6)).toFixed(3)); c.lineWidth = 1.6 * U; c.beginPath(); c.arc(x, y, r * (.3 + a * 1.5), 0, 7); c.stroke(); }   // its one ripple
    disc(c, x, y, r, rgb(col, .16), rgb(col, .95), 1.3 * U); disc(c, x, y, 1.7 * U, rgb(col), 'rgba(2,6,12,.9)', .6 * U);
    if (withNames(l.id) || n <= 20) tinyText(c, 'M' + f.magnitude + ' ' + (f.magnitudeType || '') + ' · ' + String(f.time).slice(0, 10), x + r + 2 * U, y + (i % 2 ? 9 : -5) * U, 7.5 * U); });
  const [lx, ly] = pxOf(32.02, 34.08); [4.5, 5, 5.5].forEach((m, i) => { const x = lx + i * 62 * U + 12 * U; disc(c, x, ly, quakeR(m), null, 'rgba(255,214,120,.9)', 1 * U); refNote(c, x + quakeR(m) + 3 * U, ly, 'M' + m); });
}

/* ---- fire: heat seen from space in the last 24 hours, and burnt land mapped in the last 30 days ---- */
function drawHotspots(c, t, anim, l, p) {
  const list = (p.features || []).filter(ok2), now = Date.now(); l.live = list.length > 0;
  if (!list.length) { pill(c, T('NO HOTSPOT SEEN IN THE LAST 24 HOURS · THAT IS NOT PROOF OF NO FIRE', 'ΚΑΜΙΑ ΘΕΡΜΗ ΚΗΛΙΔΑ ΤΙΣ ΤΕΛΕΥΤΑΙΕΣ 24 ΩΡΕΣ · ΑΥΤΟ ΔΕΝ ΑΠΟΔΕΙΚΝΥΕΙ ΟΤΙ ΔΕΝ ΥΠΑΡΧΕΙ ΦΩΤΙΑ'), l.c); return; }
  list.forEach((f, i) => { const [x, y] = pxOf(f.lng, f.lat), ageH = f.seen ? (now - Date.parse(f.seen)) / 3600000 : 24, fresh = clamp01(1 - ageH / 24);
    const glow = anim ? .75 + .25 * Math.sin(t * 1.2 + i) : 1;         // a slow glow, brighter for a newer sighting; it does not spread
    disc(c, x, y, 6 * U, `rgba(255,120,60,${(.12 + .3 * fresh * glow).toFixed(3)})`); disc(c, x, y, 2.4 * U, `rgba(255,${Math.round(150 + 80 * fresh)},90,${(.45 + .55 * fresh).toFixed(3)})`, 'rgba(2,6,12,.9)', .6 * U);
    if (f.seen) tinyText(c, ageText(ageH * 60), x + 5 * U, y - 4 * U, 7.5 * U); });
}
function drawBurnt(c, t, anim, l, p) {
  const list = (p.features || []).filter(ok2); rev(l, t, false);
  if (!list.length) { pill(c, T('NO BURNT AREA MAPPED IN THE LAST 30 DAYS', 'ΚΑΜΙΑ ΚΑΜΕΝΗ ΕΚΤΑΣΗ ΔΕΝ ΧΑΡΤΟΓΡΑΦΗΘΗΚΕ ΤΙΣ ΤΕΛΕΥΤΑΙΕΣ 30 ΗΜΕΡΕΣ'), l.c); return; }
  list.forEach((f) => { const [x, y] = pxOf(f.lng, f.lat), r = areaR(f.hectares || 0, 1000, 9);
    disc(c, x, y, Math.max(2 * U, r), 'rgba(170,110,80,.4)', '#d8a27c', 1.2 * U); tinyText(c, nf(Math.round(f.hectares || 0)) + ' ha', x + Math.max(2 * U, r) + 3 * U, y + 3 * U, 8 * U); });
  const [lx, ly] = ipx(-.1, 1.08); disc(c, lx + 10 * U, ly, areaR(1000, 1000, 9), null, '#d8a27c', 1 * U); refNote(c, lx + 24 * U, ly, T('1,000 ha · the circle is not the shape of the burn', '1.000 ha · ο κύκλος δεν είναι το σχήμα της καμένης έκτασης'));
}

/* ---- stations: official air quality (one value an hour), and the weather stations and airports (wind that blows) ---- */
const hhmm = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString(EL ? 'el-GR' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Nicosia' }); };
const BAR_PX = 34;                                                     // sheet pixels of the reference bar
function barAt(c, x, y, v, ref, colour) { const h = Math.min(2.2, v / ref) * BAR_PX * U; c.fillStyle = colour; c.fillRect(x - 2.2 * U, y - h, 4.4 * U, Math.max(1, h)); c.strokeStyle = 'rgba(2,6,12,.9)'; c.lineWidth = .6 * U; c.strokeRect(x - 2.2 * U, y - h, 4.4 * U, Math.max(1, h)); disc(c, x, y, 1.6 * U, '#ffffff', 'rgba(2,6,12,.9)', .5 * U); return h; }
function refBar(c, text, colour) { const [lx, ly] = ipx(-.1, 1.12); c.fillStyle = colour; c.fillRect(lx, ly - BAR_PX * U, 4.4 * U, BAR_PX * U); refNote(c, lx + 9 * U, ly - BAR_PX * U / 2, text); }
function drawAirStations(c, t, anim, l, p) {
  const key = l.mode === 'pm10' ? 'pm10' : 'pm25', ref = key === 'pm10' ? 100 : 50, list = (p.features || []).filter(ok2); rev(l, t, false);
  if (!list.length) { pill(c, T('NO STATION HAS REPORTED YET', 'ΚΑΝΕΝΑΣ ΣΤΑΘΜΟΣ ΔΕΝ ΕΧΕΙ ΑΝΑΦΕΡΕΙ ΑΚΟΜΗ'), l.c); return; }
  list.forEach((f) => { const [x, y] = pxOf(f.lng, f.lat), v = f[key];
    if (typeof v !== 'number') { disc(c, x, y, 2.4 * U, null, '#e3c8ff', 1 * U); return; }       // no value for this hour: a hollow dot, not a zero
    const h = barAt(c, x, y, v, ref, '#e3c8ff'); tinyText(c, fmt(v) + (f[key + 'HourEnds'] ? ' · ' + T('hour to ', 'ώρα έως ') + hhmm(f[key + 'HourEnds']) : ''), x + 5 * U, y - h + 3 * U, 7.5 * U); });
  refBar(c, ref + ' µg/m³ ' + (key === 'pm10' ? 'PM10' : 'PM2.5') + T(', mean of one hour', ', μέσος όρος μίας ώρας'), '#e3c8ff');
}
function windMark(c, x, y, f, t, anim, i) {                             // an arrow that points downwind; while it may move, dashes run along it at a pace that grows with the wind
  if (typeof f.wind !== 'number' || typeof f.windFrom !== 'number' || f.wind <= 0) return;
  const to = ((f.windFrom + 180) % 360) * Math.PI / 180, ang = Math.atan2(-Math.cos(to), Math.sin(to)), len = (8 + Math.min(15, f.wind) * 1.8) * U;
  arrow(c, x, y, ang, len, 'rgba(180,235,255,.95)', 1.5 * U);
  if (anim) { const ph = (t * f.wind * .12 + i * .37) % 1; disc(c, x + Math.cos(ang) * len * ph, y + Math.sin(ang) * len * ph, 1.5 * U, '#ffffff'); }
}
function drawMet(c, t, anim, l, met, air) {
  const st = met ? (met.features || []).filter(ok2) : [], ap = air ? (air.features || []).filter(ok2) : [];
  l.live = st.concat(ap).some((f) => typeof f.wind === 'number' && f.wind > 0);
  if (!st.length && !ap.length) { pill(c, T('NO STATION HAS REPORTED YET', 'ΚΑΝΕΝΑΣ ΣΤΑΘΜΟΣ ΔΕΝ ΕΧΕΙ ΑΝΑΦΕΡΕΙ ΑΚΟΜΗ'), l.c); return; }
  st.forEach((f, i) => { const [x, y] = pxOf(f.lng, f.lat); windMark(c, x, y, f, t, anim, i);
    disc(c, x, y, 3.2 * U, typeof f.temp === 'number' ? rgb(colOf(SCALE.temp, f.temp)) : 'rgba(4,10,18,.9)', typeof f.temp === 'number' ? 'rgba(2,6,12,.95)' : '#b4ebff', 1 * U);
    if (withNames(l.id) || st.length <= 12) tinyText(c, (typeof f.temp === 'number' ? fmt(f.temp) + '°' : '') + (typeof f.wind === 'number' ? ' ' + fmt(f.wind) + ' m/s' : '') + (f.rain10min ? ' ' + fmt(f.rain10min) + ' mm' : ''), x + 5 * U, y + 9 * U, 7.5 * U); });
  ap.forEach((f, i) => { const [x, y] = pxOf(f.lng, f.lat), r = 4.2 * U; windMark(c, x, y, f, t, anim, i + 5);
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath();     // an airport is a diamond
    c.fillStyle = typeof f.temp === 'number' ? rgb(colOf(SCALE.temp, f.temp)) : 'rgba(4,10,18,.9)'; c.fill(); c.strokeStyle = '#F7C46B'; c.lineWidth = 1.2 * U; c.stroke();
    tinyText(c, (typeof f.temp === 'number' ? fmt(f.temp) + '°' : '') + (typeof f.wind === 'number' ? ' ' + fmt(f.wind) + ' m/s' : '') + (f.time ? ' · ' + hhmm(f.time) : ''), x + 6 * U, y - 6 * U, 7.5 * U); });
}

/* ---- inventories and published labels: dots that appear once and stand ---- */
function drawEv(c, t, anim, l, p) { const a = rev(l, t, anim); c.globalAlpha = a;
  (p.features || []).filter(ok2).forEach((f) => { const [x, y] = pxOf(f.lng, f.lat), r = (1.2 + Math.sqrt(Math.max(1, f.connectors || 1)) * .9) * U;
    if (f.current === 'DC') { c.fillStyle = '#ffe27a'; c.fillRect(x - r, y - r, 2 * r, 2 * r); c.strokeStyle = 'rgba(2,6,12,.9)'; c.lineWidth = .5 * U; c.strokeRect(x - r, y - r, 2 * r, 2 * r); }
    else disc(c, x, y, r, '#8de4c0', 'rgba(2,6,12,.9)', .5 * U); });
  c.globalAlpha = 1; const [lx, ly] = ipx(-.1, 1.08); disc(c, lx + 3 * U, ly, 2.4 * U, '#8de4c0'); refNote(c, lx + 9 * U, ly, 'AC'); c.fillStyle = '#ffe27a'; c.fillRect(lx + 34 * U, ly - 2.4 * U, 4.8 * U, 4.8 * U); refNote(c, lx + 43 * U, ly, 'DC · ' + T('bigger = more connectors', 'μεγαλύτερο = περισσότερα βύσματα')); }
function drawCrossings(c, t, anim, l, p) { const a = rev(l, t, anim); c.globalAlpha = a;
  (p.features || []).filter(ok2).forEach((f) => { const [x, y] = pxOf(f.lng, f.lat); disc(c, x, y, 1.5 * U, '#ffb3d1', 'rgba(2,6,12,.85)', .4 * U); }); c.globalAlpha = 1; }
const BATH_COL = ['#7fe0ff', '#9be29b', '#ffe08a', '#ff9a8a', '#c9c9d6'];
function drawBathing(c, t, anim, l, p) { const a = rev(l, t, anim), labels = ((p.counts && p.counts.labels) || []).map((x) => x.label); c.globalAlpha = a;
  (p.features || []).filter(ok2).forEach((f) => { const [x, y] = pxOf(f.lng, f.lat), i = labels.indexOf(f.label); disc(c, x, y, 2.1 * U, BATH_COL[i < 0 ? 4 : Math.min(i, 4)], 'rgba(2,6,12,.9)', .5 * U); });
  c.globalAlpha = 1; const [lx, ly] = ipx(-.1, 1.08);
  ((p.counts && p.counts.labels) || []).slice(0, 5).forEach((x, i) => { disc(c, lx + 3 * U, ly + i * 11 * U, 2.4 * U, BATH_COL[Math.min(i, 4)]); refNote(c, lx + 9 * U, ly + i * 11 * U, String(x.label) + ' · ' + nf(x.sites) + ' ' + T('sites', 'σημεία') + ' · ' + T('season ', 'περίοδος ') + p.period); }); }
function drawFlood(c, t, anim, l, p) { const a = rev(l, t, anim), mode = l.mode || 'q100'; c.globalAlpha = a; c.lineJoin = 'round'; c.lineCap = 'round';
  (p.features || []).forEach((f) => { const n = f.polygons && typeof f.polygons[mode] === 'number' ? f.polygons[mode] : null;
    (f.lines || []).forEach((ln) => { c.beginPath(); for (let i = 0; i + 1 < ln.length; i += 2) { const [x, y] = pxOf(ln[i + 1], ln[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.setLineDash(n ? [] : [2 * U, 2 * U]); c.strokeStyle = n ? 'rgba(110,200,255,.95)' : 'rgba(150,170,190,.7)'; c.lineWidth = (n ? .9 + Math.sqrt(n) * .75 : .7) * U; c.stroke(); });
    if (withNames(l.id) && f.lines && f.lines[0] && f.lines[0].length > 1) { c.setLineDash([]); const [x, y] = pxOf(f.lines[0][1], f.lines[0][0]); tinyText(c, f.name + ' · ' + (n == null ? '–' : n), x + 3 * U, y - 3 * U, 7 * U); } });
  c.setLineDash([]); c.globalAlpha = 1; const [lx, ly] = ipx(-.1, 1.08);
  [1, 5, 13].forEach((n, i) => { c.strokeStyle = 'rgba(110,200,255,.95)'; c.lineWidth = (.9 + Math.sqrt(n) * .75) * U; c.beginPath(); c.moveTo(lx + i * 64 * U, ly); c.lineTo(lx + i * 64 * U + 22 * U, ly); c.stroke(); refNote(c, lx + i * 64 * U + 26 * U, ly, String(n)); });
  refNote(c, lx, ly + 12 * U, T('line weight = modelled flood areas touching the reach · dashed grey = none', 'πάχος γραμμής = περιοχές πλημμύρας από μοντέλο που αγγίζουν το τμήμα · διακεκομμένο γκρι = καμία')); }
function drawPermits(c, t, anim, l, p) { const a = rev(l, t, anim), list = (p.features || []).filter(ok2); c.globalAlpha = a;
  list.forEach((f) => { const [x, y] = pxOf(f.lng, f.lat), v = f.total && f.total.permits;
    if (typeof v !== 'number') { disc(c, x, y, 2.4 * U, null, '#ffcf9e', 1 * U); tinyText(c, TT(f.name) + ' · ' + T('not applicable', 'δεν εφαρμόζεται'), x + 6 * U, y + 3 * U, 8 * U); return; }
    const h = barAt(c, x, y, v, 200, '#ffcf9e'); tinyText(c, TT(f.name) + ' · ' + nf(v), x + 5 * U, y - h + 3 * U, 8 * U); });
  c.globalAlpha = 1; refBar(c, T('200 permits in the month (' + p.period + ')', '200 άδειες μέσα στον μήνα (' + p.period + ')'), '#ffcf9e'); }

/* ---- replays of a past period: a drought year, one day of air pollution, one month of haze. The date is always on the sheet. ---- */
const DR_COL = ['#3b6a8f', '#f3d36b', '#f09a4a', '#e2533f', '#7fd08a', '#9bd6c9', '#b6e08f'];   // one colour per class label; the number is a name, not a height
function drawDrought(c, t, anim, l, p) {
  const fs = (p.features || []).filter(ok2), n = (p.periods || []).length, at = anim && n ? Math.floor(t / 1.1) % n : null; if (!anim) l.revealDone = true;
  fs.forEach((f) => { const h = (f.cellDegrees || 1 / 24) / 2, [x0, y0] = pxOf(f.lng - h, f.lat + h), [x1, y1] = pxOf(f.lng + h, f.lat - h), k = at == null ? null : f.classes[at];
    if (k != null && DR_COL[k]) { c.fillStyle = DR_COL[k]; c.fillRect(x0, y0, x1 - x0, y1 - y0); }
    c.strokeStyle = '#ffffff'; c.lineWidth = .8 * U; c.strokeRect(x0, y0, x1 - x0, y1 - y0); tinyText(c, TT(f.name), x1 + 3 * U, y0 + 6 * U, 8 * U); });
  stripPanel(c, l.c, T('DROUGHT CLASS · 2022 · ONE BOX = TEN DAYS', 'ΚΑΤΗΓΟΡΙΑ ΞΗΡΑΣΙΑΣ · 2022 · ΕΝΑ ΚΟΥΤΙ = ΔΕΚΑ ΗΜΕΡΕΣ'), fs.map((f) => ({ name: TT(f.name), cells: f.classes.map((k) => DR_COL[k] || null) })), { cursor: at, boxW: 5.2, foot: T('JAN → DEC 2022 · an empty box = no value', 'ΙΑΝ → ΔΕΚ 2022 · άδειο κουτί = χωρίς τιμή') });
  const [lx, ly] = pxOf(32.3, 34.48); Object.keys(p.classes || {}).forEach((k, i) => { c.fillStyle = DR_COL[k] || '#888'; c.fillRect(lx + (i % 4) * 96 * U, ly + Math.floor(i / 4) * 11 * U - 3 * U, 7 * U, 6 * U); refNote(c, lx + (i % 4) * 96 * U + 10 * U, ly + Math.floor(i / 4) * 11 * U, TT(p.classes[k])); });
  replayClock(c, l.c, at == null ? T('2022 · THE WHOLE YEAR IS IN THE PANEL BELOW', '2022 · ΟΛΗ Η ΧΡΟΝΙΑ ΕΙΝΑΙ ΣΤΟΝ ΠΙΝΑΚΑ ΠΙΟ ΚΑΤΩ') : T('REPLAY OF 2022 · ', 'ΕΠΑΝΑΛΗΨΗ ΤΟΥ 2022 · ') + p.periods[at] + ' → ' + ((p.periodEnds || [])[at] || ''));
}
function drawAirDay(c, t, anim, l, p) {
  const key = l.mode === 'o3' ? 'o3' : 'no2', sc = SCALE[key], fs = (p.features || []).filter(ok2), n = (p.hours || []).length, at = anim && n ? Math.floor(t / 1.2) % n : null; if (!anim) l.revealDone = true;
  fs.forEach((f, i) => { const [x, y] = pxOf(f.lng, f.lat), v = at == null ? null : f[key][at];
    if (typeof v === 'number') barAt(c, x, y, v, sc.max / 2, rgb(colOf(sc, v))); else disc(c, x, y, 2 * U, null, '#d8c8ff', .9 * U);
    tinyText(c, String(i + 1), x + 4 * U, y + 8 * U, 7 * U); });
  stripPanel(c, l.c, (key === 'o3' ? 'O3' : 'NO2') + T(' · µg/m³ · 15 MAY 2024 · ONE BOX = ONE HOUR', ' · µg/m³ · 15 ΜΑΪΟΥ 2024 · ΕΝΑ ΚΟΥΤΙ = ΜΙΑ ΩΡΑ'), fs.map((f, i) => ({ name: (i + 1) + ' ' + TT(f.name), cells: f[key].map((v) => (typeof v === 'number' ? rgb(colOf(sc, v)) : null)) })), { cursor: at, boxW: 6.5, nameW: 150, foot: T('00:00 → 23:00 · an empty box = no value that hour', '00:00 → 23:00 · άδειο κουτί = χωρίς τιμή εκείνη την ώρα') });
  replayClock(c, l.c, at == null ? T('15 MAY 2024 · THE WHOLE DAY IS IN THE PANEL BELOW', '15 ΜΑΪΟΥ 2024 · ΟΛΗ Η ΜΕΡΑ ΕΙΝΑΙ ΣΤΟΝ ΠΙΝΑΚΑ ΠΙΟ ΚΑΤΩ') : T('REPLAY OF 15 MAY 2024 · ', 'ΕΠΑΝΑΛΗΨΗ ΤΗΣ 15ης ΜΑΪΟΥ 2024 · ') + String(p.hours[at]).slice(11, 16));
}
function drawAerosol(c, t, anim, l, p) {
  const fs = (p.features || []).filter(ok2), days = (fs[0] && fs[0].days) || [], withValue = days.map((d, i) => i).filter((i) => fs.some((f) => typeof f.aod[i] === 'number'));
  const at = anim && withValue.length ? withValue[Math.floor(t / 1.1) % withValue.length] : null; if (!anim) l.revealDone = true;     // a day with no value at either site is skipped, not filled
  fs.forEach((f) => { const [x, y] = pxOf(f.lng, f.lat), v = at == null ? null : f.aod[at];
    if (typeof v === 'number') { disc(c, x, y, areaR(v, .3, 11), rgb(colOf(SCALE.aod, v), .5), rgb(colOf(SCALE.aod, v)), 1.2 * U); tinyText(c, TT(f.name) + ' · AOD ' + v.toFixed(2), x + 13 * U, y - 5 * U, 8 * U); }
    else { disc(c, x, y, 3 * U, null, '#ffd7a8', 1 * U); tinyText(c, TT(f.name) + (at == null ? '' : ' · ' + T('no value this day', 'χωρίς τιμή αυτή τη μέρα')), x + 6 * U, y - 5 * U, 8 * U); } });
  stripPanel(c, l.c, T('AEROSOL OPTICAL DEPTH · JULY 2022 · ONE BOX = ONE DAY', 'ΟΠΤΙΚΟ ΒΑΘΟΣ ΑΕΡΟΛΥΜΑΤΩΝ · ΙΟΥΛΙΟΣ 2022 · ΕΝΑ ΚΟΥΤΙ = ΜΙΑ ΜΕΡΑ'), fs.map((f) => ({ name: TT(f.name), cells: f.aod.map((v) => (typeof v === 'number' ? rgb(colOf(SCALE.aod, v)) : null)) })), { cursor: at, boxW: 6, nameW: 124, foot: T('1 → 31 JULY 2022 · an empty box = no value that day', '1 → 31 ΙΟΥΛΙΟΥ 2022 · άδειο κουτί = χωρίς τιμή εκείνη τη μέρα') });
  replayClock(c, l.c, at == null ? T('JULY 2022 · THE WHOLE MONTH IS IN THE PANEL BELOW', 'ΙΟΥΛΙΟΣ 2022 · ΟΛΟΣ Ο ΜΗΝΑΣ ΕΙΝΑΙ ΣΤΟΝ ΠΙΝΑΚΑ ΠΙΟ ΚΑΤΩ') : T('REPLAY OF JULY 2022 · ', 'ΕΠΑΝΑΛΗΨΗ ΤΟΥ ΙΟΥΛΙΟΥ 2022 · ') + dayText(days[at]));
}
// what the tests read about these sheets
window.__stack = () => ({ answers: Object.keys(SD).filter((id) => pd(id)).map((id) => ({ id, available: pd(id).available !== false, demo: pd(id).demo === true, kind: pd(id).kind })), asked: Object.assign({}, SDat),
  buses: busMarks.slice(), vehicles: { marks: vehMarks.slice(), clock: vehClock }, patches: Object.keys(bPatch).map((k) => ({ key: k, w: bPatch[k].mesh.geometry.parameters.width, h: bPatch[k].mesh.geometry.parameters.height })) });

/* The sheets fed by /api/stack. Each is one object here and one draw function above; see the contract at the top of LAYERS. */
const LEVELS = [{ id: 'municipalities', name: ['Four municipalities', 'Τέσσερις δήμοι'] }, { id: 'districts', name: ['Five districts', 'Πέντε επαρχίες'] }];
const CENSUS_NEVER = ['Nothing moves. When the sheet opens the marks appear one after another, then they stand still: a census is one day in 2021, not something changing now.', 'Τίποτα δεν κινείται. Όταν ανοίγει το φύλλο τα σημάδια εμφανίζονται το ένα μετά το άλλο και μετά μένουν ακίνητα: η απογραφή είναι μία μέρα του 2021, όχι κάτι που αλλάζει τώρα.'];
const ONCE_NEVER = ['Nothing moves. The marks appear once when the sheet opens and then stand still: this is a published list, not something happening now.', 'Τίποτα δεν κινείται. Τα σημάδια εμφανίζονται μία φορά όταν ανοίγει το φύλλο και μετά μένουν ακίνητα: είναι δημοσιευμένος κατάλογος, όχι κάτι που συμβαίνει τώρα.'];
const PLACE_MARK = ['The circles stand at the centre of the main town, not over the whole area they count.', 'Οι κύκλοι στέκονται στο κέντρο της κύριας πόλης, όχι πάνω σε όλη την περιοχή που μετρούν.'];
const STACK_SHEETS = {
  bathing: { id: 'bathing', band: 'WATER', c: '#7fe0ff', stack: 'bathing-water', win: 'island', res: 2, moves: 'reveal', reveal: 1.2, name: ['Bathing water quality', 'Ποιότητα νερών κολύμβησης'], src: ['EEA · label of the 2025 season', 'ΕΟΠ · ετικέτα της περιόδου 2025'],
    height: ['THE SHORE', 'Η ΑΚΤΗ'], draw: drawBathing, count: (p) => p && p.counts && p.counts.sites, countWord: ['sites', 'σημεία'],
    info: { cap: ['The quality label each bathing site got for the 2025 season.', 'Η ετικέτα ποιότητας που πήρε κάθε σημείο κολύμβησης για την περίοδο 2025.'],
      unit: ['Dot colour = the label reported for the season (a label, not a number)', 'Χρώμα κουκκίδας = η ετικέτα που δηλώθηκε για την περίοδο (ετικέτα, όχι αριθμός)'], never: ONCE_NEVER,
      marks: () => { const p = pd('bathing-water'), ls = (p && p.counts && p.counts.labels) || []; return [[ls.map((x) => x.label + ': ' + x.sites + ' sites').join(' · ') + '. The list on the sheet shows every label that was reported.', ls.map((x) => x.label + ': ' + x.sites + ' σημεία').join(' · ') + '. Η λίστα πάνω στο φύλλο δείχνει κάθε ετικέτα που δηλώθηκε.'],
        ['A label sums up samples of a whole season. It is not a score and it does not say the water is safe today.', 'Η ετικέτα συνοψίζει δείγματα μιας ολόκληρης περιόδου. Δεν είναι βαθμός και δεν λέει ότι το νερό είναι ασφαλές σήμερα.']]; } } },
  flood: { id: 'flood', band: 'WATER', c: '#6ec8ff', stack: 'flood-reaches', win: 'island', res: 2, moves: 'reveal', reveal: 1.2, name: ['River reaches with flood scenarios', 'Τμήματα ποταμών με σενάρια πλημμύρας'], src: ['Water Development Department · modelled scenarios', 'Τμήμα Αναπτύξεως Υδάτων · σενάρια από μοντέλο'],
    height: ['RIVER BEDS', 'ΚΟΙΤΕΣ ΠΟΤΑΜΩΝ'], draw: drawFlood, count: (p) => p && p.features.length, countWord: ['reaches', 'τμήματα'],
    modes: () => ((pd('flood-reaches') || {}).scenarios || []).map((s) => ({ id: s.id, name: s.name })), mode: 'q100',
    info: { cap: ['River reaches the state has designated, and how many modelled flood areas touch each.', 'Τμήματα ποταμών που έχει ορίσει το κράτος, και πόσες περιοχές πλημμύρας από μοντέλο αγγίζουν το καθένα.'],
      unit: ['Line weight = number of flood-scenario polygons that touch the reach (a count)', 'Πάχος γραμμής = αριθμός πολυγώνων σεναρίου πλημμύρας που αγγίζουν το τμήμα (πλήθος)'],
      never: ['Nothing moves, on purpose: moving water would say a river is flooding. The lines appear once and stand still.', 'Τίποτα δεν κινείται, επίτηδες: νερό που κινείται θα έλεγε ότι ένας ποταμός πλημμυρίζει. Οι γραμμές εμφανίζονται μία φορά και μένουν ακίνητες.'],
      marks: [['One scenario is shown at a time: choose it with the buttons below. The count is not flooded area and not damage.', 'Φαίνεται ένα σενάριο κάθε φορά: διάλεξέ το με τα κουμπιά πιο κάτω. Το πλήθος δεν είναι πλημμυρισμένη έκταση ούτε ζημιά.'],
        ['A dashed grey line is a reach that no polygon of this scenario touches. Reservoirs are not drawn: their places are not in our files.', 'Μια διακεκομμένη γκρίζα γραμμή είναι τμήμα που δεν το αγγίζει κανένα πολύγωνο αυτού του σεναρίου. Τα φράγματα δεν σχεδιάζονται: οι θέσεις τους δεν υπάρχουν στα αρχεία μας.']] } },
  quakes: { id: 'quakes', band: 'GROUND', c: '#ffd678', stack: 'earthquakes', win: 'wide', res: 2, moves: 'reveal', reveal: 9, def: true, name: ['Earthquakes since 2015', 'Σεισμοί από το 2015'], src: ['USGS catalogue · past events', 'Κατάλογος USGS · παλιά γεγονότα'],
    height: ['UNDER THE GROUND', 'ΚΑΤΩ ΑΠΟ ΤΟ ΕΔΑΦΟΣ'], draw: drawQuakes, count: (p) => p && p.features.length, countWord: ['events', 'σεισμοί'],
    lines: () => (has('earthquakes') ? pd('earthquakes').features.map((f) => [String(f.time).slice(0, 10) + ' UTC', 'M' + f.magnitude + ' ' + (f.magnitudeType || '') + ' · ' + f.depthKm + ' km · ' + f.place, 'USGS']) : []),
    info: { scale: 'qdepth', cap: ['Earthquakes of magnitude 4.5 and above around Cyprus since 2015.', 'Σεισμοί μεγέθους 4,5 και πάνω γύρω από την Κύπρο από το 2015.'],
      unit: ['Ring size = magnitude (4.5 to 5.3 here; the type, mb or mww, is written beside each)', 'Μέγεθος δαχτυλιδιού = μέγεθος σεισμού (εδώ 4,5 έως 5,3· ο τύπος, mb ή mww, γράφεται δίπλα)'],
      move: ['When the sheet opens, each earthquake ripples once, in the order of its date. After that the rings stand still: this is a list of past events, and nothing here is shaking now.', 'Όταν ανοίγει το φύλλο, κάθε σεισμός κάνει έναν κυματισμό, με τη σειρά της ημερομηνίας του. Μετά τα δαχτυλίδια μένουν ακίνητα: είναι κατάλογος παλιών γεγονότων, και τίποτα εδώ δεν σείεται τώρα.'],
      rest: ['Nothing moves: every earthquake of the list stands as a ring. This is a list of past events.', 'Τίποτα δεν κινείται: κάθε σεισμός του καταλόγου στέκεται ως δαχτυλίδι. Είναι κατάλογος παλιών γεγονότων.'],
      marks: [['The colour is how deep under the ground the earthquake was, in km. Five events of 12 and 13 November 2025 lie close together and overlap.', 'Το χρώμα δείχνει πόσο βαθιά κάτω από το έδαφος έγινε ο σεισμός, σε km. Πέντε γεγονότα της 12ης και 13ης Νοεμβρίου 2025 είναι κοντά το ένα στο άλλο και επικαλύπτονται.'],
        ['Only the box 34 to 36 N, 32 to 35 E was searched. Outside it the sheet is empty, which does not mean no earthquake happened there.', 'Η αναζήτηση έγινε μόνο στο πλαίσιο 34 έως 36 Β, 32 έως 35 Α. Έξω από αυτό το φύλλο είναι άδειο, κάτι που δεν σημαίνει ότι εκεί δεν έγινε σεισμός.']] } },
  drought: { id: 'drought', band: 'GROUND', c: '#f3d36b', stack: 'drought', win: 'panel', res: 2, moves: 'always', beat: 6, name: ['Farm drought in 2022', 'Γεωργική ξηρασία το 2022'], src: ['European Drought Observatory · 2022', 'Ευρωπαϊκό Παρατηρητήριο Ξηρασίας · 2022'],
    height: ['FARMLAND', 'ΚΑΛΛΙΕΡΓΕΙΕΣ'], draw: drawDrought, count: (p) => p && p.features.length, countWord: ['grid cells', 'κελιά'],
    info: { cap: ['The drought class of four grid cells through 2022.', 'Η κατηγορία ξηρασίας σε τέσσερα κελιά πλέγματος μέσα στο 2022.'],
      unit: ['Colour = the class label of a ten-day period (seven labels, listed on the sheet; a label, not an amount)', 'Χρώμα = η ετικέτα κατηγορίας ενός δεκαημέρου (επτά ετικέτες, γραμμένες στο φύλλο· ετικέτα, όχι ποσότητα)'],
      move: ['This is a replay of a past year: the squares step through the 36 ten-day periods of 2022 and the white frame in the panel shows which one is on. The date is always written on the sheet.', 'Αυτό είναι επανάληψη μιας περασμένης χρονιάς: τα τετράγωνα περνούν από τα 36 δεκαήμερα του 2022 και το λευκό πλαίσιο στον πίνακα δείχνει ποιο φαίνεται. Η ημερομηνία γράφεται πάντα πάνω στο φύλλο.'],
      rest: ['Nothing moves: the panel shows all 36 ten-day periods of 2022 side by side, one row for each grid cell.', 'Τίποτα δεν κινείται: ο πίνακας δείχνει και τα 36 δεκαήμερα του 2022 δίπλα δίπλα, μία γραμμή για κάθε κελί.'],
      marks: () => { const p = pd('drought'); return [['Each square on the map is one grid cell at its true size, about 4 km. Four cells are not the whole island.', 'Κάθε τετράγωνο στον χάρτη είναι ένα κελί του πλέγματος στο πραγματικό του μέγεθος, περίπου 4 km. Τέσσερα κελιά δεν είναι όλο το νησί.']].concat(p && p.classesAreNotAScale ? [p.classesAreNotAScale] : []); } } },
  burnt: { id: 'burnt', band: 'GROUND', c: '#d8a27c', stack: 'burnt-areas', win: 'island', res: 2, name: ['Burnt areas mapped from space', 'Καμένες εκτάσεις χαρτογραφημένες από δορυφόρο'], src: ['EFFIS · last 30 days', 'EFFIS · τελευταίες 30 ημέρες'],
    height: ['THE LAND', 'Η ΓΗ'], draw: drawBurnt, count: (p) => p && p.features.length, countWord: ['perimeters', 'περίμετροι'],
    info: { cap: ['Burnt land mapped from satellite pictures in the last 30 days.', 'Καμένη γη που χαρτογραφήθηκε από δορυφορικές εικόνες τις τελευταίες 30 ημέρες.'],
      unit: ['Circle area = burnt hectares (ha) of one mapped perimeter', 'Εμβαδόν κύκλου = καμένα εκτάρια (ha) μιας χαρτογραφημένης περιμέτρου'],
      never: ['Nothing moves here: a mapped burnt area is drawn once and stands still.', 'Εδώ δεν κινείται τίποτα: μια χαρτογραφημένη καμένη έκταση σχεδιάζεται μία φορά και μένει ακίνητη.'],
      marks: [['The circle stands at the middle of the mapped perimeter. It is not the shape of the burn.', 'Ο κύκλος στέκεται στη μέση της χαρτογραφημένης περιμέτρου. Δεν είναι το σχήμα της καμένης έκτασης.'],
        ['An empty sheet means nothing was mapped, not that nothing burned: small fires are not mapped.', 'Ένα άδειο φύλλο σημαίνει ότι δεν χαρτογραφήθηκε κάτι, όχι ότι δεν κάηκε τίποτα: οι μικρές φωτιές δεν χαρτογραφούνται.']] } },
  hotspots: { id: 'hotspots', band: 'GROUND', c: '#ff9a5a', stack: 'fire-hotspots', win: 'island', res: 2, moves: (l) => !!l.live, beat: 6, name: ['Fire hotspots from space', 'Θερμές κηλίδες φωτιάς από δορυφόρο'], src: ['NASA FIRMS · last 24 hours', 'NASA FIRMS · τελευταίες 24 ώρες'],
    height: ['THE LAND', 'Η ΓΗ'], draw: drawHotspots, count: (p) => p && p.features.length, countWord: ['seen', 'εντοπίστηκαν'],
    info: { cap: ['Places where satellites saw heat in the last 24 hours.', 'Σημεία όπου δορυφόροι είδαν θερμότητα τις τελευταίες 24 ώρες.'],
      unit: ['Dot = one place where a satellite saw heat; brightness = how recently (hours)', 'Κουκκίδα = ένα σημείο όπου δορυφόρος είδε θερμότητα· φωτεινότητα = πόσο πρόσφατα (ώρες)'],
      move: ['Each dot glows slowly, brighter when the sighting is newer and dim near 24 hours. The glow does not spread and is not a flame.', 'Κάθε κουκκίδα λάμπει αργά, πιο φωτεινά όταν ο εντοπισμός είναι πιο πρόσφατος και αχνά κοντά στις 24 ώρες. Η λάμψη δεν απλώνεται και δεν είναι φλόγα.'],
      rest: ['Nothing moves: a brighter dot is a newer sighting, and its age is written beside it.', 'Τίποτα δεν κινείται: πιο φωτεινή κουκκίδα σημαίνει πιο πρόσφατος εντοπισμός, και η ηλικία του γράφεται δίπλα.'],
      marks: [['If you see smoke or fire, call 112.', 'Αν δεις καπνό ή φωτιά, κάλεσε το 112.'],
        ['One dot stands for a square of ground 375 m to 1 km wide. An empty sheet means none was seen, not that there is no fire: clouds and the hours between passes hide things.', 'Μια κουκκίδα αντιστοιχεί σε ένα τετράγωνο εδάφους πλάτους 375 m έως 1 km. Ένα άδειο φύλλο σημαίνει ότι δεν εντοπίστηκε καμία, όχι ότι δεν υπάρχει φωτιά: τα σύννεφα και οι ώρες ανάμεσα στα περάσματα κρύβουν πράγματα.']] } },
  crossings: { id: 'crossings', band: 'CITY', c: '#ffb3d1', stack: 'crossings', win: 'island', res: 2, moves: 'reveal', reveal: 1.2, name: ['Pedestrian crossings with signals', 'Διαβάσεις πεζών με φωτεινό σηματοδότη'], src: ['Public Works Department · inventory', 'Τμήμα Δημοσίων Έργων · κατάλογος'],
    height: ['STREET LEVEL', 'ΣΤΑΘΜΗ ΔΡΟΜΟΥ'], draw: drawCrossings, count: (p) => p && p.features.length, countWord: ['crossings', 'διαβάσεις'],
    info: { cap: ['Signal-controlled pedestrian crossings in the published inventory.', 'Διαβάσεις πεζών με σηματοδότη στον δημοσιευμένο κατάλογο.'],
      unit: ['Dot = one signal-controlled crossing in the inventory (a count of crossings)', 'Κουκκίδα = μία διάβαση με σηματοδότη στον κατάλογο (πλήθος διαβάσεων)'], never: ONCE_NEVER,
      marks: [['Crossings without a signal are not in this list, so an empty street here is not a street without crossings.', 'Οι διαβάσεις χωρίς σηματοδότη δεν είναι σε αυτόν τον κατάλογο, άρα ένας άδειος δρόμος εδώ δεν είναι δρόμος χωρίς διαβάσεις.']] } },
  ev: { id: 'ev', band: 'CITY', c: '#8de4c0', stack: 'ev-charging', win: 'island', res: 2, moves: 'reveal', reveal: 1.2, name: ['EV charging points', 'Σημεία φόρτισης ηλεκτρικών οχημάτων'], src: ['National inventory · via CyNAP', 'Εθνικός κατάλογος · μέσω CyNAP'],
    height: ['STREET LEVEL', 'ΣΤΑΘΜΗ ΔΡΟΜΟΥ'], draw: drawEv, count: (p) => p && p.counts && p.counts.records, countWord: ['records', 'εγγραφές'],
    info: { cap: ['Public charging points in the national inventory.', 'Δημόσια σημεία φόρτισης στον εθνικό κατάλογο.'],
      unit: ['Mark = one charging point; round is AC, square is DC; a bigger mark has more connectors (count)', 'Σημάδι = ένα σημείο φόρτισης· στρογγυλό είναι AC, τετράγωνο είναι DC· μεγαλύτερο σημάδι έχει περισσότερα βύσματα (πλήθος)'], never: ONCE_NEVER,
      marks: () => { const p = pd('ev-charging'), n = p && p.counts; return n ? [[n.records + ' records stand at ' + n.places + ' different places, so several marks can lie on top of each other.', n.records + ' εγγραφές βρίσκονται σε ' + n.places + ' διαφορετικά σημεία, άρα πολλά σημάδια μπορεί να πέφτουν το ένα πάνω στο άλλο.']] : []; } } },
  buildings: { id: 'buildings', band: 'CITY', c: '#C4B8FF', stack: 'buildings', win: 'island', res: 2, moves: 'reveal', reveal: 3, name: ['Built-up ground', 'Δομημένο έδαφος'], src: ['© OpenStreetMap contributors · four city centres', '© Συντελεστές του OpenStreetMap · τέσσερα κέντρα πόλεων'],
    height: ['ROOFTOPS', 'ΣΤΕΓΕΣ'], draw: drawBuildings, ready: readyBuildings, count: (p) => p && p.features.filter((f) => f.available).length, countWord: ['city boxes', 'τετράγωνα πόλεων'],
    spots: () => (has('buildings') ? pd('buildings').features.filter((f) => f.centre && bPatch[f.key]).map((f) => ({ name: f.name, lng: f.centre.lng, lat: f.centre.lat, span: .024 })) : []),
    lines: () => (has('buildings') ? pd('buildings').features.map((f) => [TT(f.name), f.available ? fmt(f.coveredPercent) + ' % ' + T('of the box', 'του τετραγώνου') + ' · ' + nf(f.buildings) + ' ' + T('buildings', 'κτίρια') : T('no data', 'χωρίς δεδομένα'), 'OpenStreetMap']) : []),
    info: { scale: 'built', cap: ['How much of each 100 m square is covered by buildings, in four city centres.', 'Πόσο από κάθε τετράγωνο 100 m καλύπτεται από κτίρια, σε τέσσερα κέντρα πόλεων.'],
      never: ['Nothing moves. When the sheet opens, the squares appear from the emptiest to the fullest and then stand still.', 'Τίποτα δεν κινείται. Όταν ανοίγει το φύλλο, τα τετράγωνα εμφανίζονται από το πιο άδειο ως το πιο γεμάτο και μετά μένουν ακίνητα.'],
      marks: [['Each box is 1.8 km wide and is drawn at its true size, so from far away it is only a speck inside its ring. Use the "fly to" buttons below to go close.', 'Κάθε τετράγωνο έχει πλάτος 1,8 km και σχεδιάζεται στο πραγματικό του μέγεθος, άρα από μακριά είναι μόνο μια κουκκίδα μέσα στο δαχτυλίδι της. Πάτα τα κουμπιά "πέτα σε" πιο κάτω για να πας κοντά.'],
        ['Outside the four boxes nothing is drawn. That does not mean there are no buildings there: only these boxes were read.', 'Έξω από τα τέσσερα τετράγωνα δεν σχεδιάζεται τίποτα. Αυτό δεν σημαίνει ότι εκεί δεν υπάρχουν κτίρια: διαβάστηκαν μόνο αυτά τα τετράγωνα.'],
        ['The map is made by volunteers, so a building that nobody has drawn yet is missing.', 'Ο χάρτης φτιάχνεται από εθελοντές, άρα ένα κτίριο που κανείς δεν έχει σχεδιάσει ακόμη λείπει.']] } },
  permits: { id: 'permits', band: 'CITY', c: '#ffcf9e', stack: 'permits', win: 'island', res: 2, moves: 'reveal', reveal: 1.2, name: ['Building permits', 'Άδειες οικοδομής'], src: ['CYSTAT · monthly statistic', 'CYSTAT · μηνιαίο στατιστικό'],
    height: ['TOWN HALLS', 'ΔΗΜΑΡΧΕΙΑ'], draw: drawPermits, count: (p) => p && p.reportingTotal && p.reportingTotal.permits, countWord: ['permits', 'άδειες'],
    lines: () => (has('permits') ? pd('permits').features.map((f) => [TT(f.name), ['urban', 'rural'].map((k) => T(k, k === 'urban' ? 'αστικές' : 'αγροτικές') + ' ' + (f[k] && typeof f[k].permits === 'number' ? nf(f[k].permits) : T('n/a', 'δ/ε'))).join(' · '), 'CYSTAT']) : []),
    info: { cap: ['Building permits authorised in July 2026, by district.', 'Άδειες οικοδομής που εγκρίθηκαν τον Ιούλιο 2026, ανά επαρχία.'],
      unit: ['Bar height = permits authorised in the month (permits); the bar at the corner shows 200', 'Ύψος μπάρας = άδειες που εγκρίθηκαν μέσα στον μήνα (άδειες)· η μπάρα στη γωνία δείχνει 200'], never: ONCE_NEVER,
      marks: () => { const p = pd('permits'); return [['Each bar stands at the main town of its district and counts the whole district. A taller bar is more permits, not a better or a worse place.', 'Κάθε μπάρα στέκεται στην κύρια πόλη της επαρχίας της και μετρά όλη την επαρχία. Πιο ψηλή μπάρα σημαίνει περισσότερες άδειες, όχι καλύτερο ή χειρότερο μέρος.'],
        ['The statistics cover the government-controlled part of each district. Put this sheet on its own to see urban and rural permits.', 'Τα στατιστικά καλύπτουν το μέρος κάθε επαρχίας που ελέγχει η κυβέρνηση. Βάλε το φύλλο μόνο του για να δεις αστικές και αγροτικές άδειες.']].concat(p && p.annotation && p.annotation.text ? [p.annotation.text] : []); } } },
  population: { id: 'population', band: 'CITY', c: '#C4B8FF', stack: 'population', win: 'island', res: 2, moves: 'reveal', reveal: 3, def: true, name: ['Residents', 'Κάτοικοι'], src: ['CYSTAT · census of 1 October 2021', 'CYSTAT · απογραφή 1ης Οκτωβρίου 2021'],
    height: ['WHERE PEOPLE LIVE', 'ΕΚΕΙ ΠΟΥ ΖΕΙ Ο ΚΟΣΜΟΣ'], draw: drawPopulation, modes: () => LEVELS, mode: 'municipalities', count: (p) => p && p.total && p.total.residents, countWord: ['residents, 2021', 'κάτοικοι, 2021'],
    lines: () => (has('population') ? pd('population').features.map((f) => [TT(f.name), nf(f.residents) + (f.recast2024 && !f.recast2024.sameAs2021 ? ' · ' + T('2021 residents in the 2024 boundaries: ', 'κάτοικοι του 2021 στα όρια του 2024: ') + nf(f.recast2024.residents) : ''), 'CYSTAT 2021']) : []),
    info: { cap: ['Residents counted in the 2021 census, by municipality as it was on census day.', 'Κάτοικοι που μετρήθηκαν στην απογραφή του 2021, ανά δήμο όπως ήταν την ημέρα της απογραφής.'],
      unit: ['Circle area = residents on 1 October 2021 (three reference circles on the sheet: 25,000 · 50,000 · 100,000)', 'Εμβαδόν κύκλου = κάτοικοι την 1η Οκτωβρίου 2021 (τρεις κύκλοι αναφοράς στο φύλλο: 25.000 · 50.000 · 100.000)'], never: CENSUS_NEVER,
      marks: () => { const p = pd('population'); if (!p) return []; return [PLACE_MARK,
        ['One level is shown at a time, municipalities or districts. A district holds its municipalities, so the two are never added.', 'Φαίνεται ένα επίπεδο κάθε φορά, δήμοι ή επαρχίες. Μια επαρχία περιέχει τους δήμους της, άρα τα δύο δεν προστίθενται ποτέ.'],
        [(p.unplaced ? p.unplaced.count : 0) + ' more places have no position yet, so they are not drawn. Their numbers are real.', (p.unplaced ? p.unplaced.count : 0) + ' ακόμη τόποι δεν έχουν θέση, άρα δεν σχεδιάζονται. Οι αριθμοί τους είναι πραγματικοί.']]
        .concat(p.density && p.density.reason ? [p.density.reason] : []).concat(p.coverage ? [p.coverage] : []); } } },
  age: { id: 'age', band: 'CITY', c: '#f09aa8', stack: 'age', win: 'island', res: 2, moves: 'reveal', reveal: 3, name: ['Age of residents', 'Ηλικία κατοίκων'], src: ['CYSTAT · census of 1 October 2021', 'CYSTAT · απογραφή 1ης Οκτωβρίου 2021'],
    height: ['WHERE PEOPLE LIVE', 'ΕΚΕΙ ΠΟΥ ΖΕΙ Ο ΚΟΣΜΟΣ'], draw: drawAge, modes: () => LEVELS, mode: 'municipalities', count: (p) => p && p.total && p.total.meanAge, countWord: ['mean age, 2021', 'μέση ηλικία, 2021'],
    info: { scale: 'age', cap: ['Mean age and age groups of residents in the 2021 census.', 'Μέση ηλικία και ηλικιακές ομάδες των κατοίκων στην απογραφή του 2021.'], never: CENSUS_NEVER,
      marks: () => { const p = pd('age'); return [['The bar beside each place splits its residents into three groups, in % of residents: under 15, 15 to 64, 65 and over.', 'Η μπάρα δίπλα σε κάθε τόπο χωρίζει τους κατοίκους του σε τρεις ομάδες, σε % των κατοίκων: κάτω των 15, 15 έως 64, 65 και άνω.'], PLACE_MARK,
        ['A different mean age is a fact about who lived there in 2021. It does not make a place better or worse.', 'Μια διαφορετική μέση ηλικία είναι στοιχείο για το ποιοι ζούσαν εκεί το 2021. Δεν κάνει έναν τόπο καλύτερο ή χειρότερο.'],
        ['A place with fewer than ' + ((p && p.ageFloor) || 50) + ' residents is drawn hollow, with no age figures.', 'Ένας τόπος με λιγότερους από ' + ((p && p.ageFloor) || 50) + ' κατοίκους σχεδιάζεται κενός, χωρίς στοιχεία ηλικίας.']]; } } },
  buses: { id: 'buses', band: 'CITY', c: '#a0d6b4', stack: ['bus-network', 'bus-now'], win: 'island', res: 2, moves: () => has('bus-now') && (pd('bus-now').trips || []).length > 0, beat: 4, def: true, name: ['Buses by the timetable', 'Λεωφορεία σύμφωνα με το δρομολόγιο'], src: ['Official timetable files · not observed', 'Επίσημα αρχεία δρομολογίων · όχι παρατήρηση'],
    height: ['THE ROADS', 'ΟΙ ΔΡΟΜΟΙ'], draw: drawBuses, count: (net, now) => (now ? now.counts && now.counts.running : net ? net.counts && net.counts.lines : null), countWord: ['planned / lines', 'προγραμματισμένα / γραμμές'],
    lines: () => { const now = has('bus-now') ? pd('bus-now') : null, net = has('bus-network') ? pd('bus-network') : null, out = [];
      if (net) out.push([T('lines · stops', 'γραμμές · στάσεις'), nf(net.counts.lines) + ' · ' + nf(net.counts.stops), T('timetable files', 'αρχεία δρομολογίων')]);
      if (now) out.push([TT(now.dayType) + ' ' + now.cyprusTime, T(now.counts.running + ' planned on the road · ' + now.counts.shown + ' drawn', now.counts.running + ' προγραμματισμένα στον δρόμο · ' + now.counts.shown + ' σχεδιασμένα'), T('timetable', 'δρομολόγιο')]); return out; },
    info: { cap: ['The bus lines and stops of the official timetables, and where each bus should be right now if it runs exactly on time.', 'Οι γραμμές και οι στάσεις των επίσημων δρομολογίων, και πού θα έπρεπε να είναι κάθε λεωφορείο τώρα, αν πηγαίνει ακριβώς στην ώρα του.'],
      unit: ['One hollow square = one planned trip that should be on the road at this minute (a count of trips)', 'Ένα κενό τετράγωνο = ένα προγραμματισμένο δρομολόγιο που θα έπρεπε να είναι στον δρόμο αυτό το λεπτό (πλήθος δρομολογίων)'],
      move: ['Each square moves along the straight line between two stops at the pace of the timetable, in real time. Nobody observed these buses: a late or cancelled bus looks the same here.', 'Κάθε τετράγωνο κινείται στην ευθεία ανάμεσα σε δύο στάσεις με τον ρυθμό του δρομολογίου, σε πραγματικό χρόνο. Κανείς δεν παρατήρησε αυτά τα λεωφορεία: ένα λεωφορείο που αργεί ή ακυρώθηκε φαίνεται ίδιο εδώ.'],
      rest: ['Nothing moves: each square stands where the timetable puts its bus at the minute the picture was drawn. Nobody observed these buses.', 'Τίποτα δεν κινείται: κάθε τετράγωνο στέκεται εκεί όπου το δρομολόγιο βάζει το λεωφορείο του το λεπτό που σχεδιάστηκε η εικόνα. Κανείς δεν παρατήρησε αυτά τα λεωφορεία.'],
      marks: [['Solid line: the route as drawn in the timetable file. Dashed line: straight from stop to stop, not the road. Small dot: a stop.', 'Συνεχής γραμμή: η διαδρομή όπως είναι σχεδιασμένη στο αρχείο δρομολογίων. Διακεκομμένη γραμμή: ευθεία από στάση σε στάση, όχι ο δρόμος. Μικρή κουκκίδα: μια στάση.'],
        ['Public holidays and cancelled trips are not taken into account. No trail is drawn behind a bus, because a trail would say it was seen there.', 'Οι αργίες και τα ακυρωμένα δρομολόγια δεν λαμβάνονται υπόψη. Πίσω από ένα λεωφορείο δεν σχεδιάζεται ίχνος, γιατί ένα ίχνος θα έλεγε ότι το είδαν εκεί.']] } },
  vehicles: { id: 'vehicles', band: 'CITY', c: '#ffd696', stack: 'own-vehicles', win: 'island', res: 2, moves: 'always', beat: 4, name: ['Our sensor vehicles', 'Τα οχήματα με τους αισθητήρες μας'], src: ['Our own sensors · delayed and rounded', 'Οι δικοί μας αισθητήρες · με καθυστέρηση και στρογγύλεμα'],
    height: ['THE ROADS', 'ΟΙ ΔΡΟΜΟΙ'], draw: drawVehicles, count: (p) => p && p.counts && p.counts.withTrail, countWord: ['with a trail', 'με διαδρομή'],
    info: { cap: ['Where our sensor vehicles were, at least two hours ago, to the nearest kilometre.', 'Πού ήταν τα οχήματα με τους αισθητήρες μας, τουλάχιστον δύο ώρες πριν, με ακρίβεια ενός χιλιομέτρου.'],
      unit: ['One square = about 1 km (the grid the positions are rounded to); the clock on the sheet = the time being replayed', 'Ένα τετράγωνο = περίπου 1 km (το πλέγμα στο οποίο στρογγυλεύονται οι θέσεις)· το ρολόι στο φύλλο = η ώρα που ξαναπαίζεται'],
      move: () => { const p = pd('own-vehicles') || {}; return ['A replay, faster than real time: each mark jumps from one grid square to the next in the order of the trail, and the clock on the sheet shows the moment being replayed. That moment is always at least ' + (p.delayMinutes || 120) + ' minutes ago; the replay never reaches now.', 'Μια επανάληψη, πιο γρήγορη από τον πραγματικό χρόνο: κάθε σημάδι πηδά από το ένα τετράγωνο του πλέγματος στο επόμενο με τη σειρά της διαδρομής, και το ρολόι στο φύλλο δείχνει τη στιγμή που ξαναπαίζεται. Η στιγμή αυτή είναι πάντα τουλάχιστον ' + (p.delayMinutes || 120) + ' λεπτά πριν· η επανάληψη δεν φτάνει ποτέ στο τώρα.']; },
      rest: ['Nothing moves: the faint squares are everywhere a vehicle was in the window, and a bright square is its last place that may be shown.', 'Τίποτα δεν κινείται: τα αχνά τετράγωνα είναι όλα τα σημεία όπου βρέθηκε ένα όχημα μέσα στο χρονικό παράθυρο, και ένα φωτεινό τετράγωνο είναι η τελευταία του θέση που επιτρέπεται να φανεί.'],
      marks: [['No name, no school and no number plate is shown, and no line joins the squares. A vehicle that was silent for more than 45 minutes disappears until it reports again.', 'Δεν φαίνεται όνομα, σχολείο ή πινακίδα, και καμία γραμμή δεν ενώνει τα τετράγωνα. Ένα όχημα που έμεινε σιωπηλό πάνω από 45 λεπτά εξαφανίζεται μέχρι να ξαναστείλει.'],
        ['Faint squares are where a vehicle was in the three hours before the moment on the clock.', 'Τα αχνά τετράγωνα είναι εκεί όπου βρέθηκε ένα όχημα τις τρεις ώρες πριν από τη στιγμή του ρολογιού.']] } },
  airq: { id: 'airq', band: 'AIR', c: '#e3c8ff', stack: 'air-stations', win: 'island', res: 2, name: ['Official air-quality stations', 'Επίσημοι σταθμοί ποιότητας αέρα'], src: ['EEA · hourly, not yet verified', 'ΕΟΠ · ωριαία, χωρίς επαλήθευση ακόμη'],
    height: ['STATION INLETS · OUTDOORS', 'ΣΤΟΜΙΑ ΣΤΑΘΜΩΝ · ΕΞΩ'], draw: drawAirStations, modes: () => [{ id: 'pm25', name: ['PM2.5', 'PM2.5'] }, { id: 'pm10', name: ['PM10', 'PM10'] }], mode: 'pm25', count: (p) => p && p.features.length, countWord: ['stations', 'σταθμοί'],
    info: { cap: ['The newest hour of dust in the air at the official stations.', 'Η πιο πρόσφατη ώρα σκόνης στον αέρα στους επίσημους σταθμούς.'],
      unit: ['Bar height = µg/m³ of PM2.5 or PM10, the mean of one hour; the bar at the corner shows the reference', 'Ύψος μπάρας = µg/m³ PM2.5 ή PM10, μέσος όρος μίας ώρας· η μπάρα στη γωνία δείχνει την αναφορά'],
      never: ['Nothing moves: each station gives one value an hour, and the bar stands until the next hour arrives.', 'Τίποτα δεν κινείται: κάθε σταθμός δίνει μία τιμή την ώρα, και η μπάρα μένει ως έχει μέχρι να έρθει η επόμενη ώρα.'],
      marks: [['Beside each bar: the value and the end of the hour it stands for. A hollow dot is a station with no value for that hour, not a zero.', 'Δίπλα σε κάθε μπάρα: η τιμή και το τέλος της ώρας που αντιπροσωπεύει. Μια κενή κουκκίδα είναι σταθμός χωρίς τιμή για εκείνη την ώρα, όχι μηδέν.'],
        ['These are outdoor stations. They are never to be held against the readings inside a classroom.', 'Αυτοί είναι εξωτερικοί σταθμοί. Δεν συγκρίνονται ποτέ με τις μετρήσεις μέσα σε μια τάξη.']] } },
  airday: { id: 'airday', band: 'AIR', c: '#b9a8ff', stack: 'air-day', win: 'panel', res: 2, moves: 'always', beat: 6, name: ['One day of air pollution, hour by hour', 'Μία μέρα ατμοσφαιρικής ρύπανσης, ώρα με την ώρα'], src: ['Dept. of Labour Inspection · 15 May 2024', 'Τμήμα Επιθεώρησης Εργασίας · 15 Μαΐου 2024'],
    height: ['STATION INLETS · OUTDOORS', 'ΣΤΟΜΙΑ ΣΤΑΘΜΩΝ · ΕΞΩ'], draw: drawAirDay, modes: () => [{ id: 'no2', name: ['NO2', 'NO2'] }, { id: 'o3', name: ['O3 (ozone)', 'O3 (όζον)'] }], mode: 'no2', count: (p) => p && p.features.length, countWord: ['stations', 'σταθμοί'],
    info: { scale: () => (layerOf('airday').mode === 'o3' ? 'o3' : 'no2'), cap: ['Nitrogen dioxide and ozone at 11 official stations during one day.', 'Διοξείδιο του αζώτου και όζον σε 11 επίσημους σταθμούς μέσα σε μία μέρα.'],
      move: ['This is a replay of one past day: the bars step through its 24 hours and the white frame in the panel shows which hour is on. The date, 15 May 2024, is always written on the sheet.', 'Αυτό είναι επανάληψη μιας περασμένης μέρας: οι μπάρες περνούν από τις 24 ώρες της και το λευκό πλαίσιο στον πίνακα δείχνει ποια ώρα φαίνεται. Η ημερομηνία, 15 Μαΐου 2024, γράφεται πάντα πάνω στο φύλλο.'],
      rest: ['Nothing moves: the panel shows all 24 hours of 15 May 2024 side by side, one row for each station.', 'Τίποτα δεν κινείται: ο πίνακας δείχνει και τις 24 ώρες της 15ης Μαΐου 2024 δίπλα δίπλα, μία γραμμή για κάθε σταθμό.'],
      marks: [['The number beside each station on the map is its row in the panel. One gas is shown at a time: choose it with the buttons below.', 'Ο αριθμός δίπλα σε κάθε σταθμό στον χάρτη είναι η γραμμή του στον πίνακα. Φαίνεται ένα αέριο κάθε φορά: διάλεξέ το με τα κουμπιά πιο κάτω.'],
        ['A station beside a road and a station in the countryside measure different air. The rows are in the publisher’s order, not ranked.', 'Ένας σταθμός δίπλα σε δρόμο και ένας σταθμός στην ύπαιθρο μετρούν διαφορετικό αέρα. Οι γραμμές είναι με τη σειρά του εκδότη, όχι σε κατάταξη.']] } },
  met: { id: 'met', band: 'AIR', c: '#b4ebff', stack: ['met-stations', 'airports'], win: 'island', res: 2, moves: (l) => !!l.live, beat: 3, def: true, name: ['Weather stations and airports', 'Μετεωρολογικοί σταθμοί και αεροδρόμια'], src: ['Dept. of Meteorology · airport reports (METAR)', 'Τμήμα Μετεωρολογίας · αναφορές αεροδρομίων (METAR)'],
    height: ['STATION MASTS', 'ΙΣΤΟΙ ΣΤΑΘΜΩΝ'], draw: drawMet, count: (a, b) => (a ? a.features.length : 0) + (b ? b.features.length : 0), countWord: ['stations', 'σταθμοί'],
    info: { scale: 'temp', cap: ['The newest readings of the official weather stations, and the newest weather report of each airport.', 'Οι πιο πρόσφατες μετρήσεις των επίσημων μετεωρολογικών σταθμών, και η πιο πρόσφατη μετεωρολογική αναφορά κάθε αεροδρομίου.'],
      move: ['Each arrow points the way the measured wind blows, and a dot runs along it faster when the wind is stronger. A station that reported no wind has no arrow.', 'Κάθε βέλος δείχνει προς τα πού φυσά ο άνεμος που μετρήθηκε, και μια κουκκίδα τρέχει πάνω του πιο γρήγορα όταν ο άνεμος είναι πιο δυνατός. Ένας σταθμός που δεν έδωσε άνεμο δεν έχει βέλος.'],
      rest: ['Each arrow points the way the measured wind blows, and a longer arrow is stronger wind. A station that reported no wind has no arrow.', 'Κάθε βέλος δείχνει προς τα πού φυσά ο άνεμος που μετρήθηκε, και πιο μακρύ βέλος σημαίνει πιο δυνατό άνεμο. Ένας σταθμός που δεν έδωσε άνεμο δεν έχει βέλος.'],
      marks: [['A round dot is a weather station and a diamond is an airport. The dot colour is the air temperature; beside it are °C, the wind in m/s and the rain of the last 10 minutes in mm.', 'Μια στρογγυλή κουκκίδα είναι μετεωρολογικός σταθμός και ένας ρόμβος είναι αεροδρόμιο. Το χρώμα είναι η θερμοκρασία του αέρα· δίπλα γράφονται °C, ο άνεμος σε m/s και η βροχή των τελευταίων 10 λεπτών σε mm.'],
        ['The airports show weather only. The aeroplanes are on their own sheet.', 'Τα αεροδρόμια δείχνουν μόνο καιρό. Τα αεροπλάνα είναι σε δικό τους φύλλο.']] } },
  aerosol: { id: 'aerosol', band: 'AIR', c: '#ffd7a8', stack: 'aerosol-sites', win: 'panel', res: 2, moves: 'always', beat: 6, name: ['Haze measured from the ground, July 2022', 'Θολούρα μετρημένη από το έδαφος, Ιούλιος 2022'], src: ['AERONET sun photometers · July 2022', 'Ηλιακά φωτόμετρα AERONET · Ιούλιος 2022'],
    height: ['THE WHOLE AIR COLUMN', 'ΟΛΗ Η ΣΤΗΛΗ ΑΕΡΑ'], draw: drawAerosol, count: (p) => p && p.features.length, countWord: ['sites', 'σημεία'],
    info: { scale: 'aod', cap: ['How hazy the sky was above two sites, day by day in July 2022.', 'Πόσο θολός ήταν ο ουρανός πάνω από δύο σημεία, μέρα με τη μέρα τον Ιούλιο 2022.'],
      move: ['This is a replay of a past month: the circles step through the days of July 2022 and the white frame in the panel shows which day is on. The date is always written on the sheet.', 'Αυτό είναι επανάληψη ενός περασμένου μήνα: οι κύκλοι περνούν από τις ημέρες του Ιουλίου 2022 και το λευκό πλαίσιο στον πίνακα δείχνει ποια μέρα φαίνεται. Η ημερομηνία γράφεται πάντα πάνω στο φύλλο.'],
      rest: ['Nothing moves: the panel shows every day of July 2022 side by side, one row for each site.', 'Τίποτα δεν κινείται: ο πίνακας δείχνει κάθε μέρα του Ιουλίου 2022 δίπλα δίπλα, μία γραμμή για κάθε σημείο.'],
      marks: [['A bigger, warmer circle is a hazier sky (the area of the circle grows with the value). The number has no unit.', 'Πιο μεγάλος και πιο θερμός κύκλος σημαίνει πιο θολό ουρανό (το εμβαδόν του κύκλου μεγαλώνει με την τιμή). Ο αριθμός δεν έχει μονάδα.'],
        ['A sun photometer measures only when it can see the sun. A day without a value is left empty, never filled in.', 'Ένα ηλιακό φωτόμετρο μετρά μόνο όταν βλέπει τον ήλιο. Μια μέρα χωρίς τιμή μένει άδεια, δεν συμπληρώνεται ποτέ.']] } },
};

/* ---- THE SHEETS, seabed up to space ----
   HOW TO ADD A SHEET: add one object to LAYERS (its place in the list is its height in the stack) and, if it is fed, one
   function that draws it. Nothing else needs to know about it: the rail, the key, the tour, the ruler, the camera and the
   tests all read LAYERS. A sheet costs nothing until it is first switched on: its picture is made then, and its data asked for then.

   id, band     a short id; band is one of SPACE / AIR / GROUND / CITY / WATER (the groups of the rail, which fold).
   name, src    [English, Greek]: the sheet's name, and one line naming its source. c is the sheet's own colour.
   height       [English, Greek]: the words on the ruler for the level this sheet stands for.
   info         the key, every line as [English, Greek]:
                  cap    what the sheet shows, in one plain sentence     scale  a key of SCALE: a colour bar with units (optional)
                  move   what the motion means                           rest   the same for reduced motion (still marks, same information)
                  never  used instead of move/rest when nothing moves    marks  more lines: an array, or a function returning one
                  unit   for a sheet with no colour bar: what a mark's size stands for, with its unit
   def: true    the sheet is part of the opening set. The others wait in the rail until they are switched on ("ALL" shows every one).
   A SHEET WITH NO DATA YET: give it make() (its example drawing) and nolive: true. It is faded, striped and stamped
                "example drawing · no live data yet"; its key shows no scale and claims no motion. Never invent numbers.
   A FED SHEET: give it paint(ctx, t, anim, dt). It repaints its own canvas from what arrived: only what the feed holds,
                only where the feed has data, and when there is nothing it says so in words (emptySheet / pill). anim is
                false for reduced motion. beat: n repaints every n-th frame while animating; without it the sheet is
                repainted only after touch(id). state() returns { kind, text } for the key's source line, kind being
                'measured' | 'model' | 'published' | 'demo' | 'none'. card() may return { b, em, cls } for the rail.
   A SHEET FED BY /api/stack/<id> (docs/STACK-DATA.md): give it stack: 'id' (or ['id', 'id'] when two answers belong on one
                sheet) and draw(ctx, t, anim, layer, answer, answer2): it is called only with answers that have data (null for
                one that has none). The loading, the refresh at the answer's own refreshSeconds, the honesty line, the
                attribution, "demo data" and "no data, and why" are all done for it (paintStack, stackState). Say how it may
                move: moves: 'reveal' (marks appear once over `reveal` seconds, read with rev(), then it is never repainted),
                'always' (a replay of a past period, with the date on the sheet) or a function that says whether anything is
                moving now. No `moves`: it is painted once. modes: () => [{ id, name }] gives the key a row of buttons (one
                level, one gas, one scenario at a time; layer.mode holds the choice). spots: () => [{ name, lng, lat, span }]
                gives the key "fly to" buttons. count(answer) and countWord feed the card in the rail.
   HOW LIVE DATA ARRIVES: through /layers/api/live (feed: { vars, own } names the measurements; paintWind() fills the
                grids), or through the sheet's own load(): an async function that fetches and keeps what it got, run when
                the sheet is first switched on and then every `every` milliseconds while it is shown. After a load the
                sheet is touched and the rail and the key are brought up to date.
   WHERE IT DRAWS: by default a sheet's canvas is the whole region. win: 'island' makes it the island's box only, 'panel'
                the island and the open water south of it (room for a panel of figures), 'wide' the sea around Cyprus;
                win: () => field makes it as large as a model's grid (mkField), refitted when data lands. res: 2 gives the
                picture twice the detail (for marks inside towns). Paint in sheet pixels (pxOf(lng, lat)) either way: the
                canvas is shifted and scaled for you, and what falls outside is cut off.
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
  { id: 'seabed', band: 'WATER', c: '#2f7fb8', solid: true, def: true, name: ['Seabed depth', 'Βάθος βυθού'], src: ['no depth grid loaded yet', 'δεν έχει φορτωθεί ακόμη πλέγμα βάθους'],
    height: ['SEA FLOOR', 'ΒΥΘΟΣ'], paint: seabedPaint, load: loadSeabed, answers: ['seabed-profiles'],
    srcNow: () => (seabed ? (seabed.meta.testOnly ? ['TEST FIXTURE · not real depths', 'ΔΟΚΙΜΑΣΤΙΚΟ ΑΡΧΕΙΟ · όχι πραγματικά βάθη'] : ['EMODnet Bathymetry · published depth grid', 'EMODnet Bathymetry · δημοσιευμένο πλέγμα βάθους'])
      : profiles() ? ['no depth grid yet · three profile lines only', 'χωρίς πλέγμα βάθους ακόμη · μόνο τρεις γραμμές προφίλ'] : null),
    lines: () => (seabed ? [[T('deepest cell in the grid', 'βαθύτερο κελί του πλέγματος'), nf(seabed.deepest) + ' m', seabed.meta.testOnly ? T('test fixture', 'δοκιμαστικό αρχείο') : 'EMODnet']] : [])
      .concat(profiles() ? profiles().features.map((f) => { const e = f.points[f.points.length - 1]; return [T('profile off ', 'προφίλ στα ανοιχτά: ') + f.name, nf(Math.round(Math.max(0, -e.elevation))) + ' m · ' + e.km + ' km', T('profile line', 'γραμμή προφίλ')]; }) : []),
    state: () => { const pr = profiles(), prText = pr ? T(pr.attribution, pr.attributionEl || pr.attribution) : '';
      if (seabed) return { kind: seabed.meta.testOnly ? 'demo' : 'published',
        text: (seabed.meta.testOnly ? T('Test fixture, not real depths. ', 'Δοκιμαστικό αρχείο, όχι πραγματικά βάθη. ') : '') + seabed.meta.attribution + ' · ' + seabed.meta.licence + ' · '
          + T(nf(seabed.cells) + ' sea cells, one every ' + fmt(seabed.grid.step * 111) + ' km · retrieved ' + seabed.meta.retrievedAt, nf(seabed.cells) + ' κελιά θάλασσας, ένα κάθε ' + fmt(seabed.grid.step * 111) + ' km · ανάκτηση ' + seabed.meta.retrievedAt)
          + (pr ? T(' · three profile lines: ', ' · τρεις γραμμές προφίλ: ') + prText : '') };
      if (pr) return { kind: 'published', text: T('No depth grid has been loaded, so the sea floor itself is not drawn. Only the three coloured lines are depths: ', 'Δεν έχει φορτωθεί πλέγμα βάθους, άρα ο ίδιος ο βυθός δεν σχεδιάζεται. Μόνο οι τρεις χρωματιστές γραμμές είναι βάθη: ') + prText };
      return none(T('No depth grid has been loaded, so the sea floor is not drawn. Nothing on this sheet is a depth.', 'Δεν έχει φορτωθεί πλέγμα βάθους, άρα ο βυθός δεν σχεδιάζεται. Τίποτα σε αυτό το φύλλο δεν είναι βάθος.')); },
    card: () => (seabed ? { b: nf(seabed.deepest), em: 'm · ' + T('deepest cell', 'βαθύτερο κελί'), cls: 'old' } : { b: profiles() ? '3' : '—', em: T('no depth grid yet', 'χωρίς πλέγμα βάθους ακόμη') + (profiles() ? T(' · profile lines', ' · γραμμές προφίλ') : ''), cls: 'year' }),
    info: { scale: 'depth',
      cap: () => (seabed ? ['How deep the sea floor lies around Cyprus, from a published depth grid. Darker blue is deeper.', 'Πόσο βαθιά βρίσκεται ο βυθός γύρω από την Κύπρο, από ένα δημοσιευμένο πλέγμα βάθους. Πιο σκούρο μπλε σημαίνει πιο βαθιά.']
        : ['How the seabed falls away off three cities: three lines of depths. The depth grid for the whole sea floor has not been loaded yet. Darker blue is deeper.', 'Πώς βαθαίνει ο βυθός στα ανοιχτά τριών πόλεων: τρεις γραμμές με βάθη. Το πλέγμα βάθους για όλο τον βυθό δεν έχει φορτωθεί ακόμη. Πιο σκούρο μπλε σημαίνει πιο βαθιά.']),
      never: ['Nothing moves here: the sea floor does not change from one day to the next.', 'Εδώ δεν κινείται τίποτα: ο βυθός δεν αλλάζει από τη μια μέρα στην άλλη.'],
      marks: () => (seabed ? [['The light and shade show the slopes of the sea floor. They are worked out from the same depths.', 'Το φως και η σκιά δείχνουν τις πλαγιές του βυθού. Υπολογίζονται από τα ίδια βάθη.'],
        ['The grid is put together from many surveys, some old, and filled in between them. It is for learning, not for navigation.', 'Το πλέγμα συντίθεται από πολλές μετρήσεις, κάποιες παλιές, και συμπληρώνεται ανάμεσά τους. Είναι για μάθηση, όχι για ναυσιπλοΐα.'],
        ['Where the grid has no value, nothing is drawn.', 'Όπου το πλέγμα δεν έχει τιμή, δεν σχεδιάζεται τίποτα.']] : [])
        .concat(profiles() ? [['Each profile line is 13 points, one every kilometre from the shore outwards, coloured by depth in metres. A hollow point is a value filled in between two cells of the model.', 'Κάθε γραμμή προφίλ έχει 13 σημεία, ένα κάθε χιλιόμετρο από την ακτή προς τα ανοιχτά, χρωματισμένα με το βάθος σε μέτρα. Ένα κενό σημείο είναι τιμή που συμπληρώθηκε ανάμεσα σε δύο κελιά του μοντέλου.']] : [])
        .concat(seabed ? [] : [['Everywhere else on this sheet the sea floor is not drawn: striped means no depth data, not shallow water.', 'Παντού αλλού σε αυτό το φύλλο ο βυθός δεν σχεδιάζεται: οι ρίγες σημαίνουν ότι δεν υπάρχουν δεδομένα βάθους, όχι ρηχά νερά.']]).concat(demoCoastMark()) } },
  { id: 'waves', band: 'WATER', c: '#8fd0f5', def: true, name: ['Waves and sea temperature', 'Κύματα και θερμοκρασία θάλασσας'], src: ['Open-Meteo marine model · sea points', 'Θαλάσσιο μοντέλο Open-Meteo · σημεία θάλασσας'],
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
      marks: [['The colour of the sea is its temperature. A white ring marks each point of the sea model. When this sheet is shown alone, the numbers appear beside each ring: the temperature, the wave height in metres and the wave period in seconds.', 'Το χρώμα της θάλασσας είναι η θερμοκρασία της. Ένας λευκός δακτύλιος σημαδεύει κάθε σημείο του μοντέλου της θάλασσας. Όταν αυτό το φύλλο φαίνεται μόνο του, οι αριθμοί εμφανίζονται δίπλα σε κάθε δακτύλιο: η θερμοκρασία, το ύψος κύματος σε μέτρα και η περίοδος κύματος σε δευτερόλεπτα.'],
        ['This is a model, not a buoy: nobody measured these waves. The gap between crests is not to scale.', 'Αυτό είναι μοντέλο, όχι σημαδούρα: κανείς δεν μέτρησε αυτά τα κύματα. Το κενό ανάμεσα στις κορυφές δεν είναι σε κλίμακα.'],
        ['The waves and rings are drawn only at the points of the sea model, never over land. Between the points the colour of the sea is filled in from the nearest points, so it is an estimate, not a reading. Nothing is drawn outside the dashed frame.', 'Τα κύματα και οι δακτύλιοι σχεδιάζονται μόνο στα σημεία του μοντέλου της θάλασσας, ποτέ πάνω από στεριά. Ανάμεσα στα σημεία το χρώμα της θάλασσας συμπληρώνεται από τα κοντινότερα σημεία, άρα είναι εκτίμηση και όχι μέτρηση. Έξω από το διακεκομμένο πλαίσιο δεν σχεδιάζεται τίποτα.']] } },
  { id: 'ships', band: 'WATER', c: '#ffb86b', def: true, win: shipsWin, name: ['Ports and ships, by quarter', 'Λιμάνια και πλοία, ανά τρίμηνο'], src: ['Eurostat · published port statistics', 'Eurostat · δημοσιευμένα στατιστικά λιμανιών'],
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
  STACK_SHEETS.bathing, STACK_SHEETS.flood,
  { id: 'island', band: 'GROUND', c: '#F7C46B', def: true, solid: true, name: ['Island relief and sensors', 'Ανάγλυφο και αισθητήρες'], src: ['OpenStreetMap · our SenseCAP cards', 'OpenStreetMap · οι κάρτες SenseCAP μας'],
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
  STACK_SHEETS.quakes, STACK_SHEETS.drought, STACK_SHEETS.burnt, STACK_SHEETS.hotspots,
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
  STACK_SHEETS.crossings, STACK_SHEETS.ev, STACK_SHEETS.buildings, STACK_SHEETS.permits, STACK_SHEETS.population, STACK_SHEETS.age, STACK_SHEETS.buses, STACK_SHEETS.vehicles,
  { id: 'air', band: 'AIR', c: '#d9b3ff', def: true, additive: true, win: () => airF, name: ['Air quality', 'Ποιότητα αέρα'], src: ['Open-Meteo air-quality model · grid', 'Μοντέλο ποιότητας αέρα Open-Meteo · πλέγμα'],
    height: ['WHERE PEOPLE BREATHE', 'ΕΚΕΙ ΠΟΥ ΑΝΑΠΝΕΟΥΜΕ'], paint: airStep, beat: 3, feed: { vars: ['pm25', 'pm10', 'ozone'] },
    state: () => { if (!airF) return GONE(); const r = best('pm25', false); return modelState('openmeteo-air', airPts.length, r ? ageText(r.ageMin) : T('age not stated', 'η ηλικία δεν δηλώνεται')); },
    info: { scale: 'pm25',
      cap: ['Fine particles in the air (PM2.5), from the air-quality model. Between the model’s grid points the colour is filled in.', 'Λεπτά σωματίδια στον αέρα (PM2.5), από το μοντέλο ποιότητας αέρα. Ανάμεσα στα σημεία του πλέγματος το χρώμα συμπληρώνεται.'],
      move: ['More specks mean more fine particles there. The specks only shimmer: they do not show where the air is going.', 'Περισσότερες κουκκίδες σημαίνουν περισσότερα λεπτά σωματίδια εκεί. Οι κουκκίδες απλώς τρεμοπαίζουν: δεν δείχνουν προς τα πού πάει ο αέρας.'],
      rest: ['More specks mean more fine particles there.', 'Περισσότερες κουκκίδες σημαίνουν περισσότερα λεπτά σωματίδια εκεί.'],
      marks: [['Small square dots are the model’s grid points: the only places it gives a number.', 'Οι μικρές τετράγωνες κουκκίδες είναι τα σημεία του πλέγματος: μόνο εκεί δίνει αριθμό το μοντέλο.'], EDGE_MARK] } },
  STACK_SHEETS.airq, STACK_SHEETS.airday, STACK_SHEETS.met,
  { id: 'wind', band: 'AIR', c: '#59d7e8', def: true, additive: true, win: () => windF && windF.u, name: ['Wind at 10 m', 'Άνεμος στα 10 m'], src: ['Open-Meteo model grid · airport readings', 'Πλέγμα μοντέλου Open-Meteo · μετρήσεις αεροδρομίων'],
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
  STACK_SHEETS.aerosol,
  { id: 'aircraft', band: 'AIR', c: '#f4fbff', def: true, name: ['Aeroplanes', 'Αεροπλάνα'], src: ['adsb.fi · volunteer receivers', 'adsb.fi · δέκτες εθελοντών'],
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
  { id: 'cloud', band: 'SPACE', c: '#e8f4ff', def: true, additive: true, win: () => cloudF, name: ['Clouds', 'Σύννεφα'], src: ['Open-Meteo weather model · grid', 'Μοντέλο καιρού Open-Meteo · πλέγμα'],
    height: ['CLOUD TOPS', 'ΚΟΡΥΦΕΣ ΝΕΦΩΝ'], paint: cloudPaint,
    state: () => (cloudF ? modelState('openmeteo-weather', grid.length, skyAge()) : GONE()),
    lines: () => (cloudPct != null ? [[T('grid over Cyprus', 'πλέγμα πάνω από την Κύπρο'), cloudPct + ' % · ' + T('model', 'μοντέλο'), 'openmeteo-weather']] : []),
    info: { scale: 'cloud',
      cap: ['How much of the sky is covered by cloud, from the weather model. Whiter means more cover.', 'Πόσο μέρος του ουρανού σκεπάζουν τα σύννεφα, από το μοντέλο καιρού. Πιο λευκό σημαίνει περισσότερη κάλυψη.'],
      never: ['Nothing moves here: the model says how much cloud there is, not which way it drifts.', 'Εδώ δεν κινείται τίποτα: το μοντέλο λέει πόσα σύννεφα υπάρχουν, όχι προς τα πού πάνε.'],
      marks: [['Small square dots are the model’s grid points.', 'Οι μικρές τετράγωνες κουκκίδες είναι τα σημεία του πλέγματος.'], EDGE_MARK] } },
  { id: 'sat', band: 'SPACE', c: '#9fe0f5', def: true, win: 'island', name: ['Satellite picture', 'Δορυφορική εικόνα'], src: ['NASA GIBS · pass 17:00Z', 'NASA GIBS · πέρασμα 17:00Z'],
    height: ['FROM ORBIT', 'ΑΠΟ ΤΡΟΧΙΑ'],
    card: () => (satReal ? { b: '1', em: T('real picture', 'πραγματική εικόνα'), cls: 'old' } : null),
    make: () => { const c = raster((x, y, g) => { const n = fbm(x / 18, y / 18, 5), veg = Math.min(1, Math.max(0, n * 1.5 - .25 + g0.h[g] * .25));
      return [128 - veg * 76, 116 + veg * 42, 78 - veg * 34, 215]; }); coastUnder(c, 'rgba(200,240,255,.5)'); return c; },
    state: () => (satReal ? { kind: 'measured', text: T('A real satellite picture is shown.', 'Φαίνεται πραγματική δορυφορική εικόνα.') }
      : none(T('No satellite picture is stored, so a drawn stand-in is shown.', 'Δεν υπάρχει αποθηκευμένη δορυφορική εικόνα, άρα φαίνεται ένα σχέδιο στη θέση της.'))),
    info: { cap: ['A picture of Cyprus taken from space on one pass of a satellite.', 'Μια εικόνα της Κύπρου από το διάστημα, από ένα πέρασμα δορυφόρου.'],
      never: ['Nothing moves here: it is one picture of one moment.', 'Εδώ δεν κινείται τίποτα: είναι μία εικόνα μιας στιγμής.'], always: true } },
];
// a sheet fed by /api/stack gets its loading, its painting, its source line and its card from the shared code
LAYERS.forEach((l) => { if (!l.stack) return; l.paint = paintStack(l); l.load = () => loadStack(l); if (!l.state) l.state = () => stackState(l); if (!l.card) l.card = () => stackCard(l);
  if (l.moves === 'reveal') l.beat = 2; if (!l.moves) l.revealDone = true; });
const movesNow = (l) => (!l.stack ? true : l.moves === 'always' ? true : l.moves === 'reveal' ? !l.revealDone : typeof l.moves === 'function' ? !!l.moves(l) : false);
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
const camera = new THREE.PerspectiveCamera(38, 2, 2, 60000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .06;
controls.minDistance = 14; controls.maxDistance = 16000;
scene.add(new THREE.AmbientLight('#9ec4e6', 1));
const key = new THREE.DirectionalLight('#eef6ff', 1.5); key.position.set(-500, 900, 500); scene.add(key);
const rim = new THREE.DirectionalLight('#4CCBEA', .55); rim.position.set(600, 240, -700); scene.add(rim);

// The sheet is the region. Cyprus is about as wide in the scene as it was when the sheet was the island alone, so the
// pins, masts and labels on it keep their size.
const SW = 2400, SH = SW * RH / RW, GAPY = 58;
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
const SHEET_LABEL = mobile ? 74 : 56;
const CPU2D = Q.get('gpu2d') === '1' ? undefined : { willReadFrequently: true };
// A sheet's picture covers only the part of the region where it can have anything to show (its "window"): the whole
// region for the sea, the floors and the sky, the model's grid for the weather, the island for a drawing of the island.
// Outside its window a sheet is not there at all, so nothing can be painted where there is no data, and the scene has
// far less empty glass to draw. The thin frame of every sheet still shows the whole region.
const ISLAND_WIN = { x0: IX0 - IW * .14, y0: IY0 - IH * .22, w: IW * 1.28, h: IH * 1.44 };
const PANEL_WIN = (() => { const [px0, py0] = PANEL_AT(), x0 = Math.min(ISLAND_WIN.x0, px0 - 12 * U), x1 = Math.max(ISLAND_WIN.x0 + ISLAND_WIN.w, px0 + 345 * U); return { x0, y0: ISLAND_WIN.y0, w: x1 - x0, h: py0 + 190 * U - ISLAND_WIN.y0 }; })();
const WIDE_WIN = (() => { const [xa, ya] = pxOf(31.85, 36.15), [xb, yb] = pxOf(35.15, 33.9); return { x0: xa, y0: ya, w: xb - xa, h: yb - ya }; })();
const WINS = { island: ISLAND_WIN, panel: PANEL_WIN, wide: WIDE_WIN };
const baseWin = (layer) => winOf(typeof layer.win === 'string' ? WINS[layer.win] : layer.win ? ISLAND_WIN : null);
const winOf = (r) => { if (!r) return { x0: 0, y0: 0, w: LW, h: LH }; const x0 = Math.max(0, Math.floor(r.x0)), y0 = Math.max(0, Math.floor(r.y0));
  return { x0, y0, w: Math.max(8, Math.min(LW, Math.ceil(r.x0 + r.w)) - x0), h: Math.max(8, Math.min(LH, Math.ceil(r.y0 + r.h)) - y0) }; };
const winGeo = (w) => new THREE.PlaneGeometry(w.w / LW * SW, w.h / LH * SH);
const winPlace = (mesh, w, y) => mesh.position.set(((w.x0 + w.w / 2) / LW - .5) * SW, y, ((w.y0 + w.h / 2) / LH - .5) * SH);
function setWin(s, rect) {
  const w = winOf(rect), o = s.win;
  if (o && o.x0 === w.x0 && o.y0 === w.y0 && o.w === w.w && o.h === w.h) return;
  s.win = w;
  if (s.layer.ctx) { s.layer.ctx.canvas.width = w.w * s.res; s.layer.ctx.canvas.height = w.h * s.res; s.layer.base = null; }
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
const BLANK = document.createElement('canvas'); BLANK.width = BLANK.height = 2;
LAYERS.forEach((layer, i) => {
  const y = i * GAPY, group = new THREE.Group(); scene.add(group);
  const win = baseWin(layer);
  const tex = new THREE.CanvasTexture(BLANK); tex.minFilter = THREE.LinearFilter;   // the picture itself is made when the sheet is first switched on (ensure)
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
  if (layer.height) {                                                 // this sheet's tick on the ruler of heights: shown and hidden with the sheet
    const rx = SW * .5 + 110, rz = SH * .5 + 50;
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(rx - 44, y, rz), new THREE.Vector3(rx, y, rz)]), new THREE.LineBasicMaterial({ color: layer.c, transparent: true, opacity: .55 })));
    const hl = label(TT(layer.height), '', '#8fa9c4', mobile ? 52 : 38); hl.position.set(rx + 20, y, rz); group.add(hl); }
  const s = { layer, mesh, tex, y, group, lab, win, on: false, built: false, res: layer.res || 1 }; group.visible = false;
  sheets.push(s); sheetOf[layer.id] = s;
});
// A sheet's picture is made the first time the sheet is shown: thirty canvases nobody is looking at would cost memory and time.
function ensure(s) {
  if (s.built) return; s.built = true;
  const layer = s.layer, win = s.win, made = document.createElement('canvas'); made.width = win.w * s.res; made.height = win.h * s.res;
  if (layer.paint) { layer.ctx = made.getContext('2d', CPU2D); need[layer.id] = true; }
  else { const whole = layer.make(); if (layer.nolive) stampDrawn(whole, layer.c); made.getContext('2d').drawImage(whole, -win.x0, -win.y0); }
  const tex = new THREE.CanvasTexture(made); tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
  s.tex.dispose(); s.tex = tex; s.mesh.material.map = tex; s.mesh.material.needsUpdate = true;
}
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
// the masts, the school pins and their rings stand on the ground sheet, and are shown and hidden with it
const groundThings = new THREE.Group(); scene.add(groundThings);
(I.stations || []).forEach((st, i) => { const lng = st.lng, lat = st.lat;
  const p = p3(lng, lat, ISLAND_Y);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 26, 8),
    new THREE.MeshStandardMaterial({ color: '#9fd4ea', emissive: '#2a6b84', metalness: .7, roughness: .4 }));
  mast.position.set(p.x, ISLAND_Y + 13, p.z); groundThings.add(mast);
  const cup = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#d9f0ff', emissive: '#59d7e8', emissiveIntensity: .7 }));
  cup.position.set(p.x, ISLAND_Y + 28, p.z); groundThings.add(cup);
  beam(new THREE.Vector3(p.x, ISLAND_Y + 28, p.z), new THREE.Vector3(p.x, yOf(i < 3 ? 'wind' : 'air'), p.z), i < 3 ? '#59d7e8' : '#d9b3ff', 'stations');
});
I.schools.forEach((sc) => {
  const p = p3(sc.lng, sc.lat, ISLAND_Y);
  const pin = new THREE.Mesh(new THREE.ConeGeometry(7, 22, 12),
    new THREE.MeshStandardMaterial({ color: '#F7C46B', emissive: '#7a4c10', emissiveIntensity: .8, metalness: .5, roughness: .3 }));
  pin.position.set(p.x, ISLAND_Y + 11, p.z); groundThings.add(pin);
  const ring = new THREE.Mesh(new THREE.RingGeometry(14, 19, 28), new THREE.MeshBasicMaterial({ color: '#F7C46B', transparent: true, opacity: .35, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, ISLAND_Y + 1.5, p.z); groundThings.add(ring);
  beam(new THREE.Vector3(p.x, ISLAND_Y + 22, p.z), new THREE.Vector3(p.x, TOP, p.z), '#F7C46B', 'own', sc.id);
});
const boxes = [];
function sourceBox(id, pos, colour, text, sub, tag, want) {
  const group = new THREE.Group(); scene.add(group);
  const geo = new THREE.BoxGeometry(56, 56, 56);
  const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#16293f', emissive: colour, emissiveIntensity: .25, metalness: .6, roughness: .35 }));
  b.position.copy(pos); group.add(b);
  const w = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: .8 }));
  w.position.copy(pos); group.add(w);
  const lab = label(text, sub, colour, mobile ? 76 : 54); lab.position.set(pos.x + 44, pos.y + 4, pos.z); group.add(lab);
  const bm = beam(pos.clone(), new THREE.Vector3(pos.x, yOf(id), pos.z), colour, tag || null);
  const rec = { id, want: want || (() => true), show: (on) => { group.visible = on; bm.line.visible = on; bm.hidden = !on; } }; boxes.push(rec); rec.show(false); return rec;
}
// A source is named in the scene only while its sheet is on show and its data is really there.
function syncBoxes() { boxes.forEach((b) => b.show(sheetOf[b.id].on && b.want()));
  // the satellites circle the whole stack; while one sheet below the sky is read on its own they step out of the way
  const sky = soloId == null || layerOf(soloId).band === 'SPACE'; [polar, polarLabel, cone, geo, geoLabel, geoCone].forEach((o) => { o.visible = sky; });
  const ground = sheetOf.island.on; groundThings.visible = ground;
  beams.forEach((b) => { if (b.tag === 'own' || b.tag === 'stations') { b.hidden = !ground; b.line.visible = ground; } }); }
sourceBox('wind', new THREE.Vector3(-SW * .6, yOf('wind') + 1.4 * GAPY, -SH * .3), '#7fb3ff', 'Open-Meteo', T('MODEL · 0.25° GRID', 'ΜΟΝΤΕΛΟ · ΠΛΕΓΜΑ 0,25°'), 'model');
sourceBox('population', new THREE.Vector3(SW * .58, yOf('population'), SH * .34), '#C4B8FF', 'CYSTAT', T('CENSUS OF 1 OCTOBER 2021', 'ΑΠΟΓΡΑΦΗ 1ης ΟΚΤΩΒΡΙΟΥ 2021'));
sourceBox('buses', new THREE.Vector3(SW * .58, yOf('buses'), -SH * .05), '#a0d6b4', 'GTFS', T('TIMETABLE FILES · NOT OBSERVED', 'ΑΡΧΕΙΑ ΔΡΟΜΟΛΟΓΙΩΝ · ΟΧΙ ΠΑΡΑΤΗΡΗΣΗ'));
sourceBox('quakes', new THREE.Vector3(-SW * .6, yOf('quakes'), -SH * .1), '#ffd678', 'USGS', T('CATALOGUE OF PAST EVENTS', 'ΚΑΤΑΛΟΓΟΣ ΠΑΛΙΩΝ ΓΕΓΟΝΟΤΩΝ'));
// The seabed's source is named in the scene only once its file has really been loaded.
sourceBox('seabed', new THREE.Vector3(SW * .58, yOf('seabed'), -SH * .3), '#2f7fb8', 'EMODnet', T('BATHYMETRY · PUBLISHED GRID', 'ΒΑΘΥΜΕΤΡΙΑ · ΔΗΜΟΣΙΕΥΜΕΝΟ ΠΛΕΓΜΑ'), null, () => !!seabed && !seabed.meta.testOnly);
sourceBox('ships', new THREE.Vector3(SW * .58, yOf('ships'), SH * .1), '#ffb86b', 'Eurostat', T('PORT STATISTICS · BY QUARTER', 'ΣΤΑΤΙΣΤΙΚΑ ΛΙΜΑΝΙΩΝ · ΑΝΑ ΤΡΙΜΗΝΟ'));
sourceBox('flood', new THREE.Vector3(-SW * .6, yOf('flood'), SH * .36), '#6ec8ff', T('Water Dept.', 'ΤΑΥ'), T('FLOOD SCENARIOS · MODELLED', 'ΣΕΝΑΡΙΑ ΠΛΗΜΜΥΡΑΣ · ΜΟΝΤΕΛΟ'));
sourceBox('aircraft', new THREE.Vector3(-SW * .6, yOf('aircraft') + .5 * GAPY, SH * .1), '#f4fbff', 'adsb.fi', T('VOLUNTEER RECEIVERS · 20 S', 'ΔΕΚΤΕΣ ΕΘΕΛΟΝΤΩΝ · 20 S'), 'adsb');

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
  layers: LAYERS.map((l) => l.id), on: sheets.filter((s) => s.on).map((s) => s.layer.id), built: sheets.filter((s) => s.built).map((s) => s.layer.id), loaded: LAYERS.filter((l) => l.loadedAt).map((l) => l.id),
  opening: LAYERS.filter((l) => l.def).map((l) => l.id), tourAt, revealDone: LAYERS.filter((l) => l.stack && l.revealDone).map((l) => l.id), modes: Object.fromEntries(LAYERS.filter((l) => l.modes).map((l) => [l.id, l.mode])),
  terrain: terrain ? terrain.kind : 'none' });
// one painted sheet at one place: how opaque it is there, and its colour (the tests use it to see that a sheet is empty where it has no data)
window.__inkAt = (id, lng, lat, r) => { const l = layerOf(id); if (!l || !l.ctx) return null; const [x, y] = pxOf(lng, lat), k = r || 3, w = sheetOf[id].win;
  const cx = Math.round(x) - w.x0, cy = Math.round(y) - w.y0; if (cx + k < 0 || cy + k < 0 || cx - k >= w.w || cy - k >= w.h) return { alpha: 0, rgb: [0, 0, 0], outside: true };   // beyond the sheet's window there is no picture at all
  const z = sheetOf[id].res, d = l.ctx.getImageData((cx - k) * z, (cy - k) * z, (2 * k + 1) * z, (2 * k + 1) * z).data; let a = 0, rr = 0, gg = 0, bb = 0;
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
function setOn(s, on) { const was = s.on; s.on = on; s.group.visible = on; if (s.btn) s.btn.setAttribute('aria-pressed', String(on));
  if (on) { ensure(s); if (!was) { restartReveal(s.layer); touch(s.layer.id); } wake(s.layer); } }
// The sheets that are on when nothing is being read on its own: the opening set to start with, then whatever the reader chose.
let baseSet = new Set(LAYERS.filter((l) => l.def).map((l) => l.id)), toolMode = 'default';
const keepBase = () => { if (soloId == null) baseSet = new Set(sheets.filter((s) => s.on).map((s) => s.layer.id)); };
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
    btn.addEventListener('click', () => { setOn(s, !s.on); keepBase(); if (soloId == null) markTools('custom'); syncBoxes(); drawTwins(); paintRail(); });
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
  markTools(soloId == null ? toolMode : 'solo');
  sheets.forEach((s) => {
    setOn(s, soloId == null ? baseSet.has(s.layer.id) : s.layer.id === soloId);
    if (s.solo) s.solo.setAttribute('aria-pressed', String(s.layer.id === soloId));
    if (s.cities) { const show = s.layer.id === soloId; s.cities.hidden = !show; if (show) paintCities(s); }
  });
  fitWindows(); syncBoxes(); drawTwins(); touchAll();               // the sheet on its own gets the whole region, and the names of the places around it
  document.body.classList.toggle('solo-on', soloId != null);
  paintLegend(); paintRail();
  const pose = poseFor(viewMode); flyTo(pose[0], pose[1]);
}
/* ---- the key: for one sheet at a time, what it shows, what the colours and the motion mean, and where it comes from ---- */
const NO_MOVE = () => T('Nothing moves here, because there is no reading to show.', 'Εδώ δεν κινείται τίποτα, γιατί δεν υπάρχει μέτρηση να δείξει.');
const STATE_WORD = { scheduled: ['TIMETABLE, NOT OBSERVED', 'ΔΡΟΜΟΛΟΓΙΟ, ΟΧΙ ΠΑΡΑΤΗΡΗΣΗ'], delayed: ['DELAYED AND ROUNDED, NOT LIVE', 'ΜΕ ΚΑΘΥΣΤΕΡΗΣΗ ΚΑΙ ΣΤΡΟΓΓΥΛΕΜΑ, ΟΧΙ ΖΩΝΤΑΝΑ'], measured: ['MEASURED', 'ΜΕΤΡΗΜΕΝΟ'], model: ['MODEL, NOT A MEASUREMENT', 'ΜΟΝΤΕΛΟ, ΟΧΙ ΜΕΤΡΗΣΗ'], published: ['PUBLISHED FIGURES, NOT LIVE', 'ΔΗΜΟΣΙΕΥΜΕΝΑ ΣΤΟΙΧΕΙΑ, ΟΧΙ ΖΩΝΤΑΝΑ'],
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
    out.push(mk('p', 'lg-gen', T(sheets.filter((s) => s.on).length + ' of the ' + LAYERS.length + ' sheets are switched on. The others wait in the list on the left: press one to switch it on, or "ALL" for every sheet at once. A census, a list of past events or a past year is drawn standing still; only what is live, delayed or planned for this minute keeps moving.',
      sheets.filter((s) => s.on).length + ' από τα ' + LAYERS.length + ' φύλλα είναι αναμμένα. Τα υπόλοιπα περιμένουν στη λίστα αριστερά: πάτα ένα για να το ανάψεις, ή "ΟΛΑ" για όλα μαζί. Μια απογραφή, ένας κατάλογος παλιών γεγονότων ή μια περασμένη χρονιά σχεδιάζονται ακίνητα· μόνο ό,τι είναι ζωντανό, καθυστερημένο ή προγραμματισμένο για αυτό το λεπτό συνεχίζει να κινείται.')));
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
  const shown = st.kind !== 'none', answers = (layer.stack ? idsOf(layer) : layer.answers || []).map(pd).filter(Boolean);
  // the one line each answer says must be shown, word for word; and, when one of two answers has no data, why
  answers.forEach((p) => { if (Array.isArray(p.honesty)) out.push(mk('p', 'lg-honest', TT(p.honesty))); if (shown && p.available === false && p.reason) out.push(mk('p', 'lg-mark', TT(p.reason))); });
  const scKey = typeof info.scale === 'function' ? info.scale() : info.scale;
  if (scKey && shown) {
    const sc = SCALE[scKey], box = mk('div', 'lg-scale'), ends = sc.ends || [['low', 'χαμηλά'], ['high', 'ψηλά']], unit = T(sc.unit, sc.unitEl || sc.unit);
    box.append(mk('div', 'lg-scale-name', TT(SCALE_NAME[scKey]) + (unit ? ' · ' + unit : '')));
    const bar = mk('div', 'lg-bar'); bar.style.background = cssScale(sc); box.append(bar);
    const ticks = mk('div', 'lg-ticks'), mid = Math.round((sc.min + sc.max) / 2 * 100) / 100;
    [TT(ends[0]) + ' ' + sc.min, String(mid), sc.max + (sc.top ? '' : '+') + ' ' + TT(ends[1])].forEach((x) => ticks.append(mk('span', null, x)));
    box.append(ticks); out.push(box);
  }
  if (info.unit && shown) { const box = mk('div', 'lg-scale'); box.append(mk('div', 'lg-scale-name', say(info.unit))); out.push(box); }
  const moveLine = info.always ? say(info.never) : !shown ? NO_MOVE() : info.never ? say(info.never) : info.move ? say(still() ? info.rest : info.move) : NO_MOVE();
  const mv = mk('p', 'lg-move'); mv.append(mk('b', null, T('Motion: ', 'Κίνηση: ')), moveLine); out.push(mv);
  const marks = typeof info.marks === 'function' ? info.marks() : info.marks;
  if (shown && marks) marks.forEach((m) => out.push(mk('p', 'lg-mark', TT(m))));
  const modes = layer.modes && shown ? layer.modes() : [];
  if (modes.length > 1) { const row = mk('div', 'lg-modes'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', T('Choose what this sheet shows', 'Διάλεξε τι δείχνει αυτό το φύλλο'));
    modes.forEach((m) => { const b = mk('button', 'lg-mode', TT(m.name)); b.type = 'button'; b.dataset.mode = m.id; b.setAttribute('aria-pressed', String(layer.mode === m.id));
      b.addEventListener('click', () => { layer.mode = m.id; restartReveal(layer); touch(layer.id); paintLegend(); const again = [...legend.querySelectorAll('.lg-mode')].find((x) => x.dataset.mode === m.id); if (again) again.focus(); });
      row.append(b); }); out.push(row); }
  const spots = layer.spots && shown ? layer.spots() : [];
  if (spots.length) { const row = mk('div', 'lg-modes lg-spots'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', T('Fly close to a place on this sheet', 'Πέτα κοντά σε ένα σημείο αυτού του φύλλου'));
    spots.forEach((sp) => { const b = mk('button', 'lg-spot', T('Fly to ', 'Πέτα σε: ') + TT(sp.name)); b.type = 'button';
      b.addEventListener('click', () => { const pose = spotPose(yOf(layer.id), sp.lng, sp.lat, sp.span); flyTo(pose[0], pose[1]); }); row.append(b); }); out.push(row); }
  const state = mk('div', 'lg-state ' + st.kind); state.setAttribute('aria-live', 'off');   // its age ticks; a screen reader is not told every half minute
  state.append(mk('b', null, TT(STATE_WORD[st.kind])), mk('span', null, (shown ? T('Source: ', 'Πηγή: ') : '') + st.text));
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
  keepBase(); fitWindows(); syncBoxes(); drawTwins(); touchAll();
  document.body.classList.remove('solo-on');
  paintLegend(); paintRail();
};
const tools = document.querySelector('.tools');
const allBtn = document.getElementById('all'), defBtn = document.getElementById('opening'), tourBtn = document.getElementById('tour'), hint = document.getElementById('hint');
const onlyBtn = document.getElementById('measured');
// which button of the toolbar describes what is on show: 'default', 'all', 'measured', 'band:AIR', or none of them
function markTools(mode) { if (mode !== 'solo') toolMode = mode;
  defBtn.setAttribute('aria-pressed', String(mode === 'default')); allBtn.setAttribute('aria-pressed', String(mode === 'all')); onlyBtn.setAttribute('aria-pressed', String(mode === 'measured'));
  tools.querySelectorAll('[data-band]').forEach((o) => o.setAttribute('aria-pressed', String(mode === 'band:' + o.dataset.band))); }
const showOpening = () => { markTools('default'); setAll((s) => !!s.layer.def); };
tools.querySelectorAll('[data-band]').forEach((b) => b.addEventListener('click', () => {
  const band = b.dataset.band, only = b.getAttribute('aria-pressed') !== 'true';
  if (!only) { showOpening(); return; }
  markTools('band:' + band); setAll((s) => s.layer.band === band || s.layer.id === 'island');
}));
// Which sheets stand on a reading rather than on a drawing, a model or a published table: the ones with a measured
// feed, the satellite when a real picture has landed, and a sheet that reports itself as measured right now. A sheet
// that has not been asked for yet cannot say, so "measured only" asks the live ones first.
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
  return ids;                                                      // rain, cloud, waves, ports, seabed, census never qualify: a model or a table is not a gauge
}
onlyBtn.addEventListener('click', async () => {
  if (onlyBtn.getAttribute('aria-pressed') === 'true') { showOpening(); return; }
  markTools('measured');
  // the index of the stack API says which answers are live: only those sheets are asked for, to learn whether they hold a reading now
  try { const r = await fetch('/api/stack', { headers: { accept: 'application/json' } }), idx = r.ok ? await r.json() : null, liveIds = new Set(((idx && idx.sheets) || []).filter((x) => x.live === true).map((x) => x.id));
    await Promise.all(LAYERS.filter((l) => l.stack && !l.asked && idsOf(l).some((id) => liveIds.has(id))).map((l) => loadStack(l).catch(() => {}))); } catch (e) { /* the sheets already asked for can still answer */ }
  if (toolMode !== 'measured') return;
  const ids = measuredIds(); setAll((s) => ids.has(s.layer.id));
});
allBtn.addEventListener('click', () => { markTools('all'); setAll(() => true); });
defBtn.addEventListener('click', showOpening);

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
// close over one place on one sheet (the built-up boxes are 1.8 km wide: a speck until the camera goes down to them)
function spotPose(y, lng, lat, span) { const at = p3(lng, lat, y), width = span * I.k / RW * SW, wide = innerWidth > 860;
  const d = Math.max(16, 1.3 * width / (2 * Math.tan(19 * Math.PI / 180) * Math.min(1, camera.aspect) * (wide ? .5 : 1))), n = Math.hypot(.1, .9, .5);
  return [[at.x - .1 / n * d, y + .9 / n * d, at.z + .5 / n * d], [at.x, y, at.z]]; }
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
// The whole region with the opening set first; then every sheet in turn, on its own with its key, from the seabed up to
// the satellite; then back to the opening view, and round again. With reduced motion it does not start by itself, and if
// it is switched on the camera steps from view to view without flying. ?tour=0 opens the page with the tour off.
const TOUR_OPEN = 12, TOUR_HOLD = 8;
let tour = Q.get('tour') === '0' ? false : !still(), tourT = 0, tourAt = -1, touring = false;
function tourStep(dt) {
  tourT += dt; if (tourT < (tourAt === -1 ? TOUR_OPEN : TOUR_HOLD)) return;
  tourT = 0; tourAt = tourAt + 1 >= LAYERS.length ? -1 : tourAt + 1;
  touring = true;
  try { if (tourAt === -1) { if (soloId != null) setSolo(soloId); showOpening(); setView('region'); } else { if (soloId === LAYERS[tourAt].id) soloId = null; setSolo(LAYERS[tourAt].id); } }
  finally { touring = false; }
}
const ease = (a, b, f) => a + (b - a) * (f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);
tourBtn.setAttribute('aria-pressed', String(tour)); hint.hidden = !tour;
function stopTour() { if (!tour || touring) return; tour = false; tourBtn.setAttribute('aria-pressed', 'false'); hint.hidden = true; }
tourBtn.addEventListener('click', () => { tour = !tour; tourT = 0; tourAt = soloId == null ? -1 : LAYERS.findIndex((l) => l.id === soloId); tourBtn.setAttribute('aria-pressed', String(tour)); hint.hidden = !tour; });
// taking hold of anything on the page ends the tour: the reader is in charge from then on
document.querySelector('.ui').addEventListener('click', (e) => { if (!(e.target.closest && e.target.closest('#tour'))) stopTour(); }, true);
// Full screen: the browser's own full screen for the whole 3D page (inside the home-page frame it fills the display too). Where a
// browser has none (an iPhone), the stack opens on its own page at full size instead. Esc leaves, as in every browser.
const fullBtn = document.getElementById('full'), fsRoot = document.documentElement;
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function fsSync() { const on = fsOn(); fullBtn.setAttribute('aria-pressed', String(on)); fullBtn.textContent = on ? T('EXIT FULL SCREEN', 'ΕΞΟΔΟΣ ΑΠΟ ΠΛΗΡΗ ΟΘΟΝΗ') : T('FULL SCREEN', 'ΠΛΗΡΗΣ ΟΘΟΝΗ'); }
fullBtn.addEventListener('click', () => {
  if (fsOn()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const ask = fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen;
  if (ask) { const r = ask.call(fsRoot); if (r && r.catch) r.catch(() => {}); return; }
  if (window.top !== window) { try { window.top.location.assign('/stack.html?lang=' + (EL ? 'el' : 'en')); } catch (e) { window.open('/stack.html?lang=' + (EL ? 'el' : 'en'), '_blank'); } }
});
document.addEventListener('fullscreenchange', fsSync); document.addEventListener('webkitfullscreenchange', fsSync);
controls.addEventListener('start', () => { stopTour(); fly = null; });
canvas.addEventListener('wheel', () => { stopTour(); fly = null; }, { passive: true });

let fly = null;
function flyTo(pos, tgt) {
  stopTour();
  if (still()) { camera.position.set(pos[0], pos[1], pos[2]); controls.target.set(tgt[0], tgt[1], tgt[2]); fly = null; return; }
  fly = { p0: camera.position.toArray(), t0: controls.target.toArray(), p1: pos, t1: tgt, f: 0 };
}

function size() { const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
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
    .then(() => { loading.delete(l.id); if (!l.everLoaded) { l.everLoaded = true; restartReveal(l); } fitWindows(); touch(l.id); syncBoxes(); paintRail(); markBeams(); refreshLegend(soloId === l.id); paintSolo(); });
}
// asked for when the sheet is first switched on; after that, again only when its own pace says so
function wake(l) { if (!l.load) return; if (!l.loadedAt || (l.every && Date.now() - l.loadedAt > l.every)) runLoad(l); }
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
    if (!(need[l.id] || (anim && l.beat && movesNow(l) && (frame + i) % (l.beat * slow) === 0))) continue;
    const p0 = PROF ? performance.now() : 0, since = l.paintedAt == null ? dt : t - l.paintedAt;
    l.ctx.setTransform(s.res, 0, 0, s.res, -s.win.x0 * s.res, -s.win.y0 * s.res);   // paint in sheet pixels, whatever part of the sheet this canvas covers and however fine it is
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
  if (tour) tourStep(dt);
  if (fly) {
    fly.f = Math.min(1, fly.f + dt / .9);
    camera.position.set(ease(fly.p0[0], fly.p1[0], fly.f), ease(fly.p0[1], fly.p1[1], fly.f), ease(fly.p0[2], fly.p1[2], fly.f));
    controls.target.set(ease(fly.t0[0], fly.t1[0], fly.f), ease(fly.t0[1], fly.t1[1], fly.f), ease(fly.t0[2], fly.t1[2], fly.f));
    if (fly.f >= 1) fly = null;
  }
  { const d = camera.position.distanceTo(controls.target), near = d < 400 ? .4 : 2;      // close over a city box the camera needs to see things an arm's length away
    if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); } }
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
  lab.position.set(p.x + 14, ISLAND_Y + 34, p.z); groundThings.add(lab);
  const halo = new THREE.Mesh(new THREE.RingGeometry(16, 20, 40),
    new THREE.MeshBasicMaterial({ color: '#F7C46B', transparent: true, opacity: .5, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(p.x, ISLAND_Y + 2.5, p.z); groundThings.add(halo);
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
  seaF = mkField(seaPts.filter((p) => p.sst != null), (p) => p.sst); seaField();
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
      sheet.built = true; sheet.tex = tex; sheet.mesh.material.map = tex;
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
showOpening(); paintProbe();                                         // the opening set is switched on: only these sheets are made and asked for now
loadLive(); loadSatellite(); loadTerrain(0);
setInterval(() => { if (!document.hidden) sheets.forEach((s) => { if (s.on && s.layer.loadedAt) wake(s.layer); }); }, 2000);
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
