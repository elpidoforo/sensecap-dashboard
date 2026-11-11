'use strict';
/* One shared class sign-in for the AI Sustainable Cities site.
 * Set CLASS_LOGIN_USER and CLASS_LOGIN_PASSWORD (Railway variables, never in git). When both are set, the dashboard,
 * map, 3D view and /cities/ need this sign-in (or an individual student-app account or DASHBOARD_PASSWORD).
 * A shared password cannot tell students apart, so it only opens the site and the data. Saving projects and the
 * Build studio stay with individual student-app accounts, where a teacher can see who did what.
 */
const crypto = require('crypto');

const WEEK = 7 * 86400000;

function createClassLogin(env = process.env) {
  const user = String(env.CLASS_LOGIN_USER || '').trim().toLowerCase();
  const password = String(env.CLASS_LOGIN_PASSWORD || '');
  const enabled = Boolean(user && password);
  const key = crypto.createHash('sha256').update(`class-login|${user}|${password}`).digest();   // changing the password signs everyone out
  const hits = new Map();

  const sign = (exp) => crypto.createHmac('sha256', key).update('v1.' + exp).digest('base64url');
  const same = (a, b) => {
    const x = crypto.createHash('sha256').update(String(a)).digest();
    const y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
  };
  const cookies = (h) => {
    const out = {};
    for (const part of String(h || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
    return out;
  };
  const ip = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const tooMany = (req) => {
    const now = Date.now(), k = ip(req);
    const list = (hits.get(k) || []).filter((t) => now - t < 15 * 60000);
    hits.set(k, list);
    return list.length >= 8;
  };
  const miss = (req) => { const k = ip(req); hits.set(k, [...(hits.get(k) || []), Date.now()]); };
  const sweeper = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 15 * 60000)) hits.delete(k); }, 600000);
  sweeper.unref();

  function valid(req) {
    if (!enabled) return false;
    const v = cookies(req.headers.cookie).class_session;
    if (!v) return false;
    const [exp, mac] = v.split('.');
    if (!exp || !mac || !(Number(exp) > Date.now())) return false;
    try { return same(mac, sign(exp)); } catch (e) { return false; }
  }

  function readJson(req) {
    return new Promise((ok, bad) => {
      let size = 0;
      const parts = [];
      req.on('data', (c) => { size += c.length; if (size > 2048) { bad(new Error('too large')); req.destroy(); } else parts.push(c); });
      req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { bad(new Error('bad json')); } });
      req.on('error', bad);
    });
  }
  const send = (res, status, obj, headers) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(headers || {}) });
    res.end(JSON.stringify(obj));
  };
  const cookie = (req, value, maxAge) => `class_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${(req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted) ? '; Secure' : ''}`;

  async function handle(req, res, url) {
    const p = url.pathname;
    if (p !== '/cities/api/login' && p !== '/cities/api/logout' && p !== '/cities/api/session') return false;
    if (p === '/cities/api/session') { send(res, 200, { enabled, signedIn: valid(req) }); return true; }
    if (req.method !== 'POST') { send(res, 405, { error: 'Use POST.' }, { Allow: 'POST' }); return true; }
    if (req.headers.origin) {
      let ok = false;
      try { ok = new URL(req.headers.origin).host === req.headers.host; } catch (e) { /* bad origin */ }
      if (!ok) { send(res, 403, { error: 'Blocked: the request came from another site.' }); return true; }
    }
    if (p === '/cities/api/logout') { send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) }); return true; }
    if (!enabled) { send(res, 503, { error: 'The class sign-in is not switched on. Set CLASS_LOGIN_USER and CLASS_LOGIN_PASSWORD.' }); return true; }
    if (tooMany(req)) { send(res, 429, { error: 'Too many tries. Wait a few minutes.' }); return true; }
    let body;
    try { body = await readJson(req); } catch (e) { send(res, 400, { error: 'Send JSON.' }); return true; }
    const okUser = same(String(body.name || '').trim().toLowerCase(), user);
    const okPass = same(String(body.password || ''), password);
    if (!(okUser && okPass)) { miss(req); send(res, 401, { error: 'Wrong user name or password.' }); return true; }
    const exp = Date.now() + WEEK;
    send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, `${exp}.${sign(exp)}`, WEEK / 1000) });
    return true;
  }

  return { enabled, valid, handle };
}

module.exports = { createClassLogin };
