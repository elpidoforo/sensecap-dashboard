'use strict';
/* The data stack: the sheets fed by GET /api/stack/<id> (docs/STACK-DATA.md).
   For every such sheet, in English and in Greek: the honesty line of the answer is in the key word for word, with a line on
   units, a line on motion and the source; demo values say "demo"; an answer with no data leaves the sheet empty and says why.
   Then the rules that matter most: a sheet is asked for only when it is first switched on and never sooner than its own pace;
   the census sheets stand still after their reveal; earthquakes ripple once; buses follow the timetable and are never called
   observed; our own vehicles are never drawn finer than the answer; nothing is drawn where a sheet has no data.
   Real server in demo mode with a made-up timetable, real browser. Run: node tests/stack/sheets_test.js */
const H = require('./_helper');
const PORT = Number(process.env.STACK_TEST_PORT) || 3979, ZIP = Number(process.env.STACK_ZIP_PORT) || PORT + 1;
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const { wait } = H;
const SHEETS = { bathing: ['bathing-water'], flood: ['flood-reaches'], quakes: ['earthquakes'], drought: ['drought'], burnt: ['burnt-areas'], hotspots: ['fire-hotspots'], crossings: ['crossings'], ev: ['ev-charging'],
  buildings: ['buildings'], permits: ['permits'], population: ['population'], age: ['age'], buses: ['bus-network', 'bus-now'], vehicles: ['own-vehicles'], airq: ['air-stations'], airday: ['air-day'], met: ['met-stations', 'airports'], aerosol: ['aerosol-sites'] };
const STILL = ['bathing', 'flood', 'crossings', 'ev', 'buildings', 'permits', 'population', 'age', 'burnt', 'airq'];   // nothing may move on these once they are open
const solo = async (page, id) => { await page.evaluate((x) => { if (document.getElementById('legend').dataset.layer !== x) document.querySelector('.row[data-id="' + x + '"] .solo').click(); }, id);
  await H.until(page, (x) => window.__sheets().loaded.includes(x) && document.getElementById('legend').dataset.layer === x && !/Not asked for yet|Δεν ζητήθηκαν ακόμη/.test(document.getElementById('legend').innerText), id); };
const key = (page) => page.evaluate(() => { const L = document.getElementById('legend'), q = (s) => (L.querySelector(s) ? L.querySelector(s).innerText : '');
  return { layer: L.dataset.layer, state: L.dataset.state, text: L.innerText, cap: q('.lg-cap'), honest: [...L.querySelectorAll('.lg-honest')].map((x) => x.innerText), scale: [...L.querySelectorAll('.lg-scale')].map((x) => x.innerText).join(' '), move: q('.lg-move'), src: q('.lg-state'),
    modes: [...L.querySelectorAll('.lg-mode')].map((x) => x.dataset.mode + ':' + x.getAttribute('aria-pressed')), spots: L.querySelectorAll('.lg-spot').length }; });
const ink = (page, id) => page.evaluate((x) => window.__sheetInk(x), id);
// made up by this test, and labelled so: the three feeds that give nothing in test mode, to see their drawing code at work
const TEST_FEEDS = (real) => ({
  'fire-hotspots': { ...real['fire-hotspots'], available: true, demo: true, reason: undefined, updated: new Date().toISOString(), features: [{ lat: 34.95, lng: 33.1, seen: new Date(Date.now() - 2 * 3600000).toISOString(), satellites: ['TEST'] }, { lat: 34.85, lng: 32.6, seen: new Date(Date.now() - 20 * 3600000).toISOString(), satellites: ['TEST'] }] },
  'burnt-areas': { ...real['burnt-areas'], available: true, demo: true, reason: undefined, updated: new Date().toISOString(), features: [{ lat: 34.9, lng: 33.0, hectares: 1200, firstSeen: '2026-11-01', lastUpdate: '2026-11-03' }] },
  'air-stations': { ...real['air-stations'], available: true, demo: true, reason: undefined, updated: new Date().toISOString(), features: [{ id: 'T1', name: 'TEST station', lat: 35.15, lng: 33.35, pm25: 12.5, pm25HourEnds: new Date().toISOString(), pm10: 40, pm10HourEnds: new Date().toISOString(), stationType: 'traffic' }, { id: 'T2', name: 'TEST station 2', lat: 34.7, lng: 33.0, pm25: null, pm10: null }] },
});

