/*
  The Cyprus data stack in 3D (#/stack): every layer Kleanthis holds, from the seabed up to space, with the source of each one
  drawn in the scene. Shown inside the site shell through a same-origin frame (pages/stack.js), the way the city page is.

  Honest limits, printed on the page itself: the values are illustrative, and the relief and rasters are drawn here rather
  than fetched, so this is the shape of the instrument and not yet the instrument. Each sheet is wired to its real feed one
  at a time; the sensors sheet is the one whose data is already ours.
  Privacy: no vehicle and no person is drawn, and no sensor is shown as a position apart from the four school sites.
*/
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const I = window.ISLAND;
const ISL = new Path2D(); Object.values(I.districts).forEach((p) => ISL.addPath(new Path2D(p)));
const uv = (lng, lat) => { const b = I.bbox; return [(lng - b[0]) * I.k * I.sx / I.W, 1 - (lat - b[1]) * I.sx / I.H]; };
const hash = (x, y) => { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v) + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v; }
function fbm(x, y, o = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= .5; } return s; }
const mobile = Math.min(innerWidth, innerHeight) < 700;
const Q = new URLSearchParams(location.search);
const EL = Q.get('lang') === 'el';
const T = (en, el) => (EL ? el : en);
// People who ask for less motion get a still picture that carries the same information: arrows instead of moving
// lines, rings that stand instead of rings that spread, and no camera tour.
const RMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const still = () => !!(RMQ && RMQ.matches);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// every label on the page carries both languages
document.documentElement.lang = EL ? 'el' : 'en';
document.querySelectorAll('[data-el]').forEach((n) => { if (EL) n.textContent = n.getAttribute('data-el'); });
document.querySelectorAll('[data-ael]').forEach((n) => { if (EL) n.setAttribute('aria-label', n.getAttribute('data-ael')); });

/* ---- relief: Troodos, the Kyrenia ridge and the plain between them ---- */
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
  const px = (lng, lat) => { const [u, v] = uv(lng, lat); return [u * GW, v * GH]; };
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
const LW = mobile ? 384 : 512, LH = Math.round(LW * I.H / I.W);
const buf = () => { const c = document.createElement('canvas'); c.width = LW; c.height = LH; return c; };
const gi = (x, y) => Math.floor(y * GH / LH) * GW + Math.floor(x * GW / LW);
const ramp = (t, st) => { for (let i = 1; i < st.length; i++) if (t <= st[i][0] || i === st.length - 1) {
  const a = st[i - 1], b = st[i], f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]; } };
function raster(fn, seaFn) {
  const c = buf(), ctx = c.getContext('2d'), img = ctx.createImageData(LW, LH);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const i = (y * LW + x) * 4, g = gi(x, y);
    const o = g0.land[g] >= .5 ? fn(x, y, g) : (seaFn ? seaFn(x, y, g) : null);
    if (!o) { img.data[i + 3] = 0; continue; }
    img.data[i] = o[0]; img.data[i + 1] = o[1]; img.data[i + 2] = o[2]; img.data[i + 3] = o[3];
  }
  ctx.putImageData(img, 0, 0); return c;
}
// the districts share borders, so stroke underneath and lay the raster on top: only the coastline survives
const coastUnder = (c, colour, w) => {
  const t = buf(), tx = t.getContext('2d');
  tx.save(); tx.scale(LW / I.W, LH / I.H);
  tx.strokeStyle = colour; tx.lineWidth = (w || 1.3) * 2.2 * I.W / LW; tx.lineJoin = 'round'; tx.stroke(ISL); tx.restore();
  tx.drawImage(c, 0, 0);
  const ctx = c.getContext('2d'); ctx.clearRect(0, 0, LW, LH); ctx.drawImage(t, 0, 0);
};
const hillshade = (g, base) => { const hx = (g0.h[g + 1] - g0.h[g - 1]) * 34, hy = (g0.h[g + GW] - g0.h[g - GW]) * 34;
  const len = Math.hypot(-hx, -hy, 1), lam = Math.min(.95, Math.max(.12, (hx * .62 + hy * .55 + .56) / len));
  return base.map((v) => Math.min(255, v * (.3 + lam * .62))); };

/* ---- the layers, seabed up to space ---- */
// The sheets that are painted from what arrives: each has its own canvas, repainted when a reading lands.
const windC = buf(), rainC = buf(), cloudC = buf(), airC = buf(), seaC = buf(), islandC = buf();
const NP = mobile ? 700 : 1500, pcl = new Float32Array(NP * 4);
for (let i = 0; i < NP; i++) { pcl[i * 4] = Math.random() * LW; pcl[i * 4 + 1] = Math.random() * LH; pcl[i * 4 + 3] = Math.random() * 80; }

