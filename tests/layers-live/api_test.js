'use strict';
/* Data layers, live data: GET /layers/api/live and /layers/api/compare on the real server with demo data.
   Run: node tests/layers-live/api_test.js   (no network; port 3966; takes about 25 s because it waits for the log to grow) */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const PORT = 3966, BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { const r = await fetch(BASE + u); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { /* not JSON */ } return { status: r.status, json: j, text: t }; };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layers-live-'));
function start() {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dataDir, ANTHROPIC_API_KEY: '', LAYERS_PULSE_SECONDS: '5', LAYERS_PULSE_FIRST_MS: '500' };
  return spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
}
const up = async () => { for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/layers/api/register'); return; } catch (e) { await wait(200); } } };
(async () => {
  let srv = start();
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  await up();
  let r = await get('/layers/api/live');
  ok(r.status === 200, 'live: 200 (' + r.status + ')');
  const L = r.json;
  ok(Array.isArray(L.layers) && L.layers.length >= 20 && L.counts && L.counts.total === L.layers.length, 'live: every known layer is listed with the counts');
  const liveOnes = L.layers.filter((l) => l.state === 'live');
  ok(liveOnes.length >= 5, 'live: several layers are live in the demo (' + liveOnes.length + ')');
  ok(liveOnes.filter((l) => l.head).every((l) => typeof l.head.value === 'number' && l.head.unit && Array.isArray(l.head.label) && l.head.label.length === 2), 'live: a live layer has a value with a unit and a name in both languages');
  ok(liveOnes.every((l) => l.everyMs > 0), 'live: a live layer says how often it updates');
  ok(L.layers.filter((l) => l.state !== 'live' && l.state !== 'late').every((l) => l.head === null && l.spark.length === 0), 'live: a layer that is not connected has no value');
  const bus = L.layers.find((l) => l.id === 'sensecap-buses');
  ok(bus && bus.sensors >= 1 && bus.fresh >= 0, 'live: buses are a count of sensors (' + JSON.stringify(bus && [bus.sensors, bus.fresh]) + ')');
  ok(['larnaka', 'lefkosia', 'limassol', 'paphos'].every((c) => L.cities[c] && Array.isArray(L.cities[c].rows) && L.cities[c].name.length === 2), 'live: the four cities have rows');
  // privacy: nothing about a vehicle has a position, a device id or a name
  const own = JSON.stringify(Object.values(L.cities).map((c) => c.rows.filter((x) => /sensecap/.test(x.source))));
  ok(!/"(lat|lng|eui|name|where|whereEl)"/i.test(own), 'privacy: our own sensors are numbers only (no position, id or name)');
  ok(Object.keys(L.map).sort().join() === 'air,sea,stations,wind', 'privacy: the map part holds only wind, sea, official stations and model air (' + Object.keys(L.map) + ')');
  ok(L.map.stations.every((s) => s.src === 'cydom-stations' || s.src === 'metar-airports'), 'privacy: every point with a name is an official station');
  ok(!/2CF7F1|eui|"gps"|4197|4198/i.test(r.text), 'privacy: no device id and no GPS measurement anywhere in the answer');
  ok(L.map.wind.length > 4 && L.map.wind.every((p) => p.ws >= 0 && p.wd >= 0 && p.wd <= 360), 'live: the wind points have a speed and a direction');
  ok(r.text.length < 120000, 'live: the answer is small (' + r.text.length + ' bytes)');

  // compare
  r = await get('/layers/api/compare?city=larnaka&variable=temperature');
  ok(r.status === 200 && r.json.variable === 'temperature', 'compare: 200 for temperature (' + r.status + ')');
  const C = r.json;
  ok(C.series.length >= 3 && C.series.every((s) => s.name && s.nameEl && s.unit === '°C' && Array.isArray(s.points)), 'compare: several sources of temperature, named in both languages');
  ok(new Set(C.series.map((s) => s.source)).size === C.series.length, 'compare: one line per source');
  ok(C.finding && C.finding.title.en && C.finding.title.el && C.finding.body.en && ['agree', 'differ', 'single', 'threshold'].includes(C.finding.kind), 'compare: the finding is written in both languages');
  ok(C.variables.length >= 3 && C.variables[0].sources >= C.variables[C.variables.length - 1].sources, 'compare: the measurements are listed, most sources first');
  ok(!/"where"|"lat"|"lng"/.test(r.text), 'compare: no positions');
  r = await get('/layers/api/compare?city=larnaka');
  ok(r.status === 200 && r.json.variable, 'compare: without a measurement it picks the one with most sources');
  r = await get('/layers/api/compare?city=atlantis&variable=temperature');
  ok(r.status === 400, 'compare: unknown city is 400 (' + r.status + ')');
  r = await get('/layers/api/compare?city=larnaka&variable=dragons');
  ok(r.status === 404 && r.json.code === 'no_variable', 'compare: unknown measurement is 404 (' + r.status + ')');

  // the log grows, and survives a restart
  await wait(12500);
  r = await get('/layers/api/compare?city=larnaka&variable=temperature');
  const n1 = Math.max(...r.json.series.map((s) => s.points.length));
  ok(n1 >= 2, 'log: points are added over time (' + n1 + ')');
  ok(r.json.series.every((s) => s.points.every((p, i, a) => i === 0 || p[0] > a[i - 1][0])), 'log: points are in time order');
  r = await get('/layers/api/live');
  ok(r.json.layers.find((l) => l.id === 'openmeteo-weather').spark.length >= 2 && r.json.since > 0, 'log: the trend line of a layer has points');
  const since = r.json.since;
  ok(fs.existsSync(path.join(dataDir, 'layers-pulse.json')), 'log: saved in the data folder');
  srv.kill(); await wait(600);
  srv = start(); await up();
  await wait(1500);
  r = await get('/layers/api/live');
  ok(r.json.since === since, 'log: still there after a restart (' + r.json.since + ' vs ' + since + ')');
  srv.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
