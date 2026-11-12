'use strict';
// Unit tests of blocks.js (no server, no network): choices, checking, plain words, drawing, reading numbers.
const assert = require('assert');
const B = require('../../blocks.js');

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const NOW = Date.parse('2026-11-12T14:30:00Z');
const H = 3600000;

const NAMES = { 4097: ['Air temperature', '°C'], 4098: ['Air humidity', '%RH'], 4100: ['CO2', 'ppm'], 4197: ['Longitude', '°'], 4198: ['Latitude', '°'], 5001: ['PM2.5', 'ug/m3'] };
const DEVICES = [
  { eui: 'A1', group: 'PASCAL Larnaka', measurements: ['4097', '4098', '4100', '4197', '4198'] },
  { eui: 'A2', group: 'PASCAL Larnaka', measurements: [4097, 4100] },
  { eui: 'B1', group: 'PASCAL Limassol', measurements: ['4097', '4100', '5001'] },
  { eui: 'C1', group: 'Some other group', measurements: ['4097'] },
];
const OPT = B.buildOptions(DEVICES, NAMES);
const good = () => ({ v: 1, show: { measurement: '4100', school: 'larnaca' }, last: 24, as: 'line', alerts: [{ when: 'above', value: 1000, colour: 'red', say: 'Open a window!' }], compare: { school: 'limassol' } });
const throwsCode = (fn, code) => { try { fn(); } catch (e) { assert.ok(e instanceof B.BlockError, 'a BlockError, got ' + e); assert.strictEqual(e.code, code, e.code + ' / ' + e.message); return; } assert.fail('expected ' + code); };

// fake public data: Larnaka sensors drift up to 1180, Limassol stays near 520
function fakeData(opts) {
  const calls = [];
  const d = {
    calls,
    devices: async () => DEVICES,
    series: async (eui, mid, days) => {
      calls.push([eui, String(mid), days]);
      if (opts && opts.fail) throw new Error('boom');
      const pts = [];
      for (let t = NOW - days * 24 * H; t <= NOW - 10 * 60000; t += 10 * 60000) {
        const hoursAgo = (NOW - t) / H;
        const base = eui === 'B1' ? 520 : 1180 - hoursAgo * 22;
        pts.push({ t, v: Math.round(base + (eui === 'A2' ? 20 : 0)) });
      }
      return pts;
    },
  };
  return d;
}

/* ---------------- choices ---------------- */
test('options: GPS measurements are never offered, only schools that have sensors, measurement -> schools', () => {
  assert.deepStrictEqual(OPT.schools.map((s) => s.id), ['larnaca', 'limassol']);
  assert.ok(!OPT.measurements.some((m) => ['4197', '4198'].includes(m.id)), 'no GPS');
  const co2 = OPT.measurements.find((m) => m.id === '4100');
  assert.deepStrictEqual(co2.schools.sort(), ['larnaca', 'limassol']);
  assert.strictEqual(co2.el, 'CO₂');
  assert.strictEqual(OPT.measurements.find((m) => m.id === '4098').schools.join(), 'larnaca');
  assert.strictEqual(OPT.measurements.find((m) => m.id === '5001').el, 'PM2.5 (σωματίδια)');
  assert.deepStrictEqual(OPT.hours, [1, 3, 6, 12, 24, 72, 168]);
  assert.strictEqual(OPT.maxAlerts, 3);
});

