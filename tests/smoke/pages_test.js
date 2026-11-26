'use strict';
/* Smoke test: open EVERY page of the menu in a real browser and make sure it draws.
   It exists because a home tile placed one bracket too far once took the home page down, and no test opened the home page.
   For each page that the menu lists as ready, in English and in Greek:
     - no script error is thrown while it opens;
     - the page shows its own heading, not "Something went wrong" and not an empty view.
   It does not judge what a page shows (the feeds do not answer on a test machine); it only catches a page that fails to open.
   Real server in demo mode, real browser, no network needed. Run: node tests/smoke/pages_test.js   (port 3971, about a minute)
   SMOKE_ONLY=home,drought limits the run to some pages. */
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), PORT = 3971, BASE = 'http://127.0.0.1:' + PORT;
const ONLY = (process.env.SMOKE_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1' };
  delete env.ANTHROPIC_API_KEY; delete env.OPENROUTER_API_KEY;   // no AI call can leave this machine
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  let browser = null;
  const stop = async () => { try { if (browser) await browser.close(); } catch (e) { /* closing */ } server.kill(); };
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(BASE + '/'); up = r.ok; } catch (e) { await wait(250); } }
    ok(up, 'the server starts'); if (!up) throw new Error('server did not start');
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    let errors = []; page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
    await page.goto(BASE + '/#/home'); await page.waitForFunction(() => window.SC && typeof SC.sections === 'function' && document.querySelector('#view h1'), null, { timeout: 15000 });
    // the pages the menu itself lists as ready
    let ids = await page.evaluate(() => { const out = []; SC.sections().forEach((s) => (s.items || []).forEach((it) => { const id = typeof it === 'string' ? it : Array.isArray(it) ? it[0] : it && it.id; if (id && SC.isReady(id) && out.indexOf(id) < 0) out.push(id); })); return out; });
    ok(ids.length >= 40, 'the menu lists its pages (' + ids.length + ')');
    ['about', 'home'].forEach((id) => { if (ids.indexOf(id) < 0) ids.unshift(id); });   // the two pages above the four parts of the menu
    if (ONLY.length) ids = ids.filter((id) => ONLY.indexOf(id) >= 0);
    const broken = [];
    for (const lang of ['en', 'el']) {
      await page.goto(BASE + '/#/home'); await page.waitForSelector('#view h1', { timeout: 15000 });
      await page.evaluate((l) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === l.toUpperCase()); if (b) b.click(); }, lang); await wait(400);
      for (const id of ids) {
        errors = [];
        await page.evaluate((h) => { location.hash = '#/' + h; }, id);
        let state = 'empty';
        for (let i = 0; i < 40; i++) { await wait(150); state = await page.evaluate(() => { const h = document.querySelector('#view h1'); if (!h || !h.textContent.trim()) return 'empty'; return /Something went wrong|Κάτι πήγε στραβά/.test(h.textContent) ? 'wrong: ' + ((document.querySelector('#view .err, #view [class*=err]') || {}).textContent || '').slice(0, 120) : 'ok'; }); if (state !== 'empty' && i >= 5) break; }
        await wait(350);   // late errors of the first draw
        const good = state === 'ok' && errors.length === 0;
        ok(good, id + ' (' + lang + ') opens' + (good ? '' : ': ' + state + (errors.length ? ' | script error: ' + errors[0].slice(0, 160) : '')));
        if (!good) broken.push(id + ' (' + lang + ')');
      }
    }
    if (broken.length) console.log('pages that did not open: ' + broken.join(', '));
  } catch (e) { fail++; console.log('FAIL: the run stopped: ' + (e && e.message)); }
  await stop();
  console.log('pages: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
