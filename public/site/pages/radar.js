/*
  Event radar: stretches of the saved day where a measurement in a city moved unusually, or where sources started to differ.
    #/radar               the ranked list of events
    #/episode?e=<id>      one event hour by hour (pages/episode.js, which uses SC.radar from this file)
  Data, all of it already saved by the layers pulse (nothing new is measured or stored here):
    GET /layers/api/live                      names and kinds of the layers; "rivers" give the tolerance used for "sources differ"
    GET /layers/api/replay                    the saved day (used for any series the compare view does not hold right now)
    GET /layers/api/compare?city=&variable=   the per-source series of one measurement in one city
  The rule (printed on the page, see RULE below): the saved day is cut into hours. A source "moved unusually" in an hour when its hourly
  average changed by more than K times its own typical (median) hour-to-hour step, and by at least a small floor for that measurement.
  "Started to differ": the outdoor sources of one measurement were within the tolerance for two hours in a row and then further apart.
  Signals in the same city in the same or the next hour are grouped into one event. Grouped by time and place only: never proof of a cause.
  Ranking: 10 points for every KIND of source that took part (own sensors, official stations, models, satellites: /layers/api does not
  expose the brain's "independent" count, so distinct kinds are counted) plus up to 5 points for how recent it is.
  Only city-level numbers are used. No vehicle position is used anywhere.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/toolkit-b2.css');
  const HOUR = 3600000;
  const isEl = () => SC.lang === 'el';
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−').replace('.', isEl() ? ',' : '.');
  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const CITIES = Object.keys(CITY);
  const cityName = (c) => (CITY[c] || [c, c])[isEl() ? 1 : 0];

  /* ---------- the rule ---------- */
  const K = 3;                 // "more than K times the typical step"
  const AGREE_HOURS = 2;       // "started to differ" needs this many agreeing hours just before, so a spread sitting on the limit does not flicker
  const MIN_HOURS = 6;         // a series needs this many hourly values before it is judged
  // the smallest hour-to-hour change that counts for a measurement, so that tiny wiggles of a steady line are not called events
  const FLOOR = { temperature: 1, relative_humidity: 5, wind_speed: 2, pressure: 2, co2: 100, pm25: 10, pm10: 15, dust: 20, ozone: 20, sea_surface_temperature: 0.5, wave_height: 0.3 };
  const KIND_POINTS = 10, RECENT_POINTS = 5;
  const KIND = {
    own: ['own sensors', 'δικοί μας αισθητήρες', '#5EE0A8'],
    official: ['official stations', 'επίσημοι σταθμοί', '#FFC857'],
    model: ['models', 'μοντέλα', '#4CCBEA'],
    satellite: ['satellites', 'δορυφόροι', '#C9A1FF'],
  };
  const kindName = (k) => (KIND[k] || KIND.model)[isEl() ? 1 : 0];
  const kindOf = (group, kind) => (group === 'own' ? 'own' : group === 'official' ? 'official' : kind === 'satellite' ? 'satellite' : 'model');
  const VAR = { co2: ['Carbon dioxide', 'Διοξείδιο του άνθρακα'], temperature: ['Air temperature', 'Θερμοκρασία αέρα'], wind_speed: ['Wind speed', 'Ταχύτητα ανέμου'], sea_surface_temperature: ['Sea temperature', 'Θερμοκρασία θάλασσας'] };
  const ENV = { indoor: ['indoors', 'μέσα σε τάξη'], vehicle: ['inside a vehicle', 'μέσα σε όχημα'], outdoor: ['outdoors', 'έξω'] };
  const envName = (e) => (ENV[e] || ENV.outdoor)[isEl() ? 1 : 0];
  const envOfOwn = (source) => (source === 'sensecap-classrooms' ? 'indoor' : /^sensecap-/.test(source) ? 'vehicle' : 'outdoor');

  /* ---------- loading: every per-source series of the saved day ---------- */
  let last = null;
  async function load(force) {
    if (!force && last && Date.now() - last.at < 60000) return last;
    const [live, replay] = await Promise.all([SC.api('/layers/api/live').catch(() => null), SC.api('/layers/api/replay').catch(() => null)]);
    if (!live && !replay) throw new Error(T('The saved day could not be loaded. Try again in a moment.', 'Η αποθηκευμένη μέρα δεν φορτώθηκε. Δοκίμασε ξανά σε λίγο.'));
    const layerOf = (id) => ((live && live.layers) || []).find((l) => l.id === id) || null;
    const series = new Map();
    let failed = 0;
    const put = (s) => { const key = s.city + '|' + s.source + '|' + s.variable; if (!series.has(key) && s.points.length) series.set(key, s); };
    const take = (c, r) => {
      if (!r || !r.variable || !Array.isArray(r.series)) return;
      const meta = (r.variables || []).find((v) => v.id === r.variable) || {};
      r.series.forEach((s) => put({
        city: c, source: String(s.source), variable: String(r.variable), unit: s.unit || meta.unit || '', env: s.env || 'outdoor',
        label: Array.isArray(meta.label) ? meta.label : VAR[r.variable] || [r.variable, r.variable], name: [s.name || s.source, s.nameEl || s.name || s.source],
        kind: kindOf(s.group, s.kind), points: (s.points || []).filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])),
      }));
    };
    await Promise.all(CITIES.map(async (c) => {
      let first;
      try { first = await SC.api('/layers/api/compare?city=' + c); } catch (e) { failed++; return; }
      take(c, first);
      for (const v of (first.variables || []).map((x) => x.id).filter((id) => /^[a-z0-9_]+$/.test(id) && id !== first.variable)) {
        try { take(c, await SC.api('/layers/api/compare?city=' + c + '&variable=' + v)); } catch (e) { failed++; }
      }
    }));
    // what the compare view does not hold right now (a source that is quiet at this moment) but the saved day still has
    if (replay && Array.isArray(replay.times)) CITIES.forEach((c) => ['own', 'air', 'wind', 'sea'].forEach((k) => {
      const s = replay.cities && replay.cities[c] && replay.cities[c][k];
      if (!s || !Array.isArray(s.values)) return;
      const l = layerOf(s.source) || {};
      put({ city: c, source: s.source, variable: s.variable, unit: s.unit || '', env: envOfOwn(s.source), label: VAR[s.variable] || [s.variable, s.variable], name: [l.name || s.source, l.nameEl || l.name || s.source],
        kind: kindOf(l.group, l.kind), points: s.values.map((v, i) => [replay.times[i], v]).filter((p) => p[1] != null && isFinite(p[1]) && isFinite(p[0])) });
    }));
    last = { at: Date.now(), live, replay, series: [...series.values()], failed };
    return last;
  }

  /* ---------- the hours of the saved day ---------- */
  // clock hours when at least 6 hours were saved; a shorter log is cut into up to 24 equal parts (and the page says so)
  function plan(seriesList) {
    const times = new Set();
    seriesList.forEach((s) => s.points.forEach((p) => times.add(p[0])));
    if (times.size < 2) return { n: 0, hourly: false, width: 0, start: () => 0, index: () => -1, t0: null, t1: null };
    let t0 = Infinity, t1 = -Infinity;
    times.forEach((t) => { if (t < t0) t0 = t; if (t > t1) t1 = t; });
    if (t1 - t0 >= 6 * HOUR) {
      const k0 = Math.max(Math.floor(t0 / HOUR), Math.floor(t1 / HOUR) - 26), n = Math.floor(t1 / HOUR) - k0 + 1;
      return { n, hourly: true, width: HOUR, t0, t1, start: (i) => (k0 + i) * HOUR, index: (t) => Math.floor(t / HOUR) - k0 };
    }
    const n = Math.min(24, times.size), width = (t1 - t0) / n || 1;
    return { n, hourly: false, width, t0, t1, start: (i) => t0 + i * width, index: (t) => Math.min(n - 1, Math.floor((t - t0) / width)) };
  }
  function hourly(s, pl) {   // the average of a series in every hour, null where nothing was saved
    const sum = new Array(pl.n).fill(0), cnt = new Array(pl.n).fill(0);
    s.points.forEach(([t, v]) => { const i = pl.index(t); if (i >= 0 && i < pl.n) { sum[i] += v; cnt[i]++; } });
    return sum.map((x, i) => (cnt[i] ? x / cnt[i] : null));
  }
  const median = (a) => { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length ? (b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2) : 0; };

  /* ---------- detection: pure, from the loaded data ---------- */
  function detect(data) {
    const all = data.series, pl = plan(all), signals = [];
    all.forEach((s) => { s.hours = hourly(s, pl); });
    // 1. a source moved unusually against its own day
    let judged = 0;
    all.forEach((s) => {
      const hv = s.hours, steps = [];
      if (hv.filter((v) => v != null).length < MIN_HOURS) return;
      judged++;
      for (let i = 1; i < pl.n; i++) if (hv[i] != null && hv[i - 1] != null) steps.push([i, hv[i] - hv[i - 1]]);
      const typical = median(steps.map((x) => Math.abs(x[1]))), floor = FLOOR[s.variable];
      s.typical = typical;
      steps.forEach(([i, d]) => {
        const a = Math.abs(d);
        if (!(a > K * typical)) return;
        if (floor != null ? a < floor : !(typical > 0)) return;
        signals.push({ type: 'move', city: s.city, i, series: s, sources: [s], from: hv[i - 1], to: hv[i], step: d, typical });
      });
    });
    // 2. the outdoor sources of one measurement started to differ (the tolerance is the one the live view uses)
    ((data.live && data.live.rivers) || []).forEach((rv) => {
      Object.keys(rv.cities || {}).forEach((c) => {
        const tol = rv.cities[c] && rv.cities[c].tolerance;
        if (tol == null || !isFinite(tol)) return;
        const group = all.filter((s) => s.city === c && s.variable === rv.variable && s.env !== 'indoor');   // indoor readings are never compared with the street
        if (group.length < 2) return;
        let calm = 0;   // how many hours in a row the sources agreed just before this one
        for (let i = 0; i < pl.n; i++) {
          const have = group.filter((s) => s.hours[i] != null);
          if (have.length < 2) continue;
          const vals = have.map((s) => s.hours[i]), spread = Math.round((Math.max(...vals) - Math.min(...vals)) * 100) / 100, differ = spread > tol;
          if (differ && calm >= AGREE_HOURS) signals.push({ type: 'differ', city: c, i, variable: rv.variable, label: have[0].label, unit: have[0].unit, sources: have, spread, tolerance: tol, low: Math.min(...vals), high: Math.max(...vals) });
          calm = differ ? 0 : calm + 1;
        }
      });
    });
    // 3. the same city, the same or the next hour: one event
    const events = [];
    CITIES.concat([...new Set(signals.map((x) => x.city))].filter((c) => !CITIES.includes(c))).forEach((c) => {
      const mine = signals.filter((x) => x.city === c).sort((a, b) => a.i - b.i);
      let cur = null;
      mine.forEach((sg) => {
        if (!cur || sg.i - cur.i1 > 1) { cur = { city: c, i0: sg.i, i1: sg.i, signals: [] }; events.push(cur); }
        cur.i1 = Math.max(cur.i1, sg.i); cur.signals.push(sg);
      });
    });
    events.forEach((ev) => {
      const seen = new Map();   // source -> the hour it first took part
      ev.signals.forEach((sg) => sg.sources.forEach((s) => { if (!seen.has(s.source) || seen.get(s.source).i > sg.i) seen.set(s.source, { source: s.source, name: s.name, kind: s.kind, env: s.env, i: sg.i, t: pl.start(sg.i) }); }));
      ev.sources = [...seen.values()].sort((a, b) => a.i - b.i || a.source.localeCompare(b.source));
      ev.kinds = [...new Set(ev.sources.map((s) => s.kind))];
      ev.t0 = pl.start(ev.i0); ev.t1 = pl.start(ev.i1) + pl.width;
      ev.recency = pl.n > 1 ? ev.i1 / (pl.n - 1) : 1;
      ev.score = Math.round((KIND_POINTS * ev.kinds.length + RECENT_POINTS * ev.recency) * 10) / 10;
      ev.id = c2id(ev.city) + '-' + Math.round(ev.t0);
      ev.variables = [...new Map(ev.signals.map((sg) => [sg.type === 'move' ? sg.series.variable : sg.variable, sg.type === 'move' ? sg.series.label : sg.label])).values()];
    });
    events.sort((a, b) => b.score - a.score || b.t0 - a.t0 || a.city.localeCompare(b.city));
    return { plan: pl, events, signals, judged, total: all.length };
  }
  const c2id = (c) => String(c).replace(/[^a-z0-9]/gi, '');

  /* ---------- words ---------- */
  const lab = (l) => (Array.isArray(l) ? l[isEl() ? 1 : 0] || l[0] : String(l || ''));
  const u = (unit) => (unit ? ' ' + unit : '');
  function sayMove(sg) {
    const s = sg.series, up = sg.step > 0, a = Math.abs(sg.step);
    const how = sg.typical > 0 ? T(', about ' + num(a / sg.typical) + ' times its typical step of ' + num(sg.typical) + u(s.unit), ', περίπου ' + num(a / sg.typical) + ' φορές το συνηθισμένο της βήμα (' + num(sg.typical) + u(s.unit) + ')')
      : T(', after a steady day (its typical step was 0)', ', μετά από μια σταθερή μέρα (το συνηθισμένο της βήμα ήταν 0)');
    return lab(s.label) + (up ? T(' rose by ', ': ανέβηκε κατά ') : T(' fell by ', ': έπεσε κατά ')) + num(a) + u(s.unit) + ' (' + num(sg.from) + ' → ' + num(sg.to) + u(s.unit) + ')' + how;
  }
  const sayDiffer = (sg) => T('Sources started to differ on ' + lab(sg.label).toLowerCase() + ': from ' + num(sg.low) + ' to ' + num(sg.high) + u(sg.unit) + ', that is ' + num(sg.spread) + u(sg.unit) + ' apart (they count as agreeing within ' + num(sg.tolerance) + u(sg.unit) + ')',
    'Οι πηγές άρχισαν να διαφέρουν (' + lab(sg.label).toLowerCase() + '): από ' + num(sg.low) + ' έως ' + num(sg.high) + u(sg.unit) + ', δηλαδή διαφορά ' + num(sg.spread) + u(sg.unit) + ' (θεωρούμε ότι συμφωνούν μέχρι ' + num(sg.tolerance) + u(sg.unit) + ')');
  const span = (ev) => SC.dateTime(ev.t0) + '–' + SC.time(ev.t1);
  const CAUTION = () => T('Grouped by time and place only. That several sources moved in the same hour in the same city is not proof that they have the same cause.',
    'Ομαδοποιημένα μόνο κατά ώρα και τόπο. Το ότι πολλές πηγές κινήθηκαν την ίδια ώρα στην ίδια πόλη δεν αποδεικνύει ότι έχουν την ίδια αιτία.');
  const formula = (ev) => T('Score ' + num(ev.score) + ' = ' + ev.kinds.length + ' kind' + (ev.kinds.length === 1 ? '' : 's') + ' of source × ' + KIND_POINTS + ' + ' + num(RECENT_POINTS * ev.recency) + ' for how recent it is (0 for the oldest hour of the saved day, ' + RECENT_POINTS + ' for the newest).',
    'Βαθμός ' + num(ev.score) + ' = ' + ev.kinds.length + (ev.kinds.length === 1 ? ' είδος πηγής' : ' είδη πηγών') + ' × ' + KIND_POINTS + ' + ' + num(RECENT_POINTS * ev.recency) + ' για το πόσο πρόσφατο είναι (0 για την παλαιότερη ώρα της αποθηκευμένης μέρας, ' + RECENT_POINTS + ' για τη νεότερη).');

  SC.radar = { load, detect, plan, K, FLOOR, MIN_HOURS, AGREE_HOURS, KIND, kindName, envName, cityName, num, lab, sayMove, sayDiffer, span, CAUTION, formula, CITY };

  /* ---------- the dot line of one event: one dot per source at the hour it first took part ---------- */
  function dotLine(ev, pl) {
    const a = pl.start(ev.i0) - pl.width, b = pl.start(ev.i1) + 2 * pl.width, pc = (t) => ((t - a) / (b - a)) * 100;
    const byHour = new Map();
    ev.sources.forEach((s) => { if (!byHour.has(s.i)) byHour.set(s.i, []); byHour.get(s.i).push(s); });
    const line = h('div', { class: 'rd-line', 'aria-hidden': 'true' });
    byHour.forEach((list, i) => list.forEach((s, j) => line.append(h('i', { class: 'rd-dot', title: lab(s.name) + ' · ' + SC.time(s.t), style: { left: 'calc(' + pc(pl.start(i) + pl.width / 2).toFixed(1) + '% + ' + ((j - (list.length - 1) / 2) * 13).toFixed(1) + 'px)', background: (KIND[s.kind] || KIND.model)[2] } }))));
    line.append(h('small', { class: 'l' }, SC.time(a)), h('small', { class: 'r' }, SC.time(b)));
    const legend = h('ul', { class: 'rd-leg' }, ev.sources.map((s) => h('li', null, h('i', { style: { background: (KIND[s.kind] || KIND.model)[2] }, 'aria-hidden': 'true' }), lab(s.name) + ' (' + kindName(s.kind) + ') · ' + T('first at ', 'πρώτη φορά στις ') + SC.time(s.t))));
    return [line, legend];
  }

  /* ---------- the page ---------- */
  SC.register('radar', {
    title: ['Event radar', 'Ραντάρ γεγονότων'],
    render(root) {
      let dead = false, open = null, showAll = false, res = null, data = null, timer = 0;
      const top = h('div', { class: 't2-panel' });
      const list = h('div', { class: 'rd-list' });
      const aside = h('aside', { class: 't2-panel t2-side' });
      const empty = h('p', { class: 't2-empty', role: 'status' }, T('Loading the saved day…', 'Φόρτωση της αποθηκευμένης μέρας…'));
      const body = h('div', { class: 't2-body' }, h('div', { class: 't2-main' }, list), aside);
      body.hidden = true;
      root.append(SC.head({ title: T('Event radar', 'Ραντάρ γεγονότων'),
        lede: T('Moments of the saved day when a measurement in a city moved more than usual, or when sources stopped agreeing. Found only from saved readings, with the rule printed next to them.', 'Στιγμές της αποθηκευμένης μέρας που μια μέτρηση σε μια πόλη κινήθηκε περισσότερο από το συνηθισμένο, ή που οι πηγές σταμάτησαν να συμφωνούν. Βρίσκονται μόνο από αποθηκευμένες μετρήσεις, με τον κανόνα γραμμένο δίπλα.'),
        help: ['The saved day (about 24 hours of readings) is cut into hours. For every source the page looks at how much its hourly average changes from one hour to the next. A change much bigger than that source\'s own usual change is marked. Marks in the same city at the same time are put together into one event. This says WHEN something happened and WHO saw it, never WHY.',
          'Η αποθηκευμένη μέρα (περίπου 24 ώρες μετρήσεων) κόβεται σε ώρες. Για κάθε πηγή η σελίδα κοιτά πόσο αλλάζει ο ωριαίος μέσος όρος της από τη μία ώρα στην άλλη. Μια αλλαγή πολύ μεγαλύτερη από τη συνηθισμένη της ίδιας της πηγής σημειώνεται. Σημάδια στην ίδια πόλη την ίδια ώρα μπαίνουν μαζί σε ένα γεγονός. Αυτό λέει ΠΟΤΕ έγινε κάτι και ΠΟΙΟΣ το είδε, ποτέ ΓΙΑΤΙ.'] }),
        h('div', { class: 't2' }, top, empty, body));

      function card(ev, rank) {
        const isOpen = open === ev.id, pl = res.plan;
        const head = h('button', { type: 'button', class: 'rd-h', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { open = isOpen ? null : ev.id; draw(); } },
          h('span', { class: 'rd-r' }, String(rank)),
          h('span', { class: 'rd-t' }, h('b', null, cityName(ev.city) + ' · ' + span(ev)),
            h('small', null, T(ev.kinds.length + (ev.kinds.length === 1 ? ' kind of source' : ' kinds of source') + ' (' + ev.kinds.map(kindName).join(', ') + ') · ' + ev.sources.length + (ev.sources.length === 1 ? ' source' : ' sources'),
              ev.kinds.length + (ev.kinds.length === 1 ? ' είδος πηγής' : ' είδη πηγών') + ' (' + ev.kinds.map(kindName).join(', ') + ') · ' + ev.sources.length + (ev.sources.length === 1 ? ' πηγή' : ' πηγές')) + ' · ' + ev.variables.map(lab).join(', '))),
          h('span', { class: 'rd-s', title: T('Score: see the formula inside', 'Βαθμός: δες τον τύπο μέσα') }, T('score ', 'βαθμός ') + num(ev.score)));
        const more = isOpen ? h('div', { class: 'rd-more' },
          h('ul', { class: 'rd-what' }, ev.signals.map((sg) => h('li', null, h('b', null, SC.time(pl.start(sg.i)) + ' · ' + (sg.type === 'move' ? lab(sg.series.name) + ' (' + envName(sg.series.env) + ')' : sg.sources.map((s) => lab(s.name)).join(', '))), h('span', null, (sg.type === 'move' ? sayMove(sg) : sayDiffer(sg)) + '.')))),
          h('p', { class: 't2-why' }, formula(ev)),
          h('p', { class: 't2-warn' }, CAUTION()),
          h('a', { class: 't2-go', href: '#/episode?e=' + encodeURIComponent(ev.id) }, T('See how it unfolded, hour by hour', 'Δες πώς εξελίχθηκε, ώρα με την ώρα'))) : null;
        return h('article', { class: 'rd-c' + (isOpen ? ' open' : ''), dataset: { e: ev.id } }, head, dotLine(ev, pl), more);
      }

      function draw() {
        if (!res) return;
        const pl = res.plan, evs = res.events;
        top.replaceChildren(h('div', { class: 't2-head' },
          h('b', null, evs.length ? T(evs.length + (evs.length === 1 ? ' event' : ' events') + ' in the saved day', evs.length + (evs.length === 1 ? ' γεγονός' : ' γεγονότα') + ' στην αποθηκευμένη μέρα') : T('No events in the saved day', 'Κανένα γεγονός στην αποθηκευμένη μέρα')),
          h('span', { class: 't2-note' }, pl.n ? T('Saved readings from ' + SC.dateTime(pl.t0) + ' to ' + SC.dateTime(pl.t1) + ' · ' + res.total + ' series from the layers, ' + res.judged + ' long enough to judge', 'Αποθηκευμένες μετρήσεις από ' + SC.dateTime(pl.t0) + ' έως ' + SC.dateTime(pl.t1) + ' · ' + res.total + ' σειρές από τα στρώματα, ' + res.judged + ' αρκετά μεγάλες για να κριθούν') : '')),
          h('p', { class: 't2-warn' }, CAUTION()));
        const ok = pl.n >= 2;
        body.hidden = !ok; empty.hidden = ok;
        if (!ok) { empty.textContent = T('Nothing has been saved yet, so there is nothing to search. The log fills as the layers report. Come back in a little while.', 'Δεν έχει αποθηκευτεί τίποτα ακόμη, άρα δεν υπάρχει κάτι να ψάξουμε. Το αρχείο γεμίζει όσο αναφέρουν τα στρώματα. Έλα ξανά σε λίγο.'); return; }
        const shown = showAll ? evs : evs.slice(0, 8);
        list.replaceChildren(...(evs.length ? shown.map((ev, i) => card(ev, i + 1)) : [h('p', { class: 't2-empty rd-none', role: 'status' },
          T('No source moved more than the rule asks for, and no sources started to differ, in the saved day. That is a normal answer on a calm day. It does not mean nothing happened: only that nothing passed the rule on the right.', 'Καμία πηγή δεν κινήθηκε περισσότερο από όσο ζητά ο κανόνας, και καμία ομάδα πηγών δεν άρχισε να διαφέρει, στην αποθηκευμένη μέρα. Αυτή είναι μια φυσιολογική απάντηση για μια ήρεμη μέρα. Δεν σημαίνει ότι δεν έγινε τίποτα: μόνο ότι τίποτα δεν πέρασε τον κανόνα δεξιά.'))]));
        if (evs.length > shown.length) list.append(h('button', { type: 'button', class: 't2-go', onclick: () => { showAll = true; draw(); } }, T('Show all ' + evs.length + ' events', 'Δείξε και τα ' + evs.length + ' γεγονότα')));
        const p = (t) => h('p', { class: 't2-note' }, t);
        const units = new Map(data.series.map((s) => [s.variable, s]));
        const floors = [...units.values()].filter((s) => FLOOR[s.variable] != null).map((s) => lab(s.label).toLowerCase() + ' ' + num(FLOOR[s.variable]) + u(s.unit));
        aside.replaceChildren(
          h('b', null, T('The rule', 'Ο κανόνας')),
          p(pl.hourly ? T('The saved day is cut into clock hours and each source gets one average per hour.', 'Η αποθηκευμένη μέρα κόβεται σε ώρες του ρολογιού και κάθε πηγή παίρνει έναν μέσο όρο ανά ώρα.')
            : T('Less than 6 hours have been saved, so the log is cut into ' + pl.n + ' equal parts instead of clock hours. Read "hour" below as "part".', 'Έχουν αποθηκευτεί λιγότερες από 6 ώρες, άρα το αρχείο κόβεται σε ' + pl.n + ' ίσα κομμάτια αντί για ώρες. Όπου λέει «ώρα» πιο κάτω, διάβασε «κομμάτι».')),
          h('ol', { class: 't2-rule' },
            h('li', null, T('Moved unusually: a source\'s hourly average changed by more than ' + K + ' times its own typical step (the middle one of all its hour-to-hour changes in the saved day).', 'Κινήθηκε ασυνήθιστα: ο ωριαίος μέσος όρος μιας πηγής άλλαξε περισσότερο από ' + K + ' φορές το δικό της συνηθισμένο βήμα (το μεσαίο από όλες τις αλλαγές της από ώρα σε ώρα στην αποθηκευμένη μέρα).')),
            h('li', null, T('And the change was at least a small amount, so tiny wiggles do not count: ', 'Και η αλλαγή ήταν τουλάχιστον ένα μικρό ποσό, για να μη μετρούν τα μικρά τρεμοπαίγματα: ') + (floors.length ? floors.join(', ') : '–') + '.'),
            h('li', null, T('Started to differ: the sources of one measurement in a city (never indoor ones) agreed for ' + AGREE_HOURS + ' hours in a row and were then further apart than the tolerance (the same tolerance the Data layers page uses).', 'Άρχισαν να διαφέρουν: οι πηγές μιας μέτρησης σε μια πόλη (ποτέ οι εσωτερικές) συμφωνούσαν για ' + AGREE_HOURS + ' ώρες στη σειρά και μετά απείχαν περισσότερο από την ανοχή (την ίδια ανοχή που χρησιμοποιεί η σελίδα των στρωμάτων).')),
            h('li', null, T('Signals in the same city in the same or the next hour become one event. A source needs at least ' + MIN_HOURS + ' hours of saved values to be judged.', 'Σημάδια στην ίδια πόλη την ίδια ή την επόμενη ώρα γίνονται ένα γεγονός. Μια πηγή χρειάζεται τουλάχιστον ' + MIN_HOURS + ' ώρες αποθηκευμένων τιμών για να κριθεί.'))),
          h('b', null, T('How events are ordered', 'Πώς μπαίνουν σε σειρά')),
          p(T('Score = ' + KIND_POINTS + ' × the kinds of source that took part + up to ' + RECENT_POINTS + ' for how recent it is. The kinds are: own sensors, official stations, models, satellites. Two models count once, because they may share the same inputs. A high score means more kinds of source saw it, not that it matters more.',
            'Βαθμός = ' + KIND_POINTS + ' × τα είδη πηγών που συμμετείχαν + έως ' + RECENT_POINTS + ' για το πόσο πρόσφατο είναι. Τα είδη είναι: δικοί μας αισθητήρες, επίσημοι σταθμοί, μοντέλα, δορυφόροι. Δύο μοντέλα μετρούν μία φορά, γιατί μπορεί να έχουν τα ίδια δεδομένα εισόδου. Μεγάλος βαθμός σημαίνει ότι το είδαν περισσότερα είδη πηγών, όχι ότι είναι πιο σημαντικό.')),
          h('b', null, T('The dots', 'Οι τελείες')),
          h('ul', { class: 'rd-leg' }, Object.keys(KIND).map((k) => h('li', null, h('i', { style: { background: KIND[k][2] }, 'aria-hidden': 'true' }), kindName(k)))),
          p(T('One dot per source, placed at the hour it first took part. The names and times are written under every line.', 'Μία τελεία για κάθε πηγή, στην ώρα που συμμετείχε για πρώτη φορά. Τα ονόματα και οι ώρες γράφονται κάτω από κάθε γραμμή.')),
          h('b', null, T('What is missing', 'Τι λείπει')),
          p(T('Anything older than the saved day, any hour when a source was quiet, and the reason behind an event. Readings inside buses and cars are one number for the city, never a place.', 'Ό,τι είναι παλαιότερο από την αποθηκευμένη μέρα, κάθε ώρα που μια πηγή ήταν σιωπηλή, και ο λόγος πίσω από ένα γεγονός. Οι μετρήσεις μέσα σε λεωφορεία και αυτοκίνητα είναι ένας αριθμός για την πόλη, ποτέ ένα σημείο.')
            + (data.failed ? ' ' + T(data.failed + ' series could not be read this time.', data.failed + ' σειρές δεν διαβάστηκαν αυτή τη φορά.') : '')));
      }

      function refresh(force) {
        return load(force).then((d) => { if (dead) return; data = d; res = detect(d); draw(); })
          .catch((e) => { if (dead || res) return; body.hidden = true; empty.hidden = false; empty.replaceChildren(h('span', { class: 't2-err', role: 'alert' }, (e && e.message) || T('Something went wrong.', 'Κάτι πήγε στραβά.')), ' ', h('button', { type: 'button', class: 't2-go', onclick: () => refresh(true) }, T('Try again', 'Δοκίμασε ξανά'))); });
      }
      timer = setInterval(() => { if (!document.hidden && !dead) refresh(true); }, 300000);
      refresh(false);
      return () => { dead = true; clearInterval(timer); };
    },
  });
})();
