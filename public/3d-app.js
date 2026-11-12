import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

window.__embedReady = true;   // the shell frame around this page waits for this

const SEARCH = typeof location.search === 'string' ? location.search : '';
const qp = (k) => { const m = new RegExp('[?&]' + k + '=([^&#]*)').exec(SEARCH); if (!m) return ''; try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return ''; } };
const EMBED = qp('embed') === '1';   // inside the site shell: its menu replaces our links
const LANG = qp('lang') === 'el' ? 'el' : 'en';
const T = (en, el) => (LANG === 'el' && el != null ? el : en);
const ROOT = document.documentElement;
if (ROOT && ROOT.classList) { if (EMBED) ROOT.classList.add('embed'); ROOT.lang = LANG; }
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Static text carries its Greek in data-el (text) and data-ael (aria-label).
if (LANG === 'el') {
  document.querySelectorAll('[data-el]').forEach((e) => { e.textContent = e.getAttribute('data-el'); });
  document.querySelectorAll('[data-ael]').forEach((e) => e.setAttribute('aria-label', e.getAttribute('data-ael')));
  document.title = 'Κύπρος 3D';
}
const GREEK_NAMES = { 'Air temperature': 'Θερμοκρασία αέρα', 'Air humidity': 'Υγρασία αέρα', 'Light intensity': 'Ένταση φωτός', 'CO2': 'CO2', 'Barometric pressure': 'Ατμοσφαιρική πίεση' };
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const LAT_C = 35.0, LNG_C = 33.25, KM_LAT = 111.2, KM_LNG = 111.2 * Math.cos((LAT_C * Math.PI) / 180);
const toX = (lng) => (lng - LNG_C) * KM_LNG;
const toZ = (lat) => -(lat - LAT_C) * KM_LAT;
const toLng = (x) => x / KM_LNG + LNG_C;
const toLat = (z) => -z / KM_LAT + LAT_C;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const state = { terrain: null, weather: null, air: null, sea: null, devices: [], latest: {}, cfg: null, surf: 'holo', exag: 8, mid: '4097', lastOk: {}, errors: {}, delayed: false };

/* ---------- colour scales ---------- */
const SCALES = {
  temp: { stops: [[0, [42, 120, 214]], [0.35, [27, 175, 122]], [0.65, [237, 161, 0]], [1, [227, 73, 72]]], unit: '°C' },
  holo: { stops: [[0, [20, 52, 112]], [0.12, [32, 82, 156]], [0.4, [58, 122, 204]], [0.75, [108, 172, 240]], [1, [196, 228, 255]]], unit: 'm' },
  elev: { stops: [[0, [60, 140, 70]], [0.15, [150, 170, 80]], [0.4, [170, 130, 80]], [0.75, [200, 190, 180]], [1, [250, 250, 250]]], unit: 'm' },
  pm25: { stops: [[0, [27, 175, 122]], [0.4, [237, 161, 0]], [1, [227, 73, 72]]], unit: 'µg/m³' },
  dust: { stops: [[0, [27, 175, 122]], [0.4, [237, 161, 0]], [1, [150, 60, 40]]], unit: 'µg/m³' },
};
function rampAt(stops, t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return c0.map((v, k) => (v + (c1[k] - v) * f) / 255);
    }
  }
  return stops[stops.length - 1][1].map((v) => v / 255);
}
function surfaceRange(kind) {
  if (kind === 'elev' || kind === 'holo') return [0, 1950];
  if (kind === 'pm25') return [0, 35];
  if (kind === 'dust') return [0, 200];
  const vals = state.weather ? state.weather.points.map((p) => p.t) : [10, 35];
  return [Math.floor(Math.min(...vals)), Math.ceil(Math.max(...vals))];
}

