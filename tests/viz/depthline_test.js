'use strict';
/* Depth line data: one seabed profile at a time, x = km along the line, y = metres below the sea surface on the profile's own
   scale, interpolated points kept as marked, missing values left as gaps, no profile-against-profile or better/worse text,
   bilingual strings. Small made-up input AND the saved real answer of /api/stack/seabed-profiles when it exists.
   Run: node tests/viz/depthline_test.js */
const fs = require('fs');
const path = require('path');
const D = require('../../public/site/viz/depthline-data.js');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const pairs = (o, out = []) => { if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string')) out.push(o); else if (Array.isArray(o)) o.forEach((x) => pairs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => pairs(x, out)); return out; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ---- small made-up answer: profile A has 5 points (one interpolated, one null, given out of order); profile B is much deeper
const made = { available: true, retrieved: '2026-01-02', source: ['Src', 'Πηγή'], honesty: ['Estimates, not soundings', 'Εκτιμήσεις, όχι βυθομετρήσεις'],
  note: ['Sheet note.', 'Σημείωση «φύλλου».'],
  features: [
    { name: 'Alpha', start: 'Off Somewhere', points: [{ km: 0, elevation: -10, interpolated: false }, { km: 2, elevation: -40, interpolated: true }, { km: 1, elevation: -25.26, interpolated: false },
      { km: 3, elevation: null, interpolated: true }, { km: 4, elevation: -80, interpolated: false }] },
    { name: 'Limassol', start: 'Off Molos', points: [{ km: 0, elevation: -100, interpolated: true }, { km: 5, elevation: -2400, interpolated: true }] },
  ] };
let m = D.build(made);
ok(m.available && m.id === 'depthline' && m.profile === 'alpha', 'first profile is shown by default, id from its name');
ok(m.choices.length === 2 && m.choices[1].id === 'limassol' && m.choices[1].name[0] === 'Limassol' && m.choices[1].name[1] === 'Λεμεσός', 'choices list every profile, known place names in Greek');
ok(m.profileName[0] === 'Alpha' && m.profileName[1] === 'Alpha' && m.startName[0] === 'Off Somewhere', 'an unknown name is shown as the sheet gives it');
ok(m.points.map((p) => p.km).join() === '0,1,2,3,4', 'points in order of km');
ok(m.points[0].elevation === -10 && m.points[0].depth === 10 && m.points[2].interpolated === true && m.points[0].interpolated === false, 'elevation, depth and the interpolated mark are the sheet\'s own');
ok(m.points[3].missing && m.points[3].elevation === null && m.points[3].depth === null && m.points[3].ty === null && m.points[3].text === null, 'a null elevation is missing: no depth, no height, no text');
ok(m.counts.points === 5 && m.counts.withValue === 4 && m.counts.missing === 1 && m.counts.interpolated === 1, 'counts of points, values, interpolated, missing');
ok(m.axis.x.max === 4 && near(m.points[1].tx, 0.25) && near(m.points[4].tx, 1) && m.points[0].tx === 0, 'x is km over the last km');
ok(m.axis.y.top === 0 && m.axis.y.tSurface === 0 && m.axis.y.bottom >= 80 && near(m.axis.y.bottom, 80), 'sea surface at the top (0), bottom a round number at or below the lowest value');
ok(near(m.points[0].ty, 10 / 80) && near(m.points[4].ty, 1) && near(m.points[2].ty, 0.5), 'y is depth over the axis bottom');
ok(m.axis.y.ticks[0].v === 0 && m.axis.y.ticks[0].t === 0 && m.axis.y.ticks[0].text[0] === '0' && near(m.axis.y.ticks[m.axis.y.ticks.length - 1].t, 1) && m.axis.y.ticks.length >= 3 && m.axis.y.ticks.length <= 7, 'depth ticks from the surface down');
ok(m.axis.y.ticks[1].text[0] === '20' && m.axis.y.ticks[1].v === -20, 'depth ticks are printed as positive metres below the surface');
ok(m.axis.x.ticks[0].v === 0 && m.axis.x.ticks.every((t) => t.t >= 0 && t.t <= 1 + 1e-9), 'km ticks inside the axis');
ok(m.points[1].text[0] === '25.3 m' && m.points[1].text[1] === '25,3 μ.' && m.points[1].kmText[0] === '1 km' && m.points[1].kmText[1] === '1 χλμ.', 'one decimal, Greek decimal comma and units');
ok(m.points[1].label[0] === 'Alpha, 1 km along the line: seabed 25.3 m below the sea surface (grid value, not marked as interpolated)', 'point sentence in English');
ok(m.points[2].label[0].includes('marked as interpolated in the model') && m.points[2].label[1].includes('παρεμβολή') && m.points[2].label[1].includes('40,0 μ.'), 'an interpolated point says so in both languages');
ok(m.points[3].label[0] === 'Alpha, 3 km along the line: no reported value' && m.points[3].label[1].endsWith('χωρίς αναφερόμενη τιμή'), 'missing point sentence');
ok(m.axis.y.label[0] === 'metres below the sea surface' && m.axis.x.label[0].includes('from its start') && !/shore|beach|coast/i.test(strings(m.strings).join(' ')), 'axis labels: below the surface, from the start of the line (not "from the shore")');
ok(m.legend.some((l) => l[0].startsWith('Hollow dot and dashed line')) && m.legend.some((l) => l[0].startsWith('A gap in the line')) && m.legend.some((l) => l[0].includes('not for navigation')), 'key: hollow = interpolated, gap = no value, not for navigation');
ok(m.strings.keyHollow[0] === 'marked interpolated' && m.strings.keyHollow[1].includes('παρεμβολή'), 'short key strings for the canvas');
ok(m.ariaLabel[0].includes('Alpha') && m.ariaLabel[0].includes('Off Somewhere') && !m.ariaLabel[0].includes('Limassol'), 'aria label is about the shown profile only');
ok(m.textRows.length >= 5 + 5 && m.textRows.every((r) => Array.isArray(r) && r.length === 2 && r[0] && r[1]), 'textRows are pairs');
ok(m.textRows.some((r) => r[0] === '2 km: 40.0 m (interpolated)') && m.textRows.some((r) => r[0] === '3 km: no reported value') && m.textRows.some((r) => r[0] === '0 km: 10.0 m'), 'textRows list each point, interpolated and missing said');
ok(!strings(m.textRows).some((s) => s.includes('Limassol') || s.includes('Λεμεσός')), 'the text of one profile never mentions the other');
ok(m.textRows.some((r) => r[0] === 'Source: Src') && m.textRows.some((r) => r[0] === 'Sheet note.') && m.textRows.some((r) => r[0] === 'Estimates, not soundings'), 'note, honesty and source are in the text');
// the other profile: own view, own scale
const b = D.select(m, 'limassol');
ok(b.profile === 'limassol' && b.points.length === 2 && b.axis.y.bottom >= 2400 && near(b.points[1].ty, 2400 / b.axis.y.bottom) && m.profile === 'alpha' && near(m.axis.y.bottom, 80), 'select gives the other profile with its own depth scale and leaves the first model alone');
ok(b.startName[1] === 'Ανοιχτά του Μόλου' && b.counts.interpolated === 2, 'the other profile has its own start and counts');
ok(D.build(made, { profile: 'limassol' }).profile === 'limassol' && D.build(made, { profile: 'nope' }).profile === 'alpha' && D.select(m, 'nope') === m && D.select(m, 'constructor') === m, 'opts.profile, with an unknown id falling back');
ok(Object.keys(m.profiles).join() === 'alpha,limassol', 'every profile has its own view');
ok(!strings(D.build({ features: [{ name: 'A', points: [{ km: 0, elevation: -1 }] }] }).legend).some((s) => s.includes('gap')), 'no gap line in the key when no point is missing');
// odd input
const odd = { features: [
  { points: [{ km: 'x', elevation: -5 }, { km: 0.5, elevation: 3, interpolated: 'yes' }, { km: 1.5, elevation: -6 }, null, { km: -1, elevation: -9 }] },
  { id: 'e', name: ['E', 'Ε'], points: [] }, { id: 'n', name: 'N', points: [{ km: 0, elevation: null }, { km: 1 }] }, { name: 'Z', points: [{ km: 0, elevation: 0 }, { km: 0, elevation: 0 }] }, { name: 'Z', points: 'x' }] };
const mo = D.build(odd);
ok(mo.profile === 'profile-1' && mo.points.length === 2 && mo.points[0].km === 0.5 && mo.points[0].kmText[1] === '0,5 χλμ.', 'bad km dropped, id made when the name is absent');
ok(mo.points[0].interpolated === false && mo.points[0].text[0] === '+3.0 m' && mo.points[0].label[0].includes('ground 3.0 m above the sea surface'), 'only a true flag is interpolated; a value above the surface is said as such');
ok(mo.axis.y.top > 0 && mo.axis.y.tSurface > 0 && mo.axis.y.tSurface < 1 && near(mo.points[0].ty, (mo.axis.y.top - 3) / (mo.axis.y.top + mo.axis.y.bottom)) && mo.points[1].ty > mo.axis.y.tSurface, 'the surface line moves down when a value is above it');
const e = D.select(mo, 'e'), nn = D.select(mo, 'n'), z = D.select(mo, 'z'), z2 = D.select(mo, 'z-5');
ok(e.hasPoints === false && e.points.length === 0 && e.textRows[0][1].includes('δεν έχει σημεία') && e.profileName[1] === 'Ε', 'a profile without points says so');
ok(nn.hasPoints && nn.points.every((p) => p.missing) && nn.axis.y.ticks.length === 0 && nn.counts.withValue === 0, 'a profile with only missing values: no scale invented');
ok(z.points[0].elevation === 0 && !z.points[0].missing && z.points[0].ty === 0 && z.points[0].text[0] === '0.0 m' && z.axis.x.max === 1, 'zero is a value, not a missing point');
ok(z2.hasPoints === false, 'a repeated name gets its own id');
for (const bad of [null, {}, { available: false, features: made.features }, { features: [] }, { features: 'x' }]) { const x = D.build(bad); ok(!x.available && x.empty[0] && x.empty[1] && x.points.length === 0 && x.choices.length === 0 && x.textRows.length === 1, 'honest empty state: ' + JSON.stringify(bad).slice(0, 40)); }
ok(!strings(m).some((s) => /[«»]/.test(s)), 'no guillemets, also when the sheet note has them');

// ---- the saved real answer
const file = process.env.DEPTHLINE_REAL || '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad/seabed-profiles.json';
let real = null;
try { real = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (err) { console.log('note: saved real answer not found (' + file + '), real-data checks skipped'); }
if (real) {
  const r = D.build(real);
  ok(r.available && r.choices.map((c) => c.id).join() === 'larnaka,limassol,paphos', 'real: three profiles to choose from');
  ok(r.choices.map((c) => c.name[1]).join() === 'Λάρνακα,Λεμεσός,Πάφος' && r.startName[0] === 'Off Finikoudes' && r.startName[1] === 'Ανοιχτά των Φοινικούδων', 'real: names and start in Greek');
  ok(r.profile === 'larnaka' && r.points.length === 13 && r.counts.interpolated === 12 && r.counts.missing === 0 && r.points[0].interpolated === false, 'real: Larnaka has 13 points, 12 marked interpolated');
  ok(D.select(r, 'paphos').counts.interpolated === 13 && D.select(r, 'limassol').counts.interpolated === 12, 'real: interpolated counts of the other two');
  let good = true;
  real.features.forEach((f, k) => {
    const v = D.select(r, r.choices[k].id), kmMax = Math.max(...f.points.map((p) => p.km)), low = Math.min(...f.points.map((p) => p.elevation));
    f.points.forEach((p, i) => { const q = v.points[i]; if (q.km !== p.km || q.elevation !== p.elevation || q.interpolated !== p.interpolated || Math.abs(q.tx - p.km / kmMax) > 1e-12 || Math.abs(q.ty - (-p.elevation) / v.axis.y.bottom) > 1e-12) good = false; });
    if (v.axis.y.bottom < -low || v.axis.y.bottom > -low * 1.5 || v.axis.y.top !== 0 || v.axis.x.max !== kmMax) good = false;
    if (!v.axis.y.ticks.every((t) => t.t >= 0 && t.t <= 1 + 1e-9) || v.axis.y.ticks.length > 7) good = false;
  });
  ok(good, 'real: every point is the answer\'s own km and elevation on the profile\'s own scale');
  ok(r.points[0].text[0] === '13.2 m' && r.points[0].text[1] === '13,2 μ.' && r.points[12].text[0] === '505.3 m' && r.axis.y.bottom === 600, 'real: depths printed to one decimal; Larnaka scale to 600 m');
  ok(D.select(r, 'paphos').axis.y.bottom === 1000 && D.select(r, 'limassol').axis.y.bottom === 500, 'real: each profile has its own depth scale');
  ok(r.note && r.note[0].includes('unsuitable for navigation') && r.honesty[0].includes('not soundings') && r.textRows.some((x) => x[0] === r.note[0]) && r.textRows.some((x) => x[0].startsWith('Source: EMODnet')), 'real: the sheet\'s note, honesty line and source are in the text');
  const all = strings(r);
  ok(!all.some((s) => /\b(rank|ranking|ranked|best|worst|better|worse|deeper than|shallower than|deepest of|more than|less than|compared with|versus|vs|safe|dangerous)\b/i.test(s)), 'real: no ranking, better/worse or profile-against-profile words');
  ok(!all.some((s) => /(κατάταξη|καλύτερ|χειρότερ|πιο βαθ|πιο ρηχ|σε σύγκριση|περισσότερο από|λιγότερο από|ασφαλ|επικίνδυν)/i.test(s)), 'real: no Greek ranking or better/worse words');
  ok(!strings(r.textRows).some((s) => /Limassol|Paphos|Λεμεσός|Πάφος/.test(s)), 'real: the shown profile\'s text does not bring in the others');
  const ps = pairs(r);
  ok(ps.length > 100 && ps.every((p) => p[0].trim() && p[1].trim()), 'real: every pair has English and Greek');
  ok(ps.filter((p) => /[A-Za-z]{4,}/.test(p[0])).every((p) => /[Ͱ-Ͽ]/.test(p[1]) || p[0] === p[1]), 'real: worded pairs have Greek letters in the Greek half');
  ok(!all.some((s) => /[«»]/.test(s)), 'real: no guillemets');
}
console.log('depthline: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
