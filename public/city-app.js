/*
  The city centres in 3D (/city.html, shown in the site shell by pages/city.js).
  Cyprus first: the island from the site's own outline (/site/island.js) with the four cities on it. Press a city and the camera flies
  down to its centre: buildings and streets from OpenStreetMap (GET /api/city/<id>, city-buildings.js), in a box of 1.8 km.
  Buildings stand at their recorded height, at their number of floors times 3.2 m, or, when neither is recorded, at 9 m; a layer
  shows which ones are guessed, and the info card says how many of each there are.
  Drag moves the map, right-drag or two fingers turn it, the wheel or a pinch zooms. Nothing here shows a vehicle or a person.
  Test hooks: body[data-view] island | flying | city, body[data-city], body[data-buildings], window.__embedReady.
*/
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SEARCH = typeof location.search === 'string' ? location.search : '';
const qp = (k) => { const m = new RegExp('[?&]' + k + '=([^&#]*)').exec(SEARCH); if (!m) return ''; try { return decodeURIComponent(m[1]); } catch (e) { return ''; } };
const LANG = qp('lang') === 'el' ? 'el' : 'en';
const T = (en, el) => (LANG === 'el' ? el : en);
const $ = (id) => document.getElementById(id);
const nf = (n) => Number(n).toLocaleString(LANG === 'el' ? 'el-GR' : 'en-GB');
const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach((k) => { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); }); kids.flat().forEach((c) => { if (c != null) e.append(c.nodeType ? c : String(c)); }); return e; };
document.documentElement.lang = LANG;
if (LANG === 'el') {
  document.querySelectorAll('[data-el]').forEach((e) => { e.textContent = e.getAttribute('data-el'); });
  document.querySelectorAll('[data-ael]').forEach((e) => e.setAttribute('aria-label', e.getAttribute('data-ael')));
  document.title = 'Τα κέντρα των πόλεων σε 3D · Athena';
}
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body;
const said = (t) => { $('said').textContent = t; };

/* ---------- the map frame: metres, x to the east, z to the south, y up ---------- */
const LAT_C = 35.0, LNG_C = 33.25, KX = 111320 * Math.cos((LAT_C * Math.PI) / 180), KY = 110574;
const toX = (lng) => (lng - LNG_C) * KX, toZ = (lat) => -(lat - LAT_C) * KY;
const CITY = {   // the same middles as city-buildings.js
  larnaka: { lat: 34.9168, lng: 33.6340, name: ['Larnaka', 'Λάρνακα'] },
  lefkosia: { lat: 35.1710, lng: 33.3620, name: ['Lefkosia', 'Λευκωσία'] },
  limassol: { lat: 34.6760, lng: 33.0425, name: ['Limassol', 'Λεμεσός'] },
  paphos: { lat: 34.7762, lng: 32.4240, name: ['Paphos', 'Πάφος'] },
};
const HALF = 900;
const ISL = window.ISLAND || null;
const SCHOOL = {};
(ISL && ISL.schools || []).forEach((s) => { SCHOOL[s.id] = s; });

/* ---------- renderer, scene, camera ---------- */
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true }); } catch (e) { window.__embedFailed = T('The 3D view could not start in this browser.', 'Η τρισδιάστατη προβολή δεν μπόρεσε να ξεκινήσει σε αυτό το πρόγραμμα περιήγησης.'); throw e; }
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08131f);
const camera = new THREE.PerspectiveCamera(45, 1, 1, 3000000);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x0b1a2c, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.25); sun.position.set(-0.6, 1.4, 0.8); scene.add(sun);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = false;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.autoRotateSpeed = 0.5;

