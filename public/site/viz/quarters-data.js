/*
  quarters-data.js: the model for the "quarters" widget (neighbourhoods of the four city centres, one city at a time).
  Pure: no DOM, no clock, no network. Input is public/site/data/quarters.json (census 2021 by quarter, CYSTAT; quarter
  boundaries, Department of Lands and Surveys; land-cover pixels, ESA WorldCover 2021). Every share is computed here from
  the two counts it is made of, and both counts travel with it. A quarter with no census figure stays null (never 0).
  Cities are never drawn together and nothing is ranked: quarters are listed in alphabetical order.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.quartersData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CITIES = [['Lefkosia', ['Lefkosia (Nicosia)', 'Λευκωσία']], ['Lemesos', ['Lemesos (Limassol)', 'Λεμεσός']], ['Larnaka', ['Larnaka', 'Λάρνακα']], ['Pafos', ['Pafos', 'Πάφος']]];
  const MEASURES = [
    { k: 'old', name: ['Residents aged 65 and over', 'Κάτοικοι 65 ετών και άνω'], of: ['of residents', 'των κατοίκων'] },
    { k: 'tree', name: ['Ground classed as tree cover', 'Έδαφος στην κατηγορία δενδροκάλυψης'], of: ['of the 10 m pixels', 'των εικονοστοιχείων 10 μ.'] },
  ];
  const EMPTY = ['The neighbourhood data could not be loaded.', 'Τα δεδομένα των ενοριών δεν φόρτωσαν.'];
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const pct = (a, b) => (isNum(a) && isNum(b) && b > 0 ? (a / b) * 100 : null);
  const fmt = (v, d) => (v == null ? '–' : v.toFixed(d));
  const ceilTo = (v, step) => Math.max(step, Math.ceil(v / step) * step);

  function quarter(f) {
    const noCensus = !isNum(f.residents);
    const old = noCensus ? null : pct(f.age65plus, f.residents);
    const tree = pct(f.treePixels, f.validPixels), built = pct(f.builtPixels, f.validPixels);
    const oldEn = noCensus ? 'no census figure for this quarter' : f.residents === 0 ? 'no residents counted' : f.age65plus + ' of ' + f.residents + ' residents aged 65 and over (' + fmt(old, 2) + '%)';
    const oldEl = noCensus ? 'χωρίς στοιχείο απογραφής για αυτή την ενορία' : f.residents === 0 ? 'δεν καταγράφηκαν κάτοικοι' : f.age65plus + ' από ' + f.residents + ' κατοίκους ηλικίας 65 και άνω (' + fmt(old, 2) + '%)';
    const treeEn = tree == null ? 'no land-cover pixels' : 'tree class ' + f.treePixels + ' of ' + f.validPixels + ' pixels (' + fmt(tree, 3) + '%)';
    const treeEl = tree == null ? 'χωρίς εικονοστοιχεία κάλυψης γης' : 'κατηγορία δέντρων ' + f.treePixels + ' από ' + f.validPixels + ' εικονοστοιχεία (' + fmt(tree, 3) + '%)';
    return { code: f.code, name: f.name, residents: noCensus ? null : f.residents, age65plus: noCensus ? null : f.age65plus, noCensus, old, tree, built,
      validPixels: f.validPixels, treePixels: f.treePixels, builtPixels: f.builtPixels, polygons: f.polygons,
      oldText: [oldEn, oldEl], treeText: [treeEn, treeEl], label: [f.name + ': ' + oldEn + '; ' + treeEn + '.', f.name + ': ' + oldEl + '· ' + treeEl + '.'] };
  }

  // project one city's quarters into a 0..1 box, keeping the shape (longitude squeezed by the cosine of the latitude)
  function project(qs) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of qs) for (const poly of q.polygons) for (const p of poly[0]) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    if (!isFinite(x0)) return { aspect: 1 };
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), w = (x1 - x0) * k || 1e-9, h = (y1 - y0) || 1e-9;
    for (const q of qs) { q.shape = q.polygons.map((poly) => poly.map((ring) => ring.map((p) => [((p[0] - x0) * k) / w, 1 - (p[1] - y0) / h]))); delete q.polygons; }
    return { aspect: w / h };
  }

  function build(data, opts) {
    opts = opts || {};
    if (!data || !Array.isArray(data.features) || !data.features.length) return { id: 'quarters', available: false, empty: EMPTY, choices: [], cities: {}, textRows: [EMPTY], ariaLabel: EMPTY };
    const all = data.features.map(quarter);
    const maxOf = (k) => all.reduce((m, q) => (q[k] != null && q[k] > m ? q[k] : m), 0);
    // one fixed scale per measure for all four cities, so a colour means the same share whichever city is shown
    const scales = { old: { min: 0, max: ceilTo(maxOf('old'), 5) }, tree: { min: 0, max: ceilTo(maxOf('tree'), 5) } };
    const cities = {}, choices = [];
    for (const [key, name] of CITIES) {
      const qs = all.filter((q, i) => data.features[i].city === key).sort((a, b) => a.name.localeCompare(b.name, 'en'));
      if (!qs.length) continue;
      const box = project(qs);
      for (const q of qs) { q.tOld = q.old == null ? null : q.old / scales.old.max; q.tTree = q.tree == null ? null : q.tree / scales.tree.max; }
      const withCensus = qs.filter((q) => !q.noCensus).length;
      const count = [qs.length + ' quarters, ' + withCensus + ' with a census figure, ' + (qs.length - withCensus) + ' without.', qs.length + ' ενορίες, ' + withCensus + ' με στοιχείο απογραφής, ' + (qs.length - withCensus) + ' χωρίς.'];
      const view = { city: key, cityName: name, quarters: qs, aspect: box.aspect, counts: { quarters: qs.length, withCensus, text: count } };
      view.textRows = [[name[0] + ': ' + count[0], name[1] + ': ' + count[1]]].concat(qs.map((q) => q.label));
      view.ariaLabel = ['Two maps of the quarters of ' + name[0] + ': residents aged 65 and over, and ground classed as tree cover. ' + count[0], 'Δύο χάρτες των ενοριών: ' + name[1] + ': κάτοικοι 65 ετών και άνω και έδαφος στην κατηγορία δενδροκάλυψης. ' + count[1]];
      cities[key] = view; choices.push({ id: key, name });
    }
    const notes = [
      ['Census of 1 October 2021, government-controlled areas. Boundaries as served on 19 November 2026; they were not compared with 2021 boundaries.', 'Απογραφή 1ης Οκτωβρίου 2021, περιοχές υπό κυβερνητικό έλεγχο. Όρια όπως δόθηκαν στις 19 Νοεμβρίου 2026· δεν συγκρίθηκαν με όρια του 2021.'],
      ['Tree cover is the share of 10 m satellite pixels (2021) that a land-cover model classed as trees. It is a class from a model, not a count of trees.', 'Η δενδροκάλυψη είναι το ποσοστό των δορυφορικών εικονοστοιχείων 10 μ. (2021) που ένα μοντέλο κάλυψης γης κατέταξε ως δέντρα. Είναι κατηγορία μοντέλου, όχι καταμέτρηση δέντρων.'],
      ['The two maps sit side by side so you can look at both. They do not show that one causes the other.', 'Οι δύο χάρτες είναι δίπλα δίπλα για να βλέπετε και τους δύο. Δεν δείχνουν ότι το ένα προκαλεί το άλλο.'],
      ['These are the quarters of the four core municipalities as they were in 2021, not the municipalities formed in 2024. One city at a time; nothing is ranked.', 'Είναι οι ενορίες των τεσσάρων βασικών δήμων όπως ήταν το 2021, όχι οι δήμοι που σχηματίστηκαν το 2024. Μία πόλη τη φορά· τίποτα δεν κατατάσσεται.'],
      ['Sources: Statistical Service of Cyprus, Census 2021; Department of Lands and Surveys (CC BY 4.0); © ESA WorldCover project 2021, contains modified Copernicus Sentinel data (CC BY 4.0).', 'Πηγές: Στατιστική Υπηρεσία Κύπρου, Απογραφή 2021· Τμήμα Κτηματολογίου και Χωρομετρίας (CC BY 4.0)· © ESA WorldCover project 2021, περιέχει τροποποιημένα δεδομένα Copernicus Sentinel (CC BY 4.0).'],
    ];
    const first = cities[opts.city] ? opts.city : choices[0].id;
    const model = { id: 'quarters', available: true, empty: null, live: false, choices, cities, scales, measures: MEASURES, notes,
      strings: { noCensus: ['no census figure', 'χωρίς στοιχείο απογραφής'], hint: ['Point at a quarter, or use the left and right arrow keys, to read it on both maps.', 'Δείξτε μια ενορία ή χρησιμοποιήστε τα βελάκια αριστερά και δεξιά για να τη διαβάσετε και στους δύο χάρτες.'], still: ['Census 2021 and satellite 2021, not live', 'Απογραφή 2021 και δορυφόρος 2021, όχι ζωντανά'] } };
    return select(model, first);
  }
  function select(model, city) {
    const v = model.cities && model.cities[city]; if (!v) return model;
    return Object.assign({}, model, v, { textRows: v.textRows.concat(model.notes), ariaLabel: v.ariaLabel });
  }
  return { build, select, quarter, pct, CITIES, EMPTY };
});
