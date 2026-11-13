/*
  Data layers, the engine of the "Data core" view (used by pages/layers-cine.js): SC.layersLive.cineEngine(host) -> Promise.
  The scene comes from the owner's Nemesis project (cinema-gl.js) and is drawn with three.js r128 from /vendor/three-r128/.
  The orb is a real Aizawa strange attractor, integrated live for every particle (a .95 b .7 c .6 d 3.5 e .25 f .1): the dense
  inner tube is tinted gold, the outer shell blue. Under it sits a stylised relief of Cyprus. The map and its heights are
  decoration: no figure is ever placed on a place, and no vehicle position is used. A 2D overlay draws the flow lines between
  the panels and the orb, the two meters and the name plate. Every number it shows comes from the model given to setModel().
*/
(function () {
  'use strict';
  const T = SC.t;
  const COAST = [[32.27, 35.10], [32.36, 35.04], [32.43, 35.05], [32.55, 35.16], [32.68, 35.19], [32.85, 35.16], [32.93, 35.20], [32.98, 35.27], [32.92, 35.40],
  [33.05, 35.36], [33.20, 35.36], [33.32, 35.34], [33.55, 35.35], [33.80, 35.40], [34.05, 35.46], [34.30, 35.57], [34.58, 35.69], [34.42, 35.58], [34.18, 35.45],
  [33.98, 35.33], [33.93, 35.20], [33.94, 35.12], [33.99, 35.04], [34.08, 34.97], [34.00, 34.98], [33.80, 34.97], [33.64, 34.92], [33.62, 34.82], [33.42, 34.73],
  [33.22, 34.70], [33.05, 34.68], [32.98, 34.63], [32.95, 34.57], [32.86, 34.66], [32.70, 34.65], [32.55, 34.70], [32.42, 34.76], [32.34, 34.88], [32.30, 35.00]];
  // speed factor from age in days: fresh = 1, old sources crawl but never stop
  const speed = (ageDays) => 1 / (1 + Math.min(ageDays == null ? 40 : ageDays, 40) / 22);
  const CITY = [['Paphos', 'Πάφος', 32.42, 34.77], ['Limassol', 'Λεμεσός', 33.03, 34.68], ['Larnaka', 'Λάρνακα', 33.63, 34.92], ['Lefkosia', 'Λευκωσία', 33.38, 35.17]];
const MONO = 'ui-monospace,Menlo,Consolas,monospace';
const nf = (n) => Number(n).toLocaleString(SC.lang === 'el' ? 'el-GR' : 'en-GB');
const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

let loading = null;
function loadThree() {
  const add = (src, have) => (have() ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/vendor/three-r128/' + src; s.onload = ok; s.onerror = () => no(new Error('load ' + src)); document.head.appendChild(s); }));
  const W = window;
  if (!loading) loading = add('three.min.js', () => !!W.THREE)
    .then(() => add('CopyShader.js', () => !!W.THREE.CopyShader)).then(() => add('EffectComposer.js', () => !!W.THREE.EffectComposer))
    .then(() => add('RenderPass.js', () => !!W.THREE.RenderPass)).then(() => add('ShaderPass.js', () => !!W.THREE.ShaderPass))
    .then(() => add('LuminosityHighPassShader.js', () => !!W.THREE.LuminosityHighPassShader)).then(() => add('UnrealBloomPass.js', () => !!W.THREE.UnrealBloomPass))
    .then(() => W.THREE).catch((e) => { loading = null; throw e; });
  return loading;
}

const inPoly = (x, y) => { let c = false; for (let i = 0, j = COAST.length - 1; i < COAST.length; j = i++) { const [a, b] = COAST[i], [p, q] = COAST[j]; if ((b > y) !== (q > y) && x < (p - a) * (y - b) / (q - b) + a) c = !c; } return c; };
// stylised relief: one broad massif in the south-west (Troodos), a thin ridge along the north coast (Kyrenia range)
const relief = (lo, la) => {
  const tr = .62 * Math.exp(-(((lo - 32.86) ** 2) / (2 * .2 ** 2) + ((la - 34.93) ** 2) / (2 * .12 ** 2)));
  const along = Math.max(0, Math.min(1, (lo - 32.95) / .25)) * Math.max(0, Math.min(1, (34.15 - lo) / .3));
  const ky = .24 * along * Math.exp(-((la - (35.3 + (lo - 33.5) * .09)) ** 2) / (2 * .03 ** 2));
  return tr + ky;
};
function sprite(rgb) { const s = document.createElement('canvas'); s.width = s.height = 64; const g = s.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.18, `rgba(${rgb},.95)`); r.addColorStop(.5, `rgba(${rgb},.22)`); r.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return s; }

const COLOR_GLSL = `
  vec3 orbColor(vec3 p, float seed, float gold, out float tube, out float base) {
    float rho = length(p.xz);
    tube = smoothstep(0.8, 0.22, rho) * smoothstep(-1.25, -0.7, p.y);
    base = smoothstep(-0.55, -1.2, p.y);
    vec3 blue = mix(vec3(0.16, 0.42, 1.0), vec3(0.7, 0.88, 1.0), seed * seed);
    vec3 au = mix(vec3(1.0, 0.62, 0.14), vec3(1.0, 0.93, 0.62), seed);
    vec3 c = mix(blue, au, tube * gold);
    return mix(c, vec3(0.25, 0.88, 1.0), base * 0.75);
  }`;

async function mountEngine(host) {
  const THREE = await loadThree();
  const glc = document.createElement('canvas'); glc.className = 'cn-gl'; glc.setAttribute('aria-hidden', 'true');
  const fxc = document.createElement('canvas'); fxc.className = 'cn-fx'; fxc.setAttribute('aria-hidden', 'true');
  host.append(glc, fxc);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: false, alpha: false, powerPreference: 'high-performance' }); }
  catch (e) { glc.remove(); fxc.remove(); throw e; }
  const fx = fxc.getContext('2d');
  const small = () => host.clientWidth < 620;
  const lowEnd = small() || matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  let N = lowEnd ? 26000 : 64000;
  renderer.setClearColor(0x03060a, 1);
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x03060a, 0.028);
  const cam = new THREE.PerspectiveCamera(34, 2, 0.1, 200);
  let seed = 20261113; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const add = (o) => { scene.add(o); return o; };
  const pts = (geo, vs, fs, uni) => new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: vs, fragmentShader: fs, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
  const U = { uTime: { value: 0 }, uPx: { value: 500 }, uGold: { value: 1 }, uPulse: { value: 0 }, uSweep: { value: 0 }, uEnergy: { value: 1 } };
  const DOT_FS = `varying vec3 vCol; varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .05, d); gl_FragColor = vec4(vCol * a * vA, a * vA); }`;

  // ---------- the attractor ----------
  const A = .95, B = .7, C = .6, D = 3.5, E = .25, F = .1, S = 1.25, Z0 = .72;
  const P = new Float32Array(N * 3), L = new Float32Array(N * 6), sd = new Float32Array(N), sd2 = new Float32Array(N * 2), en = new Float32Array(N * 2);
  const spawn = (i) => { const j = i * 3; P[j] = (rnd() - .5) * 2.2; P[j + 1] = (rnd() - .5) * 2.2; P[j + 2] = rnd() * 1.6; };
  for (let i = 0; i < N; i++) { spawn(i); sd[i] = rnd(); sd2[i * 2] = sd2[i * 2 + 1] = sd[i]; en[i * 2] = 0; en[i * 2 + 1] = 1; }
  function sim(dt, lag) {
    for (let i = 0; i < N; i++) {
      const j = i * 3; let x = P[j], y = P[j + 1], z = P[j + 2];
      const dx = (z - B) * x - D * y, dy = D * x + (z - B) * y, dz = C + A * z - z * z * z / 3 - (x * x + y * y) * (1 + E * z) + F * z * x * x * x;
      x += dx * dt; y += dy * dt; z += dz * dt;
      const k = i * 6;
      if (!(x * x + y * y + z * z < 20)) { spawn(i); x = P[j]; y = P[j + 1]; z = P[j + 2]; L[k] = x * S; L[k + 1] = (z - Z0) * S; L[k + 2] = y * S; } else { P[j] = x; P[j + 1] = y; P[j + 2] = z; }
      const hx = x * S, hy = (z - Z0) * S, hz = y * S;
      L[k] += (hx - L[k]) * lag; L[k + 1] += (hy - L[k + 1]) * lag; L[k + 2] += (hz - L[k + 2]) * lag; L[k + 3] = hx; L[k + 4] = hy; L[k + 5] = hz;
    }
  }
  for (let w = 0; w < 260; w++) sim(.01, 1);   // settle onto the attractor before the first frame
  const lineAttr = new THREE.BufferAttribute(L, 3); lineAttr.setUsage(THREE.DynamicDrawUsage);
  const gLine = new THREE.BufferGeometry(); gLine.setAttribute('position', lineAttr); gLine.setAttribute('aSeed', new THREE.BufferAttribute(sd2, 1)); gLine.setAttribute('aEnd', new THREE.BufferAttribute(en, 1));
  const inter = new THREE.InterleavedBuffer(L, 6); inter.setUsage(THREE.DynamicDrawUsage);
  const gHead = new THREE.BufferGeometry(); gHead.setAttribute('position', new THREE.InterleavedBufferAttribute(inter, 3, 3)); gHead.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  gLine.boundingSphere = gHead.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  const orb = new THREE.Group(); add(orb);
  const heads = pts(gHead, `uniform float uPx, uGold, uPulse, uEnergy; attribute float aSeed; varying vec3 vCol; varying float vA; ${COLOR_GLSL}
    void main(){ float tube, base; vCol = orbColor(position, aSeed, uGold, tube, base); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = max(1.0, (0.013 + 0.014 * aSeed + 0.014 * tube * uGold) * uPx / -mv.z);
      vA = (0.26 + 0.5 * tube * uGold + 0.18 * base) * (0.75 + 0.5 * uEnergy) * (1.0 + uPulse * (0.8 + 1.2 * tube)); }`, DOT_FS, U);
  orb.add(heads);
  const trails = new THREE.LineSegments(gLine, new THREE.ShaderMaterial({ uniforms: U, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
    vertexShader: `uniform float uGold, uPulse, uEnergy; attribute float aSeed, aEnd; varying vec3 vCol; varying float vA; ${COLOR_GLSL}
      void main(){ float tube, base; vCol = orbColor(position, aSeed, uGold, tube, base); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vA = aEnd * (0.08 + 0.22 * tube * uGold + 0.07 * base) * (0.7 + 0.5 * uEnergy) * (1.0 + uPulse * 1.0); }`,
    fragmentShader: `varying vec3 vCol; varying float vA; void main(){ gl_FragColor = vec4(vCol * vA, vA); }` }));
  orb.add(trails);

  // ---------- shell, rings, constellation ----------
  const nS = lowEnd ? 2600 : 5200, sp = new Float32Array(nS * 3), ss = new Float32Array(nS), R0 = 2.42;
  for (let i = 0; i < nS; i++) { const y = 1 - 2 * (i + .5) / nS, r = Math.sqrt(1 - y * y), th = i * 2.399963; sp[i * 3] = Math.cos(th) * r * R0; sp[i * 3 + 1] = y * R0 * .92; sp[i * 3 + 2] = Math.sin(th) * r * R0; ss[i] = rnd(); }
  const gS = new THREE.BufferGeometry(); gS.setAttribute('position', new THREE.BufferAttribute(sp, 3)); gS.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
  const shell = pts(gS, `uniform float uPx, uTime, uPulse; attribute float aSeed; varying vec3 vCol; varying float vA;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float tw = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 2.5) + aSeed * 40.0);
      gl_PointSize = max(1.0, (0.012 + 0.03 * step(0.93, aSeed)) * uPx / -mv.z); vCol = mix(vec3(0.25, 0.55, 1.0), vec3(0.85, 0.95, 1.0), step(0.8, aSeed));
      vA = (0.25 + 0.6 * tw) * (0.55 + 0.45 * smoothstep(-1.0, 1.5, -mv.z - length(mv.xyz) + 1.0)) * (1.0 + uPulse); }`, DOT_FS, U);
  const shellG = new THREE.Group(); shellG.add(shell); add(shellG);
  const ring = (rad, tilt, col, op, seg = 180) => { const a = new Float32Array(seg * 3); for (let i = 0; i < seg; i++) { const u = i / seg * Math.PI * 2; a[i * 3] = Math.cos(u) * rad; a[i * 3 + 2] = Math.sin(u) * rad; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const l = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthTest: false, fog: false })); l.rotation.set(tilt[0], 0, tilt[1]); return l; };
  shellG.add(ring(R0, [0, 0], 0x3aa0ff, .35), ring(R0, [Math.PI / 2, 0], 0x2a70c0, .16), ring(R0, [Math.PI / 2, Math.PI / 2], 0x2a70c0, .16), ring(R0 * .995, [.5, .3], 0x2a70c0, .12));
  { const nC = 70, a = new Float32Array(nC * 6); for (let i = 0; i < nC; i++) { const p = Math.floor(rnd() * nS), q = (p + 1 + Math.floor(rnd() * 34)) % nS; for (let k = 0; k < 3; k++) { a[i * 6 + k] = sp[p * 3 + k] * (.55 + rnd() * .4); a[i * 6 + 3 + k] = sp[q * 3 + k] * (.55 + rnd() * .4); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); shellG.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x7fb8ff, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthTest: false, fog: false }))); }
  // segmented outer ring with ticks, turning against the orb (the reel's dashed bezel)
  const bezel = new THREE.Group(); add(bezel);
  { const seg = 96, a = []; for (let i = 0; i < seg; i++) { if (i % 4 === 3) continue; const u0 = i / seg * Math.PI * 2, u1 = (i + .7) / seg * Math.PI * 2, r = R0 * 1.16; a.push(Math.cos(u0) * r, 0, Math.sin(u0) * r, Math.cos(u1) * r, 0, Math.sin(u1) * r); }
    for (let i = 0; i < 144; i++) { const u = i / 144 * Math.PI * 2, r0 = R0 * 1.22, r1 = R0 * (i % 6 ? 1.245 : 1.29); a.push(Math.cos(u) * r0, 0, Math.sin(u) * r0, Math.cos(u) * r1, 0, Math.sin(u) * r1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a), 3)); bezel.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x45d6f0, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthTest: false, fog: false }))); bezel.position.y = -1.62; }

  // ---------- base swirl and rising column ----------
  const nD = lowEnd ? 3000 : 7000, dr = new Float32Array(nD), dp = new Float32Array(nD), dz = new Float32Array(nD * 3), dsd = new Float32Array(nD);
  for (let i = 0; i < nD; i++) { const r = .25 + Math.pow(rnd(), .7) * 2.5; dr[i] = r; dp[i] = (i % 4) * 1.5708 + r * 2.3 + (rnd() - .5) * (.25 + .3 * r); dsd[i] = rnd(); }
  const gD = new THREE.BufferGeometry(); gD.setAttribute('position', new THREE.BufferAttribute(dz, 3)); gD.setAttribute('aR', new THREE.BufferAttribute(dr, 1)); gD.setAttribute('aPh', new THREE.BufferAttribute(dp, 1)); gD.setAttribute('aSeed', new THREE.BufferAttribute(dsd, 1)); gD.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
  add(pts(gD, `uniform float uPx, uTime, uEnergy; attribute float aR, aPh, aSeed; varying vec3 vCol; varying float vA;
    void main(){ float a = aPh + uTime * (0.55 / (0.35 + aR)) * (0.6 + 0.6 * uEnergy); vec3 p = vec3(cos(a) * aR, -1.62 + 0.05 * sin(aR * 6.0 + uTime) - 0.1 * aSeed, sin(a) * aR); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = max(1.0, (0.012 + 0.02 * aSeed) * uPx / -mv.z); vCol = mix(vec3(0.15, 0.75, 1.0), vec3(0.75, 0.97, 1.0), aSeed); vA = 0.55 * smoothstep(2.8, 1.2, aR) + 0.12; }`, DOT_FS, U));
  const nC = lowEnd ? 500 : 1100, cs = new Float32Array(nC), ca = new Float32Array(nC), cr = new Float32Array(nC);
  for (let i = 0; i < nC; i++) { cs[i] = rnd(); ca[i] = rnd() * 6.283; cr[i] = Math.pow(rnd(), .6); }
  const gC = new THREE.BufferGeometry(); gC.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nC * 3), 3)); gC.setAttribute('aSeed', new THREE.BufferAttribute(cs, 1)); gC.setAttribute('aAng', new THREE.BufferAttribute(ca, 1)); gC.setAttribute('aRad', new THREE.BufferAttribute(cr, 1)); gC.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
  add(pts(gC, `uniform float uPx, uTime, uEnergy; attribute float aSeed, aAng, aRad; varying vec3 vCol; varying float vA;
    void main(){ float u = fract(aSeed + uTime * (0.05 + 0.07 * aSeed) * (0.5 + 0.7 * uEnergy)); float y = mix(-3.0, -1.55, u); float r = aRad * mix(1.5, 0.12, pow(u, 0.6)); float a = aAng + u * 5.0;
      vec4 mv = modelViewMatrix * vec4(cos(a) * r, y, sin(a) * r, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, (0.014 + 0.02 * aSeed) * uPx / -mv.z);
      vCol = mix(vec3(0.2, 0.8, 1.0), vec3(1.0, 0.8, 0.35), smoothstep(0.55, 1.0, u)); vA = sin(u * 3.1416) * 0.7; }`, DOT_FS, U));

  // ---------- Cyprus (decoration) ----------
  const map = new THREE.Group(); map.position.y = -3.05; add(map);
  let KX = 3.6; const mx = (lo) => (lo - 33.43) * KX, mz = (la) => -(la - 35.14) * KX * 1.22, mh = (lo, la) => relief(lo, la) * KX * .42;
  { const pos = [], hh = [], lines = [], dLo = .016, dLa = .0125;
    for (let la = 34.56; la < 35.72; la += dLa) { let prev = null; for (let lo = 32.26; lo < 34.6; lo += dLo) { if (!inPoly(lo, la)) { prev = null; continue; } const h = mh(lo, la), v = [mx(lo), h, mz(la)]; pos.push(...v); hh.push(h); if (prev) lines.push(...prev, ...v); prev = v; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    const MAP_VS = `uniform float uPx, uSweep, uTime; varying vec3 vCol; varying float vA; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vec4 mv = viewMatrix * wp; gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, 0.034 * uPx / -mv.z);
      float d = length(position.xz - vec2(-0.18, -0.04)); float band = exp(-pow((d - uSweep) * 1.6, 2.0)); float hgt = clamp(position.y / 0.9, 0.0, 1.0);
      vCol = mix(vec3(0.07, 0.36, 0.62), vec3(0.55, 0.95, 1.0), clamp(band + hgt * 0.8, 0.0, 1.0)); vA = (1.1 + 0.9 * band + 0.7 * hgt) * exp(-0.012 * dot(mv.xyz, mv.xyz) * 0.25); }`;
    map.add(pts(g, MAP_VS, DOT_FS, U));
    const gl2 = new THREE.BufferGeometry(); gl2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lines), 3));
    map.add(new THREE.LineSegments(gl2, new THREE.ShaderMaterial({ uniforms: U, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, vertexShader: MAP_VS.replace('gl_PointSize = max(1.5, 0.034 * uPx / -mv.z);', '').replace('vA = (1.1', 'vA = 0.4 * (1.1'), fragmentShader: `varying vec3 vCol; varying float vA; void main(){ gl_FragColor = vec4(vCol * vA, vA); }` })));
    const coast = (y, col, op) => { const a = new Float32Array(COAST.length * 3); COAST.forEach((c, i) => { a[i * 3] = mx(c[0]); a[i * 3 + 1] = y; a[i * 3 + 2] = mz(c[1]); }); const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(a, 3)); return new THREE.LineLoop(cg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthTest: false, fog: false })); };
    map.add(coast(0, 0x5fdcff, .95), coast(-.09, 0x1f7fb5, .5), coast(-.2, 0x124a70, .35));
    const grid = new THREE.GridHelper(60, 90, 0x0d3550, 0x092234); grid.position.y = -.22; grid.material.transparent = true; grid.material.opacity = .55; map.add(grid);
    const b = []; CITY.forEach((c) => { const x = mx(c[2]), z = mz(c[3]), h = mh(c[2], c[3]); b.push(x, h, z, x, h + 1.15, z); });
    const gb = new THREE.BufferGeometry(); gb.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b), 3)); gb.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(CITY.flatMap(() => [1, 0])), 1));
    map.add(new THREE.LineSegments(gb, new THREE.ShaderMaterial({ uniforms: U, blending: THREE.AdditiveBlending, depthTest: false, transparent: true, vertexShader: `attribute float aEnd; uniform float uTime; varying float vA; void main(){ vA = aEnd * (0.65 + 0.35 * sin(uTime * 2.0 + position.x * 3.0)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(0.5, 0.95, 1.0) * vA, vA); }` })));
    const gp = new THREE.BufferGeometry(); gp.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CITY.flatMap((c) => [mx(c[2]), mh(c[2], c[3]), mz(c[3])])), 3));
    map.add(pts(gp, `uniform float uPx, uTime; varying vec3 vCol; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 0.085 * uPx / -mv.z; vCol = vec3(0.6, 0.97, 1.0); vA = 0.75 + 0.25 * sin(uTime * 2.0 + position.x * 3.0); }`, DOT_FS, U)); }
  // far dust
  { const n = 1400, a = new Float32Array(n * 3), s2 = new Float32Array(n); for (let i = 0; i < n; i++) { a[i * 3] = (rnd() - .5) * 46; a[i * 3 + 1] = (rnd() - .35) * 20; a[i * 3 + 2] = (rnd() - .5) * 46; s2[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(s2, 1));
    add(pts(g, `uniform float uPx, uTime; attribute float aSeed; varying vec3 vCol; varying float vA; void main(){ vec3 p = position; p.y += sin(uTime * 0.2 + aSeed * 30.0) * 0.4; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, (0.02 + 0.05 * aSeed) * uPx / -mv.z); vCol = vec3(0.45, 0.7, 1.0); vA = 0.22 * (0.4 + 0.6 * sin(uTime + aSeed * 50.0)); }`, DOT_FS, U)); }

  // ---------- post ----------
  const composer = new THREE.EffectComposer(renderer); composer.addPass(new THREE.RenderPass(scene, cam));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), .8, .6, .16); composer.addPass(bloom);
  const grade = new THREE.ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAb: { value: .9 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uAb; varying vec2 vUv; float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec2 d = vUv - .5; float r2 = dot(d, d); vec2 o = d * r2 * 0.012 * uAb; vec3 c = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
        c *= 1.0 - r2 * 1.25; c = mix(c, c * vec3(0.9, 1.02, 1.12), 0.6); c += (rnd(vUv * 911.0 + fract(uTime) * 7.0) - .5) * 0.04; c += vec3(0.0, 0.012, 0.022) * (1.0 - r2 * 2.0);
        gl_FragColor = vec4(max(c, 0.0), 1.0); }` });
  composer.addPass(grade);

  // ---------- state ----------
  const SP = { b: sprite('70,150,255'), c: sprite('63,210,234'), g: sprite('110,255,130'), y: sprite('255,213,74'), w: sprite('225,240,255') };
  let strandsIn = [], sum7 = 0, totalIn = 0, tags = [], rays = [], lastBeat = -1, kickV = 0, riserBox = null; const meter = { inV: 0, inT: 0, outU: 0 };
  let W = 0, H = 0, dprFx = 1, model = null, IN = [], OUT = [], flows = { i: [], o: [] }, comets = [], rings = [], last = 0, energy = 1, slow = 0, frames = 0, trailsOn = true, dead = false;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (e) => { const r = host.getBoundingClientRect(); ptr.tx = ((e.clientX - r.left) / r.width - .5) * 2; ptr.ty = ((e.clientY - r.top) / r.height - .5) * 2; };
  host.addEventListener('pointermove', onMove);
  function resize() {
    W = Math.max(280, host.clientWidth); H = Math.max(200, host.clientHeight); const pr = Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 2);
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false); composer.setPixelRatio && composer.setPixelRatio(pr); composer.setSize(W, H); bloom.resolution.set(W * pr / 2, H * pr / 2);
    cam.aspect = W / H; cam.updateProjectionMatrix(); U.uPx.value = H * pr / (2 * Math.tan(cam.fov * Math.PI / 360));
    dprFx = Math.min(window.devicePixelRatio || 1, 1.5); fxc.width = W * dprFx; fxc.height = H * dprFx; fx.setTransform(dprFx, 0, 0, dprFx, 0, 0);
  }
  function setModel(m) {
    model = m; const ages = m.sources.map((s) => speed(s.age)); energy = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : .6;
    U.uGold.value = m.gold == null ? .35 : Math.max(.35, Math.min(1.25, m.gold));
    const mxT = Math.max(...m.sources.map((s) => s.total), 1), mxA = Math.max(...m.sources.filter((s) => s.kind === 'agent').map((s) => s.total), 1);
    flows.i = m.sources.map((s, i) => { const k = s.kind === 'agent' ? (s.ok ? 3 + Math.round(9 * Math.sqrt(s.total / mxA)) : 1) : 4 + Math.round(13 * Math.sqrt(s.total / mxT)), v = s.kind === 'agent' && !s.ok ? .25 : speed(s.age); return Array.from({ length: k }, () => ({ p: rnd(), v: (.07 + rnd() * .06) * v, st: Math.floor(rnd() * 5) - 2 })); });
    strandsIn = m.sources.map((s) => 1 + Math.round(2 * Math.sqrt(s.total / mxT)));
    sum7 = m.sources.reduce((a, s) => a + s.total, 0); totalIn = m.totals.readings;
    flows.o = m.outputs.map(() => Array.from({ length: 7 }, () => ({ p: rnd(), v: .07 + rnd() * .05, st: Math.floor(rnd() * 5) - 2 })));
  }
  const v3 = new THREE.Vector3();
  const toScreen = (x, y, z) => { v3.set(x, y, z).project(cam); return [(v3.x * .5 + .5) * W, (-v3.y * .5 + .5) * H]; };
  const BEAT = [[-.45, .62, 1.18, -1.15], [.12, .3, .86, -.35], [.5, .5, 1.1, -.95]];
  const mix = (a, b, u) => a + (b - a) * u, ease = (u) => u * u * (3 - 2 * u);
  function event(ev) {
    comets.push({ src: ev && ev.src >= 0 ? ev.src : -1, route: ev && ev.route >= 0 ? ev.route : -1, p: 0 });
  }
  let sweepT = 0;
  const bz = (a, b, u, vert) => { const w = 1 - u, k0 = w * w * w, k1 = 3 * w * w * u, k2 = 3 * w * u * u, k3 = u * u * u; return vert ? [k0 * a[0] + k1 * a[0] + k2 * b[0] + k3 * b[0], k0 * a[1] + (k1 + k2) * (a[1] + b[1]) / 2 + k3 * b[1]] : [k0 * a[0] + (k1 + k2) * (a[0] + b[0]) / 2 + k3 * b[0], k0 * a[1] + k1 * a[1] + k2 * b[1] + k3 * b[1]]; };
  function curve(a, b, vert) { fx.beginPath(); fx.moveTo(a[0], a[1]); if (vert) fx.bezierCurveTo(a[0], (a[1] + b[1]) / 2, b[0], (a[1] + b[1]) / 2, b[0], b[1]); else fx.bezierCurveTo((a[0] + b[0]) / 2, a[1], (a[0] + b[0]) / 2, b[1], b[0], b[1]); fx.stroke(); }

  function render(t, st) {
    if (dead) return; const raw = t - last, dt = Math.min(.05, Math.max(.001, raw)); last = t; frames++;
    const still = !!st.still, beat = st.beat || 0, bp = st.progress || 0, nar = W < 620, eBeat = beat === 1 ? .55 + .45 * Math.sin(bp * Math.PI) : .25;
    U.uTime.value = t; U.uEnergy.value = energy * (.8 + eBeat); U.uPulse.value *= Math.pow(.02, dt); grade.uniforms.uTime.value = t;
    sweepT += dt; U.uSweep.value = (sweepT * 1.5) % 9;
    if (!still) sim(.0085 * (.55 + .75 * energy) * (beat === 1 ? 1.25 : 1), trailsOn ? .16 : 1);
    lineAttr.needsUpdate = true; inter.needsUpdate = true; trails.visible = trailsOn;
    shellG.rotation.y = t * .05; bezel.rotation.y = -t * .12;
    // camera: three beats, blended over the first third of each
    const prev = BEAT[(beat + 2) % 3], cur = BEAT[beat], u = ease(Math.min(1, bp / .34)), az = mix(prev[0], cur[0], u) + Math.sin(t * .11) * .1 + (ptr.x += (ptr.tx - ptr.x) * .04) * .12, el = mix(prev[1], cur[1], u) + Math.sin(t * .07) * .03 - (ptr.y += (ptr.ty - ptr.y) * .04) * .05;
    const frac = nar ? .5 : .285, dist = (2 * R0) / (frac * 2 * Math.tan(cam.fov * Math.PI / 360) * cam.aspect) * mix(prev[2], cur[2], u) * (1 - .05 * kickV), ly = mix(prev[3], cur[3], u) * (nar ? .6 : 1);
    map.scale.setScalar(nar ? .7 : 1);
    cam.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist + ly, Math.cos(az) * Math.cos(el) * dist); cam.lookAt(0, ly, 0); cam.updateMatrixWorld();
    composer.render();
    // ---- overlay ----
    fx.clearRect(0, 0, W, H); const [cx, cy] = toScreen(0, 0, 0), top = toScreen(0, R0, 0), Rs = Math.abs(top[1] - cy) * 1.02, an = st.anchors || { inputs: [], outputs: [] };
    IN = an.inputs; OUT = an.outputs;
    const group = (list) => { if (!list.length) return null; const ax = list.reduce((s, p) => s + p.x, 0) / list.length - cx, ay = list.reduce((s, p) => s + p.y, 0) / list.length - cy, vert = Math.abs(ay) > Math.abs(ax), base = Math.atan2(ay, ax);
      return { vert, ends: list.map((p, i) => { const off = (i - (list.length - 1) / 2) * (vert ? .2 : .19), a = base + (vert ? (ay < 0 ? off : -off) : (ax < 0 ? -off : off)); return [cx + Math.cos(a) * Rs, cy + Math.sin(a) * Rs * .95]; }) }; };
    const gi = group(IN), go = group(OUT), hot = st.hot || null; fx.lineWidth = 1; fx.globalCompositeOperation = 'lighter';
    const drawFlow = (g, list, fl, rgb, sprite, on, rev) => { if (!g) return; list.forEach((p, i) => { const a = [p.x, p.y], b = g.ends[i], ns = rev ? 1 : (strandsIn[i] || 1); for (let k = -ns; k <= ns; k++) { fx.strokeStyle = `rgba(${rgb},${((k ? .09 : .22) + .28 * on) * (hot && hot.side === (rev ? 'out' : 'in') ? (hot.i === i ? 3 : .45) : 1)})`; curve([a[0] + (g.vert ? k * 2.5 : 0), a[1] + (g.vert ? 0 : k * 2.5)], [b[0] + (g.vert ? k * 3.5 : 0), b[1] + (g.vert ? 0 : k * 3.5)], g.vert); }
      const hotOn = hot && hot.side === (rev ? 'out' : 'in'), isHot = hotOn && hot.i === i;
      for (const q of (fl[i] || [])) { if (!still) { q.p += q.v * dt * (.7 + on) * (isHot ? 2.2 : 1); if (q.p > 1) { q.p -= 1; if (st.blip) st.blip(rev ? 'out' : 'in', i); } } for (let s = 0; s < 5; s++) { let uu = q.p - s * .012; if (uu < 0) continue; const e = rev ? 1 - uu : uu, o = Math.max(-ns, Math.min(ns, q.st)), [x0, y0] = bz(a, b, e, g.vert), x = x0 + (g.vert ? o * (2.5 + e * (rev ? -1 : 1)) : 0), y = y0 + (g.vert ? 0 : o * (2.5 + e)), z = (nar ? 8 : 11) - s * 1.4; fx.globalAlpha = Math.sin(uu * Math.PI) * (1 - s * .18) * (.55 + .45 * on); fx.drawImage(sprite, x - z / 2, y - z / 2, z, z); } } }); fx.globalAlpha = 1; };
    drawFlow(gi, IN, flows.i, '80,200,245', SP.c, beat === 0 ? .4 + .6 * Math.sin(bp * Math.PI) : .15, false);
    drawFlow(go, OUT, flows.o, '110,255,130', SP.g, beat === 2 ? .4 + .6 * Math.sin(bp * Math.PI) : .15, true);
    // events: a bright comet into the core, a flash, then a ring out to every output
    const ticker = [W * (nar ? .5 : .3), H * (nar ? .94 : .93)];
    // the traced record: one blue dot leaves its source box, spirals into the core (the pulse), spirals back out and
    // runs to the one page that record belongs on. A record with no page yet sends a ring to every page instead.
    const TA = 1.1, TB = 1.8, TC = 1.15;
    const cpos = (c, q) => { const own = c.src >= 0 && gi && IN[c.src], a = own ? [IN[c.src].x, IN[c.src].y] : ticker, b = own ? gi.ends[c.src] : [cx, cy + Rs * .8], vert = own ? gi.vert : true;
      if (q <= TA) return bz(a, b, Math.max(0, q / TA), vert);
      const routed = c.route >= 0 && go && OUT[c.route], e = routed ? go.ends[c.route] : [cx, cy];
      if (q <= TA + TB) { const u = (q - TA) / TB, inn = u < .5, k = inn ? 1 - u * 2 : (u - .5) * 2, from = inn ? b : e, a0 = Math.atan2(from[1] - cy, from[0] - cx), ang = a0 + (inn ? 1 : -1) * (1 - k) * 4.4, r = Math.hypot(from[0] - cx, from[1] - cy) * Math.pow(k, .8);
        return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * (.5 + .5 * k)]; }
      return routed ? bz([OUT[c.route].x, OUT[c.route].y], e, 1 - Math.min(1, (q - TA - TB) / TC), go.vert) : [cx, cy]; };
    for (const c of comets) { if (!still) c.p += dt; const routed = c.route >= 0 && go && OUT[c.route], end = TA + TB + (routed ? TC : 0);
      for (let k = 0; k < 14; k++) { const q = c.p - k * .032; if (q < 0) break; if (q > end) continue; const [x, y] = cpos(c, q), z = (nar ? 22 : 30) - k * 1.7; fx.globalAlpha = (1 - k * .068) * (c.p > end ? Math.max(0, 1 - (c.p - end) * 4) : 1); fx.drawImage(k ? SP.b : SP.w, x - z / 2, y - z / 2, z, z); }
      if (c.p >= TA + TB / 2 && !c.hit) { c.hit = true; U.uPulse.value = 1; rings.push({ p: 0, all: !routed }); rays.push({ p: 0, o: rnd() * 6.283 }); kickV = 1; }
      if (c.p >= end && !c.done) { c.done = true; if (routed && st.arrive) st.arrive(c.route); } }
    comets = comets.filter((c) => c.p < TA + TB + TC + .5 && !(c.done && c.p > TA + TB + TC + .3));
    for (const r of rings) { r.p += dt * .8; const rr = Rs * (1 + r.p * .7); fx.globalAlpha = Math.max(0, 1 - r.p) * .3; fx.strokeStyle = '#bff3ff'; fx.lineWidth = 1.2; fx.beginPath(); fx.ellipse(cx, cy, rr, rr * .95, 0, 0, 7); fx.stroke();
      if (go && r.all) OUT.forEach((p, i) => { const [x, y] = bz(go.ends[i], [p.x, p.y], Math.min(1, r.p * 1.2), go.vert); fx.globalAlpha = Math.max(0, 1 - r.p) * .95; fx.drawImage(SP.g, x - 11, y - 11, 22, 22); }); }
    rings = rings.filter((r) => r.p < 1); fx.globalAlpha = 1; fx.lineWidth = 1; fx.globalCompositeOperation = 'source-over';
    // numbers on the move: at the start of "collect" every file sends its real value count into the brain and the left
    // meter adds them up; in "deliver" the right meter counts up to the values that passed their checks.
    if (model && beat !== lastBeat) { lastBeat = beat;
      if (beat === 0 && !still) { const fl = model.sources.map((sc, i) => [sc, i]); tags = fl.map(([sc, i], k) => ({ i, delay: .5 + k * .55, p: 0, val: sc.total, txt: nf(sc.total) })); const rest = totalIn - sum7, more = model.totals.layers - fl.length;
        if (rest > 0 && more > 0) tags.push({ i: model.sources.length - 1, delay: .5 + fl.length * .55, p: 0, val: rest, txt: T('+' + nf(rest) + ' · ' + more + ' more layers', '+' + nf(rest) + ' · ' + more + ' ακόμη στρώματα') }); meter.inT = 0; meter.inV = 0; meter.outU = 0; } }
    if (model) {
      if (still) { meter.inV = meter.inT = totalIn; meter.outU = 1; }
      fx.font = `600 ${nar ? 9 : 10.5}px ${MONO}`; fx.textAlign = 'center'; fx.textBaseline = 'middle';
      for (const tg of tags) { tg.delay -= dt; if (tg.delay > 0 || !gi || !IN[tg.i]) continue; tg.p += dt / 2.1; const [x, y] = bz([IN[tg.i].x, IN[tg.i].y], gi.ends[tg.i], Math.min(1, tg.p), gi.vert), w = fx.measureText(tg.txt).width + 10, al = Math.min(1, Math.sin(Math.min(1, tg.p) * Math.PI) * 2.5);
        fx.globalAlpha = al; fx.fillStyle = 'rgba(4,14,22,.9)'; fx.fillRect(x - w / 2, y - 8, w, 16); fx.strokeStyle = 'rgba(95,220,255,.9)'; fx.strokeRect(x - w / 2, y - 8, w, 16); fx.fillStyle = '#d9f6ff'; fx.fillText(tg.txt, x, y + .5); fx.globalAlpha = 1;
        if (tg.p >= 1) { meter.inT += tg.val; tg.done = true; U.uPulse.value = Math.max(U.uPulse.value, .25); } }
      tags = tags.filter((tg) => !tg.done);
      if (!tags.length && beat !== 0 && !still) meter.inT = totalIn;
      meter.inV += (meter.inT - meter.inV) * Math.min(1, dt * 7); if (beat === 2 && !still) meter.outU = Math.min(1, meter.outU + dt / 3.2);
      const mm = (x, y, al, label, val, sub, col) => { fx.textAlign = al; fx.fillStyle = col; fx.font = `600 ${nar ? 8.5 : 9.5}px ${MONO}`; fx.fillText(label, x, y - (nar ? 13 : 17)); fx.shadowColor = col; fx.shadowBlur = 12; fx.fillStyle = '#f2fbff'; fx.font = `700 ${nar ? 16 : 23}px ${MONO}`; fx.fillText(val, x, y + 1); fx.shadowBlur = 0; fx.fillStyle = 'rgba(170,200,225,.85)'; fx.font = `${nar ? 8 : 9}px ${MONO}`; fx.fillText(sub, x, y + (nar ? 13 : 18)); };
      const my = nar ? cy + Rs * 1.02 : H * .665, tt = model.totals, started = meter.outU > 0, eo = meter.outU * meter.outU * (3 - 2 * meter.outU);
      mm(nar ? W * .04 : W * (W < 1000 ? .255 : .215), my, 'left', T('READINGS IN', 'ΜΕΤΡΗΣΕΙΣ ΠΟΥ ΜΠΑΙΝΟΥΝ'), nf(Math.round(meter.inV)), T(tt.layers + ' layers answering now', tt.layers + ' στρώματα απαντούν τώρα'), '#5fdcff');
      mm(nar ? W * .96 : W * (W < 1000 ? .765 : .785), nar ? my : H * (W < 1000 ? .74 : .815), 'right', T('SOURCES AGREE', 'ΟΙ ΠΗΓΕΣ ΣΥΜΦΩΝΟΥΝ'), started ? nf(Math.round(tt.agree * eo)) : '· · ·', !started ? T('counted in the last part', 'μετριούνται στο τελευταίο μέρος') : T('of ' + nf(tt.checks) + ' comparisons · differ ' + nf(Math.round(tt.differ * eo)), 'από ' + nf(tt.checks) + ' συγκρίσεις · διαφέρουν ' + nf(Math.round(tt.differ * eo))), '#7dff8a');
    }
    // the big pulse: rays burst from the brain and the camera punches in for a moment
    kickV *= Math.pow(.03, dt);
    for (const ry of rays) { ry.p += dt * 1.5; fx.globalAlpha = Math.max(0, 1 - ry.p) * .75; fx.strokeStyle = '#d6f6ff'; fx.lineWidth = 1.3; fx.beginPath(); for (let k = 0; k < 28; k++) { const q = k / 28 * 6.283 + ry.o, r0 = Rs * (1.02 + ry.p * .5), r1 = r0 + Rs * (.1 + .22 * ((k * 7) % 5) / 5) * (1 - ry.p * .5); fx.moveTo(cx + Math.cos(q) * r0, cy + Math.sin(q) * r0 * .95); fx.lineTo(cx + Math.cos(q) * r1, cy + Math.sin(q) * r1 * .95); } fx.stroke(); }
    rays = rays.filter((ry) => ry.p < 1); fx.globalAlpha = 1; fx.lineWidth = 1;
    // leader from the gold core to the "biggest riser" tag (desktop), like the reel's callouts
    if (!nar) { if (frames % 30 === 1) { const el = host.querySelector('.cn-riser'); if (el && !el.hidden) { const hb = host.getBoundingClientRect(), rb = el.getBoundingClientRect(); riserBox = [rb.left - hb.left, rb.top - hb.top + rb.height / 2]; } else riserBox = null; }
      if (riserBox) { const kx = riserBox[0] - 26; fx.strokeStyle = 'rgba(240,177,60,.85)'; fx.lineWidth = 1.1; fx.beginPath(); fx.moveTo(cx + Rs * .08, cy - Rs * .1); fx.lineTo(kx, riserBox[1]); fx.lineTo(riserBox[0], riserBox[1]); fx.stroke(); fx.beginPath(); fx.arc(cx + Rs * .08, cy - Rs * .1, 4, 0, 7); fx.stroke(); fx.lineWidth = 1; } }
    // the name plate: NEMESIS set on an arc over the orb, with a light that runs along the letters
    { const name = (model && model.plate) || 'CYPRUS', fs = Math.max(15, Math.min(nar ? 22 : 34, Rs * .19)), r = Math.max(Rs * .55, Math.min(Rs * 1.17, cy - H * (nar ? .355 : .125)));
      fx.font = `700 ${fs}px ${SANS}`; fx.textAlign = 'center'; fx.textBaseline = 'alphabetic'; let gap = fs * .62, ws = [...name].map((ch) => fx.measureText(ch).width + gap), tot = ws.reduce((x, y) => x + y, 0) / r;
      if (tot > 2.3) { const k = 2.3 / tot; fx.font = `700 ${Math.max(11, fs * k)}px ${SANS}`; gap *= k; ws = [...name].map((ch) => fx.measureText(ch).width + gap); tot = ws.reduce((x, y) => x + y, 0) / r; } let ang = -Math.PI / 2 - tot / 2;
      const run = still ? .5 : (t * .35) % 1.6 - .3; fx.shadowColor = 'rgba(80,215,255,.95)';
      [...name].forEach((ch, i) => { const w = ws[i] / r, mid = ang + w / 2, u = (mid + Math.PI / 2 + tot / 2) / tot, hot = Math.exp(-Math.pow((u - run) * 5, 2)); ang += w; if (ch === ' ') return;
        fx.save(); fx.translate(cx + Math.cos(mid) * r, cy + Math.sin(mid) * r); fx.rotate(mid + Math.PI / 2); fx.shadowBlur = 10 + 16 * hot; fx.fillStyle = `rgba(${Math.round(190 + 65 * hot)},${Math.round(238 + 17 * hot)},255,${.82 + .18 * hot})`; fx.fillText(ch, 0, 0); fx.fillText(ch, 0, 0); fx.restore(); });
      fx.shadowBlur = 0; const a0 = -Math.PI / 2 - tot / 2 - .06, a1 = -Math.PI / 2 + tot / 2 + .06, rr = r + fs * .36; fx.strokeStyle = 'rgba(95,220,255,.7)'; fx.lineWidth = 1.2;
      fx.beginPath(); fx.arc(cx, cy, rr, a0 - .34, a0); fx.stroke(); fx.beginPath(); fx.arc(cx, cy, rr, a1, a1 + .34); fx.stroke();
      for (const [a, d] of [[a0, -1], [a1, 1]]) { for (let k = 0; k < 4; k++) { const q = a + d * (.07 + k * .085), l = k === 3 ? 7 : 4; fx.beginPath(); fx.moveTo(cx + Math.cos(q) * rr, cy + Math.sin(q) * rr); fx.lineTo(cx + Math.cos(q) * (rr + l), cy + Math.sin(q) * (rr + l)); fx.stroke(); }
        const e = a + d * .34, pulse = still ? .8 : .55 + .45 * Math.sin(t * 3 + d); fx.globalAlpha = pulse; fx.drawImage(SP.c, cx + Math.cos(e) * rr - 7, cy + Math.sin(e) * rr - 7, 14, 14); fx.globalAlpha = 1; }
      fx.lineWidth = 1; }
    if (!nar) { fx.font = `9px ${MONO}`; fx.textBaseline = 'middle'; fx.textAlign = 'left'; fx.fillStyle = 'rgba(170,215,245,.75)'; const k = (nar ? 2.5 : 3.6) / 3.6;
      for (const c of CITY) { const [x, y] = toScreen(mx(c[2]) * k, map.position.y + (mh(c[2], c[3]) + 1.2) * k, mz(c[3]) * k); if (x > W * .2 && x < W * .8 && Math.hypot(x - cx, y - cy) > Rs * 1.1) fx.fillText(T(c[0], c[1]).toUpperCase().normalize('NFD').replace(/\u0301/g, ''), x + 5, y); } }
    // watchdog: if frames are slow, shed work instead of stuttering
    if (!still && frames > 40) { slow = raw > .034 ? slow + 1 : Math.max(0, slow - 1); if (slow > 45) { slow = 0; if (trailsOn) trailsOn = false; else if (N > 12000) { N = Math.floor(N / 2); gHead.setDrawRange(0, N); gLine.setDrawRange(0, N * 2); } } }
  }
  function destroy() { if (dead) return; dead = true; host.removeEventListener('pointermove', onMove); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    try { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); bloom.dispose && bloom.dispose(); } catch { /* older composer */ }
    renderer.dispose(); try { renderer.forceContextLoss(); } catch { /* already lost */ } glc.remove(); fxc.remove(); }
  resize();
  return { render, resize, setModel, event, destroy, get lowEnd() { return lowEnd; } };
  }
  SC.layersLive = SC.layersLive || {};
  SC.layersLive.cineEngine = mountEngine;
})();
