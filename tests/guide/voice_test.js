'use strict';
/* Kleanthis's made voice and the hold-to-talk microphone (voice.js, /app/api/voice*, site/guide.js).
   The speech service is a fake on this machine (OPENROUTER_BASE), so nothing leaves it and no real key is used.
   Real server in demo mode, real browser with a pretend microphone. Run: node tests/guide/voice_test.js   (ports 3963-3966) */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const { createVoice, wav } = require('../../voice');
const ROOT = path.join(__dirname, '..', '..'), PORT = 3963, FAKE = 3964, OFF = 3965, AI = 3966, BASE = 'http://127.0.0.1:' + PORT;
const KEY = 'sk-or-test-not-a-real-key';
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// the pretend speech service: remembers what it was asked, answers with a short tone or with words
const seen = { speech: [], hear: [], auth: [] };
let speechStatus = 200, heardText = 'Which city is the warmest today?';
const tone = (secs) => { const b = Buffer.alloc(Math.floor(24000 * secs) * 2); for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(Math.round(Math.sin(i / 12) * 6000), i * 2); return b; };
const fake = http.createServer((req, res) => {
  const parts = []; req.on('data', (d) => parts.push(d));
  req.on('end', () => {
    let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (e) { j = {}; }
    seen.auth.push(req.headers.authorization || '');
    if (req.url === '/api/v1/audio/speech') {
      seen.speech.push(j);
      if (speechStatus !== 200) { res.writeHead(speechStatus, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'no, and your key was ' + KEY } })); }
      res.writeHead(200, { 'content-type': 'audio/pcm;rate=24000' }); return res.end(tone(0.4));
    }
    if (req.url === '/api/v1/audio/transcriptions') {
      seen.hear.push(j);
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ text: heardText, usage: { seconds: 2 } }));
    }
    res.writeHead(404); res.end();
  });
});
// the pretend assistant, so the guide can answer in the browser part
const ai = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Nicosia is often the warmest. Look at the four numbers.' }], usage: { input_tokens: 5, output_tokens: 5 } })); }); });

