'use strict';
/* The Anthropic caller (makeClaude in council.js) against a pretend API that behaves like the real one for the models the site uses:
   - claude-sonnet-5-5 answers HTTP 400 to tool_choice "tool" or "any" and to thinking "disabled", and accepts "auto" and thinking "between_tools".
   - claude-sonnet-5-6 (pretend) is the same but also refuses thinking "between_tools".
   - claude-haiku-4-5 accepts a forced tool_choice.
   - claude-legacy-4 is named like an old model but refuses a forced tool_choice (the code must learn that from the 400).
   Run: node tests/claude-call/call_test.js                              (no network, no key) */
const http = require('node:http');
const assert = require('node:assert/strict');
const { makeClaude, structured } = require('../../council.js').kit || require('../../council.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const eq = (a, b, m) => { try { assert.deepEqual(a, b); pass++; } catch (e) { fail++; console.log('FAIL ' + m + '\n  got ' + JSON.stringify(a) + '\n  want ' + JSON.stringify(b)); } };

const log = [];                 // every request body the pretend API got
const script = { chattyFirst: 0, failWith: [] };   // chattyFirst: answer in words this many times; failWith: statuses to return first
const lastUser = (b) => { const m = [...(b.messages || [])].reverse().find((x) => x.role === 'user'); return typeof m.content === 'string' ? m.content : JSON.stringify(m.content); };
const server = http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const body = JSON.parse(raw); log.push(body);
    const send = (st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    const err = (m) => send(400, { type: 'error', error: { type: 'invalid_request_error', message: m } });
    if (script.failWith.length) { const st = script.failWith.shift(); return send(st, { type: 'error', error: { type: 'overloaded_error', message: 'busy' } }); }
    const model = body.model, tc = body.tool_choice, th = body.thinking;
    const forcedKind = tc && (tc.type === 'tool' || tc.type === 'any');
    if (forcedKind && (model === 'claude-sonnet-5-5' || model === 'claude-sonnet-5-6' || model === 'claude-legacy-4')) return err('tool_choice: type "tool" and "any" are not supported for this model.');
    if (th && th.type === 'disabled') return err('To turn thinking off on this model, send "thinking": {"type": "between_tools"} instead of {"type": "disabled"}.');
    if (th && th.type === 'between_tools' && model !== 'claude-sonnet-5-5') return err('thinking: type "between_tools" is not supported for this model.');
    const tool = body.tools && body.tools[0] && body.tools[0].name;
    const answer = { type: 'tool_use', id: 'toolu_1', name: tool, input: { en: 'ok', n: 7 } };
    const textOnly = { id: 'msg_1', type: 'message', role: 'assistant', model, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is my answer in words.' }], usage: { input_tokens: 5, output_tokens: 5 } };
    if (tc && tc.type === 'auto') {
      if (script.chattyFirst > 0) { script.chattyFirst--; return send(200, textOnly); }
      if (!lastUser(body).includes('calling the tool ' + tool)) return send(200, textOnly);   // it only calls the tool when told to
    }
    send(200, { id: 'msg_2', type: 'message', role: 'assistant', model, stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '...', signature: 'x' }, answer], usage: { input_tokens: 5, output_tokens: 9 } });
  });
});

