'use strict';
/* "My watch" (public/site/pages/watch.js): the privacy check for the optional short title of a student's rule.
 *
 * POST /watch/api/title   { "title": "..." }  ->  200 { ok: true, title }   the cleaned title, safe to keep
 *                                                 422 { error, code: "title_private" }   it holds a link, an e-mail, a phone number or a handle
 * The rule and its title are kept only in the student's own browser. This endpoint stores NOTHING and logs nothing: it only runs the
 * site's existing checks (unsafeText from school.js, phoneLike from blocks.js, the same two the block builder uses for its titles),
 * so the rules for what a student may type live in one place. A small limit per address keeps it from being hammered.
 */
const { unsafeText } = require('./school');
const { phoneLike } = require('./blocks');

const TITLE_MAX = 40, BODY_MAX = 1024, PER_MINUTE = 30;
const hits = new Map();
function tooMany(req) {
  const ip = String(req.socket.remoteAddress || '?').slice(0, 64), t = Date.now();
  let h = hits.get(ip);
  if (!h || t - h[1] > 60000) { h = [0, t]; hits.set(ip, h); if (hits.size > 2000) { for (const [k, v] of hits) if (t - v[1] > 60000) hits.delete(k); if (hits.size > 4000) hits.clear(); } }
  return ++h[0] > PER_MINUTE;
}
function checkTitle(raw) {
  const title = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
  if (!title) return { ok: true, title: '' };
  const bad = unsafeText(title) || (phoneLike(title) ? 'Phone numbers are not allowed here.' : null);
  if (bad) return { ok: false, code: 'title_private', error: 'The title has something that should stay private. ' + bad.replace('in chat', 'here') };
  return { ok: true, title };
}
function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((ok, bad) => {
    const chunks = []; let n = 0, big = false;
    req.on('data', (c) => { n += c.length; if (n > BODY_MAX) big = true; else chunks.push(c); });
    req.on('end', () => { if (big) return ok(null); try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { ok(undefined); } });
    req.on('error', bad);
  });
}
async function handle(req, res, url) {
  if (url.pathname !== '/watch/api/title') return false;
  if (req.method !== 'POST') { send(res, 405, { error: 'Send the title with POST.' }); return true; }
  if (req.headers.origin) { let same = false; try { same = new URL(req.headers.origin).host === req.headers.host; } catch (e) { /* not a URL */ } if (!same) { send(res, 403, { error: 'This check only answers the site itself.' }); return true; } }
  if (tooMany(req)) { send(res, 429, { error: 'Too many checks, try again in a minute.' }); return true; }
  const body = await readBody(req);
  if (body === null) { send(res, 413, { error: 'That title is too long.' }); return true; }
  if (!body || typeof body !== 'object' || Array.isArray(body) || (body.title != null && typeof body.title !== 'string')) { send(res, 400, { error: 'Send JSON such as {"title":"Hot afternoons"}.' }); return true; }
  const r = checkTitle(body.title);
  send(res, r.ok ? 200 : 422, r.ok ? { ok: true, title: r.title } : { error: r.error, code: r.code });
  return true;
}
module.exports = { handle, checkTitle, TITLE_MAX };
