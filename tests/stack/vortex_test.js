'use strict';
/* Data Vortex: the pure data side (public/site/vortexdata.js) with small made-up answers shaped like /api/stack/<id>,
   plus the real answers of the repo's own data files. Run: node tests/stack/vortex_test.js (no network, no server, about 1 s) */
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const VD = require(path.join(ROOT, 'public', 'site', 'vortexdata.js'));
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const bi = (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0] && p[1];

const ev = VD.evModel({ publishedAt: '2026-11-15', features: [
  { name: 'A', current: 'DC', connectors: 2, operator: 'Op1' }, { name: 'B', current: 'AC', connectors: 1, operator: 'Op1' }, { name: 'C', current: 'AC', connectors: 4, operator: 'Op2' }, { name: 'D', current: null, connectors: 0, operator: '' }] });
ok(ev.total === 4 && ev.items.length === 4, 'ev counts every record');
ok(ev.items.every((i) => ['AC', 'DC', 'none'].includes(i.b)), 'ev bands are known');
ok(ev.bands.some((b) => b.k === 'none'), 'a record without a type gets its own labelled band, not a guess');
ok(ev.items[2].s === 1 && ev.items[1].s > 0 && ev.items[1].s < 1 && ev.items[3].s === 0, 'ev size follows connectors (square root, biggest = 1)');
const s0 = VD.stats(ev, null);
ok(s0.n === 4 && s0.measure.sum === 7 && s0.measure.top.t === 'C' && s0.measure.top.v === 4, 'ev numbers: 4 points, 7 connectors, largest C');
const s1 = VD.stats(ev, 'Op1');
ok(s1.n === 2 && s1.measure.sum === 3 && Math.round(s1.share) === 50, 'a group counts only its own records');
ok(s0.bands.reduce((a, b) => a + b.count, 0) === s0.n, 'band counts add up to the records shown');
ok(ev.groups.reduce((a, g) => a + g.count, 0) === ev.total, 'every record is in a group');

const cr = VD.crossingsModel({ features: [{ lat: 35.1, lng: 33.3, near: 'Lefkosia' }, { lat: 35.2, lng: 33.4, near: null }, { lat: 34.7, lng: 33.0, near: 'Limassol' }] });
ok(cr.items.length === 3 && cr.items.find((i) => i.b === 'none'), 'crossings far from a centre are kept and labelled, not dropped or called "null"');
ok(!cr.groups.some((g) => /null/i.test(g.n[0] + g.n[1])), 'no "null" label reaches the screen');
ok(cr.measure === null && VD.stats(cr, null).measure === null, 'crossings invent no measure');

const fl = VD.floodModel({ features: [{ code: 'X1', name: 'Pedieos', district: 'Lefkosia', identifiedYear: 2011, polygons: { q100: 3 } }, { code: 'X2', name: 'Yialias', district: 'Lefkosia', identifiedYear: 2018, polygons: { q100: 0 } }] });
ok(fl.bands.length === 2 && fl.items[0].s === 1 && fl.items[1].s === 0, 'flood: bands by year, size by 100-year polygons');
ok(VD.stats(fl, null).measure.sum === 3, 'flood: sum is the sum of the polygon counts');

const qk = VD.quakesModel({ features: [{ id: 'a', time: '2015-04-15T08:25:11Z', magnitude: 5.3, depthKm: 10, place: 'P1', url: 'https://example.org/a' }, { id: 'b', time: '2025-11-01T00:00:00Z', magnitude: 4.6, depthKm: 8, place: 'P2', url: 'javascript:alert(1)' }] });
ok(qk.items[0].d === '2015-04-15' && qk.items[0].ext && qk.items[0].href === 'https://example.org/a', 'quake keeps its date and its https link');
ok(qk.items[1].href === null, 'a link that is not http(s) is dropped');
const sq = VD.stats(qk, null);
ok(sq.dated === 2 && sq.first === '2015-04-15' && sq.last === '2025-11-01' && sq.undated === 0, 'quake dates counted');
ok(qk.groups.map((g) => g.k).join() === '2015,2025', 'quake groups run in year order');

const all = VD.allModel([ev, cr, fl, qk]);
ok(all.total === ev.total + cr.total + fl.total + qk.total, 'the combined funnel holds every record of every data set');
ok(all.groups.length === 4 && all.bands.length === 4, 'one band and one group per data set');
ok(VD.allModel([null, ev]).bands.length === 1, 'a data set that failed to load is left out, not faked');

// the "Other groups" bucket must keep every record selectable and be counted honestly
const many = []; for (let i = 0; i < 70; i++) many.push({ name: 'p' + i, current: 'AC', connectors: 1, operator: 'Op' + i });
const mm = VD.evModel({ features: many });
ok(mm.groups.length === 61 && mm.groups.reduce((a, g) => a + g.count, 0) === 70, 'groups beyond 60 are gathered, none lost');
const sm = VD.stats(mm, null);
ok(sm.groups === 70 && sm.biggest && !sm.biggest.rest, 'the other-groups bucket counts as its 10 groups and is never "the largest"');

// layout: deterministic, one position per record, inside the funnel
const a = VD.layout(all), b = VD.layout(all);
ok(a.length === all.items.length && JSON.stringify(a) === JSON.stringify(b), 'layout is deterministic, one point per record');
ok(a.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && p.y >= -380 && p.y <= 380), 'layout points are finite and inside the funnel');

// every visible label has English and Greek
for (const m of [ev, cr, fl, qk, all]) {
  ok(bi(m.n) && bi(m.unit) && bi(m.note) && bi(m.bandsTitle) && bi(m.groupsTitle), m.id + ': title, unit, note and legend titles in both languages');
  ok(m.bands.every((x) => bi(x.n)) && m.groups.every((x) => bi(x.n)), m.id + ': every band and group name in both languages');
  ok(m.items.every((i) => typeof i.sub === 'string' || bi(i.sub)), m.id + ': every sub-line is text or an English and Greek pair');
}

// the real data files of the repo go through the real builders without losing a record
const fw = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'fieldwork', f), 'utf8'));
const realEv = fw('ev.json').locations, realQ = fw('stack/earthquakes.json').events;
const em = VD.evModel({ features: realEv.map((x) => ({ name: x.name, current: x.currentType, connectors: x.connectors, operator: x.operator })) });
ok(em.total === realEv.length && em.groups.reduce((a2, g) => a2 + g.count, 0) === realEv.length, 'real EV file: every location is one sphere in some group');
const qm = VD.quakesModel({ features: realQ.map((x) => ({ id: x.id, time: x.time, magnitude: x.magnitude, depthKm: x.depthKm, place: x.place, url: x.url })) });
ok(qm.total === realQ.length, 'real earthquake file: every event is one sphere');

// the page and the menu: the entry is wired, the guard against a bad deep link is in place
const shell = fs.readFileSync(path.join(ROOT, 'public', 'site', 'shell.js'), 'utf8');
ok(/\['vortex', 'db', 'Data Vortex'/.test(shell) && /'stack', 'vortex'/.test(shell), 'the menu lists the Data Vortex and its page is ready');
const stackApp = fs.readFileSync(path.join(ROOT, 'public', 'stack-app.js'), 'utf8');
ok(/Q\.get\('solo'\)/.test(stackApp) && /\^\[a-z0-9\]\+\$/.test(stackApp), 'the stack accepts a solo sheet only by a known, plain id');
ok(!/[«»]/.test(fs.readFileSync(path.join(ROOT, 'public', 'site', 'pages', 'vortex.js'), 'utf8')), 'no guillemets in the page');

console.log(`Vortex: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
