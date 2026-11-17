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
      ok(await p.locator('.lb-card').count() >= 6, name + ': the builder opens on the questions, not on a form');
      ok(await p.locator('.lb-paper').count() === 0, name + ': and shows no plan until a question is chosen');
      ok(!/\bnull\b/.test(await p.locator('.lb').innerText()), name + ': nothing shows the word null');
      const card = await p.locator('.lb-card').first().innerText();
      ok(card.split('\n').length >= 3, name + ': a card says what the question is about');

      // a question fills the plan, with the stops and measures it was written for
      await p.click('.lb-card');
      await wait(900);
      ok(await p.locator('.lb-edit').count() >= 5, name + ': the plan carries phrases you can change');
      ok(await p.locator('.lb-seg').count() >= 3, name + ': the ribbon shows how the time is spent');
      const pct = parseInt(await p.locator('.lb-pct em').innerText(), 10);
      ok(pct >= 80, name + ': a chosen question arrives nearly complete (' + pct + '%)');
      const filled = await p.locator('.lb-paper').innerText();
      ok(/(yard|αυλή)/i.test(filled), name + ': choosing a question writes it on the plan');
      ok(/(Success indicators|ΔΕΙΚΤΕΣ ΕΠΙΤΥΧΙΑΣ)/i.test(filled), name + ': the plan carries success indicators');
      ok(/(What could fool us|ΤΙ ΜΠΟΡΕΙ ΝΑ ΜΑΣ ΞΕΓΕΛΑΣΕΙ)/i.test(filled), name + ': and the traps that go with that question');
      ok(/(Department of Meteorology|Μετεωρολογικής)/.test(filled), name + ': and says which data it uses');
      ok(/#\/lessonbuilder\?q=/.test(await p.evaluate(() => location.href)), name + ': the link carries the choice');

      // pressing a phrase opens its choices on the phrase itself
      await p.locator('.lb-edit').nth(1).click();
      await wait(600);
      ok(await p.locator('.lb-pop').count() === 1, name + ': a phrase opens its own choices');
      ok(await p.locator('.lb-opt').count() >= 3, name + ': the choices are listed');
      const before = await p.locator('.lb-paper').innerText();
      await p.locator('.lb-opt').nth(2).click();
      await wait(600);
      ok((await p.locator('.lb-paper').innerText()) !== before, name + ': choosing one rewrites the plan at once');

      // a whole plan arrives by link
      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + FULL, { waitUntil: 'load' });
      await wait(2600);
      const done = await p.evaluate(() => document.querySelectorAll('.lb-o.done').length);
      ok(done >= 6, name + ': a link reopens every choice in it (' + done + ' sections filled)');
      const rows = await p.locator('.lb-tab tr').count();
      ok(rows === 12, name + ': three stops and the rubric make the sheet (' + rows + ' rows)');
      const heads = await p.locator('.lb-tab th').allTextContents();
      ok(heads.some((h) => /(°C)/.test(h)), name + ': every measured column carries its unit');
      // the assistant: with no key on this server it says so instead of inventing a lesson
      ok(await p.locator('.lb-sug').count() >= 4, name + ': the assistant offers ways to adapt the plan');
      await p.click('.lb-sug');
      await wait(2500);
      const chat = await p.locator('.lb-feed').innerText();
      ok(/(not switched on|δεν έχει ενεργοποιηθεί|could not|δεν μπόρεσε)/i.test(chat), name + ': with the assistant off it says so, and changes nothing');
      ok(/(NOT A PERSON|ΟΧΙ ΑΝΘΡΩΠΟΣ)/i.test(await p.locator('.lb-side').innerText()), name + ': the panel says it is not a person');

      if (phone) {
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(over <= 1, 'phone: the builder does not push the page sideways (' + over + ')');
      }
      ok(errs.length === 0, name + ': nothing threw (' + errs.slice(0, 2).join(' | ') + ')');
      await ctx.close();
    }

    // the assistant input goes through the same privacy check as the plan, and nothing leaves the page
    {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
      const p = await ctx.newPage();
      const sent = [];
      p.on('request', (r) => { if (r.method() === 'POST') sent.push(r.postData() || ''); });
      await p.goto(BASE + FULL, { waitUntil: 'load' });
      await wait(2600);
      await p.fill('.lb-askin', 'Maria in my class cannot read the sheet, ring me on 99123456');
      await p.click('.lb-askgo');
      await wait(1200);
      ok(sent.length === 0, 'assistant: a question with a name and a number in it is never sent (' + sent.length + ' requests)');
      ok(/(safe|ασφαλ)/i.test(await p.locator('.lb-feed').innerText()), 'assistant: and the teacher is told why');
      // the same question without the name and the number does go
      await p.fill('.lb-askin', 'My class is younger than this plan assumes');
      await p.click('.lb-askgo');
      await wait(2200);
      ok(sent.length === 1, 'assistant: a question that passes the check is sent');
      ok(!/99123456|Maria/.test(sent.join(' ')), 'assistant: nothing of the blocked line reached the network');
      await ctx.close();
    }

    // leaving the page takes the popover listener with it
    {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
      const p = await ctx.newPage();
      await p.goto(BASE + FULL, { waitUntil: 'load' });
      await wait(2600);
      await p.locator('.lb-edit').nth(1).click();
      await wait(500);
      await p.locator('.lb-opt').nth(1).click();          // a pick closes the popover
      await wait(500);
      ok(await p.locator('.lb-pop').count() === 0, 'a one-choice pick closes the popover');
      await p.evaluate(() => { location.hash = '#/methods'; });
      await wait(1800);
      ok(await p.locator('.lb-pop').count() === 0, 'leaving the builder leaves no popover behind');
      await ctx.close();
    }

    // a many-choice popover keeps its ticks in step with the plan
    {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
      const p = await ctx.newPage();
      await p.goto(BASE + FULL, { waitUntil: 'load' });
      await wait(2600);
      const stops = p.locator('.lb-edit').filter({ hasText: /stop|σημεί/i }).first();
      await stops.click();
      await wait(500);
      const before = await p.locator('.lb-opt.on').count();
      await p.locator('.lb-opt:not(.on)').first().click();
      await wait(500);
      ok(await p.locator('.lb-pop').count() === 1, 'a many-choice popover stays open while you pick');
      ok(await p.locator('.lb-opt.on').count() === before + 1, 'and the tick appears on what you just added');
      await ctx.close();
    }

    // the ribbon and the printed stage times come from one clock
    {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
      const p = await ctx.newPage();
      for (const d of ['1x45', '2x45']) {
        await p.goto(BASE + '#/lessonbuilder?q=heat&y=12-15&d=' + d + '&stops=yard-shade.yard-open&meas=temperature', { waitUntil: 'load' });
        await wait(2400);
        const head = await p.locator('.lb-timehead').innerText();
        const total = parseInt((head.match(/(\d+)\s*MIN/i) || [])[1], 10);
        const segs = await p.locator('.lb-seg small').allTextContents();
        const sum = segs.reduce((a, s) => a + parseInt(s, 10), 0);
        ok(sum === total, d + ': the parts of the ribbon add up to the whole (' + sum + ' of ' + total + ')');
        const last = (await p.locator('.lb-stage b').allTextContents()).pop();
        ok(new RegExp('–' + total + '$').test(last), d + ': the last stage ends when the lesson does (' + last + ')');
      }
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
        return { paper: vis('.lb-paper'), out: vis('.lb-out'), side: vis('.lb-side'), top: vis('.lb-top'), time: vis('.lb-time') };
      });
      ok(shown.paper && !shown.out && !shown.side && !shown.top && !shown.time, 'print: only the plan goes on the paper');
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
