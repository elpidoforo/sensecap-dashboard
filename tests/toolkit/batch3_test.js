'use strict';
/* Toolkit batch 3: forecast, beforeafter, timemachine, askmap. The module, the endpoint and the four pages in a real browser
   (Playwright, which is not a dependency of the site: run where it is installed).
   Run: node tests/toolkit/batch3_test.js     (two real servers with demo data: port 3989 with seeded files, port 3990 with an empty folder)
   SHOTS=<folder> also saves <id>_desk.png and <id>_phone.png there. Nothing outside is called: OPEN_METEO_MOCK=1. */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const PORT = 3989, BASE = `http://127.0.0.1:${PORT}`, PORT2 = 3990, BASE2 = `http://127.0.0.1:${PORT2}`;
const SHOTS = process.env.SHOTS || '';
const HOUR = 3600000, DAY = 86400000;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const { createToolkitForecast, errorsOf, dayStart, dayKey, addDays } = require(path.join(ROOT, 'toolkit-forecast.js'));

/* ---------- seeded files: everything a test needs is written into a temp DATA_DIR ---------- */
const NOW = Date.now();
const STEP_AT = Math.floor((NOW - 8 * DAY) / HOUR) * HOUR;   // the moment the seeded humidity drops by 15 %
const noise = (d, k) => { const x = Math.sin((d % 7) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; };   // the same every 7 days, so 7 days before and after a moment are the same weather
const seededTemp = (t, si) => { const d = Math.floor(t / DAY); return Math.round((20 + si + 5 * Math.sin(((t % DAY) / DAY) * 2 * Math.PI - 2) + 3 * noise(d, si)) * 10) / 10; };
const seededHum = (t, si) => { const d = Math.floor(t / DAY); return Math.round((62 + 8 * Math.cos(((t % DAY) / DAY) * 2 * Math.PI) + 4 * noise(d, si + 5) - (t >= STEP_AT ? 15 : 0)) * 10) / 10; };
function seed(dir) {
  // 1. the Met Office history (the Data archive): 20 days, every 10 minutes, the two stations of the test feed
  fs.mkdirSync(path.join(dir, 'cydom'), { recursive: true });
  const files = new Map();
  for (let t = Math.floor((NOW - 20 * DAY) / 600000) * 600000; t <= NOW; t += 600000) {
    ['ACHNA', 'AGROS'].forEach((s, si) => {
      const f = new Date(t).toISOString().slice(0, 10) + '.jsonl';
      files.set(f, (files.get(f) || '') + JSON.stringify({ t, s, v: { temp: seededTemp(t, si), hum: seededHum(t, si), ws10: Math.round((3 + 2 * Math.abs(Math.sin(t / 7200000 + si))) * 10) / 10 } }) + '\n');
    });
  }
  for (const [f, text] of files) fs.writeFileSync(path.join(dir, 'cydom', f), text);
  fs.writeFileSync(path.join(dir, 'cydom', 'units.json'), JSON.stringify({ temp: { name: 'Air Temperature (1.2m)', unit: '°C' }, hum: { name: 'Relative Humidity (1.2m)', unit: '%' }, ws10: { name: 'Wind Speed (10m)', unit: 'm/s' } }));
  // 2. the saved day (the pulse log of layers.js) for Paphos, which has no station within 45 km in the test feed
  const series = { 'paphos|openmeteo-weather|temperature': [], 'paphos|openmeteo-weather|wind_speed': [], 'paphos|sensecap-buses|co2': [] };
  for (let t = NOW - 23 * HOUR; t < NOW - 60000; t += 300000) {
    series['paphos|openmeteo-weather|temperature'].push([t, Math.round((21 + 4 * Math.sin(t / (4 * HOUR))) * 100) / 100]);
    series['paphos|openmeteo-weather|wind_speed'].push([t, Math.round((4 + Math.sin(t / (3 * HOUR))) * 100) / 100]);
    series['paphos|sensecap-buses|co2'].push([t, Math.round(450 + 40 * Math.sin(t / (5 * HOUR)))]);
  }
  fs.writeFileSync(path.join(dir, 'layers-pulse.json'), JSON.stringify({ at: NOW, series }));
  // 3. saved forecasts of the last 10 days with the model's later look; the station outcomes are left for the server to work out
  const today = dayKey(NOW), days = {};
  for (let i = 10; i >= 1; i--) {
    const day = addDays(today, -i), rec = {};
    ['larnaka', 'lefkosia', 'limassol', 'paphos'].forEach((c, ci) => {
      rec[c] = { f: { at: dayStart(day) - 14 * HOUR, tmax: 27 + ci * 0.5 + (i % 3), tmin: 15 + ci * 0.5 - (i % 2), wind: 4 + (i % 4) * 0.5, sim: true }, a: { at: dayStart(day) + 30 * HOUR, tmax: 26.4 + ci * 0.5 + (i % 3), tmin: 15.6 + ci * 0.5 - (i % 2), wind: 4.4 + (i % 4) * 0.5, sim: true } };
    });
    days[day] = rec;
  }
  days[addDays(today, -10)].larnaka.s = { at: NOW - 9 * DAY, id: 'ACHNA', name: 'Achna', km: 17.9, tmax: 25, tmin: 16, wind: 5, n: 144, hours: 24 };   // older than the look-back: kept as it was saved
  fs.writeFileSync(path.join(dir, 'toolkit-forecast.json'), JSON.stringify({ at: NOW, since: NOW - 11 * DAY, days }));
}

function start(port, dir) {
  const env = { ...process.env, PORT: String(port), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dir, ANTHROPIC_API_KEY: '', LAYERS_PULSE_SECONDS: '600', LAYERS_PULSE_FIRST_MS: '300', TOOLKIT_FORECAST_FIRST_MS: '400' };
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  return srv;
}
const up = async (base) => { for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/config'); return; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } } };
const get = async (base, p, init) => { const r = await fetch(base + p, init); let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ } return { status: r.status, j }; };

/* ---------- the module on its own (no server, no clock, no network) ---------- */
async function unit() {
  ok(dayKey(Date.parse('2026-11-12T21:59:00Z')) === '2026-11-12' && dayKey(Date.parse('2026-11-12T22:00:00Z')) === '2026-11-13', 'unit: a day is a Cyprus calendar day');
  ok(dayStart('2026-11-13') === Date.parse('2026-11-12T22:00:00Z') && dayStart('2026-07-01') === Date.parse('2026-06-30T21:00:00Z'), 'unit: a day starts at Cyprus midnight, winter and summer');
  ok(addDays('2026-03-01', -1) === '2026-02-28' && addDays('2026-12-31', 1) === '2027-01-01', 'unit: days are counted across months and years');
  const e = errorsOf([{ f: { tmax: 25, tmin: 15, wind: 4 }, s: { tmax: 24, tmin: 16, wind: null } }, { f: { tmax: 22, tmin: 12, wind: 5 }, s: { tmax: 25, tmin: 12, wind: null } }, { f: { tmax: 30, tmin: 20, wind: 3 } }], 's');
  ok(e.n === 2 && e.tmax.mean_abs === 2 && e.tmax.bias === -1 && e.tmax.worst === -3 && e.tmin.mean_abs === 0.5 && e.wind === null, 'unit: average error, lean and biggest miss are worked out only from days with both numbers');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk3-u-'));
  const now = Date.parse('2026-11-13T09:00:00Z'), y = '2026-11-12';
  const rows = [];
  const hist = { units: { ws10: { unit: 'kn' } }, each: (from, to, st, fn) => rows.filter((r) => r.t >= from && r.t <= to).forEach(fn) };
  for (let t = dayStart(y); t < dayStart('2026-11-13'); t += 600000) rows.push({ t, s: 'ACHNA', v: { temp: 20 + 5 * Math.sin((t - dayStart(y)) / DAY * Math.PI), ws10: 10 } });
  for (let t = dayStart(y); t < dayStart(y) + 5 * HOUR; t += 600000) rows.push({ t, s: 'AGROS', v: { temp: 18, ws10: 4 } });   // a thin day: 5 hours only
  const cydom = async () => ({ points: [{ id: 'ACHNA', name: 'Achna', lat: 35.0255, lng: 33.7744 }, { id: 'AGROS', name: 'Agros', lat: 34.9149, lng: 33.0157 }] });
  let calls = 0;
  const fc = createToolkitForecast({ root: ROOT, dataDir: dir, mock: true, cydom, history: () => hist, timers: false, omJson: async () => { calls++; throw new Error('must not be called in test mode'); } });
  ok(fc.view(now).since === null && fc.view(now).pairs === 0, 'unit: an empty store says nothing is saved');
  await fc.tick(now);
  const v1 = fc.view(now);
  ok(calls === 0 && v1.since === now && v1.lastDay === '2026-11-14' && v1.pairs === 0 && v1.waiting === 4 && v1.simulated === true, 'unit: the first round saves tomorrow for the four cities, marked simulated, with no pair yet');
  const first = JSON.stringify(fc._t.store.days['2026-11-14']);
  await fc.tick(now + 2 * HOUR);
  ok(JSON.stringify(fc._t.store.days['2026-11-14']) === first, 'unit: a saved forecast is never replaced');
  ok(fs.existsSync(path.join(dir, 'toolkit-forecast.json')) && !fs.existsSync(path.join(dir, 'toolkit-forecast.json.tmp')), 'unit: the file is written and no .tmp is left behind');
  // a saved forecast for yesterday gets its outcomes at the next round
  fc._t.store.days[y] = { larnaka: { f: { at: now - 2 * DAY, tmax: 26, tmin: 19, wind: 6 } }, limassol: { f: { at: now - 2 * DAY, tmax: 24, tmin: 15, wind: 3 } }, paphos: { f: { at: now - 2 * DAY, tmax: 24, tmin: 15, wind: 3 } } };
  await fc.tick(now + 4 * HOUR);
  const d = fc._t.store.days[y];
  ok(d.larnaka.s && d.larnaka.s.id === 'ACHNA' && d.larnaka.s.tmax === 25 && d.larnaka.s.tmin === 20 && d.larnaka.s.hours === 24, 'unit: the nearest station of a full day becomes the outcome (highest and lowest of the day)');
  ok(Math.abs(d.larnaka.s.wind - 5.1) < 0.01, 'unit: station wind in knots is turned into m/s');
  ok(!d.limassol.s, 'unit: a station with 5 hours of readings is not a full day, so there is no outcome');
  ok(!d.paphos.s, 'unit: no station within 45 km means no outcome');
  ok(d.larnaka.a && d.larnaka.a.sim === true && !d.lefkosia, 'unit: the model’s later look is added only where a forecast was saved');
  const v2 = fc.view(now + 4 * HOUR);
  ok(v2.cities.larnaka.station.tmax.n === 1 && v2.cities.larnaka.station.tmax.bias === 1 && v2.cities.limassol.station.n === 0 && v2.cities.limassol.model.n === 1, 'unit: the view counts station pairs and model pairs apart');
  hist.units.ws10.unit = 'furlongs';
  delete d.larnaka.s;
  await fc._t.stationOutcome(y, now);
  ok(d.larnaka.s && d.larnaka.s.wind === null, 'unit: a wind unit nobody knows is left out, not guessed');
  // a broken or hostile file is read without trusting it
  fs.writeFileSync(path.join(dir, 'toolkit-forecast.json'), JSON.stringify({ since: 'x', days: { '2026-11-01': { larnaka: { f: { tmax: 'hot', tmin: 3 } }, nowhere: { f: { tmax: 20, tmin: 10 } } }, 'not-a-day': { larnaka: { f: { tmax: 20, tmin: 10 } } }, '2026-11-02': { larnaka: { f: { at: 1, tmax: 20, tmin: 10, wind: 2 } } } } }));
  const fc2 = createToolkitForecast({ root: ROOT, dataDir: dir, mock: true, timers: false });
  ok(Object.keys(fc2._t.store.days).join() === '2026-11-02' && fc2._t.store.since === null, 'unit: a damaged file keeps only the entries that are whole');
  const fc3 = createToolkitForecast({ root: ROOT, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tk3-u-')), mock: false, enabled: () => true, timers: false, omJson: async (url, n) => { calls++; ok(/past_days=1&forecast_days=2/.test(url) && /wind_speed_unit=ms/.test(url) && n === 4, 'unit: one request for the four cities'); return [0, 1, 2, 3].map(() => ({ daily: { time: ['2026-11-12', '2026-11-13', '2026-11-14'], temperature_2m_max: [24, 25, 26], temperature_2m_min: [14, 15, 16], wind_speed_10m_max: [3, 4, null] } })); } });
  await fc3.tick(now);
  ok(calls === 1 && fc3._t.store.days['2026-11-14'].paphos.f.tmax === 26 && fc3._t.store.days['2026-11-14'].paphos.f.wind === null && !fc3._t.store.days['2026-11-14'].paphos.f.sim && fc3.view(now).simulated === false, 'unit: a real answer is saved as it came, a missing wind stays empty');
  await fc3.tick(now + 10 * 60000);
  ok(calls === 1, 'unit: the model is not asked again while tomorrow is already saved');
  const fc4 = createToolkitForecast({ root: ROOT, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tk3-u-')), mock: false, enabled: () => false, timers: false, omJson: async () => { calls++; return []; } });
  await fc4.tick(now);
  ok(calls === 1 && fc4.view(now).on === false && fc4.view(now).since === null, 'unit: a weather feed a teacher switched off is not asked');
}

(async () => {
  await unit();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk3-a-')), dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'tk3-b-'));
  seed(dir);
  const srv = start(PORT, dir), srv2 = start(PORT2, dir2);
  await Promise.all([up(BASE), up(BASE2)]);
  await new Promise((r) => setTimeout(r, 3500));   // the first round of the forecast log and the first pulse

  /* ---------- the endpoint ---------- */
  const f = (await get(BASE, '/api/toolkit/forecast')).j;
  ok(f && f.simulated === true && f.units.temperature === '°C' && f.fullHours === 20 && f.maxKm === 45, 'api: the answer carries its units, its rules and the simulated flag');
  ok(Math.abs(f.since - (NOW - 11 * DAY)) < 1000, 'api: "since" is the moment saving started');
  ok(f.pairs === 40 && f.cities.larnaka.pairs === 10 && f.cities.larnaka.rows.length === 11, 'api: ten finished days per city are pairs and tomorrow waits (' + f.pairs + ')');
  ok(f.cities.larnaka.station.n === 8 && f.cities.lefkosia.station.n === 7 && f.cities.limassol.station.n === 7, 'api: station outcomes were worked out from the saved history for the last 7 days (' + [f.cities.larnaka.station.n, f.cities.lefkosia.station.n, f.cities.limassol.station.n] + ')');
  ok(f.cities.paphos.station.n === 0 && f.cities.paphos.model.n === 10, 'api: a city with no station nearby has only the model’s later look');
  const lr = f.cities.larnaka.rows.filter((r) => r.f && r.s);
  const mae = Math.round((lr.reduce((a, r) => a + Math.abs(r.f.tmax - r.s.tmax), 0) / lr.length) * 10) / 10;
  ok(f.cities.larnaka.station.tmax.mean_abs === mae, 'api: the average error equals the rows it was worked out from (' + mae + ')');
  const one = lr[lr.length - 1], from = dayStart(one.day);
  let hi = -Infinity; for (let t = Math.ceil(from / 600000) * 600000; t < from + DAY; t += 600000) hi = Math.max(hi, seededTemp(t, 0));
  ok(one.s.name === 'Achna' && one.s.tmax === hi && one.s.hours === 24 && one.s.km > 15 && one.s.km < 20, 'api: yesterday’s highest temperature is the highest saved reading of the nearest station (' + one.s.tmax + ' / ' + hi + ')');
  ok(f.cities.larnaka.rows[0].s && f.cities.larnaka.rows[0].s.tmax === 25, 'api: an outcome saved earlier is kept as it was');
  ok(!JSON.stringify(f).match(/"lat"|"lng"|eui|password|key/i), 'api: no coordinate, device or secret in the answer');
  ok((await get(BASE, '/api/toolkit/forecast', { method: 'POST' })).status === 405, 'api: the endpoint is read only');
  ok(!fs.existsSync(path.join(dir, 'toolkit-forecast.json.tmp')) && Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'toolkit-forecast.json'), 'utf8')).days).length === 11, 'api: the file on disk has the new day and no .tmp is left');
  const f2 = (await get(BASE2, '/api/toolkit/forecast')).j;
  ok(f2.pairs === 0 && f2.waiting === 4 && f2.since > NOW - 60000 && f2.firstDay === addDays(dayKey(Date.now()), 1), 'api: an empty folder has saved tomorrow and has no pair');

  /* ---------- the pages ---------- */
  const b = await chromium.launch();
  // the page is never wider than the screen (measured against the real screen width: a phone browser widens innerWidth when something sticks out)
  const noSide = (p) => p.evaluate((w) => Math.max(document.documentElement.scrollWidth, innerWidth) <= w + 1, p.viewportSize().width);
  // every text of the tool is at least 12.5 px on screen (SVG text is measured after scaling; 12 allowed for rounding)
  const smallText = (p) => p.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.t3 *').forEach((e) => {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
      let px = parseFloat(getComputedStyle(e).fontSize);
      const svg = e.closest('svg');
      if (svg && svg.viewBox && svg.viewBox.baseVal.width) px *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      if (px < (svg ? 12 : 12.5) - 0.01) bad.push(e.tagName + '.' + (e.getAttribute('class') || '') + ' ' + px.toFixed(1) + ' "' + e.textContent.trim().slice(0, 20) + '"');
    });
    return bad.slice(0, 5);
  });
  const setRange = async (p, sel, v) => { await p.evaluate(([s, x]) => { const e = document.querySelector(s); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]); await p.waitForTimeout(250); };
  const shot = async (p, id, kind) => { if (SHOTS && kind) { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(250); await p.screenshot({ path: path.join(SHOTS, id + '_' + kind + '.png'), fullPage: true }); } };
  const open = async (p, base, id, lang, sel) => { await p.goto(base + '/' + (lang ? '?lang=' + lang : '') + '#/' + id); await p.waitForSelector(sel, { timeout: 20000 }); };

  async function run(name, opts, lang, kind) {
    const ctx = await b.newContext({ ...opts, acceptDownloads: true }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    const el = lang === 'el';
    const text = (sel) => p.locator(sel).first().innerText();

    /* forecast */
    await open(p, BASE, 'forecast', lang, '.t3-city .t3-chart');
    ok((await text('h1')) === (el ? 'Πρόβλεψη και πραγματικότητα' : 'Forecast against reality'), name + ' forecast: the title');
    ok(await p.locator('.t3-city').count() === 4 && await p.locator('.t3-city .t3-chart').count() === 4, name + ' forecast: a chart for each of the four cities');
    ok(await p.locator('.t3-city[data-city=larnaka] .t3-p-fc').count() === 11 && await p.locator('.t3-city[data-city=larnaka] .t3-p-st').count() === 8, name + ' forecast: forecast and measured points are drawn');
    const say = await text('.t3-city[data-city=larnaka] [data-k=say-station]');
    const mm = String(f.cities.larnaka.station.tmax.mean_abs.toFixed(1)).replace('.', el ? ',' : '.');
    ok(say.includes(mm + ' °C') && say.includes(el ? '8 μέρες' : '8 days'), name + ' forecast: the error is said in words with the number of the server and its unit (' + mm + ')');
    ok(/Achna/.test(await text('.t3-city[data-city=larnaka]')) && /18 km/.test(await text('.t3-city[data-city=larnaka]')), name + ' forecast: the station and its distance are named');
    ok((await text('.t3-city[data-city=paphos] [data-k=no-station]')).length > 40 && (await text('.t3-city[data-city=paphos] [data-k=say-model]')).includes(el ? 'δεν είναι μέτρηση' : 'not a measurement'), name + ' forecast: a city without a station says so and the model check is called "not a measurement"');
    ok((await text('[data-k=since]')).includes(el ? 'αποθηκεύονται από' : 'being saved since'), name + ' forecast: since when forecasts are saved');
    ok(await p.locator('.page-head .t.demo').count() === 1, name + ' forecast: simulated numbers carry a label');
    ok(await p.locator('.t3-city[data-city=limassol] [data-k=few]').count() === 0 && await p.locator('.t3-foot').count() === 1, name + ' forecast: seven days carry no "too few" warning and the "not a ranking" line is there');
    await p.locator('.t3-chip[data-m=wind]').click();
    ok((await text('.t3-city[data-city=larnaka] [data-k=say-station]')).includes('m/s') && await p.locator('.t3-city[data-city=larnaka] .t3-warn').count() >= 1, name + ' forecast: wind has its unit and its warning');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-m') === 'wind'), name + ' forecast: the keyboard stays on the chosen chip');
    await p.locator('.t3-chip[data-m=tmax]').click();
    await p.locator('.t3-city[data-city=larnaka] summary').click();
    ok(await p.locator('.t3-city[data-city=larnaka] tbody tr').count() === 11, name + ' forecast: the table has every day');
    await p.locator('.t3-city[data-city=larnaka] summary').click();
    ok(await noSide(p), name + ' forecast: no sideways scroll');
    let small = await smallText(p); ok(small.length === 0, name + ' forecast: no small text (' + small.join(' | ') + ')');
    await shot(p, 'forecast', kind);

    /* before and after */
    await open(p, BASE, 'beforeafter', lang, '[data-k=result]');
    ok((await text('h1')) === (el ? 'Πριν και μετά' : 'Before and after'), name + ' beforeafter: the title');
    ok(await p.locator('[data-k=result]').getAttribute('data-source') === 'archive' && await p.locator('#ba-win').inputValue() === '7d', name + ' beforeafter: the archive is used when it holds enough, with the longest stretch that fits');
    ok(await p.locator('[data-k=result]').getAttribute('data-verdict') === 'within' && (await text('[data-k=verdict]')).startsWith(el ? 'Δεν μπορείς να το πεις από αυτό' : 'You cannot tell from this'), name + ' beforeafter: a difference inside the normal spread says "you cannot tell from this"');
    ok(await p.locator('.t3-kpi').count() === 3 && /°C/.test(await text('.t3-kpi.b')) && /7/.test(await text('.t3-kpi.b')), name + ' beforeafter: both averages with unit and blocks');
    ok((await text('[data-k=source]')).includes('Achna') && (await text('[data-k=source]')).includes('18 km'), name + ' beforeafter: the source is named');
    ok((await text('[data-k=weather]')).includes(el ? 'Ο καιρός είναι μια άλλη εξήγηση' : 'The weather is another explanation') && (await text('[data-k=nocause]')).length > 30, name + ' beforeafter: the weather warning and the "no cause" line');
    // the seeded humidity drops by 15 % at a known moment: 3 days on each side must see it
    await p.selectOption('#ba-meas', 'hum'); await p.waitForSelector('[data-k=result]');
    await p.selectOption('#ba-win', '3d');
    const local = await p.evaluate((t) => { const d = new Date(t), z = (x) => String(x).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); }, STEP_AT);
    await p.fill('#ba-when', local); await p.locator('#ba-when').dispatchEvent('change');
    await p.waitForFunction(() => { const r = document.querySelector('[data-k=result]'); return r && r.getAttribute('data-verdict') === 'beyond'; }, null, { timeout: 8000 }).catch(() => {});
    ok(await p.locator('[data-k=result]').getAttribute('data-verdict') === 'beyond', name + ' beforeafter: a real step in the saved numbers is seen');
    const v = await text('[data-k=verdict]');
    ok(/1[3-7][.,]\d %/.test(v) && v.includes(el ? 'Δεν δείχνει το γιατί' : 'It does not show why') && !/caus|because|οφείλεται|προκάλεσε/i.test(v), name + ' beforeafter: the sentence gives the size, says it does not show why and names no cause (' + v.slice(0, 60) + ')');
    const calc = await p.evaluate(() => { const c = SC.pages.beforeafter._t.compare; const H = 3600000, pts = []; for (let t = 0; t < 12 * H; t += H / 2) pts.push([t, t < 6 * H ? 10 + (Math.floor(t / H) % 2) : 20 + (Math.floor(t / H) % 2)]); const r = c(pts, 6 * H, 6 * H, H), few = c(pts, 6 * H, 2 * H, H), none = c(pts, 6 * H, 24 * H, H); return [r.before.mean, r.after.mean, r.diff, Math.round(r.spread * 1000) / 1000, r.verdict, few.verdict, none.ok, none.verdict]; });
    ok(calc.join() === [10.5, 20.5, 10, 0.548, 'beyond', 'few', false, 'nodata'].join(), name + ' beforeafter: the sums are right on known numbers (' + calc.join() + ')');
    // Paphos has no station nearby: the saved day answers
    await p.selectOption('#ba-city', 'paphos'); await p.selectOption('#ba-meas', 'temp');
    await p.waitForFunction(() => { const r = document.querySelector('[data-k=result]'); return r && r.getAttribute('data-source') === 'day'; }, null, { timeout: 8000 }).catch(() => {});
    ok(await p.locator('[data-k=result]').getAttribute('data-source') === 'day' && await p.locator('#ba-win').inputValue() === '6h', name + ' beforeafter: without a station nearby the saved day is used');
    ok((await text('[data-k=source]')).includes(el ? 'δεν είναι μέτρηση' : 'not a measurement'), name + ' beforeafter: a model is called a model');
    await p.selectOption('#ba-win', '7d'); await p.waitForSelector('[data-k=nodata]');
    ok((await text('[data-k=nodata]')).includes(el ? 'Τίποτα δεν μαντεύεται' : 'Nothing is guessed') && await p.locator('.t3-kpi').count() === 0, name + ' beforeafter: a stretch the saved data cannot cover shows no averages');
    ok(await noSide(p), name + ' beforeafter: no sideways scroll');
    await p.selectOption('#ba-city', 'larnaka'); await p.waitForSelector('[data-k=result]');
    small = await smallText(p); ok(small.length === 0, name + ' beforeafter: no small text (' + small.join(' | ') + ')');
    ok(await noSide(p), name + ' beforeafter: no sideways scroll with a result');
    await shot(p, 'beforeafter', kind);

    /* time machine */
    await open(p, BASE, 'timemachine', lang, '.t3-dl');
    ok((await text('h1')) === (el ? 'Μηχανή του χρόνου' : 'Time machine'), name + ' timemachine: the title');
    ok((await text('[data-k=year]')) === '2025' && (await text('[data-k=summary]')).includes('123'), name + ' timemachine: it opens on the newest season with its 123 sites');
    ok(await p.locator('.t3-island path.t3-d').count() === 6 && await p.locator('.t3-island .t3-site').count() >= 100, name + ' timemachine: six districts and the sites are drawn');
    ok(await p.locator('.t3-island .t3-school').count() === 4, name + ' timemachine: the four schools are on the map');
    ok(await p.locator('.t3-dl[data-state=none]').count() >= 1 && (await text('.t3-dl[data-state=none]')).includes(el ? 'χωρίς δεδομένα' : 'no data'), name + ' timemachine: a district without sites stays grey and says so');
    ok(await p.locator('.t3-island path.t3-d.none').count() >= 1, name + ' timemachine: the grey district is grey on the map too');
    ok((await text('[data-k=history]')).includes(el ? 'όχι το σημερινό νερό' : 'not today’s water') && (await text('[data-k=noscore]')).includes(el ? 'Καμία βαθμολογία' : 'No score'), name + ' timemachine: history, not today; no score');
    ok(await p.locator('.t3-sb').count() === 22, name + ' timemachine: one bar per season, 2004 to 2025');
    await p.locator('#tm-year').focus(); for (let i = 0; i < 21; i++) await p.keyboard.press('ArrowLeft');
    ok((await text('[data-k=year]')) === '2004' && (await text('[data-k=summary]')).includes('100'), name + ' timemachine: the slider works from the keyboard');
    const y04 = await p.evaluate(() => [...document.querySelectorAll('.t3-dl')].map((e) => e.getAttribute('data-d') + ':' + e.getAttribute('data-state')).join(' '));
    ok(/mixed/.test(y04), name + ' timemachine: 2004 has a district with different labels, drawn as mixed (' + y04 + ')');
    ok(await p.evaluate(() => { const m = document.querySelector('.t3-island path.t3-d.mixed'); return !!m && /t3-mixed/.test(m.style.fill); }), name + ' timemachine: a mixed district is striped, not given one colour');
    const sumAll = await p.evaluate(() => { const t = document.querySelector('[data-k=summary]').textContent; return (t.match(/\d+/g) || []).map(Number); });
    ok(sumAll[1] === 100 && sumAll.slice(2).reduce((a, x) => a + x, 0) === 100, name + ' timemachine: the counts of the labels add up to the sites of the year (' + sumAll.join() + ')');
    ok((await text('[data-k=noplace]')).length > 20, name + ' timemachine: sites without a place are counted and said');
    const reduced = await p.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    await p.locator('[data-k=play]').click();
    if (reduced) {
      await p.waitForTimeout(1600);
      ok((await text('[data-k=year]')) === '2005', name + ' timemachine: with reduced motion one press is one step');
      await p.locator('[data-k=play]').click();
      ok((await text('[data-k=year]')) === '2006', name + ' timemachine: the next press is the next step');
    } else {
      await p.waitForTimeout(2600);
      const yy = Number(await text('[data-k=year]'));
      ok(yy >= 2005 && yy <= 2007 && await p.locator('[data-k=play].on').count() === 1, name + ' timemachine: play steps year by year (' + yy + ')');
      await p.locator('[data-k=play]').click(); const at = await text('[data-k=year]'); await p.waitForTimeout(1400);
      ok((await text('[data-k=year]')) === at, name + ' timemachine: pause stops it');
    }
    await p.locator('.t3-sb').nth(21).click();
    ok((await text('[data-k=year]')) === '2025', name + ' timemachine: a bar jumps to its year');
    ok(await noSide(p), name + ' timemachine: no sideways scroll');
    small = await smallText(p); ok(small.length === 0, name + ' timemachine: no small text (' + small.join(' | ') + ')');
    await p.locator('.t3-sb').nth(0).click();
    await shot(p, 'timemachine', kind);

    /* ask the map */
    await open(p, BASE, 'askmap', lang, '[data-k=table]');
    ok((await text('h1')) === (el ? 'Ρώτα τον χάρτη' : 'Ask the map'), name + ' askmap: the title');
    ok(await p.locator('.t3-island rect.t3-pt').count() === 2 && await p.locator('[data-k=table] tbody tr').count() === 2, name + ' askmap: the stations of the feed are on the map and in the table');
    ok(await p.locator('.t3-island .t3-school').count() === 4, name + ' askmap: the school sites are shown');
    ok(await p.locator('.t3 [class*=bus], .t3 [class*=car], .t3 [class*=veh]').count() === 0 && !/bus\b|λεωφορείο\b/i.test(await text('[data-k=table]')), name + ' askmap: no vehicle is drawn or listed');
    ok(/26[.,]6/.test(await text('[data-k=table]')) && /°C/.test(await text('[data-k=table] thead')), name + ' askmap: the station value with its unit');
    await p.selectOption('#am-rule', 'near'); await p.waitForTimeout(200);
    ok(await p.locator('.t3-ring').count() === 1 && await p.locator('[data-k=table] tbody tr').count() === 1 && /Achna/.test(await text('[data-k=table] tbody')), name + ' askmap: within 20 km of the Larnaka school there is one station');
    await setRange(p, '#am-km', 2);
    ok(await p.locator('[data-k=answer]').getAttribute('data-state') === 'empty' && await p.locator('[data-k=table]').count() === 0 && (await text('[data-k=answer]')).includes(el ? 'Τίποτα δεν ταιριάζει' : 'Nothing matches'), name + ' askmap: a question nothing matches says so');
    await setRange(p, '#am-km', 20); await p.waitForSelector('[data-k=table]');
    await p.selectOption('#am-rule', 'district'); await p.selectOption('#am-dist', 'limassol'); await p.waitForTimeout(200);
    ok(/Agros/.test(await text('[data-k=table] tbody')) && await p.locator('.t3-island path.t3-d.pick').count() === 1, name + ' askmap: the district rule picks the station inside it');
    await p.selectOption('#am-rule', 'all'); await p.selectOption('#am-fig', 'hum'); await p.selectOption('#am-ago', '3');
    await p.waitForFunction(() => { const t = document.querySelector('[data-k=table] thead'); return t && t.querySelectorAll('th').length >= 7; }, null, { timeout: 8000 }).catch(() => {});
    const want = seededHum(Math.round((Date.now() - 3 * HOUR) / 600000) * 600000, 0);
    const row = await text('[data-k=table] tbody tr');
    const then = parseFloat(String(row.split('\t')[4] || '').replace(',', '.'));
    ok(/51[.,]0/.test(row) && Math.abs(then - want) < 1, name + ' askmap: now against the saved reading of 3 hours ago (' + want + ')');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('[data-k=csv]').click()]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok(/^ask-the-map-hum-\d{4}-\d\d-\d\d\.csv$/.test(dl.suggestedFilename()) && csv.charCodeAt(0) === 0xfeff && csv.split('\r\n').length === 4 && /Achna/.test(csv) && /Agros/.test(csv), name + ' askmap: the CSV has the header and the rows that are shown');
    ok(!csv.split('\r\n').some((line) => line.replace(/^\ufeff/, '').split(',').some((c) => /^"?[=+\-@]/.test(c))), name + ' askmap: no cell of the CSV starts with = + - @');
    const cells = await p.evaluate(() => [SC.tk3.cell('=1+1'), SC.tk3.cell('+3,5'), SC.tk3.cell('-2'), SC.tk3.cell('@x'), SC.tk3.cell('a "b", c'), SC.tk3.cell(null), SC.tk3.cell('Achna'), JSON.stringify(SC.tk3.parseCsv('# note\na,b\n"x, ""y""",2\n'))]);
    ok(cells.join('|') === ["'=1+1", '"\'+3,5"', "'-2", "'@x", '"a ""b"", c"', '', 'Achna', '[["a","b"],["x, \\"y\\"","2"]]'].join('|'), name + ' askmap: dangerous cells are made safe and quoting is right (' + cells.join('|') + ')');
    // bathing sites, two seasons
    await p.selectOption('#am-fig', 'bath'); await p.waitForFunction(() => document.querySelectorAll('.t3-island circle.t3-pt').length > 100);
    ok(await p.locator('[data-k=table] tbody tr').count() === 123 && await p.locator('#am-ago').isHidden() && await p.locator('#am-yb').isVisible(), name + ' askmap: the bathing sites of 2025 and the season controls');
    await p.selectOption('#am-rule', 'district'); await p.selectOption('#am-dist', 'paphos'); await p.selectOption('#am-yb', '2004'); await p.waitForTimeout(300);
    const ans = await text('[data-k=answer]');
    ok(/2004/.test(ans) && /2025/.test(ans) && await p.locator('[data-k=table] thead th').count() === 6, name + ' askmap: two seasons side by side (' + ans.slice(0, 70) + ')');
    ok(!/improv|better|worse|score|βελτ|καλύτερ|χειρότερ/i.test(ans + (await text('[data-k=notes]')).replace(/no score|χωρίς βαθμολογία/gi, '')), name + ' askmap: no "improved", no score, no better or worse');
    ok((await text('[data-k=notes]')).includes(el ? 'Λεωφορεία και αυτοκίνητα δεν μπαίνουν ποτέ' : 'Buses and cars are never on this map'), name + ' askmap: the vehicles line');
    ok(await noSide(p), name + ' askmap: no sideways scroll');
    small = await smallText(p); ok(small.length === 0, name + ' askmap: no small text (' + small.join(' | ') + ')');
    await p.selectOption('#am-rule', 'near'); await p.selectOption('#am-sch', 'paphos'); await setRange(p, '#am-km', 25);
    ok(await p.locator('[data-k=table] tbody tr').count() >= 3 && await noSide(p), name + ' askmap: bathing sites near the Paphos school');
    await shot(p, 'askmap', kind);

    // keyboard: every control of a tool can be reached with Tab and shows a focus ring
    await p.locator('#am-fig').focus(); await p.keyboard.press('Tab');
    ok(await p.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('.t3') && a.id !== 'am-fig' && a.matches('select, input, button'); }), name + ' askmap: Tab moves to the next control');

    /* empty and error states */
    await open(p, BASE2, 'forecast', lang, '[data-k=nopair]');
    ok((await text('[data-k=nopair]')).includes(el ? 'ούτε ένα πλήρες ζευγάρι' : 'not one full pair') && (await text('[data-k=since]')).includes(el ? 'αποθηκεύονται από' : 'being saved since') && /\d\d:\d\d/.test(await text('[data-k=since]')), name + ' forecast empty: says there is no full pair and since when forecasts are saved');
    ok(await p.locator('.t3-chart').count() === 0 && await p.locator('.t3-list li').count() === 4, name + ' forecast empty: no chart, the four waiting forecasts are listed');
    if (kind === 'desk') await shot(p, 'forecast_empty', kind);
    await open(p, BASE2, 'beforeafter', lang, '[data-k=nodata]');
    ok(await p.locator('.t3-kpi').count() === 0 && (await text('[data-k=nodata]')).includes(el ? 'Τίποτα δεν μαντεύεται' : 'Nothing is guessed'), name + ' beforeafter empty: no saved data, no averages');
    await p.route('**/layers/api/context/bathing-water-history*', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"This layer is not available right now."}' }));
    await p.route('**/api/cydom', (r) => r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"down"}' }));
    await p.goto(BASE2 + '/' + (lang ? '?lang=' + lang : '') + '#/home'); await p.reload();
    await open(p, BASE2, 'timemachine', lang, '[data-k=unavailable]');
    ok(await p.locator('.t3-island').count() === 0 && (await text('.t3')).includes(el ? 'δεν αντικαθίσταται ποτέ από εικασία' : 'never replaced by a guess'), name + ' timemachine error: a missing file shows nothing instead');
    await open(p, BASE2, 'askmap', lang, '[data-k=answer][data-state=error]');
    ok(await p.locator('[data-k=table]').count() === 0 && (await text('[data-k=answer]')).length > 30, name + ' askmap error: stations that cannot be read are not drawn');
    await p.selectOption('#am-fig', 'bath'); await p.waitForTimeout(200);
    ok(await p.locator('[data-k=answer]').getAttribute('data-state') === 'error' && await p.locator('.t3-island').count() === 0, name + ' askmap error: the bathing file that cannot be read is not drawn');
    await p.unroute('**/layers/api/context/bathing-water-history*'); await p.unroute('**/api/cydom');

    ok(errs.length === 0, name + ': no script errors (' + errs.slice(0, 3).join(' | ') + ')');
    await ctx.close();
  }

  await run('desktop', { viewport: { width: 1366, height: 900 } }, null, 'desk');
  await run('phone el', { ...devices['iPhone 13'] }, 'el', 'phone');
  await run('desktop el reduced motion', { viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' }, 'el', '');
  await b.close(); srv.kill(); srv2.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
