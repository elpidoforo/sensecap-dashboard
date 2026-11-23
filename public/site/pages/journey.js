/*
  Data Journey (#/journey): how data is collected and handed out on this site, as one animated board. Publishers feed the
  collector, every data sheet shows what the site knows about it now, the sheets are joined to the pages that show them, and a
  check ring counts the sheets that answered. Built from our own answers (/api/stack); numbers come from journey-data.js (tested).
  Which page shows which sheet is written down from the site's code, not measured, and the board says so.
*/
(function () {
  'use strict';
  const T = SC.t;
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css'); SC.css('/site/pages/live.css');
  const LIBS = ['/site/viz/countcards-data.js', '/site/viz/journey-data.js', '/site/viz/journey.js'];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pair = (p) => (Array.isArray(p) ? p[SC.lang === 'el' ? 1 : 0] : String(p == null ? '' : p));
  const get = (url) => fetch(url, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  function build(root) {
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const board = el('div', 'dw lv'); root.append(board);
    const sec = el('section', 'wl-panel wl-wide'); board.append(sec);
    sec.append(el('h2', 'wl-h', T('From the publishers to the pages of this site', 'Από τους εκδότες ως τις σελίδες του ιστοτόπου')));
    sec.append(el('p', 'wl-hint', T('One run shows the whole path: who publishes the data, what each data sheet holds right now, which pages show it, and how many sheets answered. A sheet that did not answer is dashed in amber and named in the log.', 'Μία διαδρομή δείχνει όλο τον δρόμο: ποιος εκδίδει τα δεδομένα, τι έχει κάθε φύλλο αυτή τη στιγμή, ποιες σελίδες το δείχνουν και πόσα φύλλα απάντησαν. Ένα φύλλο που δεν απάντησε έχει διακεκομμένο κεχριμπαρί περίγραμμα και αναφέρεται στο ημερολόγιο.')));
    const host = el('div', 'lv-host'); sec.append(host);
    const bar = el('div', 'lv-player'); sec.append(bar);
    const bPlay = el('button', 'lv-btn', T('Pause', 'Παύση')); bPlay.type = 'button'; const bRe = el('button', 'lv-btn', T('Replay', 'Επανάληψη')); bRe.type = 'button';
    const jump = el('select', 'lv-btn'); jump.setAttribute('aria-label', T('Jump to a part of the run', 'Μετάβαση σε μέρος της διαδρομής'));
    const scrub = el('input', 'lv-scrub'); scrub.type = 'range'; scrub.min = '0'; scrub.max = '1000'; scrub.value = '0'; scrub.setAttribute('aria-label', T('Position in the run', 'Θέση μέσα στη διαδρομή'));
    const bNew = el('button', 'lv-btn', T('Fetch again', 'Νέα λήψη')); bNew.type = 'button';
    const tRead = el('span', 'lv-small lv-time'); bar.append(bPlay, bRe, jump, scrub, tRead, bNew);
    const det = el('details', 'wl-list'); det.append(el('summary', null, T('The same facts as text', 'Τα ίδια στοιχεία ως κείμενο'))); const ul = el('ul'); det.append(ul); sec.append(det);
    board.append(el('p', 'wl-foot', T('Counts and ages come from the answers the site holds at the moment you opened this page. Which page shows which sheet is written down from the site’s code; it does not measure who looked at what.', 'Οι αριθμοί και οι ηλικίες είναι από τις απαντήσεις που έχει ο ιστότοπος τη στιγμή που ανοίξατε τη σελίδα. Το ποια σελίδα δείχνει ποιο φύλλο γράφτηκε από τον κώδικα του ιστοτόπου· δεν μετρά ποιος είδε τι.')));

    let h = null, dead = false, dragging = false, lastSec = '';
    const onTime = (t, d, playing) => { if (!dragging) scrub.value = String(Math.round(t / d * 1000)); const s = (t / 1000).toFixed(1) + ' / ' + (d / 1000).toFixed(1) + ' s'; if (s !== lastSec) { lastSec = s; tRead.textContent = s; } const lab = playing ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'); if (bPlay.textContent !== lab) bPlay.textContent = lab; };
    bPlay.onclick = () => { if (!h) return; if (h.isPaused() || h.time() >= h.duration()) h.play(); else h.pause(true); };
    bRe.onclick = () => { if (h) h.replay(); };
    scrub.oninput = () => { if (!h) return; dragging = true; h.pause(true); h.seek(Number(scrub.value) / 1000 * h.duration()); }; scrub.onchange = () => { dragging = false; };
    jump.onchange = () => { if (!h || jump.value === '') return; h.pause(true); h.seek(Number(jump.value)); jump.value = ''; };
    if (reduce.matches) { bPlay.hidden = true; bRe.hidden = true; }
    function load() {
      bNew.disabled = true;
      get('/api/stack').then((cat) => Promise.all((cat && Array.isArray(cat.sheets) ? cat.sheets : []).map((s) => get('/api/stack/' + s.id).then((a) => [s.id, a]))).then((pairs) => {
        if (dead) return; bNew.disabled = false; const sheets = {}; pairs.forEach(([id, a]) => { sheets[id] = a; });
        const m = SC.viz.journeyData.build({ catalogue: cat, sheets }, Date.now());
        ul.textContent = ''; m.textRows.forEach((r) => ul.append(el('li', null, pair(r))));
        try { if (!h) h = SC.viz.journey.mount(host, m, { onTime }); else h.run(m); } catch (e) { host.textContent = T('This picture could not be drawn. The facts are in the text list below.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί. Τα στοιχεία είναι στη λίστα παρακάτω.'); return; }
        if (!jump.options.length) { const P = h.phases, o0 = el('option', null, T('Jump to…', 'Μετάβαση…')); o0.value = ''; jump.append(o0);
          [[P.cards + 3600, T('Collect', 'Συλλογή')], [P.pages - 150, T('Folded into pills', 'Συμπτυγμένα')], [P.check - 200, T('Handed out to the pages', 'Διανομή στις σελίδες')], [P.hold + 1500, T('The check ring', 'Ο δακτύλιος ελέγχου')]].forEach((x) => { const o = el('option', null, x[1]); o.value = String(x[0]); jump.append(o); }); }
      }));
    }
    bNew.onclick = load; load();
    return () => { dead = true; if (h) h.destroy(); };
  }

  SC.register('journey', {
    title: ['Data Journey', 'Data Journey'],
    render(root) {
      root.append(SC.head({ title: T('Data Journey', 'Data Journey'), lede: T('How data reaches this site and where it goes: from the publishers, through our data sheets, to the pages that show it.', 'Πώς φτάνουν τα δεδομένα σε αυτόν τον ιστότοπο και πού πηγαίνουν: από τους εκδότες, μέσα από τα φύλλα δεδομένων μας, στις σελίδες που τα δείχνουν.') }));
      const host = document.createElement('div'); root.append(host);
      let stop = null, gone = false;
      const load = (list) => list.reduce((p, s) => p.then(() => new Promise((ok, no) => { if (document.querySelector('script[data-wl="' + s + '"]')) return ok(); const e = document.createElement('script'); e.src = s; e.dataset.wl = s; e.onload = ok; e.onerror = () => no(new Error(s)); document.head.append(e); })), Promise.resolve());
      load(LIBS).then(() => { if (!gone) stop = build(host); }).catch(() => { host.textContent = T('The Data Journey could not start. Reload the page to try again.', 'Το Data Journey δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
