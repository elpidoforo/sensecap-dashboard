/*
  Day bars data (pure, tested by tests/viz/daybars_test.js). Built from the answer of /api/stack/aerosol-sites:
  `features` = sites with `name` [en,el], `days` (ISO dates) and `aod` (daily aerosol optical depth, null = no value).
  ONE site at a time: one bar per day. Every number is computed here, never in the drawing code.
    - A day with no value (null, not a number, or absent from the list between the first and last day) is 'missing':
      it has no bar, no height and no text. Nothing is filled in or smoothed.
    - The y scale starts at zero and is fitted to the chosen site's OWN largest day. Sites are never put on one picture
      and never ranked; no string compares one site with another.
    - Optical depth has no unit and describes the whole air column; it is not ground-level particle concentration.
  model = { id, title, unit, available, empty|null, site (id), siteName, choices:[{id,name}], sites:{<id>:view},
            wavelength|null, strings:{...pairs}, legend:[[en,el]], columnNote, note|null, honesty|null, source|null, asOf|null,
            ...view of the chosen site }
  view  = { siteName, hasDays, days:[day], axis:{max, step, ticks:[{v,t,text}], label, month}, counts:{days, measured, missing},
            range:{min,max,tMin,tMax,text:[en,el]}|null, ariaLabel, textRows }
  day   = { day ('YYYY-MM-DD'), dom (day of month), value|null, missing (bool), t (0..1|null, share of the axis),
            text:[en,el]|null (the number as printed), date:[en,el], label:[en,el] (full sentence) }
  select(model, siteId) -> the same model with another site's view on top (used by the widget's set({site})).
  Every visible string is a pair [english, greek]. Works as a browser script (window.SC.viz.daybarsData) and as CommonJS.
*/
(function (root) {
  'use strict';
  const MONTHS = [['January', 'Ιανουάριος', 'Ιανουαρίου'], ['February', 'Φεβρουάριος', 'Φεβρουαρίου'], ['March', 'Μάρτιος', 'Μαρτίου'], ['April', 'Απρίλιος', 'Απριλίου'],
    ['May', 'Μάιος', 'Μαΐου'], ['June', 'Ιούνιος', 'Ιουνίου'], ['July', 'Ιούλιος', 'Ιουλίου'], ['August', 'Αύγουστος', 'Αυγούστου'],
    ['September', 'Σεπτέμβριος', 'Σεπτεμβρίου'], ['October', 'Οκτώβριος', 'Οκτωβρίου'], ['November', 'Νοέμβριος', 'Νοεμβρίου'], ['December', 'Δεκέμβριος', 'Δεκεμβρίου']];
  const TITLE = ['Aerosol optical depth, day by day', 'Οπτικό βάθος αερολυμάτων, ημέρα προς ημέρα'];
  const EMPTY = ['No daily optical depth values are available right now.', 'Δεν υπάρχουν διαθέσιμες ημερήσιες τιμές οπτικού βάθους αυτή τη στιγμή.'];
  const NO_DAYS = ['This site has no days in the answer.', 'Αυτός ο σταθμός δεν έχει ημέρες στην απάντηση.'];
  const MAX_DAYS = 366;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const pair = (p, fb) => (Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null ? [String(p[0]), String(p[1])] : [String(fb), String(fb)]);
  const clean = (p) => [p[0].replace(/[«»]/g, '"'), p[1].replace(/[«»]/g, '"')];
  const dec = (v, n) => { const s = v.toFixed(n); return [s, s.replace('.', ',')]; };
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3], t = Date.UTC(y, mo - 1, d), dt = new Date(t);
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, mo, d, t } : null;
  };
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const dateText = (p) => [p.d + ' ' + MONTHS[p.mo - 1][0] + ' ' + p.y, p.d + ' ' + MONTHS[p.mo - 1][2] + ' ' + p.y];

  // a round axis top just above the largest value, with at most six steps
  function axisFor(max) {
    if (!(max > 0)) return { max: 1, step: null, ticks: [{ v: 0, t: 0, text: ['0', '0'] }] };
    const raw = max / 5, pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw - 1e-12);
    const n = Math.max(1, Math.ceil(max / step - 1e-9)), top = step * n;
    let digits = 0; while (digits < 8 && Math.abs(step * Math.pow(10, digits) - Math.round(step * Math.pow(10, digits))) > 1e-6) digits++;
    const ticks = []; for (let i = 0; i <= n; i++) { const v = +(step * i).toFixed(10); ticks.push({ v, t: v / top, text: i === 0 ? ['0', '0'] : dec(v, digits) }); }
    return { max: +top.toFixed(10), step: +step.toFixed(10), ticks };
  }

  function strings(wl) {
    const at = wl ? [' at ' + wl + ' nm', ' στα ' + wl + ' nm'] : ['', ''];
    return {
      yAxis: ['aerosol optical depth (no unit)', 'οπτικό βάθος αερολυμάτων (χωρίς μονάδα)'],
      measure: ['aerosol optical depth' + at[0], 'οπτικό βάθος αερολυμάτων' + at[1]],
      missing: ['no value', 'χωρίς τιμή'],
      choose: ['Site', 'Σταθμός'],
      hint: ['Point at a bar, or use the left and right arrow keys, to read one day.', 'Δείξε μια ράβδο, ή χρησιμοποίησε τα βέλη αριστερά και δεξιά, για να διαβάσεις μία ημέρα.'],
      oneSite: ['One site at a time. The sites are not drawn together.', 'Ένας σταθμός κάθε φορά. Οι σταθμοί δεν σχεδιάζονται μαζί.'],
    };
  }
  const COLUMN_NOTE = ['Optical depth describes the whole column of air above the site. It is not the amount of particles in the air near the ground: that needs a different measurement.',
    'Το οπτικό βάθος περιγράφει ολόκληρη τη στήλη του αέρα πάνω από τον σταθμό. Δεν είναι η ποσότητα σωματιδίων στον αέρα κοντά στο έδαφος: αυτή χρειάζεται διαφορετική μέτρηση.'];

  function emptyModel(why) {
    const e = why || EMPTY;
    return { id: 'daybars', title: TITLE, unit: ['no unit', 'χωρίς μονάδα'], available: false, empty: e, site: null, siteName: null, choices: [], sites: {}, wavelength: null,
      strings: strings(null), legend: [], columnNote: COLUMN_NOTE, note: null, honesty: null, source: null, asOf: null,
      hasDays: false, days: [], axis: { max: 1, step: null, ticks: [], label: strings(null).yAxis, month: ['', ''] }, counts: { days: 0, measured: 0, missing: 0 }, range: null, ariaLabel: e, textRows: [e] };
  }

  function siteView(f, S, tail) {
    const name = pair(f.name, f.id || '?');
    const vals = new Map(), seen = [];
    (Array.isArray(f.days) ? f.days : []).forEach((d, i) => { const p = parse(d); if (!p) return; seen.push(p); const v = Array.isArray(f.aod) ? f.aod[i] : null; if (isNum(v)) vals.set(iso(p.t), v); });
    seen.sort((a, b) => a.t - b.t);
    if (!seen.length) {
      return { siteName: name, hasDays: false, days: [], axis: Object.assign(axisFor(0), { label: S.yAxis, month: ['', ''] }), counts: { days: 0, measured: 0, missing: 0 }, range: null,
        ariaLabel: [name[0] + ': ' + NO_DAYS[0], name[1] + ': ' + NO_DAYS[1]], textRows: [[name[0] + ': ' + NO_DAYS[0], name[1] + ': ' + NO_DAYS[1]]].concat(tail) };
    }
    // every calendar day from the first to the last listed day: a day the answer skips is missing, not hidden
    const first = seen[0], last = seen[seen.length - 1], list = [];
    for (let t = first.t; t <= last.t && list.length < MAX_DAYS; t += 86400000) list.push(parse(iso(t)));
    let max = null, min = null;
    for (const p of list) { const v = vals.get(iso(p.t)); if (v == null) continue; if (max == null || v > max) max = v; if (min == null || v < min) min = v; }
    const axis = axisFor(max == null ? 0 : max);
    const days = list.map((p) => {
      const day = iso(p.t), has = vals.has(day), v = has ? vals.get(day) : null, text = has ? dec(v, 3) : null, date = dateText(p);
      return { day, dom: p.d, value: v, missing: !has, t: has ? Math.max(0, Math.min(1, v / axis.max)) : null, text, date,
        label: has ? [name[0] + ', ' + date[0] + ': ' + S.measure[0] + ' ' + text[0] + ' (no unit)', name[1] + ', ' + date[1] + ': ' + S.measure[1] + ' ' + text[1] + ' (χωρίς μονάδα)']
          : [name[0] + ', ' + date[0] + ': ' + S.missing[0], name[1] + ', ' + date[1] + ': ' + S.missing[1]] };
    });
    const measured = days.filter((d) => !d.missing).length, missing = days.length - measured;
    const same = first.y === last.y && first.mo === last.mo;
    const month = same ? [MONTHS[first.mo - 1][0] + ' ' + first.y, MONTHS[first.mo - 1][1] + ' ' + first.y] : [dateText(first)[0] + ' to ' + dateText(last)[0], dateText(first)[1] + ' έως ' + dateText(last)[1]];
    axis.label = S.yAxis; axis.month = month;
    const range = measured >= 2 ? { min, max, tMin: Math.max(0, min / axis.max), tMax: Math.min(1, max / axis.max),
      text: ['Shaded band: from the lowest (' + dec(min, 3)[0] + ') to the highest (' + dec(max, 3)[0] + ') daily value of this site in this period.',
        'Σκιασμένη ζώνη: από τη χαμηλότερη (' + dec(min, 3)[1] + ') έως την υψηλότερη (' + dec(max, 3)[1] + ') ημερήσια τιμή αυτού του σταθμού σε αυτή την περίοδο.'] } : null;
    const count = [measured + ' of ' + days.length + ' days have a value; ' + (missing === 1 ? '1 day has' : missing + ' days have') + ' none.',
      measured + ' από ' + days.length + ' ημέρες έχουν τιμή· ' + (missing === 1 ? '1 ημέρα δεν έχει' : missing + ' ημέρες δεν έχουν') + '.'];
    const head = [name[0] + ', ' + month[0] + ': ' + S.measure[0] + ', one value per day (no unit).', name[1] + ', ' + month[1] + ': ' + S.measure[1] + ', μία τιμή ανά ημέρα (χωρίς μονάδα).'];
    const textRows = [head].concat(days.map((d) => (d.missing ? [d.date[0] + ': ' + S.missing[0], d.date[1] + ': ' + S.missing[1]] : [d.date[0] + ': ' + d.text[0], d.date[1] + ': ' + d.text[1]])), [count], range ? [range.text] : [], tail);
    const ariaLabel = [name[0] + ', ' + month[0] + ': bar chart of ' + S.measure[0] + ', one bar per day. ' + count[0] + ' ' + COLUMN_NOTE[0],
      name[1] + ', ' + month[1] + ': ραβδόγραμμα για το ' + S.measure[1] + ', μία ράβδος ανά ημέρα. ' + count[1] + ' ' + COLUMN_NOTE[1]];
    return { siteName: name, hasDays: true, days, axis, counts: { days: days.length, measured, missing, text: count }, range, ariaLabel, textRows };
  }

  function select(model, id) {
    const v = model && model.sites && model.sites[id];
    return v ? Object.assign({}, model, v, { site: String(id) }) : model;
  }

  function build(ans, opts) {
    opts = opts || {};
    if (!ans || ans.available === false || !Array.isArray(ans.features)) return emptyModel();
    const feats = ans.features.filter((f) => f && typeof f === 'object');
    if (!feats.length) return emptyModel();
    const wm = /(\d{3,4})\s*nm/.exec(String(ans.unit || '')), wavelength = wm ? Number(wm[1]) : null;
    const S = strings(wavelength);
    const note = ans.note ? clean(pair(ans.note, '')) : null, honesty = ans.honesty ? clean(pair(ans.honesty, '')) : null, source = ans.source ? clean(pair(ans.source, '')) : null;
    const legend = [
      ['The scale starts at zero and fits this site\'s own days.', 'Η κλίμακα αρχίζει από το μηδέν και προσαρμόζεται στις ημέρες αυτού του σταθμού.'],
      ['Hatched column: no value for that day, so no bar is drawn.', 'Γραμμοσκιασμένη στήλη: δεν υπάρχει τιμή για εκείνη την ημέρα, άρα δεν σχεδιάζεται ράβδος.'],
      S.oneSite,
    ];
    const tail = [COLUMN_NOTE, legend[0], legend[1], S.oneSite];
    if (note) tail.push(note);
    if (honesty) tail.push(honesty);
    if (source) tail.push(['Source: ' + source[0], 'Πηγή: ' + source[1]]);
    const sites = {}, choices = [], used = new Set();
    feats.forEach((f, i) => {
      let id = String(f.id != null && f.id !== '' ? f.id : 'site-' + (i + 1)); while (used.has(id)) id += '-' + (i + 1); used.add(id);
      sites[id] = siteView(f, S, tail); choices.push({ id, name: sites[id].siteName });
    });
    const want = opts.site != null && sites[String(opts.site)] ? String(opts.site) : choices[0].id;
    const base = { id: 'daybars', title: TITLE, unit: ['no unit', 'χωρίς μονάδα'], available: true, empty: null, site: want, choices, sites, wavelength, strings: S, legend,
      columnNote: COLUMN_NOTE, note, honesty, source, asOf: ans.period || ans.retrieved || null };
    return select(base, want);
  }

  const api = { build, select, emptyModel, EMPTY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.daybarsData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
