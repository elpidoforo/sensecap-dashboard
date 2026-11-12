'use strict';
/* satellite/lib/imagery.js: what the two PICTURE feeds share (nasa-gibs-imagery and eumetsat-meteosat-view).
 *
 *   validateImage(buf, opts)      is this really a picture? PNG and JPEG only. Checks the magic bytes, the structure (a PNG is walked
 *                                 chunk by chunk, every checksum is verified and the picture data is unpacked; a JPEG must have its
 *                                 header and its end marker), the size and the pixel dimensions. A web-map server often answers an error
 *                                 with HTTP 200 and an XML text: that comes back as { ok: false, reason: 'service-exception', code, detail }.
 *   writeFileAtomic(file, data)   write to a temp file in the same folder, flush it, rename it over the target. A reader (or a crash) never
 *                                 sees half a picture.
 *   makeStore(dir, opts)          the pictures of one feed on the data volume: index.json + one file per picture, a size cap for the
 *                                 whole folder (oldest go first, the newest picture of every group is never deleted), a clean-up of
 *                                 leftover temp files and of files nobody refers to.
 *   makeLoop(ctx, opts)           the schedule: first run after a short delay, then every `everyMs`, sooner/later after a failure with a
 *                                 growing pause. Every timer is unref'd. One run at a time.
 *   latestFromExtent(text), layerTimes(xml, names)   read the TIME of a layer from a WMS GetCapabilities text, without an XML library.
 *
 * Nothing here touches the network (the feeds do it through ctx.get). No dependencies: only node:fs, node:zlib, node:crypto.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const HOUR = 3600000, DAY = 86400000;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;        // one picture; the pictures we ask for are about 100 to 450 KB
const MAX_PIXELS = 4000000;                        // 1000 x 633 is what we ask for; anything above about 2000 x 2000 is not ours

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const plain = (e) => clip((e && e.message) || e || 'failed', 160);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (iso) => Date.parse(iso + 'T00:00:00Z');

/* ------------------------------------------------------------------------------------------------ is it a picture? */

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SAMPLES = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };   // PNG colour type -> samples per pixel

const bad = (reason, detail, extra) => ({ ok: false, reason, detail: clip(detail, 160), ...(extra || {}) });

// What a map server says when it refuses: <ServiceException code="LayerNotDefined">text</ServiceException>.
function serviceException(buf) {
  const head = buf.subarray(0, 6000).toString('utf8');
  const m = /<ServiceException\b([^>]*)>([\s\S]*?)<\/ServiceException>/i.exec(head);
  if (!m) return null;
  const code = (/\bcode\s*=\s*"([^"]{0,60})"/i.exec(m[1]) || [])[1] || '';
  const text = clip(m[2].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' '), 140);
  return { code, text };
}

function sniff(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}

function checkPng(buf, o) {
  let pos = 8, n = 0, sawEnd = false, ihdr = null;
  const idat = [];
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    if (len > buf.length - pos - 12) return bad('truncated', 'the PNG file stops in the middle of a block');
    const type = buf.toString('latin1', pos + 4, pos + 8);
    if (zlib.crc32(buf.subarray(pos + 4, pos + 8 + len)) !== buf.readUInt32BE(pos + 8 + len)) return bad('corrupt', 'a block of the PNG file fails its checksum');
    if (n === 0) {
      if (type !== 'IHDR' || len !== 13) return bad('corrupt', 'the PNG file has no header block');
      ihdr = { width: buf.readUInt32BE(pos + 8), height: buf.readUInt32BE(pos + 12), depth: buf[pos + 16], colour: buf[pos + 17], interlace: buf[pos + 20] };
    } else if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    else if (type === 'IEND') { sawEnd = true; pos += 12 + len; break; }
    pos += 12 + len; n++;
  }
  if (!ihdr) return bad('truncated', 'the PNG file is too short');
  if (!sawEnd) return bad('truncated', 'the PNG file has no end block');
  if (pos !== buf.length) return bad('corrupt', 'there are extra bytes after the end of the PNG file');
  const { width, height } = ihdr;
  if (!(width > 0 && height > 0) || width * height > (o.maxPixels || MAX_PIXELS)) return bad('dimensions', `the picture is ${width} x ${height} pixels`);
  const samples = SAMPLES[ihdr.colour];
  if (!samples || ![1, 2, 4, 8, 16].includes(ihdr.depth) || !idat.length) return bad('corrupt', 'the PNG header is not valid');
  const rowBytes = Math.ceil((width * samples * ihdr.depth) / 8) + 1;
  const expected = ihdr.interlace ? null : rowBytes * height;
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: (expected || rowBytes * height * 2) + 1024 }); }
  catch (e) { return bad('corrupt', 'the PNG picture data does not unpack'); }
  if (expected != null && raw.length !== expected) return bad(raw.length < expected ? 'truncated' : 'corrupt', 'the PNG picture data has the wrong length');
  return { ok: true, type: 'png', contentType: 'image/png', width, height };
}

