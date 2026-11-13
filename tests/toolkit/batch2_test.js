'use strict';
/* Toolkit batch 2 in a real browser: Event radar, How an event unfolded, My watch, Morning brief, Ventilation coach
   (Playwright, which is not a dependency of the site: run where it is installed).
   Run: node tests/toolkit/batch2_test.js          (real server with demo data on port 3985)
        TOOLKIT_SHOTS=<folder> node tests/toolkit/batch2_test.js     also saves <id>_desk.png and <id>_phone.png there
        node tests/toolkit/batch2_test.js --serve   only starts the seeded server and keeps it running (to look at the pages by hand)

   The demo data is almost flat, so a day with something in it is SEEDED for the test: the server is started once to read the demo's
   own current numbers, stopped, and a saved day (the file layers-pulse.json that the layers pulse itself writes) is written around those
   numbers with three designed events and one school's classroom CO2. This seeded day exists only in the test's temp folder. */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const PORT = 3985, BASE = `http://127.0.0.1:${PORT}`, ROOT = path.join(__dirname, '..', '..');
const HOUR = 3600000, STEP = 300000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(dataDir) {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dataDir, ANTHROPIC_API_KEY: '', LAYERS_PULSE_SECONDS: '5', LAYERS_PULSE_FIRST_MS: '300' };
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  const kill = () => { try { srv.kill(); } catch (e) { /* gone */ } };
  process.on('exit', kill);
  return { srv, stop: () => new Promise((res) => { srv.once('exit', res); kill(); setTimeout(res, 3000); }) };
}
async function waitUp() { for (let i = 0; i < 150; i++) { try { const r = await fetch(BASE + '/layers/api/register'); if (r.ok) return; } catch (e) { /* not yet */ } await sleep(200); } throw new Error('the server did not start'); }
const getJson = async (p) => (await fetch(BASE + p)).json();

// A saved day around the demo's own numbers. Returns what was designed, so the checks know what to look for.
function seed(dataDir, live) {
  const now = Date.now(), t0 = now - 23.5 * HOUR, times = [];
  for (let t = t0; t <= now - 2 * 60000; t += STEP) times.push(Math.round(t));
  const AMP = { temperature: 2.5, relative_humidity: 6, wind_speed: 0.8, pressure: 1, co2: 25, pm25: 2, pm10: 3, dust: 4, ozone: 5, sea_surface_temperature: 0.2, wave_height: 0.05 };
  const hourStart = (agoH) => Math.floor((now - agoH * HOUR) / HOUR) * HOUR;
  const E1 = hourStart(14), E2 = hourStart(6), E3 = hourStart(9);
  // a change that starts at `at`, holds for `hold` hours and fades over `fade` hours
  const bump = (t, at, size, hold, fade) => (t < at ? 0 : t < at + hold * HOUR ? size : size * Math.max(0, 1 - (t - at - hold * HOUR) / (fade * HOUR)));
  const extra = {
    'larnaka|cydom-stations|temperature': (t) => bump(t, E1, -4, 3, 10),
    'larnaka|openmeteo-weather|temperature': (t) => bump(t, E1, -3, 3, 10),
    'larnaka|sensecap-buses|temperature': (t) => bump(t, E1 + HOUR, -4.5, 3, 10),
    'larnaka|cydom-stations|wind_speed': (t) => bump(t, E1, 3, 3, 10),
    'limassol|sensecap-buses|co2': (t) => bump(t, E2, 400, 1, 0.01),
    'paphos|openmeteo-air|pm25': (t) => bump(t, E3, 25, 2, 12),
    'paphos|openmeteo-air|pm10': (t) => bump(t, E3, 40, 2, 12),
    'paphos|openmeteo-weather|wind_speed': (t) => bump(t, E3, 5, 2, 12),
  };
  const series = {};
  for (const city of Object.keys(live.cities)) for (const r of live.cities[city].rows) {
    if (r.stale) continue;
    const k = city + '|' + r.source + '|' + r.variable, a = AMP[r.variable] || 0, f = extra[k];
    series[k] = times.map((t) => [t, Math.round((r.value + a * Math.sin((2 * Math.PI * (now - t)) / (24 * HOUR)) + (f ? f(t) : 0)) * 100) / 100]);
  }
  // one school's classroom CO2 (no classroom sensor exists in the demo): a school day with two lessons and a break
  const lin = (x, pts) => { for (let i = 1; i < pts.length; i++) if (x >= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x0 - x)) / (x0 - x1 || 1); } return pts[pts.length - 1][1]; };
  const day = [[24, 450], [10, 450], [8, 1300], [7.5, 600], [5.5, 1700], [4.5, 500], [3.5, 450], [0, 450]];   // [hours ago, ppm]
  series['larnaka|sensecap-classrooms|co2'] = times.map((t) => [t, Math.round(lin((now - t) / HOUR, day))]);
  fs.writeFileSync(path.join(dataDir, 'layers-pulse.json'), JSON.stringify({ at: now, series }));
  return { now, E1, E2, E3, keys: Object.keys(series).length };
}

