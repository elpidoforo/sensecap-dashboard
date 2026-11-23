/*
  inflow-data.js: the model for the "inflow" widget (water entering the reservoirs, ONE October-to-September water year at a time).
  Pure: no DOM, no clock, no network. Input is public/site/data/inflow.json (Cyprus Water Development Department, open data record
  1017, CC BY-SA 4.0). Values arrive as the published strings; a blank cell is null and stays null (never 0).
  July to September is ONE published interval and stays one. The publisher's TOTAL row is never part of the interval series: it is
  shown beside it, and the sum of the intervals is compared with it here in whole thousandths (no floating point drift).
  The strip of all years is in time order. Nothing is sorted or ranked.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.inflowData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PERIODS = [
    ['OCTOBER', ['October', 'Οκτώβριος'], ['Oct', 'Οκτ'], 0], ['NOVEMBER', ['November', 'Νοέμβριος'], ['Nov', 'Νοε'], 0], ['DECEMBER', ['December', 'Δεκέμβριος'], ['Dec', 'Δεκ'], 0],
    ['JANUARY', ['January', 'Ιανουάριος'], ['Jan', 'Ιαν'], 1], ['FEBRUARY', ['February', 'Φεβρουάριος'], ['Feb', 'Φεβ'], 1], ['MARCH', ['March', 'Μάρτιος'], ['Mar', 'Μάρ'], 1],
    ['APRIL', ['April', 'Απρίλιος'], ['Apr', 'Απρ'], 1], ['MAY', ['May', 'Μάιος'], ['May', 'Μάι'], 1], ['JUNE', ['June', 'Ιούνιος'], ['Jun', 'Ιούν'], 1],
    ['JULY-SEPTEMBER', ['July to September together (3 months, one figure)', 'Ιούλιος έως Σεπτέμβριος μαζί (3 μήνες, ένα μέγεθος)'], ['Jul-Sep', 'Ιούλ-Σεπ'], 1],
  ];
  const U = ['million m³', 'εκατ. m³'];
  const EMPTY = ['The reservoir inflow data could not be loaded.', 'Τα δεδομένα εισροής στους ταμιευτήρες δεν φόρτωσαν.'];
  const SRC = ['Water Development Department, CC BY-SA 4.0', 'Τμήμα Αναπτύξεως Υδάτων, CC BY-SA 4.0'];
  const EL_ACC = { January: 'Ιανουάριο', February: 'Φεβρουάριο', March: 'Μάρτιο', April: 'Απρίλιο', May: 'Μάιο', June: 'Ιούνιο', July: 'Ιούλιο', August: 'Αύγουστο', September: 'Σεπτέμβριο', October: 'Οκτώβριο', November: 'Νοέμβριο', December: 'Δεκέμβριο' };
  const isPub = (s) => typeof s === 'string' && /^\d+(\.\d+)?$/.test(s);
  const decimals = (s) => (s.indexOf('.') < 0 ? 0 : s.length - s.indexOf('.') - 1);
  // published string -> whole number of 10^-d units
  const scaled = (s, d) => { const i = s.indexOf('.'), a = i < 0 ? s : s.slice(0, i), b = (i < 0 ? '' : s.slice(i + 1)); return parseInt(a + (b + '0000000000').slice(0, d), 10); };
  const unscaled = (n, d) => { const neg = n < 0; let s = String(Math.abs(n)); if (d > 0) { while (s.length <= d) s = '0' + s; s = s.slice(0, -d) + '.' + s.slice(-d); } return (neg ? '-' : '') + s; };
  function nice(v) { if (!(v > 0)) return 1; const k = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (m * k >= v) return +(m * k).toPrecision(6); return 10 * k; }
  const ceilTo = (v, step) => Math.max(step, Math.ceil(v / step) * step);

  function year(rec, periods) {
    const y0 = parseInt(String(rec.y).slice(0, 4), 10), partial = rec.partial === true;
    const vals = periods.map((p, i) => (isPub(rec.v && rec.v[i]) ? rec.v[i] : null));
    const total = isPub(rec.total) ? rec.total : null;
    const D = Math.max(3, ...vals.filter((v) => v != null).map(decimals), total == null ? 0 : decimals(total));
    let sum = 0, nPub = 0, lastPub = -1; vals.forEach((v, i) => { if (v != null) { sum += scaled(v, D); nPub++; lastPub = i; } });
    const nBlank = vals.length - nPub, sumText = unscaled(sum, D);
    const intervals = PERIODS.map((P, i) => {
      const v = vals[i], cal = y0 + P[3], pooled = P[0] === 'JULY-SEPTEMBER';
      const whenEn = pooled ? 'July to September ' + cal + ' together (3 months, one figure)' : P[1][0] + ' ' + cal;
      const whenEl = pooled ? 'Ιούλιος έως Σεπτέμβριος ' + cal + ' μαζί (3 μήνες, ένα μέγεθος)' : P[1][1] + ' ' + cal;
      const tail = [' (' + SRC[0] + ', water year ' + rec.y + ').', ' (' + SRC[1] + ', υδρολογικό έτος ' + rec.y + ').'];
      const label = v == null
        ? [whenEn + ': no published value, the cell is blank in the source. Blank is not zero' + tail[0], whenEl + ': δεν υπάρχει δημοσιευμένη τιμή, το κελί είναι κενό στην πηγή. Κενό δεν σημαίνει μηδέν' + tail[1]]
        : [whenEn + ': ' + v + ' ' + U[0] + ' entered the reservoirs' + tail[0], whenEl + ': ' + v + ' ' + U[1] + ' μπήκαν στους ταμιευτήρες' + tail[1]];
      return { k: P[0], name: P[1], short: P[2], months: pooled ? 3 : 1, pooled, calendarYear: cal, published: v, value: v == null ? null : Number(v), label };
    });
    const yMax = nice(intervals.reduce((m, it) => (it.value != null && it.value > m ? it.value : m), 0));
    intervals.forEach((it) => { it.t = it.value == null ? null : it.value / yMax; });
    // the check: do the published intervals add up to the published total?
    let check = { kind: 'none', diff: null, diffText: null };
    const nEn = nPub === vals.length ? 'The ' + nPub + ' published intervals' : 'The ' + nPub + ' intervals that have a value';
    const nEl = nPub === vals.length ? 'Τα ' + nPub + ' δημοσιευμένα διαστήματα' : 'Τα ' + nPub + ' διαστήματα που έχουν τιμή';
    const blankEn = nBlank === 0 ? '' : nBlank === 1 ? ' 1 interval is blank (no published value).' : ' ' + nBlank + ' intervals are blank (no published value).';
    const blankEl = nBlank === 0 ? '' : nBlank === 1 ? ' 1 διάστημα είναι κενό (χωρίς δημοσιευμένη τιμή).' : ' ' + nBlank + ' διαστήματα είναι κενά (χωρίς δημοσιευμένη τιμή).';
    let text;
    if (total == null) text = ['No published total for this year.' + blankEn, 'Δεν υπάρχει δημοσιευμένο σύνολο για αυτό το έτος.' + blankEl];
    else if (!nPub) text = ['No interval has a value, so there is nothing to add up.' + blankEn, 'Κανένα διάστημα δεν έχει τιμή, άρα δεν υπάρχει άθροισμα.' + blankEl];
    else {
      const diff = sum - scaled(total, D), dT = decimals(total), abs = Math.abs(diff), diffText = unscaled(abs, D);
      // the total may be published with fewer decimals than the intervals: half a unit of its last digit is rounding
      const tol = dT < D ? Math.pow(10, D - dT) / 2 : 0;
      const kind = diff === 0 ? 'equal' : abs <= tol ? 'rounding' : 'larger';
      check = { kind, diff: diff / Math.pow(10, D), diffText };
      if (kind === 'equal') text = [nEn + ' add up to ' + sumText + ' ' + U[0] + ', the same as the published total.' + blankEn, nEl + ' δίνουν άθροισμα ' + sumText + ' ' + U[1] + ', ίδιο με το δημοσιευμένο σύνολο.' + blankEl];
      else {
        const more = diff > 0 ? ['more', 'περισσότερο'] : ['less', 'λιγότερο'];
        const head = [nEn + ' add up to ' + sumText + ' ' + U[0] + '. That is ' + diffText + ' ' + more[0] + ' than the published total of ' + total + '.', nEl + ' δίνουν άθροισμα ' + sumText + ' ' + U[1] + '. Αυτό είναι ' + diffText + ' ' + more[1] + ' από το δημοσιευμένο σύνολο ' + total + '.'];
        text = kind === 'rounding'
          ? [head[0] + ' A difference this small fits rounding of the total.' + blankEn, head[1] + ' Τόσο μικρή διαφορά εξηγείται από τη στρογγυλοποίηση του συνόλου.' + blankEl]
          : [head[0] + ' This is more than rounding can explain. The source file does not say why.' + blankEn, head[1] + ' Αυτό δεν εξηγείται από στρογγυλοποίηση. Το αρχείο της πηγής δεν λέει γιατί.' + blankEl];
      }
    }
    check.text = text;
    const last = lastPub >= 0 ? intervals[lastPub] : null;
    const partialText = !partial ? null : last
      ? ['Partial year: values exist only up to ' + last.name[0].split(' together')[0] + ' ' + last.calendarYear + '. The total covers only those months, not a full year.', 'Μερικό έτος: το τελευταίο διάστημα με τιμή είναι: ' + last.name[1].split(' μαζί')[0] + ' ' + last.calendarYear + '. Το σύνολο καλύπτει μόνο αυτούς τους μήνες, όχι ολόκληρο έτος.']
      : ['Partial year: no interval has a value.', 'Μερικό έτος: κανένα διάστημα δεν έχει τιμή.'];
    const totalText = total == null ? ['Published total for ' + rec.y + ': none.', 'Δημοσιευμένο σύνολο για το ' + rec.y + ': δεν υπάρχει.']
      : ['Published total for water year ' + rec.y + (partial ? ' (partial)' : '') + ': ' + total + ' ' + U[0] + '.', 'Δημοσιευμένο σύνολο για το υδρολογικό έτος ' + rec.y + (partial ? ' (μερικό)' : '') + ': ' + total + ' ' + U[1] + '.'];
    const yearName = ['October ' + y0 + ' to September ' + (y0 + 1), 'Οκτώβριος ' + y0 + ' έως Σεπτέμβριος ' + (y0 + 1)];
    return { year: rec.y, yearName, partial, partialText, intervals, yMax, total: total == null ? null : Number(total), totalPublished: total, totalText,
      sum: nPub ? sum / Math.pow(10, D) : null, sumText: nPub ? sumText : null, nPublished: nPub, nBlank, check };
  }

  function build(data, opts) {
    opts = opts || {};
    if (!data || !Array.isArray(data.years) || !data.years.length) return { id: 'inflow', available: false, empty: EMPTY, choices: [], years: {}, strip: [], textRows: [EMPTY], ariaLabel: EMPTY };
    const periods = Array.isArray(data.periods) ? data.periods : PERIODS.map((p) => p[0]);
    // read the intervals by their published names, so the TOTAL row can never slip into the series
    const order = PERIODS.map((P) => periods.indexOf(P[0]));
    const years = {}, choices = [], strip = [];
    for (const rec of data.years) {
      const v = year({ y: rec.y, partial: rec.partial, total: rec.total, v: order.map((i) => (i < 0 || !rec.v ? null : rec.v[i])) }, periods);
      years[v.year] = v;
      choices.push({ id: v.year, name: [v.year + (v.partial ? ' (partial)' : ''), v.year + (v.partial ? ' (μερικό)' : '')] });
    }
    const stripMax = ceilTo(choices.reduce((m, c) => (years[c.id].total != null && years[c.id].total > m ? years[c.id].total : m), 0), 50);
    for (const c of choices) { // time order, exactly as published
      const v = years[c.id];
      strip.push({ year: v.year, total: v.total, totalPublished: v.totalPublished, partial: v.partial, t: v.total == null ? null : v.total / stripMax,
        label: v.total == null ? ['Water year ' + v.year + ': no published total (' + SRC[0] + ').', 'Υδρολογικό έτος ' + v.year + ': χωρίς δημοσιευμένο σύνολο (' + SRC[1] + ').']
          : ['Water year ' + v.year + ': published total ' + v.totalPublished + ' ' + U[0] + (v.partial ? ', partial year (not a full year)' : '') + ' (' + SRC[0] + ').', 'Υδρολογικό έτος ' + v.year + ': δημοσιευμένο σύνολο ' + v.totalPublished + ' ' + U[1] + (v.partial ? ', μερικό έτος (όχι ολόκληρο έτος)' : '') + ' (' + SRC[1] + ').'] });
    }
    const first = choices[0].id, lastId = choices[choices.length - 1].id;
    const period = [first + ' to ' + lastId, first + ' έως ' + lastId];
    const lastPop = data.lastPopulated || '';
    const lastPopEl = lastPop.replace(/^[A-Za-z]+/, (w) => EL_ACC[w] || w);
    const notes = [
      ['Storage also depends on losses, transfers and releases. Inflow is not storage.', 'Το απόθεμα εξαρτάται και από απώλειες, μεταφορές και εκροές. Η εισροή δεν είναι απόθεμα.'],
      ['A water year runs from October to September. July, August and September are published as one figure together, so they are drawn as one wider bar. There is no figure for each of these months.', 'Το υδρολογικό έτος πηγαίνει από τον Οκτώβριο έως τον Σεπτέμβριο. Ο Ιούλιος, ο Αύγουστος και ο Σεπτέμβριος δημοσιεύονται μαζί ως ένα μέγεθος, γι’ αυτό σχεδιάζονται ως μία πιο φαρδιά ράβδος. Δεν υπάρχει μέγεθος για κάθε μήνα χωριστά.'],
      ['A blank month has no published value. It is left empty and is not zero.', 'Ένας κενός μήνας δεν έχει δημοσιευμένη τιμή. Μένει άδειος και δεν είναι μηδέν.'],
      ['One figure for the whole reservoir system that the Water Development Department reports, not for each dam. The years are in time order; nothing is sorted.', 'Ένα μέγεθος για όλο το σύστημα ταμιευτήρων που αναφέρει το Τμήμα Αναπτύξεως Υδάτων, όχι για κάθε φράγμα. Τα έτη είναι σε χρονική σειρά· τίποτα δεν ταξινομείται.'],
      ['Historical file, not live. Water years ' + period[0] + (lastPop ? '; last month with a value: ' + lastPop : '') + '. Retrieved ' + (data.retrieved || '') + '.', 'Ιστορικό αρχείο, όχι ζωντανά δεδομένα. Υδρολογικά έτη ' + period[1] + (lastPop ? '· υπάρχουν τιμές έως ' + lastPopEl : '') + '. Λήψη ' + (data.retrieved || '') + '.'],
      ['Source: Cyprus Water Development Department, open data record 1017, licence CC BY-SA 4.0. Table rearranged for Kleanthis, values unchanged; this copy stays under the same licence.', 'Πηγή: Τμήμα Αναπτύξεως Υδάτων Κύπρου, ανοικτά δεδομένα εγγραφή 1017, άδεια CC BY-SA 4.0. Ο πίνακας αναδιατάχθηκε για τον Κλεάνθη, οι τιμές δεν άλλαξαν· το αντίγραφο μένει με την ίδια άδεια.'],
    ];
    const model = { id: 'inflow', available: true, empty: null, live: false, unit: U, choices, years, strip, stripMax, period, notes,
      strings: {
        title: ['Water entering the reservoirs', 'Νερό που μπήκε στους ταμιευτήρες'],
        still: ['Historical record' + (lastPop ? ' to ' + lastPop : '') + ', not live', 'Ιστορικό αρχείο' + (lastPop ? ' έως ' + lastPopEl : '') + ', όχι ζωντανά'],
        source: SRC, waterYear: ['Water year', 'Υδρολογικό έτος'], total: ['Published total', 'Δημοσιευμένο σύνολο'],
        pooled: ['3 months together', '3 μήνες μαζί'], blank: ['blank', 'κενό'], partial: ['partial year', 'μερικό έτος'],
        axis: ['million m³ in each interval; the scale changes with the year', 'εκατ. m³ σε κάθε διάστημα· η κλίμακα αλλάζει με το έτος'],
        strip: ['Published totals of all water years, in time order (not sorted), million m³', 'Δημοσιευμένα σύνολα όλων των υδρολογικών ετών, σε χρονική σειρά (χωρίς ταξινόμηση), εκατ. m³'],
        stripKey: ['hatched = partial year', 'διαγράμμιση = μερικό έτος'],
        limit: notes[0],
        hint: ['Point at a bar, or use the arrow keys, to read one interval or one year.', 'Δείξτε μια ράβδο ή χρησιμοποιήστε τα βελάκια για να διαβάσετε ένα διάστημα ή ένα έτος.'],
      } };
    return select(model, years[opts.year] ? opts.year : lastFull(choices, years));
  }
  // default view: the latest year that is not partial (a partial year is never the first thing shown)
  function lastFull(choices, years) { for (let i = choices.length - 1; i >= 0; i--) if (!years[choices[i].id].partial) return choices[i].id; return choices[choices.length - 1].id; }
  function select(model, y) {
    const v = model.years && model.years[y]; if (!v) return model;
    const rows = [v.totalText, v.check.text]; if (v.partialText) rows.push(v.partialText);
    const textRows = rows.concat(v.intervals.map((it) => it.label), model.notes, model.strip.map((s) => s.label));
    const ariaLabel = ['Bar chart of water entering the reservoirs in water year ' + v.year + ' (' + v.yearName[0] + '), one bar per reporting interval, in million cubic metres. ' + v.totalText[0] + ' ' + v.check.text[0] + (v.partialText ? ' ' + v.partialText[0] : '') + ' ' + model.notes[0][0],
      'Ραβδόγραμμα του νερού που μπήκε στους ταμιευτήρες το υδρολογικό έτος ' + v.year + ' (' + v.yearName[1] + '), μία ράβδος για κάθε διάστημα αναφοράς, σε εκατομμύρια κυβικά μέτρα. ' + v.totalText[1] + ' ' + v.check.text[1] + (v.partialText ? ' ' + v.partialText[1] : '') + ' ' + model.notes[0][1]];
    return Object.assign({}, model, v, { textRows, ariaLabel });
  }
  return { build, select, year, scaled, unscaled, nice, PERIODS, EMPTY };
});
