'use strict';
/* Tests for satellite/feeds/eumetsat-meteosat-view.js against a fake EUMETView (tests/sat-imagery/helpers.js). No network.
 * Run:  node --test tests/sat-imagery/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeCtx, reply } = require('../../satellite/testing');
const create = require('../../satellite/feeds/eumetsat-meteosat-view');
const kit = require('../../satellite/lib/imagery');
const { fx, xmlException, eumFake } = require('./helpers');

const HOST = 'view.eumetsat.int';
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const NOW = Date.parse('2026-11-12T12:05:00Z');
const DEFS = create.DEFS;
const isoT = (ms) => new Date(ms).toISOString();
const slots = (endMs, stepMin, n) => Array.from({ length: n }, (_, i) => isoT(endMs - (n - 1 - i) * stepMin * MIN));

// the layers the fake service has, each with its newest times
function allTimes(now, over) {
  const newest = (step) => Math.floor((now - 10 * MIN) / (step * MIN)) * step * MIN;
  const t = {};
  for (const d of DEFS) for (const c of d.candidates) t[c.layer] = slots(newest(d.cadenceMin), d.cadenceMin, 6);
  return { ...t, ...(over || {}) };
}
function setup(cfg) {
  const c = cfg || {};
  const fakeCfg = { times: c.times || allTimes(c.now || NOW), ...(c.fake || {}) };
  const fake = eumFake(fakeCfg);
  const seen = [];
  const ctx = makeCtx({ id: 'eumetsat-meteosat-view', hosts: [HOST], now: c.now || NOW, dir: c.dir, fixtures: { [`https://${HOST}/*`]: (url, init) => { seen.push(init && init.headers); return c.wrap ? c.wrap(url, fake) : fake(url); } } });
  const feed = create(ctx, { pauseMs: 0, firstDelayMs: 1e9, ...(c.opts || {}) });
  // the fake keeps a reference to fakeCfg.times: change it in place to let the service "move on" to a later time
  const retime = (now) => { const n = allTimes(now); for (const k of Object.keys(fakeCfg.times)) delete fakeCfg.times[k]; Object.assign(fakeCfg.times, n); ctx.setNow(now); };
  return { ctx, feed, seen, fakeCfg, retime };
}
const maps = (ctx) => ctx.calls.filter((u) => /request=GetMap/i.test(u));
const capsCalls = (ctx) => ctx.calls.filter((u) => /request=GetCapabilities/i.test(u));
const par = (u, k) => new URL(u).searchParams.get(k);
const of = (feed, g) => feed.images().filter((i) => i.group === g);

test('the picture address: WMS 1.3.0, latitude first for EPSG:4326, the region, the coastline layers, the exact time', () => {
  const u = new URL(create.mapUrl('mtg_fd:rgb_geocolour', true, '2026-11-12T11:50:00.000Z'));
  assert.equal(u.origin + u.pathname, `https://${HOST}/geoserver/wms`);
  const p = u.searchParams;
  assert.equal(p.get('version'), '1.3.0');
  assert.equal(p.get('request'), 'GetMap');
  assert.equal(p.get('layers'), 'mtg_fd:rgb_geocolour,backgrounds:ne_10m_coastline,backgrounds:ne_boundary_lines_land');
  assert.equal(p.get('styles'), ',,');
  assert.equal(p.get('crs'), 'EPSG:4326');
  assert.equal(p.get('bbox'), '29,25,41,41');            // south, west, north, east
  assert.equal(p.get('width'), '1000'); assert.equal(p.get('height'), '916');
  assert.equal(p.get('format'), 'image/jpeg');
  assert.equal(p.get('time'), '2026-11-12T11:50:00.000Z');
  assert.equal(new URL(create.mapUrl('msg_iodc:rgb_dust', false, null)).searchParams.get('layers'), 'msg_iodc:rgb_dust');
  assert.equal(new URL(create.mapUrl('msg_iodc:rgb_dust', false, null)).searchParams.has('time'), false);
  assert.equal(create.capsUrl('msg_iodc'), `https://${HOST}/geoserver/msg_iodc/wms?service=WMS&version=1.3.0&request=GetCapabilities`);
  assert.equal(create.capsUrl(''), `https://${HOST}/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities`);
  assert.deepEqual(create.BBOX, [25, 29, 41, 41]);
  const km = (create.BBOX[2] - create.BBOX[0]) * Math.cos(35 * Math.PI / 180) / (create.BBOX[3] - create.BBOX[1]);
  assert.ok(Math.abs(1000 / 916 - km) < 0.03, `pixel shape ${1000 / 916} vs ground shape ${km}`);
});

test('two picture kinds, each with English and Greek text; only RGB image products are used', () => {
  assert.deepEqual(DEFS.map((d) => d.id), ['geocolour', 'dust']);
  for (const d of DEFS) {
    assert.match(d.text, /^Look for /); assert.match(d.textEl, /^Δες /);
    assert.ok(/\p{Script=Greek}/u.test(d.titleEl));
    assert.equal((d.text.match(/\. /g) || []).length, 0);
    for (const c of d.candidates) assert.match(c.layer, /:rgb_/, 'a single-channel layer would be a Level 1 product: ' + c.layer);
  }
});

test('first run: the newest listed time of each kind is requested exactly, stored, and described in images()', async () => {
  const { ctx, feed } = setup();
  const r = await feed.refresh();
  assert.equal(r.ok, true);
  assert.equal(r.stored, 2);
  const g = of(feed, 'geocolour'), d = of(feed, 'dust');
  assert.equal(g.length, 1); assert.equal(d.length, 1);
  assert.equal(g[0].id, 'geocolour-latest'); assert.equal(d[0].id, 'dust-latest');
  assert.equal(g[0].time, Date.parse('2026-11-12T11:50:00Z'));
  assert.equal(d[0].time, Date.parse('2026-11-12T11:45:00Z'));
  assert.equal(g[0].platform, 'Meteosat-12 (MTG, 0°)');
  assert.equal(d[0].platform, 'Meteosat (MSG, 45.5°E)');
  const asked = maps(ctx).map((u) => par(u, 'time'));
  assert.deepEqual(asked.sort(), ['2026-11-12T11:45:00.000Z', '2026-11-12T11:50:00.000Z']);
  for (const u of ctx.calls) assert.equal(new URL(u).host, HOST);
  for (const i of feed.images()) {
    assert.match(i.id, /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
    assert.equal(i.attribution, 'Contains modified EUMETSAT Meteosat data 2026; coastlines and borders: Natural Earth');
    assert.ok(i.attributionEl.startsWith(i.attribution) && /\p{Script=Greek}/u.test(i.attributionEl) && i.attributionEl.length <= 340);
    assert.deepEqual(i.bbox, [25, 29, 41, 41]);
    assert.match(i.text, / Satellite: .+\.$/); assert.match(i.textEl, / Δορυφόρος: .+\.$/);
    assert.equal(i.contentType, 'image/jpeg');
    const f = path.isAbsolute(i.file) ? i.file : path.join(ctx.dir, i.file);
    assert.equal(kit.validateImage(fs.readFileSync(f), { minBytes: 100 }).ok, true);
  }
  assert.ok(feed.probe().ok);
  assert.match(feed.probe().note, /2 of 2 kinds under 3 hours old/);
  ctx.cleanup();
});

test('the capabilities are asked of the workspace first; when that is refused the whole server answers and that way is remembered', async () => {
  const a = setup();
  await a.feed.refresh();
  assert.ok(capsCalls(a.ctx).every((u) => /\/geoserver\/(mtg_fd|msg_iodc)\/wms\?/.test(u)));
  assert.equal(a.feed._t.state.capsMode, 'ws');
  a.ctx.cleanup();
  const b = setup({ fake: { capsMode: 'global' } });
  const r = await b.feed.refresh();
  assert.equal(r.stored, 2);
  assert.equal(b.feed._t.state.capsMode, 'global');
  const first = capsCalls(b.ctx);
  assert.ok(/\/geoserver\/mtg_fd\/wms\?/.test(first[0]) && /\/geoserver\/wms\?/.test(first[1]));
  // the next run (new folder state kept) asks the whole server first; and its answer covers both workspaces at once
  b.retime(NOW + 3 * HOUR);
  const n = capsCalls(b.ctx).length;
  await b.feed.refresh();
  const later = capsCalls(b.ctx).slice(n);
  assert.equal(later.length, 1);
  assert.match(later[0], /\/geoserver\/wms\?/);
  assert.equal(of(b.feed, 'geocolour')[0].time, Date.parse('2026-11-12T14:50:00Z'));
  b.ctx.cleanup();
});

test('no capabilities anywhere (404): the newest picture is asked for without TIME and the time is marked approximate', async () => {
  const { ctx, feed } = setup({ fake: { capsMode: 'neither' } });
  const r = await feed.refresh();
  assert.equal(r.stored, 2);
  for (const u of maps(ctx)) assert.equal(new URL(u).searchParams.has('time'), false);
  const g = of(feed, 'geocolour')[0];
  assert.equal(g.time, Date.parse('2026-11-12T11:30:00Z'));     // 30 minutes behind, on the 10-minute grid
  assert.match(g.text, /The time is approximate\.$/);
  assert.match(g.textEl, /Η ώρα είναι κατά προσέγγιση\.$/);
  assert.equal(of(feed, 'dust')[0].time, Date.parse('2026-11-12T11:30:00Z'));   // 15-minute grid: 11:30
  ctx.cleanup();
});

test('capabilities busy (503 with Retry-After): the run stops at once, no picture request is made, the pause is passed on', async () => {
  const { ctx, feed } = setup({ fake: { capsMode: 'none' } });
  const r = await feed.refresh();
  assert.equal(r.ok, false);
  assert.ok(r.retryInMs >= 120000, String(r.retryInMs));
  assert.equal(maps(ctx).length, 0);
  assert.equal(capsCalls(ctx).length, 1);
  assert.equal(feed.probe().ok, false);
  ctx.cleanup();
});

test('the listed time is refused (XML exception with HTTP 200): one more try without TIME, marked approximate, never a bad file', async () => {
  const { ctx, feed } = setup({ fake: { timeRefused: true } });
  await feed.refresh();
  const g = of(feed, 'geocolour');
  assert.equal(g.length, 1);
  assert.match(g[0].text, /approximate/);
  assert.equal(maps(ctx).filter((u) => /geocolour/.test(par(u, 'layers'))).length, 2);
  assert.ok(feed._t.state.lastError === '' || typeof feed._t.state.lastError === 'string');
  for (const f of fs.readdirSync(ctx.dir)) if (/\.jpg$/.test(f)) assert.equal(kit.validateImage(fs.readFileSync(path.join(ctx.dir, f)), { minBytes: 100 }).ok, true);
  ctx.cleanup();
});

test('a layer the service does not list is skipped at once, the next one is used; the skip is remembered for a day', async () => {
  const times = allTimes(NOW);
  delete times['mtg_fd:rgb_geocolour']; delete times['msg_iodc:rgb_dust'];
  const { ctx, feed } = setup({ times });
  await feed.refresh();
  assert.equal(of(feed, 'geocolour')[0].layer, 'mtg_fd:rgb_truecolour');
  assert.equal(of(feed, 'dust')[0].layer, 'msg_fes:rgb_dust');
  assert.equal(of(feed, 'dust')[0].platform, 'Meteosat (MSG, 0°)');
  assert.ok(ctx.logs.some((l) => /mtg_fd:rgb_geocolour is skipped for a day/.test(l)));
  assert.ok(feed._t.state.bad['mtg_fd:rgb_geocolour'] > NOW + 20 * HOUR);
  ctx.cleanup();
});

test('a layer the service refuses at request time (LayerNotDefined, HTTP 200) is skipped; an overlay the service does not know is dropped', async () => {
  const times = allTimes(NOW);
  const a = setup({ times, fake: { capsMode: 'neither' } });
  const bad = (url, fake) => (/request=GetMap/i.test(url) && par(url, 'layers').startsWith('mtg_fd:rgb_geocolour') ? reply(200, xmlException('LayerNotDefined', 'Could not find layer mtg_fd:rgb_geocolour'), { 'content-type': 'text/xml' }) : fake(url));
  const b = setup({ times, fake: { capsMode: 'neither' }, wrap: bad });
  await b.feed.refresh();
  assert.equal(of(b.feed, 'geocolour')[0].layer, 'mtg_fd:rgb_truecolour');
  a.ctx.cleanup(); b.ctx.cleanup();
  // the coastline layers are unknown: asked again without them, the credit then names no Natural Earth, and they rest for a day
  const c = setup({ fake: { noOverlay: true } });
  await c.feed.refresh();
  assert.equal(of(c.feed, 'geocolour').length, 1);
  for (const i of c.feed.images()) assert.equal(i.attribution, 'Contains modified EUMETSAT Meteosat data 2026');
  assert.equal(maps(c.ctx).filter((u) => /ne_10m_coastline/.test(par(u, 'layers'))).length, 1);   // asked with them once, then not again
  c.ctx.cleanup();
});

test('a late layer (newest frame older than 6 hours) is passed over for a fresh one; if all are late the least-late first choice is still shown', async () => {
  const late = slots(NOW - 9 * HOUR, 15, 6);
  const a = setup({ times: allTimes(NOW, { 'msg_iodc:rgb_dust': late }) });
  await a.feed.refresh();
  assert.equal(of(a.feed, 'dust')[0].layer, 'msg_fes:rgb_dust');
  a.ctx.cleanup();
  const t = allTimes(NOW);
  for (const c of DEFS[1].candidates) t[c.layer] = slots(NOW - 9 * HOUR, 15, 6);
  const b = setup({ times: t });
  await b.feed.refresh();
  const d = of(b.feed, 'dust');
  assert.equal(d.length, 1);
  assert.equal(d[0].layer, 'msg_iodc:rgb_dust');
  assert.ok(NOW - d[0].time > 6 * HOUR);                         // it shows its real (old) time; nothing pretends it is new
  assert.match(b.feed.probe().note, /1 of 2 kinds under 3 hours old/);
  b.ctx.cleanup();
});

test('bad answers are never stored: XML exception with HTTP 200, truncated picture, HTML page, oversize, an empty body', async () => {
  const cases = [
    () => reply(200, xmlException('InvalidParameterValue', 'something odd'), { 'content-type': 'application/vnd.ogc.se_xml' }),
    () => reply(200, fx('region-1000x916.jpg').subarray(0, 12000), { 'content-type': 'image/jpeg' }),
    () => reply(200, '<html><body>maintenance</body></html>', { 'content-type': 'text/html' }),
    () => reply(200, Buffer.concat([fx('region-1000x916.jpg'), Buffer.alloc(2 * 1024 * 1024)]), { 'content-type': 'image/jpeg' }),
    () => reply(200, Buffer.alloc(0), { 'content-type': 'image/jpeg' }),
  ];
  for (const [k, make] of cases.entries()) {
    const wrap = (url, fake) => (/request=GetMap/i.test(url) ? make() : fake(url));
    const { ctx, feed } = setup({ wrap });
    await feed.refresh();
    assert.equal(feed.images().length, 0, 'case ' + k);
    assert.equal(fs.readdirSync(ctx.dir).filter((f) => /\.(jpg|png|tmp)$/.test(f)).length, 0, 'case ' + k);
    assert.equal(feed.probe().ok, false);
    ctx.cleanup();
  }
});

test('a picture whose pixel size is wrong is refused (a service that ignores the size is not trusted)', async () => {
  const wrap = (url, fake) => (/request=GetMap/i.test(url) ? reply(200, fx('cyprus-1000x633.jpg'), { 'content-type': 'image/jpeg' }) : fake(url));
  const { ctx, feed } = setup({ wrap });
  await feed.refresh();
  assert.equal(feed.images().length, 0);
  ctx.cleanup();
});

test('HTTP 429 and 503 on a picture: the run stops, nothing is hammered, Retry-After is passed on', async () => {
  for (const [status, hdr] of [[429, { 'retry-after': '900' }], [503, {}]]) {
    const wrap = (url, fake) => (/request=GetMap/i.test(url) ? reply(status, 'no', hdr) : fake(url));
    const { ctx, feed } = setup({ wrap });
    const r = await feed.refresh();
    assert.equal(r.ok, false);
    assert.equal(maps(ctx).length, 1, 'status ' + status);
    if (status === 429) assert.ok(r.retryInMs >= 900000);
    ctx.cleanup();
  }
});

test('nothing is asked while the newest frame is younger than the layer rhythm; a new frame is fetched once there is one; the capabilities are cached', async () => {
  const a = setup();
  await a.feed.refresh();
  const n = a.ctx.calls.length;
  a.ctx.setNow(NOW + 5 * MIN);                                   // younger than 10 and 15 minutes after the newest frame? newest frames are 15-20 min old, so ask
  await a.feed.refresh();
  // geocolour newest is 11:50, now 12:10 -> older than 10 min: capabilities (cached, 5 min < 20 min) say nothing newer: no picture request
  assert.equal(maps(a.ctx).length, 2);
  // 25 minutes later the service has new frames: the capabilities cache has expired, one new request each
  a.retime(NOW + 40 * MIN);
  await a.feed.refresh();
  assert.equal(maps(a.ctx).length, 4);
  assert.equal(of(a.feed, 'geocolour')[0].time, Date.parse('2026-11-12T12:30:00Z'));
  assert.ok(a.ctx.calls.length > n);
  // right after storing: nothing to do
  const m = a.ctx.calls.length;
  a.ctx.setNow(NOW + 42 * MIN);
  await a.feed.refresh();
  assert.equal(a.ctx.calls.length, m);
  a.ctx.cleanup();
});

test('the same picture again under a new time is not stored twice', async () => {
  const fixed = fx('region-1000x916.jpg');
  const wrap = (url, fake) => (/request=GetMap/i.test(url) ? reply(200, fixed, { 'content-type': 'image/jpeg' }) : fake(url));
  const a = setup({ wrap });
  await a.feed.refresh();
  assert.equal(of(a.feed, 'geocolour').length, 1);
  a.retime(NOW + 40 * MIN);
  const r = await a.feed.refresh();
  assert.equal(r.stored, 0);
  assert.equal(of(a.feed, 'geocolour')[0].time, Date.parse('2026-11-12T11:50:00Z'));
  a.ctx.cleanup();
});

test('keepFrames (retention rule, pure): the newest frame and the first frame in the 10:30-14:30 UTC window of each of the last 7 dates', () => {
  const list = [];
  const start = Date.parse('2026-11-01T00:00:00Z'), end = Date.parse('2026-11-12T12:00:00Z');
  for (let t = start; t <= end; t += 30 * MIN) list.push({ id: 'geocolour--' + create.frameKey(t), group: 'geocolour', time: t });
  list.push({ id: 'other--x', group: 'other', time: end });
  const keep = create.keepFrames(list, DEFS);
  const kept = list.filter((e) => keep.has(e.id));
  assert.equal(kept.filter((e) => e.group === 'other').length, 0);
  const g = kept.filter((e) => e.group === 'geocolour');
  assert.equal(g.length, 8);                                    // 7 days + the newest
  assert.ok(keep.has('geocolour--' + create.frameKey(end)));
  const days = g.filter((e) => e.time !== end).map((e) => new Date(e.time).toISOString());
  assert.deepEqual(days, ['2026-11-06T10:30:00.000Z', '2026-11-07T10:30:00.000Z', '2026-11-08T10:30:00.000Z', '2026-11-09T10:30:00.000Z', '2026-11-10T10:30:00.000Z', '2026-11-11T10:30:00.000Z', '2026-11-12T10:30:00.000Z']);
  // frames outside the window are never "the daily frame"; a day with only early frames has none
  const lone = [{ id: 'a', group: 'geocolour', time: Date.parse('2026-11-10T03:00:00Z') }, { id: 'b', group: 'geocolour', time: Date.parse('2026-11-12T03:00:00Z') }];
  assert.deepEqual([...create.keepFrames(lone, DEFS)], ['b']);
  assert.equal(create.keepFrames([], DEFS).size, 0);
  assert.equal(create.frameKey(Date.parse('2026-11-12T10:30:00Z')), '20261112t1030');
});

test('a nine-day simulation: runs every hour; the folder ends with the newest frame and one midday frame for each of 7 days, per kind; older files are gone', async () => {
  const start = Date.parse('2026-11-03T00:05:00Z');
  const times = allTimes(start);
  const ctx = makeCtx({ id: 'eumetsat-meteosat-view', hosts: [HOST], now: start, fixtures: { [`https://${HOST}/*`]: (u) => fake(u) } });
  const fake = eumFake({ times });
  const feed = create(ctx, { pauseMs: 0, firstDelayMs: 1e9 });
  let maxFiles = 0;
  for (let t = start; t <= start + 9 * DAY; t += HOUR) {
    ctx.setNow(t);
    Object.assign(times, allTimes(t));
    await feed.refresh();
    maxFiles = Math.max(maxFiles, fs.readdirSync(ctx.dir).filter((f) => /\.jpg$/.test(f)).length);
  }
  for (const g of ['geocolour', 'dust']) {
    const l = of(feed, g);
    assert.equal(l.length, 8, g + ' ' + l.map((i) => i.id).join());
    assert.equal(l.filter((i) => i.latest).length, 1);
    const daily = l.filter((i) => !i.latest);
    assert.equal(new Set(daily.map((i) => i.day)).size, daily.length);
    for (const i of daily) { const s = i.time % DAY; assert.ok(s >= 10.5 * HOUR && s < 14.5 * HOUR, isoT(i.time)); }
    assert.ok(l[0].time >= start + 9 * DAY - 2 * HOUR);
    assert.ok(Math.min(...l.map((i) => i.time)) >= start + 9 * DAY - 8 * DAY, 'nothing older than the week stays');
    assert.equal(new Set(l.map((i) => i.id)).size, l.length);
  }
  const files = fs.readdirSync(ctx.dir).filter((f) => /\.jpg$/.test(f));
  assert.equal(files.length, 16);
  assert.ok(maxFiles <= 18, 'the folder never grew beyond ' + maxFiles);
  ctx.cleanup();
});

test('the size cap: the folder stays under the cap, the newest frame of each kind is never removed', async () => {
  const start = Date.parse('2026-11-03T00:05:00Z');
  const times = allTimes(start);
  const fake = eumFake({ times });
  const ctx = makeCtx({ id: 'eumetsat-meteosat-view', hosts: [HOST], now: start, fixtures: { [`https://${HOST}/*`]: (u) => fake(u) } });
  const feed = create(ctx, { pauseMs: 0, firstDelayMs: 1e9, maxBytes: 60 * 1024 });
  for (let t = start; t <= start + 5 * DAY; t += HOUR) { ctx.setNow(t); Object.assign(times, allTimes(t)); await feed.refresh(); }
  const bytes = fs.readdirSync(ctx.dir).filter((f) => /\.jpg$/.test(f)).reduce((n, f) => n + fs.statSync(path.join(ctx.dir, f)).size, 0);
  assert.ok(bytes <= 60 * 1024 + 500, String(bytes));
  for (const g of ['geocolour', 'dust']) { const l = of(feed, g); assert.ok(l.length >= 1); assert.equal(l[0].latest, true); }
  ctx.cleanup();
});

test('a restart on the same folder does not fetch again; the state and index damaged are survived; start/stop never throw', async () => {
  const a = setup();
  await a.feed.refresh();
  const b = setup({ dir: a.ctx.dir });
  assert.equal(b.feed.images().length, 2);
  await b.feed.refresh();
  assert.equal(b.ctx.calls.length, 0);
  fs.writeFileSync(path.join(a.ctx.dir, 'state.json'), '}}}');
  fs.writeFileSync(path.join(a.ctx.dir, 'index.json'), '{{{');
  const c = setup({ dir: a.ctx.dir });
  assert.deepEqual(c.feed.images(), []);
  assert.equal(c.feed.probe().ok, false);
  assert.deepEqual(c.feed.read('limassol'), []);
  const r = await c.feed.refresh();
  assert.equal(r.ok, true);
  assert.equal(c.feed.images().length, 2);
  const gone = makeCtx({ id: 'eumetsat-meteosat-view', hosts: [HOST], fixtures: {} });
  gone.cleanup();
  const d = create(gone, { pauseMs: 0, firstDelayMs: 1e9 });
  assert.doesNotThrow(() => { d.stop(); d.start(); d.stop(); });
  assert.deepEqual(d.images(), []);
  a.ctx.cleanup();
});

test('the loop backs off after a failed run and the project user agent goes out with every request, with no cookie or key', async () => {
  const wrap = (url, fake) => (/request=GetMap/i.test(url) ? reply(503, 'busy') : fake(url));
  const { ctx, feed, seen } = setup({ wrap, opts: { firstDelayMs: 10 } });
  feed.start();
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(feed._t.loop.fails >= 1);
  assert.ok(feed._t.loop.nextInMs >= 9 * 60000 && feed._t.loop.nextInMs <= 11 * 60000, String(feed._t.loop.nextInMs));
  feed.stop();
  assert.ok(seen.length >= 2);
  for (const h of seen) {
    const lower = Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k.toLowerCase(), v]));
    assert.equal(lower['user-agent'], 'SmartCitiesCyprus/1.0 (school project)');
    assert.equal(lower.cookie, undefined); assert.equal(lower.authorization, undefined);
  }
  ctx.cleanup();
});

test('politeness: one request at a time with a pause between them (default 2 s)', async () => {
  assert.equal(create(makeCtx({ id: 'eumetsat-meteosat-view', hosts: [HOST], fixtures: {} }))._t.o.pauseMs, 2000);
  let inflight = 0, most = 0; const stamps = [];
  const wrap = (url, fake) => { inflight++; most = Math.max(most, inflight); stamps.push(Date.now()); const r = fake(url); inflight--; return r; };
  const { ctx, feed } = setup({ wrap, opts: { pauseMs: 30 } });
  const keep = setInterval(() => {}, 1000);
  await feed.refresh();
  clearInterval(keep);
  assert.equal(most, 1);
  assert.ok(stamps.length >= 4);
  assert.ok(stamps.slice(1).every((t, i) => t - stamps[i] >= 0));
  const gaps = stamps.slice(1).map((t, i) => t - stamps[i]).filter((g) => g >= 20);
  assert.ok(gaps.length >= 2, 'pauses seen: ' + gaps.join());
  ctx.cleanup();
});

test('SATELLITE_IMAGERY_* environment names tune the pause, the first delay and the folder cap', () => {
  const ctx = makeCtx({ id: 'eumetsat-meteosat-view', hosts: [HOST], fixtures: {}, env: { SATELLITE_IMAGERY_PAUSE_MS: '0', SATELLITE_IMAGERY_FIRST_DELAY_MS: '500', SATELLITE_IMAGERY_MAX_MB: '3' } });
  const feed = create(ctx);
  assert.equal(feed._t.o.pauseMs, 0);
  assert.equal(feed._t.o.maxBytes, 3 * 1024 * 1024);
  assert.equal(feed._t.o.firstDelayMs, 500);
  assert.ok(create(makeCtx({ id: 'eumetsat-meteosat-view', hosts: [HOST], fixtures: {} }))._t.o.firstDelayMs > 25000);   // by default later than the NASA feed (25 s), so the two do not start together
  ctx.cleanup();
});

test('the feed contract: id, hosts, probe, read, images, and an empty folder answers calmly', () => {
  const ctx = makeCtx({ id: 'eumetsat-meteosat-view', hosts: [HOST], fixtures: {} });
  const feed = create(ctx, { firstDelayMs: 1e9 });
  assert.equal(feed.id, 'eumetsat-meteosat-view');
  assert.deepEqual(feed.hosts, [HOST]);
  for (const fn of ['start', 'stop', 'probe', 'read', 'images']) assert.equal(typeof feed[fn], 'function');
  const p = feed.probe();
  assert.equal(p.ok, false); assert.ok(p.note && p.noteEl);
  assert.deepEqual(feed.images(), []);
  ctx.cleanup();
});
