// Unit tests of satellite/feeds/cams-atmosphere.js (no network: fixtures through the REAL satellite/http.js via satellite/testing.js). Run: node tests/sat-air/cams.test.js
// Run: node cams_test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const REPO = process.env.SAT_REPO || require('path').resolve(__dirname, '..', '..');
const { makeCtx, reply } = require(REPO + '/satellite/testing');
const { createSatellite } = require(REPO + '/satellite');
const create = require(REPO + '/satellite/feeds/cams-atmosphere.js');
const T = create._t;
const FX = path.join(__dirname, 'fixtures');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(FX, n), 'utf8'));
const vocab = JSON.parse(fs.readFileSync(REPO + '/vocab/variables.json', 'utf8'));
const desc = JSON.parse(fs.readFileSync(REPO + '/sources/cams-atmosphere.json', 'utf8'));

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
const NOW = Date.UTC(2026, 10, 12, 14, 20);
const IDX = 24 + 14;   // 2026-11-12 14:00 in the fixture
const HOST = 'air-quality-api.open-meteo.com';
const URL_PREFIX = `https://${HOST}/v1/air-quality?`;
const IDS = ['larnaka', 'lefkosia', 'limassol', 'paphos'];

function mk(fixtures, extra) {
  const ctx = makeCtx({ id: 'cams-atmosphere', hosts: [HOST], fixtures, now: NOW, ...(extra || {}) });
  return { ctx, feed: create(ctx) };
}

