/*
  Hour strip data (pure, tested by tests/viz/hourstrip_test.js). Built from the answer of /api/stack/air-day:
  one PAST day of hourly station measurements (`hours` = ISO hours, `features` = stations with `no2` / `o3` arrays aligned
  with `hours`, null = no reported measurement). The widget shows ONE station and ONE pollutant at a time.
    - Stations are never drawn side by side and never ranked: `choices` keeps the order of the answer and carries no values.
    - The colour / line scale is FIXED per pollutant for the whole day and the same for every station:
      scale.min = 0, scale.max = the day's highest hourly value of that pollutant at any station, rounded UP to the next ten.
      It is a drawing scale, not a health limit, and the model says so (pollutants[].scale.text).
    - A blank hour (null / not a number) has value null, text null, t null and state 'blank': it is hatched, never filled in.
    - The printed number is the measurement rounded to a whole number (cell.text); cell.value keeps the published value.
    - The day is past data. `replay` is the sentence the widget must draw inside the canvas (date taken from `hours`).
  model = { id, title, available, empty|null, live:false, date, dateText, replay, hours:[{i, iso, clock, hour}],
            choices:[{id, name, type, measured:{<pollutant>: hours with a value}}],
            pollutants:[{k, name, lower, symbol, unit, scale:{min, max, text}|null}],
            station, pollutant, view, views:{<station id>:{<pollutant>: view}}, legend:[[en,el]], note, source, period, unit,
            ui:{play, pause}, ariaLabel, textRows }
  view  = { station, pollutant, stationName, stationType, pollutantName, symbol, unit, scale, measured, blank,
            cells:[cell], heading, empty|null, ariaLabel, textRows }
  cell  = { i, hour, iso, clock, value|null, text|null, t (0..1)|null, state:'measured'|'blank', label:[en,el] }
  select(model, {station, pollutant}) returns the same model pointed at another view (unknown ids keep the current one).
  Every visible string is a pair [english, greek]. Works as a browser script (window.SC.viz.hourstripData) and as CommonJS.
*/
(function (root) {
  'use strict';
  const MONTHS = [['January', 'Ιανουαρίου'], ['February', 'Φεβρουαρίου'], ['March', 'Μαρτίου'], ['April', 'Απριλίου'], ['May', 'Μαΐου'], ['June', 'Ιουνίου'], ['July', 'Ιουλίου'], ['August', 'Αυγούστου'], ['September', 'Σεπτεμβρίου'], ['October', 'Οκτωβρίου'], ['November', 'Νοεμβρίου'], ['December', 'Δεκεμβρίου']];
  // the pollutants this widget knows how to name in both languages; `the` is the Greek name with its article
  const POLL = {
    no2: { name: ['Nitrogen dioxide', 'Διοξείδιο του αζώτου'], lower: ['nitrogen dioxide', 'διοξείδιο του αζώτου'], the: 'το διοξείδιο του αζώτου', symbol: 'NO₂' },
    o3: { name: ['Ozone', 'Όζον'], lower: ['ozone', 'όζον'], the: 'το όζον', symbol: 'O₃' },
  };
  const TITLE = ['One day of air pollution, hour by hour', 'Μία μέρα ατμοσφαιρικής ρύπανσης, ώρα με την ώρα'];
  const UI = { play: ['Play', 'Αναπαραγωγή'], pause: ['Pause', 'Παύση'] };
  const EMPTY = ['No hourly air measurements are available right now.', 'Δεν υπάρχουν διαθέσιμες ωριαίες μετρήσεις αέρα αυτή τη στιγμή.'];
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const pair = (p, fb) => (Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null ? [String(p[0]), String(p[1])] : [String(fb), String(fb)]);
  const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

  function dayText(d) {   // '2024-05-15' -> ['15 May 2024', '15 Μαΐου 2024']
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d), mo = m ? MONTHS[Number(m[2]) - 1] : null;
    return mo ? [Number(m[3]) + ' ' + mo[0] + ' ' + m[1], Number(m[3]) + ' ' + mo[1] + ' ' + m[1]] : [String(d), String(d)];
  }

  function emptyModel(why) {
    const e = why || EMPTY;
    return { id: 'hourstrip', title: TITLE, available: false, empty: e, live: false, date: null, dateText: null, replay: null, hours: [], choices: [], pollutants: [],
      station: null, pollutant: null, view: null, views: {}, legend: [], note: e, source: null, period: null, unit: null, ui: UI, ariaLabel: e, textRows: [e] };
  }

  function build(ans, opts) {
    opts = opts || {};
    if (!ans || ans.available === false || !Array.isArray(ans.hours) || !ans.hours.length || !Array.isArray(ans.features) || !ans.features.length) return emptyModel();
    if (!ans.hours.every((h) => typeof h === 'string' && ISO.test(h))) return emptyModel();
    const n = ans.hours.length;
    const hours = ans.hours.map((iso, i) => ({ i, iso, clock: iso.slice(11, 16), hour: Number(iso.slice(11, 13)) }));
    const d0 = ans.hours[0].slice(0, 10), d1 = ans.hours[n - 1].slice(0, 10);
    const dateText = d0 === d1 ? dayText(d0) : [dayText(d0)[0] + ' to ' + dayText(d1)[0], dayText(d0)[1] + ' έως ' + dayText(d1)[1]];
    const replay = ['Replay of ' + dateText[0] + ', not live', 'Επανάληψη, ' + dateText[1] + ', όχι ζωντανά'];
    const stations = ans.features.filter((f) => f && typeof f === 'object').map((f, i) => ({ f, id: String(f.id != null ? f.id : 'station_' + (i + 1)), name: pair(f.name, f.id != null ? f.id : 'Station ' + (i + 1)), type: f.type ? pair(f.type, '') : null }));
    // a pollutant is offered only when it has a name here and at least one station carries an aligned series for it
    const baseUnit = String(ans.unit || '').trim();
    const pollutants = [];
    for (const k of Object.keys(POLL)) {
      if (!stations.some((s) => Array.isArray(s.f[k]) && s.f[k].length === n)) continue;
      const u = baseUnit || String((ans.units && ans.units[k]) || '').trim().split(/\s+/)[0];
      const unit = [u, u];
      let max = null;
      for (const s of stations) if (Array.isArray(s.f[k]) && s.f[k].length === n) for (const v of s.f[k]) if (isNum(v) && (max === null || v > max)) max = v;
      let scale = null;
      if (max !== null) {
        const top = Math.max(10, Math.ceil(max / 10) * 10);
        scale = { min: 0, max: top, text: [
          'Colour and line scale for ' + POLL[k].lower[0] + ': 0 to ' + top + (u ? ' ' + u : '') + ', fixed for the whole day and the same for every station (the highest hourly value of the day, rounded up to the next ten). It is a drawing scale, not a health limit.',
          'Κλίμακα χρώματος και γραμμής για ' + POLL[k].the + ': 0 έως ' + top + (u ? ' ' + u : '') + ', σταθερή για όλη τη μέρα και ίδια για κάθε σταθμό (η υψηλότερη ωριαία τιμή της μέρας, στρογγυλεμένη προς τα πάνω στην επόμενη δεκάδα). Είναι κλίμακα σχεδίασης, όχι όριο υγείας.'] };
      }
      pollutants.push({ k, name: [POLL[k].name[0] + ' (' + POLL[k].symbol + ')', POLL[k].name[1] + ' (' + POLL[k].symbol + ')'], lower: POLL[k].lower, symbol: POLL[k].symbol, unit, scale });
    }
    if (!pollutants.length || !stations.length) return emptyModel();

    const source = ans.source ? pair(ans.source, '') : null, period = ans.period || d0;
    const note = ans.note ? pair(ans.note, '') : ['Blank hours lack a reported measurement.', 'Τα κενά δηλώνουν ώρες χωρίς δημοσιευμένη μέτρηση.'];
    const legend = [
      ['Each cell is one hour; the number is the measurement rounded to a whole number.', 'Κάθε κελί είναι μία ώρα· ο αριθμός είναι η μέτρηση στρογγυλεμένη σε ακέραιο.'],
      ['Hatched: no reported measurement for that hour. Nothing is filled in.', 'Γραμμοσκίαση: χωρίς δημοσιευμένη μέτρηση για εκείνη την ώρα. Τίποτα δεν συμπληρώνεται.'],
    ];
    const tail = [];
    if (source) tail.push(['Source: ' + source[0], 'Πηγή: ' + source[1]]);
    tail.push(['Period: ' + dateText[0] + ' (a past day, replayed; not live)', 'Περίοδος: ' + dateText[1] + ' (περασμένη μέρα σε επανάληψη, όχι ζωντανά)']);
    tail.push(note);

    const views = {}, choices = [];
    for (const s of stations) {
      views[s.id] = {};
      const measuredBy = {};
      for (const p of pollutants) {
        const series = Array.isArray(s.f[p.k]) && s.f[p.k].length === n ? s.f[p.k] : null;
        const sp = p.scale ? p.scale.max - p.scale.min : 0, u = p.unit[0];
        const cells = hours.map((h) => {
          const v = series && isNum(series[h.i]) ? series[h.i] : null;
          if (v === null) return { i: h.i, hour: h.hour, iso: h.iso, clock: h.clock, value: null, text: null, t: null, state: 'blank',
            label: [h.clock + ', ' + s.name[0] + ': no reported measurement of ' + p.lower[0], h.clock + ', ' + s.name[1] + ': χωρίς δημοσιευμένη μέτρηση για ' + POLL[p.k].the] };
          const text = String(Math.round(v) || 0);   // "|| 0" turns -0 into 0
          return { i: h.i, hour: h.hour, iso: h.iso, clock: h.clock, value: v, text, t: sp > 0 ? Math.max(0, Math.min(1, (v - p.scale.min) / sp)) : 0, state: 'measured',
            label: [h.clock + ', ' + s.name[0] + ': ' + text + (u ? ' ' + u : '') + ' ' + p.lower[0], h.clock + ', ' + s.name[1] + ': ' + text + (u ? ' ' + u : '') + ' ' + p.lower[1]] };
        });
        const measured = cells.filter((c) => c.state === 'measured').length, blank = n - measured;
        measuredBy[p.k] = measured;
        const heading = [s.name[0] + ', ' + p.name[0] + ', ' + dateText[0], s.name[1] + ', ' + p.name[1] + ', ' + dateText[1]];
        const empty = measured ? null : ['This station reported no ' + p.lower[0] + ' measurement on this day.', 'Ο σταθμός αυτός δεν δημοσίευσε καμία μέτρηση για ' + POLL[p.k].the + ' αυτή τη μέρα.'];
        const textRows = [[heading[0] + ' (replay of a past day, not live)', heading[1] + ' (επανάληψη περασμένης μέρας, όχι ζωντανά)']];
        if (empty) textRows.push(empty);
        for (const c of cells) textRows.push(c.label);
        if (u) textRows.push(['Unit: ' + u, 'Μονάδα: ' + u]);
        if (p.scale) textRows.push(p.scale.text);
        for (const l of legend) textRows.push(l);
        for (const t of tail) textRows.push(t);
        const ariaLabel = [
          heading[0] + ', hour by hour: ' + measured + ' of ' + n + ' hours have a measurement' + (u ? ', in ' + u : '') + '. A replay of a past day, not live. Left and Right arrows move the hour, Space plays or pauses.',
          heading[1] + ', ώρα με την ώρα: ' + measured + ' από ' + n + ' ώρες έχουν μέτρηση' + (u ? ', σε ' + u : '') + '. Επανάληψη περασμένης μέρας, όχι ζωντανά. Τα βέλη αριστερά και δεξιά αλλάζουν την ώρα, το πλήκτρο διαστήματος ξεκινά ή σταματά την αναπαραγωγή.'];
        views[s.id][p.k] = { station: s.id, pollutant: p.k, stationName: s.name, stationType: s.type, pollutantName: p.name, symbol: p.symbol, unit: p.unit, scale: p.scale,
          measured, blank, cells, heading, empty, ariaLabel, textRows };
      }
      choices.push({ id: s.id, name: s.name, type: s.type, measured: measuredBy });
    }
    const base = { id: 'hourstrip', title: ans.title ? pair(ans.title, TITLE[0]) : TITLE, available: true, empty: null, live: false, date: d0, dateText, replay, hours, choices, pollutants,
      station: null, pollutant: null, view: null, views, legend, note, source, period, unit: null, ui: UI, ariaLabel: null, textRows: null };
    // first view: the asked one; otherwise the first station of the answer that has any measurement (answer order, not a ranking)
    const pk = pollutants.some((p) => p.k === opts.pollutant) ? opts.pollutant : pollutants[0].k;
    const st = views[opts.station] ? opts.station : (choices.find((c) => c.measured[pk] > 0) || choices[0]).id;
    return select(base, { station: st, pollutant: pk });
  }

  // point the model at another station and/or pollutant; nothing is recomputed, the views were all built in build()
  function select(model, want) {
    if (!model || !model.available) return model;
    want = want || {};
    const st = want.station != null && model.views[want.station] ? String(want.station) : model.station;
    const pk = want.pollutant != null && model.views[st] && model.views[st][want.pollutant] ? want.pollutant : model.pollutant;
    const v = model.views[st] && model.views[st][pk];
    if (!v) return model;
    return Object.assign({}, model, { station: st, pollutant: pk, view: v, unit: v.unit, ariaLabel: v.ariaLabel, textRows: v.textRows });
  }

  const api = { build, select, emptyModel, EMPTY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.hourstripData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
