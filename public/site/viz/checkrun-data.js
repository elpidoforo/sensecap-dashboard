/*
  checkrun-data.js: the model for the Check run board: how the site checks its own pictures. Pure: no DOM, no clock, no network.
  Input: public/site/data/checks.json, written by tools/record-checks.js (it runs every widget test and records how many checks
  passed and failed in each file, with the time and the commit). This is a RECORDED run, not a run in the reader's browser.
  Files stay in alphabetical order (the order they are run in); nothing is ranked. A file with no result line counts as unknown,
  never as passed.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.checkrunData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const isNum = (v) => typeof v === 'number' && isFinite(v) && v >= 0;
  const EMPTY = ['The record of the last check run could not be loaded.', 'Η καταγραφή του τελευταίου ελέγχου δεν φόρτωσε.'];
  const MONTHS_EL = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'], MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dateText(iso) { const t = iso ? new Date(iso) : null; if (!t || isNaN(t)) return ['date not recorded', 'η ημερομηνία δεν καταγράφηκε']; const d = t.getUTCDate(), mo = t.getUTCMonth(), y = t.getUTCFullYear(), hm = String(t.getUTCHours()).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0'); return [d + ' ' + MONTHS_EN[mo] + ' ' + y + ', ' + hm + ' UTC', d + ' ' + MONTHS_EL[mo] + ' ' + y + ', ' + hm + ' UTC']; }
  // a whole percentage that never rounds up to 100: 100 only when nothing failed and nothing is unknown
  function pct(passed, total, clean) { if (!total) return null; if (clean) return 100; return Math.min(99.9, Math.floor(passed / total * 1000) / 10); }

  function build(data) {
    const runs = data && Array.isArray(data.runs) ? data.runs.filter((r) => r && r.id) : [];
    if (!runs.length) return { id: 'checkrun', available: false, empty: EMPTY, files: [], totals: { files: 0, checks: 0, passed: 0, failed: 0, unknown: 0, pct: null }, textRows: [EMPTY], ariaLabel: EMPTY };
    let offset = 0;
    const files = runs.map((r, i) => { const known = isNum(r.passed) && isNum(r.failed), passed = known ? r.passed : 0, failed = known ? r.failed : 0, total = passed + failed, state = !known ? 'unknown' : failed > 0 ? 'failed' : 'passed';
      const f = { i, id: String(r.id), file: r.file || '', passed, failed, total, known, state, first: offset, failures: Array.isArray(r.failures) ? r.failures.slice(0, 5).map(String) : [],
        line: !known ? [r.id + ': no result recorded', r.id + ': δεν καταγράφηκε αποτέλεσμα'] : [r.id + ': ' + passed + ' of ' + total + ' checks passed' + (failed ? ', ' + failed + ' failed' : ''), r.id + ': πέρασαν ' + passed + ' από ' + total + ' ελέγχους' + (failed ? ', απέτυχαν ' + failed : '')] };
      offset += total; return f; });
    const t = { files: files.length, checks: offset, passed: files.reduce((a, f) => a + f.passed, 0), failed: files.reduce((a, f) => a + f.failed, 0), unknown: files.filter((f) => !f.known).length, filesClean: files.filter((f) => f.state === 'passed').length };
    t.pct = pct(t.passed, t.checks, t.failed === 0 && t.unknown === 0);
    const when = dateText(data.recorded), commit = data.commit ? String(data.commit) : null, scope = Array.isArray(data.scope) && data.scope.length === 2 ? [String(data.scope[0]), String(data.scope[1])] : null;
    const head = [t.passed + ' of ' + t.checks + ' checks passed in ' + t.files + ' test files' + (t.failed ? '; ' + t.failed + ' failed' : '') + (t.unknown ? '; ' + t.unknown + ' files gave no result' : '') + '. Recorded on ' + when[0] + (commit ? ', at version ' + commit : '') + '.',
      'Πέρασαν ' + t.passed + ' από ' + t.checks + ' ελέγχους σε ' + t.files + ' αρχεία ελέγχου' + (t.failed ? '· απέτυχαν ' + t.failed : '') + (t.unknown ? '· ' + t.unknown + ' αρχεία δεν έδωσαν αποτέλεσμα' : '') + '. Καταγραφή: ' + when[1] + (commit ? ', έκδοση ' + commit : '') + '.'];
    const rows = [head].concat(files.map((f) => f.line));
    rows.push(['This is a recorded run on the development machine, not a run in your browser. A passing check means the code did what the check asked, not that the data is right.', 'Αυτή είναι καταγραμμένη εκτέλεση στον υπολογιστή ανάπτυξης, όχι εκτέλεση στον φυλλομετρητή σας. Ένας έλεγχος που περνά σημαίνει ότι ο κώδικας έκανε ό,τι ζήτησε ο έλεγχος, όχι ότι τα δεδομένα είναι σωστά.']);
    if (scope) rows.push(scope);
    return { id: 'checkrun', available: true, empty: null, files, totals: t, when, commit, scope, textRows: rows, ariaLabel: head };
  }
  return { build, pct, dateText };
});