/* ---- the colour scales: one per quantity, fixed, so the same colour always means the same number ---- */
const SCALE = {
  wind: { min: 0, max: 15, unit: 'm/s', st: [[0, 38, 96, 128], [.3, 89, 215, 232], [.65, 232, 251, 255], [1, 247, 196, 107]] },
  temp: { min: 0, max: 40, unit: '°C', st: [[0, 70, 110, 220], [.3, 80, 200, 230], [.55, 240, 225, 120], [.8, 245, 150, 70], [1, 225, 70, 60]] },
  sst: { min: 12, max: 30, unit: '°C', st: [[0, 70, 110, 220], [.3, 80, 200, 230], [.55, 240, 225, 120], [.8, 245, 150, 70], [1, 225, 70, 60]] },
  pm25: { min: 0, max: 50, unit: 'µg/m³', st: [[0, 70, 60, 120], [.4, 170, 120, 235], [.75, 240, 150, 220], [1, 255, 225, 200]] },
  cloud: { min: 0, max: 100, unit: '%', st: [[0, 30, 40, 55], [1, 236, 244, 255]] },
  rain: { min: 0, max: 5, unit: 'mm', st: [[0, 40, 70, 130], [1, 130, 190, 255]] },
};
const colOf = (sc, v) => ramp(clamp01((v - sc.min) / (sc.max - sc.min)), sc.st).map(Math.round);
const rgb = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a == null ? 1 : a})`;
const cssScale = (sc) => 'linear-gradient(90deg,' + sc.st.map((s) => `rgb(${s[1]},${s[2]},${s[3]}) ${Math.round(s[0] * 100)}%`).join(',') + ')';
const pxOf = (lng, lat) => { const [u, v] = uv(lng, lat); return [u * LW, v * LH]; };

/* ---- a sheet that has nothing to show says so, in words, on the sheet itself ---- */
function hatch(x, colour) { x.save(); x.strokeStyle = colour; x.globalAlpha = .16; x.lineWidth = 1; x.beginPath();
  for (let k = -LH; k < LW; k += 16) { x.moveTo(k, LH); x.lineTo(k + LH, 0); } x.stroke(); x.restore(); }
function pill(x, text, colour, cy) {
  const fs = mobile ? 10 : 13; x.save(); x.font = `800 ${fs}px ui-monospace, Menlo, monospace`;
  const w = Math.min(LW - 8, x.measureText(text).width + 22), h = fs + 14, x0 = (LW - w) / 2, y0 = (cy == null ? LH / 2 : cy) - h / 2;
  x.fillStyle = 'rgba(4,10,18,.9)'; x.strokeStyle = colour; x.lineWidth = 1.2;
  x.beginPath(); if (x.roundRect) x.roundRect(x0, y0, w, h, 7); else x.rect(x0, y0, w, h); x.fill(); x.stroke();
  x.fillStyle = colour; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, LW / 2, y0 + h / 2 + .5, w - 12); x.restore(); }
const DRAWN_WORDS = () => T('EXAMPLE DRAWING · NO LIVE DATA YET', 'ΣΧΕΔΙΟ-ΠΑΡΑΔΕΙΓΜΑ · ΧΩΡΙΣ ΖΩΝΤΑΝΑ ΔΕΔΟΜΕΝΑ ΑΚΟΜΗ');
// a sheet with no feed keeps its drawing, but faded and striped, with the words across it
function stampDrawn(c, colour) { const x = c.getContext('2d');
  x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 0, LW, LH); x.restore();
  hatch(x, colour); pill(x, DRAWN_WORDS(), colour); return c; }
// a sheet that is fed, at a moment when nothing has arrived for it
function emptySheet(c, colour, text) { const x = c.getContext('2d'); x.clearRect(0, 0, LW, LH); hatch(x, colour); pill(x, text, colour); }

/* ---- a model gives numbers at grid points; between them the value is filled in by distance (and the key says so) ---- */
const FW = 64, FH = Math.max(8, Math.round(FW * LH / LW));
const smallC = document.createElement('canvas'); smallC.width = FW; smallC.height = FH;
function idw(points, get) {
  const pts = [];
  (points || []).forEach((p) => { const v = get(p); if (v == null || !isFinite(v) || p.lat == null || p.lng == null) return;
    const [x, y] = pxOf(p.lng, p.lat); pts.push([x * FW / LW - .5, y * FH / LH - .5, v]); });
  if (!pts.length) return null;
  const a = new Float32Array(FW * FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { let s = 0, w = 0;
    for (const [qx, qy, v] of pts) { const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d2 < 1e-4) { s = v; w = 1; break; } const k = 1 / (d2 * d2); s += k * v; w += k; }
    a[y * FW + x] = s / w; }
  return a;
}
function sampleF(a, x, y) {
  const fx = Math.min(FW - 1, Math.max(0, x * FW / LW - .5)), fy = Math.min(FH - 1, Math.max(0, y * FH / LH - .5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(FW - 1, x0 + 1), y1 = Math.min(FH - 1, y0 + 1), u = fx - x0, v = fy - y0;
  return a[y0 * FW + x0] * (1 - u) * (1 - v) + a[y0 * FW + x1] * u * (1 - v) + a[y1 * FW + x0] * (1 - u) * v + a[y1 * FW + x1] * u * v;
}
function paintField(ctx, a, fn) {
  const sx = smallC.getContext('2d'), img = sx.createImageData(FW, FH);
  for (let i = 0; i < FW * FH; i++) { const o = fn(a[i]); img.data[i * 4] = o[0]; img.data[i * 4 + 1] = o[1]; img.data[i * 4 + 2] = o[2]; img.data[i * 4 + 3] = o[3]; }
  sx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(smallC, 0, 0, LW, LH);
}
function gridDots(ctx, pts, colour) { ctx.fillStyle = colour;
  (pts || []).forEach((p) => { const [x, y] = pxOf(p.lng, p.lat); ctx.fillRect(x - 1, y - 1, 2, 2); }); }
// The coast as a thin line, for the sheets of the air: without it nobody can tell where on the island a number sits.
const coastC = (() => { const c = buf(), x = c.getContext('2d');
  x.save(); x.scale(LW / I.W, LH / I.H); x.strokeStyle = 'rgba(200,225,245,.75)'; x.lineWidth = 2.6 * I.W / LW; x.lineJoin = 'round'; x.stroke(ISL);
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fill(ISL); x.restore(); return c; })();
const coast = (c) => { c.globalCompositeOperation = 'source-over'; c.drawImage(coastC, 0, 0); };
const tinyText = (c, text, x, y) => { c.font = `700 ${mobile ? 8 : 10}px ui-monospace, Menlo, monospace`; c.lineWidth = 2.4; c.strokeStyle = 'rgba(2,6,12,.9)';
  c.strokeText(text, x, y); c.fillStyle = '#f3f8fd'; c.fillText(text, x, y); };

// Which live measurement stands behind each sheet. A sheet with no entry here is drawn, not measured, and says so.
const FEED = {
  island: { vars: ['temperature', 'co2', 'pm25'], own: true },
  air: { vars: ['pm25', 'pm10', 'ozone'] },
  wind: { vars: ['wind_speed'] },
  seabed: { vars: ['sea_surface_temperature', 'wave_height'] },
};
const LAYERS = [
  { id: 'seabed', band: 'WATER', name: 'Seabed and sea temperature', src: 'EMODnet DTM · Open-Meteo marine', nameEl: 'Βυθός και θερμοκρασία θάλασσας', srcEl: 'EMODnet DTM · θαλάσσιο Open-Meteo', val: '22.8', unit: '°C', c: '#2f7fb8', state: 'live', live: seaC,
    make: () => { const c = raster(() => null, (x, y, g) => { const d = Math.min(1, g0.inland[g] * 7), s = 1 - d, n = fbm(x / 26, y / 16, 3);
      return [8 + s * 18 + n * 12, 36 + s * 50 + n * 20, 62 + s * 76 + n * 24, 240]; }); coastUnder(c, 'rgba(120,200,240,.5)'); return c; } },
  { id: 'water', band: 'WATER', name: 'Reservoirs and river reaches', src: 'Water Development Department', nameEl: 'Φράγματα και τμήματα ποταμών', srcEl: 'Τμήμα Αναπτύξεως Υδάτων', val: '31.4', unit: 'MM³', c: '#5bc8e0', state: 'year', nolive: true,
    make: () => { const c = buf(), x = c.getContext('2d'); x.strokeStyle = 'rgba(91,200,224,.6)'; x.lineWidth = 1.1;
      for (let i = 0; i < 24; i++) { let px = LW * (.3 + hash(i, 3) * .42), py = LH * (.3 + hash(i, 9) * .3);
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 22; k++) { const cx = Math.max(1, Math.min(LW - 2, px)), cy = Math.max(1, Math.min(LH - 2, py)), g = gi(cx, cy);
          px += -(g0.h[g + 1] - g0.h[g - 1]) * 150 + (fbm(px / 40, py / 40, 2) - .5) * 5;
          py += -(g0.h[g + GW] - g0.h[g - GW]) * 150 + (fbm(py / 40, px / 40, 2) - .5) * 5;
          if (px < 0 || py < 0 || px > LW || py > LH) break; x.lineTo(px, py); }
        x.globalAlpha = .3 + hash(i, 11) * .5; x.stroke(); }
      x.globalAlpha = 1;
      [[.3, .62, 10], [.42, .55, 7], [.24, .45, 6], [.52, .42, 5]].forEach(([u, v, r]) => {
        const g = x.createRadialGradient(u * LW, v * LH, 1, u * LW, v * LH, r * 2.4);
        g.addColorStop(0, 'rgba(130,225,250,.95)'); g.addColorStop(1, 'rgba(60,150,200,0)');
        x.fillStyle = g; x.beginPath(); x.arc(u * LW, v * LH, r * 2.4, 0, 7); x.fill(); });
      return c; } },
  { id: 'island', band: 'GROUND', name: 'Island relief and sensors', src: 'OpenStreetMap · our SenseCAP cards', nameEl: 'Ανάγλυφο και αισθητήρες', srcEl: 'OpenStreetMap · οι κάρτες SenseCAP μας', val: '21', unit: 'RDG/MIN', c: '#F7C46B', state: 'live', pins: true, live: islandC,
    make: () => { const c = raster((x, y, g) => hillshade(g, ramp(Math.min(1, g0.h[g] / 1.6),
      [[0, 52, 84, 58], [.18, 78, 100, 58], [.4, 112, 110, 68], [.62, 124, 106, 78], [.82, 112, 100, 92], [1, 150, 152, 158]])).concat(255),
      (x, y, g) => { const d = Math.min(1, g0.inland[g] * 6); return [5 + (1 - d) * 10, 18 + (1 - d) * 24, 32 + (1 - d) * 40, 200]; });
      coastUnder(c, 'rgba(190,235,255,.85)', 1.4); return c; } },
  { id: 'city', band: 'CITY', name: 'Streets, buses, EV, people', src: 'OSM · GTFS · CYSTAT census', nameEl: 'Δρόμοι, λεωφορεία, φόρτιση, κάτοικοι', srcEl: 'OSM · GTFS · απογραφή CYSTAT', val: '1 942', unit: 'STOPS', c: '#C4B8FF', state: 'year', nolive: true,
    make: () => { const c = buf(), x = c.getContext('2d');
      const towns = [[.63, .55, 1], [.49, .36, .95], [.3, .72, .9], [.1, .56, .7], [.76, .3, .6], [.38, .2, .5]];
      towns.forEach(([u, v, w]) => { for (let i = 0; i < 120 * w; i++) { const a = i * 2.399, d = Math.sqrt((i % 61) / 61) * 40 * w;
          x.fillStyle = `rgba(196,184,255,${(.5 - d / 120).toFixed(3)})`; x.fillRect(u * LW + Math.cos(a) * d, v * LH + Math.sin(a) * d * .8, 1.4, 1.4); }
        const g = x.createRadialGradient(u * LW, v * LH, 2, u * LW, v * LH, 44 * w);
        g.addColorStop(0, 'rgba(196,184,255,.4)'); g.addColorStop(1, 'rgba(160,140,255,0)');
        x.fillStyle = g; x.beginPath(); x.arc(u * LW, v * LH, 44 * w, 0, 7); x.fill(); });
      x.strokeStyle = 'rgba(214,206,255,.55)'; x.lineWidth = 1;
      [[0, 1], [1, 2], [2, 3], [1, 4], [0, 2], [1, 5]].forEach(([a, b]) => { const A = towns[a], B = towns[b];
        x.beginPath(); x.moveTo(A[0] * LW, A[1] * LH);
        x.quadraticCurveTo((A[0] + B[0]) / 2 * LW + 10, (A[1] + B[1]) / 2 * LH - 8, B[0] * LW, B[1] * LH); x.stroke(); });
      return c; } },
  { id: 'heat', band: 'GROUND', name: 'Ground heat', src: 'MODIS LST · Terra and Aqua', nameEl: 'Θερμότητα εδάφους', srcEl: 'MODIS LST · Terra και Aqua', val: '34.6', unit: '°C LST', c: '#ff9a6b', state: 'old', nolive: true,
    make: () => raster((x, y, g) => { const t = Math.min(1, Math.max(0, .78 - g0.h[g] * .5 + (fbm(x / 40, y / 40, 3) - .5) * .4));
      const [r, gg, b] = ramp(t, [[0, 40, 60, 120], [.4, 120, 90, 110], [.7, 220, 130, 70], [1, 255, 215, 150]]); return [r, gg, b, 120]; }) },
  { id: 'veg', band: 'GROUND', name: 'Greenness', src: 'MODIS NDVI · every 16 days', nameEl: 'Πρασινάδα', srcEl: 'MODIS NDVI · κάθε 16 ημέρες', val: '0.42', unit: 'NDVI', c: '#8fd98a', state: 'old', nolive: true,
    make: () => raster((x, y, g) => { const n = Math.min(1, Math.max(0, fbm(x / 28, y / 28, 4) * 1.4 - .18 + g0.h[g] * .3));
      const [r, gg, b] = ramp(n, [[0, 120, 104, 70], [.45, 118, 140, 72], [1, 46, 136, 62]]); return [r, gg, b, 115]; }) },
  { id: 'air', band: 'AIR', name: 'Air quality', src: 'Open-Meteo air-quality model · grid', nameEl: 'Ποιότητα αέρα', srcEl: 'Μοντέλο ποιότητας αέρα Open-Meteo · πλέγμα', val: '9.3', unit: 'µG/M³', c: '#d9b3ff', state: 'live', live: airC },
  { id: 'wind', band: 'AIR', name: 'Wind at 10 m', src: 'Open-Meteo model grid · airport readings', nameEl: 'Άνεμος στα 10 m', srcEl: 'Πλέγμα μοντέλου Open-Meteo · μετρήσεις αεροδρομίων', val: '5.1', unit: 'M/S 285°', c: '#59d7e8', state: 'live', live: windC },
  { id: 'rain', band: 'AIR', name: 'Rain this hour', src: 'Open-Meteo model · 11 km grid', nameEl: 'Βροχή αυτή την ώρα', srcEl: 'Μοντέλο Open-Meteo · πλέγμα 11 km', val: '0.4', unit: 'MM', c: '#7fb3ff', state: 'live', live: rainC },
  { id: 'haze', band: 'AIR', name: 'Haze and aerosol column', src: 'AERONET sun photometers · CAMS', nameEl: 'Αιθαλομίχλη και αερολύματα', srcEl: 'Ηλιακά φωτόμετρα AERONET · CAMS', val: '0.18', unit: 'AOD', c: '#ffd7a8', state: 'old', nolive: true,
    make: () => raster((x, y) => [255, 210, 160, 26 + fbm(x / 54 + 4, y / 54, 4) * 80], (x, y) => [255, 210, 160, 14 + fbm(x / 54 + 4, y / 54, 4) * 44]) },
  { id: 'cloud', band: 'SPACE', name: 'Clouds', src: 'Open-Meteo weather model · grid', nameEl: 'Σύννεφα', srcEl: 'Μοντέλο καιρού Open-Meteo · πλέγμα', val: '38', unit: '% COVER', c: '#e8f4ff', state: 'old', live: cloudC },
  { id: 'sat', band: 'SPACE', name: 'Satellite picture', src: 'NASA GIBS · pass 17:00Z', nameEl: 'Δορυφορική εικόνα', srcEl: 'NASA GIBS · πέρασμα 17:00Z', val: '1', unit: 'PASS', c: '#9fe0f5', state: 'old', sweep: true,
    make: () => { const c = raster((x, y, g) => { const n = fbm(x / 18, y / 18, 5), veg = Math.min(1, Math.max(0, n * 1.5 - .25 + g0.h[g] * .25));
      return [128 - veg * 76, 116 + veg * 42, 78 - veg * 34, 215]; }); coastUnder(c, 'rgba(200,240,255,.5)'); return c; } },
];

/* ---- scene ---- */
const canvas = document.getElementById('gl');
// Shown inside another page (the home page) the scene sits on that page's own background rather than on its own
// black, so the section matches everything around it. On its own page nothing changes.
const SITE_BG = new URLSearchParams(location.search).get('bg') === 'site';
if (SITE_BG) document.documentElement.classList.add('on-site');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance', alpha: SITE_BG });
renderer.setPixelRatio(Math.min(mobile ? 1.5 : 2, devicePixelRatio || 1));
const scene = new THREE.Scene(); scene.background = SITE_BG ? null : new THREE.Color('#02050a');
const camera = new THREE.PerspectiveCamera(38, 2, 1, 20000);
camera.position.set(-1850, 1420, 2050);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .06;
controls.minDistance = 220; controls.maxDistance = 5200;
controls.target.set(0, 540, 0);
scene.add(new THREE.AmbientLight('#9ec4e6', 1));
const key = new THREE.DirectionalLight('#eef6ff', 1.5); key.position.set(-500, 900, 500); scene.add(key);
const rim = new THREE.DirectionalLight('#4CCBEA', .55); rim.position.set(600, 240, -700); scene.add(rim);

const SW = 1200, SH = SW * I.H / I.W, GAPY = 78;
{
  const n = mobile ? 700 : 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const r = 6000 + Math.random() * 3000, a = Math.random() * 6.283, b = (Math.random() - .5) * 2.2;
    pos[i * 3] = Math.cos(a) * Math.cos(b) * r; pos[i * 3 + 1] = Math.sin(b) * r * .6 + 600; pos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * r; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#bcd6f2', size: 7, sizeAttenuation: true, transparent: true, opacity: .75 })));
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
const sheets = [];
LAYERS.forEach((layer, i) => {
  const y = i * GAPY, group = new THREE.Group(); scene.add(group);
  // A fed sheet that also has a drawn floor (the sea bed, the relief) keeps the floor and paints the readings on top.
  if (layer.live && layer.make) { layer.base = layer.make();
    if (layer.id === 'seabed') { const bx = layer.base.getContext('2d');   // the land is not sea: one flat dark shape, so the sea points stand out around it
      bx.save(); bx.scale(LW / I.W, LH / I.H); bx.fillStyle = '#0b1826'; bx.fill(ISL); bx.restore(); }
    layer.live.getContext('2d').drawImage(layer.base, 0, 0); }
  const made = layer.live || layer.make();
  if (layer.nolive) stampDrawn(made, layer.c);
  const tex = new THREE.CanvasTexture(made); tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
  const solid = layer.id === 'island' || layer.id === 'seabed';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: solid,
    opacity: solid ? 1 : layer.band === 'AIR' ? .72 : .8,
    blending: (layer.band === 'AIR' && layer.id !== 'haze') || layer.id === 'cloud' ? THREE.AdditiveBlending : THREE.NormalBlending }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; group.add(mesh);
  const pts = [[-SW / 2, -SH / 2], [SW / 2, -SH / 2], [SW / 2, SH / 2], [-SW / 2, SH / 2], [-SW / 2, -SH / 2]].map(([a, b]) => new THREE.Vector3(a, y, b));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: layer.c, transparent: true, opacity: .3 })));
  const lab = label(T(layer.name, layer.nameEl), T(layer.src, layer.srcEl), layer.c, mobile ? 62 : 46);
  lab.position.set(-SW / 2 - 40, y + 4, SH / 2 + 40); group.add(lab);
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-SW / 2, y, SH / 2), new THREE.Vector3(-SW / 2 - 42, y, SH / 2 + 42)]),
    new THREE.LineBasicMaterial({ color: layer.c, transparent: true, opacity: .45 })));
  sheets.push({ layer, mesh, tex, y, group, on: true });
});
const TOP = (LAYERS.length - 1) * GAPY, ISLAND_Y = 2 * GAPY;

/* ---- where each layer comes from ---- */
const beams = [];
function beam(from, to, colour, tag, city) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: .35 })); scene.add(line);
  const dots = [];
  for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), new THREE.MeshBasicMaterial({ color: colour }));
    scene.add(d); dots.push({ mesh: d, t: i / 3 }); }
  beams.push({ from, to, dots, tag: tag || null, city: city || null });
}
const p3 = (lng, lat, y) => { const [u, v] = uv(lng, lat); return new THREE.Vector3((u - .5) * SW, y, (v - .5) * SH); };
(I.stations || []).forEach((st, i) => { const lng = st.lng, lat = st.lat;
  const p = p3(lng, lat, ISLAND_Y);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 26, 8),
    new THREE.MeshStandardMaterial({ color: '#9fd4ea', emissive: '#2a6b84', metalness: .7, roughness: .4 }));
  mast.position.set(p.x, ISLAND_Y + 13, p.z); scene.add(mast);
  const cup = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#d9f0ff', emissive: '#59d7e8', emissiveIntensity: .7 }));
  cup.position.set(p.x, ISLAND_Y + 28, p.z); scene.add(cup);
  beam(new THREE.Vector3(p.x, ISLAND_Y + 28, p.z), new THREE.Vector3(p.x, (i < 3 ? 7 : 6) * GAPY, p.z), i < 3 ? '#59d7e8' : '#d9b3ff', 'stations');
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
  const geo = new THREE.BoxGeometry(34, 34, 34);
  const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#16293f', emissive: colour, emissiveIntensity: .25, metalness: .6, roughness: .35 }));
  b.position.copy(pos); scene.add(b);
  const w = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: .8 }));
  w.position.copy(pos); scene.add(w);
  const lab = label(text, sub, colour, mobile ? 44 : 30); lab.position.set(pos.x + 26, pos.y + 4, pos.z); scene.add(lab);
  beam(pos.clone(), new THREE.Vector3(pos.x, toY, pos.z), colour, tag || null);
}
sourceBox(new THREE.Vector3(-SW * .62, 9.4 * GAPY, -SH * .3), '#7fb3ff', 'Open-Meteo', T('MODEL · 11 KM GRID', 'ΜΟΝΤΕΛΟ · ΠΛΕΓΜΑ 11 KM'), 8 * GAPY, 'model');
sourceBox(new THREE.Vector3(SW * .6, 3 * GAPY, SH * .34), '#C4B8FF', 'CYSTAT · GTFS', T('PUBLISHED FILES', 'ΔΗΜΟΣΙΕΥΜΕΝΑ ΑΡΧΕΙΑ'), 3 * GAPY);
sourceBox(new THREE.Vector3(SW * .6, 0, -SH * .3), '#2f7fb8', 'EMODnet', T('BATHYMETRY · BUOYS', 'ΒΑΘΥΜΕΤΡΙΑ · ΣΗΜΑΔΟΥΡΕΣ'), 0);
sourceBox(new THREE.Vector3(-SW * .6, 1 * GAPY, SH * .36), '#5bc8e0', T('WDD gauges', 'Μετρητές ΤΑΥ'), T('RESERVOIRS · REACHES', 'ΦΡΑΓΜΑΤΑ · ΤΜΗΜΑΤΑ'), 1 * GAPY);

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
    const grid = new THREE.LineSegments(new THREE.EdgesGeometry(panelGeo), new THREE.LineBasicMaterial({ color: '#6fb6e8', transparent: true, opacity: .55 }));
    grid.position.x = s * 64; g.add(grid);
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
const polar = satellite(1.7); scene.add(polar);
const geo = satellite(1.25); scene.add(geo); geo.position.set(SW * .95, TOP + 420, -SH * .95);
const geoLabel = label('Meteosat', T('GEOSTATIONARY · 15 MIN', 'ΓΕΩΣΤΑΤΙΚΟΣ · 15 ΛΕΠΤΑ'), '#e8f4ff', mobile ? 44 : 30);
geoLabel.position.copy(geo.position.clone().add(new THREE.Vector3(70, 0, 0))); scene.add(geoLabel);
const polarLabel = label(T('Polar satellite', 'Πολικός δορυφόρος'), T('NASA GIBS · MODIS · PASS 17:00Z', 'NASA GIBS · MODIS · ΠΕΡΑΣΜΑ 17:00Z'), '#9fe0f5', mobile ? 44 : 30); scene.add(polarLabel);
const cone = new THREE.Mesh(new THREE.ConeGeometry(95, 215, 32, 1, true),
  new THREE.MeshBasicMaterial({ color: '#9fe0f5', transparent: true, opacity: .085, side: THREE.DoubleSide, depthWrite: false })); scene.add(cone);
const geoCone = new THREE.Mesh(new THREE.ConeGeometry(120, 420, 32, 1, true),
  new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: .035, side: THREE.DoubleSide, depthWrite: false })); scene.add(geoCone);
{
  const pts = Array.from({ length: 200 }, (_, i) => { const a = i / 199 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * SW * .62, TOP + 215 + Math.sin(a * 2) * 30, Math.sin(a) * SH * .8); });
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineDashedMaterial({ color: '#8FE3F7', transparent: true, opacity: .3, dashSize: 18, gapSize: 24 }));
  l.computeLineDistances(); scene.add(l);
}

/* ---- the sheets that are painted from what arrives ---- */
// Everything below draws only numbers that are in the feed. A sheet with nothing to draw says so in words.
let grid = [];            // the weather model's grid points: wind, rain, cloud at each
let windF = null;         // the wind as two fields in m/s: u blows to the east, v blows to the north
let rainCells = [], rainKnown = false, cellW = 40, cellH = 40;
let cloudF = null, airF = null, airPts = [], specks = [];
let seaPts = [], stationPts = [];
const need = { wind: true, rain: true, cloud: true, air: true, seabed: true, island: true };   // repaint once, even when nothing moves
const WAIT = () => T('WAITING FOR THE FIRST READINGS…', 'ΑΝΑΜΟΝΗ ΓΙΑ ΤΙΣ ΠΡΩΤΕΣ ΜΕΤΡΗΣΕΙΣ…');
const NOTHING = () => T('NO DATA ARRIVED FOR THIS SHEET', 'ΔΕΝ ΗΡΘΑΝ ΔΕΔΟΜΕΝΑ ΓΙΑ ΑΥΤΟ ΤΟ ΦΥΛΛΟ');
const emptyWords = () => (live ? NOTHING() : WAIT());
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
const WIND_PX = 15;       // sheet pixels a line travels each second for every m/s of wind: twice the wind, twice the speed
let windBlank = true;
function windStep(dt, anim) { const c = windC.getContext('2d');
  if (!windF) { emptySheet(windC, '#59d7e8', emptyWords()); windBlank = true; return; }
  if (!anim) {            // the still picture: an arrow at every step of a lattice, pointing downwind, longer and brighter for faster wind
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH); windBlank = true;
    const step = mobile ? 30 : 26;
    for (let y = step / 2; y < LH; y += step) for (let x = step / 2; x < LW; x += step) {
      const u = sampleF(windF.u, x, y), v = sampleF(windF.v, x, y), sp = Math.hypot(u, v); if (sp < .05) continue;
      arrow(c, x, y, Math.atan2(-v, u), 4 + Math.min(15, sp) * 1.3, rgb(colOf(SCALE.wind, sp), .95), 1.3); }
    coast(c); airportArrows(c); return; }
  if (windBlank) { c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH); windBlank = false; }
  c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(3,8,14,.12)'; c.fillRect(0, 0, LW, LH);
  c.lineCap = 'round';                                               // plain paint, not added light: a line keeps the colour of its speed
  for (let i = 0; i < NP; i++) { const o = i * 4, x = pcl[o], y = pcl[o + 1];
    const u = sampleF(windF.u, x, y), v = sampleF(windF.v, x, y), sp = Math.hypot(u, v);
    const nx = x + u * WIND_PX * dt, ny = y - v * WIND_PX * dt, hot = Math.min(1, sp / 10);
    c.strokeStyle = rgb(colOf(SCALE.wind, sp), (.55 + hot * .4).toFixed(3));
    c.lineWidth = .8 + hot; c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
    pcl[o] = nx; pcl[o + 1] = ny; pcl[o + 3]++;
    if (nx < -15 || nx > LW + 15 || ny < -15 || ny > LH + 15 || pcl[o + 3] > 150) { pcl[o] = Math.random() * LW; pcl[o + 1] = Math.random() * LH; pcl[o + 3] = 0; } }
  coast(c); airportArrows(c);
}
// Rain: one square per model grid cell that has rain in it, with its millimetres. Rings (drops landing, seen from
// above) appear only inside those squares, and more of them where the model says more rain. No square, no rain.
function rainStep(t, anim) { const c = rainC.getContext('2d');
  if (!rainKnown) { emptySheet(rainC, '#7fb3ff', emptyWords()); return; }
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH);
  coast(c); gridDots(c, grid, 'rgba(150,190,255,.55)');
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
function cloudPaint() { const c = cloudC.getContext('2d');
  if (!cloudF) { emptySheet(cloudC, '#e8f4ff', emptyWords()); return; }
  c.clearRect(0, 0, LW, LH);
  paintField(c, cloudF, (v) => [236, 244, 255, Math.round(clamp01(v / 100) * 215)]);
  coast(c); gridDots(c, grid, 'rgba(160,190,220,.7)');
}
// Air: the model's fine particles as a colour, and as specks: each candidate speck is kept with a chance that grows
// with PM2.5 at its spot, so more specks really is more particles. They shimmer in place and go nowhere.
function seedSpecks() { specks = []; if (!airF) return;
  const M = mobile ? 700 : 1600;
  for (let i = 0; i < M; i++) { const x = Math.random() * LW, y = Math.random() * LH;
    if (Math.random() < clamp01(sampleF(airF, x, y) / SCALE.pm25.max)) specks.push([x, y, Math.random() * 6.283]); } }
const airBase = buf();
function airField() { const c = airBase.getContext('2d'); c.clearRect(0, 0, LW, LH); if (!airF) return;
  paintField(c, airF, (v) => colOf(SCALE.pm25, v).concat(150)); coast(c); gridDots(c, airPts, 'rgba(240,225,255,.7)'); }
function airStep(t, anim) { const c = airC.getContext('2d');
  if (!airF) { emptySheet(airC, '#d9b3ff', emptyWords()); return; }
  c.clearRect(0, 0, LW, LH); c.drawImage(airBase, 0, 0);
  specks.forEach(([x, y, ph]) => { const k = anim ? t : 0;
    c.fillStyle = `rgba(255,240,255,${(.55 + .35 * Math.sin(k * 1.7 + ph)).toFixed(3)})`;
    c.fillRect(x + Math.sin(k * 1.3 + ph) * 1.4, y + Math.cos(k * 1.1 + ph * 1.7) * 1.4, 1.5, 1.5); });
}
// Sea: one dot per point of the sea model, coloured by sea-surface temperature, with a ring whose width is the wave height.
function seaStep(t, anim) { const c = seaC.getContext('2d'), layer = LAYERS[0];
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH); if (layer.base) c.drawImage(layer.base, 0, 0);
  if (!seaPts.length) { pill(c, emptyWords(), '#8fd0f5'); return; }
  seaPts.forEach((p, i) => { const [x, y] = pxOf(p.lng, p.lat);
    if (p.wave != null) { const R = 4 + Math.min(3, p.wave) * 8, f = anim ? .5 + .5 * Math.sin(t * 1.6 + i * 1.3) : 1;
      c.strokeStyle = 'rgba(225,244,255,.9)'; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, 4 + (R - 4) * f, 0, 7); c.stroke();
      if (anim) { c.strokeStyle = 'rgba(225,244,255,.3)'; c.beginPath(); c.arc(x, y, R, 0, 7); c.stroke(); } }
    if (p.sst != null) { c.fillStyle = rgb(colOf(SCALE.sst, p.sst)); c.strokeStyle = 'rgba(2,6,12,.9)'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); c.stroke(); tinyText(c, fmt(p.sst) + '°', x + 6, y - 5); }
    if (p.wave != null) tinyText(c, fmt(p.wave) + ' m', x + 6, y + 5); });
}
// Ground: the official stations, each a dot coloured by the air temperature it measured. A ring spreads from a station
// that reported in the last half hour; an older reading keeps a wide faint ring that stands still.
const PING_MIN = 30;
function islandStep(t, anim) { const c = islandC.getContext('2d'), layer = LAYERS[2];
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, LW, LH); if (layer.base) c.drawImage(layer.base, 0, 0);
  const now = Date.now();
  stationPts.forEach((p, i) => { const [x, y] = pxOf(p.lng, p.lat), age = p.at ? (now - p.at) / 60000 : null;
    if (age != null && age < PING_MIN) { const ph = anim ? (t * .45 + i * .37) % 1 : .6;
      c.strokeStyle = `rgba(255,255,255,${(.85 * (1 - ph)).toFixed(3)})`; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, 4 + ph * 11, 0, 7); c.stroke(); }
    else { const f = age == null ? 1 : clamp01(age / HALO_FULL);
      c.strokeStyle = `rgba(160,180,205,${(.55 - f * .35).toFixed(3)})`; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 7 + f * 8, 0, 7); c.stroke(); }
    c.fillStyle = rgb(colOf(SCALE.temp, p.temp)); c.strokeStyle = 'rgba(2,6,12,.95)'; c.lineWidth = 1.2;
    c.beginPath(); c.arc(x, y, 3.6, 0, 7); c.fill(); c.stroke(); tinyText(c, fmt(p.temp) + '°', x + 6, y + 3); });
}
// the tests read this: what each painted sheet is standing on right now
window.__sheets = () => ({ still: still(), tour, wind: !!windF, rainKnown, rainCells: rainCells.length, cloud: !!cloudF, air: !!airF,
  specks: specks.length, sea: seaPts.length, stations: stationPts.length, beamsLive: beams.filter((b) => b.live).length });
// how much is painted on the wind sheet, and a sum that changes whenever the picture does (for the reduced-motion test)
window.__windInk = () => { const d = windC.getContext('2d').getImageData(0, 0, LW, LH).data; let lit = 0, sum = 0;
  for (let i = 3; i < d.length; i += 4) { if (d[i] > 40) lit++; sum = (sum + d[i] * (i % 251)) % 1000000007; } return { lit, sum }; };
// the wind the sheet draws at one place, as a bearing it comes FROM and a speed, so a test can hold it against the feed
window.__windAt = (lng, lat) => { if (!windF) return null; const [x, y] = pxOf(lng, lat), u = sampleF(windF.u, x, y), v = sampleF(windF.v, x, y);
  return { from: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360, ms: Math.hypot(u, v) }; };

/* ---- the rail, and what the buttons do ---- */
const rail = document.getElementById('rail');
['SPACE', 'AIR', 'GROUND', 'CITY', 'WATER'].forEach((b) => {
  const h = document.createElement('div'); h.className = 'band'; h.textContent = b; rail.appendChild(h);
  LAYERS.filter((x) => x.band === b).slice().reverse().forEach((x) => {
    const s = sheets.find((y) => y.layer.id === x.id);
    const btn = document.createElement('button');
    btn.className = 'lay'; btn.type = 'button'; btn.style.setProperty('--c', x.c); btn.setAttribute('aria-pressed', 'true');
    btn.innerHTML = `<span class="key"></span><span class="nm"><b></b><small></small></span>
      <span class="val"></span><span class="st ${x.state}"></span><i class="go" aria-hidden="true"></i>`;
    btn.querySelector('b').textContent = T(x.name, x.nameEl);
    btn.querySelector('small').textContent = T(x.src, x.srcEl);
    btn.querySelector('.val').innerHTML = `${x.val}<em>${x.unit}</em>`;
    btn.addEventListener('click', () => { s.on = !s.on; s.group.visible = s.on; btn.setAttribute('aria-pressed', String(s.on)); drawTwins(); });
    const row = document.createElement('div'); row.className = 'row'; row.style.setProperty('--c', x.c); row.dataset.id = x.id;
    const head = document.createElement('div'); head.className = 'head';
    const solo = document.createElement('button');
    solo.type = 'button'; solo.className = 'solo'; solo.textContent = '◎'; solo.setAttribute('aria-pressed', 'false');
    solo.setAttribute('aria-label', T('Show only this sheet, with every city', 'Δείξε μόνο αυτό το φύλλο, με όλες τις πόλεις'));
    solo.title = solo.getAttribute('aria-label');
    solo.addEventListener('click', (ev) => { ev.stopPropagation(); setSolo(x.id); });
    const cities = document.createElement('div'); cities.className = 'cities'; cities.hidden = true;
    s.btn = btn; s.solo = solo; s.cities = cities;
    head.append(btn, solo); row.append(head, cities); rail.appendChild(row);
  });
});
let soloId = null;
const cityName = (c) => { const n = (live.cities[c] || {}).name; return Array.isArray(n) ? T(n[0], n[1]) : (n || c); };
function cityLines(id) {
  const out = [];
  if (!live || !live.cities) return out;
  const feed = FEED[id];
  if (feed) {
    Object.keys(live.cities).forEach((c) => {
      let r = null;
      for (const name of feed.vars) { r = pick(c, name, feed.own) || pick(c, name, false); if (r) break; }
      out.push([cityName(c),
        r ? fmt(r.value) + ' ' + (r.unit || '') + ' · ' + ageText(r.ageMin) : T('nothing arrived', 'δεν ήρθε τίποτα'),
        r ? r.source : '']);
    });
    return out;
  }
  if (id === 'rain' && rainMm != null) out.push([T('whole island', 'όλο το νησί'), fmt(rainMm) + ' mm · ' + T('model', 'μοντέλο'), 'openmeteo-weather']);
  if (id === 'cloud' && cloudPct != null) out.push([T('whole island', 'όλο το νησί'), cloudPct + ' % · ' + T('model', 'μοντέλο'), 'openmeteo-weather']);
  if (!out.length) out.push([T('This sheet is drawn', 'Αυτό το φύλλο είναι σχεδιασμένο'), T('not measured yet', 'όχι ακόμη μετρημένο'), '']);
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
    const on = soloId == null ? true : s.layer.id === soloId;
    s.on = on; s.group.visible = on;
    if (s.btn) s.btn.setAttribute('aria-pressed', String(on));
    if (s.solo) s.solo.setAttribute('aria-pressed', String(s.layer.id === soloId));
    if (s.cities) { const show = s.layer.id === soloId; s.cities.hidden = !show; if (show) paintCities(s); }
  });
  drawTwins();
  document.body.classList.toggle('solo-on', soloId != null);
  paintLegend();
  const pose = soloId == null ? HOME_POSE : soloPose(sheets.find((s) => s.layer.id === soloId).y);
  flyTo(pose[0], pose[1]);
}
/* ---- the key: for one sheet at a time, what it shows, what the colours and the motion mean, and where it comes from ---- */
// cap: one plain line on what the sheet shows. move: what the motion means (or why nothing moves). scale: its colour
// scale. marks: the other signs on the sheet. Every line is written twice, English and Greek.
const INFO = {
  seabed: { scale: 'sst',
    cap: ['How warm the sea surface is and how high the waves are, at the points the sea model reports.', 'Πόσο ζεστή είναι η επιφάνεια της θάλασσας και πόσο ψηλά τα κύματα, στα σημεία που δίνει το μοντέλο της θάλασσας.'],
    move: ['Each ring breathes in and out. A wider ring means higher waves.', 'Κάθε δαχτυλίδι ανοιγοκλείνει. Πιο φαρδύ δαχτυλίδι σημαίνει πιο ψηλά κύματα.'],
    rest: ['A wider ring means higher waves.', 'Πιο φαρδύ δαχτυλίδι σημαίνει πιο ψηλά κύματα.'],
    marks: [['The dot colour is the sea temperature, with the number beside it.', 'Το χρώμα της κουκκίδας είναι η θερμοκρασία της θάλασσας, με τον αριθμό δίπλα.'],
      ['The sea floor under the dots is a drawing, not a depth survey.', 'Ο βυθός κάτω από τις κουκκίδες είναι σχέδιο, όχι μέτρηση βάθους.']] },
  water: { cap: ['Reservoirs and rivers. No live feed is connected yet, so this is an example drawing and shows no real amounts.', 'Φράγματα και ποτάμια. Δεν έχει συνδεθεί ακόμη ζωντανή πηγή, άρα αυτό είναι σχέδιο-παράδειγμα και δεν δείχνει πραγματικές ποσότητες.'] },
  island: { scale: 'temp',
    cap: ['The air temperature measured at the official weather stations, and the four schools that carry our own sensors.', 'Η θερμοκρασία του αέρα όπως τη μετρούν οι επίσημοι μετεωρολογικοί σταθμοί, και τα τέσσερα σχολεία με τους δικούς μας αισθητήρες.'],
    move: ['A ring spreads from every station that reported in the last 30 minutes. An older reading keeps a wide, faint ring that stands still.', 'Ένα δαχτυλίδι απλώνεται από κάθε σταθμό που έστειλε μέτρηση τα τελευταία 30 λεπτά. Μια πιο παλιά μέτρηση έχει φαρδύ, αχνό δαχτυλίδι που μένει ακίνητο.'],
    rest: ['A bright ring marks a station that reported in the last 30 minutes. An older reading has a wide, faint ring.', 'Φωτεινό δαχτυλίδι σημαίνει σταθμός που έστειλε μέτρηση τα τελευταία 30 λεπτά. Μια πιο παλιά μέτρηση έχει φαρδύ, αχνό δαχτυλίδι.'],
    marks: [['Amber pins are the schools. The ring under a pin shows how old that school’s reading is: tight when new, wide and faint when hours old.', 'Οι κεχριμπαρένιες πινέζες είναι τα σχολεία. Το δαχτυλίδι κάτω από την πινέζα δείχνει πόσο παλιά είναι η μέτρηση του σχολείου: σφιχτό όταν είναι καινούρια, φαρδύ και αχνό όταν είναι ωρών.'],
      ['Our sensors are not coloured on this scale: they do not measure the same air as an outdoor station.', 'Οι αισθητήρες μας δεν χρωματίζονται με αυτή την κλίμακα: δεν μετρούν τον ίδιο αέρα με έναν εξωτερικό σταθμό.'],
      ['The hills are drawn, not surveyed.', 'Οι λόφοι είναι σχεδιασμένοι, όχι μετρημένοι.']] },
  city: { cap: ['Streets, bus stops, chargers and where people live. No live feed is connected yet, so this is an example drawing.', 'Δρόμοι, στάσεις, φορτιστές και πού ζει ο κόσμος. Δεν έχει συνδεθεί ακόμη ζωντανή πηγή, άρα αυτό είναι σχέδιο-παράδειγμα.'] },
  heat: { cap: ['How hot the ground is, as a satellite sees it. No satellite reading has arrived, so this is an example drawing.', 'Πόσο ζεστό είναι το έδαφος, όπως το βλέπει ένας δορυφόρος. Δεν έχει έρθει δορυφορική μέτρηση, άρα αυτό είναι σχέδιο-παράδειγμα.'] },
  veg: { cap: ['How green the land is, as a satellite sees it. No satellite reading has arrived, so this is an example drawing.', 'Πόσο πράσινη είναι η γη, όπως τη βλέπει ένας δορυφόρος. Δεν έχει έρθει δορυφορική μέτρηση, άρα αυτό είναι σχέδιο-παράδειγμα.'] },
  air: { scale: 'pm25',
    cap: ['Fine particles in the air (PM2.5), from the air-quality model. Between the model’s grid points the colour is filled in.', 'Λεπτά σωματίδια στον αέρα (PM2.5), από το μοντέλο ποιότητας αέρα. Ανάμεσα στα σημεία του πλέγματος το χρώμα συμπληρώνεται.'],
    move: ['More specks mean more fine particles there. The specks only shimmer: they do not show where the air is going.', 'Περισσότερες κουκκίδες σημαίνουν περισσότερα λεπτά σωματίδια εκεί. Οι κουκκίδες απλώς τρεμοπαίζουν: δεν δείχνουν προς τα πού πάει ο αέρας.'],
    rest: ['More specks mean more fine particles there.', 'Περισσότερες κουκκίδες σημαίνουν περισσότερα λεπτά σωματίδια εκεί.'],
    marks: [['Small square dots are the model’s grid points: the only places it gives a number.', 'Οι μικρές τετράγωνες κουκκίδες είναι τα σημεία του πλέγματος: μόνο εκεί δίνει αριθμό το μοντέλο.']] },
  wind: { scale: 'wind',
    cap: ['Which way and how fast the air moves 10 m above the ground, from the weather model’s grid.', 'Προς τα πού και πόσο γρήγορα κινείται ο αέρας 10 m πάνω από το έδαφος, από το πλέγμα του μοντέλου καιρού.'],
    move: ['The lines travel the way the wind blows. Twice the wind speed, twice as fast and brighter.', 'Οι γραμμές ταξιδεύουν προς τα εκεί που φυσά ο άνεμος. Διπλάσια ταχύτητα ανέμου, διπλάσια ταχύτητα και πιο φωτεινές.'],
    rest: ['Each arrow points the way the wind blows. A longer, brighter arrow is faster wind.', 'Κάθε βέλος δείχνει προς τα πού φυσά ο άνεμος. Πιο μακρύ και φωτεινό βέλος σημαίνει πιο γρήγορο άνεμο.'],
    marks: [['Amber arrows are the wind measured at the airports, with its speed.', 'Τα κεχριμπαρένια βέλη είναι ο άνεμος που μετρούν τα αεροδρόμια, με την ταχύτητά του.']] },
  rain: { scale: 'rain',
    cap: ['Where the weather model puts rain this hour: one square for each grid cell with rain, and its millimetres.', 'Πού βάζει βροχή το μοντέλο καιρού αυτή την ώρα: ένα τετράγωνο για κάθε κελί του πλέγματος με βροχή, και τα χιλιοστά του.'],
    move: ['Rings are drops landing, seen from above. They appear only inside a square with rain, and more rain makes more rings.', 'Τα δαχτυλίδια είναι σταγόνες που πέφτουν, όπως φαίνονται από ψηλά. Εμφανίζονται μόνο μέσα σε τετράγωνο με βροχή, και περισσότερη βροχή φτιάχνει περισσότερα.'],
    rest: ['Rings appear only inside a square with rain, and more rain means more rings.', 'Τα δαχτυλίδια εμφανίζονται μόνο μέσα σε τετράγωνο με βροχή, και περισσότερη βροχή σημαίνει περισσότερα.'],
    marks: [['No square means the model has no rain there. It is a model, not a rain gauge.', 'Χωρίς τετράγωνο, το μοντέλο δεν έχει βροχή εκεί. Είναι μοντέλο, όχι βροχόμετρο.']] },
  haze: { cap: ['Dust and haze in the whole column of air. No reading has arrived, so this is an example drawing.', 'Σκόνη και θολούρα σε όλη τη στήλη του αέρα. Δεν έχει έρθει μέτρηση, άρα αυτό είναι σχέδιο-παράδειγμα.'] },
  cloud: { scale: 'cloud',
    cap: ['How much of the sky is covered by cloud, from the weather model. Whiter means more cover.', 'Πόσο μέρος του ουρανού σκεπάζουν τα σύννεφα, από το μοντέλο καιρού. Πιο λευκό σημαίνει περισσότερη κάλυψη.'],
    never: ['Nothing moves here: the model says how much cloud there is, not which way it drifts.', 'Εδώ δεν κινείται τίποτα: το μοντέλο λέει πόσα σύννεφα υπάρχουν, όχι προς τα πού πάνε.'],
    marks: [['Small square dots are the model’s grid points.', 'Οι μικρές τετράγωνες κουκκίδες είναι τα σημεία του πλέγματος.']] },
  sat: { cap: ['A picture of Cyprus taken from space on one pass of a satellite.', 'Μια εικόνα της Κύπρου από το διάστημα, από ένα πέρασμα δορυφόρου.'],
    never: ['Nothing moves here: it is one picture of one moment.', 'Εδώ δεν κινείται τίποτα: είναι μία εικόνα μιας στιγμής.'] },
};
const NO_MOVE = () => T('Nothing moves here, because there is no reading to show.', 'Εδώ δεν κινείται τίποτα, γιατί δεν υπάρχει μέτρηση να δείξει.');
const SCALE_NAME = { sst: ['Sea-surface temperature', 'Θερμοκρασία επιφάνειας θάλασσας'], temp: ['Air temperature', 'Θερμοκρασία αέρα'], pm25: ['Fine particles PM2.5', 'Λεπτά σωματίδια PM2.5'],
  wind: ['Wind speed', 'Ταχύτητα ανέμου'], rain: ['Rain in the hour', 'Βροχή μέσα στην ώρα'], cloud: ['Cloud cover', 'Νεφοκάλυψη'] };
// the name a source goes by in the register (in the reader's language), or its id when the register is not here yet
const srcName = (id) => { const row = live && live.layers && live.layers.find((l) => l.id === id); return row ? T(row.name, row.nameEl || row.name) : id; };
const skyAge = () => (skyAt ? ageText((Date.now() - skyAt) / 60000) : T('age not stated', 'η ηλικία δεν δηλώνεται'));
// What a sheet stands on right now: 'measured' (an instrument), 'model' (a computed grid) or 'none' (nothing to show).
function sheetState(id) {
  const none = (text) => ({ kind: 'none', text });
  const layer = LAYERS.find((l) => l.id === id);
  if (layer.nolive) return none(T('No live data yet. The picture on this sheet is an example drawing, not a measurement.', 'Χωρίς ζωντανά δεδομένα ακόμη. Η εικόνα σε αυτό το φύλλο είναι σχέδιο-παράδειγμα, όχι μέτρηση.'));
  if (id === 'sat') return satReal ? { kind: 'measured', text: T('A real satellite picture is shown.', 'Φαίνεται πραγματική δορυφορική εικόνα.') }
    : none(T('No satellite picture is stored, so a drawn stand-in is shown.', 'Δεν υπάρχει αποθηκευμένη δορυφορική εικόνα, άρα φαίνεται ένα σχέδιο στη θέση της.'));
  if (!live) return none(T('Waiting for the first readings…', 'Αναμονή για τις πρώτες μετρήσεις…'));
  const gone = none(T('No data arrived for this sheet, so nothing is drawn on it.', 'Δεν ήρθαν δεδομένα για αυτό το φύλλο, άρα δεν σχεδιάζεται τίποτα πάνω του.'));
  const model = (src, n, age) => ({ kind: 'model', text: srcName(src) + ' · ' + T(n + ' grid points', n + ' σημεία πλέγματος') + ' · ' + age });
  if (id === 'wind') { if (!windF) return gone; const s = model('openmeteo-weather', grid.length, skyAge());
    if (airportWind.length) s.text += ' · ' + T('measured at ' + airportWind.length + ' airport(s): ', 'μετρημένος σε ' + airportWind.length + ' αεροδρόμιο/α: ') + srcName('metar-airports'); return s; }
  if (id === 'rain') return rainKnown ? model('openmeteo-weather', grid.length, skyAge()) : gone;
  if (id === 'cloud') return cloudF ? model('openmeteo-weather', grid.length, skyAge()) : gone;
  if (id === 'air') { if (!airF) return gone; const r = best('pm25', false); return model('openmeteo-air', airPts.length, r ? ageText(r.ageMin) : T('age not stated', 'η ηλικία δεν δηλώνεται')); }
  if (id === 'seabed') { if (!seaPts.length) return gone; const r = best('sea_surface_temperature', false);
    return { kind: 'model', text: srcName('openmeteo-marine') + ' · ' + T(seaPts.length + ' sea points', seaPts.length + ' σημεία θάλασσας') + ' · ' + (r ? ageText(r.ageMin) : T('age not stated', 'η ηλικία δεν δηλώνεται')) }; }
  if (id === 'island') { if (!stationPts.length) return gone;
    const names = [...new Set(stationPts.map((p) => p.src))].map(srcName).join(', '), newest = Math.max(...stationPts.map((p) => p.at || 0));
    return { kind: 'measured', text: names + ' · ' + T(stationPts.length + ' stations', stationPts.length + ' σταθμοί') + ' · ' + (newest ? ageText((Date.now() - newest) / 60000) : T('age not stated', 'η ηλικία δεν δηλώνεται')) }; }
  return gone;
}
window.__sheetState = (id) => sheetState(id).kind;
const STATE_WORD = { measured: ['MEASURED', 'ΜΕΤΡΗΜΕΝΟ'], model: ['MODEL, NOT A MEASUREMENT', 'ΜΟΝΤΕΛΟ, ΟΧΙ ΜΕΤΡΗΣΗ'], none: ['NO LIVE DATA', 'ΧΩΡΙΣ ΖΩΝΤΑΝΑ ΔΕΔΟΜΕΝΑ'] };
const legend = document.getElementById('legend');
const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
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
    out.push(mk('p', 'lg-gen', T('Dots climb a beam only while its source reported in the last 90 minutes. A bare line is a quiet source.', 'Οι κουκκίδες ανεβαίνουν μια δέσμη μόνο όσο η πηγή της έστειλε κάτι τα τελευταία 90 λεπτά. Σκέτη γραμμή σημαίνει σιωπηλή πηγή.')));
    out.push(mk('p', 'lg-gen', T('A striped sheet with the words "no live data" is an example drawing, not a measurement.', 'Ένα ριγέ φύλλο με τις λέξεις "χωρίς ζωντανά δεδομένα" είναι σχέδιο-παράδειγμα, όχι μέτρηση.')));
    legend.dataset.layer = '';
    legend.replaceChildren(...out); return;
  }
  const layer = LAYERS.find((l) => l.id === soloId), info = INFO[soloId], st = sheetState(soloId), i = LAYERS.indexOf(layer);
  legend.style.setProperty('--c', layer.c); legend.dataset.layer = soloId; legend.dataset.state = st.kind;
  const step = mk('div', 'lg-step');
  const prev = mk('button', 'lg-prev', '◀'), next = mk('button', 'lg-next', '▶'), all = mk('button', 'lg-all', T('All', 'Όλα'));
  prev.type = next.type = all.type = 'button';
  prev.setAttribute('aria-label', T('Previous layer', 'Προηγούμενο στρώμα')); next.setAttribute('aria-label', T('Next layer', 'Επόμενο στρώμα'));
  all.setAttribute('aria-label', T('Back to all layers', 'Πίσω σε όλα τα στρώματα'));
  prev.addEventListener('click', () => stepSolo(-1)); next.addEventListener('click', () => stepSolo(1));
  all.addEventListener('click', () => { setSolo(soloId); const b = legend.querySelector('.lg-go'); if (b) b.focus(); });
  step.append(prev, mk('span', 'lg-n', T('LAYER ', 'ΣΤΡΩΜΑ ') + (i + 1) + ' / ' + LAYERS.length), next, all);
  out.push(step, mk('h3', null, T(layer.name, layer.nameEl)), mk('p', 'lg-cap', T(info.cap[0], info.cap[1])));
  const has = st.kind !== 'none';
  if (info.scale && has) {
    const sc = SCALE[info.scale], box = mk('div', 'lg-scale');
    box.append(mk('div', 'lg-scale-name', T(SCALE_NAME[info.scale][0], SCALE_NAME[info.scale][1]) + ' · ' + sc.unit));
    const bar = mk('div', 'lg-bar'); bar.style.background = cssScale(sc); box.append(bar);
    const ticks = mk('div', 'lg-ticks'), mid = (sc.min + sc.max) / 2;
    [T('low ', 'χαμηλά ') + sc.min, String(mid), sc.max + (info.scale === 'cloud' ? '' : '+') + T(' high', ' ψηλά')].forEach((x) => ticks.append(mk('span', null, x)));
    box.append(ticks); out.push(box);
  }
  const moveLine = soloId === 'sat' ? T(info.never[0], info.never[1]) : !has ? NO_MOVE() : info.never ? T(info.never[0], info.never[1]) : info.move ? (still() ? T(info.rest[0], info.rest[1]) : T(info.move[0], info.move[1])) : NO_MOVE();
  const mv = mk('p', 'lg-move'); mv.append(mk('b', null, T('Motion: ', 'Κίνηση: ')), moveLine); out.push(mv);
  if (has && info.marks) info.marks.forEach((m) => out.push(mk('p', 'lg-mark', T(m[0], m[1]))));
  const state = mk('div', 'lg-state ' + st.kind); state.setAttribute('aria-live', 'off');   // its age ticks; a screen reader is not told every half minute
  state.append(mk('b', null, T(STATE_WORD[st.kind][0], STATE_WORD[st.kind][1])), mk('span', null, (has ? T('Source: ', 'Πηγή: ') : '') + st.text));
  out.push(state);
  legend.replaceChildren(...out);
}
// Between changes of sheet only the source line is brought up to date, so the key is not rebuilt under a reader's hands.
function refreshLegend() {
  if (soloId == null) return;
  const st = sheetState(soloId);
  if (legend.dataset.state !== st.kind) { const had = legend.contains(document.activeElement) ? document.activeElement.className : null;
    paintLegend(); if (had) { const b = legend.querySelector('.' + had); if (b) b.focus(); } return; }
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
    else b.live = false;                                           // published files and drawn sheets send nothing
  });
}

const setAll = (fn) => {
  soloId = null;
  sheets.forEach((s) => {
    s.on = fn(s); s.group.visible = s.on;
    if (s.btn) s.btn.setAttribute('aria-pressed', String(s.on));
    if (s.solo) s.solo.setAttribute('aria-pressed', 'false');
    if (s.cities) s.cities.hidden = true;
  });
  drawTwins();
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
// Which sheets stand on a reading rather than on a drawing: the ones with a feed, plus the two the model fills in
// once it has spoken, plus the satellite when a real picture has landed.
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
  if (satReal) ids.add('sat');                                     // a real picture, not the drawn stand-in
  return ids;                                                      // rain and cloud never qualify: a model is not a gauge
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

/* ---- the tour, which steps aside the moment you take hold ---- */
const TOUR = [
  { t: 0,  pos: [-1850, 1420, 2050], tgt: [0, 540, 0] },
  { t: 7,  pos: [-1150, 760, 1350],  tgt: [0, 400, 0] },
  { t: 14, pos: [-520, 430, 760],    tgt: [-40, 330, 0] },
  { t: 21, pos: [300, 250, 620],     tgt: [80, 200, 30] },
  { t: 28, pos: [1400, 820, 1280],   tgt: [0, 380, 0] },
  { t: 36, pos: [-1850, 1420, 2050], tgt: [0, 540, 0] },
];
// With reduced motion the camera does not tour by itself: the view stands still until the reader moves it.
let tour = !still(), tourT = 0;
const ease = (a, b, f) => a + (b - a) * (f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);
tourBtn.setAttribute('aria-pressed', String(tour)); hint.hidden = !tour;
function stopTour() { if (!tour) return; tour = false; tourBtn.setAttribute('aria-pressed', 'false'); hint.hidden = true; }
tourBtn.addEventListener('click', () => { tour = !tour; fly = null; tourBtn.setAttribute('aria-pressed', String(tour)); hint.hidden = !tour; });
controls.addEventListener('start', () => { stopTour(); fly = null; });
canvas.addEventListener('wheel', () => { stopTour(); fly = null; }, { passive: true });

/* ---- one sheet on its own is looked at from above and close, so its picture can be read ---- */
let fly = null;
function flyTo(pos, tgt) {
  stopTour();
  if (still()) { camera.position.set(pos[0], pos[1], pos[2]); controls.target.set(tgt[0], tgt[1], tgt[2]); fly = null; return; }
  fly = { p0: camera.position.toArray(), t0: controls.target.toArray(), p1: pos, t1: tgt, f: 0 };
}
function soloPose(y) {
  const usable = innerWidth > 860 ? .5 : 1;                          // the panels on both sides cover part of a wide screen
  const d = Math.min(5000, 1.1 * SW / (2 * Math.tan(19 * Math.PI / 180) * camera.aspect * usable));
  const n = Math.hypot(.16, .8, .9);
  const ty = innerWidth > 860 ? y : y - .15 * d;                    // on a phone the key sits at the bottom, so the sheet is lifted clear of it
  return [[-.16 / n * d, ty + .8 / n * d, .9 / n * d], [0, ty, 0]];
}
const HOME_POSE = [TOUR[0].pos, TOUR[0].tgt];

function size() { const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();

// the clock in the corner is this browser's own time, in Cyprus
{
  const d = new Date();
  const mon = EL ? ['ΙΑΝ','ΦΕΒ','ΜΑΡ','ΑΠΡ','ΜΑΪ','ΙΟΥΝ','ΙΟΥΛ','ΑΥΓ','ΣΕΠ','ΟΚΤ','ΝΟΕ','ΔΕΚ'] : ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const p2 = (n) => String(n).padStart(2, '0');
  document.getElementById('clock').textContent =
    `${p2(d.getDate())} ${mon[d.getMonth()]} ${d.getFullYear()} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

