/*
  Signals over Cyprus (#/signals): the live sources of the site as light. Each source sends a bundle of light to the cards that
  show what it says now; from a card one strand falls for every record to the place the record gives for itself on the island.
  The five answers (/api/stack/met-stations, airports, air-stations, fire-hotspots, earthquakes) are fetched again every minute.
  The records of one fetch are played one after the other and the play repeats; they arrived together, and the page says so.
  No vehicle and no school sensor is placed. The drift of the instruments and the shimmer of the light are decoration.
  Model: signals-data.js (tested).
*/
(function () {
  'use strict';
  const T = SC.t;
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css'); SC.css('/site/pages/live.css');
  const LIBS = ['/site/viz/signals-data.js', '/site/viz/signals.js'], IDS = ['met-stations', 'airports', 'air-stations', 'fire-hotspots', 'earthquakes'], EVERY = 60000;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const P2 = (p) => (Array.isArray(p) ? T(p[0], p[1]) : String(p == null ? '' : p));
  const get = (u) => SC.api(u).catch(() => null);

  function build(root) {
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const board = el('div', 'dw lv'); root.append(board);
    const sec = el('section', 'wl-panel wl-wide'); board.append(sec);
    sec.append(el('h2', 'wl-h', T('One strand of light for every record', 'Μία ακτίνα φωτός για κάθε εγγραφή')));
    sec.append(el('p', 'wl-hint', T('The records of the latest fetch, played one after the other and then again. They arrived together. A dashed instrument is a source that is not answering now.', 'Οι εγγραφές της τελευταίας λήψης, η μία μετά την άλλη και ξανά από την αρχή. Έφτασαν όλες μαζί. Ένα διακεκομμένο όργανο είναι πηγή που δεν απαντά τώρα.')));
    const host = el('div', 'lv-host'); sec.append(host); host.textContent = T('Asking the sources…', 'Ερώτηση προς τις πηγές…');
    const bar = el('div', 'lv-player'); sec.append(bar);
    const bPlay = el('button', 'lv-btn', T('Pause', 'Παύση')); bPlay.type = 'button'; const bRe = el('button', 'lv-btn', T('Replay', 'Επανάληψη')); bRe.type = 'button';
    const jump = el('select', 'lv-btn'); jump.setAttribute('aria-label', T('Jump to a source', 'Μετάβαση σε πηγή'));
    const scrub = el('input', 'lv-scrub'); scrub.type = 'range'; scrub.min = '0'; scrub.max = '1000'; scrub.value = '0'; scrub.setAttribute('aria-label', T('Position in the playback', 'Θέση μέσα στην αναπαραγωγή'));
    const tRead = el('span', 'lv-small lv-time'); bar.append(bPlay, bRe, jump, scrub, tRead); if (reduce.matches) { bPlay.hidden = true; bRe.hidden = true; }
    const det = el('details', 'wl-list'); det.append(el('summary', null, T('The same fetch as text', 'Η ίδια λήψη ως κείμενο'))); const ul = el('ul'); det.append(ul); sec.append(det);
    board.append(el('p', 'wl-foot', T('Each light on the island is one record at the place its source gives for it: a weather or air station, a satellite heat detection, an earthquake epicentre. No vehicle and no school sensor is placed. The cards show the lowest and highest fresh reading, not which place had it. The slow drift of the instruments and the shimmer of the light are decoration; they are not data. The island is the drawing of this site, tilted: a guide, not a map to measure on.', 'Κάθε φως στο νησί είναι μία εγγραφή στη θέση που δίνει η πηγή της: μετεωρολογικός σταθμός ή σταθμός αέρα, δορυφορική ανίχνευση θερμότητας, επίκεντρο σεισμού. Δεν τοποθετείται κανένα όχημα και κανένας σχολικός αισθητήρας. Οι κάρτες δείχνουν τη χαμηλότερη και την υψηλότερη πρόσφατη μέτρηση, όχι σε ποιο μέρος ήταν. Η αργή κίνηση των οργάνων και το τρεμόπαιγμα του φωτός είναι διακόσμηση· δεν είναι δεδομένα. Το νησί είναι το σχέδιο αυτής της ιστοσελίδας, με κλίση: οδηγός, όχι χάρτης για μετρήσεις.')));
    let h = null, alive = true, timer = 0, busy = false, dragging = false, lastSec = '', userPaused = false;
    const onTime = (t, d, playing) => { if (!dragging) scrub.value = String(Math.round(t / (d || 1) * 1000)); const s = (t / 1000).toFixed(1) + ' / ' + (d / 1000).toFixed(1) + ' s'; if (s !== lastSec) { lastSec = s; tRead.textContent = s; } const lab = playing ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'); if (bPlay.textContent !== lab) bPlay.textContent = lab; };
    const fill = (m) => { ul.textContent = ''; m.textRows.forEach((r) => ul.append(el('li', null, P2(r)))); jump.textContent = ''; [[T('Jump to', 'Μετάβαση'), -1]].concat(m.sources.filter((s) => s.start != null).map((s) => [P2(s.name), s.start])).concat([[T('All placed', 'Όλες τοποθετημένες'), Math.max(0, m.duration - 700)]]).forEach((s) => { const o = el('option', null, s[0]); o.value = String(s[1]); jump.append(o); }); };
    jump.onchange = () => { const v = Number(jump.value); if (h && v >= 0) { h.seek(v); if (v >= h.duration() - 800) { h.pause(true); userPaused = true; } else { h.pause(false); userPaused = false; } } jump.selectedIndex = 0; };
    bPlay.onclick = () => { if (!h) return; if (h.isPaused()) { h.play(); userPaused = false; } else { h.pause(true); userPaused = true; } }; bRe.onclick = () => { if (h) { h.replay(); userPaused = false; } };
    scrub.oninput = () => { if (!h) return; dragging = true; userPaused = true; h.pause(true); h.seek(Number(scrub.value) / 1000 * h.duration()); }; scrub.onchange = () => { dragging = false; };
    const cycle = () => { if (busy || document.hidden) return; busy = true; Promise.all(IDS.map((id) => get('/api/stack/' + id))).then((a) => { busy = false; if (!alive) return;
      const m = SC.viz.signalsData.build({ met: a[0], airports: a[1], air: a[2], fires: a[3], quakes: a[4] }, Date.now()); fill(m);
      if (!m.available) { if (h) { h.destroy(); h = null; } host.textContent = P2(m.empty); return; }
      if (!h) { try { host.textContent = ''; h = SC.viz.signals.mount(host, m, { onTime, loop: true }); } catch (e) { h = null; host.textContent = T('This picture could not be drawn. The fetch is in the text below.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί. Η λήψη είναι στο κείμενο παρακάτω.'); } }
      else if (userPaused) { const at = h.time(); h.run(m); h.pause(true); h.seek(Math.min(at, m.duration)); }   // a paused board keeps its place; only the numbers are renewed
      else h.run(m); }); };
    cycle(); timer = setInterval(cycle, EVERY);
    return () => { alive = false; clearInterval(timer); if (h) h.destroy(); };
  }

  SC.register('signals', {
    title: ['Signals over Cyprus', 'Σήματα πάνω από την Κύπρο'],
    render(root) {
      root.append(SC.head({ title: T('Signals over Cyprus', 'Σήματα πάνω από την Κύπρο'), lede: T('Weather stations, airports, air stations, a satellite and the earthquake list, all at once: watch what each one says now land on the island as light.', 'Μετεωρολογικοί σταθμοί, αεροδρόμια, σταθμοί αέρα, ένας δορυφόρος και η λίστα σεισμών, όλα μαζί: δείτε τι λέει το καθένα τώρα να πέφτει στο νησί ως φως.') }));
      const host = document.createElement('div'); root.append(host); let stop = null, gone = false;
      const load = (list) => list.reduce((p, s) => p.then(() => new Promise((ok, no) => { if (document.querySelector('script[data-wl="' + s + '"]')) return ok(); const e = document.createElement('script'); e.src = s; e.dataset.wl = s; e.onload = ok; e.onerror = () => no(new Error(s)); document.head.append(e); })), Promise.resolve());
      load(LIBS).then(() => { if (!gone) stop = build(host); }).catch(() => { host.textContent = T('The board could not start. Reload the page to try again.', 'Ο πίνακας δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
