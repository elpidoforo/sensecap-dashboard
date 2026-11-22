/*
  Data Wall (#/wall): the Kleanthis data on one wall, redrawn from three reference dashboards as small canvas widgets. Every widget is fed
  by the platform's own answers (/api/stack/...), every number is computed in tested code (public/site/viz/*-data.js). Nothing here is
  invented: a feed that cannot be loaded is shown as unavailable, never filled in. Only live feeds move as data.
*/
(function () {
  'use strict';
  const T = SC.t;
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css');
  const LIBS = ['/site/viz/kit.js', '/site/vortexdata.js', '/site/viz/sphere-data.js', '/site/viz/sphere.js', '/site/viz/tilegrid-data.js', '/site/viz/tilegrid.js', '/site/viz/wave-data.js', '/site/viz/wave.js',
    '/site/viz/heatmatrix-data.js', '/site/viz/heatmatrix.js', '/site/viz/pixelgrid-data.js', '/site/viz/pixelgrid.js', '/site/viz/nodelink-data.js', '/site/viz/nodelink.js', '/site/viz/counter-data.js', '/site/viz/counter.js', '/site/viz/hourstrip-data.js', '/site/viz/hourstrip.js', '/site/viz/scatter-data.js', '/site/viz/scatter.js',
    '/site/viz/daybars-data.js', '/site/viz/daybars.js', '/site/viz/classtape-data.js', '/site/viz/classtape.js'];
  const SETS = ['all', 'ev', 'crossings', 'flood', 'quakes'];
  const SETNAME = { all: ['All data sets', 'Όλα τα συνόλα'], ev: ['EV charging', 'Φόρτιση EV'], crossings: ['Crossings', 'Διαβάσεις'], flood: ['Flood reaches', 'Ποτάμια'], quakes: ['Earthquakes', 'Σεισμοί'] };

  function build(root) {
    const K = SC.viz.kit, VD = SC.vortexData, now = new Date(), stops = [];
    const wl = K.el('div', 'dw'); root.append(wl);
    const keep = (h) => { if (h && h.destroy) stops.push(() => h.destroy()); return h; };
    const safe = (fn, host) => { try { return fn(); } catch (e) { K.note(host, T('This picture could not be drawn. The facts are in the text list below.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί. Τα στοιχεία είναι στη λίστα παρακάτω.')); return null; } };

    // 1. the sphere: one disc per record
    const sp = K.panel(wl, T('Every record as a disc', 'Κάθε εγγραφή ως δίσκος'), T('One disc is one real record. Drag to turn the sphere, click a disc to read it. Lines join discs of the same group only.', 'Κάθε δίσκος είναι μία πραγματική εγγραφή. Σύρετε για να γυρίσει η σφαίρα, πατήστε ένα δίσκο για να το διαβάσετε. Η γραμμές συνδέουν μόνο δίσκους της ίδιας ομάδας.'), 'wl-wide wl-tall');
    let sph = null, spView = 'all'; const modelOf = (v) => (v === 'all' ? Promise.all(['ev', 'crossings', 'flood', 'quakes'].map((x) => K.tryJson('/api/stack/' + VD.SOURCE[x]).then((a) => (a ? VD.BUILD[x](a) : null)))).then(VD.allModel) : K.tryJson('/api/stack/' + VD.SOURCE[v]).then((a) => (a ? VD.BUILD[v](a) : null)));
    SETS.forEach((v) => { const b = K.el('button', null, K.pair(SETNAME[v])); b.type = 'button'; b.setAttribute('aria-pressed', String(v === spView)); b.onclick = () => { spView = v; sp.tools.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawSphere(); }; sp.tools.append(b); });
    function drawSphere() {
      modelOf(spView).then((m) => {
        if (!m || !m.items || !m.items.length) { K.note(sp.host, T('These records could not be loaded right now.', 'Οι εγγραφές δεν φόρτωσαν αυτή τη στιγμή.')); sp.rows(null); return; }
        const sd = SC.viz.sphereData.build(m, null); sp.rows(sd); sp.aria(sd);
        if (sph) { sph.setModel(m); return; }
        sp.host.textContent = ''; sph = keep(safe(() => SC.viz.sphere.mount(sp.host, m, { onPick: (it) => sp.say(it ? (it.t || '') + ' · ' + (Array.isArray(it.sub) ? K.pair(it.sub) : it.sub || '') : '') }), sp.host));
      });
    }
    drawSphere();

    // 2. freshness of every sheet
    const tg = K.panel(wl, T('How old is each data set?', 'Πόσο παλιά είναι κάθε σύνολο;'), T('One tile per data sheet. Sheets that never refresh are marked fixed by design and are never called old or fresh.', 'Ένα κλειδί ανά φύλλο δεδομένων. Τα φύλλα που δεν ανανεώνονται σημειώνονται ως σταθερά εξ σχεδίου και δεν λέγονται παλιά ή φρέσκα.'), 'dw-6');
    const nl = K.panel(wl, T('Where our data comes from', 'Από πού πέρνουμε τα δεδομένα'), T('Publishers on the left, the sheets built from them on the right. A moving line is a live feed.', 'Οι εκδότες αριστερά, τα φύλλα που χτίζονται από αυτούς δεξιά. Μια κινούμενη γραμμή είναι ζωντανή ροή.'), 'dw-6');
    K.tryJson('/api/stack').then((cat) => {
      if (!cat || !cat.sheets) { K.note(tg.host, T('The catalogue could not be loaded right now.', 'Ο κατάλογος δεν φόρτωσε αυτή τη στιγμή.')); K.note(nl.host, T('The catalogue could not be loaded right now.', 'Ο κατάλογος δεν φόρτωσε αυτή τη στιγμή.')); return; }
      Promise.all(cat.sheets.map((s) => K.tryJson('/api/stack/' + s.id).then((a) => [s.id, a]))).then((pairs) => {
        const det = {}; pairs.forEach(([id, a]) => { det[id] = a; });
        const tm = SC.viz.tilegridData.build(cat, det, now); tg.rows(tm); tg.aria(tm); tg.host.textContent = '';
        keep(safe(() => SC.viz.tilegrid.mount(tg.host, tm, { onPick: (t) => tg.say(t ? K.pair(t.title) + ' · ' + K.pair(t.statusLabel) + (t.ageText ? ' · ' + K.pair(t.ageText) : '') : '') }), tg.host));
        const nm = SC.viz.nodelinkData.build(cat, det); nl.rows(nm); nl.aria(nm); nl.host.textContent = '';
        keep(safe(() => SC.viz.nodelink.mount(nl.host, nm, { onPick: (p) => nl.say(p ? p.type + ': ' + p.id : '') }), nl.host));
      });
    });

    // 3. permits: change against a year earlier, and years by district
    const wv = K.panel(wl, T('Building permits: more or fewer than a year before', 'Άδειες οικοδομής: περισσότερες ή λιγότερες από τον προηγούμενο χρόνο'), T('Each month against the same month a year earlier, for one district at a time. Up means more permits; it does not say why.', 'Κάθε μήνας σε σχέση με τον ίδιο μήνα του προηγούμενου έτους, μία επαρχία τη φορά. Πάνω σημαίνει περισσότερες άδειες, όχι γιατί.'), 'wl-wide');
    const hm = K.panel(wl, T('Permits by year and district', 'Άδειες ανά έτος και επαρχία'), T('Each row is coloured against its own best year, so districts are never compared with each other.', 'Κάθε γραμμή χρωματίζεται από το δικό της καλύτερο έτος, άρα οι επαρχίες δεν συγκρίνονται μεταξύ τους.'), 'dw-6');
    const pg = K.panel(wl, T('Built-up ground in the city centres', 'Δομημένο έδαφος στα κέντρα των πόλεων'), T('Pixels of the ground under buildings, one square per city, on one shared scale. Not a comparison of cities.', 'Πίξελ του εδάφους που καλύπτει κτίρια, ένα τετράγωνο ανά πόλη, σε μία κοινή κλίμακα. Όχι σύγκριση πόλεων.'), 'dw-6');
    const nope = (p) => K.note(p.host, T('This data could not be loaded right now.', 'Τα δεδομένα δεν φόρτωσαν αυτή τη στιγμή.'));
    K.tryJson('/api/stack/permits').then((pa) => {
      if (!pa) { nope(wv); nope(hm); return; }
      let wvh = null; const sel = K.el('select'); sel.setAttribute('aria-label', T('District', 'Επαρχία'));
      const drawWave = (code) => { const m = SC.viz.waveData.build(pa, code ? { district: code } : {}); if (!wvh) { (m.choices || []).forEach((c) => { const o = K.el('option', null, K.pair(c.name)); o.value = c.code; sel.append(o); }); wv.tools.append(sel); } wv.rows(m); wv.aria(m); if (wvh) wvh.destroy(); wv.host.textContent = ''; wvh = safe(() => SC.viz.wave.mount(wv.host, m, { onPick: (p) => wv.say(p ? (p.label ? K.pair(p.label) : p.month) + ': ' + (p.change == null ? '–' : p.change) : '') }), wv.host); };
      sel.onchange = () => drawWave(sel.value); drawWave(null); stops.push(() => wvh && wvh.destroy());
      const hmm = SC.viz.heatmatrixData.build(pa); hm.rows(hmm); hm.aria(hmm); hm.host.textContent = '';
      keep(safe(() => SC.viz.heatmatrix.mount(hm.host, hmm, { onPick: (c) => hm.say(c ? c.districtName ? K.pair(c.districtName) + ' ' + c.year + ': ' + (c.value == null ? '–' : c.value) : '' : '') }), hm.host));
    });
    K.tryJson('/api/stack/buildings').then((ba) => {
      if (!ba) { nope(pg); return; }
      const pm = SC.viz.pixelgridData.build(ba); pg.rows(pm); pg.aria(pm); pg.host.textContent = '';
      keep(safe(() => SC.viz.pixelgrid.mount(pg.host, pm, { onPick: (c) => pg.say(c ? JSON.stringify(c).slice(0, 120) : '') }), pg.host));
    });


    // 4. interactive items: counter, hour strip, dot cloud, day bars, class tape. Each reads one sheet and shows one place at a time.
    const pickOne = (p, choices, idOf, nameOf, label, onSet) => { const sel = K.el('select'); sel.setAttribute('aria-label', label); (choices || []).forEach((c) => { const o = K.el('option', null, K.pair(nameOf(c))); o.value = idOf(c); sel.append(o); }); sel.onchange = () => onSet(sel.value); p.tools.append(sel); return sel; };
    const btn = (p, text, fn) => { const b = K.el('button', null, text); b.type = 'button'; b.onclick = () => fn(b); p.tools.append(b); return b; };
    const item = (name, sheet, p, start) => K.tryJson('/api/stack/' + sheet).then((a) => { if (!a) { nope(p); return; } const D = SC.viz[name + 'Data'], m = D.build(a); p.rows(m.view || m); p.aria(m); if (m.empty && !(m.choices && m.choices.length)) { K.note(p.host, K.pair(m.empty)); return; } p.host.textContent = ''; safe(() => start(m, D, a), p.host); });

    const ct = K.panel(wl, T('Building permits in one month', 'Άδειες οικοδομής σε έναν μήνα'), T('Drag along the small line to move through the last 36 months. One district at a time.', 'Σύρετε πάνω στη μικρή γραμμή για να περάσετε τους τελευταίους 36 μήνες. Μία επαρχία τη φορά.'), 'dw-5');
    item('counter', 'permits', ct, (m) => { const h = keep(SC.viz.counter.mount(ct.host, m, { onPick: (r) => ct.say(r ? K.pair(r.districtName) + ' · ' + K.pair(r.label) + ': ' + (r.value == null ? '–' : r.value) : '') }));
      pickOne(ct, m.choices, (c) => c.code, (c) => c.name, T('District', 'Επαρχία'), (v) => { h.set({ district: v }); ct.rows(m.views[v]); }); });

    const hs = K.panel(wl, T('One day of air, hour by hour', 'Μία μέρα αέρα, ώρα με την ώρα'), T('Press play to replay the day, or click an hour. A replay of a past day, not live. One station at a time.', 'Πατήστε αναπαραγωγή για να ξαναδείτε τη μέρα ή πατήστε μια ώρα. Επανάληψη παλιάς μέρας, όχι ζωντανά. Ένας σταθμός τη φορά.'), 'dw-7');
    item('hourstrip', 'air-day', hs, (m) => { let h = null; const say = (r) => hs.say(r ? K.pair(r.stationName) + ' · ' + K.pair(r.label) : '');
      h = keep(SC.viz.hourstrip.mount(hs.host, m, { autoplay: false, onHour: say, onChange: (v) => hs.rows(v), onState: (st) => { pb.textContent = st.playing ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'); pb.setAttribute('aria-pressed', String(!!st.playing)); } }));
      const pb = btn(hs, T('Play', 'Αναπαραγωγή'), () => h.toggle());
      pickOne(hs, m.choices, (c) => c.id, (c) => c.name, T('Station', 'Σταθμός'), (v) => h.set({ station: v }));
      pickOne(hs, m.pollutants, (c) => c.k, (c) => c.name, T('Pollutant', 'Ρύπος'), (v) => h.set({ pollutant: v })); });

    const sc = K.panel(wl, T('Earthquakes: each dot is one event', 'Σεισμοί: κάθε τελεία είναι ένα γεγονός'), T('Click a dot to read it. Switch between magnitude and depth. A list of past events, not a forecast.', 'Πατήστε μια τελεία για να τη διαβάσετε. Αλλάξτε μεταξύ μεγέθους και βάθους. Λίστα παλιών γεγονότων, όχι πρόβλεψη.'), 'dw-6');
    item('scatter', 'earthquakes', sc, (m) => { keep(SC.viz.scatter.mount(sc.host, m, { onPick: (r) => sc.say(r ? K.pair(r.label) : '') })); });

    const db = K.panel(wl, T('Haze over one site, day by day', 'Αιθαλομίχλη πάνω από ένα σημείο, μέρα με τη μέρα'), T('One bar per day of July 2022. It describes the whole column of air, not the air at ground level.', 'Μία ράβδος για κάθε μέρα του Ιουλίου 2022. Περιγράφει όλη τη στήλη του αέρα, όχι τον αέρα στο έδαφος.'), 'dw-6');
    item('daybars', 'aerosol-sites', db, (m, D, a) => { const h = keep(SC.viz.daybars.mount(db.host, m, { chooser: false, onPick: (r) => db.say(r ? K.pair(r.label) : '') }));
      pickOne(db, m.choices, (c) => c.id, (c) => c.name, T('Site', 'Σημείο'), (v) => { db.rows(h.set({ site: v })); }); });

    const tp = K.panel(wl, T('Farm drought classes through 2022', 'Κατηγορίες γεωργικής ξηρασίας μέσα στο 2022'), T('One cell per ten days, for one place. Classes are kinds, not a scale: no cell is taller than another.', 'Ένα κελί ανά δέκα μέρες, για ένα μέρος. Οι κατηγορίες είναι είδη, όχι κλίμακα: κανένα κελί δεν είναι ψηλότερο.'), 'wl-wide');
    item('classtape', 'drought', tp, (m, D, a) => { const h = keep(SC.viz.classtape.mount(tp.host, m, { chooser: false, onPick: (r) => tp.say(r ? r.period + ' – ' + r.periodEnd + ': ' + K.pair(r.className) : '') }));
      pickOne(tp, m.choices, (c) => c.id, (c) => c.name, T('Place', 'Μέρος'), (v) => { tp.rows(h.set({ place: v })); }); });

    wl.append(K.el('p', 'wl-foot', T('Sources and licences are on each data sheet. Drawn from our own answers only; a feed that cannot be loaded is shown as not available.', 'Οι πηγές και οι άδειες είναι σε κάθε φύλλο δεδομένων. Μόνο από δικά μας δεδομένα. Ένα δεδομένο που δεν φορτώνει δείχνεται ως μη διαθέσιμο.')));
    return () => stops.forEach((f) => { try { f(); } catch (e) { /* already gone */ } });
  }

  SC.register('wall', {
    title: ['Data Wall', 'Data Wall'],
    render(root) {
      root.append(SC.head({ title: T('Data Wall', 'Data Wall'), lede: T('All our data on one wall: every record as a disc, how old each data set is, where it comes from, and what the building permits and built-up ground show.', 'Όλα τα δεδομένα μας σε έναν τοίχο: κάθε εγγραφή ως δίσκος, πόσο παλιά είναι κάθε σύνολο, από πού πάρθηκε και τι δείχνουν οι άδειες οικοδομής και το δομημένο έδαφος.') }));
      const host = document.createElement('div'); root.append(host);
      let stop = null, gone = false;
      const load = (list) => list.reduce((p, s) => p.then(() => new Promise((ok, no) => { if (document.querySelector('script[data-wl="' + s + '"]')) return ok(); const e = document.createElement('script'); e.src = s; e.dataset.wl = s; e.onload = ok; e.onerror = () => no(new Error(s)); document.head.append(e); })), Promise.resolve());
      load(LIBS).then(() => { if (!gone) stop = build(host); }).catch(() => { host.textContent = T('The Data Wall could not start. Reload the page to try again.', 'Το Data Wall δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
