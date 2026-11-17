'use strict';
/* Stage 1 of the seven-page journey: one project record, one vocabulary, a frozen version on submit,
   and the line between approving work and publishing it. Real server, demo data, real accounts.
   Run: node tests/journey/api_test.js */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const PORT = 3947, BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-'));
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };

function agent() {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) { const c = sc.split(';')[0]; cookie = /=$/.test(c) ? '' : c; }
    const text = await r.text(); let json = {}; try { json = JSON.parse(text); } catch (e) { /* html */ }
    return { status: r.status, json, text };
  };
  return { get: (u) => call('GET', u, null), post: (u, b) => call('POST', u, b || {}), patch: (u, b) => call('PATCH', u, b || {}) };
}

(async () => {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', SATELLITE: '0', DATA_DIR: dataDir, ADMIN_SETUP_CODE: 'JY-SETUP', ANTHROPIC_API_KEY: '' };
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  for (let i = 0; i < 90; i++) { try { await fetch(BASE + '/app/api/schools'); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }

  const vis = agent(), adm = agent();
  await adm.post('/app/api/admin-join', { setup_code: 'JY-SETUP', name: 'owner', password: 'Journey-owner-pass-1' });
  const sch = (await vis.get('/app/api/schools/public')).json.schools;
  const L = sch[0], N = sch[1];
  const join = async (name, school, team, role) => { const a = agent(); await a.post('/app/api/join', { school_id: school.id, role: role || 'student', name, password: 'pass-' + name.replace(/\W/g, '') + '-12', consent: true, new_team: team }); return a; };
  const mia = await join('Mia Konstantinou', L, 'Hermes'), ben = await join('Ben Ioannou', N, 'Apollo'), teacher = await join('Mrs Teacher', L, null, 'teacher');
  const ov = (await adm.get('/app/api/manage/overview')).json;
  for (const m of ov.members) if (m.status === 'pending') await adm.post(`/app/api/manage/users/${m.id}/approve`, {});

  /* ---------- one vocabulary ---------- */
  let r = await mia.get('/studio/api/status');
  const WORDS = ['draft', 'progress', 'ready', 'submitted', 'changes', 'approved'];
  ok(r.status === 200 && WORDS.every((w) => r.json.statusWords && r.json.statusWords[w]), 'the server names one set of statuses for every page');
  ok(WORDS.every((w) => Array.isArray(r.json.statusWords[w]) && r.json.statusWords[w][0] && r.json.statusWords[w][1]), 'every status has both languages');

  /* ---------- a plan, and the one vocabulary coming back out ---------- */
  r = await mia.post('/studio/api/plans', { title: 'Yard heat', question: 'Is our yard hotter than the street?' });
  const plan = r.json.plan;
  ok(r.status === 200 && plan && plan.status === 'draft', 'a new plan starts as a draft (' + r.status + ')');
  r = await mia.patch('/studio/api/plans/' + plan.id, { status: 'progress' });
  ok(r.status === 200 && r.json.plan.status === 'progress', 'a team can say the work is in progress, in the shared words (' + r.status + ' ' + (r.json.plan || {}).status + ')');
  r = await mia.patch('/studio/api/plans/' + plan.id, { status: 'ready' });
  ok(r.status === 200 && r.json.plan.status === 'ready', 'and that it is ready for review');

  /* ---------- a tool, attached to the plan it answers ---------- */
  r = await mia.post('/studio/api/projects', { title: 'Yard against street', idea: 'Two lines', html: '<p>Our yard against the street.</p>' });
  const tool = r.json.project;
  ok(r.status === 200 && tool, 'a student saves a tool (' + r.status + ')');
  ok(tool.planId === null, 'a tool starts attached to nothing');
  r = await mia.post('/studio/api/projects/' + tool.id + '/plan', { planId: plan.id });
  ok(r.status === 200 && r.json.project.planId === plan.id, 'the tool is attached to the plan (' + r.status + ')');
  r = await mia.get('/studio/api/plans?scope=mine');
  const mine = (r.json.plans || []).find((p) => p.id === plan.id);
  ok(mine && (mine.tools || []).some((t) => t.id === tool.id), 'and the plan now carries the tool, so the pages follow one piece of work');

  // another school's student cannot attach a tool to this team's plan
  r = await ben.post('/studio/api/projects', { title: 'Ben tool', idea: 'x', html: '<p>Ben.</p>' });
  const benTool = r.json.project;
  r = await ben.post('/studio/api/projects/' + benTool.id + '/plan', { planId: plan.id });
  ok(r.status === 404, 'a student cannot attach their tool to another team\'s plan (' + r.status + ')');

  /* ---------- the version a teacher reviews is frozen ---------- */
  r = await mia.post('/studio/api/projects/' + tool.id + '/submit', {});
  ok(r.status === 200 && r.json.project.status === 'submitted', 'sending a tool puts it in Submitted (' + r.status + ' ' + (r.json.project || {}).status + ')');
  ok((r.json.project.versions || []).length === 1 && r.json.project.versions[0].version === 1, 'sending takes version 1');
  // the student keeps working while the teacher reads
  await mia.post('/studio/api/projects', { id: tool.id, title: 'Yard against street', idea: 'Two lines', html: '<p>Changed after sending.</p>' });
  r = await mia.get('/studio/api/projects/' + tool.id + '/versions');
  ok(r.status === 200 && r.json.versions.length === 1, 'editing afterwards does not change the version under review');

  /* ---------- a teacher asks for changes, the student resubmits, both versions remain ---------- */
  r = await teacher.post('/studio/api/projects/' + tool.id + '/review', { decision: 'reject', note: 'Say which hours you used.' });
  ok(r.status === 200 && r.json.project.status === 'changes', 'a teacher asks for changes (' + r.status + ' ' + (r.json.project || {}).status + ')');
  r = await mia.get('/studio/api/projects/' + tool.id + '/versions');
  ok(r.json.versions.length === 1 && r.json.versions[0].decision === 'changes', 'the decision is recorded against the version it was made about');
  r = await mia.post('/studio/api/projects/' + tool.id + '/submit', {});
  ok(r.status === 200 && (r.json.project.versions || []).length === 2, 'the student resubmits and a second version is taken');
  r = await mia.get('/studio/api/projects/' + tool.id + '/versions');
  ok(r.json.versions.length === 2 && r.json.versions[0].decision === 'changes' && r.json.versions[1].decision === null,
    'both submitted versions stay available, each with its own decision');

  /* ---------- approving is not publishing ---------- */
  r = await teacher.post('/studio/api/projects/' + tool.id + '/review', { decision: 'approve', note: 'Good.' });
  ok(r.status === 200 && r.json.project.status === 'approved', 'the teacher approves it');
  ok(r.json.project.public === false, 'approving it does not put it in front of the world');
  r = await vis.get('/studio/api/projects?scope=gallery');
  ok(!(r.json.projects || []).some((p) => p.id === tool.id), 'so a visitor does not find it in the gallery');
  r = await vis.get('/studio/api/projects/' + tool.id);
  ok(r.status === 404, 'and cannot open it by its number either (' + r.status + ')');
  r = await mia.post('/studio/api/projects/' + tool.id + '/publish', { show: true });
  ok(r.status === 403, 'a student cannot publish their own work (' + r.status + ')');
  r = await ben.post('/studio/api/projects/' + tool.id + '/publish', { show: true });
  ok(r.status === 403 || r.status === 404, 'nor can a student from another school (' + r.status + ')');
  r = await teacher.post('/studio/api/projects/' + tool.id + '/publish', { show: true });
  ok(r.status === 200 && r.json.project.public === true, 'publishing is a separate act, and a teacher\'s (' + r.status + ')');
  r = await vis.get('/studio/api/projects?scope=gallery');
  ok((r.json.projects || []).some((p) => p.id === tool.id), 'now the visitor finds it');
  r = await teacher.post('/studio/api/projects/' + tool.id + '/publish', { show: false });
  ok(r.status === 200, 'and a teacher can take it down again');
  r = await vis.get('/studio/api/projects?scope=gallery');
  ok(!(r.json.projects || []).some((p) => p.id === tool.id), 'after which the visitor no longer finds it');

  /* ---------- a teacher cannot publish work that was never approved ---------- */
  r = await mia.post('/studio/api/projects', { title: 'Not sent', idea: 'x', html: '<p>Draft.</p>' });
  const draft = r.json.project;
  ok(draft.status === 'draft', 'an unsent tool is a draft');
  r = await teacher.post('/studio/api/projects/' + draft.id + '/publish', { show: true });
  ok(r.status === 400, 'a draft cannot be published without being approved first (' + r.status + ')');

  /* ---------- a student cannot approve anything ---------- */
  r = await mia.post('/studio/api/projects/' + draft.id + '/review', { decision: 'approve' });
  ok(r.status === 403, 'a student cannot approve their own work (' + r.status + ')');
  r = await ben.post('/studio/api/projects/' + tool.id + '/review', { decision: 'approve' });
  ok(r.status === 403, 'nor anyone else\'s (' + r.status + ')');

  /* ---------- a plan sent in is frozen the same way ---------- */
  r = await mia.patch('/studio/api/plans/' + plan.id, { status: 'submitted' });
  ok(r.status === 200 && r.json.plan.status === 'submitted' && (r.json.plan.versions || []).length === 1, 'a plan sent in is frozen too (' + r.status + ')');
  r = await teacher.post('/studio/api/plans/' + plan.id + '/review', { decision: 'send_back', note: 'Narrow the question.' });
  ok(r.status === 200 && r.json.plan.status === 'changes', 'a plan comes back as changes requested, in the shared words');
  ok(Boolean(r.json.plan) && ((r.json.plan.versions || [])[0] || {}).decision === 'changes', 'and the decision sits on the version it judged');

  /* ---------- the things a review caught, each with a test so they cannot come back ---------- */

  // a restart must not publish work a teacher approved and chose not to publish
  r = await mia.post('/studio/api/projects', { title: 'Quiet tool', idea: 'x', html: '<p>Quiet.</p>' });
  const quiet = r.json.project;
  await mia.post('/studio/api/projects/' + quiet.id + '/submit', {});
  await teacher.post('/studio/api/projects/' + quiet.id + '/review', { decision: 'approve' });
  r = await mia.get('/studio/api/projects/' + quiet.id);
  ok(r.json.project.public === false, 'an approved tool starts unpublished');
  srv.kill();
  await new Promise((res) => setTimeout(res, 1200));
  const srv2 = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
  process.on('exit', () => { try { srv2.kill(); } catch (e) { /* gone */ } });
  for (let i = 0; i < 90; i++) { try { await fetch(BASE + '/app/api/schools'); break; } catch (e) { await new Promise((res) => setTimeout(res, 200)); } }
  r = await vis.get('/studio/api/projects?scope=gallery');
  ok(!(r.json.projects || []).some((p) => p.id === quiet.id), 'and a restart does not publish it behind the teacher\'s back');

  // a teacher's note about a student is not carried out to the world with the published work
  await teacher.post('/studio/api/projects/' + quiet.id + '/publish', { show: true });
  r = await vis.get('/studio/api/projects/' + quiet.id);
  ok(r.status === 200, 'a published tool opens for a visitor (' + r.status + ')');
  const vv = (r.json.project || {}).versions || [];
  ok(vv.length > 0 && vv.every((x) => x.reviewNote === null), 'but a visitor never reads the teacher\'s note on it');
  r = await mia.get('/studio/api/projects/' + quiet.id);
  ok(((r.json.project || {}).versions || []).length > 0, 'while the student still sees their own version history');
  r = await ben.get('/studio/api/projects/' + quiet.id + '/versions');
  ok(r.status !== 200 || (r.json.versions || []).every((x) => x.reviewNote === null), 'and another school\'s student reads no note either');

  // editing published work takes it off public view until a teacher approves and publishes again
  await mia.post('/studio/api/projects', { id: quiet.id, title: 'Quiet tool', idea: 'x', html: '<p>Changed.</p>' });
  r = await mia.get('/studio/api/projects/' + quiet.id);
  ok(r.json.project.status === 'draft' && r.json.project.public === false, 'editing it takes it off public view');
  await mia.post('/studio/api/projects/' + quiet.id + '/submit', {});
  r = await teacher.post('/studio/api/projects/' + quiet.id + '/review', { decision: 'approve' });
  ok(r.json.project.public === false, 'and approving it again does not republish it on its own');

  // pressing send twice does not leave a version waiting for a decision forever
  r = await mia.post('/studio/api/projects', { title: 'Twice', idea: 'x', html: '<p>Twice.</p>' });
  const twice = r.json.project;
  await mia.post('/studio/api/projects/' + twice.id + '/submit', {});
  await mia.post('/studio/api/projects/' + twice.id + '/submit', {});
  r = await mia.get('/studio/api/projects/' + twice.id + '/versions');
  ok(r.json.versions.length === 1, 'sending the same tool twice makes one version, not two (' + r.json.versions.length + ')');
  await teacher.post('/studio/api/projects/' + twice.id + '/review', { decision: 'approve' });
  r = await mia.get('/studio/api/projects/' + twice.id + '/versions');
  ok(r.json.versions.every((x) => x.decision), 'and no version is left waiting for a decision');

  // a deleted tool does not hand its history to whoever gets its number next
  r = await mia.post('/studio/api/projects', { title: 'Short life', idea: 'x', html: '<p>Short.</p>' });
  const gone = r.json.project;
  await mia.post('/studio/api/projects/' + gone.id + '/submit', {});
  await mia.post('/studio/api/projects/' + gone.id + '/delete', {});
  r = await mia.post('/studio/api/projects', { title: 'Next one', idea: 'x', html: '<p>Next.</p>' });
  const next = r.json.project;
  await mia.post('/studio/api/projects/' + next.id + '/submit', {});
  r = await mia.get('/studio/api/projects/' + next.id + '/versions');
  ok(r.json.versions.length === 1 && r.json.versions[0].version === 1,
    'a new tool starts at version 1 even if it was given a deleted tool\'s number (' + JSON.stringify(r.json.versions.map((x) => x.version)) + ')');

  // an approved plan nobody published is not public either, and a teacher publishes it separately
  r = await mia.post('/studio/api/plans', { title: 'Shade map', question: 'Which corners need shade?' });
  const plan2 = r.json.plan;
  await mia.patch('/studio/api/plans/' + plan2.id, { status: 'submitted' });
  await teacher.post('/studio/api/plans/' + plan2.id + '/review', { decision: 'approve' });
  r = await vis.get('/studio/api/plans?scope=public');
  ok(!(r.json.plans || []).some((p) => p.id === plan2.id), 'an approved plan is not public until someone publishes it');
  r = await vis.get('/studio/api/plans/' + plan2.id);
  ok(r.status === 404, 'and a visitor cannot open it by its number (' + r.status + ')');
  r = await mia.post('/studio/api/plans/' + plan2.id + '/publish', { show: true });
  ok(r.status === 403, 'a student cannot publish their own plan (' + r.status + ')');
  r = await teacher.post('/studio/api/plans/' + plan2.id + '/publish', { show: true });
  ok(r.status === 200 && r.json.plan.public === true, 'a teacher publishes it as a separate act (' + r.status + ')');
  r = await vis.get('/studio/api/plans?scope=public');
  ok((r.json.plans || []).some((p) => p.id === plan2.id), 'and now it is public');

  // a public plan does not show the titles of tools the viewer may not see
  r = await mia.post('/studio/api/projects', { title: 'Secret draft tool', idea: 'x', html: '<p>Draft.</p>' });
  await mia.post('/studio/api/projects/' + r.json.project.id + '/plan', { planId: plan2.id });
  r = await vis.get('/studio/api/plans/' + plan2.id);
  ok(r.status === 200 && !((r.json.plan || {}).tools || []).some((t) => /Secret draft/.test(t.title)),
    'a public plan does not list the draft tools hanging off it');
  r = await mia.get('/studio/api/plans/' + plan2.id);
  ok(((r.json.plan || {}).tools || []).some((t) => /Secret draft/.test(t.title)), 'while the team that owns it still sees them');

  srv2.kill();
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
