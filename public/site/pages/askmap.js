/*
  Ask the map. Route: #/askmap
  A small question builder for the island picture:
    1. WHAT  official weather stations coloured by temperature or humidity now (GET /api/cydom), or bathing sites coloured by the label
             they were given for one season (the reviewed history, see toolkit-b3-lib.js bathing()).
    2. WHERE everything, inside one district (shapes of island.js, our own rule, not an official boundary), or within N km of a school.
    3. COMPARE (optional) stations: now against the saved reading closest to 1, 3, 6 or 24 hours ago (the Data archive,
             GET /api/cydom/history?station=&hours=&keys=); bathing sites: a second season, both labels side by side.
  The table under the map lists exactly what is drawn and "Download CSV" saves that table (built in the browser; a cell that starts
  with = + - @ gets a leading apostrophe so a spreadsheet never runs it).
  School sites are drawn (from island.js). Vehicles are never read and never drawn. No score, no ranking: the table is in name order.
  A station with no value for the chosen figure, or no saved earlier reading, says so; nothing is filled in.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/toolkit-b3.css');
  const lib = () => (SC.tk3 ? Promise.resolve(SC.tk3) : (SC.tk3p = SC.tk3p || new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/site/pages/toolkit-b3-lib.js'; s.onload = () => (SC.tk3 ? ok(SC.tk3) : no(new Error('helpers'))); s.onerror = () => { SC.tk3p = null; no(new Error(T('A part of this page could not be loaded.', 'Ένα μέρος της σελίδας δεν φορτώθηκε.'))); }; document.head.append(s); })));
  const HOUR = 3600000;
  const FIG = {
    temp: { n: ['Official stations: air temperature now', 'Επίσημοι σταθμοί: θερμοκρασία αέρα τώρα'], short: ['air temperature', 'θερμοκρασία αέρα'], unit: '°C', key: 'temp' },
    hum: { n: ['Official stations: humidity now', 'Επίσημοι σταθμοί: υγρασία τώρα'], short: ['humidity', 'υγρασία'], unit: '%', key: 'hum' },
    bath: { n: ['Bathing sites: label of one season', 'Σημεία κολύμβησης: χαρακτηρισμός μιας περιόδου'], short: ['bathing-water label', 'χαρακτηρισμός νερών κολύμβησης'], unit: '' },
  };
  const DORDER = ['nicosia', 'larnaca', 'limassol', 'paphos', 'famagusta', 'kyrenia'];
  const ramp = (f) => { const a = [76, 203, 234], b = [255, 200, 87], c = a.map((x, i) => Math.round(x + (b[i] - x) * f)); return 'rgb(' + c.join(',') + ')'; };

  function render(root) {
    let alive = true, K = null, seq = 0;
    const S = { fig: 'temp', rule: 'all', district: 'larnaca', school: 'larnaka', km: 20, ago: 0, yearA: null, yearB: 0 };
    const D = { cy: null, cyErr: null, bath: null, bathErr: null, then: new Map() };
    root.append(SC.head({
      title: T('Ask the map', 'Ρώτα τον χάρτη'),
      lede: T('Build a small question in three steps: what to show, where, and whether to compare two moments. The map answers with dots, the table under it lists the same things, and you can take the table with you.',
        'Φτιάξε μια μικρή ερώτηση σε τρία βήματα: τι να δείξουμε, πού, και αν θα συγκρίνουμε δύο στιγμές. Ο χάρτης απαντά με κουκκίδες, ο πίνακας από κάτω γράφει τα ίδια πράγματα, και μπορείς να πάρεις τον πίνακα μαζί σου.'),
      help: ['The map can show two kinds of things that really exist in our data: the official weather stations of the Met Office with their newest reading, and the official bathing sites with the label they were given for a season. You choose where to look: the whole island, one district, or a circle around a school. Then you can compare: a station now and some hours ago, or a bathing site in two seasons. The schools are drawn so you can find your way. Buses and cars are never on this map.',
        'Ο χάρτης μπορεί να δείξει δύο είδη πραγμάτων που υπάρχουν πραγματικά στα δεδομένα μας: τους επίσημους μετεωρολογικούς σταθμούς της Υπηρεσίας με την πιο πρόσφατη μέτρησή τους, και τα επίσημα σημεία κολύμβησης με τον χαρακτηρισμό που πήραν για μια περίοδο. Διαλέγεις πού θα κοιτάξεις: όλο το νησί, μία επαρχία ή έναν κύκλο γύρω από ένα σχολείο. Μετά μπορείς να συγκρίνεις: έναν σταθμό τώρα και πριν από μερικές ώρες, ή ένα σημείο κολύμβησης σε δύο περιόδους. Τα σχολεία σχεδιάζονται για να προσανατολίζεσαι. Λεωφορεία και αυτοκίνητα δεν μπαίνουν ποτέ σε αυτόν τον χάρτη.'],
    }));
    const host = h('div', { class: 't3' }, h('p', { class: 't3-empty', role: 'status' }, T('Loading', 'Φόρτωση')));
    root.append(host);
    const mapBox = h('div', { class: 't3-mapbox' }), ans = h('p', { class: 't3-say', 'data-k': 'answer', role: 'status' }), legend = h('div', { class: 't3-legend' });
    const tableBox = h('div', { class: 't3-out' }), notes = h('div');
    let lastRows = null;

    const schools = () => (window.ISLAND && ISLAND.schools) || [];
    const school = () => schools().find((s) => s.id === S.school) || schools()[0];
    // every thing that can be drawn for the chosen figure
    function things() {
      if (S.fig === 'bath') {
        if (!D.bath) return [];
        const a = D.bath.byYear.get(S.yearA) || new Map(), b = S.yearB ? D.bath.byYear.get(S.yearB) || new Map() : null;
        const ids = new Set([...a.keys(), ...(b ? b.keys() : [])]);
        return [...ids].map((id) => { const s = D.bath.sites.get(id) || { id, name: id, lat: null, lng: null, district: null }; return { id, name: s.name, lat: s.lat, lng: s.lng, district: s.district, a: a.get(id) || null, b: b ? b.get(id) || null : undefined }; });
      }
      return ((D.cy && D.cy.points) || []).filter((p) => p && p.id && p.lat != null && p.lng != null).map((p) => {
        const v = p[FIG[S.fig].key], th = S.ago ? D.then.get(p.id + '|' + S.ago) : undefined;
        return { id: p.id, name: p.name || p.id, lat: Number(p.lat), lng: Number(p.lng), district: K.districtOf(Number(p.lng), Number(p.lat)), v: typeof v === 'number' && isFinite(v) ? v : null, t: Date.parse(p.time) || null, then: th };
      });
    }
    function chosen(list) {
      const sc = school();
      return list.map((x) => ({ ...x, km: sc && x.lat != null ? K.km(sc.lat, sc.lng, x.lat, x.lng) : null }))
        .filter((x) => (S.rule === 'all' ? true : S.rule === 'district' ? x.district === S.district : x.km != null && x.km <= S.km))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), SC.lang));
    }

    // the saved reading of each chosen station closest to "ago" hours back (within 40 minutes), from the Data archive
    async function loadThen(list) {
      const key = FIG[S.fig].key, want = Date.now() - S.ago * HOUR, todo = list.filter((x) => !D.then.has(x.id + '|' + S.ago)).slice(0, 60);
      for (let i = 0; i < todo.length; i += 4) {
        await Promise.all(todo.slice(i, i + 4).map(async (x) => {
          const k = x.id + '|' + S.ago;
          try {
            const r = await SC.api('/api/cydom/history?station=' + encodeURIComponent(x.id) + '&hours=' + (S.ago + 1) + '&keys=temp,hum');
            const out = {};
            ['temp', 'hum'].forEach((kk, j) => { let best = null; (r.rows || []).forEach((row) => { const v = row[j + 1]; if (v == null || !isFinite(v)) return; const d = Math.abs(row[0] - want); if (d <= 40 * 60000 && (!best || d < best.d)) best = { d, t: row[0], v }; }); out[kk] = best ? { t: best.t, v: best.v } : null; });
            D.then.set(k, out);
          } catch (e) { D.then.set(k, { error: true }); setTimeout(() => D.then.delete(k), 20000); }
        }));
      }
      void key;
    }

    async function draw() {
      const my = ++seq, fig = FIG[S.fig], isBath = S.fig === 'bath';
      const err = isBath ? D.bathErr : D.cyErr;
      notes.replaceChildren(); legend.replaceChildren(); lastRows = null;
      if (err || (isBath ? !D.bath : !D.cy)) {
        mapBox.replaceChildren(); tableBox.replaceChildren();
        ans.textContent = isBath ? ((err && err.message) || T('The bathing-water history is not available right now, so nothing is shown.', 'Το ιστορικό των νερών κολύμβησης δεν είναι διαθέσιμο τώρα, γι’ αυτό δεν εμφανίζεται τίποτα.')) : T('The official stations could not be read right now, so nothing is shown. Try again in a few minutes.', 'Οι επίσημοι σταθμοί δεν διαβάστηκαν αυτή τη στιγμή, γι’ αυτό δεν εμφανίζεται τίποτα. Δοκίμασε ξανά σε λίγα λεπτά.');
        ans.setAttribute('data-state', 'error');
        return;
      }
      let list = chosen(things());
      if (!isBath && S.ago && list.some((x) => x.then === undefined)) {
        ans.textContent = T('Reading the saved readings', 'Διαβάζω τις αποθηκευμένες μετρήσεις');
        await loadThen(list);
        if (!alive || my !== seq) return;
        list = chosen(things());
      }
      const sc = school();
      const where = S.rule === 'all' ? T('on the whole island', 'σε όλο το νησί') : S.rule === 'district' ? T('in ' + K.dName(S.district), 'στην ' + K.dName(S.district)) : T('within ' + S.km + ' km of ' + sc.name, 'σε απόσταση έως ' + S.km + ' km από το ' + sc.name);
      // the map
      const isl = K.island({ label: T('Map of Cyprus with the things your question selects. The table below lists the same things.', 'Χάρτης της Κύπρου με όσα επιλέγει η ερώτησή σου. Ο πίνακας από κάτω γράφει τα ίδια πράγματα.') });
      if (isl) {
        if (S.rule === 'district' && isl.paths[S.district]) isl.paths[S.district].setAttribute('class', 't3-d pick');
        if (S.rule === 'near' && sc) { const p = ISLAND.project(sc.lng, sc.lat); isl.layer.append(sv('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: ((S.km / 111.19) * ISLAND.sx).toFixed(1), class: 't3-ring' })); }
        const vals = list.map((x) => x.v).filter((v) => v != null), lo = Math.min(...vals), hi = Math.max(...vals);
        const col = (x) => (isBath ? (x.a ? K.labelColour(x.a) : '#56627a') : x.v == null ? '#56627a' : ramp(hi > lo ? (x.v - lo) / (hi - lo) : 0.5));
        const pickedIds = new Set(list.map((x) => x.id));
        things().forEach((x) => { if (x.lat == null || pickedIds.has(x.id)) return; const q = ISLAND.project(x.lng, x.lat); isl.layer.append(sv('circle', { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 3, class: 't3-dim' })); });
        list.forEach((x) => {
          if (x.lat == null) return;
          const q = ISLAND.project(x.lng, x.lat);
          const tip = x.name + ': ' + (isBath ? S.yearA + ' ' + (x.a ? K.labelName(x.a) : T('not reported', 'δεν αναφέρθηκε')) : x.v == null ? T('no value', 'καμία τιμή') : K.n(x.v, 1) + ' ' + fig.unit);
          isl.layer.append(sv(isBath ? 'circle' : 'rect', isBath ? { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 5, class: 't3-pt', fill: col(x), 'data-id': x.id } : { x: (q[0] - 6).toFixed(1), y: (q[1] - 6).toFixed(1), width: 12, height: 12, rx: 2, class: 't3-pt', fill: col(x), 'data-id': x.id }, sv('title', null, tip)));
        });
        K.schoolMarks(isl.layer, S.rule === 'near' ? S.school : null);
        mapBox.replaceChildren(isl.svg);
        if (isBath) legend.append(...K.LABEL_ORDER.map((l) => h('span', null, h('i', { style: { background: K.labelColour(l) } }), K.labelName(l))));
        else if (vals.length) legend.append(h('span', null, h('i', { class: 'k-ramp' }), T('from ' + K.n(lo, 1) + ' ' + fig.unit + ' (blue) to ' + K.n(hi, 1) + ' ' + fig.unit + ' (yellow): only the stations shown', 'από ' + K.n(lo, 1) + ' ' + fig.unit + ' (μπλε) έως ' + K.n(hi, 1) + ' ' + fig.unit + ' (κίτρινο): μόνο οι σταθμοί που φαίνονται')));
        legend.append(h('span', null, h('i', { class: 'k-school' }), T('school', 'σχολείο')), h('span', null, h('i', { class: 'k-dim' }), T('not selected by your question', 'δεν επιλέγεται από την ερώτησή σου')));
      } else mapBox.replaceChildren(h('p', { class: 't3-warn' }, T('The island picture could not be loaded. The table still answers the question.', 'Η εικόνα του νησιού δεν φορτώθηκε. Ο πίνακας απαντά στην ερώτηση.')));

      // the answer in words, the table and its CSV
      const head = [], rows = [];
      const kmCol = S.rule === 'near';
      const fmtT = (t) => (t ? SC.dateTime(t) : '–');
      if (isBath) {
        head.push(T('Bathing site', 'Σημείο κολύμβησης'), T('District (our rule)', 'Επαρχία (δικός μας κανόνας)'));
        if (kmCol) head.push(T('km from the school', 'km από το σχολείο'));
        head.push(T('Label ' + S.yearA, 'Χαρακτηρισμός ' + S.yearA));
        if (S.yearB) head.push(T('Label ' + S.yearB, 'Χαρακτηρισμός ' + S.yearB), T('Same label in both?', 'Ίδιος χαρακτηρισμός και στις δύο;'));
        head.push(T('Source', 'Πηγή'));
        const nr = T('not reported', 'δεν αναφέρθηκε');
        list.forEach((x) => { const r = [x.name, x.district ? K.dName(x.district) : T('no place in the newest list', 'χωρίς θέση στη νεότερη λίστα')]; if (kmCol) r.push(x.km == null ? '–' : K.n(x.km, 1)); r.push(x.a ? K.labelName(x.a) : nr); if (S.yearB) r.push(x.b ? K.labelName(x.b) : nr, !x.a || !x.b ? T('cannot say: missing in one season', 'δεν μπορούμε να πούμε: λείπει σε μία περίοδο') : x.a === x.b ? T('same', 'ίδιος') : T('different', 'διαφορετικός')); r.push('EEA, ' + D.bath.meta.release); rows.push(r); });
      } else {
        head.push(T('Station', 'Σταθμός'), T('District (our rule)', 'Επαρχία (δικός μας κανόνας)'));
        if (kmCol) head.push(T('km from the school', 'km από το σχολείο'));
        head.push(T(fig.short[0] + ' now (' + fig.unit + ')', fig.short[1] + ' τώρα (' + fig.unit + ')'), T('Time of the reading', 'Ώρα της μέτρησης'));
        if (S.ago) head.push(T('about ' + S.ago + ' h ago (' + fig.unit + ')', 'πριν από περίπου ' + S.ago + ' ώ. (' + fig.unit + ')'), T('Time of that reading', 'Ώρα εκείνης της μέτρησης'), T('Change (' + fig.unit + ')', 'Αλλαγή (' + fig.unit + ')'));
        head.push(T('Source', 'Πηγή'));
        list.forEach((x) => {
          const r = [x.name, x.district ? K.dName(x.district) : T('outside the drawn districts', 'έξω από τις σχεδιασμένες επαρχίες')];
          if (kmCol) r.push(x.km == null ? '–' : K.n(x.km, 1));
          r.push(x.v == null ? T('no value', 'καμία τιμή') : K.n(x.v, 1), fmtT(x.t));
          if (S.ago) { const th = x.then && !x.then.error ? x.then[fig.key] : null; r.push(th ? K.n(th.v, 1) : x.then && x.then.error ? T('could not be read', 'δεν διαβάστηκε') : T('not saved', 'δεν αποθηκεύτηκε'), th ? fmtT(th.t) : '–', th && x.v != null ? (x.v - th.v > 0 ? '+' : '') + K.n(x.v - th.v, 1) : '–'); }
          r.push(T('Cyprus Department of Meteorology', 'Τμήμα Μετεωρολογίας Κύπρου'));
          rows.push(r);
        });
      }
      const kind = isBath ? T('bathing sites', 'σημεία κολύμβησης') : T('official stations', 'επίσημοι σταθμοί');
      ans.setAttribute('data-state', list.length ? 'ok' : 'empty');
      if (!list.length) {
        ans.textContent = T('Nothing matches: no ' + kind + ' ' + where + (isBath ? ' in the ' + S.yearA + ' season' : '') + '. That is an answer too. Try a bigger circle or another district.', 'Τίποτα δεν ταιριάζει: κανένα αποτέλεσμα (' + kind + ') ' + where + (isBath ? ' για την περίοδο ' + S.yearA : '') + '. Κι αυτό είναι απάντηση. Δοκίμασε μεγαλύτερο κύκλο ή άλλη επαρχία.');
        tableBox.replaceChildren();
      } else {
        let extra = '';
        if (isBath && S.yearB) { const both = list.filter((x) => x.a && x.b), diff = both.filter((x) => x.a !== x.b).length; extra = T(' ' + both.length + ' of them were reported in both ' + S.yearA + ' and ' + S.yearB + '; ' + diff + ' of those have a different label.', ' ' + both.length + ' από αυτά αναφέρθηκαν και το ' + S.yearA + ' και το ' + S.yearB + '· ' + diff + ' από εκείνα έχουν διαφορετικό χαρακτηρισμό.'); }
        if (!isBath && S.ago) { const got = list.filter((x) => x.then && !x.then.error && x.then[fig.key]).length; extra = T(' ' + got + ' of them have a saved reading from about ' + S.ago + ' h ago.', ' ' + got + ' από αυτούς έχουν αποθηκευμένη μέτρηση από πριν περίπου ' + S.ago + ' ώ.'); }
        ans.textContent = T(list.length + ' ' + kind + ' ' + where + (isBath ? ', season ' + S.yearA : ', ' + fig.short[0] + ' now') + '.', list.length + ' ' + kind + ' ' + where + (isBath ? ', περίοδος ' + S.yearA : ', ' + fig.short[1] + ' τώρα') + '.') + extra;
        lastRows = [head].concat(rows);
        tableBox.replaceChildren(
          h('div', { class: 't3-scroll', tabindex: '0', role: 'group', 'aria-label': T('Table of what the map shows', 'Πίνακας με όσα δείχνει ο χάρτης') },
            h('table', { class: 't3-table', 'data-k': 'table' }, h('thead', null, h('tr', null, head.map((x) => h('th', { scope: 'col' }, x)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', null, c)))))))),
          h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'nm-btn', 'data-k': 'csv', onclick: () => { if (!lastRows) return; K.download('ask-the-map-' + S.fig + '-' + new Date().toISOString().slice(0, 10) + '.csv', K.toCsv(lastRows)); SC.toast(T('Saved the table as a CSV file.', 'Ο πίνακας αποθηκεύτηκε ως αρχείο CSV.')); } }, T('Download CSV', 'Λήψη CSV')),
            h('span', { class: 't3-note' }, T('In name order. This is a list, not a ranking.', 'Σε αλφαβητική σειρά. Είναι λίστα, όχι κατάταξη.'))));
      }
      const nl = [];
      if (isBath) nl.push(T('Bathing labels are history: one label for a whole past season, exactly as reported, no score. They do not describe today’s water.', 'Οι χαρακτηρισμοί κολύμβησης είναι ιστορία: ένας χαρακτηρισμός για μια ολόκληρη περασμένη περίοδο, ακριβώς όπως αναφέρθηκε, χωρίς βαθμολογία. Δεν περιγράφουν το σημερινό νερό.'));
      else nl.push(T('Station readings are the newest ones the Met Office published; the time of each is in the table. A station far from you does not describe your street.', 'Οι μετρήσεις των σταθμών είναι οι πιο πρόσφατες που δημοσίευσε η Υπηρεσία· η ώρα της καθεμιάς είναι στον πίνακα. Ένας σταθμός μακριά σου δεν περιγράφει τον δρόμο σου.'));
      if (!isBath && S.ago) nl.push(T('"About ' + S.ago + ' h ago" is the saved reading closest to that moment, at most 40 minutes away. If the archive has none, the cell says "not saved".', '"Πριν από περίπου ' + S.ago + ' ώ." είναι η αποθηκευμένη μέτρηση που βρίσκεται πιο κοντά σε εκείνη τη στιγμή, το πολύ 40 λεπτά μακριά. Αν το αρχείο δεν έχει καμία, το κελί γράφει "δεν αποθηκεύτηκε".'));
      nl.push(T('Districts are our own rule on a simplified outline of the island, not official boundaries. Distances are straight lines.', 'Οι επαρχίες είναι δικός μας κανόνας πάνω σε απλοποιημένο περίγραμμα του νησιού, όχι επίσημα όρια. Οι αποστάσεις είναι ευθείες γραμμές.'));
      nl.push(T('Schools are shown as places. Buses and cars are never on this map.', 'Τα σχολεία εμφανίζονται ως τοποθεσίες. Λεωφορεία και αυτοκίνητα δεν μπαίνουν ποτέ σε αυτόν τον χάρτη.'));
      notes.replaceChildren(h('ul', { class: 't3-list', 'data-k': 'notes' }, nl.map((x) => h('li', null, x))));
    }

    function controls() {
      const opt = (v, label, sel) => h('option', { value: v, selected: sel ? '' : null }, label);
      const field = (id, label, ctl, hidden) => h('div', { class: 't3-field', hidden: hidden ? '' : null, 'data-f': id }, h('label', { for: id }, label), ctl);
      const sFig = h('select', { class: 'nm-input', id: 'am-fig', onchange: () => { S.fig = sFig.value; vis(); draw(); } }, Object.keys(FIG).map((k) => opt(k, T(FIG[k].n[0], FIG[k].n[1]), k === S.fig)));
      const years = D.bath ? D.bath.years : [];
      const sYA = h('select', { class: 'nm-input', id: 'am-ya', onchange: () => { S.yearA = Number(sYA.value); draw(); } }, years.slice().reverse().map((y) => opt(y, String(y), y === S.yearA)));
      const sRule = h('select', { class: 'nm-input', id: 'am-rule', onchange: () => { S.rule = sRule.value; vis(); draw(); } }, opt('all', T('The whole island', 'Όλο το νησί'), true), opt('district', T('Inside one district', 'Μέσα σε μία επαρχία')), opt('near', T('Near a school', 'Κοντά σε ένα σχολείο')));
      const sDist = h('select', { class: 'nm-input', id: 'am-dist', onchange: () => { S.district = sDist.value; draw(); } }, DORDER.map((d) => opt(d, K.dName(d), d === S.district)));
      const sSch = h('select', { class: 'nm-input', id: 'am-sch', onchange: () => { S.school = sSch.value; draw(); } }, schools().map((s) => opt(s.id, s.name, s.id === S.school)));
      const kmOut = h('output', { for: 'am-km', class: 't3-out-n' }, S.km + ' km');
      const rKm = h('input', { type: 'range', class: 't3-range', id: 'am-km', min: 2, max: 80, step: 1, value: S.km, 'aria-valuetext': S.km + ' km', oninput: () => { S.km = Number(rKm.value); kmOut.textContent = S.km + ' km'; rKm.setAttribute('aria-valuetext', S.km + ' km'); draw(); } });
      const sAgo = h('select', { class: 'nm-input', id: 'am-ago', onchange: () => { S.ago = Number(sAgo.value); draw(); } }, opt(0, T('No comparison', 'Χωρίς σύγκριση'), true), [1, 3, 6, 24].map((x) => opt(x, T('Now against about ' + x + ' h ago', 'Τώρα σε σχέση με πριν από περίπου ' + x + ' ώ.'))));
      const sYB = h('select', { class: 'nm-input', id: 'am-yb', onchange: () => { S.yearB = Number(sYB.value); draw(); } }, opt(0, T('No comparison', 'Χωρίς σύγκριση'), true), years.slice().reverse().map((y) => opt(y, T('Against season ' + y, 'Σε σχέση με την περίοδο ' + y))));
      const F = { ya: field('am-ya', T('Season', 'Περίοδος'), sYA), dist: field('am-dist', T('District', 'Επαρχία'), sDist), sch: field('am-sch', T('School', 'Σχολείο'), sSch), km: field('am-km', T('How far (straight line)', 'Πόσο μακριά (ευθεία γραμμή)'), h('div', { class: 't3-rangerow' }, rKm, kmOut)), ago: field('am-ago', T('Two moments', 'Δύο στιγμές'), sAgo), yb: field('am-yb', T('Two seasons', 'Δύο περίοδοι'), sYB) };
      function vis() { const b = S.fig === 'bath'; F.ya.hidden = !b; F.yb.hidden = !b; F.ago.hidden = b; F.dist.hidden = S.rule !== 'district'; F.sch.hidden = S.rule !== 'near'; F.km.hidden = S.rule !== 'near'; }
      vis();
      const step = (n, title, ...kids) => h('fieldset', { class: 't3-step' }, h('legend', null, h('i', null, String(n)), title), kids);
      return h('section', { class: 't3-panel t3-ask', 'aria-label': T('Your question', 'Η ερώτησή σου') },
        step(1, T('What', 'Τι'), field('am-fig', T('Show and colour by', 'Δείξε και χρωμάτισε με βάση'), sFig), F.ya),
        step(2, T('Where', 'Πού'), field('am-rule', T('Rule', 'Κανόνας'), sRule), F.dist, F.sch, F.km),
        step(3, T('Compare', 'Σύγκρινε'), F.ago, F.yb));
    }

    (async () => {
      try { K = await lib(); } catch (e) { host.replaceChildren(h('div', { class: 'err', role: 'alert' }, (e && e.message) || '')); return; }
      const [cy, bath] = await Promise.all([SC.cached('/api/cydom', 120000).catch((e) => { D.cyErr = e; return null; }), K.bathing().catch((e) => { D.bathErr = e; return null; })]);
      if (!alive) return;
      D.cy = cy; D.bath = bath;
      if (bath) S.yearA = bath.years[bath.years.length - 1];
      host.replaceChildren(controls(),
        h('section', { class: 't3-panel', 'aria-labelledby': 'am-ans' }, h('h2', { class: 't3-h', id: 'am-ans' }, T('The map’s answer', 'Η απάντηση του χάρτη')), ans, mapBox, legend),
        h('section', { class: 't3-panel', 'aria-labelledby': 'am-tab' }, h('h2', { class: 't3-h', id: 'am-tab' }, T('What is shown, as a table', 'Τι φαίνεται, σε πίνακα')), tableBox, notes));
      draw();
    })();
    return () => { alive = false; };
  }

  SC.register('askmap', { title: ['Ask the map', 'Ρώτα τον χάρτη'], render });
})();