function checkJpeg(buf, o) {
  let pos = 2, width = 0, height = 0, sof = false, sos = false;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) return bad('corrupt', 'the JPEG file has a broken block marker');
    const m = buf[pos + 1];
    if (m === 0xff) { pos++; continue; }                                   // fill byte
    if (m === 0x00 || m === 0x01 || m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) { pos += 2; continue; }   // markers without a length
    if (m === 0xd9) break;                                                 // end of picture
    const len = buf.readUInt16BE(pos + 2);
    if (len < 2 || pos + 2 + len > buf.length) return bad('truncated', 'the JPEG file stops in the middle of a block');
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
      if (len < 8) return bad('corrupt', 'the JPEG header is not valid');
      height = buf.readUInt16BE(pos + 5); width = buf.readUInt16BE(pos + 7); sof = true;
    }
    if (m === 0xda) { sos = true; break; }                                 // the picture data starts: no more blocks to walk
    pos += 2 + len;
  }
  if (!sof || !sos) return bad('corrupt', 'the JPEG file has no picture header');
  if (!(width > 0 && height > 0) || width * height > (o.maxPixels || MAX_PIXELS)) return bad('dimensions', `the picture is ${width} x ${height} pixels`);
  if (!(buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9)) return bad('truncated', 'the JPEG file has no end marker (cut off)');
  return { ok: true, type: 'jpeg', contentType: 'image/jpeg', width, height };
}

/* validateImage(buf, { contentType, minBytes, maxBytes, width, height, maxPixels })
   -> { ok: true, type, contentType, width, height, bytes, sha256 }
   |  { ok: false, reason, detail, code? }     reason: empty too-big too-small not-image service-exception truncated corrupt dimensions
   contentType is what the server said. A text/xml/html/json type is never an image. image/* or octet-stream or nothing is fine as long as
   the bytes are a PNG or a JPEG (the bytes decide the type we keep and later serve). */
