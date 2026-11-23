/*
  liveflow-data.js: one "run" of the Live Board pipeline = one fetch of the live feeds. Pure: no DOM, no clock, no network.
  build({met, airports, air, fires, quakes}, prevRun, now) -> { feeds[], totals, textRows, ariaLabel }.
  For each feed: how many stations or records the answer holds, how many readings are fresh, how many are NEW since the
  previous run, and the newest reading in words. A feed that does not answer keeps its own reason and counts nothing.
  Needs live-data.js (stations, points, diff, fresh). Nothing is ranked; feeds stay in a fixed order.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./live-data.js'));
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.liveflowData = factory(root.SC.viz.liveData); }
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const n1 = (v) => (isNum(v) ? v.toFixed(1) : '–');
  const DEFS = [
    { id: 'met', kind: 'stations', hue: 'cyan', name: ['Weather stations', 'Μετεωρολογικοί σταθμοί'], sub: ['Met Office, every 10 min', 'Μετεωρολογική, ανά 10 λεπτά'], sheet: ['Weather now', 'Καιρός τώρα'], noun: ['stations', 'σταθμοί'] },
    { id: 'airports', kind: 'stations', hue: 'cyan', name: ['Airport weather', 'Καιρός αεροδρομίων'], sub: ['airport reports', 'αναφορές αεροδρομίων'], sheet: ['Airports', 'Αεροδρόμια'], noun: ['airports', 'αεροδρόμια'] },
    { id: 'air', kind: 'air', hue: 'green', name: ['Official air stations', 'Επίσημοι σταθμοί αέρα'], sub: ['outdoor, hourly', 'εξωτερικοί, ανά ώρα'], sheet: ['Air quality', 'Ποιότητα αέρα'], noun: ['stations', 'σταθμοί'] },
    { id: 'fires', kind: 'points', hue: 'red', name: ['Satellite heat', 'Θερμότητα από δορυφόρο'], sub: ['NASA FIRMS, last 24 h', 'NASA FIRMS, 24 ώρες'], sheet: ['Fire hotspots', 'Θερμές κηλίδες'], noun: ['detections', 'ανιχνεύσεις'] },
    { id: 'quakes', kind: 'points', hue: 'violet', name: ['Earthquake list', 'Λίστα σεισμών'], sub: ['USGS, since 2015', 'USGS, από το 2015'], sheet: ['Earthquakes', 'Σεισμοί'], noun: ['events', 'γεγονότα'] },
  ];
  const NOANS = ['not answering right now', 'δεν απαντά αυτή τη στιγμή'];

  function stationFeed(def, answer, prev, now) {
    const m = L.stations(answer, now), fresh = m.fresh, changed = prev && prev.model ? L.diff(prev.model, m) : [];
    const newest = m.list.filter((s) => s.timeMs != null).sort((a, b) => b.timeMs - a.timeMs)[0] || null;
    return { model: m, available: m.available, reason: m.available ? null : (m.reason || NOANS), demo: m.demo, total: m.total, fresh, added: changed.length, newIds: changed.map((s) => s.id),
      dots: m.list.map((s) => ({ id: s.id, state: s.stale ? 'old' : 'fresh' })), newest: newest ? { name: newest.name, text: newest.line, age: newest.age } : null };
  }
  function airFeed(def, answer, prev, now) {
    const ok = !!(answer && answer.available !== false && Array.isArray(answer.features)), list = ok ? answer.features : [];
    const stamp = (f) => f.pm25HourEnds || f.pm10HourEnds || f.time || null, refresh = ok && isNum(answer.refreshSeconds) ? answer.refreshSeconds : 3600;
    const rows = list.map((f, i) => { const t = stamp(f) ? Date.parse(stamp(f)) : NaN, age = isNum(t) ? Math.max(0, Math.round((now - t) / 1000)) : null; return { id: String(f.id != null ? f.id : f.name || i), name: String(f.name || f.id || ''), t: isNum(t) ? t : null, stamp: stamp(f), age, stale: age == null || age > 2 * refresh, pm25: isNum(f.pm25) ? f.pm25 : null, pm10: isNum(f.pm10) ? f.pm10 : null }; });
    const old = {}; if (prev && prev.rows) prev.rows.forEach((r) => { old[r.id] = r.stamp; });
    const added = prev && prev.rows ? rows.filter((r) => r.id in old && old[r.id] !== r.stamp) : [];
    const nw = rows.filter((r) => r.t != null).sort((a, b) => b.t - a.t)[0] || null, a = nw ? L.ageText(nw.age) : null;
    return { rows, available: ok, reason: ok ? null : (answer && Array.isArray(answer.reason) ? answer.reason : NOANS), demo: !!(answer && answer.demo), total: rows.length, fresh: rows.filter((r) => !r.stale).length, added: added.length, newIds: added.map((r) => r.id),
      dots: rows.map((r) => ({ id: r.id, state: r.stale ? 'old' : 'fresh' })),
      newest: nw ? { name: nw.name, age: a, text: [nw.name + ': ' + (nw.pm25 != null ? 'PM2.5 ' + n1(nw.pm25) : 'no PM2.5 value') + (nw.pm10 != null ? ', PM10 ' + n1(nw.pm10) : '') + ' µg/m³, mean of one hour (' + a[0] + ')', nw.name + ': ' + (nw.pm25 != null ? 'PM2.5 ' + n1(nw.pm25) : 'χωρίς τιμή PM2.5') + (nw.pm10 != null ? ', PM10 ' + n1(nw.pm10) : '') + ' µg/m³, μέσος όρος μίας ώρας (' + a[1] + ')'] } : null };
  }
  function pointFeed(def, answer, prev) {
    const p = L.points(answer, def.id), add = prev && prev.points ? L.fresh(prev.points, p) : [];
    const nw = p.list.filter((x) => x.time).sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0] || null;
    const day = nw && nw.time ? String(nw.time).slice(0, 10) : '';
    return { points: p, available: p.available, reason: p.available ? null : (p.reason || NOANS), demo: p.demo, total: p.list.length, fresh: p.list.length, added: add.length, newIds: add.map((x) => x.id),
      dots: p.list.map((x) => ({ id: x.id, state: 'fresh' })),
      newest: nw ? { name: nw.place || day, age: null, text: def.id === 'quakes' ? ['Latest in the list: ' + day + (nw.magnitude != null ? ', magnitude ' + n1(nw.magnitude) : '') + (nw.place ? ', ' + nw.place : ''), 'Τελευταίο στη λίστα: ' + day + (nw.magnitude != null ? ', μέγεθος ' + n1(nw.magnitude) : '') + (nw.place ? ', ' + nw.place : '')] : ['Latest detection: ' + day + ' near ' + nw.lat.toFixed(2) + '°, ' + nw.lng.toFixed(2) + '°. A detection is not a confirmed fire.', 'Τελευταία ανίχνευση: ' + day + ' κοντά στο ' + nw.lat.toFixed(2) + '°, ' + nw.lng.toFixed(2) + '°. Η ανίχνευση δεν είναι επιβεβαιωμένη φωτιά.'] } : null };
  }

  function build(answers, prevRun, now) {
    answers = answers || {}; const prevBy = {}; if (prevRun && prevRun.feeds) prevRun.feeds.forEach((f) => { prevBy[f.id] = f; });
    const feeds = DEFS.map((def) => {
      const a = answers[def.id], prev = prevBy[def.id] || null;
      const core = def.kind === 'stations' ? stationFeed(def, a, prev, now) : def.kind === 'air' ? airFeed(def, a, prev, now) : pointFeed(def, a, prev);
      const f = Object.assign({ id: def.id, kind: def.kind, hue: def.hue, name: def.name, sub: def.sub, sheet: def.sheet, noun: def.noun, first: !prev }, core);
      const marks = {}; f.newIds.forEach((id) => { marks[id] = 1; }); f.dots.forEach((d) => { if (marks[d.id]) d.isNew = true; });
      f.line = !f.available ? [def.name[0] + ': ' + f.reason[0], def.name[1] + ': ' + f.reason[1]]
        : [def.name[0] + ': ' + f.total + ' ' + def.noun[0] + (def.kind !== 'points' ? ', ' + f.fresh + ' with a fresh reading' : '') + (f.first ? '' : ', ' + f.added + ' new since the last fetch') + (f.newest ? '. ' + f.newest.text[0] : '') + (f.demo ? ' (test values)' : ''),
          def.name[1] + ': ' + f.total + ' ' + def.noun[1] + (def.kind !== 'points' ? ', ' + f.fresh + ' με φρέσκια μέτρηση' : '') + (f.first ? '' : ', ' + f.added + ' νέες από την τελευταία λήψη') + (f.newest ? '. ' + f.newest.text[1] : '') + (f.demo ? ' (δοκιμαστικές τιμές)' : '')];
      return f;
    });
    const up = feeds.filter((f) => f.available);
    const totals = { feeds: feeds.length, answering: up.length, records: up.reduce((s, f) => s + f.total, 0), fresh: up.reduce((s, f) => s + f.fresh, 0), added: up.reduce((s, f) => s + f.added, 0), demo: feeds.some((f) => f.demo) };
    const head = [totals.answering + ' of ' + totals.feeds + ' live feeds answered; ' + totals.records + ' stations and records in their answers.', totals.answering + ' από ' + totals.feeds + ' ζωντανές πηγές απάντησαν· ' + totals.records + ' σταθμοί και εγγραφές στις απαντήσεις τους.'];
    return { id: 'liveflow', now, feeds, totals, textRows: [head].concat(feeds.map((f) => f.line)), ariaLabel: head,
      stages: [['Collect', 'Συλλογή'], ['Check', 'Έλεγχος'], ['Label', 'Ετικέτα'], ['Show', 'Προβολή']] };
  }
  return { build, DEFS };
});
