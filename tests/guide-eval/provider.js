'use strict';
/* promptfoo provider for the Build studio guide. DEV-TIME ONLY: nothing in the website requires this file.

   What it does: starts a throwaway copy of this site's server on this computer (demo data, a temporary database, a random port), makes a few
   made-up student accounts in it, and sends every test question to the real /studio/api/guide endpoint. So the evaluation exercises the real
   system prompt, the real tools (handbook search, data layers, gallery, sensor guides) and the real safety rules, and nothing can drift out of
   date. The answer text is the output; the tools the guide used, the brief, the choices and the found items are in `metadata`.

   Needs ANTHROPIC_API_KEY in the environment of whoever runs promptfoo (it is passed to the throwaway server only, and never printed or written).
   The only network traffic is: promptfoo -> your local server -> api.anthropic.com (guide), and promptfoo -> api.anthropic.com (grader).

   Environment (all optional except the key):
     ANTHROPIC_API_KEY      your own key
     BOT_MODEL              the model the guide uses (the server's default is used when empty)
     GUIDE_EVAL_PORT        a fixed port for the throwaway server (default: a free random one)
     GUIDE_EVAL_STUDENTS    how many made-up students share the load (default 4; the guide allows 8 messages a minute for each one)
     ANTHROPIC_BASE_URL     only for testing this file against a fake model; leave it empty for a real run */

const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secret = () => crypto.randomBytes(12).toString('hex');

let booting = null;   // one throwaway server for the whole promptfoo run

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

function agent(base) {
  let cookie = '';
  const call = async (method, url, body, timeoutMs) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs || 30000) });
    const sc = r.headers.get('set-cookie');
    if (sc) { const c = sc.split(';')[0]; cookie = /=$/.test(c) ? '' : c; }
    const text = await r.text();
    let json = {}, events = [];
    try { json = JSON.parse(text); } catch (e) { events = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (x) { return null; } }).filter(Boolean); }
    return { status: r.status, json, text, events };
  };
  return { get: (u) => call('GET', u), post: (u, b, t) => call('POST', u, b || {}, t) };
}

async function boot() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Set ANTHROPIC_API_KEY (your own key) in the environment before running the evaluation. See tests/guide-eval/README.md.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-eval-'));
  const port = Number(process.env.GUIDE_EVAL_PORT) || await freePort();
  const base = `http://127.0.0.1:${port}`;
  const setup = secret();
  const logFile = path.join(dir, 'server.log');
  const log = fs.openSync(logFile, 'w');
  const env = {
    ...process.env, PORT: String(port), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: path.join(dir, 'data'), ADMIN_SETUP_CODE: setup,
    STUDIO_GUIDE_DAILY: '500', STUDIO_GUIDE_GLOBAL_DAILY: '5000',
  };
  fs.mkdirSync(env.DATA_DIR, { recursive: true });
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', log, log] });
  const stop = () => { try { child.kill(); } catch (e) { /* gone */ } try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* gone */ } };
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(130); });
  let exited = false; child.on('exit', () => { exited = true; });
  const scrub = (t) => String(t).split(key).join('***').split(setup).join('***').slice(-800);
  let up = false;
  for (let i = 0; i < 100 && !up && !exited; i++) { try { const r = await fetch(base + '/app/api/schools/public'); up = r.ok; } catch (e) { /* not yet */ } if (!up) await sleep(200); }
  if (!up) { const tail = scrub(fs.readFileSync(logFile, 'utf8')); stop(); throw new Error('The throwaway server did not start. Its log ends with:\n' + tail); }

  // One made-up admin approves a few made-up students. Passwords are random and live only in this process.
  const admin = agent(base);
  let r = await admin.post('/app/api/admin-join', { setup_code: setup, name: 'Eval Admin', password: secret() + 'Aa1' });
  if (r.status !== 200) { stop(); throw new Error('Could not create the made-up admin account (HTTP ' + r.status + ').'); }
  const schools = (await agent(base).get('/app/api/schools/public')).json.schools || [];
  if (!schools.length) { stop(); throw new Error('The throwaway server has no school to join.'); }
  const count = Math.max(1, Math.min(8, Number(process.env.GUIDE_EVAL_STUDENTS) || 4));
  const names = ['Eval Alpha', 'Eval Bravo', 'Eval Charlie', 'Eval Delta', 'Eval Echo', 'Eval Foxtrot', 'Eval Golf', 'Eval Hotel'];
  const students = [];
  for (let i = 0; i < count; i++) {
    const s = agent(base);
    r = await s.post('/app/api/join', { school_id: schools[0].id, role: 'student', name: names[i], password: secret() + 'Aa1', consent: true, new_team: 'Eval Team' });
    if (r.status !== 200) { stop(); throw new Error('Could not create a made-up student (HTTP ' + r.status + ').'); }
    students.push(s);
  }
  const overview = (await admin.get('/app/api/manage/overview')).json;
  for (const m of overview.members || []) if (String(m.name).startsWith('Eval ') && m.name !== 'Eval Admin') await admin.post(`/app/api/manage/users/${m.id}/approve`, {});
  return { base, students, next: 0 };
}

class GuideProvider {
  constructor(options) { this.providerId = (options && options.id) || 'guide'; this.config = (options && options.config) || {}; }
  id() { return this.providerId; }

  async callApi(prompt, context) {
    try {
      if (!booting) booting = boot();
      const srv = await booting;
      const vars = (context && context.vars) || {};
      const history = Array.isArray(vars.history) ? vars.history.filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string') : [];
      const messages = [...history, { role: 'user', text: String(prompt) }];
      for (let attempt = 0; attempt < 5; attempt++) {
        const student = srv.students[srv.next++ % srv.students.length];
        const r = await student.post('/studio/api/guide', { messages }, 150000);
        if (r.status === 429 && r.json && r.json.code === 'rate') { await sleep(15000); continue; }   // 8 messages a minute for each student
        if (r.status !== 200) return { error: `The guide answered HTTP ${r.status}: ${String((r.json && r.json.error) || r.text).slice(0, 200)}` };
        const err = r.events.find((e) => e.type === 'error');
        if (err) return { error: String(err.message || 'The guide returned an error.').slice(0, 300) };
        const answer = r.events.find((e) => e.type === 'answer');
        if (!answer) return { error: 'The guide sent no answer.' };
        return { output: String(answer.text || ''), metadata: { tools: answer.tools || [], brief: answer.brief || null, choices: answer.choices || null, found: answer.found || null } };
      }
      return { error: 'The guide kept answering "too fast". Lower promptfoo concurrency (--max-concurrency 1) or raise GUIDE_EVAL_STUDENTS.' };
    } catch (e) {
      return { error: String(e && e.message ? e.message : e).slice(0, 500) };
    }
  }
}

module.exports = GuideProvider;
