'use strict';
/* Which AI service a request goes to (ai-route.js), and that the callers really address it that way.
   A pretend service stands in for both Anthropic and OpenRouter: no network, no key.
   Run: node tests/claude-call/route_test.js */
const http = require('node:http');
const path = require('node:path');
const route = require('../../ai-route.js');
const { makeClaude } = require('../../council.js').kit || require('../../council.js');
const { createBot } = (() => { const b = require('../../bot.js'); return b.createBot ? b : { createBot: b }; })();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

// ---- the choice
let p = route.pick({ ANTHROPIC_API_KEY: 'a-key' });
ok(p.provider === 'anthropic' && p.apiKey === 'a-key' && p.baseUrl === undefined, 'with only an Anthropic key the site talks to Anthropic');
p = route.pick({ ANTHROPIC_API_KEY: 'a-key', OPENROUTER_API_KEY: 'o-key' });
ok(p.provider === 'openrouter' && p.apiKey === 'o-key' && p.baseUrl === 'https://openrouter.ai/api' && p.zdr === true, 'with an OpenRouter key the site talks to OpenRouter, keep-nothing providers only');
p = route.pick({ ANTHROPIC_API_KEY: 'a-key', OPENROUTER_API_KEY: 'o-key', AI_PROVIDER: 'anthropic' });
ok(p.provider === 'anthropic' && p.apiKey === 'a-key', 'AI_PROVIDER=anthropic keeps Anthropic even with an OpenRouter key');
p = route.pick({ ANTHROPIC_API_KEY: 'a-key', OPENROUTER_API_KEY: 'o-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' });
ok(p.provider === 'anthropic' && p.baseUrl === 'http://127.0.0.1:9', 'an Anthropic address set on purpose is respected');
p = route.pick({ AI_PROVIDER: 'openrouter' });
ok(p.provider === 'openrouter' && p.apiKey === '', 'asked for OpenRouter without a key: no key, so the assistant stays off');
ok(!/a-key|o-key/.test(route.describe(route.pick({ ANTHROPIC_API_KEY: 'a-key', OPENROUTER_API_KEY: 'o-key' }))), 'the start-up sentence never holds a key');

// ---- names and headers
ok(route.slug('claude-sonnet-5-5') === 'anthropic/claude-sonnet-5.5' && route.slug('claude-haiku-4-5') === 'anthropic/claude-haiku-4.5', 'a model gets its OpenRouter name');
ok(route.slug('claude-sonnet-5-5-20260928') === 'anthropic/claude-sonnet-5.5-20260928', 'a dated model keeps its date');
ok(route.slug('anthropic/claude-opus-5.5') === 'anthropic/claude-opus-5.5' && route.slug('claude-legacy') === 'anthropic/claude-legacy' && route.slug('') === '', 'a name with a slash is left alone');
const hA = route.headers('k1', 'https://api.anthropic.com'), hO = route.headers('k2', 'https://openrouter.ai/api');
ok(hA['x-api-key'] === 'k1' && !hA.authorization, 'Anthropic gets the key in x-api-key');
ok(hO.authorization === 'Bearer k2' && !hO['x-api-key'], 'OpenRouter gets the key as a bearer token, and no x-api-key');
ok(!route.viaOpenRouter('https://notopenrouter.ai/api') && !route.viaOpenRouter('https://openrouter.ai.evil.example/api') && route.viaOpenRouter('https://openrouter.ai/api/'), 'only the real host counts as OpenRouter');
const body = { model: 'claude-sonnet-5-5', max_tokens: 5, messages: [] };
const wA = route.wire(body, 'https://api.anthropic.com'), wO = route.wire(body, 'https://openrouter.ai/api');
ok(wA === body, 'a request to Anthropic is sent as it is');
ok(wO.model === 'anthropic/claude-sonnet-5.5' && wO.provider && wO.provider.zdr === true && body.model === 'claude-sonnet-5-5' && !body.provider, 'a request to OpenRouter gets the name and the keep-nothing rule; the caller\'s own body is not changed');
route.pick({ OPENROUTER_API_KEY: 'o', AI_ZDR: '0' }); ok(!route.wire(body, 'https://openrouter.ai/api').provider, 'AI_ZDR=0 lifts the rule');
route.pick({ OPENROUTER_API_KEY: 'o' }); ok(route.wire(body, 'https://openrouter.ai/api').provider.zdr === true, 'and it is on again by default');

// ---- the callers, against a pretend service
const seen = [];
const server = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => { seen.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'x', content: [{ type: 'text', text: 'hello' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })); }); });
server.listen(0, '127.0.0.1', async () => {
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    const or = route.pick({ OPENROUTER_API_KEY: 'or-secret', OPENROUTER_BASE: origin });
    ok(or.baseUrl === origin + '/api', 'OPENROUTER_BASE points the site at a stand-in');
    await makeClaude({ apiKey: or.apiKey, baseUrl: or.baseUrl })({ model: 'claude-sonnet-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
    let s = seen.pop();
    ok(s && s.url === '/api/v1/messages', 'the Council caller posts to /api/v1/messages (' + (s && s.url) + ')');
    ok(s && s.headers.authorization === 'Bearer or-secret' && !s.headers['x-api-key'], 'with the bearer key');
    ok(s && s.body.model === 'anthropic/claude-sonnet-5.5' && s.body.provider && s.body.provider.zdr === true, 'with the OpenRouter model name and the keep-nothing rule');
    await makeClaude({ apiKey: 'an-secret', baseUrl: origin })({ model: 'claude-sonnet-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
    s = seen.pop();
    ok(s && s.url === '/v1/messages' && s.headers['x-api-key'] === 'an-secret' && !s.headers.authorization && s.body.model === 'claude-sonnet-5-5' && !s.body.provider, 'the same caller pointed at Anthropic is unchanged');
    // the assistant (bot.js) sends through the same two functions
    const src = require('node:fs').readFileSync(path.join(__dirname, '../../bot.js'), 'utf8') + require('node:fs').readFileSync(path.join(__dirname, '../../studio.js'), 'utf8') + require('node:fs').readFileSync(path.join(__dirname, '../../council.js'), 'utf8');
    ok((src.match(/aiRoute\.headers\(apiKey, base\)/g) || []).length === 3 && (src.match(/aiRoute\.wire\(/g) || []).length === 3 && !/'x-api-key': apiKey/.test(src), 'the assistant, the studio and the Council all address requests through ai-route, and none writes the key header itself');
  } catch (e) { fail++; console.log('FAIL the callers: ' + e.message); }
  server.close();
  console.log('route: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
});
