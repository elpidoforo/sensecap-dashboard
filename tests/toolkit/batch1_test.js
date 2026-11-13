'use strict';
/* Toolkit, batch 1 (changed, versus, school360, bubbles, toolkit) in a real browser (Playwright, which is not a dependency of the site).
   Run: node tests/toolkit/batch1_test.js
   Two real servers with demo data and no outside network:
     port 3981  a saved day of about ten hours is put in the data folder first (the same file the server writes, layers-pulse.json)
     port 3982  an empty data folder, so the log has only just started ("the log is still filling")
   Set SHOTS=<folder> to also save <id>_desk.png and <id>_phone.png there. */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { chromium, devices } = require('playwright');
const PORT = 3981, PORT2 = 3982, BASE = `http://127.0.0.1:${PORT}`, BASE2 = `http://127.0.0.1:${PORT2}`;
const SHOTS = process.env.SHOTS || '';
const IDS = ['changed', 'versus', 'school360', 'bubbles', 'toolkit'];
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };

// A saved day: one point every 5 minutes for 10 hours, in the keys the server logs ("city|layer|measurement").
// These are test numbers on a demo server, shaped like a day (a slow wave), with one gap so "came back" has something to find.
function seed(dir) {
  const now = Date.now(), STEP = 300000, N = 120, series = {};
  const wave = (base, amp, phase) => (i) => Math.round((base + amp * Math.sin((i / N) * Math.PI * 1.6 + phase)) * 100) / 100;
  const put = (key, fn, skip) => { series[key] = []; for (let i = 0; i <= N; i++) { const t = now - 90000 - (N - i) * STEP; if (skip && skip(now - t)) continue; series[key].push([t, fn(i)]); } };
  ['larnaka', 'lefkosia', 'limassol'].forEach((c, j) => { put(c + '|cydom-stations|temperature', wave(22 + j, 5, j)); put(c + '|cydom-stations|wind_speed', wave(4, 2.5, j + 1)); });
  put('paphos|openmeteo-weather|temperature', wave(23, 3, 2)); put('paphos|openmeteo-weather|wind_speed', wave(5, 2, 0.5));
  put('lefkosia|openmeteo-marine|sea_surface_temperature', wave(24.2, 0.6, 0)); put('paphos|openmeteo-marine|sea_surface_temperature', wave(24.9, 0.5, 1));
  put('limassol|openmeteo-marine|sea_surface_temperature', wave(24.3, 0.6, 2), (age) => age > 2.5 * 3600000 && age < 4 * 3600000);   // a gap of 90 minutes
  ['larnaka', 'lefkosia', 'limassol', 'paphos'].forEach((c, j) => put(c + '|sensecap-buses|co2', wave(520 + 20 * j, 110, j * 0.7)));
  fs.writeFileSync(path.join(dir, 'layers-pulse.json'), JSON.stringify({ at: now, series }));
}
// Other test runs on the same machine may stop every "node server.js" they find. A server that stops is started again with the same
// data folder (the saved day is on disk), and a page that could not be opened is opened again.
let closing = false;
process.on('exit', () => { closing = true; });
function serve(port, dir, pulse) {
  const env = { ...process.env, PORT: String(port), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dir, ANTHROPIC_API_KEY: '', LAYERS_PULSE_SECONDS: String(pulse), LAYERS_PULSE_FIRST_MS: '300' };
  const log = fs.openSync(path.join(dir, 'server.log'), 'a');
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: ['ignore', log, log] });
  srv.on('exit', (code, sig) => { if (closing) return; console.log('note: the server on port ' + port + ' was stopped from outside (code ' + code + ', signal ' + sig + '); starting it again. Log: ' + path.join(dir, 'server.log')); serve(port, dir, pulse); });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
}
const up = async (base) => { for (let i = 0; i < 100; i++) { try { await fetch(base + '/layers/api/register'); return; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } } };
const READY = { changed: '.ch-differ', versus: '.vs-now', school360: '.s3-differ', bubbles: '.bb-table, .bb-filling', toolkit: '.tk-item' };