/* ---------------- checking ---------------- */
test('validate: a good recipe comes back clean, unknown keys are dropped', () => {
  const r = B.validate({ ...good(), html: '<script>alert(1)</script>', code: 'x', show: { measurement: 4100, school: 'larnaca', evil: 1 } }, OPT);
  assert.deepStrictEqual(r, { v: 1, show: { measurement: '4100', school: 'larnaca' }, last: 24, as: 'line', alerts: [{ when: 'above', value: 1000, colour: 'red', say: 'Open a window!' }], compare: { school: 'limassol' } });
  assert.deepStrictEqual(Object.keys(r).sort(), ['alerts', 'as', 'compare', 'last', 'show', 'v']);
});
test('validate: every wrong choice is refused with its own code', () => {
  const mk = (f) => { const r = good(); f(r); return () => B.validate(r, OPT); };
  throwsCode(() => B.validate(null, OPT), 'shape');
  throwsCode(() => B.validate([], OPT), 'shape');
  throwsCode(mk((r) => { r.show.measurement = '9999'; }), 'measurement');
  throwsCode(mk((r) => { r.show.measurement = '4197'; }), 'measurement');   // GPS
  throwsCode(mk((r) => { r.show.school = 'paphos'; }), 'school');           // no sensors at all
  throwsCode(mk((r) => { r.show.measurement = '4098'; r.show.school = 'limassol'; r.compare = null; }), 'nosensor');
  throwsCode(mk((r) => { r.show.measurement = '4098'; }), 'nosensor');      // compare school has no humidity
  throwsCode(mk((r) => { r.last = 5; }), 'last');
  throwsCode(mk((r) => { r.last = '24; drop'; }), 'last');
  throwsCode(mk((r) => { r.as = 'pie'; }), 'as');
  throwsCode(mk((r) => { r.alerts = 'x'; }), 'alerts');
  throwsCode(mk((r) => { r.alerts = [1]; }), 'alerts');
  throwsCode(mk((r) => { r.alerts = [good().alerts[0], good().alerts[0], good().alerts[0], good().alerts[0]]; }), 'alerts');
  throwsCode(mk((r) => { r.alerts[0].when = 'sideways'; }), 'alert_when');
  throwsCode(mk((r) => { r.alerts[0].value = 'abc'; }), 'alert_value');
  throwsCode(mk((r) => { r.alerts[0].value = ''; }), 'alert_value');
  throwsCode(mk((r) => { r.alerts[0].value = Infinity; }), 'alert_value');
  throwsCode(mk((r) => { r.alerts[0].value = 1e9; }), 'alert_value');
  throwsCode(mk((r) => { r.alerts[0].colour = '#fff'; }), 'alert_colour');
  throwsCode(mk((r) => { r.alerts[0].colour = 'red; background:url(x)'; }), 'alert_colour');
  throwsCode(mk((r) => { r.alerts[0].say = 'x'.repeat(61); }), 'alert_say');
  throwsCode(mk((r) => { r.compare = { school: 'larnaca' }; }), 'compare');
  throwsCode(mk((r) => { r.compare = { school: 'nowhere' }; }), 'compare');
  throwsCode(mk((r) => { r.compare = 'limassol'; }), 'compare');
});
test('validate: numbers from text boxes, the alert text is cleaned and checked by the private-text rule', () => {
  const r = good(); r.alerts = [{ when: 'below', value: ' 12.3456 ', colour: 'blue', say: '  Wear\n a   <b>coat</b>\u0007  ' }]; r.compare = null;
  const v = B.validate(r, OPT);
  assert.deepStrictEqual(v.alerts[0], { when: 'below', value: 12.346, colour: 'blue', say: 'Wear a bcoat/b' });
  assert.strictEqual(v.compare, null);
  const q = good(); q.alerts[0].say = 'call 99 123456';
  throwsCode(() => B.validate(q, OPT, (t) => (/\d{6}/.test(t) ? 'There is a phone number in chat.' : '')), 'alert_private');
  try { B.validate(q, OPT, () => 'A phone number in chat.'); } catch (e) { assert.ok(/here/.test(e.message) && !/in chat/.test(e.message)); }
  const z = good(); z.alerts = []; z.compare = undefined;
  assert.deepStrictEqual(B.validate(z, OPT).alerts, []);
  assert.strictEqual(B.validate(z, OPT).compare, null);
});

