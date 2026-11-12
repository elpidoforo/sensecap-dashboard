'use strict';
/* safefetch.js: a server-side fetch that cannot be turned against our own network (SSRF), for the future "the guide researches the
   internet" phase. LIBRARY ONLY: nothing in the app calls it yet. No npm dependencies (Node http, https, dns, net, zlib).

   What it does, in order, for the first URL and again for every redirect hop:
     1. The URL is parsed once by the WHATWG parser and only the PARSED parts are used from then on (no second parser, no string tricks).
        The parser also turns odd IP spellings into one form: http://2130706433/, http://0x7f000001/, http://0177.0.0.1/, http://127.1/,
        http://[::ffff:7f00:1]/ all become 127.0.0.1 or [::ffff:7f00:1], and those are judged as IP addresses.
     2. Only http and https, no user name or password in the URL, only the ports in `ports` (default 80 and 443), no host without a dot
        (localhost, intranet names), no .local / .internal / .localhost names, and the host must match the `allowHosts` list.
     3. The host name is resolved HERE, every address it returns must be a public address (any blocked one rejects the whole answer),
        and the connection is made to those checked addresses (the lookup the socket uses just hands them back), so a name cannot
        change its answer between the check and the connect (DNS rebinding). The address the socket really connected to is checked again.
     4. Redirects are followed by hand: at most `maxRedirects` (3), each hop goes through steps 1 to 3 again, https never falls back to http.
     5. Caps: total time (default 10 s, never more than 20 s, redirects and DNS included), body size (default 1 MB, after decompression
        too), a content-type allowlist (HTML, text, JSON, XML, CSV by default), and a fixed small set of request headers: no cookies are sent or
        kept, no Authorization, no Referer. Set-Cookie is never exposed.
   Blocked address ranges (anything not a plain public unicast address): 0.0.0.0/8, 10/8, 100.64/10 (CGNAT, also Alibaba metadata),
   127/8, 169.254/16 (link-local, cloud metadata 169.254.169.254), 172.16/12, 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15,
   198.51.100/24, 203.0.113/24, multicast 224/4, reserved 240/4 (incl. broadcast), Azure 168.63.129.16; IPv6: everything outside 2000::/3,
   plus ::ffff:0:0/96 (IPv4-mapped), 64:ff9b::/96 and 64:ff9b:1::/48 (NAT64), 2001::/23 (Teredo and other protocol ranges), 2001:db8::/32,
   2002::/16 (6to4), 3fff::/20, and with them the unique-local range fc00::/7 (the range private networks of hosting platforms usually use, and AWS fd00:ec2::254), fe80::/10,
   multicast ff00::/8. A zone id (fe80::1%eth0) is refused.

   Ported from azu/request-filtering-agent (MIT, https://github.com/azu/request-filtering-agent, v3.2.1, commit 29dd910): the rule "only a plain
   unicast address may be connected to", checking every address the lookup returns, and checking an address written straight into the URL.
   Not copied: that package needs ipaddr.js and is an http.Agent, which filters the address when the socket connects but does not follow redirects by
   hand, cap time or size, or check content types, and its README says its own deny list is not a security boundary and recommends blocking at the network
   layer as well. Here the range table is our own, written for this file, and the extra limits are added around it. Do both in production: this file
   and, where the host allows it, an egress rule that blocks the same ranges.

   Not covered (say so to whoever wires it in): it connects directly, so it ignores HTTP_PROXY settings and cannot be used to reach a service on
   Railway's private network (those addresses are blocked on purpose; give such a service its own code path). It stops network abuse. It does
   not stop a prompt injection inside the page text, and an allowed host can still serve something nasty or redirect to another allowed host. */

const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const zlib = require('node:zlib');
const { domainToASCII } = require('node:url');

