'use strict';
/* Toolkit batch 4 (claims, notebook, experiment, lessons, methods) in a real browser.
   Playwright is not a dependency of the site: run where it is installed.
   Run: node tests/toolkit/batch4_test.js            (real server with demo data on port 3993)
        TK_SHOTS=/some/folder node tests/toolkit/batch4_test.js   also writes <id>_desk.png and <id>_phone.png there */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { chromium, devices } = require('playwright');
const { unsafeText } = require('../../school');   // the site's real privacy check for student text
const PORT = 3993, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.TK_SHOTS || '';
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const IDS = ['claims', 'notebook', 'experiment', 'lessons', 'methods'];

// a made-up answer of /layers/api/compare for the verdict checks (test fixtures, never shown to a visitor)
const src = (source, kind, env, value, extra) => Object.assign({ source, name: source, nameEl: source, kind, env, value, unit: '°C', ageMin: 1, stale: false, n: null, variable: 'temperature', points: [[1, value - 1], [2, value], [3, value + 1]] }, extra || {});
const answer = (city, series) => ({ at: Date.now(), city, variable: 'temperature', variables: [], series });
const FIX = {
  yes: { a: [src('st-a', 'reference-station', 'outdoor', 30), src('st-b', 'reference-station', 'outdoor', 29)], b: [src('st-a', 'reference-station', 'outdoor', 22)] },
  no: { a: [src('st-a', 'reference-station', 'outdoor', 18)], b: [src('st-a', 'reference-station', 'outdoor', 25), src('st-b', 'reference-station', 'outdoor', 26)] },
  overlap: { a: [src('st-a', 'reference-station', 'outdoor', 24), src('st-b', 'reference-station', 'outdoor', 30)], b: [src('st-a', 'reference-station', 'outdoor', 27)] },
  close: { a: [src('st-a', 'reference-station', 'outdoor', 25.5)], b: [src('st-a', 'reference-station', 'outdoor', 25)] },
  kinds: { a: [src('st-a', 'reference-station', 'outdoor', 30)], b: [src('mod', 'model', 'outdoor', 20)] },
  vehicle: { a: [src('bus', 'low-cost-sensor', 'vehicle', 35), src('st-a', 'reference-station', 'outdoor', 25.2)], b: [src('bus', 'low-cost-sensor', 'vehicle', 20), src('st-a', 'reference-station', 'outdoor', 25)] },
  stale: { a: [src('st-a', 'reference-station', 'outdoor', 30, { stale: true, ageMin: 300 })], b: [src('st-a', 'reference-station', 'outdoor', 22)] },
  missing: { a: null, b: null },
};

