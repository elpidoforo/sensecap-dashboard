'use strict';
/* The three sections (menu and home page) and the workshop (#/workshop). Starts the real server in demo mode with a seeded saved day.
   Run: node tests/toolkit/workshop_test.js */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), PORT = 3977, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
  // a saved day of 24 hours, every 10 minutes: air temperature and wind for the four cities, from two layers
  const now = Math.floor(Date.now() / 60000) * 60000, series = {};
  const off = { larnaka: 0.6, lefkosia: -0.4, limassol: 0.9, paphos: 1.2 };
  for (const c of Object.keys(off)) for (const [src, v] of [['cydom-stations', 'temperature'], ['openmeteo-weather', 'wind_speed']]) {
    const pts = []; for (let i = 143; i >= 0; i--) { const t = now - i * 600000, hr = ((t / 3600000) + 2) % 24; pts.push([t, Math.round((v === 'temperature' ? 18 + off[c] + 5 * Math.cos(((hr - 14.5) / 24) * 2 * Math.PI) : 3 + 2 * Math.sin(((hr - 11) / 24) * 2 * Math.PI)) * 10) / 10]); }
    series[c + '|' + src + '|' + v] = pts;
  }
  fs.writeFileSync(path.join(dir, 'layers-pulse.json'), JSON.stringify({ at: now, series }));
  const srv = spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dir, ANTHROPIC_API_KEY: '', LAYERS_PULSE_SECONDS: '600' }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + '/layers/api/replay'); if (r.ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  const b = await chromium.launch();
  const noGL = () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; };
  try {
    for (const [name, opts, el] of [['desktop', { viewport: { width: 1366, height: 900 } }, false], ['phone greek', { ...devices['iPhone 13'] }, true]]) {
      const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = []; p.on('pageerror', (e) => errs.push(String(e))); await p.addInitScript(noGL);
      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + '#/workshop'); await p.waitForSelector('.ws-panel', { timeout: 20000 });
      const ks = () => p.$$eval('.ws-box', (e) => e.map((x) => x.dataset.k).join(','));
      ok(await ks() === 'data,compare,line', name + ': the workshop opens with a small starting tool');
      ok(await p.locator('.ws-pb').count() === 9 && await p.locator('.ws-pg').count() === 3, name + ': the palette has the Analyze, Predict and View boxes');
      ok(await p.locator('.ws-panel').count() === 2 && await p.locator('.ws-panel .ws-chart polyline').count() >= 3, name + ': the preview draws a panel for each box, from real saved data');
      ok(/Met Office|Μετεωρολογ/i.test(await p.locator('.ws-src').innerText()) && /\d{1,2}:\d{2}/.test(await p.locator('.ws-src').innerText()), name + ': the tool names its layer and its period');
      ok((await p.locator('.ws-words').innerText()).length > 60, name + ': the tool is said in one sentence');
      await p.locator('.ws-pb[data-k="predict"]').click(); await p.locator('.ws-pb[data-k="stats"]').click();
      ok(await ks() === 'data,compare,line,predict,stats', name + ': pressing a palette box adds it at the end');
      ok(/tested \d+ times|δοκιμάστηκε \d+ φορές/.test(await p.locator('.ws-panel.sec-predict').innerText()) && /not a weather forecast|Δεν είναι πρόγνωση καιρού/.test(await p.locator('.ws-panel.sec-predict').innerText()), name + ': a prediction is tested on the saved day and says what it is not');
      ok(/not a better city|δεν σημαίνει καλύτερη πόλη/.test(await p.locator('.ws-prev').innerText()), name + ': the averages say a higher number is not a better city');
      await p.locator('.ws-box[data-k="stats"] .ws-tools button').first().click();
      ok(await ks() === 'data,compare,line,stats,predict', name + ': a box can be moved earlier with its button');
      await p.locator('.ws-box[data-k="compare"] .ws-tools button').last().click();
      ok(await ks() === 'data,line,stats,predict', name + ': a box can be removed');
      await p.locator('.ws-box[data-k="predict"] select').first().selectOption('line');
      ok(/"same as now"|«ίδιο με τώρα»/.test(await p.locator('.ws-panel.sec-predict').innerText()), name + ': another rule is compared with "same as now"');
      await p.locator('.ws-box[data-k="data"] select').first().selectOption('sea'); await p.waitForTimeout(200);
      if (process.env.DBG) console.log(name, 'sea:', (await p.locator('.ws-prev').innerText()).slice(0, 200).replace(/\n/g, ' / '));
      ok(/No saved readings|Not enough saved readings|Δεν υπάρχουν αποθηκευμένες μετρήσεις|Δεν υπάρχουν ακόμη αρκετές/.test(await p.locator('.ws-prev').innerText()), name + ': a measure with no or too few saved readings says so');
      await p.locator('.ws-box[data-k="data"] select').first().selectOption('wind'); await p.waitForTimeout(200);
      ok(/m\/s|km\/h/.test(await p.locator('.ws-prev').innerText()), name + ': changing the measure changes the preview and its unit');
      for (let i = 0; i < 4; i++) await p.locator('.ws-pb[data-k="bars"]').click();
      ok((await ks()).split(',').length === 6, name + ': a tool holds at most six boxes');
      ok(await p.locator('.ws-btn.send').isDisabled() && /coming next|έρχεται/i.test(await p.locator('.ws-btn.send').innerText()), name + ': sending to a teacher is marked as coming, not faked');
      const url = p.url();
      ok(/#\/workshop\?r=/.test(url), name + ': the tool is kept in the address');
      await p.evaluate(() => localStorage.clear()); await p.goto('about:blank'); await p.goto(url); await p.waitForSelector('.ws-box');
      ok((await ks()).split(',').length === 6 && (await ks()).startsWith('data,line,stats,predict'), name + ': the link reopens the same tool');
      const bad = Buffer.from(JSON.stringify([{ k: 'data', m: 'evil', c: ['nowhere', 'paphos'], p: 'x' }, { k: 'script' }, { k: 'predict', rule: '<img>', ahead: 99 }, { k: 'data' }])).toString('base64');
      await p.goto('about:blank'); await p.goto(BASE + '/#/workshop?r=' + bad); await p.waitForSelector('.ws-box');
      ok(await ks() === 'data,predict' && await p.locator('.ws-box[data-k="data"] input:checked').count() === 1 && !/evil|script|<img/.test(await p.locator('.ws').innerText()), name + ': a recipe from the address keeps only known choices');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': the workshop does not scroll sideways');
      if (process.env.DBG) console.log(name, await p.evaluate(() => [...document.querySelectorAll('.ws *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12.5 && !e.closest('svg')).map((e) => e.tagName + '.' + e.className + ':' + getComputedStyle(e).fontSize).slice(0, 6).join(' | ')));
      ok(await p.evaluate(() => [...document.querySelectorAll('.ws *')].every((e) => !e.childNodes.length || [...e.childNodes].every((n) => n.nodeType !== 3 || !n.textContent.trim() || parseFloat(getComputedStyle(e).fontSize) >= 12.5 || e.closest('svg') || e.closest('.how-btn')))), name + ': the text is large enough to read');   // the ? of the shared help button is the shell's
      if (el) ok(/Εργαστήρι/.test(await p.locator('.ws').innerText()) && /ΑΝΑΛΥΣΗ/.test(await p.locator('.ws-pal').innerText()) && /Με λόγια/.test(await p.locator('.ws-prev').innerText()), name + ': the workshop is in Greek');
      if (!el) {
        await p.goto('about:blank'); await p.goto(BASE + '/#/workshop'); await p.waitForSelector('.ws-panel'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('.ws-panel');
        const a = await p.locator('.ws-pb[data-k="change"]').boundingBox(), d = await p.locator('.ws-drop').boundingBox();
        await p.mouse.move(a.x + 20, a.y + 10); await p.mouse.down(); await p.mouse.move(a.x + 60, a.y + 30, { steps: 5 }); await p.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(400);
        ok((await ks()).endsWith(',change'), name + ': a box dragged from the palette lands on the canvas (' + await ks() + ')');
        const math = await p.evaluate(() => { const M = SC.workshopMath, pts = [1, 1.1, 1.2, 1.1, 5, 5.1].map((v, i) => [i * 3600000, v]); return { j: M.jumps(pts).list.length, last: M.guess([1, 2, 3], 'last', 1), mean: M.guess([1, 2, 3], 'mean', 1), line: M.guess([1, 2, 3], 'line', 1), bt: M.backtest([1, 2, 3, 4, 5, 6].map((v, i) => [i, v]), 'line', 1), rt: JSON.stringify(M.unpack(M.pack([{ k: 'data', m: 'wind', c: ['paphos'], p: 'h6' }, { k: 'bars' }]))) }; });
        ok(math.j === 1 && math.last === 3 && math.mean === 2 && Math.abs(math.line - 4) < 1e-9 && math.bt.n === 3 && math.bt.mae < 1e-9 && Math.abs(math.bt.same - 1) < 1e-9 && math.rt === '[{"k":"data","m":"wind","c":["paphos"],"p":"h6"},{"k":"bars"}]', name + ': the sums are right on known numbers');
        // the three sections on the home page and in the menu
        await p.goto(BASE + '/#/home'); await p.waitForSelector('.hm3-t');
        ok(await p.locator('.hm3-sec').count() === 3 && await p.locator('.hm3-sec.sec-view .hm3-t').count() === 6 && await p.locator('.hm3-sec.sec-predict .hm3-t').count() >= 4, name + ': the home page shows View, Analyze and Predict with their tools');
        ok(await p.locator('.hm3-build a.hm3-btn').getAttribute('href') === '#/workshop', name + ': the home page leads to the workshop');
        ok(await p.evaluate(() => [...document.querySelectorAll('.nm-side-h')].map((e) => e.className.replace('nm-side-h', '').trim()).join(',')) === 'sec-view,sec-analyze,sec-predict,sec-build,sec-class', name + ': the menu has the same sections');
        ok(await p.evaluate(() => { const ids = [...document.querySelectorAll('.nm-side-a')].map((a) => a.getAttribute('href')); return new Set(ids).size === ids.length && ids.includes('#/workshop') && ids.includes('#/layers') && ids.includes('#/forecast'); }), name + ': every page is in the menu once');
      }
      ok(errs.length === 0, name + ': no script errors (' + errs.slice(0, 2).join(' | ') + ')');
      await ctx.close();
    }
  } catch (e) { fail++; console.log('FAIL: the run stopped: ' + String(e).slice(0, 400)); }
  await b.close(); srv.kill();
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
