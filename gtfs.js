'use strict';
/* Official Cyprus bus timetables (static GTFS), read only, mounted at /api/transit/*.
 *
 * Source   Cyprus National Access Point for transport (traffic4cyprus.org.cy), Public Works Department, licence CC BY 4.0.
 *          Seven GTFS zips: EMEL (Limassol), NPT (Nicosia), LPT (Larnaca), OSYPA (Paphos), OSEA (Famagusta), Intercity, Pame Express.
 *          ONLY the static timetables are used. The GTFS-Realtime feed is never read: it is plain HTTP on a bare IP address, and it
 *          could show where our own SenseCAP buses really are. No vehicle position of any kind is in this file.
 * What it does
 *   1. A small zip reader on node:zlib (readZip). Central directory, stored and deflate, size caps, zip-slip and zip-bomb safe.
 *      Nothing is ever written to disk under a name taken from a zip.
 *   2. A streaming CSV reader (readTable): UTF-8 BOM, quotes, CRLF, quoted line breaks, long lines refused.
 *   3. buildFeed: one zip becomes one compact object (stops, lines, planned first and last times per stop, simplified line shapes).
 *      shapes.txt is optional. Without it a line simply has no drawing and the answer says so.
 *   4. createGtfs: downloads each zip on startup and then every GTFS_REFRESH_DAYS (7) days, with If-None-Match and If-Modified-Since
 *      when it has them, keeps the compact result in DATA_DIR/gtfs/, and NEVER fails startup: a feed that cannot be fetched or
 *      read is logged in ONE line and the saved copy (if any) keeps serving.
 *   5. The API: GET /api/transit, /status, /stops, /routes, /school, /line. Every answer carries the attribution and the licence.
 *      A small per-address limit applies, like the other public views.
 * Settings (all optional)
 *   GTFS_DISABLED=1          no downloads (a saved copy is still served)
 *   GTFS_FEEDS               JSON, [{"id":"emel","name":"EMEL","url":"https://..."}]: replaces the built-in list of seven
 *   GTFS_URL_TEMPLATE        the download address for the built-in list, with {n} for the portal's file number
 *   GTFS_ALLOW_HOSTS         extra host names that may be downloaded from (comma separated). http is only ever allowed for localhost
 *   GTFS_REFRESH_DAYS=7      how often each zip is checked        GTFS_RETRY_HOURS=6   how soon after a failure
 *   GTFS_STARTUP_MIN_AGE_H=6 do not download again at startup when the last check is younger than this
 *   GTFS_MAX_ZIP_MB=100      biggest download                      GTFS_MAX_FILE_MB=400 biggest file inside a zip
 *   GTFS_TIMEOUT_S=20        no data for this long ends a download GTFS_RATE_PER_MIN=60 per address, for the API
 * createGtfs({ dataDir, log, simulated, feeds, env, now }) -> { enabled, start, tick, check, handle, probe, status, stop, _t }
 */
const fsp = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');
const { StringDecoder } = require('string_decoder');

const MB = 1048576, HOUR = 3600000, DAY = 86400000;
const UA = 'SmartCitiesCyprus/1.0 (school project)';
const PORTAL = 'https://traffic4cyprus.org.cy/dataset/publictransportstatic';

/* ---------- who to credit (the same credit line as sources/gtfs-public-transport.json) ---------- */
const CREDIT = 'Cyprus National Access Point for transport (traffic4cyprus.org.cy)';
const LICENCE = { id: 'CC-BY-4.0', name: 'Creative Commons Attribution 4.0 International', url: 'https://creativecommons.org/licenses/by/4.0/' };
const ATTRIBUTION = {
  en: `Bus timetable data: ${CREDIT}, Public Works Department, Ministry of Transport, Communications and Works. Licence CC BY 4.0. Reduced by Smart Cities Cyprus to stops, lines and planned times.`,
  el: `Δεδομένα δρομολογίων λεωφορείων: Εθνικό Σημείο Πρόσβασης για τις μεταφορές της Κύπρου (traffic4cyprus.org.cy), Τμήμα Δημοσίων Έργων, Υπουργείο Μεταφορών, Επικοινωνιών και Έργων. Άδεια CC BY 4.0. Περιορίστηκαν από το Smart Cities Cyprus σε στάσεις, γραμμές και προγραμματισμένες ώρες.`,
};

/* The portal's file numbers are from the research notes (10 LPT, 9 NPT, 6 EMEL, 2 OSYPA, 4 OSEA, 5 Intercity, 11 Pame Express).
   Nobody has opened these addresses from a server yet: see "after the deploy" in the report. */
const DEFAULT_FEEDS = [
  { id: 'emel', n: 6, name: 'EMEL (Limassol)', nameEl: 'EMEL (Λεμεσός)' },
  { id: 'npt', n: 9, name: 'NPT (Nicosia)', nameEl: 'NPT (Λευκωσία)' },
  { id: 'lpt', n: 10, name: 'LPT (Larnaca)', nameEl: 'LPT (Λάρνακα)' },
  { id: 'osypa', n: 2, name: 'OSYPA (Paphos)', nameEl: 'OSYPA (Πάφος)' },
  { id: 'osea', n: 4, name: 'OSEA (Famagusta)', nameEl: 'OSEA (Αμμόχωστος)' },
  { id: 'intercity', n: 5, name: 'Intercity buses', nameEl: 'Υπεραστικά λεωφορεία' },
  { id: 'pame', n: 11, name: 'Pame Express', nameEl: 'Pame Express' },
];
const DEFAULT_URL = 'https://motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C{n}_google_transit.zip&rel=True';
const DEFAULT_HOSTS = ['motionbuscard.org.cy', 'traffic4cyprus.org.cy', 'www.traffic4cyprus.org.cy'];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/* The four schools: the places the site already uses (public/site/island.js). Ids are the ones of the trip page. */
const SCHOOLS = {
  larnaka: { lat: 34.9229, lng: 33.6233 },
  lefkosia: { lat: 35.1856, lng: 33.3823 },
  limassol: { lat: 34.6841, lng: 33.0379 },
  paphos: { lat: 34.7754, lng: 32.4245 },
};
const SCHOOL_ALIAS = { larnaca: 'larnaka', nicosia: 'lefkosia', lemesos: 'limassol', pafos: 'paphos' };

// Stops outside this box are mistakes (swapped columns, 0,0): Cyprus with a margin, north and Famagusta included.
const BOX = { south: 34.3, north: 36.0, west: 31.9, east: 34.9 };

class ZipError extends Error { constructor(m) { super(m); this.name = 'ZipError'; } }
class CsvError extends Error { constructor(m) { super(m); this.name = 'CsvError'; } }
class GtfsError extends Error { constructor(m) { super(m); this.name = 'GtfsError'; } }