/* ---------- grid interpolation ---------- */
function sampleGrid(grid, field, lat, lng) {
  if (!grid) return null;
  const fy = clamp((lat - grid.lat0) / grid.latStep, 0, grid.rows - 1);
  const fx = clamp((lng - grid.lng0) / grid.lngStep, 0, grid.cols - 1);
  const r0 = Math.floor(fy), c0 = Math.floor(fx), r1 = Math.min(r0 + 1, grid.rows - 1), c1 = Math.min(c0 + 1, grid.cols - 1);
  const ty = fy - r0, tx = fx - c0;
  const g = (r, c) => grid.points[r * grid.cols + c][field];
  const a = g(r0, c0), b = g(r0, c1), c = g(r1, c0), d = g(r1, c1);
  if ([a, b, c, d].some((v) => v == null || isNaN(v))) return null;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/* ---------- scene ---------- */
THREE.ColorManagement.enabled = false;
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
const HOME_POS = new THREE.Vector3(2, 92, 176);   // a low, wide view of the whole island (as in the design picture)
const HOME_TGT = new THREE.Vector3(-16, 0, 4);    // a little to the left, so the island sits in the free space between the two panels
// the opening view: a wide screen looks from a low angle; a tall, narrow one (a phone) stands further back so the whole island still fits
function homeView() {
  const aspect = innerWidth / Math.max(1, innerHeight);
  const k = Math.min(2.4, Math.max(1, 1.7 / Math.max(0.2, aspect)));
  const tgt = innerWidth < 760 ? new THREE.Vector3(0, 0, 0) : HOME_TGT.clone();
  return { pos: tgt.clone().add(HOME_POS.clone().sub(HOME_TGT).multiplyScalar(k)), tgt };
}
camera.position.copy(homeView().pos);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(homeView().tgt);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 30;
controls.maxDistance = 600;
// newer three.js builds (r155 and later) use physical light units, which show the same intensities about 1.6 times darker than the colour scales were drawn for: lift them so flat ground shows its scale colour
const physicalLights = renderer.physicallyCorrectLights === true || renderer.useLegacyLights === false;
const LIGHT_K = physicalLights ? 1.6 : 1;
scene.add(new THREE.AmbientLight(0xffffff, 0.75 * LIGHT_K));
const sun = new THREE.DirectionalLight(0xffffff, 1.5 * LIGHT_K);
sun.position.set(-120, 200, 80);
scene.add(sun);
const world = new THREE.Group();
scene.add(world);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // on a phone the panels cover the top and bottom of the picture: slide the island up into the free middle band (the view only; the controls are not affected)
  if (w < 760) camera.setViewOffset(w, h, 0, Math.round(h * 0.13), w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ---------- terrain ---------- */
let terrainMesh = null, wireMesh = null;
let tGeo = null;
const ground = { rows: 0, cols: 0, h: null };

function buildTerrain() {
  const t = state.terrain;
  const { rows, cols } = t;
  const n = rows * cols;
  tGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const lat = t.lat0 + (r / (rows - 1)) * (t.lat1 - t.lat0);
      const lng = t.lng0 + (c / (cols - 1)) * (t.lng1 - t.lng0);
      pos[i * 3] = toX(lng);
      pos[i * 3 + 2] = toZ(lat);
    }
  }
  // only the triangles that touch land: the sea is the background, so the island stands out on its own
  const keep = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      if (t.elev[a] >= 3 || t.elev[b] >= 3 || t.elev[d] >= 3 || t.elev[e] >= 3) keep.push(a, b, d, b, e, d);
    }
  }
  const idx = new Uint32Array(keep);
  tGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  terrainMesh = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true }));
  world.add(terrainMesh);
  wireMesh = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xa6d0ff, wireframe: true, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  wireMesh.raycast = () => {};   // the pointer should meet the ground, not the grid lines
  world.add(wireMesh);
  applyExaggeration();
  recolor();
}

function applyExaggeration() {
  const t = state.terrain, pos = tGeo.attributes.position;
  for (let i = 0; i < t.elev.length; i++) pos.setY(i, (t.elev[i] / 1000) * state.exag);
  pos.needsUpdate = true;
  tGeo.computeVertexNormals();
  tGeo.computeBoundingSphere();
  tGeo.computeBoundingBox();
  refreshHeights();
}

function groundY(lat, lng) {
  const t = state.terrain;
  if (!t) return 0;
  const fy = clamp(((lat - t.lat0) / (t.lat1 - t.lat0)) * (t.rows - 1), 0, t.rows - 1);
  const fx = clamp(((lng - t.lng0) / (t.lng1 - t.lng0)) * (t.cols - 1), 0, t.cols - 1);
  const r = Math.round(fy), c = Math.round(fx);
  return (t.elev[r * t.cols + c] / 1000) * state.exag;
}

function recolor() {
  if (!tGeo) return;
  const t = state.terrain, col = tGeo.attributes.color;
  const kind = state.surf;
  const [lo, hi] = surfaceRange(kind);
  const sc = SCALES[kind];
  const grid = kind === 'pm25' || kind === 'dust' ? state.air : state.weather;
  const field = kind === 'temp' ? 't' : kind;
  for (let r = 0; r < t.rows; r++) {
    for (let c = 0; c < t.cols; c++) {
      const i = r * t.cols + c;
      const elev = t.elev[i];
      let rgb;
      if (elev < 3) {
        rgb = [0.04, 0.12, 0.26];
      } else if (kind === 'elev' || kind === 'holo') {
        rgb = rampAt(sc.stops, (elev - lo) / (hi - lo));
      } else {
        const lat = t.lat0 + (r / (t.rows - 1)) * (t.lat1 - t.lat0);
        const lng = t.lng0 + (c / (t.cols - 1)) * (t.lng1 - t.lng0);
        const v = sampleGrid(grid, field, lat, lng);
        rgb = v == null ? [0.4, 0.4, 0.4] : rampAt(sc.stops, (v - lo) / (hi - lo || 1));
      }
      col.setXYZ(i, rgb[0], rgb[1], rgb[2]);
    }
  }
  col.needsUpdate = true;
  if (wireMesh) wireMesh.material.opacity = kind === 'holo' ? 0.16 : 0.07;
  const names = { holo: T('Elevation (blue relief)', 'Υψόμετρο (μπλε ανάγλυφο)'), temp: T('Temperature (Open-Meteo model)', 'Θερμοκρασία (μοντέλο Open-Meteo)'), elev: T('Elevation', 'Υψόμετρο'), pm25: T('PM2.5 (Open-Meteo)', 'PM2.5 (Open-Meteo)'), dust: T('Dust (Open-Meteo)', 'Σκόνη (Open-Meteo)') };
  $('lt').textContent = names[kind];
  $('bar').style.background = 'linear-gradient(90deg,' + [0, 0.25, 0.5, 0.75, 1].map((q) => { const c = rampAt(sc.stops, q).map((v) => Math.round(v * 255)); return `rgb(${c})`; }).join(',') + ')';
  $('lo').textContent = lo + ' ' + sc.unit;
  $('hi').textContent = hi + ' ' + sc.unit;
}

