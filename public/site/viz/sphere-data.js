/*
  Cell sphere data (pure, tested by tests/viz/sphere_test.js).
  One cell = one real record. Input: a Data Vortex model (public/site/vortexdata.js: evModel, crossingsModel, floodModel,
  quakesModel, allModel) and an optional selected group key. Output:
    { cells:[{i, x,y,z (unit vector), r (0..1, from item.s with a floor), cr (disc radius as a chord on the unit sphere),
              color, b (band key), g (group key), item}],
      arcs:[[iA,iB]]   // ONLY between cells of the selected group; an arc means "same group", nothing else
      textRows:[[en,el]], ariaLabel:[en,el], emptyText:[en,el],
      legend:[{k,n,c,count}], stats:{total, shown, notShown, cap, groupKey, groupCount, groupShown, arcs, spacing} }
  Placement: Fibonacci sphere, records dealt to the points in a fixed pseudo-random order (same input, same picture).
  Disc radius is capped by the point spacing so neighbours never overlap. More than 900 records: the first 900 (model
  order) are drawn and the rest are counted in textRows, never sampled silently.
  Works as a browser script (window.SC.viz.sphereData) and as a CommonJS module for the tests.
*/
(function (root) {
  'use strict';
  const CAP = 900, FLOOR = 0.35, DEFAULT_COLOR = '#7DD3FC';
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const pair = (p, fb) => (Array.isArray(p) && p.length >= 2 && p[0] != null ? [String(p[0]), String(p[1] == null ? p[0] : p[1])] : fb);

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // fixed shuffle of 0..n-1, seeded by n only, so the picture depends on the records and nothing else
  function deal(n) {
    const a = Array.from({ length: n }, (_, i) => i), rnd = mulberry(0x5EED ^ (n * 2654435761));
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function fib(i, n) {
    const y = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399963229728653;
    return [Math.cos(th) * rr, y, Math.sin(th) * rr];
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  // chain through the cells of one group, always to the nearest unvisited cell: short arcs, no hairball, deterministic
  function chain(cells, idx) {
    if (idx.length < 2) return [];
    const left = idx.slice(1), arcs = []; let cur = idx[0];
    while (left.length) {
      let bi = 0, bd = Infinity;
      for (let k = 0; k < left.length; k++) { const d = dist(cells[cur], cells[left[k]]); if (d < bd - 1e-12) { bd = d; bi = k; } }
      const nx = left.splice(bi, 1)[0]; arcs.push([cur, nx]); cur = nx;
    }
    return arcs;
  }

  function build(model, groupKey) {
    const m = model || {}, all = Array.isArray(m.items) ? m.items : [];
    const total = all.length, shownItems = all.slice(0, CAP), n = shownItems.length, notShown = total - n;
    const bandCol = new Map(), bandName = new Map();
    for (const b of m.bands || []) { bandCol.set(b.k, b.c); bandName.set(b.k, pair(b.n, [String(b.k), String(b.k)])); }
    const spacing = n ? Math.sqrt((4 * Math.PI) / n) : 0, cap = Math.min(0.14, 0.4 * spacing);
    const order = deal(n), cells = [];
    for (let p = 0; p < n; p++) {
      const it = shownItems[order[p]], v = fib(p, n), s = Math.min(1, Math.max(0, num(it && it.s, 0))), r = FLOOR + (1 - FLOOR) * s;
      cells.push({ i: p, x: v[0], y: v[1], z: v[2], r, cr: r * cap, color: bandCol.get(it.b) || DEFAULT_COLOR, b: it.b, g: it.g, item: it });
    }
    const gk = groupKey == null ? null : groupKey;
    const sel = gk == null ? [] : cells.filter((c) => c.g === gk).map((c) => c.i);
    const arcs = chain(cells, sel);
    const groupTotal = gk == null ? 0 : all.filter((x) => x.g === gk).length;

    const unit = pair(m.unit, ['records', 'εγγραφές']), title = pair(m.n, ['Records', 'Εγγραφές']);
    const gRow = (m.groups || []).find((g) => g.k === gk), gName = gk == null ? null : pair(gRow && gRow.n, [String(gk), String(gk)]);
    const counts = new Map(); for (const c of cells) counts.set(c.b, (counts.get(c.b) || 0) + 1);
    const legend = [...bandCol.keys()].filter((k) => counts.get(k)).map((k) => ({ k, n: bandName.get(k), c: bandCol.get(k), count: counts.get(k) }));
    for (const k of counts.keys()) if (!bandCol.has(k)) legend.push({ k, n: [String(k), String(k)], c: DEFAULT_COLOR, count: counts.get(k) });

    const rows = [], bt = pair(m.bandsTitle, ['Colour', 'Χρώμα']);
    if (!total) {
      rows.push(['No records to show.', 'Δεν υπάρχουν εγγραφές για εμφάνιση.']);
    } else {
      rows.push([n + ' ' + unit[0] + ' from ' + title[0] + ': one disc for each record.', n + ' ' + unit[1] + ' από ' + title[1] + ': ένας δίσκος για κάθε εγγραφή.']);
      if (notShown) rows.push([notShown + ' of ' + total + ' records are not shown: the sphere holds at most ' + CAP + ' discs, and the first ' + CAP + ' are drawn.', notShown + ' από ' + total + ' εγγραφές δεν εμφανίζονται: η σφαίρα χωράει το πολύ ' + CAP + ' δίσκους και σχεδιάζονται οι πρώτοι ' + CAP + '.']);
      for (const l of legend) rows.push([bt[0] + ': ' + l.n[0] + ', ' + l.count, bt[1] + ': ' + l.n[1] + ', ' + l.count]);
      if (gk == null) rows.push(['No group is selected, so there are no arcs.', 'Δεν έχει επιλεγεί ομάδα, άρα δεν υπάρχουν τόξα.']);
      else {
        rows.push(['Selected group ' + gName[0] + ': ' + groupTotal + ' records, ' + arcs.length + ' arcs. An arc only means the same group.', 'Επιλεγμένη ομάδα ' + gName[1] + ': ' + groupTotal + ' εγγραφές, ' + arcs.length + ' τόξα. Ένα τόξο σημαίνει μόνο ότι ανήκουν στην ίδια ομάδα.']);
        if (sel.length < groupTotal) rows.push([(groupTotal - sel.length) + ' records of this group are among those not shown.', (groupTotal - sel.length) + ' εγγραφές αυτής της ομάδας είναι ανάμεσα σε αυτές που δεν εμφανίζονται.']);
      }
      const note = pair(m.note, null); if (note) rows.push(note);
    }
    const aria = total
      ? [n + ' ' + unit[0] + ' from ' + title[0] + ' as a sphere of discs, one disc per record' + (notShown ? ', ' + notShown + ' not shown' : '') + (gk == null ? '.' : '; group ' + gName[0] + ' is joined by arcs.'),
         n + ' ' + unit[1] + ' από ' + title[1] + ' ως σφαίρα από δίσκους, ένας δίσκος ανά εγγραφή' + (notShown ? ', ' + notShown + ' δεν εμφανίζονται' : '') + (gk == null ? '.' : '· η ομάδα ' + gName[1] + ' συνδέεται με τόξα.')]
      : ['No records to show.', 'Δεν υπάρχουν εγγραφές για εμφάνιση.'];
    return { cells, arcs, textRows: rows, ariaLabel: aria, emptyText: ['No records to show.', 'Δεν υπάρχουν εγγραφές για εμφάνιση.'], legend,
      stats: { total, shown: n, notShown, cap: CAP, groupKey: gk, groupCount: groupTotal, groupShown: sel.length, arcs: arcs.length, spacing } };
  }

  const api = { build, CAP, FLOOR };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.sphereData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