function agent(base) {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) { const c = sc.split(';')[0]; if (!/=$/.test(c) && (!cookie || c.split('=')[0] === cookie.split('=')[0])) cookie = c; }
    const buf = Buffer.from(await r.arrayBuffer()); let json = {}; try { json = JSON.parse(buf.toString('utf8')); } catch (e) { /* sound */ }
    return { status: r.status, json, buf, type: r.headers.get('content-type') || '' };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b || {}), cookie: () => cookie };
}
const start = (port, dir, extra) => spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), DEMO: '1', OPEN_METEO_MOCK: '1', SATELLITE: '0', DATA_DIR: dir, ADMIN_SETUP_CODE: 'VC-SETUP', ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + AI, BOT_IP_MINUTE: '500', BOT_IP_DAILY: '500', ...extra } });
const up = async (base) => { for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/app/api/voice'); if (r.ok) return; } catch (e) { /* not up yet */ } await wait(300); } };

(async () => {
  await new Promise((r) => fake.listen(FAKE, '127.0.0.1', r));
  await new Promise((r) => ai.listen(AI, '127.0.0.1', r));

  /* ---------- voice.js on its own ---------- */
  const w = wav(Buffer.alloc(100), 24000);
  ok(w.length === 144 && w.toString('latin1', 0, 4) === 'RIFF' && w.readUInt32LE(24) === 24000 && w.readUInt32LE(40) === 100, 'wav: a correct header is put in front of the samples');
  const none = createVoice({ apiKey: '' });
  ok(none.enabled === false, 'no key: the voice is off');
  let threw = false; try { await none.speak('Hello', 'en'); } catch (e) { threw = true; } ok(threw, 'no key: nothing is sent');
  ok(seen.speech.length === 0, 'no key: the service was not called');

  /* ---------- the server ---------- */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-')), dirOff = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-off-'));
  let logs = '';
  const srv = start(PORT, dir, { OPENROUTER_API_KEY: KEY, OPENROUTER_BASE: 'http://127.0.0.1:' + FAKE });
  srv.stdout.on('data', (d) => { logs += d; }); srv.stderr.on('data', (d) => { logs += d; });
  const srvOff = start(OFF, dirOff, { OPENROUTER_API_KEY: '' });
  process.on('exit', () => { try { srv.kill(); srvOff.kill(); } catch (e) { /* gone */ } });
  await up(BASE); await up('http://127.0.0.1:' + OFF);

  const off = agent('http://127.0.0.1:' + OFF);
  let r = await off.get('/app/api/voice');
  ok(r.status === 200 && r.json.speak === false && r.json.listen === false, 'no key on the server: the page is told there is no made voice and no microphone');
  r = await off.post('/app/api/voice/speak', { text: 'Hello', lang: 'en' });
  ok(r.status === 503, 'no key on the server: speaking answers 503 (' + r.status + ')');

  const vis = agent(BASE);
  r = await vis.get('/app/api/voice');
  ok(r.status === 200 && r.json.speak === true && r.json.listen === false && r.json.listenSwitch === false, 'with a key: the voice is on, the microphone is off until a teacher switches it on');
  ok(!JSON.stringify(r.json).includes(KEY), 'the key is not sent to the page');
  r = await vis.post('/app/api/voice/speak', { text: 'Hello, my name is Kleanthis.', lang: 'en' });
  ok(r.status === 200 && /audio\/wav/.test(r.type) && r.buf.toString('latin1', 0, 4) === 'RIFF' && r.buf.length > 5000, 'speak: a sound file comes back (' + r.status + ' ' + r.type + ' ' + r.buf.length + ')');
  const sent = seen.speech[0] || {};
  ok(sent.input === 'Hello, my name is Kleanthis.' && sent.response_format === 'pcm' && typeof sent.voice === 'string' && /teacher/.test(sent.instructions || ''), 'speak: the service gets the words, a voice and the way to say them');
  ok(seen.auth[0] === 'Bearer ' + KEY, 'speak: the key goes to the service in the header');
  await vis.post('/app/api/voice/speak', { text: 'Hello, my name is Kleanthis.', lang: 'en' });
  ok(seen.speech.length === 1, 'speak: the same words a second time cost nothing (kept in memory)');
  await vis.post('/app/api/voice/speak', { text: 'Γεια σου, είμαι ο Κλεάνθης.', lang: 'el' });
  ok(seen.speech.length === 2 && /Greek/.test(seen.speech[1].instructions), 'speak: Greek words are marked as Greek');
  r = await vis.post('/app/api/voice/speak', { text: 'x'.repeat(701), lang: 'en' });
  ok(r.status === 413, 'speak: more than 700 letters is refused (' + r.status + ')');
  r = await vis.post('/app/api/voice/speak', { text: '   ', lang: 'en' });
  ok(r.status === 400, 'speak: nothing to say is refused (' + r.status + ')');
  speechStatus = 500;
  r = await vis.post('/app/api/voice/speak', { text: 'A line the service refuses.', lang: 'en' });
  ok(r.status === 502 && !r.buf.toString('utf8').includes(KEY), 'speak: a failing service gives a plain message without the key (' + r.status + ')');
  speechStatus = 200;
  await wait(200);
  ok(!logs.includes(KEY), 'the key is never written to the log, even when the service repeats it');

  // the microphone: off, then switched on by a teacher only
  const sound = wav(tone(1), 16000).toString('base64');
  r = await vis.post('/app/api/voice/listen', { audio: sound, lang: 'en' });
  ok(r.status === 403 && seen.hear.length === 0, 'listen: refused while the switch is off, and nothing is sent on (' + r.status + ')');
  r = await vis.put('/app/api/voice/switch', { listen: true });
  ok(r.status === 401 || r.status === 403, 'switch: a visitor cannot change it (' + r.status + ')');
  const adm = agent(BASE);
  await adm.post('/app/api/admin-join', { setup_code: 'VC-SETUP', name: 'owner', password: 'Voice-owner-pass-1' });
  const schools = (await vis.get('/app/api/schools/public')).json.schools;
  const stu = agent(BASE);
  await stu.post('/app/api/join', { school_id: schools[0].id, role: 'student', name: 'Mia Test', password: 'pass-MiaTest-12', consent: true, new_team: 'Hermes' });
  const ov = (await adm.get('/app/api/manage/overview')).json;
  for (const m of ov.members || []) if (m.status === 'pending') await adm.post('/app/api/manage/users/' + m.id + '/approve', {});
  r = await stu.put('/app/api/voice/switch', { listen: true });
  ok(r.status === 401 || r.status === 403, 'switch: a student cannot change it (' + r.status + ')');
  r = await adm.put('/app/api/voice/switch', { listen: 'yes' });
  ok(r.status === 400, 'switch: only true or false (' + r.status + ')');
  r = await adm.put('/app/api/voice/switch', { listen: true });
  ok(r.status === 200 && r.json.listen === true, 'switch: a signed-in member of staff switches the microphone on (' + r.status + ')');
  r = await vis.get('/app/api/voice');
  ok(r.json.listen === true, 'switch: the page is told the microphone is on');

  r = await vis.post('/app/api/voice/listen', { audio: sound, lang: 'el' });
  ok(r.status === 200 && r.json.text === heardText, 'listen: the words come back (' + r.status + ' ' + JSON.stringify(r.json).slice(0, 80) + ')');
  const h = seen.hear[0] || {};
  ok(h.input_audio && h.input_audio.format === 'wav' && h.input_audio.data === sound && h.language === 'el' && h.provider && h.provider.zdr === true, 'listen: the service gets the recording, the language, and the keep-nothing request');
  r = await vis.post('/app/api/voice/listen', { audio: Buffer.alloc(6000, 7).toString('base64'), lang: 'en' });
  ok(r.status === 400, 'listen: something that is not a sound file is refused (' + r.status + ')');
  r = await vis.post('/app/api/voice/listen', { audio: 'A'.repeat(1400004), lang: 'en' });
  ok(r.status === 413, 'listen: a recording that is too long is refused (' + r.status + ')');
  heardText = 'x'.repeat(500);
  r = await vis.post('/app/api/voice/listen', { audio: sound, lang: 'en' });
  ok(r.status === 200 && r.json.text.length === 300, 'listen: the words are cut to 300 letters');
  heardText = 'Which city is the warmest today?';
  let limited = 0; for (let i = 0; i < 6; i++) { r = await vis.post('/app/api/voice/listen', { audio: sound, lang: 'en' }); if (r.status === 429) limited++; }
  ok(limited >= 1, 'listen: one visitor cannot use it more than six times a minute');
  await wait(200);
  const kept = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else kept.push(p); });
  walk(dir);
  ok(!kept.some((p) => /\.(wav|webm|mp3|ogg|pcm)$/i.test(p)), 'listen: no recording is written to disk');
  ok(!logs.includes(heardText) && !logs.includes(sound.slice(0, 60)), 'listen: neither the recording nor the words are written to the log');
  ok(!kept.some((p) => { try { return fs.statSync(p).size < 5e6 && fs.readFileSync(p).includes(heardText); } catch (e) { return false; } }), 'listen: the words are not stored in the data folder');

  /* ---------- the browser ---------- */
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = []; page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused/i.test(m.text())) errors.push(m.text()); });
  const spoken = []; page.on('request', (q) => { if (/\/app\/api\/voice\/speak$/.test(q.url())) { try { spoken.push(JSON.parse(q.postData()).text); } catch (e) { /* not ours */ } } });
  await page.addInitScript(() => { try { localStorage.setItem('sc.guide.who.v1', JSON.stringify({ who: 'student', age: 'lower', goal: 'look' })); localStorage.setItem('sc.guide.hello.v1', '1'); } catch (e) { /* private */ } });
  await page.goto(BASE + '/#/home'); await page.waitForSelector('.kg-btn');
  await page.click('.kg-btn'); await page.waitForSelector('.kg-panel:not([hidden])');
  await page.waitForFunction(() => { const m = document.querySelector('.kg-mic'); return m && !m.hidden; }, null, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => !document.querySelector('.kg-mic').hidden), 'page: with the switch on, the hold-to-talk button is shown');
  ok(/only while you hold/.test(await page.textContent('.kg-f')), 'page: the footer says how the microphone works');
  ok(await page.evaluate(() => document.querySelector('.kg-staff').hidden), 'page: a student does not see the teacher switch');

  const before = spoken.length;
  await page.click('.kg-chip >> nth=0');
  await page.waitForFunction(() => document.querySelector('.kg-root').classList.contains('talking'), null, { timeout: 15000 }).catch(() => {});
  ok(spoken.length > before, 'page: the answer is sent to be spoken by the made voice');
  ok(await page.evaluate(() => document.querySelector('.kg-root').classList.contains('talking')), 'page: the face shows he is speaking while the sound plays');
  ok(!spoken.some((t) => /Explain this page|Mia/.test(t)), 'page: only Kleanthis\'s own words go to the speech service');
  await page.waitForFunction(() => !document.querySelector('.kg-root').classList.contains('talking'), null, { timeout: 15000 }).catch(() => {});
  ok(await page.evaluate(() => !document.querySelector('.kg-root').classList.contains('talking')), 'page: the ring stops when the sound ends');
  await page.waitForFunction(() => !document.querySelector('.kg-in button:last-child').disabled, null, { timeout: 15000 }).catch(() => {});

  // hold to talk: the words land in the box, and nothing goes to Kleanthis until Send
  let asks = 0; page.on('request', (q) => { if (/\/app\/api\/ask$/.test(q.url())) asks++; });
  const heardBefore = seen.hear.length;
  await wait(61000);                                   // the six-a-minute limit used above belongs to another visitor, but be patient anyway
  const mic = await page.$('.kg-mic'), box = await mic.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.kg-mic').classList.contains('on'), null, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => document.querySelector('.kg-mic').classList.contains('on') && !document.querySelector('.kg-live').hidden), 'page: while held, the button is red and a notice says the microphone is on');
  await wait(1500); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.kg-in input').value.length > 0, null, { timeout: 15000 }).catch(() => {});
  ok(await page.inputValue('.kg-in input') === heardText, 'page: the spoken words are put in the box (' + (await page.inputValue('.kg-in input')) + ')');
  ok(seen.hear.length === heardBefore + 1, 'page: one recording was sent, once');
  const rec = seen.hear[seen.hear.length - 1] || {}, bytes = Buffer.from((rec.input_audio && rec.input_audio.data) || '', 'base64');
  ok(bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.readUInt32LE(24) === 16000 && bytes.readUInt16LE(22) === 1 && bytes.length > 16000 && bytes.length < 200000, 'page: the recording is a small one-channel sound file (' + bytes.length + ' bytes)');
  ok(asks === 0, 'page: nothing has gone to Kleanthis yet: the student reads the words first');
  ok(await page.evaluate(() => !document.querySelector('.kg-mic').classList.contains('on')), 'page: the microphone is off again after letting go');
  await page.click('.kg-in button:last-child');
  await page.waitForFunction(() => document.querySelectorAll('.kg-you').length >= 2, null, { timeout: 10000 }).catch(() => {});
  ok(asks === 1, 'page: pressing Send sends the question');

  // a failing speech service: the browser's own voice takes over and the page does not break
  speechStatus = 500;
  await page.waitForFunction(() => !document.querySelector('.kg-in button:last-child').disabled, null, { timeout: 15000 }).catch(() => {});
  await page.fill('.kg-in input', 'What is the wind doing in Limassol?'); await page.click('.kg-in button:last-child');
  await page.waitForFunction(() => document.querySelectorAll('.kg-a').length >= 2, null, { timeout: 15000 }).catch(() => {});
  ok(await page.evaluate(() => document.querySelectorAll('.kg-err').length === 0), 'page: when the made voice fails, the words are still shown and no error appears');
  speechStatus = 200;
  ok(errors.length === 0, 'page: the security policy allowed the sound (' + errors.slice(0, 2).join(' | ') + ')');

  // the teacher switch in the box
  const tctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const ck = adm.cookie(); await tctx.addCookies([{ name: ck.slice(0, ck.indexOf('=')), value: ck.slice(ck.indexOf('=') + 1), url: BASE }]);
  const tp = await tctx.newPage();
  await tp.addInitScript(() => { try { localStorage.setItem('sc.guide.who.v1', JSON.stringify({ who: 'teacher', age: 'lower', goal: 'look' })); localStorage.setItem('sc.guide.hello.v1', '1'); } catch (e) { /* private */ } });
  await tp.goto(BASE + '/#/home'); await tp.waitForSelector('.kg-btn'); await wait(1500);
  await tp.click('.kg-btn'); await tp.waitForSelector('.kg-panel:not([hidden])');
  await tp.waitForFunction(() => !document.querySelector('.kg-staff').hidden, null, { timeout: 8000 }).catch(() => {});
  ok(await tp.evaluate(() => !document.querySelector('.kg-staff').hidden && document.querySelector('.kg-staff input').checked), 'teacher: the switch is shown, and shows the microphone is on');
  await tp.click('.kg-staff input');
  await tp.waitForFunction(() => document.querySelector('.kg-mic').hidden, null, { timeout: 8000 }).catch(() => {});
  r = await vis.get('/app/api/voice');
  ok(r.json.listen === false, 'teacher: unticking the box switches the microphone off for everyone');
  ok(await tp.evaluate(() => document.querySelector('.kg-mic').hidden) && /microphone off/.test(await tp.textContent('.kg-f')), 'teacher: the button goes and the footer says the microphone is off');
  if (process.env.GUIDE_SHOTS) { await tp.screenshot({ path: path.join(process.env.GUIDE_SHOTS, 'voice-teacher.png') }); await page.screenshot({ path: path.join(process.env.GUIDE_SHOTS, 'voice-student.png') }); }

  await browser.close();
  srv.kill(); srvOff.kill(); fake.close(); ai.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
