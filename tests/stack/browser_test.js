'use strict';
/* The data stack in 3D (#/stack and /stack.html): the page is served under the import-map policy, the 3D view starts,
   every layer is listed with its source, the buttons hide and show layers, and the whole thing speaks Greek.
   The wider region, the sea and the air have their own file beside this one (sea_air_test.js), and so have the sheets fed by
   /api/stack (sheets_test.js). This file switches every sheet on first ("ALL"), so it checks the whole list at once.
   The key: every layer has a caption, a scale with units, a line on what its motion means and a line on its source, in both
   languages; the painted sheets draw only what the feed holds; reduced motion gets a still picture; no data says so.
   Real server in demo mode, real browser.
   Run: node tests/stack/browser_test.js */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), PORT = Number(process.env.STACK_TEST_PORT) || 3979, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'];
const N = 30;   // the sheets of the stack, from the seabed up to the satellite picture

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-'));
  const srv = spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', SATELLITE: '0', DATA_DIR: dir, ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/stack.html'); if (r.ok) break; } catch (e) { /* not up yet */ } await wait(300); }
  const b = await chromium.launch({ args: GL });
  try {
    // served, and under the policy the import map needs
    const r = await fetch(BASE + '/stack.html');
    const csp = r.headers.get('content-security-policy') || '';
    ok(r.ok, 'the 3D page is served');
    ok(/script-src 'self' 'sha256-/.test(csp), 'its scripts are its own, plus one hash for the import map');
    ok(!/unsafe-inline/.test(csp.split('style-src')[0]), 'no inline script is allowed');
    ok(/default-src 'self'/.test(csp) && !/https?:\/\//.test(csp), 'nothing may be loaded from another host');
    // inside another page the scene takes that page's background instead of its own black
    const onSite = await (await fetch(BASE + '/stack.html?embed=1&bg=site')).text();
    ok(/on-site/.test(onSite), 'the page can be asked to sit on the background of the page that holds it');
    const html = await (await fetch(BASE + '/stack.html')).text();
    ok(/\/vendor\/three-r160\//.test(html) && !/cdn|unpkg|jsdelivr/i.test(html), 'three.js is served from this site, not from a CDN');
    ok((await fetch(BASE + '/stack-app.js')).ok && (await fetch(BASE + '/stack-guard.js')).ok, 'the module and its guard are served');

    for (const [name, el, phone] of [['desktop', false, false], ['greek', true, false], ['phone', false, true]]) {
      const ctx = await b.newContext(phone ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 860 } });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + '#/stack', { waitUntil: 'load', timeout: 60000 });
      let frame = null;
      for (let i = 0; i < 80 && !frame; i++) { frame = p.frames().find((f) => f.url().includes('stack.html')); if (!frame) await wait(250); }
      ok(!!frame, name + ': the 3D view is shown in its own frame');
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) { ready = await frame.evaluate(() => !!window.__embedReady).catch(() => false); if (!ready) await wait(250); }
      ok(ready, name + ': the 3D view started');
      ok(await frame.locator('.lay').count() === N, name + ': every layer is listed');
      // the page opens on a smaller set, with the tour running; here the tour is stopped and every sheet is switched on
      const opening = await frame.evaluate(() => ({ on: window.__sheets().on, def: window.__sheets().opening, built: window.__sheets().built, main: document.getElementById('opening').getAttribute('aria-pressed'), tour: window.__sheets().tour }));
      ok(opening.on.length === opening.def.length && opening.on.length >= 8 && opening.on.length < N && opening.main === 'true', name + ': the page opens on a set of ' + opening.on.length + ' sheets, not on all ' + N);
      ok(opening.built.every((id) => opening.on.includes(id)), name + ': and only those sheets have been made');
      ok(opening.tour === true, name + ': the tour starts by itself');
      await frame.evaluate(() => document.getElementById('all').click());
      ok(await frame.evaluate(() => window.__sheets().tour === false && document.getElementById('hint').hidden), name + ': pressing anything stops the tour');
      for (let i = 0; i < 80; i++) { if (await frame.evaluate(() => window.__sheets().loaded.length >= 22 && window.__stack().answers.length >= 21)) break; await wait(300); }
      ok(await frame.evaluate(() => window.__sheets().on.length) === N, name + ': "ALL" switches every sheet on');
      const srcs = await frame.locator('.lay small').allTextContents();
      ok(srcs.length === N && srcs.every((s) => s.trim().length > 3), name + ': every layer says where it comes from');
      // the list is in bands that fold; on a phone they start folded so the scene is not hidden behind the list
      const folds = await frame.evaluate(() => [...document.querySelectorAll('.band')].map((h) => ({ open: h.getAttribute('aria-expanded'), shown: !document.getElementById(h.getAttribute('aria-controls')).hidden, text: h.innerText })));
      ok(folds.length === 5 && folds.every((f) => (f.open === 'true') === f.shown && (f.open === 'true') === !phone), name + ': the five bands are ' + (phone ? 'folded' : 'open') + ' to start with, and say so');
      ok(folds.every((f) => (el ? /[Α-Ω]/.test(f.text) : /^[A-Z]+\s*\d+$/.test(f.text.replace(/\n/g, ' ').trim()))), name + ': each band is named in the reader\'s language, with its count (' + folds.map((f) => f.text.replace(/\n/g, ' ')).join(', ') + ')');
      if (phone) { for (let i = 0; i < 5; i++) { await frame.locator('.band').nth(i).focus(); await p.keyboard.press('Enter'); }
        ok(await frame.evaluate(() => [...document.querySelectorAll('.band')].every((h) => h.getAttribute('aria-expanded') === 'true' && !document.getElementById(h.getAttribute('aria-controls')).hidden)), 'phone: the keyboard unfolds every band'); }
      ok(errs.length === 0, name + ': the page threw nothing (' + errs.join(' | ') + ')');

      // the sheets that are fed by real readings, and the ones that say they are not
      for (let i = 0; i < 60; i++) { if (await frame.evaluate(() => /min ago|just now|πριν|μόλις/.test(document.querySelector('.rail').innerText))) break; await wait(300); }
      const vals = await frame.locator('.lay .val').allTextContents();
      const measured = vals.filter((v) => /min ago|h ago|just now|πριν|μόλις/.test(v));
      const drawn = vals.filter((v) => /drawn|σχεδιασμένο/.test(v));
      const other = vals.filter((v) => /published|δημοσιευμένα|DEMO|ΕΠΙΔΕΙΞΗ|ΔΟΚΙΜΗ|no depth grid|χωρίς πλέγμα βάθους|timetable|δρομολόγιο|delayed|καθυστέρηση|no data now|χωρίς δεδομένα τώρα/.test(v) && !/min ago|h ago|just now|πριν|μόλις|drawn|σχεδιασμένο/.test(v));
      ok(measured.length >= 3, name + ': the measured sheets show a real reading with its age (' + measured.length + ')');
      ok(drawn.length >= 2, name + ': the sheets with no feed say they are drawn (' + drawn.length + ')');
      ok(other.length >= 18, name + ': the other sheets say what they are: published, a timetable, delayed, demo, or no data now (' + other.length + ')');
      ok(measured.length + drawn.length + other.length === N, name + ': every layer says which of these it is (' + vals.filter((v) => !measured.includes(v) && !drawn.includes(v) && !other.includes(v)).join(' | ') + ')');
      ok(measured.every((v) => /[0-9]/.test(v)), name + ': a measured sheet shows a number');
      const rail = await frame.evaluate(() => document.querySelector('.rail').innerText);
      ok(/sensecap|cydom|openmeteo|metar/.test(rail), name + ': the rail names the source each reading came from');
      const probe = await frame.evaluate(() => document.querySelector('.probe').innerText);
      ok(/[0-9]/.test(probe) && /(ago|now|πριν|μόλις)/.test(probe), name + ': the probe shows the newest readings with their age');

      // two sources that disagree are drawn as a pair, and every pin carries the age of its reading
      let twins = 0;
      for (let i = 0; i < 40; i++) { twins = await frame.evaluate(() => window.__twins || 0); if (twins) break; await wait(300); }
      ok(twins > 0, name + ': a disagreement between two sources is drawn where it happens (' + twins + ')');
      const halos = await frame.evaluate(() => window.__halos || 0);
      ok(halos > 0, name + ': the school pins carry the age of their newest reading (' + halos + ')');
      // the sky: a bearing for the wind, and the model's rain and cloud, each saying which it is
      const railText = await frame.evaluate(() => document.querySelector('.rail').innerText);
      ok(/(model|μοντέλο)/.test(railText), name + ': a sheet fed by the model says so rather than calling itself measured');
      const windCard = await frame.evaluate(() => [...document.querySelectorAll('.lay')].find((x) => /Wind at 10|Άνεμος/.test(x.innerText)).title);
      ok(/\d+°/.test(windCard) && /(airports|measured|μοντέλο|model|αεροδρόμια)/.test(windCard), name + ': the wind sheet names the bearing and where it came from (' + windCard + ')');
      const probe2 = await frame.evaluate(() => document.querySelector('.probe').innerText);
      ok(/(from|από)\s*\d+°/.test(probe2), name + ': the probe says which way the wind is blowing, beside how hard');
      const rainCard = await frame.evaluate(() => [...document.querySelectorAll('.lay')].find((x) => /Rain this hour|Βροχή/.test(x.innerText)).innerText);
      ok(/(MM|mm)/.test(rainCard) && /(model|μοντέλο)/.test(rainCard), name + ': the rain sheet shows millimetres from the model (' + rainCard.replace(/\n/g, ' ') + ')');
      const cloudCard = await frame.evaluate(() => [...document.querySelectorAll('.lay')].find((x) => /Clouds|Σύννεφα/.test(x.innerText)).innerText);
      ok(/%/.test(cloudCard) && /(model|μοντέλο)/.test(cloudCard), name + ': the cloud sheet shows the cover the model reports');

      // the ages keep running while the page is open, even when no new reading arrives
      const fresh = await frame.evaluate(() => document.querySelector('.probe').innerText);
      const moved = await frame.evaluate(() => ({ w0: window.__haloWidth(), on: window.__ageForward(200) }));
      const later = await frame.evaluate(() => document.querySelector('.probe').innerText);
      ok(fresh !== later && /(h ago|ώ)/.test(later), name + ': a reading grows older while nobody fetches a new one');
      ok(moved.on.halo >= moved.w0 && moved.on.halo > 1.9, name + ': and the ring around the school is at its widest once the reading is hours old (' + moved.w0.toFixed(2) + ' to ' + moved.on.halo.toFixed(2) + ')');

      // a reading that lands travels up the beam of the source it came from
      let sent = 0;
      for (let i = 0; i < 30; i++) { sent = await frame.evaluate(() => (window.__pulses ? window.__pulses() : 0)); if (sent) break; await wait(300); }
      ok(sent > 0, name + ': a reading that arrives travels up the beam from its source (' + sent + ')');
      const bars = await frame.evaluate(() => [...document.querySelectorAll('.lay .go')].map((b2) => parseFloat(b2.style.width) || 0));
      ok(bars.length === N && bars.some((w) => w > 0), name + ': a sheet shows how far it is through the wait for its next reading');

      // the bearings are averaged the way angles have to be
      const bear = await frame.evaluate(() => [window.__meanBearing([350, 10]), window.__meanBearing([90, 90]), window.__meanBearing([])]);
      ok(Math.min(Math.abs(bear[0]), Math.abs(360 - bear[0])) < 0.001, name + ': 350° and 10° average to 0°, not to 180° (' + bear[0] + ')');
      ok(Math.abs(bear[1] - 90) < 0.001 && bear[2] === null, name + ': one bearing stays itself, and no bearing is no answer');

      // one sheet on its own, with what every city has for it
      await frame.evaluate(() => { const b2 = [...document.querySelectorAll('.row')].find((r) => /Air quality|Ποιότητα/.test(r.innerText)); b2.querySelector('.solo').click(); });
      await wait(600);
      const alone = await frame.evaluate(() => [...document.querySelectorAll('.lay')].filter((x) => x.getAttribute('aria-pressed') === 'true').length);
      ok(alone === 1, name + ': the solo button leaves one sheet on its own (' + alone + ')');
      const open2 = await frame.evaluate(() => { const c = [...document.querySelectorAll('.cities')].find((x) => !x.hidden); return c ? c.innerText : ''; });
      ok(/Larnaka|Λάρνακα/.test(open2) && /(Paphos|Πάφος)/.test(open2), name + ': and lists what every city has for it');
      ok(/[0-9]/.test(open2) && /(openmeteo|sensecap|cydom|metar|drawn|σχεδιασμένο|nothing|τίποτα)/.test(open2), name + ': with the source of each reading beside it');
      await frame.evaluate(() => { const b2 = [...document.querySelectorAll('.row')].find((r) => /Air quality|Ποιότητα/.test(r.innerText)); b2.querySelector('.solo').click(); });
      await wait(500);
      ok(await frame.evaluate(() => [...document.querySelectorAll('.lay')].every((x) => x.getAttribute('aria-pressed') === 'true')), name + ': pressing it again brings the others back');

      // the key: before any sheet is chosen it says how to read the stack and offers the layers one by one
      const gen = await frame.evaluate(() => document.getElementById('legend').innerText);
      ok(el ? /ένα ένα/.test(gen) : /one by one/.test(gen), name + ': the key offers to show the layers one by one');
      // what the painted sheets stand on: only numbers that are in the feed
      const feedNow = await frame.evaluate(async () => (await (await fetch('/layers/api/live')).json()).map);
      const st0 = await frame.evaluate(() => window.__sheets());
      ok(st0.wind && st0.cloud && st0.air && st0.rainKnown, name + ': wind, rain, cloud and air are painted from the model grid');
      ok(st0.rainCells === feedNow.wind.filter((q) => q.rain > 0).length, name + ': rain is drawn in exactly the grid cells the model gives rain to (' + st0.rainCells + ')');
      ok(st0.sea === feedNow.sea.length && st0.stations === feedNow.stations.filter((q) => q.temp != null).length, name + ': one mark per sea point and per station in the feed (' + st0.sea + ', ' + st0.stations + ')');
      ok(st0.specks > 0 && st0.beamsLive > 0, name + ': specks follow the particles, and only a reporting source has dots on its beam (' + st0.specks + ', ' + st0.beamsLive + ')');
      // the moving lines go the way the model says the wind blows, at its speed
      const gp = feedNow.wind.filter((q) => q.lat > 34.7 && q.lat < 35.5 && q.lng > 32.5 && q.lng < 34.3)[3];
      const drawnWind = await frame.evaluate((q) => window.__windAt(q.lng, q.lat), gp);
      const turn = Math.abs(((drawnWind.from - gp.wd + 540) % 360) - 180);
      ok(turn < 20 && Math.abs(drawnWind.ms - gp.ws) < 1.5, name + ': at a grid point the drawn wind matches the feed (' + Math.round(drawnWind.from) + '° ' + drawnWind.ms.toFixed(1) + ' m/s against ' + gp.wd + '° ' + gp.ws + ' m/s)');

      // one by one: every layer has a caption, says what moves, and says what it stands on
      await frame.evaluate(() => document.querySelector('#legend .lg-go').click());
      await wait(400);
      const seen = [];
      for (let i = 0; i < N; i++) {
        seen.push(await frame.evaluate(() => { const L = document.getElementById('legend'), q = (s) => (L.querySelector(s) ? L.querySelector(s).innerText : '');
          return { id: L.dataset.layer, state: L.dataset.state, cap: q('.lg-cap'), move: q('.lg-move'), scale: q('.lg-scale'), src: q('.lg-state'), all: L.innerText,
            alone: [...document.querySelectorAll('.lay')].filter((x) => x.getAttribute('aria-pressed') === 'true').length }; }));
        if (i === 0) { await frame.locator('#legend .lg-next').focus(); await p.keyboard.press('Enter'); }   // the keyboard steps as well as the mouse
        else await frame.evaluate(() => document.querySelector('#legend .lg-next').click());
        await wait(250);
      }
      const by = (id) => seen.find((x) => x.id === id) || {};
      ok(new Set(seen.map((x) => x.id)).size === N && seen.every((x) => x.alone === 1), name + ': the key steps through all ' + N + ' layers, one at a time');
      ok(seen[0].id === 'seabed' && seen[N - 1].id === 'sat' && seen[0].all.includes('1 / ' + N) && seen[N - 1].all.includes(N + ' / ' + N), name + ': from the seabed up to the satellite, counting as it goes');
      ok(await frame.evaluate(() => document.getElementById('legend').contains(document.activeElement)), name + ': and the keyboard stays inside the key while it steps');
      ok(seen.every((x) => x.cap.length > 30 && x.move.length > 20 && x.src.length > 15), name + ': every layer has a caption, a line on motion and a line on its source');
      ok(seen.filter((x) => x.state !== 'none').every((x) => x.id === 'sat' || x.id === 'ships' || x.id === 'aircraft' || x.scale.length > 8), name + ': every sheet with data shows a scale or says what a mark stands for, with its unit (' + seen.filter((x) => x.state !== 'none' && !x.scale).map((x) => x.id).join(', ') + ')');
      const greek = /[α-ωά-ώ]/, latinWords = /\b(the|and|from|with|where)\b/i;
      ok(seen.every((x) => (el ? greek.test(x.cap) && greek.test(x.move) && greek.test(x.src) && !latinWords.test(x.cap + x.move) : !greek.test(x.all))), name + ': the key speaks ' + (el ? 'Greek' : 'English') + ' throughout');
      const units = { wind: 'm/s', rain: 'mm', cloud: '%', air: 'µg/m³', waves: '°C', island: '°C' };
      ok(Object.keys(units).every((id) => by(id).scale.includes(units[id]) && /[0-9]/.test(by(id).scale)), name + ': every fed layer shows a colour scale with numbers and its unit');
      ok(['wind', 'rain', 'cloud', 'air', 'waves'].every((id) => by(id).state === 'model' && /(MODEL|ΜΟΝΤΕΛΟ)/.test(by(id).src)), name + ': a sheet painted from a model says it is a model, not a measurement');
      ok(by('ships').state === 'published' && /(PUBLISHED|ΔΗΜΟΣΙΕΥΜΕΝΑ)/.test(by('ships').src) && by('aircraft').state === 'demo' && /(DEMO|ΕΠΙΔΕΙΞΗΣ)/.test(by('aircraft').src), name + ': published figures say "published", made-up test points say "demo"');
      ok(by('seabed').state === 'published' && /(No depth grid has been loaded|Δεν έχει φορτωθεί πλέγμα βάθους)/.test(by('seabed').src) && /(three coloured lines|τρεις χρωματιστές γραμμές)/.test(by('seabed').src), name + ': with no depth file the seabed says the floor is not drawn and that only the three profile lines are depths');
      ok(by('island').state === 'measured' && /[0-9]/.test(by('island').src), name + ': the stations sheet says it is measured, and by how many stations');
      ok(['heat', 'veg'].every((id) => by(id).state === 'none' && by(id).scale === '' && /(NO LIVE DATA|ΧΩΡΙΣ ΖΩΝΤΑΝΑ ΔΕΔΟΜΕΝΑ)/.test(by(id).src)), name + ': a sheet with no feed says "no live data", shows no scale and claims no motion');
      ok(/(lines travel|γραμμές ταξιδεύουν)/.test(by('wind').move) && /(only inside|μόνο μέσα)/.test(by('rain').move), name + ': the key says what the motion of wind and rain means');
      if (phone) {
        const box = await frame.evaluate(() => { const r = document.getElementById('legend').getBoundingClientRect(); return { top: r.top / innerHeight, bottom: r.bottom / innerHeight }; });
        ok(box.top > 0.3 && box.bottom <= 1.01, 'phone: with one sheet on show the key keeps to the lower part and leaves the sheet in view (' + box.top.toFixed(2) + ' to ' + box.bottom.toFixed(2) + ')');
      }
      await frame.evaluate(() => document.querySelector('#legend .lg-all').click());
      await wait(400);
      ok(await frame.evaluate(() => [...document.querySelectorAll('.lay')].every((x) => x.getAttribute('aria-pressed') === 'true') && !!document.querySelector('#legend .lg-go')), name + ': "All" in the key brings every layer back');
      ok(errs.length === 0, name + ': stepping through the layers threw nothing (' + errs.join(' | ') + ')');

      // the honest view in one press
      await frame.evaluate(() => document.getElementById('measured').click());
      await wait(600);
      const left = await frame.evaluate(() => [...document.querySelectorAll('.lay')].filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.innerText));
      ok(left.length >= 1 && left.length < N, name + ': "measured only" leaves the sheets that stand on a reading (' + left.length + ' of ' + N + ')');
      ok(left.every((x) => !/published|δημοσιευμένα|DEMO|ΕΠΙΔΕΙΞΗ|Aeroplanes|Αεροπλάνα|Seabed|Βάθος/.test(x)), name + ': and neither a published table nor a demo point counts as measured');
      ok(left.every((x) => !/drawn|σχεδιασμένο/.test(x)), name + ': and not one of them is a drawing');
      ok(left.every((x) => !/(model|μοντέλο)/.test(x)), name + ': and not one of them is a model either (' + left.map((x) => x.split('\n')[0]).join(', ') + ')');
      await frame.evaluate(() => document.getElementById('all').click());
      await wait(500);

      // a hidden sheet takes its disagreements with it
      await frame.evaluate(() => document.querySelectorAll('.lay').forEach((x) => { if (x.getAttribute('aria-pressed') === 'true') x.click(); }));
      await wait(600);
      const after = await frame.evaluate(() => window.__twins || 0);
      ok(after === 0, name + ': hiding every sheet takes its disagreements with it (' + twins + ' to ' + after + ')');
      await frame.evaluate(() => document.getElementById('all').click());
      await wait(600);

      if (!phone) {
        // a layer can be hidden and shown again
        const press = () => frame.evaluate(() => document.querySelector('.lay').click());
        const state = () => frame.evaluate(() => document.querySelector('.lay').getAttribute('aria-pressed'));
        ok(await state() === 'true', name + ': layers start switched on');
        await press(); await wait(300);
        ok(await state() === 'false', name + ': pressing a layer switches it off');
        await press(); await wait(300);
        ok(await state() === 'true', name + ': pressing it again switches it back on');
        // a band button keeps the island for reference
        await frame.evaluate(() => document.querySelector('[data-band="AIR"]').click()); await wait(400);   // the bar can sit off the short test viewport
        const on = await frame.evaluate(() => [...document.querySelectorAll('.lay')].filter((b) => b.getAttribute('aria-pressed') === 'true').length);
        ok(on > 0 && on < N, name + ': a band shows some layers and hides the rest (' + on + ')');
        await frame.evaluate(() => document.getElementById('all').click()); await wait(400);
        ok(await frame.evaluate(() => [...document.querySelectorAll('.lay')].every((b) => b.getAttribute('aria-pressed') === 'true')), name + ': "all" brings every layer back');
      }

      if (el) {
        const text = await frame.evaluate(() => document.body.innerText);
        ok(/ΣΤΡΩΜΑΤΑ/.test(text) && /ΔΙΑΣΤΗΜΑ/.test(text) && /ΝΕΡΟ/.test(text), 'greek: the frame speaks Greek');
        ok(/Βυθός|Ανάγλυφο|Άνεμος/.test(text), 'greek: the layers are named in Greek');
        ok(!/LIVE READINGS · DRAWN RELIEF/.test(text), 'greek: the badge is translated too');
        ok(/σχεδιασμένο/.test(text), 'greek: a sheet with no feed says so in Greek');
        const page = await p.evaluate(() => document.body.innerText);
        ok(/Η στοίβα δεδομένων σε 3D/.test(page), 'greek: the page around the frame is Greek as well');
        ok(/σχεδιασμένο/.test(page), 'greek: and it says which sheets are only drawn');
      }

      if (!el && !phone) {
        const page = await p.evaluate(() => document.body.innerText);
        ok(/newest reading Kleanthis holds/.test(page) && /drawn/.test(page), 'the page says which sheets are measured and which are drawn, before you look at them');
        ok(/vehicle|person/.test(page), 'and that no vehicle and no person is drawn');
        const text = await frame.evaluate(() => document.body.innerText);
        ok(/LIVE READINGS · DRAWN RELIEF/.test(text), 'the frame says which parts are measured and which are drawn');
        ok(/EACH LAYER SHOWS ITS SOURCE/.test(text), 'and tells the reader where to look for that');
      }

      if (phone) {
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(over <= 1, 'phone: nothing pushes the page sideways (' + over + ')');
        const fits = await frame.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(fits <= 1, 'phone: the 3D frame fits the screen too (' + fits + ')');
      }
      await ctx.close();
    }

    // reduced motion: nothing tours or flows, and the still picture is explained as a still picture
    {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(BASE + '/stack.html?lang=en', { waitUntil: 'load', timeout: 60000 });
      for (let i = 0; i < 80; i++) { if (await p.evaluate(() => !!window.__embedReady && window.__sheets().wind).catch(() => false)) break; await wait(250); }
      const s1 = await p.evaluate(() => window.__sheets());
      ok(s1.still === true && s1.tour === false, 'reduced motion: the page knows, and the camera does not tour by itself');
      ok(await p.evaluate(() => document.getElementById('tour').getAttribute('aria-pressed') === 'false' && document.getElementById('hint').hidden), 'reduced motion: the tour button and its hint say so');
      await p.evaluate(() => document.querySelector('.row[data-id="wind"] .solo').click());
      await wait(500);
      const mv = await p.evaluate(() => document.querySelector('#legend .lg-move').innerText);
      ok(/arrow/.test(mv) && !/travel/.test(mv), 'reduced motion: the wind is explained as still arrows, not as moving lines (' + mv + ')');
      // the still wind sheet is not empty, and stays the same picture from one moment to the next
      const ink = () => p.evaluate(() => { const t = window.__windInk; return t ? t() : null; });
      const a1 = await ink(); await wait(700); const a2 = await ink();
      ok(a1 && a1.lit > 200 && a1.sum === a2.sum, 'reduced motion: the wind sheet is a picture that stands still (' + (a1 && a1.lit) + ' lit pixels)');
      ok(errs.length === 0, 'reduced motion: the page threw nothing (' + errs.join(' | ') + ')');
      await ctx.close();
    }

    // nothing arrived: a fed sheet says so instead of drawing something
    {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.route('**/layers/api/live', async (route) => {
        const j = await (await fetch(BASE + '/layers/api/live')).json();
        j.map = { wind: [], sea: [], stations: [], air: [], weatherAt: null };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
      });
      await p.goto(BASE + '/stack.html?lang=el', { waitUntil: 'load', timeout: 60000 });
      for (let i = 0; i < 80; i++) { if (await p.evaluate(() => !!window.__embedReady && /πριν|μόλις/.test(document.querySelector('.rail').innerText)).catch(() => false)) break; await wait(250); }
      const kinds = await p.evaluate(() => ['wind', 'rain', 'cloud', 'air', 'waves', 'island'].map((id) => window.__sheetState(id)));
      ok(kinds.every((k) => k === 'none'), 'no data: every fed sheet reports that nothing arrived (' + kinds.join(', ') + ')');
      const s2 = await p.evaluate(() => window.__sheets());
      ok(!s2.wind && s2.rainCells === 0 && s2.specks === 0 && s2.beamsLive <= 4, 'no data: no wind lines, no rain and no specks are made up');
      await p.evaluate(() => document.querySelector('.row[data-id="wind"] .solo').click());
      await wait(400);
      const txt = await p.evaluate(() => document.getElementById('legend').innerText);
      ok(/ΧΩΡΙΣ ΖΩΝΤΑΝΑ ΔΕΔΟΜΕΝΑ/.test(txt) && /Δεν ήρθαν δεδομένα/.test(txt) && !/m\/s/.test(txt), 'no data: the key says so in Greek and shows no scale');
      ok(errs.length === 0, 'no data: the page threw nothing (' + errs.join(' | ') + ')');
      await ctx.close();
    }
  } catch (e) {
    fail++; console.log('FAIL: the run stopped: ' + (e && e.stack));
  } finally {
    await b.close(); srv.kill();
  }
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
