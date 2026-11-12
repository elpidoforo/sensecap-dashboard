'use strict';
/* The two feeds inside the real satellite registry (satellite/index.js), with a fake network, and their source files.
 * Run:  node --test tests/sat-imagery/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSatellite } = require('../../satellite');
const { Reply } = require('../../satellite/testing');
const { loadRegister } = require('../../layers');
const { gibsFake, eumFake } = require('./helpers');
const gibs = require('../../satellite/feeds/nasa-gibs-imagery');
const eum = require('../../satellite/feeds/eumetsat-meteosat-view');

const ROOT = path.join(__dirname, '..', '..');
const GIBS = 'gibs.earthdata.nasa.gov', EUM = 'view.eumetsat.int';
const IDS = ['nasa-gibs-imagery', 'eumetsat-meteosat-view'];

/* ---------------------------------------------------------------- the source files */
test('both source files are valid, say "pictures, not numbers", and carry a licence that was checked', () => {
  const reg = loadRegister(ROOT);
  for (const id of IDS) {
    assert.equal(reg.problems.filter((p) => p.file === id + '.json').length, 0, id);
    const l = reg.layers.find((x) => x.src.id === id);
    assert.ok(l, id + ' is registered');
    const s = l.src;
    assert.deepEqual(s.variables, []);
    assert.equal(s.quality.kind, 'satellite');
    assert.equal(s.status, 'active');
    assert.equal(s.access.auth.type, 'none');
    assert.ok(s.licence.id && s.licence.id !== 'unknown', 'the licence was read from the provider: ' + s.licence.id);
    assert.ok(s.licence.url && /^https:\/\//.test(s.licence.url));
    assert.match(s.licence.checked_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(s.licence.attribution && s.licence.attribution.length <= 160);
    assert.deepEqual(l.warnings.filter((w) => /licence is unknown/.test(w)), []);
    assert.ok(s.i18n && s.i18n.el && s.i18n.el.name && s.i18n.el.summary, id + ' has a Greek name and summary');
    assert.ok(Array.isArray(s.x_images) && s.x_images.length >= 2);
    const text = JSON.stringify(s);
    assert.doesNotMatch(text, /coolstar|api[_-]?key=|password/i);
  }
  const g = reg.layers.find((x) => x.src.id === IDS[0]).src, e = reg.layers.find((x) => x.src.id === IDS[1]).src;
  assert.deepEqual(g.x_images, gibs.DEFS.map((d) => d.id));
  assert.deepEqual(e.x_images, eum.DEFS.map((d) => d.id));
  assert.match(g.access.url, new RegExp('^https://' + GIBS.replace(/\./g, '\\.')));
  assert.match(e.access.url, new RegExp('^https://' + EUM.replace(/\./g, '\\.')));
});

test('every text a student can read is within the registry limits (title 140/160, text 500/600, attribution 300)', () => {
  for (const d of [...gibs.DEFS, ...eum.DEFS]) {
    for (const c of d.candidates) {
      const t = d.title, te = d.titleEl, x = (c.text || d.text), xe = (c.textEl || d.textEl);
      const suffixEn = ` Satellite: ${c.platform}.`, suffixEl = ` Δορυφόρος: ${c.platform}. Η ώρα είναι κατά προσέγγιση.`;
      assert.ok((c.title || t).length <= 140 && (c.titleEl || te).length <= 160, d.id);
      assert.ok((x + suffixEn + ' The time is approximate.').length <= 500, d.id + ' ' + (x + suffixEn).length);
      assert.ok((xe + suffixEl).length <= 600, d.id + ' ' + (xe + suffixEl).length);
    }
  }
  assert.ok(gibs.ATTRIBUTION.length <= 300);
});

/* ---------------------------------------------------------------- inside the registry */
function toResponse(v) {
  const r = v instanceof Reply ? v : new Reply(200, v);
  const headers = { ...r.headers };
  return new Response(r.status === 204 ? null : r.body, { status: r.status, headers });
}
function wrappers() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-imagery-feeds-'));
  for (const id of IDS) fs.writeFileSync(path.join(dir, id + '.js'), `module.exports = require(${JSON.stringify(path.join(ROOT, 'satellite', 'feeds', id + '.js'))});\n`);
  return dir;
}
const today = () => new Date().toISOString().slice(0, 10);

async function waitFor(fn, ms) {
  const end = Date.now() + (ms || 6000);
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('inside the registry: the feeds start, fetch through the registry network layer (exact hosts only), and show up with public image addresses', async () => {
  const gf = gibsFake({ latest: (() => { const o = {}; for (const d of gibs.DEFS) for (const c of d.candidates) for (const l of c.layers) o[l] = c.static ? null : today(); o.Coastlines = today(); return o; })() });
  const times = (() => { const t = {}; const n = (s) => Math.floor((Date.now() - 10 * 60000) / (s * 60000)) * s * 60000; for (const d of eum.DEFS) for (const c of d.candidates) t[c.layer] = Array.from({ length: 6 }, (_, i) => new Date(n(d.cadenceMin) - (5 - i) * d.cadenceMin * 60000).toISOString()); return t; })();
  const ef = eumFake({ times });
  const asked = [];
  const transport = async (url, init) => {
    asked.push(new URL(url).host);
    const h = new URL(url).host;
    if (h === GIBS) return toResponse(gf(url));
    if (h === EUM) return toResponse(ef(url));
    return new Response('no', { status: 404 });
  };
  const logs = [];
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-imagery-data-'));
  const sat = createSatellite({
    root: ROOT, dataDir, feedsDir: wrappers(), transport, log: (m) => logs.push(m),
    env: { SATELLITE_IMAGERY_PAUSE_MS: '0', SATELLITE_IMAGERY_FIRST_DELAY_MS: '5', SATELLITE_IMAGERY_MAX_MB: '25' },
  });
  try {
    assert.deepEqual(sat.ids().sort(), IDS.slice().sort());
    sat.start();
    // (the registry keeps its picture list for 10 s, so wait for the files, then ask once)
    const files = (id) => { try { return fs.readdirSync(path.join(dataDir, 'satellite', id)).filter((f) => /\.(jpg|png)$/.test(f)).length; } catch (e) { return 0; } };
    assert.ok(await waitFor(() => files(IDS[0]) >= 42 && files(IDS[1]) >= 2, 15000), 'pictures arrived; logs: ' + logs.join(' | '));
    await new Promise((r) => setTimeout(r, 50));
    const list = await sat.images();
    assert.ok(list.filter((i) => i.feed === IDS[0]).length >= 5 && list.filter((i) => i.feed === IDS[1]).length === 2, list.map((i) => i.id).join());
    for (const h of asked) assert.ok(h === GIBS || h === EUM, h);
    for (const i of list) {
      assert.match(i.url, /^\/api\/satellite\/image\/(nasa-gibs-imagery|eumetsat-meteosat-view)\/[A-Za-z0-9_-]+$/);
      assert.ok(i.title && i.titleEl && i.text && i.textEl && i.attribution);
      assert.ok(i.bytes > 1000 && i.bytes < 2 * 1024 * 1024);
      assert.ok(Array.isArray(i.bbox) && i.bbox.length === 4);
    }
    // the registry shows at most 12 pictures per feed (the newest); the feeds hold more
    assert.ok(list.filter((i) => i.feed === IDS[0]).length <= 12);
    // an image can be fetched through the registry, and its bytes are the stored file
    const one = list.find((i) => i.feed === IDS[1]);
    const f = await sat.imageFile(one.feed, one.id);
    assert.ok(f && f.file && f.contentType === 'image/jpeg' && f.size === one.bytes);
    assert.equal(fs.readFileSync(f.file).subarray(0, 2).toString('hex'), 'ffd8');
    // names that are not in the list give nothing; a path tries to escape and gets nothing
    assert.equal(await sat.imageFile(IDS[0], 'nope'), null);
    assert.equal(await sat.imageFile(IDS[0], '../../etc/passwd'), null);
    assert.equal(await sat.imageFile('../x', one.id), null);
    // probes
    for (const id of IDS) { const p = await sat.probe(id); assert.equal(p.ok, true, id + ' ' + p.note); assert.ok(p.n > 0 && p.note && p.noteEl); }
    // status carries no path and no secret
    const st = JSON.stringify(await sat.status());
    assert.ok(!st.includes(dataDir));
    // nothing logged looks like trouble at startup
    assert.deepEqual(logs.filter((l) => /could not load|failed/.test(l)), []);
  } finally { sat.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('inside the registry: a network that is down never throws at start, logs one short line, and the feeds report "no picture yet"', async () => {
  const transport = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  const logs = [];
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-imagery-data-'));
  const sat = createSatellite({ root: ROOT, dataDir, feedsDir: wrappers(), transport, log: (m) => logs.push(m), env: { SATELLITE_IMAGERY_PAUSE_MS: '0', SATELLITE_IMAGERY_FIRST_DELAY_MS: '5' } });
  try {
    sat.start();
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(await sat.images(), []);
    for (const id of IDS) { const p = await sat.probe(id); assert.equal(p.ok, false); assert.ok(p.note && p.noteEl); }
    const st = await sat.status();
    assert.ok(st);
    assert.ok(logs.length <= 6, logs.join(' | '));
    for (const l of logs) assert.ok(l.length < 400 && !/\n/.test(l));
  } finally { sat.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('inside the registry: a host that is not the feed\'s own is refused by the network layer, so a redirect cannot send us elsewhere', async () => {
  const transport = async (url) => {
    const h = new URL(url).host;
    if (h === GIBS) return new Response(null, { status: 302, headers: { location: 'https://evil.example.net/x.png' } });
    return new Response('no', { status: 404 });
  };
  const seen = [];
  const t2 = async (url, init) => { seen.push(new URL(url).host); return transport(url, init); };
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-imagery-data-'));
  const sat = createSatellite({ root: ROOT, dataDir, feedsDir: wrappers(), transport: t2, log: () => {}, env: { SATELLITE_IMAGERY_PAUSE_MS: '0', SATELLITE_IMAGERY_FIRST_DELAY_MS: '5' } });
  try {
    sat.start();
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(!seen.includes('evil.example.net'));
    assert.deepEqual(await sat.images(), []);
  } finally { sat.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