/* ---------------- plain words ---------------- */
test('sentence: English and Greek', () => {
  const r = B.validate(good(), OPT);
  assert.strictEqual(B.sentence(r, OPT, 'en'), 'Show CO2 at PASCAL Larnaka for the last 24 hours as a line chart. When it goes above 1000 ppm, colour it red and say “Open a window!”. Compare with PASCAL Limassol.');
  assert.strictEqual(B.sentence(r, OPT, 'el'), 'Δείξε CO₂ στο PASCAL Λάρνακα για τις τελευταίες 24 ώρες ως γραμμικό γράφημα. Όταν ανέβει πάνω από 1000 ppm, χρωμάτισέ το κόκκινο και γράψε «Open a window!». Σύγκρινε με το PASCAL Λεμεσός.');
  const a = B.validate({ show: { measurement: '4097', school: 'limassol' }, last: 1, as: 'number', alerts: [{ when: 'below', value: 12, colour: 'blue', say: '' }] }, OPT);
  assert.strictEqual(B.sentence(a, OPT, 'en'), 'Show air temperature at PASCAL Limassol for the last hour as a big number. When it drops below 12 °C, colour it blue.');
  assert.strictEqual(B.sentence(a, OPT, 'el'), 'Δείξε θερμοκρασία αέρα στο PASCAL Λεμεσός για την τελευταία ώρα ως ένα μεγάλο νούμερο. Όταν πέσει κάτω από 12 °C, χρωμάτισέ το μπλε.');
  const d = B.validate({ show: { measurement: '4097', school: 'larnaca' }, last: 168, as: 'table' }, OPT);
  assert.ok(/for the last 7 days as a small table\.$/.test(B.sentence(d, OPT, 'en')));
  assert.ok(/τις τελευταίες 7 ημέρες ως έναν μικρό πίνακα\.$/.test(B.sentence(d, OPT, 'el')));
  assert.strictEqual(B.defaultTitle(r, OPT, 'en'), 'CO2 at PASCAL Larnaka');
  assert.strictEqual(B.defaultTitle(r, OPT, 'el'), 'CO₂ στο PASCAL Λάρνακα');
  const longest = B.validate({ ...good(), alerts: [0, 1, 2].map(() => ({ when: 'above', value: 123456.789, colour: 'orange', say: 'Σ'.repeat(60) })) }, OPT);
  assert.ok(B.sentence(longest, OPT, 'en').length < 600 && B.sentence(longest, OPT, 'el').length < 900, 'three longest alerts fit the idea field (' + B.sentence(longest, OPT, 'en').length + ')');
});

