/*
  Count cards data (pure, tested by tests/viz/countcards_test.js). A row of small cards, one per data sheet that has no
  picture of its own, showing ONLY counts and ages.
  build({ catalogue, sheets, ids }, now) -> model
    catalogue = the answer of /api/stack (or null); sheets = { id: answer of /api/stack/<id> | null }; ids = the cards, IN THIS ORDER
    (cards are never sorted or ranked). now = ms since 1970, passed in, never read from the clock.
  HARD RULE: no position ever enters the model. This file reads only lengths of arrays, published counts, time stamps, titles,
  kinds and reasons. It never reads a coordinate and never copies a record, for any sheet (vehicle sheets included).
    - count = how many records the last answer holds (the counting idea of roster-data.js `recordCount`): the length of
      `features`, else of `vehicles`, else of `trips`, else of `lines` (the bus network, which also gives a stop count), else the
      published `counts`. A sheet that is not available has count null (unknown), never 0.
    - grid = the dot matrix: one dot = `per` records, where per is the smallest of 1, 2, 5, 10, 20, 50, ... that keeps the card at
      DOT_CAP dots or fewer; a started dot counts as one. Each card states its own `per`; dots are not comparable across cards.
    - kindClass: 'live' (kind live), 'scheduled' (kind scheduled, delayed or periodic: it is fetched again on a timetable) or
      'fixed' (snapshot, census, catalogue). Only a live, available card may pulse (`pulse`).
    - age (live and scheduled cards only) = time since the answer's `updated` (else `retrieved`) stamp.
  model = { id:'countcards', title, available, empty|null, now, cards:[card], strings, note, textRows:[[en,el]], ariaLabel:[en,el] }
  card  = { id, title:[en,el], kind, kindClass, kindLabel:[en,el], pulse, status:'available'|'unavailable'|'noanswer',
            statusLabel:[en,el], available, reason:[en,el]|null, count|null, countText:[en,el], noun:[en,el],
            extra:{count, text:[en,el]}|null, grid:{per, dots, cols, rows, capped, label:[en,el]}|null,
            age:{seconds, text:[en,el]}|null, fetchedAt|null, retrieved:[en,el]|null, refreshSeconds|null, demo, demoLabel|null,
            isVehicle, label:[en,el] }
  pick(card) -> { id, title, count, status:[en,el], available } (what the widget hands to opts.onPick)
  Works as a browser script (window.SC.viz.countcardsData) and as CommonJS.
*/
(function (root) {
  'use strict';
  const VEHICLE_IDS = ['own-vehicles', 'bus-now'];
  const DOT_CAP = 60, DOT_COLS = 12, STEPS = [1, 2, 5];
  const arr = (x) => (Array.isArray(x) ? x : null);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const whole = (v) => (isNum(v) && v > 0 ? Math.floor(v) : 0);
  const pair = (x, fb) => (Array.isArray(x) && x.length >= 2 && typeof x[0] === 'string' && x[0] ? [x[0], String(x[1] || x[0])] : (typeof x === 'string' && x ? [x, x] : fb));
  const group = (n, sep) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const fmt = (n) => [group(n, ','), group(n, '.')];

  const NOUNS = {
    records: [['record', 'records'], ['εγγραφή', 'εγγραφές']],
    vehicles: [['vehicle', 'vehicles'], ['όχημα', 'οχήματα']],
    buses: [['bus running by the timetable', 'buses running by the timetable'], ['λεωφορείο σε δρομολόγιο', 'λεωφορεία σε δρομολόγιο']],
    lines: [['bus line', 'bus lines'], ['γραμμή λεωφορείου', 'γραμμές λεωφορείων']],
  };
  const noun = (key, n) => [NOUNS[key][0][n === 1 ? 0 : 1], NOUNS[key][1][n === 1 ? 0 : 1]];
  const KIND = {
    live: ['live', 'ζωντανά'], scheduled: ['scheduled', 'προγραμματισμένα'], delayed: ['delayed', 'με καθυστέρηση'], periodic: ['refreshed periodically', 'περιοδική ανανέωση'],
    snapshot: ['fixed', 'σταθερά'], census: ['fixed (census)', 'σταθερά (απογραφή)'], catalogue: ['fixed (catalogue)', 'σταθερά (κατάλογος)'], unknown: ['kind not stated', 'χωρίς δηλωμένο είδος'],
  };
  const classOf = (kind) => (kind === 'live' ? 'live' : (kind === 'scheduled' || kind === 'delayed' || kind === 'periodic' ? 'scheduled' : 'fixed'));

  // how many records the answer holds, and what they are. Only lengths and published counts are read, never a coordinate.
  function recordCount(a) {
    if (!a || typeof a !== 'object') return { count: 0, noun: 'records' };
    if (arr(a.features)) return { count: a.features.length, noun: 'records' };
    if (a.id === 'own-vehicles' || (a.id !== 'bus-now' && arr(a.vehicles))) return { count: arr(a.vehicles) ? a.vehicles.length : whole(a.counts && a.counts.vehicles), noun: 'vehicles' };
    if (a.id === 'bus-now' || arr(a.trips)) return { count: arr(a.trips) ? a.trips.length : whole(a.counts && a.counts.running), noun: 'buses' };
    if (arr(a.lines)) return { count: a.lines.length, noun: 'lines' };
    if (a.counts && isNum(a.counts.records)) return { count: whole(a.counts.records), noun: 'records' };
    return { count: 0, noun: 'records' };
  }
  // dot matrix: one dot = per records, smallest of 1, 2, 5, 10, ... with at most `cap` dots; a started dot counts as one
  function dotsFor(count, cap, nounKey) {
    cap = Math.max(1, cap | 0 || DOT_CAP);
    count = whole(count);
    let per = 1;
    for (let mag = 1; ; mag *= 10) { const k = STEPS.find((s) => Math.ceil(count / (s * mag)) <= cap); if (k) { per = k * mag; break; } }
    const dots = count ? Math.ceil(count / per) : 0, cols = Math.min(DOT_COLS, Math.max(1, dots));
    const nn = noun(nounKey || 'records', per), N = fmt(per);
    return { per, dots, cols, rows: Math.ceil(dots / cols), capped: per > 1,
      label: ['1 dot = ' + N[0] + ' ' + nn[0] + (per > 1 ? '; a started dot counts as one' : ''), '1 κουκκίδα = ' + N[1] + ' ' + nn[1] + (per > 1 ? '· μια ξεκινημένη κουκκίδα μετρά ως μία' : '')] };
  }
  function ageSeconds(stamp, now) {
    const t = typeof stamp === 'number' ? stamp : (typeof stamp === 'string' ? Date.parse(stamp) : NaN);
    if (!isNum(t) || !isNum(now)) return null;
    return Math.max(0, Math.round((now - t) / 1000));
  }
  function ageText(s) {
    if (s == null) return ['no fetch time given', 'χωρίς ώρα λήψης'];
    if (s < 60) return [s + ' s ago', 'πριν από ' + s + ' δευτ.'];
    if (s < 3600) { const m = Math.floor(s / 60); return [m + ' min ago', 'πριν από ' + m + (m === 1 ? ' λεπτό' : ' λεπτά')]; }
    if (s < 86400) { const h = Math.floor(s / 3600); return [h + ' h ago', 'πριν από ' + h + (h === 1 ? ' ώρα' : ' ώρες')]; }
    const d = Math.floor(s / 86400); return [d + (d === 1 ? ' day ago' : ' days ago'), 'πριν από ' + d + (d === 1 ? ' ημέρα' : ' ημέρες')];
  }

  function cardOf(id, meta, a, now) {
    const title = pair(a && a.title, pair(meta && meta.title, [id, id]));
    const kind = (a && typeof a.kind === 'string' && a.kind) || (meta && typeof meta.kind === 'string' && meta.kind) || ((a && a.live === true) || (meta && meta.live === true) ? 'live' : null);
    const kindClass = kind ? classOf(kind) : 'fixed';
    const kindLabel = KIND[kind] || KIND.unknown;
    const answered = !!a && typeof a === 'object', available = answered && a.available !== false;
    let status, statusLabel, reason = null;
    if (!answered) { status = 'noanswer'; statusLabel = ['not available', 'μη διαθέσιμο']; reason = ['The server gave no answer for this sheet.', 'Ο διακομιστής δεν έδωσε απάντηση για αυτό το φύλλο.']; }
    else if (!available) { status = 'unavailable'; statusLabel = ['not available', 'μη διαθέσιμο']; reason = pair(a.reason, ['The sheet gives no reason.', 'Το φύλλο δεν δίνει λόγο.']); }
    else { status = 'available'; statusLabel = ['available', 'διαθέσιμο']; }
    const rc = available ? recordCount(a) : { count: null, noun: recordCount(a || { id }).noun };
    const count = rc.count, nn = noun(rc.noun, count == null ? 2 : count);
    const countText = count == null ? ['–', '–'] : fmt(count);
    let extra = null;
    if (available && !arr(a.features) && arr(a.lines) && a.stops && isNum(a.stops.count)) { const sc = whole(a.stops.count), f = fmt(sc); extra = { count: sc, text: [f[0] + (sc === 1 ? ' stop' : ' stops'), f[1] + (sc === 1 ? ' στάση' : ' στάσεις')] }; }
    const grid = count == null ? null : dotsFor(count, DOT_CAP, rc.noun);
    const stamp = answered ? (a.updated || a.retrieved || null) : null;
    const timed = kindClass !== 'fixed';
    let age = null;
    if (timed && available) { const s = ageSeconds(stamp, now); age = { seconds: s, text: s == null ? ageText(null) : ['fetched ' + ageText(s)[0], 'λήψη ' + ageText(s)[1]] }; }
    const retrieved = !timed && answered && typeof a.retrieved === 'string' && a.retrieved ? ['retrieved ' + a.retrieved, 'ανάκτηση ' + a.retrieved] : null;
    const demo = !!(a && a.demo === true);
    const isVehicle = VEHICLE_IDS.indexOf(id) >= 0;
    const bitsEn = [statusLabel[0]], bitsEl = [statusLabel[1]];
    if (count != null) { bitsEn.push(countText[0] + ' ' + nn[0] + ' in the last answer'); bitsEl.push(countText[1] + ' ' + nn[1] + ' στην τελευταία απάντηση'); }
    if (extra) { bitsEn.push(extra.text[0]); bitsEl.push(extra.text[1]); }
    bitsEn.push(kindLabel[0]); bitsEl.push(kindLabel[1]);
    if (age) { bitsEn.push(age.text[0]); bitsEl.push(age.text[1]); }
    if (retrieved) { bitsEn.push(retrieved[0]); bitsEl.push(retrieved[1]); }
    let en = title[0] + ': ' + bitsEn.join(', ') + '.', el = title[1] + ': ' + bitsEl.join(', ') + '.';
    if (reason) { en += ' ' + reason[0]; el += ' ' + reason[1]; }
    if (demo) { en += ' Demo data.'; el += ' Δεδομένα επίδειξης.'; }
    if (isVehicle) { en += ' Counts and ages only, no positions.'; el += ' Μόνο αριθμοί και ηλικίες, όχι θέσεις.'; }
    return { id, title, kind: kind || null, kindClass, kindLabel, pulse: kindClass === 'live' && available, status, statusLabel, available, reason,
      count, countText, noun: nn, extra, grid, age, fetchedAt: timed && typeof stamp === 'string' ? stamp : null, retrieved,
      refreshSeconds: answered && isNum(a.refreshSeconds) && a.refreshSeconds > 0 ? a.refreshSeconds : null, demo, demoLabel: demo ? ['Demo data', 'Δεδομένα επίδειξης'] : null, isVehicle, label: [en, el] };
  }

  const TITLE = ['Sheets in numbers', 'Τα φύλλα σε αριθμούς'];
  const EMPTY = ['No data sheet was given to this picture, so there is nothing to count.', 'Δεν δόθηκε κανένα φύλλο δεδομένων σε αυτή την εικόνα, γι’ αυτό δεν υπάρχει τίποτα να μετρηθεί.'];
  const NOTE = ['Each card shows how many records the sheet holds in its last answer and, for sheets that are fetched again, how long ago that was. Dots are scaled per card, so they do not compare one sheet with another. Vehicle sheets show counts and ages only, never positions.',
    'Κάθε κάρτα δείχνει πόσες εγγραφές έχει το φύλλο στην τελευταία του απάντηση και, για τα φύλλα που λαμβάνονται ξανά, πριν από πόση ώρα έγινε η λήψη. Οι κουκκίδες έχουν κλίμακα ανά κάρτα, άρα δεν συγκρίνουν το ένα φύλλο με το άλλο. Τα φύλλα οχημάτων δείχνουν μόνο αριθμούς και ηλικίες, ποτέ θέσεις.'];
  const STRINGS = { open: ['Click or press Enter to show this sheet', 'Κλικ ή Enter για να φανεί αυτό το φύλλο'] };

  function build(input, now) {
    input = input || {};
    const cat = input.catalogue && arr(input.catalogue.sheets) ? input.catalogue.sheets : [];
    const sheets = input.sheets && typeof input.sheets === 'object' ? input.sheets : {};
    const seen = {}, ids = (arr(input.ids) || []).filter((id) => typeof id === 'string' && id && !seen[id] && (seen[id] = true));
    const cards = ids.map((id) => cardOf(id, cat.find((s) => s && s.id === id) || null, sheets[id] || null, now));   // the order given, never sorted
    const n = cards.length, up = cards.filter((c) => c.available).length;
    const base = { id: 'countcards', title: TITLE, available: n > 0, empty: n ? null : EMPTY, now: isNum(now) ? now : null, cards, strings: STRINGS, note: NOTE };
    if (!n) return Object.assign(base, { textRows: [EMPTY], ariaLabel: EMPTY });
    const head = [n + (n === 1 ? ' sheet' : ' sheets') + ', ' + up + ' available, ' + (n - up) + ' not available.', n + (n === 1 ? ' φύλλο' : ' φύλλα') + ', ' + up + ' διαθέσιμα, ' + (n - up) + ' μη διαθέσιμα.'];
    const textRows = [head].concat(cards.map((c) => c.label), [NOTE]);
    const ariaLabel = [TITLE[0] + ': ' + head[0] + ' Counts and ages only. Arrow keys move between the cards, Enter shows a sheet. Details are listed below.',
      TITLE[1] + ': ' + head[1] + ' Μόνο αριθμοί και ηλικίες. Τα βέλη αλλάζουν κάρτα, το Enter δείχνει ένα φύλλο. Οι λεπτομέρειες είναι στη λίστα κάτω.'];
    return Object.assign(base, { textRows, ariaLabel });
  }
  // the record handed to opts.onPick
  const pick = (c) => (c ? { id: c.id, title: c.title, count: c.count, status: c.statusLabel, available: c.available } : null);

  const api = { build, pick, recordCount, dotsFor, ageSeconds, ageText, VEHICLE_IDS, DOT_CAP, DOT_COLS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.countcardsData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
