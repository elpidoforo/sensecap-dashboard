'use strict';
/* satellite/testing.js: a ctx for feed unit tests, with no network.
 *
 *   const { makeCtx, reply, startFakeServer } = require('../../satellite/testing');   // path from satellite/feeds/
 *   const ctx = makeCtx({
 *     id: 'sat-air',
 *     hosts: ['api.example.org'],                       // the feed's exact host list (same rules as production: https only, exact names)
 *     fixtures: {
 *       'https://api.example.org/v1/air?lat=35&lon=33': { value: 12 },          // an object or array -> JSON, status 200
 *       'https://api.example.org/v1/text*': 'plain text',                       // a trailing * matches any URL that starts like this
 *       'https://api.example.org/img.png': Buffer.from([1, 2, 3]),             // a Buffer -> binary
 *       'https://api.example.org/limited': reply(429, 'slow down', { 'Retry-After': '30' }),
 *       'https://api.example.org/slow': reply(200, '{}', {}, { delayMs: 500 }),
 *       'https://api.example.org/dyn': (url, init) => ({ ok: true }),           // a function may return any of the above
 *       'https://evil.example.net/x': { a: 1 },                                  // refused anyway: host not in `hosts`
 *     },
 *   });
 *   const feed = require('./sat-air')(ctx);   // ctx.get goes through the REAL satellite/http.js (host rules, redirects, size caps, parsing)
 *
 * What ctx has beyond the contract (all optional to use): ctx.logs (array of log lines), ctx.calls (every URL asked), ctx.misses (URLs
 * with no fixture: they answer 404), ctx.setNow(ms), ctx.cleanup() (removes ctx.dir), ctx.net (counters), ctx.hosts.
 * makeCtx({ server }) sends the requests to a real local HTTP server instead (see startFakeServer): the https address is rewritten to
 * the server's address, host rules are still checked on the address the feed used.
 * Options: dir, places (default: the four cities of vocab/places.json), now (number or function), env (object, copied and frozen).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { makeGet } = require('./http');

const ROOT = path.join(__dirname, '..');

class Reply {
  constructor(status, body, headers, extra) { this.status = status; this.body = body; this.headers = headers || {}; this.extra = extra || {}; }
}
// reply(status, body, headers, { delayMs, hang })
const reply = (status, body, headers, extra) => new Reply(status, body, headers, extra);

function places() {
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'vocab', 'places.json'), 'utf8'));
  return Object.fromEntries(Object.entries(all).filter(([k]) => k[0] !== '_'));
}

function toResponse(v, signal) {
  const r = v instanceof Reply ? v : new Reply(200, v);
  let body = r.body, type = null;
  if (body == null) body = '';
  else if (Buffer.isBuffer(body) || body instanceof Uint8Array) type = 'application/octet-stream';
  else if (typeof body === 'string') type = 'text/plain; charset=utf-8';
  else { body = JSON.stringify(body); type = 'application/json'; }
  const headers = { ...(type ? { 'content-type': type } : {}), ...r.headers };
  const make = () => new Response(r.status === 204 || r.status === 304 ? null : body, { status: r.status, headers });
  const wait = (ms) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
  });
  if (r.extra.hang) return new Promise((res, rej) => { if (signal) signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }); });
  if (r.extra.delayMs) return wait(r.extra.delayMs).then(make);
  return make();
}

function matcher(fixtures) {
  const entries = fixtures instanceof Map ? [...fixtures.entries()] : Array.isArray(fixtures) ? fixtures : Object.entries(fixtures || {});
  return (url) => {
    for (const [k, v] of entries) {
      if (k instanceof RegExp ? k.test(url) : typeof k === 'string' && k.endsWith('*') ? url.startsWith(k.slice(0, -1)) : k === url) return { v };
    }
    return null;
  };
}

function makeCtx(opts) {
  const o = opts || {};
  const id = o.id || 'test-feed';
  const logs = [], calls = [], misses = [];
  const net = { ok: 0, fail: 0, last: null };
  const find = matcher(o.fixtures);
  let nowFn = typeof o.now === 'function' ? o.now : typeof o.now === 'number' ? () => o.now : Date.now;
  const dir = o.dir || fs.mkdtempSync(path.join(os.tmpdir(), `sat-${id}-`));
  fs.mkdirSync(dir, { recursive: true });
  const serverOrigin = o.server ? String(o.server.origin || o.server).replace(/\/$/, '') : null;
  const hosts = o.hosts || [];

  const transport = async (url, init) => {
    calls.push(url);
    if (serverOrigin) {
      const u = new URL(url);
      const res = await fetch(serverOrigin + u.pathname + u.search, { ...init, headers: { ...init.headers, 'x-original-host': u.host } });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc && loc.startsWith(serverOrigin)) {   // a redirect inside the fake server stays on the host the feed used
        const h = new Headers(res.headers); h.set('location', 'https://' + u.host + loc.slice(serverOrigin.length));
        return new Response(null, { status: res.status, headers: h });
      }
      return res;
    }
    const hit = find(url);
    if (!hit) { misses.push(url); return new Response('no fixture for this address', { status: 404 }); }
    const v = typeof hit.v === 'function' ? await hit.v(url, init) : hit.v;
    return toResponse(v, init && init.signal);
  };

  const get = makeGet({ id, hosts, transport, allowLocalHttp: false, onResult: (e) => { if (e) { net.fail++; net.last = e.message; } else net.ok++; } });
  const env = Object.freeze({ ...(o.env || {}) });
  const ctx = {
    id, dir, places: o.places || places(), env,
    log: (m) => { logs.push(String(m)); },
    get, now: () => nowFn(),
    // test helpers
    logs, calls, misses, net, hosts: [...hosts],
    setNow: (v) => { nowFn = typeof v === 'function' ? v : () => v; },
    cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nothing to remove */ } },
  };
  return ctx;
}

// A real local HTTP server for tests: routes like fixtures, but matched on "/path?query". Returns { origin, port, hits, close }.
function startFakeServer(routes, port) {
  const find = matcher(routes);
  const hits = [];
  const server = http.createServer(async (req, res) => {
    hits.push({ method: req.method, url: req.url, headers: req.headers });
    const hit = find(req.url);
    if (!hit) { res.writeHead(404); return res.end('no route'); }
    try {
      const v = typeof hit.v === 'function' ? await hit.v(req.url, req) : hit.v;
      const r = v instanceof Reply ? v : new Reply(200, v);
      let body = r.body == null ? '' : r.body, type = null;
      if (Buffer.isBuffer(body)) type = 'application/octet-stream'; else if (typeof body === 'string') type = 'text/plain'; else { body = JSON.stringify(body); type = 'application/json'; }
      if (r.extra.hang) return;   // never answers
      const send = () => { res.writeHead(r.status, { ...(type ? { 'Content-Type': type } : {}), ...r.headers }); res.end(body); };
      if (r.extra.delayMs) setTimeout(send, r.extra.delayMs); else send();
    } catch (e) { res.writeHead(500); res.end('fake server error'); }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port || 0, '127.0.0.1', () => {
      const p = server.address().port;
      resolve({ origin: `http://127.0.0.1:${p}`, port: p, hits, close: () => new Promise((r) => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); }) });
    });
  });
}

module.exports = { makeCtx, reply, startFakeServer, Reply };
