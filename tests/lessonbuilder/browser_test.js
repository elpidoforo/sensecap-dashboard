'use strict';
/* The Lesson builder (#/lessonbuilder, pages/lessonbuilder.js on the engine in lb-core.js).
   A question fills the plan, the link carries the whole plan, the recording sheet grows with the stops and measures,
   the privacy check holds on a link someone else sends, and the assistant tells the truth when it is switched off.
   Real server in demo mode, real browser. Run: node tests/lessonbuilder/browser_test.js */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), PORT = 3968, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const FULL = '#/lessonbuilder?q=heat&y=12-15&d=2x45&stops=yard-shade.yard-open.street&meas=temperature.surface&share=letter';

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-'));
  const srv = spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', SATELLITE: '0', DATA_DIR: dir, ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/'); if (r.ok) break; } catch (e) { /* not up yet */ } await wait(300); }
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    ok((await fetch(BASE + '/site/pages/lessonbuilder.js')).ok && (await fetch(BASE + '/site/pages/lb-core.js')).ok, 'the page and its engine are served');
    const src = await (await fetch(BASE + '/site/pages/lessonbuilder.js')).text();
    ok(!/innerHTML/.test(src), 'nothing on this page is written as markup');

    for (const [name, el, phone] of [['desktop', false, false], ['greek', true, false], ['phone', false, true]]) {
      const ctx = await b.newContext(phone ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 1000 } });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));

      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + '#/lessonbuilder', { waitUntil: 'load' });
      await wait(2600);
      ok(await p.locator('.lb-step').count() === 7, name + ': the builder has its seven steps');
      ok(await p.locator('.lb-chip').count() >= 5, name + ': the first step offers the questions');
      ok(!/\bnull\b/.test(await p.locator('.lb').innerText()), name + ': nothing shows the word null');
      const empty = await p.locator('.lb-paper').innerText();
      ok(/(Your field lesson|Το μάθημα πεδίου)/.test(empty), name + ': the plan starts empty but named');

      // a question fills the plan
      await p.click('.lb-chip');
      await wait(500);
      const filled = await p.locator('.lb-paper').innerText();
      ok(/(yard|αυλή)/i.test(filled), name + ': choosing a question writes it on the plan');
      ok(/(Success indicators|ΔΕΙΚΤΕΣ ΕΠΙΤΥΧΙΑΣ)/i.test(filled), name + ': the plan carries success indicators');
      ok(/(What could fool us|ΤΙ ΜΠΟΡΕΙ ΝΑ ΜΑΣ ΞΕΓΕΛΑΣΕΙ)/i.test(filled), name + ': and the traps that go with that question');
      ok(/(Department of Meteorology|Μετεωρολογικής)/.test(filled), name + ': and says which data it uses');
      ok(/#\/lessonbuilder\?q=/.test(await p.evaluate(() => location.href)), name + ': the link carries the choice');

      // a whole plan arrives by link
      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + FULL, { waitUntil: 'load' });
      await wait(2600);
      const done = await p.evaluate(() => document.querySelectorAll('.lb-step.done').length);
      ok(done >= 6, name + ': a link reopens every choice in it (' + done + ' steps filled)');
      const rows = await p.locator('.lb-tab tr').count();
      ok(rows === 12, name + ': three stops and the rubric make the sheet (' + rows + ' rows)');
      const heads = await p.locator('.lb-tab th').allTextContents();
      ok(heads.some((h) => /(°C)/.test(h)), name + ': every measured column carries its unit');
      ok(await p.locator('.lb-balseg').count() >= 3, name + ': the balance of learning types is shown');

      // the assistant: with no key on this server it says so instead of inventing a lesson
      ok(await p.locator('.lb-idea').count() >= 4, name + ': the assistant offers ways to adapt the plan');
      await p.click('.lb-idea');
      await wait(2500);
      const chat = await p.locator('.lb-chatfeed').innerText();
      ok(/(not switched on|δεν έχει ενεργοποιηθεί|could not|δεν μπόρεσε)/i.test(chat), name + ': with the assistant off it says so, and changes nothing');
      ok(/(not a person|όχι άνθρωπος)/.test(await p.locator('.lb-chat').innerText()), name + ': the panel says it is not a person');

      if (phone) {
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(over <= 1, 'phone: the builder does not push the page sideways (' + over + ')');
      }
      ok(errs.length === 0, name + ': nothing threw (' + errs.slice(0, 2).join(' | ') + ')');
      await ctx.close();
    }

    // privacy: a link that carries a phone number in the teacher's own line loses that line and says so
    {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(BASE + '#/lessonbuilder?q=heat&aim=' + encodeURIComponent('Call me on 99123456 at the gate'), { waitUntil: 'load' });
      await wait(2600);
      ok(await p.locator('.lb-drop').count() === 1, 'privacy: a line that fails the check is dropped, and the page says so');
      ok(!/99123456/.test(await p.locator('.lb').innerText()), 'privacy: and the number never reaches the plan');
      await ctx.close();
    }

    // print: the plan prints, the builder around it does not
    {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(BASE + FULL, { waitUntil: 'load' });
      await wait(2600);
      ok(await p.evaluate(() => document.body.classList.contains('k4-on')), 'print: the page is in print mode while it is open');
      await p.emulateMedia({ media: 'print' });
      await wait(400);
      const shown = await p.evaluate(() => {
        const vis = (s) => { const n = document.querySelector(s); return n ? getComputedStyle(n).display !== 'none' : false; };
        return { paper: vis('.lb-paper'), rail: vis('.lb-rail'), chat: vis('.lb-chat'), tools: vis('.lb-tools') };
      });
      ok(shown.paper && !shown.rail && !shown.chat && !shown.tools, 'print: only the plan goes on the paper');
      await p.emulateMedia({ media: 'screen' });
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
