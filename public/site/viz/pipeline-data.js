/*
  Pipeline widget data (pure, tested by tests/viz/pipeline_test.js).
  Redraws the "how records travel" board as the real Kleanthis data path: record sources -> four plain steps -> stack sheets.
  Every number is a count computed here from the counts the page hands in. Nothing is estimated or made up.
  Input : { sources: [{ id, title:[en,el], count, sheetId, sheetTitle:[en,el] }] }
  Output: { sources, sheets, stages, recordsIn, sheetsOut, particles, strings, empty, textRows, ariaLabel }
  Works as a browser script (window.SC.viz.pipelineData) and as a CommonJS module for the tests.
*/
(function (root) {
  'use strict';

  const GRID_SIDE = 20;                       // fixed side of the capped grid
  const GRID_MAX = GRID_SIDE * GRID_SIDE;     // 400 records or fewer: one cell per record
  const PARTICLE_CAP = 600;

  const STAGES = [
    { id: 'collect', n: ['Collect', 'Συλλογή'], d: ['fetch the list from the publisher', 'λήψη της λίστας από τον εκδότη'] },
    { id: 'check', n: ['Check', 'Έλεγχος'], d: ['check the shape and the licence', 'έλεγχος της μορφής και της άδειας'] },
    { id: 'label', n: ['Label', 'Επισήμανση'], d: ['add the source, the date and the honest status', 'προσθήκη πηγής, ημερομηνίας και ειλικρινούς κατάστασης'] },
    { id: 'show', n: ['Show', 'Προβολή'], d: ['show it as a sheet in the stack', 'εμφάνιση ως φύλλο στη στοίβα'] },
  ];

  function fmt(n, lang) {
    const s = String(Math.round(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'el' ? '.' : ',');
  }
  const both = (n) => [fmt(n, 'en'), fmt(n, 'el')];
  function records(n) {
    return [fmt(n, 'en') + ' ' + (n === 1 ? 'record' : 'records'), fmt(n, 'el') + ' ' + (n === 1 ? 'εγγραφή' : 'εγγραφές')];
  }
  function isPair(p) { return Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0] !== '' && p[1] !== ''; }
  function pairOr(p, fallback) { return isPair(p) ? [p[0], p[1]] : [String(fallback), String(fallback)]; }
  function wholeCount(c) { const n = Number(c); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }

  // Pixel grid of one source: one cell per record up to 400, else a fixed 20x20 frame where one cell holds `per` records.
  function gridFor(count) {
    if (count <= 0) return { cols: 0, rows: 0, cells: 0, per: 1, last: 0, capped: false, label: null, note: null };
    if (count <= GRID_MAX) {
      const cols = Math.ceil(Math.sqrt(count));
      return { cols, rows: Math.ceil(count / cols), cells: count, per: 1, last: 1, capped: false, label: null, note: null };
    }
    const per = Math.ceil(count / GRID_MAX), cells = Math.ceil(count / per), last = count - (cells - 1) * per;
    const N = fmt(per, 'en'), Ne = fmt(per, 'el');
    return { cols: GRID_SIDE, rows: GRID_SIDE, cells, per, last, capped: true,
      label: ['one cell = ' + N + ' records', 'ένα κελί = ' + Ne + ' εγγραφές'],
      note: last !== per ? ['the last cell holds ' + fmt(last, 'en'), 'το τελευταίο κελί έχει ' + fmt(last, 'el')] : null };
  }

  // One particle per record up to the cap, else one particle = `per` records. Particle j covers records [j*per, (j+1)*per).
  function particlesFor(sources, total) {
    const per = total <= PARTICLE_CAP ? 1 : Math.ceil(total / PARTICLE_CAP);
    const count = total ? Math.ceil(total / per) : 0;
    const bySource = sources.map(() => 0), list = [];
    let si = 0, end = sources.length ? sources[0].count : 0;
    for (let j = 0; j < count; j++) {
      const first = j * per;
      while (si < sources.length - 1 && first >= end) { si++; end += sources[si].count; }
      bySource[si]++; list.push(si);
    }
    return { count, per, cap: PARTICLE_CAP, capped: per > 1, bySource, list,
      label: per > 1 ? ['one particle = ' + fmt(per, 'en') + ' records', 'ένα σωματίδιο = ' + fmt(per, 'el') + ' εγγραφές'] : null };
  }

  function build(input) {
    const raw = (input && Array.isArray(input.sources)) ? input.sources : [];
    const sources = raw.map((s, i) => {
      const id = String((s && s.id) || ('source-' + (i + 1)));
      const count = wholeCount(s && s.count);
      const sheetId = String((s && s.sheetId) || id);
      return { id, title: pairOr(s && s.title, id), count, sheetId, sheetTitle: pairOr(s && s.sheetTitle, sheetId), grid: gridFor(count) };
    });
    const recordsIn = sources.reduce((a, s) => a + s.count, 0);

    const sheets = [];
    sources.forEach((s) => {
      let sh = sheets.find((x) => x.id === s.sheetId);
      if (!sh) { sh = { id: s.sheetId, title: s.sheetTitle, records: 0, sources: [] }; sheets.push(sh); }
      sh.records += s.count; sh.sources.push(s.id);
      s.sheetIndex = sheets.indexOf(sh);
    });
    const sheetsOut = sheets.filter((x) => x.records > 0).length;
    sources.forEach((s) => { s.share = recordsIn ? s.count / recordsIn : 0; s.out = s.count > 0 ? 1 : 0; s.recordsText = s.count ? records(s.count) : ['no records', 'καμία εγγραφή']; });
    sheets.forEach((x) => { x.recordsText = both(x.records); });

    const particles = particlesFor(sources, recordsIn);
    const empty = recordsIn === 0
      ? ['No records have been handed to this picture yet, so there is nothing to show.', 'Δεν έχουν δοθεί ακόμη εγγραφές σε αυτή την εικόνα, γι’ αυτό δεν υπάρχει τίποτα να δειχθεί.'] : null;

    const strings = {
      title: ['How the records travel', 'Πώς ταξιδεύουν οι εγγραφές'],
      mode: ['how it works, not live', 'πώς λειτουργεί, όχι ζωντανά'],
      recordsIn: ['records in', 'εγγραφές μέσα'],
      sheetsOut: ['sheets out', 'φύλλα έξω'],
      sources: ['Record sources', 'Πηγές εγγραφών'],
      sheetsTitle: ['Sheets in the stack', 'Φύλλα στη στοίβα'],
      pause: ['Pause', 'Παύση'], play: ['Play', 'Συνέχεια'],
      paused: ['paused', 'σε παύση'], still: ['still picture', 'στατική εικόνα'],
      inLabel: ['in', 'μέσα'], oneSheet: ['1 sheet out', '1 φύλλο έξω'],
      noRecords: ['no records', 'καμία εγγραφή'],
    };

    const textRows = [
      [strings.title[0] + ' (' + strings.mode[0] + ')', strings.title[1] + ' (' + strings.mode[1] + ')'],
      ['Records in: ' + fmt(recordsIn, 'en') + '. Sheets out: ' + sheetsOut + '.', 'Εγγραφές μέσα: ' + fmt(recordsIn, 'el') + '. Φύλλα έξω: ' + sheetsOut + '.'],
    ];
    sources.forEach((s) => {
      const r = records(s.count);
      textRows.push([s.title[0] + ': ' + r[0] + ' → ' + s.sheetTitle[0] + (s.grid.label ? ' (' + s.grid.label[0] + (s.grid.note ? ', ' + s.grid.note[0] : '') + ')' : ''),
        s.title[1] + ': ' + r[1] + ' → ' + s.sheetTitle[1] + (s.grid.label ? ' (' + s.grid.label[1] + (s.grid.note ? ', ' + s.grid.note[1] : '') + ')' : '')]);
    });
    textRows.push(['Steps: ' + STAGES.map((x) => x.n[0] + ' (' + x.d[0] + ')').join(', ') + '.', 'Βήματα: ' + STAGES.map((x) => x.n[1] + ' (' + x.d[1] + ')').join(', ') + '.']);
    if (particles.label) textRows.push([particles.label[0], particles.label[1]]);
    if (empty) textRows.push(empty);

    const ariaLabel = [
      'How the records travel, explained step by step, not live: ' + fmt(recordsIn, 'en') + ' records from ' + sources.length + ' sources go through ' + STAGES.map((x) => x.n[0].toLowerCase()).join(', ') + ' and appear on ' + sheetsOut + ' sheets in the stack.',
      'Πώς ταξιδεύουν οι εγγραφές, βήμα βήμα, όχι ζωντανά: ' + fmt(recordsIn, 'el') + ' εγγραφές από ' + sources.length + ' πηγές περνούν από τα βήματα ' + STAGES.map((x) => x.n[1].toLowerCase()).join(', ') + ' και εμφανίζονται σε ' + sheetsOut + ' φύλλα της στοίβας.',
    ];

    return { sources, sheets, stages: STAGES.map((x) => ({ id: x.id, n: x.n.slice(), d: x.d.slice() })), recordsIn, sheetsOut,
      recordsInText: both(recordsIn), sheetsOutText: both(sheetsOut), particles, strings, empty, textRows, ariaLabel };
  }

  const api = { GRID_SIDE, GRID_MAX, PARTICLE_CAP, STAGES, build, gridFor, particlesFor, fmt, records };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.pipelineData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