const DEFAULTS = Object.freeze({
  userAgent: 'SmartCitiesCyprus/1.0 (school project)',
  maxBytes: 1000000,
  timeoutMs: 10000,
  maxTimeoutMs: 20000,
  maxRedirects: 3,
  protocols: Object.freeze(['http:', 'https:']),
  ports: Object.freeze([80, 443]),
  contentTypes: Object.freeze(['text/html', 'text/plain', 'text/xml', 'text/csv', 'application/xml', 'application/json', 'application/xhtml+xml', 'application/rss+xml', 'application/atom+xml']),
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,text/plain;q=0.7,*/*;q=0.1',
});

class SafeFetchError extends Error {
  constructor(code, message, extra) {
    super(message);
    this.name = 'SafeFetchError';
    this.code = code;
    if (extra) Object.assign(this, extra);
  }
}

// A URL for messages and logs: no user info, no query (it may hold a key), no fragment.
function redactUrl(u) {
  try { const x = u instanceof URL ? u : new URL(String(u)); return `${x.protocol}//${x.host}${x.pathname}`.slice(0, 200); } catch (e) { return '(bad url)'; }
}

/* ---------- IP addresses ---------- */

function parseIPv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const b = m.slice(1).map(Number);
  return b.every((x) => x <= 255) ? b : null;
}
function parseIPv6(s) {
  if (s.includes('%') || !net.isIPv6(s)) return null;   // zone ids are refused
  const m = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);         // an IPv4 tail (::ffff:1.2.3.4) becomes two groups
  if (m) { const v4 = parseIPv4(m[2]); if (!v4) return null; s = m[1] + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16); }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [], tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const groups = [...head, ...(halves.length === 2 ? Array(fill).fill('0') : []), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  const bytes = [];
  for (const g of groups) { const n = parseInt(g, 16); bytes.push(n >> 8, n & 255); }
  return bytes;
}
function parseIp(s) {
  s = String(s);
  if (net.isIPv4(s)) { const b = parseIPv4(s); return b ? { v: 4, bytes: b } : null; }
  if (net.isIPv6(s)) { const b = parseIPv6(s); return b ? { v: 6, bytes: b } : null; }
  return null;
}
function inCidr(bytes, base, prefix) {
  let bits = prefix;
  for (let i = 0; i < base.length && bits > 0; i++, bits -= 8) {
    const mask = bits >= 8 ? 255 : (255 << (8 - bits)) & 255;
    if ((bytes[i] & mask) !== (base[i] & mask)) return false;
  }
  return true;
}
function cidr(text) {
  const [addr, len] = String(text).split('/');
  const ip = parseIp(addr);
  const prefix = len === undefined ? (ip ? ip.bytes.length * 8 : -1) : Number(len);
  if (!ip || !Number.isInteger(prefix) || prefix < 0 || prefix > ip.bytes.length * 8) throw new SafeFetchError('bad_config', `Not an address range: ${text}`);
  return { v: ip.v, base: ip.bytes, prefix };
}

// [range, label]. The first range that holds the address names the reason. IPv4 is blocked by these ranges; IPv6 only allows 2000::/3 minus these.
const V4_BLOCKED = [
  ['169.254.169.254/32', 'metadata'], ['169.254.170.2/32', 'metadata'], ['100.100.100.200/32', 'metadata'], ['168.63.129.16/32', 'metadata'], ['192.0.0.192/32', 'metadata'],
  ['0.0.0.0/8', 'unspecified'], ['10.0.0.0/8', 'private'], ['100.64.0.0/10', 'cgnat'], ['127.0.0.0/8', 'loopback'], ['169.254.0.0/16', 'link-local'],
  ['172.16.0.0/12', 'private'], ['192.0.0.0/24', 'reserved'], ['192.0.2.0/24', 'documentation'], ['192.88.99.0/24', 'reserved'], ['192.168.0.0/16', 'private'],
  ['198.18.0.0/15', 'benchmark'], ['198.51.100.0/24', 'documentation'], ['203.0.113.0/24', 'documentation'], ['224.0.0.0/4', 'multicast'], ['240.0.0.0/4', 'reserved'],
].map(([c, label]) => ({ ...cidr(c), label }));
const V6_BLOCKED = [
  ['::1/128', 'loopback'], ['::/128', 'unspecified'], ['::ffff:0:0/96', 'ipv4-mapped'], ['::/96', 'ipv4-compatible'], ['64:ff9b::/96', 'nat64'], ['64:ff9b:1::/48', 'nat64'],
  ['fd00:ec2::254/128', 'metadata'], ['fc00::/7', 'private'], ['fe80::/10', 'link-local'], ['fec0::/10', 'private'], ['ff00::/8', 'multicast'], ['100::/64', 'reserved'],
  ['2001::/23', 'reserved'], ['2001:db8::/32', 'documentation'], ['2002::/16', 'reserved'], ['3fff::/20', 'documentation'], ['5f00::/16', 'reserved'],
].map(([c, label]) => ({ ...cidr(c), label }));
const V6_GLOBAL = cidr('2000::/3');

