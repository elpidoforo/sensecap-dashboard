/*
  Data layers, the "Replay the day" view (used by pages/layers.js, after layers-flow.js): SC.layersLive.day(host, api).
  The saved day, played back: a strip of bars, one per hour, with first / play / latest buttons, and under it the four
  cities ranked as they stood at that moment. While it plays the cards change places.
    - bars: the average outdoor temperature of the cities in that hour (a low grey bar when nothing was saved)
    - chips: what to rank by (outdoor air, wind, sea, our own sensors)
    - each card: the city's number at that moment, a line from the day's lowest to highest with the city's own range and
      a dot for "now", and, when opened, every number of that moment with the layer it came from
  Data: GET /layers/api/replay (the pulse log, at most 26 hours) and the names of the layers from /layers/api/live.
  Only city-level numbers are used. No vehicle position is used anywhere.
  With reduced motion the play button moves one step per press and cards change places without sliding.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  const isEl = () => SC.lang === 'el';
  const nm = (l) => (isEl() && l.nameEl) || l.name;
  const still = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−').replace('.', isEl() ? ',' : '.');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const HOUR = 3600000;
  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const cityName = (c) => (CITY[c] || [c, c])[isEl() ? 1 : 0];
  // what to rank by: key in the replay answer, chip (en, el), short word inside a card (en, el)
  const MEAS = [
    ['air', 'Outdoor air', 'Αέρας έξω', 'air', 'αέρας'],
    ['wind', 'Wind', 'Άνεμος', 'wind', 'άνεμος'],
    ['sea', 'Sea', 'Θάλασσα', 'sea', 'θάλασσα'],
    ['own', 'Our sensors', 'Οι αισθητήρες μας', 'our sensors', 'οι αισθητήρες μας'],
  ];
  const VAR = { co2: ['CO₂', 'CO₂'], temperature: ['temperature', 'θερμοκρασία'], wind_speed: ['wind speed', 'ταχύτητα ανέμου'], sea_surface_temperature: ['sea temperature', 'θερμοκρασία θάλασσας'] };
  const varName = (v) => (VAR[v] || [v, v])[isEl() ? 1 : 0];
  const dur = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? T('less than a minute', 'λιγότερο από ένα λεπτό') : m === 1 ? T('minute', 'λεπτό') : T(m + ' minutes', m + ' λεπτά'); };

  // the saved moments grouped into bars: one per clock hour when the log is long enough, else up to 24 equal parts
  function buckets(times) {
    const n = times.length, out = [];
    if (!n) return out;
    if (times[n - 1] - times[0] >= 6 * HOUR) {
      let cur = null;
      times.forEach((t, i) => { const k = Math.floor(t / HOUR); if (!cur || cur.k !== k) { cur = { k, a: i, b: i }; out.push(cur); } else cur.b = i; });
    } else {
      const m = Math.min(24, n);
      for (let j = 0; j < m; j++) out.push({ a: Math.floor((j * n) / m), b: Math.floor(((j + 1) * n) / m) - 1 });
    }
    return out.slice(-26);
  }
  const at = (series, bk) => { if (!series || !bk) return null; for (let i = bk.b; i >= bk.a; i--) { const v = series.values[i]; if (v != null && isFinite(v)) return v; } return null; };

  function day(host, api) {
    let live = null, replay = null, bks = [], cur = -1, meas = 'air', open = null, timer = 0, dead = false, replayAt = 0, prevOrder = [];
    const when = h('span'), count = h('span', { class: 'dy-note' });
    const bFirst = h('button', { type: 'button', 'aria-label': T('First hour', 'Πρώτη ώρα'), onclick: () => { stop(); go(0); } }, '⏮');
    const bPlay = h('button', { type: 'button', class: 'dy-play', onclick: () => toggle() }, '▶');
    const bLast = h('button', { type: 'button', 'aria-label': T('Newest', 'Πιο πρόσφατη'), onclick: () => { stop(); go(bks.length - 1); } }, '⏭');
    const bars = h('div', { class: 'dy-bars', tabindex: '0', role: 'group', 'aria-label': T('Hours of the saved day. Use the left and right arrow keys.', 'Ώρες της αποθηκευμένης μέρας. Χρησιμοποίησε τα βελάκια αριστερά και δεξιά.') });
    const barNote = h('p', { class: 'dy-note' });
    const chips = h('div', { class: 'dy-chips', role: 'group', 'aria-label': T('Rank the cities by', 'Κατάταξη των πόλεων κατά') });
    const list = h('div', { class: 'dy-list' });
    const said = h('p', { class: 'dy-sr', 'aria-live': 'polite' });
    const aside = h('aside', { class: 'dy-panel dy-side' });
    const body = h('div', { class: 'dy-body' }, h('div', { class: 'dy-main' }, chips, list), aside);
    const empty = h('p', { class: 'dy-empty' });
    host.replaceChildren(h('div', { class: 'dy' },
      h('div', { class: 'dy-panel dy-strip' },
        h('div', { class: 'dy-head' }, h('b', null, T('As the island stood at ', 'Όπως ήταν το νησί στις '), when), count, h('span', { class: 'dy-ctl' }, bFirst, bPlay, bLast)),
        bars, barNote),
      empty, body, said));
    const cards = new Map();

    const series = (c, key) => (replay && replay.cities[c] ? replay.cities[c][key] : null);
    // for "our sensors" the cities may measure different things; rank only the most common one
    function ownVar() {
      const tally = {};
      Object.keys(CITY).forEach((c) => { const s = series(c, 'own'); if (s) tally[s.variable] = (tally[s.variable] || 0) + 1; });
      return Object.keys(tally).sort((a, b) => tally[b] - tally[a] || a.localeCompare(b))[0] || null;
    }
    const ranked = (c) => { const s = series(c, meas); return s && (meas !== 'own' || s.variable === ownVar()) ? s : null; };
    const srcName = (id) => { const l = live && (live.layers || []).find((x) => x.id === id); return l ? nm(l) : id; };
    const unitOf = () => { for (const c of Object.keys(CITY)) { const s = ranked(c); if (s) return s.unit || ''; } return ''; };

    function stop() { if (timer) { clearInterval(timer); timer = 0; } paintPlay(); }
    function paintPlay() { bPlay.textContent = timer ? '■' : '▶'; bPlay.setAttribute('aria-label', timer ? T('Stop', 'Διακοπή') : T('Play the day', 'Παίξε τη μέρα')); bPlay.classList.toggle('on', Boolean(timer)); }
    function toggle() {
      if (timer) return stop();
      if (bks.length < 2) return;
      if (still()) { go(cur >= bks.length - 1 ? 0 : cur + 1); return; }
      if (cur >= bks.length - 1) go(0);
      timer = setInterval(() => { if (dead || document.hidden) return stop(); if (cur >= bks.length - 1) return stop(); go(cur + 1); }, 700);
      paintPlay();
    }
    function go(i) {
      if (!bks.length) return;
      cur = clamp(i, 0, bks.length - 1);
      [...bars.children].forEach((b, j) => { b.classList.toggle('on', j <= cur); b.classList.toggle('cur', j === cur); b.setAttribute('aria-pressed', j === cur ? 'true' : 'false'); });
      const t = replay.times[bks[cur].b], newest = cur === bks.length - 1;
      when.textContent = SC.dateTime(t) + (newest ? T(' (newest)', ' (πιο πρόσφατο)') : '');
      drawCards();
      if (!timer) said.textContent = T('Showing ', 'Εμφανίζεται: ') + SC.dateTime(t);
    }

    function drawStrip() {
      const n = bks.length;
      const avg = bks.map((bk) => { const v = Object.keys(CITY).map((c) => at(series(c, 'air'), bk)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
      const have = avg.filter((x) => x != null), lo = Math.min(...have), hi = Math.max(...have), sp = hi - lo || 1;
      const every = Math.max(1, Math.round(n / 6));
      bars.replaceChildren(...bks.map((bk, i) => {
        const t = replay.times[bk.b], v = avg[i];
        return h('button', { type: 'button', class: 'dy-b' + (v == null ? ' none' : ''), tabindex: '-1', 'aria-pressed': 'false', title: SC.time(t) + (v == null ? '' : ' · ' + num(v) + ' °C'), 'aria-label': SC.dateTime(t) + (v == null ? '' : ', ' + num(v) + ' °C'), onclick: () => { stop(); go(i); } },
          h('i', { style: { height: (v == null ? 3 : Math.round(14 + ((v - lo) / sp) * 42)) + 'px' } }),
          h('small', null, i === n - 1 ? T('now', 'τώρα') : i % every === 0 && i < n - 2 ? SC.time(t) : ''));
      }));
      const span = n ? replay.times[replay.times.length - 1] - replay.times[0] : 0;
      count.textContent = T(replay.times.length + ' saved moments', replay.times.length + ' αποθηκευμένες στιγμές') + (have.length ? ' · ' + num(lo) + T(' to ', ' έως ') + num(hi) + ' °C' : '');
      barNote.textContent = (have.length ? T('Bars: the average outdoor temperature of the cities in each part of the day. ', 'Ράβδοι: η μέση θερμοκρασία έξω στις πόλεις σε κάθε κομμάτι της μέρας. ') : T('Bars: no outdoor temperature has been saved yet. ', 'Ράβδοι: δεν έχει αποθηκευτεί ακόμη θερμοκρασία έξω. '))
        + (span < 20 * HOUR ? T('The log is still filling, so the day is not complete yet.', 'Το αρχείο γεμίζει ακόμη, άρα η μέρα δεν είναι ολόκληρη.') : '');
    }

    function drawChips() {
      chips.replaceChildren(...MEAS.map(([k, en, el]) => {
        const any = Object.keys(CITY).some((c) => series(c, k));
        return h('button', { type: 'button', class: 'ly-chip' + (meas === k ? ' on' : ''), 'aria-pressed': meas === k ? 'true' : 'false', disabled: !any, title: any ? null : T('Nothing saved for this yet', 'Δεν έχει αποθηκευτεί κάτι ακόμη'), onclick: () => { meas = k; prevOrder = []; drawChips(); drawCards(); drawAside(); } }, T(en, el));
      }));
    }

    function drawCards() {
      const bk = bks[cur], ids = Object.keys(CITY);
      const val = Object.fromEntries(ids.map((c) => [c, at(ranked(c), bk)]));
      const order = ids.slice().sort((a, b) => (val[b] == null ? -Infinity : val[b]) - (val[a] == null ? -Infinity : val[a]) || ids.indexOf(a) - ids.indexOf(b));
      // the whole day's range of this measurement, over every city
      let lo = Infinity, hi = -Infinity; const own = {};
      ids.forEach((c) => { const s = ranked(c); if (!s) return; let a = Infinity, b = -Infinity; bks.forEach((k) => { const v = at(s, k); if (v != null) { a = Math.min(a, v); b = Math.max(b, v); } }); if (isFinite(a)) { own[c] = [a, b]; lo = Math.min(lo, a); hi = Math.max(hi, b); } });
      const sp = hi - lo || 1, pc = (v) => clamp(((v - lo) / sp) * 100, 0, 100).toFixed(1) + '%', unit = unitOf();
      const before = new Map([...cards].map(([c, e]) => [c, e.getBoundingClientRect().top]));
      order.forEach((c, i) => {
        const v = val[c], s = ranked(c), isOpen = open === c;
        const others = MEAS.filter(([k]) => k !== meas).map(([k, , , en, el]) => { const x = series(c, k), w = at(x, bk); return w == null ? null : (k === 'own' ? varName(x.variable) + T(' in ', ' σε ') + T(en, el) : T(en, el)) + ' ' + num(w) + (x.unit ? ' ' + x.unit : ''); }).filter(Boolean);
        const was = prevOrder.indexOf(c), moved = was < 0 || was === i ? '' : was > i ? 'up' : 'down';
        const head = h('button', { type: 'button', class: 'dy-h', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { open = isOpen ? null : c; drawCards(); } },
          h('span', { class: 'dy-r' }, v == null ? '–' : String(i + 1)),
          h('span', { class: 'dy-t' }, h('b', null, cityName(c), moved ? h('em', { class: 'dy-mv ' + moved, 'aria-hidden': 'true' }, moved === 'up' ? '▲' : '▼') : null),
            h('small', null, v == null ? (series(c, meas) && meas === 'own' ? T('measures something else here: ', 'εδώ μετρά κάτι άλλο: ') + varName(series(c, meas).variable) : T('nothing saved at this moment', 'τίποτα αποθηκευμένο αυτή τη στιγμή')) : others.join(' · '))),
          h('span', { class: 'dy-s' + (v == null ? ' none' : '') }, v == null ? '–' : num(v) + (unit ? ' ' + unit : '')));
        const line = own[c] ? h('div', { class: 'dy-ln', 'aria-hidden': 'true' },
          h('i', { class: 'dy-ln-own', style: { left: pc(own[c][0]), width: 'calc(' + pc(own[c][1]) + ' - ' + pc(own[c][0]) + ')' } }),
          v == null ? null : h('i', { class: 'dy-ln-d', style: { left: pc(v) } }),
          h('small', { class: 'l' }, num(lo) + (unit ? ' ' + unit : '')), h('small', { class: 'r' }, num(hi) + (unit ? ' ' + unit : ''))) : null;
        const more = isOpen ? h('div', { class: 'dy-more' },
          h('ul', { class: 'dy-l' }, ...MEAS.map(([k, en, el]) => { const x = series(c, k), w = at(x, bk); return h('li', null, h('span', null, T(en, el)), h('b', null, w == null ? '–' : num(w) + (x.unit ? ' ' + x.unit : '')), h('p', null, x ? (k === 'own' ? varName(x.variable) + ' · ' : '') + T('from: ', 'από: ') + srcName(x.source) : T('no layer has saved this for the city', 'κανένα στρώμα δεν το έχει αποθηκεύσει για την πόλη'))); })),
          own[c] ? h('p', { class: 'dy-why' }, T('Over the saved day here: from ', 'Στην αποθηκευμένη μέρα εδώ: από ') + num(own[c][0]) + T(' to ', ' έως ') + num(own[c][1]) + (unit ? ' ' + unit : '') + T('. The thick part of the line is this range; the dot is this moment.', '. Το χοντρό κομμάτι της γραμμής είναι αυτό το εύρος· η τελεία είναι αυτή η στιγμή.')) : null,
          h('button', { type: 'button', class: 'dy-go', onclick: () => { stop(); api.setCity(c); api.setView('compare'); } }, T('Compare the sources for ' + cityName(c), 'Σύγκρινε τις πηγές: ' + cityName(c)))) : null;
        let card = cards.get(c);
        if (!card) { card = h('article', { class: 'dy-c', dataset: { c } }); cards.set(c, card); }
        card.classList.toggle('open', isOpen); card.classList.toggle('none', v == null);
        card.replaceChildren(...[head, line, more].filter(Boolean));
      });
      list.replaceChildren(...order.map((c) => cards.get(c)));
      // the cards slide from where they were to where they are now
      if (!still() && before.size) order.forEach((c) => {
        const e = cards.get(c), d = before.has(c) ? before.get(c) - e.getBoundingClientRect().top : 0;
        if (Math.abs(d) < 2 || !e.animate) return;
        e.animate([{ transform: 'translateY(' + d + 'px)' }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      });
      prevOrder = order.filter((c) => val[c] != null);
    }

    function drawAside() {
      const every = replay ? replay.every : 300000, m = MEAS.find((x) => x[0] === meas);
      const p = (t) => h('p', { class: 'dy-note' }, t);
      aside.replaceChildren(
        h('b', null, T('What you see', 'Τι βλέπεις')),
        p(T('The readings that the layers saved, one every ' + dur(every) + ', for about a day. Press play and the day runs again, hour by hour. Nothing here is a forecast.', 'Οι μετρήσεις που αποθήκευσαν τα στρώματα, μία κάθε ' + dur(every) + ', για περίπου μία μέρα. Πάτα αναπαραγωγή και η μέρα τρέχει ξανά, ώρα με την ώρα. Τίποτα εδώ δεν είναι πρόβλεψη.')),
        h('b', null, T('How the cities are ranked', 'Πώς κατατάσσονται οι πόλεις')),
        p(T('By the number alone, highest first, for "' + m[1] + '". First place means the highest number, not the best city.', 'Μόνο με τον αριθμό, ο μεγαλύτερος πρώτος, για «' + m[2] + '». Η πρώτη θέση σημαίνει τον μεγαλύτερο αριθμό, όχι την καλύτερη πόλη.')),
        h('b', null, T('The line on each card', 'Η γραμμή σε κάθε κάρτα')),
        p(T('It runs from the lowest to the highest number that any city had in the saved day. The thick part is that city\'s own range and the dot is the chosen moment.', 'Πηγαίνει από τον μικρότερο στον μεγαλύτερο αριθμό που είχε οποιαδήποτε πόλη στην αποθηκευμένη μέρα. Το χοντρό κομμάτι είναι το εύρος της ίδιας της πόλης και η τελεία είναι η στιγμή που διάλεξες.')),
        h('p', { class: 'dy-warn' }, T('Each number comes from one layer, the first that had it. Two cities can be read by different kinds of sources, so a small gap between them may be the instruments, not the weather. Open a card to see the layer.', 'Κάθε αριθμός έρχεται από ένα στρώμα, το πρώτο που τον είχε. Δύο πόλεις μπορεί να μετρώνται από διαφορετικά είδη πηγών, άρα μια μικρή διαφορά μπορεί να είναι τα όργανα και όχι ο καιρός. Άνοιξε μια κάρτα για να δεις το στρώμα.')),
        h('b', null, T('What is missing', 'Τι λείπει')),
        p(T('Anything older than the saved day, and any moment when a layer was quiet. Buses and cars appear only as one number for the city, never as a place on a map.', 'Ό,τι είναι παλαιότερο από την αποθηκευμένη μέρα, και κάθε στιγμή που ένα στρώμα ήταν σιωπηλό. Τα λεωφορεία και τα αυτοκίνητα εμφανίζονται μόνο ως ένας αριθμός για την πόλη, ποτέ ως σημείο σε χάρτη.')));
    }

    function drawAll() {
      const wasLast = cur < 0 || cur >= bks.length - 1, keepT = cur >= 0 && bks[cur] ? replay.times[bks[cur].b] : null;
      bks = buckets(replay.times || []);
      const ok = bks.length >= 2;
      empty.hidden = ok; body.hidden = !ok; bars.hidden = !ok; barNote.hidden = !ok;
      [bFirst, bPlay, bLast].forEach((b) => { b.disabled = !ok; });
      if (!ok) { stop(); when.textContent = '–'; count.textContent = ''; empty.textContent = T('The replay fills as readings are saved, one every ' + dur(replay.every || 300000) + '. Come back in a little while.', 'Η αναπαραγωγή γεμίζει όσο αποθηκεύονται μετρήσεις, μία κάθε ' + dur(replay.every || 300000) + '. Έλα ξανά σε λίγο.'); return; }
      if (!Object.keys(CITY).some((c) => series(c, meas))) meas = (MEAS.find(([k]) => Object.keys(CITY).some((c) => series(c, k))) || MEAS[0])[0];
      drawStrip(); drawChips(); drawAside();
      go(wasLast || keepT == null ? bks.length - 1 : cur);
    }
    function loadReplay() {
      if (timer || Date.now() - replayAt < 120000) return;
      replayAt = Date.now();
      SC.api('/layers/api/replay').then((r) => { if (dead || timer) return; const first = !replay; replay = r; if (first) prevOrder = []; drawAll(); })
        .catch(() => { replayAt = 0; if (!replay && !dead) { empty.hidden = false; body.hidden = true; empty.textContent = T('The saved day could not be loaded. It is tried again in a moment.', 'Η αποθηκευμένη μέρα δεν φορτώθηκε. Γίνεται νέα προσπάθεια σε λίγο.'); } });
    }
    bars.addEventListener('keydown', (e) => {
      if (!bks.length) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stop(); go(cur + (e.key === 'ArrowRight' ? 1 : -1)); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); stop(); go(e.key === 'Home' ? 0 : bks.length - 1); }
      else if (e.key === ' ' || e.key === 'Enter') { if (e.target === bars) { e.preventDefault(); toggle(); } }
    });
    paintPlay(); body.hidden = true; empty.textContent = T('Loading the saved day…', 'Φόρτωση της αποθηκευμένης μέρας…');

    return {
      update(l) { live = l; loadReplay(); if (replay && bks.length >= 2 && open) drawCards(); },
      destroy() { dead = true; if (timer) clearInterval(timer); timer = 0; },
    };
  }
  SC.layersLive = SC.layersLive || {};
  SC.layersLive.day = day;
})();