/* ---------- sensors ---------- */
const sensorGroup = new THREE.Group();
world.add(sensorGroup);
const sensors = new Map();

function mRange(mid, vals) {
  if (mid === '4097') return [10, 40];
  if (mid === '4098') return [0, 100];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.1 || 1;
  return [lo - pad, hi + pad];
}
const WEATHER_FIELD = { 4097: 't', 4098: 'rh' };

function sensorPos(d) {
  const l = state.latest[d.eui] || {};
  const [latId, lngId] = state.cfg.gps;
  const lat = l[latId] ? Number(l[latId].v) : d.lat;
  const lng = l[lngId] ? Number(l[lngId].v) : d.lng;
  return isFinite(lat) && isFinite(lng) && lat && lng ? [lat, lng] : null;
}

function syncSensors() {
  const seen = new Set();
  const withVal = state.devices.map((d) => ({ d, v: state.latest[d.eui] && state.latest[d.eui][state.mid] ? state.latest[d.eui][state.mid].v : null }));
  const vals = withVal.map((x) => x.v).filter((v) => v != null);
  const [lo, hi] = vals.length ? mRange(state.mid, vals) : [0, 1];
  const sc = SCALES.temp.stops;
  withVal.forEach(({ d, v }) => {
    const p = sensorPos(d);
    if (!p) return;
    seen.add(d.eui);
    let s = sensors.get(d.eui);
    if (!s) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1, 16), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 }));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      cap.visible = false;
      mesh.userData = { kind: 'sensor', eui: d.eui };
      sensorGroup.add(mesh);
      sensorGroup.add(cap);
      s = { mesh, cap, h: 1, target: 1, color: new THREE.Color(0x888888), tcolor: new THREE.Color(0x888888), markerH: 0 };
      sensors.set(d.eui, s);
    }
    s.d = d; s.lat = p[0]; s.lng = p[1]; s.v = v;
    const t = v == null ? 0 : (v - lo) / (hi - lo || 1);
    s.target = !d.online || v == null ? 1.5 : 3 + clamp(t, 0, 1) * 30;
    s.tcolor.setRGB(...(!d.online || v == null ? [0.5, 0.5, 0.5] : rampAt(sc, t)));
    const wf = WEATHER_FIELD[state.mid];
    const wv = wf ? sampleGrid(state.weather, wf, p[0], p[1]) : null;
    s.wv = wv;
    s.markerTarget = wv == null ? null : 3 + clamp((wv - lo) / (hi - lo || 1), 0, 1) * 30;
  });
  for (const [eui, s] of sensors) {
    if (!seen.has(eui)) { sensorGroup.remove(s.mesh); sensorGroup.remove(s.cap); if (s.label) s.label.remove(); sensors.delete(eui); }
  }
  refreshHeights();
  syncLabels();
  syncList();
}

function refreshHeights() {
  for (const s of sensors.values()) {
    s.baseY = groundY(s.lat, s.lng);
    s.mesh.position.x = toX(s.lng); s.mesh.position.z = toZ(s.lat);
    s.cap.position.x = s.mesh.position.x; s.cap.position.z = s.mesh.position.z;
  }
  for (const b of buoys) b.mesh.position.y = b.h / 2;
}

