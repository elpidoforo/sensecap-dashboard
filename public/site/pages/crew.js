/*
  AI at work (#/crew): how one Council session goes (a WALK-THROUGH written down from the site's code: no question, no answer
  and no score is shown) and how the AI helpers are doing now (live: /council/api/status, /council/api/sessions?scope=public,
  /api/helpers, fetched again every minute). Model: crew-data.js (tested against council.js).
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
  const LIBS = ['/site/viz/crew-data.js', '/site/viz/crew.js'];

  function build(root) {
    const board = el('div', 'dw lv'); root.append(board);
    const sec = el('section', 'wl-panel wl-wide'); board.append(sec);
    sec.append(el('h2', 'wl-h', T('From a question to a published session', 'Από την ερώτηση ως τη δημοσιευμένη συνεδρία')));
    sec.append(el('p', 'wl-hint', T('A walk-through of one Council session, as written in the code of the site. It is not a session happening now, and no answer is shown. The parts marked "live" show the state now.', 'Περιήγηση σε μία συνεδρία του Συμβουλίου, όπως είναι γραμμένη στον κώδικα του ιστοτόπου. Δεν είναι συνεδρία που γίνεται τώρα και δεν φαίνεται καμία απάντηση. Τα σημεία με την ένδειξη "ζωντανά" δείχνουν την τωρινή κατάσταση.')));
    const host = el('div', 'lv-host'); sec.append(host); host.textContent = T('Loading the state of the helpers…', 'Φόρτωση της κατάστασης των βοηθών…');
    const pl = player(sec, []);
    const det = el('details', 'wl-list'); det.append(el('summary', null, T('The same steps and states as text', 'Τα ίδια βήματα και οι καταστάσεις ως κείμενο'))); const ul = el('ul'); det.append(ul); sec.append(det);
    const links = el('p', 'lv-small'); [['council', T('Open the Council room', 'Άνοιγμα της αίθουσας συμβουλίου')], ['helpers', T('Open the helpers page', 'Άνοιγμα της σελίδας των βοηθών')]].forEach((l, k) => { if (k) links.append(document.createTextNode('  ')); const a = el('a', null, l[1]); a.href = '#/' + l[0]; links.append(a); }); sec.append(links);
    board.append(el('p', 'wl-foot', T('The seats and the Chair are AI role-plays written from public school sensor and Met Office data. They decide nothing: a teacher reads every session and publishes or rejects it, and visitors can read only published sessions. No vehicle position and no device number is ever given to the AI.', 'Οι θέσεις και το Προεδρείο είναι παραστάσεις ρόλων από ΤΝ, γραμμένες με βάση δημόσια δεδομένα σχολικών αισθητήρων και της Μετεωρολογικής. Δεν αποφασίζουν τίποτα: ένας εκπαιδευτικός διαβάζει κάθε συνεδρία και τη δημοσιεύει ή την απορρίπτει, και οι επισκέπτες διαβάζουν μόνο δημοσιευμένες συνεδρίες. Καμία θέση οχήματος και κανένας αριθμός συσκευής δεν δίνεται ποτέ στην ΤΝ.')));
    let h = null, alive = true, timer = 0, busy = false;
    const show = (m) => { ul.textContent = ''; m.textRows.forEach((r) => ul.append(el('li', null, P2(r)))); pl.fill(m.steps.map((s, k) => [(k + 1) + '. ' + P2(s.n), s.at]).concat([[T('End', 'Τέλος'), m.duration]])); };
    const cycle = () => { if (busy || document.hidden) return; busy = true; Promise.all([get('/council/api/status'), get('/council/api/sessions?scope=public'), get('/api/helpers')]).then((r) => { busy = false; if (!alive) return; const m = SC.viz.crewData.build({ council: r[0], sessions: r[1], helpers: r[2] }, Date.now());
      if (!m.available) { if (!h) host.textContent = P2(m.empty); return; }
      if (!h) { try { h = SC.viz.crew.mount(host, m, { onTime: pl.onTime }); pl.attach(h); show(m); } catch (e) { host.textContent = T('This picture could not be drawn. The steps are in the text below.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί. Τα βήματα είναι στο κείμενο παρακάτω.'); show(m); } } else { h.update(m); show(m); } }); };
    cycle(); timer = setInterval(cycle, 60000);
    return () => { alive = false; clearInterval(timer); if (h) h.destroy(); };
  }

  SC.register('crew', {
    title: ['AI at work', 'Η ΤΝ στη δουλειά'],
    render(root) {
      root.append(SC.head({ title: T('AI at work', 'Η ΤΝ στη δουλειά'), lede: T('What the AI helpers of Kleanthis do, step by step, who checks them, and how they are doing now.', 'Τι κάνουν οι βοηθοί ΤΝ του Κλεάνθη, βήμα βήμα, ποιος τους ελέγχει και πώς τα πάνε τώρα.') }));
      const host = document.createElement('div'); root.append(host); let stop = null, gone = false;
      loadLibs(LIBS).then(() => { if (!gone) stop = build(host); }).catch(() => { host.textContent = T('The board could not start. Reload the page to try again.', 'Ο πίνακας δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
