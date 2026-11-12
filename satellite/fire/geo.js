'use strict';
/* satellite/fire/geo.js: small map helpers for the fire feeds (no network, no dependencies).
 *   distanceKm(lat1, lng1, lat2, lng2)   great-circle distance in km (haversine, earth radius 6371 km)
 *   loadIsland(file)                     the island outline from public/site/island.js (a browser file) read in a sandbox, simplified, or null
 *   fallbackIsland()                     the same frame without an outline
 */
const fs = require('fs');
const vm = require('vm');

const RAD = Math.PI / 180;

// Douglas-Peucker on a list of [x, y] points (iterative, so a long coast cannot overflow the stack).
function rdp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let dmax = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)); d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// "M x y L x y ... Z" (absolute commands only, as in island.js) -> the same shape with fewer points. Rings that shrink to a speck are dropped.
function simplifyPath(d, tol) {
  const out = [];
  for (const part of String(d).split('M').slice(1)) {
    const nums = part.replace(/Z/g, '').split(/[L\s,]+/).filter(Boolean).map(Number);
    let pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    let far = 1, fd = -1;
    pts.forEach((p, i) => { const q = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); if (q > fd) { fd = q; far = i; } });
    const a = rdp(pts.slice(0, far + 1), tol), b = rdp(pts.slice(far).concat([pts[0]]), tol);
    const ring = a.concat(b.slice(1, -1));
    if (ring.length < 3) continue;
    out.push('M' + ring.map((p) => `${Math.round(p[0] * 10) / 10} ${Math.round(p[1] * 10) / 10}`).join('L') + 'Z');
  }
  return out.join('');
}
function distanceKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * RAD, dLng = (lng2 - lng1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// public/site/island.js sets window.ISLAND = { W, H, bbox:[w,s,e,n], k, sx, districts:{name: "SVG path"} } and ISLAND.project(lng, lat).
// It is a file for the browser, so it runs here inside an empty vm context (no require, no process, no network, 1 s limit) and only
// plain numbers and path strings are taken out of it. Returns null when the file is missing or does not look right.
function loadIsland(file) {
  try {
    const code = fs.readFileSync(file, 'utf8');
    if (code.length > 2e6) return null;
    const box = {};
    box.window = box;
    vm.createContext(box);
    vm.runInContext(code, box, { timeout: 1000 });
    const I = box.ISLAND;
    if (!I || !I.districts || !Array.isArray(I.bbox) || I.bbox.length !== 4) return null;
    const W = Number(I.W), H = Number(I.H), k = Number(I.k), sx = Number(I.sx);
    if (![W, H, k, sx].every((v) => Number.isFinite(v) && v > 0)) return null;
    const bbox = I.bbox.map(Number);
    if (!bbox.every(Number.isFinite)) return null;
    const districts = {};
    for (const [name, d] of Object.entries(I.districts)) {
      if (typeof d !== 'string' || !/^[MLZ0-9 .,\-]+$/.test(d) || d.length > 400000) continue;
      const simple = simplifyPath(d, 1);   // 1 picture unit is about 230 m on the ground: below what a 1000 px wide picture can show
      if (simple) districts[String(name).replace(/[^a-z0-9_-]/gi, '')] = simple;
    }
    if (!Object.keys(districts).length) return null;
    // The same projection as ISLAND.project, written out so no code from the file has to be called.
    const project = (lng, lat) => [(lng - bbox[0]) * k * sx, H - (lat - bbox[1]) * sx];
    const unproject = (x, y) => [bbox[0] + x / (k * sx), bbox[1] + (H - y) / sx];
    return { W, H, bbox, k, sx, districts, project, unproject, kmPx: sx / 111.19 };
  } catch (e) { return null; }
}

// Used when island.js is missing: the same frame and projection numbers, no land drawn.
function fallbackIsland() {
  const W = 1000, H = 599.3, bbox = [32.2696, 34.5627, 34.6055, 35.7076], k = 0.817796807406572, sx = 523.4802999038781;
  return {
    W, H, bbox, k, sx, districts: {}, kmPx: sx / 111.19,
    project: (lng, lat) => [(lng - bbox[0]) * k * sx, H - (lat - bbox[1]) * sx],
    unproject: (x, y) => [bbox[0] + x / (k * sx), bbox[1] + (H - y) / sx],
  };
}

module.exports = { distanceKm, loadIsland, fallbackIsland, simplifyPath };
