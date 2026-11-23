/*
  sitemap-data.js: the model for the Site Map board: the site's own menu as a graph that builds itself. Pure: no DOM, no clock.
  build({ root, groups: [{ id, name, items: [{ id, name, desc }] }] }) -> model with one cue time per page, a place for every
  node, and the counters. Names may be [en, el] pairs or plain strings (the page passes the menu in the current language).
  Groups and pages keep the menu's own order; nothing is ranked. Places are worked out from the index alone (a sunflower
  spiral), so the picture is the same every time and at any moment of the run.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.sitemapData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const STEP = 233, HOLD = 1300, END = 3600;      // a page every 233 ms, a pause when a group is complete, the finished map held 3.6 s
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  const HUES = ['#FBBF24', '#5fd4ff', '#f472b6', '#34D399', '#a78bfa', '#fb923c'];
  const EMPTY = ['The menu of the site could not be read.', 'Το μενού του ιστοτόπου δεν μπόρεσε να διαβαστεί.'];
  const en = (v) => (Array.isArray(v) ? String(v[0]) : String(v == null ? '' : v)), el = (v) => (Array.isArray(v) ? String(v[1]) : String(v == null ? '' : v));

  function build(input) {
    const gs = input && Array.isArray(input.groups) ? input.groups.filter((g) => g && Array.isArray(g.items) && g.items.length) : [];
    if (!gs.length) return { id: 'sitemap', available: false, empty: EMPTY, groups: [], items: [], totals: { groups: 0, pages: 0 }, duration: 0, textRows: [EMPTY], ariaLabel: EMPTY };
    const n = gs.length, items = [], groups = []; let t = 400, k = 0;
    gs.forEach((g, gi) => {
      const ang = -Math.PI / 2 + (gi + 0.5) * (2 * Math.PI / n) + (n === 4 ? Math.PI / 4 - Math.PI / 4 : 0), start = t, first = k;
      const grp = { i: gi, id: String(g.id), name: g.name, hue: HUES[gi % HUES.length], angle: ang, start, count: g.items.length, first };
      g.items.forEach((it, j) => {
        // a sunflower spiral around the group hub: radius grows with the square root of the index, so the dots fill a disc evenly
        const r = Math.sqrt((j + 0.6) / g.items.length), a = j * GOLD + gi * 1.3;
        items.push({ k, group: gi, j, id: String(it.id), name: it.name, desc: it.desc == null ? '' : it.desc, at: t, r, a, big: j % 5 === 0 });
        t += STEP; k++;
      });
      grp.end = t; t += HOLD; grp.done = t; groups.push(grp);
    });
    const duration = t - HOLD + END, total = items.length;
    const head = [total + ' pages in ' + n + ' parts of the menu: ' + groups.map((g) => en(g.name) + ' (' + g.count + ')').join(', ') + '.', total + ' σελίδες σε ' + n + ' μέρη του μενού: ' + groups.map((g) => el(g.name) + ' (' + g.count + ')').join(', ') + '.'];
    const rows = [head].concat(items.map((it) => [en(groups[it.group].name) + ': ' + en(it.name) + (en(it.desc) ? '. ' + en(it.desc) : ''), el(groups[it.group].name) + ': ' + el(it.name) + (el(it.desc) ? '. ' + el(it.desc) : '')]));
    return { id: 'sitemap', available: true, empty: null, root: input.root || 'Kleanthis', groups, items, totals: { groups: n, pages: total }, step: STEP, hold: HOLD, duration, textRows: rows, ariaLabel: head };
  }
  // what the run looks like at time T: how many pages are out, which one is the newest, which group is open
  function at(model, T) {
    if (!model.available) return { shown: 0, current: -1, group: -1, perGroup: [] };
    let shown = 0; for (const it of model.items) { if (it.at <= T) shown++; else break; }
    const current = shown - 1, done = T >= model.duration - 3600 + 1;
    let group = -1; for (const g of model.groups) { if (T >= g.start - 300) group = g.i; }
    const perGroup = model.groups.map((g) => Math.max(0, Math.min(g.count, shown - g.first)));
    return { shown, current, group: done ? -1 : group, perGroup, done };
  }
  return { build, at, STEP, HOLD, END };
});