const mb = (n) => Math.round((n / MB) * 10) / 10;
const tick = () => new Promise((r) => setImmediate(r));
const envNum = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v != null ? Math.min(max, Math.max(min, n)) : d; };
// Text that came from a file or a server: one line, no control characters, a sensible length.
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// An error text becomes part of a public page: no address, no long token.
function clean(text, max = 160) {
  const s = String(text == null ? '' : text)
    .replace(/https?:\/\/[^\s)'"]+/gi, '[address]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '[address]')
    .replace(/[A-Za-z0-9_+/=-]{32,}/g, '***')
    .replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/* =====================================================================================================
   1. The zip reader
   ===================================================================================================== */

const ZIP_LIMITS = { maxEntries: 256, maxEntryBytes: 400 * MB, maxTotalBytes: 900 * MB, maxRatio: 250, ratioFrom: 2 * MB };
const CHUNK = 64 * 1024;

// A name is only ever used to look a file up. It is still refused when it tries to leave a folder.
function unsafeName(name) {
  if (name.indexOf('\u0000') >= 0) return true;
  if (/^([\\/]|[A-Za-z]:)/.test(name)) return true;
  return name.split(/[\\/]/).some((seg) => seg === '..');
}

function readZip(buf, limits) {
  const L = { ...ZIP_LIMITS, ...(limits || {}) };
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError('not a zip file (too small)');
  if (buf.readUInt32LE(0) !== 0x04034b50 && buf.readUInt32LE(0) !== 0x06054b50) throw new ZipError('not a zip file (it does not start like one)');
  // the end-of-central-directory record: the last one, within the last 64 KB
  let eocd = -1;
  for (let i = buf.length - 22, stop = Math.max(0, buf.length - 22 - 65535); i >= stop; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('not a complete zip file (no end record: cut short?)');
  const disk = buf.readUInt16LE(eocd + 4), cdDisk = buf.readUInt16LE(eocd + 6), total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12), cdOffset = buf.readUInt32LE(eocd + 16);
  if (disk !== 0 || cdDisk !== 0) throw new ZipError('zips in several parts are not supported');
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError('zip64 zips are not supported');
  if (total > L.maxEntries) throw new ZipError(`too many files in the zip (${total}, the limit is ${L.maxEntries})`);
  if (cdOffset + cdSize > eocd) throw new ZipError('the zip index is damaged');
  const entries = [], byName = new Map();
  let pos = cdOffset, declared = 0;
  for (let i = 0; i < total; i++) {
    if (pos + 46 > cdOffset + cdSize || buf.readUInt32LE(pos) !== 0x02014b50) throw new ZipError('the zip index is damaged');
    const flags = buf.readUInt16LE(pos + 8), method = buf.readUInt16LE(pos + 10), crc = buf.readUInt32LE(pos + 16);
    const compSize = buf.readUInt32LE(pos + 20), size = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28), extraLen = buf.readUInt16LE(pos + 30), commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    if (pos + 46 + nameLen + extraLen + commentLen > cdOffset + cdSize) throw new ZipError('the zip index is damaged');
    const raw = buf.subarray(pos + 46, pos + 46 + nameLen);
    const name = (flags & 0x800 ? raw.toString('utf8') : raw.toString('latin1'));
    pos += 46 + nameLen + extraLen + commentLen;
    if (unsafeName(name)) throw new ZipError('a file name in the zip tries to leave its folder: the zip is refused');
    if (name.endsWith('/')) continue;   // a folder
    const key = name.toLowerCase();
    if (byName.has(key)) throw new ZipError(`the zip has two files called ${clip(name, 40)}: refused`);
    const e = { name, method, crc, compSize, size, localOffset, unsupported: null };
    if (flags & 1) e.unsupported = 'the file is encrypted';
    else if (method !== 0 && method !== 8) e.unsupported = `compression method ${method} is not supported`;
    else if (method === 0 && compSize !== size) e.unsupported = 'the sizes of a stored file do not match';
    if (size > L.ratioFrom && (compSize === 0 || size / compSize > L.maxRatio)) throw new ZipError(`${clip(name, 40)} is packed far more tightly than a timetable file can be (a zip bomb?): the zip is refused`);
    declared += size;
    entries.push(e); byName.set(key, e);
  }
  if (declared > L.maxTotalBytes) throw new ZipError(`the zip is too big when unpacked (${mb(declared)} MB, the limit is ${mb(L.maxTotalBytes)} MB)`);
  const zip = {
    buf, entries, limits: L, cdOffset, bytesOut: 0,
    // GTFS files sit at the top of the zip. One folder level is tolerated, because some tools add one.
    find(name) {
      const n = name.toLowerCase();
      if (byName.has(n)) return byName.get(n);
      for (const e of entries) {
        const k = e.name.toLowerCase();
        if (k.indexOf('/') > 0 && k.indexOf('/') === k.lastIndexOf('/') && k.endsWith('/' + n)) return e;
      }
      return null;
    },
    stream: (e) => entryChunks(zip, e),
    async read(e, max) {
      const parts = []; let n = 0;
      for await (const c of entryChunks(zip, e)) { n += c.length; if (n > (max || 8 * MB)) throw new ZipError(`${clip(e.name, 40)} is bigger than expected`); parts.push(c); }
      return Buffer.concat(parts);
    },
  };
  return zip;
}

// The data of one entry, in chunks. The real size must match what the zip says, so a header that lies cannot start a bomb.
async function* entryChunks(zip, e) {
  const L = zip.limits, nm = clip(e.name, 40);
  if (e.unsupported) throw new ZipError(`${nm}: ${e.unsupported}`);
  if (e.size > L.maxEntryBytes) throw new ZipError(`${nm} is too big when unpacked (${mb(e.size)} MB, the limit is ${mb(L.maxEntryBytes)} MB)`);
  const buf = zip.buf, o = e.localOffset;
  if (o + 30 > zip.cdOffset || buf.readUInt32LE(o) !== 0x04034b50) throw new ZipError(`${nm}: the zip is damaged (bad file header)`);
  const start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28), end = start + e.compSize;
  if (end > zip.cdOffset || end > buf.length) throw new ZipError(`${nm}: the zip is damaged (data runs past the end)`);
  const data = buf.subarray(start, end);
  let out = 0, crc = 0;
  const count = (c) => {
    out += c.length; zip.bytesOut += c.length;
    if (out > e.size) throw new ZipError(`${nm} unpacks to more than the zip says (a zip bomb?)`);
    if (zip.bytesOut > L.maxTotalBytes) throw new ZipError('the zip is too big when unpacked');
    crc = zlib.crc32(c, crc);
  };
  if (e.method === 0) {
    for (let i = 0, n = 0; i < data.length; i += CHUNK, n++) { const c = data.subarray(i, i + CHUNK); count(c); yield c; if (n % 64 === 63) await tick(); }
  } else {
    const inf = zlib.createInflateRaw({ chunkSize: CHUNK });
    try {
      inf.end(data);
      for await (const c of inf) { count(c); yield c; }
    } catch (err) {
      if (err instanceof ZipError) throw err;
      throw new ZipError(`${nm}: damaged data (${clip(err && err.message, 60)})`);
    } finally { inf.destroy(); }
  }
  if (out !== e.size) throw new ZipError(`${nm}: the size after unpacking does not match the zip`);
  if ((crc >>> 0) !== e.crc) throw new ZipError(`${nm}: the data is damaged (checksum)`);
}

/* =====================================================================================================
   2. The CSV reader
   ===================================================================================================== */

const NL = /\r\n|\n|\r/g;
const MAX_RECORD = 1 << 20;   // characters in one record

// One record that has at least one quote in it. Returns null when a quoted field is still open at the end of the line.
function splitQuoted(s, lenient) {
  const out = [], n = s.length;
  let i = 0;
  for (;;) {
    if (s.charCodeAt(i) !== 34) {   // not quoted: up to the next comma (a stray quote in the middle is just a character)
      const c = s.indexOf(',', i);
      if (c < 0) { out.push(s.slice(i)); return out; }
      out.push(s.slice(i, c)); i = c + 1; continue;
    }
    let field = '';
    i++;
    for (;;) {
      const k = s.indexOf('"', i);
      if (k < 0) { if (!lenient) return null; field += s.slice(i); i = n; break; }
      field += s.slice(i, k);
      if (s.charCodeAt(k + 1) === 34) { field += '"'; i = k + 2; } else { i = k + 1; break; }
    }
    const c = i >= n ? -1 : s.indexOf(',', i);   // anything between the closing quote and the comma is kept
    if (c < 0) { out.push(field + s.slice(i)); return out; }
    out.push(field + s.slice(i, c)); i = c + 1;
  }
}

