/*
  The workshop (#/workshop): students build their own tool from built-in blocks. Second version.
  A tool is a list of blocks, saved as a list of choices (a "recipe"), never as code. Five groups:
    DATA       one line each: a measurement in a city, read by one layer (our sensors, official stations, weather model). Up to four.
    PROCESS    match by hour, difference, average / highest / lowest, keep only part of the day, biggest change
    AI MODELS  predict next hours, spot unusual hours, find a pattern. These three are simple maths with their rule on the page.
               "Explain in words" builds sentences from the numbers by fixed rules. No block here calls an outside model in this version.
    INTERACT   controls the finished tool gets: city picker, hour slider, measure switch, show or hide a line
    SHOW       line chart, bars, big number, table
  The page has three parts: ideas to start from, the finished tool (drawn from real data, redrawn on every change) with the blocks
  that make it under it, and the shelf of blocks. Blocks are dragged from the shelf (or pressed, which is the keyboard and touch way),
  pressed to change their choices, moved or removed. The wires between blocks are drawn from the order of the groups.
  Data: GET /layers/api/compare?city=&variable= (the saved day of each layer for one city, city-level numbers only), turned into
  hourly averages. No vehicle position is read. Indoor and outdoor readings are never subtracted from each other.
  Nothing a student types is used: every setting is a choice from a list, so there is no free text to check and nothing to run.
  Drafts are kept in this browser (localStorage) and the recipe is in the address (#/workshop?r=...), so a link reopens the tool.
  A recipe from the address or from storage is checked against the lists below and anything unknown is dropped. Links made by the
  first version (a chain of boxes) are still read and turned into blocks.
  Not in this version (said on the page): the chat helper, sending a tool to a teacher, the gallery, the map of squares.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  const isEl = () => SC.lang === 'el';
  const L = (p) => (p ? p[isEl() ? 1 : 0] : '');
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−').replace('.', isEl() ? ',' : '.');
  const HOUR = 3600000;
  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const cname = (c) => L(CITY[c]);
  const COL = ['#5EE0A8', '#4CCBEA', '#F2A56B', '#F0ABFC'];
  const VARS = { temperature: ['Temperature', 'Θερμοκρασία'], relative_humidity: ['Humidity', 'Υγρασία'], wind_speed: ['Wind speed', 'Ταχύτητα ανέμου'], pressure: ['Air pressure', 'Ατμοσφαιρική πίεση'], co2: ['CO₂', 'CO₂'], pm25: ['Fine particles PM2.5', 'Λεπτά σωματίδια PM2.5'], pm10: ['Particles PM10', 'Σωματίδια PM10'], ozone: ['Ozone', 'Όζον'], dust: ['Dust', 'Σκόνη'] };
  const vname = (m) => L(VARS[m]);
  const SRC = { any: ['Any layer that has it', 'Όποιο στρώμα το έχει'], own: ['Our sensors', 'Οι αισθητήρες μας'], official: ['Official stations', 'Επίσημοι σταθμοί'], model: ['Weather model', 'Μοντέλο καιρού'] };
  const PREF = ['official', 'model', 'own'];
  const KEEP = { day: ['daytime, 06:00 to 18:00', 'μέρα, 06:00 έως 18:00'], night: ['night, 18:00 to 06:00', 'νύχτα, 18:00 έως 06:00'], h12: ['the last 12 hours', 'οι τελευταίες 12 ώρες'], h6: ['the last 6 hours', 'οι τελευταίες 6 ώρες'], h3: ['the last 3 hours', 'οι τελευταίες 3 ώρες'] };
  const RULE = { last: ['the same as the newest reading', 'ίδιο με την πιο πρόσφατη μέτρηση'], mean: ['the average of the last 3 hours', 'ο μέσος όρος των τελευταίων 3 ωρών'], line: ['a straight line through the last 3 hours', 'μια ευθεία γραμμή από τις τελευταίες 3 ώρες'] };
  const AHEAD = { 1: ['1 hour ahead', '1 ώρα μπροστά'], 3: ['3 hours ahead', '3 ώρες μπροστά'] };
  const GROUP = { data: ['Data', 'Δεδομένα'], process: ['Process', 'Επεξεργασία'], ai: ['AI models', 'Μοντέλα ΤΝ'], interact: ['Interact', 'Αλληλεπίδραση'], show: ['Show', 'Εμφάνιση'] };
  const ORDER = ['data', 'process', 'ai', 'interact', 'show'];
  const KIND = {
    data: { g: 'data', n: ['Data', 'Δεδομένα'], d: ['One line: a measurement in a city, read by one layer', 'Μία γραμμή: μια μέτρηση σε μια πόλη, από ένα στρώμα'] },
    match: { g: 'process', n: ['Match by hour', 'Ταίριασμα ανά ώρα'], d: ['Keeps only the hours every line has', 'Κρατά μόνο τις ώρες που έχουν όλες οι γραμμές'] },
    diff: { g: 'process', n: ['Difference', 'Διαφορά'], d: ['The first line minus the second', 'Η πρώτη γραμμή μείον τη δεύτερη'] },
    stats: { g: 'process', n: ['Average, high, low', 'Μέσος όρος, μέγιστο, ελάχιστο'], d: ['Three numbers for each line', 'Τρεις αριθμοί για κάθε γραμμή'] },
    keep: { g: 'process', n: ['Keep only…', 'Κράτα μόνο…'], d: ['Part of the saved day', 'Ένα μέρος της αποθηκευμένης μέρας'] },
    change: { g: 'process', n: ['Biggest change', 'Μεγαλύτερη αλλαγή'], d: ['Hours when a line jumped', 'Ώρες που μια γραμμή άλλαξε απότομα'] },
    predict: { g: 'ai', n: ['Predict next hours', 'Πρόβλεψε τις επόμενες ώρες'], d: ['A simple rule, tested on the saved day', 'Ένας απλός κανόνας, δοκιμασμένος στην αποθηκευμένη μέρα'] },
    unusual: { g: 'ai', n: ['Spot unusual hours', 'Βρες ασυνήθιστες ώρες'], d: ['Hours far from the usual of a line', 'Ώρες μακριά από το συνηθισμένο μιας γραμμής'] },
    pattern: { g: 'ai', n: ['Find a pattern', 'Βρες ένα μοτίβο'], d: ['Do the first two lines move together?', 'Κινούνται μαζί οι δύο πρώτες γραμμές;'] },
    explain: { g: 'ai', n: ['Explain in words', 'Εξήγησε με λόγια'], d: ['Sentences built from the numbers', 'Προτάσεις φτιαγμένες από τους αριθμούς'] },
    city: { g: 'interact', n: ['City picker', 'Επιλογή πόλης'], d: ['Sets the city of every data block', 'Ορίζει την πόλη σε κάθε κουτί δεδομένων'] },
    hour: { g: 'interact', n: ['Hour slider', 'Ρυθμιστικό ώρας'], d: ['Picks the hour the numbers are read at', 'Διαλέγει την ώρα που διαβάζονται οι αριθμοί'] },
    measure: { g: 'interact', n: ['Measure switch', 'Αλλαγή μέτρησης'], d: ['Sets the measurement of every data block', 'Ορίζει τη μέτρηση σε κάθε κουτί δεδομένων'] },
    lines: { g: 'interact', n: ['Show or hide a line', 'Δείξε ή κρύψε γραμμή'], d: ['A tick box for each line', 'Ένα κουτάκι επιλογής για κάθε γραμμή'] },
    line: { g: 'show', n: ['Line chart', 'Γραμμικό γράφημα'], d: ['The lines over time', 'Οι γραμμές μέσα στον χρόνο'] },
    bars: { g: 'show', n: ['Bars', 'Ράβδοι'], d: ['One bar for each line', 'Μία ράβδος για κάθε γραμμή'] },
    number: { g: 'show', n: ['Big number', 'Μεγάλος αριθμός'], d: ['The number of each line, large', 'Ο αριθμός κάθε γραμμής, μεγάλος'] },
    table: { g: 'show', n: ['Table', 'Πίνακας'], d: ['The numbers hour by hour', 'Οι αριθμοί ώρα με την ώρα'] },
  };
  const MAX = 12, MAXD = 4, KEY = 'sc.workshop.draft.v2', KEY1 = 'sc.workshop.draft.v1';
  const D = (g, c, m, s) => ({ k: 'data', g, c, m, s: s || '' });
  // ideas to start from: ready recipes. The first one is what opens for a new visitor.
  const IDEAS = [
    { q: ['Do our buses read warmer air than the weather station?', 'Μετρούν τα λεωφορεία μας πιο ζεστό αέρα από τον μετεωρολογικό σταθμό;'], s: ['Larnaka, temperature', 'Λάρνακα, θερμοκρασία'], b: [D('own', 'larnaka', 'temperature'), D('official', 'larnaka', 'temperature'), { k: 'match' }, { k: 'diff' }, { k: 'explain' }, { k: 'hour' }, { k: 'line' }] },
    { q: ['When is the wind strongest in each city?', 'Πότε είναι πιο δυνατός ο άνεμος σε κάθε πόλη;'], s: ['Four cities, wind speed', 'Τέσσερις πόλεις, ταχύτητα ανέμου'], b: [D('any', 'larnaka', 'wind_speed'), D('any', 'lefkosia', 'wind_speed'), D('any', 'limassol', 'wind_speed'), D('any', 'paphos', 'wind_speed'), { k: 'stats' }, { k: 'lines' }, { k: 'line' }] },
    { q: ['Guess the next hour of temperature', 'Μάντεψε τη θερμοκρασία της επόμενης ώρας'], s: ['Limassol, a prediction you can test', 'Λεμεσός, μια πρόβλεψη που δοκιμάζεται'], b: [D('official', 'limassol', 'temperature'), { k: 'predict', rule: 'line', ahead: 1 }, { k: 'city' }, { k: 'line' }, { k: 'number' }] },
    { q: ['Which hours were unusual?', 'Ποιες ώρες ήταν ασυνήθιστες;'], s: ['Lefkosia, humidity', 'Λευκωσία, υγρασία'], b: [D('any', 'lefkosia', 'relative_humidity'), { k: 'unusual' }, { k: 'explain' }, { k: 'measure' }, { k: 'line' }] },
    { q: ['Do temperature and humidity move together?', 'Κινούνται μαζί η θερμοκρασία και η υγρασία;'], s: ['Larnaka, two measurements', 'Λάρνακα, δύο μετρήσεις'], b: [D('official', 'larnaka', 'temperature'), D('official', 'larnaka', 'relative_humidity'), { k: 'match' }, { k: 'pattern' }, { k: 'line' }] },
  ];

  // ---------- the recipe: checked against the lists, anything else is dropped ----------
  function fromV1(a) {   // a link from the first version: one Data box with cities, then a chain
    const d = a[0]; if (!d || d.k !== 'data') return null;
    const cs = Array.isArray(d.c) ? d.c.filter((c) => has(CITY, c)) : [];
    const b = (cs.length ? cs : ['larnaka']).map((c) => D(d.m === 'own' ? 'own' : 'any', c, d.m === 'wind' ? 'wind_speed' : 'temperature'));
    if (d.p === 'h12' || d.p === 'h6' || d.p === 'h3') b.push({ k: 'keep', w: d.p });
    a.slice(1).forEach((x) => { if (x && x.k === 'compare') b.push({ k: 'diff' }); else if (x && x.k !== 'data' && x.k !== 'agree') b.push(x); });
    return { b };
  }
  function clean(raw) {
    if (Array.isArray(raw)) raw = raw.length && raw[0] && Array.isArray(raw[0].c) ? fromV1(raw) : { b: raw };
    const list = raw && Array.isArray(raw.b) ? raw.b : null; if (!list) return null;
    const out = [], seen = new Set(); let nd = 0;
    list.slice(0, 40).forEach((b) => {
      if (!b || typeof b !== 'object' || !has(KIND, b.k)) return;
      if (b.k === 'data') { if (nd >= MAXD) return; nd++; out.push({ k: 'data', g: has(SRC, b.g) ? b.g : 'any', c: has(CITY, b.c) ? b.c : 'larnaka', m: has(VARS, b.m) ? b.m : 'temperature', s: typeof b.s === 'string' && /^[a-z0-9-]{1,40}$/.test(b.s) ? b.s : '' }); return; }
      if (seen.has(b.k)) return; seen.add(b.k);
      if (b.k === 'predict') out.push({ k: 'predict', rule: has(RULE, b.rule) ? b.rule : 'last', ahead: b.ahead === 3 || b.ahead === '3' ? 3 : 1 });
      else if (b.k === 'keep') out.push({ k: 'keep', w: has(KEEP, b.w) ? b.w : 'day' });
      else out.push({ k: b.k });
    });
    if (!nd) return null;
    return out.map((b, i) => [b, i]).sort((x, y) => ORDER.indexOf(KIND[x[0].k].g) - ORDER.indexOf(KIND[y[0].k].g) || x[1] - y[1]).map((x) => x[0]).slice(0, MAX);
  }
  const pack = (r) => { try { return btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, b: r })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (e) { return ''; } };
  const unpack = (s) => { try { return clean(JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')))))); } catch (e) { return null; } };

  // ---------- the sums (also used by the tests through SC.workshopMath) ----------
  function hourly(points) {   // [[time, value], ...] -> one average for each clock hour, stamped at the start of the hour
    const by = new Map();
    (points || []).forEach((p) => { if (!p || p[1] == null || !isFinite(p[1])) return; const k = Math.floor(p[0] / HOUR), o = by.get(k) || { n: 0, a: 0 }; o.n++; o.a += p[1]; by.set(k, o); });
    return [...by.keys()].sort((a, b) => a - b).map((k) => [k * HOUR, by.get(k).a / by.get(k).n]);
  }
  function keepPts(pts, w, newest) {
    if (w === 'day' || w === 'night') return pts.filter((p) => { const hr = new Date(p[0]).getHours(), day = hr >= 6 && hr < 18; return w === 'day' ? day : !day; });
    const n = { h12: 12, h6: 6, h3: 3 }[w] || 0; return n ? pts.filter((p) => p[0] > newest - n * HOUR) : pts;
  }
  function shared(list) { let keys = null; list.forEach((pts) => { const s = new Set(pts.map((p) => p[0])); keys = keys ? new Set([...keys].filter((t) => s.has(t))) : s; }); return keys || new Set(); }
  function gapOf(a, b) { const m = new Map(b.map((p) => [p[0], p[1]])); return a.filter((p) => m.has(p[0])).map((p) => [p[0], p[1] - m.get(p[0])]); }
  const median = (a) => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; };
  function jumps(pts) {   // a step more than 3 times the usual (median) step of this line, and never less than a tenth of its range
    const st = []; for (let i = 1; i < pts.length; i++) st.push(Math.abs(pts[i][1] - pts[i - 1][1]));
    const vals = pts.map((p) => p[1]), range = vals.length ? Math.max(...vals) - Math.min(...vals) : 0, usual = median(st) || 0, bar = Math.max(usual * 3, range * 0.1);
    const out = []; for (let i = 1; i < pts.length; i++) { const d = pts[i][1] - pts[i - 1][1]; if (bar > 0 && Math.abs(d) > bar) out.push({ t: pts[i][0], d }); }
    return { usual, bar, list: out };
  }
  function unusual(pts) {   // further from the middle value (median) than 3 times the usual distance from it. Needs 6 hours.
    const v = pts.map((p) => p[1]); if (v.length < 6) return { mid: null, bar: null, list: [] };
    const mid = median(v), mad = median(v.map((x) => Math.abs(x - mid))), bar = 3 * 1.4826 * mad;
    return { mid, bar, list: bar > 0 ? pts.filter((p) => Math.abs(p[1] - mid) > bar).map((p) => ({ t: p[0], v: p[1] })) : [] };
  }
  function together(a, b) {   // how closely two lines rise and fall together over the hours both have (Pearson r). Needs 6 hours.
    const m = new Map(b.map((p) => [p[0], p[1]])), xy = a.filter((p) => m.has(p[0])).map((p) => [p[1], m.get(p[0])]), n = xy.length;
    if (n < 6) return { n, r: null };
    const mx = xy.reduce((s, p) => s + p[0], 0) / n, my = xy.reduce((s, p) => s + p[1], 0) / n; let sxy = 0, sxx = 0, syy = 0;
    xy.forEach((p) => { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) * (p[0] - mx); syy += (p[1] - my) * (p[1] - my); });
    return { n, r: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null };
  }
  function guess(hist, rule, ahead) {   // hist: hourly values up to now (oldest first); the prediction for `ahead` hours later
    const n = hist.length; if (!n) return null;
    if (rule === 'last') return hist[n - 1];
    const w = hist.slice(-3); if (rule === 'mean') return w.reduce((a, b) => a + b, 0) / w.length;
    if (w.length < 2) return hist[n - 1];
    const xm = (w.length - 1) / 2, ym = w.reduce((a, b) => a + b, 0) / w.length; let sxy = 0, sxx = 0; w.forEach((y, x) => { sxy += (x - xm) * (y - ym); sxx += (x - xm) * (x - xm); });
    const slope = sxx ? sxy / sxx : 0; return ym + slope * (w.length - 1 - xm + ahead);
  }
  function backtest(pts, rule, ahead) {   // try the rule at every hour of the line that has 3 hours before it and a later reading to check
    const v = pts.map((p) => p[1]); let n = 0, err = 0, base = 0;
    for (let i = 2; i + ahead < v.length; i++) { const g = guess(v.slice(0, i + 1), rule, ahead), b = v[i]; if (g == null) continue; n++; err += Math.abs(g - v[i + ahead]); base += Math.abs(b - v[i + ahead]); }
    return { n, mae: n ? err / n : null, same: n ? base / n : null, next: guess(v, rule, ahead) };
  }
  SC.workshopMath = { clean, pack, unpack, hourly, keepPts, shared, gapOf, jumps, unusual, together, guess, backtest };

  SC.register('workshop', {
    title: ['Workshop', 'Εργαστήρι'],
    render(root) {
      SC.css('/site/pages/workshop.css');
      let alive = true, timer = 0, dragKind = null, dragFrom = -1, open = null, fresh = null, raf = 0;
      const store = new Map(), undo = [], ui = { city: null, m: null, hour: null, hidden: new Set() };
      let recipe = unpack((location.hash.split('?r=')[1] || '').split('&')[0]);
      if (!recipe) { try { recipe = clean(JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(KEY1) || 'null')); } catch (e) { recipe = null; } }
      if (!recipe) recipe = clean({ b: IDEAS[0].b });
      const kn = (k) => L(KIND[k].n), gOf = (b) => KIND[b.k].g, hasK = (k) => recipe.some((b) => b.k === k);
      const said = h('p', { class: 'ws-sr', 'aria-live': 'polite' });
      const ideas = h('div', { class: 'ws-ideas ws-card' }), tool = h('div', { class: 'ws-tool ws-card' }), canvas = h('div', { class: 'ws-canvas ws-card' }), shelf = h('div', { class: 'ws-pal ws-card' });
      const ctl = h('div', { class: 'ws-ctl' }), body = h('div', { class: 'ws-body' }), ttl = h('h3', { class: 'ws-tt' });
      const flow = h('div', { class: 'ws-flow' }), wire = sv('svg', { class: 'ws-wire', 'aria-hidden': 'true' });
      root.replaceChildren(h('div', { class: 'ws' },
        SC.head({ title: T('Workshop', 'Εργαστήρι'), lede: T('Build your own tool from blocks. Start from an idea or drag blocks from the shelf. The finished tool is drawn from real data and changes as you build.', 'Φτιάξε το δικό σου εργαλείο από κουτιά. Ξεκίνα από μια ιδέα ή σύρε κουτιά από το ράφι. Το έτοιμο εργαλείο σχεδιάζεται από πραγματικά δεδομένα και αλλάζει όσο χτίζεις.') }),
        h('div', { class: 'ws-grid' }, ideas, h('div', { class: 'ws-mid' }, tool, canvas), shelf), said));
      tool.append(h('div', { class: 'ws-hd' }, h('span', { class: 'ws-n', 'aria-hidden': 'true' }, '1'), h('h2', null, T('Your finished tool', 'Το έτοιμο εργαλείο σου')), h('em', null, T('Live: it redraws when a block changes', 'Ζωντανό: ξανασχεδιάζεται όταν αλλάζει ένα κουτί'))), h('div', { class: 'ws-live' }, ttl, ctl, body));

      // ---------- keeping and changing the recipe ----------
      const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ v: 2, b: recipe })); } catch (e) { /* private window: the draft lives in the address only */ } try { history.replaceState(null, '', '#/workshop?r=' + pack(recipe)); } catch (e) { /* ignore */ } };
      const snap = () => { undo.push(JSON.stringify(recipe)); if (undo.length > 30) undo.shift(); };
      const sortIn = () => { const at = new Map(recipe.map((b, i) => [b, i])); recipe.sort((x, y) => ORDER.indexOf(gOf(x)) - ORDER.indexOf(gOf(y)) || at.get(x) - at.get(y)); };   // keeps the same objects, so the open block stays open
      function changed(msg) { sortIn(); if (open && !recipe.includes(open)) open = null; if (fresh && !recipe.includes(fresh)) fresh = null; save(); fetchAll(); drawAll(); if (msg) said.textContent = msg; }
      function add(k, extra) {
        if (recipe.length >= MAX) { SC.toast(T('A tool holds at most ' + MAX + ' blocks. Take one out first.', 'Ένα εργαλείο χωρά το πολύ ' + MAX + ' κουτιά. Βγάλε πρώτα ένα.')); return; }
        if (k === 'data' && recipe.filter((b) => b.k === 'data').length >= MAXD) { SC.toast(T('A tool holds at most ' + MAXD + ' data blocks.', 'Ένα εργαλείο χωρά το πολύ ' + MAXD + ' κουτιά δεδομένων.')); return; }
        if (k !== 'data' && hasK(k)) { SC.toast(T('This block is already in your tool.', 'Αυτό το κουτί είναι ήδη στο εργαλείο σου.')); return; }
        const first = recipe.find((b) => b.k === 'data');
        const b = k === 'data' ? D(extra || 'any', first.c, first.m) : k === 'predict' ? { k, rule: 'last', ahead: 1 } : k === 'keep' ? { k, w: 'day' } : { k };
        snap(); recipe.push(b); fresh = b;
        open = fresh.k === 'data' || fresh.k === 'predict' || fresh.k === 'keep' ? fresh : open; changed(T('Added: ', 'Προστέθηκε: ') + kn(k));
      }
      function move(b, by) { const i = recipe.indexOf(b), j = i + by; if (i < 0 || j < 0 || j >= recipe.length || gOf(recipe[j]) !== gOf(b)) return; snap(); recipe.splice(i, 1); recipe.splice(j, 0, b); changed(T('Moved: ', 'Μετακινήθηκε: ') + kn(b.k)); }
      function remove(b) { if (b.k === 'data' && recipe.filter((x) => x.k === 'data').length < 2) { SC.toast(T('A tool needs at least one data block.', 'Ένα εργαλείο χρειάζεται τουλάχιστον ένα κουτί δεδομένων.')); return; } snap(); recipe.splice(recipe.indexOf(b), 1); changed(T('Removed: ', 'Αφαιρέθηκε: ') + kn(b.k)); }
      function setTo(list, msg) { snap(); recipe = clean({ b: JSON.parse(JSON.stringify(list)) }); open = null; fresh = null; ui.city = ui.m = ui.hour = null; ui.hidden.clear(); changed(msg); }
      function back() { if (!undo.length) return; recipe = clean({ b: JSON.parse(undo.pop()) }); open = null; fresh = null; changed(T('Undone.', 'Αναιρέθηκε.')); }

      // ---------- the data ----------
      const effOf = (b) => ({ c: hasK('city') && ui.city ? ui.city : b.c, m: hasK('measure') && ui.m ? ui.m : b.m });
      function fetchOne(key, quiet) {
        const [c, m] = key.split('|'), cur = store.get(key);
        if (!cur) store.set(key, { state: 'load' }); else if (!quiet) return;
        SC.api('/layers/api/compare?city=' + c + '&variable=' + m).then((r) => { if (!alive) return; store.set(key, { state: 'ok', r }); drawTool(); if (!quiet) drawCanvas(); })
          .catch((e) => { if (!alive) return; if (quiet && cur && cur.state === 'ok') return; store.set(key, { state: e && (e.status === 404 || /no_variable|No layer has/i.test(String(e.code || e.message || e))) ? 'none' : 'fail' }); drawTool(); });
      }
      function fetchAll(quiet) { [...new Set(recipe.filter((b) => b.k === 'data').map((b) => { const e = effOf(b); return e.c + '|' + e.m; }))].forEach((k) => fetchOne(k, quiet)); }

      // every data block becomes one line; then the Process and AI blocks work on the lines, in order
      function run() {
        const eff = recipe.filter((b) => b.k === 'data').map((b) => ({ b, ...effOf(b) }));
        const manyC = new Set(eff.map((e) => e.c)).size > 1, manyM = new Set(eff.map((e) => e.m)).size > 1, used = new Set();
        const ser = eff.map((e, i) => {
          const st = store.get(e.c + '|' + e.m), o = { i, b: e.b, c: e.c, m: e.m, colour: COL[i % COL.length], pts: [], unit: '', state: st ? st.state : 'load', options: [] };
          if (st && st.state === 'ok') {
            const cand = (st.r.series || []).filter((s) => e.b.g === 'any' || s.group === e.b.g).sort((a, b) => (PREF.indexOf(a.group) + 9) % 9 - (PREF.indexOf(b.group) + 9) % 9);
            const pick = cand.find((s) => s.source === e.b.s) || cand.find((s) => !used.has(e.c + '|' + e.m + '|' + s.source)) || cand[0];
            o.options = cand;
            if (!pick) o.state = 'nosrc'; else { used.add(e.c + '|' + e.m + '|' + pick.source); o.src = pick; o.pts = hourly(pick.points); o.unit = pick.unit || ''; o.env = pick.env; o.srcName = (isEl() && pick.nameEl) || pick.name; }
          }
          o.name = (o.srcName || L(SRC[e.b.g])) + (manyC ? ' · ' + cname(e.c) : '') + (manyM ? ' · ' + vname(e.m) : '');
          return o;
        });
        let have = ser.filter((s) => s.pts.length);
        const R = { ser, eff, results: [], marks: new Map(), preds: [], gap: null, words: [] };
        const u = (s) => (s.unit ? ' ' + s.unit : ''), res = (b, ...kids) => R.results.push({ b, kids: kids.filter(Boolean) });
        const fine = (en, el) => h('p', { class: 'ws-fine' }, T(en, el)), empty = (en, el) => h('p', { class: 'ws-empty' }, T(en, el));
        const mark = (s, t, kind) => { const a = R.marks.get(s.i) || []; a.push({ t, kind }); R.marks.set(s.i, a); };
        recipe.forEach((b) => {
          if (gOf(b) !== 'process' && gOf(b) !== 'ai') return;
          if (!have.length) return;
          const inout = have.length > 1 && (have[0].env === 'indoor') !== (have[1].env === 'indoor');
          if (b.k === 'keep') { const newest = Math.max(...have.map((s) => s.pts[s.pts.length - 1][0])); have.forEach((s) => { s.pts = keepPts(s.pts, b.w, newest); }); have = have.filter((s) => s.pts.length); if (!have.length) res(b, empty('No saved hour is left after this block. Try another part of the day.', 'Δεν έμεινε καμία αποθηκευμένη ώρα μετά από αυτό το κουτί. Δοκίμασε άλλο μέρος της μέρας.')); }
          else if (b.k === 'match') {
            if (have.length < 2) res(b, empty('Add a second data block: matching needs two lines.', 'Πρόσθεσε δεύτερο κουτί δεδομένων: το ταίριασμα θέλει δύο γραμμές.'));
            else { const keys = shared(have.map((s) => s.pts)); have.forEach((s) => { s.pts = s.pts.filter((p) => keys.has(p[0])); }); have = have.filter((s) => s.pts.length); res(b, fine(keys.size + ' hours are in every line. The other hours were left out.', keys.size + ' ώρες υπάρχουν σε όλες τις γραμμές. Οι υπόλοιπες ώρες έμειναν έξω.')); }
          } else if (b.k === 'diff') {
            if (have.length < 2) res(b, empty('Add a second data block: a difference needs two lines.', 'Πρόσθεσε δεύτερο κουτί δεδομένων: η διαφορά θέλει δύο γραμμές.'));
            else if (have[0].unit !== have[1].unit) res(b, empty('The first two lines measure different things, so one cannot be taken from the other.', 'Οι δύο πρώτες γραμμές μετρούν διαφορετικά πράγματα, άρα δεν αφαιρούνται η μία από την άλλη.'));
            else if (inout) res(b, empty('One line is read indoors and the other outdoors. They are not compared.', 'Η μία γραμμή μετριέται μέσα και η άλλη έξω. Δεν συγκρίνονται.'));
            else {
              const A = have[0], B = have[1], g = gapOf(A.pts, B.pts);
              if (!g.length) res(b, empty('The two lines have no saved hour in common.', 'Οι δύο γραμμές δεν έχουν κοινή αποθηκευμένη ώρα.'));
              else { const avg = g.reduce((a, p) => a + p[1], 0) / g.length, top = g.reduce((a, p) => (Math.abs(p[1]) > Math.abs(a[1]) ? p : a), g[0]); R.gap = { A, B, pts: g, avg, top };
                res(b, h('p', { class: 'ws-big' }, h('b', null, (avg >= 0 ? '+' : '−') + num(Math.abs(avg)) + u(A)), ' ' + T('on average over ' + g.length + ' hours', 'κατά μέσο όρο σε ' + g.length + ' ώρες')),
                  fine(A.name + ' minus ' + B.name + '. The biggest gap was ' + num(Math.abs(top[1])) + u(A) + ' at ' + SC.time(top[0]) + '.' + (A.src.source !== B.src.source ? ' The two are read by different layers, so part of the gap may be the instruments.' : ''), A.name + ' μείον ' + B.name + '. Η μεγαλύτερη διαφορά ήταν ' + num(Math.abs(top[1])) + u(A) + ' στις ' + SC.time(top[0]) + '.' + (A.src.source !== B.src.source ? ' Οι δύο μετρώνται από διαφορετικά στρώματα, άρα μέρος της διαφοράς μπορεί να είναι τα όργανα.' : ''))); }
            }
          } else if (b.k === 'stats') res(b, h('div', { class: 'ws-tw' }, h('table', null, h('thead', null, h('tr', null, h('th', null, T('Line', 'Γραμμή')), h('th', null, T('Average', 'Μέσος όρος')), h('th', null, T('Highest', 'Μέγιστο')), h('th', null, T('Lowest', 'Ελάχιστο')))),
            h('tbody', null, have.map((s) => { const hi = s.pts.reduce((a, p) => (p[1] > a[1] ? p : a)), lo = s.pts.reduce((a, p) => (p[1] < a[1] ? p : a)); return h('tr', null, h('td', null, s.name), h('td', null, num(s.pts.reduce((a, p) => a + p[1], 0) / s.pts.length) + u(s)), h('td', null, num(hi[1]) + u(s) + ' · ' + SC.time(hi[0])), h('td', null, num(lo[1]) + u(s) + ' · ' + SC.time(lo[0]))); })))),
            fine('From hourly averages. A higher number is not a better place.', 'Από ωριαίους μέσους όρους. Μεγαλύτερος αριθμός δεν σημαίνει καλύτερο μέρος.'));
          else if (b.k === 'change') { const found = have.map((s) => ({ s, j: jumps(s.pts) })); found.forEach(({ s, j }) => j.list.forEach((z) => mark(s, z.t, 'jump')));
            res(b, found.some((f) => f.j.list.length) ? h('ul', { class: 'ws-list' }, found.flatMap(({ s, j }) => j.list.slice(-3).map((z) => h('li', null, s.name + ' · ' + SC.time(z.t) + ' · ' + (z.d > 0 ? '+' : '−') + num(Math.abs(z.d)) + u(s))))) : empty('No jump found.', 'Δεν βρέθηκε απότομη αλλαγή.'),
              fine('Rule: a change from one hour to the next that is more than 3 times the usual change of that line, and at least a tenth of its range. A jump is a moment to look at, not proof that something happened.', 'Κανόνας: αλλαγή από τη μία ώρα στην επόμενη πάνω από 3 φορές τη συνηθισμένη αλλαγή αυτής της γραμμής, και τουλάχιστον το ένα δέκατο του εύρους της. Μια απότομη αλλαγή είναι στιγμή για να κοιτάξεις, όχι απόδειξη ότι κάτι έγινε.'));
          } else if (b.k === 'predict') { const out = have.map((s) => ({ s, r: backtest(s.pts, b.rule, b.ahead) }));
            R.preds = out.filter((x) => x.r.next != null).map(({ s, r }) => ({ i: s.i, colour: s.colour, pts: [s.pts[s.pts.length - 1], [s.pts[s.pts.length - 1][0] + b.ahead * HOUR, r.next]] }));
            res(b, h('ul', { class: 'ws-list' }, out.map(({ s, r }) => h('li', null, s.name + ': ' + (r.next == null ? '–' : num(r.next) + u(s)) + (r.n >= 3 ? T(' · tested ' + r.n + ' times, off by ' + num(r.mae) + u(s) + ' on average', ' · δοκιμάστηκε ' + r.n + ' φορές, λάθος ' + num(r.mae) + u(s) + ' κατά μέσο όρο') : T(' · too few saved hours to test', ' · πολύ λίγες αποθηκευμένες ώρες για δοκιμή'))))),
              b.rule !== 'last' && out.some((x) => x.r.n >= 3) ? h('p', { class: 'ws-fine' }, out.filter((x) => x.r.n >= 3).map(({ s, r }) => s.name + ': ' + (r.mae < r.same ? T('your rule beat "same as now" (' + num(r.same) + u(s) + ' off). ', 'ο κανόνας σου νίκησε το «ίδιο με τώρα» (λάθος ' + num(r.same) + u(s) + '). ') : T('"same as now" did as well or better (' + num(r.same) + u(s) + ' off). ', 'το «ίδιο με τώρα» τα πήγε το ίδιο ή καλύτερα (λάθος ' + num(r.same) + u(s) + '). '))).join('')) : null,
              fine('Rule: ' + RULE[b.rule][0] + ', ' + AHEAD[b.ahead][0] + ' (the dashed line). It was tested only on the saved day, so it says little about other days. It is not a weather forecast.', 'Κανόνας: ' + RULE[b.rule][1] + ', ' + AHEAD[b.ahead][1] + ' (η διακεκομμένη γραμμή). Δοκιμάστηκε μόνο στην αποθηκευμένη μέρα, άρα λέει λίγα για άλλες μέρες. Δεν είναι πρόγνωση καιρού.'));
          } else if (b.k === 'unusual') { const out = have.map((s) => ({ s, x: unusual(s.pts) })); out.forEach(({ s, x }) => x.list.forEach((z) => mark(s, z.t, 'odd'))); R.odd = out;
            res(b, out.some((o) => o.x.list.length) ? h('ul', { class: 'ws-list' }, out.flatMap(({ s, x }) => x.list.slice(-4).map((z) => h('li', null, s.name + ' · ' + SC.time(z.t) + ' · ' + num(z.v) + u(s) + T(' (middle value ' + num(x.mid) + ')', ' (μεσαία τιμή ' + num(x.mid) + ')'))))) : empty(out.every((o) => o.x.mid == null) ? 'Too few saved hours to say what is usual (6 are needed).' : 'No unusual hour found.', out.every((o) => o.x.mid == null) ? 'Πολύ λίγες αποθηκευμένες ώρες για να φανεί τι είναι συνηθισμένο (χρειάζονται 6).' : 'Δεν βρέθηκε ασυνήθιστη ώρα.'),
              fine('Rule: an hour is unusual when it is further from the middle value of its line than 3 times the usual distance. Unusual for this one saved day only. It can be a real event or a sensor fault.', 'Κανόνας: μια ώρα είναι ασυνήθιστη όταν απέχει από τη μεσαία τιμή της γραμμής της πάνω από 3 φορές τη συνηθισμένη απόσταση. Ασυνήθιστη μόνο για αυτή την αποθηκευμένη μέρα. Μπορεί να είναι πραγματικό γεγονός ή βλάβη αισθητήρα.'));
          } else if (b.k === 'pattern') {
            if (have.length < 2) res(b, empty('Add a second data block: a pattern needs two lines.', 'Πρόσθεσε δεύτερο κουτί δεδομένων: το μοτίβο θέλει δύο γραμμές.'));
            else { const x = together(have[0].pts, have[1].pts); R.pat = { x, A: have[0], B: have[1] };
              const say = x.n < 6 ? T('Too few hours in common to look for a pattern (6 are needed, there are ' + x.n + ').', 'Πολύ λίγες κοινές ώρες για να φανεί μοτίβο (χρειάζονται 6, υπάρχουν ' + x.n + ').') : x.r == null ? T('One of the lines did not change at all in these ' + x.n + ' hours, so there is no pattern to measure.', 'Μία από τις γραμμές δεν άλλαξε καθόλου σε αυτές τις ' + x.n + ' ώρες, άρα δεν υπάρχει μοτίβο να μετρηθεί.') : (Math.abs(x.r) >= 0.7 ? (x.r > 0 ? T('The two lines rose and fell together closely', 'Οι δύο γραμμές ανέβαιναν και κατέβαιναν μαζί, πολύ κοντά') : T('When one line rose the other fell, closely', 'Όταν η μία γραμμή ανέβαινε η άλλη κατέβαινε, πολύ κοντά')) : Math.abs(x.r) >= 0.4 ? (x.r > 0 ? T('The two lines moved together somewhat', 'Οι δύο γραμμές κινήθηκαν κάπως μαζί') : T('The two lines moved in opposite ways somewhat', 'Οι δύο γραμμές κινήθηκαν κάπως αντίθετα')) : T('The two lines did not clearly move together', 'Οι δύο γραμμές δεν κινήθηκαν ξεκάθαρα μαζί')) + T(' (r = ' + num(Math.round(x.r * 100) / 100) + ' over ' + x.n + ' hours).', ' (r = ' + num(Math.round(x.r * 100) / 100) + ' σε ' + x.n + ' ώρες).');
              R.pat.say = say; res(b, h('p', { class: 'ws-say' }, have[0].name + ' · ' + have[1].name + ': ' + say), fine('Rule: r runs from −1 (opposite) through 0 (no link) to 1 (together). Two lines can move together because of a third thing, like the time of day. This does not show that one causes the other.', 'Κανόνας: το r πηγαίνει από −1 (αντίθετα), μέσω του 0 (καμία σχέση), έως 1 (μαζί). Δύο γραμμές μπορεί να κινούνται μαζί εξαιτίας ενός τρίτου πράγματος, όπως η ώρα της μέρας. Αυτό δεν δείχνει ότι η μία προκαλεί την άλλη.')); }
          } else if (b.k === 'explain') R.explain = b;
        });
        R.have = have;
        const hours = [...new Set(have.flatMap((s) => s.pts.map((p) => p[0])))].sort((a, b) => a - b);
        R.hours = hours; R.at = hasK('hour') && hours.includes(ui.hour) ? ui.hour : hours[hours.length - 1];
        R.vis = have.filter((s) => !(hasK('lines') && ui.hidden.has(s.i)));
        R.val = (s) => { const p = s.pts.find((q) => q[0] === R.at); return p ? p[1] : null; };
        if (R.explain && have.length) {   // sentences from the numbers, by fixed rules
          const w = [], at = SC.time(R.at);
          const read = have.map((s) => [s, R.val(s)]).filter((x) => x[1] != null);
          if (read.length) w.push(T('At ' + at + ' ', 'Στις ' + at + ' ') + read.map(([s, v]) => s.name + T(' read ', ': ') + num(v) + u(s)).join(isEl() ? ', ' : ', and ') + '.');
          if (R.gap) { const g = R.gap.pts.find((p) => p[0] === R.at), x = g ? g[1] : R.gap.avg; w.push(T((g ? 'At that hour' : 'On average') + ' the reading of ' + R.gap.A.name + ' was ' + num(Math.abs(x)) + u(R.gap.A) + (x >= 0 ? ' above ' : ' below ') + 'that of ' + R.gap.B.name + '. The gap was largest at ' + SC.time(R.gap.top[0]) + '.', (g ? 'Εκείνη την ώρα: ' : 'Κατά μέσο όρο: ') + R.gap.A.name + ', ' + num(Math.abs(x)) + u(R.gap.A) + (x >= 0 ? ' πάνω από ' : ' κάτω από ') + R.gap.B.name + '. Η διαφορά ήταν μεγαλύτερη στις ' + SC.time(R.gap.top[0]) + '.')); }
          else have.forEach((s) => { if (s.pts.length < 3) return; const hi = s.pts.reduce((a, p) => (p[1] > a[1] ? p : a)), lo = s.pts.reduce((a, p) => (p[1] < a[1] ? p : a)); w.push(T(s.name + ' was highest at ' + SC.time(hi[0]) + ' (' + num(hi[1]) + u(s) + ') and lowest at ' + SC.time(lo[0]) + ' (' + num(lo[1]) + u(s) + ').', s.name + ': μέγιστο στις ' + SC.time(hi[0]) + ' (' + num(hi[1]) + u(s) + '), ελάχιστο στις ' + SC.time(lo[0]) + ' (' + num(lo[1]) + u(s) + ').')); });
          if (R.odd) { const n = R.odd.reduce((a, o) => a + o.x.list.length, 0); w.push(n ? T(n + (n === 1 ? ' hour was' : ' hours were') + ' marked as unusual for this day.', n + (n === 1 ? ' ώρα σημειώθηκε' : ' ώρες σημειώθηκαν') + ' ως ασυνήθιστες για αυτή τη μέρα.') : T('No hour was marked as unusual.', 'Καμία ώρα δεν σημειώθηκε ως ασυνήθιστη.')); }
          if (R.pat && R.pat.say) w.push(R.pat.say);
          w.push(T('This shows what was measured, not the reason for it.', 'Αυτό δείχνει τι μετρήθηκε, όχι τον λόγο.'));
          R.words = w;
        }
        return R;
      }

      // ---------- the finished tool ----------
      function lineChart(series, R) {
        const preds = R.preds.filter((p) => series.some((s) => s.i === p.i)), gap = R.gap && series.includes(R.gap.A) && series.includes(R.gap.B) ? R.gap : null;
        const all = series.flatMap((s) => s.pts).concat(preds.flatMap((p) => p.pts)); if (all.length < 2) return h('p', { class: 'ws-empty' }, T('Not enough saved hours to draw a line yet.', 'Δεν υπάρχουν ακόμη αρκετές αποθηκευμένες ώρες για γραμμή.'));
        const small = typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches, W = small ? 340 : 640, H = small ? 170 : 190, Lf = 40, Rt = 10, Tp = 10, B = 24, t0 = Math.min(...all.map((p) => p[0])), t1 = Math.max(...all.map((p) => p[0])), lo0 = Math.min(...all.map((p) => p[1])), hi0 = Math.max(...all.map((p) => p[1])), lo = hi0 > lo0 ? lo0 : lo0 - 1, hi = hi0 > lo0 ? hi0 : hi0 + 1, sp = hi - lo;
        const x = (t) => Lf + ((t - t0) / (t1 - t0 || 1)) * (W - Lf - Rt), y = (v) => Tp + (1 - (v - lo) / sp) * (H - Tp - B), at = (p) => x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1);
        const s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ws-chart', role: 'img', 'aria-label': T('Line chart of ', 'Γραμμικό γράφημα: ') + series.map((q) => q.name).join(', ') });
        [lo, (lo + hi) / 2, hi].forEach((v) => { s.append(sv('line', { x1: Lf, x2: W - Rt, y1: y(v), y2: y(v), stroke: 'rgba(255,255,255,.1)' })); const tx = sv('text', { x: Lf - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ws-ax' }); tx.textContent = num(v); s.append(tx); });
        [t0, (t0 + t1) / 2, t1].forEach((t, i) => { const tx = sv('text', { x: x(t), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle', class: 'ws-ax' }); tx.textContent = SC.time(Math.round(t / HOUR) * HOUR); s.append(tx); });
        if (gap && gap.pts.length > 1) { const m = new Map(gap.B.pts.map((p) => [p[0], p[1]])), top = gap.A.pts.filter((p) => m.has(p[0])); s.append(sv('polygon', { points: top.map(at).concat(top.slice().reverse().map((p) => at([p[0], m.get(p[0])]))).join(' '), fill: 'rgba(247,196,107,.2)', stroke: 'none' })); }
        if (hasK('hour') && R.at >= t0 && R.at <= t1) s.append(sv('line', { x1: x(R.at), x2: x(R.at), y1: Tp, y2: H - B, stroke: '#F29BC0', 'stroke-width': 1.5 }));
        series.forEach((q, n) => {
          s.append(sv('polyline', { points: q.pts.map(at).join(' '), fill: 'none', stroke: q.colour, 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-dasharray': n % 2 ? '9 5' : null }));
          (R.marks.get(q.i) || []).forEach((m) => { const p = q.pts.find((z) => z[0] === m.t); if (p) s.append(m.kind === 'odd' ? sv('rect', { x: x(p[0]) - 5, y: y(p[1]) - 5, width: 10, height: 10, fill: 'none', stroke: '#B79CFF', 'stroke-width': 2, transform: 'rotate(45 ' + x(p[0]) + ' ' + y(p[1]) + ')' }) : sv('circle', { cx: x(p[0]), cy: y(p[1]), r: 5.5, fill: 'none', stroke: '#fff', 'stroke-width': 1.8 })); });
          if (hasK('hour')) { const p = q.pts.find((z) => z[0] === R.at); if (p) s.append(sv('circle', { cx: x(p[0]), cy: y(p[1]), r: 4.5, fill: q.colour })); }
        });
        preds.forEach((p) => s.append(sv('polyline', { points: p.pts.map(at).join(' '), fill: 'none', stroke: p.colour, 'stroke-width': 2.2, 'stroke-dasharray': '3 4' })));
        return s;
      }
      const legend = (series) => h('p', { class: 'ws-leg' }, series.map((q) => h('span', null, h('i', { style: { background: q.colour } }), q.name + (q.unit ? ' (' + q.unit + ')' : ''))));
      const panel = (b, ...kids) => h('section', { class: 'ws-panel g-' + gOf(b), dataset: { k: b.k } }, h('h4', null, kn(b.k)), ...kids.filter(Boolean));
      function drawBody() {
        const R = run(), out = [], u = (s) => (s.unit ? ' ' + s.unit : '');
        R.ser.forEach((s) => {
          const msg = s.state === 'load' ? null : s.state === 'fail' ? T('could not be loaded. It is tried again in a moment.', 'δεν φορτώθηκε. Γίνεται νέα προσπάθεια σε λίγο.') : s.state === 'none' ? T('no layer has this measurement in this city right now.', 'κανένα στρώμα δεν έχει αυτή τη μέτρηση σε αυτή την πόλη τώρα.') : s.state === 'nosrc' ? T('this kind of layer does not measure it here. Try another layer in the data block.', 'αυτό το είδος στρώματος δεν το μετρά εδώ. Δοκίμασε άλλο στρώμα στο κουτί δεδομένων.') : !s.pts.length ? T('no saved readings yet.', 'δεν υπάρχουν ακόμη αποθηκευμένες μετρήσεις.') : null;
          if (msg) out.push(h('p', { class: 'ws-warn' }, vname(s.m) + ' · ' + cname(s.c) + ' · ' + L(SRC[s.b.g]) + ': ' + msg));
        });
        if (R.ser.some((s) => s.state === 'load')) out.push(h('p', { class: 'ws-empty' }, T('Loading the saved day…', 'Φόρτωση της αποθηκευμένης μέρας…')));
        const units = [...new Set(R.vis.map((s) => s.unit))];
        if (R.have.length) recipe.filter((b) => gOf(b) === 'show').forEach((b) => {
          if (!R.vis.length) { out.push(panel(b, h('p', { class: 'ws-empty' }, T('Every line is hidden. Tick one to see it.', 'Όλες οι γραμμές είναι κρυμμένες. Επίλεξε μία για να τη δεις.')))); return; }
          const when = h('p', { class: 'ws-fine' }, T('Hour starting ' + SC.time(R.at) + ', hourly average.', 'Ώρα που αρχίζει στις ' + SC.time(R.at) + ', ωριαίος μέσος όρος.'));
          if (b.k === 'line') out.push(panel(b, ...units.map((un) => lineChart(R.vis.filter((s) => s.unit === un), R)), legend(R.vis), units.length > 1 ? h('p', { class: 'ws-fine' }, T('The lines have different units, so each unit has its own chart.', 'Οι γραμμές έχουν διαφορετικές μονάδες, άρα κάθε μονάδα έχει δικό της γράφημα.')) : null, R.gap && R.vis.includes(R.gap.A) && R.vis.includes(R.gap.B) ? h('p', { class: 'ws-fine' }, T('The shaded band is the difference between the two lines.', 'Η σκιασμένη ζώνη είναι η διαφορά ανάμεσα στις δύο γραμμές.')) : null));
          else if (b.k === 'bars') out.push(panel(b, h('div', { class: 'ws-bars' }, R.vis.map((s) => { const v = R.val(s), mx = Math.max(...R.vis.filter((q) => q.unit === s.unit).map((q) => Math.abs(R.val(q) || 0))) || 1, bar = h('i'); bar.style.width = (v == null ? 0 : Math.max(3, Math.round((Math.abs(v) / mx) * 100))) + '%'; bar.style.background = s.colour; return h('div', null, h('span', null, s.name), bar, h('b', null, v == null ? '–' : num(v) + u(s))); })), when));
          else if (b.k === 'number') out.push(panel(b, h('div', { class: 'ws-nums' }, R.vis.map((s) => h('div', null, h('b', { style: { color: s.colour } }, R.val(s) == null ? '–' : num(R.val(s)) + u(s)), h('span', null, s.name))), R.gap ? h('div', null, h('b', { style: { color: '#F7C46B' } }, (() => { const g = R.gap.pts.find((p) => p[0] === R.at); return g ? (g[1] >= 0 ? '+' : '−') + num(Math.abs(g[1])) + u(R.gap.A) : '–'; })()), h('span', null, T('difference', 'διαφορά'))) : null), when));
          else if (b.k === 'table') { const i = R.hours.indexOf(R.at), times = R.hours.slice(Math.max(0, i - 7), i + 1); out.push(panel(b, h('div', { class: 'ws-tw' }, h('table', null, h('thead', null, h('tr', null, h('th', null, T('Hour', 'Ώρα')), R.vis.map((s) => h('th', null, s.name)), R.gap ? h('th', null, T('Difference', 'Διαφορά')) : null)), h('tbody', null, times.map((t) => h('tr', null, h('td', null, SC.time(t)), R.vis.map((s) => { const p = s.pts.find((z) => z[0] === t); return h('td', null, p ? num(p[1]) + u(s) : '–'); }), R.gap ? h('td', null, (() => { const g = R.gap.pts.find((p) => p[0] === t); return g ? (g[1] >= 0 ? '+' : '−') + num(Math.abs(g[1])) + u(R.gap.A) : '–'; })()) : null))))), h('p', { class: 'ws-fine' }, T('The ' + times.length + ' hours up to ' + SC.time(R.at) + ', hourly averages.', 'Οι ' + times.length + ' ώρες μέχρι τις ' + SC.time(R.at) + ', ωριαίοι μέσοι όροι.')))); }
        });
        if (R.have.length && !recipe.some((b) => gOf(b) === 'show')) out.push(h('p', { class: 'ws-empty' }, T('Add a Show block to see the lines.', 'Πρόσθεσε ένα κουτί Εμφάνισης για να δεις τις γραμμές.')));
        R.results.forEach((r) => out.push(panel(r.b, ...r.kids)));
        if (R.words.length) out.push(h('div', { class: 'ws-words' }, h('b', null, T('In words: ', 'Με λόγια: ')), R.words.join(' '), h('p', { class: 'ws-fine' }, T('These sentences are built from the numbers by fixed rules, not written by a person or by an AI helper.', 'Αυτές οι προτάσεις φτιάχνονται από τους αριθμούς με σταθερούς κανόνες, όχι από άνθρωπο ή βοηθό ΤΝ.'))));
        const got = R.ser.filter((s) => s.src);
        if (got.length) out.push(h('div', { class: 'ws-src' }, h('b', null, T('Where the data comes from', 'Από πού έρχονται τα δεδομένα')),
          h('ul', null, got.map((s) => h('li', null, vname(s.m) + ', ' + cname(s.c) + ': ' + s.srcName + (s.src.kindWord ? ' (' + L(s.src.kindWord) + ')' : '')))),
          R.hours.length ? h('p', null, T('Saved hours from ' + SC.dateTime(R.hours[0]) + ' to ' + SC.dateTime(R.hours[R.hours.length - 1]) + ', as hourly averages for the whole city.', 'Αποθηκευμένες ώρες από ' + SC.dateTime(R.hours[0]) + ' έως ' + SC.dateTime(R.hours[R.hours.length - 1]) + ', ως ωριαίοι μέσοι όροι για όλη την πόλη.')) : null));
        body.replaceChildren(...out);
        return R;
      }
      function drawTool() {
        if (!alive) return;
        const R = drawBody(), ms = [...new Set(R.eff.map((e) => vname(e.m)))], cs = [...new Set(R.eff.map((e) => cname(e.c)))];
        ttl.textContent = ms.join(', ') + ' · ' + cs.join(', ');
        const kids = [];
        if (hasK('city')) kids.push(h('label', { class: 'ws-c' }, h('span', null, T('City', 'Πόλη')), h('select', { dataset: { c: 'city' }, onchange: (e) => { ui.city = e.target.value; fetchAll(); drawTool(); } }, Object.keys(CITY).map((c) => h('option', { value: c, selected: c === (ui.city || R.eff[0].c) }, cname(c))))));
        if (hasK('measure')) { const st = store.get(R.eff[0].c + '|' + R.eff[0].m), av = st && st.state === 'ok' ? (st.r.variables || []).map((v) => v.id).filter((v) => has(VARS, v)) : Object.keys(VARS); if (!av.includes(R.eff[0].m)) av.unshift(R.eff[0].m);
          kids.push(h('label', { class: 'ws-c' }, h('span', null, T('Measure', 'Μέτρηση')), h('select', { dataset: { c: 'measure' }, onchange: (e) => { ui.m = e.target.value; fetchAll(); drawTool(); } }, av.map((m) => h('option', { value: m, selected: m === (ui.m || R.eff[0].m) }, vname(m)))))); }
        if (hasK('hour') && R.hours.length > 1) { const lab = h('b', null, SC.time(R.at)); kids.push(h('label', { class: 'ws-c ws-hr' }, h('span', null, T('Hour', 'Ώρα')), h('input', { type: 'range', min: '0', max: String(R.hours.length - 1), step: '1', value: String(R.hours.indexOf(R.at)), dataset: { c: 'hour' }, oninput: (e) => { ui.hour = R.hours[Number(e.target.value)]; lab.textContent = SC.time(ui.hour); drawBody(); } }), lab)); }
        if (hasK('lines')) kids.push(h('fieldset', { class: 'ws-c ws-ln' }, h('legend', null, T('Lines', 'Γραμμές')), R.have.map((s) => h('label', null, h('input', { type: 'checkbox', checked: !ui.hidden.has(s.i), onchange: (e) => { if (e.target.checked) ui.hidden.delete(s.i); else ui.hidden.add(s.i); drawBody(); } }), h('i', { style: { background: s.colour } }), s.name))));
        ctl.replaceChildren(...kids); ctl.hidden = !kids.length;
      }

      // ---------- the blocks ----------
      const sel = (label, value, opts, on) => h('label', { class: 'ws-row' }, h('span', null, label), h('select', { onchange: (e) => on(e.target.value) }, opts.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) }, t))));
      const sum = (b) => (b.k === 'data' ? vname(b.m) + ' · ' + cname(b.c) : b.k === 'keep' ? L(KEEP[b.w]) : b.k === 'predict' ? L(AHEAD[b.ahead]) : L(KIND[b.k].d));
      function boxEl(b, R) {
        const i = recipe.indexOf(b), g = gOf(b), isOpen = open === b, rows = [];
        if (isOpen) {
          const set = (key, v) => { snap(); b[key] = v; changed(); };
          if (b.k === 'data') { const s = R.ser.find((x) => x.b === b);
            rows.push(sel(T('Measure', 'Μέτρηση'), b.m, Object.keys(VARS).map((m) => [m, vname(m)]), (v) => { snap(); b.m = v; b.s = ''; changed(); }));
            rows.push(sel(T('City', 'Πόλη'), b.c, Object.keys(CITY).map((c) => [c, cname(c)]), (v) => { snap(); b.c = v; b.s = ''; changed(); }));
            rows.push(sel(T('Kind of layer', 'Είδος στρώματος'), b.g, Object.keys(SRC).map((x) => [x, L(SRC[x])]), (v) => { snap(); b.g = v; b.s = ''; changed(); }));
            if (s && s.options.length > 1) rows.push(sel(T('Layer', 'Στρώμα'), s.src ? s.src.source : '', s.options.map((o) => [o.source, (isEl() && o.nameEl) || o.name]), (v) => set('s', v)));
            if (hasK('city') || hasK('measure')) rows.push(h('p', { class: 'ws-d' }, T('The picker in the finished tool can change this while you use it.', 'Ο επιλογέας στο έτοιμο εργαλείο μπορεί να το αλλάξει όσο το χρησιμοποιείς.')));
          } else if (b.k === 'predict') { rows.push(sel(T('Rule', 'Κανόνας'), b.rule, Object.keys(RULE).map((k) => [k, L(RULE[k])]), (v) => set('rule', v))); rows.push(sel(T('How far', 'Πόσο μπροστά'), b.ahead, Object.keys(AHEAD).map((k) => [k, L(AHEAD[k])]), (v) => set('ahead', Number(v)))); }
          else if (b.k === 'keep') rows.push(sel(T('Keep', 'Κράτα'), b.w, Object.keys(KEEP).map((k) => [k, L(KEEP[k])]), (v) => set('w', v)));
          else rows.push(h('p', { class: 'ws-d' }, L(KIND[b.k].d) + '.'));
          rows.push(h('span', { class: 'ws-tools' },
            h('button', { type: 'button', 'aria-label': T('Move earlier: ', 'Πιο νωρίς: ') + kn(b.k), disabled: i < 1 || gOf(recipe[i - 1]) !== g, onclick: () => move(b, -1) }, '↑'),
            h('button', { type: 'button', 'aria-label': T('Move later: ', 'Πιο αργά: ') + kn(b.k), disabled: i >= recipe.length - 1 || gOf(recipe[i + 1]) !== g, onclick: () => move(b, 1) }, '↓'),
            h('button', { type: 'button', class: 'rm', 'aria-label': T('Remove: ', 'Αφαίρεση: ') + kn(b.k), onclick: () => remove(b) }, T('Remove', 'Αφαίρεση'))));
        }
        const s = b.k === 'data' ? R.ser.find((x) => x.b === b) : null;
        return h('div', { class: 'ws-box g-' + g + (isOpen ? ' open' : '') + (fresh === b ? ' fresh' : ''), dataset: { i: String(i), k: b.k }, draggable: 'true',
          ondragstart: (e) => { dragFrom = i; dragKind = null; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'box'); } catch (x) { /* ignore */ } }, ondragend: () => { dragFrom = -1; canvas.classList.remove('over'); },
          ondragover: (e) => { if (dragFrom >= 0 && dragFrom !== i && gOf(recipe[dragFrom]) === g) { e.preventDefault(); e.stopPropagation(); } },
          ondrop: (e) => { if (dragFrom >= 0 && dragFrom !== i && gOf(recipe[dragFrom]) === g) { e.preventDefault(); e.stopPropagation(); const m = recipe[dragFrom]; snap(); recipe.splice(dragFrom, 1); recipe.splice(i, 0, m); dragFrom = -1; changed(T('Moved: ', 'Μετακινήθηκε: ') + kn(m.k)); } } },
          h('button', { type: 'button', class: 'ws-bt', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { open = isOpen ? null : b; fresh = null; drawCanvas(); } },
            h('small', null, L(GROUP[g])), h('b', null, b.k === 'data' ? ((s && s.srcName) || L(SRC[b.g])) : kn(b.k)), h('em', null, sum(b))),
          fresh === b ? h('span', { class: 'ws-new' }, T('new', 'νέο')) : null, rows.length ? h('div', { class: 'ws-set' }, rows) : null);
      }
      function wires() {
        raf = 0; wire.replaceChildren(); if (!alive || getComputedStyle(wire).display === 'none') return;
        const r0 = flow.getBoundingClientRect(), el = (b) => flow.querySelector('.ws-box[data-i="' + recipe.indexOf(b) + '"]');
        const edge = (a, b, dash, upright) => { const A = el(a), B = el(b); if (!A || !B) return; const p = A.getBoundingClientRect(), q = B.getBoundingClientRect(); let d;
          if (!upright && q.left >= p.right - 4) { const x1 = p.right - r0.left, y1 = p.top + p.height / 2 - r0.top, x2 = q.left - r0.left, y2 = q.top + Math.min(q.height / 2, 34) - r0.top, mx = (x1 + x2) / 2; d = 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ',' + mx + ' ' + y2 + ',' + x2 + ' ' + y2; }
          else { const down = q.top >= p.bottom - 4, x1 = p.left + p.width / 2 - r0.left, y1 = (down ? p.bottom : p.top) - r0.top, x2 = q.left + q.width / 2 - r0.left, y2 = (down ? q.top : q.bottom) - r0.top, my = (y1 + y2) / 2; if (!down && q.bottom > p.top + 4) return; d = 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + my + ',' + x2 + ' ' + my + ',' + x2 + ' ' + y2; }
          wire.append(sv('path', { d, class: dash ? 'dash' : null })); };
        const by = (g) => recipe.filter((b) => gOf(b) === g), Dt = by('data'), P = by('process'), A = by('ai'), S = by('show'), I = by('interact');
        let heads = Dt; if (P.length) { Dt.forEach((d) => edge(d, P[0])); for (let i = 1; i < P.length; i++) edge(P[i - 1], P[i]); heads = [P[P.length - 1]]; }
        if (A.length) { heads.forEach((x) => A.forEach((a) => edge(x, a))); heads = A; }
        heads.forEach((x) => S.forEach((s) => edge(x, s)));
        I.forEach((b) => { if (b.k === 'city' || b.k === 'measure') Dt.forEach((d) => edge(b, d, true, true)); else if (S.length) edge(b, S[S.length - 1], true, true); });
      }
      const rewire = () => { if (!raf) raf = requestAnimationFrame(wires); };
      canvas.addEventListener('dragover', (e) => { if (dragKind) { e.preventDefault(); canvas.classList.add('over'); } });
      canvas.addEventListener('dragleave', (e) => { if (!canvas.contains(e.relatedTarget)) canvas.classList.remove('over'); });
      canvas.addEventListener('drop', (e) => { e.preventDefault(); canvas.classList.remove('over'); if (dragKind) add(dragKind[0], dragKind[1]); dragKind = null; });
      function drawCanvas() {
        const R = run(), col = (g, hint) => { const list = recipe.filter((b) => gOf(b) === g); return h('div', { class: 'ws-col g-' + g, role: 'group', 'aria-label': L(GROUP[g]) }, list.length ? list.map((b) => boxEl(b, R)) : h('p', { class: 'ws-hint' }, hint)); };
        flow.replaceChildren(wire, h('div', { class: 'ws-cols' }, col('data', ''), col('process', T('Process blocks go here', 'Εδώ μπαίνουν κουτιά Επεξεργασίας')), col('ai', T('AI model blocks go here', 'Εδώ μπαίνουν κουτιά Μοντέλων ΤΝ')), col('show', T('Show blocks go here', 'Εδώ μπαίνουν κουτιά Εμφάνισης'))),
          h('div', { class: 'ws-irow g-interact', role: 'group', 'aria-label': L(GROUP.interact) }, recipe.filter((b) => gOf(b) === 'interact').map((b) => boxEl(b, R)), recipe.some((b) => gOf(b) === 'interact') ? null : h('p', { class: 'ws-hint' }, T('Interact blocks go here: they give your tool controls', 'Εδώ μπαίνουν κουτιά Αλληλεπίδρασης: δίνουν χειριστήρια στο εργαλείο σου'))));
        canvas.replaceChildren(h('div', { class: 'ws-hd' }, h('span', { class: 'ws-n', 'aria-hidden': 'true' }, '2'), h('h2', null, T('How it works, in blocks', 'Πώς δουλεύει, με κουτιά')), h('em', null, T('Press a block to change it. Drag one onto another of its group to reorder.', 'Πάτησε ένα κουτί για να το αλλάξεις. Σύρε το πάνω σε άλλο της ομάδας του για αλλαγή σειράς.'))), flow,
          h('div', { class: 'ws-act' },
            h('button', { type: 'button', class: 'ws-btn quiet', dataset: { a: 'undo' }, disabled: !undo.length, onclick: back }, T('Undo', 'Αναίρεση')),
            h('button', { type: 'button', class: 'ws-btn quiet', dataset: { a: 'link' }, onclick: () => { const url = location.origin + '/#/workshop?r=' + pack(recipe); (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => SC.toast(T('Link copied. It reopens this tool.', 'Ο σύνδεσμος αντιγράφηκε. Ανοίγει ξανά αυτό το εργαλείο.'))).catch(() => SC.toast(T('Copy the address of this page: it holds your tool.', 'Αντίγραψε τη διεύθυνση αυτής της σελίδας: περιέχει το εργαλείο σου.'))); } }, T('Copy the link', 'Αντίγραψε τον σύνδεσμο')),
            h('span', { class: 'ws-count' }, T(recipe.length + ' of ' + MAX + ' blocks', recipe.length + ' από ' + MAX + ' κουτιά')),
            h('button', { type: 'button', class: 'ws-btn send', disabled: true, title: T('Coming next', 'Έρχεται') }, T('Send to my teacher (coming next)', 'Στείλε στον εκπαιδευτικό μου (έρχεται)'))),
          h('p', { class: 'ws-fine' }, T('Your tool is kept in this browser and in the link. Nothing is sent anywhere yet. A tool is a list of choices, never code.', 'Το εργαλείο σου μένει σε αυτό το πρόγραμμα περιήγησης και στον σύνδεσμο. Τίποτα δεν στέλνεται πουθενά ακόμη. Ένα εργαλείο είναι μια λίστα επιλογών, ποτέ κώδικας.')));
        rewire();
      }
      function drawShelf() {
        const item = (k, g, name, d) => h('button', { type: 'button', class: 'ws-pb', draggable: 'true', dataset: g ? { k, g } : { k }, title: d, onclick: () => add(k, g),
          ondragstart: (e) => { dragKind = [k, g]; dragFrom = -1; e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', k); } catch (x) { /* ignore */ } }, ondragend: () => { dragKind = null; canvas.classList.remove('over'); } }, h('span', null, name), h('i', { 'aria-hidden': 'true' }, '⠿'));
        shelf.replaceChildren(h('h2', null, T('Blocks', 'Κουτιά')), h('p', { class: 'ws-how' }, T('Drag a block onto the canvas, or press it to add it.', 'Σύρε ένα κουτί στον καμβά, ή πάτησέ το για να προστεθεί.')),
          ...ORDER.map((g) => h('div', { class: 'ws-pg g-' + g }, h('h3', null, L(GROUP[g])),
            g === 'data' ? ['own', 'official', 'model'].map((x) => item('data', x, L(SRC[x]), L(KIND.data.d))) : Object.keys(KIND).filter((k) => KIND[k].g === g).map((k) => item(k, null, kn(k), L(KIND[k].d))),
            g === 'ai' ? h('p', { class: 'ws-note' }, T('These are small maths models with their rule shown in the tool. None of them calls an outside AI.', 'Αυτά είναι μικρά μαθηματικά μοντέλα με τον κανόνα τους γραμμένο στο εργαλείο. Κανένα δεν καλεί εξωτερική ΤΝ.')) : null)),
          h('p', { class: 'ws-note' }, T('Coming next: a chat helper that places blocks for you, sending your tool to your teacher, the gallery, and a map of squares.', 'Έρχονται: βοηθός συνομιλίας που βάζει κουτιά για σένα, αποστολή του εργαλείου στον εκπαιδευτικό σου, η συλλογή, και χάρτης με τετράγωνα.')));
      }
      function drawIdeas() {
        ideas.replaceChildren(h('h2', null, T('Start from an idea', 'Ξεκίνα από μια ιδέα')), h('p', { class: 'ws-how' }, T('Press one and the whole tool is built. Then change any block.', 'Πάτησε μία και χτίζεται όλο το εργαλείο. Μετά άλλαξε όποιο κουτί θέλεις.')),
          ...IDEAS.map((x, n) => h('button', { type: 'button', class: 'ws-idea', dataset: { n: String(n) }, onclick: () => setTo(x.b, T('Built: ', 'Χτίστηκε: ') + L(x.q)) }, h('span', null, L(x.q)), h('small', null, L(x.s)))),
          h('button', { type: 'button', class: 'ws-idea blank', dataset: { n: 'blank' }, onclick: () => setTo([D('any', 'larnaka', 'temperature'), { k: 'line' }], T('Started again.', 'Ξεκίνησες από την αρχή.')) }, h('span', null, T('Start with almost nothing', 'Ξεκίνα σχεδόν από το μηδέν')), h('small', null, T('One data block and a line chart', 'Ένα κουτί δεδομένων και ένα γραμμικό γράφημα'))),
          h('p', { class: 'ws-note' }, T('Coming next: describe your own idea in a chat and the helper builds it from these same blocks.', 'Έρχεται: περιέγραψε τη δική σου ιδέα σε μια συνομιλία και ο βοηθός τη χτίζει με τα ίδια κουτιά.')));
      }
      function drawAll() { drawTool(); drawCanvas(); }

      const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(rewire) : null; if (ro) ro.observe(flow);
      drawIdeas(); drawShelf(); save(); fetchAll(); drawAll();
      timer = setInterval(() => { if (alive && !document.hidden) fetchAll(true); }, 120000);
      return () => { alive = false; clearInterval(timer); if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
    },
  });
})();
