'use strict';
/*
  downsample.js: thin a long time series to a few hundred points for drawing, keeping its shape.

  Pure CommonJS, no dependencies, no I/O. Nothing in the server calls it yet (see the maintainer notes in
  gh/report/extras.md); it is a tested library for the day a long series is sent to a browser unthinned.

  Algorithm: Largest-Triangle-Three-Buckets (LTTB), Sveinn Steinarsson, "Downsampling Time Series for
  Visual Representation", MSc thesis, University of Iceland, 2013 (https://skemman.is/handle/1946/15343).
  The first and the last point are always kept. The points in between are split into (threshold - 2) buckets;
  from each bucket the point that makes the biggest triangle with (the point kept from the previous bucket)
  and (the average of the next bucket) is kept. Spikes and dips therefore survive, while flat stretches
  collapse. The kept points are REAL readings taken from the input (never averages), returned in time order,
  as the same objects/arrays that went in (so nothing is copied, rounded or renamed).

  This file is an own implementation written from the published algorithm and checked against the
  reference implementation pingec/downsample-lttb (MIT, Copyright (c) 2014 Matej Drolc,
  https://github.com/pingec/downsample-lttb, commit e6473596fbd969f3afb0f457cc4790b0a9b42790, index.js).
  The reference's licence text, as required by the MIT licence for anything derived from it:

    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
    associated documentation files (the "Software"), to deal in the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
    following conditions: The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
    KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
    PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
    ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

  What this version adds to the published algorithm (the reference has none of it):
    - Points whose x or y is missing or not a finite number (null, undefined, NaN, Infinity, '' or text) are
      skipped before anything is counted. A bare Number(null) would be 0, so nulls are tested explicitly.
    - Unsorted input is sorted by x (stable) on a copy of the index list; the input is never modified.
    - Optional gap handling: with { gap: <x distance> } the series is cut wherever two neighbouring valid
      points are further apart than that, each piece is thinned on its own, and the two ends of every piece
      are kept, so a hole in the data stays a hole on the chart instead of being bridged by a line.
    - Several input shapes: [x, y] pairs, {t, v} objects, or any shape through { x, y } accessors.

  API
    lttb(points, threshold, opts?) -> array of the kept input items, in x order
        points     array of [x, y] | { t, v } | anything the accessors below can read
        threshold  maximum number of points to return (whole number >= 1; see "Output length")
        opts.x, opts.y   how to read x and y: a function (item) => number, a property name ('t'),
                         or an array index (0). Default: index 0 / 1 for arrays, 't' / 'v' for objects.
        opts.gap         cut the series where two neighbours are further apart than this (same unit as x)
    lttbIndices(xs, ys, threshold) -> indices into xs/ys, the bare algorithm on two equally long, sorted,
        all-finite number arrays (no checks); lttb() is built on it.

  Output length
    No gaps: n valid points and threshold >= n -> all n points; otherwise exactly threshold points
             (threshold 1 -> the first point; threshold 2 -> first and last).
    With gaps: the budget is shared between the pieces in proportion to their size (largest remainder),
             every piece with two or more points gets at least its first and last point, a piece of one point
             is kept. So the result is at most threshold, except when there are so many pieces that their ends
             alone need more than threshold points; then it is two points per piece (and a lone point).
*/

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

function reader(spec, fallback) {
  if (typeof spec === 'function') return spec;
  if (typeof spec === 'string' || typeof spec === 'number') return (it) => (it == null ? undefined : it[spec]);
  return fallback;
}

// The bare algorithm. xs and ys: equal length, sorted by x, every value finite. Returns indices (ascending).
function lttbIndices(xs, ys, threshold) {
  const n = xs.length;
  const th = Math.floor(threshold);
  if (!(th >= 1) || n === 0) return [];
  if (th >= n) return Array.from({ length: n }, (_, i) => i);
  if (th === 1) return [0];
  if (th === 2) return [0, n - 1];

  const x0 = xs[0]; // work relative to the first x: epoch milliseconds are ~1.7e12 and areas multiply them
  const out = new Array(th);
  const every = (n - 2) / (th - 2); // bucket width in points; > 1 because th < n
  let a = 0; // index of the last kept point
  let k = 0;
  out[k++] = 0;
  for (let i = 0; i < th - 2; i++) {
    // average of the NEXT bucket (the last "bucket" is the final point alone when it runs off the end)
    let nStart = Math.floor((i + 1) * every) + 1;
    let nEnd = Math.floor((i + 2) * every) + 1;
    if (nEnd > n) nEnd = n;
    let avgX = 0, avgY = 0;
    for (let j = nStart; j < nEnd; j++) { avgX += xs[j] - x0; avgY += ys[j]; }
    const len = nEnd - nStart;
    avgX /= len; avgY /= len;

    // the CURRENT bucket: keep the point with the biggest triangle (a, point, next-bucket average)
    const from = Math.floor(i * every) + 1;
    const to = Math.floor((i + 1) * every) + 1;
    const ax = xs[a] - x0, ay = ys[a];
    let best = -1, bestIdx = from;
    for (let j = from; j < to; j++) {
      const area = Math.abs((ax - avgX) * (ys[j] - ay) - (ax - (xs[j] - x0)) * (avgY - ay)) * 0.5;
      if (area > best) { best = area; bestIdx = j; }
    }
    out[k++] = bestIdx;
    a = bestIdx;
  }
  out[k++] = n - 1;
  return out;
}

