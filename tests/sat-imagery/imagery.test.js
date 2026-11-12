'use strict';
/* Unit tests for satellite/lib/imagery.js: picture validation, atomic writes, the picture store (retention, size cap, clean-up),
 * the schedule and the capabilities reader. Run:  node --test tests/sat-imagery/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const kit = require('../../satellite/lib/imagery');
const { fx, variant, xmlException } = require('./helpers');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'imagery-test-'));

test('valid pictures are accepted: PNG (RGB, palette, RGBA) and JPEG (baseline, progressive)', () => {
  for (const f of ['ok.png', 'ok-palette.png', 'ok-rgba.png', 'ok.jpg', 'ok-progressive.jpg']) {
    const r = kit.validateImage(fx(f), { minBytes: 100 });
    assert.equal(r.ok, true, f);
    assert.equal(r.width, 64); assert.equal(r.height, 40);
    assert.match(r.sha256, /^[0-9a-f]{64}$/);
  }
  assert.equal(kit.validateImage(fx('ok.png'), { minBytes: 100 }).contentType, 'image/png');
  assert.equal(kit.validateImage(fx('ok.jpg'), { minBytes: 100 }).contentType, 'image/jpeg');
});

test('an XML exception document that arrives with HTTP 200 is not a picture, and its code is reported', () => {
  const r = kit.validateImage(Buffer.from(xmlException('LayerNotDefined', 'Invalid layer(s) given in the LAYERS parameter.')), { contentType: 'application/vnd.ogc.se_xml' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'service-exception');
  assert.equal(r.code, 'LayerNotDefined');
  assert.match(r.detail, /Invalid layer/);
  // the same text with an image content type is still refused: the bytes decide
  assert.equal(kit.validateImage(Buffer.from(xmlException('X', 'y')), { contentType: 'image/png' }).reason, 'service-exception');
});

test('HTML, JSON, plain text and empty answers are refused with a plain reason', () => {
  assert.equal(kit.validateImage(Buffer.from('<html><body>502 Bad Gateway</body></html>'), { contentType: 'text/html' }).reason, 'not-image');
  assert.equal(kit.validateImage(Buffer.from('{"error":"nope"}'), {}).reason, 'not-image');
  assert.equal(kit.validateImage(Buffer.from('hello'), {}).reason, 'not-image');
  assert.equal(kit.validateImage(Buffer.alloc(0), {}).reason, 'empty');
  assert.equal(kit.validateImage(null, {}).reason, 'empty');
});

test('a real picture with a text content type is refused, octet-stream and no type are fine', () => {
  const png = fx('ok.png');
  assert.equal(kit.validateImage(png, { contentType: 'text/xml', minBytes: 1 }).reason, 'not-image');
  assert.equal(kit.validateImage(png, { contentType: 'application/json', minBytes: 1 }).reason, 'not-image');
  assert.equal(kit.validateImage(png, { contentType: 'application/octet-stream', minBytes: 1 }).ok, true);
  assert.equal(kit.validateImage(png, { minBytes: 1 }).ok, true);
  assert.equal(kit.validateImage(png, { contentType: 'image/jpeg; charset=x', minBytes: 1 }).type, 'png');   // the bytes decide the type
});

test('truncated pictures are refused at every cut point (PNG and JPEG)', () => {
  let tried = 0;
  for (const f of ['ok.png', 'ok-palette.png', 'ok-rgba.png', 'ok.jpg', 'ok-progressive.jpg', 'cyprus-1000x633.jpg', 'cyprus-1000x633.png']) {
    const b = fx(f);
    const step = Math.max(1, Math.floor(b.length / 150));
    for (let cut = 1; cut < b.length; cut += step) {
      tried++;
      const r = kit.validateImage(b.subarray(0, cut), { minBytes: 1 });
      assert.equal(r.ok, false, `${f} cut at ${cut} of ${b.length} was accepted`);
    }
    // one byte short of the end too
    assert.equal(kit.validateImage(b.subarray(0, b.length - 1), { minBytes: 1 }).ok, false, f + ' minus one byte');
  }
  assert.ok(tried > 500);
});

test('a damaged PNG (a flipped byte, extra bytes) is refused', () => {
  const b = Buffer.from(fx('ok.png'));
  b[60] ^= 0xff;
  assert.equal(kit.validateImage(b, { minBytes: 1 }).reason, 'corrupt');
  assert.equal(kit.validateImage(Buffer.concat([fx('ok.png'), Buffer.from('xx')]), { minBytes: 1 }).reason, 'corrupt');
  assert.equal(kit.validateImage(Buffer.concat([fx('ok.jpg'), Buffer.from('xx')]), { minBytes: 1 }).reason, 'truncated');   // no end marker where it must be
});

test('size rules: oversize, too small, and the wrong pixel size', () => {
  const big = Buffer.concat([fx('cyprus-1000x633.jpg'), Buffer.alloc(2 * 1024 * 1024)]);
  assert.equal(kit.validateImage(big, {}).reason, 'too-big');
  assert.equal(kit.validateImage(fx('cyprus-1000x633.jpg'), { maxBytes: 1000 }).reason, 'too-big');
  assert.equal(kit.validateImage(fx('ok.png'), { minBytes: 5000 }).reason, 'too-small');
  assert.equal(kit.validateImage(fx('cyprus-1000x633.jpg'), { width: 1000, height: 633 }).ok, true);
  assert.equal(kit.validateImage(fx('cyprus-1000x633.jpg'), { width: 800, height: 600 }).reason, 'dimensions');
  assert.equal(kit.validateImage(fx('cyprus-1000x633.png'), { width: 1000, height: 600 }).reason, 'dimensions');
  assert.equal(kit.validateImage(fx('cyprus-1000x633.jpg'), { maxPixels: 1000 }).reason, 'dimensions');
});

test('writeFileAtomic leaves no temp file and never a half file; a failed write keeps the old file', () => {
  const dir = tmp();
  const f = path.join(dir, 'a.bin');
  kit.writeFileAtomic(f, Buffer.from('first'));
  assert.equal(fs.readFileSync(f, 'utf8'), 'first');
  kit.writeFileAtomic(f, 'second');
  assert.equal(fs.readFileSync(f, 'utf8'), 'second');
  assert.deepEqual(fs.readdirSync(dir), ['a.bin']);
  // a folder that does not exist: the call throws and nothing is left
  assert.throws(() => kit.writeFileAtomic(path.join(dir, 'missing', 'x.bin'), 'x'));
  assert.deepEqual(fs.readdirSync(dir), ['a.bin']);
  // renaming onto a directory fails: the old contents stay, the temp file is removed
  fs.mkdirSync(path.join(dir, 'd'));
  assert.throws(() => kit.writeFileAtomic(path.join(dir, 'd'), 'x'));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['a.bin', 'd']);
  fs.rmSync(dir, { recursive: true });
});

test('the store: put, reload from disk, replace, remove', () => {
  const dir = tmp();
  const s = kit.makeStore(dir, {});
  s.load();
  const b = fx('cyprus-1000x633.jpg');
  s.put({ id: 'g--2026-11-10', group: 'g', key: '2026-11-10', time: Date.parse('2026-11-10T12:00Z'), contentType: 'image/jpeg', day: '2026-11-10' }, b);
  s.put({ id: 'g--2026-11-11', group: 'g', key: '2026-11-11', time: Date.parse('2026-11-11T12:00Z'), contentType: 'image/jpeg', day: '2026-11-11' }, variant(b, 'x'));
  assert.equal(s.list().length, 2);
  assert.ok(fs.existsSync(path.join(dir, 'g--2026-11-10.jpg')));
  const s2 = kit.makeStore(dir, {});
  assert.equal(s2.load(), 2);
  assert.equal(s2.get('g--2026-11-11').day, '2026-11-11');
  s2.remove('g--2026-11-10');
  assert.equal(fs.existsSync(path.join(dir, 'g--2026-11-10.jpg')), false);
  assert.equal(kit.makeStore(dir, {}).load(), 1);
  fs.rmSync(dir, { recursive: true });
});

test('the store drops index entries whose file is missing or the wrong size, and sweeps old temp and orphan files', () => {
  const dir = tmp();
  let now = Date.now();
  const s = kit.makeStore(dir, { now: () => now });
  s.load();
  const b = fx('cyprus-1000x633.jpg');
  s.put({ id: 'g--a', group: 'g', key: 'a', time: 1, contentType: 'image/jpeg' }, b);
  s.put({ id: 'g--b', group: 'g', key: 'b', time: 2, contentType: 'image/jpeg' }, variant(b, 'b'));
  fs.unlinkSync(path.join(dir, 'g--a.jpg'));                           // a missing file
  fs.writeFileSync(path.join(dir, 'g--b.jpg'), 'short');              // a file of the wrong size
  fs.writeFileSync(path.join(dir, 'orphan.jpg'), b);                  // nobody refers to it
  fs.writeFileSync(path.join(dir, 'g--c.jpg.123.dead.tmp'), 'half'); // a crash leftover
  const old = new Date(now - 2 * 3600000);
  fs.utimesSync(path.join(dir, 'orphan.jpg'), old, old);
  fs.utimesSync(path.join(dir, 'g--c.jpg.123.dead.tmp'), old, old);
  const s2 = kit.makeStore(dir, { now: () => now });
  assert.equal(s2.load(), 0);
  const left = fs.readdirSync(dir).filter((f) => f !== 'index.json');
  assert.ok(!left.includes('orphan.jpg') && !left.includes('g--c.jpg.123.dead.tmp'), left.join(','));
  // a fresh orphan (a file being written right now) is not touched
  fs.writeFileSync(path.join(dir, 'fresh.jpg'), b);
  kit.makeStore(dir, { now: () => now }).load();
  assert.ok(fs.existsSync(path.join(dir, 'fresh.jpg')));
  // a corrupt index starts the store empty, it never throws
  fs.writeFileSync(path.join(dir, 'index.json'), '{not json');
  assert.equal(kit.makeStore(dir, { now: () => now }).load(), 0);
  fs.rmSync(dir, { recursive: true });
});

test('retention: prune keeps what the policy says; the size cap removes the oldest first but never the newest picture of a group', () => {
  const dir = tmp();
  const logs = [];
  const b = fx('cyprus-1000x633.jpg');                  // about 20 KB
  const s = kit.makeStore(dir, { maxBytes: 3.5 * b.length, log: (m) => logs.push(m) });
  s.load();
  for (let d = 1; d <= 9; d++) s.put({ id: `a--${d}`, group: 'a', key: String(d), time: d * 1000, contentType: 'image/jpeg' }, variant(b, 'a' + d));
  for (let d = 1; d <= 2; d++) s.put({ id: `b--${d}`, group: 'b', key: String(d), time: d * 1000 + 500, contentType: 'image/jpeg' }, variant(b, 'b' + d));
  // policy: the 7 newest of each group
  s.prune((list) => {
    const keep = new Set();
    for (const g of ['a', 'b']) list.filter((e) => e.group === g).sort((x, y) => y.time - x.time).slice(0, 7).forEach((e) => keep.add(e.id));
    return keep;
  });
  // 9 + 2 pictures, the policy removes 2 of group a; the cap (3.5 pictures) then removes the oldest, but the newest of a and b stay
  const ids = s.list().map((e) => e.id).sort();
  assert.ok(s.totalBytes() <= 3.5 * b.length + 400, 'total ' + s.totalBytes());
  assert.ok(ids.includes('a--9') && ids.includes('b--2'), ids.join(','));
  assert.ok(!ids.includes('a--1') && !ids.includes('a--2'));
  assert.ok(logs.length >= 1);
  // a cap that is too small for even one picture of each group keeps those two anyway
  const s3 = kit.makeStore(tmp(), { maxBytes: 10 });
  s3.load();
  s3.put({ id: 'a--1', group: 'a', key: '1', time: 1, contentType: 'image/jpeg' }, b);
  s3.put({ id: 'a--2', group: 'a', key: '2', time: 2, contentType: 'image/jpeg' }, variant(b, 2));
  s3.put({ id: 'b--1', group: 'b', key: '1', time: 3, contentType: 'image/jpeg' }, variant(b, 3));
  s3.prune(() => new Set(['a--1', 'a--2', 'b--1']));
  assert.deepEqual(s3.list().map((e) => e.id).sort(), ['a--2', 'b--1']);
  // files of removed pictures are gone from the disk
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).length, s.list().length);
  fs.rmSync(dir, { recursive: true });
});

test('capabilities reader: extent forms, WMS 1.1.1 and 1.3.0 layouts, prefixed and plain names', () => {
  assert.equal(kit.latestFromExtent('2012-05-08/2026-11-11/P1D'), Date.parse('2026-11-11T00:00:00Z'));
  assert.equal(kit.latestFromExtent('2000-01-01/2001-01-01/P1D, 2012-05-08/2026-11-11/P1D'), Date.parse('2026-11-11T00:00:00Z'));
  assert.equal(kit.latestFromExtent('2026-11-12T09:50:00.000Z,2026-11-12T10:00:00.000Z'), Date.parse('2026-11-12T10:00:00Z'));
  assert.equal(kit.latestFromExtent('2026-11-12T10:00:00/2026-11-12T10:20:00/PT10M'), Date.parse('2026-11-12T10:20:00Z'));   // no zone: UTC, not the server's zone
  assert.equal(kit.latestFromExtent(''), null);
  assert.equal(kit.latestFromExtent('nonsense'), null);
  const v13 = '<Layer><Name>MODIS_Terra_X</Name><Title>t</Title><Dimension name="time" units="ISO8601" default="2026-11-11" nearestValue="1">2012-05-08/2026-11-11/P1D</Dimension></Layer>';
  const v111 = '<Layer><Name>OTHER_Layer</Name><Dimension name="time" units="ISO8601"/><Extent name="time" default="2026-11-09" nearestValue="1">2012-05-08/2026-11-09/P1D</Extent></Layer>';
  const stat = '<Layer><Name>Static_Layer</Name><Title>no time</Title></Layer>';
  const ws = '<Layer><Name>rgb_dust</Name><Dimension name="time" default="current" units="ISO8601">2026-11-12T10:00:00.000Z/2026-11-12T10:30:00.000Z/PT15M</Dimension></Layer>';
  const r = kit.layerTimes(v13 + v111 + stat + ws, ['MODIS_Terra_X', 'OTHER_Layer', 'Static_Layer', 'Missing_Layer', 'msg_iodc:rgb_dust']);
  assert.equal(r.found.MODIS_Terra_X.latestMs, Date.parse('2026-11-11T00:00:00Z'));
  assert.equal(r.found.OTHER_Layer.latestMs, Date.parse('2026-11-09T00:00:00Z'));
  assert.equal(r.found.Static_Layer.latestMs, null);
  assert.equal('Missing_Layer' in r.found, false);
  assert.equal(r.found['msg_iodc:rgb_dust'].latestMs, Date.parse('2026-11-12T10:30:00Z'));
  assert.equal(r.layers, 4);
  // a layer that is a prefix of another layer's name is not confused with it
  assert.equal('Static' in kit.layerTimes(stat, ['Static']).found, false);
});

test('the loop: first run, regular runs, doubling pause after failures, Retry-After, stop; timers do not keep the process alive', async () => {
  const logs = [];
  const ctx = { log: (m) => logs.push(m) };
  let n = 0, outcome = 'ok';
  const loop = kit.makeLoop(ctx, { run: async () => { n++; if (outcome === 'throw') throw new Error('boom'); return outcome === 'fail' ? { ok: false } : outcome === 'retry' ? { ok: false, retryInMs: 7 * 3600000 } : { ok: true }; }, firstDelayMs: 5, everyMs: 20, failBaseMs: 1000, failMaxMs: 8000, label: 'x' });
  loop.start();
  await new Promise((r) => setTimeout(r, 70));
  assert.ok(n >= 3, 'runs ' + n);
  outcome = 'throw';
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(loop.fails >= 1);
  assert.ok(loop.nextInMs >= 900 && loop.nextInMs <= 1100, 'first pause ' + loop.nextInMs);
  assert.ok(logs.some((l) => /boom/.test(l)));
  loop.stop();
  const before = n;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(n, before);
  // Retry-After beats the back-off
  const l2 = kit.makeLoop(ctx, { run: async () => ({ ok: false, retryInMs: 5000 }), firstDelayMs: 1, everyMs: 20, failBaseMs: 10, failMaxMs: 100, label: 'y' });
  l2.start();
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(l2.nextInMs >= 5000, String(l2.nextInMs));
  l2.stop();
});
