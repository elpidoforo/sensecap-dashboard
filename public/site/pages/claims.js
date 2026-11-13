/*
  Claim check: a student builds a statement about the data from blocks (measurement, city, comparison, another city or a number,
  now or over the saved day). The page turns it into like-for-like checks (official stations against official stations, models
  against models, sensors inside vehicles against sensors inside vehicles) and answers each with the numbers, their times and
  their layers, and one of three sentences: the data supports this, the data does not support this, the data cannot tell.
  No AI is used and nothing is sent anywhere: the check is the arithmetic below, on the blocks only.
  Data: GET /layers/api/live (cities, measurements, the margin inside which sources count as agreeing), GET /layers/api/replay
  (how long the saved day is), GET /layers/api/compare?city=&variable= (every source of one measurement in one city, with its
  saved points).
  The optional note stays in this browser tab: it is checked by TK4.checkText, shown as text, and never saved or sent.
  Link: #/claims?v=temperature&a=larnaka&op=higher&b=paphos&per=now   (or &n=25 for a number)
*/
(function () {
  'use strict';
  const t = SC.t, el = SC.el;
  const kit = () => (window.TK4 ? Promise.resolve(window.TK4) : (window.__tk4p = window.__tk4p || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/site/pages/tk4-kit.js?v=1';
    s.onload = () => res(window.TK4); s.onerror = () => { window.__tk4p = null; s.remove(); rej(new Error('kit')); }; document.head.append(s);
  })));
  const MIN_POINTS = 3;   // a source needs at least this many saved readings before an average over the day means anything
  const OPS = ['higher', 'lower', 'same'];

  /* ---------- the check itself (plain arithmetic, no AI) ---------- */
  // every usable source of one city, grouped by what kind of reading it is and where it was taken
  function evidence(resp, per) {
    const groups = new Map(), left = [];
    if (!resp) return { groups, left, missing: true };
    (resp.series || []).forEach((s) => {
      const name = (SC.lang === 'el' && s.nameEl) || s.name || s.source;
      const base = { source: s.source, name, kind: s.kind, env: s.env || 'outdoor', unit: s.unit || '', sensors: s.n || null };
      let item = null;
      if (per === 'now') {
        if (s.value == null || !isFinite(s.value)) return;
        if (s.stale) { left.push({ name, why: 'old', ageMin: s.ageMin }); return; }
        item = Object.assign(base, { value: Number(s.value), at: resp.at - (Number(s.ageMin) || 0) * 60000 });
      } else {
        const pts = (s.points || []).filter((p) => Array.isArray(p) && p[1] != null && isFinite(p[1]));
        if (pts.length < MIN_POINTS) { left.push({ name, why: 'few', n: pts.length }); return; }
        const vals = pts.map((p) => Number(p[1]));
        item = Object.assign(base, { value: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length, from: pts[0][0], to: pts[pts.length - 1][0], lo: Math.min(...vals), hi: Math.max(...vals) });
      }
      const key = item.kind + '|' + item.env;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return { groups, left, missing: false };
  }
  const range = (items) => ({ lo: Math.min(...items.map((i) => i.value)), hi: Math.max(...items.map((i) => i.value)) });
  // A against B. margin: how far apart sources may be and still count as agreeing (from the platform, or 0 when it has none)
  function verdict(op, A, B, margin) {
    if (op === 'lower') { const r = verdict('higher', B, A, margin); return r; }
    const m = margin || 0;
    const worst = A.lo - B.hi, best = A.hi - B.lo;   // the gap in favour of "A is higher", at its smallest and at its largest
    const overlap = worst < 0 && best > 0;
    if (op === 'same') {
      if (!m) return { v: 'cannot', why: 'nomargin' };
      const span = Math.max(A.hi, B.hi) - Math.min(A.lo, B.lo);
      if (span <= m) return { v: 'yes', why: 'within', gap: span };
      if (worst > m || best < -m) return { v: 'no', why: 'apart', gap: worst > m ? worst : -best };
      return { v: 'cannot', why: 'spread', gap: span };
    }
    if (worst > m) return { v: 'yes', why: 'clear', gap: worst };
    if (best <= 0 && (best < -m || m === 0)) return { v: 'no', why: best === 0 && worst === 0 ? 'equal' : 'opposite', gap: -best };
    return { v: 'cannot', why: overlap ? 'overlap' : 'close', gap: Math.abs((A.lo + A.hi) / 2 - (B.lo + B.hi) / 2) };
  }
  // the statement becomes one check per kind of source
  function judge(S, evA, evB, margin) {
    const checks = [];
    const keys = new Set([...evA.groups.keys(), ...(evB ? evB.groups.keys() : [])]);
    keys.forEach((key) => {
      const a = evA.groups.get(key) || null, b = evB ? evB.groups.get(key) || null : null;
      const [kind, env] = key.split('|');
      const c = { key, kind, env, a, b };
      if (S.tk === 'number') {
        if (!a) return;
        c.A = range(a); c.B = { lo: S.n, hi: S.n }; c.r = verdict(S.op, c.A, c.B, margin);
      } else if (a && b) {
        c.A = range(a); c.B = range(b); c.r = verdict(S.op, c.A, c.B, margin);
      } else c.r = { v: 'cannot', why: a ? 'onlyA' : 'onlyB' };
      checks.push(c);
    });
    const order = { 'reference-station': 0, 'calibrated-network': 1, 'low-cost-sensor': 2, 'crowd-sourced': 3, model: 4, reanalysis: 5, satellite: 6 };
    checks.sort((x, y) => (order[x.kind] == null ? 9 : order[x.kind]) - (order[y.kind] == null ? 9 : order[y.kind]) || x.key.localeCompare(y.key));
    // the overall answer counts outdoor checks when there are any: air inside a vehicle or a room is not the city's air
    const outdoor = checks.filter((c) => c.env === 'outdoor');
    const counted = outdoor.length ? outdoor : checks;
    checks.forEach((c) => { c.counted = counted.includes(c); });
    const yes = counted.filter((c) => c.r.v === 'yes').length, no = counted.filter((c) => c.r.v === 'no').length;
    const overall = !counted.length ? 'cannot' : yes && !no ? 'yes' : no && !yes ? 'no' : 'cannot';
    return { checks, n: counted.length, aside: checks.length - counted.length, yes, no, cannot: counted.length - yes - no, overall, mixed: yes > 0 && no > 0 };
  }

  SC.register('claims', {
    title: ['Claim check', 'Έλεγχος ισχυρισμού'],
    render(root, ctx) {
      SC.css('/site/pages/tk4.css');
      const head = SC.head({
        title: t('Claim check', 'Έλεγχος ισχυρισμού'),
        lede: t('Build a statement about the data from blocks. The page checks it against the live and saved numbers and shows you the evidence. It never just says true or false.',
          'Φτιάξε μια πρόταση για τα δεδομένα με κομμάτια. Η σελίδα την ελέγχει με τους ζωντανούς και τους αποθηκευμένους αριθμούς και σου δείχνει τα στοιχεία. Δεν λέει ποτέ σκέτο «σωστό» ή «λάθος».'),
        help: ['Pick a measurement, a city, a comparison, and what to compare with: another city or a number. Choose “now” or “over the saved day”. Press Check. The page compares only readings of the same kind: official stations with official stations, model estimates with model estimates, sensors inside vehicles with sensors inside vehicles. For each kind it shows every number with its time and the layer it came from, and one of three answers: the data supports this, the data does not support this, or the data cannot tell. No AI is used. The check is simple arithmetic that you could do yourself from the numbers shown.',
          'Διάλεξε μια μέτρηση, μια πόλη, μια σύγκριση και με τι συγκρίνεις: άλλη πόλη ή έναν αριθμό. Διάλεξε «τώρα» ή «σε όλη την αποθηκευμένη μέρα». Πάτα Έλεγχος. Η σελίδα συγκρίνει μόνο μετρήσεις του ίδιου είδους: επίσημους σταθμούς με επίσημους σταθμούς, εκτιμήσεις μοντέλου με εκτιμήσεις μοντέλου, αισθητήρες μέσα σε οχήματα με αισθητήρες μέσα σε οχήματα. Για κάθε είδος δείχνει κάθε αριθμό με την ώρα του και το στρώμα από όπου ήρθε, και μία από τρεις απαντήσεις: τα δεδομένα το στηρίζουν, τα δεδομένα δεν το στηρίζουν, ή τα δεδομένα δεν μπορούν να πουν. Δεν χρησιμοποιείται ΤΝ. Ο έλεγχος είναι απλή αριθμητική που μπορείς να κάνεις κι εσύ με τους αριθμούς που βλέπεις.'],
        tags: [{ text: t('No AI', 'Χωρίς ΤΝ'), cls: 'arch' }],
      });
      root.append(head);
      const host = el('div', { class: 'k4 k4-claims' }, el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
      root.append(host);
      let alive = true, K = null, runId = 0;
      const q = ctx.query || new URLSearchParams('');
      const S = { v: q.get('v') || 'temperature', a: q.get('a') || 'larnaka', op: OPS.includes(q.get('op')) ? q.get('op') : 'higher', tk: q.get('n') != null && q.get('n') !== '' ? 'number' : 'city', b: q.get('b') || 'paphos', n: q.get('n') != null && isFinite(Number(q.get('n'))) ? Number(q.get('n')) : 25, per: q.get('per') === 'day' ? 'day' : 'now' };
      const D = { live: null, replay: null, vars: [] };

      const opWord = (op) => ({ higher: t('is higher than', 'έχει υψηλότερη τιμή από'), lower: t('is lower than', 'έχει χαμηλότερη τιμή από'), same: t('is about the same as', 'έχει περίπου ίδια τιμή με') }[op]);
      const perWord = (per) => (per === 'day' ? t('over the saved day', 'σε όλη την αποθηκευμένη μέρα') : t('right now', 'αυτή τη στιγμή'));
      const varInfo = (v) => D.vars.find((x) => x.id === v) || { id: v, label: null, unit: K.varUnit(v) };
      const unitOf = (v) => varInfo(v).unit || K.varUnit(v);
      const vName = (v) => K.varName(v, varInfo(v).label);
      const EL_NOM = { larnaka: 'η Λάρνακα', lefkosia: 'η Λευκωσία', limassol: 'η Λεμεσός', paphos: 'η Πάφος' };
      const EL_ACC = { larnaka: 'τη Λάρνακα', lefkosia: 'τη Λευκωσία', limassol: 'τη Λεμεσό', paphos: 'την Πάφο' };
      function sentence() {
        const num = S.tk === 'number';
        return t(vName(S.v) + ' in ' + K.cityName(S.a) + ' ' + opWord(S.op) + ' ' + (num ? K.val(S.n, unitOf(S.v)) : 'in ' + K.cityName(S.b)) + ', ' + perWord(S.per) + '.',
          vName(S.v) + ': ' + (EL_NOM[S.a] || S.a) + ' ' + opWord(S.op) + ' ' + (num ? K.val(S.n, unitOf(S.v)) : (EL_ACC[S.b] || S.b)) + ', ' + perWord(S.per) + '.');
      }
      function marginOf(v) {
        const r = ((D.live && D.live.rivers) || []).find((x) => x.variable === v);
        if (!r || !r.cities) return 0;
        const c = r.cities[S.a] || Object.values(r.cities)[0];
        return c && isFinite(c.tolerance) && c.tolerance > 0 ? Number(c.tolerance) : 0;
      }
      function savedDay() {
        const tm = (D.replay && D.replay.times) || [];
        if (tm.length < 2) return null;
        return { from: tm[0], to: tm[tm.length - 1], n: tm.length, min: Math.round((tm[tm.length - 1] - tm[0]) / 60000) };
      }
      const span = (min) => (min < 60 ? t(min + ' minutes', min + ' λεπτά') : t((Math.round(min / 6) / 10) + ' hours', K.num(min / 60, 1) + ' ώρες'));

      /* ----- the builder ----- */
      let out, sayEl, noteF, bWrap;
      function builder() {
        const cities = K.CITY_IDS.map((c) => [c, K.cityName(c)]);
        const block = (cls, label, ctl) => el('label', { class: 'k4-block ' + cls }, el('span', null, label), ctl);
        const paintSay = () => { sayEl.textContent = sentence(); };
        const change = () => { paintSay(); out.replaceChildren(el('p', { class: 'k4-hint' }, t('Press “Check the claim” to see the evidence.', 'Πάτα «Έλεγξε τον ισχυρισμό» για να δεις τα στοιχεία.'))); };
        const numIn = el('input', { class: 'nm-input k4-num', type: 'number', step: 'any', inputmode: 'decimal', 'aria-label': t('The number to compare with', 'Ο αριθμός για σύγκριση') });
        numIn.value = String(S.n);
        numIn.addEventListener('input', () => { const n = Number(numIn.value); S.n = numIn.value !== '' && isFinite(n) ? n : NaN; unitEl.textContent = unitOf(S.v); change(); });
        const unitEl = el('i', { class: 'k4-unit' }, unitOf(S.v));
        const bSel = K.select({ label: t('The other city', 'Η άλλη πόλη'), opts: cities, value: S.b, onPick: (x) => { S.b = x; change(); } });
        bWrap = el('span', { class: 'k4-target' });
        const paintTarget = () => bWrap.replaceChildren(...(S.tk === 'number' ? [numIn, unitEl] : [bSel]));
        const vSel = K.select({ label: t('Measurement', 'Μέτρηση'), opts: D.vars.map((x) => [x.id, K.varName(x.id, x.label)]), value: S.v, onPick: (x) => { S.v = x; unitEl.textContent = unitOf(S.v); change(); } });
        const aSel = K.select({ label: t('City', 'Πόλη'), opts: cities, value: S.a, onPick: (x) => { S.a = x; change(); } });
        const opSel = K.select({ label: t('Comparison', 'Σύγκριση'), opts: OPS.map((o) => [o, opWord(o)]), value: S.op, onPick: (x) => { S.op = x; change(); } });
        const tkSel = K.select({ label: t('Compare with', 'Σύγκριση με'), opts: [['city', t('another city', 'άλλη πόλη')], ['number', t('a number', 'έναν αριθμό')]], value: S.tk, onPick: (x) => { S.tk = x; paintTarget(); change(); } });
        const perC = K.choice({ label: t('Period', 'Περίοδος'), value: S.per, opts: [['now', t('now', 'τώρα')], ['day', t('over the saved day', 'σε όλη την αποθηκευμένη μέρα')]], onPick: (x) => { S.per = x; change(); } });
        paintTarget();
        sayEl = el('p', { class: 'k4-say', 'aria-live': 'polite' });
        const sync = () => { vSel.value = S.v; aSel.value = S.a; opSel.value = S.op; tkSel.value = S.tk; bSel.value = S.b; numIn.value = isFinite(S.n) ? String(S.n) : ''; unitEl.textContent = unitOf(S.v); perC.set(S.per); paintTarget(); paintSay(); };
        const has = (v) => D.vars.some((x) => x.id === v);
        const PRE = [
          { v: 'temperature', a: 'larnaka', op: 'higher', tk: 'city', b: 'paphos', per: 'now' },
          { v: 'wind_speed', a: 'lefkosia', op: 'lower', tk: 'number', n: 5, per: 'now' },
          { v: 'relative_humidity', a: 'limassol', op: 'same', tk: 'city', b: 'larnaka', per: 'day' },
          { v: 'pm25', a: 'lefkosia', op: 'higher', tk: 'number', n: 15, per: 'now' },
        ].filter((p) => has(p.v));
        const presets = el('div', { class: 'k4-presets' }, el('span', null, t('Or start from one of these:', 'Ή ξεκίνα από ένα από αυτά:')),
          PRE.map((p) => { const keep = Object.assign({}, S); Object.assign(S, { b: S.b, n: S.n }, p); const label = sentence(); Object.assign(S, keep); return el('button', { type: 'button', class: 'k4-chip', onclick: () => { Object.assign(S, p); sync(); check(); } }, label); }));
        noteF = K.noteField({ max: 140, label: t('Why do you think so? (optional note)', 'Γιατί το πιστεύεις; (προαιρετική σημείωση)'),
          hint: t('Optional. It stays on this screen for printing and is never saved or sent. No names, links or phone numbers.', 'Προαιρετικό. Μένει σε αυτή την οθόνη για εκτύπωση και δεν αποθηκεύεται ούτε στέλνεται πουθενά. Χωρίς ονόματα, συνδέσμους ή τηλέφωνα.') });
        const go = el('button', { class: 'nm-btn nm-btn--primary k4-check', type: 'button', onclick: () => check() }, t('Check the claim', 'Έλεγξε τον ισχυρισμό'));
        const day = savedDay();
        const panel = el('section', { class: 'k4-panel k4-build k4-noprint', 'aria-labelledby': 'k4-b-h' },
          el('h2', { id: 'k4-b-h' }, t('1. Build your statement', '1. Φτιάξε την πρότασή σου')),
          el('div', { class: 'k4-blocks' }, block('b-var', t('What', 'Τι'), vSel), block('b-city', t('Where', 'Πού'), aSel), block('b-op', t('Comparison', 'Σύγκριση'), opSel), block('b-tk', t('With', 'Με'), tkSel),
            el('div', { class: 'k4-block b-city' }, el('span', null, t('Which', 'Ποιο')), bWrap)),
          el('div', { class: 'k4-per' }, el('span', { class: 'k4-lab' }, t('When', 'Πότε')), perC.node,
            el('small', null, day ? t('The saved day now holds ' + day.n + ' moments, from ' + SC.dateTime(day.from) + ' to ' + SC.time(day.to) + ' (' + span(day.min) + ').', 'Η αποθηκευμένη μέρα έχει τώρα ' + day.n + ' στιγμές, από ' + SC.dateTime(day.from) + ' έως ' + SC.time(day.to) + ' (' + span(day.min) + ').')
              : t('Nothing is saved for the day yet, so only “now” can be checked.', 'Δεν έχει αποθηκευτεί ακόμη τίποτα για τη μέρα, άρα μόνο το «τώρα» μπορεί να ελεγχθεί.'))),
          el('div', { class: 'k4-sayrow' }, el('span', { class: 'k4-lab' }, t('Your statement', 'Η πρότασή σου')), sayEl),
          presets, noteF.node,
          el('div', { class: 'k4-act' }, go));
        paintSay();
        return panel;
      }

      /* ----- the evidence ----- */
      const VTXT = { yes: ['The data supports this', 'Τα δεδομένα το στηρίζουν'], no: ['The data does not support this', 'Τα δεδομένα δεν το στηρίζουν'], cannot: ['The data cannot tell', 'Τα δεδομένα δεν μπορούν να πουν'] };
      const vWord = (v) => t(VTXT[v][0], VTXT[v][1]);
      const vMark = (v) => el('span', { class: 'k4-mark', 'aria-hidden': 'true' }, v === 'yes' ? '✓' : v === 'no' ? '✕' : '?');
      const rangeText = (R, u) => (R.lo === R.hi ? K.val(R.lo, u) : t(K.num(R.lo) + ' to ' + K.val(R.hi, u), K.num(R.lo) + ' έως ' + K.val(R.hi, u)));
      function whyText(c, u, margin) {
        const r = c.r, g = K.val(r.gap, u), m = K.val(margin, u);
        const A = K.cityName(S.a), B = S.tk === 'number' ? t('the number', 'τον αριθμό') : K.cityName(S.b);
        switch (r.why) {
          case 'clear': return margin ? t('Every reading on one side is beyond every reading on the other, by at least ' + g + '. That is more than the ' + m + ' inside which the platform treats sources as agreeing.', 'Κάθε μέτρηση της μίας πλευράς ξεπερνά κάθε μέτρηση της άλλης, τουλάχιστον κατά ' + g + '. Αυτό είναι περισσότερο από τα ' + m + ' μέσα στα οποία η πλατφόρμα θεωρεί ότι οι πηγές συμφωνούν.')
            : t('Every reading on one side is beyond every reading on the other, by at least ' + g + '.', 'Κάθε μέτρηση της μίας πλευράς ξεπερνά κάθε μέτρηση της άλλης, τουλάχιστον κατά ' + g + '.');
          case 'opposite': return t('The readings point the other way, by at least ' + g + '.', 'Οι μετρήσεις δείχνουν το αντίθετο, τουλάχιστον κατά ' + g + '.');
          case 'equal': return t('Both sides read the same number.', 'Και οι δύο πλευρές δείχνουν τον ίδιο αριθμό.');
          case 'overlap': return t('The sources of this kind do not agree with each other enough: their ranges overlap, so the gap between the two sides (about ' + g + ') is smaller than the disagreement between sources.', 'Οι πηγές αυτού του είδους δεν συμφωνούν αρκετά μεταξύ τους: τα εύρη τους επικαλύπτονται, άρα η διαφορά ανάμεσα στις δύο πλευρές (περίπου ' + g + ') είναι μικρότερη από τη διαφωνία των πηγών.');
          case 'close': return margin ? t('The gap (about ' + g + ') is not larger than ' + m + ', the amount by which two sources often differ even when they measure the same air.', 'Η διαφορά (περίπου ' + g + ') δεν είναι μεγαλύτερη από ' + m + ', όσο συχνά διαφέρουν δύο πηγές ακόμη κι όταν μετρούν τον ίδιο αέρα.') : t('The two sides are too close to call.', 'Οι δύο πλευρές είναι πολύ κοντά για να αποφασίσουμε.');
          case 'within': return t('All the readings fit inside ' + m + ' of each other (they span ' + g + '), which the platform treats as agreeing.', 'Όλες οι μετρήσεις απέχουν μεταξύ τους λιγότερο από ' + m + ' (εύρος ' + g + '), κάτι που η πλατφόρμα θεωρεί συμφωνία.');
          case 'apart': return t('The two sides are at least ' + g + ' apart, more than the ' + m + ' that counts as “about the same”.', 'Οι δύο πλευρές απέχουν τουλάχιστον ' + g + ', περισσότερο από τα ' + m + ' που μετρούν ως «περίπου ίδια».');
          case 'spread': return t('Some readings are within ' + m + ' of each other and some are not (they span ' + g + '), so it depends on which source you trust.', 'Κάποιες μετρήσεις απέχουν λιγότερο από ' + m + ' και κάποιες όχι (εύρος ' + g + '), άρα εξαρτάται από το ποια πηγή εμπιστεύεσαι.');
          case 'nomargin': return t('The platform has no agreed margin for “about the same” for this measurement, so this cannot be checked fairly. Try “is higher than” or “is lower than”.', 'Η πλατφόρμα δεν έχει συμφωνημένο περιθώριο για το «περίπου ίδια» σε αυτή τη μέτρηση, άρα δεν μπορεί να ελεγχθεί δίκαια. Δοκίμασε «υψηλότερη από» ή «χαμηλότερη από».');
          case 'onlyA': return t(B + ' has no reading of this kind, and a reading of a different kind would not be a fair comparison.', 'Η πόλη ' + B + ' δεν έχει μέτρηση αυτού του είδους, και μια μέτρηση άλλου είδους δεν θα ήταν δίκαιη σύγκριση.');
          case 'onlyB': return t(A + ' has no reading of this kind, and a reading of a different kind would not be a fair comparison.', 'Η πόλη ' + A + ' δεν έχει μέτρηση αυτού του είδους, και μια μέτρηση άλλου είδους δεν θα ήταν δίκαιη σύγκριση.');
          default: return '';
        }
      }
      function rows(items, u) {
        return el('ul', { class: 'k4-rows' }, items.map((i) => el('li', null,
          el('b', null, K.val(i.value, u || i.unit)),
          el('span', { class: 'k4-when' }, S.per === 'day'
            ? t('average of ' + i.n + ' saved readings, ' + SC.time(i.from) + ' to ' + SC.time(i.to) + ' (lowest ' + K.num(i.lo) + ', highest ' + K.num(i.hi) + ')', 'μέσος όρος ' + i.n + ' αποθηκευμένων μετρήσεων, ' + SC.time(i.from) + ' έως ' + SC.time(i.to) + ' (ελάχιστο ' + K.num(i.lo) + ', μέγιστο ' + K.num(i.hi) + ')')
            : t('at ', 'στις ') + SC.time(i.at)),
          el('span', { class: 'k4-layer' }, t('layer: ', 'στρώμα: ') + i.name + ' (' + K.kindWord(i.kind) + (i.sensors > 1 ? t(', ' + i.sensors + ' sensors', ', ' + i.sensors + ' αισθητήρες') : '') + ')'))));
      }
      function checkCard(c, u, margin, i) {
        const side = (title, items, R) => el('div', { class: 'k4-side' }, el('h4', null, title), items ? rows(items, u) : el('p', { class: 'k4-none' }, t('No reading of this kind.', 'Καμία μέτρηση αυτού του είδους.')),
          items && items.length > 1 ? el('p', { class: 'k4-rng' }, t('These sources span ', 'Αυτές οι πηγές κυμαίνονται: ') + rangeText(R || range(items), u)) : null);
        return el('article', { class: 'k4-check-card v-' + c.r.v },
          el('header', null, el('span', { class: 'k4-n' }, t('Check ', 'Έλεγχος ') + (i + 1)), el('h3', null, K.groupName(c.kind, c.env)), el('span', { class: 'k4-v v-' + c.r.v }, vMark(c.r.v), vWord(c.r.v))),
          el('div', { class: 'k4-sides' }, side(K.cityName(S.a), c.a, c.A),
            S.tk === 'number' ? el('div', { class: 'k4-side' }, el('h4', null, t('Your number', 'Ο αριθμός σου')), el('ul', { class: 'k4-rows' }, el('li', null, el('b', null, K.val(S.n, u)), el('span', { class: 'k4-when' }, t('typed by you, not a reading', 'τον έγραψες εσύ, δεν είναι μέτρηση'))))) : side(K.cityName(S.b), c.b, c.B)),
          el('p', { class: 'k4-why' }, whyText(c, u, margin)),
          c.counted ? null : el('p', { class: 'k4-fine k4-aside' }, t('Shown for interest. Not counted in the overall answer.', 'Φαίνεται για ενημέρωση. Δεν μετρά στη συνολική απάντηση.')),
          c.env === 'vehicle' ? el('p', { class: 'k4-fine' }, t('A sensor inside a vehicle measures the air in that vehicle, not the air of the whole city. Vehicles are shown only as city numbers, never as places.', 'Ένας αισθητήρας μέσα σε όχημα μετρά τον αέρα του οχήματος, όχι τον αέρα όλης της πόλης. Τα οχήματα εμφανίζονται μόνο ως αριθμοί πόλης, ποτέ ως σημεία.')) : null,
          c.kind === 'model' || c.kind === 'reanalysis' ? el('p', { class: 'k4-fine' }, t('A model estimate is a calculation, not a measurement taken in the city.', 'Η εκτίμηση μοντέλου είναι υπολογισμός, όχι μέτρηση που έγινε στην πόλη.')) : null);
      }
      function leftOut(ev, city) {
        if (!ev || !ev.left.length) return null;
        return el('li', null, K.cityName(city) + ': ' + ev.left.map((l) => l.name + ' (' + (l.why === 'old' ? t('reading too old', 'πολύ παλιά μέτρηση') : t('only ' + l.n + ' saved readings', 'μόνο ' + l.n + ' αποθηκευμένες μετρήσεις')) + ')').join(', '));
      }
      async function check() {
        const my = ++runId, u = unitOf(S.v);
        if (S.tk === 'number' && !isFinite(S.n)) { out.replaceChildren(el('div', { class: 'err', role: 'alert' }, t('Type a number to compare with.', 'Γράψε έναν αριθμό για σύγκριση.'))); return; }
        if (S.tk === 'city' && S.a === S.b) { out.replaceChildren(el('div', { class: 'err', role: 'alert' }, t('Pick two different cities.', 'Διάλεξε δύο διαφορετικές πόλεις.'))); return; }
        const note = noteF.state();
        if (!note.ok) { out.replaceChildren(el('div', { class: 'err', role: 'alert' }, t('Fix the note first, or clear it. ', 'Διόρθωσε πρώτα τη σημείωση ή σβήσε την. ') + note.why)); noteF.input.focus(); return; }
        out.replaceChildren(el('div', { class: 'loading' }, t('Reading the numbers', 'Διαβάζω τους αριθμούς')));
        const get = async (city) => {
          try { return await SC.api('/layers/api/compare?city=' + encodeURIComponent(city) + '&variable=' + encodeURIComponent(S.v)); }
          catch (e) { if (e.status === 404) return { at: Date.now(), series: [] }; throw e; }   // no layer has it for that city: that is an answer, not an error
        };
        let ra, rb = null;
        try { [ra, rb] = await Promise.all([get(S.a), S.tk === 'city' ? get(S.b) : Promise.resolve(null)]); }
        catch (e) {
          if (!alive || my !== runId) return;
          out.replaceChildren(K.errBox(t('The numbers could not be read, so nothing was checked. ', 'Οι αριθμοί δεν διαβάστηκαν, άρα δεν ελέγχθηκε τίποτα. ') + ((e && e.message) || ''), () => check()));
          return;
        }
        if (!alive || my !== runId) return;
        const evA = evidence(ra, S.per), evB = S.tk === 'city' ? evidence(rb, S.per) : null;
        const margin = marginOf(S.v), J = judge(S, evA, evB, margin);
        const day = savedDay();
        const sum = !J.checks.length
          ? (S.per === 'day' ? t('No source has enough saved readings for this yet (at least ' + MIN_POINTS + ' are needed). Missing data is not a “no”: the claim is simply not checked.', 'Καμία πηγή δεν έχει ακόμη αρκετές αποθηκευμένες μετρήσεις (χρειάζονται τουλάχιστον ' + MIN_POINTS + '). Τα δεδομένα που λείπουν δεν σημαίνουν «όχι»: ο ισχυρισμός απλώς δεν ελέγχθηκε.')
            : t('No layer has a fresh reading of this measurement for ' + K.cityName(S.a) + ' right now. Missing data is not a “no”: the claim is simply not checked.', 'Κανένα στρώμα δεν έχει φρέσκια μέτρηση γι’ αυτό στην πόλη ' + K.cityName(S.a) + ' αυτή τη στιγμή. Τα δεδομένα που λείπουν δεν σημαίνουν «όχι»: ο ισχυρισμός απλώς δεν ελέγχθηκε.'))
          : J.mixed ? t('Different kinds of source give different answers (' + J.yes + ' support it, ' + J.no + ' do not), so the data as a whole cannot tell.', 'Διαφορετικά είδη πηγών δίνουν διαφορετικές απαντήσεις (' + J.yes + ' το στηρίζουν, ' + J.no + ' όχι), άρα τα δεδομένα συνολικά δεν μπορούν να πουν.')
            : t('Of ' + J.n + ' like-for-like checks: ' + J.yes + ' support it, ' + J.no + ' do not, ' + J.cannot + ' cannot tell.', 'Από ' + J.n + ' ελέγχους όμοιου με όμοιο: ' + J.yes + ' το στηρίζουν, ' + J.no + ' όχι, ' + J.cannot + ' δεν μπορούν να πουν.')
              + (J.aside ? ' ' + t('Readings taken inside vehicles or rooms are shown below but not counted here, because they are not the city’s outdoor air.', 'Οι μετρήσεις μέσα σε οχήματα ή δωμάτια φαίνονται πιο κάτω αλλά δεν μετρούν εδώ, γιατί δεν είναι ο αέρας έξω στην πόλη.') : '');
        const lo = [leftOut(evA, S.a), evB ? leftOut(evB, S.b) : null].filter(Boolean);
        out.replaceChildren(...[
          el('section', { class: 'k4-panel k4-result v-' + J.overall, 'aria-labelledby': 'k4-r-h' },
            el('p', { class: 'k4-eye' }, t('2. The statement', '2. Η πρόταση')),
            el('p', { class: 'k4-claim' }, sentence()),
            el('h2', { id: 'k4-r-h', class: 'k4-verdict v-' + J.overall }, vMark(J.overall), vWord(J.overall)),
            el('p', { class: 'k4-sum' }, sum),
            el('p', { class: 'k4-fine' }, t('Checked at ', 'Ελέγχθηκε στις ') + SC.dateTime(ra.at || Date.now()) + '. ' + (S.per === 'day' && day ? t('Saved day: ' + SC.dateTime(day.from) + ' to ' + SC.time(day.to) + ' (' + span(day.min) + '). A short saved day is weak evidence.', 'Αποθηκευμένη μέρα: ' + SC.dateTime(day.from) + ' έως ' + SC.time(day.to) + ' (' + span(day.min) + '). Μια σύντομη αποθηκευμένη μέρα είναι αδύναμο στοιχείο.') : '')),
            note.text ? el('p', { class: 'k4-mynote' }, el('b', null, t('Our note (not checked by anyone): ', 'Η σημείωσή μας (δεν την έλεγξε κανείς): ')), note.text) : null),
          J.checks.length ? el('section', { class: 'k4-evid', 'aria-label': t('The evidence', 'Τα στοιχεία') }, el('h2', { class: 'k4-h' }, t('3. The evidence, one kind of source at a time', '3. Τα στοιχεία, ένα είδος πηγής τη φορά')), J.checks.map((c, i) => checkCard(c, u, margin, i))) : null,
          lo.length ? el('div', { class: 'k4-panel k4-left' }, el('b', null, t('Left out of the check', 'Έμειναν έξω από τον έλεγχο')), el('ul', null, lo)) : null,
          el('div', { class: 'k4-panel k4-honest' },
            el('b', null, t('What this check cannot do', 'Τι δεν μπορεί να κάνει αυτός ο έλεγχος')),
            el('ul', null,
              el('li', null, t('It compares numbers. It cannot say why they differ: a difference between two places or two moments is not a cause.', 'Συγκρίνει αριθμούς. Δεν μπορεί να πει γιατί διαφέρουν: μια διαφορά ανάμεσα σε δύο τόπους ή δύο στιγμές δεν είναι αιτία.')),
              el('li', null, t('It never mixes kinds: a sensor inside a vehicle or a room is not compared with outdoor air, and a model is not compared with a station.', 'Δεν ανακατεύει ποτέ είδη: ένας αισθητήρας μέσα σε όχημα ή δωμάτιο δεν συγκρίνεται με τον αέρα έξω, και ένα μοντέλο δεν συγκρίνεται με σταθμό.')),
              el('li', null, t('A higher or lower number does not make a city better or worse. It is only a number at a time.', 'Ένας υψηλότερος ή χαμηλότερος αριθμός δεν κάνει μια πόλη καλύτερη ή χειρότερη. Είναι μόνο ένας αριθμός σε μια στιγμή.'))),
            el('div', { class: 'k4-links k4-noprint' }, K.toolLink('layers'), K.toolLink('methods', '/why-differ', t('Why do two sensors differ?', 'Γιατί διαφέρουν δύο αισθητήρες;')), K.printBtn(t('Print the evidence', 'Εκτύπωσε τα στοιχεία'))))].filter(Boolean));
        out.querySelector('.k4-verdict').setAttribute('tabindex', '-1');
      }

      async function load() {
        host.replaceChildren(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
        try {
          K = await kit();
          const [live, replay] = await Promise.all([SC.api('/layers/api/live'), SC.api('/layers/api/replay').catch(() => null)]);
          if (!alive) return;
          D.live = live; D.replay = replay;
          const seen = new Map();
          Object.values((live && live.cities) || {}).forEach((c) => (c.rows || []).forEach((r) => { if (K.VARS[r.variable] && !seen.has(r.variable)) seen.set(r.variable, { id: r.variable, label: null, unit: r.unit || K.varUnit(r.variable) }); }));
          ((live && live.rivers) || []).forEach((r) => { if (seen.has(r.variable)) seen.get(r.variable).label = r.label; });
          D.vars = Object.keys(K.VARS).filter((v) => seen.has(v)).map((v) => seen.get(v));
          if (!D.vars.length) {
            host.replaceChildren(el('div', { class: 'empty' }, t('No layer is sending readings right now, so there is nothing to check a claim against. Come back when the layers are live.', 'Κανένα στρώμα δεν στέλνει μετρήσεις αυτή τη στιγμή, άρα δεν υπάρχει κάτι για να ελεγχθεί ένας ισχυρισμός. Έλα ξανά όταν τα στρώματα είναι ζωντανά.')));
            return;
          }
          if (!D.vars.some((x) => x.id === S.v)) S.v = D.vars[0].id;
          if (!K.CITY_IDS.includes(S.a)) S.a = 'larnaka';
          if (!K.CITY_IDS.includes(S.b)) S.b = 'paphos';
          K.demoTag(head);
          out = el('div', { class: 'k4-out', 'aria-live': 'polite' }, el('p', { class: 'k4-hint' }, t('Press “Check the claim” to see the evidence.', 'Πάτα «Έλεγξε τον ισχυρισμό» για να δεις τα στοιχεία.')));
          host.replaceChildren(builder(), out);
          if (q.get('v') || q.get('a')) check();
        } catch (e) {
          if (!alive) return;
          host.replaceChildren(window.TK4 ? window.TK4.errBox(t('The live data could not be loaded, so no claim can be checked right now. ', 'Τα ζωντανά δεδομένα δεν φορτώθηκαν, άρα κανένας ισχυρισμός δεν μπορεί να ελεγχθεί τώρα. ') + ((e && e.status !== undefined && e.message) || ''), load)
            : el('div', { class: 'err', role: 'alert' }, t('This page could not be loaded. Reload and try again.', 'Η σελίδα δεν φορτώθηκε. Κάνε ανανέωση και δοκίμασε ξανά.')));
        }
      }
      document.body.classList.add('k4-on');
      load();
      return () => { alive = false; document.body.classList.remove('k4-on'); };
    },
  });
})();
