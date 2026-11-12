'use strict';
/* satellite/http.js: the ONLY way a satellite feed reaches the network (ctx.get).
 *
 *   makeGet({ id, hosts, transport?, allowLocalHttp?, onResult? }) -> get(url, opts)
 *
 *   get(url, { as: 'json' | 'text' | 'buffer', headers, timeoutMs, maxBytes, method: 'GET' | 'POST', body, full })
 *     -> the parsed value (json: parsed object, text: string, buffer: Buffer). With full: true -> { status, headers, url, body }.
 *
 * Rules (they cannot be switched off by a feed):
 *   - https only. The host must be EXACTLY one of the feed's `hosts` (no sub-domains, no "example.com.evil.net", no user:pass@, no
 *     IP addresses, no port other than 443). A feed lists every host it needs, a CDN included.
 *   - Redirects are followed by hand (at most 3). Every hop goes through the same check, https never falls back to http, and
 *     custom headers (a key, for example) are dropped when a hop changes host.
 *   - The User-Agent is always "SmartCitiesCyprus/1.0 (school project)". Never any cookie.
 *   - One time limit for the whole call, redirects and body included (default 20 s, never more than 20 s).
 *   - A size cap on the bytes after decompression (default 5 MB for json/text, 12 MB for buffers, never more than 32 MB).
 *   - A failure rejects with a SatelliteHttpError whose message is short and secret-free: the host and a reason, never the path or the
 *     query (a key may sit there). `err.code` is one of host, scheme, redirect, size, timeout, http, parse, network, args.
 *
 * `transport` and `allowLocalHttp` exist for tests only (satellite/testing.js). The registry never sets them.
 */

const UA = 'SmartCitiesCyprus/1.0 (school project)';
const LIMITS = Object.freeze({ timeoutMs: 20000, minTimeoutMs: 20, textBytes: 5 * 1024 * 1024, bufferBytes: 12 * 1024 * 1024, hardBytes: 32 * 1024 * 1024, redirects: 3 });

class SatelliteHttpError extends Error {
  constructor(code, message, extra) {
    super(message);
    this.name = 'SatelliteHttpError';
    this.code = code;
    if (extra) Object.assign(this, extra);
  }
}

const DNS_NAME = /^(?=.{4,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const IPV4ISH = /^[0-9.]+$/;
const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/;

// The feed's `hosts` list -> a Set of exact host names. Throws (with a plain message) when an entry is not a plain DNS name.
function normaliseHosts(list, opts) {
  const o = opts || {};
  if (!Array.isArray(list) || !list.length) throw new SatelliteHttpError('args', 'hosts must be a list with at least one host name');
  const out = new Set();
  for (const raw of list) {
    const h = String(raw == null ? '' : raw).trim().toLowerCase();
    if (o.allowLocalHttp && LOCAL.test(h)) { out.add(h); continue; }
    if (!DNS_NAME.test(h) || IPV4ISH.test(h)) throw new SatelliteHttpError('args', `"${h.slice(0, 60)}" is not a host name this module accepts (a plain DNS name, no scheme, port, path, wildcard or IP address)`);
    out.add(h);
  }
  return out;
}

const clampInt = (v, dflt, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt; };
const FORBIDDEN_HEADERS = new Set(['host', 'user-agent', 'connection', 'content-length', 'transfer-encoding', 'cookie', 'set-cookie', 'proxy-authorization', 'te', 'upgrade']);

function cleanHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    const key = String(k).toLowerCase();
    if (FORBIDDEN_HEADERS.has(key) || !/^[a-z0-9-]{1,60}$/.test(key) || v == null) continue;
    const val = String(v);
    if (/[\r\n\0]/.test(val) || val.length > 2000) continue;
    out[key] = val;
  }
  return out;
}