/* ---------- numbers on the columns and the sensor list ---------- */
const labelsEl = $('labels');
const fmt = (v) => Math.round(v * 10) / 10;
const unitOf = (m) => (state.cfg && state.cfg.names[m] ? state.cfg.names[m][1] : '');
const nameOf = (m) => (state.cfg && state.cfg.names[m] ? (LANG === 'el' && GREEK_NAMES[state.cfg.names[m][0]]) || state.cfg.names[m][0] : T('Measurement ', 'Μέτρηση ') + m);
const cssColor = (c) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
const valueText = (s) => (!s.d.online ? T('offline', 'εκτός λειτουργίας') : s.v == null ? T('no reading', 'καμία μέτρηση') : `${fmt(s.v)} ${unitOf(state.mid)}`.trim());
function labelParts(s, mode) {
  const live = s.d.online && s.v != null;
  let extra = '';
  if (mode === 'diff' && live && s.wv != null) extra = `${s.v - s.wv > 0 ? '+' : ''}${fmt(s.v - s.wv)} ${T('vs model', 'έναντι μοντέλου')}`;
  return { name: mode === 'name' ? s.d.name : '', value: valueText(s), extra, live };
}
function syncLabels() {
  const mode = $('labelMode').value;
  for (const [eui, s] of sensors) {
    if (mode === 'off') { if (s.label) { s.label.remove(); s.label = null; } continue; }
    if (!s.label) {
      s.label = document.createElement('div');
      s.label.className = 'lb';
      labelsEl.appendChild(s.label);
    }
    const parts = labelParts(s, mode);
    s.label.textContent = '';
    if (parts.name) { const b = document.createElement('b'); b.textContent = parts.name; s.label.appendChild(b); }
    const v = document.createElement('span'); v.className = 'v'; v.textContent = parts.value; s.label.appendChild(v);
    if (parts.extra) { const i = document.createElement('i'); i.textContent = parts.extra; s.label.appendChild(i); }
    s._lwDirty = true;
    s.label.classList.toggle('off', !parts.live);
    s.label.style.setProperty('--c', parts.live ? cssColor(s.tcolor) : '#777');
    s.label.dataset.eui = eui;
  }
}
const tmpV = new THREE.Vector3();
function placeLabels() {
  const show = $('lSensor').checked && $('labelMode').value !== 'off';
  const w = innerWidth, h = innerHeight;
  const vis = [];
  for (const s of sensors.values()) {
    if (!s.label) continue;
    tmpV.set(toX(s.lng), s.baseY + Math.max(s.h, s.cap.visible ? s.markerH : 0) + 2, toZ(s.lat)).project(camera);
    const inView = show && tmpV.z > -1 && tmpV.z < 1 && Math.abs(tmpV.x) < 1.15 && tmpV.y > -1.1 && tmpV.y < 1.1;
    if (!inView) { s.label.style.display = 'none'; continue; }
    s._x = ((tmpV.x + 1) / 2) * w; s._y = ((1 - tmpV.y) / 2) * h; s._z = tmpV.z;
    vis.push(s);
  }
  // keep the picture calm: the chosen sensor first, then live ones, then the nearest; a label that would sit on top of one already placed waits until you zoom in
  vis.sort((a, b) => ((b.d.eui === selEui) - (a.d.eui === selEui)) || ((b.d.online && b.v != null) - (a.d.online && a.v != null)) || (a._z - b._z));
  // the two panels sit on top of the scene, so a label behind them would be half hidden: count them as taken
  const taken = [];
  for (const id of ['controls', 'list']) {
    const P = $(id);
    if (!P) continue;
    const r = P.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    taken.push([r.left, r.top, r.right, r.bottom]);
  }
  for (const s of vis) {
    const L = s.label;
    L.style.display = 'block';
    if (!s._lw || s._lwDirty) { s._lw = L.offsetWidth; s._lh = L.offsetHeight; s._lwDirty = false; }
    const cx = Math.min(w - s._lw / 2 - 6, Math.max(s._lw / 2 + 6, s._x));   // a label never runs off the edge of the view
    const x0 = cx - s._lw / 2 - 4, x1 = cx + s._lw / 2 + 4, y0 = s._y - s._lh - 4, y1 = s._y + 2;
    const hit = taken.some((r) => x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]);
    if (hit && s.d.eui !== selEui) { L.style.display = 'none'; continue; }
    taken.push([x0, y0, x1, y1]);
    L.style.transform = `translate(${cx}px, ${s._y}px) translate(-50%, -100%)`;
    L.style.zIndex = String(Math.round((1 - s._z) * 1000));   // nearer labels on top
    L.classList.toggle('hot', s.d.eui === selEui);
  }
}
let selEui = null, lastRows = '';
function rowsFor(sort) {
  const list = [...sensors.values()];
  const live = list.filter((s) => s.d.online && s.v != null);
  const rest = list.filter((s) => !(s.d.online && s.v != null));
  const byName = (a, b) => a.d.name.localeCompare(b.d.name);
  if (sort === 'name') list.sort(byName);
  else { live.sort((a, b) => (sort === 'low' ? a.v - b.v : b.v - a.v) || byName(a, b)); rest.sort(byName); }
  return sort === 'name' ? list : [...live, ...rest];
}
function syncList() {
  $('listT').textContent = T('Sensors: ', 'Αισθητήρες: ') + nameOf(state.mid);
  const rows = $('rows');
  const sig = [selEui, $('listSort').value, state.mid, ...rowsFor($('listSort').value).map((s) => `${s.d.eui}|${s.d.name}|${valueText(s)}|${s.d.online}|${cssColor(s.tcolor)}`),
    ...state.devices.filter((d) => !sensors.has(d.eui)).map((d) => d.eui)].join('~');
  if (sig === lastRows) return;
  lastRows = sig;
  rows.textContent = '';
  rowsFor($('listSort').value).forEach((s) => {
    const r = document.createElement('button');
    r.type = 'button';
    r.className = 'row' + (s.d.eui === selEui ? ' sel' : '');
    r.dataset.eui = s.d.eui;
    r.setAttribute('aria-label', s.d.name + ', ' + valueText(s) + ' (' + T('fly to this column', 'μετάβαση σε αυτή τη στήλη') + ')');
    r.style.setProperty('--c', s.d.online && s.v != null ? cssColor(s.tcolor) : '#777');
    const dot = document.createElement('span'); dot.className = 'dot';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = s.d.name;
    const vl = document.createElement('span'); vl.className = 'vl'; vl.textContent = valueText(s);
    r.append(dot, nm, vl);
    rows.appendChild(r);
  });
  state.devices.filter((d) => !sensors.has(d.eui)).forEach((d) => {
    const r = document.createElement('div');
    r.className = 'row none';
    r.title = delayedNoPos();
    const dot = document.createElement('span'); dot.className = 'dot';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = d.name;
    const vl = document.createElement('span'); vl.className = 'vl'; vl.textContent = T('no position', 'καμία θέση');
    r.append(dot, nm, vl);
    rows.appendChild(r);
  });
}
let fly = null;
function flyTo(eui) {
  const s = sensors.get(eui);
  if (!s) return;
  selEui = eui;
  const target = new THREE.Vector3(toX(s.lng), s.baseY + s.target * 0.5, toZ(s.lat));
  const dir = camera.position.clone().sub(controls.target).normalize();
  dir.y = clamp(dir.y, 0.4, 0.8);
  dir.normalize();
  fly = { at: performance.now(), dur: REDUCED ? 1 : 1300, p0: camera.position.clone(), p1: target.clone().addScaledVector(dir, 55), t0: controls.target.clone(), t1: target };
  lastRows = '';
  syncList();
}
function stepFly(now) {
  if (!fly) return;
  const f = clamp((now - fly.at) / fly.dur, 0, 1);
  const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  camera.position.lerpVectors(fly.p0, fly.p1, e);
  controls.target.lerpVectors(fly.t0, fly.t1, e);
  if (f >= 1) fly = null;
}
controls.addEventListener('start', () => { fly = null; if (selEui) { selEui = null; lastRows = ''; syncList(); } });
$('rows').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (row && row.dataset.eui && sensors.has(row.dataset.eui)) flyTo(row.dataset.eui);
});
$('listSort').addEventListener('change', syncList);
$('labelMode').addEventListener('change', () => { syncLabels(); });
$('lList').addEventListener('change', () => { $('list').style.display = $('lList').checked ? '' : 'none'; });

