/*
  Class tape data (pure, tested by tests/viz/classtape_test.js). Built from the answer of /api/stack/drought:
  `features` = places with `name` [en,el] and `classes` (one code per ten-day period), `classes` = dictionary code -> [en,el],
  `classesAreNotAScale` = the sheet's own warning, `periods` / `periodEnds` = first and last day of each period.
  ONE place at a time: a row of cells, one per period, grouped by month.
    - The classes are CATEGORIES, not a scale. A cell carries a class, a colour and a glyph. It carries no height, no amount
      and no position on any axis; the drawing code gives every cell the same height. The key carries the sheet's warning.
    - Colour is never the only cue: every class has its own glyph as well (ring, triangle, diamond, square, check, wave, plus).
    - Codes 7 and 8 are 'no data' (missing or outside the covered area; the sheet does not name them apart): hatched, no class.
      Any other code that is not in the sheet's dictionary is 'unknown': hatched with a question mark, never guessed.
    - Places are never put on one picture and never ranked; no string compares one place with another.
  model = { id, title, available, empty|null, place (id), placeName, choices:[{id,name}], places:{<id>:view}, span:[en,el],
            warning:[en,el]|null, strings:{...pairs}, legend:[[en,el]], note|null, honesty|null, source|null, asOf|null,
            ...view of the chosen place }
  view  = { placeName, cells:[cell], months:[{key, name:[en,el], from, count}], key:[entry], runs:[{from,to,code,count,label}],
            ariaLabel, textRows }
  cell  = { i, period, periodEnd|null, code|null, state:'class'|'nodata'|'unknown', className:[en,el], glyph, color|null, ink,
            month (index into months), when:[en,el], label:[en,el] (full sentence) }
  entry = { code|null ('nodata' entry has code null), state, name:[en,el], glyph, color|null, ink, count, periods:[cell indexes],
            text:[en,el] }
  select(model, placeId) -> the same model with another place's view on top (used by the widget's set({place})).
  Every visible string is a pair [english, greek], without guillemets. Browser: window.SC.viz.classtapeData; also CommonJS.
*/
(function (root) {
  'use strict';
  const MONTHS = [['January', 'Ιανουαρίου', 'Jan', 'Ιαν'], ['February', 'Φεβρουαρίου', 'Feb', 'Φεβ'], ['March', 'Μαρτίου', 'Mar', 'Μαρ'], ['April', 'Απριλίου', 'Apr', 'Απρ'],
    ['May', 'Μαΐου', 'May', 'Μαΐ'], ['June', 'Ιουνίου', 'Jun', 'Ιουν'], ['July', 'Ιουλίου', 'Jul', 'Ιουλ'], ['August', 'Αυγούστου', 'Aug', 'Αυγ'],
    ['September', 'Σεπτεμβρίου', 'Sep', 'Σεπ'], ['October', 'Οκτωβρίου', 'Oct', 'Οκτ'], ['November', 'Νοεμβρίου', 'Nov', 'Νοε'], ['December', 'Δεκεμβρίου', 'Dec', 'Δεκ']];
  // one colour AND one glyph per class code. An unlisted code in the dictionary gets its number as the glyph.
  const STYLE = {
    0: { glyph: 'ring', color: '#1F4A66', ink: '#CFEEFF' },
    1: { glyph: 'triangle', color: '#FDE047', ink: '#04121F' },
    2: { glyph: 'diamond', color: '#FB923C', ink: '#04121F' },
    3: { glyph: 'square', color: '#F87171', ink: '#04121F' },
    4: { glyph: 'check', color: '#4ADE80', ink: '#04121F' },
    5: { glyph: 'wave', color: '#22D3EE', ink: '#04121F' },
    6: { glyph: 'plus', color: '#E879F9', ink: '#04121F' },
  };
  const SPARE = ['#A3A3A3', '#D6D3D1', '#94A3B8', '#FDA4AF', '#BEF264', '#FCD34D'];
  const NODATA_CODES = [7, 8];
  const NODATA = ['No data (missing or outside the covered area)', 'Χωρίς δεδομένα (λείπουν ή εκτός κάλυψης)'];
  const TITLE = ['Drought class, every ten days', 'Κατηγορία ξηρασίας, κάθε δέκα ημέρες'];
  const EMPTY = ['No drought classes are available right now.', 'Δεν υπάρχουν διαθέσιμες κατηγορίες ξηρασίας αυτή τη στιγμή.'];
  const pair = (p, fb) => (Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null ? [String(p[0]), String(p[1])] : [String(fb), String(fb)]);
  const clean = (p) => [p[0].replace(/[«»]/g, '"'), p[1].replace(/[«»]/g, '"')];
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, mo, d } : null;
  };
  const dayText = (p, year) => [p.d + ' ' + MONTHS[p.mo - 1][0] + (year ? ' ' + p.y : ''), p.d + ' ' + MONTHS[p.mo - 1][1] + (year ? ' ' + p.y : '')];
  // "11 to 20 July 2022", "21 July to 3 August 2022", or "from 11 July 2022" when the end is not given
  function spanText(a, b) {
    if (!b) return ['from ' + dayText(a, 1)[0], 'από ' + dayText(a, 1)[1]];
    if (a.y === b.y && a.mo === b.mo) return [a.d + ' to ' + dayText(b, 1)[0], a.d + ' έως ' + dayText(b, 1)[1]];
    const s = dayText(a, a.y !== b.y), e = dayText(b, 1);
    return [s[0] + ' to ' + e[0], s[1] + ' έως ' + e[1]];
  }

  const STRINGS = {
    choose: ['Place', 'Τόπος'],
    key: ['Classes (press one to show its periods)', 'Κατηγορίες (πάτησε μία για να δεις τις περιόδους της)'],
    hint: ['Point at a cell, or use the left and right arrow keys, to read one period.', 'Δείξε ένα κελί, ή χρησιμοποίησε τα βέλη αριστερά και δεξιά, για να διαβάσεις μία περίοδο.'],
    each: ['one cell per ten-day period', 'ένα κελί ανά δεκαήμερο'],
    onePlace: ['One place at a time. The places are not drawn together.', 'Ένας τόπος κάθε φορά. Οι τόποι δεν σχεδιάζονται μαζί.'],
    showing: ['Showing only', 'Εμφανίζεται μόνο'],
  };
  const LEGEND = [
    ['Every cell has the same height: a class is a category, not an amount.', 'Όλα τα κελιά έχουν το ίδιο ύψος: η κατηγορία είναι είδος, όχι ποσότητα.'],
    ['Each class has its own colour and its own sign, so colour is never the only cue.', 'Κάθε κατηγορία έχει το δικό της χρώμα και το δικό της σημάδι, ώστε το χρώμα να μην είναι ποτέ το μόνο στοιχείο.'],
    ['Hatched cell: no data for that period.', 'Γραμμοσκιασμένο κελί: δεν υπάρχουν δεδομένα για εκείνη την περίοδο.'],
  ];

  function emptyModel(why) {
    const e = why || EMPTY;
    return { id: 'classtape', title: TITLE, available: false, empty: e, place: null, placeName: null, choices: [], places: {}, span: ['', ''], warning: null, strings: STRINGS,
      legend: [], note: null, honesty: null, source: null, asOf: null, cells: [], months: [], key: [], runs: [], ariaLabel: e, textRows: [e] };
  }

  // the dictionary of the sheet -> key entries with a style each (distinct colour and glyph)
  function dictionary(classes) {
    const out = []; let spare = 0;
    for (const k of Object.keys(classes || {})) {
      const code = Number(k); if (!Number.isInteger(code) || NODATA_CODES.includes(code)) continue;
      const st = STYLE[code] || { glyph: 'digit', color: SPARE[spare++ % SPARE.length], ink: '#04121F' };
      out.push({ code, state: 'class', name: clean(pair(classes[k], 'class ' + code)), glyph: st.glyph, color: st.color, ink: st.ink });
    }
    return out.sort((a, b) => a.code - b.code);
  }

  function placeView(f, name, dict, periods, tail, warning) {
    const months = [];
    const cells = periods.map((p, i) => {
      const raw = Array.isArray(f.classes) ? f.classes[i] : undefined, d = dict.find((x) => x.code === raw);
      const key = p.a.y + '-' + (p.a.mo < 10 ? '0' : '') + p.a.mo;
      if (!months.length || months[months.length - 1].key !== key) months.push({ key, name: [MONTHS[p.a.mo - 1][2], MONTHS[p.a.mo - 1][3]], from: i, count: 0 });
      months[months.length - 1].count++;
      const state = d ? 'class' : (NODATA_CODES.includes(raw) ? 'nodata' : 'unknown');
      const className = d ? d.name : (state === 'nodata' ? NODATA
        : (raw == null ? ['No code in the answer', 'Δεν υπάρχει κωδικός στην απάντηση'] : ['Code ' + String(raw) + ' is not in the sheet\'s list of classes', 'Ο κωδικός ' + String(raw) + ' δεν υπάρχει στον κατάλογο κατηγοριών του φύλλου']));
      const when = spanText(p.a, p.b);
      return { i, period: p.start, periodEnd: p.end, code: typeof raw === 'number' && Number.isFinite(raw) ? raw : null, state, className,
        glyph: d ? d.glyph : (state === 'unknown' ? 'question' : 'none'), color: d ? d.color : null, ink: d ? d.ink : '#CFEEFF', month: months.length - 1, when,
        label: [name[0] + ', ' + when[0] + ': ' + className[0], name[1] + ', ' + when[1] + ': ' + className[1]] };
    });
    const n = cells.length, per = (c) => [c === 1 ? '1 period' : c + ' periods', c === 1 ? '1 περίοδος' : c + ' περίοδοι'];
    const entry = (base, idxs) => Object.assign({}, base, { count: idxs.length, periods: idxs,
      text: [base.name[0] + ': ' + idxs.length + ' of ' + n + ' periods', base.name[1] + ': ' + idxs.length + ' από ' + n + ' περιόδους'] });
    const key = dict.map((d) => entry(d, cells.filter((c) => c.state === 'class' && c.code === d.code).map((c) => c.i)));
    key.push(entry({ code: null, state: 'nodata', name: NODATA, glyph: 'none', color: null, ink: '#CFEEFF' }, cells.filter((c) => c.state === 'nodata').map((c) => c.i)));
    const unknown = cells.filter((c) => c.state === 'unknown').map((c) => c.i);
    if (unknown.length) key.push(entry({ code: null, state: 'unknown', name: ['Code not in the sheet\'s list', 'Κωδικός εκτός καταλόγου του φύλλου'], glyph: 'question', color: null, ink: '#CFEEFF' }, unknown));
    // runs: neighbouring periods with the same class, for the text list (a count of periods, never a sum of codes)
    const runs = [];
    for (const c of cells) {
      const last = runs[runs.length - 1], same = last && last.state === c.state && (c.state === 'nodata' || last.code === c.code);
      if (same) { last.to = c.i; last.count++; } else runs.push({ from: c.i, to: c.i, code: c.code, state: c.state, count: 1, name: c.className });
    }
    for (const r of runs) {
      const a = periods[r.from], b = periods[r.to], when = r.from === r.to ? cells[r.from].when : (b.b ? spanText(a.a, b.b) : [dayText(a.a, 1)[0] + ' onwards', 'από ' + dayText(a.a, 1)[1] + ' και μετά']);
      r.label = [when[0] + ': ' + r.name[0] + ' (' + per(r.count)[0] + ')', when[1] + ': ' + r.name[1] + ' (' + per(r.count)[1] + ')'];
    }
    const span = tail.span;
    const head = [name[0] + ', ' + span[0] + ': drought class of one grid cell, ' + per(n)[0] + '.', name[1] + ', ' + span[1] + ': κατηγορία ξηρασίας ενός κελιού πλέγματος, ' + per(n)[1] + '.'];
    const present = key.filter((k) => k.count > 0);
    const textRows = [head].concat(runs.map((r) => r.label), present.map((k) => k.text), warning ? [warning] : [], tail.rows);
    const ariaLabel = [name[0] + ', ' + span[0] + ': a row of ' + n + ' cells, one per ten-day period, each showing a drought class by colour and sign. ' + present.map((k) => k.text[0]).join('; ') + '. The classes are categories, not a scale.',
      name[1] + ', ' + span[1] + ': μια σειρά από ' + n + ' κελιά, ένα ανά δεκαήμερο, που δείχνουν την κατηγορία ξηρασίας με χρώμα και σημάδι. ' + present.map((k) => k.text[1]).join('· ') + '. Οι κατηγορίες είναι είδη, όχι κλίμακα.'];
    return { placeName: name, cells, months, key, runs, ariaLabel, textRows };
  }

  function select(model, id) {
    const v = model && model.places && model.places[id];
    return v ? Object.assign({}, model, v, { place: String(id) }) : model;
  }

  function build(ans, opts) {
    opts = opts || {};
    if (!ans || ans.available === false || !Array.isArray(ans.features) || !Array.isArray(ans.periods)) return emptyModel();
    const feats = ans.features.filter((f) => f && typeof f === 'object');
    const periods = [];
    ans.periods.forEach((s, i) => { const a = parse(s); if (!a) return; const e = Array.isArray(ans.periodEnds) ? ans.periodEnds[i] : null, b = parse(e); periods.push({ a, b, start: String(s), end: b ? String(e) : null, src: i }); });
    // a period whose start is unreadable is dropped together with its code, so cells and codes stay aligned
    const aligned = periods.length === ans.periods.length ? feats : feats.map((f) => Object.assign({}, f, { classes: Array.isArray(f.classes) ? periods.map((p) => f.classes[p.src]) : f.classes }));
    const dict = dictionary(ans.classes);
    if (!feats.length || !periods.length || !dict.length) return emptyModel();
    const first = periods[0].a, lastP = periods[periods.length - 1], last = lastP.b || lastP.a;
    const span = first.y === last.y ? [String(first.y), String(first.y)] : [first.y + ' to ' + last.y, first.y + ' έως ' + last.y];
    const warning = ans.classesAreNotAScale ? clean(pair(ans.classesAreNotAScale, '')) : null;
    const note = ans.note ? clean(pair(ans.note, '')) : null, honesty = ans.honesty ? clean(pair(ans.honesty, '')) : null, source = ans.source ? clean(pair(ans.source, '')) : null;
    const rows = LEGEND.concat([STRINGS.onePlace]);
    if (note) rows.push(note);
    if (honesty) rows.push(honesty);
    if (source) rows.push(['Source: ' + source[0], 'Πηγή: ' + source[1]]);
    const places = {}, choices = [], used = new Set();
    aligned.forEach((f, i) => {
      const name = clean(pair(f.name, f.id || 'place ' + (i + 1)));
      let id = String(f.id != null && f.id !== '' ? f.id : name[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'place-' + (i + 1));
      while (used.has(id)) id += '-' + (i + 1); used.add(id);
      places[id] = placeView(f, name, dict, periods, { span, rows }, warning); choices.push({ id, name });
    });
    const want = opts.place != null && places[String(opts.place)] ? String(opts.place) : choices[0].id;
    const base = { id: 'classtape', title: TITLE, available: true, empty: null, place: want, choices, places, span, warning, strings: STRINGS, legend: LEGEND.concat([STRINGS.onePlace]),
      note, honesty, source, asOf: ans.period || ans.retrieved || null };
    return select(base, want);
  }

  const api = { build, select, emptyModel, EMPTY, STYLE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.classtapeData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