const TOOL = { name: 'give_view', description: 'x', input_schema: { type: 'object', properties: { en: { type: 'string' } } } };
const mk = (model, extra) => ({ model, max_tokens: 450, system: 'S', tools: [TOOL], tool_choice: { type: 'tool', name: 'give_view' }, messages: [{ role: 'user', content: 'Question.\n\nNow call give_view.' }], ...(extra || {}) });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const call = makeClaude({ apiKey: 'k', baseUrl: 'http://127.0.0.1:' + server.address().port });

  // 1. claude-sonnet-5-5: one request, sent as auto, with the instruction and thinking turned down
  log.length = 0;
  let resp = await call(mk('claude-sonnet-5-5'));
  eq(log.length, 1, 'sonnet-5-5: one request only (no wasted 400)');
  eq(log[0].tool_choice, { type: 'auto' }, 'sonnet-5-5: tool_choice is auto');
  eq(log[0].thinking, { type: 'between_tools' }, 'sonnet-5-5: thinking is turned down');
  ok(lastUser(log[0]).includes('Answer by calling the tool give_view once'), 'sonnet-5-5: the instruction to call the tool is in the message');
  ok(lastUser(log[0]).includes('Now call give_view.'), 'sonnet-5-5: the caller\'s own words are kept');
  eq(log[0].max_tokens, 450, 'sonnet-5-5: max_tokens unchanged when thinking is off');
  eq(structured(resp, 'give_view'), { en: 'ok', n: 7 }, 'sonnet-5-5: the tool answer is read, thinking block ignored');
  ok(!('tool_choice' in mk('claude-sonnet-5-5')) === false, 'the caller\'s own body is not changed');
  eq(mk('claude-sonnet-5-5').tool_choice, { type: 'tool', name: 'give_view' }, 'the caller\'s body still says forced (not mutated)');

  // 2. the model answers in words once: asked again, once
  log.length = 0; script.chattyFirst = 1;
  resp = await call(mk('claude-sonnet-5-5'));
  eq(log.length, 2, 'words first: exactly one more request');
  ok(lastUser(log[1]).includes('You did not call the tool.'), 'words first: the second request says so');
  eq(structured(resp, 'give_view'), { en: 'ok', n: 7 }, 'words first: the answer is read after the second request');
  log.length = 0; script.chattyFirst = 5;
  resp = await call(mk('claude-sonnet-5-5'));
  eq(log.length, 2, 'words twice: it stops after one more request (never loops)');
  eq(structured(resp, 'give_view'), null, 'words twice: the caller gets null and uses its own fallback');
  script.chattyFirst = 0;

  // 3. system blocks with cache_control and array content are kept
  log.length = 0;
  await call(mk('claude-sonnet-5-5', { system: [{ type: 'text', text: 'S' }, { type: 'text', text: 'brief', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: [{ type: 'text', text: 'Q' }] }] }));
  eq(log[0].system[1].cache_control, { type: 'ephemeral' }, 'system blocks and cache_control are kept');
  eq(log[0].messages[0].content.length, 2, 'array content gets one extra text block');

  // 4. a model that refuses thinking "between_tools": retried once without it, with room for the thinking, then remembered
  log.length = 0;
  resp = await call(mk('claude-sonnet-5-6'));
  eq(log.length, 2, 'thinking refused: one retry');
  ok(!log[1].thinking, 'thinking refused: the retry has no thinking field');
  eq(log[1].max_tokens, 450 + 4000, 'thinking refused: the retry asks for more tokens');
  eq(structured(resp, 'give_view'), { en: 'ok', n: 7 }, 'thinking refused: the answer is read');
  log.length = 0;
  await call(mk('claude-sonnet-5-6'));
  eq(log.length, 1, 'thinking refused: remembered, the next call is one request');
  ok(!log[0].thinking && log[0].max_tokens === 4450, 'thinking refused: the next call already has no thinking and more tokens');

  // 5. a model that takes a forced tool_choice gets it as written
  log.length = 0;
  resp = await call(mk('claude-haiku-4-5'));
  eq(log.length, 1, 'haiku-4-5: one request');
  eq(log[0].tool_choice, { type: 'tool', name: 'give_view' }, 'haiku-4-5: forced tool_choice kept');
  ok(!log[0].thinking, 'haiku-4-5: no thinking field');
  ok(!lastUser(log[0]).includes('Answer by calling'), 'haiku-4-5: message unchanged');

  // 6. an old-looking model that refuses it: the 400 teaches the caller, once
  log.length = 0;
  resp = await call(mk('claude-legacy-4'));
  eq(log.length, 2, 'legacy-4: one 400, then one good request');
  eq(log[1].tool_choice, { type: 'auto' }, 'legacy-4: the second request is auto');
  ok(!log[1].thinking, 'legacy-4: no thinking field for a model not known to need it');
  eq(structured(resp, 'give_view'), { en: 'ok', n: 7 }, 'legacy-4: the answer is read');
  log.length = 0;
  await call(mk('claude-legacy-4'));
  eq(log.length, 1, 'legacy-4: remembered, no more 400s');

  // 7. a call without a forced tool is left alone
  log.length = 0;
  await call({ model: 'claude-sonnet-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] });
  eq(log[0].messages[0].content, 'hi', 'plain call: message untouched');
  ok(!('thinking' in log[0]) && !('tool_choice' in log[0]), 'plain call: no thinking or tool_choice added');

  // 8. busy API: retried as before, then it works; other errors are thrown with the status
  log.length = 0; script.failWith = [529];
  resp = await call(mk('claude-sonnet-5-5'));
  eq(log.length, 2, 'busy: one retry');
  ok(!!structured(resp, 'give_view'), 'busy: then the answer is read');
  script.failWith = [529, 529];
  let thrown = null; try { await call(mk('claude-sonnet-5-5')); } catch (e) { thrown = e; }
  ok(thrown && thrown.status === 529, 'busy twice: thrown with status 529');
  script.failWith = [];
  thrown = null; try { await call({ model: 'claude-sonnet-5-5', max_tokens: 10, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: 'x' }] }); } catch (e) { thrown = e; }
  ok(thrown && thrown.status === 400, 'another 400 is thrown, not hidden');

  // 9. structured() still reads a JSON object written as text
  eq(structured({ content: [{ type: 'text', text: 'Sure:\n{"en":"a","n":1}' }] }, 'give_view'), { en: 'a', n: 1 }, 'structured: JSON in text still works');

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