/* ---------- sea buoys ---------- */
const seaGroup = new THREE.Group();
world.add(seaGroup);
let buoys = [];
function syncSea() {
  seaGroup.clear();
  buoys = [];
  if (!state.sea) return;
  const sc = SCALES.temp.stops;
  state.sea.points.forEach((p) => {
    if (p.wave == null || p.sst == null) return;
    const h = 2 + clamp(p.wave, 0, 4) * 3;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, h, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color(...rampAt(sc, (p.sst - 15) / 15)), roughness: 0.4, transparent: true, opacity: 0.9 }));
    mesh.position.set(toX(p.lng), h / 2, toZ(p.lat));
    mesh.userData = { kind: 'buoy', p };
    seaGroup.add(mesh);
    buoys.push({ mesh, h });
  });
}

/* ---------- clouds and rain ---------- */
const cloudGroup = new THREE.Group();
world.add(cloudGroup);
let rain = null;
const rainDrops = [];
function syncClouds() {
  cloudGroup.clear();
  rainDrops.length = 0;
  if (rain) { cloudGroup.remove(rain); rain = null; }
  if (!state.weather) return;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
  const geo = new THREE.SphereGeometry(1, 12, 8);
  state.weather.points.forEach((p, i) => {
    const cover = p.cloud || 0;
    const x = toX(p.lng), z = toZ(p.lat);
    if (cover > 25) {
      const n = Math.ceil(cover / 25);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(geo, mat);
        const a = (k / n) * Math.PI * 2 + i;
        const rr = 4 + (k % 3) * 3;
        m.position.set(x + Math.cos(a) * rr, 34 + (k % 2) * 2, z + Math.sin(a) * rr);
        m.scale.set(8 + (k % 3) * 3, 3.5 + (cover / 100) * 2.5, 7 + (k % 2) * 3);
        cloudGroup.add(m);
      }
    }
    if ((p.rain || 0) > 0.05) {
      const count = Math.min(300, 60 + Math.round(p.rain * 60));
      for (let k = 0; k < count; k++) rainDrops.push({ x: x + (Math.random() - 0.5) * 18, z: z + (Math.random() - 0.5) * 18, y: Math.random() * 32, v: 22 + Math.random() * 10 });
    }
  });
  if (rainDrops.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rainDrops.length * 3), 3));
    rain = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8ec5ff, size: 1.1, sizeAttenuation: true }));
    rain.frustumCulled = false;
    cloudGroup.add(rain);
  }
}

