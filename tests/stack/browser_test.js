'use strict';
/* The data stack in 3D (#/stack and /stack.html): the page is served under the import-map policy, the 3D view starts,
   every layer is listed with its source, the buttons hide and show layers, and the whole thing speaks Greek.
   Real server in demo mode, real browser.
   Run: node tests/stack/browser_test.js */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), PORT = 3979, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'];

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-'));
  const srv = spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', SATELLITE: '0', DATA_DIR: dir, ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/stack.html'); if (r.ok) break; } catch (e) { /* not up yet */ } await wait(300); }
  const b = await chromium.launch({ args: GL });
  try {
    // served, and under the policy the import map needs
    const r = await fetch(BASE + '/stack.html');
    const csp = r.headers.get('content-security-policy') || '';
    ok(r.ok, 'the 3D page is served');
    ok(/script-src 'self' 'sha256-/.test(csp), 'its scripts are its own, plus one hash for the import map');
    ok(!/unsafe-inline/.test(csp.split('style-src')[0]), 'no inline script is allowed');
    ok(/default-src 'self'/.test(csp) && !/https?:\/\//.test(csp), 'nothing may be loaded from another host');
    const html = await (await fetch(BASE + '/stack.html')).text();
    ok(/\/vendor\/three-r160\//.test(html) && !/cdn|unpkg|jsdelivr/i.test(html), 'three.js is served from this site, not from a CDN');
    ok((await fetch(BASE + '/stack-app.js')).ok && (await fetch(BASE + '/stack-guard.js')).ok, 'the module and its guard are served');

    for (const [name, el, phone] of [['desktop', false, false], ['greek', true, false], ['phone', false, true]]) {
      const ctx = await b.newContext(phone ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 860 } });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + '#/stack', { waitUntil: 'load', timeout: 60000 });
      let frame = null;
      for (let i = 0; i < 80 && !frame; i++) { frame = p.frames().find((f) => f.url().includes('stack.html')); if (!frame) await wait(250); }
      ok(!!frame, name + ': the 3D view is shown in its own frame');
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) { ready = await frame.evaluate(() => !!window.__embedReady).catch(() => false); if (!ready) await wait(250); }
      ok(ready, name + ': the 3D view started');
      ok(await frame.locator('.lay').count() === 12, name + ': every layer is listed');
      const srcs = await frame.locator('.lay small').allTextContents();
      ok(srcs.length === 12 && srcs.every((s) => s.trim().length > 3), name + ': every layer says where it comes from');
      ok(errs.length === 0, name + ': the page threw nothing (' + errs.join(' | ') + ')');

      if (!phone) {
        // a layer can be hidden and shown again
        const press = () => frame.evaluate(() => document.querySelector('.lay').click());
        const state = () => frame.evaluate(() => document.querySelector('.lay').getAttribute('aria-pressed'));
        ok(await state() === 'true', name + ': layers start switched on');
        await press(); await wait(300);
        ok(await state() === 'false', name + ': pressing a layer switches it off');
        await press(); await wait(300);
        ok(await state() === 'true', name + ': pressing it again switches it back on');
        // a band button keeps the island for reference
        await frame.evaluate(() => document.querySelector('[data-band="AIR"]').click()); await wait(400);   // the bar can sit off the short test viewport
        const on = await frame.evaluate(() => [...document.querySelectorAll('.lay')].filter((b) => b.getAttribute('aria-pressed') === 'true').length);
        ok(on > 0 && on < 12, name + ': a band shows some layers and hides the rest (' + on + ')');
        await frame.evaluate(() => document.getElementById('all').click()); await wait(400);
        ok(await frame.evaluate(() => [...document.querySelectorAll('.lay')].every((b) => b.getAttribute('aria-pressed') === 'true')), name + ': "all" brings every layer back');
      }

      if (el) {
        const text = await frame.evaluate(() => document.body.innerText);
        ok(/ΣΤΡΩΜΑΤΑ/.test(text) && /ΔΙΑΣΤΗΜΑ/.test(text) && /ΝΕΡΟ/.test(text), 'greek: the frame speaks Greek');
        ok(/Βυθός|Ανάγλυφο|Άνεμος/.test(text), 'greek: the layers are named in Greek');
        ok(!/MOCK-UP · DEMO VALUES/.test(text), 'greek: the mock-up badge is translated too');
        const page = await p.evaluate(() => document.body.innerText);
        ok(/Η στοίβα δεδομένων σε 3D/.test(page), 'greek: the page around the frame is Greek as well');
        ok(/Πρόχειρο σχέδιο/.test(page), 'greek: and it says the values are illustrative');
      }

      if (!el && !phone) {
        const page = await p.evaluate(() => document.body.innerText);
        ok(/illustrative/.test(page), 'the page says the values are illustrative before you look at them');
        ok(/vehicle|person/.test(page), 'and that no vehicle and no person is drawn');
        const text = await frame.evaluate(() => document.body.innerText);
        ok(/MOCK-UP/.test(text), 'the frame carries the mock-up badge itself');
        ok(/RELIEF AND RASTERS STAND IN/.test(text), 'and says the relief and rasters stand in for the real feeds');
      }

      if (phone) {
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(over <= 1, 'phone: nothing pushes the page sideways (' + over + ')');
        const fits = await frame.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(fits <= 1, 'phone: the 3D frame fits the screen too (' + fits + ')');
      }
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
