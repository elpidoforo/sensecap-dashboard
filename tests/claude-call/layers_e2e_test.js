'use strict';
/* The real server, with a pretend Anthropic API that answers like claude-sonnet-5-5 does: HTTP 400 to a forced tool_choice, a tool call to "auto" when
   the message says which tool to call. The Data layers master brain must write its findings and answer a question with it (by "ai", not the template).
   Run: node tests/claude-call/layers_e2e_test.js (no network, no key; ports 3961 and 3962) */
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const PORT = 3961, API = 3962, BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const seen = [];     // what the pretend API received: { tool, choice, thinking }
let refused = 0;
const fake = http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const b = JSON.parse(raw), tool = b.tools && b.tools[0] && b.tools[0].name, tc = b.tool_choice || null;
    seen.push({ tool, choice: tc && tc.type, thinking: b.thinking && b.thinking.type });
    const send = (st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (tc && (tc.type === 'tool' || tc.type === 'any')) { refused++; return send(400, { type: 'error', error: { type: 'invalid_request_error', message: 'tool_choice: type "tool" and "any" are not supported for this model.' } }); }
    const user = b.messages[b.messages.length - 1].content;
    if (typeof user !== 'string' || !user.includes('calling the tool ' + tool)) return send(200, { content: [{ type: 'text', text: 'In words.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
    let input;
    if (tool === 'give_findings') {
      const j = JSON.parse(user.slice(0, user.lastIndexOf('\n\nAnswer by calling')));
      input = { headline: { en: 'The layers agree and differ in a few places.', el: 'Τα επίπεδα συμφωνούν και διαφέρουν σε μερικά σημεία.' }, findings: j.candidates.map((c) => ({ id: c.id, title: { en: 'Sources compared', el: 'Σύγκριση πηγών' }, body: { en: 'Two sources were compared by the master brain.', el: 'Δύο πηγές συγκρίθηκαν από τον κεντρικό εγκέφαλο.' } })) };
    } else input = { en: 'There is not enough data to say.', el: 'Δεν υπάρχουν αρκετά δεδομένα.', cites: [] };
    send(200, { content: [{ type: 'thinking', thinking: 'x', signature: 's' }, { type: 'tool_use', id: 't1', name: tool, input }], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } });
  });
});
(async () => {
  await new Promise((r) => fake.listen(API, '127.0.0.1', r));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-call-'));
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dataDir, ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${API}`, ANTHROPIC_MODEL: '', BOT_MODEL: 'claude-sonnet-5-5' };
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/layers/api/register'); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  const post = async (body) => { const r = await fetch(BASE + '/layers/api/brain', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify(body) }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { /* html */ } return { status: r.status, json: j, text: t }; };

  let r = await post({ city: 'larnaka' });
  ok(r.status === 200, 'brain: 200 (' + r.status + ' ' + r.text.slice(0, 160) + ')');
  const f = r.json.findings || r.json;
  ok(r.json.by === 'ai' || (f && f.by === 'ai'), 'brain: the findings were written by the assistant, not the template (' + r.text.slice(0, 260) + ')');
  ok(seen.some((s) => s.tool === 'give_findings'), 'brain: the assistant was asked for the findings');
  ok(refused === 0, 'brain: no forced tool_choice reached the API (' + refused + ' refused)');
  ok(seen.filter((s) => s.tool).every((s) => s.choice === 'auto' && s.thinking === 'between_tools'), 'brain: every call was sent as auto with thinking turned down (' + JSON.stringify(seen) + ')');

  r = await post({ city: 'larnaka', question: 'Is the air in Larnaka worse than at the airport right now?' });
  ok(r.status === 200, 'question: 200 (' + r.status + ' ' + r.text.slice(0, 160) + ')');
  ok(/not enough data/i.test(r.text), 'question: the assistant\'s answer is shown (' + r.text.slice(0, 260) + ')');
  ok(refused === 0, 'question: still no forced tool_choice reached the API');

  srv.kill(); fake.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
