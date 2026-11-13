'use strict';
/* Reviewed sensor assignments over HTTP and in the browser: teachers only, nothing of it public.
   Run: node tests/layers-repairs/assign_test.js   (real server, demo data, port 3968; the browser part needs Playwright) */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const PORT = 3968, BASE = `http://127.0.0.1:${PORT}`;
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
  return { get: (u) => call('GET', u), put: (u, b) => call('PUT', u, b), post: (u, b) => call('POST', u, b || {}), cookie: () => cookie };
}
(async () => {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'assign-http-')), ADMIN_SETUP_CODE: 'AS-SETUP', ANTHROPIC_API_KEY: '', LAYERS_PULSE_FIRST_MS: '999999' };
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/app/api/schools'); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  const vis = agent(), adm = agent();
  let r = await vis.get('/layers/api/assignments');
  ok(r.status === 401, 'a visitor cannot read the list (' + r.status + ')');
  r = await vis.put('/layers/api/assignments', { rev: 0, sensors: [] });
  ok(r.status === 401, 'a visitor cannot change the list (' + r.status + ')');
  await adm.post('/app/api/admin-join', { setup_code: 'AS-SETUP', name: 'owner', password: 'Assign-owner-pass-1' });
  const sch = (await vis.get('/app/api/schools/public')).json.schools;
  const stu = agent();
  await stu.post('/app/api/join', { school_id: sch[0].id, role: 'student', name: 'Mia Test', password: 'pass-MiaTest-12', consent: true, team: 'Hermes' });
  const ov = (await adm.get('/app/api/manage/overview')).json;
  for (const m of ov.members || []) if (m.status === 'pending') await adm.post(`/app/api/manage/users/${m.id}/approve`, {});
  r = await stu.get('/layers/api/assignments');
  ok(r.status === 401 || r.status === 403, 'a student cannot read the list (' + r.status + ')');
  r = await adm.get('/layers/api/assignments');
  ok(r.status === 200 && r.json.rev === 0 && r.json.sensors.length >= 4 && r.json.cities.length === 4, 'an admin reads the list of sensors (' + r.status + ', ' + (r.json.sensors || []).length + ')');
  const bus = r.json.sensors.find((s) => s.guess.kind === 'bus') || r.json.sensors[0];
  const before = (await vis.get('/layers/api/live')).json.layers.find((l) => l.id === 'sensecap-buses').sensors;
  r = await adm.put('/layers/api/assignments', { rev: 0, sensors: [{ eui: bus.eui, kind: 'classroom', city: 'paphos', from: r.json.today }] });
  ok(r.status === 200 && r.json.rev === 1 && r.json.sensors.find((s) => s.eui === bus.eui).reviewed.kind === 'classroom', 'an admin saves a line (' + r.status + ')');
  const live = await vis.get('/layers/api/live');
  const after = live.json.layers.find((l) => l.id === 'sensecap-buses').sensors, cls = live.json.layers.find((l) => l.id === 'sensecap-classrooms');
  ok(after === before - 1 && cls.sensors === 1, 'the public counts follow the reviewed list (buses ' + before + ' to ' + after + ', classrooms ' + cls.sensors + ')');
  ok(!live.text.includes(bus.eui) && !(await vis.get('/layers/api/register')).text.includes(bus.eui) && !(await vis.get('/layers/api/replay')).text.includes(bus.eui), 'no sensor id reaches a public answer');
  r = await adm.put('/layers/api/assignments', { rev: 0, sensors: [] });
  ok(r.status === 409 && r.json.code === 'stale', 'saving on an old version is refused (' + r.status + ')');
  r = await fetch(BASE + '/layers/api/assignments', { method: 'PUT', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: adm.cookie() }, body: JSON.stringify({ rev: 1, sensors: [] }) });
  ok(r.status === 403, 'a request from another site is refused (' + r.status + ')');

  // in the browser: the teacher's dialog
  let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { console.log('(Playwright is not installed: the browser part is skipped)'); }
  if (chromium) {
    const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
    const [name, value] = adm.cookie().split('=');
    await ctx.addCookies([{ name, value, url: BASE }]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(BASE + '/#/layers'); await p.waitForSelector('.ly-assign', { timeout: 20000 });
    await p.click('.ly-assign'); await p.waitForSelector('.ly-as-t tbody tr');
    ok(await p.locator('.ly-as-t tbody tr').count() >= 4, 'browser: the dialog lists the sensors');
    ok((await p.locator('.ly-as-t tbody tr select').first().inputValue()) !== undefined && /suggests/.test(await p.locator('.ly-as-t').innerText()), 'browser: each row says what the name suggests');
    const row = p.locator('.ly-as-t tbody tr', { hasNot: p.locator('select >> nth=0 >> option[selected]') }).nth(1);
    await row.locator('select').nth(0).selectOption('car'); await row.locator('select').nth(1).selectOption('lefkosia');
    await p.click('.mod .nm-btn--primary');
    ok(/Give a city and a day|day/.test(await p.locator('.mod .err').innerText()), 'browser: a line without a day is not saved, and the dialog says why');
    await row.locator('input[type=date]').fill(new Date().toISOString().slice(0, 10));
    await p.click('.mod .nm-btn--primary'); await p.waitForSelector('.mod', { state: 'detached', timeout: 8000 });
    r = await adm.get('/layers/api/assignments');
    ok(r.json.rev === 2 && r.json.sensors.some((s) => s.reviewed && s.reviewed.kind === 'car' && s.reviewed.city === 'lefkosia'), 'browser: saving writes a new version (' + r.json.rev + ')');
    const anon = await b.newContext(), q = await anon.newPage(); await q.goto(BASE + '/#/layers'); await q.waitForSelector('.ly-list .ly-row');
    ok(await q.locator('.ly-assign').count() === 0, 'browser: a visitor does not see the button');
    ok(errs.length === 0, 'browser: no script errors (' + errs.slice(0, 2).join(' | ') + ')');
    await b.close();
  }
  srv.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