/* ---------- wind ---------- */
const WIND_N = 2200;
let windLines = null;
const wp = [];
function initWind() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WIND_N * 6), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(WIND_N * 6), 3));
  windLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
  windLines.frustumCulled = false;
  world.add(windLines);
  for (let i = 0; i < WIND_N; i++) wp.push(spawn({}));
}
const XMIN = toX(32.2), XMAX = toX(34.7), ZMIN = toZ(35.75), ZMAX = toZ(34.5);
function spawn(p) {
  p.x = XMIN + Math.random() * (XMAX - XMIN);
  p.z = ZMIN + Math.random() * (ZMAX - ZMIN);
  p.age = 0;
  p.max = 4 + Math.random() * 6;
  p.px = p.x; p.pz = p.z;
  return p;
}
const SPEED_SCALE = 3.2;
function stepWind(dt) {
  if (!windLines || !state.weather) return;
  const pos = windLines.geometry.attributes.position, col = windLines.geometry.attributes.color;
  for (let i = 0; i < wp.length; i++) {
    const p = wp[i];
    const lat = toLat(p.z), lng = toLng(p.x);
    const ws = sampleGrid(state.weather, 'ws', lat, lng) ?? 0;
    const wd = sampleGrid(state.weather, 'wd', lat, lng) ?? 0;
    const to = ((wd + 180) * Math.PI) / 180;
    const vx = Math.sin(to) * ws * SPEED_SCALE, vz = -Math.cos(to) * ws * SPEED_SCALE;
    p.px = p.x; p.pz = p.z;
    p.x += vx * dt; p.z += vz * dt; p.age += dt;
    if (p.age > p.max || p.x < XMIN || p.x > XMAX || p.z < ZMIN || p.z > ZMAX) spawn(p);
    const y = groundY(toLat(p.z), toLng(p.x)) + 6;
    const tail = 0.55;
    pos.setXYZ(i * 2, p.x, y, p.z);
    pos.setXYZ(i * 2 + 1, p.x - vx * tail * 0.4, y, p.z - vz * tail * 0.4);
    const c = rampAt([[0, [150, 200, 255]], [1, [255, 255, 255]]], ws / 14);
    col.setXYZ(i * 2, c[0], c[1], c[2]);
    col.setXYZ(i * 2 + 1, c[0] * 0.2, c[1] * 0.2, c[2] * 0.2);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
}

function stepRain(dt) {
  if (!rain) return;
  const pos = rain.geometry.attributes.position;
  rainDrops.forEach((d, i) => {
    d.y -= d.v * dt;
    if (d.y < 0) d.y = 32;
    pos.setXYZ(i, d.x, d.y + groundY(toLat(d.z), toLng(d.x)) * 0.5, d.z);
  });
  pos.needsUpdate = true;
}

/* ---------- hover ---------- */
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tip = $('tip');
let downAt = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const targets = [...[...sensors.values()].map((s) => s.mesh), ...seaGroup.children];
  if (terrainMesh) targets.push(terrainMesh);
  const hit = ray.intersectObjects(targets, false)[0];
  if (!hit) { tip.style.display = 'none'; renderer.domElement.style.cursor = 'default'; return; }
  const ud = hit.object.userData;
  const unit = (m) => (state.cfg.names[m] ? state.cfg.names[m][1] : '');
  let html = '';
  if (ud.kind === 'sensor') {
    const s = sensors.get(ud.eui);
    html = `<b>${esc(s.d.name)}</b><br>${esc(s.d.group)} · ${s.d.online ? T('online', 'σε λειτουργία') : T('offline', 'εκτός λειτουργίας')}<br>`;
    html += s.v == null ? T('No reading', 'Καμία μέτρηση') : `${esc(nameOf(state.mid))}: ${Math.round(s.v * 10) / 10} ${esc(unit(state.mid))}`;
    if (s.wv != null && s.v != null) html += `<br>${T('Weather model', 'Μοντέλο καιρού')}: ${Math.round(s.wv * 10) / 10} ${esc(unit(state.mid))}<br>${T('Difference', 'Διαφορά')}: ${s.v - s.wv > 0 ? '+' : ''}${Math.round((s.v - s.wv) * 10) / 10}`;
    if (state.delayed) html += `<br>${esc(delayedLine())}`;
    html += `<br><i>${T('Click to open history', 'Πατήστε για το ιστορικό')}</i>`;
    renderer.domElement.style.cursor = 'pointer';
  } else if (ud.kind === 'buoy') {
    html = `<b>${T('Sea point', 'Σημείο θάλασσας')}</b><br>${T('Wave height', 'Ύψος κύματος')} ${ud.p.wave} m<br>${T('Sea temperature', 'Θερμοκρασία θάλασσας')} ${ud.p.sst} °C`;
  } else {
    const lat = toLat(hit.point.z), lng = toLng(hit.point.x);
    const t = state.terrain;
    const r = Math.round(((lat - t.lat0) / (t.lat1 - t.lat0)) * (t.rows - 1)), c = Math.round(((lng - t.lng0) / (t.lng1 - t.lng0)) * (t.cols - 1));
    const el = t.elev[clamp(r, 0, t.rows - 1) * t.cols + clamp(c, 0, t.cols - 1)];
    if (el < 3) { tip.style.display = 'none'; return; }
    const tv = sampleGrid(state.weather, 't', lat, lng), pm = sampleGrid(state.air, 'pm25', lat, lng);
    html = `${T('Elevation', 'Υψόμετρο')} ${el} m`;
    if (tv != null) html += `<br>${T('Temperature', 'Θερμοκρασία')} ${Math.round(tv * 10) / 10} °C (${T('model', 'μοντέλο')})`;
    if (pm != null) html += `<br>PM2.5 ${Math.round(pm * 10) / 10} µg/m³`;
    renderer.domElement.style.cursor = 'default';
  }
  tip.innerHTML = html;
  tip.style.display = 'block';
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 270) + 'px';
  tip.style.top = Math.min(e.clientY + 14, innerHeight - 110) + 'px';
});
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects([...sensors.values()].map((s) => s.mesh), false)[0];
  if (hit) { const to = '#/vehicles/' + encodeURIComponent(hit.object.userData.eui); try { if (EMBED && parent !== window) parent.location.hash = to; else location.href = '/' + to; } catch (e) { location.href = '/' + to; } }
});

