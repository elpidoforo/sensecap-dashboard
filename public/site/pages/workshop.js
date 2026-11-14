/*
  The workshop (#/workshop): students join boxes to make their own tool. First version.
  A tool is a short chain of boxes, saved as a list of choices (a "recipe"), never as code:
    DATA      one box, always first: what is measured, in which cities, over which part of the saved day
    ANALYZE   compare two cities, average / highest / lowest, change detector, do the sources agree
    PREDICT   my prediction: a simple rule, tested on the saved day before it is trusted
    VIEW      line chart, bars, big number, table
  Boxes are dragged from the palette onto the canvas (or added with a press, which is also the keyboard and touch way) and can be
  moved or removed. The preview runs the chain on real data: the saved day from GET /layers/api/replay and, for "do the sources agree",
  GET /layers/api/live. Each box that shows something gives one panel, in the order of the chain. Under the preview the tool is said in
  one plain sentence, with its sources and period.
  Nothing a student types is used: every setting is a choice from a list, so there is no free text to check and nothing to run.
  Drafts are kept in this browser (localStorage) and the recipe is also in the address (#/workshop?r=...), so a link reopens the tool.
  A recipe from the address or from storage is checked against the lists below and anything unknown is dropped.
  Not in this version (said on the page): sending a tool to a teacher for approval, the gallery, and data older than the saved day.
  Only city-level numbers are used. No vehicle position is read.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  const isEl = () => SC.lang === 'el';
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−').replace('.', isEl() ? ',' : '.');
  const HOUR = 3600000;
  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const cname = (c) => CITY[c][isEl() ? 1 : 0];
  const COL = ['#4CCBEA', '#F2A56B', '#5EE0A8', '#F0ABFC'];
  const MEAS = { air: ['Outdoor air temperature', 'Θερμοκρασία αέρα έξω'], wind: ['Wind', 'Άνεμος'], sea: ['Sea temperature', 'Θερμοκρασία θάλασσας'], own: ['Our own sensors', 'Οι δικοί μας αισθητήρες'] };
  const PERIOD = { all: ['the whole saved day', 'όλη η αποθηκευμένη μέρα', 0], h12: ['the last 12 hours', 'οι τελευταίες 12 ώρες', 12], h6: ['the last 6 hours', 'οι τελευταίες 6 ώρες', 6], h3: ['the last 3 hours', 'οι τελευταίες 3 ώρες', 3] };
  const RULE = { last: ['the same as the newest reading', 'ίδιο με την πιο πρόσφατη μέτρηση'], mean: ['the average of the last 3 hours', 'ο μέσος όρος των τελευταίων 3 ωρών'], line: ['a straight line through the last 3 hours', 'μια ευθεία γραμμή από τις τελευταίες 3 ώρες'] };
  const AHEAD = { 1: ['1 hour ahead', '1 ώρα μπροστά'], 3: ['3 hours ahead', '3 ώρες μπροστά'] };
  // every kind of box: section, name, and its settings (each a choice from a list)
  const KIND = {
    data: { sec: 'data', n: ['Data', 'Δεδομένα'], d: ['What is measured, where and when', 'Τι μετριέται, πού και πότε'] },
    compare: { sec: 'analyze', n: ['Compare two cities', 'Σύγκρινε δύο πόλεις'], d: ['The difference between the first two cities', 'Η διαφορά ανάμεσα στις δύο πρώτες πόλεις'] },
    stats: { sec: 'analyze', n: ['Average, highest, lowest', 'Μέσος όρος, μέγιστο, ελάχιστο'], d: ['Three numbers for each city', 'Τρεις αριθμοί για κάθε πόλη'] },
    change: { sec: 'analyze', n: ['Change detector', 'Ανιχνευτής αλλαγών'], d: ['Moments when the number jumped', 'Στιγμές που ο αριθμός άλλαξε απότομα'] },
    agree: { sec: 'analyze', n: ['Do the sources agree?', 'Συμφωνούν οι πηγές;'], d: ['Where several sources measure the same thing now', 'Όπου πολλές πηγές μετρούν το ίδιο πράγμα τώρα'] },
    predict: { sec: 'predict', n: ['My prediction', 'Η πρόβλεψή μου'], d: ['A simple rule, tested on the saved day', 'Ένας απλός κανόνας, δοκιμασμένος στην αποθηκευμένη μέρα'], set: { rule: RULE, ahead: AHEAD } },
    line: { sec: 'view', n: ['Line chart', 'Γραμμικό γράφημα'], d: ['The number over time', 'Ο αριθμός μέσα στον χρόνο'] },
    bars: { sec: 'view', n: ['Bars', 'Ράβδοι'], d: ['The newest number of each city', 'Ο πιο πρόσφατος αριθμός κάθε πόλης'] },
    number: { sec: 'view', n: ['Big number', 'Μεγάλος αριθμός'], d: ['The newest number, large', 'Ο πιο πρόσφατος αριθμός, μεγάλος'] },
    table: { sec: 'view', n: ['Table', 'Πίνακας'], d: ['The numbers hour by hour', 'Οι αριθμοί ώρα με την ώρα'] },
  };
  const SEC = { data: ['DATA', 'ΔΕΔΟΜΕΝΑ'], view: ['VIEW', 'ΠΡΟΒΟΛΗ'], analyze: ['ANALYZE', 'ΑΝΑΛΥΣΗ'], predict: ['PREDICT', 'ΠΡΟΒΛΕΨΗ'] };
  const MAX = 6, KEY = 'sc.workshop.draft.v1';
  const START = [{ k: 'data', m: 'air', c: ['larnaka', 'limassol'], p: 'all' }, { k: 'compare' }, { k: 'line' }];

  // ---------- the recipe: checked against the lists, anything else is dropped ----------
  function clean(raw) {
    if (!Array.isArray(raw)) return null;
    const out = [];
    raw.slice(0, MAX + 1).forEach((b) => {
      if (!b || typeof b !== 'object' || !Object.prototype.hasOwnProperty.call(KIND, b.k)) return;
      if (b.k === 'data') { if (out.length) return; const c = Array.isArray(b.c) ? [...new Set(b.c.filter((x) => Object.prototype.hasOwnProperty.call(CITY, x)))].slice(0, 4) : []; out.push({ k: 'data', m: Object.prototype.hasOwnProperty.call(MEAS, b.m) ? b.m : 'air', c: c.length ? c : ['larnaka'], p: Object.prototype.hasOwnProperty.call(PERIOD, b.p) ? b.p : 'all' }); return; }
      if (!out.length) return;
      if (b.k === 'predict') out.push({ k: 'predict', rule: Object.prototype.hasOwnProperty.call(RULE, b.rule) ? b.rule : 'last', ahead: b.ahead === 3 || b.ahead === '3' ? 3 : 1 });
      else out.push({ k: b.k });
    });
    return out.length && out[0].k === 'data' ? out.slice(0, MAX) : null;
  }
  const pack = (r) => { try { return btoa(unescape(encodeURIComponent(JSON.stringify(r)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (e) { return ''; } };
  const unpack = (s) => { try { return clean(JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')))))); } catch (e) { return null; } };

  // ---------- the sums (also used by the tests through SC.workshopMath) ----------
  // hourly points of one city: [[time, value], ...] from the replay answer, over the chosen part of the day
  function hourly(replay, city, key, hours) {
    const s = replay && replay.cities && replay.cities[city] ? replay.cities[city][key] : null, tt = (replay && replay.times) || [];
    if (!s || !tt.length) return { pts: [], unit: '', source: null, variable: null };
    const from = hours ? tt[tt.length - 1] - hours * HOUR : -Infinity, by = new Map();
    tt.forEach((t, i) => { const v = s.values[i]; if (t < from || v == null || !isFinite(v)) return; const k = Math.floor(t / HOUR); const o = by.get(k) || { n: 0, a: 0, t }; o.n++; o.a += v; o.t = t; by.set(k, o); });
    return { pts: [...by.values()].map((o) => [o.t, o.a / o.n]), unit: s.unit || '', source: s.source, variable: s.variable };
  }
  const median = (a) => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; };
  function jumps(pts) {   // a step more than 3 times the usual (median) step of this line, and never less than a tenth of its range
    const st = []; for (let i = 1; i < pts.length; i++) st.push(Math.abs(pts[i][1] - pts[i - 1][1]));
    const vals = pts.map((p) => p[1]), range = vals.length ? Math.max(...vals) - Math.min(...vals) : 0, usual = median(st) || 0, bar = Math.max(usual * 3, range * 0.1);
    const out = []; for (let i = 1; i < pts.length; i++) { const d = pts[i][1] - pts[i - 1][1]; if (bar > 0 && Math.abs(d) > bar) out.push({ t: pts[i][0], d }); }
    return { usual, bar, list: out };
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
  SC.workshopMath = { clean, pack, unpack, hourly, jumps, guess, backtest };

  SC.register('workshop', {
    title: ['Workshop', 'Εργαστήρι'],
    render(root) {
      SC.css('/site/pages/workshop.css');
      let alive = true, replay = null, live = null, failed = false, timer = 0, dragKind = null, dragFrom = -1;
      const fromUrl = unpack((location.hash.split('?r=')[1] || '').split('&')[0]);
      let recipe = fromUrl;
      if (!recipe) { try { recipe = clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { recipe = null; } }
      if (!recipe) recipe = clean(START);
      const kn = (k) => T(KIND[k].n[0], KIND[k].n[1]), secOf = (k) => KIND[k].sec;
      const said = h('p', { class: 'ws-sr', 'aria-live': 'polite' });
      const palette = h('div', { class: 'ws-pal ws-card' }), canvas = h('div', { class: 'ws-canvas ws-card' }), prev = h('div', { class: 'ws-prev ws-card' });
      root.replaceChildren(h('div', { class: 'ws' },
        SC.head({ title: T('Workshop', 'Εργαστήρι'), lede: T('Join boxes to make your own tool. The preview runs it on real data from the saved day.', 'Ένωσε κουτιά για να φτιάξεις το δικό σου εργαλείο. Η προεπισκόπηση το τρέχει σε πραγματικά δεδομένα από την αποθηκευμένη μέρα.') }),
        h('div', { class: 'ws-grid' }, palette, canvas, prev), said));

      const save = () => { try { localStorage.setItem(KEY, JSON.stringify(recipe)); } catch (e) { /* private window: the draft lives in the address only */ } try { history.replaceState(null, '', '#/workshop?r=' + pack(recipe)); } catch (e) { /* ignore */ } };
      const changed = (msg) => { recipe = clean(recipe) || clean(START); save(); drawCanvas(); drawPrev(); if (msg) said.textContent = msg; };
      function add(k, at) {
        if (k === 'data') return;
        if (recipe.length >= MAX) { SC.toast(T('A tool holds at most ' + MAX + ' boxes. Take one out first.', 'Ένα εργαλείο χωρά το πολύ ' + MAX + ' κουτιά. Βγάλε πρώτα ένα.')); return; }
        const b = k === 'predict' ? { k, rule: 'last', ahead: 1 } : { k };
        const i = at == null ? recipe.length : Math.max(1, Math.min(recipe.length, at));
        recipe.splice(i, 0, b); changed(T('Added: ', 'Προστέθηκε: ') + kn(k));
      }
      function move(i, to) { if (i < 1 || to < 1 || to >= recipe.length || i === to) return; const [b] = recipe.splice(i, 1); recipe.splice(to, 0, b); changed(T('Moved: ', 'Μετακινήθηκε: ') + kn(b.k)); }
      function remove(i) { if (i < 1) return; const [b] = recipe.splice(i, 1); changed(T('Removed: ', 'Αφαιρέθηκε: ') + kn(b.k)); }

      // ---------- the palette ----------
      function drawPalette() {
        const groups = ['analyze', 'predict', 'view'];
        palette.replaceChildren(h('p', { class: 'ws-how' }, T('Drag a box onto the canvas, or press it to add it at the end.', 'Σύρε ένα κουτί στον καμβά, ή πάτησέ το για να μπει στο τέλος.')),
          ...groups.map((g) => h('div', { class: 'ws-pg sec-' + g }, h('h3', null, T(SEC[g][0], SEC[g][1])),
            Object.keys(KIND).filter((k) => KIND[k].sec === g).map((k) => h('button', { type: 'button', class: 'ws-pb', draggable: 'true', dataset: { k }, title: T(KIND[k].d[0], KIND[k].d[1]),
              onclick: () => add(k), ondragstart: (e) => { dragKind = k; dragFrom = -1; e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', k); } catch (x) { /* ignore */ } }, ondragend: () => { dragKind = null; canvas.classList.remove('over'); } },
              h('span', null, kn(k)), h('i', { 'aria-hidden': 'true' }, '⠿'))))),
          h('p', { class: 'ws-note' }, T('Coming next: sending your tool to your teacher, the gallery of approved tools, and data older than the saved day.', 'Έρχονται: αποστολή του εργαλείου στον εκπαιδευτικό σου, η συλλογή με τα εγκεκριμένα εργαλεία, και δεδομένα παλαιότερα από την αποθηκευμένη μέρα.')));
      }

      // ---------- the canvas ----------
      const sel = (label, value, opts, on) => h('label', { class: 'ws-row' }, h('span', null, label), h('select', { onchange: (e) => on(e.target.value) }, opts.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) }, t))));
      function boxEl(b, i) {
        const sec = secOf(b.k), rows = [];
        if (b.k === 'data') {
          rows.push(sel(T('Measure', 'Μέτρηση'), b.m, Object.keys(MEAS).map((k) => [k, T(MEAS[k][0], MEAS[k][1])]), (v) => { b.m = v; changed(); }));
          rows.push(h('fieldset', { class: 'ws-row ws-cities' }, h('legend', null, T('Cities', 'Πόλεις')), Object.keys(CITY).map((c) => h('label', null, h('input', { type: 'checkbox', checked: b.c.includes(c), onchange: (e) => { b.c = Object.keys(CITY).filter((x) => (x === c ? e.target.checked : b.c.includes(x))); if (!b.c.length) b.c = [c]; changed(); } }), ' ' + cname(c)))));
          rows.push(sel(T('Period', 'Περίοδος'), b.p, Object.keys(PERIOD).map((k) => [k, T(PERIOD[k][0], PERIOD[k][1])]), (v) => { b.p = v; changed(); }));
        } else if (b.k === 'predict') {
          rows.push(sel(T('Rule', 'Κανόνας'), b.rule, Object.keys(RULE).map((k) => [k, T(RULE[k][0], RULE[k][1])]), (v) => { b.rule = v; changed(); }));
          rows.push(sel(T('How far', 'Πόσο μπροστά'), b.ahead, Object.keys(AHEAD).map((k) => [k, T(AHEAD[k][0], AHEAD[k][1])]), (v) => { b.ahead = Number(v); changed(); }));
        } else rows.push(h('p', { class: 'ws-d' }, T(KIND[b.k].d[0], KIND[b.k].d[1])));
        const tools = i > 0 ? h('span', { class: 'ws-tools' },
          h('button', { type: 'button', 'aria-label': T('Move earlier: ', 'Πιο νωρίς: ') + kn(b.k), disabled: i <= 1, onclick: () => move(i, i - 1) }, '↑'),
          h('button', { type: 'button', 'aria-label': T('Move later: ', 'Πιο αργά: ') + kn(b.k), disabled: i >= recipe.length - 1, onclick: () => move(i, i + 1) }, '↓'),
          h('button', { type: 'button', 'aria-label': T('Remove: ', 'Αφαίρεση: ') + kn(b.k), onclick: () => remove(i) }, '×')) : null;
        return h('div', { class: 'ws-box sec-' + sec, dataset: { i: String(i), k: b.k }, draggable: i > 0 ? 'true' : null,
          ondragstart: i > 0 ? (e) => { dragFrom = i; dragKind = null; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'box'); } catch (x) { /* ignore */ } } : null, ondragend: () => { dragFrom = -1; canvas.classList.remove('over'); } },
          h('div', { class: 'ws-bh' }, h('small', null, T(SEC[sec][0], SEC[sec][1])), tools), h('b', null, b.k === 'data' ? T(MEAS[b.m][0], MEAS[b.m][1]) : kn(b.k)), ...rows);
      }
      function dropIndex(e) { const boxes = [...canvas.querySelectorAll('.ws-box')]; for (let i = 0; i < boxes.length; i++) { const r = boxes[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) return Math.max(1, i); } return boxes.length; }
      canvas.addEventListener('dragover', (e) => { if (dragKind || dragFrom > 0) { e.preventDefault(); canvas.classList.add('over'); } });
      canvas.addEventListener('dragleave', (e) => { if (!canvas.contains(e.relatedTarget)) canvas.classList.remove('over'); });
      canvas.addEventListener('drop', (e) => { e.preventDefault(); canvas.classList.remove('over'); const at = dropIndex(e); if (dragKind) add(dragKind, at); else if (dragFrom > 0) move(dragFrom, Math.min(recipe.length - 1, at > dragFrom ? at - 1 : at)); dragKind = null; dragFrom = -1; });
      function drawCanvas() {
        canvas.replaceChildren(h('div', { class: 'ws-chain', role: 'list', 'aria-label': T('The boxes of your tool, in order', 'Τα κουτιά του εργαλείου σου, με τη σειρά') }, recipe.map((b, i) => [i ? h('span', { class: 'ws-ar', 'aria-hidden': 'true' }, '↓') : null, h('div', { role: 'listitem' }, boxEl(b, i))])),
          h('p', { class: 'ws-drop' }, recipe.length >= MAX ? T('The tool is full (' + MAX + ' boxes).', 'Το εργαλείο είναι γεμάτο (' + MAX + ' κουτιά).') : T('Drop the next box here', 'Άφησε το επόμενο κουτί εδώ')));
      }

      // ---------- the preview ----------
      function lineChart(series, extra) {   // series: [{ name, colour, pts }], extra: [{ colour, pts, dash }]
        const all = series.concat(extra || []).flatMap((s) => s.pts); if (all.length < 2) return h('p', { class: 'ws-empty' }, T('Not enough saved readings to draw a line yet.', 'Δεν υπάρχουν ακόμη αρκετές αποθηκευμένες μετρήσεις για γραμμή.'));
        const W = 320, H = 150, L = 34, R = 8, Tp = 10, B = 22, t0 = Math.min(...all.map((p) => p[0])), t1 = Math.max(...all.map((p) => p[0])), lo = Math.min(...all.map((p) => p[1])), hi = Math.max(...all.map((p) => p[1])), sp = hi - lo || 1;
        const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R), y = (v) => Tp + (1 - (v - lo) / sp) * (H - Tp - B);
        const s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ws-chart', role: 'img', 'aria-label': T('Line chart of ', 'Γραμμικό γράφημα: ') + series.map((q) => q.name).join(', ') });
        [lo, (lo + hi) / 2, hi].forEach((v) => { s.append(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'rgba(255,255,255,.1)' })); const tx = sv('text', { x: L - 5, y: y(v) + 4, 'text-anchor': 'end', class: 'ws-ax' }); tx.textContent = num(v); s.append(tx); });
        [t0, t1].forEach((t, i) => { const tx = sv('text', { x: i ? W - R : L, y: H - 6, 'text-anchor': i ? 'end' : 'start', class: 'ws-ax' }); tx.textContent = t1 - t0 > 20 * HOUR ? SC.dateTime(t) : SC.time(t); s.append(tx); });
        series.concat(extra || []).forEach((q) => { if (q.pts.length) s.append(sv('polyline', { points: q.pts.map((p) => x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join(' '), fill: 'none', stroke: q.colour, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-dasharray': q.dash ? '5 4' : null })); (q.marks || []).forEach((m) => s.append(sv('circle', { cx: x(m[0]), cy: y(m[1]), r: 4.5, fill: 'none', stroke: '#fff', 'stroke-width': 1.6 }))); });
        return s;
      }
      const legend = (series) => h('p', { class: 'ws-leg' }, series.map((q) => h('span', null, h('i', { style: { background: q.colour } }), q.name)));
      const panel = (sec, title, ...kids) => h('section', { class: 'ws-panel sec-' + sec }, h('h3', null, title), ...kids.filter(Boolean));
      function drawPrev() {
        const d = recipe[0], hours = PERIOD[d.p][2];
        const head = h('h2', null, T('Preview with real data', 'Προεπισκόπηση με πραγματικά δεδομένα'));
        if (failed && !replay) { prev.replaceChildren(head, h('p', { class: 'ws-empty' }, T('The saved day could not be loaded. It is tried again in a moment.', 'Η αποθηκευμένη μέρα δεν φορτώθηκε. Γίνεται νέα προσπάθεια σε λίγο.'))); return; }
        if (!replay) { prev.replaceChildren(head, h('p', { class: 'ws-empty' }, T('Loading the saved day…', 'Φόρτωση της αποθηκευμένης μέρας…'))); return; }
        const ser = d.c.map((c, i) => { const q = hourly(replay, c, d.m, hours); return { c, name: cname(c), colour: COL[i % COL.length], pts: q.pts, unit: q.unit, source: q.source, variable: q.variable }; });
        const have = ser.filter((q) => q.pts.length), unit = (have[0] && have[0].unit) || '', u = unit ? ' ' + unit : '';
        const mixed = d.m === 'own' && new Set(have.map((q) => q.variable)).size > 1;
        const srcName = (id) => { const l = live && (live.layers || []).find((x) => x.id === id); return l ? ((isEl() && l.nameEl) || l.name) : id; };
        const panels = [];
        if (!have.length) panels.push(h('p', { class: 'ws-empty' }, T('No saved readings for this choice. Try another measure, city or period.', 'Δεν υπάρχουν αποθηκευμένες μετρήσεις για αυτή την επιλογή. Δοκίμασε άλλη μέτρηση, πόλη ή περίοδο.')));
        if (mixed) panels.push(h('p', { class: 'ws-warn' }, T('Careful: in these cities our own sensors measure different things, so the lines cannot be compared.', 'Πρόσεξε: σε αυτές τις πόλεις οι δικοί μας αισθητήρες μετρούν διαφορετικά πράγματα, άρα οι γραμμές δεν συγκρίνονται.')));
        let predicted = null;
        if (have.length) recipe.slice(1).forEach((b) => {
          if (b.k === 'line') panels.push(panel('view', kn('line'), lineChart(have, predicted), legend(have)));
          else if (b.k === 'bars') { const mx = Math.max(...have.map((q) => Math.abs(q.pts[q.pts.length - 1][1]))) || 1; panels.push(panel('view', kn('bars'), h('div', { class: 'ws-bars' }, have.map((q) => { const v = q.pts[q.pts.length - 1][1], bar = h('i'); bar.style.width = Math.max(3, Math.round((Math.abs(v) / mx) * 100)) + '%'; bar.style.background = q.colour; return h('div', null, h('span', null, q.name), bar, h('b', null, num(v) + u)); })), h('p', { class: 'ws-fine' }, T('The newest saved hour of each city.', 'Η πιο πρόσφατη αποθηκευμένη ώρα κάθε πόλης.')))); }
          else if (b.k === 'number') panels.push(panel('view', kn('number'), h('div', { class: 'ws-nums' }, have.map((q) => h('div', null, h('b', { style: { color: q.colour } }, num(q.pts[q.pts.length - 1][1]) + u), h('span', null, q.name + ' · ' + SC.time(q.pts[q.pts.length - 1][0])))))));
          else if (b.k === 'table') { const times = [...new Set(have.flatMap((q) => q.pts.map((p) => p[0])))].sort((a, c) => a - c).slice(-8); panels.push(panel('view', kn('table'), h('div', { class: 'ws-tw' }, h('table', null, h('thead', null, h('tr', null, h('th', null, T('Hour', 'Ώρα')), have.map((q) => h('th', null, q.name)))), h('tbody', null, times.map((t) => h('tr', null, h('td', null, SC.time(t)), have.map((q) => { const p = q.pts.find((z) => z[0] === t); return h('td', null, p ? num(p[1]) + u : '–'); })))))), h('p', { class: 'ws-fine' }, T('The last ' + times.length + ' saved hours.', 'Οι τελευταίες ' + times.length + ' αποθηκευμένες ώρες.')))); }
          else if (b.k === 'stats') panels.push(panel('analyze', kn('stats'), h('div', { class: 'ws-tw' }, h('table', null, h('thead', null, h('tr', null, h('th', null, T('City', 'Πόλη')), h('th', null, T('Average', 'Μέσος όρος')), h('th', null, T('Highest', 'Μέγιστο')), h('th', null, T('Lowest', 'Ελάχιστο')))), h('tbody', null, have.map((q) => { const v = q.pts.map((p) => p[1]); return h('tr', null, h('td', null, q.name), h('td', null, num(v.reduce((a, c) => a + c, 0) / v.length) + u), h('td', null, num(Math.max(...v)) + u), h('td', null, num(Math.min(...v)) + u)); })))), h('p', { class: 'ws-fine' }, T('From hourly averages. A higher number is not a better city.', 'Από ωριαίους μέσους όρους. Μεγαλύτερος αριθμός δεν σημαίνει καλύτερη πόλη.'))));
          else if (b.k === 'compare') {
            if (have.length < 2) panels.push(panel('analyze', kn('compare'), h('p', { class: 'ws-empty' }, T('Choose two cities in the Data box.', 'Διάλεξε δύο πόλεις στο κουτί Δεδομένα.'))));
            else if (mixed) panels.push(panel('analyze', kn('compare'), h('p', { class: 'ws-empty' }, T('These two measure different things, so there is no difference to show.', 'Αυτές οι δύο μετρούν διαφορετικά πράγματα, άρα δεν υπάρχει διαφορά να φανεί.'))));
            else { const A = have[0], Bq = have[1], mB = new Map(Bq.pts.map((p) => [Math.floor(p[0] / HOUR), p[1]])), diff = A.pts.map((p) => [p[0], mB.has(Math.floor(p[0] / HOUR)) ? p[1] - mB.get(Math.floor(p[0] / HOUR)) : null]).filter((p) => p[1] != null);
              const avg = diff.length ? diff.reduce((a, p) => a + p[1], 0) / diff.length : null;
              panels.push(panel('analyze', kn('compare'), lineChart([{ name: A.name + ' − ' + Bq.name, colour: '#F7C46B', pts: diff }]), h('p', { class: 'ws-fine' }, avg == null ? T('The two cities have no saved hour in common.', 'Οι δύο πόλεις δεν έχουν κοινή αποθηκευμένη ώρα.') : T('On average ' + A.name + ' was ' + num(Math.abs(avg)) + u + (avg >= 0 ? ' higher' : ' lower') + ' than ' + Bq.name + ' over ' + diff.length + ' hours. ', 'Κατά μέσο όρο η πόλη ' + A.name + ' ήταν ' + num(Math.abs(avg)) + u + (avg >= 0 ? ' πιο ψηλά' : ' πιο χαμηλά') + ' από ' + Bq.name + ' σε ' + diff.length + ' ώρες. ') + (A.source !== Bq.source ? T('They are read by different layers, so part of the gap may be the instruments.', 'Μετρώνται από διαφορετικά στρώματα, άρα μέρος της διαφοράς μπορεί να είναι τα όργανα.') : '')))); }
          } else if (b.k === 'change') {
            const found = have.map((q) => ({ q, j: jumps(q.pts) }));
            panels.push(panel('analyze', kn('change'), lineChart(have.map((q, i) => ({ ...q, marks: found[i].j.list.map((z) => [z.t, q.pts.find((p) => p[0] === z.t)[1]]) }))),
              h('ul', { class: 'ws-list' }, found.flatMap(({ q, j }) => j.list.slice(-3).map((z) => h('li', null, q.name + ' · ' + SC.time(z.t) + ' · ' + (z.d > 0 ? '+' : '−') + num(Math.abs(z.d)) + u)))),
              found.every((f) => !f.j.list.length) ? h('p', { class: 'ws-fine' }, T('No jump found in this period.', 'Δεν βρέθηκε απότομη αλλαγή σε αυτή την περίοδο.')) : null,
              h('p', { class: 'ws-fine' }, T('Rule: a change from one hour to the next that is more than 3 times the usual change of that line, and at least a tenth of its range. A jump is a moment to look at, not proof that something happened.', 'Κανόνας: αλλαγή από τη μία ώρα στην επόμενη πάνω από 3 φορές τη συνηθισμένη αλλαγή αυτής της γραμμής, και τουλάχιστον το ένα δέκατο του εύρους της. Μια απότομη αλλαγή είναι στιγμή για να κοιτάξεις, όχι απόδειξη ότι κάτι έγινε.'))));
          } else if (b.k === 'agree') {
            const rv = live && (live.rivers || []).find((r) => have.some((q) => q.variable === r.variable));
            panels.push(panel('analyze', kn('agree'), !live ? h('p', { class: 'ws-empty' }, T('The live layers have not answered yet.', 'Τα ζωντανά στρώματα δεν έχουν απαντήσει ακόμη.')) : !rv ? h('p', { class: 'ws-empty' }, T('Right now only one source measures this, so there is nothing to compare.', 'Αυτή τη στιγμή μόνο μία πηγή το μετρά, άρα δεν υπάρχει κάτι να συγκριθεί.'))
              : h('ul', { class: 'ws-list' }, d.c.map((c) => { const x = rv.cities && rv.cities[c]; return h('li', null, cname(c) + ': ' + (!x ? T('one source or none', 'μία πηγή ή καμία') : x.state === 'agree' ? T('the sources agree', 'οι πηγές συμφωνούν') : x.state === 'differ' ? T('the sources differ', 'οι πηγές διαφέρουν') : T('cannot be judged', 'δεν μπορεί να κριθεί'))); })),
              h('p', { class: 'ws-fine' }, T('From the live layers now, not from the saved day. "Differ" is a good place to ask why.', 'Από τα ζωντανά στρώματα τώρα, όχι από την αποθηκευμένη μέρα. Το «διαφέρουν» είναι καλό σημείο για να ρωτήσεις γιατί.'))));
          } else if (b.k === 'predict') {
            const res = have.map((q) => ({ q, r: backtest(q.pts, b.rule, b.ahead) }));
            predicted = res.filter((x) => x.r.next != null).map(({ q, r }) => ({ colour: q.colour, dash: true, pts: [q.pts[q.pts.length - 1], [q.pts[q.pts.length - 1][0] + b.ahead * HOUR, r.next]] }));
            panels.push(panel('predict', kn('predict'), lineChart(have, predicted),
              h('ul', { class: 'ws-list' }, res.map(({ q, r }) => h('li', null, q.name + ': ' + (r.next == null ? '–' : num(r.next) + u) + (r.n >= 3 ? T(' · tested ' + r.n + ' times, off by ' + num(r.mae) + u + ' on average', ' · δοκιμάστηκε ' + r.n + ' φορές, λάθος ' + num(r.mae) + u + ' κατά μέσο όρο') : T(' · too few saved hours to test', ' · πολύ λίγες αποθηκευμένες ώρες για δοκιμή'))))),
              b.rule !== 'last' && res.some((x) => x.r.n >= 3) ? h('p', { class: 'ws-fine' }, res.filter((x) => x.r.n >= 3).map(({ q, r }) => q.name + ': ' + (r.mae < r.same ? T('your rule beat "same as now" (' + num(r.same) + u + ' off). ', 'ο κανόνας σου νίκησε το «ίδιο με τώρα» (λάθος ' + num(r.same) + u + '). ') : T('"same as now" did as well or better (' + num(r.same) + u + ' off). ', 'το «ίδιο με τώρα» τα πήγε το ίδιο ή καλύτερα (λάθος ' + num(r.same) + u + '). '))).join('')) : null,
              h('p', { class: 'ws-fine' }, T('The dashed line is your prediction for ' + T(AHEAD[b.ahead][0], AHEAD[b.ahead][1]) + '. It was tested only on the saved day, so it says little about other days. It is not a weather forecast.', 'Η διακεκομμένη γραμμή είναι η πρόβλεψή σου για ' + T(AHEAD[b.ahead][0], AHEAD[b.ahead][1]) + '. Δοκιμάστηκε μόνο στην αποθηκευμένη μέρα, άρα λέει λίγα για άλλες μέρες. Δεν είναι πρόγνωση καιρού.'))));
          }
        });
        if (have.length && recipe.length < 2) panels.push(h('p', { class: 'ws-empty' }, T('Add a View, Analyze or Predict box to see something.', 'Πρόσθεσε ένα κουτί Προβολής, Ανάλυσης ή Πρόβλεψης για να δεις κάτι.')));
        // the tool in one sentence, and where the data comes from
        const parts = recipe.slice(1).map((b) => (b.k === 'predict' ? T('predict ' + AHEAD[b.ahead][0] + ' as ' + RULE[b.rule][0], 'πρόβλεψε ' + AHEAD[b.ahead][1] + ' ως ' + RULE[b.rule][1]) : T({ compare: 'show the difference between the first two cities', stats: 'give the average, highest and lowest', change: 'mark the moments it jumped', agree: 'say whether the sources agree now', line: 'draw a line chart', bars: 'draw bars of the newest numbers', number: 'show the newest number large', table: 'list the numbers hour by hour' }[b.k], { compare: 'δείξε τη διαφορά ανάμεσα στις δύο πρώτες πόλεις', stats: 'δώσε τον μέσο όρο, το μέγιστο και το ελάχιστο', change: 'σημείωσε τις στιγμές που άλλαξε απότομα', agree: 'πες αν οι πηγές συμφωνούν τώρα', line: 'σχεδίασε γραμμικό γράφημα', bars: 'σχεδίασε ράβδους με τους πιο πρόσφατους αριθμούς', number: 'δείξε μεγάλο τον πιο πρόσφατο αριθμό', table: 'γράψε τους αριθμούς ώρα με την ώρα' }[b.k])));
        const sentence = T('Take ' + MEAS[d.m][0].toLowerCase() + ' in ' + d.c.map(cname).join(', ') + ' over ' + PERIOD[d.p][0] + (parts.length ? ', then ' + parts.join(', then ') : '') + '.', 'Πάρε: ' + MEAS[d.m][1].toLowerCase() + ', σε ' + d.c.map(cname).join(', ') + ', για: ' + PERIOD[d.p][1] + (parts.length ? '. Μετά ' + parts.join(', μετά ') : '') + '.');
        const tt = replay.times || [], span = tt.length ? tt[tt.length - 1] - tt[0] : 0;
        prev.replaceChildren(head, ...panels,
          h('div', { class: 'ws-words' }, h('b', null, T('In words: ', 'Με λόγια: ')), sentence),
          h('div', { class: 'ws-src' }, h('b', null, T('Where the data comes from', 'Από πού έρχονται τα δεδομένα')),
            h('ul', null, have.map((q) => h('li', null, q.name + ': ' + srcName(q.source) + (d.m === 'own' && q.variable ? ' (' + String(q.variable).replace(/_/g, ' ') + ')' : '')))),
            h('p', null, tt.length ? T('Saved readings from ' + SC.dateTime(tt[0]) + ' to ' + SC.dateTime(tt[tt.length - 1]) + ', turned into hourly averages.', 'Αποθηκευμένες μετρήσεις από ' + SC.dateTime(tt[0]) + ' έως ' + SC.dateTime(tt[tt.length - 1]) + ', σε ωριαίους μέσους όρους.') + (span < 20 * HOUR ? T(' The log is still filling, so the day is not complete.', ' Το αρχείο γεμίζει ακόμη, άρα η μέρα δεν είναι ολόκληρη.') : '') : '')),
          h('div', { class: 'ws-act' },
            h('button', { type: 'button', class: 'ws-btn', onclick: () => { const url = location.origin + '/#/workshop?r=' + pack(recipe); (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => SC.toast(T('Link copied. It reopens this tool.', 'Ο σύνδεσμος αντιγράφηκε. Ανοίγει ξανά αυτό το εργαλείο.'))).catch(() => SC.toast(T('Copy the address of this page: it holds your tool.', 'Αντίγραψε τη διεύθυνση αυτής της σελίδας: περιέχει το εργαλείο σου.'))); } }, T('Copy the link to this tool', 'Αντίγραψε τον σύνδεσμο του εργαλείου')),
            h('button', { type: 'button', class: 'ws-btn quiet', onclick: () => { recipe = clean(START); changed(T('Started again.', 'Ξεκίνησες από την αρχή.')); } }, T('Start again', 'Από την αρχή')),
            h('button', { type: 'button', class: 'ws-btn send', disabled: true, title: T('Coming next', 'Έρχεται') }, T('Send to my teacher (coming next)', 'Στείλε στον εκπαιδευτικό μου (έρχεται)'))),
          h('p', { class: 'ws-fine' }, T('Your tool is kept in this browser and in the link. Nothing is sent anywhere yet. A tool is a list of choices, never code.', 'Το εργαλείο σου μένει σε αυτό το πρόγραμμα περιήγησης και στον σύνδεσμο. Τίποτα δεν στέλνεται πουθενά ακόμη. Ένα εργαλείο είναι μια λίστα επιλογών, ποτέ κώδικας.')));
      }

      function load() {
        if (!alive || document.hidden) return;
        Promise.all([SC.api('/layers/api/replay'), SC.api('/layers/api/live').catch(() => null)]).then(([r, l]) => { if (!alive) return; replay = r; if (l) live = l; failed = false; drawPrev(); }).catch(() => { if (!alive) return; failed = true; drawPrev(); });
      }
      drawPalette(); drawCanvas(); drawPrev(); save(); load(); timer = setInterval(load, 120000);
      return () => { alive = false; clearInterval(timer); };
    },
  });
})();
