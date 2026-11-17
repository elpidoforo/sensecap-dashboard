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
const windC = buf(), rainC = buf();
const NP = mobile ? 700 : 1500, pcl = new Float32Array(NP * 4);
for (let i = 0; i < NP; i++) { pcl[i * 4] = Math.random() * LW; pcl[i * 4 + 1] = Math.random() * LH; pcl[i * 4 + 3] = Math.random() * 80; }

// Which live measurement stands behind each sheet. A sheet with no entry here is drawn, not measured, and says so.
const FEED = {
  island: { vars: ['temperature', 'co2', 'pm25'], own: true },
  air: { vars: ['pm25', 'pm10', 'ozone'] },
  wind: { vars: ['wind_speed'] },
  seabed: { vars: ['sea_surface_temperature', 'wave_height'] },
};
const LAYERS = [
  { id: 'seabed', band: 'WATER', name: 'Seabed and sea temperature', src: 'EMODnet DTM · Open-Meteo marine', nameEl: 'Βυθός και θερμοκρασία θάλασσας', srcEl: 'EMODnet DTM · θαλάσσιο Open-Meteo', val: '22.8', unit: '°C', c: '#2f7fb8', state: 'live',
    make: () => { const c = raster(() => null, (x, y, g) => { const d = Math.min(1, g0.inland[g] * 7), s = 1 - d, n = fbm(x / 26, y / 16, 3);
      return [8 + s * 18 + n * 12, 36 + s * 50 + n * 20, 62 + s * 76 + n * 24, 240]; }); coastUnder(c, 'rgba(120,200,240,.5)'); return c; } },
  { id: 'water', band: 'WATER', name: 'Reservoirs and river reaches', src: 'Water Development Department', nameEl: 'Φράγματα και τμήματα ποταμών', srcEl: 'Τμήμα Αναπτύξεως Υδάτων', val: '31.4', unit: 'MM³', c: '#5bc8e0', state: 'year',
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
  { id: 'island', band: 'GROUND', name: 'Island relief and sensors', src: 'OpenStreetMap · our SenseCAP cards', nameEl: 'Ανάγλυφο και αισθητήρες', srcEl: 'OpenStreetMap · οι κάρτες SenseCAP μας', val: '21', unit: 'RDG/MIN', c: '#F7C46B', state: 'live', pins: true,
    make: () => { const c = raster((x, y, g) => hillshade(g, ramp(Math.min(1, g0.h[g] / 1.6),
      [[0, 52, 84, 58], [.18, 78, 100, 58], [.4, 112, 110, 68], [.62, 124, 106, 78], [.82, 112, 100, 92], [1, 150, 152, 158]])).concat(255),
      (x, y, g) => { const d = Math.min(1, g0.inland[g] * 6); return [5 + (1 - d) * 10, 18 + (1 - d) * 24, 32 + (1 - d) * 40, 200]; });
      coastUnder(c, 'rgba(190,235,255,.85)', 1.4); return c; } },
  { id: 'city', band: 'CITY', name: 'Streets, buses, EV, people', src: 'OSM · GTFS · CYSTAT census', nameEl: 'Δρόμοι, λεωφορεία, φόρτιση, κάτοικοι', srcEl: 'OSM · GTFS · απογραφή CYSTAT', val: '1 942', unit: 'STOPS', c: '#C4B8FF', state: 'year',
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
  { id: 'heat', band: 'GROUND', name: 'Ground heat', src: 'MODIS LST · Terra and Aqua', nameEl: 'Θερμότητα εδάφους', srcEl: 'MODIS LST · Terra και Aqua', val: '34.6', unit: '°C LST', c: '#ff9a6b', state: 'old',
    make: () => raster((x, y, g) => { const t = Math.min(1, Math.max(0, .78 - g0.h[g] * .5 + (fbm(x / 40, y / 40, 3) - .5) * .4));
      const [r, gg, b] = ramp(t, [[0, 40, 60, 120], [.4, 120, 90, 110], [.7, 220, 130, 70], [1, 255, 215, 150]]); return [r, gg, b, 120]; }) },
  { id: 'veg', band: 'GROUND', name: 'Greenness', src: 'MODIS NDVI · every 16 days', nameEl: 'Πρασινάδα', srcEl: 'MODIS NDVI · κάθε 16 ημέρες', val: '0.42', unit: 'NDVI', c: '#8fd98a', state: 'old',
    make: () => raster((x, y, g) => { const n = Math.min(1, Math.max(0, fbm(x / 28, y / 28, 4) * 1.4 - .18 + g0.h[g] * .3));
      const [r, gg, b] = ramp(n, [[0, 120, 104, 70], [.45, 118, 140, 72], [1, 46, 136, 62]]); return [r, gg, b, 115]; }) },
  { id: 'air', band: 'AIR', name: 'Air quality', src: 'EEA and Labour Inspection stations', nameEl: 'Ποιότητα αέρα', srcEl: 'Σταθμοί ΕΟΠ και Επιθεώρησης Εργασίας', val: '9.3', unit: 'µG/M³', c: '#d9b3ff', state: 'live',
    make: () => { const c = buf(), x = c.getContext('2d');
      [[.63, .55, 1], [.49, .36, .8], [.3, .72, .7], [.1, .56, .5]].forEach(([u, v, w]) => {
        const g = x.createRadialGradient(u * LW, v * LH, 2, u * LW, v * LH, 90 * w);
        g.addColorStop(0, `rgba(217,179,255,${.42 * w})`); g.addColorStop(1, 'rgba(180,140,255,0)');
        x.fillStyle = g; x.beginPath(); x.arc(u * LW, v * LH, 90 * w, 0, 7); x.fill();
        x.strokeStyle = 'rgba(235,215,255,.9)'; x.lineWidth = 1; x.beginPath(); x.arc(u * LW, v * LH, 4, 0, 7); x.stroke(); });
      return c; } },
  { id: 'wind', band: 'AIR', name: 'Wind at 10 m', src: '6 weather stations, interpolated', nameEl: 'Άνεμος στα 10 m', srcEl: '6 σταθμοί, με παρεμβολή ανάμεσά τους', val: '5.1', unit: 'M/S 285°', c: '#59d7e8', state: 'live', live: windC },
  { id: 'rain', band: 'AIR', name: 'Rain this hour', src: 'Open-Meteo model · 11 km grid', nameEl: 'Βροχή αυτή την ώρα', srcEl: 'Μοντέλο Open-Meteo · πλέγμα 11 km', val: '0.4', unit: 'MM', c: '#7fb3ff', state: 'live', live: rainC },
  { id: 'haze', band: 'AIR', name: 'Haze and aerosol column', src: 'AERONET sun photometers · CAMS', nameEl: 'Αιθαλομίχλη και αερολύματα', srcEl: 'Ηλιακά φωτόμετρα AERONET · CAMS', val: '0.18', unit: 'AOD', c: '#ffd7a8', state: 'old',
    make: () => raster((x, y) => [255, 210, 160, 26 + fbm(x / 54 + 4, y / 54, 4) * 80], (x, y) => [255, 210, 160, 14 + fbm(x / 54 + 4, y / 54, 4) * 44]) },
  { id: 'cloud', band: 'SPACE', name: 'Clouds', src: 'EUMETSAT Meteosat · every 15 min', nameEl: 'Σύννεφα', srcEl: 'EUMETSAT Meteosat · κάθε 15 λεπτά', val: '38', unit: '% COVER', c: '#e8f4ff', state: 'old',
    make: () => raster((x, y) => [236, 244, 255, Math.min(185, Math.max(0, fbm(x / 64 + 9, y / 64 + 3, 5) - .46) * 400)],
      (x, y) => [236, 244, 255, Math.min(165, Math.max(0, fbm(x / 64 + 9, y / 64 + 3, 5) - .46) * 370)]) },
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
  const tex = new THREE.CanvasTexture(layer.live || layer.make()); tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
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

/* ---- the two sheets that move ---- */
let windScale = 1;        // set from the measured wind speed once the readings arrive
let windAng = -.3;        // where the wind blows TO, in the flat frame of the sheet, from the measured bearing
let rainScale = 1;        // how hard the rain falls: from the model's millimetres, 0 when it says none
function flow(x, y, t) { const n = fbm(x / 230 + t * .035, y / 230 - t * .02, 3);
  const ang = windAng + (n - .5) * .7, sp = (1.3 + 2.2 * fbm(x / 170 - t * .02, y / 170, 2)) * windScale;
  return [Math.cos(ang) * sp, Math.sin(ang) * sp, sp]; }
function windStep(t) { const c = windC.getContext('2d');
  c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(3,8,14,.12)'; c.fillRect(0, 0, LW, LH);
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let i = 0; i < NP; i++) { const o = i * 4, x = pcl[o], y = pcl[o + 1];
    const [dx, dy, sp] = flow(x, y, t), nx = x + dx * 1.7, ny = y + dy * 1.7, hot = Math.min(1, (sp - 1.2) / 2.3);
    c.strokeStyle = `rgba(${110 + hot * 140},${210 + hot * 45},${240 + hot * 15},${(.3 + hot * .55).toFixed(3)})`;
    c.lineWidth = .8 + hot; c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
    pcl[o] = nx; pcl[o + 1] = ny; pcl[o + 3]++;
    if (nx < -15 || nx > LW + 15 || ny < -15 || ny > LH + 15 || pcl[o + 3] > 130) { pcl[o] = Math.random() * LW; pcl[o + 1] = Math.random() * LH; pcl[o + 3] = 0; } } }
// One number for the whole island is what the model gives, so the rain is drawn as one veil over the whole island.
// Nothing here says where it is raining, because nothing in the feed knows.
function rainStep(t) { const c = rainC.getContext('2d'); c.clearRect(0, 0, LW, LH);
  if (rainScale <= 0) return;                                      // the model says no rain this hour, so none is drawn
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = `rgba(80,130,210,${(.05 + .07 * rainScale).toFixed(3)})`;
  c.fillRect(0, 0, LW, LH);
  const n = Math.round((mobile ? 320 : 820) * (.25 + .75 * rainScale));
  c.lineWidth = .8;
  for (let k = 0; k < n; k++) {
    const sx = ((k * 73.13) % LW + Math.sin(t * .3 + k) * 2), sy = ((k * 131.7 + t * 190) % LH);
    c.strokeStyle = `rgba(190,228,255,${((.12 + ((k % 9) / 30)) * (.4 + .6 * rainScale)).toFixed(3)})`;
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - 1.4, sy + 8); c.stroke();
  }
  c.globalCompositeOperation = 'source-over'; }

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
    const row = document.createElement('div'); row.className = 'row'; row.style.setProperty('--c', x.c);
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
let tour = true, tourT = 0;
const ease = (a, b, f) => a + (b - a) * (f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);
function stopTour() { if (!tour) return; tour = false; tourBtn.setAttribute('aria-pressed', 'false'); hint.hidden = true; }
tourBtn.addEventListener('click', () => { tour = !tour; tourBtn.setAttribute('aria-pressed', String(tour)); hint.hidden = !tour; });
controls.addEventListener('start', stopTour);
canvas.addEventListener('wheel', stopTour, { passive: true });

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
let frame = 0;
function tick() {
  const dt = clock.getDelta(), t = clock.getElapsedTime();
  windStep(t); if (frame % 2 === 0) rainStep(t);
  sheets.forEach((s) => { if (s.layer.live && s.on) s.tex.needsUpdate = true; });
  const a = t * .16;
  const sp = new THREE.Vector3(Math.cos(a) * SW * .62, TOP + 215 + Math.sin(a * 2) * 30, Math.sin(a) * SH * .8);
  polar.position.copy(sp); polar.lookAt(0, TOP, 0); polar.rotateX(Math.PI / 2);
  polarLabel.position.set(sp.x + 70, sp.y + 10, sp.z);
  polar.userData.beacon.material.color.set((t * 2) % 1 > .5 ? '#ff6b5e' : '#3a1410');
  cone.position.copy(sp.clone().lerp(new THREE.Vector3(sp.x * .25, TOP, sp.z * .25), .5));
  cone.lookAt(sp); cone.rotateX(Math.PI / 2);
  geo.rotation.y = t * .08;
  geoCone.position.copy(geo.position.clone().lerp(new THREE.Vector3(0, TOP, 0), .5));
  geoCone.lookAt(geo.position); geoCone.rotateX(Math.PI / 2);
  beams.forEach((b) => b.dots.forEach((d) => { d.t = (d.t + .004) % 1; d.mesh.position.lerpVectors(b.from, b.to, d.t); }));
  stepPulses(dt);
  pinLabels.forEach((rec, i) => {
    const h = haloAt(rec.ageMin);
    const pulse = rec.ageMin != null && rec.ageMin < 15 ? 1 + Math.sin(t * 2 + i) * .06 : 1;
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
  const r = best('wind_speed', false);
  windScale = r ? Math.max(.35, Math.min(2.2, r.value / 5)) : 1;
  const m = (live && live.map) || {};
  const fresh = (st) => st.at == null || Date.now() - st.at < 2 * 3600000;
  airportWind = (m.stations || [])
    .filter((st) => st.src === 'metar-airports' && st.wd != null && st.ws != null && st.ws > 0 && fresh(st))
    .map((st) => ({ name: st.name, wd: Math.round(st.wd), ws: st.ws }));
  const grid = (m.wind || []).filter((p) => p.wd != null);
  windDir = grid.length ? meanBearing(grid.map((p) => p.wd)) : null;
  windSrc = windDir == null ? null : 'openmeteo-weather';
  if (windDir != null) {
    const to = ((windDir + 180) % 360) * Math.PI / 180;            // a bearing names where the wind comes FROM
    windAng = Math.atan2(-Math.cos(to), Math.sin(to));             // north is up the sheet, east is to the right
  }
  const rains = (m.wind || []).map((p) => p.rain).filter((v) => v != null);
  const clouds = (m.wind || []).map((p) => p.cloud).filter((v) => v != null);
  rainMm = rains.length ? Math.round(meanOf(rains) * 100) / 100 : null;
  cloudPct = clouds.length ? Math.round(meanOf(clouds)) : null;
  skyAt = m.weatherAt || null;                                     // when the model grid itself was made
  rainScale = rainMm == null ? 1 : Math.min(1, rainMm / 1.5);      // until the model has spoken, the drawn rain stays
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
    setCard(c, cloudPct, '%', T('model · ', 'μοντέλο · ') + age, 'live');
    const mesh = c.mesh;
    if (mesh && mesh.material) { mesh.material.opacity = (c.baseOpacity == null ? (c.baseOpacity = mesh.material.opacity) : c.baseOpacity) * (.12 + .88 * cloudPct / 100); mesh.material.needsUpdate = true; }
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
      satReal = true;
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
    markArrivals(); paintWaits(); paintSolo();
  } catch (e) {
    // Keep what is on the screen and try again at the next refresh; the ages on it keep running, so nothing here
    // starts looking fresher than it is. The reason is kept where the tests and the console can see it.
    window.__liveError = String((e && e.message) || e);
    console.error('The live readings could not be shown: ' + window.__liveError);
  }
}
paintRail(); paintProbe();
loadLive(); loadSatellite();
setInterval(() => { if (!document.hidden) loadLive(); }, 120000);
// The readings on the screen age even when no new ones arrive, so the clock on them keeps running between fetches.
setInterval(() => { if (!document.hidden && live) { paintRail(); paintProbe(); paintPins(); paintSky(); paintSolo(); } }, 30000);
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
