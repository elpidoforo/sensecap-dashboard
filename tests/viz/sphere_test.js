'use strict';
// node tests/viz/sphere_test.js : cell sphere data (one cell = one real record)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const S = require(path.join(root, 'public/site/viz/sphere-data.js'));
const V = require(path.join(root, 'public/site/vortexdata.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const isPair = (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0] && p[1];
const finite = (c) => [c.x, c.y, c.z, c.r, c.cr].every((v) => typeof v === 'number' && isFinite(v));

function mk(n, groups) {
  const items = []; for (let i = 0; i < n; i++) items.push({ b: i % 2 ? 'A' : 'B', g: 'g' + (i % groups), s: (i % 5) / 4, t: 'Record ' + i, sub: ['sub ' + i, 'υπο ' + i], d: '', href: null });
  return { id: 'x', n: ['Test', 'Δοκιμή'], unit: ['things', 'πράγματα'], bandsTitle: ['Kind', 'Είδος'], note: ['Note.', 'Σημείωση.'],
    bands: [{ k: 'A', n: ['Alpha', 'Άλφα'], c: '#ff0000' }, { k: 'B', n: ['Beta', 'Βήτα'], c: '#00ff00' }], groups: Array.from({ length: groups }, (_, i) => ({ k: 'g' + i, n: ['Group ' + i, 'Ομάδα ' + i], count: 0 })), items };
}
function checkAll(m, label, gk) {
  const d = S.build(m, gk);
  ok(d.cells.length === Math.min(m.items.length, S.CAP), label + ': one cell per record');
  ok(new Set(d.cells.map((c) => c.item)).size === d.cells.length, label + ': every cell has its own record');
  ok(d.cells.every(finite), label + ': no NaN in cells');
  ok(d.cells.every((c) => Math.abs(Math.hypot(c.x, c.y, c.z) - 1) < 1e-9), label + ': cells on the unit sphere');
  ok(d.cells.every((c) => c.r > 0 && c.r <= 1 && c.cr > 0), label + ': radius in range');
  ok(d.arcs.every(([a, b]) => a !== b && d.cells[a].g === d.cells[b].g && (gk == null || d.cells[a].g === gk)), label + ': arcs only inside the group');
  ok(JSON.stringify(d.arcs).indexOf('null') < 0 && d.arcs.flat().every((i) => Number.isInteger(i) && i >= 0 && i < d.cells.length), label + ': arc indexes valid');
  ok(d.textRows.length > 0 && d.textRows.every(isPair), label + ': textRows are non-empty [en, el] pairs');
  ok(isPair(d.ariaLabel) && isPair(d.emptyText), label + ': aria and empty text bilingual');
  ok(d.legend.every((l) => isPair(l.n)), label + ': legend names bilingual');
  ok(!/[«»]/.test(JSON.stringify(d.textRows)), label + ': no guillemets');
  // no bad overlap: discs on a tangent plane, neighbours at chord distance >= sum of radii
  let bad = 0; for (let i = 0; i < d.cells.length; i++) for (let j = i + 1; j < d.cells.length; j++) { const A = d.cells[i], B = d.cells[j]; if (Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z) < A.cr + B.cr - 1e-9) bad++; }
  ok(bad === 0, label + ': no overlapping discs (' + bad + ')');
  return d;
}

// made-up input
const m = mk(60, 4);
const d0 = checkAll(m, 'made-up', null);
ok(d0.arcs.length === 0, 'no group selected: no arcs');
ok(d0.stats.total === 60 && d0.stats.shown === 60 && d0.stats.notShown === 0, 'stats count all records');
const d1 = checkAll(m, 'made-up group', 'g1');
const inG = m.items.filter((i) => i.g === 'g1').length;
ok(d1.arcs.length === inG - 1 && d1.stats.groupCount === inG, 'group of ' + inG + ' is joined by ' + (inG - 1) + ' arcs');
ok(S.build(m, 'nope').arcs.length === 0, 'unknown group: no arcs');
ok(JSON.stringify(S.build(m, 'g2')) === JSON.stringify(S.build(m, 'g2')), 'deterministic');
ok(JSON.stringify(S.build(mk(60, 4)).cells.map((c) => [c.x, c.y, c.z, c.item.t])) === JSON.stringify(d0.cells.map((c) => [c.x, c.y, c.z, c.item.t])), 'deterministic across fresh models');
const one = S.build(mk(1, 1), 'g0'); ok(one.cells.length === 1 && one.arcs.length === 0 && finite(one.cells[0]), 'single record');
const none = S.build({ items: [] }); ok(none.cells.length === 0 && none.textRows.length === 1 && isPair(none.textRows[0]), 'empty model: honest empty state');
const bare = S.build({ items: [{ b: 'q', g: 'q', t: 'x', sub: ['a', 'b'] }] }); ok(bare.cells.length === 1 && finite(bare.cells[0]) && bare.cells[0].color, 'missing s, bands, names do not break');
ok(S.build(mk(5, 2)).cells.length === 5 && S.build(null).cells.length === 0, 'null model safe');
// radius follows size, with a floor
const sz = S.build({ items: [{ b: 'a', g: 'a', s: 0, t: 'a', sub: ['', ''] }, { b: 'a', g: 'a', s: 1, t: 'b', sub: ['', ''] }] });
const rs = Object.fromEntries(sz.cells.map((c) => [c.item.t, c.r])); ok(rs.a > 0 && rs.a < rs.b && rs.b === 1, 'radius floor and growth');

// cap at 900: never sample silently
const big = mk(1000, 5), db = checkAll(big, 'cap', 'g0');
ok(db.stats.shown === 900 && db.stats.notShown === 100 && db.stats.total === 1000, 'cap: 900 shown, 100 counted as not shown');
ok(db.textRows.some((r) => /100 of 1000 records are not shown/.test(r[0]) && /100 από 1000/.test(r[1])), 'cap: textRows say how many are not shown');
ok(db.cells.every((c, i) => true) && new Set(db.cells.map((c) => c.item.t)).size === 900 && db.cells.every((c) => Number(c.item.t.split(' ')[1]) < 900), 'cap: the first 900 records, in model order');
ok(db.stats.groupCount === 200 && db.stats.groupShown === 180, 'cap: group counts say what is hidden');

// real files through the Vortex builders, the same way stackdata.js shapes them
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const ev = JSON.parse(fs.readFileSync(path.join(root, 'fieldwork/ev.json'), 'utf8'));
const evAns = { features: ev.locations.map((p) => ({ lat: r5(p.latitude), lng: r5(p.longitude), name: p.name, current: p.currentType, connectors: p.connectors, operator: p.operator })), publishedAt: ev.publishedAt };
const evM = V.evModel(evAns);
ok(evM.items.length === ev.locations.length && ev.locations.length > 100, 'ev: Vortex builder keeps all ' + ev.locations.length + ' locations');
const evD = checkAll(evM, 'ev', null);
ok(evD.cells.length === ev.locations.length, 'ev: no record lost');
const op = evM.groups[0].k, evG = checkAll(evM, 'ev group', op);
ok(evG.arcs.length === evM.items.filter((i) => i.g === op).length - 1 && evG.arcs.length > 10, 'ev: biggest operator joined by arcs (' + evG.arcs.length + ')');
ok(evD.legend.reduce((a, l) => a + l.count, 0) === ev.locations.length, 'ev: legend counts add up to the records');

const eq = JSON.parse(fs.readFileSync(path.join(root, 'fieldwork/stack/earthquakes.json'), 'utf8'));
const eqAns = { features: eq.events.map((e) => ({ id: e.id, time: e.time, lat: e.latitude, lng: e.longitude, depthKm: e.depthKm, magnitude: e.magnitude, magnitudeType: e.magnitudeType, place: e.place, reviewStatus: e.reviewStatus, url: e.url })) };
const eqM = V.quakesModel(eqAns), eqD = checkAll(eqM, 'quakes', null);
ok(eqD.cells.length === eq.events.length && eq.events.length === 14, 'quakes: all ' + eq.events.length + ' events are cells');
const yr = eqM.groups.find((g) => g.count > 1), eqG = checkAll(eqM, 'quakes group', yr.k);
ok(eqG.arcs.length === yr.count - 1, 'quakes: year group joined by arcs');
ok(new Set(eqD.cells.map((c) => c.item.t + c.item.d)).size >= 2, 'quakes: cells carry their own records');

// all data sets together
const crAns = { features: [{ lat: 35.1, lng: 33.3, near: 'Lefkosia' }, { lat: 34.7, lng: 33, near: null }] };
const allM = V.allModel([evM, eqM, V.crossingsModel(crAns)]), allD = checkAll(allM, 'all', 'quakes');
ok(allD.cells.length === 171 + 14 + 2, 'all: one cell per record across data sets (' + allD.cells.length + ')');

console.log('sphere: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
