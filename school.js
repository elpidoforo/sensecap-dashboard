'use strict';
/* Student and team app: accounts with school codes and teacher approval, group chat with moderation, and the assistant.
   Everything lives in one SQLite file on the volume (node:sqlite, Node 22.5+). No personal data beyond a display name. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { /* older Node: the app switches itself off */ }

const SCHOOLS = [
  { slug: 'pascal-larnaka', name: 'PASCAL Larnaka', short: 'PASCAL Larnaka', lat: 34.9229, lng: 33.6233, match: 'larnaka,larnaca' },
  { slug: 'pascal-lefkosia', name: 'PASCAL Lefkosia', short: 'PASCAL Lefkosia', lat: 35.1856, lng: 33.3823, match: 'lefkosia,nicosia' },
  { slug: 'pascal-limassol', name: 'PASCAL Limassol', short: 'PASCAL Limassol', lat: 34.6841, lng: 33.0379, match: 'limassol,lemesos' },
  { slug: 'paphos-international', name: 'International School of Paphos', short: 'Paphos International', lat: 34.7754, lng: 32.4245, match: 'paphos,pafos' },
];

const DAY = 86400000;
const SESSION_DAYS = 30;
const CHAT_RETENTION_DAYS = Number(process.env.CHAT_RETENTION_DAYS) || 400;
const BOT_LOG_DAYS = Number(process.env.BOT_LOG_DAYS) || 90;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REPORT_REASONS = { unkind: 'Unkind or bullying', inappropriate: 'Inappropriate', private: 'Shares private information', other: 'Something else' };

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code || null; }
}
const fail = (status, message, code) => { throw new HttpError(status, message, code); };

/* ---------- small helpers ---------- */

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const makeCode = () => {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s.slice(0, 4) + '-' + s.slice(4);
};
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const nameKey = (n) => String(n).normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el').replace(/[\s._'’-]+/g, ' ').trim();
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const scrypt = (pw, salt) => new Promise((ok, bad) => crypto.scrypt(String(pw).normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? bad(e) : ok(k))));
async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('hex'), hash: (await scrypt(pw, salt)).toString('hex') };
}
async function checkPw(pw, salt, hash) {
  if (!hash || !salt) { await scrypt(pw, Buffer.alloc(16)); return false; }   // same cost whether or not the account exists
  const h = await scrypt(pw, Buffer.from(salt, 'hex'));
  const want = Buffer.from(hash, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}
const tempPassword = () => {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length].toLowerCase();
  return s;
};

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._'’-]{1,23}$/u;
const IMPERSONATION = /(admin|teacher|moderator|staff|assistant|principal|headmaster|claude|anthropic|\bbot\b)/i;
function checkName(name, role) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(n)) fail(400, 'Use 2 to 24 letters or numbers for your display name (no @ or symbols).', 'name');
  if (/\d{5,}/.test(n)) fail(400, 'A display name cannot hold a long number.', 'name');
  if (role === 'student' && IMPERSONATION.test(n)) fail(400, 'That name looks like a staff name. Pick another.', 'name');
  return n;
}
function checkPassword(pw, name) {
  if (typeof pw !== 'string' || pw.length < 8) fail(400, 'The password needs at least 8 characters.', 'password');
  if (pw.length > 100) fail(400, 'The password is too long.', 'password');
  if (nameKey(pw) === nameKey(name || '')) fail(400, 'The password cannot be the same as your name.', 'password');
  if (/^(12345678|password|qwertyui|11111111|00000000)/i.test(pw)) fail(400, 'That password is too easy to guess.', 'password');
}

// Phone numbers, e-mails, links and handles are kept out of student chat. Teachers can post links.
const PHONE_RE = /(?:(?:\+|\b00)\d{2,3}[\s-]?\d{6,10}|\b\d{8,}\b|\b\d{2}[\s-]\d{6}\b|\b\d{3}[\s-]\d{3}[\s-]\d{3,4}\b)/;
function unsafeText(body) {
  if (/https?:\/\/|www\./i.test(body)) return 'Links are not allowed in chat.';
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(body)) return 'E-mail addresses are not allowed in chat.';
  if (/\b[\w-]{2,}\.(com|org|net|io|cy|gr|uk|me|ly|gg|tv|app|xyz)\b/i.test(body)) return 'Links are not allowed in chat.';
  if (PHONE_RE.test(body.replace(/\d+[.,]\d+/g, 'N'))) return 'Phone numbers are not allowed in chat.';
  if (/(^|\s)@\w{3,}/.test(body)) return 'Please do not share social media handles.';
  return null;
}

function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function readJson(req, limit = 32768) {
  return new Promise((ok, bad) => {
    if (req.method === 'GET' || req.method === 'HEAD') return ok({});
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) return bad(new HttpError(415, 'Send JSON.'));
    let size = 0;
    const parts = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { bad(new HttpError(413, 'That request is too large.')); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => {
      if (!parts.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch (e) { bad(new HttpError(400, 'Invalid JSON.')); }
    });
    req.on('error', bad);
  });
}

/* A tiny sliding-window limiter, kept in memory. */
class Limiter {
  constructor() { this.hits = new Map(); }
  take(key, max, windowMs) {
    const now = Date.now();
    const list = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) { this.hits.set(key, list); return Math.ceil((list[0] + windowMs - now) / 1000); }
    list.push(now);
    this.hits.set(key, list);
    return 0;
  }
  count(key, windowMs) {
    const now = Date.now();
    return (this.hits.get(key) || []).filter((t) => now - t < windowMs).length;
  }
  clear(key) { this.hits.delete(key); }
  sweep(windowMs = 3600000) {
    const now = Date.now();
    for (const [k, v] of this.hits) if (!v.length || now - v[v.length - 1] > windowMs) this.hits.delete(k);
  }
}

/* ---------- the app ---------- */

