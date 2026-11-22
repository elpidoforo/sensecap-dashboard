'use strict';
/* Hour strip data: one station and one pollutant at a time, rounded numbers, blank hours, the fixed per-pollutant scale,
   the replay sentence, select(), no ranking text, bilingual strings. Small made-up input AND the saved real air-day answer
   (skipped with a note when the file is not there). Run: node tests/viz/hourstrip_test.js */
const fs = require('fs');
const D = require('../../public/site/viz/hourstrip-data.js');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const pairs = (o, out = []) => { if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string')) out.push(o); else if (Array.isArray(o)) o.forEach((x) => pairs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => pairs(x, out)); return out; };
const RANK_EN = /\b(rank|ranking|ranked|best|worst|cleanest|dirtiest|most polluted|least polluted|top station|leader|leading|compared with other)\b/i;
const RANK_EL = /(κατάταξη|καλύτερ|χειρότερ|πιο μολυσμέν|πιο καθαρ|πρώτος σταθμός)/i;

// ---- small made-up answer: 4 hours on 3 March 2021, three stations
const made = { available: true, unit: 'µg/m³', units: { no2: 'µg/m³ nitrogen dioxide', o3: 'µg/m³ ozone' }, period: '2021-03-03',
  hours: ['2021-03-03T00:00', '2021-03-03T01:00', '2021-03-03T02:00', '2021-03-03T03:00'],
  source: ['Src', 'Πηγή'], note: ['A note.', 'Μια σημείωση.'],
  features: [
    { id: 'a', name: ['Alpha', 'Άλφα'], type: ['Traffic', 'Κυκλοφοριακός'], no2: [null, null, null, null], o3: [10, 20.4, 20.5, 0] },
    { id: 'b', name: ['Beta', 'Βήτα'], type: ['Urban', 'Οικιστικός'], no2: [4.4, null, 12.6, 43], o3: [null, 61.2, 0.4, -0.2] },
    { id: 'c', name: ['Gamma', 'Γάμμα'], no2: [1, 2, 3, 'x'], o3: [5, 5, 5, 5] },
  ] };
const before = JSON.stringify(made);
let m = D.build(made);
ok(JSON.stringify(made) === before, 'the answer is not changed');
ok(m.available && m.id === 'hourstrip' && m.live === false, 'available, not live');
ok(m.date === '2021-03-03' && m.dateText[0] === '3 March 2021' && m.dateText[1] === '3 Μαρτίου 2021', 'date read from the hours, both languages');
ok(m.replay[0] === 'Replay of 3 March 2021, not live' && m.replay[1].includes('3 Μαρτίου 2021') && m.replay[1].includes('όχι ζωντανά'), 'replay sentence carries the date of the data');
ok(m.hours.length === 4 && m.hours[2].clock === '02:00' && m.hours[2].hour === 2 && m.hours[2].i === 2, 'hours');
ok(m.choices.map((c) => c.id).join() === 'a,b,c', 'choices keep the order of the answer');
ok(m.choices.every((c) => Object.keys(c).sort().join() === 'id,measured,name,type'), 'choices carry no values (id, name, type, hours measured only)');
ok(m.choices[0].measured.no2 === 0 && m.choices[0].measured.o3 === 4 && m.choices[1].measured.no2 === 3 && m.choices[2].measured.no2 === 3, 'hours measured per station and pollutant');
ok(m.choices[2].type === null && m.choices[0].type[1] === 'Κυκλοφοριακός', 'station type, null when the answer has none');
ok(m.pollutants.map((p) => p.k).join() === 'no2,o3' && m.pollutants[0].name[0] === 'Nitrogen dioxide (NO₂)' && m.pollutants[1].name[1] === 'Όζον (O₃)', 'pollutants named in both languages');
ok(m.pollutants.every((p) => p.unit[0] === 'µg/m³'), 'unit from the answer');
// fixed scale: 0 .. day maximum over ALL stations rounded up to the next ten
ok(m.pollutants[0].scale.min === 0 && m.pollutants[0].scale.max === 50, 'no2 scale 0..50 (max 43 -> 50)');
ok(m.pollutants[1].scale.max === 70, 'o3 scale 0..70 (max 61.2 -> 70)');
ok(/0 to 50 µg\/m³/.test(m.pollutants[0].scale.text[0]) && /0 έως 50 µg\/m³/.test(m.pollutants[0].scale.text[1]) && /not a health limit/.test(m.pollutants[0].scale.text[0]) && /όχι όριο υγείας/.test(m.pollutants[0].scale.text[1]), 'scale ends are written in the model, both languages');
// default view: first station of the answer with a measurement for the first pollutant (a has no no2 -> b)
ok(m.station === 'b' && m.pollutant === 'no2' && m.view === m.views.b.no2, 'default view skips a station with nothing to show');
let v = m.view;
ok(v.cells.length === 4 && v.measured === 3 && v.blank === 1, 'one cell per hour, measured and blank counted');
ok(v.cells[0].value === 4.4 && v.cells[0].text === '4' && v.cells[2].text === '13' && v.cells[3].text === '43', 'number shown is the rounded value, the value itself is kept');
ok(v.cells[1].state === 'blank' && v.cells[1].value === null && v.cells[1].text === null && v.cells[1].t === null, 'blank hour: no value, no number, no colour');
ok(Math.abs(v.cells[3].t - 43 / 50) < 1e-12 && Math.abs(v.cells[0].t - 4.4 / 50) < 1e-12, 't = value / fixed scale');
ok(v.cells[1].label[0].includes('no reported measurement') && v.cells[1].label[1].includes('χωρίς δημοσιευμένη μέτρηση'), 'blank hour sentence');
ok(v.cells[3].label[0] === '03:00, Beta: 43 µg/m³ nitrogen dioxide' && v.cells[3].label[1] === '03:00, Βήτα: 43 µg/m³ διοξείδιο του αζώτου', 'hour sentence');
ok(m.views.c.no2.cells[3].state === 'blank', 'a non-number is a blank hour');
ok(m.views.c.no2.scale === m.views.b.no2.scale && m.views.a.o3.scale.max === m.views.b.o3.scale.max, 'the scale is the same for every station');
// zero and tiny negatives
ok(m.views.a.o3.cells[3].value === 0 && m.views.a.o3.cells[3].text === '0' && m.views.a.o3.cells[3].t === 0 && m.views.a.o3.cells[3].state === 'measured', 'zero is a measurement');
ok(m.views.b.o3.cells[3].text === '0' && m.views.b.o3.cells[3].t === 0 && m.views.b.o3.cells[2].text === '0', 'small negative: prints 0 (no minus zero), colour clamped at 0');
ok(m.views.a.o3.cells[1].text === '20' && m.views.a.o3.cells[2].text === '21', 'rounding 20.4 -> 20, 20.5 -> 21');
ok(Object.values(m.views).every((s) => Object.values(s).every((x) => x.cells.every((c) => c.t === null || (c.t >= 0 && c.t <= 1)))), 't within 0..1 everywhere');
// a station with nothing at all
ok(m.views.a.no2.measured === 0 && m.views.a.no2.empty && m.views.a.no2.empty[0].includes('no nitrogen dioxide') && m.views.a.no2.cells.every((c) => c.state === 'blank'), 'station without measurements: honest sentence, all blank');
ok(m.views.b.no2.empty === null, 'no empty sentence when there are measurements');
// textRows and aria
ok(m.textRows === v.textRows && m.ariaLabel === v.ariaLabel, 'model textRows / ariaLabel are those of the chosen view');
ok(v.textRows.filter((r) => /^\d\d:00, Beta/.test(r[0])).length === 4, 'textRows: one row per hour');
ok(v.textRows.some((r) => r[0] === 'Unit: µg/m³') && v.textRows.some((r) => r[0] === 'Source: Src' && r[1] === 'Πηγή: Πηγή') && v.textRows.some((r) => r[0].startsWith('Period: 3 March 2021')) && v.textRows.some((r) => r[0] === 'A note.'), 'textRows: unit, source, period, note');
ok(v.textRows[0][0].includes('not live') && v.textRows[0][1].includes('όχι ζωντανά'), 'textRows start by saying it is a replay');
ok(v.ariaLabel[0].includes('Beta') && v.ariaLabel[0].includes('3 of 4 hours') && v.ariaLabel[0].includes('not live') && v.ariaLabel[1].includes('3 από 4 ώρες'), 'aria label');
ok(v.textRows.every((r) => Array.isArray(r) && r.length === 2 && r[0] && r[1]), 'textRows are pairs');
// opts and select
let m2 = D.build(made, { station: 'c', pollutant: 'o3' });
ok(m2.station === 'c' && m2.pollutant === 'o3' && m2.view.cells[0].text === '5' && m2.unit[0] === 'µg/m³', 'opts.station / opts.pollutant');
ok(D.build(made, { station: 'a' }).station === 'a' && D.build(made, { station: 'a' }).view.measured === 0, 'an asked station is shown even when it has nothing');
ok(D.build(made, { station: 'zzz', pollutant: 'pm10' }).station === 'b', 'unknown choice falls back to the default');
const s1 = D.select(m, { pollutant: 'o3' });
ok(s1 !== m && s1.station === 'b' && s1.pollutant === 'o3' && s1.view === m.views.b.o3 && s1.textRows === m.views.b.o3.textRows && m.pollutant === 'no2', 'select: other pollutant, the first model is untouched');
ok(D.select(m, { station: 'c' }).view === m.views.c.no2 && D.select(m, { station: 'nope' }).station === 'b' && D.select(m, {}).view === m.view, 'select: other station; unknown ids keep the current view');
// shapes that must not break it
const noO3 = JSON.parse(before); noO3.features.forEach((f) => delete f.o3);
ok(D.build(noO3).pollutants.map((p) => p.k).join() === 'no2', 'a pollutant without any series is not offered');
const short = JSON.parse(before); short.features[1].no2 = [1, 2];
ok(D.build(short).views.b.no2.measured === 0 && D.build(short).station === 'c', 'a series not aligned with the hours is not used');
const noUnit = JSON.parse(before); delete noUnit.unit;
ok(D.build(noUnit).pollutants[0].unit[0] === 'µg/m³', 'unit taken from units when unit is missing');
const two = JSON.parse(before); two.hours[3] = '2021-03-04T00:00';
ok(D.build(two).replay[0] === 'Replay of 3 March 2021 to 4 March 2021, not live', 'hours over two dates: both dates in the replay sentence');
const allNull = JSON.parse(before); allNull.features.forEach((f) => { f.no2 = [null, null, null, null]; });
ok(D.build(allNull).pollutants[0].scale === null && D.build(allNull).view.measured === 0 && D.build(allNull).view.empty, 'no measurement at all: no scale, honest sentence');
for (const bad of [null, {}, { available: false, hours: made.hours, features: made.features }, { hours: [], features: [] }, { hours: ['yesterday'], features: made.features }, { hours: made.hours, features: [{ id: 'x', name: ['X', 'Χ'] }] }]) {
  const e = D.build(bad); ok(!e.available && e.empty[0] && e.empty[1] && e.choices.length === 0 && e.view === null && e.textRows.length === 1 && D.select(e, { station: 'a' }) === e, 'honest empty state: ' + JSON.stringify(bad).slice(0, 50));
}
const all = strings(m);
ok(!all.some((s) => RANK_EN.test(s)) && !all.some((s) => RANK_EL.test(s)), 'no ranking words in any string');
ok(pairs(m).length > 40 && pairs(m).every((p) => p[0].trim() && p[1].trim()), 'every pair has English and Greek');
ok(!all.some((s) => /[«»]/.test(s)), 'no guillemets');
ok(m.ui.play[0] === 'Play' && m.ui.pause[1] === 'Παύση', 'button words are in the model');

// ---- the saved real answer of /api/stack/air-day (HOURSTRIP_REAL overrides the path)
const REAL = process.env.HOURSTRIP_REAL || '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad/air-day.json';
if (!fs.existsSync(REAL)) console.log('note: saved air-day answer not found (' + REAL + '), real-data checks skipped');
else {
  const a = JSON.parse(fs.readFileSync(REAL, 'utf8')), r = D.build(a);
  ok(r.available && r.hours.length === 24 && r.hours[0].clock === '00:00' && r.hours[23].clock === '23:00', 'real: 24 hours');
  ok(r.replay[0] === 'Replay of 15 May 2024, not live' && r.replay[1] === 'Επανάληψη, 15 Μαΐου 2024, όχι ζωντανά' && r.date === '2024-05-15', 'real: replay of 15 May 2024');
  ok(r.choices.length === a.features.length && r.choices.every((c, i) => c.id === a.features[i].id && c.name[0] === a.features[i].name[0]), 'real: every station is a choice, in the order of the answer');
  ok(r.pollutants.map((p) => p.k).join() === 'no2,o3' && r.pollutants.every((p) => p.unit[0] === 'µg/m³'), 'real: NO2 and O3 in µg/m³');
  // independent check of every cell and of the scale
  let good = true, counts = true;
  for (const p of r.pollutants) {
    const vals = a.features.flatMap((f) => f[p.k]).filter((x) => typeof x === 'number');
    const top = Math.ceil(Math.max(...vals) / 10) * 10;
    if (p.scale.min !== 0 || p.scale.max !== top || !p.scale.text[0].includes('0 to ' + top + ' µg/m³')) good = false;
    for (const f of a.features) {
      const vw = r.views[f.id][p.k];
      if (vw.cells.length !== 24) good = false;
      vw.cells.forEach((c, i) => {
        const x = f[p.k][i];
        if (x === null) { if (c.state !== 'blank' || c.text !== null || c.t !== null || c.value !== null) good = false; }
        else if (c.value !== x || c.text !== String(Math.round(x)) || Math.abs(c.t - x / top) > 1e-12 || c.iso !== a.hours[i]) good = false;
      });
      if (vw.measured !== f[p.k].filter((x) => x !== null).length || vw.measured + vw.blank !== 24 || r.choices.find((c) => c.id === f.id).measured[p.k] !== vw.measured) counts = false;
    }
  }
  ok(good, 'real: every cell is the published value, rounded for display, on the fixed scale');
  ok(counts, 'real: measured / blank hours agree with the answer');
  ok(r.pollutants[0].scale.max === 60 && r.pollutants[1].scale.max === 120, 'real: scale ends 0..60 (NO2) and 0..120 (O3)');
  ok(r.station === a.features[0].id && r.pollutant === 'no2', 'real: first view is the first station of the answer');
  const blanks = a.features.filter((f) => f.no2.every((x) => x === null));
  ok(blanks.length === 2 && blanks.every((f) => r.views[f.id].no2.empty && r.views[f.id].no2.cells.every((c) => c.state === 'blank')), 'real: the two stations without data say so and stay hatched');
  const lim = r.views.station_3 && r.views.station_3.no2;
  ok(lim && lim.blank === 2 && lim.cells[10].state === 'blank' && lim.cells[15].state === 'blank', 'real: the blank hours of one station are blank (10:00 and 15:00)');
  ok(r.view.textRows.length >= 24 + 6 && r.view.textRows.some((t) => t[0].startsWith('Source: Cyprus Department of Labour Inspection')) && r.view.textRows.some((t) => t[0] === a.note[0] && t[1] === a.note[1]), 'real: textRows carry the hours, the source and the note');
  ok(r.note[0] === a.note[0] && r.source[1] === a.source[1] && r.period === '2024-05-15', 'real: note, source and period carried');
  const rs = strings(r);
  ok(!rs.some((s) => RANK_EN.test(s)) && !rs.some((s) => RANK_EL.test(s)), 'real: no ranking words in any string');
  ok(pairs(r).every((p) => p[0].trim() && p[1].trim()) && !rs.some((s) => /[«»]/.test(s)), 'real: every pair has both languages, no guillemets');
  ok(Object.values(r.views).every((s) => Object.values(s).every((x) => /[Α-Ωα-ω]/.test(x.ariaLabel[1]) && x.ariaLabel[0].includes('not live'))), 'real: every view has an aria label in both languages');
}
console.log('hourstrip: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
