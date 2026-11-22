'use strict';
/* Scatter widget data: one dot per event, time order, axis fractions, the catalogue's lower limit, missing values as null,
   empty states, bilingual strings, no forecast wording, and the saved real answer of /api/stack/earthquakes when it exists. */
const fs = require('fs');
const S = require('../../public/site/viz/scatter-data.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const near = (a, b, m) => ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, m + ' (got ' + a + ', want ' + b + ')');
const isPair = (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && !!p[0] && !!p[1];
const BAD = /risk|trend|predict|forecast|danger|overdue|κίνδυν|τάση|τάσεις|πρόβλεψ|πρόγνωσ|επικίνδυν/i;
const allStrings = (m) => { const out = []; (function walk(x) { if (typeof x === 'string') out.push(x); else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') for (const k of Object.keys(x)) { if (k !== 'url' && k !== 'sourceUrl' && k !== 'place' && k !== 'id') walk(x[k]); } })(m); return out; };

// ---- made-up answer ---------------------------------------------------------------------------------------------------
const made = {
  title: ['Test quakes', 'Δοκιμαστικοί σεισμοί'], available: true, period: '2020-01-01 / 2021-12-31', timeZone: 'UTC', minimumMagnitude: 4,
  units: { magnitude: 'magnitude (the type is given with each event)', depthKm: 'km below the surface' },
  source: ['Made-up source', 'Φτιαχτή πηγή'], note: ['Made-up note about the list.', 'Φτιαχτή σημείωση για τον κατάλογο.'],
  features: [
    { id: 'c', time: '2021-07-02T12:00:00.000Z', lat: 35, lng: 33, depthKm: 40, magnitude: 6, magnitudeType: 'mww', place: 'Somewhere C', reviewStatus: 'reviewed', url: 'https://example.org/c' },
    { id: 'a', time: '2020-01-01T00:00:00.000Z', lat: 35, lng: 33, depthKm: 0, magnitude: 4, magnitudeType: 'mb', place: 'Somewhere A', reviewStatus: 'reviewed', url: 'javascript:alert(1)' },
    { id: 'b', time: '2021-01-01T00:00:00.000Z', lat: 35, lng: 33, depthKm: 12.345, magnitude: 5, magnitudeType: 'mb', place: 'Somewhere B', url: 'https://example.org/b' },
    { id: 'd', time: '2021-08-01T00:00:00.000Z', depthKm: null, magnitude: 4.5, place: 'No depth' },
    { id: 'e', time: '2021-09-01T00:00:00.000Z', depthKm: 20, magnitude: null, place: 'No magnitude' },
    { id: 'f', time: 'not a time', depthKm: 20, magnitude: 5 },
    null,
  ],
};
const m = S.build(made);
eq(m.id, 'scatter', 'id');
eq(m.view, 'magnitude', 'default view');
eq(S.build(made, { view: 'depth' }).view, 'depth', 'opts.view depth');
eq(S.build(made, { view: 'nonsense' }).view, 'magnitude', 'unknown view falls back');
eq(m.points.map((p) => p.id), ['a', 'b', 'c', 'd', 'e'], 'one point per event with a time, in time order');
eq(m.points.map((p) => p.i), [0, 1, 2, 3, 4], 'index follows time order');
eq(m.counts, { events: 5, drawn: { magnitude: 4, depth: 4 }, noTime: 1, noMagnitude: 1, noDepth: 1 }, 'counts');
// time axis: the period, end day included
eq(m.axes.time.min, Date.UTC(2020, 0, 1), 'time axis starts at the period start');
eq(m.axes.time.max, Date.UTC(2022, 0, 1), 'time axis ends after the last day of the period');
near(m.points[0].x, 0, 'first event at the left edge');
near(m.points[1].x, 366 / 731, 'x is the share of the period elapsed (2020 is a leap year)');
eq(m.axes.time.ticks.map((t) => t.label[0]), ['2020', '2021', '2022'], 'year ticks');
near(m.axes.time.ticks[1].at, 366 / 731, 'tick position');
// magnitude axis: half a unit under the lower limit, top above the largest
eq([m.axes.magnitude.min, m.axes.magnitude.max], [3.5, 6.5], 'magnitude axis range');
eq(m.axes.magnitude.ticks.map((t) => t.v), [3.5, 4, 4.5, 5, 5.5, 6, 6.5], 'magnitude ticks every half unit');
eq(m.axes.magnitude.ticks[1].label, ['4.0', '4,0'], 'tick label pair with Greek decimal comma');
near(m.points[0].yMag, 0.5 / 3, 'yMag of magnitude 4');
near(m.points[2].yMag, 2.5 / 3, 'yMag of magnitude 6');
eq(m.points[4].yMag, null, 'no magnitude: null, not 0');
eq(m.points[4].size, null, 'no magnitude: no size');
eq([m.points[0].size, m.points[1].size, m.points[2].size], [0, 0.5, 1], 'size runs over the magnitudes that occur');
ok(m.points.every((p) => p.yMag === null || (p.yMag >= 0 && p.yMag <= 1)), 'yMag inside the axis');
// floor line
eq(m.floor.v, 4, 'floor value is the catalogue minimum');
near(m.floor.at, 0.5 / 3, 'floor position');
ok(/nothing below this is listed/.test(m.floor.label[0]) && isPair(m.floor.label), 'floor label says nothing below this is listed, both languages');
ok(m.points.every((p) => p.yMag === null || p.yMag >= m.floor.at - 1e-12), 'no dot under the floor line');
eq(S.build(Object.assign({}, made, { minimumMagnitude: undefined })).floor, null, 'no minimum in the answer: no floor line');
// depth axis: surface at 0, downward
eq([m.axes.depth.min, m.axes.depth.max], [0, 50], 'depth axis range');
eq(m.axes.depth.ticks.map((t) => t.v), [0, 10, 20, 30, 40, 50], 'depth ticks');
eq(m.points[0].yDepth, 0, 'depth 0 is a real value at the surface');
near(m.points[2].yDepth, 0.8, 'yDepth grows downward');
eq(m.points[3].yDepth, null, 'no depth: null, not 0');
eq(m.points[3].depthKm, null, 'null depth stays null');
ok(m.points[2].yDepth > m.points[1].yDepth, 'deeper event has the larger fraction (drawn lower)');
// units and titles from the answer
eq(m.axes.magnitude.title[0], made.units.magnitude, 'magnitude unit text is the answer text');
eq(m.axes.depth.title[0], made.units.depthKm, 'depth unit text is the answer text');
ok(isPair(m.axes.magnitude.title) && isPair(m.axes.depth.title) && isPair(m.axes.time.title), 'axis titles are pairs');
eq(m.n, made.title, 'title from the answer');
eq(S.build(Object.assign({}, made, { units: { depthKm: 'kilometres down' } })).axes.depth.title, ['kilometres down', 'χλμ'], 'unknown unit wording kept in English, plain Greek fallback');
// labels and text
eq(m.points[1].label[0], '1 Jan 2021, 00:00 UTC: magnitude 5.0 (mb), depth 12.35 km, Somewhere B', 'English label');
eq(m.points[1].label[1], '1 Ιαν 2021, 00:00 UTC: μέγεθος 5,0 (mb), βάθος 12,35 χλμ, Somewhere B', 'Greek label');
eq(m.points[1].depthKm, 12.345, 'the value itself is not rounded');
ok(/not given/.test(m.points[3].label[0]) && /δεν δίνεται/.test(m.points[3].label[1]), 'missing depth is said, not hidden');
eq(m.points[0].url, null, 'a link that is not http(s) is dropped');
eq(m.points[2].url, 'https://example.org/c', 'http(s) link kept');
ok(m.textRows.length >= m.points.length + 3, 'text rows: one per event plus source, note, limits');
m.points.forEach((p, i) => ok(m.textRows[i][0].indexOf(p.label[0]) === 0, 'text row ' + i + ' is event ' + p.id));
ok(m.textRows.every(isPair), 'every text row is an [en, el] pair');
ok(m.textRows.some((r) => r[0] === made.note[0] && r[1] === made.note[1]), 'the answer note is a text row, word for word');
ok(m.textRows.some((r) => /Source: Made-up source/.test(r[0]) && /2020-01-01 to 2021-12-31/.test(r[0]) && /Πηγή: Φτιαχτή πηγή/.test(r[1])), 'source and period row');
ok(m.textRows.some((r) => /^1 listed event has no usable time/.test(r[0])), 'the event without a time is reported');
ok(m.textRows.some((r) => /without a magnitude/.test(r[0])) && m.textRows.some((r) => /without a depth/.test(r[0])), 'missing values are reported');
ok(isPair(m.ariaLabel) && /5 earthquakes/.test(m.ariaLabel[0]) && /5 σεισμοί/.test(m.ariaLabel[1]), 'ariaLabel counts the events');
ok(/Magnitudes from 4\.0 to 6\.0/.test(m.ariaLabel[0]) && /Depths from 0 to 40 km/.test(m.ariaLabel[0]), 'ariaLabel gives the ranges');
eq(m.views.map((v) => v.k), ['magnitude', 'depth'], 'two views');
ok(m.views.every((v) => isPair(v.label) && isPair(v.yTitle) && isPair(v.aria)), 'views carry label, axis title and aria pairs');
ok(/depth downward/.test(m.views[1].aria[0]) && !/depth downward/.test(m.views[0].aria[0]), 'aria differs by view');
eq(S.build(made, { view: 'depth' }).ariaLabel, m.views[1].aria, 'ariaLabel follows opts.view');
eq(S.build(Object.assign({}, made, { features: [made.features[0]] })).strings.countLine, ['1 earthquake of magnitude 4.0 or more', '1 σεισμός μεγέθους 4,0 ή μεγαλύτερου'], 'singular count');
ok(allStrings(m).every((s) => !BAD.test(s)), 'no forecast or danger wording anywhere in the model: ' + allStrings(m).filter((s) => BAD.test(s)).join(' | '));
ok(allStrings(m).every((s) => !/[«»]/.test(s)), 'no guillemets');
ok(!('trend' in m) && !('fit' in m) && !('line' in m) && !('average' in m), 'the model has no line, fit or average');
eq(JSON.stringify(S.build(made)), JSON.stringify(m), 'build is pure: same input, same model');
const frozen = JSON.stringify(made); S.build(made); eq(JSON.stringify(made), frozen, 'the answer is not modified');

// ---- axes helpers -----------------------------------------------------------------------------------------------------
eq(S.magnitudeAxis([4.6, 5.3], 4.5).ticks.map((t) => t.v), [4, 4.5, 5, 5.5], 'magnitude axis 4.0 to 5.5 for 4.6..5.3 with floor 4.5');
eq((() => { const a = S.magnitudeAxis([5.5], 4.5); return [a.min, a.max]; })(), [4, 6], 'a largest value on a tick gets headroom');
eq(S.depthAxis([10, 62.88]).ticks.map((t) => t.v), [0, 20, 40, 60, 80], 'depth axis for 10..62.88');
eq(S.depthAxis([]).max, null, 'no depths: no depth axis');
eq(S.timeAxis(null, [Date.UTC(2019, 5, 1), Date.UTC(2021, 2, 1)]).ticks.map((t) => t.label[0]), ['2019', '2020', '2021', '2022'], 'no period: whole years around the events');
const short = S.timeAxis('2024-01-01 / 2024-04-30', []);
eq(short.ticks.map((t) => t.label), [['Jan 2024', 'Ιαν 2024'], ['Feb 2024', 'Φεβ 2024'], ['Mar 2024', 'Μαρ 2024'], ['Apr 2024', 'Απρ 2024'], ['May 2024', 'Μαΐ 2024']], 'short span: month ticks');
const wide = S.build(Object.assign({}, made, { period: '2021-01-01 / 2021-12-31' }));
ok(wide.points.every((p) => p.x >= 0 && p.x <= 1), 'an event outside the stated period widens the axis instead of leaving it');
eq(S.dateLabel(Date.UTC(2025, 10, 13, 9, 27), true), ['13 Nov 2025, 09:27 UTC', '13 Νοε 2025, 09:27 UTC'], 'date label');
eq(S.num(62.88), ['62.88', '62,88'], 'number text');

// ---- empty states -----------------------------------------------------------------------------------------------------
for (const [name, ans] of [['available false', Object.assign({}, made, { available: false })], ['no features', Object.assign({}, made, { features: [] })], ['features missing', { available: true }], ['null answer', null], ['only unusable events', Object.assign({}, made, { features: [{ id: 'x', time: 'bad' }] })]]) {
  const e = S.build(ans);
  ok(isPair(e.empty), name + ': empty sentence in both languages');
  eq(e.points, [], name + ': no points');
  ok(e.textRows.length >= 1 && e.textRows.every(isPair) && e.textRows[0][0] === e.empty[0], name + ': text rows start with the empty sentence');
  eq(e.ariaLabel, e.empty, name + ': ariaLabel is the empty sentence');
  eq(e.floor, null, name + ': no floor line');
  ok(e.views.length === 2 && e.views.every((v) => isPair(v.aria)), name + ': views still present');
}
ok(/not available/.test(S.build(Object.assign({}, made, { available: false })).empty[0]), 'available false says not available');
ok(/lists no earthquake/.test(S.build(Object.assign({}, made, { features: [] })).empty[0]), 'no features says the list is empty');
ok(/no usable time/.test(S.build(Object.assign({}, made, { features: [{ id: 'x', time: 'bad' }] })).empty[0]), 'events without a time are not called an empty list');
ok(S.build(Object.assign({}, made, { available: false })).textRows.some((r) => r[0] === made.note[0]), 'empty state keeps the note');

// ---- the saved real answer of /api/stack/earthquakes --------------------------------------------------------------------
const REAL = process.env.SCATTER_REAL || '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad/earthquakes.json';
if (fs.existsSync(REAL)) {
  const d = JSON.parse(fs.readFileSync(REAL, 'utf8')), r = S.build(d), rd = S.build(d, { view: 'depth' });
  const usable = d.features.filter((f) => Number.isFinite(new Date(f.time).getTime()));
  eq(r.empty, null, 'real: not empty');
  eq(r.points.length, usable.length, 'real: one point per event');
  eq(r.counts.events, d.counts.events, 'real: count equals the answer count');
  eq(r.points.map((p) => p.id).sort(), d.features.map((f) => f.id).sort(), 'real: same ids, none added, none lost');
  ok(r.points.every((p, i) => i === 0 || p.t >= r.points[i - 1].t), 'real: time order');
  for (const f of d.features) {
    const p = r.points.find((x) => x.id === f.id);
    ok(p && p.magnitude === f.magnitude && p.depthKm === f.depthKm && p.time === f.time && p.place === f.place && p.url === f.url && p.magnitudeType === f.magnitudeType, 'real ' + f.id + ': values carried unchanged');
    ok(p && p.x >= 0 && p.x <= 1 && p.yMag >= 0 && p.yMag <= 1 && p.yDepth >= 0 && p.yDepth <= 1, 'real ' + f.id + ': inside the axes');
    ok(p && Math.abs(p.yMag - (f.magnitude - r.axes.magnitude.min) / (r.axes.magnitude.max - r.axes.magnitude.min)) < 1e-12 && Math.abs(p.yDepth - f.depthKm / r.axes.depth.max) < 1e-12, 'real ' + f.id + ': fractions match the axes');
  }
  eq(r.floor.v, d.minimumMagnitude, 'real: floor is the answer minimum');
  ok(r.points.every((p) => p.magnitude >= r.floor.v), 'real: no listed event under the floor');
  eq(r.range.magnitude, [Math.min(...d.features.map((f) => f.magnitude)), Math.max(...d.features.map((f) => f.magnitude))], 'real: magnitude range');
  eq(r.range.depthKm, [Math.min(...d.features.map((f) => f.depthKm)), Math.max(...d.features.map((f) => f.depthKm))], 'real: depth range');
  ok(r.axes.magnitude.min < r.floor.v && r.axes.magnitude.max >= r.range.magnitude[1], 'real: magnitude axis holds the floor and the largest');
  ok(r.axes.depth.max >= r.range.depthKm[1] && r.axes.depth.min === 0, 'real: depth axis from the surface to below the deepest');
  eq([r.axes.time.min, r.axes.time.max], [Date.parse(d.period.split(' / ')[0] + 'T00:00:00Z'), Date.parse(d.period.split(' / ')[1] + 'T00:00:00Z') + 86400000], 'real: time axis is the catalogue period');
  eq(r.axes.magnitude.title[0], d.units.magnitude, 'real: magnitude unit from the answer');
  eq(r.axes.depth.title[0], d.units.depthKm, 'real: depth unit from the answer');
  ok(r.axes.magnitude.title[1] !== r.axes.magnitude.title[0] && r.axes.depth.title[1] !== r.axes.depth.title[0], 'real: units have Greek text');
  ok(r.textRows.some((t) => t[0] === d.note[0] && t[1] === d.note[1]), 'real: the sheet note (cluster, feed not connected) is a text row');
  ok(r.textRows.some((t) => t[0].indexOf(d.source[0]) >= 0 && t[0].indexOf('2015-01-01 to 2026-11-19') >= 0), 'real: source and period row');
  eq(r.textRows.length, r.points.length + 4, 'real: 14 event rows + floor + source + note + caption');
  ok(r.textRows.every(isPair) && isPair(r.ariaLabel) && isPair(rd.ariaLabel), 'real: pairs');
  ok(r.ariaLabel[0].indexOf(String(d.counts.events) + ' earthquakes') >= 0, 'real: ariaLabel count');
  eq(rd.points.map((p) => [p.x, p.yDepth, p.size]), r.points.map((p) => [p.x, p.yDepth, p.size]), 'real: both views are the same dots');
  ok(allStrings(r).every((s) => !BAD.test(s)), 'real: no forecast or danger wording: ' + allStrings(r).filter((s) => BAD.test(s)).join(' | '));
  ok(allStrings(r).every((s) => !/[«»]/.test(s)), 'real: no guillemets');
} else console.log('note: saved earthquakes answer not found at ' + REAL + ', real-data tests skipped');

console.log('scatter: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
