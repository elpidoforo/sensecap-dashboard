'use strict';
/* Trail simplification: fewer points, same route.
 *
 * A trail is a list of rows [time in ms, lat, lng, value or null], the shape of /api/trails (see privacy.js). simplifyTrail() keeps the
 * rows that matter for the shape of the route and drops the rest. Rows are never changed or re-computed: what comes back are the SAME row
 * objects, a subset of the input in the same order. So the time and the measurement ride along, and a rounded public row stays exactly
 * as privacy.js rounded it. This file therefore holds no privacy rule and must run AFTER privacy.js has delayed, rounded and de-duplicated
 * the trail (server.js does that); it can only ever remove points, never add or move one.
 *
 * The steps, for one trail:
 *   1. Split at real gaps. A silence longer than gapMs, or a jump longer than gapDistM, starts a new part. The last row before a gap and
 *      the first after it are always kept, so the map still sees the gap (it draws a dashed line when two neighbours are far apart in time).
 *   2. In each part: radial-distance reduction (drop a point that is within tolM metres of the last kept point), then Douglas-Peucker
 *      (drop a point that lies within tolM metres of the line between its kept neighbours). The first and last row of a part stay.
 *   3. No false gaps. Dropping points of a straight road must not leave two neighbours more than maxSpanMs apart, or the map would
 *      draw a "no signal" dash where there was signal. Where that would happen, original rows are put back, evenly in time.
 *   4. Optionally, if the result is still longer than maxPoints, step 2 and 3 are repeated with a larger tolerance.
 *
 * Distances are in metres on a flat local map (equirectangular, x scaled by cos(latitude)), which is exact enough at the scale of
 * one island part (error well under 1 % for a 20 km part at 35 degrees north).
 *
 * Third-party notice. The structure of steps 2 (radial distance followed by Douglas-Peucker, the point-to-segment distance, the idea of
 * working on squared distances) follows Simplify.js by Vladimir Agafonkin (https://github.com/mourner/simplify-js, v1.2.4,
 * BSD 2-Clause, (c) 2017 Vladimir Agafonkin). This file is a new implementation (iterative instead of recursive, index based so rows are
 * returned untouched, with the gap, time-span and point-cap rules added), not a copy. The licence text of Simplify.js:
 *
 *   Copyright (c) 2017, Vladimir Agafonkin. All rights reserved.
 *   Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions
 *   are met: 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
 *   disclaimer. 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following
 *   disclaimer in the documentation and/or other materials provided with the distribution.
 *   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 *   LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *   COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 *   (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 *   INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 *   OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const M_PER_DEG = 111195;   // metres per degree of latitude (mean earth radius 6371 km)
const MIN = 60000;

// The silences the map pages treat as "no signal" (public/map.html: GAP_MS = 10 min for exact trails, 45 min for the sparse public ones).
const GAP_EXACT_MS = 10 * MIN;
const GAP_PUBLIC_MS = 45 * MIN;

const isNum = (v) => typeof v === 'number' && isFinite(v);
const usable = (p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]) && isNum(p[2]);

/** The tolerance in metres for a public trail rounded to `grid` degrees: half a cell. Rounding alone moves a point by up to that much on
 *  each axis, so a point that is off the line by less than that cannot be told apart from rounding noise. About 556 m for the 0.01 degree
 *  grid (the default, about 1 km). Kept between 5 m and 5 km. (A full cell would also smooth the one-cell staircase that rounding makes on
 *  a diagonal road, but it flattens loops of a few km into triangles, so the smaller value is used.) */
function publicToleranceM(grid) {
  const g = isNum(grid) && grid > 0 ? grid : 0.01;
  return Math.min(5000, Math.max(5, Math.round(0.5 * g * M_PER_DEG)));
}

/** Distance in metres between two rows (flat local approximation, good for short distances; used for the jump test). */
function distM(a, b) {
  const kx = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180) * M_PER_DEG;
  const dx = (b[2] - a[2]) * kx, dy = (b[1] - a[1]) * M_PER_DEG;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Split a trail (rows in time order) into parts at real gaps: a silence longer than gapMs or a jump longer than gapDistM.
 *  Rows that are not usable (no finite time, lat, lng) are left out. Returns an array of arrays of the same row objects. */
