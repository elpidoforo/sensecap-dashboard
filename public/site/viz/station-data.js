/*
  Station data (pure, tested by tests/viz/station_test.js). Built from the answer of ONE of three live sheets:
    /api/stack/met-stations  features: id, name, time, temp, humidity, wind, windFrom, rain10min, rain24h
    /api/stack/airports      features: id, name, time, temp, wind, windFrom
    /api/stack/air-stations  features: id, name, stationType, area, pm25, pm25HourEnds, pm10, pm10HourEnds   (stackdata.js airStations)
  ONE station at a time. Every number, age and sentence is made here, never in the drawing code. This file never reads the clock:
  `now` (milliseconds) is handed in.
    - Units come from the answer's own `units` map. A reading whose unit the answer does not give says "unit not stated".
    - A value that is null or not a number is "not reported": no number is filled in.
    - The reading keeps its own time. `stale` is true when the reading is older than two refresh intervals of the answer, when it has
      no usable time, or when the answer does not say how often it refreshes. Only a live, not stale, not made-up reading may `sway`.
    - `demo` is the answer's own flag: the server's test mode made the values up. The model says so in words.
    - Stations are never put side by side, never ranked. No word here judges the air: the answers carry no official class.
  build(answer, {station}, now) -> model
  model = { id:'station', sheet, title, available, empty|null, live, demo, demoText|null, refreshSeconds|null, now, station (id),
            choices:[{id,name}], stations:{<id>:view}, strings:{...pairs}, note|null, honesty|null, source|null, credit|null,
            ...view of the chosen station }
  view  = { stationName, time (ISO|null), timeMs|null, timeLine:[en,el], ageSeconds|null, ageText:[en,el], stale (bool),
            staleText:[en,el]|null, status:{key:'live'|'old'|'notime'|'unknown'|'notlive', label}, sway (bool),
            dial|null, tiles:[tile], picks:[{key,value,unit,label}], facts:[[en,el]], ariaLabel, textRows }
  dial  = { key:'wind', name, speed|null, speedText:[en,el]|null, unit:[en,el], unitStated, from|null (degrees the wind comes FROM),
            fromText:[en,el]|null, compass:[en,el]|null, arrow (bool), calm (bool), line:[en,el], label:[en,el] }
  tile  = { key, name:[en,el], value|null, text:[en,el]|null, unit:[en,el], unitStated, missing, time|null, timeLine|null, label:[en,el] }
  select(model, id) -> the same model with another station on top.   retime(model, now) -> the same answer at another moment.
  changed(before, after) -> keys whose value differs for the SAME station (for one flash after an update).
  Every visible string is a pair [english, greek]. Works as a browser script (window.SC.viz.stationData) and as CommonJS.
*/
(function (root) {
  'use strict';
  const MONTHS = [['Jan', 'Ιανουαρίου'], ['Feb', 'Φεβρουαρίου'], ['Mar', 'Μαρτίου'], ['Apr', 'Απριλίου'], ['May', 'Μαΐου'], ['Jun', 'Ιουνίου'],
    ['Jul', 'Ιουλίου'], ['Aug', 'Αυγούστου'], ['Sep', 'Σεπτεμβρίου'], ['Oct', 'Οκτωβρίου'], ['Nov', 'Νοεμβρίου'], ['Dec', 'Δεκεμβρίου']];
  const NAMES = {
    temp: ['Air temperature', 'Θερμοκρασία αέρα'], humidity: ['Relative humidity', 'Σχετική υγρασία'],
    rain10min: ['Rain in the last 10 minutes', 'Βροχή στα τελευταία 10 λεπτά'], rain24h: ['Rain in the last 24 hours', 'Βροχή στις τελευταίες 24 ώρες'],
    pm25: ['Fine dust (PM2.5)', 'Λεπτή σκόνη (PM2.5)'], pm10: ['Coarse dust (PM10)', 'Χονδρή σκόνη (PM10)'],
  };
  const ORDER = ['temp', 'humidity', 'rain10min', 'rain24h', 'pm25', 'pm10'];
  const NOT_TILES = new Set(['wind', 'windFrom']);
  const COMPASS = [['from the north', 'από βόρεια'], ['from the north-east', 'από βορειοανατολικά'], ['from the east', 'από ανατολικά'], ['from the south-east', 'από νοτιοανατολικά'],
    ['from the south', 'από νότια'], ['from the south-west', 'από νοτιοδυτικά'], ['from the west', 'από δυτικά'], ['from the north-west', 'από βορειοδυτικά']];
  const S = {
    choose: ['Station', 'Σταθμός'],
    hint: ['Point at a reading, or use the arrow keys, to read it in full.', 'Δείξε μια μέτρηση, ή χρησιμοποίησε τα βέλη, για να τη διαβάσεις ολόκληρη.'],
    oneStation: ['One station at a time. Stations are not drawn together.', 'Ένας σταθμός κάθε φορά. Οι σταθμοί δεν σχεδιάζονται μαζί.'],
    notReported: ['not reported', 'δεν αναφέρθηκε'],
    noUnit: ['unit not stated', 'η μονάδα δεν δηλώνεται'],
    wind: ['Wind', 'Άνεμος'],
    windSpeed: ['wind speed', 'ταχύτητα ανέμου'],
    comingFrom: ['coming', 'έρχεται'],
    dirNotReported: ['direction not reported', 'η κατεύθυνση δεν αναφέρθηκε'],
    speedNotReported: ['speed not reported', 'η ταχύτητα δεν αναφέρθηκε'],
    windNotReported: ['wind not reported', 'ο άνεμος δεν αναφέρθηκε'],
    arrowKey: ['The arrow starts on the side the wind comes from and points the way it blows.', 'Το βέλος ξεκινά από την πλευρά από την οποία έρχεται ο άνεμος και δείχνει προς τα πού φυσά.'],
    compass: [['N', 'Β'], ['E', 'Α'], ['S', 'Ν'], ['W', 'Δ']],
    live: ['LIVE', 'ΖΩΝΤΑΝΑ'], old: ['OLD READING', 'ΠΑΛΙΑ ΜΕΤΡΗΣΗ'], notime: ['NO TIME ON THIS READING', 'ΜΕΤΡΗΣΗ ΧΩΡΙΣ ΩΡΑ'],
    unknown: ['AGE CANNOT BE JUDGED', 'ΑΓΝΩΣΤΟ ΑΝ ΕΙΝΑΙ ΠΡΟΣΦΑΤΗ'], notlive: ['NOT LIVE', 'ΟΧΙ ΖΩΝΤΑΝΑ'],
    words: { live: ['live', 'ζωντανά'], old: ['old reading', 'παλιά μέτρηση'], notime: ['no time on this reading', 'μέτρηση χωρίς ώρα'],
      unknown: ['it cannot be judged whether this is recent', 'άγνωστο αν είναι πρόσφατη'], notlive: ['not live', 'όχι ζωντανά'] },
    demoChip: ['TEST VALUES', 'ΔΟΚΙΜΑΣΤΙΚΕΣ ΤΙΜΕΣ'],
    demoText: ['Test mode: the server made these values up. They were not measured.', 'Δοκιμαστική λειτουργία: ο διακομιστής επινόησε αυτές τις τιμές. Δεν μετρήθηκαν.'],
    noTime: ['The answer gives no time for this reading.', 'Η απάντηση δεν δίνει ώρα για αυτή τη μέτρηση.'],
    ahead: ['The time of this reading is ahead of this clock, so its age is not known.', 'Η ώρα αυτής της μέτρησης είναι μπροστά από αυτό το ρολόι, άρα η ηλικία της δεν είναι γνωστή.'],
    noRefresh: ['The answer does not say how often it refreshes, so this reading cannot be called fresh.', 'Η απάντηση δεν λέει κάθε πότε ανανεώνεται, άρα αυτή η μέτρηση δεν μπορεί να θεωρηθεί πρόσφατη.'],
    noStations: ['The answer has no stations right now.', 'Η απάντηση δεν έχει σταθμούς αυτή τη στιγμή.'],
    noAnswer: ['There is no answer for this sheet right now.', 'Δεν υπάρχει απάντηση για αυτό το φύλλο αυτή τη στιγμή.'],
    noReason: ['This sheet is not available right now. The answer gives no reason.', 'Αυτό το φύλλο δεν είναι διαθέσιμο αυτή τη στιγμή. Η απάντηση δεν δίνει λόγο.'],
    title: ['One station, newest reading', 'Ένας σταθμός, πιο πρόσφατη μέτρηση'],
  };
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const clean = (s) => String(s).replace(/[«»]/g, '"');
  const pair = (p, fb) => (Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null ? [clean(p[0]), clean(p[1])] : (typeof p === 'string' && p ? [clean(p), clean(p)] : (fb == null ? null : [clean(fb), clean(fb)])));
  const num = (v) => { const s = String(+v.toFixed(2)); return [s, s.replace('.', ',')]; };
  const join = (a, sep, b) => [a[0] + sep + b[0], a[1] + sep + b[1]];
  const cap = (p) => [p[0].charAt(0).toUpperCase() + p[0].slice(1), p[1].charAt(0).toUpperCase() + p[1].slice(1)];

  // the unit exactly as the answer gives it; the Greek half only rewords the plain words the sheets use
  function unitOf(units, key) {
    const u = units && typeof units[key] === 'string' && units[key].trim() ? clean(units[key].trim()) : null;
    if (!u) return { unit: S.noUnit, stated: false };
    return { unit: [u, u.replace(/^degrees$/, 'μοίρες').replace(/, mean of one hour$/, ', μέσος όρος μίας ώρας')], stated: true };
  }

  // a date and time in Cyprus time when the runtime knows the zone, otherwise in UTC and said so
  function clock(ms) {
    let q = null, zone = ['Cyprus time', 'ώρα Κύπρου'];
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Nicosia', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
      const g = (t) => Number((parts.find((x) => x.type === t) || {}).value);
      q = { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute') };
      if (![q.y, q.mo, q.d, q.h, q.mi].every(Number.isFinite)) q = null;
    } catch (e) { q = null; }
    if (!q) { const d = new Date(ms); q = { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; zone = ['UTC', 'UTC']; }
    const hm = String(q.h).padStart(2, '0') + ':' + String(q.mi).padStart(2, '0');
    return [q.d + ' ' + MONTHS[q.mo - 1][0] + ' ' + q.y + ', ' + hm + ' (' + zone[0] + ')', q.d + ' ' + MONTHS[q.mo - 1][1] + ' ' + q.y + ', ' + hm + ' (' + zone[1] + ')'];
  }
  function ageWords(sec) {
    if (sec < 60) return ['less than a minute ago', 'πριν από λιγότερο από ένα λεπτό'];
    const m = Math.floor(sec / 60); if (m < 120) return [m + ' min ago', 'πριν από ' + m + (m === 1 ? ' λεπτό' : ' λεπτά')];
    const h = Math.floor(sec / 3600); if (h < 48) return [h + ' h ago', 'πριν από ' + h + (h === 1 ? ' ώρα' : ' ώρες')];
    const d = Math.floor(sec / 86400); return [d + ' days ago', 'πριν από ' + d + ' ημέρες'];
  }
  const spanWords = (sec) => { const m = Math.round(sec / 60); return m < 120 ? [m + ' min', m + (m === 1 ? ' λεπτό' : ' λεπτά')] : [+(sec / 3600).toFixed(1) + ' h', String(+(sec / 3600).toFixed(1)).replace('.', ',') + ' ώρες']; };
  // age of one time against now: {ms, seconds|null, text, ahead}
  function ageOf(iso, now) {
    const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (!Number.isFinite(ms) || !isNum(now)) return { ms: null, seconds: null, text: null, ahead: false };
    const sec = Math.round((now - ms) / 1000);
    if (sec < -120) return { ms, seconds: null, text: null, ahead: true };
    const s = Math.max(0, sec);
    return { ms, seconds: s, text: ageWords(s), ahead: false };
  }

  function stationView(f, ans, keys, now, tail) {
    const name = pair(f.name, f.id != null ? f.id : '?'), units = ans.units || {};
    const hourly = !f.time;   // air stations: every value has the end of its own hour instead of one time for the reading
    const verb = hourly ? ['hour ended', 'η ώρα έληξε'] : ['measured', 'μετρήθηκε'];
    // ---- tiles
    const tiles = keys.filter((k) => !NOT_TILES.has(k)).map((k) => {
      const u = unitOf(units, k), nm = NAMES[k] || [k, k], v = isNum(f[k]) ? f[k] : null, text = v == null ? null : num(v);
      const tIso = typeof f[k + 'HourEnds'] === 'string' ? f[k + 'HourEnds'] : null, a = tIso ? ageOf(tIso, now) : null;
      const timeLine = a && a.ms != null ? (a.text ? join(join(verb, ' ', clock(a.ms)), ', ', a.text) : join(verb, ' ', clock(a.ms))) : null;
      let label = v == null ? join(join(name, ': ', [nm[0].toLowerCase(), nm[1].toLowerCase()]), ' ', S.notReported)
        : join(join(join(name, ': ', [nm[0].toLowerCase(), nm[1].toLowerCase()]), ' ', text), u.stated ? ' ' : ' (', u.stated ? u.unit : [S.noUnit[0] + ')', S.noUnit[1] + ')']);
      if (v != null && timeLine) label = join(label, ', ', timeLine);
      return { key: k, name: nm, value: v, text, unit: u.unit, unitStated: u.stated, missing: v == null, time: tIso, timeMs: a ? a.ms : null, timeLine, label: join(label, '', ['.', '.']) };
    });
    // ---- the reading's own time: the feature's `time`, or the newest hour end among its values
    let tIso = typeof f.time === 'string' ? f.time : null;
    if (!tIso) { const best = tiles.filter((t) => !t.missing && t.timeMs != null).sort((a, b) => b.timeMs - a.timeMs)[0]; tIso = best ? best.time : null; }
    const a = ageOf(tIso, now), refresh = isNum(ans.refreshSeconds) && ans.refreshSeconds > 0 ? ans.refreshSeconds : null;
    const lead = hourly ? ['Newest hour ended', 'Η πιο πρόσφατη ώρα έληξε'] : ['Measured', 'Μετρήθηκε'];
    const timeLine = a.ms != null ? join(lead, ' ', clock(a.ms)) : S.noTime;
    let key, staleText = null;
    if (a.ms == null) { key = 'notime'; staleText = S.noTime; }
    else if (a.ahead) { key = 'unknown'; staleText = S.ahead; }
    else if (refresh == null) { key = 'unknown'; staleText = S.noRefresh; }
    else if (a.seconds > 2 * refresh) {
      key = 'old'; const sp = spanWords(2 * refresh);
      staleText = ['Old reading: it is older than two refresh intervals of this sheet (' + sp[0] + ').', 'Παλιά μέτρηση: είναι παλαιότερη από δύο διαστήματα ανανέωσης αυτού του φύλλου (' + sp[1] + ').'];
    } else key = ans.live === true ? 'live' : 'notlive';
    const stale = key === 'old' || key === 'notime' || key === 'unknown';
    const ageText = a.text || (a.ahead ? S.ahead : S.noTime);
    // ---- wind dial, only when the sheet has the fields
    let dial = null;
    if (keys.includes('wind') || keys.includes('windFrom')) {
      const us = unitOf(units, 'wind'), ud = unitOf(units, 'windFrom');
      const sp = isNum(f.wind) && f.wind >= 0 ? f.wind : null, fr = isNum(f.windFrom) && f.windFrom >= 0 && f.windFrom <= 360 ? f.windFrom : null;
      const calm = sp === 0, arrow = fr != null && !calm;
      const spT = sp == null ? null : join(num(sp), us.stated ? ' ' : ' (', us.stated ? us.unit : [S.noUnit[0] + ')', S.noUnit[1] + ')']);
      const isDeg = ud.stated && ud.unit[0] === 'degrees';
      const frT = fr == null ? null : (isDeg ? [num(fr)[0] + '°', num(fr)[1] + '°'] : join(num(fr), ud.stated ? ' ' : ' (', ud.stated ? ud.unit : [S.noUnit[0] + ')', S.noUnit[1] + ')']));
      // the eight compass words only when the answer says the number is in degrees
      const compass = fr != null && isDeg ? COMPASS[Math.round(fr / 45) % 8] : null;
      let line;
      if (sp == null && fr == null) line = S.windNotReported;
      else {
        const one = sp == null ? S.speedNotReported : join(S.windSpeed, ' ', spT);
        const two = fr == null ? S.dirNotReported : (compass ? join(join(S.comingFrom, ' ', compass), ' (', [frT[0] + ')', frT[1] + ')']) : join(['direction it comes from:', 'κατεύθυνση από την οποία έρχεται:'], ' ', frT));
        line = join(one, ', ', two);
      }
      const label = join(join(name, ': ', line), '', ['.', '.']);
      dial = { key: 'wind', name: S.wind, speed: sp, speedText: sp == null ? null : num(sp), unit: us.unit, unitStated: us.stated, from: fr, fromText: frT, compass, arrow, calm, line: cap(line), label };
    }
    const picks = (dial ? [{ key: 'wind', value: dial.speed, unit: dial.unit, label: dial.label }] : []).concat(tiles.map((t) => ({ key: t.key, value: t.value, unit: t.unit, label: t.label })));
    // ---- what the publisher says about the station itself, word for word
    const facts = [];
    if (typeof f.stationType === 'string' && f.stationType) facts.push(['Station type, in the publisher\'s words: ' + clean(f.stationType), 'Τύπος σταθμού, με τα λόγια του εκδότη: ' + clean(f.stationType)]);
    if (typeof f.area === 'string' && f.area) facts.push(['Area type, in the publisher\'s words: ' + clean(f.area), 'Τύπος περιοχής, με τα λόγια του εκδότη: ' + clean(f.area)]);
    const statusLabel = S[key];
    const when = a.text ? join(join(timeLine, ', ', a.text), '', ['.', '.']) : (a.ms != null ? join(timeLine, '. ', S.ahead) : S.noTime);
    const title = pair(ans.title, S.title[0]) || S.title;
    const head = join(name, ', ', title);
    const statusRow = join(join(['Status: ', 'Κατάσταση: '], '', S.words[key]), '', ['.', '.']);
    const textRows = [join(head, '', ['.', '.']), statusRow];
    if (ans.demo === true) textRows.push(S.demoText);
    textRows.push(when); if (staleText && staleText !== S.noTime) textRows.push(staleText);
    if (dial) textRows.push(dial.label);
    for (const t of tiles) textRows.push(t.label);
    for (const x of facts) textRows.push(x);
    for (const x of tail) textRows.push(x);
    const bits = (dial ? [dial.label] : []).concat(tiles.map((t) => t.label));
    let aria = join(join(head, '. ', statusRow), ' ', when);
    if (ans.demo === true) aria = join(aria, ' ', S.demoText);
    for (const b of bits) aria = join(aria, ' ', b);
    return { stationName: name, time: tIso, timeMs: a.ms, timeLine, ageSeconds: a.seconds, ageText, stale, staleText, status: { key, label: statusLabel },
      sway: key === 'live' && ans.demo !== true && !!(dial && dial.arrow), dial, tiles, picks, facts, ariaLabel: aria, textRows };
  }

  function shell(ans, now) {
    const a = ans && typeof ans === 'object' ? ans : {};
    const src = pair(a.source, null), att = typeof a.attribution === 'string' && a.attribution ? [clean(a.attribution), clean(typeof a.attributionEl === 'string' && a.attributionEl ? a.attributionEl : a.attribution)] : null;
    return { id: 'station', sheet: typeof a.id === 'string' ? a.id : null, title: pair(a.title, null) || S.title, available: false, empty: null, live: a.live === true, demo: a.demo === true,
      demoText: a.demo === true ? S.demoText : null, refreshSeconds: isNum(a.refreshSeconds) && a.refreshSeconds > 0 ? a.refreshSeconds : null, now: isNum(now) ? now : null,
      station: null, choices: [], stations: {}, strings: S, note: pair(a.note, null), honesty: pair(a.honesty, null),
      source: src ? join(['Source: ', 'Πηγή: '], '', src) : null, credit: att ? join(['Credit: ', 'Αναφορά πηγής: '], '', att) : null };
  }
  const keep = (m, ans) => { Object.defineProperty(m, '_answer', { value: ans, enumerable: false }); return m; };

  function emptyModel(ans, now, why) {
    const m = shell(ans, now), e = why || S.noAnswer;
    const rows = [e]; if (m.honesty && ans && ans.available !== false) rows.push(m.honesty); if (m.source) rows.push(m.source);
    return keep(Object.assign(m, { empty: e, stationName: null, time: null, timeMs: null, timeLine: null, ageSeconds: null, ageText: null, stale: true, staleText: null,
      status: { key: 'unavailable', label: ['NOT AVAILABLE', 'ΜΗ ΔΙΑΘΕΣΙΜΟ'] }, sway: false, dial: null, tiles: [], picks: [], facts: [],
      ariaLabel: join(m.title, ': ', e), textRows: rows }), ans);
  }

  function select(model, id) {
    const v = model && model.stations && Object.prototype.hasOwnProperty.call(model.stations, id) ? model.stations[id] : null;
    return v ? keep(Object.assign({}, model, v, { station: String(id) }), model._answer) : model;
  }

  function build(ans, opts, now) {
    opts = opts || {};
    if (!ans || typeof ans !== 'object') return emptyModel(null, now, S.noAnswer);
    if (ans.available === false) return emptyModel(ans, now, pair(ans.reason, null) || S.noReason);
    const feats = Array.isArray(ans.features) ? ans.features.filter((f) => f && typeof f === 'object') : [];
    if (!feats.length) return emptyModel(ans, now, S.noStations);
    const base = shell(ans, now); base.available = true;
    // the readings this sheet truly has: the keys of its `units` map, then known reading fields a station carries without a unit
    const keys = [];
    const add = (k) => { if (!keys.includes(k)) keys.push(k); };
    const unitKeys = ans.units && typeof ans.units === 'object' ? Object.keys(ans.units) : [];
    for (const k of ORDER.concat(['wind', 'windFrom'])) if (unitKeys.includes(k) || feats.some((f) => k in f)) add(k);
    for (const k of unitKeys) add(k);
    keys.sort((a, b) => (ORDER.indexOf(a) < 0 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b)));
    const tail = [];
    if (keys.includes('windFrom')) tail.push(S.arrowKey);
    tail.push(S.oneStation);
    if (base.note) tail.push(base.note); if (base.honesty) tail.push(base.honesty); if (base.source) tail.push(base.source); if (base.credit) tail.push(base.credit);
    const used = new Set();
    feats.forEach((f, i) => {
      let id = String(f.id != null && f.id !== '' ? f.id : 'station-' + (i + 1)); while (used.has(id)) id += '-' + (i + 1); used.add(id);
      base.stations[id] = stationView(f, ans, keys, now, tail); base.choices.push({ id, name: base.stations[id].stationName });
    });
    const want = opts.station != null && used.has(String(opts.station)) ? String(opts.station) : base.choices[0].id;
    return select(keep(base, ans), want);
  }

  const retime = (model, now) => (model ? build(model._answer, { station: model.station }, now) : model);

  function changed(before, after) {
    if (!before || !after || !before.available || !after.available || before.station !== after.station || before.sheet !== after.sheet) return [];
    const out = [], old = new Map(before.picks.map((p) => [p.key, p]));
    for (const p of after.picks) { const o = old.get(p.key); if (o && o.value !== p.value) out.push(p.key); }
    if (before.dial && after.dial && before.dial.from !== after.dial.from && !out.includes('wind')) out.push('wind');
    return out;
  }

  const api = { build, select, retime, changed, emptyModel, STRINGS: S };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.stationData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
