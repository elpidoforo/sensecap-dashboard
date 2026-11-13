'use strict';
/* Weekly reports keep an identity of their evidence (research handoff, ticket T08): the release names the exact numbers the teacher saw,
   and a released report does not change when a new draft is made. Run: node tests/reports-identity/api_test.js (real server, demo data, port 3969) */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const PORT = 3969, BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
function agent() {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) { const c = sc.split(';')[0]; cookie = /=$/.test(c) ? '' : c; }
    const text = await r.text(); let json = {}; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: r.status, json, text };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}
(async () => {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'rep-id-')), ADMIN_SETUP_CODE: 'RP-SETUP', ANTHROPIC_API_KEY: '', LAYERS_PULSE_FIRST_MS: '999999' };
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/app/api/schools'); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  const adm = agent(), vis = agent();
  await adm.post('/app/api/admin-join', { setup_code: 'RP-SETUP', name: 'owner', password: 'Report-owner-pass-1' });
  let r = await adm.post('/council/api/reports/generate', { school: 'all' });
  ok(r.status === 200 && r.json.report && r.json.report.identity, 'a new report has an evidence identity (' + r.status + ' ' + r.text.slice(0, 120) + ')');
  const a = r.json.report;
  ok(/^[0-9a-f]{64}$/.test(a.identity.evidence) && a.identity.ok === true && a.identity.made === 'weekly-report/1' && a.identity.assignments_rev === 0, 'the identity is a hash, checks out, and names the version of the sensor list');
  r = await adm.post(`/council/api/reports/${a.id}/release`, { evidence: 'f'.repeat(64) });
  ok(r.status === 409 && r.json.code === 'evidence', 'releasing with another identity is refused (' + r.status + ')');
  r = await adm.get('/council/api/reports/' + a.id);
  ok(r.json.report.status === 'draft', 'and the report stays a draft');
  r = await adm.post(`/council/api/reports/${a.id}/release`, { evidence: a.identity.evidence });
  ok(r.status === 200 && r.json.report.status === 'released', 'releasing with the identity the teacher saw works (' + r.status + ')');
  r = await vis.get('/council/api/reports/' + a.id);
  const pub = r.json.report;
  ok(r.status === 200 && pub.identity.evidence === a.identity.evidence && pub.identity.ok === true && pub.identity.saved === true, 'a visitor sees the same identity on the released report');
  const numbersOf = (x) => JSON.stringify({ overall: x.overall, schools: x.schools, days: x.days });
  // making the report again creates a new draft; the released one keeps its numbers and its identity
  await new Promise((res) => setTimeout(res, 1200));
  r = await adm.post('/council/api/reports/generate', { school: 'all' });
  const b = r.json.report;
  ok(r.status === 200 && b.id !== a.id && b.status === 'draft', 'making it again creates a new draft, not a change to the released report (' + a.id + ' and ' + (b && b.id) + ')');
  r = await vis.get('/council/api/reports/' + a.id);
  ok(r.json.report.identity.evidence === a.identity.evidence && numbersOf(r.json.report) === numbersOf(pub), 'the released report still has identical numbers and identity');
  r = await adm.post(`/council/api/reports/${b.id}/release`, { evidence: a.identity.evidence });
  ok(b.identity.evidence === a.identity.evidence ? r.status === 200 : r.status === 409, 'the new draft can only be released with its own identity (' + r.status + ')');
  r = await adm.post(`/council/api/reports/${b.id}/release`, {});
  ok(r.status === 200, 'an older page that sends no identity can still release (' + r.status + ')');
  ok(!/eui|2CF7F1|"lat"|"lng"/i.test(JSON.stringify(pub)), 'no sensor id or position in the public report');
  srv.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