function splitTrail(points, opts) {
  const o = opts || {};
  const gapMs = isNum(o.gapMs) && o.gapMs > 0 ? o.gapMs : Infinity;
  const gapDistM = isNum(o.gapDistM) && o.gapDistM > 0 ? o.gapDistM : Infinity;
  const rows = (points || []).filter(usable);
  for (let i = 1; i < rows.length; i++) if (rows[i][0] < rows[i - 1][0]) { rows.sort((a, b) => a[0] - b[0]); break; }   // time order, stable
  const parts = [];
  let cur = [];
  for (const p of rows) {
    const prev = cur[cur.length - 1];
    if (prev && (p[0] - prev[0] > gapMs || (gapDistM !== Infinity && distM(prev, p) > gapDistM))) { parts.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) parts.push(cur);
  return parts;
}

// squared distance from point (px, py) to the segment (ax, ay)-(bx, by)
function sqSegDist(px, py, ax, ay, bx, by) {
  let x = ax, y = ay;
  const dx = bx - ax, dy = by - ay;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = bx; y = by; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  const ex = px - x, ey = py - y;
  return ex * ex + ey * ey;
}

/** Indices (into `part`) of the rows to keep for ONE part (no gaps inside it): radial distance, Douglas-Peucker, then the time-span rule. */
function keepIndices(part, tolM, maxSpanMs, highQuality) {
  const n = part.length;
  if (n <= 2) return part.map((_, i) => i);
  const lat0 = part.reduce((s, p) => s + p[1], 0) / n, kx = Math.cos(lat0 * Math.PI / 180) * M_PER_DEG;
  const X = new Float64Array(n), Y = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = (part[i][2] - part[0][2]) * kx; Y[i] = (part[i][1] - part[0][1]) * M_PER_DEG; }
  const sq = tolM * tolM;

  // 2a. radial distance: walk on, keep a point only when it is further than the tolerance from the last kept one; the last row always stays
  let idx = [0];
  if (highQuality) { for (let i = 1; i < n; i++) idx.push(i); }
  else {
    let last = 0;
    for (let i = 1; i < n - 1; i++) {
      const dx = X[i] - X[last], dy = Y[i] - Y[last];
      if (dx * dx + dy * dy > sq) { idx.push(i); last = i; }
    }
    idx.push(n - 1);
  }

  // 2b. Douglas-Peucker on what is left, with an explicit stack (a 7000-point trail must not depend on the call stack)
  const m = idx.length, mark = new Uint8Array(m);
  mark[0] = 1; mark[m - 1] = 1;
  const stack = [0, m - 1];
  while (stack.length) {
    const hi = stack.pop(), lo = stack.pop();
    let far = -1, farD = sq;
    for (let k = lo + 1; k < hi; k++) {
      const d = sqSegDist(X[idx[k]], Y[idx[k]], X[idx[lo]], Y[idx[lo]], X[idx[hi]], Y[idx[hi]]);
      if (d > farD) { far = k; farD = d; }
    }
    if (far >= 0) { mark[far] = 1; if (far - lo > 1) stack.push(lo, far); if (hi - far > 1) stack.push(far, hi); }
  }
  const kept = [];
  for (let k = 0; k < m; k++) if (mark[k]) kept.push(idx[k]);

  // 3. no false gaps: where two kept neighbours are further apart in time than maxSpanMs, put original rows back, as late as allowed
  if (isNum(maxSpanMs) && maxSpanMs > 0) {
    const out = [kept[0]];
    for (let k = 1; k < kept.length; k++) {
      let a = kept[k - 1];
      const b = kept[k];
      while (part[b][0] - part[a][0] > maxSpanMs && b - a > 1) {
        let j = a + 1;
        while (j + 1 < b && part[j + 1][0] - part[a][0] <= maxSpanMs) j++;
        out.push(j);
        a = j;
      }
      out.push(b);
    }
    return out;
  }
  return kept;
}

/**
 * Simplify one trail. Options (all optional except that a useful run needs tolM):
 *   tolM          tolerance in metres (default 20)
 *   gapMs         silence that splits the trail (default 10 min; Infinity turns the time split off)
 *   gapDistM      jump that splits the trail (default 25 km: 25 km in one step is not driving on this island)
 *   maxSpanMs     longest time between two kept neighbours inside a part (default gapMs: never draw a gap that was not there; 0 = off)
 *   maxPoints     if the result is longer, repeat with a tolerance 1.5 times larger, up to 12 times (default: no cap)
 *   highQuality   skip the radial step (slower, a little more exact), like simplify-js
 * Returns a new array holding the same row objects, in order. Trails of 0 to 2 usable rows come back as they are (as a copy).
 */
function simplifyTrail(points, opts) {
  const o = opts || {};
  let tol = isNum(o.tolM) && o.tolM >= 0 ? o.tolM : 20;
  const gapMs = isNum(o.gapMs) && o.gapMs > 0 ? o.gapMs : o.gapMs === Infinity ? Infinity : GAP_EXACT_MS;
  const gapDistM = isNum(o.gapDistM) && o.gapDistM > 0 ? o.gapDistM : o.gapDistM === Infinity ? Infinity : 25000;
  const maxSpanMs = o.maxSpanMs === undefined ? (gapMs === Infinity ? 0 : gapMs) : o.maxSpanMs;
  const parts = splitTrail(points, { gapMs, gapDistM });
  if (!parts.length) return [];
  const run = (t) => {
    const out = [];
    for (const part of parts) for (const i of keepIndices(part, t, maxSpanMs, !!o.highQuality)) out.push(part[i]);
    return out;
  };
  let out = run(tol);
  if (isNum(o.maxPoints) && o.maxPoints >= 2) {
    for (let k = 0; k < 12 && out.length > o.maxPoints; k++) { tol = Math.max(tol, 1) * 1.5; out = run(tol); }
  }
  return out;
}

/** Simplify every trail of an { eui: rows } object. Other keys of a /api/trails answer are left to the caller. */
function simplifyTrails(trails, opts) {
  const out = {};
  for (const [k, rows] of Object.entries(trails || {})) out[k] = simplifyTrail(rows, opts);
  return out;
}

module.exports = { simplifyTrail, simplifyTrails, splitTrail, publicToleranceM, distM, GAP_EXACT_MS, GAP_PUBLIC_MS };
