/*
  pmpair-data.js: the model for the "pmpair" widget (daily PM10 at two OUTDOOR monitors, one year at a time).
  Pure: no DOM, no clock, no network. Input is public/site/data/pmpair.json (Bimenyimana et al., Zenodo
  10.5281/zenodo.18305165, CC BY 4.0; only days with a value at both sites, stored to 0.001 µg/m³).
  Every difference and every median is computed here from the two stored values. A day without a pair is a gap,
  never a zero. Years are listed in the source's order. Two lines on one axis do not show a cause, and the notes say so.
  select(model, year, scale): year is a string such as '2012'; scale is 'full' (nothing cut) or 'zoom' (axis stops at
  ZOOM_CAP and higher days are marked at the top edge and counted).
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.pmpairData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = ['The PM10 data of the two monitors could not be loaded.', 'Τα δεδομένα PM10 των δύο σταθμών δεν φόρτωσαν.'];
  const UNIT = 'µg/m³';
  const ZOOM_CAP = 150;
  const MONTHS = [['January', 'Ιανουαρίου', 'Ιανουάριος'], ['February', 'Φεβρουαρίου', 'Φεβρουάριος'], ['March', 'Μαρτίου', 'Μάρτιος'], ['April', 'Απριλίου', 'Απρίλιος'], ['May', 'Μαΐου', 'Μάιος'], ['June', 'Ιουνίου', 'Ιούνιος'],
    ['July', 'Ιουλίου', 'Ιούλιος'], ['August', 'Αυγούστου', 'Αύγουστος'], ['September', 'Σεπτεμβρίου', 'Σεπτέμβριος'], ['October', 'Οκτωβρίου', 'Οκτώβριος'], ['November', 'Νοεμβρίου', 'Νοέμβριος'], ['December', 'Δεκεμβρίου', 'Δεκέμβριος']];
  const MONTH_TICKS = [['J', 'Ι'], ['F', 'Φ'], ['M', 'Μ'], ['A', 'Α'], ['M', 'Μ'], ['J', 'Ι'], ['J', 'Ι'], ['A', 'Α'], ['S', 'Σ'], ['O', 'Ο'], ['N', 'Ν'], ['D', 'Δ']];
  const SCALES = [
    { id: 'full', name: ['Full scale (nothing cut)', 'Πλήρης κλίμακα (τίποτα δεν κόβεται)'] },
    { id: 'zoom', name: ['Close-up to ' + ZOOM_CAP + ' ' + UNIT, 'Κοντινή ματιά έως ' + ZOOM_CAP + ' ' + UNIT] },
  ];
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  // a number as text: [en with a point, el with a comma]; null is a dash
  const num = (v, d) => (v == null ? ['–', '–'] : [v.toFixed(d), v.toFixed(d).replace('.', ',')]);
  const signed = (v, d) => { if (v == null) return ['–', '–']; const s = Math.abs(v).toFixed(d), sign = Number(s) === 0 ? '' : v > 0 ? '+' : '−'; return [sign + s, sign + s.replace('.', ',')]; };
  const thousands = (n) => [String(n).replace(/\B(?=(\d{3})+$)/g, ','), String(n).replace(/\B(?=(\d{3})+$)/g, '.')];

  function median(list) {
    const v = list.filter(isNum).slice().sort((a, b) => a - b); if (!v.length) return null;
    const h = v.length >> 1; return v.length % 2 ? v[h] : r3((v[h - 1] + v[h]) / 2);
  }
  function niceMax(v) {
    if (!isNum(v) || v <= 0) return { max: 10, step: 5 };
    for (const step of [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (v / step <= 6) return { max: Math.ceil(v / step) * step, step };
    return { max: Math.ceil(v / 1000) * 1000, step: 1000 };
  }
  function dateOf(year, doy) { const d = new Date(Date.UTC(year, 0, doy)); return { month: d.getUTCMonth(), dom: d.getUTCDate() }; }

  function yearView(key, raw, sites) {
    const year = Number(key), total = leap(year) ? 366 : 365, days = [];
    const n = raw && Array.isArray(raw.day) ? raw.day.length : 0;
    for (let i = 0; i < n; i++) {
      const a = raw.nictra[i], b = raw.amx[i], doy = raw.day[i];
      if (!isNum(a) || !isNum(b) || !isNum(doy)) continue; // a day without both values is a gap, never a zero
      const dt = dateOf(year, doy), diff = r3(a - b), A = num(a, 1), B = num(b, 1), Dd = signed(diff, 1);
      const dEn = dt.dom + ' ' + MONTHS[dt.month][0] + ' ' + year, dEl = dt.dom + ' ' + MONTHS[dt.month][1] + ' ' + year;
      days.push({ date: year + '-' + pad2(dt.month + 1) + '-' + pad2(dt.dom), doy, month: dt.month, x: (doy - 0.5) / total, nictra: a, amx: b, diff, dateText: [dEn, dEl],
        nictraText: [sites.nictra.short[0] + ' ' + A[0] + ' ' + UNIT, sites.nictra.short[1] + ' ' + A[1] + ' ' + UNIT],
        amxText: [sites.amx.short[0] + ' ' + B[0] + ' ' + UNIT, sites.amx.short[1] + ' ' + B[1] + ' ' + UNIT],
        diffText: ['difference ' + Dd[0] + ' ' + UNIT + ' (traffic site minus background site)', 'διαφορά ' + Dd[1] + ' ' + UNIT + ' (σταθμός κυκλοφορίας μείον σταθμός υποβάθρου)'],
        label: [dEn + ': ' + sites.nictra.short[0] + ' ' + A[0] + ' ' + UNIT + ', ' + sites.amx.short[0] + ' ' + B[0] + ' ' + UNIT + ', difference ' + Dd[0] + ' ' + UNIT + ' (traffic site minus background site). Daily PM10, both monitors outdoors.',
          dEl + ': ' + sites.nictra.short[1] + ' ' + A[1] + ' ' + UNIT + ', ' + sites.amx.short[1] + ' ' + B[1] + ' ' + UNIT + ', διαφορά ' + Dd[1] + ' ' + UNIT + ' (σταθμός κυκλοφορίας μείον σταθμός υποβάθρου). Ημερήσια PM10, και οι δύο σταθμοί σε εξωτερικό χώρο.'] });
    }
    days.sort((p, q) => p.doy - q.doy);
    // runs of days that follow each other: the lines are drawn run by run, so a missing day is a visible gap
    const runs = []; days.forEach((d, i) => { if (i && days[i - 1].doy === d.doy - 1) runs[runs.length - 1].push(i); else runs.push([i]); });
    const med = median(days.map((d) => d.diff)), M = signed(med, 2), paired = days.length;
    const top = days.reduce((m, d) => Math.max(m, d.nictra, d.amx), 0);
    const above = days.filter((d) => d.nictra > ZOOM_CAP || d.amx > ZOOM_CAP).length;
    const countText = [paired + ' of the ' + total + ' days of ' + year + ' have a value at both monitors (paired days); ' + (total - paired) + ' days have no pair and are gaps.',
      paired + ' από τις ' + total + ' ημέρες του ' + year + ' έχουν τιμή και στους δύο σταθμούς (ζευγάρια ημερών)· ' + (total - paired) + ' ημέρες δεν έχουν ζευγάρι και είναι κενά.'];
    const medianText = paired ? ['Median same-day difference in ' + year + ': ' + M[0] + ' ' + UNIT + ' (traffic site minus background site), from ' + paired + ' paired days.',
      'Διάμεση διαφορά της ίδιας ημέρας το ' + year + ': ' + M[1] + ' ' + UNIT + ' (σταθμός κυκλοφορίας μείον σταθμός υποβάθρου), από ' + paired + ' ζευγάρια ημερών.']
      : ['No paired days in ' + year + ', so there is no median.', 'Δεν υπάρχουν ζευγάρια ημερών το ' + year + ', άρα δεν υπάρχει διάμεσος.'];
    const months = MONTHS.map((mn, k) => {
      const ds = days.filter((d) => d.month === k), mm = median(ds.map((d) => d.diff)), t = signed(mm, 2);
      return { month: k, pairedDays: ds.length, median: mm, text: ds.length
        ? [mn[0] + ' ' + year + ': ' + ds.length + ' paired days, median same-day difference ' + t[0] + ' ' + UNIT + ' (from ' + ds.length + ' days).', mn[2] + ' ' + year + ': ' + ds.length + ' ζευγάρια ημερών, διάμεση διαφορά της ίδιας ημέρας ' + t[1] + ' ' + UNIT + ' (από ' + ds.length + ' ημέρες).']
        : [mn[0] + ' ' + year + ': no paired days.', mn[2] + ' ' + year + ': κανένα ζευγάρι ημερών.'] };
    });
    return { year: key, daysInYear: total, days, runs, pairedDays: paired, missingDays: total - paired, median: med, medianDays: paired, maxValue: paired ? top : null, aboveZoom: above, months, countText, medianText };
  }

  function build(data, opts) {
    opts = opts || {};
    // yearOrder keeps the order of the source table (object keys that look like numbers would be re-sorted by the engine)
    const has = data && data.years && typeof data.years === 'object';
    const keys = !has ? [] : Array.isArray(data.yearOrder) ? data.yearOrder.map(String).filter((k, i, l) => data.years[k] && l.indexOf(k) === i) : Object.keys(data.years);
    if (!keys.length) return { id: 'pmpair', available: false, live: false, empty: EMPTY, choices: [], scaleChoices: [], years: {}, textRows: [EMPTY], ariaLabel: EMPTY };
    const S = data.sites || {}, site = (k, short, nm, kind) => ({ key: k, code: (S[k] && S[k].code) || k.toUpperCase(), short, name: (S[k] && S[k].name) || nm, kind: (S[k] && S[k].kind) || kind });
    const sites = {
      nictra: site('nictra', ['Nicosia traffic', 'Λευκωσία, κυκλοφορία'], ['Nicosia traffic station (NICTRA)', 'Σταθμός κυκλοφορίας Λευκωσίας (NICTRA)'], ['outdoor monitor, urban traffic site', 'υπαίθριος σταθμός, αστικός σταθμός κυκλοφορίας']),
      amx: site('amx', ['Agia Marina Xyliatou', 'Αγία Μαρίνα Ξυλιάτου'], ['Agia Marina Xyliatou (AMX)', 'Αγία Μαρίνα Ξυλιάτου (AMX)'], ['outdoor monitor, regional background site', 'υπαίθριος σταθμός, σταθμός υποβάθρου περιοχής']),
    };
    const years = {}, choices = [];
    for (const k of keys) { years[k] = yearView(k, data.years[k], sites); choices.push({ id: k, name: [k, k] }); } // the source's own order
    const allDiff = []; for (const k of keys) for (const d of years[k].days) allDiff.push(d.diff);
    const am = median(allDiff), AM = signed(am, 2), AN = thousands(allDiff.length), span = keys[0] + (keys.length > 1 ? '–' + keys[keys.length - 1] : '');
    const all = { pairedDays: allDiff.length, median: am, span,
      text: ['All years in the file (' + span + '): ' + AN[0] + ' paired days, median same-day difference ' + AM[0] + ' ' + UNIT + '.', 'Όλα τα έτη του αρχείου (' + span + '): ' + AN[1] + ' ζευγάρια ημερών, διάμεση διαφορά της ίδιας ημέρας ' + AM[1] + ' ' + UNIT + '.'] };
    const src = (data.sources && data.sources[0]) || {};
    const sourceText = ['Source: ' + (src.credit || 'Elie Bimenyimana et al., CC BY 4.0') + ', ' + (src.url || 'https://doi.org/10.5281/zenodo.18305165') + '. Retrieved ' + (data.retrieved || '') + '. Only days with both values are kept.',
      'Πηγή: ' + (src.credit || 'Elie Bimenyimana et al., CC BY 4.0') + ', ' + (src.url || 'https://doi.org/10.5281/zenodo.18305165') + '. Λήψη ' + (data.retrieved || '') + '. Κρατήθηκαν μόνο οι ημέρες με δύο τιμές.'];
    const what = [
      ['PM10 is the mass of particles smaller than 10 micrometres in one cubic metre of air, here one value per day in ' + UNIT + '.', 'Τα PM10 είναι η μάζα των σωματιδίων που είναι μικρότερα από 10 μικρόμετρα σε ένα κυβικό μέτρο αέρα, εδώ μία τιμή την ημέρα σε ' + UNIT + '.'],
      [sites.nictra.name[0] + ': ' + sites.nictra.kind[0] + '. ' + sites.amx.name[0] + ': ' + sites.amx.kind[0] + '. Both monitors are outdoors.', sites.nictra.name[1] + ': ' + sites.nictra.kind[1] + '. ' + sites.amx.name[1] + ': ' + sites.amx.kind[1] + '. Και οι δύο σταθμοί είναι σε εξωτερικό χώρο.'],
    ];
    const notes = what.concat(Array.isArray(data.notes) ? data.notes : [], [
      ['The two lines share one picture so you can read them together. They do not show that one causes the other.', 'Οι δύο γραμμές είναι στην ίδια εικόνα για να τις διαβάζετε μαζί. Δεν δείχνουν ότι η μία προκαλεί την άλλη.'],
      data.rounding || ['Values are stored to 0.001 ' + UNIT + '.', 'Οι τιμές φυλάσσονται με ακρίβεια 0,001 ' + UNIT + '.'], sourceText]);
    const model = { id: 'pmpair', available: true, empty: null, live: false, unit: UNIT, zoomCap: ZOOM_CAP, choices, scaleChoices: SCALES, years, all, sites, notes, monthTicks: MONTH_TICKS,
      period: data.period || null, retrieved: data.retrieved || null,
      strings: {
        title: ['Daily PM10 at two outdoor monitors', 'Ημερήσια PM10 σε δύο υπαίθριους σταθμούς'],
        still: ['daily values of the archive ' + span + ', not live', 'ημερήσιες τιμές του αρχείου ' + span + ', όχι ζωντανά'],
        hint: ['Point at a day, or use the left and right arrow keys, to read both values and their difference.', 'Δείξτε μια ημέρα ή χρησιμοποιήστε τα βελάκια αριστερά και δεξιά για να διαβάσετε τις δύο τιμές και τη διαφορά τους.'],
        gap: ['a break in a line = a day without a pair', 'κενό στη γραμμή = ημέρα χωρίς ζευγάρι'],
        noDays: ['No paired days in this year.', 'Δεν υπάρχουν ζευγάρια ημερών σε αυτό το έτος.'],
        limit: ['Weather and regional dust affect both sites. The difference does not show what causes it.', 'Ο καιρός και η σκόνη της περιοχής επηρεάζουν και τους δύο σταθμούς. Η διαφορά δεν δείχνει τι την προκαλεί.'],
        source: ['Source: ' + (src.credit || 'Elie Bimenyimana et al., CC BY 4.0'), 'Πηγή: ' + (src.credit || 'Elie Bimenyimana et al., CC BY 4.0')],
      } };
    return select(model, years[opts.year] ? String(opts.year) : choices[0].id, opts.scale);
  }

  function select(model, year, scale) {
    if (!model || !model.available) return model;
    const y = year != null && model.years[String(year)] ? String(year) : model.year;
    const s = scale === 'full' || scale === 'zoom' ? scale : model.scale || 'full';
    if (y === model.year && s === model.scale) return model;
    const v = model.years[y]; if (!v) return model;
    const nm = niceMax(v.maxValue), zoom = s === 'zoom';
    const axis = zoom && v.maxValue > model.zoomCap ? { max: model.zoomCap, step: 50 } : nm;
    const cut = zoom && v.maxValue > model.zoomCap ? v.aboveZoom : 0;
    const scaleText = cut ? ['Close-up: the axis stops at ' + model.zoomCap + ' ' + model.unit + '. ' + cut + ' days with a higher value are marked with a triangle at the top edge. Their values are in the read-out.',
      'Κοντινή ματιά: ο άξονας σταματά στα ' + model.zoomCap + ' ' + model.unit + '. ' + cut + ' ημέρες με μεγαλύτερη τιμή σημειώνονται με τρίγωνο στο πάνω άκρο. Οι τιμές τους φαίνονται στην ανάγνωση.'] : null;
    const head = [v.countText, v.medianText, model.all.text];
    const textRows = head.concat(scaleText ? [scaleText] : [], v.months.map((m) => m.text), model.notes);
    const ariaLabel = ['Line chart of daily PM10 in ' + y + ' at two outdoor monitors, ' + model.sites.nictra.name[0] + ' and ' + model.sites.amx.name[0] + ', in ' + model.unit + '. ' + v.countText[0] + ' ' + v.medianText[0] + ' ' + model.strings.limit[0],
      'Γράφημα γραμμών με τα ημερήσια PM10 το ' + y + ' σε δύο υπαίθριους σταθμούς, ' + model.sites.nictra.name[1] + ' και ' + model.sites.amx.name[1] + ', σε ' + model.unit + '. ' + v.countText[1] + ' ' + v.medianText[1] + ' ' + model.strings.limit[1]];
    return Object.assign({}, model, v, { year: y, scale: s, axisMax: axis.max, axisStep: axis.step, cutDays: cut, scaleText, textRows, ariaLabel });
  }
  return { build, select, median, niceMax, yearView, ZOOM_CAP, EMPTY };
});