function makeGet(opts) {
  const o = opts || {};
  const hosts = normaliseHosts(o.hosts, o);
  const transport = o.transport || ((u, init) => fetch(u, init));
  const onResult = typeof o.onResult === 'function' ? o.onResult : null;
  const who = String(o.id || 'feed').slice(0, 60);

  // The check every request and every redirect hop goes through. Returns the parsed URL.
  function check(urlStr) {
    let u;
    try { u = new URL(String(urlStr)); } catch (e) { throw new SatelliteHttpError('host', 'the address is not valid'); }
    const h = u.hostname.toLowerCase();
    if (u.username || u.password) throw new SatelliteHttpError('host', `${h}: a user name or password in the address is not allowed`);
    if (u.protocol === 'http:' && o.allowLocalHttp && hosts.has(u.host.toLowerCase())) return u;   // tests, local fake servers only
    if (u.protocol !== 'https:') throw new SatelliteHttpError('scheme', `${h}: only https is allowed`);
    if (u.port && u.port !== '443') throw new SatelliteHttpError('host', `${h}: only the standard https port is allowed`);
    if (!hosts.has(h)) throw new SatelliteHttpError('host', `${h}: this host is not on the feed's list`);
    return u;
  }

  async function run(url, opt) {
    const q = opt || {};
    const as = q.as == null ? 'json' : String(q.as);
    if (!['json', 'text', 'buffer'].includes(as)) throw new SatelliteHttpError('args', 'as must be json, text or buffer');
    let method = String(q.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') throw new SatelliteHttpError('args', 'only GET and POST are allowed');
    const timeoutMs = clampInt(q.timeoutMs, LIMITS.timeoutMs, LIMITS.minTimeoutMs, LIMITS.timeoutMs);
    const maxBytes = clampInt(q.maxBytes, as === 'buffer' ? LIMITS.bufferBytes : LIMITS.textBytes, 1, LIMITS.hardBytes);
    let body = q.body == null ? undefined : q.body;
    const headers = { 'user-agent': UA, accept: as === 'json' ? 'application/json, */*;q=0.5' : '*/*', ...cleanHeaders(q.headers) };
    if (body != null && typeof body === 'object' && !Buffer.isBuffer(body) && !(body instanceof Uint8Array)) { body = JSON.stringify(body); if (!headers['content-type']) headers['content-type'] = 'application/json'; }
    if (method === 'GET') body = undefined;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);   // not unref'd on purpose: a call that hangs must still end by timing out, even in a short script
    const timedOut = () => new SatelliteHttpError('timeout', `no answer within ${timeoutMs < 1000 ? timeoutMs + ' ms' : Math.round(timeoutMs / 1000) + ' s'}`);
    let cur = String(url), hostNow = null;
    try {
      for (let hop = 0; ; hop++) {
        const u = check(cur);
        if (hostNow && hostNow !== u.host) {   // a new host: nothing the feed added (a key) goes along
          for (const k of Object.keys(headers)) if (k !== 'user-agent' && k !== 'accept') delete headers[k];
        }
        hostNow = u.host;
        let res;
        try { res = await transport(u.href, { method, headers, body, redirect: 'manual', signal: ctl.signal }); }
        catch (e) {
          if (ctl.signal.aborted) throw timedOut();
          throw new SatelliteHttpError('network', `${u.hostname}: ${String((e && e.cause && e.cause.code) || (e && e.code) || 'no connection').replace(/[^A-Za-z0-9_ .-]/g, '').slice(0, 40) || 'no connection'}`);
        }
        const st = res.status;
        const loc = res.headers && res.headers.get && res.headers.get('location');
        if (st >= 300 && st < 400 && loc) {
          try { await res.body.cancel(); } catch (e) { /* nothing to cancel */ }
          if (hop >= LIMITS.redirects) throw new SatelliteHttpError('redirect', `${u.hostname}: too many redirects`);
          let next;
          try { next = new URL(loc, u).href; } catch (e) { throw new SatelliteHttpError('redirect', `${u.hostname}: a redirect to an invalid address`); }
          try { check(next); } catch (e) { throw new SatelliteHttpError('redirect', `${u.hostname}: redirected to a place that is not allowed (${String(e.message).split(':')[0].slice(0, 80)})`); }
          if (st === 301 || st === 302 || st === 303) { method = 'GET'; body = undefined; delete headers['content-type']; }
          cur = next;
          continue;
        }
        if (st < 200 || st >= 300) {
          try { await res.body.cancel(); } catch (e) { /* nothing to cancel */ }
          const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
          throw new SatelliteHttpError('http', `${u.hostname}: HTTP ${st}`, { status: st, retryAfterSec: Number.isFinite(ra) && ra >= 0 ? Math.min(ra, 86400) : null });
        }
        const len = Number(res.headers.get('content-length'));
        if (Number.isFinite(len) && len > maxBytes) { try { await res.body.cancel(); } catch (e) { /* nothing to cancel */ } throw new SatelliteHttpError('size', `${u.hostname}: the answer is bigger than ${mbText(maxBytes)}`); }
        const chunks = [];
        let total = 0;
        try {
          if (res.body) {
            const reader = res.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              total += value.length;
              if (total > maxBytes) { try { await reader.cancel(); } catch (e) { /* ignore */ } throw new SatelliteHttpError('size', `${u.hostname}: the answer is bigger than ${mbText(maxBytes)}`); }
              chunks.push(value);
            }
          }
        } catch (e) {
          if (e instanceof SatelliteHttpError) throw e;
          if (ctl.signal.aborted) throw timedOut();
          throw new SatelliteHttpError('network', `${u.hostname}: the answer was cut off`);
        }
        const buf = Buffer.concat(chunks);
        let value;
        if (as === 'buffer') value = buf;
        else {
          const text = buf.toString('utf8').replace(/^﻿/, '');
          if (as === 'text') value = text;
          else { try { value = JSON.parse(text); } catch (e) { throw new SatelliteHttpError('parse', `${u.hostname}: the answer is not valid JSON`); } }
        }
        if (q.full) {
          const hdr = {};
          res.headers.forEach((v, k) => { if (k !== 'set-cookie') hdr[k] = v; });
          return { status: st, headers: hdr, url: u.origin + u.pathname, body: value };
        }
        return value;
      }
    } finally { clearTimeout(timer); }
  }

  return async function get(url, opt) {
    try {
      const v = await run(url, opt);
      if (onResult) { try { onResult(null); } catch (e) { /* the counter must never break a call */ } }
      return v;
    } catch (e) {
      const err = e instanceof SatelliteHttpError ? e : new SatelliteHttpError('network', 'the request failed');
      if (onResult) { try { onResult(err); } catch (e2) { /* ignore */ } }
      throw err;
    }
  };
}

const mbText = (n) => (n >= 1048576 ? `${Math.round((n / 1048576) * 10) / 10} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

module.exports = { makeGet, normaliseHosts, SatelliteHttpError, UA, LIMITS };