/* ---------- the sea and the island ---------- */
const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200000, 1200000), new THREE.MeshBasicMaterial({ color: 0x0a2740 }));
sea.rotation.x = -Math.PI / 2; sea.position.y = -1300; scene.add(sea);
const island = new THREE.Group(); scene.add(island);
const islandMats = [];
function buildIsland() {
  if (!ISL) return;
  const b = ISL.bbox, k = ISL.k, sx = ISL.sx, H = ISL.H;
  const ll = (x, y) => [b[0] + x / (k * sx), b[1] + (H - y) / sx];   // the inverse of ISLAND.project
  const tones = [0x1b3a5c, 0x1e4166, 0x183654, 0x21456b, 0x1a3858, 0x1d3f63];
  Object.keys(ISL.districts).forEach((name, i) => {
    const d = ISL.districts[name];
    d.split(/(?=M)/).forEach((part) => {
      const nums = part.replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number);
      if (nums.length < 6) return;
      const pts = [];
      for (let j = 0; j + 1 < nums.length; j += 2) { const [lng, lat] = ll(nums[j], nums[j + 1]); pts.push(new THREE.Vector2(toX(lng), -toZ(lat))); }
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 1200, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); geo.translate(0, -1200, 0);
      const mat = new THREE.MeshLambertMaterial({ color: tones[i % tones.length], transparent: true, opacity: 1 });
      islandMats.push(mat);
      island.add(new THREE.Mesh(geo, mat));
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 4, -p.y))), new THREE.LineBasicMaterial({ color: 0x4ccbea, transparent: true, opacity: 0.55 }));
      island.add(line);
    });
  });
}
buildIsland();
// a glowing column at each city, seen from far away
const pins = new THREE.Group(); scene.add(pins);
Object.keys(CITY).forEach((id) => {
  const c = CITY[id], m = new THREE.Mesh(new THREE.CylinderGeometry(1400, 1400, 5000, 24), new THREE.MeshBasicMaterial({ color: 0x4ccbea, transparent: true, opacity: 0.85 }));
  m.position.set(toX(c.lng), 2500, toZ(c.lat)); m.userData.city = id; pins.add(m);
});

/* ---------- labels drawn over the canvas ---------- */
const labels = $('labels'), labs = [];
function addLabel(pos, el, when) { const l = { pos, el, when }; labels.append(el); labs.push(l); return l; }
Object.keys(CITY).forEach((id) => {
  const c = CITY[id];
  addLabel(new THREE.Vector3(toX(c.lng), 6000, toZ(c.lat)), h('button', { class: 'lab', type: 'button', onclick: () => go(id) }, T(c.name[0], c.name[1]), h('small', null, T('Fly to the centre', 'Πέτα στο κέντρο'))), () => view === 'island');
});
let schoolLab = null;
function placeLabels() {
  const w = canvas.clientWidth, hh = canvas.clientHeight, v = new THREE.Vector3();
  labs.forEach((l) => {
    const show = l.when();
    if (show) { v.copy(l.pos).project(camera); if (v.z > 1 || v.z < -1) l.el.hidden = true; else { l.el.hidden = false; l.el.style.left = ((v.x + 1) / 2) * w + 'px'; l.el.style.top = ((1 - v.y) / 2) * hh + 'px'; } } else l.el.hidden = true;
  });
}

/* ---------- the city: one merged mesh of buildings, one of streets ---------- */
const city = new THREE.Group(); scene.add(city);
const bMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const rMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
let cur = null;   // { id, data, bMesh, rMesh, bOwner, rOwner, ranges, origin }
const cache = {};
const ramp = (t) => { t = Math.max(0, Math.min(1, t)); return [0.17 + 0.37 * t, 0.30 + 0.45 * t, 0.46 + 0.50 * t]; };
const GUESS = [0.56, 0.43, 0.82];
const ROADW = { major: 9, minor: 5, walk: 2.6, coast: 5 }, ROADC = { major: [0.30, 0.45, 0.62], minor: [0.22, 0.34, 0.50], walk: [0.26, 0.48, 0.46], coast: [0.30, 0.80, 0.92] }, ROADY = { major: 0.45, minor: 0.35, walk: 0.3, coast: 0.5 };

