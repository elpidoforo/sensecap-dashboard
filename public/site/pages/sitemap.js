/*
  Site Map (#/sitemap): the site's own menu as a graph that builds itself, one page at a time, in menu order. Click a dot or a
  row to open that page. It shows the menu (the pages that exist), not how much each page is used. Model: sitemap-data.js (tested).
*/
(function () {
  'use strict';
  const T = SC.t;
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css'); SC.css('/site/pages/live.css');
  const LIBS = ['/site/viz/sitemap-data.js', '/site/viz/sitemap.js'];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function build(root) {
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const board = el('div', 'dw lv'); root.append(board);
    const sec = el('section', 'wl-panel wl-wide'); board.append(sec);
    sec.append(el('h2', 'wl-h', T('Every page of the menu, one at a time', 'Κάθε σελίδα του μενού, μία μία')));
    sec.append(el('p', 'wl-hint', T('The map follows the menu: View, Analyze, Predict, Build. Click a dot or a row to open that page.', 'Ο χάρτης ακολουθεί το μενού: Προβολή, Ανάλυση, Πρόβλεψη, Κατασκευή. Πατήστε μια τελεία ή μια γραμμή για να ανοίξετε τη σελίδα.')));
    const host = el('div', 'lv-host'); sec.append(host);
    // the menu as the site itself reports it, in the current language; only pages that exist
    const ready = typeof SC.isReady === 'function' ? SC.isReady : () => true;
    const groups = (typeof SC.sections === 'function' ? SC.sections() : []).map((g) => ({ id: g.id, name: g.name, items: g.items.filter((id) => ready(id)).map((id) => { const info = SC.pageInfo ? SC.pageInfo(id) : null; return info ? { id, name: info.name, desc: info.desc || '' } : null; }).filter(Boolean) }));
    const m = SC.viz.sitemapData.build({ root: 'Kleanthis', groups });
    const bar = el('div', 'lv-player'); sec.append(bar);
    const bPlay = el('button', 'lv-btn', T('Pause', 'Παύση')); bPlay.type = 'button'; const bRe = el('button', 'lv-btn', T('Replay', 'Επανάληψη')); bRe.type = 'button'; const bEnd = el('button', 'lv-btn', T('Show the whole map', 'Όλος ο χάρτης')); bEnd.type = 'button';
    const scrub = el('input', 'lv-scrub'); scrub.type = 'range'; scrub.min = '0'; scrub.max = '1000'; scrub.value = '0'; scrub.setAttribute('aria-label', T('Position in the run', 'Θέση μέσα στη διαδρομή'));
    const tRead = el('span', 'lv-small lv-time'); bar.append(bPlay, bRe, bEnd, scrub, tRead);
    // the same pages as real links, for the keyboard and for screen readers
    const det = el('details', 'wl-list'); det.append(el('summary', null, T('The same pages as a list of links', 'Οι ίδιες σελίδες ως λίστα συνδέσμων'))); sec.append(det);
    m.groups.forEach((g) => { det.append(el('p', 'lv-small', String(g.name))); const ul = el('ul'); m.items.filter((it) => it.group === g.i).forEach((it) => { const li = el('li'), a = el('a', null, String(it.name)); a.href = '#/' + it.id; li.append(a); if (it.desc) li.append(document.createTextNode(': ' + it.desc)); ul.append(li); }); det.append(ul); });
    board.append(el('p', 'wl-foot', T('The map shows the menu of the site: the pages that exist. It does not show how much each page is used.', 'Ο χάρτης δείχνει το μενού του ιστοτόπου: τις σελίδες που υπάρχουν. Δεν δείχνει πόσο χρησιμοποιείται κάθε σελίδα.')));
    if (!m.available) { host.textContent = T('The menu of the site could not be read.', 'Το μενού του ιστοτόπου δεν μπόρεσε να διαβαστεί.'); return () => {}; }
    let dragging = false, lastSec = '';
    const onTime = (t, d, playing) => { if (!dragging) scrub.value = String(Math.round(t / d * 1000)); const s = (t / 1000).toFixed(1) + ' / ' + (d / 1000).toFixed(1) + ' s'; if (s !== lastSec) { lastSec = s; tRead.textContent = s; } const lab = playing ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'); if (bPlay.textContent !== lab) bPlay.textContent = lab; };
    let h; try { h = SC.viz.sitemap.mount(host, m, { onTime, onOpen: (id) => { location.hash = '#/' + id; } }); } catch (e) { host.textContent = T('This picture could not be drawn. The pages are in the list of links below.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί. Οι σελίδες είναι στη λίστα συνδέσμων παρακάτω.'); return () => {}; }
    bPlay.onclick = () => { if (h.isPaused() || h.time() >= h.duration()) h.play(); else h.pause(true); }; bRe.onclick = () => h.replay(); bEnd.onclick = () => { h.pause(true); h.seek(h.duration()); };
    scrub.oninput = () => { dragging = true; h.pause(true); h.seek(Number(scrub.value) / 1000 * h.duration()); }; scrub.onchange = () => { dragging = false; };
    if (reduce.matches) { bPlay.hidden = true; bRe.hidden = true; bEnd.hidden = true; }
    return () => h.destroy();
  }

  SC.register('sitemap', {
    title: ['Site map', 'Χάρτης ιστοτόπου'],
    render(root) {
      root.append(SC.head({ title: T('Site map', 'Χάρτης ιστοτόπου'), lede: T('Every page of Kleanthis as a map that builds itself. Watch it grow, then click a dot to go there.', 'Κάθε σελίδα του Κλεάνθη ως χάρτης που χτίζεται μόνος του. Δείτε τον να μεγαλώνει και πατήστε μια τελεία για να πάτε εκεί.') }));
      const host = document.createElement('div'); root.append(host);
      let stop = null, gone = false;
      const load = (list) => list.reduce((p, s) => p.then(() => new Promise((ok, no) => { if (document.querySelector('script[data-wl="' + s + '"]')) return ok(); const e = document.createElement('script'); e.src = s; e.dataset.wl = s; e.onload = ok; e.onerror = () => no(new Error(s)); document.head.append(e); })), Promise.resolve());
      load(LIBS).then(() => { if (!gone) stop = build(host); }).catch(() => { host.textContent = T('The site map could not start. Reload the page to try again.', 'Ο χάρτης δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
