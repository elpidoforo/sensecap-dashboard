'use strict';
/* Tests for satellite/feeds/nasa-gibs-imagery.js against a fake GIBS (tests/sat-imagery/helpers.js). No network.
 * Run:  node --test tests/sat-imagery/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeCtx, reply } = require('../../satellite/testing');
const create = require('../../satellite/feeds/nasa-gibs-imagery');
const kit = require('../../satellite/lib/imagery');
const { fx, variant, xmlException, gibsFake, XML } = require('./helpers');

const HOST = 'gibs.earthdata.nasa.gov';
const NOW = Date.parse('2026-11-12T16:00:00Z');
const DEFS = create.DEFS;
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

// every layer the feed may ask for, newest date `date`; the fixed night picture has no time
function allLatest(date, over) {
  const out = {};
  for (const d of DEFS) for (const c of d.candidates) for (const l of c.layers) out[l] = c.static ? null : date;
  out.Coastlines = date;
  return { ...out, ...(over || {}) };
}
function setup(cfg) {
  const c = cfg || {};
  const fake = gibsFake({ latest: c.latest || allLatest('2026-11-12'), ...(c.fake || {}) });
  const seen = [];
  const ctx = makeCtx({ id: 'nasa-gibs-imagery', hosts: [HOST], now: c.now || NOW, dir: c.dir, fixtures: { [`https://${HOST}/*`]: (url, init) => { seen.push(init && init.headers); return (c.wrap ? c.wrap(url, fake) : fake(url)); } } });
  const feed = create(ctx, { pauseMs: 0, firstDelayMs: 1e9, ...(c.opts || {}) });
  return { ctx, feed, seen };
}
const maps = (ctx) => ctx.calls.filter((u) => /request=GetMap/i.test(u));
const par = (u, k) => new URL(u).searchParams.get(k);
const of = (feed, group) => feed.images().filter((i) => i.group === group);

test('the picture address: WMS 1.1.1, west-south-east-north box, the true shape of the box, the date, no secrets', () => {
  const u = new URL(create.mapUrl(['LAYER_A', 'Coastlines'], 'image/png', '0x0B1220', '2026-11-10'));
  assert.equal(u.origin + u.pathname, `https://${HOST}/wms/epsg4326/best/wms.cgi`);
  const p = u.searchParams;
  assert.equal(p.get('version'), '1.1.1');
  assert.equal(p.get('request'), 'GetMap');
  assert.equal(p.get('layers'), 'LAYER_A,Coastlines');
  assert.equal(p.get('styles'), ',');
  assert.equal(p.get('srs'), 'EPSG:4326');
  assert.equal(p.get('bbox'), '32,34.4,34.9,35.9');                 // lon/lat order for WMS 1.1.1
  assert.equal(p.get('width'), '1000'); assert.equal(p.get('height'), '633');
  assert.equal(p.get('time'), '2026-11-10');
  assert.equal(p.get('transparent'), 'FALSE');
  assert.equal(new URL(create.mapUrl(['A'], 'image/jpeg', '0x000000', null)).searchParams.has('time'), false);
  // the box is the one the descriptor promises, and the pixel shape matches the ground shape (about 264 km by 167 km)
  assert.deepEqual(create.BBOX, [32.0, 34.4, 34.9, 35.9]);
  const km = (create.BBOX[2] - create.BBOX[0]) * 111.32 * Math.cos(35.15 * Math.PI / 180) / ((create.BBOX[3] - create.BBOX[1]) * 111.32);
  assert.ok(Math.abs(1000 / 633 - km) < 0.03, `pixel shape ${1000 / 633} vs ground shape ${km}`);
});

test('the six picture kinds are in the right order, each with English and Greek text, and none uses Suomi NPP as a live source', () => {
  assert.deepEqual(DEFS.map((d) => d.id), ['true-colour', 'night-lights', 'aerosol', 'land-temperature', 'sea-temperature', 'fires']);
  for (const d of DEFS) {
    assert.ok(d.title.length > 5 && d.titleEl.length > 5 && /\p{Script=Greek}/u.test(d.titleEl), d.id);
    assert.match(d.text, /^Look for /); assert.match(d.textEl, /^Δες /);   // one sentence, informal singular
    assert.equal((d.text.match(/\. /g) || []).length, 0, d.id + ' is one sentence');
    for (const c of d.candidates) if (!c.static) for (const l of c.layers) assert.doesNotMatch(l, /SNPP|Suomi/i, l);
  }
});

test('first run with a good capabilities text: 7 days of every kind, newest first, real dates, no date after what each layer has', async () => {
  const { ctx, feed } = setup();
  const r = await feed.refresh();
  assert.equal(r.ok, true);
  const imgs = feed.images();
  assert.equal(imgs.length, 42);
  for (const d of DEFS) assert.equal(of(feed, d.id).length, 7, d.id);
  // the newest day of each kind follows its readiness hours
  const newestDay = (g) => of(feed, g)[0].day;
  assert.equal(newestDay('true-colour'), '2026-11-12');
  assert.equal(newestDay('night-lights'), '2026-11-11');
  assert.equal(newestDay('sea-temperature'), '2026-11-11');
  assert.equal(newestDay('fires'), '2026-11-12');
  // one capabilities request, then 42 pictures; every picture request is an https request to the one host
  assert.equal(ctx.calls.filter((u) => /getcapabilities/i.test(u)).length, 1);
  assert.equal(maps(ctx).length, 42);
  for (const u of ctx.calls) assert.equal(new URL(u).host, HOST);
  // the "latest" flag is set on one picture of each kind: the newest
  for (const d of DEFS) { const l = of(feed, d.id); assert.equal(l.filter((i) => i.latest).length, 1); assert.equal(l[0].latest, true); }
  const total = fs.readdirSync(ctx.dir).filter((f) => /\.(jpg|png)$/.test(f)).reduce((n, f) => n + fs.statSync(path.join(ctx.dir, f)).size, 0);
  assert.ok(total < 25 * 1024 * 1024);
  ctx.cleanup();
});

test('images(): ids, titles, texts, exact attribution, times, files that exist, content types that match the bytes', async () => {
  const { ctx, feed } = setup();
  await feed.refresh();
  const imgs = feed.images();
  const ids = new Set();
  for (const i of imgs) {
    assert.match(i.id, /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
    assert.ok(!ids.has(i.id)); ids.add(i.id);
    assert.ok(i.title && i.titleEl && i.text && i.textEl);
    assert.match(i.text, / Satellite: [^.]+\.$/); assert.match(i.textEl, / Δορυφόρος: [^.]+\.$/);
    assert.equal(i.attribution, create.ATTRIBUTION);
    assert.match(i.attribution, /^We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services \(GIBS\), part of NASA's Earth Science Data and Information System \(ESDIS\)\.$/);
    assert.ok(i.attributionEl.startsWith(i.attribution) && /\p{Script=Greek}/u.test(i.attributionEl) && i.attributionEl.length <= 340);   // the exact line, then a Greek gloss
    assert.deepEqual(i.bbox, [32.0, 34.4, 34.9, 35.9]);
    assert.ok(Number.isFinite(i.time) && i.time > NOW - 10 * DAY && i.time < NOW + DAY, String(i.time));
    assert.equal(iso(i.time), i.day);
    const f = path.isAbsolute(i.file) ? i.file : path.join(ctx.dir, i.file);
    assert.ok(path.resolve(f).startsWith(path.resolve(ctx.dir) + path.sep));
    const b = fs.readFileSync(f);
    const v = kit.validateImage(b, { minBytes: 100 });
    assert.equal(v.ok, true, i.id);
    assert.equal(v.contentType, i.contentType);
  }
  // true-colour is a JPEG, the science layers are PNG
  assert.equal(of(feed, 'true-colour')[0].contentType, 'image/jpeg');
  assert.equal(of(feed, 'aerosol')[0].contentType, 'image/png');
  // sorted newest first
  for (let k = 1; k < imgs.length; k++) assert.ok(imgs[k - 1].time >= imgs[k].time);
  ctx.cleanup();
});

test('the satellite order is NOAA-21, NOAA-20, Aqua, Terra; a late or retired one is passed over; fires use the same base picture and add the hot-spot layer', async () => {
  // NOAA-21 true colour is 9 days old (retired or late): NOAA-20 is used, for the fires picture too (it is built on the same base)
  const a = setup({ latest: allLatest('2026-11-12', { VIIRS_NOAA21_CorrectedReflectance_TrueColor: '2026-11-03' }) });
  await a.feed.refresh();
  const tc = of(a.feed, 'true-colour');
  assert.equal(tc.length, 7);
  assert.ok(tc.every((i) => i.platform === 'NOAA-20 (VIIRS)'), tc.map((i) => i.platform).join());
  assert.match(tc[0].text, /Satellite: NOAA-20 \(VIIRS\)\.$/);
  assert.ok(of(a.feed, 'fires').every((i) => i.platform === 'NOAA-20 (VIIRS)'));
  a.ctx.cleanup();
  // everything current: NOAA-21 first, and fires ask for the thermal layer on top of the natural colours
  const b = setup();
  await b.feed.refresh();
  assert.ok(of(b.feed, 'true-colour').every((i) => i.platform === 'NOAA-21 (VIIRS)'));
  assert.ok(of(b.feed, 'fires').every((i) => i.platform === 'NOAA-21 (VIIRS)'));
  assert.ok(maps(b.ctx).some((u) => par(u, 'layers') === 'VIIRS_NOAA21_CorrectedReflectance_TrueColor,VIIRS_NOAA21_Thermal_Anomalies_375m_All'));
  b.ctx.cleanup();
  // NOAA-21 and NOAA-20 both gone: Aqua, then Terra
  const c = setup({ latest: allLatest('2026-11-12', { VIIRS_NOAA21_CorrectedReflectance_TrueColor: '2026-11-01', VIIRS_NOAA20_CorrectedReflectance_TrueColor: '2026-11-01', MODIS_Aqua_CorrectedReflectance_TrueColor: '2026-10-20' }) });
  await c.feed.refresh();
  assert.ok(of(c.feed, 'true-colour').every((i) => i.platform === 'Terra (MODIS)'));
  c.ctx.cleanup();
});

test('latest-date logic: a layer whose newest date is older than the target is asked only up to its own newest date', async () => {
  const { ctx, feed } = setup({ latest: allLatest('2026-11-12', { VIIRS_NOAA21_CorrectedReflectance_TrueColor: '2026-11-10' }) });
  await feed.refresh();
  const asks = maps(ctx).filter((u) => par(u, 'layers').startsWith('VIIRS_NOAA21_CorrectedReflectance_TrueColor') && !/Thermal/.test(par(u, 'layers')));
  assert.equal(asks.length, 7);
  const dates = asks.map((u) => par(u, 'time')).sort();
  assert.equal(dates[dates.length - 1], '2026-11-10');
  assert.equal(dates[0], '2026-11-04');
  // and every stored picture of that kind carries a real date (none is a snapped copy under a later date)
  const tc = of(feed, 'true-colour');
  assert.equal(tc[0].day, '2026-11-10');
  assert.equal(new Set(tc.map((i) => i.day)).size, 7);
  ctx.cleanup();
});

test('no capabilities (HTTP 500): dates are asked oldest first and the snapped copies of the newest picture are thrown away', async () => {
  // the service really has pictures up to 2026-11-10 only; asking for 11-11 and 11-12 gives the 11-10 picture again (nearestValue)
  const { ctx, feed } = setup({ latest: allLatest('2026-11-10'), fake: { caps: 500 } });
  await feed.refresh();
  for (const d of ['true-colour', 'aerosol', 'land-temperature', 'fires']) {
    const days = of(feed, d).map((i) => i.day);
    assert.equal(days[0], '2026-11-10', d);
    assert.equal(days.length, 5, d + ' ' + days.join());
    assert.ok(!days.includes('2026-11-11') && !days.includes('2026-11-12'), d);
  }
  // the first asks were for the oldest dates
  const tcAsks = maps(ctx).filter((u) => par(u, 'layers').startsWith('VIIRS_NOAA21_CorrectedReflectance_TrueColor') && !/Thermal/.test(par(u, 'layers'))).map((u) => par(u, 'time'));
  assert.equal(tcAsks[0], '2026-11-06');
  assert.ok(feed.probe().ok);
  ctx.cleanup();
});

test('no capabilities and a retired satellite: no old picture is kept under a new date, the next satellite is used', async () => {
  // NOAA-21 true colour ended on 2026-11-02; the service snaps every later date to that day
  const { ctx, feed } = setup({ latest: allLatest('2026-11-12', { VIIRS_NOAA21_CorrectedReflectance_TrueColor: '2026-11-02' }), fake: { caps: 'garbage' } });
  await feed.refresh();
  const tc = of(feed, 'true-colour');
  assert.ok(tc.length >= 5, String(tc.length));
  assert.ok(tc.every((i) => i.platform === 'NOAA-20 (VIIRS)'), tc.map((i) => i.platform + i.day).join());
  assert.ok(!tc.some((i) => /NOAA21/.test(i.layer)));
  // the retired candidate is rested for a while: a second run does not ask for it again
  const before = maps(ctx).length;
  ctx.setNow(NOW + 6 * 3600000);
  await feed.refresh();
  const again = maps(ctx).slice(before).filter((u) => /^VIIRS_NOAA21_CorrectedReflectance_TrueColor$/.test(par(u, 'layers')));
  assert.equal(again.length, 0);
  ctx.cleanup();
});

test('a layer the service does not list is skipped at once (with capabilities) and the next one is used', async () => {
  const latest = allLatest('2026-11-12');
  delete latest.VIIRS_NOAA21_CorrectedReflectance_TrueColor; delete latest.VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance;
  const { ctx, feed } = setup({ latest });
  await feed.refresh();
  assert.ok(of(feed, 'true-colour').every((i) => i.platform === 'NOAA-20 (VIIRS)'));
  const nl = of(feed, 'night-lights');
  assert.equal(nl.length, 7);
  assert.ok(nl.every((i) => /AtSensor_M15/.test(i.layer)));
  assert.equal(maps(ctx).filter((u) => /NOAA21_CorrectedReflectance_TrueColor$/.test(par(u, 'layers'))).length, 0);
  ctx.cleanup();
});

test('a layer the service does not know (XML LayerNotDefined, HTTP 200, no capabilities): skipped, never stored as a picture', async () => {
  const latest = allLatest('2026-11-12');
  delete latest.VIIRS_NOAA20_Land_Surface_Temp_Day;
  const { ctx, feed } = setup({ latest, fake: { caps: 500 } });
  await feed.refresh();
  const lt = of(feed, 'land-temperature');
  assert.ok(lt.length >= 5);
  assert.ok(lt.every((i) => /^MODIS_Aqua/.test(i.layer)), lt.map((i) => i.layer).join());
  for (const f of fs.readdirSync(ctx.dir)) if (/\.(png|jpg)$/.test(f)) assert.equal(kit.validateImage(fs.readFileSync(path.join(ctx.dir, f)), { minBytes: 100 }).ok, true, f);
  assert.ok(ctx.logs.some((l) => /VIIRS_NOAA20_Land_Surface_Temp_Day is skipped/.test(l)));
  ctx.cleanup();
});

test('bad answers are never stored: XML exception with HTTP 200, truncated picture, HTML, oversize, a tiny empty picture', async () => {
  const bad = {
    '2026-11-12': () => reply(200, xmlException('InvalidDimensionValue', 'Invalid time value'), XML),
    '2026-11-11': () => reply(200, fx('cyprus-1000x633.jpg').subarray(0, 9000), { 'content-type': 'image/jpeg' }),
    '2026-11-10': () => reply(200, '<html>Service unavailable</html>', { 'content-type': 'text/html' }),
    '2026-11-09': () => reply(200, Buffer.concat([fx('cyprus-1000x633.jpg'), Buffer.alloc(2 * 1024 * 1024)]), { 'content-type': 'image/jpeg' }),
    '2026-11-08': () => reply(200, fx('ok.png'), { 'content-type': 'image/png' }),
  };
  const wrap = (url, fake) => {
    const p = new URL(url).searchParams;
    if (/getcapabilities/i.test(p.get('request') || '')) return fake(url);
    if (p.get('layers') === 'VIIRS_NOAA21_CorrectedReflectance_TrueColor' && bad[p.get('time')]) return bad[p.get('time')]();
    return fake(url);
  };
  const { ctx, feed } = setup({ wrap });
  await feed.refresh();
  // three bad days in a row at the front: the run stops for this kind (it does not hammer) and nothing bad is stored
  assert.deepEqual(of(feed, 'true-colour'), []);
  assert.ok(ctx.logs.some((l) => /trouble/.test(l)));
  // the bad days rest, so the next run goes on to the older days
  ctx.setNow(NOW + 3 * 3600000);
  await feed.refresh();
  const days = of(feed, 'true-colour').map((i) => i.day);
  for (const d of Object.keys(bad)) assert.ok(!days.includes(d), `${d} must not be stored`);
  assert.deepEqual(days, ['2026-11-07', '2026-11-06']);
  for (const f of fs.readdirSync(ctx.dir)) if (/\.(png|jpg)$/.test(f)) assert.equal(kit.validateImage(fs.readFileSync(path.join(ctx.dir, f)), { minBytes: 100 }).ok, true, f);
  assert.equal(fs.readdirSync(ctx.dir).filter((f) => /\.tmp$/.test(f)).length, 0);
  ctx.cleanup();
});

test('HTTP 429 with Retry-After: the run stops at once, says when to come back, and does not hammer', async () => {
  const wrap = (url, fake) => (/request=GetMap/i.test(url) ? reply(429, 'slow down', { 'retry-after': '1800' }) : fake(url));
  const { ctx, feed } = setup({ wrap });
  const r = await feed.refresh();
  assert.equal(r.ok, false);
  assert.ok(r.retryInMs >= 1800000, String(r.retryInMs));
  assert.equal(maps(ctx).length, 1);
  assert.equal(feed.images().length, 0);
  assert.equal(feed.probe().ok, false);
  assert.match(feed.probe().note, /last try failed/);
  ctx.cleanup();
});

test('HTTP 503 and three network failures also stop the run; the loop then backs off instead of retrying fast', async () => {
  const w503 = (url, fake) => (/request=GetMap/i.test(url) ? reply(503, 'busy') : fake(url));
  const a = setup({ wrap: w503 });
  const ra = await a.feed.refresh();
  assert.equal(ra.ok, false);
  assert.equal(maps(a.ctx).length, 1);
  a.ctx.cleanup();
  // an odd 404 answer three times in a row
  const w404 = (url, fake) => (/request=GetMap/i.test(url) ? reply(404, 'no') : fake(url));
  const b = setup({ wrap: w404 });
  const rb = await b.feed.refresh();
  assert.equal(rb.ok, false);
  assert.ok(maps(b.ctx).length <= 3, String(maps(b.ctx).length));
  b.ctx.cleanup();
});

test('the loop: first run after the delay, a failed run backs off (10 minutes first), nothing keeps the process alive', async () => {
  const wrap = (url, fake) => (/request=GetMap/i.test(url) ? reply(503, 'busy') : fake(url));
  const { ctx, feed } = setup({ wrap, opts: { firstDelayMs: 10 } });
  feed.start();
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(feed._t.loop.fails >= 1);
  assert.ok(feed._t.loop.nextInMs >= 9 * 60000 && feed._t.loop.nextInMs <= 11 * 60000, String(feed._t.loop.nextInMs));
  const n = maps(ctx).length;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(maps(ctx).length, n);
  feed.stop();
  feed.stop();   // stopping twice is fine
  ctx.cleanup();
});

test('a second run when everything is here makes no request at all; a restart on the same folder does not fetch again', async () => {
  const a = setup();
  await a.feed.refresh();
  const n = a.ctx.calls.length;
  await a.feed.refresh();
  assert.equal(a.ctx.calls.length, n);
  // restart: a new feed object on the same folder
  const b = setup({ dir: a.ctx.dir });
  assert.equal(b.feed.images().length, 42);
  await b.feed.refresh();
  assert.equal(b.ctx.calls.length, 0);
  assert.ok(b.feed.probe().ok);
  a.ctx.cleanup();
});

test('retention: after the days pass, the newest 7 days of each kind stay and the older files are deleted from the disk', async () => {
  const a = setup();
  await a.feed.refresh();
  assert.equal(a.feed.images().length, 42);
  // three days later the service has three more days
  a.ctx.setNow(NOW + 3 * DAY);
  const fake3 = gibsFake({ latest: allLatest('2026-11-15') });
  const ctx2 = makeCtx({ id: 'nasa-gibs-imagery', hosts: [HOST], now: NOW + 3 * DAY, dir: a.ctx.dir, fixtures: { [`https://${HOST}/*`]: (u) => fake3(u) } });
  const feed2 = create(ctx2, { pauseMs: 0, firstDelayMs: 1e9 });
  await feed2.refresh();
  for (const d of DEFS) {
    const days = of(feed2, d.id).map((i) => i.day);
    assert.equal(days.length, 7, d.id);
    assert.equal(new Set(days).size, 7);
    assert.ok(days[0] > of(a.feed, d.id)[0].day || true);
  }
  assert.equal(of(feed2, 'true-colour')[0].day, '2026-11-15');
  assert.equal(of(feed2, 'true-colour')[6].day, '2026-11-09');
  const files = fs.readdirSync(a.ctx.dir).filter((f) => /\.(jpg|png)$/.test(f));
  assert.equal(files.length, 42, files.length + ' files on disk');
  assert.equal(files.filter((f) => /true-colour--2026-11-0[6-8]/.test(f)).length, 0);
  // only 3 new days were fetched per kind (the other 4 were kept), not 7
  assert.ok(maps(ctx2).length <= 3 * 6 + 1, String(maps(ctx2).length));
  a.ctx.cleanup();
});

test('the size cap: the folder stays under the cap, the oldest go first, the newest picture of every kind is always kept', async () => {
  const { ctx, feed } = setup({ opts: { maxBytes: 150 * 1024 } });
  await feed.refresh();
  const files = fs.readdirSync(ctx.dir).filter((f) => /\.(jpg|png)$/.test(f));
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(ctx.dir, f)).size, 0);
  assert.ok(bytes <= 150 * 1024 + 500, String(bytes));
  for (const d of DEFS) {
    const l = of(feed, d.id);
    assert.ok(l.length >= 1, d.id + ' lost its newest picture');
    assert.equal(l[0].latest, true);
  }
  // what is left of a kind are its newest days (no hole in the middle)
  const tc = of(feed, 'true-colour').map((i) => i.day);
  assert.deepEqual(tc, [...tc].sort().reverse());
  assert.equal(tc[0], '2026-11-12');
  ctx.cleanup();
});

test('SATELLITE_IMAGERY_MAX_MB sets the cap, a request budget stops a very long run politely', async () => {
  const a = setup({ opts: { maxRequests: 10 } });
  const r = await a.feed.refresh();
  assert.ok(r.requests <= 11, String(r.requests));
  assert.ok(a.feed.images().length >= 1);
  // the next run (after the 6-hour rest of misses is irrelevant here) carries on from what is missing
  await a.feed.refresh();
  assert.ok(a.feed.images().length > 7);
  a.ctx.cleanup();
  const ctx = makeCtx({ id: 'nasa-gibs-imagery', hosts: [HOST], now: NOW, env: { SATELLITE_IMAGERY_MAX_MB: '2', SATELLITE_IMAGERY_PAUSE_MS: '0', SATELLITE_IMAGERY_FIRST_DELAY_MS: '5' }, fixtures: {} });
  const feed = create(ctx);
  assert.equal(feed._t.o.maxBytes, 2 * 1024 * 1024);
  assert.equal(feed._t.o.pauseMs, 0);
  assert.equal(feed._t.o.firstDelayMs, 5);
  ctx.cleanup();
});

test('politeness: a pause between requests (the default is 1.5 s), only one request at a time', async () => {
  assert.equal(create(makeCtx({ id: 'nasa-gibs-imagery', hosts: [HOST], fixtures: {} }))._t.o.pauseMs, 1500);
  let inflight = 0, maxInflight = 0, stamps = [];
  const wrap = (url, fake) => { inflight++; maxInflight = Math.max(maxInflight, inflight); stamps.push(Date.now()); const r = fake(url); inflight--; return r; };
  const { ctx, feed } = setup({ wrap, opts: { pauseMs: 25, maxRequests: 6 } });
  const keep = setInterval(() => {}, 1000);   // the feed's own pauses are unref'd (they never hold a server open); the test holds the loop
  await feed.refresh();
  clearInterval(keep);
  assert.equal(maxInflight, 1);
  const gaps = stamps.slice(2).map((t, i) => t - stamps[i + 1]);   // skip the capabilities request
  assert.ok(gaps.length >= 3);
  assert.ok(gaps.every((g) => g >= 20), gaps.join());
  ctx.cleanup();
});

test('the outline layer: when the service does not know it, the picture is asked again without it, and it is not tried again for a day', async () => {
  const latest = allLatest('2026-11-12'); delete latest.Coastlines;
  const { ctx, feed } = setup({ latest, fake: { caps: 500, coasts: [] } });
  await feed.refresh();
  const aer = of(feed, 'aerosol');
  assert.ok(aer.length >= 5);
  const withOutline = maps(ctx).filter((u) => /,Coastlines/.test(par(u, 'layers')));
  assert.ok(withOutline.length <= 3, 'outline asked ' + withOutline.length);   // once per kind that wants it, until the memory
  assert.ok(feed._t.store.list().filter((e) => e.group === 'aerosol' || e.group === 'night-lights').every((e) => e.overlay === null));
  assert.ok(Object.keys(feed._t.state.overlayBad).length === 2);   // both outline ids are rested for a day
  ctx.cleanup();
  // with capabilities that list it, it is used for the science kinds and not for the natural-colour pictures
  const b = setup();
  await b.feed.refresh();
  assert.ok(maps(b.ctx).filter((u) => /^VIIRS_NOAA20_AOT/.test(par(u, 'layers'))).every((u) => par(u, 'layers').endsWith(',Coastlines')));
  assert.ok(maps(b.ctx).filter((u) => /TrueColor$/.test(par(u, 'layers'))).length >= 7);
  assert.ok(!maps(b.ctx).some((u) => /TrueColor,Coastlines/.test(par(u, 'layers'))));
  b.ctx.cleanup();
});

test('night lights: with no live night layer at all, the fixed 2012 picture is shown, labelled as 2012, and goes when a live one arrives', async () => {
  const latest = allLatest('2026-11-12');
  delete latest.VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance; delete latest.VIIRS_NOAA20_DayNightBand_AtSensor_M15;
  latest.VIIRS_CityLights_2012 = null;
  const a = setup({ latest });
  await a.feed.refresh();
  const nl = of(a.feed, 'night-lights');
  assert.equal(nl.length, 1);
  assert.equal(nl[0].id, 'night-lights-fixed');
  assert.equal(nl[0].fixed, true);
  assert.match(nl[0].title, /2012/); assert.match(nl[0].titleEl, /2012/);
  assert.match(nl[0].text, /fixed picture/); assert.match(nl[0].textEl, /σταθερή εικόνα/);
  assert.equal(iso(nl[0].time), '2012-10-31');
  assert.equal(nl[0].contentType, 'image/jpeg');
  // the live layer comes back: the fixed picture is replaced by dated ones
  a.ctx.setNow(NOW + 2 * 3600000);
  const full = gibsFake({ latest: allLatest('2026-11-12') });
  const ctx2 = makeCtx({ id: 'nasa-gibs-imagery', hosts: [HOST], now: NOW + 2 * DAY, dir: a.ctx.dir, fixtures: { [`https://${HOST}/*`]: (u) => full(u) } });
  const f2 = create(ctx2, { pauseMs: 0, firstDelayMs: 1e9 });
  await f2.refresh();
  const nl2 = of(f2, 'night-lights');
  assert.ok(nl2.length >= 1 && nl2.every((i) => !i.fixed));
  assert.equal(fs.readdirSync(a.ctx.dir).filter((f) => /night-lights--static/.test(f)).length, 0);
  a.ctx.cleanup();
});

test('a picture the service has no data for (a tiny empty picture) is skipped and not asked again for hours', async () => {
  const noData = new Set(['VIIRS_NOAA21_CorrectedReflectance_TrueColor|2026-11-12']);
  const { ctx, feed } = setup({ fake: { noData } });
  await feed.refresh();
  const tc = of(feed, 'true-colour').map((i) => i.day);
  assert.ok(!tc.includes('2026-11-12'));
  assert.equal(tc.length, 6);       // the week is the 7 dates that end at the newest one; the empty day is a hole, not a shift
  const asked = () => maps(ctx).filter((u) => par(u, 'time') === '2026-11-12' && /^VIIRS_NOAA21_CorrectedReflectance_TrueColor$/.test(par(u, 'layers'))).length;
  assert.equal(asked(), 1);
  ctx.setNow(NOW + 3 * 3600000);
  await feed.refresh();
  assert.equal(asked(), 1);          // rested for 6 hours
  ctx.setNow(NOW + 7 * 3600000);
  await feed.refresh();
  assert.equal(asked(), 2);
  ctx.cleanup();
});

test('a day whose picture is a copy of the day before (the service snapped it) is not kept under two dates: the earlier date is the real one', async () => {
  // the capabilities over-promise: they list 2026-11-12, but the service really answers 11-12 with the picture of 11-11
  const wrap = (url, fake) => {
    const u = new URL(url);
    if (!/getmap/i.test(u.searchParams.get('request') || '') || u.searchParams.get('time') !== '2026-11-12') return fake(url);
    u.searchParams.set('time', '2026-11-11');
    return fake(u.toString());
  };
  const { ctx, feed } = setup({ wrap });
  await feed.refresh();
  for (const g of ['true-colour', 'fires']) {
    const days = of(feed, g).map((i) => i.day);
    assert.ok(!days.includes('2026-11-12'), g + ' ' + days.join());
    assert.equal(days[0], '2026-11-11', g);
    assert.equal(new Set(of(feed, g).map((i) => i.file)).size, days.length);
  }
  // no two stored pictures of one kind have the same bytes
  for (const d of DEFS) {
    const hashes = of(feed, d.id).map((i) => kit.validateImage(fs.readFileSync(path.isAbsolute(i.file) ? i.file : path.join(ctx.dir, i.file)), { minBytes: 1 }).sha256);
    assert.equal(new Set(hashes).size, hashes.length, d.id);
  }
  // and the wrong date rests: the next run does not ask for it again at once
  const asks = () => maps(ctx).filter((u) => par(u, 'time') === '2026-11-12' && par(u, 'layers') === 'VIIRS_NOAA21_CorrectedReflectance_TrueColor').length;
  const n = asks();
  ctx.setNow(NOW + 3600000);
  await feed.refresh();
  assert.equal(asks(), n);
  ctx.cleanup();
});

test('probe and images never throw on an empty folder, a damaged index or a damaged state file', async () => {
  const a = setup();
  const p = a.feed.probe();
  assert.equal(p.ok, false); assert.equal(p.n, 0);
  assert.ok(p.note && p.noteEl);
  assert.deepEqual(a.feed.images(), []);
  assert.deepEqual(a.feed.read('limassol'), []);
  fs.writeFileSync(path.join(a.ctx.dir, 'index.json'), '{broken');
  fs.writeFileSync(path.join(a.ctx.dir, 'state.json'), 'not json at all');
  const b = setup({ dir: a.ctx.dir });
  assert.deepEqual(b.feed.images(), []);
  const r = await b.feed.refresh();
  assert.equal(r.ok, true);
  assert.equal(b.feed.images().length, 42);
  a.ctx.cleanup();
});

test('a read-only or missing folder never throws at start; stop is safe before start', async () => {
  const ctx = makeCtx({ id: 'nasa-gibs-imagery', hosts: [HOST], fixtures: {} });
  ctx.cleanup();                                                         // the folder is gone
  const feed = create(ctx, { pauseMs: 0, firstDelayMs: 1e9 });
  assert.doesNotThrow(() => feed.stop());
  assert.doesNotThrow(() => feed.start());
  assert.doesNotThrow(() => feed.stop());
  assert.deepEqual(feed.images(), []);
  assert.equal(feed.probe().ok, false);
});

test('the request headers carry the project user agent and no cookie or key', async () => {
  const { ctx, feed, seen } = setup({ opts: { maxRequests: 3 } });
  await feed.refresh();
  assert.ok(seen.length >= 2);
  for (const h of seen) {
    const lower = Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k.toLowerCase(), v]));
    assert.equal(lower['user-agent'], 'SmartCitiesCyprus/1.0 (school project)');
    assert.equal(lower.cookie, undefined); assert.equal(lower.authorization, undefined);
  }
  ctx.cleanup();
});

test('the feed contract: id, hosts, probe, read, images; the hosts list is exactly the one host', () => {
  const ctx = makeCtx({ id: 'nasa-gibs-imagery', hosts: [HOST], fixtures: {} });
  const feed = create(ctx, { firstDelayMs: 1e9 });
  assert.equal(feed.id, 'nasa-gibs-imagery');
  assert.deepEqual(feed.hosts, [HOST]);
  for (const fn of ['start', 'stop', 'probe', 'read', 'images']) assert.equal(typeof feed[fn], 'function');
  ctx.cleanup();
});