// { blocked, reason } for one address (text). Anything that is not an address is blocked.
function classifyIp(text, exceptions) {
  const ip = parseIp(text);
  if (!ip) return { blocked: true, reason: 'not-an-ip' };
  for (const e of exceptions || []) if (e.v === ip.v && inCidr(ip.bytes, e.base, e.prefix)) return { blocked: false, reason: 'allowed-by-exception' };
  if (ip.v === 4) {
    if (ip.bytes.join('.') === '255.255.255.255') return { blocked: true, reason: 'broadcast' };
    for (const r of V4_BLOCKED) if (inCidr(ip.bytes, r.base, r.prefix)) return { blocked: true, reason: r.label };
    return { blocked: false, reason: 'public' };
  }
  for (const r of V6_BLOCKED) if (inCidr(ip.bytes, r.base, r.prefix)) return { blocked: true, reason: r.label };
  if (!inCidr(ip.bytes, V6_GLOBAL.base, V6_GLOBAL.prefix)) return { blocked: true, reason: 'not-global-unicast' };
  return { blocked: false, reason: 'public' };
}
const isBlockedIp = (text, exceptions) => classifyIp(text, exceptions).blocked;

/* ---------- host names ---------- */

function normHost(h) { return String(h).toLowerCase().replace(/\.$/, ''); }
function hostPattern(p) {
  const s = String(p).trim().toLowerCase();
  const wild = s.startsWith('*.');
  const raw = wild ? s.slice(2) : s;
  const body = /[\s/:@*?#\\\[\]%]/.test(raw) ? '' : domainToASCII(raw);   // judged on the text as written: the URL parser would quietly cut "example.org/path" down to "example.org"
  if (!body) throw new SafeFetchError('bad_config', `Not a host pattern: ${p}`);
  return { wild, host: body.replace(/\.$/, '') };
}
// "example.org" matches only example.org; "*.example.org" matches any sub-domain (a.example.org, a.b.example.org) but not example.org itself.
function matchHost(host, patterns) {
  const h = normHost(host);
  return patterns.some((p) => (p.wild ? h.endsWith('.' + p.host) && h.length > p.host.length + 1 : h === p.host));
}
const LOCAL_NAME = /(^|\.)(localhost|local|internal|localdomain|home\.arpa|lan|intranet|corp|private)$/;

/* ---------- checking a URL (no network) ---------- */

const positive = (v, dflt) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : dflt);

