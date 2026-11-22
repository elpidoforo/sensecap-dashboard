/*
  Data Flow (#/flow): how records travel from the sources to the data sheets, and which live feeds answer now. Both pictures are
  built only from the platform's own answers (/api/stack). Counts are counts of real records; nothing is invented. The pipeline is a
  how-it-works picture (labelled so); the roster shows real ages and counts. Vehicle positions never appear.
*/
(function () {
  'use strict';
  const T = SC.t;
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css');
  const LIBS = ['/site/viz/kit.js', '/site/vortexdata.js', '/site/viz/pipeline-data.js', '/site/viz/pipeline.js', '/site/viz/roster-data.js', '/site/viz/roster.js'];
  const SRC = { ev: ['EV charging points', 'Σημεία φόρτισης EV'], crossings: ['Crossings', 'Διαβάσεις'], flood: ['Flood reaches', 'Ποτάμια'], quakes: ['Earthquakes', 'Σεισμοί'] };
  const NOPE = ['This data could not be loaded right now.', 'Τα δεδομένα δεν φόρτωσαν αυτή τη στιγμή.'];

  function build(root) {
    const K = SC.viz.kit, VD = SC.vortexData, stops = [];
    const wl = K.el('div', 'dw'); root.append(wl);
    const keep = (h) => { if (h && h.destroy) stops.push(() => h.destroy()); return h; };
    const nope = (p) => K.note(p.host, T(NOPE[0], NOPE[1]));

    const pp = K.panel(wl,
      T('How records travel', 'Πώς ταξιδεύουν οι εγγραφές'),
      T('Records come in on the left, pass four plain steps, and land in a data sheet. The moving dots show how it works, not live traffic. Counts are real records.',
        'Οι εγγραφές μπαίνουν αριστερά, περνούν τέσσερα απλά βήματα και καταλήγουν σε ένα φύλλο δεδομένων. Οι κινούμενες τελείες δείχνουν πώς λειτουργεί, όχι ζωντανή κίνηση. Οι αριθμοί είναι πραγματικές εγγραφές.'),
      'wl-wide wl-tall');
    const rs = K.panel(wl,
      T('Feeds that update', 'Πηγές που ανανεώνονται'),
      T('One row per live, delayed or scheduled data sheet: how long ago it was last fetched, and how many records came in its last answer. Age shows freshness only, not quality.',
        'Μία γραμμή για κάθε ζωντανό, καθυστερημένο ή προγραμματισμένο φύλλο: πότε λήφθηκε τελευταία φορά και πόσες εγγραφές ήρθαν. Η ηλικία δείχνει μόνο φρεσκάδα, όχι ποιότητα.'),
      'wl-wide');

    K.tryJson('/api/stack').then((cat) => {
      const titleOf = (id) => { const s = cat && cat.sheets && cat.sheets.find((x) => x.id === id); return s && Array.isArray(s.title) ? s.title : [id, id]; };
      // pipeline: the four record sets that the Data Vortex also uses, one real record per count
      Promise.all(['ev', 'crossings', 'flood', 'quakes'].map((v) => K.tryJson('/api/stack/' + VD.SOURCE[v]).then((a) => (a ? VD.BUILD[v](a) : null)))).then((ms) => {
        const sources = [];
        ['ev', 'crossings', 'flood', 'quakes'].forEach((v, i) => {
          const m = ms[i]; if (!m || !m.items) return;
          sources.push({ id: v, title: SRC[v], count: m.items.length, sheetId: VD.SOURCE[v], sheetTitle: titleOf(VD.SOURCE[v]) });
        });
        if (!sources.length) { nope(pp); return; }
        const pm = SC.viz.pipelineData.build({ sources });
        pp.rows(pm); pp.aria(pm); pp.host.textContent = '';
        keep(SC.viz.pipeline.mount(pp.host, pm, { onPick: (p) => pp.say(p ? (p.title ? K.pair(p.title) : '') : '') }));
      });
      // roster: real ages and counts of the feeds that update
      if (!cat || !cat.sheets) { nope(rs); return; }
      const live = cat.sheets.filter((s) => SC.viz.rosterData.isRoster(s));
      Promise.all(live.map((s) => K.tryJson('/api/stack/' + s.id).then((a) => [s.id, a]))).then((pairs) => {
        const sheets = {}; pairs.forEach(([id, a]) => { sheets[id] = a; });
        let h = null, step = 0;
        const draw = () => {
          const rm = SC.viz.rosterData.buildModel({ catalogue: cat, sheets }, Date.now(), { step });
          rs.rows(rm); rs.aria(rm);
          if (h && h.update) { h.update(rm); return; }
          rs.host.textContent = '';
          h = keep(SC.viz.roster.mount(rs.host, rm, { onStep: (n) => { step = n; } }));
        };
        draw();
        const t = setInterval(() => { try { draw(); } catch (e) { /* keep last picture */ } }, 30000);
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