const clock = new THREE.Clock();
const sheetOf = {}; sheets.forEach((s) => { sheetOf[s.layer.id] = s; });
if (RMQ && RMQ.addEventListener) RMQ.addEventListener('change', () => { Object.keys(need).forEach((k) => { need[k] = true; }); if (still()) { stopTour(); fly = null; } });
let frame = 0;
function tick() {
  const dt = clock.getDelta(), t = clock.getElapsedTime();
  const anim = !still(), ts = anim ? t : 0;
  // A painted sheet is redrawn when a reading changed it, and (unless motion is turned down) on its own beat. A hidden
  // sheet is left alone and catches up when it is shown again.
  const paint = (id, due, fn) => { const s = sheetOf[id]; if (!s || !s.on) return; if (!(need[id] || (anim && due))) return;
    fn(); need[id] = false; s.tex.needsUpdate = true; };
  paint('wind', true, () => windStep(Math.min(dt, .05), anim));
  paint('rain', frame % 2 === 0, () => rainStep(t, anim));
  paint('cloud', false, cloudPaint);
  paint('air', frame % 3 === 0, () => airStep(t, anim));
  paint('seabed', frame % 2 === 1, () => seaStep(t, anim));
  paint('island', frame % 3 === 1, () => islandStep(t, anim));
  const a = ts * .16;
  const sp = new THREE.Vector3(Math.cos(a) * SW * .62, TOP + 215 + Math.sin(a * 2) * 30, Math.sin(a) * SH * .8);
  polar.position.copy(sp); polar.lookAt(0, TOP, 0); polar.rotateX(Math.PI / 2);
  polarLabel.position.set(sp.x + 70, sp.y + 10, sp.z);
  polar.userData.beacon.material.color.set(!anim || (t * 2) % 1 > .5 ? '#ff6b5e' : '#3a1410');
  cone.position.copy(sp.clone().lerp(new THREE.Vector3(sp.x * .25, TOP, sp.z * .25), .5));
  cone.lookAt(sp); cone.rotateX(Math.PI / 2);
  geo.rotation.y = ts * .08;
  geoCone.position.copy(geo.position.clone().lerp(new THREE.Vector3(0, TOP, 0), .5));
  geoCone.lookAt(geo.position); geoCone.rotateX(Math.PI / 2);
  // Dots climb a beam only while its source has reported lately (markBeams). A quiet source has a bare line; with
  // reduced motion the dots of a reporting source stand still on the line.
  beams.forEach((b) => b.dots.forEach((d) => { d.mesh.visible = !!b.live; if (!b.live) return;
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
  renderer.render(scene, camera); frame++;
  requestAnimationFrame(tick);
}
/* ---- twin pins: where two sources measure the same thing in the same city and do not agree ---- */
// Which sheet a measurement belongs to. Only the variables a sheet actually shows (FEED, above) are listed, so a
// disagreement is never drawn on a sheet that does not carry that measurement.
const VAR_SHEET = { temperature: 'island', co2: 'island', pm25: 'air', pm10: 'air', ozone: 'air',
  wind_speed: 'wind', sea_surface_temperature: 'seabed', wave_height: 'seabed' };
const CITY_POS = {};   // filled once the island is placed
const twins = new THREE.Group(); scene.add(twins);
/* ---- the ruler down the side: what height each sheet stands for ---- */
// Plain words, not invented numbers: the sheets are stacked for reading, not drawn to any scale, and the ruler says so.
const HEIGHT = {
  seabed: ['SEA FLOOR TO SURFACE', 'ΒΥΘΟΣ ΩΣ ΕΠΙΦΑΝΕΙΑ'],
  water: ['GROUND LEVEL', 'ΣΤΑΘΜΗ ΕΔΑΦΟΥΣ'],
  island: ['GROUND', 'ΕΔΑΦΟΣ'],
  city: ['STREET LEVEL', 'ΣΤΑΘΜΗ ΔΡΟΜΟΥ'],
  heat: ['GROUND SURFACE', 'ΕΠΙΦΑΝΕΙΑ ΕΔΑΦΟΥΣ'],
  veg: ['GROUND SURFACE', 'ΕΠΙΦΑΝΕΙΑ ΕΔΑΦΟΥΣ'],
  air: ['WHERE PEOPLE BREATHE', 'ΕΚΕΙ ΠΟΥ ΑΝΑΠΝΕΟΥΜΕ'],
  wind: ['10 M ABOVE GROUND', '10 M ΠΑΝΩ ΑΠΟ ΤΟ ΕΔΑΦΟΣ'],
  rain: ['CLOUD BASE', 'ΒΑΣΗ ΝΕΦΩΝ'],
  haze: ['THE WHOLE AIR COLUMN', 'ΟΛΗ Η ΣΤΗΛΗ ΑΕΡΑ'],
  cloud: ['CLOUD TOPS', 'ΚΟΡΥΦΕΣ ΝΕΦΩΝ'],
  sat: ['FROM ORBIT', 'ΑΠΟ ΤΡΟΧΙΑ'],
};
{
  const rx = SW * .5 + 70, rz = SH * .5 + 30, lo = 0, hi = (LAYERS.length - 1) * GAPY;
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(rx, lo, rz), new THREE.Vector3(rx, hi, rz)]),
    new THREE.LineBasicMaterial({ color: '#4d6a86', transparent: true, opacity: .5 }));
  scene.add(line);
  LAYERS.forEach((layer, i) => {
    const y = i * GAPY, h = HEIGHT[layer.id]; if (!h) return;
    const tick = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(rx - 26, y, rz), new THREE.Vector3(rx, y, rz)]),
      new THREE.LineBasicMaterial({ color: layer.c, transparent: true, opacity: .55 }));
    scene.add(tick);
    const lab = label(T(h[0], h[1]), '', '#8fa9c4', mobile ? 34 : 24);
    lab.position.set(rx + 12, y, rz); scene.add(lab);
  });
  const head = label(T('WHAT EACH SHEET STANDS FOR', 'ΤΙ ΔΕΙΧΝΕΙ ΚΑΘΕ ΦΥΛΛΟ'), T('stacked to be read, not to scale', 'στοιβαγμένα για να διαβάζονται, όχι σε κλίμακα'), '#8fa9c4', mobile ? 38 : 28);
  head.position.set(rx + 12, hi + GAPY * .55, rz); scene.add(head);
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
  const fire = (key, value, tag, city, cardId, ageMin) => {
    const had = lastSeen.get(key);
    lastSeen.set(key, value);
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
  const sh = sheets.find((x) => x.layer.id === id);
  if (!sh || !sh.btn) return;
  sh.btn.classList.remove('fresh');
  void sh.btn.offsetWidth;                                 // let the browser see it go, so the same card can flash twice
  sh.btn.classList.add('fresh');
}

