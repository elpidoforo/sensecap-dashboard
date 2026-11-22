'use strict';
/* Class tape data: one place at a time, one cell per ten-day period grouped by month, classes as categories (no height
   anywhere), a distinct colour AND glyph per class, codes 7/8 as no data, the sheet's warning in the key text, no ranking,
   bilingual strings. Small made-up input AND the saved real answer of /api/stack/drought when it exists.
   Run: node tests/viz/classtape_test.js */
const fs = require('fs');
const path = require('path');
const D = require('../../public/site/viz/classtape-data.js');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const pairs = (o, out = []) => { if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string')) out.push(o); else if (Array.isArray(o)) o.forEach((x) => pairs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => pairs(x, out)); return out; };
const keysDeep = (o, out = new Set()) => { if (Array.isArray(o)) o.forEach((x) => keysDeep(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.add(k); keysDeep(v, out); } return out; };

// ---- small made-up answer: six periods (Jan, Feb), two places
const made = { available: true, period: '2022-01-01 / 2022-02-28', source: ['Src', 'Πηγή'], honesty: ['A past year, not now', 'Περασμένη χρονιά, όχι τώρα'], note: ['Sheet note.', 'Σημείωση φύλλου.'],
  classes: { 0: ['No drought', 'Χωρίς ξηρασία'], 1: ['Watch', 'Επιτήρηση'], 3: ['Alert', 'Συναγερμός'], 4: ['Full recovery', 'Πλήρης ανάκαμψη'] },
  classesAreNotAScale: ['Classes are not "more drought". Do not draw the class number as a height.', 'Οι κατηγορίες δεν είναι «περισσότερη ξηρασία». Μη σχεδιάσεις τον αριθμό ως ύψος.'],
  periods: ['2022-01-01', '2022-01-11', '2022-01-21', '2022-02-01', '2022-02-11', '2022-02-21'],
  periodEnds: ['2022-01-10', '2022-01-20', '2022-01-31', '2022-02-10', '2022-02-20', '2022-02-28'],
  features: [{ name: ['Alpha Town', 'Άλφα'], classes: [0, 0, 3, 4, 7, 8] }, { name: ['Beta', 'Βήτα'], classes: [1, 1, 1, 1, 9, 0] }] };
let m = D.build(made);
ok(m.available && m.id === 'classtape' && m.place === 'alpha-town', 'first place shown, id made from its name');
ok(m.choices.length === 2 && m.choices[1].id === 'beta' && m.choices[1].name[1] === 'Βήτα', 'choices list every place with both names');
ok(m.cells.length === 6 && m.cells.map((c) => c.code).join() === '0,0,3,4,7,8', 'one cell per period, codes as given');
ok(m.months.length === 2 && m.months[0].count === 3 && m.months[1].from === 3 && m.months[0].name[0] === 'Jan' && m.months[1].name[1] === 'Φεβ', 'cells grouped by month');
ok(m.cells[2].state === 'class' && m.cells[2].className[0] === 'Alert' && m.cells[2].className[1] === 'Συναγερμός', 'class name from the sheet dictionary');
ok(m.cells[4].state === 'nodata' && m.cells[5].state === 'nodata' && m.cells[4].color === null && m.cells[4].glyph === 'none' && m.cells[4].className[0].startsWith('No data'), 'codes 7 and 8 are no data: no colour, no class');
ok(m.cells[2].period === '2022-01-21' && m.cells[2].periodEnd === '2022-01-31', 'period start and end kept');
ok(m.cells[2].label[0] === 'Alpha Town, 21 to 31 January 2022: Alert' && m.cells[2].label[1] === 'Άλφα, 21 έως 31 Ιανουαρίου 2022: Συναγερμός', 'cell sentence in both languages');
// categories, not a scale: nothing in the model is a height, an amount or a position on an axis
const banned = ['h', 'height', 't', 'value', 'level', 'severity', 'score', 'rank', 'y', 'scale', 'amount'];
ok(banned.every((k) => !keysDeep(m).has(k)), 'no height / value / level / scale field anywhere in the model');
ok(m.cells.every((c) => Object.keys(c).sort().join() === 'className,code,color,glyph,i,ink,label,month,period,periodEnd,state,when'), 'a cell is a class with a colour and a glyph, nothing else');
// key: all dictionary classes + no data, distinct colour AND glyph, counts
const cls = m.key.filter((k) => k.state === 'class');
ok(cls.map((k) => k.code).join() === '0,1,3,4' && m.key[m.key.length - 1].state === 'nodata', 'key lists every class of the sheet, then no data');
ok(new Set(cls.map((k) => k.color)).size === cls.length && new Set(cls.map((k) => k.glyph)).size === cls.length, 'each class has its own colour and its own glyph');
ok(cls.every((k) => /^#[0-9A-F]{6}$/i.test(k.color) && k.glyph && k.glyph !== 'none'), 'every class has a glyph, so colour is never the only cue');
ok(m.key.find((k) => k.code === 0).count === 2 && m.key.find((k) => k.code === 1).count === 0 && m.key.find((k) => k.state === 'nodata').count === 2, 'key counts periods of this place per class');
ok(m.key.find((k) => k.code === 0).periods.join() === '0,1' && m.key.find((k) => k.code === 3).text[0] === 'Alert: 1 of 6 periods' && m.key.find((k) => k.code === 3).text[1] === 'Συναγερμός: 1 από 6 περιόδους', 'key entry: its periods and a sentence');
ok(m.key.reduce((s, k) => s + k.count, 0) === 6, 'every period is in exactly one key entry');
ok(m.warning[0].includes('Do not draw the class number as a height') && m.warning[1].includes('"περισσότερη ξηρασία"') && !/[«»]/.test(m.warning[1]), 'the sheet\'s own warning, guillemets turned into plain quotes');
ok(m.textRows.some((r) => r[0] === m.warning[0]) && m.legend[0][0].includes('same height') && m.legend[0][1].includes('ίδιο ύψος'), 'warning and same-height line are in the text');
// runs for the text list
ok(m.runs.length === 4 && m.runs[0].count === 2 && m.runs[0].label[0] === '1 to 20 January 2022: No drought (2 periods)' && m.runs[3].count === 2 && m.runs[3].label[1].includes('2 περίοδοι'), 'neighbouring periods of one class are told as one run');
ok(m.runs[1].label[0] === '21 to 31 January 2022: Alert (1 period)', 'a single period run');
ok(m.textRows.every((r) => Array.isArray(r) && r.length === 2 && r[0] && r[1]) && m.textRows[0][0].startsWith('Alpha Town, 2022:'), 'textRows are pairs and start with the place');
ok(!strings(m.textRows).concat(strings(m.ariaLabel)).some((s) => s.includes('Beta') || s.includes('Βήτα')), 'the text of one place never mentions another');
ok(m.ariaLabel[0].includes('categories, not a scale') && m.ariaLabel[1].includes('όχι κλίμακα'), 'aria label says categories, not a scale');
// the other place: unknown code 9 is not guessed
const b = D.select(m, 'beta');
ok(b.place === 'beta' && m.place === 'alpha-town' && b.cells[4].state === 'unknown' && b.cells[4].glyph === 'question' && b.cells[4].color === null && b.cells[4].className[0].includes('Code 9'), 'a code outside the dictionary is unknown, never guessed');
ok(b.key.some((k) => k.state === 'unknown' && k.count === 1) && !m.key.some((k) => k.state === 'unknown'), 'unknown codes get a key entry only when present');
ok(D.build(made, { place: 'beta' }).place === 'beta' && D.build(made, { place: 'zzz' }).place === 'alpha-town' && D.select(m, 'zzz') === m, 'opts.place, with an unknown id falling back');
// odd input
const short = JSON.parse(JSON.stringify(made)); short.features[0].classes = [0, 0]; delete short.periodEnds; short.classes[12] = ['Extra', 'Επιπλέον']; short.features[1].classes[0] = 12;
const ms = D.build(short);
ok(ms.cells.length === 6 && ms.cells[2].state === 'unknown' && ms.cells[2].code === null && ms.cells[2].className[1].includes('Δεν υπάρχει κωδικός'), 'a place with fewer codes than periods: the rest are said to be absent');
ok(ms.cells[0].periodEnd === null && ms.cells[0].when[0] === 'from 1 January 2022' && ms.cells[0].when[1] === 'από 1 Ιανουαρίου 2022', 'no period end given: only the start is said');
const extra = D.select(ms, 'beta').key.find((k) => k.code === 12);
ok(extra && extra.glyph === 'digit' && extra.count === 1 && !Object.values(D.STYLE).some((s) => s.color === extra.color), 'a new class in the dictionary gets its number as glyph and a spare colour');
const badp = JSON.parse(JSON.stringify(made)); badp.periods[1] = 'x';
ok(D.build(badp).cells.length === 5 && D.build(badp).cells.map((c) => c.code).join() === '0,3,4,7,8', 'an unreadable period is dropped together with its code');
const two = JSON.parse(JSON.stringify(made)); two.periods[5] = '2023-01-01'; two.periodEnds[5] = '2023-01-10';
ok(D.build(two).span[0] === '2022 to 2023' && D.build(two).months.length === 3, 'a span over two years is written out');
for (const bad of [null, {}, { available: false }, Object.assign({}, made, { features: [] }), Object.assign({}, made, { periods: [] }), Object.assign({}, made, { classes: {} })]) { const x = D.build(bad); ok(!x.available && x.empty[0] && x.empty[1] && x.cells.length === 0 && x.choices.length === 0 && x.textRows.length === 1, 'honest empty state'); }
ok(!strings(m).concat(strings(ms)).some((s) => /[«»]/.test(s)), 'no guillemets');

// ---- the saved real answer
const file = process.env.CLASSTAPE_REAL || '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad/drought.json';
let real = null;
try { real = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (err) { console.log('note: saved real answer not found (' + file + '), real-data checks skipped'); }
if (real) {
  const r = D.build(real);
  ok(r.available && r.choices.map((c) => c.id).join() === 'xylophagou,athienou,akaki,polis', 'real: four places to choose from');
  ok(r.cells.length === 36 && r.months.length === 12 && r.months.every((x) => x.count === 3) && r.span[0] === '2022', 'real: 36 ten-day periods of 2022 in 12 months of 3');
  let good = true;
  real.features.forEach((f, fi) => { const v = D.select(r, r.choices[fi].id); f.classes.forEach((c, i) => { const x = v.cells[i]; if (x.code !== c || x.period !== real.periods[i] || x.periodEnd !== real.periodEnds[i] || x.className[0] !== real.classes[c][0] || x.className[1] !== real.classes[c][1]) good = false; }); });
  ok(good, 'real: every cell carries the answer\'s own code, period and class name');
  const cls2 = r.key.filter((k) => k.state === 'class');
  ok(cls2.length === 7 && new Set(cls2.map((k) => k.color)).size === 7 && new Set(cls2.map((k) => k.glyph)).size === 7 && !cls2.some((k) => k.glyph === 'digit'), 'real: seven classes, seven colours, seven glyphs');
  ok(r.key.length === 8 && r.key[7].state === 'nodata' && r.key[7].count === 0, 'real: no-data entry is in the key (no such period in 2022 for these cells)');
  const polis = D.select(r, 'polis'), cnt = (v, c) => v.key.find((k) => k.code === c).count;
  ok(cnt(polis, 3) === 3 && cnt(polis, 6) === 1 && cnt(polis, 4) === 4 && cnt(r, 0) === 31 && cnt(r, 1) === 3 && cnt(r, 4) === 2, 'real: class counts equal a hand count of the answer');
  ok(r.choices.every((c) => D.select(r, c.id).key.reduce((s, k) => s + k.count, 0) === 36), 'real: every period is counted once per place');
  ok(polis.cells[1].label[0] === 'Polis, 11 to 20 January 2022: Temporary vegetation recovery' && polis.cells[1].label[1].startsWith('Πόλη Χρυσοχούς, 11 έως 20 Ιανουαρίου 2022'), 'real: cell sentence');
  ok(r.runs[0].label[0] === '1 January to 20 April 2022: No drought (11 periods)' && r.runs.reduce((s, x) => s + x.count, 0) === 36, 'real: runs cover the year');
  ok(r.warning[0] === real.classesAreNotAScale[0] && r.warning[1] === real.classesAreNotAScale[1].replace(/[«»]/g, '"') && r.textRows.some((x) => x[0] === r.warning[0]), 'real: the sheet\'s warning sentence, word for word apart from the quote marks');
  ok(r.note[0] === real.note[0] && r.textRows.some((x) => x[0] === real.note[0]) && r.textRows.some((x) => x[0].startsWith('Source: European Drought Observatory')), 'real: the sheet\'s note and source are in the text');
  ok(['h', 'height', 't', 'value', 'level', 'severity', 'score', 'rank', 'y', 'scale', 'amount'].every((k) => !keysDeep(r).has(k)), 'real: no height / value / scale field anywhere');
  const all = strings(r);
  ok(!all.some((s) => /\b(rank|ranking|ranked|best|worst|driest|wettest|drier than|worse than|better than|compared with|versus|vs)\b/i.test(s)), 'real: no ranking or place-against-place words');
  ok(!all.some((s) => /(κατάταξη|καλύτερ|χειρότερ|πιο ξηρ|σε σύγκριση)/i.test(s)), 'real: no Greek ranking words');
  ok(r.choices.every((c) => { const v = D.select(r, c.id), others = r.choices.filter((o) => o.id !== c.id); return !strings(v.textRows).concat(strings(v.ariaLabel)).some((s) => others.some((o) => s.includes(o.name[0]) || s.includes(o.name[1]))); }), 'real: the text of one place never names another');
  const ps = pairs(r);
  ok(ps.length > 200 && ps.every((p) => p[0].trim() && p[1].trim()), 'real: every pair has English and Greek');
  ok(ps.filter((p) => /[A-Za-z]{4,}/.test(p[0])).every((p) => /[Ͱ-Ͽ]/.test(p[1])), 'real: worded pairs have Greek letters in the Greek half');
  ok(!all.some((s) => /[«»]/.test(s)), 'real: no guillemets');
}
console.log('classtape: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
