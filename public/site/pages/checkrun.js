/*
  Check run (#/checkrun): how the site checks itself. It replays a RECORDED run of the widget tests (public/site/data/checks.json,
  written by tools/record-checks.js before a release): one card per test file, one dot per check, a pass gate that counts the
  checks that passed. It is not a run in the visitor's browser, and a passing check does not mean the data is right.
  Model: checkrun-data.js (tested).
*/
(function () {
  'use strict';
  const T = SC.t;
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css'); SC.css('/site/pages/live.css');
  const LIBS = ['/site/viz/checkrun-data.js', '/site/viz/checkrun.js'];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function build(root, data) {
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const board = el('div', 'dw lv'); root.append(board);
    const sec = el('section', 'wl-panel wl-wide'); board.append(sec);
    sec.append(el('h2', 'wl-h', T('One dot for every check', 'Μία τελεία για κάθε έλεγχο')));
    sec.append(el('p', 'wl-hint', T('A recorded run of the tests of the pictures on this site, replayed. Teal: the check passed. Amber: it failed. Grey: no result was recorded.', 'Μια καταγραμμένη εκτέλεση των ελέγχων για τις εικόνες του ιστοτόπου, σε επανάληψη. Γαλαζοπράσινο: ο έλεγχος πέρασε. Κεχριμπαρί: απέτυχε. Γκρι: δεν καταγράφηκε αποτέλεσμα.')));
    const host = el('div', 'lv-host'); sec.append(host);
    const m = SC.viz.checkrunData.build(data);
    if (!m.available) { host.textContent = Array.isArray(m.empty) ? T(m.empty[0], m.empty[1]) : T('No record of a check run is available.', 'Δεν υπάρχει καταγραφή εκτέλεσης ελέγχων.'); return () => {}; }
    const bar = el('div', 'lv-player'); sec.append(bar);
    const bPlay = el('button', 'lv-btn', T('Pause', 'Παύση')); bPlay.type = 'button'; const bRe = el('button', 'lv-btn', T('Replay', 'Επανάληψη')); bRe.type = 'button';
    const jump = el('select', 'lv-btn'); jump.setAttribute('aria-label', T('Jump to a step', 'Μετάβαση σε βήμα'));
    const scrub = el('input', 'lv-scrub'); scrub.type = 'range'; scrub.min = '0'; scrub.max = '1000'; scrub.value = '0'; scrub.setAttribute('aria-label', T('Position in the replay', 'Θέση μέσα στην επανάληψη'));
    const tRead = el('span', 'lv-small lv-time'); bar.append(bPlay, bRe, jump, scrub, tRead);
    // the same record as a table, for the keyboard and for screen readers
    const det = el('details', 'wl-list'); det.append(el('summary', null, T('The same record as a table', 'Η ίδια καταγραφή ως πίνακας'))); sec.append(det);
    const tb = el('table'); const hr = el('tr'); [T('Test file', 'Αρχείο ελέγχου'), T('Checks', 'Έλεγχοι'), T('Passed', 'Πέρασαν'), T('Failed', 'Απέτυχαν'), T('Result', 'Αποτέλεσμα')].forEach((s) => { const th = el('th', null, s); th.scope = 'col'; hr.append(th); }); tb.append(hr);
    const word = { passed: T('passed', 'πέρασε'), failed: T('failed', 'απέτυχε'), unknown: T('no result recorded', 'δεν καταγράφηκε αποτέλεσμα') };
    m.files.forEach((f) => { const tr = el('tr'); [f.file || f.id, f.known ? String(f.total) : '–', f.known ? String(f.passed) : '–', f.known ? String(f.failed) : '–', word[f.state] || f.state].forEach((s) => tr.append(el('td', null, s))); tb.append(tr); });
    det.append(tb);
    board.append(el('p', 'wl-foot', T('Recorded on the development machine on ' + T(m.when[0], m.when[1]) + ', for code version ' + (m.commit || '–') + '. It is not a run in your browser. The checks test the code that draws the pictures; a passing check does not mean the data is right.', 'Καταγράφηκε στον υπολογιστή ανάπτυξης στις ' + T(m.when[0], m.when[1]) + ', για την έκδοση κώδικα ' + (m.commit || '–') + '. Δεν είναι εκτέλεση στον φυλλομετρητή σας. Οι έλεγχοι δοκιμάζουν τον κώδικα που σχεδιάζει τις εικόνες· ένας έλεγχος που περνά δεν σημαίνει ότι τα δεδομένα είναι σωστά.')));
    let dragging = false, lastSec = '';
    const onTime = (t, d, playing) => { if (!dragging) scrub.value = String(Math.round(t / d * 1000)); const s = (t / 1000).toFixed(1) + ' / ' + (d / 1000).toFixed(1) + ' s'; if (s !== lastSec) { lastSec = s; tRead.textContent = s; } const lab = playing ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'); if (bPlay.textContent !== lab) bPlay.textContent = lab; };
    let h; try { h = SC.viz.checkrun.mount(host, m, { onTime }); } catch (e) { host.textContent = T('This picture could not be drawn. The record is in the table below.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί. Η καταγραφή είναι στον πίνακα παρακάτω.'); return () => {}; }
    const P = h.phases, steps = [[T('Jump to', 'Μετάβαση'), -1], [T('Hand out', 'Ανάθεση'), 0], [T('List', 'Λίστα'), P.fold], [T('Checks', 'Έλεγχοι'), P.dots], [T('Grading', 'Βαθμολόγηση'), P.grade], [T('Gate', 'Πύλη'), P.gate], [T('Result', 'Αποτέλεσμα'), P.end]];
    steps.forEach((s) => { const o = el('option', null, s[0]); o.value = String(s[1]); jump.append(o); });
    jump.onchange = () => { const v = Number(jump.value); if (v >= 0) { if (v >= P.end) { h.pause(true); h.seek(v); } else { h.seek(v); h.pause(false); } } jump.selectedIndex = 0; };
    bPlay.onclick = () => { if (h.isPaused() || h.time() >= h.duration()) h.play(); else h.pause(true); }; bRe.onclick = () => h.replay();
    scrub.oninput = () => { dragging = true; h.pause(true); h.seek(Number(scrub.value) / 1000 * h.duration()); }; scrub.onchange = () => { dragging = false; };
    if (reduce.matches) { bPlay.hidden = true; bRe.hidden = true; jump.hidden = true; }
    return () => h.destroy();
  }

  SC.register('checkrun', {
    title: ['Check run', 'Εκτέλεση ελέγχων'],
    render(root) {
      root.append(SC.head({ title: T('Check run', 'Εκτέλεση ελέγχων'), lede: T('How the site checks itself: every test file, every check, and how many passed, replayed from a recorded run.', 'Πώς ο ιστότοπος ελέγχει τον εαυτό του: κάθε αρχείο ελέγχου, κάθε έλεγχος και πόσοι πέρασαν, σε επανάληψη από καταγραμμένη εκτέλεση.') }));
      const host = document.createElement('div'); root.append(host);
      let stop = null, gone = false;
      const load = (list) => list.reduce((p, s) => p.then(() => new Promise((ok, no) => { if (document.querySelector('script[data-wl="' + s + '"]')) return ok(); const e = document.createElement('script'); e.src = s; e.dataset.wl = s; e.onload = ok; e.onerror = () => no(new Error(s)); document.head.append(e); })), Promise.resolve());
      const data = fetch('/site/data/checks.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      load(LIBS).then(() => data).then((d) => { if (!gone) stop = build(host, d); }).catch(() => { host.textContent = T('The check run could not start. Reload the page to try again.', 'Η εκτέλεση ελέγχων δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