function configOf(opts) {
  opts = opts || {};
  if (!Array.isArray(opts.allowHosts) || !opts.allowHosts.length) throw new SafeFetchError('bad_config', 'allowHosts is required: a list of host names, for example ["www.example.org", "*.europa.eu"].');
  const maxTimeout = DEFAULTS.maxTimeoutMs;
  return {
    patterns: opts.allowHosts.map(hostPattern),
    exceptions: (opts.allowIpRanges || []).map(cidr),
    protocols: opts.protocols || DEFAULTS.protocols,
    ports: opts.ports || DEFAULTS.ports,
    maxBytes: Math.max(1, Math.min(positive(opts.maxBytes, DEFAULTS.maxBytes), 20000000)),
    timeoutMs: Math.max(200, Math.min(positive(opts.timeoutMs, DEFAULTS.timeoutMs), maxTimeout)),
    maxRedirects: Number.isInteger(opts.maxRedirects) ? Math.max(0, Math.min(opts.maxRedirects, 10)) : DEFAULTS.maxRedirects,
    contentTypes: (opts.contentTypes || DEFAULTS.contentTypes).map((x) => String(x).toLowerCase()),
    userAgent: String(opts.userAgent || DEFAULTS.userAgent).replace(/[\r\n]/g, ' ').slice(0, 200),
    accept: String(opts.accept || DEFAULTS.accept).replace(/[\r\n]/g, ' ').slice(0, 300),
    lookup: typeof opts.lookup === 'function' ? opts.lookup : null,
    ca: opts.ca,
  };
}

// Returns { url, host, port, ip } (ip = the address when the URL has one written in it) or throws SafeFetchError.
function checkUrl(input, opts) {
  const cfg = opts && opts._cfg ? opts._cfg : configOf(opts);
  if (typeof input !== 'string' || !input || input.length > 2048) throw new SafeFetchError('bad_url', 'The address is missing, not text, or too long.');
  let u;
  try { u = new URL(input); } catch (e) { throw new SafeFetchError('bad_url', 'The address cannot be read.'); }
  if (!cfg.protocols.includes(u.protocol)) throw new SafeFetchError('bad_scheme', `Only ${cfg.protocols.join(' and ')} addresses are allowed (got ${u.protocol}).`);
  if (u.username || u.password) throw new SafeFetchError('credentials', 'A user name or password inside the address is not allowed.');
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (!cfg.ports.includes(port)) throw new SafeFetchError('bad_port', `Port ${port} is not allowed.`);
  const host = normHost(u.hostname.replace(/^\[|\]$/g, ''));
  if (!host) throw new SafeFetchError('bad_url', 'The address has no host.');
  const literal = net.isIP(host) ? host : null;
  if (literal) {
    const c = classifyIp(literal, cfg.exceptions);
    if (c.blocked) throw new SafeFetchError('blocked_ip', `The address ${literal} is not a public address (${c.reason}).`, { reason: c.reason });
  } else {
    if (!host.includes('.') || LOCAL_NAME.test(host)) throw new SafeFetchError('bad_host', `The host name ${host} is not a public name.`);
  }
  if (!matchHost(host, cfg.patterns)) throw new SafeFetchError('host_not_allowed', `The host ${host} is not on the list of allowed hosts.`, { host });
  return { url: u, host, port, ip: literal };
}

/* ---------- name resolution ---------- */

async function resolveHost(host, cfg, signal) {
  if (net.isIP(host)) return [{ address: host, family: net.isIPv6(host) ? 6 : 4 }];
  const lookup = cfg.lookup || ((h) => dns.promises.lookup(h, { all: true, verbatim: true }));
  const aborted = new Promise((_, reject) => { const on = () => reject(new SafeFetchError('timeout', 'The time limit ran out while looking up the host name.')); if (signal.aborted) on(); else signal.addEventListener('abort', on, { once: true }); });
  let list;
  try { list = await Promise.race([Promise.resolve(lookup(host)), aborted]); } catch (e) {
    if (e instanceof SafeFetchError) throw e;
    throw new SafeFetchError('dns_failed', `The host name ${host} could not be looked up.`);
  }
  list = (Array.isArray(list) ? list : [list]).filter(Boolean).map((x) => (typeof x === 'string' ? { address: x, family: net.isIP(x) } : { address: String(x.address), family: x.family || net.isIP(String(x.address)) }));
  if (!list.length) throw new SafeFetchError('dns_failed', `The host name ${host} has no address.`);
  for (const a of list) {   // one blocked address spoils the whole answer
    const c = classifyIp(a.address, cfg.exceptions);
    if (c.blocked) throw new SafeFetchError('blocked_ip', `The host name ${host} points to an address that is not public (${c.reason}).`, { reason: c.reason, host, address: a.address });
  }
  return list.slice(0, 16);
}