function geomBuilder() {
  const pos = [], nor = [], col = [], own = [];
  const tri = (a, b, c, n, rgb, o) => {   // keeps every triangle facing along n, so lighting and culling are right
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const t = b; b = c; c = t; }
    pos.push(...a, ...b, ...c); nor.push(...n, ...n, ...n); col.push(...rgb, ...rgb, ...rgb); own.push(o);
  };
  const done = (mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return { mesh: new THREE.Mesh(g, mat), owner: Uint32Array.from(own) };
  };
  return { tri, done, count: () => pos.length / 3 };
}
const area2 = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i += 2) { const j = (i + 2) % n; a += r[i] * r[j + 1] - r[j] * r[i + 1]; } return a / 2; };
function buildCity(d) {
  const B = geomBuilder(), ranges = [];
  d.buildings.forEach((row, i) => {
    const [ht, src, outer, holes] = row, start = B.count(), roof = ramp((ht - 3) / 45), wall = roof.map((v) => v * 0.72);
    const rings = [[outer, false]].concat((holes || []).map((r) => [r, true]));
    rings.forEach(([r, hole]) => {
      const ccw = area2(r) > 0, n = r.length;
      for (let a = 0; a < n; a += 2) {
        const b = (a + 2) % n, dx = r[b] - r[a], dn = r[b + 1] - r[a + 1], len = Math.hypot(dx, dn) || 1;
        const right = [dn / len, 0, dx / len], left = [-dn / len, 0, -dx / len];   // world normals (north maps to -z)
        const nrm = (ccw !== hole) ? right : left;
        const p0 = [r[a], 0, -r[a + 1]], q0 = [r[b], 0, -r[b + 1]], p1 = [r[a], ht, -r[a + 1]], q1 = [r[b], ht, -r[b + 1]];
        B.tri(p0, q0, q1, nrm, wall, i); B.tri(p0, q1, p1, nrm, wall, i);
      }
    });
    const v2 = (r) => { const o = []; for (let a = 0; a < r.length; a += 2) o.push(new THREE.Vector2(r[a], r[a + 1])); return o; };
    const all = v2(outer).concat(...(holes || []).map(v2));
    let faces = [];
    try { faces = THREE.ShapeUtils.triangulateShape(v2(outer), (holes || []).map(v2)); } catch (e) { faces = []; }
    faces.forEach((f) => { const P = f.map((k) => [all[k].x, ht, -all[k].y]); B.tri(P[0], P[1], P[2], [0, 1, 0], roof, i); });
    ranges.push([start, B.count() - start, src, roof, wall]);
  });
  const built = B.done(bMat);
  const R = geomBuilder();
  d.roads.forEach((row, i) => {
    const [cls, line] = row; if (!ROADW[cls]) return;
    const w = ROADW[cls] / 2, y = ROADY[cls], c = ROADC[cls];
    for (let a = 0; a + 3 < line.length; a += 2) {
      const x0 = line[a], n0 = line[a + 1], x1 = line[a + 2], n1 = line[a + 3], len = Math.hypot(x1 - x0, n1 - n0) || 1;
      const px = (-(n1 - n0) / len) * w, pn = ((x1 - x0) / len) * w;
      const A = [x0 + px, y, -(n0 + pn)], Bp = [x1 + px, y, -(n1 + pn)], C = [x1 - px, y, -(n1 - pn)], D = [x0 - px, y, -(n0 - pn)];
      R.tri(A, Bp, C, [0, 1, 0], c, i); R.tri(A, C, D, [0, 1, 0], c, i);
    }
  });
  const roads = R.done(rMat);
  // the box: a thin glowing frame, the edge of the board
  const e = HALF, frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-e, 1, -e), new THREE.Vector3(e, 1, -e), new THREE.Vector3(e, 1, e), new THREE.Vector3(-e, 1, e)]), new THREE.LineBasicMaterial({ color: 0x4ccbea, transparent: true, opacity: 0.8 }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * e + 500, 2 * e + 500), new THREE.MeshLambertMaterial({ color: 0x0f2338, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.05;
  return { bMesh: built.mesh, bOwner: built.owner, rMesh: roads.mesh, rOwner: roads.owner, ranges, frame, ground };
}
function paintGuessed(on) {
  if (!cur) return;
  const col = cur.bMesh.geometry.attributes.color;
  cur.ranges.forEach(([start, n, src, roof, wall]) => {
    if (src !== 'd') return;
    const rr = on ? GUESS : roof, ww = on ? GUESS.map((v) => v * 0.72) : wall;
    for (let k = 0; k < n; k++) { const v = start + k, isRoof = cur.bMesh.geometry.attributes.normal.getY(v) > 0.5, c = isRoof ? rr : ww; col.setXYZ(v, c[0], c[1], c[2]); }
  });
  col.needsUpdate = true;
}

/* ---------- views and the flight between them ---------- */
let view = 'island', fly = null;
const OVERVIEW = { target: new THREE.Vector3(toX(33.2), 0, toZ(35.0)), off: new THREE.Vector3(0, 230000, 190000) };
const overview = () => ({ target: OVERVIEW.target, off: OVERVIEW.off.clone().multiplyScalar(Math.max(1, 1.3 / (camera.aspect || 1))) });   // a narrow screen stands further back to see the whole island
function cityPose(id, top) { const c = CITY[id], t = new THREE.Vector3(toX(c.lng), 0, toZ(c.lat)); return { target: t, off: top ? new THREE.Vector3(0, 2100, 1) : new THREE.Vector3(-360, 1000, 1200) }; }
function flyTo(pose, ms, then) {
  const from = { target: controls.target.clone(), off: camera.position.clone().sub(controls.target) };
  const s0 = new THREE.Spherical().setFromVector3(from.off), s1 = new THREE.Spherical().setFromVector3(pose.off);
  if (s1.theta - s0.theta > Math.PI) s1.theta -= 2 * Math.PI; else if (s0.theta - s1.theta > Math.PI) s1.theta += 2 * Math.PI;
  fly = { t0: performance.now(), ms: REDUCED ? 0 : ms, from, s0, s1, to: pose, then };
  controls.enabled = false;
}
function stepFly(now) {
  if (!fly) return;
  const t = fly.ms ? Math.min(1, (now - fly.t0) / fly.ms) : 1, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const target = fly.from.target.clone().lerp(fly.to.target, Math.min(1, e * 1.25));
  const r = Math.exp(Math.log(fly.s0.radius) + (Math.log(fly.s1.radius) - Math.log(fly.s0.radius)) * e);
  const sp = new THREE.Spherical(r, fly.s0.phi + (fly.s1.phi - fly.s0.phi) * e, fly.s0.theta + (fly.s1.theta - fly.s0.theta) * e);
  controls.target.copy(target); camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sp));
  if (t >= 1) { const f = fly; fly = null; if (f.then) f.then(); controls.enabled = true; }   // the new limits are set before the controls run again
}
function limits() {
  if (view === 'city') { controls.minDistance = 120; controls.maxDistance = 4200; controls.maxPolarAngle = 1.32; }
  else { controls.minDistance = 25000; controls.maxDistance = 900000; controls.maxPolarAngle = 1.2; }
}
controls.addEventListener('change', () => {   // keep the city in view: the middle of the screen stays inside the box
  if (view !== 'city' || !cur || fly) return;
  const o = cur.origin, t = controls.target, m = HALF + 150;
  const cx = Math.max(o.x - m, Math.min(o.x + m, t.x)), cz = Math.max(o.z - m, Math.min(o.z + m, t.z));
  if (cx !== t.x || cz !== t.z) { const dx = cx - t.x, dz = cz - t.z; t.x = cx; t.z = cz; camera.position.x += dx; camera.position.z += dz; }
  t.y = 0;
});