/* ---------------- reading numbers ---------------- */
test('gather: averages the school sensors in buckets, never asks for GPS, shares one request through the cache', async () => {
  B._t.rawCache.clear();
  const data = fakeData();
  const r = B.validate(good(), OPT);
  const g = await B.gather(r, OPT, data, NOW);
  assert.strictEqual(g.main.sensors, 2);
  assert.strictEqual(g.other.sensors, 1);
  assert.ok(data.calls.every(([eui, mid]) => mid === '4100' && ['A1', 'A2', 'B1'].includes(eui)), JSON.stringify(data.calls));
  assert.ok(!data.calls.some(([eui]) => eui === 'C1'), 'a sensor of another group is never read');
  assert.strictEqual(g.main.width, 30 * 60000);                 // 24 h, 48 buckets
  assert.strictEqual(g.main.points.length, 48);
  const last = g.main.points[g.main.points.length - 1];
  assert.ok(last.v > 1150 && last.v < 1220, 'newest bucket near 1180 + half the A2 offset, got ' + last.v);
  assert.strictEqual(g.main.latest.v, last.v);
  assert.ok(g.main.stats.min < g.main.stats.avg && g.main.stats.avg < g.main.stats.max);
  assert.ok(g.other.points.every((p) => p.v === 520));
  const before = data.calls.length;
  await B.gather(r, OPT, data, NOW + 5000);
  assert.strictEqual(data.calls.length, before, 'the second look inside a minute reads nothing again');
  B._t.rawCache.clear();
  const h = await B.gather({ ...r, last: 168, as: 'bars', compare: null }, OPT, data, NOW);
  assert.ok(data.calls.some(([, , days]) => days === 7), 'a week asks for 7 days');
  assert.strictEqual(h.main.points.length <= 24 && h.main.points.length >= 20, true, 'bars use about 24 buckets: ' + h.main.points.length);
});
test('gather: a failing source is a result with no points, not an error', async () => {
  B._t.rawCache.clear();
  const g = await B.gather(B.validate(good(), OPT), OPT, fakeData({ fail: true }), NOW);
  assert.strictEqual(g.main.points.length, 0); assert.strictEqual(g.main.latest, null);
  const g2 = await B.gather(B.validate(good(), OPT), OPT, { devices: async () => { throw new Error('x'); }, series: async () => [] }, NOW);
  assert.strictEqual(g2.main.error, 'devices');
  B._t.rawCache.clear();
});
test('bucket plan and helpers', () => {
  assert.deepStrictEqual(B._t.bucketPlan(1, 'line'), { width: 5 * 60000, count: 12 });
  assert.deepStrictEqual(B._t.bucketPlan(24, 'bars'), { width: 60 * 60000, count: 24 });
  assert.deepStrictEqual(B._t.bucketPlan(168, 'line'), { width: 210 * 60000, count: 48 });
  assert.strictEqual(B._t.niceStep(230), 500); assert.strictEqual(B._t.niceStep(0.07), 0.1);
  const y = B._t.yScale([400, 1400, 1000], false);
  assert.ok(y.lo <= 400 && y.hi >= 1400 && y.ticks.length >= 3 && y.ticks.length <= 8, JSON.stringify(y));
  assert.ok(B._t.yScale([5, 5], true).lo <= 0 && B._t.yScale([5, 5], true).hi > 5);
  assert.strictEqual(B._t.fmtNum(1180, 'en'), '1180'); assert.strictEqual(B._t.fmtNum(21.456, 'en'), '21.46'); assert.strictEqual(B._t.fmtNum(101325, 'en'), '101,325'); assert.strictEqual(B._t.fmtNum(NaN, 'en'), '–');
  const pts = B._t.bucketize([{ t: 0, v: 1 }, { t: 10, v: 3 }, { t: 1000, v: 10 }, { t: 5000, v: 99 }], 0, 1000, 500);
  assert.deepStrictEqual(pts.map((p) => [p.t, p.v]), [[250, 2], [750, 10]]);
});

