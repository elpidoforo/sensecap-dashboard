'use strict';
/* Aeroplanes over Cyprus: GET /api/aircraft on the real server.
   Part 1: test mode (OPEN_METEO_MOCK=1), the three fixed points.
   Part 2: the parser against a fake adsb.fi service on this machine (ADSBFI_BASE points at it; everything else stays in test mode,
           so nothing leaves the machine). The real adsb.fi service is never called by this test.
   Run: node tests/aircraft/api_test.js   (no network; ports 3989 server, 3988 fake service) */
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.AIRCRAFT_TEST_PORT) || 3989, FAKE_PORT = Number(process.env.AIRCRAFT_FAKE_PORT) || 3988, BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { const r = await fetch(BASE + u); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { /* not JSON */ } return { status: r.status, json: j, text: t }; };
let srv = null;
function start(extra) {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'aircraft-')), ANTHROPIC_API_KEY: '', ...extra };
  if (!extra || !extra.ADSBFI_BASE) delete env.ADSBFI_BASE;
  srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
}
const stop = async () => { const s = srv; srv = null; if (!s) return; await new Promise((r) => { s.once('exit', r); s.kill(); }); };
const up = async () => { for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/feeds'); return; } catch (e) { await wait(200); } } };
process.on('exit', () => { try { if (srv) srv.kill(); } catch (e) { /* gone */ } });

const PHASES = ['ground', 'low', 'high', 'unknown'];
const KEYS = ['altFt', 'gs', 'id', 'lat', 'lng', 'onGround', 'phase', 'track'];
const twoDp = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
function shape(j, name) {
  ok(Array.isArray(j.points) && j.source === 'adsb.fi' && !isNaN(Date.parse(j.updated)), name + ': points, the source and a time');
  ok(j.centre && j.centre.lat === 35 && j.centre.lng === 33.2 && j.centre.distNm === 120, name + ': says where it asked and how far');
  ok(j.points.every((p) => Object.keys(p).sort().join() === KEYS.join()), name + ': a point has exactly ' + KEYS.join(', '));
  ok(j.points.every((p, i) => p.id === 'a' + (i + 1)), name + ': the id is only an index in this answer');
  ok(j.points.every((p) => twoDp(p.lat) && twoDp(p.lng)), name + ': places are rounded to 2 decimals');
  ok(j.points.every((p) => p.altFt === null || (Number.isInteger(p.altFt) && p.altFt % 100 === 0)), name + ': heights are rounded to 100 ft');
  ok(j.points.every((p) => (p.gs === null || Number.isInteger(p.gs)) && (p.track === null || (Number.isInteger(p.track) && p.track >= 0 && p.track < 360))), name + ': speed and heading are whole numbers');
  ok(j.points.every((p) => PHASES.includes(p.phase)), name + ': every phase is a known one');
  ok(j.points.every((p) => (p.phase === 'ground') === p.onGround && (p.phase === 'unknown') === (!p.onGround && p.altFt === null)
    && (p.phase !== 'low' || p.altFt < 10000) && (p.phase !== 'high' || p.altFt >= 10000)), name + ': the phase follows from the height alone');
  ok(j.points.length <= 200, name + ': never more than 200 points');
}
const noNames = (text, name) => ok(!/hex|flight|callsign|"r"|"t"|squawk|registration/i.test(text), name + ': no hex id, flight name or callsign anywhere in the answer');

/* ---- the fake adsb.fi service ---- */
const fake = { mode: 'full', hits: [] };
const filler = (i) => ({ hex: 'f' + String(i).padStart(5, '0'), flight: 'FILL' + i, lat: 33.2 + i * 0.01, lon: 31.5 + i * 0.005, alt_baro: 30000 + (i % 7) * 1000, alt_geom: 30500, gs: 400 + i * 0.1, track: i % 360 });
const CRAFTED = [
  { hex: '4ca123', flight: 'SECRET1 ', r: '5B-ABC', t: 'A320', squawk: '1234', lat: 35.123456, lon: 33.456789, alt_baro: 36025, alt_geom: 36400, gs: 451.6, track: 117.6 },   // an ordinary one, high
  { hex: '4ca124', flight: 'SECRET2 ', lat: 34.875111, lon: 33.624999, alt_baro: 'ground', gs: 11.2, track: 221.3 },                                                       // on the ground
  { hex: '4ca125', flight: 'SECRET3 ', lon: 33.1, alt_baro: 5000 },                                                                                                         // no latitude: dropped
  { hex: '4ca126', flight: 'SECRET4 ', lat: '35.1', lon: 33.1, alt_baro: 5000 },                                                                                            // a string for the latitude: dropped
  { hex: '4ca127', flight: 'SECRET5 ', lat: 34.701, lon: 32.502, alt_baro: 'n/a', alt_geom: 5049, gs: 'fast', track: 400 },                                                 // odd height text: falls back to alt_geom; odd speed and heading: null
  { hex: '4ca128', flight: 'SECRET6 ', lat: 36.5, lon: 34.999, gs: 300, track: 359.7 },                                                                                     // no height at all: unknown; 359.7 rounds to 0
  { hex: '4ca129', flight: 'SECRET7 ', lat: 35.5, lon: 32.25, alt_baro: 9951, gs: 250, track: 0 },                                                                          // rounds to 10,000 ft: high, in step with the number shown
  { hex: '4ca130', flight: 'SECRET8 ', lat: 95, lon: 33, alt_baro: 1000 },                                                                                                  // not a place on Earth: dropped
  null, 7, 'text',
];
const fakeSrv = http.createServer((req, res) => {
  fake.hits.push(req.url);
  if (fake.mode === 'down') { res.writeHead(500); return res.end('no'); }
  const body = fake.mode === 'full' ? { ac: [...CRAFTED, ...Array.from({ length: 250 }, (_, i) => filler(i))], now: Date.now(), total: 261 }
    : fake.mode === 'aircraft-key' ? { aircraft: CRAFTED }
      : fake.mode === 'no-array' ? { msg: 'No error', now: Date.now() } : null;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
});

(async () => {
  /* ---- part 1: test mode ---- */
  start(); await up();
  let r = await get('/api/aircraft');
  ok(r.status === 200, 'mock: 200 (' + r.status + ')');
  shape(r.json, 'mock'); noNames(r.text, 'mock');
  ok(r.json.points.length === 3 && r.json.mock === true && r.json.more === 0, 'mock: three fixed points, marked as mock');
  ok(['ground', 'low', 'high'].every((ph) => r.json.points.some((p) => p.phase === ph)), 'mock: one point for each of ground, low and high');
  const first = r.json.updated;
  ok((await get('/api/aircraft')).json.updated === first, 'mock: the answer is cached (same time on a second call)');
  r = await get('/api/feeds');
  const f = (r.json.feeds || []).find((x) => x.id === 'adsbfi');
  ok(r.json.feeds.length === 6 && f && f.name && f.nameEl && f.what && f.whatEl && f.home === 'https://adsb.fi/', 'feeds: adsb.fi is the sixth feed, with a name and a description in both languages');
  ok(f && f.enabled === true && f.status === 'demo', 'feeds: simulated in test mode (' + (f && f.status) + ')');
  r = await get('/layers/api/live');
  ok(r.status === 200 && !/adsb|aircraft|aeroplane/i.test(r.text), 'privacy: the data layers (and so the brain) know nothing about aircraft');
  ok(!fs.readdirSync(path.join(ROOT, 'sources')).some((n) => /adsb|aircraft/i.test(n)) && !/adsb|aircraft/i.test(fs.readFileSync(path.join(ROOT, 'layers.js'), 'utf8')), 'privacy: no sources/ file and nothing in layers.js');
  await stop();

  /* ---- part 2: the parser against a fake adsb.fi ---- */
  await new Promise((res) => fakeSrv.listen(FAKE_PORT, '127.0.0.1', res));
  const withFake = { ADSBFI_BASE: `http://127.0.0.1:${FAKE_PORT}/` };
  start(withFake); await up();
  r = await get('/api/aircraft');
  ok(r.status === 200 && r.json.mock === false, 'fake: 200 and not marked as mock');
  ok(fake.hits.length === 1 && fake.hits[0] === '/api/v3/lat/35/lon/33.2/dist/120', 'fake: ONE call, centred on Cyprus, 120 nautical miles (' + fake.hits.join(' ') + ')');
  shape(r.json, 'fake'); noNames(r.text, 'fake');
  ok(!/SECRET|FILL|4ca1|5B-ABC|A320|1234"/.test(r.text), 'fake: none of the names or ids of the payload are in the answer');
  const P = r.json.points, at = (lat, lng) => P.find((p) => p.lat === lat && p.lng === lng);
  ok(P.length === 200 && r.json.more === 55, 'fake: 255 usable points, 200 kept and 55 counted as more (' + P.length + ' + ' + r.json.more + ')');
  ok(P.every((p, i) => i === 0 || P[i - 1].lat <= p.lat), 'fake: points run from south to north, not in the order of the service');
  const hi = at(35.12, 33.46);
  ok(hi && hi.altFt === 36000 && hi.gs === 452 && hi.track === 118 && hi.phase === 'high' && hi.onGround === false, 'fake: 35.123456, 33.456789 at 36,025 ft becomes 35.12, 33.46 at 36,000 ft, 452 knots, heading 118, high');
  const gr = at(34.88, 33.62);
  ok(gr && gr.onGround === true && gr.altFt === null && gr.phase === 'ground' && gr.gs === 11 && gr.track === 221, 'fake: "ground" is kept as on the ground, with no height');
  const odd = at(34.7, 32.5);
  ok(odd && odd.altFt === 5000 && odd.phase === 'low' && odd.gs === null && odd.track === null, 'fake: odd height text falls back to alt_geom (low); a string speed and a heading of 400 become null');
  const edge = at(35.5, 32.25);
  ok(edge && edge.altFt === 10000 && edge.phase === 'high', 'fake: 9,951 ft is shown as 10,000 ft and so counts as high');
  ok(!P.some((p) => p.lat === 35.1 && p.lng === 33.1) && !P.some((p) => p.lat > 90), 'fake: a missing latitude, a string latitude and an impossible place are dropped');
  await get('/api/aircraft'); await get('/api/aircraft');
  ok(fake.hits.length === 1, 'fake: three page loads within 20 s still made one call to the service (' + fake.hits.length + ')');
  r = await get('/api/feeds');
  const lf = (r.json.feeds || []).find((x) => x.id === 'adsbfi');
  ok(lf && lf.ok24h === 1 && lf.fail24h === 0 && lf.lastOk > 0, 'fake: the call is counted on the feed list');
  await stop();

  fake.mode = 'aircraft-key'; fake.hits = [];
  start(withFake); await up();
  r = await get('/api/aircraft');
  shape(r.json, 'aircraft key'); noNames(r.text, 'aircraft key');
  ok(r.status === 200 && r.json.points.length === 5 && r.json.more === 0, 'aircraft key: the list is also read from "aircraft" (' + r.json.points.length + ')');
  const un = r.json.points.find((p) => p.lat === 36.5);
  ok(un && un.phase === 'unknown' && un.altFt === null && un.track === 0 && un.lng === 35, 'aircraft key: no height at all is "unknown", never a guess; a heading of 359.7 becomes 0');
  await stop();

  fake.mode = 'no-array'; fake.hits = [];
  start(withFake); await up();
  r = await get('/api/aircraft');
  ok(r.status === 200 && Array.isArray(r.json.points) && r.json.points.length === 0 && r.json.more === 0, 'no array: an answer without a list is an empty sky picture, not an error');
  await stop();

  fake.mode = 'down'; fake.hits = [];
  start(withFake); await up();
  r = await get('/api/aircraft');
  ok(r.status === 502 && /HTTP 500/.test(r.json.error || '') && !/127\.0\.0\.1/.test(r.text), 'down: a failing service is a 502 with a plain reason and no address (' + r.status + ')');
  r = await get('/api/aircraft');
  ok(r.status === 502 && fake.hits.length === 1, 'down: the failed call is not repeated at once (' + fake.hits.length + ' call)');
  r = await get('/api/feeds');
  const df = (r.json.feeds || []).find((x) => x.id === 'adsbfi');
  ok(df && df.fail24h === 1 && df.status === 'error', 'down: the feed list shows the failure (' + (df && df.status) + ')');
  await stop();
  fakeSrv.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
