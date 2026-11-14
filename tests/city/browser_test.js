'use strict';
/* The city centres in 3D (#/city and /city.html): the island, the flight to a centre, the buildings and streets, layers, the camera,
   the way back, Greek, a phone, and the page around it. Real server in test mode (made-up blocks, nothing fetched).
   Software WebGL (SwiftShader). Run: node tests/city/browser_test.js */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), PORT = 3979, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'city-b-'));
  const srv = spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dir, ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/api/city/larnaka'); if (r.ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    // the server side
    const head = await fetch(BASE + '/city.html?embed=1');
    ok(head.ok && /script-src 'self' 'sha256-/.test(head.headers.get('content-security-policy') || '') && /connect-src 'self'/.test(head.headers.get('content-security-policy')), 'the 3D page has a strict policy and talks only to this site');
    const red = await fetch(BASE + '/city.html', { redirect: 'manual' });
    ok(red.status === 302 && red.headers.get('location') === '/#/city', 'the bare page leads to its place in the site');
    const api = await (await fetch(BASE + '/api/city/limassol')).json();
    ok(api.mock === true && api.buildings.length > 100 && api.roads.length > 10, 'the test mode gives made-up blocks');
    ok((await fetch(BASE + '/api/city/nowhere')).status === 404, 'an unknown city is refused');

    const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(BASE + '/city.html?embed=1&lang=en'); await p.waitForFunction(() => window.__embedReady, null, { timeout: 30000 });
    const v = () => p.evaluate(() => document.body.dataset.view);
    ok(await v() === 'island', 'the page opens on the whole island');
    ok(await p.locator('.lab:not([hidden])').count() === 4 && await p.locator('#cities button').count() === 4, 'the four cities are on the island and in the bar');
    ok(await p.locator('#info').isHidden() && await p.locator('#cam').isHidden(), 'the city card and camera buttons wait for a city');
    await p.locator('.lab', { hasText: 'Larnaka' }).click();
    await p.waitForFunction(() => document.body.dataset.view === 'flying', null, { timeout: 5000 }).catch(() => {});
    await p.waitForFunction(() => document.body.dataset.view === 'city' && document.body.dataset.buildings, null, { timeout: 40000 });
    ok(await p.evaluate(() => document.body.dataset.city) === 'larnaka' && Number(await p.evaluate(() => document.body.dataset.buildings)) > 100, 'pressing a city flies down to its centre and draws its buildings');
    ok(/Larnaka centre/.test(await p.locator('#crumb').innerText()) && await p.locator('#cities button[aria-pressed="true"]').innerText() === 'Larnaka', 'the bar says where you are');
    const info = await p.locator('#info').innerText();
    ok(/buildings/.test(info) && /height recorded/.test(info) && /not recorded, drawn at 9 m/.test(info), 'the card counts the buildings and says how many heights are guessed');
    ok(await p.locator('#badge').isVisible() && /Demo buildings/.test(await p.locator('#badge').innerText()) && /made up/.test(info), 'made-up blocks are labelled as demo');
    ok(/PASCAL Larnaka/.test(await p.locator('.lab.school').innerText()), 'the school is marked, with its distance when it is outside the box');
    ok(await p.locator('#labels .lab:not(.school):not([hidden])').count() === 0, 'the island labels are gone in the city');
    // pointing at things
    let tip = '';
    for (const [x, y] of [[683, 430], [700, 470], [640, 500], [760, 420], [683, 560]]) { await p.mouse.move(x, y); await p.waitForTimeout(250); tip = await p.locator('#tip').innerText().catch(() => ''); if (tip) break; }
    ok(/Building|Street|road|Unnamed|Demo/.test(tip), 'pointing at a building or a street says what it is (' + tip.replace(/\n/g, ' ') + ')');
    // layers
    await p.locator('#lyB').uncheck();
    ok(await p.evaluate(() => document.body.dataset.meshes) === 'r', 'buildings can be switched off');
    await p.locator('#lyB').check(); await p.locator('#lyR').uncheck();
    ok(await p.evaluate(() => document.body.dataset.meshes) === 'b', 'streets can be switched off');
    await p.locator('#lyR').check(); await p.locator('#lyG').check(); await p.locator('#lyS').uncheck(); await p.waitForTimeout(400);
    ok(await p.locator('.lab.school').isHidden(), 'the school marker can be switched off');
    // the camera
    await p.locator('#camTop').click(); await p.waitForTimeout(1600);
    await p.locator('#camTurn').click();
    ok(await p.locator('#camTurn').getAttribute('aria-pressed') === 'true', 'the camera can look from above and turn');
    await p.mouse.move(683, 430); await p.mouse.wheel(0, 6000); await p.waitForTimeout(800);
    ok(await v() === 'city', 'zooming out stays within the city');
    // another city, then back
    await p.locator('#cities button', { hasText: 'Paphos' }).click();
    await p.waitForFunction(() => document.body.dataset.view === 'city' && document.body.dataset.city === 'paphos', null, { timeout: 40000 });
    ok(/Paphos centre/.test(await p.locator('#info').innerText()), 'another city replaces the first');
    ok(/city=paphos/.test(p.url()), 'the address keeps the city');
    await p.locator('#home').click();
    await p.waitForFunction(() => document.body.dataset.view === 'island', null, { timeout: 20000 });
    ok(await p.locator('#info').isHidden() && await p.locator('.lab:not([hidden]):not(.school)').count() === 4, 'Cyprus goes back to the whole island');
    // a link straight to a city
    await p.goto(BASE + '/city.html?embed=1&lang=en&city=limassol');
    await p.waitForFunction(() => document.body.dataset.view === 'city' && document.body.dataset.city === 'limassol', null, { timeout: 40000 });
    ok(true, 'a link with a city flies straight there');
    ok(errs.length === 0, 'no script errors on the 3D page (' + errs.slice(0, 2).join(' | ') + ')');
    await ctx.close();

    // Greek, inside the site, on a phone
    const c2 = await b.newContext({ ...devices['iPhone 13'] }), q = await c2.newPage(), errs2 = [];
    q.on('pageerror', (e) => errs2.push(String(e)));
    await q.goto(BASE + '/?lang=el#/city'); await q.waitForSelector('.city-frame iframe');
    const fr = q.frameLocator('.city-frame iframe');
    await q.waitForFunction(() => { const f = document.querySelector('.city-frame iframe'); try { return f && f.contentWindow && f.contentWindow.__embedReady; } catch (e) { return false; } }, null, { timeout: 30000 });
    ok(/Τα κέντρα των πόλεων σε 3D/.test(await q.locator('h1, .nm-head h1, h2').first().innerText().catch(() => '')) || /Τα κέντρα των πόλεων σε 3D/.test(await q.locator('body').innerText()), 'the page is in the menu language (Greek)');
    ok(/Λάρνακα/.test(await fr.locator('#cities').innerText()) && /Στρώματα/.test(await fr.locator('#layers').innerText()), 'the 3D view is in Greek');
    ok(/OpenStreetMap/.test(await q.locator('.mp-note').innerText()), 'the page credits OpenStreetMap');
    ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the page does not scroll sideways on a phone');
    await fr.locator('#cities button').first().tap();
    await q.waitForFunction(() => { const f = document.querySelector('.city-frame iframe'); return f && f.contentDocument && f.contentDocument.body.dataset.view === 'city' && f.contentDocument.body.dataset.buildings; }, null, { timeout: 90000 });
    ok(/κτίρια/.test(await fr.locator('#info').innerText()), 'a city opens on a phone, in Greek');
    ok(await q.evaluate(() => [...document.querySelectorAll('.nm-side-a')].some((a) => a.getAttribute('href') === '#/city')), 'the page is in the menu');
    ok(errs2.length === 0, 'no script errors on the phone (' + errs2.slice(0, 2).join(' | ') + ')');
    await c2.close();
  } catch (e) { fail++; console.log('FAIL: the run stopped: ' + String(e).slice(0, 500)); }
  await b.close(); srv.kill();
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