(async () => {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'tk1-a-')), dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'tk1-b-'));
  seed(dirA);
  serve(PORT, dirA, 30); serve(PORT2, dirB, 5);
  await up(BASE); await up(BASE2);
  await new Promise((r) => setTimeout(r, 2500));   // the first pulse
  const b = await chromium.launch();
  const go = async (p, url) => { for (let i = 0; ; i++) { try { await p.goto('about:blank'); await p.goto(url); return; } catch (e) { if (i >= 3 || !/ERR_CONNECTION|ERR_EMPTY|ERR_ABORTED/.test(String(e))) throw e; await new Promise((r) => setTimeout(r, 1500)); await up(new URL(url).origin); } } };
  const open = async (p, base, id, lang, q) => { await go(p, base + '/' + (lang ? '?lang=' + lang : '') + '#/' + id + (q || '')); await p.waitForSelector(READY[id], { timeout: 20000 }); await p.waitForTimeout(250); };
  const noSide = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const smallest = (p) => p.evaluate(() => { let m = 99; document.querySelectorAll('#view .t1 *').forEach((e) => { if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return; if (e.closest('.t1-sr') || e.closest('thead') && getComputedStyle(e.closest('thead')).position === 'absolute') return; m = Math.min(m, parseFloat(getComputedStyle(e).fontSize)); }); return m; });
  const text = (p, sel) => p.locator(sel).first().innerText();

  /* ---------- the saved day and the API shapes the pages lean on ---------- */
  const live = await (await fetch(BASE + '/layers/api/live')).json(), replay = await (await fetch(BASE + '/layers/api/replay')).json();
  ok(replay.times.length > 100 && replay.times[replay.times.length - 1] - replay.times[0] > 9 * 3600000, 'api: the seeded day is about ten hours long (' + replay.times.length + ' moments)');
  ok(['own', 'air', 'wind', 'sea'].every((k) => k in replay.cities.lefkosia) && replay.cities.larnaka.sea === null, 'api: replay keeps own, air, wind, sea per city, and Larnaka has no sea line');
  ok(Array.isArray(live.layers) && live.layers.some((l) => l.state === 'live') && Array.isArray(live.rivers) && live.cities.paphos.rows.length > 3, 'api: live has layers, rivers and rows per city');
  ok(live.cities.larnaka.rows.every((r) => 'env' in r && 'ageMin' in r && 'unit' in r), 'api: every live row has its place, age and unit');

  async function run(name, opts, lang) {
    const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    const el = lang === 'el', phone = Boolean(opts.isMobile);
    const shot = async (id) => { if (SHOTS) { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(SHOTS, id + (phone ? '_phone' : '_desk') + '.png'), fullPage: true }); } };

    /* ----- changed ----- */
    await open(p, BASE, 'changed', lang);
    ok((await text(p, '#view h1')) === (el ? 'Τι άλλαξε από χθες' : 'What changed since yesterday'), name + ' changed: the title');
    ok(await p.locator('.ch-city').count() === 4 && await p.locator('.ch-city .ch-li').count() === 16, name + ' changed: four cities with four lines each');
    const li = await text(p, '.ch-city[data-c="lefkosia"] .ch-li[data-k="air"]');
    ok(/°C/.test(li) && (li.match(/\d{1,2}:\d{2}/g) || []).length >= 3, name + ' changed: a line has its unit and the times of newest, oldest and an hour ago');
    ok(new RegExp(el ? 'Στρώμα: ' : 'Layer: ').test(li) && /\S/.test(li.split(el ? 'Στρώμα: ' : 'Layer: ')[1] || ''), name + ' changed: a line names its layer');
    ok(await p.locator('.ch-city .ch-d.up, .ch-city .ch-d.down').count() >= 8, name + ' changed: changes are marked up or down');
    ok(await p.locator('.ch-city[data-c="larnaka"] .ch-li.none[data-k="sea"]').count() === 1, name + ' changed: a missing line says nothing is saved (Larnaka, sea)');
    ok(await p.locator('.ch-filling').count() === 0, name + ' changed: a ten-hour day is not called "still filling"');
    ok(/came back|επέστρεψε/.test(await text(p, '.ch-gaps')) && /Limassol|Λεμεσός/.test(await text(p, '.ch-gaps')), name + ' changed: the gap in the saved day is found and said to have come back');
    ok(await p.locator('.ch-speaking').count() === 1 && /\d/.test(await text(p, '.ch-speaking summary')), name + ' changed: layers speaking now are counted');
    ok(await p.locator('.ch-never').count() === 1, name + ' changed: layers with no reading are listed apart, not called "went quiet"');
    const nd = await p.locator('.ch-differ .t1-line').count();
    ok(nd >= 3, name + ' changed: sources that differ are listed (' + nd + ')');
    const dl = await text(p, '.ch-differ .t1-line');
    ok(/°C|%|m\/s|hPa/.test(dl) && /\d{1,2}:\d{2}/.test(dl) && new RegExp(el ? 'Στρώματα: ' : 'Layers: ').test(dl), name + ' changed: a difference has its unit, time and layers');
    ok(/not a mistake|δεν είναι από μόνη της λάθος/.test(await text(p, '.ch-differ')) && /better or worse|καλύτερα ή χειρότερα/.test(await text(p, '.t1')), name + ' changed: the honesty lines are there');
    ok(await p.locator('.ch-differ a[href="#/layers"]').count() === 1, name + ' changed: a link to the Data layers page');
    ok(await noSide(p), name + ' changed: no sideways scroll'); ok(await smallest(p) >= 12.5, name + ' changed: no text under 12.5px (' + await smallest(p) + ')');
    await shot('changed');

    /* ----- versus ----- */
    await open(p, BASE, 'versus', lang);
    ok((await text(p, '#view h1')) === (el ? 'Πόλη με πόλη' : 'City vs city'), name + ' versus: the title');
    ok(await p.locator('.vs-day .vs-row').count() === 4 && await p.locator('.vs-day .vs-col').count() === 8, name + ' versus: four measures, two cities each');
    const col = await text(p, '.vs-day .vs-row[data-k="air"] .vs-col');
    ok(/°C/.test(col) && /\d{1,2}:\d{2}/.test(col) && col.split('·').length >= 3, name + ' versus: a value has its unit, time and layer');
    ok(await p.locator('.vs-day .vs-row[data-k="air"] .t1-spark path.ln').count() === 2, name + ' versus: a small line of the saved day for each city');
    ok(await p.locator('.vs-day .vs-row[data-k="sea"] .vs-col.none').count() === 1 && /No gap is given|Δεν δίνεται απόσταση/.test(await text(p, '.vs-day .vs-row[data-k="sea"] .vs-foot')), name + ' versus: with one side missing no gap is given');
    ok(/No winner|δεν υπάρχει νικητής/.test(await text(p, '.vs-honest')) && /different kinds of sources|διαφορετικά είδη πηγών/.test(await text(p, '.vs-honest')), name + ' versus: says there is no winner and that sources can be of different kinds');
    ok(!/\b(better|worse|best|worst|wins?|winner is)\b|καλύτερη πόλη|χειρότερ/i.test((await text(p, '.t1')).replace(/No winner here\./, '')), name + ' versus: no better, worse or winner anywhere');
    const nShared = await p.locator('.vs-now .vs-row').count();
    ok(nShared >= 6, name + ' versus: every shared live measurement is listed (' + nShared + ')');
    ok(await p.locator('.vs-now .vs-row[data-env="indoor"]').count() === 0 || await p.$$eval('.vs-now .vs-row', (r) => r.every((x) => x.dataset.env)), name + ' versus: every shared row is of one kind of place');
    ok(await p.$$eval('.vs-now .vs-row', (rows) => rows.every((r) => r.dataset.env && r.querySelectorAll('.vs-col').length === 2)), name + ' versus: indoor, outdoor and vehicle readings are kept in separate rows');
    ok(/indoor reading is never|μέσα σε κτίριο δεν μπαίνει ποτέ/.test(await text(p, '.vs-now')), name + ' versus: says indoor is never set against outdoor');
    ok(await p.locator('.vs-links a[href="#/layers"]').count() === 1, name + ' versus: a link to the Data layers page');
    await p.selectOption('#vs-pick-b', 'paphos');
    ok(/Paphos|Πάφος/.test(await p.locator('.vs-day .vs-row[data-k="air"] .vs-col').nth(1).innerText()), name + ' versus: another city can be picked');
    ok(await p.evaluate(() => document.querySelector('#vs-pick-a option[value="paphos"]').disabled && document.querySelector('#vs-pick-b option[value="larnaka"]').disabled), name + ' versus: a city cannot be set against itself');
    ok(/different kinds of sources: |διαφορετικά είδη πηγών: /.test(await text(p, '.vs-day .vs-row[data-k="air"] .vs-foot')), name + ' versus: a station against a model is called out');
    await p.locator('.vs-swap').click();
    ok(/Paphos|Πάφος/.test(await text(p, '.vs-day .vs-row[data-k="air"] .vs-col')), name + ' versus: the sides can be swapped');
    ok(await noSide(p), name + ' versus: no sideways scroll'); ok(await smallest(p) >= 12.5, name + ' versus: no text under 12.5px (' + await smallest(p) + ')');
    await shot('versus');

    /* ----- school360 ----- */
    await open(p, BASE, 'school360', lang);
    ok((await text(p, '#view h1')) === (el ? 'Σχολείο 360' : 'School 360'), name + ' school360: the title');
    ok(await p.locator('.s3-schools .t1-chip').count() === 4 && await p.locator('.s3-topics .t1-chip').count() === 4, name + ' school360: four schools and four topics');
    ok(/2 (of|από) 2/.test(await text(p, '.s3-count')) && /\d{1,2}:\d{2}/.test(await text(p, '.s3-count')), name + ' school360: sensors online as a count with the time of the newest reading');
    ok(/Counts only|Μόνο αριθμοί/.test(await text(p, '.s3-sensors')), name + ' school360: says counts only');
    ok(await p.locator('.s3-read tbody tr').count() >= 4, name + ' school360: readings for the city are listed');
    const row = await text(p, '.s3-read tbody tr');
    ok(/°C|%|m\/s|hPa/.test(row) && /\d{1,2}:\d{2}/.test(row), name + ' school360: a reading has its unit and time');
    ok(/not for the school building|όχι για το ίδιο το κτίριο/.test(await text(p, '.s3-read')), name + ' school360: says the readings are for the city, not the building');
    await p.waitForSelector('.s3-day .s3-line', { timeout: 10000 });
    ok(await p.locator('.s3-day .s3-line').count() >= 2 && await p.locator('.s3-day .s3-line .t1-spark path.ln').count() >= 1, name + ' school360: the saved day has a line per source');
    ok(await p.locator('.s3-differ .t1-line').count() >= 1, name + ' school360: open differences for the topic');
    await p.locator('.s3-schools .t1-chip[data-id="larnaka"]').click(); await p.locator('.s3-topics .t1-chip[data-id="sea"]').click();
    ok(await p.locator('.s3-none').count() === 1 && /not a zero|όχι μηδέν/.test(await text(p, '.s3-none')), name + ' school360: an honest empty state (no sea reading for Larnaka)');
    ok(/nothing to compare|δεν υπάρχει κάτι για σύγκριση/.test(await text(p, '.s3-differ')), name + ' school360: no differences are made up for an empty topic');
    await p.locator('.s3-topics .t1-chip[data-id="own"]').click(); await p.waitForSelector('.s3-day .s3-line');
    ok(/ppm/.test(await text(p, '.s3-read')) && /never compared with the street|δεν συγκρίνεται ποτέ με τον δρόμο/.test(await text(p, '.s3-read')), name + ' school360: our sensors, with the note on vehicles and rooms');
    await p.locator('.s3-topics .t1-chip[data-id="air"]').click(); await p.waitForSelector('.s3-day .s3-line');
    ok(/µg\/m³/.test(await text(p, '.s3-read')) && await p.locator('.s3-day .t1-chip').count() >= 2, name + ' school360: air, with a measurement to choose for the saved day');
    ok(!/\b(lat|lng|latitude|longitude|GPS)\b|DEMO0000|3[45]\.\d{2,}/i.test(await text(p, '.t1')), name + ' school360: no position and no sensor id anywhere');
    ok(await noSide(p), name + ' school360: no sideways scroll'); ok(await smallest(p) >= 12.5, name + ' school360: no text under 12.5px (' + await smallest(p) + ')');
    await p.locator('.s3-topics .t1-chip[data-id="weather"]').click(); await p.locator('.s3-schools .t1-chip[data-id="lefkosia"]').click(); await p.waitForSelector('.s3-day .s3-line');
    await shot('school360');

    /* ----- bubbles ----- */
    await open(p, BASE, 'bubbles', lang);
    ok((await text(p, '#view h1')) === (el ? 'Φούσκες μετρήσεων' : 'Measurement bubbles'), name + ' bubbles: the title');
    ok(await p.locator('.bb-b').count() === 16 && await p.locator('.bb-b.none').count() === 1, name + ' bubbles: sixteen bubbles, one of them empty (Larnaka, sea)');
    ok(await p.locator('.bb-b.up').count() >= 1 && await p.locator('.bb-b.down').count() >= 1, name + ' bubbles: some above and some below their average');
    ok(await p.locator('.bb-table tbody tr').count() === 16, name + ' bubbles: the table has the same sixteen rows');
    // the size of each bubble follows the "part of the range" of its row in the table
    const pairs = await p.evaluate(() => [...document.querySelectorAll('.bb-b:not(.none)')].map((g) => { const tr = document.querySelector('.bb-table tr[data-id="' + g.dataset.id + '"]'); return [parseFloat(g.querySelector('.bb-c').getAttribute('r')), parseFloat(tr.querySelector('.bb-share').textContent) || 0]; }));
    const sorted = pairs.slice().sort((x, y) => x[1] - y[1]);
    ok(pairs.length === 15 && sorted.every((x, i) => i === 0 || x[1] === sorted[i - 1][1] || x[0] >= sorted[i - 1][0] - 0.01), name + ' bubbles: a bigger share of the range is never a smaller bubble');
    const firstId = await p.locator('.bb-b:not(.none)').first().getAttribute('data-id');
    await p.locator('.bb-b[data-id="' + firstId + '"]').focus(); await p.keyboard.press('Enter');
    const said = await text(p, '.bb-said');
    ok(/°C|m\/s|ppm/.test(said) && (said.match(/\d{1,2}:\d{2}/g) || []).length >= 2 && /layer|στρώμα/.test(said), name + ' bubbles: Enter on a bubble reads it in words with unit, times and layer');
    ok(await p.locator('.bb-b.on').count() === 1, name + ' bubbles: the pressed bubble is marked');
    ok(/unusual today|ασυνήθιστο σήμερα/.test(await text(p, '.bb-notbad')) && /not "bad"|όχι «κακό»/.test(await text(p, '.bb-notbad')), name + ' bubbles: says big means unusual today, not bad');
    ok((await text(p, '.bb-legend')).split(/[.;·]/).filter((s) => s.trim().length > 20).length <= 2 && /average|μέσο όρο/.test(await text(p, '.bb-legend')), name + ' bubbles: the legend explains size and colour in one sentence');
    ok(await p.$$eval('.bb-b', (g) => g.every((x) => x.getAttribute('tabindex') === '0' && x.getAttribute('role') === 'button' && (x.getAttribute('aria-label') || '').length > 20)), name + ' bubbles: every bubble can be reached by keyboard and has a label in words');
    ok(await p.evaluate(() => { const s = document.querySelector('.bb-svg').getBoundingClientRect(), h = document.querySelector('.bb-host').getBoundingClientRect(); return s.width <= h.width + 1 && [...document.querySelectorAll('.bb-val, .bb-city')].every((t) => { const r = t.getBoundingClientRect(); return r.left >= h.left - 1 && r.right <= h.right + 1; }); }), name + ' bubbles: the picture and its labels fit the width');
    ok(await noSide(p), name + ' bubbles: no sideways scroll'); ok(await smallest(p) >= 12.5, name + ' bubbles: no text under 12.5px (' + await smallest(p) + ')');
    await shot('bubbles');

    /* ----- toolkit ----- */
    await open(p, BASE, 'toolkit', lang);
    ok((await text(p, '#view h1')) === (el ? 'Εργαλειοθήκη' : 'Toolkit'), name + ' toolkit: the title');
    const nAll = await p.locator('.tk-item').count();
    ok(nAll >= 53, name + ' toolkit: every tool is listed (' + nAll + ')');
    ok(await p.locator('.tk-group').count() >= 8, name + ' toolkit: the tools are in groups');
    ok(await p.$$eval('.tk-item', (it) => it.every((x) => x.querySelector('.tk-st') && x.querySelector('p').textContent.length > 15)), name + ' toolkit: every tool has a chip and a line');
    const menuIds = await p.evaluate(() => [...document.querySelectorAll('.nm-side-a')].map((a) => a.dataset.id));
    ok(menuIds.length > 20 && await p.evaluate((ids) => ids.every((id) => document.querySelector('.tk-item[data-id="' + id + '"]')), menuIds), name + ' toolkit: every page of the menu is in the list');
    ok(await p.$$eval('.tk-item.coming', (it) => it.every((x) => !x.querySelector('a'))) && await p.evaluate(() => [...document.querySelectorAll('.tk-item')].every((x) => x.classList.contains('coming') === !(window.SC.ready.has(x.dataset.id) || window.SC_PAGES.indexOf(x.dataset.id) >= 0))), name + ' toolkit: a tool is marked coming, with no link, exactly when it has no page');
    ok(await p.$$eval('.tk-item:not(.coming)', (it) => it.every((x) => x.querySelector('a.tk-name'))), name + ' toolkit: every other tool links to its page');
    ok(await p.evaluate(() => ['changed', 'versus', 'school360', 'bubbles'].every((id) => { const x = document.querySelector('.tk-item[data-id="' + id + '"]'); return x && !x.classList.contains('coming'); })) && await p.locator('.tk-item[data-id="radar"]:not(.coming) a.tk-name').count() === 1, name + ' toolkit: the tools of every batch are open now that they are built');
    await p.fill('#tk-q', el ? 'φουσκες' : 'bubble');
    ok(await p.locator('.tk-item').count() === 1 && await p.locator('.tk-item[data-id="bubbles"]').count() === 1, name + ' toolkit: the search box filters the list (and ignores accents)');
    ok(/1 (of|από) /.test(await text(p, '.tk-count')), name + ' toolkit: the count follows the filter');
    await p.fill('#tk-q', 'zzzz');
    ok(await p.locator('.tk-item').count() === 0 && await p.locator('.tk-none').count() === 1, name + ' toolkit: an honest line when nothing matches');
    await p.fill('#tk-q', '');
    await p.locator('.tk-chips .t1-chip[data-s="saved"]').click();
    ok(await p.$$eval('.tk-item', (it) => it.length >= 5 && it.every((x) => x.classList.contains('saved'))), name + ' toolkit: the chips filter by status');
    await p.locator('.tk-chips .t1-chip[data-s="all"]').click();
    ok(await p.locator('.tk-dl dt').count() === 4, name + ' toolkit: the four chips are explained');
    ok(await noSide(p), name + ' toolkit: no sideways scroll'); ok(await smallest(p) >= 12.5, name + ' toolkit: no text under 12.5px (' + await smallest(p) + ')');
    await shot('toolkit');
    await p.locator('.tk-item[data-id="versus"] a').click(); await p.waitForSelector('.vs-now');
    ok(/#\/versus$/.test(p.url()), name + ' toolkit: a tool opens its page');

    /* ----- the sums, on known numbers ----- */
    const sums = await p.evaluate(() => {
      const H = 3600000, t = [0, 1, 2, 3, 4].map((i) => 1e12 + i * H / 2), K = SC.tk1;
      const s = K.stats([10, null, 20, 30, 40], t), g = K.gaps([1, null, null, null, 2, null, null, null], [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 1e12 + i * 600000), 300000);
      return { s, g, none: K.stats([null, null], t.slice(0, 2)), flat: K.stats([5, 5, 5], t.slice(0, 3)) };
    });
    ok(sums.s.n === 4 && sums.s.first.v === 10 && sums.s.last.v === 40 && sums.s.min === 10 && sums.s.max === 40 && sums.s.mean === 25 && sums.s.range === 30 && sums.s.dev === 15 && sums.s.share === 0.5, name + ' sums: newest, oldest, average, range and share on known numbers');
    ok(sums.s.hourAgo && sums.s.hourAgo.v === 20, name + ' sums: "one hour ago" is the saved moment an hour before the newest');
    ok(sums.none === null && sums.flat.share === 0 && sums.flat.range === 0, name + ' sums: nothing saved gives nothing; a flat line gives no share');
    ok(sums.g.length === 2 && sums.g[0].back === true && sums.g[1].back === false, name + ' sums: a gap that came back and a line that stopped');

    ok(errs.length === 0, name + ': no script errors' + (errs.length ? ' (' + errs.slice(0, 3).join(' | ') + ')' : ''));
    await ctx.close();
  }
  await run('desktop/en', { viewport: { width: 1366, height: 900 } }, null);
  await run('phone/el', { ...devices['iPhone 13'] }, 'el');

  /* ---------- Greek on a computer, quickly: nothing is left in English ---------- */
  {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }), p = await ctx.newPage();
    for (const id of IDS) {
      await open(p, BASE, id, 'el');
      const t = (await text(p, '#view')).replace(/PASCAL|CO2|PM2\.5|PM10|NO2|SO2|UV|METAR|SenseCAP|NASA|Open-Meteo|Sensor\.Community|CSV|Athena|3D|hPa|ppm|km|AI\b/g, '');
      const words = t.match(/\b[A-Za-z]{4,}\b/g) || [];
      ok(words.length === 0, 'desktop/el ' + id + ': no English words left (' + [...new Set(words)].slice(0, 8).join(', ') + ')');
    }
    await ctx.close();
  }

  /* ---------- the log has only just started ---------- */
  {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await new Promise((r) => setTimeout(r, 6000));   // at least two saved moments
    await open(p, BASE2, 'changed');
    ok(await p.locator('.ch-filling').count() === 1 && /still filling/.test(await text(p, '.ch-filling')) && /"since yesterday" on this page means "since/.test(await text(p, '.ch-filling')), 'filling changed: says the log is still filling and what "yesterday" means for now');
    ok(/no saved moment close to one hour/.test(await text(p, '.ch-city')), 'filling changed: no "one hour ago" is made up');
    await open(p, BASE2, 'bubbles');
    ok(await p.locator('.bb-filling').count() === 1 && /means very little yet|at least two saved moments/.test(await text(p, '.bb-pic, .t1-panel')), 'filling bubbles: says that "unusual" means little with so little saved');
    await open(p, BASE2, 'versus');
    ok(/still filling|Nothing has been saved yet/.test(await text(p, '.vs-day')), 'filling versus: says the log is still filling');
    await open(p, BASE2, 'school360'); await p.waitForSelector('.s3-day .s3-line, .s3-day .t1-empty');
    await p.waitForSelector('.s3-filling', { timeout: 10000 }).catch(() => {});
    ok(await p.locator('.s3-filling').count() === 1, 'filling school360: says the log is still filling');
    ok(errs.length === 0, 'filling: no script errors' + (errs.length ? ' (' + errs.slice(0, 3).join(' | ') + ')' : ''));
    await ctx.close();
  }

  /* ---------- the service cannot be reached ---------- */
  {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    let block = true;
    await p.route('**/layers/api/**', (r) => (block ? r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"busy"}' }) : r.continue()));
    await p.route('**/api/devices', (r) => (block && /\/api\/devices$/.test(new URL(r.request().url()).pathname) ? r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"busy"}' }) : r.continue()));
    for (const id of ['changed', 'versus', 'school360', 'bubbles']) {
      await go(p, BASE + '/#/' + id); await p.waitForSelector('.t1-err', { timeout: 20000 });
      ok(/could not be loaded/.test(await text(p, '.t1-err')) && /old or made up/.test(await text(p, '.t1-err')) && await p.locator('.t1-err[role=alert] button').count() === 1, 'error ' + id + ': a plain error with a way to try again, and no numbers');
      ok(!/\d+[.,]?\d*\s?(°C|ppm|m\/s|hPa|%)/.test(await text(p, '.t1')), 'error ' + id + ': nothing is shown in place of the missing readings');
    }
    block = false;
    await p.locator('.t1-err button').click(); await p.waitForSelector('.bb-table', { timeout: 20000 });
    ok(await p.locator('.bb-b').count() === 16, 'error bubbles: "Try again" loads the page once the service answers');
    // one part missing: the page shows the rest and says what is missing
    await p.unroute('**/layers/api/**');
    await p.route('**/layers/api/replay', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"busy"}' }));
    await go(p, BASE + '/#/changed'); await p.waitForSelector('.ch-differ');
    ok(/saved day could not be loaded/.test(await text(p, '.ch-day')) && await p.locator('.ch-city').count() === 0 && await p.locator('.ch-differ .t1-line').count() >= 1, 'error changed: without the saved day it says so and still lists the live differences');
    await go(p, BASE + '/#/versus'); await p.waitForSelector('.vs-now');
    ok(/saved day could not be loaded/.test(await text(p, '.vs-day')) && await p.locator('.vs-now .vs-row').count() >= 6, 'error versus: without the saved day the live readings are still side by side');
    ok(errs.length === 0, 'error: no script errors' + (errs.length ? ' (' + errs.slice(0, 3).join(' | ') + ')' : ''));
    await ctx.close();
  }

  /* ---------- reduced motion, and the pages are plain files with no inline script ---------- */
  {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' }), p = await ctx.newPage();
    await open(p, BASE, 'bubbles');
    ok(await p.evaluate(() => { const c = document.querySelector('.bb-c'); return /^0s|none/.test(getComputedStyle(c).transitionDuration) || getComputedStyle(c).transitionProperty === 'none'; }), 'reduced motion: the bubbles do not animate');
    await ctx.close();
    const dir = path.join(__dirname, '..', '..', 'public', 'site', 'pages');
    for (const f of IDS.map((id) => id + '.js').concat('tk1-core.js')) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write|\beval\(|new Function|localStorage|sessionStorage|\.lat\b|\.lng\b/.test(src), 'source ' + f + ': no markup from strings, no eval, nothing stored, no position read');
    }
  }

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