class CsvReader {
  constructor(onRecord, name) { this.on = onRecord; this.name = name; this.rem = ''; this.open = null; this.span = 0; this.started = false; this.line = 0; }
  write(text) {
    if (!this.started) { this.started = true; if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); }   // the byte order mark
    const buf = this.rem + text;
    NL.lastIndex = 0;
    let start = 0, m;
    while ((m = NL.exec(buf)) !== null) {
      if (m[0] === '\r' && NL.lastIndex === buf.length) break;   // a \n may come first in the next chunk
      this.take(buf.slice(start, m.index));
      start = NL.lastIndex;
    }
    this.rem = start ? buf.slice(start) : buf;
    if (this.rem.length > MAX_RECORD) throw new CsvError(`${this.name}: a line is longer than ${MAX_RECORD} characters`);
  }
  end() {
    if (this.rem.length) { const r = this.rem; this.rem = ''; this.take(r.replace(/\r$/, '')); }
    if (this.open !== null) { const o = this.open; this.open = null; this.on(splitQuoted(o, true), this.line); }
  }
  take(line) {
    this.line++;
    if (this.open !== null) { line = this.open + '\n' + line; this.open = null; this.span++; }
    else if (line.length === 0) return;
    else this.span = 1;
    if (line.indexOf('"') < 0) return this.on(line.split(','), this.line);
    const f = splitQuoted(line, false);
    if (f === null) {
      // a field in quotes may hold a line break, but not hundreds of them: a quote that is never closed must not eat the file
      if (line.length > MAX_RECORD || this.span > 200) throw new CsvError(`${this.name}: a quoted field is never closed (line ${this.line - this.span + 1})`);
      this.open = line; return;
    }
    this.on(f, this.line);
  }
}

/* Reads a table: the first record is the header (names are trimmed and lower-cased). onRow(fields, col) gets the fields of every
   other record, and col maps a column name to its position. opts: name, need (column names that must exist), maxRows. */
async function readTable(source, onRow, opts) {
  const o = opts || {}, name = o.name || 'file', maxRows = o.maxRows || 50e6;
  let col = null, rows = 0;
  const reader = new CsvReader((f) => {
    if (col === null) {
      col = Object.create(null);
      f.forEach((h, i) => { const k = h.trim().toLowerCase(); if (!(k in col)) col[k] = i; });
      for (const need of o.need || []) if (!(need in col)) throw new CsvError(`${name} has no ${need} column`);
      return;
    }
    if (++rows > maxRows) throw new CsvError(`${name} has more than ${maxRows} rows`);
    onRow(f, col);
  }, name);
  const dec = new StringDecoder('utf8');
  let first = true;
  const chunks = typeof source === 'string' || Buffer.isBuffer(source) ? [source] : source;
  for await (const c of chunks) {
    if (typeof c === 'string') { reader.write(c); continue; }
    if (first) {
      first = false;
      if (c.length >= 2 && ((c[0] === 0xff && c[1] === 0xfe) || (c[0] === 0xfe && c[1] === 0xff))) throw new CsvError(`${name} is saved as UTF-16, it must be UTF-8`);
    }
    reader.write(dec.write(c));
  }
  reader.write(dec.end());
  reader.end();
  if (col === null) throw new CsvError(`${name} is empty`);
  return { columns: col, rows };
}

/* =====================================================================================================
   3. One zip becomes one compact object
   ===================================================================================================== */

const D8 = /^\d{8}$/;
const get = (f, i) => (i === undefined ? '' : f[i] || '');
// "HH:MM:SS" with any number of hours (a trip after midnight is 25:10:00) becomes minutes, or -1.
function parseTime(s) {
  const t = String(s || '').trim(), a = t.indexOf(':');
  if (a < 1) return -1;
  const h = Number(t.slice(0, a)), m = Number(t.slice(a + 1, a + 3));
  return Number.isInteger(h) && Number.isInteger(m) && m < 60 && h < 72 ? h * 60 + m : -1;
}
const cyDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Nicosia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms).replace(/-/g, '');
const dayNo = (d8) => Date.UTC(Number(d8.slice(0, 4)), Number(d8.slice(4, 6)) - 1, Number(d8.slice(6, 8)));
const addDays = (d8, n) => new Date(dayNo(d8) + n * DAY).toISOString().slice(0, 10).replace(/-/g, '');
const dashed = (d8) => (D8.test(d8 || '') ? `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}` : null);
const WD = 1, SA = 2, SU = 4;   // the three day types of a timetable summary
const typeOf = (d8) => { const w = new Date(dayNo(d8)).getUTCDay(); return w === 0 ? SU : w === 6 ? SA : WD; };

