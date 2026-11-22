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

    // the log
    const lp = K.panel(wl, T('Log: the same facts, line by line', 'Ημερολόγιο: τα ίδια στοιχεία, γραμμή γραμμή'), T('A reading aid that walks through the facts. It is not a live log.', 'Βοήθημα ανάγνωσης που περνά τα στοιχεία ένα ένα. Δεν είναι ζωντανό ημερολόγιο.'), 'wl-wide');
    lp.box.querySelector('.wl-list').remove();
    const log = K.el('ol', 'dw-log'); lp.host.append(log); lp.host.style.minHeight = '0';
    let at = -1, timer = 0, playing = false;
    const mark = (i) => { const li = log.children; if (!li.length) return; at = (i + li.length) % li.length; for (let k = 0; k < li.length; k++) li[k].classList.toggle('on', k === at); const el = li[at]; if (el && log.scrollHeight > log.clientHeight) log.scrollTop = Math.max(0, el.offsetTop - log.clientHeight / 2); };
    const setPlay = (on) => { playing = on && !still; clearInterval(timer); if (playing) timer = setInterval(() => { if (!document.hidden) mark(at + 1); }, 1800); pb.textContent = playing ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'); pb.setAttribute('aria-pressed', String(playing)); };
    const mk = (text, fn) => { const b = K.el('button', null, text); b.type = 'button'; b.onclick = fn; lp.tools.append(b); return b; };
    const pb = mk(T('Play', 'Αναπαραγωγή'), () => setPlay(!playing));
    mk(T('Previous line', 'Προηγούμενη γραμμή'), () => { setPlay(false); mark(at - 1); });
    mk(T('Next line', 'Επόμενη γραμμή'), () => { setPlay(false); mark(at + 1); });
    if (still) pb.hidden = true;
    stops.push(() => clearInterval(timer));
    const fillLog = (rows) => { rows.forEach((r) => { const li = K.el('li', null, K.pair(r)); li.dataset.n = String(log.children.length + 1).padStart(2, '0'); log.append(li); }); if (at < 0 && log.children.length) { mark(0); setPlay(true); } };

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
        pp.rows(pm); pp.aria(pm); pp.host.textContent = ''; fillLog(pm.textRows || []);
        const toCard = (p) => (!p ? null : p.kind === 'source'
          ? { title: p.title, sheetId: p.sheetId, kindText: T('A source of records', 'Πηγή εγγραφών'), lines: [[T('Records', 'Εγγραφές'), p.count], [T('Goes to the sheet', 'Πηγαίνει στο φύλλο'), K.pair(p.sheetTitle)]] }
          : { title: p.title, sheetId: p.id, kindText: T('A data sheet', 'Φύλλο δεδομένων'), lines: [[T('Records received', 'Εγγραφές που έλαβε'), p.records]] });
        let last = null;
        keep(SC.viz.pipeline.mount(pp.host, pm, { onPick: (p) => { const d = toCard(p); if (d) last = d; pick(d, false); pp.say(p ? K.pair(p.title) : ''); } }));
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
          fillLog((rm.textRows || []));
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
