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
    '/site/viz/daybars-data.js', '/site/viz/daybars.js', '/site/viz/classtape-data.js', '/site/viz/classtape.js', '/site/viz/people-data.js', '/site/viz/people.js', '/site/viz/station-data.js', '/site/viz/station.js', '/site/viz/depthline-data.js', '/site/viz/depthline.js', '/site/viz/sitecells-data.js', '/site/viz/sitecells.js'];
  const SETS = ['all', 'ev', 'crossings', 'flood', 'quakes'];
  const SETNAME = { all: ['All data sets', 'Όλα τα συνόλα'], ev: ['EV charging', 'Φόρτιση EV'], crossings: ['Crossings', 'Διαβάσεις'], flood: ['Flood reaches', 'Ποτάμια'], quakes: ['Earthquakes', 'Σεισμοί'] };

  function build(root) {
    const K = SC.viz.kit, VD = SC.vortexData, now = new Date(), stops = [];
    const wl = K.el('div', 'dw'); root.append(wl);
    const keep = (h) => { if (h && h.destroy) stops.push(() => h.destroy()); return h; };
    const safe = (fn, host) => { try { return fn(); } catch (e) { K.note(host, T('This picture could not be drawn. The facts are in the text list below.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί. Τα στοιχεία είναι στη λίστα παρακάτω.')); return null; } };

    // 0. the counter strip: three plain counts, filled in when the answers arrive
    const strip = K.el('div', 'dw-strip'); wl.append(strip);
    const still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const cell = (label) => { const sp0 = K.el('span'), b = K.el('b', null, '\u2013'); sp0.append(b, document.createTextNode(label)); strip.append(sp0); return (n) => { if (still || !(n > 0)) { b.textContent = String(n); return; } const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 700); b.textContent = String(Math.round(n * k)); if (k < 1 && b.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step); }; };
    strip.append(K.el('span', 'dw-name', 'Kleanthis // Data Wall'));
    const setRecords = cell(T('records as discs', 'εγγραφές ως δίσκοι')), setSheets = cell(T('data sheets', 'φύλλα δεδομένων')), setFeeds = cell(T('feeds that update', 'πηγές που ανανεώνονται'));
    strip.append(K.el('span', 'dw-end', T('our own data, nothing invented', 'δικά μας δεδομένα, τίποτα επινοημένο')));
    const tg = K.panel(wl, T('How old is each data set?', 'Πόσο παλιά είναι κάθε σύνολο;'), T('One cell per data sheet: point at a cell to read it. Sheets that never refresh are marked fixed by design and are never called old or fresh.', 'Ένα κελί ανά φύλλο δεδομένων: δείξτε ένα κελί για να το διαβάσετε. Τα φύλλα που δεν ανανεώνονται σημειώνονται ως σταθερά εξ σχεδίου και δεν λέγονται παλιά ή φρέσκα.'), 'wl-wide');
    // 1. the sphere: one disc per record
    const sp = K.panel(wl, T('Every record as a disc', 'Κάθε εγγραφή ως δίσκος'), T('One disc is one real record. Drag to turn the sphere, click a disc to read it. Lines join discs of the same group only.', 'Κάθε δίσκος είναι μία πραγματική εγγραφή. Σύρετε για να γυρίσει η σφαίρα, πατήστε ένα δίσκο για να το διαβάσετε. Η γραμμές συνδέουν μόνο δίσκους της ίδιας ομάδας.'), 'dw-8 wl-tall');
    let sph = null, spView = 'all'; const modelOf = (v) => (v === 'all' ? Promise.all(['ev', 'crossings', 'flood', 'quakes'].map((x) => K.tryJson('/api/stack/' + VD.SOURCE[x]).then((a) => (a ? VD.BUILD[x](a) : null)))).then(VD.allModel) : K.tryJson('/api/stack/' + VD.SOURCE[v]).then((a) => (a ? VD.BUILD[v](a) : null)));
    SETS.forEach((v) => { const b = K.el('button', null, K.pair(SETNAME[v])); b.type = 'button'; b.setAttribute('aria-pressed', String(v === spView)); b.onclick = () => { spView = v; sp.tools.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawSphere(); }; sp.tools.append(b); });
    function drawSphere() {
      modelOf(spView).then((m) => {
        if (!m || !m.items || !m.items.length) { K.note(sp.host, T('These records could not be loaded right now.', 'Οι εγγραφές δεν φόρτωσαν αυτή τη στιγμή.')); sp.rows(null); return; }
        const sd = SC.viz.sphereData.build(m, null); sp.rows(sd); sp.aria(sd); if (spView === 'all' && !setRecords.done) { setRecords.done = true; setRecords(m.items.length); }
        if (sph) { sph.setModel(m); return; }
        sp.host.textContent = ''; sph = keep(safe(() => SC.viz.sphere.mount(sp.host, m, { onPick: (it) => sp.say(it ? (it.t || '') + ' · ' + (Array.isArray(it.sub) ? K.pair(it.sub) : it.sub || '') : '') }), sp.host));
      });
    }
    drawSphere();

    // 2. freshness of every sheet
    const nl = K.panel(wl, T('Where our data comes from', 'Από πού πέρνουμε τα δεδομένα'), T('Publishers on the left, the sheets built from them on the right. A moving line is a live feed.', 'Οι εκδότες αριστερά, τα φύλλα που χτίζονται από αυτούς δεξιά. Μια κινούμενη γραμμή είναι ζωντανή ροή.'), 'dw-4');
    K.tryJson('/api/stack').then((cat) => {
      if (!cat || !cat.sheets) { K.note(tg.host, T('The catalogue could not be loaded right now.', 'Ο κατάλογος δεν φόρτωσε αυτή τη στιγμή.')); K.note(nl.host, T('The catalogue could not be loaded right now.', 'Ο κατάλογος δεν φόρτωσε αυτή τη στιγμή.')); return; }
      setSheets(cat.sheets.length); setFeeds(cat.sheets.filter((x) => x.live === true || x.kind === 'scheduled' || x.kind === 'delayed').length);
      Promise.all(cat.sheets.map((s) => K.tryJson('/api/stack/' + s.id).then((a) => [s.id, a]))).then((pairs) => {
        const det = {}; pairs.forEach(([id, a]) => { det[id] = a; });
        const tm = SC.viz.tilegridData.build(cat, det, now); tg.rows(tm); tg.aria(tm); tg.host.textContent = '';
        keep(safe(() => SC.viz.tilegrid.mount(tg.host, tm, { compact: true, onHover: (t) => tg.say(t ? K.pair(t.title) + ' \u00b7 ' + K.pair(t.statusLabel) + (t.ageText ? ' \u00b7 ' + K.pair(t.ageText) : '') + (t.source ? ' \u00b7 ' + K.pair(t.source) : '') : ''), onPick: (t) => tg.say(t ? K.pair(t.title) + ' · ' + K.pair(t.statusLabel) + (t.ageText ? ' · ' + K.pair(t.ageText) : '') : '') }), tg.host));
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

    // 5. residents and age of residents, one city at a time
    const pe = K.panel(wl, T('Residents and their ages, one city at a time', 'Κάτοικοι και ηλικίες, μία πόλη τη φορά'), T('Blocks of residents and three age bands from the 2021 census, for the municipality. Point at a band to read it.', 'Τετράγωνα κατοίκων και τρεις ηλικιακές ομάδες από την απογραφή του 2021, για τον δήμο. Δείξτε μια ομάδα για να τη διαβάσετε.'), 'wl-wide');
    Promise.all([K.tryJson('/api/stack/population'), K.tryJson('/api/stack/age')]).then(([po, ag]) => {
      if (!po && !ag) { nope(pe); return; }
      const m = SC.viz.peopleData.build({ population: po, age: ag }, {}); pe.rows(m); pe.aria(m);
      if (m.empty && !(m.choices && m.choices.length)) { K.note(pe.host, K.pair(m.empty)); return; }
      pe.host.textContent = '';
      const h = keep(safe(() => SC.viz.people.mount(pe.host, m, { chooser: false, onPick: (r) => pe.say(r ? K.pair(r.label) : '') }), pe.host));
      if (h) pickOne(pe, m.choices, (c) => c.id, (c) => c.name, T('City', 'Πόλη'), (v) => { pe.rows(h.set({ city: v })); });
    });

    // 6. weather and air, live: one station at a time, refreshed while the page is open
    const fresh = (url) => fetch(url, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const liveStation = (sheet, title, hint) => {
      const p = K.panel(wl, title, hint, 'dw-4');
      K.tryJson('/api/stack/' + sheet).then((a) => {
        if (!a) { nope(p); return; }
        const m = SC.viz.stationData.build(a, {}, Date.now()); p.rows(m); p.aria(m); p.host.textContent = '';
        const h = keep(safe(() => SC.viz.station.mount(p.host, m, { chooser: false, onPick: (r) => p.say(r ? K.pair(r.label) : '') }), p.host));
        if (!h) return;
        if (m.choices && m.choices.length > 1) pickOne(p, m.choices, (c) => c.id, (c) => c.name, T('Station', 'Σταθμός'), (v) => { p.rows(h.set({ station: v }) || h.model()); });
        const every = Math.max(60, Math.min(900, a.refreshSeconds || 300)) * 1000;
        const t = setInterval(() => { if (document.hidden) return; fresh('/api/stack/' + sheet).then((n) => { if (n) { try { p.rows(h.update(n, Date.now()) || h.model()); } catch (e) { /* keep the last reading */ } } }); }, every);
        stops.push(() => clearInterval(t));
      });
    };
    liveStation('met-stations', T('Weather stations, live', 'Μετεωρολογικοί σταθμοί, ζωντανά'), T('The latest reading of one Met Office station: wind, temperature, humidity and rain.', 'Η τελευταία μέτρηση ενός σταθμού της Μετεωρολογικής: άνεμος, θερμοκρασία, υγρασία και βροχή.'));
    liveStation('airports', T('Airport weather, live', 'Καιρός αεροδρομίων, ζωντανά'), T('The latest weather report of one airport.', 'Η τελευταία αναφορά καιρού ενός αεροδρομίου.'));
    liveStation('air-stations', T('Official air-quality stations, live', 'Επίσημοι σταθμοί ποιότητας αέρα, ζωντανά'), T('The latest hourly values of one official outdoor station. Not compared with our indoor sensors.', 'Οι τελευταίες ωριαίες τιμές ενός επίσημου εξωτερικού σταθμού. Δεν συγκρίνονται με τους εσωτερικούς αισθητήρες μας.'));

    // 7. water: the seabed along one line, and one cell per bathing site
    const dl = K.panel(wl, T('The seabed along one line', 'Ο βυθός κατά μήκος μιας γραμμής'), T('Slide along the line to read the depth. Each line starts offshore; hollow dots are values the seabed model marks as interpolated. Estimates, not soundings.', 'Σύρετε πάνω στη γραμμή για να διαβάσετε το βάθος. Κάθε γραμμή ξεκινά ανοιχτά της ακτής· οι κούφιες τελείες είναι τιμές που το μοντέλο βυθού σημειώνει ως παρεμβολή. Εκτιμήσεις, όχι βυθομετρήσεις.'), 'dw-6');
    item('depthline', 'seabed-profiles', dl, (m) => { const h = keep(SC.viz.depthline.mount(dl.host, m, { chooser: false, onPick: (r) => dl.say(r ? K.pair(r.label) : '') }));
      pickOne(dl, m.choices, (c) => c.id, (c) => c.name, T('Line', 'Γραμμή'), (v) => { dl.rows(h.set({ profile: v })); }); });
    const bw = K.panel(wl, T('Bathing water: one cell per site', 'Νερά κολύμβησης: ένα κελί ανά σημείο'), T('Each cell is one bathing site with the class reported for the season. Type a name to find a site. No score is made from it.', 'Κάθε κελί είναι ένα σημείο κολύμβησης με την κατηγορία που αναφέρθηκε για την περίοδο. Γράψτε ένα όνομα για να βρείτε ένα σημείο. Δεν φτιάχνεται βαθμός.'), 'dw-6');
    item('sitecells', 'bathing-water', bw, (m) => { const h = keep(SC.viz.sitecells.mount(bw.host, m, { onPick: (r) => bw.say(r ? r.name + ' \u00b7 ' + K.pair(r.labelText) : '') }));
      const inp = K.el('input'); inp.type = 'search'; inp.setAttribute('aria-label', T('Find a bathing site by name', 'Βρείτε σημείο κολύμβησης με το όνομα')); inp.placeholder = T('Find a site', 'Βρείτε σημείο'); inp.className = 'dw-find';
      inp.oninput = () => { const n = h.filter(inp.value); bw.say(inp.value ? n + ' ' + T('sites match', 'σημεία ταιριάζουν') : ''); }; bw.tools.append(inp); });

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