// The shape of a line, thinned out so that nothing moves more than tolM metres (Douglas-Peucker).
function simplify(pts, tolM) {
  const n = pts.length;
  if (n < 3) return pts;
  const k = Math.cos((pts[0][0] * Math.PI) / 180);
  const X = pts.map((p) => [p[1] * 111320 * k, p[0] * 110540]);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = X[a][0], ay = X[a][1], dx = X[b][0] - ax, dy = X[b][1] - ay, len2 = dx * dx + dy * dy;
    let dmax = 0, at = -1;
    for (let i = a + 1; i < b; i++) {
      let t = len2 ? ((X[i][0] - ax) * dx + (X[i][1] - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + t * dx - X[i][0], py = ay + t * dy - X[i][1], d = px * px + py * py;
      if (d > dmax) { dmax = d; at = i; }
    }
    if (at >= 0 && dmax > tolM * tolM) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

async function buildFeed(zip, info, opts) {
  const o = opts || {}, now = o.now || Date.now();
  const t0 = Date.now();
  const need = (name) => { const e = zip.find(name); if (!e) throw new GtfsError(`${name} is missing from the zip`); return e; };
  const table = (name, e, fn, needCols, maxRows) => readTable(zip.stream(e), fn, { name, need: needCols, maxRows });
  const roundC = (v) => Math.round(v * 1e5) / 1e5;

  // agencies (optional)
  const agencies = [], agencyOf = new Map();
  const agE = zip.find('agency.txt');
  if (agE) await table('agency.txt', agE, (f, c) => { const nm = clip(get(f, c.agency_name), 80); if (nm) { agencyOf.set(get(f, c.agency_id), agencies.length); agencies.push(nm); } }, [], 1000);

  // routes
  const routeIdx = new Map(), routes = [];
  await table('routes.txt', need('routes.txt'), (f, c) => {
    const raw = get(f, c.route_id);
    if (!raw || routeIdx.has(raw)) return;
    const id = clip(raw, 60), ag = agencyOf.get(get(f, c.agency_id));
    routeIdx.set(raw, routes.length);
    routes.push({ id, short: clip(get(f, c.route_short_name), 24), long: clip(get(f, c.route_long_name), 120), type: Number(get(f, c.route_type)) || 3, agency: ag === undefined ? (agencies.length === 1 ? 0 : -1) : ag });
  }, ['route_id'], 20000);
  if (!routes.length) throw new GtfsError('routes.txt has no lines');

  // stops: only real stops (location_type 0), only inside Cyprus
  const stopIdx = new Map(), stops = [];
  let droppedStops = 0;
  await table('stops.txt', need('stops.txt'), (f, c) => {
    const lt = get(f, c.location_type).trim();
    if (lt !== '' && lt !== '0') return;
    const raw = get(f, c.stop_id), id = clip(raw, 60), lat = parseFloat(get(f, c.stop_lat)), lng = parseFloat(get(f, c.stop_lon));
    if (!id || stopIdx.has(raw)) return;
    if (!(lat >= BOX.south && lat <= BOX.north && lng >= BOX.west && lng <= BOX.east)) { droppedStops++; return; }
    stopIdx.set(raw, stops.length);
    stops.push({ id, name: clip(get(f, c.stop_name), 100) || id, lat: roundC(lat), lng: roundC(lng), code: clip(get(f, c.stop_code), 16) });
  }, ['stop_id', 'stop_lat', 'stop_lon'], 200000);
  if (!stops.length) throw new GtfsError('stops.txt has no stops inside Cyprus');

  // which services run: the timetable is summarised for the days around one reference date
  const calRows = [], addRows = [];
  let vFrom = '', vTo = '', fiFrom = '', fiTo = '';
  const widen = (a, b) => { if (D8.test(a) && (!vFrom || a < vFrom)) vFrom = a; if (D8.test(b) && (!vTo || b > vTo)) vTo = b; };
  const calE = zip.find('calendar.txt'), cdE = zip.find('calendar_dates.txt'), fiE = zip.find('feed_info.txt');
  if (fiE) await table('feed_info.txt', fiE, (f, c) => { fiFrom = fiFrom || get(f, c.feed_start_date).trim(); fiTo = fiTo || get(f, c.feed_end_date).trim(); }, [], 10);
  if (calE) await table('calendar.txt', calE, (f, c) => {
    const s = get(f, c.start_date).trim(), e = get(f, c.end_date).trim(), sid = get(f, c.service_id);
    if (!sid || !D8.test(s) || !D8.test(e)) return;
    const on = (k) => get(f, c[k]).trim() === '1';
    calRows.push([sid, s, e, (on('monday') || on('tuesday') || on('wednesday') || on('thursday') || on('friday') ? WD : 0) | (on('saturday') ? SA : 0) | (on('sunday') ? SU : 0)]);
    widen(s, e);
  }, ['service_id'], 200000);
  if (cdE) await table('calendar_dates.txt', cdE, (f, c) => {
    const sid = get(f, c.service_id), d = get(f, c.date).trim();
    if (!sid || !D8.test(d)) return;
    widen(d, d);
    if (get(f, c.exception_type).trim() === '1') addRows.push([sid, d]);
  }, ['service_id', 'date'], 1500000);
  const from = D8.test(fiFrom) ? fiFrom : vFrom, to = D8.test(fiTo) ? fiTo : vTo;
  let ref = cyDate(now);
  if (from && ref < from) ref = from;
  if (to && ref > to) ref = to;
  const flags = new Map();
  const mark = (sid, fl) => flags.set(sid, (flags.get(sid) || 0) | fl);
  for (const [sid, s, e, fl] of calRows) if (s <= ref && ref <= e) mark(sid, fl);
  const lastDay = addDays(ref, 27);
  for (const [sid, d] of addRows) if (d >= ref && d <= lastDay) mark(sid, typeOf(d));
  const noCalendar = !calE && !cdE;

  // trips
  const tripIdx = new Map(), tRoute = [], tHead = [], tFlags = [], heads = [''], headIdx = new Map([['', 0]]), shapeUse = new Map();
  await table('trips.txt', need('trips.txt'), (f, c) => {
    const ri = routeIdx.get(get(f, c.route_id));
    const tid = get(f, c.trip_id);
    if (ri === undefined || !tid || tripIdx.has(tid)) return;
    const hs = clip(get(f, c.trip_headsign), 80);
    let hi = headIdx.get(hs);
    if (hi === undefined) { if (heads.length >= 65535) hi = 0; else { hi = heads.length; heads.push(hs); headIdx.set(hs, hi); } }
    tripIdx.set(tid, tRoute.length);
    tRoute.push(ri); tHead.push(hi); tFlags.push(noCalendar ? WD | SA | SU : flags.get(get(f, c.service_id)) || 0);
    const sh = get(f, c.shape_id);
    if (sh) { let m = shapeUse.get(ri); if (!m) shapeUse.set(ri, m = new Map()); m.set(sh, (m.get(sh) || 0) + 1); }
  }, ['route_id', 'service_id', 'trip_id'], 2000000);
  if (!tripIdx.size) throw new GtfsError('trips.txt has no trips');

  // stop times: for every stop, which line stops there and when (first and last time on each day type)
  const serve = new Map();
  let nRows = 0, noTrip = 0, noStop = 0, inactive = 0, noTime = 0;
  await table('stop_times.txt', need('stop_times.txt'), (f, c) => {
    nRows++;
    const ti = tripIdx.get(f[c.trip_id]);
    if (ti === undefined) { noTrip++; return; }
    const fl = tFlags[ti];
    if (!fl) { inactive++; return; }
    const si = stopIdx.get(f[c.stop_id]);
    if (si === undefined) { noStop++; return; }
    let t = parseTime(get(f, c.departure_time));
    if (t < 0) t = parseTime(get(f, c.arrival_time));
    const key = tRoute[ti] * 65536 + tHead[ti];
    let m = serve.get(si);
    if (!m) serve.set(si, m = new Map());
    let a = m.get(key);
    if (!a) m.set(key, a = [0, -1, -1, 0, -1, -1, 0, -1, -1]);
    if (t < 0) { noTime++; return; }
    for (let k = 0; k < 3; k++) {
      if (!(fl & (1 << k))) continue;
      const b = k * 3;
      a[b]++;
      if (a[b + 1] < 0 || t < a[b + 1]) a[b + 1] = t;
      if (t > a[b + 2]) a[b + 2] = t;
    }
  }, ['trip_id', 'stop_id'], 60e6);
  if (!serve.size) throw new GtfsError('no line stops at any stop in the timetable around ' + dashed(ref));

  // keep only the stops and lines that are used
  const sOrder = [...serve.keys()].sort((a, b) => a - b), newStop = new Map(sOrder.map((s, i) => [s, i]));
  const usedRoutes = new Set();
  for (const m of serve.values()) for (const k of m.keys()) usedRoutes.add(Math.floor(k / 65536));
  const rOrder = [...usedRoutes].sort((a, b) => a - b), newRoute = new Map(rOrder.map((r, i) => [r, i]));
  const outServe = [];
  for (const si of sOrder) for (const [k, a] of serve.get(si)) outServe.push([newStop.get(si), newRoute.get(Math.floor(k / 65536)), k % 65536, ...a]);

  // line shapes: the two most used drawings of every line, when the zip has shapes.txt
  const shapeE = zip.find('shapes.txt'), shapes = {};
  let nShapes = 0;
  if (shapeE) {
    const want = new Map();   // shape id -> routes that use it
    for (const r of rOrder) {
      const m = shapeUse.get(r);
      if (!m) continue;
      for (const [sh] of [...m].sort((a, b) => b[1] - a[1]).slice(0, 2)) { if (!want.has(sh)) want.set(sh, []); want.get(sh).push(newRoute.get(r)); }
    }
    if (want.size) {
      const pts = new Map();
      let n = 0;
      await table('shapes.txt', shapeE, (f, c) => {
        const sh = get(f, c.shape_id);
        if (!want.has(sh)) return;
        const lat = parseFloat(get(f, c.shape_pt_lat)), lng = parseFloat(get(f, c.shape_pt_lon)), seq = Number(get(f, c.shape_pt_sequence));
        if (!(lat >= BOX.south && lat <= BOX.north && lng >= BOX.west && lng <= BOX.east) || !Number.isFinite(seq)) return;
        if (++n > 3e6) throw new GtfsError('shapes.txt has too many points');
        let a = pts.get(sh);
        if (!a) pts.set(sh, a = []);
        a.push([seq, lat, lng]);
      }, ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], 20e6);
      for (const [sh, a] of pts) {
        const line = simplify(a.sort((x, y) => x[0] - y[0]).map((p) => [p[1], p[2]]), 12);
        if (line.length < 2) continue;
        const flat = [];
        for (const p of line) flat.push(roundC(p[0]), roundC(p[1]));
        for (const r of want.get(sh)) (shapes[r] = shapes[r] || []).push(flat);
        nShapes++;
      }
    }
  }

  return {
    v: 1, id: info.id, builtAt: now, hasShapes: !!shapeE, shapesKept: nShapes,
    validFrom: dashed(from), validTo: dashed(to), ref: dashed(ref),
    agencies,
    counts: { stops: sOrder.length, routes: rOrder.length, trips: tripIdx.size, stopTimes: nRows, noTrip, noStop, inactive, noTime, droppedStops },
    stops: sOrder.map((s) => { const p = stops[s]; return [p.id, p.name, p.lat, p.lng, p.code]; }),
    routes: rOrder.map((r) => { const p = routes[r]; return [p.id, p.short, p.long, p.type, p.agency]; }),
    heads, serve: outServe, shapes,
    buildMs: Date.now() - t0,
  };
}

// A saved or fresh compact object must be consistent before it is served.
function validCompact(o) {
  if (!o || o.v !== 1 || typeof o.id !== 'string' || !Array.isArray(o.stops) || !Array.isArray(o.routes) || !Array.isArray(o.serve) || !Array.isArray(o.heads) || !Array.isArray(o.agencies)) return false;
  const ns = o.stops.length, nr = o.routes.length, nh = o.heads.length;
  if (!ns || !nr) return false;
  for (const s of o.stops) if (!Array.isArray(s) || typeof s[0] !== 'string' || typeof s[1] !== 'string' || !Number.isFinite(s[2]) || !Number.isFinite(s[3])) return false;
  for (const r of o.routes) if (!Array.isArray(r) || typeof r[0] !== 'string' || typeof r[1] !== 'string' || typeof r[2] !== 'string') return false;
  for (const r of o.serve) if (!Array.isArray(r) || r.length !== 12 || !(r[0] >= 0 && r[0] < ns) || !(r[1] >= 0 && r[1] < nr) || !(r[2] >= 0 && r[2] < nh)) return false;
  return true;
}

/* =====================================================================================================
   4. Downloading
   ===================================================================================================== */

// One GET with its own redirect handling (every hop is checked against the allowed hosts), size cap and time limits.
function download(startUrl, headers, lim) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let settled = false, current = null;
    const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(total); fn(v); };
    const total = setTimeout(() => { if (current) current.destroy(); done(reject, new Error('the download took too long')); }, lim.totalMs);
    total.unref && total.unref();
    const go = (urlStr, hops) => {
      let u;
      try { u = new URL(urlStr); } catch (e) { return done(reject, new Error('the address is not valid')); }
      const bad = lim.check(u);
      if (bad) return done(reject, new Error(bad));
      const req = (u.protocol === 'https:' ? https : http).request(u, { method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/zip, application/octet-stream, */*', 'Accept-Encoding': 'identity', ...headers }, timeout: lim.idleMs }, (res) => {
        const st = res.statusCode;
        if (st === 304) { res.resume(); return done(resolve, { status: 304, ms: Date.now() - t0 }); }
        if (st >= 300 && st < 400 && res.headers.location) {
          res.resume();
          if (hops >= 3) return done(reject, new Error('too many redirects'));
          let next;
          try { next = new URL(res.headers.location, u).toString(); } catch (e) { return done(reject, new Error('a redirect to an invalid address')); }
          return go(next, hops + 1);
        }
        if (st !== 200) { res.resume(); return done(reject, new Error('the server answered HTTP ' + st)); }
        const len = Number(res.headers['content-length']);
        if (Number.isFinite(len) && len > lim.maxBytes) { req.destroy(); return done(reject, new Error(`the file is ${mb(len)} MB, more than the ${mb(lim.maxBytes)} MB limit`)); }
        const parts = []; let n = 0;
        res.on('data', (c) => { n += c.length; if (n > lim.maxBytes) { req.destroy(); done(reject, new Error(`the file is bigger than the ${mb(lim.maxBytes)} MB limit`)); } else parts.push(c); });
        res.on('end', () => done(resolve, { status: 200, buf: Buffer.concat(parts), etag: clip(res.headers.etag, 200), lastModified: clip(res.headers['last-modified'], 100), contentType: clip(res.headers['content-type'], 80), ms: Date.now() - t0 }));
        res.on('error', (e) => done(reject, e));
        res.on('close', () => done(reject, new Error('the connection was cut')));
      });
      current = req;
      req.on('timeout', () => req.destroy(new Error('the server stopped sending data')));
      req.on('error', (e) => done(reject, e));
      req.end();
    };
    go(startUrl, 0);
  });
}

const hostOf = (u) => u.hostname.replace(/^\[|\]$/g, '');
const where = (urlStr) => { try { const u = new URL(urlStr); return u.host + u.pathname; } catch (e) { return '(address)'; } };   // never the query

function writeAtomic(file, text) {
  const tmp = file + '.' + process.pid + '.tmp';
  return fsp.writeFile(tmp, text).then(() => fsp.rename(tmp, file)).catch((e) => { fsp.unlink(tmp).catch(() => {}); throw e; });
}

/* =====================================================================================================
   5. The module
   ===================================================================================================== */

const natural = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
const hhmm = (m) => (m < 0 ? null : String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));

function createGtfs(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const log = o.log || ((m) => console.log(m));
  const now = o.now || Date.now;
  const dir = o.dataDir ? path.join(o.dataDir, 'gtfs') : null;
  const cfg = {
    refreshMs: envNum(env.GTFS_REFRESH_DAYS, 7, 1 / 24, 90) * DAY,
    retryMs: envNum(env.GTFS_RETRY_HOURS, 6, 0.01, 72) * HOUR,
    startupMinAgeMs: envNum(env.GTFS_STARTUP_MIN_AGE_H, 6, 0, 168) * HOUR,
    maxZip: envNum(env.GTFS_MAX_ZIP_MB, 100, 1, 500) * MB,
    maxFile: envNum(env.GTFS_MAX_FILE_MB, 400, 1, 2000) * MB,
    idleMs: envNum(env.GTFS_TIMEOUT_S, 20, 1, 20) * 1000,
    totalMs: envNum(env.GTFS_TOTAL_TIMEOUT_S, 120, 5, 600) * 1000,
    rate: envNum(env.GTFS_RATE_PER_MIN, 60, 1, 100000),
    checkEvery: envNum(env.GTFS_CHECK_EVERY_MIN, 60, 0.01, 1440) * 60000,
  };

  /* ----- which files, from where ----- */
  const hosts = new Set([...DEFAULT_HOSTS, ...String(env.GTFS_ALLOW_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)]);
  const checkUrl = (u) => {
    const h = hostOf(u).toLowerCase();
    if (!hosts.has(h)) return 'that host is not on the list of allowed hosts';
    if (u.protocol === 'https:') return null;
    if (u.protocol === 'http:' && LOOPBACK.has(h)) return null;
    return 'only https is allowed';
  };
  function resolveFeeds() {
    let list = null;
    const given = o.feeds || (env.GTFS_FEEDS ? (() => { try { return JSON.parse(env.GTFS_FEEDS); } catch (e) { log('GTFS: GTFS_FEEDS is not valid JSON, the built-in list is used'); return null; } })() : null);
    if (Array.isArray(given)) list = given;
    else { const tpl = o.urlTemplate || env.GTFS_URL_TEMPLATE || DEFAULT_URL; list = DEFAULT_FEEDS.map((d) => ({ id: d.id, name: d.name, nameEl: d.nameEl, url: tpl.replace('{n}', String(d.n)) })); }
    const out = [], seen = new Set();
    for (const f of list) {
      if (!f || typeof f.id !== 'string' || !/^[a-z0-9-]{2,20}$/.test(f.id) || seen.has(f.id) || typeof f.url !== 'string') { log('GTFS: a feed entry was skipped (it needs a unique id of 2 to 20 letters, digits or dashes, and a url)'); continue; }
      let bad = null;
      try { bad = checkUrl(new URL(f.url)); } catch (e) { bad = 'the address is not valid'; }
      if (bad) { log(`GTFS ${f.id}: skipped, ${bad}`); continue; }
      seen.add(f.id);
      out.push({ id: f.id, url: f.url, name: clip(f.name || f.id, 60), nameEl: clip(f.nameEl || f.name || f.id, 60) });
    }
    return out;
  }
  const feedList = resolveFeeds();
  // Tests and demos never reach the real portal, unless they name their own files.
  const explicit = Boolean(o.feeds || env.GTFS_FEEDS || o.urlTemplate || env.GTFS_URL_TEMPLATE);
  const enabled = o.enabled !== false && env.GTFS_DISABLED !== '1' && (!o.simulated || explicit) && feedList.length > 0;

  /* ----- state: what is loaded, and what the last checks did ----- */
  const loaded = new Map();   // feed id -> compact object (served)
  const state = new Map();    // feed id -> { etag, lastModified, sha, bytes, checkedAt, attemptAt, okAt, loadedAt, error, ms }
  let index = { stops: [], grid: new Map(), byKey: new Map(), lines: 0 };
  let running = null, timer = null, startP = null;
  const st = (id) => { let s = state.get(id); if (!s) state.set(id, s = {}); return s; };

  function rebuild() {
    const stops = [], grid = new Map(), byKey = new Map();
    let lines = 0;
    for (const f of loaded.values()) {
      const by = new Array(f.stops.length);
      for (const r of f.serve) (by[r[0]] || (by[r[0]] = [])).push(r);
      lines += f.routes.length;
      f.stops.forEach((s, i) => {
        const p = { feed: f.id, id: s[0], name: s[1], lat: s[2], lng: s[3], code: s[4] || '', f, rows: by[i] || [] };
        stops.push(p); byKey.set(f.id + ':' + s[0], p);
        const k = Math.floor(p.lat * 100) * 10000 + Math.floor(p.lng * 100);
        let cell = grid.get(k);
        if (!cell) grid.set(k, cell = []);
        cell.push(p);
      });
    }
    index = { stops, grid, byKey, lines };
  }

  async function saveState() {
    if (!dir) return;
    try { await fsp.mkdir(dir, { recursive: true }); await writeAtomic(path.join(dir, 'state.json'), JSON.stringify({ v: 1, feeds: Object.fromEntries(state) })); }
    catch (e) { /* the log line for a failed save is written once, where the feed is saved */ }
  }

  async function loadSaved() {
    if (!dir) return;
    let saved = {};
    try { const s = JSON.parse(await fsp.readFile(path.join(dir, 'state.json'), 'utf8')); if (s && s.feeds && typeof s.feeds === 'object') saved = s.feeds; } catch (e) { /* nothing saved yet */ }
    let n = 0;
    for (const f of feedList) {
      const s = saved[f.id] && typeof saved[f.id] === 'object' ? saved[f.id] : {};
      try {
        const file = path.join(dir, f.id + '.json');
        if ((await fsp.stat(file)).size > 200 * MB) throw new Error('saved file is too big');
        const c = JSON.parse(await fsp.readFile(file, 'utf8'));
        if (!validCompact(c) || c.id !== f.id) throw new Error('saved file is not valid');
        loaded.set(f.id, c); state.set(f.id, s); n++;
      } catch (e) {
        if (e && e.code === 'ENOENT') { state.set(f.id, {}); continue; }
        log(`GTFS ${f.id}: the saved copy could not be used (${clean(e && e.message, 80)}), it will be downloaded again`);
        state.set(f.id, {});   // no etag: a 304 must not keep us without data
      }
    }
    if (n) { rebuild(); log(`GTFS: ${n} saved timetable file${n === 1 ? '' : 's'} loaded, ${index.stops.length} stops`); }
  }

  /* ----- one feed ----- */
  async function updateFeed(feed, fresh) {
    const s = st(feed.id);
    s.attemptAt = now();
    try {
      const headers = {};
      if (loaded.has(feed.id) && !fresh) { if (s.etag) headers['If-None-Match'] = s.etag; if (s.lastModified) headers['If-Modified-Since'] = s.lastModified; }
      const r = await download(feed.url, headers, { maxBytes: cfg.maxZip, idleMs: cfg.idleMs, totalMs: cfg.totalMs, check: checkUrl });
      if (r.status === 304) {
        s.okAt = now(); s.error = null;
        log(`GTFS ${feed.id}: not modified (304), the saved copy stays`);
        await saveState();
        return true;
      }
      if (r.buf.length < 4 || r.buf.readUInt32LE(0) !== 0x04034b50) throw new Error(`the answer is not a zip file (${r.contentType || 'no content type'}, ${r.buf.length} bytes)`);
      const sha = crypto.createHash('sha256').update(r.buf).digest('hex');
      s.etag = r.etag || null; s.lastModified = r.lastModified || null;
      if (loaded.has(feed.id) && s.sha === sha) {
        s.okAt = now(); s.error = null;
        log(`GTFS ${feed.id}: the same file again (${mb(r.buf.length)} MB, ${r.etag || r.lastModified ? 'headers offered' : 'no ETag or Last-Modified offered'}), the saved copy stays`);
        await saveState();
        return true;
      }
      const zip = readZip(r.buf, { maxEntryBytes: cfg.maxFile });
      const compact = await buildFeed(zip, feed, { now: now() });
      if (!validCompact(compact)) throw new GtfsError('the result did not pass the checks');
      loaded.set(feed.id, compact);
      rebuild();
      s.sha = sha; s.bytes = r.buf.length; s.okAt = now(); s.loadedAt = s.okAt; s.error = null;
      let saved = 'not saved (no data folder)';
      if (dir) {
        try { await fsp.mkdir(dir, { recursive: true }); const text = JSON.stringify(compact); await writeAtomic(path.join(dir, feed.id + '.json'), text); saved = `saved ${mb(text.length)} MB`; }
        catch (e) { saved = `NOT saved (${clean(e && e.message, 60)}), kept in memory only`; }
      }
      await saveState();
      const c = compact.counts;
      log(`GTFS ${feed.id}: ${where(feed.url)} gave ${mb(r.buf.length)} MB in ${(r.ms / 1000).toFixed(1)} s (${r.etag ? 'ETag' : 'no ETag'}, ${r.lastModified ? 'Last-Modified' : 'no Last-Modified'}); ${c.stops} stops, ${c.routes} lines, ${c.trips} trips, ${c.stopTimes} stop times read in ${(compact.buildMs / 1000).toFixed(1)} s; timetable ${compact.validFrom || '?'} to ${compact.validTo || '?'}, reference day ${compact.ref}; shapes ${compact.hasShapes ? 'yes' : 'no'}; ${saved}`);
      return true;
    } catch (e) {
      s.error = clean(e && e.message, 160);
      const had = loaded.has(feed.id) ? `the saved copy from ${new Date(s.loadedAt || 0).toISOString().slice(0, 10)} stays` : 'nothing is loaded for it';
      log(`GTFS ${feed.id}: could not update (${s.error}); ${had}`);
      await saveState();
      return false;
    }
  }

  // A feed that failed is left alone for GTFS_RETRY_HOURS (also at startup, so a crash loop does not hammer the portal).
  const due = (feed, reason) => {
    if (reason === 'force') return true;
    const s = st(feed.id), t = now(), have = loaded.has(feed.id);
    if (s.error && s.attemptAt && t - s.attemptAt < cfg.retryMs) return false;
    if (!have || !s.okAt) return true;
    return t - s.okAt >= (reason === 'startup' ? cfg.startupMinAgeMs : cfg.refreshMs);
  };

  // One pass over the feeds that are due, one at a time (one zip in memory at once).
  function cycle(reason, fresh) {
    if (running) return running;
    const p = (async () => {
      let ok = 0, bad = 0;
      try {
        for (const feed of feedList) {
          if (!due(feed, reason)) continue;
          if (await updateFeed(feed, fresh)) ok++; else bad++;
        }
        if (ok + bad) log(`GTFS: ${ok + bad} timetable file${ok + bad === 1 ? '' : 's'} checked, ${ok} fine, ${bad} failed; ${index.stops.length} stops from ${loaded.size} of ${feedList.length} files; memory ${Math.round(process.memoryUsage().rss / MB)} MB`);
      } catch (e) { log('GTFS: ' + clean(e && e.message)); }
    })();
    running = p;
    const free = () => { if (running === p) running = null; };   // after the assignment, even when nothing was due
    p.then(free, free);
    return p;
  }

  function start() {
    if (startP) return startP;
    startP = (async () => {
      try { await loadSaved(); } catch (e) { log('GTFS: ' + clean(e && e.message)); }
      if (!enabled) { log(`GTFS: downloads are off (${env.GTFS_DISABLED === '1' ? 'GTFS_DISABLED' : o.simulated && !explicit ? 'test mode' : 'no feeds'})${loaded.size ? ', the saved copy is served' : ''}`); return; }
      timer = setInterval(() => { cycle('tick').catch(() => {}); }, cfg.checkEvery);
      if (timer.unref) timer.unref();
      await cycle('startup');
    })().catch((e) => log('GTFS: ' + clean(e && e.message)));
    return startP;
  }

  /* ----- looking things up ----- */
  const R = 6371000, rad = Math.PI / 180;
  function distance(lat1, lng1, lat2, lng2) {
    const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function bearing(lat1, lng1, lat2, lng2) {
    const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad), x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
    return Math.round(((Math.atan2(y, x) / rad) + 360) % 360);
  }
  // Stops with at least one line, within radius metres, nearest first.
  function near(lat, lng, radius, limit) {
    const dLat = radius / 111320, dLng = radius / (111320 * Math.max(0.2, Math.cos(lat * rad)));
    const out = [];
    for (let a = Math.floor((lat - dLat) * 100); a <= Math.floor((lat + dLat) * 100); a++) {
      for (let b = Math.floor((lng - dLng) * 100); b <= Math.floor((lng + dLng) * 100); b++) {
        const cell = index.grid.get(a * 10000 + b);
        if (!cell) continue;
        for (const p of cell) {
          if (!p.rows.length) continue;
          const d = distance(lat, lng, p.lat, p.lng);
          if (d <= radius) out.push({ p, d });
        }
      }
    }
    out.sort((x, y) => x.d - y.d || natural(x.p.name, y.p.name) || natural(x.p.id, y.p.id));
    return { total: out.length, hits: out.slice(0, limit) };
  }
  const dayOut = (n, f, l) => (n > 0 || f >= 0 ? { trips: n, first: hhmm(f), last: hhmm(l) } : { trips: 0, first: null, last: null });
  // The lines that stop at one stop, with the planned first and last time and the number of trips on each day type.
  function linesAt(p) {
    const by = new Map();
    for (const r of p.rows) {
      let l = by.get(r[1]);
      if (!l) {
        const rt = p.f.routes[r[1]];
        l = { feed: p.feed, id: rt[0], short: rt[1], long: rt[2], operator: rt[4] >= 0 && p.f.agencies[rt[4]] ? p.f.agencies[rt[4]] : null, headsigns: [], d: [[0, -1, -1], [0, -1, -1], [0, -1, -1]] };
        by.set(r[1], l);
      }
      const h = p.f.heads[r[2]];
      if (h && !l.headsigns.includes(h) && l.headsigns.length < 4) l.headsigns.push(h);
      for (let k = 0; k < 3; k++) {
        const n = r[3 + k * 3], f = r[4 + k * 3], la = r[5 + k * 3], x = l.d[k];
        x[0] += n;
        if (f >= 0 && (x[1] < 0 || f < x[1])) x[1] = f;
        if (la > x[2]) x[2] = la;
      }
    }
    return [...by.values()].map((l) => ({ feed: l.feed, id: l.id, short: l.short, long: l.long, operator: l.operator, headsigns: l.headsigns, weekday: dayOut(...l.d[0]), saturday: dayOut(...l.d[1]), sunday: dayOut(...l.d[2]) }))
      .sort((a, b) => natural(a.short || a.long, b.short || b.long) || natural(a.id, b.id));
  }
  const stopOut = (p, d, from) => {
    const out = { feed: p.feed, id: p.id, name: p.name, code: p.code || null, lat: p.lat, lng: p.lng };
    if (d != null) { out.distance = Math.round(d / 5) * 5; out.bearing = bearing(from[0], from[1], p.lat, p.lng); }
    return out;
  };
  const today = () => new Date(now()).toISOString().slice(0, 10);
  function feedsView(ids) {
    const t = cyDate(now());
    return [...ids].map((id) => loaded.get(id)).filter(Boolean).map((c) => ({ id: c.id, validFrom: c.validFrom, validTo: c.validTo, expired: !!(c.validTo && c.validTo.replace(/-/g, '') < t), timetableDay: c.ref, hasShapes: c.hasShapes }));
  }

  /* ----- the layers page asks: is it answering? ----- */
  function probe() {
    const ids = [...loaded.keys()];
    const at = ids.reduce((m, id) => Math.max(m, (state.get(id) || {}).okAt || 0), 0);
    const n = index.stops.length;
    const note = n ? `${n} stops and ${index.lines} lines from ${ids.length} of ${feedList.length} timetable files` : enabled ? 'no timetable file has been loaded yet' : 'timetable downloads are switched off on this server';
    const noteEl = n ? `${n} στάσεις και ${index.lines} γραμμές από ${ids.length} από ${feedList.length} αρχεία δρομολογίων` : enabled ? 'δεν έχει φορτωθεί ακόμη κανένα αρχείο δρομολογίων' : 'οι λήψεις δρομολογίων είναι απενεργοποιημένες σε αυτόν τον διακομιστή';
    return { ok: n > 0, n, at: at || null, note, noteEl };
  }
  function status() {
    const t = cyDate(now());
    return {
      enabled, configured: feedList.length, loaded: loaded.size, stops: index.stops.length, lines: index.lines,
      feeds: feedList.map((f) => {
        const c = loaded.get(f.id), s = state.get(f.id) || {};
        return { id: f.id, name: f.name, nameEl: f.nameEl, loaded: !!c, stops: c ? c.counts.stops : 0, lines: c ? c.counts.routes : 0, trips: c ? c.counts.trips : 0, hasShapes: c ? c.hasShapes : null,
          validFrom: c ? c.validFrom : null, validTo: c ? c.validTo : null, expired: !!(c && c.validTo && c.validTo.replace(/-/g, '') < t),
          loadedAt: s.loadedAt || null, checkedAt: s.okAt || null, bytes: s.bytes || null, error: s.error || null };
      }),
    };
  }

  /* ----- the HTTP side ----- */
  class Reply extends Error { constructor(status, en, el, extra) { super(en); this.status = status; this.el = el; this.extra = extra; } }
  const hits = new Map(), allHits = { n: 0, t: 0 };
  function tooMany(req) {
    const t = now(), ip = (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?').slice(0, 64);
    let h = hits.get(ip);
    if (!h || t - h[1] > 60000) {
      h = [0, t]; hits.set(ip, h);
      if (hits.size > 2000) { for (const [k, v] of hits) if (t - v[1] > 60000) hits.delete(k); if (hits.size > 4000) hits.clear(); }
    }
    if (t - allHits.t > 60000) { allHits.n = 0; allHits.t = t; }
    allHits.n++;
    return ++h[0] > cfg.rate || allHits.n > cfg.rate * 10;
  }
  const base = () => ({ attribution: ATTRIBUTION.en, attributionEl: ATTRIBUTION.el, licence: { ...LICENCE }, source: { name: CREDIT, url: PORTAL } });
  function send(res, status, obj, headers) {
    const body = JSON.stringify({ ...obj, ...base() });
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', ...(headers || {}) });
    res.end(body);
  }
  const NUM = /^[+-]?\d{1,9}(\.\d{1,9})?$/;
  function numParam(url, name, min, max, dflt) {
    const raw = url.searchParams.get(name);
    if (raw === null || raw === '') { if (dflt === undefined) throw new Reply(400, `${name} is needed, for example ?${name}=34.92`, `Χρειάζεται το ${name}, για παράδειγμα ?${name}=34.92`); return dflt; }
    if (!NUM.test(raw) || Number(raw) < min || Number(raw) > max) throw new Reply(400, `${name} must be a number from ${min} to ${max}`, `Το ${name} πρέπει να είναι αριθμός από ${min} έως ${max}`);
    return Number(raw);
  }
  const textParam = (url, name, re) => {
    const raw = url.searchParams.get(name);
    if (raw === null || raw === '' || raw.length > 160 || !re.test(raw)) throw new Reply(400, `${name} is needed and is not valid`, `Το ${name} χρειάζεται και δεν είναι έγκυρο`);
    return raw;
  };
  const KNOWN = new Set(['/api/transit/stops', '/api/transit/routes', '/api/transit/school', '/api/transit/line']);
  const NONE = () => new Reply(503, 'Bus timetables are not available right now.', 'Τα δρομολόγια λεωφορείων δεν είναι διαθέσιμα αυτή τη στιγμή.', { loaded: false });

  async function api(url, res) {
    const p = url.pathname.replace(/\/+$/, '');
    const short = (l) => l.short || l.long;
    if (p === '/api/transit') {
      return send(res, 200, { name: 'Cyprus bus timetables (static GTFS)', loaded: loaded.size > 0, endpoints: ['/api/transit/status', '/api/transit/stops?lat=&lng=&radius=', '/api/transit/routes?stop=<feed>:<stop id>', '/api/transit/school?school=larnaka|lefkosia|limassol|paphos', '/api/transit/line?feed=&route='], realtime: false, note: 'Planned timetables only. No vehicle positions.' });
    }
    if (p === '/api/transit/status') return send(res, 200, status());
    if (!KNOWN.has(p)) throw new Reply(404, 'No such page.', 'Δεν υπάρχει τέτοια σελίδα.');
    if (!loaded.size) throw NONE();
    if (p === '/api/transit/stops') {
      const lat = numParam(url, 'lat', -90, 90), lng = numParam(url, 'lng', -180, 180), radius = numParam(url, 'radius', 50, 3000, 500), limit = numParam(url, 'limit', 1, 50, 20);
      const r = near(lat, lng, radius, limit);
      const feeds = new Set();
      const stops = r.hits.map(({ p: s, d }) => { feeds.add(s.feed); return { ...stopOut(s, d, [lat, lng]), lines: linesAt(s).map(short).slice(0, 12) }; });
      return send(res, 200, { query: { radius }, total: r.total, stops, feeds: feedsView(feeds), updatedAt: Math.max(...[...loaded.keys()].map((id) => (state.get(id) || {}).okAt || 0)) || null });
    }
    if (p === '/api/transit/routes') {
      const key = textParam(url, 'stop', /^[a-z0-9-]{2,20}:[^\u0000-\u001f]{1,100}$/);
      const s = index.byKey.get(key);
      if (!s) throw new Reply(404, 'No such stop.', 'Δεν υπάρχει τέτοια στάση.');
      return send(res, 200, { stop: stopOut(s), lines: linesAt(s), feeds: feedsView([s.feed]) });
    }
    if (p === '/api/transit/school') {
      let id = String(url.searchParams.get('school') || '').toLowerCase();
      id = SCHOOL_ALIAS[id] || id;
      if (!Object.hasOwn(SCHOOLS, id)) throw new Reply(404, 'Unknown school.', 'Άγνωστο σχολείο.', { schools: Object.keys(SCHOOLS) });
      const radius = numParam(url, 'radius', 100, 3000, 800), maxStops = numParam(url, 'stops', 1, 20, 6), maxLines = numParam(url, 'lines', 1, 40, 12);
      const sc = SCHOOLS[id], at = [sc.lat, sc.lng];
      const r = near(sc.lat, sc.lng, radius, 300);
      const seen = new Map(), feeds = new Set(), stops = [];
      r.hits.forEach(({ p: s, d }, i) => {
        feeds.add(s.feed);
        const ls = linesAt(s);
        if (i < maxStops) stops.push({ ...stopOut(s, d, at), lines: ls.map(short).slice(0, 12) });
        for (const l of ls) {
          const k = l.feed + ':' + l.id;
          if (!seen.has(k)) seen.set(k, { ...l, nearestStop: stopOut(s, d, at) });
        }
      });
      const all = [...seen.values()].sort((a, b) => a.nearestStop.distance - b.nearestStop.distance || natural(short(a), short(b)));
      return send(res, 200, { school: { id }, radius, stopsTotal: r.total, stops, linesTotal: all.length, lines: all.slice(0, maxLines), feeds: feedsView(feeds), updatedAt: Math.max(...[...loaded.keys()].map((x) => (state.get(x) || {}).okAt || 0)) || null, straightLine: true });
    }
    if (p === '/api/transit/line') {
      const fid = textParam(url, 'feed', /^[a-z0-9-]{2,20}$/), rid = textParam(url, 'route', /^[^\u0000-\u001f]{1,60}$/);
      const c = loaded.get(fid);
      const ri = c ? c.routes.findIndex((r) => r[0] === rid) : -1;
      if (ri < 0) throw new Reply(404, 'No such line.', 'Δεν υπάρχει τέτοια γραμμή.');
      const rt = c.routes[ri], sh = (c.shapes && c.shapes[ri]) || [];
      return send(res, 200, {
        line: { feed: fid, id: rt[0], short: rt[1], long: rt[2], operator: rt[4] >= 0 && c.agencies[rt[4]] ? c.agencies[rt[4]] : null },
        shapes: sh.map((flat) => { const a = []; for (let i = 0; i + 1 < flat.length; i += 2) a.push([flat[i], flat[i + 1]]); return a; }),
        hasShapes: sh.length > 0,
        note: sh.length ? 'Simplified drawing from the timetable file.' : 'This timetable file has no drawing for the line. Draw it through its stops and say so.',
        noteEl: sh.length ? 'Απλοποιημένο σχέδιο από το αρχείο δρομολογίων.' : 'Αυτό το αρχείο δρομολογίων δεν έχει σχέδιο για τη γραμμή. Σχεδίασέ την μέσα από τις στάσεις της και πες το.',
        feeds: feedsView([fid]),
      });
    }
    throw new Reply(404, 'No such page.', 'Δεν υπάρχει τέτοια σελίδα.');   // not reached: KNOWN has every path above
  }

  async function handle(req, res, url) {
    if (url.pathname !== '/api/transit' && !url.pathname.startsWith('/api/transit/')) return false;
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new Reply(405, 'Use GET.', 'Χρησιμοποίησε GET.');
      if (tooMany(req)) throw new Reply(429, 'Too many requests, try again in a minute.', 'Πάρα πολλά αιτήματα, δοκίμασε ξανά σε ένα λεπτό.');
      await api(url, res);
    } catch (e) {
      if (e instanceof Reply) { if (!res.headersSent) send(res, e.status, { error: e.message, errorEl: e.el, ...(e.extra || {}) }, e.status === 429 ? { 'Retry-After': '60' } : e.status === 405 ? { Allow: 'GET, HEAD' } : null); else res.end(); }
      else { log('GTFS: the API had an error: ' + clean(e && e.message)); if (!res.headersSent) send(res, 500, { error: 'Something went wrong on the server.', errorEl: 'Κάτι πήγε στραβά στον διακομιστή.' }); else res.end(); }
    }
    return true;
  }

  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  return {
    enabled, start, stop, handle, probe, status,
    tick: () => cycle('tick'),                       // what the timer does every hour
    check: (x) => cycle(x && x.force ? 'force' : 'startup', Boolean(x && x.fresh)),   // for tests and by hand: { force: true } asks every feed now, { fresh: true } without If-None-Match
    feeds: feedList.map((f) => ({ id: f.id, name: f.name, host: new URL(f.url).host })),
    _t: { index: () => index, loaded, state, near, linesAt, cfg, today },
  };
}

module.exports = { createGtfs, readZip, readTable, buildFeed, simplify, parseTime, validCompact, ZipError, CsvError, GtfsError, ATTRIBUTION, LICENCE, CREDIT, DEFAULT_FEEDS, DEFAULT_URL, SCHOOLS, ZIP_LIMITS };
