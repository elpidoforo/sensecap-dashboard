'use strict';
/* The data side of the 3D data stack: GET /api/stack and /api/stack/<id> on the real server with demo data, plus the pure maths.
   Run: node tests/stackdata/api_test.js   (no network; ports 3921 for the server and 3922 for a made-up timetable file; about 10 s)
   The timetable is a tiny GTFS zip written here and served from this computer, so the scheduled buses go through the real reader. */
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const { buildFeed, readZip, validCompact } = require(path.join(ROOT, 'gtfs'));
const { buildingGrid, alongPattern, cyprusClock, IDS } = require(path.join(ROOT, 'stackdata'));
const PORT = Number(process.env.STACKDATA_TEST_PORT) || 3921, ZIP_PORT = Number(process.env.STACKDATA_ZIP_PORT) || 3922, BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u, opt) => { const r = await fetch(BASE + u, opt); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { /* not JSON */ } return { status: r.status, json: j, text: t, headers: r.headers }; };

/* ---------- a made-up timetable: two lines, a bus every 20 minutes all day and past midnight, one line with a drawing ---------- */
const STOPS = [['S1', 34.9, 33.6], ['S2', 34.91, 33.62], ['S3', 34.92, 33.64], ['S4', 34.93, 33.66], ['S5', 34.94, 33.68]];
const OFFSETS = [0, 10, 25, 40, 60];
function gtfsZip() {
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:30`;   // seconds are dropped by the reader
  const trips = [], times = [];
  for (const route of ['R1', 'R2']) {
    for (let start = 0; start < 24 * 60; start += 20) {
      const id = `${route}-${start}`;
      trips.push(`${route},DAILY,${id},To the sea,${route === 'R1' ? 'SH1' : ''}`);
      const order = route === 'R1' ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
      // written in the wrong order on purpose: the reader must sort by stop_sequence
      order.map((s, i) => `${id},${hhmm(start + OFFSETS[i])},${hhmm(start + OFFSETS[i])},${STOPS[s][0]},${i + 1}`).reverse().forEach((l) => times.push(l));
    }
  }
  const files = {
    'agency.txt': 'agency_id,agency_name,agency_url,agency_timezone\nA,Test Buses,https://example.org,Asia/Nicosia\n',
    'routes.txt': 'route_id,agency_id,route_short_name,route_long_name,route_type\nR1,A,1,Harbour line,3\nR2,A,2,Hill line,3\n',
    'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\n' + STOPS.map((s) => `${s[0]},Stop ${s[0]},${s[1]},${s[2]}`).join('\n') + '\n',
    'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nDAILY,1,1,1,1,1,1,1,20200101,20991231\n',
    'trips.txt': 'route_id,service_id,trip_id,trip_headsign,shape_id\n' + trips.join('\n') + '\n',
    'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' + times.join('\n') + '\n',
    'shapes.txt': 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n' + STOPS.map((s, i) => `SH1,${s[1]},${s[2]},${i + 1}`).join('\n') + '\n',
  };
  // a zip with stored (uncompressed) entries
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), nm = Buffer.from(name), crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(local, nm, data); central.push(cd, nm);
    offset += 30 + nm.length + data.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stackdata-'));
const BANDS = ['SPACE', 'AIR', 'GROUND', 'CITY', 'WATER'], KINDS = ['live', 'delayed', 'scheduled', 'periodic', 'snapshot', 'census', 'catalogue'];
const pair = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string' && x.length > 3);
const decimals = (v) => { const s = String(v); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };

(async () => {
  /* ---------- the pure maths, no server ---------- */
  // a planned run: the point between two stops in proportion to the planned minutes
  const coord = (s) => [[0, 0], [0, 10], [10, 10]][s];
  let p = alongPattern([0, 1, 2], [0, 10, 30], 5, coord);
  ok(p[0] === 0 && p[1] === 0 && p[2] === 5, 'run: half way through the first leg (' + p + ')');
  p = alongPattern([0, 1, 2], [0, 10, 30], 20, coord);
  ok(p[0] === 1 && p[1] === 5 && p[2] === 10, 'run: half way through the second leg (' + p + ')');
  p = alongPattern([0, 1, 2], [0, 10, 30], 30, coord);
  ok(p[0] === 1 && p[1] === 10 && p[2] === 10, 'run: at the last stop when the last minute is reached');
  p = alongPattern([0, 1, 2], [0, 0, 30], 0, coord);
  ok(Number.isFinite(p[1]) && Number.isFinite(p[2]), 'run: two stops in the same minute do not divide by zero');
  // the clock of Cyprus: winter is UTC+2, summer UTC+3, and the day type follows the local day
  let c = cyprusClock(Date.UTC(2026, 10, 19, 10, 15, 30));   // Thursday 19 November 2026, 12:15:30 in Cyprus
  ok(c.date === '2026-11-19' && c.time === '12:15' && Math.abs(c.minute - (12 * 60 + 15.5)) < 1e-9 && c.type === 1 && c.typeBefore === 1, 'clock: a winter weekday (' + JSON.stringify(c) + ')');
  c = cyprusClock(Date.UTC(2026, 6, 4, 22, 30, 0));          // Saturday 4 July 22:30 UTC is Sunday 01:30 in Cyprus
  ok(c.date === '2026-07-05' && c.time === '01:30' && c.type === 4 && c.typeBefore === 2, 'clock: after midnight in summer it is already Sunday, and the day before was a Saturday');
  // built-up ground: counted from sample points, never above 100 %
  const box = { half: 100 };
  let g = buildingGrid({ box, buildings: [[9, 'd', [-100, -100, 0, -100, 0, 0, -100, 0]]] }, 100, 10);
  ok(g.cols === 2 && g.share.join() === '100,0,0,0' && g.count.join() === '1,0,0,0' && g.coveredPercent === 25, 'grid: one building that fills the south-west cell (' + g.share + ')');
  g = buildingGrid({ box, buildings: [[9, 'd', [-100, -100, 100, -100, 100, 100, -100, 100], [[-50, -50, 50, -50, 50, 50, -50, 50]]]] }, 100, 10);
  ok(g.share.every((v) => v === 75) && g.coveredPercent === 75 && g.count.reduce((a, b) => a + b, 0) === 1, 'grid: a courtyard is not built-up ground, and a big building is counted once (' + g.share + ')');
  g = buildingGrid({ box, buildings: [[9, 'd', [-300, -300, 300, -300, 300, 300, -300, 300]], [9, 'd', [-20, -20, 20, -20, 20, 20, -20, 20]]] }, 100, 10);
  ok(g.share.every((v) => v === 100), 'grid: overlapping buildings and a building larger than the box never go above 100 %');
  g = buildingGrid({ box, buildings: [] }, 100, 10);
  ok(g.share.every((v) => v === 0) && g.coveredPercent === 0, 'grid: no buildings is zero, not missing');

  // the timetable reader keeps the planned runs
  const zip = gtfsZip();
  const compact = await buildFeed(readZip(zip), { id: 'demo' }, { now: Date.now() });
  ok(validCompact(compact) && compact.patterns.length === 2 && compact.runs.length === 144, 'timetable: two patterns and 144 runs from the made-up file (' + compact.patterns.length + ', ' + compact.runs.length + ')');
  ok(compact.patterns.every((x) => x[2].length === 5 && x[3].join() === '0,10,25,40,60'), 'timetable: stops are in the order of stop_sequence with whole minutes after the first stop');
  ok(compact.runs.every((r, i) => r[2] === 7 && (i === 0 || compact.runs[i - 1][1] <= r[1])), 'timetable: runs are sorted by the minute they start and run on every day type');
  ok(!validCompact({ ...compact, runs: [[9, 0, 7]] }) && !validCompact({ ...compact, patterns: [[0, 0, [0], [0]]], runs: [] }) && validCompact({ ...compact, patterns: undefined, runs: undefined }), 'timetable: a saved copy with broken runs is refused, and one from before runs existed is still accepted');

  /* ---------- the server ---------- */
  const zipServer = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': zip.length }); res.end(zip); });
  await new Promise((r) => zipServer.listen(ZIP_PORT, '127.0.0.1', r));
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dataDir, ANTHROPIC_API_KEY: '', DASHBOARD_PASSWORD: '', LOCK_DASHBOARD: '', CLASS_LOGIN_USER: '', CLASS_LOGIN_PASSWORD: '',
    GTFS_FEEDS: JSON.stringify([{ id: 'demo', name: 'Made-up buses', nameEl: 'Φανταστικά λεωφορεία', url: `http://127.0.0.1:${ZIP_PORT}/feed.zip` }]), GTFS_ALLOW_HOSTS: '127.0.0.1' };
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  const stop = () => { try { srv.kill(); } catch (e) { /* gone */ } try { zipServer.close(); } catch (e) { /* closed */ } };
  process.on('exit', stop);
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/stack'); break; } catch (e) { await wait(200); } }
  for (let i = 0; i < 60; i++) { const s = await get('/api/transit/status'); if (s.json.loaded >= 1) break; await wait(250); }

  let r = await get('/api/stack');
  ok(r.status === 200 && Array.isArray(r.json.sheets) && r.json.sheets.map((s) => s.id).join() === IDS.join(), 'index: lists every sheet (' + (r.json.sheets || []).length + ')');
  ok(r.json.sheets.every((s) => pair(s.title) && pair(s.honesty) && BANDS.includes(s.band) && KINDS.includes(s.kind) && s.url === '/api/stack/' + s.id), 'index: every sheet has a title and an honesty line in both languages, a band and a kind');
  ok(IDS.length === 21, 'there are 21 sheets (' + IDS.length + ')');

  // The public trails, asked first: the vehicle sheet is built from the same kept answer (a measurement nobody has colours nothing,
  // which is the one shared answer the sheet uses too), so the two can be compared point by point further down.
  const pub = await get('/api/trails?hours=24&mid=9999');
  const S = {};
  for (const id of IDS) {
    r = await get('/api/stack/' + id);
    const j = S[id] = r.json; S[id + ':text'] = r.text;
    ok(r.status === 200, id + ': 200 (' + r.status + ')');
    ok(j.id === id && pair(j.title) && pair(j.honesty) && pair(j.note) && pair(j.source), id + ': title, honesty line, note and source in English and Greek');
    ok(typeof j.unit === 'string' && j.unit && BANDS.includes(j.band) && KINDS.includes(j.kind) && j.live === (j.kind === 'live') && j.coordinates === 'lat,lng', id + ': unit, band, kind and the order of coordinates');
    ok(typeof j.licence === 'string' && j.licence.length > 5 && typeof j.demo === 'boolean' && typeof j.available === 'boolean', id + ': a licence, and demo and available are yes or no');
    ok(typeof j.period === 'string' || typeof j.updated === 'string' || (j.available === false && (j.updated === null || j.period === null)), id + ': says which period it is about, or when it was updated');
    ok(j.available ? (typeof j.attribution === 'string' && j.attribution.length > 5) : pair(j.reason), id + ': a credit line, or the reason nothing is there');
    ok(j.live ? j.refreshSeconds > 0 : true, id + ': a live sheet says how often to ask again');
    ok(r.text.length > 300 && r.text.length < 300000, id + ': a sane size (' + r.text.length + ' bytes)');
    ok(!/"eui"|2CF7F1|DEMO0\d{5}|"4197"|"4198"/.test(r.text), id + ': no device id and no GPS measurement id');
  }
  const frozen = ['population', 'age', 'earthquakes', 'ev-charging', 'crossings', 'flood-reaches', 'permits', 'air-day', 'drought', 'bathing-water', 'seabed-profiles', 'aerosol-sites'];
  ok(frozen.every((id) => S[id].available && S[id].demo === false && S[id].live === false && S[id].refreshSeconds === null && typeof S[id].period === 'string'), 'a frozen copy of a published file is real in demo mode too, is not live and names its period');
  ok(['buildings', 'bus-network', 'bus-now', 'own-vehicles', 'met-stations', 'airports'].every((id) => S[id].demo === true), 'what the test mode makes up says demo: true');
  ok(['fire-hotspots', 'burnt-areas', 'air-stations'].every((id) => S[id].available === false && S[id].features.length === 0 && S[id].demo === false), 'a feed that is off in test mode gives no points and says why, instead of made-up ones');

  /* ---------- census: the published totals come back exactly ---------- */
  const P = S.population, city = (j, key) => j.features.find((f) => f.key === key);
  const want = { lefkosia: [56479, 111433], larnaka: [52046, 68202], limassol: [107970, 123947], paphos: [37991, 37991] };   // checkpoint census/tables/four_city_profiles.csv
  ok(Object.entries(want).every(([k, v]) => city(P, k).residents === v[0] && city(P, k).recast2024.residents === v[1]), 'population: the four municipalities reproduce the published 2021 totals and the 2024 recast');
  ok(P.total.residents === 923381 && P.districts.reduce((a, d) => a + d.residents, 0) === 923381, 'population: the five districts add up to the published total of 923,381');
  ok(P.features.reduce((a, f) => a + f.residents, 0) + P.unplaced.residents === 923381 && P.unplaced.count === 392 && P.unplaced.rows.length === 392, 'population: the four placed municipalities and the 392 without a place are all 396, nothing counted twice');
  ok(P.features.every((f) => f.density === null && f.boundary === '2021 municipality' && Number.isFinite(f.lat) && f.placeFrom) && P.density.available === false && pair(P.density.reason) && pair(P.density.unlock), 'population: no density is given, and the answer says why and what would unlock it');
  ok(P.districts.every((d) => d.density === null && d.polygon && typeof d.polygonCoversMore === 'boolean') && P.districtsWithoutData[0].residents === null && pair(P.districtsWithoutData[0].reason), 'population: a district without census data is null with a reason');
  ok(P.unplaced.rows.every((x) => x.length === 4 && /^\d{4}$/.test(x[0]) && Number.isInteger(x[3]) && x[3] >= 0), 'population: every unplaced row has a code and a whole number of residents');
  ok(pair(P.vintage.numbers) && pair(P.vintage.recast) && pair(P.vintage.polygons) && /1 July 2024/.test(P.vintage.numbers[0]), 'population: says which boundaries the numbers and the outlines use, with the reform of 1 July 2024');
  const A = S.age, ages = { lefkosia: [42.11, 12.81, 18.39], larnaka: [42.61, 12.79, 20.24], limassol: [41.21, 13.92, 17.7], paphos: [38.3, 17.46, 14.25] };   // four_city_households.csv and four_city_profiles.csv
  ok(Object.entries(ages).every(([k, v]) => city(A, k).meanAge === v[0] && city(A, k).under15Percent === v[1] && city(A, k).age65plusPercent === v[2]), 'age: mean age and the two shares of the four municipalities are the published ones');
  ok(A.features.every((f) => Math.abs(f.under15Percent + f.age15to64Percent + f.age65plusPercent - 100) < 0.011 && f.counts.under15 + f.counts.age15to64 + f.counts.age65plus === f.residents), 'age: the three shares make 100 % and the three counts make the residents');
  ok(A.features.every((f) => f.recast2024.meanAge === null && pair(f.recast2024.meanAgeReason)) && city(A, 'lefkosia').recast2024.under15Percent === 12.77, 'age: the recast municipality has shares from added counts and no invented mean age');
  ok(A.unplaced.withheld === 70 && A.unplaced.rows.filter((x) => x[3] === null && x[4] === null && x[5] === null).length === 70 && A.ageFloor === 50, 'age: the 70 places with fewer than 50 residents have no age figures');
  ok(P.features.map((f) => f.key).join() === 'larnaka,lefkosia,limassol,paphos' && A.features.map((f) => f.key).join() === P.features.map((f) => f.key).join(), 'the four cities come in the order of the menus, not sorted by a value');

  /* ---------- catalogue and inventories ---------- */
  const E = S.earthquakes;
  ok(E.features.length === 14 && new Set(E.features.map((f) => f.id)).size === 14 && E.counts.events === 14, 'earthquakes: 14 events with 14 different ids');
  ok(E.features.filter((f) => f.time.startsWith('2025-11')).length === 5, 'earthquakes: five in the cluster of November 2025');
  ok(E.features.every((f, i) => f.magnitude >= 4.5 && f.magnitudeType && f.time.endsWith('Z') && f.depthKm >= 0 && f.lat >= 34 && f.lat <= 36 && f.lng >= 32 && f.lng <= 35 && (i === 0 || E.features[i - 1].time <= f.time)), 'earthquakes: in date order, with UTC time, depth, magnitude and its type, inside the box');
  ok(E.kind === 'catalogue' && /not a live feed/.test(E.honesty[0]) && /US Geological Survey/.test(E.attribution) && /Public domain/.test(E.licence), 'earthquakes: a catalogue, credited to the USGS, public domain');
  ok(S['ev-charging'].features.length === 171 && S['ev-charging'].features.every((f) => f.lat > 34 && f.lat < 36 && ['AC', 'DC'].includes(f.current) && f.connectors >= 1), 'ev: 171 charging points with a place, a current type and connectors');
  ok(S.crossings.features.length === 384 && S.crossings.counts.withoutPlace === 0, 'crossings: all 384 records have a place');
  ok(S['flood-reaches'].features.length === 38 && S['flood-reaches'].features.every((f) => f.lines.length > 0 && f.lines.every((l) => l.length >= 4 && l[0] > 34 && l[0] < 36 && l[1] > 32 && l[1] < 35) && Object.keys(f.polygons).length === 4), 'flood: 38 reaches drawn as lines in lat,lng order with four scenario counts each');
  const M = S.permits;
  ok(M.period === '2026-07' && M.features.length === 5 && M.features.reduce((a, f) => a + f.total.permits, 0) === 772 && M.reportingTotal.permits === 772 && M.reportingTotal.dwellings === 1944, 'permits: July 2026, five districts that add up to the published 772 permits (1,944 dwellings in total)');
  const amm = M.features.find((f) => f.publisherName === 'Ammochostos');
  ok(amm.urban.permits === null && amm.urban.marks.permits === 'N.A.' && amm.rural.permits === 37, 'permits: an N.A. cell stays null with its mark, next to a real value');
  ok(M.annotation.month === '2024-07' && pair(M.annotation.text) && M.months.length === 139 && M.permitsByMonth.every((s) => s.values.length === 139), 'permits: the July 2024 annotation and 139 months per district');
  ok(S['air-day'].features.length === 11 && S['air-day'].hours.length === 24 && S['air-day'].features.every((f) => f.no2.length === 24 && f.o3.length === 24), 'air day: 11 stations with 24 hours of two gases');
  ok(S.drought.features.length === 4 && S.drought.periods.length === 36 && pair(S.drought.classesAreNotAScale), 'drought: four cells, 36 ten-day periods, and a warning that the classes are not a scale');
  ok(S['bathing-water'].features.length === 123 && S['bathing-water'].period === '2025', 'bathing water: 123 sites with the label of the 2025 season');
  ok(S['seabed-profiles'].features.length === 3 && S['aerosol-sites'].features.length === 2, 'seabed: three profiles; aerosol: two sites');

  /* ---------- buildings ---------- */
  const Bd = S.buildings;
  ok(Bd.features.length === 4 && Bd.features.every((f) => f.available && f.demo === true && f.cols === 18 && f.rows === 18 && f.share.length === 324 && f.count.length === 324), 'buildings: four city centres, each a grid of 18 by 18 cells of 100 m');
  ok(Bd.features.every((f) => f.share.every((v) => Number.isInteger(v) && v >= 0 && v <= 100) && f.count.reduce((a, b) => a + b, 0) === f.buildings && f.box.halfMetres === 900), 'buildings: shares are whole percents from 0 to 100 and every building is counted once');
  ok(/not the island/.test(Bd.honesty[0]) && /OpenStreetMap contributors/.test(Bd.attribution) && /ODbL/.test(Bd.licence) && pair(Bd.coverage), 'buildings: four small boxes, not the island, with the OpenStreetMap credit and licence');

  /* ---------- buses: the timetable, never an observed bus ---------- */
  const N = S['bus-network'];
  ok(N.available && N.lines.length === 2 && N.counts.drawnFromShape === 1 && N.counts.drawnThroughStops === 1 && N.counts.stops === 5 && N.stops.points.length === 10, 'bus network: two lines (one from its shape, one through its stops) and five stops');
  ok(N.lines.every((l) => l.line.length >= 4 && l.line.length % 2 === 0 && l.line.every((v, i) => (i % 2 ? v > 32 && v < 35 : v > 34 && v < 36) && decimals(v) <= 4)) && N.feeds[0].hasRuns === true && /CC BY 4.0/.test(N.licence), 'bus network: lines are lat,lng pairs with four decimals, under CC BY 4.0');
  const W = S['bus-now'];
  ok(W.available && W.kind === 'scheduled' && W.live === false && W.honesty[0] === 'Timetable, not observed buses' && pair(W.realtime), 'bus now: marked as scheduled, with the line "Timetable, not observed buses"');
  ok(W.counts.running >= 6 && W.counts.running <= 8 && W.trips.length === W.counts.shown && W.counts.shown === W.counts.running, 'bus now: a bus every 20 minutes on an hour-long trip gives 3 or 4 per line (' + W.counts.running + ')');
  ok(W.trips.every((t) => { const a = t.path[0], b = t.path[1]; if (!b || a[0] > 0 || b[0] < 0 || b[0] - a[0] <= 0) return false; const f = -a[0] / (b[0] - a[0]); return Math.abs(a[1] + (b[1] - a[1]) * f - t.lat) < 2e-4 && Math.abs(a[2] + (b[2] - a[2]) * f - t.lng) < 2e-4; }), 'bus now: every bus stands between the stop behind and the stop ahead, in proportion to the planned time');
  ok(W.trips.every((t) => t.path.length >= 2 && t.path.length <= 5 && t.path.every((q, i) => i === 0 || q[0] >= t.path[i - 1][0]) && W.lines[t.line] && W.lines[t.line].towards === 'To the sea'), 'bus now: the path ahead is in time order and every bus names its line');
  ok(new Set(W.trips.map((t) => W.lines[t.line].short)).size === 2 && W.refreshSeconds >= 30 && W.refreshSeconds <= 60 && /^\d\d:\d\d$/.test(W.cyprusTime) && pair(W.dayType), 'bus now: both lines run, the answer is kept 30 to 60 s and says the time and the day type in Cyprus');
  const again = await get('/api/stack/bus-now');
  ok(again.json.at === W.at, 'bus now: a second visitor within the minute gets the kept answer');

  /* ---------- our own vehicles: only what a visitor may see ---------- */
  const V = S['own-vehicles'], vText = S['own-vehicles:text'];
  ok(V.available && V.kind === 'delayed' && V.honesty[0] === 'About two hours late and rounded to 1 km' && V.delayMinutes === 120 && V.gridDegrees === 0.01, 'vehicles: delayed, and the key line states two hours and 1 km');
  ok(V.vehicles.length >= 6 && V.vehicles.every((v) => v.trail.length > 1 && ['bus', 'car', 'vehicle'].includes(v.type) && Object.keys(v).sort().join() === 'from,n,points,to,trail,type'), 'vehicles: several trails, each with a number, a type and nothing else');
  ok(!/eui/i.test(vText) && !/DEMO\d/.test(vText) && !/PASCAL|International School|Paphos|Larnaka|Lefkosia|Limassol/i.test(vText.replace(JSON.stringify(V.source), '').replace(JSON.stringify(V.note), '')), 'vehicles: no eui, no device id, no vehicle name and no school anywhere in the answer');
  const nowS = Date.now() / 1000;
  let worst = 0, newest = 0, points = 0;
  for (const v of V.vehicles) for (const q of v.trail) { points++; worst = Math.max(worst, decimals(q[1]), decimals(q[2])); newest = Math.max(newest, q[0]); }
  ok(worst <= 2, 'vehicles: no coordinate has more than 2 decimals (' + worst + ', ' + points + ' points)');
  ok(nowS - newest >= 120 * 60 - 5, 'vehicles: the newest point is at least two hours old (' + Math.round((nowS - newest) / 60) + ' min)');
  ok(V.vehicles.every((v) => v.trail.every((q, i) => q.length === 3 && Number.isInteger(q[0]) && (i === 0 || q[0] > v.trail[i - 1][0]))), 'vehicles: a trail is time, latitude, longitude, oldest first, with no reading attached');
  // nothing here that the public trails API does not already give a visitor
  const allowed = new Set();
  for (const pts of Object.values(pub.json.trails || {})) for (const q of pts) allowed.add(Math.round(q[0] / 1000) + '|' + q[1] + '|' + q[2]);
  ok(pub.json.posDelayed === true && allowed.size > 0 && V.vehicles.every((v) => v.trail.every((q) => allowed.has(q.join('|')))), 'vehicles: every point is one the public /api/trails already gives a visitor');
  ok(V.vehicles.length === Object.values(pub.json.trails).filter((t) => t.length).length, 'vehicles: as many trails as the public API has, no more');

  /* ---------- the edges of the API ---------- */
  r = await get('/api/stack/atlantis');
  ok(r.status === 404 && Array.isArray(r.json.sheets), 'an unknown sheet is 404 with the list of sheets');
  r = await get('/api/stack/population', { method: 'POST' });
  ok(r.status === 405 && r.headers.get('allow') === 'GET, HEAD', 'the API is read only (POST is 405)');
  r = await get('/api/stack/own-vehicles?level=exact&eui=DEMO000000000001');
  ok(r.status === 200 && !/DEMO0/.test(r.text) && r.json.delayMinutes === 120, 'a query string cannot ask for more than the public view');
  r = await get('/api/stack/earthquakes');
  ok(/max-age/.test(r.headers.get('cache-control')) && (await get('/api/stack/own-vehicles')).headers.get('cache-control') === 'no-store', 'a frozen sheet may be cached by the browser, a moving one may not');

  stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