function validateImage(buf, opts) {
  const o = opts || {};
  const maxBytes = o.maxBytes || MAX_IMAGE_BYTES, minBytes = o.minBytes == null ? 200 : o.minBytes;
  if (!Buffer.isBuffer(buf) || !buf.length) return bad('empty', 'the answer was empty');
  if (buf.length > maxBytes) return bad('too-big', `the answer is ${Math.round(buf.length / 1024)} KB, more than the ${Math.round(maxBytes / 1024)} KB we accept`);
  const kind = sniff(buf);
  if (!kind) {
    const ex = serviceException(buf);
    if (ex) return bad('service-exception', `${ex.code ? ex.code + ': ' : ''}${ex.text}`, { code: ex.code, text: ex.text });
    const head = buf.subarray(0, 64).toString('latin1').replace(/^ï»¿/, '').trimStart();
    return bad('not-image', /^<(\?xml|!doctype|html|[a-z])/i.test(head) ? 'the answer is a web page or an XML text, not a picture' : 'the answer is not a PNG or JPEG picture');
  }
  const ct = String(o.contentType || '').toLowerCase().split(';')[0].trim();
  if (ct && !/^image\//.test(ct) && ct !== 'application/octet-stream' && ct !== 'binary/octet-stream') return bad('not-image', `the server said "${clip(ct, 40)}", not a picture`);
  const r = kind === 'png' ? checkPng(buf, o) : checkJpeg(buf, o);
  if (!r.ok) return r;
  if (buf.length < minBytes) return bad('too-small', `the picture is only ${buf.length} bytes (a real one is bigger), probably empty`);
  if ((o.width && r.width !== o.width) || (o.height && r.height !== o.height)) return bad('dimensions', `the picture is ${r.width} x ${r.height}, we asked for ${o.width} x ${o.height}`);
  return { ...r, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

/* ------------------------------------------------------------------------------------------------ files */

function writeFileAtomic(file, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', 0o644);
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    fs.renameSync(tmp, file);
  } catch (e) {
    if (fd != null) { try { fs.closeSync(fd); } catch (e2) { /* already closed */ } }
    try { fs.unlinkSync(tmp); } catch (e2) { /* nothing left */ }
    throw e;
  }
}

const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/;
const PICTURE_FILE = /\.(png|jpg)$/;

/* makeStore(dir, { maxBytes, now, log })
   entry = { id, group, key, time, contentType, ...meta }   id is unique ("<group>--<key>"); time = observation time in ms
   put(entry, buf) writes the file (atomic) and the index; list() / get(id); remove(id); prune(keepFn); totalBytes() */
function makeStore(dir, opts) {
  const o = opts || {};
  const maxBytes = o.maxBytes || 25 * 1024 * 1024, now = o.now || Date.now, log = o.log || (() => {});
  const indexFile = path.join(dir, 'index.json');
  let entries = new Map();

  const okEntry = (e) => e && typeof e === 'object' && typeof e.id === 'string' && typeof e.group === 'string' && typeof e.file === 'string' && SAFE_NAME.test(e.file) && Number.isFinite(e.time) && Number.isFinite(e.bytes) && (e.contentType === 'image/png' || e.contentType === 'image/jpeg');
  const unlink = (file) => { try { fs.unlinkSync(path.join(dir, file)); } catch (e) { /* already gone */ } };
  const persist = () => writeFileAtomic(indexFile, JSON.stringify({ v: 1, entries: [...entries.values()] }));

  function load() {
    entries = new Map();
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch (e) { raw = null; }
    for (const e of raw && Array.isArray(raw.entries) ? raw.entries : []) {
      if (!okEntry(e)) continue;
      try { const st = fs.statSync(path.join(dir, e.file)); if (!st.isFile() || st.size !== e.bytes) continue; } catch (err) { continue; }
      entries.set(e.id, e);
    }
    sweep();
    return entries.size;
  }

  // Temp files left by a crash, and picture files that no entry refers to (older than an hour, so a file being written is never touched).
  function sweep() {
    const t = now();
    let names = [];
    try { names = fs.readdirSync(dir); } catch (e) { return; }
    const used = new Set([...entries.values()].map((e) => e.file));
    for (const f of names) {
      let age = null;
      try { age = t - fs.statSync(path.join(dir, f)).mtimeMs; } catch (e) { continue; }
      if (f.endsWith('.tmp') && age > 10 * 60000) unlink(f);
      else if (PICTURE_FILE.test(f) && !used.has(f) && age > HOUR) unlink(f);
    }
  }

  function put(entry, buf) {
    const ext = entry.contentType === 'image/png' ? 'png' : 'jpg';
    const file = `${entry.id}.${ext}`.toLowerCase();
    if (!SAFE_NAME.test(file)) throw new Error('the picture name is not safe');
    writeFileAtomic(path.join(dir, file), buf);
    const old = entries.get(entry.id);
    if (old && old.file !== file) unlink(old.file);
    const saved = { ...entry, file, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), savedAt: now() };
    entries.set(entry.id, saved);
    persist();
    return saved;
  }

  function remove(id) {
    const e = entries.get(id);
    if (!e) return;
    entries.delete(id);
    unlink(e.file);
  }

  const list = () => [...entries.values()];
  const get = (id) => entries.get(id) || null;
  const totalBytes = () => list().reduce((n, e) => n + e.bytes, 0);

  // keepFn(list) -> Set of ids to keep. Then the size cap: the oldest go first, never the newest picture of a group.
  function prune(keepFn) {
    const keep = keepFn(list());
    for (const e of list()) if (!keep.has(e.id)) remove(e.id);
    if (totalBytes() > maxBytes) {
      const newest = new Map();
      for (const e of list()) if (!newest.has(e.group) || e.time > newest.get(e.group).time) newest.set(e.group, e);
      let total = totalBytes();
      for (const e of list().sort((a, b) => a.time - b.time)) {
        if (total <= maxBytes) break;
        if (newest.get(e.group) === e) continue;
        remove(e.id); total -= e.bytes;
        log(`the picture folder was over its size limit, the oldest picture (${isoDay(e.time)}) was deleted`);
      }
    }
    persist();
  }

  return { load, sweep, put, remove, list, get, totalBytes, prune, indexFile, dir };
}

/* ------------------------------------------------------------------------------------------------ schedule */

/* makeLoop(ctx, { run, firstDelayMs, everyMs, failBaseMs, failMaxMs, label })
   run() -> { ok, retryInMs? } or throws. After ok the next run is `everyMs` away; after a failure the pause doubles (failBaseMs, 2x, 4x ... failMaxMs),
   and never less than the server's Retry-After (retryInMs). start() never throws and never blocks. */
function makeLoop(ctx, o) {
  let timer = null, stopped = true, busy = false, fails = 0, lastDelay = 0;
  const arm = (ms) => {
    if (stopped) return;
    clearTimeout(timer);
    lastDelay = Math.max(0, Math.round(ms));
    timer = setTimeout(tick, lastDelay);
    if (timer.unref) timer.unref();
  };
  async function tick() {
    if (stopped || busy) return;
    busy = true;
    let ok = false, retry = 0;
    try { const r = await o.run(); ok = !(r && r.ok === false); retry = (r && r.retryInMs) || 0; }
    catch (e) { ok = false; try { ctx.log(`${o.label || 'refresh'} failed (${plain(e)})`); } catch (e2) { /* logging never breaks the loop */ } }
    busy = false;
    fails = ok ? 0 : fails + 1;
    const wait = ok ? o.everyMs : Math.min(o.failMaxMs || 3 * HOUR, (o.failBaseMs || 10 * 60000) * 2 ** Math.min(fails - 1, 10)) * (0.9 + Math.random() * 0.2);
    arm(Math.max(wait, retry));
  }
  return {
    start() { stopped = false; arm(o.firstDelayMs == null ? 20000 : o.firstDelayMs); },
    stop() { stopped = true; clearTimeout(timer); },
    get fails() { return fails; },
    get nextInMs() { return lastDelay; },
  };
}

/* ------------------------------------------------------------------------------------------------ WMS GetCapabilities */

const withZone = (s) => { const t = String(s || '').trim(); return /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(t) ? t + 'Z' : t; };
const isoMs = (s) => { const ms = Date.parse(withZone(s)); return Number.isFinite(ms) ? ms : null; };

// "2012-05-08/2026-11-11/P1D", "a/b/P1D,c/d/P1D", "t1,t2,t3" or "t": the newest time in it, in ms (null when there is none).
function latestFromExtent(text) {
  let best = null;
  for (const part of String(text || '').split(',')) {
    const bits = part.trim().split('/');
    const ms = isoMs(bits.length >= 2 ? bits[1] : bits[0]);
    if (ms != null && (best == null || ms > best)) best = ms;
  }
  return best;
}

// The block of one layer in the capabilities text. A layer may be listed as "ws:name" (all layers of the server) or as "name" (the
// capabilities of one workspace), so both are tried.
function layerBlock(xml, name) {
  const names = [name, name.includes(':') ? name.split(':').slice(1).join(':') : null].filter(Boolean);
  for (const n of names) {
    const i = xml.indexOf(`<Name>${n}</Name>`);
    if (i < 0) continue;
    const end = xml.indexOf('</Layer>', i);
    return xml.slice(i, end < 0 ? Math.min(xml.length, i + 200000) : end);
  }
  return null;
}

/* layerTimes(xml, names) -> { found: { name: { latestMs, raw } }, layers: <how many layers the text lists> }
   latestMs is null for a layer without a time (a static one). A name that is not in the text is simply not in `found`. */
function layerTimes(xml, names) {
  const text = String(xml || '');
  const found = {};
  for (const name of names) {
    const block = layerBlock(text, name);
    if (!block) continue;
    let latest = null, raw = '';
    const re = /<(?:Dimension|Extent)\b([^>]*)>([^<]*)/gi;
    let m;
    while ((m = re.exec(block))) {
      if (!/\bname\s*=\s*"time"/i.test(m[1])) continue;
      const def = (/\bdefault\s*=\s*"([^"]*)"/i.exec(m[1]) || [])[1];
      for (const ms of [latestFromExtent(m[2]), def ? isoMs(def) : null]) if (ms != null && (latest == null || ms > latest)) latest = ms;
      if (m[2].trim()) raw = m[2].trim().slice(0, 80);
    }
    found[name] = { latestMs: latest, raw };
  }
  return { found, layers: (text.match(/<Name>/g) || []).length };
}

module.exports = {
  HOUR, DAY, MAX_IMAGE_BYTES, clip, plain, isoDay, dayMs,
  validateImage, serviceException, writeFileAtomic, makeStore, makeLoop, latestFromExtent, layerTimes,
};