(async () => {
  const srv = await H.start(PORT, { buses: ZIP }), b = await H.chromium.launch({ args: H.GL });
  try {
    const real = {};
    for (const id of [].concat(...Object.values(SHEETS))) real[id] = await (await fetch(srv.base + '/api/stack/' + id)).json();
    ok(real['bus-now'].available === true && real['bus-now'].kind === 'scheduled' && real['bus-now'].trips.length > 0, 'the made-up timetable gives planned buses for this minute (' + (real['bus-now'].trips || []).length + ')');

    for (const el of [false, true]) {
      const name = el ? 'greek' : 'english', L = el ? 1 : 0;
      const { page, errs, ctx } = await H.open(b, srv.base, { query: 'tour=0' + (el ? '&lang=el' : '') });
      await H.until(page, () => window.__sheets().loaded.length >= 6);

      /* ---------- asked for only when switched on ---------- */
      const first = await page.evaluate(() => ({ s: window.__sheets(), a: window.__stack().answers.map((x) => x.id) }));
      const openingIds = [].concat(...first.s.opening.filter((id) => SHEETS[id]).map((id) => SHEETS[id])).concat(['seabed-profiles']);
      ok(first.a.every((id) => openingIds.includes(id)) && first.a.length <= openingIds.length, name + ': only the answers of the opening set have been asked for (' + first.a.join(', ') + ')');
      ok(!first.s.built.includes('age') && !first.s.loaded.includes('age') && !first.s.loaded.includes('vehicles'), name + ': a sheet that is off has no picture and no data yet');
      const railOff = await page.evaluate(() => document.querySelector('.row[data-id="ev"]').innerText);
      ok(el ? /άναψέ το για φόρτωση/.test(railOff) : /switch on to load/.test(railOff), name + ': its card says it loads when switched on');

      /* ---------- every sheet: the key ---------- */
      for (const id of Object.keys(SHEETS)) {
        await solo(page, id); await wait(350);
        const k = await key(page), answers = SHEETS[id].map((a) => real[a]), got = answers.filter((a) => a.available !== false);
        ok(k.layer === id && k.cap.length > 25, name + ' ' + id + ': the key has a caption');
        ok(answers.every((a) => k.honest.includes(a.honesty[L])), name + ' ' + id + ': the honesty line of each answer is shown word for word (' + k.honest.join(' | ') + ')');
        if (!got.length) {
          ok(k.state === 'none' && answers.every((a) => k.src.includes(a.reason[L])) && k.scale === '', name + ' ' + id + ': with no data the key gives the reason and no scale');
          ok(el ? /Εδώ δεν κινείται τίποτα/.test(k.move) : /Nothing moves here/.test(k.move), name + ' ' + id + ': and claims no motion');
          const a = await ink(page, id); await wait(500); const c = await ink(page, id);
          ok(a.sum === c.sum, name + ' ' + id + ': an empty sheet stands still');
        } else {
          ok(k.scale.length > 12, name + ' ' + id + ': the key says what a mark stands for, with its unit (' + k.scale.slice(0, 60).replace(/\n/g, ' ') + ')');
          ok(k.move.length > 30, name + ' ' + id + ': and what the motion means');
          ok(got.every((a) => k.src.includes((el && a.attributionEl) || a.attribution)), name + ' ' + id + ': the attribution is beside the source');
          const demo = got.some((a) => a.demo === true);
          ok(demo ? k.state === 'demo' && /(DEMO DATA, NOT REAL|ΔΕΔΟΜΕΝΑ ΕΠΙΔΕΙΞΗΣ, ΟΧΙ ΠΡΑΓΜΑΤΙΚΑ)/.test(k.src) && /(made up by the test mode|φτιαχτές από τη δοκιμαστική λειτουργία)/.test(k.src) : k.state !== 'demo' && k.state !== 'none', name + ' ' + id + ': ' + (demo ? 'made-up values say "demo data"' : 'real published values are not called demo') + ' (' + k.state + ')');
          const greek = /[α-ωά-ώ]/;
          ok(el ? greek.test(k.cap) && greek.test(k.move) && greek.test(k.scale) : !greek.test(k.cap + k.move + k.scale + k.honest.join('')), name + ' ' + id + ': caption, units and motion speak ' + (el ? 'Greek' : 'English'));
          // a far corner of the region has nothing of this sheet on it
          const corner = await page.evaluate((x) => window.__inkAt(x, 31.15, 36.6), id);
          ok(corner && corner.alpha === 0, name + ' ' + id + ': nothing is drawn far from its data');
        }
      }
      ok(await page.evaluate(() => window.__stack().answers.length) === 21, name + ': after stepping through, every answer has been asked for once');

      /* ---------- kinds ---------- */
      await solo(page, 'buses'); let k = await key(page);
      ok(k.state === 'demo' && (el ? /Δρομολόγιο, όχι λεωφορεία που παρατηρήθηκαν/.test(k.text) && /Κανείς δεν παρατήρησε/.test(k.text) : /Timetable, not observed buses/.test(k.text) && /Nobody observed these buses/.test(k.text)), name + ': buses say "Timetable, not observed buses"');
      await solo(page, 'vehicles'); k = await key(page);
      ok(el ? /Περίπου δύο ώρες αργότερα και στρογγυλεμένα στο 1 km/.test(k.text) && /τουλάχιστον 120 λεπτά πριν/.test(k.text) : /About two hours late and rounded to 1 km/.test(k.text) && /at least 120 minutes ago/.test(k.text), name + ': our vehicles say how late and how rounded');
      await solo(page, 'population'); k = await key(page);
      ok(k.state === 'published' && (el ? /όχι ζωντανά δεδομένα/.test(k.text) && /Η πυκνότητα δεν είναι διαθέσιμη ακόμη/.test(k.text) && /392 ακόμη τόποι/.test(k.text) : /not live/.test(k.text) && /Density is not available yet/.test(k.text) && /392 more places have no position yet/.test(k.text)), name + ': residents are a census, not live; density is not available; 392 places have no position');
      ok(!/per km|\/km²|ανά km/.test(k.text.replace(/Density is not available[^\n]*/, '').replace(/Η πυκνότητα δεν είναι[^\n]*/, '')), name + ': no density figure is shown anywhere');
      await solo(page, 'quakes'); k = await key(page);
      ok(el ? /κατάλογος, όχι ζωντανή ροή/.test(k.text) && /τίποτα εδώ δεν σείεται τώρα/.test(k.text) : /a list, not a live feed/.test(k.text) && /nothing here is shaking now/.test(k.text), name + ': earthquakes are a catalogue of past events, not live');
      await solo(page, 'hotspots'); k = await key(page);
      ok(/112/.test(k.text) === false && k.state === 'none', name + ': with the fire feed off the sheet says why, and shows nothing');
      ok(errs.length === 0, name + ': the page threw nothing (' + errs.slice(0, 3).join(' | ') + ')');
      await ctx.close();
    }

    /* ---------- motion: what may move, and what must not ---------- */
    {
      const { page, errs, ctx } = await H.open(b, srv.base, { query: 'tour=0' });
      await H.until(page, () => window.__sheets().loaded.includes('population'));
      // the census: a reveal, then nothing
      await solo(page, 'population');
      const early = await ink(page, 'population');
      await H.until(page, () => window.__sheets().revealDone.includes('population'));
      await wait(600); const a = await ink(page, 'population'); await wait(1500); const c = await ink(page, 'population');
      ok(a.lit > early.lit * 0.5 && a.lit > 300 && a.sum === c.sum, 'population: after the reveal the picture does not change (' + a.lit + ' lit pixels)');
      // one level at a time
      let k = await key(page);
      ok(k.modes.join() === 'municipalities:true,districts:false', 'population: the key offers municipalities or districts, one at a time');
      await page.evaluate(() => [...document.querySelectorAll('.lg-mode')].find((x) => x.dataset.mode === 'districts').click());
      ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.mode === 'districts' && document.activeElement.getAttribute('aria-pressed') === 'true'), 'population: the choice keeps the keyboard where it was');
      await H.until(page, () => window.__sheets().revealDone.includes('population')); await wait(500);
      const d = await ink(page, 'population'); await wait(1200); const d2 = await ink(page, 'population');
      ok(d.sum !== a.sum && d.sum === d2.sum, 'population: districts are a different picture, and it stands still too');
      for (const id of STILL.filter((x) => x !== 'population')) {
        await solo(page, id); await H.until(page, (x) => window.__sheets().revealDone.includes(x), id); await wait(500);
        const i1 = await ink(page, id); await wait(1300); const i2 = await ink(page, id);
        ok(i1 && i1.sum === i2.sum, id + ': once open, nothing on the sheet moves');
        ok(id === 'burnt' || id === 'airq' || i1.lit > 20, id + ': and it has marks on it (' + i1.lit + ')');
      }
      // earthquakes: one ripple each, then still
      await solo(page, 'quakes');
      const q0 = await ink(page, 'quakes'); await wait(1500); const q1 = await ink(page, 'quakes');
      ok(q0.sum !== q1.sum, 'earthquakes: the ripples run when the sheet opens');
      await H.until(page, () => window.__sheets().revealDone.includes('quakes'), null, 120); await wait(600);
      const q2 = await ink(page, 'quakes'); await wait(2000); const q3 = await ink(page, 'quakes');
      ok(q2.sum === q3.sum && q2.lit > 200, 'earthquakes: after the last ripple every event stands still');
      // replays move, and carry their date on the key
      for (const [id, words] of [['drought', /replay of a past year/], ['airday', /replay of one past day/], ['aerosol', /replay of a past month/], ['vehicles', /A replay, faster than real time/]]) {
        await solo(page, id); await wait(600); const r1 = await ink(page, id); await wait(2600); const r2 = await ink(page, id);
        ok(r1.sum !== r2.sum && words.test((await key(page)).move), id + ': a replay of the past moves, and the key calls it a replay');
      }
      // buses: at the place the timetable gives for this second
      await solo(page, 'buses'); await wait(1500);
      const bus = await page.evaluate(async () => { const j = await (await fetch('/api/stack/bus-now')).json(); return { marks: window.__stack().buses, n: j.trips.length, stops: j.trips.map((t) => t.path.map((q) => [q[1], q[2]])) }; });
      ok(bus.marks.length > 0 && bus.marks.length <= bus.n + 1, 'buses: one hollow square for each planned trip still on its path (' + bus.marks.length + ' of ' + bus.n + ')');
      ok(bus.marks.every((m) => m[0] >= 34.89 && m[0] <= 34.95 && m[1] >= 33.59 && m[1] <= 33.69), 'buses: every square is on the made-up lines, between their stops');
      ok((await key(page)).state === 'demo', 'buses: a made-up timetable is demo data');
      // our vehicles: never finer than the answer
      await solo(page, 'vehicles'); await wait(1200);
      const veh = await page.evaluate(async () => { const j = await (await fetch('/api/stack/own-vehicles')).json(); const seen = [];
        for (let i = 0; i < 12; i++) { seen.push(...window.__stack().vehicles.marks, { clock: window.__stack().vehicles.clock }); await new Promise((r) => setTimeout(r, 250)); }
        return { seen, delay: j.delayMinutes, grid: j.gridDegrees, trails: j.vehicles.map((v) => ({ n: v.n, pts: v.trail.map((q) => q[0] + '|' + q[1] + '|' + q[2]) })) }; });
      const marks = veh.seen.filter((m) => m.n != null), clocks = veh.seen.filter((m) => m.clock != null).map((m) => m.clock);
      ok(marks.length > 0 && marks.every((m) => { const tr = veh.trails.find((t) => t.n === m.n); return tr && tr.pts.includes(m.at + '|' + m.lat + '|' + m.lng); }), 'vehicles: every mark sits exactly on a point of the answer, never in between (' + marks.length + ' marks checked)');
      ok(marks.every((m) => Math.abs(m.lat * 100 - Math.round(m.lat * 100)) < 1e-6 && Math.abs(m.lng * 100 - Math.round(m.lng * 100)) < 1e-6), 'vehicles: and so on the 0.01 degree grid');
      ok(clocks.every((c) => c * 1000 <= Date.now() - veh.delay * 60000 + 90000), 'vehicles: the moment replayed is always at least ' + veh.delay + ' minutes ago');
      // built-up ground: true size, and a way to fly there
      await solo(page, 'buildings'); await wait(800);
      const bl = await page.evaluate(() => ({ patches: window.__stack().patches, region: window.__region() }));
      ok(bl.patches.length === 4 && bl.patches.every((p) => p.w > 5 && p.w < 14 && p.h > 5 && p.h < 14) && bl.region.island.w > 600, 'buildings: four boxes at their true size, each about a hundredth of the island across (' + bl.patches.map((p) => p.w.toFixed(1)).join(', ') + ' of ' + Math.round(bl.region.island.w) + ')');
      ok((await key(page)).spots === 4, 'buildings: the key offers to fly to each box');
      await page.focus('.lg-spot'); await page.keyboard.press('Enter'); await wait(1500);
      ok(await page.evaluate(() => window.__region().dist < 120), 'buildings: the keyboard flies the camera down to a box');
      ok(errs.length === 0, 'motion: the page threw nothing (' + errs.slice(0, 3).join(' | ') + ')');
      await ctx.close();
    }

    /* ---------- never asked for sooner than the answer's own pace ---------- */
    {
      const { page, ctx } = await H.open(b, srv.base, { query: 'tour=0' });
      await H.until(page, () => window.__sheets().loaded.includes('population') && window.__sheets().loaded.includes('buses'));
      const hits = {}; page.on('request', (r) => { const m = /\/api\/stack\/([a-z0-9-]+)$/.exec(r.url()); if (m) hits[m[1]] = (hits[m[1]] || 0) + 1; });
      for (let i = 0; i < 3; i++) { await page.evaluate(() => document.querySelector('.row[data-id="population"] .lay').click()); await wait(300); await page.evaluate(() => document.querySelector('.row[data-id="buses"] .lay').click()); await wait(300); }
      await wait(6000);
      ok(!hits.population && !hits.earthquakes && !hits['bus-network'] && !hits['bus-now'], 'pace: switching sheets off and on asks for nothing again inside their own pace (' + JSON.stringify(hits) + ')');
      await ctx.close();
    }

    /* ---------- reduced motion: still marks with the same information ---------- */
    {
      const { page, errs, ctx } = await H.open(b, srv.base, { query: 'tour=0', reduced: true });
      await H.until(page, () => window.__sheets().loaded.includes('population'));
      ok(await page.evaluate(() => window.__sheets().still === true && window.__sheets().tour === false), 'reduced motion: the page knows, and the tour does not start');
      for (const id of Object.keys(SHEETS)) {
        await solo(page, id); await wait(500);
        const i1 = await ink(page, id); await wait(900); const i2 = await ink(page, id);
        ok(i1 && i1.sum === i2.sum, 'reduced motion ' + id + ': the sheet stands still');
      }
      const says = async (id, re) => { await solo(page, id); return re.test((await key(page)).move); };
      ok(await says('quakes', /Nothing moves: every earthquake of the list stands as a ring/), 'reduced motion: earthquakes all stand as rings');
      ok(await says('drought', /all 36 ten-day periods of 2022 side by side/) && await says('airday', /all 24 hours/) && await says('aerosol', /every day of July 2022/), 'reduced motion: a replay becomes a panel with the whole period side by side');
      ok(await says('vehicles', /Nothing moves/) && await says('buses', /Nothing moves/) && await says('met', /longer arrow is stronger wind/), 'reduced motion: vehicles, buses and wind are explained as still marks');
      const pop = await ink(page, 'population'), dr = await ink(page, 'drought');
      ok(pop.lit > 300 && dr.lit > 500, 'reduced motion: the still pictures are complete (' + pop.lit + ', ' + dr.lit + ')');
      ok(errs.length === 0, 'reduced motion: the page threw nothing (' + errs.slice(0, 3).join(' | ') + ')');
      await ctx.close();
    }

    /* ---------- the three feeds that are off in test mode, fed by this test (labelled demo) ---------- */
    {
      const feeds = TEST_FEEDS(real);
      const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } }), page = await ctx.newPage(), errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      for (const id of Object.keys(feeds)) await page.route('**/api/stack/' + id, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feeds[id]) }));
      await page.goto(srv.base + '/stack.html?tour=0', { waitUntil: 'load' });
      await H.until(page, () => !!window.__embedReady && window.__sheets().loaded.length >= 6);
      await solo(page, 'hotspots'); await wait(600);
      let k = await key(page); const h1 = await ink(page, 'hotspots'); await wait(1600); const h2 = await ink(page, 'hotspots');
      ok(k.state === 'demo' && /call 112/.test(k.text) && /not a confirmed fire/.test(k.text) && /does not spread and is not a flame/.test(k.text), 'hotspots: the key says "not a confirmed fire", "call 112", and that the glow is not a flame');
      ok(h1.lit > 20 && h1.sum !== h2.sum, 'hotspots: a live sighting glows slowly');
      await solo(page, 'burnt'); await wait(600); k = await key(page); const b1 = await ink(page, 'burnt'); await wait(1000); const b2 = await ink(page, 'burnt');
      ok(/ha\)/.test(k.scale) && /not the shape of the burn/.test(k.text) && b1.lit > 50 && b1.sum === b2.sum, 'burnt areas: circles by hectares that stand still, and the key says a circle is not the shape');
      await solo(page, 'airq'); await wait(600); k = await key(page);
      ok(/µg\/m³/.test(k.scale) && /not yet verified/.test(k.text) && /never to be held against the readings inside a classroom/.test(k.text) && k.modes.join() === 'pm25:true,pm10:false', 'air stations: µg/m³, not yet verified, one pollutant at a time, and never against indoor readings');
      // an answer that is there but empty says "none seen", never "no fire"
      await page.unroute('**/api/stack/fire-hotspots');
      ok(errs.length === 0, 'fed by the test: the page threw nothing (' + errs.slice(0, 3).join(' | ') + ')');
      await ctx.close();
    }
  } catch (e) { fail++; console.log('FAIL: the run stopped: ' + (e && e.stack)); }
  finally { await b.close(); srv.stop(); }
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