/* ---------- animation ---------- */
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const k = 1 - Math.exp(-dt * 4);
  for (const s of sensors.values()) {
    s.h += (s.target - s.h) * k;
    s.color.lerp(s.tcolor, k);
    s.mesh.scale.y = s.h;
    s.mesh.position.y = s.baseY + s.h / 2;
    s.mesh.material.color.copy(s.color);
    if (s.markerTarget != null) {
      s.markerH = s.markerH ? s.markerH + (s.markerTarget - s.markerH) * k : s.markerTarget;
      s.cap.visible = true;
      s.cap.position.y = s.baseY + s.markerH;
    } else {
      s.cap.visible = false;
    }
  }
  windLines.visible = $('lWind').checked;
  cloudGroup.visible = $('lCloud').checked;
  sensorGroup.visible = $('lSensor').checked;
  seaGroup.visible = $('lSea').checked;
  if (windLines.visible) stepWind(dt);
  if (cloudGroup.visible) stepRain(dt);
  stepFly(performance.now());
  controls.update();
  placeLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ---------- data ---------- */
async function getJson(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
function showStatus() {
  const f = (k) => (state.errors[k] ? `<span style="color:var(--bad)">${esc(state.errors[k])}</span>` : state.lastOk[k] ? new Date(state.lastOk[k]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : T('waiting', 'αναμονή'));
  $('status').innerHTML = `${T('Sensors', 'Αισθητήρες')}: ${f('sensors')}<br>${T('Weather', 'Καιρός')}: ${f('weather')}<br>${T('Air quality', 'Ποιότητα αέρα')}: ${f('air')}<br>${T('Sea', 'Θάλασσα')}: ${f('sea')}` +
    (state.terrain && state.terrain.mock ? '<br><b>' + T('Test mode: synthetic weather', 'Δοκιμαστική λειτουργία: συνθετικός καιρός') + '</b>' : '') + (state.cfg && state.cfg.demo ? '<br>' + T('Demo sensors', 'Δοκιμαστικοί αισθητήρες') : '');
  const stale = !state.lastOk.sensors || Date.now() - state.lastOk.sensors > 120000;
  $('live').textContent = stale ? T('Waiting', 'Αναμονή') : T('Live', 'Ζωντανά');
  $('live').classList.toggle('stale', stale);
}
// Public visitors get vehicle positions that are late and rounded (the API says posDelayed): say so.
const delayHours = () => { const m = state.cfg && state.cfg.posDelayMin; return m ? Math.round(m / 60) || 1 : 2; };
const gridKm = () => { const g = state.cfg && state.cfg.posGrid; return g ? Math.max(1, Math.round(g * 111)) : 1; };
function delayedLine() {
  const h = delayHours(), g = gridKm();
  return T(`Positions are about ${h} ${h === 1 ? 'hour' : 'hours'} late and rounded to ${g} km`, `Οι θέσεις εμφανίζονται με καθυστέρηση περίπου ${h} ${h === 1 ? 'ώρας' : 'ωρών'} και στρογγυλοποιημένες στο ${g} χλμ`);
}
const delayedNoPos = () => (state.delayed ? T('No public position yet. A position appears about 2 hours after the vehicle reports it.', 'Δεν υπάρχει ακόμα δημόσια θέση. Η θέση εμφανίζεται περίπου 2 ώρες αφού την αναφέρει το όχημα.') : T('No GPS position yet', 'Δεν υπάρχει ακόμα θέση GPS'));
function syncDelayed() {
  state.delayed = state.devices.length ? state.devices.some((d) => d.posDelayed) : Boolean(state.cfg && state.cfg.exactPositions === false);
  if (ROOT && ROOT.classList) ROOT.classList.toggle('delayed', state.delayed);
  $('lgPriv').textContent = state.delayed ? delayedLine() + '.' : '';
}
async function refresh(kind) {
  try {
    if (kind === 'sensors') {
      [state.devices, state.latest] = await Promise.all([getJson('/api/devices'), getJson('/api/latest')]);
      fillMeasures();
      syncDelayed();
      syncSensors();
      const n = sensors.size;
      $('subSen').textContent = n ? T(n + (n === 1 ? ' shown' : ' shown'), 'Εμφανίζονται ' + n) + (state.delayed ? T(' · delayed', ' · με καθυστέρηση') : '') : T('No position yet', 'Δεν υπάρχει ακόμα θέση');
    } else {
      state[kind] = await getJson('/api/' + kind);
      if (kind === 'weather') { syncClouds(); recolor(); syncSensors(); }
      if (kind === 'air') recolor();
      if (kind === 'sea') syncSea();
    }
    state.lastOk[kind] = Date.now();
    delete state.errors[kind];
  } catch (e) {
    state.errors[kind] = e.message;
  }
  const errs = Object.keys(state.errors);
  $('err').textContent = '';
  if (errs.length) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = T('Try again', 'Δοκιμάστε ξανά');
    b.addEventListener('click', () => errs.forEach((k) => refresh(k)));
    $('err').textContent = T('Could not update: ', 'Δεν ενημερώθηκε: ') + errs.map((k) => ({ sensors: T('sensors', 'αισθητήρες'), weather: T('weather', 'καιρός'), air: T('air quality', 'ποιότητα αέρα'), sea: T('sea', 'θάλασσα') }[k] || k)).join(', ') + '. ';
    $('err').appendChild(b);
  }
  showStatus();
}
function fillMeasures() {
  const sel = $('measure');
  const gps = state.cfg.gps;
  const mids = [...new Set(state.devices.flatMap((d) => d.measurements))].filter((m) => !gps.includes(m));
  const key = mids.join(',');
  if (sel.dataset.key === key) return;
  sel.dataset.key = key;
  sel.innerHTML = mids.map((m) => `<option value="${esc(m)}">${esc(nameOf(m))}${state.cfg.names[m] && state.cfg.names[m][1] ? ' (' + esc(state.cfg.names[m][1]) + ')' : ''}</option>`).join('');
  if (!mids.includes(state.mid)) state.mid = mids[0] || '4097';
  sel.value = state.mid;
}

document.querySelectorAll('input[name=surf]').forEach((r) => r.addEventListener('change', () => { state.surf = r.value; recolor(); }));
$('measure').addEventListener('change', (e) => { state.mid = e.target.value; for (const s of sensors.values()) s.markerH = 0; syncSensors(); });
$('exag').addEventListener('input', (e) => { state.exag = Number(e.target.value); applyExaggeration(); });

async function loadTerrain() {
  for (;;) {
    const r = await fetch('/api/terrain');
    const j = await r.json();
    if (r.status === 200) return j;
    if (r.status !== 202) throw new Error(j.error || T('Request failed', 'Το αίτημα απέτυχε'));
    const pct = Math.round((j.progress || 0) * 100);
    $('msgT').textContent = T('Building the island from elevation data… ', 'Δημιουργία του νησιού από δεδομένα υψομέτρου… ') + pct + '%';
    $('msgBar').style.width = Math.max(6, pct) + '%';
    $('msgE').textContent = j.error ? T(`Open-Meteo asked us to slow down (${j.error}). Retrying automatically.`, `Το Open-Meteo μάς ζήτησε να επιβραδύνουμε (${j.error}). Δοκιμάζουμε ξανά αυτόματα.`) : '';
    await new Promise((ok) => setTimeout(ok, 4000));
  }
}

function setMenu(closed) {
  $('controls').classList.toggle('closed', closed);
  $('fold').setAttribute('aria-expanded', closed ? 'false' : 'true');
  $('bMenu').setAttribute('aria-expanded', closed ? 'false' : 'true');
}
$('fold').addEventListener('click', () => setMenu(!$('controls').classList.contains('closed')));
$('bMenu').addEventListener('click', () => setMenu(!$('controls').classList.contains('closed')));
// Tour: the island turns slowly on its own (not for people who asked for less motion); any touch of the mouse stops it
function setTour(on) {
  controls.autoRotate = on;
  controls.autoRotateSpeed = 1.1;
  $('bTour').classList.toggle('on', on);
  $('bTour').setAttribute('aria-pressed', on ? 'true' : 'false');
  $('bTourT').textContent = on ? T('Stop', 'Διακοπή') : T('Tour', 'Περιήγηση');
}
if (REDUCED) { $('bTour').disabled = true; $('bTour').title = T('Turned off because your device asks for less motion', 'Απενεργοποιημένο επειδή η συσκευή σας ζητά λιγότερη κίνηση'); }
$('bTour').addEventListener('click', () => { if (!REDUCED) { if (!controls.autoRotate) fly = null; setTour(!controls.autoRotate); } });
controls.addEventListener('start', () => { if (controls.autoRotate) setTour(false); });
// Whole island: fly back to the opening view
$('bHome').addEventListener('click', () => {
  setTour(false);
  selEui = null; lastRows = ''; syncList();
  const hv = homeView();
  fly = { at: performance.now(), dur: REDUCED ? 1 : 1200, p0: camera.position.clone(), p1: hv.pos, t0: controls.target.clone(), t1: hv.tgt };
});
// the round help button
function setHelp(open) { $('helpCard').hidden = !open; $('help3d').setAttribute('aria-expanded', open ? 'true' : 'false'); }
$('help3d').addEventListener('click', () => setHelp($('helpCard').hidden));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('helpCard').hidden) { setHelp(false); $('help3d').focus(); } });
if (innerWidth < 760) $('controls').classList.add('closed');   // on a phone the layers start folded away
if (REDUCED) $('lWind').checked = false;   // no flowing wind for people who asked for less motion

let started = false;
async function start() {
  $('msg').style.display = '';
  $('msgT').textContent = T('Building the island…', 'Δημιουργία του νησιού…');
  $('msgE').textContent = '';
  try {
    state.cfg = await getJson('/api/config');
    state.terrain = await loadTerrain();
  } catch (e) {
    $('msgT').textContent = T('The island data could not be loaded.', 'Δεν φορτώθηκαν τα δεδομένα του νησιού.');
    $('msgE').textContent = '';
    const er = document.createElement('div'); er.className = 'e'; er.textContent = e.message;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.style.marginTop = '12px'; b.textContent = T('Try again', 'Δοκιμάστε ξανά');
    b.addEventListener('click', start);
    $('msgE').append(er, b);
    return;
  }
  if (started) return;
  started = true;
  buildTerrain();
  initWind();
  $('msg').style.display = 'none';
  frame();
  await Promise.all([refresh('weather'), refresh('air'), refresh('sea'), refresh('sensors')]);
  setInterval(() => refresh('sensors'), 30000);
  setInterval(() => refresh('weather'), 300000);
  setInterval(() => refresh('air'), 900000);
  setInterval(() => refresh('sea'), 900000);
  setInterval(showStatus, 15000);
}
start();
