'use strict';
/* Data layers, the four live views in a real browser (Playwright, which is not a dependency of the site: run where it is installed).
   Run: node tests/layers-live/browser_test.js   (real server with demo data on port 3967) */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { chromium, devices } = require('playwright');
const PORT = 3967, BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
(async () => {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'lv-b-')), ANTHROPIC_API_KEY: '', LAYERS_PULSE_SECONDS: '5', LAYERS_PULSE_FIRST_MS: '300' };
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/layers/api/register'); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  await new Promise((r) => setTimeout(r, 16000));   // let the log take a few points, so lines and the replay have something to show
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });   // software 3D, for the Data core view
  const tab = (p, v) => p.click(`.ly-top .nm-pillbar button[data-v="${v}"]`);
  async function run(name, opts, lang) {
    const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/layers');
    await p.waitForSelector('.lv-map .lv-sch span', { timeout: 20000 });
    const el = lang === 'el';
    // live map
    ok(await p.locator('.ly-top .nm-pillbar button.on').getAttribute('data-v') === 'live', name + ': the live map is the first view');
    ok(await p.locator('.lv-sch').count() === 4, name + ': four schools on the map');
    ok(await p.locator('.lv-st').count() >= 1, name + ': official stations on the map');
    ok(await p.locator('.lv-map [class*=bus], .lv-map [class*=car], .lv-map [class*=veh]').count() === 0, name + ': no vehicle is drawn on the map');
    ok(/CO₂|°C/.test(await p.locator('.lv-sch').first().innerText()), name + ': a school shows a live value');
    await p.locator('.lv-map').scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
    const inked = await p.evaluate(() => { const c = document.querySelector('.lv-wind'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; });
    ok(inked > 200, name + ': the wind is drawn (' + inked + ' pixels)');
    ok((await p.locator('.lv-fw').innerText()).includes('km/h'), name + ': the wind chip has a speed');
    await p.locator('.lv-sch span').first().click();
    ok((await p.locator('.lv-info').innerText()).length > 10, name + ': pressing a school says its reading in words');
    ok(await p.locator('.lv-chip.lv-on').count() >= 5, name + ': a chip for every live layer');
    ok(!(await p.locator('.lv-play').isDisabled()), name + ': the replay can be played');
    await p.locator('.lv-play').click(); await p.waitForTimeout(500);
    ok((await p.locator('.lv-clock').innerText()).length > 4 || (await p.locator('.lv-play').innerText()).length > 0, name + ': the replay shows its clock');
    await p.waitForTimeout(2500);
    // pulse
    await tab(p, 'pulse'); await p.waitForSelector('.lv-row');
    ok(await p.locator('.lv-row.is-live').count() >= 5 && await p.locator('.lv-row.is-down').count() >= 1, name + ': live and quiet rows');
    ok(await p.locator('.lv-row.is-live .lv-spark path').count() >= 5, name + ': trend lines are drawn');
    ok(/\d/.test(await p.locator('.lv-next').innerText()), name + ': "next to speak" counts down');
    ok(await p.locator('.lv-ghost button').count() >= 5, name + ': layers not connected yet are listed');
    await p.locator('.lv-row.is-live').first().click(); await p.waitForSelector('.mod');
    ok(await p.locator('.mod').count() === 1, name + ': a row opens the layer');
    const cmpBtn = p.locator('.mod button', { hasText: el ? 'Σύγκριση' : 'Compare' });
    ok(await cmpBtn.count() === 1, name + ': the layer offers the compare chart');
    await cmpBtn.click();
    // compare
    await p.waitForSelector('.lv-chart', { timeout: 10000 });
    ok(await p.locator('.ly-top .nm-pillbar button.on').getAttribute('data-v') === 'compare', name + ': it jumps to the compare view');
    ok(await p.locator('.lv-chart .lv-line').count() >= 2, name + ': several lines on the chart');
    ok(await p.locator('.lv-k4').count() >= 3, name + ': every source is explained');
    ok((await p.locator('.lv-why').innerText()).length > 40, name + ': the finding is written under the chart');
    const before = await p.locator('.lv-hd h3').innerText();
    await p.locator('.lv-pick:not(.lv-vars) button').nth(2).click(); await p.waitForTimeout(900);
    ok(await p.locator('.lv-hd h3').innerText() !== before, name + ': another city can be picked');
    await p.locator('.lv-vars button').nth(1).click(); await p.waitForTimeout(900);
    ok(await p.locator('.lv-vars button.on').count() === 1 && await p.locator('.lv-chart').count() === 1, name + ': another measurement can be picked');
    // sky
    await tab(p, 'sky'); await p.waitForSelector('.lv-scene', { state: 'attached' }); await p.waitForTimeout(500);
    const skyBox = (await p.locator('.lv-sky-full').isVisible()) ? '.lv-sky-full' : '.lv-sky-narrow';
    ok(await p.locator(skyBox + ' .lv-tag2').count() === 8 && await p.locator(skyBox + ' .lv-tag2.is-on').count() >= 4, name + ': eight tags, the live ones lit');
    ok(await p.locator(skyBox + ' .lv-pkt').count() >= 4, name + ': a dot travels on the line of every live tag');
    const fits = await p.evaluate((sel) => [...document.querySelectorAll(sel + ' .lv-tag2')].every((e) => e.scrollHeight <= e.clientHeight + 2 && [...e.querySelectorAll('.lv-tg-h')].every((x) => x.scrollWidth <= x.clientWidth + 2)), skyBox);
    if (!fits) console.log(await p.evaluate((sel) => [...document.querySelectorAll(sel + ' .lv-tag2')].filter((e) => e.scrollHeight > e.clientHeight + 2 || e.querySelector('.lv-tg-h').scrollWidth > e.querySelector('.lv-tg-h').clientWidth + 2).map((e) => e.innerText.slice(0, 60) + ' ' + e.scrollHeight + '/' + e.clientHeight), skyBox));
    ok(fits, name + ': the text fits inside every tag');
    ok(await p.locator(skyBox + ' .lv-scene').count() === 1, name + ': one scene from space to sea');
    // all our data: the flow and the levels
    await tab(p, 'all'); await p.waitForSelector('.fl-src', { state: 'attached' }); await p.locator('.fl-stage').scrollIntoViewIfNeeded(); await p.waitForTimeout(2500);
    ok(await p.locator('.fl-src').count() >= 5, name + ': a dot for every connected layer');
    ok(await p.locator('.fl-riv').count() >= 2 && await p.locator('.fl-city').count() === 4, name + ': rivers and the four cities');
    const flowInk = await p.evaluate(() => { const c = document.querySelector('.fl-cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 30) n++; return n; });
    ok(flowInk > 500, name + ': the flow is drawn (' + flowInk + ' pixels)');
    ok(await p.evaluate(() => { const st = document.querySelector('.fl-stage').getBoundingClientRect(); return [...document.querySelectorAll('.fl-riv, .fl-city, .fl-src')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= st.left - 1 && r.right <= st.right + 1; }); }), name + ': every dot, river and city is inside the scene');
    await p.locator('.fl-riv').first().click({ force: true });
    ok(/°C|%|m\/s|ppm|hPa/.test(await p.locator('.fl-info').innerText()), name + ': pressing a river says what its sources read');
    ok(await p.locator('.fl-src.dim').count() >= 1, name + ': the layers outside that river are dimmed');
    await p.locator('.fl-riv').first().click({ force: true });
    await p.locator('.fl-src').first().click();
    ok((await p.locator('.fl-info').innerText()).length > 20 && await p.locator('.fl-info .fl-more').count() === 1, name + ': pressing a layer says its value and links to it');
    await p.locator('.fl-city').nth(1).click();
    ok(await p.locator('.fl-city.cur').count() === 1 && await p.locator('.fl-city').nth(1).getAttribute('class').then((c) => /cur/.test(c)), name + ': pressing a city makes the rivers show that city');
    ok(!/\b(lat|lng|latitude|longitude|GPS)\b/i.test(await p.locator('.fl').innerText()), name + ': no positions anywhere in the view');
    ok(await p.locator('.fl-band').count() === 6 && await p.locator('.fl-chip:not(.soon)').count() >= 8 && await p.locator('.fl-context .fl-chip:not(.soon)').count() >= 3, name + ': six levels, live chips, and the three context layers are connected');
    ok(await p.locator('.fl-src.own-page').count() >= 3, name + ': a layer the brain does not read is a hollow dot with no stream');
    await p.locator('.fl-chip.soon').first().click();
    ok(await p.locator('.fl-detail:not([hidden])').count() === 1 && (await p.locator('.fl-detail:not([hidden])').innerText()).length > 30, name + ': pressing a dashed chip explains it');
    // a context layer opens with what it holds
    for (const [cid, sel, word] of [['bathing-water-history', '.cx-map circle', el ? 'ασφαλές' : 'safe today'], ['waste-generation-national', '.cx-bars > div', el ? 'όλη την Κύπρο' : 'whole of Cyprus'], ['pv-solar-scenarios', '.cx-mon', el ? 'όχι μέτρηση' : 'not a measurement']]) {
      await p.evaluate((id) => { const b = [...document.querySelectorAll('.ly-list .ly-nm')].find((x) => x.closest('.ly-row') && x.textContent); return id; }, cid);
      await p.locator('.fl-context .fl-chip:not(.soon)', { hasText: cid === 'bathing-water-history' ? (el ? 'κολύμβησης' : 'Bathing') : cid === 'waste-generation-national' ? (el ? 'απορρίμματ' : 'Waste') : (el ? 'φωτοβολτ' : 'Solar') }).first().click();
      await p.locator('.fl-context .fl-detail .fl-more').click();
      await p.waitForSelector('.mod ' + sel, { timeout: 10000 });
      const n = await p.locator('.mod ' + sel).count(), text = await p.locator('.mod').innerText();
      ok(cid === 'bathing-water-history' ? n === 123 : cid === 'waste-generation-national' ? n === 2 : n === 4, name + ': ' + cid + ' shows its data (' + n + ')');
      ok(text.includes(word) && /CSV/.test(text), name + ': ' + cid + ' says what it is not, and offers the table');
      if (cid === 'bathing-water-history') ok(/95/.test(text) && !/score|improved|βαθμολογ/i.test(text), name + ': bathing water compares the 95 shared sites and gives no score');
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    }
    // the platform's name and logo
    ok(await p.evaluate((g) => { const b = document.querySelector('.sm-brand'); return !!b && b.querySelector('b').textContent === (g ? 'ΑΘΗΝΑ' : 'ATHENA') && /Smart Cities/.test(b.querySelector('small').textContent) && b.querySelectorAll('svg path').length >= 2; }, el), name + ': the menu carries the Athena name and mark');
    ok(/ · Athena$/.test(await p.title()) && await p.evaluate(() => document.querySelector('link[rel=icon]').getAttribute('href')) === '/site/logo.svg', name + ': the tab title and icon are Athena');
    // replay the day
    await tab(p, 'day'); await p.waitForSelector('.dy-c', { timeout: 15000 });
    const nb = await p.locator('.dy-b').count();
    ok(nb >= 2, name + ': the day has bars (' + nb + ')');
    ok(await p.locator('.dy-c').count() === 4, name + ': four city cards in the replay');
    ok(await p.locator('.dy-b.cur').count() === 1 && await p.locator('.dy-b').last().evaluate((e) => e.classList.contains('cur')), name + ': the replay opens on the newest moment');
    ok(/\d/.test(await p.locator('.dy-c .dy-s').first().innerText()), name + ': the first city has a number');
    const ranks = await p.$$eval('.dy-c:not(.none) .dy-s', (e) => e.map((x) => parseFloat(x.textContent.replace('−', '-').replace(',', '.'))));
    ok(ranks.every((v, i) => i === 0 || v <= ranks[i - 1]), name + ': the cities are ranked highest first (' + ranks.join(', ') + ')');
    await p.locator('.dy-ctl button').first().click();
    ok(await p.locator('.dy-b').first().evaluate((e) => e.classList.contains('cur')), name + ': the first button goes to the first bar');
    await p.locator('.dy-bars').focus(); await p.keyboard.press('ArrowRight');
    ok(await p.locator('.dy-b').nth(1).evaluate((e) => e.classList.contains('cur')), name + ': the right arrow moves one bar');
    await p.keyboard.press('Home'); await p.locator('.dy-play').click(); await p.waitForTimeout(1700);
    ok(await p.$$eval('.dy-b', (e) => e.findIndex((x) => x.classList.contains('cur'))) >= 1, name + ': play moves through the day');
    await p.waitForTimeout(Math.max(0, nb * 700 - 1000)); 
    ok(!(await p.locator('.dy-play').evaluate((e) => e.classList.contains('on'))), name + ': play stops at the newest moment');
    await p.locator('.dy-c .dy-h').first().click();
    ok(await p.locator('.dy-c.open .dy-l li').count() === 4 && /from: |από: /.test(await p.locator('.dy-c.open .dy-l').innerText()), name + ': an open card names the layer behind each number');
    await p.locator('.dy-chips .ly-chip').nth(1).click();
    ok(/m\/s|km\/h/.test(await p.locator('.dy-c .dy-s').first().innerText()), name + ': the wind chip ranks by wind');
    ok(/never as a place|ποτέ ως σημείο/.test(await p.locator('.dy-side').innerText()), name + ': the replay says vehicles are never a place on a map');
    if (el) ok(/Η μέρα ξανά/.test(await p.locator('.ly-top .nm-pillbar').innerText()) && /Όπως ήταν το νησί/.test(await p.locator('.dy-head').innerText()) && /Τι βλέπεις/.test(await p.locator('.dy-side').innerText()), name + ': the replay is in Greek');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': the replay does not scroll sideways');
    await p.locator('.dy-c .dy-h').first().click(); await p.locator('.dy-c.open .dy-go').click(); await p.waitForSelector('.lv-cmp, [class*=lv-cmp], .lv-host');
    ok(await p.locator('.ly-top .nm-pillbar button.on').getAttribute('data-v') === 'compare', name + ': a card opens the comparison for its city');
    // the data core
    await tab(p, 'cine'); await p.waitForSelector('.cn-pi', { timeout: 30000 });
    ok(await p.locator('.cn-pi').count() >= 3 && await p.locator('.cn-po').count() === 6, name + ': the core has its layers in and six ways out');
    ok(await p.evaluate(() => { const c = document.querySelector('.cn-gl'); return !!c && c.width > 100 && c.height > 100; }), name + ': the 3D canvas is drawn at a real size');
    ok(/\d/.test(await p.locator('.cn-tot').innerText()) && /\d/.test(await p.locator('.cn-words').innerText()), name + ': the core gives its totals in the bar and in words');
    ok(new RegExp(el ? 'ΑΘΗΝΑ' : 'ATHENA').test(await p.locator('.cn-top b').innerText()), name + ': the scene carries the name');
    ok(/decoration|διακοσμητικ/.test(await p.locator('.cn-words').innerText()), name + ': the core says the shape and the map carry no numbers');
    await p.waitForTimeout(3200);
    ok((await p.locator('.cn-tick').innerText()).length > 12 && !/Replaying|Επανάληψη/.test(await p.locator('.cn-tick').innerText()), name + ': a real reading is named in the bottom line');
    ok(await p.locator('.cn-riser:not([hidden])').count() === 1, name + ': the amber box shows the reading');
    await p.locator('.cn-pause').click();
    ok(await p.locator('.cn-pause').getAttribute('aria-pressed') === 'true' && await p.locator('.cn.cn-paused').count() === 1, name + ': the scene can be paused');
    const fr1 = await p.locator('.cn-beat').evaluate((e) => e.style.opacity + e.querySelector('u').style.width); await p.waitForTimeout(600);
    ok(fr1 === await p.locator('.cn-beat').evaluate((e) => e.style.opacity + e.querySelector('u').style.width), name + ': a paused scene stands still');
    await p.locator('.cn-pause').click();
    if (el) ok(/Πυρήνας δεδομένων/.test(await p.locator('.ly-top .nm-pillbar').innerText()) && /ΑΘΗΝΑ · SMART CITIES ΚΥΠΡΟΣ/.test(await p.locator('.cn-top').innerText()) && /Με λόγια/.test(await p.locator('.cn-words').innerText()), name + ': the core is in Greek');
    ok(await p.evaluate(() => { const s = document.querySelector('.cn'), r = s.getBoundingClientRect(); return [...s.querySelectorAll('.cn-pi, .cn-po, .cn-top, .cn-bot')].every((e) => { const q = e.getBoundingClientRect(); return q.left >= r.left - 1 && q.right <= r.right + 1; }); }), name + ': the panels stay inside the scene');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': the core does not scroll sideways');
    const want = await p.locator('.cn-po b').nth(2).innerText();
    await p.locator('.cn-po').nth(2).click(); await p.waitForTimeout(400);
    const flat = (x) => x.normalize('NFD').replace(/\u0301/g, '').toLowerCase().replace(/ς/g, 'σ');   // capitals drop the Greek accent
    ok(flat(await p.locator('.ly-chip.on').first().innerText()) === flat(want), name + ': pressing a city on the core opens that city (' + want + ')');
    await p.locator('.cn-po').nth(5).click(); await p.waitForSelector('.dy');
    ok(await p.locator('.ly-top .nm-pillbar button.on').getAttribute('data-v') === 'day', name + ': the core opens the replay');
    ok(await p.locator('.ly-top .nm-pillbar button[data-v="core"]').count() === 0, name + ': the old Mission control tab is gone');
    // stack still works
    await tab(p, 'stack'); await p.waitForSelector('.ly-plane');
    ok(await p.locator('.ly-plane').count() === 4, name + ': the stack view is still there');
    await tab(p, 'live'); await p.waitForSelector('.lv-map .lv-sch span');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': the page does not scroll sideways');
    if (el) ok(/Ζωντανός χάρτης/.test(await p.locator('.ly-top .nm-pillbar').innerText()) && /Η Κύπρος/.test(await p.locator('.lv-hd h3').innerText()), name + ': the views are in Greek');
    ok(errs.length === 0, name + ': no script errors (' + errs.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }
  await run('desktop', { viewport: { width: 1366, height: 900 } });
  await run('greek', { viewport: { width: 1366, height: 900 } }, 'el');
  await run('phone', { ...devices['iPhone 13'] });
  // reduced motion: nothing loops
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' }), p = await ctx.newPage();
  await p.goto(BASE + '/#/layers'); await p.waitForSelector('.lv-map .lv-sch span'); await p.waitForTimeout(1500);
  const anim = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.ly-stagecard')).length);
  ok(anim === 0, 'reduced motion: no running animation in the live views (' + anim + ')');
  await p.click('.ly-top .nm-pillbar button[data-v="all"]'); await p.waitForSelector('.fl-src', { state: 'attached' }); await p.waitForTimeout(800);
  const f1 = await p.evaluate(() => document.querySelector('.fl-cv').toDataURL().length); await p.waitForTimeout(700);
  ok(f1 === await p.evaluate(() => document.querySelector('.fl-cv').toDataURL().length) && await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect.target.closest && a.effect.target.closest('.ly-stagecard')).length) === 0, 'reduced motion: the data flow is one still picture');
  await p.click('.ly-top .nm-pillbar button[data-v="live"]'); await p.waitForSelector('.lv-map .lv-sch span');
  const a1 = await p.evaluate(() => document.querySelector('.lv-wind').toDataURL().length); await p.waitForTimeout(700);
  ok(a1 === await p.evaluate(() => document.querySelector('.lv-wind').toDataURL().length), 'reduced motion: the wind is one still picture');
  // reduced motion: the replay moves one step per press and the core is one still picture without a pause button
  await p.click('.ly-top .nm-pillbar button[data-v="day"]'); await p.waitForSelector('.dy-c');
  await p.locator('.dy-ctl button').first().click(); await p.locator('.dy-play').click(); await p.waitForTimeout(1600);
  ok(await p.$$eval('.dy-b', (e) => e.findIndex((x) => x.classList.contains('cur'))) === 1 && !(await p.locator('.dy-play').evaluate((e) => e.classList.contains('on'))), 'reduced motion: play moves the replay one step');
  await p.click('.ly-top .nm-pillbar button[data-v="cine"]'); await p.waitForSelector('.cn-pi', { timeout: 30000 }); await p.waitForTimeout(800);
  ok(await p.locator('.cn-pause').isHidden(), 'reduced motion: the core has no pause button');
  const c1 = await p.locator('.cn-tick').innerText(); await p.waitForTimeout(6500);
  ok(c1.length > 12 && c1 === await p.locator('.cn-tick').innerText(), 'reduced motion: the core names one reading and stays on it');
  await ctx.close();
  // no 3D graphics: a note and a way to the same data
  const ctx2 = await b.newContext({ viewport: { width: 1366, height: 900 } }), p2 = await ctx2.newPage(), errs2 = [];
  p2.on('pageerror', (e) => errs2.push(String(e)));
  await p2.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
  await p2.goto(BASE + '/#/layers'); await p2.waitForSelector('.lv-map .lv-sch span');
  await p2.click('.ly-top .nm-pillbar button[data-v="cine"]'); await p2.waitForSelector('.cn-fail', { timeout: 20000 });
  ok(/3D/.test(await p2.locator('.cn-fail').innerText()) && /\d/.test(await p2.locator('.cn-words').innerText()), 'no 3D: a note says why, and the totals are still given in words');
  await p2.locator('.cn-fail button').click(); await p2.waitForSelector('.fl-src', { state: 'attached' });
  ok(await p2.locator('.ly-top .nm-pillbar button.on').getAttribute('data-v') === 'all' && errs2.length === 0, 'no 3D: the button opens "All our data" without errors');
  // the home page shows the same scene under the tour route, and its panels open the Data layers page
  for (const [name, opts] of [['home desktop', { viewport: { width: 1366, height: 900 } }], ['home phone', { ...devices['iPhone 13'] }]]) {
    const c3 = await b.newContext(opts), p3 = await c3.newPage(), e3 = [];
    p3.on('pageerror', (e) => e3.push(String(e)));
    await p3.goto(BASE + '/#/home'); await p3.waitForSelector('.hm-core .cn-pi', { timeout: 30000 });
    ok(await p3.evaluate(() => { const a = document.querySelector('.hm-route'), c = document.querySelector('.hm-core'), s = document.querySelector('.hm-stage'); return a.getBoundingClientRect().bottom <= c.getBoundingClientRect().top + 1 && c.getBoundingClientRect().bottom <= s.getBoundingClientRect().top + 60; }), name + ': the scene sits between the tour route and the island');
    ok(await p3.locator('.hm-core .cn-po').count() === 6 && /\d/.test(await p3.locator('.hm-core .cn-words').innerText()), name + ': the scene has its panels and its sentence');
    ok(await p3.locator('.hm-stage .hm-plane').count() === 1, name + ': the island is still there');
    ok(await p3.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': the home page does not scroll sideways');
    await p3.locator('.hm-core .cn-po').nth(3).click(); await p3.waitForSelector('.ly-chip.on');
    ok(/#\/layers/.test(p3.url()) && /paphos/i.test(await p3.locator('.ly-chip.on').first().innerText()), name + ': pressing a city opens the Data layers page on that city');
    await p3.goto(BASE + '/#/home'); await p3.waitForSelector('.hm-core .cn-po', { timeout: 30000 });
    await p3.locator('.hm-core .cn-po').nth(5).click(); await p3.waitForSelector('.dy', { timeout: 15000 });
    ok(await p3.locator('.ly-top .nm-pillbar button.on').getAttribute('data-v') === 'day', name + ': "Replay the day" opens that view');
    ok(e3.length === 0, name + ': no script errors (' + e3.slice(0, 2).join(' | ') + ')');
    await c3.close();
  }
  await b.close(); srv.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
