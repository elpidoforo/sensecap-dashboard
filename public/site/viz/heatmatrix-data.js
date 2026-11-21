/*
  Heat matrix data (pure, tested by tests/viz/heatmatrix_test.js). Built from the answer of /api/stack/permits.
  Rows = the five reporting districts (permitsByMonth[], values aligned with months), columns = years 2015..latest,
  cell = the sum of that district's monthly values in that year. Every sum is computed here, never in the drawing code.
    - A year with any missing / N.A. month for a district is 'incomplete': its sum is NOT shown (value null).
    - The latest year, when the answer stops before December, is 'partial' (a true sum of the months reported, labelled).
    - Each row is scaled against its OWN largest full year (t = 0..1), so districts are never ranked against each other.
    - The district values are district totals (urban and rural parts are inside them): parts are never added to them.
  model = { id, title, unit, available, empty|null, mode, modes:[{k,n,unit}], years:[{y, state, months, expected, label|null}],
            rows:[{code, name, short, max, cells:[cell]}], views:{<mode>:{rows}}, legend:[[en,el]], note, annotation|null,
            source, asOf, ariaLabel, textRows }
  cell  = { district (code), year, value|null, state:'full'|'partial'|'incomplete', missing (months), t (0..1|null),
            text:[en,el]|null (number to print), label:[en,el] (full sentence), unit:[en,el] }
  Every visible string is a pair [english, greek]. Works as a browser script (window.SC.viz.heatmatrixData) and as CommonJS.
*/
(function (root) {
  'use strict';
  const FIRST_YEAR = 2015;
  const MONTHS = [['Jan', 'Ιαν'], ['Feb', 'Φεβ'], ['Mar', 'Μαρ'], ['Apr', 'Απρ'], ['May', 'Μαΐ'], ['Jun', 'Ιουν'], ['Jul', 'Ιουλ'], ['Aug', 'Αύγ'], ['Sep', 'Σεπ'], ['Oct', 'Οκτ'], ['Nov', 'Νοε'], ['Dec', 'Δεκ']];
  const UNITS = {   // the units a mode may carry, with a Greek wording. An unknown unit is not offered.
    permits: { n: ['Permits', 'Άδειες'], u: { permits: ['permits', 'άδειες'] } },
    floorArea: { n: ['Floor area', 'Εμβαδόν'], u: { 'square metres': ['square metres', 'τετραγωνικά μέτρα'] } },
    value: { n: ['Value', 'Αξία'], u: { 'thousand EUR': ['thousand EUR', 'χιλιάδες ευρώ'] } },
  };
  const EMPTY = ['No permit figures are available right now.', 'Δεν υπάρχουν διαθέσιμα στοιχεία αδειών αυτή τη στιγμή.'];
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const pair = (p, fb) => (Array.isArray(p) && p.length >= 2 ? [String(p[0]), String(p[1])] : [String(fb), String(fb)]);
  const grp = (n, el) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, el ? '.' : ',');
  const fmt = (n) => [grp(n, 0), grp(n, 1)];

  function emptyModel(why) {
    const e = why || EMPTY;
    return { id: 'heatmatrix', title: ['Building permits by district and year', 'Άδειες οικοδομής ανά επαρχία και έτος'], unit: ['permits', 'άδειες'], available: false, empty: e, mode: 'permits', modes: [], years: [], rows: [], views: {},
      legend: [], note: e, annotation: null, source: null, asOf: null, ariaLabel: e, textRows: [e] };
  }

  // one view (one measure) of the matrix
  function view(ans, k, unit, years, byMonth, latest) {
    const rows = ans.permitsByMonth.map((s) => {
      const vals = new Map(); ans.months.forEach((m, i) => { if (isNum(s[k === 'permits' ? 'values' : k][i])) vals.set(m, s[k === 'permits' ? 'values' : k][i]); });
      const cells = years.map((yr) => {
        let sum = 0, missing = 0;
        for (let mo = 1; mo <= yr.expected; mo++) {
          const key = yr.y + '-' + (mo < 10 ? '0' : '') + mo;
          if (vals.has(key)) sum += vals.get(key); else missing++;
        }
        const state = missing ? 'incomplete' : (yr.partial ? 'partial' : 'full');
        return { district: String(s.code), year: yr.y, value: missing ? null : sum, state, missing, t: null, text: missing ? null : fmt(sum), label: null, unit };
      });
      // each row against its OWN maximum, taken over its full years (a partial year is smaller by construction);
      // without any full year the partial one is all the row has
      let pool = cells.filter((c) => c.state === 'full'); if (!pool.length) pool = cells.filter((c) => c.state === 'partial');
      const max = pool.reduce((a, c) => Math.max(a, c.value), 0);
      for (const c of cells) if (c.value != null) c.t = max > 0 ? Math.min(1, c.value / max) : 0;
      const name = pair(s.name, s.code), short = [name[0].replace(/ district$/i, ''), name[1].replace(/^Επαρχία\s+/, '')];
      for (const c of cells) {
        const yr = years.find((x) => x.y === c.year);
        c.label = c.state === 'incomplete'
          ? [name[0] + ', ' + c.year + ': no yearly sum, ' + c.missing + (c.missing === 1 ? ' month is' : ' months are') + ' missing or N.A.', name[1] + ', ' + c.year + ': χωρίς ετήσιο άθροισμα, ' + (c.missing === 1 ? 'λείπει ή είναι N.A. 1 μήνας' : 'λείπουν ή είναι N.A. ' + c.missing + ' μήνες')]
          : [name[0] + ', ' + c.year + ': ' + c.text[0] + ' ' + unit[0] + (c.state === 'partial' ? ' (partial year, ' + yr.span[0] + ')' : ''), name[1] + ', ' + c.year + ': ' + c.text[1] + ' ' + unit[1] + (c.state === 'partial' ? ' (μερικό έτος, ' + yr.span[1] + ')' : '')];
      }
      return { code: String(s.code), name, short, max, cells };
    });
    return { rows };
  }

  function build(ans, opts) {
    opts = opts || {};
    if (!ans || ans.available === false || !Array.isArray(ans.months) || !ans.months.length || !Array.isArray(ans.permitsByMonth) || !ans.permitsByMonth.length) return emptyModel();
    const ms = ans.months.filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)).sort();
    if (!ms.length) return emptyModel();
    const last = ms[ms.length - 1], lastY = Number(last.slice(0, 4)), lastM = Number(last.slice(5));
    const y0 = Math.max(FIRST_YEAR, Number(ms[0].slice(0, 4)));
    if (lastY < y0) return emptyModel();
    const years = [];
    for (let y = y0; y <= lastY; y++) {
      const expected = y === lastY ? lastM : 12, partial = y === lastY && lastM < 12;
      years.push({ y, expected, partial, state: partial ? 'partial' : 'full', months: 0, span: ['January to ' + MONTHS[lastM - 1][0], 'Ιανουάριος έως ' + MONTHS[lastM - 1][1]], label: partial ? ['partial: to ' + MONTHS[lastM - 1][0], 'μερικό: έως ' + MONTHS[lastM - 1][1]] : null });
    }
    // modes: permits always; floor area and value only when the answer carries a monthly series for them WITH a unit
    const modes = [{ k: 'permits', n: UNITS.permits.n, unit: UNITS.permits.u.permits }];
    for (const k of ['floorArea', 'value']) {
      const u = ans.units && UNITS[k].u[ans.units[k]];
      if (u && ans.permitsByMonth.every((s) => Array.isArray(s[k]) && s[k].length === ans.months.length)) modes.push({ k, n: UNITS[k].n, unit: u });
    }
    const views = {};
    for (const m of modes) views[m.k] = view(ans, m.k, m.unit, years, null, last);
    const want = opts.mode && views[opts.mode] ? opts.mode : 'permits';
    const rows = views[want].rows;
    // column facts: months a year has, counted over its first row only for the header; incompleteness is per cell
    for (const yr of years) { yr.incomplete = rows.filter((r) => r.cells.find((c) => c.year === yr.y).state === 'incomplete').length; yr.state = yr.incomplete ? 'incomplete' : (yr.partial ? 'partial' : 'full'); }
    const partial = years.find((y) => y.partial) || null;
    const legend = [
      ['Each row is coloured against its own largest year. Colours compare years within one district, never districts with each other.', 'Κάθε γραμμή χρωματίζεται σε σχέση με τη δική της μεγαλύτερη χρονιά. Τα χρώματα συγκρίνουν χρονιές μέσα σε μία επαρχία, ποτέ επαρχίες μεταξύ τους.'],
      ['Hatched: a month is missing or N.A., so no yearly sum is shown.', 'Γραμμοσκίαση: λείπει ή είναι N.A. ένας μήνας, άρα δεν δείχνεται ετήσιο άθροισμα.'],
    ];
    if (partial) legend.push([partial.y + ' is a partial year (' + partial.span[0] + '): its sum is of those months only.', 'Το ' + partial.y + ' είναι μερικό έτος (' + partial.span[1] + '): το άθροισμά του αφορά μόνο αυτούς τους μήνες.']);
    const note = ['Each figure is the district total for the year, added from the monthly totals. The urban and rural parts are inside the total and are never added to it.', 'Κάθε αριθμός είναι το σύνολο της επαρχίας για το έτος, προσθέτοντας τα μηνιαία σύνολα. Το αστικό και το αγροτικό μέρος περιέχονται στο σύνολο και δεν προστίθενται σε αυτό.'];
    let annotation = null;
    if (ans.annotation && ans.annotation.text) {
      const ay = Number(String(ans.annotation.month || '').slice(0, 4)), t = pair(ans.annotation.text, '');
      annotation = { year: ay >= y0 && ay <= lastY ? ay : null, month: ans.annotation.month || null, text: t, url: ans.annotation.url || null };
    }
    const mode = modes.find((m) => m.k === want);
    const title = ['Building permits by district and year', 'Άδειες οικοδομής ανά επαρχία και έτος'];
    const sy = years[0].y + ' to ' + lastY, sg = years[0].y + ' έως ' + lastY;
    const textRows = [];
    for (const r of rows) {
      const parts = r.cells.map((c) => ({ en: c.year + ': ' + (c.state === 'incomplete' ? 'no yearly sum (incomplete)' : c.text[0] + (c.state === 'partial' ? ' (partial)' : '')), el: c.year + ': ' + (c.state === 'incomplete' ? 'χωρίς ετήσιο άθροισμα (ελλιπές)' : c.text[1] + (c.state === 'partial' ? ' (μερικό)' : '')) }));
      textRows.push([r.name[0] + ' (' + mode.unit[0] + '): ' + parts.map((p) => p.en).join('; '), r.name[1] + ' (' + mode.unit[1] + '): ' + parts.map((p) => p.el).join('; ')]);
    }
    for (const l of legend) textRows.push(l);
    textRows.push(note);
    if (annotation) textRows.push(annotation.text);
    const ariaLabel = [title[0] + ', ' + sy + ': ' + rows.length + ' districts by ' + years.length + ' years, ' + mode.unit[0] + ' per year. Each row is coloured against its own largest year.',
      title[1] + ', ' + sg + ': ' + rows.length + ' επαρχίες επί ' + years.length + ' έτη, ' + mode.unit[1] + ' ανά έτος. Κάθε γραμμή χρωματίζεται σε σχέση με τη δική της μεγαλύτερη χρονιά.'];
    return { id: 'heatmatrix', title, unit: mode.unit, available: true, empty: null, mode: want, modes, years, rows, views, legend, note, annotation,
      source: ans.source ? pair(ans.source, '') : null, asOf: ans.period || ans.retrieved || null, ariaLabel, textRows };
  }

  const api = { build, emptyModel, EMPTY, FIRST_YEAR };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.heatmatrixData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
