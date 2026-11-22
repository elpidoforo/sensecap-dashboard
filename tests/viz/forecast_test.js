'use strict';
/* Forecast strip data: one cell per forecast day the answer really has, rounded numbers, the fixed line scale, the model
   label, source and fetch time, test-mode label, wind and optional rain, honest empty state, bilingual strings.
   Small made-up input AND a saved answer of /api/forecast when one is there (skipped with a note when missing).
   Run: node tests/viz/forecast_test.js */
const fs = require('fs');
const D = require('../../public/site/viz/forecast-data.js');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const pairs = (o, out = []) => { if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string')) out.push(o); else if (Array.isArray(o)) o.forEach((x) => pairs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => pairs(x, out)); return out; };

// ---- small made-up answer in the shape of server.js forecast(): 4 usable days and 2 that must be dropped
const made = { source: 'Open-Meteo', place: 'Central Cyprus', updated: '2026-03-02T05:30:00.000Z', mock: false, days: [
  { date: '2026-03-01', tmax: 18.4, tmin: 9.5, code: 3, wind: 6.6, windDir: 350 },
  { date: '2026-03-02', tmax: 21.5, tmin: 11.2, code: 0, wind: 2.4, windDir: 91 },
  { date: '2026-03-03', tmax: 23, tmin: 12, code: 61, wind: null, windDir: null, rain: 4.26 },
  { date: '2026-03-04', tmax: null, tmin: 10, code: 1, wind: 3, windDir: 10 },
  { date: 'soon', tmax: 20, tmin: 10, code: 1 },
  { date: '2026-03-05', tmax: 16, tmin: -0.3, code: 95, wind: 11, windDir: 225 },
] };
const NOW = Date.parse('2026-03-02T07:00:00Z');   // 09:00 in Cyprus on 2 March
const before = JSON.stringify(made);
const m = D.build(made, {}, NOW);
ok(JSON.stringify(made) === before, 'the answer is not changed');
ok(m.available && m.id === 'forecast' && m.step === 'day' && m.empty === null, 'available, steps are days');
ok(m.cells.length === 4 && m.cells.map((c) => c.time).join() === '2026-03-01,2026-03-02,2026-03-03,2026-03-05', 'one cell per usable day, in the order of the answer; days without numbers or a date are dropped, not filled in');
ok(m.label[0] === 'Forecast from a weather model, not a measurement' && m.label[1] === 'Πρόγνωση από μοντέλο καιρού, όχι μέτρηση', 'the model label, both languages');
ok(m.source[0] === 'Open-Meteo' && m.place[0] === 'central Cyprus' && m.place[1] === 'κεντρική Κύπρος', 'source and place from the answer');
ok(m.made.iso === made.updated && m.made.text[0] === 'fetched 2 March 2026, 07:30 Cyprus time' && m.made.text[1] === 'λήψη 2 Μαρτίου 2026, 07:30 ώρα Κύπρου', 'fetch time in Cyprus time');
ok(m.made.ageSeconds === 5400 && m.made.ageText[0] === '1 h ago' && m.made.ageText[1] === 'πριν από 1 ώρα', 'age of the forecast from now');
ok(m.meta[0] === 'Source: Open-Meteo · central Cyprus · fetched 2 March 2026, 07:30 Cyprus time' && m.meta[1].startsWith('Πηγή: Open-Meteo · κεντρική Κύπρος · λήψη'), 'meta line');
ok(m.mock === false && m.mockLabel === null, 'not test values');
let c = m.cells[0];
ok(c.hi === '18' && c.lo === '10' && c.tmax === 18.4 && c.tmin === 9.5 && c.values.tmax === 18.4 && c.values.tmin === 9.5, 'printed numbers are rounded, the values of the answer are kept');
ok(c.dayName[0] === 'Sunday' && c.dayName[1] === 'Κυριακή' && c.dayShort[0] === 'Sun' && c.dateText[0] === '1 March' && c.dateText[1] === '1 Μαρτίου', 'weekday and date from the date of the answer');
ok(c.past === true && c.isToday === false && m.cells[1].isToday === true && m.cells[1].past === false && m.cells[2].past === false, 'today and past days by the Cyprus date of now');
ok(m.first === 1, 'the marker starts on today');
ok(c.sky.kind === 'cloud' && c.sky.text[1] === 'Συννεφιά' && m.cells[1].sky.text[0] === 'Sunny' && m.cells[3].sky.text[0] === 'Thunderstorms', 'sky words from the weather code');
ok(c.wind.value === 6.6 && c.wind.text === '7' && c.wind.compass[0] === 'N' && c.wind.compass[1] === 'Β' && c.wind.short[0] === 'N 7 m/s' && c.wind.short[1] === 'Β 7 m/s', 'wind: rounded, 350 degrees is north');
ok(m.cells[1].wind.compass[0] === 'E' && m.cells[3].wind.compass[0] === 'SW' && m.cells[3].wind.long[0] === 'wind from the south-west, up to 11 m/s' && m.cells[3].wind.long[1] === 'άνεμος νοτιοδυτικός, έως 11 m/s', 'wind direction words');
ok(m.cells[2].wind === null && m.cells[2].values.wind === null && m.cells[2].label[0].includes('wind not given') && m.cells[2].label[1].includes('χωρίς στοιχεία ανέμου'), 'missing wind is said, not invented');
ok(m.cells[2].rain && m.cells[2].rain.value === 4.26 && m.cells[2].rain.text[0] === '4.3 mm' && m.cells[2].label[0].includes('rain 4.3 mm') && m.cells[2].values.rain === 4.26, 'rain is shown when a day carries it');
ok(m.cells[0].rain === null && m.cells[0].values.rain === null && !m.cells[0].label[0].includes(' mm'), 'no rain number when the answer has none');
ok(m.cells[3].lo === '0' && m.cells[3].tmin === -0.3, 'small negative prints 0, no minus zero');
ok(m.scale.min === -5 && m.scale.max === 25 && /-5 to 25 °C/.test(m.scale.text[0]) && /-5 έως 25 °C/.test(m.scale.text[1]), 'fixed scale: lowest low rounded down, highest high rounded up, to 5');
ok(Math.abs(m.cells[2].tHi - 28 / 30) < 1e-12 && Math.abs(m.cells[3].tLo - 4.7 / 30) < 1e-12 && m.cells.every((x) => x.tHi >= 0 && x.tHi <= 1 && x.tLo >= 0 && x.tLo <= 1 && x.tHi >= x.tLo), 't on the scale');
ok(m.cells[1].label[0] === 'Today, Monday 2 March: high 22 °C, low 11 °C, sunny, wind from the east, up to 2 m/s. Model forecast, not a measurement.', 'day sentence (en)');
ok(m.cells[1].label[1] === 'Σήμερα, Δευτέρα 2 Μαρτίου: μέγιστη 22 °C, ελάχιστη 11 °C, ηλιοφάνεια, άνεμος ανατολικός, έως 2 m/s. Πρόγνωση μοντέλου, όχι μέτρηση.', 'day sentence (el)');
ok(m.cells.every((x, i) => x.i === i), 'cell index');
ok(m.textRows[0][0].startsWith('Forecast from a weather model, not a measurement. Source: Open-Meteo') && m.textRows.filter((r) => /Model forecast, not a measurement\.$/.test(r[0])).length === 4, 'textRows: label first, one row per day');
ok(m.textRows.some((r) => r[0] === 'The forecast was fetched 1 h ago.') && m.textRows.some((r) => r === m.scale.text) && m.textRows.some((r) => r === m.note), 'textRows: age, scale, note');
ok(m.note[0].includes('not the forecast of the Cyprus Department of Meteorology') && m.note[1].includes('Τμήματος Μετεωρολογίας') && m.note[0].includes('no hours and no rain amounts'), 'note says whose forecast it is not, and what the answer lacks');
ok(m.ariaLabel[0].includes('4 days') && m.ariaLabel[0].includes('1 March to 5 March') && m.ariaLabel[1].includes('4 μέρες') && m.ariaLabel[0].includes('not a measurement'), 'aria label');
ok(m.textRows.every((r) => Array.isArray(r) && r.length === 2 && r[0] && r[1]), 'textRows are pairs');
ok(pairs(m).length > 30 && pairs(m).every((p) => p[0].trim() && p[1].trim()), 'every pair has English and Greek');
ok(!strings(m).some((s) => /[«»]/.test(s)), 'no guillemets');
ok(!strings(m).some((s) => /\b(Met Office forecast|official forecast|measured)\b/i.test(s)), 'never called a measurement or an official forecast');

// test mode of the server
const mk = D.build(Object.assign({}, made, { mock: true }), {}, NOW);
ok(mk.mock === true && mk.mockLabel[0].includes('not a real forecast') && mk.mockLabel[1].includes('όχι πραγματική πρόγνωση') && mk.textRows[1] === mk.mockLabel && mk.ariaLabel[0].includes('Test values'), 'test-mode values are labelled');
// other shapes
const noMeta = D.build({ days: [{ date: '2026-03-02', tmax: 20, tmin: 20, code: 'x' }] }, {}, NOW);
ok(noMeta.available && noMeta.source === null && noMeta.made === null && noMeta.meta[0] === 'Source not stated · time of the forecast not given' && noMeta.cells[0].sky === null && noMeta.cells[0].values.code === null, 'no source, time or code: said, not invented');
ok(noMeta.scale.min === 20 && noMeta.scale.max === 25 && noMeta.ariaLabel[0].includes('1 day,') && noMeta.cells[0].tHi === 0, 'one flat day still has a scale');
const noNow = D.build(made, {});
ok(noNow.available && noNow.cells.every((x) => !x.isToday && !x.past) && noNow.first === 0 && noNow.made.ageSeconds === null && noNow.made.ageText === null && noNow.now === null, 'without now: no today, no age');
ok(D.build(Object.assign({}, made, { place: 'Limassol' }), {}, NOW).place[1] === 'Limassol', 'another place is shown as given');
ok(D.build(Object.assign({}, made, { updated: 'yesterday' }), {}, NOW).made === null, 'a time that is not a time is not shown');
ok(D.compassIndex(0) === 0 && D.compassIndex(359) === 0 && D.compassIndex(22) === 0 && D.compassIndex(23) === 1 && D.compassIndex(-45) === 7 && D.compassIndex(null) === null, 'compass index');
for (const bad of [null, undefined, 'x', {}, { error: 'fetch failed' }, { days: [] }, { days: 'x' }, { days: [{ date: '2026-03-02', tmax: '20', tmin: 10 }] }, { days: [null, { tmax: 1, tmin: 0 }] }]) {
  const e = D.build(bad, {}, NOW);
  ok(!e.available && e.cells.length === 0 && e.empty[0] && e.empty[1] && e.scale === null && e.textRows.length === 1 && e.ariaLabel === e.empty && e.label[0].includes('not a measurement'), 'honest empty state: ' + String(JSON.stringify(bad)).slice(0, 50));
}

// ---- a saved answer of /api/forecast (FORECAST_REAL overrides the path). The local server has no network, so the file
//      saved here comes from the server's test mode (mock:true); the checks hold for a real answer too.
const DIR = '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad/';
const REAL = process.env.FORECAST_REAL || [DIR + 'forecast.json', DIR + 'cc/forecast-mock.json'].find((p) => fs.existsSync(p));
if (!REAL || !fs.existsSync(REAL)) console.log('note: saved /api/forecast answer not found (' + DIR + 'forecast.json), saved-answer checks skipped');
else {
  const a = JSON.parse(fs.readFileSync(REAL, 'utf8')), t = Date.parse(a.updated) + 60000, r = D.build(a, {}, t);
  const good = a.days.filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(d.tmax) && Number.isFinite(d.tmin));
  console.log('note: saved forecast answer ' + REAL + (a.mock ? ' (server test mode, mock:true)' : ''));
  ok(r.available && r.cells.length === good.length && r.cells.every((x, i) => x.time === good[i].date), 'saved: one cell per day of the answer, same order');
  ok(r.cells.every((x, i) => x.values.tmax === good[i].tmax && x.values.tmin === good[i].tmin && x.hi === String(Math.round(good[i].tmax)) && x.lo === String(Math.round(good[i].tmin)) && (x.wind ? x.wind.value === good[i].wind : !Number.isFinite(good[i].wind))), 'saved: every number is the one of the answer, rounded for display');
  ok(r.scale.min <= Math.min(...good.map((d) => d.tmin)) && r.scale.max >= Math.max(...good.map((d) => d.tmax)) && r.scale.min % 5 === 0 && r.scale.max % 5 === 0, 'saved: the scale holds every value');
  ok(r.source[0] === a.source && r.made.iso === a.updated && r.made.ageSeconds === 60 && r.mock === (a.mock === true) && (!a.mock || r.mockLabel), 'saved: source, time, test-mode flag carried');
  ok(r.cells[0].isToday && r.first === 0, 'saved: the first day is today at the time of the answer');
  ok(r.cells.every((x) => x.rain === null), 'saved: the answer has no rain amounts, none are shown');
  ok(pairs(r).every((p) => p[0].trim() && p[1].trim()) && !strings(r).some((s) => /[«»]/.test(s)), 'saved: every pair has both languages, no guillemets');
}
console.log('forecast: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
