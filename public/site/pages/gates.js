/*
  Data gates (#/gates): every source of the site against every check ("gate") it faces, from the report of /api/health.
  The gates play one after the other so they can be watched; the server reports them together, and the page says so.
  The report is fetched again every minute; the numbers on the board are the reported ones. Model: gates-data.js (tested).
*/
(function () {
  'use strict';
  const T = SC.t;
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css'); SC.css('/site/pages/live.css');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const P2 = (p) => (Array.isArray(p) ? T(p[0], p[1]) : String(p == null ? '' : p));
  const get = (u) => SC.api(u).catch(() => null);
  // the usual player: play or pause, replay, jump to a step, scrub, time
  function player(sec, steps) {
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const bar = el('div', 'lv-player'); sec.append(bar);
    const bPlay = el('button', 'lv-btn', T('Pause', 'Παύση')); bPlay.type = 'button'; const bRe = el('button', 'lv-btn', T('Replay', 'Επανάληψη')); bRe.type = 'button';
    const jump = el('select', 'lv-btn'); jump.setAttribute('aria-label', T('Jump to a step', 'Μετάβαση σε βήμα'));
    const scrub = el('input', 'lv-scrub'); scrub.type = 'range'; scrub.min = '0'; scrub.max = '1000'; scrub.value = '0'; scrub.setAttribute('aria-label', T('Position in the walk-through', 'Θέση μέσα στην περιήγηση'));
    const tRead = el('span', 'lv-small lv-time'); bar.append(bPlay, bRe, jump, scrub, tRead);
    let h = null, dragging = false, lastSec = '';
    const fill = (list) => { jump.textContent = ''; [[T('Jump to', 'Μετάβαση'), -1]].concat(list).forEach((s) => { const o = el('option', null, s[0]); o.value = String(s[1]); jump.append(o); }); };
    fill(steps);
    const onTime = (t, d, playing) => { if (!dragging) scrub.value = String(Math.round(t / d * 1000)); const s = (t / 1000).toFixed(1) + ' / ' + (d / 1000).toFixed(1) + ' s'; if (s !== lastSec) { lastSec = s; tRead.textContent = s; } const lab = playing ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'); if (bPlay.textContent !== lab) bPlay.textContent = lab; };
    jump.onchange = () => { const v = Number(jump.value); if (h && v >= 0) { if (v >= h.duration()) { h.pause(true); h.seek(v); } else { h.seek(v); h.pause(false); } } jump.selectedIndex = 0; };
    bPlay.onclick = () => { if (!h) return; if (h.isPaused() || h.time() >= h.duration()) h.play(); else h.pause(true); }; bRe.onclick = () => { if (h) h.replay(); };
    scrub.oninput = () => { if (!h) return; dragging = true; h.pause(true); h.seek(Number(scrub.value) / 1000 * h.duration()); }; scrub.onchange = () => { dragging = false; };
    if (reduce.matches) { bPlay.hidden = true; bRe.hidden = true; jump.hidden = true; }
    return { onTime, attach(handle) { h = handle; }, fill };
  }
  const loadLibs = (list) => list.reduce((p, s) => p.then(() => new Promise((ok, no) => { if (document.querySelector('script[data-wl="' + s + '"]')) return ok(); const e = document.createElement('script'); e.src = s; e.dataset.wl = s; e.onload = ok; e.onerror = () => no(new Error(s)); document.head.append(e); })), Promise.resolve());
  const LIBS = ['/site/viz/gates-data.js', '/site/viz/gates.js'];

  function build(root) {
    const board = el('div', 'dw lv'); root.append(board);
    const sec = el('section', 'wl-panel wl-wide'); board.append(sec);
    sec.append(el('h2', 'wl-h', T('Every source, every gate', 'Κάθε πηγή, κάθε πύλη')));
    sec.append(el('p', 'wl-hint', T('One cell is one check of one source. Filled: passed. Ring: warning. Cross: failed. A dashed bar is a source that is not answering now.', 'Ένα κελί είναι ένας έλεγχος μίας πηγής. Γεμάτο: πέρασε. Δακτύλιος: προειδοποίηση. Σταυρός: απέτυχε. Διακεκομμένη ράβδος: πηγή που δεν απαντά τώρα.')));
    const host = el('div', 'lv-host'); sec.append(host); host.textContent = T('Loading the report of the checks…', 'Φόρτωση της αναφοράς των ελέγχων…');
    const pl = player(sec, []);
    const det = el('details', 'wl-list'); det.append(el('summary', null, T('The same report as text', 'Η ίδια αναφορά ως κείμενο'))); const ul = el('ul'); det.append(ul); sec.append(det);
    board.append(el('p', 'wl-foot', T('The gates are played one after the other so they can be watched; the server reports them together, about once a minute. The checks only report: a reading that fails is left out of the tools and the reason is shown. No number is corrected by itself, and a passed check does not prove that a value is true.', 'Οι πύλες παίζονται η μία μετά την άλλη για να φαίνονται· ο διακομιστής τις αναφέρει όλες μαζί, περίπου μία φορά το λεπτό. Οι έλεγχοι μόνο αναφέρουν: μια μέτρηση που αποτυγχάνει μένει εκτός των εργαλείων και ο λόγος φαίνεται. Κανένας αριθμός δεν διορθώνεται από μόνος του, και ένας έλεγχος που περνά δεν αποδεικνύει ότι μια τιμή είναι αληθινή.')));
    let h = null, alive = true, timer = 0, busy = false;
    const show = (m) => { ul.textContent = ''; m.textRows.forEach((r) => ul.append(el('li', null, P2(r)))); pl.fill(m.gates.map((g) => [(g.i + 1) + '. ' + P2(g.n), g.start]).concat([[T('Result', 'Αποτέλεσμα'), m.duration]])); };
    const cycle = () => { if (busy || document.hidden) return; busy = true; get('/api/health').then((r) => { busy = false; if (!alive) return; const m = SC.viz.gatesData.build(r || {});
      if (!m.available) { if (!h) host.textContent = P2(m.empty); return; }
      if (!h) { try { h = SC.viz.gates.mount(host, m, { onTime: pl.onTime }); pl.attach(h); } catch (e) { host.textContent = T('This picture could not be drawn. The report is in the text below.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί. Η αναφορά είναι στο κείμενο παρακάτω.'); } } else h.update(m);
      show(m); }); };
    cycle(); timer = setInterval(cycle, 60000);
    return () => { alive = false; clearInterval(timer); if (h) h.destroy(); };
  }

  SC.register('gates', {
    title: ['Data gates', 'Πύλες δεδομένων'],
    render(root) {
      root.append(SC.head({ title: T('Data gates', 'Πύλες δεδομένων'), lede: T('Before a number reaches a page it faces a row of checks. Watch every source go through every gate, and see which ones raised a warning.', 'Πριν φτάσει ένας αριθμός σε μια σελίδα περνά από μια σειρά ελέγχων. Δείτε κάθε πηγή να περνά από κάθε πύλη και ποιες έβγαλαν προειδοποίηση.') }));
      const host = document.createElement('div'); root.append(host); let stop = null, gone = false;
      loadLibs(LIBS).then(() => { if (!gone) stop = build(host); }).catch(() => { host.textContent = T('The board could not start. Reload the page to try again.', 'Ο πίνακας δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
