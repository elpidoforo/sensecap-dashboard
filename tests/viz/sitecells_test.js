'use strict';
/* Site cells data: one cell per bathing site, grouped by the label reported for the season, alphabetical inside a group,
   a no-label group for sites without one, a shape per label, no score and no "safe" badge, a name filter, bilingual strings.
   Small made-up input AND the saved real answer of /api/stack/bathing-water when it exists.
   Run: node tests/viz/sitecells_test.js */
const fs = require('fs');
const path = require('path');
const D = require('../../public/site/viz/sitecells-data.js');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const pairs = (o, out = []) => { if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string')) out.push(o); else if (Array.isArray(o)) o.forEach((x) => pairs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => pairs(x, out)); return out; };

// ---- small made-up answer: three reported labels given out of order, two sites without a label, one unknown label
const made = { available: true, period: '2031', published: '2032-05-01', source: ['Src', 'Πηγή'], honesty: ['A past season, not today', 'Περασμένη περίοδος, όχι σήμερα'],
  note: ['No score and no "safe" badge.', 'Ούτε βαθμός ούτε σήμα «ασφαλές».'],
  features: [
    { id: 's1', name: 'Zeta Bay', label: '2 - Good' }, { id: 's2', name: 'alpha beach', label: '1 - Excellent' }, { id: 's3', name: 'Beta', label: '1 - Excellent' },
    { id: 's4', name: 'Όρμος', label: null }, { id: 's5', name: 'Gamma', label: '4 - Poor' }, { id: 's6', name: 'Delta', label: '  ' },
    { id: 's7', name: 'Άλφα Beach', label: '1 - Excellent' }, { id: 's8', name: 'Eta', label: 'Under review' }, { name: 'Beta', label: '1 - Excellent' }, { id: 's10', label: '2 - Good' },
  ] };
const m = D.build(made);
ok(m.available && m.id === 'sitecells' && m.sites.length === 10 && m.counts.sites === 10, 'one cell per site');
ok(m.groups.map((g) => g.key).join('|') === '1 - Excellent|2 - Good|4 - Poor|Under review|(none)', 'groups follow the reported class code, unknown labels next, no-label group last');
ok(m.groups.map((g) => g.count).join() === '4,2,1,1,2' && m.groups.reduce((a, g) => a + g.count, 0) === 10, 'group counts add up to the sites');
ok(m.groups[0].labelText[0] === 'Excellent' && m.groups[0].labelText[1] === 'Εξαιρετική' && m.groups[0].heading[0] === 'Excellent · 4 sites' && m.groups[0].heading[1] === 'Εξαιρετική · 4 σημεία', 'heading: the label and its count, both languages');
ok(m.groups[2].heading[0] === 'Poor · 1 site' && m.groups[2].heading[1] === 'Ανεπαρκής · 1 σημείο', 'singular count');
ok(m.groups[3].labelText[0] === 'Under review' && m.groups[3].labelText[1] === 'Under review' && m.groups[3].label === 'Under review', 'an unknown label is shown as reported, nothing made up');
const none = m.groups[4];
ok(none.label === null && none.labelText[0] === 'no label for this season' && none.labelText[1] === 'χωρίς ετικέτα για αυτή την περίοδο' && none.count === 2 && none.glyph === 'dash', 'sites without a label are their own group');
ok(m.counts.labelled === 8 && m.counts.unlabelled === 2 && m.counts.text[0] === '10 sites: 8 with a reported label, 2 with no label for this season.', 'counts with and without a label');
ok(m.sites.slice(0, 4).map((s) => s.name).join('|') === 'alpha beach|Beta|Beta|Άλφα Beach' && m.sites[1].id === 's3' && m.sites[2].id === 'site-9', 'alphabetical inside a group (case ignored, same names by id), id made when absent');
ok(m.sites.slice(8).map((s) => s.name).join('|') === 'Delta|Όρμος' && m.sites[8].label === null, 'a blank label counts as no label');
ok(m.sites[4].name === 's10' && m.sites[5].name === 'Zeta Bay', 'a site without a name shows its id');
ok(m.groups.every((g) => m.sites.slice(g.from, g.to).every((s) => m.groups[s.group] === g) && g.to - g.from === g.count), 'from/to mark each group\'s cells');
ok(new Set(m.groups.map((g) => g.glyph)).size === m.groups.length && m.groups.every((g) => /^#[0-9A-F]{6}$/i.test(g.tone)), 'every group has its own shape (colour is not the only cue)');
ok(m.sites[0].sentence[0] === 'alpha beach: Excellent (label reported for bathing season 2031)' && m.sites[0].sentence[1].includes('Εξαιρετική') && m.sites[0].sentence[1].includes('2031'), 'site sentence in both languages');
ok(m.sites[9].sentence[0] === 'Όρμος: no label for this season' && m.sites[9].sentence[1] === 'Όρμος: χωρίς ετικέτα για αυτή την περίοδο', 'no-label site sentence');
ok(m.seasonText[0] === 'Bathing season 2031' && m.seasonText[1] === 'Κολυμβητική περίοδος 2031' && m.season === '2031' && m.published === '2032-05-01', 'season and publication date from the sheet');
ok(m.ariaLabel[0].includes('Excellent · 4 sites') && m.ariaLabel[0].includes('no label for this season · 2 sites') && m.ariaLabel[1].includes('Εξαιρετική · 4 σημεία'), 'aria label names every group and its count');
ok(m.textRows.length >= 10 + 5 + 4 && m.textRows.every((r) => Array.isArray(r) && r.length === 2 && r[0] && r[1]), 'textRows are pairs');
ok(m.textRows.some((r) => r[0] === 'Gamma: Poor' && r[1] === 'Gamma: Ανεπαρκής') && m.textRows.some((r) => r[0] === 'Delta: no label for this season') && m.textRows.some((r) => r[0] === 'Published: 2032-05-01') && m.textRows.some((r) => r[0] === 'Source: Src'), 'textRows list every site with its label, then source and date');
ok(!('score' in m) && !m.sites.some((s) => 'score' in s || 'rank' in s || 'safe' in s) && !m.groups.some((g) => 'share' in g || 'percent' in g), 'no score, rank or share field anywhere');
// the name filter
let f = D.match(m, 'beta');
ok(f.active && f.count === 2 && f.total === 10 && f.on.filter(Boolean).length === 2 && f.on[1] && f.on[2] && f.text[0] === '2 of 10 site names contain "beta".' && f.text[1].includes('2 από 10'), 'filter: name contains text, case ignored');
f = D.match(m, 'αλφα'); ok(f.count === 1 && f.on[3], 'filter: accents ignored');
f = D.match(m, 'ορμοσ'); ok(f.count === 1 && f.on[9] && D.match(m, 'ΌΡΜΟΣ').count === 1, 'filter: Greek capitals and final sigma');
f = D.match(m, '  BEACH '); ok(f.count === 2 && f.on[0] && f.on[3], 'filter: spaces trimmed');
f = D.match(m, 'qqq'); ok(f.count === 0 && f.active && f.text[0] === 'No site name matches.' && f.on.every((x) => !x), 'filter: nothing found is said');
for (const t of ['', '   ', null, undefined]) { f = D.match(m, t); ok(!f.active && f.count === 10 && f.on.every(Boolean) && f.text === null, 'filter: empty text matches every site (' + JSON.stringify(t) + ')'); }
ok(D.match(m, 'excellent').count === 0, 'filter looks at names only, not at labels');
ok(D.match(D.emptyModel(), 'a').count === 0 && D.match(null, 'a').total === 0, 'filter on an empty model');
// odd input
const one = D.build({ features: [{ id: 'a', name: 'A' }, null, 'x', { id: 'a', name: 'B', label: 7 }] });
ok(one.sites.length === 2 && one.groups.length === 2 && one.groups[0].label === '7' && one.groups[1].label === null && one.sites[1].id === 'a' && one.sites[0].id === 'a-2' && one.seasonText[0] === 'One bathing season', 'odd features dropped, repeated id kept apart, no season invented');
const many = D.build({ features: ['A', 'B', 'C', 'D', 'E', 'F'].map((x, i) => ({ id: 'x' + i, name: x, label: 'Class ' + x })) });
ok(many.groups.length === 6 && many.groups.every((g) => g.glyph && g.count === 1), 'many unknown labels still each get a shape');
for (const bad of [null, {}, { available: false, features: made.features }, { features: [] }, { features: 'x' }]) { const x = D.build(bad); ok(!x.available && x.empty[0] && x.empty[1] && x.sites.length === 0 && x.groups.length === 0 && x.textRows.length === 1, 'honest empty state: ' + JSON.stringify(bad).slice(0, 40)); }
ok(!strings(m).some((s) => /[«»]/.test(s)), 'no guillemets, also when the sheet note has them');

// ---- the saved real answer
const file = process.env.SITECELLS_REAL || '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad/bathing-water.json';
let real = null;
try { real = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (err) { console.log('note: saved real answer not found (' + file + '), real-data checks skipped'); }
if (real) {
  const r = D.build(real);
  ok(r.available && r.sites.length === real.features.length && r.sites.length === 123 && new Set(r.sites.map((s) => s.id)).size === 123, 'real: 123 sites, one cell each');
  ok(r.groups.length === real.counts.labels.length && real.counts.labels.every((c) => { const g = r.groups.find((x) => x.label === c.label); return g && g.count === c.sites; }), 'real: group counts equal the sheet\'s own counts.labels');
  ok(r.groups[0].heading[0] === 'Excellent · 123 sites' && r.groups[0].heading[1] === 'Εξαιρετική · 123 σημεία' && r.counts.unlabelled === 0 && !r.groups.some((g) => g.label === null), 'real: one group this season, and no empty no-label group is drawn');
  const byId = new Map(real.features.map((x) => [x.id, x]));
  ok(r.sites.every((s) => { const x = byId.get(s.id); return x && x.name === s.name && x.label === s.label; }), 'real: every cell carries the sheet\'s own name and label');
  ok(r.sites.every((s, i) => i === 0 || r.sites[i - 1].group !== s.group || r.sites[i - 1].search <= s.search), 'real: alphabetical inside the group');
  ok(r.seasonText[0] === 'Bathing season 2025' && r.published === '2026-06-02', 'real: season 2025, published 2026-06-02');
  ok(r.note[0].includes('No score and no "safe" badge') && r.honesty[0].includes('not today') && r.textRows.some((x) => x[0] === r.note[0]) && r.textRows.some((x) => x[0].startsWith('Source: European Environment Agency')), 'real: the sheet\'s note, honesty line and source are in the text');
  const mine = strings(Object.assign({}, r, { note: null, textRows: r.textRows.filter((x) => x[0] !== r.note[0]) }));
  ok(!mine.some((s) => /\b(safe|unsafe|score|scored|rating|best|worst|cleanest|dirtiest|top|winner|percent)\b|%/i.test(s)), 'real: outside the sheet\'s own note, no score or "safe" wording');
  ok(!mine.some((s) => /(ασφαλ|βαθμ|βαθμολογ|καλύτερ|χειρότερ|πιο καθαρ|νικητ)/i.test(s)), 'real: no Greek score or "safe" wording outside the note');
  ok(D.match(r, 'nissi').count === real.features.filter((x) => /nissi/i.test(x.name)).length && D.match(r, 'nissi').count >= 2, 'real: filter by name');
  ok(D.match(r, 'λουμα').count === 1 && D.match(r, '').count === 123, 'real: a Greek name is found without accents; empty filter shows all');
  const ps = pairs(r);
  ok(ps.length > 100 && ps.every((p) => p[0].trim() && p[1].trim()), 'real: every pair has English and Greek');
  ok(ps.filter((p) => /[a-z]{4,}/.test(p[0]) && !r.sites.some((s) => s.name === p[0])).every((p) => /[Ͱ-Ͽ]/.test(p[1])), 'real: worded pairs have Greek letters in the Greek half');
  ok(!strings(r).some((s) => /[«»]/.test(s)), 'real: no guillemets');
}
console.log('sitecells: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
