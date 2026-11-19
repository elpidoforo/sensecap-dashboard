'use strict';
/* The data stack: the whole region, the sea and the air.
   - the box is the region; the land around Cyprus comes from /api/terrain and says "demo" in test mode; "Region" and "Cyprus" move the view;
   - aeroplanes: anonymous arrows lifted by height, moved between refreshes by arithmetic the key owns up to, and never in /layers/api/*;
   - waves: crests only at the sea model's points, never on land; a model, not a measurement;
   - seabed: with no grid file the floor is not drawn (only the three real profile lines); with a grid (a TEST-ONLY fixture here) depths in metres;
   - ships: published port statistics; nothing on that sheet travels.
   Real server in demo mode, real browser. Run: node tests/stack/sea_air_test.js */
const fs = require('fs'), path = require('path');
const H = require('./_helper');
const PORT = Number(process.env.STACK_TEST_PORT) || 3979;
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const { wait } = H;
const solo = (page, id) => page.evaluate((x) => { if (document.getElementById('legend').dataset.layer !== x) document.querySelector('.row[data-id="' + x + '"] .solo').click(); }, id);
const key = (page) => page.evaluate(() => { const L = document.getElementById('legend'); return { layer: L.dataset.layer, state: L.dataset.state, text: L.innerText, scale: L.querySelector('.lg-scale') ? L.querySelector('.lg-scale').innerText : '' }; });

