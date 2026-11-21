/*
  Data Vortex data (pure, tested by tests/stack/vortex_test.js). One model per data set, built from the answers of /api/stack/<id>.
  Every sphere is one real record. Nothing is sampled or invented: when a number is shown it is a count or a sum of the
  records on the screen. Same model shape as the Nemesis Data Vortex:
    model = { id, n:[en,el], unit:[en,el], note:[en,el], bandsTitle, groupsTitle, sizeNote|null, asOf, total, measure|null,
              bands:[{k,n,c}], groups:[{k,n,count,rest?}], items:[{b, g, s (size 0..1), v (raw size number), t, sub, d, href, ext}] }
  Works as a browser script (window.SC.vortexData) and as a CommonJS module for the tests.
*/
(function (root) {
  'use strict';
  const PAL = ['#F472B6', '#7DA2FF', '#8FE39A', '#C4A1FF', '#FBBF24', '#5EEAD4', '#FDA4AF', '#93C5FD', '#D9F99D', '#FCA5A5', '#A5B4FC', '#FDE68A'];
  const SET_COL = { ev: '#8de4c0', crossings: '#ffb3d1', flood: '#6ec8ff', quakes: '#ffd678' };
  const cut = (s, n = 160) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const https = (u) => (/^https?:\/\//.test(String(u || '')) ? String(u) : null);
  const OTHER = '__other';

  // Groups sorted by size. Every record stays selectable: up to `max` groups are listed, any beyond that are gathered into
  // one bucket whose label says how many groups it holds (rest = that number, so the numbers panel counts them honestly).
  function groupsOf(items, name, max = 60) {
    const m = new Map(); for (const it of items) m.set(it.g, (m.get(it.g) || 0) + 1);
    const all = [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    const out = all.slice(0, max).map(([k, count]) => ({ k, n: name(k), count }));
    if (all.length > max) {
      const rest = new Set(all.slice(max).map(([k]) => k)); let count = 0;
      for (const it of items) if (rest.has(it.g)) { it.g = OTHER; count++; }
      out.push({ k: OTHER, n: ['Other groups (' + rest.size + ')', 'Άλλες ομάδες (' + rest.size + ')'], count, rest: rest.size });
    }
    return out;
  }
  // size 0..1 for the sphere, and the raw number kept on the item (it.v) so the numbers panel can add it up
  function scale(items, raw) {
    let mx = 0; for (const v of raw) if (v > mx) mx = v;
    items.forEach((it, i) => { it.v = raw[i] || 0; it.s = mx > 0 ? Math.sqrt(Math.max(0, raw[i]) / mx) : 0; });
  }
  const STACK = '#/stack';

  const TOWN = { Lefkosia: ['Lefkosia', 'Λευκωσία'], Limassol: ['Limassol', 'Λεμεσός'], Larnaka: ['Larnaka', 'Λάρνακα'], Paphos: ['Paphos', 'Πάφος'], Pafos: ['Paphos', 'Πάφος'], Ammochostos: ['Famagusta', 'Αμμόχωστος'] };
  const townName = (k) => TOWN[k] || [String(k), String(k)];
  const NO_TOWN = ['Away from the four centres', 'Μακριά από τα τέσσερα κέντρα'];

  // ---- one model per data set -------------------------------------------------------------------------------------
  function evModel(d) {
    const f = (d && d.features) || [], raw = [];
    const items = f.map((x) => { raw.push(x.connectors || 0); return { b: x.current === 'DC' || x.current === 'AC' ? x.current : 'none', g: x.operator || '—', s: 0, t: cut(x.name || '—'), sub: [(x.connectors || 0) + (x.connectors === 1 ? ' connector' : ' connectors') + ' · ' + (x.current || 'type not stated'), (x.connectors || 0) + ' πρήζες · ' + (x.current || 'χωρίς τύπο')], d: '', href: STACK + '?solo=ev', ext: false }; });
    scale(items, raw);
    const used = new Set(items.map((i) => i.b));
    return { id: 'ev', n: ['EV charging points', 'Σημεία φόρτισης'], unit: ['charging points', 'σημεία φόρτισης'], total: items.length, asOf: (d && d.publishedAt) || null,
      measure: { n: ['Connectors at these points', 'Πρίζες σε αυτά τα σημεία'], kind: 'int', top: ['Most connectors at one point', 'Περισσότερες πρίζες σε ένα σημείο'] },
      bandsTitle: ['Current type', 'Είδος ρεύματος'], groupsTitle: ['Operator', 'Φορέας λειτουργίας'], sizeNote: ['Size: connectors at the point', 'Μέγεθος: πρίζες στο σημείο'],
      note: ['The published inventory of charging points. It does not say whether a charger is free or working.', 'Το δημοσιευμένο αποθεματικό σημείων φόρτισης. Δεν λέει αν ένας φορτιστής είναι ελεύθερος ή λειτουργεί.'],
      bands: [{ k: 'AC', n: ['AC (slower)', 'AC (αργός)'], c: PAL[5] }, { k: 'DC', n: ['DC (fast)', 'DC (γρήγορος)'], c: PAL[4] }, ...(used.has('none') ? [{ k: 'none', n: ['Type not stated', 'Χωρίς τύπο'], c: '#CBD5E1' }] : [])].filter((b) => used.has(b.k)),
      groups: groupsOf(items, (k) => [String(k), String(k)]), items };
  }

  function crossingsModel(d) {
    const f = (d && d.features) || [];
    const items = f.map((x) => ({ b: x.near || 'none', g: x.near || 'none', s: 0.3, v: 0, t: cut(x.label || x.name || ('Crossing at ' + Number(x.lat).toFixed(4) + ', ' + Number(x.lng).toFixed(4))), sub: [x.near ? 'Within 5 km of the ' + townName(x.near)[0] + ' centre' : NO_TOWN[0], x.near ? 'Έως 5 km από το κέντρο: ' + townName(x.near)[1] : NO_TOWN[1]], d: '', href: STACK + '?solo=crossings', ext: false }));
    const used = new Set(items.map((i) => i.b)), order = ['Lefkosia', 'Limassol', 'Larnaka', 'Paphos', 'none'];
    return { id: 'crossings', n: ['Pedestrian crossings', 'Διαβάσεις πεζών'], unit: ['crossings with signals', 'διαβάσεις με φωτεινή σήμανση'], total: items.length, asOf: (d && (d.publishedAt || d.retrievedAt)) || null,
      measure: null,
      bandsTitle: ['Near which city centre', 'Κοντά σε ποιο κέντρο'], groupsTitle: ['Within 5 km of', 'Έως 5 km από'], sizeNote: null,
      note: ['Every signal-controlled crossing in the published inventory. The town is the city centre within 5 km in a straight line, if there is one. This is not a measure of safety.', 'Κάθε διάβαση με φωτεινή σήμανση στο δημοσιευμένο αποθεματικό. Η πόλη είναι το κέντρο που βρίσκεται έως 5 km ευθεία γραμμή, αν υπάρχει. Δεν είναι μέτρο ασφάλειας.'],
      bands: order.filter((k) => used.has(k)).map((k, i) => ({ k, n: k === 'none' ? NO_TOWN : townName(k), c: k === 'none' ? '#CBD5E1' : PAL[i] })),
      groups: groupsOf(items, (k) => (k === 'none' ? NO_TOWN : townName(k))), items };
  }

  function floodModel(d) {
    const f = (d && d.features) || [], raw = [];
    const items = f.map((x) => { const p = (x.polygons && x.polygons.q100) || 0; raw.push(p); return { b: x.identifiedYear ? 'y' + x.identifiedYear : 'none', g: x.district || 'none', s: 0, t: cut(x.name || x.code || '—'), sub: [(x.code || '') + ' · identified ' + (x.identifiedYear || 'year not stated') + ' · ' + p + ' polygons of the 100-year flood', (x.code || '') + ' · αναγνωρίστηκε ' + (x.identifiedYear || 'χωρίς έτος') + ' · ' + p + ' πολύγωνα πλημμύρας 100 ετών'], d: '', href: STACK + '?solo=flood', ext: false }; });
    scale(items, raw);
    const years = [...new Set(items.map((i) => i.b))].sort();
    return { id: 'flood', n: ['Flood-risk river reaches', 'Τμήματα ποταμών με κίνδυνο πλημμύρας'], unit: ['river reaches', 'τμήματα ποταμών'], total: items.length, asOf: (d && (d.publishedAt || d.retrievedAt)) || null,
      measure: { n: ['Polygons of the 100-year flood touching these reaches', 'Πολύγωνα πλημμύρας 100 ετών που αγγίζουν αυτά τα τμήματα'], kind: 'int', top: ['Reach with the most', 'Τμήμα με τα περισσότερα'] },
      bandsTitle: ['Year the reach was identified', 'Έτος αναγνώρισης του τμήματος'], groupsTitle: ['District', 'Επαρχία'], sizeNote: ['Size: polygons of the 100-year flood touching the reach', 'Μέγεθος: πολύγωνα πλημμύρας 100 ετών που αγγίζουν το τμήμα'],
      note: ['Designated river reaches with modelled flood scenarios. These are model maps, not a flood that happened and not a forecast.', 'Ορισμένα τμήματα ποταμών με μοντελοποιημένα σενάρια πλημμύρας. Είναι χάρτες μοντέλου, όχι πλημμύρα που συνέβη και όχι πρόβλεψη.'],
      bands: years.map((k, i) => ({ k, n: k === 'none' ? ['Year not stated', 'Χωρίς έτος'] : [k.slice(1), k.slice(1)], c: k === 'none' ? '#CBD5E1' : PAL[(i * 3 + 1) % PAL.length] })),
      groups: groupsOf(items, (k) => (k === 'none' ? ['District not stated', 'Χωρίς επαρχία'] : townName(k))), items };
  }

  function quakesModel(d) {
    const f = (d && d.features) || [], raw = [];
    const items = f.map((x) => { raw.push(Math.max(0, Number(x.magnitude) || 0)); const day = String(x.time || '').slice(0, 10); return { b: (Number(x.magnitude) || 0) >= 5 ? 'm5' : 'm45', g: day.slice(0, 4) || 'none', s: 0, t: cut(x.place || x.id || '—'), sub: ['Magnitude ' + x.magnitude + ' · depth ' + x.depthKm + ' km', 'Μέγεθος ' + x.magnitude + ' · βάθος ' + x.depthKm + ' km'], d: /^\d{4}-\d\d-\d\d$/.test(day) ? day : '', href: https(x.url), ext: true }; });
    scale(items, raw);
    const used = new Set(items.map((i) => i.b));
    return { id: 'quakes', n: ['Earthquakes since 2015', 'Σεισμοί από το 2015'], unit: ['earthquakes', 'σεισμοί'], total: items.length, asOf: null,
      measure: { n: ['Sum of magnitudes (only to size the spheres)', 'Άθροισμα μεγεθών (μόνο για το μέγεθος των σφαιρών)'], kind: 'int', top: ['Strongest', 'Ισχυρότερος'] },
      bandsTitle: ['Magnitude', 'Μέγεθος'], groupsTitle: ['Year', 'Έτος'], sizeNote: ['Size: magnitude', 'Μέγεθος: μέγεθος σεισμού'],
      note: ['Earthquakes of magnitude 4.5 and above in a box around Cyprus, from the US Geological Survey. The box also covers sea. A list of the past, not a live feed.', 'Σεισμοί μεγέθους 4,5 και άνω σε πλαίσιο γύρω από την Κύπρο, από την Γεωλογική Υπηρεσία των ΗΠΑ. Το πλαίσιο καλύπτει και θάλασσα. Λίστα του παρελθόντος, όχι ζωντανή ροή.'],
      bands: [{ k: 'm45', n: ['4.5 to 4.9', '4,5 έως 4,9'], c: PAL[4] }, { k: 'm5', n: ['5.0 and above', '5,0 και άνω'], c: PAL[0] }].filter((b) => used.has(b.k)),
      groups: groupsOf(items, (k) => (k === 'none' ? ['Year not stated', 'Χωρίς έτος'] : [k, k])).sort((a, b) => String(a.k).localeCompare(String(b.k))), items };
  }

  // All data sets in one funnel: one band per data set, the groups are the data sets themselves.
  function allModel(models) {
    const ms = models.filter((m) => m && m.items && m.items.length), items = [], bands = [];
    ms.forEach((m) => {
      bands.push({ k: m.id, n: m.n, c: SET_COL[m.id] || PAL[bands.length] });
      m.items.forEach((it) => items.push({ b: m.id, g: m.id, s: 0.3, v: 0, t: it.t, sub: it.sub, d: it.d || '', href: it.href, ext: it.ext }));
    });
    return { id: 'all', n: ['All data sets', 'Όλα τα συνόλα'], unit: ['records', 'εγγραφές'], total: items.length, asOf: null, measure: null,
      bandsTitle: ['Data set', 'Σύνολο δεδομένων'], groupsTitle: ['Data set', 'Σύνολο δεδομένων'], sizeNote: null,
      note: ['Every record of the data sets that come as a list of single records, one sphere each. Layers that are readings or grids (wind, air, waves, clouds, the weather stations, aeroplanes) are not lists of records and are not here.', 'Κάθε εγγραφή των συνόλων που έρχονται ως λίστα μεμονωμένων εγγραφών, μία σφαίρα η καθεμία. Τα στρώματα με μετρήσεις ή πλέγματα (άνεμος, αέρας, κύματα, σύννεφα, μετεωρολογικοί σταθμοί, αεροπλάνα) δεν είναι λίστες εγγραφών και δεν είναι εδώ.'],
      bands, groups: ms.map((m) => ({ k: m.id, n: m.n, count: m.items.length })), items };
  }

  const VIEWS = ['all', 'ev', 'crossings', 'flood', 'quakes'];
  // data set -> the /api/stack answer it is built from
  const SOURCE = { ev: 'ev-charging', crossings: 'crossings', flood: 'flood-reaches', quakes: 'earthquakes' };
  const BUILD = { ev: evModel, crossings: crossingsModel, flood: floodModel, quakes: quakesModel };

  // Layout: a funnel. Bands stack from the top (first band) to the tip (last band), each given height in proportion to its
  // share of the records (with a floor so a small band stays visible). Deterministic: the same data gives the same picture.
  function layout(model, seed) {
    let s = seed || 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const n = model.items.length || 1, counts = new Map(); for (const it of model.items) counts.set(it.b, (counts.get(it.b) || 0) + 1);
    const live = model.bands.filter((b) => counts.get(b.k));
    const w = live.map((b) => Math.max(0.07, counts.get(b.k) / n)), sum = w.reduce((a, b) => a + b, 0);
    const span = new Map(); let at = 0; live.forEach((b, i) => { const h = w[i] / sum; span.set(b.k, [at, at + h]); at += h; });
    return model.items.map((it) => {
      const sp = span.get(it.b) || [0, 1], f = sp[0] + (sp[1] - sp[0]) * rnd();
      const rad = Math.pow(1 - f, 1.25) * 330 + 26, ang = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.62) * rad;
      return { x: Math.cos(ang) * rr, y: -360 + f * 720 + (rnd() - 0.5) * 18, z: Math.sin(ang) * rr, ph: rnd() * 6.283, f };
    });
  }

  // Numbers for the side panel (pure): what the picture shows, counted. groupKey null = the whole data set.
  // Every figure is a count or a sum of the records on screen; nothing is estimated.
  function stats(model, groupKey) {
    const its = groupKey == null ? model.items : model.items.filter((x) => x.g === groupKey);
    const n = its.length, total = model.items.length, cnt = new Map(); for (const x of its) cnt.set(x.b, (cnt.get(x.b) || 0) + 1);
    const bands = model.bands.filter((b) => cnt.get(b.k)).map((b) => ({ k: b.k, n: b.n, c: b.c, count: cnt.get(b.k), pct: n ? (100 * cnt.get(b.k)) / n : 0 }));
    const dates = its.map((x) => x.d).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort();
    let measure = null;
    if (model.measure) {
      let sum = 0, top = null;
      for (const x of its) { const v = x.v || 0; sum += v; if (v > 0 && (!top || v > top.v)) top = x; }
      measure = { n: model.measure.n, kind: model.measure.kind, sum, top: model.measure.top && top ? { label: model.measure.top, t: top.t, v: top.v } : null };
    }
    // the 'Other' bucket stands for several small groups: count them all, and never call the bucket the largest group
    const groups = model.groups.reduce((a, g) => a + (g.rest || 1), 0), biggest = model.groups.find((g) => !g.rest) || null;
    return { n, total, share: total ? (100 * n) / total : 0, bands, dated: dates.length, undated: n - dates.length, first: dates[0] || null, last: dates[dates.length - 1] || null, measure, groups, biggest };
  }

  const api = { VIEWS, SOURCE, BUILD, SET_COL, OTHER, evModel, crossingsModel, floodModel, quakesModel, allModel, layout, stats, groupsOf, scale };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.vortexData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