/* ---------- the top bar, the info card, messages ---------- */
const cityBtns = {};
Object.keys(CITY).forEach((id) => { cityBtns[id] = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => go(id) }, T(CITY[id].name[0], CITY[id].name[1])); $('cities').append(cityBtns[id]); });
const crumbCity = h('span');
$('crumb').append(crumbCity);
$('home').addEventListener('click', () => home());
function setBar() {
  Object.keys(cityBtns).forEach((id) => cityBtns[id].setAttribute('aria-pressed', String(cur && view !== 'island' && cur.id === id)));
  crumbCity.textContent = view === 'island' || !cur ? '' : '› ' + T(CITY[cur.id].name[0] + ' centre', 'Κέντρο ' + (cur.id === 'larnaka' ? 'Λάρνακας' : cur.id === 'lefkosia' ? 'Λευκωσίας' : cur.id === 'limassol' ? 'Λεμεσού' : 'Πάφου'));
  $('cam').hidden = view !== 'city';
  $('info').hidden = view !== 'city' || !cur || !cur.data;
  const mock = cur && cur.data && cur.data.mock;
  $('badge').hidden = !mock; $('badge').textContent = T('Demo buildings, not real', 'Δοκιμαστικά κτίρια, όχι πραγματικά');
  body.dataset.view = fly ? 'flying' : view; body.dataset.city = cur && view !== 'island' ? cur.id : '';
}
function msg(kind, text, retry) {
  const m = $('msg');
  if (!kind) { m.hidden = true; m.replaceChildren(); return; }
  m.hidden = false;
  m.replaceChildren(kind === 'load' ? h('div', { class: 'spin', 'aria-hidden': 'true' }) : null, h('div', null, text), retry ? h('button', { type: 'button', onclick: retry }, T('Try again', 'Δοκίμασε ξανά')) : null);
}
function info(d) {
  const s = d.stats, pct = (n) => (s.buildings ? Math.round((n / s.buildings) * 100) : 0);
  const known = s.tagged + s.levels;
  $('info').replaceChildren(
    h('h2', null, T(d.name[0], d.name[1])),
    h('div', { class: 'big' }, h('div', null, h('b', null, nf(s.buildings)), h('span', null, T('buildings', 'κτίρια'))), h('div', null, h('b', null, nf(s.roads)), h('span', null, T('streets and paths', 'δρόμοι και μονοπάτια'))), h('div', null, h('b', null, '1.8 km'), h('span', null, T('box side', 'πλευρά κουτιού')))),
    h('div', { class: 'hbar', role: 'img', 'aria-label': T(pct(known) + '% of buildings have a recorded height or floor count', pct(known) + '% των κτιρίων έχουν καταγεγραμμένο ύψος ή αριθμό ορόφων') },
      h('i', { style: 'width:' + pct(s.tagged) + '%;background:#5EE0A8' }), h('i', { style: 'width:' + pct(s.levels) + '%;background:#4CCBEA' }), h('i', { style: 'width:' + pct(s.guessed) + '%;background:#b58cf0' })),
    h('p', { class: 'note' }, T(pct(s.tagged) + '% height recorded · ' + pct(s.levels) + '% from the number of floors · ' + pct(s.guessed) + '% not recorded, drawn at 9 m.', pct(s.tagged) + '% με καταγεγραμμένο ύψος · ' + pct(s.levels) + '% από τον αριθμό ορόφων · ' + pct(s.guessed) + '% χωρίς καταγραφή, σχεδιασμένα στα 9 μ.')),
    h('p', { class: 'note more' }, T('Drag to move, right-drag or two fingers to turn, scroll or pinch to zoom. Point at a building or a street to read it.', 'Σύρε για μετακίνηση, δεξί σύρσιμο ή δύο δάχτυλα για περιστροφή, ροδέλα ή τσίμπημα για ζουμ. Δείξε ένα κτίριο ή δρόμο για να το διαβάσεις.')),
    d.mock ? h('p', { class: 'note' }, T('Test mode: these blocks are made up.', 'Δοκιμαστική λειτουργία: αυτά τα κτίρια είναι επινοημένα.'))
      : h('p', { class: 'note' }, T('Buildings and streets ', 'Κτίρια και δρόμοι '), h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, '© OpenStreetMap contributors'), T(', fetched ' + new Date(d.at).toLocaleDateString('en-GB') + '. Anyone can add a missing building at openstreetmap.org.', ', ανάκτηση ' + new Date(d.at).toLocaleDateString('el-GR') + '. Όποιος θέλει μπορεί να προσθέσει ένα κτίριο που λείπει στο openstreetmap.org.')));
}

