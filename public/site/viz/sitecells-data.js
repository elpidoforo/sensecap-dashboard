/*
  Site cells data (pure, tested by tests/viz/sitecells_test.js). Built from the answer of /api/stack/bathing-water:
  `features` = bathing sites with id, name, lat, lng and `label` (the class reported for one whole bathing season).
  One cell per site, grouped by the reported label. Every number is a count made here, never in the drawing code.
    - The sheet's note is followed to the letter: no score, no "safe" badge, and a site without a label for the season is
      its own group, "no label for this season". Nothing is guessed for it.
    - Groups follow the reported class code (the number the label itself starts with); the no-label group comes last.
      Inside a group the sites are in alphabetical order of name. Sites are never ranked.
    - Each group has its own shape (glyph) as well as its own colour, so colour is never the only cue.
  model = { id, title, available, empty|null, season|null, seasonText|null, published|null, strings:{...pairs},
            groups:[{key, label|null (as reported), labelText:[en,el], glyph, tone (hex), count, heading:[en,el], from, to}],
            sites:[site] (in drawing order: group by group, alphabetical inside), counts:{sites, labelled, unlabelled, text},
            legend:[[en,el]], note|null, honesty|null, source|null, asOf|null, ariaLabel, textRows }
  site  = { id, name, label|null, labelText:[en,el], group (index into groups), search (name folded for matching), sentence:[en,el] }
  match(model, text) -> { query, active (bool), count, total, on:[bool per site, drawing order], text:[en,el]|null }
     case-insensitive and accent-insensitive "name contains text"; empty text matches every site.
  Every visible string is a pair [english, greek]. Works as a browser script (window.SC.viz.sitecellsData) and as CommonJS.
*/
(function (root) {
  'use strict';
  const TITLE = ['Bathing sites by reported label', 'Σημεία κολύμβησης ανά αναφερόμενη ετικέτα'];
  const EMPTY = ['No bathing water labels are available right now.', 'Δεν υπάρχουν διαθέσιμες ετικέτες νερών κολύμβησης αυτή τη στιγμή.'];
  const NO_LABEL = ['no label for this season', 'χωρίς ετικέτα για αυτή την περίοδο'];
  // the wording of the reported classes in Greek; an unknown class is shown as the sheet gives it. Each has its own shape.
  const KNOWN = {
    excellent: { el: 'Εξαιρετική', glyph: 'circle', tone: '#7DD3FC' },
    good: { el: 'Καλή', glyph: 'square', tone: '#A5B4FC' },
    sufficient: { el: 'Επαρκής', glyph: 'triangle', tone: '#FBBF24' },
    poor: { el: 'Ανεπαρκής', glyph: 'diamond', tone: '#D8B4FE' },
    'not classified': { el: 'Χωρίς ταξινόμηση', glyph: 'hexagon', tone: '#FDA4AF' },
  };
  const SPARE = ['plus', 'bars', 'ring', 'cross'];
  const S = {
    noLabel: NO_LABEL,
    hint: ['Point at a cell, or use the arrow keys, to read one site.', 'Δείξε ένα κελί, ή χρησιμοποίησε τα βέλη, για να διαβάσεις ένα σημείο.'],
    order: ['Inside a group the sites are in alphabetical order of name. Nothing is ranked.', 'Μέσα σε κάθε ομάδα τα σημεία είναι σε αλφαβητική σειρά ονόματος. Τίποτα δεν κατατάσσεται.'],
    cue: ['Each label has its own shape as well as its own colour.', 'Κάθε ετικέτα έχει το δικό της σχήμα, εκτός από το δικό της χρώμα.'],
    noMatch: ['No site name matches.', 'Κανένα όνομα σημείου δεν ταιριάζει.'],
  };
  const pair = (p, fb) => (Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null ? [String(p[0]), String(p[1])] : [String(fb), String(fb)]);
  const clean = (p) => [p[0].replace(/[«»]/g, '"'), p[1].replace(/[«»]/g, '"')];
  const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/\s+/g, ' ').trim();
  const nSites = (n) => [n === 1 ? '1 site' : n + ' sites', n === 1 ? '1 σημείο' : n + ' σημεία'];
  const byName = (a, b) => { const x = a.search, y = b.search; return x < y ? -1 : x > y ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); };

  function emptyModel(why) {
    const e = why || EMPTY;
    return { id: 'sitecells', title: TITLE, available: false, empty: e, season: null, seasonText: null, published: null, strings: S, groups: [], sites: [],
      counts: { sites: 0, labelled: 0, unlabelled: 0, text: null }, legend: [], note: null, honesty: null, source: null, asOf: null, ariaLabel: e, textRows: [e] };
  }

  function build(ans) {
    if (!ans || ans.available === false || !Array.isArray(ans.features)) return emptyModel();
    const feats = ans.features.filter((f) => f && typeof f === 'object');
    if (!feats.length) return emptyModel();
    const season = ans.period != null && String(ans.period).trim() !== '' ? String(ans.period).trim() : null;
    const seasonText = season ? ['Bathing season ' + season, 'Κολυμβητική περίοδος ' + season] : ['One bathing season', 'Μία κολυμβητική περίοδος'];
    const note = ans.note ? clean(pair(ans.note, '')) : null, honesty = ans.honesty ? clean(pair(ans.honesty, '')) : null, source = ans.source ? clean(pair(ans.source, '')) : null;
    const published = ans.published ? String(ans.published) : null;
    // sites into groups by the label exactly as reported
    const map = new Map(), used = new Set();
    feats.forEach((f, i) => {
      let id = String(f.id != null && f.id !== '' ? f.id : 'site-' + (i + 1)); while (used.has(id)) id += '-' + (i + 1); used.add(id);
      const name = f.name != null && String(f.name).trim() !== '' ? String(f.name).trim().replace(/[«»]/g, '"') : id;
      const label = typeof f.label === 'string' && f.label.trim() !== '' ? f.label.trim() : (typeof f.label === 'number' && Number.isFinite(f.label) ? String(f.label) : null);
      const key = label == null ? '' : label;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ id, name, label, search: fold(name) });
    });
    const spare = SPARE.slice();
    const groups = Array.from(map.keys()).map((key) => {
      if (key === '') return { key: '(none)', label: null, code: Infinity, word: '', labelText: NO_LABEL, glyph: 'dash', tone: '#94A3B8' };
      const m = /^\s*(\d+)\s*[-–:.]\s*(.+)$/.exec(key), word = (m ? m[2] : key).trim().replace(/[«»]/g, '"'), k = KNOWN[word.toLowerCase()];
      return { key, label: key, code: m ? Number(m[1]) : 1e9, word, labelText: [word, k ? k.el : word], glyph: k ? k.glyph : null, tone: k ? k.tone : '#CBD5E1' };
    }).sort((a, b) => a.code - b.code || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
    for (const g of groups) if (!g.glyph) g.glyph = spare.length > 1 ? spare.shift() : spare[0];
    const sites = [];
    groups.forEach((g, gi) => {
      const list = map.get(g.label == null ? '' : g.key).sort(byName);
      g.count = list.length; g.from = sites.length; g.to = sites.length + list.length;
      const c = nSites(g.count); g.heading = [g.labelText[0] + ' · ' + c[0], g.labelText[1] + ' · ' + c[1]];
      for (const s of list) {
        s.group = gi; s.labelText = g.labelText;
        s.sentence = s.label == null ? [s.name + ': ' + NO_LABEL[0], s.name + ': ' + NO_LABEL[1]]
          : [s.name + ': ' + g.labelText[0] + ' (label reported for ' + (season ? 'bathing season ' + season : 'the season') + ')', s.name + ': ' + g.labelText[1] + ' (ετικέτα που αναφέρθηκε για ' + (season ? 'την κολυμβητική περίοδο ' + season : 'την περίοδο') + ')'];
        sites.push(s);
      }
      delete g.code; delete g.word;
    });
    const unlabelled = sites.filter((s) => s.label == null).length, total = sites.length, c = nSites(total);
    const countText = [c[0] + ': ' + (total - unlabelled) + ' with a reported label, ' + unlabelled + ' with no label for this season.',
      c[1] + ': ' + (total - unlabelled) + ' με αναφερόμενη ετικέτα, ' + unlabelled + ' χωρίς ετικέτα για αυτή την περίοδο.'];
    const legend = [S.cue, S.order];
    const head = [seasonText[0] + ': one cell per bathing site, grouped by the label reported for the whole season.', seasonText[1] + ': ένα κελί ανά σημείο κολύμβησης, ομαδοποιημένα κατά την ετικέτα που αναφέρθηκε για ολόκληρη την περίοδο.'];
    const textRows = [head, countText];
    for (const g of groups) { textRows.push(g.heading); for (let i = g.from; i < g.to; i++) textRows.push([sites[i].name + ': ' + g.labelText[0], sites[i].name + ': ' + g.labelText[1]]); }
    textRows.push(S.cue, S.order);
    if (note) textRows.push(note);
    if (honesty) textRows.push(honesty);
    if (source) textRows.push(['Source: ' + source[0], 'Πηγή: ' + source[1]]);
    if (published) textRows.push(['Published: ' + published, 'Δημοσίευση: ' + published]);
    const gl = [groups.map((g) => g.heading[0]).join('; '), groups.map((g) => g.heading[1]).join('; ')];
    const ariaLabel = [head[0] + ' ' + gl[0] + '. ' + (honesty ? honesty[0] + '. ' : '') + S.order[0], head[1] + ' ' + gl[1] + '. ' + (honesty ? honesty[1] + '. ' : '') + S.order[1]];
    return { id: 'sitecells', title: TITLE, available: true, empty: null, season, seasonText, published, strings: S, groups, sites,
      counts: { sites: total, labelled: total - unlabelled, unlabelled, text: countText }, legend, note, honesty, source, asOf: season || ans.retrieved || null, ariaLabel, textRows };
  }

  function match(model, text) {
    const sites = (model && model.sites) || [], total = sites.length, q = fold(text);
    if (!q) return { query: '', active: false, count: total, total, on: sites.map(() => true), text: null };
    const on = sites.map((s) => s.search.indexOf(q) >= 0), count = on.filter(Boolean).length, shown = String(text).trim().replace(/[«»"]/g, '');
    return { query: q, active: true, count, total, on,
      text: count ? [count + ' of ' + total + ' site names contain "' + shown + '".', count + ' από ' + total + ' ονόματα σημείων περιέχουν "' + shown + '".'] : S.noMatch };
  }

  const api = { build, match, emptyModel, fold, EMPTY, NO_LABEL };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.sitecellsData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
