'use strict';
/* The Ask bubble (site/ask-bubble.js) and the explainers of the newest pages.
   The bubble follows the page it sits on, offers questions written for that page, says plainly that it is an AI
   assistant, and tells the truth when the assistant is switched off (this demo server has no key).
   Real server in demo mode, real browser. Run: node tests/ask/bubble_test.js */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), PORT = 3969, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akb-'));
  const srv = spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', SATELLITE: '0', DATA_DIR: dir, ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/'); if (r.ok) break; } catch (e) { /* not up yet */ } await wait(300); }
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    ok((await fetch(BASE + '/site/ask-bubble.js')).ok && (await fetch(BASE + '/site/ask-bubble.css')).ok, 'the bubble and its styles are served');
    ok((await fetch(BASE + '/site/ask-questions.js')).ok, 'the questions are served');
    {
      const probe = await b.newPage();
      await probe.goto(BASE + '#/health', { waitUntil: 'load' });
      await wait(2200);
      await probe.click('.kb-bubble');                                  // opening the bubble is what loads the questions
      await probe.waitForFunction(() => !!(window.SC && window.SC.ASK_Q), null, { timeout: 15000 });
      const every = await probe.evaluate(() => Object.keys(window.SC.ASK_Q).flatMap((k) => window.SC.ASK_Q[k].map((q) => q[0])));
      ok(every.length > 40, 'the questions cover many pages (' + every.length + ')');
      ok(every.every((q) => q.length > 10 && /\?$/.test(q.trim())), 'every suggested question is written as a question');
      ok(!every.some((q) => /\bwill (be|happen|it rain)\b|predict|forecast tomorrow/i.test(q)), 'no suggested question asks the assistant to say what will happen');
      ok(!every.some((q) => /\bbest\b|\bworst\b|which school is better/i.test(q)), 'and none asks it to rank a school or a city');
      await probe.close();
    }

    for (const [name, el, phone] of [['desktop', false, false], ['greek', true, false], ['phone', false, true]]) {
      const ctx = await b.newContext(phone ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 900 } });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));

      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + '#/health', { waitUntil: 'load' });
      await wait(2500);
      ok(await p.locator('.kb-bubble').count() === 1, name + ': the bubble is there on a page');
      ok(await p.evaluate(() => document.querySelector('.kb-panel').hidden), name + ': it starts closed');
      await p.click('.kb-bubble'); await wait(900);
      ok(!(await p.evaluate(() => document.querySelector('.kb-panel').hidden)), name + ': pressing it opens the panel');
      const head = await p.locator('.kb-ht').innerText();
      ok(new RegExp(el ? 'Κλεάνθη' : 'Kleanthis').test(head), name + ': the panel carries the assistant’s name');
      ok(/DATA HEALTH|ΥΓΕΙΑ/i.test(head), name + ': and says which page it is about (' + head.replace(/\n/g, ' · ') + ')');
      const qs = await p.locator('.kb-q').allTextContents();
      ok(qs.length >= 3, name + ': it offers questions for this page (' + qs.length + ')');
      ok(qs.every((q) => q.trim().length > 10), name + ': every question is a real question');
      const foot = await p.locator('.kb-f').innerText();
      ok(/(AI assistant|Βοηθός AI)/.test(foot) && /(not a person|όχι άνθρωπος)/.test(foot), name + ': the panel says it is not a person');
      ok(await p.locator('.kb-f a[href="#/ask"]').count() === 1, name + ': and offers the full chat');

      // the questions follow the page
      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + '#/stack', { waitUntil: 'load' });
      await wait(3000);
      if (await p.evaluate(() => document.querySelector('.kb-panel').hidden)) { await p.click('.kb-bubble'); await wait(900); }
      ok(!(await p.evaluate(() => document.querySelector('.kb-panel').hidden)), name + ': the panel stays with you from page to page');
      const qs2 = await p.locator('.kb-q').allTextContents();
      ok(qs2.length >= 3 && qs2.join('|') !== qs.join('|'), name + ': another page offers its own questions');
      ok(await p.evaluate(() => /stack|ΣΤΟΙΒΑ/i.test(document.querySelector('.kb-ht small').textContent)), name + ': and the panel names that page');

      // asking, with the assistant switched off on this server: the answer says so rather than inventing one
      await p.click('.kb-q'); await wait(2500);
      const feed = await p.locator('.kb-feed').innerText();
      ok(feed.length > 20, name + ': the question and an answer area appear');
      ok(/(not switched on|δεν έχει ενεργοποιηθεί|could not|δεν μπόρεσε)/i.test(feed), name + ': with the assistant off it says so, and invents nothing');

      // typing, and closing with the keyboard
      await p.fill('.kb-in input', el ? 'Τι μετρά αυτή η σελίδα;' : 'What does this page measure?');
      await p.press('.kb-in input', 'Enter'); await wait(1800);
      ok((await p.locator('.kb-you').count()) >= 2, name + ': a typed question is shown as asked');
      await p.keyboard.press('Escape'); await wait(400);
      ok(await p.evaluate(() => document.querySelector('.kb-panel').hidden), name + ': Escape closes the panel');

      // not on the assistant's own page
      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + '#/ask', { waitUntil: 'load' });
      await wait(2500);
      ok(await p.evaluate(() => { const r = document.querySelector('.kb-root'); return !r || r.hidden; }), name + ': the bubble steps aside on the full chat page');

      // the newest pages explain themselves, in both languages
      for (const [id, wordEn, wordEl] of [['stack', 'sheet', 'φύλλο'], ['health', 'check', 'έλεγχ'], ['fieldwork', 'publish', 'δημοσιευμέν'], ['city', 'building', 'κτίρι']]) {
        await p.goto(BASE + '/' + (el ? '?lang=el' : '') + '#/' + id, { waitUntil: 'load' });
        await wait(2600);
        ok(await p.evaluate(() => !!document.querySelector('[class^="ex-"], [class*=" ex-"]')), name + ': ' + id + ' carries the explainer strip');
        const got = await p.evaluate((x) => {
          const e = window.SC && window.SC.EXPLAIN && window.SC.EXPLAIN[x];
          if (!e) return null;
          const all = [e.lead].concat(e.steps.map((st) => st.s)).concat(e.steps.map((st) => st.h));
          return { en: all.map((q) => q[0]).join(' '), el: all.map((q) => q[1]).join(' '), steps: e.steps.length };
        }, id);
        ok(got && got.steps >= 3, name + ': ' + id + ' has an explainer with steps (' + (got ? got.steps : 0) + ')');
        ok(got && new RegExp(wordEn, 'i').test(got.en) && new RegExp(wordEl, 'i').test(got.el), name + ': ' + id + ' explains itself in both languages');
      }

      if (phone) {
        await p.goto(BASE + '#/health', { waitUntil: 'load' }); await wait(2200);
        if (await p.evaluate(() => document.querySelector('.kb-panel').hidden)) { await p.click('.kb-bubble'); await wait(800); }
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(over <= 1, 'phone: the open panel does not push the page sideways (' + over + ')');
        ok(await p.evaluate(() => { const r = document.querySelector('.kb-panel').getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; }), 'phone: the panel fits the screen');
      }

      ok(errs.length === 0, name + ': nothing threw (' + errs.slice(0, 2).join(' | ') + ')');
      await ctx.close();
    }
  } catch (e) {
    fail++; console.log('FAIL: the run stopped: ' + (e && e.stack));
  } finally {
    await b.close(); srv.kill();
  }
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
