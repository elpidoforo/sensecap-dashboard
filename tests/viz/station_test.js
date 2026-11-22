'use strict';
/* Station data: one station of a live sheet at a time (met-stations, airports, air-stations): units only from the answer, missing
   values not filled in, the reading's own time and age from a clock that is handed in, stale after two refresh intervals, sway only
   for live + fresh + not made-up readings, the test-mode flag said in words, no ranking or judging words, bilingual strings.
   Small made-up input for the three sheet kinds AND the saved real answers when they exist. Run: node tests/viz/station_test.js */
const fs = require('fs');
const path = require('path');
const D = require('../../public/site/viz/station-data.js');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const pairs = (o, out = []) => { if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string')) out.push(o); else if (Array.isArray(o)) o.forEach((x) => pairs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => pairs(x, out)); return out; };
const T0 = Date.parse('2026-11-19T11:00:00Z'), MIN = 60000;
const RANK_EN = /\b(rank|ranking|ranked|best|worst|cleaner|cleanest|dirtier|dirtiest|good|bad|poor|healthy|unhealthy|safe|unsafe|dangerous|polluted|warmer than|colder than|higher than|lower than|more than|less than|compared with|versus|vs|indoor|classroom)\b/i;
const RANK_EL = /(κατάταξη|καλύτερ|χειρότερ|πιο καθαρ|καθαρός αέρας|επικίνδυν|ανθυγιειν|σε σύγκριση|περισσότερο από|λιγότερο από|τάξη μας|εσωτερικ)/i;

// ---- made-up met answer: two stations, one with holes
const met = { id: 'met-stations', title: ['Met stations', 'Μετεωρολογικοί σταθμοί'], kind: 'live', live: true, available: true, refreshSeconds: 600, demo: false,
  units: { temp: '°C', humidity: '%', wind: 'm/s', windFrom: 'degrees', rain10min: 'mm', rain24h: 'mm' },
  honesty: ['About every 10 minutes', 'Περίπου κάθε 10 λεπτά'], note: ['A «note» here.', 'Μια «σημείωση» εδώ.'], source: ['Src', 'Πηγή'], attribution: 'Credit line',
  features: [
    { id: 'A', name: 'Alpha', lat: 35, lng: 33, time: '2026-11-19T10:48:00Z', temp: 21.44, humidity: 60, wind: 3.5, windFrom: 181, rain10min: 0, rain24h: 1.2 },
    { id: 'B', name: 'Beta', lat: 35.1, lng: 33.1, time: '2026-11-19T10:59:40Z', temp: null, humidity: 55, wind: 0, windFrom: 90, rain10min: null, rain24h: 0 },
    { id: 'C', name: 'Gamma', time: null, temp: 9, humidity: null, wind: null, windFrom: null, rain10min: null, rain24h: null },
  ] };
let m = D.build(met, {}, T0);
ok(m.available && m.id === 'station' && m.sheet === 'met-stations' && m.station === 'A' && m.now === T0, 'first station shown by default');
ok(m.choices.map((c) => c.id).join() === 'A,B,C' && m.choices[1].name[0] === 'Beta', 'choices: every station, in the answer\'s order');
ok(m.tiles.map((t) => t.key).join() === 'temp,humidity,rain10min,rain24h', 'tiles: the fields the sheet has, wind left to the dial');
ok(m.tiles[0].value === 21.44 && m.tiles[0].text[0] === '21.44' && m.tiles[0].text[1] === '21,44' && m.tiles[0].unit[0] === '°C' && m.tiles[0].unitStated, 'value as given, Greek decimal comma, unit from the answer');
ok(m.tiles[0].label[0] === 'Alpha: air temperature 21.44 °C.' && m.tiles[0].label[1] === 'Alpha: θερμοκρασία αέρα 21,44 °C.', 'tile sentence in both languages');
ok(m.tiles[2].value === 0 && !m.tiles[2].missing && m.tiles[2].text[0] === '0', 'zero is a value, not a missing reading');
ok(m.time === '2026-11-19T10:48:00Z' && m.ageSeconds === 720 && m.ageText[0] === '12 min ago' && m.ageText[1] === 'πριν από 12 λεπτά', 'age from the reading\'s own time and the clock handed in');
ok(m.timeLine[0] === 'Measured 19 Nov 2026, 12:48 (Cyprus time)' && m.timeLine[1] === 'Μετρήθηκε 19 Νοεμβρίου 2026, 12:48 (ώρα Κύπρου)', 'time written in Cyprus time');
ok(m.stale === false && m.status.key === 'live' && m.status.label[0] === 'LIVE' && m.staleText === null && m.sway === true, 'live, fresh, not made up: may sway');
ok(m.dial && m.dial.speed === 3.5 && m.dial.from === 181 && m.dial.arrow && !m.dial.calm && m.dial.unit[0] === 'm/s' && m.dial.fromText[0] === '181°', 'dial: speed and the direction the wind comes from');
ok(m.dial.compass[0] === 'from the south' && m.dial.compass[1] === 'από νότια' && m.dial.label[0] === 'Alpha: wind speed 3.5 m/s, coming from the south (181°).', 'dial sentence');
ok(m.picks.length === 5 && m.picks[0].key === 'wind' && m.picks[0].value === 3.5 && m.picks[1].key === 'temp' && m.picks.every((p) => p.label.length === 2 && p.unit.length === 2), 'picks: dial first, then tiles');
ok(m.demo === false && m.demoText === null && !strings(m.textRows).some((s) => /made these values up/.test(s)), 'no test-mode words when the answer is not demo');
ok(m.textRows.every((r) => Array.isArray(r) && r.length === 2 && r[0] && r[1]) && m.textRows.some((r) => r[0] === 'Alpha: relative humidity 60 %.') && m.textRows.some((r) => r[0] === 'Credit: Credit line') && m.textRows.some((r) => r[0] === 'About every 10 minutes'), 'textRows: readings, honesty line, credit');
ok(!strings(m.textRows).concat(m.ariaLabel).some((s) => /Beta|Gamma/.test(s)), 'the text of one station never mentions another');
ok(m.ariaLabel[0].startsWith('Alpha, Met stations. Status: live.') && m.ariaLabel[1].includes('ζωντανά') && m.ariaLabel[0].includes('21.44 °C'), 'aria label is a sentence with the readings');
ok(!strings(m).some((s) => /[«»]/.test(s)) && m.note[0] === 'A "note" here.', 'no guillemets, also when the sheet note has them');
// compass words
const dir = (deg) => D.build(Object.assign({}, met, { features: [Object.assign({}, met.features[0], { windFrom: deg })] }), {}, T0).dial;
ok(dir(0).compass[0] === 'from the north' && dir(360).compass[0] === 'from the north' && dir(44).compass[0] === 'from the north-east' && dir(250).compass[0] === 'from the west' && dir(292).compass[1] === 'από δυτικά' && dir(293).compass[1] === 'από βορειοδυτικά', 'eight compass words');
ok(dir(400).from === null && !dir(400).arrow && dir(-5).from === null, 'a direction outside 0 to 360 is not drawn');
// second station: calm, holes
const b = D.select(m, 'B');
ok(b.station === 'B' && m.station === 'A' && b.dial.calm && !b.dial.arrow && b.dial.speed === 0 && b.sway === false, 'no wind: a speed of zero, no arrow, nothing sways');
ok(b.tiles[0].missing && b.tiles[0].value === null && b.tiles[0].text === null && b.tiles[0].label[0] === 'Beta: air temperature not reported.' && b.tiles[0].label[1].endsWith('δεν αναφέρθηκε.'), 'a null value is "not reported", nothing filled in');
ok(b.ageSeconds === 20 && b.ageText[0] === 'less than a minute ago', 'under a minute');
const c = D.select(m, 'C');
ok(c.time === null && c.ageSeconds === null && c.stale === true && c.status.key === 'notime' && c.sway === false && c.timeLine[0].includes('no time'), 'no time on the reading: stale, said so');
ok(c.dial && c.dial.speed === null && c.dial.from === null && !c.dial.arrow && c.dial.line[0] === 'Wind not reported', 'wind fields exist but are empty: dial says not reported');
ok(D.build(met, { station: 'B' }, T0).station === 'B' && D.build(met, { station: 'nope' }, T0).station === 'A' && D.select(m, 'nope') === m, 'opts.station, unknown id falls back');
// stale: age greater than two refresh intervals
const at = (min) => D.build(met, {}, Date.parse('2026-11-19T10:48:00Z') + min * MIN);
ok(at(20).stale === false && at(20).status.key === 'live', 'exactly two intervals old is not yet stale');
const old = at(21);
ok(old.stale === true && old.status.key === 'old' && old.status.label[0] === 'OLD READING' && old.status.label[1] === 'ΠΑΛΙΑ ΜΕΤΡΗΣΗ' && old.sway === false && old.staleText[0].includes('20 min') && old.textRows.some((r) => r[0].startsWith('Old reading')), 'older than two intervals: stale, no sway, says old reading');
ok(at(125).ageText[0] === '2 h ago' && at(60 * 72).ageText[0] === '3 days ago' && at(61).ageText[1] === 'πριν από 61 λεπτά' && at(1).ageText[1] === 'πριν από 1 λεπτό', 'age words');
ok(at(-1).ageSeconds === 0 && at(-30).ageSeconds === null && at(-30).stale && at(-30).status.key === 'unknown' && at(-30).sway === false, 'a reading ahead of the clock: age not known, nothing moves');
const noRef = D.build(Object.assign({}, met, { refreshSeconds: null }), {}, T0);
ok(noRef.stale && noRef.status.key === 'unknown' && !noRef.sway && noRef.staleText[0].includes('how often'), 'no refresh interval in the answer: cannot be called fresh');
const notLive = D.build(Object.assign({}, met, { live: false }), {}, T0);
ok(!notLive.stale && notLive.status.key === 'notlive' && notLive.sway === false, 'an answer that is not live never sways');
const demo = D.build(Object.assign({}, met, { demo: true }), {}, T0);
ok(demo.demo && demo.sway === false && demo.demoText[0].includes('made these values up') && demo.textRows.some((r) => r[1].includes('επινόησε')) && demo.ariaLabel[0].includes('Test mode'), 'test-mode values: said in words, never sway');
// retime and changed
const later = D.retime(m, T0 + 30 * MIN);
ok(later.station === 'A' && later.stale && later.ageText[0] === '42 min ago' && later.tiles[0].value === 21.44 && D.retime(D.select(m, 'B'), T0).station === 'B', 'retime: same answer, same station, a later clock');
const met2 = JSON.parse(JSON.stringify(met)); met2.features[0].temp = 22; met2.features[0].windFrom = 200; met2.features[0].time = '2026-11-19T10:58:00Z';
const m2 = D.build(met2, { station: 'A' }, T0);
ok(D.changed(m, m2).sort().join() === 'temp,wind' && D.changed(m, m).length === 0 && D.changed(m, D.select(m2, 'B')).length === 0 && D.changed(null, m2).length === 0, 'changed: only keys whose value moved, only for the same station');

// ---- made-up airport answer: fewer fields, one unit missing from the answer
const ap = { id: 'airports', title: ['Airport weather', 'Καιρός αεροδρομίων'], live: true, available: true, refreshSeconds: 600, units: { temp: '°C', windFrom: 'degrees' },
  features: [{ id: 'XX', name: 'Some airport', time: '2026-11-19T10:50:00Z', temp: 29, wind: 4.1, windFrom: 250 }] };
const a = D.build(ap, {}, T0);
ok(a.tiles.length === 1 && a.tiles[0].key === 'temp' && a.dial && a.dial.from === 250, 'airport: only temperature and wind, no humidity or rain invented');
ok(a.dial.unitStated === false && a.dial.unit[0] === 'unit not stated' && a.dial.unit[1] === 'η μονάδα δεν δηλώνεται' && a.dial.label[0].includes('4.1 (unit not stated)') && !/m\/s/.test(strings(a).join(' ')), 'a unit the answer does not give is never guessed');
const noDeg = D.build(Object.assign({}, ap, { units: { temp: '°C' } }), {}, T0);
ok(noDeg.dial.compass === null && noDeg.dial.fromText[0] === '250 (unit not stated)' && noDeg.tiles.length === 1, 'direction without a stated unit: the number, no compass word');
const noUnits = D.build({ live: true, available: true, refreshSeconds: 600, features: [{ id: 'Z', name: ['Zed', 'Ζήτα'], time: '2026-11-19T10:50:00Z', temp: 5 }] }, {}, T0);
ok(noUnits.tiles.length === 1 && !noUnits.tiles[0].unitStated && noUnits.tiles[0].label[0] === 'Zed: air temperature 5 (unit not stated).' && noUnits.dial === null && noUnits.stationName[1] === 'Ζήτα', 'no units map at all; no wind fields means no dial');

// ---- made-up air answer, shaped as stackdata.js airStations() builds it
const air = { id: 'air-stations', title: ['Official air-quality stations', 'Επίσημοι σταθμοί ποιότητας αέρα'], live: true, available: true, refreshSeconds: 1800, demo: false,
  units: { pm25: 'µg/m³, mean of one hour', pm10: 'µg/m³, mean of one hour' }, honesty: ['Hourly values, not yet verified', 'Ωριαίες τιμές, χωρίς επαλήθευση'],
  features: [{ id: 'S1', name: 'Made-up one', lat: 35, lng: 33, stationType: 'background', area: 'urban', pm25: 11.2, pm25HourEnds: '2026-11-19T10:00:00Z', pm10: 24, pm10HourEnds: '2026-11-19T09:00:00Z' },
    { id: 'S2', name: 'Made-up two', stationType: null, area: null, pm25: null, pm25HourEnds: null, pm10: 3, pm10HourEnds: '2026-11-19T10:00:00Z' }] };
const q = D.build(air, {}, Date.parse('2026-11-19T10:30:00Z'));
ok(q.dial === null && q.tiles.map((t) => t.key).join() === 'pm25,pm10' && q.picks.length === 2, 'air: two dust tiles, no wind dial');
ok(q.tiles[0].unit[0] === 'µg/m³, mean of one hour' && q.tiles[0].unit[1] === 'µg/m³, μέσος όρος μίας ώρας' && q.tiles[0].name[0] === 'Fine dust (PM2.5)', 'air: the unit with its averaging time, as the answer gives it');
ok(q.tiles[0].time === '2026-11-19T10:00:00Z' && q.tiles[1].time === '2026-11-19T09:00:00Z' && q.tiles[0].timeLine[0] === 'hour ended 19 Nov 2026, 12:00 (Cyprus time), 30 min ago' && q.tiles[1].timeLine[0].endsWith('90 min ago'), 'air: every value keeps the end of its own hour');
ok(q.time === '2026-11-19T10:00:00Z' && q.timeLine[0].startsWith('Newest hour ended') && q.ageSeconds === 1800 && !q.stale && q.status.key === 'live' && q.sway === false, 'air: the newest hour is the reading time; no arrow so nothing sways');
ok(q.facts.length === 2 && q.facts[0][0] === 'Station type, in the publisher\'s words: background' && q.facts[1][1].endsWith('urban'), 'air: station type and area quoted as the publisher\'s words');
const q2 = D.select(q, 'S2');
ok(q2.tiles[0].missing && q2.tiles[0].timeLine === null && q2.tiles[1].value === 3 && q2.facts.length === 0 && q2.time === '2026-11-19T10:00:00Z', 'air: a station with no fine-dust value');
ok(D.build(air, {}, Date.parse('2026-11-19T11:00:01Z')).stale, 'air: stale past two refresh intervals');
const allAir = strings(q).concat(strings(q2));
ok(!allAir.some((s) => RANK_EN.test(s)) && !allAir.some((s) => RANK_EL.test(s)), 'air: no word judges the air, ranks or brings in indoor readings');

// ---- unavailable and odd answers
const off = D.build({ id: 'air-stations', title: ['Air', 'Αέρας'], available: false, live: true, refreshSeconds: 1800, features: [], reason: ['Switched off here.', 'Κλειστό εδώ.'], source: ['S', 'Π'] }, {}, T0);
ok(!off.available && off.empty[0] === 'Switched off here.' && off.empty[1] === 'Κλειστό εδώ.' && off.textRows[0][0] === 'Switched off here.' && off.tiles.length === 0 && off.dial === null && off.choices.length === 0 && off.stale && !off.sway && off.ariaLabel[0] === 'Air: Switched off here.', 'unavailable: the sheet\'s own reason is the empty state');
for (const bad of [null, undefined, 'x', {}, { available: true, features: [] }, { features: 'x' }, { available: false }]) { const x = D.build(bad, {}, T0); ok(!x.available && x.empty[0] && x.empty[1] && x.tiles.length === 0 && x.picks.length === 0 && x.textRows.length >= 1 && x.sway === false, 'honest empty state: ' + JSON.stringify(bad)); }
ok(D.retime(off, T0 + 1).available === false && D.changed(off, off).length === 0, 'retime and changed on an empty model');
const dup = D.build({ live: true, available: true, refreshSeconds: 60, units: { temp: '°C' }, features: [{ name: 'N1', temp: 1 }, { id: 'x', name: 'N2', temp: 2 }, { id: 'x', name: 'N3', temp: 3 }, null, 7] }, {}, T0);
ok(dup.choices.length === 3 && new Set(dup.choices.map((c) => c.id)).size === 3 && dup.choices[0].id === 'station-1', 'ids made when absent or repeated; junk rows dropped');
ok(D.build(met, {}, undefined).stale === true && D.build(met, {}, undefined).sway === false, 'no clock handed in: nothing is called fresh');

// ---- the saved real answers
const dir0 = process.env.STATION_REAL || '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad';
const load = (n) => { try { return JSON.parse(fs.readFileSync(path.resolve(dir0, n + '.json'), 'utf8')); } catch (e) { console.log('note: saved real answer not found (' + path.join(dir0, n + '.json') + '), its checks are skipped'); return null; } };
const check = (real, r) => {
  const all = strings(r), ps = pairs(r);
  ok(!all.some((s) => RANK_EN.test(s)) && !all.some((s) => RANK_EL.test(s)), real.id + ': no ranking, judging or indoor words');
  ok(ps.length > 20 && ps.every((p) => p[0].trim() && p[1].trim()), real.id + ': every pair has English and Greek');
  ok(!all.some((s) => /[«»]/.test(s)), real.id + ': no guillemets');
  let good = true;
  for (const f of real.features) {
    const v = D.select(r, f.id);
    for (const t of v.tiles) { if (t.value !== (typeof f[t.key] === 'number' ? f[t.key] : null)) good = false; if (t.unit[0] !== real.units[t.key]) good = false; }
    if (v.dial && (v.dial.speed !== f.wind || v.dial.from !== f.windFrom || v.dial.unit[0] !== real.units.wind)) good = false;
    if (v.time !== f.time) good = false;
  }
  ok(good, real.id + ': every tile and dial number is the answer\'s own value with the answer\'s own unit');
  ok(r.demo === (real.demo === true) && (!r.demo || (r.sway === false && r.textRows.some((x) => x[0].startsWith('Test mode')))), real.id + ': the answer\'s demo flag is kept and said; made-up values never sway');
  ok(r.honesty[0] === real.honesty[0] && r.textRows.some((x) => x[0] === real.honesty[0]) && r.textRows.some((x) => x[0] === real.note[0]), real.id + ': the sheet\'s honesty line and note are in the text, word for word');
};
const rm = load('met-stations');
if (rm) {
  const now = Date.parse(rm.generated) + 12 * MIN, r = D.build(rm, {}, now);
  ok(r.available && r.sheet === 'met-stations' && r.choices.length === rm.features.length && r.station === rm.features[0].id, 'real met: one choice per station');
  ok(r.tiles.map((t) => t.key).join() === 'temp,humidity,rain10min,rain24h' && r.dial && r.dial.unit[0] === 'm/s' && r.ageText[0] === '12 min ago' && !r.stale && r.status.key === 'live', 'real met: four tiles, a dial, 12 minutes old');
  ok(D.retime(r, now + 9 * MIN).stale && D.retime(r, now + 9 * MIN).status.key === 'old', 'real met: stale after 20 minutes');
  check(rm, r);
}
const ra = load('airports');
if (ra) {
  const r = D.build(ra, {}, Date.parse(ra.generated) + 5 * MIN);
  ok(r.available && r.tiles.length === 1 && r.tiles[0].key === 'temp' && r.dial && r.dial.fromText[0] === ra.features[0].windFrom + '°' && r.honesty[0].includes('not flights'), 'real airports: temperature tile and dial only; weather, not flights');
  check(ra, r);
}
const rq = load('air-stations');
if (rq) {
  const r = D.build(rq, {}, Date.parse(rq.generated));
  if (rq.available === false) {
    ok(!r.available && r.empty[0] === rq.reason[0] && r.empty[1] === rq.reason[1] && r.tiles.length === 0 && r.choices.length === 0, 'real air: unavailable, the sheet\'s own reason is shown');
    ok(r.title[1] === rq.title[1] && r.textRows.some((x) => x[0].startsWith('Source: European Environment Agency')) && !strings(r.textRows).some((s) => /\d\s*µg/.test(s)), 'real air: title and source kept, no value shown');
  } else { ok(r.available && r.dial === null && r.tiles.every((t) => t.key === 'pm25' || t.key === 'pm10'), 'real air: dust tiles only'); }
}
console.log('station: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
