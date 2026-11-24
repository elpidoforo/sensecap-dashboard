/*
  gates-data.js: the model for the Data Gates board: every source of the site against every check ("gate") it faces.
  Pure: no DOM, no clock, no network. Input: the answer of /api/health (sources, extracts, their gates, builders, pages).
  Each cell is one check of one source, with the status the server reported: pass, warn or fail. Nothing is recomputed, nothing
  is ranked: sources keep the server's order inside their group, gates the order in which they first appear.
  A source that is not answering is shown as "not answering", never as a zero.
  The board plays the gates one after the other so they can be watched; the server reports them together (the model says so).
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.gatesData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = ['The report of the checks could not be loaded.', 'Η αναφορά των ελέγχων δεν φόρτωσε.'];
  const GROUPS = [['official', ['Official stations', 'Επίσημοι σταθμοί']], ['own', ['Our own sensors', 'Οι δικοί μας αισθητήρες']], ['model', ['Models and satellites', 'Μοντέλα και δορυφόροι']], ['context', ['Context', 'Πλαίσιο']], ['extract', ['Saved extracts', 'Αποθηκευμένα αποσπάσματα']]];
  const KIND = { time: ['time', 'χρόνος'], values: ['values', 'τιμές'], meta: ['records', 'στοιχεία'], cross: ['comparison', 'σύγκριση'] };
  const STATUS = { pass: ['passed', 'πέρασε'], warn: ['warning', 'προειδοποίηση'], fail: ['failed', 'απέτυχε'] };
  const START = 1200, STEP = 1000, RESULT = 600, HOLD = 3800;
  const pair = (a, b) => [String(a == null ? '' : a), String(b == null || b === '' ? (a == null ? '' : a) : b)];
  const st = (s) => (s === 'pass' || s === 'warn' || s === 'fail' ? s : 'unknown');
  function timeText(ms) { const t = typeof ms === 'number' && isFinite(ms) ? new Date(ms) : null; if (!t || isNaN(t)) return ['time not reported', 'η ώρα δεν αναφέρθηκε']; const s = String(t.getUTCHours()).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0') + ' UTC'; return [s, s]; }

  function build(h) {
    const src = h && Array.isArray(h.sources) ? h.sources : [], ext = h && Array.isArray(h.extracts) ? h.extracts : [];
    const none = { id: 'gates', available: false, empty: EMPTY, groups: [], items: [], gates: [], totals: { items: 0, checks: 0, pass: 0, warn: 0, fail: 0, unknown: 0 }, issues: [], builders: [], pages: [], textRows: [EMPTY], ariaLabel: EMPTY, duration: 0 };
    if (!src.length && !ext.length) return none;
    const items = [], gates = [], gById = {};
    const add = (x, group, state) => { if (!x || !x.id) return; const it = { i: items.length, id: String(x.id), name: pair(x.name, x.nameEl), group, state, checks: 0, worst: 'pass' };
      (Array.isArray(x.gates) ? x.gates : []).forEach((q) => { if (!q || !q.id) return; let g = gById[q.id]; if (!g) { g = gById[q.id] = { i: gates.length, id: String(q.id), n: Array.isArray(q.n) ? pair(q.n[0], q.n[1]) : pair(q.id), kind: KIND[q.kind] || pair(q.kind || ''), cells: [], pass: 0, warn: 0, fail: 0, unknown: 0 }; gates.push(g); }
        const s = st(q.status); g.cells.push({ item: it.i, status: s }); g[s]++; it.checks++; if (s === 'fail' || (s === 'warn' && it.worst === 'pass') || (s === 'unknown' && it.worst === 'pass')) it.worst = s; });
      items.push(it); };
    GROUPS.slice(0, 4).forEach((G) => src.filter((x) => x && x.group === G[0]).forEach((x) => add(x, G[0], x.state === 'live' ? 'live' : 'quiet')));
    src.filter((x) => x && !GROUPS.slice(0, 4).some((G) => G[0] === x.group)).forEach((x) => add(x, 'context', x.state === 'live' ? 'live' : 'quiet'));
    ext.forEach((x) => add(x, 'extract', 'saved'));
    const groups = GROUPS.map((G) => { const list = items.filter((it) => it.group === G[0]); return { id: G[0], name: G[1], items: list.map((it) => it.i), live: list.filter((it) => it.state === 'live').length, quiet: list.filter((it) => it.state === 'quiet').length, saved: list.filter((it) => it.state === 'saved').length }; }).filter((g) => g.items.length);
    gates.forEach((g, k) => { g.total = g.cells.length; g.start = START + k * STEP; g.end = g.start + STEP; });
    const t = { items: items.length, checks: 0, pass: 0, warn: 0, fail: 0, unknown: 0, gates: gates.length, live: items.filter((it) => it.state === 'live').length, quiet: items.filter((it) => it.state === 'quiet').length, saved: items.filter((it) => it.state === 'saved').length };
    gates.forEach((g) => { t.checks += g.total; t.pass += g.pass; t.warn += g.warn; t.fail += g.fail; t.unknown += g.unknown; });
    const issues = (h && Array.isArray(h.issues) ? h.issues : []).filter((x) => x && x.gate).map((x) => { const q = x.gate, g = gById[q.id]; return { gate: g ? g.i : -1, status: st(q.status), name: pair(x.name, x.nameEl), check: Array.isArray(q.n) ? pair(q.n[0], q.n[1]) : pair(q.id), note: Array.isArray(q.note) ? pair(q.note[0], q.note[1]) : null }; });
    const names = (list) => (Array.isArray(list) ? list : []).filter((x) => x && Array.isArray(x.n)).map((x) => ({ id: String(x.id), n: pair(x.n[0], x.n[1]) }));
    const when = timeText(h.at), resultAt = START + gates.length * STEP + RESULT, duration = resultAt + HOLD;
    const head = [t.checks + ' checks of ' + t.items + ' sources at ' + gates.length + ' gates: ' + t.pass + ' passed, ' + t.warn + ' warnings, ' + t.fail + ' failed' + (t.unknown ? ', ' + t.unknown + ' with no result' : '') + '. Reported at ' + when[0] + '.',
      t.checks + ' έλεγχοι για ' + t.items + ' πηγές σε ' + gates.length + ' πύλες: πέρασαν ' + t.pass + ', προειδοποιήσεις ' + t.warn + ', απέτυχαν ' + t.fail + (t.unknown ? ', χωρίς αποτέλεσμα ' + t.unknown : '') + '. Αναφορά στις ' + when[1] + '.'];
    const rows = [head].concat(gates.map((g) => [g.n[0] + ' (' + g.kind[0] + '): ' + g.total + ' checked, ' + g.pass + ' passed, ' + g.warn + ' warnings, ' + g.fail + ' failed', g.n[1] + ' (' + g.kind[1] + '): ελέγχθηκαν ' + g.total + ', πέρασαν ' + g.pass + ', προειδοποιήσεις ' + g.warn + ', απέτυχαν ' + g.fail]));
    issues.forEach((x) => rows.push([x.name[0] + ': ' + x.check[0] + ', ' + STATUS[x.status === 'unknown' ? 'warn' : x.status][0] + (x.note ? '. ' + x.note[0] : ''), x.name[1] + ': ' + x.check[1] + ', ' + STATUS[x.status === 'unknown' ? 'warn' : x.status][1] + (x.note ? '. ' + x.note[1] : '')]));
    if (t.quiet) rows.push([t.quiet + ' sources are not answering now. They are shown as not answering, not as zero.', t.quiet + ' πηγές δεν απαντούν τώρα. Φαίνονται ως "δεν απαντούν", όχι ως μηδέν.']);
    rows.push(['The board plays the gates one after the other so they can be watched. The server reports them together.', 'Ο πίνακας παίζει τις πύλες τη μία μετά την άλλη για να φαίνονται. Ο διακομιστής τις αναφέρει όλες μαζί.']);
    if (h && Array.isArray(h.note)) rows.push(pair(h.note[0], h.note[1]));
    return { id: 'gates', available: true, empty: null, groups, items, gates, totals: t, issues, builders: names(h.builders), pages: names(h.feeds), when, note: h && Array.isArray(h.note) ? pair(h.note[0], h.note[1]) : null, textRows: rows, ariaLabel: head, start: START, step: STEP, resultAt, duration };
  }
  // what is on at run time T: which gate is active, how far it is, how many cells of each gate are shown, running totals
  function at(m, T) {
    const o = { active: -1, frac: 0, shown: [], done: 0, pass: 0, warn: 0, fail: 0, checks: 0, result: T >= m.resultAt };
    m.gates.forEach((g) => { const f = Math.max(0, Math.min(1, (T - g.start) / (g.end - g.start))), n = Math.round(g.total * f); o.shown.push(n); if (f > 0 && f < 1) { o.active = g.i; o.frac = f; } if (f >= 1) o.done++;
      for (let k = 0; k < n; k++) { const s = g.cells[k].status; if (s === 'pass') o.pass++; else if (s === 'warn') o.warn++; else if (s === 'fail') o.fail++; o.checks++; } });
    return o;
  }
  return { build, at, timeText, STATUS };
});