// Share `budget` points between pieces of the given sizes: every piece of 2+ points gets at least 2,
// a piece of 1 point gets 1, the rest is split in proportion to size with the largest-remainder method.
function allocate(sizes, budget) {
  const alloc = sizes.map((s) => Math.min(s, 2));
  let used = alloc.reduce((p, c) => p + c, 0);
  let spare = budget - used;
  if (spare <= 0) return alloc;
  const room = sizes.map((s, i) => s - alloc[i]);
  const totalRoom = room.reduce((p, c) => p + c, 0);
  if (totalRoom <= 0) return alloc;
  if (spare >= totalRoom) return sizes.slice();
  const want = room.map((r) => (r * spare) / totalRoom);
  const whole = want.map((w) => Math.floor(w));
  let left = spare - whole.reduce((p, c) => p + c, 0);
  const order = want.map((w, i) => [w - Math.floor(w), i]).sort((p, q) => q[0] - p[0] || p[1] - q[1]);
  for (let m = 0; m < order.length && left > 0; m++, left--) whole[order[m][1]]++;
  return alloc.map((a2, i) => a2 + whole[i]);
}

function lttb(points, threshold, opts) {
  if (!Array.isArray(points)) throw new TypeError('lttb: points must be an array');
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) throw new RangeError('lttb: threshold must be a finite number');
  const o = opts || {};
  const th = Math.floor(threshold);
  if (th < 1) return [];

  // 1. read x and y, drop what is not a usable number
  const kept = [];
  const xs0 = [];
  const ys0 = [];
  const readX = reader(o.x, null);
  const readY = reader(o.y, null);
  for (let i = 0; i < points.length; i++) {
    const it = points[i];
    if (it == null) continue;
    const isArr = Array.isArray(it);
    let x = readX ? readX(it) : (isArr ? it[0] : it.t);
    const y = readY ? readY(it) : (isArr ? it[1] : it.v);
    if (x instanceof Date) x = x.getTime();
    if (!isNum(x) || !isNum(y)) continue;
    kept.push(it); xs0.push(x); ys0.push(y);
  }
  const n = kept.length;
  if (n === 0) return [];

  // 2. into x order (stable), without touching the input
  let order = null;
  for (let i = 1; i < n; i++) if (xs0[i] < xs0[i - 1]) { order = Array.from({ length: n }, (_, j) => j).sort((p, q) => xs0[p] - xs0[q] || p - q); break; }
  const items = order ? order.map((i) => kept[i]) : kept;
  const xs = order ? order.map((i) => xs0[i]) : xs0;
  const ys = order ? order.map((i) => ys0[i]) : ys0;

  // 3. no gap rule: the plain algorithm
  const gap = o.gap;
  if (!(isNum(gap) && gap > 0)) return lttbIndices(xs, ys, th).map((i) => items[i]);

  // 4. gap rule: cut into pieces, thin each piece with its share
  const cuts = [0];
  for (let i = 1; i < n; i++) if (xs[i] - xs[i - 1] > gap) cuts.push(i);
  cuts.push(n);
  const sizes = [];
  for (let c = 0; c + 1 < cuts.length; c++) sizes.push(cuts[c + 1] - cuts[c]);
  if (n <= th) return items.slice();
  const alloc = allocate(sizes, th);
  const out = [];
  for (let c = 0; c < sizes.length; c++) {
    const s = cuts[c], e = cuts[c + 1];
    const idx = lttbIndices(xs.slice(s, e), ys.slice(s, e), alloc[c]);
    for (const i of idx) out.push(items[s + i]);
  }
  return out;
}

module.exports = { lttb, lttbIndices };