/* ---------- one request ---------- */

const REDIRECT = new Set([301, 302, 303, 307, 308]);

function decoderFor(encoding) {
  const e = String(encoding || '').trim().toLowerCase();
  if (!e || e === 'identity') return null;
  if (e === 'gzip' || e === 'x-gzip') return zlib.createGunzip();
  if (e === 'deflate') return zlib.createInflate();
  if (e === 'br') return zlib.createBrotliDecompress();
  throw new SafeFetchError('unsupported_encoding', `The answer uses an encoding we do not read (${e.slice(0, 20)}).`);
}

function once(step, addresses, cfg, signal) {
  return new Promise((resolve, reject) => {
    const { url: u, host, port } = step;
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    // The socket must use exactly the addresses that were checked. The answer is given on the next tick, like the real dns.lookup does:
    // answered at once, a connect that fails on the spot (an IPv6 address on a machine without IPv6) emits its error before the request
    // has attached its listener, and an unhandled 'error' event ends the whole process.
    const pinned = (hostname, o, cb) => {
      if (o && o.all) process.nextTick(cb, null, addresses.map((a) => ({ address: a.address, family: a.family })));
      else process.nextTick(cb, null, addresses[0].address, addresses[0].family);
    };
    let done = false;
    const fail = (err) => {
      if (done) return; done = true;
      try { req.destroy(); } catch (e) { /* gone */ }
      if (err instanceof SafeFetchError) return reject(err);
      reject(signal.aborted ? new SafeFetchError('timeout', 'The time limit ran out.') : new SafeFetchError('network', 'The connection failed.', { cause: err && err.code }));
    };
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    let req;
    try { req = lib.request({
      protocol: u.protocol, hostname: host, port, path: u.pathname + u.search, method: 'GET', agent: false, lookup: pinned, signal, maxHeaderSize: 16384,
      servername: net.isIP(host) ? undefined : host, ca: cfg.ca,
      headers: { Host: u.host, 'User-Agent': cfg.userAgent, Accept: cfg.accept, 'Accept-Encoding': 'gzip, deflate, br', Connection: 'close' },
    }); } catch (e) { return reject(new SafeFetchError('network', 'The request could not be started.')); }
    req.setTimeout(Math.min(cfg.timeoutMs, 8000), () => fail(new SafeFetchError('timeout', 'The server stopped answering.')));
    req.on('socket', (sock) => {   // the address really connected to is checked once more
      sock.once('connect', () => { if (sock.remoteAddress && classifyIp(sock.remoteAddress, cfg.exceptions).blocked) fail(new SafeFetchError('blocked_ip', 'The connection went to an address that is not public.')); });
    });
    req.on('error', fail);
    req.on('response', (res) => {
      const status = res.statusCode || 0;
      const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (REDIRECT.has(status)) {
        const loc = res.headers.location;
        res.resume(); res.destroy();
        if (typeof loc !== 'string' || !loc || loc.length > 2048) return fail(new SafeFetchError('bad_redirect', 'A redirect without a usable address.'));
        return finish({ redirect: loc, status });
      }
      if (status < 200 || status > 299 || status === 204 || status === 205) { res.resume(); res.destroy(); return finish({ status, body: Buffer.alloc(0), contentType: type }); }
      if (!type || !cfg.contentTypes.includes(type)) { res.destroy(); return fail(new SafeFetchError('bad_content_type', `The answer is of a kind we do not read (${type || 'no content type'}).`)); }
      const len = Number(res.headers['content-length']);
      if (Number.isFinite(len) && len > cfg.maxBytes) { res.destroy(); return fail(new SafeFetchError('too_large', 'The answer is larger than the limit.')); }
      let decoder;
      try { decoder = decoderFor(res.headers['content-encoding']); } catch (e) { res.destroy(); return fail(e); }
      const chunks = []; let size = 0, raw = 0;
      const take = (c) => { size += c.length; if (size > cfg.maxBytes) { res.destroy(); if (decoder) decoder.destroy(); return fail(new SafeFetchError('too_large', 'The answer is larger than the limit.')); } chunks.push(c); };
      const end = () => finish({ status, body: Buffer.concat(chunks), contentType: type, charsetHeader: String(res.headers['content-type'] || ''), lastModified: String(res.headers['last-modified'] || '') });
      res.on('error', fail);
      if (decoder) {
        res.on('data', (c) => { raw += c.length; if (raw > cfg.maxBytes) { res.destroy(); decoder.destroy(); fail(new SafeFetchError('too_large', 'The answer is larger than the limit.')); } else decoder.write(c); });
        res.on('end', () => decoder.end());
        decoder.on('data', take); decoder.on('end', () => { end(); res.destroy(); });   // the packed data is complete: anything after it is not read
        decoder.on('error', () => fail(new SafeFetchError('bad_encoding', 'The answer could not be unpacked.')));
      } else { res.on('data', take); res.on('end', end); }
      res.on('close', () => { if (!res.complete) fail(new SafeFetchError('network', 'The connection closed before the answer was complete.')); });
    });
    req.end();
  });
}

