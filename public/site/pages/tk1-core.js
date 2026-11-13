/*
  Toolkit, batch 1: what the five pages share (changed, versus, school360, bubbles, toolkit). Loaded by each of them, once.
  Everything here reads data the platform already has:
    GET /layers/api/live     the layers, the newest rows of each city, and "rivers" (a measurement that several sources share)
    GET /layers/api/replay   the saved day (at most 26 hours): per city own, air, wind, sea
    GET /api/devices         the sensors (only counts are ever used; a position is never read)
  Nothing is saved, nothing is sent anywhere. The sums (SC.tk1.stats, gaps) are plain functions, checked by tests/toolkit/batch1_test.js.
  Text is built with SC.el only: no markup from data.
*/
(function () {
  'use strict';
  const SC = window.SC;
  if (SC.tk1) return;
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  const isEl = () => SC.lang === 'el';
  const HOUR = 3600000, MIN = 60000;

  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const CITY_IDS = Object.keys(CITY);
  const cityName = (c) => (CITY[c] || [c, c])[isEl() ? 1 : 0];
  // The four schools. re: how a sensor's group or name says which school it belongs to (the same rule as the home page).
  const SCHOOLS = [
    { id: 'lefkosia', city: 'lefkosia', n: ['PASCAL Lefkosia', 'PASCAL Λευκωσία'], re: /lefkos|nicosia|λευκωσ/i },
    { id: 'larnaka', city: 'larnaka', n: ['PASCAL Larnaka', 'PASCAL Λάρνακα'], re: /larnak|larnac|λάρνακ/i },
    { id: 'limassol', city: 'limassol', n: ['PASCAL Limassol', 'PASCAL Λεμεσός'], re: /limass|lemes|λεμεσ/i },
    { id: 'paphos', city: 'paphos', n: ['International School of Paphos', 'Διεθνές Σχολείο Πάφου'], re: /paph|pafos|πάφ|παφ/i },
  ];
  const schoolOf = (d) => { for (const txt of [d.group, d.name]) for (const s of SCHOOLS) if (s.re.test(txt || '')) return s.id; return null; };

  // the four lines the saved day keeps for each city: key in the replay answer, name (en, el)
  const MEAS = [
    ['air', 'Outdoor air temperature', 'Θερμοκρασία αέρα έξω'],
    ['wind', 'Wind', 'Άνεμος'],
    ['sea', 'Sea', 'Θάλασσα'],
    ['own', 'Our own sensors', 'Οι δικοί μας αισθητήρες'],
  ];
  const measName = (k) => { const m = MEAS.find((x) => x[0] === k); return m ? T(m[1], m[2]) : k; };
  // names of the measurements, as the platform's vocabulary has them
  const VARS = {
    temperature: ['Air temperature', 'Θερμοκρασία αέρα'], relative_humidity: ['Relative humidity', 'Σχετική υγρασία'], pressure: ['Air pressure', 'Ατμοσφαιρική πίεση'],
    co2: ['Carbon dioxide', 'Διοξείδιο του άνθρακα'], pm25: ['PM2.5 particles', 'Σωματίδια PM2.5'], pm10: ['PM10 particles', 'Σωματίδια PM10'], dust: ['Dust (model)', 'Σκόνη (μοντέλο)'],
    ozone: ['Ozone', 'Όζον'], aerosol_optical_depth: ['Haze (aerosol optical depth)', 'Θολούρα (οπτικό βάθος αερολυμάτων)'], uv_index: ['UV index', 'Δείκτης UV'],
    nitrogen_dioxide: ['Nitrogen dioxide (NO2) near the ground', 'Διοξείδιο του αζώτου (NO2) κοντά στο έδαφος'], sulphur_dioxide: ['Sulphur dioxide (SO2) near the ground', 'Διοξείδιο του θείου (SO2) κοντά στο έδαφος'],
    carbon_monoxide: ['Carbon monoxide (CO) near the ground', 'Μονοξείδιο του άνθρακα (CO) κοντά στο έδαφος'], noise: ['Noise', 'Θόρυβος'], light: ['Light', 'Φως'],
    solar_irradiance: ['Sunlight power on the ground', 'Ισχύς ηλιακού φωτός στο έδαφος'], wind_speed: ['Wind speed', 'Ταχύτητα ανέμου'],
    sea_surface_temperature: ['Sea surface temperature', 'Θερμοκρασία επιφάνειας θάλασσας'], wave_height: ['Wave height', 'Ύψος κύματος'], chlorophyll_a: ['Sea chlorophyll-a (algae)', 'Χλωροφύλλη-a θάλασσας (φύκια)'],
  };
  function varName(v, live) {
    const r = live && (live.rivers || []).find((x) => x.variable === v);
    const lab = (r && r.label) || VARS[v];
    return lab ? lab[isEl() ? 1 : 0] : String(v).replace(/_/g, ' ');
  }
  const TOPIC_VARS = {
    air: ['pm25', 'pm10', 'dust', 'ozone', 'nitrogen_dioxide', 'sulphur_dioxide', 'carbon_monoxide', 'aerosol_optical_depth', 'uv_aerosol_index', 'no2_column', 'co_column', 'so2_column', 'o3_column', 'co2'],
    weather: ['temperature', 'relative_humidity', 'wind_speed', 'pressure', 'uv_index', 'solar_irradiance', 'solar_energy_day', 'solar_clear_sky_share'],
    sea: ['sea_surface_temperature', 'wave_height', 'chlorophyll_a'],
  };
  const KIND = {
    'reference-station': ['official station', 'επίσημος σταθμός'], model: ['computer model (an estimate)', 'υπολογιστικό μοντέλο (εκτίμηση)'], 'low-cost-sensor': ['our low-cost sensor', 'δικός μας αισθητήρας χαμηλού κόστους'],
    satellite: ['satellite', 'δορυφόρος'], reanalysis: ['model of past weather', 'μοντέλο για τον καιρό που πέρασε'], statistics: ['statistics', 'στατιστικά'], map: ['map', 'χάρτης'],
  };
  const kindWord = (k) => (KIND[k] ? KIND[k][isEl() ? 1 : 0] : k || T('unknown kind', 'άγνωστο είδος'));
  const ENV = { outdoor: ['outdoors', 'έξω'], indoor: ['indoors', 'μέσα σε κτίριο'], vehicle: ['on a bus or car', 'πάνω σε λεωφορείο ή αυτοκίνητο'] };
  const envWord = (e) => (ENV[e] ? ENV[e][isEl() ? 1 : 0] : e || '');

  const layerOf = (live, id) => (live && (live.layers || []).find((x) => x.id === id)) || null;
  const layerName = (live, id) => { const l = layerOf(live, id); return l ? (isEl() && l.nameEl) || l.name : id; };
  const layerKind = (live, id) => { const l = layerOf(live, id); return l ? l.kind : null; };
  const isOwn = (live, id) => { const l = layerOf(live, id); return l ? l.group === 'own' : /^sensecap-/.test(id); };

  /* ---------- numbers and times in words ---------- */
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−').replace('.', isEl() ? ',' : '.');
  const withUnit = (v, unit) => num(v) + (unit ? ' ' + unit : '');
  const signed = (v, unit) => (Math.round(v * 10) / 10 > 0 ? '+' : '') + withUnit(v, unit);
  const pct = (f) => String(Math.round(Math.abs(f) * 100)) + ' %';
  // a time today is "18:05"; a time on another day carries its date
  const when = (t) => (t == null || !isFinite(t) ? '–' : SC.date(t) === SC.date(Date.now()) ? SC.time(t) : SC.dateTime(t));
  function dur(ms) {
    const m = Math.round(ms / MIN);
    if (m < 1) return T('less than a minute', 'λιγότερο από ένα λεπτό');
    if (m < 60) return m === 1 ? T('1 minute', '1 λεπτό') : T(m + ' minutes', m + ' λεπτά');
    const hh = Math.floor(m / 60), mm = m % 60;
    const a = hh === 1 ? T('1 hour', '1 ώρα') : T(hh + ' hours', hh + ' ώρες');
    return mm ? a + T(' and ', ' και ') + (mm === 1 ? T('1 minute', '1 λεπτό') : T(mm + ' minutes', mm + ' λεπτά')) : a;
  }

  /* ---------- sums over one saved line (plain functions, tested) ---------- */
  // values[i] belongs to times[i]; a null means nothing was saved at that moment.
  // -> null when nothing is saved, else { n, first:{v,t}, last:{v,t}, hourAgo:{v,t}|null, min, max, mean, range, dev, share }
  //    dev = newest minus the average of the saved moments; share = dev as a part of the range (0 when the line never moved)
  function stats(values, times) {
    const pts = [];
    (values || []).forEach((v, i) => { if (v != null && isFinite(v) && isFinite(times[i])) pts.push({ v: Number(v), t: times[i] }); });
    if (!pts.length) return null;
    const first = pts[0], last = pts[pts.length - 1];
    let min = Infinity, max = -Infinity, sum = 0;
    pts.forEach((p) => { min = Math.min(min, p.v); max = Math.max(max, p.v); sum += p.v; });
    const mean = sum / pts.length, range = max - min, dev = last.v - mean;
    // the saved moment nearest to one hour before the newest one, if one lies within 20 minutes of it
    let hourAgo = null, best = 20 * MIN + 1;
    const want = last.t - HOUR;
    pts.forEach((p) => { const d = Math.abs(p.t - want); if (p.t < last.t && d < best) { best = d; hourAgo = p; } });
    return { n: pts.length, first, last, hourAgo, min, max, mean, range, dev, share: range > 0 ? dev / range : 0 };
  }
  // stretches of the saved day with nothing saved for a line: [{ from, to, back }] (back: it spoke again afterwards)
  function gaps(values, times, every) {
    const need = Math.max(3 * (every || 300000), 15 * MIN), out = [];
    let lastT = null, seen = false;
    (values || []).forEach((v, i) => {
      if (v == null || !isFinite(v)) return;
      if (seen && times[i] - lastT >= need) out.push({ from: lastT, to: times[i], back: true });
      lastT = times[i]; seen = true;
    });
    const end = times && times.length ? times[times.length - 1] : null;
    if (seen && end != null && end - lastT >= need) out.push({ from: lastT, to: end, back: false });
    return out;
  }
  const daySpan = (replay) => { const t = (replay && replay.times) || []; return t.length ? { from: t[0], to: t[t.length - 1], ms: t[t.length - 1] - t[0], n: t.length } : { from: null, to: null, ms: 0, n: 0 }; };
  const SHORT = 3 * HOUR;   // under this the saved day says little: the pages say "the log is still filling"
  const series = (replay, city, key) => (replay && replay.cities && replay.cities[city] ? replay.cities[city][key] || null : null);
  const rowTime = (live, r) => (live && isFinite(live.at) && isFinite(r.ageMin) ? live.at - r.ageMin * MIN : null);
  const envOf = (live, city, source, variable) => { const c = live && live.cities && live.cities[city]; const r = c && (c.rows || []).find((x) => x.source === source && x.variable === variable); return r ? r.env : null; };

  /* ---------- small drawings ---------- */
  // a line of the saved day. lo/hi: the scale (give the same pair to two lines to put them on one scale)
  function spark(values, lo, hi, cls) {
    const W = 160, H = 36, n = (values || []).length;
    const s = sv('svg', { class: 't1-spark ' + (cls || ''), viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
    if (!n) return s;
    const sp = hi - lo || 1, x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W), y = (v) => H - 4 - ((v - lo) / sp) * (H - 8);
    let d = '', pen = false, lastPt = null, count = 0;
    values.forEach((v, i) => {
      if (v == null || !isFinite(v)) { pen = false; return; }
      d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; lastPt = [x(i), y(v)]; count++;
    });
    if (count > 1) s.append(sv('path', { class: 'ln', d, fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
    // the newest moment: a round dot that stays round when the drawing is stretched
    if (lastPt) s.append(sv('path', { class: 'dot', d: 'M' + lastPt[0].toFixed(1) + ' ' + lastPt[1].toFixed(1) + 'h.01', fill: 'none', 'stroke-width': 7, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
    return s;
  }
  const chips = (label, items, cur, pick) => h('div', { class: 't1-chips', role: 'group', 'aria-label': label },
    items.map(([id, text, off]) => h('button', { type: 'button', class: 't1-chip' + (id === cur ? ' on' : ''), 'aria-pressed': id === cur ? 'true' : 'false', disabled: off ? true : null, dataset: { id }, onclick: () => pick(id) }, text)));
  const panel = (title, ...kids) => h('section', { class: 't1-panel' }, title ? h('h2', { class: 't1-h' }, title) : null, kids);
  const note = (text) => h('p', { class: 't1-note' }, text);
  const warn = (text) => h('p', { class: 't1-warn' }, text);
  const empty = (text) => h('p', { class: 't1-empty' }, text);
  const fillingNote = (span) => (!span.n ? T('Nothing has been saved yet. The log takes one reading every few minutes: come back in a little while.', 'Δεν έχει αποθηκευτεί τίποτα ακόμη. Το αρχείο κρατά μία μέτρηση κάθε λίγα λεπτά: έλα ξανά σε λίγο.')
    : T('The log is still filling: only ' + dur(span.ms) + ' saved so far (since ' + when(span.from) + '). Come back later for a fuller day.', 'Το αρχείο γεμίζει ακόμη: έχουν αποθηκευτεί μόνο ' + dur(span.ms) + ' (από τις ' + when(span.from) + '). Έλα ξανά αργότερα για μια πιο πλήρη μέρα.'));

  // one "sources differ" line of a river for a city, in words (used by two pages)
  function differLine(live, river, city) {
    const c = river.cities[city], u = river.unit || '';
    const names = (c.sources || []).map((id) => layerName(live, id)).join(', ');
    return h('li', { class: 't1-line', dataset: { city, variable: river.variable } },
      h('b', null, cityName(city) + ' · ' + varName(river.variable, live)),
      h('span', null, T('The sources read from ' + withUnit(c.low, u) + ' to ' + withUnit(c.high, u) + ': ' + withUnit(c.spread, u) + ' apart. The gap we allow before saying "they differ" is ' + withUnit(c.tolerance, u) + '.',
        'Οι πηγές δείχνουν από ' + withUnit(c.low, u) + ' έως ' + withUnit(c.high, u) + ': απέχουν ' + withUnit(c.spread, u) + '. Η απόσταση που δεχόμαστε πριν πούμε «διαφέρουν» είναι ' + withUnit(c.tolerance, u) + '.')),
      h('small', null, T('Layers: ', 'Στρώματα: ') + names + ' · ' + T('read at ', 'διαβάστηκαν στις ') + when(live.at)));
  }
  const differNote = () => T('A difference is not a mistake by itself. The sources can be different instruments in different places, or one can be a computer model. It shows where to look, not why.',
    'Μια διαφορά δεν είναι από μόνη της λάθος. Οι πηγές μπορεί να είναι διαφορετικά όργανα σε διαφορετικά σημεία, ή η μία να είναι υπολογιστικό μοντέλο. Δείχνει πού να κοιτάξεις, όχι το γιατί.');

  /* ---------- a page: head, dark stage, loading, errors, refresh ---------- */
  // mount(root, { cls, need: ['live','replay','devices'], draw(data, body) }) -> cleanup
  // data: { live, replay, devices } (null for a part that could not be loaded) and data.failed: the names that failed.
  const URLS = { live: '/layers/api/live', replay: '/layers/api/replay', devices: '/api/devices' };
  function mount(root, o) {
    let dead = false, timer = 0, data = null;
    const body = h('div', { class: 't1-body' });
    const stage = h('div', { class: 't1 ' + (o.cls || '') }, body);
    root.append(stage);
    body.append(h('p', { class: 't1-empty', role: 'status' }, T('Loading the readings…', 'Φόρτωση των μετρήσεων…')));
    async function load(fresh) {
      const got = await Promise.all(o.need.map((k) => (fresh ? SC.api(URLS[k]) : SC.cached(URLS[k], 30000)).then((v) => [k, v, null], (e) => [k, null, e])));
      if (dead) return;
      const next = { failed: [] };
      got.forEach(([k, v, e]) => { next[k] = e ? null : v; if (e) next.failed.push(k); });
      if (next.failed.length === o.need.length || (o.must && o.must.some((k) => next[k] == null))) {
        if (data) return;   // keep what is on the screen; the next round tries again
        body.replaceChildren(h('div', { class: 't1-err', role: 'alert' },
          h('b', null, T('The readings could not be loaded.', 'Οι μετρήσεις δεν φορτώθηκαν.')),
          h('p', null, T('Nothing is shown rather than something old or made up. Check the connection and try again.', 'Δεν εμφανίζεται τίποτα, αντί για κάτι παλιό ή φτιαχτό. Έλεγξε τη σύνδεση και δοκίμασε ξανά.')),
          h('button', { type: 'button', class: 'nm-btn', onclick: () => load(true) }, T('Try again', 'Δοκίμασε ξανά'))));
        return;
      }
      data = next;
      body.replaceChildren();
      o.draw(data, body);
    }
    load(false);
    timer = setInterval(() => { if (!dead && !document.hidden && !(o.busy && o.busy())) load(true); }, 120000);
    return { stop() { dead = true; clearInterval(timer); }, redraw() { if (data && !dead) { body.replaceChildren(); o.draw(data, body); } }, get dead() { return dead; } };
  }

  SC.tk1 = { T, h, sv, HOUR, MIN, SHORT, CITY_IDS, cityName, SCHOOLS, schoolOf, MEAS, measName, varName, TOPIC_VARS, kindWord, envWord, layerOf, layerName, layerKind, isOwn,
    num, withUnit, signed, pct, when, dur, stats, gaps, daySpan, series, rowTime, envOf, spark, chips, panel, note, warn, empty, fillingNote, differLine, differNote, mount };
})();