/* ---------- going to a city and back ---------- */
let want = null, poll = 0;
async function get(id) {
  if (cache[id]) return cache[id];
  const r = await fetch('/api/city/' + id, { credentials: 'same-origin' });
  if (r.status === 202) return 'loading';
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !Array.isArray(j.buildings)) throw new Error((j && j.error) || T('The buildings could not be loaded.', 'Τα κτίρια δεν φορτώθηκαν.'));
  cache[id] = j; return j;
}
function show(id, d) {
  if (cur && cur.id !== id) { city.children.forEach((o) => { if (o.geometry) o.geometry.dispose(); }); city.clear(); cur = null; }
  if (!cur) {
    const b = buildCity(d), o = new THREE.Vector3(toX(CITY[id].lng), 0, toZ(CITY[id].lat));
    city.position.copy(o); city.add(b.ground, b.bMesh, b.rMesh, b.frame);
    cur = { id, data: d, origin: o, ...b };
    schoolPin(id);
  }
  cur.bMesh.visible = $('lyB').checked; cur.rMesh.visible = $('lyR').checked; paintGuessed($('lyG').checked);
  body.dataset.buildings = String(d.stats.buildings); meshHook();
  info(d); setBar();
}
function schoolPin(id) {
  if (schoolLab) { schoolLab.el.remove(); labs.splice(labs.indexOf(schoolLab), 1); schoolLab = null; }
  const s = SCHOOL[id]; if (!s) return;
  const lx = toX(s.lng) - toX(CITY[id].lng), lz = toZ(s.lat) - toZ(CITY[id].lat), out = Math.max(Math.abs(lx), Math.abs(lz)) > HALF;
  const k = out ? HALF / Math.max(Math.abs(lx), Math.abs(lz)) : 1, km = Math.hypot(lx, lz) / 1000;
  const kmT = String(Math.round(km * 10) / 10).replace('.', LANG === 'el' ? ',' : '.');
  const text = out ? s.name + ' · ' + T(kmT + ' km from the middle, outside the box', kmT + ' χλμ. από το κέντρο, έξω από το κουτί') : s.name;
  const el = h('div', { class: 'lab school' }, '● ' + text);
  schoolLab = addLabel(new THREE.Vector3(cur.origin.x + lx * k, 60, cur.origin.z + lz * k), el, () => view === 'city' && $('lyS').checked);
}
async function go(id) {
  if (!CITY[id]) return;
  want = id; clearTimeout(poll); $('camTurn').setAttribute('aria-pressed', 'false'); controls.autoRotate = false;
  try { history.replaceState(null, '', location.pathname + '?' + new URLSearchParams({ embed: qp('embed') || '1', lang: LANG, city: id }).toString()); } catch (e) { /* ignore */ }
  said(T('Flying to ' + CITY[id].name[0], 'Πετάμε στη ' + CITY[id].name[1]));
  view = 'flying'; setBar(); labs.forEach((l) => { l.el.hidden = true; });
  const landed = new Promise((ok) => flyTo(cityPose(id), 3200, () => { if (want === id) { view = 'city'; limits(); } ok(); }));
  const load = async () => {
    try {
      const d = await get(id);
      if (want !== id) return null;
      if (d === 'loading') { msg('load', T('Fetching the buildings and streets of this centre from OpenStreetMap. The first time takes up to a minute.', 'Φέρνουμε τα κτίρια και τους δρόμους αυτού του κέντρου από το OpenStreetMap. Την πρώτη φορά παίρνει έως ένα λεπτό.')); await new Promise((r) => { poll = setTimeout(r, 4000); }); return want === id ? load() : null; }
      return d;
    } catch (e) { if (want === id) msg('error', e.message, () => { msg(); go(id); }); return null; }
  };
  const [d] = await Promise.all([load(), landed]);
  if (want !== id) return;
  view = 'city'; limits(); setBar();
  if (d) { msg(); show(id, d); said(T(CITY[id].name[0] + ' centre: ' + nf(d.stats.buildings) + ' buildings.', 'Κέντρο ' + CITY[id].name[1] + ': ' + nf(d.stats.buildings) + ' κτίρια.')); }
}
function home() {
  want = null; clearTimeout(poll); msg(); controls.autoRotate = false;
  try { history.replaceState(null, '', location.pathname + '?' + new URLSearchParams({ embed: qp('embed') || '1', lang: LANG }).toString()); } catch (e) { /* ignore */ }
  view = 'flying'; setBar();
  flyTo(overview(), 2600, () => { view = 'island'; limits(); setBar(); });
  said(T('Back to the whole island.', 'Πίσω σε όλο το νησί.'));
}

