/*
  Morning brief: five short lines for one school and its city, made from templates (no AI writes anything here).
    #/brief?city=<larnaka|lefkosia|limassol|paphos>
    1. the outdoor air now, and against 12 hours earlier     GET /layers/api/replay  (cities[c].air)
    2. the wind                                              GET /layers/api/replay  (cities[c].wind)
    3. the sea                                               GET /layers/api/replay  (cities[c].sea)
    4. our own sensors                                       GET /layers/api/replay  (cities[c].own)
    5. one thing to check: an official warning on the Met Office page (GET /api/dom/page?name=warnings, the same source and the
       same reading rules as pages/warnings.js), else a layer that went quiet, else sources that differ (GET /layers/api/live)
  Every line carries its unit, its time and the layer it came from. A line with no data says so. Nothing is a forecast.
  The print button uses the browser's own print, with a clean sheet (styles under "print" in toolkit-b2.css, on while body has bf-on).
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/toolkit-b2.css');
  const HOUR = 3600000;
  const isEl = () => SC.lang === 'el';
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−').replace('.', isEl() ? ',' : '.');
  const CITY = {
    larnaka: ['Larnaka', 'Λάρνακα', 'PASCAL Larnaka'], lefkosia: ['Lefkosia', 'Λευκωσία', 'PASCAL Lefkosia'],
    limassol: ['Limassol', 'Λεμεσός', 'PASCAL Limassol'], paphos: ['Paphos', 'Πάφος', 'International School of Paphos'],
  };
  const cityName = (c) => CITY[c][isEl() ? 1 : 0];
  const lab = (l) => (Array.isArray(l) ? l[isEl() ? 1 : 0] || l[0] : String(l || ''));
  const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
  // reading the Met Office warnings page: the same rules as pages/warnings.js
  const CHROME = /^(issued\s+)?(weather\s+)?warnings?:?$|department of meteorology|^copyright|©|^(home|back|print|menu|contact|refresh|top)$/i;
  const NO_WARNING = /\b(no (\w+ )?warnings?|none|nil|nothing|not (currently )?(issued|in force|active))\b|δεν υπαρχ|καμια προειδοπ|καμια ειδοπ/;
  const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const wLines = (text) => String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !CHROME.test(l));
  const isCalm = (text) => { const l = wLines(text); return !l.length || NO_WARNING.test(norm(l.join(' '))); };
  const levelOf = (text) => { let best = 0; for (const m of String(text || '').matchAll(/\b(red|orange|yellow)\s+warning/gi)) best = Math.max(best, { red: 3, orange: 2, yellow: 1 }[m[1].toLowerCase()]); return best; };

  // the newest saved value of a replay series, and the saved value nearest to 12 hours before it
  function nowAndBefore(s, times) {
    if (!s || !Array.isArray(s.values)) return null;
    let i = s.values.length - 1;
    while (i >= 0 && (s.values[i] == null || !isFinite(s.values[i]))) i--;
    if (i < 0) return null;
    const t = times[i], want = t - 12 * HOUR;
    let j = -1, best = Infinity, lo = Infinity, hi = -Infinity, first = -1;
    s.values.forEach((v, k) => { if (v == null || !isFinite(v) || k > i) return; if (first < 0) first = k; lo = Math.min(lo, v); hi = Math.max(hi, v); const d = Math.abs(times[k] - want); if (d < best) { best = d; j = k; } });
    return { v: s.values[i], t, lo, hi, firstT: times[first], firstV: s.values[first], before: j >= 0 && best <= 1.5 * HOUR ? { v: s.values[j], t: times[j] } : null };
  }
  SC.briefCore = { nowAndBefore, isCalm, levelOf };

  SC.register('brief', {
    title: ['Morning brief', 'Πρωινή ενημέρωση'],
    render(root, ctx) {
      let dead = false, data = null;
      const q = ctx && ctx.query && ctx.query.get('city');
      let city = Object.hasOwn(CITY, q) ? q : Object.hasOwn(CITY, SC.store.get('sc.brief.city')) ? SC.store.get('sc.brief.city') : 'larnaka';
      document.body.classList.add('bf-on');
      const chips = h('div', { class: 't2-chips bf-noprint', role: 'group', 'aria-label': T('Choose a school', 'Διάλεξε σχολείο') });
      const sheet = h('section', { class: 'bf-sheet', 'aria-live': 'polite' }, h('p', { class: 't2-empty' }, T('Loading the saved day…', 'Φόρτωση της αποθηκευμένης μέρας…')));
      const bPrint = h('button', { type: 'button', class: 'nm-btn bf-noprint', onclick: () => window.print() }, SC.icon('file', 18), T('Print', 'Εκτύπωση'));
      root.append(SC.head({ title: T('Morning brief', 'Πρωινή ενημέρωση'),
        lede: T('Five short lines to read out at the start of the day: the air, the wind, the sea, our own sensors, and one thing to check.', 'Πέντε σύντομες γραμμές για να διαβαστούν στην αρχή της μέρας: ο αέρας, ο άνεμος, η θάλασσα, οι δικοί μας αισθητήρες και ένα πράγμα για έλεγχο.'),
        help: ['Pick your school. Each line is a fixed sentence filled with the newest saved number, with its unit, its time and the data layer it came from. No AI writes these lines and nothing is a forecast. If a number is missing, the line says so.',
          'Διάλεξε το σχολείο σου. Κάθε γραμμή είναι μια έτοιμη πρόταση που γεμίζει με τον νεότερο αποθηκευμένο αριθμό, με τη μονάδα, την ώρα και το στρώμα δεδομένων από όπου ήρθε. Καμία ΤΝ δεν γράφει αυτές τις γραμμές και τίποτα δεν είναι πρόβλεψη. Αν λείπει ένας αριθμός, η γραμμή το λέει.'],
        actions: [bPrint] }),
        h('div', { class: 't2 bf' }, chips, sheet));

      function drawChips() {
        chips.replaceChildren(...Object.keys(CITY).map((c) => h('button', { type: 'button', class: 't2-chip' + (c === city ? ' on' : ''), 'aria-pressed': c === city ? 'true' : 'false', onclick: () => { city = c; SC.store.set('sc.brief.city', c); drawChips(); draw(); } }, CITY[c][2])));
      }
      const srcName = (id) => { const l = data.live && (data.live.layers || []).find((x) => x.id === id); return l ? (isEl() && l.nameEl) || l.name : id; };
      const meta = (unit, t, layer) => h('small', { class: 'bf-meta' }, [unit ? T('unit: ', 'μονάδα: ') + unit : null, t ? T('time: ', 'ώρα: ') + SC.dateTime(t) : null, layer ? T('layer: ', 'στρώμα: ') + layer : null].filter(Boolean).join(' · '));
      const row = (n, title, text, m, cls) => h('li', { class: 'bf-row' + (cls ? ' ' + cls : '') }, h('span', { class: 'bf-n', 'aria-hidden': 'true' }, String(n)), h('div', null, h('b', null, title), h('p', null, text), m));
      const none = (what) => T('No layer has saved ' + what[0] + ' for this city in the last day.', 'Κανένα στρώμα δεν έχει αποθηκεύσει ' + what[1] + ' για αυτή την πόλη την τελευταία μέρα.');

      function airRow(c, times) {
        const s = c && c.air, x = nowAndBefore(s, times);
        if (!x) return row(1, T('Outdoor air', 'Ο αέρας έξω'), none(['the outdoor air temperature', 'τη θερμοκρασία του αέρα έξω']), null, 'none');
        let more;
        if (x.before) {
          const d = x.v - x.before.v, same = Math.abs(d) < 0.05;
          more = same ? T('That is the same as 12 hours earlier (' + SC.time(x.before.t) + ').', 'Είναι ίδια με 12 ώρες νωρίτερα (' + SC.time(x.before.t) + ').')
            : T('That is ' + num(Math.abs(d)) + ' ' + s.unit + (d > 0 ? ' warmer' : ' cooler') + ' than 12 hours earlier (' + num(x.before.v) + ' ' + s.unit + ' at ' + SC.time(x.before.t) + ').', 'Είναι ' + num(Math.abs(d)) + ' ' + s.unit + (d > 0 ? ' πιο ζεστά' : ' πιο δροσερά') + ' από 12 ώρες νωρίτερα (' + num(x.before.v) + ' ' + s.unit + ' στις ' + SC.time(x.before.t) + ').');
        } else more = T('The saved log only goes back to ' + SC.dateTime(x.firstT) + ', so the change overnight cannot be said yet.', 'Το αρχείο φτάνει πίσω μόνο μέχρι ' + SC.dateTime(x.firstT) + ', άρα η αλλαγή της νύχτας δεν μπορεί να ειπωθεί ακόμη.');
        return row(1, T('Outdoor air', 'Ο αέρας έξω'), T('The air outside in ' + cityName(city) + ' is ' + num(x.v) + ' ' + s.unit + '. ', 'Ο αέρας έξω: ' + cityName(city) + ', ' + num(x.v) + ' ' + s.unit + '. ') + more, meta(s.unit, x.t, srcName(s.source)));
      }
      function simpleRow(n, s, times, title, what, say) {
        const x = nowAndBefore(s, times);
        if (!x) return row(n, title, none(what), null, 'none');
        return row(n, title, say(x) + ' ' + T('Over the saved day it went from ' + num(x.lo) + ' to ' + num(x.hi) + ' ' + s.unit + '.', 'Στην αποθηκευμένη μέρα κινήθηκε από ' + num(x.lo) + ' έως ' + num(x.hi) + ' ' + s.unit + '.'), meta(s.unit, x.t, srcName(s.source)));
      }
      function ownRow(c, times) {
        const s = c && c.own, x = nowAndBefore(s, times), title = T('Our own sensors', 'Οι δικοί μας αισθητήρες');
        if (!x) return row(4, title, T('None of our own sensors has saved a reading for this city in the last day.', 'Κανένας δικός μας αισθητήρας δεν έχει αποθηκεύσει μέτρηση για αυτή την πόλη την τελευταία μέρα.'), null, 'none');
        const indoor = s.source === 'sensecap-classrooms', what = s.variable === 'co2' ? ['CO₂', 'CO₂'] : s.variable === 'temperature' ? ['Temperature', 'Θερμοκρασία'] : [s.variable, s.variable];
        const where = indoor ? T('in our classrooms (indoors)', 'στις τάξεις μας (μέσα)') : T('inside our ' + (s.source === 'sensecap-cars' ? 'cars' : 'buses') + ' (not a classroom, and not the street)', 'μέσα ' + (s.source === 'sensecap-cars' ? 'στα αυτοκίνητά' : 'στα λεωφορεία') + ' μας (όχι τάξη, ούτε ο δρόμος)');
        return row(4, title, lab(what) + ' ' + where + ': ' + num(x.v) + ' ' + s.unit + '. ' + T('Over the saved day it went from ' + num(x.lo) + ' to ' + num(x.hi) + ' ' + s.unit + '. One number for the city, the average of the sensors that reported.', 'Στην αποθηκευμένη μέρα κινήθηκε από ' + num(x.lo) + ' έως ' + num(x.hi) + ' ' + s.unit + '. Ένας αριθμός για την πόλη, ο μέσος όρος των αισθητήρων που ανέφεραν.'), meta(s.unit, x.t, srcName(s.source)));
      }
      function checkRow() {
        const title = T('One thing to check', 'Ένα πράγμα για έλεγχο'), w = data.warn, foot = [];
        if (w && w.ok && w.v && typeof w.v.text === 'string') {
          const at = Date.parse(w.v.fetched);
          if (!isCalm(w.v.text)) {
            const lv = levelOf(w.v.text), names = { 0: T('A warning', 'Μια προειδοποίηση'), 1: T('A yellow warning', 'Μια κίτρινη προειδοποίηση'), 2: T('An orange warning', 'Μια πορτοκαλί προειδοποίηση'), 3: T('A red warning', 'Μια κόκκινη προειδοποίηση') };
            return row(5, title, [names[lv] + T(' is on the Met Office warnings page for Cyprus. Read it and check whether it covers ' + cityName(city) + '. ', ' υπάρχει στη σελίδα προειδοποιήσεων της Μετεωρολογικής για την Κύπρο. Διάβασέ την και δες αν αφορά την περιοχή: ' + cityName(city) + '. '), h('a', { class: 'bf-link bf-noprint', href: '#/warnings' }, T('Open the warnings page', 'Άνοιξε τη σελίδα προειδοποιήσεων'))], meta(null, isFinite(at) ? at : null, T('Met Office warnings page', 'Σελίδα προειδοποιήσεων Μετεωρολογικής')), 'warn');
          }
          foot.push(T('No warning on the Met Office page', 'Καμία προειδοποίηση στη σελίδα της Μετεωρολογικής') + (isFinite(at) ? T(' (read ', ' (διαβάστηκε ') + SC.time(at) + ')' : ''));
        } else foot.push(T('The Met Office warnings page could not be read just now, so a warning may exist', 'Η σελίδα προειδοποιήσεων της Μετεωρολογικής δεν διαβάστηκε τώρα, άρα μπορεί να υπάρχει προειδοποίηση'));
        const live = data.live;
        if (!live) return row(5, title, T('The layers could not be read just now, so nothing can be suggested. ', 'Τα στρώματα δεν διαβάστηκαν τώρα, άρα δεν μπορεί να προταθεί κάτι. ') + foot.join('. ') + '.', null, 'none');
        const quiet = (live.layers || []).filter((l) => (l.state === 'down' || l.state === 'late') && l.lastAt && ['own', 'official', 'model'].includes(l.group)).sort((a, b) => b.lastAt - a.lastAt)[0];
        if (quiet) return row(5, title, T('The layer "' + quiet.name + '" has gone quiet: its last reading was at ' + SC.dateTime(quiet.lastAt) + '. Check whether it is back before you use its numbers. ', 'Το στρώμα «' + ((quiet.nameEl) || quiet.name) + '» έχει σωπάσει: η τελευταία του μέτρηση ήταν στις ' + SC.dateTime(quiet.lastAt) + '. Έλεγξε αν επέστρεψε πριν χρησιμοποιήσεις τους αριθμούς του. ') + foot.join('. ') + '.', meta(null, quiet.lastAt, (isEl() && quiet.nameEl) || quiet.name), 'warn');
        const diff = (live.rivers || []).map((rv) => ({ rv, c: rv.cities && rv.cities[city] })).filter((x) => x.c && x.c.state === 'differ' && x.c.tolerance > 0).sort((a, b) => b.c.spread / b.c.tolerance - a.c.spread / a.c.tolerance)[0];
        if (diff) return row(5, title, [T('The sources do not agree on ' + lab(diff.rv.label).toLowerCase() + ' in ' + cityName(city) + ': from ' + num(diff.c.low) + ' to ' + num(diff.c.high) + ' ' + diff.rv.unit + ' (' + diff.c.sources.length + ' layers; they count as agreeing within ' + num(diff.c.tolerance) + ' ' + diff.rv.unit + '). Different instruments in different places can explain a gap. ', 'Οι πηγές δεν συμφωνούν (' + lab(diff.rv.label).toLowerCase() + ', ' + cityName(city) + '): από ' + num(diff.c.low) + ' έως ' + num(diff.c.high) + ' ' + diff.rv.unit + ' (' + diff.c.sources.length + ' στρώματα· θεωρούμε ότι συμφωνούν μέχρι ' + num(diff.c.tolerance) + ' ' + diff.rv.unit + '). Διαφορετικά όργανα σε διαφορετικά σημεία μπορούν να εξηγήσουν μια διαφορά. '),
          h('a', { class: 'bf-link bf-noprint', href: '#/layers' }, T('Compare the sources', 'Σύγκρινε τις πηγές')), ' ' + foot.join('. ') + '.'], meta(diff.rv.unit, live.at, diff.c.sources.map(srcName).join(', ')), 'warn');
        return row(5, title, T('Nothing stands out: no layer that reported before has gone quiet, and the sources that can be compared for this city agree. ', 'Τίποτα δεν ξεχωρίζει: κανένα στρώμα που ανέφερε πριν δεν έχει σωπάσει, και οι πηγές που μπορούν να συγκριθούν για αυτή την πόλη συμφωνούν. ') + foot.join('. ') + '.', meta(null, live.at, T('all layers', 'όλα τα στρώματα')));
      }

      function draw() {
        if (!data) return;
        const r = data.replay, times = (r && r.times) || [], c = r && r.cities && r.cities[city];
        if (!r) { sheet.replaceChildren(h('p', { class: 't2-empty' }, h('span', { class: 't2-err', role: 'alert' }, T('The saved day could not be loaded, so there is no brief. ', 'Η αποθηκευμένη μέρα δεν φορτώθηκε, άρα δεν υπάρχει ενημέρωση. ')), h('button', { type: 'button', class: 't2-go bf-noprint', onclick: () => load() }, T('Try again', 'Δοκίμασε ξανά')))); return; }
        const newest = times.length ? times[times.length - 1] : null, old = newest != null && Date.now() - newest > 2 * HOUR;
        sheet.replaceChildren(...[
          h('header', { class: 'bf-top' }, h('p', { class: 'bf-eye' }, T('Morning brief · Athena', 'Πρωινή ενημέρωση · Αθηνά')), h('h2', null, CITY[city][2] + ' · ' + cityName(city)),
            h('p', { class: 'bf-date' }, SC.day(Date.now()) + (newest ? ' · ' + T('newest saved reading ', 'νεότερη αποθηκευμένη μέτρηση ') + SC.dateTime(newest) : ''))),
          !times.length ? h('p', { class: 'bf-old' }, T('Nothing has been saved yet. The lines below fill as the layers report.', 'Δεν έχει αποθηκευτεί τίποτα ακόμη. Οι γραμμές πιο κάτω γεμίζουν όσο αναφέρουν τα στρώματα.'))
            : old ? h('p', { class: 'bf-old' }, T('Careful: the newest saved reading is ' + SC.ago(newest) + '. These lines are not "now".', 'Προσοχή: η νεότερη αποθηκευμένη μέτρηση είναι ' + SC.ago(newest) + '. Αυτές οι γραμμές δεν είναι «τώρα».')) : null,
          h('ol', { class: 'bf-rows' },
            airRow(c, times),
            simpleRow(2, c && c.wind, times, T('Wind', 'Άνεμος'), ['the wind', 'τον άνεμο'], (x) => T('The wind is ' + num(x.v) + ' ' + c.wind.unit + '.', 'Ο άνεμος είναι ' + num(x.v) + ' ' + c.wind.unit + '.')),
            simpleRow(3, c && c.sea, times, T('Sea', 'Θάλασσα'), ['the sea temperature', 'τη θερμοκρασία της θάλασσας'], (x) => T('The sea surface near ' + cityName(city) + ' is ' + num(x.v) + ' ' + c.sea.unit + '.', 'Η επιφάνεια της θάλασσας (' + cityName(city) + '): ' + num(x.v) + ' ' + c.sea.unit + '.')),
            ownRow(c, times),
            checkRow()),
          h('footer', { class: 'bf-foot' }, T('Made from fixed sentences and saved readings. No AI wrote this and nothing here is a forecast. A model estimate and a sensor can differ; each line names its layer.', 'Φτιαγμένο από έτοιμες προτάσεις και αποθηκευμένες μετρήσεις. Καμία ΤΝ δεν το έγραψε και τίποτα εδώ δεν είναι πρόβλεψη. Μια εκτίμηση μοντέλου και ένας αισθητήρας μπορεί να διαφέρουν· κάθε γραμμή γράφει το στρώμα της.'))].filter(Boolean));
      }
      function load() {
        return Promise.all([settle(SC.api('/layers/api/replay')), settle(SC.api('/layers/api/live')), settle(SC.api('/api/dom/page?name=warnings'))]).then(([r, l, w]) => {
          if (dead) return;
          data = { replay: r.ok ? r.v : null, live: l.ok ? l.v : null, warn: w };
          draw();
        });
      }
      drawChips(); load();
      const timer = setInterval(() => { if (!document.hidden && !dead) load(); }, 300000);
      return () => { dead = true; clearInterval(timer); document.body.classList.remove('bf-on'); };
    },
  });
})();