async function seededServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk2-'));
  let s = startServer(dataDir);
  await waitUp(); await sleep(2500);
  let live = await getJson('/layers/api/live');
  for (let i = 0; i < 20 && !Object.values(live.cities).every((c) => c.rows.length); i++) { await sleep(500); live = await getJson('/layers/api/live'); }
  await s.stop(); await sleep(300);
  const design = seed(dataDir, live);
  s = startServer(dataDir);
  await waitUp(); await sleep(7000);   // the first pulses after the restart
  return { stop: s.stop, design, dataDir };
}
module.exports = { seededServer, BASE };

if (require.main === module) {
  if (process.argv.includes('--serve')) { seededServer().then((s) => console.log('seeded server on ' + BASE, JSON.stringify(s.design))); }
  else main().catch((e) => { console.error(e); process.exit(1); });
}


async function main() {
  const { chromium, devices } = require('playwright');
  const SHOTS = process.env.TOOLKIT_SHOTS || '';
  let passed = 0, failed = 0;
  const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
  const S = await seededServer();

  /* ----- the title check (the only new endpoint): it answers, it refuses private details, it keeps nothing ----- */
  const post = (body, headers) => fetch(BASE + '/watch/api/title', { method: 'POST', headers: { 'content-type': 'application/json', ...(headers || {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  { const r = await post({ title: '  Hot   afternoons ' }); const j = await r.json(); ok(r.status === 200 && j.ok === true && j.title === 'Hot afternoons', 'api: a clean title is accepted and tidied'); }
  for (const [bad, what] of [['call 99 123456', 'a phone number'], ['mail me a@b.cy', 'an e-mail'], ['see www.example.com', 'a link'], ['@someone_here', 'a handle'], ['+357 99123456', 'an international number']]) {
    const r = await post({ title: bad }); const j = await r.json(); ok(r.status === 422 && j.code === 'title_private' && !JSON.stringify(j).includes(bad), 'api: a title with ' + what + ' is refused and not echoed');
  }
  { const r = await post({ title: 'x'.repeat(200) }); const j = await r.json(); ok(r.status === 200 && j.title.length === 40, 'api: a long title is cut to 40 letters'); }
  ok((await post({ title: 'y'.repeat(5000) })).status === 413, 'api: a huge body is refused');
  ok((await post('not json')).status === 400 && (await post({ title: 5 })).status === 400, 'api: a body that is not a title is refused');
  ok((await fetch(BASE + '/watch/api/title')).status === 405, 'api: only POST');
  ok((await post({ title: 'ok' }, { origin: 'http://evil.example' })).status === 403, 'api: another site cannot use the check');
  ok(!fs.readdirSync(S.dataDir).some((f) => /watch/i.test(f)), 'api: the check wrote nothing to the data folder');
  { const r = await post({ title: '' }); const j = await r.json(); ok(r.status === 200 && j.title === '', 'api: an empty title is fine'); }

  const b = await chromium.launch();
  const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const small = (p, sel) => p.evaluate((q) => [...document.querySelectorAll(q + ' *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) > 0 && parseFloat(getComputedStyle(e).fontSize) < 12.5).map((e) => e.className + ':' + e.textContent.slice(0, 20)), sel);
  async function open(ctx, route, lang) {
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/' + route);
    return p;
  }
  const shot = async (p, id, mode) => { if (SHOTS) { await p.waitForTimeout(3600);   // the page's enter animation and any toast are over
    fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, id + '_' + mode + '.png'), fullPage: true }); } };

  async function run(name, opts, lang, mode) {
    const ctx = await b.newContext(opts), el = lang === 'el';
    await ctx.addInitScript(() => { try { localStorage.setItem('sc.welcome.v1', '1'); } catch (e) { /* fine */ } });

    /* ----- Event radar ----- */
    let p = await open(ctx, 'radar', lang);
    await p.waitForSelector('.rd-c', { timeout: 30000 });
    ok(await p.locator('h1').innerText() === (el ? 'Ραντάρ γεγονότων' : 'Event radar'), name + ' radar: the title');
    ok(await p.locator('.rd-c').count() >= 3, name + ' radar: the designed events are found');
    const first = await p.locator('.rd-c').first().innerText();
    ok((el ? /Λάρνακα/ : /Larnaka/).test(first) && (el ? /3 είδη πηγών/ : /3 kinds of source/).test(first), name + ' radar: the event three kinds of source saw is ranked first');
    ok(await p.locator('.rd-c').first().locator('.rd-dot').count() >= 3 && await p.locator('.rd-c').first().locator('.rd-leg li').count() >= 3, name + ' radar: one dot and one named line per source');
    ok((await p.locator('.rd-c').first().locator('.rd-leg').innerText()).match(/\d\d:\d\d/g).length >= 3, name + ' radar: each source has the time it first took part');
    const whole = await p.locator('.t2').innerText();
    ok((el ? /δεν αποδεικνύει ότι έχουν την ίδια αιτία/ : /not proof that they have the same cause/).test(whole), name + ' radar: grouped by time and place, not proof of a cause');
    ok((el ? /περισσότερο από 3 φορές/ : /more than 3 times/).test(whole) && /1 °C/.test(whole) && /100 ppm/.test(whole), name + ' radar: the rule and its numbers are printed');
    ok((el ? /Δύο μοντέλα μετρούν μία φορά/ : /Two models count once/).test(whole) && (el ? /όχι ότι είναι πιο σημαντικό/ : /not that it matters more/).test(whole), name + ' radar: how the order is made, and what it does not mean');
    const pa = p.locator('.rd-c', { hasText: el ? 'Πάφος' : 'Paphos' }).first();
    ok((el ? /1 είδος πηγής/ : /1 kind of source/).test(await pa.innerText()) && await pa.locator('.rd-dot').count() === 2, name + ' radar: two models are two dots but one kind');
    ok(!/\b3[2-5]\.\d{3,}\b|latitude|longitude/i.test(whole), name + ' radar: no position anywhere');
    await p.locator('.rd-h').first().click();
    const more = await p.locator('.rd-more').innerText();
    ok(/3 .*× 10 \+/.test(more) && (el ? /Βαθμός/ : /Score/).test(more), name + ' radar: the open card shows the formula');
    ok(/°C/.test(more) && /→/.test(more) && /m\/s/.test(more), name + ' radar: every move has its numbers and unit');
    ok(await p.locator('.rd-h').first().getAttribute('aria-expanded') === 'true', name + ' radar: the card says it is open');
    ok(await noScroll(p), name + ' radar: no sideways scroll');
    { const sm = await small(p, '.t2'); ok(sm.length === 0, name + ' radar: no text under 12.5px ' + sm.slice(0, 3)); }
    await shot(p, 'radar', mode);
    // keyboard: the card heads are buttons
    await p.locator('.rd-h').nth(1).focus(); await p.keyboard.press('Enter');
    ok(await p.locator('.rd-h').nth(1).getAttribute('aria-expanded') === 'true', name + ' radar: a card opens with the keyboard');

    /* ----- How an event unfolded ----- */
    await p.locator('.rd-h').first().click();
    await p.locator('.rd-more a.t2-go').click();
    await p.waitForSelector('.ep-tb', { timeout: 20000 });
    ok(/#\/episode\?e=larnaka-\d+/.test(p.url()), name + ' episode: its own address');
    ok(await p.locator('h1').innerText() === (el ? 'Πώς εξελίχθηκε ένα γεγονός' : 'How an event unfolded'), name + ' episode: the title');
    ok(await p.locator('.ep-tb tbody tr').count() >= 4 && await p.locator('.ep-tb td.hit').count() >= 4, name + ' episode: one row per source, the marked hours');
    ok(await p.locator('.ep-tb thead th.in').count() >= 2 && await p.locator('.ep-tb thead th').count() >= 6, name + ' episode: hour by hour, with hours before and after');
    const ep = await p.locator('.t2').innerText();
    ok((el ? /δεν αποδεικνύει/ : /not proof/).test(ep) && (el ? /δεν ξέρει γιατί/ : /does not know why/).test(ep), name + ' episode: no cause is claimed');
    ok((el ? /μέσα σε όχημα/ : /inside a vehicle/).test(ep) && (el ? /δεν πέρασαν τον κανόνα/ : /did not pass the rule/).test(ep), name + ' episode: vehicle rows are labelled and calm sources are named');
    ok(await p.locator('.ep-steps li').count() >= 4, name + ' episode: what each source saw, in order');
    ok(await noScroll(p), name + ' episode: no sideways scroll of the page');
    ok(await p.locator('.ep-scroll').getAttribute('tabindex') === '0', name + ' episode: the table can be scrolled with the keyboard');
    await shot(p, 'episode', mode);
    await p.goto(BASE + '/#/episode?e=nope-1'); await p.waitForSelector('.ep-pick');
    ok((el ? /δεν είναι πια/ : /no longer in the saved day/).test(await p.locator('.t2').innerText()) && await p.locator('.ep-pick a').count() >= 3, name + ' episode: an unknown id offers the list');
    ok(p.errs.length === 0, name + ' radar and episode: no script errors ' + p.errs.join(' | '));
    await p.close();

    /* ----- My watch ----- */
    p = await open(ctx, 'watch', lang);
    await p.waitForSelector('#wa-var:not([disabled])', { timeout: 20000 });
    ok(await p.locator('h1').innerText() === (el ? 'Η παρακολούθησή μου' : 'My watch'), name + ' watch: the title');
    ok(await p.locator('.t2 textarea').count() === 0 && await p.locator('.wa-form input[type=text]').count() === 0, name + ' watch: the rule has no free text');
    ok(await p.locator('.wa-btns .nm-btn--primary').isDisabled(), name + ' watch: saving waits for a test');
    await p.selectOption('#wa-var', 'temperature');
    const cmp = await getJson('/layers/api/compare?city=larnaka&variable=temperature');
    const off = cmp.series.find((s) => s.group === 'official' && s.source === 'cydom-stations'), vals = off.points.map((x) => x[1]);
    const mid = Math.round(((Math.min(...vals) + Math.max(...vals)) / 2) * 10) / 10;
    await p.locator('.wa-btns .nm-btn').first().click();
    ok((await p.locator('.wa-msg').innerText()).length > 5, name + ' watch: a missing number is asked for');
    await p.fill('#wa-val', String(mid)); await p.selectOption('#wa-dur', '30');
    await p.locator('.wa-btns .nm-btn').first().click();
    await p.waitForSelector('.wa-say');
    ok((el ? /θα είχε ενεργοποιηθεί \d+ φορ/ : /would have fired \d+ time/).test(await p.locator('.wa-say').innerText()), name + ' watch: the test says when it would have fired');
    ok(await p.locator('.wa-fires li').count() >= 1 && await p.locator('.wa-chart .wa-on').count() >= 1 && await p.locator('.wa-chart .wa-th').count() === 1, name + ' watch: the firings are listed and drawn');
    ok((el ? /Σταθμοί Μετεωρολογικής/ : /Met Office stations/).test(await p.locator('.wa-res').innerText()) && /°C/.test(await p.locator('.wa-res').innerText()), name + ' watch: the layer and the unit of the test are named');
    ok(!(await p.locator('.wa-btns .nm-btn--primary').isDisabled()), name + ' watch: saving opens after the test');
    await p.fill('#wa-val', String(mid + 1));
    ok(await p.locator('.wa-btns .nm-btn--primary').isDisabled(), name + ' watch: a changed rule must be tested again');
    await p.fill('#wa-val', String(mid)); await p.locator('.wa-btns .nm-btn').first().click(); await p.waitForSelector('.wa-say');
    const sent = [];
    p.on('request', (r) => { if (r.method() !== 'GET') sent.push([new URL(r.url()).pathname, r.postData() || '']); });
    await p.fill('#wa-title', 'call me 99 123456'); await p.locator('.wa-btns .nm-btn--primary').click();
    await p.waitForFunction(() => document.querySelector('.wa-msg').textContent.length > 5);
    ok(await p.locator('.wa-c').count() === 0 && await p.evaluate(() => localStorage.getItem('sc.watch.v1')) == null, name + ' watch: a title with a phone number is refused and nothing is kept');
    await p.fill('#wa-title', el ? 'Ζεστά απογεύματα' : 'Hot afternoons'); await p.locator('.wa-btns .nm-btn--primary').click();
    await p.waitForSelector('.wa-c');
    ok((await p.locator('.wa-c b').innerText()) === (el ? 'Ζεστά απογεύματα' : 'Hot afternoons'), name + ' watch: the rule is saved with its checked title');
    ok(sent.length === 2 && sent.every(([u, body]) => u === '/watch/api/title' && Object.keys(JSON.parse(body)).join() === 'title'), name + ' watch: only the title went to the server, never the rule');
    const kept = JSON.parse(await p.evaluate(() => localStorage.getItem('sc.watch.v1')));
    ok(kept.length === 1 && kept[0].city === 'larnaka' && kept[0].variable === 'temperature' && kept[0].value === mid && kept[0].mins === 30, name + ' watch: the rule lives in this browser');
    await p.waitForFunction(() => /\d\d:\d\d/.test(document.querySelector('.wa-st').textContent), null, { timeout: 15000 });
    const st = await p.locator('.wa-st').innerText();
    ok((el ? /Θα ενεργοποιούνταν τώρα|Ήσυχα τώρα/ : /Would fire now|Quiet now/).test(st) && /°C/.test(st) && (el ? /από: / : /from /).test(st), name + ' watch: the newest reading is checked, with unit, time and layer');
    const aside = await p.locator('.t2-side').innerText();
    ok((el ? /δεν στέλνει ποτέ ειδοποίηση/ : /never sends a notification/).test(aside) && (el ? /Μόνο σε αυτόν τον περιηγητή/ : /Only in this browser/).test(aside) && (el ? /Δεν υπάρχει λογαριασμός/ : /no account/).test(aside), name + ' watch: it says where rules live and that nothing is sent');
    ok(await noScroll(p), name + ' watch: no sideways scroll');
    { const sm = await small(p, '.t2'); ok(sm.length === 0, name + ' watch: no text under 12.5px ' + sm.slice(0, 3)); }
    await shot(p, 'watch', mode);
    await p.reload(); await p.waitForSelector('.wa-c');
    ok(await p.locator('.wa-c').count() === 1, name + ' watch: the rule is still there after a reload');
    // a rule file somebody tampered with is not trusted
    await p.evaluate(() => localStorage.setItem('sc.watch.v1', JSON.stringify([{ id: 'x', city: 'atlantis', variable: 'temperature', op: 'above', value: 1, mins: 0 }, { id: 'y', city: 'larnaka', variable: '<img src=x onerror=alert(1)>', op: 'above', value: 1, mins: 0 }, { id: 'z', city: 'paphos', variable: 'co2', op: 'below', value: 5000, mins: 0, title: '<b>bold</b>', label: ['CO2', 'CO2'], unit: 'ppm' }])));
    await p.reload(); await p.waitForSelector('.wa-c');
    ok(await p.locator('.wa-c').count() === 1 && await p.locator('.wa-c b b').count() === 0 && (await p.locator('.wa-c b').innerText()) === '<b>bold</b>', name + ' watch: bad saved rules are dropped and a title is only ever text');
    await p.waitForFunction(() => /\d\d:\d\d/.test(document.querySelector('.wa-st').textContent), null, { timeout: 15000 });
    ok((el ? /Θα ενεργοποιούνταν τώρα/ : /Would fire now/).test(await p.locator('.wa-st').innerText()) && await p.locator('.wa-c.on').count() === 1, name + ' watch: a rule that holds now says "would fire now"');
    await p.locator('.wa-del').click();
    ok(await p.locator('.wa-c').count() === 0 && (await p.evaluate(() => localStorage.getItem('sc.watch.v1'))) === '[]', name + ' watch: a rule can be deleted');
    ok(p.errs.length === 0, name + ' watch: no script errors ' + p.errs.join(' | '));
    await p.close();

    /* ----- Morning brief ----- */
    p = await open(ctx, 'brief?city=larnaka', lang);
    await p.waitForSelector('.bf-row', { timeout: 20000 });
    ok(await p.locator('h1').innerText() === (el ? 'Πρωινή ενημέρωση' : 'Morning brief'), name + ' brief: the title');
    ok(await p.locator('.bf-row').count() === 5, name + ' brief: five lines');
    const rows = await p.locator('.bf-row').allInnerTexts();
    ok(/°C/.test(rows[0]) && (el ? /12 ώρες νωρίτερα/ : /12 hours earlier/).test(rows[0]) && (el ? /Σταθμοί Μετεωρολογικής/ : /Met Office stations/).test(rows[0]), name + ' brief: the air now and against 12 hours earlier, with its layer');
    ok(/m\/s/.test(rows[1]) && /\d\d:\d\d/.test(rows[1]), name + ' brief: the wind with unit and time');
    ok(await p.locator('.bf-row').nth(2).evaluate((e) => e.classList.contains('none')) && (el ? /Κανένα στρώμα/ : /No layer has saved/).test(rows[2]), name + ' brief: a missing sea reading says so');
    ok(/ppm/.test(rows[3]) && (el ? /στις τάξεις μας \(μέσα\)/ : /in our classrooms \(indoors\)/).test(rows[3]), name + ' brief: our own sensors, and where they are');
    ok((el ? /δεν συμφωνούν|έχει σωπάσει|Τίποτα δεν ξεχωρίζει/ : /do not agree|gone quiet|Nothing stands out/).test(rows[4]) && (el ? /δεν διαβάστηκε τώρα, άρα μπορεί να υπάρχει προειδοποίηση/ : /could not be read just now, so a warning may exist/).test(rows[4]), name + ' brief: one thing to check, and the unread warnings page is admitted');
    ok(await p.locator('.bf-row:not(.none) .bf-meta').count() === 4 && (await p.locator('.bf-row:not(.none) .bf-meta').allInnerTexts()).every((t) => (el ? /ώρα: .*\d\d:\d\d.*στρώμα: / : /time: .*\d\d:\d\d.*layer: /).test(t)), name + ' brief: every line with a number has its time and layer');
    ok((el ? /Καμία ΤΝ δεν το έγραψε/ : /No AI wrote this/).test(await p.locator('.bf-foot').innerText()), name + ' brief: says it is made from templates');
    await p.locator('.t2-chip').nth(3).click();
    ok((el ? /μέσα στα λεωφορεία μας \(όχι τάξη/ : /inside our buses \(not a classroom/).test(await p.locator('.bf-row').nth(3).innerText()) && /°C/.test(await p.locator('.bf-row').nth(2).innerText()), name + ' brief: another school, where the sensors are on buses');
    ok(await noScroll(p), name + ' brief: no sideways scroll');
    { const sm = await small(p, '.t2'); ok(sm.length === 0, name + ' brief: no text under 12.5px ' + sm.slice(0, 3)); }
    await p.locator('.t2-chip').first().click();
    await shot(p, 'brief', mode);
    await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await p.locator('.page-head button', { hasText: el ? 'Εκτύπωση' : 'Print' }).click();
    ok(await p.evaluate(() => window.__printed) === 1, name + ' brief: the print button uses the browser print');
    await p.emulateMedia({ media: 'print' });
    ok(await p.evaluate(() => getComputedStyle(document.getElementById('side')).display === 'none' && getComputedStyle(document.querySelector('.t2-chips')).display === 'none' && getComputedStyle(document.querySelector('.page-head')).display === 'none' && getComputedStyle(document.querySelector('.bf-sheet')).display !== 'none'), name + ' brief: the print sheet has no menu and no buttons');
    ok(await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.bf-row p')).color.match(/\d+/g).map(Number); return c[0] + c[1] + c[2] < 200; }), name + ' brief: dark text on the print sheet');
    await p.emulateMedia({ media: 'screen' });
    ok(p.errs.length === 0, name + ' brief: no script errors ' + p.errs.join(' | '));
    await p.close();
    // an official warning on the page comes first
    p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.route('**/api/dom/page?name=warnings', (r) => r.fulfill({ json: { text: 'Weather warnings\nYellow warning for thunderstorms\nValid from 10:00 to 18:00', fetched: new Date().toISOString(), url: 'https://example.invalid/', images: [] } }));
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/brief?city=limassol'); await p.waitForSelector('.bf-row');
    ok((el ? /κίτρινη προειδοποίηση/ : /yellow warning/i).test(await p.locator('.bf-row').nth(4).innerText()) && await p.locator('.bf-row').nth(4).locator('a[href="#/warnings"]').count() === 1, name + ' brief: a warning on the Met Office page is the thing to check');
    await p.close();
    p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.route('**/api/dom/page?name=warnings', (r) => r.fulfill({ json: { text: 'Weather warnings\nThere are no warnings in force.', fetched: new Date().toISOString(), url: '', images: [] } }));
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/brief?city=limassol'); await p.waitForSelector('.bf-row');
    ok((el ? /Καμία προειδοποίηση στη σελίδα/ : /No warning on the Met Office page/).test(await p.locator('.bf-row').nth(4).innerText()), name + ' brief: a calm warnings page is said to be calm');
    await p.close();

    /* ----- Ventilation coach ----- */
    p = await open(ctx, 'vent', lang);
    await p.waitForSelector('.ve-c', { timeout: 20000 });
    ok(await p.locator('h1').innerText() === (el ? 'Οδηγός αερισμού' : 'Ventilation coach'), name + ' vent: the title');
    ok(await p.locator('.ve-c').count() === 4 && await p.locator('.ve-c.room').count() === 1 && await p.locator('.ve-c.veh').count() === 3, name + ' vent: one school with classroom data, three with vehicles only');
    const room = await p.locator('.ve-c.room').innerText();
    ok((el ? /Λάρνακα/ : /Larnaka/).test(room) && /\d+%/.test(room) && /1700 ppm/.test(room) && (el ? /περίπου 1000 ppm/ : /about 1000 ppm/).test(room), name + ' vent: the shares above the levels and the peak, with units');
    ok(await p.locator('.ve-c.room .ve-cell').count() >= 20 && await p.locator('.ve-c.room .ve-cell.now').count() >= 1 && await p.locator('.ve-c.room .ve-cell.air').count() >= 1 && await p.locator('.ve-c.room .ve-win li').count() >= 1, name + ' vent: the "open the windows" timeline');
    ok((el ? /όχι πρόβλεψη/ : /not a forecast/).test(room) && (el ? /μέσος όρος των αισθητήρων τάξης/ : /average of the classroom sensors/).test(room), name + ' vent: what the classroom number is and is not');
    const veh = await p.locator('.ve-c.veh').first().innerText();
    ok((el ? /όχι τάξη/ : /not a classroom/).test(veh) && /ppm/.test(veh) && !/\d+%/.test(veh) && (el ? /δεν εφαρμόζονται σε όχημα/ : /not applied to a vehicle/).test(veh), name + ' vent: vehicle air is named as such and gets no classroom numbers');
    const vs = await p.locator('.t2-side').innerText();
    ok((el ? /Δεν είναι όρια υγείας ούτε διάγνωση/ : /not health limits and not a diagnosis/).test(vs) && (el ? /δεν δίνει ιατρικές συμβουλές/ : /no medical advice/).test(vs) && /1500 ppm/.test(vs), name + ' vent: the levels are guidance, not a diagnosis');
    ok((el ? /δεν είναι κατάταξη/ : /not a ranking/).test(vs), name + ' vent: schools are not ranked');
    ok(await noScroll(p), name + ' vent: no sideways scroll');
    { const sm = await small(p, '.t2'); ok(sm.length === 0, name + ' vent: no text under 12.5px ' + sm.slice(0, 3)); }
    await shot(p, 'vent', mode);
    ok(p.errs.length === 0, name + ' vent: no script errors ' + p.errs.join(' | '));
    await p.close();
    // vehicles only (what the plain demo has): said plainly at the top
    p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.route('**/layers/api/replay', async (r) => { const res = await r.fetch(), j = await res.json(); for (const c of Object.values(j.cities)) if (c.own && c.own.source === 'sensecap-classrooms') c.own = null; await r.fulfill({ json: j }); });
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/vent'); await p.waitForSelector('.ve-c');
    ok(await p.locator('.ve-c.room').count() === 0 && await p.locator('.ve-banner.veh').count() === 1 && (el ? /έρχεται από λεωφορεία και αυτοκίνητα, όχι από τάξεις/ : /comes from buses and cars, not from classrooms/).test(await p.locator('.ve-banner').innerText()), name + ' vent: with only buses and cars the page says so plainly');
    ok(!/\d+%/.test(await p.locator('.t2-main').innerText()), name + ' vent: no classroom share is shown without a classroom');
    if (mode === 'desk' && SHOTS) await p.screenshot({ path: path.join(SHOTS, 'vent_vehicles_only_desk.png'), fullPage: true });
    await p.close();

    /* ----- empty and error states ----- */
    for (const id of ['radar', 'episode', 'brief', 'vent']) {
      p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
      await p.route('**/layers/api/**', (r) => r.fulfill({ status: 503, json: { error: 'down for the test' } }));
      await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/' + id);
      await p.waitForSelector('.t2-err', { timeout: 15000 });
      ok((await p.locator('.t2').innerText()).length > 20 && p.errs.length === 0, name + ' ' + id + ': a calm message when the data cannot be loaded');
      await p.close();
    }
    p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.route('**/layers/api/compare**', (r) => r.fulfill({ status: 503, json: { error: 'down for the test' } }));
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/watch'); await p.waitForSelector('.wa-msg:not(:empty)', { timeout: 15000 });
    ok(await p.locator('.wa-btns .nm-btn').first().isDisabled() && p.errs.length === 0, name + ' watch: without the measurements nothing can be tested, and it says so');
    await p.close();
    p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.route('**/layers/api/compare**', (r) => r.fulfill({ json: { at: Date.now(), every: 300000, variable: null, variables: [], series: [] } }));
    await p.route('**/layers/api/replay', (r) => r.fulfill({ json: { at: Date.now(), every: 300000, times: [], cities: { larnaka: { own: null, air: null, wind: null, sea: null }, lefkosia: { own: null, air: null, wind: null, sea: null }, limassol: { own: null, air: null, wind: null, sea: null }, paphos: { own: null, air: null, wind: null, sea: null } } } }));
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/radar'); await p.waitForFunction(() => /saved yet|αποθηκευτεί τίποτα/.test((document.querySelector('.t2-empty') || {}).textContent || ''), null, { timeout: 15000 });
    ok(await p.locator('.rd-c').count() === 0, name + ' radar: an empty log is said to be empty');
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/vent'); await p.waitForSelector('.ve-c.none');
    ok(await p.locator('.ve-c.none').count() === 4 && await p.locator('.ve-banner').count() === 1, name + ' vent: no CO2 at all is said for every school');
    await p.goto(BASE + '/' + (lang ? '?lang=' + lang : '') + '#/brief'); await p.waitForSelector('.bf-row');
    ok(await p.locator('.bf-row.none').count() >= 4 && (el ? /Δεν έχει αποθηκευτεί τίποτα ακόμη/ : /Nothing has been saved yet/).test(await p.locator('.bf-sheet').innerText()), name + ' brief: an empty log gives five honest lines');
    ok(p.errs.length === 0, name + ' empty states: no script errors ' + p.errs.join(' | '));
    await p.close();
    await ctx.close();
  }
  await run('desktop', { viewport: { width: 1366, height: 900 } }, null, 'desk');
  await run('phone/el', devices['iPhone 13'], 'el', 'phone');

  /* ----- the rules themselves, on made-up numbers (run inside the page, where the code lives) ----- */
  {
    const ctx = await b.newContext(), p = await ctx.newPage();
    for (const [id, core] of [['radar', 'radar'], ['watch', 'watchCore'], ['brief', 'briefCore'], ['vent', 'ventCore']]) { await p.goto(BASE + '/#/' + id); await p.waitForFunction((c) => window.SC && SC[c], core); }
    const r = await p.evaluate(() => {
      const H = 3600000, t0 = Math.floor(Date.now() / H) * H - 20 * H;
      const mk = (city, source, variable, kind, env, f) => ({ city, source, variable, unit: 'u', env, label: [variable, variable], name: [source, source], kind, points: Array.from({ length: 20 }, (_, i) => [t0 + i * H + 60000, f(i)]) });
      const wave = (i) => 20 + (i % 2) * 0.2;
      const data = { live: { rivers: [{ variable: 'temperature', cities: { limassol: { tolerance: 2 }, paphos: { tolerance: 2 } } }] }, series: [
        mk('larnaka', 'st', 'temperature', 'official', 'outdoor', (i) => wave(i) + (i >= 10 ? 5 : 0)),
        mk('larnaka', 'm1', 'temperature', 'model', 'outdoor', (i) => wave(i) + (i >= 10 ? 4 : 0)),
        mk('larnaka', 'm2', 'temperature', 'model', 'outdoor', (i) => wave(i) + (i >= 11 ? 4 : 0)),
        mk('larnaka', 'bus', 'temperature', 'own', 'vehicle', (i) => wave(i) + (i >= 10 ? 6 : 0)),
        mk('larnaka', 'calm', 'temperature', 'own', 'vehicle', wave),
        mk('larnaka', 'tiny', 'temperature', 'own', 'vehicle', (i) => 20 + (i === 5 ? 0.4 : 0)),
        mk('lefkosia', 'bus', 'co2', 'own', 'vehicle', (i) => 500 + (i === 18 ? 300 : 0)),
        mk('limassol', 'a', 'temperature', 'official', 'outdoor', () => 20), mk('limassol', 'b', 'temperature', 'model', 'outdoor', (i) => 20 + Math.min(3, Math.max(0, (i - 8) * 0.6))),
        mk('limassol', 'room', 'temperature', 'own', 'indoor', () => 30),
        mk('paphos', 'a', 'temperature', 'official', 'outdoor', () => 20), mk('paphos', 'b', 'temperature', 'model', 'outdoor', () => 25),
      ] };
      const res = SC.radar.detect(data), ev = res.events;
      const W = SC.watchCore, m = 60000, pts = [[0, 1], [5 * m, 5], [10 * m, 5], [15 * m, 5], [20 * m, 1], [25 * m, 5], [60 * m, 5], [65 * m, 5]];
      const V = SC.ventCore, B = SC.briefCore;
      const sm = V.summary([[0, 500], [10 * m, 1200], [20 * m, 1600], [30 * m, 900], [40 * m, 900]], 300000);
      const times = Array.from({ length: 25 }, (_, i) => i * H);
      return {
        order: ev.map((e) => e.city + ':' + e.kinds.length + ':' + e.sources.length + ':' + e.signals.map((s) => s.type).join('')),
        scores: ev.map((e) => e.score), larnaka: ev.find((e) => e.city === 'larnaka'),
        hourly: res.plan.hourly, judged: res.judged,
        fires: W.evaluate(pts, { op: 'above', value: 3, mins: 10 }, 300000).fires.map((f) => [f.start / m, f.fired / m, f.end / m]),
        once: W.evaluate(pts, { op: 'above', value: 3, mins: 0 }, 300000).fires.length, below: W.evaluate(pts, { op: 'below', value: 3, mins: 0 }, 300000).fires.length,
        pick: W.pick({ series: [{ source: 'z', group: 'own', points: [[1, 1]] }, { source: 'm', group: 'model', points: [[1, 1]] }, { source: 'o', group: 'official', points: [] }] }).source,
        sm: [sm.covered / m, sm.share1, sm.share2, sm.peak[1]],
        win: V.windows(V.hours(Array.from({ length: 80 }, (_, i) => [t0 + i * 6 * m, i >= 30 && i < 45 ? 1300 : 600])).cells).length,
        nb: B.nowAndBefore({ values: times.map((_, i) => (i === 24 ? null : 10 + i)) }, times), short: B.nowAndBefore({ values: [1, 2, 3] }, [0, H, 2 * H]).before,
        calm: [B.isCalm('Weather warnings\nNo warnings in force'), B.isCalm('Yellow warning for rain'), B.levelOf('Orange warning for wind')],
      };
    });
    ok(r.order[0] === 'larnaka:3:4:movemovemovemove', 'rule: four sources of three kinds (two models count once) in neighbouring hours are one event, ranked first (' + r.order.join(' ') + ')');
    ok(r.larnaka.i1 - r.larnaka.i0 === 1 && !r.order.join(' ').includes('tiny') && r.larnaka.sources.every((s) => s.source !== 'calm' && s.source !== 'tiny'), 'rule: a steady source and a wiggle under the floor are not events');
    ok(r.order.includes('lefkosia:1:1:movemove'), 'rule: a spike up and back down is one event of one source');
    ok(r.order.filter((o) => o.startsWith('limassol')).join() === 'limassol:2:2:differ', 'rule: a slow drift apart is "started to differ", and the indoor row is left out');
    ok(!r.order.some((o) => o.startsWith('paphos')), 'rule: sources that differed all day never "started" to differ');
    ok(r.scores[0] > 30 && r.scores[0] <= 35 && r.scores.every((s, i) => i === 0 || s <= r.scores[i - 1]) && r.hourly && r.judged === 12, 'rule: score = 10 per kind + up to 5 for recency, highest first');
    ok(JSON.stringify(r.fires) === '[[5,15,15]]' && r.once === 3 && r.below === 2, 'watch rule: fires once per stretch, a long gap ends a stretch (' + JSON.stringify(r.fires) + ')');
    ok(r.pick === 'm', 'watch rule: official first, then a model, then our own sensors, skipping an empty series');
    ok(r.sm[0] === 40 && r.sm[1] === 0.5 && r.sm[2] === 0.25 && r.sm[3] === 1600, 'vent: shares of the saved time above 1000 and 1500 ppm, and the peak (' + r.sm.join(' ') + ')');
    ok(r.win === 1, 'vent: one run of hours above the level is one "open the windows" window');
    ok(r.nb.v === 33 && r.nb.before.v === 21 && r.nb.lo === 10 && r.short === null, 'brief: the newest value, the one 12 hours earlier, and none when the log is too short');
    ok(r.calm[0] === true && r.calm[1] === false && r.calm[2] === 2, 'brief: a warnings page is read as calm or not, with its level');
    await ctx.close();
  }
  await b.close();
  await S.stop();
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
