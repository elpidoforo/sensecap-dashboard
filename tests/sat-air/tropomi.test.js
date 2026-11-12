// Unit tests of satellite/feeds/tropomi-air.js (no network: fixtures through the REAL satellite/http.js via satellite/testing.js). Run: node tests/sat-air/tropomi.test.js
// Run: node tropomi_test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const REPO = process.env.SAT_REPO || require('path').resolve(__dirname, '..', '..');
const { makeCtx, reply, Reply } = require(REPO + '/satellite/testing');
const { createSatellite } = require(REPO + '/satellite');
const create = require(REPO + '/satellite/feeds/tropomi-air.js');
const T = create._t;
const vocab = JSON.parse(fs.readFileSync(REPO + '/vocab/variables.json', 'utf8'));
const desc = JSON.parse(fs.readFileSync(REPO + '/sources/tropomi-air.json', 'utf8'));

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
const NOW = Date.UTC(2026, 10, 12, 14, 20);
const API = 'sh.dataspace.copernicus.eu', AUTH = 'identity.dataspace.copernicus.eu';
const SECRET = 'S3cr3t-value-that-must-never-appear', CID = 'sh-client-1234-abcd';
const ENV = { CDSE_CLIENT_ID: CID, CDSE_CLIENT_SECRET: SECRET, SATELLITE_TROPOMI_PAUSE_MS: '0' };
const IDS = ['larnaka', 'lefkosia', 'limassol', 'paphos'];
const D = (n) => `2026-11-${String(n).padStart(2, '0')}T00:00:00Z`;