/* ---- how long each sheet has to wait for its next reading ---- */
function paintSolo() {
  if (soloId == null) return;
  const s = sheets.find((x) => x.layer.id === soloId);
  if (s) paintCities(s);
}
function paintWaits() {
  if (!live || !live.layers) return;
  const now = Date.now();
  LAYERS.forEach((layer) => {
    const sh = sheets.find((x) => x.layer.id === layer.id); if (!sh || !sh.btn) return;
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
    const sheet = sheets.find((x) => x.layer.id === sheetId); if (!sheet || !sheet.on) return;
    Object.keys(rv.cities || {}).forEach((cityId) => {
      const st = rv.cities[cityId];
      if (!st || st.state !== 'differ' || st.low == null || st.high == null) return;
      const over = st.tolerance ? st.spread / st.tolerance : 1;
      const key = cityId + '|' + sheetId;
      const cur = seen.get(key);
      const more = cur ? cur.more + 1 : 0;                           // how many other disagreements this one stands for
      if (!cur || over > cur.over) seen.set(key, { rv, st, over, cityId, sheet, more });
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
const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
const ageText = (m) => (m == null ? T('not stated', 'δεν δηλώνεται')
  : m < 1 ? T('just now', 'μόλις τώρα') : m < 90 ? T(Math.round(m) + ' min ago', 'πριν ' + Math.round(m) + ' λ')
    : T(Math.round(m / 60) + ' h ago', 'πριν ' + Math.round(m / 60) + ' ώ'));
let live = null, liveAt = 0;
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

function paintRail() {
  LAYERS.forEach((layer) => {
    if (MODEL_SHEET.has(layer.id)) return;     // rain and cloud come from the model grid; paintSky owns those two cards
    const s = sheets.find((x) => x.layer.id === layer.id); if (!s || !s.btn) return;
    const feed = FEED[layer.id];
    const valEl = s.btn.querySelector('.val'), stEl = s.btn.querySelector('.st'), srcEl = s.btn.querySelector('small');
    if (!feed || !live) {
      valEl.replaceChildren(Object.assign(document.createElement('b'), { textContent: T('drawn', 'σχεδιασμένο') }),
        Object.assign(document.createElement('em'), { textContent: T('not measured yet', 'όχι ακόμη μετρημένο') }));
      stEl.className = 'st year';
      stEl.title = T('This sheet is drawn, not measured.', 'Αυτό το φύλλο είναι σχεδιασμένο, όχι μετρημένο.');
      return;
    }
    let r = null, v = null;
    for (const name of feed.vars) { r = best(name, feed.own); if (r) { v = name; break; } }
    if (!r) {
      valEl.replaceChildren(Object.assign(document.createElement('b'), { textContent: '—' }),
        Object.assign(document.createElement('em'), { textContent: T('nothing arrived', 'δεν ήρθε τίποτα') }));
      stEl.className = 'st year';
      return;
    }
    valEl.innerHTML = '';
    const bEl = document.createElement('b'); bEl.textContent = String(fmt(r.value));
    const eEl = document.createElement('em'); eEl.textContent = (r.unit || '') + ' · ' + ageText(r.ageMin);
    valEl.append(bEl, eEl);
    stEl.className = 'st ' + (r.ageMin != null && r.ageMin < 90 ? 'live' : 'old');
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
  pinLabels.forEach(({ sc, lab, p }) => {
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
const HALO_FULL = 180;                                               // three hours out, the ring is as faint as it gets
function haloAt(ageMin) {
  if (ageMin == null || ageMin > 1e8) return { r: 34, o: .09, c: '#7f93ac' };
  const f = Math.min(1, ageMin / HALO_FULL);
  return { r: 16 + f * 22, o: .55 - f * .42, c: '#8ecfe6' };
}

// the wind sheet moves at the speed that was actually measured
// Which way the wind blows, how much rain fell this hour, how much of the sky is covered. The bearing is measured at
// the airports when they are reporting (METAR gives a wind direction); otherwise it is the model's, and the card says
// which. Rain and cloud are the model's own grid values, never a gauge, and they are labelled "model" wherever shown.
let windDir = null, windSrc = null, rainMm = null, cloudPct = null, skyAt = null, airportWind = [];
const meanBearing = (list) => {
  if (!list.length) return null;
  let x = 0, y = 0;
  list.forEach((d) => { const a = d * Math.PI / 180; x += Math.cos(a); y += Math.sin(a); });
  if (!x && !y) return null;
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};
const meanOf = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
window.__meanBearing = meanBearing;     // the tests check the circular mean, which plain averaging gets wrong

// The flow across the whole island can only come from something that covers the whole island, so it comes from the
// model grid and is labelled as the model's. What the airports measure is a reading at one airport: it is named, one
// airport at a time, and never averaged into an island-wide direction.
function paintWind() {
  const m = (live && live.map) || {};
  const fresh = (st) => st.at == null || Date.now() - st.at < 2 * 3600000;
  airportWind = (m.stations || [])
    .filter((st) => st.src === 'metar-airports' && st.wd != null && st.ws != null && st.ws > 0 && fresh(st))
    .map((st) => ({ name: st.name, wd: Math.round(st.wd), ws: st.ws, lat: st.lat, lng: st.lng }));
  const bearings = (m.wind || []).filter((p) => p.wd != null);
  windDir = bearings.length ? meanBearing(bearings.map((p) => p.wd)) : null;
  windSrc = windDir == null ? null : 'openmeteo-weather';
  // The moving lines follow the grid itself, point by point: a bearing names where the wind comes FROM, so the air
  // travels the opposite way. u is the part that blows east, v the part that blows north, both in m/s.
  grid = (m.wind || []).filter((p) => p.lat != null && p.lng != null);
  const blows = grid.filter((p) => p.wd != null && p.ws != null);
  const rad = (p) => p.wd * Math.PI / 180;
  const fu = idw(blows, (p) => -p.ws * Math.sin(rad(p))), fv = idw(blows, (p) => -p.ws * Math.cos(rad(p)));
  windF = fu && fv ? { u: fu, v: fv } : null;
  // rain: the cells that have any, each the size of one step of the grid
  const gap = (list) => { const a = [...new Set(list)].sort((x, y) => x - y); let g = Infinity;
    for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; if (d > 1e-6 && d < g) g = d; } return isFinite(g) ? g : .25; };
  const [gx0, gy0] = pxOf(0, 0), [gx1, gy1] = pxOf(gap(grid.map((p) => p.lng)), gap(grid.map((p) => p.lat)));
  cellW = Math.abs(gx1 - gx0); cellH = Math.abs(gy1 - gy0);
  rainKnown = grid.some((p) => p.rain != null);
  rainCells = grid.filter((p) => p.rain != null && p.rain > 0).map((p) => { const [x, y] = pxOf(p.lng, p.lat); return { x, y, mm: p.rain }; });
  cloudF = idw(grid, (p) => p.cloud);
  airPts = (m.air || []).filter((p) => p.pm25 != null && p.lat != null && p.lng != null);
  airF = idw(airPts, (p) => p.pm25); airField(); seedSpecks();
  seaPts = (m.sea || []).filter((p) => p.lat != null && p.lng != null && (p.sst != null || p.wave != null));
  stationPts = (m.stations || []).filter((p) => p.temp != null && p.lat != null && p.lng != null);
  Object.keys(need).forEach((k) => { need[k] = true; });
  const rains = (m.wind || []).map((p) => p.rain).filter((v) => v != null);
  const clouds = (m.wind || []).map((p) => p.cloud).filter((v) => v != null);
  rainMm = rains.length ? Math.round(meanOf(rains) * 100) / 100 : null;
  cloudPct = clouds.length ? Math.round(meanOf(clouds)) : null;
  skyAt = m.weatherAt || null;                                     // when the model grid itself was made
}

// The three sheets the model feeds: wind direction on the wind card, rain and cloud on their own. Each says "model"
// unless the bearing came from an airport, and each keeps the age of the reading behind it.
const MODEL_SHEET = new Set(['rain', 'cloud']);
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const COMPASS_EL = ['Β', 'ΒΒΑ', 'ΒΑ', 'ΑΒΑ', 'Α', 'ΑΝΑ', 'ΝΑ', 'ΝΝΑ', 'Ν', 'ΝΝΔ', 'ΝΔ', 'ΔΝΔ', 'Δ', 'ΔΒΔ', 'ΒΔ', 'ΒΒΔ'];
const compass = (deg) => (EL ? COMPASS_EL : COMPASS)[Math.round(deg / 22.5) % 16];
function cardOf(id) { const sh = sheets.find((x) => x.layer.id === id); return sh && sh.btn ? sh : null; }
function setCard(sh, value, unit, tail, cls) {
  const valEl = sh.btn.querySelector('.val');
  valEl.replaceChildren(Object.assign(document.createElement('b'), { textContent: String(value) }),
    Object.assign(document.createElement('em'), { textContent: unit + ' · ' + tail }));
  sh.btn.querySelector('.st').className = 'st ' + cls;
}
function paintSky() {
  const age = skyAt ? ageText((Date.now() - skyAt) / 60000) : T('age unknown', 'άγνωστη ηλικία');
  const w = cardOf('wind');
  if (w) {
    const air = airportWind.map((a) => a.name.replace(/ airport$/i, '') + ' ' + a.wd + '° ' + compass(a.wd)).join(' · ');
    const from = windDir == null ? '' : T('model grid, island mean: from ', 'πλέγμα μοντέλου, μέσος όρος νησιού: από ')
      + Math.round(windDir) + '° ' + compass(windDir);
    const both = [from, air ? T('airports measure ', 'τα αεροδρόμια μετρούν ') + air : ''].filter(Boolean).join(' · ');
    if (both) {
      w.btn.title = both;
      const sub = w.group.children.find((x) => x.isSprite);
      if (sub) { const next = label(T(w.layer.name, w.layer.nameEl), both.toUpperCase(), w.layer.c, mobile ? 62 : 46);
        sub.material.map = next.material.map; sub.material.needsUpdate = true; }
    } else {
      w.btn.removeAttribute('title');                              // nothing said which way: the sheet says nothing either
      const sub = w.group.children.find((x) => x.isSprite);
      if (sub) { const next = label(T(w.layer.name, w.layer.nameEl), T(w.layer.src, w.layer.srcEl), w.layer.c, mobile ? 62 : 46);
        sub.material.map = next.material.map; sub.material.needsUpdate = true; }
    }
  }
  const drawn = (sh) => {
    sh.btn.querySelector('.val').replaceChildren(Object.assign(document.createElement('b'), { textContent: T('drawn', 'σχεδιασμένο') }),
      Object.assign(document.createElement('em'), { textContent: T('not measured yet', 'όχι ακόμη μετρημένο') }));
    sh.btn.querySelector('.st').className = 'st year';
  };
  const r = cardOf('rain');
  if (r) {
    r.btn.dataset.src = 'openmeteo-weather';
    if (rainMm == null) drawn(r); else setCard(r, fmt(rainMm), 'MM', T('model · ', 'μοντέλο · ') + age, 'live');
  }
  const c = cardOf('cloud');
  if (c) c.btn.dataset.src = 'openmeteo-weather';
  if (c && cloudPct == null) drawn(c);
  if (c && cloudPct != null) {
    setCard(c, cloudPct, '%', T('model · ', 'μοντέλο · ') + age, 'live');   // the sheet itself is painted cell by cell, in cloudPaint
  }
}

// a real satellite picture, when the site has one stored
let satReal = false;
async function loadSatellite() {
  try {
    const r = await fetch('/api/satellite/images', { headers: { accept: 'application/json' } });
    if (!r.ok) return;
    const j = await r.json(), list = (j && j.images) || [];
    if (!list.length) return;
    list.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
    const im = list[0];
    const sheet = sheets.find((x) => x.layer.id === 'sat'); if (!sheet) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      sheet.mesh.material.map = new THREE.CanvasTexture(c);
      sheet.mesh.material.needsUpdate = true;
      satReal = true; paintLegend();
      const when = im.time ? new Date(im.time) : null;
      const sub = (im.feed || 'satellite') + (when ? ' · ' + when.toISOString().slice(11, 16) + 'Z' : '');
      const lab = sheet.group.children.find((x) => x.isSprite);
      if (lab) { const next = label(T(sheet.layer.name, sheet.layer.nameEl), sub, sheet.layer.c, mobile ? 62 : 46);
        lab.material.map = next.material.map; lab.material.needsUpdate = true; }
      if (sheet.btn) { sheet.btn.querySelector('small').textContent = sub;
        sheet.btn.querySelector('.val').replaceChildren(Object.assign(document.createElement('b'), { textContent: '1' }),
          Object.assign(document.createElement('em'), { textContent: T('real picture', 'πραγματική εικόνα') }));
        sheet.btn.querySelector('.st').className = 'st old'; }
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
loadLive(); loadSatellite();
setInterval(() => { if (!document.hidden) loadLive(); }, 120000);
// The readings on the screen age even when no new ones arrive, so the clock on them keeps running between fetches.
setInterval(() => { if (!document.hidden && live) { paintRail(); paintProbe(); paintPins(); paintSky(); paintSolo(); markBeams(); need.island = true; refreshLegend(); } }, 30000);
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