/* ---------------- drawing ---------------- */
const draw = async (patch, lang, title) => {
  B._t.rawCache.clear();
  const r = B.validate({ ...good(), ...(patch || {}) }, OPT);
  const g = await B.gather(r, OPT, fakeData(), NOW);
  return B.render(r, OPT, g, { lang: lang || 'en', title });
};
test('render: a line chart is plain HTML and SVG with no script, has the alert and the numbers table', async () => {
  const h = await draw();
  assert.ok(/^<!doctype html><html lang="en">/.test(h));
  assert.ok(!/<script|onerror|onload|javascript:|<iframe|<img|<link|src=|href=/i.test(h), 'nothing that can run or load');
  assert.ok(h.includes('<svg viewBox="0 0 480 280" role="img"'));
  assert.ok(h.includes('class="ln"') && h.includes('class="ln2"'), 'both lines');
  assert.ok(h.includes('class="thr c-red"'), 'threshold line');
  assert.ok(h.includes('class="alert c-red"') && h.includes('Open a window!'), 'newest reading is above 1000: the alert shows its message');
  assert.ok(/<details><summary>Show the numbers<\/summary><table>/.test(h));
  assert.ok(/CO2 at PASCAL Larnaka/.test(h) && /average of 2 sensors/.test(h));
  assert.ok(/Above 1000 ppm for about/.test(h), 'how long it was above');
  assert.ok(h.length < 30000, 'small: ' + h.length);
});
test('render: Greek page', async () => {
  const h = await draw({}, 'el');
  assert.ok(h.includes('<html lang="el">') && h.includes('Δείξε τους αριθμούς') && h.includes('μέσος όρος 2 αισθητήρων'));
  assert.ok(/CO₂ στο PASCAL Λάρνακα/.test(h));
});
test('render: bars colour the bars that break the alert; number shows now, lowest, average, highest and the other school; table lists newest first', async () => {
  let h = await draw({ as: 'bars', compare: null });
  assert.ok(/class="bar c-red"/.test(h) && /class="bar"/.test(h));
  h = await draw({ as: 'number' });
  assert.ok(h.includes('class="two"') && h.includes('class="big c-red"') && h.includes('<b>1180</b>') === false);   // 1180 + A2 offset is averaged: not exactly 1180
  assert.ok(/lowest/.test(h) && /average/.test(h) && /highest/.test(h) && /PASCAL Limassol/.test(h));
  h = await draw({ as: 'number', compare: null });
  assert.ok(!h.includes('class="two"') && /<div class="big c-red"><b>\d+<\/b><span>ppm<\/span>/.test(h));
  h = await draw({ as: 'table', last: 6 });
  assert.ok(!/<svg/.test(h) && /<table>/.test(h) && h.indexOf('14:') < h.indexOf('13:') + 400, 'a table');
  const rows = h.match(/<tr/g).length;
  assert.ok(rows >= 6 && rows <= 26, 'rows ' + rows);
  assert.ok(/PASCAL Limassol \(ppm\)/.test(h), 'compare column');
});
test('render: nothing the student typed can become markup', async () => {
  const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)>';
  const h = await draw({ alerts: [{ when: 'above', value: 1000, colour: 'red', say: evil }] }, 'en', evil);
  assert.ok(!/<script|<img|<[^>]*onerror=/i.test(h), 'no live tag');
  assert.ok(h.includes('&lt;') || !h.includes('<script'), 'escaped');
  assert.ok(!h.includes(evil), 'title not raw');
});
test('render: empty and failing sources give a friendly page', async () => {
  B._t.rawCache.clear();
  const r = B.validate(good(), OPT);
  let h = B.render(r, OPT, await B.gather(r, OPT, { devices: async () => [], series: async () => [] }, NOW), { lang: 'en' });
  assert.ok(/No readings in this time window/.test(h) && /no sensors found/.test(h) && !/<svg/.test(h));
  B._t.rawCache.clear();
  h = B.render(r, OPT, await B.gather(r, OPT, { devices: async () => { throw new Error('x'); }, series: async () => [] }, NOW), { lang: 'el' });
  assert.ok(/Οι μετρήσεις δεν φορτώθηκαν/.test(h));
  B._t.rawCache.clear();
  // old data: a stale note
  const old = fakeData(); const s = old.series; old.series = async (e, m, d) => (await s(e, m, d)).filter((p) => p.t < NOW - 8 * H);
  h = B.render(r, OPT, await B.gather(r, OPT, old, NOW), { lang: 'en' });
  assert.ok(/The newest reading is old/.test(h), 'stale note');
});
test('render: low alert and a quiet reading shows no banner; two alerts, the first broken one wins', async () => {
  let h = await draw({ alerts: [{ when: 'above', value: 5000, colour: 'red', say: 'x' }, { when: 'below', value: 100, colour: 'blue', say: 'y' }] });
  assert.ok(!/class="alert/.test(h));
  h = await draw({ alerts: [{ when: 'above', value: 5000, colour: 'red', say: 'x' }, { when: 'above', value: 1100, colour: 'orange', say: 'second' }, { when: 'above', value: 1000, colour: 'green', say: 'third' }] });
  assert.ok(/class="alert c-orange"[^>]*>second/.test(h) && !/third<\/div>|class="alert c-green"/.test(h));
});


test('phoneLike catches spaced and dotted numbers the old text check misses, not ordinary numbers', () => {
  for (const x of ['Call me on 99 123 456', '99-123-456', '99.123.456', '+357 99 123456', '(99) 123 4567', '99123456']) assert.ok(B.phoneLike(x), 'should catch: ' + x);
  for (const x of ['Above 1000 ppm', 'It is 27.5 degrees', 'Open a window!', '24 hours, 3 alerts', 'PM2.5 over 35']) assert.ok(!B.phoneLike(x), 'should allow: ' + x);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n       ' + String((e && e.stack) || e).split('\n').slice(0, 4).join('\n       ')); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
