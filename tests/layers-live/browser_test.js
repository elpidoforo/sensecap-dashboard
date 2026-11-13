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
  const b = await chromium.launch();
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
  await b.close(); srv.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
