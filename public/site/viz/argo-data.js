/*
  argo-data.js: the model for the "argo" widget (seawater profiles from ONE Argo float, one dive at a time).
  Pure: no DOM, no clock, no network. Input is public/site/data/argo.json (International Argo Program / Coriolis GDAC,
  float 3902484, six dives of July 2024). Pressure (dbar) is the vertical coordinate exactly as measured; nothing is
  interpolated or converted to metres. A missing value stays null. Quality flags are the source's own, one per value.
  Adjusted values are preferred where a profile has them (arrays pa, ta, sa); this file has none, so the real-time values
  are shown and labelled as real-time. The place is the float's own position, rounded: an instrument, not a person.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.argoData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = ['The seawater profile data could not be loaded.', 'Τα δεδομένα των προφίλ της θάλασσας δεν φόρτωσαν.'];
  const MON = [['January', 'Ιανουαρίου'], ['February', 'Φεβρουαρίου'], ['March', 'Μαρτίου'], ['April', 'Απριλίου'], ['May', 'Μαΐου'], ['June', 'Ιουνίου'], ['July', 'Ιουλίου'], ['August', 'Αυγούστου'], ['September', 'Σεπτεμβρίου'], ['October', 'Οκτωβρίου'], ['November', 'Νοεμβρίου'], ['December', 'Δεκεμβρίου']];
  const FLAGS = { '0': ['no quality check done', 'χωρίς έλεγχο ποιότητας'], '1': ['good', 'καλή'], '2': ['probably good', 'μάλλον καλή'], '3': ['probably bad', 'μάλλον κακή'], '4': ['bad', 'κακή'], '5': ['value changed', 'αλλαγμένη τιμή'], '8': ['estimated', 'εκτίμηση'], '9': ['missing', 'λείπει'] };
  const QC = [{ id: 'good', name: ['Only values flagged good by the source (flag 1)', 'Μόνο τιμές που η πηγή σημειώνει ως καλές (σήμανση 1)'] }, { id: 'all', name: ['All values, whatever the flag', 'Όλες οι τιμές, με όποια σήμανση'] }];
  const RANGES = [{ id: 'full', name: ['Whole dive', 'Όλη η κατάδυση'], max: null }, { id: 'top', name: ['Top 300 dbar', 'Τα πρώτα 300 dbar'], max: 300 }];
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const flagName = (f) => FLAGS[f] || ['flag not in the list', 'σήμανση εκτός λίστας'];
  const fx = (v, d) => v.toFixed(d);
  function when(iso) { // '2024-07-06T01:52:20Z' -> texts, read as written (UTC), no clock involved
    const k = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ''); if (!k) return { day: [String(iso), String(iso)], full: [String(iso), String(iso)] };
    const d = +k[3], mo = MON[+k[2] - 1] || ['', ''], day = [d + ' ' + mo[0] + ' ' + k[1], d + ' ' + mo[1] + ' ' + k[1]];
    return { day, full: [day[0] + ', ' + k[4] + ':' + k[5] + ' UTC', day[1] + ', ' + k[4] + ':' + k[5] + ' UTC'] };
  }
  function place(lat, lon) { // rounded to two decimals of a degree (about one kilometre)
    if (!isNum(lat) || !isNum(lon)) return ['position not given', 'δεν δίνεται θέση'];
    const a = fx(Math.abs(lat), 2) + '° ', b = fx(Math.abs(lon), 2) + '° ';
    return [a + (lat >= 0 ? 'N' : 'S') + ', ' + b + (lon >= 0 ? 'E' : 'W'), a + (lat >= 0 ? 'Β' : 'Ν') + ', ' + b + (lon >= 0 ? 'Α' : 'Δ')];
  }
  // one value of one level: adjusted if the profile carries one, otherwise the real-time value
  function val(p, raw, adj, rq, aq, i) {
    if (p[adj] && isNum(p[adj][i])) return { v: p[adj][i], f: ((p[aq] || '')[i] || ' ').trim(), adjusted: true };
    const v = p[raw] ? p[raw][i] : null; return { v: isNum(v) ? v : null, f: ((p[rq] || '')[i] || ' ').trim(), adjusted: false };
  }

  function cycle(c, floatId) {
    const profs = (c.profiles || []).slice().sort((a, b) => a.index - b.index), first = profs[0] || {};
    const w = when(first.time), pl = place(first.lat, first.lon), levels = [];
    let adjusted = 0, noPressure = 0;
    for (const p of profs) {
      const posGood = String(p.positionQC) === '1', n = p.n != null ? p.n : (p.p || []).length;
      for (let i = 0; i < n; i++) {
        const P = val(p, 'p', 'pa', 'pq', 'paq', i), T = val(p, 't', 'ta', 'tq', 'taq', i), S = val(p, 's', 'sa', 'sq', 'saq', i);
        if (P.v == null) { noPressure++; continue; } // no pressure: the level cannot be placed, it is counted and not drawn
        if (P.adjusted || T.adjusted || S.adjusted) adjusted++;
        levels.push({ scheme: p.index, i, p: P.v, pq: P.f, t: T.v, tq: T.f, s: S.v, sq: S.f, adjusted: P.adjusted || T.adjusted || S.adjusted, mode: p.mode,
          tGood: T.v != null && posGood && P.f === '1' && T.f === '1', sGood: S.v != null && posGood && P.f === '1' && S.f === '1' });
      }
    }
    levels.sort((a, b) => a.p - b.p || a.scheme - b.scheme);
    const modes = Array.from(new Set(profs.map((p) => p.mode))).join(', ');
    const valueKind = adjusted === 0 ? ['real-time values, not yet adjusted by the source', 'τιμές πραγματικού χρόνου, που η πηγή δεν έχει ακόμη διορθώσει']
      : adjusted === levels.length ? ['adjusted values from the source', 'διορθωμένες τιμές της πηγής'] : ['adjusted values where the source gives them, real-time values elsewhere', 'διορθωμένες τιμές όπου τις δίνει η πηγή, αλλιώς τιμές πραγματικού χρόνου'];
    return { cycle: c.cycle, file: c.file, floatId, time: first.time, date: w.day, dateText: w.full, place: pl, lat: first.lat, lon: first.lon,
      positionQC: String(first.positionQC), positionGood: profs.every((p) => String(p.positionQC) === '1'), dataMode: modes, valueKind, nAdjusted: adjusted, noPressure,
      schemes: profs.map((p) => ({ index: p.index, n: p.n != null ? p.n : (p.p || []).length })), all: levels };
  }

  function build(data, opts) {
    opts = opts || {};
    if (!data || !Array.isArray(data.cycles) || !data.cycles.length) return { id: 'argo', available: false, empty: EMPTY, choices: [], qcChoices: QC, rangeChoices: RANGES, cycles: {}, textRows: [EMPTY], ariaLabel: EMPTY };
    const fl = String(data.float || ''), cycles = {}, choices = [];
    let pMax = 0, t0 = Infinity, t1 = -Infinity, s0 = Infinity, s1 = -Infinity, total = 0;
    const list = data.cycles.map((c) => cycle(c, fl)).sort((a, b) => String(a.time).localeCompare(String(b.time))); // time order
    for (const c of list) {
      cycles[c.cycle] = c; total += c.all.length + c.noPressure;
      choices.push({ id: c.cycle, name: [c.date[0] + ' (dive ' + c.cycle + ')', c.date[1] + ' (κατάδυση ' + c.cycle + ')'] });
      for (const l of c.all) { if (l.p > pMax) pMax = l.p; if (l.t != null) { if (l.t < t0) t0 = l.t; if (l.t > t1) t1 = l.t; } if (l.s != null) { if (l.s < s0) s0 = l.s; if (l.s > s1) s1 = l.s; } }
    }
    // one fixed scale for every dive, so a position on the picture means the same value whichever dive is shown
    const scales = { p: { min: 0, max: Math.max(100, Math.ceil(pMax / 100) * 100) },
      t: isFinite(t0) ? { min: Math.floor(t0), max: Math.max(Math.floor(t0) + 1, Math.ceil(t1)) } : { min: 0, max: 1 },
      s: isFinite(s0) ? { min: Math.floor(s0 * 10) / 10, max: Math.max(Math.floor(s0 * 10) / 10 + 0.1, Math.ceil(s1 * 10) / 10) } : { min: 0, max: 1 } };
    const units = { p: 'dbar', t: '°C', s: 'psu' };
    const credit = ['Argo float ' + fl + ', International Argo Program and the national programs that contribute to it, Coriolis GDAC, doi:10.17882/42182', 'Πλωτήρας Argo ' + fl + ', Διεθνές Πρόγραμμα Argo και τα εθνικά προγράμματα που συμμετέχουν, Coriolis GDAC, doi:10.17882/42182'];
    const span = [list[0].date[0] + ' to ' + list[list.length - 1].date[0], list[0].date[1] + ' έως ' + list[list.length - 1].date[1]];
    const notes = [
      ['Sparse, drifting coverage: this is one instrument that moves with the water. One float is not the sea around Cyprus.', 'Αραιή κάλυψη που μετακινείται: είναι ένα μόνο όργανο που το παρασύρει το νερό. Ένας πλωτήρας δεν είναι η θάλασσα γύρω από την Κύπρο.'],
      [choices.length + ' dives of one float, ' + span[0] + ', ' + total + ' levels in all. The same search for December 2024 returned no profiles, so there is nothing to show for winter.', choices.length + ' καταδύσεις ενός πλωτήρα, ' + span[1] + ', ' + total + ' επίπεδα συνολικά. Η ίδια αναζήτηση για τον Δεκέμβριο 2024 δεν έδωσε προφίλ, άρα δεν υπάρχει κάτι να δείξουμε για τον χειμώνα.'],
      ['Pressure in dbar is what the float measures on the way up; it grows as the float is deeper. It is not converted to metres here. Temperature in °C (ITS-90), salinity in psu (practical salinity), as the source names them.', 'Η πίεση σε dbar είναι αυτό που μετρά ο πλωτήρας καθώς ανεβαίνει· μεγαλώνει όσο πιο βαθιά είναι ο πλωτήρας. Εδώ δεν μετατρέπεται σε μέτρα. Θερμοκρασία σε °C (ITS-90), αλατότητα σε psu (πρακτική αλατότητα), όπως τα ονομάζει η πηγή.'],
      ['Quality flags come from the source: 1 good, 2 probably good, 3 probably bad, 4 bad. These files are real-time files; the source may publish adjusted values later.', 'Οι σημάνσεις ποιότητας είναι της πηγής: 1 καλή, 2 μάλλον καλή, 3 μάλλον κακή, 4 κακή. Τα αρχεία είναι πραγματικού χρόνου· η πηγή μπορεί να δημοσιεύσει διορθωμένες τιμές αργότερα.'],
      ['The few levels near the surface come from a second profile in the same file with a different sampling scheme. It is the same float, not a second one.', 'Τα λίγα επίπεδα κοντά στην επιφάνεια είναι από δεύτερο προφίλ στο ίδιο αρχείο, με διαφορετικό τρόπο δειγματοληψίας. Είναι ο ίδιος πλωτήρας, όχι δεύτερος.'],
      ['Values are rounded to what the instrument reports: 0.1 dbar, 0.001 °C, 0.001 psu. The place is the position of the float, rounded to 0.01 of a degree.', 'Οι τιμές στρογγυλεύονται σε ό,τι αναφέρει το όργανο: 0.1 dbar, 0.001 °C, 0.001 psu. Ο τόπος είναι η θέση του πλωτήρα, στρογγυλεμένη στο 0.01 της μοίρας.'],
      ['Archive of July 2024, not live. Retrieved ' + (data.retrieved || '') + '. These data were collected and made freely available by the International Argo Program and the national programs that contribute to it (argo.ucsd.edu, ocean-ops.org). Argo float data from the Coriolis GDAC, doi:10.17882/42182.', 'Αρχείο Ιουλίου 2024, όχι ζωντανά δεδομένα. Λήψη ' + (data.retrieved || '') + '. Τα δεδομένα συλλέχθηκαν και διατίθενται ελεύθερα από το Διεθνές Πρόγραμμα Argo και τα εθνικά προγράμματα που συμμετέχουν (argo.ucsd.edu, ocean-ops.org). Δεδομένα πλωτήρων Argo από το Coriolis GDAC, doi:10.17882/42182.'],
    ];
    const model = { id: 'argo', available: true, empty: null, live: false, floatId: fl, totalLevels: total, choices, qcChoices: QC, rangeChoices: RANGES, cycles, scales, units, credit, span, notes,
      strings: {
        title: ['Seawater profile from Argo float ' + fl, 'Προφίλ της θάλασσας από τον πλωτήρα Argo ' + fl],
        still: ['Archive of July 2024, not live', 'Αρχείο Ιουλίου 2024, όχι ζωντανά'], noDec: ['no December 2024 profiles in this search', 'κανένα προφίλ Δεκεμβρίου 2024 σε αυτή την αναζήτηση'],
        taken: ['dive of', 'κατάδυση στις'], near: ['float position, rounded', 'θέση του πλωτήρα, στρογγυλεμένη'],
        temp: ['Temperature, °C', 'Θερμοκρασία, °C'], sal: ['Salinity, psu', 'Αλατότητα, psu'], pres: ['pressure, dbar (deeper is lower)', 'πίεση, dbar (πιο βαθιά είναι πιο κάτω)'],
        keyLine: ['line: main profile', 'γραμμή: κύριο προφίλ'], keySurf: ['squares: second profile near the surface', 'τετράγωνα: δεύτερο προφίλ κοντά στην επιφάνεια'], keyFlag: ['amber: not flagged good', 'κίτρινο: χωρίς σήμανση καλής τιμής'],
        none: ['No value passes this filter in this range.', 'Καμία τιμή δεν περνά αυτό το φίλτρο σε αυτό το εύρος.'], limit: notes[0],
        hint: ['Point at a level, or use the up and down arrow keys (Page Up and Page Down jump 25 levels), to read one level.', 'Δείξτε ένα επίπεδο ή χρησιμοποιήστε τα βελάκια πάνω και κάτω (Page Up και Page Down πηδούν 25 επίπεδα) για να διαβάσετε ένα επίπεδο.'],
      } };
    const firstId = cycles[opts.cycle] ? opts.cycle : choices[0].id;
    return select(model, { cycle: firstId, qc: opts.qc === 'all' ? 'all' : 'good', range: opts.range === 'top' ? 'top' : 'full' });
  }

  function levelLabel(model, c, l, qc) {
    const one = (v, f, shown, d, unit, nameEn, nameEl) => {
      const fn = flagName(f), fl = f === '' ? ['no flag', 'χωρίς σήμανση'] : ['flag ' + f + ', ' + fn[0], 'σήμανση ' + f + ', ' + fn[1]];
      if (v == null) return [nameEn + ' missing', nameEl + ': λείπει'];
      if (!shown) return [nameEn + ' not shown (' + fl[0] + ')', nameEl + ': δεν εμφανίζεται (' + fl[1] + ')'];
      return [nameEn + ' ' + fx(v, d) + ' ' + unit + ' (' + fl[0] + ')', nameEl + ' ' + fx(v, d) + ' ' + unit + ' (' + fl[1] + ')'];
    };
    const T = one(l.t, l.tq, qc === 'all' || l.tGood, 3, '°C', 'temperature', 'θερμοκρασία'), S = one(l.s, l.sq, qc === 'all' || l.sGood, 3, 'psu', 'salinity', 'αλατότητα');
    const kind = l.adjusted ? ['Adjusted value.', 'Διορθωμένη τιμή.'] : ['Real-time value.', 'Τιμή πραγματικού χρόνου.'];
    const sec = l.scheme > 0 ? [' Second profile near the surface.', ' Δεύτερο προφίλ κοντά στην επιφάνεια.'] : ['', ''];
    return [c.date[0] + ', at ' + fx(l.p, 1) + ' dbar: ' + T[0] + '; ' + S[0] + '. ' + kind[0] + sec[0] + ' Argo float ' + c.floatId + '.', c.date[1] + ', στα ' + fx(l.p, 1) + ' dbar: ' + T[1] + '· ' + S[1] + '. ' + kind[1] + sec[1] + ' Πλωτήρας Argo ' + c.floatId + '.'];
  }

  // select(model, { cycle, qc: 'good'|'all', range: 'full'|'top' }): any of the three may be left out and keeps its value
  function select(model, o) {
    if (!model || !model.cycles) return model; o = o || {};
    const id = o.cycle != null && model.cycles[o.cycle] ? o.cycle : model.cycle, c = model.cycles[id]; if (!c) return model;
    const qc = o.qc === 'all' || o.qc === 'good' ? o.qc : model.qc || 'good';
    const rg = model.rangeChoices.find((r) => r.id === o.range) || model.rangeChoices.find((r) => r.id === model.range) || model.rangeChoices[0];
    if (id === model.cycle && qc === model.qc && rg.id === model.range && model.levels) return model;
    const pTop = rg.max == null ? model.scales.p.max : rg.max;
    const cnt = { levels: c.all.length, tHave: 0, sHave: 0, tGood: 0, sGood: 0, tShown: 0, sShown: 0, inRange: 0 };
    const levels = [];
    for (const l of c.all) {
      if (l.t != null) cnt.tHave++; if (l.s != null) cnt.sHave++; if (l.tGood) cnt.tGood++; if (l.sGood) cnt.sGood++;
      const tShow = l.t != null && (qc === 'all' || l.tGood), sShow = l.s != null && (qc === 'all' || l.sGood);
      if (tShow) cnt.tShown++; if (sShow) cnt.sShown++;
      if (!(tShow || sShow) || l.p > pTop) continue;
      cnt.inRange++;
      levels.push(Object.assign({}, l, { tShow, sShow, y: l.p / pTop, tx: tShow ? (l.t - model.scales.t.min) / (model.scales.t.max - model.scales.t.min) : null, sx: sShow ? (l.s - model.scales.s.min) / (model.scales.s.max - model.scales.s.min) : null, label: levelLabel(model, c, l, qc) }));
    }
    const qn = model.qcChoices.find((q) => q.id === qc).name;
    const countText = ['Temperature: ' + cnt.tShown + ' of ' + cnt.tHave + ' values shown. Salinity: ' + cnt.sShown + ' of ' + cnt.sHave + ' values shown. Filter: ' + qn[0].toLowerCase() + '.' + (c.noPressure ? ' ' + c.noPressure + ' levels have no pressure and cannot be drawn.' : ''),
      'Θερμοκρασία: εμφανίζονται ' + cnt.tShown + ' από ' + cnt.tHave + ' τιμές. Αλατότητα: εμφανίζονται ' + cnt.sShown + ' από ' + cnt.sHave + ' τιμές. Φίλτρο: ' + qn[1].toLowerCase() + '.' + (c.noPressure ? ' ' + c.noPressure + ' επίπεδα δεν έχουν πίεση και δεν σχεδιάζονται.' : '')];
    const posText = c.positionGood ? ['Position flag from the source: 1, good.', 'Σήμανση θέσης από την πηγή: 1, καλή.'] : ['Position flag from the source: ' + c.positionQC + ', ' + flagName(c.positionQC)[0] + '. With the good-only filter no value of this dive is shown.', 'Σήμανση θέσης από την πηγή: ' + c.positionQC + ', ' + flagName(c.positionQC)[1] + '. Με το φίλτρο μόνο καλών τιμών δεν εμφανίζεται καμία τιμή αυτής της κατάδυσης.'];
    const head = ['Argo float ' + c.floatId + ', dive ' + c.cycle + ' of ' + c.dateText[0] + ', near ' + c.place[0] + ' (position of the float, rounded). ' + c.all.length + ' levels; ' + c.valueKind[0] + '.', 'Πλωτήρας Argo ' + c.floatId + ', κατάδυση ' + c.cycle + ' στις ' + c.dateText[1] + ', κοντά στο ' + c.place[1] + ' (θέση του πλωτήρα, στρογγυλεμένη). ' + c.all.length + ' επίπεδα· ' + c.valueKind[1] + '.'];
    const rangeText = ['Pressure range shown: 0 to ' + pTop + ' dbar (' + cnt.inRange + ' levels with a value shown).', 'Εύρος πίεσης που φαίνεται: 0 έως ' + pTop + ' dbar (' + cnt.inRange + ' επίπεδα με τιμή που φαίνεται).'];
    // text list: the shallowest and deepest shown level, and every 50th level of the shown list in between (a fixed step, no choosing)
    const sample = levels.filter((l, i) => i === 0 || i === levels.length - 1 || i % 50 === 0).map((l) => l.label);
    const textRows = [head, posText, countText, rangeText].concat(sample, model.notes);
    const ariaLabel = ['Two line charts side by side for one dive of one Argo float: temperature against pressure and salinity against pressure, pressure growing downward. ' + head[0] + ' ' + countText[0] + ' ' + model.notes[0][0],
      'Δύο γραμμικά διαγράμματα δίπλα δίπλα για μία κατάδυση ενός πλωτήρα Argo: θερμοκρασία ως προς την πίεση και αλατότητα ως προς την πίεση, με την πίεση να μεγαλώνει προς τα κάτω. ' + head[1] + ' ' + countText[1] + ' ' + model.notes[0][1]];
    return Object.assign({}, model, { cycle: id, qc, range: rg.id, pTop, date: c.date, dateText: c.dateText, place: c.place, positionGood: c.positionGood, positionQC: c.positionQC, dataMode: c.dataMode, valueKind: c.valueKind, nAdjusted: c.nAdjusted, noPressure: c.noPressure, schemes: c.schemes,
      levels, counts: cnt, head, countText, posText, rangeText, textRows, ariaLabel });
  }
  return { build, select, cycle, when, place, FLAGS, EMPTY };
});
