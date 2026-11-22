'use strict';
/* People data: one city at a time, residents as blocks (one block = N residents, a started block counts as one), the age bands
   the sheet really has with count and share, an honest note when the bands do not add up, honest sentences when one answer
   is missing, no ranking or city-against-city text, bilingual strings. Small made-up input AND the saved real answers of
   /api/stack/population and /api/stack/age when they exist. Run: node tests/viz/people_test.js */
const fs = require('fs');
const path = require('path');
const D = require('../../public/site/viz/people-data.js');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const pairs = (o, out = []) => { if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string')) out.push(o); else if (Array.isArray(o)) o.forEach((x) => pairs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => pairs(x, out)); return out; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ---- small made-up answers: town a (bands add up), town b (bands do NOT add up), town c only in the residents answer
const pop = { available: true, period: '2021-10-01', honesty: ['Census day, not live', 'Ημέρα απογραφής, όχι ζωντανά'], source: ['Src', 'Πηγή'],
  vintage: { recast: ['It is not the population of 2024.', 'Δεν είναι ο πληθυσμός του «2024».'] },
  features: [
    { key: 'a', code: '1', name: ['Town A', 'Πόλη Α'], level: 'municipality', residents: 1001, recast2024: { residents: 1500, sameAs2021: false } },
    { key: 'b', code: '2', name: ['Town B', 'Πόλη Β'], level: 'municipality', residents: 400, recast2024: { residents: 400, sameAs2021: true } },
    { key: 'c', code: '3', name: ['Town C', 'Πόλη Γ'], level: 'municipality', residents: 12345 },
  ] };
const age = { available: true, period: '2021-10-01', features: [
  { key: 'a', name: ['Town A', 'Πόλη Α'], residents: 1001, meanAge: 40.5, counts: { under15: 100, age15to64: 651, age65plus: 250 } },
  { key: 'b', name: ['Town B', 'Πόλη Β'], residents: 400, meanAge: 38, counts: { under15: 50, age15to64: 300, age65plus: 40 } },
] };
let m = D.build({ population: pop, age });
ok(m.available && m.id === 'people' && m.city === 'a', 'first city is shown by default');
ok(m.choices.length === 3 && m.choices.map((c) => c.id).join() === 'a,b,c' && m.choices[1].name[1] === 'Πόλη Β', 'choices list every city with both names');
ok(m.unit === 100 && D.blockUnit([12345, 1001, 400], 240) === 100 && D.blockUnit([240], 240) === 1 && D.blockUnit([241], 240) === 2 && D.blockUnit([0], 240) === 1, 'one block = the smallest 1/2/5 step that keeps every city within the cap');
ok(m.residents.available && m.residents.value === 1001 && m.residents.blocks === 11 && m.residents.unit === 100, 'a started block counts as one: 1001 residents -> 11 blocks of 100');
ok(D.blocksOf(1000, 100) === 10 && D.blocksOf(1, 100) === 1 && D.blocksOf(0, 100) === 0, 'blocksOf rounds up, zero stays zero');
ok(m.residents.text[0] === '1,001' && m.residents.text[1] === '1.001', 'thousands: comma in English, dot in Greek');
ok(m.residents.unitText[0] === 'one block = 100 residents' && m.residents.unitText[1] === 'ένα τετράγωνο = 100 κάτοικοι', 'the block unit is stated in words');
ok(m.residents.label[0] === 'Town A, census of 1 October 2021: 1,001 residents, drawn as 11 blocks (one block = 100 residents).' && m.residents.label[1].includes('απογραφή της 1ης Οκτωβρίου 2021') && m.residents.label[1].includes('11 τετράγωνα'), 'residents sentence in both languages');
ok(m.age.available && m.age.bands.length === 3 && m.age.bands.map((b) => b.band).join() === 'under15,age15to64,age65plus', 'three age bands, in age order');
ok(m.age.sum === 1001 && m.age.matches === true && m.age.sumNote[0] === 'The age bands add up to the residents figure: 1,001.', 'bands that add up say so');
ok(near(m.age.bands[0].share, 100 / 1001) && near(m.age.bands[1].t, 651 / 1001) && near(m.age.bands.reduce((s, b) => s + b.share, 0), 1), 'share = count / sum of the bands; bar length = share');
ok(m.age.bands[0].shareText[0] === '10.0%' && m.age.bands[0].shareText[1] === '10,0%' && m.age.bands[2].countText[0] === '250', 'share to one decimal, Greek decimal comma');
ok(m.age.bands[0].label[0] === 'Town A, under 15 years: 100 residents, 10.0% of the 1,001 people in the age bands.' && m.age.bands[0].label[1].includes('κάτω των 15 ετών') && m.age.bands[0].label[1].includes('10,0%'), 'band sentence in both languages');
ok(m.age.meanAge.value === 40.5 && m.age.meanAge.text[1] === '40,50' && m.age.meanAge.label[0].includes('40.50 years'), 'mean age copied, not computed');
ok(m.age.axis.ticks.length === 3 && m.age.axis.ticks[0].t === 0 && m.age.axis.ticks[2].t === 1 && m.age.axis.ticks[2].text[0] === '100%', 'bar scale runs from 0% to 100%');
ok(m.recast && m.recast.sameAs2021 === false && m.recast.residents === 1500 && m.recast.text[0].includes('1,500') && m.recast.text[0].includes('not the population of 2024'), 'the 2024 boundary figure carries the sheet\'s own warning');
ok(m.boundary[0] === 'Municipality as it was on census day, 1 October 2021' && m.censusDate[1] === '1ης Οκτωβρίου 2021', 'which boundary and which census');
ok(m.ariaLabel[0].includes('Town A') && m.ariaLabel[0].includes('1,001 residents') && m.ariaLabel[0].includes('under 15 years 100 (10.0%)') && m.ariaLabel[0].includes('not live') && !m.ariaLabel[0].includes('Town B'), 'aria label is about the shown city only');
ok(m.textRows.length >= 8 && m.textRows.every((r) => Array.isArray(r) && r.length === 2 && r[0] && r[1]), 'textRows are pairs');
ok(m.textRows[0] === m.residents.label && m.textRows[1] === m.age.bands[0].label && m.textRows.some((r) => r === m.age.meanAge.label) && m.textRows.some((r) => r[0] === 'Source: Src'), 'textRows: residents, each band, mean age, notes, source');
ok(!strings(m.textRows).some((s) => s.includes('Town B') || s.includes('Town C')), 'the text of one city never mentions another');
// the city whose bands do not add up
const b = D.select(m, 'b');
ok(b.city === 'b' && m.city === 'a' && b.residents.blocks === 4 && b.residents.unit === 100, 'select gives the other city, same block unit, and leaves the first model alone');
ok(b.age.sum === 390 && b.age.matches === false && b.age.sumNote[0].includes('390') && b.age.sumNote[0].includes('400') && b.age.sumNote[0].includes('do not agree') && b.age.sumNote[1].includes('δεν συμφωνούν'), 'bands that do not add up to the residents figure say so');
ok(near(b.age.bands[1].share, 300 / 390) && b.textRows.some((r) => r === b.age.sumNote) && b.notes.includes(b.age.sumNote), 'shares stay shares of the bands, nothing is forced to fit; the note is in the text');
ok(b.recast.sameAs2021 === true && b.recast.text[0].includes('the same as on census day'), 'an unchanged boundary is said in words');
// a city the age answer does not have
const c = D.select(m, 'c');
ok(c.residents.available && c.residents.blocks === 124 && !c.age.available && c.age.bands.length === 0 && c.age.empty[0].includes('no age bands for this city') && c.textRows.some((r) => r === c.age.empty), 'a city missing from the age answer keeps its residents and says the age part is missing');
ok(c.recast === null, 'no 2024 line when the answer has none');
ok(D.build({ population: pop, age }, { city: 'b' }).city === 'b' && D.build({ population: pop, age }, { city: 'nope' }).city === 'a' && D.select(m, 'nope') === m, 'opts.city, with an unknown key falling back');
ok(D.build({ population: pop, age }, { cap: 20 }).unit === 1000, 'opts.cap changes the block unit');
// one answer missing or unavailable
for (const noAge of [undefined, null, { available: false, features: age.features }, { available: true }]) {
  const x = D.build({ population: pop, age: noAge });
  ok(x.available && x.residents.available && x.residents.blocks === 11 && !x.age.available && x.age.empty[0].includes('age answer is not available') && x.age.empty[1] && x.textRows.some((r) => r === x.age.empty), 'residents only: ' + JSON.stringify(noAge === undefined ? 'undefined' : noAge).slice(0, 30));
}
for (const noPop of [undefined, { available: false, features: pop.features }]) {
  const x = D.build({ population: noPop, age });
  ok(x.available && !x.residents.available && x.residents.blocks === 0 && x.unit === null && x.residents.empty[0].includes('residents answer is not available') && x.age.bands.length === 3 && x.choices.length === 2, 'age only: bars without blocks');
  ok(x.age.matches === true && x.recast === null && x.textRows[0][0].startsWith('Town A') && x.textRows[0][0].includes('not available'), 'age only: checked against the age answer\'s own residents, first row says what is missing');
}
const noRef = D.build({ age: { features: [{ key: 'z', name: ['Z', 'Ζ'], counts: { under15: 1, age65plus: 3 } }] } });
ok(noRef.age.bands.length === 2 && noRef.age.matches === null && noRef.age.sumNote[0].includes('no residents figure') && near(noRef.age.bands[1].share, 0.75) && noRef.age.meanAge === null && noRef.censusDate === null, 'only the bands that exist; no check invented, no mean age invented, no date invented');
const withheld = D.build({ population: { features: [{ key: 'w', name: ['W', 'Β'], residents: 30 }] }, age: { features: [{ key: 'w', name: ['W', 'Β'], residents: 30, meanAge: null, counts: null }] } });
ok(withheld.residents.blocks === 30 && withheld.unit === 1 && withheld.residents.unitText[0] === 'one block = 1 resident' && !withheld.age.available && withheld.age.empty[0].includes('no age bands'), 'a place with withheld age figures: residents shown, age said to be absent');
const badRes = D.build({ population: { features: [{ key: 'q', name: ['Q', 'Κ'], residents: 'many' }] }, age: null });
ok(badRes.available && !badRes.residents.available && badRes.residents.empty[0].includes('no figure for this city'), 'a non-number is not drawn');
for (const bad of [null, undefined, {}, { population: null, age: null }, { population: { available: false }, age: { features: [] } }, { population: { features: 'x' } }]) { const x = D.build(bad); ok(!x.available && x.empty[0] && x.empty[1] && x.choices.length === 0 && x.age.bands.length === 0 && x.residents.blocks === 0 && x.textRows.length === 1, 'honest empty state: ' + JSON.stringify(bad === undefined ? 'undefined' : bad).slice(0, 40)); }
ok(!strings(m).some((s) => /[«»]/.test(s)), 'no guillemets, also when the sheet note has them');

// ---- the saved real answers
const dir = process.env.PEOPLE_REAL_DIR || '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad';
const load = (name) => { try { return JSON.parse(fs.readFileSync(path.resolve(dir, name), 'utf8')); } catch (err) { console.log('note: saved real answer not found (' + path.join(dir, name) + '), real-data checks skipped'); return null; } };
const rp = load('population.json'), ra = load('age.json');
if (rp && ra) {
  const r = D.build({ population: rp, age: ra });
  ok(r.available && r.choices.map((x) => x.id).join() === 'larnaka,lefkosia,limassol,paphos' && r.city === 'larnaka', 'real: four cities, in the answer\'s own order');
  ok(r.unit === 500 && r.censusDate[0] === '1 October 2021' && r.asOf === '2021-10-01', 'real: one block = 500 residents, census of 1 October 2021');
  let good = true, sums = true, shares = true;
  for (const f of rp.features) {
    const v = D.select(r, f.key), a = ra.features.find((x) => x.key === f.key);
    if (v.residents.value !== f.residents || v.residents.blocks !== Math.ceil(f.residents / 500) || v.residents.blocks > D.BLOCK_CAP) good = false;
    if (v.age.sum !== f.residents || v.age.matches !== true || v.age.bands.length !== 3) sums = false;
    for (const bnd of v.age.bands) if (bnd.count !== a.counts[bnd.band] || Math.abs(bnd.share - bnd.count / f.residents) > 1e-12) shares = false;
    // the shares agree with the percentages the sheet itself publishes (two decimals; its middle band is the rest to 100, so allow 0.01)
    if ([a.under15Percent, a.age15to64Percent, a.age65plusPercent].some((pc, i) => Math.abs(v.age.bands[i].share * 100 - pc) > 0.011)) shares = false;
    if (v.age.meanAge.value !== a.meanAge) good = false;
  }
  ok(good, 'real: residents, blocks and mean age are the answers\' own numbers');
  ok(sums, 'real: in every city the three bands add up to the residents figure');
  ok(shares, 'real: counts are the sheet\'s; shares equal the sheet\'s own percentages');
  ok(r.residents.text[0] === '52,046' && r.residents.text[1] === '52.046' && r.residents.blocks === 105 && r.age.bands[0].countText[0] === '6,655' && r.age.bands[0].shareText[0] === '12.8%', 'real: Larnaka as printed');
  ok(r.recast.residents === 68202 && r.recast.text[0].includes('68,202') && r.recast.text[0].includes('It is not the population of 2024'), 'real: the 2024 boundary line keeps the sheet\'s warning');
  ok(D.select(r, 'paphos').recast.sameAs2021 === true && D.select(r, 'limassol').residents.blocks === 216, 'real: Pafos boundary unchanged; the largest field is 216 blocks');
  ok(r.honesty[0].includes('not live') && r.notes[0] === r.honesty && r.textRows.some((x) => x[0].startsWith('Source: Statistical Service of Cyprus')), 'real: the sheet\'s honesty line and source are in the text');
  const all = strings(r);
  ok(!all.some((s) => /\b(rank|ranking|ranked|biggest|largest|smallest|bigger|smaller|youngest|oldest|younger than|older than|more than|less than|compared with|versus|vs)\b/i.test(s)), 'real: no ranking or city-against-city words');
  ok(!all.some((s) => /(κατάταξη|μεγαλύτερ|μικρότερ|νεότερ|γηραιότερ|σε σύγκριση|περισσότερο από|λιγότερο από)/i.test(s)), 'real: no Greek ranking words');
  ok(!strings(r.textRows).concat(r.ariaLabel).some((s) => /Lefkosia|Lemesos|Pafos|Λευκωσία|Λεμεσός|Πάφος/.test(s)), 'real: the shown city\'s text does not bring in another city');
  const ps = pairs(r);
  ok(ps.length > 100 && ps.every((p) => p[0].trim() && p[1].trim()), 'real: every pair has English and Greek');
  ok(ps.filter((p) => /[A-Za-z]{4,}/.test(p[0])).every((p) => /[Ͱ-Ͽ]/.test(p[1]) || p[0] === p[1]), 'real: worded pairs have Greek letters in the Greek half');
  ok(!all.some((s) => /[«»]/.test(s)), 'real: no guillemets');
  const only = D.build({ population: rp, age: { available: false } });
  ok(only.residents.blocks === 105 && !only.age.available && only.age.empty[1].includes('δεν είναι διαθέσιμη'), 'real: residents still shown when the age answer is unavailable');
}
console.log('people: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