(async () => {
  const srv = await H.start(PORT), b = await H.chromium.launch({ args: H.GL });
  try {
    /* ---------- privacy first: the aeroplanes never reach the layers API ---------- */
    const air = await (await fetch(srv.base + '/api/aircraft')).json();
    ok(Array.isArray(air.points) && air.points.length > 0 && air.mock === true, 'aircraft: the test server hands out demo points (' + (air.points || []).length + ')');
    ok(air.points.every((p) => !('callsign' in p) && !('hex' in p) && !('flight' in p) && !('r' in p)), 'aircraft: no callsign, no hex id and no registration in a point');
    for (const u of ['/layers/api/live', '/layers/api/sources', '/layers/api/status', '/layers/api/context', '/layers/api/rivers']) {
      const r = await fetch(srv.base + u), t = await r.text();
      ok(!/aircraft|adsb|aeroplane|airplane/i.test(t), 'aircraft: ' + u + ' (HTTP ' + r.status + ') does not mention them');
    }
    ok(!fs.readdirSync(path.join(H.ROOT, 'sources')).some((f) => /adsb|aircraft/i.test(f) || /adsb\.fi|aircraft/i.test(fs.readFileSync(path.join(H.ROOT, 'sources', f), 'utf8'))), 'aircraft: no source file registers them');
    ok(!/aircraft|adsb/i.test(fs.readFileSync(path.join(H.ROOT, 'layers.js'), 'utf8')), 'aircraft: layers.js does not know them');

    for (const el of [false, true]) {
      const name = el ? 'greek' : 'english';
      const { page, errs, ctx } = await H.open(b, srv.base, { query: 'tour=0' + (el ? '&lang=el' : '') });
      await H.until(page, () => window.__sheets().terrain !== 'none' && window.__sheets().sea > 0 && window.__aircraft().n > 0 && !!window.__sheets().ships);

      /* ---------- the region ---------- */
      const R = await page.evaluate(() => window.__region());
      ok(Math.abs(R.box.lat0 - 33.3) < 1e-9 && Math.abs(R.box.lat1 - 36.8) < 1e-9 && Math.abs(R.box.lng0 - 31.0) < 1e-9 && Math.abs(R.box.lng1 - 36.3) < 1e-9, name + ': the box is 33.3-36.8 N, 31.0-36.3 E');
      ok(R.view === 'region' && R.terrain === 'demo', name + ': the page opens on the whole region, and knows the land around Cyprus is a demo stand-in here');
      ok(R.island.w < R.sheet.w * 0.6, name + ': Cyprus is a part of the sheet, not all of it');
      const land = await page.evaluate(() => [window.__landAt(33.3, 35.0), window.__landAt(32.0, 33.6), window.__landAt(33.3, 36.7), window.__landAt(36.2, 34.2)]);
      ok(land[0] === 'cyprus' && land[1] === 'sea', name + ': Cyprus is Cyprus and open water is sea (' + land.join(', ') + ')');
      ok(land[2] === 'land' && land[3] === 'land', name + ': the grid gives land to the north and to the east');
      const gen = (await key(page)).text;
      ok(el ? /Δοκιμή: η στεριά/.test(gen) : /Demo: the land drawn around Cyprus/.test(gen), name + ': the key says the neighbouring land is a demo shape');
      // the two view controls, by keyboard
      await page.focus('#view-cyprus'); await page.keyboard.press('Enter'); await wait(1600);
      const C = await page.evaluate(() => window.__region());
      ok(C.view === 'cyprus' && C.dist < R.dist * 0.75 && await page.evaluate(() => document.getElementById('view-cyprus').getAttribute('aria-pressed') === 'true'), name + ': "Cyprus" flies in (' + Math.round(R.dist) + ' to ' + Math.round(C.dist) + ')');
      ok(Math.hypot(C.tgt[0] - C.island.x, C.tgt[2] - C.island.z) < 5, name + ': and looks at the island');
      await page.focus('#view-region'); await page.keyboard.press('Enter'); await wait(1600);
      const R2 = await page.evaluate(() => window.__region());
      ok(R2.view === 'region' && Math.abs(R2.dist - R.dist) < 5, name + ': "Region" flies back out');
      ok(await page.evaluate(() => [document.getElementById('view-region'), document.getElementById('view-cyprus')].every((x) => x.tabIndex >= 0 && (x.title || '').length > 5)), name + ': both controls can be reached and say what they do');

      /* ---------- nothing is painted outside a model's grid ---------- */
      const live = (await (await fetch(srv.base + '/layers/api/live')).json()).map;
      const lats = live.wind.map((q) => q.lat), lngs = live.wind.map((q) => q.lng);
      ok(live.wind.length === 140 && Math.min(...lats) === 34 && Math.max(...lats) === 36.25 && Math.min(...lngs) === 31.8 && Math.max(...lngs) === 35.05, name + ': the weather grid is 140 points, 34.0-36.25 N, 31.8-35.05 E');
      await page.click('#all'); await wait(2500);
      for (const id of ['wind', 'cloud', 'air', 'rain']) {
        const out = await page.evaluate((x) => [window.__inkAt(x, 31.2, 33.5), window.__inkAt(x, 36.1, 36.6), window.__inkAt(x, 35.8, 33.5)], id);
        ok(out.every((o) => o && o.alpha === 0), name + ': ' + id + ' paints nothing outside its grid');
      }
      ok(await page.evaluate(() => window.__windAt(31.2, 33.5) === null && window.__windAt(33.3, 35.0) !== null), name + ': the wind has a value inside the grid and none outside');

      /* ---------- waves ---------- */
      ok(live.sea.length === 22 && live.sea.every((q) => typeof q.dir === 'number' && typeof q.period === 'number'), name + ': the sea feed has 22 points with a wave direction and period (demo values here)');
      await solo(page, 'waves'); await wait(1500);
      let k = await key(page);
      ok(k.state === 'model' && /(MODEL|ΜΟΝΤΕΛΟ)/.test(k.text) && /°C/.test(k.scale), name + ': waves say they are a model, with a scale in °C');
      ok(el ? /Οι κορυφές ταξιδεύουν/.test(k.text) && /όχι σημαδούρα/.test(k.text) : /crests travel the way the model says/.test(k.text) && /not a buoy/.test(k.text), name + ': the key says what the travelling crests mean, and that nobody measured them');
      const sheets = await page.evaluate(() => window.__sheets());
      ok(sheets.waves === 22 && sheets.sea === 22, name + ': every sea point is drawn with crests');
      const onLand = await page.evaluate(() => [window.__inkAt('waves', 33.0, 34.95, 4), window.__inkAt('waves', 33.3, 36.7, 4)]);
      ok(onLand.every((o) => o.alpha < 40 || (o.rgb[0] < 215)), name + ': no crest is drawn over land');
      const w1 = await page.evaluate(() => window.__sheetInk('waves').sum); await wait(900); const w2 = await page.evaluate(() => window.__sheetInk('waves').sum);
      ok(w1 !== w2, name + ': the crests move');

      /* ---------- ships: nothing travels ---------- */
      await solo(page, 'ships'); await wait(1200);
      k = await key(page);
      ok(k.state === 'published' && /Eurostat/.test(k.text) && /mar_tf_qm/.test(k.text) && /mar_go_qm_cy/.test(k.text), name + ': ports name Eurostat and both tables');
      ok(el ? /ρυθμός ενός περασμένου τριμήνου, όχι πλοία που φτάνουν τώρα/.test(k.text) : /pace of a past quarter, not ships arriving now/.test(k.text), name + ': the key says the pulse is the pace of a past quarter');
      ok(el ? /Δεν σχεδιάζεται κανένα πλοίο/.test(k.text) && /χιλιάδες τόνους/.test(k.text) : /No ship is drawn/.test(k.text) && /thousand tonnes/.test(k.text), name + ': and that no ship is drawn; units are thousand tonnes');
      const ports = sheets.ships;
      ok(ports.length === 5 && ports.filter((q) => q.arrivals != null).length === 2 && ports.filter((q) => q.ended).length === 1, name + ': five ports, two with arrivals, one ended');
      ok(ports.filter((q) => q.arrivals != null).every((q) => Math.abs(q.pulseS * q.perDay - 8) < 1e-6 && Math.abs(q.perDay - q.arrivals / ({ 1: 90, 2: 91, 3: 92, 4: 92 })[q.arrQ.slice(-1)]) < 0.2), name + ': the pulse is 8 seconds for one arrival a day, from arrivals divided by the days of the quarter');
      const p1 = await page.evaluate(() => window.__sheets().ships.map((q) => q.xy.concat(q.ring))); await wait(1200);
      const p2 = await page.evaluate(() => window.__sheets().ships.map((q) => q.xy.concat(q.ring)));
      ok(JSON.stringify(p1) === JSON.stringify(p2), name + ': no port mark and no ring changes place or size from one moment to the next');
      const far = await page.evaluate(() => [window.__inkAt('ships', 35.5, 35.9), window.__inkAt('ships', 31.3, 36.3)]);
      ok(far.every((o) => o.alpha === 0), name + ': nothing is drawn on the ships sheet away from its ports and its panel');

      /* ---------- aeroplanes ---------- */
      await solo(page, 'aircraft'); await wait(1200);
      k = await key(page);
      ok(k.state === 'demo' && /(DEMO DATA|ΔΕΔΟΜΕΝΑ ΕΠΙΔΕΙΞΗΣ)/.test(k.text), name + ': demo aeroplanes say they are demo data');
      ok(el ? /υπολογίζεται από ταχύτητα και κατεύθυνση, δεν παρατηρείται/.test(k.text) : /worked out from speed and direction, not observed/.test(k.text), name + ': the key says the in-between movement is worked out, not observed');
      ok(el ? /δεν σημαίνει ότι ο ουρανός είναι άδειος/.test(k.text) && /κενά/.test(k.text) : /does not mean an empty sky/.test(k.text) && /gaps/.test(k.text), name + ': and that coverage has gaps and a missing aeroplane is not an empty sky');
      ok(/adsb\.fi/.test(k.text) && /10[.,]000 ft/.test(k.text), name + ': it credits adsb.fi and states the height scale');
      const a1 = await page.evaluate(() => window.__aircraft());
      ok(a1.n === air.points.length && a1.demo === true, name + ': one mark for each point of the feed');
      const flying = a1.pts.filter((q) => q.altFt != null && q.phase !== 'ground' && q.phase !== 'unknown');
      ok(flying.length > 0 && flying.every((q) => Math.abs((q.y - a1.sheetY - 1.5) - q.altFt * a1.yPerFt) < 0.01), name + ': an arrow is lifted by its real height on the stated scale');
      ok(flying.filter((q) => q.track != null).every((q) => Math.abs((((q.heading - q.track) % 360) + 540) % 360 - 180) < 0.01), name + ': and points along its track');
      await wait(2500);
      const a2 = await page.evaluate(() => window.__aircraft());
      const mover = a2.pts.find((q) => q.moves);
      ok(!!mover && (mover.lat !== mover.lat0 || mover.lng !== mover.lng0), name + ': between refreshes an aeroplane with speed and track is moved along');
      ok(a2.pts.filter((q) => !q.moves).every((q) => q.lat === q.lat0 && q.lng === q.lng0), name + ': one without them stays where it was heard');
      ok(errs.length === 0, name + ': the page threw nothing (' + errs.slice(0, 3).join(' | ') + ')');
      await ctx.close();
    }

    /* ---------- seabed, state one: no grid file ---------- */
    {
      const { page, errs, ctx } = await H.open(b, srv.base, { query: 'tour=0' });
      await H.until(page, () => window.__sheets().loaded.includes('seabed') && window.__stack().answers.some((a) => a.id === 'seabed-profiles'));
      await solo(page, 'seabed'); await wait(1500);
      const k = await key(page), s = await page.evaluate(() => window.__sheets());
      ok(s.seabed === null, 'seabed: with no grid file no depth grid is loaded');
      ok(/No depth grid has been loaded, so the sea floor itself is not drawn/.test(k.text) && /Only the three coloured lines are depths/.test(k.text), 'seabed: the key says the floor is not drawn and that only the three lines are depths');
      ok(/estimates, not soundings/.test(k.text), 'seabed: the honesty line of the profiles is shown');
      ok(!/published depth grid/.test(await page.evaluate(() => document.querySelector('.row[data-id="seabed"]').innerText)), 'seabed: the rail does not claim a published grid');
      const ink = await page.evaluate(() => [window.__inkAt('seabed', 33.72, 34.912, 2), window.__inkAt('seabed', 31.6, 33.7, 2)]);
      ok(ink[0].rgb[2] > ink[1].rgb[2] + 15 || ink[0].rgb[1] > ink[1].rgb[1] + 15, 'seabed: a profile line is drawn off Larnaka, and open sea elsewhere stays a dark floor');
      ok(errs.length === 0, 'seabed: the page threw nothing (' + errs.slice(0, 3).join(' | ') + ')');
      await ctx.close();
    }
    /* ---------- seabed, state two: a grid arrives (a TEST-ONLY fixture, handed to the page by the test) ---------- */
    {
      const fixture = fs.readFileSync(path.join(__dirname, 'seabedgrid.TEST-ONLY.fixture.json'), 'utf8');
      const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } }), page = await ctx.newPage(), errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.route('**/api/fieldwork/seabedgrid', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: fixture }));
      await page.goto(srv.base + '/stack.html?tour=0', { waitUntil: 'load' });
      await H.until(page, () => !!window.__embedReady && !!window.__sheets().seabed);
      await solo(page, 'seabed'); await wait(1500);
      const k = await key(page), s = await page.evaluate(() => window.__sheets());
      ok(s.seabed && s.seabed.testOnly === true && s.seabed.cells > 20 && s.seabed.deepest > 100, 'seabed: the grid is read (' + (s.seabed && s.seabed.cells) + ' sea cells)');
      ok(k.state === 'demo' && /Test fixture, not real depths/.test(k.text) && !/EMODnet Bathymetry · published/.test(k.text), 'seabed: a test fixture is labelled as one and is not called EMODnet');
      ok(/ m/.test(k.scale) && /3000/.test(k.scale), 'seabed: the scale is in metres');
      ok(/Nothing moves here/.test(k.text), 'seabed: nothing moves');
      const d = await page.evaluate(() => [window.__inkAt('seabed', 32.0, 33.7, 2), window.__inkAt('seabed', 33.3, 35.0, 2)]);
      ok(d[0].alpha > 200 && d[0].rgb[2] > d[0].rgb[0], 'seabed: the sea is coloured by depth');
      const i1 = await page.evaluate(() => window.__sheetInk('seabed').sum); await wait(800); const i2 = await page.evaluate(() => window.__sheetInk('seabed').sum);
      ok(i1 === i2, 'seabed: the picture stands still');
      ok(errs.length === 0, 'seabed with a grid: the page threw nothing (' + errs.slice(0, 3).join(' | ') + ')');
      await ctx.close();
    }
  } catch (e) { fail++; console.log('FAIL: the run stopped: ' + (e && e.stack)); }
  finally { await b.close(); srv.stop(); }
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
