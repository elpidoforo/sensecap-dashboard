'use strict';
/* The data health page (#/health) and GET /api/health: the report, the drawing, the written version, Greek, a phone,
   and that the drawing holds still when the browser asks for reduced motion. Real server in demo mode.
   Run: node tests/health/browser_test.js */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), PORT = 3978, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-'));
  const srv = spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dir, ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/api/health'); if (r.ok) break; } catch (e) { /* not up yet */ } await wait(300); }
  const b = await chromium.launch();
  try {
    // the report itself
    const r = await fetch(BASE + '/api/health'), d = await r.json();
    ok(r.ok && r.headers.get('cache-control') === 'no-store', 'the report is served fresh, never cached');
    ok(d.sources.length > 5 && d.stages.sources === d.sources.length, 'every source that is switched on is in the report');
    ok(d.totals.pass + d.totals.warn + d.totals.fail === d.stages.checks && d.stages.checks > 50, 'the checks add up to the number shown');
    ok(d.sources.every((s) => s.gates.every((g) => g.checked >= g.failed && ['pass', 'warn', 'fail'].includes(g.status))), 'no check reports more failures than it looked at');
    ok(d.sources.every((s) => s.sum.status === (s.gates.some((g) => g.status === 'fail') ? 'fail' : s.gates.some((g) => g.status === 'warn') ? 'warn' : 'pass')), "a source's own verdict is the worst of its checks");
    ok(d.flow.passed + d.flow.left === d.flow.readings, 'the readings that passed and those left out add up to the readings taken');
    ok(d.flow.left === d.flow.out.reduce((a, o) => a + o.count, 0), 'the readings left out match the reasons the page lists');
    ok(d.sources.every((s) => s.gates.every((g) => g.n[0] && g.n[1])) && d.note[0] && d.note[1], 'the whole report is bilingual');
    ok(/only report/.test(d.note[0]), 'the report says the checks only report');
    ok(d.issues.every((i, k, a) => k === 0 || a[k - 1].gate.status === 'fail' || i.gate.status !== 'fail'), 'what to look at first puts failures before warnings');
    ok(JSON.stringify(d).indexOf('ANTHROPIC') === -1 && !/eui|password|key"/i.test(JSON.stringify(d).slice(0, 4000)), 'the report carries no sensor identifiers or secrets');

    for (const [name, opts, el] of [['desktop', { viewport: { width: 1366, height: 900 } }, false], ['phone greek', { ...devices['iPhone 13'] }, true]]) {
      const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = [];
      p.on('pageerror', (e) => errs.push(String(e)));
      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + '#/health');
      await p.waitForFunction(() => document.body.dataset.health, null, { timeout: 25000 });
      ok(await p.locator('.hl-st').count() === 4, name + ': the four stages are shown');
      ok(await p.locator('.hl-chip.pass').first().isVisible() && /\d/.test(await p.locator('.hl-tot').innerText()), name + ': the passed, warning and failed counts are shown');
      ok(await p.locator('.hl-src').count() === d.sources.length, name + ': every source has a card');
      const aria = await p.locator('.hl-c').getAttribute('aria-label');
      ok(/\d/.test(aria) && aria.length > 60, name + ': the drawing describes itself in words for a screen reader (' + aria.slice(0, 60) + '…)');
      // open one source and read its checks
      await p.locator('.hl-hd').first().click();
      const open = p.locator('.hl-src.open').first();
      ok(await open.count() === 1 && await open.locator('tbody tr').count() >= 3, name + ': opening a source shows its checks');
      const text = await open.innerText();
      ok(/LOOKED AT|ΕΛΕΓΧΘΗΚΑΝ/i.test(text) && /only report|μόνο αναφέρουν/.test(text), name + ': the open card says what was looked at and that checks only report');
      await p.locator('.hl-hd').first().click();
      ok(await p.locator('.hl-src.open').count() === 0, name + ': pressing again closes it');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': the page does not scroll sideways');
      ok(errs.length === 0, name + ': no script errors (' + errs.slice(0, 2).join(' | ') + ')');
      if (el) {
        const t = await p.locator('.hl').innerText();
        ok(/Υγεία δεδομένων/.test(t) && /Δες πρώτα αυτά/.test(t) && /Για την τάξη/.test(t), name + ': the page is in Greek');
      } else {
        ok(/Data health/.test(await p.locator('.hl').innerText()), name + ': the page is in English');
        ok(await p.evaluate(() => [...document.querySelectorAll('.nm-side-a')].some((a) => a.getAttribute('href') === '#/health')), name + ': the page is in the menu');
      }
      await ctx.close();
    }
    // the drawing holds still when the browser asks for reduced motion
    for (const [motion, same] of [['reduce', true], ['no-preference', false]]) {
      const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' }), p = await ctx.newPage();
      await p.goto(BASE + '/#/health'); await p.waitForFunction(() => document.body.dataset.health, null, { timeout: 25000 }); await p.waitForTimeout(900);
      const shot = () => p.evaluate(() => document.querySelector('.hl-c').toDataURL().length + ':' + document.querySelector('.hl-c').toDataURL().slice(-200));
      const a = await shot(); await p.waitForTimeout(900); const bb = await shot();
      ok((a === bb) === same, 'with reduced motion ' + motion + ' the drawing ' + (same ? 'holds still' : 'moves'));
      await ctx.close();
    }
  } catch (e) { fail++; console.log('FAIL: the run stopped: ' + String(e).slice(0, 500)); }
  await b.close(); srv.kill();
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
