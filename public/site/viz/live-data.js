/*
  live-data.js: the arithmetic behind the Live Board. Pure: no DOM, no clock (the caller passes `now` in ms), no network.
  Input: the platform's own answers for met-stations, fire-hotspots and earthquakes (/api/stack/<id>).
  - stations(): one record per station with its reading, its age and whether it is old (more than two refresh intervals).
  - field(): wind and temperature at a point, ESTIMATED from the nearby stations (inverse-distance weighting). Old or
    incomplete readings take no part. With no usable station there is no field (null), never a made-up one.
  - diff(): which stations sent a new reading since the last answer (drives the rings, the rolling numbers and the log).
  Nothing here compares or ranks stations.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.liveData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const KM_LAT = 110.57, kmLng = (lat) => 111.32 * Math.cos(lat * Math.PI / 180);
  // wind blows FROM the given bearing; u is toward the east, v toward the north, in the unit of the speed
  function uv(speed, from) { if (!isNum(speed) || !isNum(from)) return null; const a = (from + 180) * Math.PI / 180; return { u: Math.sin(a) * speed, v: Math.cos(a) * speed }; }
  const COMPASS = [['north', 'βόρεια'], ['north-east', 'βορειοανατολικά'], ['east', 'ανατολικά'], ['south-east', 'νοτιοανατολικά'], ['south', 'νότια'], ['south-west', 'νοτιοδυτικά'], ['west', 'δυτικά'], ['north-west', 'βορειοδυτικά']];
  const compass = (deg) => (isNum(deg) ? COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] : null);
  function ageText(s) {
    if (!isNum(s)) return ['time not stated', 'η ώρα δεν αναφέρεται'];
    if (s < 90) return ['just now', 'μόλις τώρα'];
    const m = Math.round(s / 60); if (m < 90) return [m + ' min ago', 'πριν από ' + m + ' λεπτά'];
    const h = Math.round(m / 60); return [h + ' h ago', 'πριν από ' + h + ' ώρες'];
  }
  const n1 = (v) => (isNum(v) ? v.toFixed(1) : '–');

  function stations(answer, now) {
    const ok = !!(answer && answer.available !== false && Array.isArray(answer.features));
    const refresh = ok && isNum(answer.refreshSeconds) ? answer.refreshSeconds : 600;
    const list = !ok ? [] : answer.features.filter((f) => f && isNum(f.lat) && isNum(f.lng)).map((f) => {
      const t = f.time ? Date.parse(f.time) : NaN, ageS = isNum(t) && isNum(now) ? Math.max(0, Math.round((now - t) / 1000)) : null;
      const stale = ageS == null || ageS > 2 * refresh, w = uv(f.wind, f.windFrom), c = compass(f.windFrom);
      const windEn = isNum(f.wind) ? 'wind ' + n1(f.wind) + ' m/s' + (c ? ' from the ' + c[0] : '') : 'no wind value';
      const windEl = isNum(f.wind) ? 'άνεμος ' + n1(f.wind) + ' m/s' + (c ? ' από ' + c[1] : '') : 'χωρίς τιμή ανέμου';
      const a = ageText(ageS);
      return { id: String(f.id != null ? f.id : f.name), name: String(f.name || f.id), lat: f.lat, lng: f.lng, time: f.time || null, timeMs: isNum(t) ? t : null, ageS, age: a, stale,
        temp: isNum(f.temp) ? f.temp : null, humidity: isNum(f.humidity) ? f.humidity : null, wind: isNum(f.wind) ? f.wind : null, windFrom: isNum(f.windFrom) ? f.windFrom : null,
        rain10: isNum(f.rain10min) ? f.rain10min : null, u: w ? w.u : null, v: w ? w.v : null,
        line: [String(f.name || f.id) + ': ' + (isNum(f.temp) ? n1(f.temp) + ' °C' : 'no temperature') + ', ' + windEn + (isNum(f.humidity) ? ', humidity ' + Math.round(f.humidity) + '%' : '') + (isNum(f.rain10min) ? ', rain ' + n1(f.rain10min) + ' mm in 10 min' : '') + ' (' + a[0] + (stale ? ', old reading' : '') + ')',
          String(f.name || f.id) + ': ' + (isNum(f.temp) ? n1(f.temp) + ' °C' : 'χωρίς θερμοκρασία') + ', ' + windEl + (isNum(f.humidity) ? ', υγρασία ' + Math.round(f.humidity) + '%' : '') + (isNum(f.rain10min) ? ', βροχή ' + n1(f.rain10min) + ' mm σε 10 λεπτά' : '') + ' (' + a[1] + (stale ? ', παλιά μέτρηση' : '') + ')'] };
    });
    const fresh = list.filter((s) => !s.stale);
    const newest = list.reduce((m, s) => (s.timeMs != null && s.timeMs > m ? s.timeMs : m), 0) || null;
    const reason = ok ? null : (answer && Array.isArray(answer.reason) ? answer.reason : ['The weather stations are not answering right now.', 'Οι μετεωρολογικοί σταθμοί δεν απαντούν αυτή τη στιγμή.']);
    return { available: ok, reason, demo: !!(answer && answer.demo), refreshSeconds: refresh, list, fresh: fresh.length, total: list.length, newestMs: newest,
      source: answer && answer.attribution ? String(answer.attribution) : null };
  }

  // wind and temperature at a point, estimated from the stations that have a fresh, complete value
  function field(model, lat, lng) {
    let su = 0, sv = 0, sw = 0, st = 0, swt = 0; const kx = kmLng(lat);
    for (const s of model.list) {
      if (s.stale) continue;
      const dx = (s.lng - lng) * kx, dy = (s.lat - lat) * KM_LAT, w = 1 / (dx * dx + dy * dy + 25);
      if (s.u != null) { su += s.u * w; sv += s.v * w; sw += w; }
      if (s.temp != null) { st += s.temp * w; swt += w; }
    }
    if (!sw && !swt) return null;
    return { u: sw ? su / sw : null, v: sw ? sv / sw : null, temp: swt ? st / swt : null };
  }

  // stations whose reading is new since the previous answer (a different time stamp; with no time stamps, a different value)
  function diff(prev, next) {
    if (!prev || !next) return [];
    const old = {}; prev.list.forEach((s) => { old[s.id] = s; });
    return next.list.filter((s) => { const o = old[s.id]; if (!o) return false; if (s.time || o.time) return s.time !== o.time; return s.temp !== o.temp || s.wind !== o.wind || s.windFrom !== o.windFrom || s.rain10 !== o.rain10; });
  }

  function tempScale(model) { const t = model.list.filter((s) => !s.stale && s.temp != null).map((s) => s.temp); if (!t.length) return null; const lo = Math.floor(Math.min.apply(null, t) / 5) * 5, hi = Math.ceil(Math.max.apply(null, t) / 5) * 5; return { min: lo, max: hi > lo ? hi : lo + 5 }; }
  function raining(model) { return model.list.filter((s) => !s.stale && s.rain10 != null && s.rain10 > 0); }

  // points from another sheet (satellite fire detections, earthquakes): only what the answer holds, with an id to spot new ones
  function points(answer, kind) {
    const ok = !!(answer && answer.available !== false && Array.isArray(answer.features));
    const list = !ok ? [] : answer.features.filter((f) => f && isNum(f.lat) && isNum(f.lng)).map((f, i) => ({ id: String(f.id != null ? f.id : kind + ':' + f.lat + ':' + f.lng + ':' + (f.time || f.acqTime || i)), lat: f.lat, lng: f.lng, time: f.time || f.acqTime || null, magnitude: isNum(f.magnitude) ? f.magnitude : null, place: f.place || null }));
    return { available: ok, reason: ok ? null : (answer && Array.isArray(answer.reason) ? answer.reason : null), demo: !!(answer && answer.demo), list };
  }
  function fresh(prev, next) { if (!prev || !next) return []; const seen = {}; prev.list.forEach((p) => { seen[p.id] = 1; }); return next.list.filter((p) => !seen[p.id]); }

  function textRows(model) {
    const head = model.available ? [model.fresh + ' of ' + model.total + ' weather stations have a reading from the last ' + Math.round(2 * model.refreshSeconds / 60) + ' minutes.', model.fresh + ' από ' + model.total + ' μετεωρολογικούς σταθμούς έχουν μέτρηση των τελευταίων ' + Math.round(2 * model.refreshSeconds / 60) + ' λεπτών.'] : model.reason;
    const rows = [head].concat(model.list.map((s) => s.line));
    if (model.demo) rows.unshift(['Test values from the server test mode, not real readings.', 'Δοκιμαστικές τιμές από τη δοκιμαστική λειτουργία, όχι πραγματικές μετρήσεις.']);
    rows.push(['Wind and temperature between stations are estimated from the nearest stations. They are not measured there.', 'Ο άνεμος και η θερμοκρασία ανάμεσα στους σταθμούς εκτιμώνται από τους κοντινότερους σταθμούς. Δεν μετρήθηκαν εκεί.']);
    if (model.source) rows.push([model.source, model.source]);
    return rows;
  }
  return { uv, compass, ageText, stations, field, diff, tempScale, raining, points, fresh, textRows };
});