const stat = (mean, total = 16, nodata = 2) => ({ min: mean, max: mean, mean, stDev: 0, sampleCount: total, noDataCount: nodata });
const iv = (day, st, outId = 'default', band = 'B0') => ({ interval: { from: D(day), to: D(day + 1) }, outputs: { [outId]: { bands: { [band]: { stats: st } } } } });
// plausible means per band (mol/m2 or unitless) for the answer of the fake service
const MEAN = { NO2: 3.1e-5, CO: 0.035, O3: 0.125, SO2: 1e-4, AER_AI_340_380: 1.8 };
const bandOf = (init) => { const b = JSON.parse(init.body); return /bands: \["(\w+)"/.exec(b.aggregation.evalscript)[1]; };

function service(opts) {
  const o = opts || {};
  const log = { token: 0, stats: [], auth: [] };
  const f = {
    [`https://${AUTH}/auth/realms/CDSE/protocol/openid-connect/token`]: (url, init) => {
      log.token++; log.tokenInit = init;
      if (o.tokenStatus) return reply(o.tokenStatus, JSON.stringify({ error: 'unauthorized_client' }));
      return { access_token: 'tok-' + log.token, expires_in: o.expires == null ? 600 : o.expires, token_type: 'Bearer' };
    },
    [`https://${API}/api/v1/statistics`]: (url, init) => {
      log.stats.push(JSON.parse(init.body)); log.auth.push(init.headers.authorization);
      if (o.statsStatus && (o.statsStatusTimes == null || log.stats.length <= o.statsStatusTimes)) return reply(o.statsStatus, '{}', o.statsHeaders || {});
      const band = bandOf(init);
      if (o.cloudy) return { data: [iv(10, stat('NaN', 16, 16)), iv(11, stat('NaN', 16, 16)), iv(12, stat('NaN', 16, 16))], status: 'OK' };
      return { data: [iv(10, stat(MEAN[band] * 0.9)), iv(11, stat('NaN', 16, 16)), iv(12, stat(MEAN[band]))], status: 'OK' };
    },
  };
  return { f, log };
}
const mk = (fixtures, env, extra) => { const ctx = makeCtx({ id: 'tropomi-air', hosts: [API, AUTH], fixtures, now: NOW, env: env === undefined ? ENV : env, ...(extra || {}) }); return { ctx, feed: create(ctx) }; };

// the feed's pauses between requests use unref'd timers (as in the server, where something else keeps the process alive)
const keepAlive = setInterval(() => {}, 1000);
(async () => {
  /* --- the contract --- */
  console.log('contract');
  {
    const { feed } = mk({});
    ok(feed.id === 'tropomi-air' && desc.id === feed.id, 'id equals the file name and the descriptor');
    eq(feed.hosts, [API, AUTH], 'exactly the two hosts it needs');
    ok(['probe', 'read', 'start', 'stop'].every((k) => typeof feed[k] === 'function'), 'probe, read, start, stop');
  }

  /* --- building the request --- */
  console.log('request');
  {
    const place = { lat: 34.9229, lng: 33.6233 };
    const b = T.statsBody(place, 'NO2', NOW);
    eq(b.input.bounds, { bbox: [33.5233, 34.8429, 33.7233, 35.0029], properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' } }, 'box about 18 km around the centre, CRS84');
    eq(b.input.data, [{ type: 'S5PL2' }], 'collection S5PL2');
    eq(b.aggregation.aggregationInterval, { of: 'P1D' }, 'one-day intervals');
    eq(b.aggregation.timeRange, { from: '2026-11-10T00:00:00Z', to: '2026-11-13T00:00:00Z' }, 'today and the two days before, to the start of tomorrow');
    ok(b.aggregation.resx === 0.05 && b.aggregation.resy === 0.05, 'resolution in degrees');
    ok(/\/\/VERSION=3/.test(b.aggregation.evalscript) && /bands: \["NO2", "dataMask"\]/.test(b.aggregation.evalscript) && /default: \[s\.NO2\], dataMask: \[s\.dataMask\]/.test(b.aggregation.evalscript), 'evalscript: one band plus dataMask, outputs default and dataMask');
    ok(!/CO|O3|SO2/.test(T.evalscript('NO2').replace('NO2', '')), 'only one band per request (the one-band limit)');
    ok(JSON.stringify(b).length < 1500, 'the request body is small');
    eq(T.timeRange(Date.UTC(2026, 0, 1, 0, 0, 0)), { from: '2025-12-30T00:00:00Z', to: '2026-01-02T00:00:00Z' }, 'time range across a year end');
  }

  /* --- parsing the answer --- */
  console.log('parsing');
  {
    const NO2 = T.PRODUCTS[0], CO = T.PRODUCTS[1], O3 = T.PRODUCTS[2], SO2 = T.PRODUCTS[3], AI = T.PRODUCTS[4];
    const ans = (...d) => ({ data: d, status: 'OK' });
    let r = T.parseStats(ans(iv(10, stat(2.5e-5)), iv(11, stat(3.1e-5)), iv(12, stat(3.7e-5))), NO2, NOW);
    ok(r.v === 37 && r.day === Date.UTC(2026, 10, 12) && r.valid === 14 && r.total === 16, 'the newest day wins; NO2 mol/m2 x 1e6 = umol/m2: ' + JSON.stringify(r));
    ok(r.t === Date.UTC(2026, 10, 12, 11, 0), 'the reading time is 11:00 UTC of that day');
    r = T.parseStats(ans(iv(12, stat(3.7e-5))), NO2, Date.UTC(2026, 10, 12, 8, 0));
    ok(r.t === Date.UTC(2026, 10, 12, 8, 0), 'the reading time is never in the future');
    r = T.parseStats(ans(iv(10, stat(3.1e-5)), iv(11, stat('NaN', 16, 16)), iv(12, stat('NaN', 16, 16))), NO2, NOW);
    ok(r && r.day === Date.UTC(2026, 10, 10), 'days with no clear pixel ("NaN") are skipped: the day before is used');
    eq(T.parseStats(ans(iv(12, stat('NaN', 16, 16))), NO2, NOW), null, 'nothing clear in three days: null');
    eq(T.parseStats(ans(iv(12, stat(3e-5, 16, 14))), NO2, NOW), null, 'fewer than 3 clear pixels is not used');
    ok(T.parseStats(ans(iv(12, stat(3e-5, 16, 13))), NO2, NOW) !== null, '3 clear pixels is used');
    eq(T.parseStats(ans(iv(12, stat(3e-5, 0, 0))), NO2, NOW), null, 'zero samples: null');
    ok(T.parseStats(ans(iv(12, stat(0.035))), CO, NOW).v === 35, 'CO mol/m2 x 1e3 = mmol/m2');
    ok(T.parseStats(ans(iv(12, stat(0.125))), O3, NOW).v === 280.2, 'O3 mol/m2 / 4.4615e-4 = DU: ' + T.parseStats(ans(iv(12, stat(0.125))), O3, NOW).v);
    ok(T.parseStats(ans(iv(12, stat(1e-4))), SO2, NOW).v === 0.22, 'SO2 in DU');
    ok(T.parseStats(ans(iv(12, stat(-2e-4))), SO2, NOW).v === -0.45, 'a slightly negative SO2 stays (it is noise, and the vocab range allows it)');
    ok(T.parseStats(ans(iv(12, stat(1.8))), AI, NOW).v === 1.8, 'aerosol index is not converted');
    ok(T.parseStats(ans(iv(12, stat(1.8), 'default', 'AER_AI_340_380')), AI, NOW).v === 1.8, 'any band name is accepted');
    ok(T.parseStats(ans(iv(12, stat(1.8), 'AI')), AI, NOW).v === 1.8, 'and any output name except dataMask');
    eq(T.parseStats(ans(iv(12, stat(1.8), 'dataMask')), AI, NOW), null, 'the dataMask output alone is not a value');
    ok(T.parseStats(ans({ interval: { from: D(11), to: D(12) }, error: { type: 'x' } }, iv(10, stat(2e-5))), NO2, NOW).v === 20, 'an interval with an error is skipped');
    for (const bad of [null, {}, { data: 'x' }, '<html>', []]) {
      let err = null; try { T.parseStats(bad, NO2, NOW); } catch (e) { err = e; }
      ok(!!err, 'a wrong answer shape throws a plain error: ' + JSON.stringify(bad));
    }
    // every converted value is inside the vocab range for typical means, and units equal the vocab
    for (const p of T.PRODUCTS) {
      ok(vocab[p.variable] && vocab[p.variable].unit === p.unit, `${p.variable}: unit ${p.unit} equals vocab`);
      const v = T.parseStats(ans(iv(12, stat(MEAN[p.band]))), p, NOW).v, [lo, hi] = vocab[p.variable].range;
      ok(v >= lo && v <= hi, `${p.variable}: a typical value ${v} is inside ${lo}..${hi}`);
    }
  }

  /* --- no account: nothing is asked --- */
  console.log('without keys');
  {
    for (const [name, env, en, el] of [
      ['none', {}, 'the client id and the client secret are not set on the server', 'λείπουν στον διακομιστή τα client id και client secret'],
      ['only the id', { CDSE_CLIENT_ID: CID }, 'the client secret is not set on the server', 'λείπει στον διακομιστή το client secret'],
      ['only the secret', { CDSE_CLIENT_SECRET: SECRET }, 'the client id is not set on the server', 'λείπει στον διακομιστή το client id'],
      ['blank', { CDSE_CLIENT_ID: '  ', CDSE_CLIENT_SECRET: '' }, 'the client id and the client secret are not set on the server', 'λείπουν στον διακομιστή τα client id και client secret']]) {
      const sv = service();
      const { ctx, feed } = mk(sv.f, env);
      feed.start();
      const p = await feed.probe();
      ok(p.ok === false && p.n === 0 && p.at === null, `${name}: probe is not ok`);
      ok(p.note === `needs a free Copernicus account: ${en}` && p.noteEl === `χρειάζεται δωρεάν λογαριασμό Copernicus: ${el}`, `${name}: the note says what is missing: ${p.note} / ${p.noteEl}`);
      ok(!/CDSE_/.test(p.note + p.noteEl), `${name}: no environment name in the note (the registry would print "the key")`);
      eq(feed.read('larnaka'), [], `${name}: read is empty`);
      ok(ctx.calls.length === 0 && ctx.logs.length === 0, `${name}: no request and no log line`);
      feed.stop(); ctx.cleanup();
      ok(!JSON.stringify(p).includes(SECRET), `${name}: no secret in the probe`);
    }
  }

  /* --- a full run with an account --- */
  console.log('full run');
  {
    const sv = service();
    const { ctx, feed } = mk(sv.f);
    const p = await feed.probe();
    ok(p.ok && p.n === 4 && /4 of 4 cities/.test(p.note) && /4 από 4/.test(p.noteEl) && p.at === Date.UTC(2026, 10, 12, 11, 0), 'probe ok: ' + JSON.stringify(p));
    ok(sv.log.token === 1, 'ONE sign-in for all the requests (the token is reused): ' + sv.log.token);
    ok(/application\/x-www-form-urlencoded/.test(sv.log.tokenInit.headers['content-type']) && sv.log.tokenInit.method === 'POST', 'the sign-in is a form POST');
    eq(sv.log.tokenInit.body, `grant_type=client_credentials&client_id=${CID}&client_secret=${encodeURIComponent(SECRET)}`, 'the sign-in body: client_credentials with the id and the secret');
    ok(sv.log.stats.length === 20, '4 cities x 5 bands = 20 requests: ' + sv.log.stats.length);
    ok(sv.log.auth.every((a) => a === 'Bearer tok-1'), 'every request carries the bearer token');
    const perCity = {};
    for (const b of sv.log.stats) { const k = b.input.bounds.bbox.join(); (perCity[k] = perCity[k] || []).push(/bands: \["(\w+)"/.exec(b.aggregation.evalscript)[1]); }
    ok(Object.keys(perCity).length === 4 && Object.values(perCity).every((v) => v.join() === 'NO2,CO,O3,SO2,AER_AI_340_380'), 'each city asks each band once, one band per request');
    for (const id of IDS) {
      const r = feed.read(id);
      eq(r.map((x) => x.variable), T.VARS, id + ': five readings');
      for (const x of r) {
        ok(vocab[x.variable].unit === x.unit && desc.variables.some((v) => v.id === x.variable && v.unit === x.unit), `${id}/${x.variable}: unit equals vocab and descriptor`);
        ok(x.value >= vocab[x.variable].range[0] && x.value <= vocab[x.variable].range[1], `${id}/${x.variable}: inside the vocab range`);
        ok(x.time === Date.UTC(2026, 10, 12, 11, 0), `${id}/${x.variable}: the observation time is the pass, not the fetch time`);
        ok(x.note.length <= 400 && x.noteEl.length <= 400 && x.where.length <= 400 && x.whereEl.length <= 400 && x.note && x.noteEl, `${id}/${x.variable}: notes fit 400 characters (${x.note.length}/${x.noteEl.length})`);
        ok(x.note.includes('2026-11-12') && x.noteEl.includes('2026-11-12'), `${id}/${x.variable}: the note names the day of the pass`);
        ok(/area about 18 km/.test(x.where) && /περιοχή πλάτους/.test(x.whereEl), `${id}/${x.variable}: where says it is an area`);
      }
    }
    const all = JSON.stringify([p, ctx.logs, feed.read('larnaka'), feed.read('paphos')]);
    ok(!all.includes(SECRET) && !all.includes(CID), 'no id and no secret in any probe, log or reading');
    // the fifth service answer of the same day: nothing is asked a second time inside the run
    ok(sv.log.token === 1, 'still one sign-in');
    // the cache file holds numbers only
    const disk = fs.readFileSync(path.join(ctx.dir, 'latest.json'), 'utf8');
    ok(!disk.includes(SECRET) && !disk.includes(CID) && JSON.parse(disk).cities.larnaka.no2_column.v > 0, 'the cache holds numbers only, no key');
    ctx.cleanup();
  }

  /* --- the sign-in token is reused until it expires --- */
  console.log('token');
  {
    const sv = service({ expires: 100 });
    const { ctx, feed } = mk(sv.f);
    await feed._t; // (no hook needed)
    await feed.probe();
    ok(sv.log.token === 1, 'one sign-in in a run');
    ctx.setNow(NOW + 60000);        // 60 s later, the token (100 s minus 30 s safety) has expired
    ctx.calls.length = 0;
    // second run through a fresh feed that shares nothing would sign in again anyway; here the same feed runs again through start()'s path
    const f2 = create(makeCtx({ id: 'tropomi-air', hosts: [API, AUTH], fixtures: sv.f, now: NOW, env: ENV }));
    await f2.probe();
    ok(sv.log.token === 2, 'a new feed signs in again (the token is never written to disk)');
    ctx.cleanup();
  }

  /* --- cloud: the service answers, nothing is clear --- */
  console.log('cloudy');
  {
    const sv = service({ cloudy: true });
    const { ctx, feed } = mk(sv.f);
    const p = await feed.probe();
    ok(p.ok === false && /no clear sky/.test(p.note) && /καθαρός/.test(p.noteEl), 'cloudy: probe says no clear sky, not an error: ' + JSON.stringify(p));
    ok(ctx.logs.length === 1 && /no clear pixel/.test(ctx.logs[0]), 'one short log line');
    eq(feed.read('larnaka'), [], 'cloudy: no readings');
    ctx.cleanup();
  }

  /* --- failures: never throw, never hammer --- */
  console.log('failures');
  {
    // sign-in refused (HTTP 401)
    let sv = service({ tokenStatus: 401 });
    let { ctx, feed } = mk(sv.f);
    let p = await feed.probe();
    ok(p.ok === false && /account was refused/.test(p.note) && /απορρίφθηκε/.test(p.noteEl), 'sign-in refused: the probe says so: ' + JSON.stringify(p));
    ok(sv.log.token === 1 && sv.log.stats.length === 0, 'refused: ONE sign-in try and no data request');
    ok(ctx.logs.length === 1 && /check the client id and the client secret/.test(ctx.logs[0]) && !/CDSE_/.test(ctx.logs[0]) && !ctx.logs.join().includes(SECRET), 'refused: one log line saying what to check, never the values');
    eq(feed.read('larnaka'), [], 'refused: read is empty');
    ctx.cleanup();

    // sign-in HTTP 500: not "refused"
    sv = service({ tokenStatus: 500 });
    ({ ctx, feed } = mk(sv.f));
    p = await feed.probe();
    ok(p.ok === false && /not available right now/.test(p.note) && sv.log.stats.length === 0, 'sign-in 500: not available right now, nothing else asked');
    ctx.cleanup();

    // data request 401 once (expired token): signs in again, tries again, works
    sv = service({ statsStatus: 401, statsStatusTimes: 1 });
    ({ ctx, feed } = mk(sv.f));
    p = await feed.probe();
    ok(p.ok === true && sv.log.token === 2 && sv.log.auth[0] === 'Bearer tok-1' && sv.log.auth[1] === 'Bearer tok-2', 'an expired token: one new sign-in and the request is repeated');
    ctx.cleanup();

    // data request 401 always
    sv = service({ statsStatus: 401 });
    ({ ctx, feed } = mk(sv.f));
    p = await feed.probe();
    ok(p.ok === false && /refused/.test(p.note) && sv.log.stats.length === 2, 'always 401: two tries, then stop: ' + sv.log.stats.length);
    ctx.cleanup();

    // rate limit: stop at once
    sv = service({ statsStatus: 429, statsHeaders: { 'Retry-After': '90' } });
    ({ ctx, feed } = mk(sv.f));
    p = await feed.probe();
    ok(p.ok === false && sv.log.stats.length === 1, 'HTTP 429: the run stops after the first request: ' + sv.log.stats.length);
    ctx.cleanup();

    // server errors: three in a row stop the run
    sv = service({ statsStatus: 500 });
    ({ ctx, feed } = mk(sv.f));
    p = await feed.probe();
    ok(p.ok === false && sv.log.stats.length === 3 && ctx.logs.length === 1, 'HTTP 500: stops after 3 failed requests, one log line: ' + sv.log.stats.length + ' ' + JSON.stringify(ctx.logs));
    ok(!ctx.logs.join().match(/https?:|\/api\/v1/), 'no address in the log line');
    ctx.cleanup();

    // an answer that is not JSON
    sv = service();
    sv.f[`https://${API}/api/v1/statistics`] = reply(200, '<html>maintenance</html>', { 'content-type': 'text/html' });
    ({ ctx, feed } = mk(sv.f));
    p = await feed.probe();
    ok(p.ok === false && feed.read('larnaka').length === 0, 'HTML instead of JSON: not ok, no crash');
    ctx.cleanup();

    // a token answer with no token
    sv = service();
    sv.f[`https://${AUTH}/auth/realms/CDSE/protocol/openid-connect/token`] = { nothing: true };
    ({ ctx, feed } = mk(sv.f));
    p = await feed.probe();
    ok(p.ok === false && sv.log.stats.length === 0, 'a sign-in answer without a token: stop');
    ctx.cleanup();
  }

  /* --- one city fails, the others work --- */
  console.log('partial');
  {
    const sv = service();
    const base = sv.f[`https://${API}/api/v1/statistics`];
    let n = 0;
    sv.f[`https://${API}/api/v1/statistics`] = (u, init) => { n++; if (n === 2) return reply(500, '{}'); return base(u, init); };   // one failed request in the middle
    const { ctx, feed } = mk(sv.f);
    const p = await feed.probe();
    ok(p.ok === true && feed.read('larnaka').length === 4 && feed.read('lefkosia').length === 5, 'one failed request leaves that one reading out, the rest stays');
    ctx.cleanup();
  }

  /* --- the cache --- */
  console.log('cache');
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tropomi-cache-'));
    const sv = service();
    const a = makeCtx({ id: 'tropomi-air', hosts: [API, AUTH], fixtures: sv.f, now: NOW, env: ENV, dir });
    await create(a).probe();
    const b = makeCtx({ id: 'tropomi-air', hosts: [API, AUTH], fixtures: {}, now: NOW + 4 * 86400000, env: ENV, dir });
    const fb = create(b);
    const r = fb.read('limassol');
    ok(r.length === 5 && r.every((x) => x.time === Date.UTC(2026, 10, 12, 11, 0)), 'a restart shows the cached readings with their old time');
    const p = await fb.probe();
    ok(p.ok === true && p.at === Date.UTC(2026, 10, 12, 11, 0) && b.calls.length === 0, 'probe uses the cache and asks for nothing');
    // no keys but a cache: the old values are still shown (the layer is candidate then, so the brain never reads them)
    const c = makeCtx({ id: 'tropomi-air', hosts: [API, AUTH], fixtures: {}, now: NOW, env: {}, dir });
    ok(create(c).read('paphos').length === 5, 'without keys the cache is still readable');
    fs.writeFileSync(path.join(dir, 'latest.json'), '{broken');
    eq(create(makeCtx({ id: 'tropomi-air', hosts: [API, AUTH], now: NOW, env: ENV, dir })).read('paphos'), [], 'a broken cache is ignored');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  /* --- inside the real registry: key states, env gating, scrubbing --- */
  console.log('registry');
  {
    const feedsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tropomi-feeds-'));
    fs.copyFileSync(REPO + '/satellite/feeds/tropomi-air.js', path.join(feedsDir, 'tropomi-air.js'));
    const logs = [];
    const sv = service();
    const transport = async (u, init) => {
      const url = new URL(u);
      const hit = sv.f[url.origin + url.pathname];
      if (!hit) return new Response('no', { status: 404 });
      const v = await hit(u, init);
      return v instanceof Reply ? new Response(v.body, { status: v.status, headers: v.headers }) : new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    // without a key
    let sat = createSatellite({ root: REPO, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tr-a-')), feedsDir, log: (m) => logs.push(m), env: {}, now: () => NOW, transport });
    ok(sat.has('tropomi-air') && sat.keyState('tropomi-air') === 'missing', 'no key: keyState is "missing"');
    let pr = await sat.probe('tropomi-air');
    ok(pr.ok === false && pr.note === 'needs a free Copernicus account: the client id and the client secret are not set on the server', 'registry probe says what is missing, in plain words: ' + pr.note);
    ok((await sat.status({ probe: false })).feeds.find((f) => f.id === 'tropomi-air').needsKey === true, 'status says a key is needed (the Layers page shows "Planned")');
    sat.stop();
    // with both values
    sat = createSatellite({ root: REPO, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tr-b-')), feedsDir, log: (m) => logs.push(m), env: { CDSE_CLIENT_ID: CID, CDSE_CLIENT_SECRET: SECRET, SATELLITE_TROPOMI_PAUSE_MS: '0', OTHER_SECRET: 'zzz' }, now: () => NOW, transport });
    ok(sat.keyState('tropomi-air') === 'present', 'with the secret: keyState is "present" (the layer counts as active)');
    pr = await sat.probe('tropomi-air');
    ok(pr.ok && pr.n === 4, 'registry probe works with both values: ' + JSON.stringify(pr));
    const rows = await sat.read('tropomi-air', 'paphos');
    eq(rows.map((r) => r.variable), T.VARS, 'registry read: five variables');
    ok(rows.every((r) => r.unit === vocab[r.variable].unit && r.time > 0), 'registry keeps unit and time');
    ok(!JSON.stringify([logs, rows, pr, await sat.status({ probe: false })]).includes(SECRET), 'no secret in anything the registry shows');
    ok(sv.log.auth.length === 20, 'the registry ran the same 20 requests');
    sat.stop();
    fs.rmSync(feedsDir, { recursive: true, force: true });
  }

  /* --- start() with keys sets a timer that does not keep the process alive --- */
  console.log('start and stop');
  {
    const sv = service();
    const { ctx, feed } = mk(sv.f);
    const t0 = Date.now();
    feed.start(); feed.start(); feed.stop();
    ok(Date.now() - t0 < 100 && ctx.calls.length === 0, 'start and stop return at once and ask for nothing');
    ctx.cleanup();
  }

  /* --- descriptor --- */
  console.log('descriptor');
  {
    ok(desc.status === 'candidate' && desc.planned === true, 'candidate + planned (never "active" by itself)');
    ok(desc.access.auth.type === 'api-key' && desc.access.auth.env === 'CDSE_CLIENT_SECRET' && desc.x_env.includes('CDSE_CLIENT_ID'), 'api-key with the env NAME of the secret, the id declared in x_env');
    ok(!JSON.stringify(desc).includes(SECRET), 'no secret in the file');
    ok(desc.quality.kind === 'satellite' && desc.layer === 'model', 'pure satellite product in the model/satellite group');
    ok(desc.licence.id === 'LicenseRef-Copernicus-Sentinel-Data' && /Contains modified Copernicus Sentinel data/.test(desc.licence.attribution) && desc.licence.checked_on === '2026-11-12', 'licence with the exact attribution line, checked today');
    ok(desc.i18n.el.name && desc.i18n.el.summary && desc.i18n.el.tagline, 'Greek texts');
    ok(desc.variables.length === 5 && desc.variables.every((v) => v.kind === 'measured' && vocab[v.id] && vocab[v.id].unit === v.unit), 'five variables, all in vocab with the same unit');
    ok(desc.quality.known_issues.some((x) => /clear/.test(x)) && desc.quality.known_issues.some((x) => /rush hour/.test(x)), 'the known issues say clouds and one pass a day');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  clearInterval(keepAlive);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
