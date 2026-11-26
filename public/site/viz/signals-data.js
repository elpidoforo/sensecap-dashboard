/*
  signals-data.js: the model for the Signals over Cyprus board. Pure: no DOM, no clock (the caller passes `now`), no network.
  Input: the platform's own answers for met-stations, airports, air-stations, fire-hotspots and earthquakes (/api/stack/<id>).
  For each source: is it answering, how many records it holds, and where each record sits on the island (its own latitude and
  longitude, as published). For the row of cards: the lowest and highest reading among the FRESH records (a range, not a
  ranking: no place is named as best or worst), or a count.
  A source that does not answer keeps its reason and sends nothing. A value that is missing stays missing, never zero.
  Only the newest MAX_PER records of a source are placed, and the model says how many were left out.
  The board plays the records of ONE fetch one after the other so they can be watched (at()); they arrived together.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.signalsData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_PER = 60, START = 900, SRC = 1500, DROP = 1300, FALL = 700, HOLD = 3200;
  const BOX = { w: 32.2, e: 34.7, s: 34.5, n: 35.75 };   // the frame of the island drawing; a record outside it is counted but not placed
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const NOANS = ['not answering right now', 'δεν απαντά αυτή τη στιγμή'];
  const DEFS = [
    { id: 'met', glyph: 'mast', hue: '#5fd4ff', card: 'temp', name: ['Weather stations', 'Μετεωρολογικοί σταθμοί'], sub: ['Department of Meteorology, every 10 minutes', 'Τμήμα Μετεωρολογίας, ανά 10 λεπτά'] },
    { id: 'airports', glyph: 'tower', hue: '#7aa2ff', card: 'wind', name: ['Airport weather', 'Καιρός αεροδρομίων'], sub: ['airport reports', 'αναφορές αεροδρομίων'] },
    { id: 'air', glyph: 'post', hue: '#34D399', card: 'pm25', name: ['Official air stations', 'Επίσημοι σταθμοί αέρα'], sub: ['outdoor air, every hour', 'εξωτερικός αέρας, ανά ώρα'] },
    { id: 'fires', glyph: 'satellite', hue: '#fb7185', card: 'fires', name: ['Satellite heat', 'Θερμότητα από δορυφόρο'], sub: ['NASA FIRMS, last 24 hours', 'NASA FIRMS, τελευταίες 24 ώρες'] },
    { id: 'quakes', glyph: 'seismo', hue: '#a78bfa', card: 'quakes', name: ['Earthquake list', 'Λίστα σεισμών'], sub: ['USGS catalogue', 'κατάλογος USGS'] }];
  const n1 = (v, el) => { const s = v.toFixed(1); return el ? s.replace('.', ',') : s; };
  const feats = (a) => (a && a.available !== false && Array.isArray(a.features) ? a.features : null);
  const stampOf = (f) => f.time || f.acqTime || f.pm25HourEnds || f.pm10HourEnds || null;
  const inBox = (f) => f.lng >= BOX.w && f.lng <= BOX.e && f.lat >= BOX.s && f.lat <= BOX.n;

  function range(list, key, unit, name, nameEl, digits) {
    const v = list.map((r) => r[key]).filter(isNum);
    if (!v.length) return { known: false, text: ['no reading', 'καμία μέτρηση'], n: 0 };
    const lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), f = (x, el) => (digits === 0 ? String(Math.round(x)) : n1(x, el));
    return { known: true, n: v.length, lo, hi, values: v.slice(0, 40), text: lo === hi ? [f(lo) + ' ' + unit, f(lo, 1) + ' ' + unit] : [f(lo) + ' to ' + f(hi) + ' ' + unit, f(lo, 1) + ' έως ' + f(hi, 1) + ' ' + unit] };
  }

  function build(answers, now) {
    answers = answers || {}; let demo = false;
    const sources = DEFS.map((d, k) => {
      const a = answers[d.id], list = feats(a), refresh = a && isNum(a.refreshSeconds) ? a.refreshSeconds : (d.id === 'air' ? 3600 : 600);
      if (a && a.demo) demo = true;
      if (!list) return Object.assign({}, d, { i: k, available: false, reason: a && Array.isArray(a.reason) ? [String(a.reason[0]), String(a.reason[1] || a.reason[0])] : NOANS, total: 0, placed: [], left: 0, outside: 0, records: [] });
      const recs = list.filter((f) => f && typeof f === 'object').map((f, i) => { const st = stampOf(f), t = st ? Date.parse(st) : NaN, age = isNum(t) && isNum(now) ? Math.max(0, (now - t) / 1000) : null, point = d.id === 'fires' || d.id === 'quakes';
        return { id: String(f.id != null ? f.id : d.id + ':' + i), name: String(f.name || f.place || ''), lat: isNum(f.lat) ? f.lat : null, lng: isNum(f.lng) ? f.lng : null, t: isNum(t) ? t : null, fresh: point ? true : age != null && age <= 2 * refresh,
          temp: isNum(f.temp) ? f.temp : null, wind: isNum(f.wind) ? f.wind : null, rain10: isNum(f.rain10min) ? f.rain10min : isNum(f.rain10) ? f.rain10 : null, pm25: isNum(f.pm25) ? f.pm25 : null, pm10: isNum(f.pm10) ? f.pm10 : null, magnitude: isNum(f.magnitude) ? f.magnitude : null }; });
      const located = recs.filter((r) => r.lat != null && r.lng != null), inside = located.filter(inBox), newest = inside.slice().sort((x, y) => (y.t || 0) - (x.t || 0)).slice(0, MAX_PER);
      return Object.assign({}, d, { i: k, available: true, reason: null, total: recs.length, records: recs, placed: newest, left: inside.length - newest.length, outside: recs.length - inside.length });
    });
    const by = {}; sources.forEach((s) => { by[s.id] = s; });
    const freshOf = (ids) => ids.reduce((a, id) => a.concat(by[id].available ? by[id].records.filter((r) => r.fresh) : []), []);
    const wx = freshOf(['met', 'airports']), air = freshOf(['air']), wxOn = by.met.available || by.airports.available;
    const off = (ids) => !ids.some((id) => by[id].available);
    const count = (id, one, many, oneEl, manyEl) => { const s = by[id]; if (!s.available) return { known: false, text: NOANS, n: 0 }; return { known: true, n: s.total, text: [s.total + ' ' + (s.total === 1 ? one : many), s.total + ' ' + (s.total === 1 ? oneEl : manyEl)] }; };
    const rainy = wx.filter((r) => isNum(r.rain10)), wet = rainy.filter((r) => r.rain10 > 0).length;
    const cards = [
      Object.assign({ id: 'temp', from: ['met', 'airports'], name: ['Air temperature', 'Θερμοκρασία αέρα'] }, off(['met', 'airports']) ? { known: false, text: NOANS, n: 0 } : range(wx, 'temp', '°C')),
      Object.assign({ id: 'wind', from: ['met', 'airports'], name: ['Wind speed', 'Ταχύτητα ανέμου'] }, off(['met', 'airports']) ? { known: false, text: NOANS, n: 0 } : range(wx, 'wind', 'm/s')),
      Object.assign({ id: 'rain', from: ['met'], name: ['Rain, last 10 minutes', 'Βροχή, τελευταία 10 λεπτά'] }, !wxOn ? { known: false, text: NOANS, n: 0 } : !rainy.length ? { known: false, text: ['no reading', 'καμία μέτρηση'], n: 0 } : { known: true, n: rainy.length, text: [wet + ' of ' + rainy.length + ' stations', wet + ' από ' + rainy.length + ' σταθμούς'] }),
      Object.assign({ id: 'pm25', from: ['air'], name: ['Fine dust PM2.5', 'Λεπτή σκόνη PM2.5'] }, off(['air']) ? { known: false, text: NOANS, n: 0 } : range(air, 'pm25', 'µg/m³', '', '', 0)),
      Object.assign({ id: 'pm10', from: ['air'], name: ['Dust PM10', 'Σκόνη PM10'] }, off(['air']) ? { known: false, text: NOANS, n: 0 } : range(air, 'pm10', 'µg/m³', '', '', 0)),
      Object.assign({ id: 'fires', from: ['fires'], name: ['Heat detections', 'Ανιχνεύσεις θερμότητας'] }, count('fires', 'detection', 'detections', 'ανίχνευση', 'ανιχνεύσεις')),
      Object.assign({ id: 'quakes', from: ['quakes'], name: ['Earthquakes listed', 'Σεισμοί στη λίστα'] }, count('quakes', 'event', 'events', 'γεγονός', 'γεγονότα'))];
    if (by.quakes.available) { const mg = by.quakes.placed.map((r) => r.magnitude).filter(isNum); if (mg.length) cards[6].values = mg.slice(0, 40); }
    // one short line per placed record, in the order they are played (for the running line at the bottom of the board)
    const ticker = []; sources.forEach((s) => s.placed.forEach((r) => { const nm = r.name || (r.lat.toFixed(2) + '\u00b0N ' + r.lng.toFixed(2) + '\u00b0E'); let t = null;
      if (s.id === 'met' || s.id === 'airports') { if (r.temp != null || r.wind != null) t = [nm + ' ' + (r.temp != null ? n1(r.temp) + ' \u00b0C' : '') + (r.wind != null ? ' wind ' + n1(r.wind) + ' m/s' : ''), nm + ' ' + (r.temp != null ? n1(r.temp, 1) + ' \u00b0C' : '') + (r.wind != null ? ' άνεμος ' + n1(r.wind, 1) + ' m/s' : '')]; }
      else if (s.id === 'air') { if (r.pm25 != null || r.pm10 != null) t = [nm + (r.pm25 != null ? ' PM2.5 ' + Math.round(r.pm25) : '') + (r.pm10 != null ? ' PM10 ' + Math.round(r.pm10) : '') + ' \u00b5g/m\u00b3', nm + (r.pm25 != null ? ' PM2.5 ' + Math.round(r.pm25) : '') + (r.pm10 != null ? ' PM10 ' + Math.round(r.pm10) : '') + ' \u00b5g/m\u00b3']; }
      else if (s.id === 'quakes') t = [(r.magnitude != null ? 'M ' + n1(r.magnitude) + ' ' : 'earthquake ') + nm, (r.magnitude != null ? 'M ' + n1(r.magnitude, 1) + ' ' : 'σεισμός ') + nm];
      else t = ['heat detection ' + nm, 'ανίχνευση θερμότητας ' + nm];
      if (t) ticker.push({ source: s.id, hue: s.hue, text: t }); }));
    const answering = sources.filter((s) => s.available).length, placed = sources.reduce((a, s) => a + s.placed.length, 0), records = sources.reduce((a, s) => a + s.total, 0);
    const available = answering > 0;
    // the walk: each answering source gets a slot; its records drop one after the other inside the slot
    let k = 0; sources.forEach((s) => { if (!s.available) { s.start = null; return; } s.start = START + k * SRC; k++; s.placed.forEach((r, j) => { r.at = s.start + 500 + (s.placed.length > 1 ? j / (s.placed.length - 1) : 0) * DROP; }); });
    const duration = available ? START + k * SRC + DROP + FALL + HOLD : 0;
    const when = isNum(now) ? (() => { const d = new Date(now), s = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC'; return [s, s]; })() : ['time not stated', 'η ώρα δεν αναφέρεται'];
    const head = available ? [answering + ' of ' + sources.length + ' sources answered at ' + when[0] + ' with ' + records + ' records; ' + placed + ' are placed on the island drawing.', answering + ' από ' + sources.length + ' πηγές απάντησαν στις ' + when[1] + ' με ' + records + ' εγγραφές· ' + placed + ' τοποθετούνται στο σχέδιο του νησιού.'] : ['No source is answering right now.', 'Καμία πηγή δεν απαντά αυτή τη στιγμή.'];
    const rows = [head];
    if (demo) rows.push(['Test values from the server test mode, not real readings.', 'Δοκιμαστικές τιμές από τη δοκιμαστική λειτουργία, όχι πραγματικές μετρήσεις.']);
    sources.forEach((s) => rows.push(s.available ? [s.name[0] + ' (' + s.sub[0] + '): ' + s.total + ' records, ' + s.placed.length + ' placed' + (s.left ? ', ' + s.left + ' older ones not drawn' : '') + (s.outside ? ', ' + s.outside + ' without a place inside the drawing' : '') + '.', s.name[1] + ' (' + s.sub[1] + '): ' + s.total + ' εγγραφές, ' + s.placed.length + ' τοποθετημένες' + (s.left ? ', ' + s.left + ' παλαιότερες δεν σχεδιάζονται' : '') + (s.outside ? ', ' + s.outside + ' χωρίς θέση μέσα στο σχέδιο' : '') + '.'] : [s.name[0] + ': ' + s.reason[0] + '.', s.name[1] + ': ' + s.reason[1] + '.']));
    cards.forEach((c) => rows.push([c.name[0] + ': ' + c.text[0] + (c.known && c.lo != null ? ' (lowest to highest among ' + c.n + ' fresh readings)' : ''), c.name[1] + ': ' + c.text[1] + (c.known && c.lo != null ? ' (χαμηλότερη έως υψηλότερη από ' + c.n + ' πρόσφατες μετρήσεις)' : '')]));
    rows.push(['The records are played one after the other so they can be watched. They arrived together in one fetch.', 'Οι εγγραφές παίζονται η μία μετά την άλλη για να φαίνονται. Έφτασαν όλες μαζί σε μία λήψη.']);
    return { id: 'signals', available, empty: available ? null : head, now: isNum(now) ? now : null, when, demo, sources, cards, totals: { answering, sources: sources.length, records, placed }, box: BOX, duration, fall: FALL, ticker, textRows: rows, ariaLabel: head };
  }
  // what is on at run time T
  function at(m, T) {
    let active = -1, landed = 0; const lit = {};
    m.sources.forEach((s) => { if (s.start == null) return; if (T >= s.start) { lit[s.id] = Math.min(1, (T - s.start) / 500); active = s.i; } s.placed.forEach((r) => { if (T >= r.at + m.fall) landed++; }); });
    const cards = m.cards.map((c) => c.from.reduce((a, id) => Math.max(a, lit[id] || 0), 0));
    return { active, lit, cards, landed, done: T >= m.duration };
  }
  return { build, at, DEFS, MAX_PER };
});
