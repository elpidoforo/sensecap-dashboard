'use strict';
// Real server (demo data): student builds with blocks, teacher approves, visitor opens the live page.
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const PORT = 3941, BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blocks-'));
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
function agent() {
  let cookie = '';
  const call = async (method, url, body, headers) => {
    const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) { const c = sc.split(';')[0]; cookie = /=$/.test(c) ? '' : c; }
    const text = await r.text(); let json = {}; try { json = JSON.parse(text); } catch (e) { /* html */ }
    return { status: r.status, json, text, headers: r.headers };
  };
  return { get: (u, h) => call('GET', u, null, h), post: (u, b) => call('POST', u, b || {}) };
}
const recipe = (patch) => ({ show: { measurement: '4100', school: 'larnaca' }, last: 24, as: 'line', alerts: [{ when: 'above', value: 600, colour: 'red', say: 'Open a window!' }], compare: { school: 'limassol' }, ...(patch || {}) });
(async () => {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dataDir, ADMIN_SETUP_CODE: 'BK-SETUP', ANTHROPIC_API_KEY: '' };
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  for (let i = 0; i < 80; i++) { try { await fetch(BASE + '/app/api/schools'); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  const vis = agent(), adm = agent();
  await adm.post('/app/api/admin-join', { setup_code: 'BK-SETUP', name: 'owner', password: 'Blocks-owner-pass-1' });
  const sch = (await vis.get('/app/api/schools/public')).json.schools;
  const L = sch[0], N = sch[1];
  const join = async (name, school, team, role) => { const a = agent(); await a.post('/app/api/join', { school_id: school.id, role: role || 'student', name, password: 'pass-' + name.replace(/\W/g, '') + '-12', consent: true, new_team: team }); return a; };
  const mia = await join('Mia Konstantinou', L, 'Hermes'), ben = await join('Ben Ioannou', N, 'Apollo'), teacher = await join('Mr Teacher', L, null, 'teacher');
  const ov = (await adm.get('/app/api/manage/overview')).json;
  for (const m of ov.members) if (m.status === 'pending') await adm.post(`/app/api/manage/users/${m.id}/approve`, {});

  // ---- options
  let r = await vis.get('/studio/api/blocks/options');
  ok(r.status === 401 || r.status === 403, 'a visitor cannot use the block builder (' + r.status + ')');
  r = await mia.get('/studio/api/blocks/options');
  ok(r.status === 200 && r.json.schools.length >= 2, 'options: schools (' + r.status + ' ' + JSON.stringify(r.json).slice(0, 120) + ')');
  const O = r.json;
  ok(!O.measurements.some((m) => ['4197', '4198'].includes(m.id)), 'no GPS in the options');
  const co2 = O.measurements.find((m) => m.id === '4100');
  ok(co2 && co2.unit === 'ppm' && co2.schools.includes('larnaca'), 'CO2 is offered for Larnaka (' + JSON.stringify(co2) + ')');
  ok(JSON.stringify(O).length < 4000 && !/eui|lat|lng/i.test(JSON.stringify(O)), 'options hold no device ids or positions');

  // ---- preview
  r = await mia.post('/studio/api/blocks/preview', { recipe: recipe(), lang: 'en' });
  ok(r.status === 200 && /^\/studio\/preview\/[a-f0-9]{32}$/.test(r.json.url), 'preview url (' + r.status + ' ' + JSON.stringify(r.json).slice(0, 150) + ')');
  ok(/^Show CO2 at PASCAL Larnaka for the last 24 hours as a line chart\./.test(r.json.sentence) && r.json.sensors >= 1 && r.json.readings > 5, 'preview says the sentence and counts (' + r.json.sentence + ' / ' + r.json.sensors + ' / ' + r.json.readings + ')');
  let pv = await mia.get(r.json.url, { 'sec-fetch-dest': 'iframe' });
  ok(pv.status === 200 && /<svg viewBox/.test(pv.text) && /class="ln"/.test(pv.text), 'preview page is the chart');
  console.log('scripts in preview:', (pv.text.match(/<script[^>]*>/g) || []).length, 'main part has script:', /<main>[\s\S]*<script/.test(pv.text));
  ok(!/<main>[\s\S]*<script/.test(pv.text), 'nothing inside the page body can run');
  ok(/sandbox/.test(pv.headers.get('content-security-policy') || ''), 'preview keeps the safe-box headers');
  pv = await ben.get(r.json.url, { 'sec-fetch-dest': 'iframe' });
  ok(pv.status === 404, 'only the owner opens a preview (' + pv.status + ')');
  r = await mia.post('/studio/api/blocks/preview', { recipe: recipe(), lang: 'el', title: 'Ο αέρας μου' });
  ok(/^Δείξε CO₂ στο PASCAL Λάρνακα/.test(r.json.sentence) && r.json.title === 'Ο αέρας μου', 'Greek sentence and own title');

  // ---- wrong recipes
  const wrong = async (patch, code, label) => { const q = await mia.post('/studio/api/blocks/preview', { recipe: recipe(patch) }); ok(q.status === 400 && q.json.code === code, label + ' -> ' + code + ' (' + q.status + ' ' + q.json.code + ')'); };
  await wrong({ show: { measurement: '4197', school: 'larnaca' } }, 'measurement', 'GPS measurement');
  await wrong({ last: 5 }, 'last', 'odd duration');
  await wrong({ as: 'script' }, 'as', 'unknown chart');
  await wrong({ alerts: [{ when: 'above', value: 'x', colour: 'red', say: '' }] }, 'alert_value', 'bad number');
  await wrong({ alerts: [{ when: 'above', value: 5, colour: 'red', say: 'Call me on 99 123 456' }] }, 'alert_private', 'phone number in the message');
  await wrong({ compare: { school: 'larnaca' } }, 'compare', 'compare with itself');
  r = await mia.post('/studio/api/blocks/preview', { recipe: recipe(), title: 'call 99 123456' });
  ok(r.status === 400 && r.json.code === 'title_private', 'private text in the title is refused (' + r.status + ' ' + r.json.code + ')');
  r = await mia.post('/studio/api/blocks/preview', {});
  ok(r.status === 400, 'no recipe -> 400');

  // ---- save a draft
  r = await mia.post('/studio/api/blocks/save', { recipe: recipe(), lang: 'en', title: 'Class air' });
  const p = r.json.project;
  ok(r.status === 200 && p && p.status === 'draft' && p.via === 'blocks' && p.title === 'Class air', 'draft saved (' + r.status + ' ' + JSON.stringify(r.json).slice(0, 160) + ')');
  ok(p.recipe && p.recipe.show.measurement === '4100' && p.recipe.alerts[0].say === 'Open a window!' && p.sentence.en && p.sentence.el, 'the project carries its recipe and both sentences');
  ok(p.idea === p.sentence.en, 'the idea (what a teacher reads) is the sentence');
  ok(/<svg/.test(p.html), 'a snapshot is stored for the code view');
  let g = await mia.get('/studio/api/projects/' + p.id);
  ok(g.json.project.recipe && g.json.project.via === 'blocks' && g.json.canEdit === true, 'owner can open the draft with its recipe');
  g = await ben.get('/studio/api/projects/' + p.id);
  ok(g.status === 404, 'another student cannot see the draft');
  r = await ben.post('/studio/api/blocks/save', { id: p.id, recipe: recipe(), title: 'Mine now' });
  ok(r.status === 404, 'another student cannot overwrite it (' + r.status + ')');

  // ---- change the draft with blocks (same id), then submit
  r = await mia.post('/studio/api/blocks/save', { id: p.id, recipe: recipe({ as: 'bars', last: 72 }), lang: 'en', title: 'Class air', submit: true, show_name: false });
  ok(r.status === 200 && r.json.project.id === p.id && r.json.project.status === 'pending' && r.json.project.recipe.as === 'bars', 'updated in place and sent to the teacher (' + r.json.project.status + ')');
  const mine = (await mia.get('/studio/api/projects?scope=mine')).json.projects;
  ok(mine.filter((x) => x.id === p.id).length === 1 && mine.find((x) => x.id === p.id).via === 'blocks', 'one project, marked via blocks');
  const rev = (await teacher.get('/studio/api/projects?scope=review')).json.projects;
  ok(rev.some((x) => x.id === p.id && /bar chart/.test(x.idea)), 'the teacher reads the sentence as the idea (' + JSON.stringify((rev.find((x) => x.id === p.id) || {}).idea) + ')');
  let pg = await teacher.get('/studio/p/' + p.id, { 'sec-fetch-dest': 'iframe' });
  ok(pg.status === 200 && /class="bar/.test(pg.text), 'the teacher opens the live page');
  pg = await vis.get('/studio/p/' + p.id, { 'sec-fetch-dest': 'iframe' });
  ok(pg.status === 404, 'a visitor cannot open it before approval');
  r = await teacher.post(`/studio/api/projects/${p.id}/review`, { decision: 'approve', note: 'Nice' });
  ok(r.status === 200 && r.json.project.status === 'approved', 'approved');

  // ---- the public live page
  pg = await vis.get('/studio/p/' + p.id, { 'sec-fetch-dest': 'iframe' });
  ok(pg.status === 200 && /<svg viewBox/.test(pg.text) && /Class air/.test(pg.text) && /lang="en"/.test(pg.text), 'a visitor opens the approved page');
  ok(/last 3 days|For the last 3 days/.test(pg.text), 'it shows the recipe, 3 days (' + (pg.text.match(/For [^<]*/) || [''])[0] + ')');
  pg = await vis.get('/studio/p/' + p.id + '?lang=el', { 'sec-fetch-dest': 'iframe' });
  ok(/lang="el"/.test(pg.text) && /τις τελευταίες 3 ημέρες/.test(pg.text), 'the same page in Greek with ?lang=el');
  pg = await vis.get('/studio/p/' + p.id, { 'sec-fetch-dest': 'iframe', 'accept-language': 'el-GR,el;q=0.9' });
  ok(/lang="el"/.test(pg.text), 'Greek from Accept-Language');
  const drawn = (await vis.get('/studio/p/' + p.id, { 'sec-fetch-dest': 'iframe' })).text;
  ok(/drawn \d\d:\d\d/.test(drawn), 'it says when it was drawn (live)');
  pg = await vis.get('/studio/p/' + p.id, { 'sec-fetch-dest': 'document' });
  ok(pg.status === 200 && /<iframe/.test(pg.text) && /sandbox="allow-scripts"/.test(pg.text), 'opened on its own it sits in the wrapper frame');
  const gal = (await vis.get('/studio/api/projects?scope=gallery')).json.projects;
  const gi = gal.find((x) => x.id === p.id);
  ok(gi && gi.via === 'blocks' && !('recipe' in gi) && !('html' in gi), 'the gallery lists it without code or recipe (' + JSON.stringify(Object.keys(gi || {})) + ')');

  // ---- any change sends it back to draft; hand-edited code stops being drawn from the recipe
  r = await mia.post('/studio/api/blocks/save', { id: p.id, recipe: recipe(), lang: 'en', title: 'Class air' });
  ok(r.json.project.status === 'draft', 'a change after approval sends it back to draft (' + r.json.project.status + ')');
  const code = await mia.post(`/studio/api/projects/${p.id}/code`, { html: '<!doctype html><title>x</title><p id="mine">my own page</p>' });
  ok(code.status === 200 && code.json.project.via === 'student-edit', 'code edit works and marks the page (' + code.status + ')');
  pg = await mia.get('/studio/p/' + p.id, { 'sec-fetch-dest': 'iframe' });
  ok(/id="mine"/.test(pg.text) && !/<svg viewBox/.test(pg.text), 'after a hand edit the stored page is served, not the recipe');
  r = await mia.post('/studio/api/blocks/save', { id: p.id, recipe: recipe(), title: 'Back' });
  ok(r.status === 400 && r.json.code === 'blocks', 'a hand-edited page cannot be turned back into a blocks page by id (' + r.status + ')');

  // ---- a normal (chat) project is not touched by the blocks routes
  const plain = (await mia.post('/studio/api/projects', { title: 'Plain', html: '<p>hi</p>' })).json.project;
  r = await mia.post('/studio/api/blocks/save', { id: plain.id, recipe: recipe(), title: 'x' });
  ok(r.status === 400, 'a chat project cannot be overwritten by the block saver (' + r.status + ')');
  ok(!('recipe' in (await mia.get('/studio/api/projects/' + plain.id)).json.project), 'no recipe on a chat project');

  // ---- an alert-free number tool and the table
  r = await mia.post('/studio/api/blocks/save', { recipe: recipe({ as: 'number', alerts: [], compare: null, last: 1 }), lang: 'el', title: '' });
  ok(r.status === 200 && r.json.project.title === 'CO₂ στο PASCAL Λάρνακα' && /Δείξε CO₂/.test(r.json.project.idea), 'empty title -> default Greek title, Greek idea (' + r.json.project.title + ')');
  r = await mia.post('/studio/api/blocks/save', { recipe: recipe({ as: 'table', last: 6, compare: null }), lang: 'en' });
  ok(r.status === 200, 'table saved');

  // ---- size and rate limits
  r = await mia.post('/studio/api/blocks/save', { recipe: recipe(), pad: 'x'.repeat(20000) });
  ok(r.status === 413 || r.status === 400, 'a huge body is refused (' + r.status + ')');
  let limited = 0;
  for (let i = 0; i < 130; i++) { const q = await ben.post('/studio/api/blocks/preview', { recipe: recipe({ show: { measurement: '4100', school: 'limassol' }, compare: null }) }); if (q.status === 429) { limited++; break; } }
  ok(limited === 1, 'previews are rate limited');

  srv.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
