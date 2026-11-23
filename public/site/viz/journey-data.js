/*
  journey-data.js: the model for the Data Journey board: where each data sheet comes from, what the site knows about it now,
  and which pages of the site show it. Pure: no DOM, no clock (the caller passes `now`), no network.
  build({catalogue, sheets: {id: answer|null}}, now) -> { sheets[], publishers[], pages[], totals, textRows, ariaLabel }.
  - catalogue is the answer of /api/stack, each sheet answer is /api/stack/<id>.
  - USES says which page shows which sheet. It is NOT measured: it is written down from the site's code (the test checks every
    entry against the page's source file), and the board says "as wired in the site".
  Nothing is ranked: sheets stay in catalogue order, pages in menu order, publishers in order of first appearance.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./countcards-data.js'));
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.journeyData = factory(root.SC.viz.countcardsData); }
})(typeof self !== 'undefined' ? self : this, function (CC) {
  'use strict';
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const PAGES = [
    { id: 'stack', title: ['The data stack in 3D', 'Η στοίβα δεδομένων σε 3D'], file: 'public/stack-app.js', uses: 'all' },
    { id: 'layers', title: ['Data layers', 'Στρώματα δεδομένων'], file: 'public/site/pages/layers.js', uses: ['crossings', 'drought'] },
    { id: 'vortex', title: ['Data Vortex', 'Data Vortex'], file: 'public/site/vortexdata.js', uses: ['ev-charging', 'crossings', 'flood-reaches', 'earthquakes'] },
    { id: 'wall', title: ['Data Wall', 'Data Wall'], file: 'public/site/pages/wall.js', uses: 'all' },
    { id: 'flow', title: ['Data Flow', 'Data Flow'], file: 'public/site/pages/flow.js', via: 'public/site/vortexdata.js', uses: ['ev-charging', 'crossings', 'flood-reaches', 'earthquakes'], plus: 'updating' },
    { id: 'live', title: ['Live Board', 'Live Board'], file: 'public/site/pages/live.js', uses: ['met-stations', 'airports', 'air-stations', 'fire-hotspots', 'earthquakes'] },
  ];
  const updating = (s) => s && (s.live === true || s.kind === 'live' || s.kind === 'scheduled' || s.kind === 'delayed' || s.kind === 'periodic');
  const pairOf = (v, fb) => (Array.isArray(v) && v.length === 2 ? [String(v[0]), String(v[1])] : typeof v === 'string' && v ? [v, v] : fb);
  function ageText(s) { if (!isNum(s)) return null; if (s < 90) return ['just now', 'μόλις τώρα']; const m = Math.round(s / 60); if (m < 90) return [m + ' min ago', 'πριν από ' + m + ' λεπτά']; const h = Math.round(m / 60); if (h < 48) return [h + ' h ago', 'πριν από ' + h + ' ώρες']; const d = Math.round(h / 24); return [d + ' days ago', 'πριν από ' + d + ' μέρες']; }
  const KIND = { live: ['live', 'ζωντανό'], scheduled: ['scheduled', 'προγραμματισμένο'], delayed: ['delayed', 'με καθυστέρηση'], periodic: ['refreshed periodically', 'ανανεώνεται περιοδικά'] };

  function build(input, now) {
    input = input || {}; const cat = input.catalogue, answers = input.sheets || {};
    const list = cat && Array.isArray(cat.sheets) ? cat.sheets : [];
    if (!list.length) { const e = ['The list of data sheets could not be loaded.', 'Η λίστα των φύλλων δεδομένων δεν φόρτωσε.']; return { id: 'journey', available: false, empty: e, sheets: [], publishers: [], pages: [], totals: { sheets: 0, answered: 0, records: 0, pages: 0, links: 0, publishers: 0 }, textRows: [e], ariaLabel: e }; }
    const pubs = [], pubIx = {};
    const sheets = list.map((s, i) => {
      const a = answers[s.id] || null, ok = !!(a && a.available !== false), title = pairOf(s.title, [s.id, s.id]);
      let count = null; if (ok && CC && CC.recordCount) { try { const rc = CC.recordCount(a); count = rc && isNum(rc.count) ? rc.count : null; } catch (e) { count = null; } }
      const stamp = a ? (a.updated || a.retrieved || a.generated || null) : null, t = stamp ? Date.parse(stamp) : NaN, upd = updating(s);
      const age = ok && upd && isNum(t) && isNum(now) ? ageText(Math.max(0, Math.round((now - t) / 1000))) : null;
      const reason = ok ? null : pairOf(a && a.reason, ['not answering right now', 'δεν απαντά αυτή τη στιγμή']);
      const pubName = a ? pairOf(a.source, null) : null; let pub = -1;
      // two sheets may cite one publisher with different wording: they are joined on the name before the first comma, bracket or colon
      if (pubName) { const cut = (t) => String(t).split(/[,(:]/)[0].trim(), key = cut(pubName[0]).toLowerCase(); if (!(key in pubIx)) { pubIx[key] = pubs.length; pubs.push({ name: [cut(pubName[0]), cut(pubName[1])], cited: [], sheets: [] }); } pub = pubIx[key]; pubs[pub].sheets.push(i); if (pubs[pub].cited.indexOf(pubName[0]) < 0) pubs[pub].cited.push(pubName[0]); }
      const kind = upd ? (KIND[s.kind] || KIND.live) : ['fixed by design', 'σταθερό εξ σχεδίου'];
      const status = !ok ? reason : [(count == null ? 'answered' : count + ' records') + (age ? ', ' + age[0] : '') + (a.demo ? ' (test values)' : ''), (count == null ? 'απάντησε' : count + ' εγγραφές') + (age ? ', ' + age[1] : '') + (a.demo ? ' (δοκιμαστικές τιμές)' : '')];
      return { i, id: s.id, title, band: s.band || '', kind, updating: upd, available: ok, demo: !!(a && a.demo), reason, count, age, publisher: pub, status, pages: [] };
    });
    const byId = {}; sheets.forEach((s) => { byId[s.id] = s; });
    const pages = PAGES.map((p, k) => { const ids = p.uses === 'all' ? sheets.map((s) => s.id) : p.uses.slice(); if (p.plus === 'updating') sheets.forEach((s) => { if (s.updating && ids.indexOf(s.id) < 0) ids.push(s.id); });
      const ix = ids.filter((id) => byId[id]).map((id) => byId[id].i).sort((a, b) => a - b); ix.forEach((i) => sheets[i].pages.push(k));
      return { k, id: p.id, title: p.title, sheets: ix, answered: ix.filter((i) => sheets[i].available).length }; });
    const answered = sheets.filter((s) => s.available);
    const totals = { sheets: sheets.length, answered: answered.length, records: answered.reduce((n, s) => n + (s.count || 0), 0), pages: pages.length, links: pages.reduce((n, p) => n + p.sheets.length, 0), publishers: pubs.length, demo: sheets.some((s) => s.demo) };
    const head = [totals.answered + ' of ' + totals.sheets + ' data sheets answered, from ' + totals.publishers + ' publishers, holding ' + totals.records + ' records. They feed ' + totals.pages + ' pages of the site through ' + totals.links + ' links, as wired in the site.',
      totals.answered + ' από ' + totals.sheets + ' φύλλα δεδομένων απάντησαν, από ' + totals.publishers + ' εκδότες, με ' + totals.records + ' εγγραφές. Τροφοδοτούν ' + totals.pages + ' σελίδες του ιστοτόπου μέσα από ' + totals.links + ' συνδέσεις, όπως είναι καλωδιωμένος ο ιστότοπος.'];
    const rows = [head].concat(sheets.map((s) => [s.title[0] + ' (' + s.kind[0] + '): ' + s.status[0] + (s.publisher >= 0 ? '. Publisher: ' + pubs[s.publisher].name[0] : '') + '. Shown on: ' + s.pages.map((k) => pages[k].title[0]).join(', ') + '.', s.title[1] + ' (' + s.kind[1] + '): ' + s.status[1] + (s.publisher >= 0 ? '. Εκδότης: ' + pubs[s.publisher].name[1] : '') + '. Φαίνεται στο: ' + s.pages.map((k) => pages[k].title[1]).join(', ') + '.']));
    rows.push(['Which page shows which sheet is written down from the site’s code. It is not a measurement of who looked at what.', 'Το ποια σελίδα δείχνει ποιο φύλλο γράφτηκε από τον κώδικα του ιστοτόπου. Δεν είναι μέτρηση του ποιος είδε τι.']);
    return { id: 'journey', available: true, empty: null, sheets, publishers: pubs, pages, totals, textRows: rows, ariaLabel: head,
      stages: [['Collect', 'Συλλογή'], ['Check', 'Έλεγχος'], ['Label', 'Ετικέτα'], ['Show', 'Προβολή']] };
  }
  return { build, PAGES, updating };
});