function decodeText(buf, header) {
  const m = /charset\s*=\s*"?([\w.:-]+)/i.exec(header || '');
  try { return new TextDecoder(m ? m[1].toLowerCase() : 'utf-8').decode(buf); } catch (e) { return new TextDecoder('utf-8').decode(buf); }
}

/* ---------- the function ---------- */

async function safeFetch(input, opts) {
  const cfg = configOf(opts);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs);
  const visited = new Set(), hops = [];
  try {
    let current = input, startedHttps = null;
    for (let hop = 0; ; hop++) {
      const step = checkUrl(current, { _cfg: cfg });
      if (startedHttps === null) startedHttps = step.url.protocol === 'https:';
      else if (startedHttps && step.url.protocol !== 'https:') throw new SafeFetchError('redirect_downgrade', 'A redirect from https to http is not followed.');
      const key = step.url.href.split('#')[0];
      if (visited.has(key)) throw new SafeFetchError('redirect_loop', 'The redirects go in a circle.');
      visited.add(key);
      const addresses = await resolveHost(step.host, cfg, ac.signal);
      const r = await once(step, addresses, cfg, ac.signal);
      if (r.redirect !== undefined) {
        if (hop >= cfg.maxRedirects) throw new SafeFetchError('too_many_redirects', `More than ${cfg.maxRedirects} redirects.`);
        let next;
        try { next = new URL(r.redirect, step.url).href; } catch (e) { throw new SafeFetchError('bad_redirect', 'A redirect to an address that cannot be read.'); }
        hops.push(redactUrl(step.url));
        current = next;
        continue;
      }
      const ok = r.status >= 200 && r.status <= 299;
      return {
        ok, status: r.status, url: step.url.href.split('#')[0], redirects: hops, contentType: r.contentType || '', bytes: r.body.length,
        body: r.body, text: ok && r.body.length ? decodeText(r.body, r.charsetHeader) : '', lastModified: r.lastModified || '',
      };
    }
  } catch (e) {
    if (e instanceof SafeFetchError) throw e;
    if (ac.signal.aborted) throw new SafeFetchError('timeout', 'The time limit ran out.');
    throw new SafeFetchError('network', 'The request failed.');
  } finally { clearTimeout(timer); }
}

module.exports = { safeFetch, checkUrl, classifyIp, isBlockedIp, matchHost, hostPattern, redactUrl, SafeFetchError, DEFAULTS, V4_BLOCKED, V6_BLOCKED, _config: configOf };
