'use strict';
/* The whole path, with readings that really are thrown away: made-up sensors on the real layers.js, read by the real
   data-health.js. No network, no server. This is the test that would have caught a check that can never fail.
   Run: node tests/health/drops_test.js */
const path = require('path');
const { createLayers } = require('../../layers.js');
const { createDataHealth } = require('../../data-health.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const HOUR = 3600000, iso = (ms) => new Date(ms).toISOString();
const ROOT = path.join(__dirname, '..', '..');
const gate = (s, id) => s.gates.find((g) => g.id === id);

// four buses at PASCAL Larnaka, each sending one air temperature
const buses = ['A1', 'A2', 'A3', 'A4'].map((eui, i) => ({ eui, name: 'Larnaka bus ' + (i + 1), group: 'PASCAL Larnaka' }));
const empty = { points: [] };
function world(latest) {
  return {
    deviceList: async () => buses, devices: async () => buses, latest: async () => latest,
    names: () => ({ 4097: ['Air Temperature', '°C'] }),
    cydom: async () => empty, metar: async () => empty, weather: async () => empty, air: async () => empty, sea: async () => empty, eea: () => empty,
  };
}
async function report(latest) {
  const L = createLayers({ root: ROOT, data: world(latest), pulse: false, log: () => {} });
  const H = createDataHealth({ layers: L, root: ROOT, log: () => {} });
  return { r: await H._t.build(), L };
}

(async () => {
  const now = Date.now(), t = iso(now - 5 * 60000);
  // nothing wrong: four ordinary readings
  let { r } = await report({ A1: { 4097: { v: 21, t } }, A2: { 4097: { v: 22, t } }, A3: { 4097: { v: 21.5, t } }, A4: { 4097: { v: 22.5, t } } });
  let bus = r.sources.find((s) => s.id === 'sensecap-buses');
  ok(bus && bus.holds.readings > 0 && bus.holds.dropped === 0, 'a clean fleet has readings and nothing left out');
  ok(gate(bus, 'range').status === 'pass' && gate(bus, 'range').checked === bus.holds.readings, 'the range check looks at the readings that were kept');
  ok(r.flow.left === 0 && r.flow.passed === r.flow.readings, 'nothing is left out, so everything that arrived passed');

  // one sensor reading 900 degrees, which no classroom thermometer can mean
  ({ r } = await report({ A1: { 4097: { v: 900, t } }, A2: { 4097: { v: 22, t } }, A3: { 4097: { v: 21.5, t } }, A4: { 4097: { v: 22.5, t } } }));
  bus = r.sources.find((s) => s.id === 'sensecap-buses');
  const rg = gate(bus, 'range');
  ok(rg.status === 'fail' && rg.failed === 1, 'a sensor reading 900 degrees makes the range check fail, instead of passing quietly (' + JSON.stringify([rg.status, rg.failed]) + ')');
  ok(/900/.test(rg.items[0].why[0]) && /°C/.test(rg.items[0].why[0]), 'the page can say which value it was, with its unit');
  ok(bus.holds.dropped === 1 && bus.sum.status === 'fail', 'the source says one reading was left out, and its own verdict is a failure');
  ok(r.flow.left === 1 && r.flow.out.reduce((a, o) => a + o.count, 0) === 1 && r.flow.out[0].id === 'range', 'the drawing counts it once, under the reason it was left out');
  ok(r.flow.passed + r.flow.left === r.flow.readings && r.totals.checked === r.flow.readings, 'the numbers on the page still add up');
  ok(r.totals.failedValues === 1, 'one reading left out is reported as one, not once per check');
  const others = r.sources.filter((s) => s.id !== 'sensecap-buses' && s.holds.readings);
  ok(others.every((s) => !gate(s, 'range') || gate(s, 'range').status === 'pass'), 'one bad sensor does not make other sources fail');

  // a clock six hours ahead: the reading is not used, and the check says so
  ({ r } = await report({ A1: { 4097: { v: 21, t: iso(now + 6 * HOUR) } }, A2: { 4097: { v: 22, t } } }));
  bus = r.sources.find((s) => s.id === 'sensecap-buses');
  const fu = gate(bus, 'future');
  ok(fu && fu.status === 'fail' && fu.failed === 1, 'a clock six hours ahead makes the clock check fail (' + JSON.stringify(fu && [fu.status, fu.failed]) + ')');
  ok(/clock/.test(fu.items[0].why[0]) && /clock/.test(fu.items[0].why[1]) === false, 'the reason is written in English and in Greek');
  ok(r.flow.left === 1 && r.flow.out[0].id === 'future', 'a reading left out for its time is counted under its own reason, not lost');

  // the unit check only speaks about what was really compared
  const un = gate(bus, 'units');
  ok(!un || un.checked > 0, 'the unit check is only reported when something was compared with the vocabulary');

  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL: the run stopped: ' + (e && e.stack)); process.exit(1); });