/* ---------- layers and camera buttons ---------- */
const meshHook = () => { body.dataset.meshes = cur ? (cur.bMesh.visible ? 'b' : '') + (cur.rMesh.visible ? 'r' : '') : ''; };
$('lyB').addEventListener('change', (e) => { if (cur) cur.bMesh.visible = e.target.checked; meshHook(); });
$('lyR').addEventListener('change', (e) => { if (cur) cur.rMesh.visible = e.target.checked; meshHook(); });
$('lyG').addEventListener('change', (e) => paintGuessed(e.target.checked));
$('camTop').addEventListener('click', () => { if (cur && view === 'city') flyTo(cityPose(cur.id, true), 1200, () => { limits(); setBar(); }); });
$('camTilt').addEventListener('click', () => { if (cur && view === 'city') flyTo(cityPose(cur.id), 1200, () => { limits(); setBar(); }); });
$('camTurn').addEventListener('click', (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); controls.autoRotate = on && !REDUCED; });
if (window.matchMedia && matchMedia('(max-width: 760px)').matches) { $('layers').classList.add('shut'); $('layers').querySelector('h2').addEventListener('click', () => $('layers').classList.toggle('shut')); }

/* ---------- pointing at a building or a street ---------- */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), tip = $('tip');
let hoverAt = null;
canvas.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; hoverAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerleave', () => { hoverAt = null; tip.style.display = 'none'; });
canvas.addEventListener('click', (e) => {   // on the island, a click on a city column flies there
  if (view !== 'island') return;
  mouse.set((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(pins.children)[0]; if (hit) go(hit.object.userData.city);
});
const CLS = { major: ['Main road', 'Κεντρικός δρόμος'], minor: ['Local street', 'Τοπικός δρόμος'], walk: ['Pedestrian street or path', 'Πεζόδρομος ή μονοπάτι'], coast: ['Coastline', 'Ακτογραμμή'] };
function hover() {
  if (!hoverAt || view !== 'city' || !cur || fly) { tip.style.display = 'none'; return; }
  mouse.set((hoverAt[0] / canvas.clientWidth) * 2 - 1, -(hoverAt[1] / canvas.clientHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const objs = [cur.bMesh.visible ? cur.bMesh : null, cur.rMesh.visible ? cur.rMesh : null].filter(Boolean);
  const hit = ray.intersectObjects(objs)[0];
  if (!hit) { tip.style.display = 'none'; return; }
  let head, line;
  if (hit.object === cur.bMesh) {
    const row = cur.data.buildings[cur.bOwner[hit.faceIndex]], ht = row[0];
    head = T('Building', 'Κτίριο');
    line = cur.data.mock ? T('Demo block, ' + ht + ' m', 'Δοκιμαστικό κτίριο, ' + ht + ' μ.') : row[1] === 't' ? T('Height ' + ht + ' m, recorded in OpenStreetMap', 'Ύψος ' + ht + ' μ., καταγεγραμμένο στο OpenStreetMap') : row[1] === 'l' ? T('About ' + ht + ' m, from its number of floors', 'Περίπου ' + ht + ' μ., από τον αριθμό ορόφων') : T('Height not recorded, drawn at ' + ht + ' m', 'Το ύψος δεν είναι καταγεγραμμένο, σχεδιασμένο στα ' + ht + ' μ.');
  } else {
    const row = cur.data.roads[cur.rOwner[hit.faceIndex]];
    head = row[0] === 'coast' ? T('Coastline', 'Ακτογραμμή') : (LANG === 'el' ? row[3] : row[2]) || T('Unnamed', 'Χωρίς όνομα'); line = T(CLS[row[0]][0], CLS[row[0]][1]);
  }
  tip.replaceChildren(h('b', null, head), line);
  tip.style.display = 'block'; tip.style.left = Math.min(hoverAt[0] + 14, innerWidth - 270) + 'px'; tip.style.top = (hoverAt[1] + 14) + 'px';
}

/* ---------- the loop ---------- */
function resize() { const w = canvas.clientWidth || innerWidth, hh = canvas.clientHeight || innerHeight; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  stepFly(now);
  if (!fly) controls.update();
  // the island fades as the camera comes down to a city, the city columns hide close up
  const alt = camera.position.y, a = Math.max(0, Math.min(1, (alt - 2500) / 9000));
  islandMats.forEach((m) => { m.opacity = a; });
  island.visible = alt > 2600;
  pins.visible = alt > 9000;
  city.visible = !!cur && alt < 60000;
  if (now - last > 60) { last = now; hover(); }
  renderer.render(scene, camera); placeLabels();
  if (!window.__embedReady) { window.__embedReady = true; body.dataset.ready = '1'; }
}
resize();
const ov0 = overview(); controls.target.copy(ov0.target); camera.position.copy(ov0.target).add(ov0.off); limits(); setBar();
requestAnimationFrame(frame);
const start = qp('city');
if (CITY[start]) setTimeout(() => go(start), 400);
