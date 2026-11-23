/*
  Data Flow (#/flow): how records travel from the sources to the data sheets, and which live feeds answer now. Everything is
  built only from the platform's own answers (/api/stack). Counts are counts of real records; nothing is invented. The pipeline is a
  how-it-works picture (labelled so); the roster shows real ages and counts. Vehicle positions never appear.
  Interactive: point at or click a source, a sheet or a feed and the detail card shows what we know about it; the log walks through
  the same facts line by line (a reading aid, with pause and step buttons).
*/
(function () {
  'use strict';
  const T = SC.t;
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css');
  const LIBS = ['/site/viz/kit.js', '/site/vortexdata.js', '/site/viz/pipeline-data.js', '/site/viz/pipeline.js', '/site/viz/roster-data.js', '/site/viz/roster.js'];
  const SETS = ['ev', 'crossings', 'flood', 'quakes'];
  const SRC = { ev: ['EV charging points', 'Σημεία φόρτισης EV'], crossings: ['Crossings', 'Διαβάσεις'], flood: ['Flood reaches', 'Ποτάμια'], quakes: ['Earthquakes', 'Σεισμοί'] };
  const NOPE = ['This data could not be loaded right now.', 'Τα δεδομένα δεν φόρτωσαν αυτή τη στιγμή.'];

  function build(root) {
    const K = SC.viz.kit, VD = SC.vortexData, stops = [], ans = {};
    const wl = K.el('div', 'dw'); root.append(wl);
    const keep = (h) => { if (h && h.destroy) stops.push(() => h.destroy()); return h; };
    const nope = (p) => K.note(p.host, T(NOPE[0], NOPE[1]));
    const still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // the counter strip
    const strip = K.el('div', 'dw-strip'); wl.append(strip);
    const cell = (label) => { const s = K.el('span'), b = K.el('b', null, '–'); s.append(b, document.createTextNode(label)); strip.append(s); return (n) => { b.textContent = String(n); }; };
    strip.append(K.el('span', 'dw-name', 'Kleanthis // Data Flow'));
    const setIn = cell(T('records in', 'εγγραφές μέσα')), setOut = cell(T('sheets out', 'φύλλα έξω')), setFeeds = cell(T('feeds answering', 'πηγές που απαντούν'));
    strip.append(K.el('span', 'dw-end', T('how it works, not live traffic', 'πώς λειτουργεί, όχι ζωντανή κίνηση')));

    const pp = K.panel(wl, T('How records travel', 'Πώς ταξιδεύουν οι εγγραφές'),
      T('Point at a source on the left or a sheet on the right; click to keep it in the card. The moving dots show how it works, not live traffic.',
        'Δείξτε μια πηγή αριστερά ή ένα φύλλο δεξιά· πατήστε για να μείνει στην κάρτα. Οι κινούμενες τελείες δείχνουν πώς λειτουργεί, όχι ζωντανή κίνηση.'), 'dw-8 wl-tall');

    // the detail card
    const cp = K.panel(wl, T('What you picked', 'Τι διαλέξατε'), T('Facts about the source, sheet or feed you point at.', 'Στοιχεία για την πηγή, το φύλλο ή τη ροή που δείχνετε.'), 'dw-4');
    cp.box.querySelector('.wl-list').remove(); cp.host.setAttribute('aria-live', 'polite');
    const card = K.el('div', 'dw-card'); cp.host.append(card);
    let pinned = null;
    const line = (k, v) => { if (v == null || v === '') return; const p = K.el('p'); p.style.margin = '2px 0'; p.append(K.el('span', 'dw-k', k + ': '), K.el('span', 'dw-v', String(v))); card.append(p); };
    function show(d) {
      card.textContent = '';
      if (!d) { card.append(K.el('p', null, T('Nothing picked yet. Point at a card, a pill or a feed row.', 'Δεν διαλέξατε κάτι ακόμη. Δείξτε μια κάρτα, ένα φύλλο ή μια γραμμή πηγής.'))); return; }
      card.append(K.el('h3', null, K.pair(d.title)));
      card.append(K.el('p', null, d.kindText));
      (d.lines || []).forEach((l) => line(l[0], l[1]));
      const a = ans[d.sheetId];
      if (a) {
        line(T('Publisher', 'Εκδότης'), Array.isArray(a.source) ? K.pair(a.source) : a.source);
        line(T('Licence', 'Άδεια'), a.licence);
        line(T('Period', 'Περίοδος'), a.period);
        line(T('Retrieved', 'Λήψη'), a.retrieved || a.updated);
        if (Array.isArray(a.honesty)) card.append(K.el('p', null, K.pair(a.honesty)));
        if (a.sourceUrl && /^https:\/\//.test(a.sourceUrl)) { const l = K.el('a', null, T('Open the publisher’s page', 'Άνοιγμα σελίδας εκδότη')); l.href = a.sourceUrl; l.target = '_blank'; l.rel = 'noopener noreferrer'; const p = K.el('p'); p.append(l); card.append(p); }
      }
      const s = K.el('a', null, T('See the data sheets in 3D', 'Δείτε τα φύλλα δεδομένων σε 3D')); s.href = '#/stack'; const p2 = K.el('p'); p2.append(s); card.append(p2);
    }
    const pick = (d, pin) => { if (pin) pinned = d; show(d || pinned); };
    show(null);

    // the run log: one line per step of the run, typed as the step happens (a scripted walk-through, labelled so)
    const lp = K.panel(wl, T('Run log: one line per step', 'Ημερολόγιο: μία γραμμή ανά βήμα'), T('A scripted walk-through of the same facts, one source at a time. It is not a live log.', 'Προγραμματισμένη παρουσίαση των ίδιων στοιχείων, μία πηγή τη φορά. Δεν είναι ζωντανό ημερολόγιο.'), 'wl-wide');
    lp.box.querySelector('.wl-list').remove();
    const log = K.el('ol', 'dw-log'); lp.host.append(log); lp.host.style.minHeight = '0';
    // timings measured from the reference recording at 10 frames a second: a step every 1.8 s, the finished state held 3.7 s, 2.7 s to start over
    const STEP = 1800, HOLD = 3700, RESET = 2700, TYPE = 600;
    const run = { steps: [], i: -1, phase: 'idle', timer: 0, playing: false, type: 0, go: null };
    const mk = (text, fn) => { const b = K.el('button', null, text); b.type = 'button'; b.onclick = fn; lp.tools.append(b); return b; };
    const pb = mk(T('Play', 'Αναπαραγωγή'), () => setPlay(!run.playing));
    mk(T('Next step', 'Επόμενο βήμα'), () => { setPlay(false); advance(); });
    mk(T('Start over', 'Από την αρχή'), () => { setPlay(false); pinned = null; reset(); });
    const stepLabel = K.el('span', 'wl-read'); stepLabel.style.margin = '0 0 0 8px'; lp.tools.append(stepLabel);
    function typeLine(li, text) { clearInterval(run.type); if (still) { li.textContent = text; return; } let n = 0; const per = Math.max(1, Math.ceil(text.length / (TYPE / 30))); run.type = setInterval(() => { n = Math.min(text.length, n + per); li.textContent = text.slice(0, n); if (n >= text.length) clearInterval(run.type); }, 30); }
    function show1(i) {
      const st = run.steps[i]; run.i = i; run.phase = 'step'; if (run.go) run.go.step(i);
      for (const li of log.children) li.classList.remove('on');
      const li = K.el('li', 'on'); li.dataset.n = String(i + 1).padStart(2, '0'); log.append(li); typeLine(li, K.pair(st.line)); log.scrollTop = log.scrollHeight;
      stepLabel.textContent = T('step', 'βήμα') + ' ' + (i + 1) + '/' + run.steps.length;
      if (!pinned) show(st.card);
    }
    function finish() {
      run.phase = 'ready'; if (run.go) run.go.ready(true); for (const li of log.children) li.classList.remove('on');
      stepLabel.textContent = T('ready', 'έτοιμο') + ' ' + run.steps.length + '/' + run.steps.length;
      if (!pinned) summary();
    }
    function reset() { clearInterval(run.type); run.phase = 'idle'; run.i = -1; log.textContent = ''; stepLabel.textContent = ''; if (run.go) { run.go.ready(false); run.go.step(-1); } if (!pinned) show(null); }
    function advance() { if (!run.steps.length) return 0; if (run.phase === 'ready') { reset(); return RESET; } if (run.i + 1 < run.steps.length) { show1(run.i + 1); return STEP; } finish(); return HOLD; }
    function tick() { clearTimeout(run.timer); if (!run.playing) return; const wait = document.hidden ? 1000 : advance(); run.timer = setTimeout(tick, wait || 1000); }
    function setPlay(on) { run.playing = !!on && !still; clearTimeout(run.timer); pb.textContent = run.playing ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'); pb.setAttribute('aria-pressed', String(run.playing)); if (run.playing) tick(); }
    if (still) pb.hidden = true;
    stops.push(() => { clearTimeout(run.timer); clearInterval(run.type); });
    function summary() {
      card.textContent = ''; const tot = run.steps.reduce((a, st) => a + st.count, 0);
      card.append(K.el('h3', null, tot + ' ' + T('records', 'εγγραφές') + ' \u00b7 ' + run.sheetsOut + ' ' + T('sheets', 'φύλλα')));
      card.append(K.el('p', null, T('The run is finished: every source has reached its data sheet.', 'Η διαδρομή τελείωσε: κάθε πηγή έφτασε στο φύλλο της.')));
      run.steps.forEach((st) => line(K.pair(st.title), st.count + ' ' + T('records', 'εγγραφές')));
    }

    const rs = K.panel(wl, T('Feeds that update', 'Πηγές που ανανεώνονται'),
      T('One row per live, delayed or scheduled data sheet: when it was last fetched and how many records came. Click a row to read it in the card. Age shows freshness only, not quality.',
        'Μία γραμμή για κάθε ζωντανό, καθυστερημένο ή προγραμματισμένο φύλλο: πότε λήφθηκε και πόσες εγγραφές ήρθαν. Πατήστε μια γραμμή για να τη διαβάσετε στην κάρτα. Η ηλικία δείχνει μόνο φρεσκάδα, όχι ποιότητα.'), 'wl-wide');

    K.tryJson('/api/stack').then((cat) => {
      const titleOf = (id) => { const s = cat && cat.sheets && cat.sheets.find((x) => x.id === id); return s && Array.isArray(s.title) ? s.title : [id, id]; };
      Promise.all(SETS.map((v) => K.tryJson('/api/stack/' + VD.SOURCE[v]).then((a) => { ans[VD.SOURCE[v]] = a; return a ? VD.BUILD[v](a) : null; }))).then((ms) => {
        const sources = [];
        SETS.forEach((v, i) => { const m = ms[i]; if (!m || !m.items) return; sources.push({ id: v, title: SRC[v], count: m.items.length, sheetId: VD.SOURCE[v], sheetTitle: titleOf(VD.SOURCE[v]) }); });
        if (!sources.length) { nope(pp); return; }
        const pm = SC.viz.pipelineData.build({ sources });
        setIn(pm.recordsIn); setOut(pm.sheetsOut);
        pp.rows(pm); pp.aria(pm); pp.host.textContent = '';
        const toCard = (p) => (!p ? null : p.kind === 'source'
          ? { title: p.title, sheetId: p.sheetId, kindText: T('A source of records', 'Πηγή εγγραφών'), lines: [[T('Records', 'Εγγραφές'), p.count], [T('Goes to the sheet', 'Πηγαίνει στο φύλλο'), K.pair(p.sheetTitle)]] }
          : { title: p.title, sheetId: p.id, kindText: T('A data sheet', 'Φύλλο δεδομένων'), lines: [[T('Records received', 'Εγγραφές που έλαβε'), p.records]] });
        let last = null;
        run.go = keep(SC.viz.pipeline.mount(pp.host, pm, { scripted: true, onPick: (p) => { const d = toCard(p); if (d) last = d; pick(d, false); pp.say(p ? K.pair(p.title) : ''); } }));
        run.sheetsOut = pm.sheetsOut;
        run.steps = pm.sources.filter((x) => x.count > 0).map((x) => ({ title: x.title, count: x.count,
          line: [x.title[0] + ': ' + x.count + ' records collected, checked, labelled and shown in the sheet "' + x.sheetTitle[0] + '"', x.title[1] + ': ' + x.count + ' εγγραφές συλλέχθηκαν, ελέγχθηκαν, πήραν ετικέτα και φαίνονται στο φύλλο "' + x.sheetTitle[1] + '"'],
          card: toCard({ kind: 'source', title: x.title, sheetId: x.sheetId, count: x.count, sheetTitle: x.sheetTitle }) }));
        run.steps.forEach((st, k) => { const src = pm.sources.indexOf(pm.sources.filter((x) => x.count > 0)[k]); st.index = src; });
        const stepTo = run.go.step; run.go.step = (k) => stepTo(k < 0 ? -1 : run.steps[k].index);
        setPlay(true);
        pp.host.addEventListener('click', () => { if (last) pick(last, true); });
      });
      if (!cat || !cat.sheets) { nope(rs); return; }
      const live = cat.sheets.filter((s) => SC.viz.rosterData.isRoster(s));
      Promise.all(live.map((s) => K.tryJson('/api/stack/' + s.id).then((a) => [s.id, a]))).then((pairs) => {
        const sheets = {}; pairs.forEach(([id, a]) => { sheets[id] = a; ans[id] = a; });
        let h = null;
        const draw = () => {
          const rm = SC.viz.rosterData.buildModel({ catalogue: cat, sheets }, Date.now(), {});
          setFeeds(rm.rows.filter((r) => r.available).length + '/' + rm.rows.length);
          rs.rows(rm); rs.aria(rm);
          if (h && h.update) { h.update(rm); return; }
          rs.host.textContent = '';
          h = keep(SC.viz.roster.mount(rs.host, rm, { onPick: (r) => { if (!r) { pick(null, false); return; } pick({ title: r.title, sheetId: r.id, kindText: T('A feed that updates', 'Πηγή που ανανεώνεται'), lines: [[T('Status', 'Κατάσταση'), K.pair(r.statusLabel)], [T('Last fetched', 'Τελευταία λήψη'), r.available ? K.pair(r.ageText) : ''], [T('Records in the last answer', 'Εγγραφές στην τελευταία απάντηση'), r.available ? r.count : '']] }, true); } }));
        };
        draw();
        const t = setInterval(() => { try { const rm = SC.viz.rosterData.buildModel({ catalogue: cat, sheets }, Date.now(), {}); if (h && h.update) h.update(rm); } catch (e) { /* keep the last picture */ } }, 30000);
        stops.push(() => clearInterval(t));
      });
    });

    wl.append(K.el('p', 'wl-foot', T('Drawn from our own answers only; a feed that cannot be loaded is shown as not available. Vehicle positions are never shown.',
      'Μόνο από δικές μας απαντήσεις· μια πηγή που δεν φορτώνει δείχνεται ως μη διαθέσιμη. Οι θέσεις οχημάτων δεν εμφανίζονται ποτέ.')));
    return () => stops.forEach((f) => { try { f(); } catch (e) { /* already gone */ } });
  }

  SC.register('flow', {
    title: ['Data Flow', 'Data Flow'],
    render(root) {
      root.append(SC.head({
        title: T('Data Flow', 'Data Flow'),
        lede: T('How records travel from their sources into our data sheets, and which live feeds are answering now.',
          'Πώς ταξιδεύουν οι εγγραφές από τις πηγές τους στα φύλλα δεδομένων μας και ποιες ζωντανές πηγές απαντούν τώρα.'),
      }));
      const host = document.createElement('div'); root.append(host);
      let stop = null, gone = false;
      const load = (list) => list.reduce((p, s) => p.then(() => new Promise((ok, no) => {
        if (document.querySelector('script[data-wl="' + s + '"]')) return ok();
        const e = document.createElement('script'); e.src = s; e.dataset.wl = s; e.onload = ok; e.onerror = () => no(new Error(s)); document.head.append(e);
      })), Promise.resolve());
      load(LIBS).then(() => { if (!gone) stop = build(host); })
        .catch(() => { host.textContent = T('The Data Flow could not start. Reload the page to try again.', 'Το Data Flow δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