function createApp(opts = {}) {
  const dataDir = opts.dataDir;
  const log = opts.log || ((m) => console.log(m));
  if (!DatabaseSync) {
    return {
      enabled: false,
      reason: 'The student app needs Node 22.5 or newer (node:sqlite).',
      handle: async (req, res, url) => {
        if (!url.pathname.startsWith('/app/api/')) return false;
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'The student app needs Node 22.5 or newer.' }));
        return true;
      },
      authorise: () => null,
      close() {},
    };
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = opts.dbFile || path.join(dataDir, 'app.db');
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, short TEXT NOT NULL,
      student_code TEXT NOT NULL, teacher_code TEXT NOT NULL, match TEXT NOT NULL DEFAULT '', lat REAL, lng REAL
    );
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id), name TEXT NOT NULL,
      device_eui TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, school_id INTEGER REFERENCES schools(id), name TEXT NOT NULL, name_key TEXT NOT NULL,
      pw_salt TEXT, pw_hash TEXT, role TEXT NOT NULL, status TEXT NOT NULL, team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL, approved_by INTEGER, approved_at INTEGER, last_seen INTEGER DEFAULT 0,
      muted_until INTEGER DEFAULT 0, mute_reason TEXT, consent_at INTEGER, must_change INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS users_school ON users(school_id, role, status);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY, channel TEXT NOT NULL, user_id INTEGER NOT NULL, body TEXT NOT NULL,
      created_at INTEGER NOT NULL, deleted_at INTEGER, deleted_by INTEGER
    );
    CREATE INDEX IF NOT EXISTS messages_channel ON messages(channel, id);
    CREATE TABLE IF NOT EXISTS reads (user_id INTEGER NOT NULL, channel TEXT NOT NULL, last_id INTEGER NOT NULL, PRIMARY KEY (user_id, channel));
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref_id INTEGER NOT NULL, reporter_id INTEGER, reason TEXT, note TEXT,
      created_at INTEGER NOT NULL, school_id INTEGER, author_id INTEGER, author_role TEXT, snapshot TEXT,
      resolved_at INTEGER, resolved_by INTEGER, outcome TEXT
    );
    CREATE TABLE IF NOT EXISTS bot_logs (
      id INTEGER PRIMARY KEY, user_id INTEGER, school_id INTEGER, created_at INTEGER NOT NULL, question TEXT, answer TEXT,
      tools TEXT, ms INTEGER, tokens_in INTEGER, tokens_out INTEGER, error TEXT
    );
    CREATE INDEX IF NOT EXISTS bot_logs_user ON bot_logs(user_id, created_at);
    CREATE TABLE IF NOT EXISTS handbook (id INTEGER PRIMARY KEY, title TEXT UNIQUE NOT NULL, body TEXT NOT NULL, updated_at INTEGER, updated_by INTEGER);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor_id INTEGER, action TEXT NOT NULL, target TEXT, detail TEXT);
  `);

  const stmts = new Map();
  const prep = (sql) => { let s = stmts.get(sql); if (!s) { s = db.prepare(sql); stmts.set(sql, s); } return s; };
  const get = (sql, ...p) => prep(sql).get(...p);
  const all = (sql, ...p) => prep(sql).all(...p);
  const run = (sql, ...p) => { const r = prep(sql).run(...p); return { changes: Number(r.changes), id: Number(r.lastInsertRowid) }; };
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* already rolled back */ } throw e; }
  };
  const audit = (actor, action, target, detail) => run('INSERT INTO audit(at, actor_id, action, target, detail) VALUES (?,?,?,?,?)', Date.now(), actor ? actor.id : null, action, target == null ? null : String(target), detail == null ? null : String(detail).slice(0, 500));

  if (!get('SELECT 1 AS x FROM schools LIMIT 1')) {
    for (const s of SCHOOLS) run('INSERT INTO schools(slug, name, short, student_code, teacher_code, match, lat, lng) VALUES (?,?,?,?,?,?,?,?)', s.slug, s.name, s.short, makeCode(), makeCode(), s.match, s.lat, s.lng);
    log('Student app: created the four schools with new join codes');
  }
  const knowledge = require('./knowledge');
  if (!get("SELECT value FROM meta WHERE key = 'handbook_seeded'")) {
    for (const k of knowledge.STARTER) run('INSERT OR IGNORE INTO handbook(title, body, updated_at) VALUES (?,?,?)', k.title, k.body, Date.now());
    run("INSERT OR REPLACE INTO meta(key, value) VALUES ('handbook_seeded', '1')");
  }

  const limiter = new Limiter();
  const sweeper = setInterval(() => limiter.sweep(), 600000);
  sweeper.unref();

  /* ---------- users, sessions ---------- */

  const schoolOf = (id) => (id == null ? null : get('SELECT * FROM schools WHERE id = ?', id));
  const teamOf = (id) => (id == null ? null : get('SELECT * FROM teams WHERE id = ?', id));
  const userRow = (id) => get('SELECT * FROM users WHERE id = ?', id);

  function publicUser(u, forSelf) {
    if (!u) return null;
    const school = schoolOf(u.school_id), team = teamOf(u.team_id);
    const out = {
      id: u.id, name: u.name, role: u.role, status: u.status,
      school: school ? { id: school.id, name: school.name, short: school.short, lat: school.lat, lng: school.lng, match: school.match } : null,
      team: team ? { id: team.id, name: team.name, device: team.device_eui || null } : null,
    };
    if (forSelf) { out.muted_until = u.muted_until > Date.now() ? u.muted_until : 0; out.mute_reason = out.muted_until ? u.mute_reason : null; out.must_change = !!u.must_change; }
    return out;
  }

  function createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    run('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)', sha(token), userId, now, now + SESSION_DAYS * DAY);
    return token;
  }
  const isHttps = (req) => (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || !!req.socket.encrypted;
  function cookie(req, token, maxAge) {
    return `sc_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
  }
  // Returns the user behind the session cookie, for any status (pending users can only see the waiting screen).
  function sessionUser(req) {
    const token = parseCookies(req.headers.cookie).sc_sid;
    if (!token) return null;
    const s = get('SELECT * FROM sessions WHERE token_hash = ?', sha(token));
    if (!s) return null;
    const now = Date.now();
    if (s.expires_at < now) { run('DELETE FROM sessions WHERE token_hash = ?', s.token_hash); return null; }
    const u = userRow(s.user_id);
    if (!u || u.status === 'removed' || u.status === 'rejected') return null;
    if (now - s.created_at > DAY && s.expires_at - now < (SESSION_DAYS - 1) * DAY) run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', now + SESSION_DAYS * DAY, s.token_hash);
    if (now - (u.last_seen || 0) > 300000) { run('UPDATE users SET last_seen = ? WHERE id = ?', now, u.id); u.last_seen = now; }
    return u;
  }
  const isStaff = (u) => u && (u.role === 'teacher' || u.role === 'admin');

  /* ---------- live stream (server-sent events) ---------- */

  const streams = new Map(); // user id -> Set of responses
  function sendTo(userId, event, data) {
    const set = streams.get(userId);
    if (!set) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) res.write(payload);
  }
  function broadcast(filter, event, data) {
    for (const uid of streams.keys()) {
      const u = userRow(uid);
      if (u && u.status === 'active' && filter(u)) sendTo(uid, event, data);
    }
  }
  const heartbeat = setInterval(() => { for (const set of streams.values()) for (const res of set) res.write(':\n\n'); }, 20000);
  heartbeat.unref();

  /* ---------- channels ---------- */

  function channelMeta(ch) {
    if (ch === 'all') return { kind: 'all', name: 'All schools', sub: 'Every school in the project' };
    let m = /^school:(\d+)$/.exec(ch);
    if (m) { const s = schoolOf(+m[1]); return s ? { kind: 'school', school_id: s.id, name: s.short, sub: 'Whole school' } : null; }
    m = /^team:(\d+)$/.exec(ch);
    if (m) {
      const t = teamOf(+m[1]);
      if (!t) return null;
      const s = schoolOf(t.school_id);
      return { kind: 'team', team_id: t.id, school_id: t.school_id, name: t.name, sub: `Team · ${s ? s.short : ''}` };
    }
    return null;
  }
  function canAccess(u, ch) {
    if (!u || u.status !== 'active') return false;
    const meta = channelMeta(ch);
    if (!meta) return false;
    if (meta.kind === 'all') return true;
    if (u.role === 'admin') return true;
    if (meta.kind === 'school') return u.school_id === meta.school_id;
    return u.role === 'teacher' ? u.school_id === meta.school_id : u.team_id === meta.team_id;
  }
  function channelsFor(u) {
    const list = ['all'];
    if (u.role === 'admin') {
      for (const s of all('SELECT id FROM schools ORDER BY id')) list.push('school:' + s.id);
      for (const t of all('SELECT id FROM teams ORDER BY school_id, name')) list.push('team:' + t.id);
    } else {
      list.push('school:' + u.school_id);
      if (u.role === 'teacher') for (const t of all('SELECT id FROM teams WHERE school_id = ? ORDER BY name', u.school_id)) list.push('team:' + t.id);
      else if (u.team_id) list.push('team:' + u.team_id);
    }
    return list;
  }

  function messageOut(m, authors) {
    const a = (authors && authors.get(m.user_id)) || userRow(m.user_id);
    const school = a ? schoolOf(a.school_id) : null;
    return {
      id: m.id, channel: m.channel, at: m.created_at, deleted: !!m.deleted_at,
      body: m.deleted_at ? null : m.body,
      user: a ? { id: a.id, name: a.status === 'removed' ? 'Deleted user' : a.name, role: a.role, school: school ? school.short : null } : { id: 0, name: 'Deleted user', role: 'student', school: null },
    };
  }

  /* ---------- bot ---------- */

  const bot = opts.bot || null;

  /* ---------- routes ---------- */

  const routes = [];
  const route = (method, pattern, auth, handler) => routes.push({ method, pattern, auth, handler });
  const STREAMED = Symbol('streamed');

  function clientIp(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  }

  // ---- public ----
  route('GET', /^\/app\/api\/schools$/, 'none', () => ({
    schools: all('SELECT id, name, short FROM schools ORDER BY id'),
  }));

  route('POST', /^\/app\/api\/join$/, 'none', async ({ req, res, body }) => {
    // A whole class joins from one school network, so only wrong codes are counted tightly.
    if (limiter.count('join-fail:' + clientIp(req), 15 * 60000) >= 10) fail(429, 'Too many wrong codes. Wait 15 minutes and ask your teacher for the code.', 'rate');
    if (limiter.take('join:' + clientIp(req), 200, 15 * 60000)) fail(429, 'Too many tries. Wait a few minutes.', 'rate');
    const school = schoolOf(Number(body.school_id));
    const role = body.role === 'teacher' ? 'teacher' : 'student';
    if (!school) fail(400, 'Choose your school.', 'school');
    const want = role === 'teacher' ? school.teacher_code : school.student_code;
    if (!same(normCode(body.code), normCode(want))) limiter.take('join-fail:' + clientIp(req), 1000, 15 * 60000);
    if (!same(normCode(body.code), normCode(want))) fail(403, role === 'teacher' ? 'That teacher code is not right for this school.' : 'That school code is not right. Ask your teacher.', 'code');
    if (body.consent !== true) fail(400, 'Please tick the box to confirm you understand how the app works.', 'consent');
    const name = checkName(body.name, role);
    checkPassword(body.password, name);
    const { salt, hash } = await hashPw(body.password);
    const key = nameKey(name);
    const id = tx(() => {
      if (get('SELECT 1 AS x FROM users WHERE school_id = ? AND name_key = ? AND status != ?', school.id, key, 'removed')) fail(409, 'Someone at your school already uses that name. Add an initial or a number.', 'name');
      return run('INSERT INTO users(school_id, name, name_key, pw_salt, pw_hash, role, status, created_at, consent_at, last_seen) VALUES (?,?,?,?,?,?,?,?,?,?)',
        school.id, name, key, salt, hash, role, 'pending', Date.now(), Date.now(), Date.now()).id;
    });
    const token = createSession(id);
    res.setHeader('Set-Cookie', cookie(req, token, SESSION_DAYS * 86400));
    broadcast((u) => u.role === 'admin' || (u.role === 'teacher' && u.school_id === school.id && role === 'student'), 'refresh', { what: 'pending' });
    return { user: publicUser(userRow(id), true) };
  });

  route('POST', /^\/app\/api\/admin-join$/, 'none', async ({ req, res, body }) => {
    const setup = process.env.ADMIN_SETUP_CODE || '';
    const wait = limiter.take('admin-join:' + clientIp(req), 6, 15 * 60000);
    if (wait) fail(429, 'Too many tries. Wait a few minutes.', 'rate');
    if (!setup) fail(403, 'Admin sign-up is switched off: set ADMIN_SETUP_CODE on the server.', 'code');
    if (!same(normCode(body.setup_code), normCode(setup))) fail(403, 'That setup code is not right.', 'code');
    const name = checkName(body.name, 'admin');
    checkPassword(body.password, name);
    const { salt, hash } = await hashPw(body.password);
    const key = nameKey(name);
    const id = tx(() => {
      if (get('SELECT 1 AS x FROM users WHERE school_id IS NULL AND name_key = ? AND status != ?', key, 'removed')) fail(409, 'An admin already uses that name.', 'name');
      return run('INSERT INTO users(school_id, name, name_key, pw_salt, pw_hash, role, status, created_at, approved_at, consent_at, last_seen) VALUES (NULL,?,?,?,?,?,?,?,?,?,?)',
        name, key, salt, hash, 'admin', 'active', Date.now(), Date.now(), Date.now(), Date.now()).id;
    });
    audit(userRow(id), 'admin-created', id, name);
    const token = createSession(id);
    res.setHeader('Set-Cookie', cookie(req, token, SESSION_DAYS * 86400));
    return { user: publicUser(userRow(id), true) };
  });

  route('POST', /^\/app\/api\/login$/, 'none', async ({ req, res, body }) => {
    const name = String(body.name || '').trim();
    const schoolId = body.school_id == null || body.school_id === '' || body.school_id === 'staff' ? null : Number(body.school_id);
    const key = nameKey(name);
    const lk = `login:${clientIp(req)}|${schoolId}|${key}`;
    const tries = limiter.count(lk, 15 * 60000);
    if (tries >= 8) fail(429, 'Too many wrong passwords. Wait 15 minutes, or ask your teacher to reset it.', 'rate');
    const ipTries = limiter.count('login-ip:' + clientIp(req), 15 * 60000);
    if (ipTries >= 150) fail(429, 'Too many tries from this network. Wait a little.', 'rate');
    const u = schoolId == null
      ? get('SELECT * FROM users WHERE school_id IS NULL AND name_key = ? AND status != ?', key, 'removed')
      : get('SELECT * FROM users WHERE school_id = ? AND name_key = ? AND status != ?', schoolId, key, 'removed');
    const okPw = await checkPw(String(body.password || ''), u && u.pw_salt, u && u.pw_hash);
    if (!u || !okPw) {
      limiter.take(lk, 100, 15 * 60000);
      limiter.take('login-ip:' + clientIp(req), 100, 15 * 60000);
      fail(401, 'Wrong name or password.', 'login');
    }
    if (u.status === 'rejected') fail(403, 'Your request was not approved. Ask your teacher.', 'rejected');
    limiter.clear(lk);
    const token = createSession(u.id);
    res.setHeader('Set-Cookie', cookie(req, token, SESSION_DAYS * 86400));
    run('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), u.id);
    return { user: publicUser(u, true) };
  });

  route('POST', /^\/app\/api\/logout$/, 'none', ({ req, res }) => {
    const token = parseCookies(req.headers.cookie).sc_sid;
    if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha(token));
    res.setHeader('Set-Cookie', cookie(req, '', 0));
    return { ok: true };
  });

  // ---- any signed-in user (also pending) ----
  route('GET', /^\/app\/api\/me$/, 'user', ({ user }) => ({
    user: publicUser(user, true),
    bot: { configured: bot ? bot.status().configured : false },
    helplines: { child: '116111', emergency: '112' },
    reasons: REPORT_REASONS,
  }));

  // ---- active members ----
  route('GET', /^\/app\/api\/channels$/, 'active', ({ user }) => {
    const out = channelsFor(user).map((id) => {
      const meta = channelMeta(id);
      const last = get('SELECT * FROM messages WHERE channel = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', id);
      const readId = (get('SELECT last_id FROM reads WHERE user_id = ? AND channel = ?', user.id, id) || { last_id: 0 }).last_id;
      const unread = get('SELECT COUNT(*) AS n FROM messages WHERE channel = ? AND id > ? AND user_id != ? AND deleted_at IS NULL', id, readId, user.id).n;
      return { id, ...meta, unread, last: last ? messageOut(last) : null };
    });
    return { channels: out };
  });

  route('GET', /^\/app\/api\/messages$/, 'active', ({ user, url }) => {
    const ch = url.searchParams.get('channel');
    if (!canAccess(user, ch)) fail(403, 'You cannot open that channel.');
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const before = Number(url.searchParams.get('before')) || 0;
    const after = Number(url.searchParams.get('after')) || 0;
    const rows = after
      ? all('SELECT * FROM messages WHERE channel = ? AND id > ? ORDER BY id ASC LIMIT ?', ch, after, limit)
      : all(`SELECT * FROM messages WHERE channel = ? ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`, ...(before ? [ch, before, limit] : [ch, limit])).reverse();
    const authors = new Map();
    for (const m of rows) if (!authors.has(m.user_id)) authors.set(m.user_id, userRow(m.user_id));
    return { channel: ch, meta: channelMeta(ch), messages: rows.map((m) => messageOut(m, authors)), more: !after && rows.length === limit };
  });

  route('POST', /^\/app\/api\/messages$/, 'active', ({ user, body }) => {
    const ch = String(body.channel || '');
    if (!canAccess(user, ch)) fail(403, 'You cannot write in that channel.');
    const fresh = userRow(user.id);
    if (fresh.muted_until > Date.now()) fail(403, `You are muted until ${new Date(fresh.muted_until).toLocaleString('en-GB', { timeZone: 'Asia/Nicosia', dateStyle: 'medium', timeStyle: 'short' })}. ${fresh.mute_reason || ''}`.trim(), 'muted');
    const text = String(body.body || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) fail(400, 'Write a message first.');
    if (text.length > 800) fail(400, 'Messages can have at most 800 characters.');
    const gap = limiter.take('msg-fast:' + user.id, 1, 1200);
    if (gap) fail(429, 'Slow down a little.', 'rate');
    if (limiter.take('msg-min:' + user.id, 25, 60000)) fail(429, 'You are sending too many messages. Wait a minute.', 'rate');
    if (!isStaff(user)) { const bad = unsafeText(text); if (bad) fail(422, bad + ' This keeps everyone safe.', 'unsafe'); }
    const id = run('INSERT INTO messages(channel, user_id, body, created_at) VALUES (?,?,?,?)', ch, user.id, text, Date.now()).id;
    run('INSERT INTO reads(user_id, channel, last_id) VALUES (?,?,?) ON CONFLICT(user_id, channel) DO UPDATE SET last_id = excluded.last_id', user.id, ch, id);
    const msg = messageOut(get('SELECT * FROM messages WHERE id = ?', id));
    broadcast((u) => canAccess(u, ch), 'message', msg);
    return { message: msg };
  });

  route('POST', /^\/app\/api\/channels\/read$/, 'active', ({ user, body }) => {
    const ch = String(body.channel || '');
    if (!canAccess(user, ch)) fail(403, 'You cannot open that channel.');
    const last = (get('SELECT MAX(id) AS m FROM messages WHERE channel = ?', ch) || {}).m || 0;
    run('INSERT INTO reads(user_id, channel, last_id) VALUES (?,?,?) ON CONFLICT(user_id, channel) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)', user.id, ch, last);
    return { ok: true };
  });

  route('POST', /^\/app\/api\/messages\/(\d+)\/report$/, 'active', ({ user, params, body }) => {
    const m = get('SELECT * FROM messages WHERE id = ?', Number(params[0]));
    if (!m || !canAccess(user, m.channel)) fail(404, 'Message not found.');
    if (m.user_id === user.id) fail(400, 'That is your own message.');
    const reason = REPORT_REASONS[body.reason] ? body.reason : 'other';
    if (get('SELECT 1 AS x FROM reports WHERE kind = ? AND ref_id = ? AND reporter_id = ?', 'message', m.id, user.id)) return { ok: true, already: true };
    const a = userRow(m.user_id);
    const snap = JSON.stringify({ channel: m.channel, author: a ? a.name : '?', body: m.body, at: m.created_at });
    const rid = run('INSERT INTO reports(kind, ref_id, reporter_id, reason, note, created_at, school_id, author_id, author_role, snapshot) VALUES (?,?,?,?,?,?,?,?,?,?)',
      'message', m.id, user.id, reason, String(body.note || '').slice(0, 300), Date.now(), a ? a.school_id : null, a ? a.id : null, a ? a.role : null, snap).id;
    broadcast((u) => u.role === 'admin' || (u.role === 'teacher' && a && a.role === 'student' && a.school_id === u.school_id), 'refresh', { what: 'reports', id: rid });
    return { ok: true };
  });

  route('GET', /^\/app\/api\/team$/, 'active', ({ user }) => {
    if (!user.team_id) return { team: null, members: [] };
    const t = teamOf(user.team_id);
    return { team: { id: t.id, name: t.name }, members: all("SELECT name, role FROM users WHERE team_id = ? AND status = 'active' ORDER BY name", t.id) };
  });

  route('GET', /^\/app\/api\/stream$/, 'active', ({ req, res, user }) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 4000\n\nevent: hello\ndata: {}\n\n');
    let set = streams.get(user.id);
    if (!set) streams.set(user.id, (set = new Set()));
    set.add(res);
    res.on('error', () => {});
    req.on('close', () => { set.delete(res); if (!set.size) streams.delete(user.id); });
    return STREAMED;
  });

  route('POST', /^\/app\/api\/me\/password$/, 'user', async ({ user, body }) => {
    const wait = limiter.take('pw:' + user.id, 8, 15 * 60000);
    if (wait) fail(429, 'Too many tries. Wait a few minutes.', 'rate');
    if (!user.must_change && !(await checkPw(String(body.old || ''), user.pw_salt, user.pw_hash))) fail(403, 'The old password is not right.', 'password');
    checkPassword(body.password, user.name);
    const { salt, hash } = await hashPw(body.password);
    run('UPDATE users SET pw_salt = ?, pw_hash = ?, must_change = 0 WHERE id = ?', salt, hash, user.id);
    return { ok: true };
  });

  route('GET', /^\/app\/api\/me\/export$/, 'user', ({ user, res }) => {
    const out = {
      account: { name: user.name, role: user.role, school: (schoolOf(user.school_id) || {}).name || null, team: (teamOf(user.team_id) || {}).name || null, created: new Date(user.created_at).toISOString() },
      messages: all('SELECT channel, body, created_at, deleted_at FROM messages WHERE user_id = ? ORDER BY id', user.id).map((m) => ({ channel: m.channel, text: m.body, at: new Date(m.created_at).toISOString(), removed: !!m.deleted_at })),
      assistant_questions: all('SELECT question, answer, created_at FROM bot_logs WHERE user_id = ? ORDER BY id', user.id).map((b) => ({ question: b.question, answer: b.answer, at: new Date(b.created_at).toISOString() })),
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="my-data.json"', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(out, null, 2));
    return STREAMED;
  });

  route('POST', /^\/app\/api\/me\/delete$/, 'user', async ({ req, res, user, body }) => {
    if (user.role === 'admin' && get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").n < 2) fail(400, 'You are the only admin. Create another admin first.');
    if (!(await checkPw(String(body.password || ''), user.pw_salt, user.pw_hash))) fail(403, 'The password is not right.', 'password');
    eraseUser(user.id);
    audit(null, 'self-deleted', user.id, '');
    res.setHeader('Set-Cookie', cookie(req, '', 0));
    return { ok: true };
  });

  function eraseUser(id) {
    tx(() => {
      run("UPDATE users SET name = 'Deleted user', name_key = ?, pw_hash = NULL, pw_salt = NULL, status = 'removed', team_id = NULL, muted_until = 0 WHERE id = ?", 'deleted:' + id, id);
      run('DELETE FROM sessions WHERE user_id = ?', id);
      run('DELETE FROM reads WHERE user_id = ?', id);
      run('DELETE FROM bot_logs WHERE user_id = ?', id);
    });
    const set = streams.get(id);
    if (set) { for (const r of set) r.end(); streams.delete(id); }
  }

  // ---- the assistant ----
  route('POST', /^\/app\/api\/bot$/, 'active', async ({ req, res, user, body }) => {
    if (!bot || !bot.status().configured) fail(503, 'The assistant is not switched on yet. Ask your teacher or admin.', 'not_configured');
    const question = String(body.question || '').trim().slice(0, 600);
    if (!question) fail(400, 'Type a question first.');
    const history = (Array.isArray(body.history) ? body.history : []).slice(-8)
      .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string' && h.text.trim())
      .map((h) => ({ role: h.role, text: h.text.slice(0, 1500) }));
    const lim = opts.botLimits || {};
    const perMin = lim.perMinute || 6, perDay = lim.perDay || Number(process.env.BOT_DAILY_LIMIT) || 40, global = lim.global || Number(process.env.BOT_GLOBAL_DAILY) || 1500;
    const now = Date.now();
    if (get('SELECT COUNT(*) AS n FROM bot_logs WHERE user_id = ? AND created_at > ?', user.id, now - 60000).n >= perMin) fail(429, 'One moment, you are asking quickly. Try again in a minute.', 'rate');
    if (get('SELECT COUNT(*) AS n FROM bot_logs WHERE user_id = ? AND created_at > ?', user.id, now - DAY).n >= perDay) fail(429, `You used your ${perDay} questions for today. They come back tomorrow.`, 'daily');
    if (get('SELECT COUNT(*) AS n FROM bot_logs WHERE created_at > ?', now - DAY).n >= global) fail(429, 'The assistant is resting for today because the whole project used its daily limit.', 'global');
    const school = schoolOf(user.school_id), team = teamOf(user.team_id);
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    const send = (o) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
    const t0 = Date.now();
    const logId = run('INSERT INTO bot_logs(user_id, school_id, created_at, question) VALUES (?,?,?,?)', user.id, user.school_id, now, question).id;
    let ctrl = new AbortController();
    req.on('close', () => { if (!res.writableEnded) ctrl.abort(); });
    try {
      const r = await bot.ask({ user: publicUser(user), school, team, schools: all('SELECT * FROM schools ORDER BY id'), history, question, onTool: (name) => send({ type: 'tool', name }), signal: ctrl.signal, handbook: handbookSearch });
      run('UPDATE bot_logs SET answer = ?, tools = ?, ms = ?, tokens_in = ?, tokens_out = ? WHERE id = ?', r.text, JSON.stringify(r.tools), Date.now() - t0, r.tokensIn || 0, r.tokensOut || 0, logId);
      send({ type: 'answer', text: r.text, id: logId, tools: r.tools });
    } catch (e) {
      run('UPDATE bot_logs SET error = ?, ms = ? WHERE id = ?', String(e.message).slice(0, 300), Date.now() - t0, logId);
      log('Assistant error: ' + e.message);
      send({ type: 'error', message: e.code === 'not_configured' ? 'The assistant is not switched on yet.' : 'The assistant could not answer just now. Try again in a moment.' });
    }
    res.end();
    return STREAMED;
  });

  route('POST', /^\/app\/api\/bot\/(\d+)\/report$/, 'active', ({ user, params, body }) => {
    const b = get('SELECT * FROM bot_logs WHERE id = ? AND user_id = ?', Number(params[0]), user.id);
    if (!b) fail(404, 'Answer not found.');
    if (get('SELECT 1 AS x FROM reports WHERE kind = ? AND ref_id = ?', 'bot', b.id)) return { ok: true, already: true };
    const rid = run('INSERT INTO reports(kind, ref_id, reporter_id, reason, note, created_at, school_id, author_id, author_role, snapshot) VALUES (?,?,?,?,?,?,?,?,?,?)',
      'bot', b.id, user.id, REPORT_REASONS[body.reason] ? body.reason : 'other', String(body.note || '').slice(0, 300), Date.now(), user.school_id, null, 'assistant', JSON.stringify({ question: b.question, answer: b.answer })).id;
    broadcast((u) => u.role === 'admin' || (u.role === 'teacher' && u.school_id === user.school_id), 'refresh', { what: 'reports', id: rid });
    return { ok: true };
  });

  function handbookSearch(query) {
    const words = String(query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
    const docs = all('SELECT title, body FROM handbook');
    const scored = docs.map((d) => {
      const t = d.title.toLowerCase(), b = d.body.toLowerCase();
      let s = 0;
      for (const w of words) { if (t.includes(w)) s += 5; const hits = b.split(w).length - 1; s += Math.min(hits, 5); }
      return { d, s };
    }).filter((x) => x.s > 0 || !words.length).sort((a, b) => b.s - a.s).slice(0, 3);
    return scored.map((x) => ({ title: x.d.title, text: x.d.body.slice(0, 2500) }));
  }
  const handbookTitles = () => all('SELECT title FROM handbook ORDER BY title').map((r) => r.title);
  if (bot && bot.setHandbookTitles) bot.setHandbookTitles(handbookTitles);

  route('GET', /^\/app\/api\/handbook$/, 'active', () => ({ docs: all('SELECT id, title, body, updated_at FROM handbook ORDER BY title') }));

  // ---- teachers and admins ----
  function scopeSchool(user) { return user.role === 'admin' ? null : user.school_id; }
  function mayManage(actor, target) {
    if (!target || target.id === actor.id) return false;
    if (actor.role === 'admin') return target.role !== 'admin';
    return actor.role === 'teacher' && target.role === 'student' && target.school_id === actor.school_id;
  }
  function manageTarget(actor, id) {
    const t = userRow(Number(id));
    if (!t || !mayManage(actor, t)) fail(404, 'Member not found.');
    return t;
  }

  route('GET', /^\/app\/api\/manage\/overview$/, 'staff', ({ user }) => {
    const sid = scopeSchool(user);
    const where = sid == null ? '' : 'WHERE school_id = ?';
    const args = sid == null ? [] : [sid];
    const schools = all(`SELECT id, name, short, match, student_code${user.role === 'admin' ? ', teacher_code' : ''} FROM schools ${sid == null ? '' : 'WHERE id = ?'} ORDER BY id`, ...args);
    const members = all(`SELECT id, school_id, name, role, status, team_id, created_at, last_seen, muted_until, mute_reason FROM users ${sid == null ? "WHERE status != 'removed'" : "WHERE school_id = ? AND status != 'removed'"} ORDER BY status = 'pending' DESC, role, name`, ...args);
    const teams = all(`SELECT id, school_id, name, device_eui FROM teams ${where} ORDER BY school_id, name`, ...args);
    let reports = all(`SELECT * FROM reports WHERE resolved_at IS NULL ${sid == null ? '' : "AND school_id = ? AND (author_role = 'student' OR author_role = 'assistant')"} ORDER BY id DESC LIMIT 100`, ...args);
    reports = reports.map((r) => {
      const reporter = r.reporter_id ? userRow(r.reporter_id) : null;
      return { id: r.id, kind: r.kind, ref_id: r.ref_id, reason: r.reason, reasonText: REPORT_REASONS[r.reason] || r.reason, note: r.note, at: r.created_at, reporter: reporter ? reporter.name : '?', author_id: r.author_id, author_role: r.author_role, school_id: r.school_id, snapshot: JSON.parse(r.snapshot || '{}') };
    });
    // Teachers may only act on student authors; admins on everyone except admins.
    return { schools, members, teams, reports, pending: members.filter((m) => m.status === 'pending' && (user.role === 'admin' || m.role === 'student')).length };
  });

  route('POST', /^\/app\/api\/manage\/users\/(\d+)\/(approve|reject|remove|mute|unmute|reset-password|team)$/, 'staff', async ({ user, params, body }) => {
    const t = manageTarget(user, params[0]);
    const action = params[1];
    if (action === 'approve') {
      if (t.status !== 'pending') fail(400, 'That member is not waiting for approval.');
      if (t.role === 'teacher' && user.role !== 'admin') fail(403, 'Only an admin can approve a teacher.');
      run("UPDATE users SET status = 'active', approved_by = ?, approved_at = ? WHERE id = ?", user.id, Date.now(), t.id);
      audit(user, 'approve', t.id, t.name);
      sendTo(t.id, 'refresh', { what: 'me' });
    } else if (action === 'reject') {
      if (t.status !== 'pending') fail(400, 'That member is not waiting for approval.');
      run("UPDATE users SET status = 'rejected' WHERE id = ?", t.id);
      run('DELETE FROM sessions WHERE user_id = ?', t.id);
      audit(user, 'reject', t.id, t.name);
      sendTo(t.id, 'refresh', { what: 'me' });
    } else if (action === 'remove') {
      eraseUser(t.id);
      audit(user, 'remove', t.id, t.name);
    } else if (action === 'mute') {
      const minutes = Math.min(60 * 24 * 60, Math.max(5, Number(body.minutes) || 60));
      run('UPDATE users SET muted_until = ?, mute_reason = ? WHERE id = ?', Date.now() + minutes * 60000, String(body.reason || '').slice(0, 120) || null, t.id);
      audit(user, 'mute', t.id, `${minutes} min`);
      sendTo(t.id, 'refresh', { what: 'me' });
    } else if (action === 'unmute') {
      run('UPDATE users SET muted_until = 0, mute_reason = NULL WHERE id = ?', t.id);
      audit(user, 'unmute', t.id, '');
      sendTo(t.id, 'refresh', { what: 'me' });
    } else if (action === 'reset-password') {
      const pw = tempPassword();
      const { salt, hash } = await hashPw(pw);
      run('UPDATE users SET pw_salt = ?, pw_hash = ?, must_change = 1 WHERE id = ?', salt, hash, t.id);
      run('DELETE FROM sessions WHERE user_id = ?', t.id);
      audit(user, 'reset-password', t.id, t.name);
      return { ok: true, temporary_password: pw };
    } else if (action === 'team') {
      let teamId = body.team_id == null || body.team_id === '' ? null : Number(body.team_id);
      if (teamId != null) { const team = teamOf(teamId); if (!team || team.school_id !== t.school_id) fail(400, 'That team belongs to another school.'); }
      run('UPDATE users SET team_id = ? WHERE id = ?', teamId, t.id);
      audit(user, 'team', t.id, teamId);
      sendTo(t.id, 'refresh', { what: 'me' });
    }
    return { ok: true };
  });

  route('POST', /^\/app\/api\/manage\/teams$/, 'staff', ({ user, body }) => {
    const schoolId = user.role === 'admin' ? Number(body.school_id) : user.school_id;
    if (!schoolOf(schoolId)) fail(400, 'Choose a school.');
    const name = String(body.name || '').trim().slice(0, 40);
    if (name.length < 2) fail(400, 'Give the team a name.');
    if (get('SELECT 1 AS x FROM teams WHERE school_id = ? AND lower(name) = lower(?)', schoolId, name)) fail(409, 'This school already has a team with that name.');
    const id = run('INSERT INTO teams(school_id, name, device_eui, created_at) VALUES (?,?,?,?)', schoolId, name, body.device_eui ? String(body.device_eui).slice(0, 40) : null, Date.now()).id;
    audit(user, 'team-create', id, name);
    return { id };
  });

  route('POST', /^\/app\/api\/manage\/teams\/(\d+)$/, 'staff', ({ user, params, body }) => {
    const t = teamOf(Number(params[0]));
    if (!t || (user.role !== 'admin' && t.school_id !== user.school_id)) fail(404, 'Team not found.');
    if (body.delete) {
      run('UPDATE users SET team_id = NULL WHERE team_id = ?', t.id);
      run('DELETE FROM teams WHERE id = ?', t.id);
      audit(user, 'team-delete', t.id, t.name);
      return { ok: true };
    }
    const name = body.name == null ? t.name : String(body.name).trim().slice(0, 40);
    if (name.length < 2) fail(400, 'Give the team a name.');
    run('UPDATE teams SET name = ?, device_eui = ? WHERE id = ?', name, body.device_eui === undefined ? t.device_eui : (body.device_eui ? String(body.device_eui).slice(0, 40) : null), t.id);
    audit(user, 'team-edit', t.id, name);
    return { ok: true };
  });

  route('POST', /^\/app\/api\/manage\/reports\/(\d+)\/resolve$/, 'staff', ({ user, params, body }) => {
    const r = get('SELECT * FROM reports WHERE id = ?', Number(params[0]));
    if (!r || r.resolved_at) fail(404, 'Report not found.');
    if (user.role !== 'admin' && !(r.school_id === user.school_id && (r.author_role === 'student' || r.author_role === 'assistant'))) fail(403, 'Only an admin can handle this report.');
    const action = ['dismiss', 'delete', 'delete_mute'].includes(body.action) ? body.action : 'dismiss';
    if (r.kind === 'message' && action !== 'dismiss') {
      const m = get('SELECT * FROM messages WHERE id = ?', r.ref_id);
      if (m && !m.deleted_at) {
        run('UPDATE messages SET deleted_at = ?, deleted_by = ? WHERE id = ?', Date.now(), user.id, m.id);
        broadcast((u) => canAccess(u, m.channel), 'deleted', { channel: m.channel, id: m.id });
      }
      if (action === 'delete_mute' && r.author_id) {
        const author = userRow(r.author_id);
        if (author && mayManage(user, author)) { run('UPDATE users SET muted_until = ?, mute_reason = ? WHERE id = ?', Date.now() + DAY, 'A teacher muted you after a report.', author.id); sendTo(author.id, 'refresh', { what: 'me' }); }
      }
    }
    run('UPDATE reports SET resolved_at = ?, resolved_by = ?, outcome = ? WHERE id = ?', Date.now(), user.id, action, r.id);
    audit(user, 'report-' + action, r.id, r.kind);
    return { ok: true };
  });

  route('POST', /^\/app\/api\/manage\/messages\/(\d+)\/delete$/, 'staff', ({ user, params }) => {
    const m = get('SELECT * FROM messages WHERE id = ?', Number(params[0]));
    if (!m || !canAccess(user, m.channel)) fail(404, 'Message not found.');
    const a = userRow(m.user_id);
    if (a && a.role !== 'student' && user.role !== 'admin' && a.id !== user.id) fail(403, 'Only an admin can remove a teacher message.');
    if (!m.deleted_at) {
      run('UPDATE messages SET deleted_at = ?, deleted_by = ? WHERE id = ?', Date.now(), user.id, m.id);
      audit(user, 'message-delete', m.id, m.channel);
      broadcast((u) => canAccess(u, m.channel), 'deleted', { channel: m.channel, id: m.id });
    }
    return { ok: true };
  });

  route('POST', /^\/app\/api\/manage\/schools\/(\d+)$/, 'staff', ({ user, params, body }) => {
    const s = schoolOf(Number(params[0]));
    if (!s || (user.role !== 'admin' && s.id !== user.school_id)) fail(404, 'School not found.');
    if (body.regenerate === 'student') { run('UPDATE schools SET student_code = ? WHERE id = ?', makeCode(), s.id); audit(user, 'code-student', s.id, ''); }
    else if (body.regenerate === 'teacher') {
      if (user.role !== 'admin') fail(403, 'Only an admin can change the teacher code.');
      run('UPDATE schools SET teacher_code = ? WHERE id = ?', makeCode(), s.id); audit(user, 'code-teacher', s.id, '');
    }
    if (body.match != null) {
      if (user.role !== 'admin') fail(403, 'Only an admin can change how vehicles are matched.');
      run('UPDATE schools SET match = ? WHERE id = ?', String(body.match).toLowerCase().slice(0, 200), s.id);
      audit(user, 'school-match', s.id, body.match);
    }
    const out = get(`SELECT id, name, short, match, student_code${user.role === 'admin' ? ', teacher_code' : ''} FROM schools WHERE id = ?`, s.id);
    return { school: out };
  });

  route('GET', /^\/app\/api\/manage\/botlog$/, 'staff', ({ user, url }) => {
    const sid = scopeSchool(user);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 60));
    const rows = sid == null
      ? all('SELECT * FROM bot_logs ORDER BY id DESC LIMIT ?', limit)
      : all('SELECT * FROM bot_logs WHERE school_id = ? ORDER BY id DESC LIMIT ?', sid, limit);
    return { rows: rows.map((r) => { const u = r.user_id ? userRow(r.user_id) : null; return { id: r.id, at: r.created_at, user: u ? u.name : 'Deleted user', school_id: r.school_id, question: r.question, answer: r.answer, tools: r.tools ? JSON.parse(r.tools) : [], error: r.error, ms: r.ms }; }) };
  });

  route('POST', /^\/app\/api\/manage\/handbook$/, 'staff', ({ user, body }) => {
    const title = String(body.title || '').trim().slice(0, 80);
    const text = String(body.body || '').trim().slice(0, 6000);
    if (!title || !text) fail(400, 'Give the page a title and some text.');
    if (body.id) {
      const r = run('UPDATE handbook SET title = ?, body = ?, updated_at = ?, updated_by = ? WHERE id = ?', title, text, Date.now(), user.id, Number(body.id));
      if (!r.changes) fail(404, 'Page not found.');
    } else {
      if (get('SELECT 1 AS x FROM handbook WHERE title = ?', title)) fail(409, 'A page with that title exists.');
      run('INSERT INTO handbook(title, body, updated_at, updated_by) VALUES (?,?,?,?)', title, text, Date.now(), user.id);
    }
    audit(user, 'handbook', title, '');
    return { ok: true };
  });
  route('POST', /^\/app\/api\/manage\/handbook\/(\d+)\/delete$/, 'staff', ({ user, params }) => {
    run('DELETE FROM handbook WHERE id = ?', Number(params[0]));
    audit(user, 'handbook-delete', params[0], '');
    return { ok: true };
  });

  route('GET', /^\/app\/api\/manage\/audit$/, 'admin', () => ({
    rows: all('SELECT * FROM audit ORDER BY id DESC LIMIT 200').map((r) => ({ at: r.at, actor: r.actor_id ? (userRow(r.actor_id) || {}).name : 'system', action: r.action, target: r.target, detail: r.detail })),
  }));

  /* ---------- dispatcher ---------- */

  const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };
  function sendJson(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY });
    res.end(JSON.stringify(obj));
  }

  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/app/api/')) return false;
    try {
      const origin = req.headers.origin;
      if (req.method !== 'GET' && req.method !== 'HEAD' && origin) {
        let ok = false;
        try { ok = new URL(origin).host === req.headers.host; } catch (e) { /* bad origin */ }
        if (!ok) fail(403, 'Blocked: the request came from another site.');
      }
      const r = routes.find((x) => x.method === req.method && x.pattern.test(url.pathname));
      if (!r) fail(404, 'Not found.');
      const user = sessionUser(req);
      if (r.auth !== 'none') {
        if (!user) fail(401, 'Please sign in.', 'signin');
        if (r.auth !== 'user' && user.status !== 'active') fail(403, user.status === 'pending' ? 'Your teacher has not approved you yet.' : 'Your account is not active.', user.status);
        if (r.auth === 'staff' && !isStaff(user)) fail(403, 'Teachers only.');
        if (r.auth === 'admin' && user.role !== 'admin') fail(403, 'Admins only.');
      }
      const body = await readJson(req, r.pattern.source.includes('bot') ? 65536 : 32768);
      const params = r.pattern.exec(url.pathname).slice(1);
      const out = await r.handler({ req, res, url, params, body, user });
      if (out === STREAMED) return true;
      sendJson(res, 200, out);
    } catch (e) {
      if (e instanceof HttpError) {
        if (!res.headersSent) sendJson(res, e.status, { error: e.message, code: e.code });
        else res.end();
      } else {
        console.error('Student app error:', e && e.stack || e);
        if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong on the server.' });
        else res.end();
      }
    }
    return true;
  }

  function purge() {
    const m = run('DELETE FROM messages WHERE created_at < ?', Date.now() - CHAT_RETENTION_DAYS * DAY).changes;
    const b = run('DELETE FROM bot_logs WHERE created_at < ?', Date.now() - BOT_LOG_DAYS * DAY).changes;
    run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
    run('DELETE FROM audit WHERE at < ?', Date.now() - 730 * DAY);
    if (m || b) log(`Student app: removed ${m} old messages and ${b} old assistant logs`);
  }
  purge();
  const purger = setInterval(purge, 6 * 3600000);
  purger.unref();

  return {
    enabled: true,
    handle,
    // The user behind the cookie when they are an approved member; the dashboard pages accept this instead of the password.
    authorise: (req) => { const u = sessionUser(req); return u && u.status === 'active' ? u : null; },
    info: () => ({ users: get('SELECT COUNT(*) AS n FROM users').n, schools: get('SELECT COUNT(*) AS n FROM schools').n, db: dbFile }),
    db: { get, all, run },
    close() { clearInterval(heartbeat); clearInterval(sweeper); clearInterval(purger); for (const set of streams.values()) for (const r of set) r.end(); try { db.close(); } catch (e) { /* closed */ } },
  };
}

module.exports = { createApp, SCHOOLS, unsafeText, nameKey, normCode };
