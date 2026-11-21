/*
  Roster widget data (pure, tested by tests/viz/roster_test.js). Redraws an "AI team roster" board as the REAL live-feeds
  roster of Kleanthis: one row per live, scheduled or delayed sheet of /api/stack. Everything on screen is an age, a share
  of the refresh interval, or a count of records the feed delivered in its last answer. Nothing is a score.
  Vehicle positions never enter the model: only counts, ages and status are read from vehicle sheets.

  buildModel({ catalogue, sheets }, now, opts) ->
    { id:'roster', title, note, empty|null, now, step:{n,m,text}, rows:[row], skyline:{oneTile, oneTileText, cap, columns:[{id,count,tiles}]},
      textRows:[[en,el]], ariaLabel:[en,el] }
  catalogue = the answer of /api/stack (or null: then the sheets given are used); sheets = { id: answer of /api/stack/<id> | null }.
  now = ms since 1970 (passed in, never read from the clock). opts = { step (0-based), openId, cap (max tiles in a column) }.
  Works as a browser script (window.SC.viz.rosterData) and as a CommonJS module.
*/
(function (root) {
  'use strict';
  const ORDER = ['fire-hotspots', 'air-stations', 'met-stations', 'airports', 'bus-now', 'own-vehicles'];
  const VEHICLE_IDS = ['own-vehicles', 'bus-now'];
  const STEPS = [1, 2, 5];
  const arr = (x) => (Array.isArray(x) ? x : null);
  const pair = (x, fb) => (Array.isArray(x) && x.length >= 2 && typeof x[0] === 'string' ? [x[0], String(x[1] || x[0])] : (typeof x === 'string' && x ? [x, x] : fb));

  const isRoster = (s) => !!s && (s.live === true || s.kind === 'scheduled' || s.kind === 'delayed');

  // ---- maths (the only place numbers are made) -------------------------------------------------------------------
  function ageSeconds(stamp, now) {
    const t = typeof stamp === 'number' ? stamp : Date.parse(stamp);
    if (!isFinite(t) || !isFinite(now)) return null;
    return Math.max(0, Math.round((now - t) / 1000));
  }
  // age as a share of the refresh interval, 0..100, capped at 100. null when either is unknown or the interval is not positive.
  function progressPct(age, refreshSeconds) {
    if (age == null || !(refreshSeconds > 0)) return null;
    return Math.min(100, Math.round((age / refreshSeconds) * 1000) / 10);
  }
  function ageText(s) {
    if (s == null) return ['not fetched yet', 'δεν έχει ληφθεί ακόμη'];
    if (s < 60) return [s + ' s ago', 'πριν ' + s + ' δευτ.'];
    if (s < 3600) { const m = Math.floor(s / 60); return [m + ' min ago', 'πριν ' + m + ' λεπτά']; }
    if (s < 86400) { const h = Math.floor(s / 3600); return [h + ' h ago', 'πριν ' + h + ' ώρες']; }
    const d = Math.floor(s / 86400); return [d + ' d ago', 'πριν ' + d + ' ημέρες'];
  }
  // number of records the feed delivered in its last answer. Never reads a coordinate, only lengths and counts.
  function recordCount(a) {
    if (!a) return 0;
    if (arr(a.features)) return a.features.length;
    if (a.id === 'own-vehicles') {
      if (arr(a.vehicles)) return a.vehicles.length;
      return a.counts && Number.isFinite(a.counts.vehicles) ? a.counts.vehicles : 0;
    }
    if (a.id === 'bus-now') {
      if (arr(a.trips)) return a.trips.length;
      return a.counts && Number.isFinite(a.counts.running) ? a.counts.running : 0;
    }
    if (arr(a.vehicles)) return a.vehicles.length;
    return 0;
  }
  // smallest "one tile = N" (1, 2, 5, 10, 20, 50, ...) so that no column is taller than cap tiles
  function tileUnit(counts, cap) {
    const mx = Math.max(0, ...counts);
    let mag = 1;
    for (;;) { for (const k of STEPS) { const n = k * mag; if (Math.ceil(mx / n) <= cap) return n; } mag *= 10; }
  }
  const tilesOf = (count, n) => (count > 0 ? Math.ceil(count / n) : 0);

  // ---- one row ----------------------------------------------------------------------------------------------------
  function rowOf(meta, a, now) {
    const id = meta.id;
    const title = pair(a && a.title, pair(meta.title, [id, id]));
    const honesty = pair(a && a.honesty, pair(meta.honesty, ['', '']));
    const source = pair(a && a.source, ['Source not stated', 'Η πηγή δεν δηλώνεται']);
    const licence = a && typeof a.licence === 'string' ? a.licence : null;
    const answered = !!a;
    const available = answered && a.available !== false;
    const stamp = answered ? (a.retrieved || a.updated || null) : null;
    const age = available ? ageSeconds(stamp, now) : null;
    const refresh = answered && a.refreshSeconds > 0 ? a.refreshSeconds : null;
    const progress = available ? progressPct(age, refresh) : null;
    const count = available ? recordCount(a) : 0;
    let status, label, reason = null;
    if (!answered) { status = 'noanswer'; label = ['No answer from the server', 'Καμία απάντηση από τον διακομιστή']; reason = label; }
    else if (!available) { status = 'unavailable'; label = ['Not available', 'Δεν είναι διαθέσιμο']; reason = pair(a.reason, ['No reason given by the feed', 'Η πηγή δεν δίνει λόγο']); }
    else if (progress != null && progress >= 100) { status = 'past'; label = ['Past its refresh interval', 'Πέρασε το διάστημα ανανέωσης']; }
    else if (age == null) { status = 'nostamp'; label = ['Available, no fetch time given', 'Διαθέσιμο, χωρίς ώρα λήψης']; }
    else { status = 'ok'; label = ['Within its refresh interval', 'Εντός διαστήματος ανανέωσης']; }
    const kind = (a && a.kind) || meta.kind || null;
    return { id, title, kind, status, statusLabel: label, available, reason, source, licence: licence ? [licence, licence] : [ 'Licence not stated', 'Η άδεια δεν δηλώνεται'], honesty,
      generated: (answered && a.generated) || null, fetchedAt: stamp, ageSeconds: age, ageText: ageText(age), refreshSeconds: refresh, progress, capped: progress === 100,
      count, isVehicle: VEHICLE_IDS.indexOf(id) >= 0, demo: !!(a && a.demo) };
  }

  function rowText(r, oneTile) {
    const rec = r.available ? [r.count + (r.count === 1 ? ' record' : ' records') + ' in the last answer', r.count + (r.count === 1 ? ' εγγραφή' : ' εγγραφές') + ' στην τελευταία απάντηση'] : null;
    const prog = r.progress == null ? ['no refresh share', 'χωρίς ποσοστό ανανέωσης'] : [r.progress + '% of its refresh interval' + (r.capped ? ' (capped at 100%)' : ''), r.progress + '% του διαστήματος ανανέωσης' + (r.capped ? ' (έως 100%)' : '')];
    const demo = r.demo ? [' Demo data.', ' Δεδομένα επίδειξης.'] : ['', ''];
    if (!r.available) return [r.title[0] + ': ' + r.statusLabel[0] + '. ' + r.reason[0], r.title[1] + ': ' + r.statusLabel[1] + '. ' + r.reason[1]];
    return [r.title[0] + ': ' + r.statusLabel[0] + ', last fetched ' + r.ageText[0] + ', ' + prog[0] + ', ' + rec[0] + '.' + demo[0],
      r.title[1] + ': ' + r.statusLabel[1] + ', τελευταία λήψη ' + r.ageText[1] + ', ' + prog[1] + ', ' + rec[1] + '.' + demo[1]];
  }

  // ---- the model ----------------------------------------------------------------------------------------------------
  function buildModel(input, now, opts) {
    opts = opts || {};
    const cat = input && arr(input.catalogue && input.catalogue.sheets) ? input.catalogue.sheets : null;
    const sheets = (input && input.sheets) || {};
    let metas;
    if (cat) {
      const pick = cat.filter(isRoster);
      metas = pick.slice().sort((x, y) => { const i = ORDER.indexOf(x.id), j = ORDER.indexOf(y.id); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
    } else metas = Object.keys(sheets).filter((id) => isRoster(sheets[id])).map((id) => ({ id }));
    const rows = metas.map((m) => rowOf(m, sheets[m.id] || null, now));
    const cap = Math.max(1, opts.cap | 0 || 12);
    const unit = tileUnit(rows.map((r) => r.count), cap);
    const columns = rows.map((r) => ({ id: r.id, count: r.count, tiles: tilesOf(r.count, unit), available: r.available }));
    const m = rows.length;
    const idx = m ? Math.min(m - 1, Math.max(0, opts.step | 0)) : 0;
    const oneTileText = unit === 1 ? ['one tile = 1 record', 'ένα πλακίδιο = 1 εγγραφή'] : ['one tile = ' + unit + ' records', 'ένα πλακίδιο = ' + unit + ' εγγραφές'];
    const textRows = rows.map((r) => rowText(r, unit));
    const head = rows.length ? [rows.length + ' feeds that update: ' + rows.filter((r) => r.available).length + ' answering.', rows.length + ' πηγές που ανανεώνονται: ' + rows.filter((r) => r.available).length + ' απαντούν.'] : null;
    if (head) textRows.unshift(head);
    if (m) textRows.push([oneTileText[0] + '; a started tile counts as one. Tiles show how many records came in the last answer, not a score.', oneTileText[1] + '· ένα ξεκινημένο πλακίδιο μετρά ως ένα. Τα πλακίδια δείχνουν πόσες εγγραφές ήρθαν στην τελευταία απάντηση, όχι βαθμό.']);
    return {
      id: 'roster', title: ['Live feeds roster', 'Κατάλογος ζωντανών πηγών'],
      note: ['Age is the time since the last fetch as a share of the feed\'s own refresh interval. It shows freshness only, not quality. Vehicle sheets show counts and ages, never positions.', 'Η ηλικία είναι ο χρόνος από την τελευταία λήψη ως ποσοστό του διαστήματος ανανέωσης της ίδιας της πηγής. Δείχνει μόνο φρεσκάδα, όχι ποιότητα. Τα οχήματα δείχνουν αριθμούς και ηλικίες, ποτέ θέσεις.'],
      empty: m ? null : ['No live feed sheet was given to this widget.', 'Δεν δόθηκε καμία ζωντανή πηγή σε αυτό το γραφικό.'],
      now, step: { n: m ? idx + 1 : 0, m, index: idx, text: ['step ' + (m ? idx + 1 : 0) + '/' + m, 'βήμα ' + (m ? idx + 1 : 0) + '/' + m], hint: ['A reading aid: click or use the arrow keys to walk through the rows. It is not progress of anything.', 'Βοήθημα ανάγνωσης: κλικ ή βέλη για να περάσετε τις γραμμές. Δεν είναι πρόοδος κανενός πράγματος.'] },
      openId: opts.openId || null,
      rows, skyline: { oneTile: unit, oneTileText, cap, columns, title: ['Records in the last answer', 'Εγγραφές στην τελευταία απάντηση'] },
      textRows,
      ariaLabel: m ? ['Roster of ' + m + ' live, scheduled or delayed feeds, ' + rows.filter((r) => r.available).length + ' answering. ' + oneTileText[0] + '. Details are listed below.', 'Κατάλογος ' + m + ' ζωντανών, προγραμματισμένων ή καθυστερημένων πηγών, ' + rows.filter((r) => r.available).length + ' απαντούν. ' + oneTileText[1] + '. Οι λεπτομέρειες είναι στη λίστα κάτω.']
        : ['Roster of feeds: no data given.', 'Κατάλογος πηγών: δεν υπάρχουν δεδομένα.']
    };
  }

  const api = { buildModel, ageSeconds, progressPct, ageText, recordCount, tileUnit, tilesOf, ORDER, isRoster };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.rosterData = api;
})(typeof window !== 'undefined' ? window : globalThis);