(async () => {
  /* --- the contract --- */
  console.log('contract');
  {
    const { feed } = mk({});
    ok(feed.id === 'cams-atmosphere' && desc.id === feed.id, 'id equals the file name and the descriptor id');
    eq(feed.hosts, [HOST], 'one exact host');
    ok(typeof feed.probe === 'function' && typeof feed.read === 'function' && typeof feed.start === 'function' && typeof feed.stop === 'function', 'probe, read, start, stop exist');
    eq(feed.read('larnaka'), [], 'read before any answer is an empty list');
  }

  /* --- parsing --- */
  console.log('parsing');
  const four = fx('om-air-4cities.json');
  {
    const c = T.parseAnswer(four, IDS, NOW);
    eq(Object.keys(c), IDS, 'four cities');
    const l = c.larnaka;
    eq(Object.keys(l), T.VARS, 'all five variables for a city');
    eq(l.aerosol_optical_depth.t, Date.UTC(2026, 10, 12, 14, 0), 'the newest hour that is not in the future (14:00 at 14:20)');
    ok(l.aerosol_optical_depth.v === Math.round(four[0].hourly.aerosol_optical_depth[IDX] * 1000) / 1000, 'AOD value of that hour');
    ok(l.carbon_monoxide.v === four[0].hourly.carbon_monoxide[IDX], 'CO value of that hour');
    ok(c.paphos.nitrogen_dioxide.v === four[3].hourly.nitrogen_dioxide[IDX], 'each place gets its own values (order of the list)');
    const early = T.parseAnswer(four, IDS, Date.UTC(2026, 10, 12, 14, 0));
    eq(early.larnaka.uv_index.t, Date.UTC(2026, 10, 12, 14, 0), 'exactly on the hour counts');
    const before = T.parseAnswer(four, IDS, Date.UTC(2026, 10, 12, 13, 59, 59));
    eq(before.larnaka.uv_index.t, Date.UTC(2026, 10, 12, 13, 0), 'one second before the hour is the previous hour');
    ok(Object.keys(T.parseAnswer(four, IDS, Date.UTC(2026, 10, 10, 12, 0))).length === 0, 'now before the first hour of the answer gives nothing');
  }
  {
    // a hole in the newest hour: the hour before is used; four holes: the variable is left out
    const d = JSON.parse(JSON.stringify(four));
    d[0].hourly.nitrogen_dioxide[IDX] = null;
    d[1].hourly.nitrogen_dioxide.fill(null, IDX - 4, IDX + 1);
    const c = T.parseAnswer(d, IDS, NOW);
    eq(c.larnaka.nitrogen_dioxide.t, Date.UTC(2026, 10, 12, 13, 0), 'a hole in the newest hour: the hour before');
    ok(!c.lefkosia.nitrogen_dioxide && c.lefkosia.carbon_monoxide, 'more than 3 empty hours: that variable only is left out');
    d[2].hourly.uv_index[IDX] = -1;
    ok(T.parseAnswer(d, IDS, NOW).limassol.uv_index.t === Date.UTC(2026, 10, 12, 13, 0), 'a negative value is not used');
  }
  {
    // times as ISO text without a zone (timeformat=iso8601 with timezone=GMT) are UTC
    const d = JSON.parse(JSON.stringify(four));
    d.forEach((p) => { p.hourly.time = p.hourly.time.map((s) => new Date(s * 1000).toISOString().slice(0, 16)); });
    eq(T.parseAnswer(d, IDS, NOW).larnaka.uv_index.t, Date.UTC(2026, 10, 12, 14, 0), 'ISO times without a zone are read as UTC');
    ok(T.timeMs('2026-11-12T14:00') === Date.UTC(2026, 10, 12, 14, 0) && T.timeMs(1794578400) === 1794578400000 && T.timeMs('nope') === null && T.timeMs(null) === null, 'timeMs');
  }
  {
    // a unit that is not the expected one: that variable is dropped for every place, the others stay
    const d = JSON.parse(JSON.stringify(four));
    d.forEach((p) => { p.hourly_units.carbon_monoxide = 'ppb'; });
    const dropped = new Set();
    const c = T.parseAnswer(d, IDS, NOW, dropped);
    ok(!c.larnaka.carbon_monoxide && c.larnaka.nitrogen_dioxide && dropped.has('carbon_monoxide'), 'CO in ppb is left out, never converted by guessing');
    const d2 = JSON.parse(JSON.stringify(four));
    d2.forEach((p) => { p.hourly_units.nitrogen_dioxide = 'µg/m³'; p.hourly_units.aerosol_optical_depth = 'Dimensionless'; p.hourly_units.uv_index = 'Index'; delete p.hourly_units.sulphur_dioxide; });
    eq(Object.keys(T.parseAnswer(d2, IDS, NOW).larnaka), T.VARS, 'micro sign, Greek mu, Dimensionless, Index and a missing unit are all accepted');
  }
  {
    let err = null;
    try { T.parseAnswer(four.slice(0, 3), IDS, NOW); } catch (e) { err = e; }
    ok(err && /3 places, 4/.test(err.message), 'a list with the wrong number of places is refused, never guessed: ' + (err && err.message));
    err = null; try { T.parseAnswer('<html>', IDS, NOW); } catch (e) { err = e; }
    ok(!!err, 'a text answer is refused');
    err = null; try { T.parseAnswer(null, IDS, NOW); } catch (e) { err = e; }
    ok(!!err, 'null is refused');
    eq(T.parseAnswer([{}, {}, {}, {}], IDS, NOW), {}, 'places without data give nothing');
    eq(T.parseAnswer(fx('om-air-1city.json'), ['larnaka'], NOW).larnaka.uv_index.t, Date.UTC(2026, 10, 12, 14, 0), 'one place is an object, not a list');
  }

  /* --- the whole feed through ctx.get (the real http.js), four cities --- */
  console.log('feed with fixtures');
  {
    const call = `${URL_PREFIX}latitude=34.9229,35.1856,34.6841,34.7754&longitude=33.6233,33.3823,33.0379,32.4245&hourly=aerosol_optical_depth,uv_index,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide&past_days=1&forecast_days=1&timeformat=unixtime&timezone=GMT`;
    const { ctx, feed } = mk({ [call]: four });
    const p = await feed.probe();
    eq(ctx.calls, [call], 'ONE request for all four places and five variables, exactly these parameters');
    ok(p.ok && p.n === 4 && p.at === Date.UTC(2026, 10, 12, 14, 0) && /4 of 4 cities/.test(p.note) && /4 από 4/.test(p.noteEl), 'probe: ok, 4 cities, newest data time: ' + JSON.stringify(p));
    for (const id of IDS) {
      const r = feed.read(id);
      eq(r.map((x) => x.variable), T.VARS, id + ': five readings in the documented order');
      for (const x of r) {
        ok(vocab[x.variable] && vocab[x.variable].unit === x.unit, `${id}/${x.variable}: unit ${x.unit} equals vocab`);
        const [lo, hi] = vocab[x.variable].range;
        ok(x.value >= lo && x.value <= hi, `${id}/${x.variable}: ${x.value} inside the vocab range`);
        ok(desc.variables.some((v) => v.id === x.variable && v.unit === x.unit), `${id}/${x.variable}: declared in the descriptor`);
        ok(Number.isFinite(x.time) && x.time <= NOW && NOW - x.time <= 3600000 + 1, `${id}/${x.variable}: observation time is the model hour, not the fetch time`);
        ok(x.where && x.whereEl && x.note && x.noteEl, `${id}/${x.variable}: where and note in English and Greek`);
        ok(x.note.length <= 400 && x.noteEl.length <= 400 && x.where.length <= 400 && x.whereEl.length <= 400, `${id}/${x.variable}: texts fit the registry's 400 characters (${x.note.length}/${x.noteEl.length})`);
        ok(!/\d{2}\.\d{3,}/.test(JSON.stringify(x)) && !/lat|lng/i.test(Object.keys(x).join()), `${id}/${x.variable}: no coordinates in the reading`);
      }
    }
    ok(feed.read('nowhere').length === 0 && feed.read('__proto__').length === 0, 'unknown city: empty list');
    ok(feed.read('larnaka').find((x) => x.variable === 'aerosol_optical_depth').value === Math.round(four[0].hourly.aerosol_optical_depth[IDX] * 1000) / 1000, 'a reading holds the hour value');
    const disk = JSON.parse(fs.readFileSync(path.join(ctx.dir, 'latest.json'), 'utf8'));
    ok(disk.cities.larnaka.uv_index && disk.at === NOW, 'the last good answer is saved to ctx.dir');
    ok(!fs.existsSync(path.join(ctx.dir, 'latest.json.tmp')), 'no temporary file is left');
    ctx.cleanup();
  }

  /* --- the words --- */
  console.log('words');
  {
    ok(T.hazeLevel(0.1).en === 'A clear sky.' && T.hazeLevel(0.2).en === 'A little haze.' && /Saharan dust/.test(T.hazeLevel(0.9).en), 'haze levels in English');
    ok(/Καθαρός/.test(T.hazeLevel(0.1).el) && /Λίγη/.test(T.hazeLevel(0.2).el) && /σκόνη/.test(T.hazeLevel(0.9).el), 'haze levels in Greek');
    ok(T.hazeLevel(0.15).en === 'A little haze.' && T.hazeLevel(0.4).en !== 'A little haze.', 'the edges: 0.15 and 0.4 go up');
    for (const v of T.VARS) for (const x of [0.05, 0.3, 2]) {
      const n = T.NOTES[v](x);
      ok(n.en.length > 60 && n.el.length > 60 && n.en.length <= 400 && n.el.length <= 400, `${v} (${x}): note lengths ${n.en.length}/${n.el.length}`);
      ok(!/\b(safe|dangerous|healthy|unhealthy|clean air)\b/i.test(n.en) && !/(ασφαλ|επικίνδυν|υγιει)/i.test(n.el), `${v}: no safety or health claim`);
    }
    ok(/not a satellite pixel/.test(T.NOTES.aerosol_optical_depth(0.2).en) && /MODIS/.test(T.NOTES.aerosol_optical_depth(0.2).en), 'the haze note says satellites feed a model and it is not a pixel');
    ok(T.NOTES.aerosol_optical_depth(0.2).el.includes('MODIS') && T.NOTES.aerosol_optical_depth(0.2).el.includes('δορυφόρ'), 'and in Greek');
    ok(/not a measurement/.test(T.NOTES.carbon_monoxide().en) && /όχι μέτρηση/.test(T.NOTES.carbon_monoxide().el), 'gas notes say they are not measurements');
    ok(!/[0-9]\.[0-9]/.test(T.NOTES.aerosol_optical_depth(0.2).el.replace(/0,1 έως 0,3|0,5/g, '')), 'Greek text uses decimal commas');
  }

  /* --- dust day --- */
  console.log('dust day');
  {
    const call = (u) => u.startsWith(URL_PREFIX);
    const { ctx, feed } = mk({ [URL_PREFIX + '*']: fx('om-air-dust.json') });
    await feed.probe();
    const r = feed.read('limassol').find((x) => x.variable === 'aerosol_optical_depth');
    ok(r.value === 1.2 && /Saharan dust/.test(r.note) && /σκόνη/.test(r.noteEl), 'haze 1.2: the note talks about Saharan dust and tells where to compare');
    ctx.cleanup();
  }

  /* --- failures never throw --- */
  console.log('failures');
  {
    const cases = {
      'HTTP 500': reply(500, 'oops'),
      'HTTP 429': reply(429, 'slow down', { 'Retry-After': '120' }),
      'HTML instead of JSON': reply(200, '<html>maintenance</html>', { 'content-type': 'text/html' }),
      'JSON error body with status 200': reply(200, JSON.stringify({ error: true, reason: 'nope' })),
      'empty list': reply(200, '[]'),
      'no fixture (404)': null,
    };
    for (const [name, answer] of Object.entries(cases)) {
      const { ctx, feed } = mk(answer ? { [URL_PREFIX + '*']: answer } : {});
      const p = await feed.probe();
      ok(p.ok === false && p.n === 0 && p.at === null && /not available right now/.test(p.note) && p.noteEl, `${name}: probe says not ok: ${JSON.stringify(p)}`);
      eq(feed.read('larnaka'), [], `${name}: read gives an empty list`);
      ok(ctx.logs.length === 1 && ctx.logs[0].length < 200 && !/https?:|\?|latitude/.test(ctx.logs[0]), `${name}: ONE short log line without the address: ${JSON.stringify(ctx.logs)}`);
      ctx.cleanup();
    }
    // a fetch that hangs is cut by ctx.get's own time limit (here 20 ms through a fake slow reply and a short feed timeout is not possible: use a hung socket)
    const { ctx, feed } = mk({ [URL_PREFIX + '*']: reply(200, '{}', {}, { delayMs: 150 }) });
    const t0 = Date.now(); const p = await feed.probe();
    ok(p.ok === false && Date.now() - t0 < 5000, 'a slow, empty answer is a failure and returns');
    ctx.cleanup();
  }

  /* --- an unknown variable name: HTTP 400, each variable asked alone --- */
  console.log('HTTP 400 fallback');
  {
    const d = fx('om-air-4cities.json');
    const only = (v) => d.map((p) => ({ ...p, hourly_units: { time: 'unixtime', [v]: p.hourly_units[v] }, hourly: { time: p.hourly.time, [v]: p.hourly[v] } }));
    const route = (url) => {
      const m = /hourly=([a-z_,]+)&/.exec(url);
      const vars = m[1].split(',');
      if (vars.length > 1) return reply(400, JSON.stringify(fx('om-error-400.json')), { 'content-type': 'application/json' });
      if (vars[0] === 'sulphur_dioxide') return reply(400, JSON.stringify(fx('om-error-400.json')), { 'content-type': 'application/json' });   // this one is refused alone too
      return only(vars[0]);
    };
    const c2 = makeCtx({ id: 'cams-atmosphere', hosts: [HOST], now: NOW, fixtures: { [URL_PREFIX + '*']: (url) => route(url) } });
    const f2 = create(c2);
    const p = await f2.probe();
    ok(p.ok === true, 'probe is ok with four of five variables');
    eq(f2.read('paphos').map((x) => x.variable), ['aerosol_optical_depth', 'uv_index', 'nitrogen_dioxide', 'carbon_monoxide'], 'the refused variable is left out, the others stay');
    ok(c2.calls.length === 6, 'one combined call, then five single calls: ' + c2.calls.length);
    ok(c2.logs.some((l) => /refused \(HTTP 400\)/.test(l)) && c2.logs.some((l) => /sulphur_dioxide is not available/.test(l)), 'the log names what happened: ' + JSON.stringify(c2.logs));
    ok(c2.logs.every((l) => !/latitude|https?:/.test(l)), 'log lines have no address');
    c2.cleanup();
    // all refused
    const c3 = makeCtx({ id: 'cams-atmosphere', hosts: [HOST], now: NOW, fixtures: { [URL_PREFIX + '*']: reply(400, JSON.stringify(fx('om-error-400.json'))) } });
    const f3 = create(c3);
    const p3 = await f3.probe();
    ok(p3.ok === false && f3.read('larnaka').length === 0, 'everything refused: not ok, empty, no crash');
    c3.cleanup();
  }

  /* --- the cache keeps the last data when the network is gone --- */
  console.log('cache');
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cams-cache-'));
    const a = makeCtx({ id: 'cams-atmosphere', hosts: [HOST], now: NOW, dir, fixtures: { [URL_PREFIX + '*']: four } });
    const fa = create(a);
    await fa.probe();
    const before = fa.read('larnaka');
    // "restart" 6 hours later, network dead
    const b = makeCtx({ id: 'cams-atmosphere', hosts: [HOST], now: NOW + 6 * 3600000, dir, fixtures: {} });
    const fb = create(b);
    const after = fb.read('larnaka');
    eq(after.map((x) => [x.variable, x.value, x.time]), before.map((x) => [x.variable, x.value, x.time]), 'a restart shows the last data with its OLD observation times');
    const pb = await fb.probe();
    ok(pb.ok === true && pb.at === Date.UTC(2026, 10, 12, 14, 0), 'probe: ok with the old time, so the page can say late: ' + JSON.stringify(pb));
    ok(b.calls.length === 0, 'probe does not fetch when there is cached data');
    await fb._t.refresh();   // the network is dead now
    const pb2 = await fb.probe();
    ok(pb2.ok === true && /last update failed/.test(pb2.note) && /απέτυχε/.test(pb2.noteEl) && fb.read('larnaka').length === 5, 'a failed refresh keeps the old values and says so');
    ok(b.logs.length === 1, 'one log line: ' + JSON.stringify(b.logs));
    // a broken cache file is ignored
    fs.writeFileSync(path.join(dir, 'latest.json'), '{not json');
    const c = makeCtx({ id: 'cams-atmosphere', hosts: [HOST], now: NOW, dir, fixtures: {} });
    eq(create(c).read('larnaka'), [], 'a broken cache file gives an empty list, no crash');
    fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ at: 1, cities: { larnaka: { uv_index: { v: 'x', t: 1 }, ozone: { v: 5, t: 5 } }, atlantis: { uv_index: { v: 1, t: 1 } } } }));
    eq(create(makeCtx({ id: 'cams-atmosphere', hosts: [HOST], now: NOW, dir })).read('larnaka'), [], 'a cache with bad numbers, unknown variables or unknown cities is ignored');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  /* --- start and stop: no handle stays open, never throws --- */
  console.log('start and stop');
  {
    const { ctx, feed } = mk({ [URL_PREFIX + '*']: four });
    const t0 = Date.now();
    feed.start(); feed.start(); feed.stop(); feed.stop();
    ok(Date.now() - t0 < 100, 'start and stop return at once');
    ok(ctx.calls.length === 0, 'start does not fetch at once (the first answer comes after a few seconds)');
    ctx.cleanup();
  }

  /* --- inside the real registry (env, scrub, limits) --- */
  console.log('registry');
  {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cams-reg-'));
    const seen = [];
    const feedsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cams-feeds-'));
    fs.copyFileSync(REPO + '/satellite/feeds/cams-atmosphere.js', path.join(feedsDir, 'cams-atmosphere.js'));
    const sat = createSatellite({
      root: REPO, dataDir, feedsDir, log: (m) => seen.push(m), now: () => NOW,
      transport: async (u) => { seen.push('GET ' + new URL(u).host); return new Response(JSON.stringify(four), { status: 200, headers: { 'content-type': 'application/json' } }); },
    });
    ok(sat.has('cams-atmosphere'), 'the registry loads the feed');
    const p = await sat.probe('cams-atmosphere');
    ok(p.ok && p.n === 4, 'registry probe: ' + JSON.stringify(p));
    const rows = await sat.read('cams-atmosphere', 'lefkosia');
    eq(rows.map((r) => r.variable), T.VARS, 'registry read gives the five variables');
    ok(rows.every((r) => r.unit === vocab[r.variable].unit && r.time > 0 && r.where && r.note), 'registry keeps unit, time, where and note');
    ok(seen.filter((x) => x === 'GET ' + HOST).length === 1, 'one request to the one host');
    const st = await sat.status({ probe: false });
    ok(st.feeds.some((f) => f.id === 'cams-atmosphere' && f.hosts.join() === HOST && !f.needsKey), 'status lists the host and no key is needed');
    sat.stop();
    fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(feedsDir, { recursive: true, force: true });
  }

  /* --- descriptor, vocab and the rules of the brief --- */
  console.log('descriptor');
  {
    ok(desc.layer === 'model' && desc.status === 'active' && desc.quality.kind === 'model', 'model layer, active, quality.kind is model (not satellite)');
    ok(desc.licence.id === 'CC-BY-4.0' && desc.licence.checked_on === '2026-11-12' && desc.licence.attribution && desc.licence.url, 'licence verified, with the attribution line');
    ok(desc.access.auth.type === 'none' && !desc.access.auth.env, 'keyless');
    ok(desc.i18n.el.name && desc.i18n.el.summary && desc.i18n.el.tagline, 'Greek name, summary and tagline');
    ok(/satellite/i.test(desc.summary) && /model/i.test(desc.summary) && /not satellite pixels/.test(desc.summary), 'the summary says satellites feed a model and these are not pixels');
    ok(desc.upstream.some((u) => /CAMS/.test(u.name)) && desc.upstream.some((u) => /MODIS/.test(u.name)), 'upstream names CAMS and MODIS (so the brain counts them as not independent)');
    for (const v of T.VARS) ok(desc.variables.some((x) => x.id === v) && vocab[v], `${v} is in the descriptor and in vocab/variables.json`);
    const openmeteoAir = JSON.parse(fs.readFileSync(REPO + '/sources/openmeteo-air.json', 'utf8'));
    ok(desc.upstream[0].name === openmeteoAir.upstream[0].name, 'same CAMS upstream name as openmeteo-air (counted as one source by the brain)');
    for (const v of T.VARS) ok(!desc.variables.find((x) => x.id === v) || !['pm25', 'pm10', 'dust', 'ozone'].includes(v), `${v} does not repeat a variable of openmeteo-air`);
    ok(vocab.aerosol_optical_depth.tolerance && vocab.aerosol_optical_depth.tolerance.abs === 0.1, 'AOD can be compared (tolerance set)');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
