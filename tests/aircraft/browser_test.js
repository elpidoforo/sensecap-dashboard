'use strict';
/* Aeroplanes over Cyprus (#/aircraft) in a real browser, in English and in Greek (Playwright, which is not a dependency of the site:
   run where it is installed). Test mode, so the page shows the three fixed points and labels them as demo data.
   Run: node tests/aircraft/browser_test.js   (real server on port 3987)
   Pictures: AIRCRAFT_SHOTS (a folder) is where the two screenshots go; without it they go to the system's temp folder. */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const PORT = 3987, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.AIRCRAFT_SHOTS || (fs.existsSync('/home/claude/kleanthis-research') ? '/home/claude/kleanthis-research' : os.tmpdir());
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
(async () => {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'aircraft-b-')), ANTHROPIC_API_KEY: '' };
  delete env.ADSBFI_BASE;
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/feeds'); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  async function run(name, lang, shot, viewport) {
    const el = lang === 'el';
    const ctx = await b.newContext({ viewport, deviceScaleFactor: 2 }), p = await ctx.newPage(), errs = [], asked = [], outside = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('response', (r) => { if (r.url().includes('aircraft') && r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
    p.on('request', (q) => { const u = q.url(); if (u.includes('/api/aircraft')) asked.push(u); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u); });
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/aircraft');
    await p.waitForSelector('.ac-svg .ac-pt', { timeout: 20000 });
    ok((await p.locator('h1').first().innerText()).trim() === (el ? 'Αεροπλάνα πάνω από την Κύπρο' : 'Aeroplanes over Cyprus'), name + ': the title');
    ok(await p.locator('.ac-svg .ac-land').count() >= 6, name + ': the island outline is drawn');
    ok(await p.locator('.ac-svg .ac-ring').count() === 1, name + ': the range circle is drawn');
    ok(await p.locator('.ac-svg .ac-pt').count() === 3, name + ': three markers');
    // phase by shape, not by colour alone
    ok(await p.locator('.ac-pt[data-phase=high] path.ac-high').count() === 1 && await p.locator('.ac-pt[data-phase=low] path.ac-low').count() === 1 && await p.locator('.ac-pt[data-phase=ground] rect.ac-ground').count() === 1, name + ': arrow, hollow arrow and square, one of each');
    const fills = await p.evaluate(() => ['high', 'low'].map((k) => getComputedStyle(document.querySelector('.ac-pt .ac-' + k)).fill));
    ok(fills[0] !== fills[1], name + ': the filled and the hollow arrow really differ');
    ok(/rotate\(118\)/.test(await p.locator('.ac-pt[data-phase=high]').getAttribute('transform')), name + ': the arrow is turned to the heading');
    const inside = await p.evaluate(() => { const s = document.querySelector('.ac-svg').getBoundingClientRect(); return [...document.querySelectorAll('.ac-pt')].every((g) => { const r = g.getBoundingClientRect(); return r.width > 4 && r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom; }); });
    ok(inside, name + ': every marker is visible inside the map');
    ok((await p.locator('.ac-status').innerText()).trim() === (el ? '3 αεροπλάνα εντός εμβέλειας τώρα' : '3 aeroplanes in range right now'), name + ': the count in words');
    ok(/just now|seconds ago|μόλις τώρα|δευτερόλεπτα/.test(await p.locator('.ac-age').innerText()), name + ': says how old the picture is');
    ok((await p.locator('.ac-legend li .ac-count').allInnerTexts()).join() === '1,1,1,0', name + ': the counts for each phase (' + (await p.locator('.ac-legend li .ac-count').allInnerTexts()).join() + ')');
    ok(await p.locator('.ac-legend li svg .ac-m').count() === 4, name + ': the legend shows every shape');
    ok(await p.locator('.ac-table tbody tr').count() === 3, name + ': the same three as a table');
    const table = await p.locator('.ac-table').innerText();
    ok(el ? /Ψηλά: μάλλον περνά από πάνω/.test(table) && /Στο έδαφος/.test(table) && /κόμβοι/.test(table) && /νοτιοανατολικά/.test(table) : /High: likely passing over/.test(table) && /On the ground/.test(table) && /knots/.test(table) && /south-east/.test(table), name + ': the table says the phase, the speed and the direction in words');
    ok(/36[.,]000 ft/.test(table), name + ': the table has the height');
    const all = await p.locator('#view').innerText();
    ok(el ? /Δεδομένα επίδειξης/.test(all) : /Demo data/.test(all), name + ': the fixed points are labelled as demo data');
    ok(el ? /δεν σημαίνει ότι ο ουρανός είναι άδειος/.test(all) : /A missing aeroplane does not mean an empty sky/.test(all), name + ': the note about gaps in coverage');
    ok(el ? /εικασί/.test(all) : /guess/.test(all), name + ': the phase is called a guess');
    ok(await p.locator('.ac-credit a[href="https://adsb.fi/"]').count() === 1 && /adsb\.fi/.test(await p.locator('.ac-credit').innerText()), name + ': adsb.fi is credited with a link');
    if (el) ok(!/[A-Za-z]{5,}/.test(all.replace(/adsb\.fi|Kleanthis|Smart Cities/g, '')), name + ': no English left on the Greek page (' + ((all.replace(/adsb\.fi|Kleanthis|Smart Cities/g, '').match(/[A-Za-z]{5,}/g)) || []).slice(0, 5).join(' ') + ')');
    ok(await p.evaluate(() => [...document.querySelectorAll('.nm-side-a')].some((a) => a.getAttribute('href') === '#/aircraft')), name + ': the page is in the menu');
    ok(!/hex|flight|callsign/i.test((await p.evaluate(() => document.querySelector('#view').outerHTML)).replace(/no flight names/g, '')), name + ': no flight name or aircraft id in the page (only our own words "no flight names")');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), name + ': no sideways scrolling');
    await p.screenshot({ path: path.join(SHOTS, shot), fullPage: true });
    ok(fs.statSync(path.join(SHOTS, shot)).size > 20000, name + ': screenshot saved');
    // leaving the page stops the asking
    const n = asked.length;
    await p.evaluate(() => { location.hash = '#/feeds'; });
    const listed = await p.waitForFunction(() => { const e = document.querySelector('.fd'); return e && /adsb\.fi/.test(e.innerText); }, null, { timeout: 20000 }).then(() => true, () => false);
    ok(listed, name + ': the feed list has adsb.fi, so a teacher can switch it off');
    await p.waitForTimeout(22000);
    ok(n >= 1 && asked.length === n, name + ': after leaving the page nothing asks for aircraft any more (' + n + ' then ' + asked.length + ')');
    ok(outside.length === 0, name + ': the browser talks only to our own server (' + outside.slice(0, 2).join(' ') + ')');
    ok(errs.length === 0, name + ': no page errors (' + errs.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }
  await run('English', '', 'aircraft-page.png', { width: 1280, height: 900 });
  await run('Greek', 'el', 'aircraft-page-el.png', { width: 1280, height: 900 });

  // a phone, and the poll: the page asks again after 20 s
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 }), p = await ctx.newPage(), asked = [];
    p.on('request', (q) => { if (q.url().includes('/api/aircraft')) asked.push(Date.now()); });
    await p.goto(BASE + '/#/aircraft');
    await p.waitForSelector('.ac-svg .ac-pt', { timeout: 20000 });
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no sideways scrolling');
    ok(await p.evaluate(() => document.querySelector('.ac-svg').getBoundingClientRect().width > 300), 'phone: the map uses the width');
    await p.waitForTimeout(21500);
    ok(asked.length === 2, 'phone: the page asked again after 20 seconds (' + asked.length + ' calls)');
    // an error after a good picture: the page says so and keeps the last picture
    await p.route('**/api/aircraft', (route) => route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"x"}' }));
    await p.locator('.ac-side button', { hasText: 'Look again now' }).click();
    await p.waitForSelector('.ac-side .err');
    ok(/not a sign that the sky is empty/.test(await p.locator('.ac-side .err').innerText()) && await p.locator('.ac-pt').count() === 3, 'error: said plainly, and the last picture stays');
    // an empty sky
    await p.unroute('**/api/aircraft');
    await p.route('**/api/aircraft', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ points: [], more: 0, centre: { lat: 35, lng: 33.2, distNm: 120 }, updated: new Date().toISOString(), source: 'adsb.fi', mock: false }) }));
    await p.locator('.ac-side button', { hasText: 'Look again now' }).click();
    await p.waitForFunction(() => document.querySelectorAll('.ac-pt').length === 0);
    ok((await p.locator('.ac-status').innerText()).trim() === 'No aeroplanes in range right now' && await p.locator('.ac-side .err').count() === 0, 'empty: "No aeroplanes in range right now"');
    ok(!/Demo data/.test(await p.locator('#view').innerText()), 'empty: real data is not labelled as demo');
    // more than fits, a point outside the map, a point without a heading and one without a height
    await p.unroute('**/api/aircraft');
    const pts = [{ id: 'a1', lat: 35.2, lng: 33.3, altFt: 4000, onGround: false, gs: 180, track: null, phase: 'low' }, { id: 'a2', lat: 35.3, lng: 33.4, altFt: null, onGround: false, gs: null, track: 90, phase: 'unknown' }, { id: 'a3', lat: 39.9, lng: 33.2, altFt: 30000, onGround: false, gs: 400, track: 10, phase: 'high' }];
    await p.route('**/api/aircraft', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ points: pts, more: 4, centre: { lat: 35, lng: 33.2, distNm: 120 }, updated: new Date().toISOString(), source: 'adsb.fi', mock: false }) }));
    await p.locator('.ac-side button', { hasText: 'Look again now' }).click();
    await p.waitForSelector('.ac-more');
    ok((await p.locator('.ac-more').innerText()).trim() === '5 more beyond the map' && await p.locator('.ac-pt').count() === 2, 'more: 4 over the limit and 1 outside the box are counted in words');
    ok(await p.locator('.ac-pt[data-phase=low] circle').count() === 1 && !/rotate/.test(await p.locator('.ac-pt[data-phase=low]').getAttribute('transform')), 'no heading: a dot, not an arrow pointing somewhere');
    ok(await p.locator('.ac-pt[data-phase=unknown] circle.ac-unknown').count() === 1 && /Height not reported/.test(await p.locator('.ac-table').innerText()), 'no height: a ring and "Height not reported"');
    // switched off by a teacher
    await p.unroute('**/api/aircraft');
    await p.route('**/api/aircraft', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"switched off by a teacher","feed":"adsbfi"}' }));
    await p.locator('.ac-side button', { hasText: 'Look again now' }).click();
    await p.waitForSelector('.ac-side .err');
    ok(/teacher has switched this source off/.test(await p.locator('.ac-side .err').innerText()) && await p.locator('.ac-pt').count() === 0, 'off: says a teacher switched it off and shows no old picture');
    await ctx.close();
  }
  await b.close();
  srv.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
