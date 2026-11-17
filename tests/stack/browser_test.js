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

      // the sheets that are fed by real readings, and the ones that say they are not
      for (let i = 0; i < 60; i++) { if (await frame.evaluate(() => /min ago|just now|πριν|μόλις/.test(document.querySelector('.rail').innerText))) break; await wait(300); }
      const vals = await frame.locator('.lay .val').allTextContents();
      const measured = vals.filter((v) => /ago|now|πριν|μόλις/.test(v));
      const drawn = vals.filter((v) => /drawn|σχεδιασμένο/.test(v));
      ok(measured.length >= 3, name + ': the measured sheets show a real reading with its age (' + measured.length + ')');
      ok(drawn.length >= 3, name + ': the sheets with no feed say they are drawn (' + drawn.length + ')');
      ok(measured.length + drawn.length === 12, name + ': every layer says which of the two it is');
      ok(measured.every((v) => /[0-9]/.test(v)), name + ': a measured sheet shows a number');
      const rail = await frame.evaluate(() => document.querySelector('.rail').innerText);
      ok(/sensecap|cydom|openmeteo|metar/.test(rail), name + ': the rail names the source each reading came from');
      const probe = await frame.evaluate(() => document.querySelector('.probe').innerText);
      ok(/[0-9]/.test(probe) && /(ago|now|πριν|μόλις)/.test(probe), name + ': the probe shows the newest readings with their age');

      // two sources that disagree are drawn as a pair, and every pin carries the age of its reading
      let twins = 0;
      for (let i = 0; i < 40; i++) { twins = await frame.evaluate(() => window.__twins || 0); if (twins) break; await wait(300); }
      ok(twins > 0, name + ': a disagreement between two sources is drawn where it happens (' + twins + ')');
      const halos = await frame.evaluate(() => window.__halos || 0);
      ok(halos > 0, name + ': the school pins carry the age of their newest reading (' + halos + ')');
      // the sky: a bearing for the wind, and the model's rain and cloud, each saying which it is
      const railText = await frame.evaluate(() => document.querySelector('.rail').innerText);
      ok(/(model|μοντέλο)/.test(railText), name + ': a sheet fed by the model says so rather than calling itself measured');
      const windCard = await frame.evaluate(() => [...document.querySelectorAll('.lay')].find((x) => /Wind at 10|Άνεμος/.test(x.innerText)).title);
      ok(/\d+°/.test(windCard) && /(airports|measured|μοντέλο|model|αεροδρόμια)/.test(windCard), name + ': the wind sheet names the bearing and where it came from (' + windCard + ')');
      const probe2 = await frame.evaluate(() => document.querySelector('.probe').innerText);
      ok(/(from|από)\s*\d+°/.test(probe2), name + ': the probe says which way the wind is blowing, beside how hard');
      const rainCard = await frame.evaluate(() => [...document.querySelectorAll('.lay')].find((x) => /Rain this hour|Βροχή/.test(x.innerText)).innerText);
      ok(/(MM|mm)/.test(rainCard) && /(model|μοντέλο)/.test(rainCard), name + ': the rain sheet shows millimetres from the model (' + rainCard.replace(/\n/g, ' ') + ')');
      const cloudCard = await frame.evaluate(() => [...document.querySelectorAll('.lay')].find((x) => /Clouds|Σύννεφα/.test(x.innerText)).innerText);
      ok(/%/.test(cloudCard) && /(model|μοντέλο)/.test(cloudCard), name + ': the cloud sheet shows the cover the model reports');

      // the ages keep running while the page is open, even when no new reading arrives
      const fresh = await frame.evaluate(() => document.querySelector('.probe').innerText);
      const w0 = await frame.evaluate(() => window.__haloWidth());
      await frame.evaluate(() => window.__ageForward(200));
      await wait(400);
      const later = await frame.evaluate(() => document.querySelector('.probe').innerText);
      const w1 = await frame.evaluate(() => window.__haloWidth());
      ok(fresh !== later && /(h ago|ώ)/.test(later), name + ': a reading grows older while nobody fetches a new one');
      ok(w1 > w0, name + ': and the ring around the school widens with it (' + w0.toFixed(2) + ' to ' + w1.toFixed(2) + ')');

      // a hidden sheet takes its disagreements with it
      await frame.evaluate(() => document.querySelectorAll('.lay').forEach((x) => { if (x.getAttribute('aria-pressed') === 'true') x.click(); }));
      await wait(600);
      const after = await frame.evaluate(() => window.__twins || 0);
      ok(after === 0, name + ': hiding every sheet takes its disagreements with it (' + twins + ' to ' + after + ')');
      await frame.evaluate(() => document.getElementById('all').click());
      await wait(600);

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
        ok(!/LIVE READINGS · DRAWN RELIEF/.test(text), 'greek: the badge is translated too');
        ok(/σχεδιασμένο/.test(text), 'greek: a sheet with no feed says so in Greek');
        const page = await p.evaluate(() => document.body.innerText);
        ok(/Η στοίβα δεδομένων σε 3D/.test(page), 'greek: the page around the frame is Greek as well');
        ok(/σχεδιασμένο/.test(page), 'greek: and it says which sheets are only drawn');
      }

      if (!el && !phone) {
        const page = await p.evaluate(() => document.body.innerText);
        ok(/newest reading Athena holds/.test(page) && /drawn/.test(page), 'the page says which sheets are measured and which are drawn, before you look at them');
        ok(/vehicle|person/.test(page), 'and that no vehicle and no person is drawn');
        const text = await frame.evaluate(() => document.body.innerText);
        ok(/LIVE READINGS · DRAWN RELIEF/.test(text), 'the frame says which parts are measured and which are drawn');
        ok(/EACH LAYER SHOWS ITS SOURCE/.test(text), 'and tells the reader where to look for that');
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