(async () => {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tk4-')), ANTHROPIC_API_KEY: '', LAYERS_PULSE_SECONDS: '5', LAYERS_PULSE_FIRST_MS: '300' };
  // Started through -e: several toolkit test runs share one machine, and a run that tidies up every "node server.js" must not stop this one.
  const srv = spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT, env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  let up = false;
  for (let i = 0; i < 100 && !up; i++) { try { await fetch(BASE + '/layers/api/register'); up = true; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  ok(up, 'the server starts');
  await new Promise((r) => setTimeout(r, 17000));   // let the pulse log take a few points, so "over the saved day" has something

  /* ---------- no server change: the pages are files, and the ids are routable ---------- */
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/site/pages/index.json'), 'utf8'));
  ok(IDS.every((id) => index.includes(id)), 'the five ids are in index.json');
  for (const id of IDS.concat(['tk4-kit'])) ok((await fetch(BASE + '/site/pages/' + id + '.js')).status === 200, id + '.js is served');
  for (const id of IDS.concat(['tk4-kit'])) {
    const code = fs.readFileSync(path.join(ROOT, 'public/site/pages/' + id + '.js'), 'utf8');
    ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write|\beval\(|new Function/.test(code), id + '.js never builds markup from text');
    ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'|sendBeacon|XMLHttpRequest|WebSocket|https?:\/\/(?!127)/.test(code.replace(/https?:\\\/\\\/\|www/g, '')), id + '.js sends nothing and names no outside address');
  }

  const b = await chromium.launch();
  const open = async (opts, lang, hash, before) => {
    const ctx = await b.newContext(opts), p = await ctx.newPage();
    p.errs = []; p.writes = [];
    p.on('pageerror', (e) => p.errs.push(String(e)));
    p.on('request', (r) => { if (r.method() !== 'GET') p.writes.push(r.method() + ' ' + r.url()); });
    if (before) await before(p);
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/' + hash);
    await p.waitForSelector('.k4', { timeout: 20000 });
    await p.waitForSelector('.k4 .loading', { state: 'detached', timeout: 20000 });
    return p;
  };
  const fits = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const smallText = (p) => p.evaluate(() => [...document.querySelectorAll('.k4 *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 12.5).map((e) => e.className + ':' + e.textContent.slice(0, 30)));
  const unlabelled = (p) => p.evaluate(() => [...document.querySelectorAll('.k4 button, .k4 select, .k4 input, .k4 textarea, .k4 a')].filter((e) => !(e.textContent.trim() || e.getAttribute('aria-label') || (e.id && document.querySelector('label[for="' + e.id + '"]')) || e.closest('label'))).length);
  const shot = async (p, id, name) => { if (SHOTS) { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(SHOTS, id + '_' + (name === 'desk' ? 'desk' : 'phone') + '.png'), fullPage: true }); } };
  const common = async (p, name, id) => {
    ok(await fits(p), name + ' ' + id + ': no sideways scroll');
    const small = await smallText(p); ok(small.length === 0, name + ' ' + id + ': no text under 12.5 px (' + small.slice(0, 3).join(' | ') + ')');
    ok(await unlabelled(p) === 0, name + ' ' + id + ': every control has a name');
    ok(p.errs.length === 0, name + ' ' + id + ': no script errors ' + p.errs.join(' | '));
    ok(p.writes.filter((w) => !/\/app\/api\/|\/api\/alerts/.test(w)).length === 0, name + ' ' + id + ': the page sends nothing to the server (' + p.writes.join(', ') + ')');
  };

  /* ---------- the privacy check in the browser is at least as strict as the server's ---------- */
  {
    const p = await open({ viewport: { width: 1366, height: 900 } }, '', 'methods');
    const samples = ['The sky is hazy and the hills look blurry', 'Ο ουρανός είναι θολός σήμερα', 'see https://example.org/x', 'www.site.com', 'mail me a.b@school.ac.cy', 'call 99123456', 'call +357 99 123456', '22 123456', 'my page is cool.gg', 'follow @windkid', 'temperature was 23.5 and then 24.25', 'CO2 was 1200 ppm at 10:30', 'ring 0035799123456', '700 800 9000', 'a@b', 'my name is Alex', 'με λένε Νίκο', '35.1234, 33.5678', '<b>bold</b> text', 'room 12 window 3'];
    const got = await p.evaluate((list) => list.map((s) => window.TK4.unsafeCode(s)), samples);
    samples.forEach((s, i) => { if (unsafeText(s)) ok(got[i] !== null, 'privacy: the browser check rejects what the server rejects: ' + s); });
    ok(samples.filter((s, i) => !unsafeText(s) && got[i] === null).length >= 5, 'privacy: ordinary sentences and readings pass');
    ok(got[samples.indexOf('my name is Alex')] === 'name' && got[samples.indexOf('με λένε Νίκο')] === 'name' && got[samples.indexOf('35.1234, 33.5678')] === 'place', 'privacy: the browser check also stops a name sentence and map coordinates');
    ok(await p.evaluate(() => window.TK4.checkText('<img src=x onerror=1> hello\u200b', 50).text) === 'hello', 'privacy: tags and invisible characters are removed like on the server');
    ok(await p.evaluate(() => window.TK4.checkText('x'.repeat(200), 100).ok) === false, 'privacy: a note that is too long is refused');
    await p.context().close();
  }

  for (const [name, opts, lang] of [['desk', { viewport: { width: 1366, height: 900 } }, ''], ['phone', devices['iPhone 13'], 'el']]) {
    const el = lang === 'el';

    /* ---------- claims ---------- */
    {
      const p = await open(opts, lang, 'claims');
      ok(await p.locator('.k4-block select').count() === 5 && await p.locator('.k4-block.b-var option').count() >= 5, name + ' claims: the blocks are there with the measurements');
      ok(new RegExp(el ? 'Έλεγχος ισχυρισμού' : 'Claim check').test(await p.locator('.page-head h1').innerText()), name + ' claims: the title is in the right language');
      ok(new RegExp(el ? 'Λάρνακα έχει υψηλότερη τιμή από την Πάφο' : 'in Larnaka is higher than in Paphos').test(await p.locator('.k4-say').innerText()), name + ' claims: the statement is said in words');
      await p.locator('.k4-check').click(); await p.waitForSelector('.k4-verdict');
      const verdict = await p.locator('.k4-verdict').innerText();
      ok(new RegExp(el ? 'Τα δεδομένα (το στηρίζουν|δεν το στηρίζουν|δεν μπορούν να πουν)' : 'The data (supports this|does not support this|cannot tell)').test(verdict), name + ' claims: one of the three answers (' + verdict.trim() + ')');
      ok(!/\b(true|false)\b|σωστό|λάθος/i.test(await p.locator('.k4-out').innerText()), name + ' claims: never a bare true or false');
      ok(await p.locator('.k4-check-card').count() >= 1, name + ' claims: the evidence is shown');
      const rows = await p.locator('.k4-check-card .k4-rows li').allInnerTexts();
      ok(rows.length >= 2 && rows.every((r) => /°C/.test(r) && /\d\d:\d\d/.test(r) && /(layer|στρώμα): /.test(r)), name + ' claims: every number has its unit, its time and its layer');
      ok(await p.locator('.k4-check-card h3').evaluateAll((h) => h.every((x) => /outdoors|inside vehicles|indoors|έξω|μέσα σε/.test(x.textContent))), name + ' claims: every check says where its readings were taken');
      ok(new RegExp(el ? 'δεν είναι αιτία' : 'is not a cause').test(await p.locator('.k4-honest').innerText()) && new RegExp(el ? 'καλύτερη ή χειρότερη' : 'better or worse').test(await p.locator('.k4-honest').innerText()), name + ' claims: it says a difference is not a cause and not a ranking');
      await shot(p, 'claims', name);
      // over the saved day
      await p.locator('.k4-per .k4-choice button').nth(1).click(); await p.locator('.k4-check').click(); await p.waitForSelector('.k4-verdict');
      ok(new RegExp(el ? 'μέσος όρος \\d+ αποθηκευμένων|Καμία πηγή δεν έχει' : 'average of \\d+ saved readings|No source has enough').test(await p.locator('.k4-out').innerText()), name + ' claims: the saved day uses averages and says how many readings');
      // a number, and the same city twice
      await p.locator('.k4-block.b-tk select').selectOption('number'); await p.locator('.k4-num').fill('-40');
      await p.locator('.k4-per .k4-choice button').nth(0).click(); await p.locator('.k4-check').click(); await p.waitForSelector('.k4-verdict');
      ok(new RegExp(el ? 'το στηρίζουν' : 'supports this').test(await p.locator('.k4-verdict').innerText()) && new RegExp(el ? 'τον έγραψες εσύ' : 'typed by you').test(await p.locator('.k4-out').innerText()), name + ' claims: a number can be the other side, and is marked as typed');
      await p.locator('.k4-num').fill(''); await p.locator('.k4-check').click();
      ok(await p.locator('.k4-out .err').count() === 1, name + ' claims: an empty number is refused');
      // the optional note
      await p.locator('.k4-num').fill('10');
      await p.locator('.k4-note-in').fill('call me 99123456'); await p.locator('.k4-check').click();
      ok(await p.locator('.k4-out .err').count() === 1 && await p.locator('.k4-verdict').count() === 0 && await p.locator('.k4-note-m.bad').count() === 1, name + ' claims: a note with a phone number stops the check');
      await p.locator('.k4-note-in').fill('<i>the sea keeps it cool</i>'); await p.locator('.k4-check').click(); await p.waitForSelector('.k4-mynote');
      ok(/the sea keeps it cool/.test(await p.locator('.k4-mynote').innerText()) && await p.locator('.k4-mynote i').count() === 0, name + ' claims: a clean note is shown as text only');
      ok(await p.evaluate(() => { let s = ''; for (let i = 0; i < localStorage.length; i++) s += localStorage.getItem(localStorage.key(i)); return !/sea keeps/.test(s); }), name + ' claims: the note is not stored');
      await common(p, name, 'claims');
      await p.context().close();

      // the verdicts, with made-up answers of the compare endpoint
      const want = { yes: 'yes', no: 'no', overlap: 'cannot', close: 'cannot', kinds: 'cannot', vehicle: 'cannot', stale: 'cannot', missing: 'cannot' };
      for (const key of Object.keys(FIX)) {
        const q = await open(opts, lang, 'claims?v=temperature&a=larnaka&op=higher&b=paphos&per=now', (pg) => pg.route('**/layers/api/compare**', (r) => {
          const city = new URL(r.request().url()).searchParams.get('city'), s = FIX[key][city === 'larnaka' ? 'a' : 'b'];
          return s ? r.fulfill({ json: answer(city, s) }) : r.fulfill({ status: 404, json: { error: 'No layer has that measurement for this city right now.', code: 'no_variable' } });
        }));
        await q.waitForSelector('.k4-verdict');
        const cls = await q.locator('.k4-verdict').getAttribute('class');
        ok(cls.includes('v-' + want[key]), name + ' claims: case "' + key + '" gives "' + want[key] + '" (' + cls + ')');
        const text = await q.locator('.k4-out').innerText();
        if (key === 'kinds') ok(new RegExp(el ? 'δεν θα ήταν δίκαιη σύγκριση' : 'would not be a fair comparison').test(text), name + ' claims: different kinds of reading are not compared');
        if (key === 'overlap') ok(new RegExp(el ? 'μικρότερη από τη διαφωνία των πηγών' : 'smaller than the disagreement between sources').test(text), name + ' claims: sources that differ more than the gap cannot tell');
        if (key === 'vehicle') ok(await q.locator('.k4-check-card.v-yes .k4-aside').count() === 1, name + ' claims: readings inside vehicles are shown but do not decide the answer about the city');
        if (key === 'stale') ok(new RegExp(el ? 'πολύ παλιά μέτρηση' : 'reading too old').test(text), name + ' claims: an old reading is left out and named');
        if (key === 'missing') ok(new RegExp(el ? 'δεν σημαίνουν «όχι»' : 'Missing data is not a “no”').test(text) && await q.locator('.k4-check-card').count() === 0, name + ' claims: missing data is said, not turned into an answer');
        ok(q.errs.length === 0, name + ' claims: case "' + key + '" has no script errors ' + q.errs.join(' | '));
        await q.context().close();
      }
      // the live data is down
      const d = await open(opts, lang, 'claims', (pg) => pg.route('**/layers/api/live', (r) => r.fulfill({ status: 503, json: { error: 'down' } })));
      ok(await d.locator('.k4 .err').count() === 1 && await d.locator('.k4-err button').count() === 1 && await d.locator('.k4-verdict').count() === 0, name + ' claims: with the data down it says so and offers to try again');
      await d.context().close();
      const d2 = await open(opts, lang, 'claims', (pg) => pg.route('**/layers/api/compare**', (r) => r.fulfill({ status: 500, json: { error: 'boom' } })));
      await d2.locator('.k4-check').click(); await d2.waitForSelector('.k4-out .err');
      ok(await d2.locator('.k4-verdict').count() === 0 && new RegExp(el ? 'δεν ελέγχθηκε τίποτα' : 'nothing was checked').test(await d2.locator('.k4-out').innerText()), name + ' claims: a failed reading gives no answer at all');
      await d2.context().close();
    }

    /* ---------- notebook ---------- */
    {
      const p = await open(opts, lang, 'notebook');
      ok(new RegExp(el ? 'Τετράδιο πεδίου' : 'Field notebook').test(await p.locator('.page-head h1').innerText()), name + ' notebook: the title is in the right language');
      ok(new RegExp(el ? 'ιδιωτικό σε αυτή τη συσκευή' : 'private to this device').test(await p.locator('.k4-private').innerText()) && new RegExp(el ? 'Δεν στέλνονται στον ιστότοπο' : 'not sent to the site').test(await p.locator('.k4-private').innerText()), name + ' notebook: the note that it stays on the device is clear');
      ok(await p.locator('.k4 .empty').count() === 1 && await p.locator('.k4-entry').count() === 0, name + ' notebook: an empty notebook is empty, nothing is invented');
      ok(await p.locator('.k4-nb-form [role=radiogroup]').count() === 4 && await p.locator('.k4-nb-form [role=radio]').count() === 11, name + ' notebook: four questions with choices only');
      ok(await p.locator('.k4-nb-form input[type=file], .k4-nb-form input[type=text]').count() === 0, name + ' notebook: no photo and no name field');
      await p.locator('.k4-nb-form .nm-btn--primary').click();
      ok(await p.locator('.k4-entry').count() === 0, name + ' notebook: nothing is saved without a city and answers');
      await p.locator('#k4-nb-city').selectOption('larnaka');
      for (let i = 0; i < 4; i++) await p.locator('.k4-nb-form [role=radiogroup]').nth(i).locator('button').nth(i === 0 ? 2 : 0).click();
      await p.locator('.k4-note-in').fill('ask at teacher@school.ac.cy'); await p.locator('.k4-nb-form .nm-btn--primary').click(); await p.waitForTimeout(300);
      ok(await p.locator('.k4-entry').count() === 0 && await p.locator('.k4-note-m.bad').count() === 1, name + ' notebook: a note with an e-mail address is refused');
      await p.locator('.k4-note-in').fill('the hills look blurry'); await p.locator('.k4-nb-form .nm-btn--primary').click(); await p.waitForSelector('.k4-entry');
      const entry = await p.locator('.k4-entry').first().innerText();
      ok(new RegExp(el ? 'Λάρνακα' : 'Larnaka').test(entry) && new RegExp(el ? 'με σκόνη' : 'dusty').test(entry) && /the hills look blurry/.test(entry), name + ' notebook: the entry shows the city, the choices and the note');
      const trs = await p.locator('.k4-entry .k4-tbl tr').allInnerTexts();
      ok(trs.length >= 4 && trs.every((r) => /\d/.test(r) && /\d\d:\d\d/.test(r) && /(layer|στρώμα): /.test(r)), name + ' notebook: the readings of that moment are beside it, each with its time and layer (' + trs.length + ')');
      ok(/µg\/m³/.test(trs.join(' ')) && /m\/s/.test(trs.join(' ')), name + ' notebook: dust and wind readings carry their units');
      ok(new RegExp(el ? 'ένα μοτίβο δεν είναι αιτία' : 'a pattern is not a cause').test(await p.locator('.k4-honest').innerText()), name + ' notebook: it says one entry proves nothing and a pattern is not a cause');
      const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('sc.tk4.notebook.v1')));
      ok(stored.length === 1 && stored[0].city === 'larnaka' && stored[0].sky === 'dusty' && Object.keys(stored[0]).sort().join() === 'at,city,dust,id,live,note,sky,win,wind', name + ' notebook: the entry is kept in this browser with choices, city and time only');
      ok(!/"(lat|lng|latitude|longitude|gps|name|photo|image|school|team)"\s*:/i.test(JSON.stringify(stored)), name + ' notebook: no position, name or photo in what is kept');
      await shot(p, 'notebook', name);
      await common(p, name, 'notebook');
      // it is still there after a reload, and a stored note that is not safe is hidden
      await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('sc.tk4.notebook.v1')); a[0].note = 'call 99123456 <script>'; localStorage.setItem('sc.tk4.notebook.v1', JSON.stringify(a)); });
      await p.reload(); await p.waitForSelector('.k4-entry');
      ok(!/99123456/.test(await p.locator('.k4-entry').innerText()) && await p.locator('.k4-entry script').count() === 0, name + ' notebook: after a reload the entry is back, and an unsafe stored note is not shown');
      // the sensors cannot be read: the entry says so
      await p.route('**/layers/api/live', (r) => r.fulfill({ status: 503, json: { error: 'down' } }));
      for (let i = 0; i < 4; i++) await p.locator('.k4-nb-form [role=radiogroup]').nth(i).locator('button').nth(0).click();
      await p.locator('.k4-nb-form .nm-btn--primary').click(); await p.waitForFunction(() => document.querySelectorAll('.k4-entry').length === 2);
      ok(new RegExp(el ? 'δεν διαβάστηκαν εκείνη τη στιγμή' : 'could not be read at that moment').test(await p.locator('.k4-entry').first().innerText()) && await p.locator('.k4-entry').first().locator('.k4-tbl').count() === 0, name + ' notebook: with the sensors down the entry has no made-up readings');
      await p.locator('.k4-entry header button').first().click();
      ok(await p.locator('.k4-entry').count() === 1, name + ' notebook: an entry can be deleted');
      ok(p.errs.length === 0 && p.writes.filter((w) => !/\/app\/api\//.test(w)).length === 0, name + ' notebook: no script errors and nothing sent ' + p.errs.concat(p.writes).join(' | '));
      await p.context().close();
    }

    /* ---------- experiment ---------- */
    {
      const p = await open(opts, lang, 'experiment');
      ok(new RegExp(el ? 'Σχεδίασε ένα πείραμα' : 'Experiment builder').test(await p.locator('.page-head h1').innerText()), name + ' experiment: the title is in the right language');
      ok(await p.locator('.k4-step').count() === 5, name + ' experiment: five guided steps');
      ok(new RegExp(el ? 'δεν έχει επιλεγεί ακόμη' : 'not chosen yet').test(await p.locator('.k4-plan').innerText()), name + ' experiment: an empty plan says what is not chosen yet');
      await p.locator('.k4-step').nth(0).locator('[role=radio]').nth(1).click();
      await p.locator('.k4-step').nth(1).locator('[role=radio]').nth(1).click();
      await p.locator('.k4-step').nth(2).locator('select').nth(1).selectOption('limassol');
      await p.locator('.k4-step').nth(3).locator('[role=radio]').nth(0).click();
      const plan = await p.locator('.k4-plan').innerText();
      ok(/CO₂/.test(plan) && /ppm/.test(plan) && new RegExp(el ? 'Λεμεσός' : 'Limassol').test(plan) && new RegExp(el ? 'Πριν και μετά από μία αλλαγή' : 'Before and after one change').test(plan), name + ' experiment: the plan fills in, and the question suggests its measurement and comparison');
      ok(new RegExp(el ? 'δεν δείχνει ότι το ένα προκαλεί το άλλο' : 'does not show that one causes the other').test(plan) && new RegExp(el ? 'Κάτι άλλο μπορεί να άλλαξε' : 'Something else may have changed').test(plan), name + ' experiment: the plan says how the result could be wrong and that together is not cause');
      const hash = await p.evaluate(() => location.hash);
      ok(/^#\/experiment\?/.test(hash) && /q=windows/.test(hash) && /c=limassol/.test(hash) && /m=before/.test(hash), name + ' experiment: the plan lives in the address (' + hash + ')');
      ok(await p.locator('#k4-exp-link').inputValue() === await p.evaluate(() => location.href), name + ' experiment: the link box holds that address');
      const routable = await p.evaluate(() => window.SC.ready.has('beforeafter'));
      ok(await p.locator('.k4-plan a[href^="#/beforeafter"]').count() === (routable ? 1 : 0), name + ' experiment: the Before and after link is there only when that page exists (' + routable + ')');
      ok(await p.locator('.k4-plan a[href^="#/claims?v=co2"]').count() === 1, name + ' experiment: it links to Claim check with the plan’s settings');
      await p.locator('.k4-note-in').fill('We open two windows at break'); await p.waitForTimeout(200);
      ok(/We open two windows at break/.test(await p.locator('.k4-plan').innerText()) && new RegExp(el ? 'δεν την έχει ελέγξει εκπαιδευτικός' : 'not been reviewed by a teacher').test(await p.locator('.k4-plan').innerText()), name + ' experiment: the team’s own line is on the plan, marked as not reviewed');
      await p.locator('.k4-note-in').fill('We open two windows, www.me.com'); await p.waitForTimeout(200);
      ok(!/www\.me/.test(await p.locator('.k4-plan').innerText()) && !/www/.test(await p.evaluate(() => decodeURIComponent(location.hash))), name + ' experiment: a line with a link never reaches the plan or the address');
      await p.locator('.k4-note-in').fill('We open two windows at break'); await p.waitForTimeout(200);
      const href = await p.evaluate(() => location.href);
      await shot(p, 'experiment', name);
      await common(p, name, 'experiment');
      // print: only the plan
      await p.emulateMedia({ media: 'print' });
      ok(await p.locator('.k4-plan').isVisible() && !(await p.locator('.k4-steps').isVisible()) && !(await p.locator('#side').isVisible()), name + ' experiment: printing shows the plan and hides the steps and the menu');
      await p.context().close();
      // the link reopens the plan
      const r = await open(opts, lang, href.split('#/')[1]);
      const again = await r.locator('.k4-plan').innerText();
      ok(/We open two windows at break/.test(again) && new RegExp(el ? 'Λεμεσός' : 'Limassol').test(again) && await r.locator('.k4-step').nth(0).locator('[role=radio].on').count() === 1, name + ' experiment: the link reopens the same plan');
      await r.context().close();
      const bad = await open(opts, lang, 'experiment?q=own&v=co2&c=larnaka&n=' + encodeURIComponent('ring 99123456 <img src=x onerror=alert(1)>') + '&g=zzz&m=<script>');
      ok(!/99123456/.test(await bad.locator('.k4').innerText()) && await bad.locator('.k4 .err').count() === 1 && await bad.locator('.k4 img, .k4 script').count() === 0, name + ' experiment: a link with unsafe text opens without that text and says so');
      ok(bad.errs.length === 0, name + ' experiment: a bad link makes no script error ' + bad.errs.join(' | '));
      await bad.context().close();
    }

    /* ---------- lessons ---------- */
    {
      const p = await open(opts, lang, 'lessons');
      ok(new RegExp(el ? 'Πακέτα μαθημάτων' : 'Lesson packs').test(await p.locator('.page-head h1').innerText()), name + ' lessons: the title is in the right language');
      const n = await p.locator('.k4-lesson').count();
      ok(n >= 6, name + ' lessons: at least six investigations (' + n + ')');
      const parts = await p.locator('.k4-lesson').evaluateAll((ls) => ls.map((l) => ({ q: !!l.querySelector('.k4-qn') && l.querySelector('.k4-qn').textContent.length > 30, steps: l.querySelectorAll('ol li').length, lists: l.querySelectorAll('.k4-lgrid ul').length, talk: l.querySelectorAll('.k4-lgrid h4').length, wrong: l.querySelector('.k4-wrong p') ? l.querySelector('.k4-wrong p').textContent.length : 0, link: (l.querySelector('a.k4-go') || {}).hash || '' })));
      ok(parts.every((x) => x.q && x.steps >= 4 && x.lists === 2 && x.talk === 4 && x.wrong > 60), name + ' lessons: each has a question, what you need, steps, what to look for, a discussion and how it could be wrong');
      const ready = await p.evaluate(() => [...window.SC.ready]);
      ok(parts.every((x) => x.link && ready.includes(x.link.replace(/^#\//, '').split(/[/?]/)[0])), name + ' lessons: each is tied to a tool that exists (' + parts.map((x) => x.link).join(' ') + ')');
      ok(new Set(parts.map((x) => x.link)).size >= 6, name + ' lessons: the lessons use at least six different tools');
      ok(/45/.test(await p.locator('.k4-lesson .k4-meta').first().innerText()) && /12/.test(await p.locator('.k4-lesson .k4-meta').first().innerText()), name + ' lessons: 45 minutes, ages 12 to 15');
      if (el) ok(/Βήματα/.test(await p.locator('.k4-lesson').first().innerText()) && !/\b(Steps|What you need|Talk about it)\b/.test(await p.locator('.k4').innerText()), name + ' lessons: the lessons are in Greek');
      await shot(p, 'lessons', name);
      await common(p, name, 'lessons');
      await p.emulateMedia({ media: 'print' });
      ok(await p.locator('.k4-lesson').first().isVisible() && !(await p.locator('.k4-toc').isVisible()) && !(await p.locator('#side').isVisible()), name + ' lessons: printable without the menu and the buttons');
      await p.context().close();
      const one = await open(opts, lang, 'lessons/eyes');
      await one.waitForTimeout(400);
      ok(await one.evaluate(() => { const r = document.querySelector('#k4-l-eyes').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), name + ' lessons: #/lessons/<id> opens at that lesson');
      await one.context().close();
    }

    /* ---------- methods ---------- */
    {
      const p = await open(opts, lang, 'methods');
      ok(new RegExp(el ? 'Βιβλιοθήκη μεθόδων' : 'Methods library').test(await p.locator('.page-head h1').innerText()), name + ' methods: the title is in the right language');
      ok(await p.locator('.k4-card').count() === 10, name + ' methods: ten cards');
      const cards = await p.locator('.k4-card').evaluateAll((cs) => cs.map((c) => ({ id: c.id, label: (c.querySelector('.k4-ex > b') || {}).textContent || '', lines: c.querySelectorAll('.k4-ex code').length, body: c.querySelectorAll(':scope > p').length, link: (c.querySelector('a.k4-go') || {}).hash || '' })));
      ok(cards.every((c) => new RegExp(el ? 'φτιαχτούς αριθμούς \\(όχι πραγματικές μετρήσεις\\)' : 'made-up numbers \\(not real readings\\)').test(c.label) && c.lines >= 3 && c.body >= 2), name + ' methods: every card has a worked example labelled as made up');
      const ready = await p.evaluate(() => [...window.SC.ready]);
      ok(cards.every((c) => c.link && ready.includes(c.link.replace(/^#\//, '').split(/[/?]/)[0])), name + ' methods: every card links to a tool that exists');
      for (const id of ['average-median', 'range-spread', 'why-differ', 'calibration', 'indoor-outdoor', 'sample-size', 'correlation', 'rounding-units', 'model-says', 'honest-chart']) ok(cards.some((c) => c.id === 'k4-m-' + id), name + ' methods: the card "' + id + '" is there');
      ok(new RegExp(el ? 'δεν δείχνει ότι το ένα προκαλεί το άλλο' : 'does not show that one makes the other happen').test(await p.locator('#k4-m-correlation').innerText()), name + ' methods: correlation is not cause, in plain words');
      await shot(p, 'methods', name);
      await common(p, name, 'methods');
      await p.context().close();
      const one = await open(opts, lang, 'methods/why-differ');
      await one.waitForTimeout(400);
      ok(await one.locator('#k4-m-why-differ.hit').count() === 1, name + ' methods: #/methods/<id> opens at that card');
      // a card's link really opens the other tool
      await one.locator('#k4-m-why-differ a.k4-go').click(); await one.waitForSelector('.k4-claims .k4-block');
      ok(/#\/claims/.test(await one.evaluate(() => location.hash)) && one.errs.length === 0, name + ' methods: a card opens its tool');
      await one.context().close();
    }
  }

  await b.close();
  console.log(`toolkit batch 4: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
